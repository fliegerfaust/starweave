import { bossSigil } from '@/art/sigil';
import { buildRules } from '@/core';
import { FINAL_ANTE, GENTLE_NIGHT } from '@/core/content/balance';
import { runNightReward, runNightTarget } from '@/core/content/stakes';
import { omenSlots } from '@/core/shop';
import { NIGHT_KINDS, type NightKind, type Rules, type RunState } from '@/core/types';
import type { App, Screen } from '@/game/app';
import { named, num, t } from '@/i18n';
import { canvasImg, dpr, h } from '../dom';
import { bossTooltip, omenMedal, omenTooltip } from '../hud';
import { icon } from '../icons';
import { ChartLayout, layoutMode, type Placed } from '../map-layout';
import { coach } from '../tutorial';
import { attachTooltip, button } from '../widgets';
import { showDeck, showHelp, showRunMenu } from './common';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const roman = (n: number) => ROMAN[n - 1] ?? String(n);

/** Что ждёт в ночи: цель, награда и правила с учётом Знамений и Затмения. */
interface NightPlan {
  kind: NightKind;
  target: number;
  reward: number;
  rules: Rules;
  bossId: string | null;
}

/**
 * Карта главы — «Восхождение» (RD.2): три ночи звёздами на одной линии, снизу Сумерки,
 * наверху Затмение, небо к нему темнеет. У каждой главы своя расстановка (`map-layout.ts`).
 */
/** Своя маска на каждую отрисовку: id в документе должны быть уникальны. */
let maskSeq = 0;

export class MapScreen implements Screen {
  private el!: HTMLElement;
  private resize?: ResizeObserver;
  private timers: number[] = [];

  /** `peek` — карта открыта из Обсерватории посмотреть, что впереди. */
  constructor(
    private readonly app: App,
    private readonly run: RunState,
    private readonly peek = false,
  ) {}

