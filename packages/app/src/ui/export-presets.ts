/**
 * Export Preset Profiles — save/load named export configurations
 * Supports PNG, SVG, PDF-like (SVG wrapper) formats with scale, suffix, quality options.
 */

import type { Editor } from "../editor";
import { exportPDF } from "./pdf-export";

export interface ExportPreset {
  id: string;
  name: string;
  format: "png" | "svg" | "pdf";
  scale: number;        // 0.5, 1, 1.5, 2, 3, 4
  suffix: string;       // e.g. "@2x", "-thumb"
  quality: number;      // 0.1 - 1.0 (PNG compression hint, mostly for future JPEG)
}

const STORAGE_KEY = "opensketch-export-presets";
const DOC_STORAGE_KEY = "opensketch-export-presets-by-doc";
const ACTIVE_EXPORTS_PREFIX = "opensketch-active-exports";

const DEFAULT_PRESETS: ExportPreset[] = [
  { id: "ios-1x", name: "iOS @1x", format: "png", scale: 1, suffix: "", quality: 1.0 },
  { id: "ios-2x", name: "iOS @2x", format: "png", scale: 2, suffix: "@2x", quality: 1.0 },
  { id: "ios-3x", name: "iOS @3x", format: "png", scale: 3, suffix: "@3x", quality: 1.0 },
  { id: "android-mdpi", name: "Android mdpi", format: "png", scale: 1, suffix: "-mdpi", quality: 1.0 },
  { id: "android-xxhdpi", name: "Android xxhdpi", format: "png", scale: 3, suffix: "-xxhdpi", quality: 1.0 },
  { id: "web-2x", name: "Web @2x", format: "png", scale: 2, suffix: "@2x", quality: 0.9 },
  { id: "svg-vector", name: "SVG Vector", format: "svg", scale: 1, suffix: "", quality: 1.0 },
  { id: "pdf-current-page", name: "PDF Current Page", format: "pdf", scale: 1, suffix: "", quality: 1.0 },
];

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function getDocumentKey(editor?: Editor): string {
  if (!editor) return "global";
  try {
    const scene = editor.engine.export_scene?.() || "";
    if (!scene) return "global";
    return `doc-${hashString(scene).slice(0, 8)}`;
  } catch {
    return "global";
  }
}

function safePresetList(value: unknown): ExportPreset[] {
  if (!Array.isArray(value)) return [];
  return value.filter((p) => p && typeof p.id === "string" && typeof p.name === "string") as ExportPreset[];
}

function loadDocumentPresetMap(): Record<string, ExportPreset[]> {
  try {
    const raw = localStorage.getItem(DOC_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, ExportPreset[]> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      out[k] = safePresetList(v);
    }
    return out;
  } catch {
    return {};
  }
}

function saveDocumentPresetMap(map: Record<string, ExportPreset[]>): void {
  localStorage.setItem(DOC_STORAGE_KEY, JSON.stringify(map));
}

function loadGlobalPresets(): ExportPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_PRESETS];
    const parsed = JSON.parse(raw);
    const presets = safePresetList(parsed);
    return presets.length > 0 ? presets : [...DEFAULT_PRESETS];
  } catch {
    return [...DEFAULT_PRESETS];
  }
}

function saveGlobalPresets(presets: ExportPreset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets.length > 0 ? presets : [...DEFAULT_PRESETS]));
}

export function loadPresets(editor?: Editor): ExportPreset[] {
  try {
    if (editor) {
      const docKey = getDocumentKey(editor);
      if (docKey !== "global") {
        const docMap = loadDocumentPresetMap();
        const docPresets = docMap[docKey];
        if (docPresets && docPresets.length > 0) return docPresets;
      }
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const presets = safePresetList(parsed);
      if (presets.length > 0) return presets;
    }
  } catch { /* ignore */ }
  return [...DEFAULT_PRESETS];
}

export function savePresets(presets: ExportPreset[], editor?: Editor): void {
  const safe = presets.length > 0 ? presets : [...DEFAULT_PRESETS];
  if (editor) {
    const docKey = getDocumentKey(editor);
    if (docKey !== "global") {
      const docMap = loadDocumentPresetMap();
      docMap[docKey] = safe;
      saveDocumentPresetMap(docMap);
    }
  }
  saveGlobalPresets(safe);
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
    return;
  }

  if (preset.format === "pdf") {
    void exportAsPdf(editor, nodeId, `${name}${preset.suffix}.pdf`);
    return;
  }

  // PNG
  const dataUrl = editor.exportPng(nodeId, preset.scale, 0);
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

function getNodeName(editor: Editor, nodeId: number | bigint): string {
  try {
    const json = editor.engine.get_node_json(BigInt(nodeId));
    if (!json) return "";
    const node = JSON.parse(json);
    return node.name || "";
  } catch { return ""; }
}

