import type { Editor, ToolType } from "../editor";
import { icons } from "./icons";
import { openFigmaImportModal } from "./figma-import";
import { showFigmaExport } from "./figma-export";
import { toggleRecorderBar } from "./canvas-recorder";
import { openBatchExport } from "./batch-export";
import { toggleDesignTokenExport } from "./design-token-export";
import { openLottieExportDialog } from "./lottie-export";
import { openCodeToDesignModal } from "./code-to-design";
import { openDesignPolish } from "./design-polish";
import { openDesignHealth } from "./design-health";
import { setupVoiceControl } from "./voice-control";
import { openFileDiffMerge } from "./file-diff-merge";
import { togglePerfProfiler } from "./perf-profiler";
import { toggleStampPalette, isStampModeActive, setActiveStampKind, closeStampPalette } from "./stamp-tool";
import { openDataBindingPanel } from "./data-binding-panel";
import { t, onLocaleChange, createLanguagePicker } from "./i18n";

const toolI18nKeys: Record<string, string> = {
  select: "tool.select", hand: "tool.hand", rect: "tool.rect", ellipse: "tool.ellipse",
  text: "tool.text", frame: "tool.frame", section: "tool.section", image: "tool.image",
  pen: "tool.pen", star: "tool.star", polygon: "tool.polygon", slice: "tool.slice",
  connector: "tool.connector", measure: "tool.measure", callout: "tool.callout",
  sticky: "tool.sticky", table: "tool.table", chart: "tool.chart", freehand: "tool.freehand", annotate: "tool.annotate", scale: "tool.scale", shapeBuilder: "tool.shapeBuilder",
};

