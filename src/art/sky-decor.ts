/**
 * Подпись темы неба: свои созвездия и живой эффект поверх туманности. Только вид —
 * рисуется за полем и не мешает игре (низкая яркость, никаких вспышек).
 */

type Pt = [number, number];

/** Созвездия в нормированных координатах [-1, 1]; рёбра — пары индексов звёзд. */
const FIGURES: Record<string, { stars: Pt[]; edges: [number, number][] }> = {
  dipper: {
    stars: [[-1, -0.35], [-0.62, -0.42], [-0.28, -0.3], [0.05, -0.12], [0.18, 0.4], [0.82, 0.48], [0.72, -0.02]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]],
  },
  cassiopeia: {
    stars: [[-1, -0.2], [-0.5, 0.35], [0, -0.05], [0.45, 0.4], [1, -0.3]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
  orion: {
    stars: [[-0.5, -0.9], [0.55, -0.8], [-0.15, -0.05], [0, 0], [0.15, 0.05], [-0.6, 0.9], [0.6, 0.85], [0, -0.55]],
    edges: [[0, 7], [1, 7], [0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6]],
  },
  cygnus: {
    stars: [[0, -1], [0, -0.35], [0, 0.2], [0, 0.9], [-0.85, -0.15], [0.85, -0.25]],
    edges: [[0, 1], [1, 2], [2, 3], [4, 1], [1, 5]],
  },
  lyra: {
    stars: [[0, -1], [-0.3, -0.35], [0.3, -0.3], [-0.4, 0.6], [0.35, 0.65]],
    edges: [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [3, 4]],
  },
  crux: {
    stars: [[0, -1], [0, 1], [-0.7, 0.05], [0.65, -0.12], [0.3, 0.4]],
    edges: [[0, 1], [2, 3]],
  },
};

/** Где стоят фигуры: центр (доля экрана), размер (доля короткой стороны), поворот. */
type Placement = { fig: string; x: number; y: number; s: number; rot: number };

interface DecorStyle {
  /** Цвет линий и звёзд созвездий. */
  ink: string;
  figures: Placement[];
  effect: 'grid' | 'dust' | 'aurora' | 'embers' | null;
  /** Цвет частиц / занавесей эффекта. */
  fx: string[];
}

const STYLES: Record<string, DecorStyle> = {
  astrolabe: {
    ink: '226,184,104',
    figures: [
      { fig: 'dipper', x: 0.32, y: 0.15, s: 0.2, rot: -0.2 },
      { fig: 'lyra', x: 0.84, y: 0.3, s: 0.12, rot: 0.1 },
      { fig: 'cygnus', x: 0.16, y: 0.82, s: 0.18, rot: 0.3 },
    ],
    effect: 'grid',
    fx: ['226,184,104'],
  },
  patron: {
    ink: '255,214,120',
    figures: [
      { fig: 'orion', x: 0.8, y: 0.18, s: 0.2, rot: 0.15 },
      { fig: 'cassiopeia', x: 0.26, y: 0.12, s: 0.15, rot: -0.1 },
      { fig: 'crux', x: 0.86, y: 0.84, s: 0.12, rot: -0.2 },
    ],
    effect: 'dust',
    fx: ['255,214,120', '255,240,200'],
  },
  aurora: {
    ink: '150,255,210',
    figures: [
      { fig: 'cassiopeia', x: 0.76, y: 0.62, s: 0.2, rot: 0.2 },
      { fig: 'dipper', x: 0.22, y: 0.86, s: 0.2, rot: 0.1 },
    ],
    effect: 'aurora',
    fx: ['60,240,170', '70,180,255', '170,110,255'],
  },
  ember: {
    ink: '255,170,110',
    figures: [
      { fig: 'orion', x: 0.2, y: 0.2, s: 0.2, rot: -0.15 },
      { fig: 'lyra', x: 0.82, y: 0.14, s: 0.12, rot: 0.2 },
    ],
    effect: 'embers',
    fx: ['255,140,60', '255,90,80', '255,200,110'],
  },
};

interface Mote {
  x: number;
  y: number;
  vy: number;
  vx: number;
  r: number;
  phase: number;
  c: number;
}

export class SkyDecor {
  private motes: Mote[] = [];
  private readonly style: DecorStyle | null;

  constructor(themeId: string) {
    this.style = STYLES[themeId] ?? null;
    const n = this.style?.effect === 'dust' ? 70 : this.style?.effect === 'embers' ? 38 : 0;
    // Фиксированный узор: одно и то же небо при каждом входе
    for (let i = 0; i < n; i++) {
      // Псевдослучайный, но постоянный разброс (без регулярных рядов)
      const hash = (n: number) => {
        const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
        return v - Math.floor(v);
      };
      this.motes.push({
        x: hash(i + 1),
        y: hash(i * 3.7 + 11),
        vy: this.style?.effect === 'embers' ? -(0.018 + (i % 5) * 0.006) : -(0.004 + (i % 4) * 0.003),
        vx: ((i % 7) - 3) * 0.0015,
        r: 0.6 + (i % 4) * 0.45,
        phase: i * 1.7,
        c: i % 3,
      });
    }
  }

  get active(): boolean {
    return !!this.style;
  }

  update(dt: number): void {
    for (const m of this.motes) {
      m.y += m.vy * dt;
      m.x += m.vx * dt;
      if (m.y < -0.05) m.y += 1.1;
      if (m.x < -0.05) m.x += 1.1;
      if (m.x > 1.05) m.x -= 1.1;
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
    const st = this.style;
    if (!st) return;
    ctx.save();
    if (st.effect === 'grid') this.drawGrid(ctx, w, h, time, st.fx[0]!);
    if (st.effect === 'aurora') this.drawAurora(ctx, w, h, time, st.fx);
    const unit = Math.min(w, h);
    for (const p of st.figures) this.drawFigure(ctx, p, w, h, unit, time, st.ink);
    if (st.effect === 'dust' || st.effect === 'embers') this.drawMotes(ctx, w, h, time, st);
    ctx.restore();
  }

  private drawFigure(ctx: CanvasRenderingContext2D, p: Placement, w: number, h: number, unit: number, time: number, ink: string): void {
    const fig = FIGURES[p.fig]!;
    const cos = Math.cos(p.rot);
    const sin = Math.sin(p.rot);
    const pts = fig.stars.map(([x, y]) => [p.x * w + (x * cos - y * sin) * p.s * unit, p.y * h + (x * sin + y * cos) * p.s * unit] as Pt);
    ctx.strokeStyle = `rgba(${ink},0.22)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const [a, b] of fig.edges) {
      ctx.moveTo(pts[a]![0], pts[a]![1]);
      ctx.lineTo(pts[b]![0], pts[b]![1]);
    }
    ctx.stroke();
    pts.forEach(([x, y], i) => {
      const tw = 0.6 + 0.4 * Math.sin(time * (1.3 + (i % 3) * 0.4) + i);
      const r = 1.4 + (i % 3) * 0.5;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
      g.addColorStop(0, `rgba(255,255,255,${0.85 * tw})`);
      g.addColorStop(0.3, `rgba(${ink},${0.5 * tw})`);
      g.addColorStop(1, `rgba(${ink},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
    });
  }

  /** Латунная небесная сетка: меридианы и параллели, медленно поворачивается. */
  private drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, c: string): void {
    const cx = w * 0.5;
    const cy = h * 1.15;
    const R = Math.hypot(w, h) * 0.95;
    ctx.strokeStyle = `rgba(${c},0.08)`;
    ctx.lineWidth = 1;
    for (let k = 1; k <= 6; k++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (R * k) / 6, Math.PI, Math.PI * 2);
      ctx.stroke();
    }
    const turn = time * 0.006;
    for (let i = 0; i < 18; i++) {
      const a = Math.PI + (i / 18) * Math.PI + turn;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.stroke();
    }
  }

  /** Северное сияние: волнистые ленты, яркие снизу и тающие кверху, с редкими лучами. */
  private drawAurora(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, colors: string[]): void {
    ctx.globalCompositeOperation = 'lighter';
    const steps = 48;
    colors.forEach((c, k) => {
      const base = h * (0.26 + k * 0.07);
      const height = h * (0.16 - k * 0.025);
      const edge = (x: number) => base + Math.sin((x / w) * Math.PI * 2.2 + time * 0.3 + k * 1.9) * h * 0.045 + Math.sin((x / w) * Math.PI * 5.3 - time * 0.5 + k) * h * 0.012;
      const g = ctx.createLinearGradient(0, base - height - h * 0.05, 0, base + h * 0.05);
      g.addColorStop(0, `rgba(${c},0)`);
      g.addColorStop(0.75, `rgba(${c},${0.16 - k * 0.03})`);
      g.addColorStop(0.9, `rgba(${c},${0.26 - k * 0.04})`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const x = (i / steps) * w;
        const y = edge(x) - height * (0.8 + 0.2 * Math.sin((x / w) * Math.PI * 3 + time * 0.4 + k * 2));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let i = steps; i >= 0; i--) {
        const x = (i / steps) * w;
        ctx.lineTo(x, edge(x) + h * 0.012);
      }
      ctx.closePath();
      ctx.fill();
      // Редкие лучи вдоль ленты — фактура занавеси
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 26; i++) {
        const x = ((i * 0.618 + k * 0.21) % 1) * w;
        const y = edge(x);
        const len = height * (0.5 + 0.5 * Math.sin(i + time * 0.7));
        const lg = ctx.createLinearGradient(x, y, x, y - len);
        lg.addColorStop(0, `rgba(${c},0.12)`);
        lg.addColorStop(1, `rgba(${c},0)`);
        ctx.strokeStyle = lg;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - len);
        ctx.stroke();
      }
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Золотая пыль или тлеющие искры: медленно поднимаются и мерцают. */
  private drawMotes(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, st: DecorStyle): void {
    ctx.globalCompositeOperation = 'lighter';
    if (st.effect === 'dust') {
      // Золотой «Млечный путь»: тёплая полоса по диагонали, слегка дышит
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(-0.55);
      const len = Math.hypot(w, h);
      const band = ctx.createLinearGradient(0, -h * 0.22, 0, h * 0.22);
      const a = 0.17 + 0.04 * Math.sin(time * 0.5);
      band.addColorStop(0, 'rgba(255,190,90,0)');
      band.addColorStop(0.5, `rgba(255,200,110,${a})`);
      band.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = band;
      ctx.fillRect(-len / 2, -h * 0.22, len, h * 0.44);
      ctx.restore();
    }
    if (st.effect === 'embers') {
      // Тлеющий закат: тёплое зарево у нижнего края неба
      const glow = ctx.createLinearGradient(0, h, 0, h * 0.55);
      glow.addColorStop(0, `rgba(255,110,50,${0.2 + 0.04 * Math.sin(time * 0.6)})`);
      glow.addColorStop(0.5, 'rgba(200,50,90,0.07)');
      glow.addColorStop(1, 'rgba(200,50,90,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, h * 0.55, w, h * 0.45);
    }
    for (const m of this.motes) {
      const tw = 0.45 + 0.55 * Math.sin(time * 2 + m.phase);
      const c = st.fx[m.c % st.fx.length]!;
      const x = m.x * w + Math.sin(time * 0.7 + m.phase) * 6;
      const y = m.y * h;
      const r = m.r * 0.8;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
      g.addColorStop(0, `rgba(255,250,235,${0.9 * tw})`);
      g.addColorStop(0.25, `rgba(${c},${0.7 * tw})`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}
