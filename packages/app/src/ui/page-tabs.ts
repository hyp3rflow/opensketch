/**
 * Page Tabs — Multi-page navigation bar
 * Rendered at the top of the canvas area.
 */
import type { Editor } from "../editor";

interface PageInfo {
  id: number;
  name: string;
}

export function setupPageTabs(container: HTMLElement, editor: Editor) {
  const bar = document.createElement("div");
  bar.className = "page-tabs-bar";
  container.appendChild(bar);

  function getPages(): PageInfo[] {
    try {
      const raw = editor.engine.get_pages();
      return JSON.parse(raw) as PageInfo[];
    } catch {
      return [{ id: 1, name: "Page 1" }];
    }
  }

  function getActivePageId(): number {
    try {
      return Number(editor.engine.get_active_page_id());
    } catch {
      return 1;
    }
  }

  function render() {
    const pages = getPages();
    const activeId = getActivePageId();
    bar.innerHTML = "";

    pages.forEach((page) => {
      const tab = document.createElement("div");
      tab.className = "page-tab" + (page.id === activeId ? " active" : "");
      tab.dataset.pageId = String(page.id);

      const label = document.createElement("span");
      label.className = "page-tab-label";
      label.textContent = page.name;
      tab.appendChild(label);

      // Click to switch page
      tab.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).classList.contains("page-tab-label") && tab.classList.contains("active")) {
          return; // Double-click will handle rename
        }
        switchPage(page.id);
      });

      // Double-click to rename
      label.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        startRename(tab, label, page.id);
      });

      // Right-click context menu
      tab.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, page.id, pages.length);
      });

      bar.appendChild(tab);
    });

    // Add page button
    const addBtn = document.createElement("div");
    addBtn.className = "page-tab page-tab-add";
    addBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    addBtn.title = "Add page";
    addBtn.addEventListener("click", () => {
      const pages = getPages();
      const name = `Page ${pages.length + 1}`;
      editor.engine.push_undo();
      const newId = editor.engine.add_page(name);
      if (newId) {
        editor.engine.set_active_page(Number(newId));
        editor.deselect_all();
        editor.requestRender();
        render();
      }
    });
    bar.appendChild(addBtn);
  }

  function switchPage(pageId: number) {
    const currentId = getActivePageId();
    if (pageId === currentId) return;
    editor.engine.push_undo();
    editor.engine.set_active_page(pageId);
    editor.deselect_all();
    editor.requestRender();
    render();
    // Notify layers panel etc.
    (editor as any).fireSelectionChange?.();
    (editor as any).fireLayersChange?.();
  }

  function startRename(tab: HTMLElement, label: HTMLElement, pageId: number) {
    const input = document.createElement("input");
    input.className = "page-tab-rename-input";
    input.value = label.textContent || "";
    input.style.width = Math.max(40, label.offsetWidth + 8) + "px";
    tab.replaceChild(input, label);
    input.focus();
    input.select();

    const finish = () => {
      const newName = input.value.trim() || "Untitled";
      editor.engine.rename_page(pageId, newName);
      render();
    };

    input.addEventListener("blur", finish);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { input.blur(); }
      if (e.key === "Escape") { input.value = label.textContent || ""; input.blur(); }
    });
  }

  function showContextMenu(x: number, y: number, pageId: number, totalPages: number) {
    // Remove existing context menu
    document.querySelector(".page-ctx-menu")?.remove();

    const menu = document.createElement("div");
    menu.className = "page-ctx-menu";
    menu.style.left = x + "px";
    menu.style.top = y + "px";

    const items = [
      { label: "Rename", action: () => {
        const tab = bar.querySelector(`[data-page-id="${pageId}"]`) as HTMLElement;
        const label = tab?.querySelector(".page-tab-label") as HTMLElement;
        if (tab && label) startRename(tab, label, pageId);
      }},
      { label: "Duplicate", action: () => {
        editor.engine.push_undo();
        const newId = editor.engine.duplicate_page(pageId);
        if (newId) {
          editor.engine.set_active_page(Number(newId));
          editor.deselect_all();
          editor.requestRender();
          render();
        }
      }},
      ...(totalPages > 1 ? [{ label: "Delete", action: () => {
        editor.engine.push_undo();
        editor.engine.remove_page(pageId);
        editor.deselect_all();
        editor.requestRender();
        render();
      }}] : []),
    ];

    items.forEach((item) => {
      const el = document.createElement("div");
      el.className = "page-ctx-item";
      el.textContent = item.label;
      el.addEventListener("click", () => {
        menu.remove();
        item.action();
      });
      menu.appendChild(el);
    });

    document.body.appendChild(menu);

    // Close on click outside
    const closeMenu = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener("click", closeMenu);
      }
    };
    setTimeout(() => document.addEventListener("click", closeMenu), 0);
  }

  // Re-render on selection/layers changes (page switch triggers these)
  editor.onSelectionChange(() => render());

  // Initial render
  render();

  return { refresh: render };
}
