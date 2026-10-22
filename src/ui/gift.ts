import { cardBack } from '@/art/card';
import type { Choice } from '@/core/choices';
import { GIFT_SKIP_GOLD } from '@/core/content/balance';
import type { GiftOffer } from '@/core/gift';
import type { Card, RunState } from '@/core/types';
import type { App } from '@/game/app';
import { t } from '@/i18n';
import { bonusLine } from './bonus';
import { canvasImg, dpr, h } from './dom';
import { icon } from './icons';
import { sceneRibbon, sceneWindow } from './scene-window';
import { cardThumb } from './screens/common';
import { button, withCoin, type ModalHandle } from './widgets';

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

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('calm');
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/**
 * Ширина карты веера. Карта рисуется ровно в этом размере и никогда не масштабируется вверх —
 * растр не мылится; на узком и невысоком экране берём карту меньше, а не сжимаем веер.
 */
function fanWidth(): number {
  const w = window.innerWidth;
  const hgt = window.innerHeight;
  if (hgt < 460) return 64;
  if (hgt < 640 || w < 350) return 80;
  return 96;
}

/** Место карты в веере: наклон у каждой свой и не меняется никогда — выбор её только приподнимает. */
const fanRest = (i: number, w: number) => `translate(${(i - 1) * w * 0.78}px, ${Math.abs(i - 1) * w * 0.12 - w * 0.08}px) rotate(${(i - 1) * 9}deg)`;

/**
 * «Дар ночи» (GF.2, вариант C «Спокойный веер» витрины d8-gift-scene, выбор Дениса 22.10.2026).
 * Авторский момент — раскрытие: три карты рубашкой вверх вылетают из «Колоды» и по очереди
 * переворачиваются. Дальше движения тихие: выбор только приподнимает карту и проявляет свет
 * и латунную кромку, остальные тускнеют. Ничего не выбрано заранее; коробка описания держит
 * высоту самого большого варианта — сцена не прыгает. Движутся только transform и opacity.
 */
