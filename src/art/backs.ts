import type { BackStyle } from './cosmetics';

/**
 * Рубашки карт — «Гравюра» (FP.7, выбор Дениса): тонкая латунная гравюра по глубокому полю,
 * как карта неба из старого атласа. Классика — роза из звезды в кольце; покупные — в
 * картографической рамке со шкалой градусов: Комета — орбита с Солнцем в фокусе, Сияние —
 * штриховка над горами, Астролябия — тимпан и алидада, Меценат — розетка гильоше, золотая
 * печать и фольга рамки. Кромка — та же золочёная, что у лица «Небо масти»: одна колода.
 * На мелких картах (< 62 px) тонкая штриховка уходит, знак крупнее. Код — из витрины
 * docs/vitrines/fp7-backs.html.
 */

type Ctx = CanvasRenderingContext2D;
type Stops = [number, string][];
type Pt = [number, number];
type Pt3 = [number, number, number];

const TAU = Math.PI * 2;
const { PI, cos, sin, sqrt, round, abs } = Math;
const INK: [number, number, number] = [255, 218, 150];

const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
function stops(g: CanvasGradient, list: Stops): CanvasGradient {
  for (const [o, c] of list) g.addColorStop(o, c);
  return g;
}
const lin = (ctx: Ctx, x0: number, y0: number, x1: number, y1: number, l: Stops) => stops(ctx.createLinearGradient(x0, y0, x1, y1), l);
const rad = (ctx: Ctx, x0: number, y0: number, r0: number, x1: number, y1: number, r1: number, l: Stops) => stops(ctx.createRadialGradient(x0, y0, r0, x1, y1, r1), l);

// Металлы — те же градиенты, что у кромки лица (gildedStroke) и оправы «Эмали»
const GOLD: Stops = [[0, '#fff6d6'], [0.45, '#f6c25b'], [1, '#b8751c']];
const GILDED: Stops = [[0, '#ffe6a8'], [0.45, '#c8912f'], [0.7, '#f6c25b'], [1, '#9a6a22']];

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  rrPath(ctx, x, y, w, h, r);
}
/** Контур без beginPath — для колец evenodd. */
function rrPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const q = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + q, y);
  ctx.arcTo(x + w, y, x + w, y + h, q);
  ctx.arcTo(x + w, y + h, x, y + h, q);
  ctx.arcTo(x, y + h, x, y, q);
  ctx.arcTo(x, y, x + w, y, q);
  ctx.closePath();
}
function circle(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}
function sparklePath(ctx: Ctx, x: number, y: number, r: number, n = 4, waist = 0.28, rot = 0): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU - PI / 2 + rot;
    const b = ((i + 1) / n) * TAU - PI / 2 + rot;
    const m = (a + b) / 2;
    if (i === 0) ctx.moveTo(x + cos(a) * r, y + sin(a) * r);
    ctx.quadraticCurveTo(x + cos(m) * r * waist, y + sin(m) * r * waist, x + cos(b) * r, y + sin(b) * r);
  }
  ctx.closePath();
}

/** Тень под картой — как у лица: карта лежит на небе. */
function cardShadow(ctx: Ctx, w: number, h: number, fill: string): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = w * 0.08;
  ctx.shadowOffsetY = w * 0.025;
  rr(ctx, 0, 0, w, h, w * 0.09);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}
/** Золочёная кромка — та же, что у лица «Небо масти». */
function gildedEdge(ctx: Ctx, w: number, h: number): void {
  rr(ctx, 0.75, 0.75, w - 1.5, h - 1.5, w * 0.09);
  ctx.lineWidth = Math.max(1.2, w * 0.022);
  ctx.strokeStyle = lin(ctx, 0, 0, w, h, GILDED);
  ctx.stroke();
}

