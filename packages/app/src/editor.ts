import type { Engine } from "./wasm/opensketch_engine";
import { computeSnap, renderGuides, type SnapGuide } from "./tools/smart-guides";
import type { RulersAPI } from "./ui/rulers";
import { toggleShortcutsPanel, isShortcutsPanelVisible, closeShortcutsPanel } from "./ui/shortcuts-panel";
import { showContextMenu, hideContextMenu, type MenuItem } from "./ui/context-menu";
import { openResponsivePreview, isResponsivePreviewOpen, closeResponsivePreview } from "./ui/responsive-preview";

export type ToolType = "select" | "hand" | "rect" | "ellipse" | "text" | "frame" | "section" | "image" | "pen" | "star" | "polygon";

/** Snap threshold in screen pixels */
const SNAP_THRESHOLD_PX = 5;

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
  private marquee: { startX: number; startY: number; currentX: number; currentY: number } | null = null;
  private isPanning = false;
  private lastPanX = 0;
  private lastPanY = 0;
  private needsRender = true;
  private rafId = 0;
  private onSelectionChanges: ((ids: number[]) => void)[] = [];
  private onLayersChanges: (() => void)[] = [];
  private spaceHeld = false;
  private _clipboard: string | null = null;
  private _pasteCount = 0;

  private _imageCache: Map<string, HTMLImageElement> = new Map();
  private _imageLoading: Set<string> = new Set();

  // Pen tool state
  private _penPathId: number | null = null;
  private _penDragging = false;
  private _penDragStartX = 0;
  private _penDragStartY = 0;

  // Path edit mode state
  private _pathEditMode = false;
  private _pathEditNodeId: number | null = null;
  private _pathEditSelectedPoint: number | null = null;
  private _pathEditDragType: 'anchor' | 'handle_in' | 'handle_out' | null = null;
  private _pathEditDragOffsetX = 0;
  private _pathEditDragOffsetY = 0;
  private _pathEditHandleOffsets: { hix: number; hiy: number; hox: number; hoy: number } | null = null;

  // Smart guides state
  private _snapGuides: SnapGuide[] = [];
  private onSaveCallbacks: (() => void)[] = [];
  private _layoutGridsVisible = true;

  // Rulers & guides
  private _rulers: RulersAPI | null = null;

  // Throttle selection callbacks during drag
  private selectionDirty = false;
  private selectionThrottleId = 0;

  constructor(engine: Engine, canvas: HTMLCanvasElement) {
    this.engine = engine;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.setupCanvas();
    this.setupEvents();
    this.setupDragDrop();
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
    this.canvas.addEventListener("contextmenu", (e) => this.onContextMenu(e));

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
      // Shortcuts panel: Cmd+/ or ?
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        toggleShortcutsPanel();
        return;
      }
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        toggleShortcutsPanel();
        return;
      }
      // If shortcuts panel is visible, let it handle ESC, block other keys
      if (isShortcutsPanelVisible()) {
        if (e.key === "Escape") {
          closeShortcutsPanel();
        }
        return;
      }
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
      // Save: Cmd+S — triggers manual save (handled by autosave if attached)
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        this.onSaveCallbacks.forEach(fn => fn());
        return;
      }
      // Copy: Cmd+C
      if ((e.metaKey || e.ctrlKey) && e.key === "c" && !e.shiftKey) {
        e.preventDefault();
        const json = this.engine.copy_selected();
        if (json && json !== "[]") {
          this._clipboard = json;
          this._pasteCount = 0;
        }
        return;
      }
      // Cut: Cmd+X
      if ((e.metaKey || e.ctrlKey) && e.key === "x") {
        e.preventDefault();
        const json = this.engine.copy_selected();
        if (json && json !== "[]") {
          this._clipboard = json;
          this._pasteCount = 0;
          this.engine.push_undo();
          const sel = this.engine.get_selection();
          sel.forEach((id: number) => this.engine.remove_node(id));
          this.engine.deselect_all();
          this.onLayersChanges.forEach(fn => fn());
          this.fireSelectionNow([]);
          this.needsRender = true;
        }
        return;
      }
      // Paste: Cmd+V (check for clipboard images first, then nodes)
      if ((e.metaKey || e.ctrlKey) && e.key === "v" && !e.shiftKey) {
        e.preventDefault();
        // Try clipboard image paste
        if (navigator.clipboard && navigator.clipboard.read) {
          navigator.clipboard.read().then(items => {
            for (const item of items) {
              const imageType = item.types.find(t => t.startsWith("image/"));
              if (imageType) {
                item.getType(imageType).then(blob => this.createImageFromBlob(blob));
                return;
              }
            }
            // No image — do normal node paste
            this.pasteNodes();
          }).catch(() => {
            this.pasteNodes();
          });
        } else {
          this.pasteNodes();
        }
        return;
      }
      // Duplicate: Cmd+D
      if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        e.preventDefault();
        const json = this.engine.copy_selected();
        if (json && json !== "[]") {
          this.engine.push_undo();
          const newIds = this.engine.paste_nodes(json, 10, 10);
          const ids = JSON.parse(newIds).map(Number);
          this.onLayersChanges.forEach(fn => fn());
          this.fireSelectionNow(ids);
          this.needsRender = true;
        }
        return;
      }
      // Zoom to 100%: Cmd+0
      if ((e.metaKey || e.ctrlKey) && e.key === "0") {
        e.preventDefault();
        this.zoomTo100();
        return;
      }
      // Zoom to fit: Cmd+1
      if ((e.metaKey || e.ctrlKey) && e.key === "1") {
        e.preventDefault();
        this.zoomToFit();
        return;
      }
      // Zoom to selection: Cmd+2
      if ((e.metaKey || e.ctrlKey) && e.key === "2") {
        e.preventDefault();
        this.zoomToSelection();
        return;
      }
      // Zoom in: = or +
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        this.zoomBy(1.25);
        return;
      }
      // Zoom out: -
      if (e.key === "-" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        this.zoomBy(0.8);
        return;
      }
      // Flatten selection: Ctrl/Cmd+E
      if ((e.metaKey || e.ctrlKey) && e.key === "e" && !e.shiftKey) {
        e.preventDefault();
        this.flattenSelection();
        return;
      }
      // Boolean operations: Ctrl/Cmd+Shift+U/S/I/X (but only without other modifiers conflicting)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
        const boolKey = e.key.toLowerCase();
        if (boolKey === "u") { e.preventDefault(); this.booleanOperation("union"); return; }
        if (boolKey === "s") { e.preventDefault(); this.booleanOperation("subtract"); return; }
        if (boolKey === "i") { e.preventDefault(); this.booleanOperation("intersect"); return; }
        if (boolKey === "x") { e.preventDefault(); this.booleanOperation("exclude"); return; }
      }

      // Ctrl/Cmd+Alt+R: responsive resize preview
      if ((e.metaKey || e.ctrlKey) && e.altKey && (e.key === "r" || e.key === "®")) {
        e.preventDefault();
        if (isResponsivePreviewOpen()) {
          closeResponsivePreview();
        } else {
          openResponsivePreview(this.engine);
        }
        return;
      }

      // Ctrl/Cmd+G: toggle layout grid overlay
      if ((e.metaKey || e.ctrlKey) && (e.key === "g" || e.key === "G") && !e.shiftKey) {
        e.preventDefault();
        this._layoutGridsVisible = !this._layoutGridsVisible;
        this.needsRender = true;
        return;
      }
      if (e.key === "v" || e.key === "V") this.setTool("select");
      if (e.key === "h" || e.key === "H") this.setTool("hand");
      if (e.key === "r" || e.key === "R") this.setTool("rect");
      if (e.key === "o" || e.key === "O") this.setTool("ellipse");
      if (e.key === "t" || e.key === "T") this.setTool("text");
      if (e.key === "f" || e.key === "F") this.setTool("frame");
      if (e.key === "i" || e.key === "I") this.setTool("image");
      if (e.key === "p" || e.key === "P") this.setTool("pen");
      if ((e.key === "s" || e.key === "S") && e.shiftKey) this.setTool("section");
      else if (e.key === "s" || e.key === "S") this.setTool("star");
      if (e.key === "g" || e.key === "G") this.setTool("polygon");
      if (e.key === "Delete" || e.key === "Backspace") {
        if (this._pathEditMode && this._pathEditNodeId != null && this._pathEditSelectedPoint != null) {
          this.engine.push_undo();
          this.engine.path_remove_point(this._pathEditNodeId, this._pathEditSelectedPoint);
          const count = this.engine.path_point_count(this._pathEditNodeId);
          if (count < 2) {
            this.exitPathEditMode();
            this.engine.remove_node(this._pathEditNodeId);
            this.engine.deselect_all();
            this.onLayersChanges.forEach(fn => fn());
            this.fireSelectionNow([]);
          } else {
            this._pathEditSelectedPoint = null;
          }
          this.needsRender = true;
          return;
        }
        this.engine.push_undo();
        const sel = this.engine.get_selection();
        sel.forEach((id: number) => this.engine.remove_node(id));
        this.engine.deselect_all();
        this.onLayersChanges.forEach(fn => fn());
        this.fireSelectionNow([]);
        this.needsRender = true;
      }
      if (e.key === "Escape") {
        if (this._pathEditMode) {
          this.exitPathEditMode();
          this.needsRender = true;
          return;
        }
        if (this._penPathId != null) {
          this.finishPenPath();
          this.needsRender = true;
          return;
        }
        this.engine.deselect_all();
        this.fireSelectionNow([]);
        this.needsRender = true;
      }
      if (e.key === "Enter" && this._penPathId != null) {
        this.finishPenPath();
        this.needsRender = true;
        return;
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

    if (this.currentTool === "select" && this._pathEditMode) {
      const hit = this.pathEditHitTest(x, y);
      if (hit) {
        this._pathEditSelectedPoint = hit.index;
        this._pathEditDragType = hit.type;
        // Store handle offsets for anchor drag
        if (hit.type === 'anchor') {
          const points = this.getPathPoints();
          if (points) {
            const p = points[hit.index];
            this._pathEditHandleOffsets = {
              hix: p.hix - p.x, hiy: p.hiy - p.y,
              hox: p.hox - p.x, hoy: p.hoy - p.y,
            };
          }
        }
        this.engine.push_undo();
        this.needsRender = true;
        this.canvas.setPointerCapture(e.pointerId);
        return;
      } else {
        // Click outside points → exit path edit mode
        this.exitPathEditMode();
        // Fall through to normal select
      }
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
        const currentSel = Array.from(this.engine.get_selection()).map(Number);
        const alreadySelected = currentSel.includes(Number(hit));
        if (e.shiftKey) {
          if (alreadySelected) {
            // Shift+click on selected node → deselect it
            this.engine.deselect_all();
            for (const id of currentSel) {
              if (id !== Number(hit)) this.engine.add_to_selection(id);
            }
          } else {
            this.engine.add_to_selection(hit);
          }
        } else if (!alreadySelected) {
          this.engine.select(hit);
        }
        // Start drag for moving — nodeId is used as anchor
        this.engine.push_undo();
        this.drag = {
          startX: x, startY: y, currentX: x, currentY: y,
          nodeId: hit,
        };
      } else {
        // Start marquee drag-select
        if (!e.shiftKey) {
          this.engine.deselect_all();
        }
        this.marquee = { startX: x, startY: y, currentX: x, currentY: y };
        this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
        this.needsRender = true;
        this.canvas.setPointerCapture(e.pointerId);
        return;
      }
      this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
      this.needsRender = true;
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }

    if (this.currentTool === "pen") {
      const sx = this.engine.screen_to_scene_x(x, y);
      const sy = this.engine.screen_to_scene_y(x, y);

      // Check if clicking near the first point to close the path
      if (this._penPathId != null) {
        const data = JSON.parse(this.engine.path_get_data(this._penPathId) || "{}");
        if (data.points && data.points.length >= 3) {
          const first = data.points[0];
          const dist = Math.hypot(sx - first.x, sy - first.y);
          const threshold = 8 / this.engine.get_zoom();
          if (dist < threshold) {
            this.engine.path_set_closed(this._penPathId, true);
            this.finishPenPath();
            this.needsRender = true;
            return;
          }
        }
      }

      if (this._penPathId == null) {
        this.engine.push_undo();
        this._penPathId = Number(this.engine.add_path(sx, sy));
        this.engine.select(this._penPathId);
      }
      this.engine.path_add_point(this._penPathId, sx, sy);
      this._penDragging = true;
      this._penDragStartX = sx;
      this._penDragStartY = sy;
      this.needsRender = true;
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }

    if (["rect", "ellipse", "text", "frame", "section", "image"].includes(this.currentTool)) {
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

    // Path edit mode dragging
    if (this._pathEditMode && this._pathEditDragType && this._pathEditNodeId != null && this._pathEditSelectedPoint != null) {
      const sx = this.engine.screen_to_scene_x(e.offsetX, e.offsetY);
      const sy = this.engine.screen_to_scene_y(e.offsetX, e.offsetY);
      const idx = this._pathEditSelectedPoint;
      const nodeId = this._pathEditNodeId;

      if (this._pathEditDragType === 'anchor') {
        this.engine.path_set_point(nodeId, idx, sx, sy);
        // Move handles along with anchor
        if (this._pathEditHandleOffsets) {
          const o = this._pathEditHandleOffsets;
          this.engine.path_set_handle_in(nodeId, idx, sx + o.hix, sy + o.hiy);
          this.engine.path_set_handle_out(nodeId, idx, sx + o.hox, sy + o.hoy);
        }
      } else if (this._pathEditDragType === 'handle_in') {
        this.engine.path_set_handle_in(nodeId, idx, sx, sy);
        // Mirror handle_out unless Alt is held
        if (!e.altKey) {
          const points = this.getPathPoints();
          if (points) {
            const p = points[idx];
            const dx = sx - p.x;
            const dy = sy - p.y;
            this.engine.path_set_handle_out(nodeId, idx, p.x - dx, p.y - dy);
          }
        }
      } else if (this._pathEditDragType === 'handle_out') {
        this.engine.path_set_handle_out(nodeId, idx, sx, sy);
        if (!e.altKey) {
          const points = this.getPathPoints();
          if (points) {
            const p = points[idx];
            const dx = sx - p.x;
            const dy = sy - p.y;
            this.engine.path_set_handle_in(nodeId, idx, p.x - dx, p.y - dy);
          }
        }
      }
      this.needsRender = true;
      return;
    }

    // Pen tool: drag to create bezier handles
    if (this._penDragging && this._penPathId != null) {
      const sx = this.engine.screen_to_scene_x(e.offsetX, e.offsetY);
      const sy = this.engine.screen_to_scene_y(e.offsetX, e.offsetY);
      const pointCount = this.engine.path_point_count(this._penPathId);
      if (pointCount > 0) {
        this.engine.path_set_handle_out(this._penPathId, pointCount - 1, sx, sy);
      }
      this.needsRender = true;
      return;
    }

    if (this.marquee) {
      this.marquee.currentX = e.offsetX;
      this.marquee.currentY = e.offsetY;
      // Live preview: select nodes in marquee rect
      const mx = Math.min(this.marquee.startX, this.marquee.currentX);
      const my = Math.min(this.marquee.startY, this.marquee.currentY);
      const mx2 = Math.max(this.marquee.startX, this.marquee.currentX);
      const my2 = Math.max(this.marquee.startY, this.marquee.currentY);
      if (Math.abs(mx2 - mx) > 2 || Math.abs(my2 - my) > 2) {
        const ids = Array.from(this.engine.hit_test_rect(mx, my, mx2, my2)).map(Number);
        this.engine.deselect_all();
        for (const id of ids) {
          this.engine.add_to_selection(id);
        }
        this.fireSelectionThrottled(ids);
      }
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
          // Use constraint-aware resize for frames/groups
          this.engine.resize_node_with_constraints(this.drag.nodeId, nw, nh);
        }
      } else {
        const zoom = this.engine.get_zoom();
        const rawDx = (x - this.drag.currentX) / zoom;
        const rawDy = (y - this.drag.currentY) / zoom;
        // Move all selected nodes (raw first)
        const sel = Array.from(this.engine.get_selection()).map(Number);
        for (const id of sel) {
          this.engine.move_node(id, rawDx, rawDy);
        }
        // Smart guides snapping (including ruler guides)
        const selSet = new Set(sel);
        const others = this.getNonSelectedBounds(selSet);
        // Add ruler guide positions as zero-size virtual nodes for snapping
        if (this._rulers) {
          const gp = this._rulers.getSnapPositions();
          for (const gx of gp.xs) {
            others.push({ id: -1, x: gx, y: -1e6, w: 0, h: 2e6 });
          }
          for (const gy of gp.ys) {
            others.push({ id: -1, x: -1e6, y: gy, w: 2e6, h: 0 });
          }
        }
        const bbox = this.getSelectionBBox(sel);
        if (bbox && others.length > 0) {
          const threshold = SNAP_THRESHOLD_PX / zoom;
          const snap = computeSnap(bbox, others, threshold);
          if (snap.dx !== 0 || snap.dy !== 0) {
            for (const id of sel) {
              this.engine.move_node(id, snap.dx, snap.dy);
            }
          }
          this._snapGuides = snap.guides;
        } else {
          this._snapGuides = [];
        }
        this.drag.currentX = x;
        this.drag.currentY = y;
      }
      this.needsRender = true;
      // Throttle selection updates during drag
      this.fireSelectionThrottled(Array.from(this.engine.get_selection()).map(Number));
      return;
    }

    if (["rect", "ellipse", "text", "frame", "section", "image"].includes(this.currentTool)) {
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

    if (this._pathEditDragType) {
      this._pathEditDragType = null;
      this._pathEditHandleOffsets = null;
      this.needsRender = true;
      return;
    }

    if (this._penDragging) {
      this._penDragging = false;
      this.needsRender = true;
      return;
    }

    if (this.marquee) {
      this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
      this.marquee = null;
      this.needsRender = true;
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
          case "section": id = this.engine.add_section("", x, y, w, h); break;
          case "text": id = this.engine.add_text(x, y, "Text", 16); break;
          case "image": id = this.engine.add_image(x, y, w, h, ""); this.promptImageSrc(id); break;
          case "star": id = this.engine.add_star(x, y, w, h, 5, 0.4); break;
          case "polygon": id = this.engine.add_polygon(x, y, w, h, 6); break;
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

    this._snapGuides = [];
    this.drag = null;
  }

  fireSelectionNow(ids: number[]) {
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

  // === Path Edit Mode ===

  private enterPathEditMode(nodeId: number) {
    this._pathEditMode = true;
    this._pathEditNodeId = nodeId;
    this._pathEditSelectedPoint = null;
    this._pathEditDragType = null;
    this.engine.select(BigInt(nodeId));
    this.canvas.style.cursor = "crosshair";
    this.needsRender = true;
  }

  private exitPathEditMode() {
    this._pathEditMode = false;
    this._pathEditNodeId = null;
    this._pathEditSelectedPoint = null;
    this._pathEditDragType = null;
    this.updateCursor();
    this.needsRender = true;
  }

  private getPathPoints(): { x: number; y: number; hix: number; hiy: number; hox: number; hoy: number }[] | null {
    if (this._pathEditNodeId == null) return null;
    const data = this.engine.path_get_data(this._pathEditNodeId);
    if (!data) return null;
    const parsed = JSON.parse(data);
    if (!parsed.points) return null;
    return parsed.points.map((p: any) => ({
      x: p.x, y: p.y,
      hix: p.handle_in_x ?? p.x, hiy: p.handle_in_y ?? p.y,
      hox: p.handle_out_x ?? p.x, hoy: p.handle_out_y ?? p.y,
    }));
  }

  private pathEditHitTest(screenX: number, screenY: number): { index: number; type: 'anchor' | 'handle_in' | 'handle_out' } | null {
    const points = this.getPathPoints();
    if (!points) return null;
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    const threshold = 8; // screen pixels

    // Check anchors first (higher priority)
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const sx = p.x * zoom + panX;
      const sy = p.y * zoom + panY;
      if (Math.abs(screenX - sx) < threshold && Math.abs(screenY - sy) < threshold) {
        return { index: i, type: 'anchor' };
      }
    }
    // Check handles (only for selected point, or all if none selected)
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      // handle_in
      const hix = p.hix * zoom + panX;
      const hiy = p.hiy * zoom + panY;
      if (Math.abs(screenX - hix) < threshold && Math.abs(screenY - hiy) < threshold) {
        return { index: i, type: 'handle_in' };
      }
      // handle_out
      const hox = p.hox * zoom + panX;
      const hoy = p.hoy * zoom + panY;
      if (Math.abs(screenX - hox) < threshold && Math.abs(screenY - hoy) < threshold) {
        return { index: i, type: 'handle_out' };
      }
    }
    return null;
  }

  private renderPathEditOverlay() {
    if (!this._pathEditMode || this._pathEditNodeId == null) return;
    const points = this.getPathPoints();
    if (!points) return;
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();

    this.ctx.save();
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const ax = p.x * zoom + panX;
      const ay = p.y * zoom + panY;
      const hix = p.hix * zoom + panX;
      const hiy = p.hiy * zoom + panY;
      const hox = p.hox * zoom + panX;
      const hoy = p.hoy * zoom + panY;
      const isSelected = i === this._pathEditSelectedPoint;

      // Draw handle lines
      this.ctx.strokeStyle = "rgba(59, 130, 246, 0.6)";
      this.ctx.lineWidth = 1;
      if (Math.abs(hix - ax) > 0.5 || Math.abs(hiy - ay) > 0.5) {
        this.ctx.beginPath();
        this.ctx.moveTo(ax, ay);
        this.ctx.lineTo(hix, hiy);
        this.ctx.stroke();
      }
      if (Math.abs(hox - ax) > 0.5 || Math.abs(hoy - ay) > 0.5) {
        this.ctx.beginPath();
        this.ctx.moveTo(ax, ay);
        this.ctx.lineTo(hox, hoy);
        this.ctx.stroke();
      }

      // Draw handle circles
      const drawHandle = (hx: number, hy: number) => {
        this.ctx.beginPath();
        this.ctx.arc(hx, hy, 3, 0, Math.PI * 2);
        this.ctx.fillStyle = isSelected ? "#3b82f6" : "#ffffff";
        this.ctx.fill();
        this.ctx.strokeStyle = "#3b82f6";
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();
      };
      if (Math.abs(hix - ax) > 0.5 || Math.abs(hiy - ay) > 0.5) drawHandle(hix, hiy);
      if (Math.abs(hox - ax) > 0.5 || Math.abs(hoy - ay) > 0.5) drawHandle(hox, hoy);

      // Draw anchor square
      const s = 4;
      this.ctx.fillStyle = isSelected ? "#3b82f6" : "#ffffff";
      this.ctx.strokeStyle = "#3b82f6";
      this.ctx.lineWidth = 1.5;
      this.ctx.fillRect(ax - s, ay - s, s * 2, s * 2);
      this.ctx.strokeRect(ax - s, ay - s, s * 2, s * 2);
    }
    this.ctx.restore();
  }

  private editingOverlay: HTMLElement | null = null;

  private onDoubleClick(e: MouseEvent) {
    if (this.currentTool !== "select") return;
    // Double-click on a guide line → remove it
    if (this._rulers) {
      const zoom = this.engine.get_zoom();
      const panX = this.engine.get_pan_x();
      const panY = this.engine.get_pan_y();
      if (this._rulers.removeGuideAt(e.offsetX, e.offsetY, zoom, panX, panY)) {
        this.needsRender = true;
        return;
      }
    }
    const hit = this.engine.hit_test(e.offsetX, e.offsetY);
    if (hit == null) return;

    const nodeJson = this.engine.get_node_json(hit);
    if (!nodeJson) return;
    const node = JSON.parse(nodeJson);

    // Path node → enter path edit mode
    if (typeof node.kind === "object" && node.kind.Path) {
      this.enterPathEditMode(Number(hit));
      return;
    }

    if (typeof node.kind !== "object" || !node.kind.Text) return;

    // Start inline text editing
    this.startTextEdit(hit, node);
  }

  private editingNodeId: bigint | null = null;
  private editingOrigContent: string = "";
  private caretPos: number = 0;
  private caretVisible: boolean = true;
  private caretBlinkTimer: number = 0;

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

    // Caret: start at end of text
    this.caretPos = text.content.length;
    this.caretVisible = true;
    this.startCaretBlink();

    const updateCaretPos = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        this.caretPos = sel.getRangeAt(0).startOffset;
        this.caretVisible = true; // reset blink on movement
        this.needsRender = true;
      }
    };

    const finish = () => {
      if (!this.editingOverlay) return;
      el.remove();
      this.editingOverlay = null;
      this.editingNodeId = null;
      this.stopCaretBlink();
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
      // Update caret after input
      requestAnimationFrame(updateCaretPos);
    });

    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        // Restore original
        this.engine.set_text_content(bid, this.editingOrigContent);
        this.needsRender = true;
        finish();
      }
      if (e.key === "Enter" && !e.shiftKey) {
        // Insert newline for multiline support
        e.preventDefault();
        const sel = window.getSelection()!;
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const br = document.createTextNode("\n");
        range.insertNode(br);
        range.setStartAfter(br);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        el.dispatchEvent(new Event("input"));
        return;
      }
      // Cmd+Left/Right: jump to start/end of text
      if (e.metaKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        const content = el.textContent || "";
        const pos = e.key === "ArrowLeft" ? 0 : content.length;
        const textNode = el.firstChild;
        if (textNode) {
          const range = document.createRange();
          range.setStart(textNode, pos);
          range.collapse(true);
          const sel = window.getSelection()!;
          sel.removeAllRanges();
          sel.addRange(range);
        }
        this.caretPos = pos;
        this.caretVisible = true;
        this.startCaretBlink();
        this.needsRender = true;
      }
      // Prevent other editor shortcuts while typing
      e.stopPropagation();
      // Update caret position after key navigation
      requestAnimationFrame(updateCaretPos);
    });

    el.addEventListener("mouseup", () => requestAnimationFrame(updateCaretPos));

    document.body.appendChild(el);
    this.editingOverlay = el;
    el.focus();

    // Place caret at end (not select all)
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false); // collapse to end
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

  private startCaretBlink() {
    this.stopCaretBlink();
    this.caretVisible = true;
    this.caretBlinkTimer = window.setInterval(() => {
      this.caretVisible = !this.caretVisible;
      this.needsRender = true;
    }, 530);
  }

  private stopCaretBlink() {
    if (this.caretBlinkTimer) {
      clearInterval(this.caretBlinkTimer);
      this.caretBlinkTimer = 0;
    }
  }

  private renderCaret() {
    if (!this.editingNodeId) return;
    if (!this.caretVisible) return;

    const nodeJson = this.engine.get_node_json(this.editingNodeId);
    if (!nodeJson) return;
    const node = JSON.parse(nodeJson);
    if (typeof node.kind !== "object" || !node.kind.Text) return;

    const text = node.kind.Text;
    const content = text.content as string;
    const fontSize = text.font_size as number;
    const fontFamily = text.font_family as string || "Inter";
    const fontWeight = text.font_weight ?? 400;
    const fontStyleStr = text.font_style === "Italic" ? "italic " : "";
    const lineHeight = text.line_height ?? 1.2;
    const textAlign = (text.text_align ?? "Left") as string;
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();

    this.ctx.save();
    this.ctx.font = `${fontStyleStr}${fontWeight} ${fontSize}px ${fontFamily}, system-ui, sans-serif`;

    // Get ascent
    const mMetrics = this.ctx.measureText("M");
    const ascent = mMetrics.actualBoundingBoxAscent || fontSize * 0.8;

    // Split content into lines (matching the wrap logic)
    const maxWidth = node.text_sizing === "Fixed" ? node.width : undefined;
    const lines = this.wrapText(content, maxWidth);

    // Find which line the caret is on
    let charCount = 0;
    let caretLine = 0;
    let caretCharInLine = 0;
    for (let i = 0; i < lines.length; i++) {
      const lineLen = lines[i].length;
      if (charCount + lineLen >= this.caretPos) {
        caretLine = i;
        caretCharInLine = this.caretPos - charCount;
        break;
      }
      charCount += lineLen + 1; // +1 for newline/space
      if (i === lines.length - 1) {
        caretLine = i;
        caretCharInLine = lines[i].length;
      }
    }

    const lineText = lines[caretLine] || "";
    const textBefore = lineText.slice(0, caretCharInLine);
    const lineW = this.ctx.measureText(lineText).width;
    const beforeW = this.ctx.measureText(textBefore).width;
    const lineH = fontSize * lineHeight;

    // Calculate x based on alignment
    let lineX = node.x;
    if (textAlign === "Center") {
      lineX = node.x + (node.width - lineW) / 2;
    } else if (textAlign === "Right") {
      lineX = node.x + node.width - lineW;
    }

    const caretX = lineX + beforeW;
    const caretY = node.y + lineH * caretLine;

    const screenX = caretX * zoom + panX;
    const screenY = caretY * zoom + panY;
    const caretHeight = lineH * zoom;

    this.ctx.restore();

    // Draw caret line in screen space (DPR transform already applied by render loop)
    this.ctx.save();
    this.ctx.strokeStyle = "#fff";
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    const cx = Math.round(screenX) + 0.5;
    this.ctx.moveTo(cx, screenY);
    this.ctx.lineTo(cx, screenY + caretHeight);
    this.ctx.stroke();
    this.ctx.restore();
  }

  private renderLayoutGrids() {
    if (!this._layoutGridsVisible) return;
    const layers = JSON.parse(this.engine.get_layer_list());
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();

    for (const layer of layers) {
      if (!layer.visible) continue;
      const nj = this.engine.get_node_json(BigInt(layer.id));
      if (!nj) continue;
      const node = JSON.parse(nj);
      const kind = typeof node.kind === "string" ? node.kind : Object.keys(node.kind)[0];
      if (kind !== "Frame") continue;
      if (!node.layout_grids || node.layout_grids.length === 0) continue;

      for (const grid of node.layout_grids) {
        if (!grid.visible) continue;
        const c = grid.color;
        const color = `rgba(${c.r},${c.g},${c.b},${c.a})`;
        const fx = node.x * zoom + panX;
        const fy = node.y * zoom + panY;
        const fw = node.width * zoom;
        const fh = node.height * zoom;
        const margin = (grid.margin || 0) * zoom;
        const gutter = (grid.gutter || 0) * zoom;

        this.ctx.save();
        // Clip to frame bounds
        this.ctx.beginPath();
        this.ctx.rect(fx, fy, fw, fh);
        this.ctx.clip();

        const sm = grid.size_mode;
        const fixedSize = typeof sm === "object" && sm.Fixed ? sm.Fixed * zoom : 0;

        if (grid.grid_type === "Columns" || grid.grid_type === "Rows") {
          const isCol = grid.grid_type === "Columns";
          const count = grid.count || 12;
          const totalDim = isCol ? fw : fh;
          const usable = totalDim - margin * 2;
          const totalGutter = gutter * (count - 1);
          const itemSize = fixedSize > 0 ? fixedSize : (usable - totalGutter) / count;
          if (itemSize < 0.5) { this.ctx.restore(); continue; }
          this.ctx.fillStyle = color;
          for (let i = 0; i < count; i++) {
            const off = margin + i * (itemSize + gutter);
            if (isCol) {
              this.ctx.fillRect(fx + off, fy, itemSize, fh);
            } else {
              this.ctx.fillRect(fx, fy + off, fw, itemSize);
            }
          }
        } else if (grid.grid_type === "Grid") {
          const cellSize = fixedSize > 0 ? fixedSize : (grid.count || 10) * zoom;
          if (cellSize < 1) { this.ctx.restore(); continue; }
          this.ctx.strokeStyle = color;
          this.ctx.lineWidth = 1;
          this.ctx.beginPath();
          for (let x = fx; x <= fx + fw + 0.5; x += cellSize) {
            this.ctx.moveTo(x, fy);
            this.ctx.lineTo(x, fy + fh);
          }
          for (let y = fy; y <= fy + fh + 0.5; y += cellSize) {
            this.ctx.moveTo(fx, y);
            this.ctx.lineTo(fx + fw, y);
          }
          this.ctx.stroke();
        }
        this.ctx.restore();
      }
    }
  }

  private renderSmartGuides() {
    if (this._snapGuides.length === 0) return;
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    renderGuides(this.ctx, this._snapGuides, zoom, panX, panY);
  }

  private renderMarquee() {
    if (!this.marquee) return;
    const { startX, startY, currentX, currentY } = this.marquee;
    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const w = Math.abs(currentX - startX);
    const h = Math.abs(currentY - startY);
    if (w < 2 && h < 2) return;

    this.ctx.save();
    this.ctx.fillStyle = "rgba(59, 130, 246, 0.08)";
    this.ctx.strokeStyle = "rgba(59, 130, 246, 0.5)";
    this.ctx.lineWidth = 1;
    this.ctx.fillRect(x, y, w, h);
    this.ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    this.ctx.restore();
  }

  /** Word-wrap text to match engine logic */
  private wrapText(text: string, maxWidth?: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
      if (!paragraph) { lines.push(""); continue; }
      if (maxWidth && maxWidth > 0) {
        const words = paragraph.split(' ');
        let current = "";
        for (const word of words) {
          const test = current ? `${current} ${word}` : word;
          if (this.ctx.measureText(test).width > maxWidth && current) {
            lines.push(current);
            current = word;
          } else {
            current = test;
          }
        }
        if (current) lines.push(current);
      } else {
        lines.push(paragraph);
      }
    }
    if (lines.length === 0) lines.push("");
    return lines;
  }

  private startLoop() {
    const loop = () => {
      if (this.needsRender) {
        const dpr = window.devicePixelRatio || 1;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.engine.render(this.ctx);
        this.renderImages();
        this.renderLayoutGrids();
        this.renderGuideLines();
        this.renderSmartGuides();
        this.renderPathEditOverlay();
        this.renderCaret();
        this.renderMarquee();
        this._rulers?.render();
        this.needsRender = false;
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  setTool(tool: ToolType) {
    // Finish any in-progress pen path when switching away
    if (this._penPathId != null && tool !== "pen") {
      this.finishPenPath();
    }
    this.currentTool = tool;
    this.updateCursor();
    document.querySelectorAll(".tool-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-tool") === tool);
    });
  }

  private finishPenPath() {
    if (this._penPathId != null) {
      // Remove paths with fewer than 2 points
      const count = this.engine.path_point_count(this._penPathId);
      if (count < 2) {
        this.engine.remove_node(this._penPathId);
        this.engine.deselect_all();
      } else {
        this.engine.select(this._penPathId);
        this.fireSelectionNow([this._penPathId]);
        this.onLayersChanges.forEach(fn => fn());
      }
      this._penPathId = null;
      this._penDragging = false;
    }
    this.setTool("select");
  }

  private updateCursor() {
    const cursors: Record<ToolType, string> = {
      select: "default", hand: "grab", rect: "crosshair",
      ellipse: "crosshair", text: "text", frame: "crosshair",
      section: "crosshair", image: "crosshair", pen: "crosshair",
    };
    this.canvas.style.cursor = cursors[this.currentTool] || "default";
  }

  // === Image support ===

  private pasteNodes() {
    if (this._clipboard) {
      this.engine.push_undo();
      this._pasteCount++;
      const offset = this._pasteCount * 10;
      const newIds = this.engine.paste_nodes(this._clipboard, offset, offset);
      const ids = JSON.parse(newIds).map(Number);
      this.onLayersChanges.forEach(fn => fn());
      this.fireSelectionNow(ids);
      this.needsRender = true;
    }
  }

  private createImageFromBlob(blob: Blob) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const zoom = this.engine.get_zoom();
        const cx = this.canvas.getBoundingClientRect().width / 2;
        const cy = this.canvas.getBoundingClientRect().height / 2;
        const sx = this.engine.screen_to_scene_x(cx, cy);
        const sy = this.engine.screen_to_scene_y(cx, cy);
        // Limit size to 400px max dimension
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        const maxDim = 400;
        if (w > maxDim || h > maxDim) {
          const scale = maxDim / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        this.engine.push_undo();
        const id = this.engine.add_image(sx - w / 2, sy - h / 2, w, h, dataUrl);
        this._imageCache.set(dataUrl, img);
        this.engine.select(id);
        this.fireSelectionNow([Number(id)]);
        this.onLayersChanges.forEach(fn => fn());
        this.needsRender = true;
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(blob);
  }

  private promptImageSrc(nodeId: number | bigint) {
    const src = prompt("Image URL:");
    if (src) {
      this.engine.set_image_src(BigInt(nodeId), src);
      this.loadImageForNode(src);
      this.needsRender = true;
    }
  }

  private loadImageForNode(src: string) {
    if (!src || this._imageCache.has(src) || this._imageLoading.has(src)) return;
    this._imageLoading.add(src);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      this._imageCache.set(src, img);
      this._imageLoading.delete(src);
      this.needsRender = true;
    };
    img.onerror = () => {
      this._imageLoading.delete(src);
    };
    img.src = src;
  }

  private setupDragDrop() {
    this.canvas.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "copy";
    });
    this.canvas.addEventListener("drop", (e) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const img = new Image();
          img.onload = () => {
            const sx = this.engine.screen_to_scene_x(e.offsetX, e.offsetY);
            const sy = this.engine.screen_to_scene_y(e.offsetX, e.offsetY);
            let w = img.naturalWidth;
            let h = img.naturalHeight;
            const maxDim = 400;
            if (w > maxDim || h > maxDim) {
              const scale = maxDim / Math.max(w, h);
              w = Math.round(w * scale);
              h = Math.round(h * scale);
            }
            this.engine.push_undo();
            const id = this.engine.add_image(sx - w / 2, sy - h / 2, w, h, dataUrl);
            this._imageCache.set(dataUrl, img);
            this.engine.select(id);
            this.fireSelectionNow([Number(id)]);
            this.onLayersChanges.forEach(fn => fn());
            this.needsRender = true;
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  /** Render images on top of the engine-rendered canvas */
  private renderImages() {
    const layers = JSON.parse(this.engine.get_layer_list());
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();

    for (const layer of layers) {
      if (!layer.visible) continue;
      const nj = this.engine.get_node_json(BigInt(layer.id));
      if (!nj) continue;
      const node = JSON.parse(nj);
      const kind = node.kind;
      if (typeof kind !== "object" || !kind.Image) continue;

      const src = kind.Image.src;
      if (!src) continue;

      // Ensure image is loaded
      const img = this._imageCache.get(src);
      if (!img) {
        this.loadImageForNode(src);
        continue;
      }

      const x = node.x * zoom + panX;
      const y = node.y * zoom + panY;
      const w = node.width * zoom;
      const h = node.height * zoom;

      this.ctx.save();
      this.ctx.globalAlpha = node.opacity ?? 1;
      if (node.blend_mode && node.blend_mode !== "normal") {
        this.ctx.globalCompositeOperation = node.blend_mode;
      }

      // Clip for corner radius
      if (node.corner_radius > 0) {
        const r = node.corner_radius * zoom;
        this.ctx.beginPath();
        this.ctx.roundRect(x, y, w, h, r);
        this.ctx.clip();
      }

      // Draw image with fit mode
      const fit = kind.Image.fit || "cover";
      if (fit === "fill") {
        this.ctx.drawImage(img, x, y, w, h);
      } else {
        // cover or contain
        const imgAspect = img.naturalWidth / img.naturalHeight;
        const nodeAspect = w / h;
        let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
        if (fit === "cover") {
          if (imgAspect > nodeAspect) {
            sw = img.naturalHeight * nodeAspect;
            sx = (img.naturalWidth - sw) / 2;
          } else {
            sh = img.naturalWidth / nodeAspect;
            sy = (img.naturalHeight - sh) / 2;
          }
        }
        this.ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
      }

      this.ctx.restore();
    }
  }

  /** Get bounds of all visible, non-selected nodes for snapping */
  private getNonSelectedBounds(selectedIds: Set<number>): { id: number; x: number; y: number; w: number; h: number }[] {
    const layers = JSON.parse(this.engine.get_layer_list());
    const result: { id: number; x: number; y: number; w: number; h: number }[] = [];
    for (const l of layers) {
      if (!l.visible || selectedIds.has(l.id)) continue;
      const nj = this.engine.get_node_json(BigInt(l.id));
      if (!nj) continue;
      const n = JSON.parse(nj);
      result.push({ id: l.id, x: n.x, y: n.y, w: n.width, h: n.height });
    }
    return result;
  }

  /** Get combined bounding box of selected nodes */
  private getSelectionBBox(sel: number[]): { x: number; y: number; w: number; h: number } | null {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of sel) {
      const nj = this.engine.get_node_json(BigInt(id));
      if (!nj) continue;
      const n = JSON.parse(nj);
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    }
    if (!isFinite(minX)) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  selectNode(id: number | bigint) {
    this.engine.select(BigInt(id));
    this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number).map(Number));
    this.needsRender = true;
  }
  onSelection(fn: (ids: number[]) => void) { this.onSelectionChanges.push(fn); }
  onLayers(fn: () => void) { this.onLayersChanges.push(fn); }
  requestRender() { this.needsRender = true; }

  get layoutGridsVisible() { return this._layoutGridsVisible; }
  set layoutGridsVisible(v: boolean) { this._layoutGridsVisible = v; this.needsRender = true; }

  setRulers(rulers: RulersAPI) { this._rulers = rulers; }

  getRulers(): RulersAPI | null { return this._rulers; }

  private renderGuideLines() {
    if (!this._rulers) return;
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    const rect = this.canvas.getBoundingClientRect();
    this._rulers.renderGuideLines(this.ctx, zoom, panX, panY, rect.width, rect.height);
  }
  notifyLayersChanged() { this.onLayersChanges.forEach(fn => fn()); }
  notifySelectionChanged(ids: number[]) { this.fireSelectionNow(ids); }
  onSave(fn: () => void) { this.onSaveCallbacks.push(fn); }

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
      if (node.blend_mode && node.blend_mode !== "normal") {
        offCtx.globalCompositeOperation = node.blend_mode;
      }

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
      const fontWeight = text.font_weight ?? 400;
      const fontStyleStr = text.font_style === "Italic" ? "italic " : "";
      const lineHeight = text.line_height ?? 1.2;
      ctx.font = `${fontStyleStr}${fontWeight} ${fontSize}px ${fontFamily}, system-ui, sans-serif`;
      if (fill) {
        ctx.fillStyle = `rgba(${fill.r},${fill.g},${fill.b},${fill.a})`;
      } else {
        ctx.fillStyle = "#000";
      }
      ctx.textBaseline = "alphabetic";
      const mMetrics = ctx.measureText("M");
      const ascent = mMetrics.actualBoundingBoxAscent || fontSize * 0.8;
      const content = text.content || "";
      const lines = content.split('\n');
      const lineH = fontSize * lineHeight;
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], x, y + ascent + lineH * i);
      }
    }
  }

  /**
   * Export entire scene as SVG string
   */
  exportSVG(): string {
    return this.engine.export_svg();
  }

  /**
   * Export selected nodes as SVG string
   */
  exportSelectionSVG(): string {
    return this.engine.export_selection_svg();
  }

  /**
   * Export SVG and trigger download
   */
  downloadSVG(nodeId?: number | bigint, filename?: string) {
    let svg: string;
    if (nodeId != null) {
      svg = this.engine.export_node_svg(BigInt(nodeId));
    } else {
      const sel = Array.from(this.engine.get_selection()).map(Number);
      if (sel.length > 0) {
        svg = this.engine.export_selection_svg();
      } else {
        svg = this.engine.export_svg();
      }
    }
    if (!svg) return false;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "opensketch-export.svg";
    a.click();
    URL.revokeObjectURL(url);
    return true;
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

  // =============================================
  // Zoom controls
  // =============================================

  getZoomLevel(): number {
    return this.engine.get_zoom();
  }

  zoomTo100() {
    const cw = this.engine.get_canvas_width();
    const ch = this.engine.get_canvas_height();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    const zoom = this.engine.get_zoom();
    // Keep center point stable
    const centerSceneX = (cw / 2 - panX) / zoom;
    const centerSceneY = (ch / 2 - panY) / zoom;
    const newTx = cw / 2 - centerSceneX;
    const newTy = ch / 2 - centerSceneY;
    this.engine.set_viewport(1.0, newTx, newTy);
    this.needsRender = true;
    this.onZoomChange();
  }

  zoomToFit() {
    const boundsJson = this.engine.get_scene_bounds();
    if (!boundsJson) return;
    this.zoomToBounds(JSON.parse(boundsJson));
  }

  zoomToSelection() {
    const boundsJson = this.engine.get_selection_bounds();
    if (!boundsJson) return;
    this.zoomToBounds(JSON.parse(boundsJson));
  }

  private zoomToBounds(bounds: [number, number, number, number]) {
    const [minX, minY, maxX, maxY] = bounds;
    const w = maxX - minX;
    const h = maxY - minY;
    if (w <= 0 || h <= 0) return;
    const cw = this.engine.get_canvas_width();
    const ch = this.engine.get_canvas_height();
    const padding = 40;
    const zoom = Math.min((cw - padding * 2) / w, (ch - padding * 2) / h, 10);
    const clampedZoom = Math.max(0.1, Math.min(zoom, 10));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const tx = cw / 2 - cx * clampedZoom;
    const ty = ch / 2 - cy * clampedZoom;
    this.engine.set_viewport(clampedZoom, tx, ty);
    this.needsRender = true;
    this.onZoomChange();
  }

  zoomBy(factor: number) {
    const cw = this.engine.get_canvas_width();
    const ch = this.engine.get_canvas_height();
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    const newZoom = Math.max(0.1, Math.min(zoom * factor, 10));
    const scale = newZoom / zoom;
    const tx = cw / 2 - (cw / 2 - panX) * scale;
    const ty = ch / 2 - (ch / 2 - panY) * scale;
    this.engine.set_viewport(newZoom, tx, ty);
    this.needsRender = true;
    this.onZoomChange();
  }

  private _onZoomChanges: (() => void)[] = [];

  onZoomChanged(fn: () => void) {
    this._onZoomChanges.push(fn);
  }

  private onZoomChange() {
    this._onZoomChanges.forEach(fn => fn());
  }

  // =============================================
  // Boolean Operations
  // =============================================

  booleanOperation(op: "union" | "subtract" | "intersect" | "exclude") {
    const sel = Array.from(this.engine.get_selection()).map(Number);
    if (sel.length < 2) return;
    this.engine.push_undo();
    const newId = this.engine.boolean_operation(op);
    if (newId) {
      this.fireSelectionNow([Number(newId)]);
      (this as any).onLayersChanges?.forEach?.((fn: any) => fn());
      this.requestRender();
    }
  }

  // =============================================
  // Flatten Selection
  // =============================================

  openResponsivePreview() {
    openResponsivePreview(this.engine);
  }

  flattenSelection() {
    const sel = Array.from(this.engine.get_selection()).map(Number);
    if (sel.length === 0) return;
    const count = this.engine.flatten_selection();
    if (count > 0) {
      const newSel = Array.from(this.engine.get_selection()).map(Number);
      this.fireSelectionNow(newSel);
      (this as any).onLayersChanges?.forEach?.((fn: any) => fn());
      this.requestRender();
    }
  }

  // =============================================
  // Right-click context menu
  // =============================================

  private onContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const sel = Array.from(this.engine.get_selection()).map(Number);
    const hasSel = sel.length > 0;
    const isMac = navigator.platform.includes("Mac");
    const mod = isMac ? "⌘" : "Ctrl+";

    // If right-clicked on a node that's not selected, select it
    const hitId = Number(this.engine.hit_test(e.offsetX, e.offsetY) ?? 0);
    if (hitId > 0 && !sel.includes(hitId)) {
      this.engine.deselect_all();
      this.engine.select(BigInt(hitId));
      this.fireSelectionNow([hitId]);
      this.needsRender = true;
    }

    const selAfter = Array.from(this.engine.get_selection()).map(Number);
    const hasSelAfter = selAfter.length > 0;

    const items: MenuItem[] = [];

    if (hasSelAfter) {
      // Node context menu
      items.push({ label: "Copy", shortcut: `${mod}C`, enabled: true, action: () => this.ctxCopy() });
      items.push({ label: "Cut", shortcut: `${mod}X`, enabled: true, action: () => this.ctxCut() });
      items.push({ label: "Paste", shortcut: `${mod}V`, enabled: !!this._clipboard, action: () => this.pasteNodes() });
      items.push({ label: "Duplicate", shortcut: `${mod}D`, enabled: true, action: () => this.ctxDuplicate() });
      items.push({ label: "Delete", shortcut: "⌫", enabled: true, action: () => this.ctxDelete() });
      items.push({ separator: true, label: "" });

      // Lock / visibility
      const node = this.engine.get_node_json(selAfter[0]);
      let isLocked = false;
      let isHidden = false;
      try {
        const data = JSON.parse(node);
        isLocked = data.locked;
        isHidden = !data.visible;
      } catch {}

      // Group/Ungroup
      let isGroup = false;
      try {
        const kind = typeof JSON.parse(node).kind === "string" ? JSON.parse(node).kind : Object.keys(JSON.parse(node).kind)[0];
        isGroup = kind === "Group";
      } catch {}
      items.push({ label: "Group", shortcut: `${mod}G`, enabled: selAfter.length >= 2, action: () => this.ctxGroup() });
      items.push({ label: "Ungroup", enabled: isGroup, action: () => this.ctxUngroup() });
      items.push({ label: isLocked ? "Unlock" : "Lock", action: () => this.ctxToggleLock() });
      items.push({ label: isHidden ? "Show" : "Hide", action: () => this.ctxToggleVisible() });
      items.push({ separator: true, label: "" });

      items.push({ label: "Bring to Front", shortcut: "]", action: () => this.ctxBringToFront() });
      items.push({ label: "Bring Forward", shortcut: "⌥]", action: () => this.ctxBringForward() });
      items.push({ label: "Send Backward", shortcut: "⌥[", action: () => this.ctxSendBackward() });
      items.push({ label: "Send to Back", shortcut: "[", action: () => this.ctxSendToBack() });
      items.push({ separator: true, label: "" });

      items.push({ label: "Flatten", shortcut: `${mod}E`, enabled: true, action: () => this.flattenSelection() });
    } else {
      // Empty canvas context menu
      items.push({ label: "Paste", shortcut: `${mod}V`, enabled: !!this._clipboard, action: () => this.pasteNodes() });
      items.push({ label: "Select All", shortcut: `${mod}A`, action: () => this.ctxSelectAll() });
      items.push({ separator: true, label: "" });
      items.push({ label: "Zoom to Fit", shortcut: `${mod}1`, action: () => this.zoomToFit() });
      items.push({ label: "Zoom to 100%", shortcut: `${mod}0`, action: () => this.zoomTo100() });
    }

    showContextMenu(e.clientX, e.clientY, items);
  }

  private ctxCopy() {
    const json = this.engine.copy_selected();
    if (json && json !== "[]") {
      this._clipboard = json;
      this._pasteCount = 0;
    }
  }

  private ctxCut() {
    this.ctxCopy();
    this.engine.push_undo();
    const sel = this.engine.get_selection();
    sel.forEach((id: number) => this.engine.remove_node(id));
    this.engine.deselect_all();
    this.onLayersChanges.forEach(fn => fn());
    this.fireSelectionNow([]);
    this.needsRender = true;
  }

  private ctxDuplicate() {
    const json = this.engine.copy_selected();
    if (json && json !== "[]") {
      this.engine.push_undo();
      const newIds = this.engine.paste_nodes(json, 10, 10);
      const ids = JSON.parse(newIds).map(Number);
      this.onLayersChanges.forEach(fn => fn());
      this.fireSelectionNow(ids);
      this.needsRender = true;
    }
  }

  private ctxDelete() {
    this.engine.push_undo();
    const sel = this.engine.get_selection();
    sel.forEach((id: number) => this.engine.remove_node(id));
    this.engine.deselect_all();
    this.onLayersChanges.forEach(fn => fn());
    this.fireSelectionNow([]);
    this.needsRender = true;
  }

  private ctxToggleLock() {
    const sel = Array.from(this.engine.get_selection()).map(Number);
    this.engine.push_undo();
    for (const id of sel) {
      try {
        const data = JSON.parse(this.engine.get_node_json(id));
        this.engine.set_locked(id, !data.locked);
      } catch {}
    }
    this.onLayersChanges.forEach(fn => fn());
    this.needsRender = true;
  }

  private ctxToggleVisible() {
    const sel = Array.from(this.engine.get_selection()).map(Number);
    this.engine.push_undo();
    for (const id of sel) {
      try {
        const data = JSON.parse(this.engine.get_node_json(id));
        this.engine.set_visible(id, !data.visible);
      } catch {}
    }
    this.onLayersChanges.forEach(fn => fn());
    this.needsRender = true;
  }

  private ctxBringToFront() {
    const sel = Array.from(this.engine.get_selection()).map(Number);
    this.engine.push_undo();
    for (const id of sel) this.engine.bring_to_front(id);
    this.onLayersChanges.forEach(fn => fn());
    this.needsRender = true;
  }

  private ctxBringForward() {
    const sel = Array.from(this.engine.get_selection()).map(Number);
    this.engine.push_undo();
    for (const id of sel) this.engine.bring_forward(id);
    this.onLayersChanges.forEach(fn => fn());
    this.needsRender = true;
  }

  private ctxSendBackward() {
    const sel = Array.from(this.engine.get_selection()).map(Number);
    this.engine.push_undo();
    for (const id of sel) this.engine.send_backward(id);
    this.onLayersChanges.forEach(fn => fn());
    this.needsRender = true;
  }

  private ctxSendToBack() {
    const sel = Array.from(this.engine.get_selection()).map(Number);
    this.engine.push_undo();
    for (const id of sel) this.engine.send_to_back(id);
    this.onLayersChanges.forEach(fn => fn());
    this.needsRender = true;
  }

  private ctxGroup() {
    this.engine.push_undo();
    const gid = this.engine.group_selected();
    if (gid) {
      this.onLayersChanges.forEach(fn => fn());
      this.fireSelectionNow([Number(gid)]);
      this.needsRender = true;
    }
  }

  private ctxUngroup() {
    const sel = Array.from(this.engine.get_selection()).map(Number);
    if (sel.length !== 1) return;
    this.engine.push_undo();
    if (this.engine.ungroup(sel[0])) {
      const newSel = Array.from(this.engine.get_selection()).map(Number);
      this.onLayersChanges.forEach(fn => fn());
      this.fireSelectionNow(newSel);
      this.needsRender = true;
    }
  }

  private ctxSelectAll() {
    this.engine.select_all();
    const sel = Array.from(this.engine.get_selection()).map(Number);
    this.fireSelectionNow(sel);
    this.needsRender = true;
  }
}
