import { Video } from "@remotion/media";
import type React from "react";
import {
  AbsoluteFill,
  Easing,
  Freeze,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  type CalculateMetadataFunction,
} from "remotion";
import { DISPLAY, TEXT } from "./fonts";

export type Lang = "ru" | "en";
type Text = { ru: string; en: string };

export type ClipProps = {
  /** Сценарий записи игры: файл public/raw/<scenario>-<lang>.mp4. */
  scenario: string;
  lang: Lang;
  /** Кадров в записи игры (60 fps) — ставит `npm run clips`. */
  frames: number;
  /** Крючок сверху; `*слово*` — золотом, `|` — перенос строки; пробел внутри слова — неразрывный. */
  hook: Text;
  /** Строка под крючком, появляется позже. */
  sub?: Text;
  /** С какой секунды показать `sub`. */
  subAt?: number;
  /** Полоска-таймер под текстом: «подумай, пока она тает». */
  timer?: boolean;
};

export const calculateClipMetadata: CalculateMetadataFunction<ClipProps> = ({ props }) => ({
  durationInFrames: props.frames,
  defaultOutName: `${props.scenario}-${props.lang}`,
});

/** Перетекание конца в первый кадр — ролик крутится без шва. */
const LOOP_SECONDS = 0.4;
/** Игра в рамке: 1080×1920 × 0,767. Сверху — место под крючок, снизу — под подпись площадки. */
const PANEL = { width: 828, height: 1472, top: 372 };

const GOLD = "linear-gradient(180deg, #ffe7a8 0%, #f6c25b 55%, #e09a3a 100%)";

const Game: React.FC<{ src: string; muted?: boolean; style: React.CSSProperties }> = ({ src, muted, style }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const fadeFrom = durationInFrames - LOOP_SECONDS * fps;
  return (
    <Video
      src={src}
      muted={muted}
      objectFit="cover"
      volume={interpolate(frame, [fadeFrom, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
      style={style}
    />
  );
};

const Layers: React.FC<{ src: string; muted?: boolean }> = ({ src, muted }) => (
  <>
    <Game
      src={src}
      muted
      style={{ position: "absolute", width: "100%", height: "100%", scale: "1.18", filter: "blur(36px) brightness(0.42) saturate(1.2)" }}
    />
    <div
      style={{
        position: "absolute",
        left: (1080 - PANEL.width) / 2,
        top: PANEL.top,
        width: PANEL.width,
        height: PANEL.height,
        borderRadius: 44,
        overflow: "hidden",
        boxShadow: "0 0 0 2px rgba(255, 231, 168, 0.35), 0 0 90px rgba(150, 110, 255, 0.45), 0 30px 80px rgba(0, 0, 0, 0.6)",
      }}
    >
      <Game src={src} muted={muted} style={{ width: "100%", height: "100%" }} />
    </div>
  </>
);

/** Слово крючка: всплывает с пружиной, чуть из размытия. */
const Word: React.FC<{ word: string; index: number }> = ({ word, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const gold = word.startsWith("*") && word.endsWith("*");
  const text = gold ? word.slice(1, -1) : word;
  const p = spring({ frame: frame - 3 - index * 4, fps, config: { damping: 14, stiffness: 170, mass: 0.7 } });
  return (
    <span
      style={{
        display: "inline-block",
        margin: "0 0.13em",
        opacity: interpolate(p, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
        translate: `0 ${interpolate(p, [0, 1], [46, 0])}px`,
        scale: String(interpolate(p, [0, 1], [0.86, 1])),
        filter: `blur(${interpolate(p, [0, 0.6], [10, 0], { extrapolateRight: "clamp" })}px)`,
        ...(gold
          ? { backgroundImage: GOLD, backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent" }
          : { color: "#f5f1ff" }),
      }}
    >
      {text}
    </span>
  );
};

const Hook: React.FC<Pick<ClipProps, "hook" | "sub" | "subAt" | "timer" | "lang">> = ({ hook, sub, subAt = 1.2, timer, lang }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const lines = hook[lang].split("|");
  let index = 0;
  const out = interpolate(frame, [durationInFrames - LOOP_SECONDS * fps, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const subIn = interpolate(frame, [subAt * fps, (subAt + 0.5) * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        top: 0,
        height: PANEL.top - 24,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: 70,
        opacity: out,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: DISPLAY,
          fontSize: lines.length > 1 ? 84 : 96,
          lineHeight: 1.08,
          textShadow: "0 4px 30px rgba(0, 0, 0, 0.55)",
          filter: "drop-shadow(0 0 22px rgba(170, 130, 255, 0.35))",
        }}
      >
        {lines.map((line, li) => (
          <div key={li}>
            {line.split(" ").map((w) => (
              <Word key={index} word={w} index={index++} />
            ))}
          </div>
        ))}
      </div>
      {sub && (
        <div
          style={{
            marginTop: 18,
            fontFamily: TEXT,
            fontWeight: 600,
            fontSize: 44,
            color: "rgba(230, 222, 255, 0.86)",
            opacity: subIn,
            translate: `0 ${interpolate(subIn, [0, 1], [16, 0])}px`,
          }}
        >
          {sub[lang]}
        </div>
      )}
      {timer && (
        <div style={{ marginTop: 26, width: 420, height: 8, borderRadius: 4, background: "rgba(255, 255, 255, 0.14)", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              borderRadius: 4,
              background: GOLD,
              width: `${interpolate(frame, [0.6 * fps, durationInFrames - LOOP_SECONDS * fps], [100, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })}%`,
            }}
          />
        </div>
      )}
    </div>
  );
};

export const Clip: React.FC<ClipProps> = ({ scenario, lang, hook, sub, subAt, timer }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const src = staticFile(`raw/${scenario}-${lang}.mp4`);
  const loopFrom = durationInFrames - LOOP_SECONDS * fps;
  return (
    <AbsoluteFill style={{ backgroundColor: "#070818" }}>
      <Layers src={src} />
      <Hook hook={hook} sub={sub} subAt={subAt} timer={timer} lang={lang} />
      {frame >= loopFrom && (
        <AbsoluteFill style={{ opacity: interpolate(frame, [loopFrom, durationInFrames - 1], [0, 1], { extrapolateRight: "clamp" }) }}>
          <Freeze frame={0}>
            <Layers src={src} muted />
          </Freeze>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
