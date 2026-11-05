import { describe, expect, it } from 'vitest';
import type { ComboId, LineScore, MythScore } from '@/core/types';
import { moveLook } from '@/game/night/impact';

const line = (combo: ComboId): LineScore => ({ combo }) as LineScore;
const look = (combos: ComboId[], myths = 0) => moveLook({ lines: combos.map(line), myths: Array.from({ length: myths }, () => ({}) as MythScore) });

describe('характер удара', () => {
  it('обычная линия рассыпается в пыль', () => {
    for (const combo of ['pair', 'triple', 'straight', 'flush', 'cascade'] as ComboId[]) expect(look([combo])).toBe('nova');
  });

  it('сильная комбинация открывает чёрную дыру', () => {
    for (const combo of ['quartet', 'starFlush', 'supernova'] as ComboId[]) expect(look([combo])).toBe('hole');
  });

  it('крест и миф открывают чёрную дыру', () => {
    expect(look(['pair', 'pair'])).toBe('hole');
    expect(look([], 1)).toBe('hole');
  });
});
