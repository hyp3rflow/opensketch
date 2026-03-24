/**
 * Branch Panel — Design version control branching UI
 * Rendered at the bottom of the canvas, next to page tabs.
 */
import type { Editor } from "../editor";

interface BranchInfo {
  id: number;
  name: string;
  active: boolean;
}

interface DiffNode {
  id: number;
  name: string;
}

interface BranchDiff {
  added: DiffNode[];
  modified: DiffNode[];
  removed: DiffNode[];
}

export function setupBranchPanel(container: HTMLElement, editor: Editor) {
  const bar = document.createElement("div");
  bar.className = "branch-panel";
  container.appendChild(bar);

  let popupEl: HTMLElement | null = null;
  let diffPopupEl: HTMLElement | null = null;

  function getBranches(): BranchInfo[] {
    try {
      return JSON.parse(editor.engine.list_branches()) as BranchInfo[];
    } catch {
      return [{ id: 1, name: "main", active: true }];
    }
  }

  function getActiveBranchId(): number {
    try {
      return Number(editor.engine.get_active_branch_id());
    } catch {
      return 1;
    }
  }

  function closePopups() {
    if (popupEl) { popupEl.remove(); popupEl = null; }
    if (diffPopupEl) { diffPopupEl.remove(); diffPopupEl = null; }
  }

  function render() {
    const branches = getBranches();
    const active = branches.find(b => b.active) || branches[0];
    bar.innerHTML = "";

    // Branch icon
    const icon = document.createElement("span");
    icon.className = "branch-icon";
    icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><circle cx="6" cy="18" r="3"/><path d="M6 9v3a3 3 0 003 3h6"/></svg>`;
    bar.appendChild(icon);

    // Active branch name
    const nameEl = document.createElement("span");
    nameEl.className = "branch-name";
    nameEl.textContent = active?.name || "main";
    nameEl.title = "Click to switch branches";
    bar.appendChild(nameEl);

    // Dropdown arrow
    const arrow = document.createElement("span");
    arrow.className = "branch-arrow";
    arrow.innerHTML = "▾";
    bar.appendChild(arrow);

    // Click to show popup
    const trigger = document.createElement("div");
    trigger.className = "branch-trigger";
    trigger.style.cssText = "position:absolute;inset:0;cursor:pointer;";
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      if (popupEl) { closePopups(); return; }
      showBranchPopup();
    });
    bar.appendChild(trigger);
  }

  function showBranchPopup() {
    closePopups();
    const branches = getBranches();
    const activeId = getActiveBranchId();

    popupEl = document.createElement("div");
    popupEl.className = "branch-popup";
    
    // Header
    const header = document.createElement("div");
    header.className = "branch-popup-header";
    header.innerHTML = `<span>Branches</span>`;
    
    const addBtn = document.createElement("button");
    addBtn.className = "branch-add-btn";
    addBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    addBtn.title = "Create branch";
    addBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      createBranch();
    });
    header.appendChild(addBtn);
    popupEl.appendChild(header);

    // Branch list
    const list = document.createElement("div");
    list.className = "branch-list";
    
    branches.forEach(branch => {
      const item = document.createElement("div");
      item.className = "branch-item" + (branch.id === activeId ? " active" : "");
      
      const nameSpan = document.createElement("span");
      nameSpan.className = "branch-item-name";
      nameSpan.textContent = branch.name;
      if (branch.id === 1) nameSpan.textContent += " ★";
      item.appendChild(nameSpan);

      const actions = document.createElement("div");
      actions.className = "branch-item-actions";

      // Merge button (not for active branch)
      if (branch.id !== activeId) {
        const mergeBtn = document.createElement("button");
        mergeBtn.className = "branch-action-btn";
        mergeBtn.title = `Merge "${branch.name}" into current`;
        mergeBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6l-6 6-6-6"/><path d="M18 18l-6-6-6 6"/></svg>`;
        mergeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          showDiffPreview(branch.id, branch.name, activeId);
        });
        actions.appendChild(mergeBtn);
      }

      // Delete button (not for main)
      if (branch.id !== 1 && branch.id !== activeId) {
        const delBtn = document.createElement("button");
        delBtn.className = "branch-action-btn branch-delete-btn";
        delBtn.title = "Delete branch";
        delBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (confirm(`Delete branch "${branch.name}"?`)) {
            editor.engine.delete_branch(BigInt(branch.id));
            render();
            showBranchPopup();
          }
        });
        actions.appendChild(delBtn);
      }

      item.appendChild(actions);

      // Click to switch
      if (branch.id !== activeId) {
        item.addEventListener("click", () => {
          editor.engine.switch_branch(BigInt(branch.id));
          closePopups();
          render();
          // Trigger re-render
          (editor as any).requestRender?.();
          (editor as any).needsRender = true;
        });
      }

      // Double-click to rename
      nameSpan.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        const input = document.createElement("input");
        input.className = "branch-rename-input";
        input.value = branch.name;
        nameSpan.replaceWith(input);
        input.focus();
        input.select();
        const finish = () => {
          const newName = input.value.trim();
          if (newName && newName !== branch.name) {
            editor.engine.rename_branch(BigInt(branch.id), newName);
          }
          render();
          showBranchPopup();
        };
        input.addEventListener("blur", finish);
        input.addEventListener("keydown", (ke) => {
          if (ke.key === "Enter") finish();
          if (ke.key === "Escape") { render(); showBranchPopup(); }
        });
      });

      list.appendChild(item);
    });

    popupEl.appendChild(list);

    // Position popup above the bar
    const rect = bar.getBoundingClientRect();
    popupEl.style.position = "fixed";
    popupEl.style.left = rect.left + "px";
    popupEl.style.bottom = (window.innerHeight - rect.top + 4) + "px";
    document.body.appendChild(popupEl);

    // Close on outside click
    const closeHandler = (e: MouseEvent) => {
      if (popupEl && !popupEl.contains(e.target as Node) && !bar.contains(e.target as Node)) {
        closePopups();
        document.removeEventListener("mousedown", closeHandler);
      }
    };
    setTimeout(() => document.addEventListener("mousedown", closeHandler), 0);
  }

  function createBranch() {
    const name = prompt("Branch name:", `Branch ${getBranches().length}`);
    if (!name?.trim()) return;
    editor.engine.create_branch(name.trim());
    closePopups();
    render();
    (editor as any).needsRender = true;
  }

  function showDiffPreview(sourceId: number, sourceName: string, targetId: number) {
    if (diffPopupEl) { diffPopupEl.remove(); diffPopupEl = null; }

    let diff: BranchDiff;
    try {
      diff = JSON.parse(editor.engine.get_branch_diff(BigInt(sourceId))) as BranchDiff;
    } catch {
      diff = { added: [], modified: [], removed: [] };
    }

    diffPopupEl = document.createElement("div");
    diffPopupEl.className = "branch-diff-popup";

    const title = document.createElement("div");
    title.className = "branch-diff-title";
    title.textContent = `Merge "${sourceName}" → current`;
    diffPopupEl.appendChild(title);

    const total = diff.added.length + diff.modified.length + diff.removed.length;

    if (total === 0) {
      const empty = document.createElement("div");
      empty.className = "branch-diff-empty";
      empty.textContent = "No changes to merge.";
      diffPopupEl.appendChild(empty);
    } else {
      const renderSection = (label: string, nodes: DiffNode[], cls: string) => {
        if (nodes.length === 0) return;
        const sec = document.createElement("div");
        sec.className = `branch-diff-section ${cls}`;
        const h = document.createElement("div");
        h.className = "branch-diff-section-label";
        h.textContent = `${label} (${nodes.length})`;
        sec.appendChild(h);
        nodes.forEach(n => {
          const row = document.createElement("div");
          row.className = "branch-diff-node";
          row.textContent = n.name || `Node ${n.id}`;
          sec.appendChild(row);
        });
        diffPopupEl!.appendChild(sec);
      };
      renderSection("Added", diff.added, "diff-added");
      renderSection("Modified", diff.modified, "diff-modified");
      renderSection("Removed", diff.removed, "diff-removed");
    }

    // Action buttons
    const actions = document.createElement("div");
    actions.className = "branch-diff-actions";
    
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "branch-diff-cancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => { diffPopupEl?.remove(); diffPopupEl = null; });
    actions.appendChild(cancelBtn);

    const mergeBtn = document.createElement("button");
    mergeBtn.className = "branch-diff-merge";
    mergeBtn.textContent = "Merge";
    mergeBtn.addEventListener("click", () => {
      editor.engine.merge_branch(BigInt(sourceId), BigInt(targetId));
      closePopups();
      render();
      (editor as any).needsRender = true;
    });
    actions.appendChild(mergeBtn);

    diffPopupEl.appendChild(actions);

    // Position
    const rect = bar.getBoundingClientRect();
    diffPopupEl.style.position = "fixed";
    diffPopupEl.style.left = (rect.left + 220) + "px";
    diffPopupEl.style.bottom = (window.innerHeight - rect.top + 4) + "px";
    document.body.appendChild(diffPopupEl);
  }

  render();

  return { refresh: render };
}
