import { omenDef } from '@/core/content/omens';
import { bossDef } from '@/core/content/bosses';
import { hashSeed } from '@/core/rng';
import type { ComboId, Glyph, Suit } from '@/core/types';
import { drawGlyphBadge } from './card';
import { makeCanvas } from '@/engine/renderer';
import { glowDot, roundRect, sparklePath, suitPath } from './glyphs';
import { DISPLAY_FONT, RARITY_COLORS, SUIT_COLORS, rgba } from './palette';

type Ctx = CanvasRenderingContext2D;
type Motif = (ctx: Ctx, s: number) => void;

/** Центральный знак Знамения: простые узнаваемые фигуры в квадрате [-s, s]. */
const MOTIFS: Record<string, Motif> = {
  twinStars: (ctx, s) => {
    sparklePath(ctx, -s * 0.4, 0, s * 0.45, 4, 0.25);
    sparklePath(ctx, s * 0.4, 0, s * 0.45, 4, 0.25);
    ctx.fill();
  },
  tripod: (ctx, s) => polygon(ctx, 3, s * 0.8, -Math.PI / 2, true),
  ladder: (ctx, s) => bars(ctx, s, [0.35, 0.6, 0.85, 1.1]),
  monochrome: (ctx, s) => {
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.7, 0, Math.PI * 2);
    ctx.fill();
  },
  lowTide: (ctx, s) => waves(ctx, s, 2, 0.3),
  highNoon: (ctx, s) => {
    sunCore(ctx, s * 0.8);
  },
  horizon: (ctx, s) => {
    ctx.fillRect(-s, -s * 0.08, s * 2, s * 0.16);
    ctx.beginPath();
    ctx.arc(0, -s * 0.08, s * 0.45, Math.PI, 0);
    ctx.fill();
  },
  pillar: (ctx, s) => {
    ctx.fillRect(-s * 0.12, -s, s * 0.24, s * 2);
    ctx.fillRect(-s * 0.4, -s, s * 0.8, s * 0.18);
    ctx.fillRect(-s * 0.4, s * 0.82, s * 0.8, s * 0.18);
  },
  stardust: (ctx, s) => {
    for (const [x, y, r] of [[-0.4, -0.3, 0.3], [0.35, -0.45, 0.22], [0.1, 0.35, 0.38], [-0.5, 0.5, 0.18]] as const) {
      sparklePath(ctx, x * s, y * s, r * s, 4, 0.25);
    }
    ctx.fill();
  },
  scatterbrain: (ctx, s) => {
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * s * 0.6 * ((i % 3) / 3 + 0.4), Math.sin(a) * s * 0.6 * ((i % 3) / 3 + 0.4), s * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  binary: (ctx, s) => {
    ctx.beginPath();
    ctx.arc(-s * 0.35, 0, s * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * 0.45, 0, s * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = s * 0.08;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.9, s * 0.35, -0.3, 0, Math.PI * 2);
    ctx.stroke();
  },
  abacus: (ctx, s) => {
    ctx.lineWidth = s * 0.08;
    for (let row = -1; row <= 1; row++) {
      ctx.beginPath();
      ctx.moveTo(-s, row * s * 0.55);
      ctx.lineTo(s, row * s * 0.55);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc((-0.6 + i * 0.35 + row * 0.15) * s, row * s * 0.55, s * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },
  pyre: (ctx, s) => flame(ctx, s),
  ember: (ctx, s) => {
    flame(ctx, s * 0.7);
    ctx.beginPath();
    ctx.arc(s * 0.6, -s * 0.6, s * 0.12, 0, Math.PI * 2);
    ctx.arc(-s * 0.55, -s * 0.3, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
  },
  miser: (ctx, s) => coin(ctx, s * 0.75),
  tithe: (ctx, s) => {
    coin(ctx, s * 0.5, -s * 0.3, -s * 0.2);
    coin(ctx, s * 0.5, s * 0.3, s * 0.25);
  },
  hoarder: (ctx, s) => {
    for (let i = 0; i < 4; i++) coin(ctx, s * 0.4, (i - 1.5) * s * 0.15, s * 0.5 - i * s * 0.3);
  },
  evenKeel: (ctx, s) => {
    ctx.fillRect(-s * 0.8, -s * 0.5, s * 0.5, s * 0.5);
    ctx.fillRect(s * 0.3, -s * 0.5, s * 0.5, s * 0.5);
    ctx.fillRect(-s * 0.8, s * 0.2, s * 1.6, s * 0.2);
  },
  oddity: (ctx, s) => polygon(ctx, 5, s * 0.85, -Math.PI / 2, true),
  crossroads: (ctx, s) => {
    ctx.fillRect(-s, -s * 0.15, s * 2, s * 0.3);
    ctx.fillRect(-s * 0.15, -s, s * 0.3, s * 2);
    sparklePath(ctx, 0, 0, s * 0.5, 4, 0.3);
    ctx.fill();
  },
  diagonalSight: (ctx, s) => eye(ctx, s),
  cornerstone: (ctx, s) => {
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      ctx.fillRect(x * s * 0.6 - s * 0.2, y * s * 0.6 - s * 0.2, s * 0.4, s * 0.4);
    }
  },
  momentum: (ctx, s) => {
    for (let i = 0; i < 3; i++) chevron(ctx, s * 0.5, (i - 1) * s * 0.5);
  },
  patientSky: (ctx, s) => {
    ctx.beginPath();
    ctx.moveTo(-s * 0.6, -s);
    ctx.lineTo(s * 0.6, -s);
    ctx.lineTo(0, 0);
    ctx.lineTo(s * 0.6, s);
    ctx.lineTo(-s * 0.6, s);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
  },
  nightOwl: (ctx, s) => {
    ctx.beginPath();
    ctx.arc(-s * 0.4, 0, s * 0.35, 0, Math.PI * 2);
    ctx.arc(s * 0.4, 0, s * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(-s * 0.4, 0, s * 0.13, 0, Math.PI * 2);
    ctx.arc(s * 0.4, 0, s * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    ctx.moveTo(-s * 0.12, s * 0.35);
    ctx.lineTo(s * 0.12, s * 0.35);
    ctx.lineTo(0, s * 0.65);
    ctx.fill();
  },
  prismLens: (ctx, s) => {
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.85);
    ctx.lineTo(s * 0.8, s * 0.6);
    ctx.lineTo(-s * 0.8, s * 0.6);
    ctx.closePath();
    ctx.fill();
  },
  shortcut: (ctx, s) => {
    ctx.lineWidth = s * 0.18;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-s * 0.8, s * 0.6);
    ctx.quadraticCurveTo(0, -s * 1.1, s * 0.8, s * 0.6);
    ctx.stroke();
  },
  wideSky: (ctx, s) => {
    ctx.beginPath();
    ctx.ellipse(0, 0, s, s * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  constellationMap: (ctx, s) => {
    const pts: [number, number][] = [[-0.8, 0.5], [-0.3, -0.2], [0.2, 0.3], [0.7, -0.6]];
    ctx.lineWidth = s * 0.08;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)));
    ctx.stroke();
    for (const [x, y] of pts) {
      ctx.beginPath();
      ctx.arc(x * s, y * s, s * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  echoChamber: (ctx, s) => {
    ctx.lineWidth = s * 0.1;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.3 * i, -0.8, 0.8);
      ctx.stroke();
    }
  },
  rainbow: (ctx, s) => {
    ctx.lineWidth = s * 0.14;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, s * 0.4, s * (0.9 - i * 0.25), Math.PI, 0);
      ctx.stroke();
    }
  },
  alchemist: (ctx, s) => {
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, -s);
    ctx.lineTo(s * 0.2, -s);
    ctx.lineTo(s * 0.2, -s * 0.2);
    ctx.lineTo(s * 0.75, s * 0.85);
    ctx.lineTo(-s * 0.75, s * 0.85);
    ctx.lineTo(-s * 0.2, -s * 0.2);
    ctx.closePath();
    ctx.fill();
  },
  gambler: (ctx, s) => {
    roundRect(ctx, -s * 0.75, -s * 0.75, s * 1.5, s * 1.5, s * 0.25);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    for (const [x, y] of [[-0.35, -0.35], [0, 0], [0.35, 0.35]] as const) {
      ctx.beginPath();
      ctx.arc(x * s, y * s, s * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  },
  glassCannon: (ctx, s) => {
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.55, 0);
    ctx.lineTo(0, s);
    ctx.lineTo(-s * 0.55, 0);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = s * 0.1;
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, -s * 0.3);
    ctx.lineTo(s * 0.1, s * 0.05);
    ctx.lineTo(-s * 0.05, s * 0.5);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  },
  supernovaSeed: (ctx, s) => {
    sparklePath(ctx, 0, 0, s, 8, 0.3);
    ctx.fill();
  },
  collapsar: (ctx, s) => {
    ctx.lineWidth = s * 0.1;
    ctx.beginPath();
    for (let i = 0; i < 60; i++) {
      const a = i * 0.25;
      const r = s * (1 - i / 60);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
  },
  corona: (ctx, s) => {
    sunCore(ctx, s);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  },
  doubleStar: (ctx, s) => {
    sparklePath(ctx, -s * 0.3, -s * 0.25, s * 0.6, 4, 0.25);
    sparklePath(ctx, s * 0.35, s * 0.3, s * 0.5, 4, 0.25);
    ctx.fill();
  },
};

