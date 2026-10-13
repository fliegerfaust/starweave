/*
 * THESIS: атлас продаётся как созвездие — четыре его части стоят звёздами креста (главного
 * хода игры), и каждую можно потрогать до оплаты. Отказ от витрины «карточка + список
 * преимуществ + цена».
 * OWN-WORLD: ночь игры — заголовки Forum в золоте, фиолетовые панели с тонкой линией,
 * золотая кнопка-пилюля; фигура созвездия — те же золотые линии и светящиеся звёзды,
 * что на картах.
 * STORY: игрок видит, что внутри, нажимает звёзды, покупает одним нажатием внизу; ниже —
 * примерочная (надеть купленное) и поддержка автора.
 * FIRST VIEWPORT: «‹ Меню», заголовок, фигура креста ~260 px, табличка выбранной звезды,
 * золотая кнопка «Открыть атлас · цена» прилипает к низу экрана.
 * FORM: оглавление-созвездие (4-я структура списка), сид f6974252.
 */
import { cardBack, cardFace } from '@/art/card';
import { BACKS, SKY_THEMES, type SkyTheme } from '@/art/cosmetics';
import { DEFAULT_NEBULA } from '@/art/nebula';
import { skyMiniature } from '@/art/sky-miniature';
import type { Card } from '@/core/types';
import type { App, Screen } from '@/game/app';
import { dict, t } from '@/i18n';
import { archiveDates, dailyNumber, todayKey } from '@/meta/profile';
import { PRODUCT_BY_ID, productForCosmetic } from '@/store/catalog';
import { canvasImg, dpr, h } from '../dom';
import { button, confirmDialog, toast } from '../widgets';

