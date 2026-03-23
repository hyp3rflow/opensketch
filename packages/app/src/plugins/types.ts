/**
 * OpenSketch Plugin API Type Definitions
 */

import type { Editor } from "../editor";

// ── Plugin interface ──

export interface Plugin {
  id: string;
  name: string;
  version: string;
  description?: string;
  icon?: string; // SVG string
  activate(api: PluginAPI): void | Promise<void>;
  deactivate(): void | Promise<void>;
}

// ── UI Extension Points ──

export interface PluginPanel {
  id: string;
  title: string;
  icon?: string;
  render(container: HTMLElement): void;
  destroy?(): void;
}

export interface PluginToolbarButton {
  id: string;
  title: string;
  icon: string; // SVG string
  onClick(): void;
}

export interface PluginMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  onClick(): void;
}

export interface PluginCommand {
  id: string;
  label: string;
  execute(): void;
}

// ── Event types ──

export type PluginEventMap = {
  "selection:change": number[];
  "layers:change": void;
  "node:create": number;
  "node:delete": number;
  "tool:change": string;
  "save": void;
};

export type PluginEventName = keyof PluginEventMap;

// ── Plugin API (passed to activate) ──

export interface PluginAPI {
  // Editor access
  readonly editor: Editor;

  // Scene operations (safe wrappers)
  scene: {
    getNodeJson(id: number): any | null;
    getSceneJson(): any;
    getSelection(): number[];
    addRect(x: number, y: number, w: number, h: number): number;
    addEllipse(x: number, y: number, w: number, h: number): number;
    addText(x: number, y: number, content: string, fontSize?: number): number;
    addFrame(x: number, y: number, w: number, h: number, name?: string): number;
    removeNode(id: number): void;
    setFill(id: number, r: number, g: number, b: number, a?: number): void;
    setPosition(id: number, x: number, y: number): void;
    setSize(id: number, w: number, h: number): void;
    setName(id: number, name: string): void;
    select(id: number): void;
    deselectAll(): void;
  };

  // UI extensions
  ui: {
    registerPanel(panel: PluginPanel): void;
    unregisterPanel(id: string): void;
    addToolbarButton(button: PluginToolbarButton): void;
    removeToolbarButton(id: string): void;
    addMenuItem(item: PluginMenuItem): void;
    removeMenuItem(id: string): void;
    registerCommand(cmd: PluginCommand): void;
    showNotification(message: string, type?: "info" | "success" | "error"): void;
  };

  // Events
  on<K extends PluginEventName>(event: K, handler: (data: PluginEventMap[K]) => void): void;
  off<K extends PluginEventName>(event: K, handler: (data: PluginEventMap[K]) => void): void;
}
