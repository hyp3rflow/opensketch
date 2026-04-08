/**
 * Responsive Auto-Layout Preview
 *
 * Interactive on-canvas frame resize mode with:
 * - Draggable width/height edge handles for real-time auto-layout preview
 * - Breakpoint indicator bar showing active breakpoint
 * - Live dimension display
 * - Breakpoint snapping while dragging
 */

export interface ResponsiveBreakpoint {
  label: string;
  width: number;
  color: string;
}

const DEFAULT_BREAKPOINTS: ResponsiveBreakpoint[] = [
  { label: "Mobile S", width: 320, color: "#e74c3c" },
  { label: "Mobile", width: 375, color: "#e67e22" },
  { label: "Tablet", width: 768, color: "#7b61ff" },
  { label: "Laptop", width: 1024, color: "#3498db" },
  { label: "Desktop", width: 1440, color: "#2ecc71" },
];

const BREAKPOINT_SNAP_PX = 8; // screen-px snap threshold near breakpoints
const EDGE_HANDLE_WIDTH = 6; // px width of the edge drag handles
const MIN_FRAME_SIZE = 40;

export class ResponsiveResize {
  private engine: any;
  private canvas: HTMLCanvasElement;
  private active = false;
  private targetNodeId: number | null = null;
  private breakpoints: ResponsiveBreakpoint[] = [...DEFAULT_BREAKPOINTS];

  // Overlay elements
  private overlayEl: HTMLDivElement | null = null;
  private rulerEl: HTMLDivElement | null = null;
  private dimLabel: HTMLDivElement | null = null;
  private bpLabel: HTMLDivElement | null = null;
  private debugEl: HTMLDivElement | null = null;

  // Drag state
  private dragging: "left" | "right" | "bottom" | null = null;
  private dragStartMouse = 0;
  private dragStartSize = 0;
  private dragStartPos = 0;
  private originalWidth = 0;
  private originalHeight = 0;
  private originalX = 0;
  private originalY = 0;
  private savedScene: string | null = null;

  // Callbacks
  private onRender: (() => void) | null = null;

  constructor(engine: any, canvas: HTMLCanvasElement) {
    this.engine = engine;
    this.canvas = canvas;
  }

  get isActive() {
    return this.active;
  }

  setRenderCallback(cb: () => void) {
    this.onRender = cb;
  }

  setBreakpoints(bps: ResponsiveBreakpoint[]) {
    this.breakpoints = bps.length > 0 ? bps : [...DEFAULT_BREAKPOINTS];
    if (this.active) this.updateOverlay();
  }

  getBreakpoints(): ResponsiveBreakpoint[] {
    return [...this.breakpoints];
  }

  activate(nodeId?: number) {
    // Determine target node
    if (nodeId != null) {
      this.targetNodeId = nodeId;
    } else {
      const sel = this.engine.get_selection();
      if (!sel || sel.length !== 1) {
        this.showToast("Select a single Frame for responsive preview");
        return false;
      }
      this.targetNodeId = Number(sel[0]);
    }

    // Verify it's a Frame/Section
    const json = this.engine.get_node_json(BigInt(this.targetNodeId));
    if (!json) return false;
    const node = JSON.parse(json);
    const kind = typeof node.kind === "string" ? node.kind : Object.keys(node.kind)[0];
    if (kind !== "Frame" && kind !== "Section") {
      this.showToast("Select a Frame or Section for responsive preview");
      return false;
    }

    // Check that it has auto-layout
    const hasLayout = node.layout && node.layout.mode && node.layout.mode !== "None";

    this.originalWidth = node.width;
    this.originalHeight = node.height;
    this.originalX = node.x;
    this.originalY = node.y;

    // Save scene for reset
    this.savedScene = this.engine.export_scene();

    this.active = true;
    this.createOverlay();
    this.updateOverlay();

    return true;
  }

  deactivate(restore = false) {
    if (!this.active) return;

    if (restore && this.savedScene) {
      this.engine.import_scene(this.savedScene);
    }

    this.active = false;
    this.targetNodeId = null;
    this.savedScene = null;
    this.dragging = null;
    this.removeOverlay();
    if (this.onRender) this.onRender();
  }

