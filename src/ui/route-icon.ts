import type { RouteKind } from '@/core/route';
import { h } from './dom';

/** Значки видов пути — одна линия и вес, цвет вида (как в витрине d8-route-screen). */
const ROUTE_ICON: Record<Exclude<RouteKind, 'eclipse'>, string> = {
  night: '<path d="M12 3.5c.5 4.2 1.8 6.5 6.5 8.5-4.7 2-6 4.3-6.5 8.5-.5-4.2-1.8-6.5-6.5-8.5 4.7-2 6-4.3 6.5-8.5Z" fill="currentColor"/>',
  bright: '<circle cx="12" cy="12" r="9.3" fill="none" stroke="currentColor" stroke-width="1" opacity=".55"/><path d="M12 2.8c.6 5 2 7.2 6.8 9.2-4.8 2-6.2 4.2-6.8 9.2-.6-5-2-7.2-6.8-9.2 4.8-2 6.2-4.2 6.8-9.2Z" fill="currentColor"/><path d="M4.6 4.6l2 2M19.4 4.6l-2 2M4.6 19.4l2-2M19.4 19.4l-2-2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  comet: '<circle cx="16" cy="8" r="3.6" fill="currentColor"/><path d="M13.4 10.6 4 20M14.6 12.4 8 19M11.6 9.4 5 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".75"/>',
  telescope: '<path d="m4 14 11-6.5 2 3.4L6 17.4Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="m15.5 6.8 2.6-1.5 2 3.4-2.6 1.5M10.5 15.5 8 21M11.5 15l2.5 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
};

export function routeIcon(kind: RouteKind): HTMLElement {
  const el = h(`span.sm-ic.k-${kind}`);
  el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ROUTE_ICON[kind as 'night']}</svg>`;
  return el;
}
