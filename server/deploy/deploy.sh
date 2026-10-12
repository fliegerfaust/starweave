#!/usr/bin/env bash
# Выкладка сервера игры на общий сервер с «ДенВал.Класс».
# Запуск из корня репозитория: server/deploy/deploy.sh   (хост — алиас SSH `denval`)
#
# Что делает — и чего НЕ делает:
#   ✓ кладёт код и compose в /opt/starweave, поднимает контейнер starweave-api;
#   ✓ кладёт сайт game.denvalclass.ru в /data/sites/ тома Caddy и перечитывает Caddy
#     без перезапуска — только если проверка конфигурации прошла;
#   ✗ не трогает репозиторий платформы, её контейнеры, .env и Caddyfile.
set -euo pipefail

HOST="${HOST:-denval}"
DIR=/opt/starweave
SITES=/var/lib/docker/volumes/repo_caddy_data/_data/sites

cd "$(dirname "$0")/../.."
npm run --silent typecheck
npx vitest run tests/server.test.ts --silent

echo "→ код"
ssh "$HOST" "mkdir -p $DIR/app/server/src $DIR/app/src/i18n $DIR/data $SITES"
rsync -a --delete server/src/ "$HOST:$DIR/app/server/src/"
rsync -a src/i18n/ru.ts "$HOST:$DIR/app/src/i18n/ru.ts"
rsync -a server/package.json "$HOST:$DIR/app/package.json"
rsync -a server/deploy/docker-compose.yml "$HOST:$DIR/docker-compose.yml"

echo "→ пароль сводки (создаётся один раз, дальше не меняется)"
ssh "$HOST" "test -f $DIR/.env || (umask 077; printf 'STATS_PASSWORD=%s\n' \"\$(openssl rand -base64 24 | tr -d '/+=')\" > $DIR/.env); chown -R 1000:1000 $DIR/data"

echo "→ контейнер"
ssh "$HOST" "cd $DIR && docker compose pull -q && docker compose up -d --remove-orphans"
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
rsync -a server/deploy/starweave.caddy "$HOST:$SITES/starweave.caddy"
ssh "$HOST" "docker exec $CADDY caddy validate --config /etc/caddy/Caddyfile >/dev/null && docker exec $CADDY caddy reload --config /etc/caddy/Caddyfile"
echo "  Caddy перечитан"

echo "Готово: https://game.denvalclass.ru/health"
