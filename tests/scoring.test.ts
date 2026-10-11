import { describe, expect, it } from 'vitest';
import { placeCard, burnCard } from '../src/core/night';
import type { GameEvent } from '../src/core/types';
import { nightRun, setGrid, setHand } from './helpers';

const ignite = (events: GameEvent[]) => events.find((e) => e.t === 'ignite') as Extract<GameEvent, { t: 'ignite' }>;

describe('подсчёт линии', () => {
  it('пара: (10 + сумма рангов) × 2', () => {
    const run = nightRun();
    setGrid(run, { 0: '3s', 1: '3m', 2: '7t' });
    setHand(run, '9c');
    const ev = ignite(placeCard(run, 0, 3));
    expect(ev.score.lines[0]!.combo).toBe('pair');
    expect(ev.score.total).toBe((10 + 3 + 3 + 7 + 9) * 2);
    expect(run.night!.grid.slice(0, 4)).toEqual([null, null, null, null]);
  });

  it('крест удваивает сумму двух линий', () => {
    const run = nightRun();
    setGrid(run, { 0: '1s', 1: '4m', 2: '7t', 7: '2m', 11: '5t', 15: '8c' });
    setHand(run, '9c');
    const ev = ignite(placeCard(run, 0, 3));
    expect(ev.score.lines).toHaveLength(2);
    const row = (5 + 1 + 4 + 7 + 9) * 1;
    const col = (5 + 9 + 2 + 5 + 8) * 1;
    expect(ev.score.total).toBe((row + col) * 2);
    expect(run.stats.crosses).toBe(1);
  });

  it('глифы: Сияние, Пламя, Эхо, Стекло', () => {
    const run = nightRun({ seed: 3 });
    setGrid(run, { 0: '1s*radiant', 1: '4m*blazing', 2: '7t*echo' });
    setHand(run, '9c');
    const ev = ignite(placeCard(run, 0, 3));
    // свет: 5 + 1 + 30 + 4 + 7 + 7 + 9 = 63, множ.: 1 + 4 = 5
    expect(ev.score.total).toBe(63 * 5);
  });

  it('Знамения добавляют множитель в порядке слотов', () => {
    const run = nightRun({ omens: ['stardust', 'glassCannon'] });
    setGrid(run, { 0: '1s', 1: '4m', 2: '7t' });
    setHand(run, '9c');
    const ev = ignite(placeCard(run, 0, 3));
    // (5+21) × ((1 + 4) × 3)
    expect(ev.score.total).toBe(26 * 15);
  });

  it('обратный порядок слотов даёт меньше', () => {
    const run = nightRun({ omens: ['glassCannon', 'stardust'] });
    setGrid(run, { 0: '1s', 1: '4m', 2: '7t' });
    setHand(run, '9c');
    expect(ignite(placeCard(run, 0, 3)).score.total).toBe(26 * 7);
  });

  it('Затмение масти: карты не дают света', () => {
    const run = nightRun({ nightIndex: 2, boss: 'eclipse-sun' });
    setGrid(run, { 0: '1s', 1: '4m', 2: '7s' });
    setHand(run, '9c');
    expect(ignite(placeCard(run, 0, 3)).score.total).toBe(5 + 4 + 9);
  });

  it('Импульс растёт от хода к ходу', () => {
    const run = nightRun({ omens: ['momentum'] });
    setGrid(run, { 0: '1s', 1: '4m', 2: '7t', 4: '1s', 5: '4m', 6: '7t' });
    setHand(run, '9c 9m');
    const a = ignite(placeCard(run, 0, 3)).score.total;
    run.night!.hand = [run.night!.hand.find((c) => c.rank === 9)!, ...run.night!.hand];
    const b = ignite(placeCard(run, 0, 7)).score.total;
    expect(a).toBe(26 * 3);
    expect(b).toBe(26 * 5);
  });

  it('сжигание добирает карту и тратит заряд', () => {
    const run = nightRun();
    const before = run.night!.hand.length;
    burnCard(run, 0);
    expect(run.night!.hand).toHaveLength(before);
    expect(run.night!.burnsLeft).toBe(2);
  });
});
