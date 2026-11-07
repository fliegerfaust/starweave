import { keepPainted } from '@/engine/canvas-life';
import { roundRect } from './glyphs';

/**
 * Свет, нарисованный один раз. Радиальный градиент и `shadowBlur` видеочип считает заново при
 * каждом вызове: на слабом телефоне они одни съедали весь бюджет кадра (APK.11). Спрайт только
 * копируется, а яркость задаёт `globalAlpha`. Картинка та же.
 */

const STAR_SIZE = 64;
const stars = new Map<number, HTMLCanvasElement>();

/** Звезда с ореолом: белое ядро и тёплый свет, `mid` — яркость ореола у трети радиуса. */
export function starGlow(mid: number): HTMLCanvasElement {
  let sprite = stars.get(mid);
  if (sprite) return sprite;
  sprite = document.createElement('canvas');
  sprite.width = sprite.height = STAR_SIZE;
  const paint = (c: HTMLCanvasElement) => {
    const ctx = c.getContext('2d')!;
    const r = STAR_SIZE / 2;
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, 'rgba(255, 250, 235, 1)');
    g.addColorStop(0.3, `rgba(255, 220, 150, ${mid})`);
    g.addColorStop(1, 'rgba(255, 220, 150, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, STAR_SIZE, STAR_SIZE);
  };
  paint(sprite);
  keepPainted(sprite, paint);
  stars.set(mid, sprite);
  return sprite;
}

export interface Halo {
  image: HTMLCanvasElement;
  /** Сколько сверх размера фигуры занимает свет с каждой стороны, в пикселях экрана игры. */
  pad: number;
}

const halos = new Map<string, Halo>();

/** Свечение вокруг скруглённого прямоугольника; `draw` задаёт его контур и заливку. */
function halo(key: string, w: number, h: number, blur: number, dpr: number, draw: (ctx: CanvasRenderingContext2D) => void): Halo {
  const known = halos.get(key);
  if (known) return known;
  // Размытие в пикселях холста, а не в единицах с учётом масштаба: как у `shadowBlur` на сцене
  const pad = Math.ceil(blur / dpr) + 4;
  const image = document.createElement('canvas');
  image.width = Math.ceil((w + pad * 2) * dpr);
  image.height = Math.ceil((h + pad * 2) * dpr);
  const paint = (c: HTMLCanvasElement) => {
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, pad * dpr, pad * dpr);
    draw(ctx);
  };
  paint(image);
  keepPainted(image, paint);
  const made = { image, pad };
  halos.set(key, made);
  return made;
}

/** Свечение карты цветом масти или вспышки. Яркость — `globalAlpha` при рисовании. */
export function cardHalo(color: string, w: number, h: number, dpr: number): Halo {
  const blur = w * 0.35;
  return halo(`card|${color}|${Math.round(w)}|${dpr}`, w, h, blur, dpr, (ctx) => {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    roundRect(ctx, 0, 0, w, h, w * 0.09);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fill();
  });
}

/** Золотая рамка клетки, на которую указывает обучение. */
export function tutorialRing(w: number, h: number, r: number, dpr: number): Halo {
  const blur = 16;
  return halo(`ring|${Math.round(w)}|${Math.round(h)}|${dpr}`, w, h, blur, dpr, (ctx) => {
    ctx.shadowColor = '#f6c25b';
    ctx.shadowBlur = blur;
    roundRect(ctx, 0, 0, w, h, r);
    ctx.strokeStyle = 'rgb(255, 224, 150)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  });
}
