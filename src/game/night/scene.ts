import type { Card, GameEvent, RunState } from '@/core/types';
import type { Entity } from '@/engine/ecs';
import type { FlareVariant } from './flare';
import type { Hud } from '@/ui/hud';
import { CardView, Transform } from '../components';
import type { Services } from '../context';
import type { NightLayout } from '../layout';
import { BoardView } from './board-view';
import { Forecast } from './forecast';
import { SceneInput } from './input';
import { Presenter } from './presenter';

/**
 * Ограничение ходов для обучения: какую карту и куда можно положить, можно ли
 * сжигать. Пустой объект — любые действия запрещены (идёт объяснение).
 */
export interface Guide {
  card?: number;
  cell?: number;
  burn?: boolean;
  free?: boolean;
}

export type NightAction = { kind: 'place'; handIndex: number; cell: number } | { kind: 'burn'; handIndex: number };

export interface SceneHooks {
  /** Применить действие к ядру. null — действие отклонено (сцена вернёт карту). */
  act(action: NightAction): GameEvent[] | null;
  /** События проиграны — приложение решает, что дальше. */
  onSettled(events: GameEvent[]): void;
  onSelect?(handIndex: number | null): void;
  /**
   * Раскладка широкого ПК (CQ.5, `wideDesktop`, выбор Дениса — вариант C): карты и табло крупнее,
   * табло прижато к небу, под ним созвездия со светом и множителем.
   */
  wide?: boolean;
  /** Яркая вспышка созвездия (CQ.6, `brightFlare`): вариант витрины; null — прежняя. */
  flare?: FlareVariant | null;
}

export interface CellState {
  entity: Entity;
  sealed: boolean;
  /** 0..1 — подсветка «сюда можно положить». */
  avail: number;
  hover: number;
  /** 0..1 — линия вспыхнет при этом ходе. */
  ignite: number;
  igniteColor: string;
  /** Сколько линий закроет карта в этой клетке (0, 1, 2+) — подсказка чтения поля. */
  closes: number;
  closesAnim: number;
  /** 0..1 — подсветка клетки обучением. */
  tut: number;
  /** Что вспыхнет в этой клетке: созвездия выбранной карты или лучшей карты руки. */
  forecast: { name: string; dir: 'row' | 'col' | 'diag' | null }[];
  /** Прогноз для выбранной карты (а не лучший из руки). */
  forecastPicked: boolean;
  /** Прогноз — только Россыпь: ход почти ничего не даст. */
  forecastWeak: boolean;
  /** Карта руки, которая даст прогноз (когда карта не выбрана). */
  forecastCard: Card | null;
}

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Сцена ночи: где что лежит (рука, небо, выбор) и ход игрока от касания до подсчёта.
 * Части: `view` — раскладка и рисование, `input` — касания и клавиатура, `forecast` —
 * прогноз на небе. Анимации событий ядра проигрывает `presenter`: сцена знает «где что
 * лежит», презентер — «как это показать».
 */
export class NightScene {
  layout!: NightLayout;
  readonly cards = new Map<number, Entity>();
  hand: number[] = [];
  board: (number | null)[] = [];
  cells: CellState[] = [];
  selected: number | null = null;
  busy = false;
  readonly presenter: Presenter;
  readonly view: BoardView;
  readonly input: SceneInput;
  readonly forecast: Forecast;
  private destroyed = false;
  private readonly unsubscribers: (() => void)[] = [];

  constructor(
    readonly svc: Services,
    readonly run: RunState,
    readonly hud: Hud,
    readonly hooks: SceneHooks,
  ) {
    this.view = new BoardView(this);
    this.input = new SceneInput(this);
    this.forecast = new Forecast(this);
    this.presenter = new Presenter(this);
    this.presenter.flare = hooks.flare ?? null;
    this.view.computeLayout();
    if (import.meta.env.DEV) (window as unknown as { __scene: NightScene }).__scene = this;
  }

  get night() {
    return this.run.night!;
  }

  get world() {
    return this.svc.world;
  }

  /** Создаёт клетки и карты по текущему стейту ночи (новая ночь или продолжение). */
  build(): void {
    const n = this.night;
    this.cells = n.grid.map((_, i) => this.view.createCell(i, n.sealed[i] ?? false));
    this.board = n.grid.map((card) => (card ? card.id : null));
    n.grid.forEach((card, cell) => {
      if (!card) return;
      const p = this.layout.cells[cell]!;
      const e = this.createCard(card, p.x, p.y, 'board');
      this.world.req(e, CardView).cell = cell;
      this.world.req(e, Transform).scale = this.boardScale;
    });
    this.hand = [];
    for (const card of n.hand) {
      this.createCard(card, this.layout.deck.x, this.layout.deck.y, 'hand');
      this.hand.push(card.id);
    }
    this.layoutHand(false);
    this.forecast.refreshClosers();
    const onResize = () => {
      if (this.destroyed) return;
      this.view.relayout();
      // Холст пересоздаётся при смене размера — подпись для скринридера ставим заново
      this.input.labelCanvas();
    };
    this.unsubscribers.push(this.svc.renderer.onResize(onResize), this.svc.input.on(this.input.onPointer));
    window.addEventListener('keydown', this.input.onKey);
    this.unsubscribers.push(() => window.removeEventListener('keydown', this.input.onKey));
    this.input.labelCanvas();
  }