function polygon(ctx: Ctx, n: number, r: number, rot: number, fill: boolean): void {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  if (fill) ctx.fill();
  else ctx.stroke();
}

function bars(ctx: Ctx, s: number, heights: number[]): void {
  const w = (s * 1.8) / heights.length;
  heights.forEach((h, i) => ctx.fillRect(-s * 0.9 + i * w + w * 0.15, s * 0.8 - h * s * 1.4, w * 0.7, h * s * 1.4));
}

function waves(ctx: Ctx, s: number, count: number, amp: number): void {
  ctx.lineWidth = s * 0.14;
  ctx.lineCap = 'round';
  for (let k = 0; k < count; k++) {
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const x = -s + (i / 20) * s * 2;
      const y = (k - (count - 1) / 2) * s * 0.6 + Math.sin(i * 0.8) * s * amp * 0.5;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
}

function sunCore(ctx: Ctx, s: number): void {
  suitPath(ctx, 'sun', 0, 0, s);
  ctx.fill('nonzero');
}

function flame(ctx: Ctx, s: number): void {
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.bezierCurveTo(s * 0.9, -s * 0.2, s * 0.7, s * 0.9, 0, s * 0.9);
  ctx.bezierCurveTo(-s * 0.7, s * 0.9, -s * 0.9, -s * 0.1, -s * 0.15, -s * 0.35);
  ctx.bezierCurveTo(-s * 0.1, 0, 0, -s * 0.5, 0, -s);
  ctx.fill();
}

function coin(ctx: Ctx, r: number, x = 0, y = 0): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  sparklePath(ctx, x, y, r * 0.55, 4, 0.3);
  ctx.fill();
  ctx.restore();
}

