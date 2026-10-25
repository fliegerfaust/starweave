import { bossSigil } from '@/art/sigil';
import { FINAL_ANTE } from '@/core/content/balance';
import { isWonder, nextStop, planNight, routeOptions, type Chapter, type ChapterNode, type NightPlan, type RouteKind } from '@/core/route';
import type { RunState } from '@/core/types';
import type { App } from '@/game/app';
import { named, num, t } from '@/i18n';
import { canvasImg, dpr, h } from '../dom';
import { icon } from '../icons';
import { layoutMode } from '../map-layout';
import { attachTooltip, button, type ModalHandle } from '../widgets';
import { showWonder } from '../wonder';
import { rich } from '../rich';
import { currentChoice } from '@/core/choices';
import { showDeck, showHelp, showRunMenu } from './common';
import { trophyMedal, trophyTooltip } from '../hud';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const roman = (n: number) => ROMAN[n - 1] ?? String(n);
const SVG = 'http://www.w3.org/2000/svg';

/** Значки видов пути — одна линия и вес, цвет вида (как в витрине d8-route-screen). */
const ROUTE_ICON: Record<Exclude<RouteKind, 'eclipse'>, string> = {
  night: '<path d="M12 3.5c.5 4.2 1.8 6.5 6.5 8.5-4.7 2-6 4.3-6.5 8.5-.5-4.2-1.8-6.5-6.5-8.5 4.7-2 6-4.3 6.5-8.5Z" fill="currentColor"/>',
  bright: '<circle cx="12" cy="12" r="9.3" fill="none" stroke="currentColor" stroke-width="1" opacity=".55"/><path d="M12 2.8c.6 5 2 7.2 6.8 9.2-4.8 2-6.2 4.2-6.8 9.2-.6-5-2-7.2-6.8-9.2 4.8-2 6.2-4.2 6.8-9.2Z" fill="currentColor"/><path d="M4.6 4.6l2 2M19.4 4.6l-2 2M4.6 19.4l2-2M19.4 19.4l-2-2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  comet: '<circle cx="16" cy="8" r="3.6" fill="currentColor"/><path d="M13.4 10.6 4 20M14.6 12.4 8 19M11.6 9.4 5 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".75"/>',
  telescope: '<path d="m4 14 11-6.5 2 3.4L6 17.4Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="m15.5 6.8 2.6-1.5 2 3.4-2.6 1.5M10.5 15.5 8 21M11.5 15l2.5 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
};

