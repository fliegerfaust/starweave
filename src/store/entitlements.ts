import { KEYS, storage } from '@/meta/storage';
import { expandOwned, isPermanent } from './catalog';

/**
 * Что куплено на этой площадке. Правда — у площадки (сервер бота, SDK Яндекса), здесь —
 * её копия на устройстве, чтобы атлас работал сразу при запуске и без сети.
 */
export class Entitlements {
  private bought: string[];
  /** Открытое площадкой даром (CrazyGames): не хранится и не считается покупкой. */
  private granted: string[] = [];
  private all: Set<string>;
  private paidAll: Set<string>;
  private listeners: (() => void)[] = [];

  constructor() {
    let list: string[] = [];
    try {
      const raw = JSON.parse(storage.get(KEYS.owned) ?? '[]') as unknown;
      if (Array.isArray(raw)) list = raw.filter((x): x is string => typeof x === 'string' && isPermanent(x));
    } catch {
      /* битая копия — дождёмся площадки */
    }
    this.bought = list;
    this.all = expandOwned(list);
    this.paidAll = this.all;
  }

  /** Купленное и всё, что оно открывает (`atlas`, `back:astrolabe`, …). */
  get owned(): ReadonlySet<string> {
    return this.all;
  }

  has(id: string): boolean {
    return this.all.has(id);
  }

  /** Куплено, а не подарено площадкой: только покупка атласа убирает рекламу. */
  paid(id: string): boolean {
    return this.paidAll.has(id);
  }

  /** Товары, которые площадка открывает бесплатно. */
  grant(ids: readonly string[]): void {
    this.granted = ids.filter(isPermanent);
    this.recount();
    for (const fn of this.listeners) fn();
  }

  /** Список от площадки заменяет копию целиком (возвраты тоже учитываются). */
  replace(list: readonly string[]): void {
    this.set(list.filter(isPermanent));
  }

  add(id: string): void {
    if (!isPermanent(id) || this.bought.includes(id)) return;
    this.set([...this.bought, id]);
  }

  onChange(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((x) => x !== fn);
    };
  }

  private set(list: string[]): void {
    const same = list.length === this.bought.length && list.every((x) => this.bought.includes(x));
    this.bought = [...new Set(list)];
    this.recount();
    storage.set(KEYS.owned, JSON.stringify(this.bought));
    if (!same) for (const fn of this.listeners) fn();
  }

  private recount(): void {
    this.paidAll = expandOwned(this.bought);
    this.all = expandOwned([...this.bought, ...this.granted]);
  }
}
