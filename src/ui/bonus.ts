import { h } from './dom';

/**
 * Бонус одной строкой (RD.4, «Прилавок», решение Дениса): условие до двоеточия приглушено,
 * результат — обычным цветом, и только число выделено цветом формулы ночи — свет, множитель,
 * итог хода, золото. Без плашек и рамок: важное читается, но не кричит.
 *
 * «Вспыхнувший ряд: +6 к множителю» → <приглушено>Вспыхнувший ряд:</приглушено> <b розовым>+6</b> к множителю
 */
type Tone = 'light' | 'mult' | 'total' | 'gold' | 'plain';

const NUMBER = /[+−-]\d+(?:[.,]\d+)?|×\d+(?:[.,]\d+)?|\+\s?(?=свет|light)/g;

function toneOf(text: string, start: number, token: string): Tone {
  const after = text.slice(start + token.length, start + token.length + 16).toLowerCase();
  const before = text.slice(Math.max(0, start - 16), start).toLowerCase();
  if (/^\s?(света|свет|light)/.test(after)) return 'light';
  if (/^\s?(золот|gold)/.test(after)) return 'gold';
  if (/^\s?(к множителю|to multiplier|множител|multiplier)/.test(after)) return 'mult';
  if (token.startsWith('×')) {
    if (/(множитель|multiplier)[^.,;]*$/.test(before)) return 'mult';
    if (/^\s?(к итогу|итог|total)/.test(after)) return 'total';
    return 'total';
  }
  return 'plain';
}

/** Текст эффекта с выделенными числами. */
function effect(text: string): (Node | string)[] {
  const out: (Node | string)[] = [];
  let last = 0;
  for (const m of text.matchAll(NUMBER)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    out.push(h(`b.bn-num.${toneOf(text, i, m[0])}`, null, m[0].trim()));
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function bonusLine(text: string): HTMLElement {
  // Условие — до первого двоеточия, если оно короткое («Вспыхнувший ряд», «Каждую ночь»)
  const colon = text.indexOf(':');
  if (colon > 0 && colon <= 48) {
    return h('div.bonus-line', null, [h('span.bn-when', null, `${text.slice(0, colon + 1)} `), ...effect(text.slice(colon + 1).trim())]);
  }
  return h('div.bonus-line', null, effect(text));
}
