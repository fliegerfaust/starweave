import { t } from '@/i18n';
import { h } from './dom';
import { modal, toast } from './widgets';

/**
 * Отдать текст игроку: системное «Поделиться», иначе буфер обмена, иначе окно с уже
 * выделенным текстом. Во фрейме площадки (Пикабу) и share, и clipboard бывают запрещены
 * политикой фрейма — раньше кнопка тогда молча ничего не делала (PK.20).
 */
export async function shareText(text: string, url?: string): Promise<void> {
  if (navigator.share) {
    try {
      await navigator.share(url ? { text, url } : { text });
      return;
    } catch (e) {
      // Игрок сам закрыл системное окно — это ответ, а не поломка
      if ((e as Error | null)?.name === 'AbortError') return;
    }
  }
  const full = url ? `${text}\n${url}` : text;
  if (await copyText(full)) toast(t('over.copied'));
  else showCopyBox(full);
}

/**
 * Скопировать: сначала старым `execCommand` — он синхронный, работает в момент нажатия и не
 * подчиняется политике `clipboard-write`, которой нет во фрейме Пикабу; затем Clipboard API.
 */
async function copyText(text: string): Promise<boolean> {
  const focused = document.activeElement as HTMLElement | null;
  const area = h('textarea.copy-hidden', { value: text, readOnly: true, attrs: { 'aria-hidden': 'true' } });
  document.body.append(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  focused?.focus({ preventScroll: true });
  if (ok) return true;
  return navigator.clipboard?.writeText(text).then(() => true, () => false) ?? false;
}

/** Последний путь: текст в окне уже выделен — остаётся скопировать и отправить. */
function showCopyBox(text: string): void {
  const area = h('textarea.copy-box', { value: text, readOnly: true, rows: 3 });
  modal([h('p.modal-text', null, t('over.copyHint')), area], { title: t('over.share'), className: 'narrow' });
  // Поле по высоте текста: ссылка видна целиком, без прокрутки внутри поля
  area.style.height = `${area.scrollHeight + 2}px`;
  area.focus({ preventScroll: true });
  area.setSelectionRange(0, text.length);
}
