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
- **Gradient Editor on Canvas** — 선택 노드의 gradient fill에 대해 캔버스 위 드래그 가능한 핸들 오버레이 (Linear: 시작점/끝점 + 연결선, Radial: 중심점 + 반지름 핸들 + 원 미리보기), 실시간 편집, Properties panel 양방향 동기화, Undo 통합
- **Auto Layout Spacing Handles** — Auto layout Frame 선택 시 자식 간 핑크/마젠타 gap handle 오버레이, 드래그로 gap 값 실시간 조절, row/column 방향 자동 감지, 최소 6px grab zone, gap 값 라벨 표시, Undo 통합
- **Text decoration** — underline/strikethrough, letter-spacing, paragraph-spacing, WASM 바인딩, Properties panel UI
- **Responsive resize preview** — artboard breakpoints, side-by-side 뷰 (Cmd+Alt+R)
- **Smart animate transitions** — prototype viewer에서 매칭 노드 간 interpolation
- **Section nodes** — Figma Section 페이지 내 구역 그룹핑
- **Variable scoping** — collection → specific frames/pages 범위 제한
- **Cursor presence** — 멀티유저 시뮬레이션 커서 위치 + 이름 표시
- **Dev mode handoff** — SwiftUI/Kotlin Compose/CSS/SVG 코드 생성 + asset 다운로드
- **Export presets** — 다양한 해상도/포맷 일괄 내보내기 프로필
- **Scrollable frames** — overflow hidden/scroll, 휠 스크롤, 스크롤바 인디케이터
- **Bitmap filters** — brightness/contrast/saturation/hue-rotate/invert/grayscale/sepia
- **Slice tool** — 영역 기반 PNG export
- **Batch rename** — 패턴 기반 멀티 노드 이름 변경
- **Measure tool** — Alt+hover 노드 간 거리 측정
- **Accessibility checker** — 대비, 터치 타겟, alt text, 텍스트 크기 검사
- **Component search & swap** — Cmd+Shift+K 인스턴스 교체
- **Design tokens export** — W3C DTCG, Style Dictionary, Tailwind 포맷
- **Stroke options** — dash array, line cap/join, stroke alignment (inside/outside/center)
- **Multi-stroke** — 노드당 여러 stroke 지원
- **Responsive breakpoints** — Frame별 브레이크포인트 기반 auto layout 자동 전환
- **Absolute positioning** — auto layout flow에서 제외
- **Variable collections** — 디자인 토큰 modes/themes

## 📋 Backlog
- Real-time collaboration backend (WebSocket 서버 + CRDT/OT, 멀티유저 동시 편집, cursor presence 실시간 동기화)
- Animation timeline (keyframe 기반 property 애니메이션 — position/size/opacity/rotation/fill 시간축 편집, 타임라인 UI, easing curves, preview playback)
- Text on path (Path 노드 위에 텍스트 배치, offset 조절, SVG textPath 렌더링, 캔버스 미리보기)
- Branching / forking (프로젝트 브랜치 분기, diff 뷰, 머지 지원 — Git-style 디자인 버전 관리)
- Vector network editing (Figma-style vector network — 노드 간 다중 연결, fill region 자동 감지, 기존 Path보다 유연한 벡터 편집)

## 🏗 Architecture Notes
- Rust WASM engine: `crates/engine/src/`
- TypeScript app: `packages/app/src/`
- WASM build: `cd crates/engine && wasm-pack build --target web --out-dir ../../packages/app/src/wasm`
- Dev server: port 5174
- Boolean ops use `i_overlay` crate for polygon clipping
