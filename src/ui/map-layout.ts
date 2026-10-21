/**
 * Расстановка ночей на карте главы («Восхождение», RD.2). У каждой главы своя: её задают
 * сид забега и номер главы, так что в одном забеге глава всегда выглядит одинаково.
 *
 * Каждый кандидат примеряется на настоящем экране: звёзды и подписи разных ночей не должны
 * пересекаться и выходить за край, линия не должна проходить по подписям и чужим звёздам.
 * Из подходящих берётся случайный просторный (зазор от 16 px). Не нашлось — то же со
 * ступенями сжатия (`SQUEEZE`), и только потом запасная расстановка по рядам.
 */

export type LayoutMode = 'tall' | 'land' | 'wide';
type Side = 'r' | 'l' | 'b' | 't';
type Pt = [number, number];
interface Box { l: number; r: number; t: number; b: number }
interface Candidate { p: Pt[]; s: Side[]; bend: number[]; lead: number }
export interface Placed { centers: Pt[]; curves: [Pt, Pt, Pt][]; gap: number; tight: boolean; ok: boolean }

const PAD = 6;
const GAP_X = 14;
const SQUEEZE: string[][] = [[], ['tight'], ['tight', 'squeeze'], ['tight', 'squeeze', 'bare']];
const SIDES: Record<LayoutMode, Side[]> = { tall: ['r', 'l'], land: ['r', 'l', 'b'], wide: ['r', 'l', 'b', 't'] };

export function layoutMode(w: number, h: number): LayoutMode {
  if (w > h && h < 520) return 'land';
  return w >= 900 ? 'wide' : 'tall';
}

/** Свой генератор: расстановка не трогает случайность забега. */
function mulberry(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const grow = (r: Box, p: number): Box => ({ l: r.l - p, r: r.r + p, t: r.t - p, b: r.b + p });
const overlap = (a: Box, b: Box) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
const quad = (a: Pt, b: Pt, bend: number): [Pt, Pt, Pt] => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  return [a, [(a[0] + b[0]) / 2 - dy * bend, (a[1] + b[1]) / 2 + dx * bend], b];
};
const onCurve = ([a, c, b]: [Pt, Pt, Pt], t: number): Pt => [
  (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0],
  (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1],
];
/** Раздать свободное место по промежуткам случайными долями. */
const share = (rnd: () => number, n: number, slack: number) => {
  const w = Array.from({ length: n }, () => 0.3 + rnd());
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => (slack * x) / sum);
};
const between = (rnd: () => number, a: number, b: number) => a + rnd() * Math.max(0, b - a);

export class ChartLayout {
  /** Зазор между рядами; на тесных ступенях меньше. */
  private rowGap = 16;

  constructor(
    private readonly area: HTMLElement,
    private readonly nodes: HTMLElement[],
    private readonly seed: number,
  ) {}

  private star(i: number) {
    return this.nodes[i]!.querySelector<HTMLElement>('.map-star')!;
  }
  private tag(i: number) {
    return this.nodes[i]!.querySelector<HTMLElement>('.map-tag')!;
  }

  /** Сторона подписи; `--sr` — радиус звезды, от него отступает подпись. */
  private setSide(i: number, side: Side): void {
    this.tag(i).dataset.side = side;
    this.nodes[i]!.style.setProperty('--sr', `${this.star(i).offsetWidth / 2}px`);
  }

  private apply(c: Candidate): void {
    c.p.forEach((pt, i) => {
      this.nodes[i]!.style.setProperty('--x', `${pt[0]}px`);
      this.nodes[i]!.style.setProperty('--y', `${pt[1]}px`);
      this.setSide(i, c.s[i]!);
    });
  }

  /** Размеры звёзд и подписей на текущей ступени: от позиции и стороны они не зависят. */
  private z: { s: number; w: number; h: number }[] = [];

