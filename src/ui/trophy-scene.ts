import { bossSigil, omenSigil } from '@/art/sigil';
import type { Choice } from '@/core/choices';
import { omenDef } from '@/core/content/omens';
import { omenSlots } from '@/core/shop';
import { canTakeTrophy, trophiesOf, type TrophyOffer } from '@/core/trophy';
import type { RunState } from '@/core/types';
import { named, t } from '@/i18n';
import { bonusLine } from './bonus';
import { canvasImg, dpr, h } from './dom';
import { sceneRibbon } from './scene-window';
import { button } from './widgets';

type TrophyChoice = Extract<Choice, { kind: 'trophy' }>;

/** Где сцена встаёт на экране и куда улетает выбранный знак. */
export interface TrophySceneHost {
  /** Прямоугольник неба: над ним медаль и выбор. Нет — центр экрана. */
  field: DOMRect | null;
  /** Где кнопка: место кнопок ночи. Нет — низ экрана. */
  foot: DOMRect | null;
  /** Куда встать слоем: туда же, где рама, перед ней. Нет — поверх интерфейса. */
  root: HTMLElement | null;
  /** Откуда спускается сигил: правило Затмения в раме. */
  from: HTMLElement | null;
  /** Взять вариант; false — не вышло (ошибка уже показана). */
  take(index: number): boolean;
  /** После взятия: знак в раме, куда долететь (рама уже обновлена). */
  landing(offer: TrophyOffer): HTMLElement | null;
  done(): void;
}

const MEDAL = 116;
const SIG = 64;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('calm');
const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** Жемчужная корона Затмения: кольцо жемчужин вокруг сигила (как рама ночи в Затмение). */
function crown(size: number): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 144 144');
  svg.setAttribute('class', 'ts-crown');
  svg.style.width = svg.style.height = `${size * 1.1}px`;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', String(72 + Math.cos(a) * 66));
    c.setAttribute('cy', String(72 + Math.sin(a) * 66));
    c.setAttribute('r', i % 2 ? '2.2' : '3.2');
    c.setAttribute('class', 'ts-pearl');
    c.style.opacity = i % 2 ? '0.55' : '0.9';
    svg.append(c);
  }
  return svg;
}

const goldSigil = (id: string, size: number) => h('div.ts-gold', null, canvasImg(bossSigil(id, size, dpr()), size));

/**
 * Сцена «Небо сдаётся» (TR.2, вариант C, выбор Дениса 25.10.2026): поле ночи гаснет, сигил
 * Затмения спускается из рамы, становится золотым и раскалывается на два медальона — трофей
 * и парное Знамение. Табличка «Выбери одно» и «или» между ними говорят, что взять можно одно.
 * Выбранный знак улетает в свой слот рамы.
 */
