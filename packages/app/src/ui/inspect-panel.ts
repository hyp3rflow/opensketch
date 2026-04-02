import type { Editor } from "../editor";
import { icons } from "./icons";
import { renderCodeMappingSection } from "./code-mapping-panel";

type CodeLang = "css" | "swiftui" | "kotlin" | "svg";

/**
 * Inspect panel — generates CSS / SwiftUI / Kotlin Compose / SVG code from selected node properties.
 * Also provides asset download (PNG/SVG export of the selected node).
 */
export function setupInspectPanel(container: HTMLElement, editor: Editor) {
  let currentLang: CodeLang = "css";
  let currentIds: number[] = [];

  function refresh(ids: number[]) {
    currentIds = ids;
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
      container.innerHTML = `<div style="padding:16px;color:#666;font-size:12px;">Select a single element to inspect code</div>`;
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

    let bitmapFilter: any = null;
    try {
      const bfJson = (editor.engine as any).get_bitmap_filter?.(bid);
      if (bfJson) bitmapFilter = JSON.parse(bfJson);
    } catch {}

    const wrap = document.createElement("div");
    wrap.style.cssText = "padding:12px;display:flex;flex-direction:column;gap:12px;";

    // Node info header
    const header = document.createElement("div");
    header.style.cssText = "font-size:10px;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;";
    header.textContent = getKindLabel(node.kind) + (node.name ? ` — ${node.name}` : "");
    wrap.appendChild(header);

    // Language tabs
    const tabBar = document.createElement("div");
    tabBar.style.cssText = "display:flex;gap:2px;background:#1a1a1a;border-radius:6px;padding:2px;";
    const langs: { key: CodeLang; label: string }[] = [
      { key: "css", label: "CSS" },
      { key: "swiftui", label: "SwiftUI" },
      { key: "kotlin", label: "Kotlin" },
      { key: "svg", label: "SVG" },
    ];
    for (const lang of langs) {
      const tab = document.createElement("button");
      tab.textContent = lang.label;
      const isActive = currentLang === lang.key;
      tab.style.cssText = `
        flex:1;padding:5px 8px;border:none;border-radius:4px;font-size:11px;font-weight:500;cursor:pointer;transition:all 0.15s;
        background:${isActive ? "#333" : "transparent"};color:${isActive ? "#e0e0e0" : "#777"};
      `;
      tab.addEventListener("click", () => {
        currentLang = lang.key;
        refresh(currentIds);
      });
      tabBar.appendChild(tab);
    }
    wrap.appendChild(tabBar);

    // Generate code
    const ctx = { node, fill: fillInfo, stroke: strokeInfo, shadows, blur, blendMode, layout, bitmapFilter };
    let code = "";
    switch (currentLang) {
      case "css": code = generateCSS(ctx); break;
      case "swiftui": code = generateSwiftUI(ctx); break;
      case "kotlin": code = generateKotlin(ctx); break;
      case "svg": code = generateSVGProps(ctx) || "// No SVG-specific attributes"; break;
    }

    wrap.appendChild(createCodeSection(langs.find(l => l.key === currentLang)!.label, code));

    // Asset download section
    const assetSection = document.createElement("div");
    assetSection.style.cssText = "display:flex;gap:8px;";
    const pngBtn = createDownloadBtn("↓ PNG", () => downloadAsset(editor, ids[0]!, "png"));
    const svgBtn = createDownloadBtn("↓ SVG", () => downloadAsset(editor, ids[0]!, "svg"));
    assetSection.appendChild(pngBtn);
    assetSection.appendChild(svgBtn);
    wrap.appendChild(assetSection);

    // Design Tokens export section
    const tokensSection = document.createElement("div");
    tokensSection.style.cssText = "margin-top:12px;";
    const tokensLabel = document.createElement("div");
    tokensLabel.textContent = "Design Tokens";
    tokensLabel.style.cssText = "color:#aaa;font-size:11px;font-weight:600;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;";
    tokensSection.appendChild(tokensLabel);
    const tokensBtns = document.createElement("div");
    tokensBtns.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;";
    const tokenFormats: { label: string; key: string }[] = [
      { label: "W3C DTCG", key: "w3c" },
      { label: "Style Dictionary", key: "style-dictionary" },
      { label: "Tailwind", key: "tailwind" },
    ];
    for (const fmt of tokenFormats) {
      const btn = createDownloadBtn(`↓ ${fmt.label}`, () => {
        editor.downloadDesignTokens(fmt.key);
      });
      tokensBtns.appendChild(btn);
    }
    tokensSection.appendChild(tokensBtns);
    wrap.appendChild(tokensSection);

    // Resource Links section
    {
      const resLinksJson = (editor.engine as any).get_resource_links?.(bid);
      const resLinks: { url: string; label: string; link_type: string }[] = resLinksJson ? JSON.parse(resLinksJson) : [];
      if (resLinks.length > 0) {
        const rlSection = document.createElement("div");
        rlSection.style.cssText = "margin-top:12px;";
        const rlLabel = document.createElement("div");
        rlLabel.textContent = "Resources";
        rlLabel.style.cssText = "color:#aaa;font-size:11px;font-weight:600;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;";
        rlSection.appendChild(rlLabel);
        for (const rl of resLinks) {
          const link = document.createElement("a");
          link.href = rl.url;
          link.target = "_blank";
          link.rel = "noopener";
          link.style.cssText = "display:flex;align-items:center;gap:6px;padding:5px 8px;background:#1e1e2e;border-radius:4px;margin-bottom:3px;text-decoration:none;color:#7c9aff;font-size:11px;transition:background 0.15s;";
          link.addEventListener("mouseenter", () => { link.style.background = "#2a2a3e"; });
          link.addEventListener("mouseleave", () => { link.style.background = "#1e1e2e"; });
          const badge = document.createElement("span");
          badge.textContent = rl.link_type;
          badge.style.cssText = "font-size:9px;padding:1px 4px;border-radius:3px;background:#333;color:#888;";
          link.appendChild(badge);
          const text = document.createElement("span");
          text.textContent = rl.label || rl.url;
          text.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
          link.appendChild(text);
          rlSection.appendChild(link);
        }
        wrap.appendChild(rlSection);
      }
    }

    // Code mapping section
    renderCodeMappingSection(wrap, editor, ids[0]!);

    container.appendChild(wrap);
  }

  function createDownloadBtn(label: string, action: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.style.cssText = `
      flex:1;padding:6px 12px;background:#1e1e1e;border:1px solid #444;border-radius:6px;
      color:#aaa;font-size:11px;cursor:pointer;transition:all 0.15s;font-weight:500;
    `;
    btn.addEventListener("mouseenter", () => { btn.style.borderColor = "#4f46e5"; btn.style.color = "#818cf8"; });
    btn.addEventListener("mouseleave", () => { btn.style.borderColor = "#444"; btn.style.color = "#aaa"; });
    btn.addEventListener("click", action);
    return btn;
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
    codeBlock.innerHTML = highlightCode(code, currentLang);
    section.appendChild(codeBlock);

    return section;
  }

  editor.onSelection((ids) => refresh(ids));

  return { refresh };
}

