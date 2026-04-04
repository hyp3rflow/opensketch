# MEMORY.md — OpenSketch Long-term Memory

## 완료된 기능
- 기본 도형: Rect, Ellipse, Text, Frame, Group
- Properties panel: Position, Size, Rotation, Corner Radius, Opacity, Fill, Stroke
- Layers panel: Tree view, expand/collapse, visibility toggle
- Text editing: Font family + inline editing (double-click), Fit/Fixed sizing
- Component system: ComponentStore, variants, slots, instances with overrides
- Notes system: Markdown notes, tags, canvas badge, dev mode overlay
- Auto layout: Flex/Grid, Figma-style 3x3 alignment matrix, direction toggle, gap/padding
- Undo/Redo: Scene snapshot (max 100), Cmd+Z / Cmd+Shift+Z
- PNG export: Per-node + full canvas, configurable scale
- LLM agent: OpenAI-compatible, 40+ tools, streaming, right pane Agent 탭
- Frame corner radius, nested label hiding
- Edit/Dev mode toggle

## 기술 결정
- WASM BigInt: 모든 ID는 경계에서 Number↔BigInt 변환
- Frame labels: `font_size = (11.0 / zoom).min(11.0)` screen-space max 11px
- Icons: Inline SVG (Lucide-inspired, MIT) — 외부 패키지 없음
- Design system: Center modal, toolbar palette icon + D shortcut
- Agent panel: Right pane 탭 (CMD 모드 제거, LLM only)
- Undo: Full snapshot (command pattern 아닌), selection preserved

## 완료된 기능 (추가)
- Text caret: 편집 시 깜빡이는 캐럿, Cmd+←/→ 맨앞/뒤 이동
- Font rendering Stage 1-4:
  - Stage 1: HiDPI pixel snap, alphabetic baseline, accurate metrics
  - Stage 2: Multi-line text (word wrap, line-height, newline)
  - Stage 3: text-align (L/C/R), font-weight (100-900), font-style (italic)
  - Stage 4: Google Fonts 30개 + FontFace API 동적 로딩
- Properties panel: weight selector, italic toggle, alignment buttons, line-height input, Google Fonts dropdown

## 완료된 기능 (추가 2)
- Multi-select: Shift+click 추가/제거, 마키 드래그 셀렉트 (반투명 파란 사각형), 멀티 노드 동시 이동
- Engine: hit_test_rect (Scene 내 AABB 검사), WASM 바인딩 노출

## 완료된 기능 (추가 3)
- Copy/Paste: Cmd+C (copy), Cmd+X (cut), Cmd+V (paste with +10px offset), Cmd+D (duplicate)
- 계층 구조 보존 (children/parent ID 리매핑), undo 통합

## 완료된 기능 (추가 — 2026-04-04)
- Drag Reorder in Layers Panel: 레이어 행 드래그로 노드 순서/계층 변경, 파란색 삽입 인디케이터, 멀티셀렉트 드래그, Frame/Group/Section 안으로 reparent, 순환 참조 방지, Undo 통합

## 완료된 기능 (추가 4)
- Alignment tools: align left/center_h/right/top/center_v/bottom + distribute horizontal/vertical
- Scene 메서드 + WASM align_selection/distribute_selection 바인딩
- Properties panel: 멀티 셀렉션(2+) 시 6개 정렬 + 2개 배분 아이콘 버튼 UI

## 완료된 기능 (추가 5)
- SVG export: Rust 엔진 svg_export.rs, WASM 바인딩 (export_svg, export_selection_svg, export_node_svg)
- 지원: Rect, Ellipse, Text (multiline/align/weight/style), Frame/Group (nested children), Instance/Slot
- Fill/Stroke/Opacity/CornerRadius/Rotation 모두 반영
- TS: Editor.exportSVG(), exportSelectionSVG(), downloadSVG() + 툴바 다운로드 버튼

## 완료된 기능 (추가 6)
- Image node support: NodeKind::Image(src, fit), drag & drop, Cmd+V 클립보드 이미지 붙여넣기
- WASM: add_image, set_image_src, set_image_fit
- TS: drawImage + cover/contain/fill 모드, 코너 라디우스 클리핑, 이미지 캐시
- SVG export: <image> + preserveAspectRatio
- 툴바 Image 버튼 (I 단축키), Properties panel: src 입력 + fit 모드 토글

## 완료된 기능 (추가 7)
- Image node 빌드 수정: 중복 Rust 함수/SVG export/TS renderImages 제거, 컴파일 오류 해결
- 툴바 Image 버튼 추가 (파일 피커)

## 완료된 기능 (추가 8)
- Drop Shadow: Shadow 구조체 (color, offset_x/y, blur, spread, visible), 복수 shadow 지원
- Canvas 렌더링: 각 shadow를 별도 패스로 그림 (far-offset 기법으로 shadow만 표시)
- Layer Blur: node.blur 필드, ctx.filter("blur(Xpx)") 적용
- SVG export: feDropShadow + feGaussianBlur 필터
- WASM: add/remove/update/set_visible shadow, set/get blur
- Properties panel: Effects 섹션 (Blur 입력, shadow 리스트 + color/X/Y/blur/spread 편집, visibility 토글)

## 완료된 기능 (추가 9)
- Zoom controls UI: 좌하단 플로팅 바 (−, 줌%, +, fit 버튼)
- Zoom to fit (Cmd+1), Zoom to 100% (Cmd+0), Zoom to selection (Cmd+2)
- Zoom in/out (+/- 키), 센터 고정 줌
- Rust: Scene.get_bounds(), get_bounds_of(), Engine.set_viewport/get_scene_bounds/get_selection_bounds
- TS: Editor.zoomToFit/zoomToSelection/zoomTo100/zoomBy + onZoomChanged 콜백

## 완료된 기능 (추가 10)
- Gradient fills: FillType enum (Solid | LinearGradient | RadialGradient)
- GradientStop (offset, color), normalized coordinates (0~1)
- Canvas: createLinearGradient / createRadialGradient 렌더링
- SVG export: <linearGradient>/<radialGradient> defs 지원
- WASM: set_fill_linear_gradient, set_fill_radial_gradient, get_fill_info
- Properties panel: Solid/Linear/Radial 모드 전환, gradient stops 편집 (color + position), 방향/중심점 파라미터
- Backward-compatible deserialization (기존 {"color": ...} 포맷 호환)

## 완료된 기능 (추가 11)
- Pen tool / Vector paths:
  - NodeKind::Path { points: Vec<PathPoint>, closed: bool }
  - PathPoint: anchor (x,y) + bezier handles (handle_in, handle_out) — absolute coords
  - Click to add corner points, drag to create mirrored bezier handles
  - Click near first point to close path, Escape/Enter to finish open path
  - Canvas rendering: bezier_curve_to/line_to, shadow support
  - SVG export: <path d="M... C... L... Z"/>
  - Properties panel: point count, open/closed toggle
  - WASM: add_path, path_add_point, path_add_curve_point, path_set_point, path_set_handle_out/in, path_remove_point, path_set_closed, path_get_data, path_point_count
  - recalc_path_bounds: bounding box auto-update from points+handles
  - Toolbar Pen button (P shortcut), crosshair cursor

## 완료된 기능 (추가 12)
- Stroke options:
  - Stroke 구조체 확장: dash_array, dash_offset, line_cap (Butt/Round/Square), line_join (Miter/Round/Bevel)
  - Canvas 렌더링: setLineDash, setLineCap, setLineJoin 적용 (Rect/Ellipse/Frame/Instance/Path 모두)
  - SVG export: stroke-dasharray, stroke-dashoffset, stroke-linecap, stroke-linejoin 속성
  - WASM: set_stroke_dash(id, pattern, offset), set_stroke_cap(id, cap), set_stroke_join(id, join)
  - Properties panel: Dash 패턴 입력 (comma-separated), Cap/Join select 드롭다운
  - Backward-compatible serde (기존 파일 호환)

