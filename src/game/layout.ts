import { CARD_ASPECT } from '@/art/card';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NightLayout {
  /** Ширина карты на небе. */
  cardW: number;
  cardH: number;
  /** Ширина карты в руке. */
  handW: number;
  handH: number;
  gap: number;
  /** Центры клеток неба. */
  cells: { x: number; y: number }[];
  board: Rect;
  /** Центр ряда руки и доступная ширина. */
  handY: number;
  handX: number;
  handSpan: number;
  /** Точка, откуда вылетают карты (колода). */
  deck: { x: number; y: number };
  /** Куда улетает счёт (под HUD). */
  scoreAnchor: { x: number; y: number };
  compact: boolean;
}

/**
 * Портретная раскладка в колонке шириной до 620px: HUD сверху, небо, рука, панель
 * действий. `areaTop`/`areaBottom` — свободная полоса между HUD и панелью действий
 * (измеряется по DOM). Размер карты подбирается так, чтобы влезли и небо, и рука.
 */
export function computeLayout(width: number, height: number, gridSize: number, areaTop: number, areaBottom: number): NightLayout {
  const colW = Math.min(width, 620);
  const gap = Math.max(5, Math.round(Math.min(colW, height) * 0.014));
  const top = areaTop + 10;
  const bottom = areaBottom - 6;
  const avail = bottom - top;
  const handScale = 1.08;
  // Высота: gridSize рядов карт + рука (handScale) + зазоры + немного воздуха для подъёма карты
  const byHeight = ((avail - gap * (gridSize + 2) - 22) * CARD_ASPECT) / (gridSize + handScale);
  const byWidth = (colW - 28 - gap * (gridSize - 1)) / gridSize;
  const cardW = Math.floor(Math.max(40, Math.min(byHeight, byWidth, 132)));
  const cardH = Math.round(cardW / CARD_ASPECT);
  const handW = Math.round(cardW * handScale);
  const handH = Math.round(handW / CARD_ASPECT);
  const boardW = gridSize * cardW + (gridSize - 1) * gap;
  const boardH = gridSize * cardH + (gridSize - 1) * gap;
  const freeV = avail - boardH - handH - 22;
  const boardY = top + Math.max(0, freeV * 0.35);
  const boardX = (width - boardW) / 2;
  const cells = [];
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      cells.push({ x: boardX + c * (cardW + gap) + cardW / 2, y: boardY + r * (cardH + gap) + cardH / 2 });
    }
  }
  const handY = Math.min(bottom - handH / 2 - 4, boardY + boardH + gap * 2 + handH / 2 + Math.max(0, freeV * 0.3));
  return {
    cardW,
    cardH,
    handW,
    handH,
    gap,
    cells,
    board: { x: boardX, y: boardY, w: boardW, h: boardH },
    handY,
    handX: width / 2,
    handSpan: colW - 24,
    deck: { x: width / 2 + colW / 2 - 10, y: height + handH },
    scoreAnchor: { x: width / 2, y: areaTop - 40 },
    compact: width < 380,
  };
}

/** Центры карт руки: веером, с перекрытием, если не влезают. */
export function handPositions(layout: NightLayout, count: number): { x: number; y: number; rot: number }[] {
  if (count === 0) return [];
  const step = Math.min(layout.handW + layout.gap * 1.4, (layout.handSpan - layout.handW) / Math.max(1, count - 1));
  const total = step * (count - 1);
  return Array.from({ length: count }, (_, i) => {
    const k = count === 1 ? 0 : i / (count - 1) - 0.5;
    return {
      x: layout.handX - total / 2 + i * step,
      y: layout.handY + Math.abs(k) * layout.handH * 0.08,
      rot: k * 0.12,
    };
  });
}
