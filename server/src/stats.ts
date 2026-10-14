import type { Db } from './db.ts';

/**
 * Сводка по событиям за период — всё, что нужно, чтобы понять, как играют:
 * сколько игроков и откуда, возвращаются ли, где бросают обучение, на каких ночах
 * умирают, что покупают, какие ошибки ловят. Дни считаются по Москве.
 */

const DAY = 24 * 60 * 60 * 1000;
const MSK = 3 * 60 * 60 * 1000;
/** Номер московского дня в SQL: целочисленное деление сдвинутого времени. */
const DAY_SQL = `((ts + ${MSK}) / ${DAY})`;

export interface Stats {
  periodDays: number;
  generatedAt: number;
  totals: {
    playersAll: number;
    players: number;
    newPlayers: number;
    sessions: number;
    medianSessionMin: number | null;
    events: number;
  };
  daily: { day: number; players: number; newPlayers: number; sessions: number }[];
  platforms: { platform: string; players: number; sessions: number }[];
  retention: { d1Base: number; d1: number; weekBase: number; week: number };
  tutorial: { started: number; completed: number; skipped: number; steps: { index: number; step: string; players: number }[] };
  runs: { started: number; ended: number; victories: number; byResult: { result: string; count: number }[]; reach: { ante: number; runs: number }[] };
  /** movesLeft — сколько ходов в среднем оставалось у победивших: мера запаса, а не перебора. */
  nights: { ante: number; night: string; played: number; lost: number; movesLeft: number | null }[];
  /** Покупки: итог по видам и самое популярное внутри каждого вида. */
  shop: { byKind: { kind: string; count: number; players: number }[]; top: { kind: string; id: string; count: number; players: number }[] };
  /** Первые минуты новичков (впервые пришли в этот период): сколько игроков дошли до шага. */
  funnel: { step: string; players: number }[];
  /** Рост: вызовы друзьям и метки источников (app_open.source). */
  growth: {
    shared: number;
    sharers: number;
    opened: number;
    openedFresh: number;
    accepted: number;
    results: { beat: number; tie: number; behind: number };
    sources: { source: string; players: number; fresh: number }[];
  };
  help: { guide: number; scoring: number; banish: number; rerolls: number };
  ads: { kind: string; placement: string; requests: number; rewarded: number }[];
  errors: { message: string; where: string; count: number; last: number }[];
  perf: { platform: string; medianFps: number; samples: number }[];
  versions: { version: string; players: number }[];
}

type Row = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : Number(v ?? 0));

