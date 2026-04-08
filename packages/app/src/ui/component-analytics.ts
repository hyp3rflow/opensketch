/**
 * Component Analytics Panel
 * Shows component usage statistics: instance counts, usage locations,
 * unused component detection, and refactoring suggestions.
 */

import type { Editor } from "../editor";

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

interface ImpactPageRow {
  page_id: number;
  page_name: string;
  instance_count: number;
}

interface ImpactVariantRow {
  variant_key: string;
  instance_count: number;
}

interface ImpactRow {
  node_id: number;
  node_name: string;
  page_id: number;
  page_name: string;
  depth: number;
  variant_key: string;
  node_override_count: number;
  property_override_count: number;
  slot_fill_count: number;
  nested_instance_count: number;
  override_conflict_risk: boolean;
}

interface DependencyImpact {
  component_id: number;
  component_name: string;
  total_instances: number;
  affected_pages: ImpactPageRow[];
  affected_variants: ImpactVariantRow[];
  deep_nesting_instances: number;
  override_conflict_instances: number;
  risk_score: number;
  risk_level: "low" | "medium" | "high" | string;
  risks: string[];
  instances: ImpactRow[];
}

let panel: HTMLElement | null = null;
let heatmapCanvas: HTMLCanvasElement | null = null;
let heatmapLoop: number | null = null;
let heatmapEnabled = false;

