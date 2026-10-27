# Сервер игры

Свой сервер «Звёздного плетения»: принимает анонимные события и показывает сводку, выставляет
счета Telegram Stars, обслуживает бота @starweave_game_bot и отдаёт сборку Пикабу Игр. Живёт на
общем VPS с «ДенВал.Класс» (Timeweb, Москва) отдельным контейнером: 256 МБ, 0,5 CPU, только чтение.

- **Сводка:** https://game.denvalclass.ru/stats, логин `denis`, пароль: `ssh denval cat /opt/starweave/.env`.
  Что и как она считает: [docs/ANALYTICS.md](../docs/ANALYTICS.md).
- **Приём событий:** `POST /v1/events` только с `https://fliegerfaust.github.io` (сайт, Telegram)
  и `https://game.denvalclass.ru` (Пикабу Игры).
- **Пикабу Игры:** `/pikabu/` (выпуск) и `/pikabu-test/`, см. [docs/PIKABU.md](../docs/PIKABU.md).
- **Проверка:** https://game.denvalclass.ru/health → `ok`.

## Устройство

```
игра ──POST──▶ Caddy платформы ──▶ starweave-api:8080 ──▶ /opt/starweave/data/events.db
Telegram (вебхук) ─▶ (HTTPS)        (Node 24, SQLite)     события + purchases
starweave-api ──IPv6 (сеть starweave_egress)──▶ api.telegram.org
```

- Caddy и контейнер связаны внутренней сетью `starweave_proxy`; в сети платформы `repo_default`
  игры нет. Сеть записана во внешних сетях Caddy в compose платформы (с её 0.19.2), удалять нельзя.
- `api.telegram.org` с этого VPS доступен только по IPv6, поэтому у контейнера сеть с IPv6.
- Код не запечён в образ: лежит в `/opt/starweave/app`, Node исполняет TypeScript сам.

| Файл | Что делает |
|---|---|
| `src/main.ts` | HTTP: приём, сводка под паролем, оплата, вебхук |
| `src/validate.ts` | проверка пачки событий: форматы, лимиты, только простые значения |
| `src/limits.ts` | пределы приёма (адрес не хранится) |
| `src/db.ts` | SQLite (WAL), события старше 400 дней удаляются раз в сутки |
| `src/stats.ts`, `src/play-stats.ts` | расчёт сводки; сырые события читаются потоком |
| `src/dashboard.ts`, `src/fonts/` | страница сводки со вшитыми шрифтами игры |
| `src/stack-decoder.ts` | расшифровка стеков ошибок по картам исходников сайта |
| `src/backup.ts` | бэкапы покупок и базы |
| `src/telegram.ts`, `src/payments.ts`, `src/catalog.ts` | подпись initData, Bot API, счета, оплаты, цены в Stars |
| `scripts/` | вебхук бота, забрать бэкап, демо-база |
| `deploy/` | compose, сайт для Caddy, выкладка сервера и Пикабу |

## Покупки за Telegram Stars

Включены с 13.10.2026. Токены в `/opt/starweave/.env`: `BOT_TOKEN`, `TG_WEBHOOK_SECRET` (от 16
символов), `TG_ADMIN_CHAT_ID` (сюда приходят оплаты и `/paysupport`). Без токена игра пишет
«покупки скоро откроются». Подключить вебхук и меню команд (один раз):

```bash
ssh denval 'cd /opt/starweave && docker compose up -d && docker compose run --rm --no-deps api node server/scripts/set-webhook.ts'
```

- `POST /v1/pay/invoice` — счёт (`initData` + товар, валюта `XTR`); купленное навсегда второй раз не продаётся.
- `POST /v1/pay/owned` — что игрок купил навсегда.
- `POST /tg/webhook` (только с секретом) — проверка перед оплатой, запись оплат и возвратов,
  `/start`, `/paysupport`, `/terms`; прочие сообщения пересылаются автору.
- Команды автора в чате бота: `/sales`, `/reply <id> <текст>`, `/refund <id> <charge_id>`.
- Цены: `src/catalog.ts`, совпадают с `src/store/catalog.ts` игры (тест сверяет).
- Вывод Stars: @BotFather → бот → Monetization (Fragment).

## Защита и данные

- `/v1/events`: ведро на адрес (IPv6 по /64), 20 пачек в секунду на сервер, 2000 пачек в сутки
  на игрока, приём стоп при базе больше `EVENTS_DB_MAX_MB` (1024). Caddy не должен доверять чужим
  `X-Forwarded-For` (нет `trusted_proxies`).
- Личных данных в событиях нет: случайный номер устройства, площадка, версия, язык, игровые
  события. Для покупок: Telegram ID, товар, сумма, дата, номер платежа (есть в политике
  конфиденциальности). IP не пишутся ни в базу, ни в журнал Caddy.
- Бэкапы: каждые сутки покупки (`data/backups/purchases-ГГГГ-ММ-ДД.db`, 30 дней), по воскресеньям
  вся база (`events-weekly.db`). Забрать к себе: `server/scripts/pull-backup.sh`. Восстановить
  покупки: `sqlite3 data/events.db "ATTACH 'purchases-….db' AS b; INSERT OR IGNORE INTO purchases SELECT * FROM b.purchases;"`.

## Выкладка

```bash
server/deploy/deploy.sh
```

Выкладывает только закоммиченное (`ALLOW_DIRTY=1` — обойти), прогоняет типы и тесты сервера,
кладёт код в `/opt/starweave`, перезапускает контейнер (образ `node` закреплён по digest), ждёт
`healthy`, кладёт `deploy/starweave.caddy` в `/data/sites/` тома Caddy и перечитывает Caddy после
`caddy validate`. Файлы платформы не меняет. После выкладки проверить, что `StartedAt` контейнера
обновился. SSH к серверу иногда рвётся посреди скрипта: его можно просто запустить ещё раз
(контейнер перезапускается только в конце); на части сетей помогает VPN.

## Локально

```bash
STATS_PASSWORD=local-pass-123 DB_PATH=/tmp/ev.db ALLOWED_ORIGINS=http://localhost:5173 node server/src/main.ts
```

```bash
node server/scripts/seed-demo.ts /tmp/demo.db
```
