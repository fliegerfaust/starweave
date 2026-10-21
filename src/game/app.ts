import { clearCardCache, setCardBack } from '@/art/card';
import { SKY_THEMES, isFreeCosmetic, skyTheme } from '@/art/cosmetics';
import { clearSigilCache } from '@/art/sigil';
import { RuleError } from '@/core/errors';
import { burnCard, placeCard, startNight } from '@/core/night';
import { GIFT_GOLD_CAP, canDoubleReward, canRevive, collectReward, continueEndless, doubleReward, leaveShop, newRun, reviveNight } from '@/core/run';
import { deserializeRun, serializeRun } from '@/core/save';
import type { GameEvent, RunState } from '@/core/types';
import { Synth } from '@/engine/audio';
import { Haptics } from '@/engine/haptics';
import { World } from '@/engine/ecs';
import { PointerInput } from '@/engine/input';
import { Renderer } from '@/engine/renderer';
import { Tweener } from '@/engine/tween';
import { named, setLang, t } from '@/i18n';
import { dailySeed, todayKey, loadProfile, markDailyStarted, unrecordRunEnd, markSeen, recordProgress, recordRunEnd, saveProfile, type Profile } from '@/meta/profile';
import { SPEEDS, loadSettings, saveSettings, type Settings } from '@/meta/settings';
import { KEYS, storage } from '@/meta/storage';
import { h } from '@/ui/dom';
import { hideTooltip, setUiSound, toast } from '@/ui/widgets';
import { clearCoach } from '@/ui/tutorial';
import { Drawable, Layer, Lifetime, Particle, Transform, transform } from './components';
import type { Resources, Services } from './context';
import type { NightAction } from './night/scene';
import { isLandscape } from './layout';
import { Starfield } from './starfield';
import { compareToChallenge, parseStartParam, type Challenge } from './challenge';
import { forgetClientId, initAnalytics, measureFps, reportError, track } from '@/analytics';
import type { Platform, PurchaseResult } from '@/platform';
import { Entitlements } from '@/store/entitlements';
import { TutorialDirector } from '@/tutorial/director';
import { applyTutorialNight, newTutorialRun, tutorialShop } from '@/core/tutorial';
import { cameraSystem } from './systems/camera';
import { particleSystem } from './systems/particles';
import { renderSystem } from './systems/render';
import { interstitialAllowed } from './ad-pacing';

/** Экран: DOM-слой плюс, возможно, сущности на канвасе. */
export interface Screen {
  mount(root: HTMLElement): void;
  unmount(): void;
}

export class App {
  readonly svc: Services;
  settings: Settings;
  profile: Profile;
  run: RunState | null = null;
  /** Купленное на этой площадке: атлас, внешний вид. */
  readonly purchases = new Entitlements();
  private screen: Screen | null = null;
  private readonly root: HTMLElement;
  private last = performance.now();

