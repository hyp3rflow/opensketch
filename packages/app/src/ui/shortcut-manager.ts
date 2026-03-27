/**
 * Keyboard Shortcut Manager — customizable key bindings with conflict detection
 * Stores overrides in localStorage, provides match API for the editor.
 */

export interface KeyBinding {
  key: string;          // e.g. "z", "Delete", "Space", "ArrowUp"
  meta?: boolean;       // Cmd/Ctrl
  shift?: boolean;
  alt?: boolean;
}

export interface ShortcutDef {
  id: string;
  category: string;
  description: string;
  defaultBinding: KeyBinding;
  /** If true, shortcut cannot be rebound */
  locked?: boolean;
}

const STORAGE_KEY = "opensketch-custom-shortcuts";

// ── Default shortcut definitions ──────────────────────────────────────
const DEFAULTS: ShortcutDef[] = [
  // Tools
  { id: "tool.select",   category: "Tools", description: "Select / Move",  defaultBinding: { key: "v" } },
  { id: "tool.hand",     category: "Tools", description: "Hand (pan)",     defaultBinding: { key: "h" } },
  { id: "tool.rect",     category: "Tools", description: "Rectangle",      defaultBinding: { key: "r" } },
  { id: "tool.ellipse",  category: "Tools", description: "Ellipse",        defaultBinding: { key: "o" } },
  { id: "tool.text",     category: "Tools", description: "Text",           defaultBinding: { key: "t" } },
  { id: "tool.frame",    category: "Tools", description: "Frame",          defaultBinding: { key: "f" } },
  { id: "tool.image",    category: "Tools", description: "Image",          defaultBinding: { key: "i" } },
  { id: "tool.pen",      category: "Tools", description: "Pen",            defaultBinding: { key: "p" } },
  { id: "tool.star",     category: "Tools", description: "Star",           defaultBinding: { key: "s" } },
  { id: "tool.polygon",  category: "Tools", description: "Polygon",        defaultBinding: { key: "g" } },
  { id: "tool.sticky",   category: "Tools", description: "Sticky note",    defaultBinding: { key: "n" } },
  { id: "tool.table",    category: "Tools", description: "Table",          defaultBinding: { key: "b" } },
  { id: "tool.slice",    category: "Tools", description: "Slice",          defaultBinding: { key: "k" } },
  { id: "tool.connector",category: "Tools", description: "Connector",      defaultBinding: { key: "l" } },
  { id: "tool.section",  category: "Tools", description: "Section",        defaultBinding: { key: "s", shift: true } },

  // Edit
  { id: "edit.undo",       category: "Edit", description: "Undo",          defaultBinding: { key: "z", meta: true } },
  { id: "edit.redo",       category: "Edit", description: "Redo",          defaultBinding: { key: "z", meta: true, shift: true } },
  { id: "edit.copy",       category: "Edit", description: "Copy",          defaultBinding: { key: "c", meta: true } },
  { id: "edit.cut",        category: "Edit", description: "Cut",           defaultBinding: { key: "x", meta: true } },
  { id: "edit.paste",      category: "Edit", description: "Paste",         defaultBinding: { key: "v", meta: true } },
  { id: "edit.duplicate",  category: "Edit", description: "Duplicate",     defaultBinding: { key: "d", meta: true } },
  { id: "edit.save",       category: "Edit", description: "Save",          defaultBinding: { key: "s", meta: true } },
  { id: "edit.delete",     category: "Edit", description: "Delete",        defaultBinding: { key: "Delete" } },
  { id: "edit.backspace",  category: "Edit", description: "Delete (Backspace)", defaultBinding: { key: "Backspace" } },
  { id: "edit.selectAll",  category: "Edit", description: "Select all",    defaultBinding: { key: "a", meta: true } },
  { id: "edit.flatten",    category: "Edit", description: "Flatten to path", defaultBinding: { key: "e", meta: true } },

  // View
  { id: "view.zoom100",      category: "View", description: "Zoom to 100%",     defaultBinding: { key: "0", meta: true } },
  { id: "view.zoomFit",      category: "View", description: "Zoom to fit",      defaultBinding: { key: "1", meta: true } },
  { id: "view.zoomSelection",category: "View", description: "Zoom to selection", defaultBinding: { key: "2", meta: true } },
  { id: "view.zoomIn",       category: "View", description: "Zoom in",          defaultBinding: { key: "=" } },
  { id: "view.zoomOut",      category: "View", description: "Zoom out",         defaultBinding: { key: "-" } },
  { id: "view.layoutGrid",   category: "View", description: "Toggle layout grid", defaultBinding: { key: "g", meta: true } },
  { id: "view.pixelPreview", category: "View", description: "Pixel preview",    defaultBinding: { key: "p", alt: true } },
  { id: "view.responsive",   category: "View", description: "Responsive preview", defaultBinding: { key: "r", meta: true, alt: true } },

  // Search & Panels
  { id: "panel.spotlight",     category: "Panels", description: "Node search spotlight", defaultBinding: { key: "k", meta: true } },
  { id: "panel.findReplace",   category: "Panels", description: "Find & Replace",       defaultBinding: { key: "f", meta: true } },
  { id: "panel.shortcuts",     category: "Panels", description: "Keyboard shortcuts",   defaultBinding: { key: "/", meta: true } },
  { id: "panel.codeToDesign",  category: "Panels", description: "Code to Design",       defaultBinding: { key: "d", meta: true, shift: true } },
  { id: "panel.batchExport",   category: "Panels", description: "Batch Export",         defaultBinding: { key: "e", meta: true, shift: true } },
  { id: "panel.smartSelect",   category: "Panels", description: "Smart Select",         defaultBinding: { key: "a", meta: true, shift: true } },
  { id: "panel.compLibrary",   category: "Panels", description: "Component Library",    defaultBinding: { key: "l", meta: true, alt: true } },
  { id: "panel.compAnalytics", category: "Panels", description: "Component Analytics",  defaultBinding: { key: "a", meta: true, alt: true } },
  { id: "panel.compSwap",      category: "Panels", description: "Component Swap",       defaultBinding: { key: "k", meta: true, shift: true } },
  { id: "panel.smartReplace",  category: "Panels", description: "Smart Replace",        defaultBinding: { key: "h", meta: true, shift: true } },
  { id: "panel.batchRename",   category: "Panels", description: "Batch Rename",         defaultBinding: { key: "r", meta: true, shift: true } },
  { id: "panel.aiLayout",      category: "Panels", description: "AI Layout Suggest",    defaultBinding: { key: "l", meta: true, shift: true } },
  { id: "panel.respTokens",    category: "Panels", description: "Responsive Tokens",    defaultBinding: { key: "t", meta: true, alt: true } },
  { id: "panel.recorder",      category: "Panels", description: "Canvas Recorder",      defaultBinding: { key: "r", shift: true, alt: true } },

  // Boolean
  { id: "bool.union",     category: "Boolean", description: "Union",     defaultBinding: { key: "u", meta: true, shift: true } },
  { id: "bool.subtract",  category: "Boolean", description: "Subtract",  defaultBinding: { key: "s", meta: true, shift: true } },
  { id: "bool.intersect", category: "Boolean", description: "Intersect", defaultBinding: { key: "i", meta: true, shift: true } },
  { id: "bool.exclude",   category: "Boolean", description: "Exclude",   defaultBinding: { key: "x", meta: true, shift: true } },

  // Misc
  { id: "misc.bookmark",    category: "Misc", description: "Toggle bookmark",   defaultBinding: { key: "b", meta: true, shift: true } },
  { id: "misc.cursorChat",  category: "Misc", description: "Cursor chat",       defaultBinding: { key: "/" } },
  { id: "misc.presentation",category: "Misc", description: "Presentation mode", defaultBinding: { key: "Enter", meta: true } },
  { id: "misc.comment",     category: "Misc", description: "Comment mode",      defaultBinding: { key: "c" } },
];

