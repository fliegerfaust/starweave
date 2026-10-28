import { omenSigil } from '@/art/sigil';
import { omenDef } from '@/core/content/omens';
import { sellPrice } from '@/core/shop';
import type { OmenInstance, RunState } from '@/core/types';
import { named, t } from '@/i18n';
import { bonusLine } from './bonus';
import { canvasImg, dpr, h } from './dom';
import { button, modal, withCoin, type ModalHandle } from './widgets';

/**
 * Замена Знамения при полном ряде (OB, отзыв Андрея 28.10): своё продаётся, новое встаёт на его
 * место. Витрина OB.0 сравнивает два способа выбрать, что отдать:
 *  - `sheet` (А) — лист «Что отдать?» со своими Знамениями, ценой продажи и итогом золота;
 *  - `row` (Б) — свой ряд внизу экрана становится целью: над медалями цена продажи.
 */
export type ReplaceStyle = 'sheet' | 'row';

export function replaceStyle(): ReplaceStyle {
  return import.meta.env.DEV && new URLSearchParams(location.search).get('replace') === 'row' ? 'row' : 'sheet';
}

/** Сколько золота станет после замены: `null` — без цены (пакет), меньше нуля — не хватает. */
export function goldAfter(run: RunState, o: OmenInstance, price: number | null): number | null {
  return price === null ? null : run.gold + sellPrice(o.id) - price;
}

/** Лучшая цена продажи в ряду: хватит ли золота хоть на одну замену. */
export function canReplaceFor(run: RunState, price: number): boolean {
  return run.omens.some((o) => (goldAfter(run, o, price) ?? 0) >= 0);
}

/** Итог строки: «+3 ●» за продажу и под ним «останется 5 ●» или «не хватит 2 ●». */
export function giveNote(run: RunState, o: OmenInstance, price: number | null): HTMLElement {
  const left = goldAfter(run, o, price);
  return h(`span.give-note${left !== null && left < 0 ? '.short' : ''}`, null, [
    h('span.give-gain', { title: t('shop.replaceGain', { n: sellPrice(o.id) }) }, withCoin(`+${sellPrice(o.id)}`)),
    left === null ? null : h('span.give-left', null, withCoin(t(left < 0 ? 'shop.replaceShort' : 'shop.replaceLeft', { n: Math.abs(left) }))),
  ]);
}

/**
 * Вариант А: лист «Что отдать?». Строка — своё Знамение: медаль, имя, бонус, цена продажи и итог.
 * Касание строки — замена сразу (лист и есть подтверждение). `price` — `null` у пакета Знамений.
 */
export function giveSheet(run: RunState, opts: { newId: string; price: number | null; onPick(uid: number): void }): ModalHandle {
  let m: ModalHandle | null = null;
  const rows = run.omens.map((o, i) => {
    const def = omenDef(o.id);
    const { name, desc } = named('omen', o.id, def.vars?.(o.data ?? {}) ?? {});
    const left = goldAfter(run, o, opts.price);
    const short = left !== null && left < 0;
    return h(`button.give-row${short ? '.short' : ''}`, {
      type: 'button',
      disabled: short,
      style: { animationDelay: `${i * 0.04}s` },
      onclick: () => {
        m?.close();
        opts.onPick(o.uid);
      },
    }, [
      h('span.give-icon', null, canvasImg(omenSigil(o.id, 40, dpr()), 40)),
      h('span.give-name', null, name),
      h('span.give-bonus', null, bonusLine(desc)),
      giveNote(run, o, opts.price),
    ]);
  });
  const sub = opts.price === null
    ? t('shop.replaceFor', { name: named('omen', opts.newId).name })
    : [t('shop.replaceFor', { name: named('omen', opts.newId).name }), ' · ', withCoin(String(opts.price))];
  m = modal(
    [
      h('p.give-sub', null, sub),
      h('div.give-list', null, rows),
      h('div.give-acts', null, button(t('shop.replaceKeep'), () => m?.close(), { variant: 'secondary' })),
    ],
    { title: t('shop.replaceTitle'), sheet: true, className: 'give-sheet' },
  );
  return m;
}
