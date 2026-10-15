import { bossSigil, omenSigil } from '@/art/sigil';
import { BOSS_LIST } from '@/core/content/bosses';
import { OMEN_LIST } from '@/core/content/omens';
import { SKY_LIST } from '@/core/content/skies';
import type { App } from '@/game/app';
import { dict, format, named, num } from '@/i18n';
import { canvasImg, dpr, h } from '../dom';
import { modal } from '../widgets';

type Tab = 'omens' | 'bosses' | 'stats';
const TABS: Tab[] = ['omens', 'bosses', 'stats'];

/** Описание без «(сейчас +{x})» — в Кодексе нет текущего забега. */
const effect = (s: string) => s.replace(/\s*\([^)]*\{x\}[^)]*\)/, '').replace('{x}', '…');

/**
 * Кодекс тем же устройством, что и Справочник («Живая доска», RD.7): сверху выбранное
 * Знамение или Затмение крупно — тип и действие; ниже вся коллекция знаками, неизвестные
 * тёмные. «Итоги» — шесть чисел на доске и небеса списком.
 */
export function showCodex(app: App): void {
  const p = app.profile;
  const c = dict().codex;
  let tab: Tab = 'omens';
  let sel: string | null = null;
  const s = dpr();
  const tabsBar = h('nav.gb-tabs', { attrs: { role: 'tablist', 'aria-label': c.title } });
  const body = h('div.gb');

  const collection = (kind: 'omen' | 'boss'): [HTMLElement, HTMLElement[]] => {
    const list = kind === 'omen' ? OMEN_LIST : BOSS_LIST;
    const seen = kind === 'omen' ? p.seenOmens : p.seenBosses;
    const art = (id: string, size: number) => canvasImg(kind === 'omen' ? omenSigil(id, size, s) : bossSigil(id, size, s), size);
    const cur = list.find((x) => x.id === sel) ?? list.find((x) => seen.includes(x.id)) ?? list[0]!;
    sel = cur.id;
    const known = seen.includes(cur.id);
    const big = art(cur.id, 72);
    big.classList.add('gb-big');
    if (!known) big.classList.add('unknown');
    const info = named(kind, cur.id);
    const kindLabel = kind === 'omen' ? (cur as (typeof OMEN_LIST)[number]).kind : null;
    const tally = known
      ? [h('h3', null, info.name), h(`span.gb-kind${kindLabel ? `.${kindLabel}` : ''}`, null, kindLabel ? c.kinds[kindLabel] ?? '' : c.eclipse), h('p', null, effect(info.desc))]
      : [h('h3', null, c.unknown), h('p', null, kind === 'omen' ? c.unknownOmen : c.unknownBoss)];
    const grid = h('div.gb-sigils');
    for (const x of list) {
      const isSeen = seen.includes(x.id);
      const b = h(`button${isSeen ? '' : '.unknown'}${x.id === sel ? '.on' : ''}`, {
        type: 'button',
        attrs: { 'aria-pressed': String(x.id === sel), 'aria-label': isSeen ? named(kind, x.id).name : c.unknown },
      }, art(x.id, 40));
      b.addEventListener('click', (e) => {
        if (sel === x.id) return;
        sel = x.id;
        app.svc.audio.click();
        render();
        if (e.detail === 0) body.querySelector<HTMLElement>('.gb-sigils .on')?.focus({ preventScroll: true });
      });
      grid.append(b);
    }
    const board = h('div.gb-board', null, [h('div.gb-stage', null, big), h('div.gb-tally', { attrs: { 'aria-live': 'polite' } }, tally)]);
    return [board, [h('h3.gb-section', null, [kind === 'omen' ? c.omens : c.bosses, h('small', null, format(c.opened, { n: seen.length, total: list.length }))]), grid]];
  };

  const stats = (): [HTMLElement, HTMLElement[]] => {
    const cell = (value: string, label: string) => h('div', null, [h('b', null, value), h('span', null, label)]);
    const board = h('div.gb-board.stack', null, h('div.gb-stats', null, [
      cell(num(p.runs), c.sRuns), cell(num(p.wins), c.sWins), cell(String(p.bestAnte), c.sAnte),
      cell(num(p.bestPlacement), c.sBest), cell(num(p.totalLines), c.sLines), cell(String(p.seenOmens.length), format(c.sOmens, { total: OMEN_LIST.length })),
    ]));
    const list = h('div.gb-list');
    for (const sky of SKY_LIST) {
      const open = p.unlockedSkies.includes(sky.id);
      const info = named('sky', sky.id);
      list.append(h(`div.gb-row.static${open ? '' : '.miss'}`, null, h('span.gb-text', null, [h('b', null, open ? info.name : `🔒 ${info.name}`), h('small', null, info.desc)])));
    }
    const openN = SKY_LIST.filter((x) => p.unlockedSkies.includes(x.id)).length;
    return [board, [h('h3.gb-section', null, [c.skies, h('small', null, format(c.opened, { n: openN, total: SKY_LIST.length }))]), list]];
  };

  let shownTab: Tab | null = null;
  function render(): void {
    const keep = shownTab === tab ? body.querySelector('.gb-scroll')?.scrollTop ?? 0 : 0;
    tabsBar.querySelectorAll<HTMLElement>('.gb-tab').forEach((el) => {
      const on = el.dataset.tab === tab;
      el.classList.toggle('on', on);
      el.setAttribute('aria-selected', String(on));
      el.tabIndex = on ? 0 : -1;
    });
    const [board, below] = tab === 'stats' ? stats() : collection(tab === 'omens' ? 'omen' : 'boss');
    body.replaceChildren(h('div.gb-pin', null, board), h('div.gb-scroll', null, below));
    body.querySelector('.gb-scroll')!.scrollTop = keep;
    shownTab = tab;
  }

  const labels: Record<Tab, string> = { omens: c.omens, bosses: c.bosses, stats: c.results };
  TABS.forEach((id, i) => {
    const b = h('button.gb-tab', { type: 'button', dataset: { tab: id }, attrs: { role: 'tab' } }, labels[id]);
    b.addEventListener('click', () => {
      if (tab === id) return;
      app.svc.audio.click();
      tab = id;
      sel = null;
      render();
    });
    b.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      tab = TABS[(i + d + TABS.length) % TABS.length]!;
      sel = null;
      render();
      tabsBar.querySelector<HTMLElement>('.gb-tab.on')?.focus();
    });
    tabsBar.append(b);
  });
  modal(body, { title: c.title, className: 'board-modal codex-modal', headExtra: tabsBar });
  render();
}