  private measure(): void {
    this.nodes.forEach((_, i) => this.setSide(i, 'r'));
    this.z = this.nodes.map((_, i) => ({ s: this.star(i).offsetWidth, w: this.tag(i).offsetWidth, h: this.tag(i).offsetHeight }));
  }

  /** Рамки звезды и подписи по центру и стороне — без DOM, той же геометрией, что в CSS. */
  private boxes(i: number, [x, y]: Pt, side: Side): [Box, Box] {
    const { s, w, h } = this.z[i]!;
    const star = { l: x - s / 2, r: x + s / 2, t: y - s / 2, b: y + s / 2 };
    const tag =
      side === 'r' ? { l: star.r + GAP_X, r: star.r + GAP_X + w, t: y - h / 2, b: y + h / 2 }
      : side === 'l' ? { l: star.l - GAP_X - w, r: star.l - GAP_X, t: y - h / 2, b: y + h / 2 }
      : side === 'b' ? { l: x - w / 2, r: x + w / 2, t: star.b + 12, b: star.b + 12 + h }
      : { l: x - w / 2, r: x + w / 2, t: star.t - 12 - h, b: star.t - 12 };
    return [star, tag];
  }

  private candidate(rnd: () => number, mode: LayoutMode, W: number, H: number): Candidate | null {
    const sides = this.nodes.map(() => SIDES[mode][Math.floor(rnd() * SIDES[mode].length)]!);
    const z = this.z;
    const P = PAD + 2;
    const p: Pt[] = [];
    if (mode === 'tall') {
      // Ряды снизу вверх: Сумерки внизу, Затмение наверху
      const rows = z.map((n) => Math.max(n.s, n.h));
      const slack = H - 2 * P - rows.reduce((a, b) => a + b, 0) - 2 * this.rowGap;
      if (slack >= 0 && rnd() < 0.7) {
        const gaps = share(rnd, 4, slack);
        let y = H - P - gaps[0]!;
        for (let i = 0; i < z.length; i++) {
          const n = z[i]!;
          const range = (sd: Side): Pt => (sd === 'r' ? [P + n.s / 2, W - P - n.s / 2 - GAP_X - n.w] : [P + n.s / 2 + GAP_X + n.w, W - P - n.s / 2]);
          let [x0, x1] = range(sides[i]!);
          if (x1 < x0) {
            sides[i] = sides[i] === 'r' ? 'l' : 'r';
            [x0, x1] = range(sides[i]!);
            if (x1 < x0) return null;
          }
          p.push([between(rnd, x0, x1), y - rows[i]! / 2]);
          y -= rows[i]! + this.rowGap + gaps[i + 1]!;
        }
      } else {
        // Ёлочка: ночи чередуют стороны, подписи заходят на высоту соседних рядов
        const first: Side = rnd() < 0.5 ? 'r' : 'l';
        const zig = z.map((_, i): Side => (i % 2 ? (first === 'r' ? 'l' : 'r') : first));
        sides.splice(0, sides.length, ...zig);
        const zz = this.z;
        for (let i = 0; i < zz.length; i++) {
          const n = zz[i]!;
          const [x0, x1]: Pt = sides[i] === 'r'
            ? [P + n.s / 2, Math.min(W - P - n.s / 2 - GAP_X - n.w, W * 0.5)]
            : [Math.max(P + n.s / 2 + GAP_X + n.w, W * 0.5), W - P - n.s / 2];
          if (x1 < x0) return null;
          p.push([between(rnd, x0, x1), 0]);
        }
        const half = zz.map((n) => Math.max(n.s, n.h) / 2);
        const y0 = between(rnd, Math.max(H * 0.5, P + half[0]!), H - P - half[0]!);
        const y2 = between(rnd, P + half[2]!, Math.min(H * 0.5, H - P - half[2]!));
        const lo = Math.max(y2 + zz[2]!.s / 2 + zz[1]!.s / 2 + 8, P + half[1]!);
        const hi = Math.min(y0 - zz[0]!.s / 2 - zz[1]!.s / 2 - 8, H - P - half[1]!);
        if (hi < lo || y2 >= y0) return null;
        p[0]![1] = y0;
        p[1]![1] = between(rnd, lo, hi);
        p[2]![1] = y2;
      }
    } else {
      // Колонки слева направо; ночь чаще всего поднимается вправо
      const cols = z.map((n, i) => (sides[i] === 'r' || sides[i] === 'l' ? n.s + GAP_X + n.w : Math.max(n.s, n.w)));
      const slack = W - 2 * P - cols.reduce((a, b) => a + b, 0) - 2 * 20;
      if (slack < 0) return null;
      const gaps = share(rnd, 4, slack);
      let x = P + gaps[0]!;
      const ranges: Pt[] = [];
      for (let i = 0; i < z.length; i++) {
        const n = z[i]!, sd = sides[i]!;
        const cx = sd === 'r' ? x + n.s / 2 : sd === 'l' ? x + n.w + GAP_X + n.s / 2 : x + cols[i]! / 2;
        const half = Math.max(n.s, n.h) / 2;
        const range: Pt = sd === 'b' ? [P + n.s / 2, H - P - n.s / 2 - 12 - n.h] : sd === 't' ? [P + n.s / 2 + 12 + n.h, H - P - n.s / 2] : [P + half, H - P - half];
        if (range[1] < range[0]) return null;
        ranges.push(range);
        p.push([cx, 0]);
        x += cols[i]! + 20 + gaps[i + 1]!;
      }
      const ys = ranges.map(([a, b]) => between(rnd, a, b));
      if (rnd() < 0.75) [...ys].sort((a, b) => b - a).forEach((v, i) => (ys[i] = Math.min(Math.max(v, ranges[i]![0]), ranges[i]![1])));
      p.forEach((pt, i) => (pt[1] = ys[i]!));
    }
    return { p, s: sides, bend: this.nodes.map(() => (rnd() < 0.5 ? -1 : 1) * (0.02 + rnd() * 0.32)), lead: (rnd() - 0.5) * 100 };
  }

