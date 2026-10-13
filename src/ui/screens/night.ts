import { bossSigil } from '@/art/sigil';
import { canDoubleReward, canRevive } from '@/core/run';
import { misorderedOmens } from '@/core/omen-order';
import type { GameEvent, RunState } from '@/core/types';
import type { App, Screen } from '@/game/app';
import { NightScene } from '@/game/night/scene';
import { COLLECTIBLE_COMBOS, dailyNumber, recordDiscoveries } from '@/meta/profile';
import { track } from '@/analytics';
import { named, num, t } from '@/i18n';
import { canvasImg, dpr, h } from '../dom';
import { Hud } from '../hud';
import { announceDiscovery, clearDiscovery, whenDiscoveryDone } from '../discovery';
import { clearCoach, coach, dropCoach, setCoachDock } from '../tutorial';
import { animateNumber, button, confirmDialog, modal, toast, type ModalHandle, withCoin } from '../widgets';
import { screenTitle, showCombos, showDeck, showHelp, showSettings, statsGrid } from './common';

/** Ночь: HUD + сцена на канвасе + оверлеи награды и конца забега. */
export class NightScreen implements Screen {
  private hud!: Hud;
  private scene: NightScene | null = null;
  private overlay: ModalHandle | null = null;

  constructor(
    private readonly app: App,
    private readonly run: RunState,
  ) {}

  mount(root: HTMLElement): void {
    this.hud = new Hud({
      onMenu: () => this.pause(),
      onGuide: (focus) => this.guide(focus),
      onBurn: () => this.burn(),
      onDeck: () => showDeck(this.run),
    });
    this.hud.mount(root);
    this.hud.sync(this.run);
    // Новичку «?» мягко пульсирует, пока он её не нажмёт: там все созвездия
    const p = this.app.profile;
    this.hud.setGuideAttention(!this.run.tutorial && p.runs < 3 && !p.tutorial.includes('guideSeen'));
    this.hud.setBurnEnabled(false);

    if (this.run.night) {
      this.scene = new NightScene(this.app.svc, this.run, this.hud, {
        act: (a) => this.app.act(a),
        onSettled: (events) => this.settled(events),
        onSelect: (i) => {
          this.hud.setBurnEnabled(i !== null && (this.run.night?.burnsLeft ?? 0) > 0);
          const n = this.run.night;
          this.hud.setCardInfo(i !== null && n ? (n.hand[i] ?? null) : null, n?.rules.hideRanks);
        },
      });
      this.scene.build();
      const scene = this.scene;
      setCoachDock(() => (this.scene === scene ? scene.handAreaRect().y : null));
      this.app.tutorial?.emit({ type: 'night', scene: this.scene, hud: this.hud });
      const n = this.run.night;
      const fresh = n.placements === 0 && n.burnsLeft === n.rules.burns && n.result === 'playing';
      if (fresh) {
        void this.scene.dealIn().then(() => {
          this.app.tutorial?.emit({ type: 'dealt' });
          if (!this.run.tutorial) this.introHints();
        });
      }
    }
    this.checkPhase();
  }

  unmount(): void {
    this.scene?.destroy();
    this.scene = null;
    this.hud.unmount();
    this.overlay?.close();
    clearCoach();
    clearDiscovery();
    setCoachDock(null);
  }

  private introHints(): void {
    const n = this.run.night!;
    if (n.gentle) toast(t('night.gentle', { n: n.movesLeft }));
    else if (n.bossId) toast(named('boss', n.bossId).desc);
    else {
      // Первые созвездия: напомнить про порядок Знамений тем, кто пропустил обучение
      const wrong = this.run.ante <= 2 ? misorderedOmens(this.run.omens) : null;
      if (wrong) toast(t('night.orderWarn', { x: named('omen', wrong.xmult).name, a: named('omen', wrong.additive).name }), 'warn');
    }
    coach(this.app, 'place');
    coach(this.app, 'target');
  }

  /** «?»: посреди ночи нужнее всего созвездия; подпись о глифе ведёт в справочник. */
  private guide(focus?: string): void {
    if (focus) showHelp({ focus, levels: this.run.comboLevels, found: this.app.profile.combosFound });
    else showCombos(this.run, this.app.profile.combosFound, true);
    const p = this.app.profile;
    if (!p.tutorial.includes('guideSeen')) {
      p.tutorial.push('guideSeen');
      this.app.persistProfile();
    }
    this.hud.setGuideAttention(false);
  }

  private burn(): void {
    if (!this.scene) return;
    if ((this.run.night?.burnsLeft ?? 0) <= 0) {
      toast(t('night.noBurns'), 'warn');
      return;
    }
    if (this.scene.selected === null) {
      toast(t('night.burnHint'));
      return;
    }
    void this.scene.burnSelected();
  }

