/**
 * Live HTML/CSS Preview Panel
 * Converts selected node tree to HTML+CSS and renders in a sandboxed iframe.
 * Updates in real-time on selection or property changes.
 */

import type { Editor } from "../editor";

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

function fillToCSS(fillInfo: any): string {
  if (!fillInfo) return "";
  if (fillInfo.type === "Solid" || fillInfo.color) {
    return `background-color:${rgbaCSS(fillInfo.color || fillInfo)};`;
  }
  if (fillInfo.type === "LinearGradient" && fillInfo.stops) {
    const stops = fillInfo.stops.map((s: any) => `${rgbaCSS(s.color)} ${(s.offset * 100).toFixed(0)}%`).join(",");
    return `background:linear-gradient(${stops});`;
  }
  if (fillInfo.type === "RadialGradient" && fillInfo.stops) {
    const stops = fillInfo.stops.map((s: any) => `${rgbaCSS(s.color)} ${(s.offset * 100).toFixed(0)}%`).join(",");
    return `background:radial-gradient(${stops});`;
  }
  return "";
}

function strokeToCSS(strokeInfo: any): string {
  if (!strokeInfo?.color || !strokeInfo.width) return "";
  return `border:${strokeInfo.width}px solid ${rgbaCSS(strokeInfo.color)};`;
}

function shadowsToCSS(shadows: any[]): string {
  if (!shadows?.length) return "";
  const vis = shadows.filter((s: any) => s.visible !== false);
  if (!vis.length) return "";
  const str = vis.map((s: any) =>
    `${s.inset ? "inset " : ""}${s.offset_x ?? 0}px ${s.offset_y ?? 0}px ${s.blur ?? 0}px ${s.spread ?? 0}px ${rgbaCSS(s.color)}`
  ).join(",");
  return `box-shadow:${str};`;
}

