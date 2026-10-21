import { omenDef } from './content/omens';
import type { OmenInstance, RunState } from './types';

export function createOmen(run: RunState, id: string): OmenInstance {
  const def = omenDef(id);
  return { uid: run.nextOmenUid++, id, data: def.initialData?.() ?? {} };
}
