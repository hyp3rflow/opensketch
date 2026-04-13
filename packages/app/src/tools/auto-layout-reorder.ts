/**
 * Auto Layout Reorder Handles
 *
 * When a child of an auto-layout frame is selected, shows drag handles
 * that allow reordering children directly on the canvas. Dragging a handle
 * past a sibling boundary swaps the child to that position and recomputes layout.
 */

import type { Engine } from "../wasm/opensketch_engine";

export interface ReorderHandle {
  /** The child node being reordered */
  childId: number;
  /** Parent auto-layout frame id */
  parentId: number;
  /** Current index of child in parent's children array */
  childIndex: number;
  /** Screen-space bounds of the drag handle icon */
  sx: number; sy: number; sw: number; sh: number;
  /** Layout direction of the parent */
  direction: "row" | "column";
  /** Scene-space bounds of the child node (for indicator placement) */
  sceneX: number; sceneY: number; sceneW: number; sceneH: number;
}

export interface ReorderDragState {
  handle: ReorderHandle;
  startScreenX: number;
  startScreenY: number;
  /** Original index at drag start */
  originalIndex: number;
  /** Current effective index during drag */
  currentIndex: number;
  /** Sibling positions (scene coords) for threshold calculations */
  siblings: Array<{ id: number; x: number; y: number; w: number; h: number }>;
}

/**
 * Find reorder handles for selected nodes that are children of auto-layout frames.
 */
export function findReorderHandles(engine: Engine): ReorderHandle[] {
  const handles: ReorderHandle[] = [];
  try {
    const sel = Array.from(engine.get_selection()).map(Number);
    if (sel.length === 0) return handles;

    const zoom = engine.get_zoom();
    const panX = engine.get_pan_x();
    const panY = engine.get_pan_y();

    for (const id of sel) {
      // Get parent info
      const parentId = Number((engine as any).get_node_parent?.(BigInt(id)) ?? -1);
      if (parentId <= 0) continue;

      // Check if parent has auto-layout
      const parentJson = engine.get_node_json(BigInt(parentId));
      if (!parentJson) continue;
      const parent = JSON.parse(parentJson);
      if (!parent.layout || parent.layout.mode === "None") continue;

      // Get child's info
      const childJson = engine.get_node_json(BigInt(id));
      if (!childJson) continue;
      const child = JSON.parse(childJson);
      if (child.absolute_position) continue;

      // Find child index in parent
      const children: number[] = parent.children || [];
      const childIndex = children.indexOf(id);
      if (childIndex < 0) continue;

      // Count visible non-absolute siblings (need at least 2 to reorder)
      let visibleCount = 0;
      for (const cid of children) {
        try {
          const cj = engine.get_node_json(BigInt(cid));
          if (!cj) continue;
          const cn = JSON.parse(cj);
          if (cn.visible !== false && !cn.absolute_position) visibleCount++;
        } catch { /* skip */ }
      }
      if (visibleCount < 2) continue;

      const isRow = parent.layout.direction === "Row";
      const handleSize = 16;

      // Position handle: left edge (column) or top edge (row) of the child
      let hx: number, hy: number;
      if (isRow) {
        // Handle at top-center of child
        hx = (child.x + child.width / 2 - handleSize / 2) * zoom + panX;
        hy = child.y * zoom + panY - handleSize - 4;
      } else {
        // Handle at left-center of child
        hx = child.x * zoom + panX - handleSize - 4;
        hy = (child.y + child.height / 2 - handleSize / 2) * zoom + panY;
      }

      handles.push({
        childId: id,
        parentId,
        childIndex,
        sx: hx, sy: hy, sw: handleSize, sh: handleSize,
        direction: isRow ? "row" : "column",
        sceneX: child.x, sceneY: child.y,
        sceneW: child.width, sceneH: child.height,
      });
    }
  } catch { /* ignore */ }
  return handles;
}

/**
 * Hit test: is the screen point over a reorder handle?
 */
export function hitTestReorderHandle(handles: ReorderHandle[], sx: number, sy: number): ReorderHandle | null {
  const hitPad = 4;
  for (const h of handles) {
    if (sx >= h.sx - hitPad && sx <= h.sx + h.sw + hitPad &&
        sy >= h.sy - hitPad && sy <= h.sy + h.sh + hitPad) {
      return h;
    }
  }
  return null;
}

/**
 * Begin a reorder drag. Collects sibling positions for threshold calc.
 */
