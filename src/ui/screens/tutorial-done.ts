import type { App } from '@/game/app';
import { dict, t } from '@/i18n';
import { h } from '../dom';
import { button, modal } from '../widgets';

/**
 * «Обучение пройдено» (RD.9, «Нить к цели»): выученные приёмы цепочкой — загораются по
 * очереди, как ночи на карте главы; подарок монетой; две кнопки по своей ширине (без
 * растянутой «Начать забег» на широком экране).
 */
export function showTutorialDone(app: App, short = false): void {
  // Короткое обучение первого запуска кончается до Обсерватории: без «Знамений»
  const all = dict().tut.learned;
  const learned = short ? all.slice(0, -1) : all;
  const chain = h('div.tut-chain', { attrs: { 'aria-label': learned.join(', ') } }, learned.map((name, i) => {
    const star = h('i');
    star.style.setProperty('--d', `${0.2 + i * 0.15}s`);
    return h('span', null, [star, name]);
  }));
  const gift = app.profile.tutorialGift;
  const giftRow = gift && !app.runs.hasSave
    ? h('div.tut-gift', null, [h('span.coin.big', { attrs: { 'aria-hidden': 'true' } }), h('b', null, `+${gift.gold}`), h('span', null, t('tut.giftCaption'))])
    : null;
  const m = modal(
    [
      h('h2.tut-done-title', null, t('tut.doneTitle')),
      h('p.tut-done-sub', null, t(short ? 'tut.doneSubShort' : 'tut.doneSub')),
      chain,
      giftRow,
      h('div.tut-done-acts', null, [
        button(t('over.menu'), () => {
          m.close();
          void app.router.goMenu();
        }, { variant: 'secondary' }),
        button(app.runs.hasSave ? t('menu.continue') : t('tut.startRun'), () => {
          m.close();
          if (app.runs.hasSave) void app.router.route();
          else app.runs.startRunAfterTutorial();
        }),
      ]),
    ],
    { dismissable: false, className: 'narrow tut-done' },
  );
}
