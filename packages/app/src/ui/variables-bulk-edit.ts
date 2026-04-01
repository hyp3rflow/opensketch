import type { Editor } from "../editor";

interface VarMode { id: number; name: string; }
interface VarVariable {
  id: number; name: string; value_type: string;
  values_by_mode: Record<string, { Color?: string; Number?: number; String?: string; Boolean?: boolean }>;
}
interface VarCollection {
  id: number; name: string; modes: VarMode[];
  active_mode_id: number; variables: VarVariable[];
}

/** Multi-cell selection state */
interface CellRef { varIdx: number; modeIdx: number; }

export function setupVariablesBulkEdit(container: HTMLElement, editor: Editor, collectionId: number, onBack: () => void) {
  let selectedCells: Set<string> = new Set();
  let anchorCell: CellRef | null = null;
  let editingCell: string | null = null;

  const cellKey = (vi: number, mi: number) => `${vi}:${mi}`;
  const parseKey = (k: string): CellRef => {
    const [v, m] = k.split(":").map(Number);
    return { varIdx: v, modeIdx: m };
  };

  function getCollection(): VarCollection | null {
    const collections: VarCollection[] = JSON.parse(editor.engine.get_collections() || "[]");
    return collections.find(c => c.id === collectionId) ?? null;
  }

  function getCellValue(v: VarVariable, mode: VarMode): string {
    const mv = v.values_by_mode[String(mode.id)];
    if (!mv) return "";
    if (v.value_type === "Color") return mv.Color ?? "#000000";
    if (v.value_type === "Number") return String(mv.Number ?? 0);
    if (v.value_type === "String") return mv.String ?? "";
    if (v.value_type === "Boolean") return String(mv.Boolean ?? false);
    return "";
  }

  function parseValueForType(text: string, varType: string): any {
    if (varType === "Color") return { Color: text.startsWith("#") ? text : `#${text}` };
    if (varType === "Number") return { Number: parseFloat(text) || 0 };
    if (varType === "String") return { String: text };
    if (varType === "Boolean") return { Boolean: text === "true" || text === "1" };
    return null;
  }

  function render() {
    container.innerHTML = "";
    const col = getCollection();
    if (!col) { onBack(); return; }

    // Toolbar
    const toolbar = document.createElement("div");
    toolbar.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap;";

    const backBtn = document.createElement("button");
    backBtn.style.cssText = "background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#ccc;cursor:pointer;font-size:11px;padding:4px 8px;";
    backBtn.textContent = "← Back";
    backBtn.addEventListener("click", onBack);
    toolbar.appendChild(backBtn);

    const titleEl = document.createElement("span");
    titleEl.style.cssText = "font-size:12px;font-weight:600;color:#ccc;flex:1;";
    titleEl.textContent = `${col.name} — Table View`;
    toolbar.appendChild(titleEl);

    // CSV Export
    const exportBtn = document.createElement("button");
    exportBtn.style.cssText = "background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#10b981;cursor:pointer;font-size:10px;padding:3px 8px;";
    exportBtn.textContent = "⬇ CSV";
    exportBtn.title = "Export as CSV";
    exportBtn.addEventListener("click", () => {
      const csv = editor.engine.export_collection_csv(BigInt(collectionId));
      if (!csv) { alert("Empty collection"); return; }
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${col.name}.csv`; a.click();
      URL.revokeObjectURL(url);
    });
    toolbar.appendChild(exportBtn);

    // CSV Import
    const importBtn = document.createElement("button");
    importBtn.style.cssText = "background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#60a5fa;cursor:pointer;font-size:10px;padding:3px 8px;";
    importBtn.textContent = "⬆ CSV";
    importBtn.title = "Import CSV";
    importBtn.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file"; input.accept = ".csv,text/csv";
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          editor.engine.push_undo();
          const count = editor.engine.import_collection_csv(BigInt(collectionId), reader.result as string);
          editor.engine.apply_variables();
          editor.requestRender();
          alert(`Imported/updated ${count} variable(s)`);
          render();
        };
        reader.readAsText(file);
      });
      input.click();
    });
    toolbar.appendChild(importBtn);

    container.appendChild(toolbar);

    // Selection info
    const infoBar = document.createElement("div");
    infoBar.style.cssText = "font-size:10px;color:#666;margin-bottom:6px;min-height:14px;";
    infoBar.textContent = selectedCells.size > 0 ? `${selectedCells.size} cell(s) selected` : "Click cells to select. Shift+click for range. Ctrl/Cmd+C to copy, Ctrl/Cmd+V to paste.";
    container.appendChild(infoBar);

    if (col.variables.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "color:#555;font-size:11px;text-align:center;padding:30px 0;";
      empty.textContent = "No variables. Add some in the card view.";
      container.appendChild(empty);
      return;
    }

    // Table
    const tableWrap = document.createElement("div");
    tableWrap.style.cssText = "overflow-x:auto;border:1px solid #333;border-radius:6px;";

    const table = document.createElement("table");
    table.style.cssText = "width:100%;border-collapse:collapse;font-size:11px;";

    // Header: Name | Type | Mode1 | Mode2 | ...
    const thead = document.createElement("thead");
    const hRow = document.createElement("tr");
    for (const hText of ["Name", "Type", ...col.modes.map(m => m.name)]) {
      const th = document.createElement("th");
      th.style.cssText = "padding:6px 8px;background:#1a1a1a;color:#888;font-weight:600;text-align:left;border-bottom:1px solid #333;font-size:10px;text-transform:uppercase;letter-spacing:0.3px;white-space:nowrap;";
      th.textContent = hText;
      hRow.appendChild(th);
    }
    thead.appendChild(hRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    col.variables.forEach((v, vi) => {
      const tr = document.createElement("tr");
      tr.style.cssText = "border-bottom:1px solid #2a2a2a;";

      // Name cell (editable on dblclick)
      const nameTd = document.createElement("td");
      nameTd.style.cssText = "padding:4px 8px;color:#ccc;font-weight:500;min-width:100px;cursor:text;";
      nameTd.textContent = v.name;
      nameTd.addEventListener("dblclick", () => {
        const input = document.createElement("input");
        input.style.cssText = "background:#2a2a2a;border:1px solid #4f46e5;border-radius:3px;color:#fff;font-size:11px;padding:2px 4px;width:100%;box-sizing:border-box;";
        input.value = v.name;
        nameTd.textContent = "";
        nameTd.appendChild(input);
        input.focus();
        input.select();
        const commit = () => {
          if (input.value && input.value !== v.name) {
            editor.engine.push_undo();
            editor.engine.rename_variable(BigInt(collectionId), BigInt(v.id), input.value);
          }
          render();
        };
        input.addEventListener("blur", commit);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") render(); });
      });
      tr.appendChild(nameTd);

      // Type cell
      const typeTd = document.createElement("td");
      typeTd.style.cssText = "padding:4px 8px;";
      const badge = document.createElement("span");
      badge.style.cssText = "font-size:9px;padding:1px 4px;border-radius:3px;background:#333;color:#888;text-transform:uppercase;";
      badge.textContent = v.value_type;
      typeTd.appendChild(badge);
      tr.appendChild(typeTd);

      // Value cells per mode
      col.modes.forEach((mode, mi) => {
        const td = document.createElement("td");
        const key = cellKey(vi, mi);
        const isSelected = selectedCells.has(key);
        const isEditing = editingCell === key;
        td.style.cssText = `padding:2px 4px;min-width:80px;cursor:cell;border:1px solid ${isSelected ? "#4f46e5" : "transparent"};background:${isSelected ? "#4f46e520" : "transparent"};`;

        const val = getCellValue(v, mode);

        if (isEditing) {
          // Inline edit
          if (v.value_type === "Boolean") {
            const btn = document.createElement("button");
            const isOn = val === "true";
            btn.style.cssText = `padding:2px 12px;border-radius:3px;border:none;cursor:pointer;font-size:10px;color:#fff;background:${isOn ? "#4f46e5" : "#555"};`;
            btn.textContent = isOn ? "true" : "false";
            btn.addEventListener("click", () => {
              editor.engine.push_undo();
              editor.engine.set_variable_value(BigInt(collectionId), BigInt(v.id), BigInt(mode.id), JSON.stringify({ Boolean: !isOn }));
              editor.engine.apply_variables();
              editor.requestRender();
              editingCell = null;
              render();
            });
            td.appendChild(btn);
          } else {
            const input = document.createElement("input");
            input.type = v.value_type === "Color" ? "text" : v.value_type === "Number" ? "number" : "text";
            input.style.cssText = "background:#2a2a2a;border:1px solid #4f46e5;border-radius:3px;color:#fff;font-size:11px;padding:2px 4px;width:100%;box-sizing:border-box;";
            input.value = val;
            td.textContent = "";
            td.appendChild(input);
            requestAnimationFrame(() => { input.focus(); input.select(); });

            const commit = () => {
              const parsed = parseValueForType(input.value, v.value_type);
              if (parsed) {
                editor.engine.push_undo();
                editor.engine.set_variable_value(BigInt(collectionId), BigInt(v.id), BigInt(mode.id), JSON.stringify(parsed));
                editor.engine.apply_variables();
                editor.requestRender();
              }
              editingCell = null;
              render();
            };
            input.addEventListener("blur", commit);
            input.addEventListener("keydown", (e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") { editingCell = null; render(); }
              if (e.key === "Tab") {
                e.preventDefault();
                commit();
                // Move to next cell
                const nextMi = mi + 1 < col.modes.length ? mi + 1 : 0;
                const nextVi = nextMi === 0 ? vi + 1 : vi;
                if (nextVi < col.variables.length) {
                  editingCell = cellKey(nextVi, nextMi);
                  selectedCells.clear();
                  selectedCells.add(editingCell);
                  render();
                }
              }
            });
          }
        } else {
          // Display
          if (v.value_type === "Color") {
            const swatch = document.createElement("span");
            swatch.style.cssText = `display:inline-block;width:14px;height:14px;border-radius:3px;background:${val};border:1px solid #555;vertical-align:middle;margin-right:4px;`;
            td.appendChild(swatch);
            const txt = document.createTextNode(val);
            td.appendChild(txt);
          } else if (v.value_type === "Boolean") {
            const dot = document.createElement("span");
            dot.style.cssText = `display:inline-block;width:8px;height:8px;border-radius:4px;background:${val === "true" ? "#4f46e5" : "#555"};margin-right:4px;vertical-align:middle;`;
            td.appendChild(dot);
            td.appendChild(document.createTextNode(val));
          } else {
            td.style.color = "#ccc";
            td.textContent = val;
          }

          // Click to select
          td.addEventListener("mousedown", (e) => {
            if (e.shiftKey && anchorCell) {
              // Range select
              const minV = Math.min(anchorCell.varIdx, vi);
              const maxV = Math.max(anchorCell.varIdx, vi);
              const minM = Math.min(anchorCell.modeIdx, mi);
              const maxM = Math.max(anchorCell.modeIdx, mi);
              if (!e.ctrlKey && !e.metaKey) selectedCells.clear();
              for (let rv = minV; rv <= maxV; rv++) {
                for (let rm = minM; rm <= maxM; rm++) {
                  selectedCells.add(cellKey(rv, rm));
                }
              }
            } else if (e.ctrlKey || e.metaKey) {
              // Toggle
              if (selectedCells.has(key)) selectedCells.delete(key);
              else selectedCells.add(key);
              anchorCell = { varIdx: vi, modeIdx: mi };
            } else {
              selectedCells.clear();
              selectedCells.add(key);
              anchorCell = { varIdx: vi, modeIdx: mi };
            }
            render();
          });

          // Double-click to edit
          td.addEventListener("dblclick", () => {
            editingCell = key;
            selectedCells.clear();
            selectedCells.add(key);
            render();
          });
        }

        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    container.appendChild(tableWrap);
  }

  // Keyboard handlers
  const onKeyDown = (e: KeyboardEvent) => {
    if (!container.isConnected) {
      document.removeEventListener("keydown", onKeyDown);
      return;
    }

    const col = getCollection();
    if (!col || editingCell) return;

    // Copy selected cells
    if ((e.metaKey || e.ctrlKey) && e.key === "c" && selectedCells.size > 0) {
      e.preventDefault();
      const cells = Array.from(selectedCells).map(parseKey);
      const minV = Math.min(...cells.map(c => c.varIdx));
      const maxV = Math.max(...cells.map(c => c.varIdx));
      const minM = Math.min(...cells.map(c => c.modeIdx));
      const maxM = Math.max(...cells.map(c => c.modeIdx));

      const lines: string[] = [];
      for (let vi = minV; vi <= maxV; vi++) {
        const row: string[] = [];
        for (let mi = minM; mi <= maxM; mi++) {
          if (selectedCells.has(cellKey(vi, mi))) {
            row.push(getCellValue(col.variables[vi], col.modes[mi]));
          } else {
            row.push("");
          }
        }
        lines.push(row.join("\t"));
      }
      navigator.clipboard.writeText(lines.join("\n"));
    }

    // Paste into selected cells
    if ((e.metaKey || e.ctrlKey) && e.key === "v" && selectedCells.size > 0) {
      e.preventDefault();
      navigator.clipboard.readText().then(text => {
        const rows = text.split("\n").map(r => r.split("\t"));
        const anchor = anchorCell ?? parseKey(Array.from(selectedCells)[0]);
        const updates: [number, number, number, any][] = [];

        for (let ri = 0; ri < rows.length; ri++) {
          for (let ci = 0; ci < rows[ri].length; ci++) {
            const vi = anchor.varIdx + ri;
            const mi = anchor.modeIdx + ci;
            if (vi >= col.variables.length || mi >= col.modes.length) continue;
            const v = col.variables[vi];
            const parsed = parseValueForType(rows[ri][ci].trim(), v.value_type);
            if (parsed) {
              updates.push([collectionId, v.id, col.modes[mi].id, parsed]);
            }
          }
        }

        if (updates.length > 0) {
          editor.engine.push_undo();
          editor.engine.bulk_update_variables(JSON.stringify(updates));
          editor.engine.apply_variables();
          editor.requestRender();
          render();
        }
      });
    }

    // Delete selected cell values (reset to default)
    if ((e.key === "Delete" || e.key === "Backspace") && selectedCells.size > 0) {
      // Don't intercept if not focused on table area
      if (document.activeElement && (document.activeElement as HTMLElement).tagName === "INPUT") return;
      e.preventDefault();
      const updates: [number, number, number, any][] = [];
      for (const key of selectedCells) {
        const { varIdx: vi, modeIdx: mi } = parseKey(key);
        const v = col.variables[vi];
        const mode = col.modes[mi];
        const defaultVal = v.value_type === "Color" ? { Color: "#000000" } :
                          v.value_type === "Number" ? { Number: 0 } :
                          v.value_type === "String" ? { String: "" } :
                          { Boolean: false };
        updates.push([collectionId, v.id, mode.id, defaultVal]);
      }
      if (updates.length > 0) {
        editor.engine.push_undo();
        editor.engine.bulk_update_variables(JSON.stringify(updates));
        editor.engine.apply_variables();
        editor.requestRender();
        render();
      }
    }

    // Enter to edit selected cell
    if (e.key === "Enter" && selectedCells.size === 1 && !editingCell) {
      e.preventDefault();
      editingCell = Array.from(selectedCells)[0];
      render();
    }

    // Arrow key navigation
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) && selectedCells.size > 0) {
      e.preventDefault();
      const current = anchorCell ?? parseKey(Array.from(selectedCells)[0]);
      let nv = current.varIdx;
      let nm = current.modeIdx;
      if (e.key === "ArrowUp") nv = Math.max(0, nv - 1);
      if (e.key === "ArrowDown") nv = Math.min(col.variables.length - 1, nv + 1);
      if (e.key === "ArrowLeft") nm = Math.max(0, nm - 1);
      if (e.key === "ArrowRight") nm = Math.min(col.modes.length - 1, nm + 1);
      selectedCells.clear();
      selectedCells.add(cellKey(nv, nm));
      anchorCell = { varIdx: nv, modeIdx: nm };
      render();
    }

    // Escape to deselect
    if (e.key === "Escape") {
      selectedCells.clear();
      anchorCell = null;
      render();
    }
  };

  document.addEventListener("keydown", onKeyDown);

  render();
  return {
    refresh: render,
    destroy: () => document.removeEventListener("keydown", onKeyDown),
  };
}
