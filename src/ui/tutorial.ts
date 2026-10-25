import type { App } from '@/game/app';
import { saveProfile } from '@/meta/profile';
import { t } from '@/i18n';
import { h } from './dom';

export type TutorialStep = 'place' | 'fillLine' | 'combos' | 'cross' | 'target' | 'burn' | 'shop' | 'boss' | 'routes';

const queue: TutorialStep[] = [];
let current: HTMLElement | null = null;
let ring: HTMLElement | null = null;
let thread: SVGSVGElement | null = null;
let waitToast = 0;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** Где на ночи небо и рука (CSS px): плашка встаёт в просвет между ними, нить ведёт к цели. */
export interface CoachDock {
  handTop: number;
  boardBottom: number;
  board: Box;
  hand: Box;
}
let dock: (() => CoachDock | null) | null = null;

/** Экран ночи сообщает, где рука и небо; без него — Обсерватория и карта главы. */
export function setCoachDock(fn: (() => CoachDock | null) | null): void {
  dock = fn;
}

const box = (sel: string): Box | null => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
};

/** Общая рамка нескольких элементов: звёзды развилки обводятся одной рамкой с подписями. */
const unionBox = (sel: string): Box | null => {
  const rs = [...document.querySelectorAll(sel)].map((el) => el.getBoundingClientRect()).filter((r) => r.width);
  if (!rs.length) return null;
  const x = Math.min(...rs.map((r) => r.left));
  const y = Math.min(...rs.map((r) => r.top));
  // Подпись под звездой висит ниже её кружка — рамка захватывает и её
  const lbl = [...document.querySelectorAll(`${sel} .sm-lbl`)].map((el) => el.getBoundingClientRect().bottom);
  const bottom = Math.max(...rs.map((r) => r.bottom), ...lbl);
  return { x, y, w: Math.max(...rs.map((r) => r.right)) - x, h: bottom - y };
};

/** Цель подсказки: о чём она говорит — то и обводим рамкой, к тому ведём нить. */
function targetOf(step: TutorialStep): Box | null {
  const d = dock?.();
  switch (step) {
    case 'place': return d?.hand ?? null;
    case 'fillLine':
    case 'cross': return d?.board ?? null;
    case 'target': return box('.hud-score-wrap');
    case 'combos': return box('.hud .icon-btn.q');
    case 'burn': return box('.burn-btn');
    case 'shop': return box('.owned-omens');
    case 'boss': return box('.map-node.eclipse .map-star') ?? box('.map-node.eclipse');
    case 'routes': return unionBox('.sm-star.open');
  }
}

/**
 * Подсказка первых забегов — «Нить» (RD.12, выбор Дениса): тёмная плашка с латунной кромкой
 * и тихим «Понятно», цель — в дышащей золотой рамке, от плашки к цели бежит золотая нить.
 * Экран не затемняется, плашка цель не закрывает. Один раз за всё время, в первых забегах.
 * Пока открыто окно, подсказки не показываются: окно важнее.
 */
export function coach(app: App, step: TutorialStep): void {
  // Развилки (ON.1) открываются на 3-й главе — подсказка о них не только для первых забегов
  const firstRuns = step !== 'routes';
  if (app.run?.tutorial || (firstRuns && (app.profile.tutorialFinished || app.profile.runs >= 3)) || app.profile.tutorial.includes(step) || current?.dataset.step === step) return;
  if (document.querySelector('.modal-backdrop')) return;
  // Тост ночи («Первая ночь…») посередине экрана: плашка ждёт, пока он уйдёт, — вместе
  // они ложились друг на друга и тост закрывал «Понятно» (CQ.2)
  if (!current && document.querySelector('#ui .toast:not(.out)')) {
    if (!queue.includes(step)) queue.push(step);
    clearTimeout(waitToast);
    // Вся очередь заново и по порядку: первая встанет (или снова подождёт), остальные — за ней
    waitToast = window.setTimeout(() => queue.splice(0).forEach((s) => coach(app, s)), 400);
    return;
  }
  if (current) {
    if (!queue.includes(step)) queue.push(step);
    return;
  }
  const ok = h('button.coach-ok', { type: 'button' }, t('tutorial.gotIt'));
  ok.addEventListener('click', () => dismiss(app, step));
  const el = h('div.coach', { attrs: { role: 'status', 'aria-live': 'polite' } }, [h('div.coach-text', null, t(`tutorial.${step}`)), ok]);
  el.dataset.step = step;
  ring = h('div.coach-ring', { attrs: { 'aria-hidden': 'true' } });
  thread = document.createElementNS(SVG, 'svg');
  thread.setAttribute('class', 'coach-thread');
  thread.setAttribute('aria-hidden', 'true');
  document.getElementById('ui')!.append(ring, thread, el);
  current = el;
  // Развилку игрок может выбрать, не нажав «Понятно», — подсказка всё равно была показана
  if (step === 'routes') {
    app.profile.tutorial.push(step);
    saveProfile(app.profile);
  }
  layoutCoach();
  // Экран мог ещё раскладываться (шрифты, карта главы) — уточняем место чуть позже
  setTimeout(layoutCoach, 450);
}

