# Telegram Mini App

Бот [@starweave_game_bot](https://t.me/starweave_game_bot), игра — https://t.me/starweave_game_bot/play
(короткое имя `play`). Отдельной сборки нет: та же страница, что на Pages; игра сама узнаёт
Telegram (`src/platform/telegram.ts`) и тогда:

- разворачивается на весь экран, свайп вниз не закрывает игру, шапка и фон Telegram — цвета неба;
- отступает под кнопки Telegram и системную полосу, берёт язык из профиля;
- вибрирует через клиент Telegram — работает и на iPhone;
- хранит прогресс в облаке Telegram (CloudStorage) — тот же забег на телефоне и компьютере;
- «Поделиться» итогом вызова дня открывает выбор чата;
- «Бросить вызов» отправляет `t.me/starweave_game_bot/play?startapp=c_<сид>_<небо>_<звёздность>_<глава>_<лучший ход>`:
  друг играет тот же расклад и видит, чей итог побить (`src/game/challenge.ts`);
- ссылка `?startapp=src_<канал>` (латиница, цифры, `_`, `-`) — метка источника в аналитике
  (`app_open.source`).

Покупки — Stars через наш сервер, реклама — AdsGram ([ADS.md](ADS.md)).

## 1. Проверка в настоящем Telegram
- [ ] Игра открывается на весь экран, кнопки Telegram не перекрывают счёт и меню.
- [ ] Выкладка карт вибрирует (iPhone и Android).
- [ ] Закрыть посреди забега, открыть на другом устройстве — забег на месте.
- [ ] «Поделиться» в конце вызова дня открывает выбор чата.
- [ ] «Второй шанс» и «Удвоить награду» показывают ролик AdsGram (AD.2).
- [ ] Атлас: цены в ⭐, оплата открывается, бот пишет «Спасибо!», атлас открыт (AT.10).

Для диагностики — сайт с `?debug` в браузере телефона.

## 2. Аналитика Telegram (не подключена)
Telegram сам считает запуски и удержание — нужен ключ:
1. [@DataChief_bot](https://t.me/DataChief_bot) → зарегистрировать приложение: бот
   `https://t.me/starweave_game_bot`, домен `fliegerfaust.github.io`, идентификатор `starweave`.
2. Задать переменные — следующий деплой подключит аналитику:

```bash
gh variable set TG_ANALYTICS_TOKEN --body "<токен>" -R fliegerfaust/starweave
```

```bash
gh variable set TG_ANALYTICS_APP --body "starweave" -R fliegerfaust/starweave
```

Наши подробные события и так идут на свой сервер — https://game.denvalclass.ru/stats.

## 3. Витрина в Telegram (GR.2, FP.9 — Денис, ~30 минут)
Цель: игра — основное мини-приложение бота, с кнопкой «Открыть», превью и местом в разделе
«Приложения» поиска; с оплатой в Stars это путь в Mini App Store. Названия пунктов BotFather
меняются — ориентир по смыслу.

1. **Основное мини-приложение:** @BotFather → `/mybots` → бот → Bot Settings → Configure Mini
   App → Enable → `https://fliegerfaust.github.io/starweave/`.
2. **Превью** — на профиле бота в Telegram на телефоне: «Предпросмотр» → «Основной» →
   «Добавить», до 12 видео и снимков:
   - первым видео `store/telegram/preview-ru.mp4`;
   - затем `store/screens/ru/portrait-2-cross.png`, `portrait-3-shop.png`, `portrait-4-map.png`,
     `portrait-1-menu.png`;
   - «+ Добавить язык» → English — то же из `store/screens/en/` и `preview-en.mp4`.
3. **Картинки:**
   - аватар — `/setuserpic` → `store/telegram/avatar-1024.png`;
   - картинка описания — `/setdescriptionpic` → `store/telegram/description-640x360.png`;
   - обложка — `/myapps` → Edit Photo → `store/telegram/app-640x360-ru.png`;
   - загрузочный экран — Configure Splash Screen → `store/telegram/splash.svg`, фон и шапка
     `#070818`.
4. **Тексты** — `/setdescription` и `/setabouttext`, ru и en:
   - описание ru: «Звёздное плетение — карточная головоломка о созвездиях. Выкладывай звёзды на
     небо 4×4, собирай линии, плети кресты и пройди восемь глав с Затмениями. Партия — 10–15
     минут, каждый день новый вызов. Брось вызов другу — он сыграет тот же расклад.»
   - описание en: «Starweave is a card puzzle about constellations. Place stars on a 4×4 sky,
     light up lines, weave crosses and survive eight chapters of Eclipses. A run takes 10–15
     minutes, with a new daily challenge every day. Challenge a friend to play the very same deal.»
   - о боте ru: «Карточная головоломка о созвездиях: линии на небе 4×4, вызов дня и вызовы
     друзьям.»
   - о боте en: «A card puzzle about constellations: light up lines on a 4×4 sky, daily
     challenge, duels with friends.»
5. **Проверка:** профиль бота с другого аккаунта — кнопка «Открыть», превью листаются.

Пересоздать видео превью: режим `?demo` (`src/dev/demo.ts`, только в разработке), запись в
iOS-симуляторе `xcrun simctl io booted recordVideo --codec=h264 demo.mov`, обрезка
`ffmpeg -ss 2.2 -to 27.5 -i demo.mov -vf "crop=1206:2144:0:180,scale=1080:1920,fps=30,format=yuv420p" -c:v libx264 -crf 20 -an preview-ru.mp4`.
Загрузочный экран — `node scripts/make-splash.mjs`.

## 4. Каталоги (GR.3)
- **FindMini.app** — https://www.findmini.app/submit/, бесплатно, до 7 дней. Поля и картинки —
  `store/findmini/listing.md`.
- **tApps Center** — на 14.10.2026 закрыт на переделку, проверить позже.
- **Mini App Store Telegram** — заявки нет: туда попадают боты с основным мини-приложением,
  превью и оплатой в Stars (раздел 3).

## 5. Покупки за Stars — включены 13.10.2026
Если придётся повторить на другом сервере:
1. В `/opt/starweave/.env`:
   - `BOT_TOKEN` (@BotFather → API Token);
   - `TG_WEBHOOK_SECRET` (`openssl rand -hex 24`);
   - `TG_ADMIN_CHAT_ID` (свой ID из @userinfobot).
2. Подключить вебхук и меню команд:
   `ssh denval 'cd /opt/starweave && docker compose up -d && docker compose run --rm --no-deps api node server/scripts/set-webhook.ts'`.
3. `/start` боту → кнопка «Играть»; в атласе — цены в ⭐.

Bot API с сервера доступен только по IPv6 — у контейнера своя сеть с IPv6. Без токена игра
пишет в атласе «Покупки здесь скоро откроются». Команды автора боту:
- `/sales` — сводка;
- `/reply <id> <текст>` — ответить игроку (сообщения игроков бот пересылает автору);
- `/refund <id> <charge_id>` — вернуть Stars.

Требования Telegram выполнены: оплата только в Stars, `/paysupport` и `/terms`, ответ на
`pre_checkout_query`, возвраты через `refundStarPayment`.
