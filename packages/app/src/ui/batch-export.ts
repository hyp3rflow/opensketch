/**
 * Batch Export — export multiple nodes/pages at once as a ZIP file
 * Supports PNG (multi-scale) and SVG formats, fflate for ZIP compression
 */

import type { Editor } from "../editor";
import { zipSync, strToU8 } from "fflate";
import { loadPresets, type ExportPreset } from "./export-presets";

interface ExportItem {
  id: string;          // unique key
  nodeId?: number;     // undefined = full page
  pageId?: number;
  name: string;
  label: string;       // display label (page name or node name)
  format: "png" | "svg";
  scale: number;
  enabled: boolean;
}

/** Open the batch export dialog */
export function openBatchExport(editor: Editor): void {
  // Gather pages & top-level nodes
  const pages = getPages(editor);
  let selection: number[] = [];
  try {
    selection = Array.from(editor.engine.get_selection()).map(Number);
  } catch { /* ignore */ }

  const items: ExportItem[] = [];
  let idx = 0;

  // Add pages
  for (const page of pages) {
    items.push({
      id: `page-${idx++}`,
      pageId: page.id,
      name: page.name,
      label: `📄 ${page.name}`,
      format: "png",
      scale: 2,
      enabled: false,
    });
  }

  // Add selected nodes (if any)
  for (const nodeId of selection) {
    const nid = Number(nodeId);
    const info = getNodeInfo(editor, nid);
    if (info) {
      items.push({
        id: `node-${idx++}`,
        nodeId: nid,
        name: info.name || `node-${nid}`,
        label: `${kindIcon(info.kind)} ${info.name || `Node ${nid}`}`,
        format: "png",
        scale: 2,
        enabled: true,
      });
    }
  }

  // If no selection, add all root-level nodes
  if (selection.length === 0) {
    try {
      const roots = JSON.parse(editor.engine.get_root_children());
      for (const rid of roots) {
        const nid = Number(rid);
        const info = getNodeInfo(editor, nid);
        if (info) {
          items.push({
            id: `node-${idx++}`,
            nodeId: nid,
            name: info.name || `node-${nid}`,
            label: `${kindIcon(info.kind)} ${info.name || `Node ${nid}`}`,
            format: "png",
            scale: 2,
            enabled: false,
          });
        }
      }
    } catch { /* ignore */ }
  }

  // If nothing at all, just add pages enabled
  if (items.length > 0 && items.every(i => !i.enabled)) {
    // Enable first page by default
    const firstPage = items.find(i => i.pageId != null);
    if (firstPage) firstPage.enabled = true;
  }

  showDialog(editor, items);
}

function getPages(editor: Editor): { id: number; name: string }[] {
  try {
    const raw = editor.engine.get_pages();
    return JSON.parse(raw).map((p: any) => ({ id: Number(p.id), name: p.name }));
  } catch {
    return [{ id: 0, name: "Page 1" }];
  }
}

function getNodeInfo(editor: Editor, nodeId: number): { name: string; kind: string } | null {
  try {
    const json = editor.engine.get_node_json(BigInt(nodeId));
    if (!json) return null;
    const n = JSON.parse(json);
    return { name: n.name, kind: n.kind || "Rect" };
  } catch { return null; }
}

function kindIcon(kind: string): string {
  const map: Record<string, string> = {
    Rect: "⬜", Ellipse: "⚪", Text: "T", Frame: "◻️",
    Group: "📁", Image: "🖼️", Path: "✏️", Star: "⭐",
    Polygon: "🔷", Table: "📊", Section: "§", Connector: "🔗",
  };
  return map[kind] || "◽";
}

