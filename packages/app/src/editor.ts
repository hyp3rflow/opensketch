import type { Engine } from "./wasm/opensketch_engine";
import { showBatchRenameDialog } from "./ui/batch-rename";
import { toggleColorHarmonyPanel } from "./ui/color-harmony";
import { renderPixelGrid, renderDeviceFrame } from "./ui/pixel-preview";
import { computeSnap, renderGuides, type SnapGuide } from "./tools/smart-guides";
import { computeDropTarget, renderDropIndicator, executeDropReparent, type DropTarget } from "./tools/drag-reparent";
import { computePointSnap, renderPointSnapIndicators, collectPathPointTargets, addRulerTargets, constrainAngle, type PointSnapIndicator, type PointSnapTarget } from "./tools/point-snap";
import { renderGrid, computeGridSnap } from "./tools/grid-snap";
import { computeMeasureLines, renderMeasureLines, renderTargetHighlight, computeDimensionLabels, renderDimensionLabels, type MeasureLine, type MeasureDimensionLabel, type Bounds } from "./tools/measure";
import { MeasureToolState, renderPersistentMeasures, hitTestMeasureLine } from "./tools/measure-tool";
import type { RulersAPI } from "./ui/rulers";
import { toggleShortcutsPanel, isShortcutsPanelVisible, closeShortcutsPanel } from "./ui/shortcuts-panel";
import { getShortcutManager } from "./ui/shortcut-manager";
import { showContextMenu, hideContextMenu, type MenuItem } from "./ui/context-menu";
import { openResponsivePreview, isResponsivePreviewOpen, closeResponsivePreview } from "./ui/responsive-preview";
import { openBreakpointsPreview, isBreakpointsPreviewOpen, closeBreakpointsPreview } from "./ui/breakpoints-preview";
import { openResponsiveTokensPanel, closeResponsiveTokensPanel, isResponsiveTokensPanelOpen } from "./ui/responsive-tokens";
import { CursorPresence } from "./ui/cursor-presence";
import { CursorChat } from "./ui/cursor-chat";
import { openComponentSwapModal } from "./ui/component-swap";
import { openSmartReplace, closeSmartReplace, isSmartReplaceOpen } from "./ui/smart-replace";
import { openImageGen, closeImageGen, isImageGenOpen, generateImage } from "./ui/ai-image-gen";
import { renderStamps as renderStampsOverlay, hitTestStamp, isStampModeActive, getActiveStampKind, setActiveStampKind, toggleStampPalette, closeStampPalette } from "./ui/stamp-tool";
import { openComponentLibraryPanel } from "./ui/component-library";
import { openComponentAnalytics, closeComponentAnalytics, isComponentAnalyticsOpen } from "./ui/component-analytics";
import { openSmartSuggestions, closeSmartSuggestions, isSmartSuggestionsOpen } from "./ui/smart-suggestions";
import { GradientEditor } from "./ui/gradient-editor";
import { ResponsiveResize } from "./ui/responsive-resize";
import { SmartSelectPanel } from "./ui/smart-select";
import type { CollabClient } from "./collab";
import { SpatialAudio } from "./spatial-audio";
import { initSpatialAudioPanel, toggleSpatialAudioPanel, closeSpatialAudioPanel, isSpatialAudioPanelOpen } from "./ui/spatial-audio-panel";
import { findSpacingHandles, hitTestSpacingHandle, renderSpacingHandles, type SpacingHandle, findPaddingHandles, hitTestPaddingHandle, renderPaddingHandles, type PaddingHandle } from "./tools/spacing-handles";
import { type CropState, type CropHandle, hitTestCropHandle, getCropCursor, applyCropDrag, renderCropOverlay } from "./tools/image-crop";
import { showLayoutSuggestion, dismissSuggestion } from "./ui/ai-layout-suggest";
import { openSymbolDetachPreview } from "./ui/symbol-detach-preview";
import { ArtboardView } from "./ui/artboard-view";
import { toggleFindReplace, closeFindReplace } from "./ui/find-replace-panel";
import { toggleSearchPanel, closeSearchPanel, isSearchPanelOpen, getSearchHighlightIds, getSearchCurrentId } from "./ui/search-panel";
import { beginStroke, addStrokePoint, finishStroke, isDrawing, tickAnnotations, renderAnnotations, renderAnnotationPalette, removeAnnotationPalette } from "./ui/annotation-brush";
import { toggleSearchFilter, closeSearchFilter, renderSearchFilterDimming } from "./ui/search-filter";
import { toggleRecorderBar } from "./ui/canvas-recorder";
import { toggleSpotlight, closeSpotlight, isSpotlightVisible } from "./ui/spotlight";
import { exportPDF, type PDFExportOptions } from "./ui/pdf-export";
import { setupDiffOverlay } from "./ui/diff-overlay";
import { DevModeOverlay } from "./ui/dev-mode-overlay";
import { WhiteboardMode } from "./ui/whiteboard-mode";
import { initSnapshotPanel } from "./ui/snapshot-panel";
import { togglePerfProfiler, closePerfProfiler, isPerfProfilerOpen } from "./ui/perf-profiler";
import { showNudgeHint } from "./ui/nudge-hint";
import { recordFrameTime, recordNodeRender, renderProfilerHeatmap, profilerState } from "./ui/profiler-panel";
import { openComponentPlayground, closeComponentPlayground, isComponentPlaygroundOpen } from "./ui/component-playground";
import { openVariantMatrix, closeVariantMatrix, isVariantMatrixOpen } from "./ui/variant-matrix";
import { AnnotationHeatmap } from "./ui/annotation-heatmap";
import { addViewBookmark, toggleViewBookmarksPanel, handleBookmarkShortcut, checkUrlViewHash } from "./ui/view-bookmarks";
import { AnnotationBrush } from "./ui/annotation-brush";
import { importFigmaJSON, showFigmaDropOverlay, hideFigmaDropOverlay } from "./ui/figma-import";
import { showImageDropChoice, processAILayout } from "./ui/ai-layout";
import { toggleColorBlindnessPanel, closeCBPanel, setColorBlindnessMode } from "./ui/color-blindness";
import { toggleFocusMode } from "./ui/focus-mode";
import { WebGPURenderer } from "./ui/webgpu-renderer";
import { strToU8, zipSync } from "fflate";

export type ToolType = "select" | "hand" | "rect" | "ellipse" | "text" | "frame" | "section" | "image" | "video" | "pen" | "star" | "polygon" | "slice" | "connector" | "hotspot" | "callout" | "sticky" | "table" | "chart" | "freehand" | "measure" | "annotate" | "eyedropper" | "scale" | "shapeBuilder";

/** Snap threshold in screen pixels */
const SNAP_THRESHOLD_PX = 5;

type SmartSelectionFilterKey = "shape" | "text" | "image" | "locked" | "hidden";

