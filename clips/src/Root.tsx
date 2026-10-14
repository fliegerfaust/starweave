import { Composition, Folder } from "remotion";
import { calculateClipMetadata, Clip } from "./Clip";

// Ролики для Shorts / Клипов / Reels. Запись игры — `npm run clips` в корне репозитория:
// она же кладёт public/raw/<сценарий>-<язык>.mp4 и рендерит эти композиции.
export const RemotionRoot: React.FC = () => {
  return (
    <Folder name="Starweave">
      <Composition
        id="cross"
        component={Clip}
        durationInFrames={600}
        fps={60}
        width={1080}
        height={1920}
        calculateMetadata={calculateClipMetadata}
        defaultProps={{
          scenario: "cross",
          lang: "ru",
          frames: 600,
          hook: { ru: "Одна карта — |*две* *линии*", en: "One card. |*Two* *lines.*" },
        }}
      />
      <Composition
        id="answer"
        component={Clip}
        durationInFrames={600}
        fps={60}
        width={1080}
        height={1920}
        calculateMetadata={calculateClipMetadata}
        defaultProps={{
          scenario: "answer",
          lang: "ru",
          frames: 600,
          hook: { ru: "Ответ: *в* *угол*", en: "Answer: *the* *corner*" },
          sub: { ru: "крест зажигает обе линии", en: "a cross lights both lines" },
          subAt: 0.8,
        }}
      />
      <Composition
        id="puzzle"
        component={Clip}
        durationInFrames={360}
        fps={60}
        width={1080}
        height={1920}
        calculateMetadata={calculateClipMetadata}
        defaultProps={{
          scenario: "puzzle",
          lang: "ru",
          frames: 360,
          hook: { ru: "Куда бы ты |*положил* *девятку?*", en: "Where would you |*play* *the* *9?*" },
          sub: { ru: "ответ — в следующем ролике", en: "answer in the next video" },
          subAt: 2.4,
          timer: true,
        }}
      />
      <Composition
        id="cascade"
        component={Clip}
        durationInFrames={540}
        fps={60}
        width={1080}
        height={1920}
        calculateMetadata={calculateClipMetadata}
        defaultProps={{
          scenario: "cascade",
          lang: "ru",
          frames: 540,
          hook: { ru: "4 · 5 · 6 · *7*", en: "4 · 5 · 6 · *7*" },
          sub: { ru: "по порядку — это Каскад", en: "in order — a Cascade" },
          subAt: 0.9,
        }}
      />
      <Composition
        id="surge"
        component={Clip}
        durationInFrames={1200}
        fps={60}
        width={1080}
        height={1920}
        calculateMetadata={calculateClipMetadata}
        defaultProps={{
          scenario: "surge",
          lang: "ru",
          frames: 1200,
          hook: { ru: "С нуля до *30\u00a0000* |за четыре хода", en: "Zero to *30,000* |in four moves" },
        }}
      />
    </Folder>
  );
};
