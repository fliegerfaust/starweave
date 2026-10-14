/*
 * THESIS: атлас продаётся как созвездие — четыре его части стоят звёздами креста (главного
 * хода игры), и каждую можно потрогать до оплаты. Отказ от витрины «карточка + список
 * преимуществ + цена».
 * OWN-WORLD: ночь игры — заголовки Forum в золоте, фиолетовые панели с тонкой линией,
 * золотая кнопка-пилюля; фигура созвездия — те же золотые линии и светящиеся звёзды,
 * что на картах; примерочная — живое небо игры с веером карт.
 * STORY: три вкладки сверху сразу говорят, что здесь есть: «Атлас» (звёзды → покупка),
 * «Примерочная» (примерить вживую и купить вид), «Поддержать» (набор мецената, чаевые).
 * FIRST VIEWPORT: «‹ Назад», заголовок, вкладки, крест ~250 px, табличка выбранной звезды,
 * золотая кнопка «Открыть атлас · цена» прилипает к низу экрана.
 * FORM: оглавление-созвездие (4-я структура списка), сид f6974252; v2 по отзыву Дениса:
 * вкладки вместо длинной прокрутки, живая примерка.
 */
import { cardBack, cardFace } from '@/art/card';
import { BACKS, SKY_THEMES, type SkyTheme } from '@/art/cosmetics';
import { PreviewStage } from '../preview-stage';
import { DEFAULT_NEBULA } from '@/art/nebula';
import { skyMiniature } from '@/art/sky-miniature';
import type { Card } from '@/core/types';
import type { App, Screen } from '@/game/app';
import { dict, format, t } from '@/i18n';
import { archiveDates, todayKey } from '@/meta/profile';
import { PRODUCT_BY_ID, productForCosmetic } from '@/store/catalog';
import { canvasImg, dpr, h } from '../dom';
import { button, confirmDialog, toast } from '../widgets';

type StarId = 'archive' | 'astrolabe' | 'noads' | 'look';
type Tab = 'atlas' | 'look' | 'support';
const TABS: Tab[] = ['atlas', 'look', 'support'];

/** Южный Крест: перекладина и стойка пересекаются — как карта на кресте двух линий. */
const STARS: { id: StarId; x: number; y: number; mag: number }[] = [
  { id: 'look', x: 0.5, y: 0.1, mag: 0.8 },
  { id: 'noads', x: 0.17, y: 0.47, mag: 0.75 },
  { id: 'archive', x: 0.84, y: 0.4, mag: 0.9 },
  { id: 'astrolabe', x: 0.54, y: 0.88, mag: 1 },
];
/** Пятая, безымянная звезда креста — для узнаваемости фигуры. */
const EPSILON = { x: 0.67, y: 0.62 };

const ASTRO_CARDS: Pick<Card, 'suit' | 'rank' | 'glyph'>[] = [
  { suit: 'moon', rank: 4, glyph: 'echo' },
  { suit: 'sun', rank: 9, glyph: 'prism' },
  { suit: 'comet', rank: 6, glyph: 'blazing' },
];

export class AtlasScreen implements Screen {
  private el!: HTMLElement;
  private star: StarId;
  private prices: Record<string, string> | null = null;
  private busy = false;
  private drawn = false;
  /** Звезда, чья табличка уже на экране. */
  private plateStar: string | null = null;
  private off: (() => void) | null = null;
  private tab: Tab = 'atlas';
  /** Что примеряем (может быть ещё не куплено) и что выбрали последним — к нему кнопка. */
  private tryBack: string;
  private trySky: string;
  private focusSlot: 'back' | 'sky' = 'back';
  private lookStage: PreviewStage | null = null;
  private patronStage: PreviewStage | null = null;

  constructor(
    private readonly app: App,
    focus?: string,
  ) {
    this.star = STARS.some((s) => s.id === focus) ? (focus as StarId) : 'archive';
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
    this.lookStage?.destroy();
    this.patronStage?.destroy();
    this.el.remove();
  }

  private get owned(): boolean {
    return this.app.purchases.has('atlas');
  }

