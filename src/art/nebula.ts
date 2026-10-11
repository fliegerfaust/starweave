import { createRng, random } from '@/core/rng';
import { makeCanvas } from '@/engine/renderer';

/**
 * Статичный слой неба: градиент ночи, облака туманности, Млечный путь и виньетка.
 * Рисуется один раз на размер экрана в половинном разрешении — он мягкий, и
 * чёткость ему не нужна.
 */
export function renderNebula(width: number, height: number, seed: number, palette: [number, number, number][] = DEFAULT_NEBULA): HTMLCanvasElement {
  const scale = 0.5;
  const canvas = makeCanvas(width, height, scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  const rng = createRng(seed);

  const bg = ctx.createLinearGradient(0, 0, width * 0.3, height);
  bg.addColorStop(0, '#0b0b2b');
  bg.addColorStop(0.55, '#070720');
  bg.addColorStop(1, '#030312');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = 'lighter';
  const diag = Math.hypot(width, height);
  for (let i = 0; i < 14; i++) {
    const [r, g, b] = palette[i % palette.length]!;
    // Облака тяготеют к диагональной полосе — как Млечный путь.
    const t = random(rng);
    const x = width * (0.1 + t * 0.8) + (random(rng) - 0.5) * width * 0.4;
    const y = height * (0.9 - t * 0.8) + (random(rng) - 0.5) * height * 0.3;
    const rad = diag * (0.12 + random(rng) * 0.22);
    const a = 0.05 + random(rng) * 0.08;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `rgba(${r},${g},${b},${a})`);
    grad.addColorStop(0.5, `rgba(${r},${g},${b},${a * 0.4})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // Пыль Млечного пути
  for (let i = 0; i < 1400; i++) {
    const t = random(rng);
    const spread = (random(rng) + random(rng) + random(rng) - 1.5) * 0.22;
    const x = width * (t + spread * 0.6);
    const y = height * (1 - t + spread);
    const a = 0.08 + random(rng) * 0.25;
    ctx.fillStyle = `rgba(220,215,255,${a})`;
    ctx.fillRect(x, y, 1.2, 1.2);
  }

  ctx.globalCompositeOperation = 'source-over';
  const vig = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.3, width / 2, height / 2, diag * 0.6);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,8,0.65)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

export const DEFAULT_NEBULA: [number, number, number][] = [
  [110, 70, 220],
  [40, 110, 210],
  [200, 60, 160],
  [40, 170, 190],
  [90, 50, 170],
];

/** Палитры туманностей по созвездиям — каждое созвездие узнаётся по цвету неба. */
export const ANTE_NEBULAE: [number, number, number][][] = [
  DEFAULT_NEBULA,
  [[40, 110, 210], [30, 170, 160], [80, 60, 200]],
  [[200, 60, 160], [120, 50, 200], [220, 100, 80]],
  [[40, 170, 190], [60, 80, 200], [120, 200, 150]],
  [[220, 120, 60], [180, 50, 90], [110, 60, 180]],
  [[60, 60, 200], [160, 60, 220], [40, 150, 220]],
  [[200, 50, 70], [120, 40, 140], [230, 140, 60]],
  [[230, 200, 120], [160, 90, 230], [60, 160, 230]],
];
