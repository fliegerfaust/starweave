import { t } from '@/i18n';
import { closeKeyword } from '@/ui/keywords';
import { closeTopWindow, confirmDialog } from '@/ui/widgets';
import type { App } from './app';

/**
 * Системная кнопка «Назад» (APK.3): одно нажатие, один шаг. Сначала подсказка и окна, затем
 * шаг назад экрана (в ночи это пауза), а где шага нет, игра спрашивает, выйти ли из неё.
 */
export function handleBack(app: App): void {
  if (closeKeyword() || closeTopWindow() || app.router.back()) return;
  confirmDialog(t('pause.exitConfirm'), () => app.platform.exit?.(), 'danger', { yes: t('pause.exit'), no: t('pause.keepPlaying') });
}
