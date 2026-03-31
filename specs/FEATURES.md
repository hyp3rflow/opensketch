# OpenSketch Feature Log

## ✅ Implemented

### Core Engine
- [x] Scene graph (flat HashMap + tree via parent/children)
- [x] Node types: Rectangle, Ellipse, Text, Frame, Group
- [x] Properties: position, size, rotation, opacity, fill, stroke (color, width, dash, cap, join, align, visible), corner radius, shadows, blur
- [x] Multi-stroke: multiple strokes per node (Vec<Stroke>), each with visible toggle, add/remove/update
- [x] Layout grid overlay (Columns, Rows, Grid) on Frame nodes with Ctrl/Cmd+G toggle
- [x] Viewport: pan, zoom (scroll wheel with rAF batching)
- [x] Hit testing (reverse render order, respects visibility/lock)
- [x] Selection (single + multi-select + marquee drag-select, with resize handles)
- [x] Smart Selection: Cmd+click deep select into Frame/Group, "Select All with Same Fill/Stroke/Font/Kind" via context menu, "Select Similar" dialog (Cmd+Shift+A) with configurable criteria (color distance, size ratio, opacity, corner radius, font, stroke width thresholds), similarity scoring, group suggestions
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

### Keyboard Shortcuts Panel & Customization
- [x] Modal overlay toggled by Cmd+/ or ? key
- [x] All shortcuts organized by category (Tools, Edit, View, Boolean & Transform, Selection)
- [x] Real-time search/filter
- [x] ESC to close, backdrop click to close
- [x] Figma-style dark UI with kbd tags
- [x] **Custom key bindings**: Click ✎ on any shortcut → press new key combo to rebind
- [x] **Conflict detection**: Warns when binding already used, option to override & clear other
- [x] **Preset profiles**: Figma (default), Sketch, Adobe XD — dropdown selector
- [x] **JSON import/export**: Export custom bindings to file, import from file
- [x] **localStorage persistence**: Custom bindings saved to "opensketch-custom-shortcuts"
- [x] **Reset**: Per-shortcut reset (↺) and Reset All button
- [x] **ShortcutManager**: Singleton class with matches(), setBinding(), findConflict(), applyPreset()

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
- [x] Text transform: None/Uppercase/Lowercase/Capitalize (visual + SVG export + CSS codegen)
- [x] Text indent: first-line pixel offset (per-paragraph), properties panel number input
- [x] **Smart Text Flow**: linked text overflow between text nodes — when a text node uses Fixed sizing and content overflows, the overflow text can flow into a connected next text node. Flow chain visualization with dashed indigo bezier curves and arrow indicators. Properties panel UI for linking/unlinking text flow and viewing the chain.

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
- [x] **Component search & swap**: search components by name, view all instances, swap selected/all instances to different master component (Cmd+Shift+K)

### Alignment & Distribution
- [x] **Align**: left, center-H, right, top, center-V, bottom (multi-select, 2+ nodes)
- [x] **Distribute**: horizontal, vertical (3+ nodes, equal spacing)
- [x] **Properties panel UI**: 6 align buttons + 2 distribute buttons (shown on multi-select)
- [x] **Undo integration**: push_undo before every alignment action
- [x] **Dual API**: explicit IDs (`align_left(ids)`) + selection-based (`align_selection("left")`)
- [x] **Smart Tidy Up**: one-click equalize spacing + cross-axis center align (2+ nodes, Cmd/Ctrl+Shift+T, context menu)
- [x] **Smart Distribute**: detect uneven spacing between 3+ selected nodes, analyze gaps (mode/median), preview recommended gap with per-node move deltas, apply horizontal/vertical normalization with optional custom gap override. Popover UI in properties panel align section.

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