  // ========================
  // Overlay UI
  // ========================

  private createOverlay() {
    this.removeOverlay();

    this.overlayEl = document.createElement("div");
    this.overlayEl.id = "responsive-resize-overlay";
    this.overlayEl.innerHTML = `
      <style>${this.getStyles()}</style>
      <div class="rr-topbar">
        <div class="rr-topbar-left">
          <span class="rr-icon">📐</span>
          <span class="rr-title">Responsive Preview</span>
        </div>
        <div class="rr-ruler" id="rr-ruler"></div>
        <div class="rr-topbar-right">
          <button class="rr-btn rr-reset" title="Reset to original size">Reset</button>
          <button class="rr-btn rr-done" title="Apply & close">Done</button>
          <button class="rr-btn rr-cancel" title="Cancel (Esc)">✕</button>
        </div>
      </div>
      <div class="rr-dim-label" id="rr-dim-label"></div>
      <div class="rr-bp-label" id="rr-bp-label"></div>
      <div class="rr-constraint-debug" id="rr-constraint-debug"></div>
    `;

    document.body.appendChild(this.overlayEl);

    this.rulerEl = this.overlayEl.querySelector("#rr-ruler") as HTMLDivElement;
    this.dimLabel = this.overlayEl.querySelector("#rr-dim-label") as HTMLDivElement;
    this.bpLabel = this.overlayEl.querySelector("#rr-bp-label") as HTMLDivElement;
    this.debugEl = this.overlayEl.querySelector("#rr-constraint-debug") as HTMLDivElement;

    // Events
    this.overlayEl.querySelector(".rr-reset")!.addEventListener("click", () => {
      if (this.savedScene) {
        this.engine.import_scene(this.savedScene);
        if (this.onRender) this.onRender();
        this.updateOverlay();
      }
    });
    this.overlayEl.querySelector(".rr-done")!.addEventListener("click", () => {
      this.deactivate(false); // keep changes
    });
    this.overlayEl.querySelector(".rr-cancel")!.addEventListener("click", () => {
      this.deactivate(true); // restore original
    });
  }

