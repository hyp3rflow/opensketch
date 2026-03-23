/**
 * OpenSketch Plugin Manager
 * Manages plugin lifecycle: register, activate, deactivate, unregister
 */

import type { Editor } from "../editor";
import type {
  Plugin, PluginAPI, PluginPanel, PluginToolbarButton, PluginMenuItem,
  PluginCommand, PluginEventName, PluginEventMap,
} from "./types";

interface PluginState {
  plugin: Plugin;
  active: boolean;
  api: PluginAPIImpl | null;
}

// ── PluginAPI Implementation ──

class PluginAPIImpl implements PluginAPI {
  readonly editor: Editor;
  readonly scene: PluginAPI["scene"];
  readonly ui: PluginAPI["ui"];
  private _listeners: Map<string, Set<Function>> = new Map();
  private _panels: string[] = [];
  private _buttons: string[] = [];
  private _menuItems: string[] = [];
  private _commands: string[] = [];
  private _manager: PluginManager;
  private _pluginId: string;

  constructor(editor: Editor, manager: PluginManager, pluginId: string) {
    this.editor = editor;
    this._manager = manager;
    this._pluginId = pluginId;

    const eng = editor.engine;

    this.scene = {
      getNodeJson(id: number) {
        const json = eng.get_node_json(BigInt(id));
        return json ? JSON.parse(json) : null;
      },
      getSceneJson() {
        return JSON.parse(eng.get_scene_json());
      },
      getSelection() {
        return Array.from(eng.get_selection()).map(Number);
      },
      addRect(x, y, w, h) {
        const id = Number(eng.add_rect(x, y, w, h));
        editor.requestRender();
        manager._emitEvent("node:create", id);
        return id;
      },
      addEllipse(x, y, w, h) {
        const id = Number(eng.add_ellipse(x, y, w, h));
        editor.requestRender();
        manager._emitEvent("node:create", id);
        return id;
      },
      addText(x, y, content, fontSize = 16) {
        const id = Number(eng.add_text(x, y, content, fontSize));
        editor.requestRender();
        manager._emitEvent("node:create", id);
        return id;
      },
      addFrame(x, y, w, h, name) {
        const id = Number(eng.add_frame(x, y, w, h));
        if (name) eng.rename_node(BigInt(id), name);
        editor.requestRender();
        manager._emitEvent("node:create", id);
        return id;
      },
      removeNode(id) {
        eng.remove_node(BigInt(id));
        editor.requestRender();
        manager._emitEvent("node:delete", id);
      },
      setFill(id, r, g, b, a = 1) {
        eng.set_fill_color(BigInt(id), r, g, b, a);
        editor.requestRender();
      },
      setPosition(id, x, y) {
        eng.set_node_position(BigInt(id), x, y);
        editor.requestRender();
      },
      setSize(id, w, h) {
        eng.resize_node(BigInt(id), w, h);
        editor.requestRender();
      },
      setName(id, name) {
        eng.set_node_name(BigInt(id), name);
        editor.requestRender();
      },
      select(id) {
        eng.deselect_all();
        eng.select(BigInt(id));
        editor.notifySelectionChanged([id]);
        editor.requestRender();
      },
      deselectAll() {
        eng.deselect_all();
        editor.notifySelectionChanged([]);
        editor.requestRender();
      },
    };

    const self = this;
    this.ui = {
      registerPanel(panel: PluginPanel) {
        self._panels.push(panel.id);
        manager._registerPanel(self._pluginId, panel);
      },
      unregisterPanel(id: string) {
        manager._unregisterPanel(id);
        self._panels = self._panels.filter(p => p !== id);
      },
      addToolbarButton(button: PluginToolbarButton) {
        self._buttons.push(button.id);
        manager._addToolbarButton(self._pluginId, button);
      },
      removeToolbarButton(id: string) {
        manager._removeToolbarButton(id);
        self._buttons = self._buttons.filter(b => b !== id);
      },
      addMenuItem(item: PluginMenuItem) {
        self._menuItems.push(item.id);
        manager._addMenuItem(self._pluginId, item);
      },
      removeMenuItem(id: string) {
        manager._removeMenuItem(id);
        self._menuItems = self._menuItems.filter(m => m !== id);
      },
      registerCommand(cmd: PluginCommand) {
        self._commands.push(cmd.id);
        manager._registerCommand(self._pluginId, cmd);
      },
      showNotification(message: string, type: "info" | "success" | "error" = "info") {
        manager._showNotification(message, type);
      },
    };
  }

  on<K extends PluginEventName>(event: K, handler: (data: PluginEventMap[K]) => void): void {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event)!.add(handler);
    this._manager._addEventListener(event, handler as Function);
  }

  off<K extends PluginEventName>(event: K, handler: (data: PluginEventMap[K]) => void): void {
    this._listeners.get(event)?.delete(handler);
    this._manager._removeEventListener(event, handler as Function);
  }

  /** Cleanup all registrations when plugin deactivates */
  _cleanup() {
    // Remove all event listeners
    for (const [event, handlers] of this._listeners) {
      for (const h of handlers) this._manager._removeEventListener(event, h);
    }
    this._listeners.clear();
    // Remove UI registrations
    for (const id of this._panels) this._manager._unregisterPanel(id);
    for (const id of this._buttons) this._manager._removeToolbarButton(id);
    for (const id of this._menuItems) this._manager._removeMenuItem(id);
    this._panels = [];
    this._buttons = [];
    this._menuItems = [];
    this._commands = [];
  }
}

// ── Plugin Manager ──

