import { cardFace } from '@/art/card';
import { SKY_LIST } from '@/core/content/skies';
import type { Card } from '@/core/types';
import type { App, Screen } from '@/game/app';
import { dailyTaken, isUnlocked, todayKey } from '@/meta/profile';
import { dict, named, t } from '@/i18n';
import { canvasImg, dpr, h } from '../dom';
import { button, confirmDialog, modal } from '../widgets';
import { showHelp, showSettings } from './common';
import { enterFullscreen, suggestHomeScreen } from '@/platform/fullscreen';

/** Накопленные эффекты звёздности списком. */
function stakeText(stake: number): string {
  const list = dict().menu.stakes;
  if (stake === 0) return list[0]!;
  return list.slice(1, stake + 1).join(' · ');
}

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
      !app.profile.tutorialDone ? button(t('tut.menuButton'), () => app.startTutorial(), { sub: t('tut.menuSub') }) : null,
      button(t('menu.newRun'), () => this.guardSave(() => this.offerTutorial(() => this.chooseSky())), {
        variant: app.hasSave || !app.profile.tutorialDone ? 'secondary' : 'primary',
      }),
      button(dailyDone ? t('menu.dailyDone') : t('menu.daily'), () => this.guardSave(() => app.startRun('classic', true)), {
        variant: 'secondary',
        disabled: dailyDone,
        sub: todayKey(),
      }),
      h('div.menu-grid', null, [
        app.profile.tutorialDone ? button(t('tut.menuButton'), () => app.startTutorial(), { variant: 'ghost' }) : null,
        button(t('menu.codex'), () => void import('./codex').then(({ showCodex }) => showCodex(app)), { variant: 'ghost' }),
        button(t('menu.howTo'), () => showHelp(), { variant: 'ghost' }),
        button(t('menu.settings'), () => showSettings(app, () => this.rerender()), { variant: 'ghost' }),
      ]),
    ]);
    // Любая кнопка меню — жест пользователя: в нём можно развернуть игру на весь экран
    buttons.addEventListener('click', () => {
      if (app.platform.id === 'web' && app.settings.fullscreen) enterFullscreen();
    }, { capture: true });
    this.el.replaceChildren(
      h('div.menu-hero', null, [
        fan,
        h('h1.logo', null, [
          h('span.logo-main', null, t('game.title').split(' ').map((word) => h('span.logo-word', null, word))),
          t('game.subtitle') ? h('span.logo-sub', null, t('game.subtitle')) : null,
        ]),
        h('p.tagline', null, t('game.tagline')),
      ]),
      buttons,
      h('div.menu-foot', null, `v${__APP_VERSION__}`),
    );
    const hint = this.homeHint();
    if (hint) this.el.insertBefore(hint, this.el.lastChild);
  }

  /** Новичку перед первым забегом предлагаем обучение. */
  private offerTutorial(next: () => void): void {
    const app = this.app;
    if (app.profile.tutorialDone || app.profile.runs > 0) return next();
    const m = modal(
      [
        h('p.modal-text', null, t('tut.offer')),
        h('div.row.between', null, [
          button(t('tut.offerSkip'), () => {
            m.close();
            app.profile.tutorialDone = true;
            app.persistProfile();
            next();
          }, { variant: 'ghost' }),
          button(t('tut.menuButton'), () => {
            m.close();
            app.startTutorial('offer');
          }),
        ]),
      ],
      { className: 'narrow' },
    );
  }

  /** Новый забег затирает сохранённый — спрашиваем. */
  private guardSave(next: () => void): void {
    if (!this.app.hasSave) return next();
    confirmDialog(t('menu.overwrite'), next, 'primary');
  }

  /** iPhone в браузере: подсказка, как играть без панелей браузера. Показывается, пока не закроют. */
  private homeHint(): HTMLElement | null {
    const app = this.app;
    if (app.platform.id !== 'web' || app.settings.homeHintSeen || !suggestHomeScreen()) return null;
    const el = h('div.home-hint', null, [
      h('span', null, t('settings.homeHint')),
      button(t('settings.homeHintOk'), () => {
        app.applySettings({ ...app.settings, homeHintSeen: true });
        el.remove();
      }, { variant: 'ghost', className: 'small' }),
    ]);
    return el;
  }

  private rerender(): void {
    this.render();
  }

  private chooseSky(): void {
    const app = this.app;
    if (app.profile.maxStake === 0 && app.profile.unlockedSkies.length <= 1 && !SKY_LIST.slice(1).some((s) => isUnlocked(s.unlock, app.profile))) {
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
    let stake = 0;
    const stakeInfo = h('div.hint');
    const stakeField = app.profile.maxStake > 0 ? h('div.field', null, [h('span.field-label', null, t('menu.stake')), (() => {
      const wrap = h('div.segmented');
      for (let i = 0; i <= app.profile.maxStake; i++) {
        const b = h('button.seg', { type: 'button' }, i === 0 ? '—' : '✦'.repeat(i));
        if (i === stake) b.classList.add('on');
        b.addEventListener('click', () => {
          stake = i;
          wrap.querySelectorAll('.seg').forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          stakeInfo.textContent = stakeText(i);
          app.svc.audio.click();
        });
        wrap.append(b);
      }
      return wrap;
    })(), stakeInfo]) : null;
    stakeInfo.textContent = stakeText(0);
    const m = modal(
      [
        list,
        stakeField,
        h('div.row.between', null, [
          button(t('menu.back'), () => m.close(), { variant: 'secondary' }),
          button(t('menu.start'), () => {
            m.close();
            app.startRun(chosen, false, stake);
          }),
        ]),
      ],
      { title: t('menu.chooseSky') },
    );
  }
}
