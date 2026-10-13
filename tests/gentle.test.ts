import { describe, expect, it } from 'vitest';
import { playNight, shopGreedy } from '../src/core/ai/bot';
import { GENTLE_NIGHT } from '../src/core/content/balance';
import { cardHelpfulness, startNight } from '../src/core/night';
import { collectReward, leaveShop, newRun } from '../src/core/run';
import { serializeRun } from '../src/core/save';

describe('щедрая первая ночь', () => {
  it('меньше ходов и цель ниже — только в первой ночи', () => {
    const run = newRun({ seed: 3, gentle: true });
    startNight(run);
    expect(run.night!.gentle).toBe(true);
    expect(run.night!.movesLeft).toBe(GENTLE_NIGHT.moves);
    expect(run.night!.target).toBe(GENTLE_NIGHT.target);
    playNight(run);
    if (run.phase !== 'reward') return;
    collectReward(run);
    shopGreedy(run);
    leaveShop(run);
    startNight(run);
    expect(run.night!.gentle).toBeUndefined();
    expect(run.night!.movesLeft).toBe(18);
  });

  it('вызов дня не подыгрывает никому', () => {
    const run = newRun({ seed: 3, gentle: true, daily: true, dailyDate: '2026-10-13' });
    startNight(run);
    expect(run.night!.gentle).toBeUndefined();
  });

  it('добор детерминирован сидом', () => {
    const a = newRun({ seed: 11, gentle: true });
    const b = newRun({ seed: 11, gentle: true });
    startNight(a);
    startNight(b);
    playNight(a, 0);
    playNight(b, 0);
    expect(serializeRun(a)).toBe(serializeRun(b));
  });

  it('рука складывается лучше обычной', () => {
    // Средняя «полезность» стартовой руки: совпадения рангов и мастей между картами
    const score = (gentle: boolean) => {
      let sum = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const run = newRun({ seed, gentle });
        startNight(run);
        const n = run.night!;
        for (const card of n.hand) {
          const rest = { ...n, hand: n.hand.filter((h) => h !== card) };
          sum += cardHelpfulness(rest, card);
        }
      }
      return sum;
    };
    expect(score(true)).toBeGreaterThan(score(false) * 1.3);
  });
});
