/**
 * File System Access API — .opensketch file save/open
 * Uses showOpenFilePicker/showSaveFilePicker with fallback for unsupported browsers.
 */
import type { Editor } from "../editor";

interface RecentFile {
  name: string;
  timestamp: number;
}

const RECENT_KEY = "opensketch_recent_files";
const MAX_RECENT = 10;
const FILE_EXT = ".opensketch";
const MIME = "application/json";

// File System Access API types
declare global {
  interface Window {
    showOpenFilePicker?: (opts?: any) => Promise<FileSystemFileHandle[]>;
    showSaveFilePicker?: (opts?: any) => Promise<FileSystemFileHandle>;
  }
}

const fileTypes = [
  {
    description: "OpenSketch Files",
    accept: { [MIME]: [FILE_EXT] },
  },
];

export class FileManager {
  private editor: Editor;
  private fileHandle: FileSystemFileHandle | null = null;
  private currentFileName: string = "Untitled";
  private onTitleChange: ((name: string) => void) | null = null;
  private dirty = false;

  constructor(editor: Editor) {
    this.editor = editor;
  }

  setOnTitleChange(fn: (name: string) => void) {
    this.onTitleChange = fn;
  }

  getFileName(): string {
    return this.currentFileName;
  }

  isDirty(): boolean {
    return this.dirty;
  }

  markDirty() {
    this.dirty = true;
  }

  private updateTitle(name: string) {
    this.currentFileName = name;
    this.onTitleChange?.(name);
    document.title = `${name} — OpenSketch`;
  }

  /** Save to current file handle or prompt Save As */
  async save(): Promise<boolean> {
    if (this.fileHandle) {
      return this.writeToHandle(this.fileHandle);
    }
    return this.saveAs();
  }

