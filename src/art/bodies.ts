import type { BodyId } from '@/core/types';
import { rgba } from './palette';

type Ctx = CanvasRenderingContext2D;
type Rgb = [number, number, number];

const TAU = Math.PI * 2;

/** Цвет тела: кромка карты, кольцо окна, свечение срабатывания на небе. */
export const BODY_COLORS: Record<BodyId, Rgb> = {
  polaris: [234, 246, 255],
  meteor: [255, 154, 98],
  pulsar: [159, 240, 255],
  twin: [201, 178, 255],
  nebula: [255, 159, 210],
  blackhole: [255, 207, 122],
};

export const bodyColor = (id: BodyId, a = 1) => rgba(BODY_COLORS[id], a);

/**
 * Окно тела на лице карты (GF.4): тёмный круг ночи в поле масти, жемчужное кольцо цвета
 * тела, внутри — само тело. Масть остаётся цветом поля, поэтому флеш читается как раньше.
 */
export function drawBodyWindow(ctx: Ctx, id: BodyId, x: number, y: number, r: number): void {
  const col = BODY_COLORS[id];
  ctx.save();
  const lens = ctx.createRadialGradient(x, y - r * 0.2, 0, x, y, r);
  lens.addColorStop(0, '#2a2560');
  lens.addColorStop(0.65, '#120f36');
  lens.addColorStop(1, '#07061c');
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = r * 0.25;
  ctx.shadowOffsetY = r * 0.06;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = lens;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  // Пыль в окне — детерминированная по телу
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.96, 0, TAU);
  ctx.clip();
  const seed = id.length * 13 + id.charCodeAt(0);
  for (let i = 0; i < 9; i++) {
    const a = frac(Math.sin(seed + i * 7.31) * 9187.13) * TAU;
    const d = Math.sqrt(frac(Math.sin(seed * 3.1 + i * 1.97) * 4271.7)) * r * 0.9;
    ctx.fillStyle = `rgba(255,255,255,${0.18 + (i % 3) * 0.12})`;
    ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(0.7, r * 0.04), Math.max(0.7, r * 0.04));
  }
  drawBodyEmblem(ctx, id, x, y, r * 0.62);
  ctx.restore();
  // Жемчужное кольцо: яркая кромка и тонкая внутренняя
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.strokeStyle = rgba(col, 0.9);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = Math.max(0.6, r * 0.025);
  ctx.strokeStyle = rgba(col, 0.35);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.86, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/** Само тело в круге радиуса ~`r`; `t` — время для живых тел на небе и в справочнике. */
export function drawBodyEmblem(ctx: Ctx, id: BodyId, x: number, y: number, r: number, t = 0): void {
  ctx.save();
  switch (id) {
    case 'polaris': {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.2);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.25, 'rgba(200,230,255,0.35)');
      g.addColorStop(1, 'rgba(200,230,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      const pts = [[0, -1.25], [0.12, -0.12], [0.62, 0], [0.12, 0.12], [0, 1.25], [-0.12, 0.12], [-0.62, 0], [-0.12, -0.12]] as const;
      pts.forEach(([a, b], i) => (i ? ctx.lineTo(x + a * r, y + b * r) : ctx.moveTo(x + a * r, y + b * r)));
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(234,246,255,0.55)';
      ctx.lineWidth = r * 0.05;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.9, 0, TAU);
      ctx.stroke();
      break;
    }
    case 'meteor': {
      const g = ctx.createLinearGradient(x - r, y + r, x + r * 0.4, y - r * 0.4);
      g.addColorStop(0, 'rgba(255,120,60,0)');
      g.addColorStop(1, 'rgba(255,190,120,0.95)');
      ctx.strokeStyle = g;
      ctx.lineCap = 'round';
      for (const [o, w] of [[0, 0.32], [0.28, 0.12], [-0.28, 0.12]] as const) {
        ctx.lineWidth = r * w;
        ctx.beginPath();
        ctx.moveTo(x - r * 1.1 + o * r, y + r * 1.1 + o * r);
        ctx.lineTo(x + r * 0.3 + o * r * 0.3, y - r * 0.3 + o * r * 0.3);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffe2c4';
      ctx.beginPath();
      ctx.arc(x + r * 0.38, y - r * 0.38, r * 0.34, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ff9a62';
      ctx.beginPath();
      ctx.arc(x + r * 0.46, y - r * 0.44, r * 0.14, 0, TAU);
      ctx.fill();
      break;
    }
    case 'pulsar': {
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.6 + i / 3) % 1;
        ctx.strokeStyle = `rgba(159,240,255,${0.75 * (1 - k)})`;
        ctx.lineWidth = r * 0.08;
        ctx.beginPath();
        ctx.arc(x, y, r * (0.35 + k * 0.85), 0, TAU);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(220,250,255,0.9)';
      ctx.lineWidth = r * 0.09;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - r * 0.25, y - r * 1.15);
      ctx.lineTo(x + r * 0.25, y + r * 1.15);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.26, 0, TAU);
      ctx.fill();
      break;
    }
    case 'twin': {
      ctx.strokeStyle = 'rgba(201,178,255,0.55)';
      ctx.lineWidth = r * 0.06;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.42, -0.4, 0, TAU);
      ctx.stroke();
      const a = 0.6 + t * 1.4;
      for (const [s, rad, c] of [[0, 0.32, '#f2e9ff'], [Math.PI, 0.22, '#c9b2ff']] as const) {
        const px = x + Math.cos(a + s) * r * 0.8 * Math.cos(0.4) - Math.sin(a + s) * r * 0.34 * Math.sin(-0.4);
        const py = y + Math.cos(a + s) * r * 0.8 * Math.sin(-0.4) + Math.sin(a + s) * r * 0.34 * Math.cos(0.4);
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(px, py, r * rad, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'nebula': {
      for (const [dx, dy, rad, c] of [[-0.3, 0.1, 0.85, 'rgba(255,120,190,0.5)'], [0.35, -0.2, 0.75, 'rgba(150,120,255,0.5)'], [0.05, 0.35, 0.65, 'rgba(120,220,255,0.4)']] as const) {
        const g = ctx.createRadialGradient(x + dx * r, y + dy * r, 0, x + dx * r, y + dy * r, rad * r);
        g.addColorStop(0, c);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x + dx * r, y + dy * r, rad * r, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#ffffff';
      for (const [dx, dy, rad] of [[-0.2, -0.1, 0.08], [0.3, 0.2, 0.06], [0.05, -0.45, 0.05], [-0.5, 0.35, 0.05]] as const) {
        ctx.beginPath();
        ctx.arc(x + dx * r, y + dy * r, rad * r, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'blackhole': {
      ctx.translate(x, y);
      ctx.rotate(-0.35);
      const g = ctx.createLinearGradient(-r, 0, r, 0);
      g.addColorStop(0, 'rgba(255,170,80,0.1)');
      g.addColorStop(0.5, 'rgba(255,220,150,0.95)');
      g.addColorStop(1, 'rgba(255,170,80,0.1)');
      ctx.strokeStyle = g;
      ctx.lineWidth = r * 0.18;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.05, r * 0.32, 0, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,214,140,0.9)';
      ctx.lineWidth = r * 0.06;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.53, 0, TAU);
      ctx.stroke();
      // Передняя половина диска — поверх горизонта событий
      ctx.strokeStyle = g;
      ctx.lineWidth = r * 0.18;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.05, r * 0.32, 0, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

function frac(v: number): number {
  return v - Math.floor(v);
}
