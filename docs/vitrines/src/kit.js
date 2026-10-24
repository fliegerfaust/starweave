/* Кит витрин 0.7 «Глубина». ART (имя → data URI) вшивает scripts/build-vitrines.mjs. */
const { PI, cos, sin, round, max, min, random, hypot } = Math;

/* ───────── Витрины и лестница открытия ───────── */
const VITRINES = [
  { id: 'index', title: 'План релиза', file: 'd8-index.html' },
  // Ревью архитектуры вышло отдельным релизом 0.6 «Фундамент»
  { id: 'arch', title: 'Ревью архитектуры', file: 'd8-arch.html', release: '0.6' },
  { id: 'gift', title: 'Дар ночи', file: 'd8-gift.html', step: 1 },
  { id: 'gift-ui', title: 'Дар ночи · экраны', file: 'd8-gift-ui.html', step: 1 },
  { id: 'gift-scene', title: 'Дар ночи · сцена', file: 'd8-gift-scene.html', step: 1 },
  { id: 'route', title: 'Развилки', file: 'd8-route.html', step: 2 },
  { id: 'route-screen', title: 'Развилки · экран', file: 'd8-route-screen.html', step: 2 },
  { id: 'route-wonders', title: 'Комета, Телескоп, путь', file: 'd8-route-wonders.html', step: 6 },
  { id: 'keywords', title: 'Ключевые слова', file: 'd8-keywords.html', step: 6 },
  { id: 'trophy', title: 'Трофеи Затмений', file: 'd8-trophy.html', step: 4 },
  { id: 'trophy-scene', title: 'Трофеи · сцена', file: 'd8-trophy-scene.html', step: 4 },
  { id: 'myths', title: 'Мифы неба', file: 'd8-myths.html', step: 5 },
  { id: 'prophecy', title: 'Пророчества', file: 'd8-prophecy.html', step: 7 },
  { id: 'resonance', title: 'Резонанс', file: 'd8-resonance.html', step: 8 },
  { id: 'legacy', title: 'Звезда памяти', file: 'd8-legacy.html', step: 9 },
  { id: 'patrons', title: 'Покровители', file: 'd8-patrons.html', step: 10 },
  { id: 'heart', title: 'Сердце неба', file: 'd8-heart.html', step: 11 },
  { id: 'skyvault', title: 'Небосвод', file: 'd8-skyvault.html', step: 0 },
];
const LADDER = [
  ['Первый свет', 'первый забег', 'игра как сейчас'],
  ['Дар ночи', 'закончить 1-й забег', 'звезда в колоду после ночи'],
  ['Развилки', 'дойти до 3-й главы', 'обычная или Яркая ночь'],
  ['Небесные тела', '3 Затмения', 'карты с правилом места'],
  ['Трофеи', '6 Затмений', 'приручить Затмение'],
  ['Мифы', '6 из 10 созвездий', 'фигуры на всём небе'],
  ['Комета и Телескоп', '5-я глава', 'события и улучшения'],
  ['Пророчества', '8 забегов', 'цель главы'],
  ['Резонанс', '25 Знамений', 'легендарные из пар'],
  ['Наследие', 'первая победа', 'звезда памяти'],
  ['Покровители', 'победа + отметки', 'персонажи'],
  ['Сердце неба', 'победа на ✦✦✦', '9-я глава за ключи'],
];

