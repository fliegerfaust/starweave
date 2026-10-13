import { chartIcon, omenSigil, packIcon, ritualIcon } from '@/art/sigil';
import { FINAL_ANTE } from '@/core/content/balance';
import { COMBOS } from '@/core/content/combos';
import { omenDef } from '@/core/content/omens';
import { ritualDef } from '@/core/content/rituals';
import { misorderedOmens } from '@/core/omen-order';
import { banishCard, banishServicePrice, buyItem, buyOmen, buyPack, choosePack, moveOmen, omenSlots, reroll, ritualMaxTargets, sellOmen, sellPrice, skipPack } from '@/core/shop';
import type { Card, ComboId, RunState, ShopItem } from '@/core/types';
import type { App, Screen } from '@/game/app';
import { track } from '@/analytics';
import { markOmensSeen, saveProfile } from '@/meta/profile';
import { dict, named, t } from '@/i18n';
import { canvasImg, dpr, h } from '../dom';
import { omenBadge, omenMedal, omenTooltip } from '../hud';
import { rich } from '../rich';
import { coach } from '../tutorial';
import { attachTooltip, button, confirmDialog, hideTooltip, modal, type ModalHandle, withCoin } from '../widgets';
import { makeReorderable } from '../reorder';
import { cardThumb, deckGrid, menuButton, showCombos, showDeck, showHelp, showRunMenu } from './common';

/** Помечает элемент для обучения. */
function tag<T extends HTMLElement>(el: T, name: string): T {
  el.dataset.shop = name;
  return el;
}

/** Обсерватория: витрина Знамений и предметов, свои Знамения, переброс. */
/** Заголовок раздела: название слева, необязательная ссылка-подсказка справа. */
function sectionHead(title: string, link?: string, onLink?: () => void): HTMLElement {
  return h('div.section-head', null, [
    h('h2', null, title),
    link && onLink ? h('button.link-btn', { type: 'button', onclick: onLink }, `${link} ›`) : null,
  ]);
}

export class ShopScreen implements Screen {
  private el!: HTMLElement;

  constructor(
    private readonly app: App,
    private readonly run: RunState,
  ) {}

  mount(root: HTMLElement): void {
    this.el = h('div.shop');
    root.append(this.el);
    this.render();
    this.app.tutorial?.emit({ type: 'shop', root: this.el });
    coach(this.app, 'shop');
    if (this.run.shop?.openPack) this.showPack();
  }

  unmount(): void {
    this.el.remove();
  }

  private act(fn: (run: RunState) => void, sound: 'coin' | 'click' = 'coin', onSuccess?: () => void): false {
    if (this.app.shopAction(fn)) {
      onSuccess?.();
      if (sound === 'coin') this.app.svc.audio.coin();
      this.render();
      this.app.tutorial?.emit({ type: 'shopChanged' });
    }
    return false;
  }

  private trackBuy(item: ShopItem): void {
    const id = item.kind === 'omen' ? item.omenId : item.kind === 'chart' ? item.combo : item.kind === 'ritual' ? item.ritualId : item.pack;
    track('shop_buy', { kind: item.kind, id, price: item.price, ante: this.run.ante, gold_left: this.run.gold });
  }

  private afterPackBuy(): void {
    if (this.run.shop?.openPack) this.showPack();
  }

