import { describe, expect, it } from 'vitest';
import { buildLines, closingLines, ignitedLines, pickSealedCells } from '../src/core/grid';
import { chance, createRng } from '../src/core/rng';
import { c } from './helpers';

const rules = { gridSize: 4, rowsIgnite: true, colsIgnite: true, diagonals: false };

describe('grid', () => {
  it('closingLines до выкладки совпадает с ignitedLines после', () => {
    const rng = createRng(42);
    const lines = buildLines({ ...rules, diagonals: true });
    for (let k = 0; k < 300; k++) {
      const grid = Array.from({ length: 16 }, () => (chance(rng, 0.6) ? c('3m') : null));
      const sealed = Array.from({ length: 16 }, () => chance(rng, 0.1));
      for (let cell = 0; cell < 16; cell++) {
        const before = closingLines(lines, grid, sealed, cell).map((l) => l.id);
        if (grid[cell] || sealed[cell]) {
          expect(before).toEqual([]);
          continue;
        }
        const after = ignitedLines(lines, grid.map((g, i) => (i === cell ? c('5s') : g)), sealed, cell).map((l) => l.id);
        expect(before).toEqual(after);
      }
    }
  });

  it('строит 8 линий, с диагоналями — 10', () => {
    expect(buildLines(rules)).toHaveLength(8);
    expect(buildLines({ ...rules, diagonals: true })).toHaveLength(10);
  });

  it('вспыхивает ряд и столбец — крест', () => {
    const grid = Array(16).fill(null);
    for (const cell of [0, 1, 2, 7, 11, 15]) grid[cell] = c('1s');
    grid[3] = c('2s');
    const lines = ignitedLines(buildLines(rules), grid, Array(16).fill(false), 3);
    expect(lines.map((l) => l.id).sort()).toEqual(['col-3', 'row-0']);
  });

  it('запечатанная клетка не мешает вспышке', () => {
    const grid = Array(16).fill(null);
    const sealed = Array(16).fill(false);
    sealed[1] = true;
    grid[0] = c('1s');
    grid[2] = c('2s');
    grid[3] = c('3s');
    expect(ignitedLines(buildLines(rules), grid, sealed, 3).map((l) => l.id)).toEqual(['row-0']);
  });

  it('печати не делят ряд или столбец', () => {
    const cells = pickSealedCells(createRng(7), 4, 3);
    expect(new Set(cells.map((x) => Math.floor(x / 4))).size).toBe(3);
    expect(new Set(cells.map((x) => x % 4)).size).toBe(3);
  });
});
