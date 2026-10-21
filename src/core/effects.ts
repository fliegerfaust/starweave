import type { RngState } from './rng';
import type { Card, ComboId, Line, LineScore, NightState, Rules, RunState } from './types';

/**
 * Общий интерфейс эффектов: его реализуют Знамения и Затмения. Хук объявляется только
 * если нужен. Порядок вызова: Знамения по слотам, затем Затмение.
 */
export interface EffectHooks {
  /** Меняет правила перед ночью. */
  modifyRules?(rules: Rules, data: Record<string, number>): void;
  /** Карта легла на небо, до поиска линий (Метеор, «сработало при выкладке»). */
  onPlaced?(ctx: PlacedCtx): void;
  /**
   * Что станет с картой вспыхнувшей линии: `undefined` — не решает этот эффект. Первый
   * ответ побеждает; никто не ответил — карта гаснет (Стекло — разбивается).
   */
  cellFate?(ctx: PlacedCtx): CellFate | undefined;
  /** Карта линии засчитана (вызывается на каждый перезапуск карты). */
  onCardScored?(ctx: CardCtx): void;
  /** Сколько раз дополнительно засчитать карту. */
  retriggers?(ctx: CardCtx): number;
  /** Все карты линии засчитаны. */
  onLineScored?(ctx: LineCtx): void;
  /** Все линии хода засчитаны, перед итоговым умножением. */
  onPlacementScored?(ctx: PlacementCtx): void;
  /** После хода со вспышкой — для счётчиков. */
  onIgnite?(ctx: IgniteCtx): void;
  /** После хода без вспышки. */
  onQuietPlacement?(ctx: BaseCtx): void;
  onBurn?(ctx: BaseCtx): void;
  onNightStart?(ctx: BaseCtx): void;
  onNightEnd?(ctx: NightEndCtx): void;
}

/**
 * Судьба карты после вспышки: гаснет в сброс, остаётся на небе, разбивается насовсем
 * (Стекло) или схлопывается и уходит из колоды (Чёрная дыра).
 */
export type CellFate = 'fades' | 'stays' | 'shattered' | 'consumed';

/** Карта на небе: только что выложенная или из вспыхнувшей линии. */
export interface PlacedCtx extends BaseCtx {
  card: Card;
  cell: number;
}

export interface BaseCtx {
  run: RunState;
  night: NightState;
  rules: Rules;
  rng: RngState;
  /** Изменяемое состояние Знамения (у Затмения — пустой объект на ночь). */
  data: Record<string, number>;
}

export interface Contrib {
  light(n: number): void;
  mult(n: number): void;
  xMult(n: number): void;
  gold(n: number): void;
}

export interface LineInfo {
  line: Line;
  combo: ComboId;
  /** Активные клетки линии и карты в них — по порядку чтения. */
  cells: number[];
  cards: Card[];
}

export interface CardCtx extends BaseCtx, Contrib, LineInfo {
  card: Card;
  cell: number;
}

export interface LineCtx extends BaseCtx, Contrib, LineInfo {}

/** Карта с чертой засчитывается: вклад черты подписывается в подсчёте её глифом. */
export interface TraitCtx extends Contrib {
  card: Card;
  cell: number;
}

export interface PlacementCtx extends BaseCtx {
  lines: LineScore[];
  /** Ход последний в ночи. */
  lastMove: boolean;
  xMult(n: number): void;
  gold(n: number): void;
}

export interface IgniteCtx extends BaseCtx {
  lines: LineScore[];
  total: number;
}

export interface NightEndCtx {
  run: RunState;
  rng: RngState;
  data: Record<string, number>;
  won: boolean;
}
