/**
 * Canvas-based gradient handle editor.
 * Shows draggable handles when a node with gradient fill is selected.
 */
import type { Engine } from "../wasm/opensketch_engine";

interface GradientHandle {
  type: "linear-start" | "linear-end" | "radial-center" | "radial-radius";
  fillIndex: number;
}

export class GradientEditor {
  private engine: Engine;
  private requestRender: () => void;
  private pushUndo: () => void;
  private refreshSelection: () => void;
  private dragging: GradientHandle | null = null;
  private _undoPushed = false;

  /** Currently active node id (set externally via activate/deactivate). */
  nodeId: number | null = null;

  constructor(
    engine: Engine,
    requestRender: () => void,
    pushUndo: () => void,
    refreshSelection: () => void,
  ) {
    this.engine = engine;
    this.requestRender = requestRender;
    this.pushUndo = pushUndo;
    this.refreshSelection = refreshSelection;
  }

  /** Activate for a node. Called when selection changes. */
  activate(nodeId: number) {
    this.nodeId = nodeId;
  }

  deactivate() {
    this.nodeId = null;
    this.dragging = null;
  }

  private getGradientFills(): any[] {
    if (this.nodeId == null) return [];
    try {
      const json = this.engine.get_fills(BigInt(this.nodeId));
      const fills: any[] = JSON.parse(json || "[]");
      return fills.filter((f: any) =>
        (f.type === "LinearGradient" || f.type === "RadialGradient") && f.visible !== false
      );
    } catch { return []; }
  }

  private getNodeBounds(): { x: number; y: number; w: number; h: number } | null {
    if (this.nodeId == null) return null;
    try {
      const json = this.engine.get_node_json(BigInt(this.nodeId));
      if (!json) return null;
      const n = JSON.parse(json);
      return { x: n.x, y: n.y, w: n.width, h: n.height };
    } catch { return null; }
  }

  private toScreen(nx: number, ny: number, b: { x: number; y: number; w: number; h: number }, zoom: number, panX: number, panY: number) {
    return { sx: (b.x + nx * b.w) * zoom + panX, sy: (b.y + ny * b.h) * zoom + panY };
  }

  private toNorm(sx: number, sy: number, b: { x: number; y: number; w: number; h: number }, zoom: number, panX: number, panY: number) {
    return { nx: ((sx - panX) / zoom - b.x) / b.w, ny: ((sy - panY) / zoom - b.y) / b.h };
  }

  /** Render handles. Called from editor render loop. */
  render(ctx: CanvasRenderingContext2D, zoom: number, panX: number, panY: number) {
    if (this.nodeId == null) return;
    const fills = this.getGradientFills();
    const bounds = this.getNodeBounds();
    if (!bounds || fills.length === 0) return;

    ctx.save();
    for (const fill of fills) {
      if (fill.type === "LinearGradient") {
        this.renderLinear(ctx, fill, bounds, zoom, panX, panY);
      } else {
        this.renderRadial(ctx, fill, bounds, zoom, panX, panY);
      }
    }
    ctx.restore();
  }

