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

/**
 * Слой подсказки мифа, которому не хватает одной звезды (MY.3): золотой пунктир фигуры по небу
 * обрывается на рамке пустой клетки, внутри клетки — рисунок фигуры с пульсирующей недостающей
 * звездой. Рисует по текущей раскладке неба, ничего не держит сам.
 */
export function mythHintLayer(world: GameWorld, state: MythHintState, layout: () => HintLayout): Entity {
  const e = world.create();
  world.add(e, Transform, transform(0, 0));
  world.add(e, Drawable, {
    // Под картами: пунктир виден в просветах и не закрывает ранги
    layer: Layer.Board,
    z: 1000,
    visible: true,
    draw: (ctx) => {
      if (state.alpha <= 0.01 || state.cells.length === 0) return;
      const { cells, cardW, cardH } = layout();
      const pts = state.cells.map((c) => cells[c]!);
      const miss = cells[state.missing]!;
      const pulse = 0.75 + 0.25 * Math.sin(world.res.time * 3);
      const frame = [miss.x - cardW * 0.42, miss.y - cardH * 0.42, cardW * 0.84, cardH * 0.84] as const;
      ctx.save();
      ctx.strokeStyle = '#f6c25b';
      ctx.fillStyle = '#f6c25b';
      ctx.lineCap = 'round';
      ctx.setLineDash([6, 7]);
      ctx.lineDashOffset = -world.res.time * 14;
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = state.alpha * 0.9;
      // Пунктир обрывается на рамке: внутри клетки только рисунок фигуры
      ctx.save();
      ctx.beginPath();
      ctx.rect(-1e5, -1e5, 2e5, 2e5);
      ctx.rect(...frame);
      ctx.clip('evenodd');
      ctx.beginPath();
      for (const [a, b] of state.edges) {
        ctx.moveTo(pts[a]!.x, pts[a]!.y);
        ctx.lineTo(pts[b]!.x, pts[b]!.y);
      }
      ctx.stroke();
      ctx.restore();
      // Рамка тише пунктира: в клетке главный — рисунок
      ctx.globalAlpha = state.alpha * pulse * 0.55;
      ctx.strokeRect(...frame);
      ctx.setLineDash([]);
      drawSilhouette(ctx, state, pts, miss, cardW * 0.66, cardH * 0.6, cardW, pulse);
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
