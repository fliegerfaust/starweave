import { t } from '@/i18n';
import { h } from './dom';

/**
 * Наставник-созвездие (GO.6, витрина): живое созвездие в медальоне рядом с подсказкой обучения и
 * «Нити». Рисуется кодом линиями звёзд, без ассетов. Живёт: звёзды мерцают, «глаз» моргает, у
 * каждого своё движение (медведица кивает, лебедь машет крыльями, дельфин покачивается); когда
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
  // Большая Медведица: ковш — спина и бёдра, ручка — хвост; голова с ухом и глазом
  bear: {
    stars: [
      [10, 52, 0.8], [21, 44, 1], [26, 33, 0.6], [35, 41, 0.7], [52, 37, 0.9], [67, 40, 0.9],
      [70, 56, 0.8], [53, 57, 0.8], [82, 31, 0.8], [93, 22, 0.7], [37, 59, 0.6], [33, 78, 0.6], [70, 78, 0.6],
    ],
    lines: [[0, 1], [1, 2], [2, 3], [1, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 4], [5, 8], [8, 9], [3, 10], [10, 11], [6, 12]],
    eye: 1,
    moving: [0, 1, 2],
    move: (s, x, y) => [x + s * 1.2, y + s * 2.2 * (1 - x / 40)],
    shape: [
      [6, 53, 1], [12, 42, 1], [22, 35, 1], [25, 27, 1], [31, 33, 1], [42, 33], [56, 31], [68, 33], [80, 29], [95, 19],
      [96, 24], [84, 36], [76, 46], [75, 60], [74, 82], [66, 82], [63, 62], [44, 62], [38, 82], [30, 82], [31, 61], [22, 57, 1], [12, 58, 1],
    ],
  },
  // Лебедь: летящая птица — клюв, длинная шея, тело, хвост веером, широкие крылья с перьями
  swan: {
    stars: [[50, 7, 0.9], [50, 28, 0.7], [50, 47, 1], [51, 86, 0.7], [27, 40, 0.8], [8, 28, 0.7], [73, 52, 0.8], [92, 62, 0.7]],
    lines: [[0, 1], [1, 2], [2, 3], [2, 4], [4, 5], [2, 6], [6, 7]],
    eye: 0,
    moving: [4, 5, 6, 7],
    move: (s, x, y) => [x, y + s * (Math.abs(x - 50) / 50) * 9],
    shape: [
      [50, 2], [55, 7], [54, 28], [58, 40], [74, 44, 1], [96, 57, 1], [98, 65, 1], [89, 66, 1], [85, 62, 1], [79, 67, 1], [73, 61, 1],
      [61, 58], [58, 78], [63, 93], [51, 89], [39, 93], [43, 78], [40, 58], [30, 52, 1], [24, 47, 1], [17, 48, 1], [12, 39, 1],
      [5, 37, 1], [2, 27, 1], [8, 20, 1], [28, 33, 1], [42, 40], [46, 28], [45, 7],
    ],
  },
  // Дельфин в прыжке: ромб — тело, нос впереди, спинной плавник, хвост с двумя лопастями
  dolphin: {
    stars: [[40, 40, 0.9], [54, 28, 1], [66, 36, 0.9], [52, 46, 0.8], [85, 30, 0.7], [28, 58, 0.7], [13, 62, 0.6], [14, 80, 0.6]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 0], [2, 4], [0, 5], [5, 6], [5, 7]],
    eye: 2,
    moving: [5, 6, 7],
    move: (s, x, y) => [x + s * 2, y - s * 3],
    shape: [
      [93, 31], [80, 24], [66, 22], [57, 10], [50, 23], [38, 31], [29, 45], [23, 57, 1], [10, 58, 1], [5, 53, 1], [12, 69, 1],
      [6, 85, 1], [19, 80, 1], [29, 67, 1], [40, 53], [56, 46], [70, 39], [82, 35],
    ],
  },
};

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
    const s = calm ? 0 : Math.sin(time * (id === 'swan' ? 2.4 : 1.6));
    const pts = fig.stars.map(([x, y], i) => {
      const [mx, my] = fig.moving.includes(i) ? fig.move(s, x, y) : [x, y];
      return [pad + mx * k, pad + (my + (calm ? 0 : id === 'dolphin' ? Math.sin(time * 1.3) * 2.5 : Math.sin(time * 0.9) * 0.8)) * k] as const;
    });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    // Силуэт зверя за звёздами: тонкая золотая кромка и слабая заливка, сглаженная кривая через середины
    const bob = calm ? 0 : id === 'dolphin' ? Math.sin(time * 1.3) * 2.5 : Math.sin(time * 0.9) * 0.8;
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
    fill.addColorStop(0, 'rgba(246, 194, 91, 0.16)');
    fill.addColorStop(1, 'rgba(246, 194, 91, 0.04)');
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 230, 168, ${0.22 + 0.12 * Math.max(0, 1 - since)})`;
    ctx.lineWidth = Math.max(0.8, size / 110);
    ctx.stroke();
    // Линии прорисовываются по очереди, когда наставник заговорил
    const draw = calm ? 1 : Math.min(1, since / 0.7);
    fig.lines.forEach(([a, b], i) => {
      const u = Math.max(0, Math.min(1, draw * fig.lines.length - i));
      if (u <= 0) return;
      const [ax, ay] = pts[a]!;
      const [bx, by] = pts[b]!;
      ctx.strokeStyle = `rgba(255, 230, 168, ${0.55 + 0.25 * Math.max(0, 1 - since)})`;
      ctx.lineWidth = Math.max(1.2, size / 40);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax + (bx - ax) * u, ay + (by - ay) * u);
      ctx.stroke();
    });
    // Звёзды: мерцание, волна при реплике, глаз моргает раз в несколько секунд
    ctx.globalCompositeOperation = 'lighter';
    fig.stars.forEach(([, , mag], i) => {
      const [x, y] = pts[i]!;
      const twinkle = calm ? 1 : 0.8 + 0.2 * Math.sin(time * 2.7 + i * 1.9);
      const wave = calm ? 0 : Math.max(0, 1 - Math.abs(since * 3 - i * 0.35)) * 0.8;
      const blink = i === fig.eye && !calm && time % 4.2 < 0.14 ? 0.2 : 1;
      const r = (1.1 + mag * 1.5 + wave * 1.2) * (i === fig.eye ? 1.25 : 1) * Math.max(1, size / 70);
      const a = Math.min(1, (0.55 + mag * 0.45) * twinkle * blink + wave * 0.4);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
      g.addColorStop(0, `rgba(255, 250, 235, ${a})`);
      g.addColorStop(0.3, `rgba(255, 220, 150, ${a * 0.45})`);
      g.addColorStop(1, 'rgba(255, 220, 150, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4);
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
