import { MOVES_PER_GOLD } from './content/balance';
import { runNightReward, runNightTarget } from './content/stakes';
import { cloneCard } from './deck';
import type { BaseCtx } from './effects';
import { buildLines, ignitedLines, pickSealedCells } from './grid';
import { shuffle } from './rng';
import { buildRules } from './rules';
import { activeEffects, scorePlacement } from './scoring';
import { COMBO_IDS, NIGHT_KINDS, type GameEvent, type NightState, type RunState } from './types';

import { RuleError } from './errors';

function requireNight(run: RunState): NightState {
  if (run.phase !== 'night' || !run.night || run.night.result !== 'playing') {
    throw new RuleError('notNight');
  }
  return run.night;
}

function baseCtx(run: RunState, night: NightState, data: Record<string, number>): BaseCtx {
  return { run, night, rules: night.rules, rng: run.rng, data };
}

/** Добирает карты в руку до `count` штук, замешивая сброс при пустой колоде. */
function drawTo(run: RunState, night: NightState, count: number, events: GameEvent[]): void {
  const drawn = [];
  while (night.hand.length < count) {
    if (night.drawPile.length === 0) {
      if (night.discard.length === 0) break;
      night.drawPile = shuffle(run.rng, night.discard);
      night.discard = [];
      events.push({ t: 'reshuffle', count: night.drawPile.length });
    }
    const card = night.drawPile.pop()!;
    night.hand.push(card);
    drawn.push(card);
  }
  if (drawn.length) events.push({ t: 'draw', cards: drawn });
}

/** Начинает ночь `run.nightIndex` текущего созвездия. */
export function startNight(run: RunState): GameEvent[] {
  if (run.phase !== 'map') throw new RuleError('notMap');
  const kind = NIGHT_KINDS[run.nightIndex]!;
  const bossId = kind === 'eclipse' ? (run.bosses[run.ante - 1] ?? null) : null;
  const rules = buildRules(run, bossId);
  const cellCount = rules.gridSize * rules.gridSize;
  const sealedCells = pickSealedCells(run.rng, rules.gridSize, rules.sealedCells);
  const sealed = Array.from({ length: cellCount }, (_, i) => sealedCells.includes(i));

  const night: NightState = {
    kind,
    bossId,
    target: runNightTarget(run, kind, bossId),
    score: 0,
    rules,
    movesLeft: rules.moves,
    burnsLeft: rules.burns,
    hand: [],
    drawPile: shuffle(run.rng, run.deck.map(cloneCard)),
    discard: [],
    grid: Array(cellCount).fill(null),
    sealed,
    placements: 0,
    ignitions: 0,
    linesIgnited: 0,
    bestPlacement: 0,
    result: 'playing',
  };
  run.night = night;
  run.phase = 'night';

  const events: GameEvent[] = [{ t: 'nightStart', kind, bossId, target: night.target, sealed: sealedCells }];
  for (const fx of activeEffects(run, night)) fx.hooks.onNightStart?.(baseCtx(run, night, fx.data));
  drawTo(run, night, rules.handSize, events);
  return events;
}

