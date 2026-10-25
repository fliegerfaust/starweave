import { BASE_RULES } from './content/balance';
import { bossDef } from './content/bosses';
import { omenDef } from './content/omens';
import { skyDef } from './content/skies';
import { stakeEffects } from './content/stakes';
import { trophyDef } from './content/trophies';
import { trophiesOf } from './trophy';
import type { Rules, RunState } from './types';

/** Правила: база → колода неба → Знамения → трофеи → Затмение. Затем ограничения снизу. */
export function buildRules(run: RunState, bossId: string | null): Rules {
  const rules: Rules = { ...BASE_RULES };
  skyDef(run.skyId).modifyRules?.(rules);
  const stake = stakeEffects(run.stake ?? 0);
  rules.moves += stake.moves;
  rules.burns += stake.burns;
  for (const omen of run.omens) omenDef(omen.id).modifyRules?.(rules, omen.data);
  for (const id of trophiesOf(run)) trophyDef(id).modifyRules?.(rules, {});
  // Затмение — последним: его запреты (нет сжиганий, только столбцы) Знамения не отменяют
  if (bossId) bossDef(bossId).modifyRules?.(rules, {});
  rules.handSize = Math.max(1, rules.handSize);
  rules.moves = Math.max(1, rules.moves);
  rules.burns = Math.max(0, rules.burns);
  return rules;
}
