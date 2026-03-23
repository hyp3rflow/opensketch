# OpenSketch Feature Log

## ✅ Implemented

### Core Engine
- [x] Scene graph (flat HashMap + tree via parent/children)
- [x] Node types: Rectangle, Ellipse, Text, Frame, Group
- [x] Properties: position, size, rotation, opacity, fill, stroke (color, width, dash, cap, join), corner radius, shadows, blur
- [x] Layout grid overlay (Columns, Rows, Grid) on Frame nodes with Ctrl/Cmd+G toggle
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

### Keyboard Shortcuts Panel
- [x] Modal overlay toggled by Cmd+/ or ? key
- [x] All shortcuts organized by category (Tools, Edit, View, Boolean & Transform, Selection)
- [x] Real-time search/filter
- [x] ESC to close, backdrop click to close
- [x] Figma-style dark UI with kbd tags

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
- [x] **Multi-fill**: Multiple fills per node (Figma-style), each with visible toggle
  - Fills rendered bottom → top, supports Solid/Linear/Radial per fill
  - Add/remove/reorder fills, per-fill visibility toggle
  - Backward-compatible serde (old single `fill` migrated to `fills[0]`)
  - WASM: add_fill, remove_fill, update_fill_at, move_fill, set_fill_visible_at, get_fills
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
- [x] **Multi-page support**: multiple pages per document with tab UI
  - Page management: add, remove, rename, duplicate, switch
  - Backward-compatible serialization (old single-page files auto-migrate to "Page 1")
  - Tab bar UI: bottom-center above toolbar, click to switch, double-click to rename
  - Context menu: Rename, Duplicate, Delete (minimum 1 page enforced)
  - Undo/redo: full scene snapshots include all pages
  - WASM API: add_page, remove_page, rename_page, set_active_page, duplicate_page, get_pages, get_active_page_id, get_page_count
- [x] Boolean operations (Union, Subtract, Intersect, Exclude)
- [x] Constraints (responsive resizing) — Horizontal: Left/Right/LeftAndRight/Center/Scale, Vertical: Top/Bottom/TopAndBottom/Center/Scale
- [x] Prototyping (interactions/transitions)
  - Interaction struct: trigger (OnClick/OnHover/OnPress/OnDrag), action (NavigateTo/Back/ScrollTo/OpenOverlay/CloseOverlay), target node/page ID, transition type (Instant/Dissolve/SmartAnimate/SlideIn/SlideOut/Push), duration
  - WASM API: add_interaction, remove_interaction, clear_interactions, get_interactions, get_interaction_count, get_all_interactions
  - Properties panel: "Interactions" section with trigger/action/target/transition/duration editors, add/remove
  - Prototype viewer: full-screen overlay, click navigation, back stack, Esc to close
  - Animated transitions: Dissolve (cross-fade), SlideIn (from right), SlideOut (old exits right), Push (both move), SmartAnimate (name-matched node interpolation with position/size cross-fade)
  - SmartAnimate: matches children by node name across frames, interpolates position/size with cubic ease-in-out, unmatched content cross-fades
  - Toolbar: Play button (▶), keyboard shortcut Cmd+Enter
  - Interaction hotspot hints (blue dashed borders in preview)

### Styles Library (Shared Color & Text Styles)
- [x] **ColorStyle**: name + RGBA fill color, CRUD via StyleStore
- [x] **TextStyle**: name + font_family, font_size, font_weight, font_style, line_height, text_align, color — CRUD via StyleStore
- [x] **Apply/Detach**: link a style to any node; applying sets fill/text properties, detaching keeps current values
- [x] **Sync on update**: `sync_color_style(id)` / `sync_text_style(id)` propagates changes to all linked nodes
- [x] **Node fields**: `color_style_id`, `text_style_id` optional fields on Node (backward-compatible via `#[serde(default)]`)
- [x] **WASM API**: add/update/remove/list color_style & text_style, apply/detach, get_node_style_info, sync
- [x] **Properties panel UI**: Color Style dropdown (apply/detach/create from current fill), Text Style dropdown (apply/detach/create from current text props)
- [x] **Quick create**: "+" button creates a new style from the node's current properties
- [x] **Linked indicator**: 🔗 badge shows linked style name


