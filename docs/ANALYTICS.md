# Аналитика

События описаны в `src/analytics/events.ts` (типы ловят опечатки), отправка: `track('имя', { … })`.
Аналитика никогда не роняет игру. Термины: `ante` — глава (1–8), `night` — dusk / midnight / eclipse.

## Куда уходят события

- **Свой сервер** https://game.denvalclass.ru: основной источник, сводка `/stats` под паролем
  ([server/README.md](../server/README.md)). Сборка шлёт события, если задан `VITE_EVENTS_URL`
  (для Pages — переменная репозитория `EVENTS_URL`, задана).
- **Яндекс Метрика:** код готов, включается номером счётчика `VITE_METRIKA_ID` (переменная
  `METRIKA_ID`, сейчас не задана). Цели в Метрике — «JavaScript-событие» с именами из таблицы.
- **Аналитика Telegram Mini Apps** (@DataChief_bot): `VITE_TG_ANALYTICS_TOKEN` и `…_APP`, сейчас не заданы.

## Сводка /stats

Одна страница без внешних файлов, вариант B «Приборы» (эпик ST). Расчёт: `server/src/stats.ts`
и `server/src/play-stats.ts`, страница: `server/src/dashboard.ts`. Дни по Москве.

Как считается:
- **Сессия** — один запуск игры. Её длина — активное время: сумма промежутков между событиями,
  паузы длиннее 5 минут выкидываются. Сессии, где кроме `app_open` и `perf` ничего нет, — «открыли
  и сразу закрыли», в длину не входят. Сессии, начатые до периода, не учитываются.
- **На игрока за день** — медиана активных минут игрока в день, когда он играл.
- **Новички** — впервые пришли в периоде; площадка и версия — по первому событию.
- **Обучение** — короткое (шаги `short…`) и полное считаются отдельно, не по номеру шага.
- **Забег оборван** — новый `run_start` или конец сессии без `run_end`, либо `run_end` с `abandon`.
- **Ошибки** — только версий не старше `ERRORS_SINCE` (0.5.6); старые считаются числом.
- **Фичи** — «Была» (дошли до места, где фича возможна, на версии не старше выхода),
  «Встретили» (увидели выбор), «Взяли».
- **«На что смотреть»** — правила в `watchItems()` (`dashboard.ts`): провал обучения, площадка
  вдвое хуже лучшей, неделя к неделе, неиспользуемые фичи, возвраты ниже 20%, ошибки.

## События

| Событие | Когда | Параметры | Зачем |
|---|---|---|---|
| `app_open` | запуск | platform, lang, returning, source, challenge | аудитория; source — метка ссылки `startapp=src_<канал>` |
| `challenge_share` / `_open` / `_accept` / `_result` | вызов другу | ante, best, won / fresh / outcome (1, 0, −1) | сколько людей приводит вызов (fresh — новый игрок) |
| `tutorial_start` | начало обучения | source: auto / offer / menu / retry | |
| `tutorial_step` / `tutorial_skip` | шаг / пропуск | step, index | где бросают обучение |
| `tutorial_complete` | конец обучения | | |
| `run_start` | новый забег | sky, stake, daily, archive, gentle, gift, replay, challenge | колоды, ставки, источник забега |
| `night_start` / `night_end` | ночь | ante, night, boss; в конце won, score, target, ratio, moves_left, burns_left, lines | баланс: ratio около 1 — на грани |
| `run_end` | конец забега | result: lost / abandon / victory, ante, nights, lines, best, crosses, omens | где умирают, сила Знамений |
| `combo_found` | созвездие впервые | combo, count, ante | |
| `myth_found` | миф неба найден | myth, count, ante | Мифы неба |
| `resonance_fuse` | слияние Знамений | id, ante | Резонанс |
| `shop_buy` / `shop_sell` | покупка / продажа | kind, id, price, ante, gold_left / id, ante | популярность и цены |
| `shop_banish` / `shop_reroll` | убрать карту / обновить витрину | ante, cost | |
| `pack_choose` | выбор из пакета | pack, id | |
| `gift_take` / `gift_skip` | Дар ночи / «Чистое небо» | kind (glyph, body, ascend), id, ante, deck | |
| `trophy_take` | после Затмения | kind: trophy / omen, id, ante | Трофеи Затмений |
| `wonder` | Комета или Телескоп | kind: take / pass, ante | Развилки |
| `collection_open` / `collection_hook` | Коллекция / крючок в неё | focus / from: over, banner; kind, n | Коллекция |
| `ad_request` / `ad_result` | реклама | kind, placement, result | частота и досматриваемость |
| `store_open` / `purchase_start` / `purchase_result` | атлас и покупка | from / product / result: paid, cancelled, failed, unavailable | конверсия; продажи Stars также `/sales` в чате бота |
| `guide_open` | справочник | focus | какие правила непонятны |
| `perf` | через 30 с после запуска, замер 5 с | fps, dpr, width, height | слабые устройства |
| `js_error` | ошибка JavaScript | message, where, stack | стабильность |

Нужны для сводки, ещё не отправляются (0.7.11, CG-122): `route_pick` (выбор пути на Развилке),
`feature_unlock` (ступень лестницы открытий), `app_hide` (время на переднем плане при сворачивании).
