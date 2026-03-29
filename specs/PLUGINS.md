# Plugin System & Marketplace

## Architecture

### Rust Engine (`crates/engine/src/plugin.rs`)
- `PluginEntry`: id, name, version, author, description, icon_url, category, installed, enabled, downloads, rating
- `PluginCategory`: Design, Layout, Export, Accessibility, Developer
- `PluginStore`: catalog management, install/uninstall, enable/disable, search with fuzzy query + category filter
- 7 built-in catalog entries (3 with full TS implementation)

### WASM Bindings
- `get_plugins()` → JSON array of all catalog entries
- `get_installed_plugins()` → JSON array of installed entries
- `search_plugins(query, category)` → filtered JSON array
- `install_plugin(id)` / `uninstall_plugin(id)` → bool
- `enable_plugin(id)` / `disable_plugin(id)` → bool

### TypeScript Plugin API (`packages/app/src/plugins/types.ts`)
- `Plugin` interface: id, name, version, description, icon, activate(api), deactivate()
- `PluginAPI`: scene ops (CRUD nodes, selection, fill, position, size), UI extensions (panels, toolbar buttons, menu items, commands, notifications), events
- `PluginManager`: register, activate, deactivate, list, getPanels, onUIChange

### Marketplace UI (`packages/app/src/ui/plugin-marketplace.ts`)
- Right pane "Plugins" tab with two sections:
  - **Installed**: toggle switch (enable/disable), uninstall button, plugin panel tabs
  - **Browse**: search bar, category filter pills, plugin cards with icon/name/author/description/rating/downloads/install button
- Figma plugin compatibility dialog (paste & run Figma plugin code)

## Demo Plugins

| Plugin | File | Description |
|--------|------|-------------|
| Lorem Ipsum Generator | `plugins/samples/lorem-ipsum.ts` | Generate/fill text nodes with placeholder text |
| Color Palette | `plugins/samples/color-palette.ts` | Curated color palettes (Material, Pastel, Ocean, Monochrome) |
| Grid Generator | `plugins/samples/grid-generator.ts` | Auto-generate rect grids (rows/cols/size/gap/color/rainbow) |

## Plugin Development

```typescript
import type { Plugin, PluginAPI } from "./plugins/types";

const MyPlugin: Plugin = {
  id: "my-plugin",
  name: "My Plugin",
  version: "1.0.0",
  activate(api: PluginAPI) {
    // Use api.scene.* for canvas operations
    // Use api.ui.* for UI extensions
    // Use api.on() for event subscriptions
  },
  deactivate() {},
};
```
