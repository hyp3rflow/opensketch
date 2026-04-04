import type { Editor } from "../editor";
import { icons } from "./icons";

/**
 * Dev Mode overlay — shows CSS snippet tooltip + quick export buttons
 * when hovering over a node in Dev Mode.
 */
export class DevModeOverlay {
  private editor: Editor;
  private container: HTMLDivElement;
  private tooltip: HTMLDivElement;
  private inspectBadge: HTMLDivElement;
  private hoveredNodeId: number | null = null;
  private visible = false;
  private _enabled = false;

  constructor(editor: Editor) {
    this.editor = editor;

    this.container = document.createElement("div");
    this.container.id = "dev-mode-overlay";
    this.container.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:80;";
    document.body.appendChild(this.container);

    this.tooltip = document.createElement("div");
    this.tooltip.className = "dev-mode-tooltip";
    this.tooltip.style.cssText = `
      position: absolute;
      display: none;
      background: #1e1e2e;
      color: #cdd6f4;
      border-radius: 8px;
      padding: 0;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 11px;
      line-height: 1.5;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      pointer-events: auto;
      max-width: 320px;
      min-width: 200px;
      overflow: hidden;
      border: 1px solid #313244;
    `;
    this.container.appendChild(this.tooltip);

    this.inspectBadge = document.createElement("div");
    this.inspectBadge.className = "dev-inspect-badge";
    this.inspectBadge.style.cssText = "position:absolute;display:none;pointer-events:auto;background:#0f172a;color:#cbd5e1;border:1px solid #334155;border-radius:8px;padding:6px 8px;font:11px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 8px 20px rgba(0,0,0,.25);min-width:180px;";
    this.container.appendChild(this.inspectBadge);
  }

  get enabled() { return this._enabled; }

  setEnabled(v: boolean) {
    this._enabled = v;
    if (!v) this.hide();
  }

