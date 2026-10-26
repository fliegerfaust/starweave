import { mythDef, mythEdges } from '@/core/content/myths';
import { dpr } from './dom';

/**
 * Рисунок мифа на небе 4×4 (MY.4): тусклая сетка звёзд, рёбра и звёзды фигуры. Найденный —
 * золотом, неизвестный — силуэтом: фигура видна, чтобы было что искать.
 */
export function mythFigure(id: string, size: number, found: boolean): HTMLCanvasElement {
  const def = mythDef(id);
  const r = dpr();
  const c = document.createElement('canvas');
  c.width = c.height = Math.round(size * r);
  c.style.width = c.style.height = `${size}px`;
  const ctx = c.getContext('2d')!;
  ctx.scale(r, r);
  const step = size / 4;
  // Фигура по центру сетки 4×4: узкие фигуры не прижаты к углу
  const rows = def.cells.map(([y]) => y);
  const cols = def.cells.map(([, x]) => x);
  const dy = (3 - Math.max(...rows) - Math.min(...rows)) / 2;
  const dx = (3 - Math.max(...cols) - Math.min(...cols)) / 2;
  const at = (i: number) => ({ x: (def.cells[i]![1] + dx + 0.5) * step, y: (def.cells[i]![0] + dy + 0.5) * step });
  ctx.fillStyle = 'rgb(200 196 240 / 0.22)';
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      ctx.beginPath();
      ctx.arc((x + 0.5) * step, (y + 0.5) * step, Math.max(1, step * 0.05), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const color = found ? '#f6c25b' : 'rgb(176 170 228 / 0.8)';
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.2, size * 0.022);
  ctx.lineCap = 'round';
  if (found) {
    ctx.shadowColor = 'rgb(246 194 91 / 0.6)';
    ctx.shadowBlur = size * 0.06;
  }
  ctx.beginPath();
  for (const [a, b] of mythEdges(def)) {
    const p = at(a);
    const q = at(b);
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
  }
  ctx.stroke();
  ctx.fillStyle = found ? '#ffe6a8' : 'rgb(200 194 244 / 0.9)';
  def.cells.forEach((_, i) => {
    const p = at(i);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(2, step * 0.13), 0, Math.PI * 2);
    ctx.fill();
  });
  return c;
}
