# CrazyGames — что сделать Денису

Короткая инструкция по выкладке (PL.2, CG-34). Исследование и требования —
[CRAZYGAMES.md](CRAZYGAMES.md). Задачи: **CG-36** — твоя выкладка, **CG-35** — код и сборка (Claude).
Выплаты не трогаем — ты их уже проверил.

## Коротко

1. Решаешь 3 вопроса (ниже) → я делаю сборку и материалы (~4–5 дней).
2. Ты генерируешь **3 картинки** по промптам и кладёшь в `store/crazygames/art/`.
3. Я собираю из них обложки с названием, режу видео, пишу тексты — ты утверждаешь.
4. Ты регистрируешься, загружаешь zip в Preview, проходишь QA-инструмент, жмёшь «Basic Launch».
5. Через 7–21 день присылаешь метрики (время сессии, D1, конверсия).

**Попытка одна** — провал метрик на Basic Launch закрывает игру. Поэтому выходим только с
готовой сборкой и проверкой в Preview на ПК и телефоне.

## 1. Решить до начала (ответь в CG-36)

| Вопрос | Моё предложение |
|---|---|
| Атлас (покупки) на CrazyGames | Открыть атлас бесплатно — «полная версия» на портале. Магазин и кнопку Telegram скрыть |
| Эксклюзив +50 % на 2 месяца | Не брать: Pages и Telegram, скорее всего, считаются другими порталами |
| Когда выходить | После проверки D1 в Telegram (W.1, CG-12), но не ждать 0.8 |

## 2. Что от тебя по картинкам

CrazyGames требует **три обложки в одном стиле**: 1920×1080 (16:9), 800×1200 (2:3), 800×800 (1:1).
Из текста — **только название**, без рамок, логотипов, «New», «Play», рейтингов, персонажей
чужих игр. Обложка — главное, от чего зависит клик в каталоге, а клики решают метрики Basic Launch.

Скриншоты и видео я сниму из игры сам (`store-assets`, `clips`). От ChatGPT нужен только
**сочный ключевой арт** — то, что код игры не нарисует.

**Как генерировать.** ChatGPT Image умеет 1536×1024, 1024×1536 и 1024×1024 — это 3:2, 2:3 и 1:1.
Генерируешь три картинки **без текста**, я дорежу 3:2 до 16:9, подниму разрешение и наложу
«Starweave» шрифтом игры (так название везде одинаковое и без кривых букв). Если
понравится, как модель сама пишет название, — сделай по одной версии с текстом, сравним.

1. Начни с **промпта 1 (16:9)** — он задаёт стиль. Сгенерируй 3–4 варианта, выбери лучший.
2. Промпты 2 и 3 вводи **в том же чате** после выбранной картинки — так стиль сохранится.
3. Если модель добавила текст, рамку или лишние карты — допиши «remove all text and frames».
4. Сохрани в `store/crazygames/art/`: `key-16x9`, `key-2x3`, `key-1x1` (PNG или WebP). ✅ Все три приняты 21.10: `key-16x9.webp` (2000×1125), `key-2x3.webp` (1333×2000), `key-1x1` — вырезан из вертикали 1333×1333, чтобы стиль совпал (отдельный квадрат вышел «таро» и в другом стиле).

### Общий стиль (уже вшит в каждый промпт)

Глубокий космос, индиго и фиолет; четыре масти игры — **Солнце** (золото), **Луна**
(серебристо-голубой), **Звезда** (фиолет, четырёхлучевая), **Комета** (алый); карты с тонкой
золотой каймой и крупной цифрой; линия созвездия, вспыхивающая светом. Как на скриншоте
`store/screens/en/landscape-2-cross.png` — приложи его к первому промпту.

### Промпт 1 — главная обложка 16:9 (генерировать в 1536×1024)

