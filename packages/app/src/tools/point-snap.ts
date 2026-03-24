/**
 * Point-level snapping for path/vector-network editing.
 *
 * Features:
 * - Snap to other points on the same path or other paths/VNs
 * - Snap to node edges/centers (reuses smart-guides ref points)
 * - Snap to grid/ruler positions
 * - Angle constraints: Shift = 0°/45°/90° relative to origin
 * - Visual feedback: snap indicators (small diamonds + crosshairs)
 */

export interface PointSnapTarget {
  x: number;
  y: number;
  kind: 'point' | 'edge' | 'center' | 'grid';
}

export interface PointSnapResult {
  /** Snapped X position (use this instead of raw) */
  x: number;
  /** Snapped Y position */
  y: number;
  /** Active snap indicators to render */
  indicators: PointSnapIndicator[];
}

export interface PointSnapIndicator {
  x: number;
  y: number;
  kind: 'point' | 'edge' | 'center' | 'grid' | 'angle';
}

const SNAP_THRESHOLD = 6; // scene-space pixels (before zoom)

/**
 * Apply angle constraint: snap to nearest 0/45/90/135/180/225/270/315° from origin.
 */
export function constrainAngle(
  ox: number, oy: number,
  x: number, y: number,
): { x: number; y: number } {
  const dx = x - ox;
  const dy = y - oy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.001) return { x: ox, y: oy };

  const angle = Math.atan2(dy, dx);
  // Snap to nearest 45° increment
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  return {
    x: ox + dist * Math.cos(snapped),
    y: oy + dist * Math.sin(snapped),
  };
}

/**
 * Compute point snap for a dragged point.
 *
 * @param rawX Raw scene X of the dragged point
 * @param rawY Raw scene Y of the dragged point
 * @param targets Available snap targets
 * @param threshold Snap threshold in scene pixels
 * @param shiftHeld Whether Shift key is held (angle constraint)
 * @param angleOrigin Origin point for angle constraint (anchor position)
 */
export function computePointSnap(
  rawX: number,
  rawY: number,
  targets: PointSnapTarget[],
  threshold: number = SNAP_THRESHOLD,
  shiftHeld: boolean = false,
  angleOrigin?: { x: number; y: number },
): PointSnapResult {
  let x = rawX;
  let y = rawY;
  const indicators: PointSnapIndicator[] = [];

  // 1. Angle constraint first (Shift)
  if (shiftHeld && angleOrigin) {
    const constrained = constrainAngle(angleOrigin.x, angleOrigin.y, x, y);
    x = constrained.x;
    y = constrained.y;
    indicators.push({ x, y, kind: 'angle' });
  }

  // 2. Find closest snap in X and Y independently
  let bestDx = Infinity;
  let bestDy = Infinity;
  let bestTargetX: PointSnapTarget | null = null;
  let bestTargetY: PointSnapTarget | null = null;

  for (const t of targets) {
    const dx = t.x - x;
    const dy = t.y - y;
    if (Math.abs(dx) < Math.abs(bestDx)) {
      bestDx = dx;
      bestTargetX = t;
    }
    if (Math.abs(dy) < Math.abs(bestDy)) {
      bestDy = dy;
      bestTargetY = t;
    }
  }

  const snapX = Math.abs(bestDx) <= threshold;
  const snapY = Math.abs(bestDy) <= threshold;

  if (snapX && bestTargetX) {
    x += bestDx;
    indicators.push({ x: bestTargetX.x, y: bestTargetX.y, kind: bestTargetX.kind });
  }
  if (snapY && bestTargetY) {
    y += bestDy;
    // Avoid duplicate indicator at same position
    if (!snapX || bestTargetY !== bestTargetX) {
      indicators.push({ x: bestTargetY!.x, y: bestTargetY!.y, kind: bestTargetY!.kind });
    }
  }

  // 3. Check for simultaneous X+Y snap to same point (stronger snap)
  for (const t of targets) {
    const dx = Math.abs(t.x - rawX);
    const dy = Math.abs(t.y - rawY);
    if (dx <= threshold && dy <= threshold) {
      // Both axes snap to this point — use it directly
      return {
        x: t.x,
        y: t.y,
        indicators: [{ x: t.x, y: t.y, kind: t.kind }],
      };
    }
  }

  return { x, y, indicators };
}

