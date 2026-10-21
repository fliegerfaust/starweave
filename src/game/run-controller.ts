import { forgetClientId, track } from '@/analytics';
import { RuleError } from '@/core/errors';
import { apply, newLoggedRun, type Command } from '@/core/commands';
import { GIFT_GOLD_CAP, canDoubleReward, canRevive } from '@/core/run';
import { deserializeRun, serializeRun } from '@/core/save';
import { applyTutorialNight, newTutorialRun, tutorialShop } from '@/core/tutorial';
import type { GameEvent, RunState } from '@/core/types';
import { named, t } from '@/i18n';
import { dailySeed, todayKey, loadProfile, markDailyStarted, unrecordRunEnd, markSeen, recordProgress, recordRunEnd, saveProfile } from '@/meta/profile';
import { KEYS, storage } from '@/meta/storage';
import { TutorialDirector } from '@/tutorial/director';
import { clearCoach } from '@/ui/tutorial';
import { toast } from '@/ui/widgets';
import type { App } from './app';
import { compareToChallenge, type Challenge } from './challenge';
import type { NightAction } from './night/scene';

/**
 * Забег от старта до итогов: команды ядра, запись итогов в профиль, сохранение на
 * устройство и в облако площадки, учебный забег. UI меняет забег только через этот класс.
 */
export class RunController {
  run: RunState | null = deserializeRun(storage.get(KEYS.run));
  /** Рекорд хода до записи итогов забега — окно итогов сравнивает с ним честно. */
  bestBefore = 0;
  tutorial: TutorialDirector | null = null;
  private cloudTimer = 0;