/** Рамка гравюры: у классики — одна линия со звёздами в углах, у покупных — шкала градусов. */
function neatline(ctx: Ctx, w: number, h: number, S: BackStyle, tiny: boolean, L: number): void {
  const i1 = w * 0.06, i2 = w * 0.1;
  ctx.save();
  ctx.lineWidth = L * 1.3; ctx.strokeStyle = rgba(INK, tiny ? 0.75 : 0.62);
  ctx.strokeRect(i1, i1, w - 2 * i1, h - 2 * i1);
  if (!S.ruled) {
    if (!tiny) { ctx.fillStyle = rgba(INK, 0.8); for (const [x, y] of [[i1, i1], [w - i1, i1], [i1, h - i1], [w - i1, h - i1]] as Pt[]) { ctx.beginPath(); sparklePath(ctx, x, y, w * 0.03, 4, 0.3); ctx.fill(); } }
    ctx.restore(); return;
  }
  ctx.strokeRect(i2, i2, w - 2 * i2, h - 2 * i2);
  // Шкала градусов между линиями — как на рамке старой карты
  const bw = i2 - i1;
  if (S.foil) { ctx.beginPath(); rrPath(ctx, i1, i1, w - 2 * i1, h - 2 * i1, 0); rrPath(ctx, i2, i2, w - 2 * i2, h - 2 * i2, 0); ctx.fillStyle = lin(ctx, 0, 0, w, h, GILDED); ctx.fill('evenodd'); }
  ctx.strokeStyle = S.foil ? 'rgba(60,34,6,0.8)' : rgba(INK, tiny ? 0.6 : 0.5);
  ctx.lineWidth = L * (S.foil ? 1 : 0.9);
  ctx.beginPath();
  const step = bw * (tiny ? 1.6 : 0.75);
  const ticks = (len: number, along: (t: number, l: number) => void) => { const n = round(len / step); for (let k = 1; k < n; k++) { const t = i2 + (k / n) * len, l = k % 5 === 0 ? 1 : 0.5; along(t, l); } };
  ticks(w - 2 * i2, (x, l) => { ctx.moveTo(x, i2); ctx.lineTo(x, i2 - bw * l); ctx.moveTo(x, h - i2); ctx.lineTo(x, h - i2 + bw * l); });
  ticks(h - 2 * i2, (y, l) => { ctx.moveTo(i2, y); ctx.lineTo(i2 - bw * l, y); ctx.moveTo(w - i2, y); ctx.lineTo(w - i2 + bw * l, y); });
  ctx.stroke();
  ctx.lineWidth = L * 1.3; ctx.strokeStyle = rgba(INK, tiny ? 0.75 : 0.62);
  // Углы — квадраты со звёздочкой
  for (const [x, y] of [[i1, i1], [w - i2, i1], [i1, h - i2], [w - i2, h - i2]] as Pt[]) {
    ctx.fillStyle = S.field[1]; ctx.fillRect(x, y, bw, bw); ctx.strokeRect(x, y, bw, bw);
    if (!tiny) { ctx.fillStyle = S.foil ? lin(ctx, x, y, x + bw, y + bw, GOLD) : rgba(INK, 0.85); ctx.beginPath(); sparklePath(ctx, x + bw / 2, y + bw / 2, bw * 0.42, 4, 0.3); ctx.fill(); }
  }
  ctx.restore();
}

