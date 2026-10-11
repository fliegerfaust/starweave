import type { App } from '@/game/app';
import { saveProfile } from '@/meta/profile';
import { t } from '@/i18n';
import { h } from './dom';
import { button } from './widgets';

export type TutorialStep = 'place' | 'fillLine' | 'combos' | 'cross' | 'target' | 'burn' | 'shop' | 'boss';

const queue: TutorialStep[] = [];
let current: HTMLElement | null = null;

/**
 * Подсказка обучения: показывается один раз за всё время, только в первых забегах.
 * Не блокирует игру — плашка у края экрана.
 */
export function coach(app: App, step: TutorialStep, position: 'top' | 'bottom' = 'bottom'): void {
  if (app.profile.tutorial.includes(step) || app.profile.runs >= 3 || current?.dataset.step === step) return;
  if (current) {
    if (!queue.includes(step)) queue.push(step);
    return;
  }
  const el = h(`div.coach.coach-${position}`, null, [
    h('div.coach-icon', null, '✦'),
    h('div.coach-text', null, t(`tutorial.${step}`)),
    button(t('tutorial.gotIt'), () => dismiss(app, step), { variant: 'secondary', className: 'small' }),
  ]);
  el.dataset.step = step;
  document.getElementById('ui')!.append(el);
  current = el;
}

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