export function beginReorderDrag(
  engine: Engine,
  handle: ReorderHandle,
  screenX: number,
  screenY: number,
): ReorderDragState {
  // Collect all visible non-absolute siblings
  const parentJson = engine.get_node_json(BigInt(handle.parentId));
  const parent = parentJson ? JSON.parse(parentJson) : { children: [] };
  const siblings: ReorderDragState["siblings"] = [];

  for (const cid of (parent.children || [])) {
    try {
      const cj = engine.get_node_json(BigInt(cid));
      if (!cj) continue;
      const cn = JSON.parse(cj);
      if (cn.visible === false || cn.absolute_position) continue;
      siblings.push({ id: cid, x: cn.x, y: cn.y, w: cn.width, h: cn.height });
    } catch { /* skip */ }
  }

  return {
    handle,
    startScreenX: screenX,
    startScreenY: screenY,
    originalIndex: handle.childIndex,
    currentIndex: handle.childIndex,
    siblings,
  };
}

/**
 * Update reorder during drag. Returns the new target index based on cursor position.
 * If the index changed, caller should execute the reorder.
 */
export function updateReorderDrag(
  engine: Engine,
  state: ReorderDragState,
  screenX: number,
  screenY: number,
): number {
  const zoom = engine.get_zoom();
  const panX = engine.get_pan_x();
  const panY = engine.get_pan_y();

  // Convert screen to scene
  const sceneX = (screenX - panX) / zoom;
  const sceneY = (screenY - panY) / zoom;

  const isRow = state.handle.direction === "row";
  const siblings = state.siblings;

  // Find the visual index of the child among visible siblings
  let visibleIndex = siblings.findIndex(s => s.id === state.handle.childId);
  if (visibleIndex < 0) return state.currentIndex;

  // Find target index by comparing cursor against sibling midpoints
  let targetVisibleIndex = siblings.length - 1;
  for (let i = 0; i < siblings.length; i++) {
    const s = siblings[i];
    if (s.id === state.handle.childId) continue;

    const mid = isRow ? s.x + s.w / 2 : s.y + s.h / 2;
    const cursor = isRow ? sceneX : sceneY;

    if (cursor < mid) {
      targetVisibleIndex = i > visibleIndex ? i - 1 : i;
      break;
    }
  }

  // Clamp
  targetVisibleIndex = Math.max(0, Math.min(targetVisibleIndex, siblings.length - 1));

  // Convert visible index back to actual children index
  // The siblings array was built from parent.children in order, filtering invisible/absolute ones.
  // We need to find the actual parent children index corresponding to targetVisibleIndex.
  const parentJson = engine.get_node_json(BigInt(state.handle.parentId));
  if (!parentJson) return state.currentIndex;
  const parent = JSON.parse(parentJson);
  const allChildren: number[] = parent.children || [];

  // Build mapping from visible index to actual index
  let vi = 0;
  let actualTargetIndex = allChildren.length - 1;
  for (let ai = 0; ai < allChildren.length; ai++) {
    const cid = allChildren[ai];
    // Check if this child is in our visible siblings list
    const inVisible = siblings.some(s => s.id === cid);
    if (!inVisible) continue;
    if (vi === targetVisibleIndex) {
      actualTargetIndex = ai;
      break;
    }
    vi++;
  }

  return actualTargetIndex;
}

/**
 * Execute the reorder: move child from current position to target index.
 */
export function executeReorder(
  engine: Engine,
  parentId: number,
  childId: number,
  targetIndex: number,
): void {
  // Use reparent_node_at to move within same parent at target index
  (engine as any).reparent_node_at(BigInt(childId), parentId, targetIndex);
  // Recompute layout
  try { (engine as any).recompute_layout(BigInt(parentId)); } catch { /* ignore */ }
}

/**
 * Render reorder handles and drag preview.
 */
