/**
 * Component Library Panel — shared component library management
 * Import/Export/Sync/Unlink component libraries
 */

import type { Engine } from "../wasm/opensketch_engine";

let panelEl: HTMLElement | null = null;
let engine: Engine | null = null;
let onUpdate: (() => void) | null = null;

export function initComponentLibrary(eng: Engine, updateCb?: () => void) {
  engine = eng;
  onUpdate = updateCb || null;
}

export function renderComponentLibraryPanel(container: HTMLElement) {
  if (!engine) return;
  
  container.innerHTML = "";
  
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "padding:12px;font-size:13px;color:#ccc;";
  
  // Title
  const title = document.createElement("div");
  title.style.cssText = "font-weight:600;font-size:14px;margin-bottom:12px;color:#fff;display:flex;align-items:center;gap:8px;";
  title.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> Component Libraries`;
  wrapper.appendChild(title);
  
  // Import/Export buttons
  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:8px;margin-bottom:16px;";
  
  const importBtn = createButton("↓ Import", "#4a90d9", () => importLibrary());
  const exportBtn = createButton("↑ Export", "#36b37e", () => exportLibrary());
  btnRow.appendChild(importBtn);
  btnRow.appendChild(exportBtn);
  wrapper.appendChild(btnRow);
  
  // Linked libraries list
  const libsJson = engine.get_linked_libraries();
  const libs: Array<{id: string; name: string; version: string; component_count: number}> = JSON.parse(libsJson);
  
  if (libs.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText = "color:#666;font-size:12px;padding:16px 0;text-align:center;";
    empty.textContent = "No linked libraries. Import a .json library file to get started.";
    wrapper.appendChild(empty);
  } else {
    const listTitle = document.createElement("div");
    listTitle.style.cssText = "font-size:11px;text-transform:uppercase;color:#888;margin-bottom:8px;letter-spacing:0.5px;";
    listTitle.textContent = `Linked Libraries (${libs.length})`;
    wrapper.appendChild(listTitle);
    
    for (const lib of libs) {
      const card = document.createElement("div");
      card.style.cssText = "background:#2a2a3e;border-radius:8px;padding:10px 12px;margin-bottom:8px;border:1px solid #3a3a50;";
      
      const header = document.createElement("div");
      header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;";
      
      const nameEl = document.createElement("div");
      nameEl.style.cssText = "font-weight:600;color:#fff;font-size:13px;";
      nameEl.textContent = lib.name;
      header.appendChild(nameEl);
      
      const versionBadge = document.createElement("span");
      versionBadge.style.cssText = "background:#3a3a50;color:#aaa;border-radius:4px;padding:1px 6px;font-size:10px;";
      versionBadge.textContent = `v${lib.version || "1.0"}`;
      header.appendChild(versionBadge);
      card.appendChild(header);
      
      const info = document.createElement("div");
      info.style.cssText = "font-size:11px;color:#888;margin-bottom:8px;";
      info.textContent = `${lib.component_count} component${lib.component_count !== 1 ? "s" : ""}`;
      card.appendChild(info);
      
      const actions = document.createElement("div");
      actions.style.cssText = "display:flex;gap:6px;";
      
      const syncBtn = createSmallButton("↻ Sync", "#4a90d9", () => syncLibrary(lib.id));
      const unlinkBtn = createSmallButton("✕ Unlink", "#e06c75", () => unlinkLibrary(lib.id, lib.name));
      actions.appendChild(syncBtn);
      actions.appendChild(unlinkBtn);
      card.appendChild(actions);
      
      wrapper.appendChild(card);
    }
  }
  
  container.appendChild(wrapper);
}

function createButton(text: string, color: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = text;
  btn.style.cssText = `flex:1;padding:6px 12px;background:${color};color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;`;
  btn.onmouseenter = () => btn.style.opacity = "0.85";
  btn.onmouseleave = () => btn.style.opacity = "1";
  btn.onclick = onClick;
  return btn;
}

function createSmallButton(text: string, color: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = text;
  btn.style.cssText = `padding:3px 8px;background:transparent;color:${color};border:1px solid ${color};border-radius:4px;cursor:pointer;font-size:11px;`;
  btn.onmouseenter = () => btn.style.background = color + "22";
  btn.onmouseleave = () => btn.style.background = "transparent";
  btn.onclick = onClick;
  return btn;
}

function importLibrary() {
  if (!engine) return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const json = reader.result as string;
      try {
        // Validate JSON
        JSON.parse(json);
        const ok = engine!.import_component_library(json);
        if (ok) {
          alert(`Library imported successfully!`);
          onUpdate?.();
        } else {
          alert("Failed to import library. Invalid format.");
        }
      } catch {
        alert("Failed to parse library JSON file.");
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function exportLibrary() {
  if (!engine) return;
  
  // Get all components
  const compsJson = engine.get_components();
  const comps: Array<{id: number; name: string}> = JSON.parse(compsJson);
  
  if (comps.length === 0) {
    alert("No components to export. Create components first.");
    return;
  }
  
  const name = prompt("Library name:", "My Library");
  if (!name) return;
  const version = prompt("Version:", "1.0.0");
  if (!version) return;
  
  const ids = comps.map(c => c.id);
  const idsJson = JSON.stringify(ids);
  const libJson = engine.export_component_library(name, version, idsJson);
  
  // Download
  const blob = new Blob([libJson], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/\s+/g, "-").toLowerCase()}-v${version}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function syncLibrary(libraryId: string) {
  if (!engine) return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const json = reader.result as string;
      try {
        JSON.parse(json);
        const synced = engine!.sync_library(libraryId, json);
        alert(`Synced ${synced} component(s).`);
        onUpdate?.();
      } catch {
        alert("Failed to parse library JSON file.");
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function unlinkLibrary(libraryId: string, name: string) {
  if (!engine) return;
  if (!confirm(`Unlink library "${name}"? Imported components will remain as local copies.`)) return;
  engine.unlink_library(libraryId);
  onUpdate?.();
}
