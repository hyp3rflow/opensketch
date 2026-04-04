import type { Editor } from "../editor";

type ColorStyle = { id?: number; name?: string; color?: string };
type TextStyle = {
  id?: number;
  name?: string;
  font_family?: string;
  font_size?: number;
  font_weight?: number;
  line_height?: number;
  letter_spacing?: number;
  color?: string;
};

type StylesPayload = {
  color_styles?: ColorStyle[];
  text_styles?: TextStyle[];
};

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function generateDesignSystemDocsHtml(editor: Editor): string {
  let styles: StylesPayload = {};
  let tokens = "{}";
  try { styles = JSON.parse(editor.engine.export_styles() || "{}"); } catch {}
  try { tokens = editor.exportDesignTokens("w3c") || "{}"; } catch {}

  const colorStyles = Array.isArray(styles.color_styles) ? styles.color_styles : [];
  const textStyles = Array.isArray(styles.text_styles) ? styles.text_styles : [];

  const colorRows = colorStyles.map((s, i) => {
    const name = escapeHtml(s.name || `Color ${i + 1}`);
    const color = escapeHtml(s.color || "rgba(0,0,0,1)");
    return `<div class="color-card"><div class="swatch" style="background:${color}"></div><div><div class="name">${name}</div><div class="meta">${color}</div></div></div>`;
  }).join("\n");

  const textRows = textStyles.map((s, i) => {
    const name = escapeHtml(s.name || `Text ${i + 1}`);
    const ff = escapeHtml(s.font_family || "Inter");
    const fs = Number(s.font_size || 16);
    const fw = Number(s.font_weight || 400);
    const lh = Number(s.line_height || 1.4);
    const ls = Number(s.letter_spacing || 0);
    const color = escapeHtml(s.color || "rgba(255,255,255,0.95)");
    return `<div class="text-card"><div class="name">${name}</div><div class="sample" style="font-family:${ff};font-size:${fs}px;font-weight:${fw};line-height:${lh};letter-spacing:${ls}px;color:${color}">The quick brown fox jumps over the lazy dog.</div><div class="meta">${ff} · ${fs}px · ${fw}</div></div>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>OpenSketch Design System Docs</title>
<style>
:root{--bg:#0f1115;--panel:#171a22;--text:#eef1f8;--muted:#98a2b3;--line:#2b3240}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 Inter,system-ui,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:28px}
h1{font-size:28px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 12px}.sub{color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
.color-card,.text-card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px}
.swatch{height:56px;border-radius:8px;border:1px solid rgba(255,255,255,.1);margin-bottom:8px}
.name{font-weight:600}.meta{font-size:12px;color:var(--muted)}
.sample{margin:6px 0 8px}
pre{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px;overflow:auto;color:#cfe4ff}
</style>
</head>
<body><main class="wrap">
<h1>OpenSketch Design System</h1>
<div class="sub">Generated from shared styles + tokens</div>
<h2>Color Styles (${colorStyles.length})</h2>
<div class="grid">${colorRows || "<div class='sub'>No color styles yet.</div>"}</div>
<h2>Text Styles (${textStyles.length})</h2>
<div class="grid">${textRows || "<div class='sub'>No text styles yet.</div>"}</div>
<h2>W3C Design Tokens</h2>
<pre>${escapeHtml(tokens)}</pre>
</main></body></html>`;
}

export function downloadDesignSystemDocs(editor: Editor, filename = "design-system-docs.html") {
  const html = generateDesignSystemDocsHtml(editor);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
