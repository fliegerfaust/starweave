import { BASE_RULES } from './content/balance';
import { bossDef } from './content/bosses';
import { omenDef } from './content/omens';
import { skyDef } from './content/skies';
import type { Rules, RunState } from './types';

/** Правила: база → колода неба → Затмение → Знамения. Затем ограничения снизу. */
export function buildRules(run: RunState, bossId: string | null): Rules {
  const rules: Rules = { ...BASE_RULES };
  skyDef(run.skyId).modifyRules?.(rules);
  if (bossId) bossDef(bossId).modifyRules?.(rules, {});
  for (const omen of run.omens) omenDef(omen.id).modifyRules?.(rules, omen.data);
  rules.handSize = Math.max(1, rules.handSize);
  rules.moves = Math.max(1, rules.moves);
  rules.burns = Math.max(0, rules.burns);
  return rules;
}
