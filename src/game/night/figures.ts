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