// ─── Helpers ───────────────────────────────────────────

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

function swiftColor(color: any): string {
  if (!color) return ".clear";
  const r = (color.r ?? 0).toFixed(3);
  const g = (color.g ?? 0).toFixed(3);
  const b = (color.b ?? 0).toFixed(3);
  const a = color.a ?? 1;
  if (a < 1) return `Color(red: ${r}, green: ${g}, blue: ${b}, opacity: ${a.toFixed(2)})`;
  return `Color(red: ${r}, green: ${g}, blue: ${b})`;
}

function kotlinColor(color: any): string {
  if (!color) return "Color.Transparent";
  const r = Math.round((color.r ?? 0) * 255);
  const g = Math.round((color.g ?? 0) * 255);
  const b = Math.round((color.b ?? 0) * 255);
  const a = Math.round((color.a ?? 1) * 255);
  return `Color(0x${a.toString(16).padStart(2, "0").toUpperCase()}${r.toString(16).padStart(2, "0").toUpperCase()}${g.toString(16).padStart(2, "0").toUpperCase()}${b.toString(16).padStart(2, "0").toUpperCase()})`;
}

interface CodeCtx {
  node: any;
  fill: any;
  stroke: any;
  shadows: any[];
  blur: number;
  blendMode: string;
  layout: any;
  bitmapFilter: any;
}

// ─── CSS Code Gen ─────────────────────────────────────

