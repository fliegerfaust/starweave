import { describe, expect, it } from 'vitest';
import { renderDashboard } from '../server/src/dashboard.ts';
import { insertBatch, openDb, purgeOld } from '../server/src/db.ts';
import { computeStats } from '../server/src/stats.ts';
import { LIMITS, parseBatch, type Batch } from '../server/src/validate.ts';

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);
const client = '11111111-2222-3333-4444-555555555555';

const body = (over: Record<string, unknown> = {}, events: unknown[] = [['app_open', { platform: 'web', lang: 'ru', returning: false }, NOW]]) =>
  JSON.stringify({ c: client, s: 'aaaaaaaa-bbbb', p: 'web', v: '0.3.10', l: 'ru', n: NOW, e: events, ...over });

describe('сервер: приём событий', () => {
  it('принимает правильную пачку и датирует по часам сервера', () => {
    const batch = parseBatch(body({ n: NOW + 5 * DAY }, [['app_open', { platform: 'web', lang: 'ru', returning: false }, NOW + 5 * DAY - 60_000]]), NOW);
    expect(typeof batch).toBe('object');
    // Часы телефона убежали на 5 дней — событие всё равно «минуту назад» по серверу
    expect((batch as Batch).events[0]!.at).toBe(NOW - 60_000);
  });

  it('принимает пачки всех площадок, включая Пикабу Игры', () => {
    for (const p of ['web', 'yandex', 'telegram', 'crazygames', 'pikabu']) expect(typeof parseBatch(body({ p }), NOW)).toBe('object');
  });

  it('отклоняет мусор и лишнее', () => {
    expect(parseBatch('not json', NOW)).toBe('bad json');
    expect(parseBatch(body({ c: 'x' }), NOW)).toBe('bad client');
    expect(parseBatch(body({ p: 'evil' }), NOW)).toBe('bad platform');
    expect(parseBatch(body({}, [['Bad Name', {}, NOW]]), NOW)).toBe('bad event name');
    expect(parseBatch(body({}, [['x_y', { nested: { a: 1 } }, NOW]]), NOW)).toBe('bad param value');
    expect(parseBatch(body({}, Array.from({ length: LIMITS.events + 1 }, () => ['app_open', {}, NOW])), NOW)).toBe('too many events');
    expect(parseBatch('x'.repeat(LIMITS.body + 1), NOW)).toBe('body too large');
  });

  it('обрезает длинные строки', () => {
    const batch = parseBatch(body({}, [['js_error', { message: 'y'.repeat(1000) }, NOW]]), NOW) as Batch;
    expect((batch.events[0]!.params.message as string).length).toBe(LIMITS.string);
  });

  it('стек ошибки длиннее обычной строки, но тоже с пределом', () => {
    const batch = parseBatch(body({}, [['js_error', { message: 'x', stack: 's'.repeat(5000) }, NOW]]), NOW) as Batch;
    expect((batch.events[0]!.params.stack as string).length).toBe(LIMITS.stack);
  });
});

function seed(): ReturnType<typeof openDb> {
  const db = openDb(':memory:');
  const put = (c: string, platform: string, at: number, events: [string, Record<string, string | number | boolean>][]) =>
    insertBatch(db, { client: c, session: `${c}-${at}`, platform, version: '0.3.10', lang: 'ru', events: events.map(([name, params]) => ({ name, params, at })) });
  // Игрок A: пришёл 3 дня назад, вернулся на следующий день
  put('client-aaaa', 'telegram', NOW - 3 * DAY, [['app_open', {}], ['tutorial_start', {}], ['tutorial_step', { step: 'board', index: 0 }], ['tutorial_complete', {}]]);
  put('client-aaaa', 'telegram', NOW - 2 * DAY, [['night_end', { ante: 1, night: 'dusk', won: true, moves_left: 6 }]]);
  // Игрок B: пришёл вчера, проиграл первую ночь
  put('client-bbbb', 'web', NOW - DAY, [['tutorial_start', {}], ['night_end', { ante: 1, night: 'dusk', won: false, moves_left: 0 }], ['js_error', { message: '<script>alert(1)</script>' }]]);
  return db;
}

