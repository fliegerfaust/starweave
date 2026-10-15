/*
 * «Разворот» (RD.5, выбор Дениса): атлас продаётся как обложка товара. Первый экран —
 * живое небо атласа, латунная рубашка и карты с глифами веером, название и одна фраза;
 * ниже «Что внутри» — четыре части с миниатюрами. Золотая кнопка всегда внизу.
 * Три вкладки устроены одинаково: обложка сверху, содержимое ниже, одна кнопка по смыслу.
 * «Примерочная» — живая сцена с примеряемым видом; на телефоне сцена закреплена, ленты
 * листаются под ней. «Поддержать» — набор мецената на золотом небе и чаевые.
 * Один авторский момент: карты раскрываются веером; дальше обложка тихо живёт — дышит
 * свечение, карты парят, по рубашке изредка идёт блик.
 */
import { cardBack, cardFace } from '@/art/card';
import { BACKS, SKY_THEMES, type SkyTheme } from '@/art/cosmetics';
import { DEFAULT_NEBULA } from '@/art/nebula';
import { skyMiniature } from '@/art/sky-miniature';
import type { Card } from '@/core/types';
import type { App, Screen } from '@/game/app';
import { dict, format, t } from '@/i18n';
import { archiveDates } from '@/meta/profile';
import { PRODUCT_BY_ID, productForCosmetic } from '@/store/catalog';
import { canvasImg, dpr, h } from '../dom';
import { icon } from '../icons';
import { PreviewStage } from '../preview-stage';
import { button, confirmDialog, toast } from '../widgets';

type Tab = 'atlas' | 'look' | 'support';
type PartId = 'archive' | 'astrolabe' | 'noads' | 'look';
const TABS: Tab[] = ['atlas', 'look', 'support'];
const PARTS: PartId[] = ['archive', 'astrolabe', 'noads', 'look'];

const ASTRO_CARDS: Pick<Card, 'suit' | 'rank' | 'glyph'>[] = [
  { suit: 'moon', rank: 4, glyph: 'echo' },
  { suit: 'sun', rank: 9, glyph: 'prism' },
  { suit: 'comet', rank: 6, glyph: 'blazing' },
];
const PATRON_CARDS: Pick<Card, 'suit' | 'rank' | 'glyph'>[] = [
  { suit: 'sun', rank: 8, glyph: 'gilded' },
  { suit: 'star', rank: 7, glyph: 'radiant' },
  { suit: 'sun', rank: 9, glyph: 'prism' },
];

const SVG = 'http://www.w3.org/2000/svg';

/** Звезда Telegram — нарисованный знак цены вместо эмодзи ⭐. */
function tstar(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'tstar');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="m12 2.8 2.7 5.9 6.4.7-4.8 4.3 1.4 6.3L12 16.8l-5.7 3.2 1.4-6.3-4.8-4.3 6.4-.7Z"/>';
  return svg;
}

/** Цена площадки: «250 ⭐» — число с нарисованной звездой, иначе как есть (₽ на Яндексе). */
function priceNode(label: string): HTMLElement {
  const m = /^(\d+)\s*⭐$/.exec(label.trim());
  return h('span.atl-price', null, m ? [tstar(), m[1]!] : [label]);
}

export class AtlasScreen implements Screen {
  private el!: HTMLElement;
  private prices: Record<string, string> | null = null;
  private busy = false;
  private off: (() => void) | null = null;
  private tab: Tab = 'atlas';
  /** Вкладки, чья обложка уже раскрылась: при пересборке веер не раскрывается заново. */
  private shown = new Set<Tab>();
  /** Вкладка на экране — прокрутка переживает пересборку только внутри неё. */
  private shownTab: Tab | null = null;
  /** Что примеряем (может быть ещё не куплено) и что выбрали последним — к нему кнопка. */
  private tryBack: string;
  private trySky: string;
  private focusSlot: 'back' | 'sky' = 'back';
  private stages: Partial<Record<Tab, PreviewStage>> = {};
  private capRo: ResizeObserver | null = null;

