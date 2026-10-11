import { omenSigil } from '@/art/sigil';
import { FINAL_ANTE, NIGHT_REWARD, nightTarget } from '@/core/content/balance';
import { bossDef } from '@/core/content/bosses';
import { NIGHT_KINDS, type RunState } from '@/core/types';
import type { App, Screen } from '@/game/app';
import { named, num, t } from '@/i18n';
import { canvasImg, dpr, h } from '../dom';
import { omenTooltip } from '../hud';
import { coach } from '../tutorial';
import { attachTooltip, button } from '../widgets';
import { showDeck, showHelp } from './common';
import { NightScreen } from './night';

/** Карта созвездия: три ночи, цели, награды и Затмение впереди. */
export class MapScreen implements Screen {
  private el!: HTMLElement;

  constructor(
    private readonly app: App,
    private readonly run: RunState,
  ) {}

  mount(root: HTMLElement): void {
    const run = this.run;
    const bossId = run.bosses[run.ante - 1]!;
    const nodes = h('div.map-nodes');
    NIGHT_KINDS.forEach((kind, i) => {
      const status = i < run.nightIndex ? 'beaten' : i === run.nightIndex ? 'current' : 'upcoming';
      const target = nightTarget(run.ante, kind, kind === 'eclipse' ? (bossDef(bossId).targetScale ?? 1) : 1);
      const node = h(`div.map-node.${status}.${kind}`, null, [
        h('div.node-head', null, [h('div.node-name', null, t(`night.${kind}`)), h('div.node-status', null, t(`night.${status}`))]),
        kind === 'eclipse'
          ? h('div.node-boss', null, [NightScreen.bossIcon(bossId, 56), h('div', null, [h('div.boss-name', null, named('boss', bossId).name), h('div.boss-desc', null, named('boss', bossId).desc)])])
          : h('div.node-glyph', null, kind === 'dusk' ? '☾' : '✦'),
        h('div.node-foot', null, [
          h('div', null, [h('span.label', null, t('night.target')), h('b', null, num(target))]),
          h('div', null, [h('span.label', null, t('night.reward')), h('b.gold-text', null, `+${NIGHT_REWARD[kind]}`)]),
        ]),
      ]);
      nodes.append(node);
    });

    const omens = h('div.map-omens');
    for (const o of run.omens) {
      const el = h('div.omen-slot', null, canvasImg(omenSigil(o.id, 40, dpr()), 40));
      attachTooltip(el, () => omenTooltip(o));
      omens.append(el);
    }

    const total = run.endless ? '∞' : String(FINAL_ANTE);
    this.el = h('div.map', null, [
      h('div.map-top', null, [
        h('div.map-title', null, [
          h('div.map-kicker', null, run.endless ? t('night.endless') : t('night.constellationOf', { n: run.ante, total })),
          h('div.progress-dots', null, Array.from({ length: Math.max(run.ante, FINAL_ANTE) }, (_, i) => h(`span.dot${i < run.ante - 1 ? '.done' : i === run.ante - 1 ? '.now' : ''}`))),
        ]),
        h('div.gold-pill', null, String(run.gold)),
      ]),
      nodes,
      run.omens.length ? omens : null,
      h('div.map-actions', null, [
        button(t('pause.help'), () => showHelp(), { variant: 'ghost' }),
        button(t('shop.yourDeck', { n: run.deck.length }), () => showDeck(run), { variant: 'secondary' }),
        button(t('night.begin'), () => this.app.beginNight(), { className: 'grow' }),
      ]),
    ]);
    root.append(this.el);
    if (run.nightIndex === 2) coach(this.app, 'boss');
  }

  unmount(): void {
    this.el.remove();
  }
}
