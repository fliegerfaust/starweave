/**
 * Сидируемый ГПСЧ (mulberry32). Состояние — обычный объект, поэтому живёт прямо в
 * сохранении забега: после загрузки игра продолжается с того же места генератора.
 */
export interface RngState {
  s: number;
}

export function createRng(seed: number): RngState {
  return { s: seed >>> 0 };
}

/** Число в [0, 1). */
export function random(rng: RngState): number {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Целое в [0, n). */
export function randInt(rng: RngState, n: number): number {
  return Math.floor(random(rng) * n);
}

export function chance(rng: RngState, p: number): boolean {
  return random(rng) < p;
}

export function pick<T>(rng: RngState, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick: пустой список');
  return items[randInt(rng, items.length)] as T;
}

/** Тасовка Фишера–Йетса на месте. */
export function shuffle<T>(rng: RngState, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
  return items;
}

/** Взвешенный выбор: веса неотрицательны, хотя бы один > 0. */
export function weightedPick<T>(rng: RngState, items: readonly T[], weight: (item: T) => number): T {
  const total = items.reduce((sum, it) => sum + weight(it), 0);
  if (total <= 0) throw new Error('weightedPick: нулевой суммарный вес');
  let roll = random(rng) * total;
  for (const it of items) {
    roll -= weight(it);
    if (roll < 0) return it;
  }
  return items[items.length - 1] as T;
}

/** Строка → 32-битный сид (FNV-1a). Нужен для ежедневного вызова и сидов-строк. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
