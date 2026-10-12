import { COMBO_EXAMPLES, comboBase } from '@/core/content/combos';
import { COMBO_IDS, type ComboId } from '@/core/types';
import { dict, t } from '@/i18n';
import { h } from './dom';
import { cardThumb } from './screens/common';

export interface ComboListOptions {
  /** Уровни созвездий забега: показываются бейдж уровня и текущие свет × множитель. */
  levels?: Record<ComboId, number>;
  /** Узкий вариант для пузыря обучения: мельче карты, без описаний. */
  compact?: boolean;
}

let exampleId = -1000;

/**
 * Все созвездия от частых к редким: пример из четырёх карт, название, правило простыми
 * словами и сколько оно даёт. Одна таблица для обучения, справочника и магазина —
 * чтобы правила читались без знания покера.
 */
export function comboList(opts: ComboListOptions = {}): HTMLElement {
  const width = opts.compact ? 20 : 26;
  return h(
    `div.combo-list${opts.compact ? '.compact' : ''}`,
    null,
    COMBO_IDS.map((id) => {
      const level = opts.levels?.[id] ?? 1;
      const base = comboBase(id, level);
      const example = h(
        'div.combo-example',
        null,
        COMBO_EXAMPLES[id].map(([rank, suit]) => cardThumb({ id: exampleId--, rank, suit }, width)),
      );
      return h(`div.combo-item${level > 1 ? '.upgraded' : ''}`, null, [
        example,
        h('div.combo-text', null, [
          h('div.combo-name', null, [
            t(`combo.${id}`),
            level > 1 ? h('span.combo-level', null, t('combos.level', { n: level })) : null,
          ]),
          opts.compact ? null : h('div.combo-desc', null, dict().comboDesc[id]),
        ]),
        h('div.combo-base', null, [h('span.light-text', null, String(base.light)), h('span.combo-x', null, '×'), h('span.mult-text', null, String(base.mult))]),
      ]);
    }),
  );
}
