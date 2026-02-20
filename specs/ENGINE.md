# OpenSketch Engine (Rust → WASM)

## Crate: `crates/engine/`

Pure Rust crate compiled to WASM via `wasm-pack`. No NAPI — runs entirely in the browser.

## Modules

### `types.rs`
- `Point { x, y }` — 2D point
- `Size { width, height }`
- `Rect { x, y, width, height }` — bounding box, with `contains(Point)` and `from_two_points`
- `Color { r: u8, g: u8, b: u8, a: f64 }` — with `to_css()`, `white()`, `black()`, `blue()`, `transparent()`

### `node.rs`
- `NodeId = u64`
- `NodeKind` enum: `Rect`, `Ellipse`, `Text { content, font_size, font_family }`, `Frame`, `Group`
- `Fill { color: Color }`, `Stroke { color: Color, width: f64 }`
- `Node` struct: full node with id, name, kind, transform (x/y/w/h/rotation), style (opacity, fill, stroke, corner_radius), tree (children, parent), flags (visible, locked)

### `scene.rs`
- `Scene`: flat HashMap + root_children ordering
- `SceneData`: serializable snapshot (Vec<Node> + root_children + next_id)
- Operations: add_node, remove_node, get_node, move_node, resize_node
- Queries: render_order (depth-first), hit_test, all_node_ids, get_children_of
- Structure: reparent, export, import

### `render.rs`
- `Renderer`: Canvas2D rendering with viewport transform
- Grid rendering (zoom-adaptive line density)
- Node rendering: Rect (with roundRect), Ellipse, Text (with font), Frame (white bg + label)
- Selection handles (8 points, cyan)
- Frame labels: zoom-inverse scaling, max 11px screen size
- Editing indicator: dashed blue border

### `transform.rs`
- `Transform { a, b, c, d, tx, ty }` — affine 2D transform
- Viewport pan/zoom operations
- `screen_to_scene` coordinate conversion

### `hit_test.rs`
- Node hit testing (point-in-bounds, reverse render order)
- Handle hit testing (8 resize handles per selected node)

### `lib.rs` — WASM Entry Point
- `Engine` struct: Scene + Renderer + editing state
- 40+ `#[wasm_bindgen]` methods (see AGENT-API.md for full list)
- Categories: create, delete, select, query, modify, transform, text, scene I/O, frame tools

## Dependencies

```toml
wasm-bindgen = "0.2"
web-sys = { features = ["CanvasRenderingContext2d", "HtmlCanvasElement"] }
js-sys = "0.3"
serde = { features = ["derive"] }
serde_json = "1"
```

## Build

```bash
cd crates/engine
wasm-pack build --target web --out-dir ../../packages/app/src/wasm
```

Output: `packages/app/src/wasm/` (opensketch_engine.js + .wasm + .d.ts)