  private check(c: Candidate, mode: LayoutMode, W: number, H: number): { centers: Pt[]; curves: [Pt, Pt, Pt][]; gap: number } | null {
    const parts = c.p.flatMap((pt, i) => {
      const [star, tag] = this.boxes(i, pt, c.s[i]!);
      return [{ i, star: true, r: grow(star, PAD) }, { i, star: false, r: grow(tag, PAD) }];
    });
    for (const x of parts) if (x.r.l < 0 || x.r.t < 0 || x.r.r > W || x.r.b > H) return null;
    for (let a = 0; a < parts.length; a++)
      for (let b = a + 1; b < parts.length; b++) if (parts[a]!.i !== parts[b]!.i && overlap(parts[a]!.r, parts[b]!.r)) return null;
    const centers = c.p;
    // Луч к первой ночи от края и дуги между ночами
    const start: Pt = mode === 'tall' ? [centers[0]![0] + c.lead, H + 8] : [-8, centers[0]![1] + c.lead];
    const curves = [quad(start, centers[0]!, c.bend[0]!), ...centers.slice(1).map((pt, i) => quad(centers[i]!, pt, c.bend[i + 1]!))];
    for (let s = 0; s < curves.length; s++) {
      for (let k = 1; k < 30; k++) {
        const [x, y] = onCurve(curves[s]!, k / 30);
        for (const z of parts) {
          if (z.star && (z.i === s || z.i === s - 1)) continue;
          const r = z.star ? z.r : grow(z.r, 2);
          if (x > r.l && x < r.r && y > r.t && y < r.b) return null;
        }
      }
    }
    let gap = Infinity;
    for (const a of parts) for (const b of parts) if (a.i < b.i) gap = Math.min(gap, Math.max(b.r.l - a.r.r, a.r.l - b.r.r, b.r.t - a.r.b, a.r.t - b.r.b));
    return { centers, curves, gap };
  }

