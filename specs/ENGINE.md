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
- `TextDecoration` enum: `None`, `Underline`, `Strikethrough`, `UnderlineStrikethrough`
- `NodeKind` enum: `Rect`, `Ellipse`, `Text { content, font_size, font_family, line_height, text_align, font_weight, font_style, text_decoration, letter_spacing, paragraph_spacing }`, `Frame`, `Group`, `Path { points: Vec<PathPoint>, closed: bool }`, `Image { src, fit }`, `Star { points: u32, inner_radius: f64 }`, `Polygon { sides: u32 }`
- `PathPoint { x, y, handle_in_x, handle_in_y, handle_out_x, handle_out_y }` — anchor + bezier control handles (absolute coords)
- `GradientStop { offset: f64, color: Color }`
- `FillType`: `Solid { color }` | `LinearGradient { start_x, start_y, end_x, end_y, stops }` | `RadialGradient { center_x, center_y, radius, stops }` — coordinates normalized 0~1
- `Fill { fill_type: FillType, visible: bool }` (backward-compatible deserialization from old `{ color }` format; visible defaults to true)
- `Stroke { color: Color, width: f64, dash_array: Vec<f64>, dash_offset: f64, line_cap: LineCap, line_join: LineJoin, align: StrokeAlign }`
- `StrokeAlign { Center, Inside, Outside }` — stroke alignment (Figma-style)
- `LineCap { Butt, Round, Square }` — stroke end cap style
- `LineJoin { Miter, Round, Bevel }` — stroke corner join style
- `Shadow { color: Color, offset_x, offset_y, blur, spread, visible }` — drop shadow effect
- `LayoutGridType`: `Columns`, `Rows`, `Grid` — layout grid overlay type
- `GridSizeMode`: `Auto` | `Fixed(f64)` — column/row width mode
- `LayoutGrid { grid_type, count: u32, size_mode: GridSizeMode, gutter: f64, margin: f64, color: Color, visible: bool }` — Figma-style layout grid overlay
- `SizingMode`: `Fixed` | `Hug` | `Fill` — auto layout child sizing (Figma-style)
- `Node` struct: full node with id, name, kind, transform (x/y/w/h/rotation), style (opacity, fills: Vec<Fill>, stroke, corner_radius, shadows: Vec<Shadow>, blur: f64), tree (children, parent), flags (visible, locked), layout_grids: Vec<LayoutGrid>, sizing_h/sizing_v: SizingMode, min_width/max_width/min_height/max_height: Option<f64>, absolute_position: bool

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
- Text rendering: HiDPI pixel snap, alphabetic baseline, word wrap, text-align, font-weight, font-style, text-decoration (underline/strikethrough), letter-spacing, paragraph-spacing
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

## Multi-fill System
- Node has `fills: Vec<Fill>` — multiple fills per node (Figma-style), rendered bottom → top
- Each `Fill` has `fill_type: FillType` and `visible: bool` toggle
- Backward compatible: old `"fill": {...}` JSON deserialized into `fills[0]`; `fill` field is `skip_serializing`
- `Node::normalize_fills()` called on import to migrate old single fill → fills array
- Rendering: all visible fills rendered in sequence (bottom → top) before stroke
- SVG export: uses first visible fill (SVG doesn't natively support stacked fills)
- WASM API: `add_fill`, `remove_fill`, `update_fill_at`, `set_fill_visible_at`, `get_fills`, `get_fill_count`, `move_fill`, `set_fill_linear_gradient_at`, `set_fill_radial_gradient_at`
- Legacy `set_fill_color` / `set_fill_linear_gradient` / `set_fill_radial_gradient` update fills[0]

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

### Constraints (Responsive Resize)
- Node has `constraints: Constraints` with `horizontal: ConstraintH` and `vertical: ConstraintV`
- `ConstraintH`: Left (default), Right, LeftAndRight, Center, Scale
- `ConstraintV`: Top (default), Bottom, TopAndBottom, Center, Scale
- When a Frame/Group is resized, children are repositioned/resized based on their constraint settings
- Child positions are absolute in the scene; constraint math converts to/from local coords relative to parent
- WASM: `set_constraints(id, horizontal, vertical)`, `get_constraints(id)` → JSON, `resize_node_with_constraints(id, w, h)`
- Properties panel shows Constraints section for children of Frame/Group nodes
- `#[serde(default)]` for backward compatibility with old scene files

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


## Constraints System
- `Constraints { horizontal: ConstraintH, vertical: ConstraintV }` on every Node
- `ConstraintH`: Left | Right | LeftAndRight | Center | Scale
- `ConstraintV`: Top | Bottom | TopAndBottom | Center | Scale
- `Scene::resize_node_with_constraints()`: only applies to Frame/Group; falls back to simple resize for others
- Math uses local coordinates (child.x - parent.x) for correct constraint calculation


## Mask / Clip System
- `Node.is_mask: bool` — when true, this node acts as a mask (Figma-style)
- Mask clips all subsequent siblings within the same parent container
- Rendering uses hierarchical `render_children()` instead of flat `render_order()` iteration
- Canvas2D: `ctx.save()` → `build_clip_path()` → `ctx.clip()` → render siblings → `ctx.restore()`
- SVG export: emits `<clipPath>` defs and wraps clipped siblings in `<g clip-path="url(#...)">`
- Supports Rect, Ellipse, Path, and rounded-rect shapes as masks
- WASM API: `set_mask(id, bool)`, `get_mask(id) -> bool`


## Bitmap Filters
- `BitmapFilter` struct: brightness, contrast, saturation, hue_rotate, invert, grayscale, sepia, enabled
- `Node.bitmap_filter: Option<BitmapFilter>` — optional per-node filter effects
- Canvas rendering: combined with blur into single `ctx.filter` CSS string
- SVG export: `feComponentTransfer`, `feColorMatrix` (saturate/hueRotate), `feDropShadow` integration
- WASM API: `set_bitmap_filter(id, brightness, contrast, saturation, hue_rotate, invert, grayscale, sepia)`, `remove_bitmap_filter(id)`, `set_bitmap_filter_enabled(id, bool)`, `get_bitmap_filter(id) -> JSON`
- Properties panel: Effects section — slider + numeric input per filter property, enable toggle, add/remove
- Inspect panel: CSS `filter:` output with all active filter functions
- Backward-compatible serde (field defaults to None)
