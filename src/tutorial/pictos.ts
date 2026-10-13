import { omenMedal } from '@/ui/hud';
import { burnDemo, crossDemo, formulaDemo, lineDemo, pop, stage } from '@/ui/screens/guide';
import { cardThumb } from '@/ui/screens/common';
import { h } from '@/ui/dom';
import type { Card, Suit } from '@/core/types';

/**
 * Картинки к шагам обучения: текст пузыря могут не читать, поэтому суть каждого шага
 * видна из игровых же элементов — карта, линия, крест, медаль Знамения, монета.
 */

const SUIT: Record<string, Suit> = { s: 'sun', m: 'moon', t: 'star', c: 'comet' };
let fakeId = -7000;

function thumbOf(code: string, width = 34): HTMLCanvasElement {
  const card: Card = { id: fakeId--, rank: Number(code.slice(0, -1)), suit: SUIT[code.slice(-1)]! };
  return cardThumb(card, width);
}

/** Карта, которую просят положить: ранг и масть — с одного взгляда. */
export function cardPic(code: string): HTMLElement {
  return stage([h('div.tut-pic-card', null, thumbOf(code, 40))], 'tut-pic');
}

const cards = (...codes: string[]) => stage([h('div.tut-pic-hand', null, codes.map((c) => thumbOf(c, 30)))], 'tut-pic');

/** Пиктограмма шага обучения по его ключу; null — шаг без картинки. */
export function stepPic(key: string): HTMLElement | null {
  switch (key) {
    case 'board':
      return cards('3s', '7t', '5c');
    case 'almost':
      return lineDemo();
    case 'watchFormula':
      return formulaDemo();
    case 'target':
      return stage([h('div.tut-pic-target', null, [h('b', null, '150'), h('div.tut-pic-bar')])], 'tut-pic');
    case 'combos':
      return stage([h('span.tut-pic-q', null, '?')], 'tut-pic');
    case 'burn':
      return burnDemo();
    case 'prepare':
    case 'crossCell':
    case 'cross':
      return crossDemo();
    case 'reward':
      return stage([h('div.g-coin'), pop('+', 'gold', 0.3)], 'tut-pic');
    case 'shop':
    case 'buyOmen':
    case 'omenSlot':
    case 'night2':
      return stage([omenMedal('stardust', 52)], 'tut-pic');
    case 'omenWorked':
      return stage([omenMedal('stardust', 52), pop('+4', 'mult', 0.2)], 'tut-pic');
    case 'freePlay':
      return cards('6s', '6m', '6t');
    default:
      return null;
  }
}
