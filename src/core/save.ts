import { SAVE_VERSION } from './run';
import type { RunState } from './types';

export function serializeRun(run: RunState): string {
  return JSON.stringify(run);
}

/** Возвращает null, если сохранение битое или от несовместимой версии. */
export function deserializeRun(text: string | null): RunState | null {
  if (!text) return null;
  try {
    const run = JSON.parse(text) as RunState;
    if (run?.version !== SAVE_VERSION || !Array.isArray(run.deck)) return null;
    return run;
  } catch {
    return null;
  }
}
