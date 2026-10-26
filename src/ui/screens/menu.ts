import { SKY_FIGURES, shuffledFigures, starRadius, type SkyFigure } from '@/art/constellations';
import { SKY_LIST } from '@/core/content/skies';
import type { App, Screen } from '@/game/app';
import { dailyNumber, dailyTaken, isUnlocked, todayKey } from '@/meta/profile';
import { dict, named, num, t } from '@/i18n';
import { track } from '@/analytics';
import { h } from '../dom';
import { icon, type IconName } from '../icons';
import { findShelf } from '../find-shelf';
import { button, modal } from '../widgets';
import { cardThumb, confirmNewRun, showCollection, showHelp, showSettings } from './common';
import type { Card, Glyph, Suit } from '@/core/types';
import { enterFullscreen, suggestHomeScreen } from '@/platform/fullscreen';
import type { Challenge } from '@/game/challenge';

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

/** Небо — картинкой: веер из характерных карт его колоды (RD.10, «Табличка»). */
const SKY_FAN: Record<string, [number, Suit, Glyph?][]> = {
  classic: [[9, 'sun'], [5, 'moon'], [7, 'star']],
  twins: [[7, 'sun'], [4, 'moon'], [7, 'sun']],
  wanderer: [[8, 'comet'], [2, 'star'], [6, 'comet']],
  abyss: [[1, 'moon'], [3, 'sun'], [2, 'star']],
  gilded: [[3, 'sun'], [7, 'sun', 'gilded'], [9, 'sun']],
  astrolabe: [[9, 'moon', 'prism'], [9, 'star', 'radiant'], [8, 'sun', 'glass']],
};
let fanId = -7000;

