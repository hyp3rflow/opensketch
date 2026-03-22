# OpenSketch Feature Log

## ✅ Implemented

### Core Engine
- [x] Scene graph (flat HashMap + tree via parent/children)
- [x] Node types: Rectangle, Ellipse, Text, Frame, Group
- [x] Properties: position, size, rotation, opacity, fill, stroke (color, width, dash, cap, join), corner radius, shadows, blur
- [x] Viewport: pan, zoom (scroll wheel with rAF batching)
- [x] Hit testing (reverse render order, respects visibility/lock)
- [x] Selection (single + multi-select + marquee drag-select, with resize handles)
- [x] Scene serialization (JSON export/import)
- [x] Node operations: create, delete, move, resize, duplicate, reparent
- [x] Name search (partial match, case-insensitive)

### Rendering
- [x] Canvas2D renderer with viewport transform
- [x] Adaptive grid (density changes with zoom)
- [x] Frame labels (zoom-inverse scaling, max 11px)
- [x] Selection handles (cyan, 8-point)
- [x] Text editing indicator (dashed blue border)
- [x] Rotation support (node-level)
- [x] Drop shadow rendering (multi-pass Canvas shadow API, per-node multiple shadows)
- [x] Layer blur (CSS filter blur via Canvas API)

### UI Panels
- [x] **Left Panel** with tab navigation (Layers / Design)
- [x] **Layers Panel**: tree view with expand/collapse, indentation, SVG type icons, visibility toggle
- [x] **Properties Panel**: full node editing
  - Position (X/Y), Size (W/H), Rotation
  - Corner radius (Rect/Frame only)
  - Opacity (slider + percentage)
  - Fill color (picker + hex + alpha)
  - Stroke color/width + "Add stroke" + dash pattern, line cap, line join
  - Text: content, font family (14 fonts), font size
  - Node name, type badge
  - Multi-select count, empty state
- [x] **Design System Panel**: tokens management
  - Colors: 24 swatches (grid), click=fill, right-click=stroke
  - Typography: 11 presets with live preview, click-to-apply
  - Spacing: 9 scales with visual bars
  - localStorage persistence
  - System name editing

### Toolbar
- [x] Bottom-center floating Figma-style
- [x] Tools: Select, Hand | Rectangle, Ellipse, Text, Frame
- [x] Active state highlighting
- [x] All SVG icons (no emoji)

### Text Editing
- [x] Inline editing (double-click to activate)
- [x] Hidden contentEditable captures keyboard input
- [x] Real-time canvas re-render on input
- [x] Font family support (14 fonts)
- [x] Enter to commit, Escape to cancel
- [x] Default text fill: black

### Notes System
- [x] **Markdown notes**: attach multiple notes to any node
- [x] **Tags**: categorize notes (screen, logic, api, etc.)
- [x] **Canvas badge**: 📝 + count on frames/instances with notes
- [x] **Properties panel**: editable textarea + tags display + add/remove
- [x] **Agent commands**: add, update, remove, list, read, context
- [x] **Context tool**: `context <id>` returns node + notes + children summary for agents

### Component System
- [x] **Component definition**: create from frame, store in ComponentStore
- [x] **Variant properties**: Boolean + String (with options)
- [x] **Variant switching**: swap instance subtree to different variant template
- [x] **Slots**: placeholder nodes (⊞) that accept content via reparenting
- [x] **Instances**: deep-clone template at position, with ◇ prefix + green label
- [x] **Overrides**: per-instance text/visibility overrides on children
- [x] **9 agent commands**: create, prop, variant, slot, instance, switch, fill, list, override

### Alignment & Distribution
- [x] **Align**: left, center-H, right, top, center-V, bottom (multi-select, 2+ nodes)
- [x] **Distribute**: horizontal, vertical (3+ nodes, equal spacing)
- [x] **Properties panel UI**: 6 align buttons + 2 distribute buttons (shown on multi-select)
- [x] **Undo integration**: push_undo before every alignment action
- [x] **Dual API**: explicit IDs (`align_left(ids)`) + selection-based (`align_selection("left")`)

### Agent Panel
- [x] Toggle button (🤖, bottom-right)
- [x] Chat UI (user/agent/system messages)
- [x] 31 text commands across 6 categories
- [x] File I/O: export, import, save, load, saves
- [x] Frame tools: frames, children, tree, reparent, duplicate
- [x] Query: inspect, find, list
- [x] Create: add rect/circle/text/frame
- [x] Modify: fill, stroke, opacity, radius, move, resize, rename, select, delete, clear
- [x] PNG export: png, png all, png-data
- [x] External APIs: `__agentExecute` (text) + `__agentTools` (structured)

### PNG Export
- [x] Offscreen canvas rendering
- [x] Per-node export (crops to bounds + padding)
- [x] Full canvas export (bounding box of all nodes)
- [x] Configurable scale (default 2x)
- [x] White background, 10px padding
- [x] Supports Rect, Ellipse, Text, Frame with all styles
- [x] Data URL output + file download

