/**
 * Plugin Panel — Right pane tab for managing plugins and showing plugin panels.
 * Includes Figma Plugin compatibility: paste Figma plugin code to run it.
 */

import type { PluginManager } from "../plugins/plugin-manager";
import type { Editor } from "../editor";
import { runFigmaPlugin, type FigmaCompat } from "../plugins/figma-compat";

export function setupPluginPanel(container: HTMLElement, pluginManager: PluginManager, editor?: Editor): void {
  let activePluginPanel: string | null = null;
  let activeFigmaCompat: FigmaCompat | null = null;

  function render() {
    const plugins = pluginManager.list();
    const panels = pluginManager.getPanels();

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;font-size:12px;color:#ccc">
        <div style="padding:8px 12px;border-bottom:1px solid #333">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <span style="font-weight:600;font-size:13px;color:#eee">Plugins (${plugins.length})</span>
            ${editor ? '<button id="run-figma-plugin" style="background:#4f46e5;border:none;border-radius:4px;padding:3px 8px;color:#fff;cursor:pointer;font-size:10px;font-weight:600;">▶ Run Figma Plugin</button>' : ""}
          </div>
          ${plugins.length === 0 ? '<div style="color:#666;font-size:11px">No plugins installed</div>' : ""}
          ${plugins.map((p) => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0">
              <div style="display:flex;align-items:center;gap:6px">
                <span style="width:8px;height:8px;border-radius:50%;background:${p.active ? "#22c55e" : "#666"}"></span>
                <span style="color:#eee">${p.name}</span>
                <span style="color:#666;font-size:10px">v${p.version}</span>
              </div>
              <button class="plugin-toggle" data-id="${p.id}" data-active="${p.active}"
                style="background:${p.active ? "#333" : "#4f46e5"};border:1px solid #555;border-radius:4px;padding:2px 8px;color:#ccc;cursor:pointer;font-size:10px">
                ${p.active ? "Disable" : "Enable"}
              </button>
            </div>
          `).join("")}
        </div>

        ${panels.length > 0 ? `
          <div style="display:flex;gap:2px;padding:6px 12px;border-bottom:1px solid #333;flex-wrap:wrap">
            ${panels.map((panel) => `
              <button class="plugin-panel-tab" data-panel="${panel.id}"
                style="background:${activePluginPanel === panel.id ? "#4f46e5" : "#2a2a2a"};border:1px solid #444;border-radius:4px;padding:3px 8px;color:#ccc;cursor:pointer;font-size:11px;display:flex;align-items:center;gap:4px">
                ${panel.icon || ""}
                ${panel.title}
              </button>
            `).join("")}
          </div>
          <div id="plugin-panel-content" style="flex:1;overflow-y:auto"></div>
        ` : ""}
      </div>
    `;

    // Toggle buttons
    container.querySelectorAll<HTMLButtonElement>(".plugin-toggle").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id!;
        const isActive = btn.dataset.active === "true";
        if (isActive) {
          await pluginManager.deactivate(id);
        } else {
          await pluginManager.activate(id);
        }
        render();
      });
    });

    // Figma plugin runner
    container.querySelector("#run-figma-plugin")?.addEventListener("click", () => {
      showFigmaPluginDialog();
    });

    // Panel tabs
    container.querySelectorAll<HTMLButtonElement>(".plugin-panel-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        activePluginPanel = tab.dataset.panel!;
        render();
        renderActivePanel();
      });
    });

    // Default: show first panel
    if (panels.length > 0 && !activePluginPanel) {
      activePluginPanel = panels[0].id;
    }
    renderActivePanel();
  }

  function renderActivePanel() {
    const contentEl = container.querySelector<HTMLElement>("#plugin-panel-content");
    if (!contentEl || !activePluginPanel) return;
    const panel = pluginManager.getPanels().find((p) => p.id === activePluginPanel);
    if (panel) {
      contentEl.innerHTML = "";
      panel.render(contentEl);
    }
  }

  function showFigmaPluginDialog() {
    if (!editor) return;
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;";
    overlay.innerHTML = `
      <div style="background:#1e1e2e;border-radius:12px;padding:24px;width:520px;max-height:80vh;color:#cdd6f4;font-family:Inter,system-ui,sans-serif;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h3 style="margin:0;font-size:16px;">Run Figma Plugin</h3>
          <button id="fpd-close" style="background:none;border:none;color:#888;cursor:pointer;font-size:18px;">✕</button>
        </div>
        <p style="font-size:12px;color:#888;margin:0 0 12px;">
          Paste Figma plugin code below. A subset of the Figma Plugin API is emulated
          (node creation, fills, strokes, text, viewport, notify, showUI).
        </p>
        <textarea id="fpd-code" placeholder="// Figma plugin code here...\nconst rect = figma.createRectangle();\nrect.x = 100;\nrect.y = 100;\nrect.fills = [{ type: 'SOLID', color: { r: 1, g: 0.4, b: 0.4 } }];\nfigma.notify('Created!');"
          style="width:100%;height:200px;background:#11111b;border:1px solid #333;border-radius:8px;padding:12px;color:#cdd6f4;font-size:12px;font-family:'SF Mono',monospace;resize:vertical;box-sizing:border-box;"></textarea>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button id="fpd-run" style="padding:8px 20px;background:#4f46e5;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;">Run</button>
          <button id="fpd-stop" style="padding:8px 16px;background:#333;color:#f38ba8;border:1px solid #555;border-radius:6px;cursor:pointer;font-size:12px;display:${activeFigmaCompat ? "inline" : "none"};">Stop Active</button>
        </div>
        <div id="fpd-status" style="margin-top:8px;font-size:11px;color:#888;"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector("#fpd-close")?.addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector("#fpd-run")?.addEventListener("click", () => {
      const code = (overlay.querySelector("#fpd-code") as HTMLTextAreaElement).value.trim();
      if (!code) return;
      // Stop previous
      if (activeFigmaCompat) { activeFigmaCompat.destroy(); activeFigmaCompat = null; }
      const status = overlay.querySelector("#fpd-status")!;
      try {
        activeFigmaCompat = runFigmaPlugin(editor!, code);
        status.textContent = "✅ Plugin running";
        (status as HTMLElement).style.color = "#a6e3a1";
      } catch (err) {
        status.textContent = `❌ Error: ${err}`;
        (status as HTMLElement).style.color = "#f38ba8";
      }
    });

    overlay.querySelector("#fpd-stop")?.addEventListener("click", () => {
      if (activeFigmaCompat) {
        activeFigmaCompat.destroy();
        activeFigmaCompat = null;
        const status = overlay.querySelector("#fpd-status")!;
        status.textContent = "Plugin stopped";
        (status as HTMLElement).style.color = "#888";
      }
    });
  }

  pluginManager.onUIChange(render);
  render();
}
