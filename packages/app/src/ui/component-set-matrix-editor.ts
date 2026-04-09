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

export function openComponentSetMatrixEditor(opts: MatrixEditorOptions): void {
  closeComponentSetMatrixEditor();
  if (!opts.axes || opts.axes.length < 2) {
    alert("Matrix editor requires at least 2 axes.");
    return;
  }

  overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:12000;display:flex;align-items:center;justify-content:center;";

  const modal = document.createElement("div");
  modal.style.cssText = "width:min(960px,92vw);max-height:88vh;overflow:auto;background:#1f1f23;border:1px solid #3f3f46;border-radius:12px;padding:12px;color:#ddd;font-family:Inter,system-ui,sans-serif;";

  const titleRow = document.createElement("div");
  titleRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;";
  titleRow.innerHTML = `<strong style=\"font-size:13px;color:#c4b5fd;\">Variant Matrix Editor</strong>`;
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = "background:none;border:none;color:#aaa;cursor:pointer;font-size:16px;";
  closeBtn.onclick = () => closeComponentSetMatrixEditor();
  titleRow.appendChild(closeBtn);
  modal.appendChild(titleRow);

  const axisWrap = document.createElement("div");
  axisWrap.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;";

  const makeKey = (values: Record<string, string>) => Object.keys(values).sort().map((k) => `${k}=${values[k] ?? ""}`).join(",");
  const parseKey = (key: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const part of String(key).split(",")) {
      const i = part.indexOf("=");
      if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
    }
    return out;
  };

  for (const axis of opts.axes.slice(0, 2)) {
    const card = document.createElement("div");
    card.style.cssText = "background:#26262b;border:1px solid #3f3f46;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px;";

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
      const targetAxisName = nameInput.value.trim();
      const nextValues = valuesInput.value.split(",").map((v) => v.trim()).filter(Boolean);
      if (!targetAxisName) return alert("Axis name cannot be empty.");
      if (nextValues.length === 0) return alert("Axis must have at least one value.");
      if (new Set(nextValues).size !== nextValues.length) return alert("Duplicate values are not allowed.");

      opts.editor.pushUndo();
      const renamed = targetAxisName !== axis.name;
      if (renamed) {
        const renamedOk = (opts.editor.engine as any).rename_component_set_axis?.(BigInt(opts.setId), axis.name, targetAxisName);
        if (!renamedOk) return alert("Failed to rename axis.");
      }

      const updateOk = (opts.editor.engine as any).update_component_set_axis(BigInt(opts.setId), targetAxisName, JSON.stringify(nextValues));
      if (!updateOk) return alert("Failed to update axis values.");

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
      closeComponentSetMatrixEditor();
    };
    card.appendChild(applyBtn);
    axisWrap.appendChild(card);
  }

  modal.appendChild(axisWrap);

  const info = document.createElement("div");
  info.style.cssText = "font-size:11px;color:#a1a1aa;margin-bottom:8px;";
  info.textContent = "Cell click: mapped variant는 switch, 빈 셀은 현재 컴포넌트로 map + switch";
  modal.appendChild(info);

  const [xAxis, yAxis] = opts.axes;
  const grid = document.createElement("div");
  grid.style.cssText = `display:grid;grid-template-columns:88px repeat(${Math.max(1, xAxis.values.length)}, minmax(82px,1fr));gap:4px;`;

  const corner = document.createElement("div");
  corner.style.cssText = "font-size:10px;color:#a78bfa;padding:4px;";
  corner.textContent = `${yAxis.name} ↓ / ${xAxis.name} →`;
  grid.appendChild(corner);
  for (const xv of xAxis.values) {
    const h = document.createElement("div");
    h.style.cssText = "font-size:10px;text-align:center;padding:4px;border:1px solid #4c1d95;border-radius:4px;background:rgba(139,92,246,0.12);";
    h.textContent = xv;
    grid.appendChild(h);
  }

  for (const yv of yAxis.values) {
    const yl = document.createElement("div");
    yl.style.cssText = "font-size:10px;padding:4px;border:1px solid #4c1d95;border-radius:4px;background:rgba(139,92,246,0.08);";
    yl.textContent = yv;
    grid.appendChild(yl);

    for (const xv of xAxis.values) {
      const values = { ...opts.currentValues, [xAxis.name]: xv, [yAxis.name]: yv };
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

  modal.appendChild(grid);
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
