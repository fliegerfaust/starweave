import { comboBase } from './content/combos';
import { bossDef } from './content/bosses';
import { omenDef } from './content/omens';
import { evaluateCombo } from './combos';
import type { BaseCtx, CardCtx, Contrib, EffectHooks, LineInfo, PlacementCtx } from './effects';
import { activeCells } from './grid';
import { chance, type RngState } from './rng';
import type { Card, Line, LineScore, NightState, PlacementScore, RunState, ScoreStep, StepSource } from './types';

/** Активный эффект: хуки + состояние + как подписывать его шаги. */
export interface ActiveEffect {
  hooks: EffectHooks;
  data: Record<string, number>;
  source: StepSource;
}

/** Знамения по слотам, затем Затмение — порядок важен для ×множителей. */
export function activeEffects(run: RunState, night: NightState | null): ActiveEffect[] {
  const effects: ActiveEffect[] = run.omens.map((o) => ({
    hooks: omenDef(o.id),
    data: o.data,
    source: { kind: 'omen', uid: o.uid, omenId: o.id },
  }));
  if (night?.bossId) {
    effects.push({ hooks: bossDef(night.bossId), data: {}, source: { kind: 'boss', bossId: night.bossId } });
  }
  return effects;
}

export const GLASS_BREAK_CHANCE = 0.25;

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
): LineScore & { gold: number } {
  const cells = activeCells(line, night.sealed);
  const cards = cells.map((cell) => night.grid[cell] as Card);
  const combo = evaluateCombo(cards, { flushSlack: night.rules.flushSlack, straightGaps: night.rules.straightGaps });
  const info: LineInfo = { line, combo, cells, cards };
  const tally = new Tally();
  const base = comboBase(combo, run.comboLevels[combo]);
  tally.push({ kind: 'combo', combo }, base);

  const baseCtx = (fx: ActiveEffect): BaseCtx => ({ run, night, rules: night.rules, rng, data: fx.data });

  cells.forEach((cell, i) => {
    const card = cards[i] as Card;
    if (isDebuffed(card, night)) return;
    const cardSource: StepSource = { kind: 'card', cell, cardId: card.id };
    const glyphSource = (): StepSource => ({ kind: 'glyph', cell, cardId: card.id, glyph: card.glyph! });
    const cardCtx = (fx: ActiveEffect): CardCtx => ({
      ...baseCtx(fx),
      ...info,
      ...tally.contrib(withCell(fx.source, cell)),
      card,
      cell,
    });

    let times = 1 + (card.glyph === 'echo' ? 1 : 0);
    for (const fx of effects) times += fx.hooks.retriggers?.(cardCtx(fx)) ?? 0;

    for (let t = 0; t < times; t++) {
      tally.push(cardSource, { light: card.rank });
      switch (card.glyph) {
        case 'radiant':
          tally.push(glyphSource(), { light: 30 });
          break;
        case 'blazing':
          tally.push(glyphSource(), { mult: 4 });
          break;
        case 'glass':
          tally.push(glyphSource(), { xMult: 2 });
          break;
        case 'gilded':
          tally.push(glyphSource(), { gold: 2 });
          break;
        default:
          break;
      }
      for (const fx of effects) fx.hooks.onCardScored?.(cardCtx(fx));
    }
    if (card.glyph === 'glass' && chance(rng, GLASS_BREAK_CHANCE)) shattered.add(card.id);
  });

  for (const fx of effects) {
    fx.hooks.onLineScored?.({ ...baseCtx(fx), ...info, ...tally.contrib(fx.source) });
  }

  const light = Math.max(0, tally.light);
  const mult = Math.max(0, tally.mult);
  return { line, combo, cells, steps: tally.steps, light, mult, total: Math.floor(light * mult), gold: tally.gold };
}

function withCell(source: StepSource, cell: number): StepSource {
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
  const scored = lines.map((line) => scoreLine(run, night, line, effects, rng, shattered));

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
