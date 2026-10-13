import { t } from '@/i18n';
import { h, type Child } from './dom';

type Sound = 'click' | 'deny' | 'hover';
let playSound: (s: Sound) => void = () => undefined;

/** Приложение подключает сюда звук — виджеты остаются независимы от аудио. */
export function setUiSound(fn: (s: Sound) => void): void {
  playSound = fn;
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function button(
  label: string | Node,
  onClick: () => void,
  opts: { variant?: ButtonVariant; disabled?: boolean; className?: string; title?: string; sub?: string } = {},
): HTMLButtonElement {
  const btn = h(`button.btn.btn-${opts.variant ?? 'primary'}`, { type: 'button', title: opts.title ?? '' }, [
    h('span.btn-label', null, label),
    opts.sub ? h('span.btn-sub', null, opts.sub) : null,
  ]);
  if (opts.className) btn.classList.add(...opts.className.split(' '));
  btn.disabled = !!opts.disabled;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (btn.disabled) return;
    playSound('click');
    onClick();
  });
  return btn;
}

let modalSeq = 0;

/** Текст с монетой в конце: «Забрать 9 ●». Один знак золота во всей игре. */
export function withCoin(text: string): HTMLElement {
  return h('span.with-coin', null, [text, h('span.coin', { attrs: { 'aria-hidden': 'true' } })]);
}

export interface ModalHandle {
  el: HTMLElement;
  close(): void;
}

/** Модальное окно поверх всего. Закрывается по кнопке, фону (если разрешено) или Escape. */
export function modal(
  content: Child | Child[],
  opts: { onClose?: () => void; dismissable?: boolean; className?: string; title?: string; sheet?: boolean; headExtra?: HTMLElement } = {},
): ModalHandle {
  const root = document.getElementById('ui')!;
  const dismissable = opts.dismissable !== false;
  const titleId = `modal-title-${++modalSeq}`;
  // Шапка прилипает к верху окна: заголовок и крестик видны, даже если окно длинное
  const closeBtn = dismissable
    ? h('button.modal-close', { type: 'button', attrs: { 'aria-label': t('menu.close') } }, '×')
    : null;
  const head = opts.title || closeBtn
    ? h(`div.modal-head${opts.title ? '' : '.bare'}`, null, [
        opts.title ? h('h2.modal-title', { id: titleId }, opts.title) : null,
        closeBtn,
        // Вкладки и прочее, что должно оставаться под заголовком при прокрутке
        opts.headExtra ? h('div.head-extra', null, opts.headExtra) : null,
      ])
    : null;
  const panel = h('div.modal-panel', { tabIndex: -1, attrs: { role: 'dialog', 'aria-modal': 'true', ...(opts.title ? { 'aria-labelledby': titleId } : {}) } }, [
    head,
    ...(Array.isArray(content) ? content : [content]),
  ]);
  if (opts.className) panel.classList.add(...opts.className.split(' '));
  if (opts.sheet) panel.classList.add('sheet');
  const backdrop = h(`div.modal-backdrop${opts.sheet ? '.sheet' : ''}`, null, panel);
  const returnFocus = document.activeElement as HTMLElement | null;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.classList.add('closing');
    window.removeEventListener('keydown', onKey);
    setTimeout(() => backdrop.remove(), 180);
    // Фокус клавиатуры — туда, откуда окно открыли
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    opts.onClose?.();
  };
  closeBtn?.addEventListener('click', () => {
    playSound('click');
    close();
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && opts.dismissable !== false) close();
  };
  window.addEventListener('keydown', onKey);
  backdrop.addEventListener('pointerdown', (e) => {
    if (e.target === backdrop && opts.dismissable !== false) close();
  });
  root.append(backdrop);
  panel.focus({ preventScroll: true });
  document.dispatchEvent(new Event('starweave:modal'));
  return { el: panel, close };
}

export function confirmDialog(text: string, onYes: () => void, variant: ButtonVariant = 'danger'): void {
  const m = modal(
    [
      h('p.modal-text', null, text),
      h('div.row.gap.end', null, [
        button(t('confirm.no'), () => m.close(), { variant: 'secondary' }),
        button(t('confirm.yes'), () => {
          m.close();
          onYes();
        }, { variant }),
      ]),
    ],
    { className: 'narrow' },
  );
}

let toastTimer = 0;

/** Короткое сообщение внизу экрана. */
export function toast(text: string, kind: 'info' | 'warn' = 'info'): void {
  const root = document.getElementById('ui')!;
  root.querySelector('.toast')?.remove();
  const el = h(`div.toast.toast-${kind}`, null, text);
  root.append(el);
  if (kind === 'warn') playSound('deny');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 250);
  }, 1800);
}

let activeTip: HTMLElement | null = null;

export function hideTooltip(): void {
  activeTip?.remove();
  activeTip = null;
}

/** Всплывающая подсказка у элемента: по тапу на телефоне, по наведению на десктопе. */
export function attachTooltip(el: HTMLElement, render: () => Node): void {
  const show = () => {
    hideTooltip();
    const tip = h('div.tooltip', null, render());
    document.getElementById('ui')!.append(tip);
    const r = el.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    const x = Math.min(window.innerWidth - tr.width - 8, Math.max(8, r.left + r.width / 2 - tr.width / 2));
    const below = r.bottom + 8 + tr.height < window.innerHeight;
    const y = below ? r.bottom + 8 : r.top - tr.height - 8;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
    activeTip = tip;
  };
  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse') show();
  });
  el.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') hideTooltip();
  });
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (activeTip && activeTip.dataset.owner === String(el.dataset.tipId)) hideTooltip();
    else {
      show();
      el.dataset.tipId ??= String(Math.random());
      if (activeTip) activeTip.dataset.owner = el.dataset.tipId!;
    }
  });
}

document.addEventListener('pointerdown', (e) => {
  if (activeTip && !(e.target as HTMLElement).closest?.('.tooltip')) hideTooltip();
});

/** Плавный счётчик числа в элементе. */
export function animateNumber(el: HTMLElement, from: number, to: number, ms: number, fmt: (n: number) => string): void {
  const start = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - start) / ms);
    const eased = 1 - (1 - k) ** 3;
    el.textContent = fmt(from + (to - from) * eased);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
