import { describe, expect, it } from 'vitest';
import { trophyGreedy } from '../src/core/ai/bot';
import { canTakeChoice, choose, currentChoice } from '../src/core/choices';
import { BOSS_LIST } from '../src/core/content/bosses';
import { OMENS } from '../src/core/content/omens';
import { allContent, baseContent, contentPools } from '../src/core/content/pools';
import { TROPHIES, TROPHY_UNLOCK, trophyDef } from '../src/core/content/trophies';
import { activeEffects } from '../src/core/effect-sources';
import { burnCard, placeCard, startNight } from '../src/core/night';
import { createOmen } from '../src/core/omen-instance';
import { planChapter } from '../src/core/route';
import { collectReward, newRun } from '../src/core/run';
import { deserializeRun, serializeRun } from '../src/core/save';
import { omenSlots } from '../src/core/shop';
import { rollTrophy } from '../src/core/trophy';
import type { GameEvent, RunState } from '../src/core/types';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';
import { LINEAR, setGrid, setHand } from './helpers';

const ignite = (events: GameEvent[]) => events.find((e) => e.t === 'ignite') as Extract<GameEvent, { t: 'ignite' }> | undefined;

/** Ночь без Затмения с трофеями: правила трофеев собираются на старте ночи. */
function trophyNight(trophies: string[] = [], seed = 1): RunState {
  const run = newRun({ seed, unlocks: LINEAR });
  run.trophies = trophies;
  run.chapter = { ...planChapter(run), at: 0 };
  startNight(run);
  return run;
}

/** Итог хода: на небо `layout`, в руку `hand`, ход картой 0 в клетку `cell`. */
function play(trophies: string[], layout: Record<number, string>, hand: string, cell: number) {
  const run = trophyNight(trophies);
  setGrid(run, layout);
  setHand(run, hand);
  const events = placeCard(run, 0, cell);
  return { run, events, score: ignite(events)?.score };
}

/** Забег на экране награды после Затмения `bossId`. */
function afterEclipse(bossId = 'gravity', unlocks = { ...LINEAR, trophies: true }): RunState {
  const run = newRun({ seed: 5, unlocks });
  run.phase = 'reward';
  run.reward = { base: 3, moves: 0, burns: 0, interest: 0, total: 3 };
  run.night = { bossId } as RunState['night'];
  return run;
}

describe('трофеи Затмений: содержимое (TR.1)', () => {
  it('у каждого из 13 Затмений трофей с парным Знамением и названиями на двух языках', () => {
    expect(BOSS_LIST).toHaveLength(13);
    for (const boss of BOSS_LIST) {
      const def = trophyDef(boss.id);
      expect(Object.hasOwn(OMENS, def.omen)).toBe(true);
      expect(ru.trophy[boss.id]?.[0]).toBeTruthy();
      expect((en.trophy as Record<string, [string, string]>)[boss.id]?.[0]).toBeTruthy();
    }
    expect(Object.keys(TROPHIES)).toHaveLength(13);
  });

  it('ступень «Трофеи» — 6 Затмений; в вызове дня трофеев нет', () => {
    expect(TROPHY_UNLOCK).toEqual({ kind: 'eclipses', count: 6 });
    expect(contentPools((u) => u.kind === 'eclipses' && u.count <= 6).trophies).toBe(true);
    expect(contentPools((u) => u.kind === 'eclipses' && u.count <= 5).trophies).toBe(false);
    expect(baseContent().trophies).toBe(false);
    expect(allContent().trophies).toBe(true);
  });

  it('трофей срабатывает после Знамений и до Затмения', () => {
    const run = newRun({ seed: 1, unlocks: LINEAR });
    run.omens.push(createOmen(run, 'stardust'));
    run.trophies = ['wane'];
    run.bosses[0] = 'eclipse-sun';
    run.chapter = { ...planChapter(run), at: 2 };
    startNight(run);
    expect(activeEffects(run, run.night).map((fx) => fx.source.kind)).toEqual(['omen', 'trophy', 'boss']);
    expect(activeEffects(run, null).map((fx) => fx.source.kind)).toEqual(['omen', 'trophy']);
  });
});