  constructor(
    private readonly app: App,
    focus?: string,
  ) {
    if (focus === 'wardrobe') this.tab = 'look';
    if (focus === 'support') this.tab = 'support';
    this.tryBack = app.canWear('back', app.settings.cardBack) ? app.settings.cardBack : 'classic';
    this.trySky = app.canWear('sky', app.settings.skyTheme) ? app.settings.skyTheme : 'night';
  }

  mount(root: HTMLElement): void {
    this.el = h('div.atlas');
    root.append(this.el);
    this.render();
    this.off = this.app.purchases.onChange(() => this.render());
    void this.app.platform.payments
      ?.prices()
      .then((p) => {
        this.prices = p;
        this.render();
      })
      .catch(() => undefined);
    // Покупка могла пройти на другом устройстве или вернуться — сверяемся при входе
    void this.app.refreshPurchases();
  }

  unmount(): void {
    this.off?.();
    this.capRo?.disconnect();
    for (const s of Object.values(this.stages)) s.destroy();
    this.el.remove();
  }

  private get owned(): boolean {
    return this.app.purchases.has('atlas');
  }

  private stage(tab: Tab): PreviewStage {
    return (this.stages[tab] ??= new PreviewStage({ cards: tab === 'look' ? 3 : 0, reduceMotion: this.app.settings.reduceMotion }));
  }

  private render(): void {
    // Касание в ленте или подгрузка цен пересобирает экран — прокрутка остаётся на месте
    const same = this.shownTab === this.tab;
    const scrollers = () => [...this.el.querySelectorAll<HTMLElement>('.atl-body, .atl-right, .atl-strip')];
    const keep = same ? scrollers().map((e) => [e.scrollTop, e.scrollLeft] as const) : [];
    const [body, cta] = this.tab === 'atlas' ? this.atlasTab() : this.tab === 'look' ? this.lookTab() : this.supportTab();
    this.el.className = `atlas tab-${this.tab}${this.shown.has(this.tab) ? ' settled' : ''}`;
    this.el.replaceChildren(this.top(), body, cta);
    if (same) scrollers().forEach((e, i) => {
      const k = keep[i];
      if (k) [e.scrollTop, e.scrollLeft] = k;
    });
    this.shownTab = this.tab;
    this.shown.add(this.tab);
    this.watchCaption();
  }

  // ─── Шапка и вкладки ───────────────────────────────────────────────────

  private top(): HTMLElement {
    return h('header.atl-top', null, [
      h('button.atl-back', { type: 'button', onclick: () => void this.app.goMenu() }, [icon('back'), t('menu.back')]),
      h('h1.atl-plaque', null, t('atlas.title')),
      this.tabs(),
    ]);
  }

  /** Вкладки сверху: всё, что есть в магазине, видно сразу — без поиска прокруткой. */
  private tabs(): HTMLElement {
    const bar = h('nav.atl-tabs', { attrs: { role: 'tablist', 'aria-label': t('atlas.title') } });
    TABS.forEach((id, i) => {
      const on = id === this.tab;
      const b = h(`button.atl-tab${on ? '.on' : ''}`, {
        type: 'button',
        tabIndex: on ? 0 : -1,
        attrs: { role: 'tab', 'aria-selected': String(on) },
      }, dict().atlas.tabs[id]!);
      b.addEventListener('click', () => this.openTab(id));
      b.addEventListener('keydown', (e) => {
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        this.openTab(TABS[(i + step + TABS.length) % TABS.length]!);
        this.el.querySelector<HTMLElement>('.atl-tab.on')?.focus();
      });
      bar.append(b);
    });
    return bar;
  }

  private openTab(id: Tab): void {
    if (this.tab === id) return;
    this.tab = id;
    this.app.svc.audio.click();
    this.render();
  }

  // ─── Обложка ───────────────────────────────────────────────────────────

