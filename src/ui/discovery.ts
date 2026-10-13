import { COMBO_EXAMPLES } from '@/core/content/combos';
import type { ComboId } from '@/core/types';
import { COLLECTIBLE_COMBOS } from '@/meta/profile';
import { dict, t } from '@/i18n';
import { h } from './dom';
import { cardThumb } from './screens/common';

type Banner = { kind: 'combo'; id: ComboId; count: number } | { kind: 'cross' };

const queue: Banner[] = [];
let current: HTMLElement | null = null;
let timer = 0;
/** Кто ждёт конца баннеров (окно итогов ночи). */
let waiters: (() => void)[] = [];
let fakeId = -5000;
const SHOW_MS = 2600;
const OUT_MS = 220;

/**
 * «Новое созвездие!» — короткий праздник при первом сборе созвездия и первом кресте.
 * Не блокирует игру: плашка над небом, уходит сама или по касанию. Несколько открытий
 * за ход показываются по очереди.
 */
export function announceDiscovery(banners: Banner[], onShow?: () => void): void {
  queue.push(...banners);
  if (!current) next(onShow);
}

/** Дождаться, пока баннеры уйдут (или их закроют касанием). */
export function whenDiscoveryDone(): Promise<void> {
  if (!current && queue.length === 0) return Promise.resolve();
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
      ? h('div.discovery', null, [
          h('div.discovery-kicker', null, t('discovery.newCombo', { n: b.count, total: COLLECTIBLE_COMBOS.length })),
          h('div.discovery-name', null, t(`combo.${b.id}`)),
          h('div.discovery-cards', null, COMBO_EXAMPLES[b.id].map(([rank, suit]) => cardThumb({ id: fakeId--, rank, suit }, 30))),
          h('div.discovery-desc', null, dict().comboDesc[b.id]),
        ])
      : h('div.discovery.cross', null, [
          h('div.discovery-kicker', null, t('discovery.firstKicker')),
          h('div.discovery-name', null, t('discovery.cross')),
          h('div.discovery-desc', null, t('discovery.crossDesc')),
        ]);
  el.addEventListener('click', () => dismiss(onShow));
  document.getElementById('ui')!.append(el);
  current = el;
  onShow?.();
  timer = window.setTimeout(() => dismiss(onShow), SHOW_MS);
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
  current?.remove();
  current = null;
  settle();
}
