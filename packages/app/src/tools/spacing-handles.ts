/**
 * Smart spacing handles — Figma-style gap/padding indicators for:
 * 1. Auto-layout frames: drag to adjust gap value
 * 2. Auto-layout frames: padding overlay visualization + drag to adjust padding
 * 3. Multi-selection (3+ nodes): show spacing between free nodes, drag to set uniform spacing
 */
import type { Engine } from "../wasm/opensketch_engine";

export interface SpacingHandle {
  /** Parent frame ID (auto-layout) or -1 for free selection */
  parentId: number;
  /** Index of gap (between sorted node[i] and node[i+1]) */
  gapIndex: number;
  /** Screen-space bounds of the gap region */
  sx: number; sy: number; sw: number; sh: number;
  /** Layout direction */
  direction: "row" | "column";
  /** "autolayout" or "selection" mode */
  mode: "autolayout" | "selection";
  /** For selection mode: the axis */
  axis?: "horizontal" | "vertical";
}

export interface PaddingHandle {
  /** Parent frame ID */
  parentId: number;
  /** Which padding edge: top/right/bottom/left */
  side: "top" | "right" | "bottom" | "left";
  /** Screen-space bounds of the padding region */
  sx: number; sy: number; sw: number; sh: number;
  /** Current padding value in scene pixels */
  value: number;
}

/** Find all gap regions for auto-layout frames OR multi-selected free nodes. */
export function findSpacingHandles(engine: Engine): SpacingHandle[] {
  const handles: SpacingHandle[] = [];
  try {
    const sel = Array.from(engine.get_selection()).map(Number);

    // Case 1: Single auto-layout frame selected — show child gaps
    if (sel.length === 1) {
      return findAutoLayoutHandles(engine, sel[0]);
    }

    // Case 2: 3+ nodes selected — show spacing between them
    if (sel.length >= 3) {
      return findSelectionSpacingHandles(engine, sel);
    }
  } catch { /* ignore */ }
  return handles;
}

function findAutoLayoutHandles(engine: Engine, id: number): SpacingHandle[] {
  const handles: SpacingHandle[] = [];
  try {
    const json = engine.get_node_json(BigInt(id));
    if (!json) return handles;
    const node = JSON.parse(json);
    if (node.kind !== "Frame" && node.kind !== "Group" && node.kind !== "Section") return handles;
    const layout = node.layout;
    if (!layout || layout.mode === "None") return handles;

    const zoom = engine.get_zoom();
    const panX = engine.get_pan_x();
    const panY = engine.get_pan_y();
    const isRow = layout.direction === "Row";

    const children: any[] = (node.children || [])
      .map((cid: number) => {
        try {
          const cj = engine.get_node_json(BigInt(cid));
          return cj ? JSON.parse(cj) : null;
        } catch { return null; }
      })
      .filter((c: any) => c && c.visible !== false && !c.absolute_position);

    if (children.length < 2) return handles;

    for (let i = 0; i < children.length - 1; i++) {
      const a = children[i];
      const b = children[i + 1];

      let gx: number, gy: number, gw: number, gh: number;
      if (isRow) {
        const aRight = a.x + a.width;
        gx = aRight; gy = Math.min(a.y, b.y);
        gw = b.x - aRight;
        gh = Math.max(a.y + a.height, b.y + b.height) - gy;
      } else {
        const aBottom = a.y + a.height;
        gx = Math.min(a.x, b.x); gy = aBottom;
        gw = Math.max(a.x + a.width, b.x + b.width) - gx;
        gh = b.y - aBottom;
      }

      handles.push({
        parentId: id,
        gapIndex: i,
        sx: gx * zoom + panX, sy: gy * zoom + panY,
        sw: gw * zoom, sh: gh * zoom,
        direction: isRow ? "row" : "column",
        mode: "autolayout",
      });
    }
  } catch { /* ignore */ }
  return handles;
}

