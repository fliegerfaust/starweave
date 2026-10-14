import { glowDot, roundRect, sparklePath } from '@/art/glyphs';
import { renderNebula } from '@/art/nebula';

type Ctx = CanvasRenderingContext2D;

function rand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/**
 * Иконка приложения и аватар бота (`?icon`, `&rounded` — скруглённый квадрат для PWA).
 * Крупный простой силуэт — две карты и тёмная звезда, — чтобы читалось и в 32 px в списке
 * чатов. Аватар в Telegram круглый: всё главное — в центральном круге, фон — до краёв.
 * Playwright снимает квадрат нужного размера (`npm run store-assets`).
 */
export function showIcon(root: HTMLElement, rounded: boolean): void {
  const s = Math.min(window.innerWidth, window.innerHeight);
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width = s * dpr;
  canvas.height = s * dpr;
  canvas.style.cssText = `position:fixed;left:0;top:0;width:${s}px;height:${s}px`;
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
  root.append(canvas);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  if (rounded) {
    roundRect(ctx, 0, 0, s, s, s * 0.22);
    ctx.clip();
  }
  drawBackdrop(ctx, s, dpr);
  drawPair(ctx, s);
}

/** Глубокий фиолетовый к синему, тёплое сияние за картами, немного туманности и звёзд. */
function drawBackdrop(ctx: Ctx, s: number, dpr: number): void {
  const c = s / 2;
  const g = ctx.createRadialGradient(c, c * 0.9, 0, c, c, s * 0.75);
  g.addColorStop(0, '#5b34d6');
  g.addColorStop(0.45, '#2a1673');
  g.addColorStop(1, '#0c0a2a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(renderNebula(s, s, 47, undefined, dpr), 0, 0, s, s);
  const warm = ctx.createRadialGradient(c + s * 0.05, c, 0, c + s * 0.05, c, s * 0.42);
  warm.addColorStop(0, 'rgba(255,160,60,0.32)');
  warm.addColorStop(1, 'rgba(255,170,70,0)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, s, s);
  ctx.restore();
  const r = rand(5);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 24; i++) glowDot(ctx, r() * s, r() * s, s * (0.0015 + r() * 0.0025), 'rgba(225,220,255,0.8)');
  ctx.restore();
}

type Paint = { from: string; mid: string; to: string; rim: string; glow: string };
const GOLD: Paint = { from: '#ffe9a6', mid: '#f6b843', to: '#d4701c', rim: 'rgba(255,250,225,0.95)', glow: 'rgba(255,185,70,0.95)' };
const VIOLET: Paint = { from: '#a27cff', mid: '#6a3cf0', to: '#2f1490', rim: 'rgba(225,212,255,0.9)', glow: 'rgba(140,100,255,0.85)' };

/** Карта-силуэт: яркая заливка, светлый кант, внутренняя рамка, свечение. Рисует в повёрнутой системе. */
function flatCard(ctx: Ctx, w: number, paint: Paint): void {
  const h = w / 0.7;
  ctx.save();
  ctx.shadowColor = paint.glow;
  ctx.shadowBlur = w * 0.22;
  roundRect(ctx, -w / 2, -h / 2, w, h, w * 0.12);
  const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  g.addColorStop(0, paint.from);
  g.addColorStop(0.5, paint.mid);
  g.addColorStop(1, paint.to);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = w * 0.035;
  ctx.strokeStyle = paint.rim;
  ctx.stroke();
  // Внутренняя рамка — как у настоящей карты
  const inset = w * 0.08;
  roundRect(ctx, -w / 2 + inset, -h / 2 + inset, w - inset * 2, h - inset * 2, w * 0.07);
  ctx.lineWidth = w * 0.014;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.stroke();
  ctx.restore();
}

/** Глянец: светлая диагональная полоса по верхней половине карты. */
function gloss(ctx: Ctx, w: number): void {
  const h = w / 0.7;
  ctx.save();
  roundRect(ctx, -w / 2, -h / 2, w, h, w * 0.12);
  ctx.clip();
  const g = ctx.createLinearGradient(-w / 2, -h / 2, w * 0.1, h * 0.05);
  g.addColorStop(0, 'rgba(255,255,255,0.38)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.06)');
  g.addColorStop(0.46, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.restore();
}

/** Тёмная звезда с объёмом: градиент индиго → фиолетовый и белый блик сверху. */
function inkStar(ctx: Ctx, x: number, y: number, r: number): void {
  const g = ctx.createLinearGradient(x, y - r, x, y + r);
  g.addColorStop(0, '#4a2bb0');
  g.addColorStop(1, '#1d0d55');
  ctx.save();
  ctx.shadowColor = 'rgba(80,40,0,0.35)';
  ctx.shadowBlur = r * 0.15;
  ctx.shadowOffsetY = r * 0.05;
  ctx.fillStyle = g;
  ctx.beginPath();
  sparklePath(ctx, x, y, r, 4, 0.2);
  ctx.fill();
  ctx.restore();
}

/** Рубашка фиолетовой карты: маленькое созвездие светлыми точками и линиями. */
function cardBack(ctx: Ctx, w: number): void {
  // Только по левой части — правую закрывает золотая карта
  const pts = [[-0.24, -0.5], [-0.08, -0.3], [-0.28, -0.08], [-0.14, 0.16], [-0.3, 0.42]] as const;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = w * 0.025;
  ctx.strokeStyle = 'rgba(235,225,255,0.7)';
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(w * px, w * py) : ctx.moveTo(w * px, w * py)));
  ctx.stroke();
  for (const [px, py] of pts) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(w * px, w * py, w * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function sparkle(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.save();
  ctx.shadowColor = 'rgba(255,240,200,1)';
  ctx.shadowBlur = r * 1.2;
  ctx.fillStyle = '#fffaf0';
  ctx.beginPath();
  sparklePath(ctx, x, y, r, 4, 0.16);
  ctx.fill();
  ctx.restore();
}

/** Две карты внахлёст: фиолетовая рубашка сзади, золотая с тёмной звездой спереди. */
function drawPair(ctx: Ctx, s: number): void {
  const c = s / 2;
  const w = s * 0.4;
  ctx.save();
  ctx.translate(c - s * 0.13, c + s * 0.01);
  ctx.rotate(-0.32);
  flatCard(ctx, w, VIOLET);
  cardBack(ctx, w);
  ctx.restore();

  ctx.save();
  ctx.translate(c + s * 0.07, c + s * 0.02);
  ctx.rotate(0.1);
  flatCard(ctx, w, GOLD);
  gloss(ctx, w);
  inkStar(ctx, 0, 0, w * 0.4);
  // Узлы в углах — как ранги на настоящей карте
  inkStar(ctx, -w * 0.29, -w * 0.47, w * 0.09);
  inkStar(ctx, w * 0.29, w * 0.47, w * 0.09);
  ctx.restore();

  // Искры у верхнего угла золотой карты
  sparkle(ctx, c + s * 0.29, c - s * 0.27, s * 0.045);
  sparkle(ctx, c + s * 0.35, c - s * 0.15, s * 0.022);
  sparkle(ctx, c - s * 0.3, c + s * 0.3, s * 0.025);
}
