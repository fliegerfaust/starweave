import { SKY_FIGURES, starRadius, type SkyFigure } from '@/art/constellations';
import type { Entity } from '@/engine/ecs';
import { t } from '@/i18n';
import { Drawable, Layer, Transform, transform } from '../components';
import { burst } from '../fx';
import type { NightScene } from './scene';

/**
 * Цель на сцене (GO.3, витрина): небо отзывается на приближение к цели ночи. Варианты:
 * `a` — «Рассвет»: ночь тёмная, каждое созвездие поднимает зарю, на цели небо светлое;
 * `b` — «Затмение»: за небом диск Затмения с кольцом тени, созвездия бьют по нему, луна сходит с солнца;
 * `c` — «Созвездие ночи»: во всё небо контур созвездия, его звёзды загораются по мере счёта.
 * Число цели остаётся в табло, сцена — второй, наглядный слой.
 */
export type GoalVariant = 'a' | 'b' | 'c';

type Pt = { x: number; y: number };
type Beam = { from: Pt; to: Pt; age: number; life: number };
type Pool = { x: number; y: number; r: number; a: number };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function goalVariant(): GoalVariant | null {
  const v = document.documentElement.dataset.goal;
  return v === 'a' || v === 'b' || v === 'c' ? v : null;
}

export class GoalSky {
  /** Показанный прогресс 0…1 (плавно догоняет счёт). */
  shown = 0;
  /** Удар: 1 сразу после попадания, гаснет к 0. */
  hitK = 0;
  /** Финал: 0…1, небо отбито / зажжено. */
  won = 0;
  private beams: Beam[] = [];
  private pools: Pool[] = [];
  private readonly entity: Entity;
  private readonly figure: SkyFigure;
  /** Порядок зажигания звёзд созвездия: обходом по линиям от первой. */
  private readonly order: number[];
  private readonly calm: boolean;

  constructor(
    private readonly scene: NightScene,
    readonly variant: GoalVariant,
  ) {
    const world = scene.world;
    this.calm = !!world.res.reduceMotion;
    this.figure = SKY_FIGURES.find((f) => f.id === 'orion')!;
    this.order = walk(this.figure);
    this.shown = clamp01(scene.night.score / scene.night.target);
    this.entity = world.create();
    world.add(this.entity, Transform, transform(0, 0));
    // Над туманностью и звёздами, под клетками неба
    world.add(this.entity, Drawable, { layer: Layer.Background, z: 1, visible: true, draw: (ctx) => this.draw(ctx, world.res.time) });
  }

  destroy(): void {
    this.scene.world.destroy(this.entity);
  }

  /** Созвездия попали: огонь из клеток в цель, прогресс догоняет счёт. */
  async hit(progress: number, cells: Pt[]): Promise<void> {
    const tw = this.scene.svc.tweens;
    const me: GoalSky = this;
    const p = clamp01(progress);
    const goal = this.aim(p);
    if (this.variant === 'a') {
      const c = centroid(cells);
      const b = this.scene.layout.board;
      if (c) this.pools.push({ x: c.x, y: c.y, r: Math.max(b.w, b.h) * 0.45, a: 0 });
      if (this.pools.length > 6) this.pools.shift();
      const pool = this.pools[this.pools.length - 1];
      if (pool) void tw.to(pool, { a: 1 }, { duration: 0.5, ease: 'outCubic' });
    } else if (!this.calm) {
      for (const from of uniq(cells)) this.beams.push({ from, to: goal, age: 0, life: 0.55 });
    }
    this.hitK = 1;
    void tw.to(me, { hitK: 0 }, { duration: 0.9, ease: 'outCubic', delay: 0.25 });
    await tw.to(me, { shown: p }, { duration: this.calm ? 0.3 : 0.9, ease: 'outCubic', delay: this.variant === 'a' ? 0 : 0.2 });
    if (!this.calm) {
      const spark = this.aim(p);
      burst(this.scene.world, spark.x, spark.y, '#ffe6a8', { count: 14, speed: 220, colors: ['#ffe6a8', '#fff', this.variant === 'b' ? '#e8e4f4' : '#f6c25b'] });
    }
    if (p >= 1 && this.won < 1) await tw.to(me, { won: 1 }, { duration: this.calm ? 0.3 : 1.2, ease: 'outCubic' });
  }

  /** Куда летит огонь: в Затмение, в следующую звезду созвездия, в зарю. */
  private aim(p: number): Pt {
    const b = this.scene.layout.board;
    if (this.variant === 'b') return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    if (this.variant === 'c') {
      const k = Math.max(0, Math.min(this.order.length - 1, Math.ceil(p * this.order.length) - 1));
      return this.starPos(this.order[k]!);
    }
    const { height } = this.scene.svc.renderer;
    return { x: b.x + b.w / 2, y: height };
  }

