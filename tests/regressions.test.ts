import { describe, expect, it } from 'vitest';
import { apply } from '../src/core/commands';
import { buildRules } from '../src/core/rules';
import { newRun } from '../src/core/run';
import { createOmen } from '../src/core/omen-instance';
import { buyItem, buyPack } from '../src/core/shop';
import { RuleError } from '../src/core/errors';
import { emptyProfile, recordRunEnd } from '../src/meta/profile';
import { placeCard } from '../src/core/night';
import { nightRun, setGrid, setHand, LINEAR } from './helpers';

describe('регрессии ревью', () => {
  it('Безмолвие и Тяготение не отменяются Знамениями', () => {
    const run = newRun({ seed: 1, unlocks: LINEAR });
    run.omens.push(createOmen(run, 'pyre'), createOmen(run, 'diagonalSight'));
    expect(buildRules(run, 'silence').burns).toBe(0);
    const g = buildRules(run, 'gravity');
    expect(g.rowsIgnite).toBe(false);
    expect(g.diagonals).toBe(false);
  });

  it('пакет Знамений при полном ряде не съедает золото даром: взять можно заменой своего (OB)', () => {
    const run = newRun({ seed: 2, unlocks: LINEAR });
    run.phase = 'shop';
    run.gold = 50;
    for (const id of ['stardust', 'pyre', 'abacus', 'miser', 'horizon']) run.omens.push(createOmen(run, id));
    run.shop = { omens: [], items: [], packs: [{ kind: 'pack', pack: 'omen', price: 6, sold: false }], rerollCost: 5 };
    buyPack(run, 0);
    expect(() => apply(run, { c: 'choose', index: 0 })).toThrow(RuleError);
    apply(run, { c: 'choose', index: 0, replace: run.omens[0]!.uid });
    expect(run.omens).toHaveLength(5);
    expect(run.pending).toHaveLength(0);
  });

  it('Изгнание не берёт больше карт, чем можно убрать', () => {
    const run = newRun({ seed: 3, unlocks: LINEAR });
    run.deck = run.deck.slice(0, 21);
    run.phase = 'shop';
    run.gold = 10;
    run.shop = { omens: [], items: [{ kind: 'ritual', ritualId: 'banish', price: 3, sold: false }], packs: [], rerollCost: 5 };
    expect(() => buyItem(run, 0, [run.deck[0]!.id, run.deck[1]!.id])).toThrow(RuleError);
    expect(run.gold).toBe(10);
    buyItem(run, 0, [run.deck[0]!.id]);
    expect(run.deck).toHaveLength(20);
  });

  it('стекло на кресте бросает кубик один раз', () => {
    let broke = 0;
    const trials = 400;
    for (let seed = 1; seed <= trials; seed++) {
      const run = nightRun({ seed });
      setGrid(run, { 0: '1s', 1: '4m', 2: '7t', 7: '2m', 11: '5t', 15: '8c' });
      setHand(run, '9c*glass');
      const events = placeCard(run, 0, 3);
      if (events.some((e) => e.t === 'cardDestroyed')) broke++;
    }
    expect(broke / trials).toBeGreaterThan(0.17);
    expect(broke / trials).toBeLessThan(0.33);
  });

  it('забег после победы не записывается в профиль дважды', () => {
    const p = emptyProfile();
    const run = newRun({ seed: 4, unlocks: LINEAR });
    run.stats.linesIgnited = 100;
    recordRunEnd(p, run, true);
    run.stats.linesIgnited = 130;
    recordRunEnd(p, run, false);
    expect(p.runs).toBe(1);
    expect(p.wins).toBe(1);
    expect(p.totalLines).toBe(130);
  });
});

describe('звёздность', () => {
  it('усложняет цели, ходы и цены, а победа открывает следующую', async () => {
    const { startNight } = await import('../src/core/night');
    const { generateShop } = await import('../src/core/shop');
    const easy = newRun({ seed: 7, unlocks: LINEAR });
    const hard = newRun({ seed: 7, stake: 5, unlocks: LINEAR });
    startNight(easy);
    startNight(hard);
    expect(hard.night!.target).toBe(easy.night!.target * 1.5);
    expect(hard.night!.movesLeft).toBe(easy.night!.movesLeft - 2);
    expect(hard.night!.burnsLeft).toBe(easy.night!.burnsLeft - 1);
    const s1 = generateShop(easy);
    const s2 = generateShop(hard);
    expect(s2.rerollCost).toBe(s1.rerollCost);
    const p = emptyProfile();
    recordRunEnd(p, newRun({ seed: 1, stake: 2, unlocks: LINEAR }), true);
    expect(p.maxStake).toBe(3);
  });
});

describe('награды за рекламу', () => {
  it('второй шанс: +3 хода один раз, удвоение награды раз за созвездие', async () => {
    const { canRevive, reviveNight, canDoubleReward, doubleReward } = await import('../src/core/run');
    const { startNight } = await import('../src/core/night');
    const run = newRun({ seed: 8, unlocks: LINEAR });
    startNight(run);
    run.night!.movesLeft = 1;
    run.night!.target = 1e9;
    const free = run.night!.grid.findIndex((c) => !c);
    placeCard(run, 0, free);
    expect(run.phase).toBe('gameOver');
    expect(canRevive(run)).toBe(true);
    reviveNight(run);
    expect(run.phase).toBe('night');
    expect(run.night!.movesLeft).toBe(3);
    expect(canRevive(run)).toBe(false);

    run.phase = 'reward';
    run.reward = { base: 3, moves: 1, burns: 0, interest: 2, total: 6 };
    doubleReward(run);
    expect(run.reward.total).toBe(12);
    expect(canDoubleReward(run)).toBe(false);
  });
});

describe('второй шанс и профиль', () => {
  it('поражение, затем второй шанс и победа — одна победа в профиле', async () => {
    const { unrecordRunEnd } = await import('../src/meta/profile');
    const p = emptyProfile();
    const run = newRun({ seed: 3, unlocks: LINEAR });
    run.stats.linesIgnited = 10;
    recordRunEnd(p, run, false);
    unrecordRunEnd(p, run);
    run.stats.linesIgnited = 25;
    recordRunEnd(p, run, true);
    expect(p.runs).toBe(1);
    expect(p.wins).toBe(1);
    expect(p.totalLines).toBe(25);
  });
});