/* ───────── Данные игры (src/i18n/ru.ts) ───────── */
const SUITS = ['sun', 'moon', 'star', 'comet'];
const SUIT_RU = { sun: 'Солнце', moon: 'Луна', star: 'Звезда', comet: 'Комета' };
const SUIT_COL = { sun: '#f6c25b', moon: '#8fd0ff', star: '#c39bff', comet: '#ff7f62' };
const OMEN_RU = {
  sunWorship: ['Солнцепоклонник', 'Каждая карта Солнца: +3 к множителю'], moonTide: ['Лунный прилив', 'Каждая карта Луны: +25 света'],
  starlight: ['Звёздный свет', 'Каждая карта Звезды: +10 света и +2 множ.'], cometTrail: ['Хвост кометы', 'Каждая Комета: +свет, тройной ранг'],
  twinStars: ['Двойная звезда', 'Пара, Две пары или Зеркало: +8 множ.'], tripod: ['Треножник', 'Тройка или Квартет: +12 множ.'],
  ladder: ['Звёздная лестница', 'Любой стрит: +10 множ.'], monochrome: ['Монохром', 'Любой флеш: +10 множ.'],
  lowTide: ['Отлив', 'Карты ранга 1–3: +15 света'], highNoon: ['Зенит', 'Карты ранга 7–9: +2 множ.'],
  horizon: ['Горизонт', 'Вспыхнувший ряд: +6 множ.'], pillar: ['Столп', 'Вспыхнувший столбец: +6 множ.'],
  stardust: ['Звёздная пыль', 'Каждое созвездие: +4 множ.'], scatterbrain: ['Россыпь удачи', 'Россыпь: +50 света, +5 множ.'],
  binary: ['Двойная система', 'Ровно две масти: +7 множ.'], abacus: ['Счёты', '+3 хода каждую ночь'], pyre: ['Костёр', '+2 сжигания каждую ночь'],
  ember: ['Тлеющий уголь', '+3 множ. за каждое сжигание'], miser: ['Скупец', 'Предел процентов +5'],
  evenKeel: ['Чётность', 'Все ранги чётные: множ. ×2'], oddity: ['Нечётность', 'Все ранги нечётные: множ. ×2'],
  crossroads: ['Перекрёсток', 'Крест даёт ×3'], diagonalSight: ['Косой взгляд', 'Диагонали тоже вспыхивают'],
  cornerstone: ['Краеугольный камень', 'Карты в углах — дважды'], momentum: ['Разгон', '+2 множ. за вспышку подряд'],
  patientSky: ['Терпеливое небо', '+1 множ. за оставшийся ход'], nightOwl: ['Сова', 'Последний ход: ×3 к итогу'],
  prismLens: ['Линза', 'Флешу хватает на карту меньше'], shortcut: ['Короткий путь', 'В стрите можно пропуск'],
  wideSky: ['Широкое небо', '+1 карта в руке'], tithe: ['Десятина', 'От Стрита и выше: +1 золото'],
  constellationMap: ['Картограф', '+2 множ. за уровень Звёздных карт'], echoChamber: ['Отзвук', 'Первая вспышка — карты дважды'],
  hoarder: ['Скопидом', '+1 множ. за каждые 3 золота'], rainbow: ['Радуга', 'Все четыре масти: множ. ×2'],
  alchemist: ['Алхимик', 'После ночи карта получает глиф'], gambler: ['Игрок', 'Каждая семёрка: шанс 50% на ×1.5'],
  glassCannon: ['Стеклянная пушка', 'Множ. ×3, в руке на карту меньше'], supernovaSeed: ['Семя сверхновой', 'Любой стрит: множ. ×3'],
  collapsar: ['Коллапсар', '×0.05 множ. за каждое созвездие забега'], corona: ['Корона', 'В Затмение: множ. ×2.5'],
  doubleStar: ['Двойная звезда', 'Крест или больше: ×2 к итогу'],
};
const BOSS_RU = {
  void: ['Пустота', 'Две клетки неба запечатаны'], 'eclipse-sun': ['Затмение Солнца', 'Карты Солнца не дают света'],
  'eclipse-moon': ['Затмение Луны', 'Карты Луны не дают света'], 'eclipse-star': ['Затмение Звёзд', 'Карты Звезды не дают света'],
  'eclipse-comet': ['Затмение Кометы', 'Карты Кометы не дают света'], fog: ['Туман', 'Ранги в руке скрыты'],
  drought: ['Засуха', '−1 карта в руке'], shortNight: ['Короткая ночь', '−5 ходов'], silence: ['Безмолвие', 'Сжигать нельзя'],
  gravity: ['Тяготение', 'Ряды не вспыхивают — только столбцы'], judge: ['Судья', 'Россыпь не приносит очков'],
  wane: ['Ущерб', 'Множитель ×0.5'], hunger: ['Голод', 'Каждое созвездие стоит 1 золото'],
};
/* Небесные тела — новые карты релиза (GF.3) */
const BODIES = {
  polaris: { name: 'Полярная звезда', rule: 'Не гаснет: после вспышки остаётся на небе', col: '#eaf6ff' },
  meteor: { name: 'Метеор', rule: 'Выбивает в сброс самого слабого соседа — кроме карт своей линии', col: '#ff9a62' },
  pulsar: { name: 'Пульсар', rule: 'Линия вспыхнула рядом — +2 множ. всем линиям до конца ночи', col: '#9ff0ff' },
  twin: { name: 'Двойник', rule: 'Считается и своим рангом, и следующим', col: '#c9b2ff' },
  nebula: { name: 'Туманность', rule: 'Любой ранг: встаёт так, как выгоднее линии', col: '#ff9fd2' },
  blackhole: { name: 'Чёрная дыра', rule: 'Линия с ней — множ. ×2, а сама уходит из колоды', col: '#ffcf7a' },
};