export function showTrophyScene(run: RunState, choice: TrophyChoice, host: TrophySceneHost): () => void {
  const calm = reduced();
  const ms = (n: number) => (calm ? 0 : n);
  const trophy = choice.options.find((o) => o.k === 'trophy')!;
  const bossId = trophy.id;
  const old = trophiesOf(run).find((id) => id !== bossId);
  let pick = -1;
  let busy = true;

  const field = h('div.ts-field');
  const veil = h('div.ts-veil');
  const go = button(t('trophyScene.pick'), () => void take(), { className: 'ts-go', disabled: true });
  const replace = old ? h('div.ts-replace', null, [canvasImg(bossSigil(old, 24, dpr()), 24), h('span', null, t('trophyScene.replaces', { name: named('trophy', old).name }))]) : null;
  const note = h('div.ts-note', null, t('trophyScene.beaten', { name: named('boss', bossId).name }));
  const foot = h('div.ts-foot', null, [note, replace, go]);
  const layer = h('div.trophy-scene', { attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('trophyScene.pick') } }, [veil, field, foot]);
  placeFoot(foot, host.foot);
  // Рядом с рамой и раньше неё в DOM: рама рисуется поверх слоя, в неё прилетает знак
  if (host.root) host.root.prepend(layer);
  else (document.getElementById('ui') ?? document.body).append(layer);
  document.body.classList.add('trophy-yield');
  place(field, host.field, foot);

  const medal = h('div.ts-medal', { style: { width: `${MEDAL}px`, height: `${MEDAL}px` } }, [crown(MEDAL), canvasImg(bossSigil(bossId, MEDAL, dpr()), MEDAL)]);
  field.append(medal);

  // Медальоны выбора: строятся сразу (место держится), проявляются после переворота
  const cards = choice.options.map((offer, i) => optionCard(run, offer, i));
  const pair = h('div.ts-pair', null, cards.length > 1 ? [cards[0]!, h('span.ts-or', null, t('trophyScene.or')), cards[1]!] : cards);
  const head = h('div.ts-head', null, [h('b', null, t('trophyScene.pick')), h('small', null, t(cards.length > 1 ? 'trophyScene.pickSub' : 'trophyScene.pickOnly')), h('i')]);
  const pickBox = h('div.ts-pick', null, [head, pair]);

  function optionCard(run: RunState, offer: TrophyOffer, i: number): HTMLButtonElement {
    const canTake = canTakeTrophy(run, offer);
    const icon = offer.k === 'trophy' ? goldSigil(offer.id, SIG) : canvasImg(omenSigil(offer.id, SIG, dpr()), SIG);
    const info = offer.k === 'trophy' ? named('trophy', offer.id) : named('omen', offer.id, omenDef(offer.id).vars?.(omenDef(offer.id).initialData?.() ?? {}) ?? {});
    const desc = !canTake ? h('small.ts-full', null, t('trophyScene.full', { n: omenSlots(run) })) : h('small', null, bonusLine(info.desc));
    const el = h('button.ts-card', { type: 'button', dataset: { k: offer.k } }, [
      h('span.ts-kind', null, t(offer.k === 'trophy' ? 'trophyScene.kindTrophy' : 'trophyScene.kindOmen')),
      h('span.ts-icon', null, icon),
      h('b', null, info.name),
      desc,
    ]) as HTMLButtonElement;
    el.disabled = !canTake;
    el.addEventListener('click', () => select(i));
    return el;
  }

  function select(i: number): void {
    if (busy) return;
    pick = i;
    cards.forEach((c, j) => c.classList.toggle('on', j === i));
    const offer = choice.options[i]!;
    go.disabled = false;
    go.querySelector('.btn-label')!.textContent = t(offer.k === 'trophy' ? 'trophyScene.tame' : 'trophyScene.takeOmen');
    replace?.classList.toggle('off', offer.k !== 'trophy');
  }

  async function intro(): Promise<void> {
    veil.classList.add('on');
    await wait(ms(320));
    // Сигил спускается из рамы в центр неба
    const from = host.from?.getBoundingClientRect();
    const to = medal.getBoundingClientRect();
    if (from && from.width) {
      const dx = from.left + from.width / 2 - (to.left + to.width / 2);
      const dy = from.top + from.height / 2 - (to.top + to.height / 2);
      host.from!.style.opacity = '0.3';
      await medal.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${from.width / MEDAL})`, opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: ms(720), easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' }).finished;
    } else await medal.animate([{ opacity: 0, transform: 'scale(0.8)' }, { opacity: 1, transform: 'none' }], { duration: ms(480), easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }).finished;
    await tame();
    await wait(ms(200));
    // Раскол: медаль гаснет, табличка и два медальона расходятся из её центра
    field.append(pickBox);
    medal.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(0.7)' }], { duration: ms(320), easing: 'ease-in', fill: 'forwards' });
    for (const el of [head, ...pair.querySelectorAll('.ts-or')]) el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: ms(520), delay: ms(260), easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' });
    cards.forEach((el, i) => el.animate([{ opacity: 0, transform: `translateX(${cards.length > 1 ? (i ? -60 : 60) : 0}px) scale(0.8)` }, { opacity: 1, transform: 'none' }], { duration: ms(560), delay: ms(120), easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' }));
    await wait(ms(680));
    medal.remove();
    busy = false;
    // Один вариант (парное Знамение уже есть) — выбирать нечего, он и выбран
    if (cards.length === 1) select(0);
  }

  /** Авторское движение: жемчуг короны разлетается, сигил через ребро становится золотым. */
  async function tame(): Promise<void> {
    const pearls = [...medal.querySelectorAll<SVGCircleElement>('.ts-pearl')];
    pearls.forEach((p, i) => {
      const a = (i / pearls.length) * Math.PI * 2;
      p.animate([{ transform: 'none' }, { transform: `translate(${Math.cos(a) * 26}px, ${Math.sin(a) * 26}px) scale(0.4)`, opacity: 0 }], { duration: ms(620), delay: ms((i % 6) * 18), easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' });
    });
    await wait(ms(240));
    await medal.animate([{ transform: 'rotateY(0)' }, { transform: 'rotateY(90deg)' }], { duration: ms(240), easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'forwards' }).finished;
    medal.classList.add('gold');
    await medal.animate([{ transform: 'rotateY(-90deg)' }, { transform: 'rotateY(0)' }], { duration: ms(360), easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' }).finished;
  }

  async function take(): Promise<void> {
    if (busy || pick < 0) return;
    const offer = choice.options[pick]!;
    const icon = cards[pick]!.querySelector('.ts-icon') as HTMLElement;
    const a = icon.getBoundingClientRect();
    if (!host.take(pick)) return;
    busy = true;
    go.disabled = true;
    replace?.classList.add('gone');
    layer.classList.add('taken');
    // Знак летит копией в слой сцены: в раме он уже стоит, но пока спрятан
    const target = host.landing(offer);
    const fly = icon.cloneNode(true) as HTMLElement;
    const src = icon.querySelector('canvas');
    if (src) fly.querySelector('canvas')!.getContext('2d')!.drawImage(src, 0, 0);
    fly.classList.add('ts-flyer');
    Object.assign(fly.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
    layer.append(fly);
    icon.style.visibility = 'hidden';
    cards.filter((_, j) => j !== pick).forEach((c) => c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms(280), fill: 'forwards' }));
    head.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms(280), fill: 'forwards' });
    if (target) {
      const b = target.getBoundingClientRect();
      target.style.visibility = 'hidden';
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height / 2 - (a.top + a.height / 2);
      const k = b.width / a.width;
      await fly.animate([{ transform: 'none' }, { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 50}px) scale(${(1 + k) / 2})`, offset: 0.45 }, { transform: `translate(${dx}px, ${dy}px) scale(${k})` }], { duration: ms(760), easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards' }).finished;
      target.style.visibility = '';
      target.animate([{ transform: 'scale(1.3)' }, { transform: 'none' }], { duration: ms(450), easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    }
    fly.remove();
    const info = offer.k === 'trophy' ? named('trophy', offer.id) : named('omen', offer.id);
    const ribbon = sceneRibbon(t(offer.k === 'trophy' ? 'trophyScene.tamed' : 'trophyScene.omenTaken'), info.name);
    ribbon.classList.add('ts-ribbon');
    field.replaceChildren(ribbon);
    await wait(ms(1300));
    close();
    host.done();
  }

  function close(): void {
    document.body.classList.remove('trophy-yield');
    if (host.from) host.from.style.opacity = '';
    layer.remove();
  }

  void intro();
  return close;
}

/**
 * Слой поля — над небом ночи; без неба — по центру экрана. Если кнопка под небом (портрет),
 * поле занимает всю ширину и всё место до подписей над кнопкой: рука под пеленой не нужна,
 * а в Safari с его панелью небо ниже, чем табличка с медальонами.
 */
function place(el: HTMLElement, r: DOMRect | null, foot: HTMLElement): void {
  if (!r) return el.classList.add('center');
  const f = foot.getBoundingClientRect();
  const below = f.width > 0 && f.left < r.right && f.right > r.left;
  const left = below ? 12 : r.left;
  const width = below ? innerWidth - 24 : r.width;
  const height = below ? f.top - 12 - r.top : r.height;
  Object.assign(el.style, { left: `${left}px`, top: `${r.top}px`, width: `${width}px`, height: `${height}px` });
}

/** Кнопка — на месте кнопок ночи (низ прямоугольника), по его ширине. */
function placeFoot(el: HTMLElement, r: DOMRect | null): void {
  if (!r) return el.classList.add('center');
  Object.assign(el.style, { left: `${r.left}px`, width: `${r.width}px`, bottom: `${innerHeight - r.bottom}px` });
}
