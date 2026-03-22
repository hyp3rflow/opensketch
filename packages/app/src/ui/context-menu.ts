import type { Editor } from "../editor";

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  separator?: boolean;
}

let menuEl: HTMLElement | null = null;

function close() {
  if (menuEl) {
    menuEl.remove();
    menuEl = null;
  }
}

export function setupContextMenu(editor: Editor) {
  const canvas = editor.canvas;

  const closeOnClick = () => close();
  document.addEventListener("pointerdown", (e) => {
    if (menuEl && !menuEl.contains(e.target as Node)) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    close();

    const sel = Array.from(editor.engine.get_selection()).map(Number);
    const hasSelection = sel.length > 0;
    const hit = editor.engine.hit_test(e.offsetX, e.offsetY);

    // If right-clicked on a node not in selection, select it
    if (hit != null && !sel.includes(Number(hit))) {
      editor.engine.select(hit);
      editor.fireSelectionNow([Number(hit)]);
      editor.requestRender();
    }

    const updatedSel = Array.from(editor.engine.get_selection()).map(Number);
    const hasNode = updatedSel.length > 0;

    // Check if selection is a group (for ungroup)
    let isGroup = false;
    if (updatedSel.length === 1) {
      const nj = editor.engine.get_node_json(BigInt(updatedSel[0]));
      if (nj) {
        const node = JSON.parse(nj);
        const kind = typeof node.kind === "string" ? node.kind : Object.keys(node.kind)[0];
        isGroup = kind === "Group";
      }
    }

    // Check locked/visible state
    let isLocked = false;
    let isHidden = false;
    if (updatedSel.length === 1) {
      const nj = editor.engine.get_node_json(BigInt(updatedSel[0]));
      if (nj) {
        const node = JSON.parse(nj);
        isLocked = node.locked;
        isHidden = !node.visible;
      }
    }

    const isMac = navigator.platform.includes("Mac");
    const mod = isMac ? "⌘" : "Ctrl+";

    let items: MenuItem[];

    if (hasNode) {
      items = [
        { label: "Copy", shortcut: `${mod}C`, action: () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "c", metaKey: isMac, ctrlKey: !isMac })); } , disabled: false },
        { label: "Cut", shortcut: `${mod}X`, action: () => doCut(editor), disabled: false },
        { label: "Paste", shortcut: `${mod}V`, action: () => doPaste(editor), disabled: !(editor as any)._clipboard },
        { label: "Duplicate", shortcut: `${mod}D`, action: () => doDuplicate(editor), disabled: false },
        { label: "Delete", shortcut: "⌫", action: () => doDelete(editor), disabled: false },
        { separator: true, label: "" },
        { label: "Group", shortcut: `${mod}G`, action: () => doGroup(editor), disabled: updatedSel.length < 2 },
        { label: "Ungroup", action: () => doUngroup(editor, updatedSel[0]), disabled: !isGroup },
        { label: isLocked ? "Unlock" : "Lock", action: () => doToggleLock(editor, updatedSel), disabled: false },
        { label: isHidden ? "Show" : "Hide", action: () => doToggleVisible(editor, updatedSel), disabled: false },
        { separator: true, label: "" },
        { label: "Bring to Front", shortcut: `${mod}]`, action: () => doZOrder(editor, updatedSel, "front"), disabled: false },
        { label: "Bring Forward", shortcut: `${mod}Alt+]`, action: () => doZOrder(editor, updatedSel, "forward"), disabled: false },
        { label: "Send Backward", shortcut: `${mod}Alt+[`, action: () => doZOrder(editor, updatedSel, "backward"), disabled: false },
        { label: "Send to Back", shortcut: `${mod}[`, action: () => doZOrder(editor, updatedSel, "back"), disabled: false },
        { separator: true, label: "" },
        { label: "Flatten", shortcut: `${mod}E`, action: () => { editor.flattenSelection(); editor.notifyLayersChanged(); }, disabled: false },
      ];
    } else {
      items = [
        { label: "Paste", shortcut: `${mod}V`, action: () => doPaste(editor), disabled: !(editor as any)._clipboard },
        { label: "Select All", shortcut: `${mod}A`, action: () => doSelectAll(editor), disabled: false },
        { separator: true, label: "" },
        { label: "Zoom to Fit", shortcut: `${mod}1`, action: () => editor.zoomToFit(), disabled: false },
        { label: "Zoom to 100%", shortcut: `${mod}0`, action: () => editor.zoomTo100(), disabled: false },
      ];
    }

    showMenu(items, e.clientX, e.clientY);
  });
}

