#!/usr/bin/env bash
# Подписанная APK для паблишеров (APK.9). Запуск из корня репозитория: scripts/android-release.sh
# Ключ: ~/.android-keys/starweave-upload.jks, пароль — в Связке ключей macOS
# (служба android-keystore-starweave). Ключ терять нельзя: без него не обновить установленную APK.
set -euo pipefail
cd "$(dirname "$0")/.."

KEYSTORE="$HOME/.android-keys/starweave-upload.jks"
[ -f "$KEYSTORE" ] || { echo "Нет ключа $KEYSTORE"; exit 1; }
PASS="$(security find-generic-password -s android-keystore-starweave -w)"
JAVA_HOME="${JAVA_HOME:-$(echo ~/Library/Java/zulu21*/Contents/Home)}"
ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export JAVA_HOME ANDROID_HOME

npm run build:android
(cd android && STARWEAVE_KEYSTORE="$KEYSTORE" STARWEAVE_KEYSTORE_PASSWORD="$PASS" ./gradlew assembleRelease --console=plain --no-parallel -q)

VERSION="$(node -p "require('./package.json').version")"
OUT="release/starweave-$VERSION.apk"
mkdir -p release
cp android/app/build/outputs/apk/release/app-release.apk "$OUT"
BT="$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)"
"$BT/apksigner" verify --print-certs "$OUT" | grep -E "Signer #1 certificate (DN|SHA-256)"
echo "Готово: $OUT ($(du -h "$OUT" | cut -f1))"
