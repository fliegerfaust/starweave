import { comboFeatures } from '../combos';
import { activeCells, buildLines } from '../grid';
import { burnCard, placeCard, startNight } from '../night';
import { buyItem, buyOmen, omenSlots } from '../shop';
import { omenDef } from '../content/omens';
import { choose, currentChoice, skipChoice } from '../choices';
import { chooseRoute, currentNode, isWonder, routeOptions, visitWonder } from '../route';
import { RuleError } from '../errors';
import type { GiftOffer } from '../gift';
import type { CometEvent, ScopeUpgrade } from '../wonders';
import type { BodyId, Card, Glyph, NightState, RunState } from '../types';

/** Вес точки креста в оценке позиции (подобран симуляцией). */
export const CROSS_WEIGHT = Number(globalThis.process?.env?.CROSS_WEIGHT ?? 60);
/** Сколько лучших ходов просматривать на ход вперёд. */
export const LOOKAHEAD = Number(globalThis.process?.env?.LOOKAHEAD ?? 6);

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
  const lines = buildLines(night.rules);
  let value = 0;
  for (const line of lines) {
    if (!line.cells.includes(cell)) continue;
    const active = activeCells(line, night.sealed);
    const cards = active.map((c) => night.grid[c]).filter((c): c is Card => !!c);
    value += linePotential(cards, active.length);
  }
  // Точки креста: пустая клетка, закрывающая сразу две линии, — будущий ×2
  for (let c = 0; c < night.grid.length; c++) {
    if (night.grid[c] || night.sealed[c]) continue;
    let closes = 0;
    for (const line of lines) {
      if (!line.cells.includes(c)) continue;
      const active = activeCells(line, night.sealed);
      if (active.every((x) => x === c || night.grid[x])) closes++;
    }
    if (closes >= 2) value += CROSS_WEIGHT * closes;
  }
  return value;
}

/** Оценка одного хода: очки сразу + потенциал позиции. */
function evaluate(run: RunState, handIndex: number, cell: number): { value: number; sim: RunState } {
  const sim = structuredClone(run);
  const events = placeCard(sim, handIndex, cell);
  const ignite = events.find((e) => e.t === 'ignite');
  let value = ignite && ignite.t === 'ignite' ? ignite.score.total : 0;
  if (sim.night && sim.phase === 'night') value += positionalValue(sim.night, cell) * (1 + run.ante * 0.5);
  return { value, sim };
}

function candidates(run: RunState): Move[] {
  const night = run.night!;
  const moves: Move[] = [];
  night.hand.forEach((_, handIndex) => {
    night.grid.forEach((occupant, cell) => {
      if (occupant || night.sealed[cell]) return;
      moves.push({ handIndex, cell, value: 0 });
    });
  });
  return moves;
}

/**
 * Выбор хода: жадная оценка всех ходов, затем для лучших — просмотр на ход вперёд
 * оставшимися картами руки (новую карту бот не знает). Так он видит кресты.
 */
export function bestMove(run: RunState, lookahead = LOOKAHEAD): Move | null {
  const night = run.night;
  if (!night || night.result !== 'playing') return null;
  const scored = candidates(run).map((m) => {
    const { value, sim } = evaluate(run, m.handIndex, m.cell);
    return { ...m, value, sim };
  });
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.value - a.value);
  if (lookahead > 0) {
    for (const m of scored.slice(0, lookahead)) {
      if (m.sim.phase !== 'night' || !m.sim.night || m.sim.night.movesLeft <= 0) continue;
      let follow = 0;
      for (const next of candidates(m.sim)) {
        // Карты, пришедшие добором, бот не видит — смотрим только старые
        const card = m.sim.night.hand[next.handIndex]!;
        if (!night.hand.some((c) => c.id === card.id)) continue;
        follow = Math.max(follow, evaluate(m.sim, next.handIndex, next.cell).value);
      }
      m.value += follow * 0.6;
    }
    scored.sort((a, b) => b.value - a.value);
  }
  const { handIndex, cell, value } = scored[0]!;
  return { handIndex, cell, value };
}

/** Играет текущую ночь до конца. */
export function playNight(run: RunState, lookahead = LOOKAHEAD): void {
  while (run.phase === 'night' && run.night?.result === 'playing') {
    const move = bestMove(run, lookahead);
    if (!move) break;
    if (move.value < 5 && run.night.burnsLeft > 0) {
      burnCard(run, move.handIndex);
      continue;
    }
    placeCard(run, move.handIndex, move.cell);
  }
}

/**
 * Развилка главы (RT.1): Яркая ночь, пока есть место для Знамения и глава не поздняя, —
 * иначе спокойная ночь. Без развилки ничего не делает.
 */
