import type { ComboId, Suit } from '@/core/types';
import type { OmenKind, Rarity } from '@/core/content/omens';
import { RESONANCES } from '@/core/content/resonance';
import { roundRect } from './glyphs';

/**
 * «Эмаль» (FP.4, выбор Дениса): Знамения, Затмения, звёздные карты и ритуалы — эмалевые
 * медальоны в латунной оправе. Цвет эмали — тема Знамения (масть, созвездия, геометрия
 * неба, время, золото, ранги), знак — золотой рельеф с тенью, камешек внизу оправы — цвет
 * формулы (круг — свет или +множитель, ромб — ×), бусины и звезда на оправе — редкость.
 * Затмения — жемчужная оправа и чёрная эмаль, без красного.
 *
 * Знаки описаны строками SVG-путей в квадрате [-50, 50] и рисуются в canvas через Path2D —
 * та же геометрия, что в витрине (docs/vitrines/fp4-omens.html).
 */

type Ctx = CanvasRenderingContext2D;

/** Часть знака: f — заливка, s — линия, c — прорезь цветом поля (разделяет перекрытия). */
interface Part {
  f?: string;
  s?: string;
  c?: string;
  /** Толщина линии или прорези. */
  w?: number;
  /** Поворот: `rotate(a)` или `rotate(a cx cy)`. */
  tr?: string;
  /** Прозрачность части. */
  o?: number;
  /** Свой цвет части или `suit:<масть>`. */
  col?: string;
  rule?: CanvasFillRule;
}

const { PI, cos, sin, round, max } = Math;
const r2 = (n: number) => round(n * 100) / 100;
const pt = (x: number, y: number) => `${r2(x)} ${r2(y)}`;

// ─── Геометрия знаков ──────────────────────────────────────────────────────
/* ───────── Геометрия: пути в квадрате [-50, 50] ───────── */
const circ = (x: number, y: number, r: number): string => `M${pt(x - r, y)}A${r2(r)} ${r2(r)} 0 1 0 ${pt(x + r, y)}A${r2(r)} ${r2(r)} 0 1 0 ${pt(x - r, y)}Z`;
const ell = (x: number, y: number, rx: number, ry: number): string => `M${pt(x - rx, y)}A${r2(rx)} ${r2(ry)} 0 1 0 ${pt(x + rx, y)}A${r2(rx)} ${r2(ry)} 0 1 0 ${pt(x - rx, y)}Z`;
const poly = (n: number, r: number, rot = -PI / 2, x = 0, y = 0): string => 'M' + Array.from({ length: n }, (_, i) => pt(x + cos(rot + (i / n) * 2 * PI) * r, y + sin(rot + (i / n) * 2 * PI) * r)).join('L') + 'Z';
const shape = (a: number[][]): string => 'M' + a.map(([x, y]) => pt(x!, y!)).join('L') + 'Z';
const line = (a: number[][]): string => 'M' + a.map(([x, y]) => pt(x!, y!)).join('L');
const rect = (x: number, y: number, w: number, h: number): string => shape([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
const rrect = (x: number, y: number, w: number, h: number, r: number): string => `M${pt(x + r, y)}H${r2(x + w - r)}A${r2(r)} ${r2(r)} 0 0 1 ${pt(x + w, y + r)}V${r2(y + h - r)}A${r2(r)} ${r2(r)} 0 0 1 ${pt(x + w - r, y + h)}H${r2(x + r)}A${r2(r)} ${r2(r)} 0 0 1 ${pt(x, y + h - r)}V${r2(y + r)}A${r2(r)} ${r2(r)} 0 0 1 ${pt(x + r, y)}Z`;
function sparkle(x: number, y: number, r: number, n = 4, w = 0.28): string {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * PI - PI / 2, b = ((i + 1) / n) * 2 * PI - PI / 2, m = (a + b) / 2;
    if (!i) d += 'M' + pt(x + cos(a) * r, y + sin(a) * r);
    d += 'Q' + pt(x + cos(m) * r * w, y + sin(m) * r * w) + ' ' + pt(x + cos(b) * r, y + sin(b) * r);
  }
  return d + 'Z';
}
function sunRays(x: number, y: number, r: number): string {
  const a: number[][] = [];
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * 2 * PI - PI / 2;
    const rad = i % 2 === 0 ? (i % 4 === 0 ? r : r * 0.8) : r * 0.58;
    a.push([x + cos(ang) * rad, y + sin(ang) * rad]);
  }
  return shape(a);
}
function crescent(x: number, y: number, r: number): string {
  const R = r * 0.92, cx2 = x + R * 0.52, cy2 = y - R * 0.18, R2 = R * 0.82;
  const dx = cx2 - x, dy = cy2 - y, d = Math.hypot(dx, dy);
  const l = (R * R - R2 * R2 + d * d) / (2 * d), h = Math.sqrt(max(0, R * R - l * l));
  const mx = x + (dx * l) / d, my = y + (dy * l) / d;
  const p1x = mx + (h * dy) / d, p1y = my - (h * dx) / d, p2x = mx - (h * dy) / d, p2y = my + (h * dx) / d;
  return `M${pt(p1x, p1y)}A${r2(R)} ${r2(R)} 0 1 0 ${pt(p2x, p2y)}A${r2(R2)} ${r2(R2)} 0 0 1 ${pt(p1x, p1y)}Z`;
}
function comet(x: number, y: number, r: number): string {
  const hx = x + r * 0.38, hy = y - r * 0.38, hr = r * 0.36;
  const ang = Math.atan2(hy - (y + r), hx - (x - r));
  const nx = cos(ang + PI / 2), ny = sin(ang + PI / 2);
  let d = 'M' + pt(hx + nx * hr, hy + ny * hr);
  for (const t of [{ len: 1, off: 0 }, { len: 0.72, off: 0.8 }, { len: 0.72, off: -0.8 }]) {
    const tx = hx - cos(ang) * r * 1.55 * t.len + nx * hr * t.off * 0.9, ty = hy - sin(ang) * r * 1.55 * t.len + ny * hr * t.off * 0.9;
    d += 'L' + pt(tx, ty) + 'L' + pt(hx + nx * hr * t.off * 0.35, hy + ny * hr * t.off * 0.35);
  }
  d += 'L' + pt(hx - nx * hr, hy - ny * hr) + `A${r2(hr)} ${r2(hr)} 0 0 1 ${pt(hx + nx * hr, hy + ny * hr)}Z`;
  return d;
}
const flame = (s: number, x = 0, y = 0): string => `M${pt(x, y - s)}C${pt(x + s * 0.9, y - s * 0.2)} ${pt(x + s * 0.7, y + s * 0.9)} ${pt(x, y + s * 0.9)}C${pt(x - s * 0.7, y + s * 0.9)} ${pt(x - s * 0.9, y - s * 0.1)} ${pt(x - s * 0.15, y - s * 0.35)}C${pt(x - s * 0.1, y)} ${pt(x, y - s * 0.5)} ${pt(x, y - s)}Z`;
const arcP = (x: number, y: number, r: number, a0: number, a1: number): string => `M${pt(x + cos(a0) * r, y + sin(a0) * r)}A${r2(r)} ${r2(r)} 0 ${a1 - a0 > PI ? 1 : 0} 1 ${pt(x + cos(a1) * r, y + sin(a1) * r)}`;
const coinP = (x: number, y: number, r: number): string => circ(x, y, r) + sparkle(x, y, r * 0.55, 4, 0.3);

