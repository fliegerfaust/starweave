import { hasNextNight } from '@/core/route';
import { chartIcon, omenSigil, packIcon, ritualIcon } from '@/art/sigil';
import { COMBOS } from '@/core/content/combos';
import { omenDef } from '@/core/content/omens';
import { ritualDef } from '@/core/content/rituals';
import { misorderedOmens } from '@/core/omen-order';
import { currentChoice, type Choice } from '@/core/choices';
import type { Command } from '@/core/commands';
import { banishServicePrice, omenSlots, resonanceAt, ritualMaxTargets, sellPrice } from '@/core/shop';
import { resonanceOf } from '@/core/content/resonance';
import type { Card, RunState, ShopItem } from '@/core/types';
import type { App, Screen } from '@/game/app';
import { track } from '@/analytics';
import { dict, named, t } from '@/i18n';
import { canvasImg, dpr, h } from '../dom';
import { bonusLine } from '../bonus';
import { icon } from '../icons';
import { showChoice } from '../choice';
import { showGift } from '../gift';
import { showTrophyScene } from '../trophy-scene';
import { playResonance } from '../resonance-scene';
import { coach, layoutCoach } from '../tutorial';
import { button, confirmDialog, hideTooltip, modal, withCoin } from '../widgets';
import { makeReorderable } from '../reorder';
import { rich } from '../rich';
import { canReplaceFor, goldAfter } from '../omen-replace';
import { cardThumb, deckGrid, menuButton, showCombos, showDeck, showHelp, showRunMenu } from './common';

/** Помечает элемент для обучения. */
function tag<T extends HTMLElement>(el: T, name: string): T {
  el.dataset.shop = name;
  return el;
}

/** Обсерватория — «Прилавок» (RD.4): товары строками, бонус одной строкой, своё ниже. */
/** Что было на витрине в прошлую отрисовку: по разнице анимируем только изменившееся. */
type ShopSnapshot = { gold: number; omenUids: Set<number>; offers: Map<string, { id: string; sold: boolean }> };

function offerId(item: ShopItem): string {
  return item.kind === 'omen' ? item.omenId : item.kind === 'chart' ? item.combo : item.kind === 'ritual' ? item.ritualId : item.pack;
}

export class ShopScreen implements Screen {
  private el!: HTMLElement;
  private prev: ShopSnapshot | null = null;
  /** Замена (OB): место товара, за который сейчас выбирают, какое своё Знамение отдать. */
  private giving: number | null = null;

  constructor(
    private readonly app: App,
    private readonly run: RunState,
  ) {}

  mount(root: HTMLElement): void {
    this.el = h('div.shop');
    root.append(this.el);
    this.render();
    this.app.runs.tutorial?.emit({ type: 'shop', root: this.el });
    coach(this.app, 'shop');
    if (currentChoice(this.run)) this.showPack();
  }

  unmount(): void {
    this.el.remove();
  }

  private act(cmd: Command, sound: 'coin' | 'click' = 'coin', onSuccess?: () => void): false {
    if (this.app.runs.shopAction(cmd)) {
      onSuccess?.();
      if (sound === 'coin') this.app.svc.audio.coin();
      this.render();
      // Экран пересобран — подсказка первых забегов переставляется к своей цели
      requestAnimationFrame(layoutCoach);
      this.app.runs.tutorial?.emit({ type: 'shopChanged' });
    }
    return false;
  }

  private trackBuy(item: ShopItem): void {
    const id = item.kind === 'omen' ? item.omenId : item.kind === 'chart' ? item.combo : item.kind === 'ritual' ? item.ritualId : item.pack;
    track('shop_buy', { kind: item.kind, id, price: item.price, ante: this.run.ante, gold_left: this.run.gold });
  }

  private afterPackBuy(): void {
    if (currentChoice(this.run)) this.showPack();
  }

  /**
   * Выбор решён — следующий из очереди открывается сразу (FX.1): после Яркой ночи за даром
   * стоит бесплатное Знамение, и без этого «Следующая ночь» молча упиралась в очередь.
   */
  private resolve(cmd: Command, sound: 'coin' | 'click', onSuccess?: () => void): void {
    this.act(cmd, sound, onSuccess);
    this.afterPackBuy();
  }

