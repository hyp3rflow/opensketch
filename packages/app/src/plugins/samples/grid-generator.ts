/**
 * Grid Generator Plugin
 * Auto-generate rectangular grids with configurable rows, columns, spacing, and colors.
 */

import type { Plugin, PluginAPI } from "../types";

export const GridGeneratorPlugin: Plugin = {
  id: "grid-generator",
  name: "Grid Generator",
  version: "1.0.0",
  description: "Auto-generate rectangular grids",
  icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.2"/></svg>`,

  activate(api: PluginAPI) {
    api.ui.registerPanel({
      id: "grid-generator-panel",
      title: "Grid Generator",
      render(container: HTMLElement) {
        container.innerHTML = `
          <div style="padding:12px;display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;gap:8px;">
              <div style="flex:1">
                <label style="font-size:11px;color:#999;display:block;margin-bottom:2px;">Rows</label>
                <input id="grid-rows" type="number" min="1" max="50" value="3"
                  style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid #444;background:#2a2a2a;color:#ccc;font-size:12px;box-sizing:border-box;" />
              </div>
              <div style="flex:1">
                <label style="font-size:11px;color:#999;display:block;margin-bottom:2px;">Columns</label>
                <input id="grid-cols" type="number" min="1" max="50" value="3"
                  style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid #444;background:#2a2a2a;color:#ccc;font-size:12px;box-sizing:border-box;" />
              </div>
            </div>
            <div style="display:flex;gap:8px;">
              <div style="flex:1">
                <label style="font-size:11px;color:#999;display:block;margin-bottom:2px;">Cell Size</label>
                <input id="grid-size" type="number" min="10" max="500" value="60"
                  style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid #444;background:#2a2a2a;color:#ccc;font-size:12px;box-sizing:border-box;" />
              </div>
              <div style="flex:1">
                <label style="font-size:11px;color:#999;display:block;margin-bottom:2px;">Gap</label>
                <input id="grid-gap" type="number" min="0" max="100" value="8"
                  style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid #444;background:#2a2a2a;color:#ccc;font-size:12px;box-sizing:border-box;" />
              </div>
            </div>
            <div>
              <label style="font-size:11px;color:#999;display:block;margin-bottom:2px;">Fill Color</label>
              <input id="grid-color" type="color" value="#7c5cfc"
                style="width:100%;height:32px;border-radius:6px;border:1px solid #444;background:#2a2a2a;cursor:pointer;" />
            </div>
            <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#999;cursor:pointer;">
              <input id="grid-rainbow" type="checkbox" /> Rainbow colors
            </label>
            <button id="grid-generate" style="padding:8px 12px;border-radius:6px;border:none;background:#7c5cfc;color:#fff;cursor:pointer;font-size:12px;margin-top:4px;font-weight:600;">
              Generate Grid
            </button>
          </div>
        `;

        container.querySelector("#grid-generate")!.addEventListener("click", () => {
          const rows = parseInt((container.querySelector("#grid-rows") as HTMLInputElement).value) || 3;
          const cols = parseInt((container.querySelector("#grid-cols") as HTMLInputElement).value) || 3;
          const size = parseInt((container.querySelector("#grid-size") as HTMLInputElement).value) || 60;
          const gap = parseInt((container.querySelector("#grid-gap") as HTMLInputElement).value) || 8;
          const colorHex = (container.querySelector("#grid-color") as HTMLInputElement).value;
          const rainbow = (container.querySelector("#grid-rainbow") as HTMLInputElement).checked;

          const baseX = 200;
          const baseY = 200;

          const rainbowColors: [number, number, number][] = [
            [244, 67, 54], [233, 30, 99], [156, 39, 176], [63, 81, 181],
            [33, 150, 243], [0, 188, 212], [76, 175, 80], [255, 235, 59],
            [255, 152, 0], [121, 85, 72],
          ];

          // Parse hex color
          const r = parseInt(colorHex.slice(1, 3), 16);
          const g = parseInt(colorHex.slice(3, 5), 16);
          const b = parseInt(colorHex.slice(5, 7), 16);

          let count = 0;
          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
              const x = baseX + col * (size + gap);
              const y = baseY + row * (size + gap);
              const id = api.scene.addRect(x, y, size, size);
              api.scene.setName(id, `Grid ${row + 1}×${col + 1}`);

              if (rainbow) {
                const [cr, cg, cb] = rainbowColors[count % rainbowColors.length];
                api.scene.setFill(id, cr, cg, cb);
              } else {
                api.scene.setFill(id, r, g, b);
              }
              count++;
            }
          }

          api.ui.showNotification(`Created ${rows}×${cols} grid (${count} cells)`, "success");
        });
      },
    });

    api.ui.addMenuItem({
      id: "grid-quick-3x3",
      label: "Quick 3×3 Grid",
      onClick() {
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            const id = api.scene.addRect(200 + c * 68, 200 + r * 68, 60, 60);
            api.scene.setFill(id, 124, 92, 252);
            api.scene.setName(id, `Grid ${r + 1}×${c + 1}`);
          }
        }
        api.ui.showNotification("Quick 3×3 grid created!", "success");
      },
    });
  },

  deactivate() {},
};