/* Части знака: f — заливка, s — линия, c — прорезь цветом поля (разделяет перекрытия) */
const MOTIF: Record<string, (s: number) => Part[]> = {
  sunWorship: (s) => [{ f: sunRays(0, 0, s * 1.08) }, { c: circ(0, 0, s * 0.5), w: s * 0.08 }],
  moonTide: (s) => [{ f: crescent(-s * 0.12, 0, s * 1.08) }],
  starlight: (s) => [{ f: sparkle(0, 0, s * 1.12, 4, 0.27) }, { f: circ(s * 0.72, -s * 0.72, s * 0.11) }, { f: circ(-s * 0.7, s * 0.68, s * 0.08) }],
  cometTrail: (s) => [{ f: comet(0, 0, s * 1.02) }],
  twinStars: (s) => [{ f: sparkle(-s * 0.46, 0, s * 0.58) }, { f: sparkle(s * 0.46, 0, s * 0.58) }],
  tripod: (s) => [{ s: shape([[0, -s * 0.72], [s * 0.74, s * 0.55], [-s * 0.74, s * 0.55]]), w: s * 0.08 }, { f: circ(0, -s * 0.72, s * 0.24) + circ(s * 0.74, s * 0.55, s * 0.24) + circ(-s * 0.74, s * 0.55, s * 0.24) }],
  ladder: (s) => { const h = [0.35, 0.6, 0.85, 1.1], w = (s * 1.8) / 4; return [{ f: h.map((k, i) => rect(-s * 0.9 + i * w + w * 0.15, s * 0.8 - k * s * 1.4, w * 0.7, k * s * 1.4)).join('') }]; },
  monochrome: (s) => [{ f: [0, 1, 2, 3].map((i) => poly(4, s * 0.3, -PI / 2, (-0.75 + i * 0.5) * s, -s * 0.08)).join('') }, { s: line([[-s * 0.95, s * 0.48], [s * 0.95, s * 0.48]]), w: s * 0.08 }],
  lowTide: (s) => [{ s: [0, 1].map((k) => line(Array.from({ length: 21 }, (_, i) => [-s + (i / 20) * s * 2, (k - 0.5) * s * 0.62 + sin(i * 0.8) * s * 0.17]))).join(''), w: s * 0.15 }],
  highNoon: (s) => [{ f: sunRays(0, -s * 0.26, s * 0.72) }, { s: line([[-s * 0.95, s * 0.78], [s * 0.95, s * 0.78]]), w: s * 0.12 }],
  horizon: (s) => [{ f: rect(-s, -s * 0.0, s * 2, s * 0.16) + `M${pt(-s * 0.48, 0)}A${r2(s * 0.48)} ${r2(s * 0.48)} 0 0 1 ${pt(s * 0.48, 0)}Z` }, { s: [-0.5, 0, 0.5].map((k) => line([[sin(k) * s * 0.66, -cos(k) * s * 0.66], [sin(k) * s * 0.9, -cos(k) * s * 0.9]])).join(''), w: s * 0.1 }, { s: line([[-s * 0.6, s * 0.42], [s * 0.6, s * 0.42]]), w: s * 0.08 }],
  pillar: (s) => [{ f: rect(-s * 0.13, -s, s * 0.26, s * 2) + rect(-s * 0.42, -s, s * 0.84, s * 0.2) + rect(-s * 0.42, s * 0.8, s * 0.84, s * 0.2) }],
  stardust: (s) => [{ f: [[-0.42, -0.3, 0.34], [0.38, -0.48, 0.24], [0.12, 0.38, 0.42], [-0.52, 0.55, 0.2]].map(([x, y, r]) => sparkle(x! * s, y! * s, r! * s)).join('') }],
  scatterbrain: (s) => [{ f: Array.from({ length: 7 }, (_, i) => { const a = i * 2.4, k = s * 0.66 * ((i % 3) / 3 + 0.4); return circ(cos(a) * k, sin(a) * k, s * 0.13); }).join('') }],
  binary: (s) => [{ s: ell(0, 0, s * 0.95, s * 0.36), w: s * 0.08, tr: 'rotate(-18)' }, { c: circ(-s * 0.36, 0, s * 0.36), w: s * 0.12 }, { f: circ(-s * 0.36, 0, s * 0.36) }, { c: circ(s * 0.48, 0, s * 0.22), w: s * 0.12 }, { f: circ(s * 0.48, 0, s * 0.22) }],
  abacus: (s) => [{ s: [-1, 0, 1].map((r) => line([[-s, r * s * 0.6], [s, r * s * 0.6]])).join(''), w: s * 0.08 }, { f: [-1, 0, 1].flatMap((r) => [0, 1, 2].map((i) => circ((-0.6 + i * 0.36 + r * 0.16) * s, r * s * 0.6, s * 0.16))).join('') }],
  pyre: (s) => [{ f: flame(s * 1.02) }, { c: flame(s * 0.42, 0, s * 0.42), w: s * 0.09 }],
  ember: (s) => [{ f: flame(s * 0.72, -s * 0.08, s * 0.22) }, { f: circ(s * 0.6, -s * 0.62, s * 0.13) + circ(-s * 0.58, -s * 0.38, s * 0.09) + circ(s * 0.3, -s * 0.98, s * 0.07) }],
  miser: (s) => [{ f: coinP(0, 0, s * 0.82), rule: 'evenodd' }, { c: circ(0, 0, s * 0.66), w: s * 0.06 }],
  tithe: (s) => [{ f: coinP(-s * 0.32, -s * 0.24, s * 0.55), rule: 'evenodd' }, { c: circ(s * 0.32, s * 0.28, s * 0.55), w: s * 0.16 }, { f: coinP(s * 0.32, s * 0.28, s * 0.55), rule: 'evenodd' }],
  hoarder: (s) => [0, 1, 2, 3].flatMap((i) => { const y = s * 0.62 - i * s * 0.36; return [{ c: ell(0, y, s * 0.68, s * 0.24), w: s * 0.12 }, { f: ell(0, y, s * 0.68, s * 0.24) }]; }),
  evenKeel: (s) => [{ f: rect(-s * 0.82, -s * 0.52, s * 0.52, s * 0.52) + rect(s * 0.3, -s * 0.52, s * 0.52, s * 0.52) + rect(-s * 0.9, s * 0.18, s * 1.8, s * 0.18) + shape([[0, s * 0.36], [s * 0.28, s * 0.8], [-s * 0.28, s * 0.8]]) }],
  oddity: (s) => [{ f: poly(5, s * 0.9) }, { c: poly(5, s * 0.5), w: s * 0.08 }],
  crossroads: (s) => [{ f: rect(-s, -s * 0.12, s * 2, s * 0.24) + rect(-s * 0.12, -s, s * 0.24, s * 2) }, { c: sparkle(0, 0, s * 0.56, 4, 0.32), w: s * 0.14, tr: 'rotate(45)' }, { f: sparkle(0, 0, s * 0.56, 4, 0.32), tr: 'rotate(45)' }],
  diagonalSight: (s) => [{ f: `M${pt(-s, 0)}Q${pt(0, -s * 0.95)} ${pt(s, 0)}Q${pt(0, s * 0.95)} ${pt(-s, 0)}Z` + circ(0, 0, s * 0.34), rule: 'evenodd' }, { f: circ(0, 0, s * 0.16) }],
  cornerstone: (s) => [{ f: [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, y]) => rect(x! * s * 0.62 - s * 0.24, y! * s * 0.62 - s * 0.24, s * 0.48, s * 0.48)).join('') }, { s: rect(-s * 0.2, -s * 0.2, s * 0.4, s * 0.4), w: s * 0.07 }],
  momentum: (s) => [{ f: [-1, 0, 1].map((k) => { const x = k * s * 0.52, q = s * 0.55; return shape([[x - q * 0.3, -q * 1.6], [x + q * 0.55, 0], [x - q * 0.3, q * 1.6], [x - q * 0.62, q * 1.6], [x + q * 0.22, 0], [x - q * 0.62, -q * 1.6]]); }).join('') }],
  patientSky: (s) => [{ f: shape([[-s * 0.58, -s * 0.86], [s * 0.58, -s * 0.86], [0, 0], [s * 0.58, s * 0.86], [-s * 0.58, s * 0.86], [0, 0]]) }, { s: line([[-s * 0.8, -s * 0.98], [s * 0.8, -s * 0.98]]) + line([[-s * 0.8, s * 0.98], [s * 0.8, s * 0.98]]), w: s * 0.11 }],
  nightOwl: (s) => [{ f: circ(-s * 0.42, -s * 0.05, s * 0.38) + circ(-s * 0.42, -s * 0.05, s * 0.15) + circ(s * 0.42, -s * 0.05, s * 0.38) + circ(s * 0.42, -s * 0.05, s * 0.15), rule: 'evenodd' }, { f: shape([[-s * 0.14, s * 0.38], [s * 0.14, s * 0.38], [0, s * 0.7]]) }, { s: line([[-s * 0.85, -s * 0.62], [-s * 0.42, -s * 0.46], [0, -s * 0.6], [s * 0.42, -s * 0.46], [s * 0.85, -s * 0.62]]), w: s * 0.09 }],
  prismLens: (s) => [{ s: line([[-s * 1.02, s * 0.14], [-s * 0.3, s * 0.1]]), w: s * 0.08 }, { f: shape([[-s * 0.05, -s * 0.8], [s * 0.66, s * 0.6], [-s * 0.76, s * 0.6]]) }, { s: line([[s * 0.36, s * 0.08], [s * 1.02, -s * 0.22]]) + line([[s * 0.44, s * 0.26], [s * 1.02, s * 0.36]]), w: s * 0.08 }],
  shortcut: (s) => [{ s: `M${pt(-s * 0.8, s * 0.55)}Q${pt(0, -s * 1.15)} ${pt(s * 0.8, s * 0.55)}`, w: s * 0.15 }, { f: circ(-s * 0.8, s * 0.6, s * 0.2) + circ(s * 0.8, s * 0.6, s * 0.2) }, { f: circ(0, s * 0.6, s * 0.1), o: 0.6 }],
  wideSky: (s) => { const card = rrect(-s * 0.36, -s * 0.62, s * 0.72, s * 1.08, s * 0.12); return [{ f: card, tr: `rotate(-24 0 ${r2(s * 0.8)})` }, { c: card, w: s * 0.14, tr: `rotate(24 0 ${r2(s * 0.8)})` }, { f: card, tr: `rotate(24 0 ${r2(s * 0.8)})` }, { c: card, w: s * 0.14 }, { f: card }]; },
  constellationMap: (s) => { const p = [[-0.82, 0.5], [-0.3, -0.18], [0.22, 0.32], [0.76, -0.6]].map(([x, y]) => [x! * s, y! * s]); return [{ s: line(p), w: s * 0.08 }, { f: p.map(([x, y], i) => (i === 3 ? sparkle(x!, y!, s * 0.34) : circ(x!, y!, s * 0.15))).join('') }]; },
  echoChamber: (s) => [{ f: circ(-s * 0.55, 0, s * 0.18) }, { s: [1, 2, 3].map((i) => arcP(-s * 0.55, 0, s * 0.42 * i, -0.75, 0.75)).join(''), w: s * 0.11 }],
  rainbow: (s) => ['#ff7f62', '#f6c25b', '#8fd0ff', '#c39bff'].map((col, i) => ({ s: arcP(0, s * 0.45, s * (0.98 - i * 0.22), PI, 2 * PI), w: s * 0.13, col })),
  alchemist: (s) => [{ f: shape([[-s * 0.2, -s * 0.8], [s * 0.2, -s * 0.8], [s * 0.2, -s * 0.18], [s * 0.78, s * 0.86], [-s * 0.78, s * 0.86], [-s * 0.2, -s * 0.18]]) }, { s: line([[-s * 0.34, -s * 0.94], [s * 0.34, -s * 0.94]]), w: s * 0.1 }, { c: line([[-s * 0.5, s * 0.4], [s * 0.5, s * 0.4]]), w: s * 0.08 }],
  gambler: (s) => [{ f: rrect(-s * 0.76, -s * 0.76, s * 1.52, s * 1.52, s * 0.26) + [[-0.38, -0.38], [0, 0], [0.38, 0.38]].map(([x, y]) => circ(x! * s, y! * s, s * 0.14)).join(''), rule: 'evenodd', tr: 'rotate(-10)' }],
  glassCannon: (s) => [{ f: shape([[0, -s * 1.02], [s * 0.58, 0], [0, s * 1.02], [-s * 0.58, 0]]) }, { c: line([[-s * 0.3, -s * 0.34], [s * 0.1, s * 0.04], [-s * 0.06, s * 0.5]]), w: s * 0.1 }, { s: line([[s * 0.72, -s * 0.7], [s * 0.95, -s * 0.92]]) + line([[-s * 0.75, s * 0.68], [-s * 0.95, s * 0.88]]), w: s * 0.08 }],
  supernovaSeed: (s) => [{ f: sparkle(0, 0, s * 1.06, 8, 0.32) }, { c: circ(0, 0, s * 0.22), w: s * 0.08 }],
  collapsar: (s) => [{ s: line(Array.from({ length: 64 }, (_, i) => { const a = i * 0.25, r = s * 1.02 * (1 - i / 64); return [cos(a) * r, sin(a) * r]; })), w: s * 0.1 }, { f: circ(0, 0, s * 0.12) }],
  corona: (s) => [{ f: sunRays(0, 0, s * 1.06) + circ(0, 0, s * 0.42), rule: 'evenodd' }],
  doubleStar: (s) => [{ f: sparkle(-s * 0.32, -s * 0.26, s * 0.66) }, { c: sparkle(s * 0.36, s * 0.32, s * 0.54), w: s * 0.14 }, { f: sparkle(s * 0.36, s * 0.32, s * 0.54) }],
  // Астролябия: кольцо, ось и звезда на ней
  astrologer: (s) => [{ s: circ(0, 0, s * 0.82), w: s * 0.1 }, { s: ell(0, 0, s * 0.82, s * 0.3), w: s * 0.07, tr: 'rotate(-28)' }, { s: line([[-s * 0.95, s * 0.5], [s * 0.95, -s * 0.5]]), w: s * 0.08 }, { f: sparkle(s * 0.42, -s * 0.22, s * 0.4) }],
  // Подзорная труба на звезду
  stargazer: (s) => [{ f: shape([[-s * 0.92, s * 0.5], [s * 0.2, -s * 0.12], [s * 0.36, s * 0.16], [-s * 0.76, s * 0.78]]) }, { s: line([[-s * 0.3, s * 0.42], [-s * 0.5, s * 0.98]]) + line([[-s * 0.3, s * 0.42], [-s * 0.02, s * 0.98]]), w: s * 0.08 }, { f: sparkle(s * 0.66, -s * 0.62, s * 0.38) }],
  // «W» Кассиопеи золотом: фигура мифа, которая не гаснет
  legend: (s) => { const p = [[-0.9, -0.42], [-0.45, 0.42], [0, -0.2], [0.45, 0.42], [0.9, -0.42]].map(([x, y]) => [x! * s, y! * s]); return [{ s: line(p), w: s * 0.1 }, { f: p.map(([x, y], i) => (i === 2 ? sparkle(x!, y!, s * 0.36) : circ(x!, y!, s * 0.15))).join('') }]; },
};
const BOSS_MOTIF: Record<string, (s: number) => Part[]> = {
  void: (s) => [{ f: rect(-s * 0.85, -s * 0.85, s * 0.78, s * 0.78) + rect(s * 0.07, s * 0.07, s * 0.78, s * 0.78) }, { s: rect(s * 0.07, -s * 0.85, s * 0.78, s * 0.78) + rect(-s * 0.85, s * 0.07, s * 0.78, s * 0.78), w: s * 0.07, o: 0.5 }],
  fog: (s) => [{ s: [0, 1, 2].map((k) => line(Array.from({ length: 21 }, (_, i) => [-s + (i / 20) * s * 2, (k - 1) * s * 0.6 + sin(i * 0.8 + k) * s * 0.16]))).join(''), w: s * 0.14 }],
  drought: (s) => [{ f: `M${pt(0, -s)}Q${pt(s * 0.92, s * 0.22)} ${pt(0, s * 0.92)}Q${pt(-s * 0.92, s * 0.22)} ${pt(0, -s)}Z` }, { c: line([[-s * 0.18, -s * 0.12], [s * 0.12, s * 0.2], [-s * 0.1, s * 0.56]]), w: s * 0.12 }],
  shortNight: (s) => [{ s: circ(0, 0, s * 0.86), w: s * 0.1 }, { f: `M0 0L${pt(0, -s * 0.86)}` + `A${r2(s * 0.86)} ${r2(s * 0.86)} 0 0 1 ${pt(cos(PI * 0.2) * s * 0.86, sin(PI * 0.2) * s * 0.86)}Z` }],
  silence: (s) => [{ f: flame(s * 0.8) }, { c: line([[-s, -s], [s, s]]), w: s * 0.3 }, { s: line([[-s * 0.95, -s * 0.95], [s * 0.95, s * 0.95]]), w: s * 0.12 }],
  gravity: (s) => [{ s: line([[0, -s], [0, s * 0.7]]) + line([[-s * 0.55, s * 0.2], [0, s * 0.82], [s * 0.55, s * 0.2]]), w: s * 0.15 }, { s: line([[-s * 0.7, -s * 1.0], [s * 0.7, -s * 1.0]]), w: s * 0.1 }],
  judge: (s) => [{ s: line([[0, -s], [0, s * 0.82]]) + line([[-s * 0.85, -s * 0.5], [s * 0.85, -s * 0.5]]) + line([[-s * 0.4, s * 0.86], [s * 0.4, s * 0.86]]), w: s * 0.11 }, { f: `M${pt(-s * 0.3, 0)}A${r2(s * 0.3)} ${r2(s * 0.3)} 0 0 1 ${pt(-s * 0.9, 0)}Z` + `M${pt(s * 0.9, 0)}A${r2(s * 0.3)} ${r2(s * 0.3)} 0 0 1 ${pt(s * 0.3, 0)}Z` }],
  wane: (s) => [{ s: circ(0, 0, s * 0.84), w: s * 0.1 }, { f: `M${pt(0, -s * 0.84)}A${r2(s * 0.84)} ${r2(s * 0.84)} 0 0 1 ${pt(0, s * 0.84)}Z` }],
  hunger: (s) => [{ f: `M0 0L${pt(cos(0.6) * s * 0.86, sin(0.6) * s * 0.86)}A${r2(s * 0.86)} ${r2(s * 0.86)} 0 1 1 ${pt(cos(-0.6) * s * 0.86, sin(-0.6) * s * 0.86)}Z` }, { c: circ(s * 0.05, -s * 0.42, s * 0.11), w: s * 0.1 }],
};
const SUIT_MOTIF: Record<Suit, (s: number) => Part[]> = {
  sun: (s) => [{ f: sunRays(0, 0, s) }, { c: circ(0, 0, s * 0.48), w: s * 0.08 }],
  moon: (s) => [{ f: crescent(-s * 0.1, 0, s) }],
  star: (s) => [{ f: sparkle(0, 0, s * 1.05, 4, 0.28) }],
  comet: (s) => [{ f: comet(0, 0, s) }],
};
const bossMotif = (id: string, s: number): Part[] => (id.startsWith('eclipse-') ? SUIT_MOTIF[id.slice(8) as Suit](s) : (BOSS_MOTIF[id]?.(s) ?? []));
const RIT_MOTIF: Record<string, (s: number) => Part[]> = {
  ascend: (s) => [{ f: shape([[0, -s], [s * 0.8, 0], [s * 0.3, 0], [s * 0.3, s], [-s * 0.3, s], [-s * 0.3, 0], [-s * 0.8, 0]]) }],
  descend: (s) => [{ f: shape([[0, s], [s * 0.8, 0], [s * 0.3, 0], [s * 0.3, -s], [-s * 0.3, -s], [-s * 0.3, 0], [-s * 0.8, 0]]) }],
  banish: (s) => [{ s: line([[-s * 0.7, -s * 0.7], [s * 0.7, s * 0.7]]) + line([[s * 0.7, -s * 0.7], [-s * 0.7, s * 0.7]]), w: s * 0.26 }],
  twin: (s) => [{ f: rrect(-s * 0.85, -s * 0.8, s, s * 1.3, s * 0.16) }, { c: rrect(-s * 0.15, -s * 0.5, s, s * 1.3, s * 0.16), w: s * 0.16 }, { f: rrect(-s * 0.15, -s * 0.5, s, s * 1.3, s * 0.16), o: 0.75 }],
};
const ritMotif = (id: string, s: number): Part[] =>
  id.startsWith('transmute-') ? SUIT_MOTIF[id.slice(10) as Suit](s).map((p) => ({ ...p, col: p.f ? 'suit:' + id.slice(10) : p.col })) : (RIT_MOTIF[id]?.(s) ?? []);
