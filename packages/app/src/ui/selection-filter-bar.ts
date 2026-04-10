import type { Editor } from "../editor";

type FilterState = {
  type: string;
  name: string;
  visibility: "any" | "visible" | "hidden";
  lock: "any" | "locked" | "unlocked";
  styleLinkedOnly: boolean;
};

function nodeType(node: any): string {
  const kind = node?.kind;
  if (!kind || typeof kind !== "object") return "Unknown";
  return Object.keys(kind)[0] || "Unknown";
}

function isStyleLinked(node: any): boolean {
  return node?.color_style_id != null || node?.text_style_id != null;
}

function matches(node: any, s: FilterState): boolean {
  if (s.type !== "any" && nodeType(node) !== s.type) return false;
  if (s.name.trim()) {
    const q = s.name.trim().toLowerCase();
    const nm = String(node?.name ?? "").toLowerCase();
    if (!nm.includes(q)) return false;
  }
  if (s.visibility === "visible" && node?.visible === false) return false;
  if (s.visibility === "hidden" && node?.visible !== false) return false;
  if (s.lock === "locked" && node?.locked !== true) return false;
  if (s.lock === "unlocked" && node?.locked === true) return false;
  if (s.styleLinkedOnly && !isStyleLinked(node)) return false;
  return true;
}

export function setupSelectionFilterBar(editor: Editor) {
  const root = document.createElement("div");
  root.className = "selection-filter-bar";
  root.style.display = "none";

  root.innerHTML = `
    <div class="sfb-title">Selection Filter</div>
    <label>Type
      <select class="sfb-type">
        <option value="any">Any</option>
      </select>
    </label>
    <label>Name
      <input class="sfb-name" type="text" placeholder="contains…" />
    </label>
    <label>Visibility
      <select class="sfb-visibility">
        <option value="any">Any</option>
        <option value="visible">Visible</option>
        <option value="hidden">Hidden</option>
      </select>
    </label>
    <label>Lock
      <select class="sfb-lock">
        <option value="any">Any</option>
        <option value="unlocked">Unlocked</option>
        <option value="locked">Locked</option>
      </select>
    </label>
    <label class="sfb-check"><input class="sfb-style" type="checkbox" /> Style linked only</label>
    <button class="sfb-btn-filter" type="button">Filter selection</button>
    <button class="sfb-btn-expand" type="button">Expand in page</button>
    <button class="sfb-btn-reset" type="button">Reset</button>
    <span class="sfb-count"></span>
  `;

  document.body.appendChild(root);

  const $type = root.querySelector(".sfb-type") as HTMLSelectElement;
  const $name = root.querySelector(".sfb-name") as HTMLInputElement;
  const $vis = root.querySelector(".sfb-visibility") as HTMLSelectElement;
  const $lock = root.querySelector(".sfb-lock") as HTMLSelectElement;
  const $style = root.querySelector(".sfb-style") as HTMLInputElement;
  const $count = root.querySelector(".sfb-count") as HTMLSpanElement;
  const $btnFilter = root.querySelector(".sfb-btn-filter") as HTMLButtonElement;
  const $btnExpand = root.querySelector(".sfb-btn-expand") as HTMLButtonElement;
  const $btnReset = root.querySelector(".sfb-btn-reset") as HTMLButtonElement;

  const state: FilterState = {
    type: "any",
    name: "",
    visibility: "any",
    lock: "any",
    styleLinkedOnly: false,
  };

  const collectNodes = (): any[] => {
    try {
      return JSON.parse((editor.engine as any).get_all_nodes?.() || "[]");
    } catch {
      return [];
    }
  };

  const refreshTypeOptions = (nodes: any[]) => {
    const types = Array.from(new Set(nodes.map(nodeType))).sort();
    const prev = state.type;
    $type.innerHTML = `<option value="any">Any</option>${types.map((t) => `<option value="${t}">${t}</option>`).join("")}`;
    if (types.includes(prev)) $type.value = prev;
    else $type.value = "any";
    state.type = $type.value;
  };

  const updateCount = (selIds: number[]) => {
    const all = collectNodes();
    const byId = new Map(all.map((n: any) => [Number(n.id), n]));
    const hit = selIds.map((id) => byId.get(id)).filter((n) => n && matches(n, state));
    $count.textContent = `${hit.length}/${selIds.length}`;
  };

  const applySelection = (expand = false) => {
    const all = collectNodes();
    const sel = editor.getSelection();
    if (sel.length === 0) return;

    const byId = new Map(all.map((n: any) => [Number(n.id), n]));
    let targetIds: number[] = [];

    if (!expand) {
      targetIds = sel.filter((id) => {
        const n = byId.get(id);
        return n ? matches(n, state) : false;
      });
    } else {
      const pageId = (() => {
        const first = byId.get(sel[0]);
        return first?.page_id ?? null;
      })();
      targetIds = all
        .filter((n: any) => (pageId == null ? true : n.page_id === pageId))
        .filter((n: any) => matches(n, state))
        .map((n: any) => Number(n.id));
    }

    editor.engine.set_selection(new Uint32Array(targetIds));
    editor.notifySelectionChanged(targetIds);
    editor.requestRender();
  };

  const syncFromUI = () => {
    state.type = $type.value;
    state.name = $name.value;
    state.visibility = $vis.value as any;
    state.lock = $lock.value as any;
    state.styleLinkedOnly = !!$style.checked;
    updateCount(editor.getSelection());
  };

  $type.addEventListener("change", syncFromUI);
  $name.addEventListener("input", syncFromUI);
  $vis.addEventListener("change", syncFromUI);
  $lock.addEventListener("change", syncFromUI);
  $style.addEventListener("change", syncFromUI);

  $btnFilter.addEventListener("click", () => applySelection(false));
  $btnExpand.addEventListener("click", () => applySelection(true));
  $btnReset.addEventListener("click", () => {
    state.type = "any";
    state.name = "";
    state.visibility = "any";
    state.lock = "any";
    state.styleLinkedOnly = false;
    $type.value = "any";
    $name.value = "";
    $vis.value = "any";
    $lock.value = "any";
    $style.checked = false;
    updateCount(editor.getSelection());
  });

  editor.onSelection((ids) => {
    const show = ids.length > 0;
    root.style.display = show ? "flex" : "none";
    if (!show) return;
    const all = collectNodes();
    const byId = new Map(all.map((n: any) => [Number(n.id), n]));
    const selectedNodes = ids.map((id) => byId.get(id)).filter(Boolean);
    refreshTypeOptions(selectedNodes.length ? selectedNodes : all);
    updateCount(ids);
  });
}