function routeIcon(kind: RouteKind): HTMLElement {
  const el = h(`span.sm-ic.k-${kind}`);
  el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ROUTE_ICON[kind as 'night']}</svg>`;
  return el;
}
const sigil = (bossId: string, size: number) => canvasImg(bossSigil(bossId, size, dpr()), size, size, 'sm-sigil');
const coin = () => h('span.coin', { attrs: { 'aria-hidden': 'true' } });
const arrow = () => {
  const el = h('span.sm-arr');
  el.innerHTML = '<svg viewBox="0 0 14 10" aria-hidden="true"><path d="M1 5h11m-3-3 3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return el;
};

/** Место на карте в процентах; `hidden` — шаг уже позади и на невысокой карте свёрнут. */
interface Spot {
  x: number;
  y: number;
  hidden?: boolean;
}

/**
 * Где звёзды на карте: шаги снизу вверх, варианты шага — слева направо. На невысокой карте
 * (iPhone SE, панель Telegram) пройденные шаги сворачиваются: внизу — где ты сейчас, выше —
 * только то, что впереди, до Затмения. Возвращает места узлов и точки «ты здесь».
 */
function positions(chapter: Chapter, compact: boolean, low = false): { nodes: Spot[]; here: Spot } {
  const steps = Math.max(...chapter.nodes.map((n) => n.step));
  // На невысокой карте в начале главы нет ряда «ты здесь»: внизу сразу первый шаг, с подписями
  const start = compact && !chapter.path.length;
  const from = compact ? Math.max(chapter.path.length, 1) : 0;
  // На совсем низкой карте у шагов нет подписей — нижний ряд опускается ниже
  const bottom = start ? (low ? 88 : 84) : 92;
  // Ряды от «ты здесь» (низ) до Затмения (верх). Подписи висят под звёздами: промежуток под
  // рядом с подписями (Затмения и шаг, который выбирают сейчас) шире остальных. С двумя
  // Затмениями (TR.3) это важно: короны стоят прямо над крайними звёздами шага ниже
  const labeled = (step: number) => step === steps || (!low && step === chapter.path.length + 1);
  const gaps = Array.from({ length: steps - from }, (_, k) => (labeled(from + k + 1) ? 1.4 : 1));
  const total = gaps.reduce((a, b) => a + b, 0);
  const yOf = (step: number) => bottom - (gaps.slice(0, step - from).reduce((a, b) => a + b, 0) * (bottom - 13)) / total;
  const last = chapter.path.at(-1);
  const nodes = chapter.nodes.map((n, i): Spot => {
    if (compact && !start && n.step <= from) return i === last ? { x: 50, y: 92 } : { x: 50, y: 92, hidden: true };
    const row = chapter.nodes.flatMap((m, j) => (m.step === n.step ? [j] : []));
    const k = row.indexOf(i);
    return { x: row.length === 1 ? 50 : 22 + (56 * k) / (row.length - 1), y: yOf(n.step) };
  });
  return { nodes, here: { x: 50, y: 92, hidden: compact } };
}

/** Невысокая карта: меньше этой высоты — пройденное сворачивается, звёзды компактнее. */
const COMPACT_MAP = 330;
/**
 * Совсем низкая карта (iPhone SE в Telegram, TR.5): плашка уступает место — без описания шага,
 * «дальше →» значками, строка трофея без правила; на карте подписи только у Затмений (имена
 * шагов и так в плашке).
 */
const TIGHT_MAP = 170;

/**
 * «Карта неба» (RT.2, выбор Дениса 22.10.2026, витрина d8-route-screen) — экран главы с
 * развилками. Тихая карта: значки звёзд, имя — у тех, что можно выбрать сейчас, и у Затмения;
 * линии не идут по подписям. Все числа — в одной плашке: до выбора — варианты строками, после —
 * «ждёт · даст · потом» и «дальше → …»; её высота не меняется. Три раскладки: портрет, ландшафт
 * (карта слева, справа колонка) и ПК (шапка, под ней карта и панель решения рядом).
 */
export class SkyMap {
  readonly el: HTMLElement;
  private resize?: ResizeObserver;
  private timers: number[] = [];
  private fillTimer = 0;
  private sel: number | null = null;
  private busy = false;
  private readonly plans: NightPlan[];
  private readonly chapter: Chapter;
  private readonly ante: number;
  private pos: Spot[];
  private herePos: Spot;
  private compact = false;
  private readonly here: HTMLElement;
  private readonly map: HTMLElement;
  private readonly edges: SVGSVGElement;
  private readonly stars: HTMLButtonElement[];
  private readonly detail: HTMLElement;
  private readonly go: HTMLButtonElement;
  private readonly goLabel: HTMLElement;
  private group: SVGGElement | null = null;
  private wonder: ModalHandle | null = null;
  private readonly title: HTMLElement;
  /** Затмения главы; на последнем шаге их может быть два (TR.3). */
  private readonly crowns: number[];
  /** Затмение, на которое смотрят заранее, пока до него не дошли. */
  private look: number | null = null;

  constructor(
    private readonly app: App,
    private readonly run: RunState,
    private readonly peek: boolean,
  ) {
    const { ante, chapter } = peek ? nextStop(run) : run;
    this.ante = ante;
    this.chapter = chapter;
    const view: RunState = { ...run, ante, chapter };
    this.plans = chapter.nodes.map((node) => planNight(view, node));
    ({ nodes: this.pos, here: this.herePos } = positions(chapter, false));

    const menu = h('button.icon-btn.medal', { type: 'button', ariaLabel: t('pause.title'), onclick: () => showRunMenu(app) }, h('span.burger'));
    const title = run.endless
      ? h('div.map-plaque', null, t('night.endless'))
      : h('div.map-plaque', null, [t('map.chapter', { n: roman(ante) }), ' ', h('span.of', null, t('map.of', { total: roman(FINAL_ANTE) }))]);
    this.title = title;
    const ticks = run.endless ? null : h('div.map-ticks', null, Array.from({ length: FINAL_ANTE }, (_, i) => h(`i${i < ante - 1 ? '.done' : i === ante - 1 ? '.now' : ''}`)));
    const stake = run.stake ? h('div.map-stake', null, Array.from({ length: run.stake }, () => icon('star'))) : null;
    const top = h('header.map-top', null, [menu, h('div.map-title', null, [title, ticks, stake]), h('div.gold-pill', null, String(run.gold))]);

    this.edges = document.createElementNS(SVG, 'svg');
    this.edges.setAttribute('class', 'sm-edges');
    this.edges.setAttribute('aria-hidden', 'true');
    const here = h('span.sm-star.here', { style: { left: '50%', top: '92%' } }, h('span.sm-orb'));
    this.here = here;
    this.stars = chapter.nodes.map((node, i) => this.star(node, i));
    this.crowns = chapter.nodes.flatMap((n, j) => (n.bossId ? [j] : []));
    this.map = h('div.sm-map', null, [this.edges, here, ...this.stars]);

    this.detail = h('div.sm-detail', { attrs: { 'aria-live': 'polite' } });
    this.goLabel = h('span', null, t('route.choose'));
    this.go = peek
      ? button(h('span.map-go', null, [icon('back'), t('pause.backToShop')]), () => void app.router.route(), { className: 'map-primary' })
      : button(this.goLabel, () => void this.advance(), { className: 'map-primary sm-go', disabled: true });
    const lights = h('div.map-lights', null, [
      h('button.map-light', { type: 'button', onclick: () => showHelp({ levels: run.comboLevels, found: app.profile.combosFound, profile: app.profile }) }, [icon('guide'), t('guide.button')]),
      h('button.map-light', { type: 'button', onclick: () => showDeck(run) }, [icon('deck'), t('night.deck'), h('span.n', null, String(run.deck.length))]),
    ]);
    const side = h('div.sm-side', null, [this.detail, h('div.sm-dock', null, [this.go, lights])]);
    this.el = h('div.map.sm', null, [h('div.map-tint'), top, this.map, side]);
  }

  mount(root: HTMLElement): void {
    root.append(this.el);
    this.steady();
    this.fill(null, true);
    const calm = this.app.settings.reduceMotion || navigator.webdriver || matchMedia('(prefers-reduced-motion: reduce)').matches;
    let first = true;
    const place = () => {
      const mode = layoutMode(innerWidth, innerHeight);
      this.el.classList.toggle('land', mode === 'land');
      this.el.classList.toggle('wide', mode === 'wide');
      // Табличка главы: «из VIII» прячется, если не помещается (длинные языки, 320 px)
      this.title.classList.remove('short');
      this.title.classList.toggle('short', this.title.scrollWidth > this.title.clientWidth + 1);
      this.relayout();
      if (first && !calm) this.entrance();
      first = false;
    };
    place();
    this.resize = new ResizeObserver(() => {
      this.steady();
      this.relayout();
    });
    this.resize.observe(this.map);
    // Развилка с одним вариантом (Затмение) — выбрана сама
    if (!this.peek && this.chapter.at >= 0) this.select(this.chapter.at);
    // Вошли в Комету или Телескоп: их выбор поверх карты (RT.4)
    const choice = currentChoice(this.run);
    if (!this.peek && (choice?.kind === 'comet' || choice?.kind === 'telescope')) {
      this.wonder = showWonder(this.app, this.run, choice, {
        take: (index) => this.app.runs.wonderAction({ c: 'choose', index }),
        skip: () => this.app.runs.wonderAction({ c: 'skip' }),
      });
    }
  }

  unmount(): void {
    this.wonder?.close();
    this.resize?.disconnect();
    this.timers.forEach((id) => clearTimeout(id));
    this.el.remove();
  }

  private options(): number[] {
    return this.peek ? [] : routeOptions(this.chapter);
  }

  private star(node: ChapterNode, i: number): HTMLButtonElement {
    const boss = node.bossId;
    const label = boss ? named('boss', boss).name : t(`route.${node.route}`);
    const el = h(`button.sm-star${boss ? '.boss' : ''}`, { type: 'button', ariaLabel: label, dataset: { i: String(i) }, onclick: () => this.select(i) }, [
      h('span.sm-orb', null, boss ? sigil(boss, 56) : routeIcon(node.route)),
      h('span.sm-lbl', null, label),
    ]);
    el.style.left = `${this.pos[i]!.x}%`;
    el.style.top = `${this.pos[i]!.y}%`;
    return el;
  }

  // ─── Плашка ─────────────────────────────────────────────────────────────

  /** Что ждёт: цель (у Яркой — ×1.35). Что даст: золото, Знамение. Что потом: Обсерватория или следующая глава. */
  private nodes(i: number | null): HTMLElement[] {
    // Два Затмения (TR.3): у каждого вместо золота — трофей, у выбранного — строка «Приручишь»
    const tame = this.run.unlocks.trophies && this.crowns.length > 1;
    if (i === null) {
      const open = this.peek ? routeOptions(this.chapter) : this.options();
      return [
        h('div.sm-cap', null, t(open.filter((j) => this.plans[j]!.bossId).length > 1 ? 'route.chooseEclipse' : this.chapter.path.length ? 'route.nextStep' : 'route.nowChoose')),
        h('div.sm-opts', null, open.map((j) => {
          const p = this.plans[j]!;
          return h('div.sm-o', null, [
            p.bossId ? sigil(p.bossId, 18) : routeIcon(p.route),
            h('b', null, p.bossId ? named('boss', p.bossId).name : t(`route.${p.route}`)),
            isWonder(p.route) ? h('span.t.no', null, t('route.noNight')) : h('span.t', null, num(p.target)),
            p.bossId && tame
              ? h('span.g.tro', null, [trophyMedal(p.bossId, 16), named('trophy', p.bossId).name])
              : h('span.g', null, isWonder(p.route) ? t(`route.yields.${p.route}`) : [`+${p.reward} `, coin(), p.route === 'bright' ? ` · ${t('route.omen')}` : '']),
          ]);
        })),
      ];
    }
    const p = this.plans[i]!;
    const boss = p.bossId;
    const cell = (k: 'waits' | 'gives' | 'then', v: Node) => h('div', null, [h('small', null, t(`route.${k}`)), v]);
    const ahead = p.next;
    const last = this.ante >= FINAL_ANTE && !this.run.endless;
    return [
      h('div.sm-hd', null, [
        boss ? sigil(boss, 30) : routeIcon(p.route),
        h('div', null, [h('b', null, boss ? named('boss', boss).name : t(`route.${p.route}`)), h('small', null, boss ? rich(named('boss', boss).desc) : t(`route.why.${p.route}`))]),
      ]),
      h('div.sm-facts', null, [
        cell('waits', h('b', null, isWonder(p.route) ? t('route.noNight') : [num(p.target), p.route === 'bright' ? h('span.x', null, ' ×1.35') : null])),
        cell('gives', h('b.g', null, isWonder(p.route) ? t(`route.yields.${p.route}`) : [`+${p.reward} `, coin(), p.route === 'bright' ? ` + ${t('route.omen')}` : ''])),
        cell('then', h('b', null, boss ? (last ? t('route.victory') : t('map.chapter', { n: roman(this.ante + 1) })) : isWonder(p.route) ? t('route.straightOn') : t('route.shop'))),
      ]),
      boss && tame ? this.tame(boss) : null,
      ahead.length
        ? h('div.sm-next', null, [t('route.further'), arrow(), ...ahead.flatMap((j, k) => {
            const n = this.chapter.nodes[j]!;
            const name = n.bossId ? named('boss', n.bossId).name : t(`route.${n.route}`);
            return [k ? h('span', null, t('route.or')) : null, h('span.sm-chip', { attrs: { 'aria-label': name } }, [n.bossId ? sigil(n.bossId, 16) : routeIcon(n.route), h('span.nm', null, name)])];
          })])
        : null,
    ].filter((x): x is HTMLDivElement => !!x);
  }

  /** Строка трофея под Затмением: что приручишь, если победишь (TR.3). */
  private tame(boss: string): HTMLElement {
    const tro = named('trophy', boss);
    const row = h('div.sm-tro-row', null, [trophyMedal(boss, 26), h('div', null, [h('small', null, t('route.tame')), h('b', null, tro.name), h('span.d', null, rich(tro.desc))])]);
    attachTooltip(row, () => trophyTooltip(boss));
    return row;
  }


  /** Плашка держит высоту самого большого содержимого — экран не прыгает (правило Дениса). */
  private steady(): void {
    if (this.el.classList.contains('land')) {
      this.el.classList.remove('low');
      this.detail.style.height = '';
      return;
    }
    const keep = [...this.detail.childNodes];
    const measure = () => {
      this.detail.style.height = 'auto';
      let max = 0;
      for (const i of [null, ...this.chapter.nodes.map((_, j) => j)]) {
        this.detail.replaceChildren(h('div.sm-body', null, this.nodes(i)));
        max = Math.max(max, this.detail.scrollHeight);
      }
      this.detail.style.height = `${max}px`;
    };
    this.el.classList.remove('low');
    measure();
    // Карте не хватает места на три ряда с подписями — плашка уступает
    if (this.map.clientHeight < TIGHT_MAP) {
      this.el.classList.add('low');
      measure();
    }
    this.detail.replaceChildren(...keep);
  }

  /**
   * Сменить содержимое плашки. Содержимое — один блок `.sm-body`: гаснет и проявляется целиком,
   * а прошлая незаконченная смена отменяется (FX.2). Раньше гасла каждая строка отдельно и при
   * частом переключении узлов WebKit (iPhone, Telegram) оставлял на месте старой строки «дальше →»
   * её отпечаток — строка двоилась.
   */
  private fill(i: number | null, instant = false): void {
    window.clearTimeout(this.fillTimer);
    const put = () => {
      this.detail.replaceChildren(h('div.sm-body', null, this.nodes(i)));
      this.detail.classList.remove('swap');
    };
    if (instant) return put();
    this.detail.classList.add('swap');
    this.fillTimer = window.setTimeout(put, 170);
    this.timers.push(this.fillTimer);
  }

  private select(i: number): void {
    if (this.busy || this.sel === i) return;
    if (!this.options().includes(i)) {
      // Затмение впереди можно рассмотреть заранее: выбор пути — выбор, какое встретить (TR.3)
      if (this.crowns.length < 2 || !this.chapter.nodes[i]!.bossId || this.look === i) return;
      this.look = i;
      this.fill(i);
      this.paint();
      return;
    }
    this.look = null;
    this.sel = i;
    const p = this.plans[i]!;
    (this.go as HTMLButtonElement).disabled = false;
    this.goLabel.replaceChildren(p.bossId ? t('route.meetEclipse') : isWonder(p.route) ? t('route.go') : t('night.begin'), p.bossId ? '' : h('small', null, t(`route.${p.route}`)));
    this.fill(i);
    this.paint();
  }

  // ─── Карта ──────────────────────────────────────────────────────────────

  /** Расставить звёзды под высоту карты: невысокая — свёрнутый путь и компактные звёзды. */
  private relayout(): void {
    this.compact = this.map.clientHeight < COMPACT_MAP;
    this.map.classList.toggle('compact', this.compact);
    ({ nodes: this.pos, here: this.herePos } = positions(this.chapter, this.compact, this.el.classList.contains('low')));
    this.stars.forEach((el, i) => {
      el.style.left = `${this.pos[i]!.x}%`;
      el.style.top = `${this.pos[i]!.y}%`;
      el.classList.toggle('gone', !!this.pos[i]!.hidden);
    });
    this.here.classList.toggle('gone', !!this.herePos.hidden);
    this.drawEdges();
  }

  private center(i: number | 'here'): [number, number] {
    const W = this.map.clientWidth;
    const H = this.map.clientHeight;
    const p = i === 'here' ? this.herePos : this.pos[i]!;
    return [(p.x / 100) * W, (p.y / 100) * H];
  }

  private curve(a: number | 'here', b: number): string {
    const [x1, y1] = this.center(a);
    const [x2, y2] = this.center(b);
    const my = (y1 + y2) / 2;
    return `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
  }

  private from(): number | 'here' {
    return this.chapter.path.at(-1) ?? 'here';
  }

  /** Рёбра и маска: под подписями и кружками звёзд линии вырезаны — текст всегда чистый. */
  private drawEdges(): void {
    const W = this.map.clientWidth;
    const H = this.map.clientHeight;
    if (!W || !H) return;
    const svg = this.edges;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const open = this.options();
    const holes: string[] = [];
    for (const st of this.map.querySelectorAll<HTMLElement>('.sm-star:not(.gone)')) {
      const cx = st.offsetLeft;
      const cy = st.offsetTop;
      holes.push(`<circle cx="${cx}" cy="${cy}" r="${st.offsetWidth / 2 + 3}" fill="#000"/>`);
      const lbl = st.querySelector<HTMLElement>('.sm-lbl');
      const i = Number(st.dataset.i);
      // Дыра под подписью — только пока подпись видна: после «Начать ночь» подписи гаснут, и линия
      // пути не должна рваться там, где была подпись (FX.3)
      const shown = lbl && (st.classList.contains('boss') || (!this.busy && (open.includes(i) || (this.peek && routeOptions(this.chapter).includes(i)))));
      if (shown) holes.push(`<rect x="${cx - lbl.offsetWidth / 2 - 5}" y="${cy + lbl.offsetTop - st.offsetHeight / 2 - 3}" width="${lbl.offsetWidth + 10}" height="${lbl.offsetHeight + 6}" rx="4" fill="#000"/>`);
    }
    const id = `sm-mask-${Math.random().toString(36).slice(2)}`;
    const walked = new Set(this.chapter.path.map((n, k) => `${k ? this.chapter.path[k - 1] : 'here'}>${n}`));
    const paths: string[] = [];
    const first = this.chapter.nodes.flatMap((n, j) => (n.step === 1 ? [j] : []));
    const edges: [number | 'here', number][] = [...first.map((j): ['here', number] => ['here', j]), ...this.chapter.nodes.flatMap((n, a) => n.next.map((b): [number, number] => [a, b]))];
    const gone = (n: number | 'here') => (n === 'here' ? !!this.herePos.hidden : !!this.pos[n]!.hidden);
    for (const [a, b] of edges) {
      if (walked.has(`${a}>${b}`) || gone(a) || gone(b)) continue;
      paths.push(`<path class="e" data-a="${a}" data-b="${b}" d="${this.curve(a, b)}"/>`);
    }
    for (const key of walked) {
      const [a, b] = key.split('>');
      if (gone(a === 'here' ? 'here' : Number(a)) || gone(Number(b))) continue;
      const d = this.curve(a === 'here' ? 'here' : Number(a), Number(b));
      paths.push(`<path class="walk-glow" d="${d}"/><path class="walk" d="${d}"/>`);
    }
    svg.innerHTML = `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>${holes.join('')}</mask></defs><g mask="url(#${id})">${paths.join('')}</g>`;
    this.group = svg.querySelector('g');
    this.paint();
  }

  /** Открытые — с именем и дыханием; выбранная — кольцо и одна золотая линия; следующие — кромкой; прочее тише. */
  private paint(): void {
    const open = this.peek ? routeOptions(this.chapter) : this.options();
    const step = this.chapter.path.length;
    const after = this.sel !== null ? this.chapter.nodes[this.sel]!.next : [];
    this.stars.forEach((el, i) => {
      const n = this.chapter.nodes[i]!;
      const done = this.chapter.path.includes(i);
      const isOpen = open.includes(i) && !this.busy;
      const passed = !done && n.step <= step;
      const away = passed || (this.sel !== null && !isOpen && !after.includes(i) && !n.bossId);
      el.classList.toggle('done', done);
      el.classList.toggle('open', isOpen);
      el.classList.toggle('sel', this.sel === i);
      el.classList.toggle('after', after.includes(i));
      el.classList.toggle('away', away);
      el.classList.toggle('look', this.look === i);
      el.disabled = (!isOpen && !(this.crowns.length > 1 && n.bossId)) || this.peek;
    });
    if (!this.group) return;
    const from = this.from();
    for (const p of this.group.querySelectorAll<SVGPathElement>('path.e')) {
      const a = p.dataset.a === 'here' ? 'here' : Number(p.dataset.a);
      const aStep = a === 'here' ? 0 : this.chapter.nodes[a]!.step;
      p.classList.toggle('open', a === from && !this.busy);
      p.classList.toggle('faint', (this.sel !== null && a !== from) || aStep < step);
    }
    this.group.querySelector('.pick')?.remove();
    if (this.sel !== null && !this.busy) {
      const pick = document.createElementNS(SVG, 'path');
      pick.setAttribute('class', 'pick');
      pick.setAttribute('d', this.curve(from, this.sel));
      this.group.append(pick);
    }
  }

  /** Вход: звёзды всходят по шагам снизу вверх, линии проявляются. */
  private entrance(): void {
    this.stars.forEach((el, i) => {
      el.animate([{ opacity: 0, translate: '0 10px' }, { opacity: el.classList.contains('away') ? 0.4 : 1, translate: '0 0' }], { duration: 520, delay: 120 + this.chapter.nodes[i]!.step * 140, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' });
    });
    this.edges.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 300, easing: 'ease-out', fill: 'backwards' });
  }

  /** «Начать ночь»: золотая линия дотягивается до звезды, звезда загорается — и ночь. */
  private async advance(): Promise<void> {
    if (this.busy || this.sel === null) return;
    const i = this.sel;
    this.busy = true;
    // Перерисовать рёбра: маска больше не вырезает гаснущие подписи (drawEdges сам вызывает paint)
    this.drawEdges();
    const calm = this.app.settings.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!calm && this.group) {
      const d = this.curve(this.from(), i);
      const glow = document.createElementNS(SVG, 'path');
      glow.setAttribute('class', 'walk-glow');
      glow.setAttribute('d', d);
      const line = document.createElementNS(SVG, 'path');
      line.setAttribute('class', 'walk');
      line.setAttribute('d', d);
      this.group.append(glow, line);
      const len = line.getTotalLength();
      await Promise.all([glow, line].map((p) => p.animate([{ strokeDasharray: `${len}`, strokeDashoffset: len }, { strokeDasharray: `${len}`, strokeDashoffset: 0 }], { duration: 720, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' }).finished.catch(() => undefined)));
      const star = this.stars[i]!;
      star.classList.add('done');
      this.app.svc.audio.ignite(1);
      await star.querySelector('.sm-orb')!.animate([{ boxShadow: '0 0 0 0 rgb(255 230 168 / 0.9)' }, { boxShadow: '0 0 0 20px rgb(255 230 168 / 0)' }], { duration: 560, easing: 'ease-out' }).finished.catch(() => undefined);
    }
    const node = this.chapter.at === i ? undefined : i;
    if (isWonder(this.plans[i]!.route)) this.app.runs.visitWonder(node);
    else this.app.runs.beginNight(node);
  }
}
