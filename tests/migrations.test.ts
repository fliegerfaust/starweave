import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OMENS } from '../src/core/content/omens';
import { SKIES } from '../src/core/content/skies';
import { apply, newLoggedRun } from '../src/core/commands';
import { allContent } from '../src/core/content/pools';
import { placeCard } from '../src/core/night';
import { SAVE_VERSION } from '../src/core/run';
import { deserializeRun, serializeRun } from '../src/core/save';
import { parseStartParam } from '../src/game/challenge';
import { loadProfile, PROFILE_VERSION, saveProfile, sanitizeProfile } from '../src/meta/profile';
import { KEYS } from '../src/meta/storage';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

/** Хранилище в памяти вместо localStorage браузера. */
const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
});

/** Профиль игрока 0.5.9 — как его пишет игра (и как он лежит в облаке Telegram). */
const PROFILE_059 = {
  version: 1, runs: 7, wins: 1, bestAnte: 8, bestPlacement: 4120, totalLines: 312,
  seenOmens: ['stardust', 'crossroads', 'monochrome'], seenBosses: ['void', 'gravity'],
  unlockedSkies: ['classic', 'wanderer'], tutorial: ['map', 'shop'],
  daily: { date: '2026-10-20', ante: 4, best: 980, finished: true },
  archive: { '2026-10-19': { ante: 8, best: 2100, won: true } },
  maxStake: 1, tutorialDone: true, tutorialFinished: true,
  combosFound: ['pair', 'flush', 'cascade'], crossFound: true, firstSeen: 1760000000000,
};

describe('сохранение забега (TD.1)', () => {
  it('сохранения 0.5.9 открываются и играются дальше', () => {
    for (const name of ['save-0.5.9-shop.json', 'save-0.5.9-night.json']) {
      const run = deserializeRun(fixture(name));
      expect(run, name).not.toBeNull();
      expect(run!.version).toBe(SAVE_VERSION);
      expect(deserializeRun(serializeRun(run!))).toEqual(run);
    }
    const night = deserializeRun(fixture('save-0.5.9-night.json'))!;
    const cell = night.night!.grid.findIndex((c, i) => !c && !night.night!.sealed[i]);
    expect(() => placeCard(night, 0, cell)).not.toThrow();
  });

  it('номер ночи 0.5.9 становится планом главы (TD.6)', () => {
    const raw = JSON.parse(fixture('save-0.5.9-night.json'));
    const run = deserializeRun(JSON.stringify(raw))!;
    expect(run.chapter.at).toBe(raw.nightIndex);
    expect(run.chapter.nodes.map((n) => n.kind)).toEqual(['dusk', 'midnight', 'eclipse']);
    expect(run.chapter.nodes[2]!.bossId).toBe(raw.bosses[raw.ante - 1]);
    expect('nightIndex' in run).toBe(false);
    const base = { ...raw, version: SAVE_VERSION, chapter: run.chapter };
    delete base.nightIndex;
    for (const chapter of [null, { ...run.chapter, at: 3 }, { nodes: [], at: 0 }, { ...run.chapter, nodes: [{ kind: 'dawn', bossId: null }] }]) {
      expect(deserializeRun(JSON.stringify({ ...base, chapter })), JSON.stringify(chapter)).toBeNull();
    }
  });

  it('журнал команд сохраняется, битый — отбрасывается без потери забега (TD.9)', () => {
    const run = newLoggedRun({ seed: 5 });
    apply(run, { c: 'startNight' });
    expect(deserializeRun(serializeRun(run))!.log).toEqual(run.log);
    const broken = deserializeRun(JSON.stringify({ ...run, log: { version: 1, cmds: 'nope' } }));
    expect(broken).not.toBeNull();
    expect(broken!.log).toBeUndefined();
  });

  it('открытый пакет 0.5.9 встаёт в очередь выборов (TD.7)', () => {
    const raw = JSON.parse(fixture('save-0.5.9-shop.json'));
    raw.shop.openPack = { pack: 'omen', options: ['stardust', 'pyre', 'abacus'] };
    const run = deserializeRun(JSON.stringify(raw))!;
    expect(run.pending).toEqual([{ kind: 'pack', pack: 'omen', options: ['stardust', 'pyre', 'abacus'] }]);
    expect('openPack' in run.shop!).toBe(false);
    const v2 = { ...JSON.parse(fixture('save-0.5.9-shop.json')), version: 2, log: { version: 1, start: { seed: 1 }, cmds: [{ c: 'choosePack', index: 0 }, { c: 'skipPack' }] } };
    v2.chapter = run.chapter;
    delete v2.nightIndex;
    expect(deserializeRun(JSON.stringify(v2))!.log!.cmds).toEqual([{ c: 'choose', index: 0 }, { c: 'skip' }]);
    for (const pending of [null, [{ kind: 'pack', pack: 'omen', options: ['futureOmen'] }], [{ kind: 'gift', options: ['x'] }]]) {
      expect(deserializeRun(JSON.stringify({ ...run, pending })), JSON.stringify(pending)).toBeNull();
    }
  });

  it('старый забег получает снимок открытий со всем контентом; незнакомое Знамение в снимке — не открывается (TD.8)', () => {
    const run = deserializeRun(fixture('save-0.5.9-shop.json'))!;
    expect(run.unlocks).toEqual(allContent());
    const broken = { ...run, unlocks: { ...run.unlocks, omens: [...run.unlocks.omens, 'futureOmen'] } };
    expect(deserializeRun(JSON.stringify(broken))).toBeNull();
  });

  it('сохранение от более новой сборки не открывается и не роняет игру', () => {
    const run = JSON.parse(fixture('save-0.5.9-shop.json'));
    expect(deserializeRun(JSON.stringify({ ...run, version: SAVE_VERSION + 1 }))).toBeNull();
  });

  it('незнакомые Знамение, Затмение, небо или фаза — не открывается, а не падает', () => {
    const base = JSON.parse(fixture('save-0.5.9-night.json'));
    const broken = [
      { ...base, omens: [{ uid: 1, id: 'futureOmen', data: {} }] },
      { ...base, bosses: [...base.bosses, 'futureBoss'] },
      { ...base, skyId: 'constructor' },
      { ...base, phase: 'route' },
      { ...base, deck: [{ id: 1, suit: 'sun', rank: 42 }] },
      { ...base, night: { ...base.night, hand: null } },
    ];
    for (const b of broken) expect(deserializeRun(JSON.stringify(b))).toBeNull();
    expect(deserializeRun('{"version":1')).toBeNull();
    expect(deserializeRun('[]')).toBeNull();
  });
});

