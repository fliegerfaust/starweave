import type { Platform } from '@/platform';
import { KEYS, storage } from './storage';

/**
 * Сохранения из облака площадки при запуске. Обычно облако только подстраховывает: берём его,
 * если на устройстве ничего нет. Там, где облако привязано к аккаунту и главнее браузера
 * (`cloudFirst`, Пикабу), берём его и поверх своего: иначе гостевой прогресс в этом браузере
 * после входа в аккаунт затёр бы прогресс аккаунта с другого устройства (CG-107).
 */
export async function restoreFromCloud(platform: Platform): Promise<void> {
  if (!platform.cloudFirst && storage.get(KEYS.profile)) return;
  const data = await platform.cloudLoad().catch(() => null);
  if (!data?.[KEYS.profile]) return;
  // Забега в облаке нет — он закончен; незаконченный забег этого браузера чужой, его убираем
  if (platform.cloudFirst && !data[KEYS.run]) storage.remove(KEYS.run);
  for (const [key, value] of Object.entries(data)) if (typeof value === 'string') storage.set(key, value);
}