export function showGift(app: App, run: RunState, choice: Extract<Choice, { kind: 'gift' }>, handlers: GiftHandlers): ModalHandle | null {
  const views = choice.options.map((o) => giftView(run, o));
  if (views.some((v) => !v)) return null;
  const items = views as GiftView[];
  app.svc.audio.ignite(1);
  const first = !app.profile.tutorial.includes('giftSeen');
  const calm = reduced();
  const w = fanWidth();
  let sel = -1;
  let busy = true;
  let glintTimer = 0;

  const fan = h('div.gift-fan');
  fan.style.setProperty('--w', `${w}px`);
  const slots = items.map((v, i) => {
    const pad = Math.ceil(w * 0.12);
    const back = canvasImg(cardBack(w, dpr()), w + pad * 2, w / 0.7 + pad * 2);
    back.style.margin = `${-pad}px`;
    const flip = h('div.gift-flip', null, [
      h('div.gift-face', null, [cardThumb(v.card, w), h('div.gift-glint'), h('div.gift-shade')]),
      h('div.gift-back', null, back),
    ]);
    const gc = h('button.gift-card', { type: 'button', ariaLabel: v.name, attrs: { 'aria-pressed': 'false' }, onclick: () => pick(i) }, [h('div.gift-halo'), h('div.gift-ring'), flip]);
    if (v.from) gc.append(h('span.gift-up', null, `${v.from.rank} → ${v.card.rank}`));
    const slot = h('div.gift-slot', { style: { transform: fanRest(i, w), zIndex: i === 1 ? '2' : '1' } }, gc);
    fan.append(slot);
    return { slot, gc, flip, face: flip.firstElementChild as HTMLElement, back: flip.lastElementChild as HTMLElement };
  });

  /**
   * Переворот до ребра и обратно: на ребре лицо меняется на рубашку. Без backface-visibility —
   * Safari не прячет обратную сторону, если на ней canvas.
   */
  const flipTo = async (s: (typeof slots)[number], face: boolean, duration: number, delay: number): Promise<void> => {
    const half = { duration: duration / 2, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'forwards' as const };
    await s.flip.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(90deg)' }], { ...half, delay }).finished.catch(() => undefined);
    s.face.style.visibility = face ? '' : 'hidden';
    s.back.style.visibility = face ? 'hidden' : '';
    await s.flip.animate([{ transform: 'rotateY(-90deg)' }, { transform: 'rotateY(0deg)' }], { ...half, easing: EASE }).finished.catch(() => undefined);
  };
  const showSide = (s: (typeof slots)[number], face: boolean): void => {
    s.face.style.visibility = face ? '' : 'hidden';
    s.back.style.visibility = face ? 'hidden' : '';
  };
  slots.forEach((s) => showSide(s, true));

  const prompt = h('p.gift-prompt', null, t('gift.prompt'));
  const detail = h('div.gift-detail', { attrs: { 'aria-live': 'polite' } });
  const detailNodes = (v: GiftView): HTMLElement[] => {
    const nodes = [h('b', null, v.name), h('span', null, bonusLine(v.rule))];
    if (v.from) nodes.push(h('div.gift-asc', null, [cardThumb(v.from, 30), icon('chevron'), cardThumb(v.card, 30)]));
    return nodes;
  };

  const takeLabel = h('span.gift-take-label', null, t('gift.choose'));
  const takeBtn = button(takeLabel, () => void take(), { disabled: true, className: 'gift-take' });
  const deckCount = h('span', null, t('gift.deck', { n: run.deck.length }));
  const deckBtn = h('button.scene-light.quiet.gift-deck', { type: 'button', onclick: () => handlers.deck() }, [icon('deck'), deckCount]);

  function pick(i: number): void {
    if (busy || i === sel) return;
    const was = sel;
    sel = i;
    window.clearInterval(glintTimer);
    fan.classList.add('has-sel');
    slots.forEach((s, j) => {
      s.gc.classList.toggle('sel', j === i);
      s.gc.setAttribute('aria-pressed', String(j === i));
      // Выбранная — поверх соседей; слой меняется мгновенно, без движения
      s.slot.style.zIndex = j === i ? '3' : j === 1 ? '2' : '1';
    });
    if (was < 0) {
      takeBtn.disabled = false;
      takeLabel.textContent = t('gift.take');
    }
    // Описание меняется растворением в коробке постоянной высоты
    detail.classList.add('swap');
    window.setTimeout(() => {
      detail.replaceChildren(...detailNodes(items[i]!));
      detail.classList.remove('swap');
    }, calm ? 0 : 170);
  }

  const close = (): void => {
    window.clearInterval(glintTimer);
    if (first) {
      app.profile.tutorial.push('giftSeen');
      app.runs.persistProfile();
    }
    scene.close();
  };

  const deckPoint = (): { x: number; y: number } => {
    const r = (deckBtn.querySelector('svg') ?? deckBtn).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  /** Раскрытие: рубашкой вверх из «Колоды» на места веера, затем переворот по очереди. */
  async function deal(): Promise<void> {
    if (calm) {
      busy = false;
      return;
    }
    const deck = deckPoint();
    slots.forEach((s) => showSide(s, false));
    await Promise.all(slots.map((s, i) => {
      const r = s.slot.getBoundingClientRect();
      const dx = deck.x - (r.left + r.width / 2);
      const dy = deck.y - (r.top + r.height / 2);
      const rest = fanRest(i, w);
      return s.slot.animate([{ transform: `translate(${dx}px, ${dy}px) ${rest} scale(0.3)`, opacity: 0 }, { opacity: 1, offset: 0.25 }, { transform: rest, opacity: 1 }], { duration: 560, delay: 180 + i * 90, easing: EASE, fill: 'backwards' }).finished.catch(() => undefined);
    }));
    await Promise.all(slots.map((s, i) => flipTo(s, true, 440, i * 130).then(() => app.svc.audio.tick())));
    busy = false;
    glints();
  }

  /** Пока ничего не выбрано — блик проходит по картам по очереди: «коснись меня». */
  function glints(): void {
    const sweep = async () => {
      for (const s of slots) {
        if (sel >= 0 || !scene.el.isConnected) return;
        const g = s.gc.querySelector<HTMLElement>('.gift-glint')!;
        g.classList.remove('run');
        void g.offsetWidth;
        g.classList.add('run');
        await wait(160);
      }
    };
    void sweep();
    glintTimer = window.setInterval(() => void sweep(), 3600);
  }

  /** Взять: копия карты по дуге уходит в «Колоду», соседи гаснут, число колоды подпрыгивает. */
  async function take(): Promise<void> {
    if (busy || sel < 0) return;
    busy = true;
    window.clearInterval(glintTimer);
    if (!calm) {
      const s = slots[sel]!;
      const a = s.gc.querySelector('.gift-face')!.getBoundingClientRect();
      const deck = deckPoint();
      const ghost = cardThumb(items[sel]!.card, w);
      ghost.classList.add('gift-flyer');
      // Без наклона слота: копия стоит ровно там, где была карта
      const pad = Math.ceil(w * 0.12);
      Object.assign(ghost.style, { left: `${a.left + a.width / 2 - w / 2 - pad}px`, top: `${a.top + a.height / 2 - w / 0.7 / 2 - pad}px`, margin: '0' });
      document.body.append(ghost);
      s.slot.style.visibility = 'hidden';
      const dx = deck.x - (a.left + a.width / 2);
      const dy = deck.y - (a.top + a.height / 2);
      slots.forEach((o, j) => j !== sel && o.slot.animate([{ opacity: 1 }, { opacity: 0, transform: `${fanRest(j, w)} translateY(16px)` }], { duration: 320, easing: 'ease-in', fill: 'forwards' }));
      app.svc.audio.coin();
      await ghost.animate([
        { transform: 'none' },
        { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 70}px) rotate(-6deg)`, offset: 0.4 },
        { transform: `translate(${dx}px, ${dy}px) rotate(-14deg) scale(0.2)`, opacity: 0.35 },
      ], { duration: 720, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards' }).finished.catch(() => undefined);
      ghost.remove();
      if (!items[sel]!.from) deckCount.textContent = t('gift.deck', { n: run.deck.length + 1 });
      deckBtn.classList.add('bump');
      await wait(380);
    }
    const index = sel;
    close();
    handlers.take(index);
  }

  /** Чистое небо: звёзды переворачиваются рубашкой и уходят обратно в «Колоду». */
  async function skip(): Promise<void> {
    if (busy) return;
    busy = true;
    window.clearInterval(glintTimer);
    if (!calm) {
      await Promise.all(slots.map((s, i) => flipTo(s, false, 380, i * 70)));
      const deck = deckPoint();
      app.svc.audio.coin();
      await Promise.all(slots.map((s, i) => {
        const r = s.slot.getBoundingClientRect();
        return s.slot.animate([{ transform: fanRest(i, w), opacity: 1 }, { transform: `translate(${deck.x - (r.left + r.width / 2)}px, ${deck.y - (r.top + r.height / 2)}px) scale(0.3)`, opacity: 0 }], { duration: 480, delay: i * 60, easing: 'cubic-bezier(0.55, 0, 0.75, 0.2)', fill: 'forwards' }).finished.catch(() => undefined);
      }));
    }
    close();
    handlers.skip();
  }

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
      takeBtn,
      button(withCoin(t('gift.skip', { n: GIFT_SKIP_GOLD })), () => void skip(), { variant: 'secondary' }),
      h('div.scene-lights', null, deckBtn),
    ],
  });

  /**
   * Коробка описания не меняет высоту при смене карты (правило Дениса): примеряем подсказку и
   * все варианты и держим высоту самого большого — веер и кнопки не сдвигаются ни на пиксель.
   */
  const steady = (): void => {
    const keep = [...detail.childNodes];
    detail.style.height = 'auto';
    let max = 0;
    for (const nodes of [[prompt], ...items.map(detailNodes)]) {
      detail.replaceChildren(...nodes);
      max = Math.max(max, detail.scrollHeight);
    }
    detail.replaceChildren(...(keep.length ? keep : [prompt]));
    detail.style.height = `${max}px`;
  };
  steady();
  void document.fonts?.ready.then(() => scene.el.isConnected && steady());
  void deal();
  return scene;
}
