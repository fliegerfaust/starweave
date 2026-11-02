import { t } from '@/i18n';
import { h } from './dom';

/**
 * Наставник-созвездие (GO.6, витрина): живое созвездие в медальоне рядом с подсказкой обучения и
 * «Нити». Рисуется кодом линиями звёзд, без ассетов. Живёт: звёзды мерцают, «глаз» моргает, у
 * каждого своё движение (медведица кивает, лебедь плывёт и поводит крылом, дельфин бьёт хвостом); когда
 * наставник заговаривает, линии прорисовываются заново. В разработке `?mentor=bear|swan|dolphin`.
 */
export type MentorId = 'bear' | 'swan' | 'dolphin';

interface MentorFigure {
  /** Звёзды в кадре 0…100; третье число — яркость 0…1. */
  stars: [x: number, y: number, mag: number][];
  lines: [number, number][];
  eye: number;
  /** Звёзды, которые двигаются своим движением (голова, крылья, хвост). */
  moving: number[];
  /** Смещение движущихся звёзд в момент `s` (−1…1). */
  move(s: number, x: number, y: number): [number, number];
  /** Силуэт зверя, как в старых звёздных атласах: точки контура, третье — движется ли точка. */
  shape: [x: number, y: number, moves?: 1][];
}

/**
 * Звёзды — настоящие: прямое восхождение и склонение (J2000) спроецированы как на карте неба
 * (восток слева), яркость — по звёздной величине. Силуэт обведён вокруг них, как в атласе
 * Гевелия; `fit` вписывает фигуру в медальон.
 */
const FIGURES: Record<MentorId, MentorFigure> = fitAll({
  // Большая Медведица: ковш — спина и бёдра, ручка — хвост; голова (Мусцида — нос), три пары лап:
  // Талита (ι, κ), Тания (λ, μ), Алула (ν, ξ)
  bear: {
    stars: [
      [93, 27.1, 0.6], [76.4, 23.1, 0.55], [71.1, 30, 0.5], [76, 42.5, 0.6], [85.2, 48.7, 0.6], [84, 50.2, 0.5],
      [51.4, 25.3, 0.95], [51.9, 34.5, 0.8], [37.8, 39.1, 0.8], [32, 33.4, 0.6], [21.5, 35.2, 0.95], [13.4, 37, 0.85],
      [7, 46.6, 0.9], [49.8, 54.8, 0.65], [64, 57.5, 0.55], [62.6, 59.9, 0.6], [39.9, 49.2, 0.5], [47.4, 74.2, 0.55], [47.5, 76.9, 0.5],
    ],
    lines: [[6, 7], [7, 8], [8, 9], [9, 6], [9, 10], [10, 11], [11, 12], [6, 1], [1, 0], [1, 2], [2, 3], [3, 4], [3, 5], [7, 13], [13, 14], [13, 15], [8, 16], [16, 17], [16, 18]],
    eye: 1,
    moving: [0, 1],
    move: (s, x, y) => [x + s * 0.5, y + s * 1.6],
    shape: [
      [97, 27, 1], [93, 21, 1], [86, 16, 1], [82, 13, 1], [79, 7, 1], [74, 8, 1], [72, 13, 1], [67, 17], [64, 12], [57, 10],
      [49, 12], [41, 16], [33, 21], [27, 27], [19, 29], [11, 32], [5, 39], [2, 47], [5, 52], [11, 46], [18, 43], [26, 44],
      [31, 50], [33, 57], [38, 66], [40, 76], [39, 83], [53, 84], [53, 72], [51, 65], [54, 67], [62, 68], [71, 65], [71, 56],
      [64, 53], [69, 50], [73, 52], [78, 57], [90, 57], [93, 48], [85, 41], [84, 36], [89, 32, 1], [96, 31, 1],
    ],
  },
  // Лебедь (Северный Крест): Денеб — хвост, Садр — грудь, η — шея, Альбирео — голова; крылья δ–ι–κ и ε–ζ
  swan: {
    stars: [[21.1, 51.5, 1], [37.3, 55.6, 0.85], [56.5, 57.7, 0.5], [78.9, 63.9, 0.65], [43.6, 33.2, 0.7], [38.1, 14.5, 0.5], [40.3, 7, 0.5], [38.8, 76.5, 0.75], [34.8, 93, 0.6]],
    lines: [[0, 1], [1, 2], [2, 3], [1, 4], [4, 5], [5, 6], [1, 7], [7, 8]],
    eye: 3,
    moving: [4, 5, 6, 7, 8],
    move: (s, x, y) => [x, y + s * (y - 56) * 0.07],
    shape: [
      [8, 52], [14, 46], [24, 46], [30, 40, 1], [24, 36, 1], [29, 31, 1], [23, 26, 1], [28, 20, 1], [24, 14, 1], [31, 10, 1],
      [30, 4, 1], [37, 0, 1], [45, 0, 1], [50, 14, 1], [53, 28, 1], [52, 44], [57, 53], [68, 57], [78, 59], [82, 59], [91, 65],
      [82, 69], [70, 64], [57, 62], [52, 66], [50, 82, 1], [45, 96, 1], [39, 103, 1], [33, 98, 1], [30, 92, 1], [25, 88, 1],
      [29, 80, 1], [23, 76, 1], [27, 68, 1], [30, 62], [24, 60], [15, 58],
    ],
  },
  // Дельфин: ромб γ–α–β–δ — голова и тело, γ — нос, ε Альдульфин — хвост
  dolphin: {
    stars: [[74.4, 7, 0.6], [87.1, 31, 0.6], [67.8, 26.5, 0.55], [74.8, 49.4, 0.65], [80.6, 55.9, 0.5], [62.3, 75, 0.5], [41.5, 93, 0.6]],
    lines: [[0, 1], [1, 3], [3, 2], [2, 0], [3, 4], [3, 5], [5, 6]],
    eye: 2,
    moving: [6],
    move: (s, x, y) => [x + s * 3 * Math.max(0, (y - 70) / 30), y - s * 1.2 * Math.max(0, (y - 70) / 30)],
    shape: [
      [75, -2], [79, 4], [86, 18], [93, 30], [95, 40], [97, 46], [106, 58], [92, 53], [87, 62], [78, 74], [66, 84], [55, 92, 1],
      [60, 110, 1], [42, 101, 1], [20, 108, 1], [34, 92, 1], [46, 80], [53, 66], [57, 56], [44, 50], [60, 44], [63, 30],
      [66, 18], [69, 8], [72, 4],
    ],
  },
});

