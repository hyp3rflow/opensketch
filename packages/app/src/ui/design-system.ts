import type { Editor } from "../editor";
import { icons } from "./icons";

export interface ColorToken {
  name: string;
  hex: string;
}

export interface TypographyToken {
  name: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  lineHeight: number;
}

export interface SpacingToken {
  name: string;
  value: number;
}

export interface DesignSystem {
  name: string;
  colors: ColorToken[];
  typography: TypographyToken[];
  spacing: SpacingToken[];
}

const DEFAULT_SYSTEM: DesignSystem = {
  name: "Default",
  colors: [
    // Neutral
    { name: "White", hex: "#FFFFFF" },
    { name: "Gray 50", hex: "#F9FAFB" },
    { name: "Gray 100", hex: "#F3F4F6" },
    { name: "Gray 200", hex: "#E5E7EB" },
    { name: "Gray 300", hex: "#D1D5DB" },
    { name: "Gray 400", hex: "#9CA3AF" },
    { name: "Gray 500", hex: "#6B7280" },
    { name: "Gray 600", hex: "#4B5563" },
    { name: "Gray 700", hex: "#374151" },
    { name: "Gray 800", hex: "#1F2937" },
    { name: "Gray 900", hex: "#111827" },
    { name: "Black", hex: "#000000" },
    // Primary
    { name: "Primary 50", hex: "#EEF2FF" },
    { name: "Primary 100", hex: "#E0E7FF" },
    { name: "Primary 200", hex: "#C7D2FE" },
    { name: "Primary 300", hex: "#A5B4FC" },
    { name: "Primary 400", hex: "#818CF8" },
    { name: "Primary 500", hex: "#6366F1" },
    { name: "Primary 600", hex: "#4F46E5" },
    { name: "Primary 700", hex: "#4338CA" },
    // Semantic
    { name: "Success", hex: "#10B981" },
    { name: "Warning", hex: "#F59E0B" },
    { name: "Error", hex: "#EF4444" },
    { name: "Info", hex: "#3B82F6" },
  ],
  typography: [
    { name: "Display", fontFamily: "Inter", fontSize: 48, fontWeight: "700", lineHeight: 1.1 },
    { name: "H1", fontFamily: "Inter", fontSize: 36, fontWeight: "700", lineHeight: 1.2 },
    { name: "H2", fontFamily: "Inter", fontSize: 28, fontWeight: "600", lineHeight: 1.25 },
    { name: "H3", fontFamily: "Inter", fontSize: 22, fontWeight: "600", lineHeight: 1.3 },
    { name: "H4", fontFamily: "Inter", fontSize: 18, fontWeight: "600", lineHeight: 1.35 },
    { name: "Body L", fontFamily: "Inter", fontSize: 18, fontWeight: "400", lineHeight: 1.5 },
    { name: "Body", fontFamily: "Inter", fontSize: 16, fontWeight: "400", lineHeight: 1.5 },
    { name: "Body S", fontFamily: "Inter", fontSize: 14, fontWeight: "400", lineHeight: 1.5 },
    { name: "Caption", fontFamily: "Inter", fontSize: 12, fontWeight: "400", lineHeight: 1.4 },
    { name: "Overline", fontFamily: "Inter", fontSize: 11, fontWeight: "600", lineHeight: 1.4 },
    { name: "Code", fontFamily: "SF Mono", fontSize: 14, fontWeight: "400", lineHeight: 1.5 },
  ],
  spacing: [
    { name: "2xs", value: 2 },
    { name: "xs", value: 4 },
    { name: "sm", value: 8 },
    { name: "md", value: 12 },
    { name: "lg", value: 16 },
    { name: "xl", value: 24 },
    { name: "2xl", value: 32 },
    { name: "3xl", value: 48 },
    { name: "4xl", value: 64 },
  ],
};

let currentSystem: DesignSystem = loadSystem();

function loadSystem(): DesignSystem {
  try {
    const raw = localStorage.getItem("opensketch-design-system");
    if (raw) return JSON.parse(raw);
  } catch {}
  return structuredClone(DEFAULT_SYSTEM);
}

function saveSystem() {
  localStorage.setItem("opensketch-design-system", JSON.stringify(currentSystem));
}

export function getDesignSystem(): DesignSystem {
  return currentSystem;
}

export function setupDesignSystemPanel(container: HTMLElement, editor: Editor) {
  let activeTab: "colors" | "typography" | "spacing" = "colors";

  function render() {
    container.innerHTML = "";

    // Header
    const header = document.createElement("div");
    header.className = "ds-header";
    header.innerHTML = `<span class="ds-title">Design System</span>`;
    container.appendChild(header);

    // System name
    const nameRow = document.createElement("div");
    nameRow.className = "ds-name-row";
    const nameInput = document.createElement("input");
    nameInput.className = "prop-input";
    nameInput.value = currentSystem.name;
    nameInput.style.cssText = "font-size:13px;font-weight:500;";
    nameInput.addEventListener("change", () => {
      currentSystem.name = nameInput.value;
      saveSystem();
    });
    nameRow.appendChild(nameInput);
    container.appendChild(nameRow);

    // Tabs
    const tabs = document.createElement("div");
    tabs.className = "ds-tabs";
    (["colors", "typography", "spacing"] as const).forEach((tab) => {
      const btn = document.createElement("button");
      btn.className = "ds-tab" + (activeTab === tab ? " active" : "");
      btn.textContent = tab === "colors" ? "Colors" : tab === "typography" ? "Type" : "Space";
      btn.addEventListener("click", () => { activeTab = tab; render(); });
      tabs.appendChild(btn);
    });
    container.appendChild(tabs);

    // Content
    const content = document.createElement("div");
    content.className = "ds-content";

    if (activeTab === "colors") renderColors(content, editor);
    else if (activeTab === "typography") renderTypography(content, editor);
    else renderSpacing(content, editor);

    container.appendChild(content);
  }

  render();
}

