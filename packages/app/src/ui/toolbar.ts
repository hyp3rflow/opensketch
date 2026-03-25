import type { Editor, ToolType } from "../editor";
import { icons } from "./icons";
import { openFigmaImportModal } from "./figma-import";

const tools: { id: ToolType; icon: string; label: string }[] = [
  { id: "select", icon: icons.select, label: "Select (V)" },
  { id: "hand", icon: icons.hand, label: "Hand (H)" },
  { id: "rect", icon: icons.rect, label: "Rectangle (R)" },
  { id: "ellipse", icon: icons.ellipse, label: "Ellipse (O)" },
  { id: "text", icon: icons.text, label: "Text (T)" },
  { id: "frame", icon: icons.frame, label: "Frame (F)" },
  { id: "section", icon: icons.section, label: "Section (⇧S)" },
  { id: "image", icon: icons.image, label: "Image (I)" },
  { id: "pen", icon: icons.penTool, label: "Pen (P)" },
  { id: "star", icon: icons.star, label: "Star (S)" },
  { id: "polygon", icon: icons.polygon, label: "Polygon (G)" },
  { id: "slice", icon: icons.slice, label: "Slice (K)" },
  { id: "connector", icon: icons.connector, label: "Connector (L)" },
];

export type AppMode = "edit" | "dev";

function addImageFromFile(editor: Editor) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const maxW = 400;
        const scale = img.width > maxW ? maxW / img.width : 1;
        const w = img.width * scale;
        const h = img.height * scale;
        const cx = editor.engine.screen_to_scene_x(editor.canvas.width / (2 * devicePixelRatio), editor.canvas.height / (2 * devicePixelRatio));
        const cy = editor.engine.screen_to_scene_y(editor.canvas.width / (2 * devicePixelRatio), editor.canvas.height / (2 * devicePixelRatio));
        editor.engine.push_undo();
        const id = editor.engine.add_image(cx - w / 2, cy - h / 2, w, h, dataUrl);
        editor.engine.select(id);
        editor.fireSelectionNow([Number(id)]);
        (editor as any).onLayersChanges?.forEach?.((fn: any) => fn());
        editor.requestRender();
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
  input.click();
}

