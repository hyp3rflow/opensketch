/**
 * Responsive Resize Preview
 *
 * Fullscreen overlay showing a selected Frame at multiple breakpoints side by side.
 * Uses scene snapshot/restore + resize_node_with_constraints + SVG export.
 */

interface Breakpoint {
  label: string;
  width: number;
  color: string;
}

const DEFAULT_BREAKPOINTS: Breakpoint[] = [
  { label: "Mobile", width: 375, color: "#4a90d9" },
  { label: "Tablet", width: 768, color: "#7b61ff" },
  { label: "Desktop", width: 1440, color: "#2ecc71" },
];

let overlay: HTMLDivElement | null = null;
let currentBreakpoints = [...DEFAULT_BREAKPOINTS];

export function isResponsivePreviewOpen(): boolean {
  return overlay !== null;
}

export function closeResponsivePreview() {
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
}

export function openResponsivePreview(engine: any) {
  if (overlay) {
    closeResponsivePreview();
    return;
  }

  // Get selected node info
  const selJson = engine.get_selection();
  const sel: number[] = JSON.parse(selJson || "[]");
  if (sel.length !== 1) {
    showToast("Select a single Frame to preview responsive resize");
    return;
  }

  const nodeId = sel[0];
  const nodeInfoStr = engine.get_node_json(BigInt(nodeId));
  if (!nodeInfoStr) {
    showToast("Node not found");
    return;
  }

  const nodeInfo = JSON.parse(nodeInfoStr);
  const kind = nodeInfo.kind;
  // Only Frame and Section make sense for responsive preview
  const kindType = typeof kind === "string" ? kind : Object.keys(kind)[0];
  if (kindType !== "Frame" && kindType !== "Section") {
    showToast("Select a Frame or Section for responsive preview");
    return;
  }

  const originalWidth = nodeInfo.width;
  const originalHeight = nodeInfo.height;

  // Save scene state
  const savedScene = engine.export_scene();

  // Generate SVGs at each breakpoint
  const previews: { bp: Breakpoint; svg: string; height: number }[] = [];

  for (const bp of currentBreakpoints) {
    // Calculate proportional height
    const scale = bp.width / originalWidth;
    const newHeight = originalHeight * scale;

    // Auto-switch variable modes via responsive token system
    try { engine.set_preview_width(bp.width); } catch (_) {}

    // Resize with constraints
    engine.resize_node_with_constraints(BigInt(nodeId), bp.width, newHeight);

    // Export SVG for this node
    const svg = engine.export_node_svg(BigInt(nodeId));
    previews.push({ bp, svg, height: newHeight });

    // Restore original scene for next iteration
    engine.import_scene(savedScene);
  }

  // Build overlay
  overlay = document.createElement("div");
  overlay.id = "responsive-preview-overlay";
  overlay.innerHTML = `
    <div class="rp-header">
      <h2>Responsive Preview — ${nodeInfo.name || "Frame"}</h2>
      <div class="rp-header-right">
        <button class="rp-add-bp" title="Add breakpoint">+ Breakpoint</button>
        <button class="rp-close" title="Close (Esc)">✕</button>
      </div>
    </div>
    <div class="rp-body">
      ${previews
        .map(
          (p, i) => `
        <div class="rp-card" data-index="${i}">
          <div class="rp-card-header" style="border-top: 3px solid ${p.bp.color}">
            <span class="rp-bp-label">${p.bp.label}</span>
            <span class="rp-bp-size">${p.bp.width} × ${Math.round(p.height)}</span>
            ${currentBreakpoints.length > 1 ? `<button class="rp-remove-bp" data-index="${i}" title="Remove">✕</button>` : ""}
          </div>
          <div class="rp-svg-container" style="width: ${Math.min(p.bp.width, 500)}px;">
            ${p.svg}
          </div>
        </div>
      `
        )
        .join("")}
    </div>
    <div class="rp-footer">
      <span class="rp-info">Original: ${Math.round(originalWidth)} × ${Math.round(originalHeight)}</span>
    </div>
  `;

  // Style
  const style = document.createElement("style");
  style.textContent = getStyles();
  overlay.prepend(style);

  document.body.appendChild(overlay);

  // Events
  overlay.querySelector(".rp-close")!.addEventListener("click", closeResponsivePreview);

  overlay.querySelector(".rp-add-bp")!.addEventListener("click", () => {
    const input = prompt("Enter breakpoint: label,width (e.g. Laptop,1024)");
    if (!input) return;
    const [label, widthStr] = input.split(",").map((s) => s.trim());
    const width = parseInt(widthStr, 10);
    if (!label || isNaN(width) || width < 100) {
      showToast("Invalid breakpoint format");
      return;
    }
    const colors = ["#e67e22", "#e74c3c", "#1abc9c", "#9b59b6", "#34495e"];
    currentBreakpoints.push({
      label,
      width,
      color: colors[currentBreakpoints.length % colors.length],
    });
    closeResponsivePreview();
    openResponsivePreview(engine);
  });

  overlay.querySelectorAll(".rp-remove-bp").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt((e.currentTarget as HTMLElement).dataset.index!, 10);
      currentBreakpoints.splice(idx, 1);
      closeResponsivePreview();
      openResponsivePreview(engine);
    });
  });

  // Scale SVGs to fit their containers
  overlay.querySelectorAll(".rp-svg-container svg").forEach((svg) => {
    const el = svg as SVGElement;
    el.style.width = "100%";
    el.style.height = "auto";
  });

  // Escape to close
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      closeResponsivePreview();
      document.removeEventListener("keydown", onKey);
    }
  };
  document.addEventListener("keydown", onKey);
}