/* ───────── DOM ───────── */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
const q = (sel, root = document) => root.querySelector(sel);
const qa = (sel, root = document) => [...root.querySelectorAll(sel)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

function svg(markup, w, hgt) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
  el.setAttribute('width', w);
  el.setAttribute('height', hgt);
  el.innerHTML = markup;
  return el;
}
const ICON = {
  back: '<path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  next: '<path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  grid: '<path d="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  replay: '<path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5v2.8h2.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
};
const icon = (name, size = 16) => svg(ICON[name], 16, 16);

/* ───────── Арт игры ───────── */
const CARD_PAD = 0.12;
/** Карта игры шириной w CSS px (картинка с отступом под свечение). */
function card(c, w = 64) {
  const name = `card-${c.suit}-${c.rank}${c.glyph ? '-' + c.glyph : ''}${c.body ? '-' + c.body : ''}`;
  const src = ART[name] || ART[`card-${c.suit}-${c.rank}`];
  const hgt = round(w / 0.7);
  const el = h('div', { class: 'k-card', style: { width: w + 'px', height: hgt + 'px' } });
  // Тело рисуется кодом игры, если его арт вшит в витрину (GF.4); иначе — эскизом кита
  if (c.body && !ART[name]) el.append(bodyCard(c, w));
  else {
    const pad = w * CARD_PAD;
    el.append(h('img', { src, alt: `${c.rank} ${SUIT_RU[c.suit]}`, style: { left: -pad + 'px', top: -pad + 'px', width: w + pad * 2 + 'px', height: hgt + pad * 2 + 'px' } }));
  }
  el.dataset.suit = c.suit;
  el.dataset.rank = c.rank;
  return el;
}
/** Знамение, Затмение, звёздная карта, ритуал — медальон игры. */
function sig(name, size = 44) {
  return h('img', { class: 'k-sig', src: ART[name], alt: '', width: size, height: size, style: { width: size + 'px', height: size + 'px' } });
}
const omen = (id, s) => sig(`omen-${id}`, s);
const boss = (id, s) => sig(`boss-${id}`, s);

