import { chartIcon, omenSigil, packIcon, ritualIcon } from '@/art/sigil';
import { COMBOS } from '@/core/content/combos';
import { omenDef } from '@/core/content/omens';
import { ritualDef } from '@/core/content/rituals';
import { buyItem, buyOmen, buyPack, choosePack, moveOmen, omenSlots, reroll, ritualMaxTargets, sellOmen, sellPrice, skipPack } from '@/core/shop';
import type { Card, ComboId, RunState, ShopItem } from '@/core/types';
import type { App, Screen } from '@/game/app';
import { markOmensSeen, saveProfile } from '@/meta/profile';
import { dict, named, t } from '@/i18n';
import { canvasImg, dpr, h } from '../dom';
import { omenBadge, omenMedal, omenTooltip } from '../hud';
import { showScoringHelp } from './scoring-help';
import { coach } from '../tutorial';
import { attachTooltip, button, modal, type ModalHandle } from '../widgets';
import { cardThumb, deckGrid, menuButton, showDeck, showRunMenu } from './common';

/** Помечает элемент для обучения. */
function tag<T extends HTMLElement>(el: T, name: string): T {
  el.dataset.shop = name;
  return el;
}

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
    this.app.tutorial?.emit({ type: 'shop', root: this.el });
    coach(this.app, 'shop');
    if (this.run.shop?.openPack) this.showPack();
  }

  unmount(): void {
    this.el.remove();
  }

  private act(fn: (run: RunState) => void, sound: 'coin' | 'click' = 'coin'): false {
    if (this.app.shopAction(fn)) {
      if (sound === 'coin') this.app.svc.audio.coin();
      this.render();
      this.app.tutorial?.emit({ type: 'shopChanged' });
    }
    return false;
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

    const omenCards = h('div.shop-row', null, shop.omens.map((item, i) => tag(this.itemCard(item, () => this.act((r) => buyOmen(r, i))), `omen-${i}`)));
    const itemCards = h('div.shop-row', null, shop.items.map((item, i) => this.itemCard(item, () => this.buyItem(item, i))));
    const packCards = h('div.shop-row', null, shop.packs.map((item, i) => this.itemCard(item, () => this.act((r) => buyPack(r, i)) || this.afterPackBuy())));

    const owned = h('div.owned-omens', { dataset: { shop: 'owned' } });
    run.omens.forEach((o, i) => {
      if (i > 0) owned.append(h('div.order-arrow', null, '→'));
      const chip = h('div.owned-omen', null, [
        h('div.omen-slot', null, omenMedal(o.id, 44)),
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

    const sections: (HTMLElement | null)[] = [
      h('div.shop-top', null, [
        h('h1.shop-title', null, t('shop.title')),
        h('div.row.gap', null, [
          h('div.gold-pill', null, String(run.gold)),
          menuButton(() => showRunMenu(this.app, [button(t('pause.viewMap'), () => this.app.peekMap(), { variant: 'secondary' })])),
        ]),
      ]),
      h('button.map-peek', { type: 'button', onclick: () => this.app.peekMap() }, `☾ ${t('pause.viewMap')} →`),
      h('section.shop-section', { dataset: { shop: 'omens' } }, [h('h2', null, t('shop.omens')), omenCards]),
      h('section.shop-section', { dataset: { shop: 'items' } }, [h('h2', null, t('shop.items')), itemCards]),
      shop.packs.length ? h('section.shop-section', null, [h('h2', null, t('shop.packs')), packCards]) : null,
      h('section.shop-section', null, [
        h('h2', null, `${t('shop.yourOmens')} · ${run.omens.length}/${slots}`),
        owned,
        run.omens.length > 1 ? h('p.hint', null, t('shop.dragHint')) : null,
        button(t('scoring.button'), () => showScoringHelp(), { variant: 'ghost', className: 'small' }),
      ]),
      h('div.shop-actions', null, [
        button(t('shop.reroll', { n: shop.rerollCost }), () => this.act((r) => reroll(r), 'click'), { variant: 'secondary', disabled: run.gold < shop.rerollCost }),
        button(t('shop.yourDeck', { n: run.deck.length }), () => showDeck(run), { variant: 'secondary' }),
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
    if (item.kind === 'omen') {
      const def = omenDef(item.omenId);
      icon = canvasImg(omenSigil(item.omenId, 72, dpr()), 72);
      const info = named('omen', item.omenId, def.vars?.(def.initialData?.() ?? {}) ?? {});
      title = info.name;
      desc = info.desc;
      tag = `${t(`rarity.${def.rarity}`)} · ${dict().omenKind[def.kind][0]}`;
      tagClass = `r${def.rarity}`;
      badge = omenBadge(def.kind);
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
    }
    const affordable = run.gold >= item.price;
    const full = (item.kind === 'omen' || (item.kind === 'pack' && item.pack === 'omen')) && run.omens.length >= omenSlots(run);
    const card = h(`div.shop-item${item.sold ? '.sold' : ''}`, null, [
      h('div.shop-icon', null, icon),
      h('div.shop-info', null, [
        h('div.shop-name', null, title),
        tag ? h(`div.shop-tag.${tagClass || 'plain'}`, null, [badge, tag]) : null,
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
    this.pickTargets(item.ritualId, (ids) => this.withRitualResult(item.ritualId, () => this.act((r) => buyItem(r, slot, ids))));
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

  /** Выбор карт колоды для ритуала. */
  private pickTargets(ritualId: string, onApply: (ids: number[]) => void, onCancel?: () => void): void {
    const def = ritualDef(ritualId);
    const max = ritualMaxTargets(this.run, ritualId);
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
        h('div.shop-info', null, [h('div.shop-name', null, info.name), tag, h('div.shop-desc', null, info.desc)]),
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
          this.withRitualResult(id, () => this.act((r) => choosePack(r, index, ids)));
          if (this.run.shop?.openPack) this.showPack();
        },
        () => this.showPack(),
      );
      return;
    }
    handle.close();
    this.act((r) => choosePack(r, index));
  }
}
