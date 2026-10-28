# Архитектура

TypeScript strict + Vite; Canvas 2D со своим ECS для поля, DOM без фреймворка для интерфейса;
звук и графика генерируются кодом. Тесты: Vitest (`tests/`), Playwright (`e2e/`, 8 устройств).
Сервер: Node 24 + SQLite, [server/README.md](../server/README.md).

## Модули `src/`

| Папка | Что |
|---|---|
| `core/` | правила: детерминированы, без DOM, времени и `Math.random` (ГПСЧ в `RunState`) |
| `core/content/` | данные: Знамения, Затмения, трофеи, ритуалы, небеса, сложность, созвездия, черты карты, мифы, Резонанс, баланс, `pools.ts` (открытия) |
| `engine/` | ECS, рендер, твины, ввод, синтез звука, вибрация |
| `art/` | процедурная графика и кэш спрайтов |
| `game/` | `app.ts` (корень), `router.ts` (экран по фазе), `run-controller.ts` (забег, сохранения, обучение), `monetization.ts`, `night/` (сцена ночи) |
| `ui/` | DOM: `screens/` и сцены выбора, дара, трофея, Кометы, Резонанса |
| `meta/` | профиль, `progress.ts`, Коллекция, настройки, хранилище, облако |
| `platform/` | адаптеры площадок, `features.ts` |
| `store/`, `analytics/`, `security/` | покупки, события, CSP |
| `tutorial/`, `i18n/`, `legal/`, `dev/` | обучение, ru/en, страницы политики, витрины (только в разработке) |

Ключевые файлы ядра: `night.ts` (ход), `scoring.ts` (подсчёт), `run.ts` (фазы забега),
`route.ts` (план главы), `choices.ts` (очередь выборов), `shop.ts`, `commands.ts`, `save.ts`,
`effects.ts`, `effect-sources.ts`.

## Ход игрока

1. UI шлёт команду `apply(run, cmd)` через `app.runs`; `RunState` напрямую не меняется.
2. Ядро применяет её целиком и возвращает события (`place`, `ignite`, `draw`, `nightWon`…).
3. `game/night/presenter.ts` проигрывает события анимациями.

Команда пишется в `run.log`, `replay(log)` восстанавливает забег. Фазы, события и команды
перечислены полностью (`assertNever`). Ход ночи: выкладка → `onPlaced` → формации (линии и
мифы) → подсчёт → `cellFate` (гаснет, остаётся, разбивается, схлопывается) → добор.
Прогноз на небе (`previewTurn`) гоняет те же этапы на копии. `tests/night-golden.test.ts`
ловит любой сдвиг событий и бросков ГПСЧ.

Фазы забега: `map → night → reward → shop → map … → victory | gameOver`. После ночи
`collectReward` кладёт в `run.pending` трофей, дар и Знамение Яркой ночи; сцена «Выбери одно»
(`ui/choice.ts`) берёт их по одному.

## Эффекты

Знамения, трофеи, Затмения объявляют нужные хуки из `effects.ts` (`modifyRules`,
`onCardScored`, `onLineScored`, `onMythScored`, `cellFate`…). Конвейер зовёт источники
`EFFECT_SOURCES` по порядку (Знамения по слотам, трофей, Затмение) и пишет каждый вклад в шаги
подсчёта. Глифы и тела: `content/traits.ts`. Новое Знамение: объект в `content/omens.ts` и
строка в словарях.

## Состояние

- Открытия: правило `unlock` у контента, ступени в `content/pools.ts`. Снимок `run.unlocks`
  берётся при старте; вызов дня: `baseContent()`. Прогресс пишет только `meta/progress.ts`.
- Забег: JSON, `RUN_MIGRATIONS` до `SAVE_VERSION` (6) и проверка; битое даёт `null`.
- Профиль: `PROFILE_MIGRATIONS` и `sanitizeProfile`; профиль новее сборки не перезаписывается.
- Новый формат: шаг миграции и тест (`tests/migrations.test.ts`, `tests/fixtures/`).

## Площадки

Игра знает интерфейс `Platform` (`platform/types.ts`): реклама, `payments`, облако, язык,
пауза, `grants`, `features`. Переключатели `features.ts` включены везде, кроме Яндекса.

| Площадка | Выбор | Сборка | Покупки |
|---|---|---|---|
| Сайт (GitHub Pages) | по умолчанию | `npm run build`, выкладка тегом | нет |
| Telegram Mini App | параметры запуска | тот же сайт | Stars через свой сервер |
| Пикабу Игры | `VITE_PLATFORM` | `build:pikabu` → `game.denvalclass.ru/pikabu/` | SDK Пикабу |
| Яндекс Игры | `VITE_PLATFORM` | `build:yandex` → zip | SDK Яндекса |

Каталог товаров один (`store/catalog.ts`), силу игры не продаёт.

## Аналитика

`track()` (типы в `analytics/events.ts`) шлёт в приёмники: свой сервер пачками
(`VITE_EVENTS_URL` = `https://game.denvalclass.ru/v1/events`, анонимный id устройства),
Яндекс Метрика, аналитика Telegram. Ошибки и нарушения CSP идут в `js_error` со стеком.
Сводка: `https://game.denvalclass.ru/stats` (`server/src/stats.ts`, `play-stats.ts`,
`dashboard.ts`), подробно в [ANALYTICS.md](ANALYTICS.md).

## Безопасность

CSP мета-тегом (`security/csp.ts`, плагин `vite.config.ts`): без inline-скриптов, `eval`,
форм и чужого `<base>`. Реестры контента без прототипа: id приходят из ссылок и облака.
