import type { Card, Line, Rules } from './types';
import { type RngState, shuffle } from './rng';

/** Все линии неба, которые могут вспыхнуть по текущим правилам. */
export function buildLines(rules: Pick<Rules, 'gridSize' | 'rowsIgnite' | 'colsIgnite' | 'diagonals'>): Line[] {
  const n = rules.gridSize;
  const lines: Line[] = [];
  const range = [...Array(n).keys()];
  if (rules.rowsIgnite) {
    for (const r of range) lines.push({ id: `row-${r}`, kind: 'row', cells: range.map((c) => r * n + c) });
  }
  if (rules.colsIgnite) {
    for (const c of range) lines.push({ id: `col-${c}`, kind: 'col', cells: range.map((r) => r * n + c) });
  }
  if (rules.diagonals) {
    lines.push({ id: 'diag-main', kind: 'diag', cells: range.map((i) => i * n + i) });
    lines.push({ id: 'diag-anti', kind: 'diag', cells: range.map((i) => i * n + (n - 1 - i)) });
  }
  return lines;
}

/** Активные (незапечатанные) клетки линии по порядку. */
export function activeCells(line: Line, sealed: readonly boolean[]): number[] {
  return line.cells.filter((cell) => !sealed[cell]);
}

/**
 * Линии, вспыхнувшие после выкладки в `cell`: линия проходит через клетку, все её
 * активные клетки заняты, и активных клеток хотя бы две.
 */
export function ignitedLines(
  lines: readonly Line[],
  grid: readonly (Card | null)[],
  sealed: readonly boolean[],
  cell: number,
): Line[] {
  return lines.filter((line) => {
    if (!line.cells.includes(cell)) return false;
    const active = activeCells(line, sealed);
    return active.length >= 2 && active.every((c) => grid[c] != null);
  });
}

/**
 * Выбирает клетки для запечатывания: не больше одной на ряд и столбец, чтобы ни одна
 * линия не осталась короче трёх клеток.
 */
export function pickSealedCells(rng: RngState, gridSize: number, count: number): number[] {
  const rows = shuffle(rng, [...Array(gridSize).keys()]);
  const cols = shuffle(rng, [...Array(gridSize).keys()]);
  const result: number[] = [];
  for (let i = 0; i < Math.min(count, gridSize); i++) {
    result.push((rows[i] as number) * gridSize + (cols[i] as number));
  }
  return result;
}

export function cellRow(cell: number, gridSize: number): number {
  return Math.floor(cell / gridSize);
}

export function cellCol(cell: number, gridSize: number): number {
  return cell % gridSize;
}

export function isCorner(cell: number, gridSize: number): boolean {
  const r = cellRow(cell, gridSize);
  const c = cellCol(cell, gridSize);
  const last = gridSize - 1;
  return (r === 0 || r === last) && (c === 0 || c === last);
}
