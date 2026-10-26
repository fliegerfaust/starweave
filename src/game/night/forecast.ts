import { roundRect } from '@/art/glyphs';
import { SUIT_COLORS, rgba } from '@/art/palette';
import { mythDef, mythEdges } from '@/core/content/myths';
import { buildLines, closingLines } from '@/core/grid';
import { nearMyths } from '@/core/myths';
import { mythHintLayer, type MythHintState } from './figures';
import { t } from '@/i18n';
import { previewPlacement, type PlacementPreview } from './preview';
import type { CellState, NightScene } from './scene';

/** Подписи прогноза в клетке: кегль, ширина стрелки и строки с замеренной шириной. */
interface ForecastLayout {
  size: number;
  aw: number;
  rows: { text: string; dir: 'row' | 'col' | 'diag' | null; width: number }[];
}

/**
 * Прогноз на небе: какие клетки закроют линию, что там соберётся (подписи созвездий и метка
 * креста), что вспыхнет под выбранной картой. Считает настоящим `placeCard` на копии забега
 * (`preview.ts`) и рисует подписи в клетке.
 */
export class Forecast {
  /** Без подписей прогноза и меток «×2» на небе — ролик-загадка (`?demo=puzzle`). */
  off = false;
  /** Что вспыхнет при ходе под пальцем; null — ход не наведён. */
  preview: PlacementPreview | null = null;
  private previewKey = '';
  private forecastCache = new Map<string, PlacementPreview | null>();
  private forecastState = '';
  private forecastSeed = 0;

  /** Подсказка мифа, которому не хватает одной звезды (MY.3). */
  private mythHint: MythHintState = { cells: [], edges: [], missing: 0, alpha: 0 };
  private mythHintEntity: number | null = null;

  constructor(private readonly scene: NightScene) {}

  /** Карта легла — подсказка мифа гаснет до конца подсчёта. */
  hideMythHint(): void {
    void this.scene.svc.tweens.to(this.mythHint, { alpha: 0 }, { duration: 0.15 });
  }

  /** Миф, который закроет карта из руки: фигура без одной звезды. В «Тумане» ранги скрыты — подсказки нет. */
  private refreshMythHint(): void {
    const { run, night: n } = this.scene;
    const near = run.unlocks.myths && !run.tutorial && !n.rules.hideRanks && n.result === 'playing' && !this.off ? nearMyths(n.grid, n.sealed, n.rules.gridSize, n.hand)[0] : undefined;
    if (this.mythHintEntity === null || !this.scene.world.isAlive(this.mythHintEntity)) {
      this.mythHintEntity = mythHintLayer(this.scene.world, this.mythHint, () => this.scene.layout);
    }
    if (near) {
      this.mythHint.cells = near.cells;
      this.mythHint.edges = mythEdges(mythDef(near.myth));
      this.mythHint.missing = near.cell;
    }
    void this.scene.svc.tweens.to(this.mythHint, { alpha: near ? 1 : 0 }, { duration: 0.3 });
  }

  /** Выбор карты сменился — превью наведения считается заново. */
  resetPlacement(): void {
    this.previewKey = '';
  }

  /** Наведение выбранной картой на клетку: какие клетки вспыхнут и сколько света (лоток подсчёта). */
  showPlacement(handIndex: number | null, cell: number | null): void {
    const key = `${handIndex}:${cell}`;
    if (key === this.previewKey) return;
    this.previewKey = key;
    for (const c of this.scene.cells) if (c.ignite > 0) void this.scene.svc.tweens.to(c, { ignite: 0 }, { duration: 0.15 });
    if (cell === null || handIndex === null) {
      this.preview = null;
      this.scene.hud.setPreview(null);
      return;
    }
    this.preview = this.cachedPreview(handIndex, cell);
    if (!this.preview) {
      this.scene.hud.setPreview(null);
      return;
    }
    const color = SUIT_COLORS[this.scene.night.hand[handIndex]!.suit].main;
    for (const c of this.preview.cells) {
      const state = this.scene.cells[c]!;
      state.igniteColor = color;
      void this.scene.svc.tweens.to(state, { ignite: 1 }, { duration: 0.15 });
    }
    if (this.scene.night.rules.hideRanks) this.scene.hud.setPreview(null);
    else this.scene.hud.setPreview(this.preview.lines, this.preview.total);
  }

  /** Пересчитывает, какие пустые клетки закрывают линии (и где крест). */
  refreshClosers(): void {
    const n = this.scene.night;
    const lines = buildLines(n.rules);
    this.scene.cells.forEach((state, cell) => {
      const closes = closingLines(lines, n.grid, n.sealed, cell).length;
      state.closes = closes;
      void this.scene.svc.tweens.to(state, { closesAnim: closes > 0 && !this.off ? 1 : 0 }, { duration: 0.3 });
    });
    this.refreshForecast();
    this.refreshMythHint();
  }