  constructor(private readonly app: App) {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      this.save();
      this.flushCloudSave();
    });
  }

  private route(): void {
    void this.app.router.route();
  }

  get hasSave(): boolean {
    return !!this.run && !this.run.tutorial && this.run.phase !== 'gameOver' && this.run.phase !== 'victory';
  }

  // ─── Старт ──────────────────────────────────────────────────────────────

  /** Старый забег перед новым: обучение возвращает настоящее сохранение, брошенный засчитывается сданным. */
  private closeCurrent(): void {
    if (this.run?.tutorial) this.endTutorial();
    if (this.hasSave && this.run) recordRunEnd(this.app.profile, this.run, false);
  }

  /** `seed` — переиграть тот же расклад (после поражения); иначе случайный. */
  startRun(skyId: string, daily = false, stake = 0, seed?: number): void {
    const { profile } = this.app;
    this.closeCurrent();
    if (daily) markDailyStarted(profile);
    this.persistProfile();
    const runSeed = daily ? dailySeed() : (seed ?? (Math.random() * 2 ** 32) >>> 0);
    // Самый первый забег начинается со щедрой ночи и с тем, что заработано в обучении
    const gentle = !daily && profile.runs === 0;
    const gift = gentle ? profile.tutorialGift : undefined;
    this.run = newLoggedRun({ seed: runSeed, skyId, daily, dailyDate: daily ? todayKey() : undefined, stake: daily ? 0 : stake, gentle, gift });
    // Подарок — один раз: в первый забег или никогда (первым сыгран вызов дня)
    if (!daily || profile.runs > 0) delete profile.tutorialGift;
    track('run_start', { sky: skyId, stake: daily ? 0 : stake, daily, gentle, gift: !!gift, replay: seed !== undefined });
    this.save();
    this.route();
  }

  /**
   * Вызов друга: тот же сид, небо и звёздность, что были у него. Без щедрой первой ночи
   * и без подарка обучения — иначе расклад другой и сравнивать нечестно. Подарок не тратится.
   */
  startChallenge(c: Challenge): void {
    this.closeCurrent();
    this.persistProfile();
    this.run = newLoggedRun({ seed: c.seed, skyId: c.skyId, stake: c.stake });
    this.run.challenge = { ante: c.ante, best: c.best };
    track('challenge_accept', { ante: c.ante, best: c.best });
    track('run_start', { sky: c.skyId, stake: c.stake, daily: false, challenge: true });
    this.save();
    this.route();
  }

  /** Вызов прошедшего дня из архива атласа: тот же сид, что был в тот день. */
  startArchive(date: string): void {
    this.closeCurrent();
    this.persistProfile();
    this.run = newLoggedRun({ seed: dailySeed(date), skyId: 'classic', daily: true, dailyDate: date, archive: true });
    track('run_start', { sky: 'classic', stake: 0, daily: true, archive: true });
    this.save();
    this.route();
  }

  // ─── Ход забега ─────────────────────────────────────────────────────────

  /** Кнопки фаз могут нажать дважды, пока закрывается модалка: второе нажатие — тихо игнорируем. */
  private guarded(fn: () => void): boolean {
    // Забега уже нет (обучение закончилось, пока на экране висело его окно) — кнопке нечего делать
    if (!this.run) return false;
    try {
      fn();
      return true;
    } catch (e) {
      if (!(e instanceof RuleError)) throw e;
      return false;
    }
  }

  beginNight(): void {
    this.guarded(() => this.doBeginNight());
  }

  private doBeginNight(): void {
    const run = this.run!;
    apply(run, { c: 'startNight' });
    if (run.tutorial) applyTutorialNight(run, run.chapter.at);
    else track('night_start', { ante: run.ante, night: run.night!.kind, boss: run.night!.bossId ?? '', gentle: !!run.night!.gentle });
    markSeen(this.app.profile, run);
    this.persistProfile();
    this.save();
    this.route();
  }

  /** Действие ночи. Ошибки правил превращаются в подсказку. */
  act(action: NightAction): GameEvent[] | null {
    const run = this.run;
    if (!run) return null;
    try {
      const events = apply(run, action.kind === 'place' ? { c: 'place', hand: action.handIndex, cell: action.cell } : { c: 'burn', hand: action.handIndex });
      this.afterAction(events);
      return events;
    } catch (e) {
      if (e instanceof RuleError) {
        toast(t(`errors.${e.code}`), 'warn');
        return null;
      }
      throw e;
    }
  }

  private afterAction(events: GameEvent[]): void {
    const run = this.run!;
    const lost = events.some((e) => e.t === 'nightLost');
    const won = events.some((e) => e.t === 'nightWon');
    if ((lost || won) && !run.tutorial) this.trackNightEnd(won);
    if (run.tutorial) {
      // Учебную ночь проиграть почти нельзя, но если вышло — начинаем обучение заново
      return;
    }
    if (lost) {
      this.trackRunEnd('lost');
      this.bestBefore = this.app.profile.bestPlacement;
      const fresh = recordRunEnd(this.app.profile, run, false);
      this.persistProfile();
      this.announceUnlocks(fresh);
      storage.remove(KEYS.run);
      return;
    }
    this.save();
  }

  private trackNightEnd(won: boolean): void {
    const run = this.run!;
    const n = run.night!;
    track('night_end', {
      ante: run.ante,
      night: n.kind,
      boss: n.bossId ?? '',
      won,
      score: n.score,
      target: n.target,
      ratio: Math.round((n.score / n.target) * 100) / 100,
      moves_left: n.movesLeft,
      burns_left: n.burnsLeft,
      lines: n.linesIgnited,
    });
  }

  private trackRunEnd(result: 'lost' | 'abandon' | 'victory'): void {
    const run = this.run!;
    track('run_end', {
      result,
      ante: run.ante,
      nights: run.stats.nightsWon,
      lines: run.stats.linesIgnited,
      best: run.stats.bestPlacement,
      crosses: run.stats.crosses,
      omens: run.omens.map((o) => o.id).join(','),
    });
    if (run.challenge && result !== 'abandon') {
      const ante = result === 'victory' ? 9 : run.ante;
      const c = run.challenge;
      track('challenge_result', { ante, best: run.stats.bestPlacement, their_ante: c.ante, their_best: c.best, outcome: compareToChallenge(c, ante, run.stats.bestPlacement) });
    }
  }

  collectReward(): void {
    this.guarded(() => this.doCollectReward());
  }

  private doCollectReward(): void {
    const run = this.run!;
    apply(run, { c: 'collectReward' });
    if (run.tutorial) run.shop = tutorialShop();
    this.save();
    this.route();
  }

  leaveShop(): void {
    this.guarded(() => this.doLeaveShop());
  }

  private doLeaveShop(): void {
    const run = this.run!;
    const { profile } = this.app;
    apply(run, { c: 'leaveShop' });
    if (run.tutorial) {
      // В обучении карту созвездия пропускаем — сразу вторая ночь
      this.doBeginNight();
      return;
    }
    if (run.phase === 'victory') {
      this.trackRunEnd('victory');
      this.bestBefore = profile.bestPlacement;
      const fresh = recordRunEnd(profile, run, true);
      this.announceUnlocks(fresh);
    } else {
      this.announceUnlocks(recordProgress(profile, run));
    }
    this.persistProfile();
    this.save();
    // Межстраничная реклама — только в паузе между созвездиями
    const ad = run.phase === 'map' && run.chapter.at === 0 ? this.app.money.interstitialBetweenAntes() : null;
    if (ad) {
      void ad.then(() => this.route());
      return;
    }
    this.route();
  }

  /** Действие в Обсерватории: ошибки правил — подсказкой, успех — сохранение. */
  shopAction(cmd: Command): boolean {
    const run = this.run;
    if (!run) return false;
    try {
      apply(run, cmd);
      this.save();
      return true;
    } catch (e) {
      if (e instanceof RuleError) {
        toast(t(`errors.${e.code}`), 'warn');
        return false;
      }
      throw e;
    }
  }

  continueEndless(): void {
    if (!this.guarded(() => apply(this.run!, { c: 'continueEndless' }))) return;
    this.save();
    this.route();
  }

  abandonRun(): void {
    if (this.run?.tutorial) return this.skipTutorial();
    if (this.run && this.run.phase !== 'gameOver' && this.run.phase !== 'victory') {
      this.trackRunEnd('abandon');
      recordRunEnd(this.app.profile, this.run, false);
      this.persistProfile();
    }
    this.run = null;
    storage.remove(KEYS.run);
    void this.app.router.goMenu();
  }

  /** Второй шанс после поражения — за просмотр рекламы. */
  async revive(): Promise<boolean> {
    const run = this.run;
    if (!run || !canRevive(run)) return false;
    const ok = this.app.money.adFree || (await this.app.money.rewarded('revive'));
    if (!ok || !canRevive(run)) return false;
    apply(run, { c: 'revive' });
    // Поражение уже записали в профиль — забег продолжается, запись отменяем
    unrecordRunEnd(this.app.profile, run);
    this.persistProfile();
    this.save();
    this.route();
    return true;
  }

  /** Удвоить награду ночи — за просмотр рекламы. */
  async doubleReward(): Promise<boolean> {
    const run = this.run;
    if (!run || !canDoubleReward(run)) return false;
    const ok = await this.app.money.rewarded('double_reward');
    if (!ok || !canDoubleReward(run)) return false;
    apply(run, { c: 'doubleReward' });
    this.save();
    return true;
  }

  private announceUnlocks(ids: string[]): void {
    for (const id of ids) {
      window.setTimeout(() => toast(t('over.unlocked', { name: named('sky', id).name })), 600);
    }
  }

  // ─── Сохранения ─────────────────────────────────────────────────────────

  save(): void {
    const run = this.run;
    if (!run || run.phase === 'gameOver' || run.tutorial) return;
    storage.set(KEYS.run, serializeRun(run));
    this.scheduleCloudSave();
  }

  /** Профиль на устройство и (с задержкой) в облако площадки. */
  persistProfile(): void {
    saveProfile(this.app.profile);
    this.scheduleCloudSave();
  }

  /** Облачное сохранение площадки — не чаще раза в пару секунд. */
  scheduleCloudSave(): void {
    window.clearTimeout(this.cloudTimer);
    this.cloudTimer = window.setTimeout(() => this.flushCloudSave(), 2000);
  }

  /** Отправить в облако сразу (вкладку сворачивают — таймер может не дожить). */
  private flushCloudSave(): void {
    window.clearTimeout(this.cloudTimer);
    const data: Record<string, string> = {};
    for (const key of [KEYS.run, KEYS.profile, KEYS.settings]) {
      const value = storage.get(key);
      if (value) data[key] = value;
    }
    void this.app.platform.cloudSave(data);
  }

  resetProgress(): void {
    storage.remove(KEYS.run);
    storage.remove(KEYS.profile);
    forgetClientId();
    window.clearTimeout(this.cloudTimer);
    void this.app.platform.cloudSave({});
    this.run = null;
    this.app.profile = loadProfile();
    void this.app.router.goMenu();
  }

  // ─── Обучение ───────────────────────────────────────────────────────────

  /** Учебный забег не трогает сохранённый настоящий: тот вернётся после обучения. */
  startTutorial(source: 'offer' | 'menu' | 'retry' = 'menu'): void {
    track('tutorial_start', { source });
    // Обучение ведёт сам режиссёр — плашки первых забегов ему мешают
    clearCoach();
    this.tutorial?.stop();
    document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
    this.run = newTutorialRun();
    this.tutorial = new TutorialDirector(this.app);
    this.tutorial.start();
    this.doBeginNight();
  }

  private endTutorial(): void {
    this.tutorial?.stop();
    this.tutorial = null;
    this.app.profile.tutorialDone = true;
    this.persistProfile();
    this.run = deserializeRun(storage.get(KEYS.run));
  }

  skipTutorial(): void {
    const at = this.tutorial?.progress ?? { step: '', index: 0 };
    track('tutorial_skip', at);
    this.endTutorial();
    void this.app.router.goMenu();
  }

  /** Обучение пройдено: поздравление и старт настоящего забега. */
  finishTutorial(): void {
    track('tutorial_complete', {});
    const { profile } = this.app;
    profile.tutorialFinished = true;
    // Золото обучения (с несобранной наградой) ждёт первого настоящего забега;
    // Знамения игрок заработает там сам
    const tut = this.run;
    if (tut?.tutorial && profile.runs === 0) {
      profile.tutorialGift = { gold: Math.min(GIFT_GOLD_CAP, tut.gold + (tut.reward?.total ?? 0)) };
    }
    this.endTutorial();
    // Окно награды учебной ночи ещё открыто: под «Обучение пройдено» его кнопка «Забрать»
    // оставалась нажимаемой и вела в уже несуществующий забег (js_error 14.10.2026)
    document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
    this.app.svc.audio.win();
    void import('@/ui/screens/tutorial-done').then(({ showTutorialDone }) => showTutorialDone(this.app));
  }
}
