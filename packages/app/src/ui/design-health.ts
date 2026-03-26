/**
 * Design System Health Dashboard
 * Comprehensive health report: components, styles, colors, typography, issues.
 */

import type { Engine } from "../wasm/opensketch_engine";

interface NamedItem { id: number; name: string; }
interface DetachedInstance { node_id: number; node_name: string; missing_component_id: number; page_name: string; }
interface HardcodedColor { hex: string; count: number; }
interface ColorPair { color_a: string; color_b: string; distance: number; }
interface FontUsage { family: string; count: number; }
interface HealthIssue { severity: string; category: string; message: string; node_id: number | null; suggestion: string | null; }

interface HealthReport {
  score: number;
  components: {
    total_components: number; total_instances: number;
    unused_components: NamedItem[]; detached_instances: DetachedInstance[];
    adoption_rate: number;
  };
  styles: {
    total_color_styles: number; total_text_styles: number;
    unused_color_styles: NamedItem[]; unused_text_styles: NamedItem[];
    style_adoption_rate: number;
  };
  colors: {
    unique_colors: number; hardcoded_colors: HardcodedColor[];
    near_duplicates: ColorPair[];
  };
  typography: {
    font_families: FontUsage[]; font_sizes: number[];
    unstandardized_sizes: number[];
  };
  issues: HealthIssue[];
}

function scoreColor(s: number): string {
  if (s >= 80) return "#36b37e";
  if (s >= 50) return "#ffab00";
  return "#ff5630";
}

function pill(label: string, value: string | number, color?: string): string {
  return `<div style="background:${color || '#2a2a3e'};border-radius:10px;padding:14px 18px;min-width:90px;text-align:center">
    <div style="font-size:24px;font-weight:700;color:#fff">${value}</div>
    <div style="font-size:10px;color:rgba(255,255,255,0.6);margin-top:4px;text-transform:uppercase;letter-spacing:0.5px">${label}</div>
  </div>`;
}

