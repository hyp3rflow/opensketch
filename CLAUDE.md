# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Build WASM engine (required before first run and after Rust changes)
cd crates/engine && wasm-pack build --target web --out-dir ../../packages/app/src/wasm
# Or from packages/app:
cd packages/app && pnpm wasm

# Install dependencies & run dev server (http://localhost:5173)
cd packages/app && pnpm install && pnpm dev

# Production build
cd packages/app && pnpm build

# Desktop via Tauri (requires cargo-tauri CLI)
cargo tauri dev
```

**Prerequisites:** Rust + wasm-pack (`cargo install wasm-pack`), Node.js + pnpm

There are no tests or linting configured in this project.

## Architecture

OpenSketch is a Figma-like vector design tool with a **Rust/WASM engine** and **vanilla TypeScript frontend** (no framework).

### Rust Engine (`crates/engine/src/`)

The engine owns all state: scene graph, selection, undo/redo, layout, and rendering.

- **`lib.rs`** — WASM entry point. `Engine` struct exposes 40+ `#[wasm_bindgen]` methods (create nodes, modify properties, selection, import/export, render)
- **`node.rs`** — `Node` struct and `NodeKind` enum (Rect, Ellipse, Text, Frame, Group, Slot, Instance). Includes `Fill`, `Stroke`, `Layout` types
- **`scene.rs`** — Flat `HashMap<NodeId, Node>` with tree structure via parent/children fields. `root_children` defines render order
- **`render.rs`** — Canvas2D renderer: grid, nodes, selection handles, frame labels, text layout
- **`layout.rs`** — Flex (row/column) and Grid layout computation
- **`component.rs`** — Component/variant/slot/instance system
- **`transform.rs`** — Viewport pan/zoom (affine 2D transform)
- **`hit_test.rs`** — Point-in-bounds detection, reverse render order
- **`types.rs`** — `Point`, `Size`, `Rect`, `Color`

### TypeScript Frontend (`packages/app/src/`)

- **`main.ts`** — App bootstrap, panel initialization, demo scene creation
- **`editor.ts`** — Core `Editor` class: canvas setup, DPI scaling, pointer/wheel/keyboard events, tool state machine (select, hand, rect, ellipse, text, frame), drag/resize, undo/redo, render loop
- **`wasm.ts`** — Dynamic WASM module loader
- **`ui/properties-panel.ts`** — Right panel for editing node properties (position, size, fill, stroke, text, opacity, layout)
- **`ui/agent-panel.ts`** — Agent command execution with 31 text commands, chat UI
- **`ui/llm-agent.ts`** — OpenAI-compatible LLM integration with function calling
- **`ui/layers-panel.ts`** — Layer tree with expand/collapse and visibility toggles
- **`ui/toolbar.ts`** — Bottom floating toolbar for tool selection
- **`ui/design-system.ts`** — Design tokens: colors, typography, spacing
- **`ui/note-overlay.ts`** — Markdown note annotations on canvas
- **`ui/icons.ts`** — Inline SVG icons
- **`ui/styles.css`** — All UI styling (dark theme)

### WASM Boundary

All node IDs cross the boundary as `u64` (Rust) ↔ `BigInt` (JS). The TypeScript side converts `Number ↔ BigInt` at the boundary.

### Data Flow

User input → `Editor` (event handling) → `Engine` (WASM, mutates scene graph) → `Renderer` (Canvas2D) → UI panels reflect selection/state.

### Layout

- Left panel (280px): Layers tab + Design System tab
- Center: Canvas with grid background
- Right panel (260px): Properties tab + Agent tab
- Bottom: Floating toolbar

## Specs

Detailed architecture docs live in `/specs/` (ARCHITECTURE.md, ENGINE.md, COMPONENTS.md, AGENT-API.md, UI.md, FEATURES.md).
