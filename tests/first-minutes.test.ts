import { LINEAR } from './helpers';
import { describe, expect, it } from 'vitest';
import { playNight, shopGreedy } from '../src/core/ai/bot';
import { GENTLE_NIGHT } from '../src/core/content/balance';
import { cardHelpfulness, startNight } from '../src/core/night';
import { GIFT_GOLD_CAP, collectReward, leaveShop, newRun } from '../src/core/run';
import { serializeRun } from '../src/core/save';
import { COLLECTIBLE_COMBOS, emptyProfile, recordDiscoveries } from '../src/meta/profile';

describe('щедрая первая ночь', () => {
  it('меньше ходов и цель ниже — только в первой ночи', () => {
    const run = newRun({ seed: 3, gentle: true, unlocks: LINEAR });
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
    // Ходы — по правилам (Знамение из лавки может их добавить), щедрых 12 больше нет
    expect(run.night!.movesLeft).toBe(run.night!.rules.moves);
    expect(run.night!.movesLeft).toBeGreaterThanOrEqual(18);
  });

  it('вызов дня не подыгрывает никому', () => {
    const run = newRun({ seed: 3, gentle: true, daily: true, dailyDate: '2026-10-13', unlocks: LINEAR });
    startNight(run);
    expect(run.night!.gentle).toBeUndefined();
  });

  it('добор детерминирован сидом', () => {
    const a = newRun({ seed: 11, gentle: true, unlocks: LINEAR });
    const b = newRun({ seed: 11, gentle: true, unlocks: LINEAR });
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
        const run = newRun({ seed, gentle, unlocks: LINEAR });
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

describe('коллекция созвездий', () => {
  it('новое — один раз, Россыпь не считается, первый крест отдельно', () => {
    const p = emptyProfile();
    expect(recordDiscoveries(p, ['scatter'], 1)).toEqual({ combos: [], cross: false, myths: [] });
    expect(recordDiscoveries(p, ['flush', 'pair'], 2)).toEqual({ combos: ['flush', 'pair'], cross: true, myths: [] });
    expect(recordDiscoveries(p, ['pair', 'pair', 'triple'], 2)).toEqual({ combos: ['triple'], cross: false, myths: [] });
    expect(p.combosFound).toEqual(['flush', 'pair', 'triple']);
    expect(COLLECTIBLE_COMBOS).toHaveLength(10);
  });
});

describe('подарок обучения', () => {
  it('золото переходит в первый забег, но не в вызов дня', () => {
    const run = newRun({ seed: 5, gentle: true, gift: { gold: 9 } });
    expect(run.gold).toBe(9);
    expect(run.omens).toHaveLength(0);
    expect(newRun({ seed: 5, gift: { gold: 99 } }).gold).toBe(GIFT_GOLD_CAP);
    expect(newRun({ seed: 5, daily: true, dailyDate: '2026-10-14', gift: { gold: 9 } }).gold).toBe(4);
  });
});
