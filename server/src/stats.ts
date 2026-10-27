import type { Db } from './db.ts';
import { cmpVersion, computePlay, ERRORS_SINCE, median, type Play } from './play-stats.ts';

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
    /** Открыли и сразу закрыли: кроме запуска и замера FPS (он сам через 5 с) событий нет. В длину сессий не входят. */
    bounceSessions: number;
    /** Медиана активного времени сессии (паузы дольше 5 минут не в счёт), только сессии, начатые в периоде. */
    medianSessionMin: number | null;
    events: number;
  };
  daily: { day: number; players: number; newPlayers: number; sessions: number }[];
  platforms: { platform: string; players: number; sessions: number }[];
  retention: { d1Base: number; d1: number; weekBase: number; week: number };
  /** steps — шаги текущего обучения (track): короткое и полное не смешиваются. */
  tutorial: {
    started: number;
    completed: number;
    skipped: number;
    track: 'short' | 'full';
    steps: { index: number; step: string; players: number }[];
    /** Игроки текущего обучения (track): сколько начали, закончили, пропустили. */
    trackPlayers: number;
    trackDone: number;
    trackSkipped: number;
    /** Другое обучение тех же дней — отдельной строкой, не в таблицу шагов. */
    otherPlayers: number;
    otherDone: number;
  };
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
  help: { guide: number; banish: number; rerolls: number };
  ads: { platform: string; kind: string; placement: string; requests: number; rewarded: number }[];
  /** stack — самый свежий из присланных стеков; versions — в каких версиях игры встречалась. */
  errors: { message: string; where: string; count: number; last: number; stack: string; versions: string[] }[];
  perf: { platform: string; medianFps: number; samples: number }[];
  versions: { version: string; players: number }[];
  play: Play;
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
    bounceSessions: 0,
    medianSessionMin: null as number | null,
    events: num(one('SELECT COUNT(*) AS n FROM events WHERE ts >= ?', from).n),
  };

  const play = computePlay(db, now, from);
  totals.bounceSessions = play.sessions.bounce;
  totals.medianSessionMin = play.sessions.medianMin;

  const activeByDay = new Map(
    all(`SELECT ${DAY_SQL} AS day, COUNT(DISTINCT client) AS players, COUNT(DISTINCT session) AS sessions FROM events WHERE ts >= ? GROUP BY day`, from).map((r) => [
      num(r.day),
      { players: num(r.players), sessions: num(r.sessions) },
    ]),
  );
  const newByDay = new Map(all(`SELECT first_day AS day, COUNT(*) AS n FROM (${firstSeen}) WHERE first_day >= ? GROUP BY first_day`, fromDay).map((r) => [num(r.day), num(r.n)]));
  // Дни до первого события в базе не показываем: иначе за 90 дней график наполовину пуст
  const firstDay = num(one(`SELECT MIN(${DAY_SQL}) AS d FROM events`).d);
  const daily: Stats['daily'] = [];
  for (let d = Math.max(fromDay, firstDay || fromDay); d <= today; d++) {
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

  // Короткое обучение (CQ.4) отмечает не все шаги, и номера у него с пропусками: складывать
  // его с полным по номеру шага нельзя. Игрок короткого — тот, у кого есть шаг «short…».
  const shortClients = `client IN (SELECT client FROM events WHERE name = 'tutorial_step' AND json_extract(params, '$.step') LIKE 'short%' AND ts >= ${from})`;
  const track: Stats['tutorial']['track'] = num(one(`SELECT COUNT(*) AS n FROM events WHERE name = 'tutorial_step' AND ${shortClients}`).n) > 0 ? 'short' : 'full';
  /** not = '' — игроки текущего обучения, 'NOT ' — другого. */
  const trackCounts = (not: string) => {
    const mine = `${track === 'short' ? not : not ? '' : 'NOT '}${shortClients}`;
    const n = (name: string) => num(one(`SELECT COUNT(DISTINCT client) AS n FROM events WHERE name = ? AND ts >= ? AND ${mine}`, name, from).n);
    return { trackPlayers: n('tutorial_step'), trackDone: n('tutorial_complete'), trackSkipped: n('tutorial_skip') };
  };
  const tutorial = {
    started: players('tutorial_start'),
    completed: players('tutorial_complete'),
    skipped: players('tutorial_skip'),
    track,
    steps: all(
      `SELECT MIN(CAST(json_extract(params, '$.index') AS INTEGER)) AS idx, json_extract(params, '$.step') AS step, COUNT(DISTINCT client) AS players
       FROM events WHERE name = 'tutorial_step' AND ts >= ? AND ${track === 'short' ? '' : 'NOT '}${shortClients}
       GROUP BY step ORDER BY idx, players DESC`,
      from,
    ).map((r, i) => ({ index: i + 1, step: String(r.step ?? ''), players: num(r.players) })),
    ...trackCounts(''),
    ...(() => {
      const other = trackCounts('NOT ');
      return { otherPlayers: other.trackPlayers, otherDone: other.trackDone };
    })(),
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

  const help = { guide: count('guide_open'), banish: count('shop_banish'), rerolls: count('shop_reroll') };

  // До 0.4.10 игра писала запрос межстраничной рекламы и там, где её нет (Telegram, сайт).
  // Отсекаем только эти версии: с 0.5.9 межстраничная в Telegram — настоящая (AdsGram).
  const buggyAdVersions = all<{ version: string }>('SELECT DISTINCT version FROM events WHERE ts >= ?', from)
    .map((r) => String(r.version))
    .filter((v) => cmpVersion(v, '0.4.10') < 0);
  const buggyAdFilter = buggyAdVersions.length
    ? `AND NOT (json_extract(params, '$.kind') = 'interstitial' AND platform IN ('telegram', 'web') AND version IN (${buggyAdVersions.map(() => '?').join(', ')}))`
    : '';

  const ads = all(
    `SELECT platform, json_extract(params, '$.kind') AS kind, json_extract(params, '$.placement') AS placement,
            SUM(CASE WHEN name = 'ad_request' THEN 1 ELSE 0 END) AS requests,
            SUM(CASE WHEN name = 'ad_result' AND json_extract(params, '$.result') = 'rewarded' THEN 1 ELSE 0 END) AS rewarded
     FROM events WHERE name IN ('ad_request', 'ad_result') AND ts >= ? ${buggyAdFilter}
     GROUP BY platform, kind, placement ORDER BY requests DESC`,
    from,
    ...buggyAdVersions,
  ).map((r) => ({ platform: String(r.platform), kind: String(r.kind), placement: String(r.placement), requests: num(r.requests), rewarded: num(r.rewarded) }));

  // Свежие сверху: давно исправленная ошибка старой версии не заслоняет новую
  const errors = all(
    `SELECT json_extract(e.params, '$.message') AS message, MAX(json_extract(e.params, '$.where')) AS place, COUNT(*) AS n, MAX(e.ts) AS last,
            GROUP_CONCAT(DISTINCT e.version) AS vers,
            (SELECT json_extract(s.params, '$.stack') FROM events s
              WHERE s.name = 'js_error' AND s.ts >= ? AND json_extract(s.params, '$.message') = json_extract(e.params, '$.message')
                AND json_extract(s.params, '$.stack') IS NOT NULL
              ORDER BY s.ts DESC LIMIT 1) AS stack
     FROM events e WHERE e.name = 'js_error' AND e.ts >= ? GROUP BY message ORDER BY last DESC LIMIT 10`,
    from,
    from,
  ).map((r) => ({
    message: String(r.message),
    where: r.place ? String(r.place) : '',
    count: num(r.n),
    last: num(r.last),
    stack: r.stack ? String(r.stack) : '',
    versions: String(r.vers ?? '').split(',').filter(Boolean).sort(cmpVersion),
  }))
    // Ошибки только старых версий давно исправлены: их число — в play.oldErrors
    .filter((e) => e.versions.some((v) => cmpVersion(v, ERRORS_SINCE) >= 0));

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

  return { periodDays, generatedAt: now, totals, daily, platforms, retention, tutorial, runs, nights, shop, funnel, growth, help, ads, errors, perf, versions, play };
}

/** Московский день → «12 окт». */
export function dayLabel(day: number): string {
  const d = new Date(day * DAY);
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}
