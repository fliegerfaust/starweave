import { BANISH_SERVICE_PRICE, CHART_PRICE, PACK_OPTIONS, PACK_PRICE, RARITY_WEIGHT, REROLL_BASE, SHOP_ITEM_SLOTS, SHOP_OMEN_SLOTS, SHOP_PACK_SLOTS } from './content/balance';
import { resonanceOf } from './content/resonance';
import { OMEN_LIST, omenDef } from './content/omens';
import { MIN_DECK_SIZE, RITUAL_LIST, ritualDef } from './content/rituals';
import { stakePrice } from './content/stakes';
import { RuleError } from './errors';
import { chance, pick, shuffle, weightedPick } from './rng';
import { buildRules } from './rules';
import { offer } from './choices';
import { createOmen } from './omen-instance';
import { COMBO_IDS, type Card, type ComboId, type PackKind, type RunState, type ShopItem, type ShopState } from './types';

/** Вторая половина пары, которой игрок уже владеет, выпадает чаще (RS.1, баланс по симу): Резонанс находится. */
const RESONANCE_CALL = 3;
const calls = (run: RunState, id: string) => run.unlocks.resonance && run.omens.some((o) => !!resonanceOf(o.id, id));

function rollOmens(run: RunState, count: number, exclude: Set<string>): ShopItem[] {
  const items: ShopItem[] = [];
  for (let i = 0; i < count; i++) {
    const pool = OMEN_LIST.filter((o) => run.unlocks.omens.includes(o.id) && (!o.myths || run.unlocks.myths) && !o.pair && !exclude.has(o.id));
    if (!pool.length) break;
    const def = weightedPick(run.rng, pool, (o) => RARITY_WEIGHT[o.rarity] * (calls(run, o.id) ? RESONANCE_CALL : 1));
    exclude.add(def.id);
    items.push({ kind: 'omen', omenId: def.id, price: stakePrice(run, def.price), sold: false });
  }
  return items;
}

/** Звёздные карты чаще выпадают на то, что игрок уже собирает. */
function rollChart(run: RunState): ShopItem {
  const combo = weightedPick(run.rng, COMBO_IDS.filter((c) => c !== 'scatter'), (c: ComboId) =>
    run.comboLevels[c] > 1 ? 3 : 1,
  );
  return { kind: 'chart', combo, price: stakePrice(run, CHART_PRICE), sold: false };
}

/**
 * Ритуалы, которые в лавку не выпадают: «Изгнание» делает то же, что постоянная услуга
 * «Убрать карту», — два способа с разной ценой только путали (обзор 14.10.2026).
 */
const SERVICE_RITUALS = new Set(['banish']);

/** Ритуалы, которые могут выпасть в лавке или пакете. */
function shopRituals(run: RunState) {
  return RITUAL_LIST.filter((r) => run.unlocks.rituals.includes(r.id) && !SERVICE_RITUALS.has(r.id) && (r.available?.(run) ?? true));
}

/**
 * Первая глава — без ритуалов и пакетов: новичку хватает Знамений и Звёздных карт,
 * глифы и пакеты появляются со второй главы.
 */
export function isFirstChapter(run: RunState): boolean {
  return run.ante <= 1 && !run.endless;
}

function rollItems(run: RunState, count: number): ShopItem[] {
  const items: ShopItem[] = [];
  const seen = new Set<string>();
  const ritualsAllowed = !isFirstChapter(run);
  while (items.length < count) {
    if (!ritualsAllowed || chance(run.rng, 0.45)) {
      const item = rollChart(run);
      if (item.kind === 'chart' && seen.has(item.combo)) continue;
      if (item.kind === 'chart') seen.add(item.combo);
      items.push(item);
    } else {
      const pool = shopRituals(run).filter((r) => !seen.has(r.id));
      const def = pick(run.rng, pool);
      seen.add(def.id);
      items.push({ kind: 'ritual', ritualId: def.id, price: stakePrice(run, def.price), sold: false });
    }
  }
  return items;
}

function rollPacks(run: RunState, count: number): ShopItem[] {
  const kinds: PackKind[] = ['omen', 'ritual', 'chart'];
  return Array.from({ length: count }, () => {
    const pack = weightedPick(run.rng, kinds, (k) => (k === 'omen' ? 2 : 1));
    return { kind: 'pack', pack, price: stakePrice(run, PACK_PRICE[pack]), sold: false };
  });
}