/* ───────── Небесное тело: новая карта, нарисована кодом в духе карт игры ───────── */
function rr(ctx, x, y, w, hh, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + hh, r);
  ctx.arcTo(x + w, y + hh, x, y + hh, r);
  ctx.arcTo(x, y + hh, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function suitPath(ctx, suit, x, y, r) {
  ctx.beginPath();
  if (suit === 'sun') { ctx.arc(x, y, r * 0.55, 0, PI * 2); for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; ctx.moveTo(x + cos(a) * r * 0.72, y + sin(a) * r * 0.72); ctx.lineTo(x + cos(a) * r, y + sin(a) * r); } }
  else if (suit === 'moon') { ctx.arc(x, y, r * 0.85, PI * 0.3, PI * 1.7); ctx.arc(x + r * 0.42, y - r * 0.12, r * 0.68, PI * 1.55, PI * 0.45, true); ctx.closePath(); }
  else if (suit === 'star') { for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2 - PI / 2, rad = i % 2 ? r * 0.32 : r; ctx.lineTo(x + cos(a) * rad, y + sin(a) * rad); } ctx.closePath(); }
  else { ctx.arc(x + r * 0.3, y - r * 0.3, r * 0.45, 0, PI * 2); ctx.moveTo(x - r * 0.05, y + r * 0.05); ctx.lineTo(x - r, y + r); }
}
function drawBodyEmblem(ctx, id, x, y, r, t = 0) {
  const col = BODIES[id].col;
  ctx.save();
  if (id === 'polaris') {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.2);
    g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(0.25, 'rgba(200,230,255,.35)'); g.addColorStop(1, 'rgba(200,230,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.2, 0, PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    const pts = [[0, -1.25], [0.12, -0.12], [0.62, 0], [0.12, 0.12], [0, 1.25], [-0.12, 0.12], [-0.62, 0], [-0.12, -0.12]];
    pts.forEach(([a, b], i) => (i ? ctx.lineTo(x + a * r, y + b * r) : ctx.moveTo(x + a * r, y + b * r)));
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(234,246,255,.55)'; ctx.lineWidth = r * 0.04;
    ctx.beginPath(); ctx.arc(x, y, r * 0.9, 0, PI * 2); ctx.stroke();
  } else if (id === 'meteor') {
    const g = ctx.createLinearGradient(x - r, y + r, x + r * 0.4, y - r * 0.4);
    g.addColorStop(0, 'rgba(255,120,60,0)'); g.addColorStop(1, 'rgba(255,190,120,.95)');
    ctx.strokeStyle = g; ctx.lineCap = 'round';
    for (const [o, w] of [[0, 0.32], [0.28, 0.12], [-0.28, 0.12]]) { ctx.lineWidth = r * w; ctx.beginPath(); ctx.moveTo(x - r * 1.1 + o * r, y + r * 1.1 + o * r); ctx.lineTo(x + r * 0.3 + o * r * 0.3, y - r * 0.3 + o * r * 0.3); ctx.stroke(); }
    ctx.fillStyle = '#ffe2c4'; ctx.beginPath(); ctx.arc(x + r * 0.38, y - r * 0.38, r * 0.34, 0, PI * 2); ctx.fill();
    ctx.fillStyle = '#ff9a62'; ctx.beginPath(); ctx.arc(x + r * 0.46, y - r * 0.44, r * 0.14, 0, PI * 2); ctx.fill();
  } else if (id === 'pulsar') {
    for (let i = 0; i < 3; i++) {
      const k = ((t * 0.6 + i / 3) % 1);
      ctx.strokeStyle = `rgba(159,240,255,${0.75 * (1 - k)})`; ctx.lineWidth = r * 0.07;
      ctx.beginPath(); ctx.arc(x, y, r * (0.35 + k * 0.85), 0, PI * 2); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(220,250,255,.9)'; ctx.lineWidth = r * 0.08;
    ctx.beginPath(); ctx.moveTo(x - r * 0.25, y - r * 1.2); ctx.lineTo(x + r * 0.25, y + r * 1.2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r * 0.24, 0, PI * 2); ctx.fill();
  } else if (id === 'twin') {
    ctx.strokeStyle = 'rgba(201,178,255,.5)'; ctx.lineWidth = r * 0.05;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.42, -0.4, 0, PI * 2); ctx.stroke();
    const a = t * 1.4;
    for (const [s, rad, c] of [[0, 0.32, '#f2e9ff'], [PI, 0.22, '#c9b2ff']]) {
      const px = x + cos(a + s) * r * 0.8 * cos(0.4) - sin(a + s) * r * 0.34 * sin(-0.4);
      const py = y + cos(a + s) * r * 0.8 * sin(-0.4) + sin(a + s) * r * 0.34 * cos(0.4);
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(px, py, r * rad, 0, PI * 2); ctx.fill();
    }
  } else if (id === 'nebula') {
    for (const [dx, dy, rad, c] of [[-0.3, 0.1, 0.8, 'rgba(255,120,190,.45)'], [0.35, -0.2, 0.7, 'rgba(150,120,255,.45)'], [0.05, 0.35, 0.6, 'rgba(120,220,255,.35)']]) {
      const g = ctx.createRadialGradient(x + dx * r, y + dy * r, 0, x + dx * r, y + dy * r, rad * r);
      g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, rad * r, 0, PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#fff';
    for (const [dx, dy, rad] of [[-0.2, -0.1, 0.07], [0.3, 0.2, 0.05], [0.05, -0.45, 0.04], [-0.5, 0.35, 0.04]]) { ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, rad * r, 0, PI * 2); ctx.fill(); }
  } else if (id === 'blackhole') {
    ctx.translate(x, y); ctx.rotate(-0.35);
    const g = ctx.createLinearGradient(-r, 0, r, 0);
    g.addColorStop(0, 'rgba(255,170,80,.1)'); g.addColorStop(0.5, 'rgba(255,220,150,.95)'); g.addColorStop(1, 'rgba(255,170,80,.1)');
    ctx.strokeStyle = g; ctx.lineWidth = r * 0.18;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.05, r * 0.32, 0, 0, PI * 2); ctx.stroke();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,214,140,.9)'; ctx.lineWidth = r * 0.06; ctx.beginPath(); ctx.arc(0, 0, r * 0.53, 0, PI * 2); ctx.stroke();
    ctx.strokeStyle = g; ctx.lineWidth = r * 0.18; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.05, r * 0.32, 0, PI * 1.08, PI * 1.92); ctx.stroke();
  }
  ctx.restore();
  return col;
}
const animBodies = new Set();
function bodyCard(c, w) {
  const hgt = round(w / 0.7), pad = round(w * CARD_PAD), dpr = min(2, devicePixelRatio || 1);
  const cv = h('canvas', { style: { position: 'absolute', left: -pad + 'px', top: -pad + 'px', width: w + pad * 2 + 'px', height: hgt + pad * 2 + 'px' } });
  cv.width = (w + pad * 2) * dpr; cv.height = (hgt + pad * 2) * dpr;
  const draw = (t) => {
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w + pad * 2, hgt + pad * 2);
    ctx.translate(pad, pad);
    const r = w * 0.09, col = BODIES[c.body].col;
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = w * 0.12; ctx.shadowOffsetY = w * 0.04;
    rr(ctx, 0, 0, w, hgt, r);
    const f = ctx.createRadialGradient(w * 0.5, hgt * 0.62, 0, w * 0.5, hgt * 0.62, hgt * 0.75);
    f.addColorStop(0, '#2a2560'); f.addColorStop(0.6, '#120f36'); f.addColorStop(1, '#07061c');
    ctx.fillStyle = f; ctx.fill();
    ctx.shadowColor = 'transparent';
    // Пыль
    for (let i = 0; i < 14; i++) { const sx = ((i * 37) % 97) / 97, sy = ((i * 61) % 89) / 89; ctx.fillStyle = `rgba(255,255,255,${0.15 + (i % 3) * 0.12})`; ctx.fillRect(sx * w, sy * hgt, 1, 1); }
    // Жемчужная двойная кромка — отличает тела от глифов (у глифов цветная)
    ctx.lineWidth = max(1.5, w * 0.035); ctx.strokeStyle = col; ctx.globalAlpha = 0.9; rr(ctx, 0, 0, w, hgt, r); ctx.stroke();
    ctx.lineWidth = 1; ctx.globalAlpha = 0.35; rr(ctx, w * 0.07, w * 0.07, w * 0.86, hgt - w * 0.14, r * 0.6); ctx.stroke(); ctx.globalAlpha = 1;
    // Ранг
    ctx.fillStyle = '#fff8ea'; ctx.font = `800 ${round(w * 0.36)}px Manrope, system-ui, sans-serif`; ctx.textBaseline = 'top';
    ctx.fillText(c.body === 'nebula' ? '?' : String(c.rank), w * 0.13, w * 0.12);
    if (c.body === 'twin') { ctx.font = `800 ${round(w * 0.17)}px Manrope, system-ui, sans-serif`; ctx.fillStyle = '#c9b2ff'; ctx.fillText('+' + (c.rank + 1), w * 0.15, w * 0.5); }
    // Масть — маленьким знаком
    ctx.fillStyle = SUIT_COL[c.suit]; ctx.strokeStyle = SUIT_COL[c.suit]; ctx.lineWidth = w * 0.03; ctx.lineCap = 'round';
    suitPath(ctx, c.suit, w * 0.8, w * 0.22, w * 0.1);
    c.suit === 'sun' || c.suit === 'comet' ? (ctx.fill(), ctx.stroke()) : ctx.fill();
    drawBodyEmblem(ctx, c.body, w * 0.52, hgt * 0.64, w * 0.26, t);
  };
  draw(0);
  if (c.body === 'pulsar' || c.body === 'twin') animBodies.add({ cv, draw });
  return cv;
}
(function tickBodies() {
  if (!REDUCED) {
    const t = performance.now() / 1000;
    for (const b of animBodies) b.cv.isConnected ? b.draw(t) : animBodies.delete(b);
  }
  requestAnimationFrame(tickBodies);
})();