  /** Обложка: живое небо, карты веером за рубашкой, название и одна фраза. */
  private hero(tab: Tab, sky: string, back: string, faces: Pick<Card, 'suit' | 'rank' | 'glyph'>[], title: string, sub: string): HTMLElement {
    const stage = this.stage(tab);
    stage.setSky(sky);
    const stack = h('div.atl-stack', { attrs: { 'aria-hidden': 'true' } });
    faces.forEach((c, i) => {
      const img = canvasImg(cardFace(c, 84, dpr()), 84 * 1.24, (84 / 0.7) * 1.24, 'atl-face');
      img.style.setProperty('--r', `${(i - 1) * 22}deg`);
      img.style.setProperty('--d', `${0.25 + i * 0.08}s`);
      stack.append(img);
    });
    const backArt = cardBack(104, dpr(), back);
    stack.append(canvasImg(backArt, 104 * 1.24, (104 / 0.7) * 1.24, 'atl-backc'));
    // Блик идёт по самой рубашке: маска — её же картинка
    const glint = h('i.atl-glint');
    glint.style.setProperty('--m', `url(${backArt.toDataURL()})`);
    // Высота блика — как у рубашки (WebKit не выводит её из aspect-ratio у абсолютного блока)
    glint.style.setProperty('--gh', String((backArt.height / backArt.width).toFixed(4)));
    stack.append(glint);
    return h(`section.atl-hero.hero-${tab}`, null, [stage.el, stack, h('h2.atl-title', null, title), h('p.atl-sub', null, sub)]);
  }

  // ─── Атлас ─────────────────────────────────────────────────────────────

  private atlasTab(): [HTMLElement, HTMLElement] {
    const owned = this.owned;
    const n = archiveDates().length;
    const parts = h('div.atl-parts', null, PARTS.map((id) => {
      const [name, text] = dict().atlas.parts[id]!;
      const desc = id === 'archive' && n ? `${text} ${format(t('atlas.archiveNow'), { n })}` : text;
      return this.part(this.partArt(id), name, desc, owned);
    }));
    const body = h('div.atl-body', null, [
      this.hero('atlas', 'astrolabe', 'astrolabe', ASTRO_CARDS, t('atlas.title'), owned ? t('atlas.heroSubOwned') : t('atlas.heroSub')),
      h('div.atl-right', null, [h('h2.atl-section', null, t('atlas.inside')), parts]),
    ]);
    return [body, this.atlasCta()];
  }

  private part(art: HTMLElement, name: string, text: string, done: boolean): HTMLElement {
    return h('div.atl-part', null, [art, h('h3', null, [done ? icon('check') : null, name]), h('p', null, text)]);
  }

  /** Миниатюры частей: календарь вызовов, карты с глифами, перечёркнутый ролик, рубашка на небе. */
  private partArt(id: PartId): HTMLElement {
    const pv = h(`span.atl-pv.pv-${id}`, { attrs: { 'aria-hidden': 'true' } });
    if (id === 'archive') {
      const days = ['p', 'p', '', 'w', 'p', '', 'p', 'p', 'w', '', 'p', 'p'];
      pv.append(h('span.pv-days', null, days.map((d) => (d ? h(`i.${d}`) : h('i')))));
    } else if (id === 'astrolabe') {
      ASTRO_CARDS.forEach((c, i) => {
        const img = canvasImg(cardFace(c, 34, dpr()), 34 * 1.24, (34 / 0.7) * 1.24);
        img.style.setProperty('--r', `${(i - 1) * 16}deg`);
        pv.append(img);
      });
    } else if (id === 'noads') {
      pv.append(h('span.pv-noads', null, icon('play')));
    } else {
      pv.append(this.skySwatch(SKY_THEMES.find((s) => s.id === 'astrolabe')!, 64, 64), canvasImg(cardBack(30, dpr(), 'astrolabe'), 30 * 1.24, (30 / 0.7) * 1.24, 'pv-bk'));
    }
    return pv;
  }

