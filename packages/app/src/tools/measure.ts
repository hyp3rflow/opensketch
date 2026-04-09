/**
 * Measure tool — Figma-style distance measurement.
 *
 * When a node is selected and Alt is held, hovering over another node
 * (or empty canvas) shows red guidelines with px distance labels
 * between the selected node and the hovered node (or nearest edges).
 */

export interface MeasureLine {
  /** Screen-space coordinates */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Distance in scene-space pixels */
  distance: number;
  /** "h" = horizontal distance, "v" = vertical distance */
  axis: "h" | "v";
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MeasureDimensionLabel {
  axis: "w" | "h";
  value: number;
  x: number;
  y: number;
}

/**
 * Compute measurement lines between two bounding boxes.
 * Returns lines for horizontal and vertical gaps.
 */
export function computeMeasureLines(
  sel: Bounds,
  target: Bounds,
  zoom: number,
  panX: number,
  panY: number,
): MeasureLine[] {
  const lines: MeasureLine[] = [];

  const selL = sel.x, selR = sel.x + sel.w, selT = sel.y, selB = sel.y + sel.h;
  const selCX = sel.x + sel.w / 2, selCY = sel.y + sel.h / 2;
  const tL = target.x, tR = target.x + target.w, tT = target.y, tB = target.y + target.h;
  const tCX = target.x + target.w / 2, tCY = target.y + target.h / 2;

  // Convert scene → screen
  const toSX = (sx: number) => sx * zoom + panX;
  const toSY = (sy: number) => sy * zoom + panY;

  // Horizontal distance (gap or overlap)
  // Determine the vertical center line for the measurement
  const overlapT = Math.max(selT, tT);
  const overlapB = Math.min(selB, tB);
  const hasVertOverlap = overlapT < overlapB;
  const midY = hasVertOverlap ? (overlapT + overlapB) / 2 : (selCY + tCY) / 2;

  // Left gap: target is to the left of selection
  if (tR <= selL) {
    const dist = selL - tR;
    lines.push({
      x1: toSX(tR), y1: toSY(midY),
      x2: toSX(selL), y2: toSY(midY),
      distance: Math.round(dist * 10) / 10,
      axis: "h",
    });
  }
  // Right gap: target is to the right of selection
  else if (tL >= selR) {
    const dist = tL - selR;
    lines.push({
      x1: toSX(selR), y1: toSY(midY),
      x2: toSX(tL), y2: toSY(midY),
      distance: Math.round(dist * 10) / 10,
      axis: "h",
    });
  }
  // Overlapping horizontally — show distances to each edge
  else {
    // Distance from sel left to target left
    if (Math.abs(selL - tL) > 0.5) {
      const left = Math.min(selL, tL);
      const right = Math.max(selL, tL);
      lines.push({
        x1: toSX(left), y1: toSY(midY),
        x2: toSX(right), y2: toSY(midY),
        distance: Math.round((right - left) * 10) / 10,
        axis: "h",
      });
    }
    if (Math.abs(selR - tR) > 0.5) {
      const left = Math.min(selR, tR);
      const right = Math.max(selR, tR);
      lines.push({
        x1: toSX(left), y1: toSY(midY),
        x2: toSX(right), y2: toSY(midY),
        distance: Math.round((right - left) * 10) / 10,
        axis: "h",
      });
    }
  }

  // Vertical distance
  const overlapL = Math.max(selL, tL);
  const overlapR = Math.min(selR, tR);
  const hasHorizOverlap = overlapL < overlapR;
  const midX = hasHorizOverlap ? (overlapL + overlapR) / 2 : (selCX + tCX) / 2;

  if (tB <= selT) {
    const dist = selT - tB;
    lines.push({
      x1: toSX(midX), y1: toSY(tB),
      x2: toSX(midX), y2: toSY(selT),
      distance: Math.round(dist * 10) / 10,
      axis: "v",
    });
  } else if (tT >= selB) {
    const dist = tT - selB;
    lines.push({
      x1: toSX(midX), y1: toSY(selB),
      x2: toSX(midX), y2: toSY(tT),
      distance: Math.round(dist * 10) / 10,
      axis: "v",
    });
  } else {
    if (Math.abs(selT - tT) > 0.5) {
      const top = Math.min(selT, tT);
      const bot = Math.max(selT, tT);
      lines.push({
        x1: toSX(midX), y1: toSY(top),
        x2: toSX(midX), y2: toSY(bot),
        distance: Math.round((bot - top) * 10) / 10,
        axis: "v",
      });
    }
    if (Math.abs(selB - tB) > 0.5) {
      const top = Math.min(selB, tB);
      const bot = Math.max(selB, tB);
      lines.push({
        x1: toSX(midX), y1: toSY(top),
        x2: toSX(midX), y2: toSY(bot),
        distance: Math.round((bot - top) * 10) / 10,
        axis: "v",
      });
    }
  }

  return lines;
}

export function computeDimensionLabels(
  bounds: Bounds,
  zoom: number,
  panX: number,
  panY: number,
): MeasureDimensionLabel[] {
  const sx = bounds.x * zoom + panX;
  const sy = bounds.y * zoom + panY;
  const sw = bounds.w * zoom;
  const sh = bounds.h * zoom;
  return [
    {
      axis: "w",
      value: Math.round(bounds.w * 10) / 10,
      x: sx + sw / 2,
      y: sy - 12,
    },
    {
      axis: "h",
      value: Math.round(bounds.h * 10) / 10,
      x: sx - 12,
      y: sy + sh / 2,
    },
  ];
}

export function renderDimensionLabels(
  ctx: CanvasRenderingContext2D,
  labels: MeasureDimensionLabel[],
) {
  if (labels.length === 0) return;
  ctx.save();
  ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const label of labels) {
    const text = `${label.value}`;
    const tw = Math.max(20, ctx.measureText(text).width + 8);
    const th = 14;
    const lx = label.x - tw / 2;
    const ly = label.y - th / 2;

    ctx.fillStyle = "#ff3366";
    ctx.beginPath();
    ctx.roundRect(lx, ly, tw, th, 3);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.fillText(text, label.x, label.y + 0.5);
  }