function generateCSS(ctx: CodeCtx): string {
  const { node, fill, stroke, shadows, blur, blendMode, layout, bitmapFilter } = ctx;
  const lines: string[] = [];
  const kind = node.kind;

  lines.push(`width: ${Math.round(node.width)}px;`);
  lines.push(`height: ${Math.round(node.height)}px;`);
  if (node.min_width != null) lines.push(`min-width: ${Math.round(node.min_width)}px;`);
  if (node.max_width != null) lines.push(`max-width: ${Math.round(node.max_width)}px;`);
  if (node.min_height != null) lines.push(`min-height: ${Math.round(node.min_height)}px;`);
  if (node.max_height != null) lines.push(`max-height: ${Math.round(node.max_height)}px;`);

  lines.push(`position: absolute;`);
  lines.push(`left: ${Math.round(node.x)}px;`);
  lines.push(`top: ${Math.round(node.y)}px;`);

  if (node.corner_radius && node.corner_radius > 0) {
    lines.push(`border-radius: ${node.corner_radius}px;`);
  }
  if (typeof kind === "string" && kind === "Ellipse") {
    const brIdx = lines.findIndex(l => l.startsWith("border-radius"));
    if (brIdx >= 0) lines[brIdx] = "border-radius: 50%;";
    else lines.push("border-radius: 50%;");
  }

  if (node.perspective) {
    const p = node.perspective;
    const parts: string[] = [];
    if (p.perspective > 0) parts.push(`perspective(${p.perspective}px)`);
    if (Math.abs(p.rotate_x) > 0.01) parts.push(`rotateX(${p.rotate_x.toFixed(1)}deg)`);
    if (Math.abs(p.rotate_y) > 0.01) parts.push(`rotateY(${p.rotate_y.toFixed(1)}deg)`);
    if (Math.abs(p.rotate_z) > 0.01) parts.push(`rotateZ(${p.rotate_z.toFixed(1)}deg)`);
    if (node.rotation && node.rotation !== 0) parts.push(`rotate(${node.rotation.toFixed(1)}deg)`);
    if (parts.length > 0) {
      lines.push(`transform: ${parts.join(" ")};`);
      lines.push(`transform-origin: ${(p.origin_x * 100).toFixed(0)}% ${(p.origin_y * 100).toFixed(0)}%;`);
    }
  } else if (node.rotation && node.rotation !== 0) {
    lines.push(`transform: rotate(${node.rotation.toFixed(1)}deg);`);
  }
  if (node.opacity !== undefined && node.opacity < 1) {
    lines.push(`opacity: ${node.opacity.toFixed(2)};`);
  }

  // Fill
  if (fill) {
    if (fill.type === "Pattern" && fill.src) {
      lines.push(`background-image: url("${fill.src.substring(0, 60)}…");`);
      lines.push(`background-size: ${fill.tile_width || "auto"}px ${fill.tile_height || "auto"}px;`);
      lines.push(`background-repeat: repeat;`);
      if (fill.rotation) lines.push(`/* pattern rotation: ${fill.rotation}deg */`);
    } else if (fill.type === "Solid" || fill.color) {
      if (fill.css_modern && fill.color_space && fill.color_space !== "sRGB") {
        lines.push(`background-color: ${fill.css_modern};`);
        lines.push(`/* sRGB fallback: ${fill.css_fallback || rgbaToCSS(fill.color || fill)} */`);
      } else {
        lines.push(`background-color: ${rgbaToCSS(fill.color || fill)};`);
      }
    } else if (fill.type === "LinearGradient" && fill.stops) {
      const stops = fill.stops.map((s: any) => `${rgbaToCSS(s.color)} ${(s.offset * 100).toFixed(0)}%`).join(", ");
      lines.push(`background: linear-gradient(${stops});`);
    } else if (fill.type === "RadialGradient" && fill.stops) {
      const stops = fill.stops.map((s: any) => `${rgbaToCSS(s.color)} ${(s.offset * 100).toFixed(0)}%`).join(", ");
      lines.push(`background: radial-gradient(${stops});`);
    } else if (fill.type === "ConicGradient" && fill.stops) {
      const stops = fill.stops.map((s: any) => `${rgbaToCSS(s.color)} ${(s.offset * 100).toFixed(0)}%`).join(", ");
      const angle = fill.angle || 0;
      const cx = ((fill.center_x ?? 0.5) * 100).toFixed(0);
      const cy = ((fill.center_y ?? 0.5) * 100).toFixed(0);
      lines.push(`background: conic-gradient(from ${angle}deg at ${cx}% ${cy}%, ${stops});`);
    }
  }

  // Stroke
  if (stroke && stroke.color && stroke.width) {
    lines.push(`border: ${stroke.width}px solid ${rgbaToCSS(stroke.color)};`);
    if (stroke.align === "Inside") lines.push(`box-sizing: border-box; /* stroke inside */`);
    else if (stroke.align === "Outside") lines.push(`outline: ${stroke.width}px solid ${rgbaToCSS(stroke.color)}; /* stroke outside */`);
  }

  // Shadows
  if (shadows?.length > 0) {
    const vis = shadows.filter((s: any) => s.visible !== false);
    if (vis.length > 0) {
      const str = vis.map((s: any) =>
        `${s.inset ? "inset " : ""}${s.offset_x ?? 0}px ${s.offset_y ?? 0}px ${s.blur ?? 0}px ${s.spread ?? 0}px ${rgbaToCSS(s.color)}`
      ).join(",\n    ");
      lines.push(`box-shadow: ${str};`);
    }
  }

  // Filter (blur + bitmap)
  {
    const parts: string[] = [];
    if (blur && blur > 0) parts.push(`blur(${blur}px)`);
    if (bitmapFilter && bitmapFilter.enabled !== false) {
      const bf = bitmapFilter;
      if (Math.abs(bf.brightness - 1) >= 0.001) parts.push(`brightness(${bf.brightness})`);
      if (Math.abs(bf.contrast - 1) >= 0.001) parts.push(`contrast(${bf.contrast})`);
      if (Math.abs(bf.saturation - 1) >= 0.001) parts.push(`saturate(${bf.saturation})`);
      if (Math.abs(bf.hue_rotate) >= 0.001) parts.push(`hue-rotate(${bf.hue_rotate}deg)`);
      if (Math.abs(bf.invert) >= 0.001) parts.push(`invert(${bf.invert})`);
      if (Math.abs(bf.grayscale) >= 0.001) parts.push(`grayscale(${bf.grayscale})`);
      if (Math.abs(bf.sepia) >= 0.001) parts.push(`sepia(${bf.sepia})`);
    }
    if (parts.length > 0) lines.push(`filter: ${parts.join(" ")};`);
  }

  // Blend
  if (blendMode && blendMode !== "Normal" && blendMode !== "normal") {
    const cssBlend = blendMode.replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^-/, "");
    lines.push(`mix-blend-mode: ${cssBlend};`);
  }

  // Text
  if (kind && (kind.Text !== undefined || (typeof kind === "string" && kind === "Text"))) {
    if (node.font_family) lines.push(`font-family: '${node.font_family}';`);
    if (node.font_size) lines.push(`font-size: ${node.font_size}px;`);
    if (node.font_weight && node.font_weight !== 400) lines.push(`font-weight: ${node.font_weight};`);
    if (node.font_style && node.font_style !== "normal") lines.push(`font-style: ${node.font_style};`);
    if (node.font_variation_settings && typeof node.font_variation_settings === 'object' && Object.keys(node.font_variation_settings).length > 0) {
      const fvs = Object.entries(node.font_variation_settings).map(([t, v]) => `"${t}" ${v}`).join(', ');
      lines.push(`font-variation-settings: ${fvs};`);
    }
    // OpenType feature settings
    if (node.opentype_features) {
      const ot = node.opentype_features;
      const parts: string[] = [];
      if (ot.ligatures === false) parts.push('"liga" 0');
      if (ot.old_style_numerals) parts.push('"onum" 1');
      if (ot.small_caps) parts.push('"smcp" 1');
      if (ot.tabular_numerals) parts.push('"tnum" 1');
      if (parts.length > 0) {
        lines.push(`font-feature-settings: ${parts.join(', ')};`);
      }
      if (ot.small_caps) {
        lines.push(`font-variant-caps: small-caps;`);
      }
    }
    if (node.line_height && node.line_height !== 1.2) lines.push(`line-height: ${node.line_height};`);
    if (node.text_align && node.text_align !== "left") lines.push(`text-align: ${node.text_align};`);
    const deco = node.text_decoration;
    if (deco && deco !== "None") {
      const cssVal = deco === "Underline" ? "underline" : deco === "Strikethrough" ? "line-through" : "underline line-through";
      lines.push(`text-decoration: ${cssVal};`);
    }
    if (node.letter_spacing && node.letter_spacing !== 0) lines.push(`letter-spacing: ${node.letter_spacing}px;`);
    if (node.fills?.[0]) lines.push(`color: ${rgbaToCSS(node.fills[0])};`);
  }

  // Overflow / Clip content
  if (node.clip_content) {
    lines.push(`overflow: hidden;`);
  } else if (node.overflow && node.overflow !== "Visible") {
    lines.push(`overflow: ${node.overflow === "Scroll" || node.overflow === "ScrollHorizontal" || node.overflow === "ScrollVertical" ? "auto" : "hidden"};`);
    if (node.overflow === "ScrollHorizontal") lines.push(`overflow-x: auto; overflow-y: hidden;`);
    if (node.overflow === "ScrollVertical") lines.push(`overflow-x: hidden; overflow-y: auto;`);
  }
  // Scroll snap type (container)
  if (node.scroll_snap_type && node.scroll_snap_type !== "None") {
    const snapMap: Record<string, string> = {
      MandatoryX: "x mandatory",
      MandatoryY: "y mandatory",
      MandatoryBoth: "both mandatory",
      ProximityX: "x proximity",
      ProximityY: "y proximity",
      ProximityBoth: "both proximity",
    };
    const cssSnap = snapMap[node.scroll_snap_type];
    if (cssSnap) lines.push(`scroll-snap-type: ${cssSnap};`);
  }
  // Scroll snap align (child)
  if (node.scroll_snap_align && node.scroll_snap_align !== "None") {
    lines.push(`scroll-snap-align: ${node.scroll_snap_align.toLowerCase()};`);
  }

  // Layout
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

  return lines.join("\n");
}