  /** Прогнозы клеток на текущее состояние ночи: выбор карты не пересчитывает их заново. */
  private cachedPreview(handIndex: number, cell: number): PlacementPreview | null {
    // Новое состояние неба или руки — сбросить кэш; свой сид на состояние, чтобы случайные
    // Знамения не меняли подсказку от выбора к выбору
    const n = this.scene.night;
    const state = `${n.placements}|${n.burnsLeft}|${n.hand.map((c) => c.id).join(',')}|${n.grid.map((c) => c?.id ?? '').join(',')}`;
    if (state !== this.forecastState) {
      this.forecastState = state;
      this.forecastCache.clear();
      this.forecastSeed = (Math.random() * 2 ** 32) >>> 0;
    }
    const key = `${handIndex}:${cell}`;
    if (!this.forecastCache.has(key)) this.forecastCache.set(key, previewPlacement(this.scene.run, handIndex, cell, this.forecastSeed));
    return this.forecastCache.get(key)!;
  }

  /**
   * Прогноз созвездий в клетках, закрывающих линию. Выбрана карта — что даст она;
   * нет — лучшее, что даст какая-нибудь карта руки. В «Тумане» ранги в руке скрыты,
   * поэтому прогноза нет.
   */
  refreshForecast(): void {
    const n = this.scene.night;
    const picked = this.scene.selected;
    for (const [cell, state] of this.scene.cells.entries()) {
      state.forecast = [];
      state.forecastPicked = picked !== null;
      state.forecastWeak = false;
      state.forecastCard = null;
      if (state.closes === 0 || n.rules.hideRanks || n.result !== 'playing' || this.off) continue;
      const indices = picked !== null ? [picked] : n.hand.map((_, i) => i);
      let best: PlacementPreview | null = null;
      let bestIndex = -1;
      for (const i of indices) {
        const p = this.cachedPreview(i, cell);
        if (p && (!best || p.total > best.total)) {
          best = p;
          bestIndex = i;
        }
      }
      if (!best) continue;
      if (picked === null) state.forecastCard = n.hand[bestIndex] ?? null;
      // На кресте две подписи: стрелка говорит, какая у ряда, какая у столбца
      state.forecast = best.lines.map((l) => ({ name: t(`combo.${l.combo}`), dir: best!.lines.length > 1 ? l.kind : null }));
      state.forecastWeak = best.lines.every((l) => l.combo === 'scatter');
    }
  }

