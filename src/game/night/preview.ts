import { placeCard } from '@/core/night';
import type { ComboId, RunState } from '@/core/types';

export interface PlacementPreview {
  lines: { combo: ComboId; total: number; kind: 'row' | 'col' | 'diag' }[];
  /** Клетки линий, которые вспыхнут. */
  cells: number[];
  total: number;
}

/**
 * Проигрывает ход на копии забега и сообщает, что вспыхнет. Случайные эффекты
 * (Стекло, Игрок) на копии могут выпасть иначе — поэтому в UI «≈».
 */
export function previewPlacement(run: RunState, handIndex: number, cell: number, seed?: number): PlacementPreview | null {
  // Журнал команд прогнозу не нужен, а копировать его на каждую пару «карта × клетка» — дорого
  const { log: _log, ...rest } = run;
  const sim: RunState = structuredClone(rest);
  // Своя случайность: превью не должно подсказывать исход Стекла или Игрока
  sim.rng.s = seed ?? (Math.random() * 2 ** 32) >>> 0;
  try {
    const events = placeCard(sim, handIndex, cell);
    const ignite = events.find((e) => e.t === 'ignite');
    if (!ignite || ignite.t !== 'ignite') return null;
    return {
      lines: ignite.score.lines.map((l) => ({ combo: l.combo, total: l.total, kind: l.line.kind })),
      cells: [...new Set(ignite.score.lines.flatMap((l) => l.line.cells))],
      total: ignite.score.total,
    };
  } catch {
    return null;
  }
}
