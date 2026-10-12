import type { App } from '@/game/app';

/**
 * Диагностика на живом устройстве: `?debug` в адресе показывает в углу, как на самом деле
 * рисуется холст (DPR, размеры буфера и на экране, цена кадра) и что умеет вибрация.
 * Нужна, чтобы чинить чёткость и тактильность по цифрам с телефона, а не наугад.
 */
export function showDiagnostics(app: App): void {
  const el = document.createElement('pre');
  el.style.cssText =
    'position:fixed;left:4px;top:calc(env(safe-area-inset-top) + 4px);z-index:200;margin:0;padding:6px 8px;border-radius:8px;background:rgba(0,0,0,.75);color:#9f9;font:11px/1.35 ui-monospace,monospace;pointer-events:none;white-space:pre';
  document.body.append(el);
  let frames = 0;
  let last = performance.now();
  let fps = 0;
  const tick = () => {
    frames++;
    const now = performance.now();
    if (now - last >= 1000) {
      fps = Math.round((frames * 1000) / (now - last));
      frames = 0;
      last = now;
      const r = app.svc.renderer;
      const c = r.canvas;
      const rect = c.getBoundingClientRect();
      const nav = navigator as Navigator & { userActivation?: unknown };
      el.textContent = [
        `devicePixelRatio ${window.devicePixelRatio}`,
        `renderer.dpr ${r.dpr}  css ${r.width}×${r.height}`,
        `canvas buffer ${c.width}×${c.height}`,
        `canvas on screen ${rect.width.toFixed(1)}×${rect.height.toFixed(1)}`,
        `visualViewport ${window.visualViewport?.width.toFixed(1)}×${window.visualViewport?.height.toFixed(1)} scale ${window.visualViewport?.scale}`,
        `fps ${fps}`,
        `vibrate ${typeof navigator.vibrate}  userActivation ${nav.userActivation ? 'yes' : 'no'}`,
        `ua ${navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 60)}`,
      ].join('\n');
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
