#!/usr/bin/env bash
# Забрать бэкапы сервера игры к себе (SEC.2): копия вне VPS на случай потери диска.
# Запуск с машины Дениса: server/scripts/pull-backup.sh [папка]   (хост — алиас SSH `denval`)
# Сервер сам делает копию покупок раз в сутки и полную копию базы раз в неделю
# (server/src/backup.ts) в /opt/starweave/data/backups; скрипт только скачивает новое.
set -euo pipefail

HOST="${HOST:-denval}"
DEST="${1:-$HOME/Backups/starweave}"

mkdir -p "$DEST"
rsync -a --no-o --no-g "$HOST:/opt/starweave/data/backups/" "$DEST/"
latest="$(ls -1 "$DEST"/purchases-*.db 2>/dev/null | tail -1)"
echo "Бэкапы в $DEST, свежая копия покупок: ${latest:-нет}"
