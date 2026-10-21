import type { App } from '@/game/app';

/**
 * Запись роликов (`?demo=<сценарий>&capture`, только в разработке, `npm run clips`).
 * Время страницы ведёт скрипт записи (scripts/clips/virtual-time.js), здесь — то, что видно
 * из игры: когда сценарий начал и кончил запись, звук в OfflineAudioContext и подписи.
 */

const RATE = 48000;
/** Запас длины звука; лишнее обрежет ffmpeg по длине видео. */
const MAX_SECONDS = 40;

export interface Clip {
  /** Мс виртуального времени, когда началась запись; null — ещё не началась. */
  t0: number | null;
  done: boolean;
  start(): void;
  stop(): void;
  /** Звук записи — WAV в base64. */
  renderAudio(): Promise<string>;
}

const noop: Clip = {
  t0: null,
  done: false,
  start: () => undefined,
  stop: () => undefined,
  renderAudio: () => Promise.resolve(''),
};

/** Текущая запись; без `?capture` — пустышка, сценарии зовут её одинаково. */
export let clip: Clip = noop;

export function setupCapture(app: App): void {
  const ctx = new OfflineAudioContext(2, RATE * MAX_SECONDS, RATE);
  const rec: Clip = {
    t0: null,
    done: false,
    start() {
      rec.t0 ??= performance.now();
    },
    stop() {
      rec.done = true;
    },
    async renderAudio() {
      const buffer = await ctx.startRendering();
      return toBase64(encodeWav(buffer));
    },
  };
  clip = rec;
  (window as unknown as { __clip: Clip }).__clip = rec;
  app.svc.audio.attachOffline(ctx, () => (rec.t0 === null ? -1e6 : (performance.now() - rec.t0) / 1000));
  app.svc.audio.startMusic();
  document.documentElement.classList.add('capture');
}

function encodeWav(buffer: AudioBuffer): Uint8Array {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytes = new Uint8Array(44 + frames * channels * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => [...s].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + frames * channels * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, frames * channels * 2, true);
  const data = [...Array(channels).keys()].map((c) => buffer.getChannelData(c));
  let at = 44;
  for (let i = 0; i < frames; i++) {
    for (const ch of data) {
      const v = Math.max(-1, Math.min(1, ch[i]!));
      view.setInt16(at, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      at += 2;
    }
  }
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
