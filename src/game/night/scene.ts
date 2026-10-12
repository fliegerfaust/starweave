import { CARD_ASPECT, CARD_PAD, cardBack, cardFace } from '@/art/card';
import { roundRect } from '@/art/glyphs';
import { SUIT_COLORS, rgba } from '@/art/palette';
import { activeCells, buildLines } from '@/core/grid';
import type { Card, GameEvent, RunState } from '@/core/types';
import type { Entity } from '@/engine/ecs';
import type { PointerEventData } from '@/engine/input';
import type { Hud } from '@/ui/hud';
import { CardView, Drawable, Hit, Layer, Transform, transform } from '../components';
import type { Services } from '../context';
import { computeLayout, handPositions, isLandscape, type NightLayout, type PlayArea } from '../layout';
import { Presenter } from './presenter';
import { previewPlacement, type PlacementPreview } from './preview';

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
}

const DRAG_THRESHOLD = 8;

/**
 * Сцена ночи: сущности неба и руки, ввод и превью. Анимации событий ядра
 * делегируются Presenter'у; сцена знает «где что лежит», презентер — «как это
 * показать».
 */
export class NightScene {
  layout!: NightLayout;
  readonly cards = new Map<number, Entity>();
  hand: number[] = [];
  board: (number | null)[] = [];
  cells: CellState[] = [];
  selected: number | null = null;
  busy = false;
  private readonly presenter: Presenter;
  /** Клетка, нажатая при выбранной карте: карта ляжет на отпускании пальца. */
  private pendingCell: number | null = null;
  private drag: { id: number; entity: Entity; startX: number; startY: number; active: boolean; offY: number } | null = null;
  private hoverCell: number | null = null;
  private hoverHand: number | null = null;
  private preview: PlacementPreview | null = null;
  private previewKey = '';
  private destroyed = false;
  private readonly unsubscribers: (() => void)[] = [];

  constructor(
    readonly svc: Services,
    readonly run: RunState,
    readonly hud: Hud,
    private readonly hooks: SceneHooks,
  ) {
    this.presenter = new Presenter(this);
    this.computeLayout();
    if (import.meta.env.DEV) (window as unknown as { __scene: NightScene }).__scene = this;
  }

  get night() {
    return this.run.night!;
  }

  get world() {
    return this.svc.world;
  }

  // ─── Построение ─────────────────────────────────────────────────────────

  private computeLayout(): void {
    const { renderer } = this.svc;
    const { width, height } = renderer;
    const safe = safeInsets();
    const landscape = isLandscape(width, height);
    document.body.classList.toggle('landscape', landscape);
    const hud = this.hud.el.getBoundingClientRect();
    const actions = this.hud.actions.getBoundingClientRect();
    const area: PlayArea = landscape
      ? { top: safe.top, bottom: height - safe.bottom, left: Math.max(hud.right, actions.right), right: width }
      : { top: hud.bottom || safe.top + 168, bottom: actions.top || height - safe.bottom - 64, left: 0, right: width };
    this.layout = computeLayout(width, height, this.night.rules.gridSize, area);
    const root = document.documentElement.style;
    root.setProperty('--board-top', `${this.layout.board.y}px`);
    root.setProperty('--board-cx', `${this.layout.board.x + this.layout.board.w / 2}px`);
    // Панель подсчёта ложится поверх строки счёта HUD — так она не закрывает карты
    const mid = this.hud.el.querySelector('.hud-row.mid')?.getBoundingClientRect();
    if (mid) {
      root.setProperty('--calc-top', `${mid.top - 4}px`);
      root.setProperty('--calc-cx', `${mid.left + mid.width / 2}px`);
      root.setProperty('--calc-w', `${mid.width + 8}px`);
    }
  }

  /** Создаёт клетки и карты по текущему стейту ночи (новая ночь или продолжение). */
  build(): void {
    const n = this.night;
    this.cells = n.grid.map((_, i) => this.createCell(i, n.sealed[i] ?? false));
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
    this.refreshClosers();
    this.unsubscribers.push(this.svc.renderer.onResize(this.onResize), this.svc.input.on(this.onPointer));
  }

