# OpenSketch Agent API

## Overview

The agent panel provides two interfaces for external agents to control the canvas:

1. **`window.__agentExecute(command: string): string`** — text command API
2. **`window.__agentTools`** — structured programmatic API

## Text Commands (31 total)

### 📁 File I/O

| Command | Description |
|---------|-------------|
| `export` | Export entire scene as JSON |
| `import <json>` | Import scene from JSON (replaces current) |
| `save [name]` | Save to localStorage (default: "default") |
| `load [name]` | Load from localStorage |
| `saves` | List saved scenes with sizes |

### 🖼 Frame Tools

| Command | Description |
|---------|-------------|
| `frames` | List all frames (id, name, position, size, child count) |
| `children <frame_id>` | List direct children of a frame |
| `tree <frame_id>` | Get full recursive subtree as JSON |
| `reparent <node_id> <frame_id\|root>` | Move node into/out of frame |
| `duplicate <node_id>` | Clone a node (offset +20, +20) |

### 🔍 Query

| Command | Description |
|---------|-------------|
| `inspect <node_id>` | Full node JSON (all properties) |
| `find <query>` | Search nodes by name (partial, case-insensitive) |
| `list` | List all elements (id, name, kind, visibility) |

### ➕ Create

| Command | Description |
|---------|-------------|
| `add rect <x> <y> <w> <h>` | Create rectangle |
| `add circle <x> <y> <w> <h>` | Create ellipse |
| `add text "<content>" <x> <y> [size]` | Create text (default 16px) |
| `add frame <x> <y> <w> <h>` | Create frame |

### ✏️ Modify

| Command | Description |
|---------|-------------|
| `fill #hex` | Set fill color of selection |
| `stroke #hex [width]` | Set stroke (default 1px) |
| `opacity <0-100>` | Set opacity percentage |
| `radius <value>` | Set corner radius |
| `move <dx> <dy>` | Move selection by offset |
| `resize <w> <h>` | Set size of selection |
| `rename "<name>"` | Rename selected node |
| `select <id>` | Select node by ID |
| `delete` | Delete selected elements |
| `clear` | Clear entire canvas |

### 📝 Notes

| Command | Description |
|---------|-------------|
| `note add <id> "<md>" [tags_json]` | Add markdown note with optional tags |
| `note update <id> <idx> "<md>"` | Update note content |
| `note remove <id> <idx>` | Remove note |
| `notes <id>` | List notes (tags + preview) |
| `note read <id> <idx>` | Read full note content |
| `context <id>` | Full node context (props + notes + children) for agents |

### 📸 Export

| Command | Description |
|---------|-------------|
| `png <node_id> [scale]` | Download node as PNG (default 2x) |
| `png all [scale]` | Download entire canvas as PNG |
| `png-data <node_id\|all> [scale]` | Get PNG as data:image/png URL |

### ❓ Help

| Command | Description |
|---------|-------------|
| `help` | Show categorized command list |

## Structured API (`window.__agentTools`)

```typescript
interface AgentTools {
  // Discovery
  list(): { name: string; description: string; usage: string }[];

  // Execute any text command
  call(command: string): string;

  // Read operations
  getScene(): SceneData;
  getNode(id: number): Node | null;
  getFrames(): FrameInfo[];
  getFrameTree(id: number): NodeTree;
  findByName(query: string): { id: number; name: string; kind: string }[];
  getLayers(): LayerInfo[];

  // PNG export
  exportPng(nodeId?: number, scale?: number): string;  // data URL
  downloadPng(nodeId?: number, scale?: number, filename?: string): boolean;
}
```

## PNG Export Details

- Renders to an offscreen `<canvas>` element
- White background
- 10px padding around target bounds
- Configurable scale factor (default 2x for retina)
- For specific nodes: crops to node bounds
- For `all`: computes bounding box of all visible nodes
- Supports: Rect, Ellipse, Text (with font), Frame
- Handles rotation, opacity, fill, stroke, corner radius

## Integration Patterns

### From OpenClaw Agent (via browser tool)
```javascript
// List what's on canvas
window.__agentTools.getLayers()

// Create a button component
window.__agentExecute('add frame 100 100 200 48')
window.__agentExecute('fill #4a4af5')
window.__agentExecute('radius 8')
window.__agentExecute('add text "Click me" 130 114 16')

// Export as PNG
window.__agentTools.exportPng(frameId, 2)
```

### From Tauri IPC
```rust
// In Tauri command handler
window.eval("window.__agentExecute('list')")
```

### From WebSocket (future)
The agent API is designed for easy bridging — any transport can call `__agentExecute` or `__agentTools` methods via `evaluate` in the browser context.
