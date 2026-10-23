import { assertNever } from '@/core/errors';
import { canDoubleReward, canRevive } from '@/core/run';
import { misorderedOmens } from '@/core/omen-order';
import type { GameEvent, RunState } from '@/core/types';
import type { App, Screen } from '@/game/app';
import { NightScene } from '@/game/night/scene';
import { challengeOf, challengeScore, compareToChallenge, encodeChallenge } from '@/game/challenge';
import { COLLECTIBLE_COMBOS, dailyNumber } from '@/meta/profile';
import { track } from '@/analytics';
import { named, num, t } from '@/i18n';
import { h } from '../dom';
import { Hud } from '../hud';
import { announceDiscovery, clearDiscovery, whenDiscoveryDone } from '../discovery';
import { clearCoach, coach, dropCoach, setCoachDock } from '../tutorial';
import { button, confirmDialog, modal, toast, type ModalHandle, withCoin } from '../widgets';
import { showCombos, showDeck, showHelp, showSettings } from './common';
import { icon } from '../icons';
import { hasJourney, journeyCard } from '../journey';
import { chapterChain, lightButton, sceneRibbon, sceneRows, sceneTally, sceneWindow, statsTable } from '../scene-window';

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
        act: (a) => this.app.runs.act(a),
        onSettled: (events) => this.settled(events),
        onSelect: (i) => {
          this.hud.setBurnEnabled(i !== null && (this.run.night?.burnsLeft ?? 0) > 0);
          const n = this.run.night;
          this.hud.setCardInfo(i !== null && n ? (n.hand[i] ?? null) : null, n?.rules.hideRanks);
        },
        wide: this.app.features.wideDesktop ? wideVariant() : null,
      });
      this.scene.build();
      const scene = this.scene;
      setCoachDock(() => {
        if (this.scene !== scene) return null;
        const hand = scene.handAreaRect();
        const board = scene.layout.board;
        return { handTop: hand.y, boardBottom: board.y + board.h, board, hand };
      });
      this.app.runs.tutorial?.emit({ type: 'night', scene: this.scene, hud: this.hud });
      const n = this.run.night;
      const fresh = n.placements === 0 && n.burnsLeft === n.rules.burns && n.result === 'playing';
      if (fresh) {
        const scene = this.scene;
        void scene.dealIn().then(() => {
          // Пока карты летели, экран могли закрыть (забег брошен, фаза сменилась): ночи уже нет
          if (scene.isDestroyed || !this.run.night) return;
          this.app.runs.tutorial?.emit({ type: 'dealt' });
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
    if (focus) showHelp({ focus, levels: this.run.comboLevels, found: this.app.profile.combosFound, profile: this.app.profile });
    else showCombos(this.run, this.app.profile.combosFound, true);
    const p = this.app.profile;
    if (!p.tutorial.includes('guideSeen')) {
      p.tutorial.push('guideSeen');
      this.app.runs.persistProfile();
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
    this.app.runs.tutorial?.emit({ type: 'settled', events });
    this.announceMove(events);
    this.discover();
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

  /** Скринридеру — итог хода: что вспыхнуло, сколько очков, сколько осталось. */
  private announceMove(events: GameEvent[]): void {
    const n = this.run.night;
    if (!n) return;
    const ignite = events.find((e) => e.t === 'ignite');
    const head = ignite && ignite.t === 'ignite'
      ? t('a11y.ignite', { combos: ignite.score.lines.map((l) => t(`combo.${l.combo}`)).join(' + '), total: num(ignite.score.total) })
      : '';
    this.hud.announce(`${head} ${t('a11y.status', { score: num(n.score), target: num(n.target), moves: n.movesLeft })}`.trim());
  }

  /**
   * Коллекция: впервые собранное созвездие и первый крест — маленький праздник. Записал
   * находку контроллер забега (`meta/progress.ts`), экран только празднует её.
   */
  private discover(): void {
    const found = this.app.runs.takeDiscovery();
    if (!found) return;
    const p = this.app.profile;
    const banners: Parameters<typeof announceDiscovery>[0] = [];
    for (const id of found.combos) {
      const count = p.combosFound!.length - found.combos.length + found.combos.indexOf(id) + 1;
      banners.push({ kind: 'combo', id, count });
      track('combo_found', { combo: id, count, ante: this.run.ante });
    }
    if (found.cross) {
      banners.push({ kind: 'cross' });
      track('combo_found', { combo: 'cross', count: p.combosFound!.length, ante: this.run.ante });
    }
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
      case 'map':
      case 'night':
      case 'shop':
        return;
      default:
        return assertNever(this.run.phase, 'phase');
    }
  }

  // ─── Пауза ──────────────────────────────────────────────────────────────

  /** Пауза — нижний лист (в ландшафте — панель слева): где ты, «Продолжить» и служебное. */
  private pause(): void {
    const n = this.run.night;
    const m = modal(
      [
        n ? h('p.pause-where', null, [
          `${t('night.constellation', { n: this.run.ante })} · ${t(`night.${n.kind}`)} · `,
          h('b', null, num(n.score)),
          ` ${t('over.of', { target: num(n.target) })} · ${t('map.moves')} ${n.movesLeft}`,
        ]) : null,
        h('div.pause-acts', null, [
          button(t('pause.resume'), () => m.close()),
          h('div.scene-lights', null, [
            lightButton('guide', t('pause.help'), () => showHelp({ levels: this.run.comboLevels, found: this.app.profile.combosFound, profile: this.app.profile })),
            lightButton('settings', t('settings.title'), () => showSettings(this.app, () => this.hud.sync(this.run, { score: false }))),
          ]),
          h('div.scene-lights', null, lightButton('flag', t('pause.abandon'), () => confirmDialog(t('pause.abandonConfirm'), () => {
            m.close();
            this.app.runs.abandonRun();
          }, 'danger', { yes: t('pause.abandon'), no: t('pause.keepPlaying') }), true)),
        ]),
      ],
      { title: t('pause.title'), sheet: true, className: 'pause' },
    );
  }

  // ─── Итоги: «Сцена» ─────────────────────────────────────────────────────

  private showReward(): void {
    const reward = this.run.reward!;
    const night = this.run.night!;
    const rows: [string, number][] = [
      [t('reward.base'), reward.base],
      [t('reward.moves'), reward.moves],
      [t('reward.burns'), reward.burns],
      [t('reward.interest'), reward.interest],
    ];
    const shown = rows.filter(([, value], i) => value > 0 || i === 0);
    shown.forEach((_, i) => window.setTimeout(() => this.app.svc.audio.coin(), 200 + i * 120));
    const chips = sceneRows(shown.map(([label, value]) => [label, `+${value}`]), { gold: true, total: [t('reward.total'), `+${reward.total}`] });
    // Авторский момент: золото набегает до итога (в «Меньше движения» — сразу итог)
    const count = h('span', null, `+${reward.total}`);
    const calm = this.app.settings.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!calm && reward.total > 1) {
      let n = 0;
      count.textContent = '+0';
      const step = Math.max(40, Math.min(90, 700 / reward.total));
      const tick = () => {
        n += 1;
        count.textContent = `+${n}`;
        if (n < reward.total && count.isConnected) window.setTimeout(tick, step);
      };
      window.setTimeout(tick, 420);
    }
    const scene = sceneWindow({
      className: 'reward',
      label: t('reward.title'),
      mid: [
        sceneRibbon(t('reward.title'), t('reward.sub', { night: t(`night.${night.kind}`), score: num(night.score), target: num(night.target) })),
        h('div.scene-gold', null, [h('span.coin'), count]),
        chips,
      ],
      acts: [
        button(withCoin(t('reward.collect', { n: reward.total })), () => {
          this.overlay?.close();
          this.overlay = null;
          this.app.runs.collectReward();
        }),
        this.app.platform.rewardedAvailable && canDoubleReward(this.run)
          ? this.adButton(t('ads.double'), async () => {
              if (await this.app.runs.doubleReward()) {
                this.overlay?.close();
                this.overlay = null;
                this.showReward();
                return true;
              }
              return false;
            })
          : null,
      ],
    });
    this.overlay = scene;
    this.app.runs.tutorial?.emit({ type: 'reward', panel: scene.acts });
  }

  private showGameOver(): void {
    const run = this.run;
    if (run.tutorial) {
      // Учебную ночь можно переиграть или пропустить — настоящий забег не трогаем
      this.overlay = sceneWindow({
        className: 'over',
        label: t('over.lostTitle'),
        mid: [sceneRibbon(t('over.lostTitle'), t('tut.lost'), true)],
        acts: [
          button(t('tut.retry'), () => this.app.runs.startTutorial('retry')),
          h('div.scene-lights', null, lightButton('flag', t('tut.skip'), () => this.app.runs.skipTutorial(), true)),
        ],
      });
      return;
    }
    const night = run.night;
    const reached = t('over.reached', { ante: run.ante, night: t(`night.${night?.kind ?? 'dusk'}`) });
    const isRecord = run.stats.bestPlacement > this.app.runs.bestBefore && run.stats.bestPlacement > 0;
    const revive = canRevive(run) && (this.app.money.adFree || this.app.platform.rewardedAvailable);
    const again = () => {
      this.overlay?.close();
      this.app.runs.startRun(run.skyId);
    };
    // Тот же расклад: те же карты в том же порядке — понять, где можно было сыграть лучше.
    // Вызов дня и так один на всех, у него своё «ещё раз» из архива
    const same = run.daily
      ? null
      : button(h('span.btn-row', null, [icon('same'), t('over.sameDeal')]), () => {
          this.overlay?.close();
          this.app.runs.startRun(run.skyId, false, run.stake ?? 0, run.seed);
        }, { variant: 'secondary' });
    const share = run.daily ? button(h('span.btn-row', null, [icon('share'), t('over.share')]), () => this.share(), { variant: 'secondary' }) : null;
    // Главная — «Второй шанс», если он есть (решение Дениса); иначе «Ещё забег»
    const primary = revive
      ? this.adButton(t('ads.revive'), () => this.app.runs.revive(), 'primary')
      : button(h('span.btn-row', null, [icon('again'), t('over.again')]), again);
    const pair = [revive ? button(h('span.btn-row', null, [icon('again'), t('over.again')]), again, { variant: 'secondary' }) : null, same ?? share].filter(Boolean) as HTMLElement[];
    const path = hasJourney(run) ? journeyCard(run, run.daily ? null : () => this.sendChallenge(false)) : null;
    this.overlay = sceneWindow({
      className: `over${path ? ' with-path' : ''}`,
      label: t('over.lostTitle'),
      mid: [
        sceneRibbon(t('over.lostTitle'), run.daily ? `${t('menu.daily')} · ${reached}` : reached, true),
        path,
        night ? sceneTally(night.score, night.target) : null,
        isRecord ? sceneRows([[t('over.record'), num(run.stats.bestPlacement)]], { gold: true }) : null,
        this.challengeVersus(false),
        h('p.scene-tip', null, [icon('bulb'), h('span', null, lostTip(run))]),
        statsTable(run),
      ],
      acts: [
        primary,
        pair.length ? h(`div.scene-pair${pair.length === 1 ? '.one' : ''}`, null, pair) : null,
        h('div.scene-lights', null, [
          run.daily ? null : this.challengeLight(false),
          lightButton('home', t('over.menu'), () => this.app.runs.abandonRun(), true),
        ]),
      ],
    });
    this.placePath(path);
  }

  /** На ПК открытка «Мой путь» — отдельной колонкой слева от итогов (крупно и читаемо). */
  private placePath(path: HTMLElement | null): void {
    if (!path || !this.overlay || !matchMedia('(min-width: 900px) and (min-height: 561px)').matches) return;
    this.overlay.el.querySelector('.scene-inner')?.prepend(path);
  }

  private showVictory(): void {
    const run = this.run;
    const stake = run.stake ?? 0;
    const path = hasJourney(run) ? journeyCard(run, run.daily ? null : () => this.sendChallenge(true)) : null;
    this.overlay = sceneWindow({
      className: `over victory${path ? ' with-path' : ''}`,
      label: t('over.winTitle'),
      mid: [
        path ? null : chapterChain(),
        sceneRibbon(t('over.winTitle'), t('over.winSub', { sky: named('sky', run.skyId).name, stake: stake ? t('map.stake', { n: stake }) : t('menu.stakeNormal') })),
        path,
        run.stats.bestPlacement > this.app.runs.bestBefore ? sceneRows([[t('over.record'), num(run.stats.bestPlacement)]], { gold: true }) : null,
        this.challengeVersus(true),
        statsTable(run),
      ],
      acts: [
        // Главное после победы — следующий забег
        button(h('span.btn-row', null, [icon('again'), t('over.again')]), () => {
          this.overlay?.close();
          this.app.runs.startRun(run.skyId, false, stake);
        }),
        button(h('span.btn-row', null, [icon('infinity'), t('over.endless')]), () => {
          this.overlay?.close();
          this.overlay = null;
          this.app.runs.continueEndless();
        }, { variant: 'secondary', sub: t('over.endlessSub') }),
        h('div.scene-lights', null, [
          run.daily ? lightButton('share', t('over.share'), () => this.share()) : this.challengeLight(true),
          lightButton('home', t('over.menu'), () => this.app.runs.abandonRun(), true),
        ]),
      ],
    });
    this.placePath(path);
  }

  /** Кнопка «за рекламу»: блокируется на время ролика, при неудаче — подсказка. */
  private adButton(label: string, action: () => Promise<boolean>, variant: 'primary' | 'secondary' = 'secondary'): HTMLButtonElement {
    // С атласом «второй шанс» без ролика — кнопка без значка рекламы
    const free = this.app.money.adFree && label === t('ads.revive');
    const btn = button(h('span.btn-row', null, [free ? null : icon('play', 'icon ad-mark'), label]), async () => {
      btn.disabled = true;
      const ok = await action();
      if (!ok) {
        btn.disabled = false;
        toast(t('ads.failed'), 'warn');
      }
    }, { variant, sub: free ? t('ads.atlasFree') : t('ads.watch'), className: 'ad-btn' });
    return btn;
  }

  /** Забег по вызову друга: кто кого — его итог и свой. */
  private challengeVersus(won: boolean): HTMLElement | null {
    const c = this.run.challenge;
    if (!c) return null;
    const ante = won ? 9 : this.run.ante;
    const best = this.run.stats.bestPlacement;
    const outcome = compareToChallenge(c, ante, best);
    return h(`div.challenge-vs.${outcome > 0 ? 'beat' : outcome < 0 ? 'behind' : 'tie'}`, null, [
      h('div.challenge-vs-title', null, t(outcome > 0 ? 'challenge.beat' : outcome < 0 ? 'challenge.behind' : 'challenge.tie')),
      h('div', null, t('challenge.them', { score: challengeScore(c.ante, c.best) })),
      h('div', null, t('challenge.you', { score: challengeScore(ante, best) })),
    ]);
  }

  /** «Бросить вызов»: ссылка на тот же расклад со своим итогом. В вызове дня — обычное «Поделиться». */
  private challengeLight(won: boolean): HTMLElement | null {
    if (this.run.tutorial) return null;
    return lightButton('duel', t(this.run.challenge ? 'challenge.answer' : 'challenge.send'), () => this.sendChallenge(won));
  }

  private sendChallenge(won: boolean): void {
    const c = challengeOf(this.run, won);
    const param = encodeChallenge(c);
    const text = t('challenge.shareText', { score: challengeScore(c.ante, c.best) });
    track('challenge_share', { ante: c.ante, best: c.best, won });
    if (this.app.platform.share?.(text, param)) return;
    const url = this.app.platform.inviteUrl?.(param) ?? `${location.origin}${location.pathname}?startapp=${param}`;
    if (navigator.share) {
      void navigator.share({ text, url }).catch(() => undefined);
    } else {
      void navigator.clipboard?.writeText(`${text}\n${url}`).then(() => toast(t('over.copied')));
    }
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
}

/** Совет после поражения: что попробовать в следующий раз — по тому, как прошёл забег. */
function lostTip(run: RunState): string {
  const n = run.night;
  if (n && n.burnsLeft > 0) return t('over.tipBurns', { n: n.burnsLeft });
  if (run.stats.crosses === 0) return t('over.tipCross');
  if (run.omens.length < 2) return t('over.tipOmens');
  return t('over.tipOrder');
}

/** Вариант раскладки широкого ПК для витрины CQ.5: в разработке — `?pc=`, иначе `a`. */
function wideVariant(): 'a' | 'b' | 'c' {
  const v = import.meta.env.DEV ? new URLSearchParams(location.search).get('pc') : null;
  return v === 'b' || v === 'c' ? v : 'a';
}
