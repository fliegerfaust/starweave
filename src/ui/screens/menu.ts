import { SKY_FIGURES, shuffledFigures, starRadius, type SkyFigure } from '@/art/constellations';
import { SKY_LIST } from '@/core/content/skies';
import type { App, Screen } from '@/game/app';
import { dailyNumber, dailyTaken, isUnlocked, todayKey } from '@/meta/profile';
import { dict, named, t } from '@/i18n';
import { track } from '@/analytics';
import { h } from '../dom';
import { icon, type IconName } from '../icons';
import { button, confirmDialog, modal } from '../widgets';
import { showHelp, showSettings } from './common';
import { enterFullscreen, suggestHomeScreen } from '@/platform/fullscreen';
import { challengeScore, type Challenge } from '@/game/challenge';

/** «13 октября» — как люди называют дату. */
function humanDate(key: string): string {
  const [, m, d] = key.split('-').map(Number) as [number, number, number];
  return `${d} ${dict().archive.monthsOf[m - 1]}`;
}

/** Накопленные эффекты звёздности списком. */
function stakeText(stake: number): string {
  const list = dict().menu.stakes;
  if (stake === 0) return list[0]!;
  return list.slice(1, stake + 1).join(' · ');
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Смена созвездия в щели, мс. */
const FIGURE_MS = 9000;
/** Створки купола расходятся один раз за сессию — при возврате из забега меню открыто сразу. */
let domeOpened = false;

/**
 * Главная — «Обсерватория»: мы внутри купола, в щели — живое небо игры и настоящие
 * созвездия. Под куполом одна главная кнопка, атлас вторым, два лёгких режима,
 * всё служебное — в «Библиотеке» (нижний лист).
 */
export class MenuScreen implements Screen {
  private el!: HTMLElement;
  private scroller!: HTMLElement;
  private dome!: SVGSVGElement;
  private scope!: HTMLElement;
  private figureSvg!: SVGSVGElement;
  private figureName!: HTMLElement;
  private plate!: HTMLElement;
  private nav!: HTMLElement;
  private foot!: HTMLElement;
  private timers: number[] = [];
  private resize: ResizeObserver | null = null;
  private queue: SkyFigure[] = [];
  private figure: SkyFigure | null = null;
  /** Без движения: «Меньше движения» или автотест/снимок витрины — купол открыт, созвездие нарисовано сразу. */
  private still = false;

  constructor(private readonly app: App) {}

  mount(root: HTMLElement): void {
    const calm = this.app.settings.reduceMotion || navigator.webdriver;
    this.still = calm;
    this.dome = document.createElementNS(SVG_NS, 'svg');
    this.dome.setAttribute('class', 'dome-shell');
    this.dome.setAttribute('aria-hidden', 'true');
    this.dome.setAttribute('preserveAspectRatio', 'none');
    const shutters = [h('div.dome-shutter.l', { attrs: { 'aria-hidden': 'true' } }), h('div.dome-shutter.r', { attrs: { 'aria-hidden': 'true' } })];
    this.figureSvg = document.createElementNS(SVG_NS, 'svg');
    this.figureSvg.setAttribute('class', 'dome-figure');
    this.figureSvg.setAttribute('viewBox', '0 0 100 100');
    this.figureSvg.setAttribute('aria-hidden', 'true');
    this.figureName = h('div.dome-name', { attrs: { 'aria-live': 'polite' } });
    this.scope = h('div.dome-scope', null, [this.figureSvg, this.figureName]);
    this.plate = h('header.menu-plate');
    this.nav = h('nav.menu-buttons', { attrs: { 'aria-label': t('game.title') } });
    this.foot = h('div.menu-foot');
    this.scroller = h('div.menu', null, [this.scope, this.plate, this.nav, this.foot]);
    this.el = h(`div.observatory${domeOpened || calm ? '.open' : ''}${calm ? '.still' : ''}`, null, [this.dome, ...shutters, this.scroller]);
    root.append(this.el);
    this.render();
    this.drawDome();
    this.resize = new ResizeObserver(() => this.drawDome());
    this.resize.observe(this.el);
    // Высота щели зависит от пульта под ней (шрифты, ссылка «На весь экран») — следим и за ней
    this.resize.observe(this.scope);
    this.wireLibrarySwipe();
    // Любая кнопка меню — жест пользователя: в нём можно развернуть игру на весь экран.
    // Перехват, потому что кнопки гасят всплытие
    this.nav.addEventListener('click', () => {
      if (this.app.platform.id === 'web' && this.app.settings.fullscreen) enterFullscreen();
    }, { capture: true });
    if (!domeOpened && !calm) {
      // Два кадра: закрытые створки успевают нарисоваться, потом расходятся
      this.later(() => this.el.classList.add('open'), 80);
    }
    domeOpened = true;
    this.later(() => this.nextFigure(), calm ? 0 : this.el.classList.contains('open') ? 500 : 1900);
    const challenge = this.app.pendingChallenge;
    if (challenge) {
      this.app.pendingChallenge = null;
      this.offerChallenge(challenge);
    }
  }

  unmount(): void {
    this.timers.forEach((id) => window.clearTimeout(id));
    this.timers = [];
    this.resize?.disconnect();
    this.el.remove();
  }

  private later(fn: () => void, ms: number): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  /** Купол изнутри: тёмная оболочка с кольцами и рёбрами, щель вырезана маской. */
  private drawDome(): void {
    const W = this.el.clientWidth, H = this.el.clientHeight;
    const sw = this.scope.offsetWidth, sh = this.scope.offsetHeight;
    if (!W || !H || !sw) return;
    // Щель начинается под safe area (чёлка, Dynamic Island, шапка Telegram)
    const y0 = this.scope.offsetTop - this.scroller.scrollTop;
    const x0 = (W - sw) / 2, x1 = x0 + sw;
    const r = sw / 2;
    const slit = `M${x0},${y0 + sh} V${y0 + r} A${r},${r} 0 0 1 ${x1},${y0 + r} V${y0 + sh}`;
    let ribs = '';
    for (let i = 1; i <= 9; i++) {
      const ry = sh * 0.55 + i * i * (H / 70);
      ribs += `<ellipse cx="${W / 2}" cy="${y0 - sh * 0.25}" rx="${ry * 1.25}" ry="${ry}"/>`;
    }
    const R = Math.max(W, H) * 1.05;
    for (let i = -6; i <= 6; i++) {
      if (!i) continue;
      const a = i * 0.2;
      ribs += `<line x1="${W / 2 + Math.sign(i) * r}" y1="0" x2="${W / 2 + Math.sin(a) * R}" y2="${Math.cos(a) * R * 0.9}"/>`;
    }
    this.dome.setAttribute('viewBox', `0 0 ${W} ${H}`);
    this.dome.innerHTML = `
      <defs>
        <radialGradient id="dome-spill" cx="50%" cy="22%" r="70%"><stop offset="0" stop-color="#1d1a52"/><stop offset="0.45" stop-color="#0d0b2a"/><stop offset="1" stop-color="#05040f"/></radialGradient>
        <linearGradient id="dome-sill" x1="0" x2="1"><stop offset="0" stop-color="#f6c25b" stop-opacity="0"/><stop offset="0.5" stop-color="#ffe6a8" stop-opacity="0.9"/><stop offset="1" stop-color="#f6c25b" stop-opacity="0"/></linearGradient>
        <mask id="dome-cut"><rect width="${W}" height="${H}" fill="#fff"/><path d="${slit} Z" fill="#000"/></mask>
      </defs>
      <g mask="url(#dome-cut)"><rect width="${W}" height="${H}" fill="url(#dome-spill)"/><g fill="none" stroke="#f6c25b" stroke-opacity="0.08" stroke-width="1">${ribs}</g></g>
      <path d="${slit}" fill="none" stroke="#f6c25b" stroke-opacity="0.55" stroke-width="1.5"/>
      <rect x="${x0 - 30}" y="${y0 + sh - 1}" width="${sw + 60}" height="2" fill="url(#dome-sill)"/>`;
    this.el.style.setProperty('--slit-x', `${x0}px`);
    this.el.style.setProperty('--slit-px', `${sw}px`);
    this.el.style.setProperty('--slit-hpx', `${sh}px`);
    this.el.style.setProperty('--slit-top', `${y0}px`);
  }

  /** Следующее созвездие: звёзды проступают, тянутся линии, затем подпись. */
  private nextFigure(): void {
    // Снимки витрин и автотесты всегда видят одну и ту же Большую Медведицу
    if (!this.queue.length) this.queue = navigator.webdriver ? [...SKY_FIGURES] : shuffledFigures(Math.random, this.figure ?? undefined);
    const fig = this.queue.shift()!;
    this.figure = fig;
    const svg = this.figureSvg;
    svg.classList.remove('fade');
    svg.replaceChildren();
    fig.lines.forEach(([a, b], i) => {
      const [x1, y1] = fig.stars[a]!, [x2, y2] = fig.stars[b]!;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('pathLength', '1');
      line.style.animationDelay = `${0.9 + i * 0.22}s`;
      svg.append(line);
    });
    fig.stars.forEach(([x, y, mag], i) => {
      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', String(x));
      c.setAttribute('cy', String(y));
      c.setAttribute('r', String(starRadius(mag)));
      c.style.animationDelay = `${i * 0.12}s`;
      svg.append(c);
    });
    const name = dict().constellation[fig.id] ?? fig.id;
    this.figureName.classList.remove('on');
    this.figureName.textContent = name;
    this.figureName.setAttribute('aria-label', t('menu.skyName', { name }));
    const calm = this.still;
    this.later(() => this.figureName.classList.add('on'), calm ? 0 : 900 + fig.lines.length * 220);
    if (calm) return;
    this.later(() => {
      svg.classList.add('fade');
      this.figureName.classList.remove('on');
      this.later(() => this.nextFigure(), 950);
    }, FIGURE_MS);
  }

  /** Открыли игру по ссылке друга: показать его итог и предложить тот же расклад. */
  private offerChallenge(c: Challenge): void {
    const app = this.app;
    // Уже играем этот вызов (перезапуск Mini App с той же ссылкой) — не спрашиваем снова
    if (app.hasSave && app.run?.challenge && app.run.seed === c.seed) return;
    track('challenge_open', { ante: c.ante, best: c.best, fresh: app.profile.runs === 0 });
    const sky = SKY_LIST.find((s) => s.id === c.skyId);
    const locked = sky?.unlock.kind === 'atlas' && !app.purchases.has('atlas');
    const stake = c.stake ? `✦${c.stake}` : t('menu.stakeNormal');
    const m = modal(
      [
        h('p.modal-text', null, t('challenge.text', { score: challengeScore(c.ante, c.best) })),
        h('p.hint', null, t('challenge.deck', { sky: named('sky', c.skyId).name, stake })),
        locked ? h('p.hint', null, t('challenge.needAtlas')) : null,
        h('div.row.between', null, [
          button(t('challenge.later'), () => m.close(), { variant: 'ghost' }),
          locked
            ? button(t('challenge.openAtlas'), () => {
                m.close();
                void app.goAtlas('challenge');
              })
            : button(t('challenge.accept'), () => {
                m.close();
                this.guardSave(() => app.startChallenge(c));
              }),
        ]),
      ],
      { title: t('challenge.title'), className: 'narrow' },
    );
  }

  /**
   * Табличка и пульт. Купол и щель не трогаем — пересборка после «Настроек» не должна
   * заново открывать створки и обрывать созвездие.
   */
  private render(): void {
    const app = this.app;
    this.plate.replaceChildren(
      h('h1.logo', null, [
        h('span.logo-main', null, t('game.title').split(' ').map((word) => h('span.logo-word', null, word))),
        t('game.subtitle') ? h('span.logo-sub', null, t('game.subtitle')) : null,
      ]),
      h('p.tagline', null, t('game.tagline')),
    );
    if (this.figure) {
      const name = dict().constellation[this.figure.id] ?? this.figure.id;
      this.figureName.textContent = name;
      this.figureName.setAttribute('aria-label', t('menu.skyName', { name }));
    }
    this.nav.setAttribute('aria-label', t('game.title'));

    const dailyDone = dailyTaken(app.profile) && !(app.run?.daily && !app.run.archive && app.hasSave);
    const newRun = () => this.guardSave(() => this.offerTutorial(() => this.chooseSky()));
    const daily = () => this.guardSave(() => app.startRun('classic', true));
    // Главная кнопка одна: продолжить → обучение для новичка → новый забег
    const primaryKind = app.hasSave ? 'continue' : !app.profile.tutorialDone ? 'tutorial' : 'newRun';
    const primary =
      primaryKind === 'continue' ? button(t('menu.continue'), () => void app.route(), { className: 'menu-primary' })
      : primaryKind === 'tutorial' ? button(t('tut.menuButton'), () => app.startTutorial(), { sub: t('tut.menuSub'), className: 'menu-primary' })
      : button(t('menu.newRun'), newRun, { className: 'menu-primary' });
    // Атлас — второй по важности: та же лёгкость, но своё тихое золото и рамка
    const atlas = button(h('span.menu-atlas-label', null, [icon('astrolabe'), t('atlas.menu')]), () => void app.goAtlas('menu'), {
      variant: 'ghost',
      className: 'menu-atlas',
      ariaLabel: app.purchases.has('atlas') ? `${t('atlas.menu')}, ${t('atlas.menuOwned')}` : `${t('atlas.menu')}, ${t('atlas.menuSub')}`,
    });
    const lite = (name: IconName, label: string, onClick: () => void, opts: { disabled?: boolean; title?: string } = {}) => {
      const b = h('button.menu-lite', { type: 'button', title: opts.title ?? '' }, [icon(name), label]);
      b.disabled = !!opts.disabled;
      b.addEventListener('click', () => {
        if (b.disabled) return;
        app.svc.audio.click();
        onClick();
      });
      return b;
    };
    const pair = h('div.menu-pair', null, [
      primaryKind !== 'newRun' ? lite('play', t('menu.newRun'), newRun) : null,
      lite('daily', dailyDone ? t('menu.dailyDone') : t('menu.daily'), daily, { disabled: dailyDone, title: `№ ${dailyNumber()} · ${humanDate(todayKey())}` }),
    ]);
    const handle = h('button.menu-handle', { type: 'button', attrs: { 'aria-haspopup': 'dialog', 'aria-label': t('menu.libraryOpen') } }, t('menu.library'));
    handle.addEventListener('click', () => {
      app.svc.audio.click();
      this.openLibrary();
    });
    this.nav.replaceChildren(primary, atlas, pair, handle);
    this.foot.replaceChildren(...[this.homeHint()].filter((x): x is HTMLElement => !!x));
  }

  /**
   * «Библиотека» (RD.8, «Пульт»): всё служебное строками — знак, название, подпись, стрелка.
   * На телефоне — лист снизу; в ландшафте и на ПК — окно по центру экрана (не панель у края).
   */
  private openLibrary(): void {
    const app = this.app;
    const lib = dict().menu.lib;
    const item = (name: IconName, title: string, sub: string, run: () => void) => {
      const b = h('button.lib-row', { type: 'button' }, [h('span.lib-ic', null, icon(name)), h('span.lib-lbl', null, [h('b', null, title), h('small', null, sub)]), icon('chevron', 'icon lib-chev')]);
      b.addEventListener('click', () => {
        app.svc.audio.click();
        m.close();
        run();
      });
      return b;
    };
    // Новичку — меньше выбора: архив и кодекс появятся после первого забега
    const items = [
      item('guide', t('menu.howTo'), lib.guide, () => showHelp({ found: app.profile.combosFound })),
      item('learn', t('tut.menuButton'), app.profile.tutorialDone ? lib.tutorial : t('tut.menuSub'), () => this.guardSave(() => app.startTutorial())),
      app.profile.runs > 0 ? item('archive', t('archive.menu'), lib.archive, () => void app.goArchive()) : null,
      app.profile.runs > 0 ? item('codex', t('menu.codex'), lib.codex, () => void import('./codex').then(({ showCodex }) => showCodex(app))) : null,
      item('settings', t('menu.settings'), lib.settings, () => showSettings(app, () => this.render())),
    ];
    const m = modal(
      [h('div.lib-list', null, items), h('p.lib-ver', null, `v${__APP_VERSION__}`)],
      { title: t('menu.library'), sheet: !document.body.classList.contains('landscape'), className: 'library' },
    );
  }

  /** Свайп вверх у нижнего края открывает библиотеку — если меню не прокручивается само. */
  private wireLibrarySwipe(): void {
    let start: { y: number; t: number } | null = null;
    this.scroller.addEventListener('pointerdown', (e) => {
      const fits = this.scroller.scrollHeight <= this.scroller.clientHeight + 1;
      start = fits && e.clientY > this.scroller.clientHeight * 0.7 ? { y: e.clientY, t: performance.now() } : null;
    });
    this.scroller.addEventListener('pointerup', (e) => {
      if (start && start.y - e.clientY > 50 && performance.now() - start.t < 700) this.openLibrary();
      start = null;
    });
    this.scroller.addEventListener('pointercancel', () => (start = null));
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

  /**
   * iPhone в браузере: развернуть игру нельзя, но с экрана «Домой» она открывается без
   * панелей браузера. Короткая ссылка внизу меню открывает пошаговую инструкцию.
   */
  private homeHint(): HTMLElement | null {
    const app = this.app;
    if (app.platform.id !== 'web' || app.settings.homeHintSeen || !suggestHomeScreen()) return null;
    const link = h('button.link-btn.home-link', { type: 'button' }, t('home.link'));
    link.addEventListener('click', () => {
      const m = modal(
        [
          h('p.modal-text', null, t('home.why')),
          h('ol.home-steps', null, dict().home.steps.map((step) => h('li', null, step))),
          h('div.row.center', null, button(t('home.ok'), () => {
            app.applySettings({ ...app.settings, homeHintSeen: true });
            m.close();
            link.remove();
          })),
        ],
        { title: t('home.title'), className: 'narrow' },
      );
    });
    return link;
  }

  private chooseSky(): void {
    const app = this.app;
    const owned = app.purchases.owned;
    // Первый забег — сразу классика; колоды атласа видны в списке, когда открыто что-то ещё
    if (app.profile.maxStake === 0 && app.profile.unlockedSkies.length <= 1 && !SKY_LIST.slice(1).some((s) => isUnlocked(s.unlock, app.profile, owned))) {
      app.startRun('classic');
      return;
    }
    let chosen = 'classic';
    const list = h('div.sky-list');
    const items: HTMLElement[] = [];
    for (const sky of SKY_LIST) {
      const unlocked = app.profile.unlockedSkies.includes(sky.id) || isUnlocked(sky.unlock, app.profile, owned);
      const atlasLocked = !unlocked && sky.unlock.kind === 'atlas';
      const { name, desc } = named('sky', sky.id);
      const lockText = sky.unlock.kind === 'default' ? '' : t(`unlock.${sky.unlock.kind}`, { n: 'ante' in sky.unlock ? sky.unlock.ante : 'lines' in sky.unlock ? sky.unlock.lines : '' });
      const item = h(`button.sky-item${unlocked ? '' : '.locked'}${atlasLocked ? '.atlas-sky' : ''}`, { type: 'button' }, [
        h('div.sky-name', null, unlocked ? name : atlasLocked ? `✦ ${name}` : `🔒 ${name}`),
        h('div.sky-desc', null, unlocked ? desc : atlasLocked ? `${desc}. ${lockText} ›` : lockText),
      ]);
      if (sky.id === chosen) item.classList.add('on');
      item.addEventListener('click', () => {
        if (atlasLocked) {
          m.close();
          void app.goAtlas('sky', 'astrolabe');
          return;
        }
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
      const wrap = h('div.segmented', { attrs: { role: 'group', 'aria-label': t('menu.stake') } });
      for (let i = 0; i <= app.profile.maxStake; i++) {
        const b = h('button.seg', { type: 'button', attrs: { 'aria-pressed': String(i === stake) } }, i === 0 ? t('menu.stakeNormal') : `✦${i}`);
        if (i === stake) b.classList.add('on');
        b.addEventListener('click', () => {
          stake = i;
          wrap.querySelectorAll('.seg').forEach((x) => {
            x.classList.remove('on');
            x.setAttribute('aria-pressed', 'false');
          });
          b.setAttribute('aria-pressed', 'true');
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
