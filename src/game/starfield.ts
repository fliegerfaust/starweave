import { ANTE_NEBULAE, renderNebula } from '@/art/nebula';

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;
  depth: number;
  hue: number;
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

/**
 * Живое небо за игрой: туманность (смена по созвездиям с плавным переходом),
 * мерцающие звёзды трёх глубин с параллаксом и редкие метеоры.
 */
export class Starfield {
  private stars: Star[] = [];
  private meteors: Meteor[] = [];
  private nebula: HTMLCanvasElement | null = null;
  private prevNebula: HTMLCanvasElement | null = null;
  private fade = 1;
  private paletteIndex = 0;
  /** Купленное небо: одна палитра на весь забег вместо смены по созвездиям. */
  private theme: [number, number, number][] | null = null;
  private themeSeed = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private meteorTimer = 4;
  parallaxX = 0;
  parallaxY = 0;

  resize(w: number, h: number, dpr = 1): void {
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    const sameSize = w === this.w && h === this.h;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.nebula = this.renderCurrent();
    this.prevNebula = null;
    if (sameSize) return;
    const count = Math.round((w * h) / 2600);
    this.stars = Array.from({ length: count }, () => ({
      x: Math.random(),
      y: Math.random(),
      size: Math.random() ** 3 * 1.6 + 0.35,
      phase: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 2.2,
      depth: [0.2, 0.5, 1][Math.floor(Math.random() * 3)]!,
      hue: Math.random(),
    }));
  }

  /** Плавно сменить туманность на палитру созвездия. */
  setPalette(index: number): void {
    const i = ((index % ANTE_NEBULAE.length) + ANTE_NEBULAE.length) % ANTE_NEBULAE.length;
    if (i === this.paletteIndex || !this.w) return;
    this.paletteIndex = i;
    if (!this.theme) this.crossfade();
  }

  /** Тема неба из атласа; null — обычное небо по созвездиям. */
  setTheme(palette: [number, number, number][] | null, seed = 0): void {
    if (palette === this.theme) return;
    this.theme = palette;
    this.themeSeed = seed;
    if (this.w) this.crossfade();
  }

  private crossfade(): void {
    this.prevNebula = this.nebula;
    this.nebula = this.renderCurrent();
    this.fade = 0;
  }

  private renderCurrent(): HTMLCanvasElement {
    if (this.theme) return renderNebula(this.w, this.h, 101 + this.themeSeed, this.theme, this.dpr);
    return renderNebula(this.w, this.h, 17 + this.paletteIndex, ANTE_NEBULAE[this.paletteIndex], this.dpr);
  }

  update(dt: number): void {
    this.fade = Math.min(1, this.fade + dt * 0.5);
    this.meteorTimer -= dt;
    if (this.meteorTimer <= 0) {
      this.meteorTimer = 5 + Math.random() * 9;
      const fromLeft = Math.random() < 0.5;
      this.meteors.push({
        x: fromLeft ? Math.random() * this.w * 0.5 : this.w * (0.5 + Math.random() * 0.5),
        y: Math.random() * this.h * 0.4,
        vx: (fromLeft ? 1 : -1) * (500 + Math.random() * 300),
        vy: 220 + Math.random() * 160,
        life: 0.9,
      });
    }
    for (const m of this.meteors) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.life -= dt;
    }
    this.meteors = this.meteors.filter((m) => m.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    const { w, h } = this;
    if (this.prevNebula && this.fade < 1) ctx.drawImage(this.prevNebula, 0, 0, w, h);
    if (this.nebula) {
      ctx.globalAlpha = this.fade;
      ctx.drawImage(this.nebula, 0, 0, w, h);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = '#05061a';
      ctx.fillRect(0, 0, w, h);
    }
    for (const s of this.stars) {
      const tw = 0.55 + 0.45 * Math.sin(time * s.speed + s.phase);
      const x = (s.x * w + this.parallaxX * s.depth * 14 + w) % w;
      const y = (s.y * h + this.parallaxY * s.depth * 14 + h) % h;
      ctx.globalAlpha = tw * (0.35 + s.depth * 0.65);
      ctx.fillStyle = s.hue < 0.15 ? '#ffd9a0' : s.hue < 0.3 ? '#a8d8ff' : '#ffffff';
      const size = s.size * (0.6 + s.depth * 0.5);
      if (size > 1.2) {
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha *= 0.25;
        ctx.fillRect(x - size * 3, y - 0.3, size * 6, 0.6);
        ctx.fillRect(x - 0.3, y - size * 3, 0.6, size * 6);
      } else {
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
      }
    }
    ctx.globalAlpha = 1;
    for (const m of this.meteors) {
      const k = Math.max(0, m.life / 0.9);
      const tail = 0.12;
      const g = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * tail, m.y - m.vy * tail);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * k})`);
      g.addColorStop(1, 'rgba(160,180,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x - m.vx * tail, m.y - m.vy * tail);
      ctx.stroke();
    }
  }
}