  /** Насколько выдвигается выбранная карта: вверх в портрете, влево в ландшафте. */
  get liftAmount(): number {
    return this.layout.mode === 'landscape' ? this.layout.handW * 0.22 : this.layout.handH * 0.16;
  }

  get boardScale(): number {
    return this.layout.cardW / this.layout.handW;
  }

  createCard(card: Card, x: number, y: number, zone: CardView['zone']): Entity {
    const e = this.world.create();
    const view: CardView = {
      card,
      width: this.layout.handW,
      faceUp: true,
      hideRank: this.night.rules.hideRanks && zone !== 'board',
      debuffed: this.night.rules.debuffSuit === card.suit,
      glow: 0,
      glowColor: SUIT_COLORS[card.suit].main,
      lift: 0,
      zone,
      cell: -1,
    };
    const t = this.world.add(e, Transform, transform(x, y));
    this.world.add(e, CardView, view);
    this.world.add(e, Hit, { w: this.layout.handW, h: this.layout.handH, enabled: true });
    const drawable: Drawable = {
      layer: zone === 'board' ? Layer.BoardCards : Layer.Hand,
      z: 0,
      visible: true,
      draw: (ctx) => this.drawCard(ctx, view, t),
    };
    this.world.add(e, Drawable, drawable);
    this.cards.set(card.id, e);
    return e;
  }

