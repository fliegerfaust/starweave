// Рисует иконки приложения без зависимостей: растеризация формул + PNG через zlib.
// Запуск: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const mix = (a, b, t) => a + (b - a) * t;
const clamp = (x) => Math.max(0, Math.min(1, x));

/** Цвет точки иконки в координатах [-1, 1]. */
function shade(x, y, maskable) {
  // фон: радиальный градиент ночи
  const r = Math.hypot(x, y + 0.2);
  let col = [mix(48, 8, clamp(r / 1.3)), mix(36, 8, clamp(r / 1.3)), mix(110, 30, clamp(r / 1.3))];
  // туманность
  const neb = Math.exp(-((x - 0.35) ** 2 + (y + 0.35) ** 2) * 4) * 0.5;
  col = [col[0] + 120 * neb, col[1] + 50 * neb, col[2] + 140 * neb];
  // созвездие: точки и линии
  const pts = [[-0.55, 0.5], [-0.25, 0.62], [0.3, 0.55], [0.58, 0.28]];
  for (let i = 0; i < pts.length; i++) {
    const [px, py] = pts[i];
    const d = Math.hypot(x - px, y - py);
    const g = Math.exp(-d * d * 900) + Math.exp(-d * d * 60) * 0.25;
    col = col.map((c) => c + 255 * g);
    if (i < pts.length - 1) {
      const [qx, qy] = pts[i + 1];
      const vx = qx - px, vy = qy - py;
      const t = clamp(((x - px) * vx + (y - py) * vy) / (vx * vx + vy * vy));
      const ld = Math.hypot(x - (px + vx * t), y - (py + vy * t));
      const lg = Math.exp(-ld * ld * 9000) * 0.55;
      col = [col[0] + 200 * lg, col[1] + 180 * lg, col[2] + 255 * lg];
    }
  }
  // золотая четырёхлучевая звезда
  const sx = x, sy = y + 0.12;
  const ax = Math.abs(sx), ay = Math.abs(sy);
  const s = 0.62;
  const star = Math.sqrt(ax / s) + Math.sqrt(ay / s);
  const inside = clamp((1 - star) * 18);
  const glow = Math.exp(-(sx * sx + sy * sy) * 6) * 0.6;
  const gold = [255, mix(236, 190, clamp(sy + 0.5)), mix(170, 80, clamp(sy + 0.5))];
  col = col.map((c, i) => mix(c + gold[i] * glow * 0.6, gold[i], inside));
  const core = Math.exp(-(sx * sx + sy * sy) * 120);
  col = col.map((c) => c + 255 * core);
  // скругление (не для maskable — там фон до краёв)
  let alpha = 1;
  if (!maskable) {
    const k = 0.78, rr = 0.22;
    const qx = Math.max(Math.abs(x) - k, 0), qy = Math.max(Math.abs(y) - k, 0);
    const dist = Math.hypot(qx, qy) - rr;
    alpha = clamp(-dist * 120);
  }
  return [...col.map((c) => Math.round(Math.max(0, Math.min(255, c)))), Math.round(alpha * 255)];
}

function render(size, maskable = false) {
  const buf = Buffer.alloc(size * size * 4);
  const ss = 3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0, 0];
      for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) {
        const u = ((x + (i + 0.5) / ss) / size) * 2 - 1;
        const v = ((y + (j + 0.5) / ss) / size) * 2 - 1;
        const scale = maskable ? 1.25 : 1;
        shade(u * scale, v * scale, maskable).forEach((c, k) => (acc[k] += c));
      }
      acc.forEach((c, k) => (buf[(y * size + x) * 4 + k] = Math.round(c / (ss * ss))));
    }
  }
  return png(size, buf);
}

writeFileSync('public/icons/icon-192.png', render(192));
writeFileSync('public/icons/icon-512.png', render(512));
writeFileSync('public/icons/maskable-512.png', render(512, true));
writeFileSync('public/icons/apple-touch-icon.png', render(180, true));
writeFileSync('public/favicon.png', render(64));
console.log('иконки готовы');