  /** Двусторонняя стрелка: ↔ ряд, ↕ столбец, ⤡ диагональ — линиями, в цвет подписи. */
  private drawLineArrow(ctx: CanvasRenderingContext2D, dir: 'row' | 'col' | 'diag', cx: number, cy: number, len: number, color: string, k: number): void {
    const [dx, dy] = dir === 'row' ? [1, 0] : dir === 'col' ? [0, 1] : [Math.SQRT1_2, -Math.SQRT1_2];
    const half = len / 2;
    const head = len * 0.32;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(cx - dx * half, cy - dy * half);
      ctx.lineTo(cx + dx * half, cy + dy * half);
      for (const sgn of [1, -1]) {
        const tx = cx + sgn * dx * half;
        const ty = cy + sgn * dy * half;
        // Усы стрелки — под 45° к линии, назад от острия
        ctx.moveTo(tx - sgn * head * (dx - dy) * Math.SQRT1_2, ty - sgn * head * (dy + dx) * Math.SQRT1_2);
        ctx.lineTo(tx, ty);
        ctx.lineTo(tx - sgn * head * (dx + dy) * Math.SQRT1_2, ty - sgn * head * (dy - dx) * Math.SQRT1_2);
      }
    };
    path();
    ctx.lineWidth = 3.4;
    ctx.strokeStyle = `rgba(8,6,24,${0.75 * k})`;
    ctx.stroke();
    path();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
  }

  /** Раскладки подписей прогноза: замер шрифта и перенос — раз на набор названий, а не каждый кадр. */
  private forecastLayouts = new Map<string, ForecastLayout>();

  private forecastLayout(ctx: CanvasRenderingContext2D, forecast: CellState['forecast'], w: number): ForecastLayout {
    // «Крупный текст» в настройках — подписи на небе тоже крупнее (сколько влезет в клетку)
    const large = document.documentElement.classList.contains('large-text');
    // Статус шрифтов в ключе: замер до загрузки Manrope был бы по запасному шрифту
    const key = `${w}|${large ? 1 : 0}|${document.fonts?.status ?? ''}|${forecast.map((f) => `${f.name}/${f.dir ?? ''}`).join('|')}`;
    const hit = this.forecastLayouts.get(key);
    if (hit) return hit;
    const maxW = w - 8;
    const base = Math.max(large ? 14 : 12, Math.round(w * (large ? 0.2 : 0.17)));
    // Стрелка ряда или столбца рисуется линиями, а не символом шрифта: символ в другом
    // шрифте (Telegram, Android) шире замера и вылезал за клетку
    let arrows = forecast.some((f) => f.dir);
    const arrowW = (size: number) => (arrows ? size * 0.9 : 0);
    // Узкая клетка: длинное слово не влезает — ужимаем шрифт, а не клетку; не хватает и
    // мелкого — стрелки уступают место названию
    const fit = () => {
      ctx.font = `700 ${base}px Manrope, sans-serif`;
      let widest = 0;
      for (const f of forecast) {
        f.name.split(' ').forEach((word, i) => {
          widest = Math.max(widest, ctx.measureText(word).width + (i === 0 ? arrowW(base) : 0));
        });
      }
      return widest > maxW ? Math.floor((base * maxW) / widest) : base;
    };
    let size = fit();
    if (size < 9 && arrows) {
      arrows = false;
      size = fit();
    }
    size = Math.max(8, size);
    ctx.font = `700 ${size}px Manrope, sans-serif`;
    const aw = arrowW(size);
    const rows: ForecastLayout['rows'] = [];
    for (const f of forecast) {
      let row = '';
      let dir = arrows ? f.dir : null;
      for (const word of f.name.split(' ')) {
        const next = row ? `${row} ${word}` : word;
        if (row && ctx.measureText(next).width + (dir ? aw : 0) > maxW) {
          rows.push({ text: row, dir, width: ctx.measureText(row).width });
          dir = null;
          row = word;
        } else row = next;
      }
      if (row) rows.push({ text: row, dir, width: ctx.measureText(row).width });
    }
    const layout = { size, aw, rows };
    // Набор названий за ночь невелик; потолок — на случай смены размеров окна
    if (this.forecastLayouts.size > 200) this.forecastLayouts.clear();
    this.forecastLayouts.set(key, layout);
    return layout;
  }

  /**
   * Названия созвездий в клетке, которая закроет линию: игрок видит, что соберётся,
   * не зная покерных комбинаций. Длинные названия переносятся по словам.
   */
  draw(ctx: CanvasRenderingContext2D, s: CellState, x: number, y: number, w: number, hgt: number, k: number): void {
    const cross = s.closes >= 2;
    const maxW = w - 8;
    const { size, aw, rows } = this.forecastLayout(ctx, s.forecast, w);
    ctx.font = `700 ${size}px Manrope, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lh = size * 1.15;
    const mark = cross ? Math.round(w * 0.28) : 0;
    let chip = s.forecastCard && !s.forecastWeak ? size * 1.5 : 0;
    let shown = rows.slice(0, 3);
    // Блок целиком: «×2», строки названий, мини-карта — по центру клетки и не выше неё
    const height = () => (mark ? mark * 1.05 : 0) + shown.length * lh + (chip ? chip + lh * 0.3 : 0);
    if (height() > hgt - 6) chip = 0;
    if (height() > hgt - 6) shown = shown.slice(0, 2);
    let cursor = y - height() / 2;
    if (mark) {
      ctx.save();
      ctx.font = `400 ${mark}px Forum, serif`;
      ctx.shadowColor = 'rgba(255,214,120,0.9)';
      ctx.shadowBlur = 12;
      ctx.fillStyle = `rgba(255,214,120,${0.8 * k})`;
      ctx.fillText(`×${s.closes}`, x, cursor + mark / 2);
      ctx.shadowColor = 'transparent';
      ctx.fillText(`×${s.closes}`, x, cursor + mark / 2);
      ctx.restore();
      cursor += mark * 1.05;
    }
    const alpha = (s.forecastWeak ? 0.78 : 0.95) * k;
    const color = s.forecastWeak ? `rgba(200,195,230,${alpha})` : s.forecastPicked ? `rgba(255,236,190,${alpha})` : `rgba(246,194,91,${alpha})`;
    shown.forEach((row, i) => {
      const ry = cursor + i * lh + lh / 2;
      const iconW = row.dir ? aw : 0;
      // Предел ширины у fillText — страховка: даже если шрифт шире замера, строка
      // сожмётся по горизонтали, а не вылезет из клетки
      const textMax = maxW - iconW;
      const textW = Math.min(textMax, row.width);
      const left = x - (iconW + textW) / 2;
      const tx = left + iconW + textW / 2;
      if (row.dir) this.drawLineArrow(ctx, row.dir, left + size * 0.35, ry, size * 0.62, color, k);
      // Тёмная подложка под буквами — читается и поверх туманности
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(8,6,24,${0.75 * k})`;
      ctx.strokeText(row.text, tx, ry, textMax);
      ctx.fillStyle = color;
      ctx.fillText(row.text, tx, ry, textMax);
    });
    cursor += shown.length * lh;
    const card = s.forecastCard;
    if (card && chip) {
      // Мини-карта: какой картой руки собрать — ранг цветом масти
      const cw = chip * 0.72;
      const cy = cursor + lh * 0.3 + chip / 2;
      const c = SUIT_COLORS[card.suit];
      roundRect(ctx, x - cw / 2, cy - chip / 2, cw, chip, cw * 0.16);
      ctx.fillStyle = rgba(c.rgb, 0.18 * k);
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = rgba(c.rgb, 0.85 * k);
      ctx.stroke();
      ctx.font = `400 ${Math.round(chip * 0.62)}px Forum, serif`;
      ctx.fillStyle = c.light;
      ctx.globalAlpha *= k;
      ctx.fillText(String(card.rank), x, cy + chip * 0.04);
    }
  }
}
