import { OMEN_LIST, omenDef } from './content/omens';
import { MIN_DECK_SIZE } from './content/rituals';
import { RuleError } from './errors';
import { createOmen } from './omen-instance';
import { pick, shuffle, weightedPick } from './rng';
import { omenSlots, sellPrice } from './shop';
import { COMBO_IDS, GLYPHS, MAX_RANK, MIN_RANK, SUITS, type Card, type ComboId, type Glyph, type RunState, type Suit } from './types';

/**
 * Комета (RT.4): шаг главы без ночи — 1 из 3 обменов «отдай → получи» или мимо. Каждый
 * обмен — конкретные карты, Знамения и числа, разыгранные при входе: игрок видит, что
 * именно отдаёт и что получает.
 */
export type CometTrade =
  /** Золото → Знамение. */
  | { e: 'goldForOmen'; gold: number; omen: string }
  /** Убрать карту → другая карта получает глиф. */
  | { e: 'cardForGlyph'; give: number; target: number; glyph: Glyph }
  /** Знамение → золото (больше цены продажи). */
  | { e: 'omenForGold'; uid: number; gold: number }
  /** Золото → два уровня созвездия. */
  | { e: 'goldForChart'; gold: number; combo: ComboId }
  /** Одна карта −2 ранга, другая +2. */
  | { e: 'rankShift'; down: number; up: number }
  /** Две карты меняют масть на одну. */
  | { e: 'suitShift'; cards: number[]; suit: Suit }
  /** Золото → убрать две слабые карты. */
  | { e: 'goldForBanish'; gold: number; cards: number[] }
  /** Уровень одного созвездия → два уровня другого. */
  | { e: 'chartSwap'; from: ComboId; to: ComboId }
  /** Золото → копия сильной карты. */
  | { e: 'goldForCopy'; gold: number; card: number }
  /** Знамение → другое, редкостью выше. */
  | { e: 'omenForOmen'; uid: number; omen: string };

export type CometEvent = CometTrade['e'];
export const COMET_EVENTS: readonly CometEvent[] = ['goldForOmen', 'cardForGlyph', 'omenForGold', 'goldForChart', 'rankShift', 'suitShift', 'goldForBanish', 'chartSwap', 'goldForCopy', 'omenForOmen'];

/** Телескоп (RT.4): шаг без ночи — 1 из 3 улучшений. */
export type ScopeUpgrade =
  /** +1 уровень созвездия. */
  | { u: 'chart'; combo: ComboId }
  /** Карта колоды получает глиф. */
  | { u: 'glyph'; card: number; glyph: Glyph }
  /** Убрать карту из колоды. */
  | { u: 'banish'; card: number };

/** Сколько вариантов у Кометы и Телескопа. */
export const WONDER_OPTIONS = 3;
/**
 * Цены Кометы (RT.6). Шаг без ночи уже стоит награды за ночь, лавки и дара, поэтому золотом
 * Комета берёт меньше Обсерватории (было 6/4/3/5). Сим, 200 забегов: отставание пути «всегда
 * Комета» от «всегда ночь» почти не зависит от цены (глава 3.1 против 3.6) — его даёт
 * пропущенная ночь; дешевле — уже копеечная покупка.
 */
const COMET_PRICE = { omen: 4, chart: 3, banish: 2, copy: 4 } as const;
/** Комета платит за Знамение больше, чем Обсерватория. */
const COMET_SELL_BONUS = 4;

const plain = (c: Card) => !c.glyph && !c.body;
const byRank = (a: Card, b: Card) => a.rank - b.rank || a.id - b.id;
const charts = COMBO_IDS.filter((c) => c !== 'scatter');

/**
 * Обмен ранга в Комете — «переливание» (CM, отзыв Андрея 28.10, выбор Дениса 29.10). Раньше
 * бралась случайная карта на −2 и случайная на +2: «5 Солнца → 3, 3 Солнца → 5» — карты просто
 * менялись местами. Теперь растёт старшая карта пары, младшая отдаёт ей 2 ранга: сила собирается
 * в одной карте, и перестановки не бывает. Пара — одной масти, если такая найдётся.
 */
function rankShift(run: RunState): CometTrade | null {
  const free = run.deck.filter((c) => c.body !== 'nebula');
  const ups = free.filter((c) => c.rank <= MAX_RANK - 2);
  if (!ups.length) return null;
  const up = pick(run.rng, ups);
  const lower = (c: Card) => c.id !== up.id && c.rank < up.rank && c.rank >= MIN_RANK + 2;
  const same = free.filter((c) => lower(c) && c.suit === up.suit);
  const downs = same.length ? same : free.filter(lower);
  if (!downs.length) return null;
  return { e: 'rankShift', up: up.id, down: pick(run.rng, downs).id };
}