function bar(label: string, pct: number): string {
  const c = scoreColor(pct);
  return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
    <span style="font-size:11px;width:150px;color:#aaa">${label}</span>
    <div style="flex:1;height:6px;background:#333;border-radius:3px;overflow:hidden">
      <div style="width:${pct}%;height:100%;background:${c};border-radius:3px"></div>
    </div>
    <span style="font-size:11px;width:36px;text-align:right;color:${c}">${Math.round(pct)}%</span>
  </div>`;
}

function section(title: string, content: string): string {
  return `<div style="margin-bottom:18px">
    <h3 style="font-size:13px;font-weight:600;margin:0 0 8px;color:#ccc">${title}</h3>
    ${content}
  </div>`;
}

export function openDesignHealth(engine: Engine, opts?: { onNavigate?: (nodeId: number) => void; onRefresh?: () => void }) {
  const existing = document.getElementById("design-health-modal");
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement("div");
  overlay.id = "design-health-modal";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center";

  const modal = document.createElement("div");
  modal.style.cssText = "background:#1e1e2e;border-radius:16px;padding:28px;width:700px;max-height:85vh;overflow-y:auto;color:#e0e0e0;font-family:Inter,system-ui,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,0.5)";

  let activeTab = "overview";

  function render() {
    let r: HealthReport;
    try { r = JSON.parse((engine as any).get_design_health()); }
    catch { modal.innerHTML = `<p style="color:#ff5630">Failed to load health data</p>`; return; }

    const sc = r.score;
    const scCol = scoreColor(sc);

    const tabs = [
      { id: "overview", label: "Overview" },
      { id: "components", label: `Components (${r.components.total_components})` },
      { id: "styles", label: `Styles (${r.styles.total_color_styles + r.styles.total_text_styles})` },
      { id: "colors", label: `Colors (${r.colors.unique_colors})` },
      { id: "typography", label: `Typography` },
      { id: "issues", label: `Issues (${r.issues.length})` },
    ];

    const tabBar = tabs.map(t =>
      `<button class="dh-tab" data-tab="${t.id}" style="padding:6px 14px;border:none;border-radius:6px;font-size:11px;cursor:pointer;${activeTab === t.id ? 'background:#4a90d9;color:#fff;font-weight:600' : 'background:transparent;color:#aaa'}">${t.label}</button>`
    ).join("");

    let body = "";

    if (activeTab === "overview") {
      body = `
        <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
          ${pill("Health Score", sc, scCol)}
          ${pill("Components", r.components.total_components)}
          ${pill("Instances", r.components.total_instances)}
          ${pill("Colors", r.colors.unique_colors)}
        </div>
        ${section("Adoption Rates",
          bar("Component Adoption", Math.round(r.components.adoption_rate * 100)) +
          bar("Style Adoption", Math.round(r.styles.style_adoption_rate * 100))
        )}
        ${r.issues.length > 0 ? section("Top Issues",
          r.issues.slice(0, 8).map(i => issueRow(i)).join("")
        ) : '<div style="color:#36b37e;font-size:13px;text-align:center;padding:20px">✅ No issues found — great health!</div>'}
      `;
    } else if (activeTab === "components") {
      const c = r.components;
      body = `
        <div style="display:flex;gap:10px;margin-bottom:16px">
          ${pill("Total", c.total_components)}
          ${pill("Instances", c.total_instances)}
          ${pill("Unused", c.unused_components.length, c.unused_components.length > 0 ? "#ffab00" : undefined)}
          ${pill("Detached", c.detached_instances.length, c.detached_instances.length > 0 ? "#ff5630" : undefined)}
        </div>
        ${bar("Adoption Rate", Math.round(c.adoption_rate * 100))}
        ${c.unused_components.length > 0 ? section("⚠ Unused Components",
          `<div style="font-size:12px;max-height:120px;overflow-y:auto">${c.unused_components.map(u =>
            `<div style="padding:3px 0;border-bottom:1px solid #333">${u.name}</div>`).join("")}</div>`
        ) : ""}
        ${c.detached_instances.length > 0 ? section("🔴 Detached Instances",
          `<div style="font-size:12px;max-height:120px;overflow-y:auto">${c.detached_instances.map(d =>
            `<div class="dh-nav" data-nid="${d.node_id}" style="padding:3px 0;border-bottom:1px solid #333;cursor:pointer;color:#ffab00">${d.node_name} <span style="color:#666">on ${d.page_name}</span></div>`).join("")}</div>`
        ) : ""}
      `;
    } else if (activeTab === "styles") {
      const s = r.styles;
      body = `
        <div style="display:flex;gap:10px;margin-bottom:16px">
          ${pill("Color Styles", s.total_color_styles)}
          ${pill("Text Styles", s.total_text_styles)}
          ${pill("Unused", s.unused_color_styles.length + s.unused_text_styles.length, (s.unused_color_styles.length + s.unused_text_styles.length) > 0 ? "#ffab00" : undefined)}
        </div>
        ${bar("Style Adoption", Math.round(s.style_adoption_rate * 100))}
        ${s.unused_color_styles.length > 0 ? section("Unused Color Styles",
          `<div style="font-size:12px">${s.unused_color_styles.map(u => `<div style="padding:3px 0;border-bottom:1px solid #333">${u.name}</div>`).join("")}</div>`
        ) : ""}
        ${s.unused_text_styles.length > 0 ? section("Unused Text Styles",
          `<div style="font-size:12px">${s.unused_text_styles.map(u => `<div style="padding:3px 0;border-bottom:1px solid #333">${u.name}</div>`).join("")}</div>`
        ) : ""}
        <div style="display:flex;gap:8px;margin-top:12px">
          ${s.unused_color_styles.length > 0 ? `<button id="dh-clean-cs" style="padding:8px 14px;border-radius:8px;border:none;background:#ff5630;color:#fff;cursor:pointer;font-size:11px;font-weight:600">🗑 Clean ${s.unused_color_styles.length} Color Styles</button>` : ""}
          ${s.unused_text_styles.length > 0 ? `<button id="dh-clean-ts" style="padding:8px 14px;border-radius:8px;border:none;background:#ff5630;color:#fff;cursor:pointer;font-size:11px;font-weight:600">🗑 Clean ${s.unused_text_styles.length} Text Styles</button>` : ""}
        </div>
      `;
    } else if (activeTab === "colors") {
      const cl = r.colors;
      body = `
        <div style="margin-bottom:12px;font-size:12px;color:#aaa">${cl.unique_colors} unique colors in use</div>
        ${cl.hardcoded_colors.length > 0 ? section("⚠ Hardcoded Colors (no style)",
          `<div style="display:flex;flex-wrap:wrap;gap:8px">${cl.hardcoded_colors.map(hc =>
            `<div style="display:flex;align-items:center;gap:6px;background:#2a2a3e;padding:6px 10px;border-radius:6px;font-size:11px">
              <div style="width:16px;height:16px;border-radius:4px;background:${hc.hex};border:1px solid #555"></div>
              ${hc.hex} <span style="color:#888">×${hc.count}</span>
            </div>`).join("")}</div>`
        ) : ""}
        ${cl.near_duplicates.length > 0 ? section("🔍 Near-Duplicate Colors",
          `<div style="font-size:11px;max-height:150px;overflow-y:auto">${cl.near_duplicates.map(p =>
            `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid #333">
              <div style="width:14px;height:14px;border-radius:3px;background:${p.color_a}"></div>
              ${p.color_a} ↔
              <div style="width:14px;height:14px;border-radius:3px;background:${p.color_b}"></div>
              ${p.color_b} <span style="color:#888;margin-left:auto">Δ${p.distance}</span>
            </div>`).join("")}</div>`
        ) : ""}
        ${cl.hardcoded_colors.length === 0 && cl.near_duplicates.length === 0 ? '<div style="color:#36b37e;text-align:center;padding:20px">✅ Color usage is clean</div>' : ""}
      `;
    } else if (activeTab === "typography") {
      const t = r.typography;
      body = `
        ${t.font_families.length > 0 ? section("Font Families",
          `<div style="display:flex;flex-wrap:wrap;gap:8px">${t.font_families.map(f =>
            `<div style="background:#2a2a3e;padding:6px 12px;border-radius:6px;font-size:12px">${f.family} <span style="color:#888">×${f.count}</span></div>`).join("")}</div>`
        ) : ""}
        ${t.font_sizes.length > 0 ? section("Font Sizes",
          `<div style="display:flex;flex-wrap:wrap;gap:6px">${t.font_sizes.map(s =>
            `<div style="background:${t.unstandardized_sizes.includes(s) ? '#3d2a1a' : '#2a2a3e'};padding:4px 10px;border-radius:4px;font-size:11px">${s}px</div>`).join("")}</div>
          <div style="margin-top:6px;font-size:10px;color:#888">Orange = not in any text style</div>`
        ) : ""}
        ${t.font_families.length > 3 ? `<div style="margin-top:12px;padding:8px 12px;background:#3d2a1a;border-radius:8px;font-size:12px;color:#ffab00">⚠ ${t.font_families.length} font families — consider reducing to 2–3</div>` : ""}
      `;
    } else if (activeTab === "issues") {
      const grouped: Record<string, HealthIssue[]> = {};
      for (const i of r.issues) {
        (grouped[i.category] ??= []).push(i);
      }
      body = Object.entries(grouped).map(([cat, items]) =>
        section(`${cat.charAt(0).toUpperCase() + cat.slice(1)} (${items.length})`,
          items.map(i => issueRow(i)).join("")
        )
      ).join("") || '<div style="color:#36b37e;text-align:center;padding:20px">✅ No issues</div>';
    }

    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h2 style="margin:0;font-size:18px;font-weight:700">🩺 Design System Health</h2>
        <button id="dh-close" style="background:none;border:none;color:#aaa;font-size:20px;cursor:pointer">✕</button>
      </div>
      <div style="display:flex;gap:4px;margin-bottom:18px;flex-wrap:wrap">${tabBar}</div>
      ${body}
      <div style="margin-top:16px;text-align:right">
        <button id="dh-refresh" style="padding:6px 14px;border-radius:6px;border:none;background:#4a90d9;color:#fff;cursor:pointer;font-size:11px;font-weight:600">↻ Refresh</button>
      </div>
    `;

    // Event binding
    modal.querySelector("#dh-close")?.addEventListener("click", () => overlay.remove());
    modal.querySelector("#dh-refresh")?.addEventListener("click", () => render());
    modal.querySelectorAll(".dh-tab").forEach(btn => {
      btn.addEventListener("click", () => { activeTab = (btn as HTMLElement).dataset.tab || "overview"; render(); });
    });
    modal.querySelector("#dh-clean-cs")?.addEventListener("click", () => {
      (engine as any).remove_unused_color_styles();
      opts?.onRefresh?.();
      render();
    });
    modal.querySelector("#dh-clean-ts")?.addEventListener("click", () => {
      (engine as any).remove_unused_text_styles();
      opts?.onRefresh?.();
      render();
    });
    modal.querySelectorAll(".dh-nav").forEach(el => {
      el.addEventListener("click", () => {
        const nid = parseInt((el as HTMLElement).dataset.nid || "0");
        if (nid) opts?.onNavigate?.(nid);
      });
    });
  }

  function issueRow(i: HealthIssue): string {
    const sev = { error: "🔴", warning: "🟡", info: "🔵" }[i.severity] || "⚪";
    return `<div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:1px solid #2a2a3e;font-size:12px${i.node_id ? ';cursor:pointer' : ''}" ${i.node_id ? `class="dh-nav" data-nid="${i.node_id}"` : ''}>
      <span>${sev}</span>
      <div style="flex:1">
        <div>${i.message}</div>
        ${i.suggestion ? `<div style="color:#888;font-size:10px;margin-top:2px">💡 ${i.suggestion}</div>` : ""}
      </div>
    </div>`;
  }

  render();
  overlay.appendChild(modal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}