function renderColors(container: HTMLElement, editor: Editor) {
  const grid = document.createElement("div");
  grid.className = "ds-color-grid";

  currentSystem.colors.forEach((token, i) => {
    const swatch = document.createElement("div");
    swatch.className = "ds-color-swatch";
    swatch.title = `${token.name}\n${token.hex}`;
    swatch.style.background = token.hex;
    if (token.hex === "#FFFFFF" || token.hex === "#F9FAFB" || token.hex === "#F3F4F6") {
      swatch.style.border = "1px solid #3a3a3a";
    }

    // Click to apply fill to selection
    swatch.addEventListener("click", () => {
      const sel = editor.engine.get_selection();
      if (sel.length > 0) {
        const [r, g, b] = hexToRgb(token.hex);
        for (const id of sel) {
          editor.engine.set_fill_color(id, r, g, b, 1.0);
        }
        editor.requestRender();
      }
    });

    // Right-click to apply stroke
    swatch.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const sel = editor.engine.get_selection();
      if (sel.length > 0) {
        const [r, g, b] = hexToRgb(token.hex);
        for (const id of sel) {
          editor.engine.set_stroke(id, r, g, b, 1.0, 1);
        }
        editor.requestRender();
      }
    });

    grid.appendChild(swatch);
  });

  container.appendChild(grid);

  // Add color button
  const addBtn = document.createElement("button");
  addBtn.className = "prop-add-btn";
  addBtn.textContent = "+ Add color";
  addBtn.style.marginTop = "8px";
  addBtn.addEventListener("click", () => {
    currentSystem.colors.push({ name: `Color ${currentSystem.colors.length + 1}`, hex: "#6366F1" });
    saveSystem();
    renderColors(container, editor);
  });
  container.appendChild(addBtn);

  // Label
  const hint = document.createElement("div");
  hint.className = "ds-hint";
  hint.textContent = "Click → fill · Right-click → stroke";
  container.appendChild(hint);
}

function renderTypography(container: HTMLElement, editor: Editor) {
  currentSystem.typography.forEach((token) => {
    const item = document.createElement("div");
    item.className = "ds-type-item";
    item.title = `${token.fontFamily} ${token.fontWeight} ${token.fontSize}px`;

    const preview = document.createElement("span");
    preview.className = "ds-type-preview";
    preview.textContent = token.name;
    preview.style.cssText = `font-family:${token.fontFamily},system-ui;font-size:${Math.min(token.fontSize, 20)}px;font-weight:${token.fontWeight};`;

    const meta = document.createElement("span");
    meta.className = "ds-type-meta";
    meta.textContent = `${token.fontFamily} · ${token.fontWeight} · ${token.fontSize}`;

    item.appendChild(preview);
    item.appendChild(meta);

    // Click to apply to selected text node
    item.addEventListener("click", () => {
      const sel = editor.engine.get_selection();
      for (const id of sel) {
        const json = editor.engine.get_node_json(id);
        if (!json) continue;
        const node = JSON.parse(json);
        if (typeof node.kind === "object" && node.kind.Text) {
          editor.engine.set_font_family(id, token.fontFamily);
          editor.engine.set_font_size(id, token.fontSize);
        }
      }
      editor.requestRender();
    });

    container.appendChild(item);
  });

  // Add typography button
  const addBtn = document.createElement("button");
  addBtn.className = "prop-add-btn";
  addBtn.textContent = "+ Add style";
  addBtn.style.marginTop = "8px";
  addBtn.addEventListener("click", () => {
    currentSystem.typography.push({
      name: `Style ${currentSystem.typography.length + 1}`,
      fontFamily: "Inter", fontSize: 16, fontWeight: "400", lineHeight: 1.5,
    });
    saveSystem();
    container.innerHTML = "";
    renderTypography(container, editor);
  });
  container.appendChild(addBtn);
}

function renderSpacing(container: HTMLElement, editor: Editor) {
  currentSystem.spacing.forEach((token) => {
    const item = document.createElement("div");
    item.className = "ds-spacing-item";

    const label = document.createElement("span");
    label.className = "ds-spacing-label";
    label.textContent = token.name;

    const bar = document.createElement("div");
    bar.className = "ds-spacing-bar";
    bar.style.width = `${Math.min(token.value * 2, 200)}px`;

    const val = document.createElement("span");
    val.className = "ds-spacing-value";
    val.textContent = `${token.value}px`;

    item.appendChild(label);
    item.appendChild(bar);
    item.appendChild(val);
    container.appendChild(item);
  });

  const addBtn = document.createElement("button");
  addBtn.className = "prop-add-btn";
  addBtn.textContent = "+ Add spacing";
  addBtn.style.marginTop = "8px";
  addBtn.addEventListener("click", () => {
    currentSystem.spacing.push({ name: `space-${currentSystem.spacing.length + 1}`, value: 16 });
    saveSystem();
    container.innerHTML = "";
    renderSpacing(container, editor);
  });
  container.appendChild(addBtn);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
