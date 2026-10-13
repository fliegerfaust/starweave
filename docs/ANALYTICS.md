# Аналитика

События описаны в одном месте — `src/analytics/events.ts` (типизированы: опечатку поймает
компилятор). Отправка — `track('имя', { параметры })`. Аналитика никогда не роняет игру.

## Куда уходят события
- **Свой сервер** — https://game.denvalclass.ru (`VITE_EVENTS_URL`, переменная репозитория
  `EVENTS_URL`): события с сайта и из Telegram, сводка `/stats` под паролем
  ([server/README.md](../server/README.md)). Работает с 0.3.10.
- **Аналитика Telegram Mini Apps** — ключ из @DataChief_bot (`TG_ANALYTICS_TOKEN`,
  `TG_ANALYTICS_APP`); запуски и удержание в каталоге Telegram.
- **Яндекс Метрика** — ждёт номер счётчика (D.2), см. ниже.

## Подключение Яндекс Метрики
1. Создать счётчик на [metrika.yandex.ru](https://metrika.yandex.ru) (адрес сайта — домен игры
   или адрес на Яндекс Играх).
2. Собрать игру с номером счётчика:
   ```bash
   VITE_METRIKA_ID=12345678 npm run build:yandex
   ```
3. В Метрике завести цели типа «JavaScript-событие» с идентификаторами из таблицы ниже.
   Параметры событий приходят в «Параметры визитов».

Без `VITE_METRIKA_ID` события пишутся только в консоль в режиме разработки.
В нативной сборке (Capacitor) добавится приёмник AppMetrica — тот же `track()`.

## События

| Событие | Когда | Параметры | Что смотрим |
|---|---|---|---|
| `app_open` | запуск | platform, lang, returning | аудитория, возвраты |
| `tutorial_start` | начало обучения | source: offer / menu / retry | кто идёт в обучение |
| `tutorial_step` | каждый шаг | step, index | **где бросают обучение** |
| `tutorial_skip` | пропуск | step, index | на каком шаге пропускают |
| `tutorial_complete` | конец обучения | — | конверсия обучения (цель ≥ 80%) |
| `run_start` | новый забег | sky, stake, daily, archive, gentle, gift | популярность колод и сложности; archive — вызов из архива; gentle — первый забег со щедрой ночью; gift — с золотом и Знамением из обучения |
| `night_start` | начало ночи | ante, night, boss, gentle | gentle — щедрая первая ночь новичка |
| `night_end` | конец ночи | ante, night, boss, won, score, target, ratio, moves_left, burns_left, lines | **баланс целей**: ratio около 1 — на грани, сильно больше — слишком легко |
| `combo_found` | созвездие собрано впервые (коллекция) | combo (или `cross`), count, ante | когда новички открывают созвездия; дошли ли до редких |
| `run_end` | конец забега | result, ante, nights, lines, best, crosses, omens | где умирают, сильные наборы Знамений |
| `shop_buy` | покупка | kind, id, price, ante, gold_left | популярность Знамений и предметов, цены |
| `shop_sell` | продажа Знамения | id, ante | «ловушки» — что покупают и сразу продают |
| `shop_banish` | услуга «Убрать карту» | ante | чистят ли колоду и с какого созвездия |
| `shop_reroll` | переброс | cost, ante | хватает ли выбора в магазине |
| `pack_choose` | выбор из пакета | pack, id | что берут из трёх |
| `ad_request` | запрос рекламы | kind, placement | частота показов |
| `ad_result` | итог рекламы за награду | kind, placement, result | досматриваемость |
| `store_open` | открыт «Звёздный атлас» | from: menu / sky / archive … | откуда приходят в магазин |
| `purchase_start` | нажата покупка | product | интерес к товарам |
| `purchase_result` | итог покупки | product, result: paid / cancelled / failed / unavailable | **конверсия** и сбои оплаты |
| `guide_open` | справочник | focus — раздел или вкладка (combos, night, shop, glyphs) | какие термины непонятны; «Как считаются очки» теперь вкладка «Ночь» |
| `perf` | через 30 с после запуска | fps, dpr, width, height | слабые устройства |
| `js_error` | ошибка JavaScript | message | стабильность |

## Ключевые отчёты
- **Воронка новичка:** app_open → tutorial_start → tutorial_step (по index) → tutorial_complete →
  run_start → night_end (won, ante 1) → night_end (boss ≠ '').
- **Баланс:** night_end по ante и night: доля побед и медиана ratio; по boss — доля поражений.
- **Знамения:** shop_buy по id против omens в run_end с result=victory — частота выбора и побед.
- **Атлас:** store_open → purchase_start → purchase_result (paid) по product; откуда заходят (from).
  Продажи Stars — также командой `/sales` в чате с ботом.

Термины в событиях: `ante` — номер главы (1–8), `night` — dusk / midnight / eclipse.
