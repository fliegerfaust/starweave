import { t } from '@/i18n';
import { h } from '../dom';
import { omenBadge } from '../hud';

/**
 * «Как считаются очки» — часть Справки: шаги подсчёта (вкладка «Ночь») и пример, почему
 * ×-Знамения ставят правее (вкладка «Обсерватория»).
 */
export function scoringSteps(): HTMLElement {
  const step = (n: number, text: string, visual?: HTMLElement) =>
    h('div.score-step', { style: { animationDelay: `${n * 0.08}s` } }, [h('div.score-step-n', null, String(n)), h('div.score-step-body', null, [h('div', null, text), visual ?? null])]);
  const box = (cls: string, value: string, label: string) => h(`div.mini-box.${cls}`, null, [h('b', null, value), h('span', null, label)]);
  const formula = h('div.mini-formula', null, [box('light', '28', t('calc.light')), h('span', null, '×'), box('mult', '2', t('calc.mult')), h('span', null, '='), box('total', '56', t('calc.total'))]);
  return h('div.score-steps', { dataset: { guide: 'scoring' } }, [
    step(1, t('scoring.step1')),
    step(2, t('scoring.step2')),
    step(3, t('scoring.step3')),
    step(4, t('scoring.step4'), formula),
    step(5, t('scoring.step5')),
  ]);
}

export function omenOrder(): HTMLElement {
  const chip = (kind: 'mult' | 'xmult', label: string) => h('span.order-chip', null, [omenBadge(kind), label]);
  const row = (good: boolean, title: string, first: HTMLElement, second: HTMLElement, math: string) =>
    h(`div.order-row${good ? '.good' : '.bad'}`, null, [
      h('div.order-title', null, title),
      h('div.order-flow', null, [first, h('span.arrow', null, '→'), second]),
      h('div.order-math', null, [math, h('span.order-mark', null, good ? ' ✓' : '')]),
    ]);
  return h('div.omen-order', { dataset: { guide: 'order' } }, [
    h('h3.order-head', null, t('scoring.orderTitle')),
    h('p.hint', null, t('scoring.orderSetup')),
    row(true, t('scoring.good'), chip('mult', '+4'), chip('xmult', '×3'), '(2 + 4) × 3 = 18'),
    row(false, t('scoring.bad'), chip('xmult', '×3'), chip('mult', '+4'), '2 × 3 + 4 = 10'),
    h('p.order-moral', null, t('scoring.moral')),
  ]);
}
