import { comboFeatures } from '../combos';
import { activeCells, buildLines } from '../grid';
import { burnCard, placeCard } from '../night';
import { buyItem, buyOmen, omenSlots } from '../shop';
import { omenDef } from '../content/omens';
import type { Card, NightState, RunState } from '../types';

export interface Move {
  handIndex: number;
  cell: number;
  value: number;
}

/**
 * Насколько многообещающа незаконченная линия. Грубая оценка будущего созвездия:
 * одна масть → флеш, повторы рангов → пары/тройки, плотные ранги → стрит.
 */
function linePotential(cards: Card[], length: number): number {
  if (cards.length === 0) return 0;
  const f = comboFeatures(cards, { flushSlack: 0, straightGaps: 0 });
  const ranks = cards.map((c) => c.rank);
  const span = Math.max(...ranks) - Math.min(...ranks);
  const sameSuit = new Set(cards.map((c) => c.suit)).size === 1;
  let value = 0;
  if (sameSuit && cards.length >= 2) value += 40;
  if (f.maxOfKind >= 2) value += 15 * f.maxOfKind;
  if (new Set(ranks).size === cards.length && span <= length - 1 && cards.length >= 2) value += 30;
  const fill = cards.length / length;
  return value * fill * fill;
}

function positionalValue(night: NightState, cell: number): number {
  let value = 0;
  for (const line of buildLines(night.rules)) {
    if (!line.cells.includes(cell)) continue;
    const active = activeCells(line, night.sealed);
    const cards = active.map((c) => night.grid[c]).filter((c): c is Card => !!c);
    value += linePotential(cards, active.length);
  }
  return value;
}

/** Жадный выбор хода: очки сразу + потенциал позиции. Его же можно использовать как подсказку. */
export function bestMove(run: RunState): Move | null {
  const night = run.night;
  if (!night) return null;
  let best: Move | null = null;
  night.hand.forEach((_, handIndex) => {
    night.grid.forEach((occupant, cell) => {
      if (occupant || night.sealed[cell]) return;
      const sim = structuredClone(run);
      const events = placeCard(sim, handIndex, cell);
      const ignite = events.find((e) => e.t === 'ignite');
      let value = ignite && ignite.t === 'ignite' ? ignite.score.total : 0;
      if (sim.night) value += positionalValue(sim.night, cell) * (1 + run.ante * 0.5);
      if (!best || value > best.value) best = { handIndex, cell, value };
    });
  });
  return best;
}

/** Играет текущую ночь до конца. */
export function playNight(run: RunState): void {
  while (run.phase === 'night' && run.night?.result === 'playing') {
    const move = bestMove(run);
    if (!move) break;
    if (move.value < 5 && run.night.burnsLeft > 0) {
      burnCard(run, move.handIndex);
      continue;
    }
    placeCard(run, move.handIndex, move.cell);
  }
}

/** Простая политика Обсерватории: Знамения по редкости, затем Звёздные карты. */
export function shopGreedy(run: RunState): void {
  const shop = run.shop;
  if (!shop) return;
  const omens = shop.omens
    .map((item, slot) => ({ item, slot }))
    .filter(({ item }) => item.kind === 'omen' && !item.sold)
    .sort((a, b) => {
      const ra = a.item.kind === 'omen' ? omenDef(a.item.omenId).rarity : 0;
      const rb = b.item.kind === 'omen' ? omenDef(b.item.omenId).rarity : 0;
      return rb - ra;
    });
  for (const { item, slot } of omens) {
    if (run.gold >= item.price && run.omens.length < omenSlots(run)) buyOmen(run, slot);
  }
  shop.items.forEach((item, slot) => {
    if (item.kind === 'chart' && !item.sold && run.gold - item.price >= 2) buyItem(run, slot);
  });
}
