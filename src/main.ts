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
  // Витрины графики — только в разработке (SEC.7): в сборку они не попадают вовсе
  const dev = import.meta.env.DEV;
  if (dev && params.has('promo')) {
    const { setLang } = await import('./i18n');
    const lang = params.get('lang');
    if (lang === 'en' || lang === 'ru') setLang(lang);
    const { showPromo } = await import('./dev/promo');
    showPromo(ui, params.has('desc'));
    return;
  }
  if (dev && params.has('icon')) {
    const { showIcon } = await import('./dev/icon');
    showIcon(ui, params.has('rounded'));
    return;
  }
  if (dev && params.has('gallery')) {
    const { showGallery } = await import('./dev/gallery');
    showGallery(ui);
    return;
  }
  // Ролик для превью: опытный игрок без подсказок новичка (только в разработке)
  const demo = import.meta.env.DEV && params.has('demo');
  if (demo) {
    localStorage.setItem('starweave.profile.v1', JSON.stringify({ version: 1, tutorialDone: true, runs: 12 }));
    localStorage.removeItem('starweave.run.v1');
    const lang = params.get('lang');
    if (lang === 'en' || lang === 'ru') {
      const settings = JSON.parse(localStorage.getItem('starweave.settings.v1') ?? '{}') as Record<string, unknown>;
      localStorage.setItem('starweave.settings.v1', JSON.stringify({ ...settings, lang }));
    }
  }
  const [{ startGame }, { createPlatform }] = await Promise.all([import('./game/app'), import('./platform')]);
  const platform = await createPlatform();
  await platform.init();
  const app = await startGame(platform);
  if (demo) {
    if (params.has('capture')) (await import('./dev/capture')).setupCapture(app);
    void import('./dev/demo').then(({ runDemo }) => runDemo(app, params.get('demo') ?? ''));
  }
  if (params.has('debug')) void import('./dev/diag').then(({ showDiagnostics }) => showDiagnostics(app));
  // Карта неба с развилками сразу — проверить её в iOS-симуляторе без консоли (только в разработке)
  if (dev && params.has('skymap')) {
    Object.assign(app.profile, { tutorialDone: true, tutorialFinished: true, runs: 9, bestAnte: 4, tutorial: ['guideSeen', 'giftSeen', 'boss'] });
    app.runs.startRun('classic', false, 0, 4242);
    const { planChapter } = await import('./core/route');
    app.run!.unlocks.routes = true;
    app.run!.chapter = planChapter(app.run!);
    // Витрина TR.3: два Затмения на последнем шаге (`fork=A|B|C` — вариант, `last` — сразу к выбору)
    const fork = params.get('fork');
    if (fork) {
      const run = app.run!;
      document.body.dataset.fork = fork;
      Object.assign(run.unlocks, { trophies: true, wonders: true });
      run.bosses[0] = 'gravity';
      const chapter = (run.chapter = planChapter(run));
      chapter.nodes.push({ kind: 'eclipse', bossId: 'fog', route: 'eclipse', step: 3, next: [] });
      const crowns = chapter.nodes.flatMap((n, j) => (n.step === 3 ? [j] : []));
      for (const n of chapter.nodes) if (n.step === 2) n.next = crowns;
      if (params.has('last')) {
        const first = chapter.nodes.findIndex((n) => n.step === 1 && n.route === 'night');
        const second = chapter.nodes.findIndex((n) => n.step === 2 && n.route === 'bright');
        chapter.path = [first, second];
        chapter.at = -1;
      }
    }
    await app.router.route();
  }
  // Ночь Затмения выиграна, награда на экране: «Забрать» откроет сцену трофея (TR.2)
  if (dev && params.has('trophy')) {
    Object.assign(app.profile, { tutorialDone: true, tutorialFinished: true, runs: 9, tutorial: ['guideSeen', 'giftSeen', 'boss'] });
    app.runs.startRun('classic', false, 0, 4242);
    const run = app.run!;
    const [{ planChapter }, { startNight }, { createOmen }] = await Promise.all([import('./core/route'), import('./core/night'), import('./core/omen-instance')]);
    Object.assign(run.unlocks, { routes: false, trophies: true });
    if (params.get('trophy')) run.trophies = [params.get('trophy')!];
    for (const id of ['stardust', 'highNoon', 'horizon']) run.omens.push(createOmen(run, id));
    run.bosses[0] = 'gravity';
    run.chapter = { ...planChapter(run), at: 2 };
    startNight(run);
    Object.assign(run.night!, { result: 'won', score: run.night!.target + 600 });
    run.phase = 'reward';
    run.reward = { base: 5, moves: 2, burns: 0, interest: 1, total: 8 };
    await app.router.route();
  }
}

void boot();

// Офлайн-кэш — только для своего сайта; порталы вроде Яндекс Игр раздают файлы сами
if (import.meta.env.PROD && !import.meta.env.VITE_PLATFORM && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}