async function exportAsPdf(editor: Editor, nodeId: number | bigint | undefined, filename: string): Promise<void> {
  // Canvas export: use existing page-based PDF exporter.
  if (nodeId == null) {
    await exportPDF(editor, { filename, includeAllPages: false, jpegQuality: 0.92 });
    return;
  }

  // Node export: convert node PNG snapshot to a single-page PDF.
  const dataUrl = editor.exportPng(nodeId, 2, 0);
  const pdfBytes = await pngDataUrlToSinglePagePdf(dataUrl);
  downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), filename);
}

async function pngDataUrlToSinglePagePdf(dataUrl: string): Promise<Uint8Array> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Failed to decode PNG for PDF export"));
    i.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth || img.width));
  canvas.height = Math.max(1, Math.round(img.naturalHeight || img.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable for PDF export");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const jpegBytes = base64ToBytes(jpegDataUrl.split(",")[1] || "");
  return buildSingleImagePdf(jpegBytes, canvas.width, canvas.height);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function buildSingleImagePdf(jpegBytes: Uint8Array, widthPx: number, heightPx: number): Uint8Array {
  // 96dpi px -> points
  const widthPt = (widthPx * 72) / 96;
  const heightPt = (heightPx * 72) / 96;

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let size = 0;
  const enc = new TextEncoder();

  const pushStr = (s: string) => {
    const b = enc.encode(s);
    chunks.push(b);
    size += b.length;
  };
  const pushBytes = (b: Uint8Array) => {
    chunks.push(b);
    size += b.length;
  };

  const objStart = () => offsets.push(size);

  pushStr("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  objStart();
  pushStr("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  objStart();
  pushStr("2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n");

  objStart();
  pushStr(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt.toFixed(2)} ${heightPt.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);

  objStart();
  pushStr(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
  pushBytes(jpegBytes);
  pushStr("\nendstream\nendobj\n");

  const content = `q\n${widthPt.toFixed(2)} 0 0 ${heightPt.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;
  const contentBytes = enc.encode(content);
  objStart();
  pushStr(`5 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
  pushBytes(contentBytes);
  pushStr("endstream\nendobj\n");

  const xrefOffset = size;
  pushStr("xref\n0 6\n0000000000 65535 f \n");
  for (let i = 1; i <= 5; i++) {
    pushStr(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  pushStr(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const out = new Uint8Array(size);
  let cursor = 0;
  for (const c of chunks) {
    out.set(c, cursor);
    cursor += c.length;
  }
  return out;
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

  const presets = loadPresets(editor);

  // Active exports list (user picks which presets to use)
  const docKey = getDocumentKey(editor);
  const activeKey = `${ACTIVE_EXPORTS_PREFIX}-${docKey}-${nodeId ?? "canvas"}`;
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
    formatBadge.style.cssText = `font-size:9px;font-weight:700;padding:1px 4px;border-radius:3px;color:#fff;background:${preset.format === "svg" ? "#9b59b6" : preset.format === "pdf" ? "#f39c12" : "#3498db"};`;
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
    { value: "pdf", label: "PDF" },
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
    const presets = loadPresets(editor);
    const newPreset: ExportPreset = {
      id: preset?.id || genId(),
      name: (fields.name as HTMLInputElement).value || "Untitled",
      format: (fields.format as HTMLSelectElement).value as "png" | "svg" | "pdf",
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
    savePresets(presets, editor);
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
  dialog.style.cssText = "background:#1e1e2e;border:1px solid #444;border-radius:12px;padding:20px;width:420px;max-height:500px;overflow-y:auto;color:#ccc;font-size:12px;";

  const h3 = document.createElement("h3");
  h3.style.cssText = "margin:0 0 12px 0;font-size:14px;color:#fff;";
  h3.textContent = "Export Presets";
  dialog.appendChild(h3);

  const docKey = getDocumentKey(editor);
  let scope: "document" | "global" = "document";

  const scopeRow = document.createElement("div");
  scopeRow.style.cssText = "display:flex;gap:8px;align-items:center;margin-bottom:10px;";
  const scopeLabel = document.createElement("span");
  scopeLabel.style.cssText = "font-size:11px;color:#8f98b0;";
  scopeLabel.textContent = "Scope:";
  const scopeSelect = document.createElement("select");
  scopeSelect.style.cssText = "background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:4px;padding:3px 6px;font-size:11px;";
  scopeSelect.innerHTML = `
    <option value="document">Document presets</option>
    <option value="global">Global presets</option>
  `;
  const scopeHint = document.createElement("span");
  scopeHint.style.cssText = "font-size:10px;color:#6f7485;";
  scopeRow.append(scopeLabel, scopeSelect, scopeHint);
  dialog.appendChild(scopeRow);

  const getScopedPresets = (): ExportPreset[] => {
    if (scope === "global") return loadGlobalPresets();
    const map = loadDocumentPresetMap();
    const list = map[docKey];
    if (list && list.length > 0) return list;
    return loadGlobalPresets();
  };

  const saveScopedPresets = (presets: ExportPreset[]): void => {
    if (scope === "global") {
      saveGlobalPresets(presets);
      return;
    }
    const map = loadDocumentPresetMap();
    map[docKey] = presets.length > 0 ? presets : [...DEFAULT_PRESETS];
    saveDocumentPresetMap(map);
    saveGlobalPresets(map[docKey]);
  };

  function renderScopeHint() {
    scopeHint.textContent = scope === "document" ? `Current doc key: ${docKey}` : "Shared across documents";
  }

  function renderList() {
    const existing = dialog.querySelector(".preset-list");
    if (existing) existing.remove();

    const list = document.createElement("div");
    list.className = "preset-list";

    const presets = getScopedPresets();
    for (const p of presets) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 8px;background:#252535;border-radius:6px;margin-bottom:4px;";

      const badge = document.createElement("span");
      badge.style.cssText = `font-size:9px;font-weight:700;padding:2px 5px;border-radius:3px;color:#fff;background:${p.format === "svg" ? "#9b59b6" : p.format === "pdf" ? "#f39c12" : "#3498db"};`;
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
        const all = getScopedPresets().filter(pp => pp.id !== p.id);
        saveScopedPresets(all);
        renderList();
      });
      row.appendChild(delBtn);
      list.appendChild(row);
    }
    dialog.appendChild(list);
  }

  scopeSelect.addEventListener("change", () => {
    scope = scopeSelect.value === "global" ? "global" : "document";
    renderScopeHint();
    renderList();
  });

  renderScopeHint();
  renderList();

  const utilRow = document.createElement("div");
  utilRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;";

  const syncDocBtn = document.createElement("button");
  syncDocBtn.style.cssText = "padding:5px 10px;background:#2d3b4f;color:#9ecbff;border:1px solid #3d4f66;border-radius:6px;font-size:11px;cursor:pointer;";
  syncDocBtn.textContent = "Sync Global → Doc";
  syncDocBtn.title = "Copy global presets into the current document preset set";
  syncDocBtn.addEventListener("click", () => {
    const map = loadDocumentPresetMap();
    map[docKey] = loadGlobalPresets();
    saveDocumentPresetMap(map);
    scope = "document";
    scopeSelect.value = "document";
    renderScopeHint();
    renderList();
    refresh();
  });
  utilRow.appendChild(syncDocBtn);

  const exportBtn = document.createElement("button");
  exportBtn.style.cssText = "padding:5px 10px;background:#333;color:#ccc;border:1px solid #444;border-radius:6px;font-size:11px;cursor:pointer;";
  exportBtn.textContent = "Export JSON";
  exportBtn.addEventListener("click", () => {
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      scope,
      presets: getScopedPresets(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    downloadBlob(blob, `opensketch-export-presets-${scope}.json`);
  });
  utilRow.appendChild(exportBtn);

  const importBtn = document.createElement("button");
  importBtn.style.cssText = "padding:5px 10px;background:#333;color:#ccc;border:1px solid #444;border-radius:6px;font-size:11px;cursor:pointer;";
  importBtn.textContent = "Import JSON";
  importBtn.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const imported = safePresetList((data?.presets ?? data) as unknown);
        if (imported.length === 0) {
          alert("No valid presets found in JSON.");
          return;
        }

        const merge = confirm("Import mode: OK = Merge, Cancel = Replace");
        if (merge) {
          const existing = getScopedPresets();
          const dedupe = new Map<string, ExportPreset>();
          for (const p of existing) dedupe.set(`${p.name.toLowerCase()}|${p.format}|${p.scale}|${p.suffix}`, p);
          for (const p of imported) {
            const key = `${p.name.toLowerCase()}|${p.format}|${p.scale}|${p.suffix}`;
            dedupe.set(key, { ...p, id: p.id || genId() });
          }
          saveScopedPresets(Array.from(dedupe.values()));
        } else {
          saveScopedPresets(imported.map(p => ({ ...p, id: p.id || genId() })));
        }

        renderList();
        refresh();
      } catch {
        alert("Failed to import presets JSON.");
      }
    };
    input.click();
  });
  utilRow.appendChild(importBtn);

  dialog.appendChild(utilRow);

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:8px;justify-content:space-between;margin-top:16px;";

  const resetBtn = document.createElement("button");
  resetBtn.style.cssText = "padding:6px 12px;background:#333;color:#e74c3c;border:1px solid #444;border-radius:6px;font-size:11px;cursor:pointer;";
  resetBtn.textContent = "Reset to Defaults";
  resetBtn.addEventListener("click", () => {
    if (confirm(`Reset ${scope} presets to defaults?`)) {
      saveScopedPresets([...DEFAULT_PRESETS]);
      renderList();
      refresh();
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