export function openComponentAnalytics(editor: Editor, onNavigate?: (nodeId: number, pageId: number) => void) {
  if (panel) { closeComponentAnalytics(); return; }

  const json = editor.engine.component_analytics();
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
      <div class="ca-stat-card ca-unused-card">
        <div class="ca-stat-num">${analytics.unused_components.length}</div>
        <div class="ca-stat-label">Unused candidates</div>
      </div>
    </div>
    <div class="ca-controls">
      <label class="ca-toggle">
        <input type="checkbox" class="ca-heatmap-toggle" />
        <span>Show usage heatmap on canvas</span>
      </label>
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
          <div class="ca-comp-actions">
            <button class="ca-impact-btn" data-comp-id="${stat.component_id}">Impact Analyzer</button>
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
          <div class="ca-impact" data-comp-impact="${stat.component_id}" style="display:none"></div>
        </div>
      `).join('')}
      ${analytics.unused_components.length > 0 ? `
        <div class="ca-section-title">⚠ Unused Components</div>
        ${analytics.unused_components.map(([id, name]) => `
          <div class="ca-unused" data-comp-id="${id}">
            <span class="ca-unused-name">${escHtml(name)}</span>
            <span class="ca-unused-hint">0 instances — cleanup candidate</span>
          </div>
        `).join('')}
      ` : ''}
    </div>
  `;

  const style = document.createElement("style");
  style.id = "ca-styles";
  style.textContent = `
    .component-analytics-panel {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 460px; max-height: 80vh; background: #1e1e1e; border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5); z-index: 10000; display: flex;
      flex-direction: column; color: #e0e0e0; font-family: -apple-system, sans-serif; font-size: 13px;
    }
    .ca-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid #333; }
    .ca-title { font-weight: 600; font-size: 14px; }
    .ca-close { background: none; border: none; color: #888; font-size: 18px; cursor: pointer; padding: 0 4px; }
    .ca-close:hover { color: #fff; }
    .ca-summary { display: flex; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #333; }
    .ca-stat-card { flex: 1; background: #2a2a2a; border-radius: 8px; padding: 10px; text-align: center; }
    .ca-unused-card { background: #2c2520; border: 1px solid rgba(232,163,61,0.25); }
    .ca-stat-num { font-size: 22px; font-weight: 700; color: #7b9cff; }
    .ca-unused-card .ca-stat-num { color: #e8a33d; }
    .ca-stat-label { font-size: 11px; color: #888; margin-top: 2px; }
    .ca-controls { padding: 10px 16px; border-bottom: 1px solid #333; }
    .ca-toggle { display:flex; align-items:center; gap:8px; font-size:12px; color:#cbd5e1; cursor:pointer; user-select:none; }
    .ca-body { overflow-y: auto; padding: 8px 16px 16px; }
    .ca-empty { text-align: center; color: #666; padding: 24px 0; }
    .ca-component { background: #2a2a2a; border-radius: 8px; padding: 10px 12px; margin-bottom: 6px; cursor: pointer; }
    .ca-component:hover { background: #333; }
    .ca-comp-header { display: flex; justify-content: space-between; align-items: center; }
    .ca-comp-name { font-weight: 500; }
    .ca-comp-count { color: #7b9cff; font-size: 12px; font-weight: 600; }
    .ca-comp-actions { margin-top: 6px; display: flex; justify-content: flex-end; }
    .ca-impact-btn { background:#1f2937; color:#cbd5e1; border:1px solid #374151; border-radius:6px; font-size:11px; padding:4px 8px; cursor:pointer; }
    .ca-impact-btn:hover { background:#273449; color:#fff; }
    .ca-impact { margin-top: 8px; background:#1f232c; border:1px solid #2e3a4f; border-radius:8px; padding:8px; font-size:11px; }
    .ca-impact-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
    .ca-risk-badge { border-radius:999px; padding:2px 7px; font-weight:600; text-transform:uppercase; letter-spacing:.3px; }
    .ca-risk-badge.low { background:rgba(52,211,153,.15); color:#34d399; }
    .ca-risk-badge.medium { background:rgba(250,204,21,.16); color:#facc15; }
    .ca-risk-badge.high { background:rgba(248,113,113,.16); color:#f87171; }
    .ca-impact-kpis { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-bottom:6px; }
    .ca-impact-kpi { background:#262d3a; border-radius:6px; padding:6px; text-align:center; }
    .ca-impact-kpi b { display:block; color:#dbeafe; font-size:13px; }
    .ca-impact-list { margin:6px 0 0; padding-left:14px; color:#cbd5e1; }
    .ca-impact-signal-row { display:grid; grid-template-columns:1fr; gap:4px; margin-top:6px; }
    .ca-impact-signal { display:inline-flex; justify-content:space-between; align-items:center; background:#202a39; border-radius:6px; padding:4px 6px; color:#cbd5e1; }
    .ca-impact-signal b { color:#fff; }
    .ca-impact-signal.danger { border:1px solid rgba(248,113,113,.35); }
    .ca-impact-signal.warn { border:1px solid rgba(250,204,21,.28); }
    .ca-impact-scope { margin-top:8px; display:grid; gap:6px; }
    .ca-impact-subtitle { font-weight:600; color:#cfe0ff; margin:4px 0; }
    .ca-impact-chips { display:flex; flex-wrap:wrap; gap:4px; }
    .ca-impact-chip { background:#2a3344; border-radius:999px; padding:2px 8px; color:#c8d5ea; border:1px solid #38465f; }
    .ca-impact-instances { margin-top:6px; max-height:140px; overflow:auto; border-top:1px dashed #334155; padding-top:6px; }
    .ca-impact-row { display:flex; align-items:center; gap:6px; padding:3px 4px; border-radius:4px; cursor:pointer; }
    .ca-impact-row:hover { background:#2b3547; }
    .ca-impact-depth { color:#93c5fd; min-width:22px; }
    .ca-impact-node { flex:1; }
    .ca-impact-meta { color:#94a3b8; }
    .ca-row-flag { border-radius:999px; padding:1px 6px; font-size:10px; font-weight:600; }
    .ca-row-flag.conflict { background:rgba(248,113,113,.16); color:#fca5a5; }
    .ca-row-flag.deep { background:rgba(59,130,246,.16); color:#93c5fd; }
    .ca-impact-more-btn { width:100%; margin-top:6px; background:#263248; color:#dbeafe; border:1px solid #3a4c69; border-radius:6px; padding:4px 8px; cursor:pointer; }
    .ca-impact-more-btn:hover { background:#2f3e59; }
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
    .ca-unused { background: #2a2220; border-radius: 8px; padding: 8px 12px; margin-bottom: 4px; border:1px solid rgba(232,163,61,0.2); }
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

  panel.querySelectorAll(".ca-impact-btn").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const btn = el as HTMLButtonElement;
      const compId = Number(btn.dataset.compId);
      const container = panel?.querySelector(`[data-comp-impact=\"${compId}\"]`) as HTMLElement | null;
      if (!container || !compId) return;
      if (container.dataset.loaded === "1") {
        container.style.display = container.style.display === "none" ? "block" : "none";
        return;
      }

      let impact: DependencyImpact | null = null;
      try {
        const json = (editor.engine as any).component_dependency_impact?.(BigInt(compId)) || "null";
        impact = JSON.parse(json);
      } catch {
        impact = null;
      }
      if (!impact) {
        container.innerHTML = `<div class="ca-empty">Failed to analyze impact</div>`;
        container.style.display = "block";
        container.dataset.loaded = "1";
        return;
      }

      container.innerHTML = renderImpact(impact);
      container.style.display = "block";
      container.dataset.loaded = "1";

      container.querySelectorAll(".ca-impact-row").forEach(row => {
        row.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const nodeId = Number((row as HTMLElement).dataset.nodeId);
          const pageId = Number((row as HTMLElement).dataset.pageId);
          if (onNavigate && nodeId) onNavigate(nodeId, pageId);
        });
      });

      const moreBtn = container.querySelector(".ca-impact-more-btn") as HTMLButtonElement | null;
      if (moreBtn) {
        moreBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const open = moreBtn.dataset.open === "1";
          container.querySelectorAll('.ca-impact-row[data-extra="1"]').forEach(extra => {
            (extra as HTMLElement).style.display = open ? "none" : "flex";
          });
          moreBtn.dataset.open = open ? "0" : "1";
          moreBtn.textContent = open ? `Show all ${impact.instances.length} instances` : "Show fewer";
        });
      }
    });
  });

  const heatmapToggle = panel.querySelector(".ca-heatmap-toggle") as HTMLInputElement | null;
  if (heatmapToggle) {
    heatmapToggle.checked = false;
    heatmapToggle.addEventListener("change", () => {
      heatmapEnabled = !!heatmapToggle.checked;
      if (!heatmapEnabled) {
        stopHeatmap();
      } else {
        startHeatmap(editor, analytics);
      }
    });
  }

  panel.querySelector(".ca-close")!.addEventListener("click", closeComponentAnalytics);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      closeComponentAnalytics();
      document.removeEventListener("keydown", onKey);
    }
  };
  document.addEventListener("keydown", onKey);
}

