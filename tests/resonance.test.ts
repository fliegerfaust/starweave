import { describe, expect, it } from 'vitest';
import { RESONANCES, resonanceOf } from '../src/core/content/resonance';
import { OMENS, omenDef } from '../src/core/content/omens';
import { createOmen } from '../src/core/omen-instance';
import { newRun } from '../src/core/run';
import { fuseOmens, generateShop, resonanceAt } from '../src/core/shop';
import { apply } from '../src/core/commands';
import { placeCard } from '../src/core/night';
import { fuseGreedy } from '../src/core/ai/bot';
import { emptyProfile, isUnlocked } from '../src/meta/profile';
import { RESONANCE_UNLOCK } from '../src/core/content/resonance';
import { LINEAR, nightRun, setGrid, setHand } from './helpers';

const shopRun = (omens: string[], resonance = true) => {
  const run = newRun({ seed: 2, unlocks: { ...LINEAR, resonance } });
  run.phase = 'shop';
  run.shop = { omens: [], items: [], packs: [], rerollCost: 5 };
  for (const id of omens) run.omens.push(createOmen(run, id));
  return run;
};

describe('Резонанс (RS.1)', () => {
  it('8 пар из разных существующих Знамений, у каждой — легендарное', () => {
    expect(RESONANCES).toHaveLength(8);
    const halves = RESONANCES.flatMap((r) => r.pair);
    expect(new Set(halves).size).toBe(16);
    for (const r of RESONANCES) {
      for (const id of r.pair) expect(OMENS[id], id).toBeDefined();
      expect(omenDef(r.id).pair).toEqual(r.pair);
    }
    expect(resonanceOf('highNoon', 'sunWorship')?.id).toBe('noon');
    expect(resonanceOf('highNoon', 'moonTide')).toBeUndefined();
  });

  it('вторая половина пары, которой владеешь, выпадает в лавке чаще', () => {
    const seen = (resonance: boolean) => {
      let n = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const run = newRun({ seed, unlocks: { ...LINEAR, resonance } });
        run.omens.push(createOmen(run, 'sunWorship'));
        if (generateShop(run).omens.some((i) => i.kind === 'omen' && i.omenId === 'highNoon')) n++;
      }
      return n;
    };
    expect(seen(true)).toBeGreaterThan(seen(false) * 1.8);
  });

  it('пара рядом сливается: одно место вместо двух', () => {
    const run = shopRun(['stardust', 'sunWorship', 'highNoon', 'nightOwl']);
    expect(resonanceAt(run)).toBe(1);
    apply(run, { c: 'fuse', at: 1 });
    expect(run.omens.map((o) => o.id)).toEqual(['stardust', 'noon', 'nightOwl']);
    expect(resonanceAt(run)).toBe(-1);
  });

  it('не рядом, не пара, не в Обсерватории или ступень закрыта — слияния нет', () => {
    expect(resonanceAt(shopRun(['sunWorship', 'stardust', 'highNoon']))).toBe(-1);
    expect(() => fuseOmens(shopRun(['sunWorship', 'moonTide']), 0)).toThrow();
    expect(resonanceAt(shopRun(['sunWorship', 'highNoon'], false))).toBe(-1);
    expect(() => fuseOmens(shopRun(['sunWorship', 'highNoon'], false), 0)).toThrow();
    const night = shopRun(['sunWorship', 'highNoon']);
    night.phase = 'night';
    expect(() => fuseOmens(night, 0)).toThrow();
  });

  it('легендарные не продаются в Обсерватории', () => {
    const legends = new Set(RESONANCES.map((r) => r.id));
    for (let seed = 1; seed <= 60; seed++) {
      const run = shopRun([]);
      run.rng = { s: seed };
      for (const o of generateShop(run).omens) if (o.kind === 'omen') expect(legends.has(o.omenId)).toBe(false);
    }
  });

  it('Полдень сильнее пары на картах Солнца 7–9', () => {
    const score = (omens: string[]) => {
      const run = nightRun({ omens });
      run.night!.rules.debuffSuit = null;
      run.night!.target = 1e9;
      setGrid(run, { 0: '7s', 1: '8s', 2: '9s' });
      setHand(run, '7s 1m 1c');
      const e = placeCard(run, 0, 3).find((x) => x.t === 'ignite');
      return e?.t === 'ignite' ? e.score.total : 0;
    };
    expect(score(['noon'])).toBeGreaterThan(score(['sunWorship', 'highNoon']));
  });

  it('бот ставит половины рядом и сливает', () => {
    const run = shopRun(['sunWorship', 'stardust', 'nightOwl', 'highNoon']);
    fuseGreedy(run);
    expect(run.omens.map((o) => o.id)).toEqual(['noon', 'stardust', 'nightOwl']);
  });

  it('ступень открывается 25 встреченными Знамениями', () => {
    const p = emptyProfile();
    p.seenOmens = Object.keys(OMENS).slice(0, 24);
    expect(isUnlocked(RESONANCE_UNLOCK, p)).toBe(false);
    p.seenOmens.push(Object.keys(OMENS)[24]!);
    expect(isUnlocked(RESONANCE_UNLOCK, p)).toBe(true);
  });
});
