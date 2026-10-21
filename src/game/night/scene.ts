import { CARD_ASPECT, CARD_PAD, cardBack, cardFace, suitEmblem } from '@/art/card';
import { roundRect } from '@/art/glyphs';
import { SUIT_COLORS, rgba } from '@/art/palette';
import { activeCells, buildLines } from '@/core/grid';
import type { Card, GameEvent, RunState } from '@/core/types';
import type { Entity } from '@/engine/ecs';
import type { PointerEventData } from '@/engine/input';
import { t } from '@/i18n';
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

/** Подписи прогноза в клетке: кегль, ширина стрелки и строки с замеренной шириной. */
interface ForecastLayout {
  size: number;
  aw: number;
  rows: { text: string; dir: 'row' | 'col' | 'diag' | null; width: number }[];
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
    // Лоток подсчёта («Рама»): в портрете — над рукой, прямо над кнопками; вспыхнувшие
    // карты он не закрывает. В ландшафте и на ПК — в колонке под рамой табло.
    const frame = this.hud.el.querySelector('.hud-frame')?.getBoundingClientRect() ?? hud;
    if (landscape) {
      root.setProperty('--calc-top', `${frame.bottom + 12}px`);
      root.setProperty('--calc-cx', `${frame.left + frame.width / 2}px`);
      root.setProperty('--calc-w', `${frame.width}px`);
    } else {
      root.setProperty('--calc-bottom', `${Math.max(0, height - (actions.top || height - safe.bottom - 64)) + 8}px`);
      root.setProperty('--calc-cx', `${this.layout.board.x + this.layout.board.w / 2}px`);
      root.setProperty('--calc-w', `${Math.min(352, width - 24)}px`);
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
    window.addEventListener('keydown', this.onKey);
    this.unsubscribers.push(() => window.removeEventListener('keydown', this.onKey));
    this.labelCanvas();
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
    if (v.debuffed && showFace) drawEclipsed(ctx, w, hgt);
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
    const state: CellState = { entity: e, sealed, avail: 0, hover: 0, ignite: 0, igniteColor: '#f6c25b', closes: 0, closesAnim: 0, tut: 0, forecast: [], forecastPicked: false, forecastWeak: false, forecastCard: null };
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
    if (this.kbActive && this.kbCell === this.cells.indexOf(s)) {
      // Фокус клавиатуры: светлая рамка поверх клетки, отличная от наведения и обучения
      ctx.save();
      roundRect(ctx, x - 2, y - 2, w + 4, hgt + 4, r * 1.1);
      ctx.strokeStyle = 'rgba(255,248,220,0.95)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      ctx.shadowColor = 'rgba(255,236,190,0.8)';
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.restore();
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
      const named = s.forecast.length > 0;
      if (named) this.drawForecast(ctx, s, t.x, t.y, w, hgt, k);
      else if (cross) {
        const cy = t.y;
        ctx.font = `400 ${Math.round(w * 0.34)}px Forum, serif`;
        ctx.shadowColor = 'rgba(255,214,120,0.9)';
        ctx.shadowBlur = 12;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(255,214,120,${0.8 * k})`;
        ctx.fillText(`×${s.closes}`, t.x, cy);
        ctx.shadowColor = 'transparent';
        ctx.fillText(`×${s.closes}`, t.x, cy);
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

  /** Двусторонняя стрелка: ↔ ряд, ↕ столбец, ⤡ диагональ — линиями, в цвет подписи. */
  private drawLineArrow(ctx: CanvasRenderingContext2D, dir: 'row' | 'col' | 'diag', cx: number, cy: number, len: number, color: string, k: number): void {
    const [dx, dy] = dir === 'row' ? [1, 0] : dir === 'col' ? [0, 1] : [Math.SQRT1_2, -Math.SQRT1_2];
    const half = len / 2;
    const head = len * 0.32;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(cx - dx * half, cy - dy * half);
      ctx.lineTo(cx + dx * half, cy + dy * half);
      for (const sgn of [1, -1]) {
        const tx = cx + sgn * dx * half;
        const ty = cy + sgn * dy * half;
        // Усы стрелки — под 45° к линии, назад от острия
        ctx.moveTo(tx - sgn * head * (dx - dy) * Math.SQRT1_2, ty - sgn * head * (dy + dx) * Math.SQRT1_2);
        ctx.lineTo(tx, ty);
        ctx.lineTo(tx - sgn * head * (dx + dy) * Math.SQRT1_2, ty - sgn * head * (dy - dx) * Math.SQRT1_2);
      }
    };
    path();
    ctx.lineWidth = 3.4;
    ctx.strokeStyle = `rgba(8,6,24,${0.75 * k})`;
    ctx.stroke();
    path();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
  }

  /** Раскладки подписей прогноза: замер шрифта и перенос — раз на набор названий, а не каждый кадр. */
  private forecastLayouts = new Map<string, ForecastLayout>();

  private forecastLayout(ctx: CanvasRenderingContext2D, forecast: CellState['forecast'], w: number): ForecastLayout {
    // «Крупный текст» в настройках — подписи на небе тоже крупнее (сколько влезет в клетку)
    const large = document.documentElement.classList.contains('large-text');
    // Статус шрифтов в ключе: замер до загрузки Manrope был бы по запасному шрифту
    const key = `${w}|${large ? 1 : 0}|${document.fonts?.status ?? ''}|${forecast.map((f) => `${f.name}/${f.dir ?? ''}`).join('|')}`;
    const hit = this.forecastLayouts.get(key);
    if (hit) return hit;
    const maxW = w - 8;
    const base = Math.max(large ? 14 : 12, Math.round(w * (large ? 0.2 : 0.17)));
    // Стрелка ряда или столбца рисуется линиями, а не символом шрифта: символ в другом
    // шрифте (Telegram, Android) шире замера и вылезал за клетку
    let arrows = forecast.some((f) => f.dir);
    const arrowW = (size: number) => (arrows ? size * 0.9 : 0);
    // Узкая клетка: длинное слово не влезает — ужимаем шрифт, а не клетку; не хватает и
    // мелкого — стрелки уступают место названию
    const fit = () => {
      ctx.font = `700 ${base}px Manrope, sans-serif`;
      let widest = 0;
      for (const f of forecast) {
        f.name.split(' ').forEach((word, i) => {
          widest = Math.max(widest, ctx.measureText(word).width + (i === 0 ? arrowW(base) : 0));
        });
      }
      return widest > maxW ? Math.floor((base * maxW) / widest) : base;
    };
    let size = fit();
    if (size < 9 && arrows) {
      arrows = false;
      size = fit();
    }
    size = Math.max(8, size);
    ctx.font = `700 ${size}px Manrope, sans-serif`;
    const aw = arrowW(size);
    const rows: ForecastLayout['rows'] = [];
    for (const f of forecast) {
      let row = '';
      let dir = arrows ? f.dir : null;
      for (const word of f.name.split(' ')) {
        const next = row ? `${row} ${word}` : word;
        if (row && ctx.measureText(next).width + (dir ? aw : 0) > maxW) {
          rows.push({ text: row, dir, width: ctx.measureText(row).width });
          dir = null;
          row = word;
        } else row = next;
      }
      if (row) rows.push({ text: row, dir, width: ctx.measureText(row).width });
    }
    const layout = { size, aw, rows };
    // Набор названий за ночь невелик; потолок — на случай смены размеров окна
    if (this.forecastLayouts.size > 200) this.forecastLayouts.clear();
    this.forecastLayouts.set(key, layout);
    return layout;
  }

  /**
   * Названия созвездий в клетке, которая закроет линию: игрок видит, что соберётся,
   * не зная покерных комбинаций. Длинные названия переносятся по словам.
   */
  private drawForecast(ctx: CanvasRenderingContext2D, s: CellState, x: number, y: number, w: number, hgt: number, k: number): void {
    const cross = s.closes >= 2;
    const maxW = w - 8;
    const { size, aw, rows } = this.forecastLayout(ctx, s.forecast, w);
    ctx.font = `700 ${size}px Manrope, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lh = size * 1.15;
    const mark = cross ? Math.round(w * 0.28) : 0;
    let chip = s.forecastCard && !s.forecastWeak ? size * 1.5 : 0;
    let shown = rows.slice(0, 3);
    // Блок целиком: «×2», строки названий, мини-карта — по центру клетки и не выше неё
    const height = () => (mark ? mark * 1.05 : 0) + shown.length * lh + (chip ? chip + lh * 0.3 : 0);
    if (height() > hgt - 6) chip = 0;
    if (height() > hgt - 6) shown = shown.slice(0, 2);
    let cursor = y - height() / 2;
    if (mark) {
      ctx.save();
      ctx.font = `400 ${mark}px Forum, serif`;
      ctx.shadowColor = 'rgba(255,214,120,0.9)';
      ctx.shadowBlur = 12;
      ctx.fillStyle = `rgba(255,214,120,${0.8 * k})`;
      ctx.fillText(`×${s.closes}`, x, cursor + mark / 2);
      ctx.shadowColor = 'transparent';
      ctx.fillText(`×${s.closes}`, x, cursor + mark / 2);
      ctx.restore();
      cursor += mark * 1.05;
    }
    const alpha = (s.forecastWeak ? 0.78 : 0.95) * k;
    const color = s.forecastWeak ? `rgba(200,195,230,${alpha})` : s.forecastPicked ? `rgba(255,236,190,${alpha})` : `rgba(246,194,91,${alpha})`;
    shown.forEach((row, i) => {
      const ry = cursor + i * lh + lh / 2;
      const iconW = row.dir ? aw : 0;
      // Предел ширины у fillText — страховка: даже если шрифт шире замера, строка
      // сожмётся по горизонтали, а не вылезет из клетки
      const textMax = maxW - iconW;
      const textW = Math.min(textMax, row.width);
      const left = x - (iconW + textW) / 2;
      const tx = left + iconW + textW / 2;
      if (row.dir) this.drawLineArrow(ctx, row.dir, left + size * 0.35, ry, size * 0.62, color, k);
      // Тёмная подложка под буквами — читается и поверх туманности
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(8,6,24,${0.75 * k})`;
      ctx.strokeText(row.text, tx, ry, textMax);
      ctx.fillStyle = color;
      ctx.fillText(row.text, tx, ry, textMax);
    });
    cursor += shown.length * lh;
    const card = s.forecastCard;
    if (card && chip) {
      // Мини-карта: какой картой руки собрать — ранг цветом масти
      const cw = chip * 0.72;
      const cy = cursor + lh * 0.3 + chip / 2;
      const c = SUIT_COLORS[card.suit];
      roundRect(ctx, x - cw / 2, cy - chip / 2, cw, chip, cw * 0.16);
      ctx.fillStyle = rgba(c.rgb, 0.18 * k);
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = rgba(c.rgb, 0.85 * k);
      ctx.stroke();
      ctx.font = `400 ${Math.round(chip * 0.62)}px Forum, serif`;
      ctx.fillStyle = c.light;
      ctx.globalAlpha *= k;
      ctx.fillText(String(card.rank), x, cy + chip * 0.04);
    }
  }

  // ─── Раскладка ──────────────────────────────────────────────────────────

  private onResize = (): void => {
    if (this.destroyed) return;
    this.computeLayout();
    // Холст пересоздаётся при смене размера — подпись для скринридера ставим заново
    this.labelCanvas();
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

  /** Палец, который тащит карту: второй палец не перехватывает перетаскивание. */
  private dragPointer: number | null = null;

  private onPointer = (e: PointerEventData): void => {
    if (this.destroyed) return;
    if (e.kind === 'down') this.kbActive = false;
    if (this.drag && this.dragPointer !== null && e.id !== this.dragPointer && e.kind !== 'cancel') return;
    if (e.kind === 'down') this.dragPointer = e.id;
    else if (e.kind === 'up' || e.kind === 'cancel') this.dragPointer = null;
    this.svc.audio.unlock();
    // Мышь едет без зажатой кнопки, а карта всё ещё «в руке» — отпускание потерялось
    // (окно потеряло фокус и т.п.). Отпускаем здесь, иначе карта ездит за курсором
    if (e.kind === 'move' && e.pointerType === 'mouse' && e.buttons === 0 && (this.drag || this.pendingCell !== null)) {
      this.dragPointer = null;
      return this.onUp(e.x, e.y);
    }
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

  /** Обучение показывает под формулой, из чего она складывается. */
  setExplain(on: boolean): void {
    this.presenter.explain = on;
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
    // Идёт подсчёт: касание ускоряет его (кроме обучения — там подсчёт читают)
    if (this.busy && !this.guide) this.presenter.hurry = 3;
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
      // Кладём на отпускании пальца: можно передумать и увести палец с клетки
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
    if (this.drag && !this.dragValid()) this.dropDrag();
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

  // ─── Клавиатура (десктоп, скринридер) ──────────────────────────────────

  /** Клетка под фокусом клавиатуры. */
  kbCell: number | null = null;
  /** Рамку фокуса рисуем, только пока играют с клавиатуры: мышь и касание её гасят. */
  private kbActive = false;

  private labelCanvas(): void {
    const c = this.svc.renderer.canvas;
    c.setAttribute('role', 'application');
    c.setAttribute('aria-roledescription', t('a11y.boardRole'));
    c.setAttribute('aria-label', t('a11y.board'));
    c.tabIndex = 0;
  }

  /**
   * 1–9 — карта руки, стрелки — клетка неба, Enter/пробел — положить, B/Delete — сжечь,
   * Esc — снять выбор. Те же ограничения обучения, что и у касаний. Пока открыто окно или
   * фокус в поле ввода, клавиши не наши.
   */
  private onKey = (e: KeyboardEvent): void => {
    if (this.destroyed || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('.modal-backdrop')) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON')) {
      // На кнопке Enter/пробел — её нажатие; цифры и стрелки всё равно наши
      if (e.key === 'Enter' || e.key === ' ') return;
    }
    const n = this.night.rules.gridSize;
    const digit = /^[1-9]$/.test(e.key) ? Number(e.key) - 1 : -1;
    let handled = true;
    if (digit >= 0) {
      if (digit < this.hand.length && !this.busy && this.night.result === 'playing') {
        if (!this.allowSelect(digit)) this.deny();
        else this.select(this.selected === digit ? null : digit);
        this.announceSelection();
      }
    } else if (e.key.startsWith('Arrow')) {
      this.kbActive = true;
      const cur = this.kbCell ?? this.firstFreeCell();
      let r = Math.floor(cur / n);
      let c = cur % n;
      if (this.kbCell !== null) {
        if (e.key === 'ArrowUp') r = (r + n - 1) % n;
        else if (e.key === 'ArrowDown') r = (r + 1) % n;
        else if (e.key === 'ArrowLeft') c = (c + n - 1) % n;
        else if (e.key === 'ArrowRight') c = (c + 1) % n;
      }
      this.kbCell = r * n + c;
      if (this.selected !== null) this.setHover(this.canPlaceAt(this.kbCell) ? this.kbCell : null);
      this.announceCell(this.kbCell);
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (this.selected === null || this.kbCell === null || this.busy) {
        this.deny();
        this.hud.announce(t(this.selected === null ? 'a11y.pickCard' : 'a11y.pickCell'));
      } else if (!this.canPlaceAt(this.kbCell)) this.deny();
      else void this.place(this.selected, this.kbCell);
    } else if (e.key === 'b' || e.key === 'B' || e.key === 'и' || e.key === 'И' || e.key === 'Delete') {
      if (this.selected !== null && this.canBurnCard(this.hand[this.selected]!)) void this.burnSelected();
      else this.deny();
    } else if (e.key === 'Escape') {
      if (this.selected !== null) this.select(null);
      else handled = false;
    } else handled = false;
    if (handled) e.preventDefault();
  };

  private firstFreeCell(): number {
    const i = this.night.grid.findIndex((c, k) => !c && !this.night.sealed[k]);
    return i >= 0 ? i : 0;
  }

  /** Скринридеру: какая карта выбрана и где она даст больше всего. */
  private announceSelection(): void {
    const i = this.selected;
    if (i === null) return this.hud.announce(t('a11y.deselected'));
    const card = this.night.hand[i]!;
    const name = this.night.rules.hideRanks ? t(`suitPl.${card.suit}`) : `${card.rank} · ${t(`suitPl.${card.suit}`)}`;
    const best = this.cells.findIndex((c) => c.forecast.length > 0 && !c.forecastWeak);
    const where = best >= 0 ? t('a11y.bestCell', { cell: this.cellName(best), combo: this.cells[best]!.forecast.map((f) => f.name).join(' + ') }) : '';
    this.hud.announce(`${t('a11y.selected', { card: name })} ${where}`.trim());
  }

  /** Скринридеру: что в клетке и что даст выбранная карта. */
  private announceCell(cell: number): void {
    const placed = this.night.grid[cell];
    const what = this.night.sealed[cell]
      ? t('a11y.sealed')
      : placed
        ? `${placed.rank} · ${t(`suitPl.${placed.suit}`)}`
        : this.preview
          ? `${t('a11y.empty')}. ${this.preview.lines.map((l) => t(`combo.${l.combo}`)).join(' + ')} ≈ ${this.preview.total}`
          : t('a11y.empty');
    this.hud.announce(`${this.cellName(cell)}: ${what}`);
  }

  private cellName(cell: number): string {
    const n = this.night.rules.gridSize;
    return t('a11y.cell', { row: Math.floor(cell / n) + 1, col: (cell % n) + 1 });
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
    if (!this.world.isAlive(d.entity) || !this.hand.includes(d.id)) return this.hud.setBurnDrop(null);
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

  /**
   * Палец над кнопкой «Сжечь» (с запасом — по ней целятся на ходу). Над рукой — никогда:
   * карту, которую несут обратно в руку, не сжигаем (кнопка вплотную под правыми картами).
   */
  private overBurn(x: number, y: number): boolean {
    const r = this.hud.burnBtn.getBoundingClientRect();
    const hand = this.hand.length ? this.handAreaRect() : null;
    if (hand && x >= hand.x && x <= hand.x + hand.w && y >= hand.y && y <= hand.y + hand.h) return false;
    const slack = 14;
    return x >= r.left - slack && x <= r.right + slack && y >= r.top - slack / 2 && y <= r.bottom + slack;
  }

  /** Можно ли сжечь карту перетаскиванием: остались сжигания и обучение не против. */
  private canBurnCard(id: number): boolean {
    if (this.night.burnsLeft <= 0) return false;
    return !this.guide || this.guide.free || (!!this.guide.burn && id === this.guide.card);
  }

  /**
   * Карта под пальцем ещё в руке. Её могли сжечь или выложить в обход перетаскивания —
   * вторым пальцем по «Сжечь», клавишей B или Enter; тогда сущность уже удалена, и каждое
   * движение пальца роняло ошибку «нет Transform» (js_error, 155 раз за день 14.10.2026).
   */
  private dragValid(): boolean {
    const d = this.drag;
    return !!d && this.world.isAlive(d.entity) && this.hand.includes(d.id) && this.cards.get(d.id) === d.entity;
  }

  /** Бросить перетаскивание без возврата карты: она уже ушла из руки. */
  private dropDrag(): void {
    this.drag = null;
    this.pendingCell = null;
    this.hud.setBurnDrop(null);
    this.setHover(null);
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
    if (!this.busy) this.refreshForecast();
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
    this.preview = this.cachedPreview(handIndex, cell);
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
      void this.svc.tweens.to(state, { closesAnim: closes > 0 && !this.forecastOff ? 1 : 0 }, { duration: 0.3 });
    });
    this.refreshForecast();
  }

  /**
   * Прогноз созвездий в клетках, закрывающих линию. Выбрана карта — что даст она;
   * нет — лучшее, что даст какая-нибудь карта руки. В «Тумане» ранги в руке скрыты,
   * поэтому прогноза нет.
   */
  /** Прогнозы клеток на текущее состояние ночи: выбор карты не пересчитывает их заново. */
  /** Без подписей прогноза и меток «×2» на небе — ролик-загадка (`?demo=puzzle`). */
  forecastOff = false;
  private forecastCache = new Map<string, PlacementPreview | null>();
  private forecastState = '';
  private forecastSeed = 0;

  private cachedPreview(handIndex: number, cell: number): PlacementPreview | null {
    // Новое состояние неба или руки — сбросить кэш; свой сид на состояние, чтобы случайные
    // Знамения не меняли подсказку от выбора к выбору
    const n = this.night;
    const state = `${n.placements}|${n.burnsLeft}|${n.hand.map((c) => c.id).join(',')}|${n.grid.map((c) => c?.id ?? '').join(',')}`;
    if (state !== this.forecastState) {
      this.forecastState = state;
      this.forecastCache.clear();
      this.forecastSeed = (Math.random() * 2 ** 32) >>> 0;
    }
    const key = `${handIndex}:${cell}`;
    if (!this.forecastCache.has(key)) this.forecastCache.set(key, previewPlacement(this.run, handIndex, cell, this.forecastSeed));
    return this.forecastCache.get(key)!;
  }

  refreshForecast(): void {
    const n = this.night;
    const picked = this.selected;
    for (const [cell, state] of this.cells.entries()) {
      state.forecast = [];
      state.forecastPicked = picked !== null;
      state.forecastWeak = false;
      state.forecastCard = null;
      if (state.closes === 0 || n.rules.hideRanks || n.result !== 'playing' || this.forecastOff) continue;
      const indices = picked !== null ? [picked] : n.hand.map((_, i) => i);
      let best: PlacementPreview | null = null;
      let bestIndex = -1;
      for (const i of indices) {
        const p = this.cachedPreview(i, cell);
        if (p && (!best || p.total > best.total)) {
          best = p;
          bestIndex = i;
        }
      }
      if (!best) continue;
      if (picked === null) state.forecastCard = n.hand[bestIndex] ?? null;
      // На кресте две подписи: стрелка говорит, какая у ряда, какая у столбца
      state.forecast = best.lines.map((l) => ({ name: t(`combo.${l.combo}`), dir: best!.lines.length > 1 ? l.kind : null }));
      state.forecastWeak = best.lines.every((l) => l.combo === 'scatter');
    }
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
    // Карту выкладывают клавиатурой, пока её держит палец, — палец её больше не ведёт
    if (dragged === undefined && this.drag?.id === this.hand[handIndex]) this.dropDrag();
    const events = this.hooks.act({ kind: 'place', handIndex, cell });
    if (!events) {
      this.select(handIndex);
      return;
    }
    this.busy = true;
    this.selected = null;
    this.hooks.onSelect?.(null);
    this.setHover(null);
    // Карта легла — подписи «что соберётся» и метки креста больше не о чём: гасим сразу,
    // чтобы не висели поверх вспышки (вернутся после подсчёта для новых клеток)
    for (const c of this.cells) {
      c.forecast = [];
      c.forecastCard = null;
      c.closesAnim = 0;
    }
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
    if (this.drag?.id === this.hand[handIndex]) this.dropDrag();
    const events = this.hooks.act({ kind: 'burn', handIndex });
    if (!events) return;
    this.busy = true;
    this.selected = null;
    this.hooks.onSelect?.(null);
    this.setHover(null);
    for (const c of this.cells) void this.svc.tweens.to(c, { avail: 0 }, { duration: 0.15 });
    await this.presenter.play(events);
    this.refreshForecast();
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
      'position:fixed;visibility:hidden;pointer-events:none;padding-top:var(--safe-top);padding-bottom:var(--safe-bottom)';
    document.body.append(probe);
  }
  const css = getComputedStyle(probe);
  return { top: parseFloat(css.paddingTop) || 0, bottom: parseFloat(css.paddingBottom) || 0 };
}

/**
 * Затмённая карта: приглушена и закрыта чёрным диском в жемчужной короне — как настоящее
 * солнечное затмение, без красного. Рисуется поверх лица карты.
 */
function drawEclipsed(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // Масть погасла: поле теряет цвет, эмблему закрывает чёрный диск в жемчужной короне
  ctx.save();
  roundRect(ctx, -w / 2, -h / 2, w, h, w * 0.09);
  ctx.clip();
  ctx.globalCompositeOperation = 'saturation';
  ctx.fillStyle = '#808080';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(4,3,12,0.5)';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.restore();
  const e = suitEmblem(w, h);
  const r = e.r * 0.82;
  const cx = e.x - w / 2;
  const cy = e.y - h / 2;
  // Корона: мягкое свечение и тонкое светлое кольцо
  const g = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 2);
  g.addColorStop(0, 'rgba(255,238,210,0.5)');
  g.addColorStop(0.35, 'rgba(255,230,200,0.16)');
  g.addColorStop(1, 'rgba(150,170,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#03020a';
  ctx.fill();
  ctx.lineWidth = Math.max(1, w * 0.014);
  ctx.strokeStyle = 'rgba(255,245,225,0.95)';
  ctx.stroke();
}
