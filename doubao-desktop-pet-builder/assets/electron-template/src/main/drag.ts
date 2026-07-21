export interface Point { x: number; y: number }
export interface Rect extends Point { width: number; height: number }

export function exceedsDragThreshold(start: Point, current: Point, threshold = 6): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}

export function draggedBounds(initialBounds: Rect, initialCursor: Point, cursor: Point): Rect {
  return {
    ...initialBounds,
    x: Math.round(initialBounds.x + cursor.x - initialCursor.x),
    y: Math.round(initialBounds.y + cursor.y - initialCursor.y),
  };
}

export function snapBounds(bounds: Rect, workArea: Rect, gap = 0): Rect {
  const distances = {
    left: Math.abs(bounds.x - workArea.x),
    right: Math.abs(workArea.x + workArea.width - (bounds.x + bounds.width)),
    top: Math.abs(bounds.y - workArea.y),
    bottom: Math.abs(workArea.y + workArea.height - (bounds.y + bounds.height)),
  };
  const edge = Object.entries(distances).sort((a, b) => a[1] - b[1])[0]?.[0];
  const next = { ...bounds };
  if (edge === 'left') next.x = workArea.x + gap;
  if (edge === 'right') next.x = workArea.x + workArea.width - bounds.width - gap;
  if (edge === 'top') next.y = workArea.y + gap;
  if (edge === 'bottom') next.y = workArea.y + workArea.height - bounds.height - gap;
  next.x = Math.min(Math.max(next.x, workArea.x), workArea.x + workArea.width - bounds.width);
  next.y = Math.min(Math.max(next.y, workArea.y), workArea.y + workArea.height - bounds.height);
  return next;
}