  private render(): void {
    const run = this.run;
    const shop = run.shop!;
    const seen = [...shop.omens.flatMap((i) => (i.kind === 'omen' ? [i.omenId] : [])), ...run.omens.map((o) => o.id)];
    const open = currentChoice(run);
    if (open?.kind === 'pack' && open.pack === 'omen') seen.push(...open.options);
    this.app.runs.progress({ e: 'omensShown', ids: seen }, run);
    const slots = omenSlots(run);
    // Прокрутка середины переживает пересборку экрана после покупки
    const keepScroll = this.el.querySelector('.shop-body')?.scrollTop ?? 0;

    // Экран пересобирается после каждого действия. Появление строк играет только при входе,
    // дальше двигается лишь то, что изменилось: купленное гаснет, новое после «Обновить» всплывает
    const prev = this.prev;
    this.el.classList.toggle('settled', prev !== null);
    const offers = new Map<string, { id: string; sold: boolean }>();
    const mark = (row: HTMLElement, key: string, item: ShopItem): HTMLElement => {
      const was = prev?.offers.get(key);
      offers.set(key, { id: offerId(item), sold: item.sold });
      if (prev && (!was || was.id !== offerId(item))) row.classList.add('fresh');
      else if (was && item.sold && !was.sold) row.classList.add('just-sold');
      return row;
    };
    const omenRows = shop.omens.map((item, i) => mark(tag(this.wareRow(item, () => this.buyOmen(item, i)), `omen-${i}`), `omen-${i}`, item));
    if (this.giving !== null) omenRows[this.giving]?.classList.add('giving');
    const itemRows = shop.items.map((item, i) => mark(this.wareRow(item, () => this.buyItem(item, i)), `item-${i}`, item));
    const packRows = shop.packs.map((item, i) => mark(this.wareRow(item, () => this.act({ c: 'buyPack', slot: i }, 'coin', () => this.trackBuy(item)) || this.afterPackBuy()), `pack-${i}`, item));

    // Свои Знамения: только знаки, порядок — слева направо; касание — лист с бонусом и «Продать»
    const owned = h('div.owned-omens', { dataset: { shop: 'owned' }, style: `--slots: ${slots}` });
    const misordered = misorderedOmens(run.omens);
    const givingItem = this.giving !== null ? shop.omens[this.giving] : undefined;
    const giving = givingItem?.kind === 'omen' && !givingItem.sold ? { slot: this.giving!, item: givingItem } : null;
    if (!giving) this.giving = null;
    run.omens.forEach((o, i) => {
      const medal = h('button.omen-slot.draggable', { type: 'button', dataset: { dragHandle: '' }, ariaLabel: named('omen', o.id).name, onclick: () => (giving ? this.giveFor(giving.slot, o.uid) : this.showOwned(o.uid)) },
        // Рисуется крупно, размер задаёт раскладка: на ПК и в ландшафте медали больше (OB, 29.10)
        canvasImg(omenSigil(o.id, 64, dpr()), 48));
      const chip = h(`div.owned-omen${prev && !prev.omenUids.has(o.uid) ? '.fresh' : ''}`, { dataset: { omen: String(i) } }, medal);
      // Замена: над медалью цена продажи; не хватает золота с этой продажей — медаль тусклая
      if (giving) {
        const left = goldAfter(run, o, giving.item.price) ?? 0;
        chip.classList.add('give', ...(left < 0 ? ['short'] : []));
        medal.disabled = left < 0;
        chip.append(h('span.give-badge', null, withCoin(`+${sellPrice(o.id)}`)));
      }
      if (misordered && o.id === misordered.xmult && run.omens.findIndex((x) => x.id === misordered.xmult) === i) chip.classList.add('misplaced');
      owned.append(chip);
    });
    for (let i = run.omens.length; i < slots; i++) owned.append(h('div.owned-omen.empty', null, h('div.omen-slot.empty')));
    makeReorderable(owned, '.owned-omen:not(.empty)', (from, to) => this.act({ c: 'moveOmen', from, to }, 'click'), () => hideTooltip());
    // Резонанс (RS.2): пара рядом — между медалями нить и строка «Слить»; пара врозь — совет
    const resAt = resonanceAt(run);
    const resHint = this.resonanceHint(owned, resAt);
    const ownedHint = giving
      ? h('div.give-hint', null, [
          h('p.hint', null, t('shop.replaceHint', { name: named('omen', giving.item.omenId).name })),
          h('button.link-btn', { type: 'button', onclick: () => { this.giving = null; this.render(); } }, t('shop.replaceCancel')),
        ])
      : resHint ?? (misordered
      ? h('p.hint.order-warn', null, t('shop.orderWarn', { x: named('omen', misordered.xmult).name, a: named('omen', misordered.additive).name }))
      : h('p.hint', null, run.omens.length ? `${t('shop.ownedHint')} ${t('shop.ownedTap')}` : t('shop.omensEmptyHint')));

    // После последней ночи финального созвездия впереди победа, а не карта
    const canPeek = hasNextNight(run);
    const goods = [...itemRows, ...packRows];
    const hasRituals = shop.items.some((i) => i.kind === 'ritual');
    const sections: (HTMLElement | null)[] = [
      h('header.shop-top', null, [
        menuButton(() => showRunMenu(this.app, canPeek ? [button(t('pause.viewMap'), () => this.app.router.peekMap(), { variant: 'secondary' })] : [])),
        h('h1.shop-title', null, t('shop.title')),
        canPeek ? h('button.icon-btn.shop-map', { type: 'button', ariaLabel: t('pause.viewMap'), title: t('pause.viewMap'), onclick: () => this.app.router.peekMap() }, icon('daily')) : h('span'),
        h(`div.gold-pill${prev && prev.gold !== run.gold ? '.pop' : ''}`, null, String(run.gold)),
      ]),
      // Середина прокручивается сама; шапка и кнопки на месте — ничего не прячется под панелью
      h('div.shop-body', null, [
      h('div.shop-goods', null, [
        h('section.shop-section', { dataset: { shop: 'omens' } }, [h('h2.shop-label', null, t('shop.omens')), h('div.ware-list', null, omenRows)]),
        goods.length
          ? h('section.shop-section', { dataset: { shop: 'items' } }, [
              h('div.shop-label-row', null, [
                h('h2.shop-label', null, t(hasRituals || packRows.length ? 'shop.goods' : 'shop.itemsCharts')),
                h('button.link-btn.shop-combos', { type: 'button', onclick: () => showCombos(run, this.app.profile.combosFound) }, t('combos.yours')),
              ]),
              h('div.ware-list', null, goods),
            ])
          : null,
      ]),
      h('div.shop-lower', null, [
        h(`section.shop-section.shop-owned${giving ? '.giving' : ''}`, null, [
          h('div.shop-label-row', null, [h('h2.shop-label', null, t('shop.yourOmens')), h('span.shop-count', null, `${run.omens.length}/${slots}`)]),
          owned,
          ownedHint,
        ]),
        this.deckPart(),
      ]),
      ]),
      h('footer.shop-actions', null, [
        button(h('span.btn-row', null, [icon('again'), h('span.reroll-label', null, t('shop.rerollShort')), withCoin(String(shop.rerollCost))]), () => this.act({ c: 'reroll' }, 'click', () => track('shop_reroll', { cost: shop.rerollCost - 1, ante: run.ante })), {
          variant: 'secondary', disabled: run.gold < shop.rerollCost, ariaLabel: t('shop.reroll', { n: shop.rerollCost }), className: 'reroll',
        }),
        tag(button(t('shop.next'), () => this.app.runs.leaveShop(), { className: 'grow' }), 'next'),
      ]),
    ];
    this.el.replaceChildren(...sections.filter((x): x is HTMLElement => x !== null));
    this.el.classList.toggle('short', this.availHeight() < 700);
    this.el.querySelector('.shop-body')?.scrollTo({ top: keepScroll });
    this.prev = { gold: run.gold, omenUids: new Set(run.omens.map((o) => o.uid)), offers };
  }

