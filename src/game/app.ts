import { clearCardCache } from '@/art/card';
import { clearSigilCache } from '@/art/sigil';
import { RuleError } from '@/core/errors';
import { burnCard, placeCard, startNight } from '@/core/night';
import { canDoubleReward, canRevive, collectReward, continueEndless, doubleReward, leaveShop, newRun, reviveNight } from '@/core/run';
import { deserializeRun, serializeRun } from '@/core/save';
import type { GameEvent, RunState } from '@/core/types';
import { Synth } from '@/engine/audio';
import { Haptics } from '@/engine/haptics';
import { World } from '@/engine/ecs';
import { PointerInput } from '@/engine/input';
import { Renderer } from '@/engine/renderer';
import { Tweener } from '@/engine/tween';
import { named, setLang, t } from '@/i18n';
import { dailySeed, loadProfile, markDailyStarted, unrecordRunEnd, markSeen, recordProgress, recordRunEnd, saveProfile, type Profile } from '@/meta/profile';
import { SPEEDS, loadSettings, saveSettings, type Settings } from '@/meta/settings';
import { KEYS, storage } from '@/meta/storage';
import { h } from '@/ui/dom';
import { hideTooltip, setUiSound, toast } from '@/ui/widgets';
import { Drawable, Layer, Transform, transform } from './components';
import type { Resources, Services } from './context';
import type { NightAction } from './night/scene';
import { isLandscape } from './layout';
import { Starfield } from './starfield';
import { initAnalytics, measureFps, track } from '@/analytics';
import type { Platform } from '@/platform';
import { TutorialDirector } from '@/tutorial/director';
import { applyTutorialNight, newTutorialRun, tutorialShop } from '@/core/tutorial';
import { cameraSystem } from './systems/camera';
import { particleSystem } from './systems/particles';
import { renderSystem } from './systems/render';

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
  private screen: Screen | null = null;
  private readonly root: HTMLElement;
  private last = performance.now();

  constructor(readonly platform: Platform) {
    this.settings = loadSettings();
    // Язык площадки важнее языка браузера, пока игрок сам его не выбрал
    if (!storage.get(KEYS.settings) && platform.language()) this.settings.lang = platform.language()!;
    setLang(this.settings.lang);
    this.profile = loadProfile();
    const canvas = document.getElementById('stage') as HTMLCanvasElement;
    const renderer = new Renderer(canvas);
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
    starfield.resize(renderer.width, renderer.height);
    const updateOrientation = () => document.body.classList.toggle('landscape', isLandscape(renderer.width, renderer.height));
    updateOrientation();
    renderer.onResize(() => {
      updateOrientation();
      starfield.resize(renderer.width, renderer.height);
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
    const input = new PointerInput(canvas);
    const haptics = new Haptics();
    haptics.enabled = this.settings.haptics;
    this.svc = { world, renderer, tweens, audio, input, starfield, haptics };

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

  start(): void {
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.tick(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    void this.goMenu().then(() => this.platform.ready());
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
    }
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

  startRun(skyId: string, daily = false, stake = 0): void {
    // Из обучения — сначала вернуть настоящее сохранение, чтобы его не затереть молча
    if (this.run?.tutorial) this.endTutorial();
    // Перезаписываемый забег засчитывается как сданный
    if (this.hasSave && this.run) recordRunEnd(this.profile, this.run, false);
    if (daily) markDailyStarted(this.profile);
    this.persistProfile();
    const seed = daily ? dailySeed() : (Math.random() * 2 ** 32) >>> 0;
    this.run = newRun({ seed, skyId, daily, stake: daily ? 0 : stake });
    track('run_start', { sky: skyId, stake: daily ? 0 : stake, daily });
    this.save();
    void this.route();
  }

  /** Кнопки фаз могут нажать дважды, пока закрывается модалка: второе нажатие — тихо игнорируем. */
  private guarded(fn: () => void): boolean {
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
    else track('night_start', { ante: run.ante, night: run.night!.kind, boss: run.night!.bossId ?? '' });
    markSeen(this.profile, run);
    this.persistProfile();
    this.save();
    void this.route();
  }

  /** Действие ночи. Ошибки правил превращаются в подсказку. */
  act(action: NightAction): GameEvent[] | null {
    const run = this.run!;
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
      const fresh = recordRunEnd(this.profile, run, true);
      this.announceUnlocks(fresh);
    } else {
      this.announceUnlocks(recordProgress(this.profile, run));
    }
    this.persistProfile();
    this.save();
    // Межстраничная реклама — только в паузе между созвездиями
    if (run.phase === 'map' && run.nightIndex === 0) {
      track('ad_request', { kind: 'interstitial', placement: 'between_antes' });
      void this.platform.showInterstitial().then(() => this.route());
      return;
    }
    void this.route();
  }

  /** Действие в Обсерватории: ошибки правил — подсказкой, успех — сохранение. */
  shopAction(fn: (run: RunState) => void): boolean {
    try {
      fn(this.run!);
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
    const ok = await this.platform.showRewarded().catch(() => false);
    track('ad_result', { kind: 'rewarded', placement, result: ok ? 'rewarded' : 'closed' });
    return ok;
  }

  /** Второй шанс после поражения — за просмотр рекламы. */
  async revive(): Promise<boolean> {
    const run = this.run;
    if (!run || !canRevive(run)) return false;
    const ok = await this.rewarded('revive');
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
    this.endTutorial();
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
    this.svc.haptics.enabled = next.haptics;
    if (langChanged) clearSigilCache();
  }

  resetProgress(): void {
    storage.remove(KEYS.run);
    storage.remove(KEYS.profile);
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

export async function startGame(platform: Platform): Promise<void> {
  initAnalytics();
  await restoreFromCloud(platform);
  const app = new App(platform);
  (window as unknown as { starweave: App }).starweave = app;
  track('app_open', { platform: platform.id, lang: app.settings.lang, returning: app.profile.runs > 0 || app.profile.tutorialDone });
  app.start();
  // FPS меряем, когда игрок уже в игре, а не на загрузке
  window.setTimeout(() => measureFps(5), 30_000);
}