describe('трофеи Затмений: правила (TR.1)', () => {
  it('Звёздная пустота: одна клетка запечатана, карта рядом с ней — +4 к множителю', () => {
    const run = trophyNight(['void']);
    expect(run.night!.sealed.filter(Boolean)).toHaveLength(1);
    // Ряд целиком у запечатанной клетки или нет — сравниваем с той же ночью без печати рядом
    const sealed = run.night!.sealed.indexOf(true);
    const row = Math.floor(sealed / 4);
    const other = (row + 2) % 4;
    const cellsOf = (r: number) => [0, 1, 2, 3].map((i) => r * 4 + i);
    const score = (r: number) => {
      const night = trophyNight(['void']);
      night.night!.sealed = night.night!.sealed.map((_, i) => i === sealed);
      const cells = cellsOf(r).filter((i) => i !== sealed);
      setGrid(night, Object.fromEntries(cells.slice(0, -1).map((i, k) => [i, ['2s', '5m', '8t', '4c'][k]!])));
      setHand(night, '9s');
      return ignite(placeCard(night, 0, cells.at(-1)!))!.score;
    };
    expect(score(row).lines[0]!.mult).toBeGreaterThan(score(other).lines[0]!.mult);
  });

  it('масть в короне: карты масти засчитываются дважды', () => {
    const layout = { 0: '2s', 1: '5m', 2: '8t' };
    const plain = play([], layout, '4c', 3).score!;
    const sun = play(['eclipse-sun'], layout, '4c', 3).score!;
    const moon = play(['eclipse-moon'], layout, '4c', 3).score!;
    expect(sun.lines[0]!.light).toBe(plain.lines[0]!.light + 2);
    expect(moon.lines[0]!.light).toBe(plain.lines[0]!.light + 5);
  });

  it('Ясное небо: видны две верхние карты колоды', () => {
    expect(trophyNight(['fog']).night!.rules.peek).toBe(2);
    expect(trophyNight().night!.rules.peek ?? 0).toBe(0);
  });

  it('Изобилие: +1 карта в руке на первые 5 ходов', () => {
    const run = trophyNight(['drought']);
    const base = trophyNight().night!.rules.handSize;
    expect(run.night!.rules.handSize).toBe(base + 1);
    expect(run.night!.hand).toHaveLength(base + 1);
    for (let i = 0; i < 5; i++) placeCard(run, 0, run.night!.grid.findIndex((c, k) => !c && !run.night!.sealed[k]));
    expect(run.night!.rules.handSize).toBe(base);
  });

  it('Долгая ночь: +1 ход за каждый крест', () => {
    const layout = { 0: '2s', 1: '2m', 2: '2t', 7: '5s', 11: '5m', 15: '5t' };
    const plain = play([], layout, '2c', 3);
    const long = play(['shortNight'], layout, '2c', 3);
    expect(plain.score!.lines).toHaveLength(2);
    expect(long.run.night!.movesLeft).toBe(plain.run.night!.movesLeft + 1);
  });

  it('Тишина: последний ход — +5 к множителю за каждое неиспользованное сжигание', () => {
    const last = (trophies: string[]) => {
      const run = trophyNight(trophies);
      run.night!.movesLeft = 1;
      setGrid(run, { 0: '2s', 1: '5m', 2: '8t' });
      setHand(run, '4c');
      return { score: ignite(placeCard(run, 0, 3))!.score, burns: run.night!.burnsLeft };
    };
    const plain = last([]);
    const quiet = last(['silence']);
    expect(quiet.burns).toBeGreaterThan(0);
    expect(quiet.score.lines[0]!.mult).toBe(plain.score.lines[0]!.mult + 5 * quiet.burns);
  });

  it('Тишина: не последний ход — без бонуса, сжигание его уменьшает', () => {
    const run = trophyNight(['silence']);
    const burns = run.night!.burnsLeft;
    burnCard(run, 0);
    expect(run.night!.burnsLeft).toBe(burns - 1);
    const layout = { 0: '2s', 1: '5m', 2: '8t' };
    expect(play(['silence'], layout, '4c', 3).score!.lines[0]!.mult).toBe(play([], layout, '4c', 3).score!.lines[0]!.mult);
  });

  it('Столп притяжения: вспыхнувший столбец ×2, ряд — без изменений', () => {
    const col = { 0: '2s', 4: '5m', 8: '8t' };
    expect(play(['gravity'], col, '4c', 12).score!.total).toBe(play([], col, '4c', 12).score!.total * 2);
    const row = { 0: '2s', 1: '5m', 2: '8t' };
    expect(play(['gravity'], row, '4c', 3).score!.total).toBe(play([], row, '4c', 3).score!.total);
  });

  it('Помилование: Россыпь считается Парой', () => {
    const layout = { 0: '2s', 1: '5m', 2: '8t' };
    expect(play([], layout, '4c', 3).score!.lines[0]!.combo).toBe('scatter');
    expect(play(['judge'], layout, '4c', 3).score!.lines[0]!.combo).toBe('pair');
    // Настоящее созвездие не трогает
    expect(play(['judge'], { 0: '2s', 1: '3s', 2: '4s' }, '5s', 3).score!.lines[0]!.combo).not.toBe('pair');
  });

  it('Полнолуние: первое созвездие ночи ×2, следующее — как обычно', () => {
    const run = trophyNight(['wane']);
    const ref = trophyNight();
    for (const r of [run, ref]) {
      setGrid(r, { 0: '2s', 1: '5m', 2: '8t', 4: '3s', 5: '6m', 6: '9t' });
      setHand(r, '4c 7c');
    }
    const first = [ignite(placeCard(run, 0, 3))!.score, ignite(placeCard(ref, 0, 3))!.score];
    expect(first[0]!.total).toBe(first[1]!.total * 2);
    const second = [ignite(placeCard(run, 0, 7))!.score, ignite(placeCard(ref, 0, 7))!.score];
    expect(second[0]!.total).toBe(second[1]!.total);
  });

  it('Сытость: каждое третье созвездие ночи — +2 золота', () => {
    const run = trophyNight(['hunger']);
    const ref = trophyNight();
    const gold: number[] = [];
    for (let r = 0; r < 3; r++) {
      for (const n of [run, ref]) {
        setGrid(n, { [r * 4]: '2s', [r * 4 + 1]: '5m', [r * 4 + 2]: '8t' });
        setHand(n, '4c');
      }
      gold.push(ignite(placeCard(run, 0, r * 4 + 3))!.score.gold - ignite(placeCard(ref, 0, r * 4 + 3))!.score.gold);
    }
    expect(gold).toEqual([0, 0, 2]);
  });
});

