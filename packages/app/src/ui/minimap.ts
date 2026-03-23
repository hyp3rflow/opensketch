import { Editor } from "../editor";

const MINIMAP_W = 200;
const MINIMAP_H = 140;
const PADDING = 10;

type MinimapEntry = [number, number, number, number, number, string, string]; // id, x, y, w, h, fillColor, kindChar

export function setupMinimap(container: HTMLElement, editor: Editor) {
  const wrapper = document.createElement("div");
  wrapper.className = "minimap-wrapper";
  wrapper.innerHTML = `
    <div class="minimap-header">
      <span>Minimap</span>
      <button class="minimap-toggle" title="Toggle minimap (M)">−</button>
    </div>
    <canvas class="minimap-canvas" width="${MINIMAP_W * 2}" height="${MINIMAP_H * 2}"></canvas>
  `;

  const canvas = wrapper.querySelector(".minimap-canvas") as HTMLCanvasElement;
  canvas.style.width = MINIMAP_W + "px";
  canvas.style.height = MINIMAP_H + "px";
  const ctx = canvas.getContext("2d")!;

  const toggleBtn = wrapper.querySelector(".minimap-toggle") as HTMLButtonElement;
  let collapsed = false;

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    collapsed = !collapsed;
    canvas.style.display = collapsed ? "none" : "block";
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
      // Add margin
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
    // mx, my are in CSS coords, convert to canvas coords (*2)
    const cx = mx * 2;
    const cy = my * 2;
    return [
      (cx - offsetX) / scale + sceneBounds.minX,
      (cy - offsetY) / scale + sceneBounds.minY,
    ];
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
      if (mw < 0.5 && mh < 0.5) continue; // too small to see

      ctx.fillStyle = fillColor;
      if (kindChar === "E") {
        ctx.beginPath();
        ctx.ellipse(mx + mw / 2, my + mh / 2, mw / 2, mh / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (kindChar === "T") {
        // Text: thin line
        ctx.fillRect(mx, my + mh * 0.3, Math.max(mw, 2), Math.max(mh * 0.4, 1));
      } else {
        ctx.fillRect(mx, my, Math.max(mw, 1), Math.max(mh, 1));
      }
    }

    // Draw viewport rectangle
    const zoom = editor.engine.get_zoom();
    const panX = editor.engine.get_pan_x();
    const panY = editor.engine.get_pan_y();
    const cw = editor.engine.get_canvas_width();
    const ch = editor.engine.get_canvas_height();

    // Scene coords of viewport corners
    const vpLeft = -panX / zoom;
    const vpTop = -panY / zoom;
    const vpRight = (cw - panX) / zoom;
    const vpBottom = (ch - panY) / zoom;

    const [vx1, vy1] = sceneToMinimap(vpLeft, vpTop);
    const [vx2, vy2] = sceneToMinimap(vpRight, vpBottom);

    ctx.strokeStyle = "#4a90d9";
    ctx.lineWidth = 2;
    ctx.strokeRect(vx1, vy1, vx2 - vx1, vy2 - vy1);
    ctx.fillStyle = "rgba(74, 144, 217, 0.08)";
    ctx.fillRect(vx1, vy1, vx2 - vx1, vy2 - vy1);
  }

  // Drag to pan
  let dragging = false;
  canvas.addEventListener("mousedown", (e) => {
    dragging = true;
    panToMouse(e);
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    panToMouse(e);
  });
  window.addEventListener("mouseup", () => { dragging = false; });

  function panToMouse(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const [sx, sy] = minimapToScene(mx, my);

    const zoom = editor.engine.get_zoom();
    const cw = editor.engine.get_canvas_width();
    const ch = editor.engine.get_canvas_height();

    // Center viewport on this scene point
    const newPanX = cw / 2 - sx * zoom;
    const newPanY = ch / 2 - sy * zoom;
    editor.engine.set_viewport(zoom, newPanX, newPanY);
    editor.requestRender();
  }

  // Render loop
  let lastRenderTime = 0;
  function loop(t: number) {
    if (t - lastRenderTime > 100) { // 10fps is enough for minimap
      lastRenderTime = t;
      render();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  container.appendChild(wrapper);

  return {
    toggle() {
      collapsed = !collapsed;
      canvas.style.display = collapsed ? "none" : "block";
      toggleBtn.textContent = collapsed ? "+" : "−";
      wrapper.classList.toggle("collapsed", collapsed);
    },
    get visible() { return !collapsed; },
  };
}