// ─── Цвета ──────────────────────────────────────────────────────────────────

const SUIT_PAINT: Record<Suit, [string, string]> = {
  sun: ['#f6c25b', '#ffe6a8'],
  moon: ['#8fd0ff', '#e0f3ff'],
  star: ['#c39bff', '#efe2ff'],
  comet: ['#ff7f62', '#ffd8cc'],
};

interface Family {
  base: string;
  deep: string;
  hi: string;
}

/** Темы эмали: цвет поля говорит, о чём Знамение. */
const FAM: Record<string, Family> = {
  sun: { base: '#f2a93b', deep: '#3e1f04', hi: '#ffe6a8' },
  moon: { base: '#4f9be0', deep: '#071a36', hi: '#d9f0ff' },
  star: { base: '#9468e8', deep: '#1c0d40', hi: '#eadcff' },
  comet: { base: '#e5633f', deep: '#3a0e06', hi: '#ffd3c4' },
  lapis: { base: '#4362d8', deep: '#0b1150', hi: '#d6deff' },
  malachite: { base: '#1f9e84', deep: '#032a26', hi: '#c6f5e8' },
  silver: { base: '#7d86b8', deep: '#141834', hi: '#eef1ff' },
  gold: { base: '#c98a22', deep: '#2e1a02', hi: '#ffe6a8' },
  wine: { base: '#a63a6e', deep: '#2a0a20', hi: '#ffd6e6' },
};

