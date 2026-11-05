import { detectLang, type Lang } from '@/i18n';
import { KEYS, storage } from './storage';

export interface Settings {
  lang: Lang;
  sfx: number;
  music: number;
  /** Индекс в SPEEDS. */
  speed: number;
  reduceMotion: boolean;
  /** Крупный текст в интерфейсе и в подписях на небе. */
  largeText: boolean;
  haptics: boolean;
  /** Разворачивать на весь экран при старте забега (мобильный браузер). */
  fullscreen: boolean;
  /** Чёткость поля: auto снижает её на слабых устройствах, max — никогда. */
  quality: 'auto' | 'max';
  /** Космические эффекты на шейдерах. */
  cosmicFx: boolean;
  /** Что сторож кадров решил про это устройство: 0 полный слой, 1 облегчённый, 2 выключен. */
  fxLevel: 0 | 1 | 2;
  /** Сколько запусков слой уже выключен: просадка могла быть случайной, поэтому через три запуска пробуем снова. */
  fxOffRuns: number;
  /** Подсказка «добавь на экран Домой» уже закрыта. */
  homeHintSeen: boolean;
  /** Выбранный внешний вид (если он куплен на этой площадке). */
  cardBack: string;
  skyTheme: string;
}

export const SPEEDS = [0.75, 1, 1.6, 2.6];

export function loadSettings(): Settings {
  const defaults: Settings = {
    lang: detectLang(),
    sfx: 0.8,
    music: 0.45,
    speed: 1,
    haptics: true,
    fullscreen: true,
    quality: 'auto',
    cosmicFx: true,
    fxLevel: 0,
    fxOffRuns: 0,
    homeHintSeen: false,
    cardBack: 'classic',
    skyTheme: 'night',
    largeText: false,
    reduceMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
  try {
    return { ...defaults, ...(JSON.parse(storage.get(KEYS.settings) ?? '{}') as Partial<Settings>) };
  } catch {
    return defaults;
  }
}

export function saveSettings(s: Settings): void {
  storage.set(KEYS.settings, JSON.stringify(s));
}
