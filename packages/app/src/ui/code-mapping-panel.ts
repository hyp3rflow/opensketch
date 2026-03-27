/**
 * Code Mapping Panel — Design-to-code component mapping UI.
 * Allows users to bind design nodes to React/Vue/SwiftUI/Compose/Flutter components,
 * configure prop bindings, and export actual component code.
 */
import type { Editor } from "../editor";

interface PropBinding {
  prop_name: string;
  prop_type: string;
  default_value: string;
  design_source: string;
}

interface CodeMapping {
  component_name: string;
  framework: string;
  import_path: string;
  props: PropBinding[];
  children_slot: boolean;
}

const FRAMEWORKS = ["react", "vue", "swiftui", "compose", "flutter"] as const;
const PROP_TYPES = ["string", "number", "boolean", "color", "enum"] as const;
const DESIGN_SOURCES = [
  { value: "text.content", label: "Text content" },
  { value: "opacity", label: "Opacity" },
  { value: "width", label: "Width" },
  { value: "height", label: "Height" },
  { value: "corner_radius", label: "Corner radius" },
  { value: "visible", label: "Visible" },
  { value: "fill.0.color", label: "Fill color" },
] as const;

export function renderCodeMappingSection(container: HTMLElement, editor: Editor, nodeId: number): void {
  const engine = (editor as any).engine;
  const bid = BigInt(nodeId);

  // Get existing mapping
  const mappingJson = engine.get_code_mapping(bid);
  let mapping: CodeMapping | null = null;
  if (mappingJson) {
    try { mapping = JSON.parse(mappingJson); } catch {}
  }

  const section = document.createElement("div");
  section.style.cssText = "margin-top:16px; border-top:1px solid #333; padding-top:12px;";

  if (!mapping) {
    // No mapping — show "Link to component" button
    section.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <span style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Component Mapping</span>
      </div>
      <button id="cm-add" style="width:100%;padding:8px;background:#313244;border:1px dashed #555;border-radius:6px;color:#89b4fa;cursor:pointer;font-size:12px;">
        + Link to Code Component
      </button>
    `;
    container.appendChild(section);
    section.querySelector("#cm-add")?.addEventListener("click", () => {
      const defaultMapping: CodeMapping = {
        component_name: "",
        framework: "react",
        import_path: "",
        props: [],
        children_slot: false,
      };
      engine.set_code_mapping(bid, JSON.stringify(defaultMapping));
      // Re-render
      section.remove();
      renderCodeMappingSection(container, editor, nodeId);
    });
    return;
  }

  // Has mapping — show editor
  section.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <span style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Component Mapping</span>
      <div style="display:flex;gap:4px;">
        <button id="cm-export" title="Export code" style="background:none;border:none;color:#a6e3a1;cursor:pointer;font-size:12px;">⬇</button>
        <button id="cm-remove" title="Remove mapping" style="background:none;border:none;color:#f38ba8;cursor:pointer;font-size:12px;">✕</button>
      </div>
    </div>

    <!-- Component name -->
    <div style="margin-bottom:8px;">
      <label style="font-size:10px;color:#666;display:block;margin-bottom:2px;">Component Name</label>
      <input id="cm-name" value="${esc(mapping.component_name)}" placeholder="e.g. Button"
        style="width:100%;padding:5px 8px;background:#181825;border:1px solid #333;border-radius:4px;color:#cdd6f4;font-size:12px;box-sizing:border-box;">
    </div>

    <!-- Framework -->
    <div style="display:flex;gap:6px;margin-bottom:8px;">
      <div style="flex:1;">
        <label style="font-size:10px;color:#666;display:block;margin-bottom:2px;">Framework</label>
        <select id="cm-framework" style="width:100%;padding:4px 6px;background:#181825;border:1px solid #333;border-radius:4px;color:#cdd6f4;font-size:11px;">
          ${FRAMEWORKS.map(f => `<option value="${f}" ${f === mapping!.framework ? "selected" : ""}>${capitalize(f)}</option>`).join("")}
        </select>
      </div>
      <div style="flex:1;">
        <label style="font-size:10px;color:#666;display:block;margin-bottom:2px;">Import Path</label>
        <input id="cm-import" value="${esc(mapping.import_path)}" placeholder="@/components/..."
          style="width:100%;padding:5px 8px;background:#181825;border:1px solid #333;border-radius:4px;color:#cdd6f4;font-size:11px;box-sizing:border-box;">
      </div>
    </div>

    <!-- Children slot -->
    <label style="font-size:11px;color:#bac2de;display:flex;align-items:center;gap:4px;margin-bottom:10px;cursor:pointer;">
      <input id="cm-children" type="checkbox" ${mapping.children_slot ? "checked" : ""}>
      Has children slot
    </label>

    <!-- Props -->
    <div style="margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;">
      <span style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;">Props</span>
      <button id="cm-add-prop" style="background:none;border:none;color:#89b4fa;cursor:pointer;font-size:11px;">+ Add</button>
    </div>
    <div id="cm-props-list">
      ${mapping.props.map((p, i) => renderPropRow(p, i)).join("")}
    </div>

    <!-- Export preview -->
    <div id="cm-preview" style="display:none;margin-top:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <span style="font-size:10px;color:#888;text-transform:uppercase;">Generated Code</span>
        <button id="cm-copy" style="background:none;border:none;color:#89b4fa;cursor:pointer;font-size:10px;">Copy</button>
      </div>
      <pre id="cm-code" style="background:#11111b;border:1px solid #333;border-radius:6px;padding:10px;font-size:11px;color:#cdd6f4;overflow-x:auto;max-height:300px;margin:0;white-space:pre-wrap;word-break:break-all;"></pre>
    </div>
  `;
  container.appendChild(section);

  // Save helper
  const save = () => {
    const m: CodeMapping = {
      component_name: (section.querySelector("#cm-name") as HTMLInputElement).value.trim(),
      framework: (section.querySelector("#cm-framework") as HTMLSelectElement).value,
      import_path: (section.querySelector("#cm-import") as HTMLInputElement).value.trim(),
      children_slot: (section.querySelector("#cm-children") as HTMLInputElement).checked,
      props: collectProps(section),
    };
    engine.set_code_mapping(bid, JSON.stringify(m));
  };

  // Events
  section.querySelector("#cm-remove")?.addEventListener("click", () => {
    engine.clear_code_mapping(bid);
    section.remove();
    renderCodeMappingSection(container, editor, nodeId);
  });

  section.querySelector("#cm-export")?.addEventListener("click", () => {
    save();
    const codeJson = engine.export_component_code(bid);
    if (!codeJson) { alert("Set a component name first"); return; }
    const exp = JSON.parse(codeJson);
    const preview = section.querySelector("#cm-preview") as HTMLElement;
    const codeEl = section.querySelector("#cm-code") as HTMLElement;
    preview.style.display = "block";
    codeEl.textContent = exp.code;
  });

  section.querySelector("#cm-copy")?.addEventListener("click", () => {
    const code = (section.querySelector("#cm-code") as HTMLElement).textContent || "";
    navigator.clipboard.writeText(code);
  });

  // Auto-save on change
  for (const sel of ["#cm-name", "#cm-framework", "#cm-import", "#cm-children"]) {
    const el = section.querySelector(sel);
    el?.addEventListener("change", save);
    el?.addEventListener("input", debounce(save, 500));
  }

  // Add prop
  section.querySelector("#cm-add-prop")?.addEventListener("click", () => {
    const list = section.querySelector("#cm-props-list")!;
    const idx = list.children.length;
    const row = document.createElement("div");
    row.innerHTML = renderPropRow({ prop_name: "", prop_type: "string", default_value: "", design_source: "" }, idx);
    list.appendChild(row.firstElementChild!);
    bindPropRowEvents(section, save);
  });

  bindPropRowEvents(section, save);
}

function renderPropRow(p: PropBinding, idx: number): string {
  return `
    <div class="cm-prop-row" data-idx="${idx}" style="background:#1e1e2e;border:1px solid #333;border-radius:6px;padding:8px;margin-bottom:6px;">
      <div style="display:flex;gap:4px;margin-bottom:4px;">
        <input class="cm-prop-name" value="${esc(p.prop_name)}" placeholder="propName"
          style="flex:1;padding:3px 6px;background:#181825;border:1px solid #333;border-radius:3px;color:#cdd6f4;font-size:11px;">
        <select class="cm-prop-type" style="padding:3px 4px;background:#181825;border:1px solid #333;border-radius:3px;color:#cdd6f4;font-size:10px;">
          ${PROP_TYPES.map(t => `<option value="${t}" ${t === p.prop_type ? "selected" : ""}>${t}</option>`).join("")}
        </select>
        <button class="cm-prop-del" style="background:none;border:none;color:#f38ba8;cursor:pointer;font-size:11px;">✕</button>
      </div>
      <div style="display:flex;gap:4px;">
        <select class="cm-prop-source" style="flex:1;padding:3px 4px;background:#181825;border:1px solid #333;border-radius:3px;color:#cdd6f4;font-size:10px;">
          <option value="">— source —</option>
          ${DESIGN_SOURCES.map(s => `<option value="${s.value}" ${s.value === p.design_source ? "selected" : ""}>${s.label}</option>`).join("")}
        </select>
        <input class="cm-prop-default" value="${esc(p.default_value)}" placeholder="default"
          style="flex:1;padding:3px 6px;background:#181825;border:1px solid #333;border-radius:3px;color:#cdd6f4;font-size:11px;">
      </div>
    </div>
  `;
}

function collectProps(section: HTMLElement): PropBinding[] {
  const rows = section.querySelectorAll(".cm-prop-row");
  const result: PropBinding[] = [];
  rows.forEach(row => {
    result.push({
      prop_name: (row.querySelector(".cm-prop-name") as HTMLInputElement).value.trim(),
      prop_type: (row.querySelector(".cm-prop-type") as HTMLSelectElement).value,
      default_value: (row.querySelector(".cm-prop-default") as HTMLInputElement).value.trim(),
      design_source: (row.querySelector(".cm-prop-source") as HTMLSelectElement).value,
    });
  });
  return result.filter(p => p.prop_name);
}

function bindPropRowEvents(section: HTMLElement, save: () => void) {
  section.querySelectorAll(".cm-prop-del").forEach(btn => {
    // Avoid double-binding
    if ((btn as any)._bound) return;
    (btn as any)._bound = true;
    btn.addEventListener("click", () => {
      btn.closest(".cm-prop-row")?.remove();
      save();
    });
  });
  section.querySelectorAll(".cm-prop-name, .cm-prop-type, .cm-prop-source, .cm-prop-default").forEach(el => {
    if ((el as any)._bound) return;
    (el as any)._bound = true;
    el.addEventListener("change", save);
  });
}

function debounce(fn: () => void, ms: number) {
  let timer: any;
  return () => { clearTimeout(timer); timer = setTimeout(fn, ms); };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Export All Components — modal showing all mapped components with download buttons.
 */
export function showExportAllModal(editor: Editor): void {
  const engine = (editor as any).engine;
  const json = engine.export_all_components();
  const components = JSON.parse(json);

  if (!components.length) {
    alert("No components mapped. Select nodes and link them to code components first.");
    return;
  }

  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;";
  overlay.innerHTML = `
    <div style="background:#1e1e2e;border-radius:12px;padding:24px;width:520px;max-height:80vh;overflow-y:auto;color:#cdd6f4;font-family:Inter,system-ui,sans-serif;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="margin:0;font-size:16px;">Export Components (${components.length})</h3>
        <button id="eam-close" style="background:none;border:none;color:#888;cursor:pointer;font-size:18px;">✕</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <button id="eam-download-all" style="padding:6px 14px;background:#89b4fa;color:#1e1e2e;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;">Download All</button>
      </div>
      ${components.map((c: any, i: number) => `
        <div style="margin-bottom:12px;background:#313244;border-radius:8px;padding:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div>
              <span style="font-weight:600;font-size:13px;">${esc(c.component_name)}</span>
              <span style="font-size:10px;color:#888;background:#45475a;padding:1px 6px;border-radius:3px;margin-left:6px;">${c.framework}</span>
            </div>
            <button class="eam-copy" data-idx="${i}" style="background:none;border:none;color:#89b4fa;cursor:pointer;font-size:11px;">Copy</button>
          </div>
          <pre style="background:#11111b;border-radius:4px;padding:8px;font-size:10px;color:#cdd6f4;overflow-x:auto;max-height:200px;margin:0;white-space:pre-wrap;">${esc(c.code)}</pre>
        </div>
      `).join("")}
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector("#eam-close")?.addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelectorAll(".eam-copy").forEach(btn => btn.addEventListener("click", () => {
    const idx = Number((btn as HTMLElement).dataset.idx);
    navigator.clipboard.writeText(components[idx].code);
    (btn as HTMLElement).textContent = "Copied!";
    setTimeout(() => (btn as HTMLElement).textContent = "Copy", 1500);
  }));

  overlay.querySelector("#eam-download-all")?.addEventListener("click", () => {
    // Download as a zip-like concatenation
    let allCode = "";
    for (const c of components) {
      const ext = c.framework === "vue" ? ".vue" : c.framework === "swiftui" ? ".swift" : c.framework === "compose" ? ".kt" : c.framework === "flutter" ? ".dart" : ".tsx";
      allCode += `// ====== ${c.component_name}${ext} ======\n${c.code}\n\n`;
    }
    const blob = new Blob([allCode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "components-export.txt";
    a.click();
    URL.revokeObjectURL(url);
  });
}
