# Starweave — Звёздное плетение

**Играть:** https://fliegerfaust.github.io/starweave/ · в Telegram: https://t.me/starweave_game_bot/play

Карточный рогалик-головоломка для мобильного и десктопного браузера. Выкладывай карты-звёзды
на небо 4×4: заполненный ряд или столбец вспыхивает **созвездием** (пара, стрит, флеш,
зеркало, каскад…) и приносит очки — свет × множитель. Карта на пересечении двух почти полных
линий — **крест**: обе вспыхивают, итог ×2. Между ночами покупай **Знамения**, которые
переписывают правила подсчёта, и меняй колоду ритуалами. Восемь **глав** по три ночи, третья
ночь каждой главы — **Затмение** со своим правилом.

Монетизация без продажи силы: разовая покупка **«Звёздный атлас»** (архив вызовов дня, колода
«Астролябия», без рекламы, рубашка и небо), внешний вид, набор мецената, в Telegram — чаевые.
Оплата — Telegram Stars через свой сервер и SDK Яндекс Игр.

Вся графика (карты, сигилы, туманности, иконки) и весь звук генерируются кодом — в проекте
нет ни одной картинки или аудиофайла, кроме иконок PWA, которые тоже рисует скрипт.

## Запуск

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # юнит-тесты: ядро, сохранения, сервер, локализация
npm run sim        # баланс-симуляция: жадный бот гонит забеги
npm run build      # продакшен-сборка в dist/ (PWA, работает офлайн)
npm run build:yandex  # архив для Яндекс Игр: release/starweave-yandex.zip
npm run e2e        # Playwright: вёрстка и снимки на 8 устройствах (e2e-results/)
npm run legal      # пересобрать public/legal/*.html из legal/*.md
```

Выкладка: пуш в `main` или `release/**` публикует сборку на GitHub Pages; сервер игры —
`server/deploy/deploy.sh` ([server/README.md](server/README.md)).

Имитация рекламы и покупок в разработке: `http://localhost:5173/?fakeads&fakepay`.

Релиз 0.6 «Фундамент» (рефакторинг и техдолг) — `release/0.6.0`, итог в
[RELEASE-0.6-FOUNDATION](docs/RELEASE-0.6-FOUNDATION.md). План 0.9 «Глубина» с
витринами-прототипами — [RELEASE-0.9-DEPTH](docs/RELEASE-0.9-DEPTH.md). Все релизы — [ROADMAP](docs/ROADMAP.md).

Документы: задачи — в трекере, проект CG ([TASKS.md](TASKS.md) — как открыть); продукт — [PRODUCT.md](PRODUCT.md); дизайн-система —
[DESIGN.md](DESIGN.md); правила — [docs/GDD.md](docs/GDD.md); устройство —
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); деньги — [docs/MONETIZATION.md](docs/MONETIZATION.md);
реклама и где смотреть доход — [docs/ADS.md](docs/ADS.md); план выхода —
[docs/ROADMAP.md](docs/ROADMAP.md); продвижение — [docs/PROMOTION.md](docs/PROMOTION.md);
аналитика — [docs/ANALYTICS.md](docs/ANALYTICS.md); Telegram — [docs/TELEGRAM.md](docs/TELEGRAM.md);
Яндекс — [docs/YANDEX.md](docs/YANDEX.md); сервер — [server/README.md](server/README.md).

Отладочные витрины графики (`?gallery`, `?promo`, `?icon`) и `window.starweave` есть только
в разработке: `http://localhost:5173/?gallery`.

## Как устроено

Подробно — в [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), правила и баланс — в
[docs/GDD.md](docs/GDD.md), план — в [docs/ROADMAP.md](docs/ROADMAP.md), задачи и статус — в трекере CG.

```
src/core    чистые правила: детерминированы (сидируемый ГПСЧ в стейте), без DOM
src/engine  свой мини-движок: ECS, твины с промисами, Canvas2D, ввод, синтез звука
src/art     процедурная графика
src/game    связка: сцена ночи (ECS-сущности), презентер событий, раскладка
src/ui      DOM-интерфейс: HUD, экраны, модалки
src/meta    профиль, настройки, вызов дня и его архив
src/i18n    ru / en
src/platform  веб / Яндекс Игры / Telegram: реклама, покупки, облачные сохранения, язык
src/store   каталог покупок, купленное на устройстве, оплата Stars и тестовая
src/analytics  события: Метрика, аналитика Telegram, свой сервер
src/tutorial  режиссёр обучения и его слой подсказок
server/     свой сервер: приём событий, сводка, счета Telegram Stars и бот
legal/      политика и соглашение (markdown → public/legal/*.html и окно в игре)
```

Главный принцип: ядро применяет ход мгновенно и возвращает список событий, а презентер
проигрывает их как анимации. Поэтому правила тестируются без браузера, сохранение — это
`JSON.stringify(run)`, а анимацию можно ускорить, не трогая логику.

Новое Знамение — один объект с хуками в `src/core/content/omens.ts` плюс строка в словарях.
