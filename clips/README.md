# Ролики Starweave (Remotion)

Короткие вертикальные ролики 1080×1920, 60 fps: запись игры в рамке, крючок шрифтом игры,
конец перетекает в начало. Ролики: `cross`, `answer`, `puzzle`, `cascade`, `surge`, ru и en.

`npm run clips` из корня репозитория пишет игру в `public/raw/<ролик>-<язык>.mp4` и рендерит
готовые ролики в `store/clips/` (в git не хранятся). Флаги описаны в шапке `scripts/clips.mjs`.

```bash
npm i          # один раз, в этой папке
npm run dev    # Remotion Studio: посмотреть и поправить оформление
```

| Что | Где |
|---|---|
| тексты крючков и подписей (`*слово*` золотом, `\|` перенос) | `src/Root.tsx` |
| рамка, анимация текста, повтор | `src/Clip.tsx` |
| расклады и ходы | `src/dev/demo.ts` в игре |
| как всё устроено | `docs/PROMOTION.md` |

Remotion бесплатен для частных лиц и компаний до трёх человек
([лицензия](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md)).
