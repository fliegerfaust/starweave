import { cardFace } from '@/art/card';
import { glowDot, roundRect, sparklePath } from '@/art/glyphs';
import { renderNebula } from '@/art/nebula';
import { DISPLAY_FONT, BODY_FONT } from '@/art/palette';
import type { Card } from '@/core/types';
import { t } from '@/i18n';

type Ctx = CanvasRenderingContext2D;
type Face = Pick<Card, 'suit' | 'rank' | 'glyph'>;

/** Детерминированный «случай» — обложка одинакова при каждой генерации. */
function rand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/**
 * Обложка для витрин (`?promo`). В центре — главный момент игры: крест. Ряд из трёх девяток
 * (Тройка) и столбец солнц (Флеш) пересекаются на одной карте, обе линии вспыхивают, ×2.
 * Слева (или сверху на вертикальной обложке) — название нашим шрифтом и слоган.
 * Рисуется на весь экран — Playwright снимает в нужном размере (800×470, 1024×500, 640×360).
 */
export function showPromo(root: HTMLElement): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.cssText = `position:fixed;inset:0;width:${w}px;height:${h}px`;
  root.append(canvas);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const wide = w / h > 1.2;
  // Крест: справа на широкой обложке, снизу — на вертикальной
  const cx = wide ? w * 0.72 : w / 2;
  const cy = wide ? h * 0.52 : h * 0.62;
  const cardW = Math.round(wide ? Math.min(h * 0.205, w * 0.11) : Math.min(w * 0.2, h * 0.11));
  const cardH = cardW / 0.7;

  drawSky(ctx, w, h, cx, cy, dpr);
  drawCross(ctx, cx, cy, cardW, cardH, dpr);
  drawSparkles(ctx, w, h, cx, cy, cardW);
  drawTitle(ctx, w, h, wide);
}

/** Небо: туманность, тёплое сияние за крестом и виньетка, уводящая взгляд к центру. */
function drawSky(ctx: Ctx, w: number, h: number, cx: number, cy: number, dpr: number): void {
  ctx.drawImage(renderNebula(w, h, 31, undefined, dpr), 0, 0, w, h);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const r = Math.max(w, h);
  const halo = (x: number, y: number, rad: number, rgb: string, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
  halo(cx, cy, r * 0.42, '246,170,70', 0.32);
  halo(cx - r * 0.12, cy + r * 0.05, r * 0.5, '140,90,255', 0.22);
  halo(w * 0.18, h * 0.3, r * 0.45, '60,120,255', 0.14);
  ctx.restore();
  const vig = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.65);
  vig.addColorStop(0, 'rgba(0,0,10,0)');
  vig.addColorStop(1, 'rgba(0,0,10,0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}

function drawCard(ctx: Ctx, face: Face, x: number, y: number, cardW: number, dpr: number): void {
  const img = cardFace(face, cardW, dpr);
  const pad = Math.ceil(cardW * 0.12);
  const iw = cardW + pad * 2;
  const ih = Math.round(cardW / 0.7) + pad * 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = cardW * 0.25;
  ctx.shadowOffsetY = cardW * 0.06;
  ctx.drawImage(img, x - iw / 2, y - ih / 2, iw, ih);
  ctx.restore();
}

/** Светящаяся линия созвездия: широкий мягкий слой, средний и яркая сердцевина. */
function glowLine(ctx: Ctx, from: { x: number; y: number }, to: { x: number; y: number }, rgb: string, width: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const [k, a] of [[4.5, 0.07], [2.2, 0.2], [1, 0.55], [0.4, 0.95]] as const) {
    ctx.strokeStyle = `rgba(${rgb},${a})`;
    ctx.lineWidth = width * k;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCross(ctx: Ctx, cx: number, cy: number, cardW: number, cardH: number, dpr: number): void {
  const dx = cardW * 1.12;
  const dy = cardH * 1.06;
  const row = [
    { face: { suit: 'star', rank: 9 } as Face, x: cx - dx, y: cy },
    { face: { suit: 'moon', rank: 9 } as Face, x: cx + dx, y: cy },
  ];
  const col = [
    { face: { suit: 'sun', rank: 7 } as Face, x: cx, y: cy - dy },
    { face: { suit: 'sun', rank: 3 } as Face, x: cx, y: cy + dy },
  ];

  // Лучи вспышки за центральной картой
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(cx, cy);
  const rays = 18;
  const len = Math.max(dx, dy) * 2;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + 0.13;
    const spread = i % 2 ? 0.05 : 0.09;
    const g = ctx.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
    g.addColorStop(0, `rgba(255,214,140,${i % 2 ? 0.12 : 0.2})`);
    g.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a - spread) * len, Math.sin(a - spread) * len);
    ctx.lineTo(Math.cos(a + spread) * len, Math.sin(a + spread) * len);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  for (const c of [...row, ...col]) drawCard(ctx, c.face, c.x, c.y, cardW, dpr);

  // Обе линии вспыхивают через крест: ряд (Тройка) — сиреневым, столбец (Флеш) — золотом
  const lineW = cardW * 0.035;
  glowLine(ctx, { x: cx - dx * 1.45, y: cy }, { x: cx + dx * 1.45, y: cy }, '190,170,255', lineW);
  glowLine(ctx, { x: cx, y: cy - dy * 1.4 }, { x: cx, y: cy + dy * 1.4 }, '255,214,130', lineW);

  // Центральная карта — поверх линий, с золотым ореолом
  const big = cardW * 1.08;
  ctx.save();
  ctx.shadowColor = 'rgba(255,200,110,0.95)';
  ctx.shadowBlur = cardW * 0.6;
  roundRect(ctx, cx - big / 2, cy - big / 1.4, big, big / 0.7, big * 0.09);
  ctx.fillStyle = 'rgba(255,220,150,0.35)';
  ctx.fill();
  ctx.restore();
  drawCard(ctx, { suit: 'sun', rank: 9, glyph: 'radiant' }, cx, cy, big, dpr);

  // Узлы созвездий в центрах карт
  for (const c of row) glowDot(ctx, c.x, c.y, cardW * 0.05, 'rgba(200,180,255,0.9)');
  for (const c of col) glowDot(ctx, c.x, c.y, cardW * 0.05, 'rgba(255,214,130,0.9)');

  // Метка «×2» — как во вспышке креста в игре
  const fs = cardW * 0.42;
  ctx.save();
  ctx.font = `800 ${fs}px ${BODY_FONT}`;
  const pw = ctx.measureText('×2').width + fs * 0.9;
  const ph = fs * 1.35;
  // В свободном углу над рядом, справа от верхней карты — не закрывает ни одного ранга
  ctx.translate(cx + cardW / 2 + pw * 0.62, cy - cardH / 2 - ph * 0.62);
  ctx.rotate(-0.12);
  ctx.shadowColor = 'rgba(255,60,120,0.85)';
  ctx.shadowBlur = fs * 0.9;
  roundRect(ctx, -pw / 2, -ph / 2, pw, ph, ph / 2);
  const g = ctx.createLinearGradient(0, -ph / 2, 0, ph / 2);
  g.addColorStop(0, '#ff7aa8');
  g.addColorStop(1, '#e8336f');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = Math.max(1, fs * 0.06);
  ctx.strokeStyle = 'rgba(255,220,235,0.9)';
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('×2', 0, fs * 0.04);
  ctx.restore();
}

/** Искры вокруг креста и редкие звёзды по небу. */
function drawSparkles(ctx: Ctx, w: number, h: number, cx: number, cy: number, cardW: number): void {
  const r = rand(7);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2;
    const d = cardW * (1.2 + r() * 2.6);
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d * 0.85;
    const s = cardW * (0.03 + r() * 0.07);
    const warm = r() < 0.5;
    if (x < 0 || x > w || y < 0 || y > h) continue;
    ctx.fillStyle = warm ? 'rgba(255,226,170,0.9)' : 'rgba(210,200,255,0.9)';
    ctx.beginPath();
    sparklePath(ctx, x, y, s, 4, 0.22);
    ctx.fill();
  }
  for (let i = 0; i < 40; i++) glowDot(ctx, r() * w, r() * h, 0.6 + r() * 1.2, 'rgba(220,215,255,0.7)');
  ctx.restore();
}

