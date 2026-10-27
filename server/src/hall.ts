import type { Db } from './db.ts';

/**
 * Доли игроков для «Зала славы» (HF.2). Игра шлёт анонимный снимок `hall_snap`: открытые
 * достижения битовой маской `f` (бит — номер достижения в списке игры, новые только в конец)
 * и рекорды числами. Сервер берёт последний снимок каждого устройства за окно и считает,
 * у скольких процентов игроков есть каждое достижение и где проходят пороги рекордов.
 * Ответ кэшируется: пересчёт не чаще раза в час, запрос игры только читает готовое.
 */

export const HALL_WINDOW_DAYS = 90;
export const HALL_TTL_MS = 60 * 60 * 1000;

/** Короткие ключи снимка → имена рекордов в игре. */
const RECORD_KEYS: Record<string, string> = { bm: 'bestMove', ba: 'bestAnte', w: 'wins', l: 'lines', e: 'eclipses', st: 'streak' };
/** Сколько бит маски читаем: с запасом на будущие достижения. */
const MAX_FEATS = 48;

export interface HallAggregate {
  players: number;
  /** Процент игроков с достижением, по номеру бита; с десятыми. */
  feats: number[];
  /** Пороги рекорда на процентилях 0…100: 101 значение по возрастанию. */
  records: Record<string, number[]>;
  /** Когда посчитано (мс). */
  at: number;
}

const bit = (mask: number, i: number) => Math.floor(mask / 2 ** i) % 2 === 1;

export function computeHall(db: Db, now: number): HallAggregate {
  const since = now - HALL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const rows = db.prepare(`
    SELECT e.params AS params FROM events e
    JOIN (SELECT client, MAX(id) AS id FROM events WHERE name = 'hall_snap' AND ts >= ? GROUP BY client) last ON e.id = last.id
  `).all(since) as { params: string }[];
  const counts = new Array<number>(MAX_FEATS).fill(0);
  const values: Record<string, number[]> = Object.fromEntries(Object.values(RECORD_KEYS).map((k) => [k, []]));
  let players = 0;
  let top = 0;
  for (const row of rows) {
    let p: Record<string, unknown>;
    try {
      p = JSON.parse(row.params) as Record<string, unknown>;
    } catch {
      continue;
    }
    const mask = typeof p.f === 'number' && Number.isSafeInteger(p.f) && p.f >= 0 ? p.f : 0;
    players++;
    for (let i = 0; i < MAX_FEATS; i++) {
      if (bit(mask, i)) {
        counts[i]!++;
        top = Math.max(top, i + 1);
      }
    }
    for (const [key, name] of Object.entries(RECORD_KEYS)) {
      const v = p[key];
      values[name]!.push(typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
    }
  }
  const feats = counts.slice(0, top).map((n) => (players ? Math.round((n / players) * 1000) / 10 : 0));
  const records: Record<string, number[]> = {};
  for (const [name, list] of Object.entries(values)) {
    if (!list.length) continue;
    list.sort((a, b) => a - b);
    records[name] = Array.from({ length: 101 }, (_, q) => list[Math.floor((q / 100) * (list.length - 1))]!);
  }
  return { players, feats, records, at: now };
}

/** Кэш ответа: считаем при первом запросе и потом не чаще раза в час. */
export class HallCache {
  private value: HallAggregate | null = null;
  private body = '';
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  json(now: number): string {
    if (!this.value || now - this.value.at >= HALL_TTL_MS) {
      this.value = computeHall(this.db, now);
      this.body = JSON.stringify(this.value);
    }
    return this.body;
  }
}
