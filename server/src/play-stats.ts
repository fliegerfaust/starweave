import type { Db } from './db.ts';

/**
 * Как на самом деле играют (ST.2): активное время, неделя к неделе, воронка новичков по
 * площадкам, возвраты по неделям прихода, выпуски, популярность фич, где обрывают забег,
 * Знамения, здоровье. Сырые события читаются потоком (iterate), в памяти — только итоги:
 * у контейнера 256 МБ.
 */

const DAY = 24 * 60 * 60 * 1000;
const MSK = 3 * 60 * 60 * 1000;
const dayOf = (ts: number): number => Math.floor((ts + MSK) / DAY);

/** Пауза дольше этой — игра лежала в фоне или забыта, а не идёт. */
export const IDLE_GAP = 5 * 60 * 1000;
/** События, которые игра шлёт сама, без действия игрока. */
const PASSIVE = new Set(['app_open', 'perf']);
/** С этой версии ошибки ловятся и пишутся как сейчас; что раньше — давно исправлено. */
export const ERRORS_SINCE = '0.5.6';
/** Последняя глава забега (FINAL_ANTE игры). */
const FINAL_ANTE = 8;

export interface Week {
  players: number;
  newPlayers: number;
  /** Медиана активных минут на игрока за день (дни, когда он играл). */
  minPerDay: number | null;
  firstNight: { won: number; played: number };
  /** Ошибки версий не старше ERRORS_SINCE. */
  errors: number;
}

export interface Feature {
  name: string;
  since: string;
  /** Игроков, у кого фича была: версия не старше выхода и дошли до нужного места игры. */
  available: number;
  /** Дошли до места, где она появляется; null — такого события нет. */
  met: number | null;
  /** Воспользовались; null — события ещё нет (need). */
  used: number | null;
  need?: string;
  note?: string;
}

export interface Play {
  /** buckets — сыгранные сессии по длине, границы SESSION_BUCKETS. */
  sessions: { all: number; bounce: number; played: number; medianMin: number | null; meanMin: number | null; buckets: number[] };
  perPlayerDayMin: number | null;
  week: Week;
  prevWeek: Week;
  nowInGame: number;
  /** Доля сессий без ошибок среди сессий версий не старше ERRORS_SINCE, %. */
  crashFree: number | null;
  /** Сколько раз за период сработали ошибки старых версий — в списке их нет. */
  oldErrors: number;
  platforms: { platform: string; players: number; sessions: number; medianMin: number | null }[];
  /** Новички периода по площадке первого входа: steps — по FUNNEL_STEPS. */
  platformFunnel: { platform: string; steps: number[]; d1: number; d1Base: number }[];
  /** Неделя прихода (понедельник, московский день) × вернулись к 1-му, 3-му, 7-му дню. */
  cohorts: { week: number; players: number; cells: ({ back: number; base: number } | null)[] }[];
  /** Новички по версии первого входа. */
  releases: { version: string; players: number; tutorial: number; night1: number; d1: number; d1Base: number; firstDayMin: number | null }[];
  features: Feature[];
  /** Забеги без итога: последняя начатая ночь. */
  quits: { ante: number; night: string; runs: number }[];
  runsStarted: number;
  runsCut: number;
  omens: { id: string; bought: number; runs: number; avgAnte: number | null }[];
  money: { storeOpen: number; purchaseStart: number; paid: number };
  tutorialStuck: { players: number; medianSec: number | null };
}

export const FUNNEL_STEPS = ['Открыли игру', 'Начали обучение', 'Прошли обучение', 'Начали забег', 'Выиграли 1-ю ночь', 'Дошли до 2-й главы'] as const;
export const COHORT_DAYS = [1, 3, 7] as const;
/** Верхние границы корзин длины сессии, минуты; последняя корзина — всё длиннее. */
export const SESSION_BUCKETS = [1, 3, 10, 30] as const;