export function setupToolbar(container: HTMLElement, editor: Editor, onDesignSystem?: () => void, onModeChange?: (mode: AppMode) => void, onPrototype?: () => void) {
  let currentMode: AppMode = "edit";
  tools.forEach((tool, i) => {
    if (i === 2) {
      const sep = document.createElement("div");
      sep.className = "tool-btn-separator";
      container.appendChild(sep);
    }
    const btn = document.createElement("button");
    btn.className = "tool-btn";
    btn.setAttribute("data-tool", tool.id);
    btn.title = tool.label;
    btn.innerHTML = tool.icon;
    if (tool.id === "select") btn.classList.add("active");
    btn.addEventListener("click", () => editor.setTool(tool.id));
    container.appendChild(btn);
  });

  // Image button (file picker)
  {
    const sep = document.createElement("div");
    sep.className = "tool-btn-separator";
    container.appendChild(sep);

    const imgBtn = document.createElement("button");
    imgBtn.className = "tool-btn";
    imgBtn.title = "Add Image";
    imgBtn.innerHTML = icons.image;
    imgBtn.addEventListener("click", () => addImageFromFile(editor));
    container.appendChild(imgBtn);
  }

  // Design system button (after separator)
  if (onDesignSystem) {
    const sep = document.createElement("div");
    sep.className = "tool-btn-separator";
    container.appendChild(sep);

    const dsBtn = document.createElement("button");
    dsBtn.className = "tool-btn";
    dsBtn.title = "Design System (D)";
    dsBtn.innerHTML = icons.palette;
    dsBtn.addEventListener("click", onDesignSystem);
    container.appendChild(dsBtn);
  }

  // Boolean operations buttons
  const sepBool = document.createElement("div");
  sepBool.className = "tool-btn-separator bool-ops-separator";
  container.appendChild(sepBool);

  const boolOps: { id: string; icon: string; label: string }[] = [
    { id: "union", icon: icons.boolUnion, label: "Union (Ctrl+Shift+U)" },
    { id: "subtract", icon: icons.boolSubtract, label: "Subtract (Ctrl+Shift+S)" },
    { id: "intersect", icon: icons.boolIntersect, label: "Intersect (Ctrl+Shift+I)" },
    { id: "exclude", icon: icons.boolExclude, label: "Exclude (Ctrl+Shift+X)" },
  ];

  const boolBtns: HTMLButtonElement[] = [];
  for (const op of boolOps) {
    const btn = document.createElement("button");
    btn.className = "tool-btn bool-op-btn";
    btn.setAttribute("data-bool-op", op.id);
    btn.title = op.label;
    btn.innerHTML = op.icon;
    btn.disabled = true;
    btn.addEventListener("click", () => {
      editor.booleanOperation(op.id as any);
    });
    container.appendChild(btn);
    boolBtns.push(btn);
  }

  // Flatten button
  const flattenBtn = document.createElement("button");
  flattenBtn.className = "tool-btn bool-op-btn";
  flattenBtn.title = "Flatten (⌘E)";
  flattenBtn.innerHTML = icons.flatten;
  flattenBtn.disabled = true;
  flattenBtn.addEventListener("click", () => {
    editor.flattenSelection();
  });
  container.appendChild(flattenBtn);

  // Update boolean ops + flatten button state based on selection
  const updateBoolState = () => {
    const sel = Array.from(editor.engine.get_selection());
    const enabled = sel.length >= 2;
    boolBtns.forEach(btn => btn.disabled = !enabled);
    flattenBtn.disabled = sel.length === 0;
  };
  editor.onSelection(updateBoolState);

  // SVG export button
  const sepSvg = document.createElement("div");
  sepSvg.className = "tool-btn-separator";
  container.appendChild(sepSvg);

  const svgBtn = document.createElement("button");
  svgBtn.className = "tool-btn";
  svgBtn.title = "Export SVG";
  svgBtn.innerHTML = icons.download;
  svgBtn.addEventListener("click", () => editor.downloadSVG());
  container.appendChild(svgBtn);

  const pdfBtn = document.createElement("button");
  pdfBtn.className = "tool-btn";
  pdfBtn.title = "Export PDF";
  pdfBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><text x="7" y="18" font-size="7" font-weight="bold" fill="currentColor" stroke="none" font-family="sans-serif">PDF</text></svg>`;
  pdfBtn.addEventListener("click", () => editor.downloadPDF());
  container.appendChild(pdfBtn);

  // Figma import button
  const figmaBtn = document.createElement("button");
  figmaBtn.className = "tool-btn";
  figmaBtn.title = "Import from Figma";
  figmaBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z"/><path d="M12 2h3.5a3.5 3.5 0 1 1 0 7H12V2z"/><path d="M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z"/><path d="M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z"/><path d="M5 12.5A3.5 3.5 0 0 1 8.5 9H12v7H8.5A3.5 3.5 0 0 1 5 12.5z"/></svg>`;
  figmaBtn.addEventListener("click", () => {
    openFigmaImportModal(editor.engine, () => {
      editor.requestRender();
    });
  });
  container.appendChild(figmaBtn);

  // Prototype play button
  if (onPrototype) {
    const sepProto = document.createElement("div");
    sepProto.className = "tool-btn-separator";
    container.appendChild(sepProto);

    const protoBtn = document.createElement("button");
    protoBtn.className = "tool-btn";
    protoBtn.title = "Present Prototype (⌘⏎)";
    protoBtn.innerHTML = icons.play;
    protoBtn.addEventListener("click", onPrototype);
    container.appendChild(protoBtn);
  }

  // Responsive preview button
  const respBtn = document.createElement("button");
  respBtn.className = "tool-btn";
  respBtn.title = "Responsive Preview (⌘⌥R)";
  respBtn.innerHTML = icons.responsive;
  respBtn.addEventListener("click", () => editor.openResponsivePreview());
  container.appendChild(respBtn);

  // Responsive Tokens button
  const rtBtn = document.createElement("button");
  rtBtn.className = "tool-btn";
  rtBtn.title = "Responsive Tokens (⌘⌥T)";
  rtBtn.innerHTML = icons.tokens || '⚡';
  rtBtn.addEventListener("click", () => editor.openResponsiveTokens());
  container.appendChild(rtBtn);

  // Cursor presence demo toggle
  const cursorBtn = document.createElement("button");
  cursorBtn.className = "tool-btn";
  cursorBtn.title = "Toggle Cursor Presence Demo";
  cursorBtn.innerHTML = icons.users;
  cursorBtn.addEventListener("click", () => {
    const active = editor.toggleCursorDemo();
    cursorBtn.classList.toggle("active", active);
  });
  container.appendChild(cursorBtn);

  // Mode toggle (rightmost)
  const sep2 = document.createElement("div");
  sep2.className = "tool-btn-separator";
  container.appendChild(sep2);

  const toggle = document.createElement("div");
  toggle.className = "mode-toggle";
  toggle.innerHTML = `
    <button class="mode-btn active" data-mode="edit" title="Edit Mode">${icons.pen}</button>
    <button class="mode-btn" data-mode="dev" title="Dev Mode">${icons.code}</button>
  `;
  container.appendChild(toggle);

  toggle.querySelectorAll<HTMLButtonElement>(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode as AppMode;
      if (mode === currentMode) return;
      currentMode = mode;
      toggle.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      onModeChange?.(mode);
    });
  });
}