  /** Always prompt for new file location */
  async saveAs(): Promise<boolean> {
    const json = (this.editor as any).engine.export_scene();
    if (!json) return false;

    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: this.currentFileName.endsWith(FILE_EXT)
            ? this.currentFileName
            : this.currentFileName + FILE_EXT,
          types: fileTypes,
        });
        this.fileHandle = handle;
        const ok = await this.writeToHandle(handle);
        if (ok) {
          const name = handle.name.replace(/\.opensketch$/, "");
          this.updateTitle(name);
          this.addRecent(handle.name);
        }
        return ok;
      } catch (e: any) {
        if (e.name === "AbortError") return false; // user cancelled
        console.error("Save failed:", e);
        return false;
      }
    }

    // Fallback: download
    this.downloadJson(json, this.currentFileName + FILE_EXT);
    this.dirty = false;
    return true;
  }

  /** Open file picker */
  async open(): Promise<boolean> {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: fileTypes,
          multiple: false,
        });
        const file = await handle.getFile();
        const json = await file.text();
        const ok = (this.editor as any).engine.import_scene(json);
        if (ok) {
          this.fileHandle = handle;
          const name = handle.name.replace(/\.opensketch$/, "");
          this.updateTitle(name);
          this.addRecent(handle.name);
          this.dirty = false;
          (this.editor as any).requestRender?.();
        }
        return ok;
      } catch (e: any) {
        if (e.name === "AbortError") return false;
        console.error("Open failed:", e);
        return false;
      }
    }

    // Fallback: <input type="file">
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = FILE_EXT;
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return resolve(false);
        const json = await file.text();
        const ok = (this.editor as any).engine.import_scene(json);
        if (ok) {
          this.fileHandle = null;
          const name = file.name.replace(/\.opensketch$/, "");
          this.updateTitle(name);
          this.addRecent(file.name);
          this.dirty = false;
          (this.editor as any).requestRender?.();
        }
        resolve(ok);
      };
      input.click();
    });
  }

  /** Create a new empty scene */
  newFile() {
    (this.editor as any).engine.import_scene("{}");
    this.fileHandle = null;
    this.updateTitle("Untitled");
    this.dirty = false;
    (this.editor as any).requestRender?.();
  }

  // --- Recent files ---

  getRecentFiles(): RecentFile[] {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    } catch {
      return [];
    }
  }

  private addRecent(name: string) {
    let recent = this.getRecentFiles().filter((r) => r.name !== name);
    recent.unshift({ name, timestamp: Date.now() });
    if (recent.length > MAX_RECENT) recent = recent.slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  }

  // --- Helpers ---

  private async writeToHandle(handle: FileSystemFileHandle): Promise<boolean> {
    try {
      const json = (this.editor as any).engine.export_scene();
      const writable = await (handle as any).createWritable();
      await writable.write(json);
      await writable.close();
      this.dirty = false;
      return true;
    } catch (e) {
      console.error("Write failed:", e);
      return false;
    }
  }

  private downloadJson(json: string, filename: string) {
    const blob = new Blob([json], { type: MIME });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

/** Setup file menu UI in toolbar area */
export function setupFileMenu(container: HTMLElement, fileManager: FileManager) {
  const menuBtn = document.createElement("div");
  menuBtn.className = "file-menu-btn";
  menuBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
  menuBtn.title = "File";
  menuBtn.style.cssText = `
    position: fixed; top: 8px; left: 8px; z-index: 1000;
    width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
    background: rgba(30,30,30,0.85); border-radius: 8px; cursor: pointer;
    color: #ccc; backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.08);
  `;

  let dropdown: HTMLDivElement | null = null;

  const hideDropdown = () => {
    dropdown?.remove();
    dropdown = null;
  };

  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (dropdown) { hideDropdown(); return; }

    dropdown = document.createElement("div");
    dropdown.style.cssText = `
      position: fixed; top: 44px; left: 8px; z-index: 1001;
      background: rgba(30,30,30,0.95); border-radius: 8px; padding: 4px 0;
      min-width: 200px; backdrop-filter: blur(12px);
      border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px;
    `;

    const items: Array<{ label: string; shortcut?: string; action: () => void; sep?: boolean }> = [
      { label: "New", shortcut: "", action: () => { fileManager.newFile(); hideDropdown(); } },
      { label: "Open…", shortcut: "⌘O", action: () => { fileManager.open(); hideDropdown(); } },
      { label: "separator", action: () => {}, sep: true },
      { label: "Save", shortcut: "⌘S", action: () => { fileManager.save(); hideDropdown(); } },
      { label: "Save As…", shortcut: "⇧⌘S", action: () => { fileManager.saveAs(); hideDropdown(); } },
    ];

    // Recent files
    const recent = fileManager.getRecentFiles();
    if (recent.length > 0) {
      items.push({ label: "separator", action: () => {}, sep: true });
      items.push({ label: "Recent Files", shortcut: "", action: () => {}, sep: false });
    }

    for (const item of items) {
      if (item.sep) {
        const sep = document.createElement("div");
        sep.style.cssText = "height:1px;background:rgba(255,255,255,0.08);margin:4px 0;";
        dropdown.appendChild(sep);
        continue;
      }

      if (item.label === "Recent Files") {
        const hdr = document.createElement("div");
        hdr.textContent = "Recent Files";
        hdr.style.cssText = "padding:4px 12px;color:#888;font-size:11px;";
        dropdown.appendChild(hdr);
        for (const rf of recent.slice(0, 5)) {
          const ri = document.createElement("div");
          ri.textContent = rf.name;
          ri.style.cssText = "padding:6px 12px;color:#aaa;cursor:pointer;font-size:12px;";
          ri.addEventListener("mouseenter", () => ri.style.background = "rgba(255,255,255,0.06)");
          ri.addEventListener("mouseleave", () => ri.style.background = "none");
          dropdown.appendChild(ri);
        }
        continue;
      }

      const row = document.createElement("div");
      row.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:6px 12px;cursor:pointer;color:#ddd;";
      row.innerHTML = `<span>${item.label}</span><span style="color:#888;font-size:11px;">${item.shortcut || ""}</span>`;
      row.addEventListener("mouseenter", () => row.style.background = "rgba(255,255,255,0.06)");
      row.addEventListener("mouseleave", () => row.style.background = "none");
      row.addEventListener("click", item.action);
      dropdown.appendChild(row);
    }

    document.body.appendChild(dropdown);
    const close = (ev: MouseEvent) => {
      if (!dropdown?.contains(ev.target as Node) && ev.target !== menuBtn) {
        hideDropdown();
        document.removeEventListener("click", close);
      }
    };
    setTimeout(() => document.addEventListener("click", close), 0);
  });

  container.appendChild(menuBtn);
}
