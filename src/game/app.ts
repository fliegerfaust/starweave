import { clearCardCache } from '@/art/card';
import { clearSigilCache } from '@/art/sigil';
import { RuleError } from '@/core/errors';
import { burnCard, placeCard, startNight } from '@/core/night';
import { collectReward, continueEndless, leaveShop, newRun } from '@/core/run';
import { deserializeRun, serializeRun } from '@/core/save';
import type { GameEvent, RunState } from '@/core/types';
import { Synth } from '@/engine/audio';
import { World } from '@/engine/ecs';
import { PointerInput } from '@/engine/input';
import { Renderer } from '@/engine/renderer';
import { Tweener } from '@/engine/tween';
import { named, setLang, t } from '@/i18n';
import { dailySeed, loadProfile, markSeen, recordProgress, recordRunEnd, saveProfile, type Profile } from '@/meta/profile';
import { SPEEDS, loadSettings, saveSettings, type Settings } from '@/meta/settings';
import { KEYS, storage } from '@/meta/storage';
import { h } from '@/ui/dom';
import { setUiSound, toast } from '@/ui/widgets';
import { Drawable, Layer, Transform, transform } from './components';
import type { Resources, Services } from './context';
import type { NightAction } from './night/scene';
import { isLandscape } from './layout';
import { Starfield } from './starfield';
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

  constructor() {
    this.settings = loadSettings();
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
    this.svc = { world, renderer, tweens, audio, input, starfield };

    setUiSound((s) => {
      audio.unlock();
      if (s === 'click') audio.click();
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
      if (document.hidden) this.save();
    });
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

  start(): void {
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.tick(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    void this.goMenu();
  }

  // ─── Экраны ─────────────────────────────────────────────────────────────

  show(screen: Screen): void {
    this.screen?.unmount();
    this.root.replaceChildren();
    this.screen = screen;
    screen.mount(this.root);
  }

  async goMenu(): Promise<void> {
    const { MenuScreen } = await import('@/ui/screens/menu');
    this.svc.starfield.setPalette(0);
    this.show(new MenuScreen(this));
  }

  /** Экран по фазе забега — единственное место, где решается «что показывать». */
  async route(): Promise<void> {
    const run = this.run;
    if (!run) return this.goMenu();
    this.svc.starfield.setPalette(run.ante - 1);
    switch (run.phase) {
      case 'map': {
        const { MapScreen } = await import('@/ui/screens/map');
        return this.show(new MapScreen(this, run));
      }
      case 'night':
      case 'reward':
      case 'gameOver': {
        const { NightScreen } = await import('@/ui/screens/night');
        return this.show(new NightScreen(this, run));
      }
      case 'shop': {
        const { ShopScreen } = await import('@/ui/screens/shop');
        return this.show(new ShopScreen(this, run));
      }
      case 'victory': {
        const { NightScreen } = await import('@/ui/screens/night');
        return this.show(new NightScreen(this, run));
      }
    }
  }

  // ─── Забег ──────────────────────────────────────────────────────────────

  startRun(skyId: string, daily = false): void {
    const seed = daily ? dailySeed() : (Math.random() * 2 ** 32) >>> 0;
    this.run = newRun({ seed, skyId, daily });
    this.save();
    void this.route();
  }

  beginNight(): void {
    const run = this.run!;
    startNight(run);
    markSeen(this.profile, run);
    saveProfile(this.profile);
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
    if (lost) {
      const fresh = recordRunEnd(this.profile, run, false);
      saveProfile(this.profile);
      this.announceUnlocks(fresh);
      storage.remove(KEYS.run);
      return;
    }
    this.save();
  }

  collectReward(): void {
    collectReward(this.run!);
    this.save();
    void this.route();
  }

  leaveShop(): void {
    const run = this.run!;
    leaveShop(run);
    if (run.phase === 'victory') {
      const fresh = recordRunEnd(this.profile, run, true);
      this.announceUnlocks(fresh);
    } else {
      this.announceUnlocks(recordProgress(this.profile, run));
    }
    saveProfile(this.profile);
    this.save();
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
    continueEndless(this.run!);
    this.save();
    void this.route();
  }

  abandonRun(): void {
    if (this.run && this.run.phase !== 'gameOver' && this.run.phase !== 'victory') {
      recordRunEnd(this.profile, this.run, false);
      saveProfile(this.profile);
    }
    this.run = null;
    storage.remove(KEYS.run);
    void this.goMenu();
  }

  save(): void {
    const run = this.run;
    if (!run || run.phase === 'gameOver') return;
    storage.set(KEYS.run, serializeRun(run));
  }

  get hasSave(): boolean {
    return !!this.run && this.run.phase !== 'gameOver' && this.run.phase !== 'victory';
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
    if (langChanged) clearSigilCache();
  }

  resetProgress(): void {
    storage.remove(KEYS.run);
    storage.remove(KEYS.profile);
    this.run = null;
    this.profile = loadProfile();
    void this.goMenu();
  }
}

export function startGame(): void {
  const app = new App();
  (window as unknown as { starweave: App }).starweave = app;
  app.start();
}