  private render(): void {
    const scroll = this.el.scrollTop;
    const panel =
      this.tab === 'atlas'
        ? [
            h('section.atlas-hero', null, [
              h('p.atlas-lede', null, t('atlas.lede')),
              this.chart(),
              this.plate(),
              this.owned || !this.app.platform.payments ? null : h('p.offer-promise', null, t('atlas.promise')),
            ]),
            this.offer(),
          ]
        : this.tab === 'look'
          ? [this.wardrobe()]
          : [this.support()];
    this.el.replaceChildren(
      ...([
      h('div.atlas-top', null, [button(`‹ ${t('menu.back')}`, () => void this.app.goMenu(), { variant: 'ghost', className: 'small' })]),
      h('h1.atlas-title', null, t('atlas.title')),
      this.tabs(),
      ...panel,
      h('div.atlas-foot', null, [
        h('button.link-btn', { type: 'button', onclick: () => void import('./legal').then(({ showLegal }) => showLegal('terms')) }, t('atlas.terms')),
      ]),
      ].filter((x): x is HTMLElement => !!x)),
    );
    this.el.scrollTop = scroll;
    if (this.tab === 'atlas') this.drawn = true;
  }

  /** Вкладки сверху: всё, что есть в магазине, видно сразу — без поиска прокруткой. */
  private tabs(): HTMLElement {
    const bar = h('div.atlas-tabs', { attrs: { role: 'tablist', 'aria-label': t('atlas.title') } });
    TABS.forEach((id, i) => {
      const on = id === this.tab;
      const b = h(`button.atlas-tab${on ? '.on' : ''}`, {
        type: 'button',
        tabIndex: on ? 0 : -1,
        attrs: { role: 'tab', 'aria-selected': String(on) },
      }, [h('span', null, dict().atlas.tabs[id]!)]);
      b.addEventListener('click', () => this.openTab(id));
      b.addEventListener('keydown', (e) => {
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        this.openTab(TABS[(i + step + TABS.length) % TABS.length]!);
        this.el.querySelector<HTMLElement>('.atlas-tab.on')?.focus();
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
    this.el.scrollTo({ top: 0 });
  }

  // ─── Созвездие ─────────────────────────────────────────────────────────

  private chart(): HTMLElement {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('atlas-lines');
    const at = (id: StarId) => STARS.find((s) => s.id === id)!;
    const line = (a: { x: number; y: number }, b: { x: number; y: number }, lit: boolean, i: number) => {
      const l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', String(a.x * 100));
      l.setAttribute('y1', String(a.y * 100));
      l.setAttribute('x2', String(b.x * 100));
      l.setAttribute('y2', String(b.y * 100));
      l.setAttribute('pathLength', '1');
      l.style.setProperty('--i', String(i));
      if (lit) l.classList.add('lit');
      svg.append(l);
    };
    // Стойка и перекладина креста; линия выбранной звезды горит ярче
    const stem = this.star === 'look' || this.star === 'astrolabe';
    // Купленный атлас — созвездие зажжено целиком
    line(at('look'), at('astrolabe'), stem || this.owned, 0);
    line(at('noads'), at('archive'), !stem || this.owned, 1);
    const wrap = h(`div.atlas-chart${this.drawn ? '' : '.igniting'}`, { attrs: { role: 'tablist', 'aria-label': t('atlas.title') } }, [svg]);
    const dot = h('span.atlas-eps', null);
    dot.style.left = `${EPSILON.x * 100}%`;
    dot.style.top = `${EPSILON.y * 100}%`;
    wrap.append(dot);
    STARS.forEach((s, i) => {
      const [name] = dict().atlas.stars[s.id]!;
      const btn = h(`button.atlas-star${s.id === this.star ? '.on' : ''}`, {
        type: 'button',
        attrs: { role: 'tab', 'aria-selected': String(s.id === this.star), 'aria-controls': 'atlas-plate' },
        tabIndex: s.id === this.star ? 0 : -1,
      }, [h('span.atlas-star-dot', null), h('span.atlas-star-name', null, name)]);
      btn.style.left = `${s.x * 100}%`;
      btn.style.top = `${s.y * 100}%`;
      btn.style.setProperty('--mag', String(s.mag));
      btn.style.setProperty('--i', String(i));
      if (s.x > 0.7) btn.classList.add('label-left');
      if (s.x < 0.3) btn.classList.add('label-right');
      btn.addEventListener('click', () => this.select(s.id));
      btn.addEventListener('keydown', (e) => {
        const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        this.select(STARS[(i + step + STARS.length) % STARS.length]!.id);
      });
      wrap.append(btn);
    });
    return wrap;
  }

  /** Выбрать звезду: табличка меняется и показывается над липкой кнопкой, фокус остаётся на звезде. */
  private select(id: StarId): void {
    if (this.star === id) return;
    this.star = id;
    this.app.svc.audio.click();
    this.render();
    this.el.querySelector<HTMLElement>('.atlas-star.on')?.focus({ preventScroll: true });
    this.el.querySelector('#atlas-plate')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /** Табличка выбранной звезды: что это и как выглядит. */
  private plate(): HTMLElement {
    const [name, rawDesc] = dict().atlas.stars[this.star]!;
    const desc = format(rawDesc, { n: archiveDates().length });
    const body = h('div.plate-body', null, [h('h2.plate-name', null, name), h('p.plate-desc', null, desc)]);
    const visual = h('div.plate-visual', { attrs: { 'aria-hidden': 'true' } });
    const actions: HTMLElement[] = [];
    switch (this.star) {
      case 'archive': {
        visual.append(this.archiveStrip());
        if (this.owned) actions.push(button(t('atlas.openArchive'), () => void this.app.goArchive(), { variant: 'secondary', className: 'small' }));
        break;
      }
      case 'astrolabe': {
        const fan = h('div.plate-fan');
        ASTRO_CARDS.forEach((c, i) => {
          const img = canvasImg(cardFace(c, 64, dpr()), 64 * 1.24, (64 / 0.7) * 1.24, 'plate-card');
          img.style.setProperty('--i', String(i - 1));
          fan.append(img);
        });
        visual.append(fan);
        if (this.owned) actions.push(button(t('atlas.playAstrolabe'), () => this.playAstrolabe(), { variant: 'secondary', className: 'small' }));
        break;
      }
      case 'noads':
        // U+FE0E — текстовый вариант значка: на iOS и в Telegram он не станет эмодзи
        visual.append(h('div.plate-noads', null, [h('span', null, '\u25B6\uFE0E'), h('i', null)]));
        break;
      case 'look': {
        visual.append(
          h('div.plate-look', null, [
            canvasImg(cardBack(64, dpr(), 'astrolabe'), 64 * 1.24, (64 / 0.7) * 1.24, 'plate-card'),
            this.skySwatch(SKY_THEMES.find((s) => s.id === 'astrolabe')!, 64, 92),
          ]),
        );
        if (this.owned) {
          const wearing = this.app.settings.cardBack === 'astrolabe' && this.app.settings.skyTheme === 'astrolabe';
          actions.push(button(wearing ? t('atlas.wearing') : t('atlas.wear'), () => this.wear({ cardBack: 'astrolabe', skyTheme: 'astrolabe' }), { variant: 'secondary', className: 'small', disabled: wearing }));
        }
        break;
      }
    }
    if (actions.length) body.append(h('div.plate-actions', null, actions));
    // Табличка «проявляется» только при смене звезды: пересборка после подгрузки цен или
    // покупки не должна мигать ею заново
    const plate = h(`div#atlas-plate.atlas-plate${this.plateStar !== this.star ? '.enter' : ''}`, { attrs: { role: 'tabpanel', 'aria-live': 'polite' } }, [visual, body]);
    plate.dataset.star = this.star;
    this.plateStar = this.star;
    return plate;
  }

  /** Последние дни архива: сыгранные светятся, пройденные целиком — звездой. */
  private archiveStrip(): HTMLElement {
    const days = archiveDates().slice(0, 7).reverse();
    const results = this.app.profile.archive ?? {};
    const strip = h('div.plate-days');
    for (const date of days) {
      const r = results[date];
      strip.append(
        h(`span.plate-day${r ? '.played' : ''}${r?.won ? '.won' : ''}`, null, [
          h('b', null, String(Number(date.slice(8)))),
          h('small', null, r ? (r.won ? '✦' : String(r.ante)) : ''),
        ]),
      );
    }
    strip.append(h('span.plate-day.today', null, [h('b', null, String(Number(todayKey().slice(8)))), h('small', null, '')]));
    return strip;
  }

  // ─── Покупка атласа ────────────────────────────────────────────────────

  private offer(): HTMLElement {
    const bar = h('div.atlas-offer');
    if (this.owned) {
      bar.classList.add('owned');
      bar.append(h('p.offer-owned', null, t('atlas.owned')));
      return bar;
    }
    if (!this.app.platform.payments) {
      bar.classList.add('unavailable');
      bar.append(h('p.offer-note', null, t('atlas.unavailable')));
      const link = import.meta.env.VITE_TG_APP_LINK;
      if (link) bar.append(button(t('atlas.openTelegram'), () => window.open(link, '_blank', 'noopener'), { variant: 'secondary' }));
      return bar;
    }
    if (this.prices && !this.prices.atlas) {
      // Площадка ответила, но атласа не продаёт (оплата ещё не включена)
      bar.classList.add('unavailable');
      bar.append(h('p.offer-note', null, t('atlas.soon')));
      return bar;
    }
    const price = this.price('atlas');
    const buy = button(this.busy ? t('atlas.paying') : t('atlas.buy'), () => void this.buy('atlas'), {
      sub: this.busy ? undefined : price,
      disabled: this.busy || !this.prices?.atlas,
      className: `offer-buy${this.prices ? '' : ' loading'}`,
    });
    if (this.busy) buy.setAttribute('aria-busy', 'true');
    bar.append(buy);
    return bar;
  }

  private price(id: string): string {
    if (!this.prices) return t('atlas.loading');
    return this.prices[id] ?? '';
  }

  private async buy(id: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.render();
    const result = await this.app.purchase(id);
    this.busy = false;
    if (result === 'paid') {
      // Крест зажигается заново — уже целиком
      if (id === 'atlas' || id === 'supporter') this.drawn = false;
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

  private wardrobe(): HTMLElement {
    const stage = (this.lookStage ??= new PreviewStage({ reduceMotion: this.app.settings.reduceMotion }));
    stage.setBack(this.tryBack);
    stage.setSky(this.trySky);
    const backs = h('div.wardrobe-row', { attrs: { role: 'listbox', 'aria-label': t('atlas.backs') } });
    for (const b of BACKS) {
      backs.append(this.wardrobeItem('back', b.id, canvasImg(cardBack(64, dpr(), b.id), 64 * 1.24, (64 / 0.7) * 1.24)));
    }
    const skies = h('div.wardrobe-row', { attrs: { role: 'listbox', 'aria-label': t('atlas.skies') } });
    for (const s of SKY_THEMES) skies.append(this.wardrobeItem('sky', s.id, this.skySwatch(s, 64, 92)));
    const id = this.focusSlot === 'back' ? this.tryBack : this.trySky;
    return h('section.atlas-look', null, [
      h('div.look-stage', null, [stage.el, h('div.look-caption', null, [
        h('span.look-kind', null, this.focusSlot === 'back' ? t('atlas.backOne') : t('atlas.skyOne')),
        h('span.look-name', null, dict().cosmetic[this.focusSlot][id] ?? id),
      ])]),
      this.lookAction(),
      h('p.atlas-lede.look-lede', null, t('atlas.lookLede')),
      h('h3.atlas-h3', null, t('atlas.backs')),
      backs,
      h('h3.atlas-h3', null, t('atlas.skies')),
      skies,
    ]);
  }

  /** Кнопка под примеркой: надеть, купить или где это продаётся. */
  private lookAction(): HTMLElement {
    const app = this.app;
    const slot = this.focusSlot;
    const id = slot === 'back' ? this.tryBack : this.trySky;
    const name = dict().cosmetic[slot][id] ?? id;
    const current = slot === 'back' ? app.settings.cardBack : app.settings.skyTheme;
    const product = productForCosmetic(slot, id);
    const wrap = h('div.look-action');
    if (app.canWear(slot, id)) {
      const worn = current === id;
      wrap.append(button(worn ? t('atlas.worn') : format(t('atlas.wearIt'), { name }), () => this.wear(slot === 'back' ? { cardBack: id } : { skyTheme: id }), { disabled: worn, variant: worn ? 'secondary' : 'primary', className: 'look-btn' }));
      return wrap;
    }
    if (product?.id === 'atlas') {
      wrap.append(button(t('atlas.inAtlasGo'), () => {
        this.star = 'look';
        this.openTab('atlas');
      }, { variant: 'secondary', className: 'look-btn' }));
      return wrap;
    }
    if (product?.id === 'supporter') {
      wrap.append(button(t('atlas.inSupporterGo'), () => this.openTab('support'), { variant: 'secondary', className: 'look-btn' }));
      return wrap;
    }
    if (product && app.platform.payments && this.prices?.[product.id]) {
      const b = button(this.busy ? t('atlas.paying') : format(t('atlas.buyIt'), { name }), () => void this.buy(product.id), { sub: this.busy ? undefined : this.price(product.id), disabled: this.busy, className: 'look-btn' });
      wrap.append(b);
      return wrap;
    }
    wrap.append(h('p.offer-note', null, app.platform.payments ? (this.prices ? t('atlas.soon') : t('atlas.loading')) : t('atlas.unavailable')));
    return wrap;
  }

  private wardrobeItem(slot: 'back' | 'sky', id: string, art: HTMLElement): HTMLElement {
    const app = this.app;
    const wearable = app.canWear(slot, id);
    const current = slot === 'back' ? app.settings.cardBack : app.settings.skyTheme;
    const wearing = wearable && current === id;
    const trying = (slot === 'back' ? this.tryBack : this.trySky) === id;
    const product = productForCosmetic(slot, id);
    let status: string;
    if (wearing) status = t('atlas.wearing');
    else if (wearable) status = id === 'classic' || id === 'night' ? t('atlas.free') : t('atlas.owned1');
    else if (product?.id === 'atlas') status = t('atlas.inAtlas');
    else if (product?.id === 'supporter') status = t('atlas.inSupporter');
    else status = (product && app.platform.payments ? this.price(product.id) : '') || '—';
    const item = h(`button.wardrobe-item${trying ? '.on' : ''}${wearable ? '' : '.locked'}${wearing ? '.worn' : ''}`, {
      type: 'button',
      attrs: { role: 'option', 'aria-selected': String(trying) },
    }, [art, h('span.wardrobe-name', null, dict().cosmetic[slot][id] ?? id), h('span.wardrobe-status', null, status)]);
    // Нажатие — примерить на сцене; покупка и «надеть» — кнопкой под сценой
    item.addEventListener('click', () => {
      if (slot === 'back') this.tryBack = id;
      else this.trySky = id;
      this.focusSlot = slot;
      this.app.svc.audio.click();
      this.render();
      this.el.querySelector('.look-stage')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return item;
  }

  /** Кусочек неба темы — как оно выглядит за игрой. */
  private skySwatch(theme: SkyTheme, w: number, hgt: number): HTMLElement {
    return canvasImg(skyMiniature(theme.palette ?? DEFAULT_NEBULA, w * 1.24, hgt * 1.24, dpr()), w * 1.24, hgt * 1.24, 'sky-swatch');
  }

  // ─── Поддержка ─────────────────────────────────────────────────────────

  private support(): HTMLElement {
    const app = this.app;
    const payments = app.platform.payments;
    const [name, desc] = dict().atlas.supporter;
    const has = app.purchases.has('supporter');
    const stage = (this.patronStage ??= new PreviewStage({ reduceMotion: app.settings.reduceMotion }));
    stage.setBack('patron');
    stage.setSky('patron');
    let action: HTMLElement;
    if (has) action = h('p.offer-owned', null, t('atlas.supporterOwned'));
    else if (payments && this.prices?.supporter) {
      const b = button(this.busy ? t('atlas.paying') : t('atlas.supporterBuy'), () => void this.buy('supporter'), { sub: this.busy ? undefined : this.price('supporter'), disabled: this.busy, className: 'offer-buy patron-buy' });
      if (this.busy) b.setAttribute('aria-busy', 'true');
      action = b;
    } else action = h('p.offer-note', null, !payments ? t('atlas.unavailable') : this.prices ? t('atlas.soon') : t('atlas.loading'));
    const tipIds = ['tip_small', 'tip_medium', 'tip_large'].filter((id) => this.prices?.[id]);
    const tips = tipIds.length
      ? h('div.support-tips', null, [
          h('h3.atlas-h3', null, t('atlas.tips')),
          h('div.tip-row', null, tipIds.map((id) => button(dict().atlas.tipNames[id] ?? id, () => void this.buy(id), { variant: 'ghost', sub: this.price(id), disabled: this.busy }))),
          h('p.hint', null, t('atlas.tipNote')),
        ])
      : null;
    return h('section.atlas-support', null, [
      h('div.patron', null, [
        h('div.patron-stage', null, [stage.el, h('span.patron-seal', { attrs: { 'aria-hidden': 'true' } }, '✦')]),
        h('div.patron-body', null, [
          h('h2.patron-name', null, name),
          h('p.patron-desc', null, desc),
          h('ul.patron-list', null, dict().atlas.supporterItems.map((line) => h('li', null, line))),
          action,
        ]),
      ]),
      h('p.atlas-lede.patron-lede', null, t('atlas.supportLede')),
      tips,
    ]);
  }
}
