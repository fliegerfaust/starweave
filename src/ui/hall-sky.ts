/*
 * «Небо игроков» на доске «Зала славы» (HF.0, вариант «Горизонт»): сто звёзд — сто долей
 * игроков, одна звезда — один процент. Рекорд: звёзды слева направо от слабых к сильным,
 * загораются те, кого ты обошёл, созвездие тянется к твоей звезде, она вспыхивает с кольцом.
 * Достижение: горят те, у кого оно есть, — россыпью, связанные одной линией; если оно есть
 * у тебя, твоя звезда среди них. Небо дышит: тусклые мерцают, твоя звезда пульсирует.
 */

const N = 100;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('calm');

/** Детерминированный шум 0…1 по номеру — небо одно и то же при каждом открытии. */
function noise(i: number, salt = 0): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

interface Star {
  x: number;
  y: number;
  r: number;
  /** Опорная звезда: через такие идёт линия созвездия. */
  anchor: boolean;
  phase: number;
  /** Текущая яркость 0…1 и куда идёт. */
  lit: number;
  to: number;
  /** Когда начать зажигаться (мс от начала перехода). */
  delay: number;
}

export type SkyMode =
  | { kind: 'record'; percent: number | null }
  | { kind: 'feat'; percent: number | null; mine: boolean; seed: number };

export class PlayerSky {
  readonly el: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private stars: Star[] = [];
  private w = 0;
  private h = 0;
  private you = -1;
  /** Порядок линии созвездия: номера звёзд слева направо. */
  private path: number[] = [];
  private t0 = 0;
  private sweep = 900;
  private flareAt = -1;
  private raf = 0;
  private counter: ((v: number) => void) | null = null;
  private target: number | null = null;
  private mode: SkyMode | null = null;
  private last = 0;

  constructor() {
    this.el = document.createElement('canvas');
    this.el.className = 'hall-skycanvas';
    this.el.setAttribute('aria-hidden', 'true');
    this.ctx = this.el.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(this.el);
  }

  /** Подписка на счётчик процента: число набегает вместе с зажиганием звёзд. */
  onCount(fn: (v: number) => void): void {
    this.counter = fn;
  }

  private layout(): void {
    const { w, h } = this;
    // Холст уходит под края доски и растворяется маской (CSS): звёзды держим в ясной середине,
    // чтобы свечение и кольцо своей звезды гасли мягко, а не упирались в край
    const padX = Math.max(34, w * 0.11);
    const base = h * 0.8;
    const amp = h * 0.44;
    this.stars = Array.from({ length: N }, (_, i) => {
      const old = this.stars[i];
      const t = (i + 0.5) / N;
      // Дуга горизонта и полоса неба над ней: ближе к краям звёзды ниже, в середине выше
      const arc = Math.sin(t * Math.PI) ** 0.8;
      const band = (noise(i, 1) - 0.5) * h * 0.34;
      const big = noise(i, 2);
      return {
        x: padX + t * (w - padX * 2) + (noise(i, 3) - 0.5) * ((w - padX * 2) / N) * 1.6,
        y: base - arc * amp + band,
        r: (big > 0.93 ? 2.6 : big > 0.75 ? 1.9 : 1.3) * (w > 360 ? 1.3 : 1),
        // Опорные — крупные и близкие к дуге: линия идёт по горизонту, без острых шипов
        anchor: big > 0.55 && Math.abs(noise(i, 1) - 0.5) < 0.14,
        phase: noise(i, 4) * Math.PI * 2,
        lit: old?.lit ?? 0,
        to: old?.to ?? 0,
        delay: old?.delay ?? 0,
      };
    });
  }

  private resize(): void {
    const r = this.el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const s = Math.min(3, window.devicePixelRatio || 1);
    this.w = r.width;
    this.h = r.height;
    this.el.width = Math.round(r.width * s);
    this.el.height = Math.round(r.height * s);
    this.ctx.setTransform(s, 0, 0, s, 0, 0);
    const first = !this.stars.length;
    this.layout();
    // Режим мог прийти раньше размера: тогда волна стартует сейчас
    if (first && this.mode) this.set(this.mode);
    else this.loop();
  }

