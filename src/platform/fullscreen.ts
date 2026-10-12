/**
 * Полный экран в мобильном браузере. На Android и планшетах работает Fullscreen API —
 * панели браузера прячутся и полю достаётся вся высота. На iPhone API нет: там помогает
 * только запуск с экрана «Домой», поэтому показываем подсказку.
 */

const touch = (): boolean => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

/** Уже запущено как приложение (с экрана «Домой» или из стора). */
export function isStandalone(): boolean {
  return (
    (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Можно ли развернуть игру кнопкой: сенсорный экран, браузер умеет, ещё не приложение. */
export function canFullscreen(): boolean {
  return touch() && !isStandalone() && typeof document !== 'undefined' && document.fullscreenEnabled === true;
}

/** iPhone/iPod в браузере: развернуть нельзя, но можно добавить на экран «Домой». */
export function suggestHomeScreen(): boolean {
  return /iPhone|iPod/.test(navigator.userAgent) && !isStandalone();
}

/** Развернуть на весь экран. Вызывать только из обработчика нажатия — иначе браузер откажет. */
export function enterFullscreen(): void {
  if (!canFullscreen() || document.fullscreenElement) return;
  document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}
