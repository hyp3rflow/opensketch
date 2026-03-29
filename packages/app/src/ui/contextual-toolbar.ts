/**
 * Contextual Toolbar — Floating quick-edit bar that appears above selection.
 * Shows different actions based on selected node type(s).
 */
import type { Editor } from "../editor";

interface ToolbarAction {
  icon: string;
  title: string;
  action: (editor: Editor, ids: number[]) => void;
  showFor?: string[]; // node kinds, undefined = all
  minSelection?: number;
  maxSelection?: number;
}

const FILL_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" fill="currentColor"/></svg>`;
const STROKE_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`;
const OPACITY_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="8" r="4" fill="currentColor" opacity="0.5"/><circle cx="10" cy="8" r="4" fill="currentColor" opacity="0.3"/></svg>`;
const RADIUS_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 12V6a2 2 0 012-2h6" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`;
const BOLD_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 2h5a3 3 0 010 6H4V2zm0 6h6a3 3 0 010 6H4V8z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`;
const ALIGN_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M3 8h6M3 12h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const FONT_SIZE_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><text x="2" y="13" font-size="12" font-weight="600" fill="currentColor">A</text></svg>`;
const DELETE_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const DUPLICATE_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.2" fill="none"/><rect x="5" y="1" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.5"/></svg>`;
const GROUP_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.2" fill="none" stroke-dasharray="3 2"/></svg>`;
const FLATTEN_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8h12M8 2v12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const LAYOUT_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="4" height="10" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/><rect x="6" y="3" width="4" height="10" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/><rect x="11" y="3" width="4" height="10" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>`;

// Color picker mini helper
function showColorPicker(
  editor: Editor,
  ids: number[],
  type: "fill" | "stroke",
  anchorEl: HTMLElement
) {
  // Remove any existing
  document.querySelector(".os-ctx-colorpicker")?.remove();

  const picker = document.createElement("div");
  picker.className = "os-ctx-colorpicker";
  picker.style.cssText =
    "position:fixed;z-index:10002;background:#2a2a2a;border-radius:8px;padding:8px;box-shadow:0 4px 16px rgba(0,0,0,0.4);display:flex;flex-wrap:wrap;gap:4px;width:176px";

  const presets = [
    "#000000", "#333333", "#666666", "#999999", "#cccccc", "#ffffff",
    "#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#007aff", "#af52de",
    "#ff2d55", "#5856d6", "#00c7be", "#ff6482", "#30b0c7", "#a2845e",
  ];

  for (const color of presets) {
    const swatch = document.createElement("div");
    swatch.style.cssText = `width:24px;height:24px;border-radius:4px;cursor:pointer;background:${color};border:1px solid rgba(255,255,255,0.1)`;
    swatch.title = color;
    swatch.addEventListener("click", () => {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      for (const id of ids) {
        const bid = BigInt(id);
        if (type === "fill") {
          editor.engine.set_fill_color(bid, r, g, b, 255);
        } else {
          editor.engine.set_stroke(bid, r, g, b, 255, 1);
        }
      }
      editor.engine.push_undo();
      editor.requestRender();
      picker.remove();
    });
    picker.appendChild(swatch);
  }

  // Custom color input
  const customRow = document.createElement("div");
  customRow.style.cssText = "width:100%;display:flex;gap:4px;margin-top:4px";
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.style.cssText = "width:32px;height:24px;border:none;padding:0;cursor:pointer;background:none";
  colorInput.addEventListener("input", () => {
    const hex = colorInput.value;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    for (const id of ids) {
      const bid = BigInt(id);
      if (type === "fill") {
        editor.engine.set_fill_color(bid, r, g, b, 255);
      } else {
        editor.engine.set_stroke(bid, r, g, b, 255, 1);
      }
    }
    editor.requestRender();
  });
  colorInput.addEventListener("change", () => {
    editor.engine.push_undo();
    picker.remove();
  });
  customRow.appendChild(colorInput);
  picker.appendChild(customRow);

  const rect = anchorEl.getBoundingClientRect();
  picker.style.left = `${rect.left}px`;
  picker.style.top = `${rect.bottom + 6}px`;
  document.body.appendChild(picker);

  const dismiss = (e: MouseEvent) => {
    if (!picker.contains(e.target as Node)) {
      picker.remove();
      document.removeEventListener("mousedown", dismiss);
    }
  };
  setTimeout(() => document.addEventListener("mousedown", dismiss), 0);
}

// Opacity slider
function showOpacitySlider(editor: Editor, ids: number[], anchorEl: HTMLElement) {
  document.querySelector(".os-ctx-opacity")?.remove();
  const popup = document.createElement("div");
  popup.className = "os-ctx-opacity";
  popup.style.cssText =
    "position:fixed;z-index:10002;background:#2a2a2a;border-radius:8px;padding:12px;box-shadow:0 4px 16px rgba(0,0,0,0.4);width:160px";

  const label = document.createElement("div");
  label.style.cssText = "color:#aaa;font-size:11px;margin-bottom:6px";
  label.textContent = "Opacity";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  // Get current opacity from first node
  try {
    const info = JSON.parse(editor.engine.get_node_json(BigInt(ids[0])) || "{}");
    slider.value = String(Math.round((info.opacity ?? 1) * 100));
  } catch {
    slider.value = "100";
  }
  slider.style.cssText = "width:100%;accent-color:#4a90d9";

  const valLabel = document.createElement("span");
  valLabel.style.cssText = "color:#eee;font-size:12px;margin-left:8px";
  valLabel.textContent = slider.value + "%";

  slider.addEventListener("input", () => {
    const val = parseInt(slider.value) / 100;
    valLabel.textContent = slider.value + "%";
    for (const id of ids) {
      editor.engine.set_opacity(BigInt(id), val);
    }
    editor.requestRender();
  });
  slider.addEventListener("change", () => {
    editor.engine.push_undo();
    popup.remove();
  });

  popup.appendChild(label);
  const row = document.createElement("div");
  row.style.cssText = "display:flex;align-items:center";
  row.appendChild(slider);
  row.appendChild(valLabel);
  popup.appendChild(row);

  const rect = anchorEl.getBoundingClientRect();
  popup.style.left = `${rect.left}px`;
  popup.style.top = `${rect.bottom + 6}px`;
  document.body.appendChild(popup);

  const dismiss = (e: MouseEvent) => {
    if (!popup.contains(e.target as Node)) {
      popup.remove();
      document.removeEventListener("mousedown", dismiss);
    }
  };
  setTimeout(() => document.addEventListener("mousedown", dismiss), 0);
}

// Corner radius input
function showCornerRadiusInput(editor: Editor, ids: number[], anchorEl: HTMLElement) {
  document.querySelector(".os-ctx-radius")?.remove();
  const popup = document.createElement("div");
  popup.className = "os-ctx-radius";
  popup.style.cssText =
    "position:fixed;z-index:10002;background:#2a2a2a;border-radius:8px;padding:12px;box-shadow:0 4px 16px rgba(0,0,0,0.4);width:120px";

  const label = document.createElement("div");
  label.style.cssText = "color:#aaa;font-size:11px;margin-bottom:6px";
  label.textContent = "Corner Radius";

  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.step = "1";
  input.style.cssText =
    "width:100%;box-sizing:border-box;padding:6px 8px;background:#1a1a1a;border:1px solid #444;border-radius:4px;color:#eee;font-size:12px";
  try {
    const info = JSON.parse(editor.engine.get_node_json(BigInt(ids[0])) || "{}");
    input.value = String(info.corner_radius ?? 0);
  } catch {
    input.value = "0";
  }

  const apply = () => {
    const val = parseFloat(input.value) || 0;
    for (const id of ids) {
      editor.engine.set_corner_radius(BigInt(id), val);
    }
    editor.engine.push_undo();
    editor.requestRender();
    popup.remove();
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") apply();
    if (e.key === "Escape") popup.remove();
  });

  popup.appendChild(label);
  popup.appendChild(input);

  const rect = anchorEl.getBoundingClientRect();
  popup.style.left = `${rect.left}px`;
  popup.style.top = `${rect.bottom + 6}px`;
  document.body.appendChild(popup);
  input.focus();
  input.select();

  const dismiss = (e: MouseEvent) => {
    if (!popup.contains(e.target as Node)) {
      popup.remove();
      document.removeEventListener("mousedown", dismiss);
    }
  };
  setTimeout(() => document.addEventListener("mousedown", dismiss), 0);
}

// Font size input
function showFontSizeInput(editor: Editor, ids: number[], anchorEl: HTMLElement) {
  document.querySelector(".os-ctx-fontsize")?.remove();
  const popup = document.createElement("div");
  popup.className = "os-ctx-fontsize";
  popup.style.cssText =
    "position:fixed;z-index:10002;background:#2a2a2a;border-radius:8px;padding:12px;box-shadow:0 4px 16px rgba(0,0,0,0.4);width:120px";

  const label = document.createElement("div");
  label.style.cssText = "color:#aaa;font-size:11px;margin-bottom:6px";
  label.textContent = "Font Size";

  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.step = "1";
  input.style.cssText =
    "width:100%;box-sizing:border-box;padding:6px 8px;background:#1a1a1a;border:1px solid #444;border-radius:4px;color:#eee;font-size:12px";
  try {
    const info = JSON.parse(editor.engine.get_node_json(BigInt(ids[0])) || "{}");
    input.value = String(info.font_size ?? 16);
  } catch {
    input.value = "16";
  }

  const apply = () => {
    const val = parseFloat(input.value) || 16;
    for (const id of ids) {
      editor.engine.set_font_size(BigInt(id), val);
    }
    editor.engine.push_undo();
    editor.requestRender();
    popup.remove();
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") apply();
    if (e.key === "Escape") popup.remove();
  });

  popup.appendChild(label);
  popup.appendChild(input);

  const rect = anchorEl.getBoundingClientRect();
  popup.style.left = `${rect.left}px`;
  popup.style.top = `${rect.bottom + 6}px`;
  document.body.appendChild(popup);
  input.focus();
  input.select();

  const dismiss = (e: MouseEvent) => {
    if (!popup.contains(e.target as Node)) {
      popup.remove();
      document.removeEventListener("mousedown", dismiss);
    }
  };
  setTimeout(() => document.addEventListener("mousedown", dismiss), 0);
}

export function setupContextualToolbar(editor: Editor) {
  const bar = document.createElement("div");
  bar.className = "os-contextual-toolbar";
  bar.style.cssText = `
    position: fixed;
    z-index: 9998;
    display: none;
    align-items: center;
    gap: 2px;
    padding: 4px 6px;
    background: #2a2a2a;
    border: 1px solid #3a3a3a;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.35);
    font-family: Inter, system-ui, sans-serif;
    font-size: 12px;
    color: #eee;
    pointer-events: auto;
    user-select: none;
  `;
  document.body.appendChild(bar);

  let visible = false;
  let currentIds: number[] = [];
  let currentKinds: string[] = [];
  let rafPending = false;

  function createButton(icon: string, title: string, onClick: (btn: HTMLElement) => void): HTMLElement {
    const btn = document.createElement("button");
    btn.innerHTML = icon;
    btn.title = title;
    btn.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #ccc;
      cursor: pointer;
      padding: 0;
      transition: background 0.1s;
    `;
    btn.addEventListener("mouseenter", () => (btn.style.background = "#3a3a3a"));
    btn.addEventListener("mouseleave", () => (btn.style.background = "transparent"));
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick(btn);
    });
    return btn;
  }

  function createSeparator(): HTMLElement {
    const sep = document.createElement("div");
    sep.style.cssText = "width:1px;height:20px;background:#444;margin:0 2px";
    return sep;
  }

  function buildActions(ids: number[], kinds: string[]): void {
    bar.innerHTML = "";
    const uniqueKinds = [...new Set(kinds)];
    const isAllText = uniqueKinds.length === 1 && uniqueKinds[0] === "Text";
    const isAllShape = uniqueKinds.every((k) =>
      ["Rect", "Ellipse", "Star", "Polygon", "Path", "Frame"].includes(k)
    );
    const hasText = kinds.includes("Text");
    const hasShapeOrFrame = kinds.some((k) =>
      ["Rect", "Ellipse", "Star", "Polygon", "Path", "Frame", "Image", "Instance"].includes(k)
    );

    // Fill color (for shapes)
    if (hasShapeOrFrame || hasText) {
      bar.appendChild(
        createButton(FILL_ICON, "Fill Color", (btn) => showColorPicker(editor, ids, "fill", btn))
      );
    }

    // Stroke color
    if (hasShapeOrFrame) {
      bar.appendChild(
        createButton(STROKE_ICON, "Stroke Color", (btn) => showColorPicker(editor, ids, "stroke", btn))
      );
    }

    // Opacity
    bar.appendChild(
      createButton(OPACITY_ICON, "Opacity", (btn) => showOpacitySlider(editor, ids, btn))
    );

    // Corner radius (for rect-like shapes)
    if (kinds.some((k) => ["Rect", "Frame", "Image"].includes(k))) {
      bar.appendChild(
        createButton(RADIUS_ICON, "Corner Radius", (btn) => showCornerRadiusInput(editor, ids, btn))
      );
    }

    // Text-specific: font size, bold toggle, text align
    if (hasText) {
      bar.appendChild(createSeparator());
      // Font size
      bar.appendChild(
        createButton(FONT_SIZE_ICON, "Font Size", (btn) => showFontSizeInput(editor, ids, btn))
      );
      // Bold toggle
      bar.appendChild(
        createButton(BOLD_ICON, "Toggle Bold", () => {
          for (const id of ids) {
            const bid = BigInt(id);
            try {
              const info = JSON.parse(editor.engine.get_node_json(bid) || "{}");
              const currentWeight = info.font_weight ?? 400;
              editor.engine.set_font_weight(bid, currentWeight >= 700 ? 400 : 700);
            } catch { /* ignore */ }
          }
          editor.engine.push_undo();
          editor.requestRender();
        })
      );
      // Text align cycle
      bar.appendChild(
        createButton(ALIGN_ICON, "Text Align", () => {
          for (const id of ids) {
            const bid = BigInt(id);
            try {
              const info = JSON.parse(editor.engine.get_node_json(bid) || "{}");
              const cur = info.text_align ?? "Left";
              const next = cur === "Left" ? "Center" : cur === "Center" ? "Right" : "Left";
              editor.engine.set_text_align(bid, next);
            } catch { /* ignore */ }
          }
          editor.engine.push_undo();
          editor.requestRender();
        })
      );
    }

    // Auto layout toggle (for Frames)
    if (uniqueKinds.includes("Frame")) {
      bar.appendChild(createSeparator());
      bar.appendChild(
        createButton(LAYOUT_ICON, "Toggle Auto Layout", () => {
          for (const id of ids) {
            const bid = BigInt(id);
            try {
              const info = JSON.parse(editor.engine.get_node_json(bid) || "{}");
              const layout = info.layout;
              if (layout && layout.mode && layout.mode !== "None") {
                editor.engine.set_layout_mode(bid, "None");
              } else {
                editor.engine.set_layout_mode(bid, "Flex");
              }
            } catch { /* ignore */ }
          }
          editor.engine.push_undo();
          editor.requestRender();
        })
      );
    }

    // Common actions separator
    bar.appendChild(createSeparator());

    // Duplicate
    bar.appendChild(
      createButton(DUPLICATE_ICON, "Duplicate (⌘D)", () => {
        (editor as any).duplicateSelection?.();
        editor.requestRender();
      })
    );

    // Group (2+ selection)
    if (ids.length >= 2) {
      bar.appendChild(
        createButton(GROUP_ICON, "Group (⌘G)", () => {
          editor.engine.group_selection();
          editor.engine.push_undo();
          editor.requestRender();
          (editor as any).onLayersChanges?.forEach?.((fn: any) => fn());
        })
      );
    }

    // Flatten
    bar.appendChild(
      createButton(FLATTEN_ICON, "Flatten (⌘E)", () => {
        editor.engine.flatten_selection();
        editor.engine.push_undo();
        editor.requestRender();
        (editor as any).onLayersChanges?.forEach?.((fn: any) => fn());
      })
    );

    // Delete
    bar.appendChild(
      createButton(DELETE_ICON, "Delete", () => {
        for (const id of ids) {
          editor.engine.delete_node(BigInt(id));
        }
        editor.engine.push_undo();
        editor.requestRender();
        (editor as any).onLayersChanges?.forEach?.((fn: any) => fn());
      })
    );
  }

  function updatePosition() {
    if (!visible || currentIds.length === 0) {
      bar.style.display = "none";
      return;
    }

    try {
      const boundsJson = editor.engine.get_selection_bounds();
      if (!boundsJson) {
        bar.style.display = "none";
        return;
      }
      const bounds = JSON.parse(boundsJson);
      if (!bounds || bounds.x == null) {
        bar.style.display = "none";
        return;
      }

      const zoom = editor.engine.get_zoom();
      const panX = editor.engine.get_pan_x();
      const panY = editor.engine.get_pan_y();
      const canvasRect = editor.canvas.getBoundingClientRect();

      // Convert canvas coords to screen coords
      const screenX = canvasRect.left + (bounds.x + panX) * zoom;
      const screenY = canvasRect.top + (bounds.y + panY) * zoom;
      const screenW = bounds.width * zoom;

      const barRect = bar.getBoundingClientRect();
      const barW = barRect.width || 200;

      // Position above selection, centered
      let left = screenX + screenW / 2 - barW / 2;
      let top = screenY - 44;

      // Clamp to viewport
      left = Math.max(8, Math.min(left, window.innerWidth - barW - 8));
      top = Math.max(8, top);

      // If too close to top, show below selection instead
      if (top < 8) {
        const screenBottom = screenY + bounds.height * zoom;
        top = screenBottom + 8;
      }

      bar.style.display = "flex";
      bar.style.left = `${left}px`;
      bar.style.top = `${top}px`;
    } catch {
      bar.style.display = "none";
    }
  }

  function scheduleUpdate() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      updatePosition();
    });
  }

  // Listen for selection changes
  editor.onSelection((ids: number[]) => {
    currentIds = ids;
    if (ids.length === 0) {
      visible = false;
      bar.style.display = "none";
      return;
    }

    // Get kinds for each selected node
    currentKinds = [];
    for (const id of ids) {
      try {
        const kind = editor.engine.get_node_kind(BigInt(id));
        if (kind) currentKinds.push(kind);
      } catch {
        // Fallback: parse from JSON
        try {
          const json = editor.engine.get_node_json(BigInt(id));
          if (json) {
            const info = JSON.parse(json);
            if (info.kind) {
              const kindStr = typeof info.kind === "string" ? info.kind : Object.keys(info.kind)[0];
              currentKinds.push(kindStr);
            }
          }
        } catch { /* ignore */ }
      }
    }

    visible = true;
    buildActions(ids, currentKinds);
    scheduleUpdate();
  });

  // Update position on zoom/pan changes
  const origRender = (editor as any).requestRender?.bind(editor);
  if (origRender) {
    (editor as any)._ctxToolbarInterval = setInterval(() => {
      if (visible) scheduleUpdate();
    }, 100);
  }

  // Hide during drag/pan/tool changes
  const hideTemporarily = () => {
    if (visible) bar.style.display = "none";
  };
  const showAgain = () => {
    if (visible) scheduleUpdate();
  };

  editor.canvas.addEventListener("pointerdown", hideTemporarily);
  editor.canvas.addEventListener("pointerup", () => setTimeout(showAgain, 50));

  // Clean up popups on outside click
  document.addEventListener("mousedown", (e) => {
    const target = e.target as HTMLElement;
    if (
      !bar.contains(target) &&
      !target.closest(".os-ctx-colorpicker") &&
      !target.closest(".os-ctx-opacity") &&
      !target.closest(".os-ctx-radius") &&
      !target.closest(".os-ctx-fontsize")
    ) {
      // Close any open sub-popups
      document.querySelector(".os-ctx-colorpicker")?.remove();
      document.querySelector(".os-ctx-opacity")?.remove();
      document.querySelector(".os-ctx-radius")?.remove();
      document.querySelector(".os-ctx-fontsize")?.remove();
    }
  });

  return {
    destroy() {
      bar.remove();
      clearInterval((editor as any)._ctxToolbarInterval);
    },
  };
}