### Boolean Operations
- [x] **Operations**: Union, Subtract (Difference), Intersect, Exclude (XOR)
- [x] **Shape support**: Rect, Ellipse, Star, Polygon, Path (closed/open) → polygon conversion
- [x] **Ellipse/curve approximation**: 64-segment polygon for ellipses, 16-step bezier flattening for paths
- [x] **i_overlay crate**: production-quality polygon clipping engine (EvenOdd fill rule)
- [x] **Multi-node chaining**: Union/Intersect supports 3+ nodes via sequential pairwise operations
- [x] **Result**: new Path node (closed, corner points) with first node's fill/stroke
- [x] **Original removal**: source nodes deleted after operation
- [x] **Undo integration**: push_undo before operation
- [x] **WASM API**: `boolean_operation(op: &str) -> u64` — operates on current selection
- [x] **Keyboard shortcuts**: Ctrl/Cmd+Shift+U (Union), +S (Subtract), +I (Intersect), +X (Exclude)
- [x] **Toolbar UI**: 4 boolean op buttons (Union/Subtract/Intersect/Exclude) with icons
- [x] **Selection-aware**: buttons disabled when < 2 nodes selected, enabled when 2+

### Flatten Selection
- [x] **Convert to Path**: Any shape (Rect, Ellipse, Star, Polygon, Text, Image) → Path node
- [x] **Group/Frame flatten**: All children unioned into single Path via i_overlay
- [x] **Preserves style**: fill, stroke, opacity, shadows, blur, blend mode carried over
- [x] **Multi-select**: Flatten multiple nodes at once (each independently)
- [x] **WASM API**: `flatten_selection() -> u32` — returns count of flattened nodes
- [x] **Keyboard shortcut**: Cmd/Ctrl+E
- [x] **Toolbar UI**: Flatten button (enabled when 1+ node selected)
- [x] **Undo integration**: push_undo before flatten

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