export function generateShop(run: RunState): ShopState {
  const owned = new Set(run.omens.map((o) => o.id));
  return {
    omens: rollOmens(run, SHOP_OMEN_SLOTS, owned),
    items: rollItems(run, SHOP_ITEM_SLOTS),
    packs: isFirstChapter(run) ? [] : rollPacks(run, SHOP_PACK_SLOTS),
    rerollCost: REROLL_BASE,
  };
}

/** Знамение 1 из 3 без уже имеющихся — пакет Знамений и награда Яркой ночи (RT.1). */
export function omenOptions(run: RunState): string[] {
  const exclude = new Set(run.omens.map((o) => o.id));
  return rollOmens(run, PACK_OPTIONS, exclude).map((i) => (i.kind === 'omen' ? i.omenId : ''));
}

/** Варианты пакета — без повторов и без уже имеющихся Знамений. */
function packOptions(run: RunState, pack: PackKind): string[] {
  if (pack === 'omen') return omenOptions(run);
  if (pack === 'chart') {
    const pool = COMBO_IDS.filter((c) => c !== 'scatter');
    return shuffleCopy(run, pool).slice(0, PACK_OPTIONS);
  }
  const pool = shopRituals(run).map((r) => r.id);
  return shuffleCopy(run, pool).slice(0, PACK_OPTIONS);
}

function shuffleCopy<T>(run: RunState, items: readonly T[]): T[] {
  return shuffle(run.rng, [...items]);
}

/** Покупка пакета: деньги списываются, варианты встают в очередь выборов (`core/choices.ts`). */
export function buyPack(run: RunState, slot: number): void {
  const shop = requireShop(run);
  const item = shop.packs[slot];
  if (!item || item.kind !== 'pack' || item.sold) throw new RuleError('nothing');
  if (run.pending.length) throw new RuleError('nothing');
  // Пакет Знамений при полном ряде можно купить: при выборе своё Знамение заменяется (OB)
  pay(run, item.price);
  item.sold = true;
  offer(run, { kind: 'pack', pack: item.pack, options: packOptions(run, item.pack) });
}

function requireShop(run: RunState): ShopState {
  if (run.phase !== 'shop' || !run.shop) throw new RuleError('notShop');
  return run.shop;
}

function pay(run: RunState, price: number): void {
  if (run.gold < price) throw new RuleError('noGold');
  run.gold -= price;
}

export function omenSlots(run: RunState): number {
  return buildRules(run, null).omenSlots;
}

/**
 * Купить Знамение. `replace` — uid своего Знамения на замену (OB, отзыв Андрея 28.10): оно
 * продаётся, его цена идёт в оплату, новое встаёт на его место — порядок срабатывания не ломается.
 */
export function buyOmen(run: RunState, slot: number, replace?: number): void {
  const shop = requireShop(run);
  const item = shop.omens[slot];
  if (!item || item.kind !== 'omen' || item.sold) throw new RuleError('nothing');
  if (replace === undefined) {
    if (run.omens.length >= omenSlots(run)) throw new RuleError('noSlots');
    pay(run, item.price);
    item.sold = true;
    run.omens.push(createOmen(run, item.omenId));
    return;
  }
  const at = ownedIndex(run, replace);
  if (run.gold + sellPrice(run.omens[at]!.id) < item.price) throw new RuleError('noGold');
  replaceOmenAt(run, at, item.omenId);
  pay(run, item.price);
  item.sold = true;
}

function ownedIndex(run: RunState, uid: number): number {
  const at = run.omens.findIndex((o) => o.uid === uid);
  if (at < 0) throw new RuleError('noOmen');
  return at;
}

/** Своё Знамение на месте `at` продано, на его место встаёт новое `omenId`. */
function replaceOmenAt(run: RunState, at: number, omenId: string): void {
  run.gold += sellPrice(run.omens[at]!.id);
  run.omens[at] = createOmen(run, omenId);
}

/** Заменить своё Знамение (по uid) новым на том же месте, с продажей старого. Для пакета Знамений. */
export function replaceOmen(run: RunState, uid: number, omenId: string): void {
  replaceOmenAt(run, ownedIndex(run, uid), omenId);
}

export function sellPrice(omenId: string): number {
  return Math.max(1, Math.floor(omenDef(omenId).price / 2));
}

export function sellOmen(run: RunState, uid: number): void {
  requireShop(run);
  const index = run.omens.findIndex((o) => o.uid === uid);
  if (index < 0) throw new RuleError('noOmen');
  run.gold += sellPrice(run.omens[index]!.id);
  run.omens.splice(index, 1);
}

/**
 * Резонанс (RS.1): первое место ряда, где пара Знамений стоит рядом, — с него и следующего
 * они сольются. Нет пары или ступень не открыта — `-1`.
 */
