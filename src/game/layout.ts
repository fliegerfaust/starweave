import { CARD_ASPECT } from '@/art/card';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type LayoutMode = 'portrait' | 'landscape';

export interface NightLayout {
  mode: LayoutMode;
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
  /** Портрет: центр ряда руки и ширина. Ландшафт: центр колонки руки и высота. */
  handX: number;
  handY: number;
  handSpan: number;
  /** Точка, откуда вылетают карты (колода). */
  deck: { x: number; y: number };
}

/** Свободная от DOM-интерфейса область для неба и руки. */
export interface PlayArea {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Ландшафт включается, когда экран заметно шире, чем высок. */
export function isLandscape(width: number, height: number): boolean {
  return width >= height * 1.25 && width >= 640;
}

const MAX_CARD_W = 132;

export function computeLayout(width: number, height: number, gridSize: number, area: PlayArea): NightLayout {
  return isLandscape(width, height) ? landscapeLayout(width, height, gridSize, area) : portraitLayout(width, height, gridSize, area);
}

function cellCenters(x: number, y: number, gridSize: number, cardW: number, cardH: number, gap: number): { x: number; y: number }[] {
  const cells = [];
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      cells.push({ x: x + c * (cardW + gap) + cardW / 2, y: y + r * (cardH + gap) + cardH / 2 });
    }
  }
  return cells;
}

/**
 * Портрет: колонка до 620px — HUD сверху, небо, рука, панель действий.
 * Размер карты подбирается так, чтобы влезли и небо, и рука.
 */
function portraitLayout(width: number, height: number, gridSize: number, area: PlayArea): NightLayout {
  const colW = Math.min(width, 620);
  const gap = Math.max(5, Math.round(Math.min(colW, height) * 0.014));
  const top = area.top + 10;
  const bottom = area.bottom - 6;
  const avail = bottom - top;
  const handScale = 1.08;
  // gridSize рядов карт + рука + зазоры + воздух для подъёма выбранной карты
  const byHeight = ((avail - gap * (gridSize + 2) - 22) * CARD_ASPECT) / (gridSize + handScale);
  const byWidth = (colW - 28 - gap * (gridSize - 1)) / gridSize;
  const cardW = Math.floor(Math.max(36, Math.min(byHeight, byWidth, MAX_CARD_W)));
  const cardH = Math.round(cardW / CARD_ASPECT);
  const handW = Math.round(cardW * handScale);
  const handH = Math.round(handW / CARD_ASPECT);
  const boardW = gridSize * cardW + (gridSize - 1) * gap;
  const boardH = gridSize * cardH + (gridSize - 1) * gap;
  const freeV = avail - boardH - handH - 22;
  const boardY = top + Math.max(0, freeV * 0.35);
  const boardX = (width - boardW) / 2;
  const handY = Math.min(bottom - handH / 2 - 4, boardY + boardH + gap * 2 + handH / 2 + Math.max(0, freeV * 0.3));
  return {
    mode: 'portrait',
    cardW,
    cardH,
    handW,
    handH,
    gap,
    cells: cellCenters(boardX, boardY, gridSize, cardW, cardH, gap),
    board: { x: boardX, y: boardY, w: boardW, h: boardH },
    handX: width / 2,
    handY,
    handSpan: colW - 24,
    deck: { x: width / 2 + colW / 2 - 10, y: height + handH },
  };
}

/**
 * Ландшафт: HUD — колонка слева (DOM), небо по центру свободной области,
 * рука — вертикальной колонкой справа от неба.
 */
function landscapeLayout(width: number, height: number, gridSize: number, area: PlayArea): NightLayout {
  const gap = Math.max(6, Math.round(height * 0.012));
  const top = area.top + 12;
  const bottom = area.bottom - 12;
  const availH = bottom - top;
  const availW = area.right - area.left - 24;
  const handScale = 1.0;
  const byHeight = ((availH - gap * (gridSize - 1)) / gridSize) * CARD_ASPECT;
  // Ширина: небо + зазор + колонка руки
  const byWidth = (availW - gap * (gridSize - 1) - gap * 4) / (gridSize + handScale * 1.1);
  const cardW = Math.floor(Math.max(36, Math.min(byHeight, byWidth, MAX_CARD_W)));
  const cardH = Math.round(cardW / CARD_ASPECT);
  const handW = Math.round(cardW * handScale);
  const handH = Math.round(handW / CARD_ASPECT);
  const boardW = gridSize * cardW + (gridSize - 1) * gap;
  const boardH = gridSize * cardH + (gridSize - 1) * gap;
  const groupW = boardW + gap * 4 + handW * 1.1;
  const boardX = area.left + Math.max(12, (area.right - area.left - groupW) / 2);
  const boardY = top + Math.max(0, (availH - boardH) / 2);
  return {
    mode: 'landscape',
    cardW,
    cardH,
    handW,
    handH,
    gap,
    cells: cellCenters(boardX, boardY, gridSize, cardW, cardH, gap),
    board: { x: boardX, y: boardY, w: boardW, h: boardH },
    handX: boardX + boardW + gap * 4 + handW * 0.55,
    handY: boardY + boardH / 2,
    handSpan: Math.min(availH, boardH + handH * 0.3),
    deck: { x: width + handW, y: boardY + boardH / 2 },
  };
}

/** Центры карт руки: веером в портрете, колонкой в ландшафте; с перекрытием, если не влезают. */
export function handPositions(layout: NightLayout, count: number): { x: number; y: number; rot: number }[] {
  if (count === 0) return [];
  if (layout.mode === 'landscape') {
    const step = Math.min(layout.handH + layout.gap, (layout.handSpan - layout.handH) / Math.max(1, count - 1));
    const total = step * (count - 1);
    return Array.from({ length: count }, (_, i) => {
      const k = count === 1 ? 0 : i / (count - 1) - 0.5;
      return { x: layout.handX + Math.abs(k) * layout.handW * 0.06, y: layout.handY - total / 2 + i * step, rot: k * 0.06 };
    });
  }
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