interface SmartSelectionFilterState {
  shape: boolean;
  text: boolean;
  image: boolean;
  locked: boolean;
  hidden: boolean;
}

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
  private _marqueeBaseMode: "crossing" | "contain" = "crossing";
  private _smartSelectionFilters: SmartSelectionFilterState = { shape: true, text: true, image: true, locked: true, hidden: true };
  private _shapeBuilderStroke: { x: number; y: number }[] | null = null;
  private _shapeBuilderTouchedIds: number[] = [];
  private isPanning = false;
  private lastPanX = 0;
  private lastPanY = 0;
  private needsRender = true;
  private rafId = 0;
  private onSelectionChanges: ((ids: number[]) => void)[] = [];
  private onLayersChanges: (() => void)[] = [];
  // Selection history (back/forward)
  private _selHistory: number[][] = [];
  private _selHistoryIdx = -1;
  private _selHistoryNavigating = false;
  private spaceHeld = false;
  private _clipboard: string | null = null;
  private _pasteCount = 0;
  private _nodeLinksVisible = true;

  // Onion skin
  public onionSkin = {
    enabled: false,
    beforeCount: 2,
    afterCount: 2,
    opacity: 0.2,
    clipId: null as number | null,
    currentTime: 0,
  };

  // Grid snapping
  public gridSnapEnabled = false;
  public gridSize = 8;
  public gridStyle: "dots" | "lines" = "dots";
  private _onGridSnapChanges: (() => void)[] = [];

  // Pixel snap (round to integer or 0.5px)
  public pixelSnapEnabled = true;
  public pixelSnapPrecision: 1 | 0.5 = 1; // 1 = integer, 0.5 = half-pixel
  private _onPixelSnapChanges: (() => void)[] = [];

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
  private _penPressureCurve: "linear" | "soft" | "hard" = "linear";
  private _penTaperStart = 0.12;
  private _penTaperEnd = 0.18;

  // Path edit mode state
  private _pathEditMode = false;
  private _pathEditNodeId: number | null = null;
  private _pathEditSelectedPoint: number | null = null;
  private _pathEditDragType: 'anchor' | 'handle_in' | 'handle_out' | null = null;
  private _pathEditDragOffsetX = 0;
  private _pathEditDragOffsetY = 0;

  // Connector tool state
  private _connectorDrag: { startNodeId: number; sx: number; sy: number; ex?: number; ey?: number; endNodeId?: number; startAnchor?: string; endAnchor?: string } | null = null;

  // Prototype hotspot authoring
  private _hotspotTargetNodeId: number | null = null;

  // Anchor point rendering state
  private _anchorHoverNodeId: number = 0;
  private _anchorSnap: { nodeId: number; anchor: string; wx: number; wy: number } | null = null;

  // Freehand drawing state
  private _freehandPathId: number | null = null;
  private _freehandPoints: { x: number; y: number; pressure?: number; timestamp?: number }[] = [];
  private _freehandDrawing = false;
  private _inkShapeRecognition = true;
  private _inkSimplifyTolerance = 2.0;
  private _freehandSmoothingEnabled = true;
  private _freehandSmoothingStrength = 0.3;
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

  // Image crop mode state
  private _imageCropMode = false;
  private _imageCropState: CropState | null = null;
  private _imageCropHandle: CropHandle = null;
  private _imageCropDragging = false;
  private _imageCropLastSceneX = 0;
  private _imageCropLastSceneY = 0;

  // Corner pin interactive handles
  private _cornerPinDragging: { nodeId: number; corner: "tl" | "tr" | "br" | "bl" } | null = null;
  private _booleanPreviewBounds: { x: number; y: number; w: number; h: number; op: string } | null = null;

  // Smart guides state
  private _snapGuides: SnapGuide[] = [];
  private _dropTarget: DropTarget | null = null;

  // Breakpoint indicator for responsive resize preview
  private _breakpointIndicator: { label: string; maxWidth: number; currentWidth: number } | null = null;
  private _breakpointIndicatorTimeout: ReturnType<typeof setTimeout> | null = null;
  private _pointSnapIndicators: PointSnapIndicator[] = [];
  private _constraintPinsOverlay: {
    x: number;
    y: number;
    boxSize: number;
    selectedId: number;
    controls: Array<{ x: number; y: number; w: number; h: number; axis: "h" | "v"; mode: string }>;
  } | null = null;
  private _constraintDebugOverlay: {
    parent: { oldX: number; oldY: number; oldW: number; oldH: number; newX: number; newY: number; newW: number; newH: number };
    items: Array<{
      id: number;
      label: string;
      hMode: string;
      vMode: string;
      old: { x: number; y: number; w: number; h: number };
      next: { x: number; y: number; w: number; h: number };
    }>;
  } | null = null;
  private _measureLines: MeasureLine[] = [];
  private _measureTargetBounds: { x: number; y: number; w: number; h: number } | null = null;
  private _measureDimensionLabels: MeasureDimensionLabel[] = [];
  public measureTool = new MeasureToolState();
  private _altHeld = false;
  private _devMode = false;
  private _devModeOverlay: DevModeOverlay;
  private _devHoverNodeId: number | null = null;
  private _devHoverTimer: ReturnType<typeof setTimeout> | null = null;
  private onSaveCallbacks: (() => void)[] = [];
  private onSaveAsCallbacks: (() => void)[] = [];
  private onOpenCallbacks: (() => void)[] = [];
  private _layoutGridsVisible = true;

  // Rulers & guides
  private _rulers: RulersAPI | null = null;
  private _artboardView: ArtboardView;
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

  // Padding handles (auto-layout padding drag)
  private _paddingHandles: PaddingHandle[] = [];
  private _paddingHovered: PaddingHandle | null = null;
  private _paddingDragging: PaddingHandle | null = null;
  private _paddingDragStart = 0;
  private _paddingDragStartValue = 0;

  // Cursor presence
  private _cursorPresence = new CursorPresence();
  private _cursorDemoCleanup: (() => void) | null = null;

  // Collaboration
  private _collabClient: CollabClient | null = null;
  private _collabIgnoreRemote = false;

  // Spatial audio
  private _spatialAudio = new SpatialAudio();

  // Cursor chat state
  private _chatInputActive = false;
  private _chatInputEl: HTMLInputElement | null = null;
  private _chatInputContainer: HTMLDivElement | null = null;
  private _chatInputCleanup: (() => void) | null = null;
  private _cursorChat = new CursorChat();
  private _lastPointerScreenX = 0;
  private _lastPointerScreenY = 0;
  private _hasPointerScreenPosition = false;
  private _smartPasteHoverFrameId: number | null = null;

  // Responsive auto-layout preview
  private _responsiveResize: ResponsiveResize | null = null;
  private _annotationHeatmap: AnnotationHeatmap | null = null;

  // Throttle selection callbacks during drag
  private selectionDirty = false;
  private selectionThrottleId = 0;

  // Experimental renderer backend
  private _renderBackend: "canvas2d" | "webgpu" = "canvas2d";
  private _webgpuRenderer: WebGPURenderer | null = null;
  private _autoRenderBackendEnabled = true;
  private _autoWebGPUThreshold = 1000;
  private _autoWebGPUNotified = false;

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
    this._artboardView = new ArtboardView(engine);
    this._devModeOverlay = new DevModeOverlay(this);
    this.whiteboardMode = new WhiteboardMode(this);
    this._responsiveResize = new ResponsiveResize(engine, canvas);
    this._annotationHeatmap = new AnnotationHeatmap(this);
    this._responsiveResize.setRenderCallback(() => { this.needsRender = true; });
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

    const preferredBackend = localStorage.getItem("opensketch-renderer-backend");
    if (preferredBackend === "webgpu") {
      this._renderBackend = "webgpu";
    }
    const autoRenderer = localStorage.getItem("opensketch-auto-renderer");
    if (autoRenderer === "off") this._autoRenderBackendEnabled = false;
    this.initWebGPURenderer();

    this.startLoop();
    checkUrlViewHash(this);
  }

  private setupCanvas() {
    const resize = () => {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;
      this.ctx.scale(dpr, dpr);
      this.engine.resize(rect.width, rect.height);
      this._webgpuRenderer?.resize(this.canvas.width, this.canvas.height);
      this.needsRender = true;
    };
    resize();
    window.addEventListener("resize", resize);
  }

  private async initWebGPURenderer() {
    if (typeof window === "undefined") return;
    if (!(navigator as any).gpu) {
      if (this._renderBackend === "webgpu") this._renderBackend = "canvas2d";
      return;
    }
    const renderer = new WebGPURenderer();
    const ok = await renderer.init();
    if (!ok) {
      if (this._renderBackend === "webgpu") this._renderBackend = "canvas2d";
      return;
    }
    renderer.resize(this.canvas.width, this.canvas.height);
    this._webgpuRenderer = renderer;
    this.needsRender = true;
  }

  setRenderBackend(mode: "canvas2d" | "webgpu") {
    if (mode === "webgpu" && !this._webgpuRenderer?.ready) {
      this._renderBackend = "canvas2d";
      localStorage.setItem("opensketch-renderer-backend", "canvas2d");
      this.needsRender = true;
      return;
    }
    this._renderBackend = mode;
    localStorage.setItem("opensketch-renderer-backend", mode);
    this.needsRender = true;
  }

  getRenderBackend() {
    return this._renderBackend;
  }

  isWebGPUAvailable() {
    return !!this._webgpuRenderer?.ready;
  }

  setAutoRenderBackend(enabled: boolean) {
    this._autoRenderBackendEnabled = !!enabled;
    localStorage.setItem("opensketch-auto-renderer", enabled ? "on" : "off");
  }

  isAutoRenderBackendEnabled() {
    return this._autoRenderBackendEnabled;
  }

  private maybeAutoSwitchRenderBackend(nodeCount: number) {
    if (!this._autoRenderBackendEnabled) return;
    if (!this._webgpuRenderer?.ready) return;
    if (this._renderBackend === "webgpu") return;
    if (nodeCount < this._autoWebGPUThreshold) return;
    this._renderBackend = "webgpu";
    localStorage.setItem("opensketch-renderer-backend", "webgpu");
    if (!this._autoWebGPUNotified) {
      this._autoWebGPUNotified = true;
      this.showToast(`Large scene detected (${nodeCount.toLocaleString()} nodes) → switched to WebGPU renderer`, 2600);
    }
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
      // Selection history: Alt+[ back, Alt+] forward
      if (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        if (e.code === "BracketLeft") { e.preventDefault(); this.selectionBack(); return; }
        if (e.code === "BracketRight") { e.preventDefault(); this.selectionForward(); return; }
      }
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

      // Responsive resize mode keyboard
      if (this._responsiveResize?.isActive && this._responsiveResize.handleKeydown(e.key)) {
        e.preventDefault();
        this.needsRender = true;
        return;
      }

      // Smart spacing handles shortcuts (when hovering a spacing handle)
      if (this.currentTool === "select" && this._spacingHovered && !e.metaKey && !e.ctrlKey) {
        if (e.key === "Enter") {
          e.preventDefault();
          this.promptSpacingValue(this._spacingHovered);
          return;
        }
        if (!e.shiftKey && !e.altKey && (e.key === "e" || e.key === "E")) {
          e.preventDefault();
          this.applyEqualSpacingForSelection(this._spacingHovered);
          return;
        }
        if (!e.shiftKey && !e.altKey && (e.key === "a" || e.key === "A")) {
          e.preventDefault();
          this.suggestConvertSelectionToAutoLayout(this._spacingHovered);
          return;
        }
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
        // Cmd+Shift+S → Save As (always new file)
        if (e.shiftKey) {
          this.onSaveAsCallbacks.forEach(fn => fn());
        } else {
          this.onSaveCallbacks.forEach(fn => fn());
        }
        return;
      }
      // Open file: Cmd+O
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === "o" || e.key === "O")) {
        e.preventDefault();
        this.onOpenCallbacks.forEach(fn => fn());
        return;
      }
      // Node search spotlight
      if (_sm.matches(e, "panel.spotlight")) {
        e.preventDefault();
        toggleSpotlight(this);
        return;
      }
      // Canvas Search (Cmd+F)
      if (_sm.matches(e, "panel.findReplace")) {
        e.preventDefault();
        toggleSearchPanel(this);
        return;
      }
      // Find & Replace panel (Cmd+H)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        toggleFindReplace(this);
        return;
      }
      // Search & Filter (Cmd+Shift+F)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "f" || e.key === "F") && !e.altKey) {
        e.preventDefault();
        toggleSearchFilter(this);
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
      // Paste in Place (Cmd+Shift+V) — must check before edit.paste
      if (_sm.matches(e, "edit.pasteInPlace")) {
        e.preventDefault();
        this.pasteNodesInPlace();
        return;
      }
      // Paste
      if (_sm.matches(e, "edit.paste")) {
        e.preventDefault();
        // If a table is selected, try CSV/TSV paste
        const sel = Array.from(this.engine.get_selection()).map(Number);
        if (sel.length === 1) {
          const nj = this.engine.get_node_json(BigInt(sel[0]));
          if (nj) {
            try {
              const nd = JSON.parse(nj);
              if (typeof nd.kind === "object" && nd.kind.Table) {
                navigator.clipboard.readText().then(text => {
                  if (text && (text.includes("\t") || text.includes(","))) {
                    // Convert TSV to CSV for the engine
                    const csv = text.includes("\t") ? text.split("\n").map(l => l.split("\t").map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n") : text;
                    this.engine.push_undo();
                    this.engine.table_import_csv(BigInt(sel[0]), csv);
                    this.requestRender();
                    return;
                  }
                  this.pasteNodes();
                }).catch(() => this.pasteNodes());
                return;
              }
            } catch {}
          }
        }
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
      // Detach instance (Cmd+Alt+B)
      if (e.key === "b" && (e.metaKey || e.ctrlKey) && e.altKey && !e.shiftKey) {
        e.preventDefault();
        this.detachSelectedInstance();
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
      // View Bookmarks panel: Cmd+Shift+K
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "k" || e.key === "K") && !e.altKey) {
        e.preventDefault();
        toggleViewBookmarksPanel(this, this.canvas.parentElement!);
        return;
      }
      // Save current view bookmark: Cmd+Alt+B
      if ((e.metaKey || e.ctrlKey) && e.altKey && (e.key === "b" || e.key === "B") && !e.shiftKey) {
        e.preventDefault();
        addViewBookmark(this);
        return;
      }
      // Quick jump to view bookmarks: Ctrl+1-9
      if ((e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) && e.key >= "1" && e.key <= "9") {
        if (handleBookmarkShortcut(this, e.key)) {
          e.preventDefault();
          return;
        }
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
      // Artboard View: Cmd+Shift+A or Cmd+Alt+A
      if (((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "a" || e.key === "A")) ||
          ((e.metaKey || e.ctrlKey) && e.altKey && !e.shiftKey && (e.key === "a" || e.key === "A" || e.key === "å"))) {
        e.preventDefault();
        this.toggleArtboardView();
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

      // Ctrl/Cmd+Shift+G (with Alt): AI image generation
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.altKey && (e.key === "g" || e.key === "G")) {
        e.preventDefault();
        this.openAIImageGen();
        return;
      }

      // Ctrl/Cmd+Shift+T: tidy up
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        this.tidyUpSelection();
        return;
      }

      // Ctrl/Cmd+Alt+G: wrap selection in frame (Figma-style)
      if ((e.metaKey || e.ctrlKey) && e.altKey && (e.key === "g" || e.key === "G")) {
        e.preventDefault();
        this.wrapSelectionInFrame();
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

      // Ctrl/Cmd+Shift+F: Toggle FPS Counter
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        this.toggleFpsCounter();
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

      // Ctrl/Cmd+' or Ctrl/Cmd+Shift+G: Toggle grid snapping
      if ((e.metaKey || e.ctrlKey) && (e.key === "'" || e.key === "'")) {
        e.preventDefault();
        this.toggleGridSnap();
        return;
      }

      // Ctrl/Cmd+Shift+M: Component Variant Matrix
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "m" || e.key === "M") && !e.altKey) {
        e.preventDefault();
        if (isVariantMatrixOpen()) {
          closeVariantMatrix();
        } else {
          // Use first selected instance's comp_id, or prompt to pick
          const sel = this.getSelection();
          let compId = 0;
          if (sel.length > 0) {
            try {
              const nj = this.engine.get_node_json(BigInt(sel[0]));
              if (nj) {
                const node = JSON.parse(nj);
                if (node.kind && typeof node.kind === 'object' && node.kind.Instance) {
                  compId = node.kind.Instance.component_id || 0;
                }
              }
            } catch {}
          }
          if (compId > 0) {
            openVariantMatrix(this, compId);
          } else {
            // Try to get first component from store
            try {
              const compsJson = this.engine.list_components();
              const comps = JSON.parse(compsJson);
              if (comps.length > 0) {
                openVariantMatrix(this, comps[0].id);
              }
            } catch {}
          }
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

      // Ctrl/Cmd+Alt+H: annotation heatmap toggle
      if ((e.metaKey || e.ctrlKey) && e.altKey && (e.key === "h" || e.key === "˙")) {
        e.preventDefault();
        this._annotationHeatmap?.toggle();
        return;
      }

      // Ctrl/Cmd+.: Focus mode (hide all panels)
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        e.preventDefault();
        toggleFocusMode(this);
        return;
      }

      // Ctrl/Cmd+Alt+V: color blindness simulation panel
      if ((e.metaKey || e.ctrlKey) && e.altKey && (e.key === "v" || e.key === "√")) {
        e.preventDefault();
        toggleColorBlindnessPanel();
        return;
      }

      // Cmd+Shift+B: breakpoints multi-viewport preview
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        if (isBreakpointsPreviewOpen()) {
          closeBreakpointsPreview();
        } else {
          this.openBreakpointsPreview();
        }
        return;
      }

      // Ctrl/Cmd+Alt+R: responsive resize preview (interactive on-canvas)
      if ((e.metaKey || e.ctrlKey) && e.altKey && (e.key === "r" || e.key === "®")) {
        e.preventDefault();
        if (this._responsiveResize?.isActive) {
          this._responsiveResize.deactivate(false);
        } else {
          this._responsiveResize?.activate();
        }
        this.needsRender = true;
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
          // Show nudge hint overlay
          try {
            const first = sel[0];
            const nx = Number(this.engine.get_x(BigInt(first)));
            const ny = Number(this.engine.get_y(BigInt(first)));
            const nw = Number(this.engine.get_width(BigInt(first)));
            const nh = Number(this.engine.get_height(BigInt(first)));
            const cx = nx + nw / 2;
            const cy = ny + nh / 2;
            const sx = (cx - this.panX) * this.zoom + this.canvas.width / (2 * this.dpr);
            const sy = (cy - this.panY) * this.zoom + this.canvas.height / (2 * this.dpr);
            showNudgeHint({ screenX: sx, screenY: sy, nodeX: nx, nodeY: ny, dx, dy, nodeW: nw, nodeH: nh });
          } catch (_) { /* ignore */ }
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
      else if (e.key === "V" && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) { this.setTool("video"); return; }
      else if (_sm.matches(e, "tool.pen")) this.setTool("pen");
      else if (_sm.matches(e, "tool.star")) this.setTool("star");
      else if (_sm.matches(e, "tool.polygon")) this.setTool("polygon");
      else if (_sm.matches(e, "tool.sticky")) this.setTool("sticky");
      else if (_sm.matches(e, "tool.freehand")) this.setTool("freehand");
      else if (_sm.matches(e, "tool.shapeBuilder")) this.setTool("shapeBuilder");
      else if (_sm.matches(e, "whiteboard.toggle")) { (window as any).__toggleWhiteboard?.(); }
      else if (_sm.matches(e, "whiteboard.timer")) { (window as any).__toggleTimer?.(); }
      else if (_sm.matches(e, "tool.table")) this.setTool("table");
      else if (_sm.matches(e, "tool.slice")) this.setTool("slice");
      else if (_sm.matches(e, "tool.connector")) this.setTool("connector");
      else if (_sm.matches(e, "tool.hotspot")) this.setTool("hotspot");
      else if (_sm.matches(e, "tool.callout")) this.setTool("callout");
      else if (e.key === "i" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) this.setTool("eyedropper");
      else if (e.key === "m" && !e.metaKey && !e.ctrlKey && !e.altKey) this.setTool("measure");
      else if (e.key === "a" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) this.setTool("annotate");
      else if (e.key === "k" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) this.setTool("scale");
      else if (_sm.matches(e, "misc.selectionNetMode")) {
        this._marqueeBaseMode = this._marqueeBaseMode === "crossing" ? "contain" : "crossing";
        this.needsRender = true;
      }
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
        // Delete selected measure line
        if (this.currentTool === "measure" && this.measureTool.selectedMeasureId != null) {
          (this.engine as any).remove_measure(BigInt(this.measureTool.selectedMeasureId));
          this.measureTool.selectedMeasureId = null;
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
        if (isSearchPanelOpen()) {
          closeSearchPanel();
          return;
        }
        if (this._imageCropMode) {
          this.exitImageCropMode(true); // cancel
          return;
        }
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
      if (e.key === "Enter" && this._imageCropMode) {
        this.exitImageCropMode(false); // confirm
        return;
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
        this._measureDimensionLabels = [];
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

    // Artboard view: click on a page to switch to it
    if (this._artboardView.enabled && !this.spaceHeld && this.currentTool !== "hand") {
      const pageId = this.artboardViewHitTest(x, y);
      if (pageId !== null) {
        const currentId = Number(this.engine.get_active_page_id());
        if (pageId !== currentId) {
          this.engine.set_active_page(BigInt(pageId));
          this.needsRender = true;
          // Page changed — UI will update on next render
        }
        // Don't consume — allow normal interactions within the active page
      }
    }

    // Space + click = pan
    if (this.spaceHeld || this.currentTool === "hand") {
      this.isPanning = true;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      this.canvas.style.cursor = "grabbing";
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }

    // Constraints visual pins: click-to-edit quick constraints (single-select)
    if (this.currentTool === "select" && this._constraintPinsOverlay) {
      const { x: ox, y: oy, boxSize, selectedId, controls } = this._constraintPinsOverlay;
      const maxCtrlY = controls.length > 0 ? Math.max(...controls.map((c) => c.y + c.h)) : oy + boxSize;
      if (x < ox || x > ox + boxSize || y < oy || y > maxCtrlY) {
        // outside constraint pin overlay
      } else if (x >= ox && x <= ox + boxSize && y >= oy && y <= oy + boxSize) {
        const col = Math.max(0, Math.min(2, Math.floor((x - (ox + 3)) / 12)));
        const row = Math.max(0, Math.min(2, Math.floor((y - (oy + 3)) / 12)));

        let constraints: { horizontal?: string; vertical?: string } = {};
        try {
          constraints = JSON.parse(this.engine.get_constraints(BigInt(selectedId)) || "{}");
        } catch {
          constraints = {};
        }

        const currentH = constraints.horizontal || "left";
        const currentV = constraints.vertical || "top";

        const applyHorizontal = (mode: string): string => {
          if (mode === "left") {
            if (currentH === "right") return "leftAndRight";
            if (currentH === "leftAndRight") return "right";
            return "left";
          }
          if (mode === "right") {
            if (currentH === "left") return "leftAndRight";
            if (currentH === "leftAndRight") return "left";
            return "right";
          }
          if (mode === "center") return "center";
          if (mode === "scale") return "scale";
          return currentH;
        };

        const applyVertical = (mode: string): string => {
          if (mode === "top") {
            if (currentV === "bottom") return "topAndBottom";
            if (currentV === "topAndBottom") return "bottom";
            return "top";
          }
          if (mode === "bottom") {
            if (currentV === "top") return "topAndBottom";
            if (currentV === "topAndBottom") return "top";
            return "bottom";
          }
          if (mode === "center") return "center";
          if (mode === "scale") return "scale";
          return currentV;
        };

        const hMode = col === 0 ? "left" : col === 1 ? "center" : "right";
        const vMode = row === 0 ? "top" : row === 1 ? "center" : "bottom";

        this.engine.push_undo();
        this.engine.set_constraints(BigInt(selectedId), applyHorizontal(hMode), applyVertical(vMode));
        this.needsRender = true;
        this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
        this.canvas.setPointerCapture(e.pointerId);
        return;
      }

      for (const ctrl of controls) {
        if (x >= ctrl.x && x <= ctrl.x + ctrl.w && y >= ctrl.y && y <= ctrl.y + ctrl.h) {
          let constraints: { horizontal?: string; vertical?: string } = {};
          try {
            constraints = JSON.parse(this.engine.get_constraints(BigInt(selectedId)) || "{}");
          } catch {
            constraints = {};
          }

          const currentH = constraints.horizontal || "left";
          const currentV = constraints.vertical || "top";
          let nextH = currentH;
          let nextV = currentV;

          if (ctrl.axis === "h") {
            if (ctrl.mode === "left") {
              nextH = currentH === "right" ? "leftAndRight" : currentH === "leftAndRight" ? "right" : "left";
            } else if (ctrl.mode === "right") {
              nextH = currentH === "left" ? "leftAndRight" : currentH === "leftAndRight" ? "left" : "right";
            } else if (ctrl.mode === "center") {
              nextH = "center";
            } else if (ctrl.mode === "scale") {
              nextH = "scale";
            }
          } else {
            if (ctrl.mode === "top") {
              nextV = currentV === "bottom" ? "topAndBottom" : currentV === "topAndBottom" ? "bottom" : "top";
            } else if (ctrl.mode === "bottom") {
              nextV = currentV === "top" ? "topAndBottom" : currentV === "topAndBottom" ? "top" : "bottom";
            } else if (ctrl.mode === "center") {
              nextV = "center";
            } else if (ctrl.mode === "scale") {
              nextV = "scale";
            }
          }

          this.engine.push_undo();
          this.engine.set_constraints(BigInt(selectedId), nextH, nextV);
          this.needsRender = true;
          this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
          this.canvas.setPointerCapture(e.pointerId);
          return;
        }
      }
    }

    // Image crop mode: handle crop drag
    if (this._imageCropMode && this._imageCropState) {
      const zoom = this.engine.get_zoom();
      const panX = this.engine.get_pan_x();
      const panY = this.engine.get_pan_y();
      const handle = hitTestCropHandle(this._imageCropState, x, y, zoom, panX, panY);
      if (handle) {
        this._imageCropHandle = handle;
        this._imageCropDragging = true;
        this._imageCropLastSceneX = this.engine.screen_to_scene_x(x, y);
        this._imageCropLastSceneY = this.engine.screen_to_scene_y(x, y);
        this.canvas.style.cursor = getCropCursor(handle);
        this.canvas.setPointerCapture(e.pointerId);
        return;
      }
      // Click outside crop area → confirm and exit
      this.exitImageCropMode(false);
      return;
    }

    // Corner pin handle drag (Image nodes with corner pin)
    if (this.currentTool === "select") {
      const cpHit = this.hitTestCornerPinHandle(x, y);
      if (cpHit) {
        this.engine.push_undo();
        this._cornerPinDragging = cpHit;
        this.canvas.style.cursor = "grabbing";
        this.canvas.setPointerCapture(e.pointerId);
        return;
      }
    }

    // Responsive resize mode: handle edge drag
    if (this._responsiveResize?.isActive) {
      if (this._responsiveResize.onPointerDown(x, y)) {
        this.canvas.setPointerCapture(e.pointerId);
        return;
      }
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

    // Padding handle drag
    if (this.currentTool === "select" && this._paddingHandles.length > 0) {
      const phit = hitTestPaddingHandle(this._paddingHandles, x, y);
      if (phit) {
        this.engine.push_undo();
        this._paddingDragging = phit;
        this._paddingDragStartValue = phit.value;
        this._paddingDragStart = (phit.side === "left" || phit.side === "right") ? x : y;
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

    if (this.currentTool === "shapeBuilder") {
      this._shapeBuilderStroke = [{ x: e.offsetX, y: e.offsetY }];
      this._shapeBuilderTouchedIds = [];
      this.canvas.setPointerCapture(e.pointerId);
      this.needsRender = true;
      return;
    }

    if (this.currentTool === "select" || this.currentTool === "scale") {
      const handle = this.engine.hit_test_handle(x, y);
      if (handle >= 0) {
        const sel = this.engine.get_selection();
        if (sel.length > 0) {
          const nodeJson = this.engine.get_node_json(sel[0]!);
          if (nodeJson) {
            const node = JSON.parse(nodeJson);
            // Prevent resize of locked nodes
            if (node.locked) {
              // Skip — don't start resize drag
            } else {
            this.engine.push_undo();
            this.drag = {
              startX: x, startY: y, currentX: x, currentY: y,
              nodeId: sel[0]!, handleIndex: handle,
              originalX: node.x, originalY: node.y,
              originalW: node.width, originalH: node.height,
            };
            this.canvas.setPointerCapture(e.pointerId);
            return;
          } // end else (not locked)
          }
        }
      }

      // Text flow linking mode: click on a text node to link
      if ((this as any)._textFlowLinkFrom != null) {
        const fromId = (this as any)._textFlowLinkFrom as number;
        (this as any)._textFlowLinkFrom = null;
        const targetHit = this.engine.hit_test(x, y);
        if (targetHit != null) {
          const targetId = Number(targetHit);
          if (targetId !== fromId) {
            this.engine.link_text_flow(BigInt(fromId), BigInt(targetId));
            this.needsRender = true;
            this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
            this.canvas.setPointerCapture(e.pointerId);
            return;
          }
        }
      }

      // Cmd+click (Meta on Mac, Ctrl on others) → deep select into groups/frames
      const isMeta = e.metaKey || (e.ctrlKey && !navigator.platform.includes("Mac"));
      const hit = this.getFilteredHitAtScreenPoint(x, y, isMeta);
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
        // Check if node is locked — allow selection but prevent move
        let hitLocked = false;
        try {
          const hdata = JSON.parse(this.engine.get_node_json(BigInt(Number(hit))));
          hitLocked = !!hdata.locked;
        } catch {}
        if (!hitLocked) {
          this.engine.push_undo();
          this.drag = {
            startX: x, startY: y, currentX: x, currentY: y,
            nodeId: hit,
          };
        }
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
        const progress = pointIdx <= 0 ? 0 : pointIdx / Math.max(1, pointIdx + 1);
        const width = this.pressureWidth(baseWidth, e.pressure, progress);
        this.engine.path_set_point_stroke_width(BigInt(this._penPathId), pointIdx, width);
      }

      this._penDragging = true;
      this._penDragStartX = sx;
      this._penDragStartY = sy;
      this.needsRender = true;
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }

    if (this.currentTool === "eyedropper") {
      // Read pixel color from canvas at click position
      const dpr = window.devicePixelRatio || 1;
      const pixel = this.ctx.getImageData(x * dpr, y * dpr, 1, 1).data;
      const r = pixel[0]! / 255;
      const g = pixel[1]! / 255;
      const b = pixel[2]! / 255;
      const a = pixel[3]! / 255;
      const hex = `#${(pixel[0]! << 16 | pixel[1]! << 8 | pixel[2]!).toString(16).padStart(6, "0")}`;

      // Apply to selected nodes
      const sel = this.engine.get_selection();
      const ids: number[] = sel ? JSON.parse(sel).map(Number) : [];
      if (ids.length > 0) {
        this.engine.push_undo();
        for (const id of ids) {
          this.engine.set_fill(BigInt(id), r, g, b, a);
        }
        this.needsRender = true;
        this.fireSelectionNow(ids);
      }

      // Show color toast
      this._showEyedropperToast(hex);

      // Return to select tool after picking
      this.setTool("select");
      return;
    }

    if (this.currentTool === "annotate") {
      const sx = this.engine.screen_to_scene_x(x, y);
      const sy = this.engine.screen_to_scene_y(x, y);
      beginStroke(sx, sy);
      this.canvas.setPointerCapture(e.pointerId);
      this.needsRender = true;
      return;
    }

    if (this.currentTool === "freehand") {
      const sx = this.engine.screen_to_scene_x(x, y);
      const sy = this.engine.screen_to_scene_y(x, y);
      this.engine.push_undo();
      const pathId = Number(this.engine.add_path(sx, sy));
      this.engine.path_add_point(pathId, sx, sy);
      this._freehandPathId = pathId;
      const pressure = e.pressure > 0 ? e.pressure : 0.5;
      this._freehandPoints = [{ x: sx, y: sy, pressure, timestamp: performance.now() }];
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
      // Snap to anchor
      const threshold = 12 / this.engine.get_zoom();
      const snapJson = this.engine.snap_to_anchor(sx, sy, threshold, BigInt(0));
      const snap = snapJson !== "null" ? JSON.parse(snapJson) : null;
      if (snap) {
        this._connectorDrag = { startNodeId: snap.node_id, sx: snap.world_x, sy: snap.world_y, startAnchor: snap.anchor };
      } else {
        this._connectorDrag = { startNodeId, sx, sy };
      }
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }

    if (this.currentTool === "measure") {
      const sx = this.engine.screen_to_scene_x(x, y);
      const sy = this.engine.screen_to_scene_y(x, y);
      // Check if clicking on existing measure line
      const hitId = hitTestMeasureLine(this, sx, sy, this.engine.get_zoom());
      if (hitId != null) {
        this.measureTool.selectedMeasureId = hitId;
        this.needsRender = true;
        return;
      }
      this.measureTool.selectedMeasureId = null;
      this.measureTool.onPointerDown(this, sx, sy, this.engine.get_zoom());
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }

    if (["rect", "ellipse", "text", "frame", "section", "image", "video", "slice", "hotspot"].includes(this.currentTool)) {
      const sx = this.engine.screen_to_scene_x(x, y);
      const sy = this.engine.screen_to_scene_y(x, y);
      this.drag = { startX: sx, startY: sy, currentX: sx, currentY: sy };
      this.canvas.setPointerCapture(e.pointerId);
    }
  }

  private onPointerMove(e: PointerEvent) {
    this._lastPointerScreenX = e.offsetX;
    this._lastPointerScreenY = e.offsetY;
    this._hasPointerScreenPosition = true;
    this._smartPasteHoverFrameId = this.resolveAutoLayoutFrameFromScreenPoint(e.offsetX, e.offsetY);
    if (this.isPanning) {
      const dx = e.clientX - this.lastPanX;
      const dy = e.clientY - this.lastPanY;
      this.engine.pan(dx, dy);
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      this.needsRender = true;
      return;
    }

    // Image crop mode: drag
    if (this._imageCropMode && this._imageCropState) {
      const zoom = this.engine.get_zoom();
      const panX = this.engine.get_pan_x();
      const panY = this.engine.get_pan_y();
      if (this._imageCropDragging && this._imageCropHandle) {
        const sx = this.engine.screen_to_scene_x(e.offsetX, e.offsetY);
        const sy = this.engine.screen_to_scene_y(e.offsetX, e.offsetY);
        const dx = sx - this._imageCropLastSceneX;
        const dy = sy - this._imageCropLastSceneY;
        applyCropDrag(this._imageCropState, this._imageCropHandle, dx, dy, e.shiftKey);
        this._imageCropLastSceneX = sx;
        this._imageCropLastSceneY = sy;
        this.needsRender = true;
        return;
      }
      // Hover cursor
      const handle = hitTestCropHandle(this._imageCropState, e.offsetX, e.offsetY, zoom, panX, panY);
      this.canvas.style.cursor = getCropCursor(handle);
      return;
    }

    // Corner pin handle dragging / hover
    if (this._cornerPinDragging) {
      this.updateCornerPinFromPointer(this._cornerPinDragging.nodeId, this._cornerPinDragging.corner, e.offsetX, e.offsetY);
      this.needsRender = true;
      return;
    }
    if (this.currentTool === "select" && !this.engine.is_dragging()) {
      const cpHover = this.hitTestCornerPinHandle(e.offsetX, e.offsetY);
      if (cpHover) {
        this.canvas.style.cursor = "grab";
        return;
      }
    }

    // Responsive resize dragging
    if (this._responsiveResize?.isActive) {
      if (this._responsiveResize.onPointerMove(e.offsetX, e.offsetY)) return;
      // Update cursor
      const cursor = this._responsiveResize.getCursor(e.offsetX, e.offsetY);
      if (cursor) { this.canvas.style.cursor = cursor; return; }
    }

    // Spacing handle dragging
    if (this._spacingDragging) {
      const zoom = this.engine.get_zoom();
      const delta = this._spacingDragging.direction === "row"
        ? (e.offsetX - this._spacingDragStartX) / zoom
        : (e.offsetY - this._spacingDragStartY) / zoom;
      const newGap = Math.round(this._spacingDragStartGap + delta);

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

    // Padding handle dragging
    if (this._paddingDragging) {
      const zoom = this.engine.get_zoom();
      const isH = this._paddingDragging.side === "left" || this._paddingDragging.side === "right";
      const pos = isH ? e.offsetX : e.offsetY;
      const sign = (this._paddingDragging.side === "right" || this._paddingDragging.side === "bottom") ? -1 : 1;
      const delta = (pos - this._paddingDragStart) * sign / zoom;
      const newVal = Math.max(0, Math.round(this._paddingDragStartValue + delta));
      try {
        const side = this._paddingDragging.side;
        const pid = BigInt(this._paddingDragging.parentId);
        if (side === "top") this.engine.set_layout_padding_top(pid, newVal);
        else if (side === "bottom") this.engine.set_layout_padding_bottom(pid, newVal);
        else if (side === "left") this.engine.set_layout_padding_left(pid, newVal);
        else this.engine.set_layout_padding_right(pid, newVal);
        this.engine.compute_layout();
      } catch { /* ignore */ }
      this._paddingHandles = findPaddingHandles(this.engine);
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

    // Padding handle hover
    if (this.currentTool === "select" && this._paddingHandles.length > 0 && !this.engine.is_dragging()) {
      const prev = this._paddingHovered;
      this._paddingHovered = hitTestPaddingHandle(this._paddingHandles, e.offsetX, e.offsetY);
      if (this._paddingHovered) {
        const isH = this._paddingHovered.side === "left" || this._paddingHovered.side === "right";
        this.canvas.style.cursor = isH ? "col-resize" : "row-resize";
        if (prev !== this._paddingHovered) this.needsRender = true;
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
          const progress = pointCount <= 1 ? 0 : (pointCount - 1) / Math.max(1, pointCount - 1);
          const width = this.pressureWidth(baseWidth, e.pressure, progress);
          this.engine.path_set_point_stroke_width(BigInt(this._penPathId), pointCount - 1, width);
        }
      }
      this.needsRender = true;
      return;
    }

    // Annotation brush: add points during drag
    if (isDrawing()) {
      const sx = this.engine.screen_to_scene_x(e.offsetX, e.offsetY);
      const sy = this.engine.screen_to_scene_y(e.offsetX, e.offsetY);
      addStrokePoint(sx, sy);
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
        const pressure = e.pressure > 0 ? e.pressure : 0.5;
        this._freehandPoints.push({ x: sx, y: sy, pressure, timestamp: performance.now() });
        this.engine.path_add_point(this._freehandPathId, sx, sy);
        this.needsRender = true;
      }
      return;
    }

    // Measure tool: update preview during drag
    if (this.currentTool === "measure" && this.measureTool.dragging) {
      const sx = this.engine.screen_to_scene_x(e.offsetX, e.offsetY);
      const sy = this.engine.screen_to_scene_y(e.offsetX, e.offsetY);
      this.measureTool.onPointerMove(this, sx, sy, this.engine.get_zoom());
      this.needsRender = true;
      return;
    }

    // Connector tool: update preview during drag
    if (this._connectorDrag) {
      const scX = this.engine.screen_to_scene_x(e.offsetX, e.offsetY);
      const scY = this.engine.screen_to_scene_y(e.offsetX, e.offsetY);
      // Snap to anchor
      const threshold = 12 / this.engine.get_zoom();
      const excludeId = this._connectorDrag.startNodeId || 0;
      const snapJson = this.engine.snap_to_anchor(scX, scY, threshold, BigInt(excludeId));
      const snap = snapJson !== "null" ? JSON.parse(snapJson) : null;
      if (snap) {
        this._connectorDrag.ex = snap.world_x;
        this._connectorDrag.ey = snap.world_y;
        this._connectorDrag.endNodeId = snap.node_id;
        this._connectorDrag.endAnchor = snap.anchor;
        this._anchorSnap = snap;
      } else {
        this._connectorDrag.ex = scX;
        this._connectorDrag.ey = scY;
        const hit = this.engine.hit_test(e.offsetX, e.offsetY);
        this._connectorDrag.endNodeId = hit != null ? Number(hit) : 0;
        this._connectorDrag.endAnchor = undefined;
        this._anchorSnap = null;
      }
      this.needsRender = true;
      return;
    }

    // Show anchor points when hovering with connector tool
    if (this.currentTool === "connector" && !this._connectorDrag) {
      const hit = this.engine.hit_test(e.offsetX, e.offsetY);
      const hitId = hit != null ? Number(hit) : 0;
      if (hitId !== this._anchorHoverNodeId) {
        this._anchorHoverNodeId = hitId;
        this.needsRender = true;
      }
    } else if (!this._connectorDrag) {
      if (this._anchorHoverNodeId !== 0) {
        this._anchorHoverNodeId = 0;
        this.needsRender = true;
      }
    }

    if (this._shapeBuilderStroke) {
      const last = this._shapeBuilderStroke[this._shapeBuilderStroke.length - 1];
      const nx = e.offsetX;
      const ny = e.offsetY;
      if (!last || Math.hypot(nx - last.x, ny - last.y) > 2) {
        this._shapeBuilderStroke.push({ x: nx, y: ny });
      }
      this._shapeBuilderTouchedIds = this.computeShapeBuilderTouchedIds(this._shapeBuilderStroke);
      this.needsRender = true;
      return;
    }

    if (this.marquee) {
      this.marquee.currentX = e.offsetX;
      this.marquee.currentY = e.offsetY;
      // Live preview: smart marquee selection (crossing/contain)
      const mx = Math.min(this.marquee.startX, this.marquee.currentX);
      const my = Math.min(this.marquee.startY, this.marquee.currentY);
      const mx2 = Math.max(this.marquee.startX, this.marquee.currentX);
      const my2 = Math.max(this.marquee.startY, this.marquee.currentY);
      if (Math.abs(mx2 - mx) > 2 || Math.abs(my2 - my) > 2) {
        const useContain = e.altKey ? this._marqueeBaseMode !== "contain" : this._marqueeBaseMode === "contain";
        const ids = this.computeMarqueeSelection(mx, my, mx2, my2, useContain);
        this.engine.deselect_all();
        for (const id of ids) this.engine.add_to_selection(id);
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
    } else if (this._measureLines.length > 0 || this._measureDimensionLabels.length > 0) {
      this._measureLines = [];
      this._measureTargetBounds = null;
      this._measureDimensionLabels = [];
      this.needsRender = true;
    }

    if (!this.drag) {
      this._constraintDebugOverlay = null;
      return;
    }
    const x = e.offsetX;
    const y = e.offsetY;

    if ((this.currentTool === "select" || this.currentTool === "scale") && this.drag.nodeId != null) {
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
          // Content-aware resize:
          // - Image nodes: auto-lock aspect ratio (unless Alt held)
          // - Shift: constrain aspect ratio for any node
          // - Alt+Shift: proportional scale (scales font size, corner radius, strokes, etc.)
          const isImage = this.engine.is_image_node(Number(this.drag.nodeId));
          const shiftHeld = e.shiftKey;
          const altHeld = e.altKey;
          const constrainAspect = (isImage && !altHeld) || shiftHeld || this.currentTool === "scale";

          if (constrainAspect && ow > 0 && oh > 0) {
            const aspect = ow / oh;
            // Determine which dimension dominates based on drag direction
            const dw = Math.abs(nw - ow);
            const dh = Math.abs(nh - oh);
            if (dw >= dh) {
              nh = nw / aspect;
            } else {
              nw = nh * aspect;
            }
            // Re-anchor position for constrained resize
            switch (this.drag.handleIndex) {
              case 0: nx = ox + ow - nw; ny = oy + oh - nh; break;
              case 1: ny = oy + oh - nh; break;
              case 2: nx = ox + ow - nw; break;
              case 3: break;
            }
          }

          // Grid snap for resize
          if (this.gridSnapEnabled && this.gridSize > 0) {
            const gs = this.gridSize;
            nx = Math.round(nx / gs) * gs;
            ny = Math.round(ny / gs) * gs;
            nw = Math.max(gs, Math.round(nw / gs) * gs);
            nh = Math.max(gs, Math.round(nh / gs) * gs);
          }

          // Pixel snap for resize
          if (this.pixelSnapEnabled && !(this.gridSnapEnabled && this.gridSize > 0)) {
            nx = this.pixelSnap(nx);
            ny = this.pixelSnap(ny);
            nw = this.pixelSnapSize(nw);
            nh = this.pixelSnapSize(nh);
          }

          if (nw > 0 && nh > 0) {
            this.engine.set_node_position(this.drag.nodeId, nx, ny);

            // Alt+Shift or Scale tool: proportional scale (scale all visual properties)
            if ((this.currentTool === "scale" || (altHeld && shiftHeld)) && ow > 0 && oh > 0) {
              const scaleX = nw / ow;
              const scaleY = nh / oh;
              // Reset size first (scale_node_proportional will set it)
              this.engine.set_node_position(this.drag.nodeId, nx, ny);
              // Restore original size then scale proportionally
              this.engine.resize_node_with_layout(this.drag.nodeId, ow, oh);
              this.engine.scale_node_proportional(Number(this.drag.nodeId), scaleX, scaleY);
            } else {
              // Use constraint-aware resize with immediate layout recomputation
              this.engine.resize_node_with_layout(this.drag.nodeId, nw, nh);
            }
            // Show breakpoint indicator during resize
            this.updateBreakpointIndicator(Number(this.drag.nodeId), nw);
            this.buildConstraintDebugOverlay(Number(this.drag.nodeId), ox, oy, ow, oh, nx, ny, nw, nh);
          }
        }
      } else {
        this._constraintDebugOverlay = null;
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
        // Compute both smart guide snap and grid snap, pick closer one
        let sgDx = 0, sgDy = 0;
        let sgGuides: SnapGuide[] = [];
        if (bbox && others.length > 0) {
          const threshold = SNAP_THRESHOLD_PX / zoom;
          const snap = computeSnap(bbox, others, threshold);
          sgDx = snap.dx; sgDy = snap.dy; sgGuides = snap.guides;
        }
        let gdDx = 0, gdDy = 0;
        if (this.gridSnapEnabled && this.gridSize > 0 && bbox) {
          const gs = this.gridSize;
          // Grid snap based on post-smart-guide position
          const gx = bbox.x + sgDx;
          const gy = bbox.y + sgDy;
          gdDx = Math.round(gx / gs) * gs - gx;
          gdDy = Math.round(gy / gs) * gs - gy;
        }
        // If both active, pick axis-wise closer snap (smart guide vs grid)
        let finalDx = 0, finalDy = 0;
        if (this.gridSnapEnabled && this.gridSize > 0 && bbox) {
          // Compare distances: smart guide snap vs grid snap (from raw position)
          const rawGSnap = computeGridSnap(bbox.x, bbox.y, this.gridSize);
          // X axis: pick closer
          if (sgDx !== 0 && Math.abs(sgDx) <= Math.abs(rawGSnap.dx)) {
            finalDx = sgDx;
          } else if (rawGSnap.dx !== 0) {
            finalDx = rawGSnap.dx;
            sgGuides = sgGuides.filter(g => g.axis !== "v"); // remove vertical guides if grid wins X
          } else {
            finalDx = sgDx;
          }
          // Y axis: pick closer
          if (sgDy !== 0 && Math.abs(sgDy) <= Math.abs(rawGSnap.dy)) {
            finalDy = sgDy;
          } else if (rawGSnap.dy !== 0) {
            finalDy = rawGSnap.dy;
            sgGuides = sgGuides.filter(g => g.axis !== "h"); // remove horizontal guides if grid wins Y
          } else {
            finalDy = sgDy;
          }
        } else {
          finalDx = sgDx;
          finalDy = sgDy;
        }
        // Pixel snap for move: round final positions to pixel grid
        if (this.pixelSnapEnabled && !(this.gridSnapEnabled && this.gridSize > 0) && bbox) {
          const afterX = bbox.x + finalDx;
          const afterY = bbox.y + finalDy;
          const snappedX = this.pixelSnap(afterX);
          const snappedY = this.pixelSnap(afterY);
          finalDx += snappedX - afterX;
          finalDy += snappedY - afterY;
        }
        if (finalDx !== 0 || finalDy !== 0) {
          for (const id of sel) {
            this.engine.move_node(id, finalDx, finalDy);
          }
        }
        this._snapGuides = sgGuides;
        // Compute drop target for drag-to-reparent into auto-layout frames
        const dragSceneX = this.engine.screen_to_scene_x(x, y);
        const dragSceneY = this.engine.screen_to_scene_y(x, y);
        this._dropTarget = computeDropTarget(this.engine, dragSceneX, dragSceneY, selSet);
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

    if (["rect", "ellipse", "text", "frame", "section", "image", "video", "slice", "hotspot"].includes(this.currentTool)) {
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

    // Image crop mode: release
    if (this._imageCropMode && this._imageCropDragging) {
      this._imageCropDragging = false;
      this._imageCropHandle = null;
      return;
    }

    // Corner pin handle release
    if (this._cornerPinDragging) {
      this._cornerPinDragging = null;
      this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
      this.needsRender = true;
      return;
    }

    // Responsive resize release
    if (this._responsiveResize?.isActive && this._responsiveResize.onPointerUp()) {
      this.needsRender = true;
      return;
    }

    // Spacing handle release
    if (this._spacingDragging) {
      this._spacingDragging = null;
      this._spacingHandles = findSpacingHandles(this.engine);
      this._paddingHandles = findPaddingHandles(this.engine);
      this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
      this.needsRender = true;
      return;
    }

    // Padding handle release
    if (this._paddingDragging) {
      this._paddingDragging = null;
      this._paddingHandles = findPaddingHandles(this.engine);
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

    // Annotation brush: finish stroke
    if (isDrawing()) {
      finishStroke();
      this.needsRender = true;
      return;
    }

    // Freehand: finish drawing with ink recognition
    if (this._freehandDrawing && this._freehandPathId != null) {
      const pts = this._freehandPoints;
      // Remove the temporary raw path
      this.engine.remove_node(this._freehandPathId);

      if (pts.length < 2) {
        // Too short, nothing to create
      } else {
        const inkPoints = pts.map(p => ({
          x: p.x, y: p.y,
          pressure: p.pressure ?? 0.5,
          timestamp: p.timestamp ?? 0,
        }));
        const pointsJson = JSON.stringify(inkPoints);
        let newId: number;

        if (this._inkShapeRecognition) {
          // Try shape recognition first
          try {
            const recognitionJson = this.engine.ink_recognize(pointsJson);
            const recognition = JSON.parse(recognitionJson);
            if (recognition.confidence > 0.7 && recognition.shape !== "freehand") {
              newId = Number(this.engine.ink_to_shape(pointsJson));
            } else {
              newId = Number(this.engine.ink_to_path(pointsJson, this._inkSimplifyTolerance));
            }
          } catch {
            newId = Number(this.engine.ink_to_path(pointsJson, this._inkSimplifyTolerance));
          }
        } else {
          newId = Number(this.engine.ink_to_path(pointsJson, this._inkSimplifyTolerance));
        }

        if (newId && newId > 0) {
          if (this._freehandSmoothingEnabled && pts.length >= 3) {
            try {
              const created = JSON.parse(this.engine.get_node_json(BigInt(newId)));
              const kind = typeof created?.kind === "string" ? created.kind : (created?.kind && Object.keys(created.kind)[0]);
              if (kind === "Path") {
                this._smoothFreehandPath(newId, pts.map((p) => ({ x: p.x, y: p.y })));
              }
            } catch {
              // keep raw recognized path on parse failures
            }
          }

          if (this._penPressureEnabled) {
            try {
              const pointCount = this.engine.path_point_count(newId);
              const strokeInfo = this.engine.get_stroke_info(BigInt(newId));
              const baseWidth = strokeInfo ? (JSON.parse(strokeInfo).width || 2) : 2;
              for (let i = 0; i < pointCount; i++) {
                const t = pointCount <= 1 ? 0 : i / (pointCount - 1);
                const srcIdx = Math.round(t * Math.max(0, pts.length - 1));
                const pressure = pts[Math.max(0, Math.min(pts.length - 1, srcIdx))]?.pressure ?? 0.5;
                this.engine.path_set_point_stroke_width(BigInt(newId), i, this.pressureWidth(baseWidth, pressure, t));
              }
            } catch {
              // ignore pressure profile failures
            }
          }

          this.engine.select(newId);
          this.fireSelectionNow([newId]);
          this.onLayersChanges.forEach(fn => fn());
        }
      }
      this._freehandPathId = null;
      this._freehandPoints = [];
      this._freehandDrawing = false;
      this.needsRender = true;
      return;
    }

    if (this._shapeBuilderStroke) {
      const points = this._shapeBuilderStroke;
      this._shapeBuilderStroke = null;
      const touchedIds = this.computeShapeBuilderTouchedIds(points);
      this._shapeBuilderTouchedIds = [];
      if (touchedIds.length >= 2) {
        this.engine.push_undo();
        this.engine.deselect_all();
        for (const id of touchedIds) this.engine.add_to_selection(id);
        const op = _e.altKey ? "subtract" : "union";
        const newId = this.engine.boolean_operation(op as any);
        if (newId) {
          this.fireSelectionNow([Number(newId)]);
          this.onLayersChanges.forEach(fn => fn());
        }
      }
      this.needsRender = true;
      return;
    }

    // Measure tool: finish placing line
    if (this.currentTool === "measure" && this.measureTool.dragging) {
      this.measureTool.onPointerUp(this);
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
          // Connect anchors if snapped
          if (cd.startAnchor && startId) {
            this.engine.connect_to_anchor(BigInt(id), true, BigInt(startId), cd.startAnchor);
          }
          if (cd.endAnchor && endId) {
            this.engine.connect_to_anchor(BigInt(id), false, BigInt(endId), cd.endAnchor);
          }
          this.engine.select(id);
          this.fireSelectionNow([id]);
          this.onLayersChanges.forEach(fn => fn());
        }
      }
      this._connectorDrag = null;
      this._anchorSnap = null;
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

      const maybeAttachTextToPath = (textId: number) => {
        const hit = this.engine.hit_test(_e.offsetX, _e.offsetY);
        const hitId = hit != null ? Number(hit) : 0;
        if (!hitId || hitId === textId) return;
        try {
          const hitJson = this.engine.get_node_json(BigInt(hitId));
          if (!hitJson) return;
          const hitNode = JSON.parse(hitJson);
          const kind = typeof hitNode.kind === "string" ? hitNode.kind : Object.keys(hitNode.kind || {})[0];
          if (kind === "Path") {
            this.engine.set_text_path(BigInt(textId), BigInt(hitId));
          }
        } catch (_) {}
      };

      if (w > 2 || h > 2) {
        this.engine.push_undo();
        let id: number;
        switch (this.currentTool) {
          case "rect": id = this.engine.add_rect(x, y, w, h); break;
          case "ellipse": id = this.engine.add_ellipse(x, y, w, h); break;
          case "frame": id = this.engine.add_frame(x, y, w, h); break;
          case "section": id = this.engine.add_section("", x, y, w, h); break;
          case "text":
            id = this.engine.add_text(x, y, "Text", 16);
            maybeAttachTextToPath(id);
            break;
          case "image": id = this.engine.add_image(x, y, w, h, ""); this.promptImageSrc(id); break;
          case "video": id = this.engine.add_video(x, y, Math.max(w, 320), Math.max(h, 180), ""); break;
          case "star": id = this.engine.add_star(x, y, w, h, 5, 0.4); break;
          case "polygon": id = this.engine.add_polygon(x, y, w, h, 6); break;
          case "slice": id = this.engine.add_slice("", x, y, w, h); break;
          case "hotspot": {
            id = this.engine.add_rect(x, y, w, h);
            try {
              this.engine.set_name(BigInt(id), `Hotspot ${id}`);
              // transparent interactive layer with subtle outline in editor
              this.engine.set_fill_color(BigInt(id), 13, 153, 255, 0.02);
              this.engine.set_stroke(BigInt(id), 13, 153, 255, 0.7, 1);
              this.engine.set_stroke_dash(BigInt(id), "4,3", 0);
            } catch {}
            // If authored over a frame, parent hotspot into that frame
            try {
              let parentFrameId = Number(this.engine.hit_test(_e.offsetX, _e.offsetY) || 0);
              while (parentFrameId > 0 && this.getNodeKindById(parentFrameId) !== "Frame") {
                const p = Number((this.engine as any).get_node_parent?.(BigInt(parentFrameId)) ?? 0);
                if (!Number.isFinite(p) || p <= 0 || p === parentFrameId) { parentFrameId = 0; break; }
                parentFrameId = p;
              }
              if (parentFrameId > 0) {
                const parentJson = this.engine.get_node_json(BigInt(parentFrameId));
                if (parentJson) {
                  const parent = JSON.parse(parentJson);
                  (this.engine as any).reparent_node_at(BigInt(id), parentFrameId, Number.MAX_SAFE_INTEGER);
                  (this.engine as any).set_node_position(BigInt(id), x - Number(parent.x || 0), y - Number(parent.y || 0));
                }
              }
            } catch {}

            const targetId = this._hotspotTargetNodeId ?? this.chooseHotspotTargetNodeId(id);
            if (targetId && targetId !== id) {
              this.engine.add_interaction(BigInt(id), "click", "navigate-to", BigInt(targetId), BigInt(0), "instant", 300, "ease_in_out");
              try {
                const targetName = (this.engine as any).get_node_name?.(BigInt(targetId)) || `#${targetId}`;
                this.engine.set_name(BigInt(id), `Hotspot → ${targetName}`);
              } catch {}
            }
            break;
          }
          case "sticky": id = this.engine.add_sticky_note(x, y, Math.max(w, 150), Math.max(h, 150), "", "yellow"); break;
          case "table": id = this.engine.add_table(x, y, 3, 3, Math.max(w / 3, 80), Math.max(h / 3, 32)); break;
          case "chart": id = this.engine.add_chart(x, y, Math.max(w, 300), Math.max(h, 200)); break;
          case "callout": {
            const cw = Math.max(w, 160);
            const ch = Math.max(h, 80);
            // Tail points down from bottom-center by default
            id = this.engine.add_callout(x, y, cw, ch, "", x + cw / 2, y + ch + 40);
            break;
          }
          default: id = 0;
        }
        if (id > 0) {
          this.engine.select(id);
          this.fireSelectionNow([id]);
          this.onLayersChanges.forEach(fn => fn());
        }
      } else if (this.currentTool === "text") {
        // Figma-style point text on click (no drag required)
        this.engine.push_undo();
        const id = this.engine.add_text(this.drag.startX, this.drag.startY, "Text", 16);
        if (id > 0) {
          maybeAttachTextToPath(id);
          this.engine.select(id);
          this.fireSelectionNow([id]);
          this.onLayersChanges.forEach(fn => fn());
        }
      }
      this.setTool("select");
      this.needsRender = true;
    }

    // Fire final selection update after drag ends
    if (this.drag && (this.currentTool === "select" || this.currentTool === "scale")) {
      // Apply responsive variant auto-switch after resize
      if (this.drag.handleIndex != null && this.drag.nodeId != null) {
        try {
          (this.engine as any).apply_responsive_variants(BigInt(this.drag.nodeId));
        } catch (_) {}
      }
      this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
    }

    // Execute drag-to-reparent if dropping on auto-layout frame
    if (this._dropTarget && this.drag && this.drag.handleIndex == null) {
      const sel = Array.from(this.engine.get_selection()).map(Number);
      if (sel.length > 0) {
        this.engine.push_undo();
        executeDropReparent(this.engine, sel, this._dropTarget);
        this.onLayersChanges.forEach(fn => fn());
        this.fireSelectionNow(sel);
      }
    }
    this._dropTarget = null;
    this._snapGuides = [];
    this._pointSnapIndicators = [];
    this._constraintDebugOverlay = null;
    // Clear breakpoint indicator with delay for visibility
    if (this._breakpointIndicator) {
      if (this._breakpointIndicatorTimeout) clearTimeout(this._breakpointIndicatorTimeout);
      this._breakpointIndicatorTimeout = setTimeout(() => {
        this._breakpointIndicator = null;
        this.needsRender = true;
      }, 800);
    }
    this.drag = null;
  }

  fireSelectionNow(ids: number[]) {
    if (this.selectionThrottleId) {
      cancelAnimationFrame(this.selectionThrottleId);
      this.selectionThrottleId = 0;
    }
    // Track selection history (skip if navigating via back/forward)
    if (!this._selHistoryNavigating) {
      const prev = this._selHistory[this._selHistoryIdx];
      const same = prev && prev.length === ids.length && prev.every((v, i) => v === ids[i]);
      if (!same) {
        // Truncate forward history
        this._selHistory = this._selHistory.slice(0, this._selHistoryIdx + 1);
        this._selHistory.push([...ids]);
        if (this._selHistory.length > 50) this._selHistory.shift();
        this._selHistoryIdx = this._selHistory.length - 1;
      }
    }
    this._gradientEditor?.updateFromSelection();
    this._spacingHandles = findSpacingHandles(this.engine);
    this._paddingHandles = findPaddingHandles(this.engine);
    this._devModeOverlay.updateSelectionInspect(ids);
    this.onSelectionChanges.forEach(fn => fn(ids));
  }

  /** Navigate to previous selection (Alt+[) */
  selectionBack() {
    if (this._selHistoryIdx <= 0) return;
    this._selHistoryIdx--;
    const ids = this._selHistory[this._selHistoryIdx];
    this._selHistoryNavigating = true;
    this.engine.deselect_all();
    for (const id of ids) this.engine.add_to_selection(BigInt(id));
    this.fireSelectionNow(ids);
    this._selHistoryNavigating = false;
    this.requestRender();
  }

  /** Navigate to next selection (Alt+]) */
  selectionForward() {
    if (this._selHistoryIdx >= this._selHistory.length - 1) return;
    this._selHistoryIdx++;
    const ids = this._selHistory[this._selHistoryIdx];
    this._selHistoryNavigating = true;
    this.engine.deselect_all();
    for (const id of ids) this.engine.add_to_selection(BigInt(id));
    this.fireSelectionNow(ids);
    this._selHistoryNavigating = false;
    this.requestRender();
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

  // --- Image Crop Mode ---

  private enterImageCropMode(nodeId: number, node: any) {
    const imgData = node.kind.Image;
    const crop = imgData.crop || { x: 0, y: 0, w: 1, h: 1 };
    this._imageCropMode = true;
    this._imageCropState = {
      nodeId,
      cropX: crop.x, cropY: crop.y, cropW: crop.w, cropH: crop.h,
      origCropX: crop.x, origCropY: crop.y, origCropW: crop.w, origCropH: crop.h,
      nodeX: node.x, nodeY: node.y, nodeW: node.width, nodeH: node.height,
      lockAspect: false,
    };
    this._imageCropDragging = false;
    this._imageCropHandle = null;
    this.engine.select(BigInt(nodeId));
    this.canvas.style.cursor = "crosshair";
    this.needsRender = true;
  }

  private exitImageCropMode(cancel = false) {
    if (this._imageCropState && !cancel) {
      // Apply the crop
      this.engine.push_undo();
      const s = this._imageCropState;
      this.engine.set_image_crop(s.nodeId, s.cropX, s.cropY, s.cropW, s.cropH);
    }
    this._imageCropMode = false;
    this._imageCropState = null;
    this._imageCropHandle = null;
    this._imageCropDragging = false;
    this.updateCursor();
    this.needsRender = true;
    this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
  }

  private renderImageCropOverlay() {
    if (!this._imageCropMode || !this._imageCropState) return;
    const ctx = this.ctx;
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    renderCropOverlay(ctx, this._imageCropState, zoom, panX, panY);
  }

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

    // Double-click on spacing handle → direct numeric input
    if (this._spacingHandles.length > 0) {
      const spacingHit = hitTestSpacingHandle(this._spacingHandles, e.offsetX, e.offsetY);
      if (spacingHit) {
        this.promptSpacingValue(spacingHit);
        return;
      }
    }

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

    // Image node → enter crop mode
    if (typeof node.kind === "object" && node.kind.Image) {
      this.enterImageCropMode(Number(hit), node);
      return;
    }

    // Sticky note → edit text content inline
    if (typeof node.kind === "object" && node.kind.StickyNote) {
      this.startStickyEdit(hit, node);
      return;
    }

    // Table node → edit cell inline
    if (typeof node.kind === "object" && node.kind.Table) {
      this.startTableCellEdit(hit, node, e);
      return;
    }

    // Section node → toggle collapse on double-click
    if (node.kind === "Section") {
      this.engine.push_undo();
      this.engine.toggle_section_collapsed(hit);
      this.needsRender = true;
      this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
      return;
    }

    if (typeof node.kind !== "object" || !node.kind.Text) return;

    // Cmd+double-click on another Text node while editing → add to multi-cursor
    if ((e.metaKey || e.ctrlKey) && this.isEditing() && this.editingNodeId !== null) {
      this.addMultiCursor(hit, node);
      return;
    }

    // Start inline text editing
    this.startTextEdit(hit, node);
  }

  private _smoothFreehandPath(pathId: number, pts: { x: number; y: number }[]) {
    const tension = Math.max(0, Math.min(0.8, this._freehandSmoothingStrength));
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

  private startTableCellEdit(nodeId: bigint | number, node: any, e: MouseEvent) {
    const id = BigInt(nodeId);
    const tableInfo = node.kind.Table;
    const colWidths: number[] = tableInfo.col_widths || [];
    const rowHeights: number[] = tableInfo.row_heights || [];
    const cells: any[] = tableInfo.cells || [];

    // Determine which cell was clicked (scene coords)
    const sx = this.engine.screen_to_scene_x(e.offsetX, e.offsetY);
    const sy = this.engine.screen_to_scene_y(e.offsetX, e.offsetY);
    const localX = sx - node.x;
    const localY = sy - node.y;

    let col = -1, row = -1;
    let cx = 0;
    for (let c = 0; c < colWidths.length; c++) {
      if (localX >= cx && localX < cx + colWidths[c]) { col = c; break; }
      cx += colWidths[c];
    }
    let cy = 0;
    for (let r = 0; r < rowHeights.length; r++) {
      if (localY >= cy && localY < cy + rowHeights[r]) { row = r; break; }
      cy += rowHeights[r];
    }
    if (row < 0 || col < 0) return;

    // Find the cell (may be merged — find the anchor cell covering this position)
    let cell = cells.find((c: any) =>
      row >= c.row && row < c.row + (c.row_span || 1) &&
      col >= c.col && col < c.col + (c.col_span || 1)
    );
    if (!cell) cell = { row, col, content: "", row_span: 1, col_span: 1 };

    const cellRow = cell.row;
    const cellCol = cell.col;

    // Calculate cell screen position
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    let cellX = node.x;
    for (let c = 0; c < cellCol; c++) cellX += colWidths[c] || 0;
    let cellY = node.y;
    for (let r = 0; r < cellRow; r++) cellY += rowHeights[r] || 0;
    let cellW = 0;
    for (let c = cellCol; c < cellCol + (cell.col_span || 1); c++) cellW += colWidths[c] || 0;
    let cellH = 0;
    for (let r = cellRow; r < cellRow + (cell.row_span || 1); r++) cellH += rowHeights[r] || 0;

    const screenX = cellX * zoom + panX;
    const screenY = cellY * zoom + panY;
    const screenW = cellW * zoom;
    const screenH = cellH * zoom;

    const input = document.createElement("input");
    input.type = "text";
    input.value = cell.content || "";
    input.style.cssText = `position:fixed;left:${screenX}px;top:${screenY}px;width:${screenW}px;height:${screenH}px;background:rgba(30,30,30,0.95);color:#fff;border:2px solid #4f8eff;outline:none;font-size:${Math.max(12, 13 * zoom)}px;font-family:Inter,sans-serif;padding:2px 4px;z-index:9999;box-sizing:border-box;`;
    document.body.appendChild(input);
    input.focus();
    input.select();

    const finish = () => {
      this.engine.push_undo();
      this.engine.table_set_cell(id, cellRow, cellCol, input.value);
      input.remove();
      this.requestRender();
    };

    input.addEventListener("blur", finish);
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") { input.removeEventListener("blur", finish); input.remove(); }
      if (ev.key === "Enter") { input.removeEventListener("blur", finish); finish(); }
      if (ev.key === "Tab") {
        ev.preventDefault();
        input.removeEventListener("blur", finish);
        finish();
        // Move to next cell
        const nextCol = cellCol + (cell.col_span || 1);
        if (nextCol < colWidths.length) {
          const fakeNode = JSON.parse(this.engine.get_node_json(id) || "null");
          if (fakeNode) {
            const fakeCell = { row: cellRow, col: nextCol, content: "", row_span: 1, col_span: 1 };
            const nextCellData = (fakeNode.kind.Table?.cells || []).find((c: any) => c.row === cellRow && c.col === nextCol) || fakeCell;
            // Simulate double-click on next cell
            setTimeout(() => {
              const nNode = JSON.parse(this.engine.get_node_json(id) || "null");
              if (nNode) this.startTableCellEdit(id, nNode, e);
            }, 0);
          }
        }
      }
    });
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
  private editingPrevContent: string = "";
  private caretPos: number = 0;
  private caretVisible: boolean = true;
  private caretBlinkTimer: number = 0;

  // Multi-cursor text editing state
  private multiCursors: Map<bigint, { caretPos: number; origContent: string }> = new Map();
  private _multiCursorMode: boolean = false;

  private startTextEdit(nodeId: bigint | number, node: any) {
    if (this.editingOverlay) this.finishTextEdit();

    const text = node.kind.Text;
    const bid = BigInt(nodeId);
    this.editingNodeId = bid;
    this.editingOrigContent = text.content;
    this.editingPrevContent = text.content;

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

    // If multiple text nodes are selected, enter cross-node multi-edit automatically.
    const selectedTextNodeIds = Array.from(this.engine.get_selection())
      .map((sid) => BigInt(sid))
      .filter((sid) => sid !== bid)
      .filter((sid) => {
        try {
          const json = this.engine.get_node_json(sid);
          if (!json) return false;
          const n = JSON.parse(json);
          return typeof n.kind === "object" && !!n.kind.Text;
        } catch {
          return false;
        }
      });

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
      this.editingPrevContent = "";
      this._multiCursorMode = false;
      this.multiCursors.clear();
      this.stopCaretBlink();
      this.engine.set_editing(null);
      this.needsRender = true;
      this.canvas.focus();
      this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
    };

    el.addEventListener("blur", finish);

    el.addEventListener("input", () => {
      const newContent = el.textContent || "";
      const prevContent = this.editingPrevContent;
      this.engine.set_text_content(bid, newContent);
      this.editingPrevContent = newContent;
      this.needsRender = true;
      // Update caret after input
      requestAnimationFrame(() => {
        updateCaretPos();
        // Propagate to multi-cursor nodes
        if (this._multiCursorMode) {
          this.multiCursorApplyContent(prevContent, newContent);
        }
      });
    });

    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        // Restore original content for all cursors
        this.engine.set_text_content(bid, this.editingOrigContent);
        if (this._multiCursorMode) {
          for (const [nid, cursor] of this.multiCursors) {
            this.engine.set_text_content(nid, cursor.origContent);
          }
        }
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

    // Auto-materialize cross-node multi-edit from current multi-selection.
    for (const sid of selectedTextNodeIds) {
      const json = this.engine.get_node_json(sid);
      if (!json) continue;
      const n = JSON.parse(json);
      this.addMultiCursor(sid, n);
    }
  }

  private finishTextEdit() {
    if (this.editingOverlay) {
      // Clear multi-cursor state
      if (this._multiCursorMode) {
        this._multiCursorMode = false;
        this.multiCursors.clear();
      }
      this.editingOverlay.dispatchEvent(new FocusEvent("blur"));
    }
  }

  /** Add a Text node to multi-cursor editing mode. Must already be in text edit mode. */
  private addMultiCursor(nodeId: bigint | number, node: any) {
    if (!this.editingNodeId || !this.editingOverlay) return;
    const text = node.kind?.Text;
    if (!text) return;

    const bid = BigInt(nodeId);
    if (bid === this.editingNodeId) return; // already the primary
    if (this.multiCursors.has(bid)) return; // already added

    // First time entering multi-cursor: save primary node info
    if (!this._multiCursorMode) {
      this._multiCursorMode = true;
      // Primary node is already tracked via editingNodeId/caretPos/editingOrigContent
    }

    this.multiCursors.set(bid, {
      caretPos: Math.max(0, Math.min(text.content.length, this.caretPos)),
      origContent: text.content,
    });
    this.engine.add_to_selection(bid);
    this.needsRender = true;
  }

  /** Apply text delta from primary cursor to all multi-cursor nodes */
  private multiCursorApplyContent(prevPrimaryContent: string, newPrimaryContent: string) {
    if (!this._multiCursorMode) return;
    if (prevPrimaryContent === newPrimaryContent) return;

    // Diff by common prefix/suffix to support insert/replace/delete
    let prefix = 0;
    while (
      prefix < prevPrimaryContent.length &&
      prefix < newPrimaryContent.length &&
      prevPrimaryContent[prefix] === newPrimaryContent[prefix]
    ) prefix++;

    let suffix = 0;
    while (
      suffix < prevPrimaryContent.length - prefix &&
      suffix < newPrimaryContent.length - prefix &&
      prevPrimaryContent[prevPrimaryContent.length - 1 - suffix] === newPrimaryContent[newPrimaryContent.length - 1 - suffix]
    ) suffix++;

    const removedCount = prevPrimaryContent.length - prefix - suffix;
    const inserted = newPrimaryContent.slice(prefix, newPrimaryContent.length - suffix);

    for (const [nid, cursor] of this.multiCursors) {
      const nJson = this.engine.get_node_json(nid);
      if (!nJson) continue;
      const nNode = JSON.parse(nJson);
      const nText = nNode.kind?.Text;
      if (!nText) continue;

      const content = String(nText.content ?? "");
      const start = Math.max(0, Math.min(content.length, prefix));
      const end = Math.max(start, Math.min(content.length, start + removedCount));
      const next = content.slice(0, start) + inserted + content.slice(end);
      this.engine.set_text_content(nid, next);
      cursor.caretPos = start + inserted.length;
    }
    this.needsRender = true;
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
    // Apply variable font axes for caret rendering
    const caretFvs = text.font_variation_settings;
    if (caretFvs && typeof caretFvs === 'object' && Object.keys(caretFvs).length > 0) {
      const fvsStr = Object.entries(caretFvs).map(([tag, val]: [string, any]) => `"${tag}" ${val}`).join(', ');
      (this.ctx as any).fontVariationSettings = fvsStr;
    }
    // Apply OpenType features for accurate caret measurement
    const caretOt = text.opentype_features;
    if (caretOt) {
      const parts: string[] = [];
      if (caretOt.ligatures === false) parts.push('"liga" 0');
      if (caretOt.old_style_numerals) parts.push('"onum" 1');
      if (caretOt.small_caps) parts.push('"smcp" 1');
      if (caretOt.tabular_numerals) parts.push('"tnum" 1');
      if (parts.length > 0) {
        (this.ctx as any).fontFeatureSettings = parts.join(', ');
      }
      if (caretOt.small_caps) {
        (this.ctx as any).fontVariantCaps = 'small-caps';
      }
    }

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

    // Render multi-cursor carets
    if (this._multiCursorMode) {
      for (const [nid, cursor] of this.multiCursors) {
        this.renderCaretForNode(nid, cursor.caretPos);
      }
    }
  }

  /** Render a caret for a specific node at a specific position (used by multi-cursor) */
  private renderCaretForNode(nodeId: bigint, cPos: number) {
    if (!this.caretVisible) return;
    const nodeJson = this.engine.get_node_json(nodeId);
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

    const maxWidth = node.text_sizing === "Fixed" ? node.width : undefined;
    const lines = this.wrapText(content, maxWidth);

    let charCount = 0;
    let caretLine = 0;
    let caretCharInLine = 0;
    for (let i = 0; i < lines.length; i++) {
      const lineLen = lines[i].length;
      if (charCount + lineLen >= cPos) {
        caretLine = i;
        caretCharInLine = cPos - charCount;
        break;
      }
      charCount += lineLen + 1;
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

    let lineX = node.x;
    if (textAlign === "Center") lineX = node.x + (node.width - lineW) / 2;
    else if (textAlign === "Right") lineX = node.x + node.width - lineW;

    const caretX = lineX + beforeW;
    const caretY = node.y + lineH * caretLine;
    const screenX = caretX * zoom + panX;
    const screenY = caretY * zoom + panY;
    const caretHeight = lineH * zoom;

    this.ctx.restore();

    // Multi-cursor carets use a different color (cyan)
    this.ctx.save();
    this.ctx.strokeStyle = "#00d4ff";
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
      this._measureDimensionLabels = [];
      return;
    }

    const selBBox = this.getSelectionBBox(sel);
    if (!selBBox) {
      this._measureLines = [];
      this._measureTargetBounds = null;
      this._measureDimensionLabels = [];
      return;
    }

    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    this._measureDimensionLabels = computeDimensionLabels(selBBox as Bounds, zoom, panX, panY);

    const getNodeBounds = (id: number): Bounds | null => {
      const nj = this.engine.get_node_json(BigInt(id));
      if (!nj) return null;
      const n = JSON.parse(nj);
      return { x: Number(n.x || 0), y: Number(n.y || 0), w: Number(n.width || 0), h: Number(n.height || 0) };
    };

    // Hit test to find hovered node
    const hitBigInt = this.engine.hit_test(screenX, screenY);
    const hitId = hitBigInt != null ? Number(hitBigInt) : 0;
    const selSet = new Set(sel);

    if (hitId && !selSet.has(hitId)) {
      const targetBounds = getNodeBounds(hitId);
      if (targetBounds) {
        this._measureLines = computeMeasureLines(selBBox as Bounds, targetBounds, zoom, panX, panY);
        this._measureTargetBounds = targetBounds;
        this.needsRender = true;
        return;
      }
    }

    // Alt + exactly two selected nodes: show spacing between them without hover target
    if (sel.length === 2) {
      const a = getNodeBounds(sel[0]!);
      const b = getNodeBounds(sel[1]!);
      if (a && b) {
        this._measureLines = computeMeasureLines(a, b, zoom, panX, panY);
        this._measureTargetBounds = b;
        this.needsRender = true;
        return;
      }
    }

    // No target — clear lines, keep dimension labels
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
    renderDimensionLabels(this.ctx, this._measureDimensionLabels);
  }

  private renderPersistentMeasures() {
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    renderPersistentMeasures(this.ctx, this, zoom, panX, panY, this.measureTool.selectedMeasureId);
    // Render preview if measure tool is active
    if (this.currentTool === "measure") {
      this.measureTool.renderPreview(this.ctx, zoom, panX, panY);
    }
  }

  private updateBreakpointIndicator(nodeId: number, currentWidth: number) {
    try {
      const bpJson = this.engine.get_active_breakpoint_info(BigInt(nodeId));
      const bp = JSON.parse(bpJson);
      if (bp) {
        this._breakpointIndicator = { label: bp.label, maxWidth: bp.max_width, currentWidth: Math.round(currentWidth) };
      } else {
        // Show width even without breakpoints during resize
        this._breakpointIndicator = { label: "", maxWidth: 0, currentWidth: Math.round(currentWidth) };
      }
      // Auto-clear indicator after drag ends
      if (this._breakpointIndicatorTimeout) clearTimeout(this._breakpointIndicatorTimeout);
      this._breakpointIndicatorTimeout = setTimeout(() => {
        this._breakpointIndicator = null;
        this.needsRender = true;
      }, 1500);
    } catch (_) {
      this._breakpointIndicator = null;
    }
  }

  private renderBreakpointIndicator() {
    const ind = this._breakpointIndicator;
    if (!ind) return;

    const sel = Array.from(this.engine.get_selection()).map(Number);
    if (sel.length !== 1) return;
    const nodeId = sel[0]!;

    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();

    // Get node position for placing indicator
    const nx = this.engine.get_node_x(BigInt(nodeId));
    const ny = this.engine.get_node_y(BigInt(nodeId));
    const nw = this.engine.get_node_width(BigInt(nodeId));

    // Screen coords: top-center of node, above it
    const screenX = (nx + nw / 2) * zoom + panX;
    const screenY = ny * zoom + panY - 32;

    const ctx = this.ctx;
    ctx.save();

    const label = ind.label ? `${ind.label} · ${ind.currentWidth}px` : `${ind.currentWidth}px`;
    ctx.font = "600 11px -apple-system, BlinkMacSystemFont, sans-serif";
    const textWidth = ctx.measureText(label).width;
    const padH = 8, padV = 4;
    const bgW = textWidth + padH * 2;
    const bgH = 20;
    const bx = screenX - bgW / 2;
    const by = screenY - bgH / 2;

    // Background pill
    const color = ind.label ? "#7b61ff" : "#4a90d9";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(bx, by, bgW, bgH, 4);
    ctx.fill();

    // Text
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, screenX, screenY);

    ctx.restore();
  }

  private renderCanvasGrid() {
    if (!this.gridSnapEnabled || this.gridSize <= 0) return;
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    renderGrid(this.ctx, zoom, panX, panY, this.canvas.width / (window.devicePixelRatio || 1), this.canvas.height / (window.devicePixelRatio || 1), this.gridSize, this.gridStyle);
  }

  private renderSmartGuides() {
    if (this._snapGuides.length === 0) return;
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    renderGuides(this.ctx, this._snapGuides, zoom, panX, panY);
    // Render drop indicator for drag-to-reparent
    if (this._dropTarget) {
      renderDropIndicator(this.ctx, this._dropTarget, zoom, panX, panY);
    }
  }

  private renderPointSnap() {
    if (this._pointSnapIndicators.length === 0) return;
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    renderPointSnapIndicators(this.ctx, this._pointSnapIndicators, zoom, panX, panY);
  }

  private computeMarqueeSelection(sx1: number, sy1: number, sx2: number, sy2: number, containOnly: boolean): number[] {
    const sceneX1 = this.engine.screen_to_scene_x(sx1, sy1);
    const sceneY1 = this.engine.screen_to_scene_y(sx1, sy1);
    const sceneX2 = this.engine.screen_to_scene_x(sx2, sy2);
    const sceneY2 = this.engine.screen_to_scene_y(sx2, sy2);
    const rx = Math.min(sceneX1, sceneX2);
    const ry = Math.min(sceneY1, sceneY2);
    const rw = Math.abs(sceneX2 - sceneX1);
    const rh = Math.abs(sceneY2 - sceneY1);
    const rx2 = rx + rw;
    const ry2 = ry + rh;

    const candidates = containOnly
      ? Array.from(this.engine.get_visible_node_ids(rx, ry, rw, rh)).map(Number)
      : Array.from(this.engine.hit_test_rect(sx1, sy1, sx2, sy2)).map(Number);

    const nodeMap = new Map<number, any>();
    const selected = new Set<number>();
    for (const id of candidates) {
      try {
        const node = JSON.parse(this.engine.get_node_json(BigInt(id)));
        nodeMap.set(id, node);
        const nx = Number(node.x ?? 0);
        const ny = Number(node.y ?? 0);
        const nw = Number(node.width ?? 0);
        const nh = Number(node.height ?? 0);
        const inside = nx >= rx && ny >= ry && nx + nw <= rx2 && ny + nh <= ry2;
        if ((!containOnly || inside) && this.matchesSmartSelectionFilters(id, node)) selected.add(id);
      } catch {
        // ignore malformed node
      }
    }

    // Figma-like priority: descendants win over container overlap.
    // If a selected node has a selected ancestor Frame/Group/Section, drop the ancestor.
    // (Contain mode still keeps a container when it is selected alone.)
    const parentById = new Map<number, number | null>();
    for (const [id, node] of nodeMap.entries()) {
      const p = node?.parent;
      if (p === null || p === undefined) parentById.set(id, null);
      else {
        const n = Number(p);
        parentById.set(id, Number.isFinite(n) ? n : null);
      }
    }

    const containerKinds = new Set(["Frame", "Group", "Section"]);
    for (const id of Array.from(selected)) {
      let cur = parentById.get(id) ?? null;
      while (cur != null) {
        if (selected.has(cur)) {
          const pNode = nodeMap.get(cur);
          const pKind = String(pNode?.kind || "");
          if (containerKinds.has(pKind)) {
            selected.delete(cur);
          }
        }
        cur = parentById.get(cur) ?? null;
      }
    }

    return Array.from(selected);
  }

  private getFilteredHitAtScreenPoint(screenX: number, screenY: number, deepPreferred: boolean): number | null {
    const direct = this.engine.hit_test(screenX, screenY);
    if (direct != null && this.matchesSmartSelectionFilters(Number(direct))) return Number(direct);

    const deep = this.engine.deep_hit_test(screenX, screenY);
    if (deep != null && this.matchesSmartSelectionFilters(Number(deep))) return Number(deep);

    const sx = this.engine.screen_to_scene_x(screenX, screenY);
    const sy = this.engine.screen_to_scene_y(screenX, screenY);
    const eps = 0.5 / Math.max(0.1, this.engine.get_zoom());
    const nearby = Array.from(this.engine.get_visible_node_ids(sx - eps, sy - eps, eps * 2, eps * 2)).map(Number);
    if (nearby.length === 0) return null;

    const allIds = Array.from(this.engine.get_all_node_ids()).map(Number);
    const zOrder = new Map<number, number>();
    for (let i = 0; i < allIds.length; i++) zOrder.set(allIds[i]!, i);

    const parsed = nearby
      .map((id) => {
        try {
          const raw = this.engine.get_node_json(BigInt(id));
          if (!raw) return null;
          const node = JSON.parse(raw);
          if (!this.matchesSmartSelectionFilters(id, node)) return null;
          const nx = Number(node?.x ?? 0);
          const ny = Number(node?.y ?? 0);
          const nw = Number(node?.width ?? 0);
          const nh = Number(node?.height ?? 0);
          if (sx < nx || sx > nx + nw || sy < ny || sy > ny + nh) return null;
          return { id, node, z: zOrder.get(id) ?? -1 };
        } catch {
          return null;
        }
      })
      .filter((v): v is { id: number; node: any; z: number } => !!v);

    if (parsed.length === 0) return null;

    if (deepPreferred) {
      let best: { id: number; depth: number; z: number } | null = null;
      for (const item of parsed) {
        let depth = 0;
        let cur = item.node;
        while (cur?.parent != null) {
          depth += 1;
          try {
            const parentRaw = this.engine.get_node_json(BigInt(Number(cur.parent)));
            if (!parentRaw) break;
            cur = JSON.parse(parentRaw);
          } catch {
            break;
          }
        }
        if (!best || depth > best.depth || (depth === best.depth && item.z > best.z)) {
          best = { id: item.id, depth, z: item.z };
        }
      }
      return best?.id ?? null;
    }

    parsed.sort((a, b) => a.z - b.z);
    return parsed[parsed.length - 1]?.id ?? null;
  }

  private isShapeNodeKind(kind: string): boolean {
    return ["Rect", "Ellipse", "Path", "Star", "Polygon", "Vector", "Line", "Frame", "Group", "Section", "Slice", "Connector"].includes(kind);
  }

  private matchesSmartSelectionFilters(id: number, preloadedNode?: any): boolean {
    let node: any = preloadedNode;
    if (!node) {
      try {
        const json = this.engine.get_node_json(BigInt(id));
        if (!json) return false;
        node = JSON.parse(json);
      } catch {
        return false;
      }
    }

    const kind = String(node?.kind || "");
    const byType = (this._smartSelectionFilters.text && kind === "Text")
      || (this._smartSelectionFilters.image && kind === "Image")
      || (this._smartSelectionFilters.shape && this.isShapeNodeKind(kind));
    if (!byType) return false;
    if (!this._smartSelectionFilters.locked && node?.locked === true) return false;
    if (!this._smartSelectionFilters.hidden && node?.visible === false) return false;
    return true;
  }

  private setSmartSelectionFilter(key: SmartSelectionFilterKey, enabled: boolean) {
    this._smartSelectionFilters[key] = enabled;
    this.needsRender = true;
  }

  private toggleSmartSelectionFilter(key: SmartSelectionFilterKey) {
    this.setSmartSelectionFilter(key, !this._smartSelectionFilters[key]);
  }

  private computeShapeBuilderTouchedIds(stroke: { x: number; y: number }[]): number[] {
    if (stroke.length === 0) return [];

    const booleanKinds = new Set(["Rect", "Ellipse", "Star", "Polygon", "Path", "Text", "Image"]);
    const selected = Array.from(this.engine.get_selection()).map(Number);
    const selectedSet = new Set(selected);

    let allNodes: any[] = [];
    try {
      allNodes = JSON.parse((this.engine as any).get_all_nodes?.() || "[]");
    } catch {
      allNodes = [];
    }

    const candidates = allNodes
      .filter((n: any) => {
        const kind = typeof n?.kind === "string" ? n.kind : (n?.kind && Object.keys(n.kind)[0]);
        if (!booleanKinds.has(String(kind))) return false;
        if (selectedSet.size >= 2) return selectedSet.has(Number(n.id));
        return true;
      })
      .map((n: any) => ({
        id: Number(n.id),
        x1: Number(n.x),
        y1: Number(n.y),
        x2: Number(n.x) + Number(n.width),
        y2: Number(n.y) + Number(n.height),
      }))
      .filter((n: any) => Number.isFinite(n.id) && Number.isFinite(n.x1) && Number.isFinite(n.y1) && Number.isFinite(n.x2) && Number.isFinite(n.y2));

    if (candidates.length < 2) return [];

    const touched = new Set<number>();
    for (const c of candidates) {
      for (const p of stroke) {
        const sx = this.engine.screen_to_scene_x(p.x, p.y);
        const sy = this.engine.screen_to_scene_y(p.x, p.y);
        if (sx >= c.x1 && sx <= c.x2 && sy >= c.y1 && sy <= c.y2) {
          touched.add(c.id);
          break;
        }
      }
    }

    return Array.from(touched);
  }

  private renderShapeBuilderStroke() {
    if (!this._shapeBuilderStroke || this._shapeBuilderStroke.length < 2) return;
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.moveTo(this._shapeBuilderStroke[0]!.x, this._shapeBuilderStroke[0]!.y);
    for (let i = 1; i < this._shapeBuilderStroke.length; i++) {
      const p = this._shapeBuilderStroke[i]!;
      this.ctx.lineTo(p.x, p.y);
    }
    this.ctx.strokeStyle = "rgba(99, 102, 241, 0.95)";
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([6, 4]);
    this.ctx.stroke();

    const mode = this._altHeld ? "Subtract" : "Union";
    const count = this._shapeBuilderTouchedIds.length;
    const tip = `Shape Builder: ${mode} · ${count} hit${count === 1 ? "" : "s"}`;
    const last = this._shapeBuilderStroke[this._shapeBuilderStroke.length - 1]!;
    this.ctx.setLineDash([]);
    this.ctx.fillStyle = "rgba(67, 56, 202, 0.9)";
    this.ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
    this.ctx.fillText(tip, last.x + 8, last.y - 8);
    this.ctx.restore();
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

    const mode = this._altHeld ? (this._marqueeBaseMode === "contain" ? "Crossing" : "Contain") : (this._marqueeBaseMode === "contain" ? "Contain" : "Crossing");
    this.ctx.fillStyle = "rgba(37, 99, 235, 0.92)";
    this.ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
    this.ctx.fillText(`Net: ${mode} (Alt to toggle)`, x + 6, Math.max(12, y - 6));
    this.ctx.restore();
  }

  private renderAnchorPoints() {
    const nodeId = this._anchorHoverNodeId;
    const snap = this._anchorSnap;
    // Show anchors on hovered node (connector tool) or during drag
    const ids: number[] = [];
    if (nodeId) ids.push(nodeId);
    if (this._connectorDrag?.endNodeId && !ids.includes(this._connectorDrag.endNodeId)) {
      ids.push(this._connectorDrag.endNodeId);
    }
    if (this._connectorDrag?.startNodeId && !ids.includes(this._connectorDrag.startNodeId)) {
      ids.push(this._connectorDrag.startNodeId);
    }
    if (ids.length === 0 && !snap) return;

    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    const radius = 4;

    this.ctx.save();
    for (const nid of ids) {
      try {
        const anchorsJson = this.engine.get_node_anchors(BigInt(nid));
        const anchors: Array<{ position: string; world_x: number; world_y: number }> = JSON.parse(anchorsJson);
        for (const a of anchors) {
          const sx = a.world_x * zoom + panX;
          const sy = a.world_y * zoom + panY;
          const isSnapped = snap && snap.nodeId === nid && snap.anchor === a.position;
          this.ctx.beginPath();
          this.ctx.arc(sx, sy, isSnapped ? radius + 2 : radius, 0, Math.PI * 2);
          if (isSnapped) {
            this.ctx.fillStyle = "rgba(59, 130, 246, 1)";
            this.ctx.fill();
            this.ctx.strokeStyle = "#fff";
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
          } else {
            this.ctx.fillStyle = "rgba(59, 130, 246, 0.3)";
            this.ctx.fill();
            this.ctx.strokeStyle = "rgba(59, 130, 246, 0.8)";
            this.ctx.lineWidth = 1.5;
            this.ctx.stroke();
          }
        }
      } catch (_) { /* ignore */ }
    }
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

  // FPS counter (bottom-left debug overlay)
  private _fpsCounterEl: HTMLElement | null = null;
  private _fpsCounterVisible = false;
  private _fpsFrameTimes: number[] = [];
  private _fpsLastTime = 0;

  /** Toggle FPS counter overlay (bottom-left) */
  toggleFpsCounter() {
    this._fpsCounterVisible = !this._fpsCounterVisible;
    if (this._fpsCounterVisible) {
      if (!this._fpsCounterEl) {
        this._fpsCounterEl = document.createElement("div");
        this._fpsCounterEl.style.cssText = `
          position: fixed; bottom: 12px; left: 12px; z-index: 9999;
          background: rgba(0,0,0,0.75); color: #0f0; font: bold 12px monospace;
          padding: 4px 8px; border-radius: 4px; pointer-events: none;
          line-height: 1.4; min-width: 80px;
        `;
        document.body.appendChild(this._fpsCounterEl);
      }
      this._fpsCounterEl.style.display = "block";
      this._fpsLastTime = performance.now();
      this._fpsFrameTimes = [];
    } else if (this._fpsCounterEl) {
      this._fpsCounterEl.style.display = "none";
    }
  }

  private updateFpsCounter() {
    if (!this._fpsCounterEl || !this._fpsCounterVisible) return;
    const now = performance.now();
    this._fpsFrameTimes.push(now);
    // Keep last 1 second of frame times
    while (this._fpsFrameTimes.length > 0 && this._fpsFrameTimes[0] < now - 1000) {
      this._fpsFrameTimes.shift();
    }
    // Update display every 250ms
    if (now - this._fpsLastTime > 250) {
      this._fpsLastTime = now;
      const fps = this._fpsFrameTimes.length;
      const rendered = this.engine.get_rendered_count?.() ?? 0;
      const culled = this.engine.get_culled_count?.() ?? 0;
      const color = fps >= 55 ? "#0f0" : fps >= 30 ? "#ff0" : "#f00";
      this._fpsCounterEl.innerHTML = `<span style="color:${color}">${fps} FPS</span><br><span style="color:#aaa;font-size:10px">${rendered}r/${culled}c</span>`;
    }
  }

  // Deferred render tasks via requestIdleCallback
  private _deferredTasks: (() => void)[] = [];
  private _idleCallbackId: number | null = null;

  /** Schedule a low-priority render task to run during idle time */
  private scheduleDeferredTask(task: () => void) {
    this._deferredTasks.push(task);
    if (this._idleCallbackId === null) {
      this._idleCallbackId = (window as any).requestIdleCallback?.((deadline: any) => {
        this._idleCallbackId = null;
        while (this._deferredTasks.length > 0 && deadline.timeRemaining() > 2) {
          const t = this._deferredTasks.shift();
          t?.();
        }
        // If tasks remain, schedule another
        if (this._deferredTasks.length > 0) {
          this.scheduleDeferredTask(this._deferredTasks.shift()!);
        }
      }, { timeout: 100 }) ?? setTimeout(() => {
        this._idleCallbackId = null;
        const batch = this._deferredTasks.splice(0, 5);
        batch.forEach(t => t());
      }, 16);
    }
  }

  private renderOnionSkin() {
    const os = this.onionSkin;
    if (!os.enabled || os.clipId == null) return;

    // Get clip duration to compute frame step
    const dur = this.engine.anim_get_duration(BigInt(os.clipId));
    if (dur <= 0) return;

    // Use keyframe-based stepping: ~30fps → 33ms per frame
    const frameStep = 33; // ms
    const snapshot = this.engine.export_scene();

    const ghostTimes: { time: number; color: string; alpha: number }[] = [];

    // Before frames (blue tint)
    for (let i = 1; i <= os.beforeCount; i++) {
      const t = os.currentTime - i * frameStep;
      if (t < 0) continue;
      const alpha = os.opacity * (1 - (i - 1) / os.beforeCount);
      ghostTimes.push({ time: t, color: "rgba(0,150,255,", alpha });
    }

    // After frames (green tint)
    for (let i = 1; i <= os.afterCount; i++) {
      const t = os.currentTime + i * frameStep;
      if (t > dur) continue;
      const alpha = os.opacity * (1 - (i - 1) / os.afterCount);
      ghostTimes.push({ time: t, color: "rgba(255,100,0,", alpha });
    }

    for (const ghost of ghostTimes) {
      this.engine.anim_apply(BigInt(os.clipId), ghost.time);
      this.ctx.save();
      this.ctx.globalAlpha = ghost.alpha;
      this.engine.render(this.ctx);
      this.ctx.restore();
    }

    // Restore original scene state
    this.engine.import_scene(snapshot);
    // Re-apply current time so main render is correct
    this.engine.anim_apply(BigInt(os.clipId), os.currentTime);
  }

  private startLoop() {
    const loop = () => {
      if (this.needsRender) {
        const frameStart = performance.now();
        const dpr = window.devicePixelRatio || 1;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const sceneNodeCount = Number(this.engine.get_node_count?.() ?? 0);
        this.maybeAutoSwitchRenderBackend(sceneNodeCount);
        // Pixel preview: disable smoothing for crisp 1:1 pixels
        if (this._pixelPreview) {
          this.ctx.imageSmoothingEnabled = false;
        }
        this.renderOnionSkin();
        if (this._artboardView.enabled) {
          const cw = this.canvas.width / dpr;
          const ch = this.canvas.height / dpr;
          const savedZoom = this.zoom;
          const savedPanX = this.panX;
          const savedPanY = this.panY;
          this._artboardView.render(
            this.ctx as any, this.zoom, this.panX, this.panY,
            cw, ch, Number(this.engine.get_active_page_id()), dpr,
          );
          // Restore viewport for overlays
          this.engine.set_viewport(savedZoom, savedPanX, savedPanY);
        } else if (this._renderBackend === "webgpu" && this._webgpuRenderer?.ready) {
          const sceneJson = this.engine.export_scene();
          this._webgpuRenderer.renderFromScene(
            sceneJson,
            this.canvas.width,
            this.canvas.height,
            this.zoom,
            this.panX,
            this.panY,
          );
          this.ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);
          this.ctx.drawImage(this._webgpuRenderer.canvas, 0, 0, this.canvas.width / dpr, this.canvas.height / dpr);
        } else {
          this.engine.render(this.ctx);
        }
        this.renderImages();
        this.renderCornerPins();
        this.renderCornerPinHandles();
        this.render3DPerspective();
        this.renderPatternFills();
        this.renderCanvasGrid();
        this.renderLayoutGrids();
        this.renderGuideLines();
        this.renderSmartGuides();
        this.renderBooleanPreviewOverlay();
        this.renderPointSnap();
        this.renderMeasure();
        this.renderPersistentMeasures();
        this.renderPathEditOverlay();
        this.renderImageCropOverlay();
        this.renderVNEditOverlay();
        this.renderMeshEditOverlay();
        this.renderCaret();
        this.renderShapeBuilderStroke();
        this.renderMarquee();
        this.renderAnchorPoints();
        this.renderConnectorPreview();
        this.renderSliceOverlays();
        this.renderComponentSetOverlays();
        this.renderGradientEditor();
        this.renderSpacingHandles();
        this.renderConstraintPinsOverlay();
        this.renderConstraintDebugOverlay();
        this.renderRemoteNodeLocks();
        this.renderCursorPresence();
        this.renderBreakpointIndicator();
        this.renderStamps();
        this.renderNodeLinks();
        this.renderTextFlowLinks();
        this.renderMotionPathOverlay();
        this._annotationHeatmap?.render(this.ctx, this.zoom, this.panX, this.panY);
        this.renderSearchHighlights();
        this.renderDiffOverlay();
        this.renderSearchFilterOverlay();
        this.renderPixelPreviewOverlay();
        this._rulers?.render();
        if (this._devMode) {
          this._devModeOverlay.renderCanvasOverlay(this.ctx);
          this._devModeOverlay.updateSelectionInspect(Array.from(this.engine.get_selection()).map(Number));
        }
        this.needsRender = false;
        // Annotations need continuous rendering during fade
        if (tickAnnotations()) this.needsRender = true;

        // Frame time tracking
        const frameTime = performance.now() - frameStart;
        this._frameTimeHistory.push(frameTime);
        if (this._frameTimeHistory.length > 60) this._frameTimeHistory.shift();

        // Profiler panel: record frame time + per-node timing + render heatmap
        recordFrameTime(frameTime);
        if (profilerState.active) {
          try {
            const reportJson = (this.engine as any).get_node_complexity_report?.();
            if (reportJson) {
              const nodes = JSON.parse(reportJson) as { id: number; name: string; kind: string; complexity: number; w: number; h: number }[];
              const totalComplexity = nodes.reduce((a, n) => a + n.complexity, 0) || 1;
              for (const n of nodes) {
                // Distribute frame time proportionally to complexity
                const estimatedMs = (n.complexity / totalComplexity) * frameTime;
                recordNodeRender(n.id, estimatedMs, n.name, n.kind, n.w, n.h);
              }
            }
          } catch {}
        }
        if (profilerState.heatmapEnabled) renderProfilerHeatmap(this);

        // FPS counter update
        this.updateFpsCounter();

        // Update perf heatmap overlay if enabled
        if ((this as any)._perfHeatmapCb) (this as any)._perfHeatmapCb();

        // Update perf overlay if visible
        if (this._perfStatsVisible && performance.now() - this._lastPerfUpdate > 500) {
          this._lastPerfUpdate = performance.now();
          this.updatePerfStats();
        }

        // Defer heavy non-critical updates to idle time
        if (this._deferredTasks.length === 0) {
          // Schedule image cache cleanup during idle
          this.scheduleDeferredTask(() => {
            // Prune image cache if too large
            if (this._imageCache.size > 200) {
              const keys = Array.from(this._imageCache.keys());
              for (let i = 0; i < 50; i++) {
                this._imageCache.delete(keys[i]);
              }
            }
          });
        }
      } else {
        // Even when not rendering, update FPS counter (shows actual frame rate)
        this.updateFpsCounter();
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  // --- Grid snap API ---
  toggleGridSnap() {
    this.gridSnapEnabled = !this.gridSnapEnabled;
    this._onGridSnapChanges.forEach(cb => cb());
    this.requestRender();
  }

  setGridSize(size: number) {
    this.gridSize = Math.max(1, Math.round(size));
    this._onGridSnapChanges.forEach(cb => cb());
    this.requestRender();
  }

  setGridStyle(style: "dots" | "lines") {
    this.gridStyle = style;
    this.requestRender();
  }

  onGridSnapChanged(cb: () => void) {
    this._onGridSnapChanges.push(cb);
  }

  // --- Pixel snap API ---
  private pixelSnap(v: number): number {
    if (!this.pixelSnapEnabled) return v;
    const p = this.pixelSnapPrecision;
    return Math.round(v / p) * p;
  }
  private pixelSnapSize(v: number): number {
    if (!this.pixelSnapEnabled) return v;
    const p = this.pixelSnapPrecision;
    return Math.max(p, Math.round(v / p) * p);
  }
  togglePixelSnap() {
    this.pixelSnapEnabled = !this.pixelSnapEnabled;
    this._onPixelSnapChanges.forEach(cb => cb());
    this.requestRender();
  }
  setPixelSnapPrecision(p: 1 | 0.5) {
    this.pixelSnapPrecision = p;
    this._onPixelSnapChanges.forEach(cb => cb());
    this.requestRender();
  }
  onPixelSnapChanged(cb: () => void) {
    this._onPixelSnapChanges.push(cb);
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
      this._measureDimensionLabels = [];
      this.needsRender = true;
    }
  }

  /** Enable/disable pressure sensitivity for pen tool (stylus input) */
  get penPressureEnabled() { return this._penPressureEnabled; }
  set penPressureEnabled(v: boolean) { this._penPressureEnabled = v; }

  private mapPressureCurve(pressure: number): number {
    const p = Math.max(0, Math.min(1, Number.isFinite(pressure) ? pressure : 0.5));
    if (this._penPressureCurve === "soft") return Math.sqrt(p);
    if (this._penPressureCurve === "hard") return p * p;
    return p;
  }

  private taperFactor(progress: number): number {
    const t = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
    const start = Math.max(0, Math.min(0.95, this._penTaperStart));
    const end = Math.max(0, Math.min(0.95, this._penTaperEnd));
    let f = 1;
    if (start > 0) f = Math.min(f, t / start);
    if (end > 0) f = Math.min(f, (1 - t) / end);
    return Math.max(0.15, Math.min(1, f));
  }

  private pressureWidth(baseWidth: number, pressure: number, progress: number): number {
    const mapped = this.mapPressureCurve(pressure);
    const factor = 0.1 + mapped * 1.9;
    return Math.max(0.1, baseWidth * factor * this.taperFactor(progress));
  }

  private getNodeKindById(id: number): string {
    if (!id) return "";
    try {
      const json = this.engine.get_node_json(BigInt(id));
      if (!json) return "";
      const node = JSON.parse(json);
      return typeof node?.kind === "string" ? node.kind : String(Object.keys(node?.kind || {})[0] || "");
    } catch {
      return "";
    }
  }

  private chooseHotspotTargetNodeId(excludeId?: number): number | null {
    const selected = Array.from(this.engine.get_selection()).map(Number);
    for (const id of selected) {
      if (id !== excludeId && this.getNodeKindById(id) === "Frame") return id;
    }

    try {
      const allNodes = JSON.parse((this.engine as any).get_all_nodes?.() || "[]");
      const frames = (allNodes || [])
        .filter((n: any) => {
          const kind = typeof n?.kind === "string" ? n.kind : String(Object.keys(n?.kind || {})[0] || "");
          return kind === "Frame" && Number(n?.id) !== Number(excludeId || 0);
        })
        .map((n: any) => ({ id: Number(n.id), x: Number(n.x), y: Number(n.y), w: Number(n.width), h: Number(n.height) }))
        .filter((n: any) => Number.isFinite(n.id) && Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.w) && Number.isFinite(n.h));

      if (frames.length === 0) return null;

      const selNodeId = selected[0];
      if (selNodeId) {
        const selJson = this.engine.get_node_json(BigInt(selNodeId));
        if (selJson) {
          const selNode = JSON.parse(selJson);
          const cx = Number(selNode.x || 0) + Number(selNode.width || 0) / 2;
          const cy = Number(selNode.y || 0) + Number(selNode.height || 0) / 2;
          frames.sort((a: any, b: any) => Math.hypot(a.x + a.w / 2 - cx, a.y + a.h / 2 - cy) - Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy));
          return frames[0]?.id ?? null;
        }
      }

      return frames[0]?.id ?? null;
    } catch {
      return null;
    }
  }

  setTool(tool: ToolType) {
    // Finish any in-progress pen path when switching away
    if (this._penPathId != null && tool !== "pen") {
      this.finishPenPath();
    }
    this.currentTool = tool;
    if (tool !== "shapeBuilder") {
      this._shapeBuilderStroke = null;
      this._shapeBuilderTouchedIds = [];
    }
    if (tool === "hotspot") {
      this._hotspotTargetNodeId = this.chooseHotspotTargetNodeId();
    }
    this.updateCursor();
    document.querySelectorAll(".tool-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-tool") === tool);
    });
    // Annotation palette
    if (tool === "annotate") {
      renderAnnotationPalette(document.body);
    } else {
      removeAnnotationPalette(document.body);
    }
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
      slice: "crosshair", connector: "crosshair", hotspot: "crosshair", callout: "crosshair", sticky: "crosshair", chart: "crosshair", freehand: "crosshair",
      measure: "crosshair", annotate: "crosshair", eyedropper: "crosshair", scale: "nwse-resize", shapeBuilder: "crosshair",
    };
    this.canvas.style.cursor = cursors[this.currentTool] || "default";
  }

  // Freehand / ink settings
  getInkSettings() {
    return {
      shapeRecognition: this._inkShapeRecognition,
      simplifyTolerance: this._inkSimplifyTolerance,
      smoothingEnabled: this._freehandSmoothingEnabled,
      smoothingStrength: this._freehandSmoothingStrength,
    };
  }

  setInkShapeRecognition(enabled: boolean) {
    this._inkShapeRecognition = !!enabled;
  }

  setInkSimplifyTolerance(value: number) {
    this._inkSimplifyTolerance = Math.max(0.2, Math.min(12, Number.isFinite(value) ? value : 2.0));
  }

  setFreehandSmoothingEnabled(enabled: boolean) {
    this._freehandSmoothingEnabled = !!enabled;
  }

  setFreehandSmoothingStrength(value: number) {
    this._freehandSmoothingStrength = Math.max(0, Math.min(0.8, Number.isFinite(value) ? value : 0.3));
  }

  // === Image support ===

  private pasteNodes() {
    if (this._clipboard) {
      const sourceSelection = this.getSelection();
      this.engine.push_undo();
      this._pasteCount++;
      const offset = this._pasteCount * 10;
      const newIds = this.engine.paste_nodes(this._clipboard, offset, offset);
      const ids = JSON.parse(newIds).map(Number);

      // Smart Paste to Frame: if source selection (or hover target) is an auto-layout frame,
      // insert pasted nodes into that frame at a flow-aware position.
      const pasteTarget = this.findSmartPasteTarget(sourceSelection, ids);
      if (pasteTarget) {
        executeDropReparent(this.engine, ids, pasteTarget);
      }

      this.onLayersChanges.forEach(fn => fn());
      this.fireSelectionNow(ids);
      this.needsRender = true;
    }
  }

  private findSmartPasteTarget(sourceSelection: number[], pastedIds: number[]): DropTarget | null {
    // Keyboard paste can happen before any pointer move in-session.
    // In that case, fallback to viewport center instead of stale coordinates.
    const rect = this.canvas.getBoundingClientRect();
    const pointerX = this._hasPointerScreenPosition ? this._lastPointerScreenX : rect.width / 2;
    const pointerY = this._hasPointerScreenPosition ? this._lastPointerScreenY : rect.height / 2;
    const sx = this.engine.screen_to_scene_x(pointerX, pointerY);
    const sy = this.engine.screen_to_scene_y(pointerX, pointerY);

    // Priority 1: selected auto-layout frame/group itself → append at end
    // (supports single selection and mixed multi-selection where a container is selected)
    const selectedFrameTarget = this.findSelectedAutoLayoutTarget(sourceSelection, pastedIds);
    if (selectedFrameTarget) return selectedFrameTarget;

    // Priority 2: selection inside same auto-layout parent → insert right after selection
    const siblingTarget = this.buildInsertAfterSelectionDropTarget(sourceSelection);
    if (siblingTarget) return siblingTarget;

    // Priority 3: hovered auto-layout frame (updated on pointer move)
    // Re-resolve from current pointer first to avoid stale hover ids after viewport changes.
    const liveHoverFrameId = this.resolveAutoLayoutFrameFromScreenPoint(pointerX, pointerY) ?? this._smartPasteHoverFrameId;
    if (liveHoverFrameId != null && !pastedIds.includes(liveHoverFrameId)) {
      const hoverTarget = this.buildAppendDropTarget(liveHoverFrameId);
      if (hoverTarget) return hoverTarget;
    }

    // Priority 4: frame under pointer (using drag-reparent heuristics)
    return computeDropTarget(this.engine, sx, sy, new Set<number>(pastedIds));
  }

  private findSelectedAutoLayoutTarget(sourceSelection: number[], pastedIds: number[]): DropTarget | null {
    if (sourceSelection.length === 0) return null;

    // Keep explicit single-frame selection behavior first.
    if (sourceSelection.length === 1) {
      const candidateId = sourceSelection[0]!;
      if (!pastedIds.includes(candidateId)) {
        const target = this.buildAppendDropTarget(candidateId);
        if (target) return target;
      }
      return null;
    }

    // Mixed selection: prefer shallow (top-most) selected auto-layout container(s) first.
    // This avoids selecting deeply nested child containers when both parent+child are selected.
    const sortedCandidates = [...sourceSelection]
      .filter(id => !pastedIds.includes(id))
      .sort((a, b) => this.getNodeDepth(a) - this.getNodeDepth(b));

    for (const candidateId of sortedCandidates) {
      const target = this.buildAppendDropTarget(candidateId);
      if (target) return target;
    }

    return null;
  }

  private getNodeDepth(id: number): number {
    let depth = 0;
    let currentId = id;
    const maxDepth = 256;

    while (depth < maxDepth) {
      const parent = Number((this.engine as any).get_node_parent?.(BigInt(currentId)) ?? 0);
      if (!Number.isFinite(parent) || parent <= 0 || parent === currentId) break;
      depth++;
      currentId = parent;
    }

    return depth;
  }

  private resolveAutoLayoutFrameFromScreenPoint(screenX: number, screenY: number): number | null {
    try {
      const hitBigInt = this.engine.hit_test(screenX, screenY);
      if (hitBigInt == null) return null;
      let currentId = Number(hitBigInt);

      while (currentId > 0) {
        const target = this.buildAppendDropTarget(currentId);
        if (target) return target.frameId;

        const parent = Number((this.engine as any).get_node_parent?.(BigInt(currentId)) ?? 0);
        if (!Number.isFinite(parent) || parent <= 0 || parent === currentId) break;
        currentId = parent;
      }
    } catch {
      // ignore hit-test or parent traversal failures
    }
    return null;
  }

  private buildAppendDropTarget(frameId: number): DropTarget | null {
    try {
      const json = (this.engine as any).get_layout_drop_zones(BigInt(frameId));
      if (!json || json === "null") return null;
      const zone = JSON.parse(json);
      if (!zone || zone.mode !== "flex") return null;

      const children = Array.isArray(zone.children) ? zone.children : [];
      const contentTop = zone.frame_y + zone.padding_top;
      const contentBottom = zone.frame_y + zone.frame_h - zone.padding_bottom;
      const contentLeft = zone.frame_x + zone.padding_left;
      const contentRight = zone.frame_x + zone.frame_w - zone.padding_right;
      const isRow = zone.direction === "row";

      // Dummy indicator line values are not rendered for paste, but required by DropTarget type.
      const lineX = isRow
        ? (children.length > 0
            ? zone.frame_x + children[children.length - 1].x + children[children.length - 1].w + zone.gap / 2
            : contentLeft)
        : contentLeft;
      const lineY = !isRow
        ? (children.length > 0
            ? zone.frame_y + children[children.length - 1].y + children[children.length - 1].h + zone.gap / 2
            : contentTop)
        : contentTop;

      return {
        frameId,
        insertIndex: children.length,
        lineX1: lineX,
        lineY1: lineY,
        lineX2: isRow ? lineX : contentRight,
        lineY2: isRow ? contentBottom : lineY,
        direction: isRow ? "row" : "column",
      };
    } catch {
      return null;
    }
  }

  private buildInsertAfterSelectionDropTarget(sourceSelection: number[]): DropTarget | null {
    if (sourceSelection.length === 0) return null;

    try {
      const parentIds = sourceSelection
        .map(id => Number((this.engine as any).get_node_parent?.(BigInt(id)) ?? -1))
        .filter(id => id > 0);
      if (parentIds.length !== sourceSelection.length) return null;

      const parentId = parentIds[0]!;
      if (!parentIds.every(id => id === parentId)) return null;

      const json = (this.engine as any).get_layout_drop_zones(BigInt(parentId));
      if (!json || json === "null") return null;
      const zone = JSON.parse(json);
      if (!zone || zone.mode !== "flex" || !Array.isArray(zone.children)) return null;

      const selectedSet = new Set<number>(sourceSelection);
      const selectedChildIndices: number[] = [];
      zone.children.forEach((child: any, idx: number) => {
        if (selectedSet.has(Number(child?.id))) selectedChildIndices.push(idx);
      });
      if (selectedChildIndices.length === 0) return null;

      const insertIndex = Math.max(...selectedChildIndices) + 1;
      const contentTop = zone.frame_y + zone.padding_top;
      const contentBottom = zone.frame_y + zone.frame_h - zone.padding_bottom;
      const contentLeft = zone.frame_x + zone.padding_left;
      const contentRight = zone.frame_x + zone.frame_w - zone.padding_right;
      const isRow = zone.direction === "row";

      let lineX = contentLeft;
      let lineY = contentTop;

      if (isRow) {
        if (insertIndex >= zone.children.length) {
          const last = zone.children[zone.children.length - 1];
          lineX = zone.frame_x + last.x + last.w + zone.gap / 2;
        } else {
          const prev = zone.children[insertIndex - 1];
          const curr = zone.children[insertIndex];
          lineX = zone.frame_x + (prev.x + prev.w + curr.x) / 2;
        }
      } else {
        if (insertIndex >= zone.children.length) {
          const last = zone.children[zone.children.length - 1];
          lineY = zone.frame_y + last.y + last.h + zone.gap / 2;
        } else {
          const prev = zone.children[insertIndex - 1];
          const curr = zone.children[insertIndex];
          lineY = zone.frame_y + (prev.y + prev.h + curr.y) / 2;
        }
      }

      return {
        frameId: parentId,
        insertIndex,
        lineX1: isRow ? lineX : contentLeft,
        lineY1: isRow ? contentTop : lineY,
        lineX2: isRow ? lineX : contentRight,
        lineY2: isRow ? contentBottom : lineY,
        direction: isRow ? "row" : "column",
      };
    } catch {
      return null;
    }
  }

  private pasteNodesInPlace() {
    if (this._clipboard) {
      const sourceSelection = this.getSelection();
      this.engine.push_undo();
      const newIds = this.engine.paste_nodes(this._clipboard, 0, 0);
      const ids = JSON.parse(newIds).map(Number);

      const pasteTarget = this.findSmartPasteTarget(sourceSelection, ids);
      if (pasteTarget) {
        executeDropReparent(this.engine, ids, pasteTarget);
      }

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
    // Drag overlay for Figma JSON
    let dragCounter = 0;
    this.canvas.addEventListener("dragenter", (e) => {
      e.preventDefault();
      dragCounter++;
      const items = e.dataTransfer?.items;
      if (items && Array.from(items).some(i => i.kind === "file")) {
        showFigmaDropOverlay();
      }
    });
    this.canvas.addEventListener("dragleave", (_e) => {
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        hideFigmaDropOverlay();
      }
    });
    this.canvas.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "copy";
    });
    this.canvas.addEventListener("drop", (e) => {
      e.preventDefault();
      dragCounter = 0;
      hideFigmaDropOverlay();
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;
      for (const file of Array.from(files)) {
        // Handle JSON files as Figma JSON import
        if (file.type === "application/json" || file.name.endsWith(".json")) {
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const stats = importFigmaJSON(this.engine, reader.result as string);
              console.log(`Figma JSON import: ${stats.converted} nodes, ${stats.skipped} skipped`);
              if (stats.errors.length > 0) {
                console.warn("Import warnings:", stats.errors.slice(0, 10));
              }
              this.render();
              this.emit('selectionChanged');
              this.onLayersChanges.forEach(fn => fn());
            } catch (err) {
              console.error("Figma JSON import failed:", err);
            }
          };
          reader.readAsText(file);
          continue;
        }
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
        // Show choice dialog: Image node vs AI Layout
        const imgFile = file;
        const dropOffsetX = e.offsetX;
        const dropOffsetY = e.offsetY;
        const clientX = e.clientX;
        const clientY = e.clientY;
        const addAsImage = () => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const img = new Image();
            img.onload = () => {
              const sx = this.engine.screen_to_scene_x(dropOffsetX, dropOffsetY);
              const sy = this.engine.screen_to_scene_y(dropOffsetX, dropOffsetY);
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
          reader.readAsDataURL(imgFile);
        };
        const addAsAILayout = () => {
          processAILayout(this as any, imgFile, dropOffsetX, dropOffsetY);
        };
        showImageDropChoice(clientX, clientY, addAsImage, addAsAILayout);
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

      // Video thumbnail rendering (poster 우선, 없으면 src fallback)
      if (typeof kind === "object" && kind.Video) {
        const thumbSrc = (kind.Video.poster || kind.Video.src || "").trim();
        if (thumbSrc) {
          const img = this._imageCache.get(thumbSrc);
          if (!img) { this.loadImageForNode(thumbSrc); continue; }
          const vx = node.x * zoom + panX;
          const vy = node.y * zoom + panY;
          const vw = node.width * zoom;
          const vh = node.height * zoom;
          this.ctx.save();
          this.ctx.globalAlpha = node.opacity ?? 1;
          if (node.corner_radius > 0) {
            const r = node.corner_radius * zoom;
            this.ctx.beginPath();
            this.ctx.roundRect(vx, vy, vw, vh, r);
            this.ctx.clip();
          }
          this.ctx.drawImage(img, vx, vy, vw, vh);
          this.ctx.restore();
        }
        continue;
      }

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

  /** Render 4-point corner pin distortion for Image/Frame nodes */
  private renderCornerPins() {
    const layers = JSON.parse(this.engine.get_layer_list());
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();

    const drawTri = (
      img: CanvasImageSource,
      sx0: number, sy0: number, sx1: number, sy1: number, sx2: number, sy2: number,
      dx0: number, dy0: number, dx1: number, dy1: number, dx2: number, dy2: number,
    ) => {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.moveTo(dx0, dy0);
      this.ctx.lineTo(dx1, dy1);
      this.ctx.lineTo(dx2, dy2);
      this.ctx.closePath();
      this.ctx.clip();

      const det = sx0 * (sy1 - sy2) + sx1 * (sy2 - sy0) + sx2 * (sy0 - sy1);
      if (Math.abs(det) < 1e-6) {
        this.ctx.restore();
        return;
      }

      const a = (dx0 * (sy1 - sy2) + dx1 * (sy2 - sy0) + dx2 * (sy0 - sy1)) / det;
      const b = (dy0 * (sy1 - sy2) + dy1 * (sy2 - sy0) + dy2 * (sy0 - sy1)) / det;
      const c = (dx0 * (sx2 - sx1) + dx1 * (sx0 - sx2) + dx2 * (sx1 - sx0)) / det;
      const d = (dy0 * (sx2 - sx1) + dy1 * (sx0 - sx2) + dy2 * (sx1 - sx0)) / det;
      const e = (dx0 * (sx1 * sy2 - sx2 * sy1) + dx1 * (sx2 * sy0 - sx0 * sy2) + dx2 * (sx0 * sy1 - sx1 * sy0)) / det;
      const f = (dy0 * (sx1 * sy2 - sx2 * sy1) + dy1 * (sx2 * sy0 - sx0 * sy2) + dy2 * (sx0 * sy1 - sx1 * sy0)) / det;
      this.ctx.setTransform(a, b, c, d, e, f);
      this.ctx.drawImage(img, 0, 0);
      this.ctx.restore();
    };

    for (const layer of layers) {
      if (!layer.visible) continue;
      const cpJson = (this.engine as any).get_corner_pin?.(BigInt(layer.id));
      if (!cpJson) continue;
      let cp: any;
      try { cp = JSON.parse(cpJson); } catch { continue; }
      if (!cp) continue;

      const nj = this.engine.get_node_json(BigInt(layer.id));
      if (!nj) continue;
      const node = JSON.parse(nj);
      const isImage = !!node.kind?.Image;
      const isFrame = node.kind === "Frame";
      if (!isImage && !isFrame) continue;

      const x = node.x * zoom + panX;
      const y = node.y * zoom + panY;
      const w = node.width * zoom;
      const h = node.height * zoom;

      const tl = { x: x + (cp.tl_x ?? 0) * w, y: y + (cp.tl_y ?? 0) * h };
      const tr = { x: x + (cp.tr_x ?? 1) * w, y: y + (cp.tr_y ?? 0) * h };
      const br = { x: x + (cp.br_x ?? 1) * w, y: y + (cp.br_y ?? 1) * h };
      const bl = { x: x + (cp.bl_x ?? 0) * w, y: y + (cp.bl_y ?? 1) * h };

      const off = new OffscreenCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
      const oc = off.getContext("2d");
      if (!oc) continue;
      oc.imageSmoothingEnabled = true;

      if (isImage) {
        const src = node.kind.Image.src;
        if (!src) continue;
        const img = this._imageCache.get(src);
        if (!img || !img.complete || img.naturalWidth === 0) continue;
        oc.drawImage(img, 0, 0, off.width, off.height);
      } else if (isFrame) {
        // Frame warp snapshot: capture current canvas region so child content warps together.
        const dpr = window.devicePixelRatio || 1;
        oc.drawImage(
          this.canvas,
          x * dpr,
          y * dpr,
          w * dpr,
          h * dpr,
          0,
          0,
          off.width,
          off.height,
        );
      }

      // Erase flat-rendered original area before drawing warped result
      this.ctx.save();
      this.ctx.globalCompositeOperation = "destination-out";
      this.ctx.fillStyle = "rgba(0,0,0,1)";
      this.ctx.fillRect(x, y, w, h);
      this.ctx.restore();

      const sw = off.width;
      const sh = off.height;
      drawTri(off, 0, 0, sw, 0, sw, sh, tl.x, tl.y, tr.x, tr.y, br.x, br.y);
      drawTri(off, 0, 0, sw, sh, 0, sh, tl.x, tl.y, br.x, br.y, bl.x, bl.y);
    }
  }

  private getSingleSelectedCornerPinNode(): { nodeId: number; node: any; cp: any } | null {
    const sel = Array.from(this.engine.get_selection()).map(Number);
    if (sel.length !== 1) return null;
    const nodeId = sel[0]!;
    const nodeJson = this.engine.get_node_json(BigInt(nodeId));
    if (!nodeJson) return null;
    const node = JSON.parse(nodeJson);
    const isImage = !!node?.kind?.Image;
    const isFrame = node?.kind === "Frame";
    if (!isImage && !isFrame) return null;
    const cpJson = (this.engine as any).get_corner_pin?.(BigInt(nodeId));
    if (!cpJson) return null;
    let cp: any;
    try { cp = JSON.parse(cpJson); } catch { return null; }
    if (!cp) return null;
    return { nodeId, node, cp };
  }

  private getCornerPinScreenPoints(node: any, cp: any): Record<"tl" | "tr" | "br" | "bl", { x: number; y: number }> {
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    const x = node.x * zoom + panX;
    const y = node.y * zoom + panY;
    const w = node.width * zoom;
    const h = node.height * zoom;
    return {
      tl: { x: x + (cp.tl_x ?? 0) * w, y: y + (cp.tl_y ?? 0) * h },
      tr: { x: x + (cp.tr_x ?? 1) * w, y: y + (cp.tr_y ?? 0) * h },
      br: { x: x + (cp.br_x ?? 1) * w, y: y + (cp.br_y ?? 1) * h },
      bl: { x: x + (cp.bl_x ?? 0) * w, y: y + (cp.bl_y ?? 1) * h },
    };
  }

  private hitTestCornerPinHandle(screenX: number, screenY: number): { nodeId: number; corner: "tl" | "tr" | "br" | "bl" } | null {
    if (this._imageCropMode) return null;
    const active = this.getSingleSelectedCornerPinNode();
    if (!active) return null;
    const points = this.getCornerPinScreenPoints(active.node, active.cp);
    const radius = 8;
    const keys: Array<"tl" | "tr" | "br" | "bl"> = ["tl", "tr", "br", "bl"];
    for (const key of keys) {
      const p = points[key];
      const dx = screenX - p.x;
      const dy = screenY - p.y;
      if (dx * dx + dy * dy <= radius * radius) {
        return { nodeId: active.nodeId, corner: key };
      }
    }
    return null;
  }

  private updateCornerPinFromPointer(nodeId: number, corner: "tl" | "tr" | "br" | "bl", screenX: number, screenY: number) {
    const nodeJson = this.engine.get_node_json(BigInt(nodeId));
    if (!nodeJson) return;
    const node = JSON.parse(nodeJson);
    const isImage = !!node?.kind?.Image;
    const isFrame = node?.kind === "Frame";
    if (!isImage && !isFrame) return;
    const cpJson = (this.engine as any).get_corner_pin?.(BigInt(nodeId));
    if (!cpJson) return;
    let cp: any;
    try { cp = JSON.parse(cpJson); } catch { return; }
    if (!cp) return;

    const sx = this.engine.screen_to_scene_x(screenX, screenY);
    const sy = this.engine.screen_to_scene_y(screenX, screenY);
    const nx = node.width !== 0 ? (sx - node.x) / node.width : 0;
    const ny = node.height !== 0 ? (sy - node.y) / node.height : 0;
    const clampedX = Math.max(-1, Math.min(2, nx));
    const clampedY = Math.max(-1, Math.min(2, ny));

    cp[`${corner}_x`] = clampedX;
    cp[`${corner}_y`] = clampedY;
    (this.engine as any).set_corner_pin?.(
      BigInt(nodeId),
      cp.tl_x ?? 0, cp.tl_y ?? 0,
      cp.tr_x ?? 1, cp.tr_y ?? 0,
      cp.br_x ?? 1, cp.br_y ?? 1,
      cp.bl_x ?? 0, cp.bl_y ?? 1,
    );
  }

  private renderCornerPinHandles() {
    if (this.currentTool !== "select") return;
    const active = this.getSingleSelectedCornerPinNode();
    if (!active) return;
    const points = this.getCornerPinScreenPoints(active.node, active.cp);
    const order: Array<"tl" | "tr" | "br" | "bl"> = ["tl", "tr", "br", "bl"];

    this.ctx.save();
    this.ctx.strokeStyle = "#7aa2ff";
    this.ctx.lineWidth = 1.5;
    this.ctx.setLineDash([4, 3]);
    this.ctx.beginPath();
    this.ctx.moveTo(points.tl.x, points.tl.y);
    this.ctx.lineTo(points.tr.x, points.tr.y);
    this.ctx.lineTo(points.br.x, points.br.y);
    this.ctx.lineTo(points.bl.x, points.bl.y);
    this.ctx.closePath();
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    for (const key of order) {
      const p = points[key];
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
      this.ctx.fillStyle = this._cornerPinDragging?.corner === key ? "#0d99ff" : "#ffffff";
      this.ctx.fill();
      this.ctx.strokeStyle = "#0d99ff";
      this.ctx.lineWidth = 1.5;
      this.ctx.stroke();
    }
    this.ctx.restore();
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
  onSelectionChange(fn: (ids: number[]) => void) { this.onSelectionChanges.push(fn); }
  onLayers(fn: () => void) { this.onLayersChanges.push(fn); }
  onLayersChange(fn: () => void) { this.onLayersChanges.push(fn); }
  getSelection(): number[] { return Array.from(this.engine.get_selection()).map(Number); }
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
    if (this._paddingHandles.length > 0) {
      renderPaddingHandles(this.ctx, this._paddingHandles, this._paddingHovered, this._paddingDragging);
    }
    if (this._spacingHandles.length === 0) return;
    renderSpacingHandles(this.ctx, this._spacingHandles, this._spacingHovered, this._spacingDragging);
  }

  private renderConstraintPinsOverlay() {
    this._constraintPinsOverlay = null;
    const sel = Array.from(this.engine.get_selection()).map(Number);
    if (sel.length !== 1) return;

    let node: any;
    try {
      const nodeJson = this.engine.get_node_json(BigInt(sel[0]));
      if (!nodeJson) return;
      node = JSON.parse(nodeJson);
    } catch {
      return;
    }

    if (!node?.parent) return;

    let constraints: { horizontal?: string; vertical?: string } = {};
    try {
      constraints = JSON.parse(this.engine.get_constraints(BigInt(sel[0])) || "{}");
    } catch {
      constraints = {};
    }

    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();

    const sx = (node.x - panX) * zoom;
    const sy = (node.y - panY) * zoom;
    const sw = node.width * zoom;

    const boxSize = 42;
    const slot = 12;
    const radius = 2.5;
    const ctrlW = 24;
    const ctrlH = 14;
    const ctrlGap = 6;
    const extraHeight = ctrlH * 2 + ctrlGap + 12;
    const ox = sx + sw / 2 - boxSize / 2;
    const oy = sy - (boxSize + extraHeight) - 10;

    const controls = [
      { x: ox, y: oy + boxSize + 8, w: ctrlW, h: ctrlH, axis: "h" as const, mode: "scale" },
      { x: ox + boxSize - ctrlW, y: oy + boxSize + 8, w: ctrlW, h: ctrlH, axis: "v" as const, mode: "scale" },
    ];

    this._constraintPinsOverlay = { x: ox, y: oy, boxSize, selectedId: sel[0], controls };

    const active = new Set<number>();
    const hMode = constraints.horizontal || "left";
    const vMode = constraints.vertical || "top";
    const applyH = (h: string) => {
      if (h === "left" || h === "leftAndRight" || h === "scale") [0, 3, 6].forEach((i) => active.add(i));
      if (h === "right" || h === "leftAndRight" || h === "scale") [2, 5, 8].forEach((i) => active.add(i));
      if (h === "center" || h === "scale") [1, 4, 7].forEach((i) => active.add(i));
    };
    const applyV = (v: string) => {
      if (v === "top" || v === "topAndBottom" || v === "scale") [0, 1, 2].forEach((i) => active.add(i));
      if (v === "bottom" || v === "topAndBottom" || v === "scale") [6, 7, 8].forEach((i) => active.add(i));
      if (v === "center" || v === "scale") [3, 4, 5].forEach((i) => active.add(i));
    };

    applyH(hMode);
    applyV(vMode);

    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = "rgba(20,22,30,0.88)";
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(ox - 3, oy - 3, boxSize + 6, boxSize + extraHeight, 8);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(ox, oy, boxSize, boxSize, 8);
    ctx.fillStyle = "rgba(17,18,24,0.95)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.stroke();

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const i = row * 3 + col;
        const x = ox + 9 + col * slot;
        const y = oy + 9 + row * slot;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = active.has(i) ? "#0d99ff" : "rgba(255,255,255,0.32)";
        ctx.fill();
      }
    }

    for (const ctrl of controls) {
      const activeCtrl = ctrl.axis === "h" ? hMode === "scale" : vMode === "scale";
      ctx.beginPath();
      ctx.roundRect(ctrl.x, ctrl.y, ctrl.w, ctrl.h, 4);
      ctx.fillStyle = activeCtrl ? "#0d99ff" : "rgba(47,47,47,0.95)";
      ctx.fill();
      ctx.strokeStyle = activeCtrl ? "#5fbfff" : "rgba(255,255,255,0.18)";
      ctx.stroke();
      ctx.fillStyle = activeCtrl ? "#fff" : "rgba(255,255,255,0.8)";
      ctx.font = "9px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(ctrl.axis === "h" ? "Scale H" : "Scale V", ctrl.x + ctrl.w / 2, ctrl.y + ctrl.h / 2 + 0.5);
    }

    ctx.restore();
  }

  private renderConstraintDebugOverlay() {
    const data = this._constraintDebugOverlay;
    if (!data || data.items.length === 0) return;

    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    const toScreen = (x: number, y: number) => ({ x: (x - panX) * zoom, y: (y - panY) * zoom });

    const pOld = toScreen(data.parent.oldX, data.parent.oldY);
    const pNew = toScreen(data.parent.newX, data.parent.newY);
    const oldW = data.parent.oldW * zoom;
    const oldH = data.parent.oldH * zoom;
    const newW = data.parent.newW * zoom;
    const newH = data.parent.newH * zoom;

    const ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(pOld.x, pOld.y, oldW, oldH);
    ctx.strokeStyle = "rgba(13,153,255,0.95)";
    ctx.strokeRect(pNew.x, pNew.y, newW, newH);
    ctx.setLineDash([]);

    for (const item of data.items) {
      const a = toScreen(item.old.x, item.old.y);
      const b = toScreen(item.next.x, item.next.y);
      const aw = item.old.w * zoom;
      const ah = item.old.h * zoom;
      const bw = item.next.w * zoom;
      const bh = item.next.h * zoom;

      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(a.x, a.y, aw, ah);

      ctx.strokeStyle = "rgba(255,51,102,0.95)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(b.x, b.y, bw, bh);

      ctx.beginPath();
      ctx.moveTo(a.x + aw / 2, a.y + ah / 2);
      ctx.lineTo(b.x + bw / 2, b.y + bh / 2);
      ctx.strokeStyle = "rgba(255,51,102,0.7)";
      ctx.lineWidth = 1;
      ctx.stroke();

      const tag = `${item.hMode} / ${item.vMode}`;
      ctx.font = "10px Inter, sans-serif";
      const tw = ctx.measureText(tag).width + 10;
      const tx = b.x + bw / 2 - tw / 2;
      const ty = b.y - 18;
      ctx.fillStyle = "rgba(16,18,24,0.9)";
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.beginPath();
      ctx.roundRect(tx, ty, tw, 14, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(tag, tx + tw / 2, ty + 7.5);
    }

    ctx.restore();
  }

  private buildConstraintDebugOverlay(nodeId: number, oldX: number, oldY: number, oldW: number, oldH: number, newX: number, newY: number, newW: number, newH: number) {
    this._constraintDebugOverlay = null;
    if (Math.abs(newW - oldW) < 0.001 && Math.abs(newH - oldH) < 0.001) return;

    let parent: any;
    try {
      const json = this.engine.get_node_json(BigInt(nodeId));
      if (!json) return;
      parent = JSON.parse(json);
    } catch {
      return;
    }

    const childIds: number[] = Array.isArray(parent?.children) ? parent.children.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v) && v > 0) : [];
    if (childIds.length === 0) return;

    const sx = oldW > 0 ? newW / oldW : 1;
    const sy = oldH > 0 ? newH / oldH : 1;
    const dw = newW - oldW;
    const dh = newH - oldH;

    const items: Array<{ id: number; label: string; hMode: string; vMode: string; old: { x: number; y: number; w: number; h: number }; next: { x: number; y: number; w: number; h: number } }> = [];

    for (const cid of childIds) {
      try {
        const childJson = this.engine.get_node_json(BigInt(cid));
        if (!childJson) continue;
        const child = JSON.parse(childJson);
        const constraints = JSON.parse(this.engine.get_constraints(BigInt(cid)) || "{}");
        const hMode = (constraints.horizontal || "left") as string;
        const vMode = (constraints.vertical || "top") as string;

        const oldRect = { x: Number(child.x) + oldX, y: Number(child.y) + oldY, w: Number(child.width), h: Number(child.height) };
        let nx = oldRect.x;
        let ny = oldRect.y;
        let nwc = oldRect.w;
        let nhc = oldRect.h;

        switch (hMode) {
          case "right": nx = oldRect.x + dw; break;
          case "leftAndRight": nwc = Math.max(0.1, oldRect.w + dw); break;
          case "center": nx = oldRect.x + dw * 0.5; break;
          case "scale": nx = newX + (oldRect.x - oldX) * sx; nwc = Math.max(0.1, oldRect.w * sx); break;
          default: break;
        }
        switch (vMode) {
          case "bottom": ny = oldRect.y + dh; break;
          case "topAndBottom": nhc = Math.max(0.1, oldRect.h + dh); break;
          case "center": ny = oldRect.y + dh * 0.5; break;
          case "scale": ny = newY + (oldRect.y - oldY) * sy; nhc = Math.max(0.1, oldRect.h * sy); break;
          default: break;
        }

        items.push({
          id: cid,
          label: child.name || `#${cid}`,
          hMode,
          vMode,
          old: oldRect,
          next: { x: nx, y: ny, w: nwc, h: nhc },
        });
      } catch {
        // ignore malformed child
      }
    }

    if (items.length === 0) return;
    this._constraintDebugOverlay = {
      parent: { oldX, oldY, oldW, oldH, newX, newY, newW, newH },
      items,
    };
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

  private renderSearchHighlights() {
    const ids = getSearchHighlightIds();
    if (ids.length === 0) return;
    const ctx = this.ctx;
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    const currentId = getSearchCurrentId();
    for (const id of ids) {
      try {
        const nj = this.engine.get_node_json(BigInt(id));
        if (!nj) continue;
        const node = JSON.parse(nj);
        const sx = (node.x - panX) * zoom;
        const sy = (node.y - panY) * zoom;
        const sw = node.width * zoom;
        const sh = node.height * zoom;
        const isCurrent = id === currentId;
        ctx.save();
        ctx.strokeStyle = isCurrent ? '#ff8800' : 'rgba(255,136,0,0.5)';
        ctx.lineWidth = isCurrent ? 2.5 : 1.5;
        ctx.setLineDash(isCurrent ? [] : [4, 3]);
        ctx.strokeRect(sx - 1, sy - 1, sw + 2, sh + 2);
        ctx.restore();
      } catch {}
    }
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
  get annotationHeatmap() { return this._annotationHeatmap; }

  private renderSearchFilterOverlay() {
    renderSearchFilterDimming(this.ctx, this);
  }

  private renderRemoteNodeLocks() {
    const cursors = this._cursorPresence.getCursors();
    if (!cursors.length) return;

    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    const lockOwners = new Map<number, string>();

    for (const c of cursors) {
      const ids = Array.isArray(c.selectedIds) ? c.selectedIds : [];
      for (const id of ids) {
        if (!lockOwners.has(id)) lockOwners.set(id, c.color || "#7c3aed");
      }
    }
    if (!lockOwners.size) return;

    const ctx = this.ctx;
    ctx.save();
    for (const [id, color] of lockOwners) {
      try {
        const nodeJson = this.engine.get_node_json(BigInt(id));
        if (!nodeJson) continue;
        const node = JSON.parse(nodeJson);
        if (node?.visible === false) continue;

        const sx = (Number(node.x || 0) - panX) * zoom;
        const sy = (Number(node.y || 0) - panY) * zoom;
        const sw = Number(node.width || 0) * zoom;
        const sh = Number(node.height || 0) * zoom;
        if (sw <= 0 || sh <= 0) continue;

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(sx - 1.5, sy - 1.5, sw + 3, sh + 3);

        // tiny lock marker
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.fillRect(sx - 1.5, sy - 14, 24, 12);
        ctx.fillStyle = "#fff";
        ctx.font = "10px Inter, sans-serif";
        ctx.fillText("🔒", sx + 2, sy - 4);
      } catch {
        // ignore invalid ids
      }
    }
    ctx.restore();
  }

  private renderCursorPresence() {
    // Follow mode: sync viewport to followed user's cursor position
    this.tickFollowMode();

    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    this._cursorPresence.render(this.ctx, zoom, panX, panY);

    // Update spatial audio positions from cursor presence data
    if (this._spatialAudio.enabled) {
      const rect = this.canvas.getBoundingClientRect();
      const listenerX = (rect.width / 2 - panX) / zoom;
      const listenerY = (rect.height / 2 - panY) / zoom;
      this._spatialAudio.updateListenerPosition(listenerX, listenerY);
      for (const c of this._cursorPresence.getCursors()) {
        this._spatialAudio.updateUserPosition(c.id, c.x, c.y);
      }
    }
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

    // Annotation brush overlay
    renderAnnotations(this.ctx, zoom, panX, panY);

    // Responsive resize overlay
    if (this._responsiveResize?.isActive) {
      this._responsiveResize.renderOverlay(this.ctx);
    }
  }

  /** Toggle node link arrows visibility (L key) */
  toggleNodeLinks() {
    this._nodeLinksVisible = !this._nodeLinksVisible;
    this.needsRender = true;
  }

  get nodeLinksVisible() { return this._nodeLinksVisible; }

  private renderMotionPathOverlay() {
    // Visualize motion path connections: dashed line from source node to path
    try {
      const clipsJson = this.engine.anim_get_clips();
      const clips: { id: number; name: string }[] = JSON.parse(clipsJson || "[]");
      if (clips.length === 0) return;

      const ctx = this.ctx;
      const zoom = this.engine.get_zoom();
      const panX = this.engine.get_pan_x();
      const panY = this.engine.get_pan_y();

      ctx.save();

      for (const clip of clips) {
        // Check all selected nodes for motion paths
        const selArr = this.engine.get_selection();
        const selIds = Array.from(selArr).map(Number);
        for (const nodeId of selIds) {
          const mpJson = this.engine.anim_get_motion_path(BigInt(clip.id), BigInt(nodeId));
          if (!mpJson || mpJson === "null") continue;
          const mp = JSON.parse(mpJson);
          if (!mp || !mp.path_node_id) continue;

          // Get path samples for visualization
          const samplesJson = this.engine.get_motion_path_samples(BigInt(mp.path_node_id), 50);
          const samples: { x: number; y: number }[] = JSON.parse(samplesJson || "[]");
          if (samples.length < 2) continue;

          // Draw dashed path
          ctx.beginPath();
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = 2;
          ctx.moveTo(samples[0].x * zoom + panX, samples[0].y * zoom + panY);
          for (let i = 1; i < samples.length; i++) {
            ctx.lineTo(samples[i].x * zoom + panX, samples[i].y * zoom + panY);
          }
          ctx.stroke();

          // Draw arrowhead at end
          const last = samples[samples.length - 1];
          const prev = samples[samples.length - 2];
          const angle = Math.atan2(
            (last.y - prev.y),
            (last.x - prev.x)
          );
          const ax = last.x * zoom + panX;
          const ay = last.y * zoom + panY;
          const arrowLen = 10;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax - arrowLen * Math.cos(angle - 0.4), ay - arrowLen * Math.sin(angle - 0.4));
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax - arrowLen * Math.cos(angle + 0.4), ay - arrowLen * Math.sin(angle + 0.4));
          ctx.stroke();

          // Draw small circle at path start
          ctx.beginPath();
          ctx.arc(samples[0].x * zoom + panX, samples[0].y * zoom + panY, 4, 0, Math.PI * 2);
          ctx.fillStyle = "#3b82f6";
          ctx.fill();

          ctx.setLineDash([]);
        }
      }

      ctx.restore();
    } catch {
      // Motion path visualization not available
    }
  }

  private renderNodeLinks() {
    if (!this._nodeLinksVisible) return;
    const allLinksJson = (this.engine as any).get_all_links?.();
    if (!allLinksJson) return;
    let links: any[];
    try { links = JSON.parse(allLinksJson); } catch { return; }
    if (links.length === 0) return;

    const ctx = this.ctx;
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();

    ctx.save();
    for (const link of links) {
      // Compute center of source and target bounding boxes
      const srcCx = link.source_x + link.source_w / 2;
      const srcCy = link.source_y + link.source_h / 2;
      const tgtCx = link.target_x + link.target_w / 2;
      const tgtCy = link.target_y + link.target_h / 2;
      const sx = srcCx * zoom + panX;
      const sy = srcCy * zoom + panY;
      const tx = tgtCx * zoom + panX;
      const ty = tgtCy * zoom + panY;

      // Style by type
      let color: string;
      let dash: number[];
      switch (link.link_type) {
        case "DependsOn":
          color = "#f59e0b"; // amber
          dash = [];
          break;
        case "Related":
          color = "#888888"; // gray
          dash = [6, 4];
          break;
        default: // Reference
          color = "#4a90d9"; // blue
          dash = [6, 4];
          break;
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);

      // Arrowhead
      const angle = Math.atan2(ty - sy, tx - sx);
      const headLen = 8;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - headLen * Math.cos(angle - 0.4), ty - headLen * Math.sin(angle - 0.4));
      ctx.lineTo(tx - headLen * Math.cos(angle + 0.4), ty - headLen * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fill();

      // Label
      if (link.label) {
        const mx = (sx + tx) / 2;
        const my = (sy + ty) / 2;
        ctx.font = "10px Inter, sans-serif";
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.fillText(link.label, mx, my - 4);
      }
    }
    ctx.restore();
  }

  /** Render text flow links (blue dashed bezier curves between linked text nodes) */
  private renderTextFlowLinks() {
    const ctx = this.ctx;
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    const layers = JSON.parse(this.engine.get_layer_list());
    const handleSize = 6;

    ctx.save();

    // Draw links for all text nodes with text_flow_next
    const linked = new Set<number>();
    for (const layer of layers) {
      const id = Number(layer.id);
      const nextVal = this.engine.get_text_flow_next(BigInt(id));
      if (nextVal == null) continue;
      const nextId = Number(nextVal);
      linked.add(id);
      linked.add(nextId);

      const fromJson = this.engine.get_node_json(BigInt(id));
      const toJson = this.engine.get_node_json(BigInt(nextId));
      if (!fromJson || !toJson) continue;
      const fromNode = JSON.parse(fromJson);
      const toNode = JSON.parse(toJson);

      // Source: bottom-right, Target: top-left
      const sx = (fromNode.x + fromNode.width) * zoom + panX;
      const sy = (fromNode.y + fromNode.height) * zoom + panY;
      const tx = toNode.x * zoom + panX;
      const ty = toNode.y * zoom + panY;

      // Blue dashed bezier curve
      const cpOffset = Math.min(80, Math.abs(tx - sx) * 0.4 + 30);
      ctx.strokeStyle = "#4a90d9";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.bezierCurveTo(sx + cpOffset, sy, tx - cpOffset, ty, tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);

      // Source handle: blue ▶ at bottom-right
      ctx.fillStyle = "#4a90d9";
      ctx.beginPath();
      ctx.moveTo(sx - handleSize, sy - handleSize);
      ctx.lineTo(sx + handleSize, sy);
      ctx.lineTo(sx - handleSize, sy + handleSize);
      ctx.closePath();
      ctx.fill();

      // Target handle: blue ● at top-left
      ctx.beginPath();
      ctx.arc(tx, ty, handleSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Show dimmed ▶ handle on selected unlinked text nodes
    const sel = Array.from(this.engine.get_selection()).map(Number);
    if (sel.length === 1 && !linked.has(sel[0])) {
      const selId = sel[0];
      const selJson = this.engine.get_node_json(BigInt(selId));
      if (selJson) {
        const selNode = JSON.parse(selJson);
        if (selNode?.kind?.startsWith?.("Text") || (typeof selNode?.kind === "object" && selNode.kind.Text)) {
          const hx = (selNode.x + selNode.width) * zoom + panX;
          const hy = (selNode.y + selNode.height) * zoom + panY;
          ctx.fillStyle = "rgba(74, 144, 217, 0.3)";
          ctx.beginPath();
          ctx.moveTo(hx - handleSize, hy - handleSize);
          ctx.lineTo(hx + handleSize, hy);
          ctx.lineTo(hx - handleSize, hy + handleSize);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // Draw drag preview line if currently dragging a text flow handle
    if (this._textFlowDragFrom != null && this._textFlowDragPos) {
      const fromJson = this.engine.get_node_json(BigInt(this._textFlowDragFrom));
      if (fromJson) {
        const fromNode = JSON.parse(fromJson);
        const sx = (fromNode.x + fromNode.width) * zoom + panX;
        const sy = (fromNode.y + fromNode.height) * zoom + panY;
        const tx = this._textFlowDragPos.x;
        const ty = this._textFlowDragPos.y;
        const cpOffset = Math.min(80, Math.abs(tx - sx) * 0.4 + 30);
        ctx.strokeStyle = "#4a90d9";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.bezierCurveTo(sx + cpOffset, sy, tx - cpOffset, ty, tx, ty);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.restore();
  }

  // Text flow drag state
  private _textFlowDragFrom: number | null = null;
  private _textFlowDragPos: { x: number; y: number } | null = null;

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

  /** Get spatial audio instance */
  get spatialAudio() { return this._spatialAudio; }

  /** Enable spatial audio (requires user gesture) */
  async enableSpatialAudio(): Promise<boolean> {
    const ok = await this._spatialAudio.enable();
    if (ok) initSpatialAudioPanel(this._spatialAudio);
    return ok;
  }

  /** Toggle spatial audio panel UI */
  toggleSpatialAudioPanel() { toggleSpatialAudioPanel(); }

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
    this._spatialAudio.playChatSound(userId);
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

  /** Render component set dashed purple borders (Figma-style) */
  private renderComponentSetOverlays() {
    try {
      const json = (this.engine as any).get_component_set_render_info?.();
      if (!json) return;
      const sets: Array<{set_id: number; name: string; node_ids: number[]; bounds: {x: number; y: number; w: number; h: number}}> = JSON.parse(json);
      if (sets.length === 0) return;

      const zoom = this.engine.get_zoom();
      const panX = this.engine.get_pan_x();
      const panY = this.engine.get_pan_y();
      const ctx = this.ctx;
      const padding = 20; // scene-space padding around bounds

      for (const s of sets) {
        const b = s.bounds;
        const sx = (b.x - padding) * zoom + panX;
        const sy = (b.y - padding) * zoom + panY;
        const sw = (b.w + padding * 2) * zoom;
        const sh = (b.h + padding * 2) * zoom;

        ctx.save();
        ctx.strokeStyle = "#8b5cf6"; // purple
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        // Rounded rect
        const r = 8;
        ctx.beginPath();
        ctx.roundRect(sx, sy, sw, sh, r);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label
        const label = s.name;
        ctx.font = "bold 10px Inter, sans-serif";
        const tw = ctx.measureText(label).width;
        // Background pill
        ctx.fillStyle = "#8b5cf6";
        ctx.beginPath();
        ctx.roundRect(sx, sy - 20, tw + 16, 18, 4);
        ctx.fill();
        // Text
        ctx.fillStyle = "#fff";
        ctx.textBaseline = "middle";
        ctx.fillText(label, sx + 8, sy - 11);

        // Component set icon (4-diamond grid)
        const ix = sx + tw + 20;
        const iy = sy - 16;
        ctx.fillStyle = "rgba(139, 92, 246, 0.5)";
        ctx.fillRect(ix, iy, 3, 3);
        ctx.fillRect(ix + 4, iy, 3, 3);
        ctx.fillRect(ix, iy + 4, 3, 3);
        ctx.fillRect(ix + 4, iy + 4, 3, 3);

        ctx.restore();
      }
    } catch {}
  }

  /** Export a slice region as PNG/JPG/WebP/SVG (crops the canvas area) */
  exportSlice(
    sliceId: number,
    scale: number = 2,
    format: "png" | "jpg" | "webp" | "svg" = "png",
    suffix: string = "",
    quality?: number,
  ): void {
    const slices: Array<{id: number; name: string; x: number; y: number; width: number; height: number}> = JSON.parse(this.engine.get_slices());
    const slice = slices.find(s => s.id === sliceId);
    if (!slice) return;

    const baseName = slice.name || "slice";
    const ext = format === "jpg" ? "jpg" : format;
    const fileName = `${baseName}${suffix}.${ext}`;

    // SVG export: use engine's SVG exporter for the slice region
    if (format === "svg") {
      const svg = this.engine.export_region_svg(slice.x, slice.y, slice.width, slice.height);
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }

    const w = Math.ceil(slice.width * scale);
    const h = Math.ceil(slice.height * scale);
    const offscreen = document.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext("2d")!;

    // For JPG, fill white background first
    if (format === "jpg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }

    // Set up transform: scale and translate so the slice region fills the canvas
    ctx.scale(scale, scale);
    ctx.translate(-slice.x, -slice.y);

    // Render the full scene onto this cropped canvas
    this.engine.render(ctx as any);
    // Also render images
    this.renderImagesToCtx(ctx, -slice.x, -slice.y, scale);

    const mimeType = format === "jpg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
    const exportQuality = (format === "jpg" || format === "webp") ? (quality ?? 0.92) : undefined;
    offscreen.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    }, mimeType, exportQuality);
  }

  /** Export a slice in multiple scales/formats at once */
  exportSliceBatch(sliceId: number, configs: Array<{scale: number; format: "png" | "jpg" | "webp" | "svg"; suffix: string; quality?: number}>): void {
    configs.forEach((cfg, idx) => {
      // Stagger downloads slightly to avoid browser blocking
      setTimeout(() => {
        this.exportSlice(sliceId, cfg.scale, cfg.format, cfg.suffix, cfg.quality);
      }, idx * 200);
    });
  }

  /** Export multiple slices using the same export configs */
  exportMultiSliceBatch(sliceIds: number[], configs: Array<{scale: number; format: "png" | "jpg" | "webp" | "svg"; suffix: string; quality?: number}>): void {
    let offset = 0;
    for (const sliceId of sliceIds) {
      configs.forEach((cfg) => {
        setTimeout(() => {
          this.exportSlice(sliceId, cfg.scale, cfg.format, cfg.suffix, cfg.quality);
        }, offset);
        offset += 220;
      });
    }
  }

  /** Package descendant slices under a frame/section into a platform-ready zip. */
  async packageFrameSlices(frameId: number, platform: "web" | "android" | "ios"): Promise<boolean> {
    const rootJson = this.engine.get_node_json(BigInt(frameId));
    if (!rootJson) return false;
    const root = JSON.parse(rootJson);
    const kind = typeof root.kind === "string" ? root.kind : Object.keys(root.kind || {})[0];
    if (kind !== "Frame" && kind !== "Section") return false;

    const slices = this.collectDescendantSlices(frameId);
    if (slices.length === 0) return false;

    const files: Record<string, Uint8Array> = {};
    for (const slice of slices) {
      const presets = this.getSliceExportPresets(slice.id, platform);
      for (const preset of presets) {
        const output = await this.renderSliceFile(slice, preset);
        if (!output) continue;
        const ext = preset.format === "jpg" ? "jpg" : preset.format;
        const folder = platform === "android"
          ? `android/${this.getAndroidDensityFolder(preset.scale)}`
          : platform === "ios"
            ? `ios`
            : `web`;
        const nameWithSuffix = `${slice.name || "slice"}${preset.suffix || ""}.${ext}`;
        files[`${folder}/${nameWithSuffix}`] = output;
      }
    }

    if (Object.keys(files).length === 0) return false;
    const zipData = zipSync(files, { level: 6 });
    const blob = new Blob([zipData], { type: "application/zip" });
    const safeName = String(root.name || "frame").trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "frame";
    const filename = `${safeName}-${platform}-assets.zip`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  private collectDescendantSlices(rootId: number): Array<{id:number; name:string; x:number; y:number; width:number; height:number}> {
    const out: Array<{id:number; name:string; x:number; y:number; width:number; height:number}> = [];
    const walk = (id: number) => {
      const json = this.engine.get_node_json(BigInt(id));
      if (!json) return;
      const node = JSON.parse(json);
      const kind = typeof node.kind === "string" ? node.kind : Object.keys(node.kind || {})[0];
      if (kind === "Slice") {
        out.push({ id: Number(node.id), name: String(node.name || "slice"), x: Number(node.x || 0), y: Number(node.y || 0), width: Number(node.width || 0), height: Number(node.height || 0) });
      }
      const children: number[] = Array.isArray(node.children) ? node.children.map((c: any) => Number(c)) : [];
      children.forEach(walk);
    };
    walk(rootId);
    return out;
  }

  private getSliceExportPresets(sliceId: number, platform: "web" | "android" | "ios"): Array<{scale:number; format:"png"|"jpg"|"webp"|"svg"; suffix:string; quality?:number}> {
    try {
      const raw = localStorage.getItem(`opensketch-slice-exports-${sliceId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    if (platform === "ios") return [{ scale: 1, format: "png", suffix: "" }, { scale: 2, format: "png", suffix: "@2x" }, { scale: 3, format: "png", suffix: "@3x" }];
    if (platform === "android") return [{ scale: 1, format: "png", suffix: "" }, { scale: 1.5, format: "png", suffix: "" }, { scale: 2, format: "png", suffix: "" }, { scale: 3, format: "png", suffix: "" }, { scale: 4, format: "png", suffix: "" }];
    return [{ scale: 1, format: "png", suffix: "" }, { scale: 2, format: "webp", suffix: "@2x", quality: 0.9 }];
  }

  private getAndroidDensityFolder(scale: number): string {
    if (scale <= 1.1) return "drawable-mdpi";
    if (scale <= 1.6) return "drawable-hdpi";
    if (scale <= 2.1) return "drawable-xhdpi";
    if (scale <= 3.1) return "drawable-xxhdpi";
    return "drawable-xxxhdpi";
  }

  private async renderSliceFile(
    slice: {id:number; name:string; x:number; y:number; width:number; height:number},
    cfg: {scale:number; format:"png"|"jpg"|"webp"|"svg"; suffix:string; quality?:number},
  ): Promise<Uint8Array | null> {
    if (cfg.format === "svg") {
      const svg = this.engine.export_region_svg(slice.x, slice.y, slice.width, slice.height) || "";
      return strToU8(svg);
    }
    const scale = Math.max(0.1, Number(cfg.scale || 1));
    const w = Math.max(1, Math.ceil(slice.width * scale));
    const h = Math.max(1, Math.ceil(slice.height * scale));
    const offscreen = document.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return null;
    if (cfg.format === "jpg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.scale(scale, scale);
    ctx.translate(-slice.x, -slice.y);
    this.engine.render(ctx as any);
    this.renderImagesToCtx(ctx, -slice.x, -slice.y, scale);
    const mimeType = cfg.format === "jpg" ? "image/jpeg" : cfg.format === "webp" ? "image/webp" : "image/png";
    const quality = (cfg.format === "jpg" || cfg.format === "webp") ? (cfg.quality ?? 0.92) : undefined;
    const blob = await new Promise<Blob | null>((resolve) => offscreen.toBlob(resolve, mimeType, quality));
    if (!blob) return null;
    return new Uint8Array(await blob.arrayBuffer());
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
  onSaveAs(fn: () => void) { this.onSaveAsCallbacks.push(fn); }
  onOpen(fn: () => void) { this.onOpenCallbacks.push(fn); }

  /**
   * Export a specific node (or entire canvas) as PNG data URL.
   * For frames: crops to the frame bounds with padding.
   * Returns a data:image/png;base64 string.
   */
  exportPng(
    nodeId?: number | bigint,
    scale: number = 2,
    padding: number = 0,
    opts?: { pixelAlign?: boolean; nearestNeighbor?: boolean },
  ): string {
    // Pixel-align: temporarily snap all nodes to pixel grid
    let snapshot: string | null = null;
    if (opts?.pixelAlign) {
      snapshot = this.engine.export_scene();
      this.engine.snap_to_pixels();
    }

    let x: number, y: number, w: number, h: number;

    if (nodeId != null) {
      const json = this.engine.get_node_json(BigInt(nodeId));
      if (!json) { if (snapshot) this.engine.import_scene(snapshot); return ""; }
      const node = JSON.parse(json);
      x = node.x - padding;
      y = node.y - padding;
      w = node.width + padding * 2;
      h = node.height + padding * 2;
    } else {
      // Export all: compute bounding box of all nodes
      const layers = JSON.parse(this.engine.get_layer_list());
      if (layers.length === 0) { if (snapshot) this.engine.import_scene(snapshot); return ""; }
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

    // Ensure integer canvas dimensions for pixel-perfect output
    if (opts?.pixelAlign) {
      x = Math.round(x);
      y = Math.round(y);
      w = Math.round(w);
      h = Math.round(h);
    }

    // Create offscreen canvas
    const offCanvas = document.createElement("canvas");
    offCanvas.width = w * scale;
    offCanvas.height = h * scale;
    const offCtx = offCanvas.getContext("2d")!;

    // Nearest-neighbor scaling (crisp pixel art style)
    if (opts?.nearestNeighbor) {
      offCtx.imageSmoothingEnabled = false;
    }

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

    // Restore original scene if we snapped for pixel-align
    if (snapshot) {
      this.engine.import_scene(snapshot);
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
      // Apply variable font axes
      const fvs = text.font_variation_settings;
      if (fvs && typeof fvs === 'object' && Object.keys(fvs).length > 0) {
        const fvsStr = Object.entries(fvs).map(([tag, val]) => `"${tag}" ${val}`).join(', ');
        (ctx as any).fontVariationSettings = fvsStr;
      }
      // Apply OpenType feature settings on canvas
      const otFeatures = text.opentype_features;
      if (otFeatures) {
        const parts: string[] = [];
        if (otFeatures.ligatures === false) parts.push('"liga" 0');
        if (otFeatures.old_style_numerals) parts.push('"onum" 1');
        if (otFeatures.small_caps) parts.push('"smcp" 1');
        if (otFeatures.tabular_numerals) parts.push('"tnum" 1');
        if (parts.length > 0) {
          (ctx as any).fontFeatureSettings = parts.join(', ');
        }
        // Use fontVariantCaps for broader browser support
        if (otFeatures.small_caps) {
          (ctx as any).fontVariantCaps = 'small-caps';
        }
      }
      if (fill) {
        ctx.fillStyle = `rgba(${fill.r},${fill.g},${fill.b},${fill.a})`;
      } else {
        ctx.fillStyle = "#000";
      }
      ctx.textBaseline = "alphabetic";
      const mMetrics = ctx.measureText("M");
      const ascent = mMetrics.actualBoundingBoxAscent || fontSize * 0.8;
      const content = text.content || "";
      const lineH = fontSize * lineHeight;
      const letterSpacing = text.letter_spacing ?? 0;
      if (letterSpacing !== 0) {
        (ctx as any).letterSpacing = `${letterSpacing}px`;
      }
      const textOverflow = node.text_overflow ?? "Visible";
      const isFixed = node.text_sizing === "Fixed";
      const maxW = isFixed ? w : undefined;
      const maxLines = isFixed && h > 0 ? Math.max(1, Math.floor(h / lineH)) : undefined;

      // Word-wrap lines if fixed width
      let lines: string[];
      if (maxW && maxW > 0) {
        lines = [];
        for (const para of content.split('\n')) {
          if (!para) { lines.push(""); continue; }
          const words = para.split(' ');
          let current = "";
          for (const word of words) {
            const test = current ? `${current} ${word}` : word;
            if (ctx.measureText(test).width > maxW && current) {
              lines.push(current);
              current = word;
            } else {
              current = test;
            }
          }
          if (current) lines.push(current);
        }
        if (lines.length === 0) lines.push("");
      } else {
        lines = content.split('\n');
      }

      // Apply text overflow clipping/ellipsis
      const clipNeeded = isFixed && textOverflow !== "Visible";
      if (clipNeeded) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
      }

      // Truncate lines to max visible lines with ellipsis
      let renderLines = lines;
      if (maxLines && lines.length > maxLines && textOverflow === "Ellipsis") {
        renderLines = lines.slice(0, maxLines);
        // Add ellipsis to last visible line
        let lastLine = renderLines[maxLines - 1];
        const ellipsis = "…";
        if (maxW && maxW > 0) {
          while (ctx.measureText(lastLine + ellipsis).width > maxW && lastLine.length > 0) {
            lastLine = lastLine.slice(0, -1);
          }
        }
        renderLines[maxLines - 1] = lastLine + ellipsis;
      } else if (maxLines && textOverflow === "Clip") {
        renderLines = lines.slice(0, maxLines);
      }

      // Also truncate single lines that exceed maxW with ellipsis
      if (maxW && maxW > 0 && textOverflow === "Ellipsis") {
        for (let i = 0; i < renderLines.length; i++) {
          if (ctx.measureText(renderLines[i]).width > maxW) {
            let truncated = renderLines[i];
            const ellipsis = "…";
            while (ctx.measureText(truncated + ellipsis).width > maxW && truncated.length > 0) {
              truncated = truncated.slice(0, -1);
            }
            renderLines[i] = truncated + ellipsis;
          }
        }
      }

      const textAlign = text.text_align ?? "Left";
      for (let i = 0; i < renderLines.length; i++) {
        let tx = x;
        if (isFixed) {
          const lw = ctx.measureText(renderLines[i]).width;
          if (textAlign === "Center") tx = x + (w - lw) / 2;
          else if (textAlign === "Right") tx = x + w - lw;
        }
        ctx.fillText(renderLines[i], tx, y + ascent + lineH * i);
      }
      // Text decorations
      const deco = text.text_decoration ?? "None";
      if (deco !== "None") {
        const hasU = deco === "Underline" || deco === "UnderlineStrikethrough";
        const hasS = deco === "Strikethrough" || deco === "UnderlineStrikethrough";
        ctx.strokeStyle = ctx.fillStyle as string;
        ctx.lineWidth = Math.max(1, fontSize / 14);
        for (let i = 0; i < renderLines.length; i++) {
          const lw = ctx.measureText(renderLines[i]).width;
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
      if (clipNeeded) {
        ctx.restore();
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
   * Export animation clip as Lottie JSON
   */
  exportLottie(clipId: number | bigint): string {
    return this.engine.export_lottie(BigInt(clipId));
  }

  /**
   * Export all animation clips as Lottie JSON array
   */
  exportAllLottie(): string {
    return this.engine.export_all_lottie();
  }

  /**
   * Download animation clip as Lottie JSON file
   */
  downloadLottie(clipId: number | bigint, filename?: string) {
    const json = this.engine.export_lottie(BigInt(clipId));
    if (!json || json === "null") return false;
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "animation.json";
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
    const ext = format === 'tailwind' ? 'js' : format === 'css-variables' || format === 'css' ? 'css' : format === 'scss' ? 'scss' : 'json';
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

  /** Toggle multi-page artboard view (Cmd+Alt+A) */
  toggleArtboardView(): boolean {
    const enabled = this._artboardView.toggle();
    this.needsRender = true;
    return enabled;
  }

  get artboardViewEnabled(): boolean {
    return this._artboardView.enabled;
  }

  /** In artboard view, check if a click hits a page and switch to it */
  artboardViewHitTest(screenX: number, screenY: number): number | null {
    if (!this._artboardView.enabled) return null;
    const dpr = window.devicePixelRatio || 1;
    return this._artboardView.hitTest(screenX, screenY, this.zoom, this.panX, this.panY, dpr);
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

  previewBooleanOperation(op: "union" | "subtract" | "intersect" | "exclude" | null) {
    if (!op) {
      if (this._booleanPreviewBounds) {
        this._booleanPreviewBounds = null;
        this.needsRender = true;
      }
      return;
    }

    const selection = Array.from(this.engine.get_selection());
    if (selection.length < 2) {
      this._booleanPreviewBounds = null;
      this.needsRender = true;
      return;
    }

    const snapshot = this.engine.export_scene();
    try {
      const newId = Number(this.engine.boolean_operation(op));
      const nodeJson = this.engine.get_node_json(BigInt(newId));
      if (nodeJson) {
        const n = JSON.parse(nodeJson);
        this._booleanPreviewBounds = { x: n.x, y: n.y, w: n.width, h: n.height, op };
      } else {
        this._booleanPreviewBounds = null;
      }
    } catch {
      this._booleanPreviewBounds = null;
    } finally {
      this.engine.import_scene(snapshot);
    }
    this.needsRender = true;
  }

  private renderBooleanPreviewOverlay() {
    const b = this._booleanPreviewBounds;
    if (!b) return;
    const zoom = this.engine.get_zoom();
    const panX = this.engine.get_pan_x();
    const panY = this.engine.get_pan_y();
    const x = b.x * zoom + panX;
    const y = b.y * zoom + panY;
    const w = Math.max(1, b.w * zoom);
    const h = Math.max(1, b.h * zoom);

    this.ctx.save();
    this.ctx.fillStyle = "rgba(13,153,255,0.12)";
    this.ctx.strokeStyle = "rgba(13,153,255,0.9)";
    this.ctx.lineWidth = 1.5;
    this.ctx.setLineDash([6, 4]);
    this.ctx.fillRect(x, y, w, h);
    this.ctx.strokeRect(x, y, w, h);
    this.ctx.setLineDash([]);
    this.ctx.fillStyle = "rgba(13,153,255,0.95)";
    this.ctx.font = "11px Inter, sans-serif";
    this.ctx.fillText(`Boolean preview: ${b.op}`, x + 8, y - 8);
    this.ctx.restore();
  }

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

  openBreakpointsPreview() {
    openBreakpointsPreview(this.engine);
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

  // ── Canvas Comparison ──
  private _canvasComparison: ReturnType<typeof import("./ui/canvas-comparison").createCanvasComparison> | null = null;

  openCanvasComparison() {
    if (this._canvasComparison?.isActive()) return;
    import("./ui/canvas-comparison").then(({ createCanvasComparison }) => {
      this._canvasComparison = createCanvasComparison(this);
      this._canvasComparison.show();
    });
  }

  closeCanvasComparison() {
    this._canvasComparison?.hide();
  }

  isCanvasComparisonActive(): boolean {
    return this._canvasComparison?.isActive() ?? false;
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

  detachSelectedInstance() {
    const sel = Array.from(this.engine.get_selection()).map(Number);
    if (sel.length !== 1) return;
    const id = sel[0]!;
    openSymbolDetachPreview(this, id);
  }

  // =============================================
  // Auto-rename layers
  // =============================================

  autoRenameSelection() {
    const sel = Array.from(this.engine.get_selection()).map(Number);
    if (sel.length === 0) return;
    const count = this.engine.auto_rename_selection();
    if (count > 0) {
      (this as any).onLayersChanges?.forEach?.((fn: any) => fn());
      this.requestRender();
    }
  }

  autoRenameAll() {
    const count = this.engine.auto_rename_all();
    if (count > 0) {
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

  /** Toggle responsive auto-layout preview mode on selected frame */
  toggleResponsiveResize() {
    if (this._responsiveResize?.isActive) {
      this._responsiveResize.deactivate(false);
    } else {
      this._responsiveResize?.activate();
    }
    this.needsRender = true;
  }

  get responsiveResize() {
    return this._responsiveResize;
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

  openAIImageGen() {
    openImageGen((dataUrl, w, h, prompt) => {
      // Place image at center of viewport
      const cx = this.scrollX + this.canvas.width / 2 / this.zoom;
      const cy = this.scrollY + this.canvas.height / 2 / this.zoom;
      const scale = Math.min(400 / w, 400 / h, 1); // scale down large images for canvas
      const pw = w * scale;
      const ph = h * scale;
      const id = this.engine.add_image(cx - pw / 2, cy - ph / 2, pw, ph, dataUrl);
      this.engine.set_node_name(BigInt(id), `AI: ${prompt.slice(0, 40)}`);
      this.engine.deselect_all();
      this.engine.select(BigInt(id));
      this.requestRender();
    });
  }

  openComponentSwap() {
    openComponentSwapModal(this);
  }

  openComponentAnalytics(initialComponentId?: number) {
    openComponentAnalytics(this, (nodeId, pageId) => {
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
    }, { initialComponentId });
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

  createRepeatGrid() {
    const sel = Array.from(this.engine.get_selection()).map(Number);
    if (sel.length !== 1) return;
    try {
      this.engine.push_undo();
      const gridId = Number(this.engine.create_repeat_grid(BigInt(sel[0]!)));
      if (gridId) {
        this.engine.deselect_all();
        this.engine.select(BigInt(gridId));
        this.render();
        this.updateUI();
      }
    } catch (e) {
      console.error('create_repeat_grid failed:', e);
    }
  }

  private promptSpacingValue(handle: SpacingHandle) {
    const axis = handle.axis || (handle.direction === "row" ? "horizontal" : "vertical");
    const currentGap = handle.direction === "row" ? handle.sw : handle.sh;
    const seed = Math.round(currentGap);
    const val = window.prompt(`Set spacing (${axis}) in px`, String(seed));
    if (val == null) return;
    const parsed = Number(val.trim());
    if (!Number.isFinite(parsed)) return;
    const newGap = Math.round(parsed);

    this.engine.push_undo();
    if (handle.mode === "selection") {
      this.engine.distribute_selection_with_spacing(axis, newGap);
      this.showToast(`Spacing set to ${newGap}px (selection ${axis})`, 1800);
    } else {
      this.engine.set_layout_gap(BigInt(handle.parentId), newGap);
      this.engine.compute_layout();
      this.showToast(`Auto-layout gap set to ${newGap}px`, 1800);
    }

    this._spacingHandles = findSpacingHandles(this.engine);
    this._paddingHandles = findPaddingHandles(this.engine);
    this.needsRender = true;
    this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
  }

  private applyEqualSpacingForSelection(handle: SpacingHandle) {
    if (handle.mode !== "selection") return;
    const axis = handle.axis || (handle.direction === "row" ? "horizontal" : "vertical");
    try {
      const info = JSON.parse(this.engine.get_selection_spacing(axis));
      const avgGap = Math.round(info.avg_gap ?? 0);
      this.engine.push_undo();
      this.engine.distribute_selection_with_spacing(axis, avgGap);
      this._spacingHandles = findSpacingHandles(this.engine);
      this.needsRender = true;
      this.fireSelectionNow(Array.from(this.engine.get_selection()).map(Number));
      this.showToast(`Equalized spacing to ${avgGap}px (${axis})`, 1800);
    } catch {
      // ignore
    }
  }

  private suggestConvertSelectionToAutoLayout(handle: SpacingHandle) {
    if (handle.mode !== "selection") return;
    const sel = Array.from(this.engine.get_selection()).map(Number);
    if (sel.length < 2) {
      this.showToast("Select at least 2 layers to convert into auto-layout", 1800);
      return;
    }
    const axis = handle.axis || (handle.direction === "row" ? "horizontal" : "vertical");
    const ok = window.confirm(`Convert this selection to an auto-layout frame (${axis})?\n\nTip: use Enter on a spacing handle to type an exact spacing value.`);
    if (!ok) return;

    try {
      this.engine.push_undo();
      const frameId = Number((this.engine as any).wrap_selection_in_frame());
      if (!frameId) return;

      this.engine.set_layout_mode(BigInt(frameId), "flex");
      this.engine.set_flex_direction(BigInt(frameId), axis === "horizontal" ? "row" : "column");
      try {
        const spacingInfo = JSON.parse(this.engine.get_selection_spacing(axis));
        const avgGap = Math.max(0, Math.round(spacingInfo.avg_gap ?? 0));
        this.engine.set_layout_gap(BigInt(frameId), avgGap);
      } catch {
        this.engine.set_layout_gap(BigInt(frameId), 8);
      }
      this.engine.compute_layout();
      this._spacingHandles = findSpacingHandles(this.engine);
      this._paddingHandles = findPaddingHandles(this.engine);
      this.showToast("Converted selection to auto-layout frame", 2200);
      this.render();
      this.updateUI();
    } catch (e) {
      console.error("convert to auto-layout from spacing handle failed:", e);
    }
  }

  wrapSelectionInFrame() {
    const sel = Array.from(this.engine.get_selection()).map(Number);
    if (sel.length === 0) return;
    try {
      const frameId = Number((this.engine as any).wrap_selection_in_frame());
      if (frameId) {
        this.render();
        this.updateUI();
      }
    } catch (e) {
      console.error('wrap_selection_in_frame failed:', e);
    }
  }

  groupSelectionByColor() {
    const sel = Array.from(this.engine.get_selection()).map(Number);
    if (sel.length < 2) return;
    try {
      const resultJson = (this.engine as any).group_selection_by_color();
      const groups = JSON.parse(resultJson);
      if (groups.length > 0) {
        this.render();
        this.updateUI();
      }
    } catch (e) {
      console.error('group_selection_by_color failed:', e);
    }
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
    showBatchRenameDialog(this);
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

    const getNodeKind = (id: number): string | null => {
      try {
        const nj = this.engine.get_node_json(BigInt(id));
        if (!nj) return null;
        const nd = JSON.parse(nj);
        return typeof nd.kind === "string" ? nd.kind : Object.keys(nd.kind || {})[0] || null;
      } catch {
        return null;
      }
    };

    const textSelectionInfo = (() => {
      let textId: number | null = null;
      let pathId: number | null = null;
      for (const sid of selAfter) {
        const kind = getNodeKind(sid);
        if (kind === "Text" && textId == null) textId = sid;
        if (kind === "Path" && pathId == null) pathId = sid;
      }

      let textHasPath = false;
      if (textId != null) {
        try {
          const info = this.engine.get_text_path_info(BigInt(textId));
          textHasPath = info !== "null";
        } catch {
          textHasPath = false;
        }
      }

      return { textId, pathId, textHasPath };
    })();

    const items: MenuItem[] = [];

    if (hasSelAfter) {
      // Node context menu
      items.push({ label: "Copy", shortcut: `${mod}C`, enabled: true, action: () => this.ctxCopy() });
      items.push({ label: "Cut", shortcut: `${mod}X`, enabled: true, action: () => this.ctxCut() });
      items.push({ label: "Paste", shortcut: `${mod}V`, enabled: !!this._clipboard, action: () => this.pasteNodes() });
      items.push({ label: "Paste in Place", shortcut: `${mod}⇧V`, enabled: !!this._clipboard, action: () => this.pasteNodesInPlace() });
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
      items.push({ label: "Auto-rename", enabled: true, action: () => this.autoRenameSelection() });

      if (textSelectionInfo.textId != null && textSelectionInfo.pathId != null) {
        items.push({
          label: "Attach Text to Path",
          enabled: true,
          action: () => {
            this.engine.push_undo();
            this.engine.set_text_path(BigInt(textSelectionInfo.textId!), BigInt(textSelectionInfo.pathId!));
            this.requestRender();
            this.fireSelectionNow(selAfter);
          },
        });
      }
      if (textSelectionInfo.textId != null && textSelectionInfo.textHasPath) {
        items.push({
          label: "Detach Text from Path",
          enabled: true,
          action: () => {
            this.engine.push_undo();
            this.engine.clear_text_path(BigInt(textSelectionInfo.textId!));
            this.requestRender();
            this.fireSelectionNow(selAfter);
          },
        });
      }

      // Reset overrides for Instance nodes
      if (selAfter.length === 1) {
        try {
          const nj = this.engine.get_node_json(BigInt(selAfter[0]!));
          if (nj) {
            const nd = JSON.parse(nj);
            const kindStr = typeof nd.kind === "string" ? nd.kind : Object.keys(nd.kind)[0];
            if (kindStr === "Instance") {
              const ovJson = this.engine.get_instance_overridden_props(BigInt(selAfter[0]!));
              const ovInfo = JSON.parse(ovJson);
              const hasOverrides = ovInfo && ovInfo.overrides && ovInfo.overrides.length > 0;
              items.push({
                label: "Reset Overrides",
                enabled: hasOverrides,
                action: () => {
                  this.engine.reset_all_instance_overrides(BigInt(selAfter[0]!));
                  this.requestRender();
                  this.fireSelectionNow(selAfter);
                },
              });
              items.push({
                label: "Detach Instance",
                shortcut: `${mod}⌥B`,
                action: () => {
                  openSymbolDetachPreview(this, selAfter[0]!);
                },
              });
            }
          }
        } catch { /* ignore */ }
      }
      if (sel.length >= 2) {
        items.push({ label: "Tidy Up", shortcut: `${mod}⇧T`, enabled: true, action: () => this.tidyUpSelection() });
        if (sel.length >= 4) {
          items.push({ label: "Grid Distribute", shortcut: `${mod}⌥G`, enabled: true, action: () => this.smartDistributeGrid() });
        }
        items.push({ label: "Batch Rename…", shortcut: `${mod}⇧R`, enabled: true, action: () => this.showBatchRenameDialog() });
        items.push({ label: "✨ Suggest Layout", shortcut: `${mod}⇧L`, enabled: true, action: () => showLayoutSuggestion(this) });
      }
      if (sel.length >= 1) {
        items.push({ label: "Wrap in Frame", shortcut: `${mod}⌥G`, enabled: true, action: () => this.wrapSelectionInFrame() });
        items.push({ label: "Create Repeat Grid", enabled: selAfter.length === 1, action: () => this.createRepeatGrid() });
      }
      if (selAfter.length === 1) {
        items.push({ label: "Create Repeat Grid", enabled: true, action: () => this.createRepeatGrid(selAfter[0]!) });
      }
      if (sel.length >= 2) {
        items.push({ label: "Group by Color", enabled: true, action: () => this.groupSelectionByColor() });
      }
      items.push({ separator: true, label: "" });
      // Smart Content Fill
      items.push({ label: "Fill with Names", action: () => this.fillSelectionContent("names") });
      items.push({ label: "Fill with Emails", action: () => this.fillSelectionContent("emails") });
      items.push({ label: "Fill with Dates", action: () => this.fillSelectionContent("dates") });
      items.push({ label: "Fill with Phones", action: () => this.fillSelectionContent("phones") });
      items.push({ label: "Fill with Addresses", action: () => this.fillSelectionContent("addresses") });
      items.push({ label: "Fill with Lorem", action: () => this.fillSelectionContent("lorem") });
      items.push({ label: "Fill with Prices", action: () => this.fillSelectionContent("prices") });
      items.push({ label: "Fill with Numbers", action: () => this.fillSelectionContent("numbers") });
      items.push({ label: "Fill with Avatars", action: () => this.fillSelectionContent("avatars") });
      items.push({ separator: true, label: "" });
      items.push({ label: "🎨 AI Image Generation…", action: () => this.openAIImageGen() });
      items.push({ separator: true, label: "" });
      items.push({ label: "Edit All Matching Layers", enabled: selAfter.length === 1, action: () => this.selectSameNameAndKind(selAfter[0]!) });
      items.push({ label: "Select All with Same Name", enabled: selAfter.length === 1, action: () => this.selectSameName(selAfter[0]!) });
      items.push({ label: "Select All with Same Fill", enabled: selAfter.length === 1, action: () => this.selectSameFill(selAfter[0]!) });
      items.push({ label: "Select All with Same Stroke", enabled: selAfter.length === 1, action: () => this.selectSameStroke(selAfter[0]!) });
      items.push({ label: "Select All with Same Font", enabled: selAfter.length === 1, action: () => this.selectSameFont(selAfter[0]!) });
      items.push({ label: "Select All with Same Kind", enabled: selAfter.length === 1, action: () => this.selectSameKind(selAfter[0]!) });
      items.push({ label: "Select Same Kind in Parent", enabled: selAfter.length === 1, action: () => this.selectSameKind(selAfter[0]!, "parent") });
      items.push({ label: "Select Same Kind in Page", enabled: selAfter.length === 1, action: () => this.selectSameKind(selAfter[0]!, "page") });
      items.push({ label: "Add Same Kind to Selection", enabled: selAfter.length === 1, action: () => this.selectSameKind(selAfter[0]!, "document", true) });
      if (selAfter.length === 1) {
        try {
          const raw = this.engine.get_node_json(BigInt(selAfter[0]!));
          if (raw) {
            const refNode = JSON.parse(raw);
            const layerKey = this.inferLayerFilterKeyFromNode(refNode);
            const layerLabelMap: Record<SmartSelectionFilterKey, string> = {
              shape: "Shape",
              text: "Text",
              image: "Image",
              locked: "Locked",
              hidden: "Hidden",
            };
            const layerLabel = layerLabelMap[layerKey];
            items.push({ label: `Select Same ${layerLabel}`, action: () => this.selectSameLayerFilter(selAfter[0]!, layerKey, "document") });
            items.push({ label: `Select Same ${layerLabel} in Parent`, action: () => this.selectSameLayerFilter(selAfter[0]!, layerKey, "parent") });
            items.push({ label: `Select Same ${layerLabel} in Page`, action: () => this.selectSameLayerFilter(selAfter[0]!, layerKey, "page") });
            items.push({ label: `Add Same ${layerLabel} to Selection`, action: () => this.selectSameLayerFilter(selAfter[0]!, layerKey, "document", true) });
          }
        } catch {
          // ignore parse errors
        }
      }
      items.push({ label: "Select Similar…", shortcut: `${mod}⇧A`, enabled: selAfter.length === 1, action: () => this.openSmartSelect(selAfter[0]!) });
      items.push({ label: "Smart Replace…", shortcut: `${mod}⇧H`, enabled: selAfter.length === 1, action: () => this.openSmartReplacePanel(selAfter[0]!) });
    } else {
      // Empty canvas context menu
      items.push({ label: "Paste", shortcut: `${mod}V`, enabled: !!this._clipboard, action: () => this.pasteNodes() });
      items.push({ label: "Paste in Place", shortcut: `${mod}⇧V`, enabled: !!this._clipboard, action: () => this.pasteNodesInPlace() });
      items.push({ label: "Select All", shortcut: `${mod}A`, action: () => this.ctxSelectAll() });
      items.push({ separator: true, label: "" });
      items.push({ label: "Zoom to Fit", shortcut: `${mod}1`, action: () => this.zoomToFit() });
      items.push({ label: "Zoom to 100%", shortcut: `${mod}0`, action: () => this.zoomTo100() });
      items.push({ separator: true, label: "" });
      items.push({ label: "Auto-rename All Layers", action: () => this.autoRenameAll() });
    }

    items.push({ separator: true, label: "" });
    items.push({ label: "Selection Filter — Shape" + (this._smartSelectionFilters.shape ? " ✓" : ""), action: () => this.toggleSmartSelectionFilter("shape") });
    items.push({ label: "Selection Filter — Text" + (this._smartSelectionFilters.text ? " ✓" : ""), action: () => this.toggleSmartSelectionFilter("text") });
    items.push({ label: "Selection Filter — Image" + (this._smartSelectionFilters.image ? " ✓" : ""), action: () => this.toggleSmartSelectionFilter("image") });
    items.push({ label: "Selection Filter — Locked" + (this._smartSelectionFilters.locked ? " ✓" : ""), action: () => this.toggleSmartSelectionFilter("locked") });
    items.push({ label: "Selection Filter — Hidden" + (this._smartSelectionFilters.hidden ? " ✓" : ""), action: () => this.toggleSmartSelectionFilter("hidden") });

    showContextMenu(e.clientX, e.clientY, items);
  }

  private fillSelectionContent(category: string) {
    const sel = Array.from(this.engine.get_selection()).map(Number);
    if (sel.length === 0) return;
    const seed = (Date.now() & 0xFFFFFFFF) >>> 0;
    const filled = this.engine.fill_selection_content(category, seed);
    if (filled > 0) {
      this.requestRender();
      this.fireSelectionNow(sel);
    }
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

  private createRepeatGrid(nodeId: number) {
    this.engine.push_undo();
    const gridId = Number(this.engine.create_repeat_grid(BigInt(nodeId)));
    if (gridId > 0) {
      this.engine.deselect_all();
      this.engine.select(BigInt(gridId));
      this.onLayersChanges.forEach(fn => fn());
      this.fireSelectionNow([gridId]);
      this.needsRender = true;
    }
  }

  private ctxSelectAll() {
    this.engine.select_all();
    const sel = Array.from(this.engine.get_selection()).map(Number);
    this.fireSelectionNow(sel);
    this.needsRender = true;
  }

  private applySelectSameScope(ids: number[], refId: number, scope: "document" | "page" | "parent" = "document", additive = false) {
    let scoped = ids;
    if (scope !== "document") {
      let refNode: any = null;
      try {
        const raw = this.engine.get_node_json(BigInt(refId));
        if (raw) refNode = JSON.parse(raw);
      } catch {
        refNode = null;
      }
      const refParent = Number(refNode?.parent ?? 0);
      const refPage = Number(refNode?.page_id ?? this.engine.get_active_page_id?.() ?? 0);
      scoped = ids.filter((id) => {
        try {
          const raw = this.engine.get_node_json(BigInt(id));
          if (!raw) return false;
          const node = JSON.parse(raw);
          if (scope === "parent") return Number(node?.parent ?? 0) === refParent;
          return Number(node?.page_id ?? refPage) === refPage;
        } catch {
          return false;
        }
      });
    }

    const next = additive ? Array.from(new Set([...Array.from(this.engine.get_selection()).map(Number), ...scoped])) : scoped;
    this.fireSelectionNow(next);
    this.needsRender = true;
  }

  selectSameName(refId: number, scope: "document" | "page" | "parent" = "document", additive = false) {
    const ids = Array.from(this.engine.select_same_name(BigInt(refId))).map(Number);
    this.applySelectSameScope(ids, refId, scope, additive);
  }

  selectSameNameAndKind(refId: number, scope: "document" | "page" | "parent" = "document", additive = false) {
    const ids = Array.from(this.engine.select_same_name_and_kind(BigInt(refId))).map(Number);
    this.applySelectSameScope(ids, refId, scope, additive);
  }

  private selectSameFill(refId: number, scope: "document" | "page" | "parent" = "document", additive = false) {
    const ids = Array.from(this.engine.select_same_fill(refId)).map(Number);
    this.applySelectSameScope(ids, refId, scope, additive);
  }

  private selectSameStroke(refId: number, scope: "document" | "page" | "parent" = "document", additive = false) {
    const ids = Array.from(this.engine.select_same_stroke(refId)).map(Number);
    this.applySelectSameScope(ids, refId, scope, additive);
  }

  private selectSameKind(refId: number, scope: "document" | "page" | "parent" = "document", additive = false) {
    const ids = Array.from(this.engine.select_same_kind(refId)).map(Number);
    this.applySelectSameScope(ids, refId, scope, additive);
  }

  private selectSameFont(refId: number, scope: "document" | "page" | "parent" = "document", additive = false) {
    const ids = Array.from(this.engine.select_same_font(refId)).map(Number);
    this.applySelectSameScope(ids, refId, scope, additive);
  }

  private inferLayerFilterKeyFromNode(node: any): SmartSelectionFilterKey {
    const kind = String(node?.kind || "");
    if (kind === "Text") return "text";
    if (kind === "Image") return "image";
    if (node?.locked === true) return "locked";
    if (node?.visible === false) return "hidden";
    return "shape";
  }

  private selectSameLayerFilter(refId: number, key: SmartSelectionFilterKey, scope: "document" | "page" | "parent" = "document", additive = false) {
    const ids = Array.from(this.engine.get_all_node_ids())
      .map(Number)
      .filter((id) => {
        try {
          const raw = this.engine.get_node_json(BigInt(id));
          if (!raw) return false;
          const node = JSON.parse(raw);
          const kind = String(node?.kind || "");
          if (key === "text") return kind === "Text";
          if (key === "image") return kind === "Image";
          if (key === "locked") return node?.locked === true;
          if (key === "hidden") return node?.visible === false;
          return this.isShapeNodeKind(kind);
        } catch {
          return false;
        }
      });

    this.applySelectSameScope(ids, refId, scope, additive);
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
        const overflow = this.engine.get_overflow(BigInt(nodeId));
        if ((node.kind === "Frame" || node.kind === "Section") && (overflow === "scroll-both" || overflow === "scroll-horizontal" || overflow === "scroll-vertical")) {
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

    const overflow = this.engine.get_overflow(id);
    const scrollsX = overflow === "scroll-both" || overflow === "scroll-horizontal";
    const scrollsY = overflow === "scroll-both" || overflow === "scroll-vertical";

    let newScrollX = scrollsX ? scrollOffset.x - dx : scrollOffset.x;
    let newScrollY = scrollsY ? scrollOffset.y - dy : scrollOffset.y;

    // Clamp: scroll offset is negative (content moves up/left)
    const maxScrollX = Math.min(0, -(contentBounds.width - node.width));
    const maxScrollY = Math.min(0, -(contentBounds.height - node.height));
    if (scrollsX) newScrollX = Math.max(maxScrollX, Math.min(0, newScrollX));
    if (scrollsY) newScrollY = Math.max(maxScrollY, Math.min(0, newScrollY));

    this.engine.set_scroll_offset(id, newScrollX, newScrollY);
    this.needsRender = true;
  }

  /** Show a small toast with the picked color */
  private _showEyedropperToast(hex: string) {
    const existing = document.getElementById("eyedropper-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.id = "eyedropper-toast";
    toast.style.cssText = `
      position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
      display: flex; align-items: center; gap: 8px;
      background: rgba(30,30,46,0.95); border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px; padding: 8px 14px; z-index: 9999;
      font-family: Inter, system-ui, sans-serif; font-size: 12px; color: #ccc;
      backdrop-filter: blur(8px); box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      transition: opacity 0.3s;
    `;
    const swatch = document.createElement("div");
    swatch.style.cssText = `width: 20px; height: 20px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: ${hex};`;
    toast.appendChild(swatch);
    const label = document.createElement("span");
    label.textContent = hex.toUpperCase();
    label.style.cssText = "font-family: 'JetBrains Mono', monospace; font-weight: 500;";
    toast.appendChild(label);
    const copyBtn = document.createElement("button");
    copyBtn.textContent = "Copy";
    copyBtn.style.cssText = "background: none; border: 1px solid #555; border-radius: 4px; padding: 2px 8px; color: #888; cursor: pointer; font-size: 10px;";
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(hex.toUpperCase());
      copyBtn.textContent = "✓";
      setTimeout(() => toast.remove(), 500);
    });
    toast.appendChild(copyBtn);
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = "0"; setTimeout(() => toast.remove(), 300); }, 2500);
  }
}