export function resonanceAt(run: RunState): number {
  if (!run.unlocks.resonance) return -1;
  return run.omens.findIndex((o, i) => i + 1 < run.omens.length && !!resonanceOf(o.id, run.omens[i + 1]!.id));
}

/** Сливает пару с места `index` и соседнего в легендарное; второе место освобождается. */
export function fuseOmens(run: RunState, index: number): void {
  requireShop(run);
  const a = run.omens[index];
  const b = run.omens[index + 1];
  const res = run.unlocks.resonance && a && b ? resonanceOf(a.id, b.id) : undefined;
  if (!res) throw new RuleError('noOmen');
  run.omens.splice(index, 2, createOmen(run, res.id));
}

/** Меняет местами Знамения — порядок влияет на подсчёт. */
export function moveOmen(run: RunState, from: number, to: number): void {
  if (from < 0 || to < 0 || from >= run.omens.length || to >= run.omens.length) throw new RuleError('noSlot');
  const [omen] = run.omens.splice(from, 1);
  run.omens.splice(to, 0, omen!);
}

/**
 * Покупает предмет. Звёздная карта применяется сразу; ритуал требует `targetIds` —
 * карты из колоды, выбранные игроком.
 */
export function buyItem(run: RunState, slot: number, targetIds: number[] = []): void {
  const shop = requireShop(run);
  const item = shop.items[slot];
  if (!item || item.sold) throw new RuleError('nothing');
  if (item.kind === 'chart') {
    pay(run, item.price);
    run.comboLevels[item.combo] += 1;
  } else if (item.kind === 'ritual') {
    validateRitual(run, item.ritualId, targetIds);
    pay(run, item.price);
    applyRitual(run, item.ritualId, targetIds);
  } else {
    throw new RuleError('nothing');
  }
  item.sold = true;
}

/** Сколько карт ритуал реально может взять сейчас (Изгнание не опускает колоду ниже минимума). */
export function ritualMaxTargets(run: RunState, ritualId: string): number {
  const def = ritualDef(ritualId);
  return def.maxTargetsFor ? Math.min(def.maxTargets, def.maxTargetsFor(run)) : def.maxTargets;
}

function validateRitual(run: RunState, ritualId: string, targetIds: number[]): Card[] {
  const def = ritualDef(ritualId);
  const targets = targetIds.map((id) => run.deck.find((c) => c.id === id)).filter((c): c is Card => !!c);
  if (targets.length !== new Set(targetIds).size || targets.length < def.minTargets || targets.length > ritualMaxTargets(run, ritualId)) {
    throw new RuleError('badTargets');
  }
  if (def.canTarget && !targets.every(def.canTarget)) throw new RuleError('badTarget');
  if (def.available && !def.available(run)) throw new RuleError('ritualUnavailable');
  return targets;
}

export function applyRitual(run: RunState, ritualId: string, targetIds: number[]): void {
  const targets = validateRitual(run, ritualId, targetIds);
  ritualDef(ritualId).apply(run, targets);
}

/** Цена услуги «Убрать карту» с учётом звёздности; null — сейчас недоступна. */
export function banishServicePrice(run: RunState): number | null {
  const shop = run.shop;
  if (!shop || shop.banishUsed || run.deck.length <= MIN_DECK_SIZE) return null;
  return stakePrice(run, BANISH_SERVICE_PRICE);
}

/**
 * Постоянная услуга Обсерватории: убрать одну карту из колоды. В отличие от ритуала
 * «Изгнание», есть в каждом визите — колоду можно чистить, а не только раздувать.
 */
export function banishCard(run: RunState, cardId: number): void {
  const shop = requireShop(run);
  if (run.pending.length) throw new RuleError('nothing');
  const price = banishServicePrice(run);
  if (price === null) throw new RuleError('ritualUnavailable');
  if (!run.deck.some((c) => c.id === cardId)) throw new RuleError('badTarget');
  pay(run, price);
  run.deck = run.deck.filter((c) => c.id !== cardId);
  shop.banishUsed = true;
}

export function reroll(run: RunState): void {
  const shop = requireShop(run);
  if (run.pending.length) throw new RuleError('nothing');
  pay(run, shop.rerollCost);
  shop.rerollCost += 1;
  const owned = new Set([...run.omens.map((o) => o.id)]);
  shop.omens = rollOmens(run, SHOP_OMEN_SLOTS, owned);
  shop.items = rollItems(run, SHOP_ITEM_SLOTS);
}
