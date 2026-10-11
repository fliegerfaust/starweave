import type { ComboId } from '../types';

export interface ComboDef {
  id: ComboId;
  light: number;
  mult: number;
  /** Прибавка за каждый уровень сверх первого (Звёздные карты). */
  levelLight: number;
  levelMult: number;
}

export const COMBOS: Record<ComboId, ComboDef> = {
  scatter: { id: 'scatter', light: 5, mult: 1, levelLight: 10, levelMult: 1 },
  pair: { id: 'pair', light: 10, mult: 2, levelLight: 15, levelMult: 1 },
  twoPair: { id: 'twoPair', light: 20, mult: 2, levelLight: 20, levelMult: 1 },
  mirror: { id: 'mirror', light: 35, mult: 3, levelLight: 25, levelMult: 2 },
  triple: { id: 'triple', light: 30, mult: 3, levelLight: 20, levelMult: 2 },
  straight: { id: 'straight', light: 30, mult: 4, levelLight: 30, levelMult: 2 },
  flush: { id: 'flush', light: 35, mult: 4, levelLight: 15, levelMult: 2 },
  cascade: { id: 'cascade', light: 50, mult: 5, levelLight: 35, levelMult: 3 },
  quartet: { id: 'quartet', light: 60, mult: 7, levelLight: 30, levelMult: 3 },
  starFlush: { id: 'starFlush', light: 100, mult: 8, levelLight: 40, levelMult: 4 },
  supernova: { id: 'supernova', light: 150, mult: 10, levelLight: 50, levelMult: 4 },
};

/** Свет и множитель созвездия с учётом уровня. */
export function comboBase(id: ComboId, level: number): { light: number; mult: number } {
  const def = COMBOS[id];
  const extra = Math.max(0, level - 1);
  return { light: def.light + def.levelLight * extra, mult: def.mult + def.levelMult * extra };
}

/** Иерархия семейств — нужна Знамениям вида «за любой стрит». */
export const COMBO_FAMILY = {
  pairs: ['pair', 'twoPair', 'mirror'] as ComboId[],
  sets: ['triple', 'quartet'] as ComboId[],
  runs: ['straight', 'cascade', 'starFlush', 'supernova'] as ComboId[],
  flushes: ['flush', 'starFlush', 'supernova'] as ComboId[],
  ordered: ['cascade', 'supernova'] as ComboId[],
};
