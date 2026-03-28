import { Editor } from "../editor";

const MINIMAP_W = 200;
const MINIMAP_H = 140;
const PADDING = 10;
const PAGE_TAB_H = 22;

// Node-type-based colors (Figma-inspired)
const KIND_COLORS: Record<string, string> = {
  R: "rgba(139, 180, 255, 0.7)",  // Rect — soft blue
  E: "rgba(180, 139, 255, 0.7)",  // Ellipse — purple
  T: "rgba(255, 180, 100, 0.7)",  // Text — orange
  F: "rgba(100, 200, 150, 0.6)",  // Frame — green
  G: "rgba(100, 200, 150, 0.4)",  // Group — lighter green
  I: "rgba(255, 140, 170, 0.7)",  // Image — pink
  P: "rgba(255, 220, 100, 0.7)",  // Path — yellow
  S: "rgba(255, 160, 60, 0.7)",   // Star — amber
  N: "rgba(100, 220, 220, 0.7)",  // Polygon — teal
  O: "rgba(200, 200, 200, 0.5)",  // Other — gray
};

type MinimapEntry = [number, number, number, number, number, string, string]; // id, x, y, w, h, fillColor, kindChar

export function setupMinimap(container: HTMLElement, editor: Editor) {
  const wrapper = document.createElement("div");
  wrapper.className = "minimap-wrapper";

  const totalH = MINIMAP_H + PAGE_TAB_H;
  wrapper.innerHTML = `
    <div class="minimap-header">
      <span>Minimap</span>
      <div class="minimap-header-actions">
        <select class="minimap-color-mode" title="Color mode">
          <option value="type">By Type</option>
          <option value="fill">By Fill</option>
        </select>
        <button class="minimap-toggle" title="Toggle minimap (M)">−</button>
      </div>
    </div>
    <canvas class="minimap-canvas" width="${MINIMAP_W * 2}" height="${MINIMAP_H * 2}"></canvas>
    <div class="minimap-pages"></div>
  `;

  const canvas = wrapper.querySelector(".minimap-canvas") as HTMLCanvasElement;
  canvas.style.width = MINIMAP_W + "px";
  canvas.style.height = MINIMAP_H + "px";
  const ctx = canvas.getContext("2d")!;

  const toggleBtn = wrapper.querySelector(".minimap-toggle") as HTMLButtonElement;
  const colorModeSelect = wrapper.querySelector(".minimap-color-mode") as HTMLSelectElement;
  const pagesDiv = wrapper.querySelector(".minimap-pages") as HTMLDivElement;
  let collapsed = false;
  let colorMode: "type" | "fill" = "type";

  colorModeSelect.addEventListener("change", () => {
    colorMode = colorModeSelect.value as "type" | "fill";
  });

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    collapsed = !collapsed;
    canvas.style.display = collapsed ? "none" : "block";
    pagesDiv.style.display = collapsed ? "none" : "flex";
    toggleBtn.textContent = collapsed ? "+" : "−";
    wrapper.classList.toggle("collapsed", collapsed);
  });

  // Viewport ↔ minimap coordinate mapping
  let sceneBounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function updateMapping() {
    const boundsJson = editor.engine.get_scene_bounds();
    if (!boundsJson) {
      sceneBounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    } else {
      const [x1, y1, x2, y2] = JSON.parse(boundsJson);
      const w = x2 - x1 || 100;
      const h = y2 - y1 || 100;
      const margin = Math.max(w, h) * 0.1;
      sceneBounds = { minX: x1 - margin, minY: y1 - margin, maxX: x2 + margin, maxY: y2 + margin };
    }
    const sw = sceneBounds.maxX - sceneBounds.minX;
    const sh = sceneBounds.maxY - sceneBounds.minY;
    scale = Math.min((MINIMAP_W * 2 - PADDING * 2) / sw, (MINIMAP_H * 2 - PADDING * 2) / sh);
    offsetX = PADDING + ((MINIMAP_W * 2 - PADDING * 2) - sw * scale) / 2;
    offsetY = PADDING + ((MINIMAP_H * 2 - PADDING * 2) - sh * scale) / 2;
  }

  function sceneToMinimap(sx: number, sy: number): [number, number] {
    return [
      (sx - sceneBounds.minX) * scale + offsetX,
      (sy - sceneBounds.minY) * scale + offsetY,
    ];
  }

  function minimapToScene(mx: number, my: number): [number, number] {
    const cx = mx * 2;
    const cy = my * 2;
    return [
      (cx - offsetX) / scale + sceneBounds.minX,
      (cy - offsetY) / scale + sceneBounds.minY,
    ];
  }

  // Get current viewport rect in minimap canvas coords
  function getViewportRect(): { x1: number; y1: number; x2: number; y2: number } {
    const zoom = editor.engine.get_zoom();
    const panX = editor.engine.get_pan_x();
    const panY = editor.engine.get_pan_y();
    const cw = editor.engine.get_canvas_width();
    const ch = editor.engine.get_canvas_height();
    const vpLeft = -panX / zoom;
    const vpTop = -panY / zoom;
    const vpRight = (cw - panX) / zoom;
    const vpBottom = (ch - panY) / zoom;
    const [x1, y1] = sceneToMinimap(vpLeft, vpTop);
    const [x2, y2] = sceneToMinimap(vpRight, vpBottom);
    return { x1, y1, x2, y2 };
  }

  function render() {
    if (collapsed) return;
    const dpr = 2;
    ctx.clearRect(0, 0, MINIMAP_W * dpr, MINIMAP_H * dpr);

    // Background
    ctx.fillStyle = "#1e1e1e";
    ctx.fillRect(0, 0, MINIMAP_W * dpr, MINIMAP_H * dpr);

    updateMapping();

    // Draw nodes
    const dataJson = editor.engine.get_minimap_data();
    let entries: MinimapEntry[] = [];
    try { entries = JSON.parse(dataJson); } catch { /* empty */ }

    for (const [_id, x, y, w, h, fillColor, kindChar] of entries) {
      const [mx, my] = sceneToMinimap(x, y);
      const mw = w * scale;
      const mh = h * scale;
      if (mw < 0.5 && mh < 0.5) continue;

      // Color based on mode
      ctx.fillStyle = colorMode === "type"
        ? (KIND_COLORS[kindChar] || KIND_COLORS.O)
        : fillColor;

      if (kindChar === "E") {
        ctx.beginPath();
        ctx.ellipse(mx + mw / 2, my + mh / 2, Math.max(mw / 2, 0.5), Math.max(mh / 2, 0.5), 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (kindChar === "T") {
        ctx.fillRect(mx, my + mh * 0.3, Math.max(mw, 2), Math.max(mh * 0.4, 1));
      } else if (kindChar === "F") {
        // Frame: draw border only (like Figma)
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(mx, my, Math.max(mw, 1), Math.max(mh, 1));
      } else {
        ctx.fillRect(mx, my, Math.max(mw, 1), Math.max(mh, 1));
      }
    }

    // Draw viewport rectangle
    const vp = getViewportRect();
    ctx.strokeStyle = "#4a90d9";
    ctx.lineWidth = 2;
    ctx.strokeRect(vp.x1, vp.y1, vp.x2 - vp.x1, vp.y2 - vp.y1);
    ctx.fillStyle = "rgba(74, 144, 217, 0.08)";
    ctx.fillRect(vp.x1, vp.y1, vp.x2 - vp.x1, vp.y2 - vp.y1);

    // Draw resize handles on viewport edges (small squares)
    const handleSize = 6;
    ctx.fillStyle = "#4a90d9";
    const midX = (vp.x1 + vp.x2) / 2;
    const midY = (vp.y1 + vp.y2) / 2;
    // 4 edge handles
    ctx.fillRect(midX - handleSize / 2, vp.y1 - handleSize / 2, handleSize, handleSize); // top
    ctx.fillRect(midX - handleSize / 2, vp.y2 - handleSize / 2, handleSize, handleSize); // bottom
    ctx.fillRect(vp.x1 - handleSize / 2, midY - handleSize / 2, handleSize, handleSize); // left
    ctx.fillRect(vp.x2 - handleSize / 2, midY - handleSize / 2, handleSize, handleSize); // right
  }

  // --- Page tabs ---
  let lastPagesJson = "";

  function updatePageTabs() {
    let pagesJson: string;
    try { pagesJson = editor.engine.get_pages(); } catch { return; }
    if (pagesJson === lastPagesJson) return;
    lastPagesJson = pagesJson;

    let pages: { id: number; name: string }[];
    try { pages = JSON.parse(pagesJson); } catch { return; }

    const activeId = Number(editor.engine.get_active_page_id());
    pagesDiv.innerHTML = "";
    for (const p of pages) {
      const tab = document.createElement("button");
      tab.className = "minimap-page-tab" + (p.id === activeId ? " active" : "");
      tab.textContent = p.name;
      tab.title = p.name;
      tab.addEventListener("click", () => {
        editor.engine.set_active_page(BigInt(p.id));
        editor.requestRender();
        updatePageTabs();
      });
      pagesDiv.appendChild(tab);
    }
  }

  // --- Drag interactions ---
  type DragMode = "pan" | "resize-top" | "resize-bottom" | "resize-left" | "resize-right" | null;
  let dragMode: DragMode = null;
  let dragStartScene: [number, number] = [0, 0];
  let dragStartZoom = 1;

  const EDGE_THRESHOLD = 8; // CSS pixels

  function hitTestViewportEdge(mx: number, my: number): DragMode {
    updateMapping();
    const vp = getViewportRect();
    // Convert vp from canvas coords to CSS coords (÷2)
    const x1 = vp.x1 / 2, y1 = vp.y1 / 2, x2 = vp.x2 / 2, y2 = vp.y2 / 2;

    // Check edges (only if mouse is within the x/y range)
    if (mx >= x1 - EDGE_THRESHOLD && mx <= x2 + EDGE_THRESHOLD) {
      if (Math.abs(my - y1) < EDGE_THRESHOLD) return "resize-top";
      if (Math.abs(my - y2) < EDGE_THRESHOLD) return "resize-bottom";
    }
    if (my >= y1 - EDGE_THRESHOLD && my <= y2 + EDGE_THRESHOLD) {
      if (Math.abs(mx - x1) < EDGE_THRESHOLD) return "resize-left";
      if (Math.abs(mx - x2) < EDGE_THRESHOLD) return "resize-right";
    }
    return "pan";
  }

  canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    dragMode = hitTestViewportEdge(mx, my);
    dragStartScene = minimapToScene(mx, my);
    dragStartZoom = editor.engine.get_zoom();
    if (dragMode === "pan") {
      panToMouse(e);
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragMode) {
      // Update cursor
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (mx >= 0 && mx <= MINIMAP_W && my >= 0 && my <= MINIMAP_H) {
        const hit = hitTestViewportEdge(mx, my);
        if (hit === "resize-top" || hit === "resize-bottom") {
          canvas.style.cursor = "ns-resize";
        } else if (hit === "resize-left" || hit === "resize-right") {
          canvas.style.cursor = "ew-resize";
        } else {
          canvas.style.cursor = "grab";
        }
      }
      return;
    }
    if (dragMode === "pan") {
      panToMouse(e);
    } else {
      resizeViewport(e);
    }
  });

  window.addEventListener("mouseup", () => { dragMode = null; });

  function panToMouse(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const [sx, sy] = minimapToScene(mx, my);
    const zoom = editor.engine.get_zoom();
    const cw = editor.engine.get_canvas_width();
    const ch = editor.engine.get_canvas_height();
    const newPanX = cw / 2 - sx * zoom;
    const newPanY = ch / 2 - sy * zoom;
    editor.engine.set_viewport(zoom, newPanX, newPanY);
    editor.requestRender();
  }

  function resizeViewport(e: MouseEvent) {
    // Dragging a viewport edge = changing zoom level
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const [sx, sy] = minimapToScene(mx, my);

    const zoom = editor.engine.get_zoom();
    const panX = editor.engine.get_pan_x();
    const panY = editor.engine.get_pan_y();
    const cw = editor.engine.get_canvas_width();
    const ch = editor.engine.get_canvas_height();

    // Current viewport center in scene coords
    const centerX = (cw / 2 - panX) / zoom;
    const centerY = (ch / 2 - panY) / zoom;

    let newZoom = zoom;

    if (dragMode === "resize-left" || dragMode === "resize-right") {
      // Distance from center to edge in scene coords determines viewport width
      const halfW = Math.abs(sx - centerX);
      if (halfW > 1) {
        newZoom = (cw / 2) / halfW;
      }
    } else {
      const halfH = Math.abs(sy - centerY);
      if (halfH > 1) {
        newZoom = (ch / 2) / halfH;
      }
    }

    newZoom = Math.max(0.02, Math.min(64, newZoom));
    const newPanX = cw / 2 - centerX * newZoom;
    const newPanY = ch / 2 - centerY * newZoom;
    editor.engine.set_viewport(newZoom, newPanX, newPanY);
    editor.requestRender();
  }

  // Render loop
  let lastRenderTime = 0;
  function loop(t: number) {
    if (t - lastRenderTime > 100) { // 10fps
      lastRenderTime = t;
      render();
      updatePageTabs();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  container.appendChild(wrapper);

  return {
    toggle() {
      collapsed = !collapsed;
      canvas.style.display = collapsed ? "none" : "block";
      pagesDiv.style.display = collapsed ? "none" : "flex";
      toggleBtn.textContent = collapsed ? "+" : "−";
      wrapper.classList.toggle("collapsed", collapsed);
    },
    get visible() { return !collapsed; },
  };
}
