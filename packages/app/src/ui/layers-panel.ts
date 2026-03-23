import type { Editor } from "../editor";
import { icons } from "./icons";

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
  header.textContent = "Layers";
  container.appendChild(header);

  const list = document.createElement("div");
  list.id = "layers-list";
  container.appendChild(list);

  function refresh() {
    const layers: LayerNode[] = JSON.parse(editor.engine.get_layer_list());
    const selection = new Set(Array.from(editor.engine.get_selection()).map(Number));
    const nodeMap = new Map<number, LayerNode>();
    for (const l of layers) nodeMap.set(l.id, l);

    // Find root nodes (no parent)
    const roots = layers.filter((l) => l.parent == null);
    // Deduplicate — render_order lists children too, but we'll walk the tree ourselves
    const rootIds = new Set(roots.map((r) => r.id));

    list.innerHTML = "";

    function renderNode(node: LayerNode, depth: number) {
      const hasChildren = node.children.length > 0;
      const isCollapsed = collapsed.has(node.id);
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
      // Detect component source frames
      const isComponentSource = node.name.startsWith("[C] ");
      if (isComponentSource) icon.classList.add("layer-icon--component");
      else if (kindKey === "Instance") icon.classList.add("layer-icon--instance");
      else if (kindKey === "Slot") icon.classList.add("layer-icon--slot");
      icon.innerHTML = iconSized(isComponentSource ? icons.component : (kindIcons[kindKey] || icons.text), 14);

      const name = document.createElement("span");
      name.className = "layer-name";
      const displayName = node.name.replace(/^\[(C|I|S)\] /, "");
      name.textContent = displayName;
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
  setTimeout(refresh, 100);
}
