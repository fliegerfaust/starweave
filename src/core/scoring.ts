import { comboBase } from './content/combos';
import { resolveLine } from './combos';
import { activeEffects, type ActiveEffect } from './effect-sources';
import type { BaseCtx, CardCtx, Contrib, LineInfo, PlacementCtx } from './effects';
import { activeCells } from './grid';
import type { RngState } from './rng';
import { traitOf } from './content/traits';
import type { Card, Line, LineScore, NightState, PlacementScore, RunState, ScoreStep, StepSource, EffectSource } from './types';

/** Накопитель шагов одной линии. */
class Tally {
  light = 0;
  mult = 0;
  gold = 0;
  readonly steps: ScoreStep[] = [];

  contrib(source: StepSource): Contrib {
    return {
      light: (n) => this.push(source, { light: n }),
      mult: (n) => this.push(source, { mult: n }),
      xMult: (n) => this.push(source, { xMult: n }),
      gold: (n) => this.push(source, { gold: n }),
    };
  }

  push(source: StepSource, delta: { light?: number; mult?: number; xMult?: number; gold?: number }): void {
    if (delta.light) this.light += delta.light;
    if (delta.mult) this.mult += delta.mult;
    if (delta.xMult !== undefined) this.mult *= delta.xMult;
    if (delta.gold) this.gold += delta.gold;
    this.steps.push({ source, ...delta, lightAfter: this.light, multAfter: this.mult });
  }
}

function isDebuffed(card: Card, night: NightState): boolean {
  return night.rules.debuffSuit !== null && card.suit === night.rules.debuffSuit;
}

function scoreLine(
  run: RunState,
  night: NightState,
  line: Line,
  effects: ActiveEffect[],
  rng: RngState,
  shattered: Set<number>,
  rolled: Set<number>,
): LineScore & { gold: number } {
  const cells = activeCells(line, night.sealed);
  const placed = cells.map((cell) => night.grid[cell] as Card);
  const resolved = resolveLine(placed, { flushSlack: night.rules.flushSlack, straightGaps: night.rules.straightGaps });
  const combo = resolved.combo;
  // Туманность и Двойник засчитываются тем рангом, которым встали в линию
  const cards = placed.map((c, i) => (resolved.ranks[i] === c.rank ? c : { ...c, rank: resolved.ranks[i]! }));
  const info: LineInfo = { line, combo, cells, cards };
  const tally = new Tally();
  const base = comboBase(combo, run.comboLevels[combo]);
  tally.push({ kind: 'combo', combo }, base);
  // Заряд Пульсаров этой ночи — к каждой линии
  if (night.pulse) tally.push({ kind: 'body', body: 'pulsar' }, { mult: night.pulse });

  const baseCtx = (fx: ActiveEffect): BaseCtx => ({ run, night, rules: night.rules, rng, data: fx.data });

  cells.forEach((cell, i) => {
    const card = cards[i] as Card;
    if (isDebuffed(card, night)) return;
    const cardSource: StepSource = { kind: 'card', cell, cardId: card.id };
    const traitSource = (): StepSource =>
      card.body ? { kind: 'body', cell, cardId: card.id, body: card.body } : { kind: 'glyph', cell, cardId: card.id, glyph: card.glyph! };
    const cardCtx = (fx: ActiveEffect): CardCtx => ({
      ...baseCtx(fx),
      ...info,
      ...tally.contrib(withCell(fx.source, cell)),
      card,
      cell,
    });

    const trait = traitOf(card);
    let times = 1 + (trait?.retriggers ?? 0);
    for (const fx of effects) times += fx.hooks.retriggers?.(cardCtx(fx)) ?? 0;

    for (let t = 0; t < times; t++) {
      tally.push(cardSource, { light: card.rank });
      if (trait?.onScored) trait.onScored({ ...tally.contrib(traitSource()), card, cell });
      for (const fx of effects) fx.hooks.onCardScored?.(cardCtx(fx));
    }
    // Один бросок на карту за ход, даже если она в двух линиях креста
    if (trait?.breaks && !rolled.has(card.id)) {
      rolled.add(card.id);
      if (trait.breaks(rng)) shattered.add(card.id);
    }
  });

  for (const fx of effects) {
    fx.hooks.onLineScored?.({ ...baseCtx(fx), ...info, ...tally.contrib(fx.source) });
  }

  const light = Math.max(0, tally.light);
  const mult = Math.max(0, tally.mult);
  return { line, combo, cells, steps: tally.steps, light, mult, total: Math.floor(light * mult), gold: tally.gold };
}

function withCell(source: EffectSource, cell: number): EffectSource {
  return source.kind === 'omen' ? { ...source, cell } : source;
}

/**
 * Считает ход, зажёгший `lines`. Карта уже лежит на небе. Не меняет счёт ночи —
 * это делает `night.ts`, чтобы подсчёт оставался чистым относительно стейта ночи
 * (кроме данных Знамений и ГПСЧ).
 */
export function scorePlacement(run: RunState, night: NightState, lines: Line[], rng: RngState): PlacementScore {
  const effects = activeEffects(run, night);
  const shattered = new Set<number>();
  const rolled = new Set<number>();
  const scored = lines.map((line) => scoreLine(run, night, line, effects, rng, shattered, rolled));

  const steps: ScoreStep[] = [];
  const sum = scored.reduce((s, l) => s + l.total, 0);
  let gold = scored.reduce((s, l) => s + l.gold, 0);
  let xMult = 1;

  const chainMult = lines.length >= 2 ? lines.length + night.rules.chainBonus : 1;
  if (chainMult !== 1) {
    xMult *= chainMult;
    steps.push({ source: { kind: 'chain', lines: lines.length }, xMult: chainMult, lightAfter: sum, multAfter: xMult });
  }

  const lastMove = night.movesLeft === 0;
  for (const fx of effects) {
    if (!fx.hooks.onPlacementScored) continue;
    const ctx: PlacementCtx = {
      run,
      night,
      rules: night.rules,
      rng,
      data: fx.data,
      lines: scored,
      lastMove,
      xMult: (n) => {
        xMult *= n;
        steps.push({ source: fx.source, xMult: n, lightAfter: sum, multAfter: xMult });
      },
      gold: (n) => {
        gold += n;
        steps.push({ source: fx.source, gold: n, lightAfter: sum, multAfter: xMult });
      },
    };
    fx.hooks.onPlacementScored(ctx);
  }

  return {
    lines: scored.map(({ gold: _gold, ...rest }) => rest),
    steps,
    chainMult,
    xMult,
    total: Math.floor(sum * xMult),
    gold,
    shattered: [...shattered],
  };
}
