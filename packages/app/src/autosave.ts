/**
 * Auto-save & Version History for OpenSketch
 * - Auto-saves to localStorage every 30 seconds
 * - Manual save via Cmd+S
 * - Stores up to 20 versioned snapshots
 * - Restore UI in history panel
 */

import type { Editor } from "./editor";

const STORAGE_KEY = "opensketch_autosave";
const HISTORY_KEY = "opensketch_history";
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
    this.restore();
    this.intervalId = setInterval(() => this.save("auto"), AUTO_SAVE_INTERVAL);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  /** Save current scene */
  save(label = "manual") {
    const data = this.editor.engine.export_scene();
    if (!data || data === "{}") return;

    // Skip if nothing changed
    const hash = this.simpleHash(data);
    if (hash === this.lastSavedHash) return;
    this.lastSavedHash = hash;

    // Save current state
    try {
      localStorage.setItem(STORAGE_KEY, data);
    } catch {
      // localStorage full — try clearing old history
      this.trimHistory(5);
      try { localStorage.setItem(STORAGE_KEY, data); } catch { /* give up */ }
    }

    // Add to history
    this.addHistoryEntry(label, data);
  }

  /** Restore from localStorage on startup */
  restore(): boolean {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      try {
        const success = this.editor.engine.import_scene(data);
        if (success) {
          this.lastSavedHash = this.simpleHash(data);
          this.editor.requestRender();
          return true;
        }
      } catch {
        // corrupted data, ignore
      }
    }
    return false;
  }

  /** Restore a specific history entry */
  restoreVersion(index: number): boolean {
    const history = this.getHistory();
    const entry = history[index];
    if (!entry) return false;

    try {
      const success = this.editor.engine.import_scene(entry.data);
      if (success) {
        this.lastSavedHash = this.simpleHash(entry.data);
        localStorage.setItem(STORAGE_KEY, entry.data);
        this.editor.requestRender();
        this.editor.notifyLayersChanged();
        this.editor.notifySelectionChanged([]);
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }

  getHistory(): HistoryEntry[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
    this.fireHistoryChange();
  }

  onHistoryChanged(fn: () => void) {
    this.onHistoryChange.push(fn);
  }

  private addHistoryEntry(label: string, data: string) {
    const history = this.getHistory();
    history.unshift({ timestamp: Date.now(), label, data });
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      this.trimHistory(MAX_HISTORY / 2);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 10))); } catch { /* give up */ }
    }
    this.fireHistoryChange();
  }

  private trimHistory(keepN: number) {
    const history = this.getHistory();
    if (history.length > keepN) {
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, keepN)));
      } catch { /* ignore */ }
    }
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

  function render() {
    const history = autoSave.getHistory();
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
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index!);
        if (confirm("Restore this version? Current changes will be saved first.")) {
          autoSave.save("before restore");
          autoSave.restoreVersion(idx);
        }
      });
    });
  }

  clearBtn.addEventListener("click", () => {
    if (confirm("Clear all version history?")) {
      autoSave.clearHistory();
    }
  });

  autoSave.onHistoryChanged(render);
  render();
}
