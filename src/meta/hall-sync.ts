import { track } from '@/analytics';
import { apiBase } from '@/store/stars-payments';
import { FEATS, featStates, recordValue, type HallStats } from './achievements';
import type { Profile } from './profile';

/*
 * Связь «Зала славы» с сервером (HF.2). Туда — анонимный снимок игрока событием `hall_snap`:
 * маска открытых достижений (бит — номер в FEATS) и рекорды. Обратно — доли игроков с
 * `/v1/hall`. Снимок уходит, только когда изменился или раз в сутки; доли кэшируются на
 * устройстве, и зал открывается сразу с прошлыми, пока грузятся свежие.
 */

const SNAP_KEY = 'starweave.hallsnap.v1';
const STATS_KEY = 'starweave.hall.v1';
const DAY = 24 * 60 * 60 * 1000;
/**
 * Сглаживание долей (решение Дениса 28.10.2026: никаких «мало игроков»): к настоящим игрокам
 * добавляется `PRIOR_WEIGHT` воображаемых с заложенной редкостью ступени. Пока данных мало,
 * доля близка к редкости ступени; чем больше игроков, тем ближе к настоящей.
 */
export const PRIOR_WEIGHT = 60;
/** Заложенная редкость ступени, % игроков: обычное, редкое, эпическое, легендарное. */
export const TIER_PRIOR = [60, 20, 5, 0.8] as const;

export type HallSnap = { f: number; bm: number; ba: number; w: number; l: number; e: number; st: number };

export function hallSnapshot(p: Profile): HallSnap {
  let f = 0;
  featStates(p).forEach((s, i) => {
    if (s.done) f += 2 ** i;
  });
  return {
    f,
    bm: recordValue(p, 'bestMove'),
    ba: recordValue(p, 'bestAnte'),
    w: recordValue(p, 'wins'),
    l: recordValue(p, 'lines'),
    e: recordValue(p, 'eclipses'),
    st: recordValue(p, 'streak'),
  };
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* приватный режим */
  }
}

/** Шлёт снимок, если он изменился или прошлый старше суток. */
export function sendHallSnapshot(p: Profile, now = Date.now()): void {
  if (!p.runs) return;
  const snap = hallSnapshot(p);
  const key = JSON.stringify(snap);
  const last = read<{ key: string; at: number }>(SNAP_KEY);
  if (last && last.key === key && now - last.at < DAY) return;
  track('hall_snap', snap);
  write(SNAP_KEY, { key, at: now });
}

interface ServerHall {
  players: number;
  feats: number[];
  records: Record<string, number[]>;
}

/** Ответ сервера → доли по именам достижений; мусор и пустое — null. */
export function toHallStats(raw: unknown): HallStats | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ServerHall>;
  if (typeof r.players !== 'number' || !Array.isArray(r.feats) || !r.records || typeof r.records !== 'object') return null;
  const feats: Record<string, number> = {};
  FEATS.forEach((f, i) => {
    const v = r.feats![i];
    feats[f.id] = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  });
  const records: HallStats['records'] = {};
  for (const [k, list] of Object.entries(r.records)) {
    if (Array.isArray(list) && list.length === 101 && list.every((x) => typeof x === 'number')) (records as Record<string, number[]>)[k] = list;
  }
  return { players: r.players, feats, records };
}

/** Доли с прошлого раза (или null). */
export function cachedHallStats(): HallStats | null {
  return toHallStats(read<ServerHall>(STATS_KEY));
}

let inflight: Promise<HallStats | null> | null = null;

/** Свежие доли с сервера; при ошибке — прошлые с устройства. */
export function fetchHallStats(): Promise<HallStats | null> {
  const base = apiBase();
  if (!base) return Promise.resolve(cachedHallStats());
  inflight ??= (async () => {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(`${base}/v1/hall`, { signal: ctrl.signal });
      if (!res.ok) return cachedHallStats();
      const raw: unknown = await res.json();
      const stats = toHallStats(raw);
      if (stats) write(STATS_KEY, raw);
      return stats ?? cachedHallStats();
    } catch {
      return cachedHallStats();
    } finally {
      window.clearTimeout(timer);
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Доли для зала: достижения — всегда (сглаженные, без связи — по редкости ступени),
 * рекорды — по настоящим игрокам, если сервер ответил хотя бы раз.
 */
export function hallView(raw: HallStats | null): HallStats {
  const n = raw?.players ?? 0;
  const feats: Record<string, number> = {};
  for (const f of FEATS) {
    const real = raw?.feats[f.id] ?? 0;
    feats[f.id] = ((real / 100) * n * 100 + TIER_PRIOR[f.tier] * PRIOR_WEIGHT) / (n + PRIOR_WEIGHT);
  }
  return { players: n, feats, records: n > 0 && raw ? raw.records : {} };
}
