import { t } from '@/i18n';
import { h } from './dom';
import { withMentor } from './mentor';
import { actionText } from './rich';
import { button, modal } from './widgets';

/**
 * Цель забега на виду (GO.5, витрина `?runpath=a|b`). Восемь глав до рассвета, в конце каждой —
 * Затмение. `a` — «Путь в шапке»: деления карты главы стали путём из восьми Затмений-колечек и
 * солнца рассвета в конце. `b` — «Пролог пути»: то же и один раз перед первой картой главы
 * во всё небо загорается путь, Лебедь говорит, зачем идём.
 */
export type RunPathVariant = 'a' | 'b';
export function runPathVariant(): RunPathVariant | null {
  const v = import.meta.env.DEV ? document.documentElement.dataset.runpath : undefined;
  return v === 'a' || v === 'b' ? v : null;
}

/** Путь в шапке: пройденные главы — золотые, текущая светится, впереди — Затмения, в конце — рассвет. */
export function runPathStrip(ante: number, total: number): HTMLElement {
  const marks = Array.from({ length: total }, (_, i) => h(`i${i < ante - 1 ? '.done' : i === ante - 1 ? '.now' : ''}`));
  return h('div.map-run', { attrs: { 'aria-label': t('runPath.aria', { n: ante, total }) } }, [...marks, h('b.dawn', { attrs: { 'aria-hidden': 'true' } })]);
}

/** Пролог пути: восемь звёзд-глав дугой и рассвет; один раз, перед первой картой главы. */
export function showRunPrologue(ante: number, total: number, done: () => void): void {
  const W = 340;
  const H = 190;
  const pts = Array.from({ length: total + 1 }, (_, i) => {
    const k = i / total;
    return { x: 24 + k * (W - 48), y: H - 40 - Math.sin(k * Math.PI * 0.9) * 110 };
  });
  // Знаки те же, что в полосе шапки: впереди — Затмение (тёмное ядро в жемчужном ободке), пройдено —
  // золото, сейчас — золотое кольцо с точкой, в конце — рассвет полудиском над линией горизонта
  const sun = pts[total]!;
  const chapter = (p: { x: number; y: number }, i: number) =>
    i < ante - 1
      ? `<circle class="ch done" cx="${p.x}" cy="${p.y}" r="6" style="--d:${0.25 + i * 0.16}s"/>`
      : i === ante - 1
        ? `<g class="ch now" style="--d:${0.25 + i * 0.16}s"><circle cx="${p.x}" cy="${p.y}" r="9"/><circle class="dot" cx="${p.x}" cy="${p.y}" r="3"/></g>`
        : `<circle class="ch eclipse" cx="${p.x}" cy="${p.y}" r="7" style="--d:${0.25 + i * 0.16}s"/>`;
  const svg = `<svg viewBox="0 0 ${W} ${H}" class="run-arc" aria-hidden="true">
    <path class="trail" d="M ${pts.map((p) => `${p.x} ${p.y}`).join(' L ')}"/>
    ${pts.slice(0, total).map(chapter).join('')}
    <g class="sun" style="--d:${0.25 + total * 0.16}s"><path d="M ${sun.x - 15} ${sun.y + 4} a 15 15 0 0 1 30 0 z"/><line x1="${sun.x - 24}" y1="${sun.y + 4}" x2="${sun.x + 24}" y2="${sun.y + 4}"/></g>
  </svg>`;
  const arc = h('div.run-prologue-sky');
  arc.innerHTML = svg;
  const go = () => {
    // Звёзды дуги сворачиваются в полосу пути в шапке: картинка пролога — это она и есть
    const from = [...arc.querySelectorAll('.ch, .sun')].map((el) => el.getBoundingClientRect());
    m.close();
    foldIntoStrip(from);
  };
  const m = modal(
    [
      h('h2.run-prologue-title', null, t('runPath.title')),
      arc,
      h('div.run-prologue-text', null, [
        h('div.run-prologue-say', null, withMentor(h('div.coach-text', null, actionText(t('runPath.say', { total }))))),
        h('div.run-prologue-acts', null, [button(t('runPath.go'), go)]),
      ]),
    ],
    { dismissable: false, className: 'narrow run-prologue', onClose: done },
  );
}

/** Перелёт знаков с дуги пролога в полосу шапки (FLIP): связь «вот путь» → «вот он наверху». */
function foldIntoStrip(from: DOMRect[]): void {
  const to = [...document.querySelectorAll('.map-run i, .map-run .dawn')].map((el) => el.getBoundingClientRect());
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('calm');
  if (calm || to.length !== from.length) return;
  from.forEach((a, i) => {
    const b = to[i]!;
    const spark = h('i.run-fold');
    Object.assign(spark.style, { left: `${a.left + a.width / 2}px`, top: `${a.top + a.height / 2}px` });
    document.body.append(spark);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const anim = spark.animate(
      [{ transform: 'translate(-50%, -50%) scale(1.4)', opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.6)`, opacity: 0.9 }],
      { duration: 650, delay: i * 40, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
    );
    anim.onfinish = () => spark.remove();
  });
}