function bindingKey(b: KeyBinding): string {
  const parts: string[] = [];
  if (b.meta) parts.push("meta");
  if (b.shift) parts.push("shift");
  if (b.alt) parts.push("alt");
  parts.push(b.key.toLowerCase());
  return parts.join("+");
}

export class ShortcutManager {
  private defs: Map<string, ShortcutDef> = new Map();
  private overrides: Map<string, KeyBinding> = new Map();
  /** binding-key → action id for fast conflict lookup */
  private bindingIndex: Map<string, string> = new Map();

  constructor() {
    for (const d of DEFAULTS) {
      this.defs.set(d.id, d);
    }
    this.loadOverrides();
    this.rebuildIndex();
  }

  // ── Persistence ──
  private loadOverrides() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const obj = JSON.parse(raw) as Record<string, KeyBinding>;
        for (const [id, binding] of Object.entries(obj)) {
          if (this.defs.has(id)) {
            this.overrides.set(id, binding);
          }
        }
      }
    } catch { /* ignore */ }
  }

  private saveOverrides() {
    const obj: Record<string, KeyBinding> = {};
    this.overrides.forEach((v, k) => obj[k] = v);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  }

  private rebuildIndex() {
    this.bindingIndex.clear();
    for (const [id, def] of this.defs) {
      const b = this.overrides.get(id) ?? def.defaultBinding;
      this.bindingIndex.set(bindingKey(b), id);
    }
  }

  // ── Query ──
  getBinding(id: string): KeyBinding {
    return this.overrides.get(id) ?? this.defs.get(id)?.defaultBinding ?? { key: "" };
  }

  getDefault(id: string): KeyBinding | undefined {
    return this.defs.get(id)?.defaultBinding;
  }

  isCustom(id: string): boolean {
    return this.overrides.has(id);
  }

  getAllDefs(): ShortcutDef[] {
    return Array.from(this.defs.values());
  }

  getCategories(): string[] {
    const cats = new Set<string>();
    this.defs.forEach(d => cats.add(d.category));
    return Array.from(cats);
  }

  /** Check if a KeyboardEvent matches a specific action */
  matches(e: KeyboardEvent, actionId: string): boolean {
    const b = this.getBinding(actionId);
    if (!b.key) return false;
    const keyMatch = e.key.toLowerCase() === b.key.toLowerCase()
                  || e.code.toLowerCase() === b.key.toLowerCase();
    const metaMatch = !!b.meta === (e.metaKey || e.ctrlKey);
    const shiftMatch = !!b.shift === e.shiftKey;
    const altMatch = !!b.alt === e.altKey;
    return keyMatch && metaMatch && shiftMatch && altMatch;
  }

  // ── Mutation ──
  setBinding(id: string, binding: KeyBinding): { conflict?: string } {
    const bk = bindingKey(binding);
    const existing = this.bindingIndex.get(bk);
    if (existing && existing !== id) {
      return { conflict: existing };
    }
    this.overrides.set(id, binding);
    this.saveOverrides();
    this.rebuildIndex();
    return {};
  }

  resetBinding(id: string) {
    this.overrides.delete(id);
    this.saveOverrides();
    this.rebuildIndex();
  }

  resetAll() {
    this.overrides.clear();
    this.saveOverrides();
    this.rebuildIndex();
  }

  /** Export custom bindings as JSON string */
  exportJSON(): string {
    const obj: Record<string, KeyBinding> = {};
    this.overrides.forEach((v, k) => obj[k] = v);
    return JSON.stringify(obj, null, 2);
  }

  /** Import custom bindings from JSON string */
  importJSON(json: string): number {
    const obj = JSON.parse(json) as Record<string, KeyBinding>;
    let count = 0;
    for (const [id, binding] of Object.entries(obj)) {
      if (this.defs.has(id)) {
        this.overrides.set(id, binding);
        count++;
      }
    }
    this.saveOverrides();
    this.rebuildIndex();
    return count;
  }

  /** Find conflicts for a proposed binding */
  findConflict(binding: KeyBinding, excludeId?: string): string | undefined {
    const bk = bindingKey(binding);
    const existing = this.bindingIndex.get(bk);
    if (existing && existing !== excludeId) return existing;
    return undefined;
  }
}

