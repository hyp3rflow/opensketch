# OpenSketch Plugin API

## Overview

The Plugin API provides an extensible system for adding custom tools, panels, toolbar buttons, menu items, and commands to OpenSketch. Plugins interact with the editor through a sandboxed `PluginAPI` interface.

## Architecture

```
Plugin (user code)
  ↓ activate(api)
PluginAPI (sandboxed interface)
  ↓ scene / ui / events
PluginManager (registry + lifecycle)
  ↓
Editor + Engine (core)
```

## Plugin Interface

```typescript
interface Plugin {
  id: string;
  name: string;
  version: string;
  description?: string;
  icon?: string; // SVG string
  activate(api: PluginAPI): void | Promise<void>;
  deactivate(): void | Promise<void>;
}
```

## PluginAPI

### Scene Operations (`api.scene`)

| Method | Description |
|--------|-------------|
| `getNodeJson(id)` | Get node data as JSON |
| `getSceneJson()` | Get full scene data |
| `getSelection()` | Get selected node IDs |
| `addRect(x, y, w, h)` | Create rectangle, returns ID |
| `addEllipse(x, y, w, h)` | Create ellipse |
| `addText(x, y, content, fontSize)` | Create text node |
| `addFrame(x, y, w, h, name?)` | Create frame |
| `removeNode(id)` | Delete a node |
| `setFill(id, r, g, b, a?)` | Set fill color |
| `setPosition(id, x, y)` | Move node |
| `setSize(id, w, h)` | Resize node |
| `setName(id, name)` | Rename node |
| `select(id)` | Select a node |
| `deselectAll()` | Clear selection |

### UI Extensions (`api.ui`)

| Method | Description |
|--------|-------------|
| `registerPanel(panel)` | Add a panel to the Plugins tab |
| `unregisterPanel(id)` | Remove a panel |
| `addToolbarButton(button)` | Add toolbar button |
| `removeToolbarButton(id)` | Remove toolbar button |
| `addMenuItem(item)` | Add context menu item |
| `removeMenuItem(id)` | Remove menu item |
| `registerCommand(cmd)` | Register a command |
| `showNotification(msg, type?)` | Show toast notification |

### Events (`api.on` / `api.off`)

| Event | Data | Description |
|-------|------|-------------|
| `selection:change` | `number[]` | Selection changed |
| `layers:change` | `void` | Layer tree changed |
| `node:create` | `number` | New node created |
| `node:delete` | `number` | Node deleted |
| `tool:change` | `string` | Active tool changed |
| `save` | `void` | Document saved |

## Plugin Lifecycle

1. **Register**: `pluginManager.register(plugin)` — adds to registry
2. **Activate**: `pluginManager.activate(id)` — calls `plugin.activate(api)`, plugin registers UI extensions
3. **Deactivate**: `pluginManager.deactivate(id)` — calls `plugin.deactivate()`, cleans up all registrations
4. **Unregister**: `pluginManager.unregister(id)` — deactivates + removes from registry

## Sample Plugins

### Lorem Ipsum Generator (`lorem-ipsum`)
- Panel with type selector (paragraph/sentence/words/title) and count
- "Generate Text" creates new text nodes
- "Fill Selected Node" replaces text in selected text nodes
- Quick toolbar button for random paragraph

### Color Palette (`color-palette`)
- Panel with 4 curated palettes (Material, Pastel, Monochrome, Ocean)
- Click swatch to apply color to selected nodes
- Palette selector dropdown

## Plugin Panel UI

Right pane "Plugins" tab shows:
- List of all plugins with active/inactive status (green/gray dot)
- Enable/Disable toggle per plugin
- Sub-tabs for plugin-registered panels

## External Plugin Registration

```typescript
// Access via global
const pm = (window as any).__pluginManager;
pm.register(myPlugin);
pm.activate("my-plugin-id");
```

## Files

- `packages/app/src/plugins/types.ts` — Type definitions
- `packages/app/src/plugins/plugin-manager.ts` — PluginManager class
- `packages/app/src/plugins/index.ts` — Barrel exports
- `packages/app/src/plugins/samples/lorem-ipsum.ts` — Sample plugin
- `packages/app/src/plugins/samples/color-palette.ts` — Sample plugin
- `packages/app/src/ui/plugin-panel.ts` — Plugin management UI