/** Обмены, возможные сейчас (хватает золота, карт, Знамений), — разыгранные от ГПСЧ забега. */
function cometCandidates(run: RunState): CometTrade[] {
  const out: CometTrade[] = [];
  const deck = run.deck;
  const owned = new Set(run.omens.map((o) => o.id));
  const free = run.omens.length < omenSlots(run);
  const pool = OMEN_LIST.filter((o) => run.unlocks.omens.includes(o.id) && (!o.myths || run.unlocks.myths) && !o.pair && !owned.has(o.id));
  if (free && pool.length && run.gold >= COMET_PRICE.omen) out.push({ e: 'goldForOmen', gold: COMET_PRICE.omen, omen: pick(run.rng, pool).id });
  const plains = deck.filter(plain);
  if (plains.length >= 2 && deck.length > MIN_DECK_SIZE) {
    const [give, target] = shuffle(run.rng, [...plains]);
    out.push({ e: 'cardForGlyph', give: give!.id, target: target!.id, glyph: pick(run.rng, GLYPHS) });
  }
  if (run.omens.length) {
    const o = pick(run.rng, run.omens);
    out.push({ e: 'omenForGold', uid: o.uid, gold: sellPrice(o.id) + COMET_SELL_BONUS });
    const rarer = pool.filter((d) => d.rarity > omenDef(o.id).rarity);
    if (rarer.length) out.push({ e: 'omenForOmen', uid: o.uid, omen: pick(run.rng, rarer).id });
  }
  if (run.gold >= COMET_PRICE.chart) out.push({ e: 'goldForChart', gold: COMET_PRICE.chart, combo: pick(run.rng, charts) });
  const shift = rankShift(run);
  if (shift) out.push(shift);
  const suit = pick(run.rng, SUITS);
  const others = deck.filter((c) => c.suit !== suit);
  if (others.length >= 2) out.push({ e: 'suitShift', cards: shuffle(run.rng, [...others]).slice(0, 2).map((c) => c.id), suit });
  if (run.gold >= COMET_PRICE.banish && deck.length - 2 >= MIN_DECK_SIZE) out.push({ e: 'goldForBanish', gold: COMET_PRICE.banish, cards: [...deck].sort(byRank).slice(0, 2).map((c) => c.id) });
  const lv = charts.filter((c) => run.comboLevels[c] > 1);
  if (lv.length) {
    const from = pick(run.rng, lv);
    out.push({ e: 'chartSwap', from, to: pick(run.rng, charts.filter((c) => c !== from)) });
  }
  if (run.gold >= COMET_PRICE.copy) out.push({ e: 'goldForCopy', gold: COMET_PRICE.copy, card: [...deck].sort((a, b) => byRank(b, a))[0]!.id });
  return out;
}

/** Три обмена Кометы (разные), или меньше, если возможных меньше. */
export function rollComet(run: RunState): CometTrade[] {
  return shuffle(run.rng, cometCandidates(run)).slice(0, WONDER_OPTIONS);
}

/** Три улучшения Телескопа: уровень созвездия, глиф на карту, убрать карту. */
export function rollScope(run: RunState): ScopeUpgrade[] {
  const out: ScopeUpgrade[] = [{ u: 'chart', combo: weightedPick(run.rng, charts, (c) => (run.comboLevels[c] > 1 ? 3 : 1)) }];
  const plains = run.deck.filter(plain);
  if (plains.length) out.push({ u: 'glyph', card: pick(run.rng, plains).id, glyph: pick(run.rng, GLYPHS) });
  if (run.deck.length > MIN_DECK_SIZE) out.push({ u: 'banish', card: [...run.deck].sort(byRank)[0]!.id });
  return out;
}

function card(run: RunState, id: number): Card {
  const c = run.deck.find((d) => d.id === id);
  if (!c) throw new RuleError('nothing');
  return c;
}

function pay(run: RunState, gold: number): void {
  if (run.gold < gold) throw new RuleError('noGold');
  run.gold -= gold;
}

function dropOmen(run: RunState, uid: number): void {
  const i = run.omens.findIndex((o) => o.uid === uid);
  if (i < 0) throw new RuleError('noOmen');
  run.omens.splice(i, 1);
}

/** Совершить обмен Кометы. Всё проверяется заново: забег мог измениться с броска. */
export function takeComet(run: RunState, t: CometTrade): void {
  switch (t.e) {
    case 'goldForOmen':
      if (run.omens.length >= omenSlots(run)) throw new RuleError('noSlots');
      pay(run, t.gold);
      run.omens.push(createOmen(run, t.omen));
      return;
    case 'cardForGlyph': {
      const target = card(run, t.target);
      card(run, t.give);
      run.deck = run.deck.filter((c) => c.id !== t.give);
      target.glyph = t.glyph;
      return;
    }
    case 'omenForGold':
      dropOmen(run, t.uid);
      run.gold += t.gold;
      run.stats.goldEarned += t.gold;
      return;
    case 'goldForChart':
      pay(run, t.gold);
      run.comboLevels[t.combo] += 2;
      return;
    case 'rankShift': {
      const down = card(run, t.down);
      const up = card(run, t.up);
      down.rank = Math.max(MIN_RANK, down.rank - 2);
      up.rank = Math.min(MAX_RANK, up.rank + 2);
      return;
    }
    case 'suitShift':
      for (const id of t.cards) card(run, id).suit = t.suit;
      return;
    case 'goldForBanish':
      t.cards.forEach((id) => card(run, id));
      pay(run, t.gold);
      run.deck = run.deck.filter((c) => !t.cards.includes(c.id));
      return;
    case 'chartSwap':
      if (run.comboLevels[t.from] <= 1) throw new RuleError('nothing');
      run.comboLevels[t.from] -= 1;
      run.comboLevels[t.to] += 2;
      return;
    case 'goldForCopy': {
      const c = card(run, t.card);
      pay(run, t.gold);
      run.deck.push({ ...structuredClone(c), id: run.nextCardId++ });
      return;
    }
    case 'omenForOmen': {
      const i = run.omens.findIndex((o) => o.uid === t.uid);
      if (i < 0) throw new RuleError('noOmen');
      run.omens.splice(i, 1, createOmen(run, t.omen));
      return;
    }
  }
}

/** Принять улучшение Телескопа. */
export function takeScope(run: RunState, s: ScopeUpgrade): void {
  if (s.u === 'chart') run.comboLevels[s.combo] += 1;
  else if (s.u === 'glyph') card(run, s.card).glyph = s.glyph;
  else {
    card(run, s.card);
    if (run.deck.length <= MIN_DECK_SIZE) throw new RuleError('nothing');
    run.deck = run.deck.filter((c) => c.id !== s.card);
  }
}
