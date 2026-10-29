import { chartIcon } from '@/art/sigil';
import { COMBO_IDS } from '@/core/types';
import { t } from '@/i18n';
import { canvasImg } from '@/ui/dom';

/** Иконки созвездий (CN.1, `?chartsheet`): все 11 крупно и в размерах игры. */
export function showChartSheet(root: HTMLElement): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  root.style.cssText = 'position:absolute;inset:0;overflow:auto;padding:14px 16px 24px;color:#eae6ff;pointer-events:auto;background:radial-gradient(120% 80% at 50% 0%, #191641, #0c0d2c 60%, #05061a)';
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:12px 6px;margin-bottom:12px';
  for (const combo of COMBO_IDS) {
    const cell = document.createElement('div');
    cell.style.cssText = 'display:grid;justify-items:center;gap:6px;text-align:center';
    const name = document.createElement('span');
    name.textContent = t(`combo.${combo}`);
    name.style.cssText = "font:700 11.5px/1.2 'Manrope Variable',Manrope,sans-serif;color:#a5a0cf";
    cell.append(canvasImg(chartIcon(combo, 64, dpr), 64), name);
    grid.append(cell);
  }
  // Размеры игры: 48 — Обсерватория и выбор, 40 — строки Справочника, 36 — Чудеса, 30 — вкладка
  const small = document.createElement('div');
  small.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;align-items:center';
  for (const size of [48, 40, 36, 30]) for (const combo of COMBO_IDS) small.append(canvasImg(chartIcon(combo, size, dpr), size));
  root.append(grid, small);
}
