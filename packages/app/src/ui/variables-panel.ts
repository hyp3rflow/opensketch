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

type VarPrimitive = { Color?: string; Number?: number; String?: string; Boolean?: boolean };
interface VariableTimelineEntry {
  id: string;
  ts: number;
  collection_id: number;
  collection_name: string;
  variable_id: number;
  variable_name: string;
  value_type: string;
  changed_mode_id: number;
  changed_mode_name: string;
  before: Record<string, VarPrimitive>;
  after: Record<string, VarPrimitive>;
}

const VARIABLE_TIMELINE_STORAGE_KEY = "opensketch-variable-diff-timeline-v1";
const VARIABLE_MODE_DRIFT_RECIPES_KEY = "opensketch-variable-mode-drift-recipes-v1";
const VARIABLE_CONTRACT_TESTS_KEY = "opensketch-variable-contract-tests-v1";

interface VariableModeDriftRecipe {
  id: string;
  name: string;
  collection_name: string;
  value_type: "Any" | "Color" | "Number" | "String" | "Boolean";
  source_mode_name: string;
  target_mode_names: string[];
  created_at: number;
}

interface VariableContractField {
  name: string;
  value_type: "Color" | "Number" | "String" | "Boolean";
}

interface VariableContractEntry {
  component_id: number;
  component_name: string;
  required: VariableContractField[];
  updated_at: number;
}

interface VariableContractIssue {
  componentName: string;
  variableName: string;
  expectedType: string;
  actualType: string | null;
  kind: "missing" | "type-mismatch";
}

