/**
 * Переключатели нового поведения (0.7.4, эпик CQ). Площадка включает свои в `Platform.features`.
 * С 0.7.8 все включены на сайте, в Telegram, на CrazyGames и Пикабу; выключены только в сборке
 * Яндекса. Старое поведение — `?ff=none` в разработке.
 */
export const FEATURES = [
  /** CQ.3: первый запуск сразу в ночь, обучение — начало настоящего забега. */
  'quickStart',
  /** CQ.4: короткое обучение, счёт показан анимацией. */
  'shortTutorial',
  /** CQ.5: на ПК крупное поле, панель у поля, рука отдельно. */
  'wideDesktop',
  /** CQ.6: яркая вспышка созвездия и быстрый подсчёт. */
  'brightFlare',
  /** CQ.7: музыка и звуки карт. */
  'music',
] as const;

export type Feature = (typeof FEATURES)[number];
export type Features = Readonly<Record<Feature, boolean>>;

const isFeature = (s: string): s is Feature => (FEATURES as readonly string[]).includes(s);

/**
 * Итоговые переключатели: что включила площадка, поверх — `?ff=` в разработке
 * (`?ff=quickStart,-music`: имя включает, минус выключает, `all` и `none` — все сразу).
 */
export function resolveFeatures(on: readonly Feature[] = [], override: string | null = null): Features {
  const out = Object.fromEntries(FEATURES.map((f) => [f, on.includes(f)])) as Record<Feature, boolean>;
  for (const raw of override?.split(',') ?? []) {
    const word = raw.trim();
    const off = word.startsWith('-');
    const name = off ? word.slice(1) : word;
    if (name === 'all' || name === 'none') FEATURES.forEach((f) => (out[f] = name === 'all'));
    else if (isFeature(name)) out[name] = !off;
  }
  return out;
}
