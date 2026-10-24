// Видео для витрины CrazyGames: обложка → игра, без звука, 15–20 с, ≤ 50 МБ.
//   node scripts/crazygames-covers.mjs   — сначала обложки
//   node scripts/clips.mjs --raw --lang en --view 960x540 --scale 2 --ff wideDesktop,brightFlare,music surge
//   node scripts/clips.mjs --raw --lang en --view 360x540 --scale 3 --ff wideDesktop,brightFlare,music surge
//   node scripts/crazygames-video.mjs
// Первый кадр — обложка (требование площадки), без чёрных экранов, курсора и ускорения.
import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const raw = path.join(root, 'clips/public/raw');
const out = path.join(root, 'store/crazygames');

/**
 * Сколько держим обложку и длина перехода. Игра — «Разгон» (четыре хода от нуля до победы) с
 * переключателями CrazyGames; режем на салюте победы, до окна итогов ночи. Один крест после
 * ускорения подсчёта (CQ.6) короче 15 с, а площадке нужно 15–20 с.
 */
const POSTER = 1;
const FADE = 0.5;

const VIDEOS = [
  { file: 'video-16x9.mp4', w: 1920, h: 1080, poster: 'cover-1920x1080.png', game: 'surge-en-960x540.mp4', seconds: 18.95 },
  { file: 'video-2x3.mp4', w: 1080, h: 1620, poster: 'cover-800x1200.png', game: 'surge-en-360x540.mp4', seconds: 18.95 },
];

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
    proc.on('error', reject);
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg: код ${code}`))));
  });
}

for (const v of VIDEOS) {
  const fit = `scale=${v.w}:${v.h}:flags=lanczos,setsar=1,fps=60,format=yuv420p`;
  const target = path.join(out, v.file);
  await ffmpeg([
    '-loop', '1', '-t', String(POSTER + FADE), '-i', path.join(out, v.poster),
    '-t', String(v.seconds), '-i', path.join(raw, v.game),
    '-filter_complex', `[0:v]${fit}[a];[1:v]${fit}[b];[a][b]xfade=transition=fade:duration=${FADE}:offset=${POSTER}[v]`,
    '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-movflags', '+faststart', target,
  ]);
  const mb = (await stat(target)).size / 1e6;
  console.log(`store/crazygames/${v.file} — ${(POSTER + v.seconds).toFixed(1)} с, ${mb.toFixed(1)} МБ`);
}
