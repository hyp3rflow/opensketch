/**
 * Smart Guides — Figma-style snapping & alignment guides.
 *
 * During drag-move or drag-resize, computes snap targets from
 * other (non-selected) nodes' edges and centers.
 * Returns snap deltas and visual guide lines to render.
 */

export interface SnapGuide {
  /** "h" = horizontal line (same Y), "v" = vertical line (same X) */
  axis: "h" | "v";
  /** Scene-space coordinate of the guide line */
  pos: number;
  /** Min extent of the guide line in the other axis */
  from: number;
  /** Max extent of the guide line in the other axis */
  to: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: SnapGuide[];
}

interface NodeBounds {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Snap threshold in scene-space pixels (before zoom). */
const SNAP_THRESHOLD = 5;

/**
 * Collect snap reference points from non-selected nodes.
 * Returns arrays of X positions (left, center, right) and
 * Y positions (top, center, bottom) with the node bounds.
 */
function collectRefPoints(others: NodeBounds[]) {
  const xs: { val: number; bounds: NodeBounds }[] = [];
  const ys: { val: number; bounds: NodeBounds }[] = [];
  for (const b of others) {
    xs.push({ val: b.x, bounds: b });
    xs.push({ val: b.x + b.w / 2, bounds: b });
    xs.push({ val: b.x + b.w, bounds: b });
    ys.push({ val: b.y, bounds: b });
    ys.push({ val: b.y + b.h / 2, bounds: b });
    ys.push({ val: b.y + b.h, bounds: b });
  }
  return { xs, ys };
}

/**
 * Compute snap result for a moving bounding box.
 * @param moving Bounding box of the selection (already translated by raw dx/dy)
 * @param others Non-selected node bounds
 * @param threshold Snap threshold in scene pixels
 */
export function computeSnap(
  moving: { x: number; y: number; w: number; h: number },
  others: NodeBounds[],
  threshold: number = SNAP_THRESHOLD,
): SnapResult {
  if (others.length === 0) return { dx: 0, dy: 0, guides: [] };

  const { xs: refXs, ys: refYs } = collectRefPoints(others);

  // Moving node reference points
  const movXs = [moving.x, moving.x + moving.w / 2, moving.x + moving.w];
  const movYs = [moving.y, moving.y + moving.h / 2, moving.y + moving.h];

  let bestDx = Infinity;
  let bestDy = Infinity;

  // Find closest X snap
  for (const mx of movXs) {
    for (const rx of refXs) {
      const d = rx.val - mx;
      if (Math.abs(d) < Math.abs(bestDx)) {
        bestDx = d;
      }
    }
  }

  // Find closest Y snap
  for (const my of movYs) {
    for (const ry of refYs) {
      const d = ry.val - my;
      if (Math.abs(d) < Math.abs(bestDy)) {
        bestDy = d;
      }
    }
  }

  // Apply threshold
  const snapDx = Math.abs(bestDx) <= threshold ? bestDx : 0;
  const snapDy = Math.abs(bestDy) <= threshold ? bestDy : 0;

  // Build guide lines for snapped axes
  const guides: SnapGuide[] = [];
  const snappedX = moving.x + snapDx;
  const snappedY = moving.y + snapDy;
  const snappedMovXs = [snappedX, snappedX + moving.w / 2, snappedX + moving.w];
  const snappedMovYs = [snappedY, snappedY + moving.h / 2, snappedY + moving.h];

  if (snapDx !== 0) {
    // Find all matching X lines
    for (const mx of snappedMovXs) {
      for (const rx of refXs) {
        if (Math.abs(rx.val - mx) < 0.5) {
          const b = rx.bounds;
          const minY = Math.min(snappedY, b.y);
          const maxY = Math.max(snappedY + moving.h, b.y + b.h);
          guides.push({ axis: "v", pos: mx, from: minY, to: maxY });
        }
      }
    }
  }

  if (snapDy !== 0) {
    // Find all matching Y lines
    for (const my of snappedMovYs) {
      for (const ry of refYs) {
        if (Math.abs(ry.val - my) < 0.5) {
          const b = ry.bounds;
          const minX = Math.min(snappedX, b.x);
          const maxX = Math.max(snappedX + moving.w, b.x + b.w);
          guides.push({ axis: "h", pos: my, from: minX, to: maxX });
        }
      }
    }
  }

  // Deduplicate guides (same axis+pos)
  const unique: SnapGuide[] = [];
  const seen = new Set<string>();
  for (const g of guides) {
    const key = `${g.axis}:${Math.round(g.pos * 10)}`;
    if (seen.has(key)) {
      // Extend existing
      const existing = unique.find(u => `${u.axis}:${Math.round(u.pos * 10)}` === key)!;
      existing.from = Math.min(existing.from, g.from);
      existing.to = Math.max(existing.to, g.to);
    } else {
      seen.add(key);
      unique.push({ ...g });
    }
  }

  return { dx: snapDx, dy: snapDy, guides: unique };
}

/**
 * Render snap guide lines on the canvas context.
 */
export function renderGuides(
  ctx: CanvasRenderingContext2D,
  guides: SnapGuide[],
  zoom: number,
  panX: number,
  panY: number,
) {
  if (guides.length === 0) return;

  ctx.save();
  ctx.strokeStyle = "#ff3366";
  ctx.lineWidth = 1;
  ctx.setLineDash([]);

  for (const g of guides) {
    ctx.beginPath();
    if (g.axis === "v") {
      const sx = g.pos * zoom + panX;
      const sy1 = g.from * zoom + panY;
      const sy2 = g.to * zoom + panY;
      const x = Math.round(sx) + 0.5;
      ctx.moveTo(x, sy1 - 4);
      ctx.lineTo(x, sy2 + 4);
    } else {
      const sy = g.pos * zoom + panY;
      const sx1 = g.from * zoom + panX;
      const sx2 = g.to * zoom + panX;
      const y = Math.round(sy) + 0.5;
      ctx.moveTo(sx1 - 4, y);
      ctx.lineTo(sx2 + 4, y);
    }
    ctx.stroke();
  }

  ctx.restore();
}
