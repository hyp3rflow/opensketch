import type { Editor } from "../editor";

type SetAxis = { name: string; values: string[] };

type MatrixEditorOptions = {
  editor: Editor;
  instanceId: number;
  setId: number;
  currentComponentId: number;
  currentValues: Record<string, string>;
  axes: SetAxis[];
  variantMap: Record<string, number>;
  onApplied: () => void;
};

let overlay: HTMLDivElement | null = null;

const makeKey = (values: Record<string, string>) =>
  Object.keys(values)
    .sort()
    .map((k) => `${k}=${values[k] ?? ""}`)
    .join(",");

const parseKey = (key: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const part of String(key).split(",")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
};

function applyAxisConfig(opts: MatrixEditorOptions, axis: SetAxis, nextAxisName: string, nextValues: string[]): boolean {
  const targetAxisName = String(nextAxisName || "").trim();
  if (!targetAxisName) {
    alert("Axis name cannot be empty.");
    return false;
  }
  if (nextValues.length === 0) {
    alert("Axis must have at least one value.");
    return false;
  }
  if (new Set(nextValues).size !== nextValues.length) {
    alert("Duplicate values are not allowed.");
    return false;
  }

  const renamed = targetAxisName !== axis.name;
  const valuesChanged = JSON.stringify(axis.values) !== JSON.stringify(nextValues);
  if (!renamed && !valuesChanged) return true;

  opts.editor.pushUndo();

  if (renamed) {
    const renamedOk = (opts.editor.engine as any).rename_component_set_axis?.(BigInt(opts.setId), axis.name, targetAxisName);
    if (!renamedOk) {
      alert("Failed to rename axis.");
      return false;
    }
  }

  if (valuesChanged) {
    const updateOk = (opts.editor.engine as any).update_component_set_axis(BigInt(opts.setId), targetAxisName, JSON.stringify(nextValues));
    if (!updateOk) {
      alert("Failed to update axis values.");
      return false;
    }
  }

  for (const [oldKey, compId] of Object.entries(opts.variantMap || {})) {
    const values = parseKey(oldKey);
    if (renamed && values[axis.name] != null) {
      values[targetAxisName] = values[axis.name];
      delete values[axis.name];
    }
    if (values[targetAxisName] != null) {
      const oldVal = String(values[targetAxisName]);
      const oldIndex = axis.values.indexOf(oldVal);
      if (oldIndex >= 0 && oldIndex < nextValues.length) values[targetAxisName] = nextValues[oldIndex];
      else if (!nextValues.includes(oldVal)) continue;
    }
    (opts.editor.engine as any).set_component_set_variant_mapping(BigInt(opts.setId), JSON.stringify(values), BigInt(Number(compId || 0)));
  }

  const switchedValues = { ...opts.currentValues };
  if (renamed && switchedValues[axis.name] != null) {
    switchedValues[targetAxisName] = switchedValues[axis.name];
    delete switchedValues[axis.name];
  }
  if (switchedValues[targetAxisName] != null && !nextValues.includes(switchedValues[targetAxisName])) {
    switchedValues[targetAxisName] = nextValues[0] || "";
  }
  (opts.editor.engine as any).switch_instance_set_variant(BigInt(opts.instanceId), JSON.stringify(switchedValues));
  opts.editor.requestRender();
  opts.onApplied();
  return true;
}