  mount(root: HTMLElement): void {
    const run = this.run;
    // Из Обсерватории показываем следующую ночь (она может быть уже в новой главе)
    let ante = run.ante;
    let at = run.nightIndex;
    if (this.peek) {
      at += 1;
      if (at >= 3) {
        at = 0;
        ante += 1;
      }
    }
    const view: RunState = { ...run, ante, nightIndex: at };
    const bossId = run.bosses[ante - 1] ?? null;
    const plans = NIGHT_KINDS.map((kind): NightPlan => {
      const boss = kind === 'eclipse' ? bossId : null;
      const rules = buildRules(view, boss);
      let target = runNightTarget(view, kind, boss);
      // Щедрая первая ночь новичка: те же поправки, что в startNight
      if (run.gentle && ante === 1 && kind === 'dusk' && !boss) {
        rules.moves = Math.min(rules.moves, GENTLE_NIGHT.moves);
        target = Math.min(target, GENTLE_NIGHT.target);
      }
      return { kind, target, reward: runNightReward(run, kind), rules, bossId: boss };
    });

    const nodes = plans.map((p, i) => this.node(p, i, at, plans[0]!.rules));
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    line.setAttribute('class', 'map-line');
    line.setAttribute('aria-hidden', 'true');
    const path = h('div.map-path', null, [line, ...nodes]);

    const slots = omenSlots(view);
    const omens = h('div.map-omens', null, Array.from({ length: slots }, (_, i) => {
      const o = run.omens[i];
      if (!o) return h('div.map-omen.empty');
      const el = h('div.map-omen', null, omenMedal(o.id, 32));
      attachTooltip(el, () => omenTooltip(o));
      return el;
    }));

    const total = run.endless ? null : FINAL_ANTE;
    const title = run.endless
      ? h('div.map-plaque', null, t('night.endless'))
      : h('div.map-plaque', null, [t('map.chapter', { n: roman(ante) }), ' ', h('span.of', null, t('map.of', { total: roman(FINAL_ANTE) }))]);
    const ticks = total
      ? h('div.map-ticks', { attrs: { 'aria-label': t('night.constellationOf', { n: ante, total }) } }, Array.from({ length: total }, (_, i) => h(`i${i < ante - 1 ? '.done' : i === ante - 1 ? '.now' : ''}`)))
      : null;
    const stake = run.stake
      ? h('div.map-stake', { attrs: { 'aria-label': t('map.stake', { n: run.stake }) } }, Array.from({ length: run.stake }, () => icon('star')))
      : null;

    const menu = h('button.icon-btn.medal', { type: 'button', ariaLabel: t('pause.title'), onclick: () => showRunMenu(this.app) }, h('span.burger'));
    const kind = plans[at]!.kind;
    const primary = this.peek
      ? button(h('span.map-go', null, [icon('back'), t('pause.backToShop')]), () => void this.app.router.route(), { className: 'map-primary' })
      : button(h('span.map-go', null, [t('night.begin'), h('small', null, t(`night.${kind}`))]), () => this.app.runs.beginNight(), { className: 'map-primary' });

    this.el = h(`div.map.at-${at}`, null, [
      h('div.map-tint'),
      h('header.map-top', null, [menu, h('div.map-title', null, [title, ticks, stake]), h('div.gold-pill', null, String(run.gold))]),
      path,
      h('div.map-belt', null, [h('span.map-section', null, t('map.omens')), omens]),
      h('footer.map-dock', null, [
        h('div.map-lights', null, [
          h('button.map-light', { type: 'button', onclick: () => showHelp({ levels: run.comboLevels, found: this.app.profile.combosFound, profile: this.app.profile }) }, [icon('guide'), t('guide.button')]),
          h('button.map-light', { type: 'button', onclick: () => showDeck(run) }, [icon('deck'), t('night.deck'), h('span.n', null, String(run.deck.length))]),
        ]),
        primary,
      ]),
    ]);
    root.append(this.el);

    const layout = new ChartLayout(path, nodes, run.seed * 31 + ante * 104729);
    const calm = this.app.settings.reduceMotion || navigator.webdriver || matchMedia('(prefers-reduced-motion: reduce)').matches;
    let size = '';
    let first = true;
    const place = () => {
      const mode = layoutMode(innerWidth, innerHeight);
      this.el.classList.toggle('land', mode === 'land');
      this.el.classList.toggle('wide', mode === 'wide');
      const s = `${path.clientWidth}x${path.clientHeight}`;
      if (s === size) return;
      size = s;
      // Табличка главы: «из VIII» прячется, если не помещается (длинные языки, 320 px)
      title.classList.remove('short');
      title.classList.toggle('short', title.scrollWidth > title.clientWidth + 1);
      const placed = layout.solve(this.el);
      // Для e2e: запасная расстановка — значит, места не хватило ни на одной ступени
      this.el.dataset.fit = placed.ok ? 'ok' : 'fallback';
      this.drawLine(line, path, placed, at, first && !calm, nodes[at]!);
      first = false;
    };
    place();
    this.resize = new ResizeObserver(() => place());
    this.resize.observe(path);

    if (!this.peek && run.nightIndex === 2) coach(this.app, 'boss');
  }

  private node(p: NightPlan, i: number, at: number, base: Rules): HTMLElement {
    const status = i < at ? 'beaten' : i === at ? 'current' : 'upcoming';
    const glyph = status === 'beaten'
      ? icon('check', 'map-ico')
      : p.bossId
        ? canvasImg(bossSigil(p.bossId, 64, dpr()), 64, 64, 'map-sigil')
        : p.kind === 'eclipse'
          ? h('span.map-disc')
          : icon(p.kind === 'dusk' ? 'daily' : 'midnight', 'map-ico');
    const facts = i === at
      ? h('div.map-facts', null, [
          `${t('map.moves')} `, this.changed(p.rules.moves, base.moves), ` · ${t('map.burns')} `, this.changed(p.rules.burns, base.burns),
        ])
      : null;
    const rule = p.bossId ? this.rule(p, base) : null;
    return h(`div.map-node.${status}.${p.kind}`, { dataset: { i: String(i) } }, [
      h('div.map-star', null, glyph),
      h('div.map-tag', null, [
        h('div.map-name', null, t(`night.${p.kind}`)),
        h('div.map-row', null, [h('span.map-label', null, t('night.target')), h('span.map-num', null, num(p.target)), h('span.map-rew', null, `+${p.reward}`)]),
        facts,
        status === 'beaten' ? h('span.map-status', null, [icon('check'), t('night.beaten')]) : null,
        status === 'current' && this.peek ? h('span.map-status', null, t('map.next')) : null,
        rule,
      ]),
    ]);
  }

