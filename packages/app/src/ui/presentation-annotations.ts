/**
 * Presentation Annotations — Real-time drawing/highlighting overlay for presentation mode.
 * Tools: pointer/laser, pen (freehand), highlighter, arrow, eraser, clear.
 * All drawings are ephemeral (not saved to the scene).
 */

type AnnotationTool = "pointer" | "pen" | "highlighter" | "arrow" | "eraser";

interface Point { x: number; y: number; }

interface Stroke {
  tool: "pen" | "highlighter";
  points: Point[];
  color: string;
  width: number;
}

interface Arrow {
  start: Point;
  end: Point;
  color: string;
  width: number;
}

type Annotation = Stroke | Arrow;

function isArrow(a: Annotation): a is Arrow {
  return "start" in a && "end" in a;
}

export interface AnnotationState {
  annotations: Annotation[];
  currentTool: AnnotationTool;
  color: string;
  penWidth: number;
  highlighterWidth: number;
}

export function createPresentationAnnotations(container: HTMLElement) {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;z-index:3;cursor:crosshair;pointer-events:none;";
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d")!;

  const state: AnnotationState = {
    annotations: [],
    currentTool: "pointer",
    color: "#ff3366",
    penWidth: 3,
    highlighterWidth: 20,
  };

  let drawing = false;
  let currentStrokePoints: Point[] = [];
  let arrowStart: Point | null = null;
  let laserPos: Point | null = null;
  let laserFadeTimer: number | null = null;

  // Toolbar
  let toolbar: HTMLDivElement | null = null;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = container.clientWidth * dpr;
    canvas.height = container.clientHeight * dpr;
    canvas.style.width = `${container.clientWidth}px`;
    canvas.style.height = `${container.clientHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }

  function enable() {
    canvas.style.pointerEvents = "auto";
    buildToolbar();
    resize();
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", onKeyDown);
  }

  function disable() {
    canvas.style.pointerEvents = "none";
    toolbar?.remove();
    toolbar = null;
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    window.removeEventListener("resize", resize);
    window.removeEventListener("keydown", onKeyDown);
    laserPos = null;
    render();
  }

  function destroy() {
    disable();
    canvas.remove();
  }

  function clear() {
    state.annotations = [];
    render();
  }

  function undo() {
    if (state.annotations.length > 0) {
      state.annotations.pop();
      render();
    }
  }

  function setTool(tool: AnnotationTool) {
    state.currentTool = tool;
    updateCursor();
    updateToolbarSelection();
  }

  function setColor(color: string) {
    state.color = color;
  }

  function updateCursor() {
    switch (state.currentTool) {
      case "pointer":
        canvas.style.cursor = "default";
        break;
      case "pen":
      case "highlighter":
        canvas.style.cursor = "crosshair";
        break;
      case "arrow":
        canvas.style.cursor = "crosshair";
        break;
      case "eraser":
        canvas.style.cursor = "grab";
        break;
    }
  }

  // --- Drawing ---

  function onPointerDown(e: PointerEvent) {
    const p = getPoint(e);

    if (state.currentTool === "eraser") {
      eraseAt(p);
      drawing = true;
      return;
    }

    if (state.currentTool === "pointer") {
      laserPos = p;
      if (laserFadeTimer) clearTimeout(laserFadeTimer);
      render();
      drawing = true;
      return;
    }

    if (state.currentTool === "arrow") {
      arrowStart = p;
      drawing = true;
      return;
    }

    // pen or highlighter
    drawing = true;
    currentStrokePoints = [p];
    canvas.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!drawing) {
      if (state.currentTool === "pointer") {
        // No laser when not pressed
      }
      return;
    }

    const p = getPoint(e);

    if (state.currentTool === "pointer") {
      laserPos = p;
      render();
      return;
    }

    if (state.currentTool === "eraser") {
      eraseAt(p);
      return;
    }

    if (state.currentTool === "arrow") {
      // Preview arrow
      render();
      if (arrowStart) drawArrow(ctx, arrowStart, p, state.color, state.penWidth);
      return;
    }

    currentStrokePoints.push(p);
    render();
    drawStrokePreview();
  }

  function onPointerUp(e: PointerEvent) {
    if (!drawing) return;
    drawing = false;

    const p = getPoint(e);

    if (state.currentTool === "pointer") {
      // Fade laser after a moment
      laserFadeTimer = window.setTimeout(() => {
        laserPos = null;
        render();
      }, 800);
      return;
    }

    if (state.currentTool === "arrow" && arrowStart) {
      if (distance(arrowStart, p) > 5) {
        state.annotations.push({
          start: arrowStart,
          end: p,
          color: state.color,
          width: state.penWidth,
        });
      }
      arrowStart = null;
      render();
      return;
    }

    if (state.currentTool === "pen" || state.currentTool === "highlighter") {
      if (currentStrokePoints.length > 1) {
        state.annotations.push({
          tool: state.currentTool,
          points: [...currentStrokePoints],
          color: state.color,
          width: state.currentTool === "highlighter" ? state.highlighterWidth : state.penWidth,
        });
      }
      currentStrokePoints = [];
      render();
    }
  }

  function onPointerLeave(_e: PointerEvent) {
    if (state.currentTool === "pointer" && !drawing) {
      laserPos = null;
      render();
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    // Tool shortcuts
    switch (e.key) {
      case "1": setTool("pointer"); break;
      case "2": setTool("pen"); break;
      case "3": setTool("highlighter"); break;
      case "4": setTool("arrow"); break;
      case "5": setTool("eraser"); break;
      case "c": case "C":
        if (!e.metaKey && !e.ctrlKey) clear();
        break;
      case "z": case "Z":
        if (e.metaKey || e.ctrlKey) { e.preventDefault(); undo(); }
        break;
    }
  }

  function getPoint(e: PointerEvent): Point {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function distance(a: Point, b: Point): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }

  function eraseAt(p: Point) {
    const threshold = 15;
    const before = state.annotations.length;
    state.annotations = state.annotations.filter(a => {
      if (isArrow(a)) {
        return distToSegment(p, a.start, a.end) > threshold;
      }
      // Stroke
      const stroke = a as Stroke;
      return !stroke.points.some(sp => distance(sp, p) < threshold);
    });
    if (state.annotations.length !== before) render();
  }

  function distToSegment(p: Point, a: Point, b: Point): number {
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return distance(p, a);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
  }

  // --- Rendering ---

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const a of state.annotations) {
      if (isArrow(a)) {
        drawArrow(ctx, a.start, a.end, a.color, a.width);
      } else {
        drawStroke(ctx, a);
      }
    }

    // Laser pointer
    if (laserPos && state.currentTool === "pointer") {
      ctx.save();
      ctx.beginPath();
      ctx.arc(laserPos.x, laserPos.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 51, 102, 0.8)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(laserPos.x, laserPos.y, 16, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 51, 102, 0.2)";
      ctx.fill();
      ctx.restore();
    }
  }

  function drawStrokePreview() {
    if (currentStrokePoints.length < 2) return;
    const tool = state.currentTool as "pen" | "highlighter";
    drawStroke(ctx, {
      tool,
      points: currentStrokePoints,
      color: state.color,
      width: tool === "highlighter" ? state.highlighterWidth : state.penWidth,
    });
  }

  function drawStroke(c: CanvasRenderingContext2D, s: Stroke) {
    if (s.points.length < 2) return;
    c.save();
    c.lineCap = "round";
    c.lineJoin = "round";
    c.lineWidth = s.width;

    if (s.tool === "highlighter") {
      c.globalAlpha = 0.35;
      c.strokeStyle = s.color;
    } else {
      c.globalAlpha = 1;
      c.strokeStyle = s.color;
    }

    c.beginPath();
    c.moveTo(s.points[0].x, s.points[0].y);

    // Smooth with quadratic curves
    for (let i = 1; i < s.points.length - 1; i++) {
      const mid = {
        x: (s.points[i].x + s.points[i + 1].x) / 2,
        y: (s.points[i].y + s.points[i + 1].y) / 2,
      };
      c.quadraticCurveTo(s.points[i].x, s.points[i].y, mid.x, mid.y);
    }
    const last = s.points[s.points.length - 1];
    c.lineTo(last.x, last.y);
    c.stroke();
    c.restore();
  }

  function drawArrow(c: CanvasRenderingContext2D, start: Point, end: Point, color: string, width: number) {
    const headLen = Math.max(width * 5, 15);
    const angle = Math.atan2(end.y - start.y, end.x - start.x);

    c.save();
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = width;
    c.lineCap = "round";
    c.lineJoin = "round";

    // Line
    c.beginPath();
    c.moveTo(start.x, start.y);
    c.lineTo(end.x, end.y);
    c.stroke();

    // Arrowhead
    c.beginPath();
    c.moveTo(end.x, end.y);
    c.lineTo(
      end.x - headLen * Math.cos(angle - Math.PI / 6),
      end.y - headLen * Math.sin(angle - Math.PI / 6)
    );
    c.lineTo(
      end.x - headLen * Math.cos(angle + Math.PI / 6),
      end.y - headLen * Math.sin(angle + Math.PI / 6)
    );
    c.closePath();
    c.fill();
    c.restore();
  }

  // --- Toolbar ---

  function buildToolbar() {
    toolbar = document.createElement("div");
    toolbar.style.cssText = `
      position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:5;
      display:flex;gap:4px;padding:6px 10px;
      background:rgba(20,20,30,0.9);backdrop-filter:blur(12px);
      border-radius:10px;border:1px solid rgba(255,255,255,0.12);
      box-shadow:0 4px 16px rgba(0,0,0,0.4);
    `;

    const tools: { id: AnnotationTool; label: string; icon: string; key: string }[] = [
      { id: "pointer", label: "Laser pointer", icon: pointerSvg, key: "1" },
      { id: "pen", label: "Pen", icon: penSvg, key: "2" },
      { id: "highlighter", label: "Highlighter", icon: highlighterSvg, key: "3" },
      { id: "arrow", label: "Arrow", icon: arrowSvg, key: "4" },
      { id: "eraser", label: "Eraser", icon: eraserSvg, key: "5" },
    ];

    for (const t of tools) {
      const btn = document.createElement("button");
      btn.dataset.tool = t.id;
      btn.title = `${t.label} (${t.key})`;
      btn.innerHTML = t.icon;
      btn.style.cssText = `
        width:32px;height:32px;display:flex;align-items:center;justify-content:center;
        background:none;border:none;border-radius:6px;cursor:pointer;padding:0;
        color:#aaa;transition:all 0.15s;
      `;
      btn.addEventListener("click", () => setTool(t.id));
      btn.addEventListener("mouseenter", () => {
        if (state.currentTool !== t.id) btn.style.background = "rgba(255,255,255,0.1)";
      });
      btn.addEventListener("mouseleave", () => {
        if (state.currentTool !== t.id) btn.style.background = "none";
      });
      toolbar.appendChild(btn);
    }

    // Separator
    const sep1 = document.createElement("div");
    sep1.style.cssText = "width:1px;background:rgba(255,255,255,0.15);margin:2px 4px;";
    toolbar.appendChild(sep1);

    // Color swatches
    const colors = ["#ff3366", "#ff9900", "#ffdd00", "#33cc66", "#3399ff", "#cc66ff", "#ffffff"];
    for (const c of colors) {
      const swatch = document.createElement("button");
      swatch.style.cssText = `
        width:20px;height:20px;border-radius:50%;border:2px solid ${state.color === c ? "#fff" : "transparent"};
        background:${c};cursor:pointer;padding:0;margin:0 1px;transition:border-color 0.15s;
      `;
      swatch.title = c;
      swatch.addEventListener("click", () => {
        setColor(c);
        // Update all swatch borders
        toolbar?.querySelectorAll<HTMLButtonElement>("[data-color]").forEach(s => {
          s.style.borderColor = s.dataset.color === c ? "#fff" : "transparent";
        });
        swatch.style.borderColor = "#fff";
      });
      swatch.dataset.color = c;
      toolbar.appendChild(swatch);
    }

    // Separator
    const sep2 = document.createElement("div");
    sep2.style.cssText = "width:1px;background:rgba(255,255,255,0.15);margin:2px 4px;";
    toolbar.appendChild(sep2);

    // Undo
    const undoBtn = makeToolBtn("Undo (⌘Z)", undoSvg, undo);
    toolbar.appendChild(undoBtn);

    // Clear
    const clearBtn = makeToolBtn("Clear (C)", clearSvg, clear);
    toolbar.appendChild(clearBtn);

    // Close annotations
    const closeBtn = makeToolBtn("Close annotations", closeSvg, disable);
    toolbar.appendChild(closeBtn);

    container.appendChild(toolbar);
    updateToolbarSelection();
  }

  function makeToolBtn(title: string, icon: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.title = title;
    btn.innerHTML = icon;
    btn.style.cssText = `
      width:32px;height:32px;display:flex;align-items:center;justify-content:center;
      background:none;border:none;border-radius:6px;cursor:pointer;padding:0;
      color:#aaa;transition:all 0.15s;
    `;
    btn.addEventListener("click", onClick);
    btn.addEventListener("mouseenter", () => { btn.style.background = "rgba(255,255,255,0.1)"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = "none"; });
    return btn;
  }

  function updateToolbarSelection() {
    if (!toolbar) return;
    toolbar.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach(btn => {
      const active = btn.dataset.tool === state.currentTool;
      btn.style.background = active ? "rgba(74,144,217,0.4)" : "none";
      btn.style.color = active ? "#fff" : "#aaa";
    });
  }

  // --- Inline SVG icons (16x16) ---

  const pointerSvg = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"/><line x1="8" y1="1" x2="8" y2="3"/><line x1="8" y1="13" x2="8" y2="15"/><line x1="1" y1="8" x2="3" y2="8"/><line x1="13" y1="8" x2="15" y2="8"/></svg>`;

  const penSvg = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 1.5l3 3L5 14H2v-3z"/></svg>`;

  const highlighterSvg = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2l4 4-7 7H4v-3z"/><line x1="2" y1="14" x2="6" y2="14"/></svg>`;

  const arrowSvg = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="14" x2="14" y2="2"/><polyline points="8,2 14,2 14,8"/></svg>`;

  const eraserSvg = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 14h7M3 11l5-5 4 4-5 5-4-4z"/><path d="M8 6L12 2"/></svg>`;

  const undoSvg = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4,7 1,4 4,1"/><path d="M1 4h10a4 4 0 0 1 0 8H8"/></svg>`;

  const clearSvg = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>`;

  const closeSvg = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="12" height="12" rx="2"/><line x1="6" y1="6" x2="10" y2="10"/><line x1="10" y1="6" x2="6" y2="10"/></svg>`;

  return { enable, disable, destroy, clear, undo, setTool, setColor, resize, state };
}
