# OpenSketch Feature Log

## ✅ Implemented

### Core Engine
- [x] Scene graph (flat HashMap + tree via parent/children)
- [x] Node types: Rectangle, Ellipse, Text, Frame, Group
- [x] Properties: position, size, rotation, opacity, fill, stroke, corner radius
- [x] Viewport: pan, zoom (scroll wheel with rAF batching)
- [x] Hit testing (reverse render order, respects visibility/lock)
- [x] Selection (single, with 8 resize handles)
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

### UI Panels
- [x] **Left Panel** with tab navigation (Layers / Design)
- [x] **Layers Panel**: tree view with expand/collapse, indentation, SVG type icons, visibility toggle
- [x] **Properties Panel**: full node editing
  - Position (X/Y), Size (W/H), Rotation
  - Corner radius (Rect/Frame only)
  - Opacity (slider + percentage)
  - Fill color (picker + hex + alpha)
  - Stroke color/width + "Add stroke"
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
- [ ] Multi-select (shift+click, drag-select)
- [ ] Undo/redo
- [ ] Copy/paste
- [ ] Alignment tools (align left/center/right, distribute)
- [ ] Auto-layout (Figma-like)
- [ ] Components/instances
- [ ] SVG export
- [ ] Collaborative editing (CRDT)
- [ ] Plugin system
- [ ] Canvas text cursor + multi-line text
- [ ] Image nodes
- [ ] Boolean operations
- [ ] Pen tool (vector paths)
- [ ] Constraints (responsive resizing)
- [ ] Prototyping (interactions/transitions)
