import { BODY_FONT, DISPLAY_FONT } from '@/art/palette';
import { Drawable, Layer, Lifetime, Particle, Transform, transform } from './components';
import type { GameWorld } from './context';
import { drawParticle } from './systems/particles';

export interface BurstOptions {
  count?: number;
  speed?: number;
  size?: number;
  life?: number;
  gravity?: number;
  kind?: Particle['kind'];
  spread?: number;
  /** Направление выброса (рад) — по умолчанию во все стороны. */
  angle?: number;
  colors?: string[];
}

export function spawnParticle(world: GameWorld, x: number, y: number, p: Particle, layer = Layer.Effects): void {
  const e = world.create();
  world.add(e, Transform, transform(x, y));
  world.add(e, Particle, p);
  world.add(e, Drawable, { layer, z: 0, visible: true, draw: (ctx, t) => drawParticle(ctx, p, t) });
}

/** Взрыв частиц. */
export function burst(world: GameWorld, x: number, y: number, color: string, opts: BurstOptions = {}): void {
  const count = Math.round((opts.count ?? 18) * (world.res.reduceMotion ? 0.5 : 1));
  const speed = opts.speed ?? 260;
  for (let i = 0; i < count; i++) {
    const a = opts.angle !== undefined ? opts.angle + (Math.random() - 0.5) * (opts.spread ?? 1) : Math.random() * Math.PI * 2;
    const v = speed * (0.35 + Math.random() * 0.75);
    const life = (opts.life ?? 0.8) * (0.6 + Math.random() * 0.6);
    spawnParticle(world, x, y, {
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life,
      maxLife: life,
      drag: 2.5,
      gravity: opts.gravity ?? 120,
      size: (opts.size ?? 2) * (0.6 + Math.random() * 0.8),
      color: opts.colors ? opts.colors[i % opts.colors.length]! : color,
      kind: opts.kind ?? 'spark',
      spin: (Math.random() - 0.5) * 12,
    });
  }
}

export function ring(world: GameWorld, x: number, y: number, color: string, size = 80, life = 0.6): void {
  spawnParticle(world, x, y, { vx: 0, vy: 0, life, maxLife: life, drag: 0, gravity: 0, size, color, kind: 'ring', spin: 0 });
}

export function shake(world: GameWorld, amount: number): void {
  world.res.camera.trauma = Math.min(1, world.res.camera.trauma + amount);
}

export interface FloatTextOptions {
  size?: number;
  color?: string;
  display?: boolean;
  /** Сколько живёт, с. */
  life?: number;
  rise?: number;
  layer?: Layer;
  pop?: boolean;
}

/** Всплывающий текст: «+12», «×2», «ПАРА». Поднимается и тает. */
export function floatText(world: GameWorld, x: number, y: number, text: string, opts: FloatTextOptions = {}): void {
  const size = opts.size ?? 22;
  const life = (opts.life ?? 0.9) / world.res.speed;
  const e = world.create();
  const t = world.add(e, Transform, transform(x, y, { scale: opts.pop === false ? 1 : 0.4 }));
  const font = `${opts.display ? 400 : 800} ${size}px ${opts.display ? DISPLAY_FONT : BODY_FONT}`;
  world.add(e, Drawable, {
    layer: opts.layer ?? Layer.Popups,
    z: 0,
    visible: true,
    draw(ctx, tr) {
      ctx.globalAlpha = tr.alpha;
      ctx.translate(tr.x, tr.y);
      ctx.scale(tr.scale, tr.scale);
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.22;
      ctx.strokeStyle = 'rgba(5,4,20,0.85)';
      ctx.strokeText(text, 0, 0);
      ctx.shadowColor = opts.color ?? '#fff';
      ctx.shadowBlur = size * 0.5;
      ctx.fillStyle = opts.color ?? '#fff';
      ctx.fillText(text, 0, 0);
    },
  });
  world.add(e, Lifetime, { left: life });
  const tweens = world.res.tweens;
  void tweens.to(t, { scale: 1 }, { duration: 0.25 / world.res.speed, ease: 'outBack' });
  void tweens.to(t, { y: y - (opts.rise ?? 36) }, { duration: life, ease: 'outCubic' });
  void tweens.to(t, { alpha: 0 }, { duration: life * 0.35, delay: life * 0.65, ease: 'inQuad' });
}

/** Вспышка всего экрана — для крупных ходов. */
export function flash(world: GameWorld, color = '255,240,200', strength = 0.5, duration = 0.5): void {
  if (world.res.reduceMotion) strength *= 0.4;
  const e = world.create();
  const t = world.add(e, Transform, transform(0, 0, { alpha: strength }));
  const { renderer } = world.res;
  world.add(e, Drawable, {
    layer: Layer.Popups,
    z: -1,
    visible: true,
    draw(ctx, tr) {
      const w = renderer.width;
      const h = renderer.height;
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, `rgba(${color},${tr.alpha})`);
      g.addColorStop(1, `rgba(${color},0)`);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.fillRect(-20, -20, w + 40, h + 40);
    },
  });
  world.add(e, Lifetime, { left: duration });
  void world.res.tweens.to(t, { alpha: 0 }, { duration, ease: 'outQuad' });
}
