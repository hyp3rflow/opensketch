import type { Editor, ToolType } from "../editor";
import { icons } from "./icons";

const tools: { id: ToolType; icon: string; label: string }[] = [
  { id: "select", icon: icons.select, label: "Select (V)" },
  { id: "hand", icon: icons.hand, label: "Hand (H)" },
  { id: "rect", icon: icons.rect, label: "Rectangle (R)" },
  { id: "ellipse", icon: icons.ellipse, label: "Ellipse (O)" },
  { id: "text", icon: icons.text, label: "Text (T)" },
  { id: "frame", icon: icons.frame, label: "Frame (F)" },
  { id: "image", icon: icons.image, label: "Image (I)" },
  { id: "pen", icon: icons.penTool, label: "Pen (P)" },
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

export function setupToolbar(container: HTMLElement, editor: Editor, onDesignSystem?: () => void, onModeChange?: (mode: AppMode) => void) {
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