```
Use the attached screenshot only as a reference for the card style and colours, not for layout.

Key art for a premium mobile/browser card puzzle game called Starweave. Wide landscape composition, 3:2, cinematic, high detail, painterly digital illustration with soft volumetric light — like the cover of a top-rated indie game.

Scene: a deep night sky, rich indigo to violet gradient with a subtle nebula of magenta and teal, fine dust of tiny stars. In the right two-thirds, four large glowing playing cards float in a slightly fanned, gently tilted row, seen in mild perspective, each card a dark glass-like panel with a thin warm-gold rim and rounded corners:
- a gold card with a radiant sun disc with rays,
- a silver-blue card with a crescent moon,
- a violet card with a four-pointed star,
- a crimson card with a comet with a sweeping tail.
Each card shows one large bold white numeral in the top-left corner (7, 7, 7, 7) and a tiny constellation pattern of dots and thin lines in the top-right corner.
A bright beam of white-gold light runs straight through the four cards, connecting them like a constellation line being ignited, with a soft bloom, light streaks and small sparks bursting outward at the brightest point. Thin faint constellation lines connect distant stars in the background.

The left third is calmer, darker open sky with only soft stars — leave it empty as clean negative space for a title that will be added later.

Mood: magical, calm but exciting, a moment of "it all clicked". Colour palette: indigo, violet, warm gold, silver-blue, crimson accents. Crisp edges on the cards, glow and bloom only on the light.

Strictly no text, no letters, no logo, no title, no UI, no buttons, no frame or border, no watermark, no people or hands, no table, no casino or poker chips.
```

### Промпт 2 — вертикальная обложка 2:3 (1024×1536)

Первая версия («четыре карты столбиком») не работает: четыре высокие карты не влезают в
высоту, и модель сплющивает их в квадраты и наклоняет в перспективу. Поэтому карты — **сеткой
2×2**, как кусок неба 4×4 из игры, а пропорции и плоский вид заданы прямо.

Лучше в **новом чате**: приложи готовую горизонтальную обложку (`key-16x9`) как образец карт.

```
Use the attached image as the exact reference for the card design, colours, glow and background style. Recreate the same four cards in a new vertical composition, 2:3 portrait.

Card shape — very important: every card is a tall upright rectangle with real playing-card proportions, height exactly 1.4 times the width (5:7), rounded corners, thin warm-gold rim. Cards are shown perfectly flat and facing the camera straight on, like a front scan: no perspective, no 3D tilt, no foreshortening, no squashing, all four cards exactly the same size and shape. Only a tiny in-plane rotation of 2–4 degrees is allowed.

Layout: the four cards in a neat 2×2 grid with small even gaps, centred horizontally, occupying the lower-middle part of the image (roughly from 40% to 92% of the height, each card about 30% of the image width). No overlap between cards.
Top-left: gold card with a radiant sun. Top-right: silver-blue card with a crescent moon. Bottom-left: violet card with a four-pointed star. Bottom-right: crimson card with a comet.
Each card has one large bold white numeral 7 in the top-left corner and a tiny constellation of dots and lines in the top-right corner.

Light: a bright white-gold beam of light runs horizontally through the centres of the two top cards, and a second beam runs vertically through the centres of the two right cards; the beams cross on the moon card with a strong bloom and a burst of small sparks — a constellation being ignited.

Background: the same deep indigo-violet night sky with soft magenta and teal nebula and fine stars. The top 35% of the image is calm, darker open sky with only faint stars — leave it empty as clean negative space for a title added later. Keep all cards away from the outer 6% of the edges.

Strictly no text, no letters, no logo, no title, no UI, no frame or border, no watermark, no people or hands, no table.
```

Если всё равно сплющивает — допиши в том же чате: «The cards are still squashed. Make every
card a tall 5:7 rectangle, perfectly flat, front-facing, same size — like the cards in the
reference image». Запасной вариант — пришли лучшую попытку как есть: я соберу 2:3 сам из
горизонтальной обложки (карты из неё + её же фон, достроенный вверх).

### Промпт 3 — квадрат 1:1 (1024×1024, в том же чате)

```
Same game, same art style, palette and lighting. Now a square composition, 1:1, readable even when shown small as a thumbnail.

One single hero card in the centre, slightly tilted, larger and closer than before: the violet star card with a big white four-pointed star, a large white numeral 9 in the top-left corner and a tiny constellation in the top-right corner, thin gold rim. Behind it, partly hidden and fanned out, the sun, moon and comet cards. A bright white-gold constellation line crosses the hero card diagonally and bursts into light and sparks at its centre. Simple dark indigo-violet starry background with a soft nebula glow, strong contrast between the bright card and the dark sky.

Leave a calm empty band along the bottom fifth for a title added later.

Strictly no text, no letters, no logo, no UI, no frame, no watermark, no people.
```

