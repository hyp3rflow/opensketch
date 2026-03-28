/**
 * Component Playground
 *
 * Fullscreen overlay for testing components in isolation:
 * - Left: variant list with click-to-switch
 * - Center: rendered preview of selected variant instance
 * - Right: override props editor (fills, text, visibility)
 * - Bottom: responsive breakpoint bar (Mobile 375 / Tablet 768 / Desktop 1440)
 */

import { icons } from "./icons";

interface PlaygroundProp {
  name: string;
  prop_type: string;
  options: string[];
  default_value: string;
}

interface PlaygroundSlot {
  name: string;
  placeholder_node_id: number;
  default_children_count: number;
}

interface PlaygroundVariant {
  key_string: string;
  key_values: Record<string, string>;
  root_node_id: number;
  node_count: number;
  is_default: boolean;
}

interface PlaygroundInfo {
  component_id: number;
  component_name: string;
  description: string;
  properties: PlaygroundProp[];
  slots: PlaygroundSlot[];
  variants: PlaygroundVariant[];
}

interface Breakpoint {
  label: string;
  width: number;
  color: string;
}

const BREAKPOINTS: Breakpoint[] = [
  { label: "Mobile", width: 375, color: "#4a90d9" },
  { label: "Tablet", width: 768, color: "#7b61ff" },
  { label: "Desktop", width: 1440, color: "#2ecc71" },
];

let overlay: HTMLDivElement | null = null;
let activeComponentId: number | null = null;
let activeVariantKey: string | null = null;
let activeBreakpoint: number | null = null; // null = show all breakpoints
let instanceNodeId: number | null = null;
let savedScene: string | null = null;

// Override state
let overrides: Record<string, { text?: string; fill_hex?: string; visible?: boolean }> = {};

export function isComponentPlaygroundOpen(): boolean {
  return overlay !== null;
}

export function closeComponentPlayground() {
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
  activeComponentId = null;
  activeVariantKey = null;
  activeBreakpoint = null;
  instanceNodeId = null;
  overrides = {};
  // Restore scene if saved
  if (savedScene) {
    savedScene = null;
  }
}