  /** Высота экрана без системных зон (вырез, кнопки Telegram): по ней включается плотный вид. */
  private availHeight(): number {
    const cs = getComputedStyle(this.el);
    return this.el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  }

  /** Что даёт товар: имя, уровень у звёздной карты, бонус строкой, значок. */
  private wareInfo(item: ShopItem): { icon: HTMLCanvasElement; name: string; level?: string; bonus: string } {
    const run = this.run;
    if (item.kind === 'omen') {
      const def = omenDef(item.omenId);
      const info = named('omen', item.omenId, def.vars?.(def.initialData?.() ?? {}) ?? {});
      return { icon: canvasImg(omenSigil(item.omenId, 48, dpr()), 48), name: info.name, bonus: info.desc };
    }
    if (item.kind === 'chart') {
      const level = run.comboLevels[item.combo];
      const def = COMBOS[item.combo];
      return {
        icon: canvasImg(chartIcon(item.combo, 48, dpr()), 48),
        name: t('shop.chartName', { combo: t(`combo.${item.combo}`) }),
        level: t('shop.chartLevel', { from: level, to: level + 1 }),
        bonus: t('shop.chartBonus', { combo: t(`combo.${item.combo}`), light: def.levelLight, mult: def.levelMult }),
      };
    }
    if (item.kind === 'pack') {
      const info = named('pack', item.pack);
      return { icon: canvasImg(packIcon(item.pack, 48, dpr()), 48), name: info.name, bonus: info.desc };
    }
    const info = named('ritual', item.ritualId);
    return { icon: canvasImg(ritualIcon(item.ritualId, 48, dpr()), 48), name: info.name, bonus: info.desc };
  }

