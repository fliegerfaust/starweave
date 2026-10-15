import { num, t } from '@/i18n';
import type { RunState } from '@/core/types';
import { h, type Child } from './dom';
import { icon, type IconName } from './icons';
import { modal, type ModalHandle } from './widgets';

/**
 * «Сцена» (RD.3): итоги ночи — награда, поражение, победа — идут прямо по небу во весь
 * экран. Название — лентой поперёк неба, как созвездие в ночи; середина прокручивается,
 * кнопки всегда видны внизу (в невысоком ландшафте — колонкой справа).
 */
export interface SceneWindow extends ModalHandle {
  /** Блок кнопок: на него показывает обучение. */
  acts: HTMLElement;
}

export function sceneWindow(opts: { className: string; label: string; mid: Child[]; acts: Child[] }): SceneWindow {
  const acts = h('div.scene-acts', null, opts.acts);
  const m = modal(h('div.scene-inner', null, [h('div.scene-mid', null, opts.mid), acts]), {
    scene: true,
    dismissable: false,
    className: opts.className,
  });
  m.el.setAttribute('aria-label', opts.label);
  return { ...m, acts };
}

/** Лента с названием: как подпись созвездия в ночи. `dim` — погасшее небо. */
export function sceneRibbon(title: string, sub: string, dim = false): HTMLElement {
  return h(`div.scene-ribbon${dim ? '.dim' : ''}`, null, [h('b', null, title), h('small', null, sub)]);
}

/** Шкала «очки из цели» и сколько не хватило. */
export function sceneTally(score: number, target: number): HTMLElement {
  const short = Math.max(0, target - score);
  const bar = h('div.scene-bar', null, h('i', { style: { width: `${Math.min(100, (score / Math.max(1, target)) * 100)}%` } }));
  return h(`div.scene-tally${short ? '.short' : ''}`, null, [
    h('div.scene-nums', null, [h('b', null, num(score)), h('span', null, t('over.of', { target: num(target) }))]),
    bar,
    short ? h('div.scene-short', null, t('over.short', { n: num(short) })) : null,
  ]);
}

/** Лёгкая кнопка: значок и слово, без плашки; соседние — через волосяную линию. */
export function lightButton(name: IconName, label: string, onClick: () => void, quiet = false): HTMLButtonElement {
  return h(`button.scene-light${quiet ? '.quiet' : ''}`, { type: 'button', onclick: onClick }, [icon(name), label]);
}

/** Восемь глав цепочкой созвездия — загораются по очереди (авторский момент победы). */
export function chapterChain(): SVGSVGElement {
  const pts = [[14, 56], [58, 34], [100, 50], [142, 22], [186, 40], [228, 16], [272, 36], [318, 12]] as const;
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'scene-chain');
  svg.setAttribute('viewBox', '0 0 332 74');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML =
    pts.slice(1).map((p, i) => `<line style="animation-delay:${0.3 + i * 0.16}s" x1="${pts[i]![0]}" y1="${pts[i]![1]}" x2="${p[0]}" y2="${p[1]}"/>`).join('') +
    pts.map(([x, y], i) => `<g style="animation-delay:${0.2 + i * 0.16}s"><circle class="halo" cx="${x}" cy="${y}" r="7"/><circle cx="${x}" cy="${y}" r="2.6"/><text x="${x}" y="${y + 20}">${roman[i]}</text></g>`).join('');
  return svg;
}

/** Итоги забега гравированной табличкой. */
export function statsTable(run: RunState): HTMLElement {
  const s = run.stats;
  const item = (label: string, value: string) => h('div.stat-item', null, [h('div.stat-item-value', null, value), h('div.stat-item-label', null, label)]);
  return h('div.stats-grid', null, [
    item(t('over.nights'), String(s.nightsWon)),
    item(t('over.lines'), num(s.linesIgnited)),
    item(t('over.crosses'), num(s.crosses)),
    item(t('over.best'), num(s.bestPlacement)),
    item(t('over.bestCombo'), t(`combo.${s.bestCombo}`)),
    item(t('over.goldEarned'), num(s.goldEarned)),
  ]);
}