const OMEN_FAM: Record<string, string> = {
  sunWorship: 'sun', highNoon: 'sun', moonTide: 'moon', lowTide: 'moon', starlight: 'star', stardust: 'star', collapsar: 'star',
  cometTrail: 'comet', pyre: 'comet', ember: 'comet',
  twinStars: 'lapis', tripod: 'lapis', ladder: 'lapis', monochrome: 'lapis', scatterbrain: 'lapis', binary: 'lapis', rainbow: 'lapis',
  supernovaSeed: 'lapis', constellationMap: 'lapis',
  horizon: 'malachite', pillar: 'malachite', crossroads: 'malachite', diagonalSight: 'malachite', cornerstone: 'malachite',
  shortcut: 'malachite', prismLens: 'malachite', doubleStar: 'malachite',
  astrologer: 'star', stargazer: 'lapis', legend: 'gold',
  abacus: 'silver', momentum: 'silver', patientSky: 'silver', nightOwl: 'silver', wideSky: 'silver', echoChamber: 'silver', glassCannon: 'silver',
  miser: 'gold', tithe: 'gold', hoarder: 'gold', alchemist: 'gold', corona: 'gold',
  evenKeel: 'wine', oddity: 'wine', gambler: 'wine',
};

/** Камешек вида в оправе: свет — голубой, множитель — розовый, золото — золотой. */
const KIND_COL: Partial<Record<OmenKind, string>> = { light: '#7fe0ff', mult: '#ff6b8b', xmult: '#ff6b8b', gold: '#f6c25b' };

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => round(v + (pb[i]! - v) * t).toString(16).padStart(2, '0')).join('');
}

