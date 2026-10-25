import { bossDef } from './content/bosses';
import { omenDef } from './content/omens';
import { trophyDef } from './content/trophies';
import { trophiesOf } from './trophy';
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
 * трофеи, затем Затмение. Покровитель и пророчества 0.7 встают сюда же.
 */
export const EFFECT_SOURCES: EffectSourceDef[] = [
  {
    id: 'omens',
    collect: (run) => run.omens.map((o) => ({ hooks: omenDef(o.id), data: o.data, source: { kind: 'omen', uid: o.uid, omenId: o.id } })),
  },
  {
    // Состояние трофея — на ночь, как у Затмения: счётчики заводятся в `onNightStart`
    id: 'trophies',
    collect: (run, night) => trophiesOf(run).map((id) => ({ hooks: trophyDef(id), data: trophyData(night, id), source: { kind: 'trophy', trophyId: id } })),
  },
  {
    id: 'eclipse',
    collect: (_run, night) => (night?.bossId ? [{ hooks: bossDef(night.bossId), data: {}, source: { kind: 'boss', bossId: night.bossId } }] : []),
  },
];

/** Счётчики трофея на эту ночь: живут в `night.trophyData`, вне ночи — пустые. */
function trophyData(night: NightState | null, id: string): Record<string, number> {
  if (!night) return {};
  night.trophyData ??= {};
  return (night.trophyData[id] ??= {});
}

/** Все эффекты, действующие сейчас, в порядке срабатывания. */
export function activeEffects(run: RunState, night: NightState | null): ActiveEffect[] {
  return EFFECT_SOURCES.flatMap((s) => s.collect(run, night));
}
