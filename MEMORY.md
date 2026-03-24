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
  - WASM: add_breakpoint, remove_breakpoint, update_breakpoint, get_breakpoints, get_breakpoint_count, get_active_breakpoint
  - Properties panel: Auto Layout 하위 Breakpoints 섹션 — 추가/제거/편집, label/max_width/direction/gap/wrap 오버라이드
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

## 완료된 기능 (추가 64)
- AI layout suggestion:
  - 선택된 노드들의 공간 배치 분석 (row/column/grid 패턴 감지)
  - Gap 계산 (평균 간격, nice value 반올림), cross-axis 정렬 감지 (start/center/end/stretch)
  - Grid 감지: Y좌표 기반 행 그룹핑, 컬럼 수 추론
  - Confidence score (0-1), 배치 일관성 기반
  - Floating suggestion card UI: 모드/gap/정렬 표시, Apply/Dismiss 버튼
  - Apply: 선택 노드를 auto-layout Frame으로 래핑 + 설정 적용
  - 단축키: Cmd/Ctrl+Shift+L, 컨텍스트 메뉴 "✨ Suggest Layout"
  - LLM Agent tool: suggest_layout, apply_layout_suggestion
  - Agent panel 명령: suggest-layout, apply-layout
  - ai-layout-suggest.ts 단일 파일 구현

## 완료된 기능 (추가 65)
- Node search spotlight (Cmd+P):
  - 플로팅 검색 패널: Cmd+P 토글, Escape 닫기, backdrop 클릭 닫기
  - 엔진 find_text 활용: 노드 이름 + Text 콘텐츠 case-insensitive 검색
  - 결과 리스트: kind badge, text preview, 최대 50개
  - 키보드 네비게이션: ↑↓ 선택, Enter 확정
  - 선택 + 줌: 노드 select + zoomToSelection 자동 이동
  - 80ms 디바운스, auto-focus input
  - ui/spotlight.ts 단일 파일 구현

## 다음 할 것
- Vector network editing (Figma-style vector networks — 포인트 간 다중 연결, fill 영역 자동 감지)
- Figma → OpenSketch import (.fig 파일 파싱 또는 Figma REST API로 디자인 가져오기)
- Shared component library (팀 간 공유 가능한 외부 컴포넌트 라이브러리 링크/동기화)
- Responsive token system (디자인 토큰 + 브레이크포인트 기반 반응형 프리뷰 자동 전환)
