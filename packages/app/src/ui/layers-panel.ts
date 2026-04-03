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
  RepeatGrid: icons.frame,
};

function iconSized(svg: string, size = 14) {
  return svg.replace(/width="\d+"/, `width="${size}"`).replace(/height="\d+"/, `height="${size}"`);
}

// Collapse state persisted per session
const collapsed = new Set<number>();

// ── Drag Reorder State ──
interface DragState {
  draggedIds: number[];
  /** Target parent id (null = root) */
  targetParent: number | null;
  /** Index within target parent's children */
  targetIndex: number;
  /** Depth level for indicator indentation */
  targetDepth: number;
  /** Whether dropping INTO a container (Frame/Group/Section) */
  dropInside: boolean;
}


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

// --- Drag reorder state ---
const dragState = {
  active: false,
  sourceId: -1,
  targetId: -1,
  position: "after" as "before" | "after" | "inside",
};
let dragIndicator: HTMLElement | null = null;

function showIndicator(item: HTMLElement, position: "before" | "after" | "inside", depth: number) {
  clearIndicator();
  if (position === "inside") {
    item.style.outline = "2px solid #0d99ff";
    item.style.outlineOffset = "-2px";
    item.style.borderRadius = "4px";
    dragIndicator = item;
    return;
  }
  const indicator = document.createElement("div");
  indicator.className = "drag-indicator";
  const indent = 8 + depth * 16;
  indicator.style.cssText = `position:absolute;left:${indent}px;right:8px;height:2px;background:#0d99ff;border-radius:1px;pointer-events:none;z-index:100;`;
  // Position relative to item
  const parent = item.parentElement!;
  const rect = item.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  const top = position === "before" ? rect.top - parentRect.top : rect.bottom - parentRect.top;
  indicator.style.top = `${top}px`;
  parent.style.position = "relative";
  parent.appendChild(indicator);
  dragIndicator = indicator;
}

