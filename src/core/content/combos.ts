import type { ComboId, Suit } from '../types';

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

/**
 * Наглядный пример каждого созвездия — линия из четырёх карт [ранг, масть].
 * Показывается в обучении и справочнике, чтобы правила читались без знания покера.
 * Тест проверяет, что каждый пример действительно даёт своё созвездие.
 */
export const COMBO_EXAMPLES: Record<ComboId, [number, Suit][]> = {
  scatter: [[2, 'sun'], [5, 'moon'], [9, 'star'], [7, 'comet']],
  pair: [[3, 'sun'], [3, 'moon'], [7, 'star'], [5, 'comet']],
  twoPair: [[4, 'sun'], [8, 'moon'], [4, 'star'], [8, 'comet']],
  mirror: [[2, 'sun'], [6, 'moon'], [6, 'star'], [2, 'comet']],
  triple: [[7, 'sun'], [7, 'moon'], [2, 'star'], [7, 'comet']],
  straight: [[5, 'sun'], [3, 'moon'], [6, 'star'], [4, 'comet']],
  flush: [[2, 'sun'], [9, 'sun'], [4, 'sun'], [7, 'sun']],
  cascade: [[3, 'sun'], [4, 'moon'], [5, 'star'], [6, 'comet']],
  quartet: [[8, 'sun'], [8, 'moon'], [8, 'star'], [8, 'comet']],
  starFlush: [[6, 'moon'], [4, 'moon'], [7, 'moon'], [5, 'moon']],
  supernova: [[3, 'star'], [4, 'star'], [5, 'star'], [6, 'star']],
};
