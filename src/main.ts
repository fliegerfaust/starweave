import '@fontsource/forum';
import '@fontsource-variable/manrope';
import './ui/styles.css';

async function boot(): Promise<void> {
  await document.fonts.ready;
  await Promise.all([document.fonts.load("400 40px 'Forum'"), document.fonts.load("600 16px 'Manrope Variable'")]);
  const ui = document.getElementById('ui')!;
  const params = new URLSearchParams(location.search);
  if (params.has('promo')) {
    const { setLang } = await import('./i18n');
    if (params.get('lang') === 'en') setLang('en');
    const { showPromo } = await import('./dev/promo');
    showPromo(ui);
    return;
  }
  if (params.has('gallery')) {
    const { showGallery } = await import('./dev/gallery');
    showGallery(ui);
    return;
  }
  const [{ startGame }, { createPlatform }] = await Promise.all([import('./game/app'), import('./platform')]);
  const platform = await createPlatform();
  await platform.init();
  await startGame(platform);
}

void boot();

// Офлайн-кэш — только для своего сайта; порталы вроде Яндекс Игр раздают файлы сами
if (import.meta.env.PROD && import.meta.env.VITE_PLATFORM !== 'yandex' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}
