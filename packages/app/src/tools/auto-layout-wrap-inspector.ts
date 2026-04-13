import type { Engine } from "../wasm/opensketch_engine";

export type WrapLineInfo = {
  index: number;
  childIds: number[];
  firstChildId: number;
  bounds: { x: number; y: number; w: number; h: number };
  averageGap: number;
};

export type WrapInspectorModel = {
  frameId: number;
  direction: "row" | "column";
  lines: WrapLineInfo[];
  missingBreakBeforeChildIds: number[];
};

export function computeWrapInspectorModel(engine: Engine, frameId: number): WrapInspectorModel | null {
  try {
    const raw = engine.get_node_json(BigInt(frameId));
    if (!raw) return null;
    const frame = JSON.parse(raw);
    const layout = frame?.layout;
    if (!layout || layout.mode !== "Flex" || layout.wrap !== "Wrap") return null;

    const direction: "row" | "column" = layout.direction === "Column" ? "column" : "row";
    const children: any[] = (frame.children || [])
      .map((cid: number) => {
        try {
          const cj = engine.get_node_json(BigInt(cid));
          return cj ? JSON.parse(cj) : null;
        } catch {
          return null;
        }
      })
      .filter((n: any) => n && n.visible !== false && !n.absolute_position);

    if (children.length === 0) return null;

    const lines: WrapLineInfo[] = [];
    const missingBreakBeforeChildIds: number[] = [];
    const tol = 0.5;

    let current: any[] = [];
    let prev: any | null = null;

    const flush = () => {
      if (current.length === 0) return;
      const xs = current.map((n) => Number(n.x) || 0);
      const ys = current.map((n) => Number(n.y) || 0);
      const rights = current.map((n) => (Number(n.x) || 0) + (Number(n.width) || 0));
      const bottoms = current.map((n) => (Number(n.y) || 0) + (Number(n.height) || 0));
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...rights);
      const maxY = Math.max(...bottoms);
      const sorted = [...current].sort((a, b) => direction === "row" ? a.x - b.x : a.y - b.y);
      const gaps: number[] = [];
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i];
        const b = sorted[i + 1];
        const g = direction === "row"
          ? (Number(b.x) || 0) - ((Number(a.x) || 0) + (Number(a.width) || 0))
          : (Number(b.y) || 0) - ((Number(a.y) || 0) + (Number(a.height) || 0));
        if (Number.isFinite(g)) gaps.push(g);
      }
      const averageGap = gaps.length > 0 ? gaps.reduce((s, v) => s + v, 0) / gaps.length : 0;
      lines.push({
        index: lines.length,
        childIds: current.map((n) => Number(n.id)),
        firstChildId: Number(current[0].id),
        bounds: { x: minX, y: minY, w: Math.max(0, maxX - minX), h: Math.max(0, maxY - minY) },
        averageGap,
      });
      current = [];
    };

    for (const child of children) {
      const forcedBreak = !!child.wrap_before;
      const wrappedByGeometry = !!prev && (direction === "row"
        ? (Number(child.y) || 0) > (Number(prev.y) || 0) + tol
        : (Number(child.x) || 0) > (Number(prev.x) || 0) + tol);
      const shouldBreak = current.length > 0 && (forcedBreak || wrappedByGeometry);

      if (shouldBreak) {
        if (wrappedByGeometry && !forcedBreak) {
          missingBreakBeforeChildIds.push(Number(child.id));
        }
        flush();
      }
      current.push(child);
      prev = child;
    }
    flush();

    return { frameId, direction, lines, missingBreakBeforeChildIds };
  } catch {
    return null;
  }
}

export function renderWrapInspectorOverlay(
  ctx: CanvasRenderingContext2D,
  model: WrapInspectorModel | null,
  zoom: number,
  panX: number,
  panY: number,
) {
  if (!model || model.lines.length === 0) return;
  ctx.save();
  ctx.font = "11px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  for (const line of model.lines) {
    const sx = line.bounds.x * zoom + panX;
    const sy = line.bounds.y * zoom + panY;
    const sw = Math.max(1, line.bounds.w * zoom);
    const sh = Math.max(1, line.bounds.h * zoom);

    ctx.strokeStyle = "rgba(56,189,248,0.9)";
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1;
    ctx.strokeRect(sx, sy, sw, sh);

    const label = `L${line.index + 1} · gap ${Math.round(line.averageGap * 10) / 10}px`;
    const lw = Math.max(48, ctx.measureText(label).width + 12);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(15,23,42,0.92)";
    ctx.strokeStyle = "rgba(56,189,248,0.9)";
    ctx.beginPath();
    ctx.roundRect(sx + 2, sy + 2, lw, 18, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#bae6fd";
    ctx.fillText(label, sx + 8, sy + 6);
  }

  ctx.restore();
}
