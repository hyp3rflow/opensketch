/**
 * Breakpoints Preview — Multi-viewport responsive preview overlay.
 * Renders the selected Frame at multiple breakpoint sizes side-by-side
 * using offscreen canvases with constraint-based resizing.
 */

interface BreakpointDef {
  name: string;
  width: number;
  height: number;
}

const COLORS = ["#4a90d9", "#7b61ff", "#2ecc71", "#e67e22", "#e74c3c", "#1abc9c", "#9b59b6"];

let overlay: HTMLDivElement | null = null;
let escHandler: ((e: KeyboardEvent) => void) | null = null;

export function isBreakpointsPreviewOpen(): boolean {
  return overlay !== null;
}

export function closeBreakpointsPreview() {
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
  if (escHandler) {
    document.removeEventListener("keydown", escHandler);
    escHandler = null;
  }
}

export function openBreakpointsPreview(engine: any) {
  if (overlay) {
    closeBreakpointsPreview();
    return;
  }

  // Get selected node
  const selJson = engine.get_selection();
  const sel: number[] = JSON.parse(selJson || "[]");
  if (sel.length !== 1) {
    toast("Select a single Frame to preview breakpoints");
    return;
  }

  const nodeId = sel[0];
  const nodeInfoStr = engine.get_node_json(BigInt(nodeId));
  if (!nodeInfoStr) { toast("Node not found"); return; }
  const nodeInfo = JSON.parse(nodeInfoStr);
  const kindType = typeof nodeInfo.kind === "string" ? nodeInfo.kind : Object.keys(nodeInfo.kind)[0];
  if (kindType !== "Frame" && kindType !== "Section") {
    toast("Select a Frame or Section for breakpoints preview");
    return;
  }

  const origW = nodeInfo.width;
  const origH = nodeInfo.height;

  // Load breakpoints from engine (scene-level), fallback to defaults
  let bpsJson = engine.get_scene_breakpoints();
  let breakpoints: BreakpointDef[] = JSON.parse(bpsJson || "[]");
  if (breakpoints.length === 0) {
    const defaults: BreakpointDef[] = JSON.parse(engine.get_default_breakpoints() || "[]");
    breakpoints = defaults;
    // Persist defaults
    for (const bp of defaults) {
      engine.add_scene_breakpoint(bp.name, bp.width, bp.height);
    }
  }

  // Save scene snapshot for non-destructive rendering
  const savedScene = engine.export_scene();

  // Generate SVG for each breakpoint
  const previews: { bp: BreakpointDef; svg: string; scaledH: number }[] = [];
  for (const bp of breakpoints) {
    const scale = bp.width / origW;
    const newH = origH * scale;
    try { engine.set_preview_width(bp.width); } catch (_) {}
    engine.resize_node_with_constraints(BigInt(nodeId), bp.width, newH);
    const svg = engine.export_node_svg(BigInt(nodeId));
    previews.push({ bp, svg, scaledH: newH });
    engine.import_scene(savedScene);
  }

  render(engine, nodeId, nodeInfo.name || "Frame", origW, origH, breakpoints, previews);
}

