import type { NightKind, Rules } from '../types';

export const BASE_RULES: Readonly<Rules> = {
  gridSize: 4,
  handSize: 4,
  moves: 18,
  burns: 3,
  rowsIgnite: true,
  colsIgnite: true,
  diagonals: false,
  flushSlack: 0,
  straightGaps: 0,
  chainBonus: 0,
  omenSlots: 5,
  sealedCells: 0,
  debuffSuit: null,
  hideRanks: false,
  interestStep: 5,
  interestCap: 5,
};

/** Сколько созвездий до победы. */
export const FINAL_ANTE = 8;

/** Базовая цель созвездия (Сумерки). */
export const ANTE_TARGETS = [280, 900, 1700, 3400, 6800, 13500, 27000, 54000];
export const NIGHT_TARGET_SCALE: Record<NightKind, number> = { dusk: 1, midnight: 1.4, eclipse: 1.8 };
/** Во время бесконечного режима цель растёт во столько раз за созвездие. */
export const ENDLESS_GROWTH = 2.5;

export const NIGHT_REWARD: Record<NightKind, number> = { dusk: 3, midnight: 4, eclipse: 5 };
/** +1 золото за каждые N оставшихся ходов. */
export const MOVES_PER_GOLD = 3;

export const SHOP_OMEN_SLOTS = 2;
export const SHOP_ITEM_SLOTS = 2;
export const SHOP_PACK_SLOTS = 1;
export const PACK_PRICE = { omen: 6, ritual: 4, chart: 4 } as const;
export const PACK_OPTIONS = 3;
export const REROLL_BASE = 5;
export const CHART_PRICE = 3;
export const RARITY_WEIGHT = { 1: 70, 2: 25, 3: 5 } as const;

export function anteTarget(ante: number): number {
  if (ante <= ANTE_TARGETS.length) return ANTE_TARGETS[ante - 1] as number;
  const last = ANTE_TARGETS[ANTE_TARGETS.length - 1] as number;
  return Math.round(last * ENDLESS_GROWTH ** (ante - ANTE_TARGETS.length));
}

export function nightTarget(ante: number, kind: NightKind, bossScale = 1): number {
  return Math.round((anteTarget(ante) * NIGHT_TARGET_SCALE[kind] * bossScale) / 10) * 10;
}
