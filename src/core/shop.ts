import { CHART_PRICE, RARITY_WEIGHT, REROLL_BASE, SHOP_ITEM_SLOTS, SHOP_OMEN_SLOTS } from './content/balance';
import { OMEN_LIST, omenDef } from './content/omens';
import { RITUAL_LIST, ritualDef } from './content/rituals';
import { RuleError } from './errors';
import { chance, pick, weightedPick } from './rng';
import { buildRules } from './rules';
import { createOmen } from './omen-instance';
import { COMBO_IDS, type Card, type ComboId, type RunState, type ShopItem, type ShopState } from './types';

function rollOmens(run: RunState, count: number, exclude: Set<string>): ShopItem[] {
  const items: ShopItem[] = [];
  for (let i = 0; i < count; i++) {
    const pool = OMEN_LIST.filter((o) => !exclude.has(o.id));
    if (!pool.length) break;
    const def = weightedPick(run.rng, pool, (o) => RARITY_WEIGHT[o.rarity]);
    exclude.add(def.id);
    items.push({ kind: 'omen', omenId: def.id, price: def.price, sold: false });
  }
  return items;
}

/** Звёздные карты чаще выпадают на то, что игрок уже собирает. */
function rollChart(run: RunState): ShopItem {
  const combo = weightedPick(run.rng, COMBO_IDS.filter((c) => c !== 'scatter'), (c: ComboId) =>
    run.comboLevels[c] > 1 ? 3 : 1,
  );
  return { kind: 'chart', combo, price: CHART_PRICE, sold: false };
}

function rollItems(run: RunState, count: number): ShopItem[] {
  const items: ShopItem[] = [];
  const seen = new Set<string>();
  while (items.length < count) {
    if (chance(run.rng, 0.45)) {
      const item = rollChart(run);
      if (item.kind === 'chart' && seen.has(item.combo)) continue;
      if (item.kind === 'chart') seen.add(item.combo);
      items.push(item);
    } else {
      const pool = RITUAL_LIST.filter((r) => (r.available?.(run) ?? true) && !seen.has(r.id));
      const def = pick(run.rng, pool);
      seen.add(def.id);
      items.push({ kind: 'ritual', ritualId: def.id, price: def.price, sold: false });
    }
  }
  return items;
}

export function generateShop(run: RunState): ShopState {
  const owned = new Set(run.omens.map((o) => o.id));
  return {
    omens: rollOmens(run, SHOP_OMEN_SLOTS, owned),
    items: rollItems(run, SHOP_ITEM_SLOTS),
    rerollCost: REROLL_BASE,
  };
}

function requireShop(run: RunState): ShopState {
  if (run.phase !== 'shop' || !run.shop) throw new RuleError('Мы не в Обсерватории');
  return run.shop;
}

function pay(run: RunState, price: number): void {
  if (run.gold < price) throw new RuleError('Не хватает золота');
  run.gold -= price;
}

export function omenSlots(run: RunState): number {
  return buildRules(run, null).omenSlots;
}

export function buyOmen(run: RunState, slot: number): void {
  const shop = requireShop(run);
  const item = shop.omens[slot];
  if (!item || item.kind !== 'omen' || item.sold) throw new RuleError('Нечего покупать');
  if (run.omens.length >= omenSlots(run)) throw new RuleError('Нет свободных слотов Знамений');
  pay(run, item.price);
  item.sold = true;
  run.omens.push(createOmen(run, item.omenId));
}

export function sellPrice(omenId: string): number {
  return Math.max(1, Math.floor(omenDef(omenId).price / 2));
}

export function sellOmen(run: RunState, uid: number): void {
  requireShop(run);
  const index = run.omens.findIndex((o) => o.uid === uid);
  if (index < 0) throw new RuleError('Нет такого Знамения');
  run.gold += sellPrice(run.omens[index]!.id);
  run.omens.splice(index, 1);
}

/** Меняет местами Знамения — порядок влияет на подсчёт. */
export function moveOmen(run: RunState, from: number, to: number): void {
  if (from < 0 || to < 0 || from >= run.omens.length || to >= run.omens.length) throw new RuleError('Нет слота');
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
  if (!item || item.sold) throw new RuleError('Нечего покупать');
  if (item.kind === 'chart') {
    pay(run, item.price);
    run.comboLevels[item.combo] += 1;
  } else if (item.kind === 'ritual') {
    const def = ritualDef(item.ritualId);
    const targets = targetIds.map((id) => run.deck.find((c) => c.id === id)).filter((c): c is Card => !!c);
    if (targets.length !== new Set(targetIds).size || targets.length < def.minTargets || targets.length > def.maxTargets) {
      throw new RuleError('Неверный выбор карт');
    }
    if (def.canTarget && !targets.every(def.canTarget)) throw new RuleError('Карта не подходит');
    if (def.available && !def.available(run)) throw new RuleError('Ритуал сейчас недоступен');
    pay(run, item.price);
    def.apply(run, targets);
  } else {
    throw new RuleError('Знамения покупаются через buyOmen');
  }
  item.sold = true;
}

export function reroll(run: RunState): void {
  const shop = requireShop(run);
  pay(run, shop.rerollCost);
  shop.rerollCost += 1;
  const owned = new Set([...run.omens.map((o) => o.id)]);
  shop.omens = rollOmens(run, SHOP_OMEN_SLOTS, owned);
  shop.items = rollItems(run, SHOP_ITEM_SLOTS);
}
