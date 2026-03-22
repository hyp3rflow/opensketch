import type { Editor } from "../editor";
import { icons } from "./icons";

/**
 * Inspect panel — generates CSS code from selected node properties.
 */
export function setupInspectPanel(container: HTMLElement, editor: Editor) {
  function refresh(ids: number[]) {
    container.innerHTML = "";
    if (ids.length === 0) {
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;padding-top:60px;color:#555;">
          <span style="opacity:0.4;margin-bottom:8px;">${icons.cursor}</span>
          <span style="font-size:11px;">Select an element to inspect</span>
        </div>`;
      return;
    }
    if (ids.length > 1) {
      container.innerHTML = `<div style="padding:16px;color:#666;font-size:12px;">Select a single element to inspect CSS</div>`;
      return;
    }

    const bid = BigInt(ids[0]!);
    const nodeJson = editor.engine.get_node_json(bid);
    if (!nodeJson) return;
    const node = JSON.parse(nodeJson);

    // Gather extra info
    const fillInfo = JSON.parse(editor.engine.get_fill_info(bid));
    const strokeInfo = JSON.parse(editor.engine.get_stroke_info(bid));
    const shadowsJson = editor.engine.get_shadows(bid);
    const shadows = shadowsJson ? JSON.parse(shadowsJson) : [];
    const blur = editor.engine.get_blur(bid);
    const blendMode = editor.engine.get_blend_mode(bid);
    const layoutJson = editor.engine.get_layout(bid);
    const layout = layoutJson ? JSON.parse(layoutJson) : null;

    const css = generateCSS(node, fillInfo, strokeInfo, shadows, blur, blendMode, layout);
    const svgProps = generateSVGProps(node, fillInfo, strokeInfo, shadows, blur);

    const wrap = document.createElement("div");
    wrap.style.cssText = "padding:12px;display:flex;flex-direction:column;gap:12px;";

    // Node info header
    const header = document.createElement("div");
    header.style.cssText = "font-size:10px;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;";
    header.textContent = getKindLabel(node.kind) + (node.name ? ` — ${node.name}` : "");
    wrap.appendChild(header);

    // CSS section
    wrap.appendChild(createCodeSection("CSS", css));

    // SVG section (if relevant)
    if (svgProps) {
      wrap.appendChild(createCodeSection("SVG Attributes", svgProps));
    }

    container.appendChild(wrap);
  }

  function createCodeSection(title: string, code: string): HTMLElement {
    const section = document.createElement("div");
    section.style.cssText = "background:#1e1e1e;border:1px solid #333;border-radius:8px;overflow:hidden;";

    const headerRow = document.createElement("div");
    headerRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #333;background:#252525;";

    const label = document.createElement("span");
    label.style.cssText = "font-size:11px;font-weight:600;color:#aaa;";
    label.textContent = title;
    headerRow.appendChild(label);

    const copyBtn = document.createElement("button");
    copyBtn.style.cssText = "background:none;border:1px solid #444;border-radius:4px;padding:3px 8px;color:#888;cursor:pointer;font-size:10px;display:flex;align-items:center;gap:4px;transition:all 0.15s;";
    copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy`;
    copyBtn.addEventListener("mouseenter", () => { copyBtn.style.borderColor = "#4f46e5"; copyBtn.style.color = "#818cf8"; });
    copyBtn.addEventListener("mouseleave", () => { copyBtn.style.borderColor = "#444"; copyBtn.style.color = "#888"; });
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(code).then(() => {
        copyBtn.innerHTML = `✓ Copied`;
        copyBtn.style.color = "#10b981";
        setTimeout(() => {
          copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy`;
          copyBtn.style.color = "#888";
        }, 1500);
      });
    });
    headerRow.appendChild(copyBtn);
    section.appendChild(headerRow);

    const codeBlock = document.createElement("pre");
    codeBlock.style.cssText = "margin:0;padding:12px;font-family:'JetBrains Mono','Fira Code',monospace;font-size:11px;line-height:1.6;overflow-x:auto;color:#d4d4d4;white-space:pre-wrap;word-break:break-all;";
    codeBlock.innerHTML = highlightCSS(code);
    section.appendChild(codeBlock);

    return section;
  }

  editor.onSelection((ids) => refresh(ids));

  return { refresh };
}

function getKindLabel(kind: any): string {
  if (typeof kind === "string") return kind;
  if (kind.Text !== undefined) return "Text";
  if (kind.Image !== undefined) return "Image";
  if (kind.Star !== undefined) return "Star";
  if (kind.Polygon !== undefined) return "Polygon";
  if (kind.Path !== undefined) return "Path";
  return Object.keys(kind)[0] || "Unknown";
}

function rgbaToCSS(color: any): string {
  if (!color) return "transparent";
  if (typeof color === "string") return color;
  const r = Math.round((color.r ?? 0) * 255);
  const g = Math.round((color.g ?? 0) * 255);
  const b = Math.round((color.b ?? 0) * 255);
  const a = color.a ?? 1;
  if (a === 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
}

function colorToHex(color: any): string {
  if (!color) return "transparent";
  const r = Math.round((color.r ?? 0) * 255).toString(16).padStart(2, "0");
  const g = Math.round((color.g ?? 0) * 255).toString(16).padStart(2, "0");
  const b = Math.round((color.b ?? 0) * 255).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

function generateCSS(
  node: any, fill: any, stroke: any, shadows: any[], blur: number, blendMode: string, layout: any
): string {
  const lines: string[] = [];

  // Dimensions
  lines.push(`width: ${Math.round(node.width)}px;`);
  lines.push(`height: ${Math.round(node.height)}px;`);

  // Position (absolute)
  lines.push(`position: absolute;`);
  lines.push(`left: ${Math.round(node.x)}px;`);
  lines.push(`top: ${Math.round(node.y)}px;`);

  // Border radius
  if (node.corner_radius && node.corner_radius > 0) {
    lines.push(`border-radius: ${node.corner_radius}px;`);
  }

  // Rotation
  if (node.rotation && node.rotation !== 0) {
    lines.push(`transform: rotate(${node.rotation.toFixed(1)}deg);`);
  }

  // Opacity
  if (node.opacity !== undefined && node.opacity < 1) {
    lines.push(`opacity: ${node.opacity.toFixed(2)};`);
  }

  // Fill → background
  if (fill) {
    if (fill.type === "Solid" || fill.color) {
      const c = fill.color || fill;
      lines.push(`background-color: ${rgbaToCSS(c)};`);
    } else if (fill.type === "LinearGradient" && fill.stops) {
      const stops = fill.stops.map((s: any) => `${rgbaToCSS(s.color)} ${(s.offset * 100).toFixed(0)}%`).join(", ");
      lines.push(`background: linear-gradient(${stops});`);
    } else if (fill.type === "RadialGradient" && fill.stops) {
      const stops = fill.stops.map((s: any) => `${rgbaToCSS(s.color)} ${(s.offset * 100).toFixed(0)}%`).join(", ");
      lines.push(`background: radial-gradient(${stops});`);
    }
  }

  // Stroke → border
  if (stroke && stroke.color && stroke.width) {
    lines.push(`border: ${stroke.width}px solid ${rgbaToCSS(stroke.color)};`);
  }

  // Shadows → box-shadow
  if (shadows && shadows.length > 0) {
    const visibleShadows = shadows.filter((s: any) => s.visible !== false);
    if (visibleShadows.length > 0) {
      const shadowStr = visibleShadows.map((s: any) =>
        `${s.offset_x ?? 0}px ${s.offset_y ?? 0}px ${s.blur ?? 0}px ${s.spread ?? 0}px ${rgbaToCSS(s.color)}`
      ).join(",\n    ");
      lines.push(`box-shadow: ${shadowStr};`);
    }
  }

  // Blur → filter
  if (blur && blur > 0) {
    lines.push(`filter: blur(${blur}px);`);
  }

  // Blend mode
  if (blendMode && blendMode !== "Normal" && blendMode !== "normal") {
    const cssBlend = blendMode.replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^-/, "");
    lines.push(`mix-blend-mode: ${cssBlend};`);
  }

  // Text properties
  const kind = node.kind;
  if (kind && (kind.Text !== undefined || typeof kind === "string" && kind === "Text")) {
    const text = typeof kind === "object" ? kind.Text : null;
    if (node.font_family) lines.push(`font-family: '${node.font_family}';`);
    if (node.font_size) lines.push(`font-size: ${node.font_size}px;`);
    if (node.font_weight && node.font_weight !== 400) lines.push(`font-weight: ${node.font_weight};`);
    if (node.font_style && node.font_style !== "normal") lines.push(`font-style: ${node.font_style};`);
    if (node.line_height && node.line_height !== 1.2) lines.push(`line-height: ${node.line_height};`);
    if (node.text_align && node.text_align !== "left") lines.push(`text-align: ${node.text_align};`);
    if (node.fill) lines.push(`color: ${rgbaToCSS(node.fill)};`);
  }

  // Layout (Flex/Grid)
  if (layout && layout.mode && layout.mode !== "None") {
    if (layout.mode === "Flex") {
      lines.push(`display: flex;`);
      if (layout.direction === "Column") lines.push(`flex-direction: column;`);
      if (layout.align_items) lines.push(`align-items: ${cssAlignValue(layout.align_items)};`);
      if (layout.justify_content) lines.push(`justify-content: ${cssJustifyValue(layout.justify_content)};`);
      if (layout.gap) lines.push(`gap: ${layout.gap}px;`);
      if (layout.wrap) lines.push(`flex-wrap: wrap;`);
    } else if (layout.mode === "Grid") {
      lines.push(`display: grid;`);
      if (layout.grid_columns) lines.push(`grid-template-columns: repeat(${layout.grid_columns}, 1fr);`);
      if (layout.gap) lines.push(`gap: ${layout.gap}px;`);
    }
    if (layout.padding) {
      const p = layout.padding;
      if (p.top === p.right && p.right === p.bottom && p.bottom === p.left) {
        if (p.top > 0) lines.push(`padding: ${p.top}px;`);
      } else {
        lines.push(`padding: ${p.top ?? 0}px ${p.right ?? 0}px ${p.bottom ?? 0}px ${p.left ?? 0}px;`);
      }
    }
  }

  // Ellipse → border-radius: 50%
  if (typeof kind === "string" && kind === "Ellipse") {
    // Replace any existing border-radius
    const brIdx = lines.findIndex(l => l.startsWith("border-radius"));
    if (brIdx >= 0) lines[brIdx] = "border-radius: 50%;";
    else lines.push("border-radius: 50%;");
  }

  return lines.join("\n");
}

function cssAlignValue(v: string): string {
  const map: Record<string, string> = { Start: "flex-start", Center: "center", End: "flex-end", Stretch: "stretch" };
  return map[v] || v.toLowerCase();
}

function cssJustifyValue(v: string): string {
  const map: Record<string, string> = { Start: "flex-start", Center: "center", End: "flex-end", SpaceBetween: "space-between", SpaceAround: "space-around" };
  return map[v] || v.toLowerCase();
}

function generateSVGProps(
  node: any, fill: any, stroke: any, shadows: any[], blur: number
): string | null {
  if (!stroke?.dash_array && !stroke?.line_cap && !stroke?.line_join) {
    // Only show SVG section if there are SVG-specific props
    const kind = node.kind;
    const isPath = kind && (kind.Path !== undefined || kind === "Path");
    const isStar = kind && (kind.Star !== undefined);
    const isPoly = kind && (kind.Polygon !== undefined);
    if (!isPath && !isStar && !isPoly) return null;
  }

  const lines: string[] = [];

  if (fill) {
    if (fill.type === "Solid" || fill.color) {
      lines.push(`fill="${colorToHex(fill.color || fill)}"`);
    }
  }

  if (stroke && stroke.color && stroke.width) {
    lines.push(`stroke="${colorToHex(stroke.color)}"`);
    lines.push(`stroke-width="${stroke.width}"`);
    if (stroke.dash_array && stroke.dash_array.length > 0) {
      lines.push(`stroke-dasharray="${stroke.dash_array.join(" ")}"`);
      if (stroke.dash_offset) lines.push(`stroke-dashoffset="${stroke.dash_offset}"`);
    }
    if (stroke.line_cap && stroke.line_cap !== "Butt") {
      lines.push(`stroke-linecap="${stroke.line_cap.toLowerCase()}"`);
    }
    if (stroke.line_join && stroke.line_join !== "Miter") {
      lines.push(`stroke-linejoin="${stroke.line_join.toLowerCase()}"`);
    }
  }

  if (node.opacity !== undefined && node.opacity < 1) {
    lines.push(`opacity="${node.opacity.toFixed(2)}"`);
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

function highlightCSS(code: string): string {
  return code
    // Properties (word before colon)
    .replace(/^([\w-]+)(?=:)/gm, '<span style="color:#9cdcfe;">$1</span>')
    // Values: numbers with units
    .replace(/:\s*(.+);/g, (_m, val) => {
      const highlighted = (val as string)
        // Numbers + units
        .replace(/(\d+\.?\d*)(px|deg|%)?/g, '<span style="color:#b5cea8;">$1$2</span>')
        // Color values: rgb/rgba/hex
        .replace(/(rgba?\([^)]+\))/g, '<span style="color:#ce9178;">$1</span>')
        .replace(/(#[0-9a-fA-F]{3,8})/g, '<span style="color:#ce9178;">$1</span>')
        // Keywords
        .replace(/\b(solid|absolute|flex|grid|column|wrap|center|none|inherit|italic)\b/g, '<span style="color:#c586c0;">$1</span>')
        // Strings (font names)
        .replace(/('[^']+')/g, '<span style="color:#ce9178;">$1</span>');
      return `: ${highlighted};`;
    })
    // SVG attribute names
    .replace(/^([\w-]+)(?==)/gm, '<span style="color:#9cdcfe;">$1</span>')
    // SVG attribute values in quotes
    .replace(/"([^"]+)"/g, '"<span style="color:#ce9178;">$1</span>"');
}