  private render(): void {
    const run = this.run;
    const shop = run.shop!;
    const seen = [...shop.omens.flatMap((i) => (i.kind === 'omen' ? [i.omenId] : [])), ...run.omens.map((o) => o.id)];
    if (shop.openPack?.pack === 'omen') seen.push(...shop.openPack.options);
    if (markOmensSeen(this.app.profile, seen)) saveProfile(this.app.profile);
    const slots = omenSlots(run);

    const omenCards = h('div.shop-row', null, shop.omens.map((item, i) => tag(this.itemCard(item, () => this.act((r) => buyOmen(r, i), 'coin', () => this.trackBuy(item))), `omen-${i}`)));
    const itemCards = h('div.shop-row', null, shop.items.map((item, i) => this.itemCard(item, () => this.buyItem(item, i))));
    const packCards = h('div.shop-row', null, shop.packs.map((item, i) => this.itemCard(item, () => this.act((r) => buyPack(r, i), 'coin', () => this.trackBuy(item)) || this.afterPackBuy())));

    const owned = h('div.owned-omens', { dataset: { shop: 'owned' }, style: `--slots: ${slots}` });
    run.omens.forEach((o, i) => {
      const medal = h('div.omen-slot.draggable', { dataset: { dragHandle: '' } }, [h('span.order-num', null, String(i + 1)), omenMedal(o.id, 52)]);
      const chip = h('div.owned-omen', { dataset: { omen: String(i) } }, [
        medal,
        h('button.btn.btn-secondary.small.sell-btn', {
          type: 'button',
          title: t('shop.sell', { n: sellPrice(o.id) }),
          // Продажа — с подтверждением: кнопка под пальцем, когда Знамения переставляют
          onclick: () =>
            confirmDialog(
              t('shop.sellConfirm', { name: named('omen', o.id).name, n: sellPrice(o.id) }),
              () => this.act((r) => sellOmen(r, o.uid), 'coin', () => track('shop_sell', { id: o.id, ante: run.ante })),
              'danger',
              { yes: t('shop.sell', { n: sellPrice(o.id) }), no: t('shop.keep') },
            ),
        }, [
          h('span.sell-label', null, t('shop.sellShort')),
          h('span.sell-price', null, `+${sellPrice(o.id)}`),
        ]),
      ]);
      attachTooltip(medal, () => omenTooltip(o));
      owned.append(chip);
    });
    for (let i = run.omens.length; i < slots; i++) owned.append(h('div.owned-omen.empty', null, h('div.omen-slot.empty', null, String(i + 1))));
    const misordered = misorderedOmens(run.omens);
    if (misordered) owned.querySelector(`[data-omen="${run.omens.findIndex((o) => o.id === misordered.xmult)}"]`)?.classList.add('misplaced');
    makeReorderable(owned, '.owned-omen:not(.empty)', (from, to) => this.act((r) => moveOmen(r, from, to), 'click'), () => hideTooltip());

    const sections: (HTMLElement | null)[] = [
      h('div.shop-top', null, [
        h('h1.shop-title', null, t('shop.title')),
        h('div.row.gap', null, [
          h('div.gold-pill', null, String(run.gold)),
          menuButton(() => showRunMenu(this.app, run.endless || run.ante < FINAL_ANTE || run.nightIndex < 2 ? [button(t('pause.viewMap'), () => this.app.peekMap(), { variant: 'secondary' })] : [])),
        ]),
      ]),
      // После последней ночи финального созвездия впереди победа, а не карта
      run.endless || run.ante < FINAL_ANTE || run.nightIndex < 2
        ? h('button.map-peek', { type: 'button', onclick: () => this.app.peekMap() }, `☾ ${t('pause.viewMap')} →`)
        : null,
      h('section.shop-section', { dataset: { shop: 'omens' } }, [sectionHead(t('shop.omens')), omenCards]),
      h('section.shop-section', { dataset: { shop: 'items' } }, [
        sectionHead(t(shop.items.some((i) => i.kind === 'ritual') ? 'shop.items' : 'shop.itemsCharts'), t('combos.yours'), () => showCombos(run, this.app.profile.combosFound)),
        itemCards,
      ]),
      shop.packs.length ? h('section.shop-section', null, [sectionHead(t('shop.packs')), packCards]) : null,
      // Своё — внизу одной панелью: Знамения (порядок важен) и колода
      h('section.shop-section.inventory', null, [
        h('div.inventory-part', null, [
          sectionHead(`${t('shop.yourOmens')} · ${run.omens.length}/${slots}`, t('scoring.button'), () => showHelp({ focus: 'order' })),
          owned,
          misordered
            ? h('p.hint.order-warn', null, t('shop.orderWarn', { x: named('omen', misordered.xmult).name, a: named('omen', misordered.additive).name }))
            : h('p.hint', null, run.omens.length > 1 ? t('shop.dragHint') : t('shop.omensEmptyHint')),
        ]),
        this.deckPart(),
      ]),
      h('div.shop-actions', null, [
        button(withCoin(t('shop.reroll', { n: shop.rerollCost })), () => this.act((r) => reroll(r), 'click', () => track('shop_reroll', { cost: shop.rerollCost - 1, ante: run.ante })), { variant: 'secondary', disabled: run.gold < shop.rerollCost }),
        tag(button(t('shop.next'), () => this.app.leaveShop(), { className: 'grow' }), 'next'),
      ]),
    ];
    this.el.replaceChildren(...sections.filter((x): x is HTMLElement => x !== null));
  }

