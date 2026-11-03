import { en } from './en.ts';
import { ru, type Dict } from './ru.ts';

/**
 * Тексты обучения на сервере (эпик TX, решение Дениса 02.11.2026): русские правит Денис в
 * редакторе рядом со сводкой, английский переводит Claude. Модуль общий для игры и сервера:
 * какие ключи можно править, в каком порядке их показывать и какие правки безопасны.
 * В сборке остаются тексты по умолчанию — без сервера игра работает как раньше.
 */

export type TextLang = 'ru' | 'en';
export const TEXT_LANGS: TextLang[] = ['ru', 'en'];

/** Разделы словаря, которые правятся с сервера, — в порядке, в каком игрок их встречает. */
export const TEXT_GROUPS = [
  { id: 'tut', title: 'Обучение: первая ночь и Обсерватория' },
  { id: 'runPath', title: 'Путь до рассвета' },
  { id: 'tutorial', title: 'Подсказки первых забегов' },
  { id: 'mentor', title: 'Наставник' },
] as const satisfies readonly { id: keyof Dict; title: string }[];

export type TextGroup = (typeof TEXT_GROUPS)[number]['id'];

/** Ключ `раздел.имя` (у списков `раздел.имя.N`) и текст по умолчанию из сборки. */
export interface TextEntry {
  key: string;
  group: TextGroup;
  value: string;
}

const DEFAULTS: Record<TextLang, Dict> = { ru, en };

/**
 * Кнопки и служебные подписи — не голос Лебедя: с сервера не правятся (TX.6, e2e показал, что
 * удлинённая «Пропустить» ломает строку подсказки). Остаются как в сборке.
 */
const FIXED = new Set(['tut.next', 'tut.skip', 'tut.skipShort', 'tut.retry', 'tut.startRun', 'tut.menuButton', 'tut.menuSub', 'tut.offerSkip', 'tutorial.gotIt', 'runPath.go', 'runPath.aria']);

/** Все правимые строки языка в порядке словаря: он и есть порядок показа в игре. */
export function textCatalog(lang: TextLang): TextEntry[] {
  const out: TextEntry[] = [];
  for (const { id } of TEXT_GROUPS) {
    for (const [name, value] of Object.entries(DEFAULTS[lang][id])) {
      if (FIXED.has(`${id}.${name}`)) continue;
      if (typeof value === 'string') out.push({ key: `${id}.${name}`, group: id, value });
      else if (Array.isArray(value)) value.forEach((v: unknown, i) => typeof v === 'string' && out.push({ key: `${id}.${name}.${i}`, group: id, value: v }));
    }
  }
  return out;
}

/** Текст по умолчанию для ключа или `undefined`, если ключ не правится с сервера. */
export function defaultText(lang: TextLang, key: string): string | undefined {
  return catalogMap(lang).get(key);
}

const maps: Partial<Record<TextLang, Map<string, string>>> = {};
function catalogMap(lang: TextLang): Map<string, string> {
  return (maps[lang] ??= new Map(textCatalog(lang).map((e) => [e.key, e.value])));
}

/** Подстановки `{n}` в тексте — отсортированный набор имён. */
export function textVars(s: string): string[] {
  return [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort();
}

/**
 * Предел длины (TX.6, проверено e2e на самых длинных текстах): реплика должна поместиться в
 * пузырь на iPhone SE и в невысоком ландшафте, подпись (кнопка, звено «Обучение пройдено», имя
 * наставника) — на своё место, поэтому подписи разрешено вырасти лишь на несколько букв.
 */
export function maxTextLength(def: string): number {
  return def.length < 40 ? def.length + 8 : Math.max(110, def.length + 15);
}

export type TextProblem = 'empty' | 'vars' | 'stars' | 'dash' | 'long' | 'markup';

/** Что не так с правкой по сравнению с текстом по умолчанию; `null` — можно показывать. */
export function checkText(def: string, value: string): TextProblem | null {
  if (!value.trim()) return 'empty';
  if (textVars(value).join() !== textVars(def).join()) return 'vars';
  if ((value.split('*').length - 1) % 2) return 'stars';
  // Правило текстов интерфейса: без длинных тире
  if (value.includes('—')) return 'dash';
  if (/[<>]/.test(value)) return 'markup';
  if (value.length > maxTextLength(def)) return 'long';
  return null;
}

/** Пояснения для редактора — по-русски, им пользуется Денис. */
export const TEXT_PROBLEM_RU: Record<TextProblem, string> = {
  empty: 'Текст пустой',
  vars: 'Подстановки {…} должны быть те же, что в тексте по умолчанию',
  stars: 'Звёздочки *…* должны быть парными: ими выделяется действие',
  dash: 'Без длинных тире: лучше двоеточие или запятая',
  markup: 'Знаки < и > не нужны',
  long: 'Слишком длинно: пузырь подсказки не вместит',
};

/**
 * Словарь с правками поверх своего: берутся только правимые ключи и только безопасные
 * значения, остальное молча остаётся из сборки. Возвращает новый словарь и принятые ключи.
 */
export function withTexts(base: Dict, lang: TextLang, overrides: Record<string, unknown>): { dict: Dict; applied: string[] } {
  const applied: string[] = [];
  const dict = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(overrides)) {
    const def = defaultText(lang, key);
    if (def === undefined || typeof value !== 'string' || value === def || checkText(def, value)) continue;
    const [group, name, index] = key.split('.') as [TextGroup, string, string | undefined];
    // Копируем только затронутый раздел (и список внутри него), чтобы не менять словарь сборки
    const section = (dict[group] = dict[group] === base[group] ? { ...base[group] } : dict[group]) as Record<string, unknown>;
    if (index === undefined) section[name] = value;
    else {
      const list = [...(section[name] as string[])];
      list[Number(index)] = value;
      section[name] = list;
    }
    applied.push(key);
  }
  return { dict: dict as Dict, applied };
}
