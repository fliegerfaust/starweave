import { h } from './dom';
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

/**
 * Подсказка обучения: `*действие*` выделено цветом, остальное — обычный текст (GO.2, отзыв
 * Ярослава: глаз цепляется за то, что сделать, а не читает всю фразу).
 */
export function actionText(text: string): HTMLElement {
  return h('span', null, text.split('*').map((part, i) => (i % 2 ? h('b.tut-act', null, part) : part)));
}
