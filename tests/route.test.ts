import { describe, expect, it } from 'vitest';
import { pickRoute } from '../src/core/ai/bot';
import { BRIGHT_TARGET_SCALE } from '../src/core/content/balance';
import { allContent, baseContent } from '../src/core/content/pools';
import { skipChoice } from '../src/core/choices';
import { COMET_EVENTS, rollComet, rollScope, takeComet, takeScope } from '../src/core/wonders';
import { runNightTarget } from '../src/core/content/stakes';
import { RuleError } from '../src/core/errors';
import { startNight } from '../src/core/night';
import { chooseRoute, currentNode, isWonder, nextStop, planChapter, routeOptions, visitWonder } from '../src/core/route';
import { collectReward, leaveShop, newRun } from '../src/core/run';
import { deserializeRun, serializeRun } from '../src/core/save';
import type { RunState } from '../src/core/types';
import { LINEAR } from './helpers';

/** Развилки ступени 2: Ночь и Яркая ночь, без Кометы и Телескопа. */
const forked = (seed = 7) => newRun({ seed, unlocks: { ...allContent(), wonders: false } });
const wondrous = (seed = 7) => newRun({ seed, unlocks: allContent() });
/** Ночь будто выиграна: забег на экране награды. */
function win(run: RunState): void {
  run.phase = 'reward';
  run.reward = { base: 3, moves: 0, burns: 0, interest: 0, total: 3 };
}
/** Пройти выбранный узел: награда, Обсерватория без покупок, дальше. */
function pass(run: RunState): void {
  startNight(run);
  win(run);
  collectReward(run);
  run.pending = [];
  leaveShop(run);
}