  /** Число правил, золотом — если Затмение его изменило. */
  private changed(n: number, was: number): Node {
    return n === was ? document.createTextNode(String(n)) : h('b', null, String(n));
  }

  /** Правило Затмения: имя, суть и что оно меняет числом; по нажатию — полный текст. */
  private rule(p: NightPlan, base: Rules): HTMLElement {
    const { name, desc } = named('boss', p.bossId!);
    const r = p.rules;
    const eff = r.moves !== base.moves ? t('map.effMoves', { n: r.moves, was: base.moves })
      : r.burns !== base.burns ? t('map.effBurns', { n: r.burns, was: base.burns })
      : r.handSize !== base.handSize ? t('map.effHand', { n: r.handSize, was: base.handSize })
      : r.sealedCells !== base.sealedCells ? t('map.effCells', { n: r.gridSize ** 2 - r.sealedCells, was: base.gridSize ** 2 - base.sealedCells })
      : '';
    const el = h('button.map-rule', { type: 'button', ariaLabel: `${name}: ${desc}` }, [h('b', null, name), h('span', null, desc), eff ? h('em', null, eff) : null]);
    attachTooltip(el, () => bossTooltip(p.bossId!));
    return el;
  }

  private drawLine(svg: SVGSVGElement, path: HTMLElement, placed: Placed, at: number, animate: boolean, current: HTMLElement): void {
    svg.setAttribute('viewBox', `0 0 ${path.clientWidth} ${path.clientHeight}`);
    // Путь идёт от центра к центру, а фон звёзд полупрозрачный: маска вырезает линию под
    // каждым кружком (с зазором), чтобы она не просвечивала внутри узла
    const holes = [...path.querySelectorAll<HTMLElement>('.map-star')].map((star, i) => {
      const [x, y] = placed.centers[i]!;
      return `<circle cx="${x}" cy="${y}" r="${star.offsetWidth / 2 + 4}" fill="#000"/>`;
    });
    const mask = `map-line-mask-${++maskSeq}`;
    svg.innerHTML =
      `<defs><mask id="${mask}" maskUnits="userSpaceOnUse" x="-50" y="-50" width="${path.clientWidth + 100}" height="${path.clientHeight + 100}">` +
      `<rect x="-50" y="-50" width="${path.clientWidth + 100}" height="${path.clientHeight + 100}" fill="#fff"/>${holes.join('')}</mask></defs>` +
      `<g mask="url(#${mask})">` +
      placed.curves
        .map(([a, c, b], i) => `<path class="${i < at ? 'done' : i === at ? 'draw' : 'next'}" d="M${a[0]} ${a[1]} Q${c[0]} ${c[1]} ${b[0]} ${b[1]}"/>`)
        .join('') +
      '</g>';
    // Небо темнеет к Затмению: свет короны над его звездой
    const e = placed.centers[2]!;
    const R = path.getBoundingClientRect();
    this.el.style.setProperty('--ex', `${e[0] + R.left}px`);
    this.el.style.setProperty('--ey', `${e[1] + R.top}px`);
    const draw = svg.querySelector<SVGPathElement>('path.draw');
    if (!animate || !draw) return;
    // Авторский момент: линия дотягивается до текущей ночи, звезда зажигается
    const len = draw.getTotalLength();
    draw.style.strokeDasharray = `${len}`;
    draw.style.strokeDashoffset = `${len}`;
    draw.getBoundingClientRect();
    draw.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.5,0,.2,1) 0.25s';
    draw.style.strokeDashoffset = '0';
    this.timers.push(window.setTimeout(() => current.classList.add('ignite'), 1150));
  }

  unmount(): void {
    this.resize?.disconnect();
    this.timers.forEach((id) => clearTimeout(id));
    this.el.remove();
  }
}
