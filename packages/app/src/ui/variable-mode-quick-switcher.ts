import type { Editor } from "../editor";
import { applyThemeMode, detectActiveThemeMode, listThemeModeOptions, onThemeModeChanged } from "./variable-theme-modes";

/**
 * Floating top-center quick switcher for shared variable modes (Light/Dark/custom).
 * Keeps prototype runtime selector in sync via shared theme-mode change event.
 */
export function setupVariableModeQuickSwitcher(editor: Editor): void {
  const wrap = document.createElement("div");
  wrap.id = "variable-mode-quick-switcher";
  document.body.appendChild(wrap);

  const render = () => {
    const options = listThemeModeOptions(editor);
    if (options.length === 0) {
      wrap.style.display = "none";
      wrap.innerHTML = "";
      return;
    }
    wrap.style.display = "flex";
    const active = detectActiveThemeMode(editor);

    wrap.innerHTML = `
      <span class="vmqs-label">Mode</span>
      <div class="vmqs-chips"></div>
    `;

    const chips = wrap.querySelector(".vmqs-chips") as HTMLDivElement;
    for (const opt of options) {
      const btn = document.createElement("button");
      btn.className = "vmqs-chip" + (active === opt.id ? " active" : "");
      btn.textContent = opt.label;
      btn.title = `Switch to ${opt.label} mode`;
      btn.addEventListener("click", () => {
        editor.engine.push_undo();
        applyThemeMode(editor, opt.id);
      });
      chips.appendChild(btn);
    }
  };

  render();

  const offTheme = onThemeModeChanged(() => render());
  editor.onLayersChange(() => render());

  window.addEventListener("beforeunload", () => {
    offTheme();
    wrap.remove();
  });
}
