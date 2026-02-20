import type { Editor, ToolType } from "../editor";
import { icons } from "./icons";

const tools: { id: ToolType; icon: string; label: string }[] = [
  { id: "select", icon: icons.select, label: "Select (V)" },
  { id: "hand", icon: icons.hand, label: "Hand (H)" },
  { id: "rect", icon: icons.rect, label: "Rectangle (R)" },
  { id: "ellipse", icon: icons.ellipse, label: "Ellipse (O)" },
  { id: "text", icon: icons.text, label: "Text (T)" },
  { id: "frame", icon: icons.frame, label: "Frame (F)" },
];

export type AppMode = "edit" | "dev";

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
