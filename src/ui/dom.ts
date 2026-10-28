import { keepPainted, paintOf } from '@/engine/canvas-life';

/** Крошечный hyperscript: h('div.panel', { onclick }, ['text', child]). */

export type Child = Node | string | number | null | undefined | false;
type Props = {
  style?: Partial<CSSStyleDeclaration> | string;
  dataset?: Record<string, string>;
  attrs?: Record<string, string>;
  [key: string]: unknown;
};

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K | `${K}.${string}` | `${K}#${string}`,
  props: Props | null = null,
  children: Child | Child[] = [],
): HTMLElementTagNameMap[K] {
  const [base, ...classes] = tag.split('.');
  const [name, id] = base!.split('#') as [K, string | undefined];
  const el = document.createElement(name);
  if (id) el.id = id;
  if (classes.length) el.className = classes.join(' ');
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined) continue;
      if (key === 'style') {
        if (typeof value === 'string') el.style.cssText = value;
        else Object.assign(el.style, value);
      } else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key === 'attrs') for (const [a, v] of Object.entries(value as Record<string, string>)) el.setAttribute(a, v);
      else if (key === 'className') el.className = [el.className, value].filter(Boolean).join(' ');
      else (el as unknown as Record<string, unknown>)[key] = value;
    }
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Child | Child[]): void {
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.firstChild.remove();
}

/** Канвас-картинка в DOM с CSS-размером. */
export function canvasImg(canvas: HTMLCanvasElement, cssW: number, cssH = cssW, className = ''): HTMLCanvasElement {
  // Канвас из кэша может понадобиться в двух местах сразу — копируем.
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  // Копия рисуется тем же способом, что исходник: исходник могут вытеснить из кэша (BG.1)
  const paint = paintOf(canvas) ?? ((c: HTMLCanvasElement) => c.getContext('2d')!.drawImage(canvas, 0, 0));
  keepPainted(copy, paint);
  copy.getContext('2d')!.drawImage(canvas, 0, 0);
  copy.style.width = `${cssW}px`;
  copy.style.height = `${cssH}px`;
  if (className) copy.className = className;
  return copy;
}

export function dpr(): number {
  return Math.min(3, window.devicePixelRatio || 1);
}
