import { FINAL_ANTE } from '@/core/content/balance';
import { runNightReward, runNightTarget } from '@/core/content/stakes';
import { NIGHT_KINDS, type RunState } from '@/core/types';
import type { App, Screen } from '@/game/app';
import { named, num, t } from '@/i18n';
import { h } from '../dom';
import { omenMedal, omenTooltip } from '../hud';
import { coach } from '../tutorial';
import { attachTooltip, button } from '../widgets';
import { menuButton, showDeck, showHelp, showRunMenu } from './common';
import { NightScreen } from './night';

/** Карта созвездия: три ночи, цели, награды и Затмение впереди. */
export class MapScreen implements Screen {
  private el!: HTMLElement;

  /** `peek` — карта открыта из Обсерватории посмотреть, что впереди. */
  constructor(
    private readonly app: App,
    private readonly run: RunState,
    private readonly peek = false,
  ) {}

  mount(root: HTMLElement): void {
    const run = this.run;
    // Из Обсерватории показываем следующую ночь (она может быть уже в новом созвездии)
    let ante = run.ante;
    let nightIndex = run.nightIndex;
    if (this.peek) {
      nightIndex += 1;
      if (nightIndex >= 3) {
        nightIndex = 0;
        ante += 1;
      }
    }
    const view: RunState = { ...run, ante, nightIndex };
    const bossId = run.bosses[ante - 1] ?? null;
    const nodes = h('div.map-nodes');
    NIGHT_KINDS.forEach((kind, i) => {
      const status = i < nightIndex ? 'beaten' : i === nightIndex ? 'current' : 'upcoming';
      const target = runNightTarget(view, kind, kind === 'eclipse' ? bossId : null);
      const node = h(`div.map-node.${status}.${kind}`, null, [
        h('div.node-head', null, [h('div.node-name', null, t(`night.${kind}`)), h('div.node-status', null, t(`night.${status}`))]),
        kind === 'eclipse' && bossId
          ? h('div.node-boss', null, [NightScreen.bossIcon(bossId, 56), h('div', null, [h('div.boss-name', null, named('boss', bossId).name), h('div.boss-desc', null, named('boss', bossId).desc)])])
          : h('div.node-glyph', null, kind === 'dusk' ? '☾' : '✦'),
        h('div.node-foot', null, [
          h('div', null, [h('span.label', null, t('night.target')), h('b', null, num(target))]),
          h('div', null, [h('span.label', null, t('night.reward')), h('b.gold-text', null, `+${runNightReward(run, kind)}`)]),
        ]),
      ]);
      nodes.append(node);
    });

    const omens = h('div.map-omens');
    for (const o of run.omens) {
      const el = h('div.omen-slot', null, omenMedal(o.id, 40));
      attachTooltip(el, () => omenTooltip(o));
      omens.append(el);
    }

    const total = run.endless ? '∞' : String(FINAL_ANTE);
    this.el = h('div.map', null, [
      h('div.map-top', null, [
        h('div.map-title', null, [
          h('div.map-kicker', null, [run.endless ? t('night.endless') : t('night.constellationOf', { n: ante, total }), run.stake ? h('span.stake-chip', null, '✦'.repeat(run.stake)) : null]),
          h('div.progress-dots', null, Array.from({ length: Math.max(ante, FINAL_ANTE) }, (_, i) => h(`span.dot${i < ante - 1 ? '.done' : i === ante - 1 ? '.now' : ''}`))),
        ]),
        h('div.gold-pill', null, String(run.gold)),
        menuButton(() => showRunMenu(this.app)),
      ]),
      nodes,
      run.omens.length ? omens : null,
      h('div.map-actions', null, [
        button(t('pause.help'), () => showHelp(), { variant: 'ghost' }),
        button(t('shop.yourDeck', { n: run.deck.length }), () => showDeck(run), { variant: 'secondary' }),
        this.peek
          ? button(`← ${t('pause.backToShop')}`, () => void this.app.route(), { className: 'grow' })
          : button(t('night.begin'), () => this.app.beginNight(), { className: 'grow' }),
      ]),
    ]);
    root.append(this.el);
    if (!this.peek && run.nightIndex === 2) coach(this.app, 'boss');
  }

  unmount(): void {
    this.el.remove();
  }
}
