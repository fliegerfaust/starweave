import { RuleError } from './errors';
import { skipGift, takeGift, type GiftOffer } from './gift';
import { walk } from './route';
import { takeComet, takeScope, type CometTrade, type ScopeUpgrade } from './wonders';
import { createOmen } from './omen-instance';
import { applyRitual, omenSlots } from './shop';
import type { ComboId, PackKind, RunState } from './types';

/**
 * Выбор «возьми одно из нескольких» в очереди `run.pending` (TD.7): пакет Обсерватории и
 * дар ночи (GF.1), Комета и Телескоп (RT.4). 0.7 «Глубина» добавит трофей Затмения и
 * пророчество — новым вариантом здесь и строкой в `CHOICE_KINDS`.
 */
export type Choice =
  | { kind: 'pack'; pack: PackKind; options: string[] }
  | { kind: 'gift'; options: GiftOffer[] }
  /** Комета на пути главы (RT.4): обмен 1 из 3 или мимо. */
  | { kind: 'comet'; options: CometTrade[] }
  /** Телескоп на пути главы (RT.4): улучшение 1 из 3 или мимо. */
  | { kind: 'telescope'; options: ScopeUpgrade[] };

/** Как взять вариант выбора каждого вида. `targets` — карты колоды для ритуала. */
interface ChoiceKindDef<C extends Choice> {
  /** Можно ли взять хоть что-то (Знамений некуда ставить — нельзя). */
  canTake(run: RunState, choice: C): boolean;
  take(run: RunState, choice: C, index: number, targets: number[]): void;
  /** Что даёт отказ: у дара — золото «чистого неба». */
  skip?(run: RunState, choice: C): void;
  /** После выбора или отказа: Комета и Телескоп — шаг пути пройден. */
  done?(run: RunState): void;
}

/** `Record` по видам: новый вид выбора без правил взятия — ошибка типов. */
const CHOICE_KINDS: { [K in Choice['kind']]: ChoiceKindDef<Extract<Choice, { kind: K }>> } = {
  pack: {
    canTake: (run, choice) => choice.pack !== 'omen' || run.omens.length < omenSlots(run),
    take(run, choice, index, targets) {
      const option = choice.options[index]!;
      if (choice.pack === 'omen') run.omens.push(createOmen(run, option));
      else if (choice.pack === 'chart') run.comboLevels[option as ComboId] += 1;
      // Ритуал из пакета бесплатен, но требует целей
      else applyRitual(run, option, targets);
    },
  },
  gift: {
    canTake: () => true,
    take: (run, choice, index) => takeGift(run, choice.options[index]!),
    skip: (run) => skipGift(run),
  },
  comet: {
    canTake: () => true,
    take: (run, choice, index) => takeComet(run, choice.options[index]!),
    done: walk,
  },
  telescope: {
    canTake: () => true,
    take: (run, choice, index) => takeScope(run, choice.options[index]!),
    done: walk,
  },
};

type AnyKind = ChoiceKindDef<Choice>;
const kindOf = (choice: Choice) => CHOICE_KINDS[choice.kind] as AnyKind;

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
  return !!choice && kindOf(choice).canTake(run, choice);
}

/** Взять вариант `index` текущего выбора. */
export function choose(run: RunState, index: number, targets: number[] = []): void {
  const choice = currentChoice(run);
  if (!choice || !Number.isInteger(index) || index < 0 || index >= choice.options.length) throw new RuleError('nothing');
  const def = kindOf(choice);
  if (!def.canTake(run, choice)) throw new RuleError('noSlots');
  def.take(run, choice, index, targets);
  run.pending.shift();
  def.done?.(run);
}

/** Отказаться от текущего выбора. */
export function skipChoice(run: RunState): void {
  const choice = currentChoice(run);
  if (!choice) throw new RuleError('nothing');
  const def = kindOf(choice);
  def.skip?.(run, choice);
  run.pending.shift();
  def.done?.(run);
}
