import { bossDef } from './content/bosses';
import { omenDef } from './content/omens';
import type { EffectHooks } from './effects';
import type { EffectSource, NightState, RunState } from './types';

/** Активный эффект: хуки + состояние + как подписывать его шаги. */
export interface ActiveEffect {
  hooks: EffectHooks;
  data: Record<string, number>;
  source: EffectSource;
}

/**
 * Источник эффектов забега (TD.5): откуда берутся хуки для подсчёта и событий ночи.
 * `night` — null вне ночи (итоги ночи): эффекты ночи, как Затмение, тогда не действуют.
 */
export interface EffectSourceDef {
  id: string;
  collect(run: RunState, night: NightState | null): ActiveEffect[];
}

/**
 * Источники по порядку срабатывания — порядок важен для ×множителей: Знамения по слотам,
 * затем Затмение. Трофеи Затмений, покровитель и пророчества 0.8 встают сюда же.
 */
export const EFFECT_SOURCES: EffectSourceDef[] = [
  {
    id: 'omens',
    collect: (run) => run.omens.map((o) => ({ hooks: omenDef(o.id), data: o.data, source: { kind: 'omen', uid: o.uid, omenId: o.id } })),
  },
  {
    id: 'eclipse',
    collect: (_run, night) => (night?.bossId ? [{ hooks: bossDef(night.bossId), data: {}, source: { kind: 'boss', bossId: night.bossId } }] : []),
  },
];

/** Все эффекты, действующие сейчас, в порядке срабатывания. */
export function activeEffects(run: RunState, night: NightState | null): ActiveEffect[] {
  return EFFECT_SOURCES.flatMap((s) => s.collect(run, night));
}
