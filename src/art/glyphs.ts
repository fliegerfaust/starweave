import type { Suit } from '@/core/types';

type Ctx = CanvasRenderingContext2D;

/**
 * Символы мастей как контуры. Рисуются в квадрат с центром (x, y) и радиусом r;
 * заливку и обводку задаёт вызывающий — так один контур служит и для яркой
 * масти в углу, и для призрачной подложки в центре карты.
 */
export function suitPath(ctx: Ctx, suit: Suit, x: number, y: number, r: number): void {
  ctx.beginPath();
  switch (suit) {
    case 'sun':
      sunPath(ctx, x, y, r);
      break;
    case 'moon':
      moonPath(ctx, x, y, r);
      break;
    case 'star':
      sparklePath(ctx, x, y, r, 4, 0.28);
      break;
    case 'comet':
      cometPath(ctx, x, y, r);
      break;
  }
}

function sunPath(ctx: Ctx, x: number, y: number, r: number): void {
  const rays = 12;
  const inner = r * 0.56;
  const outerLong = r;
  const outerShort = r * 0.78;
  for (let i = 0; i < rays * 2; i++) {
    const a = (i / (rays * 2)) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 === 0 ? (i % 4 === 0 ? outerLong : outerShort) : inner;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  // Диск поверх лучей — отдельный подконтур, рисуется с тем же стилем.
  ctx.moveTo(x + r * 0.46, y);
  ctx.arc(x, y, r * 0.46, 0, Math.PI * 2);
}

function moonPath(ctx: Ctx, x: number, y: number, r: number): void {
  // Полумесяц: дуга большого круга минус смещённый круг.
  const R = r * 0.92;
  const cx2 = x + R * 0.52;
  const cy2 = y - R * 0.18;
  const R2 = R * 0.82;
  // Точки пересечения двух окружностей.
  const dx = cx2 - x;
  const dy = cy2 - y;
  const d = Math.hypot(dx, dy);
  const l = (R * R - R2 * R2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, R * R - l * l));
  const mx = x + (dx * l) / d;
  const my = y + (dy * l) / d;
  const p1 = { x: mx + (h * dy) / d, y: my - (h * dx) / d };
  const p2 = { x: mx - (h * dy) / d, y: my + (h * dx) / d };
  const a1 = Math.atan2(p1.y - y, p1.x - x);
  const a2 = Math.atan2(p2.y - y, p2.x - x);
  const b1 = Math.atan2(p1.y - cy2, p1.x - cx2);
  const b2 = Math.atan2(p2.y - cy2, p2.x - cx2);
  ctx.arc(x, y, R, a1, a2, true);
  ctx.arc(cx2, cy2, R2, b2, b1, false);
  ctx.closePath();
}

/** Звезда-искра с вогнутыми сторонами. `waist` — толщина у центра (0..1). */
export function sparklePath(ctx: Ctx, x: number, y: number, r: number, points: number, waist: number): void {
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2 - Math.PI / 2;
    const next = ((i + 1) / points) * Math.PI * 2 - Math.PI / 2;
    const mid = (a + next) / 2;
    const tip = { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
    const nextTip = { x: x + Math.cos(next) * r, y: y + Math.sin(next) * r };
    const ctrl = { x: x + Math.cos(mid) * r * waist, y: y + Math.sin(mid) * r * waist };
    if (i === 0) ctx.moveTo(tip.x, tip.y);
    ctx.quadraticCurveTo(ctrl.x, ctrl.y, nextTip.x, nextTip.y);
  }
  ctx.closePath();
}

function cometPath(ctx: Ctx, x: number, y: number, r: number): void {
  // Ядро в правом верхнем углу, хвост из трёх язычков к левому нижнему.
  const hx = x + r * 0.38;
  const hy = y - r * 0.38;
  const hr = r * 0.36;
  const ang = Math.atan2(hy - (y + r), hx - (x - r));
  const nx = Math.cos(ang + Math.PI / 2);
  const ny = Math.sin(ang + Math.PI / 2);
  const tails = [
    { len: 1.0, off: 0 },
    { len: 0.72, off: 0.8 },
    { len: 0.72, off: -0.8 },
  ];
  ctx.moveTo(hx + nx * hr, hy + ny * hr);
  for (const t of tails) {
    const tx = hx - Math.cos(ang) * r * 1.55 * t.len + nx * hr * t.off * 0.9;
    const ty = hy - Math.sin(ang) * r * 1.55 * t.len + ny * hr * t.off * 0.9;
    ctx.lineTo(tx, ty);
    ctx.lineTo(hx + nx * hr * t.off * 0.35, hy + ny * hr * t.off * 0.35);
  }
  ctx.lineTo(hx - nx * hr, hy - ny * hr);
  ctx.arc(hx, hy, hr, ang - Math.PI / 2, ang + Math.PI / 2, false);
  ctx.closePath();
}

/** Мягкая светящаяся точка-звезда. */
export function glowDot(ctx: Ctx, x: number, y: number, r: number, color: string, core = '#ffffff'): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
  g.addColorStop(0, color);
  g.addColorStop(0.25, color.replace(/[\d.]+\)$/, '0.35)'));
  g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Скруглённый прямоугольник — путь. */
export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
