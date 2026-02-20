# OpenSketch

Figma-like design tool powered by Rust + WASM.

## Architecture

- **Engine** (`crates/engine/`): Rust → WASM canvas rendering engine
  - Scene graph, hit testing, 2D transforms
  - Renders via Canvas 2D API
- **App** (`packages/app/`): TypeScript frontend
  - Tool system, UI panels, keyboard shortcuts

## Development

### Prerequisites
- Rust + wasm-pack (`cargo install wasm-pack`)
- Node.js + pnpm

### Build & Run
```bash
# Build WASM
cd crates/engine && wasm-pack build --target web --out-dir ../../packages/app/src/wasm

# Run dev server
cd packages/app && pnpm install && pnpm dev
```

### Keyboard Shortcuts
- **V**: Select tool
- **H**: Hand (pan) tool
- **R**: Rectangle
- **O**: Ellipse
- **T**: Text
- **F**: Frame
- **Space + Drag**: Pan
- **Ctrl/⌘ + Scroll**: Zoom
- **Delete/Backspace**: Delete selected
- **Escape**: Deselect all
- **Shift + Click**: Multi-select
