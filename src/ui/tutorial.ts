import type { App } from '@/game/app';
import { saveProfile } from '@/meta/profile';
import { t } from '@/i18n';
import { h } from './dom';
import { button } from './widgets';

export type TutorialStep = 'place' | 'fillLine' | 'combos' | 'cross' | 'target' | 'burn' | 'shop' | 'boss';

const queue: TutorialStep[] = [];
let current: HTMLElement | null = null;
/** Где рука и где кончается небо (CSS px) — плашка встаёт между ними, не закрывая HUD. */
export interface CoachDock {
  handTop: number;
  boardBottom: number;
}
let dock: (() => CoachDock | null) | null = null;

/** Экран ночи сообщает, где рука и небо; без него плашка — над нижними кнопками экрана. */
export function setCoachDock(fn: (() => CoachDock | null) | null): void {
  dock = fn;
}

/**
 * Подсказка обучения: показывается один раз за всё время, только в первых забегах.
 * Не блокирует игру — плашка над рукой (или над нижними кнопками), не поверх счёта и цели.
 * Пока открыто окно, подсказки не показываются: окно важнее.
 */
export function coach(app: App, step: TutorialStep): void {
  if (app.run?.tutorial || app.profile.tutorialFinished || app.profile.tutorial.includes(step) || app.profile.runs >= 3 || current?.dataset.step === step) return;
  if (document.querySelector('.modal-backdrop')) return;
  if (current) {
    if (!queue.includes(step)) queue.push(step);
    return;
  }
  const el = h('div.coach', null, [
    h('div.coach-icon', null, '✦'),
    h('div.coach-text', null, t(`tutorial.${step}`)),
    button(t('tutorial.gotIt'), () => dismiss(app, step), { variant: 'secondary', className: 'small' }),
  ]);
  el.dataset.step = step;
  document.getElementById('ui')!.append(el);
  current = el;
  place(el);
}

/**
 * Плашка — в просвет между небом и рукой. Если просвета нет (невысокий экран), она
 * ложится на HUD, но не на небо и руку: там то, о чём она говорит. В ландшафте — в левой
 * колонке под HUD (CSS), там пусто.
 */
function place(el: HTMLElement): void {
  const d = dock?.();
  if (!d || document.body.classList.contains('landscape')) return;
  let top = d.handTop - el.offsetHeight - 8;
  if (top < d.boardBottom + 4) {
    // Просвета нет: подсказки про руку и небо закрывают HUD, а подсказка про цель
    // (она о HUD) — нижние кнопки и край руки
    const hud = document.querySelector('.hud')?.getBoundingClientRect();
    const actions = document.querySelector('.actions')?.getBoundingClientRect();
    if (el.dataset.step === 'target' && actions) top = actions.top - el.offsetHeight - 6;
    else top = Math.max(4, (hud?.bottom ?? el.offsetHeight + 8) - el.offsetHeight);
  }
  el.style.bottom = 'auto';
  el.style.top = `${top}px`;
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
  const el = current;
  setTimeout(() => el?.remove(), 200);
  current = null;
  const next = queue.shift();
  if (next) setTimeout(() => coach(app, next), 250);
}

export function clearCoach(): void {
  current?.remove();
  current = null;
  queue.length = 0;
}
