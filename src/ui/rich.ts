import { h } from './dom';

/**
 * Подсвечивает в описаниях эффекты теми же цветами, что и коробки формулы:
 * свет — голубой, множитель — розовый, умножение множителя — розово-золотой,
 * золото — жёлтый. Игрок видит связь «описание Знамения → коробка в формуле».
 */
const RULES: { re: RegExp; cls: string }[] = [
  { re: /[+−-]\d+(?:[.,]\d+)?\s(?:к множителю|to multiplier)/, cls: 'mult' },
  { re: /(?:[Мм]ножитель|[Mm]ultiplier)[^.,:;()]{0,30}?×\d+(?:[.,]\d+)?/, cls: 'xmult' },
  { re: /[+−-]\d+\s(?:света|light)/, cls: 'light' },
  { re: /\+свет|\+ light/, cls: 'light' },
  { re: /[+−-]\d+\s?(?:золот[ао]|gold|◆)/, cls: 'gold' },
];

const ALL = new RegExp(RULES.map((r) => `(${r.re.source})`).join('|'), 'g');

export function rich(text: string): HTMLElement {
  const out = h('span.rich');
  let last = 0;
  for (const m of text.matchAll(ALL)) {
    const index = m.index ?? 0;
    if (index > last) out.append(text.slice(last, index));
    const group = m.slice(1).findIndex((g) => g !== undefined);
    out.append(h(`span.fx-pill.fx-${RULES[group]?.cls ?? 'light'}`, null, m[0]));
    last = index + m[0].length;
  }
  if (last < text.length) out.append(text.slice(last));
  return out;
}
