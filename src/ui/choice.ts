import { chartIcon, omenSigil, ritualIcon } from '@/art/sigil';
import { canTakeChoice, currentChoice, type Choice } from '@/core/choices';
import { COMBOS } from '@/core/content/combos';
import { omenDef } from '@/core/content/omens';
import type { ComboId, RunState } from '@/core/types';
import type { App } from '@/game/app';
import { named, t } from '@/i18n';
import { bonusLine } from './bonus';
import { canvasImg, dpr, h } from './dom';
import { lightButton, sceneRibbon, sceneWindow } from './scene-window';
import { button, type ModalHandle } from './widgets';

/** Что делать с вариантом: решает экран, на котором выбор открыт (ритуалу нужны цели). */
export interface ChoiceHandlers {
  take(index: number, option: string, close: () => void): void;
  skip(): void;
}

/** Строка варианта: значок, имя, уровень (у карт созвездий) и бонус. */
interface OptionView {
  icon: HTMLCanvasElement;
  name: string;
  level: string | null;
  bonus: string;
}

/** Как показать вариант выбора каждого вида: новый вид без вида — ошибка типов. */
const OPTION_VIEWS: { [K in Choice['kind']]: (run: RunState, choice: Extract<Choice, { kind: K }>, id: string) => OptionView } = {
  pack(run, choice, id) {
    if (choice.pack === 'omen') {
      const def = omenDef(id);
      const { name, desc } = named('omen', id, def.vars?.(def.initialData?.() ?? {}) ?? {});
      return { icon: canvasImg(omenSigil(id, 48, dpr()), 48), name, level: null, bonus: desc };
    }
    if (choice.pack === 'chart') {
      const combo = id as ComboId;
      const lv = run.comboLevels[combo];
      const def = COMBOS[combo];
      return {
        icon: canvasImg(chartIcon(combo, 48, dpr()), 48),
        name: t(`combo.${combo}`),
        level: t('shop.chartLevel', { from: lv, to: lv + 1 }),
        bonus: t('shop.chartBonus', { combo: t(`combo.${combo}`), light: def.levelLight, mult: def.levelMult }),
      };
    }
    const { name, desc } = named('ritual', id);
    return { icon: canvasImg(ritualIcon(id, 48, dpr()), 48), name, level: null, bonus: desc };
  },
};

/** Заголовок сцены: что за выбор и «одно из N». */
function ribbon(choice: Choice): [string, string] {
  switch (choice.kind) {
    case 'pack':
      return [t('shop.packTitle'), `${named('pack', choice.pack).name} · ${t('shop.oneOfThree')}`];
  }
}

/**
 * Сцена «Выбери одно» (TD.7): текущий выбор из очереди `run.pending` — варианты строками,
 * взять один или пропустить. Одна сцена для пакета, а в 0.7 — для дара ночи, трофея,
 * Кометы и пророчества. `null` — выбирать нечего.
 */
export function showChoice(app: App, run: RunState, handlers: ChoiceHandlers): ModalHandle | null {
  const choice = currentChoice(run);
  if (!choice) return null;
  app.svc.audio.ignite(1);
  let handle: ModalHandle | null = null;
  const blocked = !canTakeChoice(run);
  const view = OPTION_VIEWS[choice.kind] as (run: RunState, choice: Choice, id: string) => OptionView;
  const rows = choice.options.map((id, i) => {
    const v = view(run, choice, id);
    return h('article.ware', { style: { animationDelay: `${i * 0.08}s` } }, [
      h('div.ware-icon', null, v.icon),
      h('div.ware-name', null, [v.name, v.level ? h('span.ware-level', null, v.level) : null]),
      h('div.ware-bonus', null, bonusLine(v.bonus)),
      button(blocked ? t('shop.noSlotsShort') : t('shop.take'), () => handlers.take(i, id, () => handle?.close()), {
        disabled: blocked,
        title: blocked ? t('shop.slotsFull') : '',
        className: 'take',
      }),
    ]);
  });
  const [title, sub] = ribbon(choice);
  handle = sceneWindow({
    className: 'pack-scene',
    label: title,
    mid: [sceneRibbon(title, sub), h('div.ware-list', null, rows)],
    acts: [h('div.scene-lights', null, lightButton('again', t('shop.skip'), () => {
      handle?.close();
      handlers.skip();
    }, true))],
  });
  return handle;
}
