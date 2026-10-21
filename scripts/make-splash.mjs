// Иконка загрузочного экрана Telegram Mini App: SVG 512×512 ровно с одним <path>
// (требование @BotFather → Configure Splash Screen). Силуэт знака «Печать» (src/dev/brand.ts,
// FP.9): кольцо оправы, звезда-корона на нём, крупная звезда в центре и две малые. Заливка
// «nonzero»: внутренний край кольца идёт в обратную сторону обхода. Только команды
// M, L, C, Z — другие формат иконки Telegram не принимает.
// Запуск: node scripts/make-splash.mjs → store/telegram/splash.svg
import { mkdirSync, writeFileSync } from 'node:fs';

const S = 512;
const C = S / 2;
const f = (n) => Math.round(n * 10) / 10;

/** Окружность четырьмя кубическими кривыми; reverse — обход против часовой (вырез). */
function ring(x, y, r, reverse = false) {
  const k = 0.5523 * r;
  const p = reverse
    ? [[x, y - r], [x - r, y], [x, y + r], [x + r, y]]
    : [[x, y - r], [x + r, y], [x, y + r], [x - r, y]];
  let d = `M${f(p[0][0])} ${f(p[0][1])}`;
  for (let i = 0; i < 4; i++) {
    const a = p[i];
    const b = p[(i + 1) % 4];
    // Касательные: от точки на окружности — перпендикулярно радиусу
    const ta = [-(a[1] - y), a[0] - x].map((v) => (v / r) * k * (reverse ? -1 : 1));
    const tb = [-(b[1] - y), b[0] - x].map((v) => (v / r) * k * (reverse ? -1 : 1));
    d += `C${f(a[0] + ta[0])} ${f(a[1] + ta[1])} ${f(b[0] - tb[0])} ${f(b[1] - tb[1])} ${f(b[0])} ${f(b[1])}`;
  }
  return `${d}Z`;
}

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

// Медальон крупнее, чем на аватаре: на загрузке нет фона — поле весь квадрат
const R = 0.46 * S;
const parts = [
  ring(C, C, R),
  ring(C, C, R * 0.84, true),
  // Звезда-корона на оправе сверху
  star(C, C - R * 0.92, R * 0.15, 0.3),
  // Звезда «Печати» и две малые, как в Знамении «Звёздный свет»
  star(C, C, R * 0.6, 0.27),
  star(C + R * 0.4, C - R * 0.4, R * 0.13, 0.3),
  star(C - R * 0.39, C + R * 0.38, R * 0.09, 0.3),
];

const d = parts.join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"><path d="${d}"/></svg>\n`;
mkdirSync('store/telegram', { recursive: true });
writeFileSync('store/telegram/splash.svg', svg);
console.log(`store/telegram/splash.svg — ${svg.length} байт`);
