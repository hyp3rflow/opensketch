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
- **Conditional visibility** — Per-node VisibilityCondition (collection_id + variable_id + operator + value), 8개 연산자 (Eq/NotEq/Gt/Lt/Gte/Lte/IsTrue/IsFalse), Scene.is_effectively_visible()로 render/hit-test 시 자동 평가, WASM 바인딩 (set/get/clear_conditional_visibility, is_effectively_visible), Properties panel "Conditional Visibility" 섹션 UI
- **Plugin API** — TypeScript Plugin API 시스템: Plugin interface (id/name/version/activate/deactivate), PluginManager (register/unregister/activate/deactivate/list), PluginAPI (scene read/write, UI 확장: panels/toolbar buttons/menu items/commands, event subscription), 샘플 플러그인 2개 (Lorem Ipsum Generator, Color Palette), Right pane Plugins 탭 UI (enable/disable 토글, plugin panels, quick actions)
- **Tauri desktop build** — Tauri v2 빌드 완성, src-tauri/ 설정 수정 (tauri.conf.json beforeBuildCommand, identifier, app.title 제거), 아이콘 생성, Cargo workspace에 src-tauri 추가, release 바이너리 빌드 확인
- **Smart Selection** — Cmd+클릭 deep select (Frame/Group 내부 자식 직접 선택), "Select All with Same Fill/Stroke/Kind" 컨텍스트 메뉴 항목, Rust deep_hit_test + select_same_fill/kind/stroke 메서드

## 📋 Backlog
- Responsive resize preview (artboard breakpoints, side-by-side view)
- Smart animate transitions (prototype viewer에서 매칭 노드 간 interpolation)
- Section nodes (Figma Section — 페이지 내 구역 그룹핑, 프레젠테이션 순서)
- Variable scoping (변수 사용 범위 제한: collection → specific frames/pages)
- Cursor presence indicators (멀티유저 시뮬레이션: 커서 위치 + 이름 표시, collaboration 준비)
- Text decoration (underline, strikethrough, letter-spacing, paragraph-spacing)
- Dev mode (Figma Dev Mode — 개발자용 코드/spacing 정보 강화 뷰)
- Export presets (다양한 해상도/포맷 일괄 내보내기: @1x @2x @3x, PDF, WebP)
- Scrollable frames (overflow scroll, clip content toggle)

## 🏗 Architecture Notes
- Rust WASM engine: `crates/engine/src/`
- TypeScript app: `packages/app/src/`
- WASM build: `cd crates/engine && wasm-pack build --target web --out-dir ../../packages/app/src/wasm`
- Dev server: port 5174
- Boolean ops use `i_overlay` crate for polygon clipping
