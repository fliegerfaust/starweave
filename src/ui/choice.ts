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
import { omenTooltip } from './hud';
import { attachTooltip, button, hideTooltip, withCoin, type ModalHandle } from './widgets';
import { sellPrice } from '@/core/shop';

/** Что делать с вариантом: решает экран, на котором выбор открыт (ритуалу нужны цели). */
export interface ChoiceHandlers {
  /** `replace` — uid своего Знамения, которое отдаётся за выбранное при полном ряде (OB). */
  take(index: number, option: string, close: () => void, replace?: number): void;
  skip(): void;
}

/** Строка варианта: значок, имя, уровень (у карт созвездий) и бонус. */
interface OptionView {
  icon: HTMLCanvasElement;
  name: string;
  level: string | null;
  bonus: string;
}

/** Выборы строками — пакет; дар ночи, Комета и Телескоп — свои сцены. */
type RowChoice = Extract<Choice, { kind: 'pack' }>;

/** Как показать вариант выбора каждого вида: новый вид без вида — ошибка типов. */
const OPTION_VIEWS: { [K in RowChoice['kind']]: (run: RunState, choice: Extract<RowChoice, { kind: K }>, id: string) => OptionView } = {
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
function ribbon(choice: RowChoice): [string, string] {
  switch (choice.kind) {
    case 'pack':
      return [t('shop.packTitle'), `${named('pack', choice.pack).name} · ${t('shop.oneOfThree')}`];
  }
}

/**
 * Сцена «Выбери одно» (TD.7): текущий выбор из очереди `run.pending` — варианты строками,
 * взять один или пропустить. Одна сцена для пакета, а в 0.7 — для трофея, Кометы и
 * пророчества; дар ночи — веером в `ui/gift.ts`. `null` — выбирать нечего.
 */
export function showChoice(app: App, run: RunState, handlers: ChoiceHandlers): ModalHandle | null {
  const choice = currentChoice(run);
  if (!choice || choice.kind !== 'pack') return null;
  app.svc.audio.ignite(1);
  let handle: ModalHandle | null = null;
  // Ряд Знамений полон: вариант берётся заменой своего (OB) — касанием своего Знамения в ряду внизу
  const full = !canTakeChoice(run) && choice.pack === 'omen';
  const view = OPTION_VIEWS[choice.kind] as (run: RunState, choice: RowChoice, id: string) => OptionView;
  let picked: number | null = null;
  const strip = full ? h('div.give-strip') : null;
  const close = () => handle?.close();
  const paintStrip = () => {
    if (!strip) return;
    hideTooltip();
    rows.forEach((r, i) => r.classList.toggle('giving', i === picked));
    strip.classList.toggle('on', picked !== null);
    // Обе подсказки в одной ячейке, видна одна: высота строки не меняется при выборе (ничего не скачет)
    strip.replaceChildren(
      h('div.give-hints', null, [
        h(`p.hint${picked === null ? '' : '.off'}`, null, t('shop.replacePick')),
        h(`p.hint.on${picked === null ? '.off' : ''}`, null, t('shop.replaceHint', { name: named('omen', choice.options[picked ?? 0]!).name })),
      ]),
      h('div.owned-omens', null, run.omens.map((o) => {
        const give = () => {
          hideTooltip();
          if (picked !== null) handlers.take(picked, choice.options[picked]!, close, o.uid);
        };
        // Своё Знамение можно рассмотреть до замены (FB.5): мышью — наведением, пальцем — касанием.
        // Мышью нажатие отдаёт сразу, на телефоне отдаёт кнопка в табличке: первое касание — посмотреть
        const slot = h('button.omen-slot', {
          type: 'button',
          ariaLabel: named('omen', o.id).name,
          onclick: () => {
            if (picked !== null && matchMedia('(hover: hover) and (pointer: fine)').matches) give();
          },
        }, canvasImg(omenSigil(o.id, 44, dpr()), 44));
        attachTooltip(slot, () => {
          const tip = omenTooltip(o);
          if (picked !== null) {
            // За что отдаёшь — уже сказано строкой над рядом; в кнопке только действие и выручка
            const label = h('span', null, [t('shop.give'), ' · ', withCoin(`+${sellPrice(o.id)}`)]);
            tip.append(button(label, give, { className: 'tip-give', variant: 'secondary' }));
          }
          return tip;
        });
        return h(`div.owned-omen${picked !== null ? '.give' : ''}`, null, [
          slot,
          picked !== null ? h('span.give-badge', null, withCoin(`+${sellPrice(o.id)}`)) : null,
        ]);
      })),
    );
  };
  const rows = choice.options.map((id, i) => {
    const v = view(run, choice, id);
    const take = () => {
      if (!full) return handlers.take(i, id, close);
      picked = picked === i ? null : i;
      paintStrip();
    };
    return h('article.ware', { style: { animationDelay: `${i * 0.08}s` } }, [
      h('div.ware-icon', null, v.icon),
      h('div.ware-name', null, [v.name, v.level ? h('span.ware-level', null, v.level) : null]),
      h('div.ware-bonus', null, bonusLine(v.bonus)),
      button(full ? t('shop.replace') : t('shop.take'), take, { className: `take${full ? ' replace' : ''}` }),
    ]);
  });
  paintStrip();
  const [title, sub] = ribbon(choice);
  handle = sceneWindow({
    className: 'pack-scene',
    label: title,
    mid: [sceneRibbon(title, sub), h('div.ware-list', null, rows)],
    // Свой ряд — в нижней панели сцены: виден всегда, даже на низком экране, где список прокручивается
    acts: [strip, h('div.scene-lights', null, lightButton('again', t('shop.skip'), () => {
      handle?.close();
      handlers.skip();
    }, true))],
  });
  return handle;
}
