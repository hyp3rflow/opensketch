/**
 * Auto-save & Version History for OpenSketch
 * - IndexedDB-based storage (migrated from localStorage)
 * - Auto-saves every 30 seconds with improved labels
 * - Manual save via Cmd+S
 * - Stores up to 20 versioned snapshots
 * - Diff visualization between versions
 * - Version comparison UI
 */

import type { Editor } from "./editor";
import { offlineStore } from "./offline-store";

const IDB_SCENE_KEY = "current_scene";
const IDB_HISTORY_KEY = "history";
const LS_STORAGE_KEY = "opensketch_autosave";
const LS_HISTORY_KEY = "opensketch_history";
const MAX_HISTORY = 20;
const AUTO_SAVE_INTERVAL = 30_000;

interface HistoryEntry {
  timestamp: number;
  label: string;
  data: string;
  nodeCount?: number;
  pageCount?: number;
}

interface PropertyChange {
  property: string;
  old_value: string;
  new_value: string;
}

interface NodeChange {
  node_id: number;
  node_name: string;
  node_kind: string;
  change_type: "Added" | "Removed" | "Modified";
  properties: PropertyChange[];
}

interface SceneDiff {
  added: NodeChange[];
  removed: NodeChange[];
  modified: NodeChange[];
  total_changes: number;
  added_count: number;
  removed_count: number;
  modified_count: number;
}

export class AutoSave {
  private editor: Editor;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastSavedHash = "";
  private onHistoryChange: (() => void)[] = [];

  constructor(editor: Editor) {
    this.editor = editor;
  }