function findSelectionSpacingHandles(engine: Engine, sel: number[]): SpacingHandle[] {
  const handles: SpacingHandle[] = [];
  try {
    const zoom = engine.get_zoom();
    const panX = engine.get_pan_x();
    const panY = engine.get_pan_y();

    // Get node bounds
    const nodes = sel.map(id => {
      try {
        const j = engine.get_node_json(BigInt(id));
        if (!j) return null;
        const n = JSON.parse(j);
        return { id, x: n.x, y: n.y, w: n.width, h: n.height };
      } catch { return null; }
    }).filter(Boolean) as { id: number; x: number; y: number; w: number; h: number }[];

    if (nodes.length < 3) return handles;

    // Determine dominant axis: check horizontal vs vertical spread
    const xs = nodes.map(n => n.x);
    const ys = nodes.map(n => n.y);
    const xSpread = Math.max(...xs) - Math.min(...xs);
    const ySpread = Math.max(...ys) - Math.min(...ys);

    // Check if nodes are roughly aligned on one axis
    const hSorted = [...nodes].sort((a, b) => a.x - b.x);
    const vSorted = [...nodes].sort((a, b) => a.y - b.y);

    // Horizontal gaps
    if (xSpread > 0) {
      const hGaps = [];
      let allPositive = true;
      for (let i = 0; i < hSorted.length - 1; i++) {
        const gap = hSorted[i + 1].x - (hSorted[i].x + hSorted[i].w);
        hGaps.push(gap);
        if (gap < -1) allPositive = false; // overlapping
      }

      if (allPositive || hGaps.some(g => g >= 0)) {
        for (let i = 0; i < hSorted.length - 1; i++) {
          const a = hSorted[i];
          const b = hSorted[i + 1];
          const gx = a.x + a.w;
          const gw = b.x - gx;
          if (gw < 0) continue; // skip overlapping
          const gy = Math.min(a.y, b.y);
          const gh = Math.max(a.y + a.h, b.y + b.h) - gy;

          handles.push({
            parentId: -1,
            gapIndex: i,
            sx: gx * zoom + panX, sy: gy * zoom + panY,
            sw: gw * zoom, sh: gh * zoom,
            direction: "row",
            mode: "selection",
            axis: "horizontal",
          });
        }
      }
    }

    // Vertical gaps (only if no horizontal handles or if vertical is dominant)
    if (ySpread > 0 && (handles.length === 0 || ySpread > xSpread * 1.5)) {
      // If we already have horizontal handles and vertical isn't dominant, skip
      if (handles.length > 0 && ySpread <= xSpread * 1.5) return handles;

      // Clear horizontal if vertical is dominant
      if (ySpread > xSpread * 1.5) handles.length = 0;

      for (let i = 0; i < vSorted.length - 1; i++) {
        const a = vSorted[i];
        const b = vSorted[i + 1];
        const gy = a.y + a.h;
        const gh = b.y - gy;
        if (gh < 0) continue;
        const gx = Math.min(a.x, b.x);
        const gw = Math.max(a.x + a.w, b.x + b.w) - gx;

        handles.push({
          parentId: -1,
          gapIndex: i,
          sx: gx * zoom + panX, sy: gy * zoom + panY,
          sw: gw * zoom, sh: gh * zoom,
          direction: "column",
          mode: "selection",
          axis: "vertical",
        });
      }
    }
  } catch { /* ignore */ }
  return handles;
}

