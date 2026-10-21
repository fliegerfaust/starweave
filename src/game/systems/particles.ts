import type { System } from '@/engine/ecs';
import { Lifetime, Particle, Transform } from '../components';
import type { Resources } from '../context';

export const particleSystem: System<Resources> = {
  name: 'particles',
  update(world, dt) {
    for (const e of world.query(Particle, Transform)) {
      const p = world.req(e, Particle);
      const t = world.req(e, Transform);
      p.life -= dt;
      if (p.life <= 0) {
        world.destroy(e);
        continue;
      }
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vy = p.vy * drag + p.gravity * dt;
      t.x += p.vx * dt;
      t.y += p.vy * dt;
      t.rot += p.spin * dt;
      t.alpha = Math.min(1, (p.life / p.maxLife) * 1.6);
    }
    for (const e of world.query(Lifetime)) {
      const l = world.req(e, Lifetime);
      l.left -= dt;
      if (l.left <= 0) world.destroy(e);
    }
  },
};

export function drawParticle(ctx: CanvasRenderingContext2D, p: Particle, t: Transform): void {
  ctx.globalAlpha = t.alpha;
  ctx.fillStyle = p.color;
  ctx.strokeStyle = p.color;
  switch (p.kind) {
    case 'dot': {
      ctx.beginPath();
      ctx.arc(t.x, t.y, p.size * t.scale, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'spark': {
      // Чёрточка вдоль скорости — читается как искра
      const len = Math.min(18, Math.hypot(p.vx, p.vy) * 0.03 + 2);
      const a = Math.atan2(p.vy, p.vx);
      ctx.lineWidth = p.size;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(t.x, t.y);
      ctx.lineTo(t.x - Math.cos(a) * len, t.y - Math.sin(a) * len);
      ctx.stroke();
      break;
    }
    case 'shard': {
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.rot);
      ctx.beginPath();
      ctx.moveTo(0, -p.size);
      ctx.lineTo(p.size * 0.6, p.size * 0.8);
      ctx.lineTo(-p.size * 0.5, p.size * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'dust': {
      // Облачко растёт и тает; поверх свечения не складывается — это пыль, а не свет
      const k = p.life / p.maxLife;
      const r = p.size * (1.4 - k * 0.6);
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = k * 0.9;
      const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, r);
      g.addColorStop(0, p.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(t.x - r, t.y - r, r * 2, r * 2);
      ctx.restore();
      break;
    }
    case 'ring': {
      const k = 1 - p.life / p.maxLife;
      ctx.lineWidth = Math.max(0.5, 3 * (1 - k));
      ctx.beginPath();
      ctx.arc(t.x, t.y, p.size * (0.2 + k), 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
  }
  ctx.globalAlpha = 1;
}