  ctx.restore();
}

/**
 * Render measurement lines and distance labels on the canvas.
 */
export function renderMeasureLines(
  ctx: CanvasRenderingContext2D,
  lines: MeasureLine[],
) {
  if (lines.length === 0) return;

  ctx.save();

  for (const l of lines) {
    // Draw the measurement line
    ctx.strokeStyle = "#ff3366";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(Math.round(l.x1) + 0.5, Math.round(l.y1) + 0.5);
    ctx.lineTo(Math.round(l.x2) + 0.5, Math.round(l.y2) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw end ticks (perpendicular short lines)
    const tickLen = 4;
    if (l.axis === "h") {
      // Vertical ticks at endpoints
      ctx.beginPath();
      ctx.moveTo(Math.round(l.x1) + 0.5, l.y1 - tickLen);
      ctx.lineTo(Math.round(l.x1) + 0.5, l.y1 + tickLen);
      ctx.moveTo(Math.round(l.x2) + 0.5, l.y2 - tickLen);
      ctx.lineTo(Math.round(l.x2) + 0.5, l.y2 + tickLen);
      ctx.stroke();
    } else {
      // Horizontal ticks at endpoints
      ctx.beginPath();
      ctx.moveTo(l.x1 - tickLen, Math.round(l.y1) + 0.5);
      ctx.lineTo(l.x1 + tickLen, Math.round(l.y1) + 0.5);
      ctx.moveTo(l.x2 - tickLen, Math.round(l.y2) + 0.5);
      ctx.lineTo(l.x2 + tickLen, Math.round(l.y2) + 0.5);
      ctx.stroke();
    }

    // Draw distance label
    if (l.distance > 0) {
      const label = `${l.distance}`;
      const midX = (l.x1 + l.x2) / 2;
      const midY = (l.y1 + l.y2) / 2;

      ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
      const metrics = ctx.measureText(label);
      const tw = metrics.width + 6;
      const th = 16;

      // Background pill
      const lx = midX - tw / 2;
      const ly = l.axis === "h" ? midY - th - 4 : midY - th / 2;

      ctx.fillStyle = "#ff3366";
      ctx.beginPath();
      ctx.roundRect(lx, ly, tw, th, 3);
      ctx.fill();

      // Text
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, midX, ly + th / 2);
    }
  }

  // Draw target node highlight (handled externally — just the lines here)
  ctx.restore();
}

/**
 * Render a highlight outline around the target (hovered) node bounds.
 */
export function renderTargetHighlight(
  ctx: CanvasRenderingContext2D,
  bounds: Bounds,
  zoom: number,
  panX: number,
  panY: number,
) {
  const sx = bounds.x * zoom + panX;
  const sy = bounds.y * zoom + panY;
  const sw = bounds.w * zoom;
  const sh = bounds.h * zoom;

  ctx.save();
  ctx.strokeStyle = "#ff3366";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(Math.round(sx) + 0.5, Math.round(sy) + 0.5, Math.round(sw), Math.round(sh));
  ctx.setLineDash([]);
  ctx.restore();
}