  private removeOverlay() {
    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
      this.rulerEl = null;
      this.dimLabel = null;
      this.bpLabel = null;
      this.debugEl = null;
    }
  }

  private updateOverlay() {
    if (!this.overlayEl || this.targetNodeId == null) return;

    const json = this.engine.get_node_json(BigInt(this.targetNodeId));
    if (!json) return;
    const node = JSON.parse(json);
    const w = node.width;
    const h = node.height;

    // Update dimension label
    if (this.dimLabel) {
      this.dimLabel.textContent = `${Math.round(w)} × ${Math.round(h)}`;
      this.dimLabel.style.display = "block";

      // Position near top-center of the frame
      const zoom = this.engine.get_zoom();
      const panX = this.engine.get_pan_x();
      const panY = this.engine.get_pan_y();
      const screenX = (node.x + w / 2) * zoom + panX;
      const screenY = node.y * zoom + panY - 30;
      this.dimLabel.style.left = `${screenX}px`;
      this.dimLabel.style.top = `${Math.max(50, screenY)}px`;
    }

    // Find active breakpoint
    const activeBp = this.findActiveBreakpoint(w);
    if (this.bpLabel) {
      if (activeBp) {
        this.bpLabel.textContent = activeBp.label;
        this.bpLabel.style.background = activeBp.color;
        this.bpLabel.style.display = "block";
        // Position below dim label
        const zoom = this.engine.get_zoom();
        const panX = this.engine.get_pan_x();
        const panY = this.engine.get_pan_y();
        const screenX = (node.x + w / 2) * zoom + panX;
        const screenY = node.y * zoom + panY - 8;
        this.bpLabel.style.left = `${screenX}px`;
        this.bpLabel.style.top = `${Math.max(70, screenY)}px`;
      } else {
        this.bpLabel.style.display = "none";
      }
    }

    // Update breakpoint ruler
    this.updateRuler(w);
    this.renderConstraintDebug(node);
  }


  private renderConstraintDebug(parentNode: any) {
    if (!this.debugEl || this.targetNodeId == null) return;
    const parentW0 = this.originalWidth || parentNode.width;
    const parentH0 = this.originalHeight || parentNode.height;
    const parentW = Number(parentNode.width || 0);
    const parentH = Number(parentNode.height || 0);
    const dw = parentW - parentW0;
    const dh = parentH - parentH0;

    const childIds: number[] = Array.isArray(parentNode.children) ? parentNode.children.map((x: any) => Number(x)) : [];
    if (childIds.length === 0) {
      this.debugEl.style.display = "none";
      return;
    }

    const rows: string[] = [];
    for (const childId of childIds.slice(0, 8)) {
      const childJson = this.engine.get_node_json(BigInt(childId));
      if (!childJson) continue;
      const child = JSON.parse(childJson);
      let c = { horizontal: "left", vertical: "top" };
      try {
        c = JSON.parse(this.engine.get_constraints(BigInt(childId)) || "{}") || c;
      } catch {}
      const h = String(c.horizontal || "left");
      const v = String(c.vertical || "top");
      const hRule = this.describeConstraintAxis(h, dw, "x", "w");
      const vRule = this.describeConstraintAxis(v, dh, "y", "h");
      rows.push(`<div class="rr-cd-row"><span class="rr-cd-name">${this.escapeHtml(child.name || `Layer ${childId}`)}</span><span class="rr-cd-rule">H:${h} → ${hRule}</span><span class="rr-cd-rule">V:${v} → ${vRule}</span></div>`);
    }

    const more = childIds.length > 8 ? `<div class="rr-cd-more">+${childIds.length - 8} more children…</div>` : "";
    this.debugEl.innerHTML = `<div class="rr-cd-title">Constraint Debug Overlay</div><div class="rr-cd-meta">ΔW ${dw.toFixed(1)} / ΔH ${dh.toFixed(1)}</div>${rows.join("")}${more}`;
    this.debugEl.style.display = "block";
  }

  private describeConstraintAxis(mode: string, delta: number, posAxis: string, sizeAxis: string): string {
    const d = delta.toFixed(1);
    if (mode === "left" || mode === "top") return `${posAxis} fixed`;
    if (mode === "right" || mode === "bottom") return `${posAxis} + ${d}`;
    if (mode === "leftAndRight" || mode === "topAndBottom") return `${sizeAxis} + ${d}`;
    if (mode === "center") return `${posAxis} + ${(delta / 2).toFixed(1)}`;
    if (mode === "scale") return `${posAxis}/${sizeAxis} scale`;
    return "-";
  }

  private escapeHtml(text: string): string {
    return text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  private updateRuler(currentWidth: number) {
    if (!this.rulerEl) return;

    const maxW = Math.max(...this.breakpoints.map(b => b.width), currentWidth) + 100;
    const rulerWidth = this.rulerEl.clientWidth || 400;
    const scale = rulerWidth / maxW;

    let html = `<div class="rr-ruler-track">`;
    // Current width indicator
    const cwPx = currentWidth * scale;
    html += `<div class="rr-ruler-current" style="width:${cwPx}px"></div>`;

    // Breakpoint markers
    for (const bp of this.breakpoints) {
      const bpPx = bp.width * scale;
      const isActive = currentWidth <= bp.width && (!this.findSmallerMatchingBp(currentWidth, bp));
      html += `<div class="rr-ruler-bp${isActive ? " active" : ""}" style="left:${bpPx}px; border-color:${bp.color}" title="${bp.label}: ${bp.width}px">
        <span class="rr-ruler-bp-label" style="color:${bp.color}">${bp.label}</span>
      </div>`;
    }

    html += `</div>`;
    this.rulerEl.innerHTML = html;
  }

  private findActiveBreakpoint(width: number): ResponsiveBreakpoint | null {
    // Find smallest breakpoint where width <= bp.width
    const sorted = [...this.breakpoints].sort((a, b) => a.width - b.width);
    for (const bp of sorted) {
      if (width <= bp.width) return bp;
    }
    return null;
  }

  private findSmallerMatchingBp(width: number, exclude: ResponsiveBreakpoint): boolean {
    return this.breakpoints.some(bp => bp !== exclude && bp.width < exclude.width && width <= bp.width);
  }

  // ========================
  // Canvas overlay rendering
  // ========================

  renderOverlay(ctx: CanvasRenderingContext2D) {
    if (!this.active || this.targetNodeId == null) return;

    const json = this.engine.get_node_json(BigInt(this.targetNodeId));
    if (!json) return;
    const node = JSON.parse(json);

    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();

    const sx = node.x * zoom + panX;
    const sy = node.y * zoom + panY;
    const sw = node.width * zoom;
    const sh = node.height * zoom;

    // Draw frame outline
    ctx.save();
    ctx.strokeStyle = "#4a90d9";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(sx, sy, sw, sh);
    ctx.setLineDash([]);

    // Draw edge handles (right)
    this.drawEdgeHandle(ctx, sx + sw - EDGE_HANDLE_WIDTH / 2, sy + sh * 0.2, EDGE_HANDLE_WIDTH, sh * 0.6, this.dragging === "right");

    // Draw edge handle (left)
    this.drawEdgeHandle(ctx, sx - EDGE_HANDLE_WIDTH / 2, sy + sh * 0.2, EDGE_HANDLE_WIDTH, sh * 0.6, this.dragging === "left");

    // Draw edge handle (bottom)
    this.drawEdgeHandle(ctx, sx + sw * 0.2, sy + sh - EDGE_HANDLE_WIDTH / 2, sw * 0.6, EDGE_HANDLE_WIDTH, this.dragging === "bottom");

    // Draw breakpoint lines
    for (const bp of this.breakpoints) {
      const bpScreenX = node.x * zoom + panX + bp.width * zoom;
      if (bpScreenX > sx && bpScreenX < sx + sw + 200 * zoom) {
        ctx.strokeStyle = bp.color + "60";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(bpScreenX, sy - 20);
        ctx.lineTo(bpScreenX, sy + sh + 20);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label
        ctx.font = "10px -apple-system, sans-serif";
        ctx.fillStyle = bp.color;
        ctx.textAlign = "center";
        ctx.fillText(`${bp.label} (${bp.width})`, bpScreenX, sy - 24);
      }
    }

    // Width measurement arrows
    ctx.strokeStyle = "#4a90d9";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx, sy + sh + 16);
    ctx.lineTo(sx + sw, sy + sh + 16);
    ctx.stroke();
    // Ticks
    ctx.beginPath();
    ctx.moveTo(sx, sy + sh + 10);
    ctx.lineTo(sx, sy + sh + 22);
    ctx.moveTo(sx + sw, sy + sh + 10);
    ctx.lineTo(sx + sw, sy + sh + 22);
    ctx.stroke();

    // Width label below
    ctx.font = "bold 11px -apple-system, sans-serif";
    ctx.fillStyle = "#4a90d9";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(node.width)}px`, sx + sw / 2, sy + sh + 34);

    ctx.restore();
  }

  private drawEdgeHandle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, active: boolean) {
    ctx.fillStyle = active ? "#4a90d9" : "rgba(74,144,217,0.5)";
    ctx.beginPath();
    const r = Math.min(w, h) / 2;
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    if (active) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // ========================
  // Pointer event handling
  // ========================

  hitTestEdge(screenX: number, screenY: number): "left" | "right" | "bottom" | null {
    if (!this.active || this.targetNodeId == null) return null;

    const json = this.engine.get_node_json(BigInt(this.targetNodeId));
    if (!json) return null;
    const node = JSON.parse(json);

    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();

    const sx = node.x * zoom + panX;
    const sy = node.y * zoom + panY;
    const sw = node.width * zoom;
    const sh = node.height * zoom;

    const hitPad = 8;

    // Right edge
    if (Math.abs(screenX - (sx + sw)) < hitPad && screenY > sy + sh * 0.1 && screenY < sy + sh * 0.9) {
      return "right";
    }
    // Left edge
    if (Math.abs(screenX - sx) < hitPad && screenY > sy + sh * 0.1 && screenY < sy + sh * 0.9) {
      return "left";
    }
    // Bottom edge
    if (Math.abs(screenY - (sy + sh)) < hitPad && screenX > sx + sw * 0.1 && screenX < sx + sw * 0.9) {
      return "bottom";
    }

    return null;
  }

  onPointerDown(screenX: number, screenY: number): boolean {
    if (!this.active) return false;

    const edge = this.hitTestEdge(screenX, screenY);
    if (!edge) return false;

    this.dragging = edge;
    this.dragStartMouse = edge === "bottom" ? screenY : screenX;

    const json = this.engine.get_node_json(BigInt(this.targetNodeId!));
    if (!json) return false;
    const node = JSON.parse(json);
    this.dragStartSize = edge === "bottom" ? node.height : node.width;
    this.dragStartPos = edge === "left" ? node.x : edge === "bottom" ? node.y : 0;

    this.engine.push_undo();
    return true;
  }

  onPointerMove(screenX: number, screenY: number): boolean {
    if (!this.active || !this.dragging || this.targetNodeId == null) return false;

    const zoom = this.engine.get_zoom();
    const delta = this.dragging === "bottom"
      ? (screenY - this.dragStartMouse) / zoom
      : (screenX - this.dragStartMouse) / zoom;

    let newSize: number;
    let newPos: number | null = null;

    if (this.dragging === "right") {
      newSize = Math.max(MIN_FRAME_SIZE, this.dragStartSize + delta);
    } else if (this.dragging === "left") {
      newSize = Math.max(MIN_FRAME_SIZE, this.dragStartSize - delta);
      newPos = this.dragStartPos + delta;
      if (newSize <= MIN_FRAME_SIZE) {
        newPos = this.dragStartPos + this.dragStartSize - MIN_FRAME_SIZE;
      }
    } else {
      // bottom
      newSize = Math.max(MIN_FRAME_SIZE, this.dragStartSize + delta);
    }

    // Snap to breakpoints
    if (this.dragging !== "bottom") {
      const snapResult = this.snapToBreakpoint(newSize, zoom);
      if (snapResult !== null) {
        if (this.dragging === "left") {
          newPos = this.dragStartPos + (this.dragStartSize - snapResult);
        }
        newSize = snapResult;
      }
    }

    // Apply resize
    if (this.dragging === "bottom") {
      const json = this.engine.get_node_json(BigInt(this.targetNodeId));
      if (json) {
        const node = JSON.parse(json);
        this.engine.resize_node_with_constraints(BigInt(this.targetNodeId), node.width, newSize);
      }
    } else {
      if (newPos != null) {
        this.engine.set_node_position(BigInt(this.targetNodeId), newPos, undefined);
      }
      const json = this.engine.get_node_json(BigInt(this.targetNodeId));
      if (json) {
        const node = JSON.parse(json);
        this.engine.resize_node_with_constraints(BigInt(this.targetNodeId), newSize, node.height);
      }
    }

    if (this.onRender) this.onRender();
    this.updateOverlay();
    return true;
  }

  onPointerUp(): boolean {
    if (!this.dragging) return false;
    this.dragging = null;
    this.updateOverlay();
    return true;
  }

  private snapToBreakpoint(width: number, zoom: number): number | null {
    const threshold = BREAKPOINT_SNAP_PX / zoom;
    for (const bp of this.breakpoints) {
      if (Math.abs(width - bp.width) < threshold) {
        return bp.width;
      }
    }
    return null;
  }

  getCursor(screenX: number, screenY: number): string | null {
    if (!this.active) return null;
    const edge = this.hitTestEdge(screenX, screenY);
    if (this.dragging === "left" || this.dragging === "right" || edge === "left" || edge === "right") {
      return "ew-resize";
    }
    if (this.dragging === "bottom" || edge === "bottom") {
      return "ns-resize";
    }
    return null;
  }

  handleKeydown(key: string): boolean {
    if (!this.active) return false;
    if (key === "Escape") {
      this.deactivate(true);
      return true;
    }
    if (key === "Enter") {
      this.deactivate(false);
      return true;
    }
    return false;
  }

  // ========================
  // Utilities
  // ========================

  private showToast(msg: string) {
    const t = document.createElement("div");
    t.textContent = msg;
    Object.assign(t.style, {
      position: "fixed", bottom: "80px", left: "50%", transform: "translateX(-50%)",
      background: "rgba(0,0,0,0.85)", color: "#fff", padding: "8px 16px",
      borderRadius: "6px", fontSize: "13px", zIndex: "100001", pointerEvents: "none",
    });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  private getStyles(): string {
    return `
      #responsive-resize-overlay {
        pointer-events: none;
        position: fixed;
        inset: 0;
        z-index: 9998;
      }
      .rr-topbar {
        pointer-events: auto;
        position: fixed;
        top: 0; left: 0; right: 0;
        height: 44px;
        background: rgba(22,33,62,0.95);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        padding: 0 16px;
        gap: 16px;
        z-index: 9999;
        border-bottom: 1px solid rgba(255,255,255,0.1);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #e0e0e0;
      }
      .rr-topbar-left {
        display: flex; align-items: center; gap: 8px;
        white-space: nowrap;
      }
      .rr-icon { font-size: 16px; }
      .rr-title { font-size: 13px; font-weight: 600; }
      .rr-ruler {
        flex: 1;
        height: 24px;
        position: relative;
        overflow: hidden;
      }
      .rr-ruler-track {
        position: relative;
        width: 100%;
        height: 100%;
        background: rgba(255,255,255,0.05);
        border-radius: 4px;
      }
      .rr-ruler-current {
        position: absolute;
        top: 0; left: 0;
        height: 100%;
        background: rgba(74,144,217,0.25);
        border-right: 2px solid #4a90d9;
        border-radius: 4px 0 0 4px;
        transition: width 0.05s ease-out;
      }
      .rr-ruler-bp {
        position: absolute;
        top: 0;
        width: 0;
        height: 100%;
        border-left: 2px dashed;
        opacity: 0.5;
        transition: opacity 0.15s;
      }
      .rr-ruler-bp.active { opacity: 1; }
      .rr-ruler-bp-label {
        position: absolute;
        top: -1px;
        left: 4px;
        font-size: 9px;
        font-weight: 600;
        white-space: nowrap;
      }
      .rr-topbar-right {
        display: flex; gap: 6px; align-items: center;
      }
      .rr-btn {
        background: rgba(255,255,255,0.1);
        border: none;
        color: #e0e0e0;
        padding: 4px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-family: inherit;
      }
      .rr-btn:hover { background: rgba(255,255,255,0.2); }
      .rr-done { background: #4a90d9; }
      .rr-done:hover { background: #5aa0e9; }
      .rr-dim-label {
        pointer-events: none;
        position: fixed;
        transform: translateX(-50%);
        background: rgba(22,33,62,0.9);
        color: #4a90d9;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
        font-family: -apple-system, monospace;
        white-space: nowrap;
        z-index: 9999;
        display: none;
      }
      .rr-bp-label {
        pointer-events: none;
        position: fixed;
        transform: translateX(-50%);
        color: #fff;
        padding: 1px 8px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: 700;
        font-family: -apple-system, sans-serif;
        white-space: nowrap;
        z-index: 9999;
        display: none;
        letter-spacing: 0.5px;
        text-transform: uppercase;
      }
      .rr-constraint-debug {
        position: fixed;
        right: 16px;
        bottom: 16px;
        width: 360px;
        max-height: 45vh;
        overflow: auto;
        background: rgba(20, 22, 30, 0.94);
        border: 1px solid rgba(255,255,255,0.14);
        border-radius: 10px;
        padding: 10px;
        color: #d7dde9;
        font-size: 11px;
        z-index: 10003;
        display: none;
        backdrop-filter: blur(6px);
      }
      .rr-cd-title { font-size: 12px; font-weight: 700; color: #fff; margin-bottom: 4px; }
      .rr-cd-meta { color: #8ca0bf; margin-bottom: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      .rr-cd-row { display: grid; grid-template-columns: 1fr; gap: 2px; padding: 6px 0; border-top: 1px solid rgba(255,255,255,0.06); }
      .rr-cd-name { font-weight: 600; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .rr-cd-rule { color: #b9c7dc; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      .rr-cd-more { margin-top: 6px; color: #91a3bd; }
    `;
  }
}
