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
  if (dev && params.has('chartsheet')) {
    const { showChartSheet } = await import('./dev/charts');
    showChartSheet(ui, params.get('chartsheet') || null);
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
    // `fork` — два Затмения на последнем шаге (TR.3), `last` — сразу к их выбору
    if (params.has('fork')) {
      const run = app.run!;
      Object.assign(run.unlocks, { trophies: true, wonders: true });
      run.bosses[0] = 'gravity';
      const chapter = (run.chapter = planChapter(run));
      if (params.has('last')) {
        const first = chapter.nodes.findIndex((n) => n.step === 1 && n.route === 'night');
        const second = chapter.nodes.findIndex((n) => n.step === 2 && n.route === 'bright');
        chapter.path = [first, second];
        chapter.at = -1;
      }
    }
    await app.router.route();
  }
  // RS.2: Обсерватория с парой Знамений — Резонанс (`?resonance`; `=apart` — пара врозь)
  if (dev && params.has('resonance')) {
    Object.assign(app.profile, { tutorialDone: true, tutorialFinished: true, runs: 14, bestAnte: 6, tutorial: ['guideSeen', 'giftSeen', 'boss'] });
    app.runs.startRun('classic', false, 0, 4242);
    const run = app.run!;
    const [{ createOmen }, { generateShop }] = await Promise.all([import('./core/omen-instance'), import('./core/shop')]);
    run.unlocks.resonance = true;
    run.ante = 4;
    run.gold = 18;
    const ids = params.get('resonance') === 'apart' ? ['sunWorship', 'stardust', 'highNoon', 'nightOwl'] : ['stardust', 'sunWorship', 'highNoon', 'nightOwl'];
    run.omens = ids.map((id) => createOmen(run, id));
    run.phase = 'shop';
    run.shop = generateShop(run);
    await app.router.route();
  }
  // CN.1: иконки созвездий на настоящих экранах (`?charts=a|b|c&at=shop|pack|guide`)
  if (dev && params.has('at')) {
    Object.assign(app.profile, { tutorialDone: true, tutorialFinished: true, runs: 14, bestAnte: 6, tutorial: ['guideSeen', 'giftSeen', 'boss'] });
    app.runs.startRun('classic', false, 0, 4242);
    const run = app.run!;
    const { createOmen } = await import('./core/omen-instance');
    run.ante = 3;
    run.gold = 14;
    run.comboLevels.pair = 2;
    run.comboLevels.flush = 3;
    run.omens = ['horizon', 'starlight', 'sunWorship'].map((id) => createOmen(run, id));
    run.phase = 'shop';
    run.shop = {
      omens: [{ kind: 'omen', omenId: 'tripod', price: 7, sold: false }, { kind: 'omen', omenId: 'stardust', price: 6, sold: false }],
      items: [{ kind: 'chart', combo: 'pair', price: 3, sold: false }, { kind: 'chart', combo: 'flush', price: 3, sold: false }],
      packs: [{ kind: 'pack', pack: 'chart', price: 4, sold: false }],
      rerollCost: 5,
    };
    if (params.get('at') === 'pack') run.pending = [{ kind: 'pack', pack: 'chart', options: ['triple', 'straight', 'supernova'] }];
    await app.router.route();
    if (params.get('at') === 'guide') {
      const { showGuide } = await import('./ui/screens/guide');
      showGuide({ tab: 'combos', levels: run.comboLevels, profile: app.profile });
    }
  }
  // OB: полный ряд Знамений (`?full=shop|pack|trophy`): замена своего
  if (dev && params.has('full')) {
    Object.assign(app.profile, { tutorialDone: true, tutorialFinished: true, runs: 14, bestAnte: 6, tutorial: ['guideSeen', 'giftSeen', 'boss'] });
    app.runs.startRun('classic', false, 0, 4242);
    const run = app.run!;
    const { createOmen } = await import('./core/omen-instance');
    run.ante = 3;
    // 9 золота, как у Андрея: на Треножник за 7 хватает сразу, на Астролога за 12 — только с продажей Совы
    run.gold = 9;
    run.omens = ['horizon', 'starlight', 'sunWorship', 'stardust', 'nightOwl'].map((id) => createOmen(run, id));
    run.phase = 'shop';
    run.shop = {
      omens: [{ kind: 'omen', omenId: 'tripod', price: 7, sold: false }, { kind: 'omen', omenId: 'astrologer', price: 12, sold: false }],
      items: [{ kind: 'chart', combo: 'pair', price: 3, sold: false }],
      packs: [{ kind: 'pack', pack: 'omen', price: 4, sold: false }],
      rerollCost: 5,
    };
    if (params.get('full') === 'pack') run.pending = [{ kind: 'pack', pack: 'omen', options: ['cometTrail', 'moonTide', 'pillar'] }];
    if (params.get('full') === 'trophy') {
      const [{ rollTrophy }, { TROPHY_LIST }] = await Promise.all([import('./core/trophy'), import('./core/content/trophies')]);
      run.pending = [{ kind: 'trophy', options: rollTrophy(run, TROPHY_LIST[0]!.id) }];
    }
    await app.router.route();
  }
  // CM: Комета с обменом ранга (`?comet`)
  if (dev && params.has('comet')) {
    Object.assign(app.profile, { tutorialDone: true, tutorialFinished: true, runs: 14, bestAnte: 6, tutorial: ['guideSeen', 'giftSeen', 'boss'] });
    app.runs.startRun('classic', false, 0, 4242);
    const run = app.run!;
    run.ante = 4;
    run.gold = 2;
    const sun = (rank: number) => run.deck.find((c) => c.suit === 'sun' && c.rank === rank)!;
    // Пара как на снимке Андрея (5 и 3 Солнца); остальные обмены те, что есть
    const [hi, lo] = [sun(5), sun(3)];
    const trade = { e: 'rankShift', up: hi.id, down: lo.id };
    const plain = run.deck.filter((c) => !c.glyph && !c.body && c.id !== hi.id && c.id !== lo.id);
    run.pending = [{ kind: 'comet', options: [{ e: 'cardForGlyph', give: plain[0]!.id, target: plain[1]!.id, glyph: 'echo' }, { e: 'suitShift', cards: [plain[2]!.id, plain[3]!.id], suit: 'moon' }, trade] } as never];
    run.phase = 'map';
    await app.router.route();
  }
  // ON.1: открытие Развилок (`?routesfx=open|fork`)
  if (dev && params.has('routesfx')) {
    const { showRoutesNotice } = await import('./dev/routes-notice');
    await showRoutesNotice(app, params.get('routesfx') ?? 'open');
  }
  // Витрины CL.1–CL.2: главная опытного игрока (`?home`); `?home=new` — после первого забега, `&open` — сразу Коллекция
  if (dev && params.has('home')) {
    const [{ OMEN_LIST }, { BOSS_LIST }] = await Promise.all([import('./core/content/omens'), import('./core/content/bosses')]);
    const regular = OMEN_LIST.filter((o) => !o.pair).map((o) => o.id);
    const fresh = params.get('home') === 'new';
    Object.assign(app.profile, fresh
      ? { tutorialDone: true, tutorialFinished: true, runs: 1, wins: 0, eclipses: 0, bestAnte: 2, bestPlacement: 640, totalLines: 21, combosFound: ['pair', 'flush', 'straight'], seenOmens: regular.slice(0, 4), seenBosses: [], mythsFound: [] }
      : {
          tutorialDone: true, tutorialFinished: true, runs: 23, wins: 3, bestAnte: 8, bestPlacement: 4820, totalLines: 412, eclipses: 31,
          combosFound: ['pair', 'flush', 'straight', 'twoPair', 'triple', 'quartet', 'mirror'],
          seenOmens: [...regular.slice(0, 28), ...OMEN_LIST.filter((o) => o.pair).slice(0, 2).map((o) => o.id)],
          seenBosses: BOSS_LIST.slice(0, 9).map((b) => b.id), tamed: { [BOSS_LIST[0]!.id]: 2, [BOSS_LIST[3]!.id]: 1 },
          mythsFound: ['cassiopeia', 'cygnus', 'lyra'], unlockedSkies: ['classic', 'twins', 'wanderer'],
        });
    // Витрина HF.6 (`&stats`): доли игроков, как будто сервер уже ответил; `&fresh` — новое достижение
    if (params.has('stats')) {
      const [{ hallDemo }, { FEATS }] = await Promise.all([import('./dev/hall-demo'), import('./meta/achievements')]);
      const demo = hallDemo({ ...app.profile }, false);
      localStorage.setItem('starweave.hall.v1', JSON.stringify({ players: demo.players, feats: FEATS.map((f) => demo.feats[f.id]), records: demo.records }));
    }
    app.runs.persistProfile();
    await app.router.goMenu();
    if (params.has('open')) (await import('./ui/screens/common')).showCollection(app.profile);
  }
  // Витрина HF.0: «Зал славы» опытного игрока, `?hall`; `&who=new` — после первого забега
  if (dev && params.has('hall')) {
    const [{ showHall }, { hallDemo }] = await Promise.all([import('./ui/screens/hall'), import('./dev/hall-demo')]);
    const demo = hallDemo(app.profile, params.get('who') === 'new');
    app.runs.persistProfile();
    await app.router.goMenu();
    showHall(app.profile, demo);
  }
  // Коллекция трофеев во Справочнике (TR.4): профиль со ступенью трофеев и приручениями
  if (dev && params.has('collection')) {
    const seen = ['void', 'eclipse-sun', 'eclipse-moon', 'eclipse-star', 'fog', 'drought', 'shortNight', 'silence', 'gravity', 'judge', 'wane'];
    Object.assign(app.profile, {
      tutorialDone: true, tutorialFinished: true, runs: 23, wins: 3, bestAnte: 8, eclipses: 31,
      seenBosses: seen, tamed: { gravity: 3, fog: 1, void: 2, 'eclipse-sun': 1, judge: 4 },
    });
    const [{ showHelp }, { OMEN_LIST }] = await Promise.all([import('./ui/screens/common'), import('./core/content/omens')]);
    app.profile.seenOmens = OMEN_LIST.slice(0, 26).map((o) => o.id);
    // RS.3 (`?collection=resonance`): два легендарных слиты, у остальных видна часть половинок
    const legends = params.get('collection') === 'resonance';
    if (legends) app.profile.seenOmens.push('sunWorship', 'highNoon', 'noon', 'pyre', 'ember', 'wildfire', 'nightOwl', 'moonTide', 'hoarder', 'miser');
    app.profile.seenOmens = [...new Set(app.profile.seenOmens)];
    showHelp({ tab: 'collection', profile: app.profile, focus: legends ? 'legends' : undefined });
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
  // DEV: итоги забега с находками для витрины и e2e (`?over=lost|win`, `&finds=N` — сколько нового, по умолчанию 3)
  if (dev && params.has('over')) {
    const [{ OMEN_LIST }, { BOSS_LIST }, { startNight }, { planChapter }] = await Promise.all([import('./core/content/omens'), import('./core/content/bosses'), import('./core/night'), import('./core/route')]);
    const regular = OMEN_LIST.filter((o) => !o.pair).map((o) => o.id);
    Object.assign(app.profile, {
      tutorialDone: true, tutorialFinished: true, runs: 14, wins: 1, bestAnte: 8, bestPlacement: 9000, eclipses: 31,
      combosFound: ['pair', 'flush', 'straight', 'twoPair', 'triple'], seenOmens: regular.slice(0, 20), seenBosses: BOSS_LIST.slice(0, 6).map((b) => b.id),
      mythsFound: ['cassiopeia', 'cygnus'], tutorial: ['guideSeen', 'giftSeen', 'boss'],
    });
    app.runs.startRun('classic', false, 0, 4242);
    const run = app.run!;
    app.runs.bestBefore = app.profile.bestPlacement;
    const n = Number(params.get('finds') ?? 3);
    const fresh = [{ k: 'myth', id: 'lyra' }, { k: 'boss', id: BOSS_LIST[7]!.id }, ...regular.slice(20, 26).map((id) => ({ k: 'omen', id }))].slice(0, n);
    for (const f of fresh) (f.k === 'myth' ? app.profile.mythsFound! : f.k === 'boss' ? app.profile.seenBosses : app.profile.seenOmens).push(f.id);
    Object.assign(run.stats, { bestPlacement: 2140, lines: 64, crosses: 3, nightsWon: 11 });
    if (params.get('over') === 'win') {
      run.ante = 8;
      run.phase = 'victory';
    } else {
      run.ante = 5;
      Object.assign(run.unlocks, { routes: false, wonders: false });
      run.chapter = { ...planChapter(run), at: 1 };
      startNight(run);
      Object.assign(run.night!, { result: 'lost', score: Math.round(run.night!.target * 0.8) });
      run.phase = 'gameOver';
    }
    await app.router.route();
  }
  // DEV: баннер «Новый миф» посреди ночи — касание открывает Коллекцию на нём (`?mythfx`)
  if (dev && params.has('mythfx')) {
    Object.assign(app.profile, { tutorialDone: true, tutorialFinished: true, runs: 9, tutorial: ['guideSeen', 'giftSeen', 'boss'], mythsFound: ['cassiopeia', 'cygnus', 'lyra'] });
    app.runs.startRun('classic', false, 0, 4242);
    const run = app.run!;
    const [{ planChapter }, { startNight }, { announceDiscovery }, { showCollection }] = await Promise.all([import('./core/route'), import('./core/night'), import('./ui/discovery'), import('./ui/screens/common')]);
    Object.assign(run.unlocks, { routes: false, wonders: false, myths: true });
    run.chapter = { ...planChapter(run), at: 1 };
    startNight(run);
    await app.router.route();
    await new Promise((r) => setTimeout(r, 900));
    const show = () => announceDiscovery([{ kind: 'myth', id: 'lyra', count: 3 }], undefined, (focus, done) => showCollection(app.profile, focus, done));
    show();
    // Витрину смотрят не сразу: баннер возвращается, пока Коллекция закрыта
    setInterval(() => document.querySelector('.discovery, .collection-modal') || show(), 2500);
  }
}

void boot();

// Офлайн-кэш — только для своего сайта; порталы вроде Яндекс Игр раздают файлы сами
if (import.meta.env.PROD && !import.meta.env.VITE_PLATFORM && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}
