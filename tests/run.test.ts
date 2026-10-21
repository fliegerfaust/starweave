import { describe, expect, it } from 'vitest';
import { playNight, shopGreedy } from '../src/core/ai/bot';
import { startNight } from '../src/core/night';
import { collectReward, leaveShop, newRun } from '../src/core/run';
import { deserializeRun, serializeRun } from '../src/core/save';
import { banishCard, banishServicePrice, buyItem, buyPack, choosePack, reroll, sellOmen } from '../src/core/shop';
import { createOmen } from '../src/core/omen-instance';
import { OMEN_LIST } from '../src/core/content/omens';
import { BOSS_LIST } from '../src/core/content/bosses';
import { SKY_LIST } from '../src/core/content/skies';
import { RITUAL_LIST } from '../src/core/content/rituals';

describe('забег', () => {
  it('одинаковый сид — одинаковый забег', () => {
    const a = newRun({ seed: 42 });
    const b = newRun({ seed: 42 });
    startNight(a);
    startNight(b);
    playNight(a, 0);
    playNight(b, 0);
    expect(serializeRun(a)).toBe(serializeRun(b));
  });

  it('сохранение переживает JSON', () => {
    const run = newRun({ seed: 5 });
    startNight(run);
    const back = deserializeRun(serializeRun(run))!;
    expect(back.night!.hand).toEqual(run.night!.hand);
    expect(deserializeRun('мусор')).toBeNull();
  });

  it('полный цикл: ночь → награда → Обсерватория → следующая ночь', () => {
    const run = newRun({ seed: 11 });
    startNight(run);
    playNight(run, 0);
    expect(['reward', 'gameOver']).toContain(run.phase);
    if (run.phase === 'reward') {
      const gold = run.gold + run.reward!.total;
      collectReward(run);
      expect(run.gold).toBe(gold);
      expect(run.shop!.omens).toHaveLength(2);
      leaveShop(run);
      expect(run.phase).toBe('map');
      expect(run.chapter.at).toBe(1);
    }
  });

  it('услуга «Убрать карту»: раз за визит и не ниже минимума колоды', () => {
    const run = newRun({ seed: 3 });
    run.phase = 'shop';
    run.gold = 10;
    run.shop = { omens: [], items: [], packs: [], rerollCost: 5, openPack: null };
    const size = run.deck.length;
    const price = banishServicePrice(run)!;
    banishCard(run, run.deck[0]!.id);
    expect(run.deck).toHaveLength(size - 1);
    expect(run.gold).toBe(10 - price);
    expect(banishServicePrice(run)).toBeNull();
    expect(() => banishCard(run, run.deck[0]!.id)).toThrow();
    run.shop.banishUsed = false;
    run.deck = run.deck.slice(0, 20);
    expect(banishServicePrice(run)).toBeNull();
  });

  it('продажа, переброс и ритуал в Обсерватории', () => {
    const run = newRun({ seed: 2 });
    run.phase = 'shop';
    run.gold = 100;
    run.omens.push(createOmen(run, 'stardust'));
    run.shop = { omens: [], items: [{ kind: 'ritual', ritualId: 'ascend', price: 3, sold: false }], packs: [], rerollCost: 5, openPack: null };
    const target = run.deck.find((c) => c.rank === 3)!;
    buyItem(run, 0, [target.id]);
    expect(run.deck.find((c) => c.id === target.id)!.rank).toBe(4);
    sellOmen(run, run.omens[0]!.uid);
    expect(run.omens).toHaveLength(0);
    reroll(run);
    expect(run.shop!.rerollCost).toBe(6);
  });

  it('пакет: покупка раскрывает варианты, выбор применяет', () => {
    const run = newRun({ seed: 9 });
    run.phase = 'shop';
    run.gold = 50;
    run.shop = { omens: [], items: [], packs: [{ kind: 'pack', pack: 'omen', price: 6, sold: false }], rerollCost: 5, openPack: null };
    buyPack(run, 0);
    expect(run.gold).toBe(44);
    expect(run.shop.openPack!.options).toHaveLength(3);
    const chosen = run.shop.openPack!.options[1]!;
    choosePack(run, 1);
    expect(run.omens.map((o) => o.id)).toContain(chosen);
    expect(run.shop.openPack).toBeNull();

    run.shop.packs = [{ kind: 'pack', pack: 'chart', price: 4, sold: false }];
    buyPack(run, 0);
    const combo = run.shop.openPack!.options[0]! as 'pair';
    const before = run.comboLevels[combo];
    choosePack(run, 0);
    expect(run.comboLevels[combo]).toBe(before + 1);
  });

  it('у каждого Знамения, Затмения, ритуала и неба уникальный id', () => {
    for (const list of [OMEN_LIST, BOSS_LIST, RITUAL_LIST, SKY_LIST]) {
      const ids = list.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('фаззинг: бот проходит много забегов без исключений', () => {
  it.each(SKY_LIST.map((s) => s.id))('небо %s', (skyId) => {
    for (let seed = 1; seed <= 4; seed++) {
      const run = newRun({ seed: seed * 977, skyId });
      // Даём всем Знамениям поработать: случайный набор на старте.
      for (let i = 0; i < 5; i++) run.omens.push(createOmen(run, OMEN_LIST[(seed * 7 + i * 5) % OMEN_LIST.length]!.id));
      run.omens = run.omens.slice(0, 5);
      let guard = 0;
      while (run.phase !== 'gameOver' && run.phase !== 'victory' && guard++ < 40) {
        if (run.phase === 'map') startNight(run);
        if (run.phase === 'night') playNight(run, 0);
        if (run.phase === 'reward') collectReward(run);
        if (run.phase === 'shop') {
          shopGreedy(run);
          leaveShop(run);
        }
      }
      expect(['gameOver', 'victory']).toContain(run.phase);
    }
  });
});
