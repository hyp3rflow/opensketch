/**
 * Component Playground
 *
 * Fullscreen overlay for testing components in isolation:
 * - Variant list (left sidebar)
 * - Live canvas preview (center)
 * - Override props editor (right sidebar)
 * - Responsive breakpoint bar (bottom)
 */

interface PlaygroundInfo {
  id: number;
  name: string;
  description: string;
  properties: PlaygroundProp[];
  slots: string[];
  variants: PlaygroundVariant[];
  variant_count: number;
}

interface PlaygroundProp {
  name: string;
  prop_type: string;
  default_value: string;
  options: string[];
}

interface PlaygroundVariant {
  key_string: string;
  key_display: string;
  root_node_id: number;
  node_count: number;
  properties: { name: string; value: string }[];
}

interface BreakpointDef {
  label: string;
  width: number;
  color: string;
}

const BREAKPOINTS: BreakpointDef[] = [
  { label: "Mobile", width: 375, color: "#4a90d9" },
  { label: "Tablet", width: 768, color: "#7b61ff" },
  { label: "Desktop", width: 1440, color: "#2ecc71" },
];

let overlay: HTMLDivElement | null = null;
let currentEngine: any = null;
let currentCompId: number = 0;
let currentInfo: PlaygroundInfo | null = null;
let selectedVariantKey: string = "";
let activeBreakpoint: number | null = null; // null = auto (no constraint)
let playgroundInstances: number[] = [];

export function isPlaygroundOpen(): boolean {
  return overlay !== null;
}

export function isComponentPlaygroundOpen(): boolean {
  return overlay !== null;
}

export function closeComponentPlayground() {
  closePlayground();
}

export function openComponentPlayground(engine: any, compId?: number) {
  openPlayground(engine, compId);
}

export function closePlayground() {
  // Clean up playground instances
  if (currentEngine) {
    for (const id of playgroundInstances) {
      try { currentEngine.remove_playground_instance(BigInt(id)); } catch {}
    }
  }
  playgroundInstances = [];
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
  currentEngine = null;
  currentCompId = 0;
  currentInfo = null;
}

export function openPlayground(engine: any, compId?: number) {
  if (overlay) {
    closePlayground();
    return;
  }

  currentEngine = engine;

  // If no compId provided, try to get from selected instance/component
  if (!compId) {
    compId = getComponentIdFromSelection(engine);
  }
  if (!compId) {
    showToast("Select a component or instance to open playground");
    return;
  }

  currentCompId = compId;

  // Fetch playground info
  const infoJson = engine.get_playground_info(BigInt(compId));
  if (!infoJson || infoJson === "null") {
    showToast("Component not found");
    return;
  }
  currentInfo = JSON.parse(infoJson) as PlaygroundInfo;
  if (currentInfo.variants.length > 0) {
    selectedVariantKey = currentInfo.variants[0].key_string;
  }

  buildOverlay();
}

