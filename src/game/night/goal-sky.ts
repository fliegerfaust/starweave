import { starRadius, type SkyFigure } from '@/art/constellations';
import { bossSigil } from '@/art/sigil';
import type { Entity } from '@/engine/ecs';
import { named, t } from '@/i18n';
import { Drawable, Layer, Transform, transform } from '../components';
import { burst } from '../fx';
import { figureFor, goalVariantFor, lightOrder, type GoalVariant } from './goal-plan';
import type { NightScene } from './scene';

type Pt = { x: number; y: number };
type Beam = { from: Pt; to: Pt; age: number; life: number };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));


/** Вариант ночи; в разработке `?goal=figure|eclipse|now` подменяет его (`now` — без сцены цели). */
export function goalVariant(scene: NightScene): GoalVariant | null {
  const forced = import.meta.env.DEV ? document.documentElement.dataset.goal : undefined;
  if (forced === 'now') return null;
  if (forced === 'figure' || forced === 'eclipse') return forced;
  return goalVariantFor(scene.night.kind);
}

/**
 * Цель на сцене (GO.3): небо отвечает на каждое созвездие, число цели остаётся в табло.
 * Обычная ночь — «Созвездие ночи»: во всё небо пунктир настоящего созвездия, его звёзды
 * загораются по мере счёта, на цели оно сплетено и подписано. Ночь Затмения — «Затмение»:
 * за небом диск с кольцом тени (запас врага), огонь созвездий бьёт в диск, кольцо тает,
 * луна сходит с солнца. Рисуется над туманностью и под клетками; «Меньше движения» убирает
 * лучи и искры, остаётся смена неба.
 */
export class GoalSky {
  /** Показанный прогресс 0…1 (плавно догоняет счёт). */
  shown = 0;
  /** Удар: 1 сразу после попадания, гаснет к 0. */
  hitK = 0;
  /** Финал: 0…1, Затмение отбито / созвездие сплетено. */
  won = 0;
  private beams: Beam[] = [];
  private readonly entity: Entity;
  private readonly figure: SkyFigure;
  private readonly order: number[];
  private readonly calm: boolean;
  /**
   * Затмение — живой противник (GO.4, выбор Дениса 03.11.2026): в начале ночи луна наползает на
   * солнце, на диске проступает знак Затмения, под ним имя, правило и цель; от диска тянутся тени к
   * клеткам, которые оно задело (запечатанные, карты затмённой масти), удар созвездия их отдёргивает;
   * на победе кольцо тени разбивается на жемчужные осколки. Приход 0…1.
   */
  private readonly foe: boolean;
  arrive = 1;
  private shattered = false;
  private readonly bornAt: number;
  private readonly sigil: HTMLCanvasElement | null = null;

  constructor(
    private readonly scene: NightScene,
    readonly variant: GoalVariant,
  ) {
    const world = scene.world;
    const run = scene.run;
    this.calm = !!world.res.reduceMotion;
    this.figure = figureFor(run.seed, run.ante, scene.night.kind);
    this.order = lightOrder(this.figure);
    this.shown = clamp01(scene.night.score / scene.night.target);
    this.won = this.shown >= 1 ? 1 : 0;
    this.bornAt = world.res.time;
    this.foe = variant === 'eclipse';
    const bossId = scene.night.bossId;
    if (this.foe && bossId) {
      this.sigil = bossSigil(bossId, 96, 2);
      // Затмение приходит: луна наползает на солнце, знак проступает, кольцо тени набирается
      if (this.shown === 0) {
        this.arrive = 0;
        const me: GoalSky = this;
        void scene.svc.tweens.to(me, { arrive: 1 }, { duration: this.calm ? 0.3 : 2.4, ease: 'inOutCubic', delay: 0.4 });
      }
    }
    this.entity = world.create();
    world.add(this.entity, Transform, transform(0, 0));
    world.add(this.entity, Drawable, { layer: Layer.Background, z: 1, visible: true, draw: (ctx) => this.draw(ctx, world.res.time) });
  }

