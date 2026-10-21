import { assertNever } from './errors';
import { burnCard, placeCard, startNight } from './night';
import { collectReward, continueEndless, doubleReward, leaveShop, newRun, reviveNight, type NewRunOptions } from './run';
import { choose, skipChoice } from './choices';
import { banishCard, buyItem, buyOmen, buyPack, moveOmen, reroll, sellOmen } from './shop';
import type { GameEvent, RunState } from './types';

/**
 * Действие игрока над забегом (TD.9). Всё, что меняет `RunState` по воле игрока, — команда:
 * так забег можно записать, переиграть на сервере (рейтинги 0.8) и отладить по журналу.
 * Ключи короткие: журнал лежит в сохранении и уходит в облако.
 */
export type Command =
  | { c: 'startNight' }
  | { c: 'place'; hand: number; cell: number }
  | { c: 'burn'; hand: number }
  | { c: 'collectReward' }
  /** Удвоить награду — за рекламу; в журнале, потому что меняет золото. */
  | { c: 'doubleReward' }
  /** Второй шанс — за рекламу или с атласом. */
  | { c: 'revive' }
  | { c: 'leaveShop' }
  | { c: 'continueEndless' }
  | { c: 'buyOmen'; slot: number }
  | { c: 'sellOmen'; uid: number }
  | { c: 'moveOmen'; from: number; to: number }
  | { c: 'buyItem'; slot: number; targets?: number[] }
  | { c: 'buyPack'; slot: number }
  /** Взять вариант текущего выбора из очереди (пакет, позже дар, трофей, Комета). */
  | { c: 'choose'; index: number; targets?: number[] }
  | { c: 'skip' }
  | { c: 'banish'; card: number }
  | { c: 'reroll' };

/**
 * Версия правил, под которую записан журнал. Поднимать, когда меняется исход тех же
 * команд (баланс, порядок бросков ГПСЧ): старые журналы тогда не переигрываются как есть.
 */
export const RULES_VERSION = 1;

/** Запись забега: с чего начали и что делал игрок. `replay` восстанавливает забег из неё. */
export interface RunLog {
  version: number;
  start: NewRunOptions;
  cmds: Command[];
}

/** Новый забег с журналом команд. */
export function newLoggedRun(start: NewRunOptions): RunState {
  const run = newRun(start);
  run.log = { version: RULES_VERSION, start: structuredClone(start), cmds: [] };
  return run;
}

/**
 * Выполняет команду. Ошибка правил (`RuleError`) пробрасывается, и тогда в журнал ничего
 * не пишется: журнал — только то, что действительно произошло.
 */
export function apply(run: RunState, cmd: Command): GameEvent[] {
  const events = execute(run, cmd);
  // Копия: UI может переиспользовать массив целей после вызова
  run.log?.cmds.push(structuredClone(cmd));
  return events;
}

function execute(run: RunState, cmd: Command): GameEvent[] {
  switch (cmd.c) {
    case 'startNight':
      return startNight(run);
    case 'place':
      return placeCard(run, cmd.hand, cmd.cell);
    case 'burn':
      return burnCard(run, cmd.hand);
    case 'collectReward':
      collectReward(run);
      return [];
    case 'doubleReward':
      doubleReward(run);
      return [];
    case 'revive':
      reviveNight(run);
      return [];
    case 'leaveShop':
      leaveShop(run);
      return [];
    case 'continueEndless':
      continueEndless(run);
      return [];
    case 'buyOmen':
      buyOmen(run, cmd.slot);
      return [];
    case 'sellOmen':
      sellOmen(run, cmd.uid);
      return [];
    case 'moveOmen':
      moveOmen(run, cmd.from, cmd.to);
      return [];
    case 'buyItem':
      buyItem(run, cmd.slot, cmd.targets);
      return [];
    case 'buyPack':
      buyPack(run, cmd.slot);
      return [];
    case 'choose':
      choose(run, cmd.index, cmd.targets);
      return [];
    case 'skip':
      skipChoice(run);
      return [];
    case 'banish':
      banishCard(run, cmd.card);
      return [];
    case 'reroll':
      reroll(run);
      return [];
    default:
      return assertNever(cmd, 'command');
  }
}

/** Переигрывает журнал с начала. Чужая версия правил — `null`: исход был бы другим. */
export function replay(log: RunLog): RunState | null {
  if (log.version !== RULES_VERSION) return null;
  const run = newLoggedRun(log.start);
  for (const cmd of log.cmds) apply(run, cmd);
  return run;
}
