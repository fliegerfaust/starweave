import { describe, expect, it } from 'vitest';
import { OMEN_LIST } from '../src/core/content/omens';
import { newRun } from '../src/core/run';
import { deserializeRun, serializeRun } from '../src/core/save';
import { findKeys, findsSince } from '../src/meta/collection';
import { emptyProfile } from '../src/meta/profile';
import { recordEvent } from '../src/meta/progress';

const regular = OMEN_LIST.filter((o) => !o.pair).map((o) => o.id);
const legend = OMEN_LIST.find((o) => o.pair)!.id;

describe('Находки забега в итогах (CL.3)', () => {
  it('старт забега запоминает находки, итоги видят только новые — мифы первыми', () => {
    const p = emptyProfile();
    p.seenOmens.push(regular[0]!);
    p.mythsFound = ['cygnus'];
    const run = newRun({ seed: 1, skyId: 'classic' });
    recordEvent(p, run, { e: 'runStart' });
    expect(run.foundBefore).toEqual(findKeys(p));
    expect(findsSince(p, run.foundBefore!)).toEqual([]);
    p.seenOmens.push(regular[1]!, legend);
    p.seenBosses.push('fog');
    p.mythsFound.push('lyra');
    expect(findsSince(p, run.foundBefore!)).toEqual([
      { kind: 'myth', id: 'lyra' },
      { kind: 'legend', id: legend },
      { kind: 'boss', id: 'fog' },
      { kind: 'omen', id: regular[1] },
    ]);
  });

  it('снимок переживает сохранение, битый — отбрасывается без потери забега', () => {
    const run = newRun({ seed: 1, skyId: 'classic' });
    run.foundBefore = ['omen-x'];
    expect(deserializeRun(serializeRun(run))!.foundBefore).toEqual(['omen-x']);
    const broken = JSON.parse(serializeRun(run)) as Record<string, unknown>;
    broken.foundBefore = [1, 2];
    const back = deserializeRun(JSON.stringify(broken));
    expect(back).not.toBeNull();
    expect(back!.foundBefore).toBeUndefined();
  });
});