  destroy(): void {
    this.scene.world.destroy(this.entity);
  }

  /** Созвездия попали: огонь из клеток в цель, прогресс догоняет счёт; на цели — финал. */
  async hit(progress: number, cells: Pt[]): Promise<void> {
    const tw = this.scene.svc.tweens;
    const me: GoalSky = this;
    const p = clamp01(progress);
    if (!this.calm) for (const from of uniq(cells)) this.beams.push({ from, to: this.aim(p), age: 0, life: 0.55 });
    this.hitK = 1;
    void tw.to(me, { hitK: 0 }, { duration: 0.9, ease: 'outCubic', delay: 0.25 });
    await tw.to(me, { shown: p }, { duration: this.calm ? 0.3 : 0.9, ease: 'outCubic', delay: 0.2 });
    if (!this.calm) {
      const spark = this.aim(p);
      burst(this.scene.world, spark.x, spark.y, '#ffe6a8', { count: 14, speed: 220, colors: ['#ffe6a8', '#fff', this.variant === 'eclipse' ? '#e8e4f4' : '#f6c25b'] });
    }
    if (p >= 1 && this.won < 1) {
      if (this.foe) this.shatter();
      await tw.to(me, { won: 1 }, { duration: this.calm ? 0.3 : 1.2, ease: 'outCubic' });
    }
  }

  /** Куда летит огонь: в диск Затмения или в звезду, которая сейчас загорится. */
  private aim(p: number): Pt {
    const b = this.scene.layout.board;
    if (this.variant === 'eclipse') return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const k = Math.max(0, Math.min(this.order.length - 1, Math.ceil(p * this.order.length) - 1));
    return this.starPos(this.order[k]!);
  }

  private draw(ctx: CanvasRenderingContext2D, time: number): void {
    const dt = 1 / 60;
    for (const beam of this.beams) beam.age += dt;
    this.beams = this.beams.filter((beam) => beam.age < beam.life);
    if (this.variant === 'eclipse') this.drawEclipse(ctx, time);
    else this.drawFigure(ctx, time);
    this.drawBeams(ctx);
  }

