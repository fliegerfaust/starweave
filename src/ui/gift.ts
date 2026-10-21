import type { Choice } from '@/core/choices';
import { GIFT_SKIP_GOLD } from '@/core/content/balance';
import type { GiftOffer } from '@/core/gift';
import type { Card, RunState } from '@/core/types';
import type { App } from '@/game/app';
import { t } from '@/i18n';
import { bonusLine } from './bonus';
import { h } from './dom';
import { icon } from './icons';
import { sceneRibbon, sceneWindow } from './scene-window';
import { cardThumb } from './screens/common';
import { button, withCoin, type ModalHandle } from './widgets';

/** Ширина карты в веере: крупно, чтобы рассмотреть; на невысоком экране CSS уменьшает веер. */
const FAN_CARD = 96;

/** Что игрок видит у варианта дара: карта, имя, правило, у Возвышения — «было». */
interface GiftView {
  card: Card;
  name: string;
  rule: string;
  from?: Card;
}

/** Карта колоды для Возвышения; если её уже нет — дар показывать нечем. */
function giftView(run: RunState, offer: GiftOffer): GiftView | null {
  if (offer.k === 'ascend') {
    const from = run.deck.find((c) => c.id === offer.cardId);
    if (!from) return null;
    const to = { ...from, rank: from.rank + 1 };
    return { card: to, from, name: t('gift.ascend'), rule: t('gift.ascendRule', { from: from.rank, to: to.rank, suit: t(`suitPl.${from.suit}`) }) };
  }
  const card = { ...offer.card, id: -1 } as Card;
  const base = `${card.rank} ${t(`suitPl.${card.suit}`)}`;
  if (card.body) return { card, name: t(`body.${card.body}`), rule: t(`bodyDesc.${card.body}`) };
  if (card.glyph) return { card, name: t('gift.glyphCard', { card: base, glyph: t(`glyphWith.${card.glyph}`) }), rule: t(`glyphDesc.${card.glyph}`) };
  return { card, name: base, rule: '' };
}

export interface GiftHandlers {
  take(index: number): void;
  skip(): void;
  /** Лист колоды: кнопка «Колода · N» под выбором. */
  deck(): void;
}

/**
 * «Дар ночи» (GF.2, вариант A витрины d8-gift-ui): после победной ночи по небу — лента,
 * три карты веером, средняя уже поднята и описана, касание меняет выбор. Главная —
 * «Взять в колоду», вторая — честное «Чистое небо +2». Взятая карта улетает в «Колоду».
 */
export function showGift(app: App, run: RunState, choice: Extract<Choice, { kind: 'gift' }>, handlers: GiftHandlers): ModalHandle | null {
  const views = choice.options.map((o) => giftView(run, o));
  if (views.some((v) => !v)) return null;
  app.svc.audio.ignite(1);
  const items = views as GiftView[];
  const first = !app.profile.tutorial.includes('giftSeen');
  let sel = Math.min(1, items.length - 1);
  let busy = false;

  const fan = h('div.gift-fan');
  const detail = h('div.gift-detail', { attrs: { 'aria-live': 'polite' } });
  const opts = items.map((v, i) => {
    const btn = h('button.gift-opt', { type: 'button', ariaLabel: v.name, onclick: () => pick(i) }, cardThumb(v.card, FAN_CARD));
    if (v.from) btn.append(h('span.gift-up', null, `${v.from.rank} → ${v.card.rank}`));
    btn.style.setProperty('--i', String(i - (items.length - 1) / 2));
    fan.append(btn);
    return btn;
  });

  function pick(i: number): void {
    sel = i;
    opts.forEach((o, j) => {
      o.classList.toggle('sel', i === j);
      o.setAttribute('aria-pressed', String(i === j));
    });
    const v = items[i]!;
    detail.replaceChildren(h('b', null, v.name), h('span', null, bonusLine(v.rule)));
    if (v.from) detail.append(h('div.gift-asc', null, [cardThumb(v.from, 34), icon('chevron'), cardThumb(v.card, 34)]));
  }
  pick(sel);

  const deckCount = h('span', null, t('gift.deck', { n: run.deck.length }));
  const deckBtn = h('button.scene-light.quiet.gift-deck', { type: 'button', onclick: () => handlers.deck() }, [icon('deck'), deckCount]);

  const close = (): void => {
    if (first) {
      app.profile.tutorial.push('giftSeen');
      app.runs.persistProfile();
    }
    scene.close();
  };

  /** Взятая карта летит в «Колоду», число подпрыгивает — потом сцена закрывается. */
  const take = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    const from = opts[sel]!.querySelector('canvas');
    const to = deckBtn.querySelector('svg');
    if (from && to && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const ghost = from.cloneNode(true) as HTMLCanvasElement;
      ghost.getContext('2d')?.drawImage(from, 0, 0);
      ghost.className = 'gift-flyer';
      Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`, margin: '0' });
      document.body.append(ghost);
      opts[sel]!.style.visibility = 'hidden';
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height / 2 - (a.top + a.height / 2);
      app.svc.audio.coin();
      await ghost
        .animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(${18 / a.width}) rotate(-12deg)`, opacity: 0.2 }], { duration: 650, easing: 'cubic-bezier(.5,0,.2,1)' })
        .finished.catch(() => undefined);
      ghost.remove();
      if (!items[sel]!.from) deckCount.textContent = t('gift.deck', { n: run.deck.length + 1 });
      deckBtn.classList.add('bump');
      await new Promise((r) => window.setTimeout(r, 280));
    }
    close();
    handlers.take(sel);
  };

  const scene = sceneWindow({
    className: 'gift-scene',
    label: t('gift.title'),
    mid: [
      sceneRibbon(t('gift.title'), t('gift.sub')),
      first ? h('p.gift-first', null, t('gift.first')) : null,
      fan,
      detail,
    ],
    acts: [
      button(t('gift.take'), () => void take()),
      button(withCoin(t('gift.skip', { n: GIFT_SKIP_GOLD })), () => {
        if (busy) return;
        close();
        handlers.skip();
      }, { variant: 'secondary' }),
      h('div.scene-lights', null, deckBtn),
    ],
  });
  return scene;
}
