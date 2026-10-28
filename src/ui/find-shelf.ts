import { bossSigil, omenSigil } from '@/art/sigil';
import { BOSS_LIST } from '@/core/content/bosses';
import { MYTHS } from '@/core/content/myths';
import { OMEN_LIST } from '@/core/content/omens';
import { dict, format, getLang, t } from '@/i18n';
import { collectionTally, type Find } from '@/meta/collection';
import type { Profile } from '@/meta/profile';
import { canvasImg, dpr, h } from './dom';
import { icon } from './icons';
import { mythFigure } from './myth-figure';

const plural = (forms: Record<string, string>, n: number) => format(forms[new Intl.PluralRules(getLang()).select(n)] ?? forms.other!, { n });

/** Знак находки: медаль Знамения или Затмения, рисунок мифа золотом; неизвестное — силуэтом. */
export function findMark(f: Find, size: number, found = true): HTMLElement {
  if (f.kind === 'myth') return mythFigure(f.id, size, found);
  const el = canvasImg(f.kind === 'boss' ? bossSigil(f.id, size, dpr()) : omenSigil(f.id, size, dpr()), size);
  if (!found) el.classList.add('unknown');
  return el;
}

/**
 * Полка находок на главной (CL.1, вариант «Следующее открытие»): последние находки и
 * счёт Коллекции с тонкой шкалой, под ними — силуэт того, что откроется дальше, и сколько
 * до него осталось. Строка целиком — кнопка: Коллекция открывается на этом открытии.
 */
export function findShelf(p: Profile, open: (focus?: string) => void, cell = false): HTMLElement {
  const tally = collectionTally(p);
  const next = tally.next;
  const silhouette = !next ? null
    : next.kind === 'myth' ? findMark({ kind: 'myth', id: next.id }, 20, false)
    : next.id === 'myths' ? findMark({ kind: 'myth', id: MYTHS[0]!.id }, 20, false)
    : next.id === 'trophies' ? findMark({ kind: 'boss', id: BOSS_LIST[0]!.id }, 20, false)
    : findMark({ kind: 'legend', id: OMEN_LIST.find((o) => o.pair)!.id }, 20, false);
  const hint = next ? plural(dict().menu.shelfNext[next.kind === 'myth' ? 'myth' : next.id]!, next.left) : null;
  const count = cell ? t('hall.of', { n: tally.found, total: tally.total }) : t('menu.shelf', { n: tally.found, total: tally.total });
  const pct = tally.total ? Math.round((tally.found / tally.total) * 100) : 0;
  const marks = tally.recent.slice(0, 3).map((f, i) => h(`span.shelf-mark${i === 0 ? '.fresh' : ''}`, null, findMark(f, 26)));
  // Половина полки рядом с Залом славы (HF.6, вариант «Две полки»): подпись сверху, без подсказки
  const b = h(`button.menu-shelf${cell ? '.shelf-cell' : ''}`, { type: 'button', attrs: { 'aria-label': [t('menu.collectionOpen', { n: tally.found, total: tally.total }), hint].filter(Boolean).join('. ') } }, [
    h('span.shelf-top', null, [
      marks.length ? h('span.shelf-marks', { attrs: { 'aria-hidden': 'true' } }, marks) : null,
      h('span.shelf-text', null, [count, icon('chevron')]),
    ]),
    h('span.shelf-bar', { style: `--p: ${pct}%`, attrs: { 'aria-hidden': 'true' } }),
    hint ? h('span.shelf-next', null, [silhouette ? h('span.shelf-ghost', { attrs: { 'aria-hidden': 'true' } }, silhouette) : null, hint]) : null,
  ]);
  if (cell) {
    b.prepend(h('span.shelf-label', null, t('menu.collection')));
    b.querySelector('.shelf-next')?.remove();
  }
  // Закрытая ступень в Коллекции ещё не видна — тогда Коллекция открывается с начала
  const focus = next?.kind === 'myth' ? `myth-${next.id}` : undefined;
  b.addEventListener('click', () => open(focus));
  return b;
}
