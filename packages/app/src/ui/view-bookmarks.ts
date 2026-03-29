/**
 * View Bookmarks — save canvas position+zoom as named bookmarks.
 * Navigate instantly, share as URL hash fragments.
 */

import type { Editor } from "../editor";

export interface ViewBookmark {
  id: number;
  name: string;
  x: number;
  y: number;
  zoom: number;
  page_id: number;
  description: string;
  created_at: number;
  color: string;
}

const BOOKMARK_COLORS = [
  "#4ecdc4", "#ff6b6b", "#ffd93d", "#6bcb77",
  "#4d96ff", "#ff9a3c", "#c084fc", "#f472b6",
];

let panelEl: HTMLElement | null = null;

export function getViewBookmarks(editor: Editor): ViewBookmark[] {
  try {
    return JSON.parse((editor.engine as any).get_view_bookmarks());
  } catch { return []; }
}

export function addViewBookmark(editor: Editor, name?: string): number {
  const zoom = editor.engine.get_zoom();
  const panX = editor.engine.get_pan_x();
  const panY = editor.engine.get_pan_y();
  const w = editor.canvas.width / (window.devicePixelRatio || 1);
  const h = editor.canvas.height / (window.devicePixelRatio || 1);
  const cx = (w / 2 - panX) / zoom;
  const cy = (h / 2 - panY) / zoom;
  const bookmarks = getViewBookmarks(editor);
  const idx = bookmarks.length;
  const color = BOOKMARK_COLORS[idx % BOOKMARK_COLORS.length];
  const finalName = name || `View ${idx + 1}`;
  const id = Number((editor.engine as any).add_view_bookmark(finalName, cx, cy, zoom, "", color));
  editor.requestRender();
  return id;
}

export function navigateToBookmark(editor: Editor, bookmark: ViewBookmark) {
  // Switch page if needed
  const currentPageId = Number(editor.engine.get_active_page_id());
  if (bookmark.page_id && bookmark.page_id !== currentPageId) {
    editor.engine.set_active_page(BigInt(bookmark.page_id));
  }
  // Navigate to the saved view
  const w = editor.canvas.width / (window.devicePixelRatio || 1);
  const h = editor.canvas.height / (window.devicePixelRatio || 1);
  const panX = w / 2 - bookmark.x * bookmark.zoom;
  const panY = h / 2 - bookmark.y * bookmark.zoom;
  editor.engine.set_viewport(bookmark.zoom, panX, panY);
  editor.requestRender();
}

export function removeBookmark(editor: Editor, id: number) {
  (editor.engine as any).remove_view_bookmark(BigInt(id));
  editor.requestRender();
}

/** Encode bookmark as URL hash fragment */
export function bookmarkToHash(bookmark: ViewBookmark): string {
  return `#view=${bookmark.x.toFixed(1)},${bookmark.y.toFixed(1)},${bookmark.zoom.toFixed(3)},p${bookmark.page_id}`;
}

