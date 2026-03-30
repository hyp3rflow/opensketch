import type { Editor } from "../editor";
import { icons } from "./icons";

/**
 * Accessibility checker panel — contrast ratio, touch target size, alt text checks.
 */

interface A11yIssue {
  nodeId: number;
  nodeName: string;
  severity: "error" | "warning" | "info";
  category: "contrast" | "touch-target" | "alt-text" | "text-size" | "spacing" | "corner-radius" | "color" | "naming" | "alignment" | "opacity" | "stroke";
  message: string;
  detail?: string;
  suggestion?: string;
}

interface A11yFix {
  node_id: number;
  node_name: string;
  current_color: string;
  suggested_color: string;
  current_ratio: number;
  fixed_ratio: number;
  target: string;
  suggested_r: number;
  suggested_g: number;
  suggested_b: number;
}

// WCAG 2.1 relative luminance
function sRGBtoLinear(c: number): number {
  c /= 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * sRGBtoLinear(r) + 0.7152 * sRGBtoLinear(g) + 0.0722 * sRGBtoLinear(b);
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseColor(color: string): [number, number, number] | null {
  if (!color) return null;
  // #RRGGBB or #RGB
  const hex = color.replace("#", "");
  if (hex.length === 6) {
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  if (hex.length === 3) {
    return [parseInt(hex[0]! + hex[0]!, 16), parseInt(hex[1]! + hex[1]!, 16), parseInt(hex[2]! + hex[2]!, 16)];
  }
  // rgba(r,g,b,a)
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return [+m[1]!, +m[2]!, +m[3]!];
  return null;
}

function getFillColor(fillInfo: any): [number, number, number] | null {
  if (!fillInfo) return null;
  // Multi-fill: use first visible solid
  if (Array.isArray(fillInfo.fills)) {
    for (const f of fillInfo.fills) {
      if (f.visible !== false && f.fill_type === "Solid" && f.color) {
        return parseColor(f.color);
      }
    }
  }
  // Legacy single fill
  if (fillInfo.color) return parseColor(fillInfo.color);
  return null;
}

const SEVERITY_COLORS: Record<string, string> = {
  error: "#ef4444",
  warning: "#f59e0b",
  info: "#3b82f6",
};

const SEVERITY_ICONS: Record<string, string> = {
  error: "⛔",
  warning: "⚠️",
  info: "ℹ️",
};

const CATEGORY_LABELS: Record<string, string> = {
  contrast: "Contrast",
  "touch-target": "Touch Target",
  "alt-text": "Alt Text",
  "text-size": "Text Size",
  spacing: "Spacing",
  "corner-radius": "Corner Radius",
  color: "Color",
  naming: "Naming",
  alignment: "Alignment",
  opacity: "Opacity",
  stroke: "Stroke",
};

export function setupAccessibilityPanel(container: HTMLElement, editor: Editor) {
  let lastIssues: A11yIssue[] = [];

  function runAudit(): A11yIssue[] {
    // Use Rust engine design lint (covers contrast, touch-target, alt-text, text-size,
    // plus design lint: spacing, corner-radius, color, naming, alignment, opacity)
    try {
      const lintJson = (editor.engine as any).run_design_lint();
      const rustIssues: any[] = JSON.parse(lintJson);
      return rustIssues.map((ri: any) => {
        const severityMap: Record<string, A11yIssue["severity"]> = { Error: "error", Warning: "warning", Info: "info" };
        const categoryMap: Record<string, A11yIssue["category"]> = {
          Contrast: "contrast", TouchTarget: "touch-target", TextSize: "text-size",
          AltText: "alt-text", Spacing: "spacing", CornerRadius: "corner-radius",
          Color: "color", Naming: "naming", Alignment: "alignment", Opacity: "opacity", Stroke: "stroke",
        };
        return {
          nodeId: Number(ri.node_id),
          nodeName: ri.node_name || "",
          severity: severityMap[ri.severity] || "info",
          category: categoryMap[ri.category] || "naming",
          message: ri.message || "",
          detail: ri.detail || undefined,
          suggestion: ri.suggestion || undefined,
        };
      });
    } catch {
      // Fallback: empty
      return [];
    }
  }

  function getA11yFixes(): A11yFix[] {
    try {
      return JSON.parse((editor.engine as any).get_a11y_fixes());
    } catch { return []; }
  }

  function render() {
    lastIssues = runAudit();
    const fixes = getA11yFixes();
    const fixMap = new Map<number, A11yFix>();
    for (const f of fixes) fixMap.set(f.node_id, f);

    container.innerHTML = "";

    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;height:100%;";

    // Header
    const header = document.createElement("div");
    header.style.cssText = "padding:12px 16px;border-bottom:1px solid #333;display:flex;align-items:center;justify-content:space-between;";

    const titleArea = document.createElement("div");
    titleArea.style.cssText = "display:flex;align-items:center;gap:8px;";
    const titleIcon = document.createElement("span");
    titleIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>`;
    titleArea.appendChild(titleIcon);
    const title = document.createElement("span");
    title.style.cssText = "font-size:13px;font-weight:600;color:#e0e0e0;";
    title.textContent = "Accessibility (A11y)";
    titleArea.appendChild(title);
    header.appendChild(titleArea);

    const btnGroup = document.createElement("div");
    btnGroup.style.cssText = "display:flex;gap:6px;";

    // Fix All button (only if there are contrast fixes)
    if (fixes.length > 0) {
      const fixAllBtn = document.createElement("button");
      fixAllBtn.style.cssText = "background:#059669;border:none;border-radius:6px;padding:4px 10px;color:white;cursor:pointer;font-size:11px;display:flex;align-items:center;gap:4px;transition:background 0.15s;";
      fixAllBtn.textContent = `🔧 Fix All (${fixes.length})`;
      fixAllBtn.addEventListener("mouseenter", () => fixAllBtn.style.background = "#10b981");
      fixAllBtn.addEventListener("mouseleave", () => fixAllBtn.style.background = "#059669");
      fixAllBtn.addEventListener("click", () => {
        const count = Number((editor.engine as any).apply_all_a11y_fixes());
        if (count > 0) { editor.render(); render(); }
      });
      btnGroup.appendChild(fixAllBtn);
    }

    // Re-run button
    const rerunBtn = document.createElement("button");
    rerunBtn.style.cssText = "background:#4f46e5;border:none;border-radius:6px;padding:4px 10px;color:white;cursor:pointer;font-size:11px;display:flex;align-items:center;gap:4px;transition:background 0.15s;";
    rerunBtn.textContent = "Re-check";
    rerunBtn.addEventListener("mouseenter", () => rerunBtn.style.background = "#6366f1");
    rerunBtn.addEventListener("mouseleave", () => rerunBtn.style.background = "#4f46e5");
    rerunBtn.addEventListener("click", render);
    btnGroup.appendChild(rerunBtn);
    header.appendChild(btnGroup);
    wrap.appendChild(header);

    // Summary
    const errors = lastIssues.filter(i => i.severity === "error").length;
    const warnings = lastIssues.filter(i => i.severity === "warning").length;
    const infos = lastIssues.filter(i => i.severity === "info").length;

    const summary = document.createElement("div");
    summary.style.cssText = "padding:10px 16px;display:flex;gap:12px;border-bottom:1px solid #333;";
    const makeBadge = (count: number, color: string, label: string) => {
      const b = document.createElement("span");
      b.style.cssText = `font-size:11px;color:${color};display:flex;align-items:center;gap:4px;`;
      b.innerHTML = `<span style="background:${color};color:white;border-radius:8px;padding:1px 6px;font-size:10px;font-weight:600;min-width:16px;text-align:center;">${count}</span>${label}`;
      return b;
    };
    summary.appendChild(makeBadge(errors, "#ef4444", "Errors"));
    summary.appendChild(makeBadge(warnings, "#f59e0b", "Warnings"));
    if (infos > 0) summary.appendChild(makeBadge(infos, "#3b82f6", "Info"));
    wrap.appendChild(summary);

    // Issues list
    const list = document.createElement("div");
    list.style.cssText = "flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:4px;";

    if (lastIssues.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "display:flex;flex-direction:column;align-items:center;padding-top:40px;color:#555;gap:8px;";
      empty.innerHTML = `<span style="font-size:32px;">✅</span><span style="font-size:12px;font-weight:500;">No accessibility issues found</span><span style="font-size:11px;color:#666;">All checks passed</span>`;
      list.appendChild(empty);
    } else {
      // Group by category
      const categories = ["contrast", "alt-text", "touch-target", "text-size", "spacing", "corner-radius", "color", "naming", "alignment", "opacity", "stroke"] as const;
      for (const cat of categories) {
        const catIssues = lastIssues.filter(i => i.category === cat);
        if (catIssues.length === 0) continue;

        const catHeader = document.createElement("div");
        catHeader.style.cssText = "font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;padding:8px 8px 4px;font-weight:600;";
        catHeader.textContent = `${CATEGORY_LABELS[cat]} (${catIssues.length})`;
        list.appendChild(catHeader);

        for (const issue of catIssues) {
          const row = document.createElement("div");
          row.style.cssText = `padding:8px 10px;background:#1e1e1e;border-radius:6px;border-left:3px solid ${SEVERITY_COLORS[issue.severity]};cursor:pointer;transition:background 0.1s;`;
          row.addEventListener("mouseenter", () => row.style.background = "#252525");
          row.addEventListener("mouseleave", () => row.style.background = "#1e1e1e");
          row.addEventListener("click", () => {
            // Select and zoom to node
            editor.engine.set_selection(new BigUint64Array([BigInt(issue.nodeId)]));
            editor.zoomToSelection();
            editor.render();
          });

          const topRow = document.createElement("div");
          topRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:3px;";
          const sev = document.createElement("span");
          sev.style.cssText = "font-size:12px;";
          sev.textContent = SEVERITY_ICONS[issue.severity] || "";
          topRow.appendChild(sev);
          const name = document.createElement("span");
          name.style.cssText = "font-size:11px;font-weight:600;color:#ccc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;";
          name.textContent = issue.nodeName;
          topRow.appendChild(name);
          row.appendChild(topRow);

          const msg = document.createElement("div");
          msg.style.cssText = "font-size:11px;color:#999;line-height:1.4;";
          msg.textContent = issue.message;
          row.appendChild(msg);

          if (issue.detail) {
            const det = document.createElement("div");
            det.style.cssText = "font-size:10px;color:#666;margin-top:2px;";
            det.textContent = issue.detail;
            row.appendChild(det);
          }

          if (issue.suggestion) {
            const sug = document.createElement("div");
            sug.style.cssText = "font-size:10px;color:#818cf8;margin-top:2px;font-style:italic;";
            sug.textContent = `💡 ${issue.suggestion}`;
            row.appendChild(sug);
          }

          // Alt text inline editor for alt-text issues
          if (issue.category === "alt-text") {
            const altRow = document.createElement("div");
            altRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-top:6px;";
            const altInput = document.createElement("input");
            altInput.type = "text";
            altInput.placeholder = "Enter alt text…";
            altInput.value = (editor.engine as any).get_alt_text(BigInt(issue.nodeId)) || "";
            altInput.style.cssText = "flex:1;background:#2a2a2a;border:1px solid #444;border-radius:4px;padding:3px 6px;color:#ccc;font-size:10px;outline:none;";
            altInput.addEventListener("focus", () => altInput.style.borderColor = "#818cf8");
            altInput.addEventListener("blur", () => altInput.style.borderColor = "#444");
            const setBtn = document.createElement("button");
            setBtn.style.cssText = "background:#4f46e5;border:none;border-radius:4px;padding:3px 8px;color:white;cursor:pointer;font-size:10px;font-weight:600;";
            setBtn.textContent = "Set";
            setBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              (editor.engine as any).set_alt_text(BigInt(issue.nodeId), altInput.value);
              editor.render();
              render();
            });
            altRow.appendChild(altInput);
            altRow.appendChild(setBtn);
            row.appendChild(altRow);
          }

          // Auto-fix button for contrast issues
          const fix = fixMap.get(issue.nodeId);
          if (fix && issue.category === "contrast") {
            const fixRow = document.createElement("div");
            fixRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-top:6px;";

            // Color preview: current → suggested
            const preview = document.createElement("span");
            preview.style.cssText = "display:flex;align-items:center;gap:4px;font-size:10px;color:#aaa;";
            preview.innerHTML = `
              <span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${fix.current_color};border:1px solid #555;"></span>
              <span>→</span>
              <span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${fix.suggested_color};border:1px solid #555;"></span>
              <span>${fix.suggested_color} (${fix.fixed_ratio}:1)</span>
            `;
            fixRow.appendChild(preview);

            const fixBtn = document.createElement("button");
            fixBtn.style.cssText = "margin-left:auto;background:#059669;border:none;border-radius:4px;padding:2px 8px;color:white;cursor:pointer;font-size:10px;font-weight:600;transition:background 0.15s;";
            fixBtn.textContent = "Fix";
            fixBtn.addEventListener("mouseenter", () => fixBtn.style.background = "#10b981");
            fixBtn.addEventListener("mouseleave", () => fixBtn.style.background = "#059669");
            fixBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              (editor.engine as any).apply_a11y_fix(BigInt(fix.node_id), fix.suggested_r, fix.suggested_g, fix.suggested_b);
              editor.render();
              render();
            });
            fixRow.appendChild(fixBtn);
            row.appendChild(fixRow);
          }

          list.appendChild(row);
        }
      }
    }

    wrap.appendChild(list);
    container.appendChild(wrap);
  }

  // Initial render
  render();

  // Expose for external refresh
  return { refresh: render };
}