function showToast(msg: string) {
  const t = document.createElement("div");
  t.textContent = msg;
  Object.assign(t.style, {
    position: "fixed",
    bottom: "80px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(0,0,0,0.8)",
    color: "#fff",
    padding: "8px 16px",
    borderRadius: "6px",
    fontSize: "13px",
    zIndex: "100001",
    pointerEvents: "none",
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function getStyles(): string {
  return `
    #responsive-preview-overlay {
      position: fixed;
      inset: 0;
      z-index: 100000;
      background: #1a1a2e;
      display: flex;
      flex-direction: column;
      color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .rp-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 20px;
      background: #16213e;
      border-bottom: 1px solid #333;
    }
    .rp-header h2 {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
    }
    .rp-header-right {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .rp-close, .rp-add-bp {
      background: rgba(255,255,255,0.1);
      border: none;
      color: #e0e0e0;
      padding: 4px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }
    .rp-close:hover, .rp-add-bp:hover {
      background: rgba(255,255,255,0.2);
    }
    .rp-body {
      flex: 1;
      display: flex;
      gap: 24px;
      padding: 24px;
      overflow-x: auto;
      overflow-y: auto;
      align-items: flex-start;
      justify-content: center;
    }
    .rp-card {
      background: #1e1e3a;
      border-radius: 8px;
      overflow: hidden;
      flex-shrink: 0;
      box-shadow: 0 2px 12px rgba(0,0,0,0.3);
    }
    .rp-card-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #252545;
    }
    .rp-bp-label {
      font-weight: 600;
      font-size: 13px;
    }
    .rp-bp-size {
      font-size: 11px;
      opacity: 0.6;
      margin-left: auto;
    }
    .rp-remove-bp {
      background: none;
      border: none;
      color: #888;
      cursor: pointer;
      padding: 0 4px;
      font-size: 12px;
    }
    .rp-remove-bp:hover { color: #e74c3c; }
    .rp-svg-container {
      padding: 12px;
      background: #fff;
      min-height: 100px;
    }
    .rp-svg-container svg {
      display: block;
    }
    .rp-footer {
      padding: 8px 20px;
      background: #16213e;
      border-top: 1px solid #333;
      font-size: 12px;
      opacity: 0.6;
    }
    .rp-info { }
  `;
}
