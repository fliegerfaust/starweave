import { describe, expect, it } from 'vitest';
import { giftGreedy } from '../src/core/ai/bot';
import { choose, currentChoice, skipChoice } from '../src/core/choices';
import { apply, newLoggedRun, replay } from '../src/core/commands';
import { GIFT_SKIP_GOLD } from '../src/core/content/balance';
import { allContent, baseContent } from '../src/core/content/pools';
import { rollGift } from '../src/core/gift';
import { collectReward, newRun } from '../src/core/run';
import { deserializeRun, serializeRun } from '../src/core/save';
import type { RunState } from '../src/core/types';

/** Забег на экране награды: ночь будто бы выиграна. */
function rewardRun(seed = 5, unlocks = { ...allContent(), routes: false }): RunState {
  const run = newRun({ seed, unlocks });
  run.phase = 'reward';
  run.reward = { base: 3, moves: 0, burns: 0, interest: 0, total: 3 };
  return run;
}

describe('дар ночи (GF.1)', () => {
  it('после победной ночи — три варианта в очереди раньше лавки', () => {
    const run = rewardRun();
    collectReward(run);
    const choice = currentChoice(run);
    expect(choice?.kind).toBe('gift');
    expect(choice!.options).toHaveLength(3);
    expect(run.phase).toBe('shop');
  });

  it('варианты: глиф, тело и Возвышение; без открытых тел — второй глиф другого вида', () => {
    const opts = rollGift(newRun({ seed: 9, unlocks: allContent() }));
    expect(opts[0]).toMatchObject({ k: 'card', card: { glyph: expect.any(String) } });
    expect(opts[1]).toMatchObject({ k: 'card', card: { body: expect.any(String) } });
    expect(opts[2]!.k).toBe('ascend');
    for (let seed = 1; seed < 40; seed++) {
      const [a, b] = rollGift(newRun({ seed, unlocks: { ...allContent(), bodies: [] } }));
      expect(a!.k === 'card' && b!.k === 'card' && a!.card.glyph !== b!.card.glyph).toBe(true);
    }
  });

  it('один сид — один дар', () => {
    expect(rollGift(newRun({ seed: 77 }))).toEqual(rollGift(newRun({ seed: 77 })));
  });

  it('взятая карта ложится в колоду с новым id, Возвышение поднимает ранг', () => {
    const run = rewardRun();
    collectReward(run);
    const size = run.deck.length;
    const next = run.nextCardId;
    choose(run, 0);
    expect(run.deck).toHaveLength(size + 1);
    expect(run.deck.at(-1)!.id).toBe(next);
    const up = rewardRun(5);
    collectReward(up);
    const gift = currentChoice(up)!;
    if (gift.kind !== 'gift') throw new Error('ждали дар');
    const offer = gift.options[2]!;
    if (offer.k !== 'ascend') throw new Error('ждали Возвышение');
    const before = up.deck.find((c) => c.id === offer.cardId)!.rank;
    choose(up, 2);
    expect(up.deck.find((c) => c.id === offer.cardId)!.rank).toBe(before + 1);
    expect(up.deck).toHaveLength(size);
  });

  it('«чистое небо» — золото, колода прежняя', () => {
    const run = rewardRun();
    collectReward(run);
    const gold = run.gold;
    const size = run.deck.length;
    skipChoice(run);
    expect(run.gold).toBe(gold + GIFT_SKIP_GOLD);
    expect(run.deck).toHaveLength(size);
    expect(run.pending).toEqual([]);
  });

  it('нет дара: ступень не открыта, обучение', () => {
    const run = rewardRun(5, { ...allContent(), gift: false, routes: false });
    collectReward(run);
    expect(run.pending).toEqual([]);
    const tut = rewardRun();
    tut.tutorial = true;
    collectReward(tut);
    expect(tut.pending).toEqual([]);
  });

  it('вызов дня: дар есть у всех, небесных тел нет', () => {
    expect(baseContent().gift).toBe(true);
    expect(baseContent().bodies).toEqual([]);
  });

  it('дар в сохранении переживает перезапуск; битый вариант — сохранение не открывается', () => {
    const run = rewardRun();
    collectReward(run);
    const back = deserializeRun(serializeRun(run))!;
    expect(back.pending).toEqual(run.pending);
    const broken = { ...run, pending: [{ kind: 'gift', options: [{ k: 'card', card: { suit: 'sun', rank: 4, body: 'quasar' } }] }] };
    expect(deserializeRun(JSON.stringify(broken))).toBeNull();
  });

  it('журнал с выбором дара переигрывается', () => {
    const run = newLoggedRun({ seed: 31, unlocks: allContent() });
    run.phase = 'reward';
    run.reward = { base: 3, moves: 0, burns: 0, interest: 0, total: 3 };
    // Награду «выиграли» в обход журнала — переигрываем только Обсерваторию
    apply(run, { c: 'collectReward' });
    apply(run, { c: 'choose', index: 1 });
    const log = structuredClone(run.log!);
    const again = newLoggedRun(log.start);
    again.phase = 'reward';
    again.reward = { base: 3, moves: 0, burns: 0, interest: 0, total: 3 };
    for (const cmd of log.cmds) apply(again, cmd);
    expect(again.deck).toEqual(run.deck);
    expect(replay({ ...log, version: 1 })).toBeNull();
  });

  it('бот решает дар: берёт или пропускает, очередь пуста', () => {
    for (let seed = 1; seed < 20; seed++) {
      const run = rewardRun(seed);
      collectReward(run);
      giftGreedy(run);
      expect(run.pending).toEqual([]);
    }
  });
});
