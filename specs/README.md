# OpenSketch Specs

This directory documents OpenSketch's architecture, features, and APIs.
**Always keep these files updated when making changes.**

| File | Contents |
|------|----------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Project structure, data model, WASM boundary, build |
| [ENGINE.md](./ENGINE.md) | Rust engine modules, types, dependencies |
| [UI.md](./UI.md) | Panel layout, design system, interactions |
| [AGENT-API.md](./AGENT-API.md) | 31 agent commands + structured API reference |
| [COMPONENTS.md](./COMPONENTS.md) | Component system: variants, slots, instances |
| [FEATURES.md](./FEATURES.md) | Feature log (done / in progress / future) |

## Quick Stats

- **~3,000 lines** of code (Rust + TypeScript)
- **7 Rust modules** in `crates/engine/src/`
- **7 UI modules** in `packages/app/src/ui/`
- **31 agent commands** across 6 categories
- **40+ WASM methods** exposed to JS
