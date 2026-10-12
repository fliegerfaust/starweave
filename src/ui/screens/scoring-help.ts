import { t } from '@/i18n';
import { h } from '../dom';
import { omenBadge } from '../hud';
import { button, modal } from '../widgets';

/** Окно «Как считаются очки»: шаги подсчёта и пример, почему ×-Знамения ставят правее. */
export function showScoringHelp(): void {
  const step = (n: number, text: string, visual?: HTMLElement) =>
    h('div.score-step', { style: { animationDelay: `${n * 0.08}s` } }, [h('div.score-step-n', null, String(n)), h('div.score-step-body', null, [h('div', null, text), visual ?? null])]);
  const box = (cls: string, value: string, label: string) => h(`div.mini-box.${cls}`, null, [h('b', null, value), h('span', null, label)]);
  const formula = h('div.mini-formula', null, [box('light', '28', t('calc.light')), h('span', null, '×'), box('mult', '2', t('calc.mult')), h('span', null, '='), box('total', '56', t('calc.total'))]);
  const chip = (kind: 'mult' | 'xmult', label: string) => h('span.order-chip', null, [omenBadge(kind), label]);
  const row = (good: boolean, title: string, first: HTMLElement, second: HTMLElement, math: string) =>
    h(`div.order-row${good ? '.good' : '.bad'}`, null, [
      h('div.order-title', null, title),
      h('div.order-flow', null, [first, h('span.arrow', null, '→'), second]),
      h('div.order-math', null, [math, h('span.order-mark', null, good ? ' ✓' : '')]),
    ]);
  const m = modal(
    [
      h('div.score-steps', null, [
        step(1, t('scoring.step1')),
        step(2, t('scoring.step2')),
        step(3, t('scoring.step3')),
        step(4, t('scoring.step4'), formula),
        step(5, t('scoring.step5')),
      ]),
      h('h3.order-head', null, t('scoring.orderTitle')),
      h('p.hint', null, t('scoring.orderSetup')),
      row(true, t('scoring.good'), chip('mult', '+4'), chip('xmult', '×3'), '(2 + 4) × 3 = 18'),
      row(false, t('scoring.bad'), chip('xmult', '×3'), chip('mult', '+4'), '2 × 3 + 4 = 10'),
      h('p.order-moral', null, t('scoring.moral')),
      h('div.row.end', null, button(t('tutorial.gotIt'), () => m.close())),
    ],
    { title: t('scoring.title') },
  );
}