function stops(g: CanvasGradient, list: [number, string][]): CanvasGradient {
  for (const [o, c] of list) g.addColorStop(o, c);
  return g;
}

// ─── Отрисовка частей знака ─────────────────────────────────────────────────

const pathCache = new Map<string, Path2D>();
function path(d: string): Path2D {
  let p = pathCache.get(d);
  if (!p) pathCache.set(d, (p = new Path2D(d)));
  return p;
}

function withTransform(ctx: Ctx, tr: string | undefined, fn: () => void): void {
  if (!tr) return fn();
  const m = /rotate\(([-\d.]+)(?:\s+([-\d.]+)\s+([-\d.]+))?\)/.exec(tr);
  ctx.save();
  if (m) {
    const a = (Number(m[1]) * PI) / 180;
    const cx = Number(m[2] ?? 0);
    const cy = Number(m[3] ?? 0);
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.translate(-cx, -cy);
  }
  fn();
  ctx.restore();
}

interface PaintOpts {
  paint: string | CanvasGradient;
  /** Цвет прорезей — цвет поля под знаком. */
  cut: string;
  /** Тень-силуэт: всё одной краской, без прорезей. */
  silhouette?: boolean;
}

function drawParts(ctx: Ctx, parts: Part[], o: PaintOpts): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const p of parts) {
    if (p.c && o.silhouette) continue;
    withTransform(ctx, p.tr, () => {
      let col: string | CanvasGradient = o.paint;
      if (!o.silhouette && p.col) col = p.col.startsWith('suit:') ? SUIT_PAINT[p.col.slice(5) as Suit][0] : p.col;
      ctx.globalAlpha = o.silhouette ? 1 : (p.o ?? 1);
      if (p.c) {
        ctx.strokeStyle = o.cut;
        ctx.lineWidth = p.w ?? 1;
        ctx.stroke(path(p.c));
      } else if (p.s) {
        ctx.strokeStyle = col;
        ctx.lineWidth = p.w ?? 1;
        ctx.stroke(path(p.s));
      } else if (p.f) {
        ctx.fillStyle = col;
        ctx.fill(path(p.f), p.rule ?? 'nonzero');
      }
      ctx.globalAlpha = 1;
    });
  }
}

/** Золотой рельеф: тень снизу, затем знак золотым градиентом. */
function relief(ctx: Ctx, parts: Part[], s: number, k: number, paint: string | CanvasGradient, cut: string, shadow = 0.55): void {
  ctx.save();
  ctx.scale(k, k);
  ctx.save();
  ctx.translate(0, 2);
  ctx.globalAlpha = shadow;
  drawParts(ctx, parts, { paint: '#000', cut, silhouette: true });
  ctx.restore();
  if (paint === 'gold') paint = stops(ctx.createLinearGradient(0, -s, 0, s), [[0, '#fff6d6'], [0.45, '#f6c25b'], [1, '#b8751c']]);
  drawParts(ctx, parts, { paint, cut });
  ctx.restore();
}

function brassBezel(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, rare = false): CanvasGradient {
  return stops(ctx.createLinearGradient(x0, y0, x1, y1), [
    [0, rare ? '#fff6d8' : '#fff0c4'],
    [0.3, rare ? '#f2b84e' : '#dca546'],
    [0.56, rare ? '#9a5410' : '#7d5214'],
    [0.8, rare ? '#ffcf6a' : '#e8b85a'],
    [1, '#fff2cc'],
  ]);
}

function circle(ctx: Ctx, r: number, cy = 0): void {
  ctx.beginPath();
  ctx.arc(0, cy, r, 0, PI * 2);
}

/** Холст size×size с началом координат в центре и квадратом [-50, 50]. */
function stage(ctx: Ctx, size: number): void {
  ctx.translate(size / 2, size / 2);
  ctx.scale(size / 100, size / 100);
}

// ─── Знамение ────────────────────────────────────────────────────────────────

