# Starweave: Звёздное плетение

Карточный рогалик-головоломка для мобильного и десктопного браузера. Выкладывай карты-звёзды на небо 4×4:
заполненный ряд или столбец вспыхивает **созвездием** (пара, стрит, флеш, зеркало, каскад…) и приносит
очки: свет × множитель. Между ночами покупай **Знамения**, которые переписывают правила подсчёта.
Восемь глав, в конце каждой **Затмение** со своим правилом. Дальше открываются Дар ночи, Развилки,
трофеи Затмений, Мифы неба и Резонанс Знамений.

Вся графика, звук и музыка генерируются кодом: картинок и аудиофайлов в проекте нет, кроме иконок PWA.

## Где играть
- Сайт: https://fliegerfaust.github.io/starweave/
- Telegram: https://t.me/starweave_game_bot/play
- Пикабу Игры: https://games.pikabu.ru/

Текущая версия 0.7.10. Что вышло и что дальше: [docs/ROADMAP.md](docs/ROADMAP.md).

## Запуск

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck    # типы игры и сервера
npm test             # юнит-тесты: ядро, сохранения, сервер, локализация
npm run sim          # баланс: бот гонит забеги
npm run e2e          # Playwright на 8 устройствах (e2e-results/)
npm run build        # сборка в dist/ (PWA, работает офлайн)
npm run build:pikabu       # сборка Пикабу Игр в dist-pikabu/
npm run build:yandex       # Яндекс Игры: release/starweave-yandex.zip
npm run legal        # public/legal/*.html из legal/*.md
```

В разработке: `?fakeads&fakepay` имитирует рекламу и покупки, `?ff=none` выключает переключатели площадки,
`?gallery`, `?promo`, `?icon` открывают отладочные витрины графики, `window.starweave` доступен из консоли.

**Выкладка:** только тегом `vX.Y.Z` на мёрдже релиза в `main`, тег публикует GitHub Pages
(`.github/workflows/pages.yml`). Ветки проверяет CI (typecheck и тесты). Сервер игры и сборка Пикабу:
[server/README.md](server/README.md). Правила веток и коммитов: [CLAUDE.md](CLAUDE.md).

## Как устроено

```
src/core       чистые правила: детерминированы (сидируемый ГПСЧ в стейте), без DOM
src/engine     мини-движок: ECS, твины с промисами, Canvas2D, ввод, синтез звука
src/art        процедурная графика
src/game       сцена ночи, презентер событий, раскладка
src/ui         DOM-интерфейс: HUD, экраны, окна
src/meta       профиль, прогресс, Коллекция, настройки, вызов дня
src/i18n       ru / en
src/platform   веб, Telegram, Пикабу, Яндекс: реклама, покупки, облако, переключатели
src/store      каталог покупок и оплата
src/analytics  события: Метрика, аналитика Telegram, свой сервер
src/tutorial   обучение
server/        свой сервер: события, сводка /stats, счета Telegram Stars, бот
legal/         политика и соглашение
docs/vitrines  витрины-прототипы экранов
```

Главный принцип: ядро применяет ход мгновенно и возвращает список событий, презентер проигрывает их
анимацией. Правила тестируются без браузера, сохранение равно `JSON.stringify(run)`.
Новое Знамение: объект с хуками в `src/core/content/omens.ts` и строка в словарях.

## Документы
- Задачи: трекер, проект CG ([TASKS.md](TASKS.md))
- План и выпуски: [docs/ROADMAP.md](docs/ROADMAP.md), «Глубина»: [docs/RELEASE-0.7-DEPTH.md](docs/RELEASE-0.7-DEPTH.md)
- Правила и баланс: [docs/GDD.md](docs/GDD.md); устройство кода: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Продукт: [PRODUCT.md](PRODUCT.md); дизайн-система: [DESIGN.md](DESIGN.md)
- Деньги: [docs/MONETIZATION.md](docs/MONETIZATION.md), реклама: [docs/ADS.md](docs/ADS.md), аналитика: [docs/ANALYTICS.md](docs/ANALYTICS.md)
- Площадки: [Telegram](docs/TELEGRAM.md), [Пикабу](docs/PIKABU.md), [Яндекс](docs/YANDEX.md), [itch.io](docs/ITCH.md)
- Продвижение: [docs/PROMOTION.md](docs/PROMOTION.md); сервер: [server/README.md](server/README.md)
