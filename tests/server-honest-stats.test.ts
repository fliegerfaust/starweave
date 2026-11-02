import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { renderDashboard } from '../server/src/dashboard.ts';
import { insertBatch, openDb } from '../server/src/db.ts';
import { HallCache } from '../server/src/hall.ts';
import { computeStats } from '../server/src/stats.ts';
import { parseBatch, type Batch } from '../server/src/validate.ts';

/** Честная статистика (эпик SA): тестовый трафик, отказы, ошибки, обрывы, окно периода, воронка новичка. */

const DAY = 86400000;
const MSK = 3 * 3600000;
const NOW = Date.UTC(2026, 10, 2, 12, 0, 0);

type Ev = [string, Record<string, string | number | boolean>];
const put = (db: ReturnType<typeof openDb>, client: string, session: string, version: string, at: number, events: Ev[], extra: Partial<Batch> = {}) =>
  insertBatch(db, { client, session, platform: 'pikabu', version, lang: 'ru', events: events.map(([name, params], i) => ({ name, params, at: at + i * 1000 })), ...extra });

const raw = (over: Record<string, unknown>, events: unknown[]) =>
  JSON.stringify({ c: 'aaaaaaaa-1111', s: 'bbbbbbbb-2222', p: 'pikabu', v: '0.7.20', l: 'ru', n: NOW, e: events, ...over });

describe('приём: тестовые пачки и выкидывание плохого (SA.1, SA.8)', () => {
  it('t: 1 помечает пачку тестовой, без флага — обычная', () => {
    expect((parseBatch(raw({ t: 1 }, [['app_open', {}, NOW]]), NOW) as Batch).test).toBe(true);
    expect((parseBatch(raw({}, [['app_open', {}, NOW]]), NOW) as Batch).test).toBe(false);
  });

  it('плохое событие и плохой параметр выкидываются, пачка принимается', () => {
    const batch = parseBatch(
      raw({}, [
        ['app_open', {}, NOW],
        ['Bad Name', {}, NOW],
        // ratio = Infinity в JSON становится null
        ['night_end', { ante: 1, ratio: null, nested: { a: 1 }, won: true }, NOW],
      ]),
      NOW,
    ) as Batch;
    expect(batch.events.map((e) => e.name)).toEqual(['app_open', 'night_end']);
    expect(batch.events[1]!.params).toEqual({ ante: 1, won: true });
    expect(batch.dropped).toEqual(['event: bad event name', 'param: null', 'param: bad object']);
  });

  it('отказы видны в «Здоровье»', () => {
    const html = renderDashboard(computeStats(openDb(':memory:'), NOW, 7), { rejects: [['batch: bad json', 3], ['param: null', 2]], excluded: 1 });
    expect(html).toContain('batch: bad json');
    expect(html).toContain('Свои устройства (1)');
  });
});

