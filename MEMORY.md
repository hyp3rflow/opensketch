# OpenSketch — Long-term Memory

## ✅ Completed
- Core engine (scene graph, rendering, hit testing, selection)
- Node types: Rect, Ellipse, Text, Frame, Group, Path, Image, Star, Polygon
- Properties panel, layers panel, toolbar
- Undo/redo, copy/paste, alignment/distribution
- Component system (variants, slots, instances, overrides)
- SVG export, PNG export
- Gradient fills (linear, radial)
- Pen tool + path editing (bezier curves)
- Smart guides / snapping
- Blend modes (16 CSS modes)
- Multi-page support
- Constraints (responsive resize)
- Mask / clip
- Star / Polygon shapes
- Auto-save & version history
- Ruler / guides
- **Boolean operations** (Union, Subtract, Intersect, Exclude) — i_overlay crate, toolbar buttons, keyboard shortcuts
- **Styles library** (shared color/text styles) — ColorStyle + TextStyle with CRUD, apply/detach, sync, Properties panel UI dropdowns
- **Inspect mode** (CSS code gen) — Right pane "Inspect" tab, generates CSS from selected node, syntax highlighting, clipboard copy, SVG stroke attributes
- **Flatten selection** — Any shape→Path 변환, Group/Frame→Union path, Cmd+E, 툴바 버튼
- **Layout grid overlay** — Frame에 Columns/Rows/Grid 오버레이, count/gutter/margin/color, Auto/Fixed size mode, Ctrl+G 전역 토글, Properties panel UI
- **Keyboard shortcuts panel** — Cmd+/ 또는 ? 키로 토글, 카테고리별 단축키 정리, 검색 필터, ESC/backdrop 닫기

- **Auto layout hug/fill sizing** — SizingMode(Fixed/Hug/Fill) per axis, Fill children expand to fill remaining space, Hug parents shrink to content, Properties panel dropdowns
- **Right-click context menu** — Figma-style context menu with Copy/Cut/Paste/Duplicate/Delete, Group/Ungroup, Lock/Unlock, Show/Hide, z-order (Bring to Front/Forward, Send Backward/Back), Flatten, Select All, Zoom controls, shortcut display, disabled states, auto-select on right-click

## 📋 Backlog
- Tauri desktop build (scaffolded but not tested)
- Variable collections (design tokens with modes/themes)
- Plugin API (extensible tool/panel system)
- Selection colors / multi-fill (multiple fills per node like Figma)
- Outline stroke (inside/outside/center stroke alignment)
- Component variant switching UI (instance → variant picker dropdown)

## 🏗 Architecture Notes
- Rust WASM engine: `crates/engine/src/`
- TypeScript app: `packages/app/src/`
- WASM build: `cd crates/engine && wasm-pack build --target web --out-dir ../../packages/app/src/wasm`
- Dev server: port 5174
- Boolean ops use `i_overlay` crate for polygon clipping
