import { COMBO_EXAMPLES, comboBase } from '@/core/content/combos';
import { COMBO_IDS, type ComboId } from '@/core/types';
import { dict, t } from '@/i18n';
import { h } from './dom';
import { cardThumb } from './screens/common';

export interface ComboListOptions {
  /** Уровни созвездий забега: показываются бейдж уровня и текущие свет × множитель. */
  levels?: Record<ComboId, number>;
  /** Коллекция игрока: собранные отмечены, остальные — «ещё не собрано». */
  found?: readonly ComboId[];
}

let exampleId = -1000;

/**
 * Все созвездия от частых к редким: пример из четырёх карт, название, правило простыми
 * словами и сколько оно даёт. Одна таблица для обучения, справочника и магазина —
 * чтобы правила читались без знания покера.
 */
export function comboList(opts: ComboListOptions = {}): HTMLElement {
  const width = 26;
  return h(
    'div.combo-list',
    null,
    COMBO_IDS.map((id) => {
      const level = opts.levels?.[id] ?? 1;
      const base = comboBase(id, level);
      const example = h(
        'div.combo-example',
        null,
        COMBO_EXAMPLES[id].map(([rank, suit]) => cardThumb({ id: exampleId--, rank, suit }, width)),
      );
      // Россыпь не собирают — у неё нет отметки
      const missing = !!opts.found && id !== 'scatter' && !opts.found.includes(id);
      const got = !!opts.found && id !== 'scatter' && !missing;
      return h(`div.combo-item${level > 1 ? '.upgraded' : ''}${missing ? '.missing' : ''}`, null, [
        example,
        h('div.combo-text', null, [
          h('div.combo-name', null, [
            t(`combo.${id}`),
            level > 1 ? h('span.combo-level', null, t('combos.level', { n: level })) : null,
            got ? h('span.combo-got', null, '✓') : null,
          ]),
          h('div.combo-desc', null, dict().comboDesc[id]),
          missing ? h('div.combo-missing', null, t('discovery.notYet')) : null,
        ]),
        h('div.combo-base', null, [h('span.light-text', null, String(base.light)), h('span.combo-x', null, '×'), h('span.mult-text', null, String(base.mult))]),
      ]);
    }),
  );
}