/**
 * Render point snap indicators on canvas.
 */
export function renderPointSnapIndicators(
  ctx: CanvasRenderingContext2D,
  indicators: PointSnapIndicator[],
  zoom: number,
  panX: number,
  panY: number,
) {
  if (indicators.length === 0) return;

  ctx.save();

  for (const ind of indicators) {
    const sx = ind.x * zoom + panX;
    const sy = ind.y * zoom + panY;

    if (ind.kind === 'angle') {
      // Dashed crosshair for angle constraint
      ctx.strokeStyle = '#ff6600';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(sx - 12, sy);
      ctx.lineTo(sx + 12, sy);
      ctx.moveTo(sx, sy - 12);
      ctx.lineTo(sx, sy + 12);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // Diamond marker for snap point
      const color = ind.kind === 'point' ? '#4a90d9'
        : ind.kind === 'grid' ? '#22cc66'
        : '#ff3366';
      ctx.fillStyle = color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      const s = 4;
      ctx.beginPath();
      ctx.moveTo(sx, sy - s);
      ctx.lineTo(sx + s, sy);
      ctx.lineTo(sx, sy + s);
      ctx.lineTo(sx - s, sy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Crosshair lines
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(sx - 16, sy);
      ctx.lineTo(sx + 16, sy);
      ctx.moveTo(sx, sy - 16);
      ctx.lineTo(sx, sy + 16);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  ctx.restore();
}

/**
 * Collect snap targets from all path/VN points in the scene,
 * excluding the currently dragged point.
 */
export function collectPathPointTargets(
  engine: any,
  sceneNodeIds: number[],
  excludeNodeId: number,
  excludePointIndex: number,
): PointSnapTarget[] {
  const targets: PointSnapTarget[] = [];

  for (const nid of sceneNodeIds) {
    try {
      // Try path points
      const pathData = engine.path_get_data(nid);
      if (pathData) {
        const parsed = JSON.parse(pathData);
        if (parsed.points) {
          for (let i = 0; i < parsed.points.length; i++) {
            if (nid === excludeNodeId && i === excludePointIndex) continue;
            const p = parsed.points[i];
            targets.push({ x: p.x, y: p.y, kind: 'point' });
          }
        }
        continue;
      }
    } catch { /* not a path */ }

    try {
      // Try VN vertices
      const vnData = engine.vn_get_data(BigInt(nid));
      if (vnData) {
        const parsed = JSON.parse(vnData);
        if (parsed.vertices) {
          for (const v of parsed.vertices) {
            if (nid === excludeNodeId) continue; // skip all vertices of current VN during edit
            targets.push({ x: v.x, y: v.y, kind: 'point' });
          }
        }
        continue;
      }
    } catch { /* not a VN */ }

    // Regular node: add edges + center
    try {
      const x = Number(engine.get_x(nid));
      const y = Number(engine.get_y(nid));
      const w = Number(engine.get_width(nid));
      const h = Number(engine.get_height(nid));
      if (isFinite(x) && isFinite(w)) {
        targets.push({ x, y, kind: 'edge' });
        targets.push({ x: x + w, y, kind: 'edge' });
        targets.push({ x, y: y + h, kind: 'edge' });
        targets.push({ x: x + w, y: y + h, kind: 'edge' });
        targets.push({ x: x + w / 2, y: y + h / 2, kind: 'center' });
      }
    } catch { /* skip */ }
  }

  return targets;
}

/**
 * Add ruler guide positions as grid snap targets.
 */
export function addRulerTargets(
  targets: PointSnapTarget[],
  rulers: { getSnapPositions(): { xs: number[]; ys: number[] } } | null,
) {
  if (!rulers) return;
  const pos = rulers.getSnapPositions();
  for (const gx of pos.xs) {
    targets.push({ x: gx, y: 0, kind: 'grid' });
  }
  for (const gy of pos.ys) {
    targets.push({ x: 0, y: gy, kind: 'grid' });
  }
}
