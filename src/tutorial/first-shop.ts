import type { App } from '@/game/app';
import { t } from '@/i18n';
import { actionText } from '@/ui/rich';
import { coach, dismissCoach } from '@/ui/tutorial';
import { TutorialOverlay } from './overlay';

/**
 * Первый заход в Обсерваторию после короткого обучения (GL.7, витрина `?ftue=guide|hints`).
 * Короткое обучение кончается до Обсерватории, и раньше новичка встречала одна плашка «Нити».
 * Теперь Лебедь проводит по экрану в четыре шага: купи Знамение → оно встало в ряд, срабатывают
 * слева направо → звёздные карты прокачивают созвездие → «Следующая ночь».
 * `guide` — «Проводник»: экран приглушён, нажимается только то, о чём речь, шаги по «Дальше».
 * `hints` — «Нить по ходу»: экран свободен, подсказки идут по одной вслед за действиями игрока.
 */
export type FirstShopVariant = 'guide' | 'hints';

export function firstShopVariant(): FirstShopVariant | null {
  const v = import.meta.env.DEV ? document.documentElement.dataset.ftue : undefined;
  return v === 'guide' || v === 'hints' ? v : null;
}

const rect = (el: Element | null) => {
  const r = el?.getBoundingClientRect();
  return r && r.width ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
};
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ждать, пока игрок купит первое Знамение (или уйдёт с экрана — тогда false). */
async function boughtOmen(app: App, root: HTMLElement): Promise<boolean> {
  while (root.isConnected) {
    if ((app.run?.omens.length ?? 0) > 0) return true;
    await pause(150);
  }
  return false;
}

export function firstShop(app: App, root: HTMLElement, variant: FirstShopVariant): void {
  if (variant === 'hints') void hints(app, root);
  else void guide(app, root);
}

/** «Нить по ходу»: подсказки по одной, экран не блокируется. */
async function hints(app: App, root: HTMLElement): Promise<void> {
  coach(app, 'shopBuy');
  if (!(await boughtOmen(app, root))) return;
  dismissCoach(app, 'shopBuy');
  root.querySelector('[data-shop="owned"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  await pause(400);
  // Очередь «Нити»: следующая плашка встаёт, когда игрок нажал «Понятно» на прошлой
  coach(app, 'shopSlot');
  coach(app, 'shopCharts');
  coach(app, 'shopNext');
}

/** «Проводник»: приглушённый экран, рамка на том, о чём речь, нажимается только оно. */
async function guide(app: App, root: HTMLElement): Promise<void> {
  let done = false;
  const overlay = new TutorialOverlay(() => finish());
  const finish = () => {
    if (done) return;
    done = true;
    overlay.destroy();
    root.classList.remove('tut-lock');
    root.querySelectorAll('.tut-allow').forEach((el) => el.classList.remove('tut-allow'));
  };
  const q = (sel: string) => root.querySelector<HTMLElement>(sel);
  const say = (key: 'shopBuy' | 'shopSlot' | 'shopCharts' | 'shopNext', sel: string, next = false) => {
    overlay.spotlight(rect(q(sel)));
    return overlay.say(actionText(t(`tutorial.${key}`)), { next: next ? t('tut.next') : undefined });
  };
  root.classList.add('tut-lock');
  await pause(450);
  overlay.setProgress(1, 4);
  // Купить можно любое Знамение по карману
  root.querySelectorAll('[data-shop="omens"] .btn.price:not(:disabled)').forEach((b) => b.classList.add('tut-allow'));
  await say('shopBuy', '[data-shop="omens"] .ware-list');
  if (!(await boughtOmen(app, root)) || done) return finish();
  q('[data-shop="owned"]')?.scrollIntoView({ block: 'center' });
  await pause(350);
  overlay.setProgress(2, 4);
  await say('shopSlot', '[data-shop="owned"]', true);
  if (done) return;
  q('[data-shop="items"]')?.scrollIntoView({ block: 'center' });
  await pause(350);
  overlay.setProgress(3, 4);
  await say('shopCharts', '[data-shop="items"] .ware-list', true);
  if (done) return;
  overlay.setProgress(4, 4);
  q('[data-shop="next"]')?.classList.add('tut-allow');
  await say('shopNext', '[data-shop="next"]');
  while (root.isConnected && !done) await pause(200);
  finish();
}