export function openComponentSetMatrixEditor(opts: MatrixEditorOptions): void {
  closeComponentSetMatrixEditor();
  if (!opts.axes || opts.axes.length < 2) {
    alert("Matrix editor requires at least 2 axes.");
    return;
  }

  const localAxes: SetAxis[] = opts.axes.map((a) => ({ name: String(a.name), values: [...(a.values || [])] }));
  let rowAxisIndex = 0;
  let colAxisIndex = localAxes.length > 1 ? 1 : 0;
  const extraFilters: Record<string, string> = {};

  const syncFilterDefaults = () => {
    for (const axis of localAxes) {
      if (!extraFilters[axis.name]) {
        extraFilters[axis.name] = opts.currentValues[axis.name] ?? axis.values[0] ?? "";
      }
    }
  };
  syncFilterDefaults();

  overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:12000;display:flex;align-items:center;justify-content:center;";

  const modal = document.createElement("div");
  modal.style.cssText = "width:min(980px,94vw);max-height:90vh;overflow:auto;background:#1f1f23;border:1px solid #3f3f46;border-radius:12px;padding:12px;color:#ddd;font-family:Inter,system-ui,sans-serif;";

  const titleRow = document.createElement("div");
  titleRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;";
  titleRow.innerHTML = `<strong style=\"font-size:13px;color:#c4b5fd;\">Variant Matrix Editor</strong>`;
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = "background:none;border:none;color:#aaa;cursor:pointer;font-size:16px;";
  closeBtn.onclick = () => closeComponentSetMatrixEditor();
  titleRow.appendChild(closeBtn);
  modal.appendChild(titleRow);

  const controlsRow = document.createElement("div");
  controlsRow.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:10px;padding:8px;background:#232329;border:1px solid #3f3f46;border-radius:8px;";

  const rowSelect = document.createElement("select");
  rowSelect.style.cssText = "height:28px;background:#1a1a1f;border:1px solid #4c1d95;border-radius:6px;color:#ddd;padding:0 8px;font-size:11px;";
  const colSelect = document.createElement("select");
  colSelect.style.cssText = rowSelect.style.cssText;

  const rebuildAxisOptions = () => {
    rowSelect.innerHTML = "";
    colSelect.innerHTML = "";
    localAxes.forEach((axis, idx) => {
      const ro = document.createElement("option");
      ro.value = String(idx);
      ro.textContent = axis.name;
      rowSelect.appendChild(ro);
      const co = document.createElement("option");
      co.value = String(idx);
      co.textContent = axis.name;
      colSelect.appendChild(co);
    });
    rowSelect.value = String(rowAxisIndex);
    colSelect.value = String(colAxisIndex);
  };
  rebuildAxisOptions();

  controlsRow.appendChild(Object.assign(document.createElement("span"), { textContent: "Rows" }));
  controlsRow.appendChild(rowSelect);
  controlsRow.appendChild(Object.assign(document.createElement("span"), { textContent: "Columns" }));
  controlsRow.appendChild(colSelect);

  const filtersWrap = document.createElement("div");
  filtersWrap.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center;";
  controlsRow.appendChild(filtersWrap);
  modal.appendChild(controlsRow);

  const axisWrap = document.createElement("div");
  axisWrap.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;";
  modal.appendChild(axisWrap);

  const info = document.createElement("div");
  info.style.cssText = "font-size:11px;color:#a1a1aa;margin-bottom:8px;";
  info.textContent = "Cell click: mapped variant는 switch, 빈 셀은 현재 컴포넌트로 map + switch";
  modal.appendChild(info);

  const gridHost = document.createElement("div");
  modal.appendChild(gridHost);

  const render = () => {
    const rowAxis = localAxes[rowAxisIndex];
    const colAxis = localAxes[colAxisIndex];
    if (!rowAxis || !colAxis) return;

    filtersWrap.innerHTML = "";
    localAxes.forEach((axis, idx) => {
      if (idx === rowAxisIndex || idx === colAxisIndex) return;
      const label = document.createElement("label");
      label.style.cssText = "display:flex;align-items:center;gap:4px;font-size:10px;color:#bbb;";
      label.textContent = `${axis.name}:`;
      const sel = document.createElement("select");
      sel.style.cssText = "height:24px;background:#1a1a1f;border:1px solid #4c1d95;border-radius:5px;color:#ddd;padding:0 6px;font-size:10px;";
      for (const v of axis.values) {
        const o = document.createElement("option");
        o.value = v;
        o.textContent = v;
        if ((extraFilters[axis.name] || axis.values[0] || "") === v) o.selected = true;
        sel.appendChild(o);
      }
      sel.onchange = () => {
        extraFilters[axis.name] = sel.value;
        render();
      };
      label.appendChild(sel);
      filtersWrap.appendChild(label);
    });

    axisWrap.innerHTML = "";
    [rowAxis, colAxis].forEach((axis, axisIdx) => {
      const card = document.createElement("div");
      card.style.cssText = "background:#26262b;border:1px solid #3f3f46;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px;";

      const badge = document.createElement("div");
      badge.textContent = axisIdx === 0 ? "Row Axis" : "Column Axis";
      badge.style.cssText = "font-size:10px;color:#a78bfa;";
      card.appendChild(badge);

      const nameInput = document.createElement("input");
      nameInput.value = axis.name;
      nameInput.style.cssText = "height:28px;background:#1a1a1f;border:1px solid #4c1d95;border-radius:6px;color:#ddd;padding:0 8px;font-size:12px;font-weight:600;";
      card.appendChild(nameInput);

      const valuesInput = document.createElement("textarea");
      valuesInput.value = axis.values.join(", ");
      valuesInput.rows = 3;
      valuesInput.style.cssText = "background:#1a1a1f;border:1px solid #4c1d95;border-radius:6px;color:#ddd;padding:6px 8px;font-size:11px;resize:vertical;";
      card.appendChild(valuesInput);

      const applyBtn = document.createElement("button");
      applyBtn.textContent = "Apply axis";
      applyBtn.style.cssText = "height:26px;background:rgba(139,92,246,0.18);border:1px solid rgba(139,92,246,0.45);border-radius:6px;color:#ddd;font-size:11px;cursor:pointer;";
      applyBtn.onclick = () => {
        const nextAxisName = nameInput.value.trim();
        const nextValues = valuesInput.value.split(",").map((v) => v.trim()).filter(Boolean);
        if (!applyAxisConfig(opts, axis, nextAxisName, nextValues)) return;

        axis.name = nextAxisName;
        axis.values = [...nextValues];
        opts.currentValues = { ...opts.currentValues, [axis.name]: opts.currentValues[axis.name] ?? axis.values[0] ?? "" };
        delete extraFilters[axis.name];
        syncFilterDefaults();
        rebuildAxisOptions();
        render();
      };
      card.appendChild(applyBtn);
      axisWrap.appendChild(card);
    });

    gridHost.innerHTML = "";
    const rowValues = rowAxis.values;
    const colValues = colAxis.values;

    const grid = document.createElement("div");
    grid.style.cssText = `display:grid;grid-template-columns:88px repeat(${Math.max(1, colValues.length)}, minmax(82px,1fr));gap:4px;`;

    const corner = document.createElement("div");
    corner.style.cssText = "font-size:10px;color:#a78bfa;padding:4px;";
    corner.textContent = `${rowAxis.name} ↓ / ${colAxis.name} →`;
    grid.appendChild(corner);

    for (const cv of colValues) {
      const h = document.createElement("div");
      h.style.cssText = "font-size:10px;text-align:center;padding:4px;border:1px solid #4c1d95;border-radius:4px;background:rgba(139,92,246,0.12);";
      h.textContent = cv;
      grid.appendChild(h);
    }

    const fixedValues: Record<string, string> = { ...opts.currentValues };
    localAxes.forEach((axis, idx) => {
      if (idx === rowAxisIndex || idx === colAxisIndex) return;
      fixedValues[axis.name] = extraFilters[axis.name] ?? axis.values[0] ?? "";
    });

    for (const rv of rowValues) {
      const yl = document.createElement("div");
      yl.style.cssText = "font-size:10px;padding:4px;border:1px solid #4c1d95;border-radius:4px;background:rgba(139,92,246,0.08);";
      yl.textContent = rv;
      grid.appendChild(yl);

      for (const cv of colValues) {
        const values = { ...fixedValues, [rowAxis.name]: rv, [colAxis.name]: cv };
        const key = makeKey(values);
        const mappedCompId = Number(opts.variantMap[key] || 0);
        const isMapped = mappedCompId > 0;
        const isActive = mappedCompId === opts.currentComponentId;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.style.cssText = `min-height:28px;border-radius:5px;cursor:pointer;border:1px solid ${isActive ? "#8b5cf6" : isMapped ? "rgba(139,92,246,0.45)" : "#3f3f46"};background:${isActive ? "rgba(139,92,246,0.35)" : isMapped ? "rgba(139,92,246,0.16)" : "#232329"};color:${isMapped ? "#ede9fe" : "#a1a1aa"};font-size:10px;`;
        btn.textContent = isMapped ? `#${mappedCompId}` : "+";
        btn.onclick = () => {
          opts.editor.pushUndo();
          if (!isMapped) {
            (opts.editor.engine as any).set_component_set_variant_mapping(BigInt(opts.setId), JSON.stringify(values), BigInt(opts.currentComponentId));
          }
          (opts.editor.engine as any).switch_instance_set_variant(BigInt(opts.instanceId), JSON.stringify(values));
          opts.editor.requestRender();
          opts.onApplied();
          closeComponentSetMatrixEditor();
        };
        grid.appendChild(btn);
      }
    }

    gridHost.appendChild(grid);
  };

  rowSelect.onchange = () => {
    rowAxisIndex = Number(rowSelect.value);
    if (rowAxisIndex === colAxisIndex) {
      colAxisIndex = (rowAxisIndex + 1) % localAxes.length;
      colSelect.value = String(colAxisIndex);
    }
    render();
  };
  colSelect.onchange = () => {
    colAxisIndex = Number(colSelect.value);
    if (rowAxisIndex === colAxisIndex) {
      rowAxisIndex = (colAxisIndex + 1) % localAxes.length;
      rowSelect.value = String(rowAxisIndex);
    }
    render();
  };

  render();

  overlay.appendChild(modal);
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) closeComponentSetMatrixEditor();
  });
  document.body.appendChild(overlay);
}

export function closeComponentSetMatrixEditor(): void {
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
}
