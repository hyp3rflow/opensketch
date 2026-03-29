/**
 * Auto Rename Plugin
 * Automatically renames selected nodes based on their type and content.
 */

import type { Plugin, PluginAPI } from "../types";

export const AutoRenamePlugin: Plugin = {
  id: "auto-rename",
  name: "Auto Rename",
  version: "1.0.0",
  description: "Automatically rename selected nodes based on their type, size, and content",
  icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 12h4M8 12h6M5 4v8M11 4v8M3 4h4M9 4h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,

  activate(api: PluginAPI) {
    api.ui.registerPanel({
      id: "auto-rename-panel",
      title: "Auto Rename",
      render(container: HTMLElement) {
        container.innerHTML = `
          <div style="padding:12px;display:flex;flex-direction:column;gap:8px;">
            <div style="font-size:11px;color:#999;">Pattern</div>
            <select id="rename-pattern" style="padding:6px 8px;border-radius:6px;border:1px solid #444;background:#2a2a2a;color:#ccc;font-size:12px;">
              <option value="type-index">Type + Index (e.g. Rect 1)</option>
              <option value="type-size">Type + Size (e.g. Rect 100×50)</option>
              <option value="type-color">Type + Color (e.g. Rect #ff0000)</option>
              <option value="content">Content-based (Text first words)</option>
            </select>
            <button id="rename-selected" style="padding:8px 12px;border-radius:6px;border:none;background:#7c5cfc;color:#fff;cursor:pointer;font-size:12px;margin-top:4px;">
              Rename Selected
            </button>
            <div style="font-size:10px;color:#666;margin-top:4px;">
              Select nodes on canvas, then click Rename.
            </div>
          </div>
        `;

        container.querySelector("#rename-selected")!.addEventListener("click", () => {
          const sel = api.scene.getSelection();
          if (sel.length === 0) {
            api.ui.showNotification("Select at least one node", "error");
            return;
          }
          const pattern = (container.querySelector("#rename-pattern") as HTMLSelectElement).value;
          const counters: Record<string, number> = {};
          let renamed = 0;

          for (const id of sel) {
            const node = api.scene.getNodeJson(id);
            if (!node) continue;

            const kind = typeof node.kind === "string" ? node.kind : Object.keys(node.kind)[0];
            let name = kind;

            switch (pattern) {
              case "type-index":
                counters[kind] = (counters[kind] || 0) + 1;
                name = `${kind} ${counters[kind]}`;
                break;
              case "type-size":
                name = `${kind} ${Math.round(node.width)}×${Math.round(node.height)}`;
                break;
              case "type-color":
                if (node.fills?.length > 0) {
                  const f = node.fills[0];
                  if (f.color) {
                    const hex = rgbToHex(f.color.r, f.color.g, f.color.b);
                    name = `${kind} ${hex}`;
                  }
                }
                break;
              case "content":
                if (kind === "Text" && node.kind?.Text) {
                  const text = node.kind.Text as string;
                  name = text.slice(0, 24).trim() || "Empty Text";
                } else {
                  counters[kind] = (counters[kind] || 0) + 1;
                  name = `${kind} ${counters[kind]}`;
                }
                break;
            }

            api.scene.setName(id, name);
            renamed++;
          }

          api.ui.showNotification(`Renamed ${renamed} node(s)`, "success");
        });
      },
    });
  },

  deactivate() {},
};

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
