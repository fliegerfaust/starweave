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

const FIGURES: Record<MentorId, MentorFigure> = {
  // Медведица: тяжёлое тело с горбом на загривке, голова низко, круглое ухо, короткие толстые лапы и хвостик
  bear: {
    stars: [
      [9, 57, 0.8], [19, 49, 1], [28, 37, 0.6], [49, 29, 0.9], [67, 31, 0.8], [84, 42, 0.8],
      [37, 51, 0.7], [62, 60, 0.7], [39, 79, 0.6], [80, 79, 0.6],
    ],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [3, 6], [6, 8], [6, 7], [7, 5], [5, 9]],
    eye: 1,
    moving: [0, 1, 2],
    move: (s, x, y) => [x + s * 0.6, y + s * 1.8],
    shape: [
      [5, 58, 1], [10, 50, 1], [18, 44, 1], [24, 38, 1], [26, 31, 1], [31, 30, 1], [34, 35, 1], [42, 31], [50, 25], [62, 26],
      [74, 29], [84, 35], [90, 44], [93, 47], [90, 51], [88, 60], [87, 76], [90, 82], [76, 82], [74, 66], [60, 66], [47, 66],
      [44, 76], [47, 82], [33, 82], [31, 66], [24, 63, 1], [14, 63, 1],
    ],
  },
  // Лебедь на воде: длинная шея S-изгибом, маленькая голова, пышное приподнятое крыло, острый хвост
  swan: {
    stars: [[13, 13, 1], [19, 32, 0.7], [16, 54, 0.8], [34, 53, 0.7], [58, 30, 0.8], [85, 25, 0.8], [92, 52, 0.7], [58, 70, 0.7]],
    lines: [[0, 1], [1, 3], [1, 2], [3, 4], [4, 5], [5, 6], [6, 7], [7, 2]],
    eye: 0,
    moving: [4, 5],
    move: (s, x, y) => [x, y - s * 2.5 * ((x - 40) / 50)],
    shape: [
      [3, 18], [11, 9], [19, 8], [24, 13], [23, 23], [19, 33], [22, 45], [30, 53], [40, 51], [48, 40, 1], [56, 30, 1],
      [66, 23, 1], [78, 20, 1], [89, 23, 1], [84, 29, 1], [91, 33, 1], [84, 38, 1], [90, 44, 1], [95, 52], [87, 60], [78, 67],
      [58, 73], [38, 72], [23, 66], [15, 56], [12, 45], [14, 33], [16, 24], [14, 18], [9, 20],
    ],
  },
  // Дельфин в прыжке: клюв, лоб, спинной и грудной плавники, хвост с двумя лопастями
  dolphin: {
    stars: [[91, 23, 0.8], [78, 19, 1], [54, 10, 0.8], [40, 28, 0.9], [22, 57, 0.7], [7, 52, 0.6], [8, 73, 0.6], [51, 42, 0.6], [66, 29, 0.8]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 8], [8, 1], [3, 4], [4, 5], [4, 6], [8, 7]],
    eye: 1,
    moving: [4, 5, 6],
    move: (s, x, y) => [x + s * 1.5 * (1 - x / 30), y - s * 4 * (1 - x / 30)],
    shape: [
      [96, 24], [87, 20], [80, 13], [70, 11], [60, 12], [52, 1], [49, 15], [38, 24], [28, 38], [20, 52, 1], [11, 53, 1],
      [3, 48, 1], [10, 62, 1], [4, 76, 1], [17, 67, 1], [27, 56], [38, 44], [47, 40], [48, 49], [56, 36], [66, 30], [79, 27], [88, 27],
    ],
  },
};

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