  /** Классы сжатия вешаются на `scope` — от них зависят размеры звёзд, шрифта и ряд Знамений. */
  solve(scope: HTMLElement): Placed {
    const mode = layoutMode(window.innerWidth, window.innerHeight);
    // Пока идёт подбор, переходы выключены: иначе замер отдаёт старые размеры и позиции
    scope.classList.add('measuring');
    try {
      // Ступени сжатия: обычный вид → меньше звёзды и шрифт → без ряда Знамений → правило
      // Затмения в две строки. Каждая — только если на предыдущей места не нашлось.
      for (let level = 0; level < SQUEEZE.length; level++) {
        for (const cls of SQUEEZE) for (const c of cls) scope.classList.remove(c);
        for (const c of SQUEEZE[level]!) scope.classList.add(c);
        const tight = level > 0;
        this.rowGap = level > 1 ? 8 : 16;
        const R = this.area.getBoundingClientRect();
        // Ширина подписи: в ландшафте колонки уже, в тесном виде — ещё на 15 %
        const tw = Math.min(200, Math.max(132, R.width * (mode === 'tall' ? 0.56 : mode === 'land' ? 0.2 : 0.24))) * (tight ? 0.85 : 1);
        this.area.style.setProperty('--tw', `${tw}px`);
        this.measure();
        const rnd = mulberry(this.seed * 7919 + (mode === 'tall' ? 0 : mode === 'land' ? 17 : 31) + level * 5);
        const ok: { c: Candidate; r: NonNullable<ReturnType<ChartLayout['check']>> }[] = [];
        for (let n = 0; n < (level > 1 ? 900 : 400) && ok.length < 16; n++) {
          const c = this.candidate(rnd, mode, R.width, R.height);
          const r = c && this.check(c, mode, R.width, R.height);
          if (c && r) ok.push({ c, r });
        }
        if (!ok.length) continue;
        const roomy = ok.filter((o) => o.r.gap >= 16);
        const best = roomy.length ? roomy[Math.floor(rnd() * roomy.length)]! : ok.reduce((a, b) => (b.r.gap > a.r.gap ? b : a));
        this.apply(best.c);
        return { ...best.r, tight, ok: true };
      }
      const R = this.area.getBoundingClientRect();
      return this.fallback(mode, R.width, R.height);
    } finally {
      scope.classList.remove('measuring');
    }
  }

  /** Запасная расстановка, если места не хватило ни в одном виде: ровные ряды или колонки. */
  private fallback(mode: LayoutMode, W: number, H: number): Placed {
    const n = this.nodes.length;
    const c: Candidate = {
      p: this.nodes.map((_, i): Pt => (mode === 'tall' ? [W * (i % 2 ? 0.62 : 0.22), (H * (n - i - 0.5)) / n] : [(W * (i + 0.15)) / n, H * (0.62 - i * 0.12)])),
      s: this.nodes.map((_, i) => (mode === 'tall' ? (i % 2 ? 'l' : 'r') : 'r')),
      bend: this.nodes.map(() => 0.15),
      lead: 0,
    };
    this.apply(c);
    const R = this.area.getBoundingClientRect();
    const centers = this.nodes.map((_, i): Pt => {
      const b = this.star(i).getBoundingClientRect();
      return [b.left + b.width / 2 - R.left, b.top + b.height / 2 - R.top];
    });
    const start: Pt = mode === 'tall' ? [centers[0]![0], H + 8] : [-8, centers[0]![1]];
    return { centers, curves: [quad(start, centers[0]!, 0.15), ...centers.slice(1).map((pt, i) => quad(centers[i]!, pt, 0.15))], gap: 0, tight: true, ok: false };
  }
}
