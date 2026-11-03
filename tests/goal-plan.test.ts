import { describe, expect, it } from 'vitest';
import { SKY_FIGURES } from '@/art/constellations';
import { figureFor, goalVariantFor, lightOrder } from '@/game/night/goal-plan';

describe('цель на сцене (GO.3)', () => {
  it('обычная ночь — созвездие, ночь Затмения — Затмение', () => {
    expect(goalVariantFor('dusk')).toBe('figure');
    expect(goalVariantFor('midnight')).toBe('figure');
    expect(goalVariantFor('eclipse')).toBe('eclipse');
  });

  it('созвездие ночи одно для сида и разное в соседних ночах', () => {
    expect(figureFor(4242, 2, 'dusk')).toBe(figureFor(4242, 2, 'dusk'));
    expect(figureFor(4242, 2, 'dusk')).not.toBe(figureFor(4242, 2, 'midnight'));
    expect(figureFor(-7, 1, 'dusk')).toBeDefined();
  });

  it('звёзды загораются цепочкой: каждая следующая связана линией с уже горящей', () => {
    for (const f of SKY_FIGURES) {
      const order = lightOrder(f);
      expect([...order].sort((a, b) => a - b)).toEqual(f.stars.map((_, i) => i));
      order.slice(1).forEach((star, k) => {
        const before = new Set(order.slice(0, k + 1));
        expect(f.lines.some(([a, b]) => (a === star && before.has(b)) || (b === star && before.has(a)))).toBe(true);
      });
    }
  });

});
