// Иконка загрузочного экрана Telegram Mini App: SVG 512×512 ровно с одним <path>
// (требование @BotFather → Configure Splash Screen). Силуэт той же «пары карт», что и
// иконка (src/dev/icon.ts): видимая часть задней карты, передняя карта со звездой-вырезом
// и искры. Заливка «nonzero»: вырезы идут в обратную сторону обхода. Только команды
// M, L, C, Z — другие формат иконки Telegram не принимает.
// Запуск: node scripts/make-splash.mjs → store/telegram/splash.svg
import { mkdirSync, writeFileSync } from 'node:fs';

const S = 512;
const C = S / 2;
const K = 1.12; // крупнее, чем на аватаре: на загрузке нет фона-круга, поле — весь квадрат
const W = 0.4 * S * K;
const H = W / 0.7;
const R = W * 0.12;
const GAP = W * 0.05;

const rot = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const place = (pts, cx, cy, a) => pts.map((p) => { const [x, y] = rot(p, a); return [cx + x, cy + y]; });

/** Скруглённый прямоугольник многоугольником, по часовой (ось y вниз). */
function roundRect(w, h, r, seg = 10) {
  const pts = [];
  const corners = [[w / 2 - r, -h / 2 + r, -90], [w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 90], [-w / 2 + r, -h / 2 + r, 180]];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = ((start + (90 * i) / seg) * Math.PI) / 180;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  return pts;
}

/** Отсечение многоугольника полуплоскостью «слева от a→b» (Сазерленд — Ходжман). */
function clip(poly, a, b) {
  const side = ([x, y]) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const sp = side(p);
    const sq = side(q);
    if (sp >= 0) out.push(p);
    if (sp >= 0 !== sq >= 0) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

const f = (n) => Math.round(n * 10) / 10;
const poly = (pts) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;

/** Четырёхлучевая звезда как sparklePath: квадратичные дуги; reverse — обход против часовой. */
function star(x, y, r, waist = 0.2, reverse = false) {
  const tips = [];
  const ctrls = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
    const mid = a + Math.PI / 4;
    tips.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    ctrls.push([x + Math.cos(mid) * r * waist, y + Math.sin(mid) * r * waist]);
  }
  let d = `M${f(tips[0][0])} ${f(tips[0][1])}`;
  for (let k = 0; k < 4; k++) {
    const i = reverse ? (4 - k) % 4 : k; // откуда
    const j = reverse ? (i + 3) % 4 : (i + 1) % 4; // куда
    const c = reverse ? ctrls[j] : ctrls[i];
    // Кубическая кривая вместо квадратичной: Telegram хранит иконку в формате векторных
    // превью, а тот знает только M, L, C и Z (на Q BotFather отвечает «Unable to extract»)
    const [p0, p2] = [tips[i], tips[j]];
    const c1 = [p0[0] + ((c[0] - p0[0]) * 2) / 3, p0[1] + ((c[1] - p0[1]) * 2) / 3];
    const c2 = [p2[0] + ((c[0] - p2[0]) * 2) / 3, p2[1] + ((c[1] - p2[1]) * 2) / 3];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return `${d}Z`;
}

// Карты — как на аватаре, сдвиги масштабированы вокруг центра
const back = { x: C - 0.11 * S * K, y: C + 0.01 * S * K, a: -0.32 };
const front = { x: C + 0.07 * S * K, y: C + 0.02 * S * K, a: 0.1 };
const frontPts = place(roundRect(W, H, R), front.x, front.y, front.a);
const backPts = place(roundRect(W, H, R), back.x, back.y, back.a);

// Видимая часть задней карты: всё, что снаружи передней карты (с зазором), — по куску на
// каждую сторону; куски перекрываются в углах, при nonzero это просто заливка
const hull = place([[-W / 2 - GAP, -H / 2 - GAP], [W / 2 + GAP, -H / 2 - GAP], [W / 2 + GAP, H / 2 + GAP], [-W / 2 - GAP, H / 2 + GAP]], front.x, front.y, front.a);
const pieces = [];
for (let i = 0; i < 4; i++) {
  // Снаружи стороны hull[i]→hull[i+1] (hull по часовой — снаружи справа, т.е. «слева» от b→a)
  const piece = clip(backPts, hull[(i + 1) % 4], hull[i]);
  if (piece.length >= 3) pieces.push(poly(piece));
}

// Звезда-вырез и узлы в углах передней карты — в системе карты
const at = (dx, dy) => { const [x, y] = rot([dx, dy], front.a); return [front.x + x, front.y + y]; };
const [sx, sy] = at(0, 0);
const holes = [star(sx, sy, W * 0.4, 0.2, true)];
for (const [dx, dy] of [[-0.29, -0.47], [0.29, 0.47]]) {
  const [x, y] = at(W * dx, W * dy);
  holes.push(star(x, y, W * 0.09, 0.2, true));
}

// Искры у верхнего угла и слева внизу — как на аватаре
const sparks = [
  star(C + 0.31 * S, C - 0.31 * S, 0.05 * S, 0.16),
  star(C + 0.39 * S, C - 0.16 * S, 0.025 * S, 0.16),
  star(C - 0.36 * S, C + 0.34 * S, 0.028 * S, 0.16),
];

const d = [...pieces, poly(frontPts), ...holes, ...sparks].join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"><path d="${d}"/></svg>\n`;
mkdirSync('store/telegram', { recursive: true });
writeFileSync('store/telegram/splash.svg', svg);
console.log(`store/telegram/splash.svg — ${svg.length} байт`);
