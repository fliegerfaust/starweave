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
4. Сохрани в `store/crazygames/art/`: `key-16x9.png`, `key-2x3.png`, `key-1x1.png`.

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

### Промпт 2 — вертикальная обложка 2:3 (1024×1536, в том же чате)

```
Same game, same art style, same palette and lighting as the image you just made. Now a vertical portrait composition, 2:3.

The four glowing cards (sun gold, moon silver-blue, star violet, comet crimson, each with a large white numeral 7 and a tiny constellation in the corner, thin gold rims) stand in a vertical column in the lower-middle part of the image, slightly overlapping and tilted, a bright white-gold constellation beam running down through all four, with bloom and sparks where the light is strongest.

Above them, in the top third, a large calm area of deep indigo sky with a soft violet nebula and faint constellation lines — leave it empty as clean negative space for a title added later. Keep important details away from the outer 8% of the edges.

Strictly no text, no letters, no logo, no UI, no frame, no watermark, no people.
```

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

## 3. Что я сделаю сам (CG-35)

- Адаптер SDK, сборку `npm run build:crazygames` → `release/starweave-crazygames.zip` без рекламы.
- Обложки 1920×1080, 800×1200, 800×800 из твоего арта + название (отдельная иконка CrazyGames не нужна).
- Видео **15–20 с, без звука, 1080p, 16:9 и 2:3**, первый кадр — обложка (`npm run clips`).
- Тексты витрины на английском: `store/crazygames/listing.md` — название, короткое и полное
  описание, «How to play», управление, теги.
- Проверку вёрстки на размерах окна CrazyGames и в Safari/iOS.

## 4. Выкладка — шаги в кабинете

1. **Аккаунт.** [developer.crazygames.com](https://developer.crazygames.com) → регистрация →
   принять Developer Terms.
2. **Submit a game.** Название — `Starweave`. Тип — HTML5. Загрузить
   `release/starweave-crazygames.zip` (сборку дам я). Ориентации: **landscape и portrait**.
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
