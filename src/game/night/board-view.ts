import { CARD_ASPECT, CARD_PAD, cardBack, cardFace, suitEmblem } from '@/art/card';
import { roundRect } from '@/art/glyphs';
import { SUIT_COLORS, rgba } from '@/art/palette';
import type { Card } from '@/core/types';
import type { Entity } from '@/engine/ecs';
import { CardView, Drawable, Hit, Layer, Transform, transform } from '../components';
import { computeLayout, handPositions, isLandscape, isWideDesktop, type PlayArea } from '../layout';
import type { CellState, NightScene } from './scene';

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Вид неба и руки: раскладка под экран, сущности карт и клеток, их рисование и геометрия
 * («какая клетка под пальцем», прямоугольники для подсказок обучения).
 */
export class BoardView {
  constructor(private readonly scene: NightScene) {}

  computeLayout(): void {
    const { renderer } = this.scene.svc;
    const { width, height } = renderer;
    const safe = safeInsets();
    const landscape = isLandscape(width, height);
    document.body.classList.toggle('landscape', landscape);
    // Широкий ПК (CQ.5): табло и кнопки растут с окном (`--ui-k`) и стоят у неба одним блоком
    const wide = !!this.scene.hooks.wide && isWideDesktop(width, height);
    const k = wide ? Math.max(1, Math.min(1.6, height / 700, width / 1200)) : 1;
    const root = document.documentElement.style;
    root.setProperty('--ui-k', String(k));
    document.body.classList.toggle('pc-wide', wide);
    const hud = this.scene.hud.el.getBoundingClientRect();
    const actions = this.scene.hud.actions.getBoundingClientRect();
    const area: PlayArea = landscape
      ? { top: safe.top, bottom: height - safe.bottom, left: wide ? 0 : Math.max(hud.right, actions.right), right: width }
      : { top: hud.bottom || safe.top + 168, bottom: actions.top || height - safe.bottom - 64, left: 0, right: width };
    this.scene.layout = computeLayout(width, height, this.scene.night.rules.gridSize, area, wide ? { dock: Math.max(hud.width, actions.width) } : null);
    const { board, hudX } = this.scene.layout;
    if (hudX !== null) {
      // Табло встаёт вровень с верхом неба, кнопки — с низом; значения делятся на `zoom` панели
      root.setProperty('--hud-left', `${hudX / k}px`);
      root.setProperty('--hud-top', `${Math.max(safe.top, board.y) / k}px`);
      root.setProperty('--actions-bottom', `${Math.max(safe.bottom, height - board.y - board.h) / k}px`);
    }
    if (wide) {
      // Созвездия — между рамой и кнопками; не влезают целиком (окно 907×510) — колонка пустая
      const list = this.scene.hud.combos;
      const frameEl = this.scene.hud.el.querySelector('.hud-frame')!.getBoundingClientRect();
      const free = height - Math.max(safe.bottom, height - board.y - board.h) - 46 * k - 16 * k - frameEl.bottom - 12 * k;
      root.setProperty('--combos-h', `${Math.max(0, free) / k}px`);
      list.classList.remove('cut');
      list.classList.toggle('cut', list.scrollHeight > list.clientHeight + 1);
    }
    root.setProperty('--board-top', `${this.scene.layout.board.y}px`);
    root.setProperty('--board-cx', `${this.scene.layout.board.x + this.scene.layout.board.w / 2}px`);
    // Лоток подсчёта («Рама»): в портрете — над рукой, прямо над кнопками; вспыхнувшие
    // карты он не закрывает. В ландшафте и на ПК — в колонке под рамой табло.
    const frame = this.scene.hud.el.querySelector('.hud-frame')?.getBoundingClientRect() ?? hud;
    if (landscape) {
      // Лоток в `zoom` вместе с табло: его координаты — в единицах до увеличения
      root.setProperty('--calc-top', `${(frame.bottom + 12) / k}px`);
      root.setProperty('--calc-cx', `${(frame.left + frame.width / 2) / k}px`);
      root.setProperty('--calc-w', `${frame.width / k}px`);
    } else {
      root.setProperty('--calc-bottom', `${Math.max(0, height - (actions.top || height - safe.bottom - 64)) + 8}px`);
      root.setProperty('--calc-cx', `${this.scene.layout.board.x + this.scene.layout.board.w / 2}px`);
      root.setProperty('--calc-w', `${Math.min(352, width - 24)}px`);
    }
  }

  /** Насколько выдвигается выбранная карта: вверх в портрете, влево в ландшафте. */
  get liftAmount(): number {
    return this.scene.layout.mode === 'landscape' ? this.scene.layout.handW * 0.22 : this.scene.layout.handH * 0.16;
  }

  get boardScale(): number {
    return this.scene.layout.cardW / this.scene.layout.handW;
  }