export class PluginManager {
  private _editor: Editor;
  private _plugins: Map<string, PluginState> = new Map();
  private _eventListeners: Map<string, Set<Function>> = new Map();

  // UI registrations (observable by UI components)
  private _panels: Map<string, { pluginId: string; panel: PluginPanel }> = new Map();
  private _toolbarButtons: Map<string, { pluginId: string; button: PluginToolbarButton }> = new Map();
  private _menuItems: Map<string, { pluginId: string; item: PluginMenuItem }> = new Map();
  private _commands: Map<string, { pluginId: string; cmd: PluginCommand }> = new Map();
  private _onUIChange: (() => void)[] = [];

  constructor(editor: Editor) {
    this._editor = editor;
    this._setupEditorEvents();
  }

  private _setupEditorEvents() {
    this._editor.onSelection((ids) => this._emitEvent("selection:change", ids));
    this._editor.onLayers(() => this._emitEvent("layers:change", undefined as any));
    this._editor.onSave(() => this._emitEvent("save", undefined as any));
  }

  // ── Public API ──

  register(plugin: Plugin): void {
    if (this._plugins.has(plugin.id)) {
      console.warn(`[PluginManager] Plugin "${plugin.id}" already registered`);
      return;
    }
    this._plugins.set(plugin.id, { plugin, active: false, api: null });
  }

  async activate(pluginId: string): Promise<void> {
    const state = this._plugins.get(pluginId);
    if (!state) throw new Error(`Plugin "${pluginId}" not registered`);
    if (state.active) return;

    const api = new PluginAPIImpl(this._editor, this, pluginId);
    state.api = api;
    try {
      await state.plugin.activate(api);
      state.active = true;
      console.log(`[PluginManager] Activated: ${state.plugin.name} v${state.plugin.version}`);
    } catch (e) {
      api._cleanup();
      state.api = null;
      console.error(`[PluginManager] Failed to activate "${pluginId}":`, e);
    }
  }

  async deactivate(pluginId: string): Promise<void> {
    const state = this._plugins.get(pluginId);
    if (!state || !state.active) return;

    try {
      await state.plugin.deactivate();
    } catch (e) {
      console.error(`[PluginManager] Error deactivating "${pluginId}":`, e);
    }
    state.api?._cleanup();
    state.api = null;
    state.active = false;
    this._notifyUIChange();
    console.log(`[PluginManager] Deactivated: ${state.plugin.name}`);
  }

  async unregister(pluginId: string): Promise<void> {
    await this.deactivate(pluginId);
    this._plugins.delete(pluginId);
  }

  list(): { id: string; name: string; version: string; active: boolean; description?: string }[] {
    return Array.from(this._plugins.values()).map(s => ({
      id: s.plugin.id,
      name: s.plugin.name,
      version: s.plugin.version,
      active: s.active,
      description: s.plugin.description,
    }));
  }

  isActive(pluginId: string): boolean {
    return this._plugins.get(pluginId)?.active ?? false;
  }

  // ── UI getters ──

  getPanels(): PluginPanel[] {
    return Array.from(this._panels.values()).map(p => p.panel);
  }

  getToolbarButtons(): PluginToolbarButton[] {
    return Array.from(this._toolbarButtons.values()).map(b => b.button);
  }

  getMenuItems(): PluginMenuItem[] {
    return Array.from(this._menuItems.values()).map(m => m.item);
  }

  getCommands(): PluginCommand[] {
    return Array.from(this._commands.values()).map(c => c.cmd);
  }

  onUIChange(fn: () => void) {
    this._onUIChange.push(fn);
  }

  // ── Internal: UI registration ──

  _registerPanel(pluginId: string, panel: PluginPanel) {
    this._panels.set(panel.id, { pluginId, panel });
    this._notifyUIChange();
  }

  _unregisterPanel(id: string) {
    const entry = this._panels.get(id);
    if (entry) {
      entry.panel.destroy?.();
      this._panels.delete(id);
      this._notifyUIChange();
    }
  }

  _addToolbarButton(pluginId: string, button: PluginToolbarButton) {
    this._toolbarButtons.set(button.id, { pluginId, button });
    this._notifyUIChange();
  }

  _removeToolbarButton(id: string) {
    this._toolbarButtons.delete(id);
    this._notifyUIChange();
  }

  _addMenuItem(pluginId: string, item: PluginMenuItem) {
    this._menuItems.set(item.id, { pluginId, item });
    this._notifyUIChange();
  }

  _removeMenuItem(id: string) {
    this._menuItems.delete(id);
    this._notifyUIChange();
  }

  _registerCommand(pluginId: string, cmd: PluginCommand) {
    this._commands.set(cmd.id, { pluginId, cmd });
  }

  _showNotification(message: string, type: "info" | "success" | "error") {
    const el = document.createElement("div");
    el.className = `plugin-notification plugin-notification-${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }

  // ── Internal: Events ──

  _emitEvent(event: string, data: any) {
    this._eventListeners.get(event)?.forEach(fn => {
      try { fn(data); } catch (e) { console.error(`[Plugin event ${event}]:`, e); }
    });
  }

  _addEventListener(event: string, handler: Function) {
    if (!this._eventListeners.has(event)) this._eventListeners.set(event, new Set());
    this._eventListeners.get(event)!.add(handler);
  }

  _removeEventListener(event: string, handler: Function) {
    this._eventListeners.get(event)?.delete(handler);
  }

  private _notifyUIChange() {
    this._onUIChange.forEach(fn => fn());
  }
}