const SVG = 'http://www.w3.org/2000/svg';

/** Место плашки, рамка и нить — пересчитываются при повороте и смене размера. */
export function layoutCoach(): void {
  const el = current;
  if (!el || !ring || !thread) return;
  const step = el.dataset.step as TutorialStep;
  const target = targetOf(step);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const landscape = document.body.classList.contains('landscape');
  const d = dock?.();
  el.style.top = '';
  el.style.bottom = '';
  el.style.left = '';
  el.style.width = '';
  el.style.transform = '';
  const h = el.offsetHeight;
  const hit = (top: number) => !!target && top < target.y + target.h + 6 && top + h > target.y - 6;
  let top: number;
  if (landscape && d) {
    // Ландшафт: левая колонка под шапкой (ширину и край задаёт CSS)
    const hud = box('.hud');
    top = (hud ? hud.y + hud.h : 60) + 10;
  } else if (d) {
    const hud = box('.hud');
    const gap = d.handTop - h - 10;
    if (gap >= d.boardBottom + 4 && !hit(gap)) top = gap;
    else if (target && hud && target.y < hud.y + hud.h) top = Math.max(hud.y + hud.h + 6, d.board.y + 4);
    else top = Math.max(safeInset('top') + 4, hud ? hud.y + hud.h - h : 8);
  } else if (step === 'routes' && target) {
    // Развилка: плашка посередине карты неба (на ПК и в ландшафте карта не по центру окна),
    // над звёздами, а нет места — под ними; панель выбора справа она не закрывает
    const map = box('.sm-map');
    if (map) {
      el.style.width = `${Math.round(Math.min(360, map.w - 16))}px`;
      el.style.left = `${Math.round(map.x + map.w / 2)}px`;
    }
    const head = box('.map-top');
    const lo = (head ? head.y + head.h : safeInset('top')) + 8;
    const above = target.y - el.offsetHeight - 18;
    top = above >= lo ? above : target.y + target.h + 18;
  } else {
    // Обсерватория и карта главы: подальше от цели — сверху под шапкой или снизу над кнопками
    const head = box('.shop-top, .map-top');
    const foot = box('.shop-actions, .map-dock');
    // В Обсерватории сверху товары — плашка сначала пробует место над кнопками
    const low = step !== 'shop' && !!target && target.y + target.h / 2 > vh / 2;
    top = low ? (head ? head.y + head.h + 10 : safeInset('top') + 10) : (foot ? foot.y - h - 12 : vh - h - 16 - safeInset('bottom'));
    if (hit(top)) top = low ? (foot ? foot.y - h - 12 : vh - h - 16) : (head ? head.y + head.h + 10 : 10);
    // Низкий экран (телефон в ландшафте): цель посередине по высоте, ни сверху, ни снизу
    // её не обойти — уводим плашку вбок, на сторону подальше от цели, на высоту цели
    if (target && hit(top)) {
      const w = el.offsetWidth;
      const left = target.x + target.w / 2 > vw / 2 ? target.x - w - 18 : target.x + target.w + 18;
      if (left >= 8 && left + w <= vw - 8) {
        el.style.left = `${Math.round(left)}px`;
        el.style.transform = 'none';
        const lo = head ? head.y + head.h + 10 : safeInset('top') + 10;
        const hi = (foot ? foot.y - 12 : vh - 16) - h;
        top = Math.min(Math.max(target.y + target.h / 2 - h / 2, lo), Math.max(lo, hi));
      }
    }
  }
  el.style.top = `${Math.round(top)}px`;
  el.style.bottom = 'auto';
  if (!target) {
    ring.classList.remove('on');
    thread.replaceChildren();
    return;
  }
  const pad = step === 'combos' || step === 'boss' ? 4 : 6;
  Object.assign(ring.style, { left: `${target.x - pad}px`, top: `${target.y - pad}px`, width: `${target.w + pad * 2}px`, height: `${target.h + pad * 2}px` });
  ring.classList.toggle('round', step === 'combos' || step === 'boss');
  ring.classList.add('on');
  const b = el.getBoundingClientRect();
  const t0 = { x: target.x - pad, y: target.y - pad, w: target.w + pad * 2, h: target.h + pad * 2 };
  let path: string;
  let end: { x: number; y: number };
  if (b.right < t0.x) {
    const sy = b.top + b.height / 2;
    end = { x: t0.x - 2, y: t0.y + t0.h / 2 };
    path = `M${b.right} ${sy} C ${b.right + 60} ${sy}, ${end.x - 60} ${end.y}, ${end.x} ${end.y}`;
  } else if (b.left > t0.x + t0.w) {
    const sy = b.top + b.height / 2;
    end = { x: t0.x + t0.w + 2, y: t0.y + t0.h / 2 };
    path = `M${b.left} ${sy} C ${b.left - 60} ${sy}, ${end.x + 60} ${end.y}, ${end.x} ${end.y}`;
  } else {
    const below = b.top >= t0.y + t0.h;
    const sx = b.left + b.width / 2;
    const sy = below ? b.top : b.bottom;
    end = { x: Math.min(Math.max(sx, t0.x + 14), t0.x + t0.w - 14), y: below ? t0.y + t0.h + 2 : t0.y - 2 };
    const mid = (sy + end.y) / 2;
    path = `M${sx} ${sy} C ${sx} ${mid}, ${end.x} ${mid}, ${end.x} ${end.y}`;
  }
  thread.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', path);
  const dot = document.createElementNS(SVG, 'circle');
  dot.setAttribute('cx', String(end.x));
  dot.setAttribute('cy', String(end.y));
  dot.setAttribute('r', '3.5');
  thread.replaceChildren(p, dot);
}
window.addEventListener('resize', () => requestAnimationFrame(layoutCoach));