// ─── SwiftUI Code Gen ─────────────────────────────────

function generateSwiftUI(ctx: CodeCtx): string {
  const { node, fill, stroke, shadows, blur, blendMode, layout } = ctx;
  const kind = node.kind;
  const lines: string[] = [];
  const isText = kind && (kind.Text !== undefined || (typeof kind === "string" && kind === "Text"));
  const isEllipse = typeof kind === "string" && kind === "Ellipse";
  const isImage = kind && kind.Image !== undefined;

  // View body
  if (isText) {
    const text = typeof kind === "object" ? kind.Text : "";
    lines.push(`Text("${(text || "").replace(/"/g, '\\"')}")`);
    if (node.font_family) lines.push(`    .font(.custom("${node.font_family}", size: ${node.font_size || 16}))`);
    else if (node.font_size) lines.push(`    .font(.system(size: ${node.font_size}))`);
    if (node.font_weight && node.font_weight !== 400) {
      const w = swiftFontWeight(node.font_weight);
      lines.push(`    .fontWeight(.${w})`);
    }
    if (node.font_style === "italic") lines.push(`    .italic()`);
    if (node.text_align && node.text_align !== "left") {
      const align = node.text_align === "center" ? "center" : node.text_align === "right" ? "trailing" : "leading";
      lines.push(`    .multilineTextAlignment(.${align})`);
    }
    if (node.line_height && node.line_height !== 1.2) {
      lines.push(`    .lineSpacing(${((node.line_height - 1) * (node.font_size || 16)).toFixed(1)})`);
    }
    if (node.letter_spacing) lines.push(`    .kerning(${node.letter_spacing})`);
    const textDeco = node.text_decoration;
    if (textDeco === "Underline") lines.push(`    .underline()`);
    else if (textDeco === "Strikethrough") lines.push(`    .strikethrough()`);
    // Text color from fills
    if (node.fills?.[0]) lines.push(`    .foregroundColor(${swiftColor(node.fills[0])})`);
  } else if (isImage) {
    lines.push(`AsyncImage(url: URL(string: "${kind.Image?.src || ""}")) { image in`);
    lines.push(`    image.resizable()`);
    const fit = kind.Image?.fit || "Cover";
    lines.push(`    ${fit === "Contain" ? ".aspectRatio(contentMode: .fit)" : ".aspectRatio(contentMode: .fill)"}`);
    lines.push(`} placeholder: {`);
    lines.push(`    ProgressView()`);
    lines.push(`}`);
  } else if (isEllipse) {
    lines.push(`Ellipse()`);
  } else {
    // Rectangle-ish (Rect, Frame, Star, Polygon, Path)
    if (node.corner_radius && node.corner_radius > 0) {
      lines.push(`RoundedRectangle(cornerRadius: ${node.corner_radius})`);
    } else {
      lines.push(`Rectangle()`);
    }
  }

  // Fill
  if (fill) {
    if (fill.type === "Solid" || fill.color) {
      lines.push(`    .fill(${swiftColor(fill.color || fill)})`);
    } else if (fill.type === "LinearGradient" && fill.stops) {
      const stops = fill.stops.map((s: any) =>
        `.init(color: ${swiftColor(s.color)}, location: ${s.offset.toFixed(2)})`
      ).join(", ");
      lines.push(`    .fill(LinearGradient(stops: [${stops}], startPoint: .leading, endPoint: .trailing))`);
    } else if (fill.type === "RadialGradient" && fill.stops) {
      const stops = fill.stops.map((s: any) =>
        `.init(color: ${swiftColor(s.color)}, location: ${s.offset.toFixed(2)})`
      ).join(", ");
      lines.push(`    .fill(RadialGradient(stops: [${stops}], center: .center, startRadius: 0, endRadius: ${Math.max(node.width, node.height) / 2}))`);
    } else if (fill.type === "ConicGradient" && fill.stops) {
      const stops = fill.stops.map((s: any) =>
        `.init(color: ${swiftColor(s.color)}, location: ${s.offset.toFixed(2)})`
      ).join(", ");
      lines.push(`    .fill(AngularGradient(stops: [${stops}], center: .center, startAngle: .degrees(${fill.angle || 0}), endAngle: .degrees(${(fill.angle || 0) + 360})))`);
    }
  }

  // Stroke
  if (stroke && stroke.color && stroke.width) {
    lines.push(`    .overlay(`);
    const shape = isEllipse ? "Ellipse()" : (node.corner_radius > 0 ? `RoundedRectangle(cornerRadius: ${node.corner_radius})` : "Rectangle()");
    lines.push(`        ${shape}.stroke(${swiftColor(stroke.color)}, lineWidth: ${stroke.width})`);
    lines.push(`    )`);
  }

  // Frame
  lines.push(`    .frame(width: ${Math.round(node.width)}, height: ${Math.round(node.height)})`);

  // Position
  lines.push(`    .position(x: ${Math.round(node.x + node.width / 2)}, y: ${Math.round(node.y + node.height / 2)})`);

  // Rotation
  if (node.rotation && node.rotation !== 0) {
    lines.push(`    .rotationEffect(.degrees(${node.rotation.toFixed(1)}))`);
  }

  // Opacity
  if (node.opacity !== undefined && node.opacity < 1) {
    lines.push(`    .opacity(${node.opacity.toFixed(2)})`);
  }

  // Shadow
  if (shadows?.length > 0) {
    const s = shadows.find((s: any) => s.visible !== false);
    if (s) {
      lines.push(`    .shadow(color: ${swiftColor(s.color)}, radius: ${s.blur ?? 0}, x: ${s.offset_x ?? 0}, y: ${s.offset_y ?? 0})`);
    }
  }

  // Blur
  if (blur && blur > 0) {
    lines.push(`    .blur(radius: ${blur})`);
  }

  // Blend mode
  if (blendMode && blendMode !== "Normal") {
    const bm = swiftBlendMode(blendMode);
    if (bm) lines.push(`    .blendMode(.${bm})`);
  }

  // Clipping
  if (node.overflow === "Hidden") {
    lines.push(`    .clipped()`);
  }

  return lines.join("\n");
}

