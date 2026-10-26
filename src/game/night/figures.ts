import type { Entity } from '@/engine/ecs';
import { Drawable, Layer, Transform, transform } from '../components';
import type { GameWorld } from '../context';

type Pt = { x: number; y: number };

/** Живая фигура на небе: сколько прорисовано (0..1), прозрачность, дышит ли. */
export interface FigureState {
  progress: number;
  alpha: number;
  breathe: boolean;
}

export interface FigureFx {
  state: FigureState;
  entity: Entity;
}

/**
 * Слой фигур (TD.13): светящаяся ломаная через центры карт, прорисовывается по `progress`.
 * Сейчас это линия созвездия; фигуры мифов 0.7 рисуются тем же слоем по своим точкам.
 */
export function drawFigure(world: GameWorld, pts: readonly Pt[], color: string): FigureFx {
  const state: FigureState = { progress: 0, alpha: 1, breathe: false };
  const e = world.create();
  world.add(e, Transform, transform(0, 0));
  world.add(e, Drawable, {
    layer: Layer.Effects,
    z: 0,
    visible: true,
    draw: (ctx) => {
      const total = pts.length - 1;
      const upto = state.progress * total;
      const breath = state.breathe ? 0.86 + 0.14 * Math.sin(world.res.time * 9) : 1;
      ctx.globalAlpha = state.alpha * breath;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const [width, alpha] of [[10, 0.12], [4, 0.35], [1.6, 1]] as const) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = state.alpha * breath * alpha;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(pts[0]!.x, pts[0]!.y);
        for (let i = 1; i <= total; i++) {
          const k = Math.min(1, Math.max(0, upto - (i - 1)));
          if (k <= 0) break;
          const a = pts[i - 1]!;
          const b = pts[i]!;
          ctx.lineTo(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = state.alpha;
      for (let i = 0; i <= Math.min(total, Math.floor(upto)); i++) {
        const p = pts[i]!;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 16);
        g.addColorStop(0, 'rgba(255,255,255,0.9)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(p.x - 16, p.y - 16, 32, 32);
      }
    },
  });
  return { state, entity: e };
}

/**
 * Как небо подсказывает миф, которому не хватает одной звезды (MY.3, витрина вариантов):
 * `dashes` — пунктир фигуры и пунктирная клетка, `stars` — звёздочки на картах фигуры и
 * свечение клетки, `silhouette` — маленький рисунок фигуры в пустой клетке, `combo` — пунктир
 * фигуры по небу и её рисунок в пустой клетке.
 */
export type MythHintStyle = 'dashes' | 'stars' | 'silhouette' | 'combo';

export interface MythHintState {
  /** Клетки фигуры в её порядке и рёбра по их индексам; пусто — подсказки нет. */
  cells: number[];
  edges: readonly (readonly [number, number])[];
  /** Клетка, которой не хватает. */
  missing: number;
  alpha: number;
}

interface HintLayout {
  cells: readonly Pt[];
  cardW: number;
  cardH: number;
}

/** Слой подсказки мифа: рисует по текущей раскладке неба, ничего не держит сам. */
export function mythHintLayer(world: GameWorld, style: MythHintStyle, state: MythHintState, layout: () => HintLayout): Entity {
  const e = world.create();
  world.add(e, Transform, transform(0, 0));
  world.add(e, Drawable, {
    // Пунктир и силуэт — под картами (видны в просветах и в пустой клетке), звёздочки — на картах
    layer: style === 'stars' ? Layer.Effects : Layer.Board,
    z: 1000,
    visible: true,
    draw: (ctx) => {
      if (state.alpha <= 0.01 || state.cells.length === 0) return;
      const { cells, cardW, cardH } = layout();
      const pts = state.cells.map((c) => cells[c]!);
      const miss = cells[state.missing]!;
      const pulse = 0.75 + 0.25 * Math.sin(world.res.time * 3);
      ctx.save();
      ctx.globalAlpha = state.alpha;
      ctx.strokeStyle = '#f6c25b';
      ctx.fillStyle = '#f6c25b';
      ctx.lineCap = 'round';
      if (style === 'dashes' || style === 'combo') {
        ctx.setLineDash([6, 7]);
        ctx.lineDashOffset = -world.res.time * 14;
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = state.alpha * 0.9;
        const frame = [miss.x - cardW * 0.42, miss.y - cardH * 0.42, cardW * 0.84, cardH * 0.84] as const;
        if (style === 'combo') {
          // Пунктир обрывается на рамке: внутри клетки только рисунок фигуры
          ctx.save();
          ctx.beginPath();
          ctx.rect(-1e5, -1e5, 2e5, 2e5);
          ctx.rect(...frame);
          ctx.clip('evenodd');
        }
        ctx.beginPath();
        for (const [a, b] of state.edges) {
          ctx.moveTo(pts[a]!.x, pts[a]!.y);
          ctx.lineTo(pts[b]!.x, pts[b]!.y);
        }
        ctx.stroke();
        if (style === 'combo') ctx.restore();
        // В «combo» рамка тише: внутри клетки главный — рисунок фигуры
        ctx.globalAlpha = state.alpha * pulse * (style === 'combo' ? 0.55 : 1);
        ctx.strokeRect(...frame);
        ctx.setLineDash([]);
        if (style === 'combo') drawSilhouette(ctx, state, pts, miss, cardW * 0.66, cardH * 0.6, cardW, pulse);
      } else if (style === 'stars') {
        state.cells.forEach((c, i) => {
          if (c === state.missing) return;
          const p = cells[c]!;
          const tw = 0.6 + 0.4 * Math.sin(world.res.time * 4 + i * 1.3);
          star4(ctx, p.x + cardW * 0.42, p.y - cardH * 0.42, Math.max(8, cardW * 0.16) * (0.8 + 0.2 * tw), state.alpha * (0.7 + 0.3 * tw));
        });
        const g = ctx.createRadialGradient(miss.x, miss.y, 0, miss.x, miss.y, cardW * 0.55);
        g.addColorStop(0, `rgba(246,194,91,${0.55 * pulse})`);
        g.addColorStop(1, 'rgba(246,194,91,0)');
        ctx.fillStyle = g;
        ctx.fillRect(miss.x - cardW, miss.y - cardH, cardW * 2, cardH * 2);
        star4(ctx, miss.x, miss.y, Math.max(12, cardW * 0.22) * pulse, state.alpha);
      } else {
        drawSilhouette(ctx, state, pts, miss, cardW * 0.78, cardH * 0.7, cardW, pulse);
      }
      ctx.restore();
    },
  });
  return e;
}

/** Рисунок фигуры, вписанный в пустую клетку (`w×h`); её звезда — крупнее и пульсирует. */
function drawSilhouette(ctx: CanvasRenderingContext2D, state: MythHintState, pts: readonly Pt[], miss: Pt, w: number, h: number, cardW: number, pulse: number): void {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min(w / Math.max(1, x1 - x0), h / Math.max(1, y1 - y0));
  const mini = pts.map((p) => ({ x: miss.x + (p.x - (x0 + x1) / 2) * k, y: miss.y + (p.y - (y0 + y1) / 2) * k }));
  ctx.lineWidth = 2;
  ctx.globalAlpha = state.alpha * 0.9;
  ctx.beginPath();
  for (const [a, b] of state.edges) {
    ctx.moveTo(mini[a]!.x, mini[a]!.y);
    ctx.lineTo(mini[b]!.x, mini[b]!.y);
  }
  ctx.stroke();
  state.cells.forEach((c, i) => {
    const p = mini[i]!;
    const own = c === state.missing;
    ctx.globalAlpha = state.alpha * (own ? pulse : 0.85);
    ctx.beginPath();
    ctx.arc(p.x, p.y, own ? Math.max(5, cardW * 0.08) * pulse : Math.max(3, cardW * 0.045), 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Четырёхлучевая звёздочка. */
function star4(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#ffe6a8';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.28;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