function showToast(msg: string) {
  const t = document.createElement("div");
  t.textContent = msg;
  t.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:8px 16px;border-radius:8px;font-size:12px;z-index:100001;pointer-events:none;";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

export function openComponentPlayground(engine: any, componentId?: number) {
  if (overlay) {
    closeComponentPlayground();
    return;
  }

  // Determine component ID
  let compId = componentId;
  if (!compId) {
    // Try to get from selection
    const selJson = engine.get_selection();
    const sel: number[] = JSON.parse(selJson || "[]");
    if (sel.length !== 1) {
      showToast("Select a component or instance to open playground");
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
    const kindStr = typeof kind === "string" ? kind : Object.keys(kind)[0];

    if (kindStr === "Instance") {
      // Get component_id from instance
      const compInfoStr = engine.get_instance_component_info(BigInt(nodeId));
      const compInfo = JSON.parse(compInfoStr);
      if (compInfo && compInfo.component_id) {
        compId = compInfo.component_id;
      }
    } else {
      // Try to find a component with a matching source node
      const compsStr = engine.get_components();
      const comps = JSON.parse(compsStr || "[]");
      // Check if any component's name matches or source node matches
      for (const c of comps) {
        if (nodeInfo.name && (nodeInfo.name === c.name || nodeInfo.name.startsWith("⬥ " + c.name))) {
          compId = c.id;
          break;
        }
      }
    }
  }

  if (!compId) {
    showToast("No component found for selection");
    return;
  }

  // Get playground info
  const infoStr = engine.get_playground_info(BigInt(compId));
  const info: PlaygroundInfo | null = JSON.parse(infoStr);
  if (!info) {
    showToast("Component not found");
    return;
  }

  activeComponentId = compId;
  activeVariantKey = info.variants.find(v => v.is_default)?.key_string || (info.variants[0]?.key_string ?? null);
  overrides = {};

  // Save scene state
  savedScene = engine.export_scene();

  buildOverlay(engine, info);
}

function buildOverlay(engine: any, info: PlaygroundInfo) {
  overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: #1a1a2e; z-index: 99999;
    display: flex; flex-direction: column;
    font-family: 'Inter', system-ui, sans-serif;
    color: #e0e0e0;
  `;

  // Header
  const header = document.createElement("div");
  header.style.cssText = `
    display: flex; align-items: center; gap: 12px;
    padding: 12px 20px; border-bottom: 1px solid #333;
    background: #16162a; flex-shrink: 0;
  `;

  const icon = document.createElement("span");
  icon.innerHTML = icons.component.replace(/width="\d+"/, 'width="20"').replace(/height="\d+"/, 'height="20"');
  icon.style.cssText = "color:#7b61ff;display:flex;";
  header.appendChild(icon);

  const title = document.createElement("div");
  title.style.cssText = "font-size:14px;font-weight:600;flex:1;";
  title.textContent = `Playground — ${info.component_name}`;
  header.appendChild(title);

  if (info.description) {
    const desc = document.createElement("div");
    desc.style.cssText = "font-size:11px;color:#888;flex:1;";
    desc.textContent = info.description;
    header.appendChild(desc);
  }

  const closeBtn = document.createElement("button");
  closeBtn.style.cssText = `
    background: rgba(255,255,255,0.08); border: 1px solid #444;
    border-radius: 6px; padding: 6px 14px; color: #ccc;
    cursor: pointer; font-size: 12px; transition: all 0.15s;
  `;
  closeBtn.textContent = "Close (Esc)";
  closeBtn.onclick = () => closeComponentPlayground();
  header.appendChild(closeBtn);
  overlay.appendChild(header);

  // Main content area
  const main = document.createElement("div");
  main.style.cssText = "display:flex;flex:1;overflow:hidden;";

  // Left panel — Variants
  const leftPanel = document.createElement("div");
  leftPanel.style.cssText = `
    width: 220px; border-right: 1px solid #333;
    overflow-y: auto; padding: 12px; flex-shrink: 0;
    background: #1e1e36;
  `;

  const varTitle = document.createElement("div");
  varTitle.style.cssText = "font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;";
  varTitle.textContent = `Variants (${info.variants.length})`;
  leftPanel.appendChild(varTitle);

  function renderVariantList() {
    // Clear existing variant buttons
    const existing = leftPanel.querySelectorAll(".pg-variant-btn");
    existing.forEach(el => el.remove());

    for (const variant of info.variants) {
      const btn = document.createElement("div");
      btn.className = "pg-variant-btn";
      const isActive = variant.key_string === activeVariantKey;
      btn.style.cssText = `
        padding: 8px 10px; margin-bottom: 4px; border-radius: 6px;
        cursor: pointer; font-size: 12px; transition: all 0.15s;
        border: 1px solid ${isActive ? '#7b61ff' : 'transparent'};
        background: ${isActive ? 'rgba(123,97,255,0.15)' : 'rgba(255,255,255,0.03)'};
      `;

      const label = variant.key_string || "Default";
      const displayLabel = label.length > 28 ? label.substring(0, 28) + "…" : label;
      btn.textContent = displayLabel;
      btn.title = label;

      if (variant.is_default) {
        const badge = document.createElement("span");
        badge.style.cssText = "font-size:9px;color:#7b61ff;margin-left:4px;";
        badge.textContent = "★";
        btn.appendChild(badge);
      }

      btn.addEventListener("click", () => {
        activeVariantKey = variant.key_string;
        renderVariantList();
        renderPreview();
      });

      btn.addEventListener("mouseenter", () => {
        if (!isActive) btn.style.background = "rgba(255,255,255,0.06)";
      });
      btn.addEventListener("mouseleave", () => {
        if (variant.key_string !== activeVariantKey) btn.style.background = "rgba(255,255,255,0.03)";
      });

      leftPanel.appendChild(btn);
    }

    // If no variants, show message
    if (info.variants.length === 0) {
      const noVar = document.createElement("div");
      noVar.style.cssText = "font-size:11px;color:#666;padding:8px;";
      noVar.textContent = "No variants defined";
      leftPanel.appendChild(noVar);
    }
  }

  renderVariantList();
  main.appendChild(leftPanel);

  // Center — Preview area
  const centerPanel = document.createElement("div");
  centerPanel.id = "pg-preview-area";
  centerPanel.style.cssText = `
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    overflow: auto; padding: 24px;
    background: #1a1a2e;
  `;
  main.appendChild(centerPanel);

  // Right panel — Props editor
  const rightPanel = document.createElement("div");
  rightPanel.id = "pg-props-panel";
  rightPanel.style.cssText = `
    width: 260px; border-left: 1px solid #333;
    overflow-y: auto; padding: 12px; flex-shrink: 0;
    background: #1e1e36;
  `;
  buildPropsPanel(rightPanel, engine, info);
  main.appendChild(rightPanel);

  overlay.appendChild(main);

  // Bottom — Breakpoint bar
  const bottomBar = document.createElement("div");
  bottomBar.style.cssText = `
    display: flex; align-items: center; gap: 8px;
    padding: 10px 20px; border-top: 1px solid #333;
    background: #16162a; flex-shrink: 0;
    justify-content: center;
  `;

  const bpLabel = document.createElement("span");
  bpLabel.style.cssText = "font-size:11px;color:#888;margin-right:8px;";
  bpLabel.textContent = "Breakpoints:";
  bottomBar.appendChild(bpLabel);

  // "All" button
  const allBtn = document.createElement("button");
  allBtn.style.cssText = `
    padding: 5px 12px; border-radius: 4px; font-size: 11px;
    cursor: pointer; transition: all 0.15s;
    border: 1px solid ${activeBreakpoint === null ? '#7b61ff' : '#444'};
    background: ${activeBreakpoint === null ? 'rgba(123,97,255,0.2)' : 'rgba(255,255,255,0.05)'};
    color: ${activeBreakpoint === null ? '#b4a0ff' : '#999'};
  `;
  allBtn.textContent = "All";
  allBtn.onclick = () => {
    activeBreakpoint = null;
    renderBreakpointButtons();
    renderPreview();
  };
  bottomBar.appendChild(allBtn);

  for (const bp of BREAKPOINTS) {
    const btn = document.createElement("button");
    btn.className = "pg-bp-btn";
    btn.dataset.width = String(bp.width);
    const isActive = activeBreakpoint === bp.width;
    btn.style.cssText = `
      padding: 5px 12px; border-radius: 4px; font-size: 11px;
      cursor: pointer; transition: all 0.15s;
      border: 1px solid ${isActive ? bp.color : '#444'};
      background: ${isActive ? bp.color + '22' : 'rgba(255,255,255,0.05)'};
      color: ${isActive ? bp.color : '#999'};
    `;
    btn.textContent = `${bp.label} (${bp.width}px)`;
    btn.onclick = () => {
      activeBreakpoint = bp.width;
      renderBreakpointButtons();
      renderPreview();
    };
    bottomBar.appendChild(btn);
  }

  function renderBreakpointButtons() {
    // Update "All" button
    allBtn.style.border = `1px solid ${activeBreakpoint === null ? '#7b61ff' : '#444'}`;
    allBtn.style.background = activeBreakpoint === null ? 'rgba(123,97,255,0.2)' : 'rgba(255,255,255,0.05)';
    allBtn.style.color = activeBreakpoint === null ? '#b4a0ff' : '#999';

    bottomBar.querySelectorAll(".pg-bp-btn").forEach((el) => {
      const btn = el as HTMLButtonElement;
      const w = Number(btn.dataset.width);
      const bp = BREAKPOINTS.find(b => b.width === w)!;
      const isActive = activeBreakpoint === w;
      btn.style.border = `1px solid ${isActive ? bp.color : '#444'}`;
      btn.style.background = isActive ? bp.color + '22' : 'rgba(255,255,255,0.05)';
      btn.style.color = isActive ? bp.color : '#999';
    });
  }

  overlay.appendChild(bottomBar);

  // Escape handler
  const keyHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeComponentPlayground();
      document.removeEventListener("keydown", keyHandler, true);
    }
  };
  document.addEventListener("keydown", keyHandler, true);

  document.body.appendChild(overlay);

  // Initial render
  renderPreview();

  function renderPreview() {
    if (!centerPanel) return;
    centerPanel.innerHTML = "";

    const breakpointsToShow = activeBreakpoint !== null
      ? BREAKPOINTS.filter(bp => bp.width === activeBreakpoint)
      : BREAKPOINTS;

    // Container for breakpoint previews
    const previewContainer = document.createElement("div");
    previewContainer.style.cssText = `
      display: flex; gap: 24px; align-items: flex-start;
      flex-wrap: wrap; justify-content: center;
    `;

    for (const bp of breakpointsToShow) {
      const card = document.createElement("div");
      card.style.cssText = `
        display: flex; flex-direction: column; align-items: center;
        background: #222244; border-radius: 12px;
        border: 1px solid ${bp.color}33; overflow: hidden;
        max-width: ${Math.min(bp.width, 500)}px;
      `;

      // Card header
      const cardHeader = document.createElement("div");
      cardHeader.style.cssText = `
        width: 100%; padding: 8px 12px; font-size: 11px;
        background: ${bp.color}15; color: ${bp.color};
        border-bottom: 1px solid ${bp.color}33;
        display: flex; justify-content: space-between;
      `;
      cardHeader.innerHTML = `<span>${bp.label}</span><span>${bp.width}px</span>`;
      card.appendChild(cardHeader);

      // Preview content — render instance SVG at this breakpoint width
      const previewEl = document.createElement("div");
      previewEl.style.cssText = `
        padding: 16px; background: #2a2a4e;
        display: flex; align-items: center; justify-content: center;
        min-height: 120px; width: 100%;
      `;

      // Try to create instance and export SVG
      try {
        if (activeComponentId && activeVariantKey !== null) {
          // Create a temp instance
          const tempId = engine.create_instance(BigInt(activeComponentId), 0, 0);
          if (tempId) {
            const numId = Number(tempId);
            // Apply variant
            if (activeVariantKey) {
              try {
                engine.set_instance_variant_by_key(BigInt(numId), activeVariantKey);
              } catch (_) {}
            }
            // Apply overrides
            for (const [nodeIdStr, ov] of Object.entries(overrides)) {
              try {
                const nid = BigInt(parseInt(nodeIdStr));
                if (ov.text !== undefined) engine.set_instance_override_text(BigInt(numId), nid, ov.text);
                if (ov.fill_hex !== undefined) engine.set_instance_override_fill(BigInt(numId), nid, ov.fill_hex);
                if (ov.visible !== undefined) engine.set_instance_override_visible(BigInt(numId), nid, ov.visible);
              } catch (_) {}
            }

            // Resize to breakpoint width
            try {
              const nodeJson = engine.get_node_json(BigInt(numId));
              if (nodeJson) {
                const node = JSON.parse(nodeJson);
                const scale = bp.width / Math.max(node.width, 1);
                const newH = node.height * scale;
                engine.resize_node_with_constraints(BigInt(numId), bp.width, newH);
              }
            } catch (_) {}

            // Export SVG
            try {
              const svg = engine.export_node_svg(BigInt(numId));
              if (svg) {
                previewEl.innerHTML = svg;
                // Scale SVG to fit
                const svgEl = previewEl.querySelector("svg");
                if (svgEl) {
                  svgEl.style.maxWidth = "100%";
                  svgEl.style.height = "auto";
                  svgEl.style.maxHeight = "400px";
                }
              } else {
                previewEl.innerHTML = `<div style="color:#666;font-size:12px;">No preview available</div>`;
              }
            } catch (_) {
              previewEl.innerHTML = `<div style="color:#666;font-size:12px;">Preview rendering failed</div>`;
            }

            // Remove temp instance
            try { engine.delete_node(BigInt(numId)); } catch (_) {}
          }
        } else {
          previewEl.innerHTML = `<div style="color:#666;font-size:12px;">Select a variant</div>`;
        }
      } catch (e) {
        previewEl.innerHTML = `<div style="color:#666;font-size:12px;">Error: ${e}</div>`;
      }

      card.appendChild(previewEl);
      previewContainer.appendChild(card);
    }

    // Active variant label
    const variantLabel = document.createElement("div");
    variantLabel.style.cssText = "font-size:12px;color:#888;margin-bottom:16px;text-align:center;";
    variantLabel.textContent = `Variant: ${activeVariantKey || "Default"}`;
    centerPanel.appendChild(variantLabel);

    centerPanel.appendChild(previewContainer);

    // Restore scene after rendering
    if (savedScene) {
      try { engine.import_scene(savedScene); } catch (_) {}
    }
  }
}

function buildPropsPanel(container: HTMLElement, engine: any, info: PlaygroundInfo) {
  const title = document.createElement("div");
  title.style.cssText = "font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;";
  title.textContent = "Override Properties";
  container.appendChild(title);

  // Properties section
  if (info.properties.length > 0) {
    const propSection = document.createElement("div");
    propSection.style.cssText = "margin-bottom:16px;";

    const propTitle = document.createElement("div");
    propTitle.style.cssText = "font-size:10px;color:#7b61ff;margin-bottom:8px;font-weight:500;";
    propTitle.textContent = "VARIANT PROPERTIES";
    propSection.appendChild(propTitle);

    for (const prop of info.properties) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:6px;";

      const label = document.createElement("span");
      label.style.cssText = "font-size:11px;color:#aaa;flex:1;";
      label.textContent = prop.name;
      row.appendChild(label);

      if (prop.prop_type === "boolean") {
        const toggle = document.createElement("input");
        toggle.type = "checkbox";
        toggle.checked = prop.default_value === "true";
        toggle.style.cssText = "accent-color:#7b61ff;";
        row.appendChild(toggle);
      } else if (prop.options.length > 0) {
        const select = document.createElement("select");
        select.style.cssText = "background:#2a2a4e;border:1px solid #444;border-radius:4px;color:#ccc;font-size:11px;padding:3px 6px;max-width:120px;";
        for (const opt of prop.options) {
          const option = document.createElement("option");
          option.value = opt;
          option.textContent = opt;
          if (opt === prop.default_value) option.selected = true;
          select.appendChild(option);
        }
        row.appendChild(select);
      } else {
        const input = document.createElement("input");
        input.type = "text";
        input.value = prop.default_value;
        input.style.cssText = "background:#2a2a4e;border:1px solid #444;border-radius:4px;color:#ccc;font-size:11px;padding:3px 6px;width:80px;";
        row.appendChild(input);
      }

      propSection.appendChild(row);
    }

    container.appendChild(propSection);
  }

  // Slots section
  if (info.slots.length > 0) {
    const slotSection = document.createElement("div");
    slotSection.style.cssText = "margin-bottom:16px;";

    const slotTitle = document.createElement("div");
    slotTitle.style.cssText = "font-size:10px;color:#4a90d9;margin-bottom:8px;font-weight:500;";
    slotTitle.textContent = "SLOTS";
    slotSection.appendChild(slotTitle);

    for (const slot of info.slots) {
      const row = document.createElement("div");
      row.style.cssText = "padding:6px 8px;background:rgba(74,144,217,0.08);border-radius:4px;margin-bottom:4px;font-size:11px;";
      row.innerHTML = `<span style="color:#ccc;">${slot.name}</span> <span style="color:#666;font-size:10px;">(${slot.default_children_count} default children)</span>`;
      slotSection.appendChild(row);
    }

    container.appendChild(slotSection);
  }

  // Node overrides section
  const overrideSection = document.createElement("div");
  const overrideTitle = document.createElement("div");
  overrideTitle.style.cssText = "font-size:10px;color:#2ecc71;margin-bottom:8px;font-weight:500;";
  overrideTitle.textContent = "NODE OVERRIDES";
  overrideSection.appendChild(overrideTitle);

  const hint = document.createElement("div");
  hint.style.cssText = "font-size:10px;color:#666;line-height:1.4;";
  hint.textContent = "Override text, fill, and visibility on individual nodes within the component instance.";
  overrideSection.appendChild(hint);

  // Show overridable nodes from the active variant
  const activeVar = info.variants.find(v => v.key_string === activeVariantKey);
  if (activeVar && activeVar.node_count > 0) {
    const nodeCount = document.createElement("div");
    nodeCount.style.cssText = "font-size:10px;color:#888;margin-top:8px;";
    nodeCount.textContent = `${activeVar.node_count} nodes in variant`;
    overrideSection.appendChild(nodeCount);
  }

  container.appendChild(overrideSection);

  // Component info footer
  const footer = document.createElement("div");
  footer.style.cssText = "margin-top:auto;padding-top:16px;border-top:1px solid #333;";
  const infoBlock = document.createElement("div");
  infoBlock.style.cssText = "font-size:10px;color:#666;line-height:1.5;";
  infoBlock.innerHTML = `
    <div><strong>ID:</strong> ${info.component_id}</div>
    <div><strong>Variants:</strong> ${info.variants.length}</div>
    <div><strong>Slots:</strong> ${info.slots.length}</div>
    <div><strong>Properties:</strong> ${info.properties.length}</div>
  `;
  footer.appendChild(infoBlock);
  container.appendChild(footer);
}
