import { bossSigil } from '@/art/sigil';
import type { App } from '@/game/app';
import { named, t } from '@/i18n';
import { canvasImg, dpr, h } from '../dom';
import { omenMedal } from '../hud';
import { button, modal } from '../widgets';
import { screenTitle } from './common';

/**
 * Подарок из обучения картинкой: монета с числом и медали Знамений — читается без слов.
 * Только если первый забег ещё впереди.
 */
function giftRow(app: App): HTMLElement | null {
  const gift = app.profile.tutorialGift;
  if (!gift || app.hasSave) return null;
  return h('div.tut-gift', null, [
    h('div.tut-gift-items', null, [
      h('div.tut-gift-item', null, [h('span.coin.big', { attrs: { 'aria-hidden': 'true' } }), h('b.tut-gift-n', null, String(gift.gold))]),
      ...gift.omens.map((id) => h('div.tut-gift-item', null, [omenMedal(id, 48), h('span.tut-gift-name', null, named('omen', id).name)])),
    ]),
    h('div.tut-gift-caption', null, t('tut.giftCaption')),
  ]);
}

/** Памятка: картинка и подпись в пару слов — то, что пригодится в первой ночи. */
function memo(visual: HTMLElement, caption: string): HTMLElement {
  return h('div.tut-memo', null, [h('div.tut-memo-pic', { attrs: { 'aria-hidden': 'true' } }, visual), h('div.tut-memo-caption', null, caption)]);
}

/** Золотая клетка с подписью созвездия — как на небе. */
function forecastCell(): HTMLElement {
  return h('div.tut-memo-cell', null, [h('span.tut-memo-x', null, '×2'), h('span.tut-memo-name', null, t('combo.pair')), h('span.tut-memo-chip', null, '7')]);
}

/** Поздравление после обучения и переход в первый настоящий забег. */
export function showTutorialDone(app: App): void {
  const m = modal(
    [
      screenTitle(t('tut.doneTitle')),
      giftRow(app),
      h('div.tut-memos', null, [
        memo(forecastCell(), t('tut.memoCell')),
        memo(h('span.tut-pic-q', null, '?'), t('tut.memoGuide')),
        memo(canvasImg(bossSigil('eclipse-moon', 52, dpr()), 52), t('tut.memoEclipse')),
      ]),
      h('div.row.center.wrap', null, [
        button(t('over.menu'), () => {
          m.close();
          void app.goMenu();
        }, { variant: 'secondary' }),
        button(app.hasSave ? t('menu.continue') : t('tut.startRun'), () => {
          m.close();
          if (app.hasSave) void app.route();
          else app.startRun('classic');
        }),
      ]),
    ],
    { dismissable: false, className: 'narrow tut-done' },
  );
}
