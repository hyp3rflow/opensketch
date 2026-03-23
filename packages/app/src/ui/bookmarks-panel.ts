import type { Editor } from "../editor";

interface BookmarkEntry {
  page_id: number;
  page_name: string;
  id: number;
  name: string;
}

export function setupBookmarksPanel(container: HTMLElement, editor: Editor) {
  const header = document.createElement("div");
  header.style.cssText = "padding:12px 16px 8px;font-weight:600;font-size:13px;color:#e5e7eb;";
  header.textContent = "Bookmarks";
  container.appendChild(header);

  const list = document.createElement("div");
  list.style.cssText = "overflow-y:auto;flex:1;padding:0 8px 8px;";
  container.appendChild(list);

  function refresh() {
    const entries: BookmarkEntry[] = JSON.parse(editor.engine.get_all_bookmarked_nodes());
    list.innerHTML = "";

    if (entries.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "padding:16px;color:#6b7280;font-size:12px;text-align:center;";
      empty.textContent = "No bookmarked nodes yet.\nUse ⭐ in Layers or ⌘⇧B to bookmark.";
      list.appendChild(empty);
      return;
    }

    // Group by page
    const byPage = new Map<number, { pageName: string; items: BookmarkEntry[] }>();
    for (const e of entries) {
      if (!byPage.has(e.page_id)) byPage.set(e.page_id, { pageName: e.page_name, items: [] });
      byPage.get(e.page_id)!.items.push(e);
    }

    for (const [pageId, { pageName, items }] of byPage) {
      if (byPage.size > 1) {
        const pageHeader = document.createElement("div");
        pageHeader.style.cssText = "padding:6px 8px 2px;font-size:11px;color:#9ca3af;font-weight:500;text-transform:uppercase;letter-spacing:0.05em;";
        pageHeader.textContent = pageName;
        list.appendChild(pageHeader);
      }

      for (const item of items) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:12px;color:#d1d5db;";
        row.addEventListener("mouseenter", () => { row.style.background = "rgba(255,255,255,0.05)"; });
        row.addEventListener("mouseleave", () => { row.style.background = ""; });

        const star = document.createElement("span");
        star.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="#facc15" stroke="#facc15" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
        star.style.flexShrink = "0";

        const name = document.createElement("span");
        name.textContent = item.name;
        name.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

        row.appendChild(star);
        row.appendChild(name);

        row.addEventListener("click", () => {
          // Switch page if needed
          const activePage = editor.engine.get_active_page_id();
          if (Number(activePage) !== pageId) {
            editor.engine.set_active_page(BigInt(pageId));
          }
          // Select and pan to node
          const nodeJson = editor.engine.get_node_json(BigInt(item.id));
          if (nodeJson) {
            const node = JSON.parse(nodeJson);
            editor.engine.select(BigInt(item.id));
            editor.engine.pan_to(node.x + node.width / 2, node.y + node.height / 2);
            editor.requestRender();
            editor.fireSelectionNow([item.id]);
          }
        });

        list.appendChild(row);
      }
    }
  }

  editor.onLayers(refresh);
  editor.onSelection(refresh);
  setTimeout(refresh, 200);
}
