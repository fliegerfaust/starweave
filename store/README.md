# Материалы для витрин

Сгенерированы командой `npm run store-assets` (Playwright снимает игру и обложку `?promo`).
Перегенерировать после изменений интерфейса — той же командой.

| Площадка | Что | Файлы |
|---|---|---|
| Telegram | аватар бота 1024×1024 | `telegram/avatar-1024.png` |
| | картинка описания 640×360 (`/setdescriptionpic`) | `telegram/description-640x360.png` (`?promo&desc`) |
| | загрузочный экран (SVG, один path) | `telegram/splash.svg` (`node scripts/make-splash.mjs`) |
| | видео превью 1080×1920 | `telegram/preview-ru.mp4`, `-en.mp4` (`?demo`, см. docs/TELEGRAM.md) |
| Shorts / Клипы / Reels | ролики 1080×1920, 60 fps | `clips/*-ru.mp4`, `-en.mp4` (`npm run clips`, в git не хранятся) |
| Яндекс Игры | иконка 512×512 | `yandex/icon-512.png` |
| | обложка 800×470 | `yandex/cover-800x470-ru.png`, `-en.png` |
| | скриншоты | `screens/ru/*`, `screens/en/*` |
| Telegram Mini App | картинка 640×360 | `telegram/app-640x360-ru.png`, `-en.png` |
| Пикабу Игры | иконки 1024×1024 и 1920×1080 | `pikabu/icon-*.png` (`node scripts/pikabu-covers.mjs`, арт — `pikabu/art/`, промпты — `pikabu/art-prompts.md`) |
| | скриншоты 1920×1080 и 1080×1920 с заголовками | `pikabu/screens/*.jpg` (`node scripts/pikabu-screens.mjs <адрес dev-сервера>`) |
| CrazyGames | обложки 1920×1080, 800×1200, 800×800 | `crazygames/cover-*.png` (`node scripts/crazygames-covers.mjs`, арт — `crazygames/art/`) |
| | видео 16:9 и 2:3 без звука | `crazygames/video-*.mp4` (`scripts/crazygames-video.mjs`), тексты — `crazygames/listing.md` |
| Google Play / RuStore | баннер 1024×500 | `google-play/feature-1024x500-ru.png`, `-en.png` |
| | скриншоты телефона 1080×1920 | `screens/*/portrait-*.png` |
| | скриншоты ландшафт 1920×1080 | `screens/*/landscape-*.png` |
| App Store | нужны 1290×2796 (6,9") — добавить проект в `e2e/store-assets.spec.ts`, когда дойдём до iOS | — |

Порядок скриншотов: 1 — меню, 2 — крест (главный «вау»), 3 — Обсерватория, 4 — карта
главы с Затмением, 5 — обучение. Пересняты для 0.5.0 (16.10.2026, редизайн всех экранов);
`findmini/*.jpg` — те же английские портретные снимки в JPEG (лимит 1 МБ). Ролики `clips/`
пересобраны тогда же.

Экраны атласа и архива на всех устройствах снимает `npm run e2e` (`e2e-results/*/2*.png`).
