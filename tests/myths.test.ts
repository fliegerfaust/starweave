import { describe, expect, it } from 'vitest';
import { MYTHS, mythDef, mythEdges } from '../src/core/content/myths';
import { completedMyths, mythHolds, mythPlacements, nearMyths } from '../src/core/myths';
import type { Card } from '../src/core/types';
import { c, cards } from './helpers';

const N = 4;
const empty = (): (Card | null)[] => Array(N * N).fill(null);
const open = Array(N * N).fill(false);
const lay = (layout: Record<number, string>) => {
  const grid = empty();
  for (const [cell, code] of Object.entries(layout)) grid[Number(cell)] = c(code);
  return grid;
};

describe('Мифы: фигуры (MY.1)', () => {
  it('у каждой фигуры клетки различны, рёбра в пределах фигуры, есть место на небе 4×4', () => {
    expect(MYTHS).toHaveLength(12);
    for (const m of MYTHS) {
      expect(new Set(m.cells.map(([r, col]) => `${r},${col}`)).size).toBe(m.cells.length);
      for (const [a, b] of mythEdges(m)) expect(Math.max(a, b)).toBeLessThan(m.cells.length);
      expect(mythPlacements(m, N).length).toBeGreaterThan(0);
    }
  });

  it('положения: сдвиги и зеркало, без повторов', () => {
    // Стрела — диагональ во всё небо: сама и зеркальная
    expect(mythPlacements(mythDef('sagitta'), N)).toEqual([[0, 5, 10, 15], [3, 6, 9, 12]]);
    // Плеяды — квадрат 2×2: зеркало совпадает, остаются 9 сдвигов
    expect(mythPlacements(mythDef('pleiades'), N)).toHaveLength(9);
    // Кассиопея во всю ширину: 3 сдвига по рядам × исходная и зеркало
    expect(mythPlacements(mythDef('cassiopeia'), N)).toHaveLength(6);
  });

  it('условия', () => {
    expect(mythHolds(mythDef('cassiopeia'), cards('2m 5m 7m 9m'))).toBe(true);
    expect(mythHolds(mythDef('cassiopeia'), cards('2m 5m 7m 9s'))).toBe(false);
    expect(mythHolds(mythDef('pleiades'), cards('2s 2m 2t 2c'))).toBe(true);
    expect(mythHolds(mythDef('pleiades'), cards('2s 2m 2t 2s'))).toBe(false);
    // Призма встаёт недостающей мастью
    expect(mythHolds(mythDef('pleiades'), cards('2s 2m 2t 2s*prism'))).toBe(true);
    expect(mythHolds(mythDef('corona'), cards('1s 3m 4t 8c'))).toBe(true);
    expect(mythHolds(mythDef('corona'), cards('8s 4m 3t 1c'))).toBe(true);
    expect(mythHolds(mythDef('corona'), cards('1s 3m 3t 8c'))).toBe(false);
    expect(mythHolds(mythDef('gemini'), cards('2s 5m 7t 2c 5s 7m'))).toBe(true);
    expect(mythHolds(mythDef('gemini'), cards('2s 5m 7t 2c 7s 5m'))).toBe(false);
    expect(mythHolds(mythDef('orion'), cards('6s 7m 9t 8c 6s 6m'))).toBe(true);
    expect(mythHolds(mythDef('orion'), cards('6s 7m 9t 8c 5s 6m'))).toBe(false);
    expect(mythHolds(mythDef('triangulum'), cards('4s 4m 4t'))).toBe(true);
  });
});

describe('Мифы на небе (MY.1)', () => {
  it('Кассиопея из Лун складывается последней картой', () => {
    const grid = lay({ 0: '2m', 5: '5m', 2: '7m' });
    grid[7] = c('9m');
    expect(completedMyths(grid, open, 7, N)).toEqual([{ myth: 'cassiopeia', cells: [0, 5, 2, 7] }]);
  });

  it('карта не из фигуры миф не складывает: он был на небе до хода', () => {
    const grid = lay({ 0: '2m', 5: '5m', 2: '7m', 7: '9m', 15: '1s' });
    expect(completedMyths(grid, open, 15, N)).toEqual([]);
  });

  it('запечатанная клетка фигуру ломает', () => {
    const grid = lay({ 0: '4s', 1: '4m' });
    grid[8] = c('4t');
    const sealed = [...open];
    expect(completedMyths(grid, sealed, 8, N).some((m) => m.myth === 'triangulum')).toBe(false);
    const g2 = lay({ 0: '4s', 8: '4m' });
    g2[6] = c('4t');
    expect(completedMyths(g2, sealed, 6, N).map((m) => m.myth)).toContain('triangulum');
    sealed[0] = true;
    expect(completedMyths(g2, sealed, 6, N).map((m) => m.myth)).not.toContain('triangulum');
  });

  it('одна карта может сложить два мифа сразу', () => {
    // Стрела по главной диагонали и зеркальный Треугольник из четвёрок (2, 10, 4) сходятся в 10
    const grid = lay({ 0: '4s', 5: '1m', 15: '9c', 2: '4m', 4: '4t' });
    grid[10] = c('4c');
    const found = completedMyths(grid, open, 10, N).map((m) => m.myth);
    expect(found).toContain('sagitta');
    expect(found).toContain('triangulum');
  });

  it('подсказка: фигуре не хватает одной карты, и в руке есть подходящая', () => {
    const grid = lay({ 0: '2m', 5: '5m', 2: '7m' });
    expect(nearMyths(grid, open, N, cards('9m')).find((m) => m.myth === 'cassiopeia')).toEqual({ myth: 'cassiopeia', cells: [0, 5, 2, 7], cell: 7 });
    expect(nearMyths(grid, open, N, cards('9s')).find((m) => m.myth === 'cassiopeia')).toBeUndefined();
  });
});
