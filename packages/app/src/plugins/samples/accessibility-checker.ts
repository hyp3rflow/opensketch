/**
 * Accessibility Checker Plugin
 * Checks color contrast ratios and reports accessibility issues.
 */

import type { Plugin, PluginAPI } from "../types";

export const AccessibilityCheckerPlugin: Plugin = {
  id: "accessibility-checker",
  name: "Accessibility Checker",
  version: "1.0.0",
  description: "Check color contrast ratios and highlight accessibility issues in your design",
  icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="4" r="2" stroke="currentColor" stroke-width="1.2"/><path d="M4 8l4 2 4-2M8 10v4M5 14h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  activate(api: PluginAPI) {
    api.ui.registerPanel({
      id: "a11y-checker-panel",
      title: "A11y Checker",
      render(container: HTMLElement) {
        function runCheck() {
          const scene = api.scene.getSceneJson();
          const nodes: any[] = scene.nodes || [];
          const issues: { id: number; name: string; issue: string; level: string }[] = [];

          for (const node of nodes) {
            const kind = typeof node.kind === "string" ? node.kind : Object.keys(node.kind)[0];

            // Check text contrast
            if (kind === "Text") {
              const textColor = node.fills?.[0]?.color;
              if (textColor) {
                const lum = relativeLuminance(textColor.r, textColor.g, textColor.b);
                // Assume dark background (#1e1e1e ≈ 0.033 lum)
                const bgLum = 0.033;
                const ratio = contrastRatio(lum, bgLum);
                const fontSize = node.kind?.Text ? 14 : 14;
                const isLarge = fontSize >= 18;
                if (!isLarge && ratio < 4.5) {
                  issues.push({ id: node.id, name: node.name, issue: `Low contrast (${ratio.toFixed(1)}:1, need 4.5:1)`, level: "error" });
                } else if (isLarge && ratio < 3) {
                  issues.push({ id: node.id, name: node.name, issue: `Low contrast for large text (${ratio.toFixed(1)}:1, need 3:1)`, level: "warning" });
                }
              }
            }

            // Check small touch targets
            if (node.width < 44 || node.height < 44) {
              if (kind === "Rect" || kind === "Ellipse" || kind === "Frame") {
                const area = node.width * node.height;
                if (area > 0 && area < 44 * 44) {
                  issues.push({ id: node.id, name: node.name, issue: `Small tap target (${Math.round(node.width)}×${Math.round(node.height)}, min 44×44)`, level: "warning" });
                }
              }
            }

            // Check missing names for images
            if (kind === "Image" && (!node.name || node.name === "Image")) {
              issues.push({ id: node.id, name: node.name, issue: "Image missing alt text (name)", level: "warning" });
            }
          }

          container.innerHTML = `
            <div style="padding:12px;display:flex;flex-direction:column;gap:6px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                <span style="font-weight:600;color:#eee;font-size:12px;">Issues (${issues.length})</span>
                <button id="a11y-recheck" style="background:#333;border:1px solid #555;border-radius:4px;padding:3px 8px;color:#ccc;cursor:pointer;font-size:10px;">Re-check</button>
              </div>
              ${issues.length === 0
                ? '<div style="color:#22c55e;font-size:12px;padding:12px;text-align:center;">✓ No issues found!</div>'
                : issues.map(i => `
                  <div class="a11y-issue" data-id="${i.id}" style="padding:8px;background:#2a2a2a;border-radius:6px;border-left:3px solid ${i.level === "error" ? "#ef4444" : "#f59e0b"};cursor:pointer;">
                    <div style="font-size:11px;color:#eee;font-weight:500;">${i.name}</div>
                    <div style="font-size:10px;color:${i.level === "error" ? "#ef4444" : "#f59e0b"};margin-top:2px;">${i.issue}</div>
                  </div>
                `).join("")
              }
            </div>
          `;

          container.querySelector("#a11y-recheck")?.addEventListener("click", runCheck);
          container.querySelectorAll<HTMLElement>(".a11y-issue").forEach(el => {
            el.addEventListener("click", () => {
              const id = parseInt(el.dataset.id!);
              api.scene.select(id);
            });
          });
        }

        runCheck();
      },
    });
  },

  deactivate() {},
};

function relativeLuminance(r: number, g: number, b: number): number {
  const sRGB = [r, g, b].map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
