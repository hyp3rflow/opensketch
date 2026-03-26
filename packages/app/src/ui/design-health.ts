import type { Engine } from "../../wasm/opensketch_engine";

interface ComponentUsage {
  component_id: number;
  name: string;
  instance_count: number;
}

interface DetachedInstance {
  node_id: number;
  node_name: string;
  missing_component_id: number;
}

interface UnusedStyle {
  style_id: number;
  name: string;
}

interface ConsistencyBreakdown {
  instance_health: number;
  color_style_coverage: number;
  text_style_coverage: number;
  component_adoption: number;
}

interface DesignHealthReport {
  total_components: number;
  total_instances: number;
  component_usage: ComponentUsage[];
  detached_instances: DetachedInstance[];
  unused_color_styles: UnusedStyle[];
  unused_text_styles: UnusedStyle[];
  consistency_score: number;
  consistency_breakdown: ConsistencyBreakdown;
}

function scoreColor(score: number): string {
  if (score >= 80) return "#36b37e";
  if (score >= 50) return "#ffab00";
  return "#ff5630";
}

function badge(label: string, value: string | number, color?: string): string {
  const bg = color || "#333";
  return `<div style="background:${bg};border-radius:8px;padding:12px 16px;min-width:100px;text-align:center">
    <div style="font-size:22px;font-weight:700;color:#fff">${value}</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:4px">${label}</div>
  </div>`;
}

export function openDesignHealth(engine: Engine, onRefresh?: () => void) {
  const existing = document.getElementById("design-health-modal");
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement("div");
  overlay.id = "design-health-modal";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center";

  const modal = document.createElement("div");
  modal.style.cssText = "background:#1e1e2e;border-radius:16px;padding:24px;width:640px;max-height:80vh;overflow-y:auto;color:#e0e0e0;font-family:Inter,system-ui,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,0.5)";

  function render() {
    let report: DesignHealthReport;
    try {
      report = JSON.parse((engine as any).get_design_health());
    } catch {
      modal.innerHTML = `<p style="color:#ff5630">Failed to load health data</p>`;
      return;
    }

    const sc = report.consistency_score;
    const scCol = scoreColor(sc);
    const b = report.consistency_breakdown;

    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <h2 style="margin:0;font-size:18px;font-weight:700">🩺 Design System Health</h2>
        <button id="dh-close" style="background:none;border:none;color:#aaa;font-size:20px;cursor:pointer">✕</button>
      </div>

      <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
        ${badge("Score", sc, scCol)}
        ${badge("Components", report.total_components)}
        ${badge("Instances", report.total_instances)}
        ${badge("Detached", report.detached_instances.length, report.detached_instances.length > 0 ? "#ff5630" : "#333")}
        ${badge("Unused Colors", report.unused_color_styles.length, report.unused_color_styles.length > 0 ? "#ffab00" : "#333")}
        ${badge("Unused Text", report.unused_text_styles.length, report.unused_text_styles.length > 0 ? "#ffab00" : "#333")}
      </div>

      <div style="margin-bottom:20px">
        <h3 style="font-size:13px;font-weight:600;margin:0 0 8px">Consistency Breakdown</h3>
        ${barRow("Instance Health", b.instance_health)}
        ${barRow("Color Style Coverage", b.color_style_coverage)}
        ${barRow("Text Style Coverage", b.text_style_coverage)}
        ${barRow("Component Adoption", b.component_adoption)}
      </div>

      ${report.component_usage.length > 0 ? `
        <div style="margin-bottom:16px">
          <h3 style="font-size:13px;font-weight:600;margin:0 0 8px">Component Usage</h3>
          <div style="max-height:120px;overflow-y:auto;font-size:12px">
            ${report.component_usage.sort((a, b) => b.instance_count - a.instance_count).map(c =>
              `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #333">
                <span>${c.name}</span><span style="color:#aaa">${c.instance_count} uses</span>
              </div>`
            ).join("")}
          </div>
        </div>
      ` : ""}

      ${report.detached_instances.length > 0 ? `
        <div style="margin-bottom:16px">
          <h3 style="font-size:13px;font-weight:600;color:#ff5630;margin:0 0 8px">⚠ Detached Instances (${report.detached_instances.length})</h3>
          <div style="max-height:80px;overflow-y:auto;font-size:12px">
            ${report.detached_instances.map(d =>
              `<div style="padding:2px 0;color:#ffab00">${d.node_name} <span style="color:#666">(comp #${d.missing_component_id})</span></div>`
            ).join("")}
          </div>
        </div>
      ` : ""}

      <div style="display:flex;gap:8px;margin-top:16px">
        ${report.unused_color_styles.length > 0 ? `<button id="dh-clean-colors" style="padding:8px 16px;border-radius:8px;border:none;background:#ff5630;color:#fff;cursor:pointer;font-size:12px;font-weight:600">🗑 Clean ${report.unused_color_styles.length} Unused Colors</button>` : ""}
        ${report.unused_text_styles.length > 0 ? `<button id="dh-clean-text" style="padding:8px 16px;border-radius:8px;border:none;background:#ff5630;color:#fff;cursor:pointer;font-size:12px;font-weight:600">🗑 Clean ${report.unused_text_styles.length} Unused Text Styles</button>` : ""}
        <button id="dh-refresh" style="padding:8px 16px;border-radius:8px;border:none;background:#4a90d9;color:#fff;cursor:pointer;font-size:12px;font-weight:600">↻ Refresh</button>
      </div>
    `;

    modal.querySelector("#dh-close")?.addEventListener("click", () => overlay.remove());
    modal.querySelector("#dh-clean-colors")?.addEventListener("click", () => {
      const count = (engine as any).remove_unused_color_styles();
      onRefresh?.();
      render();
    });
    modal.querySelector("#dh-clean-text")?.addEventListener("click", () => {
      const count = (engine as any).remove_unused_text_styles();
      onRefresh?.();
      render();
    });
    modal.querySelector("#dh-refresh")?.addEventListener("click", () => render());
  }

  function barRow(label: string, value: number): string {
    const col = scoreColor(value);
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <span style="font-size:11px;width:140px;color:#aaa">${label}</span>
      <div style="flex:1;height:6px;background:#333;border-radius:3px;overflow:hidden">
        <div style="width:${value}%;height:100%;background:${col};border-radius:3px"></div>
      </div>
      <span style="font-size:11px;width:40px;text-align:right;color:${col}">${value}%</span>
    </div>`;
  }

  render();
  overlay.appendChild(modal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}
