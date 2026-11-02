import { SKY_FIGURES, type SkyFigure } from '@/art/constellations';
import type { NightKind } from '@/core/types';

/**
 * Цель на сцене (GO.3, выбор Дениса 02.11.2026): обычная ночь — «Созвездие ночи» (`figure`),
 * его звёзды загораются по мере счёта; ночь Затмения — «Затмение» (`eclipse`): диск с кольцом
 * тени, созвездия бьют по нему. Две ночи главы плетёшь, третью отбиваешь врага.
 */
export type GoalVariant = 'figure' | 'eclipse';

export function goalVariantFor(kind: NightKind): GoalVariant {
  return kind === 'eclipse' ? 'eclipse' : 'figure';
}

const NIGHT_INDEX: Record<NightKind, number> = { dusk: 0, midnight: 1, eclipse: 2 };

/** Созвездие ночи: своё на каждую ночь забега, одинаковое для одного сида (вызов дня). */
export function figureFor(seed: number, ante: number, kind: NightKind): SkyFigure {
  const n = SKY_FIGURES.length;
  const i = (((seed + ante * 3 + NIGHT_INDEX[kind]) % n) + n) % n;
  return SKY_FIGURES[i]!;
}

/** Порядок зажигания звёзд: обход по линиям от первой — созвездие загорается цепочкой, а не вразнобой. */
export function lightOrder(f: SkyFigure): number[] {
  const seen = new Set<number>([0]);
  const out = [0];
  for (let i = 0; i < out.length; i++) {
    for (const [a, b] of f.lines) {
      const next = a === out[i] ? b : b === out[i] ? a : -1;
      if (next >= 0 && !seen.has(next)) {
        seen.add(next);
        out.push(next);
      }
    }
  }
  f.stars.forEach((_, i) => seen.has(i) || out.push(i));
  return out;
}

