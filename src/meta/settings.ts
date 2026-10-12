import { detectLang, type Lang } from '@/i18n';
import { KEYS, storage } from './storage';

export interface Settings {
  lang: Lang;
  sfx: number;
  music: number;
  /** Индекс в SPEEDS. */
  speed: number;
  reduceMotion: boolean;
  haptics: boolean;
  /** Разворачивать на весь экран при старте забега (мобильный браузер). */
  fullscreen: boolean;
  /** Подсказка «добавь на экран Домой» уже закрыта. */
  homeHintSeen: boolean;
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
    homeHintSeen: false,
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