describe('развилки главы (RT.1)', () => {
  it('без ступени — цепочка Сумерки → Полночь → Затмение, путь выбирать не нужно', () => {
    const run = newRun({ seed: 7, unlocks: LINEAR });
    expect(run.chapter.nodes.map((n) => [n.kind, n.route])).toEqual([['dusk', 'night'], ['midnight', 'night'], ['eclipse', 'eclipse']]);
    expect(run.chapter.at).toBe(0);
    expect(routeOptions(run.chapter)).toEqual([0]);
  });

  it('с развилками — два шага «Ночь или Яркая ночь» и Затмение; путь ждёт выбора', () => {
    const run = forked();
    const { nodes } = run.chapter;
    expect(nodes).toHaveLength(5);
    expect(run.chapter.at).toBe(-1);
    for (const step of [1, 2]) expect(nodes.filter((n) => n.step === step).map((n) => n.route).sort()).toEqual(['bright', 'night']);
    expect(nodes[4]).toMatchObject({ kind: 'eclipse', route: 'eclipse', bossId: run.bosses[0] });
    // Из каждого узла — в любой узел следующего шага
    for (const n of nodes) if (n.step < 3) expect(n.next.map((i) => nodes[i]!.step)).toEqual(n.step === 1 ? [2, 2] : [3]);
  });

  it('порядок развилок — от сида и главы, а не от ГПСЧ забега', () => {
    const run = forked(11);
    const rng = { ...run.rng };
    const again = planChapter({ ...run, ante: 1 });
    expect(again).toEqual(run.chapter);
    expect(run.rng).toEqual(rng);
    const orders = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((ante) => planChapter({ ...run, ante }).nodes.map((n) => n.route).join()));
    expect(orders.size).toBeGreaterThan(1);
  });

  it('ночь не начинается, пока путь не выбран; выбрать можно только вариант шага', () => {
    const run = forked();
    expect(() => startNight(run)).toThrow(RuleError);
    expect(() => chooseRoute(run, 4)).toThrow(RuleError);
    const [first] = routeOptions(run.chapter);
    chooseRoute(run, first!);
    startNight(run);
    expect(run.phase).toBe('night');
  });

  it('Яркая ночь: цель ×1.35, после награды — Знамение 1 из 3', () => {
    const run = forked();
    const bright = routeOptions(run.chapter).find((i) => run.chapter.nodes[i]!.route === 'bright')!;
    chooseRoute(run, bright);
    startNight(run);
    expect(run.night!.target).toBe(Math.round(runNightTarget(run, 'dusk', null) * BRIGHT_TARGET_SCALE));
    win(run);
    collectReward(run);
    const omen = run.pending.find((c) => c.kind === 'pack');
    expect(omen).toMatchObject({ kind: 'pack', pack: 'omen' });
    expect(omen!.options).toHaveLength(3);
  });

  it('путь главы: шаг 1 → развилка шага 2 → Затмение само → следующая глава', () => {
    const run = forked();
    chooseRoute(run, routeOptions(run.chapter)[0]!);
    pass(run);
    expect(run.chapter.path).toHaveLength(1);
    expect(run.chapter.at).toBe(-1);
    expect(routeOptions(run.chapter).map((i) => run.chapter.nodes[i]!.step)).toEqual([2, 2]);
    chooseRoute(run, routeOptions(run.chapter)[1]!);
    pass(run);
    // Затмение — единственный вариант: выбирается само
    expect(currentNode(run).route).toBe('eclipse');
    expect(run.chapter.at).toBe(4);
    const ahead = nextStop(run);
    expect(ahead.ante).toBe(2);
    pass(run);
    expect(run.ante).toBe(2);
    expect(run.chapter.at).toBe(-1);
    expect(run.chapter.path).toEqual([]);
  });

  it('сохранение посреди развилки — путь и выбор на месте; битый граф не открывается', () => {
    const run = forked();
    chooseRoute(run, routeOptions(run.chapter)[0]!);
    pass(run);
    const back = deserializeRun(serializeRun(run))!;
    expect(back.chapter).toEqual(run.chapter);
    const broken = { ...run, chapter: { ...run.chapter, nodes: run.chapter.nodes.map((n, i) => (i ? n : { ...n, next: [9] })) } };
    expect(deserializeRun(JSON.stringify(broken))).toBeNull();
  });

  it('бот выбирает Яркую ночь, пока есть место для Знамения', () => {
    const run = forked();
    pickRoute(run);
    expect(currentNode(run).route).toBe('bright');
  });

  it('ступень 6: на каждом шаге ещё Комета или Телескоп, и в любом пути есть ночь', () => {
    for (let seed = 1; seed < 30; seed++) {
      const run = wondrous(seed);
      const { nodes } = run.chapter;
      const wonders = nodes.filter((n) => isWonder(n.route)).map((n) => n.route).sort();
      expect(wonders).toEqual(['comet', 'telescope']);
      // Из шага без ночи — только в ночь
      for (const n of nodes) if (isWonder(n.route)) expect(n.next.every((j) => !isWonder(nodes[j]!.route))).toBe(true);
    }
  });

  it('Комета: обмен 1 из 3, шаг без ночи пройден, путь записан', () => {
    const run = wondrous(3);
    run.gold = 20;
    const comet = routeOptions(run.chapter).find((i) => run.chapter.nodes[i]!.route === 'comet') ?? routeOptions(run.chapter).find((i) => run.chapter.nodes[i]!.route === 'telescope')!;
    chooseRoute(run, comet);
    expect(() => startNight(run)).toThrow(RuleError);
    visitWonder(run);
    const choice = run.pending[0]!;
    expect(['comet', 'telescope']).toContain(choice.kind);
    expect(choice.options.length).toBeGreaterThan(0);
    expect(choice.options.length).toBeLessThanOrEqual(3);
    skipChoice(run);
    expect(run.chapter.path).toEqual([comet]);
    expect(run.journey![0]).toEqual([{ route: run.chapter.nodes[comet]!.route, col: expect.any(Number), of: 3 }]);
    expect(run.phase).toBe('map');
  });

  it('все 10 обменов Кометы и 3 улучшения Телескопа применяются', () => {
    const base = newRun({ seed: 5, unlocks: allContent() });
    base.gold = 40;
    base.omens.push({ uid: 900, id: 'stardust', data: {} });
    base.comboLevels.pair = 3;
    const seen = new Set<string>();
    for (let seed = 1; seed < 200 && seen.size < COMET_EVENTS.length; seed++) {
      const run = structuredClone(base);
      run.rng = { s: seed };
      for (const t of rollComet(run)) {
        const copy = structuredClone(run);
        const before = JSON.stringify([copy.deck, copy.omens, copy.gold, copy.comboLevels]);
        takeComet(copy, t);
        expect(JSON.stringify([copy.deck, copy.omens, copy.gold, copy.comboLevels]), t.e).not.toBe(before);
        seen.add(t.e);
      }
    }
    expect([...seen].sort()).toEqual([...COMET_EVENTS].sort());
    const run = structuredClone(base);
    const ups = rollScope(run);
    expect(ups.map((u) => u.u)).toEqual(['chart', 'glyph', 'banish']);
    for (const u of ups) {
      const copy = structuredClone(run);
      takeScope(copy, u);
      expect(JSON.stringify([copy.deck, copy.comboLevels])).not.toBe(JSON.stringify([run.deck, run.comboLevels]));
    }
  });

  it('путь каждой главы записан для созвездия итогов (RT.3), переживает сохранение', () => {
    const run = forked();
    chooseRoute(run, routeOptions(run.chapter)[1]!);
    pass(run);
    chooseRoute(run, routeOptions(run.chapter)[0]!);
    pass(run);
    pass(run);
    expect(run.journey![0]!.map((s) => s.route)).toEqual([...run.journey![0]!.slice(0, 2).map((s) => s.route), 'eclipse']);
    expect(run.journey![0]![0]).toMatchObject({ col: 1, of: 2 });
    expect(run.journey![0]![2]).toMatchObject({ route: 'eclipse', col: 0, of: 1 });
    expect(deserializeRun(serializeRun(run))!.journey).toEqual(run.journey);
  });

  it('вызов дня: развилки есть, Кометы и Телескопа нет', () => {
    expect(baseContent()).toMatchObject({ routes: true, wonders: false });
  });
});
