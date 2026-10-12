/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Площадка сборки: `yandex` или пусто (обычный веб). */
  readonly VITE_PLATFORM?: string;
  /** Номер счётчика Яндекс Метрики; без него аналитика выключена. */
  readonly VITE_METRIKA_ID?: string;
}

/** Версия из package.json, подставляет Vite. */
declare const __APP_VERSION__: string;

declare module '*.md?raw' {
  const text: string;
  export default text;
}