  // ─── Для презентера, обучения и окон ────────────────────────────────────

  get boardScale(): number {
    return this.view.boardScale;
  }

  createCard(card: Card, x: number, y: number, zone: CardView['zone']): Entity {
    return this.view.createCard(card, x, y, zone);
  }

  /** Раскладывает руку веером. */
  layoutHand(animate = true, skip?: Entity): Promise<void> {
    return this.view.layoutHand(animate, skip);
  }

  /** Прямоугольник клетки в CSS-пикселях. */
  cellRect(cell: number): Rect {
    return this.view.cellRect(cell);
  }

  /** Прямоугольник карты руки по id. */
  handRect(cardId: number): Rect | null {
    return this.view.handRect(cardId);
  }

  /** Общий прямоугольник нескольких клеток. */
  cellsRect(cells: readonly number[]): Rect {
    return this.view.cellsRect(cells);
  }

  /** Прямоугольник всей руки. */
  handAreaRect(): Rect {
    return this.view.handAreaRect();
  }

  /** Ограничение обучения (null — играем свободно). */
  setGuide(guide: Guide | null): void {
    this.input.setGuide(guide);
  }

  /** Обучение придерживает первый подсчёт на открытой формуле, пока игрок не нажмёт «Далее». */
  setScoringGate(gate: (() => Promise<void>) | null): void {
    this.presenter.scoringGate = gate;
  }

  /** Обучение показывает под формулой, из чего она складывается. */
  setExplain(on: boolean): void {
    this.presenter.explain = on;
  }

  /** Обучение замедляет подсчёт, чтобы успеть прочитать подписи. */
  setStepPause(k: number): void {
    this.presenter.stepPause = k;
  }

  // ─── Выбор и ход ────────────────────────────────────────────────────────

  select(index: number | null, relayout = true): void {
    if (index !== this.selected && index !== null) {
      this.svc.audio.tick();
      this.svc.haptics.play('select');
    }
    this.selected = index;
    this.hooks.onSelect?.(index);
    for (const c of this.cells) {
      const target = index !== null && !c.sealed ? 1 : 0;
      void this.svc.tweens.to(c, { avail: target }, { duration: 0.2 });
    }
    if (index === null) this.input.setHover(null);
    else this.forecast.resetPlacement();
    if (!this.busy) this.forecast.refreshForecast();
    if (relayout) void this.layoutHand(true);
  }

  // ─── Действия ───────────────────────────────────────────────────────────

  async place(handIndex: number, cell: number, dragged?: Entity): Promise<void> {
    if (this.busy) return;
    if (!this.input.allowPlace(handIndex, cell)) {
      this.input.deny();
      this.input.setHover(null);
      void this.layoutHand(true);
      return;
    }
    // Карту выкладывают клавиатурой, пока её держит палец, — палец её больше не ведёт
    if (dragged === undefined) this.input.releaseIfDragging(this.hand[handIndex]);
    const events = this.hooks.act({ kind: 'place', handIndex, cell });
    if (!events) {
      this.select(handIndex);
      return;
    }
    this.busy = true;
    this.selected = null;
    this.hooks.onSelect?.(null);
    this.input.setHover(null);
    // Карта легла — подписи «что соберётся» и метки креста больше не о чём: гасим сразу,
    // чтобы не висели поверх вспышки (вернутся после подсчёта для новых клеток)
    for (const c of this.cells) {
      c.forecast = [];
      c.forecastCard = null;
      c.closesAnim = 0;
    }
    for (const c of this.cells) void this.svc.tweens.to(c, { avail: 0, ignite: 0 }, { duration: 0.15 });
    await this.presenter.play(events, dragged);
    this.forecast.refreshClosers();
    this.busy = false;
    if (!this.destroyed) this.hooks.onSettled(events);
  }

  async burnSelected(): Promise<void> {
    if (this.busy || this.selected === null) return;
    const guide = this.input.guide;
    if (guide && !guide.free && !(guide.burn && this.hand[this.selected] === guide.card)) return this.input.deny();
    const handIndex = this.selected;
    this.input.releaseIfDragging(this.hand[handIndex]);
    const events = this.hooks.act({ kind: 'burn', handIndex });
    if (!events) return;
    this.busy = true;
    this.selected = null;
    this.hooks.onSelect?.(null);
    this.input.setHover(null);
    for (const c of this.cells) void this.svc.tweens.to(c, { avail: 0 }, { duration: 0.15 });
    await this.presenter.play(events);
    this.forecast.refreshForecast();
    this.busy = false;
    if (!this.destroyed) this.hooks.onSettled(events);
  }

  /** Первые карты ночи прилетают из колоды. */
  async dealIn(): Promise<void> {
    this.busy = true;
    const ids = [...this.hand];
    for (const id of ids) {
      const e = this.cards.get(id)!;
      const t = this.world.req(e, Transform);
      t.x = this.layout.deck.x;
      t.y = this.layout.deck.y;
      t.flip = -1;
    }
    await this.presenter.dealToHand(ids);
    this.busy = false;
  }

  destroy(): void {
    this.destroyed = true;
    for (const [, e] of this.cards) this.world.destroy(e);
    for (const c of this.cells) this.world.destroy(c.entity);
    this.cards.clear();
    this.presenter.dispose();
    this.hud.setPreview(null);
    this.hud.hideCalc();
    for (const off of this.unsubscribers) off();
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }
}
