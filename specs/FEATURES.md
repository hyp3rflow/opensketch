# OpenSketch Feature Log

## ✅ Implemented

### Core Engine
- [x] Scene graph (flat HashMap + tree via parent/children)
- [x] Node types: Rectangle, Ellipse, Text, Frame, Group
- [x] Properties: position, size, rotation, opacity, fill, stroke (color, width, dash, cap, join, align, visible), corner radius, per-corner radius (TL/TR/BR/BL + link toggle), corner smoothing, shadows, blur
- [x] Multi-stroke: multiple strokes per node (Vec<Stroke>), each with visible toggle, add/remove/update
- [x] Layout grid overlay (Columns, Rows, Grid) on Frame nodes with Ctrl/Cmd+G toggle
- [x] Viewport: pan, zoom (scroll wheel with rAF batching)
- [x] Hit testing (reverse render order, respects visibility/lock)
- [x] Selection (single + multi-select + marquee drag-select, with resize handles). **Multi-Object Transform Box (2026-04-11)**: multi-selection 시 공통 bounding box 핸들을 렌더링하고 8개 핸들(corner + edge) 기반 scale/flip, rotation handle, draggable pivot(회전·스케일 기준점 이동)를 지원.
- [x] Smart Selection Net: marquee now supports Crossing/Contain modes (기본 Shift+X 토글, Alt로 임시 반전), drag 중 모드 라벨 표시, Frame/Group 내부 노드 우선 선택(Figma-like parent de-prioritization), Shortcut Manager에서 토글 키 커스텀 가능
- [x] Smart Selection: Cmd+click deep select into Frame/Group, "Select All with Same Fill/Stroke/Font/Kind" via context menu, "Select Similar" dialog (Cmd+Shift+A) with configurable criteria (color distance, size ratio, opacity, corner radius, font, stroke width thresholds), similarity scoring, group suggestions, one-click **Smart Group** (best suggestion auto-group + flex auto-layout), **Same Layer Type quick actions** (Shape/Text/Image/Locked/Hidden), **Selection Filter (Current Area)** with node type / name regex / max-depth / attribute filters (Any/Visible/Hidden/Locked/Text/Image/Shape), and **global selection filters** (Shape/Text/Image + include/exclude Locked/Hidden) that affect click + marquee selection. 클릭 시 top hit가 필터에서 제외될 경우 deep hit + 주변 visible candidates fallback으로 필터 일치 노드를 재탐색해 클릭/드래그 parity를 유지한다. Context menu의 "Select Same" 계열은 scope 옵션(문서/페이지/부모)과 additive 선택(현재 selection에 합치기)을 지원하며, 선택 노드에서 유추한 Layer Type(Shape/Text/Image/Locked/Hidden)도 동일한 scope/additive 플로우로 확장 지원. **Deep Select Stack Cycling (2026-04-10, click-anchored polish 2026-04-11)**: 겹친 레이어를 클릭하면 해당 지점 hit stack을 5초 동안 prime하고, `Tab`/`Shift+Tab`으로 동일 스택을 순환 선택한다(포인터 이동 시 stack 리셋). HUD로 현재 인덱스/총개수/레이어명을 표시한다. **Smart Selection Filter Bar (2026-04-11)**: 선택 시 상단 플로팅 바에서 type/name/visibility/lock/style-linked 조건으로 현재 selection을 즉시 필터링하고, 동일 조건으로 active page 전체를 확장 선택할 수 있다.
- [x] Scene serialization (JSON export/import)
- [x] Node operations: create, delete, move, resize, duplicate, reparent
- [x] Name search (partial match, case-insensitive)

### Rendering
- [x] Canvas2D renderer with viewport transform
- [x] Adaptive grid (density changes with zoom)
- [x] Frame labels (zoom-inverse scaling, max 11px)
- [x] Selection handles (cyan, 8-point)
- [x] Text editing indicator (dashed blue border)
- [x] Multi-cursor text editing (Cmd+double-click to add Text nodes, simultaneous typing/deletion, ESC to exit)
- [x] Multi-Edit Text Cursor (Cross-node): 다중 선택된 Text 노드에서 편집 시작 시 나머지 Text를 자동 커서로 묶고, primary 입력의 insert/delete/replace diff를 모든 보조 커서에 동기 전파
- [x] Rotation support (node-level)
- [x] Drop shadow rendering (multi-pass Canvas shadow API, per-node multiple shadows)
- [x] Layer blur (CSS filter blur via Canvas API)
- [x] Backdrop blur (frosted glass effect — blurs content behind node)