function eye(ctx: Ctx, s: number): void {
  ctx.beginPath();
  ctx.moveTo(-s, 0);
  ctx.quadraticCurveTo(0, -s * 0.9, s, 0);
  ctx.quadraticCurveTo(0, s * 0.9, -s, 0);
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.14, 0, Math.PI * 2);
  ctx.fill();
}

function chevron(ctx: Ctx, s: number, x: number): void {
  ctx.beginPath();
  ctx.moveTo(x - s * 0.3, -s);
  ctx.lineTo(x + s * 0.5, 0);
  ctx.lineTo(x - s * 0.3, s);
  ctx.lineTo(x - s * 0.6, s);
  ctx.lineTo(x + s * 0.2, 0);
  ctx.lineTo(x - s * 0.6, -s);
  ctx.closePath();
  ctx.fill();
}

const BOSS_MOTIFS: Record<string, Motif> = {
  void: (ctx, s) => {
    ctx.fillRect(-s * 0.9, -s * 0.9, s * 0.8, s * 0.8);
    ctx.fillRect(s * 0.1, s * 0.1, s * 0.8, s * 0.8);
  },
  fog: (ctx, s) => waves(ctx, s, 3, 0.35),
  drought: (ctx, s) => {
    ctx.moveTo(0, -s);
    ctx.quadraticCurveTo(s * 0.9, s * 0.2, 0, s * 0.9);
    ctx.quadraticCurveTo(-s * 0.9, s * 0.2, 0, -s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, -s * 0.1);
    ctx.lineTo(s * 0.1, s * 0.2);
    ctx.lineTo(-s * 0.1, s * 0.5);
    ctx.stroke();
  },
  shortNight: (ctx, s) => {
    ctx.arc(0, 0, s * 0.85, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, s * 0.85, -Math.PI / 2, Math.PI * 0.2);
    ctx.closePath();
    ctx.fill();
  },
  silence: (ctx, s) => {
    flame(ctx, s * 0.75);
    ctx.beginPath();
    ctx.moveTo(-s, -s);
    ctx.lineTo(s, s);
    ctx.stroke();
  },
  gravity: (ctx, s) => {
    ctx.moveTo(0, -s);
    ctx.lineTo(0, s * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-s * 0.55, s * 0.15);
    ctx.lineTo(0, s * 0.8);
    ctx.lineTo(s * 0.55, s * 0.15);
    ctx.stroke();
  },
  judge: (ctx, s) => {
    ctx.moveTo(0, -s);
    ctx.lineTo(0, s * 0.8);
    ctx.moveTo(-s * 0.8, -s * 0.5);
    ctx.lineTo(s * 0.8, -s * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-s * 0.6, 0, s * 0.3, 0, Math.PI);
    ctx.arc(s * 0.6, 0, s * 0.3, 0, Math.PI);
    ctx.fill();
  },
  wane: (ctx, s) => {
    ctx.arc(0, 0, s * 0.8, -Math.PI / 2, Math.PI / 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.8, 0, Math.PI * 2);
    ctx.stroke();
  },
  hunger: (ctx, s) => {
    ctx.arc(0, 0, s * 0.8, 0.6, Math.PI * 2 - 0.6);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
  },
};

