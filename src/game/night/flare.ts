import { Drawable, Layer, Lifetime, Transform, transform } from '../components';
import type { GameWorld } from '../context';

type Pt = { x: number; y: number };

/**
 * Яркая вспышка созвездия (CQ.6, `brightFlare`), витрина: `a` — луч по линии, `b` — удар
 * со стоп-кадром, `c` — световая волна от центра линии. Растровые карты не масштабируются:
 * всё — свет поверх неба.
 */
export type FlareVariant = 'a' | 'b' | 'c';

/** Луч: широкая полоса света бежит от первой карты линии к последней и гаснет. */
export function beam(world: GameWorld, pts: readonly Pt[], color: string, width: number, duration: number): Promise<void> {
  const state = { head: 0, alpha: 1 };
  const e = world.create();
  world.add(e, Transform, transform(0, 0));
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  const soft = world.res.reduceMotion ? 0.5 : 1;
  world.add(e, Drawable, {
    layer: Layer.Effects,
    z: 1,
    visible: true,
    draw: (ctx) => {
      const x = a.x + (b.x - a.x) * state.head;
      const y = a.y + (b.y - a.y) * state.head;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      // Тонкая раскалённая нить с ореолом цвета масти — свет, а не полоса поверх карт
      for (const [w, alpha, c, blur] of [[width * 0.22, 0.18, color, width * 0.6], [width * 0.07, 0.95, '#fff6dc', width * 0.25]] as const) {
        ctx.globalAlpha = state.alpha * alpha * soft;
        ctx.strokeStyle = c;
        ctx.shadowColor = color;
        ctx.shadowBlur = blur;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      // Голова луча — яркое пятно, где свет сейчас
      const g = ctx.createRadialGradient(x, y, 0, x, y, width * 0.9);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * state.alpha * soft})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.fillRect(x - width, y - width, width * 2, width * 2);
    },
  });
  world.add(e, Lifetime, { left: duration * 2.2 });
  const tw = world.res.tweens;
  return tw.to(state, { head: 1 }, { duration, ease: 'outQuad' }).then(() => {
    void tw.to(state, { alpha: 0 }, { duration: duration * 1.1, ease: 'outQuad' });
  });
}

/** Волна: кольцо света расходится от точки до края неба и тает. */
export function shockwave(world: GameWorld, at: Pt, maxR: number, color: string, duration: number, delay = 0): void {
  const state = { r: maxR * 0.08, alpha: 0 };
  const e = world.create();
  world.add(e, Transform, transform(0, 0));
  const soft = world.res.reduceMotion ? 0.4 : 1;
  world.add(e, Drawable, {
    layer: Layer.Effects,
    z: 1,
    visible: true,
    draw: (ctx) => {
      if (state.alpha <= 0.01) return;
      ctx.globalCompositeOperation = 'lighter';
      const ring = Math.max(6, maxR * 0.07);
      const g = ctx.createRadialGradient(at.x, at.y, Math.max(0, state.r - ring), at.x, at.y, state.r + ring);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, color);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = state.alpha * soft;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(at.x, at.y, state.r + ring, 0, Math.PI * 2);
      ctx.fill();
    },
  });
  world.add(e, Lifetime, { left: delay + duration + 0.1 });
  const tw = world.res.tweens;
  void tw.to(state, { alpha: 0.9 }, { duration: 0.06, delay });
  void tw.to(state, { r: maxR }, { duration, delay, ease: 'outCubic' });
  void tw.to(state, { alpha: 0 }, { duration: duration * 0.8, delay: delay + duration * 0.2, ease: 'inQuad' });
}