### UI Panels
- [x] **Left Panel** with tab navigation (Layers / Design)
- [x] **Design Token Usage Map (2026-04-11)**: Properties > Design Tokens 패널에서 토큰별 사용 노드 수를 즉시 집계/표시하고, `Pick`으로 바운드 노드를 빠르게 선택할 수 있다. 미사용 토큰은 경고 스타일로 노출되며, 동일 resolved 값의 잠재 중복 토큰 그룹을 표시한다. 또한 `Replace` 액션으로 문서 전체 token binding(속성 단위)을 일괄 치환할 수 있다.
- [x] **Layers Panel**: tree view with expand/collapse, indentation, SVG type icons, visibility toggle
- [x] **Layers Panel View Modes**: stack↔grid toggle for faster scanning in large docs, with density options (Compact/Cozy) and persisted preference (localStorage). Grid mode shows flat layer cards with kind badges; stack mode keeps hierarchical drag reorder/workflow.
- [x] **Properties Panel**: full node editing
  - Position (X/Y), Size (W/H), Rotation
  - Instance detach preview modal (Detach button / context menu / ⌘⌥B): impact summary + changed layer/property list + selective detach toggle for nested instances before apply
  - Corner radius (Rect/Frame only)
  - Opacity (slider + percentage)
  - Fill color (picker + hex + alpha)
  - Stroke color/width + "Add stroke" + dash pattern, line cap, line join
  - Advanced stroke controls (Path 중심): start/end arrowhead presets, dash corner compensation toggle, variable width start/end profile
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
- [x] Font Fallback Inspector: Properties > Text에서 `Inspect Fallback`으로 선택된 Text 레이어의 요청 폰트 로드 여부를 점검하고, 미로드 시 추정 fallback(`system-ui/sans-serif/serif/monospace`) 및 추천 대체 폰트를 리포트. `Replace Missing`으로 미로드 레이어 일괄 치환 가능
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
- [x] **Overrides**: per-instance text/visibility overrides on children, reset individual/all overrides
- [x] **Detach instance**: convert Instance to Frame (sever component link), Cmd+Alt+B shortcut, context menu + properties panel button
- [x] **Symbol Detach Preview + Selective Detach (2026-04-08)**: Properties panel Detach 클릭 시 변경 임팩트(서브트리 레이어 수, nested instances, override/style-link 카운트) 프리뷰 모달 표시. 옵션 `Also detach nested instances`로 선택 인스턴스만 분리하거나 하위 인스턴스까지 일괄 분리 가능 (`get_detach_preview`, `detach_instance_selective` WASM API)
- [x] **Symbol Detach Preview focus assist (2026-04-08)**: 프리뷰의 changed layer row 클릭 시 해당 레이어를 즉시 selection + zoom-to-selection으로 포커싱해 detach 전 영향 범위를 시각적으로 검증 가능
- [x] **Symbol Detach Preview style/nested diff rows (2026-04-08)**: detach 프리뷰에서 style-linked layer 목록(Color/Text style)과 nested instance 목록을 개별 row로 노출하고, row 클릭으로 캔버스 포커싱 지원 (`get_detach_preview` payload 확장)
- [x] **9 agent commands**: create, prop, variant, slot, instance, switch, fill, list, override
- [x] **Component search & swap**: search components by name, view all instances, swap selected/all instances to different master component (Cmd+Shift+K)
- [x] **Figma-style Variants Matrix UI**: Component Set 인스턴스 편집 시 첫 2개 axis 조합을 2D 매트릭스로 시각화하고 셀 클릭/드래그로 variant를 전환·매핑한다. `Auto/Switch/Map current` 모드 기반 다중 셀 편집을 지원한다.
- [x] **Variant Matrix Editor v2**: 매트릭스 툴바에 `Lock: Off/<Axis>` 축 잠금 편집을 추가해 드래그 적용 범위를 행/열 단위로 제한할 수 있다.
- [x] **Variant Matrix Editor v3 (inline axis values editor, 2026-04-09)**: 매트릭스 상단에 axis별 comma-list 편집 입력을 추가해 axis 값 reorder/add/remove를 한 패널에서 처리한다. axis 값 변경 시 기존 `variant_map` key와 현재 instance의 axis 선택값을 인덱스 기반으로 자동 재매핑하여 편집 후에도 매핑 손실을 최소화한다.
- [x] **Variant Matrix Editor v4 (axis rename remap, 2026-04-09)**: inline editor에서 axis 이름 자체를 수정할 수 있으며, `rename_component_set_axis` API로 component set axis와 `variant_map` key를 자동 리맵한다. axis rename과 값 변경을 한 번에 적용해 instance의 현재 variant 선택 상태도 안전하게 이전한다.
- [x] **Variant Matrix Editor v5 (header drag reorder, 2026-04-10)**: matrix의 행/열 헤더를 직접 드래그해 axis 값 순서를 재정렬할 수 있다. 드롭 시 axis value 순서를 즉시 업데이트하고 기존 `variant_map` 매핑을 인덱스 기반으로 유지해 대량 재배치 중 매핑 손실 없이 편집 가능하다.
- [x] **Variant Matrix Editor v6 (fill-empty batch map, 2026-04-10)**: Panel 툴바에 `Fill Empty` 액션을 추가해 현재 row/column/extra filter 범위의 미매핑 셀만 선택한 target component로 일괄 매핑한다. 이미 매핑된 셀은 보존되어 대규모 variant set 초기 매핑 속도를 높인다.
- [x] **Variant Matrix Editor v7 (TSV import/export batch remap, 2026-04-10)**: `Export TSV`로 현재 row/column matrix 범위의 component mapping(#id)을 표 형태로 복사하고, `Import TSV`로 붙여넣은 표를 기준으로 매핑을 일괄 반영한다. 셀 값은 `#id/id`=맵핑, `0/clear`=해제, 빈 값=유지 규칙을 지원해 대량 리네임·재배치를 스프레드시트처럼 빠르게 처리할 수 있다.
- [x] **Component Set Coverage Heatmap (2026-04-10)**: Variant Matrix Panel에 `Coverage: On/Off` 토글을 추가해 Empty/Unique/Duplicate 셀 상태를 즉시 강조하고, 매핑 커버리지 요약(총 셀/빈 셀/중복 매핑)을 표시한다.
- [x] **Component Variant Combination Tester (2026-04-13)**: Variant Matrix Panel에 `Run Combo Test` / `Copy Combo Report`를 추가해 component set의 전체 variant 조합을 자동 순회 검사한다. 누락 매핑(missing mapping)과 broken prototype interaction(NavigateTo/OpenOverlay target missing)을 함께 리포트해 대형 variant set의 QA를 빠르게 수행한다.
- [x] **Variant Matrix Missing Cells Workflow (2026-04-10)**: Panel에 `Missing Only` 토글과 `Copy Missing` 액션을 추가해 미매핑 셀만 빠르게 식별하고, 현재 row/column/filter 스코프 기준 누락 variant key 목록을 클립보드로 추출할 수 있다.
- [x] **Instance Controls unified card**: Instance 선택 시 Properties panel에서 Variant/Overrides/Component Props(텍스트 override 포함)를 단일 `INSTANCE CONTROLS` 카드로 묶어 편집
- [x] **Component Props Figma-style override polish**: Instance의 Boolean/Text/Instance Swap prop을 타입 배지 + override dot + `Reset all` 액션으로 노출, Text default placeholder/tooltip 제공, Component source의 속성 목록에 default/linked target 메타 표시
- [x] **Component Props default materialization**: 새 Instance 생성/컴포넌트 swap/variant-set swap 시 component property의 기본값(Boolean/Text/Instance Swap)을 즉시 자식 노드에 적용해 Figma처럼 기본 상태가 일관되게 반영
- [x] **Instance Override Diff Inspector**: Instance Controls의 Overrides 카드에 node/property 필터(검색 + scope), property chip 목록, `Reset visible` 일괄 리셋 액션을 추가해 변경점만 빠르게 검토/정리
- [x] **Component Instance Override Diff Inspector v2 (2026-04-12)**: Overrides 카드 하단에 `DIFF INSPECTOR` 행을 추가해 `base → local` 값을 속성 단위로 직접 시각화. 기존 필터(query/scope)와 동기화되며 각 diff row에서 속성 단위 selective reset(↺) 지원.
- [x] **Nested Override Tree View v1**: Overrides row를 node path 기준으로 정렬하고 leaf + depth badge(Ln) + 들여쓰기 트리로 표시해 중첩 인스턴스 override 탐색성 향상
- [x] **Component Property Defaults per Variant**: Component property(Boolean/Text/Instance Swap)의 기본값을 variant별로 저장/복원 가능. Instance Controls에서 현재 값을 현재 variant 기본값으로 저장(★)하거나 variant 기본값만 리셋(⟲v)할 수 있고, variant 전환 시 해당 variant 기본값 + override가 자동 재적용됨

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
- [x] **Pixel-perfect export**: auto-snap subpixel positions to integer grid during export
- [x] **Nearest-neighbor scaling**: disable anti-aliasing for crisp pixel art / icon export
- [x] Batch export dialog: pixel-align checkbox (default on) + nearest-neighbor checkbox
- [x] Rust `snap_to_pixels()` Scene method + WASM binding

### Copy / Paste
- [x] **Copy** (Cmd+C): serialize selected nodes + subtrees to internal clipboard
- [x] **Cut** (Cmd+X): copy + delete selected nodes
- [x] **Paste** (Cmd+V): deserialize with new IDs, offset +10px per paste
- [x] **Smart Paste to Frame**: flow-aware paste for auto-layout containers — (1) selected auto-layout container (single or mixed multi-selection): append into that container (중첩 선택 시 shallow/top-most 컨테이너 우선), (2) selected sibling nodes in same auto-layout parent: insert right after current selection block, (3) hover frame 우선(포인터 hit ancestor 포함) 자동 타겟팅 + paste 시점 live pointer 재해석으로 stale hover 보정, (4) fallback으로 frame under cursor drop-target 사용. 키보드 paste 직전에 포인터 이력이 없으면 캔버스 CSS 픽셀 기준 뷰포트 중심점을 fallback으로 사용해(dpr 영향 없이) 타겟 탐색 안정성을 보강. Cmd+V와 Cmd+Shift+V(Paste in Place) 모두 동일 동작. (2026-04-06 백로그 정리 시 동작 재검증)
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
- [x] **Interactive crop mode**: double-click Image → canvas crop overlay with 8 drag handles, rule-of-thirds grid, dim outside, Shift for aspect lock, Enter/Escape confirm/cancel

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
- [x] **Iframe Sandbox**: Sandboxed iframe plugin host with postMessage API, permission-based access control
- [x] **Plugin Manifest**: manifest.json-based plugin definition (id, name, version, permissions, main)
- [x] **Plugin Marketplace**: Browse/search/install/uninstall UI with categories, ratings, download counts
- [x] **Figma Plugin Compat**: Run Figma plugin code with compatibility layer
- [x] **Plugin Catalog**: Built-in catalog with 5 plugins (Lorem Ipsum, Color Palette, Grid Generator, Auto Rename, Accessibility Checker)

## 🔮 Future Ideas
- [x] Multi-select (shift+click, shift+click deselect, drag-select marquee, multi-node move)
- [x] Undo/redo
- [x] Copy/paste (Cmd+C/V/X/D with hierarchy, ID remapping, offset)
- [x] Alignment tools (align left/center/right/top/center-v/bottom, distribute H/V)
- [ ] Auto-layout (Figma-like)
- [ ] Components/instances
- [x] SVG export (per-node, selection, full canvas; Rust engine + WASM + toolbar button)
- [ ] Collaborative editing (CRDT)
- [x] Plugin system (iframe sandbox, manifest.json, marketplace, 5 sample plugins, Figma compat)
- [ ] Canvas text cursor + multi-line text
- [x] Image nodes (drag & drop, URL, clipboard paste, cover/contain/fill)
- [x] **Gradient fills**: Solid/LinearGradient/RadialGradient/ConicGradient fill types with gradient stops editor
- [x] **Gradient mesh fills**: Multi-point color interpolation on 2D grid (MeshGradient), bilinear tessellation rendering, mesh edit mode (double-click to enter, drag points, click to change colors), rows/cols adjustment, SVG export fallback
  - Linear: start/end points (normalized 0~1), multiple color stops
  - Radial: center/radius (normalized), multiple color stops
  - Conic: center (normalized 0~1), start angle (degrees), multiple color stops — CSS conic-gradient style angular sweep
  - Properties panel: mode switcher (Solid/Linear/Radial/Conic), stop color pickers, position inputs
  - Canvas rendering: conic gradient approximated with 360 arc segments
  - SVG export: conic gradient approximated with 72 arc path segments
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
  - Stroke align parity on Path: open/closed path 모두 Center/Inside/Outside 일관 렌더 (inside/outside는 경로 법선 오프셋 기반)
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
- [x] **Drag-to-Reparent with Auto-Layout Insertion Indicator**: Figma-style drag into Frame
  - Dragging nodes over auto-layout (Flex) Frames shows blue insertion line
  - Insertion index computed from cursor position relative to children midpoints
  - Diamond endpoints on indicator line, #0d99ff color
  - On drop: reparent node(s) at indicated position, position converted to frame-local coords
  - Supports row/column direction, handles empty frames, multi-select drag
  - Prevents circular reparent (can't drop into descendant)
  - Rust: Scene.reparent_at(), Engine.reparent_node_at(), get_layout_drop_zones(), get_auto_layout_frame_ids(), get_node_parent()
  - TS: tools/drag-reparent.ts (computeDropTarget, renderDropIndicator, executeDropReparent)
  - Undo integration, layers panel auto-refresh
- [x] **Smart Guides / Snapping**: Figma-style alignment guides during drag-move
  - Snap to edges (left/right/top/bottom) and centers of other nodes
  - Configurable threshold (5px screen-space)
  - Visual guide lines: magenta (#ff3366) lines extending between snapped nodes
  - Pure TypeScript implementation (no Rust/WASM changes needed)
- [x] **Snap to Pixel Grid**: Round x/y/width/height to integer (or 0.5px) during move/resize
  - Default ON, toggle button in zoom controls bar
  - Right-click button to switch between 1px and 0.5px precision
  - Coexists with smart guides and grid snap (grid snap takes priority when active)
  - Separate from grid snap — works at sub-pixel level for crisp rendering
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
- [x] **Stroke & Fill Blend Stack (2026-04-08)**: 각 Fill/Stroke에 개별 opacity + blend mode를 부여해 appearance stack처럼 합성
  - Fill/Stroke 데이터 모델 확장: `opacity`(0..1), `blend_mode`(16 modes, default Normal)
  - WASM API: `set_fill_opacity_at`, `set_fill_blend_mode_at`, `set_stroke_opacity_at`, `set_stroke_blend_mode_at`
  - Properties panel: Fill/Stroke 항목별 Opacity(%) + Blend mode 선택 UI
  - Canvas 렌더: 노드 opacity 위에 fill/stroke별 opacity를 곱하고 per-paint blend를 적용 (backward-compatible defaults)
- [x] **Multi-page support**: multiple pages per document with tab UI
  - Page management: add, remove, rename, duplicate, switch
  - Backward-compatible serialization (old single-page files auto-migrate to "Page 1")
  - Tab bar UI: bottom-center above toolbar, click to switch, double-click to rename
  - Context menu: Rename, Duplicate, Delete (minimum 1 page enforced)
  - Undo/redo: full scene snapshots include all pages
  - WASM API: add_page, remove_page, rename_page, set_active_page, duplicate_page, get_pages, get_active_page_id, get_page_count
- [x] **Artboard View (multi-page canvas)**: toggle to show all pages simultaneously on infinite canvas
  - Each page rendered at its canvas_x/canvas_y position with white artboard background + shadow
  - Active page highlighted with blue border
  - Page name labels above each artboard
  - Click to switch active page, viewport culling for off-screen pages
  - Renderer skip_background flag for compositing multiple pages
  - Page tabs bar: artboard view toggle button (grid icon)
  - Keyboard shortcut: Cmd+Alt+A
  - WASM API: get_all_pages_layout, set_page_canvas_position, set_skip_background, render_page
- [x] Boolean operations (Union, Subtract, Intersect, Exclude)
- [x] Constraints (responsive resizing) — Horizontal: Left/Right/LeftAndRight/Center/Scale, Vertical: Top/Bottom/TopAndBottom/Center/Scale
- [x] Prototyping (interactions/transitions)
  - Interaction struct: trigger (OnClick/OnHover/OnPress/OnDrag/OnSwipeLeft/OnSwipeRight/OnSwipeUp/OnSwipeDown/OnLongPress/OnPinchIn/OnPinchOut), action (NavigateTo/Back/ScrollTo/OpenOverlay/CloseOverlay), target node/page ID, transition type (Instant/Dissolve/SmartAnimate/SlideIn/SlideOut/Push), duration, easing (linear/ease_in/ease_out/ease_in_out/cubic_bezier:x1,y1,x2,y2), easing (Linear/EaseIn/EaseOut/EaseInOut/CubicBezier)
  - WASM API: add_interaction (with easing param), remove_interaction, clear_interactions, get_interactions, get_interaction_count, get_all_interactions, set_interaction_easing, set/get_interaction_timeline
  - Properties panel: "Interactions" section with trigger/action/target/transition/duration/easing editors, add/remove
  - Smart Animate Timeline: interaction card에 시각 타임라인 레일 + keyframe diamond 편집기 추가 (드래그로 시간 이동, 레일 클릭으로 mid keyframe 추가, 선택 keyframe easing 편집/삭제), interaction에 `smart_animate_timeline_json`으로 저장
  - Smart Animate Timeline polish: duration 변경 시 keyframe 시간을 비율 유지로 자동 리타이밍, 레일 0~100% tick(ms) 표시, 선택 keyframe % 라벨 표시
  - Smart Animate Timeline Editor v2: `Open Timeline Editor v2` 전용 패널 추가 (키프레임 label/time/easing를 한 화면에서 편집, SVG 미니 커브 프리셋 버튼으로 다중 keyframe easing 일괄 적용, 체크박스 기반 선택 행 우선 배치 편집, Stagger 일괄 적용 forward/reverse/center-out, label prefix 기반 Group Timeline Offset 적용)
  - Smart Animate Graph Editor v1 (2026-04-10): Timeline Editor에 property track 그래프(라벨 prefix 기반) 시각화 추가. 트랙별 keyframe 분포를 SVG로 보여주고, 트랙 칩 클릭으로 해당 트랙 keyframe 행을 선택해 곡선/배치 편집 워크플로우를 빠르게 전환.
  - Smart Animate Diff Inspector: interaction 카드에서 Analyze 버튼으로 from/to frame의 auto-animate 매칭 결과를 즉시 진단 (matched/removed/added 카운트 + 샘플 레이어명), 누락 원인(이름 불일치/단측 존재) 확인 가능
  - Prototype viewer Smart Animate는 timeline segment별 easing을 반영해 시간 remap 후 보간
  - Easing curve editor: SVG-based 120×120 cubic-bezier editor with draggable control points, preset buttons (Linear/EaseIn/EaseOut/EaseInOut/Custom), inline in interaction section
  - Prototype viewer: full-screen overlay, click navigation, back stack, Esc to close
  - Prototype viewer Device Preview: top-bar device preset selector (No Device/iPhone/Pixel/iPad), frame bezel+corner radius+notch overlay, safe-area inset guide, preview scrollbar indicator
  - Device preview polish: Portrait/Landscape orientation switch + Safe Area overlay toggle, and safe-area/notch metrics are normalized from device reference size to current frame size for responsive preview
  - Prototype viewer Scroll Physics Presets: top-bar Scroll preset selector (iOS/Android/Web), wheel/touch gain + overscroll clamp + inertia decay 프리뷰
  - Prototype Event Recorder (draft v2): top-bar `Record`로 click/input/scroll/navigate 타임라인 캡처, `Draft JSON`으로 scenario+timeline 포함 draft 생성, `Apply Draft`로 추론된 `OnClick → NavigateTo` interaction을 문서에 즉시 반영
  - Animated transitions: Dissolve (cross-fade), SlideIn (from right), SlideOut (old exits right), Push (both move), SmartAnimate (name-matched node interpolation with position/size cross-fade)
  - SmartAnimate: Rust engine `compute_auto_animate(from, to)` matches descendants by name, returns paired snapshots with full property diffs (position, size, rotation, opacity, corner_radius, blur, fill color, stroke width)
  - SmartAnimate rendering: matched nodes interpolate all properties with cubic ease-in-out, rotation via canvas transform, rounded clip for corner_radius, removed nodes fade out, added nodes fade in
  - Toolbar: Play button (▶), keyboard shortcut Cmd+Enter
  - Prototype Hotspot Authoring Tool: toolbar `Hotspot` 툴(Shift+H)로 프레임 위를 드래그해 투명 hotspot(rect) 생성, 생성 즉시 `OnClick → NavigateTo` interaction 자동 연결(선택된 Frame 우선, 없으면 문서 내 Frame fallback); 프레임 위에서 생성하면 해당 프레임 자식으로 자동 reparent
  - Prototype Trigger Regions v1: Hotspot 툴에서 `Shift + Drag`로 Polygon 기반 hotspot region 생성 지원 (사각형 외 형태로 trigger 영역 구성)
  - Prototype viewer interaction hit-test는 bounding box가 아닌 `engine.hit_test + parent chain` 탐색으로 동작하여 Path/Polygon 기반 hotspot에서도 정확히 매칭
  - Interaction 모델에 `accessibility_label` 필드 추가 + Properties panel Interactions의 `A11y` 입력으로 설정 가능
  - Prototype Trigger Regions v2 (Hotspot Shape Editor): Interaction 모델에 `hotspot_shape_json`(rect/polygon, normalized 0~1) 추가, WASM `set_interaction_hotspot_shape` 제공, Properties panel Interactions에 Hotspot shape 편집 UI(Node Bounds/Rect/Polygon + JSON payload) 추가
  - Prototype Trigger Regions v3 (Hotspot Shape Editor): Properties panel에 미니 캔버스 기반 hotspot editor 추가 (Rect drag, Polygon point click, Freeform drag draw + undo/reset), JSON 수동 편집과 양방향 동기화
  - Prototype viewer hit-test가 interaction별 hotspot shape(rect/polygon/freeform)를 우선 사용하고, hover hint도 실제 shape path를 그대로 하이라이트
  - Prototype viewer hover 시 활성 hotspot 강조선 + accessibility label 툴팁 표시
  - Prototype Focus Order & Keyboard Navigation v1: Tab/Shift+Tab으로 focusable hotspot(OnClick/OnPress) 순환, Enter/Space로 interaction 실행, focus ring(노란 dashed) 표시, 기본 정렬은 top→bottom / left→right
  - Prototype Keyboard Navigation Order Editor v2 (2026-04-12): Prototype viewer 좌측 패널에서 keyboard hotspot을 interaction 단위(동일 노드 다중 hotspot 분리)로 시각화/재정렬(↑/↓)하고, frame별 custom Tab order를 저장(localStorage)한다. 캔버스 hotspot 힌트에 Tab index 배지를 오버레이해 순서를 즉시 검증할 수 있으며, `Reset auto`로 기본(top→bottom/left→right) 순서로 복귀한다.
  - Prototype Flow Coverage Recorder (2026-04-12): Prototype viewer 좌측 `Flow Coverage` 패널에서 세션 중 방문 frame 수/방문 hotspot 수를 수집하고 frame별 visits + hotspot coverage bar(heatmap)를 리포트한다. row 클릭으로 해당 frame 점프, `Reset`으로 세션 coverage 초기화.
  - A11y Motion Guardrails (2026-04-12): Properties panel `Interactions`에 Reduced motion preview 토글 + 과도한 모션 lint(transition duration ≥ 900ms 또는 aggressive easing) 카드 추가. `Quick fix excessive motion`으로 대상 interaction을 Dissolve 220ms/ease_out으로 정규화하며, Prototype viewer는 reduced-motion ON 시 animated transition을 짧은 Dissolve(최대 180ms)로 가드한다.
  - Prototype Focus Ring Style Presets: Properties panel Interactive Variants에 ring preset 관리자 추가(hover/press/focus별 color/width/radius), Save As/Apply 지원, Prototype viewer가 active preset을 읽어 상태별 ring 스타일(hover/press/focus)로 렌더링
  - Prototype Start Point Manager (viewer quick switch): Prototype viewer 좌측 패널에 Flow/Start Frame selector + `Use current`/`Save`/`Run selected flow` 액션을 추가해 flow별 entry frame을 즉시 전환/저장하고 실행 타깃을 빠르게 점프
  - Prototype Flow Entry Branch Presets: Start Point Manager에 flow별 entry preset 저장(`Save preset`) + one-click preset 칩 점프/적용 추가 (최근 6개 유지)
  - Interaction hotspot hints (color-coded: blue=click, green=gesture, orange=hover)
  - Gesture-based interactions: swipe (left/right/up/down), long-press (500ms), pinch in/out
  - Touch event handling in prototype viewer: swipe detection (>50px, <500ms), long-press timer, two-finger pinch distance ratio
  - Gesture trigger labels shown on hotspot hints in preview
  - Gesture Conflict Resolver: Properties panel `Interactions` 상단에서 trigger 충돌 그룹(중복 trigger, drag+swipe 혼합)을 Diagnose하고, `Auto Resolve`로 interaction 순서를 trigger 우선순위(hover→press→click→drag→swipe→long-press→pinch) 기준 자동 정렬
  - Interactive Components Trigger Conflict Linter (2026-04-12): Interactive Variants `State Preview`에서 hover/press/focus가 동일 trigger에 서로 다른 variant key로 매핑되는 충돌을 탐지/리포트하고, Quick fix(`mirror to hover/press`)로 충돌 state를 기준 variant로 정렬 후 SwapVariant interactions를 재동기화
  - Interactive Components Trigger Conflict Linter v2 (2026-04-12): 동일 trigger 공유 상태 간 variant key 충돌뿐 아니라 SwapVariant interaction key 불일치(중복/상이 key)까지 함께 lint한다. Quick fix 제안을 2가지로 확장(`keep hover/press canonical`, `dedupe trigger mappings`)해 instance 단위 trigger drift를 빠르게 정리한다.
  - **Prototype Flows**: PrototypeFlow struct (id, name, start_frame_id, start_page_id), Scene-level storage with backward-compatible serde
  - Flow CRUD: add_flow, remove_flow, rename_flow, set_flow_start_frame
  - Flow connections: get_flow_connections (BFS from start frame), get_all_cross_page_interactions (cross-page only)
  - Flow Diagram View: full-screen overlay with page thumbnail cards, interaction arrows (bezier curves), start frame green marker, pan/zoom support
  - Flow Diagram Mini-Graph diagnostics: header에 connection/dead-end/isolated 카운트 표시, dead-end 페이지를 red tint + `DEAD END` 배지로 강조
  - Properties panel: "Prototype Flows" section with flow list, add/remove/rename, start frame assignment
  - Prototype Start Points Manager: flow card마다 start point select(연결 노드 기반 후보), `Use selected`/`Clear` 빠른 액션, flow focus 전환 버튼으로 flow별 진입점 관리 강화
  - Prototype Transition Presets Library: Interactions 섹션에서 transition/easing/duration 조합을 문서 스코프 preset으로 Save/Apply, 활성 flow 기준 `Set as flow default` 지정, 새 interaction 추가 시 flow default 자동 적용
  - Smart Animate Preset Sequencer (2026-04-12): Interactions 카드에 enter/exit 단계 체인 draft(+Step) 작성과 `Save chain` preset 저장을 추가. 저장된 chain을 `Apply chain`으로 현재 노드의 prototype interactions에 순차 적용해 enter 계열(Navigate/OpenOverlay/ScrollTo/SwapVariant/SetVariable)과 exit 계열(Back/CloseOverlay) transition/duration/easing을 일괄 세팅
  - Smart Animate Preset Sequencer v2 (2026-04-12): 시퀀스 preset에 apply mode(`clamp`/`loop`)를 추가해 interaction 수가 step 수를 초과할 때 마지막 step 고정 또는 반복 순환을 선택 가능. preset 드롭다운 메타와 apply 결과 알림에 mode를 표시해 체인 적용 의도를 명확화
  - Smart Animate Preset Sequencer v3 (2026-04-12): 저장 preset 관리 UX 보강(`Load`로 draft 복원, `Delete`로 정리, selected preset 메타 preview). 체인 반복 튜닝/재사용 사이클을 interaction 카드 내에서 닫아 편집 왕복을 줄임.
  - Toolbar: Flow Diagram button next to prototype play button (i18n tooltip: en/ko/ja)

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
- [x] **Typography Styles Advanced (2026-04-06)**: TextStyle includes `letter_spacing`, `opentype_features`, `font_variation_settings` for advanced typography parity
- [x] **Advanced sync/apply**: `apply_text_style` / `sync_text_style` propagate OpenType + variable axes + letter spacing to linked text nodes
- [x] **Replace-all workflow**: `replace_text_style_all(old, new)` relinks all matching text-style nodes document-wide
- [x] **Text Styles ↔ Typography Token Sync (2026-04-08)**: TextStyle에 optional `typography_token { collection_id, variable_id }` 링크 추가. WASM API `link_text_style_token`, `relink_text_style_token`, `detach_text_style_token`, `sync_text_style_to_token`, `sync_text_style_from_token` 제공. String 변수(JSON payload)로 스타일 값을 Push/Pull하며, Properties panel Text Style 섹션에 Link/Relink/Detach + Pull/Push 버튼 UI 추가.
- [x] **Text Styles Inspector (Local vs Linked Diff) (2026-04-10)**: Properties panel Text Style 섹션에 Local vs Linked 비교 인스펙터 추가. font family/size/weight/style/line-height/letter-spacing/align 필드별 오버라이드 여부를 표시하고, 필드 단위 `Reset` + 전체 `Reset all overrides` 액션으로 linked style 값으로 정리 가능.
- [x] **Text Styles Inspector Batch Cleanup pass (2026-04-10)**: WASM `inspect_text_style_overrides(style_id)` + `cleanup_text_style_overrides(style_id)` API 추가. 선택된 Text Style 기준으로 링크된 텍스트 노드들의 drift를 집계하고, Properties panel에서 현재 노드 diff(local vs linked) + `Open diff list` 모달(노드별 diff/체크박스 선택) 제공. `Clean all linked overrides`와 `Clean selected`로 일괄/선별 정리 워크플로우 지원.


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
- [x] **Vector Boolean Live Preview (MVP)**: Boolean 버튼 hover 시 연산 결과의 예상 bounding box를 캔버스에 실시간 오버레이 (scene snapshot → boolean simulate → restore)
- [x] **Shape Builder Tool**: 새로운 `shapeBuilder` 툴 추가 (toolbar + 단축키 Shift+B)
- [x] **Gesture target detection**: 드래그 브러시 궤적이 노드 AABB를 지나가면 hit로 집계 (2개 이상 선택 시 선택 노드만 대상으로 제한)
- [x] **Quick add/subtract**: gesture 종료 시 hit 노드 2개 이상이면 Boolean 실행 (기본 Union, Alt 누른 채 드래그 시 Subtract)
- [x] **Quick workflow**: 사전 선택 없이도 드래그만으로 대상 수집 후 즉시 boolean 실행 가능
- [x] **Canvas overlay**: 드래그 궤적 점선 + 현재 모드/히트 수 HUD 렌더링

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
- Properties panel: Constraints section with H/V dropdowns + selection-box Pin UI 토글 버튼(Left/Right/Top/Bottom/Center/Scale) 제공 (shown for nodes with Frame/Group parent)
  - Edge pins are directly toggleable: Left/Right and Top/Bottom cycle through single-pin ↔ dual-pin(stretch) ↔ center states
  - Center/Scale toggles are mutually exclusive per axis and clicking active Center/Scale returns to default (Left/Top)
- Canvas overlay: single-selection 시 노드 상단에 3×3 Constraint Pins 미니맵 표시 (현재 H/V 상태를 파란 점으로 시각화)
- Canvas overlay click-to-edit: 핀 미니맵 클릭으로 H/V constraints를 즉시 변경 (좌/중/우 × 상/중/하), 좌/우·상/하 조합 토글 시 LeftAndRight/TopAndBottom 자동 전환
- Canvas overlay scale controls: `Scale H`, `Scale V` 전용 버튼으로 scale constraints를 즉시 지정, undo + properties 패널 즉시 반영
- Constraint Presets Library:
  - Constraints section에 인라인 Preset selector(Built-in/Custom optgroup) + Save / Apply / Delete 버튼 제공
  - Built-in responsive presets: Mobile(Stretch width, Bottom sticky), Tablet(Centered), Desktop(Scale)
  - Saved fields: H/V constraints, sizing_h/sizing_v, min/max width/height
  - Min/Max quick chips (2026-04-11): Size 섹션에서 `Min W/Max W/Min H/Max H`를 pill chip으로 on/off 토글, 활성 항목만 숫자 input 노출
  - Storage: localStorage (`opensketch-constraint-set-presets-v1`)
  - Custom preset은 이름 기준 덮어쓰기 저장(dedupe), 삭제 시 확인 다이얼로그 제공
  - Apply supports multi-selection (only nodes with Frame/Group parent are updated)
  - Multi-select batch toggle (2026-04-10): Constraints H/V dropdown + Pin UI에서 `Apply to N selected layers` 체크박스로 즉시 일괄 적용 전환 지원
- Constraint Set Presets (auto-layout bundle):
  - `Constraint Set Presets` 섹션에서 저장한 프리셋(레이아웃+self/child constraints)을 `Frame/Group` 멀티 선택에 일괄 적용 지원
  - Apply 버튼은 다중 선택 시 `Apply (N)`으로 대상 수를 표시하고, 선택에 적용 가능한 노드가 없으면 가드 alert 표시
- Constraint Debug Overlay (Responsive Preview):
  - 부모(Frame/Group) 리사이즈 핸들 드래그 중 캔버스 오버레이로 자식 constraint 계산 근거를 실시간 시각화
  - 부모 old/new bounds(흰색/파란색) + 자식 old/new bounds(흰색/마젠타) + 중심 이동 벡터를 동시에 렌더링
  - 각 자식 위에 `horizontal / vertical` 모드 태그(`left`, `right`, `leftAndRight`, `center`, `scale` 등)를 표시해 앵커/scale/stretch 해석을 즉시 확인 가능
  - 상단 Debug 카드의 규칙 설명(`x fixed`, `x + ΔW`, `w + ΔW`, `scale`)과 캔버스 벡터가 동기화되어 실제 엔진 결과와 예측 계산을 교차 검증 가능
  - **v2 (2026-04-11): Constraints Preview While Resize 완료** — 자식 old/new bounds를 ghost fill(기존/예측 반투명)로 동시 표시하고, 라벨에 `Δx/Δy/Δw/Δh` 수치를 추가해 핸들 드래그 중 결과를 즉시 판독 가능
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
- [x] **Scene diff engine**: Rust `scene_diff.rs` — compare two scene JSON snapshots, detect added/removed/modified nodes with property-level diff (name, position, size, rotation, opacity, visibility, fill, children, kind)
- [x] **Diff visualization**: modal UI showing color-coded changes (green=added, red=removed, yellow=modified) with property-level before→after values
- [x] **Version comparison**: compare any two versions side-by-side via ⇔ button, select versions from dropdowns
- [x] **Auto-save labeling**: enriched labels showing currently-edited node name ("Auto · editing 'Button'"), node/page count metadata per version
- [x] **Relative timestamps**: "Just now", "5m ago", "2h ago" alongside absolute timestamps
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
- [x] **Grid/Guide templates**: Zoom bar 템플릿 드롭다운으로 8pt/4pt Grid, 12-column, Safe Area 프리셋 원클릭 적용
- [x] **12-column template**: 현재 뷰포트 기준 좌우 4% margin + 12등분 세로 가이드 자동 생성
- [x] **Safe Area template**: 현재 뷰포트 기준 상하/좌우 5% 인셋 가이드 자동 생성
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
- [x] **Instance metadata exposure**: Instance 선택 시 master/component set/variant key/property override 상태를 Inspect 패널에서 표시하고 JSON 스냅샷 코드 블록으로 복사 가능

### Export/Import Styles
- [x] **Export styles**: JSON file download with all color + text styles
- [x] **Import styles**: File picker → merge into current style library with new IDs
- [x] **Portable format**: Version field, full ColorStyle + TextStyle serialization
- [x] **UI**: "Styles Library" section in Properties panel empty state (no selection)
- [x] **Text Scale Tokens**: one-click `12/14/16/20/24/32` text style preset 생성 + 문서 전체 Text 노드를 nearest scale style로 일괄 remap (Properties empty-state 버튼)
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
- [x] **SCSS Variables format**: $color-*, $font-family-*, $font-size-*, $font-weight-*, $line-height-* + variable collections
- [x] **Design Token Export modal**: Format selection cards (W3C/Style Dictionary/Tailwind/CSS Variables/SCSS), live preview, copy to clipboard, download
- [x] **Design Tokens Sync Bridge**: 동일 모달에서 JSON import → diff preview → one-click apply 지원
  - Direction A (External JSON → OpenSketch): color/text/variable add/update diff를 계산하고 바로 적용
  - Direction B (OpenSketch → External JSON): local 토큰 기준 add/update/remove diff를 계산해 외부 JSON에 merge 후 `*.synced.json`으로 다운로드
  - Style Dictionary primitive leaf + W3C `$value` leaf 파싱
  - `{token.path}` alias reference resolve 후 diff/apply (cycle-safe)

### Design Token Aliasing
- [x] **Token aliases**: TokenValue::Alias variant — tokens can reference other tokens via `{token.name}` syntax
- [x] **Deep resolution**: `resolve_deep()` follows alias chains (max 16 depth, cycle-safe)
- [x] **Alias chain inspection**: `get_alias_chain()` returns full resolution path for debugging
- [x] **WASM bindings**: `token_set_alias`, `token_resolve_deep`, `token_get_alias_chain`
- [x] **Theme apply integration**: `apply_token_theme()` uses deep resolution for bound nodes
- [x] **UI**: Alias tokens show 🔗 icon + purple color, click to view chain, convert existing tokens to alias
- [x] **Token binding**: Alias tokens appear in binding dropdowns based on resolved type
- [x] **Backward-compatible serde**: existing files without aliases load fine

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
- [x] **Emoji reactions**: Reaction struct (emoji + users[]), toggle_reaction Scene method, WASM toggle_comment_reaction/get_comment_reactions
- [x] **Reaction UI**: Quick emoji picker (👍👎❤️🔥🎉👀💯🤔), toggle on/off per user, count badges in thread popup + comment cards
- [x] **Backward compatible**: serde(default) for reactions field

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
- [x] **Theme Mode Set quick apply**: Variables panel infers shared mode names across collections (e.g. Light/Dark/custom) and provides one-click chips to switch all mapped collections together (applies variables + re-render).
- [x] **Variable Modes Quick Switch (Toolbar)**: 툴바 버튼으로 플로팅 패널을 열어 각 collection의 active mode를 즉시 전환 (예: Desktop/Mobile, Light/Dark), 변경 즉시 `set_active_mode` + `apply_variables` 반영
- [x] **Variable Collections & Modes Quick Switcher (Canvas Top, 2026-04-11)**: 캔버스 상단 중앙에 shared mode 칩(예: Light/Dark/Brand) 표시, 클릭 한 번으로 모든 컬렉션의 매칭 mode를 동시 전환. 전환 시 `apply_variables` + 렌더 즉시 반영, 공통 이벤트(`opensketch:theme-mode-changed`)로 다른 UI와 동기화.
- [x] **Binding UI**: Properties panel "Variable Bindings" section with bind/unbind per property, variable picker popup
- [x] **Backward-compatible serde**: Default empty collections/bindings for existing files
- [x] **Conditional visibility**: Per-node `VisibilityCondition` (variable_id + operator + value) — evaluated at render/hit-test time. Operators: Eq/NotEq/Gt/Lt/Gte/Lte/IsTrue/IsFalse. UI in Properties panel "Conditional Visibility" section. Also supports binding Boolean variables to `visible` property via variable mode switching
- [x] **Conditional Visibility Rules Builder v3 (2026-04-10)**: 캔버스+프로토타입 공통으로 적용되는 JSON rule tree(`logic: AND/OR`, `conditions[]`)를 지원. 다중 규칙 추가/삭제, 그룹 로직 전환(AND/OR), legacy 단일 rule 자동 마이그레이션(prefill) 제공. 엔진은 `conditional_visibility_rules`가 있으면 우선 평가하고, 없으면 기존 `VisibilityCondition`으로 fallback.
- [x] **Conditional Visibility Rules Builder v2 (2026-04-10)**: 기존 rule이 있어도 Properties panel에서 동일 UI로 즉시 수정 가능(변수/연산자/value prefill). 타입 힌트 + 연산자별 value input 자동 표시/숨김, `Update rule`/`Remove rule` 액션을 제공해 rule 생성/수정/삭제를 한 섹션에서 처리.
- [x] **Variable scoping**: VariableScope enum (Global/Pages/Nodes) per collection — restricts variable usage to specific pages or frames. apply_variables() skips out-of-scope bindings. Scope UI in Variables panel: dropdown (Global/Pages/Nodes) + page checkboxes or frame picker. WASM: set_collection_scope, get_collection_scope. Backward-compatible serde (default Global).
- [x] **Variables Inspector & Usage Graph**: Variables panel now shows per-variable usage count + usage list (node/property jump), detects broken bindings (missing node/collection/variable), and provides one-click cleanup. WASM: `get_variable_usages`, `get_broken_variable_bindings`, `cleanup_broken_variable_bindings`.
- [x] **Variable fallback chain + auto recovery suggestions**: apply flow uses `mode → collection → literal` fallback. If active mode value is missing, it falls back to first available mode value; if collection/variable resolve fails, it suggests (and can auto-apply) alternate bindings from scoped collections; if unresolved, node literal value is preserved. Variables Inspector marks recoverable bindings and offers `Auto-recover`. WASM: `recover_broken_variable_bindings`.
- [x] **Variable panel search/filter + collection usage summary**: Variables table supports inline name search + type filter (All/Color/Number/String/Boolean), shows filtered count, and displays aggregated usage total for currently filtered variables.
- [x] **Bulk edit table view**: Spreadsheet-style table for variable collections — rows=variables, columns=modes, editable cells. Multi-cell selection (click/Shift+range/Ctrl+toggle), arrow key navigation, Enter to edit, Tab to next cell. Copy/paste (Ctrl+C/V) with TSV format for multi-cell ranges. Delete/Backspace resets selected cells. Double-click variable name to rename inline. CSV export (download) and CSV import (file picker) buttons using existing WASM bindings (export_collection_csv, import_collection_csv, bulk_update_variables). Toggle via ⊞ button in card view.
- [x] **Variables Usage Heatmap overlay**: Variables Inspector에 `Usage heatmap overlay` 토글을 추가해 컬렉션 전체 변수 사용처를 노드별로 집계하고, 캔버스에 binding density(저밀도→고밀도 색상)를 반투명 오버레이로 표시.
- [x] **Variables Collection Diff Timeline**: Variables 패널에 `Variable Diff Timeline` 섹션을 추가해 mode별 값 변경 이력을 스냅샷(before/after)으로 기록하고, 변경 모드 기준 quick diff를 표시한다. 항목 확장 시 모든 mode 값 비교를 확인할 수 있고 `Rollback latest`/`Rollback this`로 특정 시점 이전 상태를 즉시 복구할 수 있다 (localStorage 기반 히스토리 보존).
- [x] **Variables Mode Parity Checker**: Variables 패널에 `Mode Parity Checker`를 추가해 컬렉션 내 변수별 mode 누락 값을 탐지하고, `Normalize missing`으로 active mode(없으면 첫 유효 mode) 값을 누락 mode들에 일괄 채워 mode parity를 빠르게 맞출 수 있다.
- [x] **Variable Mode Drift Auto-Fix Recipes (2026-04-12)**: Variables 패널에 `Mode Drift Auto-Fix Recipes` 섹션을 추가해 source mode → target mode 패턴을 recipe로 저장/재사용 가능. recipe는 value type 범위(Any/Color/Number/String/Boolean)를 지원하며 `Apply` 한 번으로 drift된 mode 값만 일괄 정리(`set_variable_value` + `apply_variables`)한다.

### Asset Library Panel
- [x] **Assets tab**: Right pane "Assets" tab alongside Properties/Agent/History/Inspect/Comments/Variables
- [x] **Search/filter**: Global search bar filters all asset types by name
- [x] **Components section**: Lists all components from ComponentStore with variant count, click to create instance at (100,100)
- [x] **Color Styles section**: Color swatch + name + hex value, click to apply to selected nodes
- [x] **Text Styles section**: Font preview "Ag" + name + font details, click to apply text style to selected nodes
- [x] **Asset Relink Manager (2026-04-08)**: Assets 패널에 깨진 Image/Video src 스캔 + 일괄 경로 재매핑(Find prefix → Replace) 도구 추가. 빈 src/비이식성 file path/상대경로 의심/이미지 로드 실패를 reason과 함께 탐지하여 일괄 relink 지원.
- [x] **Asset Relink rules persistence (2026-04-09)**: Find/Replace 매핑 규칙을 localStorage(`opensketch-asset-relink-rules-v1`)에 저장/재사용. Saved rules 드롭다운으로 빠른 재적용, 중복 제거, 최근 규칙 우선(최대 20개).

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
- [x] **Section enhancements**: Background color from fills, collapse/expand toggle (▶/▼), title color & font size customization
- [x] **Collapse/Expand**: Double-click title to toggle; collapsed sections hide children in render & hit-test
- [x] **Properties panel**: Collapsed checkbox, title color input, title font size input
- [x] **WASM bindings**: set/get/toggle_section_collapsed, set_section_title_color, set_section_title_font_size

### Responsive Resize Preview
- [x] **Fullscreen overlay**: Shows selected Frame at multiple breakpoints side by side
- [x] **Default breakpoints**: Mobile (375px), Tablet (768px), Desktop (1440px)
- [x] **Custom breakpoints**: Add/remove breakpoints via UI
- [x] **Breakpoint presets**: One-click "Preset" button adds Mobile 375/Tablet 768/Desktop 1440; `set_breakpoints_preset` WASM API
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
- [x] **Min/Max content sizing**: Hug mode clamp + Flex Fill bounded distribution(min 선할당 → 잔여 균등 배분 → max 도달 시 재분배)으로 min_width/max_width/min_height/max_height 제약을 안정적으로 반영
- [x] **Text overflow (Clip/Ellipsis)**: TextOverflow enum (Visible/Clip/Ellipsis), word-wrapping in Fixed text sizing, single-line and multi-line ellipsis truncation, clip region for overflow hidden, text-align support in rendering, Properties panel overflow mode toggle
- [x] **Breakpoint indicator**: Shows active breakpoint label + current width as floating pill above the resized frame
- [x] **resize_node_with_layout**: Combined WASM method for resize + immediate layout recomputation
- [x] **compute_layout**: Explicit WASM method for triggering layout recomputation from TypeScript
- [x] **get_active_breakpoint_info**: Returns active breakpoint label/max_width as JSON for UI indicators

### Breakpoints Multi-Viewport Preview
- [x] **Scene-level breakpoints**: SceneBreakpoint struct (name, width, height) stored at scene level
- [x] **Default presets**: Mobile (375×812), Tablet (768×1024), Desktop (1440×900)
- [x] **Fullscreen overlay**: Side-by-side viewport cards with SVG rendering per breakpoint
- [x] **Scroll sync**: Synchronized vertical scrolling across all viewport cards
- [x] **Add/Edit/Remove**: Inline breakpoint management from the preview overlay
- [x] **Preset reset**: One-click restore to default breakpoints
- [x] **WASM API**: add_scene_breakpoint, remove_scene_breakpoint, update_scene_breakpoint, get_scene_breakpoints, get_default_breakpoints
- [x] **Toolbar button**: Multi-column icon + Cmd+Shift+B shortcut
- [x] **Properties panel**: "Breakpoints Preview" button for Frame/Section nodes
- [x] **Constraint-based resize**: Uses resize_node_with_constraints for accurate responsive rendering
- [x] **Non-destructive**: Scene snapshot/restore ensures no side effects on the actual design

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
- [x] **Variable Mode Quick Preview**: Frame Breakpoints 섹션에서 preset 칩으로 mode를 즉시 미리보기하고 Revert로 이전 active mode/preset 복원

### Measure Tool
- [x] **Alt+hover**: Hold Alt with selection → hover over another node to show distances
- [x] **Distance lines**: Red dashed lines (#ff3366) with px distance labels (pink pills)
- [x] **Edge-to-edge**: Shows horizontal and vertical gap distances between bounding boxes
- [x] **Overlap handling**: When nodes overlap, shows distances to individual edges
- [x] **Target highlight**: Hovered node outlined with red dashed border
- [x] **End ticks**: Perpendicular tick marks at measurement endpoints
- [x] **Multi-select measure assist**: Alt/Dev overlay에서 다중 선택 시 각 노드의 W/H 치수 라벨을 동시에 표시하고, hover 대상이 없으면 가장 가까운 선택 노드 쌍의 간격선을 자동 표시
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
- [x] **WASM bindings**: batch_rename_selection, batch_find_replace_selection, batch_add_fix_selection, batch_rename_preview, batch_find_replace_preview, batch_add_fix_preview, batch_rename_preview_ex
- [x] **Prefix/Suffix mode**: Add prefix and/or suffix to node names (batch_add_fix)
- [x] **Sequence shorthand**: # character in pattern replaced with sequential number (1, 2, 3...)
- [x] **Dialog UI**: Modal dialog with 3 mode tabs (Sequence / Find & Replace / Prefix/Suffix), live preview, regex toggle
- [x] **Smart Rename Tokens (Pattern mode)**: Selection 노드명의 `/` 토큰 빈도를 분석해 추천 패턴 칩 제공 (예: `btn/primary/{n}`)
- [x] **Separate module**: ui/batch-rename.ts standalone file
- [x] **Context menu**: "Batch Rename…" option when 2+ nodes selected
- [x] **Layers panel**: Right-click context menu with "Batch Rename…" for multi-selection
- [x] **Keyboard shortcut**: Cmd/Ctrl+Shift+R
- [x] **Undo support**: Full undo via push_undo() before rename

### Auto-rename Layers
- [x] **Smart naming**: Node kind + properties → descriptive name (Text → first line, Image → filename, Star → "5-Point Star", etc.)
- [x] **Frame content-aware naming**: Frame children composition 기반 추론 (Image+Text → `Card`, all text → `Text Group`, all shapes → `Shape Group`, single child → `<Child> Container`, fallback `Frame N items`)
- [x] **Instance resolution**: Instance nodes get component name from ComponentStore
- [x] **Sibling dedup**: Numeric suffix when siblings share the same base name
- [x] **Rust engine**: Scene.auto_name_for_node(), auto_rename_node(), auto_rename_all(), auto_rename_selection()
- [x] **WASM bindings**: auto_rename_node, auto_rename_selection, auto_rename_all, auto_rename_preview
- [x] **Context menu**: "Auto-rename" for selected nodes, "Auto-rename All Layers" on empty canvas
- [x] **Layers panel**: Right-click "Auto-rename" option
- [x] **Undo support**: push_undo() before rename

### Slice Tool (Export Regions)
- [x] **NodeKind::Slice**: Non-rendering node that defines a rectangular export region
- [x] **Canvas overlay**: Green (#36b37e) dashed outline + name label
- [x] **Toolbar**: Slice button with K keyboard shortcut
- [x] **Properties panel**: Full export section with per-slice export item list
  - Multiple export items per slice (add/remove)
  - Scale selector (0.5x–4x) per item
  - Format selector (PNG/JPG/WebP/SVG) per item
  - Suffix input per item (e.g. "@2x", "-thumb")
  - Quality input per item for JPG/WebP (0.1~1.0)
  - Quick "iOS set" button (adds @1x/@2x/@3x PNG presets)
  - Quick "Web set" button (PNG 1x + WebP/JPG 2x quality presets)
  - Batch export all variants at once
  - Multi-select Slice nodes: one-click batch export for all selected slices
- [x] **WASM**: add_slice(name, x, y, w, h), get_slices() → JSON, export_region_svg(x, y, w, h)
- [x] **Layers panel**: Slice icon in node tree
- [x] **Layers panel**: Drag reorder — drag layer rows to reorder nodes within same parent or reparent into Frame/Group/Section containers. Visual blue (#0d99ff) insertion indicator. Multi-select drag support. Undo integrated. Circular reparent prevention.
- [x] **Export formats**:
  - PNG: Canvas crop at specified scale → PNG download
  - JPG: Canvas crop with white background → JPEG download (default quality 0.92, per-item override)
  - WebP: Canvas crop → WebP download (default quality 0.92, per-item override)
  - SVG: Engine-side region export via export_region_svg → SVG download
- [x] **Multi-resolution export**: exportSliceBatch() downloads multiple scale/format variants with staggered timing
- [x] **Render/SVG skip**: Slice nodes excluded from normal rendering and SVG export
- [x] **Per-slice settings persistence**: Export items saved to localStorage per slice ID

### Flow Connectors (Arrow Lines)
- [x] **NodeKind::Connector**: Arrow/line connecting two nodes or free points
- [x] **Fields**: start_node_id, end_node_id, start_x/y, end_x/y, path_type (straight/curved), start_arrow, end_arrow (ArrowStyle), arrow_size
- [x] **ArrowStyle enum**: None, Arrow, Diamond, Circle, Square, OpenArrow — per-endpoint arrow head style
- [x] **Arrow size**: Multiplier (0.1–5.0) for arrow head size scaling
- [x] **Canvas rendering**: Straight lines or cubic bezier curves, 6 arrowhead styles (filled triangle, open V, diamond, circle, square), edge clipping to node bounds
- [x] **SVG export**: `<line>`/`<path>` with per-style marker defs (arrow/open_arrow/diamond/circle/square)
- [x] **WASM**: add_connector, set_connector_path_type, set_connector_arrows (legacy bool), set_connector_start_arrow_style, set_connector_end_arrow_style, set_connector_arrow_size, set_connector_endpoints, set_connector_nodes, get_connector_info, update_connector_bounds, get_connectors_for_node
- [x] **Toolbar**: Connector button with L keyboard shortcut, crosshair cursor
- [x] **Drag to connect**: Click/drag from source to target node, hit-test on both ends
- [x] **Properties panel**: Path type dropdown (Straight/Curved), start/end arrow style dropdown (6 options), arrow size input
- [x] **Backward-compatible serde**: Legacy bool end_arrow/start_arrow auto-converts to ArrowStyle
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
- [x] **WASM bindings**: add_table, table_set_cell, table_get_cell, table_set_cell_fill, table_merge_cells, table_unmerge_cell, table_add_row/col, table_remove_row/col, table_set_col_width/row_height, table_import_csv, table_sort, table_get_info, set_table_size, relayout_table, `table_auto_layout(id, wrap_text, header_rows)`
- [x] **Canvas rendering**: Grid lines, cell fills, cell text with alignment + cell-width-aware word wrap
- [x] **SVG export**: Table → `<g>` with `<rect>`, `<line>`, `<text>` elements
- [x] **Toolbar**: Table button (B keyboard shortcut)
- [x] **Properties panel**: Rows/Cols display, +/- row/col buttons, CSV import, sort, Auto Layout (wrap/no-wrap) quick actions
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
- [x] 문서별 preset 세트 지원: scene hash 기반 doc key로 presets/active presets를 분리 저장
- [x] ExportPreset interface: id, name, format (png/svg), scale (0.5-4x), suffix, quality

### UI
- [x] **Properties panel**: "Export" section for selected nodes (dropdown + active preset list)
- [x] **Per-node active presets**: Add/remove presets per node, stored in localStorage
- [x] **Preset editor modal**: Create/edit presets with name, format, scale, suffix fields
- [x] **Presets manager modal**: View all presets, delete individual, reset to defaults
- [x] **Team sharing actions**: Presets manager에서 JSON Export/Import 지원
- [x] **Document sync action**: `Sync to This Document`로 글로벌 preset을 현재 문서 세트에 복제
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
- [x] **Asset slices package modes**: Flat ZIP 외에 iOS `.imageset` / Android `drawable-*` / Web `web/` 폴더 구조로 PNG slice 묶음 export 지원 (플랫폼 모드에서는 PNG 고정)
- [x] **Dev handoff slice packager (Frame/Section)**: Properties 패널 `Asset Packager`에서 선택 컨테이너 하위 Slice를 스캔해 플랫폼별 ZIP(Web/Android/iOS)로 일괄 다운로드. 각 Slice의 저장된 export preset(포맷/배율/quality/suffix)을 우선 사용하고, 없으면 플랫폼 기본 preset을 적용.

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
- [x] Remote node lock indicator (MVP): selected nodes by collaborators render 🔒 dashed lock overlays to prevent edit collisions

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
- [x] WASM: `get_contrast_ratio(fg, bg) -> f64` — standalone contrast ratio calculation between two hex colors
- [x] Properties panel: Alt Text input field for Image nodes (inline editing with undo support)

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

### Scroll-Driven Animations / Parallax
- [x] ScrollAnimation struct: property (Opacity/X/Y/Scale/Rotation/Blur), start_scroll, end_scroll, from_value, to_value, easing, sticky, sticky_offset, parallax_factor, enabled
- [x] ScrollAnimProperty enum, ScrollAnimEasing enum (Linear/EaseIn/EaseOut/EaseInOut)
- [x] Node field: scroll_animations: Vec<ScrollAnimation> — #[serde(default)], backward-compatible
- [x] WASM bindings: add/remove/update/toggle_scroll_animation, get_scroll_animations, get_all_scroll_animations
- [x] Prototype viewer: scroll offset → compute animation overrides → temporarily apply properties before render → restore after
- [x] Properties panel: "Scroll Animations" section — add/remove/edit animations per node, property/easing select, range inputs, parallax factor, sticky toggle
- [x] computeScrollAnimOverrides() utility for prototype viewer integration

### Scroll Snap Points
- [x] ScrollSnapType enum: None/MandatoryX/MandatoryY/MandatoryBoth/ProximityX/ProximityY/ProximityBoth
- [x] ScrollSnapAlign enum: None/Start/Center/End
- [x] Node fields: scroll_snap_type (container), scroll_snap_align (child) — serde(default)
- [x] WASM bindings: set/get_scroll_snap_type, set/get_scroll_snap_align
- [x] Properties panel: snap type dropdown on scroll containers, snap align dropdown on children of scroll containers
- [x] Prototype viewer: animated snap to nearest point after scroll (mandatory always, proximity within 100px)
- [x] Prototype viewer: Section-based fallback snap targets (child snap-align 미설정 시 Section 시작점을 page anchor로 사용)
- [x] Prototype viewer: explicit target이 없으면 viewport-height 기준 page snap points 자동 생성
- [x] Prototype overlay: snap pagination dots (현재 snap index 시각화)
- [x] Inspect panel: CSS scroll-snap-type / scroll-snap-align output

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
- [x] **Dev Handoff Redline Spec Mode (2026-04-10)**: 다중 선택(2+) 시 Handoff 탭이 anchor 기준 redline 시트로 전환되어 target별 offset(x/y), edge gap(h/v), 4px-grid spacing token 제안을 고정 표로 표시한다. `Copy Redline Sheet`로 텍스트 스펙을 바로 전달할 수 있다.
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
- [x] Smart Select spacing quick actions (selection mode): Enter=exact px input, E=equal spacing, A=convert to auto-layout frame
- [x] Double-click spacing handle opens direct numeric spacing input prompt
- [x] Auto-layout conversion suggestion flow wraps selection in frame, sets flex direction by axis, seeds gap from average spacing
- [x] Hovered selection handle shows inline shortcut hint (`Enter / E / A`)
- [x] 2026-04-06 backlog verification: feature is production-wired (tool + editor integration)
- [x] 2026-04-10 v2: padding handles now remain draggable even when padding value is 0 (minimum edge hit-strip), so users can add padding directly from canvas without first typing values in Properties
- [x] 2026-04-10 v3: auto-layout gap/padding badges are now always visible (idle state included), improving inline edit discoverability without hover hunting
- [x] 2026-04-11 v4: padding handles inline edit polish — Enter opens exact-value input prompt, Arrow keys nudge hovered side by ±1px (Shift=±10), with on-canvas shortcut hint
- [x] 2026-04-11 v5: double-click padding handle now opens direct numeric prompt; Alt-drag mirrors opposite side for quick symmetric padding edits

### Auto Layout Spacing Presets
- [x] Spacing presets panel: XS(4) / S(8) / M(12) / Base(16) / L(24) / XL(32) / 2XL(48)
- [x] Combined presets: one-click apply gap + uniform padding
- [x] Gap-only presets row: -8/-4/0/4/8/12/16/24/32/48px (negative = overlap)

### Negative Gap (Overlap Spacing)
- [x] Auto layout gap supports negative values for overlapping children (card stacks, avatar piles)
- [x] Spacing drag handle: no min-0 clamp, allows dragging into negative territory
- [x] Negative gap visual: red-orange (#ff5032) overlay instead of pink, distinct pill badge color
- [x] Quick chips: -8px, -4px presets with warm color hint
- [x] Engine: f64 gap naturally supports negative (no Rust changes needed)
- [x] CSS inspect: outputs `gap: -Xpx` (informational, CSS gap doesn't support negative)
- [x] Padding-only presets row: 0/4/8/12/16/24/32/48px
- [x] Active state highlighting (indigo) for current values
- [x] Hover feedback, undo integration
- [x] Padding shorthand input (CSS-style 1~4 tokens: `8`, `8 12`, `8 12 16`, `8 12 16 20`) with Enter/Apply commit
- [x] Located in Properties panel Auto Layout section (below padding inputs)

### Text on Path (SVG textPath style)
- [x] Node.text_path_id: Optional<NodeId> — links a Text node to a Path node
- [x] Node.text_path_offset: f64 (0.0–1.0) — start offset along the path
- [x] Node.text_path_baseline_offset: f64 — baseline shift (px)
- [x] Node.text_path_flip: bool — reverse reading direction/orientation
- [x] Node.text_path_align: TextPathAlign(Start/Center/End) — path 위 텍스트 정렬 기준
- [x] path_utils.rs: path_length, point_at_length, text_positions_on_path, path_to_svg_d
- [x] Canvas rendering: per-character positioning along bezier path with tangent rotation + baseline normal offset + flip + align(start/center/end)
- [x] Text letter-spacing is applied in text-on-path glyph advance
- [x] SVG export: <defs><path/></defs> + <text><textPath href startOffset letter-spacing dy side>
- [x] WASM: set_text_path, clear_text_path, set_text_path_offset, set_text_path_baseline_offset, set_text_path_flip, set_text_path_align, get_text_path_info, get_text_on_path_positions, get_path_svg_d
- [x] Properties panel: Text Path section — attach/detach, offset slider, baseline input, path letter-spacing input, align(start/center/end), reverse toggle, path name display
- [x] 2026-04-06 UX polish: Attach to Path 버튼이 선택된 Path가 없을 때 씬 내 Path 후보 목록(빠른 번호/ID 입력) 제공
- [x] Backward-compatible serde defaults
- [x] 2026-04-06 polish: get_text_on_path_positions now includes baseline-offset-adjusted coordinates for downstream UI overlays/tools
- [x] 2026-04-06 UX polish: canvas context menu adds "Attach Text to Path" (when Text+Path are selected) and "Detach Text from Path" quick action
- [x] 2026-04-06 UX polish: Text tool click creates point-text (no drag required), and when clicked on a Path the new Text auto-attaches to that Path

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

## Spring Animation (Easing)
- [x] Rust: Easing::Spring { tension, friction, mass } — damped harmonic oscillator physics
- [x] SpringPreset: gentle (120/14/1), default (170/26/1), wobbly (180/12/1), stiff (210/20/1), slow (280/60/1), bouncy (600/15/1), molasses (280/120/1)
- [x] spring_eval(): underdamped (oscillation), critically-damped, overdamped modes
- [x] parse_easing("spring:preset" or "spring:t,f,m") WASM support
- [x] WASM: anim_set_keyframe_easing(clip_id, node_id, property, time_ms, easing_str), anim_get_spring_presets()
- [x] Scene: anim_set_keyframe_easing() method
- [x] Timeline UI: right-click keyframe → easing selector (Linear/EaseIn/EaseOut/EaseInOut + spring presets)
- [x] Custom spring dialog: tension/friction/mass sliders with real-time spring curve preview (canvas)
- [x] Purple diamond indicators for spring-eased keyframes in timeline
- [x] Lottie export: Spring easing approximated as ease-in-out (no native Lottie spring support)
- [x] Backward-compatible serde

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
- [x] **Usage heatmap overlay**: Optional canvas overlay from analytics panel to visualize instance density (blue→red intensity)
- [x] **Unused candidate emphasis**: Summary card + list styling highlights zero-instance components for cleanup
- [x] **Component Dependency Impact Analyzer**: Per-component impact preview with risk score/level, affected pages/variants, and override/deep-nesting risk signals
- [x] **WASM binding**: `component_dependency_impact(component_id)` → JSON
- [x] **UI action**: Analytics modal `Impact Analyzer` button on each component row
- [x] **Quick access from instance**: Properties panel Main Component card has `Impact` action that opens analytics pre-focused on the current component
- [x] **Auto-focus behavior**: Opening analytics with `initialComponentId` highlights target component and auto-expands impact preview
- [x] **Impact drilldown**: Top risky instances listed with click-to-navigate
- [x] **Change scope preview**: Impact panel now surfaces affected page/variant range chips + override-conflict/deep-nesting counters and expandable full instance list

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
- [x] **Component instance multi-edit**: Toggle multi-edit mode on an instance to edit ALL instances of the same component simultaneously
- [x] **Engine methods**: find_all_instances_of_component, get_sibling_instances, multi_edit_set_property, multi_edit_set_variant, multi_edit_move, multi_edit_resize, multi_edit_select_all, get_multi_edit_info
- [x] **Scene methods**: multi_edit_set_fill, multi_edit_set_opacity, multi_edit_set_corner_radius, multi_edit_set_size, multi_edit_set_stroke, multi_edit_set_visible, multi_edit_set_variant_by_comp
- [x] **Properties panel UI**: Multi-edit toggle button with instance count badge, active state banner, "Select All" instances button
- [x] **Variant propagation**: Variant picker changes propagate to all instances when multi-edit is active
- [x] **Property propagation**: Opacity, corner radius changes propagate to all instances when active

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
- [x] **Alt-based measurement overlay**: In Dev mode, red distance/size measurement lines are shown with Alt+hover (or via Handoff spacing overlay toggle) to reduce always-on visual noise
- [x] **CSS tooltip**: After 400ms hover delay, shows CSS snippet tooltip with syntax highlighting
- [x] **Quick export**: PNG/SVG export buttons in tooltip (one-click download at 2x)
- [x] **Copy CSS**: Click code or "Copy CSS" button → clipboard copy with toast notification
- [x] **Node info**: Tooltip header shows node name + kind
- [x] **Integration**: `editor.setDevMode(true/false)` from toolbar Edit/Dev mode toggle
- [x] **Implementation**: `ui/dev-mode-overlay.ts` — DevModeOverlay class
- [x] **Inline Dev Inspect badge**: selected node에 Spacing/Padding/Margin 값을 인라인 오버레이로 표시
- [x] **One-click snippet copy**: 인라인 배지의 `Copy` 버튼으로 CSS 스니펫 즉시 복사
- [x] **Spec Pins in Dev tooltip**: 노드 `Resources` 링크를 Dev Mode hover 툴팁에서 `📌` 핀 칩으로 노출하고 클릭 시 외부 문서(GitHub/Storybook/Jira/Figma) 즉시 오픈
- [x] **Spec context in inline badge**: 인라인 Dev Inspect 배지에 Spec Pin 개수 + Note 개수를 함께 표시
- [x] **Distance/Baseline overlay**: Dev Mode 단일 선택 시 nearest spacing 가이드와 Text baseline/line-height 오버레이를 캔버스에 표시하고, 인라인 배지에 Baseline Y/Line Height 지표를 함께 노출
- [x] **Alt multi-select spacing overlay**: hover target이 없을 때 선택 노드들 사이의 nearest horizontal/vertical gap을 자동 측정해 거리 라벨 표시(중복 라인 제거 + overlap fallback 포함)

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
  - Properties panel: "3D Transform" section with enable checkbox, rotation sliders, distance, origin controls, reset button, AR Preview button
  - AR Preview: Quick Look/model-viewer modal + mobile QR for .usdz/.glb/.gltf sources (ui/ar-quicklook.ts)
  - Shared deep-link: `?ar_src=<asset-url>&ar_title=<node-name>` 자동 감지 → AR Preview 즉시 오픈 후 query 정리 (모바일 QR 진입 UX 개선)
  - AR modal actions: Source URL + Mobile Preview Link 분리 제공, "Copy Mobile Link"/"Open Mobile Preview" 버튼 추가
  - SVG export: CSS transform with perspective() rotateX/Y/Z() + transform-origin
  - Inspect panel: CSS code generation for perspective transforms
- [x] **Corner Pin / Perspective Distort (Image/Frame)**: 4점 코너 핀 왜곡 (normalized TL/TR/BR/BL)
  - Rust engine: `CornerPin` struct + Node `corner_pin` 필드 (serde default, backward compatible)
  - WASM bindings: `set_corner_pin`, `get_corner_pin`, `clear_corner_pin`
  - Canvas rendering: Image/Frame 노드를 2-triangle affine warp로 렌더 (flat draw 제거 후 재투영)
  - Frame corner pin은 프레임 영역을 캔버스 스냅샷으로 캡처해 자식 콘텐츠까지 함께 왜곡
  - Properties panel: Image + Frame 섹션에 Corner Pin 8개 수치 입력 + Reset

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
- [x] **Text Style Lint Autofix**: detect text style drift (font family/size/line-height) + unlinked text nodes, suggest closest shared text style
- [x] **Typography auto-fix action**: one-click `apply_text_style_lint_autofix()` to relink/resync text nodes to style library
- [x] **Text Styles Inspector (Global linked drift view, 2026-04-10)**: Design Health > Styles 탭에서 모든 shared text style의 Local vs Linked drift를 통합 집계해 노드/스타일/차이 필드를 한 번에 확인 가능. `Clean all linked overrides`로 drifted linked nodes를 스타일 기준으로 일괄 정리.
- [x] **Issues list**: severity-tagged (error/warning/info), categorized, with suggestions
- [x] **Cleanup actions**: `remove_unused_color_styles()`, `remove_unused_text_styles()` WASM bindings
- [x] **WASM bindings**: `get_design_health()`, `get_text_style_lint_issues()`, `apply_text_style_lint_autofix()`
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

- [x] **Canvas Annotation Stamps (Sticker Pack)**: 12-kind review stamps (Approved/Rejected/Question/Fixme/Love/Warning/Info/Todo/WIP/NeedsRevision/Final/OnHold), emoji overlay, node attachment, per-node filtering, properties panel management
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
- Pre-edit dependency impact preview in playground header/right panel (risk score/level, affected pages/variants, override/deep-nesting counters)

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
- [x] Interactive Components v2: Properties panel `INTERACTIVE VARIANTS`에 `Auto-map` 버튼 추가 (variant property 옵션에서 hover/press/focus/disabled 상태값 자동 매핑)
- [x] Interactive Components v2: `Sync triggers` 버튼으로 현재 interactive state 매핑을 OnHover/OnPress 기반 `SwapVariant` 프로토타입 트리거와 연결

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
- [x] Configurable canvas background pattern: Grid, Dots, Lines, Cross, Checkerboard, None
- [x] Preset buttons: White, Dark (#1a1a2e), Transparent (checkerboard)
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
- [x] Deep component nesting warning (max depth analysis on ComponentInstance edges, threshold 5)
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
- [x] Inspect panel: Spec Notes section — node note titles/content/tags 요약을 함께 노출
- [x] Dev Mode tooltip: resource links를 Spec Pin 칩(`📌`)으로 표시하고 빠른 오픈 지원
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
- [x] Panels (Layers, Properties, Agent, Handoff, Comments, Variables, Assets, Bookmarks) can be popped out to separate browser windows
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

### Timeline Scrubbing + Onion Skin
- [x] Timeline header/ruler drag → playhead moves, canvas updates in real-time
- [x] mousedown → pointermove → pointerup scrubbing with pointer capture
- [x] Rust engine anim_apply() called at each scrub position
- [x] Onion skin mode: toggle button (🧅) in timeline toolbar
- [x] Ghost frames rendered before/after current time (configurable count)
- [x] Before frames: blue tint, After frames: orange tint, opacity fades with distance
- [x] Settings: editor.onionSkin.{enabled, beforeCount, afterCount, opacity}
- [x] Scene snapshot/restore ensures non-destructive ghost rendering
- [x] Implementation: packages/app/src/ui/animation-timeline.ts, packages/app/src/editor.ts

### Focus Mode (Distraction-Free Canvas)
- [x] Cmd/Ctrl+. toggles focus mode
- [x] Hides: layers panel, right pane, toolbar, page tabs, zoom controls, rulers, minimap, file menu
- [x] Minimal exit button (top center, appears on mouse hover near top edge)
- [x] Auto-flash on enter, fade after 2s
- [x] Registered in shortcut manager (view.focusMode)
- [x] Implementation: packages/app/src/ui/focus-mode.ts

### Wrap in Frame
- [x] Wrap selected nodes in a new Frame (Figma Cmd+Alt+G)
- [x] Auto-calculates bounding box, adjusts children positions to local coords
- [x] Preserves z-order (inserts frame at earliest selected node's position)
- [x] Undo integration, selection updates to new frame
- [x] Context menu entry + keyboard shortcut (Cmd/Ctrl+Alt+G)
- [x] Rust: Scene.wrap_in_frame(), WASM: wrap_selection_in_frame()

## Path Morphing (Smart Animate)
- [x] Rust path_morph.rs: cubic bezier subdivision, point-count alignment, per-point lerp
- [x] Nearest-point start alignment for closed paths (minimize twisting)
- [x] Scene + WASM: can_morph_paths(), morph_paths(from, to, t)
- [x] Prototype viewer: real-time morphed path rendering during smart-animate transitions
- [x] Automatic fallback to cross-fade when nodes aren't both Paths
- [x] AnimProperty::PathMorph for keyframe-based path morph in animation timeline
- [x] NodeSnapshot includes path_points/path_closed for smart animate path detection

## Selection Colors (Figma-style)
- [x] Rust: get_selection_colors(ids_json) — collects all unique solid colors from fills/strokes
- [x] Rust: replace_color_in_nodes(ids_json, old_hex, r, g, b, a) — batch color replacement
- [x] WASM: both methods exposed via wasm-bindgen
- [x] Properties panel: "Selection Colors" section for multi-select (2+ nodes)
- [x] Color swatches with hex label, count badge (F/S/F+S), inline color picker
- [x] Real-time color replacement across all selected nodes

### Node Grouping by Color
- [x] Rust: Scene.group_by_color(ids) — groups nodes by primary fill color into Group nodes
- [x] WASM: group_selection_by_color() — pushes undo, creates groups, selects them, returns JSON
- [x] Context menu: "Group by Color" (2+ nodes selected)
- [x] Singletons (unique color) stay ungrouped
- [x] Groups named "Color Group #rrggbb"

## Chart Visualization Node
- [x] NodeKind::Chart { chart_type, data, config }
- [x] ChartType: Bar, Line, Pie, Donut, Area
- [x] ChartDataPoint: label, value, color (optional)
- [x] ChartConfig: title, show_legend, show_labels, color_palette
- [x] Canvas rendering: bar charts, line/area charts, pie/donut charts
- [x] SVG export support
- [x] WASM: add_chart, set_chart_type, set_chart_data, get_chart_info, set_chart_config
- [x] Properties panel: type selector, title input, legend/labels toggles, data table editor
- [x] Toolbar Chart button
- [x] Default color palette auto-assignment
- [x] Responsive resize (adapts to node width/height)

### Chart Visualization Node
- [x] **NodeKind::Chart**: Bar, Line, Pie, Donut, Area chart types
- [x] **ChartDataPoint**: label, value, optional color per data point
- [x] **ChartConfig**: chart_type, title, show_legend, show_labels, color_palette
- [x] **Canvas rendering**: All 5 chart types with proper scaling, labels, legend
- [x] **SVG export**: Full chart export as SVG paths/shapes
- [x] **WASM bindings**: add_chart, set_chart_type, set_chart_data (JSON), get_chart_info, set_chart_config
- [x] **Properties panel**: Chart section with type selector, title input, legend/labels toggles, data editing table
- [x] **Toolbar**: Chart button for creating chart nodes
- [x] **Default color palette**: Auto-assigned from 10-color palette when data point has no color
- [x] **Backward-compatible serde**: All new fields have #[serde(default)]

## Repeat Grid (N×M Grid Repeat)
- [x] **NodeKind::RepeatGrid**: columns, rows, column_gap, row_gap, overrides
- [x] **Master cell rendering**: children[0] is repeated at each (row, col) with translate offset
- [x] **WASM bindings**: create_repeat_grid, set_repeat_grid_params, get_repeat_grid_params, sync_repeat_grid, set/get_repeat_grid_override(s)
- [x] **Properties panel**: Repeat Grid section with Columns/Rows/Col Gap/Row Gap inputs
- [x] **Context menu**: "Create Repeat Grid" (single node selection)
- [x] **SVG export**: Each cell exported as `<g transform="translate(...)">` group
- [x] **Backward-compatible serde**: All new fields have #[serde(default)]

### Conditional Logic in Prototypes
- [x] **PrototypeVariable struct**: name, var_type (number/boolean/string), default_value — stored at Scene level
- [x] **Scene CRUD**: add/remove/update_prototype_variable, get_prototype_variables_json
- [x] **InteractionCondition v2**: leaf(`variable` + `operator` + `value`) and group(`logic`: AND/OR + `conditions[]`)를 모두 지원하는 조건 트리 구조
- [x] **Prototype condition runtime**: Numeric/boolean/string 비교를 leaf에서 평가하고, group 노드는 AND/OR 재귀 평가
- [x] **SetVariable action**: InteractionAction::SetVariable with set_variable_name + set_variable_expression
- [x] **WASM bindings**: add/remove/update_prototype_variable, get_prototype_variables, set_interaction_condition, set_interaction_set_variable
- [x] **Prototype Viewer**: Runtime variable state (Map), condition evaluation, SetVariable execution (+N/-N/toggle/literal), debug panel showing current variable values
- [x] **Prototype Device Frame + Safe Area Preview**: Device preset selector with bezel/notch overlays, safe-area inset tint+guide, and scroll position-aware scrollbar indicators (vertical/horizontal) in preview with top-bar `Bars` toggle
- [x] **Prototype Device Chrome Details**: Added status-bar tint + home-indicator rendering (portrait/landscape aware) and expanded presets (`iPhone SE`) for more realistic safe-area/device-chrome validation in preview
- [x] **Prototype theme mode switch**: Top bar `Theme` selector mirrors variable mode names (Light/Dark/custom) and switches collection active modes live during preview.
- [x] **Prototype ↔ Canvas mode sync (2026-04-11)**: 공통 `opensketch:theme-mode-changed` 이벤트를 통해 캔버스 상단 quick switcher/Variables panel/Prototype top-bar selector가 같은 mode 상태를 유지한다.
- [x] **Prototype Variables Inspector (2026-04-08)**: Prototype Viewer 좌하단 debug panel을 확장해 현재 프레임 subtree 기준 활성 variable binding을 실시간 표시 (Collection/Variable, active mode, resolved value, usage count). Pan/zoom/navigate 및 mode 변경 시 자동 동기화.
- [x] **Prototype Variables Inspector Overlay v2 (2026-04-10)**: Top bar `Vars Overlay: ON/OFF` 토글 추가, 변수별 binding source preview(`LayerName (#id) · property`) 노출. 값 변경/프레임 이동 시 source 추적 정보를 함께 갱신해 “현재 값이 어디서 왔는지”를 즉시 디버깅 가능.
- [x] **Prototype Variables Panel — Runtime Inspector v3 (2026-04-10)**: Prototype Viewer 변수 패널에 타입 표시(number/boolean/string), 인라인 수동 override(입력/토글), 변수별 Reset(default 복원), 최근 변경 이력(시간/이전→다음/source) 추가. SetVariable 실행과 수동 override를 동일 런타임 상태/히스토리로 추적해 디버깅 품질 개선.
- [x] **Prototype Session Share Link (2026-04-09)**: Top bar `Share Link`로 현재 세션 상태( flow/start frame/page/runtime variable state )를 URL query(`proto`)에 base64url 직렬화해 공유. 링크로 열면 viewer가 page/frame/변수 상태를 복원해 동일 프리뷰 세션 재현.
- [x] **Prototype Conditional Visibility Rules (2026-04-10)**: 노드별 prototype 전용 visibility rule(JSON logic tree: AND/OR + leaf 조건) 저장/편집 지원. Properties panel에 `Prototype Visibility Rules` 빌더를 추가했고, Prototype viewer 렌더 직전에 runtime prototype variable 값으로 rule을 평가해 visible override를 적용한 뒤 즉시 복원한다(디자인 캔버스 상태는 비침투).
- [x] **Properties panel — Variables section**: Scene-level variable CRUD UI (name, type select, default value, add/delete)
- [x] **Properties panel — Interaction condition UI v2**: 재귀 트리 빌더(leaf rule + AND/OR nested group), 루트/하위 condition·group 추가/삭제, prototype variable datalist + 비교 연산자 선택, live branch preview, clear/reset actions
- [x] **Properties panel — SetVariable action UI**: Variable name + expression inputs shown when action is SetVariable
- [x] **Backward-compatible serde**: All new Interaction fields use #[serde(default)]

### Offline PWA + Service Worker
- [x] **vite-plugin-pwa**: generateSW mode, precache all JS/CSS/HTML/WASM assets
- [x] **Web App Manifest**: name "OpenSketch", icons 192/512, theme_color #1a1a2e, display standalone
- [x] **Runtime caching**: Google Fonts (CacheFirst), images (StaleWhileRevalidate)
- [x] **Offline/online toast**: Network status change notifications
- [x] **Install prompt**: beforeinstallprompt banner UI with Install/Dismiss buttons
- [x] **Auto-update**: registerType "autoUpdate" for seamless SW updates
- [x] **Coexists with localStorage auto-save**: Existing auto-save untouched

### AI Image Generation
- [x] **Text-to-Image**: Generate images from text prompts using OpenAI DALL-E API (or compatible endpoints)
- [x] **AI Image Panel**: Modal UI with prompt input, size selector (1024x1024, 1792x1024, 1024x1792, 512x512, 256x256), quick prompt chips
- [x] **Settings**: Configurable API endpoint, API key, model (persisted in localStorage)
- [x] **Canvas Integration**: Generated images auto-placed as Image nodes at viewport center, named "AI: <prompt>"
- [x] **LLM Agent Tool**: `generate_image` tool for AI assistant to create images via tool calling
- [x] **Context Menu**: "AI Image Generation…" entry in right-click menu
- [x] **Keyboard Shortcut**: Ctrl/Cmd+Shift+Alt+G to open panel
- [x] **Quick Prompts**: Pre-built prompt chips (landscape, gradient, avatar, mockup, icon, pattern)
- [x] **Ctrl+Enter**: Submit prompt via keyboard shortcut within panel

- [x] **Live HTML/CSS Preview panel**: Right pane "Preview" tab, selected node → HTML+CSS real-time iframe render, auto-refresh, scale selector (25%-200%), light/dark bg toggle, code view, copy HTML

- [x] **React/Vue Component Export**: Right pane "Export" tab, converts selected node tree to React JSX (inline styles / styled-components / CSS modules) or Vue SFC, props mapping (Text→children, Image→src), PascalCase component names, copy to clipboard, download files

- [x] **Eyedropper / Color Picker tool**: Press I to activate, click canvas to pick pixel color, applies to selected node fill, color toast with hex + copy button, auto-returns to select tool
- [x] **Scale Tool (K)**: Dedicated proportional scaling tool — handle drag always maintains aspect ratio and scales all visual properties (font size, stroke width, corner radius, shadows, blur, layout padding/gap, min/max constraints). Uses engine `scale_node_proportional()` with recursive children scaling. Slice tool moved to Shift+K.
- [x] **Node Locking Layers (enhanced)**: Visual distinction for locked nodes — orange selection border (no resize handles), subtle orange overlay, lock badge at top-left corner. Layers panel: dedicated lock/unlock icon per layer (hover-reveal, always-visible when locked). Properties panel: lock toggle button next to node name. Locked nodes are selectable but cannot be moved or resized. Hit test already skips locked nodes for accidental selection prevention.
- [x] **Node Effect Presets Library (MVP)**: Effects panel can save/apply/import/export reusable effect combos (blur, backdrop blur, blend mode, bitmap filters, drop/inner shadows) via localStorage-backed JSON preset library
- [x] **Video Embed Node polish (2026-04-05)**: Canvas thumbnail rendering now uses `poster` first and automatically falls back to `src` when poster is empty, so Video nodes preview reliably before Prototype playback.

### Ink Recognition (Handwriting / Freehand Drawing)
- [x] **Rust ink.rs module**: InkPoint struct with pressure/timestamp, Ramer-Douglas-Peucker path simplification, Chaikin's corner cutting smoothing, shape recognition (circle/rect/triangle/line/arrow/freehand)
- [x] **WASM bindings**: `ink_recognize(points_json)` → shape recognition JSON, `ink_to_path(points_json, tolerance)` → smoothed Path node, `ink_to_shape(points_json)` → auto-detected shape node (Rect/Ellipse/Path)
- [x] **Freehand tool enhanced**: Pressure-sensitive input capture, ink recognition on pointer up — confidence > 0.7 converts to geometric shape, otherwise smoothed bezier path
- [x] **Pen Pressure Width Profile + Taper (2026-04-08)**: Pen/Freehand pressure mapping unified (`linear/soft/hard` 곡선 기반 내부 계산), 생성된 Path 포인트별 stroke width에 start/end taper를 적용해 stylus 스트로크의 초/말 굵기 자연스러움 개선
- [x] **Shape detection**: Circularity metric for circles, area ratio for rectangles, corner detection for triangles, endpoint distance for line detection
- [x] **Ink → Path conversion**: Simplify → Smooth → Catmull-Rom to bezier handle conversion pipeline
- [x] **Freehand mode controls (2026-04-05)**: Properties panel now exposes Ink Recognition settings while Freehand tool is active — shape recognition toggle + simplify tolerance slider (0.2~8.0) used by `ink_to_path`
- [x] **Freehand stroke smoothing controls (2026-04-05)**: `Stroke smoothing` toggle + `Smoothing strength` slider (0.0~0.8). On pointer-up, generated Path results are post-processed with Catmull-Rom-based smoothing (shape-recognized outputs remain unchanged)

### Experimental WebGPU Renderer (MVP)
- [x] **WebGPU renderer module**: `ui/webgpu-renderer.ts` added with adapter/device setup + fallback-safe init
- [x] **Instanced quad pipeline**: node bounds drawn as GPU instances (position/size/color per instance)
- [x] **Viewport uniform**: zoom/pan/viewport uniforms applied in WGSL vertex stage
- [x] **Dynamic buffer growth**: instance buffer auto-resizes for large scenes
- [x] **Editor backend switch**: `canvas2d | webgpu` runtime mode in `Editor`
- [x] **Persisted preference**: `localStorage['opensketch-renderer-backend']`
- [x] **Graceful fallback**: auto-revert to Canvas2D when WebGPU is unavailable
- [x] **Hierarchy-aware instance collection**: recursively traverses scene graph (root + children) and composes parent offsets/opacity before GPU instance upload
- [x] **Robust solid-fill parsing**: supports multiple fill JSON shapes (`type.Solid.color`, direct `color`) with opacity composition
- [x] **Quick backend toggle in Zoom controls**: one-click Canvas2D/WebGPU switch, disabled state when WebGPU unsupported
- [x] **Viewport culling on WebGPU path**: off-screen node instances are skipped before GPU upload (camera-aware culling in instance collector)
- [x] **Render-path caching**: scene JSON + view-key cache reduces repeated parse/walk cost on unchanged frames
- [x] **Persistent uniform bind group**: bind group is created once at init and reused every frame to lower per-frame allocations
- [x] **Image/Video texture atlas (Stage 2)**: GPU atlas texture (2048x2048, tiled) with async image/poster loading for Image/Video nodes
- [x] **Textured instancing path**: per-instance UV rect + textureMix flag to blend solid-color quads and sampled atlas textures in one pipeline
- [x] **Atlas upload invalidation**: atlas canvas is uploaded to GPU only when dirty to avoid redundant per-frame texture transfers
- [x] **Low-GC instance/uniform uploads (Stage 3)**: reusable typed-array pools + upload key cache skip per-frame Float32Array allocation and redundant GPU `writeBuffer` calls when scene/view are unchanged
- [x] **Auto backend promotion for large scenes (Stage 4)**: when auto mode is enabled and scene node count reaches 1000+, editor auto-switches Canvas2D → WebGPU and shows one-shot performance toast
- [x] **Renderer toggle advanced control**: renderer button right-click toggles auto-render mode (persisted `localStorage['opensketch-auto-renderer']`)
- [x] **WebGPU shadow pre-pass (Stage 5, approximation)**: visible outer shadows are emitted as additional GPU instances (offset + spread/blur-derived pad) before main shape draw for large-scene effect parity
- [x] **Robust color decode for WebGPU path**: parser now accepts CSS rgb/rgba + hex + serialized `{r,g,b,a}` objects used by Rust scene JSON, improving fill/shadow color fidelity
- [x] **Soft shadow edge pass (Stage 6)**: per-instance blur radius (`blurPx`) drives feathered alpha mask in WGSL fragment stage, reducing hard-edge artifacts for WebGPU shadow quads

### Minimap UX Enhancements (2026-04-04)
- [x] **Minimap status info bar**: shows `Active Page · Zoom% · Pan(x/y)` directly under header
- [x] **Page-aware minimap feedback**: active page name syncs immediately when switching minimap page tabs
- [x] **Collapsed-state consistency**: info bar visibility follows minimap collapse/expand with canvas + tabs

### Design System Documentation Site Export (MVP, 2026-04-04)
- [x] Styles Library section (empty selection state) has **Docs HTML** action
- [x] Generates static HTML docs from shared styles + W3C design tokens
- [x] Includes color style swatches, text style live previews, and token JSON block
- [x] Downloads single-file artifact: `design-system-docs.html` (offline-share friendly)

### Spreadsheet Data Binding (MVP+, 2026-04-05)
- [x] Toolbar button opens **Spreadsheet Data Binding** panel
- [x] Paste CSV (header+rows) or JSON array data source
- [x] Apply selected record index to selected **Text/Image** nodes that use `{{field}}` templates
- [x] Live preview option: row/source 변경 시 선택 노드 즉시 반영
- [x] Apply whole dataset to selected **Repeat Grid** nodes (cell-by-cell)
- [x] Repeat Grid auto-expands rows to fit incoming data
- [x] Repeat Grid per-cell overrides render both `text_content` and `image_src`
- [x] Local data source persistence (`localStorage`)

### Prototype Fixed Header/Footer (MVP, 2026-04-06)
- [x] Node 모델에 `prototype_fixed: bool` 필드 추가 (serde default, backward-compatible)
- [x] WASM API: `set_prototype_fixed(id, fixed)`, `get_prototype_fixed(id)`
- [x] Properties panel: 부모가 scroll frame인 자식 노드에서 `Fixed in prototype` 토글 제공
- [x] Prototype viewer: 현재 프레임 scroll offset을 기준으로 fixed 노드 x/y를 렌더 직전 반대 방향 보정해 고정 레이어처럼 표시
- [x] 렌더 후 원본 x/y 백업 복원으로 편집 상태 오염 방지

### Prototype Fixed Header/Footer Regions (2026-04-07)
- [x] Node 모델 확장: `prototype_fixed_region: "auto" | "top" | "bottom"` (serde default=`auto`, backward-compatible)
- [x] WASM API: `set_prototype_fixed_region(id, region)`, `get_prototype_fixed_region(id)`
- [x] Properties panel: `Fixed in prototype` 하위에 `Fixed region` 선택 UI 추가
  - `Auto (X+Y)`: 기존 동작 유지 (x/y 모두 scroll 반대 보정)
  - `Header/Footer (Y only)`: 가로 스크롤 영향 없이 세로 고정만 적용
- [x] Prototype viewer: fixed 보정 시 region별 축 보정 로직 적용

### Frame Overflow Behaviors 2.0 (2026-04-07)
- [x] Node 모델 확장: `prototype_scroll_bounce_x/y: bool` + `prototype_scroll_overscroll_x/y: f64` (default -1 = preset auto)
- [x] WASM API: `set/get_prototype_scroll_bounce_x/y`, `set/get_prototype_scroll_overscroll_x/y`
- [x] Properties panel (scroll frame): `Prototype overflow` 섹션 추가
  - Bounce X/Y 토글
  - Overscroll X/Y 숫자 입력 (`Auto` 비움 상태 지원)
- [x] Prototype viewer: wheel/touch/inertia 스크롤에서 frame별 overflow behavior 반영
  - bounce OFF 축은 strict clamp
  - bounce ON 축은 frame별 overscroll(px) 사용, Auto면 상단 Scroll Physics preset 값 사용

### Auto Layout Absolute Child + Wrap Controls (2026-04-06)
- [x] Auto-layout wrap child line break 지원: Node에 `wrap_before: bool` 필드 추가 (serde default, backward-compatible)
- [x] Flex wrap 계산에서 `wrap_before=true`인 자식은 부모 `wrap=Wrap`일 때 강제로 새 줄/새 컬럼 시작
- [x] WASM API: `set_wrap_before(id, bool)`, `get_wrap_before(id)`
- [x] Properties panel: auto-layout 자식 + 부모 wrap 활성 시 `Wrap: Start new line` 체크박스 노출
- [x] 기존 Absolute Position 토글과 함께 flow 제외/flow 개행을 분리 제어 (Figma 유사)

### Auto Layout Baseline Alignment (2026-04-08)
- [x] Align enum 확장: `Baseline` 추가 (`set_align_items(..., "baseline")` 지원)
- [x] Flex row에서 `align-items: baseline` cross-axis 배치 구현
  - 텍스트: 첫 줄 baseline 오프셋(half-leading + ascent) 기반
  - 비텍스트: 하단 edge를 baseline으로 간주
- [x] Properties panel Auto Layout에 `Cross: Baseline (Row)` 옵션 추가
- [x] Inspect/Handoff/Figma export의 align-items/counter-axis 매핑에 Baseline 반영

### Component Slots Inspector (2026-04-09)
- [x] Properties > Component source (`[C] ...`) header actions에 `Slots` / `Repair` 추가
- [x] `Slots` inspector: instance_swap property의 linked slot 유효성 점검 (slot node 수, 정상/누락 개수, 누락 항목별 추천 slot)
- [x] `Repair`: 누락된 linked_slot_id를 one-click 복구 (동명이면 우선 매핑, 없으면 첫 Slot fallback)
- [x] 구현: `packages/app/src/ui/properties-panel.ts` (`self_buildComponentSlotsReport` + component properties editor actions)

### Prototype Conditions Preset Library (2026-04-09)
- [x] Properties > Interaction > Condition builder에 `Condition Presets` 추가
- [x] 현재 조건 트리를 preset으로 저장/재사용 (`Save`/`Apply`/`Delete`)
- [x] Preset 공유용 JSON 복사 (`Share`, clipboard 실패 시 prompt fallback)
- [x] `Apply to Flow`로 현재(또는 첫 번째) prototype flow 범위의 interaction condition 일괄 적용
- [x] 로컬 저장소 키: `localStorage['opensketch-proto-condition-presets-v1']`

### Variant Matrix Editor Panel (2026-04-09)
- [x] Component Set instance의 Properties > Variants Matrix에 `Panel` 버튼 추가
- [x] Full-screen modal editor에서 axis 이름/값을 한 번에 수정 (`rename_component_set_axis`, `update_component_set_axis`)
- [x] Row/Column axis selector 추가: 3개 이상 axis를 가진 variant set에서도 2D 매트릭스 축을 즉시 전환 가능
- [x] 선택되지 않은 나머지 axis는 `Extra filters`로 고정값을 선택해 매트릭스 조회 기준을 제어
- [x] Axis 값 변경 시 기존 variant mapping을 인덱스 기반으로 자동 remap
- [x] Matrix cell 클릭/드래그 편집: `Auto / Switch / Map current / Map selected / Clear` 모드 지원
- [x] Component set 구성요소 목록을 target selector로 노출해 셀을 임의 컴포넌트로 직접 재매핑 가능
- [x] 드래그 페인팅 중 여러 셀에 동일 액션을 일괄 적용 (리오더 이후 재매핑 정리 워크플로우)
- [x] `Batch Rename`: 현재 row/column(+extra axis) 값을 조합해 mapped variant component 이름을 일괄 리네임
- [x] `Arrange Grid`: 현재 matrix 축 기준으로 component set 구성 variants를 캔버스 2D 그리드로 자동 재배치(gap 입력)
- [x] Row/Column header drag reorder: matrix 헤더 자체를 드래그해 axis value 순서를 즉시 재정렬
- [x] Cell drag remap: 매핑된 셀(`#component`)을 다른 셀로 드래그해 variant mapping을 이동 (Alt+Drop 시 복사)
- [x] `Fill Empty`: 현재 matrix 축 + extra filters 범위에서 비어 있는 셀만 target component로 일괄 매핑
- [x] `Coverage Heatmap`: 매트릭스 셀 상태를 Empty(적색)/Unique(녹색)/Duplicate(황색)로 시각화하고 coverage 요약(매핑 수/빈 셀/중복)을 상단에 표시
- [x] 구현: `packages/app/src/ui/component-set-matrix-editor.ts` + `properties-panel.ts` 연동

### Auto Layout Gap Suggestions (2026-04-10)
- [x] Properties panel Auto layout 섹션에 **Gap suggestions** 카드 추가
- [x] 선택된 Frame/Group/Instance/Slot의 자식 위치 패턴을 분석해 추천 spacing 산출
  - layout direction 기준(행/열)으로 child 간 gap 시퀀스 계산
  - frame 여백(좌/우/상/하) 평균 기반 padding 추천
  - 토큰 스케일(0/2/4/8/12/16/20/24/32/40/48/64)로 quantize
- [x] 원클릭 적용 액션 제공: `Gap N`, `Pad N`, `Apply both`
- [x] 적용 시 undo + render + properties refresh 연동

### Auto Layout Spacing Tokens (2026-04-10)
- [x] `Gap suggestions` 카드에 spacing token 추천/바인딩 UX 통합
- [x] Number 변수 중 추천 gap/padding 값(±4px)에 근접한 토큰 자동 탐지
- [x] `Bind suggested` 액션으로 `layout.gap` / `layout.padding` 변수 바인딩
- [x] `Create + bind` 액션으로 토큰 자동 준비
  - `Spacing Tokens` 컬렉션 자동 생성
  - mode 없으면 `Base` mode 자동 생성
  - `space.{n}` Number 변수 생성/재사용 + 값 세팅
  - 현재 선택 프레임 레이아웃 속성에 즉시 바인딩
- [x] 구현: `packages/app/src/ui/properties-panel.ts`

### Auto Layout Wrap Rows/Columns Inspector (2026-04-11)
- [x] Flex + Wrap 활성 컨테이너에 `Wrap rows/columns inspector` 카드 추가
- [x] 줄바꿈 결과를 line count + distribution(`R1/R2...` 또는 `C1/C2...`)으로 시각화
- [x] 각 line chip hover 시 포함된 레이어 이름 미리보기
- [x] Quick tuning 액션: `Gap -2`, `Gap +2`, `Align start`, `Align between`
- [x] 구현: `packages/app/src/ui/properties-panel.ts`

### Component Variant Naming Lint (2026-04-10)
- [x] Variant Matrix Editor 상단에 `Variant Naming Lint` 카드 추가
- [x] axis/value 네이밍 품질 점검:
  - 축 이름 중복(정규화 기준) 탐지
  - 축 이름 스타일 불일치(trim/공백/underscore/hyphen) 탐지
  - 값 약어/구분자 혼용 및 정규화 후 중복 탐지
- [x] 축별 `Normalize` 액션으로 제안 규칙(kebab-case + 약어 확장) 일괄 반영
- [x] 기존 variant mapping을 유지한 채 axis/value 리네임 적용
- [x] 구현: `packages/app/src/ui/component-set-matrix-editor.ts`

### Auto Layout Spacing Tokens (2026-04-10)
- [x] Gap suggestions 카드에 **Spacing tokens** 블록 추가
- [x] Variable collections의 Number 변수에서 추천 gap/padding 값과 근접 토큰(±4px) 자동 매칭
- [x] `Bind gap/pad` 액션으로 `layout.gap` / `layout.padding` 변수 바인딩 + 즉시 apply
- [x] `Create tokens` 액션으로 `space/gap-{n}`, `space/pad-{n}` Number 변수 자동 생성 및 active mode 값 설정
- [x] Variable binding 대상 프로퍼티 확장: `layout.gap`, `layout.padding`, `layout.padding_top/right/bottom/left`
- [x] Engine `apply_variables()`에 auto-layout spacing 속성 반영 로직 추가

### Variants Quick Swap HUD (2026-04-10)
- [x] 선택된 Instance에서 `Alt + Mouse Wheel`로 현재 variant axis 값을 순환 변경
- [x] `Alt + ,` / `Alt + .` 단축키로 동일 quick-swap 동작 지원
- [x] `Alt + Shift + Wheel`로 편집 대상 variant axis를 순환 선택 (값 변경 없이 HUD에 축 이름 표시)
- [x] 캔버스 상단 HUD에 `axis / current value / index`를 표시해 현재 변경 상태를 즉시 확인
- [x] 엔진 기존 API(`get_instance_component_info`, `set_instance_variant`) 재사용, undo 통합

### Stroke Width Tool (Shift+W, 2026-04-11)
- [x] 새 ToolType `strokeWidth` 추가: 단일 Path 선택 상태에서 앵커 포인트를 직접 드래그해 per-point stroke width 생성/편집
- [x] Shift+W 단축키 등록 (shortcut manager + editor key routing), cursor `ew-resize`
- [x] 캔버스 오버레이: 경로 포인트별 width 핸들 렌더링 (커스텀 width 유무/hover/drag 상태 시각화)
- [x] 드래그 중 `path_set_point_stroke_width`를 실시간 업데이트하고 포인터 업 시 undo/selection refresh 연동
- [x] 구현: `packages/app/src/editor.ts`, `packages/app/src/ui/shortcut-manager.ts`

### Interactive Components State Preview Strip (2026-04-11)
- [x] Properties panel `INTERACTIVE VARIANTS`에 **State Preview** 칩 스트립 추가 (`Default / Hover / Press / Focus / Disabled`)
- [x] 상태 칩 클릭 시 해당 interactive variant key를 즉시 instance에 적용해 우측 패널에서 바로 미리보기
- [x] `Hover/Press/Focus` 칩 적용 시 SwapVariant prototype trigger를 자동 동기화해 trigger 매핑 일관성 유지
- [x] `opensketch:interactive-preview-state` 이벤트를 발행해 Properties panel preview 상태를 Prototype viewer와 동기화
- [x] Prototype viewer에서 이벤트 수신 시 active preview 캔버스의 interactive state/variant를 즉시 반영
- [x] 매핑되지 않은 상태는 비활성 시각화(opacity + tooltip)로 설정 누락을 빠르게 식별
- [x] Trigger status가 `drift`인 상태만 선택 복구하는 `Fix drift (N)` 액션 추가 (수동 one-click selective sync)
- [x] 구현: `packages/app/src/ui/properties-panel.ts`, `packages/app/src/ui/prototype-viewer.ts`

### Dev Mode Redlines Pinned Annotations (2026-04-11)
- [x] Handoff 패널의 `Spacing Overlay` 카드에 `Pin current redline` / `Clear pins` 액션 추가
- [x] Alt+Hover(또는 Spacing Overlay)로 생성된 redline 컨텍스트를 페이지 단위 pin으로 저장
- [x] pin redline은 노드 id 기반으로 매 프레임 재계산되어 노드 이동/리사이즈 후에도 거리값 자동 갱신
- [x] pin 카운터 표시로 handoff 캡처 전에 유지 중인 redline 수를 즉시 확인
- [x] 구현: `packages/app/src/editor.ts`, `packages/app/src/ui/handoff-panel.ts`

### Dev Handoff State Capture Presets (2026-04-13)
- [x] Handoff 패널에 `State Capture Presets` 카드 추가 (hover / pressed / focus 토글)
- [x] 상태 조합을 preset으로 저장/호출/삭제 (문서+페이지 단위 localStorage)
- [x] 적용된 state 조합을 redline pin에 함께 저장하고 캔버스 라벨(`State H/P/F`)로 표시
- [x] PNG/SVG export 파일명에 상태 suffix(`-hover-pressed` 등) 반영
- [x] 구현: `packages/app/src/ui/handoff-panel.ts`, `packages/app/src/editor.ts`

### Variables Bulk Rename & Namespace Tools (2026-04-11)
- [x] Variables Bulk Edit(Table View) 툴바에 `Prefix Rename`, `Move Namespace` 액션 추가
- [x] prefix/namespace 기반 일괄 rename 시 충돌 이름 자동 감지 후 `-2`, `-3` suffix로 auto-fix
- [x] rename 대상이 없거나 실변경이 없는 경우 가드(alert) 제공
- [x] 일괄 rename 후 `apply_variables()` + canvas refresh 연동
- [x] 구현: `packages/app/src/ui/variables-bulk-edit.ts`

### Prototype Flow Minimap + Jump Navigator (2026-04-11)
- [x] Prototype Viewer 좌상단에 `Flow Minimap` 패널 추가 (frame 노드 + NavigateTo/OpenOverlay 링크)
- [x] 현재 frame 강조 + frame 노드 클릭 시 즉시 jump (`navigateTo(..., "Instant")`)
- [x] edge midpoint 클릭 시 target frame으로 점프해 링크 검증 속도 개선
- [x] 요약 메타 표시: `Frames N · Links N · Current #id`
- 구현: `packages/app/src/ui/prototype-viewer.ts`

### Prototype Flow Lint & Dead-end Detector (2026-04-12)
- [x] Prototype Viewer 좌측에 `Flow Lint` 패널 추가: 현재 선택 start frame(없으면 current frame) 기준으로 flow graph lint 수행
- [x] 진단 규칙
  - `Unreachable`: start frame에서 도달 불가한 frame
  - `Dead-end`: 도달 가능하지만 `NavigateTo/OpenOverlay/Back/CloseOverlay` 경로가 모두 없는 frame
  - `Cycle`: 도달 가능한 그래프에서 순환 루프 루트 탐지
  - `Cycle-trap`: SCC(강결합 루프) 내부에서 바깥 frame으로 빠져나가는 edge가 없는 loop trap 탐지
- [x] 이슈를 클릭 가능한 리스트로 표시하여 해당 frame으로 즉시 점프 (검증 루프 단축)
- [x] Start Point Manager/minimap 변화에 연동해 lint 결과 자동 재계산


### Prototype Flow Entry Branch Presets (2026-04-12)
- [x] Start Point Manager에 `Save preset` 버튼 추가: 현재 선택 flow/frame을 flow별 entry preset으로 저장
- [x] flow별 preset chip strip 제공: 클릭 한 번으로 start frame 적용(`set_flow_start_frame`) + 즉시 preview jump
- [x] flow당 최근 6개 preset 유지, 같은 frame 재저장 시 최신 위치로 갱신


### Smart Selection Scope Bar (2026-04-12)
- [x] Smart Select 패널에 Selection Scope Bar 추가 (`Document / Page / Frame / Component`)
- [x] `Same Shape/Text/Image/Locked/Hidden` 액션이 scope 기준으로 결과를 필터링
- [x] `Page`: 동일 page_id, `Frame`: 동일 parent, `Component`: 동일 instance component_id 기준
- [x] scope 전환 시 즉시 재평가(runSelection) + 선택 결과 라벨에 현재 scope 표시
- 구현: `packages/app/src/ui/smart-select.ts`

### Variable Alias Graph Inspector (2026-04-12)
- [x] Variables 패널에 `Variable Dependency Graph` 인스펙터 추가 (nodes/edges/broken/cycles 요약 메타)
- [x] String 변수의 `{alias}` 값을 alias edge로 파싱해 변수 간 의존 그래프를 생성
- [x] broken alias를 mode 단위로 표시하고 source variable로 one-click jump 지원
- [x] cycle 체인을 리스트업(`A → B → A`)해 참조 루프를 빠르게 진단
- [x] broken alias row의 `Clear` 액션으로 해당 mode 값을 즉시 비우고 `apply_variables()` 반영
- 구현: `packages/app/src/ui/variables-panel.ts`

### Interaction Timeline Scrubber (2026-04-12)
- [x] Prototype Viewer 우측에 `Interaction Timeline` 패널 추가 (scrub slider + 최근 이벤트 리스트)
- [x] Navigate/Back/Scroll 이벤트를 타임라인으로 누적해 순서/끊김을 시각 점검
- [x] 슬라이더 또는 이벤트 row 클릭 시 해당 시점의 target frame으로 즉시 jump
- [x] `Play` 액션으로 기록된 간격 기반 재생(transition duration fallback), `Clear`로 세션 타임라인 초기화
- 구현: `packages/app/src/ui/prototype-viewer.ts`

### Prototype Overlay Stack Inspector (2026-04-12)
- [x] Flow Lint에 overlay 체인 규칙 추가
  - `overlay-leak`: reachable frame에서 OpenOverlay는 있으나 CloseOverlay가 없는 경우
  - `orphan-close`: reachable frame에서 CloseOverlay만 있는 경우
- [x] lint summary에 overlay 이슈 카운트(`Overlay leak/orphan`)를 함께 표시
- [x] 기존 lint issue 리스트/점프 워크플로우와 동일하게 클릭 네비게이션 지원
- 구현: `packages/app/src/ui/prototype-viewer.ts`

### Prototype Viewer Issue Navigator Strip (2026-04-12)
- [x] Flow Lint 패널에 issue type 필터 chip strip 추가 (dead-end/unreachable/cycle-trap/cycle/overlay-leak/orphan-close)
- [x] 선택된 chip 상태에 따라 lint 이슈 리스트를 즉시 필터링하고 `+ N more` 카운트도 필터 결과 기준으로 표시
- [x] Shift+N / Shift+P 단축키로 필터된 lint 이슈를 순환 탐색 (다음/이전 frame jump)
- [x] 단축키 네비게이션 시 해당 이슈 row 하이라이트 + 자동 스크롤로 검증 루프 가시성 강화
- 구현: `packages/app/src/ui/prototype-viewer.ts`

### Prototype Session Snapshot Comparator (2026-04-12)
- [x] Prototype Viewer 우측에 `Session Snapshot Comparator` 패널 추가
- [x] current frame/name, frame scroll offset, runtime variables를 스냅샷으로 캡처(최대 10개)
- [x] snapshot A/B 선택 비교: frame 변경, scroll delta, variable diff를 카드 리스트로 표시
- [x] `Capture current`/`Clear` 액션 제공으로 재현성 디버깅 루프 단축
- 구현: `packages/app/src/ui/prototype-viewer.ts`

### Auto Layout Stretch Handles (2026-04-12)
- [x] 단일 자식 선택 + auto-layout 부모일 때 캔버스에 stretch handle 오버레이 표시
- [x] handle 드래그 거리 기반 sizing mode 전환 지원 (`Hug` / `Fixed` / `Fill`)
- [x] 전환 즉시 `set_sizing_h/v` + `compute_layout()` 적용으로 남은 공간 분배 실시간 프리뷰
- 구현: `packages/app/src/editor.ts`

### Smart Animate Property Diff Presets (2026-04-12)
- [x] Interactions 편집 카드에 `Smart Animate Diff Presets` 섹션 추가 (Scan/Apply/Apply flow)
- [x] source/target frame 트리를 비교해 변경 속성을 Transform/Opacity/Fill/Text로 자동 분류
- [x] 분류 점수 기반 추천 preset(transition + duration + easing) 제안 및 원클릭 적용
- [x] `Apply flow`로 active flow scope의 NavigateTo/OpenOverlay interaction에 일괄 적용
- 구현: `packages/app/src/ui/properties-panel.ts`

### Component Slot Fallback Preview (2026-04-12)
- [x] Instance `instance_swap` prop row에서 slot/component 깨짐 상태를 실시간 탐지해 경고 배지(`⚠`) 노출
- [x] 감지 규칙
  - linked slot 미설정(`linked_slot_id = 0`)
  - linked slot이 source component slot 목록에 없음
  - 현재 swap target component id가 컴포넌트 목록에 없음
- [x] broken target component의 경우 dropdown 맨 위에 `⚠ Missing component #id` placeholder를 삽입해 즉시 가시화
- [x] 복구 액션
  - `Fallback`: default component id(없으면 첫 component)로 override 값을 즉시 교체
  - `Relink`: prop name 기반 slot 추천으로 linked slot id를 component prop 정의에 재연결
- 구현: `packages/app/src/ui/properties-panel.ts`

### Component Property Controls — Number Prop Support (2026-04-12)
- [x] Instance `COMPONENT PROPS` 카드에서 `number` 타입 exposed prop 편집 지원
- [x] 숫자 입력 UI 추가: step=any, Enter 커밋, 기본값 placeholder/tooltip 표시
- [x] 유효 숫자만 `set_instance_prop_override({ type: "number" })`로 반영, invalid 입력은 기존값으로 복구
- 구현: `packages/app/src/ui/properties-panel.ts`

### Prototype Accessibility Audit (Focus/Label/Contrast/Motion) (2026-04-12)
- [x] Prototype Viewer Flow Lint에 접근성 규칙 4종 추가
  - `a11y-missing-label`: OnClick/OnPress hotspot의 accessibility label 누락
  - `a11y-focus-gap`: interaction은 있으나 keyboard-focusable hotspot 없음
  - `a11y-low-contrast`: frame 배경 대비 텍스트 4.5:1 미만
  - `a11y-motion`: transition duration ≥ 900ms 또는 aggressive easing(elastic/bounce/back/spring)+긴 duration 조합
- [x] Flow Lint summary에 A11y 집계(`missing-label/focus-gap/low-contrast/motion`) 추가
- [x] 기존 issue filter chip/list/jump 워크플로우에 통합
- [x] **Focus cycle gap fix/polish (v2)**: 동일 노드에 다중 keyboard hotspot이 있을 때 `Tab` 순환이 같은 항목에 고정되던 케이스를 interaction signature 기반으로 교정. Flow Lint는 프레임 내 다중 keyboard hotspot 노드도 `a11y-focus-gap`으로 리포트.
- 구현: `packages/app/src/ui/prototype-viewer.ts`

### Sticky Scroll Sections for Prototype (2026-04-12)
- [x] Section 노드(스크롤 가능한 Frame의 direct child)에 `Sticky section header` 옵션 추가
- [x] Prototype viewer 렌더 단계에서 sticky 섹션 y를 스크롤 위치 기반으로 보정
  - 섹션이 top 도달 전에는 기본 스크롤
  - 도달 후 상단 고정
  - 다음 sticky section 도달 시 현재 섹션이 자연스럽게 밀려나도록 clamp 처리
- [x] 기존 Prototype fixed 레이어 보정 로직과 충돌 없이 동일 backup/restore 파이프라인에서 처리
- [x] Engine API 추가: `set_prototype_sticky(id, bool)`, `get_prototype_sticky(id)`
- 구현: `crates/engine/src/node.rs`, `crates/engine/src/lib.rs`, `packages/app/src/ui/properties-panel.ts`, `packages/app/src/ui/prototype-viewer.ts`

### Component Instance Swap Suggestions (2026-04-13)
- [x] Instance `COMPONENT PROPS`의 `instance_swap` prop row에 추천 swap chip UI(`추천:`) 추가
- [x] 엔진 `suggest_component_swaps(nodeId, limit)` 결과를 활용해 현재 swap target을 제외한 상위 추천 3개 표시
- [x] 추천 chip 클릭 시 one-click으로 `set_instance_prop_override({ type: "instance_swap", value: componentId })` 적용
- [x] 각 추천 chip에 score 표기 + reason 툴팁 제공
- 구현: `packages/app/src/ui/properties-panel.ts`

### Prototype Flow Coverage Recorder + Heatmap Report (2026-04-13)
- [x] Prototype Viewer `Flow Coverage` 패널에 미방문 hotspot 집계(`Missing N`) 추가
- [x] frame row마다 미방문 hotspot node id 미리보기 제공으로 누락 구간 빠른 식별 지원
- [x] `Copy` 액션 추가: 현재 세션 coverage 리포트(방문 frame, hotspot hit/miss, 미방문 샘플) 클립보드 내보내기
- [x] canvas hotspot hint에 coverage heatmap 오버레이 추가
  - 방문한 hotspot: 초록 반투명
  - 미방문 hotspot: 빨강 반투명
- 구현: `packages/app/src/ui/prototype-viewer.ts`
