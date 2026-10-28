import { describe, expect, it } from 'vitest';
import { CHAPTER_LADDER, ladderAt } from '../src/core/content/pools';
import { hasFork, isWonder, nextStop, planChapter } from '../src/core/route';
import { newRun } from '../src/core/run';
import { unlocksFor } from '../src/meta/progress';
import { emptyProfile } from '../src/meta/profile';

/**
 * Лестница по главам (LD.1, вариант A): в первом же личном забеге глава 1 учит, во 2-й
 * развилки, в 3-й дар ночи, в 4-й Комета, Телескоп и два Затмения. Вызов дня, архив и вызов
 * друга играют общим набором — лестница их не трогает.
 */
const fresh = () => newRun({ seed: 4242, skyId: 'classic', unlocks: unlocksFor(emptyProfile(), false) });

describe('лестница открытий по главам', () => {
  it('новичок: глава 1 — три ночи подряд, без развилок, дара и чудес', () => {
    const run = fresh();
    expect(run.unlocks).toMatchObject({ routes: false, gift: false, wonders: false, ladder: true });
    expect(run.chapter.nodes).toHaveLength(3);
  });

  it('глава 2 — развилки, 3 — дар ночи, 4 — Комета, Телескоп и два Затмения', () => {
    const u = fresh().unlocks;
    expect(ladderAt(u, CHAPTER_LADDER.routes)).toMatchObject({ routes: true, gift: false, wonders: false });
    expect(ladderAt(u, CHAPTER_LADDER.gift)).toMatchObject({ routes: true, gift: true, wonders: false });
    expect(ladderAt(u, CHAPTER_LADDER.wonders)).toMatchObject({ routes: true, gift: true, wonders: true });
    const run = fresh();
    const ch2 = planChapter({ ...run, ante: 2, unlocks: ladderAt(run.unlocks, 2) });
    expect(hasFork({ ...ch2, path: [] })).toBe(true);
    expect(ch2.nodes.some((n) => isWonder(n.route))).toBe(false);
    const ch4 = planChapter({ ...run, ante: 4, unlocks: ladderAt(run.unlocks, 4) });
    expect(ch4.nodes.some((n) => isWonder(n.route))).toBe(true);
    expect(ch4.nodes.filter((n) => n.kind === 'eclipse')).toHaveLength(2);
  });

  it('взгляд вперёд на следующую главу видит её такой, какой она будет', () => {
    const run = fresh();
    run.chapter = { ...run.chapter, at: 2, path: [0, 1, 2] };
    const ahead = nextStop(run);
    expect(ahead.ante).toBe(2);
    expect(ahead.chapter.nodes.length).toBeGreaterThan(3);
  });

  it('общий набор (вызов дня, вызов друга) и старые забеги лестница не трогает', () => {
    const shared = unlocksFor(emptyProfile(), true);
    expect(shared.ladder).toBe(false);
    expect(ladderAt(shared, 8)).toBe(shared);
    const old = { ...fresh().unlocks, ladder: undefined };
    expect(ladderAt(old, 8)).toBe(old);
  });

  it('дошёл до главы — в следующих забегах это открыто с первой главы', () => {
    const p = { ...emptyProfile(), bestAnte: CHAPTER_LADDER.wonders, runs: 1 };
    expect(unlocksFor(p, false)).toMatchObject({ routes: true, gift: true, wonders: true });
  });
});
