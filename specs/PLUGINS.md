# Plugin API Specification

## Overview
OpenSketch provides a TypeScript-based Plugin API that allows third-party extensions to add custom tools, panels, toolbar buttons, menu items, and commands.

## Plugin Interface
```typescript
interface Plugin {
  id: string;        // unique identifier (e.g., "lorem-ipsum")
  name: string;      // display name
  version: string;   // semver
  description?: string;
  icon?: string;     // SVG string
  activate(api: PluginAPI): void | Promise<void>;
  deactivate(): void | Promise<void>;
}
```

## PluginAPI
Passed to `activate()`. Provides:

### Scene Operations (`api.scene`)
- `getNodeJson(id)` — get node data as JSON
- `getSceneJson()` — full scene tree
- `getSelection()` — selected node IDs
- `addRect/addEllipse/addText/addFrame` — create nodes
- `removeNode(id)` — delete a node
- `setFill/setPosition/setSize/setName` — modify nodes
- `select(id)` / `deselectAll()`

### UI Extensions (`api.ui`)
- `registerPanel(panel)` — add a panel in the Plugins tab
- `unregisterPanel(id)`
- `addToolbarButton(button)` — add quick-action button
- `removeToolbarButton(id)`
- `addMenuItem(item)` / `removeMenuItem(id)`
- `registerCommand(cmd)`
- `showNotification(message, type)`

### Events (`api.on/off`)
- `selection:change` — fires with `number[]` of selected IDs
- `layers:change` — layer tree updated
- `node:create` / `node:delete` — node lifecycle
- `tool:change` — active tool changed
- `save` — document saved

## PluginManager
- `register(plugin)` — register a plugin
- `activate(id)` / `deactivate(id)` — toggle lifecycle
- `unregister(id)` — remove completely
- `list()` — list all plugins with status

## Built-in Sample Plugins

### Lorem Ipsum Generator
- Panel with type selection (paragraph/sentence/words/title)
- Count control
- Generate new text nodes or fill selected text nodes
- Quick toolbar button

### Color Palette
- Panel with curated palettes (Material, Pastel, Monochrome, Ocean)
- Click swatch to apply fill to selected nodes
- Palette switcher dropdown

## UI
Plugins tab in the right pane shows:
- Plugin list with enable/disable toggles
- Plugin panel tabs (from registered panels)
- Quick action buttons (from registered toolbar buttons)

## File Structure
```
packages/app/src/plugins/
├── index.ts              # re-exports
├── types.ts              # Plugin, PluginAPI interfaces
├── plugin-manager.ts     # PluginManager + PluginAPIImpl
└── samples/
    ├── lorem-ipsum.ts    # Lorem Ipsum Generator plugin
    └── color-palette.ts  # Color Palette plugin
```
