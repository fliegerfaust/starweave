import { describe, expect, it } from 'vitest';
import { SKY_FIGURES, shuffledFigures, starRadius } from '../src/art/constellations';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';

describe('созвездия в щели купола', () => {
  it('линии ссылаются на существующие звёзды, координаты в кадре', () => {
    for (const fig of SKY_FIGURES) {
      for (const [a, b] of fig.lines) {
        expect(fig.stars[a], `${fig.id}: ${a}`).toBeDefined();
        expect(fig.stars[b], `${fig.id}: ${b}`).toBeDefined();
      }
      for (const [x, y] of fig.stars) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(100);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(100);
      }
    }
  });

  it('у каждого созвездия есть название на обоих языках', () => {
    for (const fig of SKY_FIGURES) {
      expect(ru.constellation[fig.id], fig.id).toBeTruthy();
      expect((en.constellation as Record<string, string>)[fig.id], fig.id).toBeTruthy();
    }
  });

  it('перемешанная колода — все созвездия по разу и без повтора на стыке колод', () => {
    const first = shuffledFigures();
    expect(new Set(first).size).toBe(SKY_FIGURES.length);
    for (let i = 0; i < 50; i++) {
      const next = shuffledFigures(Math.random, first[first.length - 1]);
      expect(next[0]).not.toBe(first[first.length - 1]);
    }
  });

  it('яркие звёзды крупнее тусклых', () => {
    expect(starRadius(0)).toBeGreaterThan(starRadius(3));
    expect(starRadius(9)).toBe(0.6);
  });
});