  private settled(events: GameEvent[]): void {
    this.app.tutorial?.emit({ type: 'settled', events });
    this.discover(events);
    const n = this.run.night;
    if (n && n.result === 'playing') {
      if (events.some((e) => e.t === 'ignite')) {
        // Линия уже вспыхнула — «заполни ряд» больше не нужна
        dropCoach('fillLine');
        coach(this.app, 'combos');
        if (n.ignitions >= 2) coach(this.app, 'cross');
      } else if (n.placements >= 2) coach(this.app, 'fillLine');
      if (n.placements >= 7) coach(this.app, 'burn');
      if (n.movesLeft === 1) toast(t('night.lastMove'));
    } else {
      // Ночь закончилась — подсказки про ход больше ни к чему
      clearCoach();
      // Итоговое окно — после праздника «Новое созвездие», а не поверх него
      void whenDiscoveryDone().then(() => {
        if (this.scene && !this.scene.isDestroyed) this.checkPhase();
      });
      return;
    }
    this.checkPhase();
  }

  /** Коллекция: впервые собранное созвездие и первый крест — маленький праздник. */
  private discover(events: GameEvent[]): void {
    if (this.run.tutorial) return;
    const p = this.app.profile;
    const banners: Parameters<typeof announceDiscovery>[0] = [];
    for (const e of events) {
      if (e.t !== 'ignite') continue;
      const found = recordDiscoveries(p, e.score.lines.map((l) => l.combo), e.score.lines.length);
      for (const id of found.combos) {
        const count = p.combosFound!.length - found.combos.length + found.combos.indexOf(id) + 1;
        banners.push({ kind: 'combo', id, count });
        track('combo_found', { combo: id, count, ante: this.run.ante });
      }
      if (found.cross) {
        banners.push({ kind: 'cross' });
        track('combo_found', { combo: 'cross', count: p.combosFound!.length, ante: this.run.ante });
      }
    }
    if (!banners.length) return;
    this.app.persistProfile();
    announceDiscovery(banners, () => this.app.svc.audio.win());
    const completed = banners.some((b) => b.kind === 'combo' && b.count === COLLECTIBLE_COMBOS.length);
    if (completed) toast(t('discovery.all'));
  }

  private checkPhase(): void {
    if (this.overlay) return;
    switch (this.run.phase) {
      case 'reward':
        return this.showReward();
      case 'gameOver':
        return this.showGameOver();
      case 'victory':
        return this.showVictory();
      default:
        return;
    }
  }

  // ─── Пауза ──────────────────────────────────────────────────────────────

  private pause(): void {
    const m = modal(
      [
        h('div.stack', null, [
          button(t('pause.resume'), () => m.close()),
          button(t('pause.help'), () => showHelp({ levels: this.run.comboLevels, found: this.app.profile.combosFound }), { variant: 'secondary' }),
          button(t('settings.title'), () => showSettings(this.app, () => this.hud.sync(this.run, { score: false })), { variant: 'secondary' }),
          button(t('pause.abandon'), () => confirmDialog(t('pause.abandonConfirm'), () => {
            m.close();
            this.app.abandonRun();
          }), { variant: 'ghost' }),
        ]),
      ],
      { title: t('pause.title'), className: 'narrow' },
    );
  }

  // ─── Оверлеи ────────────────────────────────────────────────────────────

  private showReward(): void {
    const reward = this.run.reward!;
    const rows: [string, number][] = [
      [t('reward.base'), reward.base],
      [t('reward.moves'), reward.moves],
      [t('reward.burns'), reward.burns],
      [t('reward.interest'), reward.interest],
    ];
    const list = h('div.reward-list');
    rows.forEach(([label, value], i) => {
      if (value <= 0 && i > 0) return;
      const row = h('div.reward-row', { style: { animationDelay: `${i * 0.12}s` } }, [h('span', null, label), h('span.gold-text', null, withCoin(`+${value}`))]);
      list.append(row);
      window.setTimeout(() => this.app.svc.audio.coin(), 200 + i * 120);
    });
    const total = h('span.gold-text.big', null, '0');
    animateNumber(total, 0, reward.total, 700, (n) => String(Math.round(n)));
    this.overlay = modal(
      [
        h('div.reward-score', null, [h('span', null, t('night.score')), h('b', null, num(this.run.night!.score))]),
        list,
        h('div.reward-total', null, [h('span', null, t('night.gold')), total]),
        h('div.row.center.wrap', null, [
          this.app.platform.rewardedAvailable && canDoubleReward(this.run)
            ? this.adButton(t('ads.double'), async () => {
                if (await this.app.doubleReward()) {
                  this.overlay?.close();
                  this.overlay = null;
                  this.showReward();
                  return true;
                }
                return false;
              })
            : null,
          button(withCoin(t('reward.collect', { n: reward.total })), () => {
            this.overlay?.close();
            this.overlay = null;
            this.app.collectReward();
          }),
        ]),
      ],
      { title: t('reward.title'), dismissable: false, className: 'narrow reward' },
    );
    this.app.tutorial?.emit({ type: 'reward', panel: this.overlay.el });
  }

