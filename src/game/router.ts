import { reportError, track } from '@/analytics';
import { hideTooltip } from '@/ui/widgets';
import type { App } from './app';

/** Экран: DOM-слой плюс, возможно, сущности на канвасе. */
export interface Screen {
  mount(root: HTMLElement): void;
  unmount(): void;
}

/**
 * Навигация: какой экран на странице. Модули экранов грузятся лениво; переход, который
 * обогнал другой, пока модуль загружался, побеждает (`navToken`).
 */
export class Router {
  private screen: Screen | null = null;
  private navToken = 0;

  constructor(private readonly app: App, private readonly root: HTMLElement) {}

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
    this.app.platform.gameplayStop();
    const token = ++this.navToken;
    const { MenuScreen } = await import('@/ui/screens/menu');
    this.app.svc.starfield.setPalette(0);
    this.showIf(token, () => new MenuScreen(this.app));
  }

  /** «Звёздный атлас»: что внутри, покупка, примерочная, поддержка. */
  async goAtlas(from: string, focus?: string): Promise<void> {
    this.app.platform.gameplayStop();
    track('store_open', { from });
    const token = ++this.navToken;
    document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
    const { AtlasScreen } = await import('@/ui/screens/atlas');
    this.showIf(token, () => new AtlasScreen(this.app, focus));
  }

  /** Архив вызовов дня (входит в атлас). */
  async goArchive(): Promise<void> {
    this.app.platform.gameplayStop();
    const token = ++this.navToken;
    const { ArchiveScreen } = await import('@/ui/screens/archive');
    this.showIf(token, () => new ArchiveScreen(this.app));
  }

  /** Экран по фазе забега — единственное место, где решается «что показывать». */
  async route(): Promise<void> {
    const { app } = this;
    const run = app.run;
    if (!run) return this.goMenu();
    if (run.phase === 'night') app.platform.gameplayStart();
    else app.platform.gameplayStop();
    const token = ++this.navToken;
    app.svc.starfield.setPalette(run.ante - 1);
    switch (run.phase) {
      case 'map': {
        const { MapScreen } = await import('@/ui/screens/map');
        return this.showIf(token, () => new MapScreen(app, run));
      }
      case 'night':
      case 'reward':
      case 'gameOver':
      case 'victory': {
        const { NightScreen } = await import('@/ui/screens/night');
        return this.showIf(token, () => new NightScreen(app, run));
      }
      case 'shop': {
        const { ShopScreen } = await import('@/ui/screens/shop');
        return this.showIf(token, () => new ShopScreen(app, run));
      }
      default:
        return this.unknownPhase(run.phase);
    }
  }

  /** Фаза, которой эта сборка не знает (забег из облака от новой версии): в меню, а не пустой экран. */
  private unknownPhase(phase: never): Promise<void> {
    reportError(`Unknown run phase: ${String(phase)}`, 'Router.route');
    return this.goMenu();
  }

  /** Из Обсерватории — посмотреть следующую ночь на карте и вернуться. */
  async peekMap(): Promise<void> {
    const run = this.app.run;
    if (!run) return;
    document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
    const token = ++this.navToken;
    const { MapScreen } = await import('@/ui/screens/map');
    this.showIf(token, () => new MapScreen(this.app, run, true));
  }
}
