import type { Lang } from '@/i18n';

/**
 * Площадка, на которой запущена игра: веб, Яндекс Игры, позже — сторы.
 * Игра знает только этот интерфейс; конкретный SDK живёт в адаптере.
 */
export interface Platform {
  readonly id: 'web' | 'yandex' | 'telegram';
  /** Есть ли реклама за награду (кнопки «второй шанс» показываются только тогда). */
  readonly rewardedAvailable: boolean;
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
  /** Поделиться своими средствами площадки; false — площадка не умеет, игра делится сама. */
  share?(text: string): boolean;
}
