/**
 * Style Transfer UI — Extract style from one node, apply to others.
 * Integrates into the context menu and properties panel.
 */
import type { Editor } from "../editor";

interface StyleBundle {
  fills: unknown[];
  strokes: unknown[];
  shadows: unknown[];
  corner_radius: number;
  corner_smoothing: number;
  opacity: number;
  blur: number;
  backdrop_blur: number;
  blend_mode: string;
  text_style: {
    font_family: string;
    font_size: number;
    font_weight: number;
    font_style: string;
    line_height: number;
    text_align: string;
    letter_spacing: number;
  } | null;
}

let clipboard: StyleBundle | null = null;

/**
 * Copy style from the first selected node to the style clipboard.
 */
export function copyStyle(editor: Editor): boolean {
  const json = editor.engine.extract_selection_style();
  if (!json || json === "null") return false;
  try {
    clipboard = JSON.parse(json);
    showToast("Style copied");
    return true;
  } catch {
    return false;
  }
}

/**
 * Paste style from clipboard to all selected nodes.
 */
export function pasteStyle(editor: Editor): number {
  if (!clipboard) {
    showToast("No style copied");
    return 0;
  }
  const bundleJson = JSON.stringify(clipboard);
  const optionsJson = JSON.stringify({
    fills: true,
    strokes: true,
    shadows: true,
    corner_radius: true,
    opacity: true,
    blur: true,
    blend_mode: true,
    text_style: true,
  });
  const count = editor.engine.apply_style_transfer(bundleJson, optionsJson);
  if (count > 0) {
    editor.render();
    showToast(`Style applied to ${count} node${count > 1 ? "s" : ""}`);
  }
  return count;
}

/**
 * Check if style clipboard has content.
 */
export function hasStyleClipboard(): boolean {
  return clipboard !== null;
}

/**
 * Create the style transfer section for the properties panel (shown when 1+ nodes selected).
 */
export function createStyleTransferSection(
  editor: Editor,
  onUpdate?: () => void
): HTMLElement {
  const section = document.createElement("div");
  section.style.cssText = "padding:8px 12px;border-top:1px solid #333;";

  const header = document.createElement("div");
  header.style.cssText =
    "font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;";
  header.textContent = "Style Transfer";
  section.appendChild(header);

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:4px;";

  const copyBtn = document.createElement("button");
  copyBtn.style.cssText = btnStyle();
  copyBtn.textContent = "📋 Copy Style";
  copyBtn.title = "Copy style from selected node (Cmd+Alt+C)";
  copyBtn.onclick = () => {
    copyStyle(editor);
  };
  btnRow.appendChild(copyBtn);

  const pasteBtn = document.createElement("button");
  pasteBtn.style.cssText = btnStyle();
  pasteBtn.textContent = "🎨 Paste Style";
  pasteBtn.title = "Paste style to selected nodes (Cmd+Alt+V)";
  pasteBtn.onclick = () => {
    pasteStyle(editor);
    onUpdate?.();
  };
  btnRow.appendChild(pasteBtn);

  section.appendChild(btnRow);

  // Clipboard preview
  if (clipboard) {
    const preview = document.createElement("div");
    preview.style.cssText =
      "margin-top:6px;padding:4px 8px;background:#1e1e1e;border-radius:4px;font-size:10px;color:#888;";
    const fillCount = clipboard.fills?.length ?? 0;
    const strokeCount = clipboard.strokes?.length ?? 0;
    const shadowCount = clipboard.shadows?.length ?? 0;
    const parts: string[] = [];
    if (fillCount) parts.push(`${fillCount} fill${fillCount > 1 ? "s" : ""}`);
    if (strokeCount) parts.push(`${strokeCount} stroke${strokeCount > 1 ? "s" : ""}`);
    if (shadowCount) parts.push(`${shadowCount} shadow${shadowCount > 1 ? "s" : ""}`);
    if (clipboard.corner_radius) parts.push(`r=${clipboard.corner_radius}`);
    if (clipboard.text_style) parts.push("text style");
    preview.textContent = `Clipboard: ${parts.join(", ") || "empty style"}`;
    section.appendChild(preview);
  }

  return section;
}

function btnStyle(): string {
  return "flex:1;background:#2a2a3e;border:1px solid #444;color:#ccc;font-size:11px;padding:5px 8px;border-radius:4px;cursor:pointer;text-align:center;";
}

let toastEl: HTMLDivElement | null = null;
let toastTimeout: ReturnType<typeof setTimeout> | null = null;

function showToast(msg: string) {
  if (toastEl) {
    toastEl.remove();
  }
  if (toastTimeout) clearTimeout(toastTimeout);

  toastEl = document.createElement("div");
  toastEl.style.cssText =
    "position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:#2a2a3e;color:#fff;padding:8px 16px;border-radius:8px;font-size:12px;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.4);pointer-events:none;opacity:0;transition:opacity 0.2s;";
  toastEl.textContent = msg;
  document.body.appendChild(toastEl);
  requestAnimationFrame(() => {
    if (toastEl) toastEl.style.opacity = "1";
  });

  toastTimeout = setTimeout(() => {
    if (toastEl) {
      toastEl.style.opacity = "0";
      setTimeout(() => {
        toastEl?.remove();
        toastEl = null;
      }, 200);
    }
  }, 2000);
}
