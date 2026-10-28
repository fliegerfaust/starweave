import { keepPainted } from '@/engine/canvas-life';
import { makeCanvas } from '@/engine/renderer';

/**
 * Миниатюра неба для примерочной. Настоящая туманность в размере образца — почти чёрная
 * пыль, поэтому здесь те же цвета крупными облаками по диагонали, как Млечный путь.
 */
export function skyMiniature(palette: [number, number, number][], w: number, h: number, scale: number): HTMLCanvasElement {
  const canvas = makeCanvas(w, h, scale);
  const draw = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    const bg = ctx.createLinearGradient(0, 0, w * 0.4, h);
    bg.addColorStop(0, '#0b0b2b');
    bg.addColorStop(1, '#030312');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    const spots: [number, number, number][] = [
      [0.25, 0.8, 0.55],
      [0.6, 0.45, 0.6],
      [0.85, 0.15, 0.45],
      [0.35, 0.3, 0.35],
    ];
    spots.forEach(([x, y, r], i) => {
      const [cr, cg, cb] = palette[i % palette.length]!;
      const rad = Math.max(w, h) * r;
      const g = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, rad);
      g.addColorStop(0, `rgba(${cr},${cg},${cb},0.55)`);
      g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    ctx.globalCompositeOperation = 'source-over';
    // Звёзды — по фиксированному узору, чтобы образец не мерцал при перерисовке
    for (let i = 0; i < 26; i++) {
      const x = ((i * 37) % 97) / 97;
      const y = ((i * 61) % 89) / 89;
      ctx.globalAlpha = 0.4 + ((i * 13) % 7) / 12;
      ctx.fillStyle = '#ffffff';
      const s = i % 5 === 0 ? 1.4 : 0.8;
      ctx.fillRect(x * w, y * h, s, s);
    }
    ctx.globalAlpha = 1;
  
  };
  draw(canvas);
  return keepPainted(canvas, draw);
}
