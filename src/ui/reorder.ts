/**
 * Сортировка перетаскиванием для ряда элементов (мышь и палец). Элемент «берётся»
 * после сдвига на несколько пикселей — простой тап остаётся тапом (подсказка).
 * Место вставки подсвечивается, при отпускании вызывается `onMove(from, to)`.
 */
export function makeReorderable(container: HTMLElement, itemSelector: string, onMove: (from: number, to: number) => void, onDragStart?: () => void): void {
  const items = () => [...container.querySelectorAll<HTMLElement>(itemSelector)];

  for (const [index, item] of items().entries()) {
    const handle = item.querySelector<HTMLElement>('[data-drag-handle]') ?? item;
    handle.style.touchAction = 'none';
    handle.addEventListener('pointerdown', (down) => {
      if (down.button !== 0) return;
      const startX = down.clientX;
      const startY = down.clientY;
      let dragging = false;
      let target = index;
      // Позиции на момент захвата: сам медальон едет за пальцем и мерить по нему нельзя
      let rects: DOMRect[] = [];

      const move = (e: PointerEvent) => {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!dragging && Math.hypot(dx, dy) > 8) {
          dragging = true;
          rects = items().map((el) => el.getBoundingClientRect());
          handle.setPointerCapture?.(e.pointerId);
          item.classList.add('reorder-dragging');
          container.classList.add('reorder-active');
          onDragStart?.();
        }
        if (!dragging) return;
        item.style.transform = `translate(${dx}px, ${dy}px) scale(1.08)`;
        // Ближайший по центру элемент — туда и вставим
        const all = items();
        let best = index;
        let bestD = Infinity;
        rects.forEach((r, i) => {
          const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        });
        target = best;
        all.forEach((other, i) => other.classList.toggle('reorder-target', dragging && i === target && i !== index));
      };

      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (!dragging) return;
        // Клик после перетаскивания не должен открывать подсказку
        const swallow = (e: Event) => {
          e.stopPropagation();
          e.preventDefault();
        };
        item.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => item.removeEventListener('click', swallow, { capture: true }), 50);
        item.classList.remove('reorder-dragging');
        item.style.transform = '';
        container.classList.remove('reorder-active');
        for (const other of items()) other.classList.remove('reorder-target');
        if (target !== index) onMove(index, target);
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    });
  }
}
