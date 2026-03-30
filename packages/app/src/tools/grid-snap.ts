/**
 * Grid Snap — Canvas grid visualization and snap utilities.
 *
 * Renders dot/line grid on canvas, respecting zoom level.
 * Hides grid when dots would be too dense (< 4px screen spacing).
 */

const MIN_SCREEN_SPACING = 4; // Hide grid if spacing < 4px on screen

export interface GridConfig {
  enabled: boolean;
  size: number; // grid cell size in scene pixels
  style: "dots" | "lines";
}

/**
 * Snap a value to the nearest grid line.
 */
export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

/**
 * Compute grid snap delta for a bounding box (top-left corner).
 * Returns { dx, dy } to apply.
 */
export function computeGridSnap(
  x: number, y: number, gridSize: number
): { dx: number; dy: number } {
  const sx = snapToGrid(x, gridSize) - x;
  const sy = snapToGrid(y, gridSize) - y;
  return { dx: sx, dy: sy };
}

/**
 * Render grid dots/lines on the canvas.
 */
export function renderGrid(
  ctx: CanvasRenderingContext2D,
  zoom: number,
  panX: number,
  panY: number,
  canvasWidth: number,
  canvasHeight: number,
  gridSize: number,
  style: "dots" | "lines" = "dots"
) {
  const screenSpacing = gridSize * zoom;
  if (screenSpacing < MIN_SCREEN_SPACING) return; // Too dense

  ctx.save();

  // Compute visible scene range
  const sceneLeft = -panX / zoom;
  const sceneTop = -panY / zoom;
  const sceneRight = sceneLeft + canvasWidth / zoom;
  const sceneBottom = sceneTop + canvasHeight / zoom;

  // Grid line start/end (aligned to grid)
  const startX = Math.floor(sceneLeft / gridSize) * gridSize;
  const startY = Math.floor(sceneTop / gridSize) * gridSize;
  const endX = Math.ceil(sceneRight / gridSize) * gridSize;
  const endY = Math.ceil(sceneBottom / gridSize) * gridSize;

  // Fade opacity based on density
  const opacity = Math.min(1, (screenSpacing - MIN_SCREEN_SPACING) / 12);

  if (style === "lines") {
    ctx.strokeStyle = `rgba(150, 150, 150, ${0.15 * opacity})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = startX; x <= endX; x += gridSize) {
      const sx = x * zoom + panX;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, canvasHeight);
    }
    for (let y = startY; y <= endY; y += gridSize) {
      const sy = y * zoom + panY;
      ctx.moveTo(0, sy);
      ctx.lineTo(canvasWidth, sy);
    }
    ctx.stroke();
  } else {
    // Dots
    const dotSize = Math.max(1, Math.min(1.5, screenSpacing / 16));
    ctx.fillStyle = `rgba(150, 150, 150, ${0.4 * opacity})`;
    for (let x = startX; x <= endX; x += gridSize) {
      const sx = x * zoom + panX;
      for (let y = startY; y <= endY; y += gridSize) {
        const sy = y * zoom + panY;
        ctx.fillRect(sx - dotSize / 2, sy - dotSize / 2, dotSize, dotSize);
      }
    }
  }

  ctx.restore();
}
