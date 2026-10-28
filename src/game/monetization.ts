import { setCardBack } from '@/art/card';
import { SKY_THEMES, isFreeCosmetic, skyTheme } from '@/art/cosmetics';
import { track } from '@/analytics';
import type { AdOutcome, Platform, PurchaseResult } from '@/platform';
import { Entitlements } from '@/store/entitlements';
import { interstitialAllowed } from './ad-pacing';
import type { App } from './app';

/**
 * Деньги игры: покупки площадки, внешний вид за покупки и реклама. Здесь же — тишина,
 * пока идёт реклама или окно оплаты: требование порталов.
 */
export class Monetization {
  /** Купленное на этой площадке: атлас, внешний вид. */
  readonly purchases = new Entitlements();
  /** Идёт реклама или окно оплаты — звук молчит. */
  adPlaying = false;
  /** Звук выключил сайт площадки (CrazyGames) — сильнее настроек игры. */
  private platformMuted = false;
  /** Когда в этой сессии была последняя реклама — межстраничная выдерживает паузу после неё. */
  private lastAdAt: number | null = null;

  constructor(private readonly app: App) {
    // Площадка без магазина (CrazyGames) выдаёт атлас и внешний вид даром
    if (this.platform.grants) this.purchases.grant(this.platform.grants);
    // Покупка или возврат меняют, что можно носить
    this.purchases.onChange(() => this.applyCosmetics());
    this.platform.onPauseChange((paused) => {
      this.adPlaying = paused;
      this.syncMute();
    });
    this.platform.onMuteChange?.((muted) => {
      this.platformMuted = muted;
      this.syncMute();
    });
    document.addEventListener('visibilitychange', () => this.syncMute());
  }

  private get platform(): Platform {
    return this.app.platform;
  }

  /** Без фокуса, во время рекламы и когда звук выключила площадка, игра молчит. */
  syncMute(): void {
    this.app.svc.audio.setMuted(document.hidden || this.adPlaying || this.platformMuted);
  }

  /** Сверить купленное с площадкой (возвраты, покупки с другого устройства). */
  async refreshPurchases(): Promise<void> {
    const list = await this.platform.payments?.owned().catch(() => null);
    if (list) this.purchases.replace(list);
  }

  /** Купить товар каталога средствами площадки. */
  async purchase(productId: string): Promise<PurchaseResult | 'unavailable'> {
    const payments = this.platform.payments;
    if (!payments) {
      track('purchase_result', { product: productId, result: 'unavailable' });
      return 'unavailable';
    }
    track('purchase_start', { product: productId });
    this.adPlaying = true;
    this.syncMute();
    const result = await payments.buy(productId).catch((): PurchaseResult => 'failed');
    this.adPlaying = false;
    this.syncMute();
    track('purchase_result', { product: productId, result });
    if (result === 'paid') this.purchases.add(productId);
    return result;
  }

  /** Можно ли носить предмет внешнего вида: бесплатный или куплен. */
  canWear(slot: 'back' | 'sky', id: string): boolean {
    return isFreeCosmetic(slot, id) || this.purchases.has(`${slot}:${id}`);
  }

  /** Выбранные рубашка и небо — если куплены, иначе обычные. */
  applyCosmetics(): void {
    const { settings } = this.app;
    const back = this.canWear('back', settings.cardBack) ? settings.cardBack : 'classic';
    setCardBack(back);
    const sky = this.canWear('sky', settings.skyTheme) ? settings.skyTheme : 'night';
    this.app.svc.starfield.setTheme(sky, skyTheme(sky).palette, SKY_THEMES.findIndex((t) => t.id === sky));
  }

  /** Купленный атлас убирает межстраничную рекламу и рекламу перед «вторым шансом». */
  get adFree(): boolean {
    return this.purchases.paid('atlas');
  }

  /** Реклама за награду с учётом в аналитике: награда — только за досмотренный ролик. */
  async rewarded(placement: string): Promise<boolean> {
    track('ad_request', { kind: 'rewarded', placement });
    this.lastAdAt = Date.now();
    const outcome = await this.platform.showRewarded().catch((): AdOutcome => ({ result: 'error' }));
    track('ad_result', { kind: 'rewarded', placement, ...outcome });
    return outcome.result === 'rewarded';
  }

  /**
   * Есть ли ролик за награду: без него кнопку не показываем (просьба Пикабу). Площадку
   * спрашиваем в начале ночи, к экрану награды ответ уже есть и окно не перестраивается.
   */
  rewardedReady = true;

  refreshRewarded(): void {
    if (!this.platform.rewardedAvailable || !this.platform.canShowRewarded) return;
    void this.platform.canShowRewarded().catch(() => false).then((ok) => (this.rewardedReady = ok));
  }

  /** Кнопку «за рекламу» показываем, только если ролик есть. */
  get rewardedOffer(): boolean {
    return this.platform.rewardedAvailable && this.rewardedReady;
  }

  /**
   * Межстраничная между созвездиями — только где она есть и по правилу частоты
   * (раньше событие уходило и из Telegram, где рекламы нет: «32 показа» в сводке).
   * `null` — показывать нечего.
   */
  interstitialBetweenAntes(ante: number): Promise<void> | null {
    if (this.adFree || !this.platform.interstitialAvailable) return null;
    if (!interstitialAllowed(Date.now(), ante, this.lastAdAt)) return null;
    track('ad_request', { kind: 'interstitial', placement: 'between_antes' });
    this.lastAdAt = Date.now();
    return this.platform.showInterstitial()
      .catch((): AdOutcome => ({ result: 'error' }))
      .then((outcome) => track('ad_result', { kind: 'interstitial', placement: 'between_antes', ...outcome }));
  }
}
