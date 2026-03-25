/**
 * Component Analytics Panel
 * Shows component usage statistics: instance counts, usage locations,
 * unused component detection, and refactoring suggestions.
 */

import type { Engine } from "../wasm/opensketch_engine";

interface InstanceLocation {
  node_id: number;
  node_name: string;
  page_id: number;
  page_name: string;
}

interface VariantUsage {
  [key: string]: number;
}

interface ComponentStat {
  component_id: number;
  component_name: string;
  instance_count: number;
  locations: InstanceLocation[];
  variant_usage: VariantUsage;
}

interface Analytics {
  stats: ComponentStat[];
  unused_components: [number, string][];
  total_instances: number;
  total_components: number;
}

let panel: HTMLElement | null = null;

export function openComponentAnalytics(engine: Engine, onNavigate?: (nodeId: number, pageId: number) => void) {
  if (panel) { closeComponentAnalytics(); return; }

  const json = engine.component_analytics();
  let analytics: Analytics;
  try {
    analytics = JSON.parse(json);
  } catch {
    analytics = { stats: [], unused_components: [], total_instances: 0, total_components: 0 };
  }

  panel = document.createElement("div");
  panel.className = "component-analytics-panel";
  panel.innerHTML = `
    <div class="ca-header">
      <span class="ca-title">Component Analytics</span>
      <button class="ca-close">&times;</button>
    </div>
    <div class="ca-summary">
      <div class="ca-stat-card">
        <div class="ca-stat-num">${analytics.total_components}</div>
        <div class="ca-stat-label">Components</div>
      </div>
      <div class="ca-stat-card">
        <div class="ca-stat-num">${analytics.total_instances}</div>
        <div class="ca-stat-label">Instances</div>
      </div>
      <div class="ca-stat-card">
        <div class="ca-stat-num">${analytics.unused_components.length}</div>
        <div class="ca-stat-label">Unused</div>
      </div>
    </div>
    <div class="ca-body">
      ${analytics.stats.length === 0 && analytics.unused_components.length === 0
        ? '<div class="ca-empty">No components found</div>'
        : ''}
      ${analytics.stats.map(stat => `
        <div class="ca-component" data-comp-id="${stat.component_id}">
          <div class="ca-comp-header">
            <span class="ca-comp-name">${escHtml(stat.component_name)}</span>
            <span class="ca-comp-count">${stat.instance_count} instance${stat.instance_count !== 1 ? 's' : ''}</span>
          </div>
          ${Object.keys(stat.variant_usage).length > 1 ? `
            <div class="ca-variants">
              ${Object.entries(stat.variant_usage).map(([k, v]) => `
                <span class="ca-variant-chip">${escHtml(k)} <b>${v}</b></span>
              `).join('')}
            </div>
          ` : ''}
          <div class="ca-locations" style="display:none">
            ${stat.locations.map(loc => `
              <div class="ca-location" data-node-id="${loc.node_id}" data-page-id="${loc.page_id}">
                <span class="ca-loc-icon">◇</span>
                <span class="ca-loc-name">${escHtml(loc.node_name || `Node ${loc.node_id}`)}</span>
                <span class="ca-loc-page">${escHtml(loc.page_name)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
      ${analytics.unused_components.length > 0 ? `
        <div class="ca-section-title">⚠ Unused Components</div>
        ${analytics.unused_components.map(([id, name]) => `
          <div class="ca-unused" data-comp-id="${id}">
            <span class="ca-unused-name">${escHtml(name)}</span>
            <span class="ca-unused-hint">0 instances — consider removing</span>
          </div>
        `).join('')}
      ` : ''}
    </div>
  `;

  // Style
  const style = document.createElement("style");
  style.id = "ca-styles";
  style.textContent = `
    .component-analytics-panel {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 440px; max-height: 80vh; background: #1e1e1e; border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5); z-index: 10000; display: flex;
      flex-direction: column; color: #e0e0e0; font-family: -apple-system, sans-serif; font-size: 13px;
    }
    .ca-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid #333; }
    .ca-title { font-weight: 600; font-size: 14px; }
    .ca-close { background: none; border: none; color: #888; font-size: 18px; cursor: pointer; padding: 0 4px; }
    .ca-close:hover { color: #fff; }
    .ca-summary { display: flex; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #333; }
    .ca-stat-card { flex: 1; background: #2a2a2a; border-radius: 8px; padding: 10px; text-align: center; }
    .ca-stat-num { font-size: 22px; font-weight: 700; color: #7b9cff; }
    .ca-stat-label { font-size: 11px; color: #888; margin-top: 2px; }
    .ca-body { overflow-y: auto; padding: 8px 16px 16px; }
    .ca-empty { text-align: center; color: #666; padding: 24px 0; }
    .ca-component { background: #2a2a2a; border-radius: 8px; padding: 10px 12px; margin-bottom: 6px; cursor: pointer; }
    .ca-component:hover { background: #333; }
    .ca-comp-header { display: flex; justify-content: space-between; align-items: center; }
    .ca-comp-name { font-weight: 500; }
    .ca-comp-count { color: #7b9cff; font-size: 12px; font-weight: 600; }
    .ca-variants { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
    .ca-variant-chip { background: #383838; border-radius: 4px; padding: 2px 6px; font-size: 11px; color: #aaa; }
    .ca-variant-chip b { color: #7b9cff; margin-left: 2px; }
    .ca-locations { margin-top: 6px; }
    .ca-location { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 4px; cursor: pointer; font-size: 12px; }
    .ca-location:hover { background: #3a3a3a; }
    .ca-loc-icon { color: #7b9cff; font-size: 10px; }
    .ca-loc-name { flex: 1; }
    .ca-loc-page { color: #666; font-size: 11px; }
    .ca-section-title { font-weight: 600; color: #e8a33d; margin: 12px 0 6px; font-size: 12px; }
    .ca-unused { background: #2a2220; border-radius: 8px; padding: 8px 12px; margin-bottom: 4px; }
    .ca-unused-name { font-weight: 500; }
    .ca-unused-hint { display: block; font-size: 11px; color: #a07040; margin-top: 2px; }
  `;
  document.head.appendChild(style);
  document.body.appendChild(panel);

  // Toggle locations on component click
  panel.querySelectorAll(".ca-component").forEach(el => {
    el.addEventListener("click", () => {
      const locs = el.querySelector(".ca-locations") as HTMLElement;
      if (locs) locs.style.display = locs.style.display === "none" ? "block" : "none";
    });
  });

  // Navigate to instance on location click
  panel.querySelectorAll(".ca-location").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const nodeId = Number((el as HTMLElement).dataset.nodeId);
      const pageId = Number((el as HTMLElement).dataset.pageId);
      if (onNavigate && nodeId) onNavigate(nodeId, pageId);
    });
  });

  panel.querySelector(".ca-close")!.addEventListener("click", closeComponentAnalytics);

  // Escape to close
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { closeComponentAnalytics(); document.removeEventListener("keydown", onKey); } };
  document.addEventListener("keydown", onKey);
}

export function closeComponentAnalytics() {
  panel?.remove();
  panel = null;
  document.getElementById("ca-styles")?.remove();
}

export function isComponentAnalyticsOpen(): boolean {
  return panel !== null;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