/* ───────── Живое небо сцены ───────── */
function sky(stage, nebula = 1) {
  stage.classList.add('stage');
  const neb = h('div', { class: 'neb', style: { backgroundImage: `url(${ART['nebula-' + nebula] || ''})` } });
  const cv = h('canvas', { class: 'stars' });
  stage.prepend(neb, cv);
  const stars = Array.from({ length: 90 }, () => ({ x: random(), y: random(), r: random() < 0.12 ? 1.3 : 0.7, p: random() * 6, s: 0.4 + random() }));
  const draw = (t) => {
    const w = stage.clientWidth, hh = stage.clientHeight, dpr = min(2, devicePixelRatio || 1);
    if (cv.width !== w * dpr || cv.height !== hh * dpr) { cv.width = w * dpr; cv.height = hh * dpr; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hh);
    for (const s of stars) {
      const a = 0.35 + 0.45 * (0.5 + 0.5 * sin(t * s.s + s.p));
      ctx.fillStyle = `rgba(234,230,255,${a})`;
      ctx.beginPath(); ctx.arc(s.x * w, s.y * hh, s.r, 0, PI * 2); ctx.fill();
    }
  };
  const loop = () => { draw(REDUCED ? 0 : performance.now() / 1000); if (!REDUCED) requestAnimationFrame(loop); };
  loop();
  new ResizeObserver(() => draw(performance.now() / 1000)).observe(stage);
  return stage;
}

