import { drawCover, drawDescription } from './brand';

/**
 * Обложка для витрин (`?promo`) и картинка описания бота (`?promo&desc`) — «Купол» (FP.9):
 * щель обсерватории с линией карт на золотой нити, справа название и печать. Рисуется на весь
 * экран — Playwright снимает в нужном размере (640×360, 800×470, 1024×500).
 */
export function showPromo(root: HTMLElement, description = false): void {
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
  if (description) drawDescription(ctx, w, h, dpr);
  else drawCover(ctx, w, h, dpr);
}