  private showGameOver(): void {
    const run = this.run;
    if (run.tutorial) {
      // Учебную ночь можно переиграть или пропустить — настоящий забег не трогаем
      this.overlay = modal(
        [
          h('p.modal-text', null, t('tut.lost')),
          h('div.row.center.wrap', null, [
            button(t('tut.skip'), () => this.app.skipTutorial(), { variant: 'ghost' }),
            button(t('tut.retry'), () => this.app.startTutorial('retry')),
          ]),
        ],
        { title: t('over.lostTitle'), dismissable: false, className: 'narrow' },
      );
      return;
    }
    const night = run.night;
    const reached = t('over.reached', { ante: run.ante, night: t(`night.${night?.kind ?? 'dusk'}`) });
    const isRecord = run.stats.bestPlacement > this.app.bestBefore && run.stats.bestPlacement > 0;
    const short = night ? Math.max(0, night.target - night.score) : 0;
    this.overlay = modal(
      [
        h('div.over-sub', null, reached),
        night ? h('div.over-score', null, `${num(night.score)} / ${num(night.target)}`) : null,
        short ? h('p.over-short', null, t('over.short', { n: num(short) })) : null,
        isRecord ? h('div.badge.record', null, t('over.newRecord', { n: num(run.stats.bestPlacement) })) : null,
        h('p.over-tip', null, lostTip(run)),
        statsGrid(run),
        canRevive(run) && (this.app.adFree || this.app.platform.rewardedAvailable)
          ? h('div.row.center', null, this.adButton(t('ads.revive'), () => this.app.revive(), 'primary'))
          : null,
        h('div.row.gap.center.wrap', null, [
          run.daily ? button(t('over.share'), () => this.share(), { variant: 'secondary' }) : null,
          button(t('over.menu'), () => this.app.abandonRun(), { variant: 'secondary' }),
          button(t('over.again'), () => {
            this.overlay?.close();
            this.app.startRun(run.skyId);
          }),
        ].filter(Boolean) as HTMLElement[]),
      ],
      { title: t('over.lostTitle'), dismissable: false, className: 'over' },
    );
  }

  private showVictory(): void {
    const run = this.run;
    this.overlay = modal(
      [
        screenTitle(t('over.winTitle')),
        h('p.over-sub', null, t('over.winSub', { sky: named('sky', run.skyId).name, stake: (run.stake ?? 0) ? `✦${run.stake}` : t('menu.stakeNormal') })),
        run.stats.bestPlacement > this.app.bestBefore ? h('div.badge.record', null, t('over.newRecord', { n: num(run.stats.bestPlacement) })) : null,
        statsGrid(run),
        h('div.row.gap.center.wrap', null, [
          run.daily ? button(t('over.share'), () => this.share(), { variant: 'secondary' }) : null,
          button(t('over.menu'), () => this.app.abandonRun(), { variant: 'secondary' }),
          button(t('over.endless'), () => {
            this.overlay?.close();
            this.overlay = null;
            this.app.continueEndless();
          }, { variant: 'secondary', sub: t('over.endlessSub') }),
          // Главное после победы — следующий забег
          button(t('over.again'), () => {
            this.overlay?.close();
            this.app.startRun(run.skyId, false, run.stake ?? 0);
          }),
        ].filter(Boolean) as HTMLElement[]),
      ],
      { dismissable: false, className: 'over victory' },
    );
  }

  /** Кнопка «за рекламу»: блокируется на время ролика, при неудаче — подсказка. */
  private adButton(label: string, action: () => Promise<boolean>, variant: 'primary' | 'secondary' = 'secondary'): HTMLButtonElement {
    // С атласом «второй шанс» без ролика — кнопка без значка рекламы
    const free = this.app.adFree && label === t('ads.revive');
    const btn = button(free ? label : `▶ ${label}`, async () => {
      btn.disabled = true;
      const ok = await action();
      if (!ok) {
        btn.disabled = false;
        toast(t('ads.failed'), 'warn');
      }
    }, { variant, sub: free ? t('ads.atlasFree') : t('ads.watch'), className: 'ad-btn' });
    return btn;
  }

  private share(): void {
    const run = this.run;
    const text = t('share.text', { date: `#${dailyNumber(run.dailyDate ?? new Date())}`, ante: run.ante, best: num(run.stats.bestPlacement) });
    const stars = '✦'.repeat(Math.min(8, run.ante)) + '·'.repeat(Math.max(0, 8 - run.ante));
    const full = `${text}\n${stars}`;
    if (this.app.platform.share?.(full)) return;
    if (navigator.share) {
      void navigator.share({ text: full }).catch(() => undefined);
    } else {
      void navigator.clipboard?.writeText(full).then(() => toast(t('over.copied')));
    }
  }

  /** Используется картой созвездия — иконка Затмения. */
  static bossIcon(id: string, size = 48): HTMLCanvasElement {
    return canvasImg(bossSigil(id, size, dpr()), size);
  }
}

/** Совет после поражения: что попробовать в следующий раз — по тому, как прошёл забег. */
function lostTip(run: RunState): string {
  const n = run.night;
  if (n && n.burnsLeft > 0) return t('over.tipBurns', { n: n.burnsLeft });
  if (run.stats.crosses === 0) return t('over.tipCross');
  if (run.omens.length < 2) return t('over.tipOmens');
  return t('over.tipOrder');
}
