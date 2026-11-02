import { t } from '@/i18n';
import { h } from './dom';

/**
 * Наставник — Лебедь (GO.6, выбор Дениса 02.11.2026): живое созвездие в медальоне рядом с
 * подсказками обучения и «Нити». Игрок — Звездочёт, Лебедь его ведёт. Рисуется кодом, без
 * ассетов: звёзды Лебедя (Северного Креста) на своих настоящих местах, вокруг — силуэт птицы,
 * как в звёздном атласе. Живёт: звёзды мягко мерцают, «глаз» (Альбирео) прикрывается, крылья
 * медленно поднимаются, птица чуть покачивается; когда Лебедь заговаривает, линии прорисовываются.
 * «Меньше движения» — неподвижная фигура.
 */

interface Figure {
  /** Звёзды в кадре 0…100; третье число — яркость 0…1. */
  stars: [x: number, y: number, mag: number][];
  lines: [number, number][];
  eye: number;
  /** Звёзды крыльев: поднимаются и опускаются. */
  wings: number[];
  /** Силуэт птицы: точки контура, третье — точка крыла (движется вместе с ним). */
  shape: [x: number, y: number, wing?: 1][];
}

/**
 * Звёзды — прямое восхождение и склонение (J2000), спроецированные как на карте неба (восток
 * слева) и повёрнутые на 40°, яркость — по звёздной величине: 0 Денеб (хвост), 1 Садр (грудь),
 * 2 η (шея), 3 Альбирео (голова), 4 δ, 5 ι, 6 κ (крыло), 7 ε Гиенах, 8 ζ (другое крыло).
 */
const SWAN: Figure = fit({
  stars: [[21.1, 51.5, 1], [37.3, 55.6, 0.85], [56.5, 57.7, 0.5], [78.9, 63.9, 0.65], [43.6, 33.2, 0.7], [38.1, 14.5, 0.5], [40.3, 7, 0.5], [38.8, 76.5, 0.75], [34.8, 93, 0.6]],
  lines: [[0, 1], [1, 2], [2, 3], [1, 4], [4, 5], [5, 6], [1, 7], [7, 8]],
  eye: 3,
  wings: [4, 5, 6, 7, 8],
  shape: [
    [8, 52], [14, 46], [24, 46], [30, 40, 1], [24, 36, 1], [29, 31, 1], [23, 26, 1], [28, 20, 1], [24, 14, 1], [31, 10, 1],
    [30, 4, 1], [37, 0, 1], [45, 0, 1], [50, 14, 1], [53, 28, 1], [52, 44], [57, 53], [68, 57], [78, 59], [82, 59], [91, 65],
    [82, 69], [70, 64], [57, 62], [52, 66], [50, 82, 1], [45, 96, 1], [39, 103, 1], [33, 98, 1], [30, 92, 1], [25, 88, 1],
    [29, 80, 1], [23, 76, 1], [27, 68, 1], [30, 62], [24, 60], [15, 58],
  ],
});

/** Линия, вдоль которой летит птица (y груди): крылья расходятся от неё. */
const AXIS = SWAN.stars[1]![1];

/** Вписать фигуру в кадр 4…96: звёзды и силуэт вместе, пропорции сохраняются. */
function fit(fig: Figure): Figure {
  const xs = fig.shape.map((p) => p[0]);
  const ys = fig.shape.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = 92 / Math.max(x1 - x0, y1 - y0);
  const ox = (100 - (x1 - x0) * k) / 2 - x0 * k;
  const oy = (100 - (y1 - y0) * k) / 2 - y0 * k;
  return {
    ...fig,
    stars: fig.stars.map(([x, y, m]) => [x * k + ox, y * k + oy, m]),
    shape: fig.shape.map(([x, y, wing]) => (wing ? [x * k + ox, y * k + oy, wing] : [x * k + ox, y * k + oy])),
  };
}

/** Взмах: точки крыла уходят от оси полёта и возвращаются. */
const flap = (s: number, y: number) => y + s * (y - AXIS) * 0.07;

/** Медальон с живым Лебедем; при появлении линии прорисовываются, как будто он заговорил. */
export function mentorPortrait(size = 60): HTMLElement {
  const fig = SWAN;
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
    const s = calm ? 0 : Math.sin(time * 0.9);
    // Покачивание всей птицы, медленное, как дыхание
    const bob = calm ? 0 : Math.sin(time * 0.7) * 1.2;
    const at = (x: number, y: number, wing: boolean) => [pad + x * k, pad + ((wing ? flap(s, y) : y) + bob) * k] as const;
    const pts = fig.stars.map(([x, y], i) => at(x, y, fig.wings.includes(i)));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    // Силуэт птицы за звёздами: золотая кромка и слабая заливка, сглаженная кривая через середины
    const outline = fig.shape.map(([x, y, wing]) => at(x, y, !!wing));
    ctx.beginPath();
    outline.forEach(([x, y], i) => {
      const [nx, ny] = outline[(i + 1) % outline.length]!;
      if (i === 0) ctx.moveTo((x + nx) / 2, (y + ny) / 2);
      else ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
    });
    const [fx, fy] = outline[0]!;
    const [sx, sy] = outline[1]!;
    ctx.quadraticCurveTo(fx, fy, (fx + sx) / 2, (fy + sy) / 2);
    ctx.closePath();
    const fill = ctx.createRadialGradient(size / 2, size * 0.4, 0, size / 2, size / 2, size * 0.6);
    fill.addColorStop(0, 'rgba(246, 194, 91, 0.26)');
    fill.addColorStop(1, 'rgba(246, 194, 91, 0.1)');
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 230, 168, ${0.42 + 0.12 * Math.max(0, 1 - since)})`;
    ctx.lineWidth = Math.max(0.8, size / 100);
    ctx.stroke();
    // Линии прорисовываются по очереди, когда Лебедь заговорил
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
    // Звёзды: мерцание медленное и мягкое, волна при реплике, глаз плавно прикрывается раз в несколько секунд
    ctx.globalCompositeOperation = 'lighter';
    fig.stars.forEach(([, , mag], i) => {
      const [x, y] = pts[i]!;
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
    // Медальон убрали со страницы — кадры больше не нужны
    if (el.isConnected || now - spokeAt < 1000) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return el;
}

/** Подсказка голосом Лебедя: медальон слева, имя капителью и реплика справа. */
export function withMentor(text: Node): Node {
  return h('div.mentor-say', null, [mentorPortrait(), h('div.mentor-line', null, [h('div.mentor-name', null, t('mentor.name')), text])]);
}
