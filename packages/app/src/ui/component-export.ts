/**
 * Component Export Panel
 * Converts selected node tree to React JSX, Vue SFC, or HTML components.
 * Supports inline styles, styled-components, and CSS modules output.
 */

import type { Editor } from "../editor";

type Framework = "react" | "vue" | "html";
type CSSMode = "inline" | "styled" | "modules";

// ── Helpers ──

function rgbaCSS(c: any): string {
  if (!c) return "transparent";
  if (typeof c === "string") return c;
  const r = Math.round((c.r ?? 0) * 255);
  const g = Math.round((c.g ?? 0) * 255);
  const b = Math.round((c.b ?? 0) * 255);
  const a = c.a ?? 1;
  return a === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a.toFixed(2)})`;
}

function toPascalCase(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("") || "Component";
}

function toCamelCase(s: string): string {
  const pc = toPascalCase(s);
  return pc.charAt(0).toLowerCase() + pc.slice(1);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// CSS property name → camelCase for React inline styles
function cssPropToCamel(prop: string): string {
  return prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

interface StyleMap {
  [key: string]: string;
}

function getNodeStyles(editor: Editor, nodeId: number, depth: number): StyleMap {
  const bid = BigInt(nodeId);
  const json = editor.engine.get_node_json(bid);
  if (!json) return {};
  const node = JSON.parse(json);
  const s: StyleMap = {};

  // Position
  if (depth === 0) {
    s["position"] = "relative";
  } else {
    s["position"] = "absolute";
    s["left"] = `${Math.round(node.x)}px`;
    s["top"] = `${Math.round(node.y)}px`;
  }
  s["width"] = `${Math.round(node.width)}px`;
  s["height"] = `${Math.round(node.height)}px`;

  const kind = node.kind;
  const isEllipse = kind === "Ellipse";

  if (isEllipse) s["border-radius"] = "50%";
  else if (node.corner_radius > 0) s["border-radius"] = `${node.corner_radius}px`;

  if (node.rotation && node.rotation !== 0) s["transform"] = `rotate(${node.rotation.toFixed(1)}deg)`;
  if (node.opacity !== undefined && node.opacity < 1) s["opacity"] = node.opacity.toFixed(2);

  // Fill
  try {
    const fillInfo = JSON.parse(editor.engine.get_fill_info(bid));
    if (fillInfo) {
      if (fillInfo.type === "Solid" || fillInfo.color) {
        s["background-color"] = rgbaCSS(fillInfo.color || fillInfo);
      } else if (fillInfo.type === "LinearGradient" && fillInfo.stops) {
        const stops = fillInfo.stops.map((st: any) => `${rgbaCSS(st.color)} ${(st.offset * 100).toFixed(0)}%`).join(", ");
        s["background"] = `linear-gradient(${stops})`;
      } else if (fillInfo.type === "RadialGradient" && fillInfo.stops) {
        const stops = fillInfo.stops.map((st: any) => `${rgbaCSS(st.color)} ${(st.offset * 100).toFixed(0)}%`).join(", ");
        s["background"] = `radial-gradient(${stops})`;
      }
    }
  } catch {}

  // Stroke
  try {
    const strokeInfo = JSON.parse(editor.engine.get_stroke_info(bid));
    if (strokeInfo?.color && strokeInfo.width) {
      s["border"] = `${strokeInfo.width}px solid ${rgbaCSS(strokeInfo.color)}`;
    }
  } catch {}

  // Shadows
  try {
    const shadowsJson = editor.engine.get_shadows(bid);
    if (shadowsJson) {
      const shadows = JSON.parse(shadowsJson).filter((sh: any) => sh.visible !== false);
      if (shadows.length) {
        s["box-shadow"] = shadows.map((sh: any) =>
          `${sh.inset ? "inset " : ""}${sh.offset_x ?? 0}px ${sh.offset_y ?? 0}px ${sh.blur ?? 0}px ${sh.spread ?? 0}px ${rgbaCSS(sh.color)}`
        ).join(", ");
      }
    }
  } catch {}

  // Blur
  try {
    const blur = editor.engine.get_blur(bid);
    if (blur > 0) s["filter"] = `blur(${blur}px)`;
  } catch {}

  // Blend mode
  try {
    const bm = editor.engine.get_blend_mode(bid);
    if (bm && bm !== "Normal") {
      s["mix-blend-mode"] = bm.replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^-/, "");
    }
  } catch {}

  if (node.clip_content) s["overflow"] = "hidden";

  // Layout
  try {
    const layoutJson = editor.engine.get_layout(bid);
    if (layoutJson) {
      const layout = JSON.parse(layoutJson);
      if (layout.mode === "Flex") {
        s["display"] = "flex";
        if (layout.direction === "Column") s["flex-direction"] = "column";
        const aiMap: Record<string, string> = { Start: "flex-start", Center: "center", End: "flex-end", Stretch: "stretch", Baseline: "baseline", FirstBaseline: "first baseline", LastBaseline: "last baseline" };
        if (layout.align_items && aiMap[layout.align_items]) s["align-items"] = aiMap[layout.align_items]!;
        const jcMap: Record<string, string> = { Start: "flex-start", Center: "center", End: "flex-end", SpaceBetween: "space-between", SpaceAround: "space-around", SpaceEvenly: "space-evenly" };
        if (layout.justify_content && jcMap[layout.justify_content]) s["justify-content"] = jcMap[layout.justify_content]!;
        if (layout.gap > 0) s["gap"] = `${layout.gap}px`;
        if (layout.padding) {
          const p = layout.padding;
          s["padding"] = `${p.top ?? 0}px ${p.right ?? 0}px ${p.bottom ?? 0}px ${p.left ?? 0}px`;
        }
        if (layout.wrap) s["flex-wrap"] = "wrap";
      }
    }
  } catch {}

  // Text
  const isText = kind === "Text" || (typeof kind === "object" && kind.Text !== undefined);
  if (isText) {
    if (node.font_family) s["font-family"] = `'${node.font_family}', sans-serif`;
    if (node.font_size) s["font-size"] = `${node.font_size}px`;
    if (node.font_weight && node.font_weight !== 400) s["font-weight"] = String(node.font_weight);
    if (node.font_style && node.font_style !== "normal") s["font-style"] = node.font_style;
    if (node.line_height && node.line_height !== 1.2) s["line-height"] = String(node.line_height);
    if (node.text_align && node.text_align !== "left") s["text-align"] = node.text_align;
    if (node.letter_spacing) s["letter-spacing"] = `${node.letter_spacing}px`;
    if (node.fills?.[0]?.color) s["color"] = rgbaCSS(node.fills[0].color);
    else if (node.fills?.[0]) s["color"] = rgbaCSS(node.fills[0]);
  }

  // Image
  const isImage = typeof kind === "object" && kind.Image !== undefined;
  if (isImage) {
    const src = kind.Image?.src || "";
    const fit = kind.Image?.fit || "cover";
    s["background-image"] = `url('${src}')`;
    s["background-size"] = fit === "fill" ? "100% 100%" : fit;
    s["background-position"] = "center";
    s["background-repeat"] = "no-repeat";
  }

  return s;
}

interface NodeInfo {
  id: number;
  name: string;
  kind: any;
  text?: string;
  imageSrc?: string;
  children: number[];
  visible: boolean;
}

function getNodeInfo(editor: Editor, nodeId: number): NodeInfo | null {
  const bid = BigInt(nodeId);
  const json = editor.engine.get_node_json(bid);
  if (!json) return null;
  const node = JSON.parse(json);
  const kind = node.kind;
  const isText = kind === "Text" || (typeof kind === "object" && kind.Text !== undefined);
  const isImage = typeof kind === "object" && kind.Image !== undefined;
  return {
    id: nodeId,
    name: node.name || `Node${nodeId}`,
    kind,
    text: isText ? (typeof kind === "object" ? kind.Text : node.text || "") : undefined,
    imageSrc: isImage ? kind.Image?.src : undefined,
    children: node.children || [],
    visible: node.visible !== false,
  };
}

// ── Inline style object for React ──
function styleMapToReactInline(styles: StyleMap): string {
  const entries = Object.entries(styles).map(([k, v]) => {
    const camel = cssPropToCamel(k);
    // numeric-ish values stay as strings for simplicity
    return `${camel}: '${v}'`;
  });
  return `{ ${entries.join(", ")} }`;
}

// ── CSS class string from StyleMap ──
function styleMapToCSS(className: string, styles: StyleMap): string {
  const lines = Object.entries(styles).map(([k, v]) => `  ${k}: ${v};`);
  return `.${className} {\n${lines.join("\n")}\n}`;
}

// ── Generators ──

interface GenContext {
  editor: Editor;
  framework: Framework;
  cssMode: CSSMode;
  classes: Map<string, StyleMap>; // className → styles (for styled/modules)
  styledComponents: string[];
  indent: number;
}

function pad(ctx: GenContext): string {
  return "  ".repeat(ctx.indent);
}

function genNode(ctx: GenContext, nodeId: number, depth: number): string {
  const info = getNodeInfo(ctx.editor, nodeId);
  if (!info || !info.visible) return "";
  const styles = getNodeStyles(ctx.editor, nodeId, depth);
  const compName = toPascalCase(info.name);
  const className = toCamelCase(info.name);

  const isText = info.text !== undefined;
  const isImage = info.imageSrc !== undefined;

  // Generate children
  const childLines: string[] = [];
  for (const cid of info.children) {
    const line = genNode(ctx, cid, depth + 1);
    if (line) childLines.push(line);
  }

  const p = pad(ctx);

  if (ctx.framework === "react") {
    if (ctx.cssMode === "inline") {
      const styleObj = styleMapToReactInline(styles);
      if (isText) {
        const text = info.text!.includes("\n")
          ? `{\`${info.text!.replace(/`/g, "\\`")}\`}`
          : escapeJSX(info.text!);
        return `${p}<div style={${styleObj}}>${text}</div>`;
      }
      if (isImage) {
        return `${p}<img src={${JSON.stringify(info.imageSrc)}} alt="${escapeJSX(info.name)}" style={${styleObj}} />`;
      }
      if (childLines.length === 0) return `${p}<div style={${styleObj}} />`;
      ctx.indent++;
      const inner = childLines.map((c) => c).join("\n");
      ctx.indent--;
      return `${p}<div style={${styleObj}}>\n${inner}\n${p}</div>`;
    }

    if (ctx.cssMode === "styled") {
      const styledName = `Styled${compName}`;
      const cssStr = Object.entries(styles).map(([k, v]) => `  ${k}: ${v};`).join("\n");
      ctx.styledComponents.push(`const ${styledName} = styled.div\`\n${cssStr}\n\`;`);

      if (isText) {
        return `${p}<${styledName}>${escapeJSX(info.text!)}</${styledName}>`;
      }
      if (isImage) {
        return `${p}<${styledName} as="img" src={${JSON.stringify(info.imageSrc)}} alt="${escapeJSX(info.name)}" />`;
      }
      if (childLines.length === 0) return `${p}<${styledName} />`;
      ctx.indent++;
      const inner = childLines.join("\n");
      ctx.indent--;
      return `${p}<${styledName}>\n${inner}\n${p}</${styledName}>`;
    }

    // CSS modules
    ctx.classes.set(className, styles);
    if (isText) {
      return `${p}<div className={styles.${className}}>${escapeJSX(info.text!)}</div>`;
    }
    if (isImage) {
      return `${p}<img className={styles.${className}} src={${JSON.stringify(info.imageSrc)}} alt="${escapeJSX(info.name)}" />`;
    }
    if (childLines.length === 0) return `${p}<div className={styles.${className}} />`;
    ctx.indent++;
    const inner = childLines.join("\n");
    ctx.indent--;
    return `${p}<div className={styles.${className}}>\n${inner}\n${p}</div>`;
  }

  if (ctx.framework === "vue") {
    ctx.classes.set(className, styles);
    if (isText) {
      return `${p}<div class="${className}">${escapeHtml(info.text!)}</div>`;
    }
    if (isImage) {
      return `${p}<img class="${className}" :src="${info.imageSrc}" alt="${escapeHtml(info.name)}" />`;
    }
    if (childLines.length === 0) return `${p}<div class="${className}" />`;
    ctx.indent++;
    const inner = childLines.join("\n");
    ctx.indent--;
    return `${p}<div class="${className}">\n${inner}\n${p}</div>`;
  }

  // HTML
  const inlineStyle = Object.entries(styles).map(([k, v]) => `${k}:${v}`).join(";");
  if (isText) {
    const text = escapeHtml(info.text!).replace(/\n/g, "<br>");
    return `${p}<div style="${inlineStyle}">${text}</div>`;
  }
  if (isImage) {
    return `${p}<img style="${inlineStyle}" src="${escapeHtml(info.imageSrc || "")}" alt="${escapeHtml(info.name)}" />`;
  }
  if (childLines.length === 0) return `${p}<div style="${inlineStyle}"></div>`;
  ctx.indent++;
  const inner = childLines.join("\n");
  ctx.indent--;
  return `${p}<div style="${inlineStyle}">\n${inner}\n${p}</div>`;
}

