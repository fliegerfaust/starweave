import { previewTurn } from '@/core/night';
import type { ComboId, RunState } from '@/core/types';

export interface PlacementPreview {
  lines: { combo: ComboId; total: number; kind: 'row' | 'col' | 'diag' }[];
  /** Клетки линий, которые вспыхнут. */
  cells: number[];
  total: number;
}

/**
 * Что вспыхнет от хода — этапы настоящего хода до подсчёта на песочнице (`previewTurn`).
 * Случайные эффекты (Стекло, Игрок) там могут выпасть иначе — поэтому в UI «≈».
 */
export function previewPlacement(run: RunState, handIndex: number, cell: number, seed?: number): PlacementPreview | null {
  // Своя случайность: превью не должно подсказывать исход Стекла или Игрока
  const score = previewTurn(run, handIndex, cell, seed ?? (Math.random() * 2 ** 32) >>> 0);
  if (!score) return null;
  return {
    lines: score.lines.map((l) => ({ combo: l.combo, total: l.total, kind: l.line.kind })),
    cells: [...new Set(score.lines.flatMap((l) => l.line.cells))],
    total: score.total,
  };
}
