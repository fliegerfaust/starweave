import type { Lang } from '@/i18n';
import type { Feature } from './features';

export type PurchaseResult = 'paid' | 'cancelled' | 'failed';

/** Покупки средствами площадки: Telegram Stars, Яндекс, позже сторы. */
export interface Payments {
  /** Подписи цен для показа: товар → «250 ⭐». Товара нет — на этой площадке он не продаётся. */
  prices(): Promise<Record<string, string>>;
  /** Купленное навсегда по данным площадки; null — узнать не удалось (сеть), верим кэшу. */
  owned(): Promise<string[] | null>;
  buy(productId: string): Promise<PurchaseResult>;
}

/**
 * Площадка, на которой запущена игра: веб, Яндекс Игры, Пикабу Игры, позже — сторы.
 * Игра знает только этот интерфейс; конкретный SDK живёт в адаптере.
 */
export interface Platform {
  readonly id: 'web' | 'yandex' | 'telegram' | 'crazygames' | 'pikabu';
  /** Есть ли реклама за награду (кнопки «второй шанс» показываются только тогда). */
  readonly rewardedAvailable: boolean;
  /** Есть ли межстраничная реклама: без неё игра не просит показ и не пишет его в аналитику. */
  readonly interstitialAvailable: boolean;
  /** Покупки; null — площадка их не поддерживает (обычный сайт). */
  readonly payments: Payments | null;
  /**
   * Товары, открытые на площадке бесплатно (CrazyGames запрещает свои покупки — атлас там
   * даром). Магазина на такой площадке нет: вкладка «Поддержать» скрыта. Рекламу дар не убирает.
   */
  readonly grants?: readonly string[];
  /** Новое поведение, включённое на площадке (см. `features.ts`); остальные площадки его не видят. */
  readonly features?: readonly Feature[];
  init(): Promise<void>;
  /** Игра загрузилась и готова к игре. */
  ready(): void;
  /** Игрок играет / не играет — порталы учитывают это для рекламы и аналитики. */
  gameplayStart(): void;
  gameplayStop(): void;
  /** Межстраничная реклама в паузе между созвездиями. */
  showInterstitial(): Promise<void>;
  /** Реклама за награду: true — досмотрел, награду выдаём. */
  showRewarded(): Promise<boolean>;
  /** Язык, который определила площадка. */
  language(): Lang | null;
  cloudLoad(): Promise<Record<string, string> | null>;
  cloudSave(data: Record<string, string>): Promise<void>;
  /** Площадка просит паузу (реклама, сворачивание) и разрешает продолжить. */
  onPauseChange(fn: (paused: boolean) => void): void;
  /**
   * Поделиться своими средствами площадки; false — площадка не умеет, игра делится сама.
   * `startParam` — что откроется у получателя по ссылке (вызов с тем же раскладом).
   */
  share?(text: string, startParam?: string): boolean;
  /** Площадка сама глушит звук (настройка сайта) — сильнее настроек игры. */
  onMuteChange?(fn: (muted: boolean) => void): void;
  /** Ссылка на вызов друга, если площадка ведёт на свою страницу игры, а не на наш сайт. */
  inviteUrl?(startParam: string): string | null;
  /** «Счастливый момент» (победа в забеге) — порталы учитывают его в рекомендациях. */
  happytime?(): void;
  /** Параметр запуска из ссылки (`?startapp=` / Telegram `start_param`): вызов друга или метка источника. */
  startParam?(): string | null;
}
