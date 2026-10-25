import { clearCardCache } from '@/art/card';
import { clearSigilCache } from '@/art/sigil';
import type { RunState } from '@/core/types';
import { Synth } from '@/engine/audio';
import { Haptics } from '@/engine/haptics';
import { World } from '@/engine/ecs';
import { PointerInput } from '@/engine/input';
import { Renderer } from '@/engine/renderer';
import { Tweener } from '@/engine/tween';
import { setLang } from '@/i18n';
import { loadProfile, type Profile } from '@/meta/profile';
import { SPEEDS, loadSettings, saveSettings, type Settings } from '@/meta/settings';
import { restoreFromCloud } from '@/meta/cloud-restore';
import { KEYS, storage } from '@/meta/storage';
import { h } from '@/ui/dom';
import { setUiSound } from '@/ui/widgets';
import { Drawable, Layer, Lifetime, Particle, Transform, transform } from './components';
import type { Resources, Services } from './context';
import { isLandscape } from './layout';
import { Starfield } from './starfield';
import { parseStartParam, type Challenge } from './challenge';
import { initAnalytics, measureFps, track } from '@/analytics';
import { resolveFeatures, type Features, type Platform } from '@/platform';
import { cameraSystem } from './systems/camera';
import { particleSystem } from './systems/particles';
import { renderSystem } from './systems/render';
import { Monetization } from './monetization';
import { Router } from './router';
import { RunController } from './run-controller';

export type { Screen } from './router';

/**
 * Корень игры: собирает движок и сервисы, держит настройки и профиль. Остальное — у частей:
 * `router` — экраны, `runs` — забег, сохранения и обучение, `money` — покупки и реклама.
 */
export class App {
  readonly svc: Services;
  settings: Settings;
  profile: Profile;
  readonly router: Router;
  readonly runs: RunController;
  readonly money: Monetization;
  /** Переключатели нового поведения площадки (0.7.4); в разработке — ещё и `?ff=`. */
  readonly features: Features;
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
    this.features = resolveFeatures(platform.features, import.meta.env.DEV ? new URLSearchParams(location.search).get('ff') : null);
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
    // Звучание «Обсерватория» (CQ.7) — только где включено `music`
    audio.voice = this.features.music;
    audio.setVolumes(this.settings.sfx, this.settings.music);
    const input = new PointerInput(stage);
    const haptics = new Haptics();
    haptics.enabled = this.settings.haptics;
    renderer.adaptive = this.settings.quality !== 'max';
    this.svc = { world, renderer, tweens, audio, input, starfield, haptics };
    this.money = new Monetization(this);
    this.money.applyCosmetics();

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

    const root = h('div.screen-root');
    document.getElementById('ui')!.append(root);
    this.router = new Router(this, root);
    this.runs = new RunController(this);
  }

  /** Вызов из ссылки, которым открыли игру: меню покажет его один раз. */
  pendingChallenge: Challenge | null = null;

  /** Текущий забег (владеет им `runs`). */
  get run(): RunState | null {
    return this.runs.run;
  }

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
    // Новичок на площадке с `quickStart` попадает сразу в ночь, остальные — в меню
    void (this.runs.firstLaunch() ? Promise.resolve() : this.router.goMenu()).then(() => this.platform.ready());
    void this.money.refreshPurchases();
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
    this.money.applyCosmetics();
  }
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
