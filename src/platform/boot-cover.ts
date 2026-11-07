import { t } from '@/i18n';

/** Кадр дольше этого значит, что видеочип ещё занят сборкой. */
const SMOOTH_MS = 26;
/** Столько ровных кадров подряд, и игру можно показывать. */
const SMOOTH_FRAMES = 14;
/** Дольше заставку не держим: лучше показать игру с рывками, чем зависшую заставку. */
const LIMIT_MS = 9000;

/**
 * Заставка запуска (APK.11). При первом запуске Android заново компилирует программы видеочипа:
 * зависания до 2,6 секунды попадали прямо в обучение. Игра строит сцену и прогревает эффекты под
 * заставкой, а открывается, когда кадры пошли ровно.
 */
export function bootCover(): HTMLElement | null {
  const cover = document.querySelector<HTMLElement>('.boot-cover');
  const title = cover?.querySelector('h1');
  if (title) title.textContent = t('game.title');
  return cover;
}

/** Ждёт ровных кадров и готовности игры (`ready`), затем зовёт `done`. */
export function whenSmooth(ready: () => boolean, done: () => void): void {
  const limit = performance.now() + LIMIT_MS;
  let last = performance.now();
  let smooth = 0;
  const frame = (now: number) => {
    smooth = now - last < SMOOTH_MS && ready() ? smooth + 1 : 0;
    last = now;
    if (smooth >= SMOOTH_FRAMES || now > limit) done();
    else requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Убирает заставку плавно: резкий переход выдал бы подмену экрана. */
export function hideCover(cover: HTMLElement): void {
  cover.classList.add('out');
  window.setTimeout(() => cover.remove(), 400);
}