  start() {
    this.intervalId = setInterval(() => this.save("auto"), AUTO_SAVE_INTERVAL);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private async migrateFromLocalStorage(): Promise<boolean> {
    const lsData = localStorage.getItem(LS_STORAGE_KEY);
    if (!lsData) return false;
    await offlineStore.set(IDB_SCENE_KEY, lsData);
    const lsHistory = localStorage.getItem(LS_HISTORY_KEY);
    if (lsHistory) {
      try {
        await offlineStore.set(IDB_HISTORY_KEY, JSON.parse(lsHistory));
      } catch {}
    }
    localStorage.removeItem(LS_STORAGE_KEY);
    localStorage.removeItem(LS_HISTORY_KEY);
    return true;
  }

  async save(label = "manual") {
    const data = this.editor.engine.export_scene();
    if (!data || data === "{}") return;
    const hash = this.simpleHash(data);
    if (hash === this.lastSavedHash) return;
    this.lastSavedHash = hash;

    // Enrich label with context
    let enrichedLabel = label;
    if (label === "auto") {
      enrichedLabel = this.generateAutoLabel();
    }

    await offlineStore.set(IDB_SCENE_KEY, data);
    await this.addHistoryEntry(enrichedLabel, data);
  }

  private generateAutoLabel(): string {
    try {
      const engine = this.editor.engine;
      const sel = JSON.parse(engine.get_selection());
      if (sel.length > 0) {
        const nodeJson = engine.get_node_json(BigInt(sel[0]));
        if (nodeJson && nodeJson !== "null") {
          const node = JSON.parse(nodeJson);
          if (node && node.name) {
            return `Auto · editing "${node.name}"`;
          }
        }
      }
    } catch {}
    return "Auto-save";
  }

  async restore(): Promise<boolean> {
    await this.migrateFromLocalStorage();
    const data = await offlineStore.get<string>(IDB_SCENE_KEY);
    if (data) {
      try {
        const success = this.editor.engine.import_scene(data);
        if (success) {
          this.lastSavedHash = this.simpleHash(data);
          this.editor.requestRender();
          return true;
        }
      } catch {}
    }
    return false;
  }

  async restoreVersion(index: number): Promise<boolean> {
    const history = await this.getHistory();
    const entry = history[index];
    if (!entry) return false;
    try {
      const success = this.editor.engine.import_scene(entry.data);
      if (success) {
        this.lastSavedHash = this.simpleHash(entry.data);
        await offlineStore.set(IDB_SCENE_KEY, entry.data);
        this.editor.requestRender();
        this.editor.notifyLayersChanged();
        this.editor.notifySelectionChanged([]);
        return true;
      }
    } catch {}
    return false;
  }

  async getHistory(): Promise<HistoryEntry[]> {
    try {
      return (await offlineStore.get<HistoryEntry[]>(IDB_HISTORY_KEY)) || [];
    } catch {
      return [];
    }
  }

  async clearHistory() {
    await offlineStore.delete(IDB_HISTORY_KEY);
    this.fireHistoryChange();
  }

  /** Compute diff between two history entries using Rust engine */
  diffVersions(oldData: string, newData: string): SceneDiff {
    try {
      const json = this.editor.engine.diff_scenes(oldData, newData);
      return JSON.parse(json);
    } catch {
      return { added: [], removed: [], modified: [], total_changes: 0, added_count: 0, removed_count: 0, modified_count: 0 };
    }
  }

  onHistoryChanged(fn: () => void) {
    this.onHistoryChange.push(fn);
  }

  private async addHistoryEntry(label: string, data: string) {
    const history = await this.getHistory();

    // Compute metadata
    let nodeCount = 0;
    let pageCount = 1;
    try {
      const engine = this.editor.engine;
      const analysis = JSON.parse(engine.get_scene_analysis());
      nodeCount = analysis.total_nodes || 0;
      pageCount = Number(engine.get_page_count()) || 1;
    } catch {}

    history.unshift({ timestamp: Date.now(), label, data, nodeCount, pageCount });
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    await offlineStore.set(IDB_HISTORY_KEY, history);
    this.fireHistoryChange();
  }

  private fireHistoryChange() {
    this.onHistoryChange.forEach(fn => fn());
  }

  private simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return h.toString(36);
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (isToday) return `Today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

/** Setup version history panel UI with diff visualization */
export function setupHistoryPanel(container: HTMLElement, autoSave: AutoSave) {
  const style = document.createElement("style");
  style.textContent = `
    .history-panel { display: flex; flex-direction: column; height: 100%; }
    .history-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .history-title { font-weight: 600; font-size: 13px; color: #cdd6f4; }
    .history-actions { display: flex; gap: 4px; }
    .history-actions button { background: none; border: none; color: #6c7086; cursor: pointer; padding: 2px 4px; border-radius: 4px; }
    .history-actions button:hover { color: #cdd6f4; background: rgba(255,255,255,0.06); }
    .history-list { overflow-y: auto; flex: 1; padding: 6px 8px; }
    .history-empty { text-align: center; padding: 32px 0; color: #6c7086; font-size: 12px; }
    .history-entry { background: #313244; border-radius: 8px; padding: 8px 10px; margin-bottom: 4px; cursor: default; transition: background 0.15s; }
    .history-entry:hover { background: #3b3d54; }
    .history-entry-top { display: flex; justify-content: space-between; align-items: center; }
    .history-entry-time { font-size: 11px; color: #a6adc8; font-weight: 500; }
    .history-entry-relative { font-size: 10px; color: #585b70; margin-left: 6px; }
    .history-entry-label { font-size: 11px; color: #bac2de; margin-top: 2px; display: block; }
    .history-entry-meta { font-size: 10px; color: #585b70; margin-top: 2px; }
    .history-entry-btns { display: flex; gap: 3px; margin-top: 6px; }
    .history-entry-btns button { border: none; border-radius: 4px; padding: 3px 8px; font-size: 10px; cursor: pointer; font-weight: 600; }
    .btn-restore { background: #89b4fa; color: #1e1e2e; }
    .btn-restore:hover { background: #74c7ec; }
    .btn-diff { background: rgba(166,227,161,0.15); color: #a6e3a1; border: 1px solid rgba(166,227,161,0.2) !important; }
    .btn-diff:hover { background: rgba(166,227,161,0.25); }
    .btn-compare { background: rgba(203,166,247,0.15); color: #cba6f7; border: 1px solid rgba(203,166,247,0.2) !important; }
    .btn-compare:hover { background: rgba(203,166,247,0.25); }
    .diff-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 20000; display: flex; align-items: center; justify-content: center; }
    .diff-modal { background: #1e1e2e; border-radius: 16px; padding: 20px; max-width: 600px; width: 90vw; max-height: 85vh; overflow: auto; color: #cdd6f4; font-family: system-ui; }
    .diff-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .diff-header h3 { margin: 0; font-size: 15px; }
    .diff-close { background: none; border: none; color: #6c7086; cursor: pointer; font-size: 18px; }
    .diff-stats { display: flex; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
    .diff-stat { background: #313244; border-radius: 8px; padding: 8px 14px; text-align: center; flex: 1; min-width: 80px; }
    .diff-stat-num { font-size: 20px; font-weight: 700; }
    .diff-stat-label { font-size: 10px; color: #6c7086; margin-top: 2px; }
    .diff-section { margin-bottom: 12px; }
    .diff-section-title { font-size: 11px; font-weight: 600; color: #a6adc8; margin-bottom: 6px; padding: 4px 8px; border-radius: 4px; }
    .diff-section-added .diff-section-title { background: rgba(166,227,161,0.1); color: #a6e3a1; }
    .diff-section-removed .diff-section-title { background: rgba(243,139,168,0.1); color: #f38ba8; }
    .diff-section-modified .diff-section-title { background: rgba(249,226,175,0.1); color: #f9e2af; }
    .diff-node { background: #313244; border-radius: 6px; padding: 6px 10px; margin-bottom: 3px; font-size: 11px; }
    .diff-node-header { display: flex; justify-content: space-between; align-items: center; }
    .diff-node-name { font-weight: 500; }
    .diff-node-kind { color: #585b70; font-size: 10px; }
    .diff-props { margin-top: 4px; padding-left: 8px; border-left: 2px solid rgba(255,255,255,0.06); }
    .diff-prop { font-size: 10px; color: #a6adc8; padding: 1px 0; }
    .diff-prop-name { color: #89b4fa; }
    .diff-prop-old { color: #f38ba8; text-decoration: line-through; }
    .diff-prop-new { color: #a6e3a1; }
    .compare-select { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; }
    .compare-select select { background: #313244; color: #cdd6f4; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 4px 8px; font-size: 11px; flex: 1; }
    .compare-select .compare-vs { color: #585b70; font-size: 11px; font-weight: 600; }
  `;
  container.appendChild(style);

  container.innerHTML += `
    <div class="history-panel">
      <div class="history-header">
        <span class="history-title">Version History</span>
        <div class="history-actions">
          <button class="history-compare-btn" title="Compare two versions">⇔</button>
          <button class="history-clear-btn" title="Clear history">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </div>
      <div class="history-list"></div>
    </div>
  `;

  const list = container.querySelector(".history-list")!;
  const clearBtn = container.querySelector(".history-clear-btn")!;
  const compareBtn = container.querySelector(".history-compare-btn")!;

  async function render() {
    const history = await autoSave.getHistory();
    if (history.length === 0) {
      list.innerHTML = `<div class="history-empty">No saved versions yet.<br>Changes auto-save every 30s.</div>`;
      return;
    }
    list.innerHTML = history.map((entry, i) => `
      <div class="history-entry" data-index="${i}">
        <div class="history-entry-top">
          <span class="history-entry-time">${formatTime(entry.timestamp)}</span>
          <span class="history-entry-relative">${formatRelative(entry.timestamp)}</span>
        </div>
        <span class="history-entry-label">${escapeHtml(entry.label)}</span>
        ${entry.nodeCount ? `<div class="history-entry-meta">${entry.nodeCount} nodes · ${entry.pageCount || 1} page${(entry.pageCount || 1) > 1 ? 's' : ''}</div>` : ''}
        <div class="history-entry-btns">
          <button class="btn-restore" data-index="${i}" title="Restore this version">↺ Restore</button>
          ${i < history.length - 1 ? `<button class="btn-diff" data-index="${i}" title="Show changes from previous version">Δ Diff</button>` : ''}
        </div>
      </div>
    `).join("");

    list.querySelectorAll<HTMLButtonElement>(".btn-restore").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index!);
        if (confirm("Restore this version? Current changes will be saved first.")) {
          await autoSave.save("before restore");
          await autoSave.restoreVersion(idx);
        }
      });
    });

    list.querySelectorAll<HTMLButtonElement>(".btn-diff").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index!);
        const history = await autoSave.getHistory();
        if (idx + 1 < history.length) {
          const diff = autoSave.diffVersions(history[idx + 1].data, history[idx].data);
          showDiffModal(diff, history[idx], history[idx + 1]);
        }
      });
    });
  }

  clearBtn.addEventListener("click", async () => {
    if (confirm("Clear all version history?")) {
      await autoSave.clearHistory();
    }
  });

  compareBtn.addEventListener("click", async () => {
    showCompareModal(autoSave);
  });

  autoSave.onHistoryChanged(() => render());
  render();

  // --- Diff Modal ---
  function showDiffModal(diff: SceneDiff, newer: HistoryEntry, older: HistoryEntry) {
    const overlay = document.createElement("div");
    overlay.className = "diff-overlay";

    const modal = document.createElement("div");
    modal.className = "diff-modal";

    const noChanges = diff.total_changes === 0;

    modal.innerHTML = `
      <div class="diff-header">
        <h3>Version Diff</h3>
        <button class="diff-close">✕</button>
      </div>
      <div style="font-size:11px;color:#585b70;margin-bottom:10px">
        ${formatTime(older.timestamp)} → ${formatTime(newer.timestamp)}
      </div>
      <div class="diff-stats">
        <div class="diff-stat"><div class="diff-stat-num" style="color:#a6e3a1">+${diff.added_count}</div><div class="diff-stat-label">Added</div></div>
        <div class="diff-stat"><div class="diff-stat-num" style="color:#f38ba8">−${diff.removed_count}</div><div class="diff-stat-label">Removed</div></div>
        <div class="diff-stat"><div class="diff-stat-num" style="color:#f9e2af">~${diff.modified_count}</div><div class="diff-stat-label">Modified</div></div>
      </div>
      ${noChanges ? '<div style="text-align:center;padding:24px;color:#585b70">No structural changes detected</div>' : ''}
      ${diff.added.length > 0 ? `
        <div class="diff-section diff-section-added">
          <div class="diff-section-title">+ Added (${diff.added_count})</div>
          ${diff.added.map(n => `
            <div class="diff-node">
              <div class="diff-node-header">
                <span class="diff-node-name">${escapeHtml(n.node_name || `Node ${n.node_id}`)}</span>
                <span class="diff-node-kind">${escapeHtml(n.node_kind)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${diff.removed.length > 0 ? `
        <div class="diff-section diff-section-removed">
          <div class="diff-section-title">− Removed (${diff.removed_count})</div>
          ${diff.removed.map(n => `
            <div class="diff-node">
              <div class="diff-node-header">
                <span class="diff-node-name">${escapeHtml(n.node_name || `Node ${n.node_id}`)}</span>
                <span class="diff-node-kind">${escapeHtml(n.node_kind)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${diff.modified.length > 0 ? `
        <div class="diff-section diff-section-modified">
          <div class="diff-section-title">~ Modified (${diff.modified_count})</div>
          ${diff.modified.map(n => `
            <div class="diff-node">
              <div class="diff-node-header">
                <span class="diff-node-name">${escapeHtml(n.node_name || `Node ${n.node_id}`)}</span>
                <span class="diff-node-kind">${escapeHtml(n.node_kind)}</span>
              </div>
              ${n.properties.length > 0 ? `
                <div class="diff-props">
                  ${n.properties.map(p => `
                    <div class="diff-prop">
                      <span class="diff-prop-name">${escapeHtml(p.property)}</span>:
                      <span class="diff-prop-old">${escapeHtml(p.old_value)}</span> →
                      <span class="diff-prop-new">${escapeHtml(p.new_value)}</span>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    modal.querySelector(".diff-close")!.addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  }

  // --- Compare Modal ---
  async function showCompareModal(autoSave: AutoSave) {
    const history = await autoSave.getHistory();
    if (history.length < 2) {
      alert("Need at least 2 versions to compare.");
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "diff-overlay";

    const modal = document.createElement("div");
    modal.className = "diff-modal";

    const options = history.map((e, i) => `<option value="${i}">${formatTime(e.timestamp)} — ${escapeHtml(e.label)}</option>`).join('');

    modal.innerHTML = `
      <div class="diff-header">
        <h3>Compare Versions</h3>
        <button class="diff-close">✕</button>
      </div>
      <div class="compare-select">
        <select id="compare-older">${options.replace('value="1"', 'value="1" selected')}</select>
        <span class="compare-vs">→</span>
        <select id="compare-newer">${options}</select>
      </div>
      <button id="compare-go" style="background:#cba6f7;color:#1e1e2e;border:none;border-radius:6px;padding:6px 16px;cursor:pointer;font-size:12px;font-weight:600;margin-bottom:12px">Compare</button>
      <div id="compare-result"></div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    modal.querySelector(".diff-close")!.addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    modal.querySelector("#compare-go")!.addEventListener("click", () => {
      const olderIdx = parseInt((modal.querySelector("#compare-older") as HTMLSelectElement).value);
      const newerIdx = parseInt((modal.querySelector("#compare-newer") as HTMLSelectElement).value);
      if (olderIdx === newerIdx) {
        modal.querySelector("#compare-result")!.innerHTML = '<div style="color:#585b70;text-align:center;padding:16px">Same version selected</div>';
        return;
      }
      const [older, newer] = olderIdx > newerIdx ? [newerIdx, olderIdx] : [olderIdx, newerIdx];
      // newer index = more recent = lower index in array (0 = newest)
      const diff = autoSave.diffVersions(history[olderIdx].data, history[newerIdx].data);
      const resultDiv = modal.querySelector("#compare-result")!;
      resultDiv.innerHTML = renderDiffInline(diff);
    });
  }

  function renderDiffInline(diff: SceneDiff): string {
    if (diff.total_changes === 0) return '<div style="text-align:center;padding:16px;color:#585b70">No changes</div>';

    let html = `<div class="diff-stats" style="margin-top:8px">
      <div class="diff-stat"><div class="diff-stat-num" style="color:#a6e3a1">+${diff.added_count}</div><div class="diff-stat-label">Added</div></div>
      <div class="diff-stat"><div class="diff-stat-num" style="color:#f38ba8">−${diff.removed_count}</div><div class="diff-stat-label">Removed</div></div>
      <div class="diff-stat"><div class="diff-stat-num" style="color:#f9e2af">~${diff.modified_count}</div><div class="diff-stat-label">Modified</div></div>
    </div>`;

    const renderNodes = (nodes: NodeChange[], cls: string, prefix: string) => {
      if (nodes.length === 0) return '';
      return `<div class="diff-section diff-section-${cls}">
        <div class="diff-section-title">${prefix} (${nodes.length})</div>
        ${nodes.slice(0, 20).map(n => `
          <div class="diff-node">
            <span class="diff-node-name">${escapeHtml(n.node_name || `Node ${n.node_id}`)}</span>
            <span class="diff-node-kind">${escapeHtml(n.node_kind)}</span>
            ${n.properties.length > 0 ? `<div class="diff-props">${n.properties.map(p =>
              `<div class="diff-prop"><span class="diff-prop-name">${escapeHtml(p.property)}</span>: <span class="diff-prop-old">${escapeHtml(p.old_value)}</span> → <span class="diff-prop-new">${escapeHtml(p.new_value)}</span></div>`
            ).join('')}</div>` : ''}
          </div>
        `).join('')}
        ${nodes.length > 20 ? `<div style="color:#585b70;font-size:10px;padding:4px 8px">...and ${nodes.length - 20} more</div>` : ''}
      </div>`;
    };

    html += renderNodes(diff.added, 'added', '+ Added');
    html += renderNodes(diff.removed, 'removed', '− Removed');
    html += renderNodes(diff.modified, 'modified', '~ Modified');

    return html;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