const tools: { id: ToolType; icon: string; labelKey: string }[] = [
  { id: "select", icon: icons.select, labelKey: "tool.select" },
  { id: "hand", icon: icons.hand, labelKey: "tool.hand" },
  { id: "rect", icon: icons.rect, labelKey: "tool.rect" },
  { id: "ellipse", icon: icons.ellipse, labelKey: "tool.ellipse" },
  { id: "text", icon: icons.text, labelKey: "tool.text" },
  { id: "frame", icon: icons.frame, labelKey: "tool.frame" },
  { id: "section", icon: icons.section, labelKey: "tool.section" },
  { id: "image", icon: icons.image, labelKey: "tool.image" },
  { id: "pen", icon: icons.penTool, labelKey: "tool.pen" },
  { id: "shapeBuilder", icon: icons.shapeBuilder, labelKey: "tool.shapeBuilder" },
  { id: "star", icon: icons.star, labelKey: "tool.star" },
  { id: "polygon", icon: icons.polygon, labelKey: "tool.polygon" },
  { id: "slice", icon: icons.slice, labelKey: "tool.slice" },
  { id: "connector", icon: icons.connector, labelKey: "tool.connector" },
  { id: "measure", icon: icons.measureTool, labelKey: "tool.measure" },
  { id: "callout", icon: icons.callout, labelKey: "tool.callout" },
  { id: "sticky", icon: icons.stickyNote, labelKey: "tool.sticky" },
  { id: "table", icon: icons.table, labelKey: "tool.table" },
  { id: "chart", icon: icons.chart, labelKey: "tool.chart" },
  { id: "freehand", icon: icons.freehand, labelKey: "tool.freehand" },
  { id: "scale", icon: icons.scale, labelKey: "tool.scale" },
  { id: "eyedropper", icon: icons.eyedropper, labelKey: "tool.eyedropper" },
  { id: "annotate", icon: icons.annotationBrush, labelKey: "tool.annotate" },
  { id: "measure", icon: icons.measure, labelKey: "tool.measure" },
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
    btn.title = t(tool.labelKey);
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
    imgBtn.title = t("toolbar.addImage");
    imgBtn.innerHTML = icons.image;
    imgBtn.addEventListener("click", () => addImageFromFile(editor));
    container.appendChild(imgBtn);

    // Video button
    const vidBtn = document.createElement("button");
    vidBtn.className = "tool-btn";
    vidBtn.title = "Add Video (Shift+V)";
    vidBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polygon points="10 8 16 12 10 16"/></svg>`;
    vidBtn.addEventListener("click", () => editor.setTool("video"));
    container.appendChild(vidBtn);

    // SVG Import button
    const svgBtn = document.createElement("button");
    svgBtn.className = "tool-btn";
    svgBtn.title = t("toolbar.importSvg");
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
    dsBtn.title = t("toolbar.designSystem");
    dsBtn.innerHTML = icons.palette;
    dsBtn.addEventListener("click", onDesignSystem);
    container.appendChild(dsBtn);
  }

  // Whiteboard mode button
  {
    const sep = document.createElement("div");
    sep.className = "tool-btn-separator";
    container.appendChild(sep);

    const wbBtn = document.createElement("button");
    wbBtn.className = "tool-btn";
    wbBtn.id = "whiteboard-mode-btn";
    wbBtn.title = t("toolbar.whiteboard");
    wbBtn.innerHTML = icons.whiteboard;
    wbBtn.addEventListener("click", () => {
      (window as any).__toggleWhiteboard?.();
      wbBtn.classList.toggle("active");
    });
    container.appendChild(wbBtn);
  }

  // Spreadsheet Data Binding (MVP)
  {
    const sep = document.createElement("div");
    sep.className = "tool-btn-separator";
    container.appendChild(sep);

    const dataBtn = document.createElement("button");
    dataBtn.className = "tool-btn";
    dataBtn.title = "Spreadsheet Data Binding";
    dataBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>`;
    dataBtn.addEventListener("click", () => openDataBindingPanel(editor));
    container.appendChild(dataBtn);
  }

  // Stamp tool button
  {
    const sep = document.createElement("div");
    sep.className = "tool-btn-separator";
    container.appendChild(sep);

    const stampBtn = document.createElement("button");
    stampBtn.className = "tool-btn";
    stampBtn.id = "stamp-tool-btn";
    stampBtn.title = t("toolbar.stamp");
    stampBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21h14"/><path d="M12 17V9"/><path d="M8 17h8"/><circle cx="12" cy="5" r="3"/></svg>`;
    stampBtn.addEventListener("click", (ev) => {
      const rect = stampBtn.getBoundingClientRect();
      toggleStampPalette(rect.left, rect.top - 8, (kind) => {
        setActiveStampKind(kind);
        stampBtn.classList.add("active");
        editor.canvas.style.cursor = "crosshair";
        // Listen for ESC to exit
        const escFn = (e: KeyboardEvent) => {
          if (e.key === "Escape") {
            setActiveStampKind(null);
            stampBtn.classList.remove("active");
            editor.canvas.style.cursor = "";
            window.removeEventListener("keydown", escFn);
          }
        };
        window.addEventListener("keydown", escFn);
      });
    });
    container.appendChild(stampBtn);
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
    btn.addEventListener("mouseenter", () => {
      if (!btn.disabled) editor.previewBooleanOperation(op.id as any);
    });
    btn.addEventListener("mouseleave", () => {
      editor.previewBooleanOperation(null);
    });
    container.appendChild(btn);
    boolBtns.push(btn);
  }

  // Flatten button
  const flattenBtn = document.createElement("button");
  flattenBtn.className = "tool-btn bool-op-btn";
  flattenBtn.title = t("toolbar.flatten");
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
    if (!enabled) editor.previewBooleanOperation(null);
  };
  editor.onSelection(updateBoolState);

  // Auto Dark Mode button
  const darkModeSep = document.createElement("div");
  darkModeSep.className = "tool-btn-separator";
  container.appendChild(darkModeSep);

  const darkModeBtn = document.createElement("button");
  darkModeBtn.className = "tool-btn";
  darkModeBtn.title = t("toolbar.darkMode");
  darkModeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  darkModeBtn.addEventListener("click", () => {
    const count = editor.autoDarkModeSelection();
    if (count > 0) {
      console.log(`Auto dark mode: ${count} nodes converted`);
    }
  });
  container.appendChild(darkModeBtn);

  // Chat history button
  const chatHistoryBtn = document.createElement("button");
  chatHistoryBtn.className = "tool-btn";
  chatHistoryBtn.title = t("toolbar.chatHistory");
  chatHistoryBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
  chatHistoryBtn.addEventListener("click", () => {
    editor.toggleChatHistory();
  });
  container.appendChild(chatHistoryBtn);

  // SVG export button
  const sepSvg = document.createElement("div");
  sepSvg.className = "tool-btn-separator";
  container.appendChild(sepSvg);

  const svgBtn = document.createElement("button");
  svgBtn.className = "tool-btn";
  svgBtn.title = t("toolbar.exportSvg");
  svgBtn.innerHTML = icons.download;
  svgBtn.addEventListener("click", () => editor.downloadSVG());
  container.appendChild(svgBtn);

  const pdfBtn = document.createElement("button");
  pdfBtn.className = "tool-btn";
  pdfBtn.title = t("toolbar.exportPdf");
  pdfBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><text x="7" y="18" font-size="7" font-weight="bold" fill="currentColor" stroke="none" font-family="sans-serif">PDF</text></svg>`;
  pdfBtn.addEventListener("click", () => editor.downloadPDF());
  container.appendChild(pdfBtn);

  // Email HTML export button
  const emailBtn = document.createElement("button");
  emailBtn.className = "tool-btn";
  emailBtn.title = t("toolbar.exportEmail");
  emailBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`;
  emailBtn.addEventListener("click", () => {
    const html = editor.engine.export_email_html();
    if (!html) return;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "email-template.html";
    a.click();
    URL.revokeObjectURL(url);
  });
  container.appendChild(emailBtn);

  // Batch export button
  const batchExportBtn = document.createElement("button");
  batchExportBtn.className = "tool-btn";
  batchExportBtn.title = t("toolbar.batchExport");
  batchExportBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/><line x1="8" y1="21" x2="8" y2="21"/><line x1="12" y1="21" x2="12" y2="21"/><line x1="16" y1="21" x2="16" y2="21"/></svg>`;
  batchExportBtn.addEventListener("click", () => openBatchExport(editor));
  container.appendChild(batchExportBtn);

  // Lottie Export button
  const lottieBtn = document.createElement("button");
  lottieBtn.className = "tool-btn";
  lottieBtn.title = "Export Lottie Animation";
  lottieBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg>`;
  lottieBtn.addEventListener("click", () => openLottieExportDialog(editor));
  container.appendChild(lottieBtn);

  // Design Token Export button
  const tokenBtn = document.createElement("button");
  tokenBtn.className = "tool-btn";
  tokenBtn.title = t("toolbar.designTokenExport");
  tokenBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4"/><path d="M12 19v4"/><path d="M1 12h4"/><path d="M19 12h4"/><path d="M4.22 4.22l2.83 2.83"/><path d="M16.95 16.95l2.83 2.83"/><path d="M4.22 19.78l2.83-2.83"/><path d="M16.95 7.05l2.83-2.83"/></svg>`;
  tokenBtn.addEventListener("click", () => toggleDesignTokenExport(editor));
  container.appendChild(tokenBtn);

  // Design Polish button
  const polishBtn = document.createElement("button");
  polishBtn.className = "tool-btn";
  polishBtn.title = t("toolbar.polish");
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
  replaceBtn.title = t("toolbar.smartReplace");
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
  healthBtn.title = t("toolbar.designHealth");
  healthBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`;
  healthBtn.addEventListener("click", () => {
    openDesignHealth(editor.engine, { onRefresh: () => editor.requestRender() });
  });
  container.appendChild(healthBtn);

  // Snapshot Testing button
  const snapshotBtn = document.createElement("button");
  snapshotBtn.className = "tool-btn";
  snapshotBtn.title = t("toolbar.snapshot");
  snapshotBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`;
  snapshotBtn.addEventListener("click", () => {
    editor.toggleSnapshotPanel();
  });
  container.appendChild(snapshotBtn);

  // Performance Profiler button
  const perfBtn = document.createElement("button");
  perfBtn.className = "tool-btn";
  perfBtn.title = t("toolbar.perfProfiler");
  perfBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`;
  perfBtn.addEventListener("click", () => {
    togglePerfProfiler(editor.engine, editor);
  });
  container.appendChild(perfBtn);

  // Figma import button
  const figmaBtn = document.createElement("button");
  figmaBtn.className = "tool-btn";
  figmaBtn.title = t("toolbar.figmaImport");
  figmaBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z"/><path d="M12 2h3.5a3.5 3.5 0 1 1 0 7H12V2z"/><path d="M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z"/><path d="M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z"/><path d="M5 12.5A3.5 3.5 0 0 1 8.5 9H12v7H8.5A3.5 3.5 0 0 1 5 12.5z"/></svg>`;
  figmaBtn.addEventListener("click", () => {
    openFigmaImportModal(editor.engine, () => {
      editor.requestRender();
    });
  });
  container.appendChild(figmaBtn);

  // Figma export button
  const figmaExportBtn = document.createElement("button");
  figmaExportBtn.className = "tool-btn";
  figmaExportBtn.title = "Export to Figma JSON";
  figmaExportBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
  figmaExportBtn.addEventListener("click", () => {
    showFigmaExport(editor);
  });
  container.appendChild(figmaExportBtn);

  // Code-to-Design button
  const codeBtn = document.createElement("button");
  codeBtn.className = "tool-btn";
  codeBtn.title = t("toolbar.codeToDesign");
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
    protoBtn.title = t("toolbar.prototype");
    protoBtn.innerHTML = icons.play;
    protoBtn.addEventListener("click", onPrototype);
    container.appendChild(protoBtn);

    // Flow Diagram button
    const flowBtn = document.createElement("button");
    flowBtn.className = "tool-btn";
    flowBtn.title = t("toolbar.flowDiagram");
    flowBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="8" height="6" rx="1"/><rect x="15" y="3" width="8" height="6" rx="1"/><rect x="8" y="15" width="8" height="6" rx="1"/><path d="M9 6h6"/><path d="M5 9v3a2 2 0 002 2h2"/><path d="M19 9v3a2 2 0 01-2 2h-2"/></svg>`;
    flowBtn.addEventListener("click", () => {
      import("./flow-diagram").then(m => m.toggleFlowDiagram(editor));
    });
    container.appendChild(flowBtn);
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
  respBtn.title = t("toolbar.responsive");
  respBtn.innerHTML = icons.responsive;
  respBtn.addEventListener("click", () => editor.openResponsivePreview());
  container.appendChild(respBtn);

  // Breakpoints multi-viewport preview button
  const bpBtn = document.createElement("button");
  bpBtn.className = "tool-btn";
  bpBtn.title = "Breakpoints Preview (⌘⇧B)";
  bpBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="7" height="18" rx="1"/><rect x="11" y="3" width="5" height="18" rx="1"/><rect x="18" y="3" width="4" height="18" rx="1"/></svg>`;
  bpBtn.addEventListener("click", () => editor.openBreakpointsPreview());
  container.appendChild(bpBtn);

  // Responsive Tokens button
  const rtBtn = document.createElement("button");
  rtBtn.className = "tool-btn";
  rtBtn.title = t("toolbar.responsiveTokens");
  rtBtn.innerHTML = icons.tokens || '⚡';
  rtBtn.addEventListener("click", () => editor.openResponsiveTokens());
  container.appendChild(rtBtn);

  // Canvas recorder toggle
  const recBtn = document.createElement("button");
  recBtn.className = "tool-btn";
  recBtn.title = t("toolbar.recorder");
  recBtn.innerHTML = '⏺';
  recBtn.addEventListener("click", () => {
    toggleRecorderBar();
  });
  container.appendChild(recBtn);

  // Review panel toggle
  const reviewBtn = document.createElement("button");
  reviewBtn.className = "tool-btn";
  reviewBtn.title = t("toolbar.reviews");
  reviewBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><path d="M8 9h8M8 13h4"/></svg>`;
  let reviewVisible = false;
  reviewBtn.addEventListener("click", () => {
    reviewVisible = !reviewVisible;
    const rp = (editor as any).reviewPanel;
    if (rp) { reviewVisible ? rp.show() : rp.hide(); }
    reviewBtn.classList.toggle("active", reviewVisible);
  });
  container.appendChild(reviewBtn);

  // Cursor presence demo toggle
  const cursorBtn = document.createElement("button");
  cursorBtn.className = "tool-btn";
  cursorBtn.title = t("toolbar.cursorPresence");
  cursorBtn.innerHTML = icons.users;
  cursorBtn.addEventListener("click", () => {
    const active = editor.toggleCursorDemo();
    cursorBtn.classList.toggle("active", active);
  });
  container.appendChild(cursorBtn);

  // Voice control button
  setupVoiceControl(container, editor);

  // File Diff / Merge button
  const diffSep = document.createElement("div");
  diffSep.className = "tool-btn-separator";
  container.appendChild(diffSep);
  const diffBtn = document.createElement("button");
  diffBtn.className = "tool-btn";
  diffBtn.title = t("toolbar.fileDiff");
  diffBtn.innerHTML = icons.fileDiff;
  diffBtn.addEventListener("click", () => openFileDiffMerge(editor));
  container.appendChild(diffBtn);
  (window as any).__openFileDiffMerge = () => openFileDiffMerge(editor);

  // Language picker
  const langSep = document.createElement("div");
  langSep.className = "tool-btn-separator";
  container.appendChild(langSep);
  const langPicker = createLanguagePicker(() => {
    // Re-apply all tooltips on locale change
    container.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach(btn => {
      const toolId = btn.getAttribute("data-tool");
      const key = toolI18nKeys[toolId!];
      if (key) btn.title = t(key);
    });
  });
  container.appendChild(langPicker);

  // Mode toggle (rightmost)
  const sep2 = document.createElement("div");
  sep2.className = "tool-btn-separator";
  container.appendChild(sep2);

  const toggle = document.createElement("div");
  toggle.className = "mode-toggle";
  toggle.innerHTML = `
    <button class="mode-btn active" data-mode="edit" title="${t("toolbar.editMode")}">${icons.pen}</button>
    <button class="mode-btn" data-mode="dev" title="${t("toolbar.devMode")}">${icons.code}</button>
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