function startHeatmap(editor: Editor, analytics: Analytics) {
  const mainCanvas = (editor as any).canvas as HTMLCanvasElement | undefined;
  if (!mainCanvas) return;

  if (!heatmapCanvas) {
    heatmapCanvas = document.createElement("canvas");
    heatmapCanvas.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;z-index:52;opacity:0.62;";
    mainCanvas.parentElement?.appendChild(heatmapCanvas);
  }

  const usageByNode = new Map<number, number>();
  for (const stat of analytics.stats) {
    for (const loc of stat.locations) {
      usageByNode.set(loc.node_id, (usageByNode.get(loc.node_id) || 0) + 1);
    }
  }

  const draw = () => {
    if (!heatmapEnabled || !heatmapCanvas) return;

    heatmapCanvas.width = mainCanvas.width;
    heatmapCanvas.height = mainCanvas.height;
    heatmapCanvas.style.width = `${mainCanvas.clientWidth}px`;
    heatmapCanvas.style.height = `${mainCanvas.clientHeight}px`;

    const ctx = heatmapCanvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, heatmapCanvas.width, heatmapCanvas.height);

    let allNodes: any[] = [];
    try {
      allNodes = JSON.parse((editor.engine as any).get_all_nodes?.() || "[]");
    } catch {
      allNodes = [];
    }
    if (!Array.isArray(allNodes) || allNodes.length === 0) return;

    const zoom = Number(editor.engine.get_zoom?.() || 1);
    const panX = Number(editor.engine.get_pan_x?.() || 0);
    const panY = Number(editor.engine.get_pan_y?.() || 0);
    const dpr = Number((editor as any).dpr || 1);

    const cx = mainCanvas.width / (2 * dpr);
    const cy = mainCanvas.height / (2 * dpr);

    for (const n of allNodes) {
      const count = usageByNode.get(Number(n?.id));
      if (!count || n?.visible === false) continue;
      const w = Number(n?.width || 0);
      const h = Number(n?.height || 0);
      if (w <= 0 || h <= 0) continue;

      const x = (Number(n?.x || 0) - panX) * zoom + cx;
      const y = (Number(n?.y || 0) - panY) * zoom + cy;
      const sw = Math.max(2, w * zoom);
      const sh = Math.max(2, h * zoom);
      const intensity = Math.min(1, count / 4);
      const hue = 220 - intensity * 180; // blue -> red

      ctx.fillStyle = `hsla(${hue}, 90%, 55%, ${0.18 + intensity * 0.4})`;
      ctx.strokeStyle = `hsla(${hue}, 95%, 65%, ${0.45 + intensity * 0.35})`;
      ctx.lineWidth = Math.max(1, zoom * 0.5);
      ctx.fillRect(x, y, sw, sh);
      ctx.strokeRect(x, y, sw, sh);
    }

    heatmapLoop = window.requestAnimationFrame(draw);
  };

  heatmapLoop = window.requestAnimationFrame(draw);
}

