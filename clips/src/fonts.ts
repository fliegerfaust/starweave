import { continueRender, delayRender, staticFile } from "remotion";

// Шрифты игры: Forum — заголовки, Manrope — подписи. Кириллица и латиница — разные файлы,
// поэтому грузим через FontFace с unicode-range, как это делает @fontsource.
const CYRILLIC = "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116";
const LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";

const faces = [
  new FontFace("Forum", `url(${staticFile("fonts/forum-cyrillic-400-normal.woff2")})`, { unicodeRange: CYRILLIC }),
  new FontFace("Forum", `url(${staticFile("fonts/forum-latin-400-normal.woff2")})`, { unicodeRange: LATIN }),
  new FontFace("Manrope", `url(${staticFile("fonts/manrope-cyrillic-wght-normal.woff2")})`, {
    unicodeRange: CYRILLIC,
    weight: "200 800",
  }),
  new FontFace("Manrope", `url(${staticFile("fonts/manrope-latin-wght-normal.woff2")})`, {
    unicodeRange: LATIN,
    weight: "200 800",
  }),
];

const handle = delayRender("Шрифты игры");
Promise.all(faces.map((f) => f.load()))
  .then((loaded) => {
    loaded.forEach((f) => document.fonts.add(f));
    continueRender(handle);
  })
  .catch((e) => {
    console.error(e);
    continueRender(handle);
  });

export const DISPLAY = "Forum, serif";
export const TEXT = "Manrope, sans-serif";
