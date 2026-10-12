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

  it('страница экранирует то, что прислали клиенты', () => {
    const html = renderDashboard(computeStats(seed(), NOW, 7));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Telegram');
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
