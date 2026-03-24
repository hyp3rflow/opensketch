/**
 * Auto-layout spacing handles — drag-to-adjust gap between children.
 * Shows pink/magenta gap indicators between auto-layout children.
 * Drag to resize the gap value in real time.
 */
import type { Engine } from "../wasm/opensketch_engine";

export interface SpacingHandle {
  /** Parent frame ID */
  parentId: number;
  /** Index of gap (between child[i] and child[i+1]) */
  gapIndex: number;
  /** Screen-space bounds of the gap region */
  sx: number; sy: number; sw: number; sh: number;
  /** Layout direction */
  direction: "row" | "column";
}

/** Find all gap regions for auto-layout frames in the current selection. */
export function findSpacingHandles(engine: Engine): SpacingHandle[] {
  const handles: SpacingHandle[] = [];
  try {
    const sel = Array.from(engine.get_selection()).map(Number);
    if (sel.length !== 1) return handles;
    const id = sel[0];
    const json = engine.get_node_json(BigInt(id));
    if (!json) return handles;
    const node = JSON.parse(json);
    // Must be a frame/group with auto layout
    if (node.kind !== "Frame" && node.kind !== "Group" && node.kind !== "Section") return handles;
    const layout = node.layout;
    if (!layout || layout.mode === "None") return handles;

    const zoom = engine.get_zoom();
    const panX = engine.get_pan_x();
    const panY = engine.get_pan_y();
    const isRow = layout.direction === "Row";
    const gap = layout.gap || 0;

    // Get visible, non-absolute children
    const children: any[] = (node.children || [])
      .map((cid: number) => {
        try {
          const cj = engine.get_node_json(BigInt(cid));
          return cj ? JSON.parse(cj) : null;
        } catch { return null; }
      })
      .filter((c: any) => c && c.visible !== false && !c.absolute_position);

    if (children.length < 2) return handles;

    // Build gap regions between consecutive children
    for (let i = 0; i < children.length - 1; i++) {
      const a = children[i];
      const b = children[i + 1];

      let gx: number, gy: number, gw: number, gh: number;
      if (isRow) {
        // Gap is horizontal between a.right and b.left
        const aRight = a.x + a.width;
        gx = aRight;
        gy = Math.min(a.y, b.y);
        gw = b.x - aRight;
        gh = Math.max(a.y + a.height, b.y + b.height) - gy;
      } else {
        // Gap is vertical between a.bottom and b.top
        const aBottom = a.y + a.height;
        gx = Math.min(a.x, b.x);
        gy = aBottom;
        gw = Math.max(a.x + a.width, b.x + b.width) - gx;
        gh = b.y - aBottom;
      }

      // Convert to screen coords
      const sx = gx * zoom + panX;
      const sy = gy * zoom + panY;
      const sw = gw * zoom;
      const sh = gh * zoom;

      handles.push({
        parentId: id,
        gapIndex: i,
        sx, sy, sw, sh,
        direction: isRow ? "row" : "column",
      });
    }
  } catch { /* ignore */ }
  return handles;
}

/** Hit test: is (screenX, screenY) over a spacing handle? */
export function hitTestSpacingHandle(handles: SpacingHandle[], sx: number, sy: number): SpacingHandle | null {
  for (const h of handles) {
    // Expand thin gaps for easier grabbing (min 6px)
    const minSize = 6;
    let hx = h.sx, hy = h.sy, hw = h.sw, hh = h.sh;
    if (h.direction === "row" && hw < minSize) {
      const expand = (minSize - hw) / 2;
      hx -= expand; hw = minSize;
    }
    if (h.direction === "column" && hh < minSize) {
      const expand = (minSize - hh) / 2;
      hy -= expand; hh = minSize;
    }
    if (sx >= hx && sx <= hx + hw && sy >= hy && sy <= hy + hh) {
      return h;
    }
  }
  return null;
}

/** Render spacing handle overlays. */
export function renderSpacingHandles(
  ctx: CanvasRenderingContext2D,
  handles: SpacingHandle[],
  hovered: SpacingHandle | null,
  dragging: SpacingHandle | null,
) {
  for (const h of handles) {
    const isActive = (dragging && dragging.gapIndex === h.gapIndex) || (hovered && hovered.gapIndex === h.gapIndex);
    const alpha = isActive ? 0.4 : 0.15;
    ctx.fillStyle = `rgba(236, 72, 153, ${alpha})`;

    // Don't render if gap is essentially 0
    if (Math.abs(h.sw) < 0.5 && Math.abs(h.sh) < 0.5) continue;

    ctx.fillRect(h.sx, h.sy, h.sw, h.sh);

    // Draw gap value label
    if (isActive) {
      const gap = h.direction === "row" ? h.sw : h.sh;
      const zoom = 1; // already in screen space
      const label = Math.round(h.direction === "row" ? h.sw : h.sh).toString();
      const mx = h.sx + h.sw / 2;
      const my = h.sy + h.sh / 2;
      ctx.font = "10px Inter, system-ui, sans-serif";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(236, 72, 153, 0.9)";
      ctx.beginPath();
      ctx.roundRect(mx - tw / 2 - 4, my - 7, tw + 8, 14, 3);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, mx, my);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }
  }
}
