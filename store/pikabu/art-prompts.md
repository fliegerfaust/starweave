# Арт для карточки Пикабу Игр

Две иконки: квадратная (от 1024×1024) и горизонтальная (от 1920×1080, 16:9). Рисуем в GPT Image,
название на горизонтальную накладывает `node scripts/pikabu-covers.mjs` шрифтом игры (Forum):
модели картинок плохо пишут кириллицу.

**Что приложить к каждому запросу как образцы стиля:**
- `store/crazygames/art/key-16x9.webp` и `store/crazygames/art/key-1x1.webp` — наш ключевой арт;
- `store/pikabu/screens/landscape-1-cross.jpg` — как выглядят карты и поле в игре.

**Куда положить готовое:** `store/pikabu/art/key-1x1.png` и `store/pikabu/art/key-16x9.png`
(в самом большом размере, который даст модель), потом запустить скрипт.

Промпты на английском: так модель точнее держит композицию. Под каждым — что в нём по-русски.

---

## Квадратная иконка (1:1)

Видна в каталоге маленькой, поэтому один крупный силуэт и никакого текста.

```
Square game icon, 1:1, full-bleed, painterly digital illustration in the exact style of the attached reference images.

Scene: the brass dome of an old astronomical observatory seen from slightly below, its shutter slit wide open onto a deep violet and indigo nebula night sky. Inside the open slit, a single large glowing playing card floats upright, a violet card with a bright four-pointed white star emblem in its center and a thin gold frame, exactly like the cards in the references. Behind it, three more cards fan out slightly: a gold card with a sun emblem, a pale-blue card with a crescent moon, a crimson card with a comet. A thin, intensely bright golden thread of light runs diagonally through all four cards, igniting them like stars of a constellation, with small golden sparks where it touches each card. A polished brass telescope at the lower edge points up at the cards.

Lighting: warm golden glow from the cards and the thread against cool blue-violet space; soft bloom; faint constellation lines and small sharp stars in the sky.

Composition: centered, bold and simple silhouette that stays readable when shrunk to 128 px; the hero card occupies the middle third.

Do not include: any text, letters, logos or watermarks; card rank numbers; UI elements; frames or borders around the image; rounded corners; white or light background.
```

По-русски: купол обсерватории снизу, щель открыта в фиолетовую туманность. В щели крупная карта Звезды, за ней веером Солнце, Луна, Комета. Через все четыре идёт яркая золотая нить и зажигает их, как созвездие. Внизу латунный телескоп смотрит на карты. Без текста и цифр, без рамки и скруглений.

---

## Горизонтальная иконка (16:9)

Слева пустое тёмное небо под название, справа сцена.

```
Wide horizontal key art, 16:9, full-bleed, painterly digital illustration in the exact style of the attached reference images.

Scene: the interior of an old brass astronomical observatory at night. The right half of the image shows the great dome with its shutter slit open onto a vast violet and indigo nebula, and a large polished brass telescope on a carved mount aimed at the sky. In the sky beyond the slit, a faint 4 by 4 grid of softly glowing square star cells hangs like a celestial game board. One row and one column of the grid are filled with glowing playing cards, exactly like the cards in the references: gold Sun, pale-blue Moon, violet four-pointed Star, crimson Comet. The row and the column cross at one card, and that crossing card bursts with the brightest golden light; a bright golden thread runs through the ignited row and column like constellation lines, with sparks flying.

Left 40 percent of the image: calm, dark, deep-blue starry nebula with only small stars, no objects, kept empty for a title that will be added later.

Lighting: warm gold from the cards, the thread and the brass, against cool blue-violet space; cinematic depth, soft bloom, gentle haze inside the dome.

Do not include: any text, letters, logos or watermarks; card rank numbers; UI elements; frames or borders; rounded corners; white or light background.
```

По-русски: внутри обсерватории, справа купол с открытой щелью и большой латунный телескоп. В небе за щелью полупрозрачная сетка 4×4, как игровое поле. Один ряд и один столбец заполнены картами наших мастей, на их пересечении самая яркая вспышка: это крест. Золотая нить проходит по ряду и столбцу, как линии созвездия. Левые 40 % пустые, там будет название.

---

## Если модель ошиблась

- Появился текст или цифры на картах: дописать «absolutely no text or numbers anywhere».
- Карты не похожи на наши: приложить ещё `store/pikabu/screens/landscape-2-shop.jpg` и сказать «cards must match the attached screenshots».
- Слева тесно: «keep the entire left 40 percent empty sky».
