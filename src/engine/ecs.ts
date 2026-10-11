/**
 * Минимальный ECS. Сущность — число, компонент — типизированный токен со своим
 * хранилищем, система — объект с `update`. Без архетипов: сущностей на экране
 * карточной игры сотни, а не сотни тысяч, и простые Map здесь быстрее любого
 * «умного» устройства по накладным расходам.
 */

export type Entity = number;

export interface ComponentType<T> {
  readonly id: number;
  readonly name: string;
  /** Фантомное поле — только для вывода типа. */
  readonly __type?: T;
}

let nextComponentId = 0;

export function defineComponent<T>(name: string): ComponentType<T> {
  return { id: nextComponentId++, name };
}

export interface System<R = unknown> {
  readonly name: string;
  update(world: World<R>, dt: number): void;
}

type Store = Map<Entity, unknown>;

export class World<R = unknown> {
  private nextEntity: Entity = 1;
  private readonly alive = new Set<Entity>();
  private readonly stores: Store[] = [];
  private readonly systems: System<R>[] = [];
  private readonly destroyListeners: ((e: Entity) => void)[] = [];

  /** Общие ресурсы мира: время, камера, раскладка и т.п. */
  constructor(readonly res: R) {}

  create(): Entity {
    const e = this.nextEntity++;
    this.alive.add(e);
    return e;
  }

  isAlive(e: Entity): boolean {
    return this.alive.has(e);
  }

  destroy(e: Entity): void {
    if (!this.alive.delete(e)) return;
    for (const store of this.stores) store?.delete(e);
    for (const fn of this.destroyListeners) fn(e);
  }

  onDestroy(fn: (e: Entity) => void): void {
    this.destroyListeners.push(fn);
  }

  private store<T>(type: ComponentType<T>): Map<Entity, T> {
    let store = this.stores[type.id];
    if (!store) {
      store = new Map();
      this.stores[type.id] = store;
    }
    return store as Map<Entity, T>;
  }

  add<T>(e: Entity, type: ComponentType<T>, value: T): T {
    if (!this.alive.has(e)) throw new Error(`add ${type.name}: сущность ${e} мертва`);
    this.store(type).set(e, value);
    return value;
  }

  get<T>(e: Entity, type: ComponentType<T>): T | undefined {
    return this.store(type).get(e);
  }

  /** Компонент, который обязан быть. */
  req<T>(e: Entity, type: ComponentType<T>): T {
    const value = this.store(type).get(e);
    if (value === undefined) throw new Error(`У сущности ${e} нет ${type.name}`);
    return value;
  }

  has(e: Entity, type: ComponentType<unknown>): boolean {
    return this.store(type).has(e);
  }

  remove(e: Entity, type: ComponentType<unknown>): void {
    this.store(type).delete(e);
  }

  /** Сущности со всеми перечисленными компонентами. Возвращает снимок — можно удалять по ходу. */
  query(...types: ComponentType<unknown>[]): Entity[] {
    if (types.length === 0) return [...this.alive];
    const stores = types.map((t) => this.store(t));
    const [smallest, ...rest] = [...stores].sort((a, b) => a.size - b.size);
    const result: Entity[] = [];
    for (const e of smallest!.keys()) {
      if (rest.every((s) => s.has(e))) result.push(e);
    }
    return result;
  }

  count(): number {
    return this.alive.size;
  }

  addSystem(system: System<R>): this {
    this.systems.push(system);
    return this;
  }

  update(dt: number): void {
    for (const system of this.systems) system.update(this, dt);
  }
}
