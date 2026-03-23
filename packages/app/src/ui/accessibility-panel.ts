import type { Editor } from "../editor";
import { icons } from "./icons";

/**
 * Accessibility checker panel — contrast ratio, touch target size, alt text checks.
 */

interface A11yIssue {
  nodeId: number;
  nodeName: string;
  severity: "error" | "warning" | "info";
  category: "contrast" | "touch-target" | "alt-text" | "text-size";
  message: string;
  detail?: string;
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
};

export function setupAccessibilityPanel(container: HTMLElement, editor: Editor) {
  let lastIssues: A11yIssue[] = [];

  function runAudit(): A11yIssue[] {
    const issues: A11yIssue[] = [];
    const layersJson = editor.engine.get_layer_list();
    const layers: any[] = JSON.parse(layersJson);

    for (const layer of layers) {
      const id = Number(layer.id);
      const bid = BigInt(id);
      const nodeJsonStr = editor.engine.get_node_json(bid);
      if (!nodeJsonStr) continue;
      const node = JSON.parse(nodeJsonStr);
      const kind = typeof node.kind === "string" ? node.kind : (node.kind ? Object.keys(node.kind)[0] : "");

      // Skip invisible, slices, connectors
      if (!node.visible) continue;
      if (kind === "Slice" || kind === "Connector" || kind === "Section") continue;

      // 1. Text contrast check
      if (kind === "Text") {
        const textColor = node.fill?.color || (node.fills?.[0]?.color);
        const tc = parseColor(textColor);
        if (tc) {
          // Try to find parent fill for background
          let bgColor: [number, number, number] | null = null;
          if (node.parent) {
            const parentJson = editor.engine.get_node_json(BigInt(node.parent));
            if (parentJson) {
              const parent = JSON.parse(parentJson);
              const pfInfo = JSON.parse(editor.engine.get_fill_info(BigInt(node.parent)));
              bgColor = getFillColor(pfInfo);
            }
          }
          if (!bgColor) bgColor = [255, 255, 255]; // assume white bg

          const fgLum = relativeLuminance(...tc);
          const bgLum = relativeLuminance(...bgColor);
          const ratio = contrastRatio(fgLum, bgLum);
          const fontSize = node.font_size || 16;
          const isLarge = fontSize >= 24 || (fontSize >= 18.66 && (node.font_weight || 400) >= 700);
          const minRatio = isLarge ? 3.0 : 4.5;
          const aaMinRatio = isLarge ? 4.5 : 7.0;

          if (ratio < minRatio) {
            issues.push({
              nodeId: id, nodeName: node.name || "Text",
              severity: "error", category: "contrast",
              message: `Contrast ratio ${ratio.toFixed(1)}:1 fails WCAG AA (needs ≥${minRatio}:1)`,
              detail: `Text: ${textColor}, Background: #${bgColor.map(c => c.toString(16).padStart(2, "0")).join("")}`,
            });
          } else if (ratio < aaMinRatio) {
            issues.push({
              nodeId: id, nodeName: node.name || "Text",
              severity: "warning", category: "contrast",
              message: `Contrast ratio ${ratio.toFixed(1)}:1 passes AA but fails AAA (needs ≥${aaMinRatio}:1)`,
            });
          }
        }

        // Text size check
        const fontSize = node.font_size || 16;
        if (fontSize < 12) {
          issues.push({
            nodeId: id, nodeName: node.name || "Text",
            severity: "warning", category: "text-size",
            message: `Font size ${fontSize}px is below recommended minimum (12px)`,
          });
        }
      }

      // 2. Touch target size (interactive elements — all non-frame leaf nodes)
      if (kind !== "Frame" && kind !== "Group" && (!node.children || node.children.length === 0)) {
        const w = node.width || 0;
        const h = node.height || 0;
        if (w > 0 && h > 0 && (w < 44 || h < 44)) {
          // Only warn for reasonably sized elements (not tiny decorations < 8px)
          if (w >= 8 && h >= 8) {
            issues.push({
              nodeId: id, nodeName: node.name || kind,
              severity: "warning", category: "touch-target",
              message: `Size ${Math.round(w)}×${Math.round(h)}px is below 44×44px touch target`,
            });
          }
        }
      }

      // 3. Image alt text
      if (kind === "Image") {
        const name = node.name || "";
        const isGeneric = /^Image \d+$/.test(name);
        if (isGeneric || !name) {
          issues.push({
            nodeId: id, nodeName: name || "Image",
            severity: "error", category: "alt-text",
            message: "Image lacks descriptive name (used as alt text)",
            detail: "Rename this image node to describe its content",
          });
        }
      }
    }

    return issues;
  }

  function render() {
    lastIssues = runAudit();
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
    title.textContent = "Accessibility";
    titleArea.appendChild(title);
    header.appendChild(titleArea);

    // Re-run button
    const rerunBtn = document.createElement("button");
    rerunBtn.style.cssText = "background:#4f46e5;border:none;border-radius:6px;padding:4px 10px;color:white;cursor:pointer;font-size:11px;display:flex;align-items:center;gap:4px;transition:background 0.15s;";
    rerunBtn.textContent = "Re-check";
    rerunBtn.addEventListener("mouseenter", () => rerunBtn.style.background = "#6366f1");
    rerunBtn.addEventListener("mouseleave", () => rerunBtn.style.background = "#4f46e5");
    rerunBtn.addEventListener("click", render);
    header.appendChild(rerunBtn);
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
      const categories = ["contrast", "alt-text", "touch-target", "text-size"] as const;
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
