import { roundRect } from '@/art/glyphs';
import { drawSeal } from './brand';

/**
 * Иконка приложения и аватар бота (`?icon`, `&rounded` — скруглённый квадрат для PWA).
 * Знак «Печать» (FP.9): медальон «Эмали» с золотой звездой — тот же предмет, что Знамения в
 * игре. Крупный силуэт читается и в 32 px в списке чатов; аватар в Telegram круглый — всё
 * главное в центральном круге, фон до краёв. Playwright снимает квадрат нужного размера
 * (`npm run store-assets`).
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
  drawSeal(ctx, s);
}
