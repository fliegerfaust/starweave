import { chartIcon, omenSigil, ritualIcon, bossSigil } from '@/art/sigil';
import { GLYPHS, type Card, type Glyph } from '@/core/types';
import { dict, t } from '@/i18n';
import { canvasImg, dpr, h } from '../dom';
import { button, modal } from '../widgets';
import { track } from '@/analytics';
import { cardThumb } from './common';
import { rich } from '../rich';

/**
 * Справочник: каждый термин — короткая зацикленная анимация и пара фраз простым
 * языком. Анимации собраны из миниатюр карт и CSS — без отдельных ассетов.
 */

const W = 52;
let fakeId = -1;
const card = (suit: Card['suit'], rank: number, glyph?: Glyph): Card => ({ id: fakeId--, suit, rank, ...(glyph ? { glyph } : {}) });

/** Всплывающая подпись, которая повторяется по кругу. */
const pop = (text: string, cls: string, delay = 0) => h(`span.g-pop.${cls}`, { style: { animationDelay: `${delay}s` } }, text);

const stage = (children: (Node | null)[], cls = '') => h(`div.g-stage${cls ? `.${cls}` : ''}`, null, children);

const thumb = (c: Card, cls = '') => {
  const wrap = h(`div.g-card${cls ? `.${cls}` : ''}`, null, cardThumb(c, W));
  return wrap;
};

function lineDemo(): HTMLElement {
  const cards = [card('sun', 3), card('moon', 3), card('star', 7), card('comet', 5)];
  return stage([h('div.g-line', null, cards.map((c, i) => thumb(c, `fill d${i}`))), h('div.g-glow')], 'line');
}

function formulaDemo(): HTMLElement {
  return stage([
    h('div.g-formula', null, [h('span.g-box.light', null, '28'), h('span', null, '×'), h('span.g-box.mult', null, '2'), h('span', null, '='), h('span.g-box.total', null, '56')]),
  ]);
}

function crossDemo(): HTMLElement {
  const grid = h('div.g-grid');
  const filled = new Set([0, 1, 5, 8]);
  for (let i = 0; i < 9; i++) {
    const cell = h(`div.g-cell${filled.has(i) ? '.on' : ''}${i === 2 ? '.x' : ''}`, null, i === 2 ? '×2' : '');
    grid.append(cell);
  }
  return stage([grid, pop('×2', 'mult', 0.6)], 'cross');
}

function burnDemo(): HTMLElement {
  return stage([thumb(card('comet', 1), 'burn'), thumb(card('star', 8), 'fresh')], 'burn');
}

function glyphDemo(glyph: Glyph): HTMLElement {
  const c = card(glyph === 'prism' ? 'star' : 'moon', 7, glyph);
  const parts: (Node | null)[] = [thumb(c, glyph === 'glass' ? 'shake' : 'bob')];
  switch (glyph) {
    case 'echo':
      parts.push(pop('+7', 'light', 0), pop('+7', 'light', 0.7));
      break;
    case 'glass':
      parts.push(pop('×2', 'mult', 0), pop('1/4 💥', 'warn', 0.8));
      break;
    case 'prism':
      parts.push(h('div.g-orbit', null, ['☀', '☾', '✦', '☄'].map((s, i) => h('span', { style: { animationDelay: `${-i * 0.5}s` } }, s))));
      break;
    case 'blazing':
      parts.push(pop('+4', 'mult', 0.2));
      break;
    case 'radiant':
      parts.push(pop('+30', 'light', 0.2));
      break;
    case 'gilded':
      parts.push(pop('+2 ◆', 'gold', 0.2));
      break;
  }
  return stage(parts, 'glyph');
}

function iconDemo(icon: HTMLCanvasElement): HTMLElement {
  return stage([h('div.g-icon', null, icon)]);
}

function entry(title: string, text: string, visual: HTMLElement, id?: string): HTMLElement {
  return h('div.g-entry', { dataset: id ? { guide: id } : {} }, [visual, h('div.g-text', null, [h('div.g-title', null, title), h('div.g-desc', null, rich(text))])]);
}

/** Открывает справочник; `focus` — id раздела, к которому прокрутить (например, `glyph-echo`). */
export function showGuide(focus?: string): void {
  track('guide_open', { focus: focus ?? '' });
  const g = dict().guide;
  const s = dpr();
  const entries: HTMLElement[] = [
    h('ol.help-list.g-rules', null, dict().help.body.map((line) => h('li', null, line))),
    entry(g.line[0], g.line[1], lineDemo(), 'line'),
    entry(g.formula[0], g.formula[1], formulaDemo(), 'formula'),
    entry(g.cross[0], g.cross[1], crossDemo(), 'cross'),
    entry(g.burn[0], g.burn[1], burnDemo(), 'burn'),
    entry(g.omens[0], g.omens[1], iconDemo(canvasImg(omenSigil('stardust', 56, s), 56)), 'omens'),
    entry(g.charts[0], g.charts[1], iconDemo(canvasImg(chartIcon('pair', 56, s), 56)), 'charts'),
    entry(g.rituals[0], g.rituals[1], iconDemo(canvasImg(ritualIcon('transmute-star', 56, s), 56)), 'rituals'),
    h('h3.g-section', null, g.glyphs[0]),
    h('p.hint', null, g.glyphs[1]),
    ...GLYPHS.map((gl) => entry(t(`glyph.${gl}`), dict().glyphDesc[gl], glyphDemo(gl), `glyph-${gl}`)),
    h('h3.g-section', null, '✦'),
    entry(g.eclipse[0], g.eclipse[1], iconDemo(canvasImg(bossSigil('eclipse-moon', 56, s), 56)), 'eclipse'),
    entry(g.gold[0], g.gold[1], stage([h('div.g-coin'), pop('+1', 'gold', 0.3)]), 'gold'),
  ];
  const m = modal([h('div.g-list', null, entries), h('div.row.end', null, button(t('menu.back'), () => m.close(), { variant: 'secondary' }))], {
    title: g.title,
    className: 'guide',
  });
  if (focus) {
    const target = m.el.querySelector<HTMLElement>(`[data-guide="${focus}"]`);
    if (target) {
      target.classList.add('focus');
      requestAnimationFrame(() => target.scrollIntoView({ block: 'center' }));
    }
  }
}
