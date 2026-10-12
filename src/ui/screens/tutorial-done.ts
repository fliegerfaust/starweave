import type { App } from '@/game/app';
import { t } from '@/i18n';
import { h } from '../dom';
import { button, modal } from '../widgets';
import { screenTitle } from './common';

/** Поздравление после обучения и переход в первый настоящий забег. */
export function showTutorialDone(app: App): void {
  const m = modal(
    [
      screenTitle(t('tut.doneTitle')),
      h('p.modal-text', null, t('tut.doneText')),
      h('ul.help-list', null, [t('tut.doneTip1'), t('tut.doneTip2'), t('tut.doneTip3')].map((x) => h('li', null, x))),
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
    { dismissable: false, className: 'narrow' },
  );
}