describe('выбор после Затмения (TR.1)', () => {
  it('после Затмения — «приручить или Знамение» первым, до дара', () => {
    const run = afterEclipse();
    collectReward(run);
    expect(run.pending.map((c) => c.kind)).toEqual(['trophy', 'gift']);
    expect(currentChoice(run)).toEqual({ kind: 'trophy', options: [{ k: 'trophy', id: 'gravity' }, { k: 'omen', id: 'pillar' }] });
  });

  it('нет выбора: обычная ночь, ступень не открыта, обучение', () => {
    const plain = afterEclipse();
    plain.night = { bossId: null } as RunState['night'];
    collectReward(plain);
    expect(plain.pending.some((c) => c.kind === 'trophy')).toBe(false);
    const locked = afterEclipse('gravity', { ...LINEAR, trophies: false });
    collectReward(locked);
    expect(locked.pending.some((c) => c.kind === 'trophy')).toBe(false);
    const tut = afterEclipse();
    tut.tutorial = true;
    collectReward(tut);
    expect(tut.pending).toEqual([]);
  });

  it('приручить: трофей в слот, новый вытесняет старый', () => {
    const run = afterEclipse('gravity');
    collectReward(run);
    choose(run, 0);
    expect(run.trophies).toEqual(['gravity']);
    const next = afterEclipse('fog');
    next.trophies = ['gravity'];
    collectReward(next);
    choose(next, 0);
    expect(next.trophies).toEqual(['fog']);
  });

  it('Знамение: встаёт в пояс, трофея нет; без свободного слота взять нельзя', () => {
    const run = afterEclipse('gravity');
    collectReward(run);
    choose(run, 1);
    expect(run.omens.map((o) => o.id)).toContain('pillar');
    expect(run.trophies ?? []).toEqual([]);
    const full = afterEclipse('gravity');
    while (full.omens.length < omenSlots(full)) full.omens.push(createOmen(full, 'stardust'));
    collectReward(full);
    expect(canTakeChoice(full)).toBe(true);
    expect(() => choose(full, 1)).toThrow();
    choose(full, 0);
    expect(full.trophies).toEqual(['gravity']);
  });

  it('парное Знамение уже есть — остаётся только трофей', () => {
    const run = afterEclipse('gravity');
    run.omens.push(createOmen(run, 'pillar'));
    expect(rollTrophy(run, 'gravity')).toEqual([{ k: 'trophy', id: 'gravity' }]);
  });

  it('бот приручает', () => {
    const run = afterEclipse('judge');
    collectReward(run);
    trophyGreedy(run);
    expect(run.trophies).toEqual(['judge']);
  });
});

describe('трофеи в сохранении (TR.1)', () => {
  it('трофей, выбор в очереди и счётчики ночи переживают сохранение', () => {
    const run = afterEclipse('hunger');
    collectReward(run);
    const back = deserializeRun(serializeRun(run))!;
    expect(back.pending[0]).toEqual(run.pending[0]);
    choose(back, 0);
    const night = trophyNight(['hunger']);
    setGrid(night, { 0: '2s', 1: '5m', 2: '8t' });
    setHand(night, '4c');
    placeCard(night, 0, 3);
    const again = deserializeRun(serializeRun(night))!;
    expect(again.trophies).toEqual(['hunger']);
    expect(again.night!.trophyData).toEqual({ hunger: { lines: 1 } });
  });

  it('сохранение до трофеев открывается без них; неизвестный трофей — сохранение не открыть', () => {
    const old = JSON.parse(serializeRun(newRun({ seed: 3, unlocks: LINEAR })));
    delete old.unlocks.trophies;
    delete old.trophies;
    const back = deserializeRun(JSON.stringify(old))!;
    expect(back.unlocks.trophies).toBe(false);
    expect(back.trophies).toBeUndefined();
    expect(deserializeRun(JSON.stringify({ ...old, trophies: ['nope'] }))).toBeNull();
  });
});