  private itemCard(item: ShopItem, onBuy: () => void): HTMLElement {
    const run = this.run;
    let icon: HTMLCanvasElement;
    let title: string;
    let desc: string;
    let tag = '';
    let tagClass = '';
    let badge: HTMLElement | null = null;
    let kindBadge: HTMLElement | null = null;
    if (item.kind === 'omen') {
      const def = omenDef(item.omenId);
      icon = canvasImg(omenSigil(item.omenId, 72, dpr()), 72);
      const info = named('omen', item.omenId, def.vars?.(def.initialData?.() ?? {}) ?? {});
      title = info.name;
      desc = info.desc;
      tag = t(`rarity.${def.rarity}`);
      tagClass = `r${def.rarity}`;
      // Значок «+ / ×» у названия; словами — в описании, второй строкой не повторяем
      kindBadge = omenBadge(def.kind);
    } else if (item.kind === 'chart') {
      icon = canvasImg(chartIcon(item.combo, 72, dpr()), 72);
      const level = run.comboLevels[item.combo];
      const def = COMBOS[item.combo];
      title = t('shop.chartName', { combo: t(`combo.${item.combo}`) });
      desc = t('shop.chartDesc', { combo: t(`combo.${item.combo}`), from: level, to: level + 1, light: def.levelLight, mult: def.levelMult });
      tag = t(`comboDesc.${item.combo}`);
    } else if (item.kind === 'pack') {
      icon = canvasImg(packIcon(item.pack, 72, dpr()), 72);
      const info = named('pack', item.pack);
      title = info.name;
      desc = info.desc;
    } else {
      icon = canvasImg(ritualIcon(item.ritualId, 72, dpr()), 72);
      const info = named('ritual', item.ritualId);
      title = info.name;
      desc = info.desc;
      // Глиф: короткая анимация в справочнике и правило «один глиф на карту»
      if (item.ritualId.startsWith('glyph-')) {
        const glyph = item.ritualId.slice('glyph-'.length);
        badge = h('button.link-btn', { type: 'button', onclick: () => showHelp({ focus: `glyph-${glyph}` }) }, t('shop.glyphHow'));
      }
    }
    const affordable = run.gold >= item.price;
    const full = (item.kind === 'omen' || (item.kind === 'pack' && item.pack === 'omen')) && run.omens.length >= omenSlots(run);
    const card = h(`div.shop-item${item.sold ? '.sold' : ''}`, null, [
      h('div.shop-icon', null, icon),
      h('div.shop-info', null, [
        h('div.shop-name', null, kindBadge ? [kindBadge, ' ', title] : title),
        tag ? h(`div.shop-tag.${tagClass || 'plain'}`, null, tag) : null,
        h('div.shop-desc', null, rich(desc)),
        badge,
      ]),
      item.sold
        ? h('div.sold-label', null, t('shop.sold'))
        : button(withCoin(String(item.price)), onBuy, {
            // Цена — второстепенная кнопка: главная на экране одна, «Следующая ночь»
            variant: 'secondary',
            className: 'price',
            disabled: !affordable || full,
            title: full ? t('shop.slotsFull') : !affordable ? t('shop.noGold') : '',
            ariaLabel: t('shop.buyLabel', { name: title, n: item.price }),
          }),
    ]);
    return card;
  }