// ─── Kotlin Compose Code Gen ──────────────────────────

function generateKotlin(ctx: CodeCtx): string {
  const { node, fill, stroke, shadows, blur, blendMode, layout } = ctx;
  const kind = node.kind;
  const isText = kind && (kind.Text !== undefined || (typeof kind === "string" && kind === "Text"));
  const isEllipse = typeof kind === "string" && kind === "Ellipse";
  const isImage = kind && kind.Image !== undefined;

  const lines: string[] = [];

  // Modifier chain
  const mods: string[] = [];
  mods.push(`.size(${Math.round(node.width)}.dp, ${Math.round(node.height)}.dp)`);
  mods.push(`.offset(x = ${Math.round(node.x)}.dp, y = ${Math.round(node.y)}.dp)`);

  if (node.corner_radius && node.corner_radius > 0 && !isEllipse) {
    mods.push(`.clip(RoundedCornerShape(${node.corner_radius}.dp))`);
  }
  if (isEllipse) {
    mods.push(`.clip(CircleShape)`);
  }

  // Fill → background
  if (fill) {
    if (fill.type === "Solid" || fill.color) {
      mods.push(`.background(${kotlinColor(fill.color || fill)})`);
    } else if (fill.type === "LinearGradient" && fill.stops) {
      const stops = fill.stops.map((s: any) => `${kotlinColor(s.color)}`).join(", ");
      mods.push(`.background(Brush.linearGradient(listOf(${stops})))`);
    } else if (fill.type === "ConicGradient" && fill.stops) {
      const stops = fill.stops.map((s: any) => `${kotlinColor(s.color)}`).join(", ");
      mods.push(`.background(Brush.sweepGradient(listOf(${stops})))`);
    }
  }

  // Stroke → border
  if (stroke && stroke.color && stroke.width) {
    const shape = isEllipse ? "CircleShape" : (node.corner_radius > 0 ? `RoundedCornerShape(${node.corner_radius}.dp)` : "RectangleShape");
    mods.push(`.border(${stroke.width}.dp, ${kotlinColor(stroke.color)}, ${shape})`);
  }

  // Rotation
  if (node.rotation && node.rotation !== 0) {
    mods.push(`.rotate(${node.rotation.toFixed(1)}f)`);
  }

  // Opacity
  if (node.opacity !== undefined && node.opacity < 1) {
    mods.push(`.alpha(${node.opacity.toFixed(2)}f)`);
  }

  // Shadow
  if (shadows?.length > 0) {
    const s = shadows.find((s: any) => s.visible !== false);
    if (s) {
      mods.push(`.shadow(elevation = ${s.blur ?? 4}.dp)`);
    }
  }

  // Blur
  if (blur && blur > 0) {
    mods.push(`.blur(${blur}.dp)`);
  }

  if (isText) {
    const text = typeof kind === "object" ? kind.Text : "";
    lines.push(`Text(`);
    lines.push(`    text = "${(text || "").replace(/"/g, '\\"')}",`);
    if (node.font_size) lines.push(`    fontSize = ${node.font_size}.sp,`);
    if (node.font_weight && node.font_weight !== 400) {
      lines.push(`    fontWeight = FontWeight(${node.font_weight}),`);
    }
    if (node.font_style === "italic") lines.push(`    fontStyle = FontStyle.Italic,`);
    if (node.font_family) lines.push(`    fontFamily = FontFamily(Font(R.font.${node.font_family.toLowerCase().replace(/\s+/g, "_")})),`);
    if (node.text_align) {
      const align = node.text_align === "center" ? "Center" : node.text_align === "right" ? "End" : "Start";
      lines.push(`    textAlign = TextAlign.${align},`);
    }
    if (node.line_height && node.line_height !== 1.2) {
      lines.push(`    lineHeight = ${(node.line_height * (node.font_size || 16)).toFixed(0)}.sp,`);
    }
    if (node.letter_spacing) lines.push(`    letterSpacing = ${node.letter_spacing}.sp,`);
    const textDeco = node.text_decoration;
    if (textDeco === "Underline") lines.push(`    textDecoration = TextDecoration.Underline,`);
    else if (textDeco === "Strikethrough") lines.push(`    textDecoration = TextDecoration.LineThrough,`);
    if (node.fills?.[0]) lines.push(`    color = ${kotlinColor(node.fills[0])},`);
    lines.push(`    modifier = Modifier`);
    lines.push(`        ${mods.join("\n        ")}`);
    lines.push(`)`);
  } else if (isImage) {
    lines.push(`AsyncImage(`);
    lines.push(`    model = "${kind.Image?.src || ""}",`);
    lines.push(`    contentDescription = null,`);
    const fit = kind.Image?.fit || "Cover";
    lines.push(`    contentScale = ContentScale.${fit === "Contain" ? "Fit" : fit === "Fill" ? "FillBounds" : "Crop"},`);
    lines.push(`    modifier = Modifier`);
    lines.push(`        ${mods.join("\n        ")}`);
    lines.push(`)`);
  } else {
    // Box
    lines.push(`Box(`);
    lines.push(`    modifier = Modifier`);
    lines.push(`        ${mods.join("\n        ")}`);
    lines.push(`) {`);
    if (layout && layout.mode === "Flex") {
      const isCol = layout.direction === "Column";
      lines.push(`    ${isCol ? "Column" : "Row"}(`);
      if (layout.gap) lines.push(`        ${isCol ? "verticalArrangement" : "horizontalArrangement"} = Arrangement.spacedBy(${layout.gap}.dp),`);
      if (layout.align_items) {
        const align = layout.align_items === "Center" ? "CenterHorizontally" : layout.align_items === "End" ? "End" : "Start";
        lines.push(`        ${isCol ? "horizontalAlignment" : "verticalAlignment"} = Alignment.${align},`);
      }
      if (layout.padding) {
        const p = layout.padding;
        lines.push(`        modifier = Modifier.padding(start = ${p.left ?? 0}.dp, top = ${p.top ?? 0}.dp, end = ${p.right ?? 0}.dp, bottom = ${p.bottom ?? 0}.dp)`);
      }
      lines.push(`    ) { /* children */ }`);
    }
    lines.push(`}`);
  }

  return lines.join("\n");
}

