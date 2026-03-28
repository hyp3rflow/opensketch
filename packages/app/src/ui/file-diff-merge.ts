/**
 * File Diff / Merge — Compare two OpenSketch scene files (or current vs imported)
 * Shows node-level diffs with selective merge (cherry-pick individual changes).
 */
import type { Editor } from "../editor";
import { icons } from "./icons";

// ── Types ────────────────────────────────────────────────────────

interface SceneNode {
  id: number;
  name: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  visible?: boolean;
  fill?: string;
  corner_radius?: number;
  children?: number[];
  parent?: number | null;
  text_content?: string;
  font_size?: number;
  [key: string]: any;
}

interface SceneData {
  nodes: Record<string, SceneNode>;
  root_children?: number[];
  pages?: any[];
  [key: string]: any;
}

interface DiffEntry {
  type: "added" | "removed" | "modified";
  nodeId: number;
  name: string;
  kind: string;
  changes?: PropertyChange[];  // only for modified
  node?: SceneNode;            // the node data
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PropertyChange {
  property: string;
  oldValue: any;
  newValue: any;
}

// ── Diff Engine ──────────────────────────────────────────────────

function computeDiff(base: SceneData, incoming: SceneData): DiffEntry[] {
  const entries: DiffEntry[] = [];
  const baseNodes = base.nodes || {};
  const incomingNodes = incoming.nodes || {};

  const baseIds = new Set(Object.keys(baseNodes).map(Number));
  const incomingIds = new Set(Object.keys(incomingNodes).map(Number));

  // Added nodes (in incoming but not in base)
  for (const id of incomingIds) {
    if (!baseIds.has(id)) {
      const n = incomingNodes[id]!;
      entries.push({
        type: "added",
        nodeId: id,
        name: n.name || `Node ${id}`,
        kind: n.kind || "Unknown",
        node: n,
        x: n.x || 0, y: n.y || 0,
        width: n.width || 0, height: n.height || 0,
      });
    }
  }

  // Removed nodes (in base but not in incoming)
  for (const id of baseIds) {
    if (!incomingIds.has(id)) {
      const n = baseNodes[id]!;
      entries.push({
        type: "removed",
        nodeId: id,
        name: n.name || `Node ${id}`,
        kind: n.kind || "Unknown",
        node: n,
        x: n.x || 0, y: n.y || 0,
        width: n.width || 0, height: n.height || 0,
      });
    }
  }

  // Modified nodes
  const COMPARE_KEYS = [
    "name", "kind", "x", "y", "width", "height", "rotation", "opacity",
    "visible", "fill", "corner_radius", "text_content", "font_size",
    "stroke", "locked", "blend_mode",
  ];

  for (const id of baseIds) {
    if (!incomingIds.has(id)) continue;
    const a = baseNodes[id]!;
    const b = incomingNodes[id]!;
    const changes: PropertyChange[] = [];

    for (const key of COMPARE_KEYS) {
      const va = JSON.stringify(a[key] ?? null);
      const vb = JSON.stringify(b[key] ?? null);
      if (va !== vb) {
        changes.push({ property: key, oldValue: a[key], newValue: b[key] });
      }
    }

    // Compare children arrays
    const ca = JSON.stringify(a.children ?? []);
    const cb = JSON.stringify(b.children ?? []);
    if (ca !== cb) {
      changes.push({ property: "children", oldValue: a.children, newValue: b.children });
    }

    if (changes.length > 0) {
      entries.push({
        type: "modified",
        nodeId: id,
        name: b.name || a.name || `Node ${id}`,
        kind: b.kind || a.kind || "Unknown",
        changes,
        node: b,
        x: b.x || 0, y: b.y || 0,
        width: b.width || 0, height: b.height || 0,
      });
    }
  }

  return entries;
}

// ── UI ───────────────────────────────────────────────────────────

let modalEl: HTMLElement | null = null;
let currentDiff: DiffEntry[] = [];
let selectedEntries = new Set<number>(); // indices into currentDiff
let baseData: SceneData | null = null;
let incomingData: SceneData | null = null;

const COLORS = {
  added:    { bg: "rgba(34,197,94,0.12)", border: "#22c55e", text: "#4ade80" },
  removed:  { bg: "rgba(239,68,68,0.12)", border: "#ef4444", text: "#f87171" },
  modified: { bg: "rgba(234,179,8,0.12)", border: "#eab308", text: "#fbbf24" },
};

function formatValue(v: any): string {
  if (v === undefined || v === null) return "—";
  if (typeof v === "number") return String(Math.round(v * 100) / 100);
  if (typeof v === "string") return v.length > 30 ? v.slice(0, 30) + "…" : v;
  if (Array.isArray(v)) return `[${v.length} items]`;
  return JSON.stringify(v).slice(0, 40);
}

function renderDiffList(container: HTMLElement, editor: Editor) {
  container.innerHTML = "";
  if (currentDiff.length === 0) {
    container.innerHTML = `<div style="text-align:center;color:#64748b;padding:24px;">No differences found</div>`;
    return;
  }

  const summary = document.createElement("div");
  const added = currentDiff.filter(d => d.type === "added").length;
  const removed = currentDiff.filter(d => d.type === "removed").length;
  const modified = currentDiff.filter(d => d.type === "modified").length;
  summary.style.cssText = "display:flex;gap:12px;padding:8px 12px;font-size:11px;border-bottom:1px solid #334155;";
  summary.innerHTML = `
    <span style="color:${COLORS.added.text}">+${added} added</span>
    <span style="color:${COLORS.modified.text}">~${modified} modified</span>
    <span style="color:${COLORS.removed.text}">−${removed} removed</span>
    <span style="color:#94a3b8;margin-left:auto;">${selectedEntries.size} selected</span>
  `;
  container.appendChild(summary);

  // Select all / none
  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:8px;padding:4px 12px;";
  const selAll = document.createElement("button");
  selAll.textContent = "Select All";
  selAll.className = "diff-action-btn";
  selAll.onclick = () => { currentDiff.forEach((_, i) => selectedEntries.add(i)); renderDiffList(container, editor); };
  const selNone = document.createElement("button");
  selNone.textContent = "Select None";
  selNone.className = "diff-action-btn";
  selNone.onclick = () => { selectedEntries.clear(); renderDiffList(container, editor); };
  const selAdded = document.createElement("button");
  selAdded.textContent = "Select Added";
  selAdded.className = "diff-action-btn";
  selAdded.onclick = () => {
    selectedEntries.clear();
    currentDiff.forEach((d, i) => { if (d.type === "added") selectedEntries.add(i); });
    renderDiffList(container, editor);
  };
  actions.append(selAll, selNone, selAdded);
  container.appendChild(actions);

  // Diff entries
  currentDiff.forEach((entry, idx) => {
    const colors = COLORS[entry.type];
    const row = document.createElement("div");
    row.style.cssText = `
      display:flex;align-items:flex-start;gap:8px;padding:8px 12px;
      border-bottom:1px solid #1e293b;cursor:pointer;
      background:${selectedEntries.has(idx) ? colors.bg : "transparent"};
      transition:background 0.15s;
    `;
    row.addEventListener("mouseenter", () => { if (!selectedEntries.has(idx)) row.style.background = "rgba(255,255,255,0.03)"; });
    row.addEventListener("mouseleave", () => { row.style.background = selectedEntries.has(idx) ? colors.bg : "transparent"; });

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = selectedEntries.has(idx);
    cb.style.cssText = "margin-top:2px;accent-color:" + colors.border;
    cb.addEventListener("change", () => {
      if (cb.checked) selectedEntries.add(idx); else selectedEntries.delete(idx);
      row.style.background = cb.checked ? colors.bg : "transparent";
      // Update count
      const countEl = container.querySelector("span:last-child") as HTMLElement;
      if (countEl) countEl.textContent = `${selectedEntries.size} selected`;
    });

    const prefix = entry.type === "added" ? "+" : entry.type === "removed" ? "−" : "~";
    const info = document.createElement("div");
    info.style.cssText = "flex:1;min-width:0;";
    info.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="color:${colors.text};font-weight:600;font-size:12px;">${prefix}</span>
        <span style="color:#e2e8f0;font-size:12px;font-weight:500;">${entry.name}</span>
        <span style="color:#64748b;font-size:10px;">${entry.kind}</span>
        <span style="color:#475569;font-size:10px;margin-left:auto;">#${entry.nodeId}</span>
      </div>
    `;

    if (entry.type === "modified" && entry.changes) {
      const changesDiv = document.createElement("div");
      changesDiv.style.cssText = "margin-top:4px;padding-left:18px;font-size:10px;color:#94a3b8;";
      entry.changes.slice(0, 5).forEach(c => {
        const line = document.createElement("div");
        line.style.cssText = "display:flex;gap:4px;padding:1px 0;";
        line.innerHTML = `
          <span style="color:#64748b;min-width:60px;">${c.property}:</span>
          <span style="color:#f87171;text-decoration:line-through;">${formatValue(c.oldValue)}</span>
          <span style="color:#475569;">→</span>
          <span style="color:#4ade80;">${formatValue(c.newValue)}</span>
        `;
        changesDiv.appendChild(line);
      });
      if (entry.changes.length > 5) {
        const more = document.createElement("div");
        more.style.color = "#475569";
        more.textContent = `+${entry.changes.length - 5} more changes`;
        changesDiv.appendChild(more);
      }
      info.appendChild(changesDiv);
    }

    row.append(cb, info);
    row.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      // Pan to node position on canvas
      const cx = entry.x + entry.width / 2;
      const cy = entry.y + entry.height / 2;
      (editor as any).panX = (editor as any).canvas.width / 2 / ((editor as any).dpr || 1) - cx * (editor as any).zoom;
      (editor as any).panY = (editor as any).canvas.height / 2 / ((editor as any).dpr || 1) - cy * (editor as any).zoom;
      (editor as any).needsRender = true;
    });

    container.appendChild(row);
  });
}

function applySelectedMerges(editor: Editor): number {
  if (!incomingData) return 0;
  let applied = 0;

  editor.engine.push_undo();

  for (const idx of selectedEntries) {
    const entry = currentDiff[idx];
    if (!entry) continue;

    try {
      if (entry.type === "added" && entry.node) {
        // Create the node
        const n = entry.node;
        const kind = (n.kind || "Rect").toLowerCase();
        let id: bigint | undefined;

        if (kind === "rect" || kind === "rectangle") {
          id = editor.engine.add_rect(n.x, n.y, n.width, n.height);
        } else if (kind === "ellipse") {
          id = editor.engine.add_ellipse(n.x, n.y, n.width, n.height);
        } else if (kind === "text") {
          id = editor.engine.add_text(n.x, n.y, n.text_content || "Text", n.font_size || 16);
        } else if (kind === "frame") {
          id = editor.engine.add_frame(n.x, n.y, n.width, n.height);
        } else {
          // Fallback: create as rect
          id = editor.engine.add_rect(n.x, n.y, n.width, n.height);
        }

        if (id !== undefined) {
          if (n.name) editor.engine.set_name(id, n.name);
          if (n.fill) editor.engine.set_fill(id, n.fill);
          if (n.opacity != null) editor.engine.set_opacity(id, n.opacity);
          if (n.rotation) editor.engine.set_rotation(id, n.rotation);
          if (n.corner_radius) editor.engine.set_corner_radius(id, n.corner_radius);
          applied++;
        }
      } else if (entry.type === "removed") {
        // Delete the node from current scene
        try {
          editor.engine.delete_node(BigInt(entry.nodeId));
          applied++;
        } catch { /* node might not exist */ }
      } else if (entry.type === "modified" && entry.changes) {
        const nid = BigInt(entry.nodeId);
        for (const c of entry.changes) {
          try {
            switch (c.property) {
              case "name": editor.engine.set_name(nid, c.newValue); break;
              case "x": editor.engine.set_x(nid, c.newValue); break;
              case "y": editor.engine.set_y(nid, c.newValue); break;
              case "width": editor.engine.set_width(nid, c.newValue); break;
              case "height": editor.engine.set_height(nid, c.newValue); break;
              case "rotation": editor.engine.set_rotation(nid, c.newValue); break;
              case "opacity": editor.engine.set_opacity(nid, c.newValue); break;
              case "fill": if (c.newValue) editor.engine.set_fill(nid, c.newValue); break;
              case "corner_radius": editor.engine.set_corner_radius(nid, c.newValue); break;
              case "visible": editor.engine.set_visible(nid, c.newValue); break;
              case "locked": editor.engine.set_locked(nid, c.newValue); break;
            }
          } catch { /* property might not be settable */ }
        }
        applied++;
      }
    } catch { /* skip failed entries */ }
  }

  editor.requestRender();
  return applied;
}

async function loadFileAsScene(): Promise<SceneData | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.opensketch";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string) as SceneData;
          resolve(data);
        } catch {
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    });
    input.click();
  });
}

export function openFileDiffMerge(editor: Editor) {
  if (modalEl) { modalEl.remove(); modalEl = null; }

  currentDiff = [];
  selectedEntries.clear();
  baseData = null;
  incomingData = null;

  modalEl = document.createElement("div");
  modalEl.className = "file-diff-modal";
  modalEl.innerHTML = `
    <div class="file-diff-panel">
      <div class="file-diff-header">
        <span style="font-weight:600;font-size:13px;color:#e2e8f0;">${icons.gitBranch || "⬡"} File Diff & Merge</span>
        <button class="file-diff-close" title="Close">✕</button>
      </div>
      <div class="file-diff-source-section">
        <div style="display:flex;gap:8px;align-items:center;padding:12px;">
          <span style="font-size:11px;color:#94a3b8;width:60px;">Base:</span>
          <button class="file-diff-load-btn" data-target="base">Current Scene</button>
          <button class="file-diff-load-btn file-diff-load-file" data-target="base-file">Load File…</button>
        </div>
        <div style="display:flex;gap:8px;align-items:center;padding:0 12px 12px;">
          <span style="font-size:11px;color:#94a3b8;width:60px;">Incoming:</span>
          <button class="file-diff-load-btn file-diff-load-file" data-target="incoming-file">Load File…</button>
        </div>
        <div style="padding:0 12px 8px;">
          <button class="file-diff-compare-btn" disabled>Compare</button>
        </div>
      </div>
      <div class="file-diff-list"></div>
      <div class="file-diff-footer">
        <button class="file-diff-merge-btn" disabled>Merge Selected (0)</button>
      </div>
    </div>
  `;

  // Styles
  const style = document.createElement("style");
  style.textContent = `
    .file-diff-modal {
      position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
      background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);
    }
    .file-diff-panel {
      width:520px;max-height:80vh;background:#0f172a;border:1px solid #334155;border-radius:12px;
      display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.5);
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    }
    .file-diff-header {
      display:flex;align-items:center;justify-content:space-between;padding:12px 16px;
      border-bottom:1px solid #1e293b;
    }
    .file-diff-close {
      background:none;border:none;color:#64748b;cursor:pointer;font-size:14px;padding:4px 8px;
      border-radius:4px;
    }
    .file-diff-close:hover { background:#1e293b;color:#e2e8f0; }
    .file-diff-load-btn {
      background:#1e293b;border:1px solid #334155;color:#e2e8f0;padding:6px 12px;border-radius:6px;
      font-size:11px;cursor:pointer;transition:all 0.15s;
    }
    .file-diff-load-btn:hover { background:#334155; }
    .file-diff-load-btn.active { border-color:#3b82f6;background:rgba(59,130,246,0.15); }
    .file-diff-compare-btn, .file-diff-merge-btn {
      width:100%;padding:8px;border:none;border-radius:6px;font-size:12px;font-weight:600;
      cursor:pointer;transition:all 0.15s;
    }
    .file-diff-compare-btn {
      background:#3b82f6;color:white;
    }
    .file-diff-compare-btn:disabled { opacity:0.4;cursor:not-allowed; }
    .file-diff-compare-btn:not(:disabled):hover { background:#2563eb; }
    .file-diff-merge-btn {
      background:#22c55e;color:white;
    }
    .file-diff-merge-btn:disabled { opacity:0.4;cursor:not-allowed; }
    .file-diff-merge-btn:not(:disabled):hover { background:#16a34a; }
    .file-diff-list {
      flex:1;overflow-y:auto;min-height:100px;max-height:400px;
    }
    .file-diff-footer {
      padding:12px;border-top:1px solid #1e293b;
    }
    .file-diff-source-section {
      border-bottom:1px solid #1e293b;
    }
    .diff-action-btn {
      background:none;border:1px solid #334155;color:#94a3b8;padding:2px 8px;border-radius:4px;
      font-size:10px;cursor:pointer;
    }
    .diff-action-btn:hover { background:#1e293b;color:#e2e8f0; }
  `;
  document.head.appendChild(style);

  const panel = modalEl.querySelector(".file-diff-panel")!;
  const listEl = modalEl.querySelector(".file-diff-list") as HTMLElement;
  const compareBtn = modalEl.querySelector(".file-diff-compare-btn") as HTMLButtonElement;
  const mergeBtn = modalEl.querySelector(".file-diff-merge-btn") as HTMLButtonElement;
  const baseBtns = modalEl.querySelectorAll(".file-diff-load-btn");

  let baseLabel = "";
  let incomingLabel = "";

  function updateCompareState() {
    compareBtn.disabled = !(baseData && incomingData);
  }

  // Base: Current Scene
  baseBtns[0]!.addEventListener("click", () => {
    try {
      const json = editor.engine.export_scene();
      baseData = JSON.parse(json);
      (baseBtns[0] as HTMLElement).classList.add("active");
      (baseBtns[1] as HTMLElement).classList.remove("active");
      baseLabel = "Current Scene";
      updateCompareState();
    } catch { /* */ }
  });

  // Base: Load File
  baseBtns[1]!.addEventListener("click", async () => {
    const data = await loadFileAsScene();
    if (data) {
      baseData = data;
      (baseBtns[1] as HTMLElement).classList.add("active");
      (baseBtns[0] as HTMLElement).classList.remove("active");
      baseLabel = "File";
      updateCompareState();
    }
  });

  // Incoming: Load File
  baseBtns[2]!.addEventListener("click", async () => {
    const data = await loadFileAsScene();
    if (data) {
      incomingData = data;
      (baseBtns[2] as HTMLElement).classList.add("active");
      incomingLabel = "File";
      updateCompareState();
    }
  });

  // Compare
  compareBtn.addEventListener("click", () => {
    if (!baseData || !incomingData) return;
    currentDiff = computeDiff(baseData, incomingData);
    selectedEntries.clear();
    renderDiffList(listEl, editor);
    mergeBtn.disabled = false;
    mergeBtn.textContent = `Merge Selected (0)`;

    // Watch for selection changes via MutationObserver on checkboxes
    listEl.addEventListener("change", () => {
      mergeBtn.textContent = `Merge Selected (${selectedEntries.size})`;
      mergeBtn.disabled = selectedEntries.size === 0;
    });
  });

  // Merge
  mergeBtn.addEventListener("click", () => {
    if (selectedEntries.size === 0) return;
    const count = applySelectedMerges(editor);
    mergeBtn.textContent = `✓ Merged ${count} changes`;
    mergeBtn.disabled = true;
    setTimeout(() => closeFileDiffMerge(), 1500);
  });

  // Close
  modalEl.querySelector(".file-diff-close")!.addEventListener("click", closeFileDiffMerge);
  modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) closeFileDiffMerge();
  });

  // Auto-select current scene as base
  try {
    const json = editor.engine.export_scene();
    baseData = JSON.parse(json);
    (baseBtns[0] as HTMLElement).classList.add("active");
    baseLabel = "Current Scene";
    updateCompareState();
  } catch { /* */ }

  document.body.appendChild(modalEl);
}

export function closeFileDiffMerge() {
  if (modalEl) {
    modalEl.remove();
    modalEl = null;
  }
  currentDiff = [];
  selectedEntries.clear();
  baseData = null;
  incomingData = null;
}

export function isFileDiffMergeOpen(): boolean {
  return !!modalEl;
}