function clearIndicator() {
  if (!dragIndicator) return;
  if (dragIndicator.className === "drag-indicator") {
    dragIndicator.remove();
  } else {
    // It was the item itself (inside highlight)
    dragIndicator.style.outline = "";
    dragIndicator.style.outlineOffset = "";
    dragIndicator.style.borderRadius = "";
  }
  dragIndicator = null;
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

  // ── Drag Reorder ──
  let dragState: DragState | null = null;
  const dropIndicator = document.createElement("div");
  dropIndicator.className = "layers-drop-indicator";
  dropIndicator.style.cssText = "display:none;position:absolute;left:0;right:0;height:2px;background:#0d99ff;pointer-events:none;z-index:100;border-radius:1px;";
  list.style.position = "relative";
  list.appendChild(dropIndicator);

  function isAncestor(ancestorId: number, nodeId: number, nodeMap: Map<number, LayerNode>): boolean {
    let cur = nodeMap.get(nodeId);
    while (cur) {
      if (cur.parent != null && cur.parent === ancestorId) return true;
      cur = cur.parent != null ? nodeMap.get(cur.parent) : undefined;
    }
    return false;
  }

  function hideIndicator() {
    dropIndicator.style.display = "none";
    dragState = null;
    // Remove all drag-over highlights
    list.querySelectorAll(".layer-item--drag-over").forEach(el => el.classList.remove("layer-item--drag-over"));
  }

  function isDescendant(parentId: number, childId: number, nodeMap: Map<number, LayerNode>): boolean {
    const parent = nodeMap.get(parentId);
    if (!parent) return false;
    for (const cid of parent.children) {
      if (cid === childId) return true;
      if (isDescendant(cid, childId, nodeMap)) return true;
    }
    return false;
  }

  function executeDrop(sourceId: number, targetId: number, position: "before" | "after" | "inside", targetNode: LayerNode, nodeMap: Map<number, LayerNode>) {
    // Prevent circular reparent
    if (isDescendant(sourceId, targetId, nodeMap)) return;

    editor.engine.push_undo();

    if (position === "inside") {
      // Reparent as first child of target (top = last index visually, but children are reversed)
      const targetChildren = targetNode.children;
      editor.engine.reparent_node_at(BigInt(sourceId), targetId, targetChildren.length);
    } else {
      // Insert before/after target within target's parent
      const parentId = targetNode.parent;
      const parentNode = parentId != null ? nodeMap.get(parentId) : null;
      if (parentNode) {
        let idx = parentNode.children.indexOf(targetId);
        if (idx < 0) idx = 0;
        if (position === "after") idx += 1;
        // Adjust if source is already a sibling before target
        const sourceNode = nodeMap.get(sourceId);
        if (sourceNode && sourceNode.parent === parentId) {
          const srcIdx = parentNode.children.indexOf(sourceId);
          if (srcIdx >= 0 && srcIdx < idx) idx -= 1;
        }
        editor.engine.reparent_node_at(BigInt(sourceId), parentId, idx);
      } else {
        // Root level — parentId = -1
        // Get root ordering from scene
        const layers: LayerNode[] = JSON.parse(editor.engine.get_layer_list());
        const roots = layers.filter(l => l.parent == null);
        let idx = roots.findIndex(r => r.id === targetId);
        if (idx < 0) idx = 0;
        if (position === "after") idx += 1;
        const sourceIsRoot = roots.findIndex(r => r.id === sourceId);
        if (sourceIsRoot >= 0 && sourceIsRoot < idx) idx -= 1;
        editor.engine.reparent_node_at(BigInt(sourceId), -1, idx);
      }
    }

    editor.requestRender();
    refresh();
  }

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
      else if (node.kind.startsWith("RepeatGrid")) kindKey = "RepeatGrid";
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

      // --- Drag reorder ---
      item.setAttribute("draggable", "true");
      item.dataset.nodeId = String(node.id);
      item.dataset.depth = String(depth);
      item.dataset.hasChildren = hasChildren ? "1" : "0";
      item.dataset.isContainer = isFrame ? "1" : "0";

      item.addEventListener("dragstart", (e) => {
        e.stopPropagation();
        dragState.sourceId = node.id;
        dragState.active = true;
        item.style.opacity = "0.4";
        e.dataTransfer!.effectAllowed = "move";
        e.dataTransfer!.setData("text/plain", String(node.id));
      });

      item.addEventListener("dragend", () => {
        item.style.opacity = "";
        dragState.active = false;
        dragState.sourceId = -1;
        clearIndicator();
      });

      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!dragState.active || dragState.sourceId === node.id) return;
        e.dataTransfer!.dropEffect = "move";
        const rect = item.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const h = rect.height;
        const isContainer = isFrame && hasChildren;
        // Top 25% = before, Bottom 25% = after, Middle 50% = inside (containers only)
        let position: "before" | "after" | "inside";
        if (y < h * 0.25) position = "before";
        else if (y > h * 0.75 || !isContainer) position = y < h * 0.5 ? "before" : "after";
        else position = "inside";
        dragState.targetId = node.id;
        dragState.position = position;
        showIndicator(item, position, depth);
      });

      item.addEventListener("dragleave", (e) => {
        if (dragState.targetId === node.id) {
          // Only clear if truly leaving (not entering child)
          const related = e.relatedTarget as HTMLElement | null;
          if (!related || !item.contains(related)) {
            clearIndicator();
          }
        }
      });

      item.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!dragState.active || dragState.sourceId < 0 || dragState.sourceId === node.id) return;
        executeDrop(dragState.sourceId, node.id, dragState.position, node, nodeMap);
        dragState.active = false;
        dragState.sourceId = -1;
        clearIndicator();
      });

      // ── Drag reorder handlers ──
      item.draggable = true;
      item.dataset.nodeId = String(node.id);
      item.dataset.depth = String(depth);
      item.dataset.parentId = node.parent != null ? String(node.parent) : "";
      item.dataset.kind = node.kind;
      item.dataset.childCount = String(node.children.length);

      item.addEventListener("dragstart", (e) => {
        e.stopPropagation();
        const sel = Array.from(editor.engine.get_selection()).map(Number);
        const ids = sel.includes(node.id) ? sel : [node.id];
        dragState = { draggedIds: ids, targetParent: null, targetIndex: 0, targetDepth: 0, dropInside: false };
        e.dataTransfer!.effectAllowed = "move";
        e.dataTransfer!.setData("text/plain", ids.join(","));
        item.style.opacity = "0.4";
      });

      item.addEventListener("dragend", () => {
        item.style.opacity = "";
        hideIndicator();
      });

      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!dragState) return;
        e.dataTransfer!.dropEffect = "move";

        const rect = item.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const h = rect.height;
        const isContainer = node.kind === "Frame" || node.kind === "Group" || node.kind === "Section";
        const itemDepth = depth;

        // Determine drop zone: top 25% = above, bottom 25% = below, middle 50% = inside (for containers)
        let zone: "above" | "below" | "inside";
        if (isContainer && y > h * 0.25 && y < h * 0.75) {
          zone = "inside";
        } else if (y < h * 0.5) {
          zone = "above";
        } else {
          zone = "below";
        }

        // Check if dropping onto self or descendant
        for (const did of dragState.draggedIds) {
          if (did === node.id) return;
          if (isAncestor(did, node.id, nodeMap)) return;
        }

        list.querySelectorAll(".layer-item--drag-over").forEach(el => el.classList.remove("layer-item--drag-over"));

        if (zone === "inside") {
          // Drop inside container
          dragState.targetParent = node.id;
          dragState.targetIndex = 0; // prepend (top of reversed list = last child = front)
          dragState.targetDepth = itemDepth + 1;
          dragState.dropInside = true;
          dropIndicator.style.display = "none";
          item.classList.add("layer-item--drag-over");
        } else {
          dragState.dropInside = false;
          item.classList.remove("layer-item--drag-over");

          // Compute target parent and index
          // In the layers panel, children are rendered reversed (last child = front = top)
          // So "above" in visual = after in reversed order, "below" = before
          const parentId = node.parent ?? null;
          const siblings = parentId != null ? (nodeMap.get(parentId)?.children ?? []) : roots.map(r => r.id);
          // The visual order is reversed, so find position
          const posInSiblings = siblings.indexOf(node.id);

          if (zone === "above") {
            // Insert after this node in children array (visually above = later index in reversed display)
            dragState.targetParent = parentId;
            dragState.targetIndex = posInSiblings + 1;
            dragState.targetDepth = itemDepth;
            // Show indicator above item
            const listRect = list.getBoundingClientRect();
            dropIndicator.style.display = "block";
            dropIndicator.style.top = `${rect.top - listRect.top}px`;
            dropIndicator.style.left = `${8 + itemDepth * 16}px`;
            dropIndicator.style.right = "8px";
          } else {
            // Insert at this node's position in children array (visually below = earlier index)
            dragState.targetParent = parentId;
            dragState.targetIndex = posInSiblings;
            dragState.targetDepth = itemDepth;
            // Show indicator below item
            const listRect = list.getBoundingClientRect();
            dropIndicator.style.display = "block";
            dropIndicator.style.top = `${rect.bottom - listRect.top}px`;
            dropIndicator.style.left = `${8 + itemDepth * 16}px`;
            dropIndicator.style.right = "8px";
          }
        }
      });

      item.addEventListener("dragleave", (e) => {
        item.classList.remove("layer-item--drag-over");
      });

      item.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!dragState) return;

        const { draggedIds, targetParent, targetIndex, dropInside } = dragState;
        editor.engine.push_undo();

        // Sort dragged IDs by their current position to maintain relative order
        for (const nid of draggedIds) {
          const parentArg = targetParent != null ? Number(targetParent) : -1;
          editor.engine.reparent_node_at(BigInt(nid), parentArg, dropInside ? 0 : targetIndex);
        }

        hideIndicator();
        editor.requestRender();
        refresh();
      });

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
        items.push({ separator: true, label: "" });
        items.push({ label: "Auto-rename", action: () => { editor.autoRenameSelection(); refresh(); } });
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