  private atlasCta(): HTMLElement {
    const foot = h('footer.atl-cta');
    const payments = this.app.platform.payments;
    if (this.owned) {
      foot.append(
        h('div.atl-owned', null, [icon('check'), t('atlas.owned')]),
        h('div.atl-two', null, [
          button(h('span.btn-row', null, [icon('archive'), t('atlas.archiveShort')]), () => void this.app.goArchive(), { variant: 'secondary', ariaLabel: t('atlas.openArchive') }),
          button(h('span.btn-row', null, [icon('deck'), t('atlas.astroShort')]), () => this.playAstrolabe(), { variant: 'secondary', ariaLabel: t('atlas.playAstrolabe') }),
        ]),
      );
      return foot;
    }
    if (!payments) return this.unavailable(foot, t('atlas.unavailable'));
    if (this.prices && !this.prices.atlas) {
      // Площадка ответила, но атласа не продаёт (оплата ещё не включена)
      foot.append(h('p.atl-note', null, t('atlas.soon')));
      return foot;
    }
    foot.append(this.buyButton('atlas', t('atlas.buy')), this.promise());
    return foot;
  }

  private promise(): HTMLElement {
    return h('p.atl-promise', null, [
      h('b', null, t('atlas.promiseLead')),
      ` ${t('atlas.promiseRest')} `,
      h('button.link-btn.atl-terms', { type: 'button', onclick: () => void import('./legal').then(({ showLegal }) => showLegal('terms')) }, t('atlas.terms')),
    ]);
  }

  /** Покупок на площадке нет: подсказка и ссылка в Telegram. */
  private unavailable(foot: HTMLElement, note: string): HTMLElement {
    foot.append(h('p.atl-note', null, note));
    const link = import.meta.env.VITE_TG_APP_LINK;
    if (link) foot.append(button(t('atlas.openTelegram'), () => window.open(link, '_blank', 'noopener'), { variant: 'secondary' }));
    return foot;
  }

  /** Золотая кнопка покупки с ценой; пока ждём оплату — кольцо и «Ждём оплату…». */
  private buyButton(id: string, label: string, variant: 'primary' | 'secondary' = 'primary'): HTMLButtonElement {
    const priced = this.prices?.[id];
    const content = this.busy
      ? h('span.btn-row', null, [h('span.atl-spin'), t('atlas.paying')])
      : h('span.btn-row', null, [label, h('span.atl-pr', null, priced ? priceNode(priced) : t('atlas.loading'))]);
    const b = button(content, () => void this.buy(id), { variant, disabled: this.busy || !priced, className: `atl-buy${priced ? '' : ' loading'}` });
    if (this.busy) b.setAttribute('aria-busy', 'true');
    return b;
  }

  private async buy(id: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.render();
    const result = await this.app.purchase(id);
    this.busy = false;
    if (result === 'paid') {
      // Обложка раскрывается заново — уже купленной
      if (id === 'atlas' || id === 'supporter') this.shown.clear();
      this.app.svc.audio.win();
      toast(PRODUCT_BY_ID[id]?.kind === 'tip' ? t('atlas.thanksTip') : t('atlas.thanks'));
    } else if (result === 'cancelled') toast(t('atlas.cancelled'));
    else toast(t('atlas.failed'), 'warn');
    this.render();
  }

  private playAstrolabe(): void {
    const start = () => this.app.startRun('astrolabe');
    if (this.app.hasSave) confirmDialog(t('menu.overwrite'), start, 'primary');
    else start();
  }

  private wear(next: { cardBack?: string; skyTheme?: string }): void {
    this.app.applySettings({ ...this.app.settings, ...next });
    this.render();
  }

  // ─── Примерочная ───────────────────────────────────────────────────────