  private buyItem(item: ShopItem, slot: number): void {
    if (item.kind !== 'ritual') {
      this.act((r) => buyItem(r, slot), 'coin', () => this.trackBuy(item));
      return;
    }
    this.pickTargets(item.ritualId, (ids) => this.withRitualResult(item.ritualId, () => this.act((r) => buyItem(r, slot, ids), 'coin', () => this.trackBuy(item))));
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
            now.glyph && now.glyph !== old.glyph ? h('span.ritual-note', null, `${t(`glyph.${now.glyph}`)}: ${dict().glyphDesc[now.glyph]}`) : null,
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

  /** Колода: постоянная услуга «Убрать карту» — раз за визит, чтобы колоду можно было чистить. */
  private deckPart(): HTMLElement {
    const run = this.run;
    const price = banishServicePrice(run);
    const used = !!run.shop?.banishUsed;
    return h('div.inventory-part', null, [
      sectionHead(t('shop.deckTitle', { n: run.deck.length }), t('shop.viewDeck'), () => showDeck(run)),
      h('div.deck-service', null, [
        button(used ? t('shop.banishUsed') : withCoin(t('shop.banish', { n: price ?? '—' })), () => {
          this.pickTargets('banish', (ids) => this.withRitualResult('banish', () => this.act((r) => banishCard(r, ids[0]!), 'coin', () => track('shop_banish', { ante: run.ante }))), undefined, 1);
        }, { variant: 'secondary', className: 'small', disabled: price === null || run.gold < price }),
        h('p.hint', null, used ? t('shop.banishUsedHint') : price === null ? t('shop.banishMin') : t('shop.banishHint')),
      ]),
    ]);
  }

  /** Выбор карт колоды для ритуала. `maxOverride` — для услуг с другим лимитом. */
  private pickTargets(ritualId: string, onApply: (ids: number[]) => void, onCancel?: () => void, maxOverride?: number): void {
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
    const info = named('ritual', ritualId);
    const m = modal(
      [
        h('p.modal-text', null, info.desc),
        h('p.hint', null, max === 1 ? t('shop.pickTarget') : t('shop.pickTargets', { min: def.minTargets, max })),
        ritualId.startsWith('glyph-') ? h('p.hint.order-warn', null, t('shop.glyphReplace')) : null,
        grid,
        h('div.row.between', null, [button(t('shop.cancel'), () => m.close(), { variant: 'secondary' }), confirmBtn]),
      ],
      { title: info.name, className: 'wide', onClose: () => !applied && onCancel?.() },
    );
  }

  /** Открытый пакет: три варианта, взять один или пропустить. */
  private showPack(): void {
    const open = this.run.shop?.openPack;
    if (!open) return;
    this.app.svc.audio.ignite(1);
    let handle: ModalHandle | null = null;
    const options = open.options.map((id, i) => {
      let icon: HTMLCanvasElement;
      let info: { name: string; desc: string };
      let tag: HTMLElement | null = null;
      if (open.pack === 'omen') {
        icon = canvasImg(omenSigil(id, 64, dpr()), 64);
        info = named('omen', id);
        const rarity = omenDef(id).rarity;
        tag = h(`div.shop-tag.r${rarity}`, null, t(`rarity.${rarity}`));
      } else if (open.pack === 'chart') {
        icon = canvasImg(chartIcon(id as ComboId, 64, dpr()), 64);
        const level = this.run.comboLevels[id as ComboId];
        const def = COMBOS[id as ComboId];
        info = {
          name: t(`combo.${id}`),
          desc: t('shop.chartDesc', { combo: t(`combo.${id}`), from: level, to: level + 1, light: def.levelLight, mult: def.levelMult }),
        };
      } else {
        icon = canvasImg(ritualIcon(id, 64, dpr()), 64);
        info = named('ritual', id);
      }
      const full = open.pack === 'omen' && this.run.omens.length >= omenSlots(this.run);
      return h('div.shop-item.pack-option', { style: { animationDelay: `${i * 0.08}s` } }, [
        h('div.shop-icon', null, icon),
        h('div.shop-info', null, [h('div.shop-name', null, info.name), tag, h('div.shop-desc', null, rich(info.desc))]),
        button(t('shop.take'), () => this.takeFromPack(i, id, handle!), { disabled: full, title: full ? t('shop.slotsFull') : '' }),
      ]);
    });
    handle = modal(
      [
        h('div.shop-row', null, options),
        h('div.row.end', null, button(t('shop.skip'), () => {
          handle?.close();
          this.act((r) => skipPack(r), 'click');
        }, { variant: 'ghost' })),
      ],
      { title: t('shop.packTitle'), dismissable: false, className: 'pack-modal' },
    );
  }

  private takeFromPack(index: number, id: string, handle: ModalHandle): void {
    const open = this.run.shop?.openPack;
    if (!open) return;
    if (open.pack === 'ritual') {
      handle.close();
      this.pickTargets(
        id,
        (ids) => {
          this.withRitualResult(id, () => this.act((r) => choosePack(r, index, ids), 'coin', () => track('pack_choose', { pack: open.pack, id })));
          if (this.run.shop?.openPack) this.showPack();
        },
        () => this.showPack(),
      );
      return;
    }
    handle.close();
    this.act((r) => choosePack(r, index), 'coin', () => track('pack_choose', { pack: open.pack, id }));
  }
}
