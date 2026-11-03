import type { App } from '@/game/app';
import { t } from '@/i18n';
import { track } from '@/analytics';
import { saveProfile } from '@/meta/profile';
import { actionText } from '@/ui/rich';
import { TutorialOverlay } from './overlay';

/**
 * Первый заход в Обсерваторию — «Проводник» (GL.7, выбор Дениса 02.11.2026). Короткое обучение
 * кончается до Обсерватории, и раньше новичка встречала одна плашка «Нити». Теперь Лебедь ведёт
 * по экрану в четыре шага на приглушённом экране, нажимается только то, о чём речь:
 * купи Знамение → оно встало в ряд, срабатывают слева направо → звёздная карта прокачивает
 * созвездие → «Следующая ночь». Не хватает золота на Знамение — первый шаг рассказывает о них
 * и ведёт дальше по «Далее». Один раз за всё время; «Пропустить» заканчивает сразу.
 */
export function firstShopDue(app: App): boolean {
  const p = app.profile;
  return !app.runs.tutorial && !p.tutorialFinished && p.runs < 3 && !p.tutorial.includes('shop');
}

const rect = (el: Element | null) => {
  const r = el?.getBoundingClientRect();
  return r && r.width ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
};
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Окно поверх Обсерватории (дар ночи, пакет); закрывающееся не считается (GL.6). */
const modalOpen = () => !!document.querySelector('.modal-backdrop:not(.closing)');

type Line = 'shopBuy' | 'shopLook' | 'shopSlot' | 'shopCharts' | 'shopNext';

export async function firstShop(app: App, root: HTMLElement): Promise<void> {
  // Пройден, даже если игрок ушёл посередине: второй раз не навязываем
  app.profile.tutorial.push('shop');
  saveProfile(app.profile);
  // Окна (дар ночи, выбор пакета) важнее: проводник ждёт, пока они закроются
  await pause(450);
  while (root.isConnected && modalOpen()) await pause(200);
  if (!root.isConnected) return;

  let done = false;
  let index = 0;
  const overlay = new TutorialOverlay(() => {
    track('shop_guide', { step: 'skip', index });
    finish();
  });
  // Окно поверх посреди шагов — проводник прячется и возвращается, когда оно закроется
  const hide = () => overlay.setHidden(true);
  const show = () => !modalOpen() && overlay.setHidden(false);
  const finish = () => {
    if (done) return;
    done = true;
    overlay.destroy();
    root.classList.remove('tut-lock');
    root.querySelectorAll('.tut-allow').forEach((el) => el.classList.remove('tut-allow'));
    document.removeEventListener('starweave:modal', hide);
    document.removeEventListener('starweave:modal-closed', show);
  };
  document.addEventListener('starweave:modal', hide);
  document.addEventListener('starweave:modal-closed', show);

  const q = (sel: string) => root.querySelector<HTMLElement>(sel);
  const say = (key: Line, sel: string, next = false) => {
    index += 1;
    track('shop_guide', { step: key, index });
    overlay.spotlight(rect(q(sel)));
    return overlay.say(actionText(t(`tutorial.${key}`)), { next: next ? t('tut.next') : undefined });
  };
  const bought = async () => {
    while (root.isConnected && !done && !app.run?.omens.length) await pause(150);
    return root.isConnected && !done;
  };

  root.classList.add('tut-lock');
  const buy = [...root.querySelectorAll<HTMLElement>('[data-shop="omens"] .btn.price:not(:disabled)')];
  overlay.setProgress(1, 4);
  if (buy.length) {
    // Купить можно любое Знамение по карману
    buy.forEach((b) => b.classList.add('tut-allow'));
    await say('shopBuy', '[data-shop="omens"] .ware-list');
    if (!(await bought())) return finish();
    q('[data-shop="owned"]')?.scrollIntoView({ block: 'center' });
    await pause(350);
    overlay.setProgress(2, 4);
    await say('shopSlot', '[data-shop="owned"]', true);
  } else {
    await say('shopLook', '[data-shop="omens"] .ware-list', true);
  }
  if (done) return;
  if (q('[data-shop="items"]')) {
    q('[data-shop="items"]')?.scrollIntoView({ block: 'center' });
    await pause(350);
    overlay.setProgress(3, 4);
    await say('shopCharts', '[data-shop="items"] .ware-list', true);
    if (done) return;
  }
  overlay.setProgress(4, 4);
  q('[data-shop="next"]')?.classList.add('tut-allow');
  await say('shopNext', '[data-shop="next"]');
  while (root.isConnected && !done) await pause(200);
  finish();
}
