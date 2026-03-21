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
- `TextAlign` enum: `Left`, `Center`, `Right`
- `FontStyle` enum: `Normal`, `Italic`
- `NodeKind` enum: `Rect`, `Ellipse`, `Text { content, font_size, font_family, line_height, text_align, font_weight, font_style }`, `Frame`, `Group`, `Path { points: Vec<PathPoint>, closed: bool }`, `Image { src, fit }`
- `PathPoint { x, y, handle_in_x, handle_in_y, handle_out_x, handle_out_y }` — anchor + bezier control handles (absolute coords)
- `GradientStop { offset: f64, color: Color }`
- `FillType`: `Solid { color }` | `LinearGradient { start_x, start_y, end_x, end_y, stops }` | `RadialGradient { center_x, center_y, radius, stops }` — coordinates normalized 0~1
- `Fill { fill_type: FillType }` (backward-compatible deserialization from old `{ color }` format)
- `Stroke { color: Color, width: f64 }`
- `Shadow { color: Color, offset_x, offset_y, blur, spread, visible }` — drop shadow effect
- `Node` struct: full node with id, name, kind, transform (x/y/w/h/rotation), style (opacity, fill, stroke, corner_radius, shadows: Vec<Shadow>, blur: f64), tree (children, parent), flags (visible, locked)

### `scene.rs`
- `Scene`: flat HashMap + root_children ordering
- `SceneData`: serializable snapshot (Vec<Node> + root_children + next_id)
- Operations: add_node, remove_node, get_node, move_node, resize_node
- Queries: render_order (depth-first), hit_test, all_node_ids, get_children_of
- Structure: reparent, export, import

### `render.rs`
- `Renderer`: Canvas2D rendering with viewport transform
- Grid rendering (zoom-adaptive line density)
- Node rendering: Rect (with roundRect), Ellipse, Text (multi-line, styled), Frame (white bg + label)
- Text rendering: HiDPI pixel snap, alphabetic baseline, word wrap, text-align, font-weight, font-style
- `wrap_text()`: word-level wrapping with newline support
- `measure_text_nodes()`: accurate Fit-mode dimension calculation using canvas measureText
- `build_font_string()`: CSS font string with weight + italic
- Drop shadow rendering: multi-pass Canvas shadow API (offscreen shape trick for shadow-only)
- Layer blur: CSS filter `blur(Xpx)` via `ctx.set_filter()`
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

## Effects System

### Shadow
- `Shadow` struct: `color`, `offset_x`, `offset_y`, `blur`, `spread`, `visible`
- Node has `shadows: Vec<Shadow>` — multiple drop shadows per node
- Canvas rendering: each visible shadow drawn as a separate pass using Canvas shadow API (offset to hide source shape, only shadow visible)
- SVG export: `<feDropShadow>` filter elements
- WASM: `add_shadow`, `remove_shadow`, `update_shadow`, `set_shadow_visible`, `get_shadows`

### Layer Blur
- Node has `blur: f64` — Gaussian blur on entire node (0 = none)
- Canvas: `ctx.set_filter("blur(Xpx)")`
- SVG: `<feGaussianBlur>` filter
- WASM: `set_blur`, `get_blur`

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
