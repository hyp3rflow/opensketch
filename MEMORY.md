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
- **Multi-fill (multiple fills per node)** — Figma-style Vec<Fill> with per-fill visible toggle, rendered bottom→top, add/remove/reorder fills UI, backward-compatible serde, WASM bindings (add_fill, remove_fill, update_fill_at, move_fill, set_fill_visible_at, get_fills)

- **Bookmarks / Favorites** — Node.bookmarked field, toggle_bookmark/is_bookmarked/get_all_bookmarked_nodes WASM bindings, Layers panel ⭐ toggle, right pane Bookmarks tab with cross-page navigation, ⌘⇧B shortcut, backward-compatible serde
- **Min/Max size constraints** — Node에 min_width/max_width/min_height/max_height: Option<f64>, clamp_size() 헬퍼, Flex/Grid 레이아웃 후 자동 클램핑, WASM 5개 바인딩, Properties panel 4칸 입력 UI, Inspect panel CSS 생성
- **Asset library panel** — Right pane "Assets" 탭, Components/Color Styles/Text Styles 3개 섹션, 검색/필터, 클릭으로 인스턴스 생성 또는 스타일 적용
- **Flow diagrams / connectors** — NodeKind::Connector (start/end node IDs, straight/curved path, start/end arrows), Canvas bezier/straight rendering with arrowheads + edge clipping, SVG export with markers, WASM bindings (add/set/get/update), Toolbar button (L shortcut), drag-to-connect UI with preview, Properties panel (path type, arrows), auto-update on connected node move

## 📋 Backlog
- Tauri desktop build (scaffolded but not tested)
- Plugin API (extensible tool/panel system)
- Responsive resize preview (artboard breakpoints, side-by-side view)
- Smart animate transitions (prototype viewer에서 매칭 노드 간 interpolation)
- Section nodes (Figma Section — 페이지 내 구역 그룹핑, 프레젠테이션 순서)
- Variable scoping (변수 사용 범위 제한: collection → specific frames/pages)

## 🏗 Architecture Notes
- Rust WASM engine: `crates/engine/src/`
- TypeScript app: `packages/app/src/`
- WASM build: `cd crates/engine && wasm-pack build --target web --out-dir ../../packages/app/src/wasm`
- Dev server: port 5174
- Boolean ops use `i_overlay` crate for polygon clipping