  createCard(card: Card, x: number, y: number, zone: CardView['zone']): Entity {
    const e = this.scene.world.create();
    const view: CardView = {
      card,
      width: this.scene.layout.handW,
      faceUp: true,
      hideRank: this.scene.night.rules.hideRanks && zone !== 'board',
      debuffed: this.scene.night.rules.debuffSuit === card.suit,
      glow: 0,
      glowColor: SUIT_COLORS[card.suit].main,
      lift: 0,
      zone,
      cell: -1,
    };
    const t = this.scene.world.add(e, Transform, transform(x, y));
    this.scene.world.add(e, CardView, view);
    this.scene.world.add(e, Hit, { w: this.scene.layout.handW, h: this.scene.layout.handH, enabled: true });
    const drawable: Drawable = {
      layer: zone === 'board' ? Layer.BoardCards : Layer.Hand,
      z: 0,
      visible: true,
      draw: (ctx) => this.drawCard(ctx, view, t),
    };
    this.scene.world.add(e, Drawable, drawable);
    this.scene.cards.set(card.id, e);
    return e;
  }

  private drawCard(ctx: CanvasRenderingContext2D, v: CardView, t: Transform): void {
    const dpr = this.scene.svc.renderer.dpr;
    const w = v.width;
    const hgt = w / 0.7;
    // Спрайт рисуем с запасом — по самому крупному размеру карты на экране (небо, рука,
    // подъём при выкладке), — и только уменьшаем: растянутый спрайт мылит.
    const spriteW = Math.ceil(Math.max(this.scene.layout.handW, this.scene.layout.cardW) * 1.12);
    const k = w / spriteW;
    const pad = Math.ceil(spriteW * CARD_PAD) * k;
    const spriteH = Math.round(spriteW / CARD_ASPECT) * k;
    const showFace = v.faceUp && t.flip >= 0;
    const img = showFace ? cardFace(v.card, spriteW, dpr, { hideRank: v.hideRank }) : cardBack(spriteW, dpr);
    ctx.globalAlpha = t.alpha;
    if (this.scene.layout.mode === 'landscape') ctx.translate(t.x - v.lift, t.y);
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

  createCell(index: number, sealed: boolean): CellState {
    const e = this.scene.world.create();
    const p = this.scene.layout.cells[index]!;
    const t = this.scene.world.add(e, Transform, transform(p.x, p.y, { alpha: 0 }));
    const state: CellState = { entity: e, sealed, avail: 0, hover: 0, ignite: 0, igniteColor: '#f6c25b', closes: 0, closesAnim: 0, tut: 0, forecast: [], forecastPicked: false, forecastWeak: false, forecastCard: null };
    this.scene.world.add(e, Drawable, {
      layer: Layer.Board,
      z: 0,
      visible: true,
      draw: (ctx) => this.drawCell(ctx, state, t),
    });
    void this.scene.svc.tweens.to(t, { alpha: 1 }, { duration: 0.4, delay: index * 0.025 });
    return state;
  }

  private drawCell(ctx: CanvasRenderingContext2D, s: CellState, t: Transform): void {
    const { cardW: w, cardH: hgt } = this.scene.layout;
    const x = t.x - w / 2;
    const y = t.y - hgt / 2;
    const r = w * 0.09;
    const time = this.scene.world.res.time;
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
    // Широкий ПК (CQ.5): пустое небо видно с первого взгляда — клетка плотнее, кромка сплошная
    const wide = this.scene.layout.wide;
    ctx.fillStyle = `rgba(30,26,80,${(wide ? 0.42 : 0.28) + s.hover * 0.25})`;
    ctx.fill();
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    const a = (wide ? 0.3 : 0.16) + s.avail * (0.22 + pulse * 0.18) + s.hover * 0.4;
    ctx.strokeStyle = `rgba(170,160,255,${a})`;
    ctx.lineWidth = 1 + s.hover;
    if (!wide) ctx.setLineDash([4, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Звёздочки по углам клетки
    ctx.fillStyle = `rgba(200,190,255,${0.25 + s.avail * 0.3})`;
    for (const [cx, cy] of [[x + 6, y + 6], [x + w - 6, y + 6], [x + 6, y + hgt - 6], [x + w - 6, y + hgt - 6]] as const) {
      ctx.fillRect(cx - 1, cy - 1, 2, 2);
    }
    if (this.scene.input.focusedCell === this.scene.cells.indexOf(s)) {
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
      if (named) this.scene.forecast.draw(ctx, s, t.x, t.y, w, hgt, k);
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

  /** Окно сменило размер: клетки и карты встают на новые места без анимации. */
  relayout(): void {
    this.computeLayout();
    this.scene.cells.forEach((c, i) => {
      const t = this.scene.world.req(c.entity, Transform);
      const p = this.scene.layout.cells[i]!;
      t.x = p.x;
      t.y = p.y;
    });
    for (const [, e] of this.scene.cards) {
      const v = this.scene.world.req(e, CardView);
      if (v.zone === 'flying') continue;
      // Летящие твины ведут к старым координатам — обрываем и ставим карты на новые места
      const tr = this.scene.world.req(e, Transform);
      this.scene.svc.tweens.cancel(tr);
      this.scene.svc.tweens.cancel(v);
      tr.flip = 1;
      tr.alpha = 1;
      v.width = this.scene.layout.handW;
      const hit = this.scene.world.req(e, Hit);
      hit.w = this.scene.layout.handW;
      hit.h = this.scene.layout.handH;
      if (v.zone === 'board' && v.cell >= 0) {
        const t = this.scene.world.req(e, Transform);
        const p = this.scene.layout.cells[v.cell]!;
        t.x = p.x;
        t.y = p.y;
        t.scale = this.boardScale;
      }
    }
    this.layoutHand(false);
  }

  /** Раскладывает руку веером. */
  layoutHand(animate = true, skip?: Entity): Promise<void> {
    const pos = handPositions(this.scene.layout, this.scene.hand.length);
    const jobs: Promise<void>[] = [];
    this.scene.hand.forEach((id, i) => {
      const e = this.scene.cards.get(id);
      if (e === undefined || e === skip) return;
      const t = this.scene.world.req(e, Transform);
      const v = this.scene.world.req(e, CardView);
      const d = this.scene.world.req(e, Drawable);
      d.layer = Layer.Hand;
      d.z = i;
      v.zone = 'hand';
      // Через твин: он перебивает незаконченный подъём от наведения мыши
      const sel = this.scene.selected === i;
      void this.scene.svc.tweens.to(v, { lift: sel ? this.liftAmount : 0, glow: sel ? 1 : 0 }, { duration: animate ? 0.12 : 0.001 });
      const p = pos[i]!;
      if (animate) jobs.push(this.scene.svc.tweens.to(t, { x: p.x, y: p.y, rot: p.rot, scale: 1 }, { duration: 0.28 / this.scene.world.res.speed, ease: 'outCubic' }));
      else Object.assign(t, { x: p.x, y: p.y, rot: p.rot, scale: 1 });
    });
    return Promise.all(jobs).then(() => undefined);
  }

  handIndexAt(x: number, y: number): number | null {
    const pos = handPositions(this.scene.layout, this.scene.hand.length);
    for (let i = this.scene.hand.length - 1; i >= 0; i--) {
      const p = pos[i]!;
      const lift = this.scene.selected === i ? this.liftAmount : 0;
      const [lx, ly] = this.scene.layout.mode === 'landscape' ? [lift, 0] : [0, lift];
      if (Math.abs(x - (p.x - lx)) < this.scene.layout.handW / 2 && Math.abs(y - (p.y - ly)) < this.scene.layout.handH / 2) return i;
    }
    return null;
  }

  cellAt(x: number, y: number): number | null {
    const { cardW, cardH, gap } = this.scene.layout;
    let best: number | null = null;
    let bestD = Infinity;
    this.scene.layout.cells.forEach((p, i) => {
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

  /** Прямоугольник клетки в CSS-пикселях. */
  cellRect(cell: number): Rect {
    const p = this.scene.layout.cells[cell]!;
    return { x: p.x - this.scene.layout.cardW / 2, y: p.y - this.scene.layout.cardH / 2, w: this.scene.layout.cardW, h: this.scene.layout.cardH };
  }

  /** Прямоугольник карты руки по id. */
  handRect(cardId: number): Rect | null {
    const i = this.scene.hand.indexOf(cardId);
    if (i < 0) return null;
    const p = handPositions(this.scene.layout, this.scene.hand.length)[i]!;
    return { x: p.x - this.scene.layout.handW / 2, y: p.y - this.scene.layout.handH / 2, w: this.scene.layout.handW, h: this.scene.layout.handH };
  }

  /** Прямоугольник выбранной карты руки там, где она стоит: с выдвижением. */
  selectedRect(): Rect | null {
    const i = this.scene.selected;
    const r = i === null ? null : this.handRect(this.scene.hand[i] ?? -1);
    if (!r) return null;
    return this.scene.layout.mode === 'landscape' ? { ...r, x: r.x - this.liftAmount } : { ...r, y: r.y - this.liftAmount };
  }

  /** Общий прямоугольник нескольких клеток. */
  cellsRect(cells: readonly number[]): Rect {
    const rects = cells.map((c) => this.cellRect(c));
    const x = Math.min(...rects.map((r) => r.x));
    const y = Math.min(...rects.map((r) => r.y));
    return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
  }

  /** Прямоугольник всей руки. */
  handAreaRect(): Rect {
    const rects = this.scene.hand.map((id) => this.handRect(id)!).filter(Boolean);
    const x = Math.min(...rects.map((r) => r.x));
    const y = Math.min(...rects.map((r) => r.y));
    return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
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
