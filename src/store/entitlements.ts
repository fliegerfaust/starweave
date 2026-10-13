import { KEYS, storage } from '@/meta/storage';
import { expandOwned, isPermanent } from './catalog';

/**
 * Что куплено на этой площадке. Правда — у площадки (сервер бота, SDK Яндекса), здесь —
 * её копия на устройстве, чтобы атлас работал сразу при запуске и без сети.
 */
export class Entitlements {
  private bought: string[];
  private all: Set<string>;
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
  }

  /** Купленное и всё, что оно открывает (`atlas`, `back:astrolabe`, …). */
  get owned(): ReadonlySet<string> {
    return this.all;
  }

  has(id: string): boolean {
    return this.all.has(id);
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
    this.all = expandOwned(this.bought);
    storage.set(KEYS.owned, JSON.stringify(this.bought));
    if (!same) for (const fn of this.listeners) fn();
  }
}
