/**
 * Внешний вид, который можно выбрать (и купить): рубашки карт и небо за игрой.
 * Только вид — на правила и счёт не влияет ничего из этого файла.
 */

type Rgb = [number, number, number];

export interface BackStyle {
  id: string;
  /** Поле рубашки: верх и низ градиента. */
  field: [string, string];
  /** Картографическая рамка со шкалой градусов (покупные). */
  ruled: boolean;
  /** Рамка — золотой фольгой (набор мецената). */
  foil?: boolean;
}

/** Рубашки — «Гравюра» (FP.7, рисует src/art/backs.ts). */
export const BACKS: BackStyle[] = [
  { id: 'classic', field: ['#2b2168', '#0c0927'], ruled: false },
  { id: 'astrolabe', field: ['#0e4152', '#03111a'], ruled: true },
  { id: 'patron', field: ['#251708', '#060403'], ruled: true, foil: true },
  { id: 'comet', field: ['#18276e', '#060a28'], ruled: true },
  { id: 'aurora', field: ['#0d3b37', '#05121b'], ruled: true },
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