/** Вписать фигуру в кадр 4…96: звёзды и силуэт вместе, пропорции сохраняются. */
function fitAll(figs: Record<MentorId, MentorFigure>): Record<MentorId, MentorFigure> {
  for (const fig of Object.values(figs)) {
    const xs = fig.shape.map((p) => p[0]);
    const ys = fig.shape.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = 92 / Math.max(x1 - x0, y1 - y0);
    const ox = (100 - (x1 - x0) * k) / 2 - x0 * k;
    const oy = (100 - (y1 - y0) * k) / 2 - y0 * k;
    const move = fig.move;
    fig.stars = fig.stars.map(([x, y, m]) => [x * k + ox, y * k + oy, m]);
    fig.shape = fig.shape.map(([x, y, moves]) => (moves ? [x * k + ox, y * k + oy, moves] : [x * k + ox, y * k + oy]));
    // Движение задано в исходных координатах: переводим туда и обратно
    fig.move = (s, x, y) => {
      const [mx, my] = move(s, (x - ox) / k, (y - oy) / k);
      return [mx * k + ox, my * k + oy];
    };
  }
  return figs;
}

/** Покачивание: скорость (рад/с) и размах в кадре 0…100. */
const BOB: Record<MentorId, [number, number]> = { bear: [0.6, 0.6], swan: [0.7, 1.2], dolphin: [1.1, 2] };

/** Наставник из `?mentor=` (только в разработке); null — подсказки как раньше, без наставника. */
export function activeMentor(): MentorId | null {
  if (!import.meta.env.DEV) return null;
  const v = document.documentElement.dataset.mentor;
  return v === 'bear' || v === 'swan' || v === 'dolphin' ? v : null;
}