function render(
  engine: any,
  nodeId: number,
  nodeName: string,
  origW: number,
  origH: number,
  breakpoints: BreakpointDef[],
  previews: { bp: BreakpointDef; svg: string; scaledH: number }[]
) {
  overlay = document.createElement("div");
  overlay.id = "breakpoints-preview-overlay";

  const style = document.createElement("style");
  style.textContent = CSS;
  overlay.appendChild(style);

  // Header
  const header = el("div", "bp-header");
  header.innerHTML = `
    <h2 class="bp-title">Breakpoints Preview — ${esc(nodeName)}</h2>
    <div class="bp-header-actions">
      <button class="bp-btn bp-btn-preset" title="Reset to defaults">⟲ Presets</button>
      <button class="bp-btn bp-btn-add" title="Add breakpoint">+ Add</button>
      <button class="bp-btn bp-btn-close" title="Close (Esc)">✕</button>
    </div>
  `;
  overlay.appendChild(header);

  // Body — viewport cards
  const body = el("div", "bp-body");
  const scrollContainers: HTMLDivElement[] = [];

  previews.forEach((p, i) => {
    const card = el("div", "bp-card");
    const color = COLORS[i % COLORS.length];

    const cardHeader = el("div", "bp-card-header");
    cardHeader.style.borderTop = `3px solid ${color}`;
    cardHeader.innerHTML = `
      <span class="bp-label">${esc(p.bp.name)}</span>
      <span class="bp-size">${p.bp.width} × ${Math.round(p.scaledH)}</span>
      <button class="bp-card-edit" data-idx="${i}" title="Edit">✎</button>
      ${breakpoints.length > 1 ? `<button class="bp-card-remove" data-idx="${i}" title="Remove">✕</button>` : ""}
    `;
    card.appendChild(cardHeader);

    const svgWrap = el("div", "bp-svg-wrap");
    const maxDisplayW = Math.min(p.bp.width, 500);
    svgWrap.style.width = maxDisplayW + "px";
    svgWrap.innerHTML = p.svg;
    // Scale SVG to fit
    const svgEl = svgWrap.querySelector("svg");
    if (svgEl) {
      (svgEl as SVGElement).style.width = "100%";
      (svgEl as SVGElement).style.height = "auto";
    }
    card.appendChild(svgWrap);
    scrollContainers.push(svgWrap);
    body.appendChild(card);
  });

  overlay.appendChild(body);

  // Scroll sync
  let syncing = false;
  scrollContainers.forEach((c) => {
    c.addEventListener("scroll", () => {
      if (syncing) return;
      syncing = true;
      const pct = c.scrollHeight > c.clientHeight ? c.scrollTop / (c.scrollHeight - c.clientHeight) : 0;
      scrollContainers.forEach((other) => {
        if (other !== c && other.scrollHeight > other.clientHeight) {
          other.scrollTop = pct * (other.scrollHeight - other.clientHeight);
        }
      });
      syncing = false;
    });
  });

  // Footer
  const footer = el("div", "bp-footer");
  footer.innerHTML = `<span>Original: ${Math.round(origW)} × ${Math.round(origH)}</span>`;
  overlay.appendChild(footer);

  document.body.appendChild(overlay);

  // Events
  overlay.querySelector(".bp-btn-close")!.addEventListener("click", closeBreakpointsPreview);

  overlay.querySelector(".bp-btn-preset")!.addEventListener("click", () => {
    // Clear and reload defaults
    const current = JSON.parse(engine.get_scene_breakpoints() || "[]");
    for (let i = current.length - 1; i >= 0; i--) engine.remove_scene_breakpoint(i);
    const defaults: BreakpointDef[] = JSON.parse(engine.get_default_breakpoints() || "[]");
    for (const bp of defaults) engine.add_scene_breakpoint(bp.name, bp.width, bp.height);
    closeBreakpointsPreview();
    openBreakpointsPreview(engine);
  });

  overlay.querySelector(".bp-btn-add")!.addEventListener("click", () => {
    const input = prompt("Name, Width, Height (e.g. Laptop,1024,768)");
    if (!input) return;
    const parts = input.split(",").map(s => s.trim());
    const name = parts[0];
    const w = parseInt(parts[1], 10);
    const h = parseInt(parts[2] || "900", 10);
    if (!name || isNaN(w) || w < 100) { toast("Invalid format"); return; }
    engine.add_scene_breakpoint(name, w, h);
    closeBreakpointsPreview();
    openBreakpointsPreview(engine);
  });

  overlay.querySelectorAll(".bp-card-remove").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt((e.currentTarget as HTMLElement).dataset.idx!, 10);
      engine.remove_scene_breakpoint(idx);
      closeBreakpointsPreview();
      openBreakpointsPreview(engine);
    });
  });

  overlay.querySelectorAll(".bp-card-edit").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt((e.currentTarget as HTMLElement).dataset.idx!, 10);
      const bp = breakpoints[idx];
      const input = prompt("Name, Width, Height", `${bp.name},${bp.width},${bp.height}`);
      if (!input) return;
      const parts = input.split(",").map(s => s.trim());
      const name = parts[0] || bp.name;
      const w = parseInt(parts[1], 10) || bp.width;
      const h = parseInt(parts[2], 10) || bp.height;
      engine.update_scene_breakpoint(idx, name, w, h);
      closeBreakpointsPreview();
      openBreakpointsPreview(engine);
    });
  });

  // ESC
  escHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeBreakpointsPreview();
  };
  document.addEventListener("keydown", escHandler);
}

function el(tag: string, cls: string): HTMLDivElement {
  const e = document.createElement(tag) as HTMLDivElement;
  e.className = cls;
  return e;
}

function esc(s: string): string {
  return s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toast(msg: string) {
  const t = document.createElement("div");
  t.textContent = msg;
  Object.assign(t.style, {
    position: "fixed", bottom: "80px", left: "50%", transform: "translateX(-50%)",
    background: "rgba(0,0,0,0.85)", color: "#fff", padding: "8px 16px",
    borderRadius: "6px", fontSize: "13px", zIndex: "100001", pointerEvents: "none",
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

const CSS = `
#breakpoints-preview-overlay {
  position: fixed; inset: 0; z-index: 100000;
  background: #1a1a2e; display: flex; flex-direction: column;
  color: #e0e0e0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.bp-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 20px; background: #16213e; border-bottom: 1px solid #333;
}
.bp-title { margin: 0; font-size: 15px; font-weight: 600; }
.bp-header-actions { display: flex; gap: 8px; align-items: center; }
.bp-btn {
  background: rgba(255,255,255,0.1); border: none; color: #e0e0e0;
  padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;
}
.bp-btn:hover { background: rgba(255,255,255,0.2); }
.bp-body {
  flex: 1; display: flex; gap: 24px; padding: 24px;
  overflow-x: auto; overflow-y: auto; align-items: flex-start; justify-content: center;
}
.bp-card {
  background: #1e1e3a; border-radius: 8px; overflow: hidden; flex-shrink: 0;
  box-shadow: 0 2px 12px rgba(0,0,0,0.3);
}
.bp-card-header {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #252545;
}
.bp-label { font-weight: 600; font-size: 13px; }
.bp-size { font-size: 11px; opacity: 0.6; margin-left: auto; }
.bp-card-edit, .bp-card-remove {
  background: none; border: none; color: #888; cursor: pointer; padding: 0 4px; font-size: 12px;
}
.bp-card-edit:hover { color: #4a90d9; }
.bp-card-remove:hover { color: #e74c3c; }
.bp-svg-wrap {
  padding: 12px; background: #fff; min-height: 100px; overflow-y: auto; max-height: 70vh;
}
.bp-svg-wrap svg { display: block; }
.bp-footer {
  padding: 8px 20px; background: #16213e; border-top: 1px solid #333;
  font-size: 12px; opacity: 0.6;
}
`;