/* ───────── Лента события поверх сцены («Новое созвездие») ───────── */
async function ribbon(stage, title, sub, ms = 1900) {
  let layer = q('.toast-layer', stage);
  if (!layer) stage.append((layer = h('div', { class: 'toast-layer' })));
  const r = h('div', { class: 'ribbon pop' }, h('b', {}, title), sub ? h('small', {}, sub) : null);
  layer.replaceChildren(r);
  await wait(ms);
  r.style.opacity = '0';
  await wait(500);
  r.remove();
}
/** Число набегает от a до b. */
function countUp(el, a, b, ms = 700, fmt = (n) => n.toLocaleString('ru-RU')) {
  const t0 = performance.now();
  return new Promise((res) => {
    const step = () => {
      const k = min(1, (performance.now() - t0) / ms), e = 1 - (1 - k) ** 3;
      el.textContent = fmt(round(a + (b - a) * e));
      k < 1 ? requestAnimationFrame(step) : res();
    };
    REDUCED ? ((el.textContent = fmt(b)), res()) : step();
  });
}

/* ───────── Каркас витрины ───────── */
function shell({ id, lead }) {
  const i = VITRINES.findIndex((v) => v.id === id);
  const v = VITRINES[i];
  const prev = VITRINES[(i - 1 + VITRINES.length) % VITRINES.length];
  const next = VITRINES[(i + 1) % VITRINES.length];
  const nav = h('nav', { class: 'vt-nav' },
    id === 'index' ? h('span', { class: 'pg' }, 'Релиз 0.7 «Глубина»') : h('a', { href: 'd8-index.html' }, icon('grid'), 'План релиза'),
    h('span', { class: 'sp' }),
    h('a', { href: prev.file, 'aria-label': 'Предыдущая' }, icon('back')),
    h('span', { class: 'pg num' }, `${i + 1} / ${VITRINES.length}`),
    h('a', { href: next.file, 'aria-label': 'Следующая' }, icon('next')));
  const top = h('header', { class: 'top' }, h('h1', {}, v.title), h('div', { class: 'sill' }), lead ? h('p', { html: lead }) : null);
  const wrap = q('.wrap') || document.body.appendChild(h('div', { class: 'wrap' }));
  wrap.prepend(nav, top);
  document.title = `${v.title} · Starweave ${v.release ?? '0.7'}`;
  return v;
}
/** Полоса «где на лестнице открытия». */
function ladder(el, step) {
  const row = h('div', { class: 'ladder' });
  LADDER.forEach(([name], i) => row.append(h('div', { class: 'st' + (i < step ? ' past' : i === step ? ' here' : '') }, h('i'), h('small', {}, name))));
  const [name, when, what] = LADDER[step];
  el.append(row, h('p', { class: 'ladder-note', html: step ? `Ступень ${step} из 11 · <b>${name}</b>: ${what}. Открывается — <b>${when}</b>.` : `<b>${name}</b> — первый забег: ${what}. Дальше по ступени за дело игрока.` }));
}
/** Блок «суть»: строки подпись — текст и задачи эпика. */
function facts(el, rows, tasks) {
  el.append(h('div', { class: 'facts' }, rows.map(([k, v]) => h('div', { class: 'fact' }, h('span', {}, k), h('div', { html: v })))));
  if (tasks) el.append(h('h2', {}, 'Задачи'), h('ul', { class: 'tasks' }, tasks.map(([c, t]) => h('li', {}, h('code', {}, c), h('span', { html: t })))));
}

/* ───────── Сид для повторяемых раскладов ───────── */
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const shuffle = (a, r = random) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
