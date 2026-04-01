import type { Editor } from "../editor";

interface CompInfo {
  id: number;
  name: string;
  variant_count: number;
}

interface InstanceInfo {
  node_id: number;
  node_name: string;
  component_id: number;
  component_name: string;
}

interface SwapSuggestion {
  id: number;
  name: string;
  score: number;
  reason: string;
}

/**
 * Component Search & Swap modal.
 * - Search components by name
 * - View all instances of a component
 * - Swap selected instances to a different master component
 * - Smart suggestions for selected instance nodes (by size/structure similarity)
 */
export function openComponentSwapModal(editor: Editor) {
  // Remove existing
  document.getElementById("comp-swap-modal")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "comp-swap-modal";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;";
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  const modal = document.createElement("div");
  modal.style.cssText = "background:#1e1e2e;border-radius:12px;width:520px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.5);overflow:hidden;";

  // Header
  const header = document.createElement("div");
  header.style.cssText = "padding:16px 20px;border-bottom:1px solid #333;display:flex;align-items:center;justify-content:space-between;";
  const title = document.createElement("div");
  title.textContent = "Component Search & Swap";
  title.style.cssText = "font-size:14px;font-weight:600;color:#eee;";
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = "background:none;border:none;color:#888;font-size:16px;cursor:pointer;padding:4px;";
  closeBtn.onclick = () => overlay.remove();
  header.appendChild(title);
  header.appendChild(closeBtn);
  modal.appendChild(header);

  // Search
  const searchBox = document.createElement("div");
  searchBox.style.cssText = "padding:12px 20px;border-bottom:1px solid #333;";
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search components…";
  searchInput.style.cssText = "width:100%;background:#141422;border:1px solid #444;border-radius:8px;padding:8px 12px;color:#ddd;font-size:13px;outline:none;box-sizing:border-box;";
  searchBox.appendChild(searchInput);
  modal.appendChild(searchBox);

  // Suggestions area (shown when an instance is selected)
  const suggestionsArea = document.createElement("div");
  suggestionsArea.style.cssText = "display:none;padding:12px 20px;border-bottom:1px solid #333;";
  modal.appendChild(suggestionsArea);

  // Content area
  const content = document.createElement("div");
  content.style.cssText = "flex:1;overflow-y:auto;padding:12px 20px;";
  modal.appendChild(content);

  // State
  let selectedCompId: number | null = null;
  let query = "";

  // Check if current selection is an instance and show suggestions
  function renderSuggestions() {
    suggestionsArea.innerHTML = "";
    suggestionsArea.style.display = "none";

    const sel = editor.engine.get_selection();
    if (!sel || sel.length !== 1) return;

    const nodeId = Number(sel[0]);
    let suggestions: SwapSuggestion[] = [];
    try {
      const fn = (editor.engine as any).suggest_component_swaps;
      if (!fn) return;
      const json = (editor.engine as any).suggest_component_swaps(BigInt(nodeId), 5);
      suggestions = JSON.parse(json || "[]");
    } catch { return; }

    if (suggestions.length === 0) return;

    suggestionsArea.style.display = "block";

    const label = document.createElement("div");
    label.textContent = "✨ Suggested swaps for selected instance";
    label.style.cssText = "font-size:12px;font-weight:600;color:#c4b5fd;margin-bottom:8px;";
    suggestionsArea.appendChild(label);

    for (const s of suggestions) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;cursor:pointer;transition:background 0.15s;margin-bottom:2px;";
      row.addEventListener("mouseenter", () => row.style.background = "#2a2a3e");
      row.addEventListener("mouseleave", () => row.style.background = "");

      const icon = document.createElement("div");
      icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`;

      const nameEl = document.createElement("span");
      nameEl.textContent = s.name;
      nameEl.style.cssText = "font-size:12px;color:#eee;flex:1;";

      const reasonEl = document.createElement("span");
      reasonEl.textContent = s.reason;
      reasonEl.style.cssText = "font-size:10px;color:#888;margin-right:4px;";

      const scoreEl = document.createElement("span");
      scoreEl.textContent = `${s.score}`;
      scoreEl.style.cssText = "font-size:10px;color:#666;background:#1a1a2e;padding:2px 6px;border-radius:3px;min-width:24px;text-align:center;";

      const swapBtn = document.createElement("button");
      swapBtn.textContent = "Swap";
      swapBtn.style.cssText = "background:#5b21b6;border:none;color:#fff;font-size:11px;padding:3px 10px;border-radius:4px;cursor:pointer;";
      swapBtn.onclick = (e) => {
        e.stopPropagation();
        editor.engine.push_undo();
        if (editor.engine.swap_instance_component(nodeId, s.id)) {
          editor.requestRender();
          renderSuggestions();
        }
      };

      row.append(icon, nameEl, reasonEl, scoreEl, swapBtn);
      suggestionsArea.appendChild(row);
    }
  }

  renderSuggestions();

  function getComponents(): CompInfo[] {
    try {
      return JSON.parse(editor.engine.get_components() || "[]");
    } catch { return []; }
  }

  function getInstances(compId: number): InstanceInfo[] {
    try {
      return JSON.parse(editor.engine.find_instances(compId) || "[]");
    } catch { return []; }
  }

  function render() {
    content.innerHTML = "";
    const comps = getComponents().filter(c => !query || c.name.toLowerCase().includes(query.toLowerCase()));

    if (comps.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = query ? "No components match your search." : "No components defined.";
      empty.style.cssText = "color:#666;font-size:12px;text-align:center;padding:32px 0;";
      content.appendChild(empty);
      return;
    }

    // Selected component detail view
    if (selectedCompId !== null) {
      const comp = comps.find(c => c.id === selectedCompId);
      if (!comp) { selectedCompId = null; render(); return; }

      // Back button
      const back = document.createElement("button");
      back.textContent = "← All Components";
      back.style.cssText = "background:none;border:none;color:#7c8aff;font-size:12px;cursor:pointer;padding:0 0 12px 0;";
      back.onclick = () => { selectedCompId = null; render(); };
      content.appendChild(back);

      // Component header
      const compHeader = document.createElement("div");
      compHeader.style.cssText = "display:flex;align-items:center;gap:10px;padding:12px;background:#252540;border-radius:8px;margin-bottom:12px;";
      const compIcon = document.createElement("div");
      compIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`;
      const compName = document.createElement("div");
      compName.textContent = comp.name;
      compName.style.cssText = "font-size:14px;font-weight:600;color:#eee;flex:1;";
      const varBadge = document.createElement("span");
      varBadge.textContent = `${comp.variant_count} variant${comp.variant_count !== 1 ? "s" : ""}`;
      varBadge.style.cssText = "font-size:11px;color:#888;background:#1a1a2e;padding:3px 8px;border-radius:4px;";
      compHeader.append(compIcon, compName, varBadge);
      content.appendChild(compHeader);

      // Instances list
      const instances = getInstances(comp.id);
      const instLabel = document.createElement("div");
      instLabel.textContent = `${instances.length} instance${instances.length !== 1 ? "s" : ""} in scene`;
      instLabel.style.cssText = "font-size:12px;color:#888;margin-bottom:8px;";
      content.appendChild(instLabel);

      if (instances.length > 0) {
        for (const inst of instances) {
          const row = document.createElement("div");
          row.style.cssText = "display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;cursor:pointer;transition:background 0.15s;margin-bottom:2px;";
          row.addEventListener("mouseenter", () => row.style.background = "#2a2a3e");
          row.addEventListener("mouseleave", () => row.style.background = "");

          const instName = document.createElement("span");
          instName.textContent = inst.node_name;
          instName.style.cssText = "font-size:12px;color:#ddd;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

          const selectBtn = document.createElement("button");
          selectBtn.textContent = "Select";
          selectBtn.style.cssText = "background:#333;border:1px solid #555;color:#ccc;font-size:11px;padding:3px 10px;border-radius:4px;cursor:pointer;";
          selectBtn.onclick = (e) => {
            e.stopPropagation();
            editor.engine.set_selection(new Uint32Array([inst.node_id]));
            editor.requestRender();
          };

          row.append(instName, selectBtn);
          content.appendChild(row);
        }
      }

      // Swap section
      const swapSection = document.createElement("div");
      swapSection.style.cssText = "margin-top:16px;padding-top:16px;border-top:1px solid #333;";
      const swapTitle = document.createElement("div");
      swapTitle.textContent = "Swap to another component";
      swapTitle.style.cssText = "font-size:13px;font-weight:600;color:#eee;margin-bottom:8px;";
      swapSection.appendChild(swapTitle);

      const otherComps = getComponents().filter(c => c.id !== comp.id);
      if (otherComps.length === 0) {
        const noOther = document.createElement("div");
        noOther.textContent = "No other components to swap to.";
        noOther.style.cssText = "color:#666;font-size:12px;padding:8px 0;";
        swapSection.appendChild(noOther);
      } else {
        for (const target of otherComps) {
          const row = document.createElement("div");
          row.style.cssText = "display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;cursor:pointer;transition:background 0.15s;margin-bottom:2px;";
          row.addEventListener("mouseenter", () => row.style.background = "#2a2a3e");
          row.addEventListener("mouseleave", () => row.style.background = "");

          const tIcon = document.createElement("div");
          tIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`;
          const tName = document.createElement("span");
          tName.textContent = target.name;
          tName.style.cssText = "font-size:12px;color:#ddd;flex:1;";

          const swapBtn = document.createElement("button");
          swapBtn.textContent = "Swap All";
          swapBtn.style.cssText = "background:#5b21b6;border:none;color:#fff;font-size:11px;padding:4px 12px;border-radius:4px;cursor:pointer;";
          swapBtn.onclick = (e) => {
            e.stopPropagation();
            const count = swapAllInstances(editor, comp.id, target.id);
            if (count > 0) {
              editor.requestRender();
              render(); // refresh
            }
          };

          const swapSelBtn = document.createElement("button");
          swapSelBtn.textContent = "Swap Selected";
          swapSelBtn.style.cssText = "background:#333;border:1px solid #5b21b6;color:#c4b5fd;font-size:11px;padding:4px 12px;border-radius:4px;cursor:pointer;";
          swapSelBtn.onclick = (e) => {
            e.stopPropagation();
            const count = swapSelectedInstances(editor, comp.id, target.id);
            if (count > 0) {
              editor.requestRender();
              render();
            }
          };

          row.append(tIcon, tName, swapSelBtn, swapBtn);
          content.appendChild(row);
          swapSection.appendChild(row);
        }
      }
      content.appendChild(swapSection);
      return;
    }

    // Component list view
    for (const comp of comps) {
      const instances = getInstances(comp.id);
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;cursor:pointer;transition:background 0.15s;margin-bottom:4px;";
      row.addEventListener("mouseenter", () => row.style.background = "#252540");
      row.addEventListener("mouseleave", () => row.style.background = "");
      row.onclick = () => { selectedCompId = comp.id; render(); };

      const icon = document.createElement("div");
      icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`;
      icon.style.cssText = "flex-shrink:0;display:flex;align-items:center;";

      const info = document.createElement("div");
      info.style.cssText = "flex:1;min-width:0;";
      const nameEl = document.createElement("div");
      nameEl.textContent = comp.name;
      nameEl.style.cssText = "font-size:13px;color:#eee;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      const meta = document.createElement("div");
      meta.textContent = `${instances.length} instance${instances.length !== 1 ? "s" : ""} · ${comp.variant_count} variant${comp.variant_count !== 1 ? "s" : ""}`;
      meta.style.cssText = "font-size:11px;color:#666;margin-top:2px;";
      info.append(nameEl, meta);

      const arrow = document.createElement("span");
      arrow.textContent = "›";
      arrow.style.cssText = "color:#555;font-size:18px;flex-shrink:0;";

      row.append(icon, info, arrow);
      content.appendChild(row);
    }
  }

  searchInput.addEventListener("input", () => {
    query = searchInput.value;
    render();
  });

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  searchInput.focus();
  render();

  // Escape to close
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
    }
  };
  document.addEventListener("keydown", onKey);
}

function swapAllInstances(editor: Editor, fromCompId: number, toCompId: number): number {
  let instances: InstanceInfo[];
  try {
    instances = JSON.parse(editor.engine.find_instances(fromCompId) || "[]");
  } catch { return 0; }

  let count = 0;
  editor.engine.push_undo();
  for (const inst of instances) {
    if (editor.engine.swap_instance_component(inst.node_id, toCompId)) {
      count++;
    }
  }
  return count;
}

function swapSelectedInstances(editor: Editor, fromCompId: number, toCompId: number): number {
  const sel = editor.engine.get_selection();
  if (!sel || sel.length === 0) return 0;

  let count = 0;
  editor.engine.push_undo();
  for (let i = 0; i < sel.length; i++) {
    const nodeId = sel[i];
    // Verify it's an instance of the source component
    try {
      const info = JSON.parse(editor.engine.get_instance_component_info(nodeId) || "null");
      if (info && info.component_id === fromCompId) {
        if (editor.engine.swap_instance_component(nodeId, toCompId)) {
          count++;
        }
      }
    } catch { /* skip */ }
  }
  return count;
}
