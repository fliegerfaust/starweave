import type { App } from '@/game/app';
import { saveProfile } from '@/meta/profile';
import { t } from '@/i18n';
import { h } from './dom';
import { button } from './widgets';

export type TutorialStep = 'place' | 'fillLine' | 'combos' | 'cross' | 'target' | 'burn' | 'shop' | 'boss';

const queue: TutorialStep[] = [];
let current: HTMLElement | null = null;
/** Верх свободной полосы над рукой (CSS px) — плашка встаёт над картами, не закрывая HUD. */
let dock: (() => number | null) | null = null;

/** Экран ночи сообщает, где начинается рука; без него плашка — над нижними кнопками экрана. */
export function setCoachDock(fn: (() => number | null) | null): void {
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

function place(el: HTMLElement): void {
  const top = dock?.();
  if (top == null) return;
  el.style.bottom = 'auto';
  el.style.top = `${Math.max(8, top - el.offsetHeight - 8)}px`;
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
