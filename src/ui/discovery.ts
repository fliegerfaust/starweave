import { COMBO_EXAMPLES } from '@/core/content/combos';
import { MYTHS } from '@/core/content/myths';
import type { ComboId } from '@/core/types';
import { COLLECTIBLE_COMBOS } from '@/meta/profile';
import { dict, t } from '@/i18n';
import { h } from './dom';
import { icon } from './icons';
import { mythFigure } from './myth-figure';
import { routeIcon } from './route-icon';
import { cardThumb } from './screens/common';

type Banner = { kind: 'combo'; id: ComboId; count: number } | { kind: 'myth'; id: string; count: number } | { kind: 'cross' } | { kind: 'routes' };

const queue: Banner[] = [];
let current: HTMLElement | null = null;
let timer = 0;
/** Кто ждёт конца баннеров (окно итогов ночи). */
let waiters: (() => void)[] = [];
let fakeId = -5000;
/** Касание баннера мифа (CL.3): открыть Коллекцию на нём; `done` — окно закрыли. */
type Opener = (focus: string, done: () => void) => void;
let opener: Opener | null = null;
/** Коллекция открыта с баннера: очередь ждёт, пока её закроют. */
let held = false;
const SHOW_MS = 2600;
/** Новый миф — рисунок и строка легенды, читают чуть дольше созвездия. */
const MYTH_MS = 3400;
/** Открытие Развилок читают дольше: картинка и фраза. */
const ROUTES_MS = 4600;
const OUT_MS = 220;

/**
 * «Новое созвездие!» — короткий праздник при первом сборе созвездия и первом кресте,
 * «Новый миф · N из 12» (MY.4) — при первой находке мифа,
 * и «Открыто: Развилки» (ON.1) — в первую ночь главы, с которой они открылись.
 * Не блокирует игру: плашка над небом, уходит сама или по касанию. Несколько открытий
 * за ход показываются по очереди.
 */
export function announceDiscovery(banners: Banner[], onShow?: () => void, open?: Opener): void {
  queue.push(...banners);
  if (open) opener = open;
  if (!current && !held) next(onShow);
}

/** Дождаться, пока баннеры уйдут (или их закроют касанием). */
export function whenDiscoveryDone(): Promise<void> {
  if (!current && !held && queue.length === 0) return Promise.resolve();
  return new Promise((resolve) => waiters.push(resolve));
}

function settle(): void {
  const list = waiters;
  waiters = [];
  for (const fn of list) fn();
}

function next(onShow?: () => void): void {
  const b = queue.shift();
  if (!b) return settle();
  const el =
    b.kind === 'combo'
      ? h('div.discovery', { attrs: { role: 'status', 'aria-live': 'polite' } }, [
          h('div.discovery-kicker', null, t('discovery.newCombo', { n: b.count, total: COLLECTIBLE_COMBOS.length })),
          h('div.discovery-name', null, t(`combo.${b.id}`)),
          h('div.discovery-cards', null, COMBO_EXAMPLES[b.id].map(([rank, suit]) => cardThumb({ id: fakeId--, rank, suit }, 30))),
          h('div.discovery-desc', null, dict().comboDesc[b.id]),
        ])
      : b.kind === 'myth'
        ? h('div.discovery.myth', { attrs: { role: 'status', 'aria-live': 'polite' } }, [
            h('div.discovery-kicker', null, t('discovery.newMyth', { n: b.count, total: MYTHS.length })),
            h('div.discovery-name', null, [(dict().myth as Record<string, string>)[b.id] ?? b.id, opener ? icon('chevron') : null]),
            h('div.discovery-figure', null, mythFigure(b.id, 76, true)),
            h('div.discovery-desc', null, (dict().mythDesc as Record<string, string>)[b.id] ?? ''),
          ])
      : b.kind === 'routes'
        ? h('div.discovery.routes', { attrs: { role: 'status', 'aria-live': 'polite' } }, [
            h('div.discovery-kicker', null, t('discovery.openedKicker')),
            h('div.discovery-name', null, t('discovery.routes')),
            h('div.discovery-routes', null, [routePick('night'), h('span.or', null, t('route.or')), routePick('bright')]),
            h('div.discovery-desc', null, t('discovery.routesDesc')),
          ])
        : h('div.discovery.cross', { attrs: { role: 'status', 'aria-live': 'polite' } }, [
            h('div.discovery-kicker', null, t('discovery.firstKicker')),
            h('div.discovery-name', null, t('discovery.cross')),
            h('div.discovery-desc', null, t('discovery.crossDesc')),
          ]);
  el.addEventListener('click', () => (b.kind === 'myth' && opener ? openFind(`myth-${b.id}`, onShow) : dismiss(onShow)));
  document.getElementById('ui')!.append(el);
  current = el;
  onShow?.();
  timer = window.setTimeout(() => dismiss(onShow), b.kind === 'routes' ? ROUTES_MS : b.kind === 'myth' ? MYTH_MS : SHOW_MS);
}

/** Значок пути в звезде, как на карте неба, и подпись под ним. */
function routePick(kind: 'night' | 'bright'): HTMLElement {
  return h('div.discovery-route', null, [h('span.orb', null, routeIcon(kind)), h('span', null, t(`route.${kind}`))]);
}

/** Баннер уходит сразу, остальные ждут закрытия Коллекции: окно итогов ночи не встанет поверх. */
function openFind(focus: string, onShow?: () => void): void {
  window.clearTimeout(timer);
  current?.remove();
  current = null;
  held = true;
  opener!(focus, () => {
    if (!held) return;
    held = false;
    next(onShow);
  });
}

function dismiss(onShow?: () => void): void {
  window.clearTimeout(timer);
  const el = current;
  current = null;
  if (!el) return;
  el.classList.add('out');
  window.setTimeout(() => {
    el.remove();
    next(onShow);
  }, OUT_MS);
}

/** Уйти с экрана ночи — баннеры больше не к месту. */
export function clearDiscovery(): void {
  window.clearTimeout(timer);
  queue.length = 0;
  held = false;
  current?.remove();
  current = null;
  settle();
}
