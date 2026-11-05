import { describe, expect, it } from 'vitest';
import type { ComboId, LineScore, MythScore } from '@/core/types';
import { damageParts, moveLook } from '@/game/night/impact';
import { num } from '@/i18n';

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

describe('счёт', () => {
  it('не показывает минус у нуля', () => {
    expect(num(-0.3)).toBe('0');
  });
});

describe('урон по линиям', () => {
  it('делит итог хода по вкладу линий', () => {
    expect(damageParts([100, 300], 800)).toEqual([200, 600]);
  });

  it('линии без очков делят итог поровну', () => {
    expect(damageParts([0, 0], 10)).toEqual([5, 5]);
  });
});