## 완료된 기능 (추가 13)
- Smart Guides / Snapping:
  - 드래그 이동 시 다른 노드의 edges(left/right/top/bottom) + center에 스냅
  - 5px screen-space threshold, zoom 반영
  - 마젠타(#ff3366) 가이드 라인 렌더링
  - 멀티 셀렉션 지원 (combined bounding box)
  - 순수 TypeScript 구현 (tools/smart-guides.ts)
  - pointer up 시 가이드 자동 클리어

## 완료된 기능 (추가 14)
- Constraints (responsive resize):
  - ConstraintH: Left/Right/LeftAndRight/Center/Scale
  - ConstraintV: Top/Bottom/TopAndBottom/Center/Scale
  - Frame/Group 리사이즈 시 자식 노드 자동 재배치/리사이즈
  - WASM: set_constraints, get_constraints, resize_node_with_constraints
  - Properties panel: Constraints 섹션 (H/V 드롭다운)
  - 로컬 좌표 변환으로 정확한 constraint 계산

## 완료된 기능 (추가 15)
- Mask / clip support (Figma-style): `is_mask` on Node, hierarchical rendering with `render_children()`, Canvas2D clip paths, SVG `<clipPath>` export, WASM `set_mask`/`get_mask`, Properties panel "Use as mask" checkbox, Layers panel "M" badge

## 완료된 기능 (추가 16)
- Blend modes:
  - BlendMode enum (16종): Normal, Multiply, Screen, Overlay, Darken, Lighten, ColorDodge, ColorBurn, HardLight, SoftLight, Difference, Exclusion, Hue, Saturation, Color, Luminosity
  - Canvas: globalCompositeOperation per node
  - SVG export: mix-blend-mode style attribute
  - WASM: set_blend_mode(id, str), get_blend_mode(id) -> String
  - Properties panel: Blend mode dropdown in Effects section
  - Backward-compatible serde (기존 파일 호환)

## 완료된 기능 (추가 17)
- Path point editing mode:
  - Double-click Path node → path edit mode 진입
  - Anchor points: 4x4 white squares with blue border (selected: filled blue)
  - Handle points: 3px circles with handle lines (blue)
  - Anchor drag: 핸들도 함께 이동 (offset 보존)
  - Handle drag: 미러링 (Alt 누르면 독립 이동)
  - Delete/Backspace: 선택된 포인트 삭제
  - Escape 또는 빈 곳 클릭: edit mode 종료
  - 모든 크기 screen-space (줌 불변)

## 완료된 기능 (추가 18)
- Star / Polygon shapes:
  - NodeKind::Star { points: u32, inner_radius: f64 } — 꼭짓점 수 + 내부 반지름 비율 (0~1)
  - NodeKind::Polygon { sides: u32 } — 정다각형
  - Canvas 렌더링: 꼭짓점 계산 → moveTo/lineTo → fill/stroke
  - SVG export: Star → <path>, Polygon → <polygon>
  - Clip path / mask 지원
  - WASM: add_star, add_polygon, set/get_star_points, set/get_star_inner_radius, set/get_polygon_sides
  - 툴바: Star (S) / Polygon (G) 버튼
  - Properties panel: Star → Points + Inner Radius 입력, Polygon → Sides 입력
  - Backward-compatible serde

## 완료된 기능 (추가 19)
- Auto-save / Version History:
  - localStorage 자동 저장 (30초 간격), 수동 저장 (Cmd+S)
  - 앱 시작 시 이전 세션 복원 (저장된 세션 있으면 데모 씬 스킵)
  - beforeunload 시 자동 저장
  - 최근 20개 타임스탬프 스냅샷 저장 (auto/manual 라벨)
  - Right pane "History" 탭: 복원 버튼, 타임스탬프 표시
  - 복원 전 현재 상태 자동 저장, confirm 다이얼로그
  - localStorage 용량 초과 시 자동 히스토리 트림
  - 변경 감지 (해시 비교)로 중복 저장 방지

## 완료된 기능 (추가 20)
- Ruler / Guides:
  - 수평 ruler (상단 20px) + 수직 ruler (좌측 20px) + 코너 사각형
  - Zoom/pan 반영 틱 마크 + 숫자 라벨, 적응형 간격 (50-200px screen spacing)
  - Ruler에서 드래그하여 가이드 라인 생성 (파란색 #4a90d9)
  - 가이드 라인을 다시 ruler로 드래그하여 제거, 더블클릭으로 제거
  - 기존 smart-guides 스냅 시스템에 통합 (가이드 위치를 가상 노드로 추가)
  - 순수 TypeScript 구현 (ui/rulers.ts)

## 완료된 기능 (추가 21)
- Multi-page support:
  - Rust: Scene에 pages Vec + active_page, save_active_page/load_page 동기화
  - Page CRUD: add_page, remove_page, rename_page, set_active_page, duplicate_page
  - WASM: 8개 바인딩 (add/remove/rename/set_active/duplicate/get_pages/get_active_page_id/get_page_count)
  - UI: 캔버스 하단 페이지 탭 바, 클릭 전환, 더블클릭 rename, + 추가, 우클릭 메뉴 (Rename/Duplicate/Delete)
  - Backward-compatible: 기존 저장 데이터는 "Page 1"로 자동 마이그레이션
  - 최소 1페이지 유지, 전환 시 selection 초기화

## 완료된 기능 (추가 22)
- Boolean operations (Union, Subtract, Intersect, Exclude):
  - i_overlay crate로 polygon clipping
  - Shape→polygon 변환 (Rect/Ellipse/Star/Polygon/Path), bezier flatten
  - 2+ 노드 체이닝 지원, 결과를 Path node로 생성
  - WASM: boolean_operation(op), 툴바 Boolean ops 버튼
  - 키보드 단축키: Cmd+Alt+U/S/I/X
- Styles library (shared color/text styles):
  - ColorStyle + TextStyle CRUD, apply/detach, sync
  - Properties panel UI dropdown

## 완료된 기능 (추가 23)
- Inspect mode (CSS code gen):
  - Right pane "Inspect" 탭 (Properties/Agent/History 옆)
  - 노드 선택 시 CSS 코드 자동 생성 (width/height/position/border-radius/background/opacity/border/box-shadow/filter:blur/mix-blend-mode/transform:rotate)
  - Text 노드: font-family/size/weight/style/line-height/text-align
  - Layout: display:flex/grid + direction/align-items/justify-content/gap/padding
  - SVG 속성 별도 섹션 (stroke-dasharray/linecap/linejoin)
  - VS Code 스타일 syntax highlighting, 클립보드 복사 버튼
  - inspect-panel.ts 단일 파일 구현

## 완료된 기능 (추가 24)
- Flatten selection:
  - 모든 shape (Rect, Ellipse, Star, Polygon, Text, Image 등) → Path node 변환
  - Group/Frame: 모든 자식 노드를 i_overlay union으로 하나의 Path로 병합
  - 스타일 보존: fill, stroke, opacity, shadows, blur, blend mode
  - Multi-select 지원 (각 노드 독립 변환)
  - WASM: flatten_selection() -> u32 (변환된 노드 수)
  - 키보드 단축키: Cmd/Ctrl+E
  - 툴바 Flatten 버튼 (1+ 노드 선택 시 활성)
  - Undo 통합

## 완료된 기능 (추가 25)
- Layout grid overlay (이미 구현 완료 상태, 백로그에서 제거):
  - Frame별 Columns/Rows/Grid 타입 레이아웃 그리드
  - WASM: add/remove/update/set_visible_layout_grid
  - Properties panel: grid 설정 UI
  - Canvas: zoom/pan 반영 렌더링, clip to frame bounds
  - Ctrl+G 토글

## 완료된 기능 (추가 26)
- Export/import styles (JSON style library):
  - Rust StyleStore: export_json() / import_json() 메서드
  - WASM: export_styles(), import_styles(json) 바인딩
  - TS: Properties panel 빈 상태에서 "Styles Library" 섹션
  - Export: JSON 파일 다운로드 (color + text styles)
  - Import: 파일 피커 → JSON 파싱 → 새 ID로 머지, 결과 알림
  - 버전 필드 포함 (version: 1)

## 완료된 기능 (추가 27)
- Prototype / interaction links:
  - Interaction struct: trigger (OnClick/OnHover/OnPress/OnDrag), action (NavigateTo/Back/ScrollTo/OpenOverlay/CloseOverlay)
  - Target node/page ID, transition type (Instant/Dissolve/SmartAnimate/SlideIn/SlideOut/Push), duration
  - WASM: add_interaction, remove_interaction, clear_interactions, get_interactions, get_interaction_count, get_all_interactions
  - Properties panel: "Interactions" 섹션 (trigger/action/target/transition/duration 편집, add/remove)
  - Prototype viewer: 풀스크린 오버레이, 클릭 네비게이션, back stack, Esc 닫기
  - 툴바 Play 버튼 (▶), Cmd+Enter 단축키
  - 인터랙션 핫스팟 힌트 (파란 점선 테두리)

## 완료된 기능 (추가 28)
- Comments / Annotations (collaborative review):
  - Comment struct: id, x, y, author, text, timestamp, resolved, replies, node_id, page_id
  - CommentReply struct for threaded conversations
  - Scene-level storage, 페이지별 필터링
  - WASM: add/remove/resolve/edit comment, add/remove reply, get comments/count
  - Canvas overlay: 파란 핀 아이콘 (zoom/pan aware), 클릭 → 스레드 팝업
  - Comment mode: C 키 토글, crosshair cursor, 캔버스 클릭으로 코멘트 배치
  - Thread popup: 댓글 + 답글 보기, resolve/delete, Cmd+Enter 답글 전송
  - Right pane "Comments" 탭: 전체 코멘트 목록, 클릭 시 해당 위치로 pan
  - Resolved 코멘트 분리 표시, undo 통합, backward-compatible serde

## 완료된 기능 (추가 29)
- Keyboard shortcuts panel: 이미 구현 완료 확인 (Cmd+/ or ?, 검색, 카테고리별)
- Auto layout hug/fill sizing:
  - SizingMode enum (Fixed/Hug/Fill) per axis (sizing_h, sizing_v)
  - Fill: 자식이 부모 auto-layout 남은 공간 채움, Hug: 부모가 콘텐츠에 맞게 축소
  - WASM: set_sizing_h, set_sizing_v, get_sizing
  - Properties panel: Size 섹션 sizing mode 드롭다운

## 완료된 기능 (추가 30)
- Right-click context menu:
  - 캔버스 우클릭 시 Figma 스타일 커스텀 메뉴 (브라우저 기본 메뉴 차단)
  - 노드 선택 시: Copy, Cut, Paste, Duplicate, Delete, Lock/Unlock, Show/Hide, z-order (Bring to Front/Forward, Send Backward/Back), Flatten
  - 빈 캔버스: Paste, Select All, Zoom to Fit, Zoom to 100%
  - 단축키 표시, 비활성 항목 회색 처리, 자동 선택 (우클릭한 노드)
  - Z-order: Scene + WASM 바인딩 (bring_to_front, send_to_back, bring_forward, send_backward)
  - select_all: Scene + WASM 바인딩
  - context-menu.ts UI 컴포넌트, 뷰포트 경계 보정

## 완료된 기능 (추가 31)
- Outline stroke (stroke alignment):
  - StrokeAlign enum (Center/Inside/Outside), Stroke 구조체에 align 필드 추가
  - Canvas 렌더링: Inside → clip + 2x width, Outside → 2x width stroke first + fill on top
  - SVG export: paint-order="stroke" for outside, data-stroke-align attribute
  - WASM: set_stroke_align(id, align), get_stroke_info에 align 포함
  - Properties panel: Stroke 섹션에 Align 드롭다운 (Center/Inside/Outside)
  - Inspect panel: Inside → box-sizing: border-box, Outside → outline CSS
  - Backward-compatible serde (기존 파일 호환, 기본값 Center)

## 완료된 기능 (추가 32)
- Selection colors / multi-fill:
  - Node.fills: Vec<Fill> — 노드당 여러 fill 지원 (Figma 스타일)
  - Fill에 visible: bool 추가 (기본 true), 각 fill on/off 토글
  - Backward-compatible serde: 기존 "fill": {...} → fills[0]로 자동 마이그레이션
  - Node.normalize_fills() 역직렬화 후 호출
  - Canvas 렌더링: visible fills를 bottom→top 순서로 모두 렌더
  - SVG export: 첫 번째 visible fill 사용
  - WASM API: add_fill, remove_fill, update_fill_at, set_fill_visible_at, get_fills, get_fill_count, move_fill, set_fill_linear_gradient_at, set_fill_radial_gradient_at
  - 기존 set_fill_color/set_fill_linear_gradient/set_fill_radial_gradient은 fills[0] 수정으로 호환 유지
  - Properties panel: 멀티 fill 리스트 UI (+ 추가, ✕ 제거, visibility 토글, type 전환, gradient stops 편집, 순서 이동)

## 완료된 기능 (추가 33)
- Component variant switching UI:
  - Instance 선택 시 Properties panel에 "VARIANTS" 섹션 표시 (보라색 카드)
  - Boolean props: 토글 스위치 (on/off), String props: 드롭다운 셀렉트
  - 변경 시 set_instance_variant() 호출 → 인스턴스 즉시 업데이트
  - get_instance_component_info 확장: properties, variant_keys, current_variant_values 반환
  - Backward-compatible (variant property 없는 인스턴스는 기존대로)

## 완료된 기능 (추가 34)
- Variable Collections (Design Tokens):
  - Rust: variable.rs — VariableCollection, Variable, VariableMode, VariableBinding, VariableValue enum (Color/Number/String/Boolean)
  - Collection CRUD: create/rename/delete, mode CRUD: add/remove/rename/switch active
  - Variable CRUD: create with type, set value per mode, delete
  - Scene integration: variable_collections + variable_bindings (HashMap<String, VariableBinding>)
  - apply_variables(): 모든 바인딩을 active mode 값으로 resolve → 노드 속성 적용
  - Bindable properties: fill.0.color, stroke.color, opacity, corner_radius, width, height
  - WASM: 16개 바인딩 (create/rename/delete_collection, var_add/rename/delete_mode, set_active_mode, create/set/delete_variable, get_collections, bind/unbind_variable, get_bindings, apply_variables)
  - UI: Right pane "Variables" 탭 — collection selector, mode tabs, variable table with type editors (color picker, number input, text input, boolean toggle)
  - Properties panel: "Variable Bindings" 섹션 — 6개 bindable property별 bind/unbind, variable picker popup
  - Backward-compatible serde (기존 파일 호환)

## 완료된 기능 (추가 35)
- Min/Max size constraints:
  - Node에 min_width, max_width, min_height, max_height: Option<f64> 필드 추가
  - Node.clamp_size() 헬퍼: width/height를 min/max 범위로 클램핑
  - Layout 엔진: Flex/Grid 레이아웃 계산 후 자동 클램핑 적용
  - WASM: set_min_width, set_max_width, set_min_height, set_max_height, get_min_max_size
  - Properties panel: Size 섹션에 Min W/Max W/Min H/Max H 4칸 입력 UI
  - Inspect panel: min-width/max-width/min-height/max-height CSS 생성
  - Backward-compatible serde (기존 파일 호환, 기본값 None)

## 완료된 기능 (추가 36)
- Asset Library Panel: 이미 구현 완료 (Right pane "Assets" 탭, components/color styles/text styles 통합 브라우저, 검색/필터)

## 완료된 기능 (추가 37)
- Section nodes (Figma Section — page organization containers):
  - NodeKind::Section: 페이지 내 구역 그룹핑 컨테이너
  - Canvas 렌더링: 둥근 모서리 배경 (rgba(26,26,46,0.6)) + 테두리 + 상단 타이틀 라벨 (node.name, 14px bold)
  - Children 지원 (Frame처럼 자식 노드 렌더링)
  - WASM: add_section(name, x, y, w, h) 바인딩
  - SVG export: Frame/Group과 동일 (group + rect 배경)
  - 툴바: Section 버튼 (⇧S 단축키)
  - Layers panel: Section 아이콘, 컨테이너 expand/collapse
  - Hit test: AABB bounds, Constraints 지원
  - Backward-compatible serde

## 완료된 기능 (추가 38)
- Responsive resize preview:
  - Fullscreen overlay: 선택된 Frame을 여러 브레이크포인트에서 side-by-side로 표시
  - 기본 브레이크포인트: Mobile (375px), Tablet (768px), Desktop (1440px)
  - 커스텀 브레이크포인트 추가/제거 지원
  - SVG 기반 렌더링: export_node_svg + resize_node_with_constraints 조합
  - Scene snapshot/restore로 원본 보존
  - 툴바 Responsive 버튼 + Cmd+Alt+R 단축키, Escape 닫기
  - responsive-preview.ts 단일 파일 구현

## 완료된 기능 (추가 39)
- Measure tool (Alt+hover distance measurement):
  - 노드 선택 후 Alt 홀드 + 다른 노드 hover → 거리 측정 표시
  - 빨간 대시 라인 (#ff3366) + px 거리 라벨 (핑크 pill 배경)
  - Edge-to-edge 수평/수직 갭 거리 계산
  - Overlap 시 개별 edge 거리 표시
  - 타겟 노드 빨간 대시 테두리 하이라이트
  - 양쪽 끝 수직/수평 tick 마크
  - 순수 TypeScript 구현 (tools/measure.ts)

## 완료된 기능 (추가 40)
- Batch rename (multi-node rename):
  - Pattern-based rename: {name} = original name, {n} = sequential number, {N} = zero-padded
  - Rust Scene.batch_rename(ids, pattern, start_num)
  - WASM: batch_rename_selection(pattern, start_num) -> count, undo 통합
  - Modal dialog UI: pattern 입력, start number, Cancel/Rename 버튼
  - Context menu: 2+ 노드 선택 시 "Batch Rename…" 옵션
  - Keyboard: Cmd/Ctrl+Shift+R

## 완료된 기능 (추가 41)
- Slice tool (export regions):
  - NodeKind::Slice: 비렌더링 노드, 사각형 export 영역 정의
  - Canvas overlay: 초록(#36b37e) 대시 아웃라인 + 이름 라벨
  - 툴바: Slice 버튼 (K 단축키), crosshair cursor
  - Properties panel: Export 섹션 (scale 1-4x 선택 + Export PNG 버튼)
  - WASM: add_slice(name, x, y, w, h), get_slices() → JSON
  - Layers panel: Slice 아이콘
  - exportSlice(): 캔버스 영역 크롭 → 지정 스케일 PNG 다운로드
  - Render/SVG export에서 Slice 노드 제외
  - Backward-compatible serde

## 완료된 기능 (추가 42)
- Flow connectors (arrow lines):
  - NodeKind::Connector: start_node_id, end_node_id, start_x/y, end_x/y, path_type, start/end_arrow
  - Canvas rendering: straight/curved (cubic bezier), arrowheads, edge clipping to node bounds
  - SVG export: <line>/<path> + marker arrowheads
  - WASM: add_connector, set_connector_path_type/arrows/endpoints/nodes, get_connector_info, update_connector_bounds, get_connectors_for_node
  - 툴바: Connector 버튼 (L 단축키), crosshair cursor
  - Drag to connect: 소스→타겟 노드 드래그, 양쪽 hit test
  - Properties panel: path type (Straight/Curved), start/end arrow 체크박스
  - Layers panel: Connector 아이콘
  - Stroke 지원: 색상/두께/대시 패턴 (기존 stroke 속성 사용)
  - Backward-compatible serde

## 완료된 기능 (추가 44)
- Favorites / Bookmarked nodes:
  - Rust: Node.bookmarked field, Scene toggle/query methods (이미 존재), WASM 바인딩에 kind 추가
  - TS: bookmarks-panel.ts (우측 탭), 노드 리스트 + 클릭 시 select & pan to center
  - layers-panel.ts: ⭐ 북마크 토글 버튼 (hover 시 표시)
  - editor.ts: Cmd+Shift+B 단축키
  - index.html: Bookmarks 탭 + 패널 컨테이너

## 완료된 기능 (추가 43)
- Smart animate transitions (prototype viewer):
  - Dissolve: 두 프레임 간 cross-fade (globalAlpha 보간)
  - SlideIn: 새 프레임이 오른쪽에서 슬라이드, SlideOut: 기존 프레임이 오른쪽으로 퇴장
  - Push: 양쪽 프레임이 함께 이동하는 푸시 효과
  - SmartAnimate: 노드 이름 매칭 → position/size 보간 + 매칭 노드 clip 렌더링, 미매칭은 dissolve fallback
  - Cubic ease-in-out 이징 함수, requestAnimationFrame 기반 60fps
  - 전환 중 클릭/키보드 입력 차단 (transitioning 플래그)
  - Interaction의 transition/transition_duration_ms 필드 활용
  - 순수 TypeScript 구현 (prototype-viewer.ts)

## 완료된 기능 (추가 45)
- Export preset profiles (PNG/SVG 내보내기 프리셋 저장 및 관리):
  - ExportPreset: id, name, format (png/svg), scale (0.5-4x), suffix, quality
  - 기본 프리셋 7개: iOS @1x/2x/3x, Android mdpi/xxhdpi, Web @2x, SVG Vector
  - Properties panel "Export" 섹션: 프리셋 드롭다운 + 노드별 active presets 관리
  - Preset editor modal: 생성/편집 (name, format, scale, suffix)
  - Presets manager modal: 전체 목록 보기, 삭제, 기본값 리셋
  - Batch export: active presets 일괄 다운로드 (PNG/SVG)
  - 포맷 뱃지: PNG(파랑)/SVG(보라) 컬러 코딩
  - localStorage 기반 저장 (presets + per-node active presets)
  - export-presets.ts 단일 파일 구현

## 완료된 기능 (추가 46)
- Cursor presence indicators (collaboration readiness):
  - CursorPresence 클래스: RemoteCursor 모델 (id, name, color, x/y, selectedIds, tool, lastSeen)
  - 10가지 프리셋 컬러 자동 할당, stale cursor 자동 정리 (10s timeout + 2s fade)
  - Canvas 렌더링: Figma-style 컬러 화살표 커서 + 이름 라벨 pill + 그림자
  - Remote selection highlights: 대시 컬러 사각형
  - Demo 시뮬레이션: 3명 가상 유저 (Alice, Bob, Carol) smooth 랜덤 이동
  - 툴바 Users 버튼 토글, editor.cursorPresence getter (WebSocket/WebRTC 연동용)
  - 순수 TypeScript 구현 (ui/cursor-presence.ts)

## 완료된 기능 (추가 47)
- Component search & swap:
  - Modal UI: 전체 컴포넌트 검색 (이름 필터), 컴포넌트별 인스턴스 목록 조회
  - Instance select: 클릭 시 해당 인스턴스 선택 (캔버스 연동)
  - Swap All: 특정 컴포넌트의 모든 인스턴스를 다른 컴포넌트로 일괄 교체
  - Swap Selected: 현재 선택된 인스턴스만 교체
  - Rust WASM: find_instances(comp_id), swap_instance_component(instance_id, new_comp_id)
  - Keyboard: Cmd/Ctrl+Shift+K
  - Undo 통합

## 완료된 기능 (추가 48)
- Accessibility checker panel:
  - WCAG 2.1 contrast ratio 검사: Text 노드의 전경/배경 색상 분석, AA/AAA 수준 판정
  - Touch target size 검사: 44×44px 미만 요소 경고
  - Image alt text 검사: 기본 이름("Image N") 사용 시 에러
  - Text size 검사: 12px 미만 폰트 경고
  - Right pane "A11y" 탭: 카테고리별 이슈 그룹핑, severity 배지 (error/warning/info)
  - 이슈 클릭 시 해당 노드 선택 + zoom to selection
  - Re-check 버튼으로 수동 재검사
  - Rust accessibility.rs: WCAG 2.1 전용 모듈 (check_accessibility → Vec<A11yIssue>, LowContrast/MissingAltText/SmallText/TouchTargetTooSmall)
  - WASM: check_accessibility() → JSON (serde)
  - 순수 TypeScript 구현 (ui/accessibility-panel.ts)

## 완료된 기능 (추가 49)
- Plugin API (extensible tool/panel system):
  - Plugin interface: { id, name, version, activate(api), deactivate() }
  - PluginManager: register/unregister/activate/deactivate/getAll
  - PluginAPI: editor/engine 접근, UI 확장 (registerPanel, registerToolbarButton, registerMenuItem), 이벤트 구독
  - 샘플 플러그인: Lorem Ipsum Generator (텍스트 생성), Color Palette (4종 팔레트)
  - Right pane "Plugins" 탭: 플러그인 목록, 활성/비활성 토글
  - specs/PLUGINS.md 문서
  - 순수 TypeScript 구현 (packages/app/src/plugins/)

## 완료된 기능 (추가 50)
- Text decoration & spacing:
  - TextDecoration enum: None, Underline, Strikethrough, UnderlineStrikethrough
  - Canvas 렌더링: underline (baseline 아래), strikethrough (x-height 중간) 선 그리기, 두께 = fontSize/14
  - Letter spacing: Canvas letterSpacing API 활용, -10~100px 범위
  - Paragraph spacing: 줄바꿈 간 추가 간격, 0~200px 범위
  - SVG export: text-decoration, letter-spacing 속성, tspan dy에 paragraph-spacing 반영
  - WASM: set_text_decoration, set_letter_spacing, set_paragraph_spacing
  - Properties panel: U/S 토글 버튼, LS(letter-spacing)/PS(paragraph-spacing) 숫자 입력
  - Inspect panel: text-decoration, letter-spacing CSS 출력
  - Backward-compatible serde (기존 파일 호환, 모든 새 필드 기본값)

## 완료된 기능 (추가 51)
- Scrollable frames (overflow control):
  - Overflow enum: Visible (default), Hidden, Scroll — Node.overflow 필드
  - Canvas 렌더링: Hidden/Scroll 시 frame bounds로 children 클리핑 (corner_radius 지원)
  - Scroll mode: children에 scroll_x/scroll_y translate 적용, 마우스 휠 스크롤
  - 스크롤바 인디케이터: 세미투명 thumb bars (content/viewport ratio 기반 크기), zoom-invariant
  - 컨텐츠 바운드 계산: children AABB → 스크롤 범위 클램핑
  - SVG export: clipPath + scroll transform 지원
  - WASM: set_overflow, get_overflow, set_scroll_offset, get_scroll_offset, get_content_bounds
  - Properties panel: Overflow 섹션 (Visible/Hidden/Scroll 3-button 토글), scroll position 표시, Reset 버튼
  - Inspect panel: overflow CSS (hidden/auto) 출력
  - Backward-compatible serde (기본값 Visible, scroll 0,0)

## 완료된 기능 (추가 52)
- Bitmap filters (CSS filter effects):
  - BitmapFilter 구조체: brightness, contrast, saturation, hue_rotate, invert, grayscale, sepia, enabled
  - Node.bitmap_filter: Option<BitmapFilter> — 노드별 필터 효과
  - Canvas 렌더링: 기존 blur와 합쳐서 단일 ctx.filter CSS 문자열로 적용
  - SVG export: feComponentTransfer (brightness/contrast/invert), feColorMatrix (grayscale/sepia/saturate/hueRotate)
  - WASM: set_bitmap_filter, remove_bitmap_filter, set_bitmap_filter_enabled, get_bitmap_filter
  - Properties panel: Effects 섹션에 Filters 서브섹션 — 슬라이더 + 숫자 입력 (7개 속성), enable 토글, add/remove
  - Inspect panel: CSS filter 속성 출력 (blur와 통합)
  - Flatten에서 bitmap_filter 복사
  - Backward-compatible serde (기본값 None)

## 완료된 기능 (추가 53)
- Tauri desktop build:
  - Tauri v2 scaffold: src-tauri/ (Cargo.toml, tauri.conf.json, main.rs, build.rs, capabilities)
  - macOS .app 번들 생성 확인 (cargo tauri build --bundles app → OpenSketch.app)
  - Vite 프론트엔드 연동: devUrl localhost:5174, frontendDist packages/app/dist
  - Window: 1440x900, resizable, CSP null (WASM 호환)
  - npm scripts: tauri:dev (개발), tauri:build (릴리즈 빌드)
  - Workspace Cargo.toml에 src-tauri 멤버 포함

## 완료된 기능 (추가 54)
- Variable scoping (변수 사용 범위 제한):
  - VariableScope enum: Global (기본, 모든 곳), Pages(Vec<u64>), Nodes(Vec<u64>)
  - VariableCollection에 scope 필드 추가, backward-compatible serde (기본 Global)
  - apply_variables(): 바인딩 적용 전 scope 체크 (페이지/프레임 매칭)
  - Nodes scope: 노드 자체 + ancestor chain 검사 (자식 노드도 범위 내)
  - Scene: set_collection_scope, get_collection_scope, get_ancestor_ids, active_page_id, is_binding_in_scope
  - WASM: set_collection_scope(collection_id, scope_json), get_collection_scope(collection_id), get_node_name(id)
  - Variables panel UI: Scope 섹션 (Global/Pages/Nodes 드롭다운)
    - Pages: 페이지 체크박스 리스트
    - Nodes: 현재 선택 프레임 추가 버튼, 범위 노드 리스트 + 제거 버튼
  - Undo 통합

## 완료된 기능 (추가 55)
- Responsive breakpoints (자동 레이아웃 전환):
  - Breakpoint struct: label, max_width, optional layout overrides (direction, layout_mode, gap, padding, align/justify, wrap, grid_columns, hidden_children)
  - Node.breakpoints: Vec<Breakpoint> — Frame별 브레이크포인트 규칙 (max_width 오름차순 정렬)
  - Layout 엔진: resolve_layout_with_breakpoints() — 레이아웃 계산 시 브레이크포인트 오버라이드 적용 (원본 layout 비변경)
  - Hidden children: 브레이크포인트별 자식 숨기기 (레이아웃 중만 임시 적용)
  - WASM: add_breakpoint, remove_breakpoint, update_breakpoint, get_breakpoints, get_breakpoint_count, get_active_breakpoint, set_breakpoints_preset
  - Properties panel: Auto Layout 하위 Breakpoints 섹션 — 추가/제거/편집, label/max_width/direction/gap/wrap 오버라이드, Preset 버튼 (Mobile/Tablet/Desktop 한번에 추가)
  - Active 브레이크포인트 배지 표시
  - Backward-compatible serde (기본 빈 벡터)

## 완료된 기능 (추가 56)
- Auto layout absolute positioning (Figma "Absolute position"):
  - Node.absolute_position: bool — true이면 부모 auto-layout flow에서 제외
  - Flex/Grid 계산 시 absolute_position 노드 스킵 (위치 유지, 수동 배치)
  - Hug sizing 계산에서도 제외
  - WASM: set_absolute_position(id, bool), get_absolute_position(id) -> bool
  - Properties panel: 부모가 auto-layout일 때 "Absolute position" 체크박스 표시
  - Backward-compatible serde (기본값 false)

## 완료된 기능 (추가 57)
- Multi-stroke support:
  - Stroke 구조체에 visible: bool 추가 (serde default true)
  - Node.strokes: Vec<Stroke> — 노드당 여러 stroke 지원 (fills 패턴과 동일)
  - Backward-compatible: 기존 "stroke": {...} JSON → strokes[0]로 자동 마이그레이션 (normalize_strokes)
  - Canvas 렌더링: outside strokes → fills → center/inside strokes 순서, 각 stroke별 독립 렌더
  - SVG export: first_stroke() 사용 (backward compat)
  - WASM: add_stroke, remove_stroke, update_stroke_at, set_stroke_visible_at, get_strokes_info
  - WASM 인덱스 기반: set_stroke_dash_at, set_stroke_cap_at, set_stroke_join_at, set_stroke_align_at
  - 기존 API (set_stroke, get_stroke_info 등) index 0 기준으로 backward compat 유지
  - Properties panel: 멀티 stroke 리스트 UI (color/width/visible/remove per stroke, dash/cap/join/align 옵션)
  - Boolean ops, flatten, component instance sync 모두 strokes 사용으로 업데이트

## 2026-03-24: Smart Selection 보강
- "Select All with Same Font" 추가 (select_same_font — scene.rs, lib.rs, editor.ts)
- select_same_fill 버그 수정: fill_type만 비교 → color()+fill_type 함께 비교
- context menu에 "Select All with Same Font" 항목 추가

## 완료된 기능 (추가 58)
- Dev mode handoff (multi-language code gen + asset download):
  - Inspect panel 언어 탭: CSS / SwiftUI / Kotlin Compose / SVG
  - SwiftUI code gen: Text, Image, Rectangle, Ellipse, fill/stroke/frame/position/rotation/opacity/shadow/blur/blend/font
  - Kotlin Compose code gen: Text, Box, Image, Modifier chain, layout (Column/Row), font/text
  - Asset download: 노드별 PNG(2x) / SVG 원클릭 다운로드
  - 4개 언어 syntax highlighting (VS Code 스타일)

## 완료된 기능 (추가 59)
- Design tokens export (multi-format):
  - Rust design_tokens.rs: W3C DTCG, Style Dictionary, Tailwind CSS theme 포맷
  - Sources: color styles + text styles + variable collections (모든 모드)
  - W3C: $type/$value/$description, typography composite, $extensions.modes
  - Style Dictionary: value/type 쌍, nested typography
  - Tailwind: theme.extend (colors, fontFamily, fontSize, spacing)
  - WASM: export_design_tokens(format) 바인딩
  - TS: Editor.exportDesignTokens(), downloadDesignTokens()
  - UI: Properties panel 빈 상태 + Inspect panel에 3포맷 다운로드 버튼

## 완료된 기능 (추가 60)
- Text on path (SVG textPath style):
  - Node.text_path_id: Optional<NodeId> — Text 노드를 Path 노드에 연결
  - Node.text_path_offset: f64 (0.0–1.0) — 경로 상 시작 위치
  - path_utils.rs: 경로 길이 계산, 거리별 좌표/접선 샘플링, 글리프 위치 계산
  - Canvas 렌더링: 각 문자를 베지어 경로 위에 접선 방향으로 회전 배치
  - SVG export: <defs><path/></defs> + <text><textPath href startOffset> 표준 SVG
  - WASM: set_text_path, clear_text_path, set_text_path_offset, get_text_path_info, get_text_on_path_positions, get_path_svg_d
  - Properties panel: Text Path 섹션 (attach/detach, offset 슬라이더, 경로 이름 표시)
  - Backward-compatible serde (기본값 None/0.0)

## 완료된 기능 (추가 61)
- Animation timeline (keyframe 기반 property 애니메이션):
  - Rust animation.rs: Easing (Linear/EaseIn/EaseOut/EaseInOut/CubicBezier), AnimProperty 16종, Keyframe, AnimationTrack, AnimationClip, AnimationStore
  - Keyframe interpolation with easing, cubic-bezier Newton-Raphson
  - AnimationClip: multi-track, looping, duration override
  - Scene: AnimationStore 통합, anim_apply → node property 실시간 변경
  - WASM: 12개 바인딩 (add/remove/rename clip, set_looping, set_duration, add/remove keyframe, apply, get_clips, get_clip, get_duration, record_selected)
  - TS animation-timeline.ts: 하단 도킹 패널, clip 관리, playback (play/pause/stop/loop), time scrubber
  - Track rows: node+property별 행, keyframe 다이아몬드, time ruler, zoom/scroll
  - Record 버튼: 선택 노드의 x,y,w,h,rotation,opacity를 현재 시간에 키프레임으로 기록
  - 재생 시 씬 스냅샷 저장/복원 (비파괴 프리뷰)
  - Alt+T 단축키로 토글
  - Backward-compatible serde (기본 빈 AnimationStore)

## 완료된 기능 (추가 62)
- Design lint engine (Rust + WASM):
  - Rust design_lint.rs: LintSeverity(Error/Warning/Info), LintCategory(11종), LintIssue with suggestion
  - LintConfig: configurable thresholds (touch target, font size, contrast, spacing tolerance, near-miss)
  - WCAG AA/AAA contrast check (text vs parent fill, relative luminance)
  - Touch target minimum 44×44px, Image alt text, Font size minimum 12px
  - Near-invisible opacity (<10%), empty text nodes, zero-size nodes, default container names
  - Cross-node consistency: inconsistent corner radii near-miss, inconsistent spacing gaps, near-miss colors
  - WASM: run_design_lint() → JSON array
  - TS: accessibility-panel.ts 리팩토링 → Rust engine 기반, suggestion 표시 (💡), 11개 카테고리 그룹핑
  - Panel 제목 "Design Lint"로 변경
  - Backward-compatible (기존 a11y 체크 모두 포함 + design consistency 체크 추가)

## 완료된 기능 (추가 63)
- Real-time collaboration backend:
  - WebSocket 서버 (`packages/collab-server/`): Node.js + ws, room-based, in-memory
  - CollabClient (`packages/app/src/collab.ts`): auto-reconnect, cursor throttle (50ms), exponential backoff
  - 프로토콜: join/leave/cursor_move/selection_change/scene_op/full_sync (JSON)
  - CursorPresence 연동: 리모트 커서 실시간 렌더링 (색상별 화살표 + 이름 라벨)
  - Collab UI (`packages/app/src/ui/collab-ui.ts`): top-right 패널, 유저 아바타, 연결 상태 표시, room link 복사
  - URL param `?room=<id>` auto-join 지원
  - Operation-based sync: full_replace scene op, full sync on join
  - main.ts 통합: 커서/선택/씬 변경 브로드캐스트
  - Backward-compatible: 서버 없이도 기존 기능 정상 동작
  - specs/COLLABORATION.md 문서화

## 완료된 기능 (추가 65)
- Color palette generator:
  - Rust color_palette.rs: 씬 내 모든 색상 추출 (fills/strokes/shadows), HSL 변환, harmony 생성, WCAG 대비 검사
  - 5종 하모니 팔레트: Complementary, Analogous, Triadic, Tetradic, Shades
  - WCAG AA/AAA 대비 체크: relative luminance, normal/large text 기준
  - WASM: extract_colors, generate_palettes, check_color_contrast
  - TS: color-palette-panel.ts — right pane "Palette" 탭 (Scene Colors / Harmonies / Contrast 3개 뷰)
  - Scene Colors: 사용 횟수 배지, 클릭→하모니 생성, 우클릭→선택 노드에 적용
  - Harmonies: hex 입력 + 5개 팔레트, 클릭으로 적용 또는 복사
  - Contrast: 모든 색상 쌍 대비 비율 + AA/AAA 배지, 컬러 코딩

## 완료된 기능 (추가 66)
- Branching / Forking (design version control):
  - Rust branch.rs: Branch struct (id, name, parent_branch_id, created_at, base_snapshot, current_snapshot)
  - BranchSnapshot: pages/active_page_index/next_page_id/next_id — frozen scene state
  - compute_diff: base vs current → added/modified/removed nodes (JSON comparison)
  - merge_snapshots: source→target node merge (add new, update existing, reconcile IDs)
  - Scene: branches Vec + active_branch_id, create/switch/merge/delete/list/rename/get_diff
  - WASM: 8 bindings (create_branch, switch_branch, merge_branch, delete_branch, list_branches, rename_branch, get_branch_diff, get_active_branch_id)
  - UI: branch-panel.ts — bottom-left bar with branch icon+name, click→popup with branch list
  - Branch popup: create (+), switch (click), rename (dblclick), delete (✕), merge (↓↓)
  - Diff preview popup: colored sections (green=added, yellow=modified, red=removed) + Cancel/Merge buttons
  - Main branch (id=1) protected from deletion
  - Backward-compatible serde (existing files → single "main" branch)
  - Undo integration for all branch operations

## 완료된 기능 (추가 67)
- Vector network editing (Figma-style):
  - Rust vector_network.rs: VectorVertex, VectorSegment (bezier handles), VectorRegion (closed loop), VectorNetwork struct
  - NodeKind::VectorNetwork — 기존 Path와 별도, backward-compatible serde
  - Methods: add/remove/update vertex, add/remove segment (with handles), detect_regions (planar face algorithm)
  - Region detection: adjacency graph + angle-based next-edge traversal → minimal closed cycles
  - Path → VectorNetwork 변환: from_path(), convert_path_to_vector_network WASM binding
  - Bounds calculation from all vertices + bezier handles
  - WASM bindings 10개: add_vector_network, vn_add/remove_vertex, vn_add/remove_segment, vn_get_data, vn_update_vertex, vn_update_segment_handles, vn_detect_regions, convert_path_to_vector_network
  - Canvas rendering: regions → filled paths, segments → stroked paths, shadow support
  - SVG export: regions as <path fill>, segments as <path stroke> in <g>
  - Editor VN edit mode: double-click to enter, click empty to add vertex, Shift+click to connect, drag to move, Delete to remove, Escape to exit
  - Properties panel: vertex/segment/region count, "Convert to Vector Network" button, "Detect Regions" button
  - Layers panel: VectorNetwork icon

## 완료된 기능 (추가 68)
- Smart object snapping (point-level):
  - Path anchor drag: 다른 path/VN 포인트, 노드 edges/centers, ruler guides에 스냅
  - VN vertex drag: 동일한 스냅 동작
  - Pen tool: 새 포인트 배치 시 기존 geometry에 스냅
  - Angle constraint: Shift 키 → 0°/45°/90° 증분 스냅 (pen, anchor, handle_in, handle_out)
  - Visual feedback: 다이아몬드 마커 (blue=point, green=grid, magenta=edge) + crosshair 라인
  - tools/point-snap.ts: computePointSnap, constrainAngle, collectPathPointTargets, addRulerTargets, renderPointSnapIndicators
  - 기존 smart-guides 인프라 재사용, SNAP_THRESHOLD_PX / zoom 적용

## 완료된 기능 (추가 69)
- AI layout suggestion (heuristic 기반):
  - 선택 노드 패턴 분석: row/column/grid 감지, gap/alignment 추론
  - Floating suggestion card: Apply/Dismiss (15s auto-dismiss)
  - Apply → 노드를 auto-layout Frame으로 감싸고 추천 설정 적용
  - Keyboard: Cmd+Shift+L, context menu: ✨ Suggest Layout
  - LLM agent tools: suggest_layout, apply_layout_suggestion
  - 순수 TypeScript heuristic (ai-layout-suggest.ts, 381 lines)

## 완료된 기능 (추가 69)
- AI layout suggestion (heuristic-based auto-layout recommendation):
  - Rust layout_suggest.rs: 선택 노드들의 위치/크기 패턴 분석
  - 패턴 감지: horizontal row, vertical column, grid-like (cluster 기반)
  - 간격 분석: median gap 계산, nice number 라운딩 (4/8/12/16/20/24/32)
  - 정렬 감지: cross-axis variance → start/center/end/stretch 추천
  - Confidence score: alignment + overlap ratio 기반 (0.0-1.0)
  - WASM: suggest_auto_layout(ids) → JSON, apply_auto_layout_suggestion(ids) → frame_id
  - Apply: bounding box Frame 생성 → Flex layout 설정 → 노드 reparent (visual order 정렬)
  - Properties panel: 2+ 노드 선택 시 "AI Layout" 섹션 + preview card + Apply 버튼

## 완료된 기능 (추가 70)
- Find & Replace:
  - Rust find_replace.rs: Scene 메서드 (find_text, replace_text_in_node, replace_all_text, find_by_color, replace_color)
  - Text search: Text 노드 content + 노드 이름 매칭 (case-sensitive 토글)
  - Text replace: 단일 노드 / 전체 노드 일괄 치환
  - Color search: fill color hex 검색 (±2 tolerance), Color replace: fill + stroke 일괄 교체
  - WASM: find_text, replace_text, replace_all_text, find_by_color, replace_color (5개 바인딩)
  - UI: find-replace-panel.ts — 플로팅 패널, Text/Color 모드 탭, 결과 리스트 + 네비게이션
  - Cmd+F 토글, Esc 닫기, 결과 클릭 시 노드 선택 + pan-to-center
  - Undo 통합 (push_undo before replace)

## 완료된 기능 (추가 71)
- Annotation export (Markdown report):
  - Rust Scene.export_comments_markdown(): 페이지별 그룹핑, Open/Resolved 구분, 답글 포함
  - WASM: Engine.export_comments_markdown() 바인딩
  - TS: Comments 패널 "↓ Export" 버튼 → comments-report.md 다운로드
  - format_comment 헬퍼: 작성자, 좌표, node ID, replies 포맷팅

## 완료된 기능 (추가 71)
- Annotation export (Markdown + JSON):
  - Rust: export_annotations_markdown() — 코멘트 (페이지별 그룹, open/resolved, 노드 이름 해석) + 노드 notes (tags, content)
  - Rust: export_annotations_json() — 구조화된 JSON (comments + notes, 페이지명/노드명 resolve)
  - WASM: export_annotations_markdown(), export_annotations_json() 바인딩
  - Node.kind_name() 헬퍼 추가, 기존 export_comments_markdown은 새 함수로 위임
  - TS: Comments 패널 "↓ MD" + "↓ JSON" 두 개 export 버튼

## 완료된 기능 (추가 72)
- PDF export:
  - 순수 TypeScript PDF 1.4 빌더 (zero-dependency)
  - 멀티페이지 지원: 모든 페이지 또는 현재 페이지만 내보내기
  - Canvas → JPEG (configurable quality) → DCTDecode PDF stream
  - 각 PDF 페이지 크기 = 캔버스 콘텐츠 bounding box
  - 옵션: scale (default 2x), quality (default 0.92), filename
  - 툴바 PDF 버튼 (SVG 옆), Cmd+Shift+E 단축키
  - Editor.downloadPDF(options?) async API
  - ui/pdf-export.ts: exportPDF(), buildPDF(), captureCurrentPage()

## 완료된 기능 (추가 73)
- Component documentation panel:
  - ComponentDoc 구조체: guidelines(markdown), tags, links, prop_docs, examples, changelog
  - PropDoc: name/description/default_display, ComponentExample: title/description/variant_key
  - Backward-compatible serde (#[serde(default)])
  - WASM: get_component_doc, set_component_description, set_component_guidelines, set_component_tags, add/remove_component_link, set/remove_component_prop_doc, add/remove_component_example, add_component_changelog, export_component_docs
  - Right pane "Docs" 탭: 컴포넌트/인스턴스 선택 시 문서 편집 UI
  - Description, Guidelines(markdown), Tags(chips), Property Docs, Examples, Links, Changelog 섹션
  - Export all docs as JSON
  - LLM Agent: 8개 도구 (get/set/add/remove component docs)

## 완료된 기능 (추가 74)
- Diff overlay (visual branch comparison):
  - Rust: VisualDiff + VisualDiffNode 구조체 (id, name, x, y, width, height, prev_*)
  - compute_visual_diff(): 두 BranchSnapshot 비교, 노드 위치/크기 포함
  - Scene: get_visual_diff(a, b), get_branch_visual_diff(id) — 두 브랜치 간 또는 브랜치 자체 변경 비교
  - WASM: get_visual_diff, get_branch_visual_diff 바인딩
  - Canvas overlay: green=added, yellow=modified, red=removed (translucent fill + dashed border)
  - Modified nodes: 이전 위치를 ghost outline으로 표시
  - Diff panel: 통계 요약, opacity 슬라이더, label 토글, 클릭 시 pan-to-node
  - Branch panel: 각 브랜치에 diff 버튼, active 브랜치에 self-diff 버튼
  - diff-overlay.ts 단일 파일 구현

## 완료된 기능 (추가 75)
- Figma → OpenSketch import (REST API):
  - Figma REST API (v1/files) 기반 파일 가져오기
  - URL 파싱: figma.com/file/ 또는 figma.com/design/ URL, 또는 file key 직접 입력
  - 노드 변환: Frame/Component/Instance/Group → Frame, Rectangle → Rect, Ellipse → Ellipse, Text → Text, Star/RegularPolygon → Star/Polygon, Section/Slice, Vector/BooleanOp/Line → Rect fallback
  - 속성 매핑: Fill (solid/linear/radial gradient), Stroke, Opacity, Visibility, Corner radius, Blend mode, Drop shadow, Layer blur
  - Text 속성: font family/size/weight/italic, text-align, line-height
  - Auto layout: Flex mode, gap, padding
  - 계층 구조: 재귀 children 변환 + reparent + position offset
  - Import modal UI: URL + token 입력, 진행 상태, token localStorage 저장
  - 툴바 Figma 로고 아이콘 버튼
  - Undo 통합 (import 전 push_undo)
  - ui/figma-import.ts 단일 파일 구현

## 완료된 기능 (추가 76)
- Shared component library (팀 간 공유):
  - Rust ComponentLibrary struct: id(String), name, version, components HashMap
  - ComponentStore: linked_libraries Vec, export_library, import_library, get_linked_libraries_info, unlink_library, sync_library
  - WASM: export_component_library, import_component_library, get_linked_libraries, unlink_library, sync_library
  - UI: component-library.ts — 모달 패널 (Export 선택→JSON, Import 파일→머지, Linked libraries 목록 + Sync/Unlink)
  - Editor: openComponentLibrary(), Cmd/Ctrl+Alt+L 단축키
  - Backward-compatible serde (#[serde(default)] on linked_libraries)

## 완료된 기능 (추가 77)
- Responsive token system:
  - ResponsivePreset 구조체: id, label, width, height, mode_mappings (collection→mode)
  - ResponsiveState: Scene-level presets 배열 + active preset tracking
  - set_preview_width(w): 뷰포트 너비에 맞는 프리셋 자동 매칭 → 컬렉션 모드 전환 → apply_variables
  - activate_preset(id): 수동 프리셋 활성화
  - WASM: 8개 바인딩 (add/remove/update_responsive_preset, set/remove_preset_mode_mapping, activate_responsive_preset, set_preview_width, get_responsive_presets, get_active_preset_id)
  - UI: responsive-tokens.ts 모달 패널 (프리셋 칩 바, 카드별 모드 매핑 드롭다운)
  - 기본 디바이스 프리셋 6종 (Mobile S/Mobile/Tablet/Laptop/Desktop/Wide)
  - 반응형 프리뷰와 통합: 각 브레이크포인트별 SVG 생성 시 토큰 모드 자동 전환
  - 툴바 ⚡ 버튼, Cmd+Alt+T 단축키
  - Backward-compatible serde

## 완료된 기능 (추가 78)
- Gesture-based interactions (모바일 프로토타입):
  - Rust: InteractionTrigger에 OnSwipeLeft/Right/Up/Down, OnLongPress, OnPinchIn/Out 추가
  - WASM: add_interaction trigger 파싱 확장 (swipe-left/right/up/down, long-press, pinch-in/out)
  - Properties panel: 11개 트리거 옵션 (Click, Hover, Press, Drag + 7 gestures)
  - Prototype viewer: touch event 기반 제스처 인식
    - Swipe: >50px 이동, <500ms, 4방향 판별
    - Long press: 500ms 타이머, 10px 이동 시 취소
    - Pinch: 두 손가락 거리 비율 (0.8 미만=in, 1.2 초과=out)
    - 짧은 탭(<10px, <300ms)은 OnClick으로 폴백
  - Hotspot 힌트: 색상 구분 (파란=click, 초록=gesture, 주황=hover) + 제스처 라벨 표시
  - Backward-compatible serde (기존 Interaction 데이터 호환)

## 완료된 기능 (추가 79)
- Vector network editing (enhanced):
  - Segment hit-testing: Rust closest_point_on_cubic/line + ternary search refinement
  - Segment splitting: de Casteljau split at click point (double-click on segment)
  - Bezier handle editing: drag handle control points, visual handle lines + dots overlay
  - Segment selection: click to select, Delete to remove, hover highlight
  - Connection preview: dashed line from selected vertex to mouse cursor
  - Auto-connect: click empty space → add vertex + auto-connect from selected vertex
  - WASM: vn_split_segment, vn_hit_test_segment 바인딩 추가

## 완료된 기능 (추가 80)
- Multi-user permissions (역할 기반 접근 제어):
  - Rust permissions.rs: Role (Owner/Editor/Viewer), ProjectUser, Lock, PermissionStore
  - 노드/페이지별 잠금 (lock/unlock), 만료 지원, Owner 오버라이드
  - WASM: 14개 바인딩 (set_current_user, perm_add/remove_user, perm_set/get_role, perm_get_users, perm_can_edit_node/page, perm_lock/unlock_node/page, perm_get_locks, perm_get_node/page_lock, perm_cleanup_expired)
  - UI: Right pane "Perms" 탭 — 팀 멤버 관리, 역할 변경, 잠금 현황, 선택 노드 잠금/해제
  - Backward-compatible (기본 "local" owner 유저)

## 완료된 기능 (추가 81)
- Canvas presentation mode (풀스크린 슬라이드쇼):
  - 페이지 기반 프레젠테이션 (각 페이지 = 1 슬라이드)
  - 트랜지션: None, Fade, Slide Left/Right/Up, Zoom (ease 400ms)
  - 네비게이션: ←/→, Space, PageUp/Down, Home/End, 캔버스 좌/우 클릭
  - 발표자 노트: N 키 토글, 현재 페이지 top-level 노드 notes 수집 표시
  - 컨트롤 바: 하단 auto-hide, 프로그레스 바 (클릭 seek), 슬라이드 카운터, 트랜지션 선택
  - F 키 브라우저 풀스크린, Esc 종료
  - 툴바 프레젠테이션 아이콘 버튼, Cmd+Shift+Enter 단축키
  - Dynamic import (코드 스플릿), 뷰포트/페이지 복원

## 완료된 기능 (추가 82)
- Component analytics (사용 통계):
  - Rust Scene::get_component_analytics(): 모든 페이지 노드 순회, Instance 카운트
  - ComponentStat: component_id, name, instance_count, locations(node_id/name/page), variant_usage
  - 미사용 컴포넌트 감지 (instance_count == 0)
  - WASM: component_analytics() -> JSON
  - UI: component-analytics.ts — 플로팅 모달 (Cmd/Ctrl+Alt+A)
  - 요약 카드 (Components/Instances/Unused), 컴포넌트별 인스턴스 수, variant 칩
  - 클릭 시 locations 토글, location 클릭 시 해당 페이지/노드로 이동+선택
  - 미사용 컴포넌트 경고 섹션

## 완료된 기능 (추가 83)
- Smart component suggestions (반복 패턴 감지 → 컴포넌트 추출 제안):
  - Rust smart_component.rs: 3가지 탐지 전략
    - Structural duplicates: 서브트리 fingerprint 비교 (kind + children 재귀)
    - Sibling patterns: Frame 내 동일 구조 자식 반복 (리스트/그리드 아이템)
    - Visual clones: 같은 kind + 유사 크기(8px 버킷) + 같은 fill + 같은 children 수
  - Confidence scoring: count/depth/fill 일치율 기반 (0.0-1.0)
  - Deduplication: 고신뢰도 suggestion이 저신뢰도를 포함하면 제거
  - WASM: suggest_components() → JSON
  - UI: smart-suggestions.ts — 플로팅 모달 (Cmd/Ctrl+Alt+S)
  - Suggestion 카드: 이름, 이유, 신뢰도 %, 추천 컴포넌트명, 인스턴스 수
  - Select All 버튼으로 해당 노드들 선택

## 완료된 기능 (추가 84)
- Cursor chat bubbles (실시간 커서 채팅):
  - `/` 키로 채팅 입력 모드 진입: 커서 위치에 인라인 input 필드 표시
  - Enter → 메시지 전송 (collab WebSocket broadcast + 로컬 즉시 표시)
  - Escape → 입력 취소, blur → 자동 닫힘
  - 말풍선 렌더링: Canvas 위 흰색 버블 + 유저 색상 accent bar, word wrap 지원
  - 타이핑 인디케이터: 입력 중 "···" 말풍선 표시
  - 자동 사라짐: 4초 표시 + 0.5초 fade out
  - collab.ts: sendChat, sendTyping, ChatMessage type, onChat/onTyping 콜백
  - cursor-presence.ts: ChatBubble, drawChatBubble, setLocalChat/setLocalTyping
  - editor.ts: openCursorChat/closeCursorChat, handleRemoteChat/handleRemoteTyping
  - collab 서버 없이도 로컬 채팅 즉시 표시

## 완료된 기능 (추가 85)
- Design handoff mode:
  - Handoff 탭 (기존 Inspect 탭 리브랜딩+확장): packages/app/src/ui/handoff-panel.ts
  - Design Spec Summary: 크기/위치/회전/투명도/radius/fill(hex+RGB swatch)/stroke/font 속성/layout 정보
  - Code gen tabs: CSS / Tailwind / SwiftUI / Kotlin / SVG (5개 언어)
  - Tailwind 코드젠: 유틸리티 클래스 생성 (size, position, radius, color, text, layout 등)
  - Asset export: PNG @1x, PNG @2x, SVG 다운로드
  - Spacing overlay toggle: Alt+Hover 측정 모드 on/off
  - Design tokens export: W3C DTCG, Style Dictionary, Tailwind Config

## 완료된 기능 (추가 86)
- Text list styles:
  - ListStyle enum: None, Bullet, Numbered, Dash, Checkbox, CheckboxChecked
  - indent_level: u8 (0-10), 인덴트 오프셋 = level × font_size × 1.5
  - Bullet: depth별 마커 변경 (•, ◦, ▪), Numbered: 단락별 자동 번호
  - Canvas 렌더링: 각 단락 첫 줄에 prefix 렌더, indent offset 적용
  - SVG export: prefix 문자열 포함, indent 반영
  - WASM: set_list_style, get_list_style, set_indent_level, get_indent_level
  - Properties panel: List 드롭다운 (6 옵션) + Indent 숫자 입력
  - Handoff panel: list-style-type + padding-left CSS 코드젠
  - Backward-compatible serde (기본값 None/0)

## 완료된 기능 (추가 87)
- Text transform & advanced typography:
  - TextTransform enum: None, Uppercase, Lowercase, Capitalize — apply() 메서드로 텍스트 변환
  - text_indent: f64 — 첫 줄 들여쓰기 (픽셀, -500~500 범위)
  - OpenTypeFeatures struct: ligatures, old_style_numerals, small_caps, tabular_numerals
  - Canvas 렌더링: text_transform.apply() 적용, text_indent 첫 줄 오프셋, measure_text_nodes에서도 transform 적용
  - SVG export: text-transform CSS, text-indent CSS, font-feature-settings CSS, font-variant: small-caps
  - WASM: set/get_text_transform, set/get_text_indent, set_opentype_ligatures/old_style_numerals/small_caps/tabular_numerals, get_opentype_features
  - Properties panel: Text Transform 드롭다운 (None/Uppercase/Lowercase/Capitalize), Text Indent 숫자 입력, OpenType 토글 (Ligatures/Small Caps/Old-style Nums/Tabular Nums)
  - Handoff panel: text-transform, text-indent, font-feature-settings CSS 코드젠 + Tailwind 클래스
  - Backward-compatible serde (기본값 None/0.0/default features)

## 완료된 기능 (추가 88)
- Layers panel search/filter:
  - 헤더에 돋보기 아이콘 토글 버튼 (검색 바 show/hide)
  - 텍스트 입력 시 노드 이름/종류 실시간 필터링
  - 매칭 노드 + 조상 노드만 표시, 검색 중 트리 자동 확장
  - 매칭 텍스트 하이라이트 (파란 마크)
  - 매칭 수 표시 ("N matches" / "No matches")
  - Escape 키로 검색 닫기 + 필터 초기화
  - Ctrl/Cmd+F 단축키 (layers panel 내)

## 완료된 기능 (추가 89)
- Keyboard-driven node nudge:
  - Arrow keys: 선택된 노드 1px 이동
  - Shift+Arrow: 10px 이동
  - Alt+Arrow: 0.1px sub-pixel nudge
  - 멀티 셀렉션 지원, Undo 통합

## 완료된 기능 (추가 89)
- Multi-edit mode (Edit All Matching Layers):
  - Rust: select_same_name, select_same_name_and_kind (Scene 메서드)
  - WASM: select_same_name, select_same_name_and_kind 바인딩
  - Context menu: "Edit All Matching Layers" (같은 이름+종류 노드 전체 선택)
  - Context menu: "Select All with Same Name" (같은 이름 노드 전체 선택)
  - 선택 후 Properties panel에서 일괄 편집 (기존 멀티 셀렉션 편집 활용)
  - Backward-compatible (신규 API만 추가)

## 완료된 기능 (추가 91)
- Table node:
  - NodeKind::Table { rows, cols, cells, col_widths, row_heights }
  - TableCell: row, col, row_span, col_span, content, fill, text_align
  - Canvas 렌더링: 셀 그리드, 배경색, 텍스트 (L/C/R align), cell merge 지원
  - SVG export: <rect>/<text> 그룹으로 내보내기
  - WASM: add_table, table_set_cell, table_get_cell, table_set_cell_fill, table_merge_cells, table_add_row/col, table_remove_row/col, table_set_col_width/row_height, table_import_csv, table_sort, table_get_info
  - CSV 가져오기: 파싱 → 자동 행/열 리사이즈 → 셀 채우기
  - 정렬: 컬럼 기준 stable sort (오름/내림차순, 숫자 인식)
  - 셀 병합: merge_cells(row, col, row_span, col_span)
  - 툴바: Table 버튼 (B 단축키)
  - Properties panel: Rows/Cols 표시, +/- Row/Col, CSV Import, Sort ↑/↓
  - find_replace.rs: Table 케이스 추가 (빌드 오류 수정)
  - Backward-compatible serde
  - 셀 더블클릭 인라인 편집: row/col 좌표 계산 → input overlay, Tab→다음 셀, Enter/Esc 완료
  - CSV 붙여넣기: Cmd+V로 테이블 선택 시 TSV/CSV 자동 감지 → table_import_csv

## 완료된 기능 (추가 92)
- Pixel preview mode:
  - Alt+P 토글, zoom bar에 픽셀 미리보기 버튼
  - imageSmoothingEnabled = false로 anti-aliasing 비활성화
  - Pixel grid overlay: zoom ≥ 8x에서 CSS 픽셀 그리드 표시, adaptive opacity
  - Device frame simulation: 10개 프리셋 (iPhone 15 Pro, Pixel 8, iPad Pro 등)
  - Right-click → device picker dropdown (카테고리별 분류: phone/tablet/desktop)
  - DPR info 표시, 디바이스 영역 외부 dimming (40% black)
  - UI overlay (rulers 등)는 smoothing 유지
  - 순수 TypeScript 구현 (ui/pixel-preview.ts)

## 완료된 기능 (추가 93)
- Unified spotlight search (Cmd+K / Cmd+P):
  - 노드/페이지/컴포넌트/변수 통합 검색
  - 카테고리 필터 (Tab 키 또는 클릭): All/Node/Page/Component/Variable
  - 색상 코딩 아이콘 + 카테고리 뱃지 (파랑/골드/보라/초록)
  - 결과 카테고리별 그룹 헤더
  - Node → select + zoom, Page → switch + zoom-to-fit, Component → find instance + zoom
  - Variable 검색: collection 이름/변수 이름 모두 매칭
  - 키보드: ↑↓ 네비게이트, Enter 선택, Tab 필터 순환, Escape 닫기

## 완료된 기능 (추가 94)
- Batch export (ZIP):
  - Cmd+Shift+E 또는 툴바 버튼으로 배치 익스포트 다이얼로그 열기
  - 페이지 + 노드 체크박스 리스트 (선택된 노드 자동 체크)
  - 항목별 포맷(PNG/SVG) + 배율(0.5x~4x) 설정
  - Quick actions: Select All/None, All PNG/SVG, 글로벌 스케일, 프리셋 적용
  - fflate ZIP 압축 → 자동 다운로드
  - 페이지 내보내기: 임시 페이지 전환 → 복원
  - 파일명 중복 방지, sanitize
  - batch-export.ts 단일 파일 구현

## 완료된 기능 (추가 95)
- Variable-width stroke:
  - PathPoint.stroke_width 필드 (0.0 = inherit from stroke, >0 = custom width at point)
  - Canvas 렌더링: polyline flattening → left/right offset curves → filled outline
  - SVG export: variable-width paths → filled `<path>` outline
  - WASM: path_set/get_point_stroke_width, has_variable_stroke, path_get_stroke_profile
  - Properties panel: Variable Stroke 토글, Start/End width 입력, profile preview canvas
  - Backward-compatible serde (기존 PathPoint 호환)

## 완료된 기능 (추가 96)
- Gradient mesh fills:
  - FillType::GradientMesh { mesh: MeshGradient } 추가
  - MeshGradient { rows, cols, points: Vec<MeshPoint> } — 2D 격자 색상 보간
  - MeshPoint { x, y, color } — normalized 좌표 (0~1) + Color
  - 기본 2×2 grid (4코너: indigo/emerald/amber/red)
  - Canvas 렌더링: 셀별 8×8 subdivision bilinear color interpolation (tessellation)
  - SVG export: 래스터 폴백 (rect 그리드)
  - WASM: set_fill_gradient_mesh_at, set_fill_gradient_mesh_default_at, mesh_set_point_color, mesh_set_point_position, mesh_add_row/col, mesh_remove_row/col, mesh_get_info
  - Properties panel: Fill type "Mesh" 선택, Grid 크기 표시, +/-Row/Col 버튼, 포인트별 color swatch grid
  - Mesh edit mode: 더블클릭 → 진입, Escape → 종료
    - 포인트 드래그로 위치 이동
    - 선택된 포인트 클릭 → native color picker
    - Grid 라인 overlay (dashed white)
    - 포인트 핸들 (색상 swatch + 선택 링)
  - color_palette.rs: mesh 포인트 색상 추출 지원
  - Backward-compatible serde

## 완료된 기능 (추가 97)
- Motion path animation:
  - AnimProperty::MotionPath: 노드가 Path 노드를 따라 이동, value = progress (0.0–1.0)
  - MotionPathConfig: path_node_id, orient_to_path (경로 접선 방향 자동 회전), rotation_offset
  - AnimationTrack.motion_path: Option<MotionPathConfig> (MotionPath 트랙 전용)
  - Scene anim_apply: path_utils로 경로 길이 계산 → progress 거리에서 좌표+접선 샘플링
  - 노드 중심을 경로 위 지점에 배치, orient_to_path 시 접선 각도로 회전
  - WASM: anim_set_motion_path, anim_update_motion_path, anim_remove_motion_path, anim_get_motion_path, get_path_nodes
  - Timeline UI: 🛤 버튼으로 모션 패스 부착/해제, 경로 선택, duration 입력, orient 토글
  - 기존 playback/looping/easing/snapshot 복원과 완전 호환
  - Backward-compatible serde

## 완료된 기능 (추가 98)
- Node-level event system (JS callback bindings):
  - EventTrigger enum: onClick, onDoubleClick, onHover, onHoverEnd, onPress, onRelease, onDrag, onDragEnd, onFocus, onBlur
  - NodeEvent struct: id, trigger, handler (JS code), enabled, label
  - Node.events: Vec<NodeEvent>, backward-compatible serde
  - WASM: add_node_event, remove_node_event, update_node_event_handler, update_node_event_trigger, set_node_event_enabled, get_node_events, get_node_event_count, get_all_node_events
  - EventRuntime: sandboxed JS execution with node API (setProperty, setVisible, setOpacity, setPosition, setSize, setFillColor, setText, setRotation, getNode, navigateTo, log, delay)
  - Prototype viewer: click/hover/press/drag/dblclick event firing, hover tracking, drag state
  - Event hotspot hints: orange dotted border + ⚡ icon in prototype viewer
  - Properties panel: "Events" section (add/remove, trigger dropdown, JS code editor, enable toggle)

## 완료된 기능 (추가 99)
- Auto-animate between pages (Smart Animate) — Rust 엔진 + TS 프로토타입 뷰어 통합:
  - Rust: auto_animate.rs — NodeSnapshot (rel_x/y, width, height, rotation, opacity, corner_radius, blur, fill RGBA, stroke_width)
  - Scene.compute_auto_animate(from, to): 재귀적 descendant 매칭 by name, AnimatePair + removed/added 분류
  - WASM: compute_auto_animate(from_frame_id, to_frame_id) → JSON
  - TS: prototype-viewer.ts performSmartAnimate — 엔진 데이터 기반 풀 프로퍼티 보간
  - 매칭 노드: position, size, rotation (canvas transform), opacity, corner_radius (roundRect clip) 보간
  - 비매칭 노드: removed → fade out, added → fade in
  - 기존 Dissolve/SlideIn/SlideOut/Push 전환과 호환
  - icons.ts 중복 키 수정 (alignLeft 등)

## 완료된 기능 (추가 100)
- 3D perspective transform (이미 구현 완료 확인):
  - Perspective3D struct: rotate_x/y/z, perspective distance, origin_x/y
  - WASM: set/get/clear_perspective, set_perspective_rotation/distance/origin
  - Canvas 렌더링: DOMMatrix 3D 투영 + strip-based texture warp
  - SVG export: CSS transform: perspective() rotateX/Y/Z()
  - Inspect panel: CSS 코드 생성
  - Properties panel: 3D Transform 섹션 (Enable 토글, X/Y/Z 슬라이더, distance, origin)

## 완료된 기능 (추가 101)
- Figma import 개선:
  - Constraints import: Figma constraints → OpenSketch constraints 자동 매핑
  - Rotation import: Figma rotation → OpenSketch rotation 변환
  - Vector path import: VECTOR 노드를 fillGeometry SVG path data → Path 노드로 변환 (M/L/C/Z + relative 지원)
  - Prototype/Interaction import: Figma reactions → OpenSketch interactions (trigger/action/transition/duration)
  - ID mapping: Figma node ID → OpenSketch node ID 추적으로 cross-reference 지원

## 완료된 기능 (추가 102)
- Design token export UI + CSS Variables 포맷:
  - CSS Variables 포맷 추가: :root { --color-*, --font-family-*, --font-size-* ... } + variable collections
  - Rust: TokenFormat::CssVariables, export_css_variables() 함수
  - WASM: "css-variables" | "css" format 파라미터 지원
  - TS Editor: downloadDesignTokens() CSS mime type + .css 확장자 지원
  - Design Token Export 모달 패널 (design-token-export.ts):
    - 4개 포맷 카드 (W3C DTCG, Style Dictionary, Tailwind CSS, CSS Variables)
    - 라이브 프리뷰 (syntax-highlighted pre block)
    - 클립보드 복사 버튼
    - 다운로드 버튼
    - Escape / 오버레이 클릭 닫기
  - 툴바 Design Token Export 버튼 (☀ 아이콘)
  - SVG import stub 수정 (깨진 미완성 파일 → 컴파일 가능 stub)

## 완료된 기능 (추가 103)
- Canvas comments threading with @mention — notification badge:
  - Comments 탭 버튼에 미해결 코멘트 수 빨간 배지 자동 표시
  - comments-changed 이벤트 연동 실시간 업데이트
  - (기존 구현 확인 완료: @mention autocomplete, unresolved/mentions filter, assignee, parse_mentions, set_comment_assignee 모두 이미 구현됨)

## 완료된 기능 (추가 104)
- SVG import (full parser):
  - Rust: svg_import.rs — roxmltree 기반 SVG 파싱
  - 지원 요소: rect, circle, ellipse, line, polyline, polygon, path, text, g (group), image
  - Path 파싱: M/m, L/l, H/h, V/v, C/c, S/s, Q/q (cubic 변환), A/a (simplified), Z/z
  - Style: fill (solid + gradient url(#id)), stroke (color/width/dash/cap/join), opacity
  - Gradient defs: linearGradient, radialGradient with stops
  - Color: hex (#rgb/#rrggbb/#rrggbbaa), rgb()/rgba(), named colors (12종)
  - Transform: translate() + rotate() 파싱 적용
  - Inline style 파싱 (style="...")
  - WASM: import_svg(svg_text, offset_x, offset_y) → JSON node IDs
  - TS: Editor.importSVG(text), importSVGFile() (파일 피커)
  - 툴바 Import SVG 버튼, 드래그&드롭 SVG 파일 지원
  - Undo 통합, 자동 선택

## 완료된 기능 (추가 105)
- Canvas recording → Video export (WebM & GIF):
  - WebM: MediaRecorder + canvas.captureStream(), configurable bitrate (quality 0-1)
  - GIF: Custom GIF89a encoder — median-cut color quantization (256 colors), LZW compression, Netscape looping
  - Offscreen rendering: 각 프레임을 seek → offscreen canvas (1280×720) 렌더링
  - Auto viewport fitting: scene bounds 기반 zoom/pan 자동 계산
  - Progress modal: 풀스크린 오버레이, 프로그레스 바, phase 표시
  - UI: recorder bar에 "WebM" / "GIF" 버튼 (recording 데이터 있을 때 표시)
  - State preservation: export 전후 scene + viewport 저장/복원
  - Files: video-export.ts (encoder), canvas-recorder.ts (UI 통합)

## 완료된 기능 (추가 106)
- AI code-to-design (HTML/CSS → 노드 자동 생성):
  - DOMParser 기반 HTML 파싱 + <style> 블록 + inline style 병합
  - CSS 파싱: class/id/tag selector 매칭, 30+ named colors, hex/rgb/rgba 지원
  - 노드 생성: container → Frame (auto-layout), text → Text, img → Image, input/button → Frame+label
  - Flexbox 매핑: display:flex, flex-direction, gap, align-items, justify-content → OpenSketch auto-layout
  - 스타일 매핑: background-color, color, border-radius, border, opacity, font-*, text-align, line-height, padding
  - 자동 크기 계산: children 기반 컨테이너 auto-size
  - 예제 스니펫 4개: Card, Nav, Form, Hero
  - 모달 UI: 코드 에디터 + 라이브 노드 카운트 프리뷰
  - 툴바 Code 아이콘 버튼 + Cmd+Shift+D 단축키
  - Undo 통합, 선택 자동 설정
  - Rust 엔진 리팩토링: code_to_design.rs (순수 Rust HTML/CSS 파서 → WASM 바인딩)
  - CSS `<style>` 블록 파서, Flexbox/Grid 지원, box-shadow/overflow/min-max 크기 매핑

## 완료된 기능 (Conditional visibility — 이미 구현 확인)
- Conditional visibility (변수 기반 노드 표시/숨김):
  - Rust VisibilityCondition + WASM set/get/clear_conditional_visibility
  - TS properties-panel UI

## 완료된 기능 (추가 107)
- AI-powered design polish (one-click design cleanup):
  - Rust `design_polish.rs`: 6가지 분석 규칙 (spacing normalization, corner radius standardization, near-miss color merge, padding symmetrization, 4px grid size snap, pixel position snap)
  - WASM: `analyze_polish()` → JSON fixes, `apply_polish(fix_ids_json)` → 선택 적용
  - Modal UI: 카테고리별 그룹, 체크박스 선택, before/after 프리뷰, 노드 선택 링크
  - LLM agent tools: `analyze_polish` + `apply_polish`
  - 툴바 sparkle 아이콘 버튼
  - Undo 통합

## 완료된 기능 (추가 108)
- Design system health dashboard (enhanced):
  - Rust design_health.rs: HealthReport 구조체 — score, components, styles, colors, typography, issues
  - Overall health score (0–100): component adoption/unused/detached, style adoption, hardcoded colors, near-duplicates 가중 감점
  - Component health: total/instances/unused/detached, adoption rate (instances vs raw shapes)
  - Style health: color/text style 사용 추적, unused 감지, adoption rate
  - Color health: unique color count, hardcoded colors (≥2회 style 없이 사용), near-duplicate 감지 (distance <15)
  - Typography health: font family 사용량, font size 인벤토리, 미표준 sizes (text style에 없는)
  - Issues: severity (error/warning/info), category, suggestion 포함
  - WASM: get_design_health() → JSON, remove_unused_color_styles(), remove_unused_text_styles()
  - UI: 6탭 모달 (Overview/Components/Styles/Colors/Typography/Issues)
  - 스타일 cleanup 버튼, 노드 네비게이션, 실시간 새로고침
  - 툴바 🩺 (pulse icon) 버튼

## 완료된 기능 (추가 109)
- Smart object replace:
  - Rust smart_replace.rs: SimilarityThreshold (ratio + size), find_similar_nodes (aspect ratio/area 유사도), replace_node_content (fills/strokes/opacity/corner_radius/shadows/blur/blend_mode/Image src 복사)
  - WASM: find_similar_nodes(target_id, ratio_threshold, size_threshold), replace_with_node(source_id, target_ids_json), replace_selection_with(source_id)
  - UI: smart-replace.ts 모달 (유사 노드 목록, 유사도%, 체크박스 선택, Replace Selected/All 버튼)
  - 툴바 swap 아이콘 버튼, Cmd+Shift+H 단축키
  - Context menu: "Smart Replace…" (단일 노드 선택 시)
  - Undo 통합

## 완료된 기능 (추가 110)
- Canvas presentation annotations:
  - 프레젠테이션 모드에서 실시간 드로잉/하이라이트 오버레이
  - 5가지 도구: Laser pointer (1), Pen (2), Highlighter (3), Arrow (4), Eraser (5)
  - 7색 컬러 스와치, quadratic curve 스무딩
  - Undo (Cmd+Z), Clear (C), A키/✏️ 버튼 토글
  - 슬라이드 전환 시 자동 클리어, HiDPI 지원
  - 플로팅 툴바 (도구/색상 선택)
  - presentation-annotations.ts 단일 파일, presentation-mode.ts 통합

## 완료된 기능 (추가 111)
- Smart animate between pages (프레젠테이션 모드):
  - Rust: Scene.compute_auto_animate_pages(from_page_id, to_page_id) — 페이지 간 노드 이름 매칭
  - WASM: compute_auto_animate_pages 바인딩
  - 매칭된 노드: position/size/rotation/opacity/corner_radius 보간, 클립 라운드 렉트
  - 미매칭 노드: fade in/out
  - 매칭 없으면 자동 fade fallback
  - 프레젠테이션 모드 트랜지션 선택에 "Smart animate" 옵션 추가
  - 500ms ease-in-out cubic 애니메이션

## 완료된 기능 (추가 — Offline-first Sync)
- IndexedDB 스토리지 (offline-store.ts): idb-keyval 패턴 직접 구현, DB "opensketch" / store "files"
- AutoSave IndexedDB 마이그레이션: localStorage → IndexedDB 자동 전환, 비동기 API
- Service Worker (public/sw.js): cache-first 정적 에셋, 네비게이션 fallback, 버전 기반 캐시 관리
- Sync Queue (sync-queue.ts): 오프라인 ops 큐잉, online 복귀 시 자동 flush, 서버 sync stub
- UI 인디케이터 (ui/sync-status.ts): 🟢 Online / 🔴 Offline + pending count, 자동 숨김

## 완료된 기능 (추가 112)
- Multiplayer conflict resolution (CRDT 기반 씬 동기화):
  - Rust crdt.rs: VectorClock (site_id → counter), CRDTDoc (op log, pending, tombstones, LWW state)
  - Operation + OpKind: AddNode, RemoveNode, UpdateProperty (24+ PropKey), MoveNode, ReparentNode, ReorderChildren, Page ops
  - LWW conflict resolution: timestamp wins, site_id tiebreak (lexicographic)
  - TombstoneSet: delete wins over concurrent property updates
  - MergeResult: applied/rejected op tracking
  - Op log compaction (max 10,000, halve on overflow)
  - WASM: 13개 바인딩 (set/get_site_id, get_vector_clock, get/take_pending_operations, ack_operations, apply_remote_operations, crdt_add/remove_node, crdt_update_property, crdt_move/reparent_node, get_crdt_state)
  - apply_crdt_op_to_scene: remote ops → actual scene mutation (add/remove/update/move/reparent/reorder/page ops)
  - apply_prop_value: 24+ property keys → node field mutation (fills, strokes, shadows as JSON blobs)
  - TS sync-queue.ts: CRDTOperation/MergeResult types, enqueueCRDT, onCRDTSync, flush CRDT ops
  - TS collab.ts: sendCRDTOps, onRemoteCRDTOps callback, remote_crdt_ops protocol message
  - specs/COLLABORATION.md 업데이트
  - Backward-compatible (기존 full_replace 경로 유지, CRDT는 opt-in)

## 완료된 기능 (추가 113)
- Smart color accessibility fix:
  - Rust design_lint.rs: HSL 기반 색상 보정 — hue/saturation 보존하면서 lightness binary search로 WCAG 대비율 충족하는 최소 변경 색상 계산
  - 양방향 탐색 (darker/lighter) 중 원본에 가까운 결과 선택, fallback black/white
  - A11yFix struct: node_id, current/suggested color, current/fixed ratio, RGB값
  - get_accessibility_fixes(): 씬 전체 text 노드 contrast 위반 자동 탐지 + 수정 색상 계산
  - WASM: get_a11y_fixes() → JSON, apply_a11y_fix(node_id, r, g, b), apply_all_a11y_fixes() → count
  - UI: 이슈별 "Fix" 버튼 (색상 프리뷰 current→suggested + 비율 표시)
  - UI: 헤더 "Fix All (N)" 버튼으로 일괄 수정
  - Undo 통합 (push_undo)

## 완료된 기능 (추가 114)
- Figma plugin compatibility layer:
  - figma-compat.ts: Figma Plugin API subset 에뮬레이션 (createRectangle/Ellipse/Frame/Text/Star/Polygon, group, currentPage, viewport, notify, closePlugin, showUI, loadFontAsync, on/once/off)
  - FigmaNode proxy: x/y/width/height/name/opacity/visible/locked/rotation/cornerRadius/fills/strokes/strokeWeight/characters/fontSize/children/parent/remove/resize/appendChild
  - FigmaPage: selection get/set, children, findAll, findOne
  - FigmaViewport: zoom, center, scrollAndZoomIntoView
  - showUI: iframe 샌드박싱 + 메시지 브릿지 (pluginMessage)
  - runFigmaPlugin(): 코드 문자열 → Function scope에서 figma 객체와 함께 실행
  - Plugin panel UI: "▶ Run Figma Plugin" 버튼 → 코드 에디터 모달, Run/Stop 기능
  - 샘플 Color Grid plugin (Figma/OpenSketch 양쪽 호환)
  - specs/PLUGINS.md 업데이트

## 완료된 기능 (추가 115)
- Collaborative whiteboard mode:
  - Rust whiteboard.rs: WhiteboardState (active, timer, voting_enabled), WhiteboardTimer (duration/remaining/running)
  - Scene.whiteboard_state 필드 추가, backward-compatible serde
  - WASM: toggle_whiteboard_mode, start/stop/reset_timer, tick_timer, get_timer_state, set/get_voting_enabled, get_whiteboard_active
  - Whiteboard mode toggle: W 단축키, 툴바 버튼
  - 모드 진입 시: 배경 도트 그리드 (CSS radial-gradient), 간소화 툴바 (select/sticky/pen/text만)
  - Timer 위젯: 좌상단 floating panel, 시간 설정(1-60분)/시작/정지/리셋, 30초 미만 빨간색, 0초 플래시
  - Voting dots: V 키 토글, 캔버스 클릭 시 유저별 색상 dot 배치 (4px circle + white border)
  - WhiteboardMode 클래스 (whiteboard-mode.ts), editor.ts 통합

## 완료된 기능 (추가 116)
- Freehand drawing tool (Whiteboard mode enhancement):
  - ToolType "freehand" 추가 (D 단축키)
  - 마우스/펜 드래그로 자유 곡선 그리기 → Path 노드 생성
  - Catmull-Rom → Bezier 스무딩 (tension 0.3), 최대 100포인트 다운샘플링
  - 최소 거리 필터링 (2px) — 과도한 포인트 방지
  - Whiteboard mode 도구 팔레트에 freehand + connector 추가
  - 툴바에 Freehand 버튼, crosshair 커서
  - icons.ts: freehand, whiteboard, timer, vote 아이콘 추가

## 완료된 기능 (추가 117)
- Responsive Email Template Builder
  - `email_export.rs`: Frame→table, Text→p, Rect→div, Image→img, 자동 inline styles
  - Flex Row → 단일 tr에 td 나열, Flex Column → 각 child가 tr
  - XHTML Transitional DOCTYPE, Outlook 조건부 주석, MSO 네임스페이스
  - 툴바에 이메일 아이콘 버튼 → export_email_html() → .html 다운로드

## 완료된 기능 (추가 118)
- Snapshot testing (visual regression):
  - Rust snapshot_test.rs: SnapshotStore, Snapshot metadata (id, name, target_type, target_id, width, height, timestamp, hash)
  - pixel_diff(): RGBA 버퍼 비교, channel tolerance (anti-aliasing 보정), DiffResult (total/changed/percentage/passed/threshold/max_channel_diff)
  - generate_diff_image(): 변경 픽셀 빨간 하이라이트 + 미변경 dimmed 표시
  - hash_image_data(): FNV-1a 해시
  - WASM: snapshot_register/remove/list/list_for_target/diff/diff_image/set_threshold/get_threshold/set_channel_tolerance/hash (10개 바인딩)
  - IndexedDB 스토리지: 픽셀 데이터 브라우저 저장 (opensketch-snapshots DB)
  - UI: 플로팅 패널 (⌘⌥N), 캡처/비교/삭제, threshold 설정
  - Diff report 모달: Pass/Fail 상태, diff %, 변경 픽셀 수, 3탭 뷰 (Diff/Baseline/Current)
  - 툴바 카메라 아이콘 버튼
  - Backward-compatible (Engine에 snapshot_store 필드 추가)

## 완료된 기능 (추가 119)
- Voice-controlled design:
  - Web Speech API 기반 음성 인식 (voice-control.ts)
  - 직접 명령 파싱 (undo/redo/delete/select all/deselect/zoom fit/zoom 100)
  - 복잡한 명령은 LLM agent 패널로 전달 ("[Voice] ..." prefix)
  - 툴바 마이크 버튼, ⌘⇧V 단축키
  - 실시간 transcript 표시 (listening/processing/done/error 상태)
  - 빨간 펄스 애니메이션 (녹음 중)

## 완료된 기능 (추가 120)
- Smart auto-layout wrapping (Figma wrap):
  - compute_flex에 FlexWrap::Wrap 로직 구현 — children이 main axis 초과 시 자동 줄바꿈
  - 라인별 cross-axis 크기 계산 (각 wrap line이 독립 높이)
  - 라인별 justify/align 계산 (SpaceBetween/Around/Evenly 등 모두 지원)
  - Fill sizing 라인별 분배
  - Properties panel: Wrap 토글 버튼 (set_flex_wrap WASM 호출 연결)
  - Breakpoint wrap 오버라이드 기존 지원

## 완료된 기능 (추가 — Design System Versioning)
- Design system versioning:
  - StyleVersion struct (id, tag, timestamp, description, snapshot of color+text styles)
  - StyleDiffEntry struct (kind, change, style_id, name, details)
  - StyleStore versioning: create_version, list_versions, remove_version, rollback_to_version, diff_versions, diff_with_current
  - Max 50 versions, auto-trim oldest, auto-save before rollback
  - WASM: 6 bindings (style_version_create/list/remove/rollback/diff/diff_current)
  - UI: style-versioning.ts — Properties panel empty state "Style Versions" section
  - Create version modal (tag + description), version list (newest first), diff modal (color-coded changes), rollback confirm, delete
  - Properties panel integration via import in properties-panel.ts
  - Backward-compatible serde (#[serde(default)] on versions/next_version_id)
  - Diff: color/text별 added/removed/modified 감지, 속성 변경 상세 (color, font, size, weight 등)
  - WASM: 6 bindings (style_version_create/list/remove/rollback/diff/diff_current)
  - UI: style-versioning.ts — Properties empty state에 패널, 버전 목록, diff 모달
  - Backward-compatible serde (#[serde(default)])

## 완료된 기능 (추가 — Design Token Theme Switching)
- Design token theme switching:
  - Rust: token.rs — TokenStore, Theme, Token, TokenValue, TokenBinding, TokenProperty
  - 테마 CRUD (create/rename/delete), 토큰 관리 (add/remove/update per theme)
  - 노드 바인딩: fill, stroke, opacity, corner_radius를 토큰 이름에 바인딩
  - apply_token_theme(): 테마 전환 시 모든 바인딩된 노드 자동 업데이트
  - Scene에 TokenStore 통합 (serde, backward-compatible)
  - WASM: 15 bindings (token_create/remove/rename/set_active/get_active/get_themes/add/remove/update/get_tokens/bind/unbind/get_bindings/export/import_json)
  - UI: token-panel.ts — 테마 스위처 (Properties empty state) + 노드별 토큰 바인딩 섹션
  - Import/Export JSON 지원

## 완료된 기능 (추가 121)
- Design review & quiz mode:
  - Rust: get_scene_analysis() — 노드 수, 타입 분포, fill/stroke/layout/notes 통계, component/instance 카운트
  - design-review.ts: 순수 TS 체크리스트 (naming, consistency, layout, components, accessibility, complexity)
  - quiz-panel.ts: 인터랙티브 퀴즈 UI (씬 기반 문제 + 디자인 지식 문제, 진행률/채점/해설)
  - Right pane "Quiz" 탭, LLM agent tools (generate_design_review, generate_quiz, get_scene_analysis)

## 완료된 기능 (추가 122)
- Smart tidy up:
  - Rust Scene.tidy_up(): dominant axis 감지 (spread 기반), median gap → nice number (4px 배수) 라운딩
  - Main axis: uniform gap으로 distribute, Cross axis: center align
  - WASM: tidy_up_selection() → JSON { axis, gap, count }, push_undo 통합
  - Context menu: "Tidy Up" (2+ 노드 선택 시), Cmd/Ctrl+Shift+T 단축키
  - specs/FEATURES.md 업데이트

## 완료된 기능 (추가 — Smart Grid Distribute)
- Smart distribute with grid detection:
  - Y 근접도 기반 행 클러스터링 (tolerance = median height × 0.5, min 8px)
  - 행/열별 균등 gap 계산 (median → 4px grid 반올림)
  - 셀 내 중앙 정렬 (행 높이, 열 너비 기준)
  - Rust: Scene::smart_distribute_grid() → JSON { rows, cols, row_gap, col_gap, count }
  - WASM: smart_distribute_grid() 바인딩, push_undo 통합
  - Properties panel: "Grid distribute" 버튼 (4+ 노드), grid 아이콘
  - Context menu: "Grid Distribute" (4+ 노드 선택 시)
  - 단축키: Cmd/Ctrl+Alt+G

## 완료된 기능 (추가 — Design System Migration Assistant)
- Design system migration assistant:
  - Rust migration_assistant.rs: MigrationSuggestion, MigrationProperty (Fill/Stroke/TextStyle)
  - scan_for_migration_suggestions(): 씬 전체 노드의 하드코딩된 fill/stroke/text 스타일 스캔
  - 기존 StyleStore의 color/text styles와 자동 매칭 (RGBA 일치)
  - 반복 사용(2+) 미매칭 스타일 → 새 스타일 후보 제안
  - apply_migration(): 노드에 기존 스타일 링크 (color_style_id/text_style_id)
  - WASM: scan_migration_suggestions(), apply_migration_suggestion(), migration_create_and_apply_color/text()
  - UI: Right pane "Migration" 탭 — Scan 버튼, 매칭/신규 스타일 그룹별 결과, Apply/Create&Apply 버튼
  - Apply All Matched 일괄 적용, Undo 통합
  - specs/FEATURES.md 업데이트

## 완료된 기능 (추가 113)
- Component Playground: 컴포넌트 독립 샌드박스 테스트
  - Rust: component_playground.rs (PlaygroundInfo, PlaygroundVariant, PlaygroundProp, PlaygroundSlot)
  - WASM: get_playground_info(), get_playground_variants()
  - TS: component-playground.ts — 풀스크린 오버레이 모달
  - 좌측 variant 리스트, 중앙 SVG 프리뷰, 우측 props 편집, 하단 breakpoint 바
  - Responsive breakpoints: Mobile 375 / Tablet 768 / Desktop 1440
  - Properties panel에 "▶ Playground" 버튼 (Instance 노드)
  - 단축키: Cmd+Shift+G, Escape로 닫기
  - icons.ts에 playground 아이콘 추가
  - 기존 create_playground_instance 빌드 오류 수정 (Node::new signature)

## 완료된 기능 (추가 — Auto Dark Mode)
- Auto dark mode:
  - HSL 기반 lightness 반전 (Color::to_dark_mode): L → 1-L, 채도 10% 부스트, 0.06~0.94 클램프
  - Color::to_hsl(), Color::from_hsl() 유틸리티 (types.rs)
  - Scene::auto_dark_mode() — 전체 노드 변환, auto_dark_mode_selection() — 선택 + descendants
  - 지원 fill 타입: Solid, LinearGradient, RadialGradient, NoiseFill, DotPattern, CrosshatchFill, GradientMesh
  - Stroke 색상 변환, Shadow 색상 + blur 1.2x + opacity 1.3x 부스트
  - WASM: auto_dark_mode_all(), auto_dark_mode_selection()
  - Editor: autoDarkModeAll(), autoDarkModeSelection()
  - 툴바: 달 아이콘 버튼, 단축키 Cmd+Shift+D
  - Undo 통합 (push_undo before transform)

## 완료된 기능 (추가 — Canvas Object Search & Filter)
- Canvas object search & filter:
  - 노드 속성 기반 필터링: node type, fill color, text content, font family, width size range
  - 매칭 노드: 파란 대시 하이라이트 테두리, 비매칭 노드: 50% opacity 딤밍 오버레이
  - 검색 결과 리스트 클릭 시 해당 노드로 pan + select
  - UI: 좌측 플로팅 패널, Cmd+Shift+F 단축키 토글
  - Color picker + hex 입력 fill color 필터
  - Node type 드롭다운 (17종), 텍스트 검색 (노드 이름 + text content 매칭)
  - Clear 버튼으로 필터 초기화 + 딤밍 제거
  - 순수 TypeScript 구현 (ui/search-filter.ts)

### Custom Easing Curve Editor (2026-03-29)
- Interaction struct에 `easing` 필드 추가 (linear/ease_in/ease_out/ease_in_out/cubic_bezier:x1,y1,x2,y2)
- `add_interaction`에 easing 파라미터 추가, `set_interaction_easing` API 추가
- Properties panel: `createEasingEditor` (ui/easing-editor.ts) — SVG 기반 cubic-bezier 에디터, 드래그 가능한 컨트롤 포인트, 프리셋 버튼
- Prototype viewer: 인터랙션별 easing 적용 (performTransition, performSmartAnimate)
- `applyEasing` 함수: cubic-bezier Newton-Raphson 평가

## 완료된 기능 (추가 — Node Links / References)
- Node link/reference system:
  - NodeLink struct (target_id, LinkType, label), LinkType enum (Reference/DependsOn/Related)
  - Node.links: Vec<NodeLink> per node, backward-compatible serde
  - WASM: add_node_link, remove_node_link, clear_node_links, get_node_links, get_incoming_links, get_all_links
  - Canvas: 색상별 화살표 오버레이 (Reference=파란 점선, DependsOn=주황 실선, Related=회색 점선) + arrowhead + label
  - Properties panel: "Links" 섹션 — outgoing/incoming 리스트, 클릭으로 타겟 선택, add/remove UI
  - L키 토글 (show/hide link arrows)
  - Dangling link graceful skip

## 완료된 기능 (추가 — Node Search & Replace Properties)
- Property-based node search & batch replace:
  - Rust find_replace.rs: PropertySearchCriteria (fill_color, stroke_color, font_family, font_size/range, opacity, blend_mode, node_kind, corner_radius, stroke_width)
  - PropertyReplacement: 동일 속성 일괄 변경
  - Scene.search_by_properties(), replace_properties(), search_and_replace_properties()
  - AND logic across all criteria
  - WASM: search_by_properties(json), replace_properties(json,json), search_and_replace_properties(json,json)
  - UI: Find & Replace panel에 "Properties" 탭 추가 — 검색 조건 빌더 + 교체 값 빌더 + 결과 리스트
  - Color picker 연동, blend mode/node kind select
  - Undo 통합

## 완료된 기능 (추가 — Smart Layout Templates)
- Smart layout templates (원클릭 레이아웃 삽입):
  - 10개 빌트인 템플릿: Basic Card, Profile Card, Top Navigation, Sidebar Navigation, Centered Hero, Login Form, Contact Form, Settings List, Simple Footer, Confirm Dialog
  - 카테고리: Cards, Navigation, Hero, Forms, Lists, Footers, Modals, Custom
  - Right pane "Templates" 탭: 검색, 카테고리 필터, 카드형 UI
  - 원클릭 삽입: 뷰포트 중심에 배치, 계층 구조 + auto-layout + fill/stroke/radius/text 모두 적용
  - 커스텀 템플릿: selection → template 저장 (노드 트리 재귀 직렬화)
  - 커스텀 삭제, Export JSON, Import JSON (머지)
  - localStorage 영속, backward-compatible
  - 순수 TypeScript 구현 (ui/template-panel.ts, ~600 lines)

## 완료된 기능 (추가 — Design Handoff Checklist)
- Design handoff checklist:
  - Rust: handoff_checklist.rs — 씬 분석 엔진 (7개 카테고리, 13개 체크 항목)
  - 카테고리: Naming, Styles, Components, Assets, Text, Layout, Export
  - 체크 항목: 레이어 네이밍, 색상 스타일 연결, 텍스트 스타일 정의, 디태치된 인스턴스, 이미지 alt text, 이미지 소스, 빈 텍스트, 최소 텍스트 크기, 픽셀 정렬, 제로 사이즈, 탑레벨 프레임 네이밍, 씬 복잡도
  - Severity 레벨: Error/Warning/Info
  - WASM: get_handoff_checklist() → JSON
  - TS: Handoff panel 빈 상태에서 체크리스트 자동 표시
  - 진행률 바 (컬러: 초록/노랑/빨강), 카테고리별 섹션 접기
  - 문제 항목 클릭 → 해당 노드 선택 + 줌
  - Re-check 버튼으로 실시간 재분석

## 완료된 기능 (추가 — View Bookmarks)
- View Bookmarks (캔버스 뷰 북마크):
  - Rust: ViewBookmark 구조체 (id, name, x, y, zoom, page_id, description, color, created_at)
  - Scene CRUD: add/remove/update/get_all/get_for_page
  - WASM: add_view_bookmark, remove_view_bookmark, update_view_bookmark, get_view_bookmarks, get_view_bookmarks_for_page
  - UI: 📍 View Bookmarks 플로팅 패널 — 리스트, 클릭 네비게이트, 컬러 닷, 줌/좌표 표시
  - URL hash sharing: #view=x,y,zoom,pN 포맷, 로드 시 자동 네비게이트
  - 🔗 Copy share link 버튼, 클립보드 복사
  - Keyboard: Cmd+Alt+B (save view), Cmd+Shift+K (toggle panel), Ctrl+1-9 (quick jump)
  - Page-aware: 북마크 전환 시 자동 페이지 이동
  - Backward-compatible serde

## 완료된 기능 (추가 — Artboard Presets)
- Artboard templates / presets (디바이스별 아트보드 프리셋):
  - 35+ 빌트인 프리셋: Phone (iPhone 16/Pro/Pro Max/SE, Pixel 9, Galaxy S24 등), Tablet (iPad 시리즈, Surface Pro), Desktop (MacBook/iMac/1080p-4K), Watch (Apple Watch 41-49mm), Paper (A4/A3/Letter/Legal), Social (Instagram/X/Facebook/YouTube/LinkedIn)
  - Right pane "Artboards" 탭: 검색, 카테고리 필터, portrait/landscape 토글
  - 원클릭 생성: 뷰포트 중심에 Frame 노드 생성 (프리셋 이름 자동 설정)
  - 커스텀 프리셋: 이름+가로+세로 입력, localStorage 저장, 삭제
  - Orientation 토글: ↕/↔ 전환 시 width/height 자동 스왑
  - 순수 TypeScript 구현 (ui/artboard-presets.ts)

## 완료된 기능 (추가 — Auto-layout Spacing Visualizer)
- Auto-layout spacing visualizer:
  - Gap overlay: pink translucent regions between auto-layout children + dashed edge lines
  - Padding overlay: green translucent regions at frame edges (top/right/bottom/left), dashed inner edge
  - Value labels: hover/drag → pill badge with px value (pink=gap, green=padding)
  - Gap drag: drag gap region to adjust auto-layout gap value in real-time
  - Padding drag: drag padding region to adjust individual padding (top/right/bottom/left)
  - Multi-selection spacing: 3+ free nodes show inter-node gap indicators + equal spacing badge
  - Individual padding WASM setters: set_layout_padding_top/right/bottom/left
  - Undo integration, cursor feedback (col-resize/row-resize)
  - tools/spacing-handles.ts: SpacingHandle + PaddingHandle, find/hitTest/render functions

## 완료된 기능 (추가 — Min/Max Content Sizing + Text Overflow)
- Auto-layout min/max content sizing:
  - Hug 모드에서 compute_hug_sizing 후 clamp_size() 호출로 min/max width/height 제약 적용
  - 기존 Node.clamp_size() 메서드 활용
- Text overflow (Clip/Ellipsis):
  - TextOverflow enum (Visible/Clip/Ellipsis), Node.text_overflow 필드 (#[serde(default)], backward compatible)
  - WASM: set_text_overflow(id, mode), get_text_overflow(id) 바인딩
  - Canvas 렌더링: Fixed sizing 시 word-wrap + 줄 수 제한 + ellipsis 자동 truncation
  - Clip 모드: ctx.clip()으로 텍스트 영역 클리핑
  - Ellipsis 모드: 줄 넘침 시 마지막 줄에 "…" 추가, 단일 줄 overflow 시에도 truncation
  - text-align (Left/Center/Right) 렌더링 통합
  - Properties panel: Fixed sizing 시 Overflow 모드 토글 (Visible/Clip/Ellipsis) 버튼 그룹

## 완료된 기능 (추가 — Nudge Hint Overlay)
- Arrow key nudge 시 인라인 좌표 + 이동량 힌트 오버레이
  - 노드 근처에 현재 좌표 (x, y) + 델타 (Δx, Δy) 표시
  - 800ms 후 자동 페이드아웃, 0.15s transition
  - Alt+Arrow: 0.1px, Arrow: 1px, Shift+Arrow: 10px 모두 지원
  - 순수 TypeScript 구현 (ui/nudge-hint.ts)
  - 기존 nudge 로직에 비침습적 통합
- Canvas Performance Profiler: Right-pane Profiler 탭, 실시간 FPS/프레임타임 그래프, 노드별 렌더 비용 리스트, 히트맵 오버레이, LOD threshold 슬라이더, 최적화 제안 (profiler-panel.ts)

## 완료된 기능 (추가 — Canvas Object Search & Filter Enhanced)
- Rust engine: Scene.filter_nodes(criteria_json) — 노드 속성 기반 고급 필터링
- 필터 조건: NodeKind, fill color (±2 tolerance), stroke color (±2 tolerance), opacity min/max, visible, locked, has_text, name pattern
- WASM: filter_nodes(criteria_json) → JSON array of matching node IDs
- TS UI 강화 (search-filter.ts): stroke color 필터 추가, opacity range 필터, "Text nodes only" 체크박스
- 결과 노드 주황색(#ff8c00) solid 테두리 하이라이트, 비매칭 노드 45% 딤 오버레이
- "Select All" 버튼: 매칭 노드 일괄 선택 (주황 액센트)
- 결과 리스트 클릭 → 노드 선택 + pan-to-center
- Hybrid Rust+TypeScript 구현 (엔진 필터 + UI 후처리)

## 완료된 기능 (추가 — Connector Arrow Head Styles)
- ArrowStyle enum: None, Arrow, Diamond, Circle, Square, OpenArrow
- 기존 end_arrow/start_arrow bool → ArrowStyle로 확장, arrow_size 배율 필드 추가
- Backward-compatible serde: 기존 bool JSON → ArrowStyle 자동 변환 (custom deserializer)
- Canvas 렌더링: 6가지 화살촉 스타일 (filled triangle, open V, diamond, circle, square)
- SVG export: 스타일별 marker defs 생성 (arrow/open_arrow → path, diamond → path, circle → circle, square → rect)
- WASM: set_connector_start_arrow_style, set_connector_end_arrow_style, set_connector_arrow_size (기존 set_connector_arrows bool API 유지)
- get_connector_info: end_arrow/start_arrow를 string으로 반환, arrow_size 포함
- Properties panel: Start/End arrow style 드롭다운 (6옵션), Arrow size 숫자 입력

## 완료된 기능 (추가 — Interactive Components)
- Interactive Components (hover/press/focus/disabled variant auto-switch):
  - Rust: InteractiveState enum (Default/Hover/Press/Focus/Disabled), InstanceData.interactive_variants HashMap
  - WASM: set_interactive_variant, get_interactive_variants, clear_interactive_variant, apply_interactive_state
  - Properties panel: "INTERACTIVE VARIANTS" 섹션 (핑크 카드) — state별 variant 드롭다운 매핑
  - Prototype viewer: hover/press/release 시 자동 variant 전환, original 저장/복원
  - Fallback: state 매핑 없으면 Default → 현재 variant 유지
  - Backward-compatible serde (#[serde(default)])
  - specs/COMPONENTS.md 업데이트

## 완료된 기능 (추가 — Multi-canvas Artboard View)
- Multi-canvas artboard view: 여러 페이지를 하나의 무한 캔버스에 동시 표시
  - Rust: Page에 canvas_x, canvas_y 필드 추가 (serde(default) backward-compatible)
  - Rust: get_all_pages_layout(), set_page_canvas_position() Scene 메서드
  - Rust: 새 페이지 추가 시 자동 배치 (기존 페이지 오른쪽 100px 간격)
  - WASM: get_all_pages_layout(), set_page_canvas_position() 바인딩
  - TypeScript: ArtboardView 클래스 (ui/artboard-view.ts)
    - enabled 토글, render (페이지 배경/경계/라벨), hitTest (페이지 클릭 감지)
    - 클릭으로 active page 전환, 줌아웃 시 전체 조감도
  - 단축키: Cmd+Shift+A 또는 Cmd+Alt+A 토글
  - Editor 통합: render loop, pointer events, shortcut

## 완료된 기능 (추가 — WebGPU Renderer 개선, 2026-04-04)
- WebGPU 인스턴스 수집 로직 개선: Scene graph를 루트→자식으로 재귀 순회하여 부모 오프셋/opacity를 합성한 뒤 GPU 인스턴스로 업로드
- Fill 파싱 강화: `type.Solid.color` 및 direct `color` 형태를 모두 지원, 노드 opacity와 합성
- 렌더러 전환 UX 추가: Zoom controls에 Renderer 토글 버튼 추가 (Canvas2D ↔ WebGPU)
- WebGPU 미지원 환경 처리: 토글 버튼 disabled + 안내 tooltip, 강제 WebGPU 선택 시 Canvas2D로 안전 fallback
- WebGPU 뷰포트 컬링 추가: 현재 카메라(viewport/zoom/pan) 기준 화면 밖 노드 인스턴스를 업로드 전에 제외
- 렌더 경로 캐시 추가: `sceneJson + viewKey` 기반 캐시로 동일 프레임 재파싱/재순회 비용 절감
- bind group 재사용 최적화: 매 프레임 생성 대신 초기화 시 1회 생성 후 재사용

## 완료된 기능 (추가 — Multi-cursor Collaborative Lock Overlay MVP, 2026-04-04)
- 원격 협업 사용자의 selection 정보를 이용해 노드 잠금 오버레이 렌더링
- 캔버스 오버레이: 사용자 색상 dashed outline + 🔒 락 마커
- 충돌 방지 가시성 강화: 누가 잡고 있는 노드인지 즉시 확인 가능
- editor.ts: renderRemoteNodeLocks() 추가, 메인 렌더 파이프라인 통합
- specs/FEATURES.md Cursor Presence 섹션 업데이트

## 완료된 기능 (추가 — Node Effect Presets Library MVP, 2026-04-04)
- Effects 패널에 프리셋 액션 추가: Save preset / Apply preset / Export / Import
- 프리셋 저장 데이터: blur, backdrop blur, blend mode, bitmap filter, drop/inner shadows
- localStorage(`opensketch-effect-presets`) 기반 라이브러리 관리
- JSON import/export 지원 (프리셋 백업/복원)
- Apply 시 기존 effects를 교체 적용 (undo + refresh 연동)

## 완료된 기능 (추가 — Spreadsheet Data Binding Repeat Grid 연동, 2026-04-04)
- Data Binding 패널 확장: "Apply to selected Repeat Grid" 액션 추가
- CSV/JSON 데이터를 Repeat Grid 셀에 row/col 순회로 자동 주입
- master 셀의 Text `{{field}}` 템플릿을 child_path 기반으로 탐색 후 셀별 override 생성
- Repeat Grid rows 자동 확장 (입력 데이터 길이에 맞춰 증가)
- Rust 렌더러: Repeat Grid override 해석 구현 (`row,col:path:field`) + `text_content/text/src` 반영
- engine.sync_repeat_grid() 연동으로 즉시 미리보기 렌더 반영

## 다음 할 것
- ~~Multi-cursor collaborative editing~~ ✅ 완료 (원격 selection 기반 노드 잠금 오버레이 MVP)
- ~~Canvas minimap enhanced~~ ✅ 완료 (페이지 탭 네비게이션 + 활성 페이지/배율/팬 위치 인포 라벨)
- ~~Smart auto-naming~~ ✅ 완료 (Frame children composition 기반 추론 이름 생성 포함)
- ~~Figma DevMode parity~~ ✅ 완료 (선택 노드 spacing/padding/margin 인라인 Dev Inspect 배지 + 코드 스니펫 원클릭 복사)
- Table auto-layout — Table 노드에 auto-layout 적용 (셀 내 텍스트 wrap, 행/열 자동 리사이즈, 헤더 고정, 정렬)
- Freehand smoothing — Pen/Freehand 도구의 스트로크 후처리 자동 스무딩 (Catmull-Rom/simplify), 감도 조절 슬라이더
- ~~Repeat Grid — 노드 복제 grid (Figma Repeat Grid), row/col 갯수 + gap, 개별 셀 콘텐츠 오버라이드, 드래그로 인스턴스 수 조절~~ ✅ 완료 (셀별 텍스트 오버라이드 렌더 + 데이터 바인딩 패널 연동)
- ~~Component Sets~~ ✅ 완료
- Multi-window / detachable panels — 패널을 별도 윈도우로 분리 (Layers, Properties, Agent 등), window.open + postMessage 통신
- Smart selection grouping — 유사 속성 노드 자동 그룹 제안, one-click grouping + auto-layout 적용
- Figma-style Variants Matrix UI — 컴포넌트 편집 시 모든 variant 조합을 2D 매트릭스로 시각화, 드래그로 variant 추가/삭제
- Smart selection filter — 선택 영역 내 특정 노드 타입만 필터링 (Figma "Select All with..." 확장), 정규식 이름 매칭, 깊이/속성 필터
- Scroll-to animation triggers — Prototype viewer에서 스크롤 위치 기반 애니메이션 트리거 (parallax, reveal-on-scroll), 트리거 threshold 설정
- Conditional visibility — 변수/조건 기반 노드 visibility 토글 (if variable == value → show/hide), 프로토타입에서 동적 UI 시뮬레이션

## 완료된 기능 (추가 — Auto layout padding 4-value shorthand, 2026-04-05)
- Auto Layout Padding에 CSS 스타일 shorthand 입력 추가 (`8`, `8 12`, `8 12 16`, `8 12 16 20`)
- Enter/Apply로 즉시 top/right/bottom/left에 매핑 적용 + Undo 통합
- 기존 개별 4방향 입력(top/right/bottom/left)과 동기화되어 Figma-style 편집 흐름 강화

## 완료된 기능 (추가 — Canvas Grid/Guide Templates, 2026-04-05)
- Zoom controls에 Templates 드롭다운 추가 (8pt Grid, 4pt Grid, 12 Columns, Safe Area)
- 8pt/4pt 선택 시 grid snap size 자동 적용 + 가이드 초기화
- 12 Columns 선택 시 현재 뷰포트 기준 좌우 4% margin + 12등분 세로 guide 생성
- Safe Area 선택 시 현재 뷰포트 기준 상하/좌우 5% inset guide 생성
- rulers.clearGuides() + editor.requestRender() 연동으로 즉시 반영

## 완료된 기능 (추가 — Figma DevMode parity, 2026-04-05)
- Dev Mode 선택 노드 인라인 Inspect 배지 추가 (Spacing / Padding / Margin 4값 표시)
- 배지 내 `Copy` 버튼으로 선택 노드 CSS 스니펫 원클릭 복사
- 선택 변경/줌·팬 렌더 루프에서 배지 위치와 값 자동 동기화
- hover tooltip 기반 기존 DevMode overlay와 공존

## 완료된 기능 (추가 — Spreadsheet Data Binding 확장, 2026-04-05)
- Spreadsheet Data Binding 패널에서 Text + Image 노드 템플릿(`{{field}}`) 바인딩 지원
- Repeat Grid 바인딩에서 `text_content`와 `image_src` 오버라이드를 동시에 처리
- Row 변경/데이터 편집 시 실시간 미리보기 옵션 추가
- 로컬 데이터 소스(localStorage) 유지 및 기존 undo/render 흐름과 호환

## 완료된 기능 (추가 — Canvas Minimap Enhanced, 2026-04-04)
- Minimap 헤더 하단에 상태 인포 라벨 추가: `활성 페이지명 · 줌% · pan(x/y)`
- 활성 페이지 전환 시 인포 라벨이 즉시 동기화되도록 page tabs 업데이트 로직 보강
- 접기/펼치기 상태에서 info/canvas/page-tabs 동시 토글 처리
- 스타일 추가: compact 정보 바(`.minimap-info`) + tabular 숫자 표시

## 완료된 기능 (추가 — Smart Auto-naming Frame Heuristics, 2026-04-04)
- Frame auto-name 규칙 강화: children 구성 기반 추론 추가
- 규칙: Image+Text → `Card`, all Text → `Text Group`, all Shape → `Shape Group`
- 단일 child frame → `<Child Name> Container`
- fallback: `Frame N items`로 레이어 스캔 가독성 향상
- 기존 Text/Image/Star/Polygon 등 naming 규칙 유지 + sibling dedup 규칙 그대로 적용

## 완료된 기능 (추가 — Design System Documentation Site Export, 2026-04-04)
- Properties panel (빈 선택 상태) Styles Library 섹션에 `Docs HTML` 버튼 추가
- shared styles(`export_styles`) + design tokens(`export_design_tokens` W3C)를 단일 정적 HTML 문서로 빌드
- 문서 구성: Color Styles 갤러리, Text Styles 샘플 프리뷰, 토큰 JSON 코드 블록
- 산출물: `design-system-docs.html` 다운로드 (오프라인 공유 가능)
- 구현: `packages/app/src/ui/design-system-docs.ts`

## 완료된 기능 (추가 — Spreadsheet Data Binding MVP, 2026-04-04)
- Toolbar에 "Spreadsheet Data Binding" 버튼 추가
- CSV(header+rows) 또는 JSON array 데이터 소스를 패널에 붙여넣어 사용
- Text 노드의 `{{field}}` 템플릿을 선택한 row index 값으로 치환 적용
- 선택된 Text 노드만 변경되며, 데이터 소스는 localStorage에 저장
- 범위: 텍스트 바인딩 MVP만 포함 (이미지 바인딩/Repeat Grid 자동 연동은 후속)

## 완료된 기능 (추가 — WebGPU Renderer Stage 2: Texture Atlas, 2026-04-04)
- WebGPU 인스턴스 데이터 확장: UV rect + textureMix 필드 추가, 단일 instanced 파이프라인에서 solid/textured quad 혼합 렌더
- 2048x2048 타일 atlas(canvas 기반) 추가, Image/Video(poster/src) 비동기 로딩 후 atlas dirty 플래그 기반 업로드
- node.kind 파싱으로 Image/Video 소스 감지, atlas 슬롯 UV 자동 계산 및 인스턴스별 텍스처 샘플링 적용
- atlas 업로드 최적화: 변경 시에만 `copyExternalImageToTexture` 실행

## 완료된 기능 (추가 — WebGPU Renderer Stage 5, 2026-04-04)
- Scene JSON 색상 파서 확장: CSS rgb/rgba/hex + Rust 직렬화 `{r,g,b,a}` 포맷 공통 처리
- WebGPU 경로에서 visible outer shadow를 별도 인스턴스로 프리패스 렌더 (offset/spread/blur 기반 패딩 근사)
- fill/shadow 색상 fidelity 개선 + 대형 씬에서 Canvas2D 대비 효과 일관성 보강

## 완료된 기능 (백로그 정리 25 — 이미 구현 확인, 2026-04-04)
- ~~Lottie animation export~~ ✅ 이미 구현 (animation-timeline export, toolbar dialog, Rust/WASM `export_lottie*`, lottie-export.ts)
- Multi-player cursors with tool state — 협업 커서에 현재 도구/액션 상태 표시 (✎ editing, ↔ resizing, ✋ panning), 실시간 selection 충돌 경고
- Design Token Theming — 라이트/다크 모드 자동 전환, 시맨틱 토큰 매핑 (primary/secondary/surface), 테마 프리뷰 split-view
- Auto Layout Spacing Override (per-child) — 개별 자식 노드마다 gap override 설정 (Figma "absolute spacing"), Node에 spacing_before/spacing_after 필드 추가, Flex 계산 시 개별 간격 적용, Properties panel UI (소규모, 고 임팩트)
- Shared Prototype Variables Sync — 프로토타입 변수를 design token/variable collection과 양방향 동기화, 변수 변경 시 프로토타입 상태 자동 반영, 디자인↔프로토타입 간 일관성 유지 (중규모, 고 임팩트)
- Component Playground Panel — 컴포넌트 선택 시 모든 variant 조합을 인터랙티브 미리보기, prop 슬라이더/토글로 실시간 변경, 스냅샷 비교, 문서와 통합 (중규모, 고 임팩트)

## 완료된 기능 (추가 — WebGPU Renderer MVP, 2026-04-04)
- Experimental WebGPU 렌더러 추가: `packages/app/src/ui/webgpu-renderer.ts`
- Instanced rectangle pipeline 구현 (node bounds + fill color 기반)
- Uniform(zoom/pan/viewport) + instance buffer 동적 확장 처리
- Editor 렌더 백엔드 스위치 추가: `canvas2d | webgpu`
- localStorage 키 `opensketch-renderer-backend`로 WebGPU opt-in
- WebGPU unavailable 시 자동 Canvas2D fallback

## 완료된 기능 (추가 — Responsive Breakpoints Preview)
- SceneBreakpoint 구조체 (types.rs): name, width, height + default_presets()
- Scene-level breakpoints (scene.rs): add/remove/update/get_scene_breakpoints_json
- WASM API (lib.rs): add_scene_breakpoint, remove_scene_breakpoint, update_scene_breakpoint, get_scene_breakpoints, get_default_breakpoints
- breakpoints-preview.ts: 풀스크린 오버레이, 가로 나란히 뷰포트 카드, SVG 렌더, 스크롤 동기화, 추가/편집/삭제 UI
- editor.ts: Cmd+Shift+B 단축키, openBreakpointsPreview() 메서드
- toolbar.ts: 멀티컬럼 아이콘 버튼 추가
- properties-panel.ts: Frame/Section 선택 시 "Breakpoints Preview" 버튼
- 기본 프리셋: Mobile (375×812), Tablet (768×1024), Desktop (1440×900)

## 백로그 정리 (2026-04-01)
- "Canvas presentation mode" 제거 — 이미 완료 (추가 81)
- "Annotation sticker pack" — 이미 완료 (stamp.rs + stamp-tool.ts, 추가로 강화 버전도 완료)
- "Scroll & overflow (scrollable frames)" — 이미 완료 (추가 51, Overflow enum + WASM + Properties panel + prototype viewer)
## 완료된 기능 (추가 — Multi-page Prototype Flow)
- PrototypeFlow struct: id, name, start_frame_id (Option), start_page_id
- Scene에 flows: Vec<PrototypeFlow> + next_flow_id (backward-compatible serde)
- Flow CRUD: add_flow, remove_flow, rename_flow, set_flow_start_frame
- get_flow_connections(flow_id): BFS로 start frame부터 reachable 연결 수집
- get_all_cross_page_interactions(): 페이지 넘나드는 인터랙션만 수집
- WASM 바인딩: 위 메서드 모두 노출
- Flow Diagram View (flow-diagram.ts): 풀스크린 오버레이, 페이지 썸네일 카드, 인터랙션 화살표, 시작 프레임 녹색 마커, pan/zoom
- Properties Panel: "Prototype Flows" 섹션 (flow 목록, add/remove/rename, start frame 지정)
- Toolbar: Flow Diagram 버튼 (프로토타입 버튼 옆)

## 완료된 기능 (추가 — UI Localization / i18n)
- 다국어 지원: English (en), 한국어 (ko), 日本語 (ja)
- i18n 시스템: `packages/app/src/ui/i18n.ts` — t() 번역 함수, locale 관리, onLocaleChange 리스너
- 번역 파일: `packages/app/src/locales/{en,ko,ja}.json` — 100+ 키 (toolbar, layers, properties, agent, common)
- 언어 전환 UI: 툴바에 🌐 아이콘 + select 드롭다운
- localStorage 저장 (key: `opensketch-locale`)
- 주요 UI 파일 적용: toolbar.ts (모든 tooltip), layers-panel.ts (헤더/검색/컨텍스트메뉴), properties-panel.ts (주요 라벨)
- Vite 빌드 시 locale JSON 자동 코드 스플릿 (별도 chunk)
- initI18n() → main.ts에서 UI 초기화 전 호출

## 완료된 기능 (추가 — Responsive Variant Auto-Switch)
- Frame 리사이즈 시 Instance 자동 variant 전환
- ResponsiveVariantRule: label, max_width, variant_key
- InstanceData.responsive_rules (serde default, backward-compatible)
- WASM: add/remove/get/clear_responsive_variant_rules, apply_responsive_variants
- Properties panel: "RESPONSIVE VARIANTS" 섹션 (규칙 추가/삭제)
- editor.ts: pointerup resize handle → apply_responsive_variants 자동 호출

## 완료된 기능 (추가 — Canvas Search & Replace Cmd+F)
- Figma 스타일 플로팅 검색 바 (캔버스 상단 중앙, Cmd+F 토글)
- 검색: 텍스트 노드 content + 모든 노드 name 매칭
- 결과 카운트 (N/M), ↑/↓ 화살표 순회 (선택 + zoomToSelection)
- Replace / Replace All 버튼 (name + text 동시 치환)
- Case sensitive 토글 (Aa)
- 검색 결과 노드 주황색 테두리 하이라이트, 현재 결과 강조
- Escape으로 닫기
- Rust: Scene.search_nodes(), Scene.replace_text_in_nodes() (find_replace.rs)
- WASM: search_nodes(), replace_in_nodes()
- TS: search-panel.ts, editor.ts 통합
- push_undo 통합 (replace 시 자동)

## 완료된 기능 (추가 — Smart Distribute)
- 3+ 노드 선택 시 불균등 간격 감지 및 정규화
- Rust: smart_distribute_preview() → 현재 H/V gaps, 추천 gap (mode/median), 이동량 JSON
- Rust: smart_distribute_h/v(ids, reference_gap) → 자동 또는 커스텀 gap으로 재배치
- WASM: smart_distribute_preview(ids_json), smart_distribute_h/v(ids_json, gap) — gap < 0 이면 자동
- Properties panel: "Smart Distribute" 버튼 → 팝오버 (감지된 gaps, 추천값, 커스텀 입력, Apply H/V)
- push_undo 통합

## 완료된 기능 (추가 — Canvas Performance Mode)
- Rust LOD (Level of Detail): lod_level() 함수로 zoom/screen_area 기반 3단계 (0=full, 1=simplified, 2=box-only)
  - zoom < 0.15 또는 screen area < 16px²: 모든 노드를 단색 fill rect로 대체 (Frame/Group은 children 계속 렌더)
  - zoom < 0.35: Text/StickyNote/Callout 노드만 단색 박스로 대체
  - render_lod_box(): 첫 번째 fill 색상 사용, 없으면 #ccc fallback
- 기존 viewport culling (AABB + 100px margin) 그대로 활용
- FPS 카운터: bottom-left 오버레이 (⌘⇧F 토글), 1초 sliding window 기반 실시간 FPS, 색상 코딩 (≥55 green, ≥30 yellow, <30 red), rendered/culled 카운트 표시
- requestIdleCallback 기반 deferred tasks: 이미지 캐시 정리 등 비핵심 작업을 idle time에 분산, fallback setTimeout 16ms

## 완료된 기능 (추가 — Typography Scale Generator)
- Rust typo_scale.rs: 8 presets (Minor Second ~ Golden Ratio) + custom ratio, 7 levels (Display/H1/H2/H3/Body/Small/Caption)
- WASM: generate_type_scale() (preview JSON), apply_type_scale() (StyleStore 직접 추가/업데이트)
- Modal UI: scale 드롭다운, base size, font family, 실시간 프리뷰, update existing 체크박스
- Design System panel Type 탭에 "Typography Scale…" 버튼 통합

## 완료된 기능 (추가 — Node Dependency Graph)
- Rust dep_graph 모듈: DependencyEdge (ComponentInstance, Connector, Interaction, Comment)
- Force-directed graph 시각화 (Canvas2D), 노드 종류별 색상, 엣지 타입별 스타일
- 호버 하이라이트, 더블클릭 선택, 드래그 위치 조정, 필터 체크박스
- 순환 의존성 탐지 + 경고 표시
- Right pane "Deps" 탭 + Cmd+Shift+D 단축키

## 완료된 기능 (추가 — Minimap Node Interaction)
- Canvas minimap에서 직접 노드 선택 + 이동:
  - 클릭: 해당 노드 선택 + 뷰포트 팬
  - Alt+드래그: 미니맵 내에서 직접 노드 이동 (scene 좌표 반영)
  - 선택된 노드 빨간 테두리 하이라이트
  - 노드 위 호버 시 커서 변경 (pointer / Alt=move)
  - Undo 통합 (드래그 완료 시 push_undo)
  - 기존 뷰포트 pan/resize 기능 유지

## 완료된 기능 (추가 — Auto-Spacing Tool)
- Properties panel Align 섹션에 Auto-spacing UI 추가
- 2+ 노드 선택 시 Spacing 입력 + H/V 버튼 표시
- 기존 distribute_selection_with_spacing WASM 바인딩 활용
- 사용자 지정 gap으로 수평/수직 균등 간격 배치

## 완료된 기능 (추가 — Plugin Marketplace UI)
- Rust: plugin.rs — PluginEntry 구조체 (id, name, version, author, description, category, installed, enabled, downloads, rating)
- Rust: PluginStore — CRUD, enable/disable, search (fuzzy query + category filter), 7개 빌트인 카탈로그
- WASM 바인딩: get_plugins, get_installed_plugins, search_plugins, install_plugin, uninstall_plugin, enable_plugin, disable_plugin
- TS: plugin-marketplace.ts — Right pane "Plugins" 탭, Installed/Browse 두 섹션
- Browse: 검색 바 (name/description fuzzy match), 카테고리 필터 (All/Design/Layout/Export/Accessibility/Developer)
- Plugin 카드: icon, name, author, description, rating, downloads, install/uninstall 버튼
- Installed: 토글 스위치 (enable/disable), uninstall 버튼, 플러그인 패널 탭
- Demo plugins: Lorem Ipsum Generator, Color Palette, Grid Generator (실제 동작)
- Grid Generator: rows/cols/cellSize/gap/color 설정, rainbow 모드, 자동 Rect 그리드 생성
- Plugin API: PluginAPI 인터페이스 (scene ops, UI extensions, events), PluginManager lifecycle
- Figma Plugin 호환: 코드 붙여넣기 실행 지원

## 완료된 기능 (추가 — Content-aware Resize)
- Content-aware resize (비율 보존 + 비례 스케일):
  - Image 노드: 리사이즈 시 자동 종횡비 잠금 (Alt 누르면 해제)
  - Shift: 모든 노드 종횡비 고정 리사이즈
  - Alt+Shift: 비례 스케일 — font size, corner radius, stroke width/dash, shadow offset/blur/spread, blur, padding, gap, min/max constraints, children 위치/크기 모두 비례 조정
  - Rust: Scene.scale_node_proportional(id, scale_x, scale_y) — 재귀적 자식 스케일링
  - Rust: Scene.get_node_aspect_ratio(id), Scene.is_image_node(id) 헬퍼
  - WASM: scale_node_proportional, get_node_aspect_ratio, is_image_node 바인딩
  - TS: editor.ts 리사이즈 핸들 드래그 로직에 통합

## 완료된 기능 (추가 — Smart Text Flow)
- Smart Text Flow: 텍스트 노드 간 overflow 흘림
  - Node.text_flow_next: Option<NodeId> 필드 추가 (serde default, backward compatible)
  - Scene: link_text_flow (순환 방지), unlink_text_flow, get_text_flow_chain 메서드
  - WASM: link_text_flow, unlink_text_flow, get_text_flow_chain, get_text_flow_next 바인딩
  - Editor: renderTextFlowLinks — 인디고 점선 베지어 커브 + 화살표 시각화
  - Properties Panel: Text Flow 섹션 — Link/Unlink 버튼, 체인 노드 이름 표시
  - packages/app/src/ui/text-flow.ts: 독립 모듈 (getTextFlowLinks, drawTextFlowLinks, distributeTextFlow)

## 완료된 기능 (추가 — Dev Resource Linker)
- Dev resource linker:
  - ResourceLink struct: url, label, ResourceLinkType enum (GitHub/Storybook/Jira/Figma/Custom)
  - Node.resource_links: Vec<ResourceLink>, backward-compatible serde (#[serde(default)])
  - WASM: add_resource_link, remove_resource_link, update_resource_link, get_resource_links, get_resource_link_count
  - Properties panel: "Resources" 섹션 — 링크 리스트 (타입 아이콘 + 라벨 + URL), add/remove, URL 기반 타입 자동 감지
  - Inspect panel: Resources 섹션 — 클릭 가능한 링크 리스트 (window.open)
  - Canvas: 파란 도트 배지 (top-left corner) — resource links 있는 노드에 표시, 링크 아이콘 + 개수
  - Per-type SVG 아이콘: GitHub, Storybook, Jira, Figma, Custom (Lucide-inspired)

## 완료된 기능 (추가 — Batch Rename 강화)
- Batch Rename 기능 강화 (기존 pattern-only → 3모드):
  - Rust: Scene.batch_find_replace() — case-sensitive 텍스트 치환 + regex::Regex 지원
  - Rust: Scene.batch_rename_preview() — 3모드 (prefix/find_replace/regex) 프리뷰 JSON 생성
  - regex crate 의존성 추가 (Cargo.toml)
  - WASM: batch_find_replace_selection, batch_find_replace_preview, batch_rename_preview_ex 바인딩
  - UI: ui/batch-rename.ts — 독립 모달 다이얼로그 (Pattern / Find & Replace 모드 탭, regex 토글, 실시간 프리뷰)
  - Layers panel: 우클릭 컨텍스트 메뉴에 "Batch Rename…" 항목 추가 (multi-selection 시)
  - Context menu: 기존 2+ 노드 선택 시 "Batch Rename…" 유지
  - Keyboard: Cmd/Ctrl+Shift+R
  - Undo 통합 (push_undo before rename)
  - **추가 (2026-04-04)**: Prefix/Suffix 모드 (batch_add_fix), # 시퀀스 단축 문법, UI 3탭 (Sequence / Find & Replace / Prefix/Suffix)

## 완료된 기능 (추가 — Cursor Annotation Brush)
- 캔버스 위 임시 드로잉/하이라이트 (리뷰용, 자동 5초 소멸)
- Pure TypeScript overlay (annotation-brush.ts) — 엔진 저장 불필요
- Smooth quadratic curve 렌더링 (midpoint interpolation)
- Mini palette: 5색 (빨/파/초/노/흰) + 3 두께 (2/4/8px), 툴바 아래 플로팅 바
- 500ms fade-out 애니메이션 (5초 딜레이 후)
- Screen-space 일정 두께 (줌 불변)
- 'A' 단축키, 툴바 Annotation Brush 버튼
- editor.ts "annotate" 도구 모드 통합 (pointer events, render loop tick)

## 완료된 기능 (추가 — Figma JSON Import drag & drop)
- JSON 파일 드래그&드롭으로 Figma REST API 응답 import
- importFigmaJSON(): 파싱된 JSON 또는 문자열로 직접 import (push_undo 포함)
- 드래그 오버레이: 파란 대시 테두리 + "Drop Figma JSON to import" 안내
- editor.ts setupDragDrop()에 .json 파일 핸들링 통합
- 기존 API 기반 import (URL + token) + 새 JSON 파일 import 양쪽 지원

## 완료된 기능 (추가 — Smart Color Palette Extraction)
- Color Palette panel에 "Extract" 탭 추가
- Image 노드에서 k-means++ clustering으로 dominant colors 자동 추출 (최대 8색)
- 64x64 다운샘플링으로 성능 최적화, 투명 픽셀 스킵
- 추출된 색상: hex 코드, 비율(%), Apply (선택 노드 fill 적용), Save (ColorStyle로 저장) 버튼
- "Save All as Color Styles" 일괄 저장 기능
- 클릭 시 hex 클립보드 복사
- 선택된 Image 노드 우선 표시, 없으면 씬 내 Image 노드 최대 5개 표시
- Pure TypeScript 구현 (k-means algorithm, canvas pixel sampling)

## 완료된 기능 (추가 — Accessibility Checker Panel 강화)
- Node에 alt_text: Option<String> 필드 추가 (serde default, backward compatible)
- accessibility.rs: suggest_fix_color() — WCAG AA 대비율 충족하는 색상 자동 추천
- LowContrast 이슈에 구체적 수정 색상 제안 (hex 코드 포함)
- Image 노드 alt_text 필드 기반 MissingAltText 검사 강화 (이름 폴백 + 명시적 alt text 우선)
- WASM: run_accessibility_audit(), set_alt_text(id, text), get_alt_text(id)
- UI: A11y 패널 타이틀 "Accessibility (A11y)"로 변경
- UI: alt-text 이슈에 인라인 텍스트 입력 + "Set" 버튼 추가
- Cmd+Shift+A 단축키로 A11y 패널 탭 열기

## 완료된 기능 (추가 — Smart Object Replace Enhanced)
- ReplaceOptions 구조체: keep_size, keep_position, transfer_style (all default true)
- replace_node_content_with_options(): 옵션 기반 교체 (기존 함수 backward-compatible)
- 컴포넌트 인스턴스로 교체: replace_selection_with_component(component_id, options)
- WASM: replace_with_node_options, replace_selection_with_options, replace_selection_with_component 추가
- UI: Smart Replace 모달에 Options 바 추가 (Keep Size / Keep Position / Transfer Style 체크박스)
- 교체 시 소스 노드의 kind도 복사 (shape-to-shape 교체), name 복사
- Undo 통합 (push_undo before all replace operations)

## 완료된 기능 (추가 — Keyboard Shortcut Customization)
- ShortcutManager 클래스 (shortcut-manager.ts): 커스텀 키 바인딩, 충돌 감지, localStorage 저장
- 프리셋 프로필: Figma (기본), Sketch, Adobe XD — 드롭다운 선택
- applyPreset() / detectPreset(): 프리셋 적용 및 현재 프리셋 자동 감지
- shortcuts-panel.ts: 모달 UI (Cmd+/ or ?)
  - 카테고리별 그룹 (Tools, Edit, View, Panels, Boolean, Misc)
  - 클릭 ✎ → 키 녹음 모드, 충돌 시 경고 + override 옵션
  - 프리셋 드롭다운, Reset All, Reset 개별 (↺)
  - Export/Import JSON 버튼
  - 검색 필터
- editor.ts keydown: ShortcutManager.matches() 기반 (기존 동작 유지)
- localStorage "opensketch-custom-shortcuts" 저장, 없으면 기본값

## 완료된 기능 (추가 — Annotation Sticker Pack 강화)
- StampKind enum 확장: Love, Warning, Info, Fixme 4종 추가 (총 12종)
- emoji() 메서드: 각 StampKind별 이모지 반환 (✅❌❓🔧❤️⚠️ℹ️📋🚧🔄🏁⏸️)
- 이모지 기반 캔버스 렌더링: stamp-tool.ts STAMP_KINDS 이모지 아이콘으로 변경
- get_stamps_for_node(node_id): 특정 노드에 붙은 스탬프만 필터링 (Scene + WASM 바인딩)
- Properties panel: "Stamps" 섹션 — 선택 노드의 스탬프 목록 (이모지+라벨+노트), 개별 삭제 버튼
- 기존 기능 유지: 팔레트 UI, 캔버스 클릭 배치, zoom/pan aware 렌더링, hit-test, 노드 연결, 노트, 이동
- Backward-compatible serde (기존 StampKind 호환 + 새 variant 자동 역직렬화)

## 완료된 기능 (추가 — Section Node Enhancements)
- Node 구조체에 section_collapsed, section_title_color, section_title_font_size 필드 추가 (serde default)
- render_section(): fills 기반 배경색, 접기/펼치기 아이콘 (▶/▼), 커스텀 타이틀 색상/폰트 크기
- collapsed 상태에서 children 렌더/히트테스트 스킵 (render_order에서 필터링)
- WASM 바인딩: set/get/toggle_section_collapsed, set_section_title_color, set_section_title_font_size
- Properties panel: Collapsed 체크박스, Title Color 입력, Title Font Size 입력
- Editor: Section 더블클릭으로 collapse 토글
- backward-compatible serde

## 완료된 기능 (추가 — Conic/Angular Gradient Fill)
- FillType::ConicGradient { center_x, center_y, angle, stops } 추가 (node.rs)
- Canvas 렌더링: createConicGradient() API 활용 (render.rs)
- SVG export: 72개 arc path segment로 conic gradient 근사 (svg_export.rs)
- WASM 바인딩: set_fill_conic_gradient_at(), get_fill_info/get_fills에 ConicGradient 포함
- Properties panel: Fill 타입 드롭다운에 "Conic" 옵션, gradient stops 편집
- Gradient editor: ConicGradient center handle 드래그 지원
- Inspect panel: CSS conic-gradient(), SwiftUI AngularGradient, Kotlin Brush.sweepGradient 코드 생성
- color_palette.rs: ConicGradient stops 색상 수집 지원
- backward-compatible serde

## 2026-04-02: Multi-cursor text editing
- Cmd+double-click으로 여러 Text 노드에 다중 커서 배치
- 모든 커서에 동시 타이핑/삭제
- ESC로 multi-cursor 모드 종료 (원본 복원)
- 각 Text 노드에 독립적인 캐럿 위치
- Primary caret: 흰색, Multi-cursor carets: 시안(#00d4ff)
- editor.ts: multiCursors Map, _multiCursorMode flag, addMultiCursor(), multiCursorApplyContent(), renderCaretForNode()
- Rust 엔진 변경 없음 (순수 TypeScript 구현)

## 완료된 기능 (추가 — Connector Arrow Head Styles)
- ArrowStyle enum: None, Arrow, Diamond, Circle, Square, OpenArrow — 6가지 화살표 머리 스타일
- Connector 필드 변경: start_arrow/end_arrow bool → ArrowStyle, arrow_size: f64 (기본 1.0)
- Backward-compatible serde: deserialize_arrow_style로 기존 bool → ArrowStyle 자동 변환
- Canvas 렌더링: draw_arrowhead_styled() — Arrow(filled triangle), OpenArrow(V stroke), Diamond(마름모), Circle(원), Square(정사각형)
- SVG export: 스타일별 marker defs (path/circle/rect), marker-start/marker-end
- WASM: set_connector_start_arrow_style, set_connector_end_arrow_style, set_connector_arrow_size
- get_connector_info: arrow style string + arrow_size + legacy bool 모두 반환
- Properties panel: Start/End 각각 6-option 드롭다운, Arrow Size 숫자 입력 (0.1~5.0)

## 완료된 기능 (추가 — Clip Content)
- Node.clip_content: bool 필드 추가 (#[serde(default = "default_true")], 기본값 true)
- Frame/Section 렌더링: clip_content true면 ctx.save/clip/restore로 자식 클리핑
- corner_radius 지원 (rounded clip path)
- SVG export: clip_content true면 <clipPath> 생성
- Hit test: deep_hit_test에서 clip_content Frame 밖 자식 제외
- WASM API: set_clip_content(id, bool), get_clip_content(id) → bool
- Properties panel: Overflow 섹션에 "Clip content" 체크박스
- Inspect panel: clip_content true → overflow: hidden CSS 출력

## 2026-04-03: Interactive Components
- InteractiveState enum (Default/Hover/Press/Focus/Disabled) in component.rs
- InstanceData.interactive_variants: HashMap<InteractiveState, VariantKey> (#[serde(default)])
- WASM: set_interactive_variant, get_interactive_variants, clear_interactive_variant, apply_interactive_state
- Properties panel: Instance "INTERACTIVE VARIANTS" section — per-state variant dropdown
- Prototype viewer: hover enter/leave → apply/revert hover state, mousedown → press state, mouseup → revert to hover or default
- Parent chain traversal for nested interactive instances
- Original variant saved/restored for clean state revert
- specs/COMPONENTS.md updated

## 2026-04-03: Component Sets
- ComponentSet struct: id, name, axes (VariantAxis[]), variant_map (axis-values→ComponentId), component_ids
- ComponentStore: create/get/remove/list component sets, add/update/remove axes, variant mapping, find_set_for_component
- WASM: create_component_set, add/update/remove_component_set_axis, set_component_set_variant_mapping, add/remove_component_to_set, delete_component_set, get_component_set_info, list_component_sets, get_instance_component_set_info, switch_instance_set_variant, get_component_set_render_info
- Canvas rendering: dashed purple (#8b5cf6) rounded border around set member components with name label pill
- Properties panel: "COMPONENT SET" section with per-axis dropdown for variant switching
- Icons: componentSet (4-diamond grid) added
- specs/COMPONENTS.md updated with Component Sets section
- All serde fields #[serde(default)] for backward compatibility

## 2026-04-03: Chart Visualization Node
- Added NodeKind::Chart with 5 chart types (Bar, Line, Pie, Donut, Area)
- ChartDataPoint { label, value, color? } + ChartConfig (title, legend, labels, palette)
- Canvas rendering for all chart types in render.rs
- SVG export for all chart types in svg_export.rs
- WASM bindings: add_chart, set_chart_type, set_chart_data, get_chart_info, set_chart_config
- Toolbar chart button + Properties panel with type selector, data table, config toggles
- Default 10-color palette auto-assigned when data points lack explicit colors
- All serde fields backward-compatible with defaults

## 2026-04-03: Conditional Logic in Prototypes
- PrototypeVariable (name, var_type, default_value) at Scene level with CRUD
- InteractionCondition (variable, ConditionOperator, value) on Interaction — conditional navigation
- SetVariable action type with set_variable_name + set_variable_expression (+N/-N/toggle/literal)
- Prototype Viewer: runtime variable state Map, condition evaluation, SetVariable execution, floating debug panel
- Properties panel: Prototype Variables section (CRUD UI), per-interaction condition editor, SetVariable action fields
- All serde backward-compatible

## 2026-04-03: Plugin System (Enhanced — Iframe Sandbox + Random Fill)
- IframeSandbox: sandboxed iframe plugin host (`<iframe sandbox="allow-scripts">`) with postMessage protocol
- PluginManifest interface: id, name, version, description, icon, main, permissions[]
- PluginPermission: scene:read/write, selection:read/write, ui:panels/notifications, viewport:read/write
- Permission-based access control — each postMessage request validated against manifest permissions
- createSandboxedPlugin(): factory function wrapping manifest+code into standard Plugin interface
- Sandbox runtime injected into iframe: `_os.scene.*`, `_os.ui.*`, `_os.viewport.*`, `_os.on()`
- Random Fill sample plugin: 4 palette presets (Vivid/Pastel/Mono/Earth) + true random mode, panel UI with palette preview
- Existing (already implemented): PluginManager, PluginAPI, 5+1 sample plugins, Plugin Marketplace, Figma compat
- specs/PLUGINS.md updated with iframe sandbox docs + all 6 sample plugins
- 총 6개 샘플 플러그인: Lorem Ipsum, Color Palette, Grid Generator, Auto Rename, Accessibility Checker, Random Fill

## 완료된 기능 (추가 — React/Vue Component Export)
- Right pane "Export" 탭: 선택 노드 트리를 React JSX 또는 Vue SFC로 변환
- React CSS 옵션: inline styles, styled-components, CSS modules
- Vue: scoped style로 출력
- Props 매핑: Text 노드 → children prop, Image → src prop
- Component 이름: 노드 name을 PascalCase로 변환
- 코드 복사 / 파일 다운로드 기능
- 파일: packages/app/src/ui/component-export.ts
- index.html: "Export" 탭 + component-export-panel div
- main.ts: setupComponentExport 호출 + tabContentMap 등록

## 완료된 기능 (Canvas Background Settings 강화)
- Checkerboard 패턴 추가 (투명 배경 표현용)
- 프리셋 버튼: White, Dark (#1a1a2e), Transparent (checkerboard)
- render.rs: checkerboard 패턴 렌더링 (zoom/pan aware, alternating opacity tiles)
- properties-panel.ts: 프리셋 버튼 UI (active 상태 하이라이트)
- pattern dropdown에 checkerboard 옵션 추가
- specs/FEATURES.md 업데이트

## 완료된 기능 (Design Token Export — SCSS 추가)
- SCSS Variables 포맷 추가: $color-*, $font-family-*, $font-size-*, $font-weight-*, $line-height-*
- design_tokens.rs: TokenFormat::Scss, export_scss_variables() 함수
- lib.rs: "scss" 포맷 매핑 추가
- editor.ts: .scss 확장자 지원
- properties-panel.ts: CSS Variables, SCSS 버튼 추가 (총 5개 포맷)
- specs/FEATURES.md 업데이트

## 완료된 기능 (추가 — Ink Recognition / Handwriting)
- Ink recognition & freehand drawing enhancement:
  - ink.rs: InkPoint struct, RDP simplification, Chaikin smoothing, shape recognition (circle/rect/triangle/line/arrow)
  - WASM: ink_recognize, ink_to_path, ink_to_shape 바인딩
  - Editor: freehand tool에서 pressure 캡처 + ink recognition 통합
  - Shape confidence > 0.7 → 자동 도형 변환 (Ellipse/Rect/Triangle Path)
  - Otherwise → smoothed bezier Path
  - specs/FEATURES.md, ENGINE.md 업데이트

## 완료된 기능 (추가 — Smart Paste to Frame, 2026-04-05)
- 붙여넣기(Cmd+V) 시 Smart Paste 적용
- 단일 auto-layout Frame/Group 선택 상태면 해당 컨테이너 flow 끝(index=children.length)에 자동 삽입
- 선택 프레임이 없으면 포인터 아래 auto-layout frame을 drop target으로 사용
- 기존 drag-reparent drop zone/reparent 로직 재사용 (reparent_node_at + recompute_layout)
- Paste in Place(Cmd+Shift+V)는 기존 동작 유지
