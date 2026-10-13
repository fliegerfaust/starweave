/**
 * Внешний вид, который можно выбрать (и купить): рубашки карт и небо за игрой.
 * Только вид — на правила и счёт не влияет ничего из этого файла.
 */

type Rgb = [number, number, number];

export interface BackStyle {
  id: string;
  /** Градиент поля рубашки: от верхнего левого угла к нижнему правому. */
  field: [string, string];
  /** Линии узора и рамка. */
  ink: string;
  /** Свечение вокруг карты. */
  glow: string;
  pattern: 'mandala' | 'astrolabe' | 'weave' | 'comet' | 'aurora';
  /** Металл рамки — цвета градиента по диагонали (фольга). */
  frame: string[];
}

export const BACKS: BackStyle[] = [
  { id: 'classic', field: ['#2a1a5e', '#100b2c'], ink: '246,194,91', glow: 'rgba(160,120,255,0.4)', pattern: 'mandala', frame: ['#f6c25b'] },
  { id: 'astrolabe', field: ['#11586a', '#04121c'], ink: '236,192,110', glow: 'rgba(90,200,220,0.5)', pattern: 'astrolabe', frame: ['#8a5a22', '#f3d18a', '#b07a32', '#ffe6a8', '#8a5a22'] },
  { id: 'patron', field: ['#2a1a08', '#050307'], ink: '255,214,120', glow: 'rgba(255,200,90,0.6)', pattern: 'weave', frame: ['#7a4e12', '#fff1b8', '#d8a23a', '#fffbe6', '#a8701c', '#ffe08a'] },
  { id: 'comet', field: ['#2b3fd1', '#120a3a'], ink: '170,230,255', glow: 'rgba(110,170,255,0.55)', pattern: 'comet', frame: ['#9fb6ff', '#ffffff', '#7a8cff', '#e4ecff'] },
  { id: 'aurora', field: ['#06352f', '#1d0b44'], ink: '120,255,200', glow: 'rgba(110,255,190,0.5)', pattern: 'aurora', frame: ['#3ff0b0', '#a8fff0', '#8b6bff', '#d6c8ff'] },
];

export interface SkyTheme {
  id: string;
  /** null — небо меняется по созвездиям (обычное). */
  palette: Rgb[] | null;
}

export const SKY_THEMES: SkyTheme[] = [
  { id: 'night', palette: null },
  { id: 'astrolabe', palette: [[30, 140, 160], [200, 150, 70], [40, 80, 150], [20, 170, 170]] },
  { id: 'patron', palette: [[230, 170, 60], [150, 60, 200], [200, 120, 40], [90, 40, 160]] },
  { id: 'aurora', palette: [[40, 220, 150], [40, 160, 220], [140, 70, 220], [60, 240, 190]] },
  { id: 'ember', palette: [[240, 110, 50], [220, 60, 90], [250, 170, 70], [140, 40, 110]] },
];

export const DEFAULT_BACK = 'classic';
export const DEFAULT_SKY = 'night';

export function backStyle(id: string): BackStyle {
  return BACKS.find((b) => b.id === id) ?? BACKS[0]!;
}

export function skyTheme(id: string): SkyTheme {
  return SKY_THEMES.find((s) => s.id === id) ?? SKY_THEMES[0]!;
}

/** Бесплатно всем — остальное открывается покупкой (`back:<id>`, `sky:<id>` в купленном). */
export function isFreeCosmetic(slot: 'back' | 'sky', id: string): boolean {
  return slot === 'back' ? id === DEFAULT_BACK : id === DEFAULT_SKY;
}
