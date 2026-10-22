import { FINAL_ANTE } from '@/core/content/balance';
import type { JourneyStep, RouteKind } from '@/core/route';
import type { RunState } from '@/core/types';
import { named, num, t } from '@/i18n';
import { h } from './dom';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
/** Цвет узла пути — цвет вида, как на «Карте неба». */
const ROUTE_COLOR: Record<RouteKind, string> = { night: '#ffe6a8', bright: '#ffd27a', comet: '#ff9a62', telescope: '#9ff0ff', eclipse: '#e8e4f4' };

/**
 * Мини-созвездие главы: точки — варианты каждого шага, золотая линия — путь игрока снизу вверх,
 * узлы — цветом вида. Глава, до которой игрок не дошёл, — пустые точки.
 */
function chapterSvg(steps: JourneyStep[] | undefined, w = 70, hh = 76): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${hh}`);
  svg.setAttribute('aria-hidden', 'true');
  const rows = steps?.length ? steps : [{ route: 'night', col: 0, of: 2 }, { route: 'night', col: 0, of: 2 }, { route: 'eclipse', col: 0, of: 1 }] as JourneyStep[];
  const total = Math.max(3, rows.length);
  const xOf = (s: JourneyStep, c: number) => (s.of === 1 ? w / 2 : 10 + ((w - 20) * c) / (s.of - 1));
  const yOf = (i: number) => hh - 7 - ((i + 1) * (hh - 16)) / total;
  const dots: string[] = [];
  const pts: [number, number][] = [[w / 2, hh - 7]];
  rows.forEach((s, i) => {
    for (let c = 0; c < s.of; c++) dots.push(`<circle class="jr-dot" cx="${xOf(s, c)}" cy="${yOf(i)}" r="1.5"/>`);
    if (steps?.length) pts.push([xOf(s, s.col), yOf(i)]);
  });
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const nodes = steps?.length ? steps.map((s, i) => `<circle cx="${pts[i + 1]![0]}" cy="${pts[i + 1]![1]}" r="${s.route === 'eclipse' ? 3.4 : 2.6}" fill="${ROUTE_COLOR[s.route]}"/>`).join('') : '';
  svg.innerHTML = `${dots.join('')}${steps?.length ? `<path class="jr-walk" d="${d}"/>` : ''}${nodes}${steps?.length ? `<circle cx="${w / 2}" cy="${hh - 7}" r="2" fill="#fff3c4"/>` : ''}`;
  return svg;
}

/**
 * Открытка «Мой путь» (RT.3, вариант C витрины d8-route-wonders, выбор Дениса 22.10.2026):
 * восемь глав маленькими созвездиями пути, главные числа и «Поделиться путём». В окне победы
 * и поражения; на ПК — крупно, рядом с итогами. Пути глав прорисовываются по очереди.
 */
export function journeyCard(run: RunState, onShare: (() => void) | null): HTMLElement {
  const journey = run.journey ?? [];
  const chapters = Math.max(FINAL_ANTE, journey.length);
  const grid = h('div.jr-grid', null, Array.from({ length: Math.min(chapters, FINAL_ANTE) }, (_, i) =>
    h(`div.jr-ch${journey[i]?.length ? '' : '.empty'}`, { style: { animationDelay: `${0.3 + i * 0.12}s` } }, [chapterSvg(journey[i]), h('small', null, ROMAN[i] ?? String(i + 1))])));
  const reached = Math.min(run.ante, FINAL_ANTE);
  return h('div.jr-card', null, [
    h('div.jr-title', null, t('journey.title')),
    h('div.jr-sub', null, t('journey.sub', { sky: named('sky', run.skyId).name })),
    grid,
    h('div.jr-nums', null, [
      h('div', null, [h('b', null, ROMAN[reached - 1] ?? String(reached)), t('journey.chapters')]),
      h('div', null, [h('b', null, num(run.stats.bestPlacement)), t('journey.best')]),
      h('div', null, [h('b', null, num(run.stats.crosses)), t('journey.crosses')]),
    ]),
    onShare ? h('button.btn.btn-secondary.jr-share', { type: 'button', onclick: onShare }, h('span.btn-label', null, t('journey.share'))) : null,
  ]);
}

/** Есть ли что показать: глава с развилками пройдена хоть на шаг. */
export function hasJourney(run: RunState): boolean {
  return !!run.unlocks.routes && !!run.journey?.some((ch) => ch?.length);
}
