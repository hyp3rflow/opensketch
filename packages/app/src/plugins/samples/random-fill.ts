/**
 * Random Fill Plugin — Apply random colors to selected nodes.
 * Sample plugin demonstrating the OpenSketch Plugin API.
 */

import type { Plugin, PluginAPI } from "../types";

export const RandomFillPlugin: Plugin = {
  id: "random-fill",
  name: "Random Fill",
  version: "1.0.0",
  description: "Apply random colors to selected nodes",
  icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1" fill="#f44336"/><rect x="9" y="1" width="6" height="6" rx="1" fill="#4caf50"/><rect x="1" y="9" width="6" height="6" rx="1" fill="#2196f3"/><rect x="9" y="9" width="6" height="6" rx="1" fill="#ff9800"/></svg>`,

  activate(api: PluginAPI) {
    const PALETTES: Record<string, [number, number, number][]> = {
      "Vivid": [
        [255, 87, 87], [255, 189, 46], [46, 213, 115], [30, 144, 255],
        [155, 89, 182], [255, 107, 129], [0, 210, 211], [253, 203, 110],
      ],
      "Pastel": [
        [255, 179, 186], [255, 223, 186], [255, 255, 186], [186, 255, 201],
        [186, 225, 255], [219, 186, 255], [255, 186, 243], [186, 255, 255],
      ],
      "Mono": [
        [30, 30, 30], [60, 60, 60], [90, 90, 90], [120, 120, 120],
        [150, 150, 150], [180, 180, 180], [210, 210, 210], [240, 240, 240],
      ],
      "Earth": [
        [139, 90, 43], [160, 120, 60], [194, 178, 128], [107, 142, 35],
        [85, 107, 47], [205, 133, 63], [210, 180, 140], [139, 119, 101],
      ],
    };

    let currentPalette = "Vivid";

    function randomColor(): [number, number, number] {
      const palette = PALETTES[currentPalette] || PALETTES["Vivid"];
      return palette[Math.floor(Math.random() * palette.length)];
    }

    function applyRandomFills() {
      const sel = api.scene.getSelection();
      if (sel.length === 0) {
        api.ui.showNotification("Select one or more nodes first", "info");
        return;
      }
      for (const id of sel) {
        const [r, g, b] = randomColor();
        api.scene.setFill(id, r, g, b, 1);
      }
      api.ui.showNotification(`Applied random ${currentPalette} fills to ${sel.length} node(s)`, "success");
    }

    function applyTrueRandom() {
      const sel = api.scene.getSelection();
      if (sel.length === 0) {
        api.ui.showNotification("Select one or more nodes first", "info");
        return;
      }
      for (const id of sel) {
        const r = Math.floor(Math.random() * 256);
        const g = Math.floor(Math.random() * 256);
        const b = Math.floor(Math.random() * 256);
        api.scene.setFill(id, r, g, b, 1);
      }
      api.ui.showNotification(`Applied random fills to ${sel.length} node(s)`, "success");
    }

    api.ui.registerPanel({
      id: "random-fill-panel",
      title: "Random Fill",
      icon: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1" fill="#f44336"/><rect x="9" y="1" width="6" height="6" rx="1" fill="#4caf50"/><rect x="1" y="9" width="6" height="6" rx="1" fill="#2196f3"/><rect x="9" y="9" width="6" height="6" rx="1" fill="#ff9800"/></svg>`,
      render(container: HTMLElement) {
        container.innerHTML = `
          <div style="padding:12px;font-size:12px;color:#ccc;">
            <div style="font-weight:600;color:#eee;margin-bottom:10px;font-size:13px;">🎨 Random Fill</div>
            <div style="color:#888;margin-bottom:12px;line-height:1.5;">
              Select nodes and click a button to apply random colors from a palette.
            </div>
            <div style="margin-bottom:10px;">
              <label style="color:#999;font-size:11px;display:block;margin-bottom:4px;">Palette</label>
              <select id="rf-palette" style="width:100%;padding:6px 8px;background:#1e1e2e;border:1px solid #444;border-radius:6px;color:#eee;font-size:12px;">
                ${Object.keys(PALETTES).map(p => `<option value="${p}" ${p === currentPalette ? "selected" : ""}>${p}</option>`).join("")}
              </select>
            </div>
            <div style="display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap;" id="rf-preview"></div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              <button id="rf-apply" style="padding:8px;background:#7c5cfc;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;">
                🎲 Apply Palette Colors
              </button>
              <button id="rf-true-random" style="padding:8px;background:#333;color:#ccc;border:1px solid #555;border-radius:6px;cursor:pointer;font-size:12px;">
                🌈 True Random
              </button>
            </div>
          </div>
        `;

        function renderPreview() {
          const preview = container.querySelector("#rf-preview");
          if (!preview) return;
          const palette = PALETTES[currentPalette] || [];
          preview.innerHTML = palette.map(([r, g, b]) =>
            `<div style="width:24px;height:24px;border-radius:4px;background:rgb(${r},${g},${b});border:1px solid #555;"></div>`
          ).join("");
        }

        renderPreview();

        container.querySelector("#rf-palette")?.addEventListener("change", (e) => {
          currentPalette = (e.target as HTMLSelectElement).value;
          renderPreview();
        });

        container.querySelector("#rf-apply")?.addEventListener("click", applyRandomFills);
        container.querySelector("#rf-true-random")?.addEventListener("click", applyTrueRandom);
      },
      destroy() {},
    });

    api.ui.addMenuItem({
      id: "random-fill-menu",
      label: "Random Fill",
      onClick: applyRandomFills,
    });
  },

  deactivate() {},
};