function stopHeatmap() {
  if (heatmapLoop != null) {
    window.cancelAnimationFrame(heatmapLoop);
    heatmapLoop = null;
  }
  if (heatmapCanvas) {
    heatmapCanvas.remove();
    heatmapCanvas = null;
  }
  heatmapEnabled = false;
}

export function closeComponentAnalytics() {
  panel?.remove();
  panel = null;
  stopHeatmap();
  document.getElementById("ca-styles")?.remove();
}

export function isComponentAnalyticsOpen(): boolean {
  return panel !== null;
}

function renderImpact(impact: DependencyImpact): string {
  const riskClass = impact.risk_level === "high" ? "high" : impact.risk_level === "medium" ? "medium" : "low";
  const topRows = impact.instances.slice(0, 8);
  const pages = [...impact.affected_pages].sort((a, b) => b.instance_count - a.instance_count).slice(0, 6);
  const variants = [...impact.affected_variants].sort((a, b) => b.instance_count - a.instance_count).slice(0, 6);
  return `
    <div class="ca-impact-header">
      <strong>Dependency Impact</strong>
      <span class="ca-risk-badge ${riskClass}">${escHtml(String(impact.risk_level))} · ${impact.risk_score}</span>
    </div>
    <div class="ca-impact-kpis">
      <div class="ca-impact-kpi"><b>${impact.total_instances}</b><span>Instances</span></div>
      <div class="ca-impact-kpi"><b>${impact.affected_pages.length}</b><span>Pages</span></div>
      <div class="ca-impact-kpi"><b>${impact.affected_variants.length}</b><span>Variants</span></div>
    </div>
    <div class="ca-impact-signal-row">
      <span class="ca-impact-signal danger">⚠ Override conflict risk: <b>${impact.override_conflict_instances}</b></span>
      <span class="ca-impact-signal warn">↕ Deep nesting: <b>${impact.deep_nesting_instances}</b></span>
    </div>
    <ul class="ca-impact-list">
      ${impact.risks.slice(0, 3).map(r => `<li>${escHtml(r)}</li>`).join("")}
    </ul>
    <div class="ca-impact-scope">
      <div>
        <div class="ca-impact-subtitle">Affected pages</div>
        <div class="ca-impact-chips">${pages.map(p => `<span class="ca-impact-chip">${escHtml(p.page_name || `Page ${p.page_id}`)} · ${p.instance_count}</span>`).join("") || `<span class="ca-impact-chip">None</span>`}</div>
      </div>
      <div>
        <div class="ca-impact-subtitle">Variant scope</div>
        <div class="ca-impact-chips">${variants.map(v => `<span class="ca-impact-chip">${escHtml(v.variant_key || "default")} · ${v.instance_count}</span>`).join("") || `<span class="ca-impact-chip">None</span>`}</div>
      </div>
    </div>
    ${topRows.length > 0 ? `
      <div class="ca-impact-subtitle">Top risky instances</div>
      <div class="ca-impact-instances" data-list="collapsed">
        ${impact.instances.map((row, idx) => {
          const conflict = row.override_conflict_risk ? `<span class="ca-row-flag conflict">Conflict</span>` : "";
          const deep = row.depth >= 4 ? `<span class="ca-row-flag deep">Deep</span>` : "";
          const hidden = idx >= topRows.length ? " style=\"display:none\" data-extra=\"1\"" : "";
          return `
            <div class="ca-impact-row" data-node-id="${row.node_id}" data-page-id="${row.page_id}"${hidden}>
              <span class="ca-impact-depth">D${row.depth}</span>
              <span class="ca-impact-node">${escHtml(row.node_name || `Node ${row.node_id}`)}</span>
              <span class="ca-impact-meta">ovr ${row.node_override_count + row.property_override_count + row.slot_fill_count}</span>
              ${conflict}${deep}
            </div>
          `;
        }).join("")}
      </div>
      ${impact.instances.length > topRows.length ? `<button class="ca-impact-more-btn" data-open="0">Show all ${impact.instances.length} instances</button>` : ""}
    ` : ""}
  `;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
