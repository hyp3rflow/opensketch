/**
 * Plugin Marketplace Panel — Browse, search, install/uninstall, enable/disable plugins.
 * Two sections: "Installed" (toggle/delete) + "Browse" (search/category filter).
 */

import type { PluginManager } from "../plugins/plugin-manager";
import type { Editor } from "../editor";
import { runFigmaPlugin, type FigmaCompat } from "../plugins/figma-compat";

interface CatalogPlugin {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  icon_url: string;
  category: string;
  installed: boolean;
  enabled: boolean;
  downloads: number;
  rating: number;
}

const CATEGORIES = ["All", "Design", "Layout", "Export", "Accessibility", "Developer"];

const PLUGIN_ICONS: Record<string, string> = {
  "lorem-ipsum": `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 4h14M3 8h11M3 12h14M3 16h9" stroke="#a78bfa" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  "color-palette": `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="6" cy="7" r="3" fill="#f44336"/><circle cx="14" cy="7" r="3" fill="#2196f3"/><circle cx="10" cy="14" r="3" fill="#4caf50"/></svg>`,
  "grid-generator": `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="2" width="7" height="7" rx="1.5" stroke="#a78bfa" stroke-width="1.2"/><rect x="11" y="2" width="7" height="7" rx="1.5" stroke="#a78bfa" stroke-width="1.2"/><rect x="2" y="11" width="7" height="7" rx="1.5" stroke="#a78bfa" stroke-width="1.2"/><rect x="11" y="11" width="7" height="7" rx="1.5" stroke="#a78bfa" stroke-width="1.2"/></svg>`,
  "auto-layout-helper": `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="3" width="16" height="4" rx="1" stroke="#a78bfa" stroke-width="1.2"/><rect x="2" y="9" width="7" height="8" rx="1" stroke="#a78bfa" stroke-width="1.2"/><rect x="11" y="9" width="7" height="8" rx="1" stroke="#a78bfa" stroke-width="1.2"/></svg>`,
  "svg-exporter-pro": `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 14l4-4 3 3 5-5" stroke="#a78bfa" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 6h2v2" stroke="#a78bfa" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  "a11y-checker": `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="5" r="2" stroke="#a78bfa" stroke-width="1.2"/><path d="M6 9h8M10 9v7M7 16h6" stroke="#a78bfa" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  "code-snippet": `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M7 6L3 10l4 4M13 6l4 4-4 4" stroke="#a78bfa" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

export function setupMarketplacePanel(
  container: HTMLElement,
  pluginManager: PluginManager,
  editor: Editor,
): void {
  let activeTab: "installed" | "browse" = "browse";
  let searchQuery = "";
  let activeCategory = "All";
  let activePluginPanel: string | null = null;
  let activeFigmaCompat: FigmaCompat | null = null;

  const engine = editor.engine as any;

  function getCatalog(): CatalogPlugin[] {
    try {
      const json = engine.search_plugins(searchQuery, activeCategory);
      return JSON.parse(json);
    } catch {
      return [];
    }
  }

  function getInstalled(): CatalogPlugin[] {
    try {
      return JSON.parse(engine.get_installed_plugins());
    } catch {
      return [];
    }
  }

  function render() {
    const installed = getInstalled();
    const catalog = getCatalog();
    const panels = pluginManager.getPanels();

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;font-family:Inter,system-ui,sans-serif;font-size:12px;color:#cdd6f4;">
        <!-- Header -->
        <div style="padding:10px 12px 0;display:flex;align-items:center;justify-content:space-between;">
          <span style="font-weight:700;font-size:14px;color:#eee;display:flex;align-items:center;gap:6px;">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" fill="#7c5cfc"/><rect x="9" y="1" width="6" height="6" rx="1.5" fill="#7c5cfc" opacity="0.6"/><rect x="1" y="9" width="6" height="6" rx="1.5" fill="#7c5cfc" opacity="0.6"/><rect x="9" y="9" width="6" height="6" rx="1.5" fill="#7c5cfc" opacity="0.3"/></svg>
            Plugins
          </span>
          <div style="display:flex;gap:4px;">
            ${editor ? `<button id="mp-figma-btn" title="Run Figma Plugin" style="background:none;border:1px solid #444;border-radius:4px;padding:2px 6px;color:#888;cursor:pointer;font-size:10px;">Figma</button>` : ""}
          </div>
        </div>

        <!-- Tabs -->
        <div style="display:flex;gap:0;padding:8px 12px 0;border-bottom:1px solid #333;">
          <button class="mp-tab" data-tab="installed" style="flex:1;padding:6px 0;border:none;border-bottom:2px solid ${activeTab === "installed" ? "#7c5cfc" : "transparent"};background:none;color:${activeTab === "installed" ? "#eee" : "#888"};cursor:pointer;font-size:12px;font-weight:${activeTab === "installed" ? "600" : "400"};">
            Installed (${installed.length})
          </button>
          <button class="mp-tab" data-tab="browse" style="flex:1;padding:6px 0;border:none;border-bottom:2px solid ${activeTab === "browse" ? "#7c5cfc" : "transparent"};background:none;color:${activeTab === "browse" ? "#eee" : "#888"};cursor:pointer;font-size:12px;font-weight:${activeTab === "browse" ? "600" : "400"};">
            Browse
          </button>
        </div>

        <!-- Content -->
        <div style="flex:1;overflow-y:auto;">
          ${activeTab === "installed" ? renderInstalled(installed, panels) : renderBrowse(catalog)}
        </div>
      </div>
    `;

    // Tab clicks
    container.querySelectorAll<HTMLButtonElement>(".mp-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        activeTab = btn.dataset.tab as any;
        render();
      });
    });

    // Search
    const searchInput = container.querySelector<HTMLInputElement>("#mp-search");
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        searchQuery = searchInput.value;
        render();
        // Re-focus
        const el = container.querySelector<HTMLInputElement>("#mp-search");
        if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
      });
    }

    // Category pills
    container.querySelectorAll<HTMLButtonElement>(".mp-cat").forEach(btn => {
      btn.addEventListener("click", () => {
        activeCategory = btn.dataset.cat!;
        render();
      });
    });

    // Install/uninstall
    container.querySelectorAll<HTMLButtonElement>(".mp-install").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id!;
        engine.install_plugin(id);
        // Also register in TS plugin manager if we have a matching plugin
        activatePluginById(id);
        render();
      });
    });

    container.querySelectorAll<HTMLButtonElement>(".mp-uninstall").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id!;
        engine.uninstall_plugin(id);
        try { pluginManager.deactivate(id); } catch {}
        render();
      });
    });

    // Enable/disable toggle
    container.querySelectorAll<HTMLButtonElement>(".mp-toggle").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id!;
        const enabled = btn.dataset.enabled === "true";
        if (enabled) {
          engine.disable_plugin(id);
          try { pluginManager.deactivate(id); } catch {}
        } else {
          engine.enable_plugin(id);
          activatePluginById(id);
        }
        render();
      });
    });

    // Plugin panel tabs
    container.querySelectorAll<HTMLButtonElement>(".mp-panel-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        activePluginPanel = activePluginPanel === tab.dataset.panel ? null : tab.dataset.panel!;
        render();
        renderActivePanel();
      });
    });

    // Figma compat
    container.querySelector("#mp-figma-btn")?.addEventListener("click", () => showFigmaDialog());

    renderActivePanel();
  }

  function activatePluginById(id: string) {
    // Map catalog id to TS plugin objects
    const registered = pluginManager.list().find(p => p.id === id);
    if (registered) {
      pluginManager.activate(id);
    } else {
      // Try to register built-in by dynamic import
      import("../plugins").then(mod => {
        const map: Record<string, any> = {
          "lorem-ipsum": mod.LoremIpsumPlugin,
          "color-palette": mod.ColorPalettePlugin,
          "grid-generator": mod.GridGeneratorPlugin,
        };
        if (map[id]) {
          pluginManager.register(map[id]);
          pluginManager.activate(id);
          render();
        }
      });
    }
  }

  function renderInstalled(installed: CatalogPlugin[], panels: any[]): string {
    if (installed.length === 0) {
      return `
        <div style="padding:32px 16px;text-align:center;">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style="margin:0 auto 12px;display:block;opacity:0.3;">
            <rect x="4" y="4" width="14" height="14" rx="3" stroke="#888" stroke-width="2"/><rect x="22" y="4" width="14" height="14" rx="3" stroke="#888" stroke-width="2"/><rect x="4" y="22" width="14" height="14" rx="3" stroke="#888" stroke-width="2"/><rect x="22" y="22" width="14" height="14" rx="3" stroke="#888" stroke-width="2"/>
          </svg>
          <div style="color:#666;font-size:13px;margin-bottom:4px;">No plugins installed</div>
          <div style="color:#555;font-size:11px;">Browse the marketplace to get started</div>
        </div>
      `;
    }

    let html = `<div style="padding:8px 12px;">`;

    // Plugin panels (if any active plugin has UI panels)
    if (panels.length > 0) {
      html += `<div style="display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap;">
        ${panels.map(p => `
          <button class="mp-panel-tab" data-panel="${p.id}"
            style="padding:4px 10px;border-radius:6px;border:1px solid ${activePluginPanel === p.id ? "#7c5cfc" : "#444"};background:${activePluginPanel === p.id ? "rgba(124,92,252,0.15)" : "#2a2a2a"};color:${activePluginPanel === p.id ? "#a78bfa" : "#999"};cursor:pointer;font-size:11px;display:flex;align-items:center;gap:4px;">
            ${p.icon || ""}${p.title}
          </button>
        `).join("")}
      </div>`;
      if (activePluginPanel) {
        html += `<div id="mp-panel-content" style="border:1px solid #333;border-radius:8px;margin-bottom:10px;overflow:hidden;"></div>`;
      }
    }

    // Installed list
    for (const p of installed) {
      const icon = PLUGIN_ICONS[p.id] || defaultPluginIcon();
      html += `
        <div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;background:#1e1e2e;margin-bottom:6px;border:1px solid #333;">
          <div style="width:36px;height:36px;border-radius:8px;background:#2a2a3e;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            ${icon}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;color:#eee;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div>
            <div style="color:#666;font-size:10px;">${p.author} · v${p.version}</div>
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0;">
            <button class="mp-toggle" data-id="${p.id}" data-enabled="${p.enabled}"
              style="width:36px;height:20px;border-radius:10px;border:none;background:${p.enabled ? "#7c5cfc" : "#444"};cursor:pointer;position:relative;transition:background 0.2s;">
              <span style="position:absolute;top:2px;${p.enabled ? "right:2px" : "left:2px"};width:16px;height:16px;border-radius:50%;background:#fff;transition:all 0.2s;"></span>
            </button>
            <button class="mp-uninstall" data-id="${p.id}" title="Uninstall"
              style="background:none;border:1px solid #555;border-radius:4px;padding:2px 6px;color:#f38ba8;cursor:pointer;font-size:10px;">✕</button>
          </div>
        </div>
      `;
    }
    html += `</div>`;
    return html;
  }

  function renderBrowse(catalog: CatalogPlugin[]): string {
    let html = `
      <div style="padding:8px 12px;">
        <!-- Search -->
        <div style="position:relative;margin-bottom:8px;">
          <svg style="position:absolute;left:8px;top:50%;transform:translateY(-50%);opacity:0.4;" width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="#ccc" stroke-width="1.5"/><path d="M11 11l3.5 3.5" stroke="#ccc" stroke-width="1.5" stroke-linecap="round"/></svg>
          <input id="mp-search" type="text" placeholder="Search plugins..." value="${searchQuery}"
            style="width:100%;padding:7px 8px 7px 28px;border-radius:8px;border:1px solid #444;background:#1e1e2e;color:#ccc;font-size:12px;box-sizing:border-box;outline:none;" />
        </div>

        <!-- Categories -->
        <div style="display:flex;gap:4px;margin-bottom:10px;flex-wrap:wrap;">
          ${CATEGORIES.map(cat => `
            <button class="mp-cat" data-cat="${cat}"
              style="padding:3px 10px;border-radius:12px;border:1px solid ${activeCategory === cat ? "#7c5cfc" : "#444"};background:${activeCategory === cat ? "rgba(124,92,252,0.15)" : "transparent"};color:${activeCategory === cat ? "#a78bfa" : "#999"};cursor:pointer;font-size:11px;transition:all 0.15s;">
              ${cat}
            </button>
          `).join("")}
        </div>

        <!-- Plugin Cards -->
        ${catalog.length === 0 ? `<div style="text-align:center;padding:24px;color:#666;">No plugins found</div>` : ""}
    `;

    for (const p of catalog) {
      const icon = PLUGIN_ICONS[p.id] || defaultPluginIcon();
      const stars = "★".repeat(Math.round(p.rating)) + "☆".repeat(5 - Math.round(p.rating));
      html += `
        <div style="padding:10px;border-radius:10px;background:#1e1e2e;margin-bottom:6px;border:1px solid #333;transition:border-color 0.15s;"
          onmouseenter="this.style.borderColor='#555'" onmouseleave="this.style.borderColor='#333'">
          <div style="display:flex;gap:10px;align-items:flex-start;">
            <div style="width:40px;height:40px;border-radius:10px;background:#2a2a3e;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              ${icon}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;">
                <span style="font-weight:600;color:#eee;font-size:12px;">${p.name}</span>
                <span style="color:#666;font-size:10px;">${p.version}</span>
              </div>
              <div style="color:#888;font-size:11px;margin-bottom:4px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
                ${p.description}
              </div>
              <div style="display:flex;align-items:center;justify-content:space-between;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="color:#666;font-size:10px;">${p.author}</span>
                  <span style="color:#f9e2af;font-size:10px;letter-spacing:-1px;">${stars}</span>
                  <span style="color:#555;font-size:10px;">${formatDownloads(p.downloads)}</span>
                </div>
                ${p.installed
                  ? `<button class="mp-uninstall" data-id="${p.id}" style="padding:4px 12px;border-radius:6px;border:1px solid #555;background:#333;color:#f38ba8;cursor:pointer;font-size:11px;font-weight:500;">Uninstall</button>`
                  : `<button class="mp-install" data-id="${p.id}" style="padding:4px 12px;border-radius:6px;border:none;background:#7c5cfc;color:#fff;cursor:pointer;font-size:11px;font-weight:600;">Install</button>`
                }
              </div>
            </div>
          </div>
        </div>
      `;
    }
    html += `</div>`;
    return html;
  }

  function renderActivePanel() {
    const contentEl = container.querySelector<HTMLElement>("#mp-panel-content");
    if (!contentEl || !activePluginPanel) return;
    const panel = pluginManager.getPanels().find(p => p.id === activePluginPanel);
    if (panel) {
      contentEl.innerHTML = "";
      panel.render(contentEl);
    }
  }

  function showFigmaDialog() {
    // Reuse existing figma dialog logic
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;";
    overlay.innerHTML = `
      <div style="background:#1e1e2e;border-radius:12px;padding:24px;width:520px;max-height:80vh;color:#cdd6f4;font-family:Inter,system-ui,sans-serif;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h3 style="margin:0;font-size:16px;">Run Figma Plugin</h3>
          <button id="fpd-close" style="background:none;border:none;color:#888;cursor:pointer;font-size:18px;">✕</button>
        </div>
        <textarea id="fpd-code" placeholder="// Paste Figma plugin code..."
          style="width:100%;height:200px;background:#11111b;border:1px solid #333;border-radius:8px;padding:12px;color:#cdd6f4;font-size:12px;font-family:'SF Mono',monospace;resize:vertical;box-sizing:border-box;"></textarea>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button id="fpd-run" style="padding:8px 20px;background:#7c5cfc;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;">Run</button>
        </div>
        <div id="fpd-status" style="margin-top:8px;font-size:11px;color:#888;"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector("#fpd-close")!.addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector("#fpd-run")!.addEventListener("click", () => {
      const code = (overlay.querySelector("#fpd-code") as HTMLTextAreaElement).value.trim();
      if (!code) return;
      if (activeFigmaCompat) { activeFigmaCompat.destroy(); activeFigmaCompat = null; }
      const status = overlay.querySelector("#fpd-status")!;
      try {
        activeFigmaCompat = runFigmaPlugin(editor, code);
        status.textContent = "✅ Plugin running";
        (status as HTMLElement).style.color = "#a6e3a1";
      } catch (err) {
        status.textContent = `❌ Error: ${err}`;
        (status as HTMLElement).style.color = "#f38ba8";
      }
    });
  }

  function formatDownloads(n: number): string {
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return String(n);
  }

  function defaultPluginIcon(): string {
    return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="14" rx="3" stroke="#666" stroke-width="1.5"/><circle cx="10" cy="10" r="2" fill="#666"/></svg>`;
  }

  pluginManager.onUIChange(render);
  render();
}
