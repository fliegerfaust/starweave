# Telegram Mini App — пошагово

Игра открывается в Telegram с того же адреса, что и в браузере
(https://fliegerfaust.github.io/starweave/). Отдельной сборки нет: игра сама узнаёт, что её
открыли из Telegram (`src/platform/telegram.ts`), и тогда:

- разворачивается на весь экран на телефонах, свайп вниз не закрывает игру;
- красит шапку и фон Telegram в цвет ночного неба;
- отступает сверху под кнопки Telegram («Закрыть», «…») и снизу под системную полосу;
- берёт язык из профиля Telegram;
- **вибрирует через клиент Telegram — работает и на iPhone**;
- хранит прогресс в облаке Telegram (CloudStorage): тот же забег на телефоне и компьютере;
- «Поделиться» результатом вызова дня открывает выбор чата Telegram;
- «Бросить вызов» после обычного забега отправляет в чат ссылку
  `t.me/starweave_game_bot/play?startapp=c_<сид>_<небо>_<звёздность>_<глава>_<лучший ход>`:
  друг открывает тот же расклад и видит, чей итог надо побить (`src/game/challenge.ts`).
  Ссылка `?startapp=src_<канал>` — метка рекламного источника в аналитике (`app_open.source`).

Покупки — за Telegram Stars: «Звёздный атлас», внешний вид, набор мецената, чаевые. Счета
выставляет наш сервер (раздел «Покупки за Stars» ниже). Рекламы пока нет (AdsGram — N.4).

## 1. Бот и Mini App (Денис, ~10 минут)

В Telegram открыть [@BotFather](https://t.me/BotFather):

1. `/newbot` → имя: `Звёздное плетение` → username, например `starweave_game_bot`
   (должен кончаться на `bot`).
2. `/newapp` → выбрать бота →
   - название: `Звёздное плетение`;
   - описание: `Карточная головоломка о созвездиях: выкладывай звёзды, собирай линии и плети кресты.`;
   - картинка 640×360: `store/telegram/app-640x360-ru.png`;
   - GIF: пропустить (`/empty`);
   - адрес: `https://fliegerfaust.github.io/starweave/`;
   - короткое имя: `play`.

   BotFather пришлёт ссылку вида `https://t.me/starweave_game_bot/play` — это ссылка на игру.
3. `/setmenubutton` → бот → адрес `https://fliegerfaust.github.io/starweave/` → текст
   `Играть`. Кнопка появится в чате с ботом слева от поля ввода.
4. (По желанию) `/setdescription` и `/setabouttext` — тексты бота; `/setuserpic` — иконка
   `store/yandex/icon-512.png`.
5. (По желанию) в @BotFather → бот → Bot Settings → Configure Mini App → Enable: игра
   откроется из профиля бота кнопкой «Открыть».

## 2. Ссылка «Поделиться»

Прислать мне ссылку из шага 2 — я сохраню её в настройках репозитория, и следующая
сборка будет делиться ссылкой на игру в Telegram, а не на сайт:

```bash
gh variable set TG_APP_LINK --body "https://t.me/starweave_game_bot/play" -R fliegerfaust/starweave
```

## 2а. Аналитика Telegram (без сервера)

Telegram считает запуски Mini App, аудиторию и удержание сам — нужен только ключ:

1. Открыть [@DataChief_bot](https://t.me/DataChief_bot) (или раздел Analytics на
   [builders.ton.org](https://builders.ton.org)) и зарегистрировать приложение: ссылка на бота
   `https://t.me/starweave_game_bot`, домен `fliegerfaust.github.io`.
2. Придумать идентификатор (например, `starweave`) — это `appName`; бот выдаст токен.
3. Прислать оба значения мне или выполнить:

```bash
gh variable set TG_ANALYTICS_TOKEN --body "<токен>" -R fliegerfaust/starweave
```

```bash
gh variable set TG_ANALYTICS_APP --body "starweave" -R fliegerfaust/starweave
```

Следующий деплой подключит аналитику (`src/platform/telegram.ts`). Наши подробные события
(обучение, ночи, смерти, покупки) идут на свой сервер — сводка https://game.denvalclass.ru/stats
([server/README.md](../server/README.md)); Метрика добавится, когда будет счётчик.

## 3. Проверка

- [ ] Ссылка `t.me/<бот>/play` открывает игру на весь экран, меню на русском.
- [ ] Шапка Telegram тёмная, кнопки Telegram не перекрывают счёт и меню.
- [ ] Перетаскивание карты вниз не закрывает игру.
- [ ] Нажатия и выкладка карт вибрируют (iPhone и Android).
- [ ] Закрыть посреди забега, открыть на другом устройстве с тем же аккаунтом — забег на месте.
- [ ] В конце вызова дня «Поделиться» открывает выбор чата.
- [ ] Меню → «Звёздный атлас»: цены в ⭐, окно оплаты Telegram открывается, после оплаты бот
      пишет «Спасибо!», атлас открыт (архив, «Астролябия», рубашка и небо в примерочной).

Если что-то не так — скриншот и пара слов, что делал. Для диагностики можно открыть сайт с
`?debug` в обычном браузере телефона.

## 4. Витрина в Telegram (GR.2, Денис, ~30 минут)

Цель — игра становится «основным мини-приложением» бота: на профиле крупная кнопка
«Открыть», превью (скриншоты и видео), игра попадает в раздел «Приложения» поиска Telegram.
Боты с основным мини-приложением и оплатой в Stars (она у нас есть) могут попасть в
витрину Mini App Store. Названия пунктов в BotFather иногда меняются — ориентир по смыслу.

1. **Основное мини-приложение.** @BotFather → `/mybots` → `@starweave_game_bot` →
   Bot Settings → Configure Mini App → Enable Mini App → адрес
   `https://fliegerfaust.github.io/starweave/`. Если пункта не видно — открыть @BotFather
   кнопкой «Open» (у него своё мини-приложение) → бот → раздел Mini App → Main App.
2. **Превью.** Там же, в настройках Mini App, — пункт про превью (Preview Media). Загрузить
   по порядку вертикальные снимки 1080×1920:
   `store/screens/ru/portrait-2-cross.png` (крест — главный «вау»), `portrait-3-shop.png`,
   `portrait-4-map.png`, `portrait-1-menu.png`. Для английского языка — те же из
   `store/screens/en/`. Первым лучше поставить видео (шаг 3).
3. **Видео** — готово: `store/telegram/preview-ru.mp4` (25 с) и `preview-en.mp4` (22 с),
   1080×1920. Сценарий — режим `?demo` (`src/dev/demo.ts`, только в разработке): середина
   забега, пять Знамений, «Каскад», затем крест «Флеш + Тройка» с «Цепь ×3» и победа в ночи.
   Пересоздать: `npm run dev`, затем в iOS-симуляторе
   `xcrun simctl io booted recordVideo --codec=h264 demo.mov` и открыть
   `http://localhost:5173/?demo` (`&lang=en` — английский); обрезать начало и панели Safari:
   `ffmpeg -ss 2.2 -to 27.5 -i demo.mov -vf "crop=1206:2144:0:180,scale=1080:1920,fps=30,format=yuv420p" -c:v libx264 -crf 20 -an preview-ru.mp4`.
4. **Тексты бота** (`/setdescription` — то, что видно до старта, `/setabouttext` — профиль;
   BotFather спросит язык — заполнить ru и en):
   - Описание ru: `Звёздное плетение — карточная головоломка о созвездиях. Выкладывай
     звёзды на небо 4×4, собирай линии, плети кресты и пройди восемь глав с Затмениями.
     Партия — 10–15 минут, каждый день новый вызов. Брось вызов другу — он сыграет тот же
     расклад.`
   - Описание en: `Starweave is a card puzzle about constellations. Place stars on a 4×4
     sky, light up lines, weave crosses and survive eight chapters of Eclipses. A run takes
     10–15 minutes, with a new daily challenge every day. Challenge a friend to play the
     very same deal.`
   - О боте ru (до 120 знаков): `Карточная головоломка о созвездиях: линии на небе 4×4,
     вызов дня и вызовы друзьям.`
   - О боте en: `A card puzzle about constellations: light up lines on a 4×4 sky, daily
     challenge, duels with friends.`
5. **Загрузочный экран.** @BotFather → `/mybots` → бот → Bot Settings → Configure Mini App →
   Configure Splash Screen → прислать файлом `store/telegram/splash.svg` (SVG 512×512, один
   `<path>`: силуэт «пары карт»; пересоздать — `node scripts/make-splash.mjs`). Цвет фона —
   `#070818` для светлой и тёмной темы (тот же, что красит игра при запуске), цвет шапки — тот же.
   Проверить — «Open Splash Screen Preview».
6. **Иконка бота** — `/setuserpic` → `store/yandex/icon-512.png` (если ещё не стоит).
7. **Проверка:** открыть профиль бота с другого аккаунта — кнопка «Открыть», превью
   листаются; в поиске Telegram на вкладке «Приложения» игра видна (у тех, кто её уже
   запускал).

## 5. Каталоги мини-приложений (GR.3, Денис, ~20 минут)

**Telegram Apps Center (tApps Center)** — самый крупный каталог. Заявка бесплатная,
модерация ручная; по сторонним обзорам, подаётся через бота @app_moderation_bot. Официальной
пошаговой инструкции в открытых источниках нет — бот сам спросит, что нужно. Скорее всего:

- ссылка: `https://t.me/starweave_game_bot/play`;
- название `Starweave`, описание **на английском** (текст en из шага 4 выше);
- категория — Games (Puzzle / Card);
- иконка 512×512: `store/yandex/icon-512.png`; обложка: `store/telegram/app-640x360-en.png`;
- скриншоты: `store/screens/en/portrait-*.png`;
- доступ к аналитике — у нас подключена аналитика Telegram (@DataChief_bot), этого
  обычно достаточно;
- контакт разработчика — свой Telegram.

Если бот откажет или попросит то, чего нет, — прислать мне его ответ, доделаем.

**Другие каталоги** (по желанию, когда будет время): FindMini и подобные агрегаторы
мини-приложений — та же связка материалов.

## 6. Как продвигать

План и каналы — [PROMOTION.md](PROMOTION.md). Главное в Telegram:

- «Бросить вызов» после забега — ссылка с тем же раскладом; чем больше вызовов уходит в
  чаты, тем больше новых игроков.
- Вызов дня — повод делиться каждый день.
- Ссылки для рекламы — с меткой источника: `t.me/starweave_game_bot/play?startapp=src_<канал>`
  (латиница, цифры, `_`, `-`), в аналитике это `app_open.source`.

## Покупки за Stars — включены 13.10.2026

Как устроено и как это было включено (если придётся повторить на другом сервере):

1. Токен бота: @BotFather → `/mybots` → @starweave_game_bot → **API Token**.
2. Свой Telegram ID (куда бот будет присылать оплаты и обращения): написать @userinfobot.
3. Дописать в `/opt/starweave/.env` на сервере:
   ```
   BOT_TOKEN=<токен>
   TG_WEBHOOK_SECRET=<результат openssl rand -hex 24>
   TG_ADMIN_CHAT_ID=<твой ID>
   ```
4. Перезапустить и подключить вебхук (меню команд /start, /paysupport, /terms ставится там же):
   ```bash
   ssh denval 'cd /opt/starweave && docker compose up -d && docker compose run --rm --no-deps api node server/scripts/set-webhook.ts'
   ```
5. Написать боту `/start` — придёт кнопка «Играть». В игре: меню → «Звёздный атлас» → цены в ⭐.
6. Проверить оплату настоящей покупкой: чаевые за 25 ⭐ и возврат командой
   `/refund <id> <charge_id>` (бот пришлёт оба числа после оплаты) — AT.10.

С сервера Bot API доступен только по IPv6, поэтому у контейнера своя сеть с IPv6
(`server/deploy/docker-compose.yml`). Пока на сервере нет токена или сервер недоступен, игра
показывает в атласе «Покупки здесь скоро откроются», а не ошибку оплаты.

Команды автора в чате с ботом: `/sales` — сводка, `/reply <id> <текст>` — ответить игроку,
`/refund <id> <charge_id>` — вернуть Stars. Обращения игроков (любое сообщение боту) бот
пересылает автору. Вывод Stars — @BotFather → бот → Monetization (через Fragment).

Требования Telegram к цифровым товарам выполнены: оплата только в Stars, команды `/paysupport`
и `/terms`, ответ на `pre_checkout_query`, возвраты через `refundStarPayment`.
