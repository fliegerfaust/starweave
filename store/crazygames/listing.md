# CrazyGames — карточка игры

Поля формы «Submit a game» на [developer.crazygames.com](https://developer.crazygames.com).
Шаги — [docs/CRAZYGAMES-LAUNCH.md](../../docs/CRAZYGAMES-LAUNCH.md). Без упоминаний Telegram,
своего сайта, Яндекса и сторов: кросс-промо запрещено.

| Поле | Что вставить |
|---|---|
| Game name | `Starweave` |
| Build | файлы из `dist-crazygames/` (`npm run build:crazygames`): всё внутри папки, ⌘A и перетащить — zip не принимают |
| Engine / type | HTML5 |
| Orientation | Landscape и Portrait (игра подстраивается) |
| Mobile support | Yes |
| Progress Save | Yes (Data module) |
| Languages | English, Russian |
| Category | Card · второе — Puzzle |
| Tags | card, puzzle, roguelike, deckbuilder, strategy, singleplayer, space |
| Age | PEGI 12 |
| Covers | `cover-1920x1080.png`, `cover-800x1200.png`, `cover-800x800.png` |
| Videos | `video-16x9.mp4`, `video-2x3.mp4` (без звука, ~15 с) |

Видео собираются заново: `node scripts/crazygames-covers.mjs`, две записи
`node scripts/clips.mjs --raw --lang en --view …` (команды — в `scripts/crazygames-video.mjs`),
затем `node scripts/crazygames-video.mjs`.

## Short description

Place star cards on a 4×4 sky, light up constellations and weave crosses for huge combos.

## Description

Starweave is a card puzzle roguelike about constellations.

Place star cards on a 4×4 sky. Fill a row or a column and it lights up as a constellation — a Pair, a Flush, a Cascade and more. Close two lines with one card and you weave a cross: both lines score at once and the points multiply.

Between nights, visit the Observatory: collect Omens that bend the rules, level up your favourite constellations and shape your deck. Survive eight chapters and the Eclipses that end each of them.

- Learn the rule in ten seconds, master it over many runs
- Short nights of 2–3 minutes, runs of 25–40 minutes, saved at any moment
- A new Daily Challenge every day
- Challenge a friend to the very same deal
- The Star Atlas is included: past challenges, the Astrolabe deck, extra card backs and skies

## How to play

Drag a card from your hand onto an empty cell of the sky — or tap the card, then the cell.
When a row or a column is full, it lights up as a constellation and scores Light × Multiplier.
One card that completes two lines at once makes a cross: the score multiplies.
Reach the night's target before you run out of moves. Burn a card to swap it for a new one.

## Controls

- Mouse / touch: drag a card onto a cell, or tap the card, then the cell
- Keyboard: 1–9 — pick a card from your hand, arrow keys — choose a cell, Enter / Space — place it, B — burn the picked card