const cache = new Map<string, HTMLCanvasElement>();

/** Медальон Знамения: кольца редкости, сидированный орнамент, центральный знак. */
export function omenSigil(id: string, size: number, scale: number): HTMLCanvasElement {
  const key = `o:${id}:${size}:${scale}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = omenDef(id);
  const rarity = RARITY_COLORS[def.rarity];
  const tint = def.tags?.suit ? SUIT_COLORS[def.tags.suit] : null;
  const rgb = tint?.rgb ?? rarity.rgb;
  const canvas = makeCanvas(size, size, scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  const c = size / 2;
  const R = size * 0.44;
  const seed = hashSeed(id);

  ctx.save();
  ctx.translate(c, c);
  // Подложка
  const bg = ctx.createRadialGradient(0, -R * 0.3, R * 0.1, 0, 0, R);
  bg.addColorStop(0, '#2b2660');
  bg.addColorStop(1, '#0b0a22');
  ctx.shadowColor = rgba(rarity.rgb, 0.6);
  ctx.shadowBlur = size * 0.08;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Орнамент: многоугольник и лучи из сида
  ctx.strokeStyle = rgba(rgb, 0.35);
  ctx.lineWidth = Math.max(0.6, size * 0.012);
  const sides = 3 + (seed % 6);
  polygon(ctx, sides, R * 0.82, (seed % 360) * (Math.PI / 180), false);
  polygon(ctx, sides, R * 0.82, (seed % 360) * (Math.PI / 180) + Math.PI / sides, false);
  const rays = 8 + ((seed >> 4) % 3) * 4;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86);
    ctx.lineTo(Math.cos(a) * R * 0.94, Math.sin(a) * R * 0.94);
    ctx.stroke();
  }

  // Кольца редкости: 1–3
  ctx.strokeStyle = rarity.main;
  for (let i = 0; i < def.rarity; i++) {
    ctx.lineWidth = Math.max(0.8, size * (i === 0 ? 0.03 : 0.012));
    ctx.beginPath();
    ctx.arc(0, 0, R - i * size * 0.035, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Центральный знак
  const s = R * 0.48;
  ctx.fillStyle = rgba(rgb, 1);
  ctx.strokeStyle = rgba(rgb, 1);
  ctx.shadowColor = rgba(rgb, 0.9);
  ctx.shadowBlur = size * 0.06;
  const motif = MOTIFS[id];
  ctx.beginPath();
  if (motif) motif(ctx, s);
  else if (def.tags?.suit) {
    suitPath(ctx, def.tags.suit, 0, 0, s * 1.05);
    ctx.fill('evenodd');
  } else {
    sparklePath(ctx, 0, 0, s, 4, 0.25);
    ctx.fill();
  }
  ctx.restore();
  cache.set(key, canvas);
  return canvas;
}

/** Затмение: тёмный диск, корона цвета масти или багровая. */
export function bossSigil(id: string, size: number, scale: number): HTMLCanvasElement {
  const key = `boss:${id}:${size}:${scale}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = bossDef(id);
  const rgb: [number, number, number] = def.suit ? SUIT_COLORS[def.suit].rgb : [255, 83, 112];
  const canvas = makeCanvas(size, size, scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  const c = size / 2;
  const R = size * 0.3;
  ctx.translate(c, c);
  const corona = ctx.createRadialGradient(0, 0, R * 0.9, 0, 0, R * 1.6);
  corona.addColorStop(0, rgba(rgb, 0.95));
  corona.addColorStop(0.3, rgba(rgb, 0.35));
  corona.addColorStop(1, rgba(rgb, 0));
  ctx.fillStyle = corona;
  ctx.beginPath();
  ctx.arc(0, 0, R * 1.6, 0, Math.PI * 2);
  ctx.fill();
  const seed = hashSeed(id);
  ctx.strokeStyle = rgba(rgb, 0.5);
  ctx.lineWidth = size * 0.01;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + (seed % 10) * 0.1;
    const len = R * (1.2 + ((seed >> i) & 3) * 0.12);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.fillStyle = '#05040f';
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(rgb, 0.9);
  ctx.lineWidth = size * 0.015;
  ctx.stroke();
  ctx.fillStyle = rgba(rgb, 0.85);
  ctx.strokeStyle = rgba(rgb, 0.85);
  ctx.lineWidth = R * 0.12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (def.suit) {
    suitPath(ctx, def.suit, 0, 0, R * 0.55);
    ctx.fill('evenodd');
  } else {
    BOSS_MOTIFS[id]?.(ctx, R * 0.5);
  }
  cache.set(key, canvas);
  return canvas;
}

/** Иконка Звёздной карты (прокачка созвездия). */
export function chartIcon(combo: ComboId, size: number, scale: number): HTMLCanvasElement {
  const key = `chart:${combo}:${size}:${scale}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = makeCanvas(size, size, scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  const seed = hashSeed(combo);
  roundRect(ctx, size * 0.12, size * 0.06, size * 0.76, size * 0.88, size * 0.08);
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, '#1d3b6b');
  g.addColorStop(1, '#0b1330');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(127,224,255,0.9)';
  ctx.lineWidth = size * 0.025;
  ctx.stroke();
  const pts: [number, number][] = [];
  for (let i = 0; i < 5; i++) {
    pts.push([size * (0.25 + frac(Math.sin(seed + i * 3.1) * 999) * 0.5), size * (0.2 + i * 0.13)]);
  }
  ctx.strokeStyle = 'rgba(127,224,255,0.5)';
  ctx.lineWidth = size * 0.012;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  for (const [x, y] of pts) glowDot(ctx, x, y, size * 0.018, 'rgba(127,224,255,0.9)');
  cache.set(key, canvas);
  return canvas;
}

/** Иконка ритуала: масть, глиф или знак действия на свитке. */
export function ritualIcon(id: string, size: number, scale: number): HTMLCanvasElement {
  const key = `rit:${id}:${size}:${scale}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = makeCanvas(size, size, scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  const c = size / 2;
  ctx.translate(c, c);
  const R = size * 0.42;
  const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  bg.addColorStop(0, '#3a1f4f');
  bg.addColorStop(1, '#120a22');
  polygon(ctx, 6, R, Math.PI / 6, false);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,107,139,0.85)';
  ctx.lineWidth = size * 0.025;
  ctx.stroke();
  ctx.fillStyle = '#ffd0dc';
  ctx.strokeStyle = '#ffd0dc';
  ctx.shadowColor = 'rgba(255,107,139,0.9)';
  ctx.shadowBlur = size * 0.06;
  const s = R * 0.5;
  const [kind, arg] = id.split('-') as [string, string | undefined];
  if (kind === 'transmute' && arg) {
    suitPath(ctx, arg as Suit, 0, 0, s);
    ctx.fillStyle = SUIT_COLORS[arg as Suit].main;
    ctx.fill('evenodd');
  } else if (kind === 'glyph' && arg) {
    ctx.shadowBlur = 0;
    drawGlyphBadge(ctx, arg as Glyph, 0, 0, s * 1.1);
  } else if (kind === 'ascend' || kind === 'descend') {
    const dir = kind === 'ascend' ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(0, dir * s);
    ctx.lineTo(s * 0.8, 0);
    ctx.lineTo(s * 0.3, 0);
    ctx.lineTo(s * 0.3, -dir * s);
    ctx.lineTo(-s * 0.3, -dir * s);
    ctx.lineTo(-s * 0.3, 0);
    ctx.lineTo(-s * 0.8, 0);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'banish') {
    ctx.lineWidth = s * 0.25;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-s * 0.7, -s * 0.7);
    ctx.lineTo(s * 0.7, s * 0.7);
    ctx.moveTo(s * 0.7, -s * 0.7);
    ctx.lineTo(-s * 0.7, s * 0.7);
    ctx.stroke();
  } else if (kind === 'twin') {
    roundRect(ctx, -s * 0.8, -s * 0.8, s, s * 1.3, s * 0.15);
    ctx.fill();
    ctx.globalAlpha = 0.6;
    roundRect(ctx, -s * 0.2, -s * 0.5, s, s * 1.3, s * 0.15);
    ctx.fill();
  } else {
    ctx.font = `${s * 1.6}px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', 0, 0);
  }
  cache.set(key, canvas);
  return canvas;
}

function frac(x: number): number {
  return x - Math.floor(x);
}

export function clearSigilCache(): void {
  cache.clear();
}
