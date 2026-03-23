/**
 * Export Preset Profiles — save/load named export configurations
 * Supports PNG, SVG, PDF-like (SVG wrapper) formats with scale, suffix, quality options.
 */

import type { Editor } from "../editor";

export interface ExportPreset {
  id: string;
  name: string;
  format: "png" | "svg";
  scale: number;        // 0.5, 1, 1.5, 2, 3, 4
  suffix: string;       // e.g. "@2x", "-thumb"
  quality: number;      // 0.1 - 1.0 (PNG compression hint, mostly for future JPEG)
}

const STORAGE_KEY = "opensketch-export-presets";

const DEFAULT_PRESETS: ExportPreset[] = [
  { id: "ios-1x", name: "iOS @1x", format: "png", scale: 1, suffix: "", quality: 1.0 },
  { id: "ios-2x", name: "iOS @2x", format: "png", scale: 2, suffix: "@2x", quality: 1.0 },
  { id: "ios-3x", name: "iOS @3x", format: "png", scale: 3, suffix: "@3x", quality: 1.0 },
  { id: "android-mdpi", name: "Android mdpi", format: "png", scale: 1, suffix: "-mdpi", quality: 1.0 },
  { id: "android-xxhdpi", name: "Android xxhdpi", format: "png", scale: 3, suffix: "-xxhdpi", quality: 1.0 },
  { id: "web-2x", name: "Web @2x", format: "png", scale: 2, suffix: "@2x", quality: 0.9 },
  { id: "svg-vector", name: "SVG Vector", format: "svg", scale: 1, suffix: "", quality: 1.0 },
];

export function loadPresets(): ExportPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return [...DEFAULT_PRESETS];
}

