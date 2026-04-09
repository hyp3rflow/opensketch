import type { Editor } from "../editor";
import { setupVariablesBulkEdit } from "./variables-bulk-edit";
import { applyThemeMode, detectActiveThemeMode, listThemeModeOptions } from "./variable-theme-modes";

interface VarMode { id: number; name: string; }
interface VarVariable {
  id: number; name: string; value_type: string;
  values_by_mode: Record<string, { Color?: string; Number?: number; String?: string; Boolean?: boolean }>;
}
interface VarCollection {
  id: number; name: string; modes: VarMode[];
  active_mode_id: number; variables: VarVariable[];
}

export function setupVariablesPanel(container: HTMLElement, editor: Editor) {
  let selectedCollectionId: number | null = null;
  let bulkEditInstance: ReturnType<typeof setupVariablesBulkEdit> | null = null;
  let inBulkEditMode = false;
  let variableSearchQuery = "";
  let variableTypeFilter = "All";
  let usageHeatmapEnabled = false;
  let usageHeatmapCanvas: HTMLCanvasElement | null = null;

  function clearUsageHeatmap() {
    if (usageHeatmapCanvas) {
      usageHeatmapCanvas.remove();
      usageHeatmapCanvas = null;
    }
  }

  function renderUsageHeatmap(collections: VarCollection[]) {
    if (!usageHeatmapEnabled) {
      clearUsageHeatmap();
      return;
    }
    const mainCanvas = (editor as any).canvas as HTMLCanvasElement | undefined;
    if (!mainCanvas || !mainCanvas.parentElement) return;

    if (!usageHeatmapCanvas) {
      usageHeatmapCanvas = document.createElement("canvas");
      usageHeatmapCanvas.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;z-index:55;";
      mainCanvas.parentElement.appendChild(usageHeatmapCanvas);
    }

    usageHeatmapCanvas.width = mainCanvas.width;
    usageHeatmapCanvas.height = mainCanvas.height;
    usageHeatmapCanvas.style.width = `${mainCanvas.clientWidth}px`;
    usageHeatmapCanvas.style.height = `${mainCanvas.clientHeight}px`;

    const ctx = usageHeatmapCanvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, usageHeatmapCanvas.width, usageHeatmapCanvas.height);

    const usageByNode = new Map<number, number>();
    for (const col of collections) {
      for (const v of col.variables || []) {
        let list: Array<{ node_id?: number }> = [];
        try {
          list = JSON.parse((editor.engine as any).get_variable_usages?.(BigInt(col.id), BigInt(v.id)) || "[]");
        } catch {
          list = [];
        }
        for (const entry of list) {
          const nodeId = Number(entry?.node_id || 0);
          if (nodeId <= 0) continue;
          usageByNode.set(nodeId, (usageByNode.get(nodeId) || 0) + 1);
        }
      }
    }

    if (usageByNode.size === 0) return;

    const zoom = Number(editor.engine.get_zoom() || 1);
    const panX = Number(editor.engine.get_pan_x() || 0);
    const panY = Number(editor.engine.get_pan_y() || 0);
    const maxCount = Math.max(1, ...Array.from(usageByNode.values()));

    usageByNode.forEach((count, nodeId) => {
      let node: any = null;
      try { node = JSON.parse(editor.engine.get_node_json(BigInt(nodeId)) || "null"); } catch { node = null; }
      if (!node || node.visible === false) return;

      const x = Number(node.x || 0) * zoom + panX;
      const y = Number(node.y || 0) * zoom + panY;
      const w = Math.max(2, Number(node.width || 0) * zoom);
      const h = Math.max(2, Number(node.height || 0) * zoom);
      const intensity = Math.min(1, count / maxCount);
      const hue = 220 - (220 * intensity);

      ctx.fillStyle = `hsla(${hue}, 95%, 56%, ${0.12 + intensity * 0.32})`;
      ctx.strokeStyle = `hsla(${hue}, 95%, 62%, ${0.36 + intensity * 0.5})`;
      ctx.lineWidth = Math.max(1, Math.min(3, zoom * 0.8));
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, w - 1), Math.max(1, h - 1));
    });
  }

  function enterBulkEdit(collectionId: number) {
    inBulkEditMode = true;
    clearUsageHeatmap();
    container.innerHTML = "";
    if (bulkEditInstance) bulkEditInstance.destroy();
    bulkEditInstance = setupVariablesBulkEdit(container, editor, collectionId, () => {
      inBulkEditMode = false;
      if (bulkEditInstance) { bulkEditInstance.destroy(); bulkEditInstance = null; }
      refresh();
    });
  }

  function refresh() {
    if (inBulkEditMode && bulkEditInstance) {
      clearUsageHeatmap();
      bulkEditInstance.refresh();
      return;
    }
    container.innerHTML = "";
    const collections: VarCollection[] = JSON.parse(editor.engine.get_collections() || "[]");

    // Header
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;";
    const title = document.createElement("div");
    title.style.cssText = "font-size:12px;font-weight:600;color:#ccc;";
    title.textContent = "Variable Collections";
    header.appendChild(title);

    const addBtn = document.createElement("button");
    addBtn.style.cssText = "background:#4f46e5;border:none;color:#fff;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer;";
    addBtn.textContent = "+ Collection";
    addBtn.addEventListener("click", () => {
      const name = prompt("Collection name:", `Collection ${collections.length + 1}`);
      if (!name) return;
      editor.engine.push_undo();
      const id = editor.engine.create_collection(name);
      selectedCollectionId = Number(id);
      refresh();
    });
    header.appendChild(addBtn);
    container.appendChild(header);

    if (collections.length === 0) {
      clearUsageHeatmap();
      const empty = document.createElement("div");
      empty.style.cssText = "color:#555;font-size:11px;text-align:center;padding:40px 0;";
      empty.textContent = "No variable collections yet";
      container.appendChild(empty);
      return;
    }

    // Collection selector
    if (!selectedCollectionId || !collections.find(c => c.id === selectedCollectionId)) {
      selectedCollectionId = collections[0].id;
    }

    const selRow = document.createElement("div");
    selRow.style.cssText = "display:flex;gap:4px;margin-bottom:10px;";
    const sel = document.createElement("select");
    sel.style.cssText = "flex:1;background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#ccc;font-size:11px;padding:4px;";
    for (const c of collections) {
      const opt = document.createElement("option");
      opt.value = String(c.id);
      opt.textContent = c.name;
      if (c.id === selectedCollectionId) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener("change", () => { selectedCollectionId = Number(sel.value); refresh(); });
    selRow.appendChild(sel);

    const renBtn = document.createElement("button");
    renBtn.style.cssText = "background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#888;cursor:pointer;font-size:11px;padding:4px 8px;";
    renBtn.textContent = "✏";
    renBtn.title = "Rename collection";
    renBtn.addEventListener("click", () => {
      const c = collections.find(c => c.id === selectedCollectionId);
      const name = prompt("Rename:", c?.name);
      if (!name) return;
      editor.engine.push_undo();
      editor.engine.rename_collection(BigInt(selectedCollectionId!), name);
      refresh();
    });
    selRow.appendChild(renBtn);

    const delBtn = document.createElement("button");
    delBtn.style.cssText = "background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#f87171;cursor:pointer;font-size:11px;padding:4px 8px;";
    delBtn.textContent = "✕";
    delBtn.title = "Delete collection";
    delBtn.addEventListener("click", () => {
      if (!confirm("Delete this collection?")) return;
      editor.engine.push_undo();
      editor.engine.delete_collection(BigInt(selectedCollectionId!));
      selectedCollectionId = null;
      refresh();
    });
    selRow.appendChild(delBtn);

    const tableBtn = document.createElement("button");
    tableBtn.style.cssText = "background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#60a5fa;cursor:pointer;font-size:11px;padding:4px 8px;";
    tableBtn.textContent = "⊞";
    tableBtn.title = "Table view (bulk edit)";
    tableBtn.addEventListener("click", () => {
      if (selectedCollectionId) enterBulkEdit(selectedCollectionId);
    });
    selRow.appendChild(tableBtn);

    container.appendChild(selRow);

    const col = collections.find(c => c.id === selectedCollectionId)!;

    const brokenBindings: Array<{ node_id: number; property: string; reason: string; suggestion?: { collection_id: number; variable_id: number } }> = (() => {
      try { return JSON.parse((editor.engine as any).get_broken_variable_bindings?.() || "[]"); }
      catch { return []; }
    })();

    // Scope section
    const scopeSection = document.createElement("div");
    scopeSection.style.cssText = "margin-bottom:12px;background:#1e1e1e;border-radius:6px;padding:8px;";
    const scopeLabel = document.createElement("div");
    scopeLabel.style.cssText = "font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:6px;";
    scopeLabel.textContent = "Scope";
    scopeSection.appendChild(scopeLabel);

    const scopeJson = editor.engine.get_collection_scope(BigInt(col.id));
    let currentScope: string = "Global";
    let scopeIds: number[] = [];
    try {
      const parsed = JSON.parse(scopeJson);
      if (parsed === "Global") { currentScope = "Global"; }
      else if (parsed && parsed.Pages) { currentScope = "Pages"; scopeIds = parsed.Pages; }
      else if (parsed && parsed.Nodes) { currentScope = "Nodes"; scopeIds = parsed.Nodes; }
    } catch {}

    const scopeSelect = document.createElement("select");
    scopeSelect.style.cssText = "width:100%;background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#ccc;font-size:11px;padding:4px;margin-bottom:6px;";
    for (const opt of ["Global", "Pages", "Nodes"]) {
      const o = document.createElement("option");
      o.value = opt; o.textContent = opt === "Global" ? "Global (all pages)" : opt === "Pages" ? "Specific pages" : "Specific frames";
      if (opt === currentScope) o.selected = true;
      scopeSelect.appendChild(o);
    }
    scopeSelect.addEventListener("change", () => {
      editor.engine.push_undo();
      const val = scopeSelect.value;
      if (val === "Global") {
        editor.engine.set_collection_scope(BigInt(col.id), '"Global"');
      } else if (val === "Pages") {
        editor.engine.set_collection_scope(BigInt(col.id), '{"Pages":[]}');
      } else {
        editor.engine.set_collection_scope(BigInt(col.id), '{"Nodes":[]}');
      }
      refresh();
    });
    scopeSection.appendChild(scopeSelect);

    if (currentScope === "Pages") {
      // Show page checkboxes
      const pagesJson = JSON.parse(editor.engine.get_pages());
      const pagesRow = document.createElement("div");
      pagesRow.style.cssText = "display:flex;flex-direction:column;gap:4px;";
      for (const pg of pagesJson) {
        const label = document.createElement("label");
        label.style.cssText = "display:flex;align-items:center;gap:6px;font-size:11px;color:#aaa;cursor:pointer;";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = scopeIds.includes(pg.id);
        cb.addEventListener("change", () => {
          const newIds = scopeIds.filter(id => id !== pg.id);
          if (cb.checked) newIds.push(pg.id);
          scopeIds = newIds;
          editor.engine.push_undo();
          editor.engine.set_collection_scope(BigInt(col.id), JSON.stringify({ Pages: scopeIds }));
        });
        label.appendChild(cb);
        label.appendChild(document.createTextNode(pg.name));
        pagesRow.appendChild(label);
      }
      scopeSection.appendChild(pagesRow);
    } else if (currentScope === "Nodes") {
      const idsDisplay = document.createElement("div");
      idsDisplay.style.cssText = "font-size:10px;color:#666;margin-bottom:4px;";
      idsDisplay.textContent = scopeIds.length > 0 ? `Scoped to ${scopeIds.length} frame(s)` : "No frames selected";
      scopeSection.appendChild(idsDisplay);

      const addFrameBtn = document.createElement("button");
      addFrameBtn.style.cssText = "background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#888;cursor:pointer;font-size:10px;padding:3px 8px;";
      addFrameBtn.textContent = "+ Add selected frame";
      addFrameBtn.addEventListener("click", () => {
        const sel = Array.from(editor.engine.get_selection()).map(Number);
        if (sel.length === 0) { alert("Select a frame first"); return; }
        editor.engine.push_undo();
        const newIds = [...new Set([...scopeIds, ...sel])];
        editor.engine.set_collection_scope(BigInt(col.id), JSON.stringify({ Nodes: newIds }));
        refresh();
      });
      scopeSection.appendChild(addFrameBtn);

      if (scopeIds.length > 0) {
        const list = document.createElement("div");
        list.style.cssText = "margin-top:6px;display:flex;flex-direction:column;gap:2px;";
        for (const nid of scopeIds) {
          const row = document.createElement("div");
          row.style.cssText = "display:flex;align-items:center;gap:4px;font-size:10px;color:#aaa;";
          const nameStr = editor.engine.get_node_name(BigInt(nid)) || `Node ${nid}`;
          row.textContent = nameStr;
          const rmBtn = document.createElement("button");
          rmBtn.style.cssText = "background:none;border:none;color:#f87171;cursor:pointer;font-size:10px;margin-left:auto;";
          rmBtn.textContent = "✕";
          rmBtn.addEventListener("click", () => {
            editor.engine.push_undo();
            const newIds = scopeIds.filter(id => id !== nid);
            editor.engine.set_collection_scope(BigInt(col.id), JSON.stringify({ Nodes: newIds }));
            refresh();
          });
          row.appendChild(rmBtn);
          list.appendChild(row);
        }
        scopeSection.appendChild(list);
      }
    }

    container.appendChild(scopeSection);

    // Inspector
    const inspector = document.createElement("div");
    inspector.style.cssText = "margin-bottom:12px;background:#1b1d24;border:1px solid #2f3545;border-radius:6px;padding:8px;";
    const brokenTitle = document.createElement("div");
    brokenTitle.style.cssText = "display:flex;align-items:center;justify-content:space-between;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:6px;";
    brokenTitle.innerHTML = `<span>Variables Inspector</span><span style=\"color:${brokenBindings.length > 0 ? "#f59e0b" : "#64748b"}\">Broken ${brokenBindings.length}</span>`;
    inspector.appendChild(brokenTitle);

    const heatmapRow = document.createElement("div");
    heatmapRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;";
    const heatmapLabel = document.createElement("label");
    heatmapLabel.style.cssText = "display:flex;align-items:center;gap:6px;font-size:10px;color:#93c5fd;cursor:pointer;";
    const heatmapCb = document.createElement("input");
    heatmapCb.type = "checkbox";
    heatmapCb.checked = usageHeatmapEnabled;
    heatmapCb.addEventListener("change", () => {
      usageHeatmapEnabled = heatmapCb.checked;
      renderUsageHeatmap(collections);
      editor.requestRender();
    });
    heatmapLabel.appendChild(heatmapCb);
    heatmapLabel.appendChild(document.createTextNode("Usage heatmap overlay"));
    heatmapRow.appendChild(heatmapLabel);
    inspector.appendChild(heatmapRow);

    if (brokenBindings.length > 0) {
      const list = document.createElement("div");
      list.style.cssText = "display:flex;flex-direction:column;gap:4px;max-height:110px;overflow:auto;margin-bottom:6px;";
      for (const b of brokenBindings.slice(0, 20)) {
        const row = document.createElement("div");
        row.style.cssText = "font-size:10px;color:#fca5a5;background:#2a1f1f;border:1px solid #3f2a2a;border-radius:4px;padding:4px 6px;";
        const hasSuggestion = !!b.suggestion;
        row.textContent = `Node ${b.node_id || "?"} · ${b.property} · ${b.reason}${hasSuggestion ? " · recoverable" : ""}`;
        list.appendChild(row);
      }
      inspector.appendChild(list);

      const actions = document.createElement("div");
      actions.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;";

      const recoverableCount = brokenBindings.filter(b => !!b.suggestion).length;
      if (recoverableCount > 0) {
        const recoverBtn = document.createElement("button");
        recoverBtn.style.cssText = "background:#1f3b2a;border:1px solid #166534;border-radius:4px;color:#86efac;cursor:pointer;font-size:10px;padding:4px 8px;";
        recoverBtn.textContent = `Auto-recover ${recoverableCount}`;
        recoverBtn.addEventListener("click", () => {
          editor.engine.push_undo();
          const recovered = Number((editor.engine as any).recover_broken_variable_bindings?.() || 0);
          if (recovered > 0) editor.engine.apply_variables();
          editor.requestRender();
          refresh();
        });
        actions.appendChild(recoverBtn);
      }

      const cleanBtn = document.createElement("button");
      cleanBtn.style.cssText = "background:#3b1f1f;border:1px solid #7f1d1d;border-radius:4px;color:#fca5a5;cursor:pointer;font-size:10px;padding:4px 8px;";
      cleanBtn.textContent = "Clean broken bindings";
      cleanBtn.addEventListener("click", () => {
        editor.engine.push_undo();
        const removed = Number((editor.engine as any).cleanup_broken_variable_bindings?.() || 0);
        if (removed > 0) editor.engine.apply_variables();
        refresh();
      });
      actions.appendChild(cleanBtn);
      inspector.appendChild(actions);
    } else {
      const ok = document.createElement("div");
      ok.style.cssText = "font-size:11px;color:#6ee7b7;";
      ok.textContent = "No broken bindings detected.";
      inspector.appendChild(ok);
    }
    container.appendChild(inspector);

    // Modes
    const modesSection = document.createElement("div");
    modesSection.style.cssText = "margin-bottom:12px;";
    const modesHeader = document.createElement("div");
    modesHeader.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;";
    const modesTitle = document.createElement("span");
    modesTitle.style.cssText = "font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;";
    modesTitle.textContent = "Modes";
    modesHeader.appendChild(modesTitle);

    const addModeBtn = document.createElement("button");
    addModeBtn.style.cssText = "background:none;border:1px solid #444;border-radius:4px;color:#888;cursor:pointer;font-size:10px;padding:2px 6px;";
    addModeBtn.textContent = "+ Mode";
    addModeBtn.addEventListener("click", () => {
      const name = prompt("Mode name:", `Mode ${col.modes.length + 1}`);
      if (!name) return;
      editor.engine.push_undo();
      editor.engine.var_add_mode(BigInt(col.id), name);
      refresh();
    });
    modesHeader.appendChild(addModeBtn);
    modesSection.appendChild(modesHeader);

    const modesRow = document.createElement("div");
    modesRow.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;";
    for (const mode of col.modes) {
      const mBtn = document.createElement("button");
      const isActive = mode.id === col.active_mode_id;
      mBtn.style.cssText = `padding:4px 10px;font-size:11px;border-radius:4px;cursor:pointer;border:1px solid ${isActive ? "#4f46e5" : "#444"};background:${isActive ? "#4f46e520" : "#2a2a2a"};color:${isActive ? "#818cf8" : "#aaa"};`;
      mBtn.textContent = mode.name;
      mBtn.addEventListener("click", () => {
        editor.engine.push_undo();
        editor.engine.set_active_mode(BigInt(col.id), BigInt(mode.id));
        editor.engine.apply_variables();
        editor.requestRender();
        refresh();
      });
      mBtn.addEventListener("dblclick", () => {
        const name = prompt("Rename mode:", mode.name);
        if (!name) return;
        editor.engine.push_undo();
        editor.engine.var_rename_mode(BigInt(col.id), BigInt(mode.id), name);
        refresh();
      });
      mBtn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (col.modes.length <= 1) return;
        if (!confirm(`Delete mode "${mode.name}"?`)) return;
        editor.engine.push_undo();
        editor.engine.var_delete_mode(BigInt(col.id), BigInt(mode.id));
        refresh();
      });
      modesRow.appendChild(mBtn);
    }
    modesSection.appendChild(modesRow);
    container.appendChild(modesSection);

    // Theme modes (Light / Dark / custom names)
    const themeOptions = listThemeModeOptions(editor);
    if (themeOptions.length > 0) {
      const themeSection = document.createElement("div");
      themeSection.style.cssText = "margin-bottom:12px;background:#1e2433;border:1px solid #2c3550;border-radius:6px;padding:8px;";

      const themeHeader = document.createElement("div");
      themeHeader.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;";
      const themeTitle = document.createElement("span");
      themeTitle.style.cssText = "font-size:10px;color:#93c5fd;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;";
      themeTitle.textContent = "Theme Mode Set";
      themeHeader.appendChild(themeTitle);

      const activeTheme = detectActiveThemeMode(editor);
      const activeBadge = document.createElement("span");
      activeBadge.style.cssText = "font-size:10px;color:#a5b4fc;";
      activeBadge.textContent = activeTheme ? `Active: ${activeTheme}` : "Active: mixed";
      themeHeader.appendChild(activeBadge);
      themeSection.appendChild(themeHeader);

      const chips = document.createElement("div");
      chips.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;";
      for (const opt of themeOptions) {
        const chip = document.createElement("button");
        const isActive = activeTheme === opt.id;
        chip.style.cssText = `padding:4px 10px;font-size:11px;border-radius:999px;cursor:pointer;border:1px solid ${isActive ? "#4f46e5" : "#445"};background:${isActive ? "#4f46e533" : "#273043"};color:${isActive ? "#c4b5fd" : "#cbd5e1"};`;
        chip.textContent = opt.label;
        chip.addEventListener("click", () => {
          editor.engine.push_undo();
          applyThemeMode(editor, opt.id);
          refresh();
        });
        chips.appendChild(chip);
      }
      themeSection.appendChild(chips);
      container.appendChild(themeSection);
    }

    // Variables table
    const varsSection = document.createElement("div");
    const varsHeader = document.createElement("div");
    varsHeader.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;";
    const varsTitle = document.createElement("span");
    varsTitle.style.cssText = "font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;";
    varsTitle.textContent = "Variables";
    varsHeader.appendChild(varsTitle);

    const addVarBtn = document.createElement("button");
    addVarBtn.style.cssText = "background:none;border:1px solid #444;border-radius:4px;color:#888;cursor:pointer;font-size:10px;padding:2px 6px;";
    addVarBtn.textContent = "+ Variable";
    addVarBtn.addEventListener("click", () => {
      const name = prompt("Variable name:");
      if (!name) return;
      const type = prompt("Type (Color, Number, String, Boolean):", "Color");
      if (!type) return;
      editor.engine.push_undo();
      editor.engine.create_variable(BigInt(col.id), name, type);
      refresh();
    });
    varsHeader.appendChild(addVarBtn);
    varsSection.appendChild(varsHeader);

    const filterRow = document.createElement("div");
    filterRow.style.cssText = "display:flex;gap:6px;margin-bottom:8px;";

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search variables...";
    searchInput.value = variableSearchQuery;
    searchInput.style.cssText = "flex:1;background:#2a2a2a;border:1px solid #3a3a3a;border-radius:4px;color:#ccc;font-size:11px;padding:4px 8px;";
    searchInput.addEventListener("input", () => {
      variableSearchQuery = searchInput.value;
      refresh();
    });
    filterRow.appendChild(searchInput);

    const typeFilter = document.createElement("select");
    typeFilter.style.cssText = "width:90px;background:#2a2a2a;border:1px solid #3a3a3a;border-radius:4px;color:#ccc;font-size:11px;padding:4px;";
    for (const t of ["All", "Color", "Number", "String", "Boolean"]) {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      if (t === variableTypeFilter) opt.selected = true;
      typeFilter.appendChild(opt);
    }
    typeFilter.addEventListener("change", () => {
      variableTypeFilter = typeFilter.value;
      refresh();
    });
    filterRow.appendChild(typeFilter);

    varsSection.appendChild(filterRow);

    const query = variableSearchQuery.trim().toLowerCase();
    const filteredVariables = col.variables.filter((v) => {
      const typeMatch = variableTypeFilter === "All" || v.value_type === variableTypeFilter;
      if (!typeMatch) return false;
      if (!query) return true;
      return v.name.toLowerCase().includes(query);
    });

    const usageCounts = new Map<number, number>();
    for (const v of filteredVariables) {
      try {
        const list = JSON.parse((editor.engine as any).get_variable_usages?.(BigInt(col.id), BigInt(v.id)) || "[]");
        usageCounts.set(v.id, Array.isArray(list) ? list.length : 0);
      } catch {
        usageCounts.set(v.id, 0);
      }
    }

    const summary = document.createElement("div");
    summary.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:10px;color:#7c8598;";
    summary.textContent = `Showing ${filteredVariables.length}/${col.variables.length} · Usage ${Array.from(usageCounts.values()).reduce((a, b) => a + b, 0)}`;
    varsSection.appendChild(summary);

    if (col.variables.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "color:#555;font-size:11px;text-align:center;padding:20px 0;";
      empty.textContent = "No variables";
      varsSection.appendChild(empty);
    }

    if (filteredVariables.length === 0 && col.variables.length > 0) {
      const emptyFiltered = document.createElement("div");
      emptyFiltered.style.cssText = "color:#666;font-size:11px;text-align:center;padding:16px 0;";
      emptyFiltered.textContent = "No variables match the current filters";
      varsSection.appendChild(emptyFiltered);
    }

    for (const v of filteredVariables) {
      const varRow = document.createElement("div");
      varRow.style.cssText = "background:#1e1e1e;border-radius:6px;padding:8px;margin-bottom:6px;";

      // Name + type + delete row
      const nameRow = document.createElement("div");
      nameRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:6px;";

      const typeBadge = document.createElement("span");
      typeBadge.style.cssText = "font-size:9px;padding:1px 4px;border-radius:3px;background:#333;color:#888;text-transform:uppercase;";
      typeBadge.textContent = v.value_type;
      nameRow.appendChild(typeBadge);

      const nameSpan = document.createElement("span");
      nameSpan.style.cssText = "flex:1;font-size:12px;color:#ccc;font-weight:500;";
      nameSpan.textContent = v.name;
      nameRow.appendChild(nameSpan);

      const delVarBtn = document.createElement("button");
      delVarBtn.style.cssText = "background:none;border:none;color:#555;cursor:pointer;font-size:11px;padding:2px 4px;";
      delVarBtn.textContent = "✕";
      delVarBtn.addEventListener("click", () => {
        editor.engine.push_undo();
        editor.engine.delete_variable(BigInt(col.id), BigInt(v.id));
        refresh();
      });
      nameRow.appendChild(delVarBtn);
      varRow.appendChild(nameRow);

      const usages: Array<{ node_id: number; node_name: string; property: string }> = (() => {
        try { return JSON.parse((editor.engine as any).get_variable_usages?.(BigInt(col.id), BigInt(v.id)) || "[]"); }
        catch { return []; }
      })();
      const usageRow = document.createElement("div");
      usageRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;";
      const usagePill = document.createElement("span");
      const usageColor = usages.length === 0 ? "#f59e0b" : "#60a5fa";
      usagePill.style.cssText = `font-size:10px;padding:2px 6px;border-radius:999px;background:rgba(59,130,246,0.14);color:${usageColor};border:1px solid rgba(96,165,250,0.35);`;
      usagePill.textContent = `Usage ${usages.length}`;
      usageRow.appendChild(usagePill);

      if (usages.length > 0) {
        const jumpBtn = document.createElement("button");
        jumpBtn.style.cssText = "background:none;border:1px solid #334155;border-radius:4px;color:#93c5fd;cursor:pointer;font-size:10px;padding:2px 6px;";
        jumpBtn.textContent = "Show usage";
        let detailsEl: HTMLDivElement | null = null;
        jumpBtn.addEventListener("click", () => {
          if (detailsEl) {
            detailsEl.remove();
            detailsEl = null;
            jumpBtn.textContent = "Show usage";
            return;
          }
          detailsEl = document.createElement("div");
          detailsEl.style.cssText = "display:flex;flex-direction:column;gap:3px;margin:4px 0 6px 0;max-height:96px;overflow:auto;";
          usages.forEach((u) => {
            const item = document.createElement("button");
            item.style.cssText = "text-align:left;background:#232736;border:1px solid #364152;border-radius:4px;color:#cbd5e1;font-size:10px;padding:4px 6px;cursor:pointer;";
            item.textContent = `${u.node_name || `Node ${u.node_id}`} · ${u.property}`;
            item.addEventListener("click", () => {
              editor.engine.select(u.node_id);
              editor.requestRender();
            });
            detailsEl!.appendChild(item);
          });
          varRow.insertBefore(detailsEl, usageRow.nextSibling);
          jumpBtn.textContent = "Hide usage";
        });
        usageRow.appendChild(jumpBtn);
      }
      varRow.appendChild(usageRow);

      // Values per mode
      for (const mode of col.modes) {
        const modeVal = v.values_by_mode[String(mode.id)];
        const valRow = document.createElement("div");
        valRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:4px;";

        const modeLabel = document.createElement("span");
        modeLabel.style.cssText = "font-size:10px;color:#666;min-width:50px;";
        modeLabel.textContent = mode.name;
        valRow.appendChild(modeLabel);

        const setVal = (val: any) => {
          editor.engine.push_undo();
          editor.engine.set_variable_value(BigInt(col.id), BigInt(v.id), BigInt(mode.id), JSON.stringify(val));
          editor.engine.apply_variables();
          editor.requestRender();
        };

        if (v.value_type === "Color") {
          const colorVal = modeVal?.Color || "#000000";
          const colorInput = document.createElement("input");
          colorInput.type = "color";
          colorInput.value = colorVal.substring(0, 7);
          colorInput.style.cssText = "width:28px;height:24px;border:1px solid #444;border-radius:4px;background:none;cursor:pointer;padding:0;";
          colorInput.addEventListener("input", () => setVal({ Color: colorInput.value }));
          valRow.appendChild(colorInput);

          const hexInput = document.createElement("input");
          hexInput.style.cssText = "flex:1;background:#2a2a2a;border:1px solid #333;border-radius:4px;color:#ccc;font-size:11px;padding:3px 6px;font-family:monospace;";
          hexInput.value = colorVal;
          hexInput.addEventListener("change", () => setVal({ Color: hexInput.value }));
          valRow.appendChild(hexInput);
        } else if (v.value_type === "Number") {
          const numInput = document.createElement("input");
          numInput.type = "number";
          numInput.style.cssText = "flex:1;background:#2a2a2a;border:1px solid #333;border-radius:4px;color:#ccc;font-size:11px;padding:3px 6px;";
          numInput.value = String(modeVal?.Number ?? 0);
          numInput.addEventListener("change", () => setVal({ Number: parseFloat(numInput.value) || 0 }));
          valRow.appendChild(numInput);
        } else if (v.value_type === "String") {
          const strInput = document.createElement("input");
          strInput.type = "text";
          strInput.style.cssText = "flex:1;background:#2a2a2a;border:1px solid #333;border-radius:4px;color:#ccc;font-size:11px;padding:3px 6px;";
          strInput.value = modeVal?.String ?? "";
          strInput.addEventListener("change", () => setVal({ String: strInput.value }));
          valRow.appendChild(strInput);
        } else if (v.value_type === "Boolean") {
          const toggle = document.createElement("button");
          const isOn = modeVal?.Boolean ?? false;
          toggle.style.cssText = `width:36px;height:20px;border-radius:10px;border:none;cursor:pointer;background:${isOn ? "#4f46e5" : "#444"};position:relative;transition:background 0.2s;`;
          const knob = document.createElement("span");
          knob.style.cssText = `position:absolute;top:2px;${isOn ? "right:2px" : "left:2px"};width:16px;height:16px;border-radius:8px;background:#fff;transition:all 0.2s;`;
          toggle.appendChild(knob);
          toggle.addEventListener("click", () => setVal({ Boolean: !isOn }));
          valRow.appendChild(toggle);
        }

        varRow.appendChild(valRow);
      }

      varsSection.appendChild(varRow);
    }
    container.appendChild(varsSection);

    renderUsageHeatmap(collections);
  }

  // Initial render
  refresh();

  // Re-render on selection change for binding context
  return { refresh };
}