  // ── Затмение ─────────────────────────────────────────────────────────────
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
    // Тени к задетым клеткам (вариант b) — под луной, от края диска
    if (this.foe) this.drawTendrils(ctx, cx, cy, r, time);
    // Луна сходит с солнца по мере счёта: растёт серп; на цели тает. При приходе — наползает
    const off = r * 1.15 * p ** 1.1 + r * 2.4 * (1 - this.arrive) ** 2;
    ctx.globalAlpha = 1 - this.won;
    ctx.fillStyle = '#04030d';
    ctx.beginPath();
    ctx.arc(cx + off * 0.82 + shake, cy - off * 0.57, r * 1.02, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(232, 228, 244, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Знак Затмения на луне — жемчугом: это он, противник
    if (this.sigil) {
      const size = r * 1.05;
      ctx.globalAlpha = (1 - this.won) * this.arrive * (0.55 + 0.25 * this.hitK);
      ctx.globalCompositeOperation = 'luminosity';
      ctx.drawImage(this.sigil, cx + off * 0.82 + shake - size / 2, cy - off * 0.57 - size / 2, size, size);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
    if (this.foe) this.drawThreat(ctx, cx, cy, r);
    // Кольцо тени: запас Затмения, тает с каждым созвездием (при приходе — набирается)
    const ring = r * 1.42;
    const left = (1 - p) * this.arrive;
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

  /** Имя, правило и цель под диском, пока Затмение приходит, и ещё несколько секунд (вместо тоста). */
  private drawThreat(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    const id = this.scene.night.bossId;
    if (!id) return;
    const since = this.scene.world.res.time - this.bornAt;
    const k = Math.min(this.arrive, Math.max(0, 1 - (since - 5) / 1.2)) * (1 - this.won);
    if (k <= 0.01) return;
    const [name, rule] = [named('boss', id).name, named('boss', id).desc];
    const y = cy + r * 1.42 + 34;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(5, 6, 26, 0.95)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#e8e4f4';
    ctx.font = `400 ${Math.round(Math.max(18, r * 0.22))}px Forum, serif`;
    ctx.fillText(name.toUpperCase().split('').join('\u200a'), cx, y);
    ctx.fillStyle = '#c9c3e6';
    ctx.font = `600 ${Math.round(Math.max(12, r * 0.12))}px 'Manrope Variable', Manrope, sans-serif`;
    const maxW = Math.min(this.scene.svc.renderer.width - 32, r * 4);
    wrap(ctx, rule, maxW).forEach((line, i) => ctx.fillText(line, cx, y + 22 + i * 18));
    ctx.fillStyle = '#ffe6a8';
    ctx.fillText(t('foe.beat', { n: this.scene.night.target }), cx, y + 22 + wrap(ctx, rule, maxW).length * 18 + 4);
    ctx.restore();
  }

  /** Клетки, которые Затмение задело: запечатанные и карты затмённой масти на небе. */
  private touched(): number[] {
    const n = this.scene.night;
    const out: number[] = [];
    n.grid.forEach((card, i) => {
      if (n.sealed[i] || (card && n.rules.debuffSuit && card.suit === n.rules.debuffSuit)) out.push(i);
    });
    return out;
  }

  /** Тени от диска к задетым клеткам; удар созвездия их отдёргивает, на победе они тают. */
  private drawTendrils(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, time: number): void {
    const cells = this.touched();
    if (!cells.length) return;
    const k = this.arrive * (1 - this.won) * (1 - 0.7 * this.hitK);
    if (k <= 0.01) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (const i of cells) {
      const c = this.scene.layout.cells[i];
      if (!c) continue;
      const dx = c.x - cx;
      const dy = c.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      const sx = cx + (dx / d) * r;
      const sy = cy + (dy / d) * r;
      const wob = this.calm ? 0 : Math.sin(time * 1.3 + i) * 10;
      const mx = (sx + c.x) / 2 - (dy / d) * wob;
      const my = (sy + c.y) / 2 + (dx / d) * wob;
      const reach = 0.35 + 0.65 * k;
      const ex = sx + (c.x - sx) * reach;
      const ey = sy + (c.y - sy) * reach;
      // Тень сужается к цели: толстая у диска, тонкая у карты; жемчужная кромка — видно на тёмном небе
      ctx.shadowColor = `rgba(200, 190, 255, ${0.5 * k})`;
      ctx.shadowBlur = 10;
      for (const [w, a] of [[11, 0.85], [6, 0.9]] as const) {
        ctx.strokeStyle = `rgba(10, 6, 28, ${a * k})`;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(mx, my, ex, ey);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(232, 228, 244, ${0.55 * k})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Победа: кольцо тени разбивается на жемчужные осколки. */
  private shatter(): void {
    if (this.shattered || this.calm) return;
    this.shattered = true;
    const b = this.scene.layout.board;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const ring = Math.min(b.w, b.h) * 0.27 * 1.42;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      burst(this.scene.world, cx + Math.cos(a) * ring, cy + Math.sin(a) * ring, '#e8e4f4', { count: 4, speed: 260, colors: ['#e8e4f4', '#fff', '#b9b0e6'] });
    }
  }

  // ── Созвездие ночи ───────────────────────────────────────────────────────
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
    const litCount = this.shown * this.order.length;
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
      const tw = this.calm ? 1 : 0.85 + 0.15 * Math.sin(time * 2.2 + i * 1.7);
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

function uniq(pts: Pt[]): Pt[] {
  const seen = new Set<string>();
  return pts.filter((p) => {
    const key = `${Math.round(p.x)}:${Math.round(p.y)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Перенос строки по ширине для подписи на холсте. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}