export function pickRoute(run: RunState): void {
  const options = routeOptions(run.chapter);
  if (run.phase !== 'map' || run.chapter.at >= 0 || !options.length) return;
  const find = (route: string) => options.find((i) => run.chapter.nodes[i]!.route === route);
  const wantBright = run.omens.length < omenSlots(run) && run.ante <= 5;
  // Телескоп — когда Знамения уже собраны: улучшить колоду без риска ночи
  chooseRoute(run, (wantBright ? find('bright') : (find('telescope') ?? find('night'))) ?? find('night') ?? options[0]!);
}

/** Ценность обмена Кометы и улучшения Телескопа для бота (RT.6, подобрано симом). */
const COMET_VALUE: Record<CometEvent, number> = {
  goldForOmen: 4, goldForChart: 3, goldForCopy: 3, cardForGlyph: 3, omenForOmen: 3,
  chartSwap: 2, goldForBanish: 2, rankShift: 1, suitShift: 1, omenForGold: 0.5,
};
const SCOPE_VALUE: Record<ScopeUpgrade['u'], number> = { chart: 3, glyph: 3, banish: 2 };

/** Комета или Телескоп: самый ценный вариант, который можно взять, иначе мимо. */
export function wonderGreedy(run: RunState): void {
  const choice = currentChoice(run);
  if (choice?.kind !== 'comet' && choice?.kind !== 'telescope') return;
  const value = (i: number): number => {
    const o = choice.options[i]!;
    return 'e' in o ? COMET_VALUE[o.e] : SCOPE_VALUE[o.u];
  };
  const order = choice.options.map((_, i) => i).sort((a, b) => value(b) - value(a));
  for (const i of order) {
    try {
      return choose(run, i);
    } catch (e) {
      if (!(e instanceof RuleError)) throw e;
    }
  }
  skipChoice(run);
}

/** С карты главы — до начала ночи: выбрать путь, пройти шаги без ночи, начать ночь. */
export function enterNight(run: RunState): void {
  while (run.phase === 'map') {
    pickRoute(run);
    if (isWonder(currentNode(run).route)) {
      visitWonder(run);
      wonderGreedy(run);
      continue;
    }
    startNight(run);
    return;
  }
}

/** Ценность черт в даре для бота: подобрано симом (GF.6), пропуск — «чистое небо». */
const GIFT_VALUE: Record<Glyph | BodyId, number> = {
  gilded: 2, blazing: 3, radiant: 3, echo: 3, glass: 3, prism: 2,
  polaris: 3, meteor: 2, pulsar: 3, twin: 2, nebula: 4, blackhole: 3,
};
const ASCEND_VALUE = 2;
/** Чистое небо дороже, когда колода уже толстая: нужные карты приходят реже. */
function skipValue(run: RunState): number {
  return 1.5 + Math.max(0, run.deck.length - 36) * 0.25;
}

/** Ценность варианта дара: черта, масть, которую колода собирает, и ранг. */
export function giftValue(run: RunState, offer: GiftOffer): number {
  if (offer.k === 'ascend') return ASCEND_VALUE;
  const { card } = offer;
  const trait = card.body ?? card.glyph;
  const suitShare = run.deck.filter((c) => c.suit === card.suit).length / Math.max(1, run.deck.length);
  return (trait ? GIFT_VALUE[trait] : 1) + suitShare * 2 + card.rank * 0.05;
}

/** Дар ночи: лучший вариант или «чистое небо», если ничего не дотягивает. */
export function giftGreedy(run: RunState): void {
  const choice = currentChoice(run);
  if (choice?.kind !== 'gift') return;
  const values = choice.options.map((o) => giftValue(run, o));
  const best = values.indexOf(Math.max(...values));
  if (values[best]! > skipValue(run)) choose(run, best);
  else skipChoice(run);
}

/** Знамение 1 из 3 (Яркая ночь, пакет): самое редкое, если есть место, иначе пропуск. */
export function omenPickGreedy(run: RunState): void {
  const choice = currentChoice(run);
  if (choice?.kind !== 'pack' || choice.pack !== 'omen') return;
  if (run.omens.length >= omenSlots(run)) return skipChoice(run);
  const best = choice.options.reduce((b, id, i) => (omenDef(id).rarity > omenDef(choice.options[b]!).rarity ? i : b), 0);
  choose(run, best);
}

/** Простая политика Обсерватории: дар ночи, Знамение Яркой ночи, Знамения по редкости, затем Звёздные карты. */
export function shopGreedy(run: RunState): void {
  giftGreedy(run);
  omenPickGreedy(run);
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
