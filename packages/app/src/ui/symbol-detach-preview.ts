import type { Editor } from "../editor";

type DetachPreview = {
  instance_id: number;
  instance_name: string;
  total_layers_in_subtree: number;
  nested_instance_count: number;
  color_style_link_count: number;
  text_style_link_count: number;
  override_count_text: number;
  override_count_fill: number;
  override_count_visibility: number;
  component_property_override_count: number;
};

type OverrideRow = {
  node_id: number;
  node_name: string;
  properties: string[];
};

export function openSymbolDetachPreview(editor: Editor, instanceId: number): void {
  const previewRaw = (editor.engine as any).get_detach_preview?.(BigInt(instanceId));
  let preview: DetachPreview | null = null;
  try {
    preview = previewRaw ? JSON.parse(previewRaw) : null;
  } catch {
    preview = null;
  }
  if (!preview) {
    const ok = (editor.engine as any).detach_instance?.(BigInt(instanceId));
    if (ok) {
      editor.requestRender();
      (editor as any).onLayersChanges?.forEach?.((fn: any) => fn());
    }
    return;
  }

  let overrideRows: OverrideRow[] = [];
  try {
    const raw = (editor.engine as any).get_instance_overridden_props?.(BigInt(instanceId));
    const parsed = raw ? JSON.parse(raw) : null;
    const arr = Array.isArray(parsed?.overrides) ? parsed.overrides : [];
    overrideRows = arr.map((r: any) => ({
      node_id: Number(r?.node_id || 0),
      node_name: String(r?.node_name || `Node ${r?.node_id || "?"}`),
      properties: Array.isArray(r?.properties) ? r.properties.map((p: any) => String(p)) : [],
    })).filter((r: OverrideRow) => r.node_id > 0);
  } catch {
    overrideRows = [];
  }

  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:20000;";

  const modal = document.createElement("div");
  modal.style.cssText = "width:520px;max-width:92vw;background:#1f1f2e;border:1px solid #3a3a58;border-radius:12px;padding:16px;color:#e5e7eb;box-shadow:0 20px 60px rgba(0,0,0,0.45);";

  const title = document.createElement("div");
  title.style.cssText = "font-size:14px;font-weight:700;margin-bottom:8px;";
  title.textContent = "Detach Preview";
  modal.appendChild(title);

  const sub = document.createElement("div");
  sub.style.cssText = "font-size:12px;color:#9ca3af;margin-bottom:12px;";
  sub.textContent = `${preview.instance_name || "Instance"} (ID ${preview.instance_id})`;
  modal.appendChild(sub);

  const list = document.createElement("div");
  list.style.cssText = "display:grid;grid-template-columns:1fr auto;gap:6px 10px;font-size:12px;background:rgba(255,255,255,0.02);border:1px solid #34344d;border-radius:8px;padding:10px;";
  const addRow = (k: string, v: string | number) => {
    const lk = document.createElement("div"); lk.style.color = "#a1a1b5"; lk.textContent = k;
    const lv = document.createElement("div"); lv.style.color = "#f3f4f6"; lv.style.fontWeight = "600"; lv.textContent = String(v);
    list.appendChild(lk); list.appendChild(lv);
  };
  addRow("Layers in subtree", preview.total_layers_in_subtree);
  addRow("Nested instances", preview.nested_instance_count);
  addRow("Text overrides", preview.override_count_text);
  addRow("Fill overrides", preview.override_count_fill);
  addRow("Visibility overrides", preview.override_count_visibility);
  addRow("Component property overrides", preview.component_property_override_count);
  addRow("Color style linked layers", preview.color_style_link_count);
  addRow("Text style linked layers", preview.text_style_link_count);
  modal.appendChild(list);

  if (overrideRows.length > 0) {
    const ovTitle = document.createElement("div");
    ovTitle.style.cssText = "margin-top:12px;font-size:12px;font-weight:600;color:#d1d5db;";
    ovTitle.textContent = `Changed layers (${overrideRows.length})`;
    modal.appendChild(ovTitle);

    const ovList = document.createElement("div");
    ovList.style.cssText = "margin-top:6px;max-height:150px;overflow:auto;border:1px solid #34344d;border-radius:8px;background:rgba(255,255,255,0.02);";
    overrideRows.slice(0, 14).forEach((ov) => {
      const row = document.createElement("div");
      row.style.cssText = "padding:7px 9px;border-bottom:1px solid rgba(255,255,255,0.05);";
      row.innerHTML = `<div style=\"font-size:11px;color:#f3f4f6;font-weight:600;\">${escapeHtml(ov.node_name)}</div><div style=\"font-size:11px;color:#9ca3af;\">${escapeHtml(ov.properties.join(", ") || "changed")}</div>`;
      ovList.appendChild(row);
    });
    if (overrideRows.length > 14) {
      const more = document.createElement("div");
      more.style.cssText = "padding:7px 9px;font-size:11px;color:#9ca3af;";
      more.textContent = `+${overrideRows.length - 14} more`;
      ovList.appendChild(more);
    }
    modal.appendChild(ovList);
  }

  const nestedRow = document.createElement("label");
  nestedRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-top:12px;font-size:12px;color:#cbd5e1;";
  const nestedCb = document.createElement("input");
  nestedCb.type = "checkbox";
  nestedCb.checked = preview.nested_instance_count > 0;
  nestedRow.appendChild(nestedCb);
  nestedRow.appendChild(document.createTextNode("Also detach nested instances (selective detach)"));
  modal.appendChild(nestedRow);

  const footer = document.createElement("div");
  footer.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:14px;";

  const cancel = document.createElement("button");
  cancel.textContent = "Cancel";
  cancel.style.cssText = "padding:6px 10px;border-radius:8px;border:1px solid #3b3b56;background:#2a2a3f;color:#d1d5db;cursor:pointer;";
  cancel.onclick = () => overlay.remove();

  const apply = document.createElement("button");
  apply.textContent = "Detach";
  apply.style.cssText = "padding:6px 12px;border-radius:8px;border:1px solid rgba(239,68,68,0.5);background:rgba(239,68,68,0.18);color:#fecaca;cursor:pointer;font-weight:600;";
  apply.onclick = () => {
    const ok = (editor.engine as any).detach_instance_selective?.(BigInt(instanceId), !!nestedCb.checked)
      ?? (editor.engine as any).detach_instance?.(BigInt(instanceId));
    if (ok) {
      editor.requestRender();
      (editor as any).onLayersChanges?.forEach?.((fn: any) => fn());
    }
    overlay.remove();
  };

  footer.append(cancel, apply);
  modal.appendChild(footer);
  overlay.appendChild(modal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
