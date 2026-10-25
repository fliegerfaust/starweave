# Арт для карточки Пикабу Игр: обсерватория

Две иконки: квадратная (от 1024×1024) и горизонтальная (от 1920×1080, 16:9). Рисуем в GPT Image,
название на горизонтальную накладывает `node scripts/pikabu-covers.mjs` шрифтом игры (Forum).

## Почему геометрия ломалась и как её держать

Модель ломала обсерваторию по трём причинам:

1. **Вид изнутри купола.** Внутри много пересекающихся форм: стены, рёбра, станина, щель. Модель
   путается, и телескоп проходит сквозь стену. **Решение:** обсерватория **снаружи**, на холме:
   белый купол на круглой башне — простая и знакомая модели форма.
2. **Расплывчатое слово «телескоп».** Модель смешивает трубу, треногу и подзорную трубу.
   **Решение:** назвать конкретный тип: длинная прямая труба-рефрактор на массивной экваториальной
   монтировке на каменном столбе, как в старых обсерваториях. И сказать, где у трубы какой конец.
3. **Всё сразу в одном запросе.** Обсерватория, карты, нить и туманность вместе дают кашу.
   **Решение:** рисовать **в два шага**. Сначала одна обсерватория с правильной геометрией,
   потом правкой поверх неё добавить карты. Модель сохраняет то, что уже нарисовано.

Правило для геометрии в каждом промпте: **каждая деталь названа и привязана к другой**
(«щель купола повёрнута к правому верхнему углу; труба телескопа выходит ровно из щели»).

## Как генерировать

- **Размеры:** квадрат — 1024×1024; горизонтальную — 1536×1024 (16:9 GPT Image не умеет,
  скрипт обрежет по 6 % сверху и снизу — ничего важного у этих краёв).
- **Образцы к шагу 2** (не к шагу 1, там они только мешают):
  - `store/pikabu/art-refs/cards.png` — наши карты, отрисованные игрой;
  - `store/crazygames/art/key-16x9.webp` — палитра, туманность, нить.
- **Шаг 1** — 3–4 попытки, выбрать картинку с правильной обсерваторией (чек-лист ниже).
  **Шаг 2** — в том же чате, поверх выбранной картинки.
- **Готовое:** `store/pikabu/art/key-1x1.png` и `store/pikabu/art/key-16x9.png`, затем
  `node scripts/pikabu-covers.mjs`.

### Чек-лист геометрии после шага 1

- купол — ровная полусфера на круглой башне, щель — одна прямая полоса от низа купола до верха;
- труба телескопа — один прямой цилиндр, выходит **из щели**, не из стены и не из крыши;
- труба направлена туда же, куда смотрит щель;
- у здания одна дверь и окна одного размера; ничего не висит в воздухе.

Если что-то не так — не начинать заново, а править (раздел «Правки» внизу).

---

## Горизонтальная иконка (16:9)

Справа обсерватория на холме над облаками, над ней в небе наши карты, как созвездие. Слева
пустое небо под название.

### Шаг 1. Обсерватория

```
Wide landscape illustration, 3:2 canvas, painterly digital art, rich and cinematic, night scene.

Setting: a lonely astronomical observatory stands on a gentle grassy hilltop in the lower-right part of the image. Below and around the hill lies a calm sea of soft silver-blue clouds. Above is a vast deep indigo and violet night sky with a glowing nebula and many small sharp stars.

The observatory, described exactly:
- a short round stone tower, two storeys high, pale grey stone, with one arched wooden door facing the viewer and two small round windows of equal size;
- on top of the tower, a white hemispherical dome, exactly as wide as the tower;
- the dome has ONE straight vertical shutter slit, open, running from the bottom edge of the dome over its top; the slit faces the upper-left of the image;
- through the open slit, a long straight polished brass refracting telescope tube points out of the dome toward the upper-left sky at about 40 degrees; the tube is one straight cylinder, its wide lens end is outside the dome, its narrow end stays inside;
- warm golden lamplight glows from inside the slit, the door and the windows.

Camera: seen from the side and slightly below, at eye level with the hilltop, so the whole tower and the whole dome are visible; the observatory takes about one third of the image height.

Left 40 percent of the image: calm dark starry sky and cloud sea only, no objects; kept empty for a title added later. Keep everything important away from the top and bottom 8 percent.

Avoid: text, letters, numbers, logos, watermarks, people, extra buildings, second telescope, telescope passing through walls or roof, broken or floating parts, frames, borders, white background.
```

По-русски: невысокая круглая каменная башня на холме над морем облаков, на ней белый купол той же
ширины, одна прямая щель открыта влево-вверх, из щели наружу выходит длинная прямая латунная труба
телескопа под 40°. Тёплый свет в щели, двери и окнах. Вид сбоку, чуть снизу. Слева 40 % пустые.

### Шаг 2. Карты в небе (правка поверх картинки шага 1, приложить образцы)

Карты не привязаны к телескопу: они сами по себе парят в небе, как созвездие, с глубиной,
как кадр из кино. Телескоп просто смотрит в ту же сторону неба.