/** Название без сжатия букв: кегль подбирается под ширину, по-русски — в две строки. */
function drawTitle(ctx: Ctx, w: number, h: number, wide: boolean): void {
  const lines = t('game.title').toUpperCase().split(' ');
  const blockW = wide ? w * 0.44 : w * 0.86;
  const lx = wide ? w * 0.25 : w / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  let size = Math.min(wide ? h * 0.15 : w * 0.16, h * 0.15);
  const widest = () => {
    ctx.font = `400 ${size}px ${DISPLAY_FONT}`;
    ctx.letterSpacing = `${size * 0.14}px`; // как у логотипа в меню
    return Math.max(...lines.map((l) => ctx.measureText(l).width));
  };
  while (widest() > blockW && size > 10) size *= 0.95;
  const lineH = size * 1.02;
  const tagSize = Math.max(11, size * 0.27);
  const blockH = lines.length * lineH + tagSize * 2.4;
  const top = wide ? h / 2 - blockH / 2 + size * 0.85 : h * 0.07 + size;

  lines.forEach((line, i) => {
    const y = top + i * lineH;
    const g = ctx.createLinearGradient(0, y - size * 0.8, 0, y + size * 0.1);
    // Те же цвета и свечение, что у логотипа в меню (.logo-main)
    g.addColorStop(0, '#fff6dc');
    g.addColorStop(0.6, '#f6c25b');
    g.addColorStop(1, '#c98a2a');
    // Свечение отдельным слоем, буквы — чётко поверх
    ctx.save();
    ctx.shadowColor = 'rgba(246,194,91,0.55)';
    ctx.shadowBlur = size * 0.35;
    // letterSpacing добавляет интервал и после последней буквы — сдвигаем на половину, как padding-left у логотипа
    const x = lx + size * 0.07;
    ctx.fillStyle = g;
    ctx.fillText(line, x, y);
    ctx.restore();
    ctx.fillStyle = g;
    ctx.fillText(line, x, y);
  });

  // Тонкий орнамент и слоган
  const oy = top + (lines.length - 1) * lineH + size * 0.42;
  const ow = Math.min(blockW * 0.6, size * 3.2);
  const og = ctx.createLinearGradient(lx - ow / 2, 0, lx + ow / 2, 0);
  og.addColorStop(0, 'rgba(246,194,91,0)');
  og.addColorStop(0.5, 'rgba(246,194,91,0.9)');
  og.addColorStop(1, 'rgba(246,194,91,0)');
  ctx.fillStyle = og;
  ctx.fillRect(lx - ow / 2, oy, ow, Math.max(1, size * 0.025));
  ctx.fillStyle = '#ffe3a6';
  ctx.beginPath();
  sparklePath(ctx, lx, oy, size * 0.09, 4, 0.25);
  ctx.fill();

  ctx.letterSpacing = '0px';
  ctx.font = `600 ${tagSize}px ${BODY_FONT}`;
  ctx.fillStyle = '#efeaff';
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 8;
  ctx.fillText(t('game.tagline'), lx, oy + tagSize * 1.9);
  ctx.restore();
}
