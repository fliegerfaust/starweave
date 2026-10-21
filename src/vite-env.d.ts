/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Площадка сборки: `yandex`, `crazygames` или пусто (обычный веб). */
  readonly VITE_PLATFORM?: string;
  /** Номер счётчика Яндекс Метрики; без него аналитика выключена. */
  readonly VITE_METRIKA_ID?: string;
  /** Адрес приёма событий своего сервера, например `https://game.denvalclass.ru/v1/events`. */
  readonly VITE_EVENTS_URL?: string;
  /** Свой сервер (покупки); по умолчанию — адрес из VITE_EVENTS_URL без пути. */
  readonly VITE_API_URL?: string;
  /** Прямая ссылка на Mini App (`https://t.me/<бот>/<приложение>`) — для «Поделиться» в Telegram. */
  readonly VITE_TG_APP_LINK?: string;
  /** Ключ и идентификатор аналитики Telegram Mini Apps (выдаёт @DataChief_bot). */
  readonly VITE_TG_ANALYTICS_TOKEN?: string;
  readonly VITE_TG_ANALYTICS_APP?: string;
  /** Блок AdsGram (реклама за награду в Telegram); без него рекламы в Telegram нет. */
  readonly VITE_ADSGRAM_BLOCK_ID?: string;
  /** Блок AdsGram для межстраничной рекламы между главами (`int-…`). */
  readonly VITE_ADSGRAM_INTER_ID?: string;
  /** `1` — реклама CrazyGames включена (Full Launch); иначе её нет (Basic Launch). */
  readonly VITE_CG_ADS?: string;
}

/** Версия из package.json, подставляет Vite. */
declare const __APP_VERSION__: string;

declare module '*.md?raw' {
  const text: string;
  export default text;
}
