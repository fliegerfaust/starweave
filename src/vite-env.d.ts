/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Площадка сборки: `yandex` или пусто (обычный веб). */
  readonly VITE_PLATFORM?: string;
  /** Номер счётчика Яндекс Метрики; без него аналитика выключена. */
  readonly VITE_METRIKA_ID?: string;
  /** Прямая ссылка на Mini App (`https://t.me/<бот>/<приложение>`) — для «Поделиться» в Telegram. */
  readonly VITE_TG_APP_LINK?: string;
  /** Ключ и идентификатор аналитики Telegram Mini Apps (выдаёт @DataChief_bot). */
  readonly VITE_TG_ANALYTICS_TOKEN?: string;
  readonly VITE_TG_ANALYTICS_APP?: string;
}

/** Версия из package.json, подставляет Vite. */
declare const __APP_VERSION__: string;

declare module '*.md?raw' {
  const text: string;
  export default text;
}
