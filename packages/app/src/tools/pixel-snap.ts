/**
 * Pixel grid snapping — rounds coordinates to integer (or half-pixel for HiDPI).
 * Applied as the final step after smart-guides / grid snapping.
 */

export type PixelSnapGrid = 1 | 0.5;

/** Snap a value to the pixel grid */
export function snapToPixel(v: number, grid: PixelSnapGrid = 1): number {
  const inv = 1 / grid;
  return Math.round(v * inv) / inv;
}

/** Snap a rect (x, y, w, h) to the pixel grid, ensuring positive w/h */
export function snapRectToPixel(
  x: number, y: number, w: number, h: number,
  grid: PixelSnapGrid = 1
): { x: number; y: number; w: number; h: number } {
  const sx = snapToPixel(x, grid);
  const sy = snapToPixel(y, grid);
  // Snap right/bottom edges independently to avoid sub-pixel width
  const sw = Math.max(grid, snapToPixel(w, grid));
  const sh = Math.max(grid, snapToPixel(h, grid));
  return { x: sx, y: sy, w: sw, h: sh };
}