/** Веер карт неба шириной карты `w`; закрытое небо — тусклое, с замком. */
export function skyFan(skyId: string, w: number, locked = false): HTMLElement {
  const cards = SKY_FAN[skyId] ?? SKY_FAN.classic!;
  const n = cards.length;
  return h(`span.sky-fan${locked ? '.off' : ''}`, { style: `--cw: ${w}px`, attrs: { 'aria-hidden': 'true' } }, [
    ...cards.map(([rank, suit, glyph], i) => {
      const k = i - (n - 1) / 2;
      return h('span.sky-fan-card', { style: { transform: `translateX(calc(-50% + ${k * w * 0.32}px)) rotate(${k * 13}deg)` } }, cardThumb({ id: fanId--, rank, suit, ...(glyph ? { glyph } : {}) } as Card, w));
    }),
    locked ? h('span.sky-fan-lock', null, icon('lock')) : null,
  ]);
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
    if (app.runs.hasSave && app.run?.challenge && app.run.seed === c.seed) return;
    track('challenge_open', { ante: c.ante, best: c.best, fresh: app.profile.runs === 0 });
    const sky = SKY_LIST.find((s) => s.id === c.skyId);
    const locked = sky?.unlock.kind === 'atlas' && !app.money.purchases.has('atlas');
    const stake = c.stake ? t('map.stake', { n: c.stake }) : t('menu.stakeNormal');
    const all = c.ante > 8;
    const m = modal(
      [
        h('div.win-stats', null, [
          h('div', null, [h('b', null, all ? '8' : String(c.ante)), h('small', null, all ? t('challenge.chapters') : t('challenge.chapter'))]),
          h('div', null, [h('b', null, num(c.best)), h('small', null, t('challenge.bestMove'))]),
        ]),
        h('p.modal-text', null, t('challenge.lede')),
        h('div.deck-line', null, [skyFan(c.skyId, 22, false), h('span', null, [h('b', null, named('sky', c.skyId).name), ` · ${stake}`])]),
        locked ? h('p.hint', null, t('challenge.needAtlas')) : null,
        h('div.win-acts', null, [
          button(t('challenge.later'), () => m.close(), { variant: 'ghost' }),
          locked
            ? button(t('challenge.openAtlas'), () => {
                m.close();
                void app.router.goAtlas('challenge');
              })
            : button(t('challenge.accept'), () => {
                m.close();
                this.guardSave(() => app.runs.startChallenge(c));
              }),
        ]),
      ],
      { title: t('challenge.title'), className: 'narrow challenge' },
    );
  }

  /**
   * Табличка и пульт. Купол и щель не трогаем — пересборка после «Настроек» не должна
   * заново открывать створки и обрывать созвездие.
   */
  private render(): void {
    const app = this.app;
    this.plate.replaceChildren(...[
      h('h1.logo', null, [
        h('span.logo-main', null, t('game.title').split(' ').map((word) => h('span.logo-word', null, word))),
        t('game.subtitle') ? h('span.logo-sub', null, t('game.subtitle')) : null,
      ]),
      h('p.tagline', null, t('game.tagline')),
      // Полка находок (CL.1) — после первого забега, когда есть что показать
      app.profile.runs > 0 ? findShelf(app.profile, (focus) => this.openCollection(focus)) : null,
    ].filter((x): x is HTMLElement => !!x));
    if (this.figure) {
      const name = dict().constellation[this.figure.id] ?? this.figure.id;
      this.figureName.textContent = name;
      this.figureName.setAttribute('aria-label', t('menu.skyName', { name }));
    }
    this.nav.setAttribute('aria-label', t('game.title'));

    const dailyDone = dailyTaken(app.profile) && !(app.run?.daily && !app.run.archive && app.runs.hasSave);
    const newRun = () => this.guardSave(() => this.offerTutorial(() => this.chooseSky()));
    const daily = () => this.guardSave(() => app.runs.startRun('classic', true));
    // Главная кнопка одна: продолжить → обучение для новичка → новый забег
    const primaryKind = app.runs.hasSave ? 'continue' : !app.profile.tutorialDone ? 'tutorial' : 'newRun';
    const primary =
      primaryKind === 'continue' ? button(t('menu.continue'), () => void app.router.route(), { className: 'menu-primary' })
      : primaryKind === 'tutorial' ? button(t('tut.menuButton'), () => app.runs.startTutorial(), { sub: t('tut.menuSub'), className: 'menu-primary' })
      : button(t('menu.newRun'), newRun, { className: 'menu-primary' });
    // Атлас — второй по важности: та же лёгкость, но своё тихое золото и рамка
    const atlas = button(h('span.menu-atlas-label', null, [icon('astrolabe'), t('atlas.menu')]), () => void app.router.goAtlas('menu'), {
      variant: 'ghost',
      className: 'menu-atlas',
      ariaLabel: app.money.purchases.has('atlas') ? `${t('atlas.menu')}, ${t('atlas.menuOwned')}` : `${t('atlas.menu')}, ${t('atlas.menuSub')}`,
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
    // Новичку — меньше выбора: Коллекция и архив появятся после первого забега
    const items = [
      item('guide', t('menu.howTo'), lib.guide, () => showHelp({ found: app.profile.combosFound, profile: app.profile })),
      item('learn', t('tut.menuButton'), app.profile.tutorialDone ? lib.tutorial : t('tut.menuSub'), () => this.guardSave(() => app.runs.startTutorial())),
      app.profile.runs > 0 ? item('codex', t('menu.collection'), lib.collection, () => this.openCollection()) : null,
      app.profile.runs > 0 ? item('archive', t('archive.menu'), lib.archive, () => void app.router.goArchive()) : null,
      item('settings', t('menu.settings'), lib.settings, () => showSettings(app, () => this.render())),
    ];
    const m = modal(
      [h('div.lib-list', null, items), h('p.lib-ver', null, `v${__APP_VERSION__}`)],
      { title: t('menu.library'), sheet: !document.body.classList.contains('landscape'), className: 'library' },
    );
  }

  private openCollection(focus?: string): void {
    showCollection(this.app.profile, focus);
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
        h('p.modal-text.confirm-text', null, t('tut.offer')),
        h('div.win-acts', null, [
          button(t('tut.offerSkip'), () => {
            m.close();
            app.profile.tutorialDone = true;
            app.runs.persistProfile();
            next();
          }, { variant: 'ghost' }),
          button(t('tut.menuButton'), () => {
            m.close();
            app.runs.startTutorial('offer');
          }),
        ]),
      ],
      { title: t('tut.offerTitle'), className: 'narrow confirm' },
    );
  }

  /** Новый забег затирает сохранённый — спрашиваем. */
  private guardSave(next: () => void): void {
    confirmNewRun(this.app, next);
  }

  /**
   * iPhone в браузере: развернуть игру нельзя, но с экрана «Домой» она открывается без
   * панелей браузера. Короткая ссылка внизу меню открывает пошаговую инструкцию.
   */
  private homeHint(): HTMLElement | null {
    const app = this.app;
    if (app.platform.id !== 'web' || app.settings.homeHintSeen || !suggestHomeScreen()) return null;
    const link = h('button.link-btn.home-link', { type: 'button' }, [icon('expand'), t('home.link')]);
    link.addEventListener('click', () => {
      const steps: IconName[] = ['share', 'addHome', 'midnight'];
      const m = modal(
        [
          h('p.modal-text.dim', null, t('home.why')),
          h('ol.win-steps', null, dict().home.steps.map((step, i) => h('li', null, [h(`span.win-ring${i === 2 ? '.app' : ''}`, null, icon(steps[i]!)), h('span', null, step)]))),
          h('div.win-acts.center', null, button(t('home.ok'), () => {
            app.applySettings({ ...app.settings, homeHintSeen: true });
            m.close();
            link.remove();
          })),
        ],
        { title: t('home.title'), className: 'narrow home-hint' },
      );
    });
    return link;
  }

  private chooseSky(): void {
    const app = this.app;
    const owned = app.money.purchases.owned;
    // Первый забег — сразу классика; колоды атласа видны в списке, когда открыто что-то ещё
    if (app.profile.maxStake === 0 && app.profile.unlockedSkies.length <= 1 && !SKY_LIST.slice(1).some((s) => isUnlocked(s.unlock, app.profile, owned))) {
      app.runs.startRun('classic');
      return;
    }
    let chosen = 'classic';
    let stake = 0;
    // Невысокий экран (iPhone SE, ландшафт): веера мельче — карты рисуются сразу нужного размера
    const low = innerHeight <= 600;
    const open = (sky: (typeof SKY_LIST)[number]) => app.profile.unlockedSkies.includes(sky.id) || isUnlocked(sky.unlock, app.profile, owned);
    const list = h('ul.sky-rows');
    const hero = h('div.sky-hero');
    const stakeName = h('b');
    const effect = h('p.sky-effect');
    const dots = h('div.sky-dots', { attrs: { role: 'group', 'aria-label': t('menu.stake') } });
    const stakes = dict().menu.stakes;
    const paint = () => {
      list.querySelectorAll<HTMLElement>('.sky-row').forEach((row) => {
        const on = row.dataset.sky === chosen;
        row.classList.toggle('on', on);
        row.setAttribute('aria-pressed', String(on));
        const mark = row.querySelector('.sky-mark')!;
        if (row.dataset.state === 'open') mark.replaceChildren(on ? icon('check') : '');
      });
      const { name, desc } = named('sky', chosen);
      hero.replaceChildren(skyFan(chosen, low ? 40 : 64), h('h3', null, name), h('p', null, desc));
      dots.querySelectorAll<HTMLElement>('button').forEach((b, i) => {
        b.classList.toggle('on', i === stake);
        b.classList.toggle('past', i < stake);
        b.setAttribute('aria-pressed', String(i === stake));
      });
      stakeName.textContent = stake ? t('map.stake', { n: stake }) : t('menu.stakeNormal');
      effect.textContent = stakeText(stake);
    };
    for (const sky of SKY_LIST) {
      const unlocked = open(sky);
      const atlasLocked = !unlocked && sky.unlock.kind === 'atlas';
      const { name, desc } = named('sky', sky.id);
      const lockText = sky.unlock.kind === 'default' ? '' : t(`unlock.${sky.unlock.kind}`, { n: 'ante' in sky.unlock ? sky.unlock.ante : 'lines' in sky.unlock ? sky.unlock.lines : '' });
      const state = unlocked ? 'open' : atlasLocked ? 'atlas' : 'locked';
      const row = h(`li.sky-row.sky-${state}`, { attrs: { 'data-sky': sky.id, 'data-state': state } }, h('button', { type: 'button', attrs: { 'aria-disabled': String(state === 'locked') } }, [
        skyFan(sky.id, low ? 20 : 25, state === 'locked'),
        h('span.sky-row-text', null, [h('b', null, name), h('small', null, unlocked ? desc : lockText)]),
        h('span.sky-mark', null, state === 'locked' ? icon('lock') : state === 'atlas' ? icon('chevron') : ''),
      ]));
      row.querySelector('button')!.addEventListener('click', () => {
        if (state === 'atlas') {
          m.close();
          void app.router.goAtlas('sky', 'astrolabe');
          return;
        }
        if (state === 'locked') return;
        chosen = sky.id;
        app.svc.audio.click();
        paint();
      });
      list.append(row);
    }
    // Сложность — ступенями, как скорость в «Пульте»: открытые и ещё закрытые
    const stakeBlock = app.profile.maxStake > 0 ? h('div.sky-stake', null, [
      h('div.sky-stake-top', null, [h('span.win-label', null, t('menu.stake')), stakeName]),
      (() => {
        for (let i = 0; i < stakes.length; i++) {
          const can = i <= app.profile.maxStake;
          const b = h(`button${can ? '' : '.locked'}`, { type: 'button', attrs: { 'aria-label': i ? t('map.stake', { n: i }) : t('menu.stakeNormal') } }, h('i'));
          b.disabled = !can;
          b.addEventListener('click', () => {
            stake = i;
            app.svc.audio.click();
            paint();
          });
          dots.append(b);
        }
        return dots;
      })(),
      effect,
    ]) : null;
    const m = modal(
      [
        h('div.sky-body', null, [
          list,
          h('div.sky-side', null, [
            hero,
            stakeBlock,
            h('div.win-acts', null, [
              button(t('menu.back'), () => m.close(), { variant: 'ghost' }),
              button(t('menu.start'), () => {
                m.close();
                app.runs.startRun(chosen, false, stake);
              }),
            ]),
          ]),
        ]),
      ],
      { title: t('menu.chooseSky'), className: 'sky-win' },
    );
    paint();
  }
}
