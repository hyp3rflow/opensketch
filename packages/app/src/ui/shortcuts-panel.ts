/**
 * Keyboard Shortcuts Panel — view & customize key bindings
 * Toggle with Cmd+/ or ?
 */

import {
  getShortcutManager,
  bindingToDisplayKeys,
  eventToBinding,
  type KeyBinding,
} from "./shortcut-manager";

let overlayEl: HTMLElement | null = null;

export function isShortcutsPanelVisible(): boolean {
  return overlayEl !== null;
}

export function toggleShortcutsPanel() {
  if (overlayEl) {
    closeShortcutsPanel();
  } else {
    openShortcutsPanel();
  }
}

export function closeShortcutsPanel() {
  if (overlayEl) {
    const handler = (overlayEl as any)._keyHandler;
    if (handler) window.removeEventListener("keydown", handler, true);
    overlayEl.remove();
    overlayEl = null;
  }
}

function openShortcutsPanel() {
  if (overlayEl) return;
  const mgr = getShortcutManager();

  // Backdrop
  const backdrop = document.createElement("div");
  backdrop.className = "shortcuts-backdrop";
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeShortcutsPanel();
  });

  // Modal
  const modal = document.createElement("div");
  modal.className = "shortcuts-modal";
  modal.style.maxWidth = "640px";

  // Header
  const header = document.createElement("div");
  header.className = "shortcuts-header";
  header.innerHTML = `
    <span class="shortcuts-title">Keyboard Shortcuts</span>
    <div style="display:flex;gap:6px;align-items:center">
      <button class="shortcuts-btn shortcuts-reset-all" title="Reset all to defaults">Reset All</button>
      <button class="shortcuts-btn shortcuts-export" title="Export custom bindings">Export</button>
      <button class="shortcuts-btn shortcuts-import" title="Import custom bindings">Import</button>
      <button class="shortcuts-close" title="Close (Esc)">✕</button>
    </div>
  `;
  header.querySelector(".shortcuts-close")!.addEventListener("click", closeShortcutsPanel);
  header.querySelector(".shortcuts-reset-all")!.addEventListener("click", () => {
    if (confirm("Reset all shortcuts to defaults?")) {
      mgr.resetAll();
      renderCategories(searchInput.value);
    }
  });
  header.querySelector(".shortcuts-export")!.addEventListener("click", () => {
    const json = mgr.exportJSON();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "opensketch-shortcuts.json"; a.click();
    URL.revokeObjectURL(url);
  });
  header.querySelector(".shortcuts-import")!.addEventListener("click", () => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".json";
    inp.onchange = () => {
      const file = inp.files?.[0];
      if (!file) return;
      file.text().then(text => {
        try {
          const count = mgr.importJSON(text);
          alert(`Imported ${count} shortcut(s)`);
          renderCategories(searchInput.value);
        } catch { alert("Invalid JSON file"); }
      });
    };
    inp.click();
  });
  modal.appendChild(header);

  // Search
  const searchWrap = document.createElement("div");
  searchWrap.className = "shortcuts-search-wrap";
  const searchInput = document.createElement("input");
  searchInput.className = "shortcuts-search";
  searchInput.placeholder = "Search shortcuts…";
  searchInput.type = "text";
  searchWrap.appendChild(searchInput);
  modal.appendChild(searchWrap);

  // Content
  const content = document.createElement("div");
  content.className = "shortcuts-content";
  modal.appendChild(content);

  let rebindingRow: HTMLElement | null = null;
  let rebindingId: string | null = null;

  function stopRebinding() {
    if (rebindingRow) {
      rebindingRow.classList.remove("shortcuts-rebinding");
      const keysEl = rebindingRow.querySelector(".shortcuts-keys") as HTMLElement;
      if (keysEl && rebindingId) {
        renderKeys(keysEl, mgr.getBinding(rebindingId));
      }
    }
    rebindingRow = null;
    rebindingId = null;
  }

  function renderKeys(container: HTMLElement, binding: KeyBinding) {
    container.innerHTML = "";
    for (const k of bindingToDisplayKeys(binding)) {
      const kbd = document.createElement("kbd");
      kbd.textContent = k;
      container.appendChild(kbd);
    }
  }

  function renderCategories(filter: string) {
    content.innerHTML = "";
    const q = filter.toLowerCase().trim();
    const allDefs = mgr.getAllDefs();
    const categories = mgr.getCategories();
    let hasResults = false;

    for (const cat of categories) {
      const catDefs = allDefs.filter(d => d.category === cat);
      const filtered = q
        ? catDefs.filter(d =>
            d.description.toLowerCase().includes(q) ||
            d.id.toLowerCase().includes(q) ||
            bindingToDisplayKeys(mgr.getBinding(d.id)).join(" ").toLowerCase().includes(q)
          )
        : catDefs;

      if (filtered.length === 0) continue;
      hasResults = true;

      const section = document.createElement("div");
      section.className = "shortcuts-section";

      const heading = document.createElement("div");
      heading.className = "shortcuts-section-title";
      heading.textContent = cat;
      section.appendChild(heading);

      for (const def of filtered) {
        const row = document.createElement("div");
        row.className = "shortcuts-row";
        if (mgr.isCustom(def.id)) row.classList.add("shortcuts-custom");

        const desc = document.createElement("span");
        desc.className = "shortcuts-desc";
        desc.textContent = def.description;

        const keysWrap = document.createElement("div");
        keysWrap.style.display = "flex";
        keysWrap.style.alignItems = "center";
        keysWrap.style.gap = "4px";

        const keys = document.createElement("span");
        keys.className = "shortcuts-keys";
        renderKeys(keys, mgr.getBinding(def.id));

        // Edit button
        const editBtn = document.createElement("button");
        editBtn.className = "shortcuts-edit-btn";
        editBtn.textContent = "✎";
        editBtn.title = "Click to rebind, then press new key combination";
        editBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          stopRebinding();
          rebindingId = def.id;
          rebindingRow = row;
          row.classList.add("shortcuts-rebinding");
          keys.innerHTML = "<span class='shortcuts-listening'>Press keys…</span>";
        });

        // Reset button (only if custom)
        if (mgr.isCustom(def.id)) {
          const resetBtn = document.createElement("button");
          resetBtn.className = "shortcuts-edit-btn";
          resetBtn.textContent = "↺";
          resetBtn.title = "Reset to default";
          resetBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            mgr.resetBinding(def.id);
            renderCategories(filter);
          });
          keysWrap.appendChild(resetBtn);
        }

        keysWrap.appendChild(keys);
        keysWrap.appendChild(editBtn);

        row.appendChild(desc);
        row.appendChild(keysWrap);
        section.appendChild(row);
      }

      content.appendChild(section);
    }

    if (!hasResults) {
      const empty = document.createElement("div");
      empty.className = "shortcuts-empty";
      empty.textContent = "No shortcuts found";
      content.appendChild(empty);
    }
  }

  renderCategories("");
  searchInput.addEventListener("input", () => {
    stopRebinding();
    renderCategories(searchInput.value);
  });

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  overlayEl = backdrop;

  requestAnimationFrame(() => searchInput.focus());

  // Key handler for rebinding + ESC
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !rebindingId) {
      e.preventDefault();
      e.stopPropagation();
      closeShortcutsPanel();
      window.removeEventListener("keydown", onKey, true);
      return;
    }

    if (rebindingId) {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        stopRebinding();
        return;
      }

      const binding = eventToBinding(e);
      if (!binding) return; // bare modifier

      const conflict = mgr.findConflict(binding, rebindingId);
      if (conflict) {
        const conflictDef = mgr.getAllDefs().find(d => d.id === conflict);
        const conflictName = conflictDef?.description ?? conflict;
        if (!confirm(`"${bindingToDisplayKeys(binding).join(" + ")}" is already used by "${conflictName}".\nOverride and clear the other binding?`)) {
          return;
        }
        // Clear the conflicting binding by resetting it or setting to empty
        mgr.resetBinding(conflict);
      }

      mgr.setBinding(rebindingId, binding);
      stopRebinding();
      renderCategories(searchInput.value);
    }
  };
  window.addEventListener("keydown", onKey, true);

  // Store cleanup ref on the overlay element
  (backdrop as any)._keyHandler = onKey;
}