function getComponentIdFromSelection(engine: any): number | undefined {
  try {
    const selJson = engine.get_selection();
    const sel: number[] = JSON.parse(selJson || "[]");
    if (sel.length !== 1) return undefined;
    const nodeJson = engine.get_node_json(BigInt(sel[0]));
    if (!nodeJson) return undefined;
    const node = JSON.parse(nodeJson);
    const kind = node.kind;
    if (typeof kind === "object") {
      if (kind.Instance) return kind.Instance.component_id;
    }
    // Check if node itself is a component source
    const compsJson = engine.get_components();
    const comps = JSON.parse(compsJson || "[]");
    // Match by name or check component_info
    const infoJson = engine.get_instance_component_info(BigInt(sel[0]));
    if (infoJson && infoJson !== "null") {
      const info = JSON.parse(infoJson);
      if (info.component_id) return info.component_id;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function buildOverlay() {
  if (!currentInfo) return;

  overlay = document.createElement("div");
  overlay.id = "component-playground-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 99999;
    background: #1e1e2e; display: flex; flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #e0e0e0;
  `;

  // Header
  const header = document.createElement("div");
  header.style.cssText = `
    height: 48px; background: #252535; display: flex; align-items: center;
    padding: 0 16px; border-bottom: 1px solid #333; gap: 12px; flex-shrink: 0;
  `;
  header.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7b61ff" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M3 9h6"/>
      </svg>
      <span style="font-weight:600;font-size:14px;color:#fff;">${escHtml(currentInfo!.name)}</span>
      <span style="font-size:12px;color:#888;">${currentInfo!.variant_count} variant${currentInfo!.variant_count !== 1 ? 's' : ''}</span>
    </div>
    <div style="flex:1;"></div>
    <span style="font-size:12px;color:#666;">⌘⇧P to toggle</span>
    <button id="pg-close" style="background:none;border:none;color:#888;cursor:pointer;font-size:18px;padding:4px 8px;">&times;</button>
  `;
  overlay.appendChild(header);

  // Body: left sidebar + center + right sidebar
  const body = document.createElement("div");
  body.style.cssText = "display:flex; flex:1; overflow:hidden;";

  // Left: Variant list
  const left = document.createElement("div");
  left.id = "pg-left";
  left.style.cssText = `
    width: 220px; background: #252535; border-right: 1px solid #333;
    overflow-y: auto; flex-shrink: 0; padding: 8px 0;
  `;
  left.innerHTML = buildVariantList();
  body.appendChild(left);

  // Center: Preview
  const center = document.createElement("div");
  center.id = "pg-center";
  center.style.cssText = `
    flex: 1; display: flex; flex-direction: column; align-items: center;
    justify-content: center; padding: 32px; overflow: auto;
    background: repeating-conic-gradient(#2a2a3a 0% 25%, #252535 0% 50%) 0 0 / 20px 20px;
  `;
  center.innerHTML = buildPreview();
  body.appendChild(center);

  // Right: Props editor
  const right = document.createElement("div");
  right.id = "pg-right";
  right.style.cssText = `
    width: 260px; background: #252535; border-left: 1px solid #333;
    overflow-y: auto; flex-shrink: 0; padding: 12px;
  `;
  right.innerHTML = buildPropsEditor();
  body.appendChild(right);

  overlay.appendChild(body);

  // Bottom: Breakpoint bar
  const bottom = document.createElement("div");
  bottom.id = "pg-bottom";
  bottom.style.cssText = `
    height: 44px; background: #252535; border-top: 1px solid #333;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    flex-shrink: 0; padding: 0 16px;
  `;
  bottom.innerHTML = buildBreakpointBar();
  overlay.appendChild(bottom);

  document.body.appendChild(overlay);

  // Event listeners
  overlay.querySelector("#pg-close")!.addEventListener("click", closePlayground);
  attachVariantListeners();
  attachBreakpointListeners();
  attachPropsListeners();

  // Escape to close
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      closePlayground();
      document.removeEventListener("keydown", escHandler);
    }
  };
  document.addEventListener("keydown", escHandler);
}

function buildVariantList(): string {
  if (!currentInfo) return "";
  const items = currentInfo.variants.map((v) => {
    const isActive = v.key_string === selectedVariantKey;
    const propBadges = v.properties.map(p =>
      `<span style="font-size:10px;background:${isActive ? '#5a4fb8' : '#333'};padding:1px 5px;border-radius:3px;">${escHtml(p.name)}=${escHtml(p.value)}</span>`
    ).join(" ");
    return `
      <div class="pg-variant-item" data-key="${escHtml(v.key_string)}"
           style="padding:8px 12px;cursor:pointer;border-left:3px solid ${isActive ? '#7b61ff' : 'transparent'};
                  background:${isActive ? '#2e2b4a' : 'transparent'};margin:2px 0;transition:all .15s;">
        <div style="font-size:12px;font-weight:${isActive ? '600' : '400'};margin-bottom:2px;">
          ${escHtml(v.key_display || 'Default')}
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;">${propBadges}</div>
        <div style="font-size:10px;color:#666;margin-top:2px;">${v.node_count} nodes</div>
      </div>
    `;
  }).join("");

  return `
    <div style="padding:8px 12px;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px;">
      Variants (${currentInfo.variant_count})
    </div>
    ${items || '<div style="padding:12px;color:#666;font-size:12px;">No variants defined</div>'}
  `;
}

function buildPreview(): string {
  if (!currentInfo || currentInfo.variants.length === 0) {
    return '<div style="color:#666;font-size:14px;">No variants to preview</div>';
  }

  // Use SVG export for preview
  if (!currentEngine) return '';

  const variant = currentInfo.variants.find(v => v.key_string === selectedVariantKey);
  if (!variant) return '<div style="color:#666;">Variant not found</div>';

  // Try to export SVG of the variant's root node
  try {
    const svg = currentEngine.export_node_svg(BigInt(variant.root_node_id));
    if (svg && svg.length > 10) {
      const maxW = activeBreakpoint || 600;
      return `
        <div style="background:#fff;border-radius:8px;padding:24px;box-shadow:0 4px 24px rgba(0,0,0,.3);max-width:${maxW}px;overflow:auto;">
          <div style="text-align:center;">${svg}</div>
        </div>
        <div style="margin-top:12px;font-size:11px;color:#666;">
          ${escHtml(variant.key_display || 'Default')} · ${variant.node_count} nodes
          ${activeBreakpoint ? ` · ${activeBreakpoint}px` : ''}
        </div>
      `;
    }
  } catch {}

  // Fallback: show info card
  return `
    <div style="background:#2e2e3e;border-radius:8px;padding:24px;text-align:center;min-width:200px;">
      <div style="font-size:16px;font-weight:600;margin-bottom:8px;">${escHtml(currentInfo!.name)}</div>
      <div style="font-size:12px;color:#888;">Variant: ${escHtml(variant.key_display || 'Default')}</div>
      <div style="font-size:12px;color:#666;margin-top:4px;">${variant.node_count} nodes</div>
    </div>
  `;
}

function buildPropsEditor(): string {
  if (!currentInfo) return "";

  let html = `<div style="font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">Properties</div>`;

  if (currentInfo.properties.length === 0) {
    html += '<div style="font-size:12px;color:#555;">No properties defined</div>';
  } else {
    for (const prop of currentInfo.properties) {
      const currentVariant = currentInfo.variants.find(v => v.key_string === selectedVariantKey);
      const currentValue = currentVariant?.properties.find(p => p.name === prop.name)?.value || prop.default_value;

      if (prop.prop_type === "boolean") {
        html += `
          <div style="margin-bottom:10px;">
            <label style="font-size:12px;display:flex;align-items:center;gap:8px;cursor:pointer;">
              <input type="checkbox" class="pg-prop-toggle" data-prop="${escHtml(prop.name)}"
                     ${currentValue === "true" ? "checked" : ""}
                     style="accent-color:#7b61ff;">
              ${escHtml(prop.name)}
            </label>
          </div>
        `;
      } else {
        html += `
          <div style="margin-bottom:10px;">
            <div style="font-size:11px;color:#999;margin-bottom:4px;">${escHtml(prop.name)}</div>
            <select class="pg-prop-select" data-prop="${escHtml(prop.name)}"
                    style="width:100%;background:#1e1e2e;color:#e0e0e0;border:1px solid #444;border-radius:4px;padding:5px 8px;font-size:12px;">
              ${prop.options.map(o => `<option value="${escHtml(o)}" ${o === currentValue ? 'selected' : ''}>${escHtml(o)}</option>`).join("")}
            </select>
          </div>
        `;
      }
    }
  }

  // Slots section
  if (currentInfo.slots.length > 0) {
    html += `
      <div style="font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 8px;">
        Slots (${currentInfo.slots.length})
      </div>
    `;
    for (const slot of currentInfo.slots) {
      html += `<div style="font-size:12px;padding:4px 0;color:#aaa;">📌 ${escHtml(slot)}</div>`;
    }
  }

  // Description
  if (currentInfo.description) {
    html += `
      <div style="font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 8px;">Description</div>
      <div style="font-size:12px;color:#999;line-height:1.5;">${escHtml(currentInfo.description)}</div>
    `;
  }

  return html;
}

function buildBreakpointBar(): string {
  const chips = BREAKPOINTS.map(bp => {
    const isActive = activeBreakpoint === bp.width;
    return `
      <button class="pg-bp-btn" data-width="${bp.width}"
              style="padding:5px 14px;border-radius:12px;font-size:11px;cursor:pointer;
                     border:1px solid ${isActive ? bp.color : '#444'};
                     background:${isActive ? bp.color + '22' : 'transparent'};
                     color:${isActive ? bp.color : '#999'};font-weight:${isActive ? '600' : '400'};">
        ${bp.label} · ${bp.width}px
      </button>
    `;
  }).join("");

  const autoActive = activeBreakpoint === null;
  return `
    <button class="pg-bp-btn" data-width="auto"
            style="padding:5px 14px;border-radius:12px;font-size:11px;cursor:pointer;
                   border:1px solid ${autoActive ? '#fff' : '#444'};
                   background:${autoActive ? '#ffffff11' : 'transparent'};
                   color:${autoActive ? '#fff' : '#999'};font-weight:${autoActive ? '600' : '400'};">
      Auto
    </button>
    ${chips}
  `;
}

function attachVariantListeners() {
  if (!overlay) return;
  overlay.querySelectorAll(".pg-variant-item").forEach(el => {
    el.addEventListener("click", () => {
      selectedVariantKey = (el as HTMLElement).dataset.key || "";
      refreshUI();
    });
  });
}

function attachBreakpointListeners() {
  if (!overlay) return;
  overlay.querySelectorAll(".pg-bp-btn").forEach(el => {
    el.addEventListener("click", () => {
      const w = (el as HTMLElement).dataset.width;
      activeBreakpoint = w === "auto" ? null : parseInt(w!, 10);
      refreshUI();
    });
  });
}

function attachPropsListeners() {
  if (!overlay) return;

  // When a prop changes, find the matching variant and switch to it
  overlay.querySelectorAll(".pg-prop-toggle, .pg-prop-select").forEach(el => {
    const evName = el.tagName === "SELECT" ? "change" : "change";
    el.addEventListener(evName, () => {
      switchToMatchingVariant();
    });
  });
}

function switchToMatchingVariant() {
  if (!overlay || !currentInfo) return;

  // Gather current prop values from UI
  const props: Record<string, string> = {};
  overlay.querySelectorAll(".pg-prop-toggle").forEach(el => {
    const inp = el as HTMLInputElement;
    props[inp.dataset.prop!] = inp.checked ? "true" : "false";
  });
  overlay.querySelectorAll(".pg-prop-select").forEach(el => {
    const sel = el as HTMLSelectElement;
    props[sel.dataset.prop!] = sel.value;
  });

  // Find matching variant
  for (const v of currentInfo.variants) {
    const matches = v.properties.every(p => props[p.name] === p.value);
    if (matches) {
      selectedVariantKey = v.key_string;
      refreshUI();
      return;
    }
  }
}

function refreshUI() {
  if (!overlay) return;
  const left = overlay.querySelector("#pg-left");
  if (left) {
    left.innerHTML = buildVariantList();
    attachVariantListeners();
  }
  const center = overlay.querySelector("#pg-center");
  if (center) {
    center.innerHTML = buildPreview();
  }
  const right = overlay.querySelector("#pg-right");
  if (right) {
    right.innerHTML = buildPropsEditor();
    attachPropsListeners();
  }
  const bottom = overlay.querySelector("#pg-bottom");
  if (bottom) {
    bottom.innerHTML = buildBreakpointBar();
    attachBreakpointListeners();
  }
}

function showToast(msg: string) {
  const t = document.createElement("div");
  t.style.cssText = `
    position: fixed; bottom: 60px; left: 50%; transform: translateX(-50%);
    background: #333; color: #fff; padding: 8px 16px; border-radius: 6px;
    font-size: 13px; z-index: 999999; pointer-events: none;
  `;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
