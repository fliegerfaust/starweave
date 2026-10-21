import { setCardBack } from '@/art/card';
import { SKY_THEMES, isFreeCosmetic, skyTheme } from '@/art/cosmetics';
import { track } from '@/analytics';
import type { Platform, PurchaseResult } from '@/platform';
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
  /** Когда в этой сессии была последняя реклама — межстраничная выдерживает паузу после неё. */
  private lastAdAt: number | null = null;

  constructor(private readonly app: App) {
    // Покупка или возврат меняют, что можно носить
    this.purchases.onChange(() => this.applyCosmetics());
    this.platform.onPauseChange((paused) => {
      this.adPlaying = paused;
      this.syncMute();
    });
    document.addEventListener('visibilitychange', () => this.syncMute());
  }

  private get platform(): Platform {
    return this.app.platform;
  }

  /** Без фокуса и во время рекламы игра молчит. */
  syncMute(): void {
    this.app.svc.audio.setMuted(document.hidden || this.adPlaying);
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

  /** Атлас убирает межстраничную рекламу и рекламу перед «вторым шансом». */
  get adFree(): boolean {
    return this.purchases.has('atlas');
  }

  /** Реклама за награду с учётом в аналитике. */
  async rewarded(placement: string): Promise<boolean> {
    track('ad_request', { kind: 'rewarded', placement });
    this.lastAdAt = Date.now();
    const ok = await this.platform.showRewarded().catch(() => false);
    track('ad_result', { kind: 'rewarded', placement, result: ok ? 'rewarded' : 'closed' });
    return ok;
  }

  /**
   * Межстраничная между созвездиями — только где она есть и по правилу частоты
   * (раньше событие уходило и из Telegram, где рекламы нет: «32 показа» в сводке).
   * `null` — показывать нечего.
   */
  interstitialBetweenAntes(): Promise<void> | null {
    if (this.adFree || !this.platform.interstitialAvailable) return null;
    if (!interstitialAllowed(Date.now(), this.app.profile.firstSeen ?? 0, this.lastAdAt)) return null;
    track('ad_request', { kind: 'interstitial', placement: 'between_antes' });
    this.lastAdAt = Date.now();
    return this.platform.showInterstitial();
  }
}
