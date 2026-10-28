# Telegram Mini App

## Статус

Работает: бот [@starweave_game_bot](https://t.me/starweave_game_bot), игра
https://t.me/starweave_game_bot/play (короткое имя `play`, переменная репозитория `TG_APP_LINK`).
Сейчас 0.7.10. Покупки за Stars и реклама AdsGram проверены Денисом; настоящих покупок пока нет.

**Осталось (всё за Денисом):**
- FP.9 (CG-7): витрина в BotFather, раздел ниже;
- GR.3 (CG-40): каталоги мини-приложений;
- аналитика Telegram (по желанию): ключ не задан.

## Сборка и выкладка

Отдельной сборки нет: та же страница, что на Pages, выходит вместе с ней по тегу `vX.Y.Z`
(`.github/workflows/pages.yml`). Игра сама узнаёт Telegram (`src/platform/telegram.ts`) и тогда:

- на весь экран, свайп вниз не закрывает, шапка и фон в цвет неба; отступы под кнопки
  Telegram и системную полосу; язык из профиля;
- вибрация через клиент (работает и на iPhone);
- прогресс в CloudStorage: тот же забег на телефоне и компьютере;
- «Поделиться» итогом вызова дня открывает выбор чата;
- «Бросить вызов»: `t.me/starweave_game_bot/play?startapp=c_<сид>_<небо>_<звёздность>_<глава>_<лучший ход>`,
  друг играет тот же расклад (`src/game/challenge.ts`);
- `?startapp=src_<канал>` (латиница, цифры, `_`, `-`): метка источника (`app_open.source`).

Покупки: Stars через наш сервер. Реклама: AdsGram ([ADS.md](ADS.md)). Диагностика: сайт с `?debug`.

## Покупки за Stars

Сервер game.denvalclass.ru, в `/opt/starweave/.env`: `BOT_TOKEN`, `TG_WEBHOOK_SECRET`
(`openssl rand -hex 24`), `TG_ADMIN_CHAT_ID`. Вебхук и меню команд:
`ssh denval 'cd /opt/starweave && docker compose up -d && docker compose run --rm --no-deps api node server/scripts/set-webhook.ts'`.
Bot API с этого VPS доступен только по IPv6 (у контейнера своя сеть с IPv6). Без токена атлас
пишет «Покупки здесь скоро откроются».

Команды автора боту: `/sales` (сводка), `/reply <id> <текст>` (ответ игроку, сообщения игроков
бот пересылает автору), `/refund <id> <charge_id>` (возврат Stars).

Требования Telegram выполнены: оплата только в Stars, `/paysupport` и `/terms`, ответ на
`pre_checkout_query`, возвраты через `refundStarPayment`.

## Витрина в BotFather (FP.9, Денис, ~30 минут)

Цель: игра как основное мини-приложение бота с кнопкой «Открыть», превью и местом в разделе
«Приложения»; вместе с оплатой в Stars это путь в Mini App Store. Пункты BotFather меняются,
ориентир по смыслу.

1. @BotFather → `/mybots` → бот → Bot Settings → Configure Mini App → Enable →
   `https://fliegerfaust.github.io/starweave/`.
2. Превью (профиль бота на телефоне → «Предпросмотр» → «Основной», до 12 файлов):
   `store/telegram/preview-ru.mp4`, затем `store/screens/ru/portrait-2-cross.png`,
   `portrait-3-shop.png`, `portrait-4-map.png`, `portrait-1-menu.png`; язык English: то же из
   `store/screens/en/` и `preview-en.mp4`.
3. Картинки: `/setuserpic` → `store/telegram/avatar-1024.png`; `/setdescriptionpic` →
   `store/telegram/description-640x360.png`; `/myapps` → Edit Photo →
   `store/telegram/app-640x360-ru.png`; Configure Splash Screen → `store/telegram/splash.svg`,
   фон и шапка `#070818`.
4. Тексты (`/setdescription`, `/setabouttext`):
   - описание ru: «Звёздное плетение: карточная головоломка о созвездиях. Выкладывай звёзды на
     небо 4×4, собирай линии, плети кресты и пройди восемь глав с Затмениями. Партия 10–15
     минут, каждый день новый вызов. Брось вызов другу: он сыграет тот же расклад.»
   - описание en: «Starweave is a card puzzle about constellations. Place stars on a 4×4 sky,
     light up lines, weave crosses and survive eight chapters of Eclipses. A run takes 10–15
     minutes, with a new daily challenge every day. Challenge a friend to play the very same deal.»
   - о боте ru: «Карточная головоломка о созвездиях: линии на небе 4×4, вызов дня и вызовы друзьям.»
   - о боте en: «A card puzzle about constellations: light up lines on a 4×4 sky, daily
     challenge, duels with friends.»
5. Проверка с другого аккаунта: кнопка «Открыть», превью листаются.

Пересоздать материалы: видео превью через `?demo` (`src/dev/demo.ts`) и запись в iOS-симуляторе
`xcrun simctl io booted recordVideo --codec=h264 demo.mov`, затем
`ffmpeg -ss 2.2 -to 27.5 -i demo.mov -vf "crop=1206:2144:0:180,scale=1080:1920,fps=30,format=yuv420p" -c:v libx264 -crf 20 -an preview-ru.mp4`;
загрузочный экран `node scripts/make-splash.mjs`; остальное `npm run store-assets`.

## Каталоги (GR.3, Денис)

- **FindMini.app**: https://www.findmini.app/submit/, бесплатно, до 7 дней; поля и картинки в
  `store/findmini/listing.md`.
- **tApps Center**: на 14.10 был закрыт на переделку, проверить.
- **Mini App Store**: заявки нет, туда попадают боты с основным мини-приложением, превью и Stars.

## Аналитика Telegram (не подключена)

Наши события и так идут на сервер (https://game.denvalclass.ru/stats). Если нужна и встроенная:
[@DataChief_bot](https://t.me/DataChief_bot) → приложение (бот `https://t.me/starweave_game_bot`,
домен `fliegerfaust.github.io`, идентификатор `starweave`), затем
`gh variable set TG_ANALYTICS_TOKEN --body "<токен>" -R fliegerfaust/starweave` и
`gh variable set TG_ANALYTICS_APP --body "starweave" -R fliegerfaust/starweave`; подключится
со следующим тегом.