  /** Где взять вид: бесплатно, твоё, в атласе, у мецената или цена. */
  private where(slot: 'back' | 'sky', id: string): Node {
    if (this.app.canWear(slot, id)) return document.createTextNode(id === 'classic' || id === 'night' ? t('atlas.free') : t('atlas.yours'));
    const product = productForCosmetic(slot, id);
    if (product?.id === 'atlas') return document.createTextNode(t('atlas.inAtlas'));
    if (product?.id === 'supporter') return document.createTextNode(t('atlas.atPatron'));
    const label = product && this.app.platform.payments ? this.prices?.[product.id] : '';
    return label ? priceNode(label) : document.createTextNode('—');
  }

  private lookTab(): [HTMLElement, HTMLElement] {
    const stage = this.stage('look');
    stage.setBack(this.tryBack);
    stage.setSky(this.trySky);
    const name = (slot: 'back' | 'sky', id: string) => dict().cosmetic[slot][id] ?? id;
    const cap = h('div.atl-cap', null, [
      h('span', null, [h('span.lbl', null, `${t('atlas.backOne')} `), h('b', null, name('back', this.tryBack)), ' · ', this.where('back', this.tryBack)]),
      h('span', null, [h('span.lbl', null, `${t('atlas.skyOne')} `), h('b', null, name('sky', this.trySky)), ' · ', this.where('sky', this.trySky)]),
    ]);
    const strip = (slot: 'back' | 'sky') => {
      const row = h('div.atl-strip', { attrs: { role: 'listbox', 'aria-label': slot === 'back' ? t('atlas.backs') : t('atlas.skies') } });
      if (slot === 'back') for (const b of BACKS) row.append(this.item('back', b.id, canvasImg(cardBack(50, dpr(), b.id), 50 * 1.24, (50 / 0.7) * 1.24)));
      else for (const s of SKY_THEMES) row.append(this.item('sky', s.id, this.skySwatch(s, 50, 70)));
      return row;
    };
    const body = h('div.atl-body.look-body', null, [
      h('div.look-left', null, [h('section.atl-stage', null, [stage.el, cap]), h('p.atl-hint', null, t('atlas.lookLede'))]),
      h('div.atl-right', null, [h('h2.atl-section', null, t('atlas.backs')), strip('back'), h('h2.atl-section', null, t('atlas.skies')), strip('sky')]),
    ]);
    return [body, h('footer.atl-cta', null, [this.lookAction(), h('p.atl-promise', null, t('atlas.lookPromise'))])];
  }

  /** Веер встаёт по центру неба над подписью: сцене сообщаем её высоту. */
  private watchCaption(): void {
    this.capRo?.disconnect();
    const cap = this.el.querySelector<HTMLElement>('.atl-cap');
    const stage = this.stages.look;
    if (!cap || !stage) return;
    this.capRo = new ResizeObserver(() => (stage.bottomInset = cap.offsetHeight));
    this.capRo.observe(cap);
  }

  /** Кнопка под примеркой: надеть, купить или где это продаётся. */
  private lookAction(): HTMLElement {
    const app = this.app;
    const slot = this.focusSlot;
    const id = slot === 'back' ? this.tryBack : this.trySky;
    const name = dict().cosmetic[slot][id] ?? id;
    const current = slot === 'back' ? app.settings.cardBack : app.settings.skyTheme;
    const product = productForCosmetic(slot, id);
    if (app.canWear(slot, id)) {
      const worn = current === id;
      return button(worn ? h('span.btn-row', null, [icon('check'), t('atlas.wearing')]) : format(t('atlas.wearIt'), { name }), () => this.wear(slot === 'back' ? { cardBack: id } : { skyTheme: id }), {
        disabled: worn, variant: worn ? 'secondary' : 'primary', className: 'atl-look-btn',
      });
    }
    if (product?.id === 'atlas') return button(t('atlas.inAtlasGo'), () => this.openTab('atlas'), { variant: 'secondary', className: 'atl-look-btn' });
    if (product?.id === 'supporter') return button(t('atlas.inSupporterGo'), () => this.openTab('support'), { variant: 'secondary', className: 'atl-look-btn' });
    if (product && app.platform.payments && this.prices?.[product.id]) return this.buyButton(product.id, format(t('atlas.buyIt'), { name }));
    return h('p.atl-note', null, app.platform.payments ? (this.prices ? t('atlas.soon') : t('atlas.loading')) : t('atlas.unavailable'));
  }