type Row = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : Number(v ?? 0));
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export function computePlay(db: Db, now: number, from: number): Play {
  const all = (sql: string, ...args: (string | number)[]) => db.prepare(sql).all(...args) as Row[];
  const one = (sql: string, ...args: (string | number)[]) => (db.prepare(sql).get(...args) ?? {}) as Row;
  const iter = (sql: string, ...args: (string | number)[]) => db.prepare(sql).iterate(...args) as IterableIterator<Row>;
  const today = dayOf(now);
  const fromDay = dayOf(from);
  const weekStart = now - 7 * DAY;
  const prevStart = now - 14 * DAY;

  const versions = all('SELECT DISTINCT version FROM events WHERE ts >= ?', Math.min(from, prevStart)).map((r) => str(r.version));
  /** `AND version IN (…)` для версий не старше v; без таких версий — заведомо ложное условие. */
  const since = (v: string): string => {
    const list = versions.filter((x) => cmpVersion(x, v) >= 0);
    return list.length ? `AND version IN (${list.map((x) => `'${x.replace(/'/g, "''")}'`).join(', ')})` : 'AND 0';
  };
  const recent = since(ERRORS_SINCE);

  // ── Сессии потоком: активное время, ошибки, обрыв забегов ────────────────
  const perDay = new Map<string, number>(); // `${client}|${день}` → активные минуты
  const sessions: { start: number; platform: string; min: number; acted: boolean; crash: boolean; recent: boolean }[] = [];
  const quits = new Map<string, number>();
  let runsStarted = 0;
  let cur: { id: string; client: string; platform: string; start: number; last: number; ms: number; acted: boolean; crash: boolean; recent: boolean; run: boolean; night: string } | null = null;
  const cutRun = (night: string) => quits.set(night, (quits.get(night) ?? 0) + 1);
  const close = () => {
    if (!cur) return;
    if (cur.run && cur.start >= from) cutRun(cur.night);
    sessions.push({ start: cur.start, platform: cur.platform, min: cur.ms / 60000, acted: cur.acted, crash: cur.crash, recent: cur.recent });
  };
  const recentVersions = new Set(versions.filter((x) => cmpVersion(x, ERRORS_SINCE) >= 0));
  for (const r of iter(
    `SELECT session, client, platform, version, ts, name, params FROM events
     WHERE session IN (SELECT session FROM events GROUP BY session HAVING MIN(ts) >= ?) ORDER BY session, ts`,
    Math.min(from, prevStart),
  )) {
    const ts = num(r.ts);
    const name = str(r.name);
    if (!cur || cur.id !== str(r.session)) {
      close();
      cur = { id: str(r.session), client: str(r.client), platform: str(r.platform), start: ts, last: ts, ms: 0, acted: false, crash: false, recent: false, run: false, night: '1|dusk' };
    }
    const gap = ts - cur.last;
    if (gap > 0 && gap <= IDLE_GAP) {
      cur.ms += gap;
      const key = `${cur.client}|${dayOf(cur.last)}`;
      perDay.set(key, (perDay.get(key) ?? 0) + gap / 60000);
    }
    cur.last = ts;
    if (!PASSIVE.has(name)) cur.acted = true;
    if (recentVersions.has(str(r.version))) cur.recent = true;
    if (name === 'js_error') cur.crash = true;
    if (name === 'run_start') {
      // Новый забег, а прошлый так и не кончился — оборван
      if (cur.run && cur.start >= from) cutRun(cur.night);
      cur.run = true;
      cur.night = '1|dusk';
      if (cur.start >= from) runsStarted++;
    } else if (name === 'night_start' && cur.run) {
      const p = parse(r.params);
      cur.night = `${num(p.ante) || 1}|${str(p.night) || 'dusk'}`;
    } else if (name === 'run_end' && cur.run) {
      if (str(parse(r.params).result) === 'abandon' && cur.start >= from) cutRun(cur.night);
      cur.run = false;
    }
  }
  close();

  const inPeriod = sessions.filter((s) => s.start >= from);
  const played = inPeriod.filter((s) => s.acted);
  const lengths = played.map((s) => s.min);
  const recentSessions = inPeriod.filter((s) => s.recent);

  const dayMinutes = (lo: number, hi: number): number[] => {
    const out: number[] = [];
    for (const [key, min] of perDay) {
      const d = Number(key.slice(key.lastIndexOf('|') + 1));
      if (d >= lo && d <= hi && min > 0) out.push(min);
    }
    return out;
  };

  const week = (lo: number, hi: number): Week => {
    const fn = one(
      `SELECT COUNT(*) AS played, SUM(CASE WHEN json_extract(params, '$.won') THEN 1 ELSE 0 END) AS won FROM events
       WHERE name = 'night_end' AND json_extract(params, '$.ante') = 1 AND json_extract(params, '$.night') = 'dusk' AND ts >= ? AND ts < ?`,
      lo,
      hi,
    );
    return {
      players: num(one('SELECT COUNT(DISTINCT client) AS n FROM events WHERE ts >= ? AND ts < ?', lo, hi).n),
      newPlayers: num(one('SELECT COUNT(*) AS n FROM (SELECT MIN(ts) AS t0 FROM events GROUP BY client) WHERE t0 >= ? AND t0 < ?', lo, hi).n),
      minPerDay: round1(median(dayMinutes(dayOf(lo), dayOf(hi - 1)))),
      firstNight: { won: num(fn.won), played: num(fn.played) },
      errors: num(one(`SELECT COUNT(*) AS n FROM events WHERE name = 'js_error' AND ts >= ? AND ts < ? ${recent}`, lo, hi).n),
    };
  };

  const platformSessions = new Map<string, number[]>();
  for (const s of played) platformSessions.set(s.platform, [...(platformSessions.get(s.platform) ?? []), s.min]);
  const platforms = all('SELECT platform, COUNT(DISTINCT client) AS n FROM events WHERE ts >= ? GROUP BY platform ORDER BY n DESC', from).map((r) => {
    const list = platformSessions.get(str(r.platform)) ?? [];
    return { platform: str(r.platform), players: num(r.n), sessions: list.length, medianMin: round1(median(list)) };
  });

  // ── Новички периода потоком по игроку: площадка, версия, вехи, дни ───────
  type Fresh = { id: string; platform: string; version: string; firstDay: number; steps: boolean[]; days: Set<number> };
  const fresh: Fresh[] = [];
  let me: Fresh | null = null;
  for (const r of iter(
    `SELECT client, platform, version, ts, name, params FROM events
     WHERE client IN (SELECT client FROM events GROUP BY client HAVING MIN(ts) >= ?) ORDER BY client, ts`,
    fromDay * DAY - MSK,
  )) {
    if (!me || me.id !== str(r.client)) {
      if (me) fresh.push(me);
      me = { id: str(r.client), platform: str(r.platform), version: str(r.version), firstDay: dayOf(num(r.ts)), steps: FUNNEL_STEPS.map((_, i) => i === 0), days: new Set() };
    }
    me.days.add(dayOf(num(r.ts)));
    const name = str(r.name);
    if (name === 'tutorial_start') me.steps[1] = true;
    else if (name === 'tutorial_complete' || name === 'tutorial_skip') me.steps[2] = true;
    else if (name === 'run_start') me.steps[3] = true;
    else if (name === 'night_end' && parse(r.params).won) me.steps[4] = true;
    else if (name === 'night_start' && num(parse(r.params).ante) >= 2) me.steps[5] = true;
  }
  if (me) fresh.push(me);

  const backBy = (f: Fresh, n: number) => [...f.days].some((d) => d > f.firstDay && d <= f.firstDay + n);
  const groupBy = <K>(key: (f: Fresh) => K) => {
    const m = new Map<K, Fresh[]>();
    for (const f of fresh) m.set(key(f), [...(m.get(key(f)) ?? []), f]);
    return m;
  };
  const d1 = (list: Fresh[]) => {
    const base = list.filter((f) => f.firstDay + 1 <= today);
    return { d1: base.filter((f) => f.days.has(f.firstDay + 1)).length, d1Base: base.length };
  };

  const platformFunnel = [...groupBy((f) => f.platform)]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([platform, list]) => ({ platform, steps: FUNNEL_STEPS.map((_, i) => list.filter((f) => f.steps[i]).length), ...d1(list) }));

  // Понедельник: 1 января 1970 — четверг, поэтому сдвиг на 3
  const monday = (d: number) => d - ((d + 3) % 7);
  const cohorts = [...groupBy((f) => monday(f.firstDay))]
    .sort((a, b) => a[0] - b[0])
    .map(([w, list]) => ({
      week: w,
      players: list.length,
      cells: COHORT_DAYS.map((n) => {
        const base = list.filter((f) => f.firstDay + n <= today);
        return base.length ? { back: base.filter((f) => backBy(f, n)).length, base: base.length } : null;
      }),
    }));

  const releases = [...groupBy((f) => f.version)]
    .sort((a, b) => cmpVersion(a[0], b[0]))
    .map(([version, list]) => ({
      version,
      players: list.length,
      tutorial: list.filter((f) => f.steps[2]).length,
      night1: list.filter((f) => f.steps[4]).length,
      ...d1(list),
      firstDayMin: round1(median(list.map((f) => perDay.get(`${f.id}|${f.firstDay}`) ?? 0))),
    }));

  // ── Популярность фич: игроки периода на версиях не старше выхода ─────────
  const players = (where: string, v?: string) => num(one(`SELECT COUNT(DISTINCT client) AS n FROM events WHERE ts >= ? ${v ? since(v) : ''} AND (${where})`, from).n);
  const exists = (name: string) => num(one('SELECT COUNT(*) AS n FROM events WHERE name = ? AND ts >= ?', name, from).n) > 0;
  const giftKinds = all(`SELECT json_extract(params, '$.kind') AS kind, COUNT(*) AS n FROM events WHERE name = 'gift_take' AND ts >= ? GROUP BY kind ORDER BY n DESC`, from);
  const giftSkips = num(one(`SELECT COUNT(*) AS n FROM events WHERE name = 'gift_skip' AND ts >= ?`, from).n);
  const GIFT: Record<string, string> = { glyph: 'глифы', body: 'тела', ascend: 'возвышения' };
  const ante2 = `name = 'night_start' AND json_extract(params, '$.ante') >= 2`;
  const trophyOmens = players(`name = 'trophy_take' AND json_extract(params, '$.kind') = 'omen'`);
  const features: Feature[] = [
    {
      name: 'Дар ночи',
      since: '0.7.0',
      available: players(`name = 'run_start' AND json_extract(params, '$.gift')`),
      met: players(`name IN ('gift_take', 'gift_skip')`),
      used: players(`name = 'gift_take'`),
      note: giftKinds.length ? `взяли: ${giftKinds.map((k) => `${GIFT[str(k.kind)] ?? str(k.kind)} ${num(k.n)}`).join(', ')}; «Чистое небо» выбрали ${giftSkips} раз` : undefined,
    },
    exists('route_pick')
      ? { name: 'Развилки', since: '0.7.0', available: players(ante2, '0.7.0'), met: players(`name = 'route_pick'`), used: players(`name = 'route_pick' AND json_extract(params, '$.route') != 'night'`) }
      : { name: 'Развилки', since: '0.7.0', available: players(ante2, '0.7.0'), met: null, used: null, need: 'route_pick' },
    { name: 'Комета и Телескоп', since: '0.7.0', available: players(ante2, '0.7.0'), met: players(`name = 'wonder'`), used: players(`name = 'wonder' AND json_extract(params, '$.kind') = 'take'`) },
    {
      name: 'Трофеи Затмений',
      since: '0.7.5',
      available: players(`name = 'run_start'`, '0.7.5'),
      met: players(`name = 'night_end' AND json_extract(params, '$.night') = 'eclipse' AND json_extract(params, '$.won')`, '0.7.5'),
      used: players(`name = 'trophy_take' AND json_extract(params, '$.kind') = 'trophy'`),
      note: trophyOmens ? `взяли парное Знамение вместо трофея: ${trophyOmens}` : undefined,
    },
    { name: 'Мифы неба', since: '0.7.9', available: players(`name = 'night_start'`, '0.7.9'), met: null, used: players(`name = 'myth_found'`) },
    { name: 'Резонанс', since: '0.7.9', available: players(`name = 'shop_buy' AND json_extract(params, '$.kind') = 'omen'`, '0.7.9'), met: null, used: players(`name = 'resonance_fuse'`) },
    { name: 'Коллекция', since: '0.7.10', available: players(`name = 'app_open'`, '0.7.10'), met: players(`name = 'collection_hook'`), used: players(`name = 'collection_open'`) },
    exists('feature_unlock')
      ? { name: 'Лестница открытий', since: '0.7.6', available: players('1', '0.7.6'), met: null, used: players(`name = 'feature_unlock'`) }
      : { name: 'Лестница открытий', since: '0.7.6', available: players('1', '0.7.6'), met: null, used: null, need: 'feature_unlock' },
  ];

  // ── Знамения: покупки и до какой главы доходят забеги с ними ─────────────
  const held = new Map<string, { runs: number; antes: number }>();
  for (const r of iter(`SELECT json_extract(params, '$.omens') AS omens, json_extract(params, '$.ante') AS ante FROM events WHERE name = 'run_end' AND ts >= ?`, from)) {
    for (const id of str(r.omens).split(',').filter(Boolean)) {
      const h = held.get(id) ?? { runs: 0, antes: 0 };
      h.runs++;
      h.antes += Math.min(num(r.ante) || 1, FINAL_ANTE);
      held.set(id, h);
    }
  }
  const omens = all(
    `SELECT json_extract(params, '$.id') AS item, COUNT(*) AS n FROM events WHERE name = 'shop_buy' AND json_extract(params, '$.kind') = 'omen' AND ts >= ?
     GROUP BY item ORDER BY n DESC LIMIT 8`,
    from,
  ).map((r) => {
    const h = held.get(str(r.item));
    return { id: str(r.item), bought: num(r.n), runs: h?.runs ?? 0, avgAnte: h ? round1(h.antes / h.runs) : null };
  });

  // Застряли на первом шаге короткого обучения: дальше shortRow не пошли и не закончили
  const stuck = all(
    `SELECT s.client,
            (SELECT MAX(e.ts) FROM events e WHERE e.client = s.client AND e.session = s.session) - s.ts AS sec
     FROM events s WHERE s.name = 'tutorial_step' AND json_extract(s.params, '$.step') = 'shortRow' AND s.ts >= ?
       AND NOT EXISTS (SELECT 1 FROM events o WHERE o.client = s.client AND (o.name = 'tutorial_complete'
         OR (o.name = 'tutorial_step' AND json_extract(o.params, '$.step') != 'shortRow')))
     GROUP BY s.client`,
    from,
  ).map((r) => num(r.sec) / 1000);

  const quitList = [...quits]
    .map(([key, runs]) => {
      const [ante, night] = key.split('|');
      return { ante: Number(ante), night: night ?? 'dusk', runs };
    })
    .sort((a, b) => b.runs - a.runs);

  return {
    sessions: {
      all: inPeriod.length,
      bounce: inPeriod.length - played.length,
      played: played.length,
      medianMin: median(lengths),
      meanMin: lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : null,
      buckets: [...SESSION_BUCKETS, Infinity].map((hi, i) => lengths.filter((m) => m < hi && m >= (SESSION_BUCKETS[i - 1] ?? 0)).length),
    },
    perPlayerDayMin: round1(median(dayMinutes(fromDay, today))),
    week: week(weekStart, now + 1),
    prevWeek: week(prevStart, weekStart),
    nowInGame: num(one('SELECT COUNT(DISTINCT client) AS n FROM events WHERE ts >= ?', now - IDLE_GAP).n),
    crashFree: recentSessions.length ? Math.round((1000 * recentSessions.filter((s) => !s.crash).length) / recentSessions.length) / 10 : null,
    oldErrors: num(one(`SELECT COUNT(*) AS n FROM events WHERE name = 'js_error' AND ts >= ? AND NOT (1 ${recent})`, from).n),
    platforms,
    platformFunnel,
    cohorts,
    releases,
    features,
    quits: quitList,
    runsStarted,
    runsCut: quitList.reduce((a, q) => a + q.runs, 0),
    omens,
    money: {
      storeOpen: players(`name = 'store_open'`),
      purchaseStart: players(`name = 'purchase_start'`),
      paid: num(one(`SELECT COUNT(*) AS n FROM events WHERE name = 'purchase_result' AND json_extract(params, '$.result') = 'paid' AND ts >= ?`, from).n),
    },
    tutorialStuck: { players: stuck.length, medianSec: round1(median(stuck)) },
  };
}

function parse(v: unknown): Record<string, unknown> {
  try {
    return JSON.parse(str(v) || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

const round1 = (v: number | null): number | null => (v === null ? null : Math.round(v * 10) / 10);

/** Сравнение версий «0.4.9» < «0.4.13» — по числам, не по строке. */
export function cmpVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export function median(list: number[]): number | null {
  if (list.length === 0) return null;
  const s = [...list].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