export function drawEnamelOmen(ctx: Ctx, id: string, rarity: Rarity, kind: OmenKind, size: number): void {
  // Легендарное Резонанса (RS.1): эмаль двух цветов пары сходится в шве, в сердце — восьмилучевая звезда
  const pair = RESONANCES.find((r) => r.id === id)?.pair;
  const f = FAM[OMEN_FAM[pair?.[0] ?? id] ?? 'lapis']!;
  const f2 = pair ? FAM[OMEN_FAM[pair[1]] ?? 'lapis']! : f;
  const small = size < 40;
  const rare = rarity === 3;
  const s = 23.5;
  const parts = pair ? [{ f: sparkle(0, 0, s * 1.05, 8, 0.3) }] : MOTIF[id]?.(s) ?? [{ f: sparkle(0, 0, s, 4, 0.28) }];
  const er = small ? 40 : 41;
  ctx.save();
  stage(ctx, size);
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#000';
  circle(ctx, 49, 1.2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = brassBezel(ctx, -47, -47, 47, 47, rare);
  circle(ctx, 47);
  ctx.fill();
  if (!small) {
    ctx.strokeStyle = 'rgba(255,247,220,0.55)';
    ctx.lineWidth = 0.8;
    circle(ctx, 46.3);
    ctx.stroke();
  }
  ctx.fillStyle = stops(ctx.createRadialGradient(0, -er * 0.4, 0, 0, -er * 0.4, er * 1.56), [[0, mix(f.base, '#ffffff', 0.08)], [0.5, mix(f.base, f.deep, 0.5)], [1, f.deep]]);
  circle(ctx, er);
  ctx.fill();
  if (pair && ctx.createConicGradient) {
    ctx.fillStyle = stops(ctx.createConicGradient(-PI / 2, 0, 0), [[0, f.base], [0.5, f2.base], [1, f.base]]);
    ctx.globalAlpha = 0.85;
    circle(ctx, er);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = stops(ctx.createRadialGradient(0, -er * 0.3, 0, 0, 0, er), [[0, 'rgba(255,255,255,0.16)'], [0.55, 'rgba(10,8,30,0.12)'], [1, 'rgba(10,8,30,0.6)']]);
    circle(ctx, er);
    ctx.fill();
  }
  if (!small) {
    // Гильоше — тонкие лучи по эмали
    ctx.strokeStyle = f.hi;
    ctx.globalAlpha = 0.07;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * 2 * PI;
      ctx.moveTo(cos(a) * 9, sin(a) * 9);
      ctx.lineTo(cos(a) * 40, sin(a) * 40);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = stops(ctx.createRadialGradient(0, 0, 0, 0, 0, er), [[0.78, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.5)']]);
  circle(ctx, er);
  ctx.fill();
  ctx.strokeStyle = 'rgba(42,24,4,0.8)';
  ctx.lineWidth = 1.4;
  circle(ctx, er + 0.2);
  ctx.stroke();

  const k = size < 40 ? 1.24 : size < 60 ? 1.1 : 1;
  relief(ctx, parts, s, k, 'gold', mix(f.base, f.deep, 0.55));

  // Редкость: бусины на оправе, у легендарных — звезда сверху
  if (rarity >= 2 && !small) {
    ctx.fillStyle = 'rgba(255,244,208,0.85)';
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * 2 * PI - PI / 2;
      if (Math.abs(a - PI / 2) < 0.2 || (rare && Math.abs(a + PI / 2) < 0.2)) continue;
      ctx.beginPath();
      ctx.arc(cos(a) * 44, sin(a) * 44, 1.05, 0, PI * 2);
      ctx.fill();
    }
  }
  if (rare) {
    const star = path(sparkle(0, -44, small ? 7 : 6.2, 4, 0.3));
    ctx.fillStyle = '#fffbe8';
    ctx.fill(star);
    ctx.strokeStyle = '#8a5a14';
    ctx.lineWidth = 0.6;
    ctx.stroke(star);
  }
  // Вид: камешек в оправе снизу (ромб — ×)
  const kc = KIND_COL[kind];
  if (kc) {
    const r = small ? 6.6 : 5.4;
    const gem = path(kind === 'xmult' ? poly(4, r * 1.3, -PI / 2, 0, 44) : circ(0, 44, r));
    ctx.fillStyle = stops(ctx.createRadialGradient(-r * 0.3, 44 - r * 0.4, 0, -r * 0.3, 44 - r * 0.4, r * 1.6), [[0, '#ffffff'], [0.35, kc], [1, mix(kc, '#000000', 0.45)]]);
    ctx.fill(gem);
    ctx.strokeStyle = '#3a2406';
    ctx.lineWidth = 1;
    ctx.stroke(gem);
  }
  ctx.restore();
}

// ─── Затмение ────────────────────────────────────────────────────────────────

export function drawEnamelBoss(ctx: Ctx, id: string, size: number): void {
  const small = size < 40;
  const s = 21;
  const suit = id.startsWith('eclipse-') ? (id.slice(8) as Suit) : null;
  const parts = bossMotif(id, s);
  const er = small ? 40 : 41;
  ctx.save();
  stage(ctx, size);
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = '#000';
  circle(ctx, 49, 1.2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = stops(ctx.createLinearGradient(-47, -47, 47, 47), [[0, '#fffaf0'], [0.35, '#d8cdb8'], [0.58, '#7d7466'], [0.82, '#efe5d2'], [1, '#fffaf0']]);
  circle(ctx, 47);
  ctx.fill();
  ctx.fillStyle = stops(ctx.createRadialGradient(0, -er * 0.36, 0, 0, -er * 0.36, er * 1.6), [[0, '#26213e'], [0.6, '#0d0b1c'], [1, '#030208']]);
  circle(ctx, er);
  ctx.fill();
  ctx.strokeStyle = '#2c271f';
  ctx.lineWidth = 1.4;
  circle(ctx, er + 0.2);
  ctx.stroke();
  if (!small) {
    ctx.fillStyle = '#fffaf0';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * 2 * PI;
      ctx.beginPath();
      ctx.arc(cos(a) * 44, sin(a) * 44, 1.5, 0, PI * 2);
      ctx.fill();
    }
  }
  if (suit) {
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = SUIT_PAINT[suit][0];
    circle(ctx, 30);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  const k = size < 40 ? 1.24 : size < 60 ? 1.1 : 1;
  const pearl = stops(ctx.createLinearGradient(0, -s, 0, s), [[0, suit ? SUIT_PAINT[suit][1] : '#fffaf0'], [1, suit ? SUIT_PAINT[suit][0] : '#cbbfa8']]);
  relief(ctx, parts, s, k, pearl, '#0d0b1c', 0.6);
  ctx.restore();
}

// ─── Схема созвездия ─────────────────────────────────────────────────────────

/** Пример линии для схемы: ранг и масть четырёх карт. */
const EX: Record<ComboId, [number, Suit][]> = {
  scatter: [[2, 'sun'], [5, 'moon'], [9, 'star'], [7, 'comet']],
  pair: [[3, 'sun'], [3, 'moon'], [7, 'star'], [5, 'comet']],
  twoPair: [[4, 'sun'], [8, 'moon'], [4, 'star'], [8, 'comet']],
  mirror: [[2, 'sun'], [6, 'moon'], [6, 'star'], [2, 'comet']],
  triple: [[7, 'sun'], [7, 'moon'], [2, 'star'], [7, 'comet']],
  straight: [[5, 'sun'], [3, 'moon'], [6, 'star'], [4, 'comet']],
  flush: [[2, 'sun'], [9, 'sun'], [4, 'sun'], [7, 'sun']],
  cascade: [[3, 'sun'], [4, 'moon'], [5, 'star'], [6, 'comet']],
  quartet: [[8, 'sun'], [8, 'moon'], [8, 'star'], [8, 'comet']],
  starFlush: [[6, 'moon'], [4, 'moon'], [7, 'moon'], [5, 'moon']],
  supernova: [[3, 'star'], [4, 'star'], [5, 'star'], [6, 'star']],
};

interface Scheme {
  stars: { x: number; y: number; su: Suit; on: boolean }[];
  links: string[];
  dashed: boolean;
  burst: boolean;
  flushBar: boolean;
  bot: number;
}

/** Четыре карты линии: высота звезды — ранг, цвет — масть, дуги — что совпало. */
function scheme(combo: ComboId, W: number, H: number, pad: number): Scheme {
  const ex = EX[combo] ?? EX.scatter;
  const xs = ex.map((_, i) => pad + (i * (W - 2 * pad)) / 3);
  const top = H * 0.2;
  const bot = H * 0.84;
  const y = (r: number) => bot - ((r - 1) / 8) * (bot - top);
  const stars = ex.map(([r, su], i) => ({ x: xs[i]!, y: y(r), su, on: true }));
  const links: string[] = [];
  let dashed = false;
  const arc = (i: number, j: number, lift: number) => {
    const a = stars[i]!;
    const b = stars[j]!;
    return `M${pt(a.x, a.y)}Q${pt((a.x + b.x) / 2, a.y - lift)} ${pt(b.x, b.y)}`;
  };
  const L = H * 0.2;
  const byRank = (idx: number[]) => idx.slice().sort((a, b) => ex[a]![0] - ex[b]![0]);
  switch (combo) {
    case 'scatter':
      stars.forEach((s) => (s.on = false));
      break;
    case 'pair':
      links.push(arc(0, 1, L * 0.8));
      stars[2]!.on = stars[3]!.on = false;
      break;
    case 'twoPair':
      links.push(arc(0, 2, L), arc(1, 3, L));
      break;
    case 'mirror':
      links.push(arc(1, 2, L * 0.8), arc(0, 3, L * 1.1));
      break;
    case 'triple':
      links.push(arc(0, 1, L * 0.8), arc(1, 3, L * 0.9));
      stars[2]!.on = false;
      break;
    case 'quartet':
    case 'cascade':
    case 'supernova':
      links.push(line(stars.map((s) => [s.x, s.y])));
      break;
    case 'straight':
    case 'starFlush':
      links.push(line(byRank([0, 1, 2, 3]).map((i) => [stars[i]!.x, stars[i]!.y])));
      dashed = true;
      break;
    case 'flush':
      break;
  }
  return { stars, links, dashed, burst: combo === 'supernova', flushBar: combo === 'flush' || combo === 'starFlush' || combo === 'supernova', bot };
}

function drawScheme(ctx: Ctx, sc: Scheme, k: number): void {
  if (sc.flushBar) {
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = SUIT_PAINT[sc.stars[0]!.su][0];
    ctx.lineWidth = 2.4 * k;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sc.stars[0]!.x - 4, sc.bot + 7);
    ctx.lineTo(sc.stars[3]!.x + 4, sc.bot + 7);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = stops(ctx.createLinearGradient(0, 0, 0, 70), [[0, '#ffe6a8'], [1, '#d99a35']]);
  ctx.lineWidth = 2 * k;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(sc.dashed ? [3 * k, 3 * k] : []);
  for (const d of sc.links) ctx.stroke(path(d));
  ctx.setLineDash([]);
  for (const s of sc.stars) {
    const r = (s.on ? 7.6 : 5.2) * k;
    ctx.globalAlpha = s.on ? 1 : 0.45;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill(path(sparkle(s.x, s.y + 1, r, 4, 0.3)));
    ctx.fillStyle = SUIT_PAINT[s.su][0];
    ctx.fill(path(sparkle(s.x, s.y, r, 4, 0.3)));
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, r * 0.22, 0, PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (sc.burst) {
    const t = sc.stars[3]!;
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = '#ffe6a8';
    ctx.lineWidth = 1;
    ctx.stroke(path(sparkle(t.x, t.y, 13, 8, 0.25)));
    ctx.globalAlpha = 1;
  }
}

function lapisField(ctx: Ctx, x: number, y: number, w: number, h: number, light: number, mid: number): CanvasGradient {
  const f = FAM.lapis!;
  const cx = x + w / 2;
  const cy = y + h * 0.22;
  return stops(ctx.createRadialGradient(cx, cy, 0, cx, cy, max(w, h) * 0.95), [[0, mix(f.base, '#ffffff', light)], [mid, mix(f.base, f.deep, 0.55)], [1, f.deep]]);
}

function roundedRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  // Свой контур, а не ctx.roundRect: его нет в Safari до 16
  roundRect(ctx, x, y, w, h, r);
}

/** Звёздная карта: латунная рамка, лазурит, схема созвездия. */
export function drawEnamelChart(ctx: Ctx, combo: ComboId, size: number): void {
  const small = size < 40;
  ctx.save();
  stage(ctx, size);
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#000';
  roundedRect(ctx, -47, -45.8, 94, 94, 16);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = brassBezel(ctx, -46, -46, 46, 46);
  roundedRect(ctx, -46, -46, 92, 92, 15);
  ctx.fill();
  ctx.fillStyle = lapisField(ctx, -40, -40, 80, 80, 0.06, 0.55);
  roundedRect(ctx, -40, -40, 80, 80, 10);
  ctx.fill();
  ctx.strokeStyle = '#2a1804';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.translate(-32, -29);
  drawScheme(ctx, scheme(combo, 64, 54, 9), small ? 1.45 : 1.2);
  ctx.restore();
}

/** Схема созвездия для строки Справочника: w×(w·68/116). */
export function drawComboScheme(ctx: Ctx, combo: ComboId, w: number): void {
  ctx.save();
  ctx.scale(w / 116, w / 116);
  ctx.fillStyle = brassBezel(ctx, 1, 1, 115, 67);
  roundedRect(ctx, 1, 1, 114, 66, 12);
  ctx.fill();
  ctx.fillStyle = lapisField(ctx, 4.5, 4.5, 107, 59, 0.04, 0.5);
  roundedRect(ctx, 4.5, 4.5, 107, 59, 9);
  ctx.fill();
  ctx.strokeStyle = '#2a1804';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.translate(2, 3);
  drawScheme(ctx, scheme(combo, 112, 62, 16), 1);
  ctx.restore();
}

// ─── Ритуал ──────────────────────────────────────────────────────────────────

/**
 * Ритуал — карта в латунной рамке на винной эмали: он меняет карты. `inner` рисует знак
 * сам (значок глифа) — иначе берётся знак ритуала.
 */
export function drawEnamelRitual(ctx: Ctx, id: string, size: number, inner?: (ctx: Ctx) => void): void {
  const small = size < 40;
  const f = FAM.wine!;
  ctx.save();
  stage(ctx, size);
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#000';
  ctx.fill(path(rrect(-33, -45.8, 66, 94, 11)));
  ctx.globalAlpha = 1;
  ctx.fillStyle = brassBezel(ctx, -32, -46, 32, 46);
  ctx.fill(path(rrect(-32, -46, 64, 92, 10)));
  ctx.fillStyle = stops(ctx.createRadialGradient(0, -24, 0, 0, -24, 76), [[0, mix(f.base, '#ffffff', 0.05)], [0.55, mix(f.base, f.deep, 0.55)], [1, f.deep]]);
  const field = path(rrect(-26, -40, 52, 80, 6));
  ctx.fill(field);
  ctx.strokeStyle = '#2a1804';
  ctx.lineWidth = 1.2;
  ctx.stroke(field);
  if (inner) inner(ctx);
  else relief(ctx, ritMotif(id, 17), 17, small ? 1.2 : 1, 'gold', mix(f.base, f.deep, 0.55));
  ctx.restore();
}

// ─── Пакет ───────────────────────────────────────────────────────────────────

/** Эмаль пакета — цветом того, что внутри: Знамения, ритуалы, звёздные карты. */
const PACK_FAM: Record<string, string> = { omen: 'star', ritual: 'wine', chart: 'lapis' };

function enamelFill(ctx: Ctx, f: Family, x: number, y: number, w: number, h: number): CanvasGradient {
  const cx = x + w / 2;
  const cy = y + h * 0.25;
  return stops(ctx.createRadialGradient(cx, cy, 0, cx, cy, max(w, h) * 0.9), [[0, mix(f.base, '#ffffff', 0.06)], [0.55, mix(f.base, f.deep, 0.55)], [1, f.deep]]);
}

/**
 * Пакет: латунный конверт на эмали цвета содержимого, из-за него веером выглядывают три
 * карты — «выбери одну из трёх», печать — маленький медальон со знаком содержимого.
 */
export function drawEnamelPack(ctx: Ctx, pack: string, size: number): void {
  const f = FAM[PACK_FAM[pack] ?? 'gold']!;
  const cut = mix(f.base, f.deep, 0.55);
  ctx.save();
  stage(ctx, size);
  // Тень всего пакета
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#000';
  ctx.fill(path(rrect(-45, -8.8, 90, 56, 10)));
  ctx.globalAlpha = 1;

  // Три карты веером за конвертом
  for (const a of [-20, 0, 20]) {
    ctx.save();
    ctx.translate(0, 14);
    ctx.rotate((a * PI) / 180);
    ctx.translate(0, -14);
    ctx.fillStyle = brassBezel(ctx, -15, -44, 15, 4);
    ctx.fill(path(rrect(-15, -44, 30, 46, 5)));
    ctx.fillStyle = enamelFill(ctx, f, -11.5, -40.5, 23, 40);
    ctx.fill(path(rrect(-11.5, -40.5, 23, 40, 3)));
    ctx.fillStyle = 'rgba(255,240,200,0.75)';
    ctx.fill(path(sparkle(0, -30, 4.2, 4, 0.3)));
    ctx.restore();
  }

  // Конверт
  ctx.fillStyle = brassBezel(ctx, -44, -10, 44, 46);
  ctx.fill(path(rrect(-44, -10, 88, 56, 10)));
  const body = path(rrect(-39, -5, 78, 46, 6));
  ctx.fillStyle = enamelFill(ctx, f, -39, -5, 78, 46);
  ctx.fill(body);
  ctx.strokeStyle = '#2a1804';
  ctx.lineWidth = 1.2;
  ctx.stroke(body);
  // Клапан — золотой рельеф
  relief(ctx, [{ s: line([[-37, -3], [0, 22], [37, -3]]), w: 3.2 }], 26, 1, 'gold', cut, 0.5);

  // Печать: латунный медальон со знаком содержимого
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  circleAt(ctx, 0, 23.8, 16.5);
  ctx.fill();
  ctx.fillStyle = brassBezel(ctx, -16, 6, 16, 38);
  circleAt(ctx, 0, 22, 16);
  ctx.fill();
  ctx.fillStyle = stops(ctx.createRadialGradient(0, 17, 0, 0, 17, 18), [[0, mix(f.base, '#ffffff', 0.1)], [1, f.deep]]);
  circleAt(ctx, 0, 22, 12.6);
  ctx.fill();
  const sign: Part[] =
    pack === 'ritual' ? [{ f: rrect(-5.4, 14, 10.8, 16, 2) }]
    : pack === 'chart' ? [{ s: line([[-7, 26.5], [-1.5, 17.5], [6, 23]]), w: 2.2 }, { f: circ(-7, 26.5, 2.6) + circ(-1.5, 17.5, 2.6) + sparkle(6, 23, 4.8, 4, 0.3) }]
    : [{ f: sparkle(0, 22, 9.4, 4, 0.28) }];
  relief(ctx, sign, 8, 1, stops(ctx.createLinearGradient(0, 14, 0, 30), [[0, '#fff6d6'], [0.45, '#f6c25b'], [1, '#b8751c']]), cut, 0.5);
  ctx.restore();
}

function circleAt(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, PI * 2);
}

// ─── Знаки покупок ───────────────────────────────────────────────────────────

/** Знаки в списке «Что внутри»: без рекламы — экран ролика, перечёркнутый росчерком. */
const MARK_MOTIF: Record<string, () => Part[]> = {
  noads: () => [
    { s: rrect(-19, -13, 38, 26, 5), w: 3.4 },
    { f: shape([[-5, -7.5], [8.5, 0], [-5, 7.5]]) },
    // Росчерк с прорезью цветом эмали — не сливается с экраном под ним
    { c: line([[-22, -19], [22, 19]]), w: 9 },
    { s: line([[-22, -19], [22, 19]]), w: 3.6 },
  ],
};

/** Знак покупки — медальон «Эмали» серебряной темы без камня и редкости. */
export function drawEnamelMark(ctx: Ctx, id: string, size: number): void {
  const f = FAM.silver!;
  const er = 41;
  ctx.save();
  stage(ctx, size);
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#000';
  circle(ctx, 49, 1.2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = brassBezel(ctx, -47, -47, 47, 47);
  circle(ctx, 47);
  ctx.fill();
  ctx.fillStyle = stops(ctx.createRadialGradient(0, -er * 0.4, 0, 0, -er * 0.4, er * 1.56), [[0, mix(f.base, '#ffffff', 0.08)], [0.5, mix(f.base, f.deep, 0.5)], [1, f.deep]]);
  circle(ctx, er);
  ctx.fill();
  ctx.fillStyle = stops(ctx.createRadialGradient(0, 0, 0, 0, 0, er), [[0.78, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.5)']]);
  circle(ctx, er);
  ctx.fill();
  ctx.strokeStyle = 'rgba(42,24,4,0.8)';
  ctx.lineWidth = 1.4;
  circle(ctx, er + 0.2);
  ctx.stroke();
  relief(ctx, MARK_MOTIF[id]?.() ?? [], 22, size < 60 ? 1.18 : 1, 'gold', mix(f.base, f.deep, 0.6));
  ctx.restore();
}

// ─── Достижения «Зала славы» ─────────────────────────────────────────────────

/**
 * Медальон достижения (HF.0): та же эмаль и золотой рельеф, что у Знамений, но оправа —
 * зубчатая розетка ордена, чтобы награда не путалась со Знамением. Ступень — как редкость
 * Знамений: у редкого бусины, у эпического яркая латунь, у легендарного ещё звезда сверху.
 */
export function drawEnamelFeat(ctx: Ctx, motif: string, fam: string, tier: 0 | 1 | 2 | 3, size: number): void {
  const f = FAM[fam] ?? FAM.lapis!;
  const small = size < 40;
  const s = 22;
  const er = 38;
  ctx.save();
  stage(ctx, size);
  const rosette = (r0: number, r1: number) => path(shape(Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * 2 * PI - PI / 2;
    const r = i % 2 ? r0 : r1;
    return [cos(a) * r, sin(a) * r];
  })));
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#000';
  ctx.translate(0, 1.4);
  ctx.fill(rosette(46, 49.5));
  ctx.translate(0, -1.4);
  ctx.globalAlpha = 1;
  ctx.fillStyle = brassBezel(ctx, -48, -48, 48, 48, tier >= 2);
  ctx.fill(rosette(46, 49.5));
  ctx.strokeStyle = 'rgba(60,34,6,0.55)';
  ctx.lineWidth = 0.8;
  circle(ctx, 43.2);
  ctx.stroke();
  ctx.fillStyle = stops(ctx.createRadialGradient(0, -er * 0.4, 0, 0, -er * 0.4, er * 1.56), [[0, mix(f.base, '#ffffff', 0.08)], [0.5, mix(f.base, f.deep, 0.5)], [1, f.deep]]);
  circle(ctx, er);
  ctx.fill();
  if (!small) {
    ctx.strokeStyle = f.hi;
    ctx.globalAlpha = 0.07;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * 2 * PI;
      ctx.moveTo(cos(a) * 9, sin(a) * 9);
      ctx.lineTo(cos(a) * 37, sin(a) * 37);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = stops(ctx.createRadialGradient(0, 0, 0, 0, 0, er), [[0.78, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.5)']]);
  circle(ctx, er);
  ctx.fill();
  ctx.strokeStyle = 'rgba(42,24,4,0.8)';
  ctx.lineWidth = 1.4;
  circle(ctx, er + 0.2);
  ctx.stroke();
  const parts = MOTIF[motif]?.(s) ?? [{ f: sparkle(0, 0, s, 4, 0.28) }];
  relief(ctx, parts, s, size < 40 ? 1.2 : size < 60 ? 1.08 : 1, 'gold', mix(f.base, f.deep, 0.55));
  if (tier >= 1 && !small) {
    ctx.fillStyle = 'rgba(255,244,208,0.9)';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * 2 * PI - PI / 2;
      if (tier === 3 && Math.abs(a + PI / 2) < 0.3) continue;
      ctx.beginPath();
      ctx.arc(cos(a) * 41, sin(a) * 41, 1.1, 0, PI * 2);
      ctx.fill();
    }
  }
  if (tier === 3) {
    const star = path(sparkle(0, -45, small ? 8 : 7, 4, 0.3));
    ctx.fillStyle = '#fffbe8';
    ctx.fill(star);
    ctx.strokeStyle = '#8a5a14';
    ctx.lineWidth = 0.6;
    ctx.stroke(star);
  }
  ctx.restore();
}
