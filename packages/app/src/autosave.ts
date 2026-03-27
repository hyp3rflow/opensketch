/**
 * Auto-save & Version History for OpenSketch
 * - IndexedDB-based storage (migrated from localStorage)
 * - Auto-saves every 30 seconds
 * - Manual save via Cmd+S
 * - Stores up to 20 versioned snapshots
 * - Restore UI in history panel
 */

import type { Editor } from "./editor";
import { offlineStore } from "./offline-store";

const IDB_SCENE_KEY = "current_scene";
const IDB_HISTORY_KEY = "history";
const LS_STORAGE_KEY = "opensketch_autosave"; // legacy localStorage key
const LS_HISTORY_KEY = "opensketch_history";   // legacy localStorage key
const MAX_HISTORY = 20;
const AUTO_SAVE_INTERVAL = 30_000; // 30 seconds

interface HistoryEntry {
  timestamp: number;
  label: string;
  data: string;
}

export class AutoSave {
  private editor: Editor;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastSavedHash = "";
  private onHistoryChange: (() => void)[] = [];

  constructor(editor: Editor) {
    this.editor = editor;
  }

  /** Start auto-save timer and restore last session */
  start() {
    this.intervalId = setInterval(() => this.save("auto"), AUTO_SAVE_INTERVAL);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  /** Migrate from localStorage to IndexedDB (one-time) */
  private async migrateFromLocalStorage(): Promise<boolean> {
    const lsData = localStorage.getItem(LS_STORAGE_KEY);
    if (!lsData) return false;

    // Migrate scene
    await offlineStore.set(IDB_SCENE_KEY, lsData);

    // Migrate history
    const lsHistory = localStorage.getItem(LS_HISTORY_KEY);
    if (lsHistory) {
      try {
        const parsed = JSON.parse(lsHistory);
        await offlineStore.set(IDB_HISTORY_KEY, parsed);
      } catch { /* ignore corrupt history */ }
    }

    // Remove old keys
    localStorage.removeItem(LS_STORAGE_KEY);
    localStorage.removeItem(LS_HISTORY_KEY);
    return true;
  }

  /** Save current scene (async) */
  async save(label = "manual") {
    const data = this.editor.engine.export_scene();
    if (!data || data === "{}") return;

    const hash = this.simpleHash(data);
    if (hash === this.lastSavedHash) return;
    this.lastSavedHash = hash;

    await offlineStore.set(IDB_SCENE_KEY, data);
    await this.addHistoryEntry(label, data);
  }

  /** Restore from IndexedDB on startup (with localStorage migration) */
  async restore(): Promise<boolean> {
    // One-time migration
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
      } catch { /* corrupted data */ }
    }
    return false;
  }

  /** Restore a specific history entry */
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
    } catch { /* ignore */ }
    return false;
  }

  async getHistory(): Promise<HistoryEntry[]> {
    try {
      const history = await offlineStore.get<HistoryEntry[]>(IDB_HISTORY_KEY);
      return history || [];
    } catch {
      return [];
    }
  }

  async clearHistory() {
    await offlineStore.delete(IDB_HISTORY_KEY);
    this.fireHistoryChange();
  }

  onHistoryChanged(fn: () => void) {
    this.onHistoryChange.push(fn);
  }

  private async addHistoryEntry(label: string, data: string) {
    const history = await this.getHistory();
    history.unshift({ timestamp: Date.now(), label, data });
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

/** Format timestamp for display */
function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `Today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

/** Setup version history panel UI */
export function setupHistoryPanel(container: HTMLElement, autoSave: AutoSave) {
  container.innerHTML = `
    <div class="history-panel">
      <div class="history-header">
        <span class="history-title">Version History</span>
        <button class="history-clear-btn" title="Clear history">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </button>
      </div>
      <div class="history-list"></div>
    </div>
  `;

  const list = container.querySelector(".history-list")!;
  const clearBtn = container.querySelector(".history-clear-btn")!;

  async function render() {
    const history = await autoSave.getHistory();
    if (history.length === 0) {
      list.innerHTML = `<div class="history-empty">No saved versions yet</div>`;
      return;
    }
    list.innerHTML = history.map((entry, i) => `
      <div class="history-entry" data-index="${i}">
        <div class="history-entry-info">
          <span class="history-entry-time">${formatTime(entry.timestamp)}</span>
          <span class="history-entry-label">${entry.label === "auto" ? "Auto-save" : entry.label === "manual" ? "Manual save" : entry.label}</span>
        </div>
        <button class="history-restore-btn" data-index="${i}" title="Restore this version">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 105.64-12.9L1 10"/></svg>
        </button>
      </div>
    `).join("");

    list.querySelectorAll<HTMLButtonElement>(".history-restore-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index!);
        if (confirm("Restore this version? Current changes will be saved first.")) {
          await autoSave.save("before restore");
          await autoSave.restoreVersion(idx);
        }
      });
    });
  }

  clearBtn.addEventListener("click", async () => {
    if (confirm("Clear all version history?")) {
      await autoSave.clearHistory();
    }
  });

  autoSave.onHistoryChanged(() => render());
  render();
}
