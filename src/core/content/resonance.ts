import type { Unlock } from './skies';

/**
 * Резонанс Знамений (RS.1): два Знамения одной темы, поставленные рядом, в Обсерватории
 * сливаются в одно легендарное — сильнее обоих и занимает одно место. Купить его нельзя.
 */
export interface ResonanceDef {
  /** id легендарного Знамения. */
  id: string;
  /** Пара, которая в него сливается (порядок в ряду не важен). */
  pair: readonly [string, string];
}

/** Ступень «Резонанс»: увидеть 25 разных Знамений. */
export const RESONANCE_UNLOCK: Unlock = { kind: 'omensSeen', count: 25 };

export const RESONANCES: readonly ResonanceDef[] = [
  { id: 'noon', pair: ['sunWorship', 'highNoon'] },
  { id: 'starKnot', pair: ['crossroads', 'doubleStar'] },
  { id: 'midnightOwl', pair: ['nightOwl', 'patientSky'] },
  { id: 'springTide', pair: ['moonTide', 'lowTide'] },
  { id: 'milkyWay', pair: ['ladder', 'shortcut'] },
  { id: 'pureSpectrum', pair: ['monochrome', 'prismLens'] },
  { id: 'wildfire', pair: ['pyre', 'ember'] },
  { id: 'treasury', pair: ['hoarder', 'miser'] },
];

/** Легендарное, в которое сливаются `a` и `b`; не пара — `undefined`. */
export function resonanceOf(a: string, b: string): ResonanceDef | undefined {
  return RESONANCES.find(({ pair: [x, y] }) => (x === a && y === b) || (x === b && y === a));
}
