/**
 * Content Security Policy игры (SEC.8). Игра — статика (GitHub Pages, Telegram, порталы), заголовки
 * там не задать, поэтому политика ставится мета-тегом при сборке (`vite.config.ts`).
 *
 * Что закрывает: встроенные скрипты и `eval` (основной путь XSS), плагины, чужой `<base>`,
 * отправку форм. Скрипты — только свои и по https: SDK рекламы (AdsGram, Яндекс, Пикабу)
 * догружают скрипты с меняющихся хостов, жёсткий список ломал бы рекламу. Картинки, видео,
 * фреймы и запросы рекламы — по https. Нарушения уходят в `js_error` (`analytics`).
 * `frame-ancestors` в мета-теге не работает — встраивание решают площадки.
 */
export function contentSecurityPolicy(dev = false, appServer?: string): string {
  // Приложение Android (APK.6): всё своё лежит внутри, рекламы и чужих SDK нет. Скрипты только свои,
  // запросы только к своему серверу, фреймов нет
  if (appServer) {
    return Object.entries({
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'blob:'],
      'font-src': ["'self'", 'data:'],
      'media-src': ["'self'", 'data:', 'blob:'],
      'connect-src': ["'self'", appServer],
      'frame-src': ["'none'"],
      'worker-src': ["'self'", 'blob:'],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'none'"],
    }).map(([k, v]) => `${k} ${v.join(' ')}`).join('; ');
  }
  const policy: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", 'https:'],
    // Стили: свои; SDK Telegram и рекламы вставляют свои <style>
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'media-src': ["'self'", 'data:', 'blob:', 'https:'],
    // Сервер событий и оплаты, Метрика, SDK площадок и рекламы; в разработке — HMR Vite
    'connect-src': ["'self'", 'https:', 'wss:', ...(dev ? ['ws:'] : [])],
    'frame-src': ['https:'],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'none'"],
  };
  return Object.entries(policy).map(([k, v]) => `${k} ${v.join(' ')}`).join('; ');
}