  /** Товар — одна строка: крупный знак, имя, бонус строкой, цена. */
  private wareRow(item: ShopItem, onBuy: () => void): HTMLElement {
    const run = this.run;
    const info = this.wareInfo(item);
    const affordable = run.gold >= item.price;
    // Полный ряд: Знамение покупается заменой своего (OB); пакет Знамений — как обычно, замена при выборе
    const full = item.kind === 'omen' && run.omens.length >= omenSlots(run);
    const canGive = full && canReplaceFor(run, item.price);
    // Глиф: короткая анимация в справочнике и правило «один глиф на карту»
    const glyph = item.kind === 'ritual' && item.ritualId.startsWith('glyph-') ? item.ritualId.slice('glyph-'.length) : null;
    return h(`article.ware${item.sold ? '.sold' : ''}`, null, [
      h('div.ware-icon', null, info.icon),
      h('div.ware-name', null, [info.name, info.level ? h('span.ware-level', null, info.level) : null]),
      h('div.ware-bonus', null, [
        bonusLine(info.bonus),
        glyph ? h('button.link-btn.ware-how', { type: 'button', onclick: () => showHelp({ focus: `glyph-${glyph}`, profile: this.app.profile }) }, t('shop.glyphHow')) : null,
      ]),
      item.sold
        ? h('div.sold-label', null, [icon('check'), t('shop.sold')])
        : button(canGive ? withCoin(`${t('shop.replace')} ${item.price}`) : !affordable || full ? t('shop.noGoldShort') : withCoin(String(item.price)), onBuy, {
            // Цена — второстепенная кнопка: главная на экране одна, «Следующая ночь»
            variant: 'secondary',
            className: `price${canGive ? ' replace' : full || !affordable ? ' why' : ''}`,
            disabled: full ? !canGive : !affordable,
            title: full && !canGive ? t('shop.noGold') : !affordable && !full ? t('shop.noGold') : '',
            ariaLabel: t('shop.buyLabel', { name: info.name, n: item.price }),
          }),
    ]);
  }

  /**
   * Резонанс в ряду своих Знамений: пара рядом — медали светятся, между ними нить, ниже
   * строка «A + B → легендарное» и «Слить» (вариант A) или совет коснуться медали (вариант B).
   * Пара врозь — совет поставить рядом. Ничего нет — `null`, остаётся обычная подсказка.
   */
  private resonanceHint(owned: HTMLElement, at: number): HTMLElement | null {
    const run = this.run;
    if (!run.unlocks.resonance) return null;
    if (at >= 0) {
      const a = run.omens[at]!;
      const b = run.omens[at + 1]!;
      const res = resonanceOf(a.id, b.id)!;
      const chips = owned.querySelectorAll<HTMLElement>('.owned-omen');
      chips[at]?.classList.add('res');
      chips[at + 1]?.classList.add('res');
      // Нить — дугой над промежутком между медалями, когда ряд уже разложен
      requestAnimationFrame(() => {
        const l = chips[at]?.getBoundingClientRect();
        const r = chips[at + 1]?.getBoundingClientRect();
        const box = owned.getBoundingClientRect();
        if (!l || !r || !owned.isConnected) return;
        const x1 = l.right - box.left - 6;
        const x2 = r.left - box.left + 6;
        const y = l.top - box.top + l.height / 2;
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('class', 'res-thread');
        svg.setAttribute('width', String(box.width));
        svg.setAttribute('height', String(box.height));
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', `M${x1} ${y}Q${(x1 + x2) / 2} ${y - 14} ${x2} ${y}`);
        svg.append(path);
        owned.append(svg);
      });
      const text = t('resonance.ready', { a: named('omen', a.id).name, b: named('omen', b.id).name, c: named('omen', res.id).name });
      return h('div.res-line', null, [
        h('span', null, text),
        button(t('resonance.fuse'), () => this.fuse(at), { className: 'res-go' }),
      ]);
    }
    const ids = run.omens.map((o) => o.id);
    const i = ids.findIndex((id, k) => ids.some((other, j) => j > k + 1 && !!resonanceOf(id, other)));
    if (i < 0) return null;
    const j = ids.findIndex((other, k) => k > i + 1 && !!resonanceOf(ids[i]!, other));
    return h('p.hint.res-hint', null, t('resonance.apart', { a: named('omen', ids[i]!).name, b: named('omen', ids[j]!).name }));
  }