  private item(slot: 'back' | 'sky', id: string, art: HTMLElement): HTMLElement {
    const trying = (slot === 'back' ? this.tryBack : this.trySky) === id;
    const where = this.where(slot, id);
    const inPack = productForCosmetic(slot, id)?.kind === 'unlock' && !this.app.canWear(slot, id);
    const item = h(`button.atl-item${trying ? '.on' : ''}`, {
      type: 'button',
      attrs: { role: 'option', 'aria-selected': String(trying) },
    }, [h('span.atl-thumb', null, art), h('b', null, dict().cosmetic[slot][id] ?? id), h(`small${inPack ? '.in' : ''}`, null, where)]);
    // Касание — примерить на сцене; покупка и «надеть» — кнопкой внизу
    item.addEventListener('click', () => {
      if (slot === 'back') this.tryBack = id;
      else this.trySky = id;
      this.focusSlot = slot;
      this.app.svc.audio.click();
      this.render();
    });
    return item;
  }

  /** Кусочек неба темы — как оно выглядит за игрой. */
  private skySwatch(theme: SkyTheme, w: number, hgt: number): HTMLElement {
    return canvasImg(skyMiniature(theme.palette ?? DEFAULT_NEBULA, w * 1.24, hgt * 1.24, dpr()), w, hgt, 'sky-swatch');
  }

  // ─── Поддержать ────────────────────────────────────────────────────────

  private supportTab(): [HTMLElement, HTMLElement] {
    const app = this.app;
    const has = app.purchases.has('supporter');
    const arts: HTMLElement[] = [
      this.partArt('look'),
      h('span.atl-pv.pv-fan', { attrs: { 'aria-hidden': 'true' } }, canvasImg(cardBack(36, dpr(), 'patron'), 36 * 1.24, (36 / 0.7) * 1.24)),
      h('span.atl-pv.pv-look', { attrs: { 'aria-hidden': 'true' } }, this.skySwatch(SKY_THEMES.find((s) => s.id === 'patron')!, 64, 64)),
      h('span.atl-pv', { attrs: { 'aria-hidden': 'true' } }, h('span.pv-noads.seal', null, tstar())),
    ];
    const parts = h('div.atl-parts', null, dict().atlas.patronParts.map(([n, text], i) => this.part(arts[i]!, n, text, has)));
    const tipIds = ['tip_small', 'tip_medium', 'tip_large'].filter((id) => this.prices?.[id]);
    const tips = tipIds.length
      ? [
          h('h2.atl-section', null, t('atlas.tips')),
          h('div.atl-tips', null, tipIds.map((id) => button(h('span.tip-in', null, [h('span', null, dict().atlas.tipNames[id] ?? id), priceNode(this.prices![id]!)]), () => void this.buy(id), { variant: 'secondary', disabled: this.busy, className: 'atl-tip' }))),
          h('p.atl-promise', null, t('atlas.tipNote')),
        ]
      : [];
    const [name] = dict().atlas.supporter;
    const body = h('div.atl-body', null, [
      this.hero('support', 'patron', 'patron', PATRON_CARDS, name, has ? t('atlas.supporterOwned') : t('atlas.patronSub')),
      h('div.atl-right', null, [h('h2.atl-section', null, t('atlas.whatsIn')), parts, ...tips]),
    ]);
    const foot = h('footer.atl-cta');
    if (has) foot.append(h('div.atl-owned', null, [icon('check'), t('atlas.supporterOwned')]));
    else if (!app.platform.payments) this.unavailable(foot, t('atlas.patronUnavailable'));
    else if (this.prices && !this.prices.supporter) foot.append(h('p.atl-note', null, t('atlas.soon')));
    else foot.append(this.buyButton('supporter', t('atlas.supporterBuy')));
    return [body, foot];
  }
}
