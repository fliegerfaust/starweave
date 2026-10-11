import { chartIcon, omenSigil, ritualIcon } from '@/art/sigil';
import { COMBOS } from '@/core/content/combos';
import { omenDef } from '@/core/content/omens';
import { ritualDef } from '@/core/content/rituals';
import { buyItem, buyOmen, moveOmen, omenSlots, reroll, sellOmen, sellPrice } from '@/core/shop';
import type { Card, RunState, ShopItem } from '@/core/types';
import type { App, Screen } from '@/game/app';
import { named, t } from '@/i18n';
import { canvasImg, dpr, h } from '../dom';
import { omenTooltip } from '../hud';
import { coach } from '../tutorial';
import { attachTooltip, button, modal } from '../widgets';
import { deckGrid, showDeck } from './common';

/** Обсерватория: витрина Знамений и предметов, свои Знамения, переброс. */
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
    coach(this.app, 'shop');
  }

  unmount(): void {
    this.el.remove();
  }

  private act(fn: (run: RunState) => void, sound: 'coin' | 'click' = 'coin'): void {
    if (this.app.shopAction(fn)) {
      if (sound === 'coin') this.app.svc.audio.coin();
      this.render();
    }
  }

  private render(): void {
    const run = this.run;
    const shop = run.shop!;
    const slots = omenSlots(run);

    const omenCards = h('div.shop-row', null, shop.omens.map((item, i) => this.itemCard(item, () => this.act((r) => buyOmen(r, i)))));
    const itemCards = h('div.shop-row', null, shop.items.map((item, i) => this.itemCard(item, () => this.buyItem(item, i))));

    const owned = h('div.owned-omens');
    run.omens.forEach((o, i) => {
      const chip = h('div.owned-omen', null, [
        h('div.omen-slot', null, canvasImg(omenSigil(o.id, 44, dpr()), 44)),
        h('div.owned-actions', null, [
          i > 0 ? h('button.mini', { type: 'button', onclick: () => this.act((r) => moveOmen(r, i, i - 1), 'click') }, '◀') : null,
          h('button.mini.sell', { type: 'button', onclick: () => this.act((r) => sellOmen(r, o.uid)) }, `${t('shop.sell', { n: sellPrice(o.id) })}`),
          i < run.omens.length - 1 ? h('button.mini', { type: 'button', onclick: () => this.act((r) => moveOmen(r, i, i + 1), 'click') }, '▶') : null,
        ]),
      ]);
      attachTooltip(chip.querySelector('.omen-slot') as HTMLElement, () => omenTooltip(o));
      owned.append(chip);
    });
    for (let i = run.omens.length; i < slots; i++) owned.append(h('div.owned-omen', null, h('div.omen-slot.empty')));

    this.el.replaceChildren(
      h('div.shop-top', null, [h('h1.shop-title', null, t('shop.title')), h('div.gold-pill', null, String(run.gold))]),
      h('section.shop-section', null, [h('h2', null, t('shop.omens')), omenCards]),
      h('section.shop-section', null, [h('h2', null, t('shop.items')), itemCards]),
      h('section.shop-section', null, [
        h('h2', null, `${t('shop.yourOmens')} · ${run.omens.length}/${slots}`),
        owned,
        run.omens.length > 1 ? h('p.hint', null, t('shop.dragHint')) : null,
      ]),
      h('div.shop-actions', null, [
        button(t('shop.reroll', { n: shop.rerollCost }), () => this.act((r) => reroll(r), 'click'), { variant: 'secondary', disabled: run.gold < shop.rerollCost }),
        button(t('shop.yourDeck', { n: run.deck.length }), () => showDeck(run), { variant: 'secondary' }),
        button(t('shop.next'), () => this.app.leaveShop(), { className: 'grow' }),
      ]),
    );
  }

  private itemCard(item: ShopItem, onBuy: () => void): HTMLElement {
    const run = this.run;
    let icon: HTMLCanvasElement;
    let title: string;
    let desc: string;
    let tag = '';
    let tagClass = '';
    if (item.kind === 'omen') {
      const def = omenDef(item.omenId);
      icon = canvasImg(omenSigil(item.omenId, 72, dpr()), 72);
      const info = named('omen', item.omenId, def.vars?.(def.initialData?.() ?? {}) ?? {});
      title = info.name;
      desc = info.desc;
      tag = t(`rarity.${def.rarity}`);
      tagClass = `r${def.rarity}`;
    } else if (item.kind === 'chart') {
      icon = canvasImg(chartIcon(item.combo, 72, dpr()), 72);
      const level = run.comboLevels[item.combo];
      const def = COMBOS[item.combo];
      title = t('shop.chartName', { combo: t(`combo.${item.combo}`) });
      desc = t('shop.chartDesc', { combo: t(`combo.${item.combo}`), from: level, to: level + 1, light: def.levelLight, mult: def.levelMult });
      tag = t(`comboDesc.${item.combo}`);
    } else {
      icon = canvasImg(ritualIcon(item.ritualId, 72, dpr()), 72);
      const info = named('ritual', item.ritualId);
      title = info.name;
      desc = info.desc;
    }
    const affordable = run.gold >= item.price;
    const full = item.kind === 'omen' && run.omens.length >= omenSlots(run);
    const card = h(`div.shop-item${item.sold ? '.sold' : ''}`, null, [
      h('div.shop-icon', null, icon),
      h('div.shop-info', null, [
        h('div.shop-name', null, title),
        tag ? h(`div.shop-tag.${tagClass || 'plain'}`, null, tag) : null,
        h('div.shop-desc', null, desc),
      ]),
      item.sold
        ? h('div.sold-label', null, t('shop.sold'))
        : button(String(item.price), onBuy, {
            variant: 'primary',
            className: 'price',
            disabled: !affordable || full,
            title: full ? t('shop.slotsFull') : !affordable ? t('shop.noGold') : '',
          }),
    ]);
    return card;
  }

  private buyItem(item: ShopItem, slot: number): void {
    if (item.kind !== 'ritual') {
      this.act((r) => buyItem(r, slot));
      return;
    }
    const def = ritualDef(item.ritualId);
    const selected = new Set<number>();
    const confirmBtn = button(t('shop.apply'), () => {
      m.close();
      this.act((r) => buyItem(r, slot, [...selected]));
    }, { disabled: true });
    const update = () => {
      confirmBtn.disabled = selected.size < def.minTargets || selected.size > def.maxTargets;
    };
    const onToggle = (c: Card) => {
      if (selected.has(c.id)) selected.delete(c.id);
      else {
        if (selected.size >= def.maxTargets) {
          if (def.maxTargets === 1) {
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
    const info = named('ritual', item.ritualId);
    const m = modal(
      [
        h('p.modal-text', null, info.desc),
        h('p.hint', null, def.maxTargets === 1 ? t('shop.pickTarget') : t('shop.pickTargets', { min: def.minTargets, max: def.maxTargets })),
        grid,
        h('div.row.between', null, [button(t('shop.cancel'), () => m.close(), { variant: 'secondary' }), confirmBtn]),
      ],
      { title: info.name, className: 'wide' },
    );
  }
}