/** Медальон с живым созвездием; при появлении линии прорисовываются, как будто наставник заговорил. */
export function mentorPortrait(id: MentorId, size = 60): HTMLElement {
  const fig = FIGURES[id];
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const el = h('div.mentor', { attrs: { 'aria-hidden': 'true' } }, canvas);
  const ctx = canvas.getContext('2d')!;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('calm');
  const spokeAt = performance.now();
  const pad = size * 0.1;
  const k = (size - pad * 2) / 100;
  const frame = (now: number) => {
    const time = now / 1000;
    const since = (now - spokeAt) / 1000;
    const s = calm ? 0 : Math.sin(time * (id === 'dolphin' ? 1.4 : 0.9));
    // Покачивание всей фигуры: медведица дышит, лебедь на воде, дельфин в прыжке
    const bob = calm ? 0 : Math.sin(time * BOB[id][0]) * BOB[id][1];
    const pts = fig.stars.map(([x, y], i) => {
      const [mx, my] = fig.moving.includes(i) ? fig.move(s, x, y) : [x, y];
      return [pad + mx * k, pad + (my + bob) * k] as const;
    });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    // Силуэт зверя за звёздами: тонкая золотая кромка и слабая заливка, сглаженная кривая через середины
    const outline = fig.shape.map(([x, y, moves]) => {
      const [mx, my] = moves ? fig.move(s, x, y) : [x, y];
      return [pad + mx * k, pad + (my + bob) * k] as const;
    });
    ctx.beginPath();
    outline.forEach(([x, y], i) => {
      const [nx, ny] = outline[(i + 1) % outline.length]!;
      const mx = (x + nx) / 2;
      const my = (y + ny) / 2;
      if (i === 0) ctx.moveTo(mx, my);
      else ctx.quadraticCurveTo(x, y, mx, my);
    });
    const [fx, fy] = outline[0]!;
    const [sx2, sy2] = outline[1]!;
    ctx.quadraticCurveTo(fx, fy, (fx + sx2) / 2, (fy + sy2) / 2);
    ctx.closePath();
    const fill = ctx.createRadialGradient(size / 2, size * 0.4, 0, size / 2, size / 2, size * 0.6);
    fill.addColorStop(0, 'rgba(246, 194, 91, 0.26)');
    fill.addColorStop(1, 'rgba(246, 194, 91, 0.1)');
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 230, 168, ${0.42 + 0.12 * Math.max(0, 1 - since)})`;
    ctx.lineWidth = Math.max(0.8, size / 100);
    ctx.stroke();
    // Линии прорисовываются по очереди, когда наставник заговорил
    const draw = calm ? 1 : Math.min(1, since / 0.7);
    fig.lines.forEach(([a, b], i) => {
      const u = Math.max(0, Math.min(1, draw * fig.lines.length - i));
      if (u <= 0) return;
      const [ax, ay] = pts[a]!;
      const [bx, by] = pts[b]!;
      ctx.strokeStyle = `rgba(255, 230, 168, ${0.45 + 0.25 * Math.max(0, 1 - since)})`;
      ctx.lineWidth = Math.max(1, size / 70);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax + (bx - ax) * u, ay + (by - ay) * u);
      ctx.stroke();
    });
    // Звёзды: мерцание, волна при реплике, глаз моргает раз в несколько секунд
    ctx.globalCompositeOperation = 'lighter';
    fig.stars.forEach(([, , mag], i) => {
      const [x, y] = pts[i]!;
      // Мерцание медленное и мягкое; глаз прикрывается плавно, раз в несколько секунд
      const twinkle = calm ? 1 : 0.9 + 0.1 * Math.sin(time * 0.8 + i * 1.9);
      const wave = calm ? 0 : Math.max(0, 1 - Math.abs(since * 1.6 - i * 0.22)) ** 2 * 0.6;
      const lid = (time % 5.5) / 0.6;
      const blink = i === fig.eye && !calm && lid < 1 ? 1 - 0.5 * Math.sin(lid * Math.PI) : 1;
      const r = (1 + mag * 1.2 + wave) * (i === fig.eye ? 1.25 : 1) * Math.max(1, size / 80);
      const a = Math.min(1, (0.55 + mag * 0.45) * twinkle * blink + wave * 0.4);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
      g.addColorStop(0, `rgba(255, 250, 235, ${a})`);
      g.addColorStop(0.3, `rgba(255, 220, 150, ${a * 0.45})`);
      g.addColorStop(1, 'rgba(255, 220, 150, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r * 2.6, y - r * 2.6, r * 5.2, r * 5.2);
    });
    ctx.globalCompositeOperation = 'source-over';
    if (el.isConnected || now - spokeAt < 1000) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return el;
}

/** Имя наставника над репликой: «Медведица». */
export function mentorName(id: MentorId): HTMLElement {
  return h('div.mentor-name', null, t(`mentor.${id}`));
}

/**
 * Подсказка голосом наставника: медальон слева, имя и реплика справа. Без наставника —
 * сама реплика, как раньше.
 */
export function withMentor(text: Node): Node {
  const id = activeMentor();
  if (!id) return text;
  const portrait = mentorPortrait(id);
  return h('div.mentor-say', null, [portrait, h('div.mentor-line', null, [mentorName(id), text])]);
}

/** Витрина (`?mentors`): три наставника крупно рядом, с именами. */
export function showMentors(root: HTMLElement): void {
  const ids: MentorId[] = ['bear', 'swan', 'dolphin'];
  root.replaceChildren(
    h('div.mentor-gallery', null, ids.map((id) => h('figure', null, [mentorPortrait(id, 168), h('figcaption', null, t(`mentor.${id}`))]))),
  );
}