export function setupVariablesPanel(container: HTMLElement, editor: Editor) {
  let selectedCollectionId: number | null = null;
  let bulkEditInstance: ReturnType<typeof setupVariablesBulkEdit> | null = null;
  let inBulkEditMode = false;
  let variableSearchQuery = "";
  let variableTypeFilter = "All";
  let usageHeatmapEnabled = false;
  let usageHeatmapCanvas: HTMLCanvasElement | null = null;
  let expandedTimelineEntryId: string | null = null;
  let selectedTimelineModeId: number | "all" = "all";
  let selectedScopeAudit: "Collection" | "Page" | "Frame" = "Collection";
  let selectedContractComponentId: number | null = null;
  let contractSchemaDraft = "";

  const cloneModeValues = (input: Record<string, VarPrimitive> | undefined | null): Record<string, VarPrimitive> => {
    const out: Record<string, VarPrimitive> = {};
    if (!input) return out;
    for (const [k, v] of Object.entries(input)) {
      out[k] = { ...(v || {}) };
    }
    return out;
  };

  const formatPrimitive = (valueType: string, value: VarPrimitive | undefined): string => {
    if (!value) return "—";
    if (valueType === "Color") return value.Color ?? "—";
    if (valueType === "Number") return String(value.Number ?? 0);
    if (valueType === "String") return value.String ?? "";
    if (valueType === "Boolean") return String(value.Boolean ?? false);
    return JSON.stringify(value);
  };

  const hasTypedValue = (valueType: string, value: VarPrimitive | undefined): boolean => {
    if (!value) return false;
    if (valueType === "Color") return typeof value.Color === "string" && value.Color.length > 0;
    if (valueType === "Number") return typeof value.Number === "number" && Number.isFinite(value.Number);
    if (valueType === "String") return typeof value.String === "string";
    if (valueType === "Boolean") return typeof value.Boolean === "boolean";
    return Object.keys(value).length > 0;
  };

  const pickFallbackModeValue = (col: VarCollection, variable: VarVariable): VarPrimitive | null => {
    const modeOrder = [col.active_mode_id, ...col.modes.map((m) => m.id).filter((id) => id !== col.active_mode_id)];
    for (const modeId of modeOrder) {
      const v = variable.values_by_mode?.[String(modeId)];
      if (hasTypedValue(variable.value_type, v)) return { ...(v || {}) };
    }
    return null;
  };

  const readModeDriftRecipes = (): VariableModeDriftRecipe[] => {
    try {
      const raw = localStorage.getItem(VARIABLE_MODE_DRIFT_RECIPES_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed as VariableModeDriftRecipe[];
    } catch {
      return [];
    }
  };

  const writeModeDriftRecipes = (recipes: VariableModeDriftRecipe[]) => {
    try {
      localStorage.setItem(VARIABLE_MODE_DRIFT_RECIPES_KEY, JSON.stringify(recipes.slice(0, 30)));
    } catch {
      // ignore storage quota errors
    }
  };

  const equalPrimitive = (valueType: string, a?: VarPrimitive, b?: VarPrimitive): boolean => {
    if (valueType === "Color") return (a?.Color || "") === (b?.Color || "");
    if (valueType === "Number") return Number(a?.Number ?? NaN) === Number(b?.Number ?? NaN);
    if (valueType === "String") return String(a?.String ?? "") === String(b?.String ?? "");
    if (valueType === "Boolean") return Boolean(a?.Boolean) === Boolean(b?.Boolean);
    return JSON.stringify(a || {}) === JSON.stringify(b || {});
  };

  const readTimeline = (): VariableTimelineEntry[] => {
    try {
      const raw = localStorage.getItem(VARIABLE_TIMELINE_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed as VariableTimelineEntry[];
    } catch {
      return [];
    }
  };

  const writeTimeline = (entries: VariableTimelineEntry[]) => {
    try {
      localStorage.setItem(VARIABLE_TIMELINE_STORAGE_KEY, JSON.stringify(entries.slice(0, 120)));
    } catch {
      // ignore storage quota errors
    }
  };

  const readContractEntries = (): VariableContractEntry[] => {
    try {
      const raw = localStorage.getItem(VARIABLE_CONTRACT_TESTS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed as VariableContractEntry[];
    } catch {
      return [];
    }
  };

  const writeContractEntries = (entries: VariableContractEntry[]) => {
    try {
      localStorage.setItem(VARIABLE_CONTRACT_TESTS_KEY, JSON.stringify(entries.slice(0, 200)));
    } catch {
      // ignore storage quota errors
    }
  };

  const parseContractSchema = (raw: string): VariableContractField[] => {
    const out: VariableContractField[] = [];
    const chunks = raw.split(",").map((token) => token.trim()).filter(Boolean);
    const allowed = new Set(["Color", "Number", "String", "Boolean"]);
    for (const chunk of chunks) {
      const [nameRaw, typeRaw] = chunk.split(":").map((s) => s.trim());
      if (!nameRaw || !typeRaw || !allowed.has(typeRaw)) continue;
      out.push({ name: nameRaw, value_type: typeRaw as VariableContractField["value_type"] });
    }
    return out;
  };

  const stringifyContractSchema = (required: VariableContractField[]): string => {
    return required.map((field) => `${field.name}:${field.value_type}`).join(", ");
  };

  const pushTimelineEntry = (
    collection: VarCollection,
    variable: VarVariable,
    changedMode: VarMode,
    before: Record<string, VarPrimitive>,
    after: Record<string, VarPrimitive>
  ) => {
    const entry: VariableTimelineEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
      collection_id: collection.id,
      collection_name: collection.name,
      variable_id: variable.id,
      variable_name: variable.name,
      value_type: variable.value_type,
      changed_mode_id: changedMode.id,
      changed_mode_name: changedMode.name,
      before,
      after,
    };
    const next = [entry, ...readTimeline()];
    writeTimeline(next);
  };

  type VariableGraphNode = {
    key: string;
    collectionId: number;
    collectionName: string;
    variableId: number;
    variableName: string;
  };

  type VariableAliasEdge = {
    from: string;
    to: string;
    modeId: number;
    modeName: string;
    rawToken: string;
  };

  type VariableAliasBroken = {
    from: string;
    modeId: number;
    modeName: string;
    rawToken: string;
    candidates: string[];
    reason: "missing" | "ambiguous" | "self";
  };

  type VariableAliasChain = {
    path: string[];
    startFrom: string;
    modeId: number;
    modeName: string;
    terminal: string;
    hops: number;
  };

  const parseAliasToken = (input: string): string | null => {
    const m = String(input || "").trim().match(/^\{\s*([^}]+?)\s*\}$/);
    return m ? m[1].trim() : null;
  };

  const buildVariableDependencyGraph = (collections: VarCollection[]) => {
    const nodes = new Map<string, VariableGraphNode>();
    const byQualified = new Map<string, string>();
    const byBareName = new Map<string, string[]>();

    for (const c of collections) {
      for (const v of c.variables || []) {
        const key = `${c.id}:${v.id}`;
        nodes.set(key, {
          key,
          collectionId: c.id,
          collectionName: c.name,
          variableId: v.id,
          variableName: v.name,
        });
        byQualified.set(`${c.name}/${v.name}`.toLowerCase(), key);
        byQualified.set(`${c.name}.${v.name}`.toLowerCase(), key);
        const arr = byBareName.get(v.name.toLowerCase()) || [];
        arr.push(key);
        byBareName.set(v.name.toLowerCase(), arr);
      }
    }

    const resolveAliasCandidates = (token: string, srcCollectionName: string): string[] => {
      const norm = token.trim().toLowerCase();
      const results: string[] = [];

      const qualified = byQualified.get(norm);
      if (qualified) results.push(qualified);

      const inSame = byQualified.get(`${srcCollectionName}/${token}`.toLowerCase()) || byQualified.get(`${srcCollectionName}.${token}`.toLowerCase());
      if (inSame && !results.includes(inSame)) results.push(inSame);

      const bare = byBareName.get(norm) || [];
      for (const key of bare) {
        if (!results.includes(key)) results.push(key);
      }

      if (results.length > 0) return results;

      // soft suggestion: token suffix/name overlap for one-click retarget
      const tokenLeaf = norm.split(/[./]/).filter(Boolean).pop() || norm;
      for (const [name, keys] of byBareName.entries()) {
        if (name.includes(tokenLeaf) || tokenLeaf.includes(name)) {
          for (const key of keys) {
            if (!results.includes(key)) results.push(key);
          }
        }
      }

      return results.slice(0, 5);
    };

    const edges: VariableAliasEdge[] = [];
    const broken: VariableAliasBroken[] = [];

    for (const c of collections) {
      const modeById = new Map((c.modes || []).map((m) => [m.id, m.name]));
      for (const v of c.variables || []) {
        if (v.value_type !== "String") continue;
        const src = `${c.id}:${v.id}`;
        for (const [modeIdStr, raw] of Object.entries(v.values_by_mode || {})) {
          const token = parseAliasToken(raw?.String || "");
          if (!token) continue;
          const modeId = Number(modeIdStr);
          const candidates = resolveAliasCandidates(token, c.name);
          if (candidates.length === 0) {
            broken.push({
              from: src,
              modeId,
              modeName: modeById.get(modeId) || `Mode ${modeId}`,
              rawToken: token,
              candidates: [],
              reason: "missing",
            });
            continue;
          }
          if (candidates.length > 1) {
            broken.push({
              from: src,
              modeId,
              modeName: modeById.get(modeId) || `Mode ${modeId}`,
              rawToken: token,
              candidates,
              reason: "ambiguous",
            });
            continue;
          }
          if (candidates[0] === src) {
            broken.push({
              from: src,
              modeId,
              modeName: modeById.get(modeId) || `Mode ${modeId}`,
              rawToken: token,
              candidates,
              reason: "self",
            });
            continue;
          }
          edges.push({ from: src, to: candidates[0], modeId, modeName: modeById.get(modeId) || `Mode ${modeId}`, rawToken: token });
        }
      }
    }

    const adjacency = new Map<string, string[]>();
    for (const e of edges) {
      const list = adjacency.get(e.from) || [];
      list.push(e.to);
      adjacency.set(e.from, list);
    }

    const cycles: string[][] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const stack: string[] = [];

    const dfs = (node: string) => {
      visiting.add(node);
      stack.push(node);
      for (const next of adjacency.get(node) || []) {
        if (!visited.has(next) && !visiting.has(next)) {
          dfs(next);
          continue;
        }
        if (visiting.has(next)) {
          const idx = stack.lastIndexOf(next);
          if (idx >= 0) cycles.push([...stack.slice(idx), next]);
        }
      }
      stack.pop();
      visiting.delete(node);
      visited.add(node);
    };

    for (const key of nodes.keys()) {
      if (!visited.has(key)) dfs(key);
    }

    const chains: VariableAliasChain[] = [];
    const chainSeen = new Set<string>();
    const edgesByFrom = new Map<string, VariableAliasEdge[]>();
    for (const edge of edges) {
      const list = edgesByFrom.get(edge.from) || [];
      list.push(edge);
      edgesByFrom.set(edge.from, list);
    }

    for (const edge of edges) {
      const path = [edge.from, edge.to];
      const visitedPath = new Set(path);
      let current = edge.to;
      let cycleHit = false;

      for (let i = 0; i < 12; i += 1) {
        const nextEdges = edgesByFrom.get(current) || [];
        const uniqueTargets = Array.from(new Set(nextEdges.map((it) => it.to)));
        if (uniqueTargets.length !== 1) break;
        const next = uniqueTargets[0];
        if (visitedPath.has(next)) {
          cycleHit = true;
          break;
        }
        path.push(next);
        visitedPath.add(next);
        current = next;
      }

      if (cycleHit || path.length < 3) continue;

      const signature = `${edge.from}:${edge.modeId}:${path.join("->")}`;
      if (chainSeen.has(signature)) continue;
      chainSeen.add(signature);
      chains.push({
        path,
        startFrom: edge.from,
        modeId: edge.modeId,
        modeName: edge.modeName,
        terminal: path[path.length - 1],
        hops: path.length - 1,
      });
    }

    chains.sort((a, b) => b.hops - a.hops);

    return { nodes, edges, broken, cycles, chains };
  };

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

    const parityRows = col.variables
      .map((variable) => {
        const missingModes = col.modes.filter((mode) => !hasTypedValue(variable.value_type, variable.values_by_mode?.[String(mode.id)]));
        return { variable, missingModes };
      })
      .filter((row) => row.missingModes.length > 0);

    const paritySection = document.createElement("div");
    paritySection.style.cssText = "margin-bottom:12px;background:#1b2230;border:1px solid #2f3f5d;border-radius:6px;padding:8px;";
    const parityHeader = document.createElement("div");
    parityHeader.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;";
    const parityTitle = document.createElement("span");
    parityTitle.style.cssText = "font-size:10px;color:#93c5fd;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;";
    parityTitle.textContent = "Mode Parity Checker";
    parityHeader.appendChild(parityTitle);

    const parityBadge = document.createElement("span");
    parityBadge.style.cssText = `font-size:10px;color:${parityRows.length > 0 ? "#fca5a5" : "#86efac"};`;
    parityBadge.textContent = parityRows.length > 0
      ? `Missing ${parityRows.reduce((acc, row) => acc + row.missingModes.length, 0)}`
      : "All modes covered";
    parityHeader.appendChild(parityBadge);
    paritySection.appendChild(parityHeader);

    const parityDesc = document.createElement("div");
    parityDesc.style.cssText = "font-size:10px;color:#94a3b8;margin-bottom:6px;";
    parityDesc.textContent = "빈 mode value를 탐지하고, active mode(또는 첫 유효값)로 빠르게 채웁니다.";
    paritySection.appendChild(parityDesc);

    const parityActions = document.createElement("div");
    parityActions.style.cssText = "display:flex;gap:6px;margin-bottom:6px;";
    const normalizeBtn = document.createElement("button");
    normalizeBtn.style.cssText = "background:#1f3b2a;border:1px solid #166534;border-radius:4px;color:#86efac;cursor:pointer;font-size:10px;padding:3px 8px;";
    normalizeBtn.textContent = "Normalize missing";
    normalizeBtn.disabled = parityRows.length === 0;
    normalizeBtn.addEventListener("click", () => {
      if (parityRows.length === 0) return;
      if (!confirm(`Fill ${parityRows.length} variables with missing mode values?`)) return;
      editor.engine.push_undo();
      let filled = 0;
      for (const row of parityRows) {
        const fallback = pickFallbackModeValue(col, row.variable);
        if (!fallback) continue;
        for (const mode of row.missingModes) {
          editor.engine.set_variable_value(BigInt(col.id), BigInt(row.variable.id), BigInt(mode.id), JSON.stringify(fallback));
          filled += 1;
        }
      }
      if (filled > 0) {
        editor.engine.apply_variables();
        editor.requestRender();
      }
      refresh();
    });
    parityActions.appendChild(normalizeBtn);
    paritySection.appendChild(parityActions);

    if (parityRows.length === 0) {
      const parityOk = document.createElement("div");
      parityOk.style.cssText = "font-size:10px;color:#6ee7b7;";
      parityOk.textContent = "모든 변수에 mode 값이 설정되어 있습니다.";
      paritySection.appendChild(parityOk);
    } else {
      const list = document.createElement("div");
      list.style.cssText = "display:flex;flex-direction:column;gap:4px;max-height:140px;overflow:auto;";
      for (const row of parityRows.slice(0, 12)) {
        const item = document.createElement("div");
        item.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;background:#111827;border:1px solid #24324f;border-radius:4px;padding:5px 6px;";
        const name = document.createElement("span");
        name.style.cssText = "font-size:10px;color:#e2e8f0;";
        name.textContent = row.variable.name;
        const missing = document.createElement("span");
        missing.style.cssText = "font-size:10px;color:#fda4af;";
        missing.textContent = `missing: ${row.missingModes.map((m) => m.name).join(", ")}`;
        item.appendChild(name);
        item.appendChild(missing);
        list.appendChild(item);
      }
      paritySection.appendChild(list);
    }
    container.appendChild(paritySection);

    const timelineEntries = readTimeline().filter((entry) => entry.collection_id === col.id);
    const filteredTimelineEntries = selectedTimelineModeId === "all"
      ? timelineEntries
      : timelineEntries.filter((entry) => entry.changed_mode_id === selectedTimelineModeId);
    const timelineSection = document.createElement("div");
    timelineSection.style.cssText = "margin-bottom:12px;background:#1e1e1e;border:1px solid #2f2f2f;border-radius:6px;padding:8px;";
    const timelineHeader = document.createElement("div");
    timelineHeader.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;";
    const timelineTitle = document.createElement("span");
    timelineTitle.style.cssText = "font-size:10px;color:#a7f3d0;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;";
    timelineTitle.textContent = "Variable Token Drift Timeline";
    timelineHeader.appendChild(timelineTitle);

    const timelineActions = document.createElement("div");
    timelineActions.style.cssText = "display:flex;gap:6px;align-items:center;";

    const modeFilter = document.createElement("select");
    modeFilter.style.cssText = "background:#222;border:1px solid #3a3a3a;border-radius:4px;color:#cbd5e1;font-size:10px;padding:2px 4px;";
    const modeAll = document.createElement("option");
    modeAll.value = "all";
    modeAll.textContent = "All modes";
    modeFilter.appendChild(modeAll);
    for (const mode of col.modes) {
      const opt = document.createElement("option");
      opt.value = String(mode.id);
      opt.textContent = mode.name;
      modeFilter.appendChild(opt);
    }
    modeFilter.value = selectedTimelineModeId === "all" ? "all" : String(selectedTimelineModeId);
    modeFilter.addEventListener("change", () => {
      selectedTimelineModeId = modeFilter.value === "all" ? "all" : Number(modeFilter.value);
      expandedTimelineEntryId = null;
      refresh();
    });
    timelineActions.appendChild(modeFilter);

    const clearCollectionBtn = document.createElement("button");
    clearCollectionBtn.style.cssText = "background:#2a2a2a;border:1px solid #454545;border-radius:4px;color:#999;cursor:pointer;font-size:10px;padding:2px 6px;";
    clearCollectionBtn.textContent = "Clear";
    clearCollectionBtn.title = "Clear this collection's timeline";
    clearCollectionBtn.addEventListener("click", () => {
      if (!confirm("Clear variable diff timeline for this collection?")) return;
      const next = readTimeline().filter((entry) => entry.collection_id !== col.id);
      writeTimeline(next);
      expandedTimelineEntryId = null;
      refresh();
    });
    timelineActions.appendChild(clearCollectionBtn);

    const rollbackLatestBtn = document.createElement("button");
    rollbackLatestBtn.style.cssText = "background:#1f3b2a;border:1px solid #166534;border-radius:4px;color:#86efac;cursor:pointer;font-size:10px;padding:2px 6px;";
    rollbackLatestBtn.textContent = "Rollback latest";
    rollbackLatestBtn.disabled = filteredTimelineEntries.length === 0;
    rollbackLatestBtn.addEventListener("click", () => {
      const latest = filteredTimelineEntries[0];
      if (!latest) return;
      if (!confirm(`Rollback latest change for ${latest.variable_name}?`)) return;
      editor.engine.push_undo();
      for (const mode of col.modes) {
        const val = latest.before[String(mode.id)];
        if (!val) continue;
        editor.engine.set_variable_value(BigInt(col.id), BigInt(latest.variable_id), BigInt(mode.id), JSON.stringify(val));
      }
      editor.engine.apply_variables();
      editor.requestRender();
      refresh();
    });
    timelineActions.appendChild(rollbackLatestBtn);

    timelineHeader.appendChild(timelineActions);
    timelineSection.appendChild(timelineHeader);

    if (filteredTimelineEntries.length === 0) {
      const emptyTimeline = document.createElement("div");
      emptyTimeline.style.cssText = "font-size:10px;color:#666;";
      emptyTimeline.textContent = "No recorded variable mode diffs yet.";
      timelineSection.appendChild(emptyTimeline);
    } else {
      const list = document.createElement("div");
      list.style.cssText = "display:flex;flex-direction:column;gap:6px;max-height:220px;overflow:auto;";
      filteredTimelineEntries.slice(0, 20).forEach((entry) => {
        const row = document.createElement("div");
        row.style.cssText = "background:#232323;border:1px solid #333;border-radius:5px;padding:6px;";

        const top = document.createElement("div");
        top.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:6px;";
        const label = document.createElement("button");
        label.style.cssText = "flex:1;text-align:left;background:none;border:none;color:#d1fae5;font-size:10px;cursor:pointer;padding:0;";
        const changedBefore = formatPrimitive(entry.value_type, entry.before[String(entry.changed_mode_id)]);
        const changedAfter = formatPrimitive(entry.value_type, entry.after[String(entry.changed_mode_id)]);
        label.textContent = `${entry.variable_name} · ${entry.changed_mode_name} · ${changedBefore} → ${changedAfter}`;
        label.addEventListener("click", () => {
          expandedTimelineEntryId = expandedTimelineEntryId === entry.id ? null : entry.id;
          refresh();
        });
        top.appendChild(label);

        const when = document.createElement("span");
        when.style.cssText = "font-size:9px;color:#888;white-space:nowrap;";
        when.textContent = new Date(entry.ts).toLocaleTimeString();
        top.appendChild(when);
        row.appendChild(top);

        const rollbackRow = document.createElement("div");
        rollbackRow.style.cssText = "display:flex;gap:6px;margin-top:6px;";

        const rollbackBtn = document.createElement("button");
        rollbackBtn.style.cssText = "background:#2a2033;border:1px solid #5b3a7e;border-radius:4px;color:#d8b4fe;cursor:pointer;font-size:10px;padding:2px 6px;";
        rollbackBtn.textContent = "Rollback this";
        rollbackBtn.addEventListener("click", () => {
          if (!confirm(`Rollback this snapshot for ${entry.variable_name}?`)) return;
          editor.engine.push_undo();
          for (const mode of col.modes) {
            const val = entry.before[String(mode.id)];
            if (!val) continue;
            editor.engine.set_variable_value(BigInt(col.id), BigInt(entry.variable_id), BigInt(mode.id), JSON.stringify(val));
          }
          editor.engine.apply_variables();
          editor.requestRender();
          refresh();
        });
        rollbackRow.appendChild(rollbackBtn);

        const rollbackToHereBtn = document.createElement("button");
        rollbackToHereBtn.style.cssText = "background:#1f2937;border:1px solid #334155;border-radius:4px;color:#bfdbfe;cursor:pointer;font-size:10px;padding:2px 6px;";
        rollbackToHereBtn.textContent = "Rollback to here";
        rollbackToHereBtn.title = "Apply this snapshot and drop newer timeline entries for this variable";
        rollbackToHereBtn.addEventListener("click", () => {
          if (!confirm(`Rollback ${entry.variable_name} to this timestamp and discard newer snapshots?`)) return;
          editor.engine.push_undo();
          for (const mode of col.modes) {
            const val = entry.before[String(mode.id)];
            if (!val) continue;
            editor.engine.set_variable_value(BigInt(col.id), BigInt(entry.variable_id), BigInt(mode.id), JSON.stringify(val));
          }
          editor.engine.apply_variables();
          editor.requestRender();
          const trimmed = readTimeline().filter((it) => !(it.collection_id === col.id && it.variable_id === entry.variable_id && it.ts > entry.ts));
          writeTimeline(trimmed);
          refresh();
        });
        rollbackRow.appendChild(rollbackToHereBtn);

        row.appendChild(rollbackRow);

        if (expandedTimelineEntryId === entry.id) {
          const detail = document.createElement("div");
          detail.style.cssText = "margin-top:6px;border-top:1px dashed #3f3f3f;padding-top:6px;display:flex;flex-direction:column;gap:4px;";
          for (const mode of col.modes) {
            const line = document.createElement("div");
            line.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10px;color:#a3a3a3;";
            const modeName = document.createElement("span");
            modeName.textContent = mode.name;
            const valueDiff = document.createElement("span");
            valueDiff.style.cssText = "font-family:monospace;color:#cbd5e1;";
            valueDiff.textContent = `${formatPrimitive(entry.value_type, entry.before[String(mode.id)])} → ${formatPrimitive(entry.value_type, entry.after[String(mode.id)])}`;
            line.appendChild(modeName);
            line.appendChild(valueDiff);
            detail.appendChild(line);
          }
          row.appendChild(detail);
        }

        list.appendChild(row);
      });
      timelineSection.appendChild(list);
    }
    container.appendChild(timelineSection);

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

    // Variable mode drift auto-fix recipes
    const modeRecipeSection = document.createElement("div");
    modeRecipeSection.style.cssText = "margin-bottom:12px;background:#1f2937;border:1px solid #334155;border-radius:6px;padding:8px;";

    const modeRecipeHeader = document.createElement("div");
    modeRecipeHeader.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;";
    const modeRecipeTitle = document.createElement("div");
    modeRecipeTitle.style.cssText = "font-size:10px;color:#93c5fd;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;";
    modeRecipeTitle.textContent = "Mode Drift Auto-Fix Recipes";
    modeRecipeHeader.appendChild(modeRecipeTitle);

    const modeRecipeMeta = document.createElement("span");
    modeRecipeMeta.style.cssText = "font-size:10px;color:#94a3b8;";
    modeRecipeMeta.textContent = `Collection: ${col.name}`;
    modeRecipeHeader.appendChild(modeRecipeMeta);
    modeRecipeSection.appendChild(modeRecipeHeader);

    const recipes = readModeDriftRecipes();
    const recipeListWrap = document.createElement("div");
    recipeListWrap.style.cssText = "display:flex;flex-direction:column;gap:6px;";

    const saveRecipeBtn = document.createElement("button");
    saveRecipeBtn.style.cssText = "align-self:flex-start;background:#1d4ed8;border:1px solid #3b82f6;border-radius:4px;color:#dbeafe;cursor:pointer;font-size:10px;padding:3px 8px;";
    saveRecipeBtn.textContent = "+ Save recipe from current modes";
    saveRecipeBtn.title = "Store current source/target mode mapping as reusable drift cleanup recipe";
    saveRecipeBtn.onclick = () => {
      if ((col.modes || []).length < 2) {
        alert("Need at least 2 modes to save a drift recipe.");
        return;
      }
      const sourceName = prompt(`Source mode name for recipe (${col.modes.map((m) => m.name).join(", ")}):`, col.modes[0]?.name || "");
      if (!sourceName) return;
      const sourceMode = (col.modes || []).find((m) => String(m.name).trim().toLowerCase() === sourceName.trim().toLowerCase());
      if (!sourceMode) {
        alert(`Mode not found: ${sourceName}`);
        return;
      }
      const targetRaw = prompt("Target mode names (comma separated)", col.modes.filter((m) => m.id !== sourceMode.id).map((m) => m.name).join(", "));
      if (!targetRaw) return;
      const targetNames = targetRaw.split(",").map((s) => s.trim()).filter(Boolean);
      if (targetNames.length === 0) return;
      const missing = targetNames.filter((name) => !(col.modes || []).some((m) => m.name.toLowerCase() === name.toLowerCase()));
      if (missing.length > 0) {
        alert(`Unknown mode(s): ${missing.join(", ")}`);
        return;
      }
      const name = prompt("Recipe name", `${col.name}: ${sourceMode.name} → ${targetNames.join("/")}`)?.trim();
      if (!name) return;
      const valueTypeRaw = prompt("Value type scope (Any|Color|Number|String|Boolean)", "Any") || "Any";
      const normalizedType = ["Any", "Color", "Number", "String", "Boolean"].includes(valueTypeRaw) ? valueTypeRaw as VariableModeDriftRecipe["value_type"] : "Any";

      const next: VariableModeDriftRecipe = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        collection_name: col.name,
        value_type: normalizedType,
        source_mode_name: sourceMode.name,
        target_mode_names: targetNames,
        created_at: Date.now(),
      };
      writeModeDriftRecipes([next, ...recipes.filter((r) => r.id !== next.id)]);
      refresh();
    };
    modeRecipeSection.appendChild(saveRecipeBtn);

    const applyRecipe = (recipe: VariableModeDriftRecipe) => {
      const sourceMode = (col.modes || []).find((m) => m.name.toLowerCase() === recipe.source_mode_name.toLowerCase());
      if (!sourceMode) {
        alert(`Source mode '${recipe.source_mode_name}' not found in '${col.name}'.`);
        return;
      }
      const targets = recipe.target_mode_names
        .map((name) => (col.modes || []).find((m) => m.name.toLowerCase() === name.toLowerCase()))
        .filter(Boolean) as VarMode[];
      if (targets.length === 0) {
        alert("No target modes in this collection match the recipe.");
        return;
      }

      let fixed = 0;
      editor.engine.push_undo();
      for (const variable of col.variables || []) {
        if (recipe.value_type !== "Any" && variable.value_type !== recipe.value_type) continue;
        const sourceValue = variable.values_by_mode?.[String(sourceMode.id)];
        if (!hasTypedValue(variable.value_type, sourceValue)) continue;
        for (const targetMode of targets) {
          const targetValue = variable.values_by_mode?.[String(targetMode.id)];
          if (equalPrimitive(variable.value_type, sourceValue, targetValue)) continue;
          editor.engine.set_variable_value(BigInt(col.id), BigInt(variable.id), BigInt(targetMode.id), JSON.stringify(sourceValue));
          fixed += 1;
        }
      }
      editor.engine.apply_variables();
      editor.requestRender();
      alert(fixed > 0 ? `Applied '${recipe.name}' and fixed ${fixed} drifted mode values.` : `No drift found for '${recipe.name}'.`);
      refresh();
    };

    const deleteRecipe = (recipeId: string) => {
      const next = recipes.filter((r) => r.id !== recipeId);
      writeModeDriftRecipes(next);
      refresh();
    };

    if (recipes.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "font-size:10px;color:#94a3b8;";
      empty.textContent = "No recipes yet. Save a source→targets pattern, then one-click clean drift across variables.";
      recipeListWrap.appendChild(empty);
    } else {
      for (const recipe of recipes.slice(0, 8)) {
        const row = document.createElement("div");
        row.style.cssText = "background:#111827;border:1px solid #374151;border-radius:5px;padding:6px;display:flex;flex-direction:column;gap:5px;";

        const top = document.createElement("div");
        top.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:6px;";
        const label = document.createElement("div");
        label.style.cssText = "font-size:10px;color:#e2e8f0;font-weight:600;";
        label.textContent = recipe.name;
        top.appendChild(label);

        const typeBadge = document.createElement("span");
        typeBadge.style.cssText = "font-size:9px;color:#bfdbfe;background:#1e3a8a;border:1px solid #1d4ed8;border-radius:999px;padding:1px 6px;";
        typeBadge.textContent = recipe.value_type;
        top.appendChild(typeBadge);
        row.appendChild(top);

        const meta = document.createElement("div");
        meta.style.cssText = "font-size:10px;color:#93c5fd;";
        meta.textContent = `${recipe.source_mode_name} → ${recipe.target_mode_names.join(", ")}`;
        row.appendChild(meta);

        const actions = document.createElement("div");
        actions.style.cssText = "display:flex;gap:6px;";

        const applyBtn = document.createElement("button");
        applyBtn.style.cssText = "background:#065f46;border:1px solid #10b981;border-radius:4px;color:#d1fae5;cursor:pointer;font-size:10px;padding:2px 7px;";
        applyBtn.textContent = "Apply";
        applyBtn.onclick = () => applyRecipe(recipe);
        actions.appendChild(applyBtn);

        const delBtn = document.createElement("button");
        delBtn.style.cssText = "background:#3f1d1d;border:1px solid #ef4444;border-radius:4px;color:#fecaca;cursor:pointer;font-size:10px;padding:2px 7px;";
        delBtn.textContent = "Delete";
        delBtn.onclick = () => {
          if (!confirm(`Delete recipe '${recipe.name}'?`)) return;
          deleteRecipe(recipe.id);
        };
        actions.appendChild(delBtn);

        row.appendChild(actions);
        recipeListWrap.appendChild(row);
      }
    }

    modeRecipeSection.appendChild(recipeListWrap);
    container.appendChild(modeRecipeSection);

    // Variable alias graph inspector
    const graph = buildVariableDependencyGraph(collections);
    const graphSection = document.createElement("div");
    graphSection.style.cssText = "margin-bottom:12px;background:#16202c;border:1px solid #274159;border-radius:6px;padding:8px;";

    const graphHeader = document.createElement("div");
    graphHeader.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;";
    const graphTitle = document.createElement("div");
    graphTitle.style.cssText = "font-size:10px;color:#7dd3fc;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;";
    graphTitle.textContent = "Variable Alias Graph Inspector";
    graphHeader.appendChild(graphTitle);

    const graphMeta = document.createElement("div");
    graphMeta.style.cssText = "font-size:10px;color:#94a3b8;";
    graphMeta.textContent = `Nodes ${graph.nodes.size} · Edges ${graph.edges.length} · Unresolved ${graph.broken.length} · Cycles ${graph.cycles.length} · Chains ${graph.chains.length}`;
    graphHeader.appendChild(graphMeta);
    graphSection.appendChild(graphHeader);

    const graphActions = document.createElement("div");
    graphActions.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;";

    const issueWrap = document.createElement("div");
    issueWrap.style.cssText = "display:flex;flex-direction:column;gap:4px;max-height:180px;overflow:auto;";

    const jumpToVariable = (key: string) => {
      const node = graph.nodes.get(key);
      if (!node) return;
      selectedCollectionId = node.collectionId;
      variableSearchQuery = node.variableName;
      refresh();
    };

    const aliasLabel = (key: string) => {
      const n = graph.nodes.get(key);
      return n ? `${n.collectionName}/${n.variableName}` : key;
    };

    const setAliasFor = (source: VariableGraphNode, modeId: number, targetKey: string) => {
      const target = graph.nodes.get(targetKey);
      if (!target) return;
      editor.engine.push_undo();
      editor.engine.set_variable_value(
        BigInt(source.collectionId),
        BigInt(source.variableId),
        BigInt(modeId),
        JSON.stringify({ String: `{${target.collectionName}/${target.variableName}}` })
      );
      editor.engine.apply_variables();
      refresh();
    };

    const clearAliasFor = (source: VariableGraphNode, modeId: number) => {
      editor.engine.push_undo();
      editor.engine.set_variable_value(BigInt(source.collectionId), BigInt(source.variableId), BigInt(modeId), JSON.stringify({ String: "" }));
      editor.engine.apply_variables();
      refresh();
    };

    const autoFixBtn = document.createElement("button");
    autoFixBtn.style.cssText = "background:#052e16;border:1px solid #22c55e;border-radius:4px;color:#bbf7d0;font-size:10px;padding:2px 7px;cursor:pointer;";
    autoFixBtn.textContent = "Auto-fix unresolved";
    autoFixBtn.onclick = () => {
      const fixPlan = graph.broken
        .map((broken) => {
          const source = graph.nodes.get(broken.from);
          if (!source) return null;
          const targetKey = broken.reason === "self" ? null : (broken.candidates[0] || null);
          return { source, modeId: broken.modeId, targetKey };
        })
        .filter((v): v is { source: VariableGraphNode; modeId: number; targetKey: string | null } => Boolean(v));
      if (fixPlan.length === 0) return;
      editor.engine.push_undo();
      for (const fix of fixPlan) {
        if (fix.targetKey) {
          const target = graph.nodes.get(fix.targetKey);
          if (target) {
            editor.engine.set_variable_value(
              BigInt(fix.source.collectionId),
              BigInt(fix.source.variableId),
              BigInt(fix.modeId),
              JSON.stringify({ String: `{${target.collectionName}/${target.variableName}}` })
            );
            continue;
          }
        }
        editor.engine.set_variable_value(BigInt(fix.source.collectionId), BigInt(fix.source.variableId), BigInt(fix.modeId), JSON.stringify({ String: "" }));
      }
      editor.engine.apply_variables();
      refresh();
    };
    graphActions.appendChild(autoFixBtn);

    const breakCyclesBtn = document.createElement("button");
    breakCyclesBtn.style.cssText = "background:#3b0764;border:1px solid #a78bfa;border-radius:4px;color:#ede9fe;font-size:10px;padding:2px 7px;cursor:pointer;";
    breakCyclesBtn.textContent = "Break all cycles";
    breakCyclesBtn.onclick = () => {
      const breakPlan = new Map<string, { source: VariableGraphNode; modeId: number }>();
      for (const cyc of graph.cycles) {
        if (cyc.length < 2) continue;
        const source = graph.nodes.get(cyc[0]);
        if (!source) continue;
        const edge = graph.edges.find((e) => e.from === cyc[0] && e.to === cyc[1]);
        if (!edge) continue;
        breakPlan.set(`${source.key}:${edge.modeId}`, { source, modeId: edge.modeId });
      }
      if (breakPlan.size === 0) return;
      editor.engine.push_undo();
      for (const entry of breakPlan.values()) {
        editor.engine.set_variable_value(BigInt(entry.source.collectionId), BigInt(entry.source.variableId), BigInt(entry.modeId), JSON.stringify({ String: "" }));
      }
      editor.engine.apply_variables();
      refresh();
    };
    graphActions.appendChild(breakCyclesBtn);

    const collapseChainsBtn = document.createElement("button");
    collapseChainsBtn.style.cssText = "background:#082f49;border:1px solid #38bdf8;border-radius:4px;color:#bae6fd;font-size:10px;padding:2px 7px;cursor:pointer;";
    collapseChainsBtn.textContent = "Collapse all chains";
    collapseChainsBtn.onclick = () => {
      const collapsePlan = new Map<string, { source: VariableGraphNode; modeId: number; terminal: string }>();
      for (const chain of graph.chains) {
        if (chain.path.length < 3) continue;
        if (chain.terminal === chain.path[1]) continue;
        const source = graph.nodes.get(chain.startFrom);
        if (!source) continue;
        const key = `${source.key}:${chain.modeId}`;
        if (!collapsePlan.has(key)) {
          collapsePlan.set(key, { source, modeId: chain.modeId, terminal: chain.terminal });
        }
      }
      if (collapsePlan.size === 0) return;
      editor.engine.push_undo();
      for (const plan of collapsePlan.values()) {
        const target = graph.nodes.get(plan.terminal);
        if (!target) continue;
        editor.engine.set_variable_value(
          BigInt(plan.source.collectionId),
          BigInt(plan.source.variableId),
          BigInt(plan.modeId),
          JSON.stringify({ String: `{${target.collectionName}/${target.variableName}}` })
        );
      }
      editor.engine.apply_variables();
      refresh();
    };
    graphActions.appendChild(collapseChainsBtn);

    const copyReportBtn = document.createElement("button");
    copyReportBtn.style.cssText = "background:#0c4a6e;border:1px solid #38bdf8;border-radius:4px;color:#bae6fd;font-size:10px;padding:2px 7px;cursor:pointer;";
    copyReportBtn.textContent = "Copy report";
    copyReportBtn.onclick = async () => {
      const lines: string[] = [
        `Variable Alias Graph Inspector`,
        `Nodes: ${graph.nodes.size}`,
        `Edges: ${graph.edges.length}`,
        `Unresolved: ${graph.broken.length}`,
        `Cycles: ${graph.cycles.length}`,
        `Chains: ${graph.chains.length}`,
      ];
      if (graph.broken.length > 0) {
        lines.push("", "Unresolved aliases:");
        for (const broken of graph.broken.slice(0, 20)) {
          const source = graph.nodes.get(broken.from);
          if (!source) continue;
          lines.push(`- ${source.collectionName}/${source.variableName} [${broken.modeName}] -> {${broken.rawToken}} (${broken.reason})`);
        }
      }
      if (graph.cycles.length > 0) {
        lines.push("", "Cycles:");
        for (const cyc of graph.cycles.slice(0, 12)) {
          lines.push(`- ${cyc.map((key) => aliasLabel(key)).join(" -> ")}`);
        }
      }
      try {
        await navigator.clipboard.writeText(lines.join("\n"));
        copyReportBtn.textContent = "Copied";
        setTimeout(() => {
          copyReportBtn.textContent = "Copy report";
        }, 1200);
      } catch {
        // ignore clipboard errors
      }
    };
    graphActions.appendChild(copyReportBtn);

    graphSection.appendChild(graphActions);

    for (const broken of graph.broken.slice(0, 20)) {
      const source = graph.nodes.get(broken.from);
      if (!source) continue;
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:6px;background:rgba(127,29,29,0.28);border:1px solid rgba(248,113,113,0.38);border-radius:4px;padding:4px 6px;";

      const text = document.createElement("button");
      text.style.cssText = "flex:1;text-align:left;background:none;border:none;color:#fecaca;font-size:10px;cursor:pointer;";
      const reasonText = broken.reason === "ambiguous"
        ? "ambiguous"
        : broken.reason === "self"
          ? "self-reference"
          : "missing";
      text.textContent = `${source.collectionName}/${source.variableName} (${broken.modeName}) → {${broken.rawToken}} [${reasonText}]`;
      text.title = "Jump to source variable";
      text.onclick = () => jumpToVariable(broken.from);
      row.appendChild(text);

      if (broken.candidates.length > 0) {
        const retargetBtn = document.createElement("button");
        retargetBtn.style.cssText = "background:#1e3a8a;border:1px solid #60a5fa;border-radius:4px;color:#bfdbfe;font-size:10px;padding:2px 6px;cursor:pointer;";
        retargetBtn.textContent = "Retarget";
        retargetBtn.title = `Set alias to ${aliasLabel(broken.candidates[0])}`;
        retargetBtn.onclick = () => setAliasFor(source, broken.modeId, broken.candidates[0]);
        row.appendChild(retargetBtn);
      }

      const fixBtn = document.createElement("button");
      fixBtn.style.cssText = "background:#7f1d1d;border:1px solid #ef4444;border-radius:4px;color:#fecaca;font-size:10px;padding:2px 6px;cursor:pointer;";
      fixBtn.textContent = "Clear";
      fixBtn.onclick = () => clearAliasFor(source, broken.modeId);
      row.appendChild(fixBtn);
      issueWrap.appendChild(row);
    }

    for (const cyc of graph.cycles.slice(0, 8)) {
      const names = cyc.map((key) => aliasLabel(key));
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:6px;background:rgba(88,28,135,0.22);border:1px solid rgba(216,180,254,0.45);border-radius:4px;padding:4px 6px;";

      const cycBtn = document.createElement("button");
      cycBtn.style.cssText = "flex:1;text-align:left;background:none;border:none;color:#e9d5ff;font-size:10px;cursor:pointer;";
      cycBtn.textContent = `Cycle: ${names.join(" → ")}`;
      cycBtn.title = "Jump to first variable in cycle";
      cycBtn.onclick = () => jumpToVariable(cyc[0]);
      row.appendChild(cycBtn);

      if (cyc.length >= 2) {
        const source = graph.nodes.get(cyc[0]);
        const targetKey = cyc[1];
        if (source) {
          const breakBtn = document.createElement("button");
          breakBtn.style.cssText = "background:#4c1d95;border:1px solid #a78bfa;border-radius:4px;color:#ede9fe;font-size:10px;padding:2px 6px;cursor:pointer;";
          breakBtn.textContent = "Break";
          breakBtn.title = `Clear alias from ${aliasLabel(cyc[0])} to break cycle`;
          breakBtn.onclick = () => {
            const edge = graph.edges.find((e) => e.from === cyc[0] && e.to === targetKey);
            if (!edge) return;
            clearAliasFor(source, edge.modeId);
          };
          row.appendChild(breakBtn);
        }
      }

      issueWrap.appendChild(row);
    }

    for (const chain of graph.chains.slice(0, 12)) {
      const source = graph.nodes.get(chain.startFrom);
      if (!source) continue;
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:6px;background:rgba(8,47,73,0.28);border:1px solid rgba(56,189,248,0.42);border-radius:4px;padding:4px 6px;";

      const chainBtn = document.createElement("button");
      chainBtn.style.cssText = "flex:1;text-align:left;background:none;border:none;color:#bae6fd;font-size:10px;cursor:pointer;";
      chainBtn.textContent = `Chain (${chain.modeName}): ${chain.path.map((key) => aliasLabel(key)).join(" → ")}`;
      chainBtn.title = "Jump to chain start variable";
      chainBtn.onclick = () => jumpToVariable(chain.startFrom);
      row.appendChild(chainBtn);

      if (chain.terminal !== chain.path[1]) {
        const collapseBtn = document.createElement("button");
        collapseBtn.style.cssText = "background:#0c4a6e;border:1px solid #38bdf8;border-radius:4px;color:#bae6fd;font-size:10px;padding:2px 6px;cursor:pointer;";
        collapseBtn.textContent = "Collapse";
        collapseBtn.title = `Retarget start alias to terminal: ${aliasLabel(chain.terminal)}`;
        collapseBtn.onclick = () => setAliasFor(source, chain.modeId, chain.terminal);
        row.appendChild(collapseBtn);
      }

      issueWrap.appendChild(row);
    }

    if (issueWrap.children.length === 0) {
      const clean = document.createElement("div");
      clean.style.cssText = "font-size:10px;color:#86efac;background:rgba(22,101,52,0.25);border:1px solid rgba(74,222,128,0.38);border-radius:4px;padding:5px 6px;";
      clean.textContent = "No unresolved aliases or cycles found.";
      issueWrap.appendChild(clean);
    }

    graphSection.appendChild(issueWrap);
    container.appendChild(graphSection);

    // Variable scope audit (Collection/Page/Frame)
    const auditSection = document.createElement("div");
    auditSection.style.cssText = "margin-bottom:12px;background:#1a2332;border:1px solid #334155;border-radius:6px;padding:8px;";
    const auditHead = document.createElement("div");
    auditHead.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;";
    const auditTitle = document.createElement("div");
    auditTitle.style.cssText = "font-size:10px;color:#93c5fd;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;";
    auditTitle.textContent = "Variable Scope Audit";
    auditHead.appendChild(auditTitle);

    const auditScopeSel = document.createElement("select");
    auditScopeSel.style.cssText = "background:#111827;border:1px solid #374151;border-radius:4px;color:#cbd5e1;font-size:10px;padding:2px 6px;";
    for (const scope of ["Collection", "Page", "Frame"] as const) {
      const opt = document.createElement("option");
      opt.value = scope;
      opt.textContent = scope;
      if (scope === selectedScopeAudit) opt.selected = true;
      auditScopeSel.appendChild(opt);
    }
    auditScopeSel.onchange = () => {
      selectedScopeAudit = auditScopeSel.value as "Collection" | "Page" | "Frame";
      refresh();
    };
    auditHead.appendChild(auditScopeSel);
    auditSection.appendChild(auditHead);

    const auditList = document.createElement("div");
    auditList.style.cssText = "display:flex;flex-direction:column;gap:4px;max-height:140px;overflow:auto;";

    const nodeCache = new Map<number, any | null>();
    const readNode = (nodeId: number): any | null => {
      if (nodeCache.has(nodeId)) return nodeCache.get(nodeId) ?? null;
      let node: any = null;
      try { node = JSON.parse(editor.engine.get_node_json(BigInt(nodeId)) || "null"); } catch { node = null; }
      nodeCache.set(nodeId, node);
      return node;
    };

    const findTopFrameId = (nodeId: number): number => {
      let current = readNode(nodeId);
      let lastFrame = 0;
      let guard = 0;
      while (current && guard < 80) {
        if (String(current.kind || "") === "Frame") lastFrame = Number(current.id || 0);
        const parentId = Number(current.parent || 0);
        if (!parentId) break;
        current = readNode(parentId);
        guard += 1;
      }
      return lastFrame;
    };

    const findPageId = (nodeId: number): number => {
      let current = readNode(nodeId);
      let guard = 0;
      while (current && guard < 80) {
        if (typeof current.page_id === "number") return Number(current.page_id || 0);
        const parentId = Number(current.parent || 0);
        if (!parentId) break;
        current = readNode(parentId);
        guard += 1;
      }
      return 0;
    };

    const scopeIssues: Array<{ variable: VarVariable; mode: string; detail: string }> = [];
    for (const variable of col.variables || []) {
      let usages: Array<{ node_id?: number }> = [];
      try {
        usages = JSON.parse((editor.engine as any).get_variable_usages?.(BigInt(col.id), BigInt(variable.id)) || "[]");
      } catch {
        usages = [];
      }
      if (usages.length <= 1 || selectedScopeAudit === "Collection") continue;

      if (selectedScopeAudit === "Page") {
        const pages = new Set<number>();
        for (const u of usages) {
          const nodeId = Number(u.node_id || 0);
          if (nodeId <= 0) continue;
          pages.add(findPageId(nodeId));
        }
        if (pages.size > 1) {
          scopeIssues.push({ variable, mode: "Page", detail: `used in ${pages.size} pages` });
        }
      } else if (selectedScopeAudit === "Frame") {
        const frames = new Set<number>();
        for (const u of usages) {
          const nodeId = Number(u.node_id || 0);
          if (nodeId <= 0) continue;
          frames.add(findTopFrameId(nodeId));
        }
        if (frames.size > 1) {
          scopeIssues.push({ variable, mode: "Frame", detail: `used in ${frames.size} top frames` });
        }
      }
    }

    if (scopeIssues.length === 0) {
      const ok = document.createElement("div");
      ok.style.cssText = "font-size:10px;color:#86efac;background:rgba(22,101,52,0.25);border:1px solid rgba(74,222,128,0.35);border-radius:4px;padding:5px 6px;";
      ok.textContent = selectedScopeAudit === "Collection" ? "Collection scope selected. Switch to Page/Frame to lint scope leaks." : `No ${selectedScopeAudit.toLowerCase()} scope leaks found.`;
      auditList.appendChild(ok);
    } else {
      for (const issue of scopeIssues.slice(0, 24)) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:6px;background:rgba(127,29,29,0.24);border:1px solid rgba(248,113,113,0.36);border-radius:4px;padding:4px 6px;";

        const text = document.createElement("div");
        text.style.cssText = "flex:1;font-size:10px;color:#fecaca;";
        text.textContent = `${issue.variable.name} (${issue.variable.value_type}) · ${issue.detail}`;
        row.appendChild(text);

        const filterBtn = document.createElement("button");
        filterBtn.style.cssText = "background:#1e3a8a;border:1px solid #60a5fa;border-radius:4px;color:#bfdbfe;font-size:10px;padding:2px 6px;cursor:pointer;";
        filterBtn.textContent = "Filter";
        filterBtn.onclick = () => {
          variableSearchQuery = issue.variable.name;
          refresh();
        };
        row.appendChild(filterBtn);

        auditList.appendChild(row);
      }
    }

    auditSection.appendChild(auditList);
    container.appendChild(auditSection);

    // Variable contract tests (release preflight)
    const contractSection = document.createElement("div");
    contractSection.style.cssText = "margin-bottom:12px;background:#1a2332;border:1px solid #334155;border-radius:6px;padding:8px;";
    const contractHead = document.createElement("div");
    contractHead.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;";
    const contractTitle = document.createElement("div");
    contractTitle.style.cssText = "font-size:10px;color:#93c5fd;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;";
    contractTitle.textContent = "Variable Contract Tests";
    contractHead.appendChild(contractTitle);

    const contractRunBtn = document.createElement("button");
    contractRunBtn.style.cssText = "background:#0f172a;border:1px solid #475569;border-radius:4px;color:#cbd5e1;font-size:10px;padding:2px 8px;cursor:pointer;";
    contractRunBtn.textContent = "Run";
    contractHead.appendChild(contractRunBtn);
    contractSection.appendChild(contractHead);

    let components: Array<{ id: number; name: string }> = [];
    try {
      components = JSON.parse(editor.engine.get_components?.() || "[]").map((c: any) => ({ id: Number(c.id || 0), name: String(c.name || `Component #${c.id}`) })).filter((c: any) => c.id > 0);
    } catch {
      components = [];
    }

    if (!selectedContractComponentId || !components.some((comp) => comp.id === selectedContractComponentId)) {
      selectedContractComponentId = components[0]?.id ?? null;
    }

    const existingContracts = readContractEntries();
    const contractMap = new Map<number, VariableContractEntry>();
    for (const entry of existingContracts) contractMap.set(Number(entry.component_id || 0), entry);
    const selectedContract = selectedContractComponentId ? contractMap.get(selectedContractComponentId) : null;
    if (!contractSchemaDraft.trim() && selectedContract) {
      contractSchemaDraft = stringifyContractSchema(selectedContract.required || []);
    }

    const editorRow = document.createElement("div");
    editorRow.style.cssText = "display:flex;flex-direction:column;gap:6px;margin-bottom:8px;";

    const compSel = document.createElement("select");
    compSel.style.cssText = "width:100%;background:#111827;border:1px solid #374151;border-radius:4px;color:#cbd5e1;font-size:10px;padding:4px 6px;";
    for (const comp of components) {
      const opt = document.createElement("option");
      opt.value = String(comp.id);
      opt.textContent = `${comp.name} (#${comp.id})`;
      if (comp.id === selectedContractComponentId) opt.selected = true;
      compSel.appendChild(opt);
    }
    compSel.onchange = () => {
      selectedContractComponentId = Number(compSel.value || 0) || null;
      const picked = selectedContractComponentId ? contractMap.get(selectedContractComponentId) : null;
      contractSchemaDraft = picked ? stringifyContractSchema(picked.required || []) : "";
      refresh();
    };
    editorRow.appendChild(compSel);

    const schemaInput = document.createElement("input");
    schemaInput.type = "text";
    schemaInput.placeholder = "e.g. color.primary:Color, spacing.md:Number";
    schemaInput.value = contractSchemaDraft;
    schemaInput.style.cssText = "width:100%;background:#111827;border:1px solid #374151;border-radius:4px;color:#cbd5e1;font-size:10px;padding:4px 6px;";
    schemaInput.oninput = () => {
      contractSchemaDraft = schemaInput.value;
    };
    editorRow.appendChild(schemaInput);

    const hint = document.createElement("div");
    hint.style.cssText = "font-size:9px;color:#94a3b8;line-height:1.35;";
    hint.textContent = "컴포넌트별 required variable schema를 저장하고 릴리즈 전 Run으로 누락/타입불일치를 한 번에 검사합니다.";
    editorRow.appendChild(hint);

    const rowButtons = document.createElement("div");
    rowButtons.style.cssText = "display:flex;gap:6px;";
    const saveContractBtn = document.createElement("button");
    saveContractBtn.className = "prop-btn";
    saveContractBtn.textContent = "Save contract";
    saveContractBtn.style.cssText = "flex:1;font-size:10px;padding:3px 6px;";
    saveContractBtn.onclick = () => {
      if (!selectedContractComponentId) return;
      const comp = components.find((item) => item.id === selectedContractComponentId);
      if (!comp) return;
      const required = parseContractSchema(contractSchemaDraft);
      const next = readContractEntries().filter((entry) => Number(entry.component_id || 0) !== selectedContractComponentId);
      next.unshift({
        component_id: selectedContractComponentId,
        component_name: comp.name,
        required,
        updated_at: Date.now(),
      });
      writeContractEntries(next);
      refresh();
    };
    rowButtons.appendChild(saveContractBtn);

    const removeContractBtn = document.createElement("button");
    removeContractBtn.className = "prop-btn";
    removeContractBtn.textContent = "Delete";
    removeContractBtn.style.cssText = "font-size:10px;padding:3px 6px;";
    removeContractBtn.onclick = () => {
      if (!selectedContractComponentId) return;
      const next = readContractEntries().filter((entry) => Number(entry.component_id || 0) !== selectedContractComponentId);
      writeContractEntries(next);
      contractSchemaDraft = "";
      refresh();
    };
    rowButtons.appendChild(removeContractBtn);
    editorRow.appendChild(rowButtons);

    contractSection.appendChild(editorRow);

    const contractResult = document.createElement("div");
    contractResult.style.cssText = "display:flex;flex-direction:column;gap:4px;max-height:170px;overflow:auto;";

    const runContractTests = () => {
      const contracts = readContractEntries();
      const variableTypeByName = new Map<string, string>();
      for (const collection of collections) {
        for (const variable of collection.variables || []) {
          const name = String(variable.name || "").trim();
          if (!name || variableTypeByName.has(name)) continue;
          variableTypeByName.set(name, String(variable.value_type || ""));
        }
      }

      const issues: VariableContractIssue[] = [];
      for (const contract of contracts) {
        for (const required of contract.required || []) {
          const actualType = variableTypeByName.get(required.name) || null;
          if (!actualType) {
            issues.push({
              componentName: contract.component_name || `Component #${contract.component_id}`,
              variableName: required.name,
              expectedType: required.value_type,
              actualType: null,
              kind: "missing",
            });
            continue;
          }
          if (actualType !== required.value_type) {
            issues.push({
              componentName: contract.component_name || `Component #${contract.component_id}`,
              variableName: required.name,
              expectedType: required.value_type,
              actualType,
              kind: "type-mismatch",
            });
          }
        }
      }

      contractResult.innerHTML = "";
      const summary = document.createElement("div");
      summary.style.cssText = `font-size:10px;padding:5px 6px;border-radius:4px;border:1px solid ${issues.length > 0 ? "rgba(248,113,113,0.35)" : "rgba(74,222,128,0.35)"};background:${issues.length > 0 ? "rgba(127,29,29,0.24)" : "rgba(22,101,52,0.25)"};color:${issues.length > 0 ? "#fecaca" : "#86efac"};`;
      summary.textContent = issues.length > 0
        ? `Contracts ${contracts.length}개 검사 완료 · 이슈 ${issues.length}개`
        : `Contracts ${contracts.length}개 검사 완료 · 누락/타입불일치 없음`;
      contractResult.appendChild(summary);

      for (const issue of issues.slice(0, 30)) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:6px;background:rgba(15,23,42,0.5);border:1px solid rgba(248,113,113,0.28);border-radius:4px;padding:4px 6px;";

        const text = document.createElement("div");
        text.style.cssText = "flex:1;font-size:10px;color:#fecaca;line-height:1.35;";
        text.textContent = issue.kind === "missing"
          ? `${issue.componentName}: ${issue.variableName}:${issue.expectedType} missing`
          : `${issue.componentName}: ${issue.variableName} expected ${issue.expectedType}, got ${issue.actualType}`;
        row.appendChild(text);

        if (issue.kind === "missing") {
          const fixBtn = document.createElement("button");
          fixBtn.className = "prop-btn";
          fixBtn.textContent = "Create";
          fixBtn.style.cssText = "font-size:10px;padding:2px 6px;";
          fixBtn.onclick = () => {
            if (!selectedCollectionId) return;
            editor.engine.push_undo();
            editor.engine.create_variable(BigInt(selectedCollectionId), issue.variableName, issue.expectedType);
            refresh();
          };
          row.appendChild(fixBtn);
        }

        contractResult.appendChild(row);
      }
    };

    contractRunBtn.onclick = runContractTests;
    runContractTests();

    contractSection.appendChild(contractResult);
    container.appendChild(contractSection);

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
          const before = cloneModeValues(v.values_by_mode);
          const after = cloneModeValues(v.values_by_mode);
          after[String(mode.id)] = { ...(val || {}) };

          editor.engine.push_undo();
          editor.engine.set_variable_value(BigInt(col.id), BigInt(v.id), BigInt(mode.id), JSON.stringify(val));
          editor.engine.apply_variables();
          editor.requestRender();

          pushTimelineEntry(col, v, mode, before, after);
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
