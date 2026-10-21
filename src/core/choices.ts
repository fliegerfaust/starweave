import { RuleError } from './errors';
import { createOmen } from './omen-instance';
import { applyRitual, omenSlots } from './shop';
import type { ComboId, PackKind, RunState } from './types';

/**
 * Выбор «возьми одно из нескольких» в очереди `run.pending` (TD.7). Сейчас это пакет
 * Обсерватории; 0.9 «Глубина» добавит дар ночи, трофей Затмения, Знамение Яркой ночи, Комету и
 * пророчество — новым вариантом здесь и строкой в `CHOICE_KINDS`.
 */
export type Choice = { kind: 'pack'; pack: PackKind; options: string[] };

/** Как взять вариант выбора каждого вида. `targets` — карты колоды для ритуала. */
interface ChoiceKindDef<C extends Choice> {
  /** Можно ли взять хоть что-то (Знамений некуда ставить — нельзя). */
  canTake(run: RunState, choice: C): boolean;
  take(run: RunState, choice: C, option: string, targets: number[]): void;
}

/** `Record` по видам: новый вид выбора без правил взятия — ошибка типов. */
const CHOICE_KINDS: { [K in Choice['kind']]: ChoiceKindDef<Extract<Choice, { kind: K }>> } = {
  pack: {
    canTake: (run, choice) => choice.pack !== 'omen' || run.omens.length < omenSlots(run),
    take(run, choice, option, targets) {
      if (choice.pack === 'omen') run.omens.push(createOmen(run, option));
      else if (choice.pack === 'chart') run.comboLevels[option as ComboId] += 1;
      // Ритуал из пакета бесплатен, но требует целей
      else applyRitual(run, option, targets);
    },
  },
};

/** Поставить выбор в очередь: игрок увидит его, когда дойдёт черёд. */
export function offer(run: RunState, choice: Choice): void {
  run.pending.push(choice);
}

/** Выбор, который игрок видит сейчас, или null. */
export function currentChoice(run: RunState): Choice | null {
  return run.pending[0] ?? null;
}

/** Можно ли взять вариант текущего выбора. */
export function canTakeChoice(run: RunState): boolean {
  const choice = currentChoice(run);
  return !!choice && CHOICE_KINDS[choice.kind].canTake(run, choice);
}

/** Взять вариант `index` текущего выбора. */
export function choose(run: RunState, index: number, targets: number[] = []): void {
  const choice = currentChoice(run);
  const option = choice?.options[index];
  if (!choice || option === undefined) throw new RuleError('nothing');
  if (!CHOICE_KINDS[choice.kind].canTake(run, choice)) throw new RuleError('noSlots');
  CHOICE_KINDS[choice.kind].take(run, choice, option, targets);
  run.pending.shift();
}

/** Отказаться от текущего выбора. */
export function skipChoice(run: RunState): void {
  if (!currentChoice(run)) throw new RuleError('nothing');
  run.pending.shift();
}