**Что проверить в результате:** четыре масти узнаются (солнце, полумесяц, четырёхлучевая
звезда, комета); на картах нет лишних символов и чужих букв; цифры одинаковые и читаемые; есть
пустое место под название; в маленьком размере (как в каталоге, ~200 px) видно карты и вспышку.

## 3. Что сделал я (CG-35)

| Что | Где |
|---|---|
| Адаптер SDK v3: загрузка, игра/пауза, звук от сайта, язык, сохранения, вызов друга | `src/platform/crazygames.ts`, тест `tests/crazygames.test.ts` |
| Сборка без рекламы для Basic Launch | `npm run build:crazygames` → `release/starweave-crazygames.zip` (39 файлов, ~0,5 МБ) |
| Атлас и внешний вид бесплатно; «Поддержать», вещи мецената и «без рекламы» скрыты | `grants` площадки, `src/ui/screens/atlas.ts` |
| Обложки 1920×1080, 800×1200, 800×800 с названием | `store/crazygames/cover-*.png` (`node scripts/crazygames-covers.mjs`) |
| Видео 16:9 и 2:3, ~15 с, без звука, первый кадр — обложка | `store/crazygames/video-*.mp4` (`scripts/crazygames-video.mjs`) |
| Тексты витрины (en) и поля формы | `store/crazygames/listing.md` |
| Вёрстка на окнах CrazyGames при DPR 1 | fit-audit чист на 907×510, 1216×684, 1280×720, 1920×1080, 800×450, 1080×607 |

**Для Full Launch** — собрать с рекламой: `VITE_CG_ADS=1 npm run build:crazygames`. Реклама
пойдёт через SDK (midgame между главами, rewarded на «второй шанс» и «удвоить»); дар атласа
рекламу не убирает — её убирает только купленный атлас.

**Своей аналитики в сборке нет** (адрес событий не задан): метрики даёт кабинет CrazyGames,
окна согласия не нужно. Включить свою — отдельное решение: адрес CrazyGames в
`ALLOWED_ORIGINS` сервера и ссылка на политику в игре.

## 4. Выкладка — шаги в кабинете

1. **Аккаунт.** [developer.crazygames.com](https://developer.crazygames.com) → регистрация →
   принять Developer Terms.
2. **Submit a game.** Название — `Starweave`. Тип — HTML5. Загрузить
   содержимое папки `dist-crazygames/` (`npm run build:crazygames`): zip портал не принимает — выделить всё внутри папки (⌘A) и перетащить файлы. Ориентации: **landscape и portrait**.
   Поддержка мобильных: **да**. Включить **Progress Save** (сохранения через SDK).
3. **Preview.** Сыграть в их окружении: ПК (Chrome), телефон (Android и iPhone), планшет.
   Пройти **QA-инструмент** по шагам — он сам подсказывает, чего не хватает. Если что-то
   красное — скинь скриншот в CG-35, поправлю и дам новый zip.
4. **Материалы.** Загрузить 3 обложки, 2 видео, тексты из `listing.md`. Категория — **Card**,
   дополнительная — **Puzzle**. Теги: card, puzzle, roguelike, deckbuilder, strategy, singleplayer.
   Языки: English, Russian. Возраст: PEGI 12.
5. **Отправить на Basic Launch.** Дальше — проверка людьми; обновления на Basic Launch
   принимают сразу.
6. **Ждать 7–21 день.** Basic Launch идёт минимум 7 дней и 500 игр. Не выкладывать за это время
   ничего крупного, только исправления.
7. **Метрики.** Из кабинета: среднее время сессии (цель 10+ мин), D1 (цель 10 %+), конверсия
   «играли ≥ 1 мин» (цель 80 %). Скинь в CG-36 — решим, идём ли на Full Launch и с какой
   рекламой.

## 5. Чего не делать

- Не писать в описании про Telegram, свой сайт, Яндекс, сторы — кросс-промо запрещено.
- Не загружать сборку для Telegram или Pages — только `starweave-crazygames.zip`.
- Не включать рекламу на Basic Launch — её там нет, кнопки рекламы в сборке скрыты.
- Не отправлять на проверку до того, как Preview пройден на телефоне.
