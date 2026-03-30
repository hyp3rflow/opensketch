/**
 * Annotation Brush — ephemeral canvas strokes for review (auto-expire after 5s)
 * Exports both functional API (used by editor.ts) and AnnotationBrush class.
 */

const COLORS = ["#ff3b30", "#007aff", "#34c759", "#ffcc00", "#ffffff"];
const WIDTHS = [2, 4, 8];
const TTL_MS = 5000;
const FADE_MS = 500;

interface Stroke {
  points: { x: number; y: number }[];
  color: string;
  width: number;
  opacity: number;
  createdAt: number;
  fadeStart?: number;
  done: boolean;
}

// Module state
let strokes: Stroke[] = [];
let currentStroke: Stroke | null = null;
let activeColor = COLORS[0];
let activeWidth = WIDTHS[1];
let paletteEl: HTMLDivElement | null = null;

// --- Functional API (used by editor.ts) ---

export function beginStroke(sceneX: number, sceneY: number) {
  const stroke: Stroke = {
    points: [{ x: sceneX, y: sceneY }],
    color: activeColor,
    width: activeWidth,
    opacity: 0.7,
    createdAt: Date.now(),
    done: false,
  };
  strokes.push(stroke);
  currentStroke = stroke;
}

export function addStrokePoint(sceneX: number, sceneY: number) {
  if (currentStroke && !currentStroke.done) {
    currentStroke.points.push({ x: sceneX, y: sceneY });
  }
}

export function finishStroke() {
  if (currentStroke) {
    currentStroke.done = true;
    const s = currentStroke;
    // Schedule fade-out after TTL
    setTimeout(() => {
      s.fadeStart = Date.now();
      setTimeout(() => {
        strokes = strokes.filter(st => st !== s);
      }, FADE_MS + 50);
    }, TTL_MS);
    currentStroke = null;
  }
}

export function isDrawing(): boolean {
  return currentStroke != null && !currentStroke.done;
}

/** Called each frame. Returns true if annotations need re-render. */
export function tickAnnotations(): boolean {
  return strokes.length > 0;
}

/** Render all annotation strokes on the canvas overlay */
export function renderAnnotations(ctx: CanvasRenderingContext2D, zoom: number, panX: number, panY: number) {
  if (strokes.length === 0) return;
  const now = Date.now();
  const toSX = (x: number) => (x + panX) * zoom;
  const toSY = (y: number) => (y + panY) * zoom;

  for (const stroke of strokes) {
    if (stroke.points.length < 2) continue;
    let opacity = stroke.opacity;
    if (stroke.fadeStart) {
      const elapsed = now - stroke.fadeStart;
      opacity *= Math.max(0, 1 - elapsed / FADE_MS);
      if (opacity <= 0) continue;
    }

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();

    const pts = stroke.points;
    ctx.moveTo(toSX(pts[0].x), toSY(pts[0].y));
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(toSX(pts[i].x), toSY(pts[i].y), toSX(mx), toSY(my));
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(toSX(last.x), toSY(last.y));
    ctx.stroke();
    ctx.restore();
  }
}

/** Show the color/width palette */
export function renderAnnotationPalette(container: HTMLElement) {
  removeAnnotationPalette(container);
  const el = document.createElement("div");
  el.className = "annotation-palette";
  el.style.cssText = `
    position: fixed; bottom: 60px; left: 50%; transform: translateX(-50%);
    display: flex; gap: 6px; align-items: center;
    background: rgba(30,30,46,0.95); border-radius: 10px; padding: 6px 10px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4); z-index: 1000;
    backdrop-filter: blur(10px);
  `;

  for (const c of COLORS) {
    const btn = document.createElement("button");
    btn.style.cssText = `
      width: 22px; height: 22px; border-radius: 50%;
      border: 2px solid ${c === activeColor ? "#fff" : "transparent"};
      background: ${c}; cursor: pointer; padding: 0; transition: border-color 0.15s;
    `;
    btn.addEventListener("click", () => { activeColor = c; renderAnnotationPalette(container); });
    el.appendChild(btn);
  }

  const sep = document.createElement("div");
  sep.style.cssText = "width:1px; height:20px; background:rgba(255,255,255,0.2); margin:0 4px;";
  el.appendChild(sep);

  for (const w of WIDTHS) {
    const btn = document.createElement("button");
    btn.style.cssText = `
      width: 28px; height: 28px; border-radius: 6px;
      border: 2px solid ${w === activeWidth ? "#fff" : "transparent"};
      background: transparent; cursor: pointer; padding: 0;
      display: flex; align-items: center; justify-content: center;
    `;
    const dot = document.createElement("div");
    dot.style.cssText = `width:${w + 2}px; height:${w + 2}px; border-radius:50%; background:#fff;`;
    btn.appendChild(dot);
    btn.addEventListener("click", () => { activeWidth = w; renderAnnotationPalette(container); });
    el.appendChild(btn);
  }

  container.appendChild(el);
  paletteEl = el;
}

/** Remove the palette */
export function removeAnnotationPalette(_container: HTMLElement) {
  if (paletteEl) { paletteEl.remove(); paletteEl = null; }
}

// --- Class API (alternative, not currently used by editor but exported for compatibility) ---

export class AnnotationBrush {
  private engine: any;
  private canvas: HTMLCanvasElement;
  private active = false;
  private onRender: () => void;

  constructor(engine: any, canvas: HTMLCanvasElement, onRender: () => void) {
    this.engine = engine;
    this.canvas = canvas;
    this.onRender = onRender;
  }

  get isActive() { return this.active; }

  activate() {
    this.active = true;
    this.canvas.style.cursor = "crosshair";
    renderAnnotationPalette(document.body);
  }

  deactivate() {
    this.active = false;
    this.canvas.style.cursor = "";
    removeAnnotationPalette(document.body);
  }
}
