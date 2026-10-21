import { describe, expect, it } from 'vitest';
import { SpriteCache } from '../src/art/sprite-cache';

const canvas = () => ({ width: 10, height: 10 }) as HTMLCanvasElement;

describe('кэш спрайтов (TD.14)', () => {
  it('вытесняет самый давний и освобождает его буфер', () => {
    const cache = new SpriteCache(2);
    const a = canvas();
    cache.set('a', a);
    cache.set('b', canvas());
    cache.get('a'); // a свежее b
    cache.set('c', canvas());
    expect(cache.size).toBe(2);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(a);
    cache.set('d', canvas());
    cache.set('e', canvas());
    expect(a.width).toBe(0);
  });
});