function showDialog(editor: Editor, items: ExportItem[]): void {
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:10000;";

  const dialog = document.createElement("div");
  dialog.style.cssText = "background:#1e1e2e;border:1px solid #444;border-radius:14px;padding:24px;width:520px;max-height:80vh;display:flex;flex-direction:column;color:#ccc;font-size:12px;box-shadow:0 20px 60px rgba(0,0,0,0.5);";

  // Header
  const header = document.createElement("div");
  header.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;";
  const title = document.createElement("h2");
  title.style.cssText = "margin:0;font-size:16px;color:#fff;font-weight:600;";
  title.textContent = "Batch Export";
  header.appendChild(title);

  const closeBtn = document.createElement("button");
  closeBtn.style.cssText = "background:none;border:none;color:#888;font-size:18px;cursor:pointer;padding:4px;";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => overlay.remove());
  header.appendChild(closeBtn);
  dialog.appendChild(header);

  // Quick actions row
  const quickRow = document.createElement("div");
  quickRow.style.cssText = "display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;";

  const selectAllBtn = createSmallBtn("Select All");
  selectAllBtn.addEventListener("click", () => { items.forEach(i => i.enabled = true); renderList(); });
  quickRow.appendChild(selectAllBtn);

  const selectNoneBtn = createSmallBtn("Select None");
  selectNoneBtn.addEventListener("click", () => { items.forEach(i => i.enabled = false); renderList(); });
  quickRow.appendChild(selectNoneBtn);

  const formatAllPng = createSmallBtn("All PNG");
  formatAllPng.addEventListener("click", () => { items.forEach(i => i.format = "png"); renderList(); });
  quickRow.appendChild(formatAllPng);

  const formatAllSvg = createSmallBtn("All SVG");
  formatAllSvg.addEventListener("click", () => { items.forEach(i => i.format = "svg"); renderList(); });
  quickRow.appendChild(formatAllSvg);

  // Scale selector for all
  const scaleSelect = document.createElement("select");
  scaleSelect.style.cssText = "background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:4px;padding:3px 6px;font-size:11px;";
  for (const s of [0.5, 1, 1.5, 2, 3, 4]) {
    const opt = document.createElement("option");
    opt.value = String(s);
    opt.textContent = `All ${s}x`;
    if (s === 2) opt.selected = true;
    scaleSelect.appendChild(opt);
  }
  scaleSelect.addEventListener("change", () => {
    const v = parseFloat(scaleSelect.value);
    items.forEach(i => i.scale = v);
    renderList();
  });
  quickRow.appendChild(scaleSelect);

  // Apply preset button
  const presets = loadPresets(editor);
  if (presets.length > 0) {
    const presetSelect = document.createElement("select");
    presetSelect.style.cssText = "background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:4px;padding:3px 6px;font-size:11px;";
    const defOpt = document.createElement("option");
    defOpt.value = "";
    defOpt.textContent = "Apply Preset…";
    presetSelect.appendChild(defOpt);
    for (const p of presets) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.name} (${p.format.toUpperCase()} ${p.scale}x)`;
      presetSelect.appendChild(opt);
    }
    presetSelect.addEventListener("change", () => {
      const preset = presets.find(p => p.id === presetSelect.value);
      if (preset) {
        items.forEach(i => { i.format = preset.format; i.scale = preset.scale; });
        renderList();
      }
      presetSelect.value = "";
    });
    quickRow.appendChild(presetSelect);
  }

  dialog.appendChild(quickRow);

  // Package mode row
  const packageRow = document.createElement("div");
  packageRow.style.cssText = "display:flex;gap:8px;margin-bottom:8px;align-items:center;";

  const packageLabel = document.createElement("span");
  packageLabel.style.cssText = "font-size:11px;color:#aaa;";
  packageLabel.textContent = "Package:";

  const packageSelect = document.createElement("select");
  packageSelect.style.cssText = "background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:4px;padding:3px 6px;font-size:11px;";
  const packageModes: Array<{ value: AssetPackageMode; label: string }> = [
    { value: "flat", label: "Flat ZIP" },
    { value: "ios", label: "iOS .imageset" },
    { value: "android", label: "Android drawable" },
    { value: "web", label: "Web assets" },
  ];
  for (const m of packageModes) {
    const opt = document.createElement("option");
    opt.value = m.value;
    opt.textContent = m.label;
    packageSelect.appendChild(opt);
  }
  let packageMode: AssetPackageMode = "flat";
  packageSelect.addEventListener("change", () => {
    packageMode = packageSelect.value as AssetPackageMode;
    if (packageMode !== "flat") {
      for (const item of items) item.format = "png";
    }
    renderList();
  });

  const packageHint = document.createElement("span");
  packageHint.style.cssText = "font-size:10px;color:#777;";
  packageHint.textContent = "Platform folder naming for PNG slices";

  packageRow.append(packageLabel, packageSelect, packageHint);
  dialog.appendChild(packageRow);

  // Pixel-perfect options row
  const pixelRow = document.createElement("div");
  pixelRow.style.cssText = "display:flex;gap:12px;margin-bottom:12px;align-items:center;";

  const pixelAlignCb = document.createElement("input");
  pixelAlignCb.type = "checkbox";
  pixelAlignCb.id = "pixel-align-cb";
  pixelAlignCb.checked = true;
  pixelAlignCb.style.cssText = "accent-color:#4a90d9;cursor:pointer;";
  const pixelAlignLbl = document.createElement("label");
  pixelAlignLbl.htmlFor = "pixel-align-cb";
  pixelAlignLbl.style.cssText = "font-size:11px;color:#aaa;cursor:pointer;";
  pixelAlignLbl.textContent = "Pixel-align (snap to grid)";
  pixelAlignLbl.title = "Auto-round all node positions/sizes to integer pixels for sharper edges";

  const nearestCb = document.createElement("input");
  nearestCb.type = "checkbox";
  nearestCb.id = "nearest-cb";
  nearestCb.style.cssText = "accent-color:#4a90d9;cursor:pointer;";
  const nearestLbl = document.createElement("label");
  nearestLbl.htmlFor = "nearest-cb";
  nearestLbl.style.cssText = "font-size:11px;color:#aaa;cursor:pointer;";
  nearestLbl.textContent = "Nearest-neighbor scaling";
  nearestLbl.title = "Disable anti-aliasing for crisp pixel art and icon export";

  pixelRow.append(pixelAlignCb, pixelAlignLbl, nearestCb, nearestLbl);
  dialog.appendChild(pixelRow);

  // Items list
  const listContainer = document.createElement("div");
  listContainer.style.cssText = "flex:1;overflow-y:auto;margin-bottom:16px;border:1px solid #333;border-radius:8px;";

  function renderList() {
    listContainer.innerHTML = "";

    // Pages section
    const pageItems = items.filter(i => i.pageId != null);
    const nodeItems = items.filter(i => i.nodeId != null);

    if (pageItems.length > 0) {
      const secTitle = document.createElement("div");
      secTitle.style.cssText = "padding:8px 12px;font-size:10px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;background:#252535;";
      secTitle.textContent = `Pages (${pageItems.length})`;
      listContainer.appendChild(secTitle);
      pageItems.forEach(item => listContainer.appendChild(createItemRow(item)));
    }

    if (nodeItems.length > 0) {
      const secTitle = document.createElement("div");
      secTitle.style.cssText = "padding:8px 12px;font-size:10px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;background:#252535;";
      secTitle.textContent = `Nodes (${nodeItems.length})`;
      listContainer.appendChild(secTitle);
      nodeItems.forEach(item => listContainer.appendChild(createItemRow(item)));
    }

    updateExportBtn();
  }

  function createItemRow(item: ExportItem): HTMLElement {
    const row = document.createElement("div");
    row.style.cssText = `display:flex;align-items:center;gap:8px;padding:6px 12px;border-bottom:1px solid #2a2a2a;opacity:${item.enabled ? "1" : "0.5"};`;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = item.enabled;
    cb.style.cssText = "accent-color:#4a90d9;cursor:pointer;";
    cb.addEventListener("change", () => { item.enabled = cb.checked; row.style.opacity = cb.checked ? "1" : "0.5"; updateExportBtn(); });
    row.appendChild(cb);

    const label = document.createElement("span");
    label.style.cssText = "flex:1;font-size:11px;color:#ddd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    label.textContent = item.label;
    row.appendChild(label);

    const fmt = document.createElement("select");
    fmt.style.cssText = "background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:4px;padding:2px 4px;font-size:10px;width:60px;";
    for (const f of ["png", "svg"]) {
      const opt = document.createElement("option");
      opt.value = f;
      opt.textContent = f.toUpperCase();
      if (f === item.format) opt.selected = true;
      fmt.appendChild(opt);
    }
    fmt.addEventListener("change", () => { item.format = fmt.value as "png" | "svg"; });
    if (packageMode !== "flat") {
      item.format = "png";
      fmt.value = "png";
      fmt.disabled = true;
      fmt.style.opacity = "0.5";
      fmt.title = "Platform package mode supports PNG slices";
    }
    row.appendChild(fmt);

    const scale = document.createElement("select");
    scale.style.cssText = "background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:4px;padding:2px 4px;font-size:10px;width:50px;";
    for (const s of [0.5, 1, 1.5, 2, 3, 4]) {
      const opt = document.createElement("option");
      opt.value = String(s);
      opt.textContent = `${s}x`;
      if (s === item.scale) opt.selected = true;
      scale.appendChild(opt);
    }
    scale.addEventListener("change", () => { item.scale = parseFloat(scale.value); });
    row.appendChild(scale);

    return row;
  }

  dialog.appendChild(listContainer);

  // Footer
  const footer = document.createElement("div");
  footer.style.cssText = "display:flex;align-items:center;justify-content:space-between;";

  const info = document.createElement("span");
  info.className = "batch-export-info";
  info.style.cssText = "font-size:11px;color:#888;";
  footer.appendChild(info);

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:8px;";

  const cancelBtn = document.createElement("button");
  cancelBtn.style.cssText = "padding:8px 20px;background:#333;color:#ccc;border:1px solid #444;border-radius:8px;font-size:12px;cursor:pointer;";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => overlay.remove());
  btnRow.appendChild(cancelBtn);

  const exportBtn = document.createElement("button");
  exportBtn.style.cssText = "padding:8px 24px;background:#4a90d9;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;";
  exportBtn.textContent = "Export ZIP";
  exportBtn.addEventListener("click", async () => {
    exportBtn.disabled = true;
    exportBtn.textContent = "Exporting…";
    exportBtn.style.opacity = "0.6";
    try {
      await doExport(editor, items.filter(i => i.enabled), {
        pixelAlign: pixelAlignCb.checked,
        nearestNeighbor: nearestCb.checked,
      }, packageMode);
    } catch (e) {
      console.error("Batch export error:", e);
      alert("Export failed: " + (e as Error).message);
    }
    overlay.remove();
  });
  btnRow.appendChild(exportBtn);
  footer.appendChild(btnRow);
  dialog.appendChild(footer);

  function updateExportBtn() {
    const count = items.filter(i => i.enabled).length;
    exportBtn.textContent = `Export ZIP (${count})`;
    exportBtn.disabled = count === 0;
    exportBtn.style.opacity = count === 0 ? "0.4" : "1";
    info.textContent = `${count} item${count !== 1 ? "s" : ""} selected`;
  }

  // Render
  renderList();

  overlay.appendChild(dialog);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  // Escape to close
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", onKey); }
  };
  document.addEventListener("keydown", onKey);
}

