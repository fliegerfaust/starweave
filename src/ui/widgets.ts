import { t } from '@/i18n';
import { h, type Child } from './dom';
import { closeKeyword } from './keywords';

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
  opts: { variant?: ButtonVariant; disabled?: boolean; className?: string; title?: string; sub?: string; ariaLabel?: string } = {},
): HTMLButtonElement {
  const btn = h(`button.btn.btn-${opts.variant ?? 'primary'}`, { type: 'button', title: opts.title ?? '' }, [
    h('span.btn-label', null, label),
    opts.sub ? h('span.btn-sub', null, opts.sub) : null,
  ]);
  if (opts.className) btn.classList.add(...opts.className.split(' '));
  if (opts.ariaLabel) btn.setAttribute('aria-label', opts.ariaLabel);
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

/** Открытые окна снизу вверх: Escape и Tab относятся только к верхнему. */
const stack: { panel: HTMLElement; close: () => void; dismissable: boolean }[] = [];

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

window.addEventListener('keydown', (e) => {
  // Окна, снятые со страницы целиком (переход между экранами), из стопки выбрасываем
  for (let i = stack.length - 1; i >= 0; i--) if (!stack[i]!.panel.isConnected) stack.splice(i, 1);
  const top = stack[stack.length - 1];
  if (!top) return;
  if (e.key === 'Escape') {
    // Одно нажатие — одно окно, даже если открыто окно поверх окна
    e.stopImmediatePropagation();
    if (top.dismissable) top.close();
  } else if (e.key === 'Tab') {
    // Фокус не уходит за затемнение — по кругу внутри верхнего окна
    const items = [...top.panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (items.length === 0) {
      e.preventDefault();
      top.panel.focus();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const inside = top.panel.contains(document.activeElement);
    if (e.shiftKey && (document.activeElement === first || !inside)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
      e.preventDefault();
      first.focus();
    }
  }
});

/**
 * Полоса вкладок, которая может не влезть: край гаснет только там, куда есть что листать.
 * Когда всё помещается, фейда нет — иначе крайняя вкладка выглядит недоступной.
 */
export function edgeFade(el: HTMLElement): HTMLElement {
  const update = () => {
    const more = el.scrollWidth - el.clientWidth > 1;
    el.classList.toggle('fade-start', more && el.scrollLeft > 1);
    el.classList.toggle('fade-end', more && el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };
  el.addEventListener('scroll', update, { passive: true });
  // Полоса ушла со страницы (окно закрыли) — наблюдатель больше не нужен
  const ro = new ResizeObserver(() => (el.isConnected ? update() : ro.disconnect()));
  ro.observe(el);
  return el;
}

/** Модальное окно поверх всего. Закрывается по кнопке, фону (если разрешено) или Escape. */
export function modal(
  content: Child | Child[],
  opts: { onClose?: () => void; dismissable?: boolean; className?: string; title?: string; sheet?: boolean; scene?: boolean; headExtra?: HTMLElement } = {},
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
  if (opts.scene) panel.classList.add('scene');
  const backdrop = h(`div.modal-backdrop${opts.sheet ? '.sheet' : ''}${opts.scene ? '.scene' : ''}`, null, panel);
  const returnFocus = document.activeElement as HTMLElement | null;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.classList.add('closing');
    const i = stack.findIndex((m) => m.panel === panel);
    if (i >= 0) stack.splice(i, 1);
    setTimeout(() => backdrop.remove(), 180);
    // Фокус клавиатуры — туда, откуда окно открыли; если того уже нет — в окно ниже
    if (returnFocus?.isConnected && returnFocus !== document.body) returnFocus.focus({ preventScroll: true });
    else stack[stack.length - 1]?.panel.focus({ preventScroll: true });
    opts.onClose?.();
  };
  closeBtn?.addEventListener('click', () => {
    playSound('click');
    close();
  });
  stack.push({ panel, close, dismissable });
  backdrop.addEventListener('pointerdown', (e) => {
    if (e.target === backdrop && dismissable) close();
  });
  root.append(backdrop);
  // Длинное имя одним словом («Солнцепоклонник») не влезает между краем и крестиком — мельче
  const title = head?.querySelector<HTMLElement>('.modal-title');
  if (title && title.scrollWidth > title.clientWidth + 1) title.classList.add('long');
  panel.focus({ preventScroll: true });
  document.dispatchEvent(new Event('starweave:modal'));
  return { el: panel, close };
}

/**
 * Подтверждение — «Табличка» (RD.10): заголовок-табличка, короткий текст, при надобности
 * строка о том, что пропадёт, и две кнопки — на телефоне поровну, на ПК по своей ширине.
 */
export function confirmDialog(
  text: string,
  onYes: () => void,
  variant: ButtonVariant = 'danger',
  labels?: { yes: string; no: string },
  opts: { title?: string; extra?: Node | null } = {},
): void {
  const m = modal(
    [
      h('p.modal-text.confirm-text', null, text),
      opts.extra ?? null,
      h('div.win-acts', null, [
        button(labels?.no ?? t('confirm.no'), () => m.close(), { variant: 'secondary' }),
        button(labels?.yes ?? t('confirm.yes'), () => {
          m.close();
          onYes();
        }, { variant }),
      ]),
    ],
    { className: 'narrow confirm', ...(opts.title ? { title: opts.title } : {}) },
  );
}

let toastTimer = 0;

/**
 * Короткое сообщение — латунная пилюля (RD.10). Вне ночи — сверху под вырезом; в ночи —
 * посреди неба, чтобы не закрывать счёт и ходы в шапке. Можно передать значок или миниатюру.
 */
export function toast(text: string, kind: 'info' | 'warn' = 'info', lead?: Node): void {
  const root = document.getElementById('ui')!;
  root.querySelector('.toast')?.remove();
  const night = !!document.querySelector('.hud');
  const el = h(`div.toast.toast-${kind}${night ? '.mid' : ''}`, { attrs: { role: 'status', 'aria-live': 'polite' } }, [lead ?? null, h('span', null, text)]);
  root.append(el);
  if (kind === 'warn') playSound('deny');
  window.clearTimeout(toastTimer);
  // Сколько читать: ~60 мс на знак, но не меньше 2,2 с и не больше 7 с; касание закрывает раньше
  const hide = () => {
    window.clearTimeout(toastTimer);
    el.classList.add('out');
    setTimeout(() => el.remove(), 250);
  };
  el.addEventListener('click', hide);
  toastTimer = window.setTimeout(hide, Math.min(7000, Math.max(2200, text.length * 60)));
}

let activeTip: HTMLElement | null = null;

let hideTimer = 0;

export function hideTooltip(): void {
  window.clearTimeout(hideTimer);
  activeTip?.remove();
  activeTip = null;
  closeKeyword();
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
    const below = r.bottom + 10 + tr.height < window.innerHeight;
    const y = below ? r.bottom + 10 : r.top - tr.height - 10;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
    // Носик таблички смотрит на элемент
    tip.classList.add(below ? 'below' : 'above');
    tip.style.setProperty('--nose', `${Math.min(tr.width - 16, Math.max(16, r.left + r.width / 2 - x))}px`);
    activeTip = tip;
  };
  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse') show();
  });
  // Мышью — табличка живёт, пока курсор на элементе или на ней самой: в ней нажимаемые слова (FX.4)
  el.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (!activeTip?.matches(':hover') && !document.querySelector('.kw-hint:hover')) hideTooltip();
    }, 220);
  });
  // Подсказка доступна и с клавиатуры: фокус на элементе, Enter/пробел — показать
  if (el.tagName !== 'BUTTON') {
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.click();
      }
    });
  }
  el.addEventListener('focus', () => show());
  el.addEventListener('blur', () => hideTooltip());
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
  const el = e.target as HTMLElement;
  if (activeTip && !el.closest?.('.tooltip') && !el.closest?.('.kw-hint')) hideTooltip();
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
