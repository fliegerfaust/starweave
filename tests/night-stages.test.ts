import { afterEach, describe, expect, it } from 'vitest';
import { OMEN_LIST } from '../src/core/content/omens';
import type { EffectHooks } from '../src/core/effects';
import { placeCard } from '../src/core/night';
import { nightRun, setGrid, setHand } from './helpers';

/** Знамение-подопытный: хуки этапов подставляются на время теста. */
const probe = OMEN_LIST[0]! as EffectHooks & { id: string };
const saved = { cellFate: probe.cellFate, onPlaced: probe.onPlaced };
afterEach(() => Object.assign(probe, saved));

describe('ход по этапам (TD.3)', () => {
  it('эффект «при выкладке» видит карту на небе до поиска линий', () => {
    const run = nightRun({ omens: [probe.id] });
    setGrid(run, { 0: '2s', 1: '3m' });
    setHand(run, '9t 4c');
    const seen: { cell: number; rank: number; onGrid: boolean; ignitions: number }[] = [];
    probe.onPlaced = ({ night, card, cell }) => seen.push({ cell, rank: card.rank, onGrid: night.grid[cell] === card, ignitions: night.ignitions });
    placeCard(run, 0, 5);
    expect(seen).toEqual([{ cell: 5, rank: 9, onGrid: true, ignitions: 0 }]);
  });

  it('карта, которой политика клеток велит остаться, не уходит с неба', () => {
    const run = nightRun({ omens: [probe.id] });
    run.night!.target = 1e9;
    setGrid(run, { 0: '2s', 1: '2m', 2: '9t' });
    setHand(run, '9c 5s');
    const stay = run.night!.grid[2]!;
    probe.cellFate = ({ card }) => (card.id === stay.id ? 'stays' : undefined);
    const events = placeCard(run, 0, 3);
    expect(events.filter((e) => e.t === 'cardStays')).toEqual([{ t: 'cardStays', cardId: stay.id, cell: 2 }]);
    expect(events.find((e) => e.t === 'clear')).toEqual({ t: 'clear', cells: [0, 1, 3] });
    expect(run.night!.grid[2]).toBe(stay);
    expect(run.night!.grid[0]).toBeNull();
    expect(run.night!.discard.map((c) => c.id)).not.toContain(stay.id);
  });

  it('разбитое Стекло — событие cardDestroyed и карта уходит из колоды', () => {
    const run = nightRun({ omens: [probe.id] });
    run.night!.target = 1e9;
    setGrid(run, { 0: '2s', 1: '2m', 2: '9t' });
    setHand(run, '9c 5s');
    const glass = run.night!.grid[0]!;
    run.deck.push(glass);
    probe.cellFate = ({ card }) => (card.id === glass.id ? 'shattered' : undefined);
    const events = placeCard(run, 0, 3);
    expect(events).toContainEqual({ t: 'cardDestroyed', cardId: glass.id, cell: 0, reason: 'shattered' });
    expect(run.deck.some((d) => d.id === glass.id)).toBe(false);
    expect(run.night!.discard.some((d) => d.id === glass.id)).toBe(false);
  });
});