describe('сервер: сводка', () => {
  it('считает игроков, площадки, удержание и ночи', () => {
    const s = computeStats(seed(), NOW, 7);
    expect(s.totals.players).toBe(2);
    expect(s.totals.newPlayers).toBe(2);
    expect(s.platforms.map((p) => p.platform).sort()).toEqual(['telegram', 'web']);
    expect(s.retention).toMatchObject({ d1Base: 2, d1: 1 });
    expect(s.tutorial).toMatchObject({ started: 2, completed: 1 });
    expect(s.nights).toEqual([{ ante: 1, night: 'dusk', played: 2, lost: 1, movesLeft: 6 }]);
  });

  it('покупки считаются по предмету, а не по событию', () => {
    const db = openDb(':memory:');
    const buy = (c: string, kind: string, id: string) =>
      insertBatch(db, { client: c, session: `${c}-s`, platform: 'telegram', version: '1', lang: 'ru', events: [{ name: 'shop_buy', params: { kind, id, price: 5, ante: 1, gold_left: 0 }, at: NOW - DAY }] });
    buy('client-aaaa', 'omen', 'pillar');
    buy('client-bbbb', 'omen', 'pillar');
    buy('client-bbbb', 'omen', 'stardust');
    buy('client-aaaa', 'chart', 'cascade');
    const s = computeStats(db, NOW, 7);
    expect(s.shop.byKind).toEqual([
      { kind: 'omen', count: 3, players: 2 },
      { kind: 'chart', count: 1, players: 1 },
    ]);
    expect(s.shop.top[0]).toEqual({ kind: 'omen', id: 'pillar', count: 2, players: 2 });
  });

  it('реклама: ложные межстраничные до 0.4.10 не считаются, AdsGram в Telegram считается', () => {
    const db = openDb(':memory:');
    const ad = (platform: string, kind: string, version: string) =>
      insertBatch(db, { client: `client-${platform}`, session: `s-${platform}-${kind}-${version}`, platform, version, lang: 'ru', events: [{ name: 'ad_request', params: { kind, placement: kind === 'interstitial' ? 'between_antes' : 'revive' }, at: NOW - DAY }] });
    ad('telegram', 'interstitial', '0.4.9');
    ad('web', 'interstitial', '0.4.9');
    ad('yandex', 'interstitial', '0.4.9');
    ad('yandex', 'rewarded', '0.4.9');
    ad('telegram', 'interstitial', '0.5.9');
    const s = computeStats(db, NOW, 7);
    expect(s.ads.map((a) => `${a.platform}:${a.kind}:${a.requests}`).sort()).toEqual(['telegram:interstitial:1', 'yandex:interstitial:1', 'yandex:rewarded:1']);
    expect(renderDashboard(s)).toContain('межстраничная, между главами');
  });

  it('сессия: активное время без фона, мгновенные выходы отдельно, без обрезки границей', () => {
    const db = openDb(':memory:');
    const put = (session: string, times: number[], name = 'night_start') =>
      insertBatch(db, { client: 'client-sess', session, platform: 'telegram', version: '0.7.10', lang: 'ru', events: times.map((at) => ({ name, params: {}, at })) });
    const t0 = NOW - DAY;
    const min = 60_000;
    // 3 минуты игры, 2 часа в фоне, ещё 1 минута — сессия длиной 4 минуты, а не 124
    put('s-long', [t0, t0 + 3 * min, t0 + 123 * min, t0 + 124 * min]);
    put('s-mid', [t0, t0 + 30_000, t0 + 90_000]);
    put('s-bounce', [t0], 'app_open');
    // Запуск и автоматический замер FPS — тоже «открыли и закрыли»
    put('s-idle', [t0, t0 + 5000], 'perf');
    // Начата до периода — в длину не входит
    put('s-edge', [NOW - 8 * DAY, NOW - 7 * DAY + 1000]);
    const s = computeStats(db, NOW, 7);
    expect(s.totals.bounceSessions).toBe(2);
    expect(s.totals.medianSessionMin).toBeCloseTo((4 + 1.5) / 2);
    const html = renderDashboard(s);
    expect(html).toContain('2,8 мин');
    expect(html).toContain('Ещё 2 сессий из 4 (50%) открыли и сразу закрыли');
  });

  it('обучение: короткое и полное не складываются по номеру шага', () => {
    const db = openDb(':memory:');
    const step = (c: string, steps: [string, number][]) =>
      insertBatch(db, { client: c, session: `${c}-s`, platform: 'pikabu', version: '0.7.10', lang: 'ru', events: steps.map(([st, index], i) => ({ name: 'tutorial_step', params: { step: st, index }, at: NOW - DAY + i })) });
    step('client-old1', [['board', 1], ['hand', 2], ['place1', 3], ['place2', 4], ['place3', 5]]);
    step('client-new1', [['shortRow', 1], ['shortBurn', 5], ['shortCross', 6]]);
    step('client-new2', [['shortRow', 1]]);
    insertBatch(db, { client: 'client-new1', session: 'client-new1-s', platform: 'pikabu', version: '0.7.10', lang: 'ru', events: [{ name: 'tutorial_start', params: { source: 'auto' }, at: NOW - DAY - 1 }] });
    const s = computeStats(db, NOW, 7);
    expect(s.tutorial.track).toBe('short');
    expect(s.tutorial.steps).toEqual([
      { index: 1, step: 'shortRow', players: 2 },
      { index: 2, step: 'shortBurn', players: 1 },
      { index: 3, step: 'shortCross', players: 1 },
    ]);
    const html = renderDashboard(s);
    expect(html).toContain('Короткое обучение');
    expect(html).toContain('Пикабу Игры');
  });

  it('воронка новичков и рост', () => {
    const db = openDb(':memory:');
    const put = (c: string, at: number, events: [string, Record<string, string | number | boolean>][]) =>
      insertBatch(db, { client: c, session: `${c}-${at}`, platform: 'telegram', version: '1', lang: 'ru', events: events.map(([name, params]) => ({ name, params, at })) });
    put('client-aaaa', NOW - DAY, [['app_open', { source: 'tgads' }], ['tutorial_start', {}], ['tutorial_skip', {}], ['run_start', {}], ['night_end', { won: true }], ['night_start', { ante: 2 }], ['challenge_share', { ante: 3, best: 400, won: false }]]);
    put('client-bbbb', NOW - DAY, [['app_open', { challenge: true }], ['challenge_open', { ante: 3, best: 400, fresh: true }], ['challenge_accept', {}], ['run_start', {}], ['challenge_result', { outcome: 1 }]]);
    // Старый игрок не попадает в воронку новичков периода
    put('client-cccc', NOW - 20 * DAY, [['app_open', {}]]);
    put('client-cccc', NOW - DAY, [['app_open', {}], ['run_start', {}]]);
    const s = computeStats(db, NOW, 7);
    expect(s.funnel.map((x) => x.players)).toEqual([2, 1, 1, 2, 1, 1]);
    expect(s.growth).toMatchObject({ shared: 1, sharers: 1, opened: 1, openedFresh: 1, accepted: 1, results: { beat: 1, tie: 0, behind: 0 } });
    expect(s.growth.sources).toEqual([{ source: 'tgads', players: 1, fresh: 1 }]);
    const html = renderDashboard(s);
    expect(html).toContain('Первые минуты');
    expect(html).toContain('tgads');
  });

  it('страница экранирует то, что прислали клиенты', () => {
    const db = seed();
    insertBatch(db, { client: 'client-bbbb', session: 's-xss', platform: 'web', version: '0.7.10', lang: 'ru', events: [{ name: 'js_error', params: { message: '<script>alert(1)</script>' }, at: NOW - DAY }] });
    const html = renderDashboard(computeStats(db, NOW, 7));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Telegram');
  });

  it('ошибки: свежий стек, версии по порядку, стек экранирован и расшифровывается скриптом', () => {
    const db = openDb(':memory:');
    const put = (version: string, at: number, params: Record<string, string>) =>
      insertBatch(db, { client: 'client-err1', session: `s-${version}-${at}`, platform: 'web', version, lang: 'ru', events: [{ name: 'js_error', params, at }] });
    put('0.5.9', NOW - 3 * DAY, { message: 'boom', where: '/a.js:1:1', stack: 'old@/a.js:1:1' });
    put('0.5.13', NOW - DAY, { message: 'boom', where: '/a.js:1:1', stack: 'req@/a.js:2:5\n<img src=x>@/a.js:3:1' });
    put('0.5.13', NOW - DAY + 1000, { message: 'boom', where: '/a.js:1:1' });
    const s = computeStats(db, NOW, 7);
    expect(s.errors).toEqual([
      { message: 'boom', where: '/a.js:1:1', count: 3, last: NOW - DAY + 1000, stack: 'req@/a.js:2:5\n<img src=x>@/a.js:3:1', versions: ['0.5.9', '0.5.13'] },
    ]);
    const html = renderDashboard(s, { site: 'https://game.example' });
    expect(html).toContain('<pre data-stack>req@/a.js:2:5\n&lt;img src=x&gt;@/a.js:3:1</pre>');
    expect(html).toContain('data-site="https://game.example"');
    expect(html).toContain('<script>');
    // Без стеков скрипт не нужен
    expect(renderDashboard(computeStats(seed(), NOW, 7))).not.toContain('<script>');
  });

  it('приборы: фичи, обрыв забега, возвраты, старые ошибки, «На что смотреть»', () => {
    const db = openDb(':memory:');
    const put = (c: string, session: string, version: string, at: number, events: [string, Record<string, string | number | boolean>][]) =>
      insertBatch(db, { client: c, session, platform: 'pikabu', version, lang: 'ru', events: events.map(([name, params], i) => ({ name, params, at: at + i * 1000 })) });
    // Взял Дар ночи, закрыл игру во 2-й главе (Полночь) — забег оборван
    put('client-gift', 's-gift', '0.7.10', NOW - 3 * DAY, [['app_open', {}], ['run_start', { gift: true }], ['gift_take', { kind: 'glyph', id: 'x', ante: 1, deck: 20 }], ['night_start', { ante: 2, night: 'midnight' }]]);
    // Вернулся на следующий день, сдался в 1-й главе
    put('client-gift', 's-gift2', '0.7.10', NOW - 2 * DAY, [['run_start', {}], ['run_end', { result: 'abandon', ante: 1, omens: '' }]]);
    // Ошибка старой версии в список не попадает, но считается
    put('client-old2', 's-old', '0.4.11', NOW - DAY, [['js_error', { message: 'old boom' }]]);
    const s = computeStats(db, NOW, 7);
    const gift = s.play.features.find((f) => f.name === 'Дар ночи')!;
    expect(gift).toMatchObject({ available: 1, met: 1, used: 1 });
    expect(s.play.features.find((f) => f.name === 'Развилки')).toMatchObject({ need: 'route_pick' });
    expect(s.play.runsStarted).toBe(2);
    expect(s.play.quits).toEqual(expect.arrayContaining([{ ante: 2, night: 'midnight', runs: 1 }, { ante: 1, night: 'dusk', runs: 1 }]));
    expect(s.play.cohorts.reduce((a, c) => a + c.players, 0)).toBe(2);
    expect(s.play.platformFunnel[0]).toMatchObject({ platform: 'pikabu', d1: 1, d1Base: 2 });
    expect(s.errors).toEqual([]);
    expect(s.play.oldErrors).toBe(1);
    const html = renderDashboard(s);
    expect(html).toContain('Ничего тревожного');
    expect(html).toContain('нужно событие <code>route_pick</code>');
    // Шрифты вшиты: страница не ходит наружу
    expect(html).toContain('data:font/woff2;base64,');
    expect(html).not.toContain('googleapis');
  });

  it('пустая база не ломает страницу', () => {
    const html = renderDashboard(computeStats(openDb(':memory:'), NOW, 7));
    expect(html).toContain('Пока нет данных');
  });

  it('старые события удаляются', () => {
    const db = openDb(':memory:');
    insertBatch(db, { client: 'client-old1', session: 'session-old1', platform: 'web', version: '1', lang: 'ru', events: [{ name: 'app_open', params: {}, at: NOW - 500 * DAY }] });
    expect(purgeOld(db, NOW)).toBe(1);
  });
});
