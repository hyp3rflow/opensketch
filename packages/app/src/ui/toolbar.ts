import type { Editor, ToolType } from "../editor";
import { icons } from "./icons";
import { openFigmaImportModal } from "./figma-import";
import { toggleRecorderBar } from "./canvas-recorder";
import { openBatchExport } from "./batch-export";
import { toggleDesignTokenExport } from "./design-token-export";
import { openCodeToDesignModal } from "./code-to-design";
import { openDesignPolish } from "./design-polish";
import { openDesignHealth } from "./design-health";

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
  { id: "sticky", icon: icons.stickyNote, label: "Sticky Note (N)" },
  { id: "table", icon: icons.table, label: "Table (B)" },
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

    // SVG Import button
    const svgBtn = document.createElement("button");
    svgBtn.className = "tool-btn";
    svgBtn.title = "Import SVG";
    svgBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 12 15 15"/></svg>`;
    svgBtn.addEventListener("click", () => editor.importSVGFile());
    container.appendChild(svgBtn);
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

  // Batch export button
  const batchExportBtn = document.createElement("button");
  batchExportBtn.className = "tool-btn";
  batchExportBtn.title = "Batch Export (Cmd+Shift+E)";
  batchExportBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/><line x1="8" y1="21" x2="8" y2="21"/><line x1="12" y1="21" x2="12" y2="21"/><line x1="16" y1="21" x2="16" y2="21"/></svg>`;
  batchExportBtn.addEventListener("click", () => openBatchExport(editor));
  container.appendChild(batchExportBtn);

  // Design Token Export button
  const tokenBtn = document.createElement("button");
  tokenBtn.className = "tool-btn";
  tokenBtn.title = "Export Design Tokens";
  tokenBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4"/><path d="M12 19v4"/><path d="M1 12h4"/><path d="M19 12h4"/><path d="M4.22 4.22l2.83 2.83"/><path d="M16.95 16.95l2.83 2.83"/><path d="M4.22 19.78l2.83-2.83"/><path d="M16.95 7.05l2.83-2.83"/></svg>`;
  tokenBtn.addEventListener("click", () => toggleDesignTokenExport(editor));
  container.appendChild(tokenBtn);

  // Design Polish button
  const polishBtn = document.createElement("button");
  polishBtn.className = "tool-btn";
  polishBtn.title = "Polish Design (auto-fix spacing, colors, alignment)";
  polishBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/></svg>`;
  polishBtn.addEventListener("click", () => {
    openDesignPolish(
      editor.engine,
      () => editor.requestRender(),
      (nodeId) => {
        editor.engine.deselect_all();
        editor.engine.select(BigInt(nodeId));
        editor.requestRender();
      }
    );
  });
  container.appendChild(polishBtn);

  // Smart Replace button
  const replaceBtn = document.createElement("button");
  replaceBtn.className = "tool-btn";
  replaceBtn.title = "Smart Replace (Cmd+Shift+H)";
  replaceBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M8 21H3v-5"/><path d="M21 3l-8.5 8.5"/><path d="M3 21l8.5-8.5"/></svg>`;
  replaceBtn.addEventListener("click", () => {
    const sel = Array.from(editor.engine.get_selection()).map(Number);
    if (sel.length === 1) {
      editor.openSmartReplacePanel(sel[0]!);
    }
  });
  container.appendChild(replaceBtn);

  // Design Health Dashboard button
  const healthBtn = document.createElement("button");
  healthBtn.className = "tool-btn";
  healthBtn.title = "Design Health Dashboard";
  healthBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`;
  healthBtn.addEventListener("click", () => {
    openDesignHealth(editor.engine, { onRefresh: () => editor.requestRender() });
  });
  container.appendChild(healthBtn);

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

  // Code-to-Design button
  const codeBtn = document.createElement("button");
  codeBtn.className = "tool-btn";
  codeBtn.title = "Code to Design (⌘⇧D)";
  codeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/><line x1="14" y1="4" x2="10" y2="20"/></svg>`;
  codeBtn.addEventListener("click", () => {
    openCodeToDesignModal(editor.engine, () => {
      editor.requestRender();
    });
  });
  container.appendChild(codeBtn);

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

  // Presentation mode button
  {
    const presBtn = document.createElement("button");
    presBtn.className = "tool-btn";
    presBtn.title = "Presentation Mode (⌘⇧⏎)";
    presBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><polygon points="10,7 10,13 15,10" fill="currentColor" stroke="none"/></svg>`;
    presBtn.addEventListener("click", () => editor.openPresentationMode());
    container.appendChild(presBtn);
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

  // Canvas recorder toggle
  const recBtn = document.createElement("button");
  recBtn.className = "tool-btn";
  recBtn.title = "Canvas Recorder (⇧⌥R)";
  recBtn.innerHTML = '⏺';
  recBtn.addEventListener("click", () => {
    toggleRecorderBar();
  });
  container.appendChild(recBtn);

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