// ── Singleton ──
let _instance: ShortcutManager | null = null;
export function getShortcutManager(): ShortcutManager {
  if (!_instance) _instance = new ShortcutManager();
  return _instance;
}

// ── Helpers ──
export function bindingToDisplayKeys(b: KeyBinding): string[] {
  const keys: string[] = [];
  if (b.meta) keys.push("⌘");
  if (b.shift) keys.push("⇧");
  if (b.alt) keys.push("⌥");
  // Pretty-print common keys
  const keyMap: Record<string, string> = {
    "delete": "Del", "backspace": "⌫", "enter": "↵", "escape": "Esc",
    "arrowup": "↑", "arrowdown": "↓", "arrowleft": "←", "arrowright": "→",
    " ": "Space", "space": "Space",
    "=": "+", "-": "−",
  };
  const display = keyMap[b.key.toLowerCase()] ?? b.key.toUpperCase();
  keys.push(display);
  return keys;
}

/** Capture a key event into a KeyBinding (for rebinding UI) */
export function eventToBinding(e: KeyboardEvent): KeyBinding | null {
  // Ignore bare modifier keys
  if (["Meta", "Control", "Shift", "Alt"].includes(e.key)) return null;
  return {
    key: e.key,
    meta: e.metaKey || e.ctrlKey || undefined,
    shift: e.shiftKey || undefined,
    alt: e.altKey || undefined,
  };
}
