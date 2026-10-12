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

Файлы платформы в git не меняются — иначе её деплой упал бы на `git checkout`. Пока в
Caddyfile платформы нет строки `import /data/sites/*.caddy`, скрипт собирает её Caddyfile
с нашим сайтом во временный файл внутри контейнера Caddy и перечитывает его. Поэтому
**после перезапуска контейнера Caddy сайт игры пропадает** (платформа работает) — нужно
снова запустить `server/deploy/deploy.sh`. Навсегда это решит одна строка `import` в
репозитории платформы (подготовлено, ждёт согласия Дениса).

## Локально

```bash
STATS_PASSWORD=local-pass-123 DB_PATH=/tmp/ev.db ALLOWED_ORIGINS=http://localhost:5173 node server/src/main.ts
```

```bash
node server/scripts/seed-demo.ts /tmp/demo.db
```

Игра шлёт события, если при сборке задан `VITE_EVENTS_URL`
(для GitHub Pages — переменная репозитория `EVENTS_URL`).