  /** Слияние пары с места `at`: сцена Резонанса, слияние в забеге, когда медали встретились. */
  private fuse(at: number): void {
    const run = this.run;
    const a = run.omens[at];
    const b = run.omens[at + 1];
    const res = a && b ? resonanceOf(a.id, b.id) : undefined;
    if (!res) return;
    const chips = this.el.querySelectorAll<HTMLElement>('.owned-omen');
    track('resonance_fuse', { id: res.id, ante: run.ante });
    void playResonance(a!.id, b!.id, res.id, [chips[at] ?? null, chips[at + 1] ?? null], () => this.act({ c: 'fuse', at }, 'click'));
  }

  /** Купить Знамение; ряд полон — свой ряд становится целью: касание медали и есть замена (OB). */
  private buyOmen(item: ShopItem, slot: number): void {
    if (item.kind !== 'omen') return;
    if (this.run.omens.length < omenSlots(this.run)) {
      this.act({ c: 'buyOmen', slot }, 'coin', () => this.trackBuy(item));
      return;
    }
    this.giving = this.giving === slot ? null : slot;
    this.render();
    this.el.querySelector('.shop-owned')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /** Замена: своё `uid` продано, Знамение с места `slot` встало на его место. */
  private giveFor(slot: number, uid: number): void {
    const item = this.run.shop?.omens[slot];
    const old = this.run.omens.find((o) => o.uid === uid);
    if (item?.kind !== 'omen' || !old) return;
    this.giving = null;
    this.act({ c: 'buyOmen', slot, replace: uid }, 'coin', () => {
      track('shop_sell', { id: old.id, ante: this.run.ante });
      this.trackBuy(item);
    });
  }

  /** Своё Знамение: лист с бонусом и продажей (продажа — с подтверждением). */
  private showOwned(uid: number): void {
    const o = this.run.omens.find((x) => x.uid === uid);
    if (!o) return;
    const def = omenDef(o.id);
    const { name, desc } = named('omen', o.id, def.vars?.(o.data ?? {}) ?? {});
    const price = sellPrice(o.id);
    const m = modal(
      [
        h('div.owned-sheet', null, [canvasImg(omenSigil(o.id, 64, dpr()), 64), bonusLine(desc)]),
        h('div.owned-sheet-acts', null, [
          button(t('shop.sell', { n: price }), () => confirmDialog(
            t('shop.sellConfirm', { name, n: price }),
            () => {
              m.close();
              this.act({ c: 'sellOmen', uid: o.uid }, 'coin', () => track('shop_sell', { id: o.id, ante: this.run.ante }));
            },
            'danger',
            { yes: t('shop.sell', { n: price }), no: t('shop.keep') },
          ), { variant: 'secondary' }),
          button(t('shop.keep'), () => m.close()),
        ]),
      ],
      { title: name, sheet: true, className: 'owned-omen-sheet' },
    );
  }

  private buyItem(item: ShopItem, slot: number): void {
    if (item.kind !== 'ritual') {
      this.act({ c: 'buyItem', slot }, 'coin', () => this.trackBuy(item));
      return;
    }
    this.pickTargets(item.ritualId, (ids) => this.withRitualResult(item.ritualId, () => this.act({ c: 'buyItem', slot, targets: ids }, 'coin', () => this.trackBuy(item))));
  }

  /** Выполняет ритуал и показывает, что стало с картами: было → стало. */
  private withRitualResult(ritualId: string, run: () => void): void {
    const before = new Map(this.run.deck.map((c) => [c.id, { ...c }]));
    run();
    const after = new Map(this.run.deck.map((c) => [c.id, c]));
    const rows: HTMLElement[] = [];
    let i = 0;
    for (const [id, old] of before) {
      const now = after.get(id);
      const delay = `${i * 0.15}s`;
      if (!now) {
        rows.push(h('div.ritual-row', { style: { animationDelay: delay } }, [h('div.ritual-card.gone', { style: { animationDelay: delay } }, cardThumb(old)), h('span.ritual-note', null, t('shop.removed'))]));
        i++;
      } else if (now.suit !== old.suit || now.rank !== old.rank || now.glyph !== old.glyph) {
        rows.push(
          h('div.ritual-row', { style: { animationDelay: delay } }, [
            h('div.ritual-card', null, cardThumb(old)),
            h('span.arrow', null, '→'),
            h('div.ritual-card.flip', { style: { animationDelay: delay } }, cardThumb(now)),
            now.glyph && now.glyph !== old.glyph ? h('span.ritual-note', null, [`${t(`glyph.${now.glyph}`)}: `, rich(dict().glyphDesc[now.glyph])]) : null,
          ]),
        );
        i++;
      }
    }
    for (const [id, now] of after) {
      if (before.has(id)) continue;
      rows.push(h('div.ritual-row', null, [h('div.ritual-card.flip', null, cardThumb(now)), h('span.ritual-note', null, t('shop.added'))]));
    }
    if (rows.length === 0) return;
    this.app.svc.audio.ignite(1);
    const m = modal([h('div.ritual-result', null, rows), h('div.row.center', null, button(t('shop.great'), () => m.close()))], {
      title: `${named('ritual', ritualId).name} · ${t('shop.ritualDone')}`,
      className: 'narrow',
    });
  }

  /** Колода: посмотреть и постоянная услуга «Убрать карту» — раз за визит, чтобы чистить колоду. */
  private deckPart(): HTMLElement {
    const run = this.run;
    const price = banishServicePrice(run);
    const used = !!run.shop?.banishUsed;
    const banish = h('button.ware-light', {
      type: 'button',
      disabled: used || price === null || run.gold < (price ?? 0),
      onclick: () => this.pickTargets('banish', (ids) => this.withRitualResult('banish', () => this.act({ c: 'banish', card: ids[0]! }, 'coin', () => track('shop_banish', { ante: run.ante }))), undefined, 1, { name: t('shop.banishTitle'), desc: t('shop.banishDesc') }),
    }, [icon('cut'), used ? t('shop.banishUsed') : withCoin(t('shop.banish', { n: price ?? '—' }))]);
    return h('section.shop-section.shop-deck', null, [
      h('div.shop-label-row', null, [h('h2.shop-label', null, t('night.deck')), h('span.shop-count', null, String(run.deck.length))]),
      h('div.ware-lights', null, [h('button.ware-light', { type: 'button', onclick: () => showDeck(run) }, [icon('deck'), t('shop.viewDeck')]), banish]),
      h('p.hint', null, used ? t('shop.banishUsedHint') : price === null ? t('shop.banishMin') : t('shop.banishHint')),
    ]);
  }

  /** Выбор карт колоды для ритуала. `maxOverride` — для услуг с другим лимитом. */
  private pickTargets(ritualId: string, onApply: (ids: number[]) => void, onCancel?: () => void, maxOverride?: number, title?: { name: string; desc: string }): void {
    const def = ritualDef(ritualId);
    const max = maxOverride ?? ritualMaxTargets(this.run, ritualId);
    const selected = new Set<number>();
    let applied = false;
    const confirmBtn = button(t('shop.apply'), () => {
      applied = true;
      m.close();
      onApply([...selected]);
    }, { disabled: true });
    const update = () => {
      confirmBtn.disabled = selected.size < def.minTargets || selected.size > max;
    };
    const onToggle = (c: Card) => {
      if (selected.has(c.id)) selected.delete(c.id);
      else {
        if (selected.size >= max) {
          if (max === 1) {
            selected.clear();
            grid.querySelectorAll('.deck-card.selected').forEach((el) => el.classList.remove('selected'));
          } else return;
        }
        selected.add(c.id);
      }
      this.app.svc.audio.tick();
      update();
    };
    const grid = deckGrid(this.run.deck, { selectable: def.canTarget, selected, onToggle });
    // Услуга «Убрать карту» выбирает тем же окном, но берёт одну карту — у неё свои слова
    const info = title ?? named('ritual', ritualId);
    const m = modal(
      [
        h('p.modal-text', null, rich(info.desc)),
        h('p.hint', null, max === 1 ? t('shop.pickTarget') : t('shop.pickTargets', { min: def.minTargets, max })),
        ritualId.startsWith('glyph-') ? h('p.hint.order-warn', null, t('shop.glyphReplace')) : null,
        grid,
        h('div.row.between', null, [button(t('shop.cancel'), () => m.close(), { variant: 'secondary' }), confirmBtn]),
      ],
      { title: info.name, className: 'wide', onClose: () => !applied && onCancel?.() },
    );
  }

  /**
   * Выбор в очереди: дар ночи — веером (`ui/gift.ts`), купленный пакет — общая сцена
   * «Выбери одно» (`ui/choice.ts`).
   */
  private showPack(): void {
    const choice = currentChoice(this.run);
    if (choice?.kind === 'trophy') {
      // Обычно выбор после Затмения играется на небе ночи; сюда попадаем, если забег
      // закрыли посреди него — та же сцена, но по центру экрана и без полёта в раму
      if (document.querySelector('.trophy-scene')) return;
      showTrophyScene(this.run, choice, {
        field: null,
        foot: null,
        root: null,
        from: null,
        take: (index, replace) => this.app.runs.shopAction({ c: 'choose', index, ...(replace !== undefined ? { replace } : {}) }),
        landing: () => null,
        done: () => {
          this.render();
          if (currentChoice(this.run)) this.showPack();
        },
      });
      return;
    }
    if (choice?.kind === 'gift') {
      // Экран Обсерватории пересобрали поверх открытого дара — второй дар не открываем
      // (закрывающийся дар не в счёт: за ним может стоять следующий выбор)
      if (document.querySelector('.modal-backdrop:not(.closing) .gift-scene')) return;
      const shown = showGift(this.app, this.run, choice, {
        take: (index) => this.takeGift(choice, index),
        skip: () => this.resolve({ c: 'skip' }, 'coin', () => track('gift_skip', { ante: this.run.ante, deck: this.run.deck.length })),
        deck: () => showDeck(this.run),
      });
      // Вариант дара не нарисовать (карту Возвышения убрали) — дар отменяется, чтобы не застрять
      if (!shown) this.resolve({ c: 'skip' }, 'click');
      return;
    }
    showChoice(this.app, this.run, {
      take: (index, id, close, replace) => this.takeFromPack(index, id, close, replace),
      skip: () => this.resolve({ c: 'skip' }, 'click'),
    });
  }

  private takeGift(choice: Extract<Choice, { kind: 'gift' }>, index: number): void {
    const offer = choice.options[index]!;
    const kind = offer.k === 'ascend' ? 'ascend' : offer.card.body ? 'body' : 'glyph';
    const id = offer.k === 'ascend' ? 'ascend' : (offer.card.body ?? offer.card.glyph ?? '');
    this.resolve({ c: 'choose', index }, 'coin', () => track('gift_take', { kind, id, ante: this.run.ante, deck: this.run.deck.length }));
  }

  private takeFromPack(index: number, id: string, close: () => void, replace?: number): void {
    const choice = currentChoice(this.run);
    if (choice?.kind !== 'pack') return;
    close();
    const done = () => track('pack_choose', { pack: choice.pack, id });
    if (choice.pack === 'ritual') {
      this.pickTargets(
        id,
        (ids) => {
          this.withRitualResult(id, () => this.act({ c: 'choose', index, targets: ids }, 'coin', done));
          if (currentChoice(this.run)) this.showPack();
        },
        () => this.showPack(),
      );
      return;
    }
    this.resolve({ c: 'choose', index, ...(replace !== undefined ? { replace } : {}) }, 'coin', done);
  }
}
