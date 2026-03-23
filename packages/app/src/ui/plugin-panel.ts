/**
 * Plugin Panel — Right pane tab for managing plugins and showing plugin panels.
 */

import type { PluginManager } from "../plugins/plugin-manager";

export function setupPluginPanel(container: HTMLElement, pluginManager: PluginManager): void {
  let activePluginPanel: string | null = null;

  function render() {
    const plugins = pluginManager.list();
    const panels = pluginManager.getPanels();

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;font-size:12px;color:#ccc">
        <div style="padding:8px 12px;border-bottom:1px solid #333">
          <div style="font-weight:600;font-size:13px;color:#eee;margin-bottom:6px">Plugins (${plugins.length})</div>
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

  pluginManager.onUIChange(render);
  render();
}