  constructor(readonly platform: Platform) {
    this.settings = loadSettings();
    // «Меньше тряски» гасит и анимации интерфейса, а не только тряску поля
    document.documentElement.classList.toggle('calm', this.settings.reduceMotion);
    document.documentElement.classList.toggle('large-text', this.settings.largeText);
    // Язык площадки важнее языка браузера, пока игрок сам его не выбрал
    if (!storage.get(KEYS.settings) && platform.language()) this.settings.lang = platform.language()!;
    setLang(this.settings.lang);
    this.profile = loadProfile();
    const stage = document.getElementById('stage')!;
    const renderer = new Renderer(stage);
    const tweens = new Tweener();
    const res: Resources = {
      renderer,
      tweens,
      camera: { shakeX: 0, shakeY: 0, trauma: 0 },
      time: 0,
      speed: SPEEDS[this.settings.speed] ?? 1,
      reduceMotion: this.settings.reduceMotion,
      dpr: renderer.dpr,
    };
    const world = new World(res);
    world.addSystem(particleSystem).addSystem(cameraSystem).addSystem(renderSystem);
    const starfield = new Starfield();
    starfield.resize(renderer.width, renderer.height, renderer.dpr);
    const updateOrientation = () => document.body.classList.toggle('landscape', isLandscape(renderer.width, renderer.height));
    updateOrientation();
    renderer.onResize(() => {
      updateOrientation();
      starfield.resize(renderer.width, renderer.height, renderer.dpr);
      if (res.dpr !== renderer.dpr) {
        res.dpr = renderer.dpr;
        clearCardCache();
        clearSigilCache();
      }
    });
    const bg = world.create();
    world.add(bg, Transform, transform(0, 0));
    world.add(bg, Drawable, { layer: Layer.Background, z: 0, visible: true, draw: (ctx) => starfield.draw(ctx, res.time) });

    const audio = new Synth();
    audio.setVolumes(this.settings.sfx, this.settings.music);
    const input = new PointerInput(stage);
    const haptics = new Haptics();
    haptics.enabled = this.settings.haptics;
    renderer.adaptive = this.settings.quality !== 'max';
    this.svc = { world, renderer, tweens, audio, input, starfield, haptics };
    this.applyCosmetics();
    // Покупка или возврат меняют, что можно носить
    this.purchases.onChange(() => this.applyCosmetics());

    setUiSound((s) => {
      audio.unlock();
      if (s === 'click') {
        audio.click();
        haptics.play('tap');
      }
      else if (s === 'deny') audio.deny();
      else audio.hover();
    });
    const unlockAudio = () => {
      audio.unlock();
      audio.startMusic();
    };
    window.addEventListener('pointerdown', unlockAudio, { once: false, passive: true });

    this.root = h('div.screen-root');
    document.getElementById('ui')!.append(this.root);
    this.run = deserializeRun(storage.get(KEYS.run));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.save();
        this.flushCloudSave();
      }
      // Требование порталов: без фокуса игра молчит
      this.svc.audio.setMuted(document.hidden || this.adPlaying);
    });
    platform.onPauseChange((paused) => {
      this.adPlaying = paused;
      this.svc.audio.setMuted(paused || document.hidden);
    });
  }

  private adPlaying = false;
  /** Когда в этой сессии была последняя реклама — межстраничная выдерживает паузу после неё. */
  private lastAdAt: number | null = null;
  /** Рекорд хода до записи итогов забега — окно итогов сравнивает с ним честно. */
  bestBefore = 0;
  /** Вызов из ссылки, которым открыли игру: меню покажет его один раз. */
  pendingChallenge: Challenge | null = null;

  /** Один шаг симуляции: твины, небо, системы ECS. */
  tick(dt: number): void {
    const res = this.svc.world.res;
    res.time += dt;
    this.svc.tweens.update(dt);
    this.svc.starfield.update(dt);
    this.svc.world.update(dt);
  }

  /** Отладка: прокрутить время вперёд (вкладка в фоне почти не получает кадров). */
  advance(seconds: number): void {
    for (let t = 0; t < seconds; t += 1 / 60) this.tick(1 / 60);
  }

  /** Когда игрок последний раз касался экрана или клавиш (мс, `performance.now`). */
  private lastInputAt = performance.now();

  /**
   * Покой: ничего не летит и не трясётся, игрок не трогает экран пару секунд. Тогда
   * мерцание неба рисуется через кадр (30 FPS) — телефон меньше греется в меню и на
   * паузе. Любое касание или анимация возвращает полные 60.
   */
  private idle(now: number): boolean {
    const { world, tweens, starfield } = this.svc;
    if (now - this.lastInputAt < 2000 || tweens.active > 0 || !starfield.calm) return false;
    if (world.res.camera.trauma > 0) return false;
    return world.query(Particle).length === 0 && world.query(Lifetime).length === 0;
  }

  start(): void {
    const touch = () => (this.lastInputAt = performance.now());
    for (const type of ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const) window.addEventListener(type, touch, { passive: true, capture: true });
    let skipped = false;
    const frame = (now: number) => {
      requestAnimationFrame(frame);
      // В покое пропускаем каждый второй кадр; dt копится, мерцание идёт с той же скоростью
      if (!skipped && this.idle(now)) {
        skipped = true;
        return;
      }
      skipped = false;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      const start = performance.now();
      this.tick(dt);
      this.svc.renderer.observeFrame((performance.now() - start) / 1000);
    };
    requestAnimationFrame(frame);
    void this.goMenu().then(() => this.platform.ready());
    void this.refreshPurchases();
  }

  /** Сверить купленное с площадкой (возвраты, покупки с другого устройства). */
  async refreshPurchases(): Promise<void> {
    const list = await this.platform.payments?.owned().catch(() => null);
    if (list) this.purchases.replace(list);
  }

  /** Купить товар каталога средствами площадки. */
  async purchase(productId: string): Promise<PurchaseResult | 'unavailable'> {
    const payments = this.platform.payments;
    if (!payments) {
      track('purchase_result', { product: productId, result: 'unavailable' });
      return 'unavailable';
    }
    track('purchase_start', { product: productId });
    this.adPlaying = true;
    this.svc.audio.setMuted(true);
    const result = await payments.buy(productId).catch((): PurchaseResult => 'failed');
    this.adPlaying = false;
    this.svc.audio.setMuted(document.hidden);
    track('purchase_result', { product: productId, result });
    if (result === 'paid') this.purchases.add(productId);
    return result;
  }

  /** Можно ли носить предмет внешнего вида: бесплатный или куплен. */
  canWear(slot: 'back' | 'sky', id: string): boolean {
    return isFreeCosmetic(slot, id) || this.purchases.has(`${slot}:${id}`);
  }

  /** Выбранные рубашка и небо — если куплены, иначе обычные. */
  applyCosmetics(): void {
    const back = this.canWear('back', this.settings.cardBack) ? this.settings.cardBack : 'classic';
    setCardBack(back);
    const sky = this.canWear('sky', this.settings.skyTheme) ? this.settings.skyTheme : 'night';
    this.svc.starfield.setTheme(sky, skyTheme(sky).palette, SKY_THEMES.findIndex((t) => t.id === sky));
  }

  /** Атлас убирает межстраничную рекламу и рекламу перед «вторым шансом». */
  get adFree(): boolean {
    return this.purchases.has('atlas');
  }

  // ─── Экраны ─────────────────────────────────────────────────────────────

  private navToken = 0;

  /** Показывает экран, если за время загрузки модуля не начался другой переход. */
  private showIf(token: number, make: () => Screen): void {
    if (token === this.navToken) this.show(make());
  }

  show(screen: Screen): void {
    hideTooltip();
    this.screen?.unmount();
    this.root.replaceChildren();
    this.screen = screen;
    screen.mount(this.root);
  }

  async goMenu(): Promise<void> {
    this.platform.gameplayStop();
    const token = ++this.navToken;
    const { MenuScreen } = await import('@/ui/screens/menu');
    this.svc.starfield.setPalette(0);
    this.showIf(token, () => new MenuScreen(this));
  }

  /** «Звёздный атлас»: что внутри, покупка, примерочная, поддержка. */
  async goAtlas(from: string, focus?: string): Promise<void> {
    this.platform.gameplayStop();
    track('store_open', { from });
    const token = ++this.navToken;
    document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
    const { AtlasScreen } = await import('@/ui/screens/atlas');
    this.showIf(token, () => new AtlasScreen(this, focus));
  }

  /** Архив вызовов дня (входит в атлас). */
  async goArchive(): Promise<void> {
    this.platform.gameplayStop();
    const token = ++this.navToken;
    const { ArchiveScreen } = await import('@/ui/screens/archive');
    this.showIf(token, () => new ArchiveScreen(this));
  }

  /** Экран по фазе забега — единственное место, где решается «что показывать». */
  async route(): Promise<void> {
    const run = this.run;
    if (!run) return this.goMenu();
    if (run.phase === 'night') this.platform.gameplayStart();
    else this.platform.gameplayStop();
    const token = ++this.navToken;
    this.svc.starfield.setPalette(run.ante - 1);
    switch (run.phase) {
      case 'map': {
        const { MapScreen } = await import('@/ui/screens/map');
        return this.showIf(token, () => new MapScreen(this, run));
      }
      case 'night':
      case 'reward':
      case 'gameOver': {
        const { NightScreen } = await import('@/ui/screens/night');
        return this.showIf(token, () => new NightScreen(this, run));
      }
      case 'shop': {
        const { ShopScreen } = await import('@/ui/screens/shop');
        return this.showIf(token, () => new ShopScreen(this, run));
      }
      case 'victory': {
        const { NightScreen } = await import('@/ui/screens/night');
        return this.showIf(token, () => new NightScreen(this, run));
      }
      default:
        return this.unknownPhase(run.phase);
    }
  }

  /** Фаза, которой эта сборка не знает (забег из облака от новой версии): в меню, а не пустой экран. */
  private unknownPhase(phase: never): Promise<void> {
    reportError(`Unknown run phase: ${String(phase)}`, 'App.route');
    return this.goMenu();
  }

  /** Из Обсерватории — посмотреть следующую ночь на карте и вернуться. */
  async peekMap(): Promise<void> {
    const run = this.run;
    if (!run) return;
    document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
    const token = ++this.navToken;
    const { MapScreen } = await import('@/ui/screens/map');
    this.showIf(token, () => new MapScreen(this, run, true));
  }

  // ─── Забег ──────────────────────────────────────────────────────────────

  /** `seed` — переиграть тот же расклад (после поражения); иначе случайный. */
  startRun(skyId: string, daily = false, stake = 0, seed?: number): void {
    // Из обучения — сначала вернуть настоящее сохранение, чтобы его не затереть молча
    if (this.run?.tutorial) this.endTutorial();
    // Перезаписываемый забег засчитывается как сданный
    if (this.hasSave && this.run) recordRunEnd(this.profile, this.run, false);
    if (daily) markDailyStarted(this.profile);
    this.persistProfile();
    const runSeed = daily ? dailySeed() : (seed ?? (Math.random() * 2 ** 32) >>> 0);
    // Самый первый забег начинается со щедрой ночи и с тем, что заработано в обучении
    const gentle = !daily && this.profile.runs === 0;
    const gift = gentle ? this.profile.tutorialGift : undefined;
    this.run = newRun({ seed: runSeed, skyId, daily, dailyDate: daily ? todayKey() : undefined, stake: daily ? 0 : stake, gentle, gift });
    // Подарок — один раз: в первый забег или никогда (первым сыгран вызов дня)
    if (!daily || this.profile.runs > 0) delete this.profile.tutorialGift;
    track('run_start', { sky: skyId, stake: daily ? 0 : stake, daily, gentle, gift: !!gift, replay: seed !== undefined });
    this.save();
    void this.route();
  }

  /**
   * Вызов друга: тот же сид, небо и звёздность, что были у него. Без щедрой первой ночи
   * и без подарка обучения — иначе расклад другой и сравнивать нечестно. Подарок не тратится.
   */
  startChallenge(c: Challenge): void {
    if (this.run?.tutorial) this.endTutorial();
    if (this.hasSave && this.run) recordRunEnd(this.profile, this.run, false);
    this.persistProfile();
    this.run = newRun({ seed: c.seed, skyId: c.skyId, stake: c.stake });
    this.run.challenge = { ante: c.ante, best: c.best };
    track('challenge_accept', { ante: c.ante, best: c.best });
    track('run_start', { sky: c.skyId, stake: c.stake, daily: false, challenge: true });
    this.save();
    void this.route();
  }

  /** Вызов прошедшего дня из архива атласа: тот же сид, что был в тот день. */
  startArchive(date: string): void {
    if (this.run?.tutorial) this.endTutorial();
    if (this.hasSave && this.run) recordRunEnd(this.profile, this.run, false);
    this.persistProfile();
    this.run = newRun({ seed: dailySeed(date), skyId: 'classic', daily: true, dailyDate: date, archive: true });
    track('run_start', { sky: 'classic', stake: 0, daily: true, archive: true });
    this.save();
    void this.route();
  }

  /** Кнопки фаз могут нажать дважды, пока закрывается модалка: второе нажатие — тихо игнорируем. */
  private guarded(fn: () => void): boolean {
    // Забега уже нет (обучение закончилось, пока на экране висело его окно) — кнопке нечего делать
    if (!this.run) return false;
    try {
      fn();
      return true;
    } catch (e) {
      if (!(e instanceof RuleError)) throw e;
      return false;
    }
  }

  beginNight(): void {
    this.guarded(() => this.doBeginNight());
  }

  private doBeginNight(): void {
    const run = this.run!;
    startNight(run);
    if (run.tutorial) applyTutorialNight(run, run.nightIndex);
    else track('night_start', { ante: run.ante, night: run.night!.kind, boss: run.night!.bossId ?? '', gentle: !!run.night!.gentle });
    markSeen(this.profile, run);
    this.persistProfile();
    this.save();
    void this.route();
  }

  /** Действие ночи. Ошибки правил превращаются в подсказку. */
  act(action: NightAction): GameEvent[] | null {
    const run = this.run;
    if (!run) return null;
    try {
      const events = action.kind === 'place' ? placeCard(run, action.handIndex, action.cell) : burnCard(run, action.handIndex);
      this.afterAction(events);
      return events;
    } catch (e) {
      if (e instanceof RuleError) {
        toast(t(`errors.${e.code}`), 'warn');
        return null;
      }
      throw e;
    }
  }

  private afterAction(events: GameEvent[]): void {
    const run = this.run!;
    const lost = events.some((e) => e.t === 'nightLost');
    const won = events.some((e) => e.t === 'nightWon');
    if ((lost || won) && !run.tutorial) this.trackNightEnd(won);
    if (run.tutorial) {
      // Учебную ночь проиграть почти нельзя, но если вышло — начинаем обучение заново
      return;
    }
    if (lost) {
      this.trackRunEnd('lost');
      this.bestBefore = this.profile.bestPlacement;
      const fresh = recordRunEnd(this.profile, run, false);
      this.persistProfile();
      this.announceUnlocks(fresh);
      storage.remove(KEYS.run);
      return;
    }
    this.save();
  }

  private trackNightEnd(won: boolean): void {
    const run = this.run!;
    const n = run.night!;
    track('night_end', {
      ante: run.ante,
      night: n.kind,
      boss: n.bossId ?? '',
      won,
      score: n.score,
      target: n.target,
      ratio: Math.round((n.score / n.target) * 100) / 100,
      moves_left: n.movesLeft,
      burns_left: n.burnsLeft,
      lines: n.linesIgnited,
    });
  }

  private trackRunEnd(result: 'lost' | 'abandon' | 'victory'): void {
    const run = this.run!;
    track('run_end', {
      result,
      ante: run.ante,
      nights: run.stats.nightsWon,
      lines: run.stats.linesIgnited,
      best: run.stats.bestPlacement,
      crosses: run.stats.crosses,
      omens: run.omens.map((o) => o.id).join(','),
    });
    if (run.challenge && result !== 'abandon') {
      const ante = result === 'victory' ? 9 : run.ante;
      const c = run.challenge;
      track('challenge_result', { ante, best: run.stats.bestPlacement, their_ante: c.ante, their_best: c.best, outcome: compareToChallenge(c, ante, run.stats.bestPlacement) });
    }
  }

  collectReward(): void {
    this.guarded(() => this.doCollectReward());
  }

  private doCollectReward(): void {
    const run = this.run!;
    collectReward(run);
    if (run.tutorial) run.shop = tutorialShop();
    this.save();
    void this.route();
  }

  leaveShop(): void {
    this.guarded(() => this.doLeaveShop());
  }

  private doLeaveShop(): void {
    const run = this.run!;
    leaveShop(run);
    if (run.tutorial) {
      // В обучении карту созвездия пропускаем — сразу вторая ночь
      this.doBeginNight();
      return;
    }
    if (run.phase === 'victory') {
      this.trackRunEnd('victory');
      this.bestBefore = this.profile.bestPlacement;
      const fresh = recordRunEnd(this.profile, run, true);
      this.announceUnlocks(fresh);
    } else {
      this.announceUnlocks(recordProgress(this.profile, run));
    }
    this.persistProfile();
    this.save();
    // Межстраничная реклама — только в паузе между созвездиями и только где она есть
    // (раньше событие уходило и из Telegram, где рекламы нет: «32 показа» в сводке)
    if (run.phase === 'map' && run.nightIndex === 0 && !this.adFree && this.platform.interstitialAvailable
      && interstitialAllowed(Date.now(), this.profile.firstSeen ?? 0, this.lastAdAt)) {
      track('ad_request', { kind: 'interstitial', placement: 'between_antes' });
      this.lastAdAt = Date.now();
      void this.platform.showInterstitial().then(() => this.route());
      return;
    }
    void this.route();
  }

  /** Действие в Обсерватории: ошибки правил — подсказкой, успех — сохранение. */
  shopAction(fn: (run: RunState) => void): boolean {
    const run = this.run;
    if (!run) return false;
    try {
      fn(run);
      this.save();
      return true;
    } catch (e) {
      if (e instanceof RuleError) {
        toast(t(`errors.${e.code}`), 'warn');
        return false;
      }
      throw e;
    }
  }

  continueEndless(): void {
    if (!this.guarded(() => continueEndless(this.run!))) return;
    this.save();
    void this.route();
  }

  abandonRun(): void {
    if (this.run?.tutorial) return this.skipTutorial();
    if (this.run && this.run.phase !== 'gameOver' && this.run.phase !== 'victory') {
      this.trackRunEnd('abandon');
      recordRunEnd(this.profile, this.run, false);
      this.persistProfile();
    }
    this.run = null;
    storage.remove(KEYS.run);
    void this.goMenu();
  }

  save(): void {
    const run = this.run;
    if (!run || run.phase === 'gameOver' || run.tutorial) return;
    storage.set(KEYS.run, serializeRun(run));
    this.scheduleCloudSave();
  }

  private cloudTimer = 0;

  /** Профиль на устройство и (с задержкой) в облако площадки. */
  persistProfile(): void {
    saveProfile(this.profile);
    this.scheduleCloudSave();
  }

  /** Облачное сохранение площадки — не чаще раза в пару секунд. */
  scheduleCloudSave(): void {
    window.clearTimeout(this.cloudTimer);
    this.cloudTimer = window.setTimeout(() => this.flushCloudSave(), 2000);
  }

  /** Отправить в облако сразу (вкладку сворачивают — таймер может не дожить). */
  private flushCloudSave(): void {
    window.clearTimeout(this.cloudTimer);
    const data: Record<string, string> = {};
    for (const key of [KEYS.run, KEYS.profile, KEYS.settings]) {
      const value = storage.get(key);
      if (value) data[key] = value;
    }
    void this.platform.cloudSave(data);
  }

  /** Реклама за награду с учётом в аналитике. */
  private async rewarded(placement: string): Promise<boolean> {
    track('ad_request', { kind: 'rewarded', placement });
    this.lastAdAt = Date.now();
    const ok = await this.platform.showRewarded().catch(() => false);
    track('ad_result', { kind: 'rewarded', placement, result: ok ? 'rewarded' : 'closed' });
    return ok;
  }

  /** Второй шанс после поражения — за просмотр рекламы. */
  async revive(): Promise<boolean> {
    const run = this.run;
    if (!run || !canRevive(run)) return false;
    const ok = this.adFree || (await this.rewarded('revive'));
    if (!ok || !canRevive(run)) return false;
    reviveNight(run);
    // Поражение уже записали в профиль — забег продолжается, запись отменяем
    unrecordRunEnd(this.profile, run);
    this.persistProfile();
    this.save();
    void this.route();
    return true;
  }

  /** Удвоить награду ночи — за просмотр рекламы. */
  async doubleReward(): Promise<boolean> {
    const run = this.run;
    if (!run || !canDoubleReward(run)) return false;
    const ok = await this.rewarded('double_reward');
    if (!ok || !canDoubleReward(run)) return false;
    doubleReward(run);
    this.save();
    return true;
  }

  get hasSave(): boolean {
    return !!this.run && !this.run.tutorial && this.run.phase !== 'gameOver' && this.run.phase !== 'victory';
  }

  // ─── Обучение ───────────────────────────────────────────────────────────

  tutorial: TutorialDirector | null = null;

  /** Учебный забег не трогает сохранённый настоящий: тот вернётся после обучения. */
  startTutorial(source: 'offer' | 'menu' | 'retry' = 'menu'): void {
    track('tutorial_start', { source });
    // Обучение ведёт сам режиссёр — плашки первых забегов ему мешают
    clearCoach();
    this.tutorial?.stop();
    document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
    this.run = newTutorialRun();
    this.tutorial = new TutorialDirector(this);
    this.tutorial.start();
    this.doBeginNight();
  }

  private endTutorial(): void {
    this.tutorial?.stop();
    this.tutorial = null;
    this.profile.tutorialDone = true;
    this.persistProfile();
    this.run = deserializeRun(storage.get(KEYS.run));
  }

  skipTutorial(): void {
    const at = this.tutorial?.progress ?? { step: '', index: 0 };
    track('tutorial_skip', at);
    this.endTutorial();
    void this.goMenu();
  }

  /** Обучение пройдено: поздравление и старт настоящего забега. */
  finishTutorial(): void {
    track('tutorial_complete', {});
    this.profile.tutorialFinished = true;
    // Золото обучения (с несобранной наградой) ждёт первого настоящего забега;
    // Знамения игрок заработает там сам
    const tut = this.run;
    if (tut?.tutorial && this.profile.runs === 0) {
      this.profile.tutorialGift = { gold: Math.min(GIFT_GOLD_CAP, tut.gold + (tut.reward?.total ?? 0)) };
    }
    this.endTutorial();
    // Окно награды учебной ночи ещё открыто: под «Обучение пройдено» его кнопка «Забрать»
    // оставалась нажимаемой и вела в уже несуществующий забег (js_error 14.10.2026)
    document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
    this.svc.audio.win();
    void import('@/ui/screens/tutorial-done').then(({ showTutorialDone }) => showTutorialDone(this));
  }

  private announceUnlocks(ids: string[]): void {
    for (const id of ids) {
      window.setTimeout(() => toast(t('over.unlocked', { name: named('sky', id).name })), 600);
    }
  }

  // ─── Настройки ──────────────────────────────────────────────────────────

  applySettings(next: Settings): void {
    const langChanged = next.lang !== this.settings.lang;
    this.settings = next;
    saveSettings(next);
    setLang(next.lang);
    this.svc.audio.setVolumes(next.sfx, next.music);
    this.svc.world.res.speed = SPEEDS[next.speed] ?? 1;
    this.svc.world.res.reduceMotion = next.reduceMotion;
    document.documentElement.classList.toggle('calm', next.reduceMotion);
    document.documentElement.classList.toggle('large-text', next.largeText);
    this.svc.haptics.enabled = next.haptics;
    const adaptive = next.quality !== 'max';
    if (adaptive !== this.svc.renderer.adaptive) {
      this.svc.renderer.adaptive = adaptive;
      if (!adaptive) this.svc.renderer.resetQuality();
    }
    if (langChanged) clearSigilCache();
    this.applyCosmetics();
  }

  resetProgress(): void {
    storage.remove(KEYS.run);
    storage.remove(KEYS.profile);
    forgetClientId();
    window.clearTimeout(this.cloudTimer);
    void this.platform.cloudSave({});
    this.run = null;
    this.profile = loadProfile();
    void this.goMenu();
  }
}

