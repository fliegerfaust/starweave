import { describe, expect, it } from 'vitest';
import { newRun } from '../src/core/run';
import { rollComet, takeComet, type CometTrade } from '../src/core/wonders';
import { LINEAR } from './helpers';

/** Обмен ранга в Комете — «переливание» (CM, отзыв Андрея 28.10): никогда не перестановка карт. */
type Shift = Extract<CometTrade, { e: 'rankShift' }>;

function shifts(seeds: number): { run: ReturnType<typeof newRun>; t: Shift }[] {
  const out: { run: ReturnType<typeof newRun>; t: Shift }[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const run = newRun({ seed, unlocks: LINEAR });
    run.gold = 30;
    for (let i = 0; i < 4; i++) {
      const t = rollComet(run).find((x): x is Shift => x.e === 'rankShift');
      if (t) out.push({ run, t });
    }
  }
  return out;
}

describe('Комета: обмен ранга (CM)', () => {
  it('растёт старшая карта пары, младшая отдаёт ей 2; перестановки не бывает', () => {
    const all = shifts(60);
    expect(all.length).toBeGreaterThan(20);
    let sameSuit = 0;
    for (const { run, t } of all) {
      const up = run.deck.find((c) => c.id === t.up)!;
      const down = run.deck.find((c) => c.id === t.down)!;
      expect(up.id).not.toBe(down.id);
      expect(up.rank).toBeGreaterThan(down.rank);
      expect(up.rank + 2).toBeLessThanOrEqual(9);
      expect(down.rank - 2).toBeGreaterThanOrEqual(1);
      const swap = up.suit === down.suit && up.rank + 2 === down.rank && down.rank - 2 === up.rank;
      expect(swap).toBe(false);
      if (up.suit === down.suit) sameSuit++;
    }
    // Пара почти всегда одной масти: «3 Солнца отдаёт 5 Солнца»
    expect(sameSuit / all.length).toBeGreaterThan(0.9);
  });

  it('обмен применяется: +2 старшей, −2 младшей', () => {
    const { run, t } = shifts(5)[0]!;
    const up = run.deck.find((c) => c.id === t.up)!.rank;
    const down = run.deck.find((c) => c.id === t.down)!.rank;
    takeComet(run, t);
    expect(run.deck.find((c) => c.id === t.up)!.rank).toBe(up + 2);
    expect(run.deck.find((c) => c.id === t.down)!.rank).toBe(down - 2);
  });
});
