import '@fontsource/forum';
import '@fontsource-variable/manrope';
import './ui/styles.css';

// Игра, а не страница: без контекстного меню по правой кнопке и долгому нажатию
// Новая версия выложена, пока игра открыта: старая страница просит кусок кода, которого
// на сервере уже нет, — переход обрывается и игра «замирает». Перезагружаемся на новую
// версию (сохранение забега в хранилище), но не чаще раза в минуту — без петли.
window.addEventListener('vite:preloadError', (e) => {
  try {
    const last = Number(sessionStorage.getItem('starweave.reloadAt') ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem('starweave.reloadAt', String(Date.now()));
  } catch {
    return; // без хранилища не можем защититься от петли — лучше не перезагружать
  }
  e.preventDefault();
  window.location.reload();
});

document.addEventListener('contextmenu', (e) => {
  if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault();
});

async function boot(): Promise<void> {
  await document.fonts.ready;
  // Шрифты подключены частями (латиница и кириллица отдельно): без образца текста грузится
  // только латиница, и холст рисует русские буквы запасным шрифтом
  const sample = 'AaЯяЁё×2';
  await Promise.all([
    document.fonts.load("400 40px 'Forum'", sample),
    document.fonts.load("600 16px 'Manrope Variable'", sample),
    document.fonts.load("800 16px 'Manrope Variable'", sample),
  ]);
  const ui = document.getElementById('ui')!;
  const params = new URLSearchParams(location.search);
  if (params.has('promo')) {
    const { setLang } = await import('./i18n');
    const lang = params.get('lang');
    if (lang === 'en' || lang === 'ru') setLang(lang);
    const { showPromo } = await import('./dev/promo');
    showPromo(ui);
    return;
  }
  if (params.has('icon')) {
    const { showIcon } = await import('./dev/icon');
    showIcon(ui, params.has('rounded'));
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
  const app = await startGame(platform);
  if (params.has('debug')) void import('./dev/diag').then(({ showDiagnostics }) => showDiagnostics(app));
}

void boot();

// Офлайн-кэш — только для своего сайта; порталы вроде Яндекс Игр раздают файлы сами
if (import.meta.env.PROD && import.meta.env.VITE_PLATFORM !== 'yandex' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}