/** Safe area в px: `--safe-top` — это env()/calc(var()), строкой не прочесть — меряем. */
function safeInset(side: 'top' | 'bottom'): number {
  const probe = h('div', { style: `position: fixed; visibility: hidden; pointer-events: none; height: var(--safe-${side}, 0px)` });
  document.body.append(probe);
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return px;
}

/** Подсказка устарела (игрок уже сделал то, о чём она) — убрать из очереди. */
export function dropCoach(...steps: TutorialStep[]): void {
  for (const s of steps) {
    const i = queue.indexOf(s);
    if (i >= 0) queue.splice(i, 1);
  }
}

// Открылось окно — плашку убираем, чтобы она не висела поверх него
document.addEventListener('starweave:modal', () => clearCoach());

function dismiss(app: App, step: TutorialStep): void {
  if (!app.profile.tutorial.includes(step)) app.profile.tutorial.push(step);
  saveProfile(app.profile);
  current?.classList.add('out');
  const parts = [current, ring, thread];
  parts.forEach((p) => p?.classList.add('out'));
  setTimeout(() => parts.forEach((p) => p?.remove()), 200);
  current = null;
  ring = null;
  thread = null;
  const next = queue.shift();
  if (next) setTimeout(() => coach(app, next), 250);
}

export function clearCoach(): void {
  clearTimeout(waitToast);
  current?.remove();
  ring?.remove();
  thread?.remove();
  current = null;
  ring = null;
  thread = null;
  queue.length = 0;
}
