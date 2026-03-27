# OpenSketch UI Specification

## Layout

Figma-inspired floating panel layout over a dark canvas (`#1a1a1a`).

```
┌──────────────────────────────────────────────────────────┐
│  ┌─────────┐                              ┌──────────┐  │
│  │  Left    │                              │  Right   │  │
│  │  Panel   │        Canvas               │  Props   │  │
│  │          │                              │  Panel   │  │
│  │ Layers   │                              │          │  │
│  │ Design   │                              │          │  │
│  └─────────┘                              └──────────┘  │
│                                                    🤖    │
│                ┌──────────────┐          ┌──────────┐    │
│                │   Toolbar    │          │  Agent   │    │
│                └──────────────┘          │  Panel   │    │
│                                          └──────────┘    │
└──────────────────────────────────────────────────────────┘
```

## Design System

- **Background**: `#1a1a1a`
- **Panels**: `#252525`, `border-radius: 12px`, `box-shadow: 0 2px 8px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.06)`
- **No hard borders** — only soft shadows + 1px rgba outline
- **Text**: `#ccc` (primary), `#888` (secondary), `#555` (tertiary)
- **Accent**: `#4a4af5` (selection, active states)
- **Font**: `Inter, system-ui, -apple-system, sans-serif` at `12px`
- **Inputs**: `#333` background, `#444` border, `#4a4af5` focus border

## Left Panel (280px)

Two tabs: **LAYERS** | **DESIGN**

### Layers Tab
- **Tree view**: nodes indented by parent depth (16px per level)
- **Expand/collapse**: ▶/▼ arrow for nodes with children (Frame/Group)
- Each row: arrow + type icon (SVG) + name + eye/eyeOff visibility toggle
- Frame/Group names rendered in **bold**
- Click → select node on canvas
- Collapse state persisted per session
- Icons: rect (□), ellipse (○), text (T), frame (⊡)

### Design Tab
Three sub-tabs: **Colors** | **Type** | **Space**

#### Colors
- Grid of color swatches (6 columns)
- Default: 24 colors (12 neutrals + 8 primaries + 4 semantics)
- Click → apply fill to selection
- Right-click → apply stroke to selection
- Hover: scale 1.2 + shadow
- "+ Add color" button

#### Typography
- List of named styles (Display, H1–H4, Body L/M/S, Caption, Overline, Code)
- Each shows preview in actual font/size/weight
- Click → apply to selected text node

#### Spacing
- 9 scale levels (2–64px)
- Visual bar chart proportional to value
- Click selects for reference

All design tokens persist in `localStorage`.

## Right Panel (Properties, 260px)

Shows properties of selected node(s):
- **Name** (editable input) + **type badge**
- **Position**: X, Y inputs
- **Size**: W, H inputs
- **Rotation**: degree input with icon
- **Corner radius** (Rect/Frame only)
- **Opacity**: slider + percentage input
- **Fill**: color picker + hex input + alpha
- **Stroke**: color picker + hex + width + "Add stroke" button
- **Text** (Text nodes only): content textarea, font family dropdown (14 fonts), font size input

- **Component Instance**: green card with component name + "Go to →" button
- **Variant Picker** (Instance with variant props): purple "VARIANTS" section
  - Boolean props: toggle switch (on/off)
  - String props: dropdown select with options
  - Changes trigger `set_instance_variant()` → re-renders instance with new variant

Empty state: cursor icon + "Select an element"
Multi-select: "{n} elements selected"

## Inspect Panel (Right Pane Tab)

"Inspect" tab in right pane — generates CSS code from selected node:
- **CSS code block**: VS Code-style syntax highlighting (dark theme)
- **SVG attributes**: Separate section for stroke-dasharray, linecap, linejoin
- **Copy button**: Copies all CSS to clipboard with "Copied!" feedback
- Properties covered: dimensions, position, border-radius, background (solid/gradient), opacity, border, box-shadow, blur, blend-mode, rotation, text props, flex/grid layout
- Empty state: "Select an element to inspect CSS"

## Bottom Toolbar

Centered, horizontal, floating:
- **Select** (arrow) + **Hand** (grab)
- Separator
- **Rectangle** + **Ellipse** + **Text** + **Frame** + **Star** (S) + **Polygon** (G) + **Table** (B) + **Table** (B)
- Active tool: `#4a4af5` background + white icon

## Agent Panel (300×360px)

Toggle: 🤖 button (bottom-right)
- Chat-style message list
- User messages: blue, right-aligned
- Agent messages: gray, left-aligned
- System messages: italic, centered, dimmed
- Input + send button at bottom
- "online" status badge

## Icons

All icons are inline SVGs in `icons.ts` (Lucide-inspired, MIT compatible).
Available: select, hand, rect, ellipse, text, frame, eye, eyeOff, rotation, cornerRadius, opacity, strokeWidth, fontSize.

## Interactions

- **Click** canvas → select node
- **Drag** canvas → move selected / create shape (based on tool)
- **Space+drag** → pan
- **Scroll wheel** → zoom (batched via rAF)
- **Double-click text** → inline edit (hidden contentEditable)
- **Selection handles** → resize (8 handles)
- **Pointer events** with setPointerCapture for drag
- **Frame labels** scale inversely with zoom (max 11px screen)

### Mask Toggle
- Located in Properties panel → Appearance section (after opacity)
- Checkbox labeled "Use as mask"
- Layers panel shows "M" badge (purple) on mask nodes

### Rulers & Guides
- Horizontal ruler at top (20px height), vertical ruler at left (20px width)
- Corner square (20×20) at top-left intersection
- Dark background (#2a2a2a) matching floating panels
- Tick marks: major ticks (10px) with labels, minor ticks (5px), adaptive spacing
- Drag from ruler to create guide line (blue #4a90d9)
- Guide lines span full canvas, dragging shows lighter blue (#6db3f8)
- Double-click guide to remove, drag back to ruler to remove
- Guides snap with existing smart-guides system

### Keyboard Shortcuts Panel (Customizable)
- Centered modal overlay (640px wide, max 70vh height)
- Toggle: Cmd+/ or ? key; close: ESC or backdrop click
- Dark panel (#2a2a2a) with header, search input, and categorized shortcut list
- Categories: Tools, Edit, View, Panels, Boolean, Misc
- Each row shows description (left) and kbd-styled key badges (right)
- Search filters shortcuts in real-time across all categories
- **Customization**: Click ✎ button on any shortcut to rebind — press new key combo to assign
- **Conflict detection**: warns if proposed binding conflicts with another action, option to override
- **Reset**: per-shortcut ↺ reset button (visible for custom bindings), "Reset All" header button
- **Import/Export**: JSON file export/import for sharing custom keybindings
- Custom bindings persisted in localStorage, highlighted with purple kbd badges
- ShortcutManager singleton: central registry with `matches(event, actionId)` API
- Editor keydown handler uses ShortcutManager for all tool + action shortcuts
- Files: `packages/app/src/ui/shortcut-manager.ts`, `packages/app/src/ui/shortcuts-panel.ts`
