import { bossSigil, omenSigil } from '@/art/sigil';
import { BOSS_LIST } from '@/core/content/bosses';
import { OMEN_LIST } from '@/core/content/omens';
import { SKY_LIST } from '@/core/content/skies';
import type { App } from '@/game/app';
import { named, num, t } from '@/i18n';
import { canvasImg, dpr, h } from '../dom';
import { omenTooltip, bossTooltip } from '../hud';
import { attachTooltip, button, modal } from '../widgets';

type Tab = 'omens' | 'bosses' | 'stats';

/** Кодекс: открытые Знамения и Затмения, таблица созвездий, статистика. */
export function showCodex(app: App): void {
  const body = h('div.codex-body');
  const tabs = h('div.segmented.tabs');
  const p = app.profile;
  const render = (tab: Tab) => {
    tabs.querySelectorAll('.seg').forEach((el) => el.classList.toggle('on', (el as HTMLElement).dataset.tab === tab));
    if (tab === 'omens') {
      const grid = h('div.codex-grid');
      for (const o of OMEN_LIST) {
        const seen = p.seenOmens.includes(o.id);
        const cell = h(`div.codex-cell${seen ? '' : '.unknown'}`, null, [
          canvasImg(omenSigil(o.id, 52, dpr()), 52),
          h('div.codex-name', null, seen ? named('omen', o.id).name : t('codex.unknown')),
        ]);
        if (seen) attachTooltip(cell, () => omenTooltip({ id: o.id }));
        grid.append(cell);
      }
      body.replaceChildren(h('p.hint', null, t('codex.found', { n: p.seenOmens.length, total: OMEN_LIST.length })), grid);
    } else if (tab === 'bosses') {
      const grid = h('div.codex-grid');
      for (const b of BOSS_LIST) {
        const seen = p.seenBosses.includes(b.id);
        const cell = h(`div.codex-cell${seen ? '' : '.unknown'}`, null, [
          canvasImg(bossSigil(b.id, 52, dpr()), 52),
          h('div.codex-name', null, seen ? named('boss', b.id).name : t('codex.unknown')),
        ]);
        if (seen) attachTooltip(cell, () => bossTooltip(b.id));
        grid.append(cell);
      }
      body.replaceChildren(grid);
    } else {
      const item = (label: string, value: string) => h('div.stat-item', null, [h('div.stat-item-value', null, value), h('div.stat-item-label', null, label)]);
      const skies = h('div.sky-list.compact', null, SKY_LIST.map((s) => {
        const open = p.unlockedSkies.includes(s.id);
        const info = named('sky', s.id);
        return h(`div.sky-item${open ? '' : '.locked'}`, null, [h('div.sky-name', null, open ? info.name : `🔒 ${info.name}`), h('div.sky-desc', null, info.desc)]);
      }));
      body.replaceChildren(
        h('div.stats-grid', null, [
          item(t('codex.runs'), num(p.runs)),
          item(t('codex.wins'), num(p.wins)),
          item(t('codex.bestAnte'), String(p.bestAnte)),
          item(t('codex.bestScore'), num(p.bestPlacement)),
          item(t('codex.totalLines'), num(p.totalLines)),
        ]),
        h('h3', null, t('codex.skies')),
        skies,
      );
    }
  };
  const labels: [Tab, string][] = [
    ['omens', t('codex.omens')],
    ['bosses', t('codex.bosses')],
    ['stats', t('codex.stats')],
  ];
  for (const [tab, label] of labels) {
    const b = h('button.seg', { type: 'button', dataset: { tab } }, label);
    b.addEventListener('click', () => {
      app.svc.audio.click();
      render(tab);
    });
    tabs.append(b);
  }
  render('omens');
  const m = modal([tabs, body, h('div.row.end', null, button(t('menu.back'), () => m.close(), { variant: 'secondary' }))], {
    title: t('codex.title'),
    className: 'wide codex',
  });
}