/** Восстанавливает сохранения из облака площадки, если на устройстве их нет. */
async function restoreFromCloud(platform: Platform): Promise<void> {
  if (storage.get(KEYS.profile)) return;
  const data = await platform.cloudLoad().catch(() => null);
  if (!data) return;
  for (const [key, value] of Object.entries(data)) if (typeof value === 'string') storage.set(key, value);
}

export async function startGame(platform: Platform): Promise<App> {
  initAnalytics(platform.id);
  await restoreFromCloud(platform);
  const app = new App(platform);
  // Доступ к игре из консоли — только для разработки и e2e (SEC.7)
  if (import.meta.env.DEV) (window as unknown as { starweave: App }).starweave = app;
  // Ссылка с вызовом друга или с меткой рекламного источника (`startapp=src_<канал>`)
  const start = parseStartParam(platform.startParam?.());
  app.pendingChallenge = start.challenge ?? null;
  track('app_open', {
    platform: platform.id,
    lang: app.settings.lang,
    returning: app.profile.runs > 0 || app.profile.tutorialDone,
    ...(start.source ? { source: start.source } : {}),
    ...(start.challenge ? { challenge: true } : {}),
  });
  app.start();
  // FPS меряем, когда игрок уже в игре, а не на загрузке
  window.setTimeout(() => measureFps(5), 30_000);
  return app;
}
