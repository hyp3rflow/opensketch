/**
 * Drag-to-Reparent with Auto-Layout Insertion Indicator
 *
 * When dragging node(s) over a Frame with auto-layout (Flex),
 * shows a blue insertion line indicating where the node will land.
 * On drop, reparents the node into the frame at that position.
 */

import type { Engine } from "../wasm/opensketch_engine";

export interface DropTarget {
  frameId: number;
  insertIndex: number;
  /** Indicator line in scene coordinates */
  lineX1: number;
  lineY1: number;
  lineX2: number;
  lineY2: number;
  /** Direction for visual feedback */
  direction: "row" | "column";
}

interface LayoutDropZone {
  mode: string;
  direction: string;
  gap: number;
  padding_top: number;
  padding_right: number;
  padding_bottom: number;
  padding_left: number;
  frame_x: number;
  frame_y: number;
  frame_w: number;
  frame_h: number;
  children: Array<{ id: number; x: number; y: number; w: number; h: number }>;
}

/**
 * Compute the drop target for dragging over auto-layout frames.
 * @param engine WASM engine
 * @param sceneX cursor position in scene coords
 * @param sceneY cursor position in scene coords
 * @param draggedIds IDs being dragged (excluded from candidate frames)
 */
export function computeDropTarget(
  engine: Engine,
  sceneX: number,
  sceneY: number,
  draggedIds: Set<number>,
): DropTarget | null {
  // Find frames under cursor via hit test
  // We need to check all frames, not just top hit
  const allNodes = getAllFrameIds(engine);

  for (const fid of allNodes) {
    if (draggedIds.has(fid)) continue;
    // Check if dragged node is a descendant of this frame (skip to avoid circular reparent)
    // Simple check: skip if frame is in draggedIds ancestors
    if (isDescendant(engine, fid, draggedIds)) continue;

    const json = (engine as any).get_layout_drop_zones(BigInt(fid));
    if (!json || json === "null") continue;

    let zone: LayoutDropZone;
    try { zone = JSON.parse(json); } catch { continue; }

    // Check if cursor is inside this frame (with some padding tolerance)
    const pad = 8;
    if (
      sceneX < zone.frame_x - pad || sceneX > zone.frame_x + zone.frame_w + pad ||
      sceneY < zone.frame_y - pad || sceneY > zone.frame_y + zone.frame_h + pad
    ) continue;

    // Only support flex layouts for now
    if (zone.mode !== "flex") continue;

    // Filter out dragged children from the zone children
    const children = zone.children.filter(c => !draggedIds.has(c.id));
    const isRow = zone.direction === "row";

    // Find insertion index based on cursor position
    let insertIndex = children.length; // default: append

    if (children.length === 0) {
      // Empty frame: insert at 0
      insertIndex = 0;
      // Indicator line at the start of content area
      const lx = zone.frame_x + zone.padding_left;
      const ly = zone.frame_y + zone.padding_top;
      const lx2 = isRow ? lx : lx + zone.frame_w - zone.padding_left - zone.padding_right;
      const ly2 = isRow ? ly + zone.frame_h - zone.padding_top - zone.padding_bottom : ly;
      return { frameId: fid, insertIndex, lineX1: lx, lineY1: ly, lineX2: lx2, lineY2: ly2, direction: zone.direction as "row" | "column" };
    }

    for (let i = 0; i < children.length; i++) {
      const c = children[i];
      // Absolute position (children x/y are relative to frame)
      const cx = zone.frame_x + c.x;
      const cy = zone.frame_y + c.y;

      if (isRow) {
        const midX = cx + c.w / 2;
        if (sceneX < midX) { insertIndex = i; break; }
      } else {
        const midY = cy + c.h / 2;
        if (sceneY < midY) { insertIndex = i; break; }
      }
    }

    // Compute indicator line position
    let lineX1: number, lineY1: number, lineX2: number, lineY2: number;
    const contentTop = zone.frame_y + zone.padding_top;
    const contentBottom = zone.frame_y + zone.frame_h - zone.padding_bottom;
    const contentLeft = zone.frame_x + zone.padding_left;
    const contentRight = zone.frame_x + zone.frame_w - zone.padding_right;

    if (isRow) {
      let lineX: number;
      if (insertIndex === 0) {
        const firstC = children[0];
        lineX = zone.frame_x + firstC.x - zone.gap / 2;
      } else if (insertIndex >= children.length) {
        const lastC = children[children.length - 1];
        lineX = zone.frame_x + lastC.x + lastC.w + zone.gap / 2;
      } else {
        const prev = children[insertIndex - 1];
        const curr = children[insertIndex];
        lineX = zone.frame_x + (prev.x + prev.w + curr.x) / 2;
      }
      lineX1 = lineX; lineY1 = contentTop;
      lineX2 = lineX; lineY2 = contentBottom;
    } else {
      let lineY: number;
      if (insertIndex === 0) {
        const firstC = children[0];
        lineY = zone.frame_y + firstC.y - zone.gap / 2;
      } else if (insertIndex >= children.length) {
        const lastC = children[children.length - 1];
        lineY = zone.frame_y + lastC.y + lastC.h + zone.gap / 2;
      } else {
        const prev = children[insertIndex - 1];
        const curr = children[insertIndex];
        lineY = zone.frame_y + (prev.y + prev.h + curr.y) / 2;
      }
      lineX1 = contentLeft; lineY1 = lineY;
      lineX2 = contentRight; lineY2 = lineY;
    }

    // Map insertIndex back to actual children array (accounting for dragged nodes)
    const actualChildren = zone.children;
    let actualIndex = 0;
    let counted = 0;
    for (let i = 0; i <= actualChildren.length && counted < insertIndex; i++) {
      if (i >= actualChildren.length) { actualIndex = actualChildren.length; break; }
      if (!draggedIds.has(actualChildren[i].id)) counted++;
      actualIndex = i + 1;
    }
    if (insertIndex === 0) actualIndex = 0;

    return { frameId: fid, insertIndex: actualIndex, lineX1, lineY1, lineX2, lineY2, direction: zone.direction as "row" | "column" };
  }

  return null;
}