```
Keep the observatory, the hill, the clouds and the camera exactly as they are. Do not change the dome, the slit or the telescope.

Add four playing cards floating high in the night sky, exactly like the cards in the attached card reference: same shapes, thin gold borders, suit emblems and colors, no numbers or letters. Stage them like a cinematic film shot with real depth:
- the violet Star card is the hero: the largest and closest to the viewer, in the upper-right part of the sky, about one quarter of the image height, tilted about 12 degrees, sharp and glowing with soft golden-white light;
- the gold Sun card and the pale-blue Moon card float farther away, smaller, a little higher and to the left of the hero, slightly turned, gently softened by distance;
- the crimson Comet card is the smallest and farthest, deep in the nebula, catching a faint rim of light.
The four cards are linked only to each other by thin, delicate golden lines of light, like a constellation drawn across the sky; the lines never touch the observatory or the telescope. Tiny golden sparks and a soft haze of starlight drift around the hero card.

The cards sit well above the dome, never overlapping it. Their warm light faintly tints the cloud tops. The cards and lines stay in the right 60 percent of the image; the left 40 percent stays empty dark sky.
```

По-русски: обсерваторию не трогать. Четыре наши карты высоко в небе, с глубиной, как в кино:
Звезда — главная, крупная и ближе всех, справа вверху; Солнце и Луна дальше и меньше, чуть
размыты; Комета совсем далеко в туманности. Карты связаны тонкими золотыми линиями только между
собой, как созвездие; к телескопу и куполу линии не идут. Карты выше купола и его не закрывают.

---

## Квадратная иконка (1:1)

В каталоге она маленькая: крупный купол, одна крупная карта, без мелочей.

### Шаг 1. Обсерватория

```
Square 1:1 illustration, painterly digital art, rich and cinematic, night scene.

Setting: the top of a hill at the bottom of the image, with a single observatory on it. Above, a deep indigo and violet night sky with a glowing nebula and small sharp stars.

The observatory, described exactly:
- a short round pale-grey stone tower with one arched wooden door facing the viewer;
- on top, a large white hemispherical dome, exactly as wide as the tower;
- ONE straight vertical shutter slit in the dome, open, facing straight up and slightly to the right;
- through the slit, a long straight polished brass refracting telescope tube points up and to the right at about 60 degrees; the tube is one straight cylinder, its wide lens end is outside the dome;
- warm golden light glows from inside the slit and the door.

Camera: seen from slightly below; the observatory fills the lower 45 percent of the image, centered; the upper half is open sky.

Avoid: text, letters, numbers, logos, watermarks, people, extra buildings, second telescope, telescope passing through walls or roof, broken or floating parts, frames, borders, white background.
```

По-русски: на холме внизу одна обсерватория крупно: каменная башня, белый купол, щель смотрит
вверх-вправо, из неё латунная труба под 60°. Нижняя половина — обсерватория, верхняя — небо.

### Шаг 2. Карты в небе (правка поверх картинки шага 1, приложить образцы)

```
Keep the observatory, the hill and the camera exactly as they are. Do not change the dome, the slit or the telescope.

In the upper half of the sky, add ONE large playing card floating freely, exactly like the violet Star card in the attached card reference: thin gold border, glowing pale-violet four-pointed star emblem, no numbers or letters. It faces the viewer, tilted about 10 degrees, about 35 percent of the image height, sharp and glowing warm golden-white, with a soft halo and a few drifting golden sparks.

Far behind it, deep in the nebula, three tiny cards (gold Sun, pale-blue Moon, crimson Comet) shine like distant stars, linked to the big card by thin, delicate golden constellation lines. No line touches the observatory or the telescope.

The big card floats well above the dome and never overlaps it. Make the card and the dome the two brightest shapes, so the icon reads clearly at 128 px.
```

По-русски: в верхней половине одна крупная карта Звезды парит сама по себе, с ореолом и искрами.
Далеко в туманности три крошечные карты (Солнце, Луна, Комета) светятся, как дальние звёзды, и
связаны с ней тонкими линиями созвездия. К телескопу ничего не тянется.

---

## Правки

Писать в тот же чат поверх картинки, начиная с «Keep everything else exactly as is».

- **Труба выходит не из щели:** `Keep everything else exactly as is. Move the telescope so that its tube comes straight out of the open shutter slit of the dome, as one straight cylinder; nothing passes through the dome surface.`
- **Щель кривая или их несколько:** `Keep everything else exactly as is. The dome has exactly one straight vertical shutter slit, running from the bottom edge of the dome over its top, aligned with the telescope tube.`
- **Купол шире или уже башни, перекошен:** `Keep everything else exactly as is. Make the dome a clean white hemisphere sitting exactly on top of the round tower, the same width as the tower.`
- **Лишние постройки или второй телескоп:** `Keep everything else exactly as is. Remove every building and telescope except the one observatory and its single telescope.`
- **На картах цифры или буквы:** `Keep everything exactly as is. Remove all numbers and letters from the cards; leave only the emblems.`
- **Карты не похожи на наши:** приложить `store/pikabu/art-refs/cards.png` и `The cards must match the attached card reference exactly: same shapes, colors, gold borders and suit emblems.`
- **Слева тесно (горизонтальная):** `Keep everything else exactly as is. Clear the entire left 40 percent: only dark starry sky and clouds there.`
- **Нить или луч тянется к телескопу или куполу:** `Keep everything else exactly as is. Remove any line, beam or thread that touches the observatory or the telescope; the golden lines connect only the cards to each other.`
- **Хочется богаче:** `Keep the composition and every object exactly as is. Add more painterly detail and atmosphere: richer nebula colors, soft volumetric light from the slit, gentle mist on the hill, tiny fireflies of golden light around the cards.`

## Если геометрия так и не выходит

Приложить к шагу 1 фотографию настоящей обсерватории с куполом и рефрактором и написать
`Use the attached photo only as a reference for the shape of the observatory and the telescope.`
Подойдёт любое своё фото или снимок с Википедии с открытой лицензией.
