# Android (эпик APK)

Сборка для паблишеров: Capacitor 8 поверх обычной веб-сборки, площадка `android`
(`src/platform/android.ts`). Рекламы и покупок нет, их SDK подключаются отдельным адаптером
`Platform`. Шейдеры на Android включены всегда: паблишеры смотрят самую красивую версию.

## Что нужно на машине
- JDK 21 (стоит Azul Zulu в `~/Library/Java/zulu21…/Contents/Home`), Android SDK в
  `~/Library/Android/sdk`: platform 36, build-tools 35 и 36. Android Studio не обязательна.
- `android/local.properties` с `sdk.dir=…` (в git не лежит).

## Сборка
```bash
npm run build:android
```
```bash
cd android && JAVA_HOME=$(echo ~/Library/Java/zulu21*/Contents/Home) ./gradlew assembleDebug
```
APK: `android/app/build/outputs/apk/debug/app-debug.apk`. Установка на телефон по USB:
`adb install -r <apk>`. Сеть с dl.google.com иногда рвётся посреди скачивания: повторить сборку.

## Что внутри и почему
| Что | Где | Зачем |
|---|---|---|
| id `com.denvalgames.starweave` | `capacitor.config.ts`, `android/app/build.gradle` | выбор Дениса, после публикации не меняется |
| адрес WebView `https://localhost` | по умолчанию | от него зависит `localStorage`: сменить — потерять сохранения |
| рисование под системными панелями | `MainActivity.java` | до Android 15 отступы шли дважды |
| масштаб текста 100% | `MainActivity.java` | системный «Размер шрифта» ломал плашки, в игре своя настройка |
| WebView не ниже 108 | `capacitor.config.ts` | вёрстка на `:has()` и `dvh`; ниже — страница `android-www/webview-old.html` |
| строгая CSP | `src/security/csp.ts` | скрипты только свои, сеть только к `game.denvalclass.ru` |
| заставка запуска | `src/platform/boot-cover.ts`, `vite.config.ts` | на первом запуске видеочип компилирует программы, это прячется за ней |
| звук 24 кГц, буфер побольше | `src/engine/audio.ts` | с буфером 5 мс динамик хрипел |
| без лишних шрифтов | `scripts/slim-android.mjs` | минус 69 КБ |

## Сервер
Приложение шлёт события с площадкой `android` и адреса `https://localhost`: оба разрешены в
`server/src/validate.ts` и `server/deploy/docker-compose.yml`. Пока сервер не выкачен с этими
правками, Зал славы, тексты с сервера и аналитика из приложения не работают; игра от этого не ломается.

## Как мерить плавность
Только живым прохождением: чистая установка (`adb shell pm clear …`), настоящие касания
(`adb shell input swipe`), запись всех кадров, несколько прогонов, проверка, что шейдеры правда
работают. Синтетика на одном экране врёт. Код страницы на телефоне: `node scripts/android-eval.mjs '<js>'`.
Дев-сервер на телефоне: `CAP_SERVER_URL=http://localhost:5173 npx cap copy android`, сборка,
`adb reverse tcp:5173 tcp:5173`. Перед обычной сборкой снова `npm run build:android`.

Galaxy A12 (SM-A127F, Android 13, 3 ГБ, WebView 150) после эпика: обучение 44–46 кадров,
худший кадр 0,3–0,4 с, срывов звука 0; заставка ~6–7 с на первом запуске, ~2 с потом.