### Ruler / Guides
- [x] **Horizontal ruler**: Top edge, tick marks + numbers, zoom/pan-aware
- [x] **Vertical ruler**: Left edge, tick marks + numbers, zoom/pan-aware
- [x] **Draggable guides**: Drag from ruler to create guide lines on canvas
- [x] **Guide rendering**: Blue (#4a90d9) guide lines spanning full canvas
- [x] **Snap to guides**: Guide positions integrated with smart-guides snapping system
- [x] **Remove guides**: Double-click a guide to delete, or drag back to ruler
- [x] **Adaptive tick spacing**: Tick intervals auto-adjust based on zoom level (50-200px screen spacing)
- [x] **Corner square**: Top-left 20×20px corner piece between rulers
- Pure TypeScript implementation (no Rust changes)

### Inspect Mode (CSS Code Gen)
- [x] **Inspect tab**: "Inspect" tab in right pane alongside Properties/Agent/History
- [x] **CSS generation**: Generates CSS from selected node properties
- [x] **Supported properties**: width, height, position, border-radius, background (solid/linear-gradient/radial-gradient), opacity, border, box-shadow, filter:blur, mix-blend-mode, transform:rotate
- [x] **Text CSS**: font-family, font-size, font-weight, font-style, line-height, text-align
- [x] **Layout CSS**: display:flex/grid with direction, align-items, justify-content, gap, wrap, padding
- [x] **SVG attributes**: stroke-dasharray, stroke-linecap, stroke-linejoin (separate section)
- [x] **Clipboard copy**: One-click copy button with "Copied!" feedback
- [x] **Syntax highlighting**: VS Code-inspired coloring (property names, values, colors, strings)

### Export/Import Styles
- [x] **Export styles**: JSON file download with all color + text styles
- [x] **Import styles**: File picker → merge into current style library with new IDs
- [x] **Portable format**: Version field, full ColorStyle + TextStyle serialization
- [x] **UI**: "Styles Library" section in Properties panel empty state (no selection)
- Rust StyleStore export_json/import_json + WASM bindings

### Comments / Annotations
- [x] **Comment struct**: id, x, y, author, text, timestamp, resolved, replies[], node_id, page_id
- [x] **Scene-level storage**: Comments stored at Scene level (not per-node), serialized in SceneData
- [x] **Thread replies**: CommentReply struct with threaded conversation support
- [x] **WASM bindings**: add_comment, add_comment_on_node, remove_comment, resolve_comment, edit_comment, add_reply, remove_reply, get_comments, get_all_comments, get_comment, get_comment_count
- [x] **Canvas pins**: Blue pin icons at comment positions, zoom/pan aware, click to open thread
- [x] **Comment mode**: C key toggle, crosshair cursor, click to place comment
- [x] **Thread popup**: View comment + replies, resolve/delete actions, add reply (Cmd+Enter to submit)
- [x] **Comments panel**: Right pane "Comments" tab listing all comments, click to pan-to
- [x] **Resolved filter**: Resolved comments shown separately in panel, hideable on canvas
- [x] **Page-aware**: Comments belong to specific pages
- [x] **Undo integration**: All comment operations push undo state
- [x] **Backward compatible**: serde(default) for comments/next_comment_id in SceneData

### Keyboard Shortcuts Panel
- [x] **Modal overlay**: Toggled via ⌘/ or ? key
- [x] **Categorized shortcuts**: Tools, Edit, View, Selection, Boolean & Transform, Pen Tool
- [x] **Search**: Real-time filtering by description or key name
- [x] **Figma-style UI**: Dark modal with kbd tags, section headers, search input
- [x] **ESC to close**: Also closes on backdrop click
- [x] **Editor integration**: Blocks other key events while panel is open

### Right-click Context Menu
- [x] **Canvas context menu**: Custom right-click menu replacing browser default
- [x] **Node menu**: Copy, Cut, Paste, Duplicate, Delete, Lock/Unlock, Show/Hide, z-order (Bring to Front/Forward, Send Backward/Back), Flatten
- [x] **Empty canvas menu**: Paste, Select All, Zoom to Fit, Zoom to 100%
- [x] **Shortcut display**: Keyboard shortcuts shown alongside each menu item
- [x] **Disabled states**: Items greyed out when not applicable (e.g. Paste without clipboard)
- [x] **Auto-select on right-click**: Right-clicking unselected node selects it first
- [x] **Figma-style UI**: Dark background, rounded corners, hover highlights, viewport-aware positioning
- [x] **Z-order WASM bindings**: bring_to_front, send_to_back, bring_forward, send_backward
- [x] **Group/Ungroup**: group_selected, ungroup WASM bindings with context menu integration
- [x] **Select all**: select_all WASM binding (visible, unlocked root nodes)

### Variable Collections (Design Tokens)
- [x] **Rust variable.rs**: VariableCollection, Variable, VariableMode, VariableBinding types
- [x] **Variable types**: Color, Number, String, Boolean with per-mode values
- [x] **Mode system**: Multiple modes per collection (e.g., Light/Dark), add/remove/rename/switch
- [x] **Scene integration**: variable_collections, variable_bindings stored in Scene, apply_variables() resolves all bindings
- [x] **Bindable properties**: fill.0.color, stroke.color, opacity, corner_radius, width, height
- [x] **WASM bindings**: create/rename/delete collection, add/rename/delete mode, create/set/delete variable, bind/unbind, get_collections, get_bindings, apply_variables
- [x] **Variables panel**: Right pane "Variables" tab with collection CRUD, mode tabs, variable table with type-specific editors
- [x] **Binding UI**: Properties panel "Variable Bindings" section with bind/unbind per property, variable picker popup
- [x] **Backward-compatible serde**: Default empty collections/bindings for existing files
- [x] **Conditional visibility**: Per-node `VisibilityCondition` (variable_id + operator + value) — evaluated at render/hit-test time. Operators: Eq/NotEq/Gt/Lt/Gte/Lte/IsTrue/IsFalse. UI in Properties panel "Conditional Visibility" section. Also supports binding Boolean variables to `visible` property via variable mode switching

### Asset Library Panel
- [x] **Assets tab**: Right pane "Assets" tab alongside Properties/Agent/History/Inspect/Comments/Variables
- [x] **Search/filter**: Global search bar filters all asset types by name
- [x] **Components section**: Lists all components from ComponentStore with variant count, click to create instance at (100,100)
- [x] **Color Styles section**: Color swatch + name + hex value, click to apply to selected nodes
- [x] **Text Styles section**: Font preview "Ag" + name + font details, click to apply text style to selected nodes

### Section Nodes
- [x] **NodeKind::Section**: Page organization container (like Frame but with prominent title label)
- [x] **Rendering**: Rounded rect background (rgba(26,26,46,0.6)) + border + title label above section
- [x] **Children**: Supports child nodes (rendered inside, like Frame)
- [x] **WASM**: add_section(name, x, y, w, h) binding
- [x] **SVG export**: Exported as group with rect background (same as Frame/Group)
- [x] **Toolbar**: Section button (⇧S shortcut)
- [x] **Layers panel**: Section icon, container expand/collapse
- [x] **Hit test**: AABB bounds (same as all nodes)
- [x] **Constraints**: Section children support responsive resize constraints

### Responsive Resize Preview
- [x] **Fullscreen overlay**: Shows selected Frame at multiple breakpoints side by side
- [x] **Default breakpoints**: Mobile (375px), Tablet (768px), Desktop (1440px)
- [x] **Custom breakpoints**: Add/remove breakpoints via UI
- [x] **SVG-based rendering**: Uses export_node_svg after resize_node_with_constraints
- [x] **Scene snapshot/restore**: Preserves original scene state during preview generation
- [x] **Toolbar button**: Responsive icon + Cmd+Alt+R shortcut
- [x] **Keyboard**: Cmd+Alt+R toggle, Escape to close

### Measure Tool
- [x] **Alt+hover**: Hold Alt with selection → hover over another node to show distances
- [x] **Distance lines**: Red dashed lines (#ff3366) with px distance labels (pink pills)
- [x] **Edge-to-edge**: Shows horizontal and vertical gap distances between bounding boxes
- [x] **Overlap handling**: When nodes overlap, shows distances to individual edges
- [x] **Target highlight**: Hovered node outlined with red dashed border
- [x] **End ticks**: Perpendicular tick marks at measurement endpoints
- [x] **Pure TypeScript**: tools/measure.ts, no Rust changes needed

### Batch Rename
- [x] **Pattern-based rename**: {name} = original name, {n} = sequential number, {N} = zero-padded number
- [x] **Rust engine**: Scene.batch_rename() method with id list, pattern, start number
- [x] **WASM binding**: batch_rename_selection(pattern, start_num) with undo integration
- [x] **Dialog UI**: Modal dialog with pattern input, start number, live preview of tokens
- [x] **Context menu**: "Batch Rename…" option when 2+ nodes selected
- [x] **Keyboard shortcut**: Cmd/Ctrl+Shift+R
- [x] **Undo support**: Full undo via push_undo() before rename

### Slice Tool (Export Regions)
- [x] **NodeKind::Slice**: Non-rendering node that defines a rectangular export region
- [x] **Canvas overlay**: Green (#36b37e) dashed outline + name label
- [x] **Toolbar**: Slice button with K keyboard shortcut
- [x] **Properties panel**: Export section with scale selector (1x–4x) + Export PNG button
- [x] **WASM**: add_slice(name, x, y, w, h), get_slices() → JSON
- [x] **Layers panel**: Slice icon in node tree
- [x] **Export**: Crops canvas region at specified scale → PNG download
- [x] **Render/SVG skip**: Slice nodes excluded from normal rendering and SVG export

### Flow Connectors (Arrow Lines)
- [x] **NodeKind::Connector**: Arrow/line connecting two nodes or free points
- [x] **Fields**: start_node_id, end_node_id, start_x/y, end_x/y, path_type (straight/curved), start_arrow, end_arrow
- [x] **Canvas rendering**: Straight lines or cubic bezier curves, arrowheads, edge clipping to node bounds
- [x] **SVG export**: `<line>`/`<path>` with marker arrowheads
- [x] **WASM**: add_connector, set_connector_path_type, set_connector_arrows, set_connector_endpoints, set_connector_nodes, get_connector_info, update_connector_bounds, get_connectors_for_node
- [x] **Toolbar**: Connector button with L keyboard shortcut, crosshair cursor
- [x] **Drag to connect**: Click/drag from source to target node, hit-test on both ends
- [x] **Properties panel**: Path type dropdown (Straight/Curved), start/end arrow checkboxes
- [x] **Layers panel**: Connector icon in node tree
- [x] **Stroke support**: Color, width, dash pattern via existing stroke properties

## Bookmarks / Favorites

Quick-access bookmark system for nodes across pages.

### Engine (Rust)
- [x] `Node.bookmarked: bool` field with `#[serde(default)]` for backward compatibility
- [x] `Scene.toggle_bookmark()`, `is_bookmarked()`, `get_bookmarked_nodes()`, `get_all_bookmarked_nodes()`

### WASM Bindings
- [x] `toggle_bookmark(id)` → bool (new state)
- [x] `is_bookmarked(id)` → bool
- [x] `get_bookmarked_nodes()` → JSON (current page)
- [x] `get_all_bookmarked_nodes()` → JSON (all pages with page info)

### UI
- [x] **Layers panel**: ⭐ bookmark toggle per node (star icon, yellow when active)
- [x] **Bookmarks panel**: Right pane "Bookmarks" tab, grouped by page, click to navigate
- [x] **Keyboard shortcut**: ⌘⇧B to toggle bookmark on selected nodes
- [x] **Navigation**: Click bookmarked node → switch page + pan to center + select

## Export Preset Profiles

Save, manage, and apply named export configurations (format, scale, suffix) for quick batch exports.

### Storage
- [x] localStorage-based preset storage with default presets (iOS @1x/2x/3x, Android mdpi/xxhdpi, Web @2x, SVG)
- [x] ExportPreset interface: id, name, format (png/svg), scale (0.5-4x), suffix, quality

### UI
- [x] **Properties panel**: "Export" section for selected nodes (dropdown + active preset list)
- [x] **Per-node active presets**: Add/remove presets per node, stored in localStorage
- [x] **Preset editor modal**: Create/edit presets with name, format, scale, suffix fields
- [x] **Presets manager modal**: View all presets, delete individual, reset to defaults
- [x] **Batch export**: "Export N presets" button — downloads all active presets at once
- [x] **Format badges**: Color-coded PNG (blue) / SVG (purple) indicators

### Export Execution
- [x] PNG export: Uses editor.exportPng() with configurable scale
- [x] SVG export: Uses engine.export_node_svg() / export_svg()
- [x] Auto-naming: node name + suffix + format extension
