# Материалы для витрин

Скриншоты, обложки и иконки снимает `npm run store-assets` (Playwright, `e2e/store-assets.spec.ts`;
обложка по `?promo`). Остальное делают скрипты из таблицы. Перегенерировать после изменений интерфейса.

| Площадка | Что | Файлы и чем сделаны |
|---|---|---|
| Telegram | аватар 1024×1024 | `telegram/avatar-1024.png` |
| | описание 640×360 (`/setdescriptionpic`) | `telegram/description-640x360.png` (`?promo&desc`) |
| | Mini App 640×360 | `telegram/app-640x360-ru.png`, `-en.png` |
| | загрузочный экран (SVG, один path) | `telegram/splash.svg` (`node scripts/make-splash.mjs`) |
| | видео превью 1080×1920 | `telegram/preview-ru.mp4`, `-en.mp4` (`?demo`, `docs/TELEGRAM.md`) |
| Shorts, Клипы, Reels | ролики 1080×1920, 60 fps | `clips/*-ru.mp4`, `-en.mp4` (`npm run clips`, в git нет; `clips/README.md`) |
| Пикабу Игры | иконки 1024×1024 и 1920×1080 | `pikabu/icon-*.png` (`node scripts/pikabu-covers.mjs`, арт `pikabu/art/`, промпты `pikabu/art-prompts.md`) |
| | скриншоты 1920×1080 и 1080×1920 с заголовками | `pikabu/screens/*.jpg` (`node scripts/pikabu-screens.mjs <адрес dev-сервера>`) |
| Яндекс Игры | иконка 512×512, обложка 800×470 | `yandex/icon-512.png`, `yandex/cover-800x470-ru.png`, `-en.png`; тексты `yandex/listing.md` |
| FindMini | англ. портретные снимки в JPEG (до 1 МБ), аватар | `findmini/*`; заявка `findmini/listing.md` |
| Google Play, RuStore | баннер 1024×500 | `google-play/feature-1024x500-ru.png`, `-en.png` |
| Все | скриншоты 1080×1920 и 1920×1080 | `screens/{ru,en}/portrait-*.png`, `landscape-*.png` |
| App Store | 1290×2796 (6,9") | нет; добавить проект в `e2e/store-assets.spec.ts` к выходу на iOS |

Порядок скриншотов: 1 меню, 2 крест, 3 Обсерватория, 4 карта главы, 5 обучение.
`screens/`, `findmini/` и `clips/` сняты для 0.5.0 (16.10.2026): Дара ночи, развилок,
Коллекции и нового обучения на них нет, к следующей выкладке переснять.

Экраны атласа и архива на всех устройствах снимает `npm run e2e` (`e2e-results/<устройство>/`).
