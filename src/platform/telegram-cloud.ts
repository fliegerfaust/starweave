/**
 * Упаковка сохранений в CloudStorage Telegram. У него ограничения: ключ — только
 * `A-Z a-z 0-9 _ -` до 128 символов, значение — до 4096 символов. Наши ключи с точками,
 * а забег в JSON бывает длиннее, поэтому значение режем на куски, а оглавление храним
 * отдельным ключом. Чистые функции — без обращения к Telegram, их проверяют тесты.
 */

export const CHUNK = 4000;
export const INDEX_KEY = 'sw_index';

/** Наш ключ → допустимый в CloudStorage. */
export function cloudKey(key: string): string {
  return key.replace(/[^A-Za-z0-9_-]/g, '_');
}

export interface Packed {
  /** Что записать: ключ CloudStorage → значение (каждое не длиннее CHUNK). */
  items: Record<string, string>;
  /** Оглавление: наш ключ → число кусков. */
  index: Record<string, number>;
}

export function pack(data: Record<string, string>): Packed {
  const items: Record<string, string> = {};
  const index: Record<string, number> = {};
  for (const [key, value] of Object.entries(data)) {
    const base = cloudKey(key);
    const parts = Math.max(1, Math.ceil(value.length / CHUNK));
    index[key] = parts;
    for (let i = 0; i < parts; i++) items[`${base}_${i}`] = value.slice(i * CHUNK, (i + 1) * CHUNK);
  }
  items[INDEX_KEY] = JSON.stringify(index);
  return { items, index };
}

/** Ключи CloudStorage, которые нужно прочитать по оглавлению. */
export function chunkKeys(index: Record<string, number>): string[] {
  return Object.entries(index).flatMap(([key, parts]) => Array.from({ length: parts }, (_, i) => `${cloudKey(key)}_${i}`));
}

export function unpack(index: Record<string, number>, items: Record<string, string>): Record<string, string> {
  const data: Record<string, string> = {};
  for (const [key, parts] of Object.entries(index)) {
    let value = '';
    let complete = true;
    for (let i = 0; i < parts && complete; i++) {
      const part = items[`${cloudKey(key)}_${i}`];
      if (part === undefined) complete = false; // запись оборвалась — ключ пропускаем, битое не отдаём
      else value += part;
    }
    if (complete) data[key] = value;
  }
  return data;
}
