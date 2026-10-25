# Арт для карточки Пикабу Игр

Две иконки: квадратная (от 1024×1024) и горизонтальная (от 1920×1080, 16:9). Рисуем в GPT Image,
название на горизонтальную накладывает `node scripts/pikabu-covers.mjs` шрифтом игры (Forum):
модели картинок плохо пишут кириллицу.

## Почему так, а не купол с телескопом

Первая версия просила купол обсерватории, телескоп на станине и сетку 4×4. Модель рисует такие
вещи неверно: купол без опоры, телескоп сквозь стену, у сетки то 5 клеток, то 3. Поэтому новые
промпты держатся того, что модель рисует уверенно:

- **мало крупных предметов** (одна карта или четыре), без точного счёта мелких;
- **ничего механического и архитектурного:** ни зданий, ни приборов, ни рук;
- **простая глубина:** передний план (карты), средний (нить, искры), фон (туманность или облака);
- **карты лицом к зрителю**, наклон не больше 10–15°, без сложной перспективы;
- **место каждой вещи названо словами:** «в центре», «правая половина», «левые 40 %».

## Как генерировать

- **Размеры:** квадратную — 1024×1024; горизонтальную — 1536×1024 (16:9 GPT Image не умеет).
  Скрипт сам обрежет её до 16:9: сверху и снизу уйдёт примерно по 6 %, поэтому ничего важного
  у верхнего и нижнего края.
- **Образцы** — приложить к каждому запросу:
  - `store/pikabu/art-refs/cards.png` — наши четыре масти, отрисованные самой игрой, без интерфейса:
    форма карты, золотая рамка, знак масти внизу, созвездие в углу;
  - `store/crazygames/art/key-16x9.webp` — наш ключевой арт: цвета, туманность, нить.
  Снимки экрана с интерфейсом в образцы не класть: модель переносит в арт надписи и кнопки.
- **По одной картинке за раз**, 3–4 попытки на промпт, выбрать лучшую.
- **Чинить правкой, а не новым промптом:** «Keep everything exactly as is, only …» (примеры ниже).
- **Готовое положить:** `store/pikabu/art/key-1x1.png` и `store/pikabu/art/key-16x9.png`,
  потом запустить `node scripts/pikabu-covers.mjs`.

Промпты на английском: так модель точнее держит композицию. Под каждым — что в нём по-русски.

---

## Квадратная иконка (1:1)

Видна в каталоге маленькой: один крупный силуэт, никакого текста. Два варианта, попробовать оба.

### A. «Звезда на орбите» — рекомендую

```
Square 1:1 game icon, painterly digital illustration in the style of the attached references: cards exactly like the attached card reference (shape, gold border, suit emblem in the lower part, small constellation dots in the top corner), same deep violet and indigo night palette, soft painted glow.

Subject: ONE large playing card in the exact center, facing the viewer, tilted about 8 degrees clockwise. It is a deep violet card with a thin polished gold border and slightly rounded corners. Its suit emblem is a big glowing pale-violet four-pointed star, enlarged so it sits near the middle of the card. The card face has no numbers and no letters.

Around the card: one thin, very bright golden thread of light forms a single smooth elliptical orbit around the card, passing behind the card at the top and in front of it at the bottom. Three small bright golden star points sit on the orbit, evenly spaced, so the thread looks like a tiny constellation. A few tiny golden sparks drift off the thread.

Background: deep indigo-to-violet nebula with soft clouds and small sharp white stars, brightest right behind the card, darker toward the corners.

Lighting: the card glows warm golden-white from within; golden rim light on its edges; gentle bloom. No other light sources.

Composition: the card is about 55 percent of the image height; clear empty space around it; nothing touches the image edges; the silhouette reads clearly at 128 px.

Avoid: buildings, domes, telescopes, machines, hands, people, any text, letters, numbers, logos, watermarks, UI, picture frames, borders, rounded image corners, white or light background.
```

По-русски: одна крупная карта Звезды по центру, лицом к зрителю, чуть наклонена. Вокруг неё
одна золотая нить-орбита с тремя звёздочками, как маленькое созвездие. Фон — фиолетовая туманность.
Без зданий, приборов, рук, текста и цифр.

### B. «Четыре масти веером»

```
Square 1:1 game icon, painterly digital illustration in the style of the attached references: cards exactly like the attached card reference (shape, gold border, suit emblem in the lower part, small constellation dots in the top corner), same deep violet and indigo night palette, soft painted glow.

Subject: FOUR playing cards fanned out like a hand of cards, all pivoting from one point just below the image center, facing the viewer, the fan opening upward about 50 degrees in total. From left to right: a gold card with a sun emblem, a pale-blue card with a crescent moon emblem, a deep violet card with a four-pointed white star emblem (this one slightly larger and in front), a crimson card with a comet emblem. Every card has a thin polished gold border, slightly rounded corners, and no numbers or letters.

A single thin, bright golden thread of light runs in one smooth arc through the four emblems, connecting them like stars of a constellation, with small bursts of light where it touches each emblem.

Background: deep indigo-to-violet nebula with soft clouds and small sharp white stars, a warm glow behind the fan, darker toward the corners.

Composition: the fan fills about 65 percent of the image width, centered; clear space around it; nothing touches the image edges; reads clearly at 128 px.

Avoid: hands, people, buildings, domes, telescopes, machines, any text, letters, numbers, logos, watermarks, UI, picture frames, borders, rounded image corners, white or light background.
```

