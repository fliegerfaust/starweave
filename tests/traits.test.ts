import { afterEach, describe, expect, it } from 'vitest';
import { TRAITS } from '../src/core/content/traits';
import { cardSuits } from '../src/core/deck';
import { placeCard } from '../src/core/night';
import { GLYPHS, SUITS, type GameEvent } from '../src/core/types';
import { c, nightRun, setGrid, setHand } from './helpers';

const ignite = (events: GameEvent[]) => events.find((e) => e.t === 'ignite') as Extract<GameEvent, { t: 'ignite' }>;
const radiant = TRAITS.radiant.onScored;
afterEach(() => (TRAITS.radiant.onScored = radiant));

describe('черты карты (TD.4)', () => {
  it('у каждого глифа есть черта с ценой ритуала', () => {
    for (const g of GLYPHS) {
      expect(TRAITS[g].id).toBe(g);
      expect(TRAITS[g].inscribePrice).toBeGreaterThan(0);
    }
  });

  it('подсчёт берёт вклад черты из реестра и подписывает шаг глифом', () => {
    const play = () => {
      const run = nightRun();
      setGrid(run, { 0: '3s*radiant', 1: '3m', 2: '7t' });
      setHand(run, '9c');
      return ignite(placeCard(run, 0, 3)).score;
    };
    const before = play();
    const step = before.lines[0]!.steps.find((s) => s.source.kind === 'glyph');
    expect(step).toMatchObject({ source: { kind: 'glyph', cell: 0, glyph: 'radiant' }, light: 30 });
    TRAITS.radiant.onScored = (ctx) => ctx.light(100);
    expect(play().total).toBe(before.total + 70 * 2);
  });

  it('Призма носит все масти', () => {
    expect(cardSuits(c('5s*prism'))).toEqual(SUITS);
    expect(cardSuits(c('5s'))).toEqual(['sun']);
  });
});