  updateSelectionInspect(ids: number[]) {
    if (!this._enabled || ids.length !== 1) {
      this.inspectBadge.style.display = "none";
      return;
    }
    const id = ids[0]!;
    const nj = this.editor.engine.get_node_json(BigInt(id));
    if (!nj) return;
    const node = JSON.parse(nj);
    const layout = (() => { try { return JSON.parse(this.editor.engine.get_layout(BigInt(id))); } catch { return null; } })();

    const spacing = layout?.gap ?? 0;
    const pt = layout?.padding_top ?? layout?.padding ?? 0;
    const pr = layout?.padding_right ?? layout?.padding ?? 0;
    const pb = layout?.padding_bottom ?? layout?.padding ?? 0;
    const pl = layout?.padding_left ?? layout?.padding ?? 0;

    let margin = { t: 0, r: 0, b: 0, l: 0 };
    try {
      if (node.parent) {
        const pj = this.editor.engine.get_node_json(BigInt(Number(node.parent)));
        if (pj) {
          const p = JSON.parse(pj);
          margin = {
            l: Math.round((node.x ?? 0) - (p.x ?? 0)),
            t: Math.round((node.y ?? 0) - (p.y ?? 0)),
            r: Math.round((p.x ?? 0) + (p.width ?? 0) - ((node.x ?? 0) + (node.width ?? 0))),
            b: Math.round((p.y ?? 0) + (p.height ?? 0) - ((node.y ?? 0) + (node.height ?? 0))),
          };
        }
      }
    } catch {}

    const css = this.generateCSS(node, BigInt(id));
    this.inspectBadge.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px;">
        <strong style="font-size:10px;color:#93c5fd;">Dev Inspect</strong>
        <button class="dev-inspect-copy" style="background:#2563eb;color:white;border:none;border-radius:4px;padding:2px 6px;font-size:10px;cursor:pointer;">Copy</button>
      </div>
      <div>Spacing: <b>${Math.round(spacing)}px</b></div>
      <div>Padding: <b>${Math.round(pt)} ${Math.round(pr)} ${Math.round(pb)} ${Math.round(pl)}</b></div>
      <div>Margin: <b>${margin.t} ${margin.r} ${margin.b} ${margin.l}</b></div>
    `;
    this.inspectBadge.querySelector<HTMLButtonElement>(".dev-inspect-copy")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.copyCSS(css);
    });

    try {
      const b = JSON.parse(this.editor.engine.get_selection_bounds());
      if (!b) return;
      const zoom = this.editor.engine.get_zoom();
      const panX = this.editor.engine.get_pan_x();
      const panY = this.editor.engine.get_pan_y();
      const sx = b.x * zoom + panX;
      const sy = b.y * zoom + panY;
      this.inspectBadge.style.left = `${Math.max(8, sx + 8)}px`;
      this.inspectBadge.style.top = `${Math.max(8, sy - 70)}px`;
      this.inspectBadge.style.display = "block";
    } catch {
      this.inspectBadge.style.display = "none";
    }
  }

  show(nodeId: number, screenX: number, screenY: number) {
    if (!this._enabled) return;
    if (this.hoveredNodeId === nodeId && this.visible) return;
    this.hoveredNodeId = nodeId;

    const bid = BigInt(nodeId);
    const nj = this.editor.engine.get_node_json(bid);
    if (!nj) { this.hide(); return; }
    const node = JSON.parse(nj);

    // Generate compact CSS
    const css = this.generateCSS(node, bid);
    if (!css) { this.hide(); return; }

    // Build tooltip content
    const kindLabel = node.kind?.type || node.kind || "Node";
    const name = node.name || kindLabel;

    this.tooltip.innerHTML = `
      <div style="padding:8px 10px;background:#181825;border-bottom:1px solid #313244;display:flex;align-items:center;justify-content:space-between;">
        <span style="font-weight:600;color:#cba6f7;font-size:11px;">${this.escapeHtml(name)}</span>
        <span style="color:#6c7086;font-size:10px;">${kindLabel}</span>
      </div>
      <div class="dev-css-code" style="padding:8px 10px;white-space:pre;overflow-x:auto;max-height:200px;overflow-y:auto;cursor:pointer;" title="Click to copy">${this.highlightCSS(css)}</div>
      <div style="padding:6px 10px;border-top:1px solid #313244;display:flex;gap:6px;">
        <button class="dev-export-btn" data-format="png" style="flex:1;padding:4px 0;background:#313244;color:#cdd6f4;border:none;border-radius:4px;font-size:10px;cursor:pointer;pointer-events:auto;">PNG</button>
        <button class="dev-export-btn" data-format="svg" style="flex:1;padding:4px 0;background:#313244;color:#cdd6f4;border:none;border-radius:4px;font-size:10px;cursor:pointer;pointer-events:auto;">SVG</button>
        <button class="dev-copy-btn" style="flex:1;padding:4px 0;background:#89b4fa;color:#1e1e2e;border:none;border-radius:4px;font-size:10px;cursor:pointer;font-weight:600;pointer-events:auto;">Copy CSS</button>
      </div>
    `;

    // Event listeners
    const codeEl = this.tooltip.querySelector(".dev-css-code") as HTMLDivElement;
    codeEl?.addEventListener("click", () => this.copyCSS(css));

    const copyBtn = this.tooltip.querySelector(".dev-copy-btn") as HTMLButtonElement;
    copyBtn?.addEventListener("click", (e) => { e.stopPropagation(); this.copyCSS(css); });

    this.tooltip.querySelectorAll<HTMLButtonElement>(".dev-export-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const fmt = btn.dataset.format;
        if (fmt === "png") this.exportPNG(nodeId);
        else if (fmt === "svg") this.exportSVG(nodeId);
      });
    });

    // Position tooltip near cursor (offset to avoid covering node)
    const canvasRect = this.editor.canvas.getBoundingClientRect();
    let tx = screenX + canvasRect.left + 16;
    let ty = screenY + canvasRect.top + 16;

    // Keep in viewport
    this.tooltip.style.display = "block";
    const tw = this.tooltip.offsetWidth;
    const th = this.tooltip.offsetHeight;
    if (tx + tw > window.innerWidth - 10) tx = screenX + canvasRect.left - tw - 10;
    if (ty + th > window.innerHeight - 10) ty = screenY + canvasRect.top - th - 10;
    if (tx < 10) tx = 10;
    if (ty < 10) ty = 10;

    this.tooltip.style.left = `${tx}px`;
    this.tooltip.style.top = `${ty}px`;
    this.visible = true;
  }

  hide() {
    this.tooltip.style.display = "none";
    this.inspectBadge.style.display = "none";
    this.hoveredNodeId = null;
    this.visible = false;
  }

  private generateCSS(node: any, bid: bigint): string {
    const lines: string[] = [];
    const w = Math.round(node.width);
    const h = Math.round(node.height);
    lines.push(`width: ${w}px;`);
    lines.push(`height: ${h}px;`);

    if (node.corner_radius > 0) {
      lines.push(`border-radius: ${node.corner_radius}px;`);
    }

    if (node.opacity != null && node.opacity < 1) {
      lines.push(`opacity: ${node.opacity};`);
    }

    if (node.rotation) {
      lines.push(`transform: rotate(${Math.round(node.rotation)}deg);`);
    }

    // Fill
    try {
      const fillInfo = JSON.parse(this.editor.engine.get_fill_info(bid));
      if (fillInfo) {
        if (fillInfo.fills && fillInfo.fills.length > 0) {
          const f = fillInfo.fills[0];
          if (f.visible !== false) {
            if (f.type === "Solid" && f.color) {
              lines.push(`background: ${this.colorToCSS(f.color)};`);
            } else if (f.type === "LinearGradient" && f.stops) {
              const stops = f.stops.map((s: any) => `${this.colorToCSS(s.color)} ${Math.round(s.offset * 100)}%`).join(", ");
              lines.push(`background: linear-gradient(${stops});`);
            }
          }
        } else if (fillInfo.type === "Solid" && fillInfo.color) {
          lines.push(`background: ${this.colorToCSS(fillInfo.color)};`);
        }
      }
    } catch {}

    // Stroke
    try {
      const strokeInfo = JSON.parse(this.editor.engine.get_stroke_info(bid));
      if (strokeInfo && strokeInfo.width > 0) {
        const col = this.colorToCSS(strokeInfo.color || { r: 0, g: 0, b: 0, a: 1 });
        lines.push(`border: ${strokeInfo.width}px solid ${col};`);
      }
    } catch {}

    // Shadow
    try {
      const shadowsJson = this.editor.engine.get_shadows(bid);
      if (shadowsJson) {
        const shadows = JSON.parse(shadowsJson);
        const visibleShadows = shadows.filter((s: any) => s.visible !== false);
        if (visibleShadows.length > 0) {
          const ss = visibleShadows.map((s: any) =>
            `${s.offset_x || 0}px ${s.offset_y || 0}px ${s.blur || 0}px ${s.spread || 0}px ${this.colorToCSS(s.color)}`
          ).join(", ");
          lines.push(`box-shadow: ${ss};`);
        }
      }
    } catch {}

    // Blur
    try {
      const blur = this.editor.engine.get_blur(bid);
      if (blur > 0) lines.push(`filter: blur(${blur}px);`);
    } catch {}

    // Text properties
    const kind = typeof node.kind === "string" ? node.kind : node.kind?.type;
    if (kind === "Text") {
      if (node.font_family) lines.push(`font-family: '${node.font_family}';`);
      if (node.font_size) lines.push(`font-size: ${node.font_size}px;`);
      if (node.font_weight && node.font_weight !== 400) lines.push(`font-weight: ${node.font_weight};`);
      if (node.font_style === "italic") lines.push(`font-style: italic;`);
      if (node.text_align && node.text_align !== "left") lines.push(`text-align: ${node.text_align};`);
      if (node.line_height) lines.push(`line-height: ${node.line_height};`);
    }

    // Layout
    try {
      const layoutJson = this.editor.engine.get_layout(bid);
      if (layoutJson) {
        const layout = JSON.parse(layoutJson);
        if (layout.mode === "Flex") {
          lines.push(`display: flex;`);
          if (layout.direction) lines.push(`flex-direction: ${layout.direction === "Vertical" ? "column" : "row"};`);
          if (layout.align_items) lines.push(`align-items: ${layout.align_items.toLowerCase()};`);
          if (layout.justify_content) lines.push(`justify-content: ${layout.justify_content.toLowerCase().replace("_", "-")};`);
          if (layout.gap) lines.push(`gap: ${layout.gap}px;`);
        }
      }
    } catch {}

    return lines.join("\n");
  }

  private colorToCSS(c: any): string {
    if (!c) return "transparent";
    const r = Math.round((c.r ?? 0) * 255);
    const g = Math.round((c.g ?? 0) * 255);
    const b = Math.round((c.b ?? 0) * 255);
    const a = c.a ?? 1;
    if (a < 1) return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  private highlightCSS(css: string): string {
    return css.replace(/([a-z-]+):/g, '<span style="color:#89b4fa;">$1</span>:')
      .replace(/(#[0-9a-f]{3,8})/gi, '<span style="color:#a6e3a1;">$1</span>')
      .replace(/(\d+(?:\.\d+)?)(px|deg|%)/g, '<span style="color:#fab387;">$1</span><span style="color:#f38ba8;">$2</span>')
      .replace(/(rgba?\([^)]+\))/g, '<span style="color:#a6e3a1;">$1</span>');
  }

  private async copyCSS(css: string) {
    try {
      await navigator.clipboard.writeText(css);
      this.showToast("CSS copied!");
    } catch {
      this.showToast("Copy failed");
    }
  }

  private exportPNG(nodeId: number) {
    try {
      const bid = BigInt(nodeId);
      const dataUrl = this.editor.engine.export_node_png(bid, 2.0);
      if (dataUrl) {
        const nj = this.editor.engine.get_node_json(bid);
        const name = nj ? (JSON.parse(nj).name || "node") : "node";
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `${name}.png`;
        a.click();
        this.showToast("PNG exported!");
      }
    } catch { this.showToast("Export failed"); }
  }

  private exportSVG(nodeId: number) {
    try {
      const bid = BigInt(nodeId);
      const svg = this.editor.engine.export_node_svg(bid);
      if (svg) {
        const nj = this.editor.engine.get_node_json(bid);
        const name = nj ? (JSON.parse(nj).name || "node") : "node";
        const blob = new Blob([svg], { type: "image/svg+xml" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${name}.svg`;
        a.click();
        URL.revokeObjectURL(a.href);
        this.showToast("SVG exported!");
      }
    } catch { this.showToast("Export failed"); }
  }

  private showToast(msg: string) {
    const toast = document.createElement("div");
    toast.style.cssText = `
      position: fixed; bottom: 60px; left: 50%; transform: translateX(-50%);
      background: #1e1e2e; color: #a6e3a1; padding: 8px 16px; border-radius: 6px;
      font-size: 12px; font-family: -apple-system, sans-serif; z-index: 10000;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3); border: 1px solid #313244;
      animation: dev-toast-in 0.2s ease;
    `;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s";
      setTimeout(() => toast.remove(), 300);
    }, 1500);
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  destroy() {
    this.container.remove();
  }
}