  private draw(ctx: CanvasRenderingContext2D, time: number): void {
    const dt = 1 / 60;
    for (const beam of this.beams) beam.age += dt;
    this.beams = this.beams.filter((beam) => beam.age < beam.life);
    if (this.variant === 'a') this.drawDawn(ctx);
    else if (this.variant === 'b') this.drawEclipse(ctx, time);
    else this.drawFigure(ctx, time);
    this.drawBeams(ctx);
  }

  // ── A · Рассвет ──────────────────────────────────────────────────────────
  private drawDawn(ctx: CanvasRenderingContext2D): void {
    const { width: w, height: h } = this.scene.svc.renderer;
    const p = this.shown;
    // Тьма: ночь гуще, пока цель далеко
    ctx.fillStyle = `rgba(2, 2, 12, ${0.66 * (1 - p) ** 1.3})`;
    ctx.fillRect(0, 0, w, h);
    // Следы созвездий: тёплые пятна света там, где вспыхнули ряды
    ctx.globalCompositeOperation = 'lighter';
    for (const pool of this.pools) {
      const g = ctx.createRadialGradient(pool.x, pool.y, 0, pool.x, pool.y, pool.r);
      g.addColorStop(0, `rgba(255, 214, 150, ${0.16 * pool.a})`);
      g.addColorStop(1, 'rgba(255, 214, 150, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(pool.x - pool.r, pool.y - pool.r, pool.r * 2, pool.r * 2);
    }
    // Заря поднимается снизу: выше и теплее с каждым созвездием
    const rise = h * (0.18 + 0.62 * p);
    const k = 0.15 + 0.85 * p;
    const g = ctx.createLinearGradient(0, h, 0, h - rise);
    g.addColorStop(0, `rgba(255, 140, 90, ${0.5 * k + 0.14 * this.hitK})`);
    g.addColorStop(0.3, `rgba(255, 186, 104, ${0.26 * k})`);
    g.addColorStop(0.65, `rgba(255, 120, 150, ${0.08 * k})`);
    g.addColorStop(1, 'rgba(120, 90, 200, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, h - rise, w, rise);
    // Победа: небо светлеет целиком
    if (this.won > 0) {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, `rgba(120, 150, 255, ${0.06 * this.won})`);
      sky.addColorStop(1, `rgba(255, 200, 130, ${0.12 * this.won})`);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ── B · Затмение ─────────────────────────────────────────────────────────
  private drawEclipse(ctx: CanvasRenderingContext2D, time: number): void {
    const b = this.scene.layout.board;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const r = Math.min(b.w, b.h) * 0.27;
    const p = this.shown;
    const shake = this.calm ? 0 : this.hitK * Math.sin(time * 70) * 4;
    // Солнце за луной: чем ближе цель, тем больше его видно
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * (2.1 + 0.6 * p));
    halo.addColorStop(0, `rgba(232, 228, 244, ${0.28 + 0.2 * this.hitK})`);
    halo.addColorStop(0.35, `rgba(200, 190, 255, ${0.1 + 0.08 * p})`);
    halo.addColorStop(1, 'rgba(200, 190, 255, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, r * (2.1 + 0.6 * p), 0, Math.PI * 2);
    ctx.fill();
    const sun = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    sun.addColorStop(0, `rgba(255, 240, 205, ${0.34 + 0.16 * this.won})`);
    sun.addColorStop(0.75, `rgba(255, 200, 120, ${0.26 + 0.14 * this.won})`);
    sun.addColorStop(1, 'rgba(246, 194, 91, 0.12)');
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // Луна сходит с солнца по мере счёта: растёт серп; на цели тает
    const off = r * 1.15 * p ** 1.1;
    const mx = cx + off * 0.82 + shake;
    const my = cy - off * 0.57;
    ctx.globalAlpha = 1 - this.won;
    ctx.fillStyle = '#04030d';
    ctx.beginPath();
    ctx.arc(mx, my, r * 1.02, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(232, 228, 244, ${0.35 * (1 - this.won)})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Кольцо тени: запас Затмения, тает с каждым созвездием
    const ring = r * 1.42;
    const left = 1 - p;
    ctx.lineCap = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(232, 228, 244, 0.1)';
    ctx.beginPath();
    ctx.arc(cx, cy, ring, 0, Math.PI * 2);
    ctx.stroke();
    if (left > 0.001) {
      ctx.strokeStyle = `rgba(20, 14, 48, ${0.92 * (1 - this.won)})`;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(cx, cy, ring, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
      ctx.stroke();
      ctx.strokeStyle = `rgba(232, 228, 244, ${(0.55 + 0.4 * this.hitK) * (1 - this.won)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  // ── C · Созвездие ночи ───────────────────────────────────────────────────
  private frame(): { x: number; y: number; w: number; h: number } {
    const { width, height } = this.scene.svc.renderer;
    const b = this.scene.layout.board;
    // Во всё небо: на телефоне шире поля, на ПК — квадрат вокруг поля
    const s = Math.min(width * 0.94, height * 0.86, Math.max(b.w, b.h) * 1.55);
    return { x: b.x + b.w / 2 - s / 2, y: Math.max(height * 0.04, b.y + b.h / 2 - s / 2), w: s, h: s };
  }

  private starPos(i: number): Pt {
    const f = this.frame();
    const [sx, sy] = this.figure.stars[i]!;
    return { x: f.x + (sx / 100) * f.w, y: f.y + (sy / 100) * f.h };
  }

  private drawFigure(ctx: CanvasRenderingContext2D, time: number): void {
    const f = this.frame();
    const n = this.order.length;
    const litCount = this.shown * n;
    const lit = new Map<number, number>();
    this.order.forEach((star, k) => lit.set(star, clamp01(litCount - k)));
    // Линии: пунктир, пока звёзды не горят; загораются, когда горят обе
    for (const [a, z] of this.figure.lines) {
      const pa = this.starPos(a);
      const pz = this.starPos(z);
      const k = Math.min(lit.get(a)!, lit.get(z)!);
      ctx.setLineDash(k >= 1 ? [] : [3, 6]);
      ctx.strokeStyle = k >= 1 ? `rgba(255, 230, 168, ${0.55 + 0.3 * this.won})` : 'rgba(234, 230, 255, 0.14)';
      ctx.lineWidth = k >= 1 ? 1.6 + this.won : 1;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pz.x, pz.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Звёзды: тусклые точки → яркие с лучами
    ctx.globalCompositeOperation = 'lighter';
    this.figure.stars.forEach(([, , mag], i) => {
      const p = this.starPos(i);
      const k = lit.get(i)!;
      const base = (starRadius(mag) / 100) * f.w * 0.55 + 1.5;
      if (k <= 0) {
        ctx.fillStyle = 'rgba(234, 230, 255, 0.32)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, base * 0.55, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      const tw = 0.85 + 0.15 * Math.sin(time * 2.2 + i * 1.7);
      const r = base * (1 + k * 1.4) * tw;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4);
      g.addColorStop(0, `rgba(255, 250, 235, ${k})`);
      g.addColorStop(0.25, `rgba(255, 220, 150, ${0.5 * k})`);
      g.addColorStop(1, 'rgba(255, 220, 150, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(p.x - r * 4, p.y - r * 4, r * 8, r * 8);
      ctx.fillStyle = `rgba(255, 246, 224, ${0.35 * k})`;
      ctx.fillRect(p.x - r * 3.2, p.y - 0.5, r * 6.4, 1);
      ctx.fillRect(p.x - 0.5, p.y - r * 3.2, 1, r * 6.4);
    });
    ctx.globalCompositeOperation = 'source-over';
    // Победа: имя созвездия под ним, как подпись на карте неба
    if (this.won > 0) {
      ctx.globalAlpha = this.won;
      ctx.fillStyle = '#ffe6a8';
      ctx.font = `400 ${Math.round(Math.max(18, f.w * 0.06))}px Forum, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const name = t(`constellation.${this.figure.id}`).toUpperCase().split('').join(' ');
      ctx.shadowColor = 'rgba(246, 194, 91, 0.6)';
      ctx.shadowBlur = 14;
      ctx.fillText(name, f.x + f.w / 2, Math.min(this.scene.svc.renderer.height - 12, f.y + f.h + 6));
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }

  // ── Огонь из клеток в цель ───────────────────────────────────────────────
  private drawBeams(ctx: CanvasRenderingContext2D): void {
    if (!this.beams.length) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const beam of this.beams) {
      const k = beam.age / beam.life;
      const head = Math.min(1, k * 1.8);
      const tail = Math.max(0, k * 1.8 - 0.8);
      const at = (u: number) => ({ x: beam.from.x + (beam.to.x - beam.from.x) * u, y: beam.from.y + (beam.to.y - beam.from.y) * u });
      const a = at(tail);
      const z = at(head);
      const g = ctx.createLinearGradient(a.x, a.y, z.x, z.y);
      g.addColorStop(0, 'rgba(255, 230, 168, 0)');
      g.addColorStop(1, `rgba(255, 246, 224, ${0.9 * (1 - k * 0.5)})`);
      ctx.strokeStyle = g;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(z.x, z.y);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** Обход звёзд по линиям: созвездие загорается цепочкой, а не вразнобой. */
function walk(f: SkyFigure): number[] {
  const seen = new Set<number>([0]);
  const out = [0];
  for (let i = 0; i < out.length; i++) {
    for (const [a, b] of f.lines) {
      const next = a === out[i] ? b : b === out[i] ? a : -1;
      if (next >= 0 && !seen.has(next)) {
        seen.add(next);
        out.push(next);
      }
    }
  }
  f.stars.forEach((_, i) => seen.has(i) || out.push(i));
  return out;
}

function centroid(pts: Pt[]): Pt | null {
  if (!pts.length) return null;
  return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
}

function uniq(pts: Pt[]): Pt[] {
  const seen = new Set<string>();
  return pts.filter((p) => {
    const key = `${Math.round(p.x)}:${Math.round(p.y)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
