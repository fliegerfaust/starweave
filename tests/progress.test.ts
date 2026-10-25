import { afterEach, describe, expect, it } from 'vitest';
import { allContent, baseContent } from '../src/core/content/pools';
import { OMEN_LIST } from '../src/core/content/omens';
import { placeCard } from '../src/core/night';
import { newRun } from '../src/core/run';
import { generateShop } from '../src/core/shop';
import { emptyProfile, sanitizeProfile } from '../src/meta/profile';
import { recordEvent, unlocksFor } from '../src/meta/progress';
import { nightRun, setGrid, setHand } from './helpers';

const locked = OMEN_LIST[0]!;
afterEach(() => delete locked.unlock);

describe('прогресс из одного места (TD.8)', () => {
  it('ход со вспышкой записывает созвездие в коллекцию и возвращает находку', () => {
    const p = emptyProfile();
    const run = nightRun();
    setGrid(run, { 0: '3s', 1: '3m', 2: '7t' });
    setHand(run, '9c');
    const r = recordEvent(p, run, { e: 'turn', events: placeCard(run, 0, 3) });
    expect(r.discovery).toEqual({ combos: ['pair'], cross: false });
    expect(p.combosFound).toEqual(['pair']);
    expect(recordEvent(p, run, { e: 'turn', events: [] }).discovery).toBeNull();
  });

  it('учебный забег не даёт прогресса, но встреченные Знамения открыты в Кодексе', () => {
    const p = emptyProfile();
    const run = newRun({ seed: 1 });
    run.tutorial = true;
    expect(recordEvent(p, run, { e: 'runEnd', won: true }).changed).toBe(false);
    expect(p.runs).toBe(0);
    recordEvent(p, run, { e: 'omensShown', ids: ['stardust'] });
    expect(p.seenOmens).toContain('stardust');
  });

  it('конец забега открывает небеса и возвращает их', () => {
    const p = emptyProfile();
    const run = newRun({ seed: 1 });
    run.ante = 9;
    expect(recordEvent(p, run, { e: 'runEnd', won: true }).skies.length).toBeGreaterThan(0);
    expect(p.wins).toBe(1);
  });
});

describe('коллекция трофеев (TR.4)', () => {
  it('каждый взятый трофей — ещё одно приручение его Затмения, навсегда', () => {
    const p = emptyProfile();
    const run = newRun({ seed: 1 });
    expect(recordEvent(p, run, { e: 'tamed', bossId: 'gravity' }).changed).toBe(true);
    recordEvent(p, run, { e: 'tamed', bossId: 'gravity' });
    recordEvent(p, run, { e: 'tamed', bossId: 'fog' });
    expect(p.tamed).toEqual({ gravity: 2, fog: 1 });
    expect(sanitizeProfile(JSON.parse(JSON.stringify(p))).tamed).toEqual({ gravity: 2, fog: 1 });
  });

  it('учебный забег не приручает; испорченные числа из хранилища отбрасываются', () => {
    const p = emptyProfile();
    const run = newRun({ seed: 1 });
    run.tutorial = true;
    recordEvent(p, run, { e: 'tamed', bossId: 'gravity' });
    expect(p.tamed).toBeUndefined();
    expect(sanitizeProfile({ tamed: { gravity: 2.7, fog: 0, void: -1, judge: 'три' } }).tamed).toEqual({ gravity: 2 });
    expect(sanitizeProfile({ tamed: [1, 2] }).tamed).toBeUndefined();
  });
});

describe('снимок открытий и пулы (TD.8)', () => {
  it('закрытое Знамение не попадает в снимок, пока не выполнено условие; вызовы — базовый набор', () => {
    locked.unlock = { kind: 'winRun' };
    const p = emptyProfile();
    expect(unlocksFor(p, false).omens).not.toContain(locked.id);
    p.wins = 1;
    expect(unlocksFor(p, false).omens).toContain(locked.id);
    expect(unlocksFor(p, true).omens, 'вызов дня одинаков у всех').not.toContain(locked.id);
    expect(baseContent().omens).not.toContain(locked.id);
    expect(allContent().omens).toContain(locked.id);
  });

  it('лавка не предлагает того, чего нет в снимке забега', () => {
    const unlocks = { ...allContent(), omens: allContent().omens.filter((id) => id !== locked.id) };
    for (let seed = 1; seed <= 60; seed++) {
      const run = newRun({ seed, unlocks });
      run.ante = 3;
      const shop = generateShop(run);
      expect(shop.omens.some((o) => o.kind === 'omen' && o.omenId === locked.id), `сид ${seed}`).toBe(false);
    }
  });
});