type StarId = 'archive' | 'astrolabe' | 'noads' | 'look';

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
  private off: (() => void) | null = null;

  constructor(
    private readonly app: App,
    focus?: string,
  ) {
    this.star = STARS.some((s) => s.id === focus) ? (focus as StarId) : 'archive';
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
    this.el.remove();
  }

  private get owned(): boolean {
    return this.app.purchases.has('atlas');
  }

  private render(): void {
    const scroll = this.el.scrollTop;
    this.el.replaceChildren(
      ...([
      h('div.atlas-top', null, [button(`‹ ${t('menu.back')}`, () => void this.app.goMenu(), { variant: 'ghost', className: 'small' })]),
      h('section.atlas-hero', null, [
        h('h1.atlas-title', null, t('atlas.title')),
        h('p.atlas-lede', null, t('atlas.lede')),
        this.chart(),
        this.plate(),
      ]),
      this.offer(),
      this.wardrobe(),
      this.support(),
      h('div.atlas-foot', null, [
        h('button.link-btn', { type: 'button', onclick: () => void import('./legal').then(({ showLegal }) => showLegal('terms')) }, t('atlas.terms')),
      ]),
      ].filter((x): x is HTMLElement => !!x)),
    );
    this.el.scrollTop = scroll;
    this.drawn = true;
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
      }, [h('span.atlas-star-dot', null), h('span.atlas-star-name', null, name)]);
      btn.style.left = `${s.x * 100}%`;
      btn.style.top = `${s.y * 100}%`;
      btn.style.setProperty('--mag', String(s.mag));
      btn.style.setProperty('--i', String(i));
      if (s.x > 0.7) btn.classList.add('label-left');
      if (s.x < 0.3) btn.classList.add('label-right');
      btn.addEventListener('click', () => {
        if (this.star === s.id) return;
        this.star = s.id;
        this.app.svc.audio.click();
        this.render();
      });
      wrap.append(btn);
    });
    return wrap;
  }

  /** Табличка выбранной звезды: что это и как выглядит. */
  private plate(): HTMLElement {
    const [name, desc] = dict().atlas.stars[this.star]!;
    const body = h('div.plate-body', null, [h('h2.plate-name', null, name), h('p.plate-desc', null, desc)]);
    const visual = h('div.plate-visual', { attrs: { 'aria-hidden': 'true' } });
    const actions: HTMLElement[] = [];
    switch (this.star) {
      case 'archive': {
        visual.append(this.archiveStrip());
        body.append(h('p.plate-note', null, t('atlas.archiveDays', { n: archiveDates().length })));
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
        visual.append(h('div.plate-noads', null, [h('span', null, '▶'), h('i', null)]));
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
    const plate = h('div#atlas-plate.atlas-plate', { attrs: { role: 'tabpanel', 'aria-live': 'polite' } }, [visual, body]);
    plate.dataset.star = this.star;
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
          h('small', null, r ? (r.won ? '✦' : String(r.ante)) : '·'),
        ]),
      );
    }
    strip.append(h('span.plate-day.today', null, [h('b', null, String(Number(todayKey().slice(8)))), h('small', null, `#${dailyNumber()}`)]));
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
      bar.append(h('p.offer-note', null, t('atlas.unavailable')));
      const link = import.meta.env.VITE_TG_APP_LINK;
      if (link) bar.append(button(t('atlas.openTelegram'), () => window.open(link, '_blank', 'noopener'), { variant: 'secondary' }));
      return bar;
    }
    const price = this.price('atlas');
    bar.append(
      button(t('atlas.buy'), () => void this.buy('atlas'), { sub: price, disabled: this.busy || !this.prices?.atlas, className: 'offer-buy' }),
      h('p.offer-promise', null, t('atlas.promise')),
    );
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
    const backs = h('div.wardrobe-row', { attrs: { role: 'list' } });
    for (const b of BACKS) {
      backs.append(this.wardrobeItem('back', b.id, canvasImg(cardBack(56, dpr(), b.id), 56 * 1.24, (56 / 0.7) * 1.24)));
    }
    const skies = h('div.wardrobe-row', { attrs: { role: 'list' } });
    for (const s of SKY_THEMES) skies.append(this.wardrobeItem('sky', s.id, this.skySwatch(s, 56, 80)));
    return h('section.atlas-section', null, [
      h('h2.atlas-h2', null, t('atlas.wardrobe')),
      h('h3.atlas-h3', null, t('atlas.backs')),
      backs,
      h('h3.atlas-h3', null, t('atlas.skies')),
      skies,
    ]);
  }

  private wardrobeItem(slot: 'back' | 'sky', id: string, art: HTMLElement): HTMLElement {
    const app = this.app;
    const wearable = app.canWear(slot, id);
    const current = slot === 'back' ? app.settings.cardBack : app.settings.skyTheme;
    const wearing = wearable && current === id;
    const product = productForCosmetic(slot, id);
    let status: string;
    if (wearing) status = t('atlas.wearing');
    else if (wearable) status = id === 'classic' || id === 'night' ? t('atlas.free') : t('atlas.wear');
    else if (product?.id === 'atlas') status = t('atlas.inAtlas');
    else if (product?.id === 'supporter') status = t('atlas.inSupporter');
    else status = product && app.platform.payments ? this.price(product.id) : '—';
    const item = h(`button.wardrobe-item${wearing ? '.on' : ''}${wearable ? '' : '.locked'}`, {
      type: 'button',
      attrs: { role: 'listitem', 'aria-pressed': String(wearing) },
    }, [art, h('span.wardrobe-name', null, dict().cosmetic[slot][id] ?? id), h('span.wardrobe-status', null, status)]);
    item.addEventListener('click', () => {
      if (wearable) {
        if (!wearing) this.wear(slot === 'back' ? { cardBack: id } : { skyTheme: id });
        return;
      }
      if (product?.id === 'atlas') {
        this.star = 'look';
        this.render();
        this.el.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (product?.id === 'supporter') {
        this.el.querySelector('.atlas-support')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (product && app.platform.payments) void this.buy(product.id);
    });
    return item;
  }

  /** Кусочек неба темы — как оно выглядит за игрой. */
  private skySwatch(theme: SkyTheme, w: number, hgt: number): HTMLElement {
    return canvasImg(skyMiniature(theme.palette ?? DEFAULT_NEBULA, w * 1.24, hgt * 1.24, dpr()), w * 1.24, hgt * 1.24, 'sky-swatch');
  }

  // ─── Поддержка ─────────────────────────────────────────────────────────

  private support(): HTMLElement | null {
    const payments = this.app.platform.payments;
    if (!payments) return null;
    const [name, desc] = dict().atlas.supporter;
    const has = this.app.purchases.has('supporter');
    const supporter = h('div.support-pack', null, [
      h('div.support-art', { attrs: { 'aria-hidden': 'true' } }, [
        canvasImg(cardBack(48, dpr(), 'patron'), 48 * 1.24, (48 / 0.7) * 1.24),
        this.skySwatch(SKY_THEMES.find((s) => s.id === 'patron')!, 48, 68),
      ]),
      h('div.support-info', null, [h('div.support-name', null, name), h('p.support-desc', null, desc)]),
      has
        ? h('span.support-owned', null, '✦')
        : button(this.price('supporter') || '—', () => void this.buy('supporter'), { variant: 'secondary', className: 'small price-pill', disabled: this.busy || !this.prices?.supporter }),
    ]);
    const tipIds = ['tip_small', 'tip_medium', 'tip_large'].filter((id) => this.prices?.[id]);
    const tips = tipIds.length
      ? h('div.support-tips', null, [
          h('h3.atlas-h3', null, t('atlas.tips')),
          h('div.tip-row', null, tipIds.map((id) => button(dict().atlas.tipNames[id] ?? id, () => void this.buy(id), { variant: 'ghost', sub: this.price(id), disabled: this.busy }))),
          h('p.hint', null, t('atlas.tipNote')),
        ])
      : null;
    return h('section.atlas-section.atlas-support', null, [
      h('h2.atlas-h2', null, t('atlas.support')),
      h('p.atlas-lede', null, t('atlas.supportLede')),
      supporter,
      tips,
    ]);
  }
}
