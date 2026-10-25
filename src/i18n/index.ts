import { en } from './en';
import { ru, type Dict } from './ru';

export type Lang = 'ru' | 'en';
export const LANGS: Lang[] = ['ru', 'en'];
const DICTS: Record<Lang, Dict> = { ru, en };

let current: Lang = detectLang();

export function detectLang(): Lang {
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'ru';
  return nav.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export function setLang(lang: Lang): void {
  current = lang;
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.title = DICTS[lang].game.title;
}

export function getLang(): Lang {
  return current;
}

/** Текущий словарь — для массивов и вложенных структур. */
export function dict(): Dict {
  return DICTS[current];
}

/**
 * Пути к строкам словаря: `menu.newRun`; у таблиц `Record<string, string>` — `kinds.${string}`.
 * Массивы и пары «название, описание» сюда не входят: их берут `dict()` и `named()`.
 */
type Leaves<T> = {
  [K in keyof T & (string | number)]: T[K] extends string ? `${K}`
    : T[K] extends readonly unknown[] ? never
    : T[K] extends object ? `${K}.${Leaves<T[K]>}`
    : never;
}[keyof T & (string | number)];

/** Ключ `t()`: опечатка или удалённая строка — ошибка типов, а не путь на экране. */
export type TKey = Leaves<Dict>;

/** Строка по пути `a.b.c` с подстановкой `{var}`. Нет ключа — возвращает путь (видно в UI). */
export function t(path: TKey, vars: Record<string, string | number> = {}): string {
  let node: unknown = DICTS[current];
  for (const part of path.split('.')) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  if (typeof node !== 'string') return path;
  return format(node, vars);
}

export function format(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => (key in vars ? String(vars[key]) : `{${key}}`));
}

/** Название и описание из таблиц `omen`/`boss`/`trophy`/`ritual`/`sky`. */
export function named(table: 'omen' | 'boss' | 'trophy' | 'ritual' | 'sky' | 'pack', id: string, vars: Record<string, string | number> = {}): { name: string; desc: string } {
  const pair = DICTS[current][table][id];
  if (!pair) return { name: id, desc: '' };
  return { name: pair[0], desc: format(pair[1], vars) };
}

/** Число с разделителями разрядов: 12 500. */
export function num(n: number): string {
  return Math.round(n).toLocaleString(current === 'ru' ? 'ru-RU' : 'en-US');
}