function nodeToHTML(editor: Editor, nodeId: number, depth: number = 0): string {
  const bid = BigInt(nodeId);
  const json = editor.engine.get_node_json(bid);
  if (!json) return "";
  const node = JSON.parse(json);

  if (node.visible === false) return "";

  const kind = node.kind;
  const isText = kind === "Text" || (typeof kind === "object" && kind.Text !== undefined);
  const isFrame = kind === "Frame" || kind === "Group" || kind === "Section";
  const isImage = typeof kind === "object" && kind.Image !== undefined;
  const isEllipse = kind === "Ellipse";

  // Build CSS
  const styles: string[] = [];

  // Position — root node uses relative, children use absolute
  if (depth === 0) {
    styles.push("position:relative");
  } else {
    styles.push("position:absolute");
    styles.push(`left:${Math.round(node.x)}px`);
    styles.push(`top:${Math.round(node.y)}px`);
  }

  styles.push(`width:${Math.round(node.width)}px`);
  styles.push(`height:${Math.round(node.height)}px`);

  // Corner radius
  if (isEllipse) {
    styles.push("border-radius:50%");
  } else if (node.corner_radius > 0) {
    styles.push(`border-radius:${node.corner_radius}px`);
  }

  // Rotation
  if (node.rotation && node.rotation !== 0) {
    styles.push(`transform:rotate(${node.rotation.toFixed(1)}deg)`);
  }

  // Opacity
  if (node.opacity !== undefined && node.opacity < 1) {
    styles.push(`opacity:${node.opacity.toFixed(2)}`);
  }

  // Fill
  try {
    const fillInfo = JSON.parse(editor.engine.get_fill_info(bid));
    const fc = fillToCSS(fillInfo);
    if (fc) styles.push(fc.replace(/;$/, ""));
  } catch {}

  // Stroke
  try {
    const strokeInfo = JSON.parse(editor.engine.get_stroke_info(bid));
    const sc = strokeToCSS(strokeInfo);
    if (sc) styles.push(sc.replace(/;$/, ""));
  } catch {}

  // Shadows
  try {
    const shadowsJson = editor.engine.get_shadows(bid);
    if (shadowsJson) {
      const shadows = JSON.parse(shadowsJson);
      const sh = shadowsToCSS(shadows);
      if (sh) styles.push(sh.replace(/;$/, ""));
    }
  } catch {}

  // Blur
  try {
    const blur = editor.engine.get_blur(bid);
    if (blur > 0) styles.push(`filter:blur(${blur}px)`);
  } catch {}

  // Blend mode
  try {
    const bm = editor.engine.get_blend_mode(bid);
    if (bm && bm !== "Normal") {
      const cssBm = bm.replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^-/, "");
      styles.push(`mix-blend-mode:${cssBm}`);
    }
  } catch {}

  // Overflow
  if (node.clip_content) styles.push("overflow:hidden");

  // Layout
  try {
    const layoutJson = editor.engine.get_layout(bid);
    if (layoutJson) {
      const layout = JSON.parse(layoutJson);
      if (layout.mode === "Flex") {
        styles.push("display:flex");
        if (layout.direction === "Column") styles.push("flex-direction:column");
        if (layout.align_items) {
          const aiMap: Record<string, string> = { Start: "flex-start", Center: "center", End: "flex-end", Stretch: "stretch", Baseline: "baseline" };
          if (aiMap[layout.align_items]) styles.push(`align-items:${aiMap[layout.align_items]}`);
        }
        if (layout.justify_content) {
          const jcMap: Record<string, string> = { Start: "flex-start", Center: "center", End: "flex-end", SpaceBetween: "space-between", SpaceAround: "space-around", SpaceEvenly: "space-evenly" };
          if (jcMap[layout.justify_content]) styles.push(`justify-content:${jcMap[layout.justify_content]}`);
        }
        if (layout.gap > 0) styles.push(`gap:${layout.gap}px`);
        if (layout.padding) {
          const p = layout.padding;
          styles.push(`padding:${p.top ?? 0}px ${p.right ?? 0}px ${p.bottom ?? 0}px ${p.left ?? 0}px`);
        }
        if (layout.wrap) styles.push("flex-wrap:wrap");
      }
    }
  } catch {}

  // Text styles
  if (isText) {
    if (node.font_family) styles.push(`font-family:'${node.font_family}',sans-serif`);
    if (node.font_size) styles.push(`font-size:${node.font_size}px`);
    if (node.font_weight && node.font_weight !== 400) styles.push(`font-weight:${node.font_weight}`);
    if (node.font_style && node.font_style !== "normal") styles.push(`font-style:${node.font_style}`);
    if (node.line_height && node.line_height !== 1.2) styles.push(`line-height:${node.line_height}`);
    if (node.text_align && node.text_align !== "left") styles.push(`text-align:${node.text_align}`);
    if (node.letter_spacing) styles.push(`letter-spacing:${node.letter_spacing}px`);

    // Text color from fills
    if (node.fills?.[0]?.color) {
      styles.push(`color:${rgbaCSS(node.fills[0].color)}`);
    } else if (node.fills?.[0]) {
      styles.push(`color:${rgbaCSS(node.fills[0])}`);
    }

    // Text decoration
    if (node.text_decoration && node.text_decoration !== "None") {
      const decoMap: Record<string, string> = { Underline: "underline", Strikethrough: "line-through" };
      if (decoMap[node.text_decoration]) styles.push(`text-decoration:${decoMap[node.text_decoration]}`);
    }

    const textContent = typeof kind === "object" ? kind.Text : (node.text || "");
    const escaped = escapeHtml(textContent || "").replace(/\n/g, "<br>");
    return `<div style="${styles.join(";")}">${escaped}</div>`;
  }

  // Image
  if (isImage) {
    const src = kind.Image?.src || "";
    const fit = kind.Image?.fit || "cover";
    const fitMap: Record<string, string> = { cover: "cover", contain: "contain", fill: "fill" };
    styles.push(`background-image:url('${escapeHtml(src)}')`);
    styles.push(`background-size:${fitMap[fit] || "cover"}`);
    styles.push("background-position:center");
    styles.push("background-repeat:no-repeat");
    return `<div style="${styles.join(";")}"></div>`;
  }

  // Container: render children
  const children: number[] = node.children || [];
  let childrenHTML = "";
  for (const childId of children) {
    childrenHTML += nodeToHTML(editor, childId, depth + 1);
  }

  return `<div style="${styles.join(";")}">${childrenHTML}</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Panel Setup ──

export function setupLivePreview(container: HTMLElement, editor: Editor) {
  let currentIds: number[] = [];
  let autoRefresh = true;
  let showCode = false;
  let bgColor = "#ffffff";
  let scale = 1;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  function buildPreviewHTML(ids: number[]): string {
    if (ids.length === 0) return "";
    const parts: string[] = [];
    for (const id of ids) {
      parts.push(nodeToHTML(editor, id, 0));
    }
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:${bgColor}; display:flex; align-items:center; justify-content:center; min-height:100vh; font-family:Inter,system-ui,-apple-system,sans-serif; }
  .preview-root { transform:scale(${scale}); transform-origin:center center; }
</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
</head>
<body>
<div class="preview-root">
${parts.join("\n")}
</div>
</body>
</html>`;
  }

  function render() {
    container.innerHTML = "";

    // Toolbar
    const toolbar = document.createElement("div");
    toolbar.style.cssText = "display:flex;align-items:center;gap:4px;padding:6px 10px;border-bottom:1px solid #333;flex-shrink:0;";

    // Auto-refresh toggle
    const autoBtn = document.createElement("button");
    autoBtn.textContent = autoRefresh ? "● Live" : "○ Paused";
    autoBtn.style.cssText = `background:none;border:1px solid ${autoRefresh ? "#22c55e" : "#555"};border-radius:4px;padding:2px 8px;color:${autoRefresh ? "#22c55e" : "#888"};cursor:pointer;font-size:10px;font-weight:600;`;
    autoBtn.addEventListener("click", () => { autoRefresh = !autoRefresh; render(); });
    toolbar.appendChild(autoBtn);

    // Manual refresh
    const refreshBtn = document.createElement("button");
    refreshBtn.textContent = "↻";
    refreshBtn.title = "Refresh";
    refreshBtn.style.cssText = "background:none;border:1px solid #555;border-radius:4px;padding:2px 6px;color:#888;cursor:pointer;font-size:12px;";
    refreshBtn.addEventListener("click", () => updatePreview());
    toolbar.appendChild(refreshBtn);

    // Scale selector
    const scaleSelect = document.createElement("select");
    scaleSelect.style.cssText = "background:#1e1e1e;border:1px solid #555;border-radius:4px;padding:2px 4px;color:#ccc;font-size:10px;cursor:pointer;";
    for (const s of [0.25, 0.5, 0.75, 1, 1.5, 2]) {
      const opt = document.createElement("option");
      opt.value = String(s);
      opt.textContent = `${s * 100}%`;
      if (s === scale) opt.selected = true;
      scaleSelect.appendChild(opt);
    }
    scaleSelect.addEventListener("change", () => { scale = parseFloat(scaleSelect.value); updatePreview(); });
    toolbar.appendChild(scaleSelect);

    // Background toggle
    const bgBtn = document.createElement("button");
    bgBtn.textContent = bgColor === "#ffffff" ? "☀" : "☾";
    bgBtn.title = "Toggle background";
    bgBtn.style.cssText = "background:none;border:1px solid #555;border-radius:4px;padding:2px 6px;color:#888;cursor:pointer;font-size:12px;";
    bgBtn.addEventListener("click", () => { bgColor = bgColor === "#ffffff" ? "#1a1a2e" : "#ffffff"; updatePreview(); render(); });
    toolbar.appendChild(bgBtn);

    // Code toggle
    const codeBtn = document.createElement("button");
    codeBtn.textContent = showCode ? "</>" : "</>";
    codeBtn.title = "Toggle HTML source";
    codeBtn.style.cssText = `background:none;border:1px solid ${showCode ? "#4f46e5" : "#555"};border-radius:4px;padding:2px 6px;color:${showCode ? "#818cf8" : "#888"};cursor:pointer;font-size:10px;font-weight:600;`;
    codeBtn.addEventListener("click", () => { showCode = !showCode; render(); updatePreview(); });
    toolbar.appendChild(codeBtn);

    // Copy HTML button
    const copyBtn = document.createElement("button");
    copyBtn.textContent = "Copy";
    copyBtn.title = "Copy HTML to clipboard";
    copyBtn.style.cssText = "background:none;border:1px solid #555;border-radius:4px;padding:2px 8px;color:#888;cursor:pointer;font-size:10px;margin-left:auto;";
    copyBtn.addEventListener("click", () => {
      const html = buildPreviewHTML(currentIds);
      navigator.clipboard.writeText(html).then(() => {
        copyBtn.textContent = "✓";
        copyBtn.style.color = "#22c55e";
        setTimeout(() => { copyBtn.textContent = "Copy"; copyBtn.style.color = "#888"; }, 1200);
      });
    });
    toolbar.appendChild(copyBtn);

    container.appendChild(toolbar);

    if (currentIds.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "display:flex;flex-direction:column;align-items:center;padding-top:60px;color:#555;font-size:11px;";
      empty.innerHTML = `<span style="font-size:24px;opacity:0.3;margin-bottom:8px;">👁</span>Select a node to preview`;
      container.appendChild(empty);
      return;
    }

    if (showCode) {
      // Code view
      const codeWrap = document.createElement("div");
      codeWrap.style.cssText = "flex:1;overflow:auto;padding:8px;";
      const pre = document.createElement("pre");
      pre.style.cssText = "margin:0;font-family:'JetBrains Mono','Fira Code',monospace;font-size:10px;line-height:1.5;color:#d4d4d4;white-space:pre-wrap;word-break:break-all;";
      pre.textContent = buildPreviewHTML(currentIds);
      codeWrap.appendChild(pre);
      container.appendChild(codeWrap);
    } else {
      // iframe preview
      const iframeWrap = document.createElement("div");
      iframeWrap.style.cssText = "flex:1;overflow:hidden;background:#2a2a2a;";
      const iframe = document.createElement("iframe");
      iframe.id = "live-preview-iframe";
      iframe.sandbox.add("allow-same-origin");
      iframe.style.cssText = "width:100%;height:100%;border:none;";
      iframeWrap.appendChild(iframe);
      container.appendChild(iframeWrap);
      // Write content after append
      requestAnimationFrame(() => updatePreview());
    }
  }

  function updatePreview() {
    const html = buildPreviewHTML(currentIds);
    const iframe = container.querySelector<HTMLIFrameElement>("#live-preview-iframe");
    if (iframe) {
      const doc = iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
      }
    }
    // Also update code view if visible
    const pre = container.querySelector("pre");
    if (pre && showCode) {
      pre.textContent = html;
    }
  }

  function scheduleRefresh(ids: number[]) {
    currentIds = ids;
    if (!autoRefresh) return;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      render();
    }, 100);
  }

  // Listen for selection changes
  editor.onSelection((ids) => scheduleRefresh(ids));

  // Initial render
  render();

  return { refresh: () => render() };
}
