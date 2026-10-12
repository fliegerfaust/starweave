import type { Platform } from './types';
import { WebPlatform } from './web';

export type { Platform } from './types';

/** Площадка выбирается при сборке: `VITE_PLATFORM=yandex npm run build`. */
export async function createPlatform(): Promise<Platform> {
  if (import.meta.env.VITE_PLATFORM === 'yandex') {
    const { YandexPlatform } = await import('./yandex');
    return new YandexPlatform();
  }
  return new WebPlatform();
}
