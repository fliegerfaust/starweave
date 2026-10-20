#!/usr/bin/env bash
# Выкладка сервера игры на общий сервер с «ДенВал.Класс».
# Запуск из корня репозитория: server/deploy/deploy.sh   (хост — алиас SSH `denval`)
#
# Что делает — и чего НЕ делает:
#   ✓ кладёт код и compose в /opt/starweave, поднимает контейнер starweave-api;
#   ✓ кладёт сайт game.denvalclass.ru в /data/sites/ тома Caddy и перечитывает Caddy
#     без перезапуска — только если проверка конфигурации прошла (Caddyfile платформы
#     с нашим сайтом собирается во временный файл в контейнере; файлы платформы не меняются);
#   ✗ не трогает репозиторий платформы, её контейнеры, .env и Caddyfile.
set -euo pipefail

HOST="${HOST:-denval}"
DIR=/opt/starweave
SITES=/var/lib/docker/volumes/repo_caddy_data/_data/sites

cd "$(dirname "$0")/../.."
# Выкладывается рабочее дерево — только закоммиченное, чтобы на сервере было то, что в git (SEC.6)
if [ -n "$(git status --porcelain -- server src/i18n/ru.ts)" ] && [ "${ALLOW_DIRTY:-}" != 1 ]; then
  echo "В server/ или src/i18n/ru.ts есть незакоммиченное — закоммить или ALLOW_DIRTY=1"; exit 1
fi
npm run --silent typecheck
npx vitest run tests/server.test.ts tests/server-limits.test.ts --silent

echo "→ код"
ssh "$HOST" "mkdir -p $DIR/app/server/src $DIR/app/server/scripts $DIR/app/src/i18n $DIR/data $SITES"
rsync -a --no-o --no-g --delete server/src/ "$HOST:$DIR/app/server/src/"
# set-webhook.ts — подключение бота к серверу (запускается вручную, см. server/README.md)
rsync -a --no-o --no-g server/scripts/set-webhook.ts "$HOST:$DIR/app/server/scripts/set-webhook.ts"
rsync -a --no-o --no-g src/i18n/ru.ts "$HOST:$DIR/app/src/i18n/ru.ts"
rsync -a --no-o --no-g server/package.json "$HOST:$DIR/app/package.json"
rsync -a --no-o --no-g server/deploy/docker-compose.yml "$HOST:$DIR/docker-compose.yml"

echo "→ пароль сводки (создаётся один раз, дальше не меняется)"
ssh "$HOST" "test -f $DIR/.env || (umask 077; printf 'STATS_PASSWORD=%s\n' \"\$(openssl rand -base64 24 | tr -d '/+=')\" > $DIR/.env); chown -R 1000:1000 $DIR/data"

echo "→ контейнер"
# Код подключён в контейнер папкой и читается Node только при старте, а `up -d` не трогает
# контейнер, если образ и compose не менялись, — перезапускаем явно, иначе новый код не
# подхватится (так сводка v2 14.10.2026 сначала осталась старой)
ssh "$HOST" "cd $DIR && docker compose pull -q && docker compose up -d --remove-orphans && docker compose restart api"
for i in $(seq 1 20); do
  state="$(ssh "$HOST" "docker inspect -f '{{.State.Health.Status}}' starweave-api" 2>/dev/null || true)"
  [ "$state" = "healthy" ] && break
  sleep 3
done
[ "$state" = "healthy" ] || { echo "starweave-api не стал healthy: $state"; ssh "$HOST" "cd $DIR && docker compose logs --tail 30"; exit 1; }
echo "  starweave-api: healthy"

echo "→ сайт в Caddy"
CADDY="$(ssh "$HOST" "docker ps -q -f label=com.docker.compose.project=repo -f label=com.docker.compose.service=caddy")"
[ -n "$CADDY" ] || { echo "Caddy платформы не найден — сайт не подключаю"; exit 1; }
# Caddy платформы — в нашу сеть (SEC.3). Если платформа пересоздаст свой Caddy, связь
# пропадёт до следующего запуска этого скрипта; навсегда — сеть starweave_proxy во внешних
# сетях compose платформы (задача SEC.3b в TASKS.md)
ssh "$HOST" "docker inspect -f '{{json .NetworkSettings.Networks}}' $CADDY | grep -q '\"starweave_proxy\"' || docker network connect starweave_proxy $CADDY"
echo "  Caddy в сети starweave_proxy"
rsync -a --no-o --no-g server/deploy/starweave.caddy "$HOST:$SITES/starweave.caddy"
# Если Caddyfile платформы уже подключает /data/sites (строка import) — перечитываем его.
# Иначе собираем его копию с нашим сайтом во временный файл внутри контейнера: файлы
# платформы в git не меняются, и её деплой не упадёт на `git checkout`. После перезапуска
# контейнера Caddy сайт игры пропадёт (платформа — нет), и этот скрипт вернёт его.
ssh "$HOST" "set -e
  if docker exec $CADDY grep -q '^import /data/sites/' /etc/caddy/Caddyfile; then
    CONF=/etc/caddy/Caddyfile
  else
    CONF=/tmp/with-sites.Caddyfile
    docker exec $CADDY sh -c 'cat /etc/caddy/Caddyfile /data/sites/*.caddy > /tmp/with-sites.Caddyfile'
  fi
  docker exec $CADDY caddy validate --config \$CONF >/dev/null
  docker exec $CADDY caddy reload --config \$CONF
  echo \"  Caddy перечитан: \$CONF\""

echo "Готово: https://game.denvalclass.ru/health"
