# Сервер игры

Свой сервер аналитики «Звёздного плетения»: принимает анонимные события от игры и
показывает сводку. Живёт на общем VPS с «ДенВал.Класс» (Timeweb, Москва), отдельным
контейнером с потолком ресурсов.

- **Сводка:** https://game.denvalclass.ru/stats — логин `denis`, пароль на сервере:
  `ssh denval cat /opt/starweave/.env`. Сменить пароль: поправить `.env` и
  `ssh denval 'cd /opt/starweave && docker compose up -d'`.
- **Приём событий:** `POST https://game.denvalclass.ru/v1/events` — только с
  `https://fliegerfaust.github.io` (сайт и Telegram Mini App).
- **Проверка:** https://game.denvalclass.ru/health → `ok`.

## Покупки за Telegram Stars

Сервер выставляет счета и принимает оплаты бота @starweave_game_bot. Включаются токеном бота
в `/opt/starweave/.env` (без него игра просто не показывает оплату в Telegram):

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
                                 (HTTPS, сертификат сам)   (Node 24, SQLite)
```

- `src/validate.ts` — проверка пачки: строгие форматы и лимиты, только простые значения.
- `src/db.ts` — SQLite (режим WAL), события старше 400 дней удаляются раз в сутки.
- `src/stats.ts` — расчёт сводки, дни по Москве.
- `src/dashboard.ts` — страница сводки без скриптов, названия из словаря игры.
- `src/main.ts` — HTTP: приём, сводка под паролем, ограничение частоты по адресу
  (адрес не хранится).
- `deploy/` — compose, сайт для Caddy, скрипт выкладки.

Личных данных нет: случайный номер устройства, площадка, версия, язык и игровые события.
IP-адреса не записываются ни в базу, ни в журнал Caddy (для этого сайта он выключен).

## Выкладка

```bash
server/deploy/deploy.sh
```

Скрипт кладёт код в `/opt/starweave`, поднимает контейнер, ждёт `healthy`, кладёт
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