function showMenu(items: MenuItem[], x: number, y: number) {
  const el = document.createElement("div");
  el.className = "os-context-menu";
  el.style.cssText = `
    position: fixed; z-index: 10000;
    min-width: 200px; padding: 4px 0;
    background: #2c2c2c; border: 1px solid #444;
    border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    font-family: Inter, system-ui, sans-serif; font-size: 13px;
    color: #e0e0e0; user-select: none;
  `;

  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement("div");
      sep.style.cssText = "height:1px; margin:4px 8px; background:#444;";
      el.appendChild(sep);
      continue;
    }
    const row = document.createElement("div");
    row.style.cssText = `
      display:flex; justify-content:space-between; align-items:center;
      padding: 6px 12px; cursor: default; border-radius: 4px; margin: 0 4px;
    `;
    if (item.disabled) {
      row.style.color = "#666";
      row.style.cursor = "default";
    } else {
      row.addEventListener("mouseenter", () => { row.style.background = "#3b82f6"; });
      row.addEventListener("mouseleave", () => { row.style.background = "none"; });
      row.addEventListener("click", () => {
        close();
        item.action?.();
      });
    }

    const label = document.createElement("span");
    label.textContent = item.label;
    row.appendChild(label);

    if (item.shortcut) {
      const sc = document.createElement("span");
      sc.textContent = item.shortcut;
      sc.style.cssText = "color:#888; font-size:11px; margin-left:24px;";
      if (item.disabled) sc.style.color = "#555";
      row.appendChild(sc);
    }

    el.appendChild(row);
  }

  document.body.appendChild(el);
  menuEl = el;

  // Position: ensure it stays within viewport
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  el.style.left = (x + rect.width > vw ? vw - rect.width - 4 : x) + "px";
  el.style.top = (y + rect.height > vh ? vh - rect.height - 4 : y) + "px";
}

// === Actions ===

function doCut(editor: Editor) {
  const json = editor.engine.copy_selected();
  if (json && json !== "[]") {
    (editor as any)._clipboard = json;
    (editor as any)._pasteCount = 0;
    editor.engine.push_undo();
    const sel = editor.engine.get_selection();
    sel.forEach((id: number) => editor.engine.remove_node(id));
    editor.engine.deselect_all();
    editor.notifyLayersChanged();
    editor.fireSelectionNow([]);
    editor.requestRender();
  }
}

function doPaste(editor: Editor) {
  const clip = (editor as any)._clipboard;
  if (clip) {
    editor.engine.push_undo();
    (editor as any)._pasteCount = ((editor as any)._pasteCount || 0) + 1;
    const offset = (editor as any)._pasteCount * 10;
    const newIds = editor.engine.paste_nodes(clip, offset, offset);
    const ids = JSON.parse(newIds).map(Number);
    editor.notifyLayersChanged();
    editor.fireSelectionNow(ids);
    editor.requestRender();
  }
}

function doDuplicate(editor: Editor) {
  const json = editor.engine.copy_selected();
  if (json && json !== "[]") {
    editor.engine.push_undo();
    const newIds = editor.engine.paste_nodes(json, 10, 10);
    const ids = JSON.parse(newIds).map(Number);
    editor.notifyLayersChanged();
    editor.fireSelectionNow(ids);
    editor.requestRender();
  }
}

function doDelete(editor: Editor) {
  editor.engine.push_undo();
  const sel = editor.engine.get_selection();
  sel.forEach((id: number) => editor.engine.remove_node(id));
  editor.engine.deselect_all();
  editor.notifyLayersChanged();
  editor.fireSelectionNow([]);
  editor.requestRender();
}

function doGroup(editor: Editor) {
  editor.engine.push_undo();
  const gid = editor.engine.group_selected();
  if (gid) {
    editor.notifyLayersChanged();
    editor.fireSelectionNow([Number(gid)]);
    editor.requestRender();
  }
}

function doUngroup(editor: Editor, id: number) {
  editor.engine.push_undo();
  if (editor.engine.ungroup(id)) {
    const newSel = Array.from(editor.engine.get_selection()).map(Number);
    editor.notifyLayersChanged();
    editor.fireSelectionNow(newSel);
    editor.requestRender();
  }
}

function doToggleLock(editor: Editor, ids: number[]) {
  editor.engine.push_undo();
  for (const id of ids) {
    const nj = editor.engine.get_node_json(BigInt(id));
    if (nj) {
      const node = JSON.parse(nj);
      editor.engine.set_locked(id, !node.locked);
    }
  }
  editor.notifyLayersChanged();
  editor.requestRender();
}

function doToggleVisible(editor: Editor, ids: number[]) {
  editor.engine.push_undo();
  for (const id of ids) {
    const nj = editor.engine.get_node_json(BigInt(id));
    if (nj) {
      const node = JSON.parse(nj);
      editor.engine.set_visible(id, !node.visible);
    }
  }
  editor.notifyLayersChanged();
  editor.requestRender();
}

function doZOrder(editor: Editor, ids: number[], direction: "front" | "back" | "forward" | "backward") {
  editor.engine.push_undo();
  for (const id of ids) {
    switch (direction) {
      case "front": editor.engine.bring_to_front(id); break;
      case "back": editor.engine.send_to_back(id); break;
      case "forward": editor.engine.bring_forward(id); break;
      case "backward": editor.engine.send_backward(id); break;
    }
  }
  editor.notifyLayersChanged();
  editor.requestRender();
}

function doSelectAll(editor: Editor) {
  editor.engine.select_all();
  const sel = Array.from(editor.engine.get_selection()).map(Number);
  editor.fireSelectionNow(sel);
  editor.requestRender();
}
