import { drawChartVariant, type ChartStyle } from '@/art/constellation-icons';
import { drawEnamelChart } from '@/art/enamel';
import { COMBO_IDS, type ComboId } from '@/core/types';
import { t } from '@/i18n';

/** Витрина CN.1 (`?chartsheet`, `=a|b|c|now` — один вариант): все созвездия в размерах игры. */
export function showChartSheet(root: HTMLElement, only: string | null): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  root.style.cssText = 'position:absolute;inset:0;overflow:auto;padding:14px 16px 24px;color:#eae6ff;pointer-events:auto;background:radial-gradient(120% 80% at 50% 0%, #191641, #0c0d2c 60%, #05061a)';
  const icon = (combo: ComboId, size: number, style: ChartStyle | 'now') => {
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(size * dpr);
    c.style.cssText = `width:${size}px;height:${size}px`;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    if (style === 'now') drawEnamelChart(ctx, combo, size);
    else drawChartVariant(ctx, combo, size, style);
    return c;
  };
  const styles = (['now', 'a', 'b', 'c'] as const).filter((s) => !only || s === only);
  for (const style of styles) {
    const sec = document.createElement('section');
    sec.style.cssText = 'display:grid;gap:10px;margin-bottom:22px';
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:12px 6px';
    for (const combo of COMBO_IDS) {
      const cell = document.createElement('div');
      cell.style.cssText = 'display:grid;justify-items:center;gap:6px;text-align:center';
      const name = document.createElement('span');
      name.textContent = t(`combo.${combo}`);
      name.style.cssText = "font:700 11.5px/1.2 'Manrope Variable',Manrope,sans-serif;color:#a5a0cf";
      cell.append(icon(combo, 64, style), name);
      grid.append(cell);
    }
    // Мелкие размеры игры: 48 — Обсерватория и выбор, 36 — Чудеса, 30 — вкладка Справочника
    const small = document.createElement('div');
    small.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;align-items:center';
    for (const size of [48, 36, 30]) for (const combo of COMBO_IDS) small.append(icon(combo, size, style));
    sec.append(grid, small);
    root.append(sec);
  }
}