/**
 * Render the drop indicator on the canvas.
 */
export function renderDropIndicator(
  ctx: CanvasRenderingContext2D,
  target: DropTarget,
  zoom: number,
  panX: number,
  panY: number,
) {
  const x1 = target.lineX1 * zoom + panX;
  const y1 = target.lineY1 * zoom + panY;
  const x2 = target.lineX2 * zoom + panX;
  const y2 = target.lineY2 * zoom + panY;

  ctx.save();
  ctx.strokeStyle = "#0d99ff";
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Draw small diamonds at endpoints
  const diamondSize = 3;
  for (const [dx, dy] of [[x1, y1], [x2, y2]]) {
    ctx.fillStyle = "#0d99ff";
    ctx.beginPath();
    ctx.moveTo(dx, dy - diamondSize);
    ctx.lineTo(dx + diamondSize, dy);
    ctx.lineTo(dx, dy + diamondSize);
    ctx.lineTo(dx - diamondSize, dy);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Execute the reparent operation.
 */
export function executeDropReparent(
  engine: Engine,
  nodeIds: number[],
  target: DropTarget,
) {
  // Convert node positions from absolute to relative to new parent frame
  const json = (engine as any).get_layout_drop_zones(BigInt(target.frameId));
  if (!json || json === "null") return;
  let zone: LayoutDropZone;
  try { zone = JSON.parse(json); } catch { return; }

  let indexOffset = 0;
  for (const nodeId of nodeIds) {
    // Get current absolute position
    const nx = Number((engine as any).get_node_x(BigInt(nodeId)));
    const ny = Number((engine as any).get_node_y(BigInt(nodeId)));

    // Convert to relative position within frame
    const relX = nx - zone.frame_x;
    const relY = ny - zone.frame_y;

    // Reparent at the target index
    (engine as any).reparent_node_at(BigInt(nodeId), target.frameId, target.insertIndex + indexOffset);

    // Set relative position
    (engine as any).set_node_position(BigInt(nodeId), relX, relY);

    indexOffset++;
  }

  // Recompute layout
  try { (engine as any).recompute_layout(BigInt(target.frameId)); } catch {}
}

// ─── Helpers ───

function getAllFrameIds(engine: Engine): number[] {
  try {
    const json = (engine as any).get_auto_layout_frame_ids();
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

function isDescendant(engine: Engine, candidateFrameId: number, draggedIds: Set<number>): boolean {
  // Check if candidateFrameId is a descendant of any dragged node
  let current = candidateFrameId;
  for (let depth = 0; depth < 50; depth++) {
    const parentId = Number((engine as any).get_node_parent?.(BigInt(current)) ?? -1);
    if (parentId <= 0) return false;
    if (draggedIds.has(parentId)) return true;
    current = parentId;
  }
  return false;
}
