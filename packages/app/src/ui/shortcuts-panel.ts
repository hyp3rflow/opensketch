/**
 * Keyboard Shortcuts Panel — Figma-style modal overlay
 * Toggle with Cmd+/ or ?
 */

interface ShortcutEntry {
  keys: string[];
  description: string;
}

interface ShortcutCategory {
  name: string;
  shortcuts: ShortcutEntry[];
}

const SHORTCUT_DATA: ShortcutCategory[] = [
  {
    name: "Tools",
    shortcuts: [
      { keys: ["V"], description: "Select / Move" },
      { keys: ["H"], description: "Hand (pan)" },
      { keys: ["R"], description: "Rectangle" },
      { keys: ["O"], description: "Ellipse" },
      { keys: ["T"], description: "Text" },
      { keys: ["F"], description: "Frame" },
      { keys: ["I"], description: "Image" },
      { keys: ["P"], description: "Pen" },
      { keys: ["S"], description: "Star" },
      { keys: ["G"], description: "Polygon" },
    ],
  },
  {
    name: "Edit",
    shortcuts: [
      { keys: ["⌘", "Z"], description: "Undo" },
      { keys: ["⌘", "⇧", "Z"], description: "Redo" },
      { keys: ["⌘", "C"], description: "Copy" },
      { keys: ["⌘", "X"], description: "Cut" },
      { keys: ["⌘", "V"], description: "Paste" },
      { keys: ["⌘", "D"], description: "Duplicate" },
      { keys: ["⌘", "S"], description: "Save" },
      { keys: ["Del"], description: "Delete selected" },
    ],
  },
  {
    name: "View",
    shortcuts: [
      { keys: ["⌘", "0"], description: "Zoom to 100%" },
      { keys: ["⌘", "1"], description: "Zoom to fit" },
      { keys: ["⌘", "2"], description: "Zoom to selection" },
      { keys: ["+"], description: "Zoom in" },
      { keys: ["-"], description: "Zoom out" },
      { keys: ["Space"], description: "Hold to pan" },
      { keys: ["Scroll"], description: "Pan canvas" },
      { keys: ["⌘", "Scroll"], description: "Zoom" },
      { keys: ["⌘", "G"], description: "Toggle layout grid" },
    ],
  },
  {
    name: "Selection",
    shortcuts: [
      { keys: ["Esc"], description: "Deselect all / Exit mode" },
      { keys: ["⇧", "Click"], description: "Add to selection" },
      { keys: ["Drag"], description: "Marquee select" },
      { keys: ["Dbl-click"], description: "Edit text / Enter path" },
    ],
  },
  {
    name: "Boolean & Transform",
    shortcuts: [
      { keys: ["⌘", "⇧", "U"], description: "Union" },
      { keys: ["⌘", "⇧", "S"], description: "Subtract" },
      { keys: ["⌘", "⇧", "I"], description: "Intersect" },
      { keys: ["⌘", "⇧", "X"], description: "Exclude" },
      { keys: ["⌘", "E"], description: "Flatten to path" },
    ],
  },
  {
    name: "Pen Tool",
    shortcuts: [
      { keys: ["Enter"], description: "Finish path" },
      { keys: ["Esc"], description: "Cancel / finish path" },
      { keys: ["Alt", "Drag"], description: "Break handle symmetry" },
    ],
  },
];

let overlayEl: HTMLElement | null = null;

export function isShortcutsPanelVisible(): boolean {
  return overlayEl !== null;
}

export function toggleShortcutsPanel() {
  if (overlayEl) {
    closeShortcutsPanel();
  } else {
    openShortcutsPanel();
  }
}

export function closeShortcutsPanel() {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}

function openShortcutsPanel() {
  if (overlayEl) return;

  // Backdrop
  const backdrop = document.createElement("div");
  backdrop.className = "shortcuts-backdrop";
  backdrop.addEventListener("click", closeShortcutsPanel);

  // Modal
  const modal = document.createElement("div");
  modal.className = "shortcuts-modal";

  // Header
  const header = document.createElement("div");
  header.className = "shortcuts-header";
  header.innerHTML = `
    <span class="shortcuts-title">Keyboard Shortcuts</span>
    <button class="shortcuts-close" title="Close (Esc)">✕</button>
  `;
  header.querySelector(".shortcuts-close")!.addEventListener("click", closeShortcutsPanel);
  modal.appendChild(header);

  // Search
  const searchWrap = document.createElement("div");
  searchWrap.className = "shortcuts-search-wrap";
  const searchInput = document.createElement("input");
  searchInput.className = "shortcuts-search";
  searchInput.placeholder = "Search shortcuts…";
  searchInput.type = "text";
  searchWrap.appendChild(searchInput);
  modal.appendChild(searchWrap);

  // Content
  const content = document.createElement("div");
  content.className = "shortcuts-content";
  modal.appendChild(content);

  function renderCategories(filter: string) {
    content.innerHTML = "";
    const q = filter.toLowerCase().trim();
    let hasResults = false;

    for (const cat of SHORTCUT_DATA) {
      const filtered = q
        ? cat.shortcuts.filter(
            (s) =>
              s.description.toLowerCase().includes(q) ||
              s.keys.join(" ").toLowerCase().includes(q)
          )
        : cat.shortcuts;

      if (filtered.length === 0) continue;
      hasResults = true;

      const section = document.createElement("div");
      section.className = "shortcuts-section";

      const heading = document.createElement("div");
      heading.className = "shortcuts-section-title";
      heading.textContent = cat.name;
      section.appendChild(heading);

      for (const sc of filtered) {
        const row = document.createElement("div");
        row.className = "shortcuts-row";

        const desc = document.createElement("span");
        desc.className = "shortcuts-desc";
        desc.textContent = sc.description;

        const keys = document.createElement("span");
        keys.className = "shortcuts-keys";
        for (const k of sc.keys) {
          const kbd = document.createElement("kbd");
          kbd.textContent = k;
          keys.appendChild(kbd);
        }

        row.appendChild(desc);
        row.appendChild(keys);
        section.appendChild(row);
      }

      content.appendChild(section);
    }

    if (!hasResults) {
      const empty = document.createElement("div");
      empty.className = "shortcuts-empty";
      empty.textContent = "No shortcuts found";
      content.appendChild(empty);
    }
  }

  renderCategories("");
  searchInput.addEventListener("input", () => renderCategories(searchInput.value));

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  overlayEl = backdrop;

  // Focus search
  requestAnimationFrame(() => searchInput.focus());

  // ESC to close (handled at backdrop level)
  backdrop.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeShortcutsPanel();
    }
  });
}
