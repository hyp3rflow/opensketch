import type { Engine } from "./wasm/opensketch_engine";
import { renderPixelGrid, renderDeviceFrame } from "./ui/pixel-preview";
import { computeSnap, renderGuides, type SnapGuide } from "./tools/smart-guides";
import { computePointSnap, renderPointSnapIndicators, collectPathPointTargets, addRulerTargets, constrainAngle, type PointSnapIndicator, type PointSnapTarget } from "./tools/point-snap";
import { computeMeasureLines, renderMeasureLines, renderTargetHighlight, type MeasureLine } from "./tools/measure";
import type { RulersAPI } from "./ui/rulers";
import { toggleShortcutsPanel, isShortcutsPanelVisible, closeShortcutsPanel } from "./ui/shortcuts-panel";
import { getShortcutManager } from "./ui/shortcut-manager";
import { showContextMenu, hideContextMenu, type MenuItem } from "./ui/context-menu";
import { openResponsivePreview, isResponsivePreviewOpen, closeResponsivePreview } from "./ui/responsive-preview";
import { openResponsiveTokensPanel, closeResponsiveTokensPanel, isResponsiveTokensPanelOpen } from "./ui/responsive-tokens";
import { CursorPresence } from "./ui/cursor-presence";
import { CursorChat } from "./ui/cursor-chat";
import { openComponentSwapModal } from "./ui/component-swap";
import { openSmartReplace, closeSmartReplace, isSmartReplaceOpen } from "./ui/smart-replace";
import { renderStamps as renderStampsOverlay, hitTestStamp, isStampModeActive, getActiveStampKind, setActiveStampKind, toggleStampPalette, closeStampPalette } from "./ui/stamp-tool";
import { openComponentLibraryPanel } from "./ui/component-library";
import { openComponentAnalytics, closeComponentAnalytics, isComponentAnalyticsOpen } from "./ui/component-analytics";
import { openSmartSuggestions, closeSmartSuggestions, isSmartSuggestionsOpen } from "./ui/smart-suggestions";
import { GradientEditor } from "./ui/gradient-editor";
import { SmartSelectPanel } from "./ui/smart-select";
import type { CollabClient } from "./collab";
import { findSpacingHandles, hitTestSpacingHandle, renderSpacingHandles, type SpacingHandle } from "./tools/spacing-handles";
import { showLayoutSuggestion, dismissSuggestion } from "./ui/ai-layout-suggest";
import { toggleFindReplace, closeFindReplace } from "./ui/find-replace-panel";
import { toggleSearchFilter, closeSearchFilter, renderSearchFilterDimming } from "./ui/search-filter";
import { toggleRecorderBar } from "./ui/canvas-recorder";
import { toggleSpotlight, closeSpotlight, isSpotlightVisible } from "./ui/spotlight";
import { exportPDF, type PDFExportOptions } from "./ui/pdf-export";
import { setupDiffOverlay } from "./ui/diff-overlay";
import { DevModeOverlay } from "./ui/dev-mode-overlay";
import { WhiteboardMode } from "./ui/whiteboard-mode";
import { initSnapshotPanel } from "./ui/snapshot-panel";
import { togglePerfProfiler, closePerfProfiler, isPerfProfilerOpen } from "./ui/perf-profiler";
import { openComponentPlayground, closeComponentPlayground, isComponentPlaygroundOpen } from "./ui/component-playground";