// ─── SVG Props Gen ────────────────────────────────────

function generateSVGProps(ctx: CodeCtx): string | null {
  const { node, fill, stroke, shadows, blur } = ctx;
  const lines: string[] = [];

  if (fill) {
    if (fill.type === "Solid" || fill.color) {
      lines.push(`fill="${colorToHex(fill.color || fill)}"`);
    }
  }

  if (stroke && stroke.color && stroke.width) {
    lines.push(`stroke="${colorToHex(stroke.color)}"`);
    lines.push(`stroke-width="${stroke.width}"`);
    if (stroke.dash_array?.length > 0) {
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

// ─── Asset Download ───────────────────────────────────

function downloadAsset(editor: Editor, nodeId: number, format: "png" | "svg") {
  try {
    if (format === "svg") {
      const svg = editor.engine.export_node_svg(BigInt(nodeId));
      if (svg) {
        const blob = new Blob([svg], { type: "image/svg+xml" });
        downloadBlob(blob, `node-${nodeId}.svg`);
      }
    } else {
      // PNG: render node to offscreen canvas
      const json = editor.engine.get_node_json(BigInt(nodeId));
      if (!json) return;
      const node = JSON.parse(json);
      const scale = 2;
      const w = Math.ceil(node.width * scale);
      const h = Math.ceil(node.height * scale);
      const offscreen = document.createElement("canvas");
      offscreen.width = w;
      offscreen.height = h;
      const octx = offscreen.getContext("2d")!;
      octx.scale(scale, scale);
      octx.translate(-node.x, -node.y);
      // Use engine's export
      try {
        const png = (editor as any).exportNodePNG?.(nodeId, scale);
        if (png) { downloadBlob(png, `node-${nodeId}.png`); return; }
      } catch {}
      // Fallback: capture from main canvas via engine export
      const dataUrl = editor.engine.export_png(BigInt(nodeId), scale);
      if (dataUrl) {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `node-${nodeId}.png`;
        a.click();
      }
    }
  } catch (e) {
    console.warn("Asset download failed:", e);
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Utility ──────────────────────────────────────────

function cssAlignValue(v: string): string {
  const map: Record<string, string> = { Start: "flex-start", Center: "center", End: "flex-end", Stretch: "stretch" };
  return map[v] || v.toLowerCase();
}

function cssJustifyValue(v: string): string {
  const map: Record<string, string> = { Start: "flex-start", Center: "center", End: "flex-end", SpaceBetween: "space-between", SpaceAround: "space-around" };
  return map[v] || v.toLowerCase();
}

function swiftFontWeight(w: number): string {
  if (w <= 100) return "ultraLight";
  if (w <= 200) return "thin";
  if (w <= 300) return "light";
  if (w <= 400) return "regular";
  if (w <= 500) return "medium";
  if (w <= 600) return "semibold";
  if (w <= 700) return "bold";
  if (w <= 800) return "heavy";
  return "black";
}

function swiftBlendMode(mode: string): string | null {
  const map: Record<string, string> = {
    Multiply: "multiply", Screen: "screen", Overlay: "overlay",
    Darken: "darken", Lighten: "lighten", ColorDodge: "colorDodge",
    ColorBurn: "colorBurn", SoftLight: "softLight", HardLight: "hardLight",
    Difference: "difference", Exclusion: "exclusion",
    Hue: "hue", Saturation: "saturation", Color: "color", Luminosity: "luminosity",
  };
  return map[mode] || null;
}

function highlightCode(code: string, lang: CodeLang): string {
  if (lang === "css" || lang === "svg") return highlightCSS(code);
  if (lang === "swiftui") return highlightSwift(code);
  if (lang === "kotlin") return highlightKotlin(code);
  return escapeHtml(code);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightCSS(code: string): string {
  return code
    .replace(/^([\w-]+)(?=:)/gm, '<span style="color:#9cdcfe;">$1</span>')
    .replace(/:\s*(.+);/g, (_m, val) => {
      const highlighted = (val as string)
        .replace(/(\d+\.?\d*)(px|deg|%)?/g, '<span style="color:#b5cea8;">$1$2</span>')
        .replace(/(rgba?\([^)]+\))/g, '<span style="color:#ce9178;">$1</span>')
        .replace(/(#[0-9a-fA-F]{3,8})/g, '<span style="color:#ce9178;">$1</span>')
        .replace(/\b(solid|absolute|flex|grid|column|wrap|center|none|inherit|italic)\b/g, '<span style="color:#c586c0;">$1</span>')
        .replace(/('[^']+')/g, '<span style="color:#ce9178;">$1</span>');
      return `: ${highlighted};`;
    })
    .replace(/^([\w-]+)(?==)/gm, '<span style="color:#9cdcfe;">$1</span>')
    .replace(/"([^"]+)"/g, '"<span style="color:#ce9178;">$1</span>"');
}

function highlightSwift(code: string): string {
  let out = escapeHtml(code);
  // Keywords
  out = out.replace(/\b(struct|var|let|func|import|return|if|else|true|false|nil|some|self)\b/g,
    '<span style="color:#c586c0;">$1</span>');
  // Types
  out = out.replace(/\b(Text|Image|Color|Font|Rectangle|Ellipse|RoundedRectangle|LinearGradient|RadialGradient|AngularGradient|AsyncImage|ProgressView|View|VStack|HStack|ZStack|Spacer|Modifier|Path|Circle|Shape)\b/g,
    '<span style="color:#4ec9b0;">$1</span>');
  // Dot members
  out = out.replace(/\.(\w+)/g, '.<span style="color:#9cdcfe;">$1</span>');
  // Numbers
  out = out.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#b5cea8;">$1</span>');
  // Strings
  out = out.replace(/"([^"]+)"/g, '"<span style="color:#ce9178;">$1</span>"');
  return out;
}

function highlightKotlin(code: string): string {
  let out = escapeHtml(code);
  // Keywords
  out = out.replace(/\b(fun|val|var|class|object|import|return|if|else|true|false|null|when|is|in)\b/g,
    '<span style="color:#c586c0;">$1</span>');
  // Types / composables
  out = out.replace(/\b(Text|Box|Column|Row|Image|Modifier|Color|FontWeight|FontStyle|FontFamily|Font|TextAlign|TextDecoration|Brush|RoundedCornerShape|CircleShape|RectangleShape|ContentScale|Arrangement|Alignment|AsyncImage|Dp|Sp)\b/g,
    '<span style="color:#4ec9b0;">$1</span>');
  // Dot chains
  out = out.replace(/\.(\w+)/g, '.<span style="color:#9cdcfe;">$1</span>');
  // Numbers
  out = out.replace(/\b(\d+\.?\d*)(\.dp|\.sp|f)?\b/g, '<span style="color:#b5cea8;">$1$2</span>');
  // Strings
  out = out.replace(/"([^"]+)"/g, '"<span style="color:#ce9178;">$1</span>"');
  return out;
}
