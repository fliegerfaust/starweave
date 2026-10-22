import { GENTLE_NIGHT, MOVES_PER_GOLD } from './content/balance';
import { evaluateCombo } from './combos';
import { runNightReward } from './content/stakes';
import { cloneCard } from './deck';
import { neighbours, traitOf } from './content/traits';
import type { BaseCtx, CellFate } from './effects';
import { activeCells, buildLines, ignitedLines, pickSealedCells } from './grid';
import { shuffle, weightedPick } from './rng';
import { currentNode, isWonder, planNight } from './route';
import { activeEffects, type ActiveEffect } from './effect-sources';
import { scorePlacement } from './scoring';
import { COMBO_IDS, type Card, type GameEvent, type Line, type NightState, type PlacementScore, type RunState } from './types';

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
    const card = night.gentle ? drawGentle(run, night) : night.drawPile.pop()!;
    night.hand.push(card);
    drawn.push(card);
  }
  if (drawn.length) events.push({ t: 'draw', cards: drawn });
}

/**
 * Насколько карта поможет собрать созвездие: лучшее созвездие, которое она закроет на
 * небе, плюс совпадения рангов и мастей с незаконченными линиями и с рукой.
 */
export function cardHelpfulness(night: NightState, card: Card): number {
  const lines = buildLines(night.rules);
  let board = 0;
  night.grid.forEach((placed, cell) => {
    if (placed || night.sealed[cell]) return;
    let here = 0;
    for (const line of lines) {
      if (!line.cells.includes(cell)) continue;
      const active = activeCells(line, night.sealed);
      const others = active.filter((c) => c !== cell && night.grid[c]).map((c) => night.grid[c]!);
      if (others.length === active.length - 1 && others.length >= 1) {
        const cards = active.map((c) => (c === cell ? card : night.grid[c]!));
        here += COMBO_IDS.indexOf(evaluateCombo(cards, night.rules)) * 3;
      } else if (others.length > 0) {
        if (others.every((o) => o.suit === card.suit)) here += 2 * others.length;
        if (others.some((o) => o.rank === card.rank)) here += 2 * others.length;
      }
    }
    board = Math.max(board, here);
  });
  let hand = 0;
  for (const h of night.hand) {
    if (h.rank === card.rank) hand += 2;
    if (h.suit === card.suit) hand += 1;
  }
  return board + hand;
}

/** Щедрый добор: из нескольких верхних карт чаще выпадает та, что сложится в созвездие. */
function drawGentle(run: RunState, night: NightState): Card {
  const pile = night.drawPile;
  const window = pile.slice(-GENTLE_NIGHT.window);
  const card = weightedPick(run.rng, window, (c) => (1 + cardHelpfulness(night, c)) ** 2);
  pile.splice(pile.lastIndexOf(card), 1);
  return card;
}