export function renderReorderHandles(
  ctx: CanvasRenderingContext2D,
  handles: ReorderHandle[],
  hovered: ReorderHandle | null,
  dragState: ReorderDragState | null,
  zoom: number,
  panX: number,
  panY: number,
) {
  for (const h of handles) {
    const isActive = (hovered && hovered.childId === h.childId) ||
                     (dragState && dragState.handle.childId === h.childId);

    // Draw grip handle icon (6-dot grid pattern)
    ctx.save();
    const cx = h.sx + h.sw / 2;
    const cy = h.sy + h.sh / 2;

    // Background pill
    ctx.fillStyle = isActive ? "rgba(14, 165, 233, 0.92)" : "rgba(30, 41, 59, 0.85)";
    ctx.beginPath();
    ctx.roundRect(h.sx, h.sy, h.sw, h.sh, 4);
    ctx.fill();

    // Draw 6 dots (3x2 grip pattern)
    ctx.fillStyle = isActive ? "rgba(255,255,255,0.95)" : "rgba(148,163,184,0.9)";
    const dotR = 1.2;
    const gapH = 3.5;
    const gapV = 3;
    for (let row = -1; row <= 1; row++) {
      for (let col = -0.5; col <= 0.5; col++) {
        ctx.beginPath();
        ctx.arc(cx + col * gapH, cy + row * gapV, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // Draw insertion indicator during drag
  if (dragState) {
    const state = dragState;
    const siblings = state.siblings;
    const isRow = state.handle.direction === "row";

    // Find the visual position for the insertion indicator
    const parentJson = ctx.canvas.getAttribute("data-reorder-parent-json");
    // We draw an indicator line at the target position
    // Use sibling bounds to determine where the line should be
    const targetIdx = state.currentIndex;

    // Find the target sibling position
    // We need to determine where to draw the insertion line among visible siblings
    let linePos: number;
    const visibleSiblings = siblings.filter(s => s.id !== state.handle.childId);
    const draggedSibling = siblings.find(s => s.id === state.handle.childId);
    if (!draggedSibling) return;

    // Build ordered list including the dragged node at its current target
    // Find where the target index places us among visible siblings
    let targetVisIndex = 0;
    for (let i = 0; i < siblings.length; i++) {
      if (siblings[i].id === state.handle.childId) continue;
      if (i <= targetIdx && i < siblings.length) targetVisIndex++;
    }

    // Determine line position
    if (isRow) {
      if (targetIdx <= 0) {
        linePos = siblings[0].x - 2;
      } else if (targetIdx >= siblings.length - 1) {
        const last = siblings[siblings.length - 1];
        linePos = last.x + last.w + 2;
      } else {
        const before = siblings[targetIdx];
        linePos = before.x;
      }
    } else {
      if (targetIdx <= 0) {
        linePos = siblings[0].y - 2;
      } else if (targetIdx >= siblings.length - 1) {
        const last = siblings[siblings.length - 1];
        linePos = last.y + last.h + 2;
      } else {
        const before = siblings[targetIdx];
        linePos = before.y;
      }
    }

    // Draw insertion line
    ctx.save();
    ctx.strokeStyle = "#0ea5e9";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);

    if (isRow) {
      const sx = linePos * zoom + panX;
      const minY = Math.min(...siblings.map(s => s.y));
      const maxY = Math.max(...siblings.map(s => s.y + s.h));
      const sy1 = minY * zoom + panY - 4;
      const sy2 = maxY * zoom + panY + 4;
      ctx.beginPath();
      ctx.moveTo(sx, sy1);
      ctx.lineTo(sx, sy2);
      ctx.stroke();

      // Arrow endpoints
      const arrowSize = 4;
      ctx.fillStyle = "#0ea5e9";
      for (const ey of [sy1, sy2]) {
        ctx.beginPath();
        ctx.arc(sx, ey, arrowSize, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const sy = linePos * zoom + panY;
      const minX = Math.min(...siblings.map(s => s.x));
      const maxX = Math.max(...siblings.map(s => s.x + s.w));
      const sx1 = minX * zoom + panX - 4;
      const sx2 = maxX * zoom + panX + 4;
      ctx.beginPath();
      ctx.moveTo(sx1, sy);
      ctx.lineTo(sx2, sy);
      ctx.stroke();

      const arrowSize = 4;
      ctx.fillStyle = "#0ea5e9";
      for (const ex of [sx1, sx2]) {
        ctx.beginPath();
        ctx.arc(ex, sy, arrowSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Highlight the dragged child with a dashed border
    ctx.strokeStyle = "rgba(14, 165, 233, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(
      draggedSibling.x * zoom + panX,
      draggedSibling.y * zoom + panY,
      draggedSibling.w * zoom,
      draggedSibling.h * zoom,
    );

    ctx.restore();

    // Index label badge
    const badgeText = `${state.currentIndex + 1}`;
    const badgeX = draggedSibling.x * zoom + panX + draggedSibling.w * zoom / 2;
    const badgeY = draggedSibling.y * zoom + panY - 22;
    ctx.save();
    ctx.font = "bold 10px Inter, system-ui, sans-serif";
    const tw = ctx.measureText(badgeText).width;
    ctx.fillStyle = "rgba(14, 165, 233, 0.92)";
    ctx.beginPath();
    ctx.roundRect(badgeX - tw / 2 - 5, badgeY - 7, tw + 10, 14, 4);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText, badgeX, badgeY);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }

  // Tooltip on hover (not during drag)
  if (hovered && !dragState) {
    const cx = hovered.sx + hovered.sw / 2;
    const cy = hovered.sy - 14;
    const hint = "Drag to reorder";
    ctx.save();
    ctx.font = "10px Inter, system-ui, sans-serif";
    const tw = ctx.measureText(hint).width;
    ctx.fillStyle = "rgba(17, 24, 39, 0.88)";
    ctx.beginPath();
    ctx.roundRect(cx - tw / 2 - 6, cy - 7, tw + 12, 14, 5);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(hint, cx, cy);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }
}
