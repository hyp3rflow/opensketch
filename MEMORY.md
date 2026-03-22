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

## 📋 Backlog
- Tauri desktop build (scaffolded but not tested)
- Styles library (shared color/text styles)
- Flatten selection
- Inspect mode (CSS code gen)
- Layout grid overlay

## 🏗 Architecture Notes
- Rust WASM engine: `crates/engine/src/`
- TypeScript app: `packages/app/src/`
- WASM build: `cd crates/engine && wasm-pack build --target web --out-dir ../../packages/app/src/wasm`
- Dev server: port 5174
- Boolean ops use `i_overlay` crate for polygon clipping