/** Parse a view hash from URL */
export function parseViewHash(hash: string): { x: number; y: number; zoom: number; pageId: number } | null {
  const m = hash.match(/^#view=([-\d.]+),([-\d.]+),([-\d.]+),p(\d+)$/);
  if (!m) return null;
  return { x: parseFloat(m[1]), y: parseFloat(m[2]), zoom: parseFloat(m[3]), pageId: parseInt(m[4]) };
}

// ─── Panel UI ────────────────────────────────────────────────

export function toggleViewBookmarksPanel(editor: Editor, parentEl: HTMLElement) {
  if (panelEl) {
    panelEl.remove();
    panelEl = null;
    return;
  }
  showViewBookmarksPanel(editor, parentEl);
}

export function showViewBookmarksPanel(editor: Editor, parentEl: HTMLElement) {
  if (panelEl) panelEl.remove();

  const panel = document.createElement("div");
  panel.className = "view-bookmarks-panel";
  panel.style.cssText = `
    position: absolute; left: 12px; bottom: 48px; z-index: 9998;
    width: 260px; max-height: 400px;
    background: #fff; border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.12);
    display: flex; flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    overflow: hidden;
  `;

  // Header
  const header = document.createElement("div");
  header.style.cssText = `
    padding: 10px 14px; font-size: 13px; font-weight: 600; color: #1a1a1a;
    border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; justify-content: space-between;
  `;
  header.innerHTML = `<span>📍 View Bookmarks</span>`;

  const headerRight = document.createElement("div");
  headerRight.style.cssText = "display:flex;gap:4px;align-items:center;";

  const addBtn = document.createElement("button");
  addBtn.textContent = "+";
  addBtn.title = "Save current view";
  addBtn.style.cssText = `
    border: none; background: #4ecdc4; color: #fff; font-size: 14px; font-weight: 700;
    width: 22px; height: 22px; border-radius: 6px; cursor: pointer; line-height: 1;
  `;
  addBtn.addEventListener("click", () => {
    addViewBookmark(editor);
    renderList();
  });
  headerRight.appendChild(addBtn);

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = `
    border: none; background: none; cursor: pointer; font-size: 14px;
    color: #999; padding: 0 2px; line-height: 1;
  `;
  closeBtn.addEventListener("click", () => {
    panelEl?.remove();
    panelEl = null;
  });
  headerRight.appendChild(closeBtn);
  header.appendChild(headerRight);
  panel.appendChild(header);

  // List
  const list = document.createElement("div");
  list.style.cssText = `
    flex: 1; overflow-y: auto; padding: 6px 8px;
    display: flex; flex-direction: column; gap: 4px;
  `;
  panel.appendChild(list);

  const renderList = () => {
    list.innerHTML = "";
    const bookmarks = getViewBookmarks(editor);

    if (bookmarks.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "No bookmarks yet.\nPress + or Cmd+Shift+B to save current view.";
      empty.style.cssText = "color: #999; font-size: 12px; text-align: center; padding: 20px 8px; white-space: pre-line;";
      list.appendChild(empty);
      return;
    }

    for (const bm of bookmarks) {
      const row = document.createElement("div");
      row.style.cssText = `
        display: flex; align-items: center; gap: 8px; padding: 6px 8px;
        border-radius: 8px; cursor: pointer; transition: background 0.1s;
      `;
      row.addEventListener("mouseenter", () => { row.style.background = "#f7f7f7"; });
      row.addEventListener("mouseleave", () => { row.style.background = "transparent"; });

      // Color dot
      const dot = document.createElement("span");
      dot.style.cssText = `
        width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
        background: ${bm.color || "#4ecdc4"};
      `;
      row.appendChild(dot);

      // Name + info
      const info = document.createElement("div");
      info.style.cssText = "flex:1;min-width:0;";
      const nameEl = document.createElement("div");
      nameEl.textContent = bm.name;
      nameEl.style.cssText = "font-size:12px;font-weight:500;color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      info.appendChild(nameEl);

      const meta = document.createElement("div");
      meta.textContent = `${Math.round(bm.zoom * 100)}% · (${Math.round(bm.x)}, ${Math.round(bm.y)})`;
      meta.style.cssText = "font-size:10px;color:#999;";
      info.appendChild(meta);
      row.appendChild(info);

      // Copy link button
      const linkBtn = document.createElement("button");
      linkBtn.textContent = "🔗";
      linkBtn.title = "Copy share link";
      linkBtn.style.cssText = "border:none;background:none;cursor:pointer;font-size:12px;padding:2px;opacity:0.5;";
      linkBtn.addEventListener("mouseenter", () => { linkBtn.style.opacity = "1"; });
      linkBtn.addEventListener("mouseleave", () => { linkBtn.style.opacity = "0.5"; });
      linkBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const hash = bookmarkToHash(bm);
        const url = `${window.location.origin}${window.location.pathname}${hash}`;
        navigator.clipboard.writeText(url).catch(() => {});
        linkBtn.textContent = "✓";
        setTimeout(() => { linkBtn.textContent = "🔗"; }, 1000);
      });
      row.appendChild(linkBtn);

      // Delete button
      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.style.cssText = "border:none;background:none;cursor:pointer;font-size:11px;color:#ccc;padding:2px;";
      delBtn.addEventListener("mouseenter", () => { delBtn.style.color = "#ff6b6b"; });
      delBtn.addEventListener("mouseleave", () => { delBtn.style.color = "#ccc"; });
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeBookmark(editor, bm.id);
        renderList();
      });
      row.appendChild(delBtn);

      // Click to navigate
      row.addEventListener("click", () => {
        navigateToBookmark(editor, bm);
      });

      list.appendChild(row);
    }
  };

  renderList();

  // Keyboard shortcut hint
  const hint = document.createElement("div");
  hint.style.cssText = `
    padding: 6px 14px; border-top: 1px solid #f0f0f0;
    font-size: 10px; color: #bbb; text-align: center;
  `;
  hint.textContent = "⌘⇧B to bookmark · 1-9 to jump";
  panel.appendChild(hint);

  parentEl.appendChild(panel);
  panelEl = panel;
}

export function isViewBookmarksPanelOpen(): boolean {
  return panelEl != null;
}

/** Handle number key shortcuts (1-9) to jump to bookmarks */
export function handleBookmarkShortcut(editor: Editor, key: string): boolean {
  const num = parseInt(key);
  if (isNaN(num) || num < 1 || num > 9) return false;
  const bookmarks = getViewBookmarks(editor);
  const idx = num - 1;
  if (idx < bookmarks.length) {
    navigateToBookmark(editor, bookmarks[idx]);
    return true;
  }
  return false;
}

/** Check URL hash on load and navigate if view bookmark hash is present */
export function checkUrlViewHash(editor: Editor) {
  const parsed = parseViewHash(window.location.hash);
  if (!parsed) return;
  // Small delay to ensure editor is ready
  setTimeout(() => {
    if (parsed.pageId) {
      const currentPageId = Number(editor.engine.get_active_page_id());
      if (parsed.pageId !== currentPageId) {
        editor.engine.set_active_page(BigInt(parsed.pageId));
      }
    }
    const w = editor.canvas.width / (window.devicePixelRatio || 1);
    const h = editor.canvas.height / (window.devicePixelRatio || 1);
    const panX = w / 2 - parsed.x * parsed.zoom;
    const panY = h / 2 - parsed.y * parsed.zoom;
    editor.engine.set_viewport(parsed.zoom, panX, panY);
    editor.requestRender();
    // Clear hash to avoid re-navigating on refresh
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }, 300);
}