function escapeJSX(s: string): string {
  return s.replace(/[{}<>&"]/g, (c) => {
    const map: Record<string, string> = { "{": "&#123;", "}": "&#125;", "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" };
    return map[c] || c;
  });
}

function generateCode(editor: Editor, ids: number[], framework: Framework, cssMode: CSSMode): { code: string; cssFile?: string } {
  if (ids.length === 0) return { code: "" };

  const rootInfo = getNodeInfo(editor, ids[0]!);
  const compName = rootInfo ? toPascalCase(rootInfo.name) : "Component";

  const ctx: GenContext = {
    editor,
    framework,
    cssMode,
    classes: new Map(),
    styledComponents: [],
    indent: 2,
  };

  const bodyParts: string[] = [];
  for (const id of ids) {
    const line = genNode(ctx, id, 0);
    if (line) bodyParts.push(line);
  }
  const body = bodyParts.join("\n");

  if (framework === "react") {
    if (cssMode === "inline") {
      return {
        code: `import React from 'react';\n\nexport const ${compName}: React.FC = () => {\n  return (\n${body}\n  );\n};\n`,
      };
    }
    if (cssMode === "styled") {
      const styledImports = ctx.styledComponents.join("\n\n");
      return {
        code: `import React from 'react';\nimport styled from 'styled-components';\n\n${styledImports}\n\nexport const ${compName}: React.FC = () => {\n  return (\n${body}\n  );\n};\n`,
      };
    }
    // modules
    let cssFile = "";
    for (const [cls, styles] of ctx.classes) {
      cssFile += styleMapToCSS(cls, styles) + "\n\n";
    }
    return {
      code: `import React from 'react';\nimport styles from './${compName}.module.css';\n\nexport const ${compName}: React.FC = () => {\n  return (\n${body}\n  );\n};\n`,
      cssFile: cssFile.trim(),
    };
  }

  if (framework === "vue") {
    let scopedCSS = "";
    for (const [cls, styles] of ctx.classes) {
      scopedCSS += styleMapToCSS(cls, styles) + "\n\n";
    }
    return {
      code: `<template>\n${body}\n</template>\n\n<script setup lang="ts">\n// Props and logic here\n</script>\n\n<style scoped>\n${scopedCSS.trim()}\n</style>\n`,
    };
  }

  // HTML
  return {
    code: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${compName}</title>\n</head>\n<body>\n${body}\n</body>\n</html>\n`,
  };
}

// ── Panel UI ──

export function setupComponentExport(container: HTMLElement, editor: Editor) {
  let currentIds: number[] = [];
  let framework: Framework = "react";
  let cssMode: CSSMode = "inline";

  function render() {
    container.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;height:100%;";

    // Toolbar
    const toolbar = document.createElement("div");
    toolbar.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;padding:8px 10px;border-bottom:1px solid #333;flex-shrink:0;";

    // Framework selector
    const fwGroup = document.createElement("div");
    fwGroup.style.cssText = "display:flex;gap:2px;background:#1a1a1a;border-radius:6px;padding:2px;";
    for (const fw of [{ key: "react" as Framework, label: "React" }, { key: "vue" as Framework, label: "Vue" }, { key: "html" as Framework, label: "HTML" }]) {
      const btn = document.createElement("button");
      btn.textContent = fw.label;
      const active = framework === fw.key;
      btn.style.cssText = `padding:4px 10px;border:none;border-radius:4px;font-size:11px;font-weight:500;cursor:pointer;background:${active ? "#333" : "transparent"};color:${active ? "#e0e0e0" : "#777"};`;
      btn.addEventListener("click", () => { framework = fw.key; render(); });
      fwGroup.appendChild(btn);
    }
    toolbar.appendChild(fwGroup);

    // CSS mode (only for React)
    if (framework === "react") {
      const cssGroup = document.createElement("div");
      cssGroup.style.cssText = "display:flex;gap:2px;background:#1a1a1a;border-radius:6px;padding:2px;";
      for (const cm of [{ key: "inline" as CSSMode, label: "Inline" }, { key: "styled" as CSSMode, label: "Styled" }, { key: "modules" as CSSMode, label: "Modules" }]) {
        const btn = document.createElement("button");
        btn.textContent = cm.label;
        const active = cssMode === cm.key;
        btn.style.cssText = `padding:4px 8px;border:none;border-radius:4px;font-size:10px;font-weight:500;cursor:pointer;background:${active ? "#333" : "transparent"};color:${active ? "#e0e0e0" : "#777"};`;
        btn.addEventListener("click", () => { cssMode = cm.key; render(); });
        cssGroup.appendChild(btn);
      }
      toolbar.appendChild(cssGroup);
    }

    wrap.appendChild(toolbar);

    // Empty state
    if (currentIds.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "display:flex;flex-direction:column;align-items:center;padding-top:60px;color:#555;font-size:11px;";
      empty.innerHTML = `<span style="font-size:24px;opacity:0.3;margin-bottom:8px;">⚛</span>Select a node to export`;
      wrap.appendChild(empty);
      container.appendChild(wrap);
      return;
    }

    // Generate code
    const result = generateCode(editor, currentIds, framework, cssMode);

    // Code display
    const codeWrap = document.createElement("div");
    codeWrap.style.cssText = "flex:1;overflow:auto;padding:0;display:flex;flex-direction:column;";

    // Main code block
    const codeSection = createCodeBlock("Component", result.code);
    codeWrap.appendChild(codeSection);

    // CSS modules file (if applicable)
    if (result.cssFile) {
      const cssSection = createCodeBlock("CSS Module", result.cssFile);
      codeWrap.appendChild(cssSection);
    }

    wrap.appendChild(codeWrap);

    // Bottom actions
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:6px;padding:8px 10px;border-top:1px solid #333;flex-shrink:0;";

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "📋 Copy";
    copyBtn.style.cssText = "flex:1;padding:6px 12px;border:1px solid #555;border-radius:6px;background:#1a1a1a;color:#ccc;cursor:pointer;font-size:11px;font-weight:500;";
    copyBtn.addEventListener("click", () => {
      const full = result.cssFile ? result.code + "\n\n/* --- CSS Module --- */\n\n" + result.cssFile : result.code;
      navigator.clipboard.writeText(full).then(() => {
        copyBtn.textContent = "✓ Copied!";
        copyBtn.style.borderColor = "#22c55e";
        copyBtn.style.color = "#22c55e";
        setTimeout(() => { copyBtn.textContent = "📋 Copy"; copyBtn.style.borderColor = "#555"; copyBtn.style.color = "#ccc"; }, 1500);
      });
    });
    actions.appendChild(copyBtn);

    const dlBtn = document.createElement("button");
    dlBtn.textContent = "⬇ Download";
    dlBtn.style.cssText = "flex:1;padding:6px 12px;border:1px solid #555;border-radius:6px;background:#1a1a1a;color:#ccc;cursor:pointer;font-size:11px;font-weight:500;";
    dlBtn.addEventListener("click", () => {
      const rootInfo = getNodeInfo(editor, currentIds[0]!);
      const name = rootInfo ? toPascalCase(rootInfo.name) : "Component";
      const ext = framework === "react" ? "tsx" : framework === "vue" ? "vue" : "html";
      downloadFile(`${name}.${ext}`, result.code);
      if (result.cssFile) {
        downloadFile(`${name}.module.css`, result.cssFile);
      }
    });
    actions.appendChild(dlBtn);

    wrap.appendChild(actions);
    container.appendChild(wrap);
  }

  function createCodeBlock(label: string, code: string): HTMLElement {
    const section = document.createElement("div");
    section.style.cssText = "border-bottom:1px solid #2a2a2a;";

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:#1a1a1a;";
    const title = document.createElement("span");
    title.textContent = label;
    title.style.cssText = "font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;";
    header.appendChild(title);

    const copySmall = document.createElement("button");
    copySmall.textContent = "Copy";
    copySmall.style.cssText = "background:none;border:1px solid #444;border-radius:3px;padding:1px 6px;color:#666;cursor:pointer;font-size:9px;";
    copySmall.addEventListener("click", () => {
      navigator.clipboard.writeText(code).then(() => {
        copySmall.textContent = "✓";
        setTimeout(() => { copySmall.textContent = "Copy"; }, 1000);
      });
    });
    header.appendChild(copySmall);
    section.appendChild(header);

    const pre = document.createElement("pre");
    pre.style.cssText = "margin:0;padding:8px 10px;font-family:'JetBrains Mono','Fira Code',monospace;font-size:10px;line-height:1.5;color:#d4d4d4;white-space:pre-wrap;word-break:break-all;overflow:auto;max-height:400px;";
    pre.textContent = code;
    section.appendChild(pre);

    return section;
  }

  function downloadFile(filename: string, content: string) {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  editor.onSelection((ids) => {
    currentIds = ids;
    render();
  });

  render();
  return { refresh: () => render() };
}