По-русски: четыре карты веером из одной точки: Солнце, Луна, Звезда (впереди и чуть больше),
Комета. Золотая нить дугой проходит через их знаки, как созвездие. Без рук и без цифр.

---

## Горизонтальная иконка (16:9)

Слева пустое небо под название, справа сцена. Тоже два варианта.

### A. «Созвездие над облаками» — рекомендую

```
Wide landscape key art, 3:2 canvas, painterly digital illustration in the style of the attached references: cards exactly like the attached card reference (shape, gold border, suit emblem in the lower part, small constellation dots in the top corner), same deep violet and indigo night palette, soft painted glow.

Scene: a calm night high above a sea of soft silver-blue clouds. The cloud sea fills the lower quarter of the image, lit from above by a gentle violet glow. Above it, a vast deep indigo and violet nebula sky with small sharp stars.

Right half of the image: four playing cards float in the sky in a gentle rising arc, from lower-left to upper-right, all facing the viewer, each tilted no more than 10 degrees, evenly spaced, at the same distance from the viewer. In order: a gold card with a sun emblem, a pale-blue card with a crescent moon, a deep violet card with a four-pointed white star, a crimson card with a comet. Each card has a thin polished gold border, slightly rounded corners, and no numbers or letters. One thin, very bright golden thread of light passes through the four emblems like the lines of a constellation; the violet star card bursts with the brightest golden light, with soft sparks drifting down toward the clouds. Their warm light reflects faintly on the cloud tops below.

Left 40 percent of the image: only calm dark starry sky above the clouds, no cards, no bright objects; kept empty for a title added later.

Keep everything important away from the top and bottom 8 percent of the image; it will be cropped to 16:9.

Avoid: buildings, domes, telescopes, machines, mountains with sharp detail, hands, people, any text, letters, numbers, logos, watermarks, UI, picture frames, borders, rounded image corners, white or light background.
```

По-русски: ночь над морем облаков. Справа в небе четыре карты дугой снизу вверх (Солнце, Луна,
Звезда, Комета), через их знаки идёт золотая нить, Звезда вспыхивает ярче всех, искры летят к
облакам, свет отражается на облаках. Слева 40 % — пустое небо под название.

### B. «Нить в туманности»

```
Wide landscape key art, 3:2 canvas, painterly digital illustration in the style of the attached references: cards exactly like the attached card reference (shape, gold border, suit emblem in the lower part, small constellation dots in the top corner), same deep violet and indigo night palette, soft painted glow.

Scene: deep space inside a glowing violet and indigo nebula, with soft clouds of colored gas and small sharp stars. A river of faint stardust flows from the lower-left to the upper-right.

Right 55 percent of the image: four playing cards float at slightly different depths along the stardust river, facing the viewer, each tilted no more than 15 degrees. Two are larger and closer: a deep violet card with a four-pointed white star and a gold card with a sun. Two are smaller and farther away, slightly soft-focused: a pale-blue card with a crescent moon and a crimson card with a comet. Every card has a thin polished gold border, slightly rounded corners, and no numbers or letters. One thin, very bright golden thread of light weaves between the four cards in a smooth S-curve, touching each emblem, like a needle stitching a constellation; where it touches the violet star card, a bright burst of golden light.

Left 40 percent of the image: calm, darker nebula with only small stars, no cards, no bright objects; kept empty for a title added later.

Keep everything important away from the top and bottom 8 percent of the image; it will be cropped to 16:9.

Avoid: buildings, domes, telescopes, machines, hands, people, any text, letters, numbers, logos, watermarks, UI, picture frames, borders, rounded image corners, white or light background.
```

По-русски: туманность, по диагонали течёт река звёздной пыли. Справа вдоль неё четыре карты на
разной глубине: Звезда и Солнце ближе и крупнее, Луна и Комета дальше и чуть размыты. Золотая
нить «прошивает» их плавной S-кривой, на Звезде — вспышка. Слева 40 % пустые.

---

## Правки, если что-то не так

Писать в тот же чат поверх готовой картинки — так модель сохранит остальное.

- **Цифры или буквы на картах:** `Keep everything exactly as is. Remove all numbers and letters from the cards; leave only the emblems.`
- **Карты кривые или разной формы:** `Keep the composition. Make all cards identical flat rectangles with the same size, thin gold border and slightly rounded corners, facing the viewer.`
- **Нить рвётся или идёт мимо знаков:** `Keep everything else. Make the golden thread one continuous smooth line that passes exactly through the center of each card emblem.`
- **Слева тесно:** `Keep the cards where they are. Clear the entire left 40 percent: only dark starry sky there.`
- **Знаки или рамки не похожи на наши:** приложить `store/pikabu/art-refs/cards.png` ещё раз и написать `The cards must match the attached card reference exactly: same shapes, colors, gold borders and suit emblems.`
- **Слишком тёмно на маленьком размере:** `Keep everything as is. Make the central card brighter and the background slightly darker for more contrast.`
