# Сервер игры

Свой сервер «Звёздного плетения»: принимает анонимные события от игры и показывает сводку,
выставляет счета Telegram Stars и обслуживает бота @starweave_game_bot (оплаты, поддержка).
Живёт на общем VPS с «ДенВал.Класс» (Timeweb, Москва), отдельным контейнером с потолком
ресурсов.

- **Сводка:** https://game.denvalclass.ru/stats — логин `denis`, пароль на сервере:
  `ssh denval cat /opt/starweave/.env`. Сменить пароль: поправить `.env` и
  `ssh denval 'cd /opt/starweave && docker compose up -d'`.
- **Приём событий:** `POST https://game.denvalclass.ru/v1/events` — только с
  `https://fliegerfaust.github.io` (сайт и Telegram Mini App).
- **Проверка:** https://game.denvalclass.ru/health → `ok`.

## Покупки за Telegram Stars

**Включены с 13.10.2026.** Сервер выставляет счета и принимает оплаты бота
@starweave_game_bot. Включаются токеном бота в `/opt/starweave/.env` (без него игра пишет в
атласе «покупки скоро откроются»):

```
BOT_TOKEN=<токен от @BotFather>
TG_WEBHOOK_SECRET=<случайная строка от 16 символов: openssl rand -hex 24>
TG_ADMIN_CHAT_ID=<твой Telegram ID — сюда приходят оплаты и обращения /paysupport>
```

Затем перезапустить контейнер и один раз подключить вебхук и меню команд:

```bash
ssh denval 'cd /opt/starweave && docker compose up -d && docker compose run --rm --no-deps api node server/scripts/set-webhook.ts'
```

- `POST /v1/pay/invoice` — игра просит счёт (`initData` + товар), сервер проверяет подпись
  Telegram и вызывает `createInvoiceLink` (валюта `XTR`). Уже купленное второй раз не продаётся.
- `POST /v1/pay/owned` — что игрок купил навсегда.
- `POST /tg/webhook` — обновления бота (только с секретом): `pre_checkout_query` (проверка суммы,
  товара и игрока), `successful_payment` (запись в `purchases`), `refunded_payment`, команды
  `/start`, `/paysupport`, `/terms`. Любое другое сообщение игрока пересылается автору.
- Команды автора в чате с ботом: `/sales` — сводка, `/reply <id> <текст>` — ответ игроку,
  `/refund <id> <charge_id>` — вернуть Stars.
- Цены — `server/src/catalog.ts`, совпадают с `src/store/catalog.ts` игры (тест сверяет).
- Вывод Stars — в @BotFather → бот → Monetization (Fragment).
- С сервера (Timeweb, Москва) `api.telegram.org` отвечает только по IPv6 — поэтому у контейнера
  есть своя сеть `starweave_egress` с IPv6 (compose). Простой `wget` в контейнере на IPv6 не
  переключается и выдаёт таймаут; Node переключается сам.

## Устройство

```
игра (сайт, Telegram) ──POST──▶ Caddy платформы ──▶ starweave-api:8080 ──▶ /opt/starweave/data/events.db
Telegram (вебхук бота) ─────────▶ (HTTPS, сертификат)    (Node 24, SQLite)    события + purchases
starweave-api ──IPv6 (сеть starweave_egress)──▶ api.telegram.org
```

Caddy платформы и `starweave-api` связаны своей внутренней сетью `starweave_proxy`: в сети
платформы `repo_default` контейнера игры нет, из него не видно ни БД, ни бэкенда платформы.
Caddy в эту сеть подключает `deploy.sh`. Если платформа пересоздаст свой Caddy, связь пропадёт
до следующего запуска `deploy.sh` — навсегда это решает строка `starweave_proxy` во внешних
сетях Caddy в compose платформы.

## Защита от заливки

`/v1/events` держат четыре предела (`src/limits.ts`): ведро на адрес (IPv6 — по подсети /64),
общий потолок 20 пачек в секунду на весь сервер, 2000 пачек в сутки на игрока и размер базы —
события перестают приниматься при `EVENTS_DB_MAX_MB` (по умолчанию 1024), покупкам место
остаётся. У оплаты свои вёдра. Важно, чтобы Caddy платформы не доверял чужим `X-Forwarded-For`
(в глобальных настройках нет `trusted_proxies`), иначе адрес подделывается.

## Бэкапы

Сервер сам (`src/backup.ts`): каждые сутки — копия покупок `data/backups/purchases-ГГГГ-ММ-ДД.db`
(хранятся 30 дней), по воскресеньям — полная копия базы `data/backups/events-weekly.db`.
Забрать к себе, вне сервера:

```bash
server/scripts/pull-backup.sh
```

Восстановить покупки: скопировать нужный `purchases-*.db` на сервер и
`sqlite3 data/events.db "ATTACH 'purchases-….db' AS b; INSERT OR IGNORE INTO purchases SELECT * FROM b.purchases;"`.

- `src/validate.ts` — проверка пачки: строгие форматы и лимиты, только простые значения.
- `src/db.ts` — SQLite (режим WAL), события старше 400 дней удаляются раз в сутки.
- `src/stats.ts` — расчёт сводки, дни по Москве.
- `src/dashboard.ts` — страница сводки без скриптов, названия из словаря игры.
- `src/main.ts` — HTTP: приём, сводка под паролем, оплата, вебхук.
- `src/limits.ts` — пределы приёма событий (адрес не хранится).
- `src/backup.ts` — бэкапы покупок и базы.
- `src/telegram.ts` — проверка подписи initData, вызовы Bot API.
- `src/payments.ts` — счета, проверка перед оплатой, запись оплат и возвратов, команды бота.
- `src/catalog.ts` — товары и цены в Stars.
- `scripts/set-webhook.ts` — подключить вебхук и меню команд (запуск вручную).
- `deploy/` — compose, сайт для Caddy, скрипт выкладки.

В событиях личных данных нет: случайный номер устройства, площадка, версия, язык и игровые
события. Для покупок хранится числовой Telegram ID, товар, сумма, дата и номер платежа — это
описано в политике конфиденциальности. IP-адреса не записываются ни в базу, ни в журнал Caddy
(для этого сайта он выключен).

## Выкладка

```bash
server/deploy/deploy.sh
```

Скрипт выкладывает только закоммиченное (`ALLOW_DIRTY=1` — обойти), кладёт код в
`/opt/starweave`, поднимает контейнер (образ `node` закреплён по digest), ждёт `healthy`, кладёт
`deploy/starweave.caddy` в `/data/sites/` тома Caddy платформы и перечитывает Caddy без
перезапуска (только если `caddy validate` прошёл).

Файлы платформы скрипт не меняет. С релиза платформы 0.17.1 её Caddyfile сам подключает
`/data/sites/*.caddy` (строка `import`), поэтому сайт игры переживает перезапуск Caddy и
деплои платформы. Запасной путь для сервера без этой строки остался в скрипте: он
собирает Caddyfile платформы с нашим сайтом во временный файл внутри контейнера Caddy.

## Локально

```bash
STATS_PASSWORD=local-pass-123 DB_PATH=/tmp/ev.db ALLOWED_ORIGINS=http://localhost:5173 node server/src/main.ts
```

```bash
node server/scripts/seed-demo.ts /tmp/demo.db
```

Игра шлёт события, если при сборке задан `VITE_EVENTS_URL`
(для GitHub Pages — переменная репозитория `EVENTS_URL`).