  private renderLinear(ctx: CanvasRenderingContext2D, fill: any, b: any, zoom: number, panX: number, panY: number) {
    const s = this.toScreen(fill.start_x, fill.start_y, b, zoom, panX, panY);
    const e = this.toScreen(fill.end_x, fill.end_y, b, zoom, panX, panY);
    const idx = fill.index;

    // Connecting line
    ctx.beginPath();
    ctx.moveTo(s.sx, s.sy);
    ctx.lineTo(e.sx, e.sy);
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = "rgba(79,70,229,0.8)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Gradient preview bar on line
    const len = Math.hypot(e.sx - s.sx, e.sy - s.sy);
    if (len > 24 && fill.stops?.length >= 2) {
      ctx.save();
      const angle = Math.atan2(e.sy - s.sy, e.sx - s.sx);
      const mx = (s.sx + e.sx) / 2, my = (s.sy + e.sy) / 2;
      const barW = Math.min(len - 20, 100), barH = 6;
      ctx.translate(mx, my);
      ctx.rotate(angle);
      const grad = ctx.createLinearGradient(-barW / 2, 0, barW / 2, 0);
      for (const st of fill.stops) grad.addColorStop(st.offset, `rgba(${st.r},${st.g},${st.b},${st.a})`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(-barW / 2, -barH / 2, barW, barH, 3);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.restore();
    }

    const isDrag = this.dragging;
    this.drawCircleHandle(ctx, s.sx, s.sy, fill.stops?.[0], isDrag?.type === "linear-start" && isDrag.fillIndex === idx);
    this.drawCircleHandle(ctx, e.sx, e.sy, fill.stops?.[fill.stops.length - 1], isDrag?.type === "linear-end" && isDrag.fillIndex === idx);
  }

  private renderRadial(ctx: CanvasRenderingContext2D, fill: any, b: any, zoom: number, panX: number, panY: number) {
    const c = this.toScreen(fill.center_x, fill.center_y, b, zoom, panX, panY);
    const rPx = fill.radius * Math.max(b.w, b.h) * zoom;
    const idx = fill.index;

    // Radius circle
    ctx.beginPath();
    ctx.arc(c.sx, c.sy, rPx, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(79,70,229,0.35)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    const rhx = c.sx + rPx, rhy = c.sy;
    ctx.beginPath();
    ctx.moveTo(c.sx, c.sy);
    ctx.lineTo(rhx, rhy);
    ctx.strokeStyle = "rgba(79,70,229,0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const isDrag = this.dragging;
    this.drawCircleHandle(ctx, c.sx, c.sy, fill.stops?.[0], isDrag?.type === "radial-center" && isDrag.fillIndex === idx);
    this.drawDiamondHandle(ctx, rhx, rhy, fill.stops?.[fill.stops.length - 1], isDrag?.type === "radial-radius" && isDrag.fillIndex === idx);
  }

  private drawCircleHandle(ctx: CanvasRenderingContext2D, x: number, y: number, stop: any, hl: boolean) {
    const r = hl ? 7 : 6;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = stop ? `rgba(${stop.r},${stop.g},${stop.b},${stop.a})` : "#4f46e5";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
    if (hl) { ctx.strokeStyle = "rgba(79,70,229,0.8)"; ctx.lineWidth = 1; ctx.stroke(); }
  }

  private drawDiamondHandle(ctx: CanvasRenderingContext2D, x: number, y: number, stop: any, hl: boolean) {
    const r = hl ? 7 : 6;
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fillStyle = stop ? `rgba(${stop.r},${stop.g},${stop.b},${stop.a})` : "#4f46e5";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
    if (hl) { ctx.strokeStyle = "rgba(79,70,229,0.8)"; ctx.lineWidth = 1; ctx.stroke(); }
  }

  private hitTest(sx: number, sy: number, zoom: number, panX: number, panY: number): GradientHandle | null {
    const fills = this.getGradientFills();
    const b = this.getNodeBounds();
    if (!b) return null;

    const th = 10;
    for (const fill of fills) {
      if (fill.type === "LinearGradient") {
        const e = this.toScreen(fill.end_x, fill.end_y, b, zoom, panX, panY);
        if (Math.hypot(sx - e.sx, sy - e.sy) < th) return { type: "linear-end", fillIndex: fill.index };
        const s = this.toScreen(fill.start_x, fill.start_y, b, zoom, panX, panY);
        if (Math.hypot(sx - s.sx, sy - s.sy) < th) return { type: "linear-start", fillIndex: fill.index };
      } else if (fill.type === "RadialGradient") {
        const c = this.toScreen(fill.center_x, fill.center_y, b, zoom, panX, panY);
        const rPx = fill.radius * Math.max(b.w, b.h) * zoom;
        const rhx = c.sx + rPx, rhy = c.sy;
        if (Math.hypot(sx - rhx, sy - rhy) < th) return { type: "radial-radius", fillIndex: fill.index };
        if (Math.hypot(sx - c.sx, sy - c.sy) < th) return { type: "radial-center", fillIndex: fill.index };
      }
    }
    return null;
  }

  onPointerDown(sx: number, sy: number, zoom: number, panX: number, panY: number): boolean {
    if (this.nodeId == null) return false;
    const handle = this.hitTest(sx, sy, zoom, panX, panY);
    if (handle) {
      this.pushUndo();
      this._undoPushed = true;
      this.dragging = handle;
      return true;
    }
    return false;
  }

  onPointerMove(sx: number, sy: number, zoom: number, panX: number, panY: number): boolean {
    if (this.nodeId == null || !this.dragging) return false;
    const b = this.getNodeBounds();
    if (!b) return false;
    const { nx, ny } = this.toNorm(sx, sy, b, zoom, panX, panY);
    this.applyDrag(this.dragging, nx, ny, b, zoom, panX, panY);
    this.requestRender();
    return true;
  }

  onPointerUp(): boolean {
    if (this.dragging) {
      this.dragging = null;
      this._undoPushed = false;
      this.refreshSelection();
      this.requestRender();
      return true;
    }
    return false;
  }

  getCursor(sx: number, sy: number, zoom: number, panX: number, panY: number): string | null {
    if (this.nodeId == null) return null;
    if (this.dragging) return "grabbing";
    if (this.hitTest(sx, sy, zoom, panX, panY)) return "grab";
    return null;
  }

  private applyDrag(handle: GradientHandle, nx: number, ny: number, b: any, zoom: number, panX: number, panY: number) {
    if (this.nodeId == null) return;
    const id = BigInt(this.nodeId);
    try {
      const fillsJson = this.engine.get_fills(id);
      const fills: any[] = JSON.parse(fillsJson || "[]");
      const fill = fills[handle.fillIndex];
      if (!fill) return;
      const stopsJson = JSON.stringify(fill.stops || []);

      if (handle.type === "linear-start") {
        this.engine.set_fill_linear_gradient_at(id, handle.fillIndex, nx, ny, fill.end_x, fill.end_y, stopsJson);
      } else if (handle.type === "linear-end") {
        this.engine.set_fill_linear_gradient_at(id, handle.fillIndex, fill.start_x, fill.start_y, nx, ny, stopsJson);
      } else if (handle.type === "radial-center") {
        this.engine.set_fill_radial_gradient_at(id, handle.fillIndex, nx, ny, fill.radius, stopsJson);
      } else if (handle.type === "radial-radius") {
        const c = this.toScreen(fill.center_x, fill.center_y, b, zoom, panX, panY);
        const distPx = Math.hypot(
          (b.x + nx * b.w) * zoom + panX - c.sx,
          (b.y + ny * b.h) * zoom + panY - c.sy
        );
        const newR = Math.max(0.01, distPx / (Math.max(b.w, b.h) * zoom));
        this.engine.set_fill_radial_gradient_at(id, handle.fillIndex, fill.center_x, fill.center_y, newR, stopsJson);
      }
    } catch { /* ignore */ }
  }
}
