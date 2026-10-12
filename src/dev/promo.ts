import { cardFace } from '@/art/card';
import { glowDot } from '@/art/glyphs';
import { renderNebula } from '@/art/nebula';
import { DISPLAY_FONT, BODY_FONT } from '@/art/palette';
import type { Card } from '@/core/types';
import { t } from '@/i18n';

/**
 * Обложка для витрин (`?promo`): небо, веер карт с крестом созвездий, логотип.
 * Рисуется на весь экран — Playwright снимает её в нужном размере (800×470 и т.п.).
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
  ctx.drawImage(renderNebula(w, h, 31), 0, 0, w, h);

  const wide = w / h > 1.2;
  const cardW = Math.round(Math.min(h * 0.3, w * (wide ? 0.13 : 0.24)));
  const cards: Pick<Card, 'suit' | 'rank' | 'glyph'>[] = [
    { suit: 'star', rank: 9 },
    { suit: 'sun', rank: 9, glyph: 'radiant' },
    { suit: 'moon', rank: 9 },
    { suit: 'comet', rank: 7 },
    { suit: 'star', rank: 5 },
  ];
  // Веер карт справа (на широкой обложке) или снизу (на вертикальной)
  const cx = wide ? w * 0.75 : w / 2;
  const cy = wide ? h * 0.56 : h * 0.66;
  const pts: { x: number; y: number }[] = [];
  cards.forEach((card, i) => {
    const k = i - (cards.length - 1) / 2;
    const img = cardFace(card, cardW, dpr);
    const cw = cardW * 1.24;
    const ch = (cardW / 0.7) * 1.24;
    const x = cx + k * cardW * (wide ? 0.5 : 0.62);
    const y = cy + Math.abs(k) * cardW * 0.12;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(k * 0.12);
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 24;
    ctx.drawImage(img, -cw / 2, -ch / 2, cw, ch);
    ctx.restore();
    pts.push({ x, y: y - cardW * 0.25 });
  });
  // Линия созвездия над тремя девятками — как вспышка в игре
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [lw, a] of [[12, 0.12], [5, 0.35], [2, 1]] as const) {
    ctx.strokeStyle = `rgba(255,236,190,${a})`;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.beginPath();
    pts.slice(0, 3).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  }
  for (const p of pts.slice(0, 3)) glowDot(ctx, p.x, p.y, 4, 'rgba(255,236,190,0.95)');
  ctx.restore();

  // Логотип и слоган
  const lx = wide ? w * 0.26 : w / 2;
  const ly = wide ? h * 0.42 : h * 0.2;
  const size = Math.min(wide ? w * 0.062 : w * 0.13, h * 0.16);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `400 ${size}px ${DISPLAY_FONT}`;
  const grad = ctx.createLinearGradient(0, ly - size / 2, 0, ly + size / 2);
  grad.addColorStop(0, '#fff6dc');
  grad.addColorStop(0.6, '#f6c25b');
  grad.addColorStop(1, '#c98a2a');
  ctx.shadowColor = 'rgba(246,194,91,0.6)';
  ctx.shadowBlur = 30;
  ctx.fillStyle = grad;
  ctx.letterSpacing = `${size * 0.12}px`;
  ctx.fillText(t('game.title').toUpperCase(), lx, ly, wide ? w * 0.48 : w * 0.92);
  ctx.shadowBlur = 0;
  ctx.letterSpacing = `${size * 0.35}px`;
  ctx.font = `400 ${size * 0.28}px ${DISPLAY_FONT}`;
  ctx.fillStyle = '#c9c3f0';
  if (t('game.subtitle')) ctx.fillText(t('game.subtitle').toUpperCase(), lx, ly + size * 0.75);
  ctx.letterSpacing = '0px';
  ctx.font = `600 ${size * (wide ? 0.27 : 0.24)}px ${BODY_FONT}`;
  ctx.fillStyle = '#eae6ff';
  ctx.fillText(t('game.tagline'), lx, ly + size * 1.3);
}