  private drawCard(ctx: CanvasRenderingContext2D, v: CardView, t: Transform): void {
    const dpr = this.svc.renderer.dpr;
    const w = v.width;
    const hgt = w / 0.7;
    // Спрайт рисуем с запасом — по самому крупному размеру карты на экране (небо, рука,
    // подъём при выкладке), — и только уменьшаем: растянутый спрайт мылит.
    const spriteW = Math.ceil(Math.max(this.layout.handW, this.layout.cardW) * 1.12);
    const k = w / spriteW;
    const pad = Math.ceil(spriteW * CARD_PAD) * k;
    const spriteH = Math.round(spriteW / CARD_ASPECT) * k;
    const showFace = v.faceUp && t.flip >= 0;
    const img = showFace ? cardFace(v.card, spriteW, dpr, { hideRank: v.hideRank }) : cardBack(spriteW, dpr);
    ctx.globalAlpha = t.alpha;
    if (this.layout.mode === 'landscape') ctx.translate(t.x - v.lift, t.y);
    else ctx.translate(t.x, t.y - v.lift);
    ctx.rotate(t.rot);
    ctx.scale(t.scale * Math.max(0.02, Math.abs(t.flip)), t.scale);
    if (v.glow > 0.01) {
      ctx.save();
      ctx.shadowColor = v.glowColor;
      ctx.shadowBlur = w * 0.35 * v.glow;
      roundRect(ctx, -w / 2, -hgt / 2, w, hgt, w * 0.09);
      ctx.fillStyle = rgba([255, 255, 255], 0.0001 + 0.12 * v.glow);
      ctx.fill();
      ctx.restore();
    }
    ctx.drawImage(img, -w / 2 - pad, -hgt / 2 - pad, w + pad * 2, spriteH + pad * 2);
    if (v.debuffed && showFace) {
      roundRect(ctx, -w / 2, -hgt / 2, w, hgt, w * 0.09);
      ctx.fillStyle = 'rgba(4,3,12,0.62)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,83,112,0.7)';
      ctx.lineWidth = w * 0.03;
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.22, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (v.glow > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      roundRect(ctx, -w / 2, -hgt / 2, w, hgt, w * 0.09);
      ctx.fillStyle = `rgba(255,255,255,${0.12 * v.glow})`;
      ctx.fill();
    }
  }

  private createCell(index: number, sealed: boolean): CellState {
    const e = this.world.create();
    const p = this.layout.cells[index]!;
    const t = this.world.add(e, Transform, transform(p.x, p.y, { alpha: 0 }));
    const state: CellState = { entity: e, sealed, avail: 0, hover: 0, ignite: 0, igniteColor: '#f6c25b', closes: 0, closesAnim: 0, tut: 0 };
    this.world.add(e, Drawable, {
      layer: Layer.Board,
      z: 0,
      visible: true,
      draw: (ctx) => this.drawCell(ctx, state, t),
    });
    void this.svc.tweens.to(t, { alpha: 1 }, { duration: 0.4, delay: index * 0.025 });
    return state;
  }

  private drawCell(ctx: CanvasRenderingContext2D, s: CellState, t: Transform): void {
    const { cardW: w, cardH: hgt } = this.layout;
    const x = t.x - w / 2;
    const y = t.y - hgt / 2;
    const r = w * 0.09;
    const time = this.world.res.time;
    ctx.globalAlpha = t.alpha;
    roundRect(ctx, x, y, w, hgt, r);
    if (s.sealed) {
      const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, w * 0.7);
      g.addColorStop(0, 'rgba(0,0,0,0.9)');
      g.addColorStop(1, 'rgba(40,10,30,0.7)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,83,112,0.45)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(t.x, t.y, w * 0.2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,83,112,0.6)';
      ctx.stroke();
      return;
    }
    ctx.fillStyle = `rgba(30,26,80,${0.28 + s.hover * 0.25})`;
    ctx.fill();
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    const a = 0.16 + s.avail * (0.22 + pulse * 0.18) + s.hover * 0.4;
    ctx.strokeStyle = `rgba(170,160,255,${a})`;
    ctx.lineWidth = 1 + s.hover;
    ctx.setLineDash([4, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Звёздочки по углам клетки
    ctx.fillStyle = `rgba(200,190,255,${0.25 + s.avail * 0.3})`;
    for (const [cx, cy] of [[x + 6, y + 6], [x + w - 6, y + 6], [x + 6, y + hgt - 6], [x + w - 6, y + hgt - 6]] as const) {
      ctx.fillRect(cx - 1, cy - 1, 2, 2);
    }
    if (s.tut > 0.01) {
      ctx.save();
      roundRect(ctx, x, y, w, hgt, r);
      ctx.fillStyle = `rgba(246,194,91,${(0.12 + pulse * 0.18) * s.tut})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(255,224,150,${(0.6 + pulse * 0.4) * s.tut})`;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#f6c25b';
      ctx.shadowBlur = 16 * s.tut;
      ctx.stroke();
      ctx.restore();
    }
    if (s.closesAnim > 0.01) {
      // Клетка закроет линию: золотой контур; крест — ярче и с меткой
      const k = s.closesAnim;
      const cross = s.closes >= 2;
      ctx.save();
      roundRect(ctx, x + 3, y + 3, w - 6, hgt - 6, r * 0.8);
      ctx.strokeStyle = cross ? `rgba(255,214,120,${0.55 * k + pulse * 0.25 * k})` : `rgba(246,194,91,${0.28 * k})`;
      ctx.lineWidth = cross ? 2 : 1.2;
      ctx.stroke();
      if (cross) {
        ctx.font = `400 ${Math.round(w * 0.34)}px Forum, serif`;
        ctx.shadowColor = 'rgba(255,214,120,0.9)';
        ctx.shadowBlur = 12;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(255,214,120,${0.8 * k})`;
        ctx.fillText(`×${s.closes}`, t.x, t.y);
        ctx.shadowColor = 'transparent';
        ctx.fillText(`×${s.closes}`, t.x, t.y);
      }
      ctx.restore();
    }
    if (s.ignite > 0.01) {
      ctx.save();
      ctx.shadowColor = s.igniteColor;
      ctx.shadowBlur = 18 * s.ignite;
      roundRect(ctx, x, y, w, hgt, r);
      ctx.strokeStyle = s.igniteColor;
      ctx.globalAlpha = t.alpha * s.ignite * (0.6 + pulse * 0.4);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  // ─── Раскладка ──────────────────────────────────────────────────────────

  private onResize = (): void => {
    if (this.destroyed) return;
    this.computeLayout();
    this.cells.forEach((c, i) => {
      const t = this.world.req(c.entity, Transform);
      const p = this.layout.cells[i]!;
      t.x = p.x;
      t.y = p.y;
    });
    for (const [, e] of this.cards) {
      const v = this.world.req(e, CardView);
      if (v.zone === 'flying') continue;
      // Летящие твины ведут к старым координатам — обрываем и ставим карты на новые места
      const tr = this.world.req(e, Transform);
      this.svc.tweens.cancel(tr);
      this.svc.tweens.cancel(v);
      tr.flip = 1;
      tr.alpha = 1;
      v.width = this.layout.handW;
      const hit = this.world.req(e, Hit);
      hit.w = this.layout.handW;
      hit.h = this.layout.handH;
      if (v.zone === 'board' && v.cell >= 0) {
        const t = this.world.req(e, Transform);
        const p = this.layout.cells[v.cell]!;
        t.x = p.x;
        t.y = p.y;
        t.scale = this.boardScale;
      }
    }
    this.layoutHand(false);
  };

  /** Раскладывает руку веером. */
  layoutHand(animate = true, skip?: Entity): Promise<void> {
    const pos = handPositions(this.layout, this.hand.length);
    const jobs: Promise<void>[] = [];
    this.hand.forEach((id, i) => {
      const e = this.cards.get(id);
      if (e === undefined || e === skip) return;
      const t = this.world.req(e, Transform);
      const v = this.world.req(e, CardView);
      const d = this.world.req(e, Drawable);
      d.layer = Layer.Hand;
      d.z = i;
      v.zone = 'hand';
      // Через твин: он перебивает незаконченный подъём от наведения мыши
      const sel = this.selected === i;
      void this.svc.tweens.to(v, { lift: sel ? this.liftAmount : 0, glow: sel ? 1 : 0 }, { duration: animate ? 0.12 : 0.001 });
      const p = pos[i]!;
      if (animate) jobs.push(this.svc.tweens.to(t, { x: p.x, y: p.y, rot: p.rot, scale: 1 }, { duration: 0.28 / this.world.res.speed, ease: 'outCubic' }));
      else Object.assign(t, { x: p.x, y: p.y, rot: p.rot, scale: 1 });
    });
    return Promise.all(jobs).then(() => undefined);
  }

  // ─── Ввод ───────────────────────────────────────────────────────────────

  private onPointer = (e: PointerEventData): void => {
    if (this.destroyed) return;
    this.svc.audio.unlock();
    if (e.kind === 'down') this.onDown(e.x, e.y);
    else if (e.kind === 'move') this.onMove(e.x, e.y, e.pointerType === 'touch');
    else if (e.kind === 'up') this.onUp(e.x, e.y);
    else if (e.kind === 'cancel') this.cancelDrag();
  };

  private handIndexAt(x: number, y: number): number | null {
    const pos = handPositions(this.layout, this.hand.length);
    for (let i = this.hand.length - 1; i >= 0; i--) {
      const p = pos[i]!;
      const lift = this.selected === i ? this.liftAmount : 0;
      const [lx, ly] = this.layout.mode === 'landscape' ? [lift, 0] : [0, lift];
      if (Math.abs(x - (p.x - lx)) < this.layout.handW / 2 && Math.abs(y - (p.y - ly)) < this.layout.handH / 2) return i;
    }
    return null;
  }

  cellAt(x: number, y: number): number | null {
    const { cardW, cardH, gap } = this.layout;
    let best: number | null = null;
    let bestD = Infinity;
    this.layout.cells.forEach((p, i) => {
      const dx = Math.abs(x - p.x);
      const dy = Math.abs(y - p.y);
      if (dx < cardW / 2 + gap / 2 && dy < cardH / 2 + gap / 2) {
        const d = dx + dy;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    });
    return best;
  }

  private canPlaceAt(cell: number | null): cell is number {
    return cell !== null && !this.night.sealed[cell] && this.board[cell] === null;
  }

  /** Ограничение обучения (null — играем свободно). */
  guide: Guide | null = null;

  setGuide(guide: Guide | null): void {
    this.guide = guide;
    this.cells.forEach((c, i) => {
      const on = guide?.cell === i ? 1 : 0;
      void this.svc.tweens.to(c, { tut: on }, { duration: 0.25 });
    });
  }

  private allowSelect(handIndex: number): boolean {
    const g = this.guide;
    if (!g || g.free) return true;
    return g.card !== undefined && this.hand[handIndex] === g.card;
  }

  private allowPlace(handIndex: number, cell: number): boolean {
    const g = this.guide;
    if (!g || g.free) return true;
    return g.card === this.hand[handIndex] && g.cell === cell;
  }

  private deny(): void {
    this.svc.audio.deny();
    this.svc.haptics.play('error');
  }

  /** Обучение придерживает первый подсчёт на открытой формуле, пока игрок не нажмёт «Далее». */
  setScoringGate(gate: (() => Promise<void>) | null): void {
    this.presenter.scoringGate = gate;
  }

  /** Обучение замедляет подсчёт, чтобы успеть прочитать подписи. */
  setStepPause(k: number): void {
    this.presenter.stepPause = k;
  }

  /** Прямоугольник клетки в CSS-пикселях. */
  cellRect(cell: number): { x: number; y: number; w: number; h: number } {
    const p = this.layout.cells[cell]!;
    return { x: p.x - this.layout.cardW / 2, y: p.y - this.layout.cardH / 2, w: this.layout.cardW, h: this.layout.cardH };
  }

  /** Прямоугольник карты руки по id. */
  handRect(cardId: number): { x: number; y: number; w: number; h: number } | null {
    const i = this.hand.indexOf(cardId);
    if (i < 0) return null;
    const p = handPositions(this.layout, this.hand.length)[i]!;
    return { x: p.x - this.layout.handW / 2, y: p.y - this.layout.handH / 2, w: this.layout.handW, h: this.layout.handH };
  }

  /** Общий прямоугольник нескольких клеток. */
  cellsRect(cells: readonly number[]): { x: number; y: number; w: number; h: number } {
    const rects = cells.map((c) => this.cellRect(c));
    const x = Math.min(...rects.map((r) => r.x));
    const y = Math.min(...rects.map((r) => r.y));
    return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
  }

  /** Прямоугольник всей руки. */
  handAreaRect(): { x: number; y: number; w: number; h: number } {
    const rects = this.hand.map((id) => this.handRect(id)!).filter(Boolean);
    const x = Math.min(...rects.map((r) => r.x));
    const y = Math.min(...rects.map((r) => r.y));
    return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
  }

  private onDown(x: number, y: number): void {
    if (this.busy || this.night.result !== 'playing') return;
    const index = this.handIndexAt(x, y);
    if (index !== null) {
      if (!this.allowSelect(index)) return this.deny();
      const id = this.hand[index]!;
      const entity = this.cards.get(id)!;
      this.drag = { id, entity, startX: x, startY: y, active: false, offY: 0 };
      return;
    }
    const cell = this.cellAt(x, y);
    if (this.selected !== null && this.canPlaceAt(cell)) {
      // Кладём на отпускании: для iOS только оно — «жест», и вибрация сработает только в нём
      this.pendingCell = cell;
      return;
    }
    if (cell === null && this.selected !== null) this.select(null);
  }

  private onMove(x: number, y: number, touch = true): void {
    const { renderer, starfield } = this.svc;
    starfield.parallaxX = (x / renderer.width - 0.5) * 2;
    starfield.parallaxY = (y / renderer.height - 0.5) * 2;
    if (this.busy) return;
    if (this.drag) {
      const d = this.drag;
      if (!d.active && Math.hypot(x - d.startX, y - d.startY) > DRAG_THRESHOLD) {
        d.active = true;
        const index = this.hand.indexOf(d.id);
        this.select(index, false);
        const v = this.world.req(d.entity, CardView);
        v.zone = 'flying';
        v.lift = 0;
        this.world.req(d.entity, Drawable).layer = Layer.Dragged;
        this.svc.tweens.cancel(this.world.req(d.entity, Transform));
        this.svc.audio.pickup();
      }
      if (d.active) {
        const t = this.world.req(d.entity, Transform);
        // Карта висит над пальцем, чтобы её было видно
        const lift = touch ? this.layout.handH * 0.45 : 0;
        t.x = x;
        t.y = y - lift;
        t.rot = 0;
        const cell = this.cellAt(t.x, t.y);
        const overBoard = cell !== null;
        const overBurn = !overBoard && this.overBurn(x, y);
        t.scale += ((overBoard ? this.boardScale : overBurn ? 0.8 : 1) - t.scale) * 0.35;
        this.setHover(this.canPlaceAt(cell) ? cell : null);
        this.hud.setBurnDrop(this.canBurnCard(d.id) ? (overBurn ? 'hover' : 'ready') : null);
      }
      return;
    }
    if (this.selected !== null) {
      const cell = this.cellAt(x, y);
      this.setHover(this.canPlaceAt(cell) ? cell : null);
    }
    if (!touch) this.setHandHover(this.handIndexAt(x, y));
  }

  /** Наведение мышью на карту руки: лёгкий подъём. */
  private setHandHover(index: number | null): void {
    if (index === this.hoverHand) return;
    this.hoverHand = index;
    this.hand.forEach((id, i) => {
      const e = this.cards.get(id);
      if (e === undefined) return;
      const v = this.world.req(e, CardView);
      if (v.zone !== 'hand') return;
      const target = i === this.selected ? this.liftAmount : i === index ? this.liftAmount * 0.35 : 0;
      void this.svc.tweens.to(v, { lift: target }, { duration: 0.12 });
    });
    this.svc.renderer.canvas.style.cursor = index !== null || this.hoverCell !== null ? 'pointer' : 'default';
  }

  private onUp(x: number, y: number): void {
    const pending = this.pendingCell;
    this.pendingCell = null;
    if (pending !== null && this.selected !== null && !this.busy && this.cellAt(x, y) === pending) {
      void this.place(this.selected, pending);
      return;
    }
    const d = this.drag;
    this.drag = null;
    if (!d || this.busy) return;
    if (!d.active) {
      const index = this.hand.indexOf(d.id);
      this.select(this.selected === index ? null : index);
      return;
    }
    const t = this.world.req(d.entity, Transform);
    const cell = this.cellAt(t.x, t.y);
    const index = this.hand.indexOf(d.id);
    this.hud.setBurnDrop(null);
    if (this.canPlaceAt(cell)) {
      void this.place(index, cell, d.entity);
    } else if (cell === null && this.overBurn(x, y)) {
      // Карту бросили на «Сжечь» — то же, что выбрать и нажать кнопку
      if (this.canBurnCard(d.id)) {
        this.selected = index;
        void this.burnSelected();
      } else {
        this.deny();
        this.select(index);
      }
    } else {
      this.setHover(null);
      this.select(index);
    }
  }

  /** Палец над кнопкой «Сжечь» (с запасом — по ней целятся на ходу). */
  private overBurn(x: number, y: number): boolean {
    const r = this.hud.burnBtn.getBoundingClientRect();
    const slack = 14;
    return x >= r.left - slack && x <= r.right + slack && y >= r.top - slack * 2 && y <= r.bottom + slack;
  }

  /** Можно ли сжечь карту перетаскиванием: остались сжигания и обучение не против. */
  private canBurnCard(id: number): boolean {
    if (this.night.burnsLeft <= 0) return false;
    return !this.guide || this.guide.free || (!!this.guide.burn && id === this.guide.card);
  }

  private cancelDrag(): void {
    this.pendingCell = null;
    this.hud.setBurnDrop(null);
    if (this.drag?.active) {
      this.setHover(null);
      void this.layoutHand(true);
    }
    this.drag = null;
  }

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
    if (index === null) this.setHover(null);
    else this.previewKey = '';
    if (relayout) void this.layoutHand(true);
  }

  private setHover(cell: number | null): void {
    if (cell !== this.hoverCell) {
      if (this.hoverCell !== null) void this.svc.tweens.to(this.cells[this.hoverCell]!, { hover: 0 }, { duration: 0.15 });
      if (cell !== null) {
        void this.svc.tweens.to(this.cells[cell]!, { hover: 1 }, { duration: 0.12 });
        this.svc.audio.hover();
      }
      this.hoverCell = cell;
    }
    this.updatePreview();
  }

  private updatePreview(): void {
    const cell = this.hoverCell;
    const handIndex = this.selected;
    const key = `${handIndex}:${cell}`;
    if (key === this.previewKey) return;
    this.previewKey = key;
    for (const c of this.cells) if (c.ignite > 0) void this.svc.tweens.to(c, { ignite: 0 }, { duration: 0.15 });
    if (cell === null || handIndex === null) {
      this.preview = null;
      this.hud.setPreview(null);
      return;
    }
    this.preview = previewPlacement(this.run, handIndex, cell);
    if (!this.preview) {
      this.hud.setPreview(null);
      return;
    }
    const color = SUIT_COLORS[this.night.hand[handIndex]!.suit].main;
    for (const c of this.preview.cells) {
      const state = this.cells[c]!;
      state.igniteColor = color;
      void this.svc.tweens.to(state, { ignite: 1 }, { duration: 0.15 });
    }
    if (this.night.rules.hideRanks) this.hud.setPreview(null);
    else this.hud.setPreview(this.preview.lines, this.preview.total);
  }

  /** Пересчитывает, какие пустые клетки закрывают линии (и где крест). */
  refreshClosers(): void {
    const n = this.night;
    const lines = buildLines(n.rules);
    this.cells.forEach((state, cell) => {
      let closes = 0;
      if (!n.sealed[cell] && !n.grid[cell]) {
        for (const line of lines) {
          if (!line.cells.includes(cell)) continue;
          const active = activeCells(line, n.sealed);
          if (active.length >= 2 && active.every((c) => c === cell || n.grid[c])) closes++;
        }
      }
      state.closes = closes;
      void this.svc.tweens.to(state, { closesAnim: closes > 0 ? 1 : 0 }, { duration: 0.3 });
    });
  }

  // ─── Действия ───────────────────────────────────────────────────────────

  async place(handIndex: number, cell: number, dragged?: Entity): Promise<void> {
    if (this.busy) return;
    if (!this.allowPlace(handIndex, cell)) {
      this.deny();
      this.setHover(null);
      void this.layoutHand(true);
      return;
    }
    const events = this.hooks.act({ kind: 'place', handIndex, cell });
    if (!events) {
      this.select(handIndex);
      return;
    }
    // iPhone: отклик сразу, пока палец на экране; вспышку линий чувствуем сильнее
    this.svc.haptics.touch(events.some((e) => e.t === 'ignite') ? 'ignite' : 'place');
    this.busy = true;
    this.selected = null;
    this.hooks.onSelect?.(null);
    this.setHover(null);
    for (const c of this.cells) void this.svc.tweens.to(c, { avail: 0, ignite: 0 }, { duration: 0.15 });
    await this.presenter.play(events, dragged);
    this.refreshClosers();
    this.busy = false;
    if (!this.destroyed) this.hooks.onSettled(events);
  }

  async burnSelected(): Promise<void> {
    if (this.busy || this.selected === null) return;
    if (this.guide && !this.guide.free && !(this.guide.burn && this.hand[this.selected] === this.guide.card)) return this.deny();
    const handIndex = this.selected;
    const events = this.hooks.act({ kind: 'burn', handIndex });
    if (!events) return;
    this.svc.haptics.touch('ignite');
    this.busy = true;
    this.selected = null;
    this.hooks.onSelect?.(null);
    this.setHover(null);
    for (const c of this.cells) void this.svc.tweens.to(c, { avail: 0 }, { duration: 0.15 });
    await this.presenter.play(events);
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

let probe: HTMLElement | null = null;

/** Отступы безопасной зоны (вырез, полоска «домой»): env() читается только через элемент. */
export function safeInsets(): { top: number; bottom: number } {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
    document.body.append(probe);
  }
  const css = getComputedStyle(probe);
  return { top: parseFloat(css.paddingTop) || 0, bottom: parseFloat(css.paddingBottom) || 0 };
}