export function computeStats(db: Db, now: number, periodDays: number): Stats {
  const from = now - periodDays * DAY;
  const all = <T = Row>(sql: string, ...args: (string | number)[]) => db.prepare(sql).all(...args) as T[];
  const one = (sql: string, ...args: (string | number)[]) => (db.prepare(sql).get(...args) ?? {}) as Row;

  // Первый день каждого игрока — основа для «новых» и удержания
  const firstSeen = `SELECT client, MIN(${DAY_SQL}) AS first_day FROM events GROUP BY client`;
  const today = Math.floor((now + MSK) / DAY);
  const fromDay = Math.floor((from + MSK) / DAY);

  const totals = {
    playersAll: num(one('SELECT COUNT(DISTINCT client) AS n FROM events').n),
    players: num(one('SELECT COUNT(DISTINCT client) AS n FROM events WHERE ts >= ?', from).n),
    newPlayers: num(one(`SELECT COUNT(*) AS n FROM (${firstSeen}) WHERE first_day >= ?`, fromDay).n),
    sessions: num(one('SELECT COUNT(DISTINCT session) AS n FROM events WHERE ts >= ?', from).n),
    medianSessionMin: median(all('SELECT (MAX(ts) - MIN(ts)) / 60000.0 AS m FROM events WHERE ts >= ? GROUP BY session', from).map((r) => num(r.m))),
    events: num(one('SELECT COUNT(*) AS n FROM events WHERE ts >= ?', from).n),
  };

  const activeByDay = new Map(
    all(`SELECT ${DAY_SQL} AS day, COUNT(DISTINCT client) AS players, COUNT(DISTINCT session) AS sessions FROM events WHERE ts >= ? GROUP BY day`, from).map((r) => [
      num(r.day),
      { players: num(r.players), sessions: num(r.sessions) },
    ]),
  );
  const newByDay = new Map(all(`SELECT first_day AS day, COUNT(*) AS n FROM (${firstSeen}) WHERE first_day >= ? GROUP BY first_day`, fromDay).map((r) => [num(r.day), num(r.n)]));
  const daily: Stats['daily'] = [];
  for (let d = fromDay; d <= today; d++) {
    const a = activeByDay.get(d);
    daily.push({ day: d, players: a?.players ?? 0, newPlayers: newByDay.get(d) ?? 0, sessions: a?.sessions ?? 0 });
  }

  const platforms = all('SELECT platform, COUNT(DISTINCT client) AS players, COUNT(DISTINCT session) AS sessions FROM events WHERE ts >= ? GROUP BY platform ORDER BY players DESC', from).map((r) => ({
    platform: String(r.platform),
    players: num(r.players),
    sessions: num(r.sessions),
  }));

  // Удержание по всем игрокам, у которых нужный срок уже прошёл:
  // D1 — зашли на следующий день после первого; «неделя» — зашли хоть раз в дни 1–7.
  const ret = one(
    `WITH f AS (${firstSeen}),
     d AS (SELECT DISTINCT client, ${DAY_SQL} AS day FROM events)
     SELECT
       (SELECT COUNT(*) FROM f WHERE first_day <= ?) AS d1_base,
       (SELECT COUNT(*) FROM f WHERE first_day <= ? AND EXISTS (SELECT 1 FROM d WHERE d.client = f.client AND d.day = f.first_day + 1)) AS d1,
       (SELECT COUNT(*) FROM f WHERE first_day <= ?) AS week_base,
       (SELECT COUNT(*) FROM f WHERE first_day <= ? AND EXISTS (SELECT 1 FROM d WHERE d.client = f.client AND d.day BETWEEN f.first_day + 1 AND f.first_day + 7)) AS week`,
    today - 1,
    today - 1,
    today - 7,
    today - 7,
  );
  const retention = { d1Base: num(ret.d1_base), d1: num(ret.d1), weekBase: num(ret.week_base), week: num(ret.week) };

  const count = (name: string) => num(one('SELECT COUNT(*) AS n FROM events WHERE name = ? AND ts >= ?', name, from).n);
  const players = (name: string) => num(one('SELECT COUNT(DISTINCT client) AS n FROM events WHERE name = ? AND ts >= ?', name, from).n);

  const tutorial = {
    started: players('tutorial_start'),
    completed: players('tutorial_complete'),
    skipped: players('tutorial_skip'),
    steps: all(
      `SELECT CAST(json_extract(params, '$.index') AS INTEGER) AS idx, json_extract(params, '$.step') AS step, COUNT(DISTINCT client) AS players
       FROM events WHERE name = 'tutorial_step' AND ts >= ? GROUP BY idx ORDER BY idx`,
      from,
    ).map((r) => ({ index: num(r.idx), step: String(r.step ?? ''), players: num(r.players) })),
  };

  const runs = {
    started: count('run_start'),
    ended: count('run_end'),
    victories: num(one(`SELECT COUNT(*) AS n FROM events WHERE name = 'run_end' AND json_extract(params, '$.result') = 'victory' AND ts >= ?`, from).n),
    byResult: all(`SELECT json_extract(params, '$.result') AS result, COUNT(*) AS n FROM events WHERE name = 'run_end' AND ts >= ? GROUP BY result ORDER BY n DESC`, from).map((r) => ({
      result: String(r.result),
      count: num(r.n),
    })),
    reach: all(`SELECT CAST(json_extract(params, '$.ante') AS INTEGER) AS ante, COUNT(*) AS n FROM events WHERE name = 'run_end' AND ts >= ? GROUP BY ante ORDER BY ante`, from).map((r) => ({
      ante: num(r.ante),
      runs: num(r.n),
    })),
  };

  const nights = all(
    `SELECT CAST(json_extract(params, '$.ante') AS INTEGER) AS ante, json_extract(params, '$.night') AS night,
            COUNT(*) AS played,
            SUM(CASE WHEN json_extract(params, '$.won') THEN 0 ELSE 1 END) AS lost,
            AVG(CASE WHEN json_extract(params, '$.won') THEN json_extract(params, '$.moves_left') END) AS moves
     FROM events WHERE name = 'night_end' AND ts >= ? GROUP BY ante, night
     ORDER BY ante, CASE night WHEN 'dusk' THEN 0 WHEN 'midnight' THEN 1 ELSE 2 END`,
    from,
  ).map((r) => ({ ante: num(r.ante), night: String(r.night), played: num(r.played), lost: num(r.lost), movesLeft: r.moves === null ? null : num(r.moves) }));

  // Псевдоним не «id»: у таблицы своя колонка id, и SQLite группировал бы по ней — каждая
  // покупка становилась отдельной строкой (дубли и случайный срез в сводке до 14.10.2026)
  const shopRows = all(
    `SELECT json_extract(params, '$.kind') AS kind, json_extract(params, '$.id') AS item, COUNT(*) AS n, COUNT(DISTINCT client) AS players
     FROM events WHERE name = 'shop_buy' AND ts >= ? GROUP BY kind, item ORDER BY n DESC, players DESC`,
    from,
  ).map((r) => ({ kind: String(r.kind), id: String(r.item), count: num(r.n), players: num(r.players) }));
  const byKind = all(
    `SELECT json_extract(params, '$.kind') AS kind, COUNT(*) AS n, COUNT(DISTINCT client) AS players
     FROM events WHERE name = 'shop_buy' AND ts >= ? GROUP BY kind ORDER BY n DESC`,
    from,
  ).map((r) => ({ kind: String(r.kind), count: num(r.n), players: num(r.players) }));
  const perKind = new Map<string, number>();
  const shop = {
    byKind,
    top: shopRows.filter((x) => {
      const seen = perKind.get(x.kind) ?? 0;
      perKind.set(x.kind, seen + 1);
      return seen < 6;
    }),
  };

  // Воронка новичков: только те, кто впервые пришёл в этот период
  const fresh = `client IN (SELECT client FROM (${firstSeen}) WHERE first_day >= ${fromDay})`;
  const reached = (where: string) => num(one(`SELECT COUNT(DISTINCT client) AS n FROM events WHERE ${fresh} AND (${where})`).n);
  const funnel = [
    { step: 'Открыли', players: reached(`name = 'app_open'`) },
    { step: 'Начали обучение', players: reached(`name = 'tutorial_start'`) },
    { step: 'Закончили обучение', players: reached(`name IN ('tutorial_complete', 'tutorial_skip')`) },
    { step: 'Начали забег', players: reached(`name = 'run_start'`) },
    { step: 'Прошли 1-ю ночь', players: reached(`name = 'night_end' AND json_extract(params, '$.won')`) },
    { step: 'Дошли до 2-й главы', players: reached(`name = 'night_start' AND json_extract(params, '$.ante') >= 2`) },
  ];

  const outcome = (o: number) => num(one(`SELECT COUNT(*) AS n FROM events WHERE name = 'challenge_result' AND json_extract(params, '$.outcome') = ? AND ts >= ?`, o, from).n);
  const growth = {
    shared: count('challenge_share'),
    sharers: players('challenge_share'),
    opened: players('challenge_open'),
    openedFresh: num(one(`SELECT COUNT(DISTINCT client) AS n FROM events WHERE name = 'challenge_open' AND json_extract(params, '$.fresh') AND ts >= ?`, from).n),
    accepted: players('challenge_accept'),
    results: { beat: outcome(1), tie: outcome(0), behind: outcome(-1) },
    sources: all(
      `SELECT json_extract(params, '$.source') AS source, COUNT(DISTINCT client) AS players,
              COUNT(DISTINCT CASE WHEN ${fresh} THEN client END) AS fresh
       FROM events WHERE name = 'app_open' AND json_extract(params, '$.source') IS NOT NULL AND ts >= ?
       GROUP BY source ORDER BY players DESC LIMIT 12`,
      from,
    ).map((r) => ({ source: String(r.source), players: num(r.players), fresh: num(r.fresh) })),
  };

  const help = { guide: count('guide_open'), scoring: count('scoring_help_open'), banish: count('shop_banish'), rerolls: count('shop_reroll') };

  const ads = all(
    `SELECT json_extract(params, '$.kind') AS kind, json_extract(params, '$.placement') AS placement,
            SUM(CASE WHEN name = 'ad_request' THEN 1 ELSE 0 END) AS requests,
            SUM(CASE WHEN name = 'ad_result' AND json_extract(params, '$.result') = 'rewarded' THEN 1 ELSE 0 END) AS rewarded
     FROM events WHERE name IN ('ad_request', 'ad_result') AND ts >= ? GROUP BY kind, placement ORDER BY requests DESC`,
    from,
  ).map((r) => ({ kind: String(r.kind), placement: String(r.placement), requests: num(r.requests), rewarded: num(r.rewarded) }));

  const errors = all(
    `SELECT json_extract(params, '$.message') AS message, MAX(json_extract(params, '$.where')) AS place, COUNT(*) AS n, MAX(ts) AS last
     FROM events WHERE name = 'js_error' AND ts >= ? GROUP BY message ORDER BY n DESC LIMIT 10`,
    from,
  ).map((r) => ({ message: String(r.message), where: r.place ? String(r.place) : '', count: num(r.n), last: num(r.last) }));

  const fpsRows = all(`SELECT platform, json_extract(params, '$.fps') AS fps FROM events WHERE name = 'perf' AND ts >= ?`, from);
  const fpsBy = new Map<string, number[]>();
  for (const r of fpsRows) {
    const list = fpsBy.get(String(r.platform)) ?? [];
    list.push(num(r.fps));
    fpsBy.set(String(r.platform), list);
  }
  const perf = [...fpsBy].map(([platform, list]) => ({ platform, medianFps: Math.round(median(list) ?? 0), samples: list.length }));

  const versions = all('SELECT version, COUNT(DISTINCT client) AS players FROM events WHERE ts >= ? GROUP BY version ORDER BY players DESC LIMIT 6', from).map((r) => ({
    version: String(r.version),
    players: num(r.players),
  }));

  return { periodDays, generatedAt: now, totals, daily, platforms, retention, tutorial, runs, nights, shop, funnel, growth, help, ads, errors, perf, versions };
}

function median(list: number[]): number | null {
  if (list.length === 0) return null;
  const s = [...list].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Московский день → «12 окт». */
export function dayLabel(day: number): string {
  const d = new Date(day * DAY);
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}