### Copy / Paste
- [x] **Copy** (Cmd+C): serialize selected nodes + subtrees to internal clipboard
- [x] **Cut** (Cmd+X): copy + delete selected nodes
- [x] **Paste** (Cmd+V): deserialize with new IDs, offset +10px per paste
- [x] **Duplicate** (Cmd+D): instant copy+paste with 10px offset
- [x] Hierarchy preservation: children/parent relationships remapped
- [x] Undo integration: all paste/cut operations push undo

### SVG Export
- [x] Rust engine: `svg_export.rs` module (pure string SVG generation, no external deps)
- [x] Node types: Rect, Ellipse, Text (multiline, font properties, alignment), Frame, Group, Instance, Slot
- [x] Style support: fill (hex + opacity), stroke (color + width), corner radius, opacity, rotation
- [x] Nested children: Frame/Group → `<g>` with coordinate adjustment
- [x] WASM bindings: `export_svg()`, `export_selection_svg()`, `export_node_svg(id)`
- [x] TypeScript: `Editor.exportSVG()`, `exportSelectionSVG()`, `downloadSVG()` (Blob + download link)
- [x] Toolbar: download button (exports selection if any, otherwise full canvas)

### Image Nodes
- [x] **NodeKind::Image**: src (URL/data URI) + fit mode (cover/contain/fill)
- [x] **WASM bindings**: `add_image()`, `set_image_src()`, `set_image_fit()`
- [x] **Canvas rendering**: TS-side drawImage with fit modes + corner radius clipping
- [x] **Drag & drop**: drop image files onto canvas → auto-create image node
- [x] **Clipboard paste**: Cmd+V with image data → creates image node at center
- [x] **Image tool**: toolbar button (I) → draw rect → prompt URL
- [x] **Properties panel**: source URL input, fit mode toggle (Cover/Contain/Fill)
- [x] **SVG export**: `<image>` element with preserveAspectRatio
- [x] **Placeholder rendering**: mountain/sun icon when image not loaded
- [x] **Image cache**: loaded images cached for reuse

### Zoom Controls
- [x] **Zoom to fit** (Cmd+1): fit all nodes in viewport with padding
- [x] **Zoom to 100%** (Cmd+0): reset zoom to 1x, keeping center stable
- [x] **Zoom to selection** (Cmd+2): fit selected nodes in viewport
- [x] **Zoom in/out**: +/- keys (1.25x/0.8x factor), center-stable
- [x] **Zoom controls UI**: bottom-left floating bar (−, percentage, +, fit button)
- [x] **Real-time zoom display**: rAF polling for wheel zoom updates
- [x] **Engine API**: `set_viewport()`, `get_scene_bounds()`, `get_selection_bounds()`

### Performance
- [x] Wheel event batching (accumulate dx/dy per rAF)
- [x] PointerEvent + setPointerCapture
- [x] Selection callbacks throttled via rAF
- [x] Single pointerdown handler (no dual mousedown)

### Desktop (Tauri v2)
- [x] Project scaffolded (`src-tauri/`)
- [x] Config: 1440×900 window, Vite dev server integration
- [ ] Not yet built/tested (needs `cargo-tauri` CLI)

## 🔮 Future Ideas
- [x] Multi-select (shift+click, shift+click deselect, drag-select marquee, multi-node move)
- [x] Undo/redo
- [x] Copy/paste (Cmd+C/V/X/D with hierarchy, ID remapping, offset)
- [x] Alignment tools (align left/center/right/top/center-v/bottom, distribute H/V)
- [ ] Auto-layout (Figma-like)
- [ ] Components/instances
- [x] SVG export (per-node, selection, full canvas; Rust engine + WASM + toolbar button)
- [ ] Collaborative editing (CRDT)
- [ ] Plugin system
- [ ] Canvas text cursor + multi-line text
- [x] Image nodes (drag & drop, URL, clipboard paste, cover/contain/fill)
- [x] **Gradient fills**: Solid/LinearGradient/RadialGradient fill types with gradient stops editor
  - Linear: start/end points (normalized 0~1), multiple color stops
  - Radial: center/radius (normalized), multiple color stops
  - Properties panel: mode switcher (Solid/Linear/Radial), stop color pickers, position inputs
  - Canvas rendering via createLinearGradient/createRadialGradient
  - SVG export with `<linearGradient>`/`<radialGradient>` defs
  - Backward-compatible serialization (old files still load)
- [x] Pen tool (vector paths)
  - NodeKind::Path with PathPoint (anchor + bezier in/out handles)
  - Click to place corner points, drag to create bezier curves (mirrored handles)
  - Click near first point to close path, Escape/Enter to finish open path
  - Canvas rendering: bezier_curve_to for curves, line_to for straight segments
  - SVG export: `<path d="M... C... L... Z"/>` with full bezier support
  - Properties panel: point count display, open/closed toggle
  - WASM bindings: add_path, path_add_point, path_add_curve_point, path_set_point, path_set_handle_out/in, path_remove_point, path_set_closed, path_get_data, path_point_count
  - Toolbar: Pen button (P shortcut)
