import type { Suit } from '@/core/types';

export interface SuitColors {
  /** Основной цвет масти. */
  main: string;
  /** Светлый — для цифр и ядра звёзд. */
  light: string;
  /** Тёмный — для подложек. */
  deep: string;
  /** RGB-тройка основного для градиентов с альфой. */
  rgb: [number, number, number];
}

export const SUIT_COLORS: Record<Suit, SuitColors> = {
  sun: { main: '#f6c25b', light: '#ffe6a8', deep: '#3a2408', rgb: [246, 194, 91] },
  moon: { main: '#8fd0ff', light: '#d9f0ff', deep: '#0c2238', rgb: [143, 208, 255] },
  star: { main: '#c39bff', light: '#eadcff', deep: '#22113f', rgb: [195, 155, 255] },
  comet: { main: '#ff7f62', light: '#ffd3c4', deep: '#3d110a', rgb: [255, 127, 98] },
};

export const UI = {
  night0: '#05061a',
  night1: '#0c0d2c',
  night2: '#191641',
  ink: '#eae6ff',
  inkDim: '#a5a0cf',
  gold: '#f6c25b',
  light: '#7fe0ff',
  mult: '#ff6b8b',
  danger: '#ff5370',
  ok: '#7cf0b0',
};

export const RARITY_COLORS: Record<1 | 2 | 3, { main: string; rgb: [number, number, number] }> = {
  1: { main: '#9fb8ff', rgb: [159, 184, 255] },
  2: { main: '#5ff2c4', rgb: [95, 242, 196] },
  3: { main: '#ffb347', rgb: [255, 179, 71] },
};

export const rgba = ([r, g, b]: [number, number, number], a: number) => `rgba(${r},${g},${b},${a})`;

export const DISPLAY_FONT = "'Forum', 'Times New Roman', serif";
export const BODY_FONT = "'Manrope Variable', 'Manrope', system-ui, sans-serif";