describe('сводка считает только настоящих игроков (SA.1)', () => {
  it('тестовые пачки и свои устройства не входят ни в сводку, ни в доли Зала славы', () => {
    const db = openDb(':memory:', ['client-mine']);
    put(db, 'client-real', 's-real', '0.7.20', NOW - DAY, [['app_open', {}], ['hall_snap', { f: 1, bm: 1, ba: 1, w: 0, l: 1, e: 0, st: 0 }]]);
    put(db, 'client-mine', 's-mine', '0.7.20', NOW - DAY, [['app_open', {}], ['hall_snap', { f: 3, bm: 9, ba: 8, w: 1, l: 0, e: 1, st: 1 }]]);
    put(db, 'client-test', 's-test', '0.7.20', NOW - DAY, [['app_open', {}], ['hall_snap', { f: 3, bm: 9, ba: 8, w: 1, l: 0, e: 1, st: 1 }]], { test: true });
    const s = computeStats(db, NOW, 7);
    expect(s.totals.players).toBe(1);
    expect(s.totals.playersAll).toBe(1);
    const hall = JSON.parse(new HallCache(db).json(NOW)) as { players: number };
    expect(hall.players).toBe(1);
    // Сырые события тестов и своих устройств хранятся — для отладки
    expect((db.prepare('SELECT COUNT(DISTINCT client) AS n FROM events').get() as { n: number }).n).toBe(3);
  });

  it('старая база получает колонку test без потери событий', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sw-'));
    const path = join(dir, 'events.db');
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE events (id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, client TEXT NOT NULL, session TEXT NOT NULL, platform TEXT NOT NULL,
      version TEXT NOT NULL, lang TEXT NOT NULL, name TEXT NOT NULL, params TEXT NOT NULL)`);
    old.prepare('INSERT INTO events (ts, client, session, platform, version, lang, name, params) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(NOW - DAY, 'client-old', 's-old', 'web', '0.7.19', 'ru', 'app_open', '{}');
    old.close();
    const db = openDb(path);
    expect(computeStats(db, NOW, 7).totals.players).toBe(1);
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('ошибки — по последним версиям (SA.2)', () => {
  it('ошибка, которая была только в старых версиях, не тревожит', () => {
    const db = openDb(':memory:');
    for (const v of ['0.7.16', '0.7.17', '0.7.18', '0.7.19']) put(db, `client-v${v.slice(-2)}`, `s-${v}`, v, NOW - DAY, [['app_open', {}]]);
    put(db, 'client-v16', 's-err16', '0.7.16', NOW - DAY, [['js_error', { message: 'ResizeObserver loop' }]]);
    const s = computeStats(db, NOW, 7);
    expect(s.play.errorVersions).toEqual(['0.7.17', '0.7.18', '0.7.19']);
    expect(s.errors).toEqual([]);
    expect(s.play.oldErrors).toBe(1);
    expect(s.play.week.errors).toBe(0);
    expect(s.play.crashFree).toBe(100);
  });
});

describe('обрывы забега по устройству (SA.5)', () => {
  it('забег, продолженный в следующей сессии, не обрыв; новый забег без итога прошлого — обрыв', () => {
    const db = openDb(':memory:');
    // Начал, закрыл игру во 2-й главе, назавтра продолжил и выиграл
    put(db, 'client-cont', 's-c1', '0.7.20', NOW - 3 * DAY, [['run_start', {}], ['night_start', { ante: 2, night: 'midnight' }]]);
    put(db, 'client-cont', 's-c2', '0.7.20', NOW - 2 * DAY, [['night_start', { ante: 3, night: 'dusk' }], ['run_end', { result: 'victory', ante: 9, omens: '' }]]);
    // Начал забег, потом начал новый, не кончив прошлый; последний ещё идёт
    put(db, 'client-cut', 's-k1', '0.7.20', NOW - 3 * DAY, [['run_start', {}], ['night_start', { ante: 1, night: 'midnight' }]]);
    put(db, 'client-cut', 's-k2', '0.7.20', NOW - 2 * DAY, [['run_start', {}]]);
    const s = computeStats(db, NOW, 7);
    expect(s.play.runsStarted).toBe(3);
    expect(s.play.quits).toEqual([{ ante: 1, night: 'midnight', runs: 1 }]);
  });
});

describe('сессии: что игра шлёт сама, — не игра (SA.6)', () => {
  it('автособытия и показ первого шага обучения — «сразу закрыли»; длина по app_hide', () => {
    const db = openDb(':memory:');
    put(db, 'client-bnc', 's-bounce', '0.7.20', NOW - DAY, [
      ['app_open', {}],
      ['hall_snap', { f: 0, bm: 0, ba: 0, w: 0, l: 0, e: 0, st: 0 }],
      ['tutorial_start', { source: 'auto' }],
      ['tutorial_step', { step: 'shortRow', index: 0 }],
      ['perf', { fps: 60, dpr: 2, width: 400, height: 800 }],
      ['app_hide', { ms: 4000 }],
    ]);
    put(db, 'client-ply', 's-play', '0.7.20', NOW - DAY, [
      ['app_open', {}],
      ['tutorial_step', { step: 'shortRow', index: 0 }],
      ['tutorial_step', { step: 'shortBurn', index: 1 }],
      ['app_hide', { ms: 120000 }],
    ]);
    const s = computeStats(db, NOW, 7);
    expect(s.play.sessions).toMatchObject({ all: 2, bounce: 1, played: 1 });
    expect(s.play.sessions.medianMin).toBe(2);
  });
});

describe('одно окно периода (SA.7)', () => {
  it('«Сегодня» — с московской полуночи: вчерашний вечер не в счёт, новых не больше игроков', () => {
    const db = openDb(':memory:');
    const midnight = Math.floor((NOW + MSK) / DAY) * DAY - MSK;
    put(db, 'client-late', 's-late', '0.7.20', midnight - 3600000, [['app_open', {}]]);
    put(db, 'client-late', 's-late2', '0.7.20', midnight + 3600000, [['app_open', {}]]);
    put(db, 'client-morn', 's-morn', '0.7.20', midnight + 2 * 3600000, [['app_open', {}]]);
    const s = computeStats(db, NOW, 1);
    expect(s.totals.players).toBe(2);
    expect(s.totals.newPlayers).toBe(1);
    expect(s.totals.newPlayers).toBeLessThanOrEqual(s.totals.players);
  });
});

describe('воронка новичка с 0.7.20 (SA.4)', () => {
  it('шаги от обучения до 2-й главы, шаги обучения со временем, старые версии не входят', () => {
    const db = openDb(':memory:');
    put(db, 'client-nc', 's-nc', '0.7.20', NOW - DAY, [
      ['app_open', {}],
      ['tutorial_start', { source: 'auto' }],
      ['tutorial_step', { step: 'shortRow', index: 0 }],
      ['tutorial_step_done', { step: 'shortRow', index: 0, ms: 8000 }],
      ['tutorial_step', { step: 'shortBurn', index: 1 }],
      ['tutorial_complete', {}],
      ['run_start', { runs: 0 }],
      ['shop_buy', { kind: 'omen', id: 'stardust', price: 5, ante: 1, gold_left: 0, tutorial: true }],
      ['night_end', { ante: 1, night: 'dusk', won: true, runs: 0 }],
      ['shop_open', { ante: 1, gold: 9, runs: 0, guide: true }],
      ['shop_guide', { step: 'shopBuy', index: 1 }],
      ['shop_buy', { kind: 'omen', id: 'tripod', price: 7, ante: 1, gold_left: 2 }],
      ['shop_guide', { step: 'shopNext', index: 4 }],
      ['night_start', { ante: 2, night: 'dusk' }],
    ]);
    put(db, 'client-skip', 's-skip', '0.7.20', NOW - DAY, [['app_open', {}], ['tutorial_start', { source: 'auto' }], ['tutorial_skip', { step: 'shortRow', index: 0 }]]);
    // Старая версия: событий воронки ещё нет — в блок не входит
    put(db, 'client-old', 's-old', '0.7.19', NOW - DAY, [['app_open', {}], ['tutorial_start', { source: 'auto' }]]);
    const s = computeStats(db, NOW, 7);
    expect(s.play.newcomers).toEqual([{ platform: 'pikabu', steps: [2, 2, 1, 1, 1, 1, 1, 1, 1, 1], d1: 0, d1Base: 2 }]);
    expect(s.play.tutorialSteps[0]).toEqual({ step: 'shortRow', shown: 1, done: 1, medianSec: 8 });
    const html = renderDashboard(s);
    expect(html).toContain('Воронка новичка');
    expect(html).toContain('Купили Знамение в первый заход');
  });
});

describe('реклама и коллекция без странных процентов (SA.9)', () => {
  it('заставка Пикабу подписана как заставка, «нет ролика» видно; «взяли» не больше 100%', () => {
    const db = openDb(':memory:');
    const ad = (kind: string, result: string): Ev[] => [
      ['ad_request', { kind, placement: 'start' }],
      ['ad_result', { kind, placement: 'start', result }],
    ];
    put(db, 'client-ads', 's-ads', '0.7.20', NOW - DAY, [...ad('preloader', 'nofill'), ...ad('preloader', 'nofill'), ...ad('interstitial', 'shown')]);
    put(db, 'client-col', 's-col', '0.7.20', NOW - DAY, [['app_open', {}], ['collection_open', { focus: '' }], ['collection_open', { focus: '' }]]);
    const s = computeStats(db, NOW, 7);
    const pre = s.ads.find((a) => a.kind === 'preloader')!;
    expect(pre).toMatchObject({ requests: 2, shown: 0, nofill: 2 });
    expect(s.ads.find((a) => a.kind === 'interstitial')).toMatchObject({ shown: 1 });
    const html = renderDashboard(s);
    expect(html).toContain('заставка при запуске');
    // Коллекцию открыли без крючка: «взяли» 1 при «встретили» 0 — это 100%, а не деление на ноль
    expect(html).toMatch(/Коллекция<\/b>[^]*?<b>1<\/b> <span class="faint">100%<\/span>/);
  });
});
