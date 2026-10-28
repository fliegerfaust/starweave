import { afterEach, describe, expect, it } from 'vitest';
import { newRun } from '../src/core/run';
import { COMET_RANK, rollComet, takeComet, type CometTrade } from '../src/core/wonders';
import { LINEAR } from './helpers';

/** Обмен ранга в Кометe (CM, отзыв Андрея 28.10): никогда не перестановка двух карт. */
type Shift = Extract<CometTrade, { e: 'rankShift' }>;

function shifts(mode: 'pour' | 'gain', seeds: number): { run: ReturnType<typeof newRun>; t: Shift }[] {
  COMET_RANK.mode = mode;
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

afterEach(() => {
  COMET_RANK.mode = 'pour';
});

describe('Комета: обмен ранга (CM)', () => {
  for (const mode of ['pour', 'gain'] as const) {
    it(`${mode}: обмен встречается и не сводится к перестановке карт`, () => {
      const all = shifts(mode, 60);
      expect(all.length).toBeGreaterThan(20);
      for (const { run, t } of all) {
        const up = run.deck.find((c) => c.id === t.up)!;
        const down = run.deck.find((c) => c.id === t.down)!;
        expect(up.id).not.toBe(down.id);
        const upTo = up.rank + t.gain!;
        const downTo = down.rank - t.loss!;
        expect(upTo).toBeLessThanOrEqual(9);
        expect(downTo).toBeGreaterThanOrEqual(1);
        // Перестановка: та же масть, и ранги просто поменялись местами
        const swap = up.suit === down.suit && upTo === down.rank && downTo === up.rank;
        expect(swap, `${up.rank}${up.suit} ↔ ${down.rank}${down.suit}`).toBe(false);
        if (mode === 'pour') expect(up.rank).toBeGreaterThan(down.rank);
        else expect(t.gain! - t.loss!).toBe(1);
      }
    });
  }

  it('обмен применяется: ранги меняются ровно на прибавку и потерю', () => {
    const { run, t } = shifts('gain', 5)[0]!;
    const up = run.deck.find((c) => c.id === t.up)!;
    const down = run.deck.find((c) => c.id === t.down)!;
    const [u, d] = [up.rank, down.rank];
    takeComet(run, t);
    expect(run.deck.find((c) => c.id === t.up)!.rank).toBe(u + 3);
    expect(run.deck.find((c) => c.id === t.down)!.rank).toBe(d - 2);
  });

  it('старое сохранение без прибавки и потери: ±2, как раньше', () => {
    const { run, t } = shifts('pour', 5)[0]!;
    const up = run.deck.find((c) => c.id === t.up)!;
    const u = up.rank;
    takeComet(run, { e: 'rankShift', up: t.up, down: t.down });
    expect(run.deck.find((c) => c.id === t.up)!.rank).toBe(u + 2);
  });
});
