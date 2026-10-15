import type { Card, Glyph } from '@/core/types';
import { h } from './dom';
import { cardThumb } from './screens/common';

/**
 * Короткие зацикленные картинки из миниатюр карт и CSS: линия, формула, крест, сжигание.
 * Ими пользуется обучение (`tutorial/pictos.ts`).
 */

const W = 52;
let fakeId = -1;
const card = (suit: Card['suit'], rank: number, glyph?: Glyph): Card => ({ id: fakeId--, suit, rank, ...(glyph ? { glyph } : {}) });

/** Всплывающая подпись, которая повторяется по кругу. */
export const pop = (text: string, cls: string, delay = 0) => h(`span.g-pop.${cls}`, { style: { animationDelay: `${delay}s` } }, text);

export const stage = (children: (Node | null)[], cls = '') => h(`div.g-stage${cls ? `.${cls}` : ''}`, null, children);

const thumb = (c: Card, cls = '') => {
  const wrap = h(`div.g-card${cls ? `.${cls}` : ''}`, null, cardThumb(c, W));
  return wrap;
};

export function lineDemo(): HTMLElement {
  const cards = [card('sun', 3), card('moon', 3), card('star', 7), card('comet', 5)];
  return stage([h('div.g-line', null, cards.map((c, i) => thumb(c, `fill d${i}`))), h('div.g-glow')], 'line');
}

export function formulaDemo(): HTMLElement {
  return stage([
    h('div.g-formula', null, [h('span.g-box.light', null, '28'), h('span', null, '×'), h('span.g-box.mult', null, '2'), h('span', null, '='), h('span.g-box.total', null, '56')]),
  ]);
}

export function crossDemo(): HTMLElement {
  const grid = h('div.g-grid');
  const filled = new Set([0, 1, 5, 8]);
  for (let i = 0; i < 9; i++) {
    const cell = h(`div.g-cell${filled.has(i) ? '.on' : ''}${i === 2 ? '.x' : ''}`, null, i === 2 ? '×2' : '');
    grid.append(cell);
  }
  return stage([grid, pop('×2', 'mult', 0.6)], 'cross');
}

export function burnDemo(): HTMLElement {
  return stage([thumb(card('comet', 1), 'burn'), thumb(card('star', 8), 'fresh')], 'burn');
}
