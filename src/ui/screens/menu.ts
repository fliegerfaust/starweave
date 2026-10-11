import { cardFace } from '@/art/card';
import { SKY_LIST } from '@/core/content/skies';
import type { Card } from '@/core/types';
import type { App, Screen } from '@/game/app';
import { dailyTaken, isUnlocked, todayKey } from '@/meta/profile';
import { named, t } from '@/i18n';
import { canvasImg, dpr, h } from '../dom';
import { button, confirmDialog, modal } from '../widgets';
import { showHelp, showSettings } from './common';

const DECOR: Pick<Card, 'suit' | 'rank'>[] = [
  { suit: 'moon', rank: 7 },
  { suit: 'sun', rank: 9 },
  { suit: 'star', rank: 5 },
];

export class MenuScreen implements Screen {
  private el!: HTMLElement;

  constructor(private readonly app: App) {}

  mount(root: HTMLElement): void {
    this.el = h('div.menu');
    root.append(this.el);
    this.render();
  }

  unmount(): void {
    this.el.remove();
  }

  private render(): void {
    const app = this.app;
    const fan = h('div.menu-fan');
    DECOR.forEach((card, i) => {
      const img = canvasImg(cardFace(card, 96, dpr()), 96 * 1.24, (96 / 0.7) * 1.24, 'fan-card');
      img.style.setProperty('--i', String(i - 1));
      fan.append(img);
    });
    const dailyDone = dailyTaken(app.profile) && !(app.run?.daily && app.hasSave);
    const buttons = h('div.menu-buttons', null, [
      app.hasSave ? button(t('menu.continue'), () => void app.route()) : null,
      button(t('menu.newRun'), () => this.guardSave(() => this.chooseSky()), { variant: app.hasSave ? 'secondary' : 'primary' }),
      button(dailyDone ? t('menu.dailyDone') : t('menu.daily'), () => this.guardSave(() => app.startRun('classic', true)), {
        variant: 'secondary',
        disabled: dailyDone,
        sub: todayKey(),
      }),
      h('div.row.gap', null, [
        button(t('menu.codex'), () => void import('./codex').then(({ showCodex }) => showCodex(app)), { variant: 'ghost' }),
        button(t('menu.howTo'), () => showHelp(), { variant: 'ghost' }),
        button(t('menu.settings'), () => showSettings(app, () => this.rerender()), { variant: 'ghost' }),
      ]),
    ]);
    this.el.replaceChildren(
      h('div.menu-hero', null, [
        fan,
        h('h1.logo', null, [h('span.logo-main', null, 'STARWEAVE'), h('span.logo-sub', null, t('game.subtitle'))]),
        h('p.tagline', null, t('game.tagline')),
      ]),
      buttons,
      h('div.menu-foot', null, 'v0.1.0'),
    );
  }

  /** Новый забег затирает сохранённый — спрашиваем. */
  private guardSave(next: () => void): void {
    if (!this.app.hasSave) return next();
    confirmDialog(t('menu.overwrite'), next, 'primary');
  }

  private rerender(): void {
    this.render();
  }

  private chooseSky(): void {
    const app = this.app;
    if (app.profile.unlockedSkies.length <= 1 && !SKY_LIST.slice(1).some((s) => isUnlocked(s.unlock, app.profile))) {
      app.startRun('classic');
      return;
    }
    let chosen = 'classic';
    const list = h('div.sky-list');
    const items: HTMLElement[] = [];
    for (const sky of SKY_LIST) {
      const unlocked = app.profile.unlockedSkies.includes(sky.id) || isUnlocked(sky.unlock, app.profile);
      const { name, desc } = named('sky', sky.id);
      const lockText = sky.unlock.kind === 'default' ? '' : t(`unlock.${sky.unlock.kind}`, { n: 'ante' in sky.unlock ? sky.unlock.ante : 'lines' in sky.unlock ? sky.unlock.lines : '' });
      const item = h(`button.sky-item${unlocked ? '' : '.locked'}`, { type: 'button' }, [
        h('div.sky-name', null, unlocked ? name : `🔒 ${name}`),
        h('div.sky-desc', null, unlocked ? desc : lockText),
      ]);
      if (sky.id === chosen) item.classList.add('on');
      item.addEventListener('click', () => {
        if (!unlocked) return;
        chosen = sky.id;
        items.forEach((x) => x.classList.remove('on'));
        item.classList.add('on');
        app.svc.audio.click();
      });
      items.push(item);
      list.append(item);
    }
    const m = modal(
      [
        list,
        h('div.row.between', null, [
          button(t('menu.back'), () => m.close(), { variant: 'secondary' }),
          button(t('menu.start'), () => {
            m.close();
            app.startRun(chosen);
          }),
        ]),
      ],
      { title: t('menu.chooseSky') },
    );
  }
}
