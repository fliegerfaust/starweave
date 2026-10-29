import { h } from './dom';
import { kwText } from './keywords';

/**
 * Бонус одной строкой (RD.4, «Прилавок», решение Дениса): условие до двоеточия приглушено,
 * результат — обычным цветом, а слова механики — нажимаемые ключевые слова в цвет формулы
 * ночи (FX.4): касание объясняет, что такое множитель, свет, «разбиться».
 *
 * «Вспыхнувший ряд: +6 к множителю» → <приглушено>Вспыхнувший ряд:</приглушено> <ключ>+6 к множителю</ключ>
 */
export function bonusLine(text: string): HTMLElement {
  // Условие — до первого двоеточия, если оно короткое («Вспыхнувший ряд», «Каждую ночь»)
  const colon = text.indexOf(':');
  if (colon > 0 && colon <= 48) {
    // В условии тоже бывают слова механики («Каждый миф:») — их объясняет подсказка (KW.1)
    return h('div.bonus-line', null, [h('span.bn-when', null, [kwText(text.slice(0, colon + 1), true), ' ']), kwText(text.slice(colon + 1).trim(), true)]);
  }
  return h('div.bonus-line', null, kwText(text, true));
}
