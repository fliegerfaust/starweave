import { registry } from '@/core/content/registry';
/**
 * Каталог покупок — один на все площадки. Силу игры не продаём: только атлас (новый
 * контент, который не сильнее бесплатного), внешний вид и поддержку автора.
 *
 * Цены в Telegram Stars — здесь и в `server/src/catalog.ts` (тест сверяет их). На Яндексе
 * и в сторах цену задаёт консоль площадки, игра показывает то, что вернул её SDK.
 */

export type ProductKind = 'unlock' | 'cosmetic' | 'tip';

/** Внешний вид: рубашка карт или небо за игрой. */
export type CosmeticSlot = 'back' | 'sky';

export interface Product {
  id: string;
  kind: ProductKind;
  /** Цена в Telegram Stars. */
  stars: number;
  /** Что ещё открывает покупка: другие товары и предметы внешнего вида (`back:…`, `sky:…`). */
  grants: string[];
  /** Только для площадок из списка (чаевые есть лишь в Telegram). */
  platforms?: readonly string[];
}

export const PRODUCTS: Product[] = [
  { id: 'atlas', kind: 'unlock', stars: 250, grants: ['back:astrolabe', 'sky:astrolabe'] },
  { id: 'supporter', kind: 'unlock', stars: 500, grants: ['atlas', 'back:astrolabe', 'sky:astrolabe', 'back:patron', 'sky:patron'] },
  { id: 'back_comet', kind: 'cosmetic', stars: 75, grants: ['back:comet'] },
  { id: 'back_aurora', kind: 'cosmetic', stars: 75, grants: ['back:aurora'] },
  { id: 'sky_aurora', kind: 'cosmetic', stars: 75, grants: ['sky:aurora'] },
  { id: 'sky_ember', kind: 'cosmetic', stars: 75, grants: ['sky:ember'] },
  { id: 'tip_small', kind: 'tip', stars: 25, grants: [], platforms: ['telegram'] },
  { id: 'tip_medium', kind: 'tip', stars: 100, grants: [], platforms: ['telegram'] },
  { id: 'tip_large', kind: 'tip', stars: 250, grants: [], platforms: ['telegram'] },
];

export const PRODUCT_BY_ID: Record<string, Product> = registry(PRODUCTS);

export function productsFor(platform: string): Product[] {
  return PRODUCTS.filter((p) => !p.platforms || p.platforms.includes(platform));
}

/** Разовые покупки, которые остаются навсегда (чаевые — нет). */
export function isPermanent(id: string): boolean {
  const p = PRODUCT_BY_ID[id];
  return !!p && p.kind !== 'tip';
}

/**
 * Всё, чем владеет игрок: купленные товары плюс то, что они открывают
 * (набор поддержки → атлас → рубашка и небо атласа).
 */
export function expandOwned(ids: Iterable<string>): Set<string> {
  const out = new Set<string>();
  const stack = [...ids];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const g of PRODUCT_BY_ID[id]?.grants ?? []) stack.push(g);
  }
  return out;
}

/** Каким товаром открывается предмет внешнего вида (для кнопки «Купить» в примерочной). */
export function productForCosmetic(slot: CosmeticSlot, id: string): Product | null {
  const key = `${slot}:${id}`;
  return PRODUCTS.find((p) => p.kind === 'cosmetic' && p.grants.includes(key)) ?? PRODUCTS.find((p) => p.grants.includes(key)) ?? null;
}
