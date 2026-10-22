import { kwText } from './keywords';

/**
 * Описание эффекта (Знамение, Затмение, глиф): слова механики — нажимаемые ключевые слова
 * в цвет коробок формулы (FX.4): свет голубой, множитель розовый, «множитель ×» розово-золотой,
 * золото жёлтое. Касание открывает подсказку, слово в ней ведёт дальше (`keywords.ts`).
 */
export function rich(text: string): HTMLElement {
  const el = kwText(text, true);
  el.classList.add('rich');
  return el;
}
