/**
 * Товары за Telegram Stars — копия цен из `src/store/catalog.ts` игры (тест сверяет).
 * Сервер — единственный, кто выставляет счёт, поэтому цена отсюда и есть настоящая.
 */
export interface StarsProduct {
  stars: number;
  /** Навсегда (атлас, внешний вид) или разово (чаевые). */
  permanent: boolean;
  title: { ru: string; en: string };
  description: { ru: string; en: string };
}

export const STARS_PRODUCTS: Record<string, StarsProduct> = {
  atlas: {
    stars: 250,
    permanent: true,
    title: { ru: 'Звёздный атлас', en: 'Star Atlas' },
    description: {
      ru: 'Архив вызовов дня, колода «Астролябия», без межстраничной рекламы, рубашка и небо атласа. Навсегда.',
      en: 'Daily challenge archive, the Astrolabe sky, no interstitial ads, the Atlas card back and sky. Forever.',
    },
  },
  supporter: {
    stars: 500,
    permanent: true,
    title: { ru: 'Набор мецената', en: 'Patron Pack' },
    description: {
      ru: 'Всё из «Звёздного атласа» и набор мецената: рубашка и небо. Спасибо, что поддерживаешь игру!',
      en: 'Everything in the Star Atlas plus the Patron card back and sky. Thank you for supporting the game!',
    },
  },
  back_comet: {
    stars: 75,
    permanent: true,
    title: { ru: 'Рубашка «Комета»', en: 'Comet card back' },
    description: { ru: 'Внешний вид карт. На игру не влияет.', en: 'Card back style. Does not affect play.' },
  },
  back_aurora: {
    stars: 75,
    permanent: true,
    title: { ru: 'Рубашка «Сияние»', en: 'Aurora card back' },
    description: { ru: 'Внешний вид карт. На игру не влияет.', en: 'Card back style. Does not affect play.' },
  },
  sky_aurora: {
    stars: 75,
    permanent: true,
    title: { ru: 'Небо «Северное сияние»', en: 'Northern Lights sky' },
    description: { ru: 'Фон игры. На игру не влияет.', en: 'Game background. Does not affect play.' },
  },
  sky_ember: {
    stars: 75,
    permanent: true,
    title: { ru: 'Небо «Тлеющий закат»', en: 'Ember Dusk sky' },
    description: { ru: 'Фон игры. На игру не влияет.', en: 'Game background. Does not affect play.' },
  },
  tip_small: {
    stars: 25,
    permanent: false,
    title: { ru: 'Звёздочка автору', en: 'A star for the author' },
    description: { ru: 'Спасибо! Чаевые ничего не открывают — просто поддержка.', en: 'Thank you! A tip unlocks nothing — just support.' },
  },
  tip_medium: {
    stars: 100,
    permanent: false,
    title: { ru: 'Созвездие автору', en: 'A constellation for the author' },
    description: { ru: 'Спасибо! Чаевые ничего не открывают — просто поддержка.', en: 'Thank you! A tip unlocks nothing — just support.' },
  },
  tip_large: {
    stars: 250,
    permanent: false,
    title: { ru: 'Галактика автору', en: 'A galaxy for the author' },
    description: { ru: 'Спасибо! Чаевые ничего не открывают — просто поддержка.', en: 'Thank you! A tip unlocks nothing — just support.' },
  },
};

/** Что ещё открывает покупка — чтобы не продать дважды уже открытое (атлас при наборе поддержки). */
export const IMPLIED: Record<string, string[]> = { supporter: ['atlas'] };
