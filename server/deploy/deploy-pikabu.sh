#!/usr/bin/env bash
# Выкладка сборки Пикабу Игр на game.denvalclass.ru (PK.10). Площадка не хостит игры: в карточке
# в Студии стоит ссылка на нашу страницу, Пикабу открывает её у себя во фрейме.
# Запуск из корня репозитория:
#   server/deploy/deploy-pikabu.sh          → https://game.denvalclass.ru/pikabu/       (выпуск)
#   server/deploy/deploy-pikabu.sh --test   → https://game.denvalclass.ru/pikabu-test/  (тестовое окружение Студии)
#
# Выпуск — только из тега vX.Y.Z на main, как и сайт (`pages.yml`); тестовая — из любого
# закоммиченного состояния. Отдаёт файлы Caddy платформы: адреса /pikabu/ и /pikabu-test/
# описаны в starweave.caddy, его кладёт server/deploy/deploy.sh — сначала нужен он.
#
# Что делает — и чего НЕ делает:
#   ✓ собирает `npm run build:pikabu` и кладёт файлы в том Caddy (/data/pikabu или /data/pikabu-test);
#   ✗ не трогает платформу «ДенВал.Класс», её Caddyfile, контейнеры и сервер игры.
set -euo pipefail

HOST="${HOST:-denval}"
DATA=/var/lib/docker/volumes/repo_caddy_data/_data
TARGET=pikabu
[ "${1:-}" = "--test" ] && TARGET=pikabu-test

cd "$(dirname "$0")/../.."
if [ -n "$(git status --porcelain)" ]; then
  echo "Есть незакоммиченное — выкладывается только то, что в git"; exit 1
fi
if [ "$TARGET" = pikabu ]; then
  TAG="$(git describe --exact-match --tags --match 'v*' HEAD 2>/dev/null || true)"
  [ -n "$TAG" ] || { echo "Выпуск — только из тега vX.Y.Z (для проверки в Студии: --test)"; exit 1; }
  git merge-base --is-ancestor HEAD origin/main || { echo "Тег $TAG не из main"; exit 1; }
  echo "→ выпуск $TAG"
else
  echo "→ тестовая сборка $(git rev-parse --short HEAD)"
fi

npm run --silent build:pikabu

echo "→ файлы"
ssh "$HOST" "mkdir -p $DATA/$TARGET"
# Сначала новые файлы с хэшами, потом index.html. Старые assets не удаляются сразу: у игрока,
# открывшего прошлую версию, части игры догружаются позже. Уходят те, что старше 30 дней
rsync -a --no-o --no-g --exclude index.html dist-pikabu/ "$HOST:$DATA/$TARGET/"
rsync -a --no-o --no-g dist-pikabu/index.html "$HOST:$DATA/$TARGET/index.html"
rsync -a --no-o --no-g --delete --exclude assets/ dist-pikabu/ "$HOST:$DATA/$TARGET/"
ssh "$HOST" "find $DATA/$TARGET/assets -type f -mtime +30 -delete"

URL="https://game.denvalclass.ru/$TARGET/"
code="$(curl -s -o /dev/null -w '%{http_code}' "$URL")"
[ "$code" = 200 ] || { echo "$URL отвечает $code — проверь, что starweave.caddy с /pikabu/ выложен (deploy.sh)"; exit 1; }
echo "Готово: $URL"
