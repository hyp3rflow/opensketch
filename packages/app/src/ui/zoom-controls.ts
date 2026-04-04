import { Editor } from "../editor";
import { showDevicePicker } from "./pixel-preview";

export function setupZoomControls(container: HTMLElement, editor: Editor) {
  const el = document.createElement("div");
  el.className = "zoom-controls";
  el.innerHTML = `
    <button class="zoom-btn zoom-out" title="Zoom out (-)">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
    </button>
    <button class="zoom-level" title="Click to reset to 100%">100%</button>
    <button class="zoom-btn zoom-in" title="Zoom in (+)">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 3v8M3 7h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
    </button>
    <button class="zoom-btn pixel-preview-btn" title="Pixel Preview (Alt+P)">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="1" width="4" height="4" fill="currentColor" opacity="0.6"/>
        <rect x="5" y="1" width="4" height="4" fill="currentColor" opacity="0.3"/>
        <rect x="9" y="1" width="4" height="4" fill="currentColor" opacity="0.6"/>
        <rect x="1" y="5" width="4" height="4" fill="currentColor" opacity="0.3"/>
        <rect x="5" y="5" width="4" height="4" fill="currentColor" opacity="0.6"/>
        <rect x="9" y="5" width="4" height="4" fill="currentColor" opacity="0.3"/>
        <rect x="1" y="9" width="4" height="4" fill="currentColor" opacity="0.6"/>
        <rect x="5" y="9" width="4" height="4" fill="currentColor" opacity="0.3"/>
        <rect x="9" y="9" width="4" height="4" fill="currentColor" opacity="0.6"/>
      </svg>
    </button>
    <button class="zoom-btn zoom-fit" title="Zoom to fit (⌘1)">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="10" height="10" rx="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M5 2v10M9 2v10M2 5h10M2 9h10" stroke="currentColor" stroke-width="0.6" opacity="0.4"/></svg>
    </button>
    <button class="zoom-btn renderer-btn" title="Toggle renderer backend (Canvas2D/WebGPU)">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1.5" y="2" width="11" height="7" rx="1.5" stroke="currentColor" stroke-width="1"/>
        <rect x="4.5" y="10" width="5" height="1.5" rx="0.75" fill="currentColor" opacity="0.7"/>
      </svg>
    </button>
    <button class="zoom-btn pixel-snap-btn" title="Snap to Pixel Grid (default ON)">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="1" width="5" height="5" stroke="currentColor" stroke-width="1" rx="0.5"/>
        <rect x="8" y="1" width="5" height="5" stroke="currentColor" stroke-width="1" rx="0.5"/>
        <rect x="1" y="8" width="5" height="5" stroke="currentColor" stroke-width="1" rx="0.5"/>
        <rect x="8" y="8" width="5" height="5" stroke="currentColor" stroke-width="1" rx="0.5"/>
        <path d="M6.5 6.5L7.5 7.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
    </button>
    <span class="zoom-divider" style="width:1px;height:16px;background:rgba(255,255,255,0.15);margin:0 2px"></span>
    <button class="zoom-btn grid-snap-btn" title="Grid Snap (⌘')">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="3" cy="3" r="1" fill="currentColor"/>
        <circle cx="7" cy="3" r="1" fill="currentColor"/>
        <circle cx="11" cy="3" r="1" fill="currentColor"/>
        <circle cx="3" cy="7" r="1" fill="currentColor"/>
        <circle cx="7" cy="7" r="1" fill="currentColor"/>
        <circle cx="11" cy="7" r="1" fill="currentColor"/>
        <circle cx="3" cy="11" r="1" fill="currentColor"/>
        <circle cx="7" cy="11" r="1" fill="currentColor"/>
        <circle cx="11" cy="11" r="1" fill="currentColor"/>
      </svg>
    </button>
    <select class="grid-size-select" title="Grid Size" style="background:rgba(255,255,255,0.08);color:#ccc;border:1px solid rgba(255,255,255,0.12);border-radius:4px;font-size:11px;padding:1px 2px;height:22px;outline:none;cursor:pointer;display:none">
      <option value="4">4px</option>
      <option value="8" selected>8px</option>
      <option value="16">16px</option>
      <option value="32">32px</option>
      <option value="custom">Custom…</option>
    </select>
  `;

  const levelBtn = el.querySelector(".zoom-level") as HTMLButtonElement;
  const update = () => {
    const pct = Math.round(editor.getZoomLevel() * 100);
    levelBtn.textContent = `${pct}%`;
  };

  el.querySelector(".zoom-out")!.addEventListener("click", () => editor.zoomBy(0.8));
  el.querySelector(".zoom-in")!.addEventListener("click", () => editor.zoomBy(1.25));
  levelBtn.addEventListener("click", () => editor.zoomTo100());
  el.querySelector(".zoom-fit")!.addEventListener("click", () => editor.zoomToFit());

  // Renderer backend toggle
  const rendererBtn = el.querySelector(".renderer-btn") as HTMLButtonElement;
  rendererBtn.addEventListener("click", () => {
    const current = editor.getRenderBackend();
    if (current === "webgpu") {
      editor.setRenderBackend("canvas2d");
    } else if (editor.isWebGPUAvailable()) {
      editor.setRenderBackend("webgpu");
    }
    updateRendererBtn();
  });
  const updateRendererBtn = () => {
    const mode = editor.getRenderBackend();
    const available = editor.isWebGPUAvailable();
    rendererBtn.classList.toggle("active", mode === "webgpu");
    rendererBtn.disabled = !available;
    rendererBtn.style.opacity = available ? "1" : "0.45";
    rendererBtn.title = available
      ? `Renderer: ${mode === "webgpu" ? "WebGPU" : "Canvas2D"} (click to toggle)`
      : "WebGPU not available on this browser/device";
  };
  updateRendererBtn();

  // Pixel preview button
  const ppBtn = el.querySelector(".pixel-preview-btn") as HTMLButtonElement;
  ppBtn.addEventListener("click", () => {
    editor.togglePixelPreview();
  });
  ppBtn.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showDevicePicker(ppBtn, editor.getPixelPreviewDevice(), (device) => {
      editor.setPixelPreviewDevice(device);
    });
  });

  const updatePP = () => {
    ppBtn.classList.toggle("active", editor.isPixelPreviewEnabled());
  };
  editor.onPixelPreviewChanged(updatePP);

  // Pixel snap button
  const pxSnapBtn = el.querySelector(".pixel-snap-btn") as HTMLButtonElement;
  pxSnapBtn.addEventListener("click", () => {
    editor.togglePixelSnap();
  });
  pxSnapBtn.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    const current = editor.pixelSnapPrecision;
    editor.setPixelSnapPrecision(current === 1 ? 0.5 : 1);
    updatePxSnap();
  });
  const updatePxSnap = () => {
    pxSnapBtn.classList.toggle("active", editor.pixelSnapEnabled);
    pxSnapBtn.title = `Snap to Pixel Grid (${editor.pixelSnapPrecision === 1 ? '1px' : '0.5px'}) — right-click to toggle precision`;
  };
  editor.onPixelSnapChanged(updatePxSnap);
  updatePxSnap();

  // Grid snap button
  const gridBtn = el.querySelector(".grid-snap-btn") as HTMLButtonElement;
  const gridSelect = el.querySelector(".grid-size-select") as HTMLSelectElement;

  gridBtn.addEventListener("click", () => {
    editor.toggleGridSnap();
  });
  gridBtn.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    // Toggle size selector visibility
    const shown = gridSelect.style.display !== "none";
    gridSelect.style.display = shown ? "none" : "inline-block";
  });

  const updateGridUI = () => {
    gridBtn.classList.toggle("active", editor.gridSnapEnabled);
    gridSelect.style.display = editor.gridSnapEnabled ? "inline-block" : "none";
    // Sync select value
    const val = String(editor.gridSize);
    const opts = Array.from(gridSelect.options).map(o => o.value);
    if (opts.includes(val)) {
      gridSelect.value = val;
    } else {
      gridSelect.value = "custom";
    }
  };

  gridSelect.addEventListener("change", () => {
    if (gridSelect.value === "custom") {
      const input = prompt("Grid size (px):", String(editor.gridSize));
      if (input) {
        const n = parseInt(input, 10);
        if (n > 0 && n <= 256) {
          editor.setGridSize(n);
        }
      }
      updateGridUI();
    } else {
      editor.setGridSize(parseInt(gridSelect.value, 10));
    }
  });

  editor.onGridSnapChanged(updateGridUI);
  updateGridUI();

  editor.onZoomChanged(update);

  // Also update on wheel zoom — poll via rAF
  let lastZoom = editor.getZoomLevel();
  const poll = () => {
    const z = editor.getZoomLevel();
    if (z !== lastZoom) { lastZoom = z; update(); }
    updateRendererBtn();
    requestAnimationFrame(poll);
  };
  poll();

  container.appendChild(el);
  return el;
}
