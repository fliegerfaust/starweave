import { describe, expect, it } from 'vitest';
import { apply } from '../src/core/commands';
import { createOmen } from '../src/core/omen-instance';
import { newRun } from '../src/core/run';
import { buyOmen, buyPack, omenSlots, sellPrice } from '../src/core/shop';
import type { RunState } from '../src/core/types';
import { LINEAR } from './helpers';

/** Замена Знамения при полном ряде (OB, отзыв Андрея 28.10). */
function fullShop(gold: number): RunState {
  const run = newRun({ seed: 3, unlocks: LINEAR });
  run.phase = 'shop';
  run.gold = gold;
  for (const id of ['horizon', 'pillar', 'stardust', 'lowTide', 'miser']) run.omens.push(createOmen(run, id));
  expect(run.omens).toHaveLength(omenSlots(run));
  run.shop = { omens: [{ kind: 'omen', omenId: 'tripod', price: 7, sold: false }], items: [], packs: [{ kind: 'pack', pack: 'omen', price: 4, sold: false }], rerollCost: 5 };
  return run;
}

describe('замена Знамения при полном ряде (OB)', () => {
  it('без замены купить нельзя, с заменой новое встаёт на место проданного', () => {
    const run = fullShop(10);
    expect(() => buyOmen(run, 0)).toThrow();
    const old = run.omens[2]!;
    const ids = run.omens.map((o) => o.id);
    buyOmen(run, 0, old.uid);
    expect(run.omens.map((o) => o.id)).toEqual([...ids.slice(0, 2), 'tripod', ...ids.slice(3)]);
    expect(run.gold).toBe(10 + sellPrice(old.id) - 7);
    expect(run.shop!.omens[0]!.sold).toBe(true);
  });

  it('цена продажи идёт в оплату: не хватает без неё — хватает с ней', () => {
    const victim = fullShop(0).omens[0]!;
    const gold = 7 - sellPrice(victim.id);
    const run = fullShop(gold);
    buyOmen(run, 0, run.omens[0]!.uid);
    expect(run.gold).toBe(0);
    const poor = fullShop(gold - 1);
    expect(() => buyOmen(poor, 0, poor.omens[0]!.uid)).toThrow();
    // Отказ ничего не меняет
    expect(poor.omens).toHaveLength(5);
    expect(poor.gold).toBe(gold - 1);
    expect(poor.shop!.omens[0]!.sold).toBe(false);
  });

  it('чужой uid — ошибка, ряд не тронут', () => {
    const run = fullShop(20);
    expect(() => buyOmen(run, 0, 99_999)).toThrow();
    expect(run.omens).toHaveLength(5);
    expect(run.gold).toBe(20);
  });

  it('пакет Знамений при полном ряде: покупается, выбор с заменой ставит новое на место старого', () => {
    const run = fullShop(10);
    buyPack(run, 0);
    const choice = run.pending[0]!;
    expect(choice.kind).toBe('pack');
    expect(() => apply(run, { c: 'choose', index: 0 })).toThrow();
    const old = run.omens[4]!;
    const option = (choice as { options: string[] }).options[0]!;
    apply(run, { c: 'choose', index: 0, replace: old.uid });
    expect(run.omens[4]!.id).toBe(option);
    expect(run.omens).toHaveLength(5);
    expect(run.gold).toBe(10 - 4 + sellPrice(old.id));
    expect(run.pending).toHaveLength(0);
  });

  it('команда buyOmen с заменой проходит через apply', () => {
    const run = fullShop(10);
    apply(run, { c: 'buyOmen', slot: 0, replace: run.omens[1]!.uid });
    expect(run.omens[1]!.id).toBe('tripod');
  });
});
