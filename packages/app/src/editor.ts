import type { Engine } from "./wasm/opensketch_engine";

export type ToolType = "select" | "hand" | "rect" | "ellipse" | "text" | "frame";

interface DragState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  nodeId?: number;
  handleIndex?: number;
  originalX?: number;
  originalY?: number;
  originalW?: number;
  originalH?: number;
}

export class Editor {
  engine: Engine;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2d;
  currentTool: ToolType = "select";
  private drag: DragState | null = null;
  private isPanning = false;
  private lastPanX = 0;
  private lastPanY = 0;
  private needsRender = true;
  private rafId = 0;
  private onSelectionChanges: ((ids: number[]) => void)[] = [];
  private onLayersChanges: (() => void)[] = [];
  private spaceHeld = false;

  // Throttle selection callbacks during drag
  private selectionDirty = false;
  private selectionThrottleId = 0;

  constructor(engine: Engine, canvas: HTMLCanvasElement) {
    this.engine = engine;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.setupCanvas();
    this.setupEvents();
    this.startLoop();
  }

  private setupCanvas() {
    const resize = () => {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;
      this.ctx.scale(dpr, dpr);
      this.engine.resize(rect.width, rect.height);
      this.needsRender = true;
    };
    resize();
    window.addEventListener("resize", resize);
  }

