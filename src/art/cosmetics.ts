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
}

export const BACKS: BackStyle[] = [
  { id: 'classic', field: ['#2a1a5e', '#100b2c'], ink: '246,194,91', glow: 'rgba(160,120,255,0.4)', pattern: 'mandala' },
  { id: 'astrolabe', field: ['#0f3a4a', '#061521'], ink: '226,184,104', glow: 'rgba(90,200,220,0.4)', pattern: 'astrolabe' },
  { id: 'patron', field: ['#1b1206', '#07050a'], ink: '255,214,120', glow: 'rgba(255,200,90,0.45)', pattern: 'weave' },
  { id: 'comet', field: ['#1a2a6c', '#0a0d2e'], ink: '160,220,255', glow: 'rgba(120,180,255,0.4)', pattern: 'comet' },
  { id: 'aurora', field: ['#0b2a2a', '#140b30'], ink: '140,255,200', glow: 'rgba(120,255,190,0.35)', pattern: 'aurora' },
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
