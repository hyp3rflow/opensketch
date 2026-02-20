# OpenSketch Architecture

## Overview

OpenSketch is a Figma-like vector design tool built with **Rust (WASM)** for the engine and **TypeScript** for the UI. It runs in the browser and can be wrapped in **Tauri** for desktop.

```
opensketch/
├── crates/engine/       # Rust → WASM engine
│   └── src/
│       ├── lib.rs       # WASM entry point, Engine struct
│       ├── node.rs      # Node, NodeKind, Fill, Stroke
│       ├── types.rs     # Point, Size, Rect, Color
│       ├── scene.rs     # Scene graph, SceneData (serialization)
│       ├── render.rs    # Canvas2D renderer
│       ├── transform.rs # Viewport transform (pan/zoom)
│       └── hit_test.rs  # Hit testing + handle detection
├── packages/app/        # TypeScript frontend
│   ├── index.html       # Layout: left-panel, canvas, properties-panel, toolbar, agent-panel
│   └── src/
│       ├── main.ts      # App bootstrap, tab setup, panel wiring
│       ├── editor.ts    # Editor class (input handling, render loop, PNG export)
│       ├── wasm.ts      # WASM loader
│       └── ui/
│           ├── toolbar.ts          # Bottom-center Figma-style toolbar
│           ├── layers-panel.ts     # Layer list with visibility toggles
│           ├── properties-panel.ts # Right panel: position, size, fill, stroke, text, etc.
│           ├── design-system.ts    # Design tokens (colors, typography, spacing)
│           ├── agent-panel.ts      # Agent command panel (31 tools)
│           ├── icons.ts            # Inline SVG icons (Lucide-inspired)
│           └── styles.css          # All UI styles
└── src-tauri/           # Tauri v2 desktop wrapper
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── src/main.rs
    └── build.rs
```

## Data Model

### Node (Rust: `node.rs`)

```rust
struct Node {
    id: u64,
    name: String,
    kind: NodeKind,        // Rect | Ellipse | Text{content,font_size,font_family} | Frame | Group
    x, y: f64,             // Position
    width, height: f64,    // Size
    rotation: f64,         // Radians
    opacity: f64,          // 0.0–1.0
    visible: bool,
    locked: bool,
    fill: Option<Fill>,    // Fill { color: Color }
    stroke: Option<Stroke>,// Stroke { color: Color, width: f64 }
    corner_radius: f64,
    children: Vec<NodeId>, // Child node IDs (for Frame/Group)
    parent: Option<NodeId>,
}
```

### Color: `{ r: u8, g: u8, b: u8, a: f64 }`

### Scene Graph
- `Scene` holds a flat `HashMap<NodeId, Node>` + `root_children` order
- Tree structure via `parent`/`children` fields
- Render order: depth-first from `root_children`

### Serialization
- `SceneData` (Serialize/Deserialize) for JSON export/import
- All nodes + root_children + next_id

## Rendering

- Canvas2D-based renderer (`render.rs`)
- Viewport transform: pan (translate) + zoom (scale)
- Grid background with zoom-adaptive density
- Frame labels with zoom-inverse scaling (max 11px screen)
- Selection handles (8 corners/edges)
- Editing indicator: dashed blue border on active text

## WASM Boundary

All IDs cross the WASM boundary as `u64` ↔ `BigInt`.
JS side converts `Number ↔ BigInt` at the boundary.

### Key WASM Methods
| Method | Description |
|--------|-------------|
| `add_rect/ellipse/text/frame` | Create nodes |
| `remove_node` | Delete node |
| `select/deselect_all` | Selection |
| `get_selection` → `BigUint64Array` | Current selection |
| `get_node_json(id)` | Full node as JSON |
| `get_layer_list()` | All nodes summary |
| `set_fill_color/set_stroke/set_opacity` | Modify properties |
| `set_corner_radius/set_node_name` | More properties |
| `set_node_position/resize_node/move_node` | Transform |
| `set_text_content/set_font_size/set_font_family` | Text |
| `set_editing(id)` | Mark text as editing |
| `export_scene/import_scene` | Scene I/O |
| `get_frames/get_frame_children/get_frame_tree` | Frame queries |
| `reparent_node/duplicate_node` | Structure ops |
| `find_by_name(query)` | Name search |
| `hit_test/hit_test_handle` | Mouse picking |
| `render(ctx)` | Draw to canvas |

## Build

```bash
# WASM
cd crates/engine && wasm-pack build --target web --out-dir ../../packages/app/src/wasm

# Dev server
cd packages/app && npx vite --port 5174

# Desktop (needs cargo-tauri)
cargo tauri dev
```