/** Выкладывает карту из руки в пустую клетку. */
export function placeCard(run: RunState, handIndex: number, cell: number): GameEvent[] {
  const night = requireNight(run);
  if (handIndex < 0 || handIndex >= night.hand.length) throw new RuleError('noCard');
  if (cell < 0 || cell >= night.grid.length || night.grid[cell] || night.sealed[cell]) {
    throw new RuleError('cellTaken');
  }
  const events: GameEvent[] = [];
  const [card] = night.hand.splice(handIndex, 1);
  night.grid[cell] = card!;
  night.movesLeft -= 1;
  night.placements += 1;
  events.push({ t: 'place', card: card!, handIndex, cell });

  const lines = ignitedLines(buildLines(night.rules), night.grid, night.sealed, cell);
  const effects = activeEffects(run, night);
  if (lines.length > 0) {
    const score = scorePlacement(run, night, lines, run.rng);
    night.score += score.total;
    night.ignitions += 1;
    night.linesIgnited += lines.length;
    night.bestPlacement = Math.max(night.bestPlacement, score.total);
    trackStats(run, score.total, lines.length, score.lines.map((l) => l.combo));
    events.push({ t: 'ignite', score, scoreAfter: night.score });

    if (score.gold !== 0) {
      const before = run.gold;
      run.gold = Math.max(0, run.gold + score.gold);
      if (score.gold > 0) run.stats.goldEarned += score.gold;
      if (run.gold !== before) events.push({ t: 'gold', amount: run.gold - before, goldAfter: run.gold });
    }
    for (const fx of effects) {
      fx.hooks.onIgnite?.({ ...baseCtx(run, night, fx.data), lines: score.lines, total: score.total });
    }
    for (const omen of run.omens) events.push({ t: 'omenChanged', uid: omen.uid });

    const cleared = [...new Set(score.lines.flatMap((l) => l.cells))];
    const shattered = new Set(score.shattered);
    for (const c of cleared) {
      const placed = night.grid[c]!;
      if (shattered.has(placed.id)) {
        events.push({ t: 'shatter', cardId: placed.id, cell: c });
        run.deck = run.deck.filter((d) => d.id !== placed.id);
      } else {
        night.discard.push(placed);
      }
      night.grid[c] = null;
    }
    events.push({ t: 'clear', cells: cleared });
  } else {
    for (const fx of effects) fx.hooks.onQuietPlacement?.(baseCtx(run, night, fx.data));
  }

  if (night.score >= night.target) {
    finishNight(run, true, events);
    return events;
  }
  drawTo(run, night, night.rules.handSize, events);
  if (night.movesLeft <= 0) finishNight(run, false, events, 'moves');
  else if (night.hand.length === 0) finishNight(run, false, events, 'cards');
  return events;
}

/** Сжигает карту из руки и добирает новую. */
export function burnCard(run: RunState, handIndex: number): GameEvent[] {
  const night = requireNight(run);
  if (night.burnsLeft <= 0) throw new RuleError('noBurns');
  if (handIndex < 0 || handIndex >= night.hand.length) throw new RuleError('noCard');
  const [card] = night.hand.splice(handIndex, 1);
  night.burnsLeft -= 1;
  night.discard.push(card!);
  const events: GameEvent[] = [{ t: 'burn', card: card!, handIndex }];
  for (const fx of activeEffects(run, night)) fx.hooks.onBurn?.(baseCtx(run, night, fx.data));
  drawTo(run, night, night.rules.handSize, events);
  return events;
}

function trackStats(run: RunState, total: number, lines: number, combos: string[]): void {
  run.stats.linesIgnited += lines;
  if (lines >= 2) run.stats.crosses += 1;
  run.stats.bestPlacement = Math.max(run.stats.bestPlacement, total);
  for (const combo of combos) {
    if (COMBO_IDS.indexOf(combo as never) > COMBO_IDS.indexOf(run.stats.bestCombo)) {
      run.stats.bestCombo = combo as (typeof COMBO_IDS)[number];
    }
  }
}

function finishNight(run: RunState, won: boolean, events: GameEvent[], reason: 'moves' | 'cards' = 'moves'): void {
  const night = run.night!;
  night.result = won ? 'won' : 'lost';
  for (const fx of activeEffects(run, null)) fx.hooks.onNightEnd?.({ run, rng: run.rng, data: fx.data, won });
  if (!won) {
    run.phase = 'gameOver';
    events.push({ t: 'nightLost', reason });
    return;
  }
  run.stats.nightsWon += 1;
  const base = runNightReward(run, night.kind);
  const moves = Math.floor(night.movesLeft / MOVES_PER_GOLD);
  const burns = night.burnsLeft;
  const interest = Math.min(Math.floor(run.gold / night.rules.interestStep), night.rules.interestCap);
  run.reward = { base, moves, burns, interest, total: base + moves + burns + interest };
  run.phase = 'reward';
  events.push({ t: 'nightWon' });
}