/** Рубашка в координатах карты w×h. */
export function drawEngravedBack(ctx: Ctx, S: BackStyle, w: number, h: number): void {
  const id = S.id;
  const tiny = w < 62, cx = w / 2, cy = h / 2;
  const L = Math.max(0.55, w * 0.0058);
  const ink = (a: number) => rgba(INK, tiny ? Math.min(1, a * 1.35) : a);
  cardShadow(ctx, w, h, S.field[1]);
  ctx.save(); rr(ctx, 0, 0, w, h, w * 0.09); ctx.clip();
  ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, S.field[0]], [1, S.field[1]]]); ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = rad(ctx, cx, cy, 0, cx, cy, w * 0.6, [[0, rgba(INK, 0.07)], [1, rgba(INK, 0)]]); ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = rad(ctx, w * 0.3, 0, 0, w * 0.3, 0, w * 1.05, [[0, 'rgba(255,244,220,0.1)'], [1, 'rgba(255,244,220,0)']]); ctx.fillRect(0, 0, w, h);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const star = (x: number, y: number, r: number, a = 0.9) => { ctx.fillStyle = ink(a); circle(ctx, x, y, r); ctx.fill(); };
  if (id === 'classic') {
    const R = w * 0.3;
    ctx.lineWidth = L; ctx.strokeStyle = ink(0.55); circle(ctx, cx, cy, R); ctx.stroke();
    if (!tiny) {
      ctx.fillStyle = ink(0.7);
      for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU; circle(ctx, cx + cos(a) * R * 1.12, cy + sin(a) * R * 1.12, L * 0.75); ctx.fill(); }
      ctx.strokeStyle = ink(0.3); ctx.beginPath();
      for (let i = 0; i < 32; i++) { const a = (i / 32) * TAU, l = i % 2 ? 0.62 : 0.94; ctx.moveTo(cx + cos(a) * R * 0.3, cy + sin(a) * R * 0.3); ctx.lineTo(cx + cos(a) * R * l, cy + sin(a) * R * l); }
      ctx.stroke();
      ctx.strokeStyle = ink(0.6); ctx.beginPath(); sparklePath(ctx, cx, cy, R * 0.62, 4, 0.3, PI / 4); ctx.stroke();
    }
    ctx.fillStyle = lin(ctx, 0, cy - R * 0.6, 0, cy + R * 0.6, GOLD);
    ctx.beginPath(); sparklePath(ctx, cx, cy, R * (tiny ? 0.78 : 0.6), 4, 0.22); ctx.fill();
  } else if (id === 'astrolabe') {
    const R = w * 0.37, c2 = cy + w * 0.02;
    ctx.save();
    ctx.lineWidth = L * 1.6; ctx.strokeStyle = ink(0.85); circle(ctx, cx, c2, R); ctx.stroke();
    ctx.lineWidth = L; circle(ctx, cx, c2, R * 0.86); ctx.stroke();
    if (!tiny) {
      ctx.beginPath();
      for (let i = 0; i < 120; i++) { const a = (i / 120) * TAU, l = i % 10 === 0 ? 0.86 : i % 5 === 0 ? 0.9 : 0.94; ctx.moveTo(cx + cos(a) * R, c2 + sin(a) * R); ctx.lineTo(cx + cos(a) * R * l, c2 + sin(a) * R * l); }
      ctx.strokeStyle = ink(0.6); ctx.stroke();
      // Тимпан: тропики, альмукантараты, азимуты
      ctx.save(); circle(ctx, cx, c2, R * 0.86); ctx.clip();
      ctx.strokeStyle = ink(0.28);
      for (const k of [0.32, 0.58]) { circle(ctx, cx, c2, R * k); ctx.stroke(); }
      ctx.strokeStyle = ink(0.4);
      for (let k = 0; k < 6; k++) { circle(ctx, cx, c2 - R * (0.12 + k * 0.07), R * (0.82 - k * 0.12)); ctx.stroke(); }
      ctx.strokeStyle = ink(0.22); ctx.beginPath();
      for (let k = -3; k <= 3; k++) { ctx.moveTo(cx, c2 - R * 0.55); ctx.quadraticCurveTo(cx + k * R * 0.32, c2 + R * 0.1, cx + k * R * 0.2, c2 + R * 0.9); }
      ctx.stroke();
      ctx.restore();
    }
    // Эклиптика и рете
    ctx.lineWidth = L * 2; ctx.strokeStyle = ink(0.9); circle(ctx, cx, c2 - R * 0.2, R * 0.55); ctx.stroke();
    ctx.fillStyle = lin(ctx, 0, c2 - R, 0, c2 + R, GOLD);
    for (const [x, y, k] of [[-0.6, -0.32, 1], [0.38, -0.66, 0.8], [0.66, 0.2, 0.9], [-0.18, 0.5, 0.85], [0.06, -0.12, 0.7], [-0.5, 0.2, 0.7]] as Pt3[]) {
      ctx.beginPath(); sparklePath(ctx, cx + x * R, c2 + y * R, w * 0.03 * k * (tiny ? 1.5 : 1), 4, 0.3); ctx.fill();
    }
    // Алидада
    ctx.save(); ctx.translate(cx, c2); ctx.rotate(-0.42);
    ctx.fillStyle = lin(ctx, -R, 0, R, 0, GOLD);
    ctx.beginPath(); ctx.moveTo(-R * 1.04, 0); ctx.lineTo(-R * 0.2, -w * 0.016); ctx.lineTo(R * 0.2, -w * 0.016); ctx.lineTo(R * 1.04, 0); ctx.lineTo(R * 0.2, w * 0.016); ctx.lineTo(-R * 0.2, w * 0.016); ctx.closePath(); ctx.fill();
    ctx.restore();
    circle(ctx, cx, c2, w * 0.03); ctx.fillStyle = lin(ctx, 0, c2 - w * 0.03, 0, c2 + w * 0.03, GOLD); ctx.fill();
    circle(ctx, cx, c2, w * 0.012); ctx.fillStyle = S.field[1]; ctx.fill();
    // Трон с кольцом
    ctx.lineWidth = L * 1.6; ctx.strokeStyle = ink(0.85);
    ctx.beginPath(); ctx.moveTo(cx - w * 0.09, c2 - R * 0.99); ctx.quadraticCurveTo(cx - w * 0.06, c2 - R - w * 0.07, cx, c2 - R - w * 0.08); ctx.quadraticCurveTo(cx + w * 0.06, c2 - R - w * 0.07, cx + w * 0.09, c2 - R * 0.99); ctx.stroke();
    circle(ctx, cx, c2 - R - w * 0.13, w * 0.045); ctx.stroke();
    ctx.restore();
  } else if (id === 'patron') {
    // Фон — тонкое «ячменное зерно» гильоше по всему полю
    if (!tiny) {
      ctx.strokeStyle = ink(0.1); ctx.lineWidth = L * 0.8; ctx.beginPath();
      for (let y = -w * 0.02; y < h + w * 0.04; y += w * 0.028) for (let x = 0; x <= w; x += w / 48) { const yy = y + sin((x / w) * TAU * 6) * w * 0.009; x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
      ctx.stroke();
    }
    // Розетка гильоше — переплетённые волны по кругу
    const Rb = w * 0.27, A = w * 0.055, N = tiny ? 6 : 16;
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = S.field[1]; circle(ctx, cx, cy, Rb + A + w * 0.03); ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
    ctx.lineWidth = L * (tiny ? 1.4 : 0.9); ctx.strokeStyle = ink(tiny ? 0.6 : 0.55);
    for (let j = 0; j < N; j++) {
      ctx.beginPath();
      for (let i = 0; i <= 240; i++) { const t = (i / 240) * TAU, r = Rb + A * sin(12 * t + (j / N) * TAU / 2) ; const x = cx + cos(t) * r, y = cy + sin(t) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
    ctx.restore();
    ctx.lineWidth = L * 1.5; ctx.strokeStyle = lin(ctx, cx - Rb, cy - Rb, cx + Rb, cy + Rb, GILDED);
    circle(ctx, cx, cy, Rb + A + w * 0.022); ctx.stroke();
    circle(ctx, cx, cy, Rb - A - w * 0.02); ctx.stroke();
    // Золотая печать с выгравированной звездой
    const pr = w * 0.145;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = w * 0.04; ctx.shadowOffsetY = w * 0.012;
    circle(ctx, cx, cy, pr); ctx.fillStyle = rad(ctx, cx - pr * 0.3, cy - pr * 0.4, 0, cx, cy, pr * 1.1, [[0, '#fff6d6'], [0.5, '#e8b24a'], [1, '#8a5614']]); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(70,38,6,0.85)'; ctx.lineWidth = L * 1.1;
    circle(ctx, cx, cy, pr * 0.86); ctx.stroke();
    ctx.fillStyle = 'rgba(70,38,6,0.85)'; ctx.beginPath(); sparklePath(ctx, cx, cy, pr * 0.66, 8, 0.38); ctx.fill();
    ctx.fillStyle = '#fff3cc'; ctx.beginPath(); sparklePath(ctx, cx, cy, pr * 0.3, 4, 0.3); ctx.fill();
    // Флероны сверху и снизу
    for (const sy of [-1, 1]) {
      const y = cy + sy * (h * 0.36);
      ctx.fillStyle = lin(ctx, 0, y - w * 0.06, 0, y + w * 0.06, GOLD);
      ctx.beginPath(); sparklePath(ctx, cx, y, w * 0.055, 4, 0.26); ctx.fill();
      if (!tiny) for (const sx of [-1, 1]) { circle(ctx, cx + sx * w * 0.1, y, w * 0.012); ctx.fill(); circle(ctx, cx + sx * w * 0.16, y, w * 0.008); ctx.fill(); }
    }
  } else if (id === 'comet') {
    const rx = w * 0.4, ry = w * 0.2, ang = -0.95, c = sqrt(rx * rx - ry * ry);
    const cxo = cx, cyo = cy;
    const toW = (x: number, y: number): [number, number] => [cxo + x * cos(ang) - y * sin(ang), cyo + x * sin(ang) + y * cos(ang)];
    const sun = toW(c, 0);
    ctx.save(); ctx.translate(cxo, cyo); ctx.rotate(ang);
    ctx.lineWidth = L * 1.2; ctx.strokeStyle = ink(0.6);
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.stroke();
    if (!tiny) { ctx.setLineDash([L * 1.5, L * 4]); ctx.strokeStyle = ink(0.35); ctx.beginPath(); ctx.ellipse(c * 0.55, 0, rx * 0.55, ry * 0.85, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
    ctx.restore();
    // Солнце в фокусе
    ctx.strokeStyle = ink(0.7); ctx.lineWidth = L; ctx.beginPath();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.moveTo(sun[0] + cos(a) * w * 0.05, sun[1] + sin(a) * w * 0.05); ctx.lineTo(sun[0] + cos(a) * w * (i % 2 ? 0.07 : 0.085), sun[1] + sin(a) * w * (i % 2 ? 0.07 : 0.085)); }
    ctx.stroke();
    circle(ctx, sun[0], sun[1], w * 0.036); ctx.fillStyle = lin(ctx, 0, sun[1] - w * 0.04, 0, sun[1] + w * 0.04, GOLD); ctx.fill();
    // Комета на орбите, хвост — от Солнца
    const t0 = 2.35, head = toW(rx * cos(t0), ry * sin(t0));
    let dx = head[0] - sun[0], dy = head[1] - sun[1]; const d = Math.hypot(dx, dy); dx /= d; dy /= d;
    const tl = w * 0.4;
    for (let i = -4; i <= 4; i++) {
      const a = i * 0.05, ex = dx * cos(a) - dy * sin(a), ey = dx * sin(a) + dy * cos(a);
      const g = lin(ctx, head[0], head[1], head[0] + ex * tl, head[1] + ey * tl, [[0, ink(0.8 - abs(i) * 0.12)], [1, ink(0)]]);
      ctx.strokeStyle = g; ctx.lineWidth = L * (tiny ? 1.4 : 1); ctx.beginPath(); ctx.moveTo(head[0], head[1]); ctx.lineTo(head[0] + ex * tl * (1 - abs(i) * 0.08), head[1] + ey * tl * (1 - abs(i) * 0.08)); ctx.stroke();
    }
    ctx.fillStyle = rad(ctx, head[0], head[1], 0, head[0], head[1], w * 0.09, [[0, rgba(INK, 0.5)], [1, rgba(INK, 0)]]); circle(ctx, head[0], head[1], w * 0.09); ctx.fill();
    ctx.fillStyle = lin(ctx, 0, head[1] - w * 0.05, 0, head[1] + w * 0.05, GOLD);
    ctx.beginPath(); sparklePath(ctx, head[0], head[1], w * (tiny ? 0.085 : 0.06), 4, 0.24); ctx.fill();
    if (!tiny) for (const [x, y, r] of [[0.2, 0.17, 1], [0.8, 0.14, 0.8], [0.84, 0.5, 1.2], [0.18, 0.62, 0.8], [0.7, 0.84, 1], [0.28, 0.86, 0.7], [0.55, 0.22, 0.6]] as Pt3[]) star(x * w, y * h, w * 0.007 * r, 0.8);
  } else if (id === 'aurora') {
    // Сцена — внутри рамки: горы и сияние не заходят на шкалу
    const inner = S.ruled ? w * 0.1 : w * 0.06;
    ctx.save();
    ctx.beginPath();
    ctx.rect(inner, inner, w - 2 * inner, h - 2 * inner);
    ctx.clip();
    // Занавес сияния — гравюрная штриховка
    const base = (x: number) => h * 0.64 + sin((x / w) * 5.2 + 0.6) * h * 0.05;
    const step = w * (tiny ? 0.04 : 0.02);
    for (let k = 0; k < 2; k++) {
      for (let x = w * 0.08; x <= w * 0.92; x += step * (k ? 1.6 : 1)) {
        const y0 = base(x) - k * h * 0.08, len = h * (0.2 + 0.08 * sin(x / w * 9 + k * 2)) * (k ? 0.8 : 1);
        ctx.strokeStyle = lin(ctx, x, y0, x, y0 - len, [[0, ink(k ? 0.45 : 0.75)], [1, ink(0)]]);
        ctx.lineWidth = L * (tiny ? 1.4 : 1); ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 - len); ctx.stroke();
      }
    }
    ctx.lineWidth = L * 1.2; ctx.strokeStyle = ink(0.7); ctx.beginPath();
    for (let x = w * 0.08; x <= w * 0.92; x += w / 60) { const y = base(x); x === w * 0.08 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
    // Горы — контур и линии рельефа
    const peaks: Pt[] = [[0, 0.83], [0.2, 0.75], [0.34, 0.8], [0.52, 0.69], [0.68, 0.79], [0.84, 0.73], [1, 0.8]];
    ctx.fillStyle = S.field[1]; ctx.beginPath(); ctx.moveTo(0, h); for (const [x, y] of peaks) ctx.lineTo(x * w, y * h); ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    ctx.lineWidth = L * 1.3; ctx.strokeStyle = ink(0.85); ctx.beginPath(); peaks.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h))); ctx.stroke();
    if (!tiny) {
      ctx.lineWidth = L * 0.8; ctx.strokeStyle = ink(0.3);
      for (let k = 1; k <= 1; k++) { ctx.beginPath(); peaks.forEach(([x, y], i) => { const yy = (y + k * 0.045) * h; i ? ctx.lineTo(x * w, yy) : ctx.moveTo(x * w, yy); }); ctx.stroke(); }
      for (const [x, y, r] of [[0.16, 0.14, 1], [0.38, 0.1, 0.7], [0.62, 0.16, 0.9], [0.84, 0.12, 0.7], [0.27, 0.27, 0.6], [0.78, 0.3, 0.6]] as Pt3[]) star(x * w, y * h, w * 0.007 * r, 0.85);
    }
    ctx.restore();
    ctx.fillStyle = lin(ctx, 0, h * 0.18, 0, h * 0.26, GOLD); ctx.beginPath(); sparklePath(ctx, cx, h * 0.21, w * (tiny ? 0.09 : 0.065), 4, 0.24); ctx.fill();
  }
  ctx.restore();
  neatline(ctx, w, h, S, tiny, L);
  gildedEdge(ctx, w, h);
}

// ═══ Вариант 3: «Ювелир» ════════════════════════════════════════════════════
// Бархат шкатулки, золотой рельеф с тенью и камни в оправах. Узор центрально-симметричный —