export function savePresets(presets: ExportPreset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

function genId(): string {
  return "preset-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Execute export for a node using a preset */
export function executeExport(editor: Editor, nodeId: number | bigint | undefined, preset: ExportPreset): void {
  const name = nodeId ? (getNodeName(editor, nodeId) || `node-${nodeId}`) : "opensketch-export";
  const filename = `${name}${preset.suffix}.${preset.format}`;

  if (preset.format === "svg") {
    if (nodeId != null) {
      const svg = editor.engine.export_node_svg(BigInt(nodeId));
      downloadBlob(new Blob([svg], { type: "image/svg+xml" }), filename);
    } else {
      const svg = editor.engine.export_svg();
      downloadBlob(new Blob([svg], { type: "image/svg+xml" }), filename);
    }
  } else {
    // PNG
    const dataUrl = editor.exportPng(nodeId, preset.scale, 0);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.click();
  }
}

function getNodeName(editor: Editor, nodeId: number | bigint): string {
  try {
    const json = editor.engine.get_node_json(BigInt(nodeId));
    if (!json) return "";
    const node = JSON.parse(json);
    return node.name || "";
  } catch { return ""; }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Build export presets UI section for the properties panel */
export function createExportPresetsSection(
  editor: Editor,
  nodeId: number | bigint | undefined,
  refreshPanel: () => void
): HTMLElement {
  const section = document.createElement("div");
  section.className = "prop-section";

  const titleRow = document.createElement("div");
  titleRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;";

  const title = document.createElement("div");
  title.className = "prop-section-title";
  title.style.marginBottom = "0";
  title.textContent = "Export";
  titleRow.appendChild(title);

  const addBtn = document.createElement("button");
  addBtn.style.cssText = "background:none;border:none;color:#4a90d9;font-size:16px;cursor:pointer;padding:0 4px;line-height:1;";
  addBtn.textContent = "+";
  addBtn.title = "Add export preset";
  addBtn.addEventListener("click", () => {
    showPresetEditor(section, editor, nodeId, null, refreshPanel);
  });
  titleRow.appendChild(addBtn);
  section.appendChild(titleRow);

  const presets = loadPresets();

  // Active exports list (user picks which presets to use)
  const activeKey = `opensketch-active-exports-${nodeId ?? "canvas"}`;
  let activeIds: string[] = [];
  try {
    const raw = localStorage.getItem(activeKey);
    if (raw) activeIds = JSON.parse(raw);
  } catch { /* ignore */ }

  // Preset selector dropdown + add button
  const selectorRow = document.createElement("div");
  selectorRow.style.cssText = "display:flex;gap:4px;margin-bottom:8px;";

  const presetSelect = document.createElement("select");
  presetSelect.style.cssText = "flex:1;background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:4px;padding:3px 6px;font-size:11px;";
  for (const p of presets) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name} (${p.format.toUpperCase()} ${p.scale}x)`;
    presetSelect.appendChild(opt);
  }
  selectorRow.appendChild(presetSelect);

  const addPresetBtn = document.createElement("button");
  addPresetBtn.style.cssText = "background:#333;color:#ccc;border:1px solid #444;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;white-space:nowrap;";
  addPresetBtn.textContent = "Add";
  addPresetBtn.addEventListener("click", () => {
    const selectedId = presetSelect.value;
    if (selectedId && !activeIds.includes(selectedId)) {
      activeIds.push(selectedId);
      localStorage.setItem(activeKey, JSON.stringify(activeIds));
      refreshPanel();
    }
  });
  selectorRow.appendChild(addPresetBtn);
  section.appendChild(selectorRow);

  // Render active export items
  for (const aid of activeIds) {
    const preset = presets.find(p => p.id === aid);
    if (!preset) continue;

    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:6px;padding:4px 6px;background:#1e1e2e;border-radius:4px;margin-bottom:4px;";

    const formatBadge = document.createElement("span");
    formatBadge.style.cssText = `font-size:9px;font-weight:700;padding:1px 4px;border-radius:3px;color:#fff;background:${preset.format === "svg" ? "#9b59b6" : "#3498db"};`;
    formatBadge.textContent = preset.format.toUpperCase();
    row.appendChild(formatBadge);

    const info = document.createElement("span");
    info.style.cssText = "flex:1;font-size:11px;color:#ccc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    info.textContent = `${preset.name}${preset.suffix ? ` (${preset.suffix})` : ""}`;
    row.appendChild(info);

    const scaleSpan = document.createElement("span");
    scaleSpan.style.cssText = "font-size:10px;color:#888;";
    scaleSpan.textContent = `${preset.scale}x`;
    row.appendChild(scaleSpan);

    // Edit button
    const editBtn = document.createElement("button");
    editBtn.style.cssText = "background:none;border:none;color:#888;cursor:pointer;font-size:10px;padding:2px;";
    editBtn.textContent = "✎";
    editBtn.title = "Edit preset";
    editBtn.addEventListener("click", () => {
      showPresetEditor(section, editor, nodeId, preset, refreshPanel);
    });
    row.appendChild(editBtn);

    // Remove from active
    const removeBtn = document.createElement("button");
    removeBtn.style.cssText = "background:none;border:none;color:#888;cursor:pointer;font-size:12px;padding:2px;";
    removeBtn.textContent = "×";
    removeBtn.title = "Remove";
    removeBtn.addEventListener("click", () => {
      activeIds = activeIds.filter(a => a !== aid);
      localStorage.setItem(activeKey, JSON.stringify(activeIds));
      refreshPanel();
    });
    row.appendChild(removeBtn);

    section.appendChild(row);
  }

  // Export All button
  if (activeIds.length > 0) {
    const exportAllBtn = document.createElement("button");
    exportAllBtn.style.cssText = "width:100%;padding:6px;background:#4a90d9;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;margin-top:4px;";
    exportAllBtn.textContent = `Export ${activeIds.length} preset${activeIds.length > 1 ? "s" : ""}`;
    exportAllBtn.addEventListener("click", () => {
      for (const aid of activeIds) {
        const p = presets.find(pp => pp.id === aid);
        if (p) executeExport(editor, nodeId, p);
      }
    });
    section.appendChild(exportAllBtn);
  }

  // Manage presets link
  const manageLink = document.createElement("div");
  manageLink.style.cssText = "text-align:center;margin-top:6px;";
  const manageBtn = document.createElement("button");
  manageBtn.style.cssText = "background:none;border:none;color:#666;font-size:10px;cursor:pointer;text-decoration:underline;";
  manageBtn.textContent = "Manage Presets…";
  manageBtn.addEventListener("click", () => {
    showPresetsManager(editor, refreshPanel);
  });
  manageLink.appendChild(manageBtn);
  section.appendChild(manageLink);

  return section;
}

/** Show inline preset editor (create/edit) */
function showPresetEditor(
  parent: HTMLElement,
  editor: Editor,
  nodeId: number | bigint | undefined,
  preset: ExportPreset | null,
  refresh: () => void
): void {
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;";

  const dialog = document.createElement("div");
  dialog.style.cssText = "background:#1e1e2e;border:1px solid #444;border-radius:12px;padding:20px;width:320px;color:#ccc;font-size:12px;";

  const h3 = document.createElement("h3");
  h3.style.cssText = "margin:0 0 16px 0;font-size:14px;color:#fff;";
  h3.textContent = preset ? "Edit Preset" : "New Export Preset";
  dialog.appendChild(h3);

  const fields: Record<string, HTMLInputElement | HTMLSelectElement> = {};
  const inputStyle = "width:100%;background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:4px;padding:4px 8px;font-size:11px;box-sizing:border-box;";

  function addField(label: string, key: string, type: "text" | "select" | "number", options?: { value: string; label: string }[], defaultVal?: string) {
    const row = document.createElement("div");
    row.style.cssText = "margin-bottom:10px;";
    const lbl = document.createElement("label");
    lbl.style.cssText = "display:block;font-size:10px;color:#888;margin-bottom:3px;";
    lbl.textContent = label;
    row.appendChild(lbl);

    if (type === "select" && options) {
      const sel = document.createElement("select");
      sel.style.cssText = inputStyle;
      for (const o of options) {
        const opt = document.createElement("option");
        opt.value = o.value; opt.textContent = o.label;
        if (o.value === defaultVal) opt.selected = true;
        sel.appendChild(opt);
      }
      row.appendChild(sel);
      fields[key] = sel;
    } else {
      const inp = document.createElement("input");
      inp.type = type;
      inp.style.cssText = inputStyle;
      inp.value = defaultVal || "";
      row.appendChild(inp);
      fields[key] = inp;
    }
    dialog.appendChild(row);
  }

  addField("Name", "name", "text", undefined, preset?.name || "");
  addField("Format", "format", "select", [
    { value: "png", label: "PNG" },
    { value: "svg", label: "SVG" },
  ], preset?.format || "png");
  addField("Scale", "scale", "select", [
    { value: "0.5", label: "0.5x" },
    { value: "1", label: "1x" },
    { value: "1.5", label: "1.5x" },
    { value: "2", label: "2x" },
    { value: "3", label: "3x" },
    { value: "4", label: "4x" },
  ], String(preset?.scale ?? 2));
  addField("Suffix", "suffix", "text", undefined, preset?.suffix || "");

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:16px;";

  const cancelBtn = document.createElement("button");
  cancelBtn.style.cssText = "padding:6px 16px;background:#333;color:#ccc;border:1px solid #444;border-radius:6px;font-size:11px;cursor:pointer;";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => overlay.remove());

  const saveBtn = document.createElement("button");
  saveBtn.style.cssText = "padding:6px 16px;background:#4a90d9;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;";
  saveBtn.textContent = preset ? "Save" : "Create";
  saveBtn.addEventListener("click", () => {
    const presets = loadPresets();
    const newPreset: ExportPreset = {
      id: preset?.id || genId(),
      name: (fields.name as HTMLInputElement).value || "Untitled",
      format: (fields.format as HTMLSelectElement).value as "png" | "svg",
      scale: parseFloat((fields.scale as HTMLSelectElement).value) || 2,
      suffix: (fields.suffix as HTMLInputElement).value || "",
      quality: 1.0,
    };

    if (preset) {
      const idx = presets.findIndex(p => p.id === preset.id);
      if (idx >= 0) presets[idx] = newPreset;
    } else {
      presets.push(newPreset);
    }
    savePresets(presets);
    overlay.remove();
    refresh();
  });

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(saveBtn);
  dialog.appendChild(btnRow);
  overlay.appendChild(dialog);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

/** Full presets manager modal */
function showPresetsManager(editor: Editor, refresh: () => void): void {
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;";

  const dialog = document.createElement("div");
  dialog.style.cssText = "background:#1e1e2e;border:1px solid #444;border-radius:12px;padding:20px;width:400px;max-height:500px;overflow-y:auto;color:#ccc;font-size:12px;";

  const h3 = document.createElement("h3");
  h3.style.cssText = "margin:0 0 16px 0;font-size:14px;color:#fff;";
  h3.textContent = "Export Presets";
  dialog.appendChild(h3);

  function renderList() {
    // Clear existing list
    const existing = dialog.querySelector(".preset-list");
    if (existing) existing.remove();

    const list = document.createElement("div");
    list.className = "preset-list";

    const presets = loadPresets();
    for (const p of presets) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 8px;background:#252535;border-radius:6px;margin-bottom:4px;";

      const badge = document.createElement("span");
      badge.style.cssText = `font-size:9px;font-weight:700;padding:2px 5px;border-radius:3px;color:#fff;background:${p.format === "svg" ? "#9b59b6" : "#3498db"};`;
      badge.textContent = p.format.toUpperCase();
      row.appendChild(badge);

      const info = document.createElement("span");
      info.style.cssText = "flex:1;font-size:11px;color:#ccc;";
      info.textContent = `${p.name} — ${p.scale}x${p.suffix ? ` "${p.suffix}"` : ""}`;
      row.appendChild(info);

      const delBtn = document.createElement("button");
      delBtn.style.cssText = "background:none;border:none;color:#e74c3c;cursor:pointer;font-size:12px;padding:2px 4px;";
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", () => {
        const all = loadPresets().filter(pp => pp.id !== p.id);
        savePresets(all);
        renderList();
      });
      row.appendChild(delBtn);
      list.appendChild(row);
    }
    dialog.appendChild(list);
  }
  renderList();

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:8px;justify-content:space-between;margin-top:16px;";

  const resetBtn = document.createElement("button");
  resetBtn.style.cssText = "padding:6px 12px;background:#333;color:#e74c3c;border:1px solid #444;border-radius:6px;font-size:11px;cursor:pointer;";
  resetBtn.textContent = "Reset to Defaults";
  resetBtn.addEventListener("click", () => {
    if (confirm("Reset all presets to defaults?")) {
      savePresets([...DEFAULT_PRESETS]);
      renderList();
    }
  });

  const closeBtn = document.createElement("button");
  closeBtn.style.cssText = "padding:6px 16px;background:#4a90d9;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;";
  closeBtn.textContent = "Done";
  closeBtn.addEventListener("click", () => { overlay.remove(); refresh(); });

  btnRow.appendChild(resetBtn);
  btnRow.appendChild(closeBtn);
  dialog.appendChild(btnRow);

  overlay.appendChild(dialog);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}
