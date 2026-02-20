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

Empty state: cursor icon + "Select an element"
Multi-select: "{n} elements selected"

## Bottom Toolbar

Centered, horizontal, floating:
- **Select** (arrow) + **Hand** (grab)
- Separator
- **Rectangle** + **Ellipse** + **Text** + **Frame**
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
