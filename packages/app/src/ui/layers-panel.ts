import type { Editor } from "../editor";
import { icons } from "./icons";
import { showContextMenu } from "./context-menu";
import { showBatchRenameDialog } from "./batch-rename";
import { addPopOutButton } from "./panel-detach";
import { t, onLocaleChange } from "./i18n";

const kindIcons: Record<string, string> = {
  Rect: icons.rect,
  Ellipse: icons.ellipse,
  Frame: icons.frame,
  Group: icons.frame,
  Slot: icons.slot,
  Instance: icons.instance,
  Section: icons.section,
  Slice: icons.slice,
  Connector: icons.connector,
  StickyNote: icons.stickyNote,
  VectorNetwork: icons.pen || icons.rect,
};

function iconSized(svg: string, size = 14) {
  return svg.replace(/width="\d+"/, `width="${size}"`).replace(/height="\d+"/, `height="${size}"`);
}

// Collapse state persisted per session
const collapsed = new Set<number>();

interface LayerNode {
  id: number;
  name: string;
  kind: string;
  visible: boolean;
  locked: boolean;
  parent: number | null;
  children: number[];
  is_mask: boolean;
}

export function setupLayersPanel(container: HTMLElement, editor: Editor) {
  const header = document.createElement("div");
  header.className = "layers-header";
  header.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding-right:4px;";
  
  const headerTitle = document.createElement("span");
  headerTitle.textContent = t("layers.title");
  header.appendChild(headerTitle);

  const searchToggle = document.createElement("button");
  searchToggle.className = "layers-search-toggle";
  searchToggle.title = t("layers.searchTooltip");
  searchToggle.style.cssText = "background:none;border:none;cursor:pointer;padding:2px 4px;border-radius:4px;opacity:0.5;display:flex;align-items:center;";
  searchToggle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
  searchToggle.addEventListener("mouseenter", () => { searchToggle.style.opacity = "1"; });
  searchToggle.addEventListener("mouseleave", () => { if (!searchActive) searchToggle.style.opacity = "0.5"; });
  header.appendChild(searchToggle);

  // Pop-out button
  addPopOutButton(header, "layers", editor);

  container.appendChild(header);

  let searchActive = false;
  let searchQuery = "";

  const searchBar = document.createElement("div");
  searchBar.className = "layers-search-bar";
  searchBar.style.cssText = "display:none;padding:4px 8px 6px;";
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = t("layers.searchPlaceholder");
  searchInput.style.cssText = "width:100%;box-sizing:border-box;padding:5px 8px;background:#1a1a1a;border:1px solid #444;border-radius:6px;color:#eee;font-size:12px;outline:none;";
  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value.toLowerCase();
    refresh();
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { toggleSearch(false); e.stopPropagation(); }
  });
  searchBar.appendChild(searchInput);
  container.appendChild(searchBar);

  function toggleSearch(force?: boolean) {
    searchActive = force ?? !searchActive;
    searchBar.style.display = searchActive ? "block" : "none";
    searchToggle.style.opacity = searchActive ? "1" : "0.5";
    if (searchActive) {
      searchInput.focus();
    } else {
      searchInput.value = "";
      searchQuery = "";
      refresh();
    }
  }

  searchToggle.addEventListener("click", () => toggleSearch());

  // Ctrl+F / Cmd+F within layers panel
  container.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "f") {
      e.preventDefault();
      e.stopPropagation();
      toggleSearch(true);
    }
  });

  const list = document.createElement("div");
  list.id = "layers-list";
  container.appendChild(list);

  function refresh() {
    const layers: LayerNode[] = JSON.parse(editor.engine.get_layer_list());
    const selection = new Set(Array.from(editor.engine.get_selection()).map(Number));
    const nodeMap = new Map<number, LayerNode>();
    for (const l of layers) nodeMap.set(l.id, l);

    // Build set of matching nodes + their ancestors for search filter
    let matchSet: Set<number> | null = null;
    if (searchQuery) {
      matchSet = new Set<number>();
      for (const l of layers) {
        if (l.name.toLowerCase().includes(searchQuery) || l.kind.toLowerCase().includes(searchQuery)) {
          // Add this node and all ancestors
          let cur: LayerNode | undefined = l;
          while (cur) {
            matchSet.add(cur.id);
            cur = cur.parent != null ? nodeMap.get(cur.parent) : undefined;
          }
        }
      }
    }

    // Find root nodes (no parent)
    const roots = layers.filter((l) => l.parent == null);
    // Deduplicate — render_order lists children too, but we'll walk the tree ourselves
    const rootIds = new Set(roots.map((r) => r.id));

    list.innerHTML = "";

    // Show match count when searching
    if (searchQuery && matchSet) {
      const directMatches = layers.filter(l => l.name.toLowerCase().includes(searchQuery) || l.kind.toLowerCase().includes(searchQuery)).length;
      const countEl = document.createElement("div");
      countEl.style.cssText = "padding:2px 12px 4px;font-size:11px;color:#888;";
      countEl.textContent = directMatches === 0 ? t("layers.noMatches") : t("layers.matchCount", { count: directMatches });
      list.appendChild(countEl);
    }

    function renderNode(node: LayerNode, depth: number) {
      // Filter: skip nodes not matching search
      if (matchSet && !matchSet.has(node.id)) return;

      const hasChildren = node.children.length > 0;
      const isCollapsed = !searchQuery && collapsed.has(node.id); // auto-expand when searching
      const isFrame = node.kind === "Frame" || node.kind === "Group" || node.kind === "Section";

      const item = document.createElement("div");
      item.className = "layer-item" + (selection.has(node.id) ? " selected" : "");
      item.style.paddingLeft = `${8 + depth * 16}px`;

      // Expand/collapse arrow
      const arrow = document.createElement("span");
      arrow.className = "layer-arrow";
      if (hasChildren) {
        arrow.innerHTML = isCollapsed
          ? `<svg width="10" height="10" viewBox="0 0 10 10"><path d="M3 2l4 3-4 3z" fill="#888"/></svg>`
          : `<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 3l3 4 3-4z" fill="#888"/></svg>`;
        arrow.style.cursor = "pointer";
        arrow.addEventListener("click", (e) => {
          e.stopPropagation();
          if (isCollapsed) collapsed.delete(node.id);
          else collapsed.add(node.id);
          refresh();
        });
      } else {
        arrow.style.width = "10px";
        arrow.style.display = "inline-block";
      }

      const icon = document.createElement("span");
      icon.className = "layer-icon";
      let kindKey = node.kind.startsWith("Text") ? "Text" : node.kind;
      // Detect Instance/Slot from kind string
      if (node.kind.startsWith("Instance")) kindKey = "Instance";
      else if (node.kind.startsWith("Slot")) kindKey = "Slot";
      else if (node.kind.startsWith("VectorNetwork")) kindKey = "VectorNetwork";
      // Detect component source frames
      const isComponentSource = node.name.startsWith("[C] ");
      if (isComponentSource) icon.classList.add("layer-icon--component");
      else if (kindKey === "Instance") icon.classList.add("layer-icon--instance");
      else if (kindKey === "Slot") icon.classList.add("layer-icon--slot");
      icon.innerHTML = iconSized(isComponentSource ? icons.component : (kindIcons[kindKey] || icons.text), 14);

      const name = document.createElement("span");
      name.className = "layer-name";
      const displayName = node.name.replace(/^\[(C|I|S)\] /, "");
      if (searchQuery && displayName.toLowerCase().includes(searchQuery)) {
        const idx = displayName.toLowerCase().indexOf(searchQuery);
        const before = displayName.slice(0, idx);
        const match = displayName.slice(idx, idx + searchQuery.length);
        const after = displayName.slice(idx + searchQuery.length);
        name.innerHTML = `${before}<mark style="background:#4a90d9;color:#fff;border-radius:2px;padding:0 1px">${match}</mark>${after}`;
      } else {
        name.textContent = displayName;
      }
      if (isFrame) name.style.fontWeight = "600";

      const vis = document.createElement("span");
      vis.className = "layer-visibility";
      vis.innerHTML = iconSized(node.visible ? icons.eye : icons.eyeOff, 14);
      vis.addEventListener("click", (e) => {
        e.stopPropagation();
        editor.engine.set_visible(BigInt(node.id), !node.visible);
        editor.requestRender();
        refresh();
      });

      item.appendChild(arrow);
      item.appendChild(icon);
      item.appendChild(name);
      // Bookmark toggle
      const bookmarked = editor.engine.is_bookmarked(BigInt(node.id));
      const bm = document.createElement("span");
      bm.className = "layer-bookmark";
      bm.style.cssText = `font-size:11px;cursor:pointer;margin-left:auto;margin-right:2px;flex-shrink:0;opacity:${bookmarked ? "1" : "0"};color:#f59e0b;transition:opacity 0.15s;`;
      bm.textContent = bookmarked ? "★" : "☆";
      bm.title = bookmarked ? "Remove bookmark" : "Bookmark";
      bm.addEventListener("click", (e) => {
        e.stopPropagation();
        editor.engine.push_undo();
        editor.engine.toggle_bookmark(BigInt(node.id));
        editor.requestRender();
        refresh();
      });
      // Show on hover
      item.addEventListener("mouseenter", () => { if (!editor.engine.is_bookmarked(BigInt(node.id))) bm.style.opacity = "0.4"; });
      item.addEventListener("mouseleave", () => { if (!editor.engine.is_bookmarked(BigInt(node.id))) bm.style.opacity = "0"; });

      if (node.is_mask) {
        const maskBadge = document.createElement("span");
        maskBadge.className = "layer-mask-badge";
        maskBadge.title = "Mask";
        maskBadge.style.cssText = "font-size:9px;color:#818cf8;background:#818cf820;padding:1px 4px;border-radius:3px;margin-left:auto;margin-right:4px;flex-shrink:0;";
        maskBadge.textContent = "M";
        item.appendChild(maskBadge);
      }
      // Style override indicator badge for Instance nodes
      if (node.kind.startsWith("Instance")) {
        try {
          const ovJson = editor.engine.get_instance_overridden_props(BigInt(node.id));
          const ovInfo = JSON.parse(ovJson);
          if (ovInfo && ovInfo.overrides && ovInfo.overrides.length > 0) {
            const ovBadge = document.createElement("span");
            ovBadge.title = `${ovInfo.overrides.length} override(s) — click to reset`;
            ovBadge.style.cssText = "font-size:9px;color:#3b82f6;background:#3b82f620;padding:1px 4px;border-radius:3px;margin-left:auto;margin-right:4px;flex-shrink:0;cursor:pointer;";
            ovBadge.textContent = "◆";
            ovBadge.addEventListener("click", (e) => {
              e.stopPropagation();
              if (confirm("Reset all overrides on this instance?")) {
                editor.engine.reset_all_instance_overrides(BigInt(node.id));
                editor.requestRender();
                refresh();
              }
            });
            item.appendChild(ovBadge);
          }
        } catch { /* ignore */ }
      }
      // Bookmark toggle
      const bookmark = document.createElement("span");
      bookmark.className = "layer-bookmark";
      const isBookmarked = editor.engine.is_bookmarked(BigInt(node.id));
      bookmark.innerHTML = isBookmarked
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="#facc15" stroke="#facc15" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
      bookmark.style.cssText = "cursor:pointer;flex-shrink:0;opacity:0.5;margin-right:2px;";
      if (isBookmarked) bookmark.style.opacity = "1";
      bookmark.addEventListener("click", (e) => {
        e.stopPropagation();
        editor.engine.push_undo();
        editor.engine.toggle_bookmark(BigInt(node.id));
        editor.requestRender();
        refresh();
      });
      item.appendChild(bookmark);
      item.appendChild(bm);
      item.appendChild(vis);

      item.addEventListener("click", () => {
        editor.selectNode(node.id);
      });

      item.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const sel = Array.from(editor.engine.get_selection()).map(Number);
        // If right-clicked node is not in selection, select it
        if (!sel.includes(node.id)) {
          editor.selectNode(node.id);
        }
        const currentSel = Array.from(editor.engine.get_selection()).map(Number);
        const isMac = navigator.platform.includes("Mac");
        const mod = isMac ? "⌘" : "Ctrl+";
        const items: { label: string; shortcut?: string; action?: () => void; enabled?: boolean; separator?: boolean }[] = [];
        items.push({ label: t("layers.rename"), action: () => editor.startRenameNode?.(node.id) });
        if (currentSel.length >= 2) {
          items.push({ label: t("layers.batchRename"), shortcut: `${mod}⇧R`, action: () => showBatchRenameDialog(editor) });
        }
        items.push({ separator: true, label: "" });
        items.push({ label: t("layers.delete"), shortcut: "⌫", action: () => { editor.engine.push_undo(); for (const id of currentSel) editor.engine.remove_node(BigInt(id)); editor.requestRender(); refresh(); } });
        items.push({ label: t("layers.duplicate"), shortcut: `${mod}D`, action: () => { (editor as any).ctxDuplicate?.(); refresh(); } });
        items.push({ separator: true, label: "" });
        items.push({ label: node.visible ? t("layers.hide") : t("layers.show"), action: () => { editor.engine.set_visible(BigInt(node.id), !node.visible); editor.requestRender(); refresh(); } });
        items.push({ label: node.locked ? t("layers.unlock") : t("layers.lock"), action: () => { editor.engine.set_locked(BigInt(node.id), !node.locked); editor.requestRender(); refresh(); } });
        showContextMenu(e.clientX, e.clientY, items);
      });

      list.appendChild(item);

      // Render children if expanded
      if (hasChildren && !isCollapsed) {
        const childNodes = node.children
          .map((cid) => nodeMap.get(cid))
          .filter(Boolean) as LayerNode[];
        // Reverse so last child (front) is on top
        [...childNodes].reverse().forEach((child) => renderNode(child, depth + 1));
      }
    }

    // Render root nodes in reverse (front on top)
    [...roots].reverse().forEach((root) => renderNode(root, 0));
  }

  editor.onLayers(refresh);
  editor.onSelection(refresh);
  onLocaleChange(() => {
    headerTitle.textContent = t("layers.title");
    searchToggle.title = t("layers.searchTooltip");
    searchInput.placeholder = t("layers.searchPlaceholder");
    refresh();
  });
  setTimeout(refresh, 100);
}