  set(mode: SkyMode): void {
    this.mode = mode;
    if (!this.stars.length) return;
    const p = mode.percent;
    const still = reduced();
    this.target = p;
    if (mode.kind === 'record') {
      const k = p == null ? -1 : Math.min(N - 1, Math.max(0, Math.round(p)));
      this.you = k;
      this.stars.forEach((s, i) => {
        s.to = i < k ? 1 : 0;
        // Слева направо: волна идёт к тебе
        s.delay = (i / Math.max(1, k)) * this.sweep * 0.9;
      });
      this.path = this.stars.map((s, i) => (i < k && (s.anchor || i === k - 1) ? i : -1)).filter((i) => i >= 0);
      if (k >= 0) this.path.push(k);
    } else {
      // Обладатели — россыпь: ровно столько звёзд, сколько процентов (меньше 1% — одна)
      const n = p == null ? 0 : Math.max(1, Math.round(p));
      const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => noise(a, mode.seed) - noise(b, mode.seed));
      const holders = new Set(order.slice(0, n));
      this.you = mode.mine ? order[0]! : -1;
      this.stars.forEach((s, i) => {
        s.to = holders.has(i) ? 1 : 0;
        s.delay = holders.has(i) ? order.indexOf(i) * (this.sweep / Math.max(4, n)) * 0.8 : 0;
      });
      this.path = [...holders].sort((a, b) => a - b).filter((i, j, arr) => arr.length <= 24 || this.stars[i]!.anchor || j === 0 || j === arr.length - 1);
    }
    // Волна стартует с первого настоящего кадра: скрытая вкладка или рамка не съедает её
    this.t0 = -1;
    this.flareAt = -1;
    if (still) {
      this.stars.forEach((s) => (s.lit = s.to));
      this.counter?.(p ?? 0);
    }
    this.loop();
  }

  private loop(): void {
    if (this.raf) return;
    const tick = (now: number) => {
      this.raf = 0;
      if (!this.el.isConnected) return;
      this.draw(now);
      if (!reduced()) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private draw(now: number): void {
    const { ctx, w, h, stars } = this;
    if (!w) return;
    const still = reduced();
    if (this.t0 < 0) {
      this.t0 = now;
      this.flareAt = this.you >= 0 ? now + (still ? 0 : this.sweep) : -1;
    }
    const el = now - this.t0;
    ctx.clearRect(0, 0, w, h);

    // Яркость к цели по времени кадра: на 60 и 120 Гц звёзды идут вровень со счётчиком
    const dt = Math.min(3, this.last ? (now - this.last) / 16.7 : 1);
    this.last = now;
    for (const s of stars) {
      if (s.to > s.lit) s.lit = el > s.delay ? Math.min(s.to, s.lit + 0.12 * dt) : s.lit;
      else if (s.to < s.lit) s.lit = Math.max(s.to, s.lit - 0.08 * dt);
    }
    // Счётчик процента набегает вместе с волной
    if (this.target != null && !still) {
      const k = Math.min(1, el / this.sweep);
      this.counter?.(this.target * (1 - (1 - k) ** 3));
    }

    // Горизонт: тонкая латунная дуга внизу и тёплое зарево под пройденной частью
    const base = h * 0.8;
    const glowTo = this.you >= 0 && this.path.length ? stars[this.you]!.x : 0;
    ctx.save();
    ctx.beginPath();
    for (let x = 0; x <= w; x += 6) {
      const t = x / w;
      const y = base + 10 - Math.sin(t * Math.PI) ** 0.8 * h * 0.08;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    const hz = ctx.createLinearGradient(0, 0, w, 0);
    hz.addColorStop(0, 'rgba(246,194,91,0)');
    hz.addColorStop(0.2, 'rgba(246,194,91,0.28)');
    hz.addColorStop(0.8, 'rgba(246,194,91,0.28)');
    hz.addColorStop(1, 'rgba(246,194,91,0)');
    ctx.strokeStyle = hz;
    ctx.lineWidth = 1;
    ctx.stroke();
    if (glowTo > 0) {
      const g = ctx.createRadialGradient(glowTo * 0.5, base + 6, 0, glowTo * 0.5, base + 6, Math.max(40, glowTo * 0.75));
      g.addColorStop(0, 'rgba(246,194,91,0.16)');
      g.addColorStop(1, 'rgba(246,194,91,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();

    // Линия созвездия: тянется вслед за волной
    const drawn = still ? 1 : Math.min(1, el / (this.sweep * 1.05));
    if (this.path.length > 1) {
      const pts = this.path.map((i) => stars[i]!);
      const segs = pts.length - 1;
      const upto = drawn * segs;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255,220,140,0.62)';
      ctx.shadowColor = 'rgba(246,194,91,0.9)';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(pts[0]!.x, pts[0]!.y);
      for (let j = 1; j <= Math.floor(upto); j++) ctx.lineTo(pts[j]!.x, pts[j]!.y);
      const f = upto - Math.floor(upto);
      if (f > 0 && Math.floor(upto) < segs) {
        const a = pts[Math.floor(upto)]!;
        const b = pts[Math.floor(upto) + 1]!;
        ctx.lineTo(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Звёзды
    const tw = now / 1000;
    stars.forEach((s, i) => {
      if (i === this.you) return;
      const flicker = still ? 1 : 0.7 + 0.3 * Math.sin(tw * 1.6 + s.phase);
      const dimA = 0.38 * flicker;
      if (s.lit > 0.01) {
        // Вспышка при зажигании: на миг ярче и крупнее
        const pop = s.lit < 1 ? 1 + (1 - s.lit) * 0.9 : 1;
        const r = s.r * (0.9 + s.lit * 0.25) * pop;
        ctx.globalAlpha = s.lit * (0.85 + 0.15 * flicker);
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 3.2);
        g.addColorStop(0, 'rgba(255,224,150,0.42)');
        g.addColorStop(1, 'rgba(255,224,150,0)');
        ctx.fillStyle = g;
        ctx.fillRect(s.x - r * 3.2, s.y - r * 3.2, r * 6.4, r * 6.4);
        ctx.fillStyle = '#fff3cf';
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (s.lit < 0.99) {
        ctx.globalAlpha = dimA * (1 - s.lit);
        ctx.fillStyle = '#bdb6ff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;

    // Твоя звезда: четыре луча, пульс; при появлении — вспышка и кольцо
    if (this.you >= 0) {
      const s = stars[this.you]!;
      const since = this.flareAt < 0 ? Infinity : now - this.flareAt;
      if (since >= 0 || still) {
        const appear = still ? 1 : Math.min(1, since / 260);
        const pulse = still ? 1 : 1 + 0.08 * Math.sin(tw * 2.2);
        const burst = still ? 0 : Math.max(0, 1 - since / 420);
        const R = (9 + burst * 7) * pulse * appear;
        ctx.save();
        ctx.translate(s.x, s.y);
        const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 3.2);
        halo.addColorStop(0, `rgba(255,230,168,${0.55 + burst * 0.4})`);
        halo.addColorStop(1, 'rgba(255,230,168,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(-R * 3.2, -R * 3.2, R * 6.4, R * 6.4);
        ctx.fillStyle = '#fffbea';
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
          const rr = k % 2 ? R * 0.26 : R;
          ctx[k ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        // Кольцо-удар: расходится и гаснет
        if (!still && since < 700) {
          const k = since / 700;
          ctx.strokeStyle = `rgba(255,230,168,${(1 - k) * 0.8})`;
          ctx.lineWidth = 1.5 * (1 - k) + 0.3;
          ctx.beginPath();
          ctx.arc(0, 0, 6 + k * 34, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }
}