### SVG Import
- [x] Full SVG parser: `svg_import.rs` using `roxmltree` crate
- [x] Supported elements: `<rect>`, `<circle>`, `<ellipse>`, `<line>`, `<polyline>`, `<polygon>`, `<path>`, `<text>`, `<g>` (group), `<image>`
- [x] Path commands: M/m, L/l, H/h, V/v, C/c, S/s, Q/q, A/a (arc simplified to lineto), Z/z
- [x] Style parsing: fill (solid + gradient url(#id)), stroke (color, width, dash, cap, join), opacity
- [x] Gradient defs: `<linearGradient>`, `<radialGradient>` with stops
- [x] Color parsing: hex (#rgb/#rrggbb/#rrggbbaa), rgb()/rgba(), named colors
- [x] Transform: translate() and rotate() (applied to x/y/rotation)
- [x] Inline style attribute parsing (style="fill:red; stroke:blue")
- [x] WASM binding: `import_svg(svg_text, offset_x, offset_y)` → JSON array of created node IDs
- [x] TypeScript: `Editor.importSVG(text)`, `Editor.importSVGFile()` (file picker)
- [x] Toolbar: Import SVG button (file picker)
- [x] Drag & drop: SVG files dropped onto canvas are imported as nodes (not as image)
- [x] Auto-select imported nodes, undo support

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
- [x] **Focal point**: per-image focal point (0–1 normalized), affects cover-mode crop center
- [x] **Content-aware crop**: ImageCrop struct (x, y, w, h normalized), smart crop suggestions (Smart Fit, Rule of Thirds, Center, Square, 16:9, 4:3)
- [x] **WASM**: `set_image_focal_point`, `get_image_focal_point`, `set_image_crop`, `clear_image_crop`, `get_image_crop`, `get_image_info`, `suggest_crops`
- [x] **Properties panel**: focal point picker (48×48 canvas + crosshair), crop suggestion buttons, manual crop inputs, reset

### Zoom Controls
- [x] **Zoom to fit** (Cmd+1): fit all nodes in viewport with padding
- [x] **Zoom to 100%** (Cmd+0): reset zoom to 1x, keeping center stable
- [x] **Zoom to selection** (Cmd+2): fit selected nodes in viewport
- [x] **Zoom in/out**: +/- keys (1.25x/0.8x factor), center-stable
- [x] **Zoom controls UI**: bottom-left floating bar (−, percentage, +, fit button)
- [x] **Real-time zoom display**: rAF polling for wheel zoom updates
- [x] **Engine API**: `set_viewport()`, `get_scene_bounds()`, `get_selection_bounds()`

### Performance
- [x] **Scroll/Zoom inertia**: smooth deceleration after trackpad/wheel input stops (EMA velocity tracking, 0.92 friction, 80ms debounce)
- [x] Wheel event batching (accumulate dx/dy per rAF)
- [x] PointerEvent + setPointerCapture
- [x] Selection callbacks throttled via rAF
- [x] Single pointerdown handler (no dual mousedown)
- [x] **Viewport culling**: Nodes outside visible viewport are skipped during rendering (WASM-side AABB check with 100px margin)
- [x] **Frame time monitoring**: Per-frame timing with 60-frame rolling average, perf stats overlay (`editor.togglePerfStats()`)
- [x] **Render stats API**: `get_rendered_count()`, `get_culled_count()`, `get_node_count()` for monitoring
- [x] **Visible nodes query**: `get_visible_nodes(x, y, w, h)` returns node IDs within viewport for TS-side optimizations
- [x] **Canvas Performance Profiler**: Full profiler panel (⌘⇧P) with rolling FPS graph, per-node complexity scoring (Rust), top-10 expensive nodes ranking, heatmap overlay, optimization suggestions, memory tracking
- [x] **LOD (Level of Detail)**: Zoom-adaptive rendering — at low zoom (<0.35) text nodes render as solid boxes, at very low zoom (<0.15) or tiny screen area all nodes simplified to colored rectangles
- [x] **FPS Counter**: Dedicated bottom-left FPS overlay (⌘⇧F) showing real-time FPS + rendered/culled node counts, color-coded (green/yellow/red)
- [x] **requestIdleCallback deferred tasks**: Non-critical work (image cache cleanup) scheduled via `requestIdleCallback` to avoid blocking render frames

### Desktop (Tauri v2)
- [x] Project scaffolded (`src-tauri/`)
- [x] Config: 1440×900 window, Vite dev server integration
- [x] Tauri v2 build working (`npx @tauri-apps/cli build`)
- [x] Icons generated (512px PNG → all platform icons via `tauri icon`)
- [x] Workspace Cargo.toml includes `src-tauri` member
- [x] beforeBuildCommand/beforeDevCommand configured for Vite
- [x] Release binary: `target/release/opensketch-desktop`

## Plugin API (Extensible Tool/Panel System)

- [x] **Plugin types**: Plugin, PluginAPI, PluginPanel, PluginToolbarButton, PluginMenuItem, PluginCommand interfaces
- [x] **PluginManager**: register/activate/deactivate/unregister lifecycle, event bus, UI extension registry
- [x] **Scene API**: Read (getNodeJson, getSceneJson, getSelection) + Mutate (addRect/Ellipse/Text/Frame, removeNode, setFill/Position/Size/Name, select/deselectAll)
- [x] **UI extensions**: registerPanel, addToolbarButton, addMenuItem, registerCommand, showNotification
- [x] **Events**: selection:change, layers:change, node:create, node:delete, tool:change, save
- [x] **Plugin panel**: Right pane "Plugins" tab with plugin list, enable/disable toggle, plugin sub-panels
- [x] **Sample: Lorem Ipsum**: Text generation with type/count options, fill selected, toolbar quick button
- [x] **Sample: Color Palette**: 4 curated palettes (Material/Pastel/Monochrome/Ocean), click-to-apply
- [x] **External registration**: `window.__pluginManager` for runtime plugin loading
- [x] **Auto-cleanup**: Deactivation removes all event listeners, panels, buttons, menu items

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
- [x] **Gradient mesh fills**: Multi-point color interpolation on 2D grid (MeshGradient), bilinear tessellation rendering, mesh edit mode (double-click to enter, drag points, click to change colors), rows/cols adjustment, SVG export fallback
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
  - Pressure sensitivity: stylus PointerEvent.pressure → per-point variable stroke width, auto-detect pen input, Properties panel toggle
  - **Variable-width stroke**: per-point stroke_width field, rendered as filled outline shape
    - WASM: path_set_point_stroke_width, path_get_point_stroke_width, has_variable_stroke, path_get_stroke_profile
    - Properties panel: toggle + start/end width inputs + profile preview canvas
    - SVG export: variable-width paths exported as filled outline `<path>`
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
- [x] **Smart Object Snapping (Point-level)**: Vector/path editing point snapping + angle constraints
  - Snap anchor points to other path/VN points, node edges/centers, ruler guides
  - Angle constraint: Shift key → snap to 0°/45°/90° increments (pen tool, anchor drag, handle drag)
  - Visual feedback: diamond markers (blue=point, green=grid, magenta=edge) + crosshairs
  - Pen tool: snap new points to existing geometry, Shift+click for angle-constrained placement
  - VN vertex drag: same snapping behavior as path points
  - Pure TypeScript implementation (`tools/point-snap.ts`), reuses existing smart-guides infrastructure
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
  - Interaction struct: trigger (OnClick/OnHover/OnPress/OnDrag/OnSwipeLeft/OnSwipeRight/OnSwipeUp/OnSwipeDown/OnLongPress/OnPinchIn/OnPinchOut), action (NavigateTo/Back/ScrollTo/OpenOverlay/CloseOverlay), target node/page ID, transition type (Instant/Dissolve/SmartAnimate/SlideIn/SlideOut/Push), duration, easing (linear/ease_in/ease_out/ease_in_out/cubic_bezier:x1,y1,x2,y2), easing (Linear/EaseIn/EaseOut/EaseInOut/CubicBezier)
  - WASM API: add_interaction (with easing param), remove_interaction, clear_interactions, get_interactions, get_interaction_count, get_all_interactions, set_interaction_easing
  - Properties panel: "Interactions" section with trigger/action/target/transition/duration/easing editors, add/remove
  - Easing curve editor: SVG-based 120×120 cubic-bezier editor with draggable control points, preset buttons (Linear/EaseIn/EaseOut/EaseInOut/Custom), inline in interaction section
  - Prototype viewer: full-screen overlay, click navigation, back stack, Esc to close
  - Animated transitions: Dissolve (cross-fade), SlideIn (from right), SlideOut (old exits right), Push (both move), SmartAnimate (name-matched node interpolation with position/size cross-fade)
  - SmartAnimate: Rust engine `compute_auto_animate(from, to)` matches descendants by name, returns paired snapshots with full property diffs (position, size, rotation, opacity, corner_radius, blur, fill color, stroke width)
  - SmartAnimate rendering: matched nodes interpolate all properties with cubic ease-in-out, rotation via canvas transform, rounded clip for corner_radius, removed nodes fade out, added nodes fade in
  - Toolbar: Play button (▶), keyboard shortcut Cmd+Enter
  - Interaction hotspot hints (color-coded: blue=click, green=gesture, orange=hover)
  - Gesture-based interactions: swipe (left/right/up/down), long-press (500ms), pinch in/out
  - Touch event handling in prototype viewer: swipe detection (>50px, <500ms), long-press timer, two-finger pinch distance ratio
  - Gesture trigger labels shown on hotspot hints in preview

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
- [x] **IndexedDB storage**: migrated from localStorage to IndexedDB (OfflineStore class, idb-keyval pattern, no external deps)
- [x] **localStorage migration**: auto-migrates existing data to IndexedDB on first run
- [x] **Service Worker**: cache-first strategy for static assets (HTML/JS/CSS/WASM), network-first for navigation, version-based cache invalidation
- [x] **Offline indicator**: top-center status bar (🟢 Online / 🔴 Offline + pending count), auto-hide when online
- [x] **Sync queue**: offline operation queue (SyncQueue class), auto-flush on reconnect, stub for future server sync

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

### Design Tokens Export
- [x] **Multi-format export**: W3C DTCG, Style Dictionary, Tailwind CSS theme config
- [x] **Sources**: Color styles, text styles, and variable collections (all modes)
- [x] **W3C DTCG format**: $type/$value/$description, typography composite values, $extensions.modes for multi-mode variables
- [x] **Style Dictionary format**: value/type pairs, nested typography tokens (fontFamily/fontSize/fontWeight/lineHeight)
- [x] **Tailwind format**: theme.extend with colors, fontFamily, fontSize, spacing from number variables
- [x] **Rust design_tokens.rs**: TokenFormat enum, export_design_tokens() function
- [x] **WASM**: export_design_tokens(format) binding
- [x] **TS Editor**: exportDesignTokens(), downloadDesignTokens() methods
- [x] **UI**: Properties panel empty state "Design Tokens" section (3 format buttons), Inspect panel "Design Tokens" download section
- [x] **File naming**: .json for W3C/StyleDictionary, .js (module.exports) for Tailwind, .css for CSS Variables
- [x] **CSS Variables format**: :root { --color-*, --font-family-*, --font-size-*, --font-weight-*, --line-height-* } + variable collections
- [x] **Design Token Export modal**: Format selection cards (W3C/Style Dictionary/Tailwind/CSS Variables), live preview, copy to clipboard, download

### Style Versioning
- [x] **Version snapshots**: Save current style library state as a named version (tag + description + timestamp)
- [x] **Version list**: Browse all saved versions (max 50, auto-trimmed)
- [x] **Diff**: Compare any version against current styles — shows added/removed/modified color & text styles with details
- [x] **Diff between versions**: Compare any two saved versions
- [x] **Rollback**: Restore styles to a previous version (auto-saves current state before rollback)
- [x] **Rust StyleStore**: StyleVersion, StyleDiffEntry structs, create/list/remove/rollback/diff methods
- [x] **WASM**: style_version_create, style_version_list, style_version_remove, style_version_rollback, style_version_diff, style_version_diff_current
- [x] **UI**: Properties panel empty state "Style Versions" section — create modal, version list, diff modal, rollback confirm, delete
- [x] **Backward-compatible serde**: versions field with #[serde(default)]

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
- [x] **@mention support**: Parse @username patterns in comment/reply text, highlight with blue styling
- [x] **Mention autocomplete**: Typing @ in comment/reply textarea shows dropdown of known users
- [x] **Assignee field**: Comments can have an assignee (👤 button in thread popup)
- [x] **Mentions extraction**: Rust-side parse_mentions() extracts all @mentions, stored in Comment.mentions[]
- [x] **Comment filters**: Panel filter tabs — All / Unresolved (with count) / @Me (mentions + assigned)
- [x] **WASM bindings**: set_comment_assignee, get_comments_by_mention, get_unresolved_comment_count
- [x] **Notification badge**: Comments tab shows red unresolved-count badge, auto-updates on changes

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
- [x] **Variable scoping**: VariableScope enum (Global/Pages/Nodes) per collection — restricts variable usage to specific pages or frames. apply_variables() skips out-of-scope bindings. Scope UI in Variables panel: dropdown (Global/Pages/Nodes) + page checkboxes or frame picker. WASM: set_collection_scope, get_collection_scope. Backward-compatible serde (default Global).

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

### Responsive Auto-Layout Preview (Interactive)
- [x] **On-canvas drag resize**: Frame edge handles (left/right/bottom) for real-time auto-layout preview
- [x] **Breakpoint indicator**: Top bar ruler with breakpoint markers, active breakpoint label on canvas
- [x] **Breakpoint snapping**: Width snaps to nearby breakpoint values while dragging (8px threshold)
- [x] **Live dimension display**: Shows current width × height near frame, width measurement arrows below
- [x] **Breakpoint guide lines**: Vertical dashed lines at each breakpoint width on canvas
- [x] **Reset/Done/Cancel**: Top bar controls — Reset to original, Done (apply), Cancel (Esc to restore)
- [x] **Auto-layout recalculation**: Flex/Grid layout, Hug/Fill sizing, breakpoint overrides all update in real-time
- [x] **Keyboard**: Cmd+Alt+R toggle, Escape to cancel, Enter to apply
- [x] **Default breakpoints**: Mobile S (320), Mobile (375), Tablet (768), Laptop (1024), Desktop (1440)
- [x] **Pure TypeScript**: ui/responsive-resize.ts, integrated into Editor pointer/render pipeline

### Responsive Auto-Layout Preview
- [x] **Real-time layout recomputation**: During resize handle drag, auto-layout children (Flex/Grid) are repositioned every frame
- [x] **Hug/Fill sizing**: Children with Fill sizing expand/shrink with parent; Hug parents auto-shrink to fit
- [x] **Min/Max content sizing**: Hug mode respects min_width/max_width/min_height/max_height constraints via clamp_size()
- [x] **Text overflow (Clip/Ellipsis)**: TextOverflow enum (Visible/Clip/Ellipsis), word-wrapping in Fixed text sizing, single-line and multi-line ellipsis truncation, clip region for overflow hidden, text-align support in rendering, Properties panel overflow mode toggle
- [x] **Breakpoint indicator**: Shows active breakpoint label + current width as floating pill above the resized frame
- [x] **resize_node_with_layout**: Combined WASM method for resize + immediate layout recomputation
- [x] **compute_layout**: Explicit WASM method for triggering layout recomputation from TypeScript
- [x] **get_active_breakpoint_info**: Returns active breakpoint label/max_width as JSON for UI indicators

### Responsive Token System
- [x] **Global breakpoint presets**: Scene-level responsive presets (id, label, width, height)
- [x] **Variable-mode mapping**: Each preset maps variable collections to specific modes
- [x] **Auto-switching**: `set_preview_width(w)` finds matching preset and switches all mapped collection modes
- [x] **Activate/deactivate**: Manual preset activation via UI chips or activate_preset()
- [x] **Default device presets**: Mobile S/Mobile/Tablet/Laptop/Desktop/Wide
- [x] **Custom presets**: Add via prompt dialog
- [x] **UI panel**: Modal panel (⌘⌥T) with preset chips, cards, mode mapping dropdowns
- [x] **Preview integration**: Responsive preview auto-switches token modes per breakpoint
- [x] **Rust**: Scene fields (ResponsiveState, ResponsivePreset), CRUD + activate + set_preview_width
- [x] **WASM**: 8 bindings (add/remove/update preset, set/remove mode mapping, activate, set_preview_width, get presets, get active)
- [x] **Backward-compatible**: serde(default) on new fields
- [x] **Toolbar**: Tokens button (⚡ icon) + ⌘⌥T shortcut

### Measure Tool
- [x] **Alt+hover**: Hold Alt with selection → hover over another node to show distances
- [x] **Distance lines**: Red dashed lines (#ff3366) with px distance labels (pink pills)
- [x] **Edge-to-edge**: Shows horizontal and vertical gap distances between bounding boxes
- [x] **Overlap handling**: When nodes overlap, shows distances to individual edges
- [x] **Target highlight**: Hovered node outlined with red dashed border
- [x] **End ticks**: Perpendicular tick marks at measurement endpoints
- [x] **Pure TypeScript**: tools/measure.ts, no Rust changes needed

### Persistent Measure Tool
- [x] **Measure tool mode**: Toolbar button (M shortcut), crosshair cursor
- [x] **Click+drag to place**: Permanent measurement lines on canvas
- [x] **Scene storage**: MeasureLine struct in Rust (id, start/end points, unit, label, visible, page_id)
- [x] **Node edge snapping**: Snap to edges, centers, and midpoints of nodes (8px threshold)
- [x] **Distance label**: Auto-calculated px distance with pill background
- [x] **Selection**: Click existing line to select (orange highlight + glow)
- [x] **Delete**: Delete/Backspace removes selected measure line
- [x] **Unit support**: px/rem/% units (WASM set_measure_unit)
- [x] **Visibility toggle**: Show/hide individual lines
- [x] **Preview while dragging**: Semi-transparent preview line during placement
- [x] **Undo/Redo**: Full undo integration
- [x] **Per-page**: Measure lines are page-scoped
- [x] **Backward-compatible serde**: #[serde(default)] on all new fields

### Batch Rename
- [x] **Pattern-based rename**: {name} = original name, {n} = sequential number, {N} = zero-padded number
- [x] **Find/Replace mode**: case-sensitive/insensitive text find & replace in node names
- [x] **Regex mode**: regex pattern matching with capture group references ($1, $2)
- [x] **Rust engine**: Scene.batch_rename(), batch_find_replace(), batch_rename_preview() methods
- [x] **WASM bindings**: batch_rename_selection, batch_find_replace_selection, batch_rename_preview, batch_find_replace_preview, batch_rename_preview_ex
- [x] **Dialog UI**: Modal dialog with mode tabs (Pattern / Find & Replace), live preview, regex toggle
- [x] **Separate module**: ui/batch-rename.ts standalone file
- [x] **Context menu**: "Batch Rename…" option when 2+ nodes selected
- [x] **Layers panel**: Right-click context menu with "Batch Rename…" for multi-selection
- [x] **Keyboard shortcut**: Cmd/Ctrl+Shift+R
- [x] **Undo support**: Full undo via push_undo() before rename

### Slice Tool (Export Regions)
- [x] **NodeKind::Slice**: Non-rendering node that defines a rectangular export region
- [x] **Canvas overlay**: Green (#36b37e) dashed outline + name label
- [x] **Toolbar**: Slice button with K keyboard shortcut
- [x] **Properties panel**: Full export section with per-slice export item list
  - Multiple export items per slice (add/remove)
  - Scale selector (0.5x–4x) per item
  - Format selector (PNG/JPG/SVG) per item
  - Suffix input per item (e.g. "@2x", "-thumb")
  - Quick "iOS set" button (adds @1x/@2x/@3x PNG presets)
  - Batch export all variants at once
- [x] **WASM**: add_slice(name, x, y, w, h), get_slices() → JSON, export_region_svg(x, y, w, h)
- [x] **Layers panel**: Slice icon in node tree
- [x] **Export formats**:
  - PNG: Canvas crop at specified scale → PNG download
  - JPG: Canvas crop with white background → JPEG download (quality 0.92)
  - SVG: Engine-side region export via export_region_svg → SVG download
- [x] **Multi-resolution export**: exportSliceBatch() downloads multiple scale/format variants with staggered timing
- [x] **Render/SVG skip**: Slice nodes excluded from normal rendering and SVG export
- [x] **Per-slice settings persistence**: Export items saved to localStorage per slice ID

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

### Anchor / Link Points on Shapes
- [x] **AnchorPosition enum**: Top, Right, Bottom, Left, Center, Custom(f64, f64) — position on node bounding box
- [x] **AnchorPoint struct**: position + offset, stored in Node.anchors (custom anchors, serde-default backward-compatible)
- [x] **Default anchors**: All nodes get Top/Right/Bottom/Left automatically (no storage needed)
- [x] **get_anchor_world_pos**: Computes world-space anchor position with rotation support
- [x] **snap_to_nearest_anchor**: Scene-wide nearest-anchor search with threshold
- [x] **Connector anchor fields**: start_anchor/end_anchor (Option<AnchorPosition>) on Connector variant
- [x] **update_connector_bounds**: Uses anchor positions instead of node center when anchors are set
- [x] **WASM bindings**: get_node_anchors, add_custom_anchor, remove_custom_anchor, snap_to_anchor, connect_to_anchor, disconnect_anchor
- [x] **UI: Anchor rendering**: Blue circles on node edges when hovering with connector tool
- [x] **UI: Auto-snap**: Connector drag snaps to nearest anchor (12px screen threshold)
- [x] **UI: Snap highlight**: Snapped anchor shown as filled blue circle with white border
- [x] **Properties panel**: Start/end anchor info display for selected connectors

## Table Node
- [x] **NodeKind::Table**: Row/column/cell structure with `rows`, `cols`, `cells: Vec<TableCell>`, `col_widths`, `row_heights`
- [x] **TableCell**: row, col, row_span, col_span, content, fill, text_align
- [x] **WASM bindings**: add_table, table_set_cell, table_get_cell, table_set_cell_fill, table_merge_cells, table_add_row/col, table_remove_row/col, table_set_col_width/row_height, table_import_csv, table_sort, table_get_info
- [x] **Canvas rendering**: Grid lines, cell fills, cell text with alignment
- [x] **SVG export**: Table → `<g>` with `<rect>`, `<line>`, `<text>` elements
- [x] **Toolbar**: Table button (B keyboard shortcut)
- [x] **Properties panel**: Rows/Cols display, +/- row/col buttons, CSV import, sort
- [x] **Cell editing**: Double-click cell → inline input, Tab to move to next cell, Enter/Escape to finish
- [x] **CSV paste**: Cmd+V with table selected → auto-detect TSV/CSV and import into table

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
- [x] **Layers panel search**: 🔍 filter layers by name/kind, highlight matches, auto-expand tree, match count
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

## Batch Export (ZIP)
Multi-node/page bulk export with ZIP download.

### Features
- [x] **Batch export dialog**: Cmd+Shift+E or toolbar button
- [x] **Node + page selection**: Checkbox list of all pages and root-level nodes (selected nodes pre-checked)
- [x] **Per-item format/scale**: PNG or SVG, 0.5x–4x per item
- [x] **Quick actions**: Select All/None, All PNG/SVG, global scale selector, apply preset
- [x] **ZIP download**: fflate compression, auto-named files, deduplication
- [x] **Page export**: Switches active page temporarily, restores after
- [x] **Integration**: Export preset profiles applicable to batch items

### Files
- `packages/app/src/ui/batch-export.ts`

## Lottie Animation Export

Export nodes/frames as Lottie JSON (bodymovin v5.7+).

### Engine (Rust)
- [x] `lottie_export.rs`: Node → Lottie layer conversion
- [x] Shape layers: Rect, Ellipse, Star, Polygon, Path (bezier)
- [x] Group/Frame → precomp layers with recursive children
- [x] Text → text layer (font, size, color)
- [x] Fill: Solid → fl, Linear/Radial gradient → gf
- [x] Stroke: color, width, dash, linecap, linejoin
- [x] Transform: position, scale, rotation, opacity (animated or static)
- [x] Easing: Linear, EaseIn, EaseOut, EaseInOut, CubicBezier
- [x] Blend mode mapping (16 modes)
- [x] LottieExportConfig: fps, duration_secs, looping

### WASM Bindings
- [x] `export_lottie(clip_id)` — clip-based export
- [x] `export_all_lottie()` — all clips
- [x] `export_node_lottie(node_id, config_json)` — single node + children
- [x] `export_selection_lottie(config_json)` — current selection

### UI
- [x] Export dialog: FPS selector (24/30/60), duration, loop toggle
- [x] Animation track info display
- [x] JSON preview with size indicator
- [x] Download .json button, clipboard copy
- [x] Toolbar button (play icon)
- [x] Animation timeline integration (📦 button)

### Files
- `crates/engine/src/lottie_export.rs`
- `packages/app/src/ui/lottie-export.ts`

## Cursor Presence Indicators

Simulated multi-user cursor display for collaboration readiness.

### Core
- [x] RemoteCursor data model: id, name, color, x/y (world coords), selectedIds, tool, lastSeen
- [x] CursorPresence class: add/update/remove cursors, auto-cleanup stale cursors
- [x] 10 preset colors, auto-assignment

### Rendering
- [x] Colored arrow cursor (Figma-style pointer) with white outline + shadow
- [x] Name label pill (rounded rect with user color + white text)
- [x] Fade-out animation for stale cursors (10s timeout, 2s fade)
- [x] Selection highlights: dashed colored rectangles around remote-selected nodes

### Demo Simulation
- [x] `startDemo()`: 3 fake users (Alice, Bob, Carol) with smooth random movement
- [x] Toolbar toggle button (Users icon)
- [x] `editor.toggleCursorDemo()` API
- [x] `editor.cursorPresence` getter for external integration (WebSocket, WebRTC)

## Accessibility Checker

Right pane "A11y" tab — automated accessibility audit for design nodes.

### Engine
- [x] Rust `accessibility.rs`: Dedicated WCAG 2.1 module (relative luminance, contrast ratio, check_accessibility → Vec<A11yIssue>)
- [x] Issue types: LowContrast, MissingAltText, SmallText (< 12px), TouchTargetTooSmall (< 44×44)
- [x] WASM: `check_accessibility()` → JSON array (serde)

### Checks
- [x] WCAG 2.1 contrast ratio: Text foreground vs parent fill background, AA (4.5:1 / 3:1 large) and AAA (7:1 / 4.5:1 large) levels
- [x] Touch target size: Warns leaf nodes smaller than 44×44px (WCAG 2.5.5)
- [x] Image alt text: Flags Image nodes with generic names ("Image N")
- [x] Text size minimum: Warns text below 12px

### UI
- [x] Summary badges: error/warning/info counts
- [x] Issues grouped by category (Contrast, Alt Text, Touch Target, Text Size)
- [x] Severity color-coded (red error, amber warning, blue info)
- [x] Click issue → select node + zoom to selection
- [x] Re-check button for manual re-audit

### Smart Color Accessibility Fix
- [x] Rust: HSL-based color adjustment — find closest WCAG-compliant color preserving hue/saturation
- [x] Binary search on lightness in both directions (darker/lighter), picks minimum change
- [x] Fallback to black/white if no solution found
- [x] WASM: get_a11y_fixes() → JSON array of fix suggestions (current/suggested color, ratios)
- [x] WASM: apply_a11y_fix(node_id, r, g, b) — apply single fix with undo
- [x] WASM: apply_all_a11y_fixes() → batch fix all contrast violations with undo
- [x] UI: Per-issue "Fix" button with color preview (current → suggested, ratio display)

### Enhanced (v2)
- [x] Node `alt_text: Option<String>` field — explicit alt text for Image nodes (serde default, backward compatible)
- [x] `suggest_fix_color()` — luminance-based WCAG AA color suggestion in accessibility.rs
- [x] LowContrast issues include specific suggested hex color in message
- [x] WASM: `run_accessibility_audit()`, `set_alt_text(id, text)`, `get_alt_text(id)`
- [x] UI: Inline alt text editor for MissingAltText issues (input + Set button)
- [x] Cmd+Shift+A shortcut to open A11y panel tab
- [x] UI: "Fix All (N)" button in header to batch-fix all contrast issues
- [x] Undo integration for all fixes

### Scrollable Frames (Overflow Control)
- [x] Node.overflow: Visible (default), Hidden, Scroll
- [x] Node.scroll_x / scroll_y: scroll offset for Scroll mode
- [x] Canvas rendering: clip children to frame bounds (Hidden/Scroll), translate children by scroll offset (Scroll)
- [x] Scrollbar indicators: thin semi-transparent thumb bars (vertical/horizontal), auto-sized based on content ratio
- [x] Mouse wheel scroll: intercepts wheel events on scrollable frames, clamps to content bounds
- [x] SVG export: clipPath for overflow Hidden/Scroll, transform for scroll offset
- [x] WASM: set_overflow, get_overflow, set_scroll_offset, get_scroll_offset, get_content_bounds
- [x] Properties panel: Overflow section (Visible/Hidden/Scroll toggle), scroll position display, reset button
- [x] Inspect panel: overflow CSS generation (hidden/auto)
- [x] Backward-compatible serde (default Visible, scroll 0,0)

## Scrollable Frames

Frame overflow control and content scrolling.

### Overflow Modes
- [x] Visible (default): children render outside frame bounds
- [x] Hidden: children clipped to frame bounds
- [x] Scroll: children clipped + scroll wheel to pan content

### Implementation
- [x] Overflow enum (Visible/Hidden/Scroll) on Node
- [x] scroll_x, scroll_y fields on Node
- [x] Canvas rendering: clip path for Hidden/Scroll, translate for scroll offset
- [x] Scrollbar indicators (thin white semi-transparent thumbs)
- [x] Wheel event: scroll within scrollable frames (non-zoom wheel)
- [x] Content bounds calculation for scroll clamping
- [x] SVG export: clipPath + translate for overflow frames
- [x] WASM: set_overflow, get_overflow, set_scroll_offset, get_scroll_offset, get_content_bounds
- [x] Properties panel: Overflow mode buttons (Visible/Hidden/Scroll), scroll offset display, reset button
- [x] Backward-compatible serde (default Visible)

### Bitmap Filters (CSS filter effects)
- [x] BitmapFilter struct (brightness/contrast/saturation/hue_rotate/invert/grayscale/sepia)
- [x] Canvas rendering via ctx.filter CSS string (combined with existing blur)
- [x] SVG export with feComponentTransfer + feColorMatrix
- [x] WASM: set/get/remove bitmap_filter, enable toggle
- [x] Properties panel: slider + input UI in Effects section
- [x] Inspect panel: filter CSS output
- [x] Backward-compatible serde

### Tauri Desktop Build
- [x] Tauri v2 scaffold (src-tauri/): Cargo.toml, tauri.conf.json, main.rs, build.rs, capabilities
- [x] macOS .app bundle generation (cargo tauri build --bundles app)
- [x] Vite frontend integration (devUrl: localhost:5174, frontendDist: packages/app/dist)
- [x] Window config: 1440x900, resizable, CSP disabled for WASM
- [x] npm scripts: tauri:dev, tauri:build
- [x] Workspace Cargo.toml includes src-tauri member

### Responsive Breakpoints
- [x] Breakpoint struct: label, max_width, optional overrides (direction, layout_mode, gap, padding, align_items, justify_content, wrap, grid_columns, hidden_children)
- [x] Node.breakpoints: Vec<Breakpoint> — per-frame breakpoint rules sorted by max_width
- [x] Layout engine: resolve_layout_with_breakpoints() applies overrides during layout computation without mutating stored layout
- [x] Breakpoint-hidden children: temporarily hidden during layout, restored after
- [x] WASM: add_breakpoint, remove_breakpoint, update_breakpoint, get_breakpoints, get_breakpoint_count, get_active_breakpoint
- [x] Properties panel: Breakpoints section (under Auto Layout), add/remove/edit breakpoints, label/max_width/direction/gap/wrap overrides
- [x] Active breakpoint badge indicator
- [x] Backward-compatible serde (default empty vec)

### Design Handoff Mode
- [x] Dedicated "Handoff" tab in right pane (replaces old Inspect tab)
- [x] **Design Spec Summary**: dimensions, position, rotation, opacity, border-radius, fill color (hex+RGB swatch), stroke, font properties (family/size/weight/line-height/tracking), layout info (mode/gap/padding) — Zeplin/Figma Inspect style
- [x] **Code generation tabs**: CSS / Tailwind / SwiftUI / Kotlin Compose / SVG
- [x] **Tailwind code gen**: utility classes for size, position, radius, rotation, opacity, bg color, border, shadow, blur, text (size/weight/style/align/decoration/color/font-family), layout (flex/grid/gap/padding), overflow
- [x] SwiftUI code gen: Text, Image, Rectangle, Ellipse, RoundedRectangle, fill, stroke, frame, position, rotation, opacity, shadow, blur, blend mode, font properties, text decoration
- [x] Kotlin Compose code gen: Text, Box, Image, Modifier chain (size, offset, clip, background, border, rotate, alpha, shadow, blur), layout (Column/Row), font/text properties
- [x] **Asset export**: PNG @1x, PNG @2x, SVG — per-node one-click download
- [x] **Spacing overlay toggle**: enables Alt+Hover measurement mode from within handoff panel
- [x] **Handoff checklist**: Auto-generated dev handoff readiness report — naming, styles, components, assets, text, layout, export checks with severity levels, progress bar, click-to-select offending nodes
- [x] Design tokens export: W3C DTCG, Style Dictionary, Tailwind Config
- [x] Syntax highlighting for all languages (VS Code-style colors)
- [x] CSS gen: bitmap filter support, gradients, blend modes, layout, text properties

### Gradient Editor on Canvas
- [x] GradientEditor class (packages/app/src/ui/gradient-editor.ts)
- [x] Linear gradient: start/end point handles with connecting line overlay
- [x] Radial gradient: center point + radius handle with circle preview
- [x] Drag handles to edit gradient direction/position/size in real-time
- [x] Normalized coordinates (0-1) mapped to node bounds
- [x] Bidirectional sync with Properties panel
- [x] Undo integration (push_undo on first drag move)
- [x] Integrated into editor render loop and pointer event pipeline
- [x] Visual: colored handles (indigo start, emerald end), white outline for visibility

### Flex Wrap (Smart Auto-Layout Wrapping)
- [x] FlexWrap enum (NoWrap/Wrap) in Rust engine
- [x] compute_flex wraps children into multiple lines when total exceeds container main axis
- [x] Per-line cross-axis sizing (each wrap line gets its own height/width)
- [x] Per-line justify/align calculations (SpaceBetween, SpaceAround, SpaceEvenly work per line)
- [x] Fill sizing distributed per-line (not globally)
- [x] WASM: set_flex_wrap(id, "wrap"/"nowrap")
- [x] Properties panel: Wrap toggle button in Auto Layout direction row
- [x] Breakpoint overrides support wrap field
- [x] Backward-compatible (default NoWrap)

### Auto Layout Spacing Handles
- [x] SpacingHandle interface (packages/app/src/tools/spacing-handles.ts)
- [x] findSpacingHandles(): detects gap regions between auto-layout children
- [x] hitTestSpacingHandle(): hit-test with min 6px grab zone for thin gaps
- [x] renderSpacingHandles(): pink/magenta overlay with opacity variation (active vs idle)
- [x] Gap value label on hover/drag (pill badge with rounded rect)
- [x] Drag to adjust gap: row (col-resize cursor) / column (row-resize cursor)
- [x] Real-time gap update via engine.set_layout_gap() WASM binding
- [x] Filters out invisible and absolute-positioned children
- [x] Integrated into editor select tool (mousedown/mousemove/mouseup + render loop)
- [x] Undo integration (push_undo before drag starts)

### Auto Layout Spacing Presets
- [x] Spacing presets panel: XS(4) / S(8) / M(12) / Base(16) / L(24) / XL(32) / 2XL(48)
- [x] Combined presets: one-click apply gap + uniform padding
- [x] Gap-only presets row: 0/4/8/12/16/24/32/48px
- [x] Padding-only presets row: 0/4/8/12/16/24/32/48px
- [x] Active state highlighting (indigo) for current values
- [x] Hover feedback, undo integration
- [x] Located in Properties panel Auto Layout section (below padding inputs)

### Text on Path (SVG textPath style)
- [x] Node.text_path_id: Optional<NodeId> — links a Text node to a Path node
- [x] Node.text_path_offset: f64 (0.0–1.0) — start offset along the path
- [x] path_utils.rs: path_length, point_at_length, text_positions_on_path, path_to_svg_d
- [x] Canvas rendering: per-character positioning along bezier path with tangent rotation
- [x] SVG export: <defs><path/></defs> + <text><textPath href startOffset>
- [x] WASM: set_text_path, clear_text_path, set_text_path_offset, get_text_path_info, get_text_on_path_positions, get_path_svg_d
- [x] Properties panel: Text Path section — attach/detach, offset slider, path name display
- [x] Backward-compatible serde (default None/0.0)

## Animation Timeline (Keyframe Animation)
- [x] Rust: animation.rs — Easing (Linear/EaseIn/EaseOut/EaseInOut/CubicBezier), AnimProperty (x/y/width/height/rotation/opacity/corner_radius/blur/fill colors/stroke_width), Keyframe, AnimationTrack, AnimationClip, AnimationStore
- [x] Keyframe interpolation with easing functions, cubic-bezier support
- [x] AnimationClip: multiple tracks, looping, duration override
- [x] Scene integration: AnimationStore in SceneData + Scene, backward-compatible serde
- [x] Scene methods: anim_add/remove/rename clip, set_looping, set_duration, add/remove keyframe, apply (mutate nodes at time), get_clips_json, get_clip_json
- [x] WASM bindings: anim_add_clip, anim_remove_clip, anim_rename_clip, anim_set_looping, anim_set_duration, anim_add_keyframe, anim_remove_keyframe, anim_apply, anim_get_clips, anim_get_clip, anim_get_duration, anim_record_selected
- [x] TS: animation-timeline.ts — bottom dockable panel
- [x] Clip management: create/delete clips, select active clip
- [x] Playback: play/pause/stop, loop toggle, time scrubber, real-time playback
- [x] Track visualization: per-node/property rows, keyframe diamonds, time ruler
- [x] Record button: record current property values (x,y,w,h,rotation,opacity) as keyframes for selected nodes
- [x] Scene snapshot save/restore on playback (non-destructive preview)
- [x] Zoom/scroll on timeline, right-click to delete keyframes
- [x] Keyboard shortcut: Alt+T to toggle timeline panel

## Variable-driven Animation
- [x] Rust: VariableBinding struct (collection_id, variable_id) on Keyframe
- [x] Keyframe.resolve_value(): resolves from active variable mode at runtime (Number → direct, Boolean → 0/1, Color → brightness)
- [x] AnimationTrack.value_at_with_vars(): interpolation with variable resolution
- [x] AnimationStore: bind_keyframe_to_variable, unbind_keyframe_variable, get_clip_variable_bindings, evaluate_clip_with_vars
- [x] Scene.anim_apply_with_vars(): applies animation with variable-resolved values
- [x] WASM: anim_bind_keyframe_variable, anim_unbind_keyframe_variable, anim_get_variable_bindings, anim_apply_with_vars, anim_get_bindable_variables
- [x] Timeline UI: green keyframe diamonds for variable-bound keyframes ("V" indicator)
- [x] Right-click context menu on keyframes: Delete, Unbind Variable, Bind to Variable (picker from bindable Number/Boolean variables)
- [x] Backward-compatible serde (variable_binding field skipped when None)

## Lottie Animation Export
- [x] Rust: lottie_export.rs — bodymovin v5.7+ JSON export from AnimationClip + Scene nodes
- [x] Supported shapes: Rect, Ellipse, Star, Polygon, Path (bezier), Text, Frame/Group (pre-comp)
- [x] Animated properties: position (X/Y), rotation, opacity, scale (ScaleX/ScaleY)
- [x] Easing mapping: Linear, EaseIn, EaseOut, EaseInOut, CubicBezier → Lottie in/out tangents
- [x] Fill support: Solid, LinearGradient, RadialGradient (other types → fallback solid)
- [x] Stroke support: color, width, dash, lineCap, lineJoin
- [x] Blend modes: all 16 modes mapped to Lottie blend mode values
- [x] WASM: export_lottie(clip_id), export_all_lottie()
- [x] TS: Editor.exportLottie(), exportAllLottie(), downloadLottie()
- [x] Timeline UI: 📦 Lottie export button

## Motion Path Animation
- [x] AnimProperty::MotionPath — node follows a Path node, value = progress (0.0–1.0)
- [x] MotionPathConfig: path_node_id, orient_to_path (auto-rotate along tangent), rotation_offset
- [x] AnimationTrack.motion_path: Optional<MotionPathConfig> for MotionPath tracks
- [x] Scene anim_apply: resolves path geometry via path_utils, samples point+tangent at progress distance
- [x] Node centering on path point, optional orientation to tangent angle
- [x] WASM: anim_set_motion_path, anim_update_motion_path, anim_remove_motion_path, anim_get_motion_path, get_path_nodes
- [x] WASM: evaluate_motion_path(path_node_id, progress) → {x, y, angle} standalone evaluation
- [x] WASM: get_motion_path_samples(path_node_id, count) → [{x, y}] for visualization
- [x] WASM: export_svg_with_animations(clip_id) → SVG with `<animateMotion>` elements
- [x] SVG export: `<animateMotion>` with `<mpath>`, dur, repeatCount, rotate="auto" for orient
- [x] Timeline UI: 🛤 button to attach/detach motion path, path picker, duration input, orient toggle
- [x] Properties panel: "Motion Path" section — clip/path selector, duration, easing, auto-orient toggle, apply/remove buttons
- [x] Prototype viewer: requestAnimationFrame playback of all animation clips (including motion paths)
- [x] Canvas overlay: dashed blue arrow visualization of motion path when source node is selected
- [x] Track label: "🛤 Motion Path" for motion path tracks
- [x] Works with existing playback, looping, easing, and scene snapshot/restore
- [x] Backward-compatible serde (motion_path field skipped when None)

## Color Palette Generator
- [x] Rust: color_palette.rs — extract scene colors, HSL conversion, harmony generation, WCAG contrast
- [x] Color extraction: all fills (solid + gradient stops), strokes, shadows with usage count
- [x] Harmony palettes: Complementary, Analogous, Triadic, Tetradic, Shades (from any base color)
- [x] WCAG contrast checking: AA/AAA normal/large text, relative luminance calculation
- [x] WASM: extract_colors, generate_palettes, check_color_contrast
- [x] TS: color-palette-panel.ts — right pane "Palette" tab
- [x] Scene Colors view: grid of all used colors, click to generate harmonies, right-click to apply
- [x] Harmonies view: hex input + 5 generated palettes, click to apply or copy
- [x] Contrast view: all color pairs with ratio + AA/AAA badges, color-coded pass/fail
- [x] **Smart Design Theme Generation**: brand color → full design system palette
  - [x] Rust: generate_design_theme() — primary/secondary/accent/neutral + semantic (success/warning/error/info) scales
  - [x] 10-step lightness scale per group (50–900), semantic colors with fixed hues
  - [x] Neutrals derived from brand hue with low saturation
  - [x] WASM: generate_design_theme(brand_hex)
  - [x] TS: "Theme" tab in color palette panel — color picker + hex input, visual scale strips, click-to-apply

## Branching / Forking (Design Version Control)
- [x] Branch struct: id, name, parent_branch_id, created_at, base_snapshot, current_snapshot
- [x] Scene integration: branches Vec, active_branch_id, next_branch_id
- [x] create_branch(name): snapshot current state as base, create new branch and switch to it
- [x] switch_branch(id): save current branch state, restore target branch state
- [x] merge_branch(source, target): merge source nodes into target (add new, update modified)
- [x] delete_branch(id): remove branch (main branch protected)
- [x] list_branches(): all branches with active flag
- [x] rename_branch(id, name): rename any branch
- [x] get_branch_diff(id): compute added/modified/removed nodes vs base snapshot
- [x] WASM bindings: all 8 branch APIs with BigInt conversion
- [x] UI: branch-panel.ts — bottom-left dropdown, branch list popup, create/switch/delete/rename/merge
- [x] Diff preview popup: colored sections (green=added, yellow=modified, red=removed) before merge
- [x] Backward-compatible serde (existing files auto-migrate to single "main" branch)
- [x] Undo integration for all branch operations
- [x] **Visual diff overlay**: compare branches with colored canvas overlays
  - [x] VisualDiff struct: node positions/bounds for added/modified/removed nodes
  - [x] Modified nodes show previous position as ghost outline
  - [x] WASM: get_visual_diff(branch_a, branch_b), get_branch_visual_diff(branch_id)
  - [x] Canvas overlay: green=added, yellow=modified, red=removed (dashed borders + translucent fill)
  - [x] Diff panel: stats summary, opacity slider, label toggle, clickable node list (pan-to-node)
  - [x] Branch panel integration: diff button per branch + self-diff button on active branch

## Version Comments & Review Workflow
- [x] ReviewRequest struct: id, branch_id, title, description, status (Open/Approved/Rejected/Merged), reviewer, created_at, updated_at
- [x] ReviewComment struct: id, review_id, node_id (optional), text, author, timestamp, resolved
- [x] Scene storage: reviews Vec, review_comments Vec, next_review_id, next_review_comment_id
- [x] Scene methods: create_review, approve_review, reject_review, merge_review, add_review_comment, resolve_review_comment, get_reviews, get_review, get_review_comments
- [x] WASM bindings: all 9 review APIs with BigInt conversion + undo integration
- [x] Review panel (review-panel.ts): floating panel with Open/Closed tabs, review list, detail view
- [x] Review detail: diff summary (added/modified/removed counts), comment thread, approve/reject/merge buttons
- [x] Review comments: post with optional node attachment, resolve individual comments, navigate to node
- [x] Create review modal: title, description, reviewer fields — accessible from branch panel
- [x] Branch panel integration: "Request Review" button per non-main branch, review status badge (In Review / Approved)
- [x] Toolbar: Reviews toggle button
- [x] Merge via review: approved reviews enable merge button, which triggers branch merge
- [x] Backward-compatible serde (default empty vecs)

## AI Layout Suggestion
- [x] Heuristic analysis: detects row/column/grid arrangement of selected nodes
- [x] Gap detection: calculates average spacing, rounds to nice values
- [x] Alignment detection: start/center/end/stretch based on cross-axis position spread
- [x] Grid detection: groups nodes by rows, detects column count
- [x] Confidence score: 0-1 based on arrangement consistency
- [x] Floating suggestion card: shows mode, gap, alignment with Apply/Dismiss buttons
- [x] Apply: wraps selected nodes in auto-layout Frame with suggested settings
- [x] Keyboard shortcut: Cmd/Ctrl+Shift+L
- [x] Context menu: "✨ Suggest Layout" (2+ nodes selected)
- [x] LLM Agent tools: suggest_layout (analyze), apply_layout_suggestion (execute)
- [x] Agent panel commands: suggest-layout, apply-layout
- [x] Auto-dismiss after 15s

## Find & Replace
- [x] **Text search**: Find all Text nodes + node names matching query (case-sensitive toggle)
- [x] **Text replace**: Replace in single node or all matching nodes
- [x] **Color search**: Find nodes by fill color (hex, with tolerance ±2)
- [x] **Color replace**: Replace fill + stroke colors across all matching nodes
- [x] **Stroke color search/replace**: Find nodes by stroke color, batch replace stroke colors
- [x] **Font search/replace**: Find Text nodes by font family, batch replace font family
- [x] **Floating panel**: Cmd+F / Cmd+H toggle, Text/Fill/Stroke/Font 4-tab mode
- [x] **Result navigation**: Previous/Next with auto-select + pan-to-node
- [x] **Result list**: Scrollable results with kind badge, name, matched text/color preview
- [x] Rust: find_replace.rs (Scene methods: find_text, replace_text_in_node, replace_all_text, find_by_color, replace_color)
- [x] WASM: find_text, replace_text, replace_all_text, find_by_color, replace_color, find_by_stroke_color, replace_stroke_color, find_by_font, replace_font
- [x] TS: find-replace-panel.ts, Cmd+F shortcut, Esc to close
- [x] Undo integration (push_undo before replace operations)
- [x] **Property search**: Search nodes by fill color, stroke color, font family, font size (exact/range), opacity, blend mode, corner radius, stroke width, node kind — AND logic across all criteria
- [x] **Property replace**: Batch replace fill color, stroke color, font family, font size, opacity, blend mode, corner radius, stroke width on matched nodes
- [x] **Properties tab**: Third tab in Find & Replace panel with search criteria builder + replacement builder + results
- [x] Rust: PropertySearchCriteria, PropertyReplacement structs; Scene.search_by_properties(), Scene.replace_properties(), Scene.search_and_replace_properties()
- [x] WASM: search_by_properties(json), replace_properties(json, json), search_and_replace_properties(json, json)
- [x] **Canvas Search Bar (Cmd+F)**: Figma-style floating search bar at top center with search input, result count (N/M), ↑/↓ navigation, Replace/Replace All, case-sensitive toggle (Aa), Escape to close
- [x] **Search highlights**: Orange border on all matching nodes, solid orange on current result
- [x] **Name + Text replace**: replace_text_in_nodes replaces both node names and text content
- [x] Rust: Scene.search_nodes(query, case_sensitive) → Vec<u64>, Scene.replace_text_in_nodes(query, replacement, node_ids, case_sensitive) → u32
- [x] WASM: search_nodes(query, case_sensitive) → JsValue (JSON array), replace_in_nodes(query, replacement, node_ids_json, case_sensitive) → u32
- [x] TS: search-panel.ts (floating bar), editor integration with highlight rendering

### Annotation Export (Markdown + JSON)
- [x] Rust: Scene.export_annotations_markdown() — comments (grouped by page, open/resolved, node name resolution) + node notes (tags, content)
- [x] Rust: Scene.export_annotations_json() — structured JSON with comments + node notes for programmatic use
- [x] WASM: export_annotations_markdown(), export_annotations_json() bindings
- [x] TS: Comments panel "↓ MD" + "↓ JSON" export buttons
- [x] Markdown: emoji headers, summary counts, node kind labels
- [x] JSON: page names, node names resolved, replies, tags
- [x] Backward-compatible: export_comments_markdown() delegates to export_annotations_markdown()

### Node Search Spotlight
- [x] **Quick search panel**: Cmd+P to open/close, Escape to dismiss
- [x] **Unified search**: Nodes (find_text), Pages (get_pages), Components (search_components), Variables (get_collections)
- [x] **Category filters**: Tab key or click to filter by All/Node/Page/Component/Variable
- [x] **Category badges**: Color-coded icons + labels per category (blue/gold/purple/green)
- [x] **Results grouping**: Results grouped by category with section headers
- [x] **Smart actions**: Node → select+zoom, Page → switch+zoom-to-fit, Component → find first instance+zoom
- [x] **Keyboard**: ↑↓ navigate, Enter select, Tab cycle filter, Escape close
- [x] **Shortcuts**: Cmd+K or Cmd+P
- [x] TS: ui/spotlight.ts, integrated in editor.ts

### PDF Export
- [x] **Zero-dependency PDF builder**: Pure TypeScript, no external libraries
- [x] **Multi-page support**: Exports all pages or current page only
- [x] **JPEG-based embedding**: Canvas → JPEG (configurable quality) → DCTDecode in PDF
- [x] **Per-page sizing**: Each PDF page matches canvas content bounding box
- [x] **Configurable options**: scale (default 2x), quality (default 0.92), filename
- [x] **Toolbar button**: PDF icon next to SVG export button
- [x] **Keyboard shortcut**: Cmd+Shift+E
- [x] **Editor API**: editor.downloadPDF(options?) async method
- [x] TS: ui/pdf-export.ts — exportPDF(), buildPDF(), captureCurrentPage()

### Figma Import
- [x] **REST API import**: Fetch Figma files via personal access token
- [x] **URL parsing**: Accept figma.com/file/ or figma.com/design/ URLs, or bare file keys
- [x] **Node conversion**: FRAME, COMPONENT, INSTANCE, GROUP → Frame; RECTANGLE → Rect; ELLIPSE → Ellipse; TEXT → Text; STAR/REGULAR_POLYGON → Star/Polygon; SECTION → Section; SLICE → Slice; VECTOR/BOOLEAN_OPERATION/LINE → Rect fallback
- [x] **Property mapping**: Fill (solid/linear/radial gradient), Stroke (color/weight/align), Opacity, Visibility, Corner radius, Blend mode, Drop shadow, Layer blur
- [x] **Text properties**: Font family, size, weight, italic, text-align, line-height
- [x] **Auto layout**: Flex mode, gap, padding mapping
- [x] **Hierarchy**: Recursive children conversion with correct reparenting and position offset
- [x] **Import modal**: Dark floating dialog (URL + token input), progress status, token persistence (localStorage)
- [x] **Toolbar button**: Figma logo icon next to PDF export
- [x] **Undo integration**: push_undo before import
- [x] TS: ui/figma-import.ts — fetchFigmaFile(), convertNode(), openFigmaImportModal()
- [x] **Constraints import**: Figma constraints → OpenSketch constraints mapping
- [x] **Rotation import**: Figma rotation (degrees) → OpenSketch rotation (radians)
- [x] **Vector path import**: VECTOR nodes → Path nodes via SVG path data parsing (M/L/C/Z + relative)
- [x] **Prototype import**: Figma reactions → OpenSketch interactions (trigger/action/destination/transition/duration)
- [x] **ID mapping**: Figma node ID → OpenSketch ID tracking for cross-references

### Shared Component Library
- [x] **ComponentLibrary struct**: id (String), name, version, components HashMap
- [x] **ComponentStore extensions**: linked_libraries Vec, export_library, import_library, get_linked_libraries_info, unlink_library, sync_library
- [x] **WASM bindings**: export_component_library, import_component_library, get_linked_libraries, unlink_library, sync_library
- [x] **Library panel UI**: Modal with export (select components → JSON download), import (file picker → merge), linked libraries list (name/version/count, Sync/Unlink buttons)
- [x] **Keyboard shortcut**: Cmd/Ctrl+Alt+L
- [x] **Backward-compatible serde**: #[serde(default)] on linked_libraries
- [x] TS: ui/component-library.ts — openComponentLibraryPanel(), export/import/sync/unlink

### Vector Network Editing (Enhanced)
- [x] **NodeKind::VectorNetwork**: Multi-connected vertex/segment/region graph (not linear path chain)
- [x] **VectorNetwork data model**: VectorVertex, VectorSegment (bezier handles), VectorRegion (closed loops)
- [x] **Region detection**: Planar face detection via directed-edge traversal (minimal cycles)
- [x] **Path → VectorNetwork conversion**: from_path() preserving bezier handles
- [x] **Canvas rendering**: Fill regions + stroke all segments, bezier support
- [x] **SVG export**: region_to_svg_d / segment_to_svg_d
- [x] **WASM bindings**: add_vector_network, vn_add/remove/update_vertex, vn_add/remove_segment, vn_update_segment_handles, vn_detect_regions, vn_get_data, vn_split_segment, vn_hit_test_segment, convert_path_to_vector_network
- [x] **Edit mode**: Double-click VectorNetwork node → crosshair editing mode
- [x] **Vertex operations**: Click to add, drag to move, Delete to remove, Shift+click to connect
- [x] **Segment operations**: Click to select, Delete to remove, hover highlight
- [x] **Segment splitting**: Double-click on segment → de Casteljau split at click point (preserves bezier curves)
- [x] **Segment hit-testing**: Rust closest-point-on-cubic/line with ternary search refinement
- [x] **Bezier handle editing**: Drag handle control points on segments, visual handle lines + dots
- [x] **Connection preview**: Dashed line from selected vertex to mouse cursor
- [x] **Auto-connect**: Click empty space → add vertex + auto-connect from previously selected vertex
- [x] **Properties panel**: Vertex/segment/region counts, Detect Regions button, Convert Path to VN button
- [x] **Point snapping**: Integrated with existing point-snap system during vertex drag
- [x] **Undo integration**: All operations push_undo

### Multi-user Permissions
- [x] **Role-based access**: Owner / Editor / Viewer roles
- [x] **Permission store**: Rust `permissions.rs` — user management, role checks, node/page locking
- [x] **Node locking**: Lock/unlock individual nodes (prevents other users from editing)
- [x] **Page locking**: Lock/unlock entire pages
- [x] **Expiry support**: Locks can have optional expiry timestamps, auto-cleanup
- [x] **Owner privileges**: Can manage users, change roles, override any lock
- [x] **WASM bindings**: 14 bindings (set_current_user, perm_add/remove_user, perm_set_role, perm_get_role, perm_get_users, perm_can_edit_node/page, perm_lock/unlock_node/page, perm_get_locks, perm_get_node/page_lock, perm_cleanup_expired)
- [x] **UI**: Right pane "Perms" tab — team members list, role management, lock visualization, lock/unlock selected node button
- [x] **Backward-compatible**: Default "local" owner user, no-op when no permissions configured

### Canvas Presentation Mode
- [x] **Fullscreen slideshow**: Page-based presentation with black background, auto-scaled rendering
- [x] **Transitions**: None, Fade, Slide Left/Right/Up, Zoom, Smart Animate — eased animations (400-500ms)
- [x] **Smart Animate**: Matches nodes by name across pages, interpolates position/size/rotation/opacity/corner_radius with cross-fade; falls back to fade when no matches found; Rust engine `compute_auto_animate_pages` WASM binding
- [x] **Navigation**: Arrow keys, Space, PageUp/Down, Home/End, click left/right halves
- [x] **Presenter notes**: Toggle with N key — collects notes from top-level nodes on each page
- [x] **Controls**: Bottom bar (auto-hide), progress bar with click-to-seek, slide counter
- [x] **Fullscreen**: F key toggles browser fullscreen API
- [x] **Toolbar button**: Presentation icon, Cmd+Shift+Enter shortcut
- [x] **Dynamic import**: Code-split for zero impact on initial load
- [x] **Viewport restore**: Saves/restores zoom, pan, and active page on exit
- [x] **Annotations overlay**: Real-time drawing tools during presentation
  - Tools: Laser pointer (1), Pen (2), Highlighter (3), Arrow (4), Eraser (5)
  - 7 color swatches, smooth quadratic curve rendering
  - Undo (Cmd+Z), Clear (C), toggle with A key or ✏️ button
  - Per-slide auto-clear, HiDPI support
  - Floating toolbar with tool/color selection

### Component Analytics
- [x] **Usage statistics**: Count instances per component across all pages
- [x] **Usage locations**: Track which nodes/pages use each component, click-to-navigate
- [x] **Variant usage**: Breakdown of variant combination usage per component
- [x] **Unused detection**: Identify components with zero instances, suggest removal
- [x] **Summary dashboard**: Total components, instances, unused count
- [x] **Rust engine**: `Scene::get_component_analytics()` — cross-page traversal
- [x] **WASM binding**: `component_analytics()` → JSON
- [x] **UI**: Floating modal panel (Cmd/Ctrl+Alt+A shortcut)
- [x] **Navigation**: Click instance location to jump to that node/page

### Smart Component Suggestions
- [x] **Structural duplicate detection**: Identical subtree fingerprinting
- [x] **Sibling pattern detection**: Repeated children in Frames (list/grid items)
- [x] **Visual clone detection**: Same kind + similar size + same fill bucketing
- [x] **Confidence scoring**: Multi-factor (count, depth, fill match)
- [x] **Deduplication**: Higher-confidence suggestions subsume lower ones
- [x] **Rust engine**: `Scene::suggest_components()` in `smart_component.rs`
- [x] **WASM binding**: `suggest_components()` → JSON
- [x] **UI**: Floating modal (Cmd/Ctrl+Alt+S shortcut), suggestion cards with confidence
- [x] **Actions**: Select all instances, navigate to nodes

### Cursor Chat Bubbles
- [x] **Chat input**: `/` key opens inline text input at cursor position
- [x] **Send message**: Enter to broadcast via collab WebSocket + local display
- [x] **Cancel**: Escape or blur to dismiss input
- [x] **Chat bubble rendering**: White bubble with user color accent bar, word wrap
- [x] **Typing indicator**: "···" bubble shown while user is typing
- [x] **Auto-dismiss**: 4s display + 0.5s fade out animation
- [x] **Collab integration**: `sendChat()`, `sendTyping()`, `onChat`/`onTyping` callbacks
- [x] **Local-only mode**: Works without collab server (own messages shown immediately)
- [x] **Files**: `collab.ts` (protocol), `cursor-presence.ts` (rendering), `editor.ts` (input UI)

### Canvas Recording / Replay
- [x] **Rust RecordingStore**: Frame capture (scene snapshot per frame), seek by time (binary search)
- [x] **Deduplication**: Skips frames identical to previous snapshot
- [x] **WASM bindings**: recording_start, recording_stop, recording_capture, recording_seek, recording_clear, recording_frame_count, recording_duration_ms, recording_has_data, recording_is_active, recording_set_max_frames, recording_export_json, recording_import_json, recording_get_frame
- [x] **Floating recorder bar UI**: Record start/stop, play/pause/stop, timeline slider, time display, speed selector (0.5×/1×/2×/4×)
- [x] **Recording indicator**: Red blinking "● REC" during capture
- [x] **Scene restoration**: Saves pre-playback scene, restores on stop
- [x] **JSON export/import**: Download/upload recording data
- [x] **Toolbar integration**: ⏺ button + Shift+Alt+R shortcut
- [x] **Files**: `recording.rs` (engine), `canvas-recorder.ts` (UI)

### Video Export (WebM & GIF)
- [x] **WebM export**: MediaRecorder + captureStream API, configurable bitrate (quality 0-1 → 0.5-5.5 Mbps)
- [x] **GIF export**: Custom GIF89a encoder — median-cut color quantization (256 colors), LZW compression, Netscape looping extension
- [x] **Offscreen rendering**: Each recorded frame → seek engine → render to offscreen canvas (1280×720 default)
- [x] **Auto viewport fitting**: Scene bounds → zoom/pan calculated for optimal framing with padding
- [x] **Progress modal**: Full-screen overlay with progress bar, phase labels (rendering/encoding/done)
- [x] **UI**: "WebM" and "GIF" buttons in recorder bar (visible when recording data exists)
- [x] **State preservation**: Saves/restores scene state and viewport before/after export
- [x] **Files**: `video-export.ts` (encoder + export logic), `canvas-recorder.ts` (UI integration)

### Text Transform & Advanced Typography (추가 87)
- [x] **TextTransform enum**: None, Uppercase, Lowercase, Capitalize
- [x] **text_indent**: First-line indent in pixels (-500 to 500)
- [x] **Render pipeline**: Transform applied before rendering & measurement
- [x] **SVG export**: text-transform applied to exported content
- [x] **Properties panel**: Transform dropdown + indent number input
- [x] **Handoff panel**: CSS code gen for text-transform & text-indent
- [x] **WASM bindings**: set/get_text_transform, set/get_text_indent
- [x] **OpenType features**: ligatures, small caps, old-style numerals, tabular numerals
- [x] **OpenType WASM bindings**: set_opentype_ligatures/small_caps/old_style_numerals/tabular_numerals, get_opentype_features
- [x] **OpenType Properties panel**: checkbox toggles for all 4 features
- [x] **OpenType SVG export**: font-feature-settings + font-variant-caps style attributes
- [x] **OpenType Handoff**: CSS codegen for font-feature-settings in CSS & spec rows
- [x] **OpenType Canvas rendering**: ctx.fontFeatureSettings + fontVariantCaps applied during text draw & caret measurement
- [x] **OpenType Inspect panel**: font-feature-settings + font-variant-caps CSS output

## Variable Font Axes
- [x] **font_variation_settings**: BTreeMap<String, f64> on Text node (serde default, backward-compatible)
- [x] **Standard axes UI**: Weight (wght), Width (wdth), Slant (slnt), Optical Size (opsz) — sliders + number inputs
- [x] **Custom axis support**: 4-char tag + value input, add/remove
- [x] **Canvas rendering**: ctx.fontVariationSettings CSS property per text node
- [x] **SVG export**: font-variation-settings style attribute
- [x] **Inspect panel**: CSS font-variation-settings codegen
- [x] **WASM API**: set_font_variation_axis, remove_font_variation_axis, get_font_variation_settings
- [x] **Double-click reset**: axis label double-click removes override, dims inactive axes

## Pattern Fills
- [x] **FillType::Pattern**: src (image URL/data URI), scale, rotation, pattern_type (Tile/Brick/Hex), tile_width, tile_height
- [x] **Canvas rendering**: JS createPattern with tile compositing (brick offset, hex offset), rotation transform, node clipping
- [x] **SVG export**: `<pattern>` defs with `<image>` tiles, patternTransform rotation, patternUnits=userSpaceOnUse
- [x] **WASM**: set_fill_pattern_at(id, index, src, scale, rotation, pattern_type, tile_width, tile_height)
- [x] **Properties panel**: Pattern option in fill type dropdown, image file picker, scale/rotation/type/tile size controls
- [x] **Inspect panel**: CSS background-image/background-size/background-repeat codegen
- [x] **Backward-compatible serde**: existing files without Pattern fills work unchanged

## 88b. Noise/Texture Fills
- [x] **FillType variants**: NoiseFill (Perlin-style hash noise), DotPattern (regular dot grid), CrosshatchFill (hatching lines)
- [x] **NoiseFill params**: scale, color1, color2, intensity (0–1), seed
- [x] **DotPattern params**: dot_radius, spacing, color, bg_color, angle
- [x] **CrosshatchFill params**: spacing, line_width, color, bg_color, angle, density (1=single, 2=cross)
- [x] **Canvas rendering**: Procedural generation via Canvas2D (clip + draw), rotation support
- [x] **SVG export**: feTurbulence (noise), `<pattern>` with circles (dots) / lines (crosshatch)
- [x] **WASM**: set_fill_noise_at, set_fill_dot_pattern_at, set_fill_crosshatch_at
- [x] **Properties panel**: Texture fill types in dropdown (Noise/Dots/Crosshatch), parameter editors (scale/density/angle/colors)
- [x] **Backward-compatible serde**: existing files work unchanged

## 89. Keyboard-driven Node Nudge
- [x] **Arrow keys**: Move selected nodes by 1px
- [x] **Shift+Arrow**: Move by 10px
- [x] **Alt+Arrow**: Sub-pixel nudge by 0.1px
- [x] **Multi-selection**: All selected nodes move together
- [x] **Undo integration**: Each nudge action is undoable

## 90. Multi-edit Mode (Edit All Matching Layers)
- [x] **select_same_name**: Select all nodes with identical name
- [x] **select_same_name_and_kind**: Select all nodes with same name AND NodeKind
- [x] **WASM bindings**: select_same_name, select_same_name_and_kind
- [x] **Context menu**: "Edit All Matching Layers" (name+kind match)
- [x] **Context menu**: "Select All with Same Name"
- [x] **Bulk editing**: Selected nodes editable via Properties panel (existing multi-selection support)

## 91. Table Node
- [x] **NodeKind::Table**: rows, cols, cells (Vec<TableCell>), col_widths, row_heights
- [x] **TableCell**: row, col, row_span, col_span, content, fill, text_align
- [x] **WASM bindings**: add_table, table_set_cell, table_get_cell, table_set_cell_fill, table_merge_cells, table_add_row, table_add_col, table_remove_row, table_remove_col, table_set_col_width, table_set_row_height, table_import_csv, table_sort, table_get_info
- [x] **Canvas rendering**: Grid lines, cell backgrounds, text rendering with alignment
- [x] **SVG export**: Table as <rect>/<text> groups with proper positioning
- [x] **CSV import**: Parse CSV text, auto-resize rows/cols, populate cells
- [x] **Sort**: Stable sort by column (ascending/descending), numeric-aware
- [x] **Cell merge**: Merge rectangular cell ranges, remove covered cells
- [x] **Toolbar**: Table button (B shortcut)
- [x] **Properties panel**: Rows/Cols display, add/remove row/col, CSV import, sort buttons
- [x] **Backward-compatible serde**: Default values for all Table fields

## 92. Pixel Preview Mode
- [x] **Toggle**: Alt+P keyboard shortcut, zoom bar button
- [x] **Anti-aliasing off**: `imageSmoothingEnabled = false` during scene rendering
- [x] **Pixel grid overlay**: Visible at zoom ≥ 8x, adaptive opacity, max 500 lines
- [x] **Device frame simulation**: 10 presets (iPhone, Pixel, iPad, MacBook, 1080p, 4K)
- [x] **Device picker**: Right-click pixel preview button for device selection dropdown
- [x] **DPR display**: Physical resolution info shown below device frame
- [x] **Dimmed surround**: Area outside device viewport dimmed at 40% black
- [x] **UI smoothing preserved**: Re-enables imageSmoothingEnabled for rulers/overlays

## 93. Smart Spacing Distribution
- [x] **Multi-selection handles**: 3+ nodes selected → pink gap indicators between sorted nodes
- [x] **Axis detection**: Auto-detect primary axis (horizontal/vertical) based on spread
- [x] **Drag to adjust**: Drag any gap handle to uniformly redistribute spacing
- [x] **Uniform indicator**: Gaps turn green when evenly spaced
- [x] **Gap labels**: Show pixel value in pill badges on each gap
- [x] **Auto-layout mode**: Single frame selected → gap handles for auto-layout children (existing)
- [x] **Rust engine**: `distribute_with_spacing(ids, axis, spacing)`, `get_spacing_between(ids, axis)`
- [x] **WASM**: `distribute_selection_with_spacing(axis, spacing)`, `get_selection_spacing(axis)`

## 94. Dev Mode Enhancement
- [x] **Auto-measurement**: In Dev mode, hover over any node → red measurement lines appear automatically (no Alt needed)
- [x] **CSS tooltip**: After 400ms hover delay, shows CSS snippet tooltip with syntax highlighting
- [x] **Quick export**: PNG/SVG export buttons in tooltip (one-click download at 2x)
- [x] **Copy CSS**: Click code or "Copy CSS" button → clipboard copy with toast notification
- [x] **Node info**: Tooltip header shows node name + kind
- [x] **Integration**: `editor.setDevMode(true/false)` from toolbar Edit/Dev mode toggle
- [x] **Implementation**: `ui/dev-mode-overlay.ts` — DevModeOverlay class

## 95. Node-level Event System
- [x] **EventTrigger enum**: onClick, onDoubleClick, onHover, onHoverEnd, onPress, onRelease, onDrag, onDragEnd, onFocus, onBlur
- [x] **NodeEvent struct**: id, trigger, handler (JS code string), enabled, label
- [x] **Node.events**: Vec<NodeEvent> per node, backward-compatible serde
- [x] **Rust engine**: EventTrigger, NodeEvent in node.rs, Scene.alloc_id() for event IDs
- [x] **WASM**: add_node_event, remove_node_event, update_node_event_handler, update_node_event_trigger, set_node_event_enabled, get_node_events, get_node_event_count, get_all_node_events
- [x] **EventRuntime**: Sandboxed JS execution context with node API (setProperty, setVisible, setOpacity, setPosition, setSize, setFillColor, setText, setRotation, getNode, navigateTo, log, delay)
- [x] **Prototype viewer integration**: Click/hover/press/drag/dblclick event firing, hover enter/leave tracking, drag state management
- [x] **Event hotspot hints**: Orange dotted border + ⚡ icon on nodes with events in prototype viewer
- [x] **Properties panel**: "Events" section with add/remove, trigger dropdown, JS code editor (monospace textarea with Tab support), enable/disable toggle
- [x] **Implementation**: ui/node-events.ts (EventRuntime + renderNodeEventsSection), prototype-viewer.ts integration
- [x] **3D Perspective Transform**: Per-node 3D rotation (X/Y/Z) + perspective distance + vanishing point origin
  - Rust engine: Perspective3D struct (rotate_x/y/z, perspective distance, origin_x/y), WASM bindings (set/get/clear_perspective, set_perspective_rotation/distance/origin)
  - Canvas rendering: Strip-based perspective warp using DOMMatrix 3D projection
  - Properties panel: "3D Transform" section with enable checkbox, rotation sliders, distance, origin controls, reset button
  - SVG export: CSS transform with perspective() rotateX/Y/Z() + transform-origin
  - Inspect panel: CSS code generation for perspective transforms

## 106. AI Code-to-Design (HTML/CSS → Nodes)
- [x] **Rust HTML parser**: Pure Rust tokenizer + recursive descent parser (no DOMParser dependency, works in WASM)
- [x] **CSS `<style>` block parser**: Tag/class/id selectors, property declarations, comma-separated selectors
- [x] **Inline style parser**: `style="..."` attribute parsing + merging with `<style>` rules
- [x] **Color parsing**: hex (#rgb/#rrggbb/#rrggbbaa), rgb()/rgba(), 12+ named colors
- [x] **Node creation**: HTML elements → Frame (container), Text (text-only), Image placeholder, Rect (hr), Input/Textarea/Select, Button (Frame+Label)
- [x] **Style mapping**: background-color, color, border-radius, border (shorthand), opacity, box-shadow, overflow, font-size/weight/family/style, text-align, line-height, letter-spacing, padding (shorthand + individual), width/height, min-width/min-height/max-width
- [x] **Flexbox support**: display:flex/inline-flex, flex-direction, gap, align-items, justify-content, flex-wrap → auto-layout
- [x] **Grid support**: display:grid, grid-template-columns → Grid layout mode
- [x] **Tag defaults**: h1-h6 font sizes/weights, strong/em/code styles, small text size
- [x] **Auto-sizing**: Containers auto-size based on children (column: sum heights, row: sum widths)
- [x] **Hierarchical creation**: Recursive children → reparent into parent Frame
- [x] **WASM binding**: `engine.code_to_design(html, offset_x, offset_y)` → JSON `{root_id, node_count}`
- [x] **Modal UI**: Code editor (textarea with Tab/Escape support), syntax-colored code, status feedback
- [x] **Toolbar button**: Code icon (⌘⇧D shortcut)
- [x] **Undo integration**: push_undo before conversion
- [x] **Implementation**: `crates/engine/src/code_to_design.rs` (Rust engine) + `ui/code-to-design.ts` (modal UI)

## 107. AI-Powered Design Polish
- [x] **Rust analysis engine**: `design_polish.rs` — heuristic analysis for spacing, alignment, color, corner radius, size inconsistencies
- [x] **Spacing normalization**: Detect near-identical layout gaps (±2px) and standardize to most common value
- [x] **Corner radius standardization**: Cluster near-miss radii and unify
- [x] **Near-miss color merge**: Colors within distance ≤12 merged to more common variant
- [x] **Padding symmetrization**: Nearly symmetric H/V padding → exact symmetric
- [x] **4px grid snap**: Sizes close to 4px grid snapped for crispness
- [x] **Pixel position snap**: Sub-pixel positions rounded for sharp rendering
- [x] **WASM bindings**: `analyze_polish()` → JSON fixes, `apply_polish(fix_ids_json)` → apply selected
- [x] **Modal UI**: Categorized fix cards with checkboxes, before/after preview, select all/none, node selection link
- [x] **LLM agent tools**: `analyze_polish` + `apply_polish` for AI-driven usage
- [x] **Toolbar button**: Sparkle icon, opens modal
- [x] **Undo integration**: push_undo before applying fixes
- [x] **Implementation**: `crates/engine/src/design_polish.rs` (Rust) + `ui/design-polish.ts` (modal)

## 108. Design System Health Dashboard
- [x] **Rust analysis engine**: `design_health.rs` — ComponentStore + StyleStore + Scene cross-analysis
- [x] **Overall health score**: 0–100 weighted metric (component adoption, style adoption, detached, unused, hardcoded colors, near-duplicates)
- [x] **Component health**: total/instances/unused/detached, adoption rate (instances vs raw shapes)
- [x] **Style health**: color/text style usage tracking, unused detection, style adoption rate
- [x] **Color health**: unique color count, hardcoded colors (≥2 uses without style), near-duplicate detection (distance <15)
- [x] **Typography health**: font family usage, font size inventory, unstandardized sizes (not in text styles)
- [x] **Issues list**: severity-tagged (error/warning/info), categorized, with suggestions
- [x] **Cleanup actions**: `remove_unused_color_styles()`, `remove_unused_text_styles()` WASM bindings
- [x] **WASM bindings**: `get_design_health()` → JSON report
- [x] **Tabbed modal UI**: Overview / Components / Styles / Colors / Typography / Issues tabs
- [x] **Toolbar button**: Pulse/heartbeat icon
- [x] **Implementation**: `crates/engine/src/design_health.rs` (Rust) + `ui/design-health.ts` (modal)

## 109. Smart Object Replace
- [x] **Rust engine**: `smart_replace.rs` — find similar nodes by aspect ratio/size, replace visual content
- [x] **Similarity search**: configurable ratio threshold (±10%) and size threshold (±50%), weighted scoring
- [x] **NodeKind-aware replace**: Image(src swap), Instance(component ref), Rect/Ellipse/etc.(fills/strokes/shadows/blur)
- [x] **WASM bindings**: `find_similar_nodes(target_id, ratio_threshold, size_threshold)` → JSON, `replace_with_node(source_id, target_ids_json)` → count, `replace_selection_with(source_id)` → count
- [x] **Modal UI**: Source node selection, similar node list with similarity %, checkboxes, threshold controls, Replace All / Replace Selected
- [x] **Hover preview**: Highlights target node on hover in the list
- [x] **Toolbar button**: Swap arrows icon + Cmd+Shift+H shortcut
- [x] **Context menu**: "Smart Replace…" option when single node selected
- [x] **Undo integration**: push_undo before replacements
- [x] **Implementation**: `crates/engine/src/smart_replace.rs` (Rust) + `ui/smart-replace.ts` (modal)
- [x] **ReplaceOptions**: `keep_size`, `keep_position`, `transfer_style` booleans (all default true)
- [x] **Options UI**: Three checkboxes in Smart Replace modal (Keep Size / Keep Position / Transfer Style)
- [x] **WASM**: `replace_with_node_options(source_id, target_ids_json, options_json)`, `replace_selection_with_options(source_id, options_json)`, `replace_selection_with_component(component_id, options_json)`
- [x] **Component instance replace**: Convert selected nodes to component instances, preserving position/size per options
- [x] **Kind-aware replace**: Copies source node kind when different (shape-to-shape conversion), copies name

## 113. Design-to-Code Component Mapping
- [x] **Rust structs**: `CodeMapping` (component_name, framework, import_path, props, children_slot), `PropBinding` (prop_name, prop_type, default_value, design_source), `CodeFramework` enum (React/Vue/SwiftUI/Compose/Flutter)
- [x] **Code generation**: 5 framework targets — React (JSX + TypeScript interface), Vue (SFC + `<script setup>`), SwiftUI (struct View), Compose (`@Composable`), Flutter (`StatelessWidget`)
- [x] **Design property resolution**: Maps fill color, text content, opacity, width, height, corner_radius, visibility to component props
- [x] **Child component recursion**: Parent component renders child nodes that have their own code mappings
- [x] **Auto-layout → flexbox/CSS**: Layout mode, direction, gap translated to framework-appropriate styling
- [x] **WASM bindings**: `set_code_mapping(id, json)`, `get_code_mapping(id)`, `clear_code_mapping(id)`, `export_component_code(id)` → JSON, `export_all_components()` → JSON array
- [x] **Inspect panel integration**: "Component Mapping" section — component name, framework selector, import path, children slot toggle, props list with type/source/default binding
- [x] **Export preview**: Inline code preview with syntax display + clipboard copy
- [x] **Export All modal**: `Cmd+Shift+E` — lists all mapped components, copy individual or download all
- [x] **Undo integration**: set/clear mapping pushes undo
- [x] **Backward-compatible serde**: `code_mapping: Option<CodeMapping>` defaults to None
- [x] **Implementation**: `crates/engine/src/code_export.rs` (Rust) + `ui/code-mapping-panel.ts` (UI)

## 114. Collaborative Whiteboard Mode
- [x] **Rust engine**: `whiteboard.rs` module — `WhiteboardState` (active, timer, voting_enabled), `WhiteboardTimer` (duration_secs, remaining_secs, running)
- [x] **Scene integration**: `whiteboard_state` field on Scene, backward-compatible serde
- [x] **WASM bindings**: `toggle_whiteboard_mode`, `start_timer`, `stop_timer`, `reset_timer`, `tick_timer`, `get_timer_state`, `set_voting_enabled`, `get_voting_enabled`, `get_whiteboard_active`
- [x] **Whiteboard mode toggle**: W shortcut, toolbar button, simplified toolbar (select/sticky/pen/text only)
- [x] **Dot grid background**: CSS radial-gradient overlay when mode active
- [x] **Timer widget**: Floating top-left panel, start/stop/reset, configurable duration (1-60 min), visual countdown with flash at 0
- [x] **Voting dots**: V key toggle, click to place colored dots on canvas (per-user color), 4px circles with white border
- [x] **Freehand drawing tool**: D shortcut, mouse/pen drag to draw smooth bezier paths, Catmull-Rom smoothing, configurable stroke color/width
- [x] **Whiteboard tools**: freehand + connector added to whiteboard mode tool palette
- [x] **Implementation**: `crates/engine/src/whiteboard.rs` (Rust) + `ui/whiteboard-mode.ts` (TypeScript)

## 117. Responsive Email Template Builder
- [x] **Email HTML export**: Table-based layout with inline styles for maximum email client compatibility (Gmail, Outlook, Apple Mail, Yahoo)
- [x] **Rust engine**: `email_export.rs` — `export_email_html(scene)` converts scene nodes to email-compatible HTML
- [x] **Node mapping**: Frame → nested `<table>`, Text → `<p>` with inline font styles, Rect/Ellipse → colored `<div>`, Image → `<img>` tag
- [x] **Layout support**: Flex Row → single `<tr>` with multiple `<td>`, Flex Column → multiple `<tr>`, gap → padding, auto-layout padding
- [x] **Email boilerplate**: XHTML Transitional DOCTYPE, charset/viewport meta, Outlook conditional comments (`<!--[if mso]>`), MSO XML namespace
- [x] **CSS reset**: Inline body reset, table border-collapse, image rendering fixes
- [x] **WASM binding**: `export_email_html()` on Engine
- [x] **Toolbar UI**: Email icon button → generates HTML → downloads `email-template.html`
- [x] **Implementation**: `crates/engine/src/email_export.rs` (Rust) + toolbar button in `ui/toolbar.ts` (TypeScript)

## 118. Snapshot Testing (Visual Regression)
- [x] **Rust engine**: `snapshot_test.rs` — SnapshotStore, Snapshot metadata, pixel_diff (RGBA comparison), generate_diff_image, hash_image_data (FNV-1a)
- [x] **DiffResult**: total_pixels, changed_pixels, diff_percentage, passed (threshold-based), max_channel_diff
- [x] **Channel tolerance**: Per-channel ignore threshold (default 2) to avoid anti-aliasing false positives
- [x] **Diff image generation**: Red overlay for changed pixels (intensity proportional to diff), dimmed unchanged pixels
- [x] **WASM bindings**: snapshot_register, snapshot_remove, snapshot_list, snapshot_list_for_target, snapshot_diff, snapshot_diff_image, snapshot_set_threshold, snapshot_get_threshold, snapshot_set_channel_tolerance, snapshot_hash
- [x] **IndexedDB storage**: Pixel data stored in browser IndexedDB (`opensketch-snapshots`), metadata in engine
- [x] **UI panel**: Floating panel (⌘⌥N), capture baseline, compare current vs baseline, delete snapshots
- [x] **Diff report modal**: Pass/Fail status, diff percentage, changed pixel count, 3-tab view (Diff/Baseline/Current)
- [x] **Configurable threshold**: Percentage-based pass/fail (default 0.1%)
- [x] **Toolbar button**: Camera icon, keyboard shortcut ⌘⌥N
- [x] **Implementation**: `crates/engine/src/snapshot_test.rs` (Rust) + `ui/snapshot-panel.ts` (TypeScript)

## 119. Voice-Controlled Design
- [x] **Web Speech API**: SpeechRecognition-based voice input, interim + final result handling
- [x] **Direct commands**: undo, redo, delete, select all, deselect, zoom fit, zoom 100 — instant execution without LLM
- [x] **LLM integration**: Non-direct commands sent to Agent panel's LLM for parsing → tool calling execution
- [x] **Toolbar button**: Microphone icon with pulse animation when listening
- [x] **Keyboard shortcut**: ⌘⇧V (Cmd+Shift+V) toggle
- [x] **Floating indicator**: Top-center transcript display with status colors (red=listening, amber=processing, green=done)
- [x] **Browser support detection**: Graceful fallback when Web Speech API unavailable
- [x] **Implementation**: `ui/voice-control.ts` (TypeScript), `ui/shortcut-manager.ts` shortcut registration

## 120. File Diff & Merge
- [x] **Scene-level diff**: Node-by-node comparison of two exported scene JSON files
- [x] **Diff categories**: Added (green), Modified (yellow), Removed (red) with per-property change details
- [x] **Property diff**: Compares name, kind, position, size, rotation, opacity, fill, corner_radius, visibility, etc.
- [x] **Selective merge**: Cherry-pick individual changes via checkboxes — added nodes created, modified properties applied, removed nodes deleted
- [x] **Batch selection**: Select All / Select None / Select Added quick filters
- [x] **Source options**: Compare current scene vs loaded JSON file, or two arbitrary files
- [x] **Canvas integration**: Click diff entry to pan camera to node location
- [x] **Undo support**: All merge operations wrapped in single undo snapshot
- [x] **Keyboard shortcut**: ⌘⇧D (Cmd+Shift+D) to open
- [x] **Toolbar button**: File diff icon in toolbar
- [x] **Implementation**: `ui/file-diff-merge.ts` (TypeScript), `ui/shortcut-manager.ts`, `ui/toolbar.ts`

## Design System Versioning
Track style library changes with version history, diff comparison, and rollback.

### Features
- [x] **Version snapshots**: Save current color + text styles as named versions (tag + description)
- [x] **Version list**: Browse all versions with timestamp, style counts
- [x] **Diff comparison**: Compare any version against current styles — shows added/removed/modified entries with details
- [x] **Rollback**: Restore styles to a previous version (auto-saves current state before rollback)
- [x] **Max 50 versions**: Oldest auto-trimmed when cap exceeded
- [x] **Backward-compatible**: `#[serde(default)]` on versions field — existing saves load fine

### Architecture
- [x] **Rust**: `StyleVersion` / `StyleDiffEntry` structs in `styles.rs`, versioning methods on `StyleStore`
- [x] **WASM**: 6 bindings (`style_version_create/list/remove/rollback/diff/diff_current`)
- [x] **UI**: `ui/style-versioning.ts` — panel in Properties empty state, diff modal overlay
- [x] **Integration**: Dynamic import in `properties-panel.ts` alongside Styles Library section

## Design Token Theme Switching
Define Light/Dark/Custom themes with token name→value mappings. Bind node fill/stroke/opacity/corner-radius to tokens. Switch theme to update all bound nodes instantly.

### Features
- [x] **Theme CRUD**: Create, rename, delete themes
- [x] **Token management**: Add/remove/update tokens per theme (color, number, string types)
- [x] **Node binding**: Bind fill, stroke, opacity, corner_radius to token names
- [x] **Theme switching**: One-click switch updates all bound nodes
- [x] **Import/Export**: Full token store serializable as JSON
- [x] **Persistent**: Token store saved with scene data (serde, backward-compatible)

### Architecture
- [x] **Rust**: `token.rs` — `TokenStore`, `Theme`, `Token`, `TokenValue`, `TokenBinding`, `TokenProperty`
- [x] **Scene integration**: `apply_token_theme()` resolves bindings on active theme change
- [x] **WASM**: 14 bindings (`token_create_theme`, `token_remove_theme`, `token_rename_theme`, `token_set_active_theme`, `token_get_active_theme`, `token_get_themes`, `token_add_token`, `token_remove_token`, `token_update_token`, `token_get_tokens`, `token_bind_node`, `token_unbind_node`, `token_get_bindings`, `token_export_json`, `token_import_json`)
- [x] **UI**: `ui/token-panel.ts` — theme switcher (empty state) + per-node token binding section in properties panel

## Design Review & Quiz Mode
Design review checklist auto-generation + interactive quiz mode for design knowledge testing.

### Features
- [x] **Design Review Checklist**: Auto-analyzes scene for naming conventions, consistency, layout usage, component coverage, documentation, accessibility hints
- [x] **Quiz Mode**: Interactive quiz with questions about the current scene (node counts, types, components) + general design knowledge (accessibility, tokens, best practices)
- [x] **Scene Analysis**: WASM `get_scene_analysis()` returns node count, type distribution, fill/stroke/layout/notes stats, component/instance counts
- [x] **LLM Agent Tools**: `generate_design_review`, `generate_quiz`, `get_scene_analysis` integrated as agent tools
- [x] **Right Pane Tab**: "Quiz" tab with review + quiz UI

### Architecture
- [x] **Rust**: `get_scene_analysis()` in `lib.rs` — scene statistics as JSON
- [x] **UI**: `ui/design-review.ts` — pure TS checklist generation, `ui/quiz-panel.ts` — quiz UI with progress, scoring, explanations
- [x] **Integration**: Right pane "Quiz" tab, LLM agent tools for programmatic access

## Design System Migration Assistant
Scan scene for hardcoded styles and suggest migrations to shared StyleStore styles.

### Features
- [x] **Scene scanning**: Analyze all nodes for hardcoded fill colors, stroke colors, and text styles not linked to shared styles
- [x] **Style matching**: Match hardcoded values against existing ColorStyle and TextStyle entries in StyleStore
- [x] **New style suggestions**: Detect repeated unmatched styles (2+ occurrences) and suggest creating new shared styles
- [x] **One-click apply**: Apply matched style to node (links color_style_id / text_style_id)
- [x] **Create & apply**: Create new shared style from suggestion and apply to all matching nodes
- [x] **Batch apply**: "Apply All Matched" button for bulk migration

### Architecture
- [x] **Rust**: `migration_assistant.rs` — `MigrationSuggestion`, `MigrationProperty` (Fill/Stroke/TextStyle), `scan_for_migration_suggestions()`, `apply_migration()`
- [x] **WASM**: `scan_migration_suggestions()` → JSON, `apply_migration_suggestion(node_id, style_id, property)`, `migration_create_and_apply_color()`, `migration_create_and_apply_text()`
- [x] **UI**: Right pane "Migration" tab — scan button, grouped results (matched existing / suggested new), per-item apply buttons
- [x] **Undo integration**: All apply operations push undo state

## Smart Grid Distribute
- [x] **Grid detection**: Clusters selected nodes by Y-proximity into rows, X-sort into columns
- [x] **2D distribution**: Uniform row gap + column gap, center-aligned within cells
- [x] **Median-based spacing**: Uses median gap rounded to 4px grid for clean values
- [x] **WASM**: `smart_distribute_grid()` returns `{ rows, cols, row_gap, col_gap, count }`
- [x] **UI**: Properties panel "Grid distribute" button (4+ nodes), context menu item
- [x] **Shortcut**: Cmd/Ctrl+Alt+G
- [x] **Undo**: Integrated with snapshot system

- [x] **Icon Search Panel**: searchable icon library with ~80 curated Lucide-inspired icons
  - Category filtering (Navigation, Actions, Media, etc.)
  - Tag-based fuzzy search
  - Configurable insert size (16/24/32/48/64px)
  - One-click insert to canvas via SVG import
  - Right pane "Icons" tab

- [x] **Canvas Annotation Stamps**: predefined review stamps for design workflows
  - 8 stamp types: Approved, Rejected, WIP, Todo, Needs Revision, Final, On Hold, Question
  - Toolbar stamp button with palette picker (⇧T)
  - Click-to-place on canvas, persistent per page
  - Color-coded badges with icons, zoom-aware rendering
  - Note attachment support, optional node binding
  - Rust engine storage (Scene stamps vec) + WASM bindings
  - ESC to exit stamp mode, drag for rapid placement

- [x] **Follow Mode for Cursors**: track another user's viewport in real-time
  - Click avatar in collab panel to follow/unfollow (toggle)
  - Smooth viewport lerp (0.15 factor) to followed user's zoom/pan
  - 👁 badge on followed cursor's name label + white glow border
  - Auto-unfollow on manual pan/zoom/scroll (any viewport interaction)
  - Auto-unfollow when followed user disconnects/times out
  - CursorPresence: follow/unfollow/toggleFollow, updateCursorViewport, tickFollow
  - Collab UI: avatar click handler, followed avatar highlight ring
  - Editor: tickFollowMode() in render loop, followUser/unfollowUser/followingUserId

### Component Playground (addition 113)
- Fullscreen overlay modal for testing components in isolation
- Rust engine: `component_playground.rs` — PlaygroundInfo, PlaygroundVariant, PlaygroundProp, PlaygroundSlot
- WASM bindings: `get_playground_info(comp_id)`, `get_playground_variants(comp_id)`
- Left panel: variant list with click-to-switch, default variant badge
- Center: SVG preview of selected variant at chosen breakpoint(s)
- Right panel: override props editor (variant properties, slots, node overrides)
- Bottom bar: responsive breakpoint bar — Mobile (375px), Tablet (768px), Desktop (1440px), All
- Properties panel: "▶ Playground" button on Instance/Component nodes
- Keyboard shortcut: Cmd+Shift+G to open, Escape to close
- Scene save/restore for non-destructive temporary instance creation

### Auto Dark Mode
- Automatic light → dark theme conversion for all node colors
- HSL-based lightness inversion with saturation boost for dark backgrounds
- Converts: solid fills, gradient stops, noise/dot/crosshatch/mesh fills, strokes, shadows
- Shadow blur auto-increased (+20%) and opacity boosted for dark background visibility
- Scope: all nodes or selection only (with descendants)
- WASM: `auto_dark_mode_all()`, `auto_dark_mode_selection()`
- Toolbar: moon icon button, keyboard shortcut Cmd+Shift+D
- Undo integration (full snapshot before transform)
- Color utility: `Color::to_hsl()`, `Color::from_hsl()`, `Color::to_dark_mode()` in types.rs

### Component Variant Interaction (Prototype)
- InteractionAction::SwapVariant — prototype viewer에서 hover/click 시 인스턴스 variant 전환
- Interaction.variant_key_json 필드: 타겟 variant key (e.g. {"State":"Hover"})
- Hover trigger: 마우스 진입 시 variant swap, 마우스 이탈 시 원래 variant 자동 복원
- Click trigger: variant swap (복원 없음, 영구 전환)
- Properties panel: Action 드롭다운에 "Swap Variant" 옵션, variant key JSON 입력
- Prototype viewer: 보라색 핫스팟 힌트 (SwapVariant 인터랙션 표시)
- WASM: set_interaction_variant_key(id, index, json) 바인딩
- Backward-compatible serde (variant_key_json 기본값 빈 문자열)

### Canvas Object Search & Filter
- [x] Rust engine: Scene.filter_nodes(criteria_json) — 노드 타입, fill/stroke color, opacity range, visibility, locked, has_text, name pattern 기반 필터링
- [x] WASM: filter_nodes(criteria_json) → JSON array of matching node IDs
- [x] Filter criteria: NodeKind, fill color (±2 tolerance), stroke color (±2 tolerance), opacity min/max, visible, locked, has_text, name pattern (case-insensitive)
- [x] UI: Floating panel (Cmd+Shift+F), node type dropdown (18 types), fill/stroke color pickers, opacity range, size range, checkboxes (hidden/locked/text-only)
- [x] Matching nodes highlighted with orange (#ff8c00) solid border, non-matching dimmed (45% overlay)
- [x] Results list with click to select + pan-to-center
- [x] "Select All" button: batch select all matching nodes (orange accent)
- [x] Clear button resets all filters and removes dimming
- [x] Hybrid Rust+TypeScript implementation (engine filter_nodes + ui/search-filter.ts)


### Canvas Background Patterns
- [x] Configurable canvas background pattern: Grid, Dots, Lines, Cross, None
- [x] Customizable background color and pattern color (hex)
- [x] Adjustable spacing (5-500px), opacity (0-1), dot size (0.5-10)
- [x] Scene-level persistence (saved/loaded with project, backward-compatible serde)
- [x] Rust renderer: zoom-adaptive rendering, density culling
- [x] WASM: set_bg_pattern, set_bg_color, set_bg_pattern_color, set_bg_spacing, set_bg_opacity, set_bg_dot_size, get_bg_settings
- [x] Properties panel: Canvas Background section (empty state) with pattern dropdown, color pickers, numeric inputs
- [x] Per-frame background patterns: Frame/Section nodes can have independent background patterns
- [x] FrameBackgroundPattern struct (pattern/color/spacing/opacity/size/visible)
- [x] WASM: get/set/clear_frame_background_pattern, set_frame_background_pattern_visible
- [x] Canvas rendering: Clipped pattern rendering inside frame bounds (dots/grid/lines/cross)
- [x] Properties panel: "Background Pattern" section for Frame/Section nodes (enable toggle, type/color/spacing/opacity/size controls, visibility)


### Node Links / References
- [x] NodeLink struct: target_id, link_type (Reference/DependsOn/Related), label
- [x] Node.links: Vec<NodeLink> — outgoing references per node
- [x] WASM: add_node_link, remove_node_link, clear_node_links, get_node_links, get_incoming_links, get_all_links
- [x] Canvas rendering: Colored arrow overlays (blue dashed=Reference, amber solid=DependsOn, gray dashed=Related)
- [x] Arrowheads + optional label at midpoint
- [x] Properties panel: "Links" section with outgoing/incoming lists, click to navigate, add/remove UI
- [x] L key toggle to show/hide link arrows
- [x] Backward-compatible serde (#[serde(default)])
- [x] Dangling link graceful handling (target deleted → skip rendering)

### Auto-Spacing Tool
- [x] Properties panel: "Spacing" input + H/V buttons in Align section (2+ nodes selected)
- [x] Uses existing `distribute_selection_with_spacing(axis, gap)` WASM binding
- [x] User-configurable gap value, horizontal and vertical auto-spacing

### Annotation Heatmap
- [x] Rust: `generate_annotation_heatmap(cell_size)` — grid-based density calculation from comments + callout nodes
- [x] Returns JSON with cells (x, y, width, height, density, count), max_density, total_comments
- [x] WASM binding: `generate_annotation_heatmap(cell_size) -> String`
- [x] TS: `AnnotationHeatmap` class (ui/annotation-heatmap.ts)
- [x] Canvas overlay: Color-coded heatmap cells (blue→green→yellow→red gradient by density)
- [x] Cell count labels for cells with enough screen space
- [x] Legend panel: top-right corner with total count + color gradient bar
- [x] Tooltip on hover: shows annotation count per cell
- [x] Configurable cell size (50-500 canvas units)
- [x] Keyboard shortcut: Cmd+Alt+H toggle
- [x] Editor integration: render loop, keyboard handler, public API

### Persistent Measure Tool
- [x] Rust: MeasureLine struct (id, start/end x/y, unit Px/Rem/Percent, label, visible, page_id)
- [x] Scene-level storage: measure_lines Vec, CRUD methods
- [x] WASM: add_measure_line, remove_measure_line, update_measure_line, set_measure_unit, set_measure_visible, get_measure_lines, clear_measure_lines
- [x] TS: MeasureToolState (click+drag to create, node edge snapping)
- [x] Canvas rendering: dashed cyan lines + endpoint dots + distance label pill
- [x] Selected measure highlight (orange), Delete key to remove
- [x] Hit-test for clicking existing lines
- [x] Toolbar: Measure button (M shortcut), crosshair cursor
- [x] Unit support: px/rem/% with auto-computed labels
- [x] Page-scoped measure lines
- [x] Backward-compatible serde (#[serde(default)])

### Contextual Toolbar
- [x] Floating quick-edit bar that appears above selected node(s)
- [x] Dynamic actions based on node type: fill/stroke color pickers, opacity slider, corner radius
- [x] Text nodes: font size input, bold toggle, text alignment cycle
- [x] Frame nodes: auto layout toggle
- [x] Common actions: duplicate, group (2+ selection), flatten, delete
- [x] Color presets (18 colors) + native color picker for custom colors
- [x] Hides during drag/pan, re-positions on zoom/pan changes
- [x] Viewport-clamped positioning (centered above selection, fallback below)
- [x] WASM: get_node_kind(id) → lightweight kind name query

### Multi-Canvas Comparison
- [x] Side-by-side page comparison with synchronized pan/zoom
- [x] Page selector dropdowns for left/right panes
- [x] Visual diff overlay: added (green), removed (red), modified (yellow) node highlights
- [x] Diff computation: name+kind matching across pages, detects position/size/fill changes
- [x] Diff summary bar: unchanged/added/removed/modified counts
- [x] Toggle diff overlay visibility
- [x] Synchronized mouse drag panning and scroll-wheel zoom (zoom toward cursor)
- [x] Rust: get_page_node_summaries(page_id) — node summary extraction without page switch
- [x] Rust: render_page(ctx, page_id) — temporary page switch + render + restore
- [x] WASM: get_page_node_summaries, render_page bindings
- [x] Keyboard: Cmd+Alt+C to open, Escape to close
- [x] Fullscreen overlay with top controls bar
- [x] Code-split lazy loading (dynamic import)

### Spatial Audio for Collaboration
- [x] Web Audio API with HRTF PannerNodes for distance-based spatialization
- [x] Canvas coordinates → 3D audio space mapping (X/Z plane)
- [x] Per-user PannerNode with inverse distance attenuation model
- [x] Configurable: maxDistance, refDistance, rolloff, masterVolume
- [x] Sound effects: click, select, drop, type — spatialized to user position
- [x] Chat notification sounds — two-tone chime at sender's location
- [x] Ambient hum — subtle drone scaled by nearby user count
- [x] Proximity chime — ascending notes when user enters threshold distance
- [x] MediaStream support — connect user microphone for voice chat
- [x] Master volume, mute/unmute, enable/disable toggle
- [x] Spatial Audio settings panel (floating UI with per-user volume bars)
- [x] Collab UI integration: 🔊 button in collaboration panel
- [x] Listener position synced to canvas viewport center each frame
- [x] Remote cursor positions synced from CursorPresence data

## Smart Layout Templates
- [x] Pre-defined layout templates: Card (Basic, Profile), Navigation (Top bar, Sidebar), Hero (Centered), Forms (Login, Contact), Lists (Settings), Footers (Simple), Modals (Confirm Dialog)
- [x] Template browser: Right pane "Templates" tab with search and category filter
- [x] One-click insertion at viewport center with auto-layout properties
- [x] Custom template save: selection → template (captures hierarchy, fills, strokes, layout, text props)
- [x] Custom template delete, export (JSON), import (JSON merge)
- [x] localStorage persistence for custom templates
- [x] Template instantiation: recursive node creation via WASM API with proper reparenting

- [x] **Content-aware resize**: Image nodes auto-lock aspect ratio during resize, Shift constrains any node, Alt+Shift proportional scale (font size, corner radius, strokes, shadows, padding, gap, children)

## View Bookmarks
- [x] Save canvas position + zoom as named bookmarks (Rust ViewBookmark struct, persistent in scene)
- [x] WASM: add/remove/update/get view bookmarks
- [x] View Bookmarks panel (📍): list all bookmarks, click to navigate, color dots, zoom/position info
- [x] Share as URL hash fragment (#view=x,y,zoom,pN), auto-navigate on load
- [x] Copy share link button per bookmark
- [x] Keyboard: Cmd+Alt+B save view, Cmd+Shift+K toggle panel, Ctrl+1-9 quick jump
- [x] Page-aware: bookmarks store page_id, auto-switch page on navigate
- [x] Backward-compatible serde (default empty vec)

## Artboard Templates / Presets
- [x] Built-in device presets: 35+ presets across 7 categories (Phone, Tablet, Desktop, Watch, Paper, Social, Custom)
- [x] Phone: iPhone 16/Pro/Pro Max/SE, Pixel 9, Galaxy S24, Android Small/Large
- [x] Tablet: iPad Mini/10.9"/Air/Pro 11"/Pro 13", Surface Pro
- [x] Desktop: MacBook Air/Pro 14"/Pro 16", 1080p/1440p/4K, iMac 24"
- [x] Watch: Apple Watch 41mm/45mm/Ultra 49mm
- [x] Paper: A4, A3, US Letter, US Legal
- [x] Social: Instagram Post/Story, X/Twitter Post, Facebook Cover, YouTube Thumbnail, LinkedIn Banner
- [x] Right pane "Artboards" tab: search, category filter, portrait/landscape toggle
- [x] One-click creation: Frame node at viewport center with preset dimensions and name
- [x] Orientation toggle: portrait ↕ / landscape ↔ (swaps width/height)
- [x] Aspect ratio thumbnail preview per preset
- [x] Custom preset: name + width + height, localStorage persistence
- [x] Custom preset delete
- [x] Pure TypeScript implementation (ui/artboard-presets.ts)

## Auto-layout Spacing Visualizer
- [x] Gap overlay: pink translucent regions between auto-layout children, dashed edge lines
- [x] Padding overlay: green translucent regions at frame edges (top/right/bottom/left)
- [x] Gap value labels: pink pill with px value on hover/drag
- [x] Padding value labels: green pill with px value on hover/drag
- [x] Gap drag: drag gap region to adjust auto-layout gap value
- [x] Padding drag: drag padding region to adjust individual padding (top/right/bottom/left)
- [x] Multi-selection spacing: 3+ free nodes show uniform spacing indicators
- [x] Equal spacing badge: green "= Equal spacing" indicator when gaps are uniform
- [x] Individual padding WASM setters: set_layout_padding_top/right/bottom/left
- [x] Undo integration (push_undo before drag)
- [x] Cursor feedback: col-resize / row-resize on handle hover

## Node Dependency Graph
- [x] Rust dep_graph module: DependencyEdge (ComponentInstance, Connector, Interaction, Comment)
- [x] Scene.get_dependency_graph() — collects all edges from active page
- [x] Scene.get_dependencies_for(node_id) — edges involving a specific node
- [x] detect_cycles() — DFS cycle detection in dependency graph
- [x] WASM bindings: get_dependency_graph() → JSON, get_node_dependencies(id) → JSON
- [x] Force-directed graph visualization (Canvas2D, pure TS)
- [x] Node coloring by kind (Rect=blue, Frame=purple, Instance=green, etc.)
- [x] Edge styling by type (instance=green solid, connector=orange dash, interaction=blue dots, comment=gray dots)
- [x] Mouse hover: highlight node + connected edges, fade unrelated
- [x] Double-click: select node in canvas
- [x] Drag: reposition nodes in graph
- [x] Filter checkboxes: toggle edge types
- [x] Circular dependency warning display
- [x] Right pane "Deps" tab
- [x] Cmd+Shift+D shortcut to open dependency graph

## Typography Scale Generator
- [x] Rust typo_scale module: scale_ratio(), generate_type_scale() with 8 presets + custom ratio
- [x] 7 text style levels: Display (ratio^4), H1 (^3), H2 (^2), H3 (^1), Body (base), Small (/ratio), Caption (/ratio^2)
- [x] WASM: generate_type_scale() → JSON preview, apply_type_scale() → StyleStore integration
- [x] Update existing: find styles by name and update font/size/weight/line-height
- [x] Modal UI: scale dropdown (8 presets + custom), base size input, font family input
- [x] Real-time preview: sample "Aa" text at each level with name, size, weight
- [x] Design System panel integration: "Typography Scale…" button in Type tab
- [x] Figma-style dark UI with consistent styling

## Dev Resource Linker
- [x] ResourceLink struct: url, label, link_type (GitHub/Storybook/Jira/Figma/Custom)
- [x] Node.resource_links: Vec<ResourceLink> with backward-compatible serde (#[serde(default)])
- [x] WASM: add_resource_link, remove_resource_link, update_resource_link, get_resource_links, get_resource_link_count
- [x] Properties panel: "Resources" section — link list with type icons, URL auto-detect, add/remove
- [x] Inspect panel: Resources section with clickable links (window.open)
- [x] Canvas badge: blue dot indicator on nodes with resource links (top-left corner)
- [x] Per-type SVG icons (GitHub, Storybook, Jira, Figma, Custom link)

## Smart Content Fill
- [x] Rust content_fill module: ContentFillCategory enum, generate_content() with seed-based pseudo-random
- [x] 9 categories: Names, Emails, Addresses, Dates, PhoneNumbers, LoremText, AvatarUrls, Numbers, Prices
- [x] Built-in datasets (no external dependencies), xorshift32 PRNG
- [x] WASM: fill_content(node_ids, category, seed), fill_selection_content(category, seed)
- [x] Text nodes get text content, Image nodes get avatar URLs
- [x] Context menu integration: "Fill with {Category}" items for selected nodes
- [x] Multiple selected nodes each get different data (repeating pattern)

## Cursor Annotation Brush
- [x] Ephemeral canvas drawing for review (auto-expire after 5 seconds with 0.5s fade-out)
- [x] Rust: AnnotationStroke struct (id, points, color, width, opacity, created_at)
- [x] Scene-level annotations storage (not node-based, backward-compatible serde)
- [x] Scene methods: add_annotation, annotation_add_point, remove_annotation, get_annotations, clear_expired_annotations
- [x] WASM bindings: add_annotation, annotation_add_point, finish_annotation, remove_annotation, get_annotations, clear_expired_annotations
- [x] TypeScript: annotation-brush.ts module with functional API (beginStroke, addStrokePoint, finishStroke, etc.)
- [x] Canvas2D rendering: smooth curves (quadraticCurveTo between midpoints), semi-transparent
- [x] Mini palette: 5 colors (red/blue/green/yellow/white) + 3 widths (2/4/8px)
- [x] Toolbar: Annotation Brush button with 'B' keyboard shortcut
- [x] Tool mode: "annotate" integrated into editor tool system

### Cursor Annotation Brush
- [x] Ephemeral canvas drawing for review — strokes auto-fade after 5 seconds
- [x] Pure TypeScript overlay (no engine storage, not persisted)
- [x] Smooth quadratic curve rendering (midpoint interpolation)
- [x] Mini palette: 5 colors (red/blue/green/yellow/white) + 3 widths (2/4/8px)
- [x] Fade-out animation (500ms opacity transition after 5s delay)
- [x] Screen-space consistent stroke width (zoom-independent)
- [x] Toolbar button + 'A' keyboard shortcut
- [x] annotation-brush.ts standalone module

### Figma JSON Import
- [x] Import Figma REST API JSON response (GET /v1/files/:key)
- [x] Drag & drop .json files onto canvas for import
- [x] API-based import: enter Figma file URL + personal access token
- [x] Node type mapping: FRAME→Frame, RECTANGLE→Rect, ELLIPSE→Ellipse, TEXT→Text, GROUP→Frame, VECTOR→Path, SECTION→Section, SLICE→Slice, STAR→Star, POLYGON→Polygon
- [x] Property mapping: fills (solid/gradient), strokes, effects (shadow/blur), corner radius, opacity, blend mode, constraints, auto-layout
- [x] Text style mapping: font family, weight, style, alignment, line height
- [x] SVG path geometry import for VECTOR nodes
- [x] Prototype interaction import (triggers + navigate actions)
- [x] Drag overlay UI with visual feedback
- [x] Import modal with URL/token input and progress display
- [x] Undo support (push_undo before import)

## Canvas Grid Snapping Mode
- [x] Toggleable grid snap (8px/16px/custom grid size)
- [x] Drag move + resize auto-align to grid (snap to grid)
- [x] ⌘+' (Ctrl+') toggle shortcut
- [x] Canvas grid dot visualization (zoom-aware, auto-hide when too dense)
- [x] Zoom controls area: grid toggle button + size selector (4/8/16/32/custom)
- [x] Coexistence with smart guides (when both enabled, axis-wise closer snap wins)
- [x] Pure TypeScript implementation (tools/grid-snap.ts)

### Multi-window / Detachable Panels
- [x] BroadcastChannel API for real-time state sync between main and detached panel windows
- [x] Panels (Layers, Properties, Agent, Comments, Variables, Assets, Bookmarks) can be popped out to separate browser windows
- [x] Pop-out button on panel headers (external link icon)
- [x] window.open() with panel-specific sizing, copies main stylesheets
- [x] Detached window: header with title + reattach button
- [x] Panel content rendered via dynamic import of existing setup functions (same editor instance)
- [x] Main window: panel hidden when detached, restored on reattach
- [x] Selection/layers changes broadcast via BroadcastChannel for cross-window sync
- [x] Auto-detect closed detached windows (500ms polling) → auto-reattach
- [x] Pure TypeScript implementation (ui/panel-detach.ts)

### AI Auto-Layout from Screenshot
- [x] Drag & drop image → choice dialog: "Add as Image" or "AI Auto-Layout"
- [x] Vision API integration: base64 image → OpenAI-compatible vision endpoint → structured JSON
- [x] Recursive node creation: frames, rects, text, ellipses with position/size/color/corner radius
- [x] Scales output to fit canvas (max 800px), positions at drop point
- [x] Loading overlay with spinner during API call
- [x] Uses existing LLM config from Agent panel (API key, endpoint, model)
- [x] Pure TypeScript implementation (packages/app/src/ui/ai-layout.ts)

### Canvas Object Linking (Hyperlinks)
- [x] Node.hyperlink field: external URL or internal page link ("page:PAGE_ID")
- [x] WASM: set_hyperlink, get_hyperlink, clear_hyperlink
- [x] Canvas: green badge (top-right corner) on nodes with hyperlinks
- [x] Properties panel: Hyperlink section with URL input, page selector dropdown, open/clear buttons
- [x] Prototype viewer: clicking node with hyperlink opens URL or navigates to page
- [x] Backward-compatible serde (#[serde(default)])

### Canvas Performance Profiler
- [x] Right-pane "Profiler" tab with start/stop profiling controls
- [x] Real-time FPS display and frame time graph (120-sample rolling window)
- [x] Per-node render cost list (ms, sorted descending, click to select)
- [x] Heatmap overlay on canvas (green→yellow→red based on render cost)
- [x] LOD threshold slider for optimization guidance
- [x] Optimization suggestions (auto-generated based on scene complexity)
- [x] Integrates with existing WASM complexity report engine
- [x] Pure TypeScript implementation (packages/app/src/ui/profiler-panel.ts)

### Color Blindness Simulation
- [x] SVG feColorMatrix filter overlay on canvas
- [x] Protanopia (no red), Deuteranopia (no green), Tritanopia (no blue), Achromatopsia (grayscale)
- [x] Machado et al. (2009) scientifically accurate color matrices
- [x] Floating panel UI (bottom center, dark theme)
- [x] Cmd/Ctrl+Alt+V toggle shortcut
- [x] Zero performance overhead (GPU-accelerated SVG filter)
- [x] Pure TypeScript implementation (packages/app/src/ui/color-blindness.ts)

### File System Access API
- [x] Native file save/open (.opensketch JSON format)
- [x] showOpenFilePicker / showSaveFilePicker with fallback (download/input[type=file])
- [x] Recent files list (localStorage, max 10)
- [x] Cmd+S: Save (existing handle → overwrite, no handle → Save As)
- [x] Cmd+O: Open file
- [x] Cmd+Shift+S: Save As (always prompt)
- [x] File menu button (top-left, dropdown: New/Open/Save/Save As/Recent Files)
- [x] Document title updates with filename
- [x] Full scene serialization via engine.export_scene()/import_scene()
- [x] Implementation: packages/app/src/ui/file-manager.ts

### Batch Property Edit (Multi-Selection)
- [x] Rust Engine: batch_set_fill, batch_set_stroke, batch_set_opacity, batch_set_corner_radius
- [x] get_batch_properties: Mixed value detection (fill/stroke/opacity/corner_radius)
- [x] WASM bindings: 5 methods exposed via wasm-bindgen
- [x] Properties panel: Fill (color swatch + hex), Stroke (color + hex + width), Opacity (%), Corner Radius (px)
- [x] Mixed value placeholder when selected nodes have different values
- [x] Undo integration (push_undo before batch apply)
- [x] Coexists with existing alignment/distribute/tidy up multi-selection UI