function createSmallBtn(text: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.style.cssText = "background:#333;color:#ccc;border:1px solid #444;border-radius:4px;padding:3px 8px;font-size:10px;cursor:pointer;white-space:nowrap;";
  btn.textContent = text;
  return btn;
}

interface PixelPerfectOpts {
  pixelAlign?: boolean;
  nearestNeighbor?: boolean;
}

type AssetPackageMode = "flat" | "ios" | "android" | "web";

/** Actually perform the export and download ZIP */
async function doExport(
  editor: Editor,
  items: ExportItem[],
  pixelOpts?: PixelPerfectOpts,
  packageMode: AssetPackageMode = "flat",
): Promise<void> {
  const currentPageId = getCurrentPageId(editor);
  const files: Record<string, Uint8Array> = {};
  const usedNames = new Set<string>();

  for (const item of items) {
    const sanitized = sanitizeFilename(item.name);
    let baseName = sanitized;
    let n = 1;
    while (usedNames.has(`${baseName}.${item.format}`)) {
      baseName = `${sanitized}-${n++}`;
    }

    const filename = buildPackagedFilename(baseName, item, packageMode);
    usedNames.add(`${baseName}.${item.format}`);

    if (item.pageId != null && item.nodeId == null) {
      // Export full page
      editor.engine.set_active_page(BigInt(item.pageId));
      await waitFrame();

      if (item.format === "svg") {
        const svg = editor.engine.export_svg();
        files[filename] = strToU8(svg);
      } else {
        const dataUrl = editor.exportPng(undefined, item.scale, 10, pixelOpts);
        if (dataUrl) files[filename] = dataUrlToUint8(dataUrl);
      }
    } else if (item.nodeId != null) {
      // Export specific node
      if (item.format === "svg") {
        const svg = editor.engine.export_node_svg(BigInt(item.nodeId));
        files[filename] = strToU8(svg);
      } else {
        const dataUrl = editor.exportPng(item.nodeId, item.scale, 0, pixelOpts);
        if (dataUrl) files[filename] = dataUrlToUint8(dataUrl);
      }
    }

    if (packageMode === "ios" && item.format === "png") {
      const imageSetPath = `${sanitizeFilename(baseName)}.imageset/Contents.json`;
      if (!files[imageSetPath]) {
        files[imageSetPath] = strToU8(buildIosContentsJson(baseName, item.scale));
      }
    }
  }

  // Restore original page
  if (currentPageId != null) {
    editor.engine.set_active_page(BigInt(currentPageId));
  }

  // Create ZIP
  const zipped = zipSync(files, { level: 6 });
  const blob = new Blob([zipped], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `opensketch-export-${Date.now()}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function getCurrentPageId(editor: Editor): number | null {
  try {
    const id = editor.engine.get_active_page_id();
    return Number(id);
  } catch { return null; }
}

function waitFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

function dataUrlToUint8(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  if (!base64) return new Uint8Array(0);
  const binary = atob(base64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    arr[i] = binary.charCodeAt(i);
  }
  return arr;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "-").replace(/\s+/g, "_").substring(0, 100) || "export";
}

function scaleToAndroidBucket(scale: number): string {
  if (scale <= 1) return "mdpi";
  if (scale <= 1.5) return "hdpi";
  if (scale <= 2) return "xhdpi";
  if (scale <= 3) return "xxhdpi";
  return "xxxhdpi";
}

function buildPackagedFilename(baseName: string, item: ExportItem, mode: AssetPackageMode): string {
  if (mode === "flat") return `${baseName}.${item.format}`;
  if (item.format === "svg") return `${baseName}.${item.format}`;

  const safeBase = sanitizeFilename(baseName);
  switch (mode) {
    case "ios":
      return `${safeBase}.imageset/${safeBase}@${item.scale}x.png`;
    case "android":
      return `android/drawable-${scaleToAndroidBucket(item.scale)}/${safeBase}.png`;
    case "web":
      return `web/${safeBase}@${item.scale}x.png`;
    default:
      return `${safeBase}.png`;
  }
}

function buildIosContentsJson(baseName: string, scale: number): string {
  const safeBase = sanitizeFilename(baseName);
  const scaleLabel = `${scale}x`;
  return JSON.stringify({
    images: [
      {
        idiom: "universal",
        filename: `${safeBase}@${scaleLabel}.png`,
        scale: scaleLabel,
      },
    ],
    info: { version: 1, author: "xcode" },
  }, null, 2);
}
