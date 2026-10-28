/**
 * Реестр ключевых слов без DOM (KW.4): разметка, слова, которые находятся сами, и проверка, что
 * у ключа есть подсказка. Отображение и подсказки — в keywords.ts; здесь то, что проверяет тест.
 * Правило Дениса (28.10): новый термин механики сразу попадает сюда и в `kw.rule` ru/en.
 */
export const MARK = /\[([^|\]]+)\|([^|\]]+)(?:\|([^\]]+))?\]|\{([+-])([^}]+)\}/g;

/**
 * Слова механики в описаниях Знамений, Затмений, глифов и ритуалов находятся сами (FX.4): числа
 * эффектов («+6 к множителю», «множитель ×3», «+30 света», «+2 золота»), «ранг», «разбиться»,
 * «миф», «проценты», «сжигание», «крест», «Затмение», «уровень», «небесное тело».
 * Цвет — как у коробок формулы ночи. Названия (Знамения, глифа) рядом со своим описанием не
 * выделяются — их объясняет описание (правило Дениса).
 */
const L = '(?<![А-Яа-яЁёA-Za-z])';
const R = '(?![А-Яа-яЁёA-Za-z])';
export const AUTO: { re: string; key: string; cls?: string }[] = [
  { re: '[+−-]\\d+(?:[.,]\\d+)?\\s(?:к множителю|to multiplier)', key: 'mult', cls: 'mult' },
  { re: '(?:[Мм]ножитель|[Mm]ultiplier)[^.,:;()]{0,30}?×\\d+(?:[.,]\\d+)?', key: 'mult', cls: 'xmult' },
  // «крест даёт ×3» — в описаниях × про множитель; «4×4» (размер неба) — нет
  { re: '(?<!\\d\\s?)×\\d+(?:[.,]\\d+)?', key: 'mult', cls: 'xmult' },
  { re: '[+−-]\\d+(?:[.,]\\d+)?\\s(?:света|light)', key: 'light', cls: 'light' },
  { re: '[+−-]\\d+\\s?(?:золота|золото|gold)', key: 'gold', cls: 'gold' },
  { re: `${L}(?:[Рр]азбиться|разобьётся|разбивается|разбилась|[Ss]hatters?|shattered)${R}`, key: 'shatter' },
  { re: `${L}(?:[Рр]анг(?:а|у|ом|и|ов|ам)?|[Rr]anks?)${R}`, key: 'rank' },
  // KW.1, KW.2 (отзыв Андрея 28.10): «что такое миф?», «что такое проценты?»
  { re: `${L}(?:[Мм]иф(?:а|у|ом|е|ы|ов|ам|ами|ах)?|[Mm]yths?)${R}`, key: 'myth' },
  { re: `${L}(?:[Пп]роцент(?:ы|ов|ам|ами|ах)|[Ii]nterest)${R}`, key: 'interest' },
  // KW.4 (аудит текстов эффектов): сжигание, крест (кроме мифа «Северный крест»), Затмение, уровень
  { re: `${L}(?:[Сс]жигани(?:е|я|й|ю|ем|ями|ях)|[Bb]urns?)${R}`, key: 'burn' },
  { re: `${L}(?<!Северный |Northern )(?:[Кк]рест(?:а|у|ом|е|ы|ов|ам)?|[Cc]ross(?:es)?)${R}`, key: 'cross' },
  { re: `${L}(?:[Зз]атмени(?:е|я|ю|ем|и|й|ям)|[Ee]clipses?)${R}`, key: 'eclipse' },
  { re: `${L}(?:[Уу]ров(?:ень|ня|ню|нем|не|ни|ней)|[Ll]evels?)${R}`, key: 'level' },
  // KW.3: «небесное тело» в любом падеже; имя тела — разметкой [Метеор|body.meteor]
  { re: `${L}(?:[Нн]ебесн(?:ое|ого|ому|ым|ом|ые|ых|ыми) тел(?:о|а|у|ом|е|ами|ах|ам)|[Cc]elestial bod(?:y|ies))${R}`, key: 'body' },
];
export const AUTO_RE = new RegExp(AUTO.map((a) => `(${a.re})`).join('|'), 'g');

/**
 * Ключи слов, которые получат подсказку в тексте (ручная разметка и, с `auto`, найденные сами).
 * Без DOM — для теста-сторожа реестра (KW.4).
 */
export function keywordKeys(raw: string, auto = true): string[] {
  const keys: string[] = [];
  const scan = (s: string) => {
    if (!auto) return;
    for (const m of s.matchAll(AUTO_RE)) keys.push(AUTO[m.slice(1).findIndex((g) => g !== undefined)]!.key);
  };
  let last = 0;
  for (const m of raw.matchAll(MARK)) {
    scan(raw.slice(last, m.index));
    if (!m[4]) keys.push(m[2]!);
    last = (m.index ?? 0) + m[0].length;
  }
  scan(raw.slice(last));
  return keys;
}

/** Есть ли у ключа подсказка в словаре `d` (глиф, правило, Знамение, тело). */
export function hasKeyword(key: string, d: Record<string, unknown>): boolean {
  const kw = d.kw as { glyph: Record<string, unknown>; rule: Record<string, unknown> };
  if (key.startsWith('omen.')) return key.slice(5) in (d.omen as object) || key.includes('{');
  if (key.startsWith('body.')) return key.slice(5) in (d.bodyDesc as object);
  return key in kw.glyph || key in kw.rule || key.startsWith('{');
}

