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

  editor.onZoomChanged(update);

  // Also update on wheel zoom — poll via rAF
  let lastZoom = editor.getZoomLevel();
  const poll = () => {
    const z = editor.getZoomLevel();
    if (z !== lastZoom) { lastZoom = z; update(); }
    requestAnimationFrame(poll);
  };
  poll();

  container.appendChild(el);
  return el;
}