export type ToolType = "select" | "hand" | "rect" | "ellipse" | "text" | "frame" | "section" | "image" | "pen" | "star" | "polygon" | "slice" | "connector" | "sticky" | "table" | "freehand";

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

  whiteboardMode: WhiteboardMode;

  private _imageCache: Map<string, HTMLImageElement> = new Map();
  private _imageLoading: Set<string> = new Set();

  // Pen tool state
  private _penPathId: number | null = null;
  private _penDragging = false;
  private _penDragStartX = 0;
  private _penDragStartY = 0;
  /** Pressure sensitivity: auto-detect stylus and map pressure → per-point stroke width */
  private _penPressureEnabled = true;
  private _penLastPressure = 0.5;

  // Path edit mode state
  private _pathEditMode = false;
  private _pathEditNodeId: number | null = null;
  private _pathEditSelectedPoint: number | null = null;
  private _pathEditDragType: 'anchor' | 'handle_in' | 'handle_out' | null = null;
  private _pathEditDragOffsetX = 0;
  private _pathEditDragOffsetY = 0;

  // Connector tool state
  private _connectorDrag: { startNodeId: number; sx: number; sy: number; ex?: number; ey?: number; endNodeId?: number } | null = null;

  // Freehand drawing state
  private _freehandPathId: number | null = null;
  private _freehandPoints: { x: number; y: number }[] = [];
  private _freehandDrawing = false;
  private _pathEditHandleOffsets: { hix: number; hiy: number; hox: number; hoy: number } | null = null;

  // Vector Network edit mode state
  private _vnEditMode = false;
  private _vnEditNodeId: number | null = null;
  private _vnSelectedVertex: number | null = null;
  private _vnDraggingVertex: number | null = null;
  private _vnConnectStart: number | null = null;
  private _vnSelectedSegment: number | null = null;
  private _vnHoverSegment: { id: number; t: number } | null = null;
  private _vnDraggingHandle: { segId: number; which: "start" | "end" } | null = null;
  private _vnConnectPreview: { x: number; y: number } | null = null;

  // Mesh edit mode state
  private _meshEditMode = false;
  private _meshEditNodeId: number | null = null;
  private _meshEditFillIndex = 0;
  private _meshEditSelectedPoint: number | null = null;
  private _meshEditDragging = false;

  // Smart guides state
  private _snapGuides: SnapGuide[] = [];
  private _pointSnapIndicators: PointSnapIndicator[] = [];
  private _measureLines: MeasureLine[] = [];
  private _measureTargetBounds: { x: number; y: number; w: number; h: number } | null = null;
  private _altHeld = false;
  private _devMode = false;
  private _devModeOverlay: DevModeOverlay;
  private _devHoverNodeId: number | null = null;
  private _devHoverTimer: ReturnType<typeof setTimeout> | null = null;
  private onSaveCallbacks: (() => void)[] = [];
  private _layoutGridsVisible = true;

  // Rulers & guides
  private _rulers: RulersAPI | null = null;
  private _diffOverlay: ReturnType<typeof setupDiffOverlay> | null = null;
  private _gradientEditor: GradientEditor | null = null;
  private _smartSelectPanel: SmartSelectPanel;
  private _snapshotPanel: ReturnType<typeof initSnapshotPanel> | null = null;

  // Spacing handles (auto-layout gap drag)
  private _spacingHandles: SpacingHandle[] = [];
  private _spacingHovered: SpacingHandle | null = null;
  private _spacingDragging: SpacingHandle | null = null;
  private _spacingDragStartY = 0;
  private _spacingDragStartX = 0;
  private _spacingDragStartGap = 0;

  // Cursor presence
  private _cursorPresence = new CursorPresence();
  private _cursorDemoCleanup: (() => void) | null = null;

  // Collaboration
  private _collabClient: CollabClient | null = null;
  private _collabIgnoreRemote = false;

  // Cursor chat state
  private _chatInputActive = false;
  private _chatInputEl: HTMLInputElement | null = null;
  private _chatInputContainer: HTMLDivElement | null = null;
  private _chatInputCleanup: (() => void) | null = null;
  private _cursorChat = new CursorChat();
  private _lastPointerScreenX = 0;
  private _lastPointerScreenY = 0;

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
    this._smartSelectPanel = new SmartSelectPanel(this);
    this._gradientEditor = new GradientEditor(
      engine,
      () => this.requestRender(),
      () => this.engine.push_undo(),
      () => this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number)),
    );
    this._diffOverlay = setupDiffOverlay(this);
    this._devModeOverlay = new DevModeOverlay(this);
    this.whiteboardMode = new WhiteboardMode(this);
    this._cursorChat.init({
      onSend: (text, x, y, isReaction) => {
        if (isReaction) {
          this._cursorPresence.setLocalChat(text, x, y);
          this._collabClient?.sendChat(text, x, y);
        } else {
          this._cursorPresence.setLocalChat(text, x, y);
          this._collabClient?.sendChat(text, x, y);
        }
        this.needsRender = true;
      },
      getUsers: () => {
        return this._cursorPresence.getCursors().map(c => ({
          id: c.id, name: c.name, color: c.color,
        }));
      },
    });
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

    // Wheel: batch into rAF with inertia
    let pendingWheel: { dx: number; dy: number; cx: number; cy: number; isZoom: boolean } | null = null;
    // Inertia state for smooth scroll/zoom deceleration
    const inertia = {
      vx: 0, vy: 0,           // pan velocity (px/frame)
      vz: 0,                   // zoom velocity (delta/frame)
      cx: 0, cy: 0,           // last cursor position for zoom
      active: false,
      rafId: 0,
      lastWheelTime: 0,
      wheelTimeout: 0 as any,
    };
    const INERTIA_FRICTION = 0.92;  // deceleration factor per frame
    const INERTIA_MIN_V = 0.5;     // stop threshold (px/frame for pan)
    const INERTIA_MIN_VZ = 0.01;   // stop threshold for zoom

    const startInertia = () => {
      if (inertia.active) return;
      inertia.active = true;
      const tick = () => {
        // Apply friction
        inertia.vx *= INERTIA_FRICTION;
        inertia.vy *= INERTIA_FRICTION;
        inertia.vz *= INERTIA_FRICTION;

        const hasPan = Math.abs(inertia.vx) > INERTIA_MIN_V || Math.abs(inertia.vy) > INERTIA_MIN_V;
        const hasZoom = Math.abs(inertia.vz) > INERTIA_MIN_VZ;

        if (!hasPan && !hasZoom) {
          inertia.active = false;
          inertia.vx = inertia.vy = inertia.vz = 0;
          return;
        }

        if (hasPan) {
          this.engine.pan(-inertia.vx, -inertia.vy);
        }
        if (hasZoom) {
          this.engine.zoom(inertia.vz, inertia.cx, inertia.cy);
        }
        this.needsRender = true;
        inertia.rafId = requestAnimationFrame(tick);
      };
      inertia.rafId = requestAnimationFrame(tick);
    };

    const stopInertia = () => {
      if (inertia.active) {
        cancelAnimationFrame(inertia.rafId);
        inertia.active = false;
        inertia.vx = inertia.vy = inertia.vz = 0;
      }
    };

    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const isZoom = e.ctrlKey || e.metaKey;

      // Check if hovering over a scrollable frame
      if (!isZoom) {
        const scrollableFrame = this.findScrollableFrameAtCursor(e.offsetX, e.offsetY);
        if (scrollableFrame !== null) {
          this.scrollFrame(scrollableFrame, e.deltaX, e.deltaY);
          return;
        }
      }

      // Stop any running inertia when new wheel events arrive
      stopInertia();

      // Track velocity for inertia (exponential moving average)
      const alpha = 0.3; // smoothing factor
      if (isZoom) {
        inertia.vz = inertia.vz * (1 - alpha) + e.deltaY * alpha;
        inertia.cx = e.offsetX;
        inertia.cy = e.offsetY;
      } else {
        inertia.vx = inertia.vx * (1 - alpha) + e.deltaX * alpha;
        inertia.vy = inertia.vy * (1 - alpha) + e.deltaY * alpha;
      }
      inertia.lastWheelTime = performance.now();

      if (!pendingWheel) {
        pendingWheel = { dx: 0, dy: 0, cx: e.offsetX, cy: e.offsetY, isZoom };
        requestAnimationFrame(() => {
          if (pendingWheel) {
            // Break follow mode on manual pan/zoom
            if (this._cursorPresence.followingId) this._cursorPresence.unfollow();
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

      // Start inertia after wheel events stop (80ms debounce)
      clearTimeout(inertia.wheelTimeout);
      inertia.wheelTimeout = setTimeout(() => {
        // Only start if there's meaningful velocity
        const hasPanV = Math.abs(inertia.vx) > INERTIA_MIN_V || Math.abs(inertia.vy) > INERTIA_MIN_V;
        const hasZoomV = Math.abs(inertia.vz) > INERTIA_MIN_VZ;
        if (hasPanV || hasZoomV) {
          startInertia();
        }
      }, 80);
    }, { passive: false });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Alt") this._altHeld = true;
      if (this.isInputFocused()) return;
      const _sm = getShortcutManager();
      // Shortcuts panel: Cmd+/ or ?
      if (_sm.matches(e, "panel.shortcuts") || (e.key === "?" && !e.metaKey && !e.ctrlKey)) {
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
      // Undo
      if (_sm.matches(e, "edit.undo")) {
        e.preventDefault();
        if (this.engine.undo()) {
          this.onLayersChanges.forEach(fn => fn());
          this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
          this.needsRender = true;
        }
        return;
      }
      // Redo
      if (_sm.matches(e, "edit.redo") || ((e.metaKey || e.ctrlKey) && e.key === "y")) {
        e.preventDefault();
        if (this.engine.redo()) {
          this.onLayersChanges.forEach(fn => fn());
          this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
          this.needsRender = true;
        }
        return;
      }
      // Save
      if (_sm.matches(e, "edit.save")) {
        e.preventDefault();
        this.onSaveCallbacks.forEach(fn => fn());
        return;
      }
      // Node search spotlight
      if (_sm.matches(e, "panel.spotlight")) {
        e.preventDefault();
        toggleSpotlight(this);
        return;
      }
      // Find & Replace
      if (_sm.matches(e, "panel.findReplace")) {
        e.preventDefault();
        toggleFindReplace(this);
        return;
      }
      // Search & Filter (Cmd+Shift+F)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "f" || e.key === "F") && !e.altKey) {
        e.preventDefault();
        openSearchFilter(this);
        return;
      }
      // Copy
      if (_sm.matches(e, "edit.copy")) {
        e.preventDefault();
        const json = this.engine.copy_selected();
        if (json && json !== "[]") {
          this._clipboard = json;
          this._pasteCount = 0;
        }
        return;
      }
      // Cut
      if (_sm.matches(e, "edit.cut")) {
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
      // Paste
      if (_sm.matches(e, "edit.paste")) {
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
      // Duplicate
      if (_sm.matches(e, "edit.duplicate")) {
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
      // Zoom to 100%
      if (_sm.matches(e, "view.zoom100")) {
        e.preventDefault();
        this.zoomTo100();
        return;
      }
      // Zoom to fit
      if (_sm.matches(e, "view.zoomFit")) {
        e.preventDefault();
        this.zoomToFit();
        return;
      }
      // Zoom to selection
      if (_sm.matches(e, "view.zoomSelection")) {
        e.preventDefault();
        this.zoomToSelection();
        return;
      }
      // Zoom in
      if (_sm.matches(e, "view.zoomIn") || e.key === "+") {
        e.preventDefault();
        this.zoomBy(1.25);
        return;
      }
      // Zoom out
      if (_sm.matches(e, "view.zoomOut")) {
        e.preventDefault();
        this.zoomBy(0.8);
        return;
      }
      // Flatten selection
      if (_sm.matches(e, "edit.flatten")) {
        e.preventDefault();
        this.flattenSelection();
        return;
      }
      // Auto dark mode
      if (_sm.matches(e, "edit.darkMode")) {
        e.preventDefault();
        this.autoDarkModeSelection();
        return;
      }
      // Bookmark toggle: Cmd+Shift+B
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        const sel = Array.from(this.engine.get_selection()).map(Number);
        if (sel.length > 0) {
          this.engine.push_undo();
          for (const id of sel) {
            this.engine.toggle_bookmark(BigInt(id));
          }
          this.onLayersChanges.forEach(fn => fn());
          this.needsRender = true;
        }
        return;
      }
      // Code to Design: Cmd+Shift+D
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        import("./ui/code-to-design").then(m => m.openCodeToDesignModal(this.engine, () => this.requestRender()));
        return;
      }
      // Batch Export: Cmd+Shift+E
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        import("./ui/batch-export").then(m => m.openBatchExport(this));
        return;
      }
      // Smart Select: Cmd+Shift+A
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        const sel = Array.from(this.engine.get_selection()).map(Number);
        if (sel.length === 1) {
          this.openSmartSelect(sel[0]!);
        }
        return;
      }
      // Boolean operations
      if (_sm.matches(e, "bool.union")) { e.preventDefault(); this.booleanOperation("union"); return; }
      if (_sm.matches(e, "bool.subtract")) { e.preventDefault(); this.booleanOperation("subtract"); return; }
      if (_sm.matches(e, "bool.intersect")) { e.preventDefault(); this.booleanOperation("intersect"); return; }
      if (_sm.matches(e, "bool.exclude")) { e.preventDefault(); this.booleanOperation("exclude"); return; }

      // Ctrl/Cmd+Shift+B: toggle bookmark on selected nodes
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        const sel = Array.from(this.engine.get_selection()).map(Number);
        if (sel.length > 0) {
          this.engine.push_undo();
          for (const id of sel) {
            this.engine.toggle_bookmark(BigInt(id));
          }
          this.requestRender();
        }
        return;
      }

      // Ctrl/Cmd+Shift+L: AI layout suggestion
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "l" || e.key === "L")) {
        e.preventDefault();
        showLayoutSuggestion(this);
        return;
      }

      // Ctrl/Cmd+Alt+L: component library
      if ((e.metaKey || e.ctrlKey) && e.altKey && (e.key === "l" || e.key === "L")) {
        e.preventDefault();
        this.openComponentLibrary();
        return;
      }

      // Ctrl/Cmd+Alt+A: component analytics
      if ((e.metaKey || e.ctrlKey) && e.altKey && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        this.openComponentAnalytics();
        return;
      }

      // Ctrl/Cmd+Alt+N: snapshot testing panel
      if ((e.metaKey || e.ctrlKey) && e.altKey && (e.key === "n" || e.key === "N") && !e.shiftKey) {
        e.preventDefault();
        this.toggleSnapshotPanel();
        return;
      }

      // Ctrl/Cmd+Alt+S: smart component suggestions
      if ((e.metaKey || e.ctrlKey) && e.altKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        this.openSmartSuggestions();
        return;
      }

      // Ctrl/Cmd+Shift+K: component search & swap
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        this.openComponentSwap();
        return;
      }

      // Ctrl/Cmd+Shift+H: smart replace
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "h" || e.key === "H")) {
        e.preventDefault();
        const sel = Array.from(this.engine.get_selection()).map(Number);
        if (sel.length === 1) this.openSmartReplacePanel(sel[0]!);
        return;
      }

      // Ctrl/Cmd+Shift+T: tidy up
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        this.tidyUpSelection();
        return;
      }

      // Ctrl/Cmd+Alt+G: smart grid distribute
      if ((e.metaKey || e.ctrlKey) && e.altKey && (e.key === "g" || e.key === "G")) {
        e.preventDefault();
        this.smartDistributeGrid();
        return;
      }

      // Ctrl/Cmd+Shift+R: batch rename
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        this.showBatchRenameDialog();
        return;
      }

      // Ctrl/Cmd+Shift+P: Performance Profiler
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        togglePerfProfiler(this.engine, this);
        return;
      }

      // Ctrl/Cmd+Shift+E: export PDF
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        this.downloadPDF();
        return;
      }

      // Ctrl/Cmd+Shift+G: Component Playground
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "g" || e.key === "G")) {
        e.preventDefault();
        if (isComponentPlaygroundOpen()) {
          closeComponentPlayground();
        } else {
          openComponentPlayground(this.engine);
        }
        return;
      }

      // Shift+Alt+R: toggle canvas recorder bar
      if (e.shiftKey && e.altKey && (e.key === "R" || e.key === "r") && !(e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleRecorderBar();
        return;
      }

      // Alt+P: Pixel Preview toggle
      if (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && (e.key === "p" || e.key === "π")) {
        e.preventDefault();
        this.togglePixelPreview();
        return;
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

      // Ctrl/Cmd+Alt+T: responsive tokens panel
      if ((e.metaKey || e.ctrlKey) && e.altKey && (e.key === "t" || e.key === "†")) {
        e.preventDefault();
        if (isResponsiveTokensPanelOpen()) {
          closeResponsiveTokensPanel();
        } else {
          this.openResponsiveTokens();
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
      // Cursor chat: / key opens chat input at cursor position
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        this.openCursorChat();
        return;
      }
      // Arrow key nudge: move selected nodes
      if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const sel = Array.from(this.engine.get_selection()).map(Number);
        if (sel.length > 0) {
          e.preventDefault();
          let amount = e.altKey ? 0.1 : e.shiftKey ? 10 : 1;
          let dx = 0, dy = 0;
          if (e.key === "ArrowLeft") dx = -amount;
          if (e.key === "ArrowRight") dx = amount;
          if (e.key === "ArrowUp") dy = -amount;
          if (e.key === "ArrowDown") dy = amount;
          this.engine.push_undo();
          for (const id of sel) {
            this.engine.move_node(BigInt(id), dx, dy);
          }
          this.needsRender = true;
          this.fireSelectionNow(sel);
        }
        return;
      }
      // Tool shortcuts via ShortcutManager
      // Whiteboard mode shortcuts
      if (e.key === "w" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (this.whiteboardMode.handleKeydown("w")) { e.preventDefault(); return; }
      }
      if (e.key === "v" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && this.whiteboardMode.isActive) {
        if (this.whiteboardMode.handleKeydown("v")) { e.preventDefault(); return; }
      }
      if (_sm.matches(e, "tool.section")) this.setTool("section");
      else if (_sm.matches(e, "tool.select")) this.setTool("select");
      else if (_sm.matches(e, "tool.hand")) this.setTool("hand");
      else if (_sm.matches(e, "tool.rect")) this.setTool("rect");
      else if (_sm.matches(e, "tool.ellipse")) this.setTool("ellipse");
      else if (_sm.matches(e, "tool.text")) this.setTool("text");
      else if (_sm.matches(e, "tool.frame")) this.setTool("frame");
      else if (_sm.matches(e, "tool.image")) this.setTool("image");
      else if (_sm.matches(e, "tool.pen")) this.setTool("pen");
      else if (_sm.matches(e, "tool.star")) this.setTool("star");
      else if (_sm.matches(e, "tool.polygon")) this.setTool("polygon");
      else if (_sm.matches(e, "tool.sticky")) this.setTool("sticky");
      else if (_sm.matches(e, "tool.freehand")) this.setTool("freehand");
      else if (_sm.matches(e, "whiteboard.toggle")) { (window as any).__toggleWhiteboard?.(); }
      else if (_sm.matches(e, "whiteboard.timer")) { (window as any).__toggleTimer?.(); }
      else if (_sm.matches(e, "tool.table")) this.setTool("table");
      else if (_sm.matches(e, "tool.slice")) this.setTool("slice");
      else if (_sm.matches(e, "tool.connector")) this.setTool("connector");
      else if (_sm.matches(e, "misc.voice")) { (window as any).__toggleVoice?.(); }
      else if (_sm.matches(e, "misc.fileDiff")) { (window as any).__openFileDiffMerge?.(); }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (this._vnEditMode && this._vnEditNodeId != null) {
          if (this._vnSelectedVertex != null) {
            this.engine.push_undo();
            this.engine.vn_remove_vertex(BigInt(this._vnEditNodeId), BigInt(this._vnSelectedVertex));
            this._vnSelectedVertex = null;
            this.engine.vn_detect_regions(BigInt(this._vnEditNodeId));
            this.needsRender = true;
            this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
            return;
          }
          if (this._vnSelectedSegment != null) {
            this.engine.push_undo();
            this.engine.vn_remove_segment(BigInt(this._vnEditNodeId), BigInt(this._vnSelectedSegment));
            this._vnSelectedSegment = null;
            this.engine.vn_detect_regions(BigInt(this._vnEditNodeId));
            this.needsRender = true;
            this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
            return;
          }
        }
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
        if (this._meshEditMode) {
          this.exitMeshEditMode();
          this.needsRender = true;
          return;
        }
        if (this._vnEditMode) {
          this.exitVNEditMode();
          this.needsRender = true;
          return;
        }
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
      if (e.key === "Alt") {
        this._altHeld = false;
        this._measureLines = [];
        this._measureTargetBounds = null;
        this.needsRender = true;
      }
    });
    // Alt key tracking is handled in the main keydown listener below
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

    // Stamp mode: place stamp on click
    if (isStampModeActive()) {
      const kind = getActiveStampKind();
      if (kind) {
        this.placeStamp(kind, x, y);
        // Stay in stamp mode for rapid placement; ESC or tool change exits
      }
      return;
    }

    // Mesh edit mode pointer handling
    if (this.currentTool === "select" && this._meshEditMode) {
      const ptIdx = this.meshHitTestPoint(x, y);
      if (ptIdx != null) {
        if (this._meshEditSelectedPoint === ptIdx) {
          // Already selected → open color picker
          this.openMeshPointColorPicker(ptIdx, x, y);
          return;
        }
        this._meshEditSelectedPoint = ptIdx;
        this._meshEditDragging = true;
        this.engine.push_undo();
        this.needsRender = true;
        this.canvas.setPointerCapture(e.pointerId);
        return;
      } else {
        // Click outside points → exit mesh edit
        this.exitMeshEditMode();
        return;
      }
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

    if (this.currentTool === "select" && this._vnEditMode && this._vnEditNodeId != null) {
      const hitV = this.vnHitTestVertex(x, y);
      if (hitV != null) {
        if (this._vnConnectStart != null && this._vnConnectStart !== hitV) {
          // Complete a segment connection
          this.engine.push_undo();
          this.engine.vn_add_segment(BigInt(this._vnEditNodeId), BigInt(this._vnConnectStart), BigInt(hitV), 0, 0, 0, 0);
          this._vnConnectStart = null;
          this.engine.vn_detect_regions(BigInt(this._vnEditNodeId));
          this.needsRender = true;
          this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
          this.canvas.setPointerCapture(e.pointerId);
          return;
        }
        if (e.shiftKey && this._vnSelectedVertex != null && this._vnSelectedVertex !== hitV) {
          // Shift+click: connect selected vertex to clicked vertex
          this.engine.push_undo();
          this.engine.vn_add_segment(BigInt(this._vnEditNodeId), BigInt(this._vnSelectedVertex), BigInt(hitV), 0, 0, 0, 0);
          this.engine.vn_detect_regions(BigInt(this._vnEditNodeId));
          this._vnSelectedVertex = hitV;
          this.needsRender = true;
          this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
          this.canvas.setPointerCapture(e.pointerId);
          return;
        }
        this._vnSelectedVertex = hitV;
        this._vnDraggingVertex = hitV;
        this._vnConnectStart = null;
        this.engine.push_undo();
        this.needsRender = true;
        this.canvas.setPointerCapture(e.pointerId);
        return;
      } else {
        // Check handle hit test
        const handleHit = this.vnHitTestHandle(x, y);
        if (handleHit) {
          this._vnDraggingHandle = handleHit;
          this._vnSelectedSegment = handleHit.segId;
          this.engine.push_undo();
          this.needsRender = true;
          this.canvas.setPointerCapture(e.pointerId);
          return;
        }
        // Check segment hit test
        const sx = this.engine.screen_to_scene_x(x, y);
        const sy = this.engine.screen_to_scene_y(x, y);
        const zoom = this.engine.get_zoom();
        const segHitJson = this.engine.vn_hit_test_segment(BigInt(this._vnEditNodeId), sx, sy, 6 / zoom);
        try {
          const segHit = JSON.parse(segHitJson);
          if (segHit.segment_id != null) {
            this._vnSelectedSegment = segHit.segment_id;
            this._vnSelectedVertex = null;
            this.needsRender = true;
            this.canvas.setPointerCapture(e.pointerId);
            return;
          }
        } catch {}
        // Click on empty space → add new vertex, auto-connect if vertex was selected
        this.engine.push_undo();
        const vid = Number(this.engine.vn_add_vertex(BigInt(this._vnEditNodeId), sx, sy));
        if (this._vnSelectedVertex != null) {
          this.engine.vn_add_segment(BigInt(this._vnEditNodeId), BigInt(this._vnSelectedVertex), BigInt(vid), 0, 0, 0, 0);
          this.engine.vn_detect_regions(BigInt(this._vnEditNodeId));
        }
        this._vnSelectedVertex = vid;
        this._vnSelectedSegment = null;
        this.needsRender = true;
        this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
        this.canvas.setPointerCapture(e.pointerId);
        return;
      }
    }

    // Spacing handle drag (auto-layout gap)
    if (this.currentTool === "select" && this._spacingHandles.length > 0) {
      const hit = hitTestSpacingHandle(this._spacingHandles, x, y);
      if (hit) {
        this.engine.push_undo();
        this._spacingDragging = hit;
        this._spacingDragStartX = x;
        this._spacingDragStartY = y;
        if (hit.mode === "selection") {
          // For selection mode, compute average gap from engine
          try {
            const axis = hit.axis || (hit.direction === "row" ? "horizontal" : "vertical");
            const info = JSON.parse(this.engine.get_selection_spacing(axis));
            this._spacingDragStartGap = info.avg_gap || 0;
          } catch { this._spacingDragStartGap = 0; }
        } else {
          try {
            const pj = this.engine.get_node_json(BigInt(hit.parentId));
            if (pj) this._spacingDragStartGap = JSON.parse(pj).layout?.gap ?? 0;
          } catch { this._spacingDragStartGap = 0; }
        }
        this.canvas.setPointerCapture(e.pointerId);
        return;
      }
    }

    // Gradient handle drag
    if (this.currentTool === "select" && this._gradientEditor) {
      const zoom = this.engine.get_zoom();
      const panX = this.engine.get_pan_x();
      const panY = this.engine.get_pan_y();
      if (this._gradientEditor.onPointerDown(x, y, zoom, panX, panY)) {
        this.canvas.setPointerCapture(e.pointerId);
        return;
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

      // Cmd+click (Meta on Mac, Ctrl on others) → deep select into groups/frames
      const isMeta = e.metaKey || (e.ctrlKey && !navigator.platform.includes("Mac"));
      const hit = isMeta ? (this.engine.deep_hit_test(x, y) ?? this.engine.hit_test(x, y)) : this.engine.hit_test(x, y);
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
      let sx = this.engine.screen_to_scene_x(x, y);
      let sy = this.engine.screen_to_scene_y(x, y);
      // Snap pen point to existing points/edges
      {
        const excludeId = this._penPathId ?? -1;
        const targets = this._collectPointSnapTargets(excludeId, -1);
        const zoom = this.engine.get_zoom();
        const threshold = SNAP_THRESHOLD_PX / zoom;
        // Angle constraint: if shift held and we have previous point, constrain angle
        let angleOrigin: { x: number; y: number } | undefined;
        if (e.shiftKey && this._penPathId != null) {
          const count = this.engine.path_point_count(this._penPathId);
          if (count > 0) {
            const data = JSON.parse(this.engine.path_get_data(this._penPathId) || "{}");
            if (data.points && data.points.length > 0) {
              const last = data.points[data.points.length - 1];
              angleOrigin = { x: last.x, y: last.y };
            }
          }
        }
        const snap = computePointSnap(sx, sy, targets, threshold, e.shiftKey, angleOrigin);
        sx = snap.x; sy = snap.y;
        this._pointSnapIndicators = snap.indicators;
      }

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

      // Pressure sensitivity: if stylus provides pressure, set per-point stroke width
      if (this._penPressureEnabled && e.pressure > 0 && e.pressure < 1 && e.pointerType === "pen") {
        this._penLastPressure = e.pressure;
        const strokeInfo = this.engine.get_stroke_info(BigInt(this._penPathId));
        const baseWidth = strokeInfo ? (JSON.parse(strokeInfo).width || 2) : 2;
        const pointIdx = this.engine.path_point_count(this._penPathId) - 1;
        // Map pressure (0–1) to width: minFactor 0.1, maxFactor 2.0
        const width = baseWidth * (0.1 + e.pressure * 1.9);
        this.engine.path_set_point_stroke_width(BigInt(this._penPathId), pointIdx, width);
      }

      this._penDragging = true;
      this._penDragStartX = sx;
      this._penDragStartY = sy;
      this.needsRender = true;
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }

    if (this.currentTool === "freehand") {
      const sx = this.engine.screen_to_scene_x(x, y);
      const sy = this.engine.screen_to_scene_y(x, y);
      this.engine.push_undo();
      const pathId = Number(this.engine.add_path(sx, sy));
      this.engine.path_add_point(pathId, sx, sy);
      this._freehandPathId = pathId;
      this._freehandPoints = [{ x: sx, y: sy }];
      this._freehandDrawing = true;
      // Set stroke for freehand drawing
      this.engine.set_stroke(pathId, 255, 255, 255, 1.0, 2.0);
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }

    if (this.currentTool === "connector") {
      const sx = this.engine.screen_to_scene_x(x, y);
      const sy = this.engine.screen_to_scene_y(x, y);
      // Hit test for start node
      const hit = this.engine.hit_test(x, y);
      const startNodeId = hit != null ? Number(hit) : 0;
      this._connectorDrag = { startNodeId, sx, sy };
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }

    if (["rect", "ellipse", "text", "frame", "section", "image", "slice"].includes(this.currentTool)) {
      const sx = this.engine.screen_to_scene_x(x, y);
      const sy = this.engine.screen_to_scene_y(x, y);
      this.drag = { startX: sx, startY: sy, currentX: sx, currentY: sy };
      this.canvas.setPointerCapture(e.pointerId);
    }
  }

  private onPointerMove(e: PointerEvent) {
    this._lastPointerScreenX = e.offsetX;
    this._lastPointerScreenY = e.offsetY;
    if (this.isPanning) {
      const dx = e.clientX - this.lastPanX;
      const dy = e.clientY - this.lastPanY;
      this.engine.pan(dx, dy);
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      this.needsRender = true;
      return;
    }

    // Spacing handle dragging
    if (this._spacingDragging) {
      const zoom = this.engine.get_zoom();
      const delta = this._spacingDragging.direction === "row"
        ? (e.offsetX - this._spacingDragStartX) / zoom
        : (e.offsetY - this._spacingDragStartY) / zoom;
      const newGap = Math.max(0, Math.round(this._spacingDragStartGap + delta));

      if (this._spacingDragging.mode === "selection") {
        // Smart spacing: distribute all selected nodes with uniform spacing
        const axis = this._spacingDragging.axis || (this._spacingDragging.direction === "row" ? "horizontal" : "vertical");
        this.engine.distribute_selection_with_spacing(axis, newGap);
      } else {
        // Auto-layout: adjust frame gap
        this.engine.set_layout_gap(BigInt(this._spacingDragging.parentId), newGap);
        this.engine.compute_layout();
      }
      this._spacingHandles = findSpacingHandles(this.engine);
      this.needsRender = true;
      return;
    }

    // Spacing handle hover
    if (this.currentTool === "select" && this._spacingHandles.length > 0 && !this.engine.is_dragging()) {
      const prev = this._spacingHovered;
      this._spacingHovered = hitTestSpacingHandle(this._spacingHandles, e.offsetX, e.offsetY);
      if (this._spacingHovered) {
        this.canvas.style.cursor = this._spacingHovered.direction === "row" ? "col-resize" : "row-resize";
        if (prev !== this._spacingHovered) this.needsRender = true;
      } else if (prev) {
        this.needsRender = true;
      }
    }

    // Gradient handle dragging
    if (this._gradientEditor) {
      const zoom = this.engine.get_zoom();
      const panX = this.engine.get_pan_x();
      const panY = this.engine.get_pan_y();
      if (this._gradientEditor.onPointerMove(e.offsetX, e.offsetY, zoom, panX, panY)) {
        return;
      }
      // Update cursor for gradient handles
      const gc = this._gradientEditor.getCursor(e.offsetX, e.offsetY, zoom, panX, panY);
      if (gc && this.currentTool === "select") {
        this.canvas.style.cursor = gc;
      }
    }

    // VN edit mode vertex dragging
    if (this._vnEditMode && this._vnDraggingVertex != null && this._vnEditNodeId != null) {
      let sx = this.engine.screen_to_scene_x(e.offsetX, e.offsetY);
      let sy = this.engine.screen_to_scene_y(e.offsetX, e.offsetY);
      // Point snapping
      const targets = this._collectPointSnapTargets(this._vnEditNodeId, -1);
      const threshold = SNAP_THRESHOLD_PX / this.engine.get_zoom();
      const snap = computePointSnap(sx, sy, targets, threshold, e.shiftKey);
      sx = snap.x; sy = snap.y;
      this._pointSnapIndicators = snap.indicators;
      this.engine.vn_update_vertex(BigInt(this._vnEditNodeId), BigInt(this._vnDraggingVertex), sx, sy);
      this.needsRender = true;
      return;
    }

    // VN edit mode handle dragging
    if (this._vnEditMode && this._vnDraggingHandle != null && this._vnEditNodeId != null) {
      const sx = this.engine.screen_to_scene_x(e.offsetX, e.offsetY);
      const sy = this.engine.screen_to_scene_y(e.offsetX, e.offsetY);
      const vn = this.getVNData();
      if (vn) {
        const seg = vn.segments?.find((s: any) => s.id === this._vnDraggingHandle!.segId);
        if (seg) {
          let hs = seg.handle_start ? [seg.handle_start[0], seg.handle_start[1]] : [0, 0];
          let he = seg.handle_end ? [seg.handle_end[0], seg.handle_end[1]] : [0, 0];
          if (this._vnDraggingHandle.which === "start") {
            hs = [sx, sy];
            // If no handle existed, initialize end handle too
            if (!seg.handle_end) {
              const ev = vn.vertices?.find((v: any) => v.id === seg.end_vertex_id);
              if (ev) he = [ev.x, ev.y];
            }
          } else {
            he = [sx, sy];
            if (!seg.handle_start) {
              const sv = vn.vertices?.find((v: any) => v.id === seg.start_vertex_id);
              if (sv) hs = [sv.x, sv.y];
            }
          }
          this.engine.vn_update_segment_handles(BigInt(this._vnEditNodeId), BigInt(this._vnDraggingHandle.segId), hs[0], hs[1], he[0], he[1]);
          this.needsRender = true;
        }
      }
      return;
    }

    // VN edit mode: hover segment highlight + connection preview
    if (this._vnEditMode && this._vnEditNodeId != null && !this.engine.is_dragging()) {
      const sx = this.engine.screen_to_scene_x(e.offsetX, e.offsetY);
      const sy = this.engine.screen_to_scene_y(e.offsetX, e.offsetY);
      const zoom = this.engine.get_zoom();
      // Connection preview
      if (this._vnSelectedVertex != null && !(e.buttons & 1)) {
        this._vnConnectPreview = { x: e.offsetX, y: e.offsetY };
        this.needsRender = true;
      } else {
        this._vnConnectPreview = null;
      }
      // Segment hover
      try {
        const segHit = JSON.parse(this.engine.vn_hit_test_segment(BigInt(this._vnEditNodeId), sx, sy, 6 / zoom));
        const prev = this._vnHoverSegment;
        if (segHit.segment_id != null) {
          this._vnHoverSegment = { id: segHit.segment_id, t: segHit.t };
        } else {
          this._vnHoverSegment = null;
        }
        if ((prev?.id ?? null) !== (this._vnHoverSegment?.id ?? null)) this.needsRender = true;
      } catch {
        this._vnHoverSegment = null;
      }
    }

    // Mesh edit mode dragging
    if (this._meshEditMode && this._meshEditDragging && this._meshEditNodeId != null && this._meshEditSelectedPoint != null) {
      const nodeJson = this.engine.get_node_json(BigInt(this._meshEditNodeId));
      if (nodeJson) {
        const node = JSON.parse(nodeJson);
        const sx = this.engine.screen_to_scene_x(e.offsetX, e.offsetY);
        const sy = this.engine.screen_to_scene_y(e.offsetX, e.offsetY);
        const nx = ((sx - node.x) / node.width);
        const ny = ((sy - node.y) / node.height);
        this.engine.mesh_set_point_position(BigInt(this._meshEditNodeId), this._meshEditFillIndex, this._meshEditSelectedPoint, nx, ny);
        this.needsRender = true;
      }
    }

    // Path edit mode dragging
    if (this._pathEditMode && this._pathEditDragType && this._pathEditNodeId != null && this._pathEditSelectedPoint != null) {
      let sx = this.engine.screen_to_scene_x(e.offsetX, e.offsetY);
      let sy = this.engine.screen_to_scene_y(e.offsetX, e.offsetY);
      const idx = this._pathEditSelectedPoint;
      const nodeId = this._pathEditNodeId;

      if (this._pathEditDragType === 'anchor') {
        // Point snapping for anchor drag
        const targets = this._collectPointSnapTargets(nodeId, idx);
        const threshold = SNAP_THRESHOLD_PX / this.engine.get_zoom();
        const snap = computePointSnap(sx, sy, targets, threshold, e.shiftKey);
        sx = snap.x; sy = snap.y;
        this._pointSnapIndicators = snap.indicators;
        this.engine.path_set_point(nodeId, idx, sx, sy);
        // Move handles along with anchor
        if (this._pathEditHandleOffsets) {
          const o = this._pathEditHandleOffsets;
          this.engine.path_set_handle_in(nodeId, idx, sx + o.hix, sy + o.hiy);
          this.engine.path_set_handle_out(nodeId, idx, sx + o.hox, sy + o.hoy);
        }
      } else if (this._pathEditDragType === 'handle_in') {
        // Angle constraint for handle (Shift)
        if (e.shiftKey) {
          const points = this.getPathPoints();
          if (points) {
            const p = points[idx];
            const c = constrainAngle(p.x, p.y, sx, sy);
            sx = c.x; sy = c.y;
            this._pointSnapIndicators = [{ x: sx, y: sy, kind: 'angle' }];
          }
        } else {
          this._pointSnapIndicators = [];
        }
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
        // Angle constraint for handle (Shift)
        if (e.shiftKey) {
          const points = this.getPathPoints();
          if (points) {
            const p = points[idx];
            const c = constrainAngle(p.x, p.y, sx, sy);
            sx = c.x; sy = c.y;
            this._pointSnapIndicators = [{ x: sx, y: sy, kind: 'angle' }];
          }
        } else {
          this._pointSnapIndicators = [];
        }
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
        // Update pressure on current point while dragging
        if (this._penPressureEnabled && e.pressure > 0 && e.pressure < 1 && e.pointerType === "pen") {
          this._penLastPressure = e.pressure;
          const strokeInfo = this.engine.get_stroke_info(BigInt(this._penPathId));
          const baseWidth = strokeInfo ? (JSON.parse(strokeInfo).width || 2) : 2;
          const width = baseWidth * (0.1 + e.pressure * 1.9);
          this.engine.path_set_point_stroke_width(BigInt(this._penPathId), pointCount - 1, width);
        }
      }
      this.needsRender = true;
      return;
    }

    // Freehand tool: add points during drag
    if (this._freehandDrawing && this._freehandPathId != null) {
      const sx = this.engine.screen_to_scene_x(e.offsetX, e.offsetY);
      const sy = this.engine.screen_to_scene_y(e.offsetX, e.offsetY);
      const last = this._freehandPoints[this._freehandPoints.length - 1];
      const dist = Math.hypot(sx - last.x, sy - last.y);
      // Only add points with minimum distance (prevents too many points)
      if (dist > 2) {
        this._freehandPoints.push({ x: sx, y: sy });
        this.engine.path_add_point(this._freehandPathId, sx, sy);
        this.needsRender = true;
      }
      return;
    }

    // Connector tool: update preview during drag
    if (this._connectorDrag) {
      this._connectorDrag.ex = this.engine.screen_to_scene_x(e.offsetX, e.offsetY);
      this._connectorDrag.ey = this.engine.screen_to_scene_y(e.offsetX, e.offsetY);
      // Hit test for end node highlight
      const hit = this.engine.hit_test(e.offsetX, e.offsetY);
      this._connectorDrag.endNodeId = hit != null ? Number(hit) : 0;
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

    // Measure tool: Alt + hover with selection, or auto in Dev Mode
    if (this._altHeld || e.altKey || this._devMode) {
      this.updateMeasure(e.offsetX, e.offsetY);
      // Dev Mode: show CSS tooltip on hover with delay
      if (this._devMode) {
        const hitBigInt = this.engine.hit_test(e.offsetX, e.offsetY);
        const hitId = hitBigInt != null ? Number(hitBigInt) : 0;
        if (hitId && hitId !== this._devHoverNodeId) {
          this._devHoverNodeId = hitId;
          if (this._devHoverTimer) clearTimeout(this._devHoverTimer);
          this._devModeOverlay.hide();
          this._devHoverTimer = setTimeout(() => {
            if (this._devHoverNodeId === hitId) {
              this._devModeOverlay.show(hitId, e.offsetX, e.offsetY);
            }
          }, 400);
        } else if (!hitId) {
          this._devHoverNodeId = null;
          if (this._devHoverTimer) { clearTimeout(this._devHoverTimer); this._devHoverTimer = null; }
          this._devModeOverlay.hide();
        }
      }
    } else if (this._measureLines.length > 0) {
      this._measureLines = [];
      this._measureTargetBounds = null;
      this.needsRender = true;
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
        // Update connector bounds for all moved nodes
        for (const id of sel) {
          const connectors = this.engine.get_connectors_for_node(BigInt(id));
          for (let i = 0; i < connectors.length; i++) {
            this.engine.update_connector_bounds(connectors[i]!);
          }
        }
      }
      this.needsRender = true;
      // Throttle selection updates during drag
      this.fireSelectionThrottled(Array.from(this.engine.get_selection()).map(Number));
      return;
    }

    if (["rect", "ellipse", "text", "frame", "section", "image", "slice"].includes(this.currentTool)) {
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

    // Spacing handle release
    if (this._spacingDragging) {
      this._spacingDragging = null;
      this._spacingHandles = findSpacingHandles(this.engine);
      this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
      this.needsRender = true;
      return;
    }

    // Gradient handle release
    if (this._gradientEditor?.onPointerUp()) {
      return;
    }

    if (this._vnDraggingVertex != null) {
      this._vnDraggingVertex = null;
      this.needsRender = true;
      this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
      return;
    }

    if (this._vnDraggingHandle != null) {
      this._vnDraggingHandle = null;
      this.needsRender = true;
      return;
    }

    if (this._meshEditDragging) {
      this._meshEditDragging = false;
      this.needsRender = true;
      this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
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

    // Freehand: finish drawing
    if (this._freehandDrawing && this._freehandPathId != null) {
      const pts = this._freehandPoints;
      if (pts.length < 2) {
        // Too short, remove the path
        this.engine.remove_node(this._freehandPathId);
      } else {
        // Smooth the path by converting raw points to bezier curves
        this._smoothFreehandPath(this._freehandPathId, pts);
        this.engine.select(this._freehandPathId);
        this.fireSelectionNow([this._freehandPathId]);
        this.onLayersChanges.forEach(fn => fn());
      }
      this._freehandPathId = null;
      this._freehandPoints = [];
      this._freehandDrawing = false;
      this.needsRender = true;
      return;
    }

    if (this._connectorDrag) {
      const cd = this._connectorDrag;
      const ex = cd.ex ?? cd.sx;
      const ey = cd.ey ?? cd.sy;
      const dist = Math.hypot(ex - cd.sx, ey - cd.sy);
      if (dist > 5) {
        this.engine.push_undo();
        const endNodeId = cd.endNodeId ?? 0;
        // Don't connect to same node
        const startId = cd.startNodeId;
        const endId = endNodeId !== startId ? endNodeId : 0;
        const id = Number(this.engine.add_connector(cd.sx, cd.sy, ex, ey, BigInt(startId), BigInt(endId)));
        if (id > 0) {
          this.engine.select(id);
          this.fireSelectionNow([id]);
          this.onLayersChanges.forEach(fn => fn());
        }
      }
      this._connectorDrag = null;
      this.setTool("select");
      this.needsRender = true;
      return;
    }

    if (this.marquee) {
      this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
      this.marquee = null;
      this.needsRender = true;
      return;
    }

    if (this._connectorDrag) {
      const ex = this.engine.screen_to_scene_x(_e.offsetX, _e.offsetY);
      const ey = this.engine.screen_to_scene_y(_e.offsetX, _e.offsetY);
      const hit = this.engine.hit_test(_e.offsetX, _e.offsetY);
      const endNodeId = hit != null ? Number(hit) : 0;
      const { startNodeId, sx, sy } = this._connectorDrag;
      // Only create if dragged a reasonable distance or connected to different nodes
      const dist = Math.hypot(ex - sx, ey - sy);
      if (dist > 5 / this.engine.get_zoom() || (startNodeId !== 0 && endNodeId !== 0 && startNodeId !== endNodeId)) {
        this.engine.push_undo();
        const id = Number(this.engine.add_connector(sx, sy, ex, ey, startNodeId, endNodeId));
        if (id > 0) {
          this.engine.select(id);
          this.fireSelectionNow([id]);
          this.onLayersChanges.forEach(fn => fn());
        }
      }
      this._connectorDrag = null;
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
          case "slice": id = this.engine.add_slice("", x, y, w, h); break;
          case "sticky": id = this.engine.add_sticky_note(x, y, Math.max(w, 150), Math.max(h, 150), "", "yellow"); break;
          case "table": id = this.engine.add_table(x, y, 3, 3, Math.max(w / 3, 80), Math.max(h / 3, 32)); break;
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
    this._pointSnapIndicators = [];
    this.drag = null;
  }

  fireSelectionNow(ids: number[]) {
    if (this.selectionThrottleId) {
      cancelAnimationFrame(this.selectionThrottleId);
      this.selectionThrottleId = 0;
    }
    this._gradientEditor?.updateFromSelection();
    this._spacingHandles = findSpacingHandles(this.engine);
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

  // === Vector Network Edit Mode ===

  private enterVNEditMode(nodeId: number) {
    this._vnEditMode = true;
    this._vnEditNodeId = nodeId;
    this._vnSelectedVertex = null;
    this._vnDraggingVertex = null;
    this._vnConnectStart = null;
    this._vnSelectedSegment = null;
    this._vnHoverSegment = null;
    this._vnDraggingHandle = null;
    this._vnConnectPreview = null;
    this.engine.select(BigInt(nodeId));
    this.canvas.style.cursor = "crosshair";
    this.needsRender = true;
  }

  private exitVNEditMode() {
    this._vnEditMode = false;
    this._vnEditNodeId = null;
    this._vnSelectedVertex = null;
    this._vnDraggingVertex = null;
    this._vnConnectStart = null;
    this._vnSelectedSegment = null;
    this._vnHoverSegment = null;
    this._vnDraggingHandle = null;
    this._vnConnectPreview = null;
    this.updateCursor();
    this.needsRender = true;
  }

  private getVNData(): any | null {
    if (this._vnEditNodeId == null) return null;
    try {
      const data = this.engine.vn_get_data(BigInt(this._vnEditNodeId));
      return data ? JSON.parse(data) : null;
    } catch { return null; }
  }

  private vnHitTestVertex(screenX: number, screenY: number): number | null {
    const vn = this.getVNData();
    if (!vn || !vn.vertices) return null;
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    const threshold = 8;
    for (const v of vn.vertices) {
      const sx = v.x * zoom + panX;
      const sy = v.y * zoom + panY;
      if (Math.abs(screenX - sx) < threshold && Math.abs(screenY - sy) < threshold) {
        return v.id;
      }
    }
    return null;
  }

  private vnHitTestHandle(screenX: number, screenY: number): { segId: number; which: "start" | "end" } | null {
    const vn = this.getVNData();
    if (!vn || !vn.segments) return null;
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    const threshold = 6;
    for (const seg of vn.segments) {
      if (seg.handle_start) {
        const hx = seg.handle_start[0] * zoom + panX;
        const hy = seg.handle_start[1] * zoom + panY;
        if (Math.abs(screenX - hx) < threshold && Math.abs(screenY - hy) < threshold) {
          return { segId: seg.id, which: "start" };
        }
      }
      if (seg.handle_end) {
        const hx = seg.handle_end[0] * zoom + panX;
        const hy = seg.handle_end[1] * zoom + panY;
        if (Math.abs(screenX - hx) < threshold && Math.abs(screenY - hy) < threshold) {
          return { segId: seg.id, which: "end" };
        }
      }
    }
    return null;
  }

  private renderVNEditOverlay() {
    if (!this._vnEditMode || this._vnEditNodeId == null) return;
    const vn = this.getVNData();
    if (!vn) return;
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();

    this.ctx.save();

    // Draw segments
    if (vn.segments) {
      for (const seg of vn.segments) {
        const sv = vn.vertices?.find((v: any) => v.id === seg.start_vertex_id);
        const ev = vn.vertices?.find((v: any) => v.id === seg.end_vertex_id);
        if (!sv || !ev) continue;
        this.ctx.beginPath();
        this.ctx.moveTo(sv.x * zoom + panX, sv.y * zoom + panY);
        if (seg.handle_start && seg.handle_end) {
          this.ctx.bezierCurveTo(
            seg.handle_start[0] * zoom + panX, seg.handle_start[1] * zoom + panY,
            seg.handle_end[0] * zoom + panX, seg.handle_end[1] * zoom + panY,
            ev.x * zoom + panX, ev.y * zoom + panY
          );
        } else if (seg.handle_start || seg.handle_end) {
          const h = seg.handle_start || seg.handle_end;
          this.ctx.quadraticCurveTo(h[0] * zoom + panX, h[1] * zoom + panY, ev.x * zoom + panX, ev.y * zoom + panY);
        } else {
          this.ctx.lineTo(ev.x * zoom + panX, ev.y * zoom + panY);
        }
        const isSelected = seg.id === this._vnSelectedSegment;
        const isHovered = seg.id === this._vnHoverSegment?.id;
        this.ctx.strokeStyle = isSelected ? "#3b82f6" : isHovered ? "rgba(59, 130, 246, 0.8)" : "rgba(59, 130, 246, 0.4)";
        this.ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1;
        this.ctx.stroke();

        // Draw bezier handles
        if (seg.handle_start) {
          const hx = seg.handle_start[0] * zoom + panX;
          const hy = seg.handle_start[1] * zoom + panY;
          // Handle line
          this.ctx.beginPath();
          this.ctx.moveTo(sv.x * zoom + panX, sv.y * zoom + panY);
          this.ctx.lineTo(hx, hy);
          this.ctx.strokeStyle = "rgba(59, 130, 246, 0.4)";
          this.ctx.lineWidth = 1;
          this.ctx.stroke();
          // Handle dot
          this.ctx.beginPath();
          this.ctx.arc(hx, hy, 3, 0, Math.PI * 2);
          this.ctx.fillStyle = "#3b82f6";
          this.ctx.fill();
        }
        if (seg.handle_end) {
          const hx = seg.handle_end[0] * zoom + panX;
          const hy = seg.handle_end[1] * zoom + panY;
          this.ctx.beginPath();
          this.ctx.moveTo(ev.x * zoom + panX, ev.y * zoom + panY);
          this.ctx.lineTo(hx, hy);
          this.ctx.strokeStyle = "rgba(59, 130, 246, 0.4)";
          this.ctx.lineWidth = 1;
          this.ctx.stroke();
          this.ctx.beginPath();
          this.ctx.arc(hx, hy, 3, 0, Math.PI * 2);
          this.ctx.fillStyle = "#3b82f6";
          this.ctx.fill();
        }
      }
    }

    // Draw vertices
    if (vn.vertices) {
      for (const v of vn.vertices) {
        const sx = v.x * zoom + panX;
        const sy = v.y * zoom + panY;
        const isSelected = v.id === this._vnSelectedVertex;
        const s = 4;
        this.ctx.fillStyle = isSelected ? "#3b82f6" : "#ffffff";
        this.ctx.strokeStyle = "#3b82f6";
        this.ctx.lineWidth = 1.5;
        this.ctx.fillRect(sx - s, sy - s, s * 2, s * 2);
        this.ctx.strokeRect(sx - s, sy - s, s * 2, s * 2);
      }
    }

    // Connection preview line (from selected vertex to mouse)
    if (this._vnSelectedVertex != null && this._vnConnectPreview && this._vnDraggingVertex == null) {
      const sv = vn.vertices?.find((v: any) => v.id === this._vnSelectedVertex);
      if (sv) {
        this.ctx.beginPath();
        this.ctx.moveTo(sv.x * zoom + panX, sv.y * zoom + panY);
        this.ctx.lineTo(this._vnConnectPreview.x, this._vnConnectPreview.y);
        this.ctx.strokeStyle = "rgba(59, 130, 246, 0.3)";
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([4, 4]);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
      }
    }

    this.ctx.restore();
  }

  // === Mesh Edit Mode ===

  private enterMeshEditMode(nodeId: number, fillIndex: number) {
    this._meshEditMode = true;
    this._meshEditNodeId = nodeId;
    this._meshEditFillIndex = fillIndex;
    this._meshEditSelectedPoint = null;
    this._meshEditDragging = false;
    this.engine.select(BigInt(nodeId));
    this.canvas.style.cursor = "crosshair";
    this.needsRender = true;
  }

  private exitMeshEditMode() {
    this._meshEditMode = false;
    this._meshEditNodeId = null;
    this._meshEditSelectedPoint = null;
    this._meshEditDragging = false;
    this.updateCursor();
    this.needsRender = true;
  }

  private getMeshInfo(): { rows: number; cols: number; points: { index: number; x: number; y: number; r: number; g: number; b: number; a: number }[] } | null {
    if (this._meshEditNodeId == null) return null;
    try {
      const info = this.engine.mesh_get_info(BigInt(this._meshEditNodeId), this._meshEditFillIndex);
      if (!info || info === "null") return null;
      return JSON.parse(info);
    } catch { return null; }
  }

  private renderMeshEditOverlay() {
    if (!this._meshEditMode || this._meshEditNodeId == null) return;
    const mesh = this.getMeshInfo();
    if (!mesh) return;
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    const nodeJson = this.engine.get_node_json(BigInt(this._meshEditNodeId));
    if (!nodeJson) return;
    const node = JSON.parse(nodeJson);

    const toScreen = (nx: number, ny: number) => ({
      x: (node.x + nx * node.width) * zoom + panX,
      y: (node.y + ny * node.height) * zoom + panY,
    });

    this.ctx.save();

    // Draw grid lines
    this.ctx.strokeStyle = "rgba(255,255,255,0.3)";
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([4, 4]);

    for (let r = 0; r < mesh.rows; r++) {
      for (let c = 0; c < mesh.cols - 1; c++) {
        const p1 = mesh.points[r * mesh.cols + c];
        const p2 = mesh.points[r * mesh.cols + c + 1];
        if (!p1 || !p2) continue;
        const s1 = toScreen(p1.x, p1.y);
        const s2 = toScreen(p2.x, p2.y);
        this.ctx.beginPath();
        this.ctx.moveTo(s1.x, s1.y);
        this.ctx.lineTo(s2.x, s2.y);
        this.ctx.stroke();
      }
    }
    for (let c = 0; c < mesh.cols; c++) {
      for (let r = 0; r < mesh.rows - 1; r++) {
        const p1 = mesh.points[r * mesh.cols + c];
        const p2 = mesh.points[(r + 1) * mesh.cols + c];
        if (!p1 || !p2) continue;
        const s1 = toScreen(p1.x, p1.y);
        const s2 = toScreen(p2.x, p2.y);
        this.ctx.beginPath();
        this.ctx.moveTo(s1.x, s1.y);
        this.ctx.lineTo(s2.x, s2.y);
        this.ctx.stroke();
      }
    }
    this.ctx.setLineDash([]);

    // Draw point handles
    for (const pt of mesh.points) {
      const s = toScreen(pt.x, pt.y);
      const isSelected = pt.index === this._meshEditSelectedPoint;
      const radius = isSelected ? 7 : 5;

      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(${pt.r},${pt.g},${pt.b},${pt.a})`;
      this.ctx.fill();
      this.ctx.strokeStyle = isSelected ? "#4f46e5" : "white";
      this.ctx.lineWidth = isSelected ? 2.5 : 1.5;
      this.ctx.stroke();
    }

    // Label
    this.ctx.fillStyle = "rgba(255,255,255,0.6)";
    this.ctx.font = "11px Inter, system-ui, sans-serif";
    this.ctx.fillText(`Mesh Edit (${mesh.rows}\u00d7${mesh.cols}) \u2014 Esc to exit, click point to select, drag to move`, 10, this.canvas.height - 10);

    this.ctx.restore();
  }

  private openMeshPointColorPicker(ptIdx: number, screenX: number, screenY: number) {
    if (this._meshEditNodeId == null) return;
    const mesh = this.getMeshInfo();
    if (!mesh) return;
    const pt = mesh.points.find((p: any) => p.index === ptIdx);
    if (!pt) return;

    // Remove existing picker
    document.querySelector('.mesh-color-picker')?.remove();

    const picker = document.createElement('input');
    picker.type = 'color';
    picker.className = 'mesh-color-picker';
    picker.value = `#${pt.r.toString(16).padStart(2, '0')}${pt.g.toString(16).padStart(2, '0')}${pt.b.toString(16).padStart(2, '0')}`;
    picker.style.cssText = `position:fixed;left:${screenX}px;top:${screenY}px;width:0;height:0;opacity:0;pointer-events:auto;`;
    document.body.appendChild(picker);
    const nodeId = this._meshEditNodeId;
    const fillIdx = this._meshEditFillIndex;
    picker.addEventListener('input', () => {
      const hex = picker.value;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      this.engine.push_undo();
      this.engine.mesh_set_point_color(BigInt(nodeId), fillIdx, ptIdx, r, g, b, 1.0);
      this.needsRender = true;
    });
    picker.addEventListener('change', () => {
      picker.remove();
    });
    picker.click();
  }

  private meshHitTestPoint(screenX: number, screenY: number): number | null {
    if (this._meshEditNodeId == null) return null;
    const mesh = this.getMeshInfo();
    if (!mesh) return null;
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    const nodeJson = this.engine.get_node_json(BigInt(this._meshEditNodeId));
    if (!nodeJson) return null;
    const node = JSON.parse(nodeJson);

    const threshold = 10;
    for (const pt of mesh.points) {
      const sx = (node.x + pt.x * node.width) * zoom + panX;
      const sy = (node.y + pt.y * node.height) * zoom + panY;
      const dx = screenX - sx;
      const dy = screenY - sy;
      if (dx * dx + dy * dy < threshold * threshold) {
        return pt.index;
      }
    }
    return null;
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
    // Double-click on a segment in VN edit mode → split it
    if (this._vnEditMode && this._vnEditNodeId != null) {
      const sx = this.engine.screen_to_scene_x(e.offsetX, e.offsetY);
      const sy = this.engine.screen_to_scene_y(e.offsetX, e.offsetY);
      const zoom = this.engine.get_zoom();
      try {
        const segHit = JSON.parse(this.engine.vn_hit_test_segment(BigInt(this._vnEditNodeId), sx, sy, 8 / zoom));
        if (segHit.segment_id != null) {
          this.engine.push_undo();
          const result = JSON.parse(this.engine.vn_split_segment(BigInt(this._vnEditNodeId), BigInt(segHit.segment_id), segHit.t));
          if (result.vertex_id != null) {
            this._vnSelectedVertex = result.vertex_id;
            this._vnSelectedSegment = null;
          }
          this.needsRender = true;
          this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
          return;
        }
      } catch {}
    }

    const hit = this.engine.hit_test(e.offsetX, e.offsetY);
    if (hit == null) return;

    const nodeJson = this.engine.get_node_json(hit);
    if (!nodeJson) return;
    const node = JSON.parse(nodeJson);

    // Mesh gradient fill → enter mesh edit mode
    {
      const fillsJson = this.engine.get_fills(hit);
      if (fillsJson && fillsJson !== "[]") {
        try {
          const fills = JSON.parse(fillsJson);
          const meshFillIdx = fills.findIndex((f: any) => f.type === "GradientMesh");
          if (meshFillIdx >= 0) {
            this.enterMeshEditMode(Number(hit), meshFillIdx);
            return;
          }
        } catch {}
      }
    }

    // Path node → enter path edit mode
    if (typeof node.kind === "object" && node.kind.Path) {
      this.enterPathEditMode(Number(hit));
      return;
    }

    // VectorNetwork node → enter vector network edit mode
    if (typeof node.kind === "object" && node.kind.VectorNetwork) {
      this.enterVNEditMode(Number(hit));
      return;
    }

    // Sticky note → edit text content inline
    if (typeof node.kind === "object" && node.kind.StickyNote) {
      this.startStickyEdit(hit, node);
      return;
    }

    if (typeof node.kind !== "object" || !node.kind.Text) return;

    // Start inline text editing
    this.startTextEdit(hit, node);
  }

  private _smoothFreehandPath(pathId: number, pts: { x: number; y: number }[]) {
    // Downsample points for smoothing (keep every Nth point based on total count)
    const maxPoints = 100;
    let sampled = pts;
    if (pts.length > maxPoints) {
      const step = pts.length / maxPoints;
      sampled = [];
      for (let i = 0; i < maxPoints - 1; i++) {
        sampled.push(pts[Math.round(i * step)]);
      }
      sampled.push(pts[pts.length - 1]);
    }

    // Remove all existing points and rebuild with bezier handles
    const count = this.engine.path_point_count(pathId);
    for (let i = count - 1; i >= 0; i--) {
      this.engine.path_remove_point(pathId, i);
    }

    // Add smoothed points with Catmull-Rom → Bezier conversion
    for (let i = 0; i < sampled.length; i++) {
      const p = sampled[i];
      if (sampled.length < 3 || i === 0 || i === sampled.length - 1) {
        this.engine.path_add_point(pathId, p.x, p.y);
      } else {
        const prev = sampled[i - 1];
        const next = sampled[i + 1];
        const tension = 0.3;
        const hix = p.x - (next.x - prev.x) * tension;
        const hiy = p.y - (next.y - prev.y) * tension;
        const hox = p.x + (next.x - prev.x) * tension;
        const hoy = p.y + (next.y - prev.y) * tension;
        this.engine.path_add_curve_point(pathId, p.x, p.y, hix, hiy, hox, hoy);
      }
    }
    // Rename the node
    this.engine.set_name(pathId, `Freehand ${pathId}`);
  }

  private startStickyEdit(nodeId: bigint | number, node: any) {
    const id = BigInt(nodeId);
    const stickyInfo = node.kind.StickyNote;
    const content = stickyInfo.content || "";

    // Create an overlay textarea for editing
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    const sx = node.x * zoom + panX;
    const sy = node.y * zoom + panY;
    const sw = node.width * zoom;
    const sh = node.height * zoom;
    const fontSize = (stickyInfo.font_size || 16) * zoom;

    const themes: Record<string, string> = {
      yellow: "#FFF9C4", blue: "#BBDEFB", pink: "#F8BBD0",
      green: "#C8E6C9", orange: "#FFE0B2", purple: "#E1BEE7", gray: "#E0E0E0",
    };
    const bg = themes[stickyInfo.theme] || themes.yellow;

    const textarea = document.createElement("textarea");
    textarea.value = content;
    textarea.style.cssText = `position:fixed;left:${sx + 8 * zoom}px;top:${sy + 8 * zoom}px;width:${sw - 16 * zoom}px;height:${sh - 16 * zoom}px;background:${bg};color:#333;border:none;outline:none;resize:none;font-size:${fontSize}px;font-family:Inter,sans-serif;padding:4px;border-radius:4px;z-index:9999;`;
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const finish = () => {
      this.engine.push_undo();
      this.engine.set_sticky_content(id, textarea.value);
      textarea.remove();
      this.requestRender();
    };

    textarea.addEventListener("blur", finish);
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { textarea.removeEventListener("blur", finish); textarea.remove(); }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { textarea.removeEventListener("blur", finish); finish(); }
    });
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

  private updateMeasure(screenX: number, screenY: number) {
    const sel = Array.from(this.engine.get_selection()).map(Number);
    if (sel.length === 0) {
      this._measureLines = [];
      this._measureTargetBounds = null;
      return;
    }

    const selBBox = this.getSelectionBBox(sel);
    if (!selBBox) { this._measureLines = []; this._measureTargetBounds = null; return; }

    // Hit test to find hovered node
    const hitBigInt = this.engine.hit_test(screenX, screenY);
    const hitId = hitBigInt != null ? Number(hitBigInt) : 0;
    const selSet = new Set(sel);

    if (hitId && !selSet.has(hitId)) {
      // Measure to hovered node
      const nj = this.engine.get_node_json(BigInt(hitId));
      if (nj) {
        const n = JSON.parse(nj);
        const targetBounds = { x: n.x, y: n.y, w: n.width, h: n.height };
        const zoom = this.engine.get_zoom();
        const panX = this.engine.get_pan_x();
        const panY = this.engine.get_pan_y();
        this._measureLines = computeMeasureLines(selBBox, targetBounds, zoom, panX, panY);
        this._measureTargetBounds = targetBounds;
        this.needsRender = true;
        return;
      }
    }

    // No target — clear
    this._measureLines = [];
    this._measureTargetBounds = null;
    this.needsRender = true;
  }

  private renderMeasure() {
    if (this._measureTargetBounds) {
      const zoom = this.engine.get_zoom();
      const panX = this.engine.get_pan_x();
      const panY = this.engine.get_pan_y();
      renderTargetHighlight(this.ctx, this._measureTargetBounds, zoom, panX, panY);
    }
    renderMeasureLines(this.ctx, this._measureLines);
  }

  private renderSmartGuides() {
    if (this._snapGuides.length === 0) return;
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    renderGuides(this.ctx, this._snapGuides, zoom, panX, panY);
  }

  private renderPointSnap() {
    if (this._pointSnapIndicators.length === 0) return;
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    renderPointSnapIndicators(this.ctx, this._pointSnapIndicators, zoom, panX, panY);
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

  private renderConnectorPreview() {
    if (!this._connectorDrag || this._connectorDrag.ex == null) return;
    const cd = this._connectorDrag;
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    // Convert scene to screen
    const sx = cd.sx * zoom + panX;
    const sy = cd.sy * zoom + panY;
    const ex = (cd.ex ?? cd.sx) * zoom + panX;
    const ey = (cd.ey ?? cd.sy) * zoom + panY;

    this.ctx.save();
    this.ctx.strokeStyle = "rgba(59, 130, 246, 0.8)";
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([6, 4]);
    this.ctx.beginPath();
    this.ctx.moveTo(sx, sy);
    this.ctx.lineTo(ex, ey);
    this.ctx.stroke();

    // Arrowhead preview
    const angle = Math.atan2(ey - sy, ex - sx);
    const size = 10;
    this.ctx.setLineDash([]);
    this.ctx.beginPath();
    this.ctx.moveTo(ex - size * Math.cos(angle - Math.PI / 6), ey - size * Math.sin(angle - Math.PI / 6));
    this.ctx.lineTo(ex, ey);
    this.ctx.lineTo(ex - size * Math.cos(angle + Math.PI / 6), ey - size * Math.sin(angle + Math.PI / 6));
    this.ctx.fillStyle = "rgba(59, 130, 246, 0.8)";
    this.ctx.fill();

    // Highlight target node
    if (cd.endNodeId && cd.endNodeId !== cd.startNodeId) {
      const nodeJson = this.engine.get_node_json(cd.endNodeId);
      if (nodeJson) {
        const node = JSON.parse(nodeJson);
        const nx = node.x * zoom + panX;
        const ny = node.y * zoom + panY;
        const nw = node.width * zoom;
        const nh = node.height * zoom;
        this.ctx.strokeStyle = "rgba(59, 130, 246, 0.5)";
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([]);
        this.ctx.strokeRect(nx, ny, nw, nh);

        // Connection point indicator
        const cpx = nx + nw / 2;
        const cpy = ny + nh / 2;
        this.ctx.beginPath();
        this.ctx.arc(cpx, cpy, 5, 0, Math.PI * 2);
        this.ctx.fillStyle = "rgba(59, 130, 246, 0.7)";
        this.ctx.fill();
      }
    }

    // Highlight source node
    if (cd.startNodeId) {
      const nodeJson = this.engine.get_node_json(cd.startNodeId);
      if (nodeJson) {
        const node = JSON.parse(nodeJson);
        const nx = node.x * zoom + panX;
        const ny = node.y * zoom + panY;
        const nw = node.width * zoom;
        const nh = node.height * zoom;
        this.ctx.strokeStyle = "rgba(16, 185, 129, 0.5)";
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([]);
        this.ctx.strokeRect(nx, ny, nw, nh);
      }
    }

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

  // Pixel preview mode
  private _pixelPreview = false;
  private _pixelPreviewDevice: import("./ui/pixel-preview").DevicePreset | null = null;
  private _pixelPreviewShowGrid = true;
  private _onPixelPreviewChanges: (() => void)[] = [];

  // Performance monitoring
  private _frameTimeHistory: number[] = [];
  private _perfStatsEl: HTMLElement | null = null;
  private _perfStatsVisible = false;
  private _lastPerfUpdate = 0;

  private startLoop() {
    const loop = () => {
      if (this.needsRender) {
        const frameStart = performance.now();
        const dpr = window.devicePixelRatio || 1;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // Pixel preview: disable smoothing for crisp 1:1 pixels
        if (this._pixelPreview) {
          this.ctx.imageSmoothingEnabled = false;
        }
        this.engine.render(this.ctx);
        this.renderImages();
        this.render3DPerspective();
        this.renderPatternFills();
        this.renderLayoutGrids();
        this.renderGuideLines();
        this.renderSmartGuides();
        this.renderPointSnap();
        this.renderMeasure();
        this.renderPathEditOverlay();
        this.renderVNEditOverlay();
        this.renderMeshEditOverlay();
        this.renderCaret();
        this.renderMarquee();
        this.renderConnectorPreview();
        this.renderSliceOverlays();
        this.renderGradientEditor();
        this.renderSpacingHandles();
        this.renderCursorPresence();
        this.renderStamps();
        this.renderDiffOverlay();
        this.renderSearchFilterOverlay();
        this.renderPixelPreviewOverlay();
        this._rulers?.render();
        this.needsRender = false;

        // Frame time tracking
        const frameTime = performance.now() - frameStart;
        this._frameTimeHistory.push(frameTime);
        if (this._frameTimeHistory.length > 60) this._frameTimeHistory.shift();

        // Update perf heatmap overlay if enabled
        if ((this as any)._perfHeatmapCb) (this as any)._perfHeatmapCb();

        // Update perf overlay if visible
        if (this._perfStatsVisible && performance.now() - this._lastPerfUpdate > 500) {
          this._lastPerfUpdate = performance.now();
          this.updatePerfStats();
        }
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  /** Toggle performance stats overlay (Shift+P in dev) */
  togglePerfStats() {
    this._perfStatsVisible = !this._perfStatsVisible;
    if (this._perfStatsVisible) {
      if (!this._perfStatsEl) {
        this._perfStatsEl = document.createElement("div");
        this._perfStatsEl.style.cssText = `
          position: fixed; top: 8px; right: 8px; z-index: 9999;
          background: rgba(0,0,0,0.85); color: #0f0; font: 11px monospace;
          padding: 6px 10px; border-radius: 6px; pointer-events: none;
          line-height: 1.5;
        `;
        document.body.appendChild(this._perfStatsEl);
      }
      this._perfStatsEl.style.display = "block";
    } else if (this._perfStatsEl) {
      this._perfStatsEl.style.display = "none";
    }
  }

  private updatePerfStats() {
    if (!this._perfStatsEl) return;
    const avg = this._frameTimeHistory.length > 0
      ? this._frameTimeHistory.reduce((a, b) => a + b, 0) / this._frameTimeHistory.length
      : 0;
    const max = this._frameTimeHistory.length > 0
      ? Math.max(...this._frameTimeHistory)
      : 0;
    const rendered = this.engine.get_rendered_count?.() ?? "?";
    const culled = this.engine.get_culled_count?.() ?? "?";
    const total = this.engine.get_node_count?.() ?? "?";
    this._perfStatsEl.innerHTML = [
      `Frame: ${avg.toFixed(1)}ms avg / ${max.toFixed(1)}ms max`,
      `FPS: ~${avg > 0 ? Math.round(1000 / avg) : "∞"}`,
      `Nodes: ${rendered} rendered / ${culled} culled / ${total} total`,
    ].join("<br>");
  }

  get devMode() { return this._devMode; }
  setDevMode(v: boolean) {
    this._devMode = v;
    this._devModeOverlay.setEnabled(v);
    if (!v) {
      this._devHoverNodeId = null;
      if (this._devHoverTimer) { clearTimeout(this._devHoverTimer); this._devHoverTimer = null; }
      this._measureLines = [];
      this._measureTargetBounds = null;
      this.needsRender = true;
    }
  }

  /** Enable/disable pressure sensitivity for pen tool (stylus input) */
  get penPressureEnabled() { return this._penPressureEnabled; }
  set penPressureEnabled(v: boolean) { this._penPressureEnabled = v; }

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
      star: "crosshair", polygon: "crosshair",
      slice: "crosshair", connector: "crosshair", sticky: "crosshair", freehand: "crosshair",
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
        // Handle SVG files as import (not as image)
        if (file.type === "image/svg+xml" || file.name.endsWith(".svg")) {
          const reader = new FileReader();
          reader.onload = () => {
            const svgText = reader.result as string;
            const sx = this.engine.screen_to_scene_x(e.offsetX, e.offsetY);
            const sy = this.engine.screen_to_scene_y(e.offsetX, e.offsetY);
            const json = this.engine.import_svg(svgText, sx, sy);
            const ids: number[] = JSON.parse(json);
            if (ids.length > 0) {
              this.render();
              this.emit('selectionChanged');
              this.onLayersChanges.forEach(fn => fn());
            }
          };
          reader.readAsText(file);
          continue;
        }
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

      // Apply crop (normalized 0-1 within source image)
      const crop = kind.Image.crop;
      const imgW = img.naturalWidth;
      const imgH = img.naturalHeight;
      let srcX = 0, srcY = 0, srcW = imgW, srcH = imgH;
      if (crop && crop.w > 0 && crop.h > 0) {
        srcX = crop.x * imgW;
        srcY = crop.y * imgH;
        srcW = crop.w * imgW;
        srcH = crop.h * imgH;
      }

      // Draw image with fit mode
      const fit = kind.Image.fit || "cover";
      const focalX = kind.Image.focal_x ?? 0.5;
      const focalY = kind.Image.focal_y ?? 0.5;
      if (fit === "fill") {
        this.ctx.drawImage(img, srcX, srcY, srcW, srcH, x, y, w, h);
      } else {
        // cover or contain with focal point
        const imgAspect = srcW / srcH;
        const nodeAspect = w / h;
        let sx = srcX, sy = srcY, sw = srcW, sh = srcH;
        if (fit === "cover") {
          if (imgAspect > nodeAspect) {
            sw = srcH * nodeAspect;
            // Use focal point instead of center
            sx = srcX + (srcW - sw) * focalX;
          } else {
            sh = srcW / nodeAspect;
            sy = srcY + (srcH - sh) * focalY;
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

  /** Render 3D perspective transforms using strip-based subdivision */
  private render3DPerspective() {
    const layers = JSON.parse(this.engine.get_layer_list());
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();

    for (const layer of layers) {
      if (!layer.visible) continue;
      const pJson = this.engine.get_perspective(BigInt(layer.id));
      if (!pJson) continue;
      let p: any;
      try { p = JSON.parse(pJson); } catch { continue; }
      if (!p) continue;
      const hasRotation = Math.abs(p.rotate_x) > 0.01 || Math.abs(p.rotate_y) > 0.01 || Math.abs(p.rotate_z) > 0.01;
      if (!hasRotation) continue;

      const nj = this.engine.get_node_json(BigInt(layer.id));
      if (!nj) continue;
      const node = JSON.parse(nj);

      const w = node.width;
      const h = node.height;
      const sx = node.x * zoom + panX;
      const sy = node.y * zoom + panY;
      const sw = w * zoom;
      const sh = h * zoom;

      // Build DOMMatrix for 3D transform
      const cx = sw * p.origin_x;
      const cy = sh * p.origin_y;
      const m = new DOMMatrix();
      m.translateSelf(cx, cy);
      if (p.perspective > 0) {
        m.m34 = -1 / (p.perspective * zoom);
      }
      m.rotateAxisAngleSelf(1, 0, 0, p.rotate_x);
      m.rotateAxisAngleSelf(0, 1, 0, p.rotate_y);
      m.rotateAxisAngleSelf(0, 0, 1, p.rotate_z);
      m.translateSelf(-cx, -cy);

      // Project 4 corners
      const corners = [
        new DOMPoint(0, 0, 0), new DOMPoint(sw, 0, 0),
        new DOMPoint(sw, sh, 0), new DOMPoint(0, sh, 0)
      ];
      const proj = corners.map(c => {
        const pt = m.transformPoint(c);
        const ww = pt.w || 1;
        return { x: pt.x / ww, y: pt.y / ww };
      });

      // Draw semi-transparent overlay to hide the flat-rendered node
      this.ctx.save();
      this.ctx.globalCompositeOperation = "destination-out";
      this.ctx.fillStyle = "rgba(0,0,0,1)";
      this.ctx.fillRect(sx, sy, sw, sh);
      this.ctx.restore();

      // Render the node to an offscreen canvas at 1x (zoomed) size
      const offW = Math.max(1, Math.ceil(sw));
      const offH = Math.max(1, Math.ceil(sh));
      const off = new OffscreenCanvas(offW, offH);
      const offCtx = off.getContext("2d")!;
      // Re-render the node into offscreen (we use engine render at this node's region)
      // For simplicity, capture from main canvas
      // Actually, let's just draw what we can from the main canvas region
      offCtx.drawImage(this.canvas, sx * (window.devicePixelRatio || 1), sy * (window.devicePixelRatio || 1), offW * (window.devicePixelRatio || 1), offH * (window.devicePixelRatio || 1), 0, 0, offW, offH);

      // Strip-based perspective warp (vertical slices)
      const STRIPS = Math.max(16, Math.ceil(sw / 4));
      this.ctx.save();
      this.ctx.globalAlpha = node.opacity ?? 1;
      for (let i = 0; i < STRIPS; i++) {
        const t0 = i / STRIPS;
        const t1 = (i + 1) / STRIPS;

        // Interpolate left edge (top-left to bottom-left) and right edge (top-right to bottom-right)
        const topL = { x: proj[0].x + (proj[1].x - proj[0].x) * t0, y: proj[0].y + (proj[1].y - proj[0].y) * t0 };
        const topR = { x: proj[0].x + (proj[1].x - proj[0].x) * t1, y: proj[0].y + (proj[1].y - proj[0].y) * t1 };
        const botL = { x: proj[3].x + (proj[2].x - proj[3].x) * t0, y: proj[3].y + (proj[2].y - proj[3].y) * t0 };
        const botR = { x: proj[3].x + (proj[2].x - proj[3].x) * t1, y: proj[3].y + (proj[2].y - proj[3].y) * t1 };

        // Source strip from offscreen
        const srcX = t0 * offW;
        const srcW = Math.max(1, (t1 - t0) * offW + 1);

        // Destination: use affine transform to map strip
        // We approximate by mapping the strip rectangle to the trapezoid slice
        const dstX = topL.x;
        const dstY = topL.y;
        const dstW = topR.x - topL.x;
        const dstH_left = botL.y - topL.y;
        const dstH_right = botR.y - topR.y;
        const dstH = Math.max(dstH_left, dstH_right);

        if (dstW <= 0 || dstH <= 0) continue;

        this.ctx.save();
        this.ctx.translate(sx + dstX, sy + dstY);
        // Simple affine: scale x and y, plus skew for perspective
        const scaleX = dstW / srcW;
        const scaleY = dstH / offH;
        const skewY = ((topR.y - topL.y) / dstW) || 0;
        this.ctx.transform(scaleX, skewY, 0, scaleY, 0, 0);
        this.ctx.drawImage(off, srcX, 0, srcW, offH, 0, 0, srcW, offH);
        this.ctx.restore();
      }
      this.ctx.restore();
    }
  }

  /** Get combined bounding box of selected nodes */
  private _patternCache = new Map<string, HTMLImageElement>();

  private renderPatternFills() {
    const layers = JSON.parse(this.engine.get_layer_list());
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();

    for (const layer of layers) {
      if (!layer.visible) continue;
      const fillsJson = this.engine.get_fills(BigInt(layer.id));
      if (!fillsJson || fillsJson === "[]") continue;
      const fills: any[] = JSON.parse(fillsJson);
      const patternFills = fills.filter((f: any) => f.type === "Pattern" && f.visible !== false && f.src);
      if (patternFills.length === 0) continue;

      const nj = this.engine.get_node_json(BigInt(layer.id));
      if (!nj) continue;
      const node = JSON.parse(nj);

      const x = node.x * zoom + panX;
      const y = node.y * zoom + panY;
      const w = node.width * zoom;
      const h = node.height * zoom;

      for (const pf of patternFills) {
        let img = this._patternCache.get(pf.src);
        if (!img) {
          img = new Image();
          img.crossOrigin = "anonymous";
          img.src = pf.src;
          this._patternCache.set(pf.src, img);
          img.onload = () => this.requestRender();
          continue;
        }
        if (!img.complete || img.naturalWidth === 0) continue;

        const scale = (pf.scale ?? 1) * zoom;
        const tw = (pf.tile_width > 0 ? pf.tile_width : img.naturalWidth) * scale;
        const th = (pf.tile_height > 0 ? pf.tile_height : img.naturalHeight) * scale;
        if (tw <= 0 || th <= 0) continue;

        // Create offscreen tile for brick/hex patterns
        const patType = pf.pattern_type ?? "Tile";
        let tileCanvas: HTMLCanvasElement;
        if (patType === "Brick") {
          tileCanvas = document.createElement("canvas");
          tileCanvas.width = tw * 2;
          tileCanvas.height = th * 2;
          const tc = tileCanvas.getContext("2d")!;
          tc.drawImage(img, 0, 0, tw, th);
          tc.drawImage(img, tw, 0, tw, th);
          tc.drawImage(img, tw / 2, th, tw, th);
          tc.drawImage(img, tw / 2 - tw, th, tw, th);
          tc.drawImage(img, tw / 2 + tw, th, tw, th);
        } else if (patType === "Hex") {
          const hh = th * 0.75;
          tileCanvas = document.createElement("canvas");
          tileCanvas.width = tw * 2;
          tileCanvas.height = Math.ceil(hh * 2);
          const tc = tileCanvas.getContext("2d")!;
          tc.drawImage(img, 0, 0, tw, th);
          tc.drawImage(img, tw, 0, tw, th);
          tc.drawImage(img, tw / 2, hh, tw, th);
          tc.drawImage(img, tw / 2 - tw, hh, tw, th);
          tc.drawImage(img, tw / 2 + tw, hh, tw, th);
        } else {
          tileCanvas = document.createElement("canvas");
          tileCanvas.width = tw;
          tileCanvas.height = th;
          const tc = tileCanvas.getContext("2d")!;
          tc.drawImage(img, 0, 0, tw, th);
        }

        const pattern = this.ctx.createPattern(tileCanvas, "repeat");
        if (!pattern) continue;

        this.ctx.save();
        this.ctx.globalAlpha = node.opacity ?? 1;

        // Clip to node bounds
        if (node.corner_radius > 0) {
          const r = node.corner_radius * zoom;
          this.ctx.beginPath();
          this.ctx.roundRect(x, y, w, h, r);
          this.ctx.clip();
        } else {
          this.ctx.beginPath();
          this.ctx.rect(x, y, w, h);
          this.ctx.clip();
        }

        // Apply rotation
        if (pf.rotation) {
          const cx = x + w / 2;
          const cy = y + h / 2;
          this.ctx.translate(cx, cy);
          this.ctx.rotate((pf.rotation * Math.PI) / 180);
          this.ctx.translate(-cx, -cy);
        }

        pattern.setTransform(new DOMMatrix().translateSelf(x, y));
        this.ctx.fillStyle = pattern;
        this.ctx.fillRect(x - w, y - h, w * 3, h * 3); // overdraw for rotation
        this.ctx.restore();
      }
    }
  }

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

  /**
   * Collect point snap targets for path/VN editing.
   * Includes other path points, node edges/centers, and ruler guides.
   */
  private _collectPointSnapTargets(excludeNodeId: number, excludePointIndex: number): PointSnapTarget[] {
    const layers = JSON.parse(this.engine.get_layer_list());
    const nodeIds = layers.map((l: any) => l.id as number);
    const targets = collectPathPointTargets(this.engine, nodeIds, excludeNodeId, excludePointIndex);
    addRulerTargets(targets, this._rulers ?? null);
    return targets;
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

  /** Render slice overlays (dashed outlines + labels) on canvas */
  private renderGradientEditor() {
    if (!this._gradientEditor?.active) return;
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    this._gradientEditor.render(this.ctx, zoom, panX, panY);
  }

  private renderSpacingHandles() {
    if (this._spacingHandles.length === 0) return;
    renderSpacingHandles(this.ctx, this._spacingHandles, this._spacingHovered, this._spacingDragging);
  }

  private renderPixelPreviewOverlay() {
    if (!this._pixelPreview) return;
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    
    // Pixel grid at high zoom
    if (this._pixelPreviewShowGrid) {
      renderPixelGrid(this.ctx, cw, ch, zoom, panX, panY);
    }
    
    // Device frame overlay
    if (this._pixelPreviewDevice) {
      renderDeviceFrame(this.ctx, cw, ch, zoom, panX, panY, this._pixelPreviewDevice);
    }
    
    // Re-enable smoothing for UI overlays (rulers, etc.)
    this.ctx.imageSmoothingEnabled = true;
  }

  private renderDiffOverlay() {
    if (!this._diffOverlay?.isActive()) return;
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    this._diffOverlay.renderOverlay(this.ctx, zoom, panX, panY);
  }

  /** Get diff overlay for branch panel integration */
  get diffOverlay() { return this._diffOverlay; }

  private renderSearchFilterOverlay() {
    drawSearchFilterOverlay(this.ctx, this);
  }

  private renderCursorPresence() {
    // Follow mode: sync viewport to followed user's cursor position
    this.tickFollowMode();

    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    this._cursorPresence.render(this.ctx, zoom, panX, panY);
    // Render floating emoji reactions
    this._cursorChat.renderReactions(this.ctx, zoom, panX, panY);
    // Re-render if cursors are animating (fade-out) or reactions active
    if (this._cursorPresence.getCursors().length > 0 || this._cursorChat.getActiveReactions().length > 0) {
      this.needsRender = true;
    }
  }

  /** Sync viewport to followed user */
  private tickFollowMode() {
    const viewport = this._cursorPresence.tickFollow();
    if (viewport) {
      const currentZoom = this.engine.get_zoom();
      const currentPanX = this.engine.get_pan_x();
      const currentPanY = this.engine.get_pan_y();
      // Smooth lerp toward target viewport
      const lerpFactor = 0.15;
      const newZoom = currentZoom + (viewport.zoom - currentZoom) * lerpFactor;
      const newPanX = currentPanX + (viewport.panX - currentPanX) * lerpFactor;
      const newPanY = currentPanY + (viewport.panY - currentPanY) * lerpFactor;
      // Only update if meaningful difference
      if (Math.abs(newZoom - currentZoom) > 0.001 || Math.abs(newPanX - currentPanX) > 0.5 || Math.abs(newPanY - currentPanY) > 0.5) {
        this.engine.set_viewport(newZoom, newPanX, newPanY);
        this.onZoomChange();
      }
    }
  }

  /** Follow a remote user's viewport */
  followUser(userId: string) {
    this._cursorPresence.toggleFollow(userId);
    this.needsRender = true;
  }

  /** Stop following any user */
  unfollowUser() {
    this._cursorPresence.unfollow();
    this.needsRender = true;
  }

  /** Get the currently followed user ID */
  get followingUserId(): string | null {
    return this._cursorPresence.followingId;
  }

  private renderStamps() {
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    const pageId = Number(this.engine.get_active_page_id());
    renderStampsOverlay(this.ctx, this.engine, pageId, zoom, panX, panY);
  }

  /** Place a stamp at canvas coordinates */
  placeStamp(kind: string, canvasX: number, canvasY: number, author = "User") {
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    const worldX = (canvasX - panX) / zoom;
    const worldY = (canvasY - panY) / zoom;
    const pageId = this.engine.get_active_page_id();
    this.engine.add_stamp(kind, worldX, worldY, author, pageId, "", Date.now());
    this.needsRender = true;
  }

  removeStamp(stampId: number) {
    this.engine.remove_stamp(BigInt(stampId));
    this.needsRender = true;
  }

  /** Get cursor presence instance for external integration */
  get cursorPresence() { return this._cursorPresence; }

  /** Set external collab client for broadcasting */
  setCollabClient(client: CollabClient) {
    this._collabClient = client;
  }

  // ── Cursor Chat ───────────────────────────────────────────

  private openCursorChat() {
    if (this._chatInputActive) return;
    this._chatInputActive = true;

    const sx = this._lastPointerScreenX;
    const sy = this._lastPointerScreenY;

    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    const worldX = (sx - panX) / zoom;
    const worldY = (sy - panY) / zoom;

    this._cursorPresence.setLocalTyping(true, worldX, worldY);
    this._collabClient?.sendTyping(true);
    this.needsRender = true;

    const { container, cleanup } = this._cursorChat.createEnhancedInput({
      screenX: sx,
      screenY: sy,
      worldX,
      worldY,
      onClose: () => {
        this._cursorPresence.setLocalTyping(false, worldX, worldY);
        this._collabClient?.sendTyping(false);
        this.closeCursorChat();
        this.needsRender = true;
      },
      onTyping: (isTyping) => {
        this._cursorPresence.setLocalTyping(isTyping, worldX, worldY);
        this._collabClient?.sendTyping(isTyping);
      },
    });

    this.canvas.parentElement!.appendChild(container);
    this._chatInputContainer = container as HTMLDivElement;
    this._chatInputCleanup = cleanup;
  }

  private closeCursorChat() {
    this._chatInputCleanup?.();
    this._chatInputCleanup = null;
    this._chatInputContainer = null;
    this._chatInputEl = null;
    this._chatInputActive = false;
  }

  /** Toggle chat history panel */
  toggleChatHistory() {
    this._cursorChat.toggleHistoryPanel(this.canvas.parentElement!);
  }

  /** Get the CursorChat instance */
  get cursorChat() { return this._cursorChat; }

  /** Handle incoming chat message from collab */
  handleRemoteChat(userId: string, userName: string, text: string, x: number, y: number) {
    this._cursorPresence.setChatBubble(userId, userName, text, x, y);
    this._cursorChat.addMessage({ userId, userName, text, timestamp: Date.now(), x, y });
    this.needsRender = true;
  }

  /** Handle incoming typing indicator from collab */
  handleRemoteTyping(userId: string, isTyping: boolean) {
    this._cursorPresence.setTyping(userId, isTyping);
    this.needsRender = true;
  }

  /** Toggle cursor presence demo simulation */
  toggleCursorDemo(): boolean {
    if (this._cursorDemoCleanup) {
      this._cursorDemoCleanup();
      this._cursorDemoCleanup = null;
      this.needsRender = true;
      return false;
    } else {
      const rect = this.canvas.getBoundingClientRect();
      this._cursorDemoCleanup = this._cursorPresence.startDemo(rect.width, rect.height);
      this.needsRender = true;
      return true;
    }
  }

  private renderSliceOverlays() {
    const slicesJson = this.engine.get_slices();
    const slices: Array<{id: number; name: string; x: number; y: number; width: number; height: number}> = JSON.parse(slicesJson);
    if (slices.length === 0) return;

    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    const ctx = this.ctx;

    for (const s of slices) {
      const sx = s.x * zoom + panX;
      const sy = s.y * zoom + panY;
      const sw = s.width * zoom;
      const sh = s.height * zoom;

      ctx.save();
      ctx.strokeStyle = "#36b37e";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.setLineDash([]);

      // Label
      const label = s.name || "Slice";
      ctx.font = "10px Inter, sans-serif";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "#36b37e";
      ctx.fillRect(sx, sy - 16, tw + 8, 16);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, sx + 4, sy - 4);
      ctx.restore();
    }
  }

  /** Export a slice region as PNG (crops the canvas area) */
  exportSlice(sliceId: number, scale: number = 2): void {
    const slices: Array<{id: number; name: string; x: number; y: number; width: number; height: number}> = JSON.parse(this.engine.get_slices());
    const slice = slices.find(s => s.id === sliceId);
    if (!slice) return;

    const w = Math.ceil(slice.width * scale);
    const h = Math.ceil(slice.height * scale);
    const offscreen = document.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext("2d")!;

    // Set up transform: scale and translate so the slice region fills the canvas
    ctx.scale(scale, scale);
    ctx.translate(-slice.x, -slice.y);

    // Render the full scene onto this cropped canvas
    this.engine.render(ctx as any);
    // Also render images
    this.renderImagesToCtx(ctx, -slice.x, -slice.y, scale);

    offscreen.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slice.name || "slice"}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  /** Render images to an offscreen context (for slice export) */
  private renderImagesToCtx(ctx: CanvasRenderingContext2D, offsetX: number, offsetY: number, scale: number) {
    // Re-use existing image rendering logic with offset
    const scene = this.engine.export_scene();
    const nodes = JSON.parse(scene);
    for (const node of nodes) {
      if (node.kind?.Image && node.visible !== false) {
        const src = node.kind.Image.src;
        if (!src) continue;
        const img = this._imageCache?.get(src);
        if (!img) continue;
        ctx.save();
        if (node.corner_radius > 0) {
          const r = Math.min(node.corner_radius, node.width / 2, node.height / 2);
          ctx.beginPath();
          ctx.roundRect(node.x, node.y, node.width, node.height, r);
          ctx.clip();
        }
        ctx.globalAlpha = node.opacity ?? 1;
        ctx.drawImage(img, node.x, node.y, node.width, node.height);
        ctx.restore();
      }
    }
  }
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
    const strokes: any[] = node.strokes || (node.stroke ? [node.stroke] : []);
    const drawStrokes = () => {
      for (const s of strokes) {
        if (s.visible === false) continue;
        ctx.strokeStyle = `rgba(${s.color.r},${s.color.g},${s.color.b},${s.color.a})`;
        ctx.lineWidth = s.width;
        ctx.stroke();
      }
    };

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
      drawStrokes();
    } else if (kind === "Ellipse") {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      if (fill) {
        ctx.fillStyle = `rgba(${fill.r},${fill.g},${fill.b},${fill.a})`;
        ctx.fill();
      }
      drawStrokes();
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
      const letterSpacing = text.letter_spacing ?? 0;
      if (letterSpacing !== 0) {
        (ctx as any).letterSpacing = `${letterSpacing}px`;
      }
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], x, y + ascent + lineH * i);
      }
      // Text decorations
      const deco = text.text_decoration ?? "None";
      if (deco !== "None") {
        const hasU = deco === "Underline" || deco === "UnderlineStrikethrough";
        const hasS = deco === "Strikethrough" || deco === "UnderlineStrikethrough";
        ctx.strokeStyle = ctx.fillStyle as string;
        ctx.lineWidth = Math.max(1, fontSize / 14);
        for (let i = 0; i < lines.length; i++) {
          const lw = ctx.measureText(lines[i]).width;
          if (hasU) {
            const uy = y + ascent + lineH * i + fontSize * 0.15;
            ctx.beginPath(); ctx.moveTo(x, uy); ctx.lineTo(x + lw, uy); ctx.stroke();
          }
          if (hasS) {
            const sy = y + ascent * 0.65 + lineH * i;
            ctx.beginPath(); ctx.moveTo(x, sy); ctx.lineTo(x + lw, sy); ctx.stroke();
          }
        }
      }
      if (letterSpacing !== 0) {
        (ctx as any).letterSpacing = "0px";
      }
    }
  }

  /**
   * Export entire scene as SVG string
   */
  /**
   * Import SVG markup into the scene at the current viewport center.
   * Returns array of created top-level node IDs.
   */
  importSVG(svgText: string): number[] {
    // Place at viewport center
    const cx = (-this.panX + this.canvas.width / 2 / this.dpr) / this.zoom;
    const cy = (-this.panY + this.canvas.height / 2 / this.dpr) / this.zoom;
    const json = this.engine.import_svg(svgText, cx, cy);
    const ids: number[] = JSON.parse(json);
    this.render();
    this.emit('selectionChanged');
    return ids;
  }

  /**
   * Open file picker to import an SVG file.
   */
  importSVGFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.svg,image/svg+xml';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        const ids = this.importSVG(text);
        if (ids.length === 0) {
          console.warn('SVG import: no nodes created');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

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
   * Export active page as email-compatible HTML and trigger download
   */
  downloadEmailHtml(filename?: string) {
    const html = this.engine.export_email_html();
    if (!html) return false;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "opensketch-email.html";
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

  /**
   * Export canvas/pages as PDF and trigger download.
   */
  async downloadPDF(options?: PDFExportOptions) {
    await exportPDF(this, options);
  }

  // =============================================
  // Design tokens export
  // =============================================

  /**
   * Export design tokens (styles + variables) in the given format.
   * @param format "w3c" | "style-dictionary" | "tailwind"
   */
  exportDesignTokens(format: string = 'w3c'): string {
    return this.engine.export_design_tokens(format);
  }

  /**
   * Download design tokens as a JSON file.
   */
  downloadDesignTokens(format: string = 'w3c', filename?: string) {
    const json = this.exportDesignTokens(format);
    if (!json || json === '{}') return false;
    const ext = format === 'tailwind' ? 'js' : format === 'css-variables' || format === 'css' ? 'css' : 'json';
    let content = json;
    if (format === 'tailwind') {
      content = `/** @type {import('tailwindcss').Config} */\nmodule.exports = ${json};\n`;
    }
    const mimeTypes: Record<string, string> = { js: 'text/javascript', css: 'text/css', json: 'application/json' };
    const blob = new Blob([content], { type: mimeTypes[ext] || 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `design-tokens.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }

  // =============================================
  // Zoom controls
  // =============================================

  getZoomLevel(): number {
    return this.engine.get_zoom();
  }

  zoomTo100() {
    if (this._cursorPresence.followingId) this._cursorPresence.unfollow();
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
    if (this._cursorPresence.followingId) this._cursorPresence.unfollow();
    const boundsJson = this.engine.get_scene_bounds();
    if (!boundsJson) return;
    this.zoomToBounds(JSON.parse(boundsJson));
  }

  zoomToSelection() {
    if (this._cursorPresence.followingId) this._cursorPresence.unfollow();
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
  // Pixel Preview Mode
  // =============================================

  togglePixelPreview() {
    this._pixelPreview = !this._pixelPreview;
    if (this._pixelPreview) {
      // Disable anti-aliasing for crisp pixel rendering
      this.ctx.imageSmoothingEnabled = false;
    } else {
      this.ctx.imageSmoothingEnabled = true;
    }
    this.needsRender = true;
    this._onPixelPreviewChanges.forEach(fn => fn());
  }

  isPixelPreviewEnabled(): boolean {
    return this._pixelPreview;
  }

  setPixelPreviewDevice(device: import("./ui/pixel-preview").DevicePreset | null) {
    this._pixelPreviewDevice = device;
    this.needsRender = true;
    this._onPixelPreviewChanges.forEach(fn => fn());
  }

  getPixelPreviewDevice(): import("./ui/pixel-preview").DevicePreset | null {
    return this._pixelPreviewDevice;
  }

  setPixelPreviewShowGrid(show: boolean) {
    this._pixelPreviewShowGrid = show;
    this.needsRender = true;
  }

  getPixelPreviewShowGrid(): boolean {
    return this._pixelPreviewShowGrid;
  }

  onPixelPreviewChanged(fn: () => void) {
    this._onPixelPreviewChanges.push(fn);
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

  private _presentationMode: ReturnType<typeof import("./ui/presentation-mode").createPresentationMode> | null = null;

  openPresentationMode() {
    if (this._presentationMode?.isActive()) return;
    import("./ui/presentation-mode").then(({ createPresentationMode }) => {
      this._presentationMode = createPresentationMode(this);
      this._presentationMode.show();
    });
  }

  closePresentationMode() {
    this._presentationMode?.hide();
  }

  isPresentationActive(): boolean {
    return this._presentationMode?.isActive() ?? false;
  }

  openResponsiveTokens() {
    openResponsiveTokensPanel(this.engine, () => this.render());
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
  // Auto Dark Mode
  // =============================================
  autoDarkModeAll() {
    const count = this.engine.auto_dark_mode_all();
    if (count > 0) {
      (this as any).onLayersChanges?.forEach?.((fn: any) => fn());
      this.requestRender();
    }
    return Number(count);
  }

  autoDarkModeSelection() {
    const sel = Array.from(this.engine.get_selection()).map(Number);
    if (sel.length === 0) return this.autoDarkModeAll();
    const count = this.engine.auto_dark_mode_selection();
    if (count > 0) {
      (this as any).onLayersChanges?.forEach?.((fn: any) => fn());
      this.requestRender();
    }
    return Number(count);
  }

  // =============================================
  // Component Search & Swap
  // =============================================
  openComponentLibrary() {
    openComponentLibraryPanel(this.engine, () => this.requestRender());
  }

  openSmartReplacePanel(sourceNodeId: number) {
    openSmartReplace(
      this.engine,
      sourceNodeId,
      () => this.requestRender(),
      (nodeId) => {
        // Highlight node on hover
        if (nodeId) {
          this.engine.deselect_all();
          this.engine.select(BigInt(nodeId));
        }
        this.needsRender = true;
      },
    );
  }

  openComponentSwap() {
    openComponentSwapModal(this);
  }

  openComponentAnalytics() {
    openComponentAnalytics(this.engine, (nodeId, pageId) => {
      // Navigate to page and select node
      const pages = JSON.parse(this.engine.get_pages());
      const pageIdx = pages.findIndex((p: any) => p.id === pageId);
      if (pageIdx >= 0) {
        this.engine.set_active_page(BigInt(pageId));
      }
      this.engine.set_selection(new BigUint64Array([BigInt(nodeId)]));
      this.requestRender();
      this.fireSelectionNow([nodeId]);
      closeComponentAnalytics();
    });
  }

  // =============================================
  // Smart Component Suggestions
  openSmartSuggestions() {
    openSmartSuggestions(this.engine, (nodeId) => {
      this.engine.set_selection(new BigUint64Array([BigInt(nodeId)]));
      this.requestRender();
      this.fireSelectionNow([nodeId]);
    });
  }

  toggleSnapshotPanel() {
    if (!this._snapshotPanel) {
      this._snapshotPanel = initSnapshotPanel(this);
    }
    this._snapshotPanel.toggle();
  }

  // =============================================
  // Batch Rename Dialog
  // =============================================

  tidyUpSelection() {
    const sel = Array.from(this.engine.get_selection()).map(Number);
    if (sel.length < 2) return;
    try {
      const result = this.engine.tidy_up_selection();
      if (result && result !== "{}") {
        this.notifyLayersChanged();
        this.markDirty();
      }
    } catch { /* ignore */ }
  }

  smartDistributeGrid() {
    const sel = Array.from(this.engine.get_selection()).map(Number);
    if (sel.length < 4) return;
    try {
      const result = (this.engine as any).smart_distribute_grid();
      if (result && result !== "{}") {
        this.notifyLayersChanged();
        this.markDirty();
      }
    } catch { /* ignore */ }
  }

  showBatchRenameDialog() {
    const sel = Array.from(this.engine.get_selection()).map(Number);
    if (sel.length < 2) return;

    // Remove any existing dialog
    document.querySelector('.os-batch-rename-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'os-batch-rename-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5)';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:#2a2a2a;border-radius:12px;padding:24px;width:360px;color:#eee;font-family:Inter,system-ui,sans-serif;font-size:13px;box-shadow:0 8px 32px rgba(0,0,0,0.4)';
    dialog.innerHTML = `
      <div style="font-size:15px;font-weight:600;margin-bottom:16px">Batch Rename (${sel.length} nodes)</div>
      <label style="display:block;margin-bottom:4px;color:#aaa">Pattern</label>
      <input id="br-pattern" type="text" value="{name}" style="width:100%;box-sizing:border-box;padding:8px;background:#1a1a1a;border:1px solid #444;border-radius:6px;color:#eee;font-size:13px;margin-bottom:8px" />
      <div style="color:#888;font-size:11px;margin-bottom:12px">{name} = original, {n} = number, {N} = zero-padded</div>
      <label style="display:block;margin-bottom:4px;color:#aaa">Start number</label>
      <input id="br-start" type="number" value="1" min="0" style="width:80px;padding:8px;background:#1a1a1a;border:1px solid #444;border-radius:6px;color:#eee;font-size:13px;margin-bottom:16px" />
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="br-cancel" style="padding:8px 16px;background:#444;border:none;border-radius:6px;color:#eee;cursor:pointer">Cancel</button>
        <button id="br-apply" style="padding:8px 16px;background:#4a90d9;border:none;border-radius:6px;color:#fff;cursor:pointer;font-weight:600">Rename</button>
      </div>
    `;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const patternInput = dialog.querySelector('#br-pattern') as HTMLInputElement;
    const startInput = dialog.querySelector('#br-start') as HTMLInputElement;
    patternInput.focus();
    patternInput.select();

    const close = () => overlay.remove();

    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    dialog.querySelector('#br-cancel')!.addEventListener('click', close);

    const apply = () => {
      const pattern = patternInput.value || '{name}';
      const start = parseInt(startInput.value) || 1;
      const count = this.engine.batch_rename_selection(pattern, start);
      if (count > 0) {
        (this as any).onLayersChanges?.forEach?.((fn: any) => fn());
        this.requestRender();
      }
      close();
    };

    dialog.querySelector('#br-apply')!.addEventListener('click', apply);
    patternInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); if (e.key === 'Escape') close(); });
    startInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); if (e.key === 'Escape') close(); });
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
      if (sel.length >= 2) {
        items.push({ label: "Tidy Up", shortcut: `${mod}⇧T`, enabled: true, action: () => this.tidyUpSelection() });
        if (sel.length >= 4) {
          items.push({ label: "Grid Distribute", shortcut: `${mod}⌥G`, enabled: true, action: () => this.smartDistributeGrid() });
        }
        items.push({ label: "Batch Rename…", shortcut: `${mod}⇧R`, enabled: true, action: () => this.showBatchRenameDialog() });
        items.push({ label: "✨ Suggest Layout", shortcut: `${mod}⇧L`, enabled: true, action: () => showLayoutSuggestion(this) });
      }
      items.push({ separator: true, label: "" });
      items.push({ label: "Edit All Matching Layers", enabled: selAfter.length === 1, action: () => this.selectSameNameAndKind(selAfter[0]!) });
      items.push({ label: "Select All with Same Name", enabled: selAfter.length === 1, action: () => this.selectSameName(selAfter[0]!) });
      items.push({ label: "Select All with Same Fill", enabled: selAfter.length === 1, action: () => this.selectSameFill(selAfter[0]!) });
      items.push({ label: "Select All with Same Stroke", enabled: selAfter.length === 1, action: () => this.selectSameStroke(selAfter[0]!) });
      items.push({ label: "Select All with Same Font", enabled: selAfter.length === 1, action: () => this.selectSameFont(selAfter[0]!) });
      items.push({ label: "Select All with Same Kind", enabled: selAfter.length === 1, action: () => this.selectSameKind(selAfter[0]!) });
      items.push({ label: "Select Similar…", shortcut: `${mod}⇧A`, enabled: selAfter.length === 1, action: () => this.openSmartSelect(selAfter[0]!) });
      items.push({ label: "Smart Replace…", shortcut: `${mod}⇧H`, enabled: selAfter.length === 1, action: () => this.openSmartReplacePanel(selAfter[0]!) });
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

  selectSameName(refId: number) {
    const ids = Array.from(this.engine.select_same_name(BigInt(refId))).map(Number);
    this.fireSelectionNow(ids);
    this.needsRender = true;
  }

  selectSameNameAndKind(refId: number) {
    const ids = Array.from(this.engine.select_same_name_and_kind(BigInt(refId))).map(Number);
    this.fireSelectionNow(ids);
    this.needsRender = true;
  }

  private selectSameFill(refId: number) {
    const ids = Array.from(this.engine.select_same_fill(refId)).map(Number);
    this.fireSelectionNow(ids);
    this.needsRender = true;
  }

  private selectSameStroke(refId: number) {
    const ids = Array.from(this.engine.select_same_stroke(refId)).map(Number);
    this.fireSelectionNow(ids);
    this.needsRender = true;
  }

  private selectSameKind(refId: number) {
    const ids = Array.from(this.engine.select_same_kind(refId)).map(Number);
    this.fireSelectionNow(ids);
    this.needsRender = true;
  }

  private selectSameFont(refId: number) {
    const ids = Array.from(this.engine.select_same_font(refId)).map(Number);
    this.fireSelectionNow(ids);
    this.needsRender = true;
  }

  openSmartSelect(refId: number) {
    this._smartSelectPanel.open(refId);
  }

  closeSmartSelect() {
    this._smartSelectPanel.close();
  }

  /** Find a scrollable frame (overflow=scroll) under the cursor (screen coords) */
  findScrollableFrameAtCursor(screenX: number, screenY: number): number | null {
    // Use hit_test (takes scene coords)
    const hitId = Number(this.engine.hit_test(screenX, screenY));
    if (!hitId) return null;
    // Walk up the tree to find a scrollable frame
    let nodeId = hitId;
    for (let i = 0; i < 50; i++) {
      try {
        const json = this.engine.get_node_json(BigInt(nodeId));
        if (!json) break;
        const node = JSON.parse(json);
        if ((node.kind === "Frame" || node.kind === "Section") && node.overflow === "Scroll") {
          return nodeId;
        }
        if (!node.parent) break;
        nodeId = node.parent;
      } catch { break; }
    }
    return null;
  }

  /** Scroll a frame's content by delta, clamping to content bounds */
  scrollFrame(nodeId: number, dx: number, dy: number) {
    const id = BigInt(nodeId);
    const scrollOffset = JSON.parse(this.engine.get_scroll_offset(id));
    const contentBounds = JSON.parse(this.engine.get_content_bounds(id));
    const json = this.engine.get_node_json(id);
    if (!json) return;
    const node = JSON.parse(json);

    let newScrollX = scrollOffset.x - dx;
    let newScrollY = scrollOffset.y - dy;

    // Clamp: scroll offset is negative (content moves up/left)
    const maxScrollX = Math.min(0, -(contentBounds.width - node.width));
    const maxScrollY = Math.min(0, -(contentBounds.height - node.height));
    newScrollX = Math.max(maxScrollX, Math.min(0, newScrollX));
    newScrollY = Math.max(maxScrollY, Math.min(0, newScrollY));

    this.engine.set_scroll_offset(id, newScrollX, newScrollY);
    this.needsRender = true;
  }
}
