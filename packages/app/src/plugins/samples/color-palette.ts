/**
 * Color Palette Plugin
 * Provides curated color palettes and applies colors to selected nodes.
 */

import type { Plugin, PluginAPI } from "../types";

const PALETTES: Record<string, { name: string; colors: [number, number, number][] }> = {
  material: {
    name: "Material",
    colors: [
      [244, 67, 54], [233, 30, 99], [156, 39, 176], [103, 58, 183],
      [63, 81, 181], [33, 150, 243], [0, 188, 212], [0, 150, 136],
      [76, 175, 80], [255, 235, 59], [255, 152, 0], [121, 85, 72],
    ],
  },
  pastel: {
    name: "Pastel",
    colors: [
      [255, 179, 186], [255, 223, 186], [255, 255, 186], [186, 255, 201],
      [186, 225, 255], [218, 186, 255], [255, 186, 243], [186, 255, 255],
      [255, 209, 220], [220, 255, 209], [209, 220, 255], [255, 245, 209],
    ],
  },
  monochrome: {
    name: "Monochrome",
    colors: [
      [0, 0, 0], [34, 34, 34], [68, 68, 68], [102, 102, 102],
      [136, 136, 136], [170, 170, 170], [204, 204, 204], [221, 221, 221],
      [238, 238, 238], [245, 245, 245], [250, 250, 250], [255, 255, 255],
    ],
  },
  ocean: {
    name: "Ocean",
    colors: [
      [0, 63, 92], [2, 86, 105], [0, 119, 139], [0, 147, 165],
      [0, 176, 189], [43, 205, 193], [100, 223, 193], [158, 237, 199],
      [199, 244, 215], [224, 249, 233], [14, 55, 86], [22, 78, 99],
    ],
  },
};

export const ColorPalettePlugin: Plugin = {
  id: "color-palette",
  name: "Color Palette",
  version: "1.0.0",
  description: "Curated color palettes for quick styling",
  icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="5" cy="5" r="3" fill="#f44336"/><circle cx="11" cy="5" r="3" fill="#2196f3"/><circle cx="8" cy="11" r="3" fill="#4caf50"/></svg>`,

  activate(api: PluginAPI) {
    let currentPalette = "material";

    api.ui.registerPanel({
      id: "color-palette-panel",
      title: "Color Palette",
      render(container: HTMLElement) {
        function renderPalette() {
          const palette = PALETTES[currentPalette];
          container.innerHTML = `
            <div style="padding:12px;display:flex;flex-direction:column;gap:8px;">
              <select id="palette-select" style="padding:6px 8px;border-radius:6px;border:1px solid #444;background:#2a2a2a;color:#ccc;font-size:12px;">
                ${Object.entries(PALETTES).map(([k, v]) =>
                  `<option value="${k}" ${k === currentPalette ? "selected" : ""}>${v.name}</option>`
                ).join("")}
              </select>
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">
                ${palette.colors.map(([r, g, b]) => `
                  <div class="palette-swatch" data-r="${r}" data-g="${g}" data-b="${b}"
                    style="width:100%;aspect-ratio:1;border-radius:6px;cursor:pointer;background:rgb(${r},${g},${b});border:2px solid transparent;transition:border-color 0.15s;"
                    title="rgb(${r}, ${g}, ${b})">
                  </div>
                `).join("")}
              </div>
              <div id="palette-info" style="font-size:11px;color:#888;text-align:center;min-height:16px;"></div>
            </div>
          `;

          container.querySelector("#palette-select")!.addEventListener("change", (e) => {
            currentPalette = (e.target as HTMLSelectElement).value;
            renderPalette();
          });

          container.querySelectorAll(".palette-swatch").forEach(el => {
            el.addEventListener("click", () => {
              const r = parseInt(el.getAttribute("data-r")!);
              const g = parseInt(el.getAttribute("data-g")!);
              const b = parseInt(el.getAttribute("data-b")!);
              const sel = api.scene.getSelection();
              if (sel.length === 0) {
                api.ui.showNotification("Select a node first", "error");
                return;
              }
              for (const id of sel) {
                api.scene.setFill(id, r, g, b);
              }
              container.querySelector("#palette-info")!.textContent = `Applied rgb(${r}, ${g}, ${b}) to ${sel.length} node(s)`;
              api.ui.showNotification(`Color applied to ${sel.length} node(s)`, "success");
            });

            el.addEventListener("mouseenter", () => {
              (el as HTMLElement).style.borderColor = "#fff";
            });
            el.addEventListener("mouseleave", () => {
              (el as HTMLElement).style.borderColor = "transparent";
            });
          });
        }

        renderPalette();
      },
    });
  },

  deactivate() {},
};
