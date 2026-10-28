import { describe, expect, it } from 'vitest';
import { PRODUCTS, expandOwned, isPermanent, productForCosmetic, productsFor } from '../src/store/catalog';
import { Entitlements } from '../src/store/entitlements';

describe('каталог покупок', () => {
  it('набор поддержки открывает атлас и его внешний вид', () => {
    const owned = expandOwned(['supporter']);
    for (const id of ['atlas', 'back:astrolabe', 'sky:astrolabe', 'back:patron', 'sky:patron']) expect(owned.has(id)).toBe(true);
    expect(expandOwned(['atlas']).has('back:patron')).toBe(false);
  });

  it('чаевые — только в Telegram и не навсегда', () => {
    expect(productsFor('yandex').some((p) => p.kind === 'tip')).toBe(false);
    expect(productsFor('telegram').filter((p) => p.kind === 'tip')).toHaveLength(3);
    expect(isPermanent('tip_small')).toBe(false);
    expect(isPermanent('atlas')).toBe(true);
    expect(isPermanent('нет-такого')).toBe(false);
  });

  it('у каждого платного предмета внешнего вида есть товар', () => {
    expect(productForCosmetic('back', 'comet')?.id).toBe('back_comet');
    expect(productForCosmetic('sky', 'astrolabe')?.id).toBe('atlas');
    expect(productForCosmetic('back', 'classic')).toBeNull();
  });

  it('id товаров уникальны и годятся для консолей площадок', () => {
    const ids = PRODUCTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9_]{1,30}$/);
  });
});

describe('купленное на устройстве', () => {
  it('список площадки заменяет копию, чаевые не хранятся', () => {
    const e = new Entitlements();
    let changes = 0;
    e.onChange(() => changes++);
    e.add('tip_small');
    expect(changes).toBe(0);
    e.add('atlas');
    expect(e.has('sky:astrolabe')).toBe(true);
    e.replace(['back_comet', 'tip_large']);
    expect(e.has('atlas')).toBe(false);
    expect(e.has('back:comet')).toBe(true);
    expect(changes).toBe(2);
  });
});

