export interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  enabled?: boolean;
  separator?: boolean;
}

let menuEl: HTMLElement | null = null;

export function hideContextMenu() {
  if (menuEl) {
    menuEl.remove();
    menuEl = null;
  }
}

export function showContextMenu(x: number, y: number, items: MenuItem[]) {
  hideContextMenu();

  const el = document.createElement("div");
  el.className = "os-context-menu";
  el.style.cssText = `
    position: fixed; z-index: 10000;
    min-width: 200px; padding: 4px 0;
    background: #2c2c2c; border: 1px solid #444;
    border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    font-family: Inter, system-ui, sans-serif; font-size: 13px;
    color: #e0e0e0; user-select: none;
  `;

  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement("div");
      sep.style.cssText = "height:1px; margin:4px 8px; background:#444;";
      el.appendChild(sep);
      continue;
    }
    const disabled = item.enabled === false;
    const row = document.createElement("div");
    row.style.cssText = `
      display:flex; justify-content:space-between; align-items:center;
      padding: 6px 12px; cursor: default; border-radius: 4px; margin: 0 4px;
    `;
    if (disabled) {
      row.style.color = "#666";
    } else {
      row.addEventListener("mouseenter", () => { row.style.background = "#3b82f6"; });
      row.addEventListener("mouseleave", () => { row.style.background = "none"; });
      row.addEventListener("click", () => {
        hideContextMenu();
        item.action?.();
      });
    }

    const label = document.createElement("span");
    label.textContent = item.label;
    row.appendChild(label);

    if (item.shortcut) {
      const sc = document.createElement("span");
      sc.textContent = item.shortcut;
      sc.style.cssText = "color:#888; font-size:11px; margin-left:24px;";
      if (disabled) sc.style.color = "#555";
      row.appendChild(sc);
    }

    el.appendChild(row);
  }

  document.body.appendChild(el);
  menuEl = el;

  // Position within viewport
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  el.style.left = (x + rect.width > vw ? vw - rect.width - 4 : x) + "px";
  el.style.top = (y + rect.height > vh ? vh - rect.height - 4 : y) + "px";

  // Close on outside click or Escape
  const onDown = (e: PointerEvent) => {
    if (menuEl && !menuEl.contains(e.target as Node)) {
      hideContextMenu();
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      hideContextMenu();
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    }
  };
  // Use setTimeout to avoid the current event triggering close
  setTimeout(() => {
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
  }, 0);
}