- [x] **Path point editing mode**: double-click Path node to edit individual points/handles
  - Double-click Path → enter edit mode, Escape to exit
  - Drag anchor points (handles move along), drag handles to adjust curves
  - Alt+drag handle: break mirror (move independently)
  - Delete/Backspace: remove selected point
  - Visual overlay: anchor squares, handle circles, connecting lines (screen-space sizing)
  - Selected point highlighted in blue
- [x] **Smart Guides / Snapping**: Figma-style alignment guides during drag-move
  - Snap to edges (left/right/top/bottom) and centers of other nodes
  - Configurable threshold (5px screen-space)
  - Visual guide lines: magenta (#ff3366) lines extending between snapped nodes
  - Pure TypeScript implementation (no Rust/WASM changes needed)
  - Snap works with multi-selection (combined bounding box)
  - Guides auto-clear on pointer up
- [x] **Blend modes**: 16 compositing modes (Normal, Multiply, Screen, Overlay, Darken, Lighten, Color Dodge, Color Burn, Hard Light, Soft Light, Difference, Exclusion, Hue, Saturation, Color, Luminosity)
- [ ] Boolean operations
- [x] Constraints (responsive resizing) — Horizontal: Left/Right/LeftAndRight/Center/Scale, Vertical: Top/Bottom/TopAndBottom/Center/Scale
- [ ] Prototyping (interactions/transitions)


### Constraints (Responsive Resize)
- **Horizontal**: Left (default), Right, Left & Right (stretch), Center, Scale
- **Vertical**: Top (default), Bottom, Top & Bottom (stretch), Center, Scale
- Applied when parent Frame/Group is resized — children reposition/resize based on constraint settings
- Local coordinate conversion (absolute → local → apply constraint → absolute)
- WASM: `set_constraints(id, horizontal, vertical)`, `get_constraints(id)`, `resize_node_with_constraints(id, w, h)`
- Properties panel: Constraints section with H/V dropdowns (shown for nodes with Frame/Group parent)
- Backward compatible via `#[serde(default)]`

### Mask / Clip (Figma-style)
- Any shape node can be marked as a mask via `is_mask` toggle
- Mask clips all subsequent siblings within the same parent
- Mask node itself is rendered normally (visible/hidden independent of mask role)
- Works with Rect, Ellipse, Path shapes (including rounded corners)
- Properties panel: "Use as mask" checkbox in Appearance section
- Layers panel: "M" badge shown on mask nodes
- SVG export: uses `<clipPath>` elements
- WASM: `set_mask(id, bool)`, `get_mask(id) -> bool`

### Blend Modes
- 16 standard CSS blend modes: Normal, Multiply, Screen, Overlay, Darken, Lighten, Color Dodge, Color Burn, Hard Light, Soft Light, Difference, Exclusion, Hue, Saturation, Color, Luminosity
- `BlendMode` enum on Node with `#[serde(default)]` for backward compatibility
- Canvas rendering: `globalCompositeOperation` applied per node
- SVG export: `mix-blend-mode` style attribute
- WASM: `set_blend_mode(id, mode_str)`, `get_blend_mode(id) -> String`
- Properties panel: Blend mode dropdown in Effects section

### Star / Polygon Shapes
- `NodeKind::Star { points: u32, inner_radius: f64 }` — configurable tip count and inner radius ratio (0~1)
- `NodeKind::Polygon { sides: u32 }` — regular polygon with configurable side count
- Canvas rendering: vertex calculation → moveTo/lineTo → fill/stroke, clip path support
- SVG export: Star → `<path>`, Polygon → `<polygon>`
- WASM: `add_star`, `add_polygon`, `set/get_star_points`, `set/get_star_inner_radius`, `set/get_polygon_sides`
- Toolbar: Star (S shortcut) / Polygon (G shortcut) buttons
- Properties panel: Star → Points + Inner Radius inputs, Polygon → Sides input
- Backward-compatible serde (`#[serde(default)]` not needed — new enum variants)

### Auto-save & Version History
- [x] **Auto-save**: localStorage persistence every 30 seconds
- [x] **Manual save**: Cmd+S / Ctrl+S keyboard shortcut
- [x] **Session restore**: auto-loads previous session on startup (skips demo scene)
- [x] **beforeunload save**: saves on tab/window close
- [x] **Version history**: stores up to 20 timestamped snapshots (auto + manual)
- [x] **History panel**: "History" tab in right pane with restore buttons
- [x] **Restore flow**: saves current state before restoring, confirm dialog
- [x] **Clear history**: trash button to wipe all snapshots
- [x] **Storage management**: auto-trims old entries on localStorage quota errors
- [x] **Change detection**: simple hash to skip redundant saves
