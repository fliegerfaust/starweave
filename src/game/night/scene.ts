import { CARD_PAD, cardBack, cardFace } from '@/art/card';
import { roundRect } from '@/art/glyphs';
import { SUIT_COLORS, rgba } from '@/art/palette';
import type { Card, GameEvent, RunState } from '@/core/types';
import type { Entity } from '@/engine/ecs';
import type { PointerEventData } from '@/engine/input';
import type { Hud } from '@/ui/hud';
import { CardView, Drawable, Hit, Layer, Transform, transform } from '../components';
import type { Services } from '../context';
import { computeLayout, handPositions, type NightLayout } from '../layout';
import { Presenter } from './presenter';
import { previewPlacement, type PlacementPreview } from './preview';

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
  private drag: { id: number; entity: Entity; startX: number; startY: number; active: boolean; offY: number } | null = null;
  private hoverCell: number | null = null;
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
    const safe = safeInsets();
    const hudBottom = this.hud.el.getBoundingClientRect().bottom || safe.top + 168;
    const actionsTop = this.hud.actions.getBoundingClientRect().top || renderer.height - safe.bottom - 64;
    this.layout = computeLayout(renderer.width, renderer.height, this.night.rules.gridSize, hudBottom, actionsTop);
    document.documentElement.style.setProperty('--board-top', `${this.layout.board.y}px`);
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
    this.unsubscribers.push(this.svc.renderer.onResize(this.onResize), this.svc.input.on(this.onPointer));
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
      hideRank: this.night.rules.hideRanks,
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
    const pad = Math.ceil(w * CARD_PAD);
    const showFace = v.faceUp && t.flip >= 0;
    const img = showFace ? cardFace(v.card, w, dpr, { hideRank: v.hideRank }) : cardBack(w, dpr);
    ctx.globalAlpha = t.alpha;
    ctx.translate(t.x, t.y - v.lift);
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
    ctx.drawImage(img, -w / 2 - pad, -hgt / 2 - pad, w + pad * 2, hgt + pad * 2);
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
    const state: CellState = { entity: e, sealed, avail: 0, hover: 0, ignite: 0, igniteColor: '#f6c25b' };
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
      v.lift = this.selected === i ? this.layout.handH * 0.16 : 0;
      v.glow = this.selected === i ? 1 : 0;
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
    else if (e.kind === 'move') this.onMove(e.x, e.y);
    else if (e.kind === 'up') this.onUp(e.x, e.y);
    else if (e.kind === 'cancel') this.cancelDrag();
  };

  private handIndexAt(x: number, y: number): number | null {
    const pos = handPositions(this.layout, this.hand.length);
    for (let i = this.hand.length - 1; i >= 0; i--) {
      const p = pos[i]!;
      const lift = this.selected === i ? this.layout.handH * 0.16 : 0;
      if (Math.abs(x - p.x) < this.layout.handW / 2 && Math.abs(y - (p.y - lift)) < this.layout.handH / 2) return i;
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

  private onDown(x: number, y: number): void {
    if (this.busy || this.night.result !== 'playing') return;
    const index = this.handIndexAt(x, y);
    if (index !== null) {
      const id = this.hand[index]!;
      const entity = this.cards.get(id)!;
      this.drag = { id, entity, startX: x, startY: y, active: false, offY: 0 };
      return;
    }
    const cell = this.cellAt(x, y);
    if (this.selected !== null && this.canPlaceAt(cell)) {
      void this.place(this.selected, cell);
      return;
    }
    if (cell === null && this.selected !== null) this.select(null);
  }

  private onMove(x: number, y: number): void {
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
        const lift = this.layout.handH * 0.45;
        t.x = x;
        t.y = y - lift;
        t.rot = 0;
        const cell = this.cellAt(t.x, t.y);
        const overBoard = cell !== null;
        t.scale += ((overBoard ? this.boardScale : 1) - t.scale) * 0.35;
        this.setHover(this.canPlaceAt(cell) ? cell : null);
      }
      return;
    }
    if (this.selected !== null) {
      const cell = this.cellAt(x, y);
      this.setHover(this.canPlaceAt(cell) ? cell : null);
    }
  }

  private onUp(x: number, y: number): void {
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
    if (this.canPlaceAt(cell)) {
      void this.place(index, cell, d.entity);
    } else {
      this.setHover(null);
      this.select(index);
    }
    void x;
    void y;
  }

  private cancelDrag(): void {
    if (this.drag?.active) {
      this.setHover(null);
      void this.layoutHand(true);
    }
    this.drag = null;
  }

  select(index: number | null, relayout = true): void {
    if (index !== this.selected && index !== null) this.svc.audio.tick();
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

  // ─── Действия ───────────────────────────────────────────────────────────

  async place(handIndex: number, cell: number, dragged?: Entity): Promise<void> {
    if (this.busy) return;
    const events = this.hooks.act({ kind: 'place', handIndex, cell });
    if (!events) {
      this.select(handIndex);
      return;
    }
    this.busy = true;
    this.selected = null;
    this.hooks.onSelect?.(null);
    this.setHover(null);
    for (const c of this.cells) void this.svc.tweens.to(c, { avail: 0, ignite: 0 }, { duration: 0.15 });
    await this.presenter.play(events, dragged);
    this.busy = false;
    if (!this.destroyed) this.hooks.onSettled(events);
  }

  async burnSelected(): Promise<void> {
    if (this.busy || this.selected === null) return;
    const handIndex = this.selected;
    const events = this.hooks.act({ kind: 'burn', handIndex });
    if (!events) return;
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
