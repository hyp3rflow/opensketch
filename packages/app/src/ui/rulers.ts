/**
 * Rulers & Guides — Figma-style rulers at top/left edges with draggable guide lines.
 *
 * Rulers show tick marks + numbers that update with zoom/pan.
 * Drag from a ruler to create a guide line. Double-click a guide to remove it.
 * Guides integrate with smart-guides snapping.
 */
import type { Editor } from "../editor";

const RULER_SIZE = 20; // px
const RULER_BG = "#2a2a2a";
const RULER_BORDER = "rgba(255,255,255,0.06)";
const RULER_TICK = "#555";
const RULER_TEXT = "#888";
const GUIDE_COLOR = "#4a90d9";
const GUIDE_DRAG_COLOR = "#6db3f8";

export interface Guide {
  axis: "h" | "v"; // h = horizontal guide (Y value), v = vertical guide (X value)
  pos: number; // scene-space coordinate
}

export function setupRulers(workspace: HTMLElement, editor: Editor) {
  // Create ruler canvases
  const hRuler = document.createElement("canvas");
  hRuler.className = "ruler ruler-h";
  const vRuler = document.createElement("canvas");
  vRuler.className = "ruler ruler-v";
  const corner = document.createElement("div");
  corner.className = "ruler-corner";

  workspace.appendChild(corner);
  workspace.appendChild(hRuler);
  workspace.appendChild(vRuler);

  const hCtx = hRuler.getContext("2d")!;
  const vCtx = vRuler.getContext("2d")!;

  const guides: Guide[] = [];
  let draggingGuide: { axis: "h" | "v"; pos: number; isNew: boolean; index: number } | null = null;

  function resize() {
    const rect = workspace.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    hRuler.width = rect.width * dpr;
    hRuler.height = RULER_SIZE * dpr;
    hRuler.style.width = rect.width + "px";
    hRuler.style.height = RULER_SIZE + "px";
    vRuler.width = RULER_SIZE * dpr;
    vRuler.height = rect.height * dpr;
    vRuler.style.width = RULER_SIZE + "px";
    vRuler.style.height = rect.height + "px";
  }

  function getTickInterval(zoom: number): { major: number; minor: number } {
    // Choose tick spacing based on zoom so ticks are 50-200px apart on screen
    const targets = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
    const idealMajor = 100 / zoom; // ~100px screen spacing
    let major = targets[targets.length - 1];
    for (const t of targets) {
      if (t * zoom >= 50) { major = t; break; }
    }
    // Minor = major / 5 or / 2
    const minor = major >= 10 ? major / 5 : major / 2;
    return { major, minor };
  }

  function renderHorizontalRuler() {
    const dpr = window.devicePixelRatio || 1;
    const w = hRuler.width / dpr;
    const h = RULER_SIZE;
    hCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    hCtx.clearRect(0, 0, w, h);

    // Background
    hCtx.fillStyle = RULER_BG;
    hCtx.fillRect(0, 0, w, h);
    hCtx.strokeStyle = RULER_BORDER;
    hCtx.lineWidth = 1;
    hCtx.beginPath();
    hCtx.moveTo(0, h - 0.5);
    hCtx.lineTo(w, h - 0.5);
    hCtx.stroke();

    const zoom = editor.engine.get_zoom();
    const panX = editor.engine.get_pan_x();
    const { major, minor } = getTickInterval(zoom);

    // Scene range visible
    const startScene = -panX / zoom;
    const endScene = (w - panX) / zoom;
    const firstMinor = Math.floor(startScene / minor) * minor;

    hCtx.fillStyle = RULER_TEXT;
    hCtx.font = "9px Inter, system-ui, sans-serif";
    hCtx.textBaseline = "top";
    hCtx.strokeStyle = RULER_TICK;
    hCtx.lineWidth = 1;

    for (let v = firstMinor; v <= endScene; v += minor) {
      const sx = v * zoom + panX;
      if (sx < RULER_SIZE || sx > w) continue;
      const isMajor = Math.abs(v % major) < 0.01;
      const tickH = isMajor ? 10 : 5;
      const x = Math.round(sx) + 0.5;

      hCtx.beginPath();
      hCtx.moveTo(x, h);
      hCtx.lineTo(x, h - tickH);
      hCtx.stroke();

      if (isMajor) {
        hCtx.fillText(String(Math.round(v)), x + 2, 2);
      }
    }
  }

  function renderVerticalRuler() {
    const dpr = window.devicePixelRatio || 1;
    const w = RULER_SIZE;
    const h = vRuler.height / dpr;
    vCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    vCtx.clearRect(0, 0, w, h);

    vCtx.fillStyle = RULER_BG;
    vCtx.fillRect(0, 0, w, h);
    vCtx.strokeStyle = RULER_BORDER;
    vCtx.lineWidth = 1;
    vCtx.beginPath();
    vCtx.moveTo(w - 0.5, 0);
    vCtx.lineTo(w - 0.5, h);
    vCtx.stroke();

    const zoom = editor.engine.get_zoom();
    const panY = editor.engine.get_pan_y();
    const { major, minor } = getTickInterval(zoom);

    const startScene = -panY / zoom;
    const endScene = (h - panY) / zoom;
    const firstMinor = Math.floor(startScene / minor) * minor;

    vCtx.fillStyle = RULER_TEXT;
    vCtx.font = "9px Inter, system-ui, sans-serif";
    vCtx.strokeStyle = RULER_TICK;
    vCtx.lineWidth = 1;

    for (let v = firstMinor; v <= endScene; v += minor) {
      const sy = v * zoom + panY;
      if (sy < RULER_SIZE || sy > h) continue;
      const isMajor = Math.abs(v % major) < 0.01;
      const tickW = isMajor ? 10 : 5;
      const y = Math.round(sy) + 0.5;

      vCtx.beginPath();
      vCtx.moveTo(w, y);
      vCtx.lineTo(w - tickW, y);
      vCtx.stroke();

      if (isMajor) {
        vCtx.save();
        vCtx.translate(2, y + 2);
        vCtx.rotate(-Math.PI / 2);
        vCtx.textBaseline = "top";
        vCtx.fillText(String(Math.round(v)), 0, 0);
        vCtx.restore();
      }
    }
  }

  function render() {
    renderHorizontalRuler();
    renderVerticalRuler();
  }

  // Drag from ruler to create guide
  function onHRulerPointerDown(e: PointerEvent) {
    e.preventDefault();
    const zoom = editor.engine.get_zoom();
    const panY = editor.engine.get_pan_y();
    const rect = workspace.getBoundingClientRect();
    const screenY = e.clientY - rect.top;
    const sceneY = (screenY - panY) / zoom;
    const idx = guides.length;
    guides.push({ axis: "h", pos: sceneY });
    draggingGuide = { axis: "h", pos: sceneY, isNew: true, index: idx };
    hRuler.setPointerCapture(e.pointerId);
    document.body.style.cursor = "row-resize";
  }

  function onVRulerPointerDown(e: PointerEvent) {
    e.preventDefault();
    const zoom = editor.engine.get_zoom();
    const panX = editor.engine.get_pan_x();
    const rect = workspace.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const sceneX = (screenX - panX) / zoom;
    const idx = guides.length;
    guides.push({ axis: "v", pos: sceneX });
    draggingGuide = { axis: "v", pos: sceneX, isNew: true, index: idx };
    vRuler.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
  }

  function onPointerMove(e: PointerEvent) {
    if (!draggingGuide) return;
    const rect = workspace.getBoundingClientRect();
    const zoom = editor.engine.get_zoom();
    if (draggingGuide.axis === "h") {
      const panY = editor.engine.get_pan_y();
      const screenY = e.clientY - rect.top;
      const sceneY = (screenY - panY) / zoom;
      guides[draggingGuide.index].pos = sceneY;
      draggingGuide.pos = sceneY;
    } else {
      const panX = editor.engine.get_pan_x();
      const screenX = e.clientX - rect.left;
      const sceneX = (screenX - panX) / zoom;
      guides[draggingGuide.index].pos = sceneX;
      draggingGuide.pos = sceneX;
    }
    editor.requestRender();
  }

  function onPointerUp(e: PointerEvent) {
    if (!draggingGuide) return;
    const rect = workspace.getBoundingClientRect();
    // Remove guide if dragged back onto ruler
    if (draggingGuide.axis === "h" && (e.clientY - rect.top) < RULER_SIZE) {
      guides.splice(draggingGuide.index, 1);
    } else if (draggingGuide.axis === "v" && (e.clientX - rect.left) < RULER_SIZE) {
      guides.splice(draggingGuide.index, 1);
    }
    draggingGuide = null;
    document.body.style.cursor = "";
    editor.requestRender();
  }

  hRuler.addEventListener("pointerdown", onHRulerPointerDown);
  vRuler.addEventListener("pointerdown", onVRulerPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("resize", () => { resize(); render(); });

  // Initial setup
  resize();

  // Expose for editor integration
  return {
    guides,
    render,
    resize,
    /** Render guide lines on the main canvas */
    renderGuideLines(ctx: CanvasRenderingContext2D, zoom: number, panX: number, panY: number, canvasW: number, canvasH: number) {
      if (guides.length === 0 && !draggingGuide) return;
      ctx.save();
      ctx.lineWidth = 1;
      ctx.setLineDash([]);

      for (let i = 0; i < guides.length; i++) {
        const g = guides[i];
        const isDragging = draggingGuide && draggingGuide.index === i;
        ctx.strokeStyle = isDragging ? GUIDE_DRAG_COLOR : GUIDE_COLOR;

        ctx.beginPath();
        if (g.axis === "h") {
          const y = Math.round(g.pos * zoom + panY) + 0.5;
          ctx.moveTo(0, y);
          ctx.lineTo(canvasW, y);
        } else {
          const x = Math.round(g.pos * zoom + panX) + 0.5;
          ctx.moveTo(x, 0);
          ctx.lineTo(x, canvasH);
        }
        ctx.stroke();
      }

      ctx.restore();
    },
    /** Find guide near screen position and start dragging it. Returns true if found. */
    tryGrabGuide(screenX: number, screenY: number, zoom: number, panX: number, panY: number): boolean {
      const threshold = 4; // screen px
      for (let i = 0; i < guides.length; i++) {
        const g = guides[i];
        if (g.axis === "h") {
          const gy = g.pos * zoom + panY;
          if (Math.abs(screenY - gy) < threshold) {
            draggingGuide = { axis: "h", pos: g.pos, isNew: false, index: i };
            document.body.style.cursor = "row-resize";
            return true;
          }
        } else {
          const gx = g.pos * zoom + panX;
          if (Math.abs(screenX - gx) < threshold) {
            draggingGuide = { axis: "v", pos: g.pos, isNew: false, index: i };
            document.body.style.cursor = "col-resize";
            return true;
          }
        }
      }
      return false;
    },
    /** Remove guide by double-click */
    removeGuideAt(screenX: number, screenY: number, zoom: number, panX: number, panY: number): boolean {
      const threshold = 4;
      for (let i = 0; i < guides.length; i++) {
        const g = guides[i];
        if (g.axis === "h") {
          const gy = g.pos * zoom + panY;
          if (Math.abs(screenY - gy) < threshold) {
            guides.splice(i, 1);
            return true;
          }
        } else {
          const gx = g.pos * zoom + panX;
          if (Math.abs(screenX - gx) < threshold) {
            guides.splice(i, 1);
            return true;
          }
        }
      }
      return false;
    },
    /** Get guide positions for snapping integration */
    getSnapPositions(): { xs: number[]; ys: number[] } {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const g of guides) {
        if (g.axis === "v") xs.push(g.pos);
        else ys.push(g.pos);
      }
      return { xs, ys };
    },
    clearGuides() {
      guides.length = 0;
      editor.requestRender();
    },
  };
}

export type RulersAPI = ReturnType<typeof setupRulers>;
