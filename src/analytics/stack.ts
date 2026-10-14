/** Сколько кадров стека отправлять: дальше обычно цикл кадра, обработчик событий и т.п. */
export const STACK_FRAMES = 8;
/** Предел длины стека — сервер режет так же (LIMITS.stack). */
export const STACK_CHARS = 1000;

// Chrome: «    at fn (https://site/a.js:2:23806)» или «    at https://site/a.js:2:3»
const V8 = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/;
// Safari и Firefox: «fn@https://site/a.js:2:3»
const GECKO = /^(.*?)@(.+?):(\d+):(\d+)$/;

/**
 * Короткий стек для аналитики: по кадру в строке — `функция@файл:строка:колонка`.
 * Адрес своего сайта отрезается (остаётся путь, как в `where`), чужие скрипты — целиком.
 * Строки без координат (сообщение, «eval», «native code») отбрасываются.
 */
export function compactStack(stack: string | undefined, origin: string): string {
  if (!stack) return '';
  const frames: string[] = [];
  for (const line of stack.split('\n')) {
    const m = V8.exec(line) ?? GECKO.exec(line.trim());
    if (!m) continue;
    const [, fn = '', file = '', row, col] = m;
    if (!/^(https?:|\/)/.test(file)) continue;
    const path = origin && file.startsWith(origin) ? file.slice(origin.length) : file;
    frames.push(`${fn.trim() || '?'}@${path}:${row}:${col}`);
    if (frames.length >= STACK_FRAMES) break;
  }
  return frames.join('\n').slice(0, STACK_CHARS);
}