describe('профиль (TD.1)', () => {
  it('профиль 0.5.9 читается без потерь', () => {
    mem.set(KEYS.profile, JSON.stringify(PROFILE_059));
    const p = loadProfile();
    expect(p).toMatchObject(PROFILE_059);
    expect(p.version).toBe(PROFILE_VERSION);
  });

  it('битые поля заменяются значениями по умолчанию, остальное сохраняется', () => {
    const p = sanitizeProfile({ ...PROFILE_059, seenOmens: null, runs: 'много', unlockedSkies: 5, archive: { 'не дата': {}, '2026-10-01': { ante: 3, best: -1 } }, combosFound: ['pair', 'futureCombo'], daily: { date: 7 } });
    expect(p.seenOmens).toEqual([]);
    expect(p.runs).toBe(0);
    expect(p.unlockedSkies).toEqual(['classic']);
    expect(p.archive).toEqual({ '2026-10-01': { ante: 3, best: 0 } });
    expect(p.combosFound).toEqual(['pair']);
    expect(p.daily).toBeNull();
    expect(p.wins).toBe(1);
  });

  it('профиль новее сборки читается, но не перезаписывается', () => {
    const future = JSON.stringify({ ...PROFILE_059, version: PROFILE_VERSION + 1, newField: [1, 2] });
    mem.set(KEYS.profile, future);
    const p = loadProfile();
    expect(p.runs).toBe(7);
    p.runs += 1;
    saveProfile(p);
    expect(mem.get(KEYS.profile)).toBe(future);
  });

  it('пустой или мусорный профиль — новый', () => {
    mem.set(KEYS.profile, 'не json');
    expect(loadProfile().runs).toBe(0);
    mem.set(KEYS.profile, JSON.stringify({ version: 0 }));
    expect(loadProfile().unlockedSkies).toEqual(['classic']);
  });
});

describe('реестры без прототипа (SEC.5)', () => {
  it('служебные имена объекта не считаются контентом', () => {
    for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(SKIES[key]).toBeUndefined();
      expect(OMENS[key]).toBeUndefined();
    }
    expect(parseStartParam('c_1_constructor_0_1_1')).toEqual({});
    expect(parseStartParam('c_1_classic_0_1_1').challenge?.skyId).toBe('classic');
  });
});

describe('сервер: товар по имени служебного поля (SEC.5)', () => {
  it('constructor — не товар', async () => {
    const { STARS_PRODUCTS, IMPLIED } = await import('../server/src/catalog.ts');
    expect(STARS_PRODUCTS['constructor']).toBeUndefined();
    expect(IMPLIED['constructor']).toBeUndefined();
    expect(STARS_PRODUCTS.atlas?.stars).toBe(250);
  });
});
