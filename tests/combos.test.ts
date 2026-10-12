import { describe, expect, it } from 'vitest';
import { evaluateCombo } from '../src/core/combos';
import { cards } from './helpers';
import { COMBO_EXAMPLES } from '../src/core/content/combos';
import { COMBO_IDS } from '../src/core/types';

const ev = (codes: string, flushSlack = 0, straightGaps = 0) =>
  evaluateCombo(cards(codes), { flushSlack, straightGaps });

describe('evaluateCombo', () => {
  it.each([
    ['1s 4m 7t 9c', 'scatter'],
    ['3s 3m 7t 9c', 'pair'],
    ['3s 3m 7t 7c', 'twoPair'],
    ['3s 7m 7t 3c', 'mirror'],
    ['5s 5m 5t 9c', 'triple'],
    ['4s 6m 5t 7c', 'straight'],
    ['4s 5m 6t 7c', 'cascade'],
    ['9s 8m 7t 6c', 'cascade'],
    ['1s 4s 7s 9s', 'flush'],
    ['6s 6m 6t 6c', 'quartet'],
    ['4s 6s 5s 7s', 'starFlush'],
    ['4s 5s 6s 7s', 'supernova'],
  ])('%s → %s', (codes, combo) => {
    expect(ev(codes)).toBe(combo);
  });

  it('Призма считается любой мастью', () => {
    expect(ev('1s 4s*prism 7s 9s')).toBe('flush');
    expect(ev('1m 4s*prism 7m 9m')).toBe('flush');
  });

  it('послабление флеша на одну карту', () => {
    expect(ev('1s 4s 7s 9m')).toBe('scatter');
    expect(ev('1s 4s 7s 9m', 1)).toBe('flush');
  });

  it('стрит с пропуском', () => {
    expect(ev('3s 4m 6t 7c')).toBe('scatter');
    expect(ev('3s 4m 6t 7c', 0, 1)).toBe('cascade');
  });

  it('короткие линии из трёх карт', () => {
    expect(ev('2s 3m 4t')).toBe('cascade');
    expect(ev('2s 2m 2t')).toBe('triple');
    expect(ev('2s 5s 9s')).toBe('flush');
    expect(ev('2s 2m 9t')).toBe('pair');
  });

  it('зеркало из пяти', () => {
    expect(ev('1s 2m 5t 2c 1m')).toBe('mirror');
  });
});

describe('примеры созвездий для справочника', () => {
  it('каждый пример даёт своё созвездие', () => {
    for (const id of COMBO_IDS) {
      const cards = COMBO_EXAMPLES[id].map(([rank, suit], i) => ({ id: i, rank, suit }));
      expect(evaluateCombo(cards), id).toBe(id);
    }
  });
});
