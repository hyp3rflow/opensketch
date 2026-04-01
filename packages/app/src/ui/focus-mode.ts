/**
 * Focus Mode — distraction-free canvas experience
 * Toggles: Cmd+. (or Ctrl+.)
 * Hides: layers panel, right pane, toolbar, page tabs, zoom controls, rulers, minimap
 * Shows: minimal floating "Exit Focus" button
 */

import type { Editor } from "../editor";

let active = false;
let exitBtn: HTMLElement | null = null;

const HIDDEN_SELECTORS = [
  "#layers-panel",
  "#right-pane",
  "#bottom-toolbar",
  ".page-tabs",
  ".zoom-controls",
  ".minimap-wrapper",
  ".ruler-h",
  ".ruler-v",
  ".ruler-corner",
  ".file-menu-btn",
];

export function isFocusMode(): boolean {
  return active;
}

export function toggleFocusMode(editor: Editor): void {
  if (active) {
    exitFocusMode(editor);
  } else {
    enterFocusMode(editor);
  }
}

function enterFocusMode(_editor: Editor): void {
  if (active) return;
  active = true;

  // Hide all UI elements
  for (const sel of HIDDEN_SELECTORS) {
    const els = document.querySelectorAll<HTMLElement>(sel);
    els.forEach((el) => {
      el.dataset.focusHidden = el.style.display || "";
      el.style.display = "none";
    });
  }

  // Create minimal exit button
  exitBtn = document.createElement("div");
  exitBtn.id = "focus-mode-exit";
  exitBtn.innerHTML = `
    <button title="Exit Focus Mode (${navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}+.)">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 3H5a2 2 0 0 0-2 2v3"/>
        <path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
        <path d="M3 16v3a2 2 0 0 0 2 2h3"/>
        <path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
      </svg>
    </button>
  `;
  Object.assign(exitBtn.style, {
    position: "absolute",
    top: "12px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: "30",
    opacity: "0",
    transition: "opacity 0.2s ease",
    pointerEvents: "none",
  });

  const btn = exitBtn.querySelector("button") as HTMLButtonElement;
  Object.assign(btn.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "36px",
    height: "36px",
    border: "none",
    borderRadius: "10px",
    background: "rgba(30,30,30,0.85)",
    color: "#888",
    cursor: "pointer",
    backdropFilter: "blur(8px)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.06)",
    transition: "all 0.15s",
  });

  btn.addEventListener("mouseenter", () => {
    btn.style.color = "#fff";
    btn.style.background = "rgba(50,50,50,0.95)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.color = "#888";
    btn.style.background = "rgba(30,30,30,0.85)";
  });
  btn.addEventListener("click", () => exitFocusMode(_editor));

  document.body.appendChild(exitBtn);

  // Show on mouse move near top
  const onMove = (e: MouseEvent) => {
    if (!exitBtn) return;
    if (e.clientY < 60) {
      exitBtn.style.opacity = "1";
      exitBtn.style.pointerEvents = "auto";
    } else {
      exitBtn.style.opacity = "0";
      exitBtn.style.pointerEvents = "none";
    }
  };
  document.addEventListener("mousemove", onMove);
  (exitBtn as any)._cleanup = () => document.removeEventListener("mousemove", onMove);

  // Briefly flash the button so user knows it's there
  setTimeout(() => {
    if (exitBtn) {
      exitBtn.style.opacity = "1";
      exitBtn.style.pointerEvents = "auto";
    }
  }, 100);
  setTimeout(() => {
    if (exitBtn && active) {
      exitBtn.style.opacity = "0";
      exitBtn.style.pointerEvents = "none";
    }
  }, 2000);
}

function exitFocusMode(_editor: Editor): void {
  if (!active) return;
  active = false;

  // Restore all hidden elements
  for (const sel of HIDDEN_SELECTORS) {
    const els = document.querySelectorAll<HTMLElement>(sel);
    els.forEach((el) => {
      const prev = el.dataset.focusHidden;
      if (prev !== undefined) {
        el.style.display = prev || "";
        delete el.dataset.focusHidden;
      }
    });
  }

  // Remove exit button
  if (exitBtn) {
    if ((exitBtn as any)._cleanup) (exitBtn as any)._cleanup();
    exitBtn.remove();
    exitBtn = null;
  }
}