/** Начинает текущую ночь плана главы. */
export function startNight(run: RunState): GameEvent[] {
  if (run.phase !== 'map') throw new RuleError('notMap');
  // Развилка: путь сначала выбирают (команда `route`)
  if (run.chapter.at < 0) throw new RuleError('noRoute');
  // Комета и Телескоп — без ночи: в них входят командой `visit`
  if (isWonder(currentNode(run).route) || run.pending.length) throw new RuleError('nothing');
  const plan = planNight(run, currentNode(run));
  const { kind, bossId, rules } = plan;
  const cellCount = rules.gridSize * rules.gridSize;
  const sealedCells = pickSealedCells(run.rng, rules.gridSize, rules.sealedCells);
  const sealed = Array.from({ length: cellCount }, (_, i) => sealedCells.includes(i));

  const night: NightState = {
    kind,
    bossId,
    target: plan.target,
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
  if (plan.gentle) night.gentle = true;
  run.night = night;
  run.phase = 'night';

  const events: GameEvent[] = [{ t: 'nightStart', kind, bossId, target: night.target, sealed: sealedCells }];
  for (const fx of activeEffects(run, night)) fx.hooks.onNightStart?.(baseCtx(run, night, fx.data));
  drawTo(run, night, rules.handSize, events);
  return events;
}

/**
 * Ход «выложить карту» по этапам (TD.3). Каждый этап читает и дополняет `Turn`; механики
 * 0.7 встают в свой этап, не трогая соседей: тела при выкладке — в `onPlaced`, фигуры мифа —
 * рядом с линиями в `formations`, «карта остаётся» — в политике клеток.
 */
interface Turn {
  run: RunState;
  night: NightState;
  handIndex: number;
  cell: number;
  card: Card;
  effects: ActiveEffect[];
  events: GameEvent[];
  /** Вспыхнувшие формации хода; пока это линии. */
  lines: Line[];
  score: PlacementScore | null;
}

type Stage = (turn: Turn) => void;

/** Выкладка: карта из руки в клетку, ход потрачен. */
const layCard: Stage = (turn) => {
  const { night, handIndex, cell, card, events } = turn;
  night.hand.splice(handIndex, 1);
  night.grid[cell] = card;
  night.movesLeft -= 1;
  night.placements += 1;
  events.push({ t: 'place', card, handIndex, cell });
};

/** Карта легла: её черта (Метеор) и эффекты «при выкладке» срабатывают до поиска линий. */
const placed: Stage = (turn) => {
  const { run, night, card, cell, events } = turn;
  const trait = traitOf(card);
  if (trait?.onPlaced) {
    const closing = new Set(ignitedLines(buildLines(night.rules), night.grid, night.sealed, cell).flatMap((l) => l.cells));
    trait.onPlaced({
      night,
      rules: night.rules,
      card,
      cell,
      closing,
      knock(target) {
        const out = night.grid[target];
        if (!out) return;
        night.grid[target] = null;
        night.discard.push(out);
        events.push({ t: 'knocked', cardId: out.id, cell: target, by: cell });
      },
    });
  }
  for (const fx of turn.effects) fx.hooks.onPlaced?.({ ...baseCtx(run, night, fx.data), card, cell });
};

/** Формации: какие линии через клетку заполнены. */
const formations: Stage = (turn) => {
  const { night, cell } = turn;
  turn.lines = ignitedLines(buildLines(night.rules), night.grid, night.sealed, cell);
};

/** Подсчёт: свет, золото и счётчики Знамений; без вспышки — тихий ход. */
const scoring: Stage = (turn) => {
  const { run, night, lines, events, effects } = turn;
  if (lines.length === 0) {
    for (const fx of effects) fx.hooks.onQuietPlacement?.(baseCtx(run, night, fx.data));
    return;
  }
  const score = scorePlacement(run, night, lines, run.rng);
  turn.score = score;
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
  chargePulsars(night, lines, events);
  for (const omen of run.omens) events.push({ t: 'omenChanged', uid: omen.uid });
};

/**
 * Пульсар на небе копит множитель за каждую линию, вспыхнувшую рядом с ним (в соседних
 * клетках, и по диагонали). Линия через сам Пульсар не в счёт: он гаснет вместе с ней.
 * Заряд — до конца ночи и ко всем линиям, начиная со следующего хода.
 */
function chargePulsars(night: NightState, lines: Line[], events: GameEvent[]): void {
  night.grid.forEach((card, cell) => {
    const pulse = card ? traitOf(card)?.pulse : undefined;
    if (!pulse) return;
    const near = new Set(neighbours(cell, night.rules.gridSize, true));
    const count = lines.filter((l) => !l.cells.includes(cell) && l.cells.some((c) => near.has(c))).length;
    if (!count) return;
    night.pulse = (night.pulse ?? 0) + pulse * count;
    events.push({ t: 'pulse', cell, amount: pulse * count, total: night.pulse });
  });
}

/** Судьба карты вспыхнувшей линии: первый ответивший эффект, иначе — по подсчёту. */
function cellFate(turn: Turn, card: Card, cell: number): CellFate {
  const { run, night } = turn;
  const own = traitOf(card)?.fate;
  if (own) return own;
  for (const fx of turn.effects) {
    const fate = fx.hooks.cellFate?.({ ...baseCtx(run, night, fx.data), card, cell });
    if (fate) return fate;
  }
  return turn.score!.shattered.includes(card.id) ? 'shattered' : 'fades';
}

/** Политика клеток: карты вспыхнувших линий гаснут в сброс, остаются или разбиваются. */
const settleCells: Stage = (turn) => {
  const { run, night, score, events } = turn;
  if (!score) return;
  const cleared: number[] = [];
  for (const c of new Set(score.lines.flatMap((l) => l.cells))) {
    const placedCard = night.grid[c]!;
    const fate = cellFate(turn, placedCard, c);
    if (fate === 'stays') {
      events.push({ t: 'cardStays', cardId: placedCard.id, cell: c });
      continue;
    }
    if (fate === 'shattered' || fate === 'consumed') {
      events.push({ t: 'cardDestroyed', cardId: placedCard.id, cell: c, reason: fate });
      run.deck = run.deck.filter((d) => d.id !== placedCard.id);
    } else {
      night.discard.push(placedCard);
    }
    night.grid[c] = null;
    cleared.push(c);
  }
  events.push({ t: 'clear', cells: cleared });
};

/** Добор и конец ночи: цель набрана — победа без добора; иначе ходы или карты кончились. */
const drawOrFinish: Stage = (turn) => {
  const { run, night, events } = turn;
  if (night.score >= night.target) return finishNight(run, true, events);
  drawTo(run, night, night.rules.handSize, events);
  if (night.movesLeft <= 0) finishNight(run, false, events, 'moves');
  else if (night.hand.length === 0) finishNight(run, false, events, 'cards');
};

const PLACE_STAGES: readonly Stage[] = [layCard, placed, formations, scoring, settleCells, drawOrFinish];

/**
 * Этапы до подсчёта включительно. Их хуки (`onPlaced`, подсчёт, `onIgnite`) меняют только ночь,
 * данные Знамений, ГПСЧ, золото и статистику забега — поэтому прогнозу хватает песочницы из этих
 * полей. Хук, которому нужно больше (колода, лавка), ставится после подсчёта.
 */
const PREVIEW_STAGES: readonly Stage[] = [layCard, placed, formations, scoring];

/**
 * Что вспыхнет, если выложить карту (TD.16): этапы хода до подсчёта на песочнице — копия ночи,
 * Знамений и статистики, своя случайность `seed`. Колоду, лавку и журнал не копирует: прогноз
 * считается на каждую пару «карта × клетка». `null` — ход невозможен или ничего не вспыхнет.
 */
export function previewTurn(run: RunState, handIndex: number, cell: number, seed: number): PlacementScore | null {
  const night = run.night;
  if (run.phase !== 'night' || !night || night.result !== 'playing') return null;
  if (handIndex < 0 || handIndex >= night.hand.length || cell < 0 || cell >= night.grid.length || night.grid[cell] || night.sealed[cell]) return null;
  const sim: RunState = { ...run, night: structuredClone(night), omens: structuredClone(run.omens), rng: { s: seed }, stats: { ...run.stats } };
  const simNight = sim.night!;
  const turn: Turn = { run: sim, night: simNight, handIndex, cell, card: simNight.hand[handIndex]!, effects: activeEffects(sim, simNight), events: [], lines: [], score: null };
  for (const stage of PREVIEW_STAGES) stage(turn);
  return turn.score;
}

/** Выкладывает карту из руки в пустую клетку. */
export function placeCard(run: RunState, handIndex: number, cell: number): GameEvent[] {
  const night = requireNight(run);
  if (handIndex < 0 || handIndex >= night.hand.length) throw new RuleError('noCard');
  if (cell < 0 || cell >= night.grid.length || night.grid[cell] || night.sealed[cell]) {
    throw new RuleError('cellTaken');
  }
  const turn: Turn = { run, night, handIndex, cell, card: night.hand[handIndex]!, effects: activeEffects(run, night), events: [], lines: [], score: null };
  for (const stage of PLACE_STAGES) stage(turn);
  return turn.events;
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
