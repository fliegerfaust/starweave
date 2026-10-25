import { MYTHS, type MythCond, type MythDef } from './content/myths';
import { cardSuits } from './deck';
import type { Card } from './types';
import { SUITS } from './types';

/** Фигура мифа на небе: клетки в порядке фигуры. */
export interface MythPlacement {
  myth: string;
  cells: number[];
}

const placementCache = new Map<string, number[][]>();

/**
 * Все положения фигуры на небе `n×n`: сдвиги исходной и её зеркала по горизонтали, без
 * повторов (у симметричной фигуры зеркало совпадает с исходной). Порядок клеток — порядок фигуры.
 */
export function mythPlacements(def: MythDef, n: number): number[][] {
  const key = `${def.id}:${n}`;
  const cached = placementCache.get(key);
  if (cached) return cached;
  const width = Math.max(...def.cells.map(([, c]) => c));
  const shapes = [def.cells, def.cells.map(([r, c]) => [r, width - c] as const)];
  const seen = new Set<string>();
  const out: number[][] = [];
  for (const shape of shapes) {
    const minR = Math.min(...shape.map(([r]) => r));
    const minC = Math.min(...shape.map(([, c]) => c));
    const h = Math.max(...shape.map(([r]) => r)) - minR;
    const w = Math.max(...shape.map(([, c]) => c)) - minC;
    for (let dr = 0; dr + h < n; dr++) {
      for (let dc = 0; dc + w < n; dc++) {
        const cells = shape.map(([r, c]) => (r - minR + dr) * n + (c - minC + dc));
        const id = [...cells].sort((a, b) => a - b).join(',');
        // Одно и то же множество клеток — одно положение, даже если порядок другой
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(cells);
      }
    }
  }
  placementCache.set(key, out);
  return out;
}

/** Все масти разные: каждой карте — своя масть (Призма подходит к любой). */
function rainbow(cards: readonly Card[]): boolean {
  const used = new Set<string>();
  const walk = (i: number): boolean => {
    if (i === cards.length) return true;
    for (const s of cardSuits(cards[i]!)) {
      if (used.has(s)) continue;
      used.add(s);
      if (walk(i + 1)) return true;
      used.delete(s);
    }
    return false;
  };
  return cards.length <= SUITS.length && walk(0);
}

const COND: Record<MythCond, (cards: readonly Card[]) => boolean> = {
  suit: (cards) => SUITS.some((s) => cards.every((c) => cardSuits(c).includes(s))),
  rainbow,
  arc: (cards) => {
    const r = cards.map((c) => c.rank);
    const up = r.every((v, i) => i === 0 || v > r[i - 1]!);
    const down = r.every((v, i) => i === 0 || v < r[i - 1]!);
    return up || down;
  },
  twins: (cards) => {
    const half = cards.length / 2;
    return cards.slice(0, half).every((c, i) => c.rank === cards[i + half]!.rank);
  },
  high: (cards) => cards.every((c) => c.rank >= 6),
  same: (cards) => cards.every((c) => c.rank === cards[0]!.rank),
  any: () => true,
};

/** Карты выполняют условие мифа (в порядке фигуры). */
export function mythHolds(def: MythDef, cards: readonly Card[]): boolean {
  return COND[def.cond](cards);
}

/**
 * Мифы, которые сложила карта в `cell`: положение проходит через клетку, все его клетки
 * открыты и заняты, условие выполнено. Положение без новой клетки не в счёт: оно уже было
 * на небе до хода.
 */
export function completedMyths(grid: readonly (Card | null)[], sealed: readonly boolean[], cell: number, n: number): MythPlacement[] {
  const out: MythPlacement[] = [];
  for (const def of MYTHS) {
    for (const cells of mythPlacements(def, n)) {
      if (!cells.includes(cell) || cells.some((c) => sealed[c] || !grid[c])) continue;
      if (mythHolds(def, cells.map((c) => grid[c]!))) out.push({ myth: def.id, cells });
    }
  }
  return out;
}

/**
 * Мифы, которым не хватает одной карты, и клетка для неё (подсказка силуэтом, MY.3). `fits` —
 * карты, которыми можно закрыть фигуру (обычно рука); без подходящей карты подсказки нет.
 */
export function nearMyths(
  grid: readonly (Card | null)[],
  sealed: readonly boolean[],
  n: number,
  fits: readonly Card[],
): (MythPlacement & { cell: number })[] {
  const out: (MythPlacement & { cell: number })[] = [];
  for (const def of MYTHS) {
    for (const cells of mythPlacements(def, n)) {
      if (cells.some((c) => sealed[c])) continue;
      const empty = cells.filter((c) => !grid[c]);
      if (empty.length !== 1) continue;
      const cell = empty[0]!;
      if (fits.some((card) => mythHolds(def, cells.map((c) => (c === cell ? card : grid[c]!))))) out.push({ myth: def.id, cells, cell });
    }
  }
  return out;
}
