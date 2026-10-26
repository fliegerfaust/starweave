import type { Unlock } from './skies';

/**
 * Мифические созвездия (MY.1): фигуры настоящих созвездий на небе 4×4. Карты, сложившиеся в
 * фигуру с её условием, вспыхивают разом, миф записывается в Звёздный каталог. Клетки —
 * `[ряд, столбец]` в порядке линии созвездия: по этому порядку проверяется «дуга» и рисуются
 * рёбра. Фигура ищется на всём небе со сдвигами и зеркалом по горизонтали.
 */

/**
 * Условие фигуры: `suit` — одна масть, `rainbow` — все масти разные, `arc` — ранги растут
 * или убывают вдоль фигуры, `twins` — две половины с одинаковыми рангами по порядку,
 * `high` — все ранги от 6, `same` — один ранг, `any` — без условия.
 */
export type MythCond = 'suit' | 'rainbow' | 'arc' | 'twins' | 'high' | 'same' | 'any';

export interface MythDef {
  id: string;
  cells: readonly (readonly [number, number])[];
  /** Рёбра рисунка по индексам `cells`; нет — по порядку, `loop` замыкает последнюю с первой. */
  edges?: readonly (readonly [number, number])[];
  loop?: boolean;
  cond: MythCond;
  /** Множитель мифа к его свету. */
  x: number;
}

/** Свет мифа за каждую звезду фигуры, к рангам карт. */
export const MYTH_STAR_LIGHT = Number(globalThis.process?.env?.MYTH_LIGHT ?? 10);

/** Ступень «Мифы»: найти 6 разных созвездий. */
export const MYTHS_UNLOCK: Unlock = { kind: 'combos', count: 6 };

const TUNE = globalThis.process?.env?.MYTH_XS?.split(',').map(Number);

export const MYTHS: readonly MythDef[] = (<MythDef[]>[
  { id: 'cassiopeia', cells: [[0, 0], [1, 1], [0, 2], [1, 3]], cond: 'suit', x: 3 },
  { id: 'pleiades', cells: [[0, 0], [0, 1], [1, 1], [1, 0]], loop: true, cond: 'rainbow', x: 2 },
  { id: 'corona', cells: [[1, 0], [0, 1], [0, 2], [1, 3]], cond: 'arc', x: 3 },
  { id: 'cygnus', cells: [[0, 1], [1, 1], [2, 1], [3, 1], [1, 0], [1, 2]], edges: [[0, 1], [1, 2], [2, 3], [4, 1], [1, 5]], cond: 'any', x: 4 },
  { id: 'sagitta', cells: [[0, 0], [1, 1], [2, 2], [3, 3]], cond: 'any', x: 2 },
  { id: 'gemini', cells: [[0, 0], [1, 0], [2, 0], [0, 2], [1, 2], [2, 2]], edges: [[0, 1], [1, 2], [3, 4], [4, 5], [0, 3]], cond: 'twins', x: 4 },
  { id: 'ursa', cells: [[3, 0], [2, 0], [2, 1], [3, 1], [1, 2], [0, 3]], edges: [[0, 1], [1, 2], [2, 3], [3, 0], [2, 4], [4, 5]], cond: 'any', x: 4 },
  { id: 'lyra', cells: [[0, 1], [1, 1], [1, 2], [2, 1], [2, 2]], edges: [[0, 1], [1, 2], [1, 3], [3, 4], [4, 2]], cond: 'suit', x: 3 },
  { id: 'delphinus', cells: [[0, 1], [1, 0], [2, 1], [1, 2], [3, 2]], edges: [[0, 1], [1, 2], [2, 3], [3, 0], [2, 4]], cond: 'any', x: 3 },
  { id: 'orion', cells: [[0, 0], [0, 3], [1, 1], [1, 2], [3, 0], [3, 3]], edges: [[0, 2], [1, 3], [2, 3], [2, 4], [3, 5]], cond: 'high', x: 5 },
  { id: 'scorpius', cells: [[0, 0], [1, 0], [2, 0], [3, 1], [2, 2], [1, 2]], cond: 'any', x: 4 },
  { id: 'triangulum', cells: [[0, 0], [2, 0], [1, 2]], loop: true, cond: 'same', x: 2 },
]).map((m, i) => (TUNE?.[i] ? { ...m, x: TUNE[i]! } : m));

export function mythDef(id: string): MythDef {
  const def = MYTHS.find((m) => m.id === id);
  if (!def) throw new Error(`unknown myth: ${id}`);
  return def;
}

/** Рёбра рисунка мифа по индексам его клеток. */
export function mythEdges(def: MythDef): readonly (readonly [number, number])[] {
  if (def.edges) return def.edges;
  const chain = def.cells.slice(1).map((_, i) => [i, i + 1] as const);
  return def.loop ? [...chain, [def.cells.length - 1, 0] as const] : chain;
}