  private setupEvents() {
    // Use pointer events for better perf
    this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    this.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    this.canvas.addEventListener("pointerup", (e) => this.onPointerUp(e));
    this.canvas.addEventListener("dblclick", (e) => this.onDoubleClick(e));

    // Wheel: batch into rAF
    let pendingWheel: { dx: number; dy: number; cx: number; cy: number; isZoom: boolean } | null = null;
    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const isZoom = e.ctrlKey || e.metaKey;
      if (!pendingWheel) {
        pendingWheel = { dx: 0, dy: 0, cx: e.offsetX, cy: e.offsetY, isZoom };
        requestAnimationFrame(() => {
          if (pendingWheel) {
            if (pendingWheel.isZoom) {
              this.engine.zoom(pendingWheel.dy, pendingWheel.cx, pendingWheel.cy);
            } else {
              this.engine.pan(-pendingWheel.dx, -pendingWheel.dy);
            }
            this.needsRender = true;
            pendingWheel = null;
          }
        });
      }
      if (isZoom === pendingWheel.isZoom) {
        pendingWheel.dx += e.deltaX;
        pendingWheel.dy += e.deltaY;
        pendingWheel.cx = e.offsetX;
        pendingWheel.cy = e.offsetY;
      }
    }, { passive: false });

    window.addEventListener("keydown", (e) => {
      if (this.isInputFocused()) return;
      if (e.code === "Space") {
        e.preventDefault();
        this.spaceHeld = true;
        this.canvas.style.cursor = "grab";
        return;
      }
      // Undo: Cmd+Z / Ctrl+Z
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (this.engine.undo()) {
          this.onLayersChanges.forEach(fn => fn());
          this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
          this.needsRender = true;
        }
        return;
      }
      // Redo: Cmd+Shift+Z / Ctrl+Shift+Z  or  Cmd+Y / Ctrl+Y
      if (((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) ||
          ((e.metaKey || e.ctrlKey) && e.key === "y")) {
        e.preventDefault();
        if (this.engine.redo()) {
          this.onLayersChanges.forEach(fn => fn());
          this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
          this.needsRender = true;
        }
        return;
      }
      if (e.key === "v" || e.key === "V") this.setTool("select");
      if (e.key === "h" || e.key === "H") this.setTool("hand");
      if (e.key === "r" || e.key === "R") this.setTool("rect");
      if (e.key === "o" || e.key === "O") this.setTool("ellipse");
      if (e.key === "t" || e.key === "T") this.setTool("text");
      if (e.key === "f" || e.key === "F") this.setTool("frame");
      if (e.key === "Delete" || e.key === "Backspace") {
        this.engine.push_undo();
        const sel = this.engine.get_selection();
        sel.forEach((id: number) => this.engine.remove_node(id));
        this.engine.deselect_all();
        this.onLayersChanges.forEach(fn => fn());
        this.fireSelectionNow([]);
        this.needsRender = true;
      }
      if (e.key === "Escape") {
        this.engine.deselect_all();
        this.fireSelectionNow([]);
        this.needsRender = true;
      }
    });

    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        this.spaceHeld = false;
        this.updateCursor();
      }
    });
  }

  private isInputFocused(): boolean {
    const el = document.activeElement;
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
  }

  private onPointerDown(e: PointerEvent) {
    const x = e.offsetX;
    const y = e.offsetY;

    // Space + click = pan
    if (this.spaceHeld || this.currentTool === "hand") {
      this.isPanning = true;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      this.canvas.style.cursor = "grabbing";
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }

    if (this.currentTool === "select") {
      const handle = this.engine.hit_test_handle(x, y);
      if (handle >= 0) {
        const sel = this.engine.get_selection();
        if (sel.length > 0) {
          const nodeJson = this.engine.get_node_json(sel[0]!);
          if (nodeJson) {
            const node = JSON.parse(nodeJson);
            this.engine.push_undo();
            this.drag = {
              startX: x, startY: y, currentX: x, currentY: y,
              nodeId: sel[0]!, handleIndex: handle,
              originalX: node.x, originalY: node.y,
              originalW: node.width, originalH: node.height,
            };
            this.canvas.setPointerCapture(e.pointerId);
            return;
          }
        }
      }

      const hit = this.engine.hit_test(x, y);
      if (hit != null) {
        if (e.shiftKey) {
          this.engine.add_to_selection(hit);
        } else {
          this.engine.select(hit);
        }
        const nodeJson = this.engine.get_node_json(hit);
        if (nodeJson) {
          const node = JSON.parse(nodeJson);
          this.engine.push_undo();
          this.drag = {
            startX: x, startY: y, currentX: x, currentY: y,
            nodeId: hit, originalX: node.x, originalY: node.y,
          };
        }
      } else {
        this.engine.deselect_all();
      }
      this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
      this.needsRender = true;
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }

    if (["rect", "ellipse", "text", "frame"].includes(this.currentTool)) {
      const sx = this.engine.screen_to_scene_x(x, y);
      const sy = this.engine.screen_to_scene_y(x, y);
      this.drag = { startX: sx, startY: sy, currentX: sx, currentY: sy };
      this.canvas.setPointerCapture(e.pointerId);
    }
  }

  private onPointerMove(e: PointerEvent) {
    if (this.isPanning) {
      const dx = e.clientX - this.lastPanX;
      const dy = e.clientY - this.lastPanY;
      this.engine.pan(dx, dy);
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      this.needsRender = true;
      return;
    }

    if (!this.drag) return;
    const x = e.offsetX;
    const y = e.offsetY;

    if (this.currentTool === "select" && this.drag.nodeId != null) {
      if (this.drag.handleIndex != null) {
        const sx = this.engine.screen_to_scene_x(x, y);
        const sy = this.engine.screen_to_scene_y(x, y);
        const ox = this.drag.originalX!;
        const oy = this.drag.originalY!;
        const ow = this.drag.originalW!;
        const oh = this.drag.originalH!;
        let nx = ox, ny = oy, nw = ow, nh = oh;

        switch (this.drag.handleIndex) {
          case 0: nx = sx; ny = sy; nw = ox + ow - sx; nh = oy + oh - sy; break;
          case 1: ny = sy; nw = sx - ox; nh = oy + oh - sy; break;
          case 2: nx = sx; nw = ox + ow - sx; nh = sy - oy; break;
          case 3: nw = sx - ox; nh = sy - oy; break;
        }
        if (nw > 0 && nh > 0) {
          this.engine.set_node_position(this.drag.nodeId, nx, ny);
          this.engine.resize_node(this.drag.nodeId, nw, nh);
        }
      } else {
        const zoom = this.engine.get_zoom();
        const dx = (x - this.drag.currentX) / zoom;
        const dy = (y - this.drag.currentY) / zoom;
        this.engine.move_node(this.drag.nodeId, dx, dy);
        this.drag.currentX = x;
        this.drag.currentY = y;
      }
      this.needsRender = true;
      // Throttle selection updates during drag
      this.fireSelectionThrottled(Array.from(this.engine.get_selection()).map(Number));
      return;
    }

    if (["rect", "ellipse", "text", "frame"].includes(this.currentTool)) {
      this.drag.currentX = this.engine.screen_to_scene_x(x, y);
      this.drag.currentY = this.engine.screen_to_scene_y(x, y);
      this.needsRender = true;
    }
  }

  private onPointerUp(_e: PointerEvent) {
    if (this.isPanning) {
      this.isPanning = false;
      this.updateCursor();
      return;
    }

    if (this.drag && this.currentTool !== "select") {
      const x = Math.min(this.drag.startX, this.drag.currentX);
      const y = Math.min(this.drag.startY, this.drag.currentY);
      const w = Math.abs(this.drag.currentX - this.drag.startX);
      const h = Math.abs(this.drag.currentY - this.drag.startY);

      if (w > 2 || h > 2) {
        this.engine.push_undo();
        let id: number;
        switch (this.currentTool) {
          case "rect": id = this.engine.add_rect(x, y, w, h); break;
          case "ellipse": id = this.engine.add_ellipse(x, y, w, h); break;
          case "frame": id = this.engine.add_frame(x, y, w, h); break;
          case "text": id = this.engine.add_text(x, y, "Text", 16); break;
          default: id = 0;
        }
        if (id > 0) {
          this.engine.select(id);
          this.fireSelectionNow([id]);
          this.onLayersChanges.forEach(fn => fn());
        }
      }
      this.setTool("select");
      this.needsRender = true;
    }

    // Fire final selection update after drag ends
    if (this.drag && this.currentTool === "select") {
      this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
    }

    this.drag = null;
  }

  private fireSelectionNow(ids: number[]) {
    if (this.selectionThrottleId) {
      cancelAnimationFrame(this.selectionThrottleId);
      this.selectionThrottleId = 0;
    }
    this.onSelectionChanges.forEach(fn => fn(ids));
  }

  private fireSelectionThrottled(ids: number[]) {
    if (!this.selectionThrottleId) {
      this.selectionThrottleId = requestAnimationFrame(() => {
        this.selectionThrottleId = 0;
        this.onSelectionChanges.forEach(fn => fn(ids));
      });
    }
  }

  private editingOverlay: HTMLElement | null = null;

  private onDoubleClick(e: MouseEvent) {
    if (this.currentTool !== "select") return;
    const hit = this.engine.hit_test(e.offsetX, e.offsetY);
    if (hit == null) return;

    const nodeJson = this.engine.get_node_json(hit);
    if (!nodeJson) return;
    const node = JSON.parse(nodeJson);
    if (typeof node.kind !== "object" || !node.kind.Text) return;

    // Start inline text editing
    this.startTextEdit(hit, node);
  }

  private editingNodeId: bigint | null = null;
  private editingOrigContent: string = "";

  private startTextEdit(nodeId: bigint | number, node: any) {
    if (this.editingOverlay) this.finishTextEdit();

    const text = node.kind.Text;
    const bid = BigInt(nodeId);
    this.editingNodeId = bid;
    this.editingOrigContent = text.content;

    // Hidden contentEditable — captures keyboard input only
    // Positioned off-screen but still focusable
    const el = document.createElement("div");
    el.contentEditable = "true";
    el.spellcheck = false;
    el.textContent = text.content;
    el.style.cssText = `
      position: fixed;
      left: -9999px;
      top: -9999px;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
      z-index: -1;
    `;

    // Select the node and mark as editing
    this.engine.select(bid);
    this.engine.set_editing(bid);
    this.needsRender = true;

    const finish = () => {
      if (!this.editingOverlay) return;
      el.remove();
      this.editingOverlay = null;
      this.editingNodeId = null;
      this.engine.set_editing(null);
      this.needsRender = true;
      this.canvas.focus();
      this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
    };

    el.addEventListener("blur", finish);

    el.addEventListener("input", () => {
      const newContent = el.textContent || "";
      this.engine.set_text_content(bid, newContent);
      this.needsRender = true;
    });

    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        // Restore original
        this.engine.set_text_content(bid, this.editingOrigContent);
        this.needsRender = true;
        finish();
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        finish();
      }
      // Prevent other editor shortcuts while typing
      e.stopPropagation();
    });

    document.body.appendChild(el);
    this.editingOverlay = el;
    el.focus();

    // Select all text in the hidden element
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  private finishTextEdit() {
    if (this.editingOverlay) {
      this.editingOverlay.dispatchEvent(new FocusEvent("blur"));
    }
  }

  isEditing(): boolean {
    return this.editingNodeId !== null;
  }

  private startLoop() {
    const loop = () => {
      if (this.needsRender) {
        const dpr = window.devicePixelRatio || 1;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.engine.render(this.ctx);
        this.needsRender = false;
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  setTool(tool: ToolType) {
    this.currentTool = tool;
    this.updateCursor();
    document.querySelectorAll(".tool-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-tool") === tool);
    });
  }

  private updateCursor() {
    const cursors: Record<ToolType, string> = {
      select: "default", hand: "grab", rect: "crosshair",
      ellipse: "crosshair", text: "text", frame: "crosshair",
    };
    this.canvas.style.cursor = cursors[this.currentTool] || "default";
  }

  selectNode(id: number | bigint) {
    this.engine.select(BigInt(id));
    this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number).map(Number));
    this.needsRender = true;
  }
  onSelection(fn: (ids: number[]) => void) { this.onSelectionChanges.push(fn); }
  onLayers(fn: () => void) { this.onLayersChanges.push(fn); }
  requestRender() { this.needsRender = true; }

  /**
   * Export a specific node (or entire canvas) as PNG data URL.
   * For frames: crops to the frame bounds with padding.
   * Returns a data:image/png;base64 string.
   */
  exportPng(nodeId?: number | bigint, scale: number = 2, padding: number = 0): string {
    let x: number, y: number, w: number, h: number;

    if (nodeId != null) {
      const json = this.engine.get_node_json(BigInt(nodeId));
      if (!json) return "";
      const node = JSON.parse(json);
      x = node.x - padding;
      y = node.y - padding;
      w = node.width + padding * 2;
      h = node.height + padding * 2;
    } else {
      // Export all: compute bounding box of all nodes
      const layers = JSON.parse(this.engine.get_layer_list());
      if (layers.length === 0) return "";
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const l of layers) {
        const nj = this.engine.get_node_json(BigInt(l.id));
        if (!nj) continue;
        const n = JSON.parse(nj);
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + n.width);
        maxY = Math.max(maxY, n.y + n.height);
      }
      x = minX - padding;
      y = minY - padding;
      w = maxX - minX + padding * 2;
      h = maxY - minY + padding * 2;
    }

    // Create offscreen canvas
    const offCanvas = document.createElement("canvas");
    offCanvas.width = w * scale;
    offCanvas.height = h * scale;
    const offCtx = offCanvas.getContext("2d")!;

    // White background
    offCtx.fillStyle = "#ffffff";
    offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);

    // Transform: scale and translate so the target region fills the canvas
    offCtx.scale(scale, scale);
    offCtx.translate(-x, -y);

    // Render all visible nodes (the engine renders to a context)
    const order = JSON.parse(this.engine.get_layer_list());
    for (const item of order) {
      if (!item.visible) continue;
      const nj = this.engine.get_node_json(BigInt(item.id));
      if (!nj) continue;
      const node = JSON.parse(nj);

      offCtx.save();
      offCtx.globalAlpha = node.opacity ?? 1;

      if (node.rotation && node.rotation !== 0) {
        offCtx.translate(node.x + node.width / 2, node.y + node.height / 2);
        offCtx.rotate(node.rotation);
        this.renderNodeToCtx(offCtx, node, -node.width / 2, -node.height / 2);
      } else {
        this.renderNodeToCtx(offCtx, node, node.x, node.y);
      }

      offCtx.restore();
    }

    return offCanvas.toDataURL("image/png");
  }

  private renderNodeToCtx(ctx: CanvasRenderingContext2D, node: any, x: number, y: number) {
    const kind = node.kind;
    const w = node.width;
    const h = node.height;
    const cr = node.corner_radius || 0;
    const fill = node.fill?.color;
    const stroke = node.stroke;

    // Draw shape
    if (kind === "Rect" || kind === "Frame") {
      ctx.beginPath();
      if (cr > 0) {
        ctx.roundRect(x, y, w, h, cr);
      } else {
        ctx.rect(x, y, w, h);
      }
      if (fill) {
        ctx.fillStyle = `rgba(${fill.r},${fill.g},${fill.b},${fill.a})`;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = `rgba(${stroke.color.r},${stroke.color.g},${stroke.color.b},${stroke.color.a})`;
        ctx.lineWidth = stroke.width;
        ctx.stroke();
      }
    } else if (kind === "Ellipse") {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      if (fill) {
        ctx.fillStyle = `rgba(${fill.r},${fill.g},${fill.b},${fill.a})`;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = `rgba(${stroke.color.r},${stroke.color.g},${stroke.color.b},${stroke.color.a})`;
        ctx.lineWidth = stroke.width;
        ctx.stroke();
      }
    } else if (typeof kind === "object" && kind.Text) {
      const text = kind.Text;
      const fontSize = text.font_size || 16;
      const fontFamily = text.font_family || "Inter";
      ctx.font = `${fontSize}px ${fontFamily}`;
      if (fill) {
        ctx.fillStyle = `rgba(${fill.r},${fill.g},${fill.b},${fill.a})`;
      } else {
        ctx.fillStyle = "#000";
      }
      ctx.textBaseline = "top";
      ctx.fillText(text.content || "", x, y);
    }
  }

  /**
   * Export frame as PNG and trigger download
   */
  downloadPng(nodeId?: number | bigint, scale: number = 2, filename?: string) {
    const dataUrl = this.exportPng(nodeId, scale, 10);
    if (!dataUrl) return false;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename || (nodeId ? `frame-${nodeId}.png` : "opensketch-export.png");
    a.click();
    return true;
  }
}
