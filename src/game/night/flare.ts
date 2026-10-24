import { Drawable, Layer, Lifetime, Transform, transform } from '../components';
import type { GameWorld } from '../context';

type Pt = { x: number; y: number };

/**
 * Яркая вспышка созвездия (CQ.6, `brightFlare`, выбор Дениса — «Волна»): кольца света расходятся
 * от линии по всему небу. Растровые карты не масштабируются: всё — свет поверх неба.
 */
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
