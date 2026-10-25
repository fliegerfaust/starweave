import { describe, expect, it } from 'vitest';
import { currentNode, isWonder, routeOptions } from '../src/core/route';
import { bestMove } from '../src/core/ai/bot';
import { RULES_VERSION, apply, newLoggedRun, replay, type Command } from '../src/core/commands';
import { omenDef } from '../src/core/content/omens';
import { RuleError } from '../src/core/errors';
import { omenSlots } from '../src/core/shop';
import type { RunState } from '../src/core/types';

/** Бот играет забег только командами: ночи, награда, Знамения и Звёздные карты в лавке. */
function playLogged(seed: number, skyId: string, stake: number): RunState {
  const run = newLoggedRun({ seed, skyId, stake });
  const tryCmd = (cmd: Command) => {
    try {
      apply(run, cmd);
    } catch (e) {
      if (!(e instanceof RuleError)) throw e;
    }
  };
  let guard = 0;
  while (run.phase !== 'gameOver' && run.phase !== 'victory' && guard++ < 400) {
    if (run.phase === 'map') {
      // Развилка (RT.1): путь — тоже команда журнала; чередуем Ночь и Яркую ночь
      if (run.chapter.at < 0) apply(run, { c: 'route', node: routeOptions(run.chapter)[(run.ante + run.chapter.path.length) % routeOptions(run.chapter).length]! });
      // Комета и Телескоп (RT.4): войти, взять первый вариант, который можно, — шаг пройден
      if (isWonder(currentNode(run).route)) {
        apply(run, { c: 'visit' });
        const n = run.pending[0]!.options.length;
        for (let i = 0; i < n && run.pending.length; i++) tryCmd({ c: 'choose', index: i });
        if (run.pending.length) apply(run, { c: 'skip' });
        continue;
      }
      apply(run, { c: 'startNight' });
    }
    while (run.phase === 'night' && run.night?.result === 'playing') {
      const m = bestMove(run, 0);
      if (!m) break;
      apply(run, m.value < 5 && run.night.burnsLeft > 0 ? { c: 'burn', hand: m.handIndex } : { c: 'place', hand: m.handIndex, cell: m.cell });
    }
    if (run.phase === 'reward') apply(run, { c: 'collectReward' });
    if (run.phase === 'shop') {
      const shop = run.shop!;
      // Трофей Затмения: по очереди приручаем и берём Знамение (его — если есть место)
      if (run.pending[0]?.kind === 'trophy') tryCmd({ c: 'choose', index: run.ante % 2 });
      if (run.pending[0]?.kind === 'trophy') tryCmd({ c: 'choose', index: 0 });
      // Дар ночи: по очереди берём первый вариант и пропускаем
      if (run.pending[0]?.kind === 'gift') tryCmd(run.stats.nightsWon % 2 ? { c: 'choose', index: run.stats.nightsWon % 3 } : { c: 'skip' });
      // Знамение Яркой ночи — первое, если есть место
      if (run.pending[0]?.kind === 'pack') tryCmd({ c: 'choose', index: 0 });
      if (run.pending[0]?.kind === 'pack') tryCmd({ c: 'skip' });
      shop.omens
        .map((item, slot) => ({ item, slot }))
        .filter(({ item }) => item.kind === 'omen' && !item.sold)
        .sort((a, b) => (b.item.kind === 'omen' ? omenDef(b.item.omenId).rarity : 0) - (a.item.kind === 'omen' ? omenDef(a.item.omenId).rarity : 0))
        .forEach(({ item, slot }) => run.gold >= item.price && run.omens.length < omenSlots(run) && tryCmd({ c: 'buyOmen', slot }));
      shop.items.forEach((item, slot) => item.kind === 'chart' && run.gold >= item.price && tryCmd({ c: 'buyItem', slot }));
      if (run.omens.length > 1) tryCmd({ c: 'moveOmen', from: 0, to: run.omens.length - 1 });
      if (run.gold > 12) tryCmd({ c: 'reroll' });
      apply(run, { c: 'leaveShop' });
    }
  }
  return run;
}

describe('журнал команд (TD.9)', () => {
  it('переигранный журнал даёт тот же забег', () => {
    for (const [seed, sky, stake] of [[7919, 'classic', 0], [15838, 'twins', 2], [23757, 'abyss', 1], [31676, 'astrolabe', 3]] as const) {
      const run = playLogged(seed, sky, stake);
      expect(run.log!.cmds.length, `${sky}: в журнале есть ходы`).toBeGreaterThan(20);
      const again = replay(JSON.parse(JSON.stringify(run.log)))!;
      expect(again, sky).toEqual(run);
    }
  }, 30_000);

  it('отклонённая команда в журнал не попадает', () => {
    const run = newLoggedRun({ seed: 1 });
    expect(() => apply(run, { c: 'leaveShop' })).toThrow(RuleError);
    // На развилке ночь не начинается, пока путь не выбран
    expect(() => apply(run, { c: 'startNight' })).toThrow(RuleError);
    expect(run.log!.cmds).toEqual([]);
    const night = routeOptions(run.chapter).find((i) => run.chapter.nodes[i]!.route === 'night')!;
    apply(run, { c: 'route', node: night });
    apply(run, { c: 'startNight' });
    expect(run.log!.cmds).toEqual([{ c: 'route', node: night }, { c: 'startNight' }]);
  });

  it('журнал чужой версии правил не переигрывается', () => {
    expect(replay({ version: RULES_VERSION + 1, start: { seed: 1 }, cmds: [] })).toBeNull();
  });
});