/** Hit test: is (screenX, screenY) over a spacing handle? */
export function hitTestSpacingHandle(handles: SpacingHandle[], sx: number, sy: number): SpacingHandle | null {
  for (const h of handles) {
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
  // Check if spacing is uniform
  const gapValues = handles.map(h => h.direction === "row" ? h.sw : h.sh);
  const avg = gapValues.length > 0 ? gapValues.reduce((a, b) => a + b, 0) / gapValues.length : 0;
  const isUniform = gapValues.every(g => Math.abs(g - avg) < 1.5);

  for (const h of handles) {
    const isActive = (dragging && dragging.gapIndex === h.gapIndex && dragging.mode === h.mode) ||
                     (hovered && hovered.gapIndex === h.gapIndex && hovered.mode === h.mode);

    // Pink for positive, red-orange for negative (overlap)
    const gapSize = h.direction === "row" ? h.sw : h.sh;
    const isNegative = gapSize < -0.5;
    const baseColor = isNegative
      ? "rgba(255, 80, 50,"
      : h.mode === "selection"
        ? (isUniform ? "rgba(236, 72, 153," : "rgba(255, 100, 100,")
        : "rgba(236, 72, 153,";

    const alpha = isActive ? 0.45 : 0.2;
    ctx.fillStyle = baseColor + alpha + ")";

    if (Math.abs(h.sw) < 0.5 && Math.abs(h.sh) < 0.5) continue;

    ctx.fillRect(h.sx, h.sy, h.sw, h.sh);

    // Dashed border lines at edges
    ctx.save();
    ctx.strokeStyle = baseColor + "0.6)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    if (h.direction === "row") {
      // Left and right edges
      ctx.beginPath();
      ctx.moveTo(h.sx, h.sy); ctx.lineTo(h.sx, h.sy + h.sh);
      ctx.moveTo(h.sx + h.sw, h.sy); ctx.lineTo(h.sx + h.sw, h.sy + h.sh);
      ctx.stroke();
    } else {
      // Top and bottom edges
      ctx.beginPath();
      ctx.moveTo(h.sx, h.sy); ctx.lineTo(h.sx + h.sw, h.sy);
      ctx.moveTo(h.sx, h.sy + h.sh); ctx.lineTo(h.sx + h.sw, h.sy + h.sh);
      ctx.stroke();
    }
    ctx.restore();

    // Gap value label
    // Auto-layout mode keeps labels visible so users can scan + drag-edit inline without probing hover first.
    if (isActive || h.mode === "selection" || h.mode === "autolayout") {
      const gapPx = h.direction === "row" ? h.sw : h.sh;
      const label = Math.round(gapPx).toString();
      const mx = h.sx + h.sw / 2;
      const my = h.sy + h.sh / 2;
      ctx.font = "10px Inter, system-ui, sans-serif";
      const tw = ctx.measureText(label).width;

      // Pill background
      const pillColor = isNegative
        ? (isActive ? "rgba(255, 80, 50, 0.9)" : "rgba(255, 80, 50, 0.72)")
        : isUniform && h.mode === "selection"
          ? "rgba(236, 72, 153, 0.9)"
          : (isActive ? "rgba(236, 72, 153, 0.85)" : "rgba(236, 72, 153, 0.62)");
      ctx.fillStyle = pillColor;
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

  // Uniform indicator badge
  if (isUniform && handles.length >= 2 && handles[0]?.mode === "selection") {
    const lastH = handles[handles.length - 1];
    const bx = lastH.sx + lastH.sw / 2;
    const by = lastH.direction === "row" ? lastH.sy - 18 : lastH.sy + lastH.sh + 6;
    ctx.font = "9px Inter, system-ui, sans-serif";
    ctx.fillStyle = "rgba(34, 197, 94, 0.85)";
    const txt = "= Equal spacing";
    const tw = ctx.measureText(txt).width;
    ctx.beginPath();
    ctx.roundRect(bx - tw / 2 - 5, by - 6, tw + 10, 14, 4);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(txt, bx, by + 1);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  // Smart Select spacing quick actions hint
  if (hovered && hovered.mode === "selection") {
    const cx = hovered.sx + hovered.sw / 2;
    const cy = hovered.sy - 24;
    const hint = "Enter: value · E: equalize · A: auto-layout";
    ctx.font = "10px Inter, system-ui, sans-serif";
    const tw = ctx.measureText(hint).width;
    ctx.fillStyle = "rgba(17, 24, 39, 0.88)";
    ctx.beginPath();
    ctx.roundRect(cx - tw / 2 - 7, cy - 8, tw + 14, 16, 5);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(hint, cx, cy + 0.5);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }
}

/** Find padding regions for the selected auto-layout frame. */
export function findPaddingHandles(engine: Engine): PaddingHandle[] {
  const handles: PaddingHandle[] = [];
  try {
    const sel = Array.from(engine.get_selection()).map(Number);
    if (sel.length !== 1) return handles;
    const id = sel[0];
    const json = engine.get_node_json(BigInt(id));
    if (!json) return handles;
    const node = JSON.parse(json);
    if (node.kind !== "Frame" && node.kind !== "Group" && node.kind !== "Section") return handles;
    const layout = node.layout;
    if (!layout || layout.mode === "None") return handles;

    const zoom = engine.get_zoom();
    const panX = engine.get_pan_x();
    const panY = engine.get_pan_y();

    const pt = layout.padding_top ?? layout.padding ?? 0;
    const pr = layout.padding_right ?? layout.padding ?? 0;
    const pb = layout.padding_bottom ?? layout.padding ?? 0;
    const pl = layout.padding_left ?? layout.padding ?? 0;

    const fx = node.x, fy = node.y, fw = node.width, fh = node.height;

    // Show edge handles even when padding=0 so users can drag to add padding inline.
    // Keep a minimum hit strip in screen-space for usability.
    const minHitScene = 8 / Math.max(zoom, 0.01);
    const topH = Math.min(fh, Math.max(pt, minHitScene));
    const bottomH = Math.min(fh, Math.max(pb, minHitScene));
    const sideY = fy + pt;
    const sideH = Math.max(0, fh - pt - pb);
    const leftW = Math.min(fw, Math.max(pl, minHitScene));
    const rightW = Math.min(fw, Math.max(pr, minHitScene));

    // Top padding
    handles.push({
      parentId: id, side: "top", value: pt,
      sx: fx * zoom + panX, sy: fy * zoom + panY,
      sw: fw * zoom, sh: topH * zoom,
    });

    // Bottom padding
    handles.push({
      parentId: id, side: "bottom", value: pb,
      sx: fx * zoom + panX, sy: (fy + fh - bottomH) * zoom + panY,
      sw: fw * zoom, sh: bottomH * zoom,
    });

    // Left padding
    if (sideH > 0.0001) {
      handles.push({
        parentId: id, side: "left", value: pl,
        sx: fx * zoom + panX, sy: sideY * zoom + panY,
        sw: leftW * zoom, sh: sideH * zoom,
      });

      // Right padding
      handles.push({
        parentId: id, side: "right", value: pr,
        sx: (fx + fw - rightW) * zoom + panX, sy: sideY * zoom + panY,
        sw: rightW * zoom, sh: sideH * zoom,
      });
    }
  } catch { /* ignore */ }
  return handles;
}

/** Hit test padding handle. */
export function hitTestPaddingHandle(handles: PaddingHandle[], sx: number, sy: number): PaddingHandle | null {
  for (const h of handles) {
    if (sx >= h.sx && sx <= h.sx + h.sw && sy >= h.sy && sy <= h.sy + h.sh) {
      return h;
    }
  }
  return null;
}

/** Render padding overlays — green-tinted regions with value labels. */
export function renderPaddingHandles(
  ctx: CanvasRenderingContext2D,
  handles: PaddingHandle[],
  hovered: PaddingHandle | null,
  dragging: PaddingHandle | null,
) {
  for (const h of handles) {
    const isActive = (dragging && dragging.side === h.side && dragging.parentId === h.parentId) ||
                     (hovered && hovered.side === h.side && hovered.parentId === h.parentId);

    if (Math.abs(h.sw) < 0.5 || Math.abs(h.sh) < 0.5) continue;

    // Green tint for padding (distinct from pink gap overlays)
    const alpha = isActive ? 0.35 : 0.15;
    ctx.fillStyle = `rgba(52, 211, 153, ${alpha})`;
    ctx.fillRect(h.sx, h.sy, h.sw, h.sh);

    // Dashed inner edge
    ctx.save();
    ctx.strokeStyle = "rgba(52, 211, 153, 0.5)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    if (h.side === "top") {
      ctx.moveTo(h.sx, h.sy + h.sh); ctx.lineTo(h.sx + h.sw, h.sy + h.sh);
    } else if (h.side === "bottom") {
      ctx.moveTo(h.sx, h.sy); ctx.lineTo(h.sx + h.sw, h.sy);
    } else if (h.side === "left") {
      ctx.moveTo(h.sx + h.sw, h.sy); ctx.lineTo(h.sx + h.sw, h.sy + h.sh);
    } else {
      ctx.moveTo(h.sx, h.sy); ctx.lineTo(h.sx, h.sy + h.sh);
    }
    ctx.stroke();
    ctx.restore();

    // Value label (keep visible in idle state too for inline edit discoverability)
    const mx = h.sx + h.sw / 2;
    const my = h.sy + h.sh / 2;
    const label = Math.round(h.value).toString();
    ctx.font = "10px Inter, system-ui, sans-serif";
    const tw = ctx.measureText(label).width;

    ctx.fillStyle = isActive ? "rgba(16, 185, 129, 0.88)" : "rgba(16, 185, 129, 0.62)";
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

  if (hovered) {
    const cx = hovered.sx + hovered.sw / 2;
    const cy = hovered.sy - 24;
    const hint = "Enter: value · ↑↓/←→ nudge · Shift: ±10 · Alt-drag: mirror";
    ctx.font = "10px Inter, system-ui, sans-serif";
    const tw = ctx.measureText(hint).width;
    ctx.fillStyle = "rgba(6, 78, 59, 0.9)";
    ctx.beginPath();
    ctx.roundRect(cx - tw / 2 - 7, cy - 8, tw + 14, 16, 5);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(hint, cx, cy + 0.5);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }
}
