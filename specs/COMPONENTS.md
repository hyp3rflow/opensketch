# OpenSketch Component System

## Overview

Components are reusable design elements with **variants** (different appearances based on property combinations) and **slots** (insertable content areas). Inspired by Figma's component system.

## Architecture

```
ComponentStore (separate from Scene)
├── Component #1 "Button"
│   ├── Properties: [disabled: boolean, size: string(sm|md|lg)]
│   ├── Slots: [icon, content]
│   └── Variants:
│       ├── "disabled=false,size=md" → VariantData (template nodes)
│       ├── "disabled=true,size=md"  → VariantData
│       └── "disabled=false,size=lg" → VariantData
└── Component #2 "Card"
    └── ...
```

## Data Model (Rust)

### VariantProp
```rust
enum VariantPropType {
    Boolean,
    String { options: Vec<String> },
}

struct VariantProp {
    name: String,
    prop_type: VariantPropType,
    default_value: VariantValue,
}
```

### VariantValue
```rust
enum VariantValue {
    Boolean(bool),
    String(String),
}
```

### VariantData
Each variant stores a full snapshot of template nodes:
```rust
struct VariantData {
    key: VariantKey,           // HashMap<String, VariantValue>
    root_node_id: NodeId,      // Source frame ID
    nodes: Vec<Node>,          // Deep clone of subtree
}
```

### SlotDef
```rust
struct SlotDef {
    name: String,
    placeholder_node_id: NodeId,  // Slot node in template
    default_children: Vec<NodeId>,
}
```

### Component
```rust
struct Component {
    id: ComponentId,
    name: String,
    description: String,
    properties: Vec<VariantProp>,
    slots: Vec<SlotDef>,
    variants: HashMap<String, VariantData>,  // serialized key → data
    default_variant_key: String,
}
```

### NodeKind Extensions
```rust
enum NodeKind {
    // ... existing kinds ...
    Slot { slot_name: String },       // Placeholder in templates
    Instance(Box<InstanceData>),      // Component instance
}

struct InstanceData {
    component_id: ComponentId,
    variant_values: VariantKey,
    slot_fills: HashMap<String, Vec<NodeId>>,
    overrides: HashMap<NodeId, NodeOverrides>,
}

struct NodeOverrides {
    text: Option<String>,
    fill_hex: Option<String>,
    visible: Option<bool>,
}
```

## Rendering

- **Component source** (⬡): rendered as Frame with "⬡" prefix label
- **Instance** (◇): rendered like Frame with green label (rgba(16, 185, 129, 0.7))
- **Slot** (⊞): dashed purple border (rgba(168, 85, 247, 0.5)) with label

## Workflow

### 1. Create Component
```
component create <frame_id> "Button"
```
Captures the frame's subtree as the default variant template. Marks the source frame with ⬡ prefix.

### 2. Add Variant Properties
```
component prop 1 "disabled" {"type":"boolean","default":false}
component prop 1 "size" {"type":"string","options":["sm","md","lg"],"default":"md"}
```

### 3. Add Variant Appearances
Create alternate frame designs, then register them:
```
component variant 1 {"disabled":"true","size":"md"} <frame_id>
```

### 4. Add Slots
Mark a child node as a slot placeholder:
```
component slot 1 "icon" <placeholder_node_id>
```

### 5. Create Instances
```
instance 1 600 150
```
Deep-clones the default variant's template at the given position.

### 6. Switch Variants
```
variant <instance_id> {"size":"lg","disabled":"false"}
```
Removes old children, clones new variant's template. The instance's width/height are updated to match the new variant's root node dimensions. If the instance's parent has auto-layout (Flex/Grid) or Hug sizing, the parent layout is automatically recomputed to accommodate the size change (recursive up the ancestor chain).

### 7. Fill Slots
```
slot fill <instance_id> "icon" <content_node_id>
```
Reparents a node into the slot placeholder.

### 8. Override Instance Properties
```
override <instance_id> <child_node_id> {"text":"Click Me!"}
```

## Agent Commands (9)

| Command | Description |
|---------|-------------|
| `component create <frame_id> "<name>"` | Create from frame |
| `component prop <id> "<name>" <type_json>` | Add variant property |
| `component variant <id> <key_json> <frame_id>` | Add variant |
| `component slot <id> "<name>" <placeholder_id>` | Add slot |
| `instance <comp_id> <x> <y>` | Create instance |
| `variant <instance_id> <key_json>` | Switch variant |
| `slot fill <instance_id> "<name>" <node_id>` | Fill slot |
| `components` | List all components |
| `override <instance_id> <node_id> <json>` | Override property |

## Style Override Indicators

Visual indicators showing which properties of an instance differ from the original component template.

### Detection (Rust)
- `get_instance_overridden_props(instance_id) -> JSON` — compares instance children vs template children by tree position
- Detected properties: fill, stroke, opacity, corner_radius, size, visible, blur, shadow, blend_mode, text, font_size, font_family, font_weight

### Reset (Rust)
- `reset_instance_overrides(instance_id, target_node_id) -> bool` — restores single child to template values
- `reset_all_instance_overrides(instance_id) -> bool` — restores all children, clears override data

### UI
- **Properties panel**: Blue override card showing count + per-node override list with individual reset buttons + "Reset All"
- **Layers panel**: Blue diamond (◆) badge on Instance nodes with overrides, click to reset all
- **Context menu**: "Reset Overrides" option for Instance nodes (enabled only when overrides exist)

## Component Search & Swap

Instances can swap their master component to a different one via a search dialog.

### Rust API (ComponentStore)
- `search_components(query: &str) -> Vec<&Component>` — case-insensitive substring search by name
- `swap_instance_component(instance_data, new_component_id) -> bool` — updates instance's component_id, resets variants/overrides

### WASM Bindings (Engine)
- `search_components(query: &str) -> String` — returns JSON `[{id, name, description, variant_count}]`
- `swap_instance_component(instance_id: u64, new_comp_id: u64) -> bool` — removes old children, re-clones from new component's default variant

### Smart Swap Suggestions
- `suggest_component_swaps(instance_id: u64, max_results: usize) -> String` — scores all components by similarity to the instance's current component
- Scoring: size similarity (40%), slot count (25%), property count (20%), variant count (15%)
- Returns JSON `[{id, name, score, reason}]` sorted by score descending

### TypeScript UI
- **component-swap.ts**: `openComponentSwapModal(editor)` — modal dialog with search, swap, and smart suggestions
- When an Instance node is selected, a "✨ Suggested swaps" section appears with one-click swap buttons
- **properties-panel.ts**: Instance nodes show a "Swap" button next to "Go to →" in the component info card

## Component Documentation

Each component carries a `ComponentDoc` struct for design system documentation.

### Data Model
```rust
struct ComponentDoc {
    guidelines: String,                    // Usage guidelines (markdown)
    tags: Vec<String>,                     // Categorization tags
    links: Vec<(String, String)>,          // (label, url) external links
    prop_docs: Vec<PropDoc>,               // Per-property documentation
    examples: Vec<ComponentExample>,       // Usage examples
    changelog: Vec<String>,               // Version history (newest first)
}

struct PropDoc { name, description, default_display }
struct ComponentExample { title, description, variant_key? }
```

### WASM API
- `get_component_doc(comp_id) -> JSON`
- `set_component_description(comp_id, desc) -> bool`
- `set_component_guidelines(comp_id, guidelines) -> bool`
- `set_component_tags(comp_id, tags_csv) -> bool`
- `add_component_link(comp_id, label, url) / remove_component_link(comp_id, index) -> bool`
- `set_component_prop_doc(comp_id, name, desc, default) / remove_component_prop_doc(comp_id, name) -> bool`
- `add_component_example(comp_id, title, desc) / remove_component_example(comp_id, index) -> bool`
- `add_component_changelog(comp_id, entry) -> bool`
- `export_component_docs() -> JSON` (all components)

### UI
- **Right pane "Docs" tab**: Shows documentation for selected component/instance
- Editable fields: description, guidelines (markdown), tags, property docs, examples, links, changelog
- Export all docs as JSON
- **LLM Agent**: 8 tools for reading/writing component documentation

### Backward Compatibility
- `ComponentDoc` uses `#[serde(default)]` — existing files load with empty docs

## Variant Matrix View

A fullscreen overlay displaying all variant combinations of a component in a grid.

### Concept
- **Row axis**: first variant property (e.g. Size: S/M/L)
- **Column axis**: second variant property (e.g. State: default/hover/disabled)
- **Extra filters**: 3+ properties appear as dropdown filters above the grid
- Each cell renders a mini canvas preview of that variant combination
- Click a cell to create a playground instance

### Rust API
- `component_playground::generate_variant_matrix(store, comp_id, extra_values_json) -> VariantMatrix`
- `VariantMatrix` struct: component_id, component_name, row_prop, col_prop, extra_props, cells, row_count, col_count

### WASM
- `get_variant_matrix(comp_id, extra_values_json) -> JSON`

### UI
- **Keyboard**: Cmd/Ctrl+Shift+M (opens for selected instance's component, or first component)
- Fullscreen dark overlay with grid layout
- Column/row headers labeled with property values
- Cells: 160×120 canvas previews with size labels
- Missing variants shown as dashed empty cells
- Filter dropdowns for extra properties (live refresh)
- `variant-matrix.ts`

## Responsive Variant Auto-Switch

Automatically switch Instance variants based on parent Frame width during resize.

### Concept
- Each Instance can have **responsive rules**: `{ label, max_width, variant_key }`
- When a Frame is resized, all Instance children with responsive rules are checked
- Rules sorted by `max_width` ascending; first rule where `frame_width <= max_width` wins
- If no rule matches, the instance keeps its current variant

### Example
- Rule: `{ label: "Mobile", max_width: 375, variant_key: { "Size": "Small" } }`
- Rule: `{ label: "Tablet", max_width: 768, variant_key: { "Size": "Medium" } }`
- Frame resized to 320px → "Mobile" rule matches → variant switches to Small

### Rust API
- `ResponsiveVariantRule` struct in `component.rs`
- `InstanceData.responsive_rules: Vec<ResponsiveVariantRule>` (serde default)

### WASM
- `add_responsive_variant_rule(instance_id, label, max_width, variant_key_json) -> bool`
- `remove_responsive_variant_rule(instance_id, index) -> bool`
- `get_responsive_variant_rules(instance_id) -> JSON`
- `clear_responsive_variant_rules(instance_id) -> bool`
- `apply_responsive_variants(frame_id) -> u32` (number switched)

### UI
- Properties panel shows "RESPONSIVE VARIANTS" section for Instance nodes
- Add rule: prompt for label + max_width, uses current variant as target
- Delete individual rules with × button
- Auto-applied on frame resize (pointerup after resize handle drag)

---

## Component Properties (Figma-style Prop Controls)

Expose Boolean, Text, and Instance Swap properties on components so instances can edit them directly in the Properties panel.

### Data Model

```rust
enum ComponentProperty {
    BooleanProp { name, default: bool, linked_node_id },
    TextProp { name, default: String, linked_node_id },
    InstanceSwapProp { name, default_component_id, linked_slot_id },
}

enum PropValue {
    Boolean(bool),
    Text(String),
    InstanceSwap(ComponentId),
}

// Component.component_properties: Vec<ComponentProperty>
// InstanceData.property_overrides: HashMap<String, PropValue>
```

### Behavior
- **BooleanProp**: Toggle linked node's `visible` field in the instance
- **TextProp**: Change linked Text node's `content` in the instance
- **InstanceSwapProp**: Swap linked Slot's component in the instance
- Linked nodes are matched by name (template name → instance child name)
- Overrides are stored per-instance; reset reverts to component default
- Instance creation/component swap/variant-set swap 시에도 property default를 즉시 materialize하여 기본 상태가 실제 자식 노드에 반영됨
- All fields use `#[serde(default)]` for backward compatibility

### WASM API
- `add_component_property(component_id, prop_json) -> bool`
- `remove_component_property(component_id, prop_name) -> bool`
- `get_component_properties(component_id) -> JSON`
- `set_instance_prop_override(instance_id, prop_name, value_json) -> bool`
- `get_instance_prop_values(instance_id) -> JSON` (merged defaults + overrides)
- `reset_instance_prop(instance_id, prop_name) -> bool`

### UI
- **Component source** (node name `[C] ...`): "COMPONENT PROPERTIES" section with add/remove
  - Add dialog: type (boolean/text/instance_swap), name, default, linked node ID
  - Property list with type badge, name, remove button
- **Instance**: "COMPONENT PROPS" section
  - Boolean: toggle switch (amber color)
  - Text: text input field
  - Instance swap: component dropdown
  - Override indicator: blue dot + reset (↺) button

## Interactive Components

Instances can auto-switch variants based on user interaction states (hover, press, focus, disabled).

### Data Model
```rust
enum InteractiveState { Default, Hover, Press, Focus, Disabled }

// In InstanceData:
interactive_variants: HashMap<InteractiveState, VariantKey>  // #[serde(default)]
```

### WASM API
- `set_interactive_variant(instance_id, state, variant_key_json) -> bool`
- `get_interactive_variants(instance_id) -> JSON` — `{ "hover": {...}, "press": {...} }`
- `clear_interactive_variant(instance_id, state) -> bool`
- `apply_interactive_state(instance_id, state) -> bool` — switches variant, falls back to Default

### UI (Properties Panel)
- Instance selected → "INTERACTIVE VARIANTS" section (green accent)
- For each state (hover/press/focus/disabled): dropdown to select target variant
- "None" option to clear mapping

### Prototype Viewer Integration
- **Hover**: `mouseenter` → apply "hover" state, `mouseleave` → revert to original
- **Press**: `mousedown` → apply "press" state, `mouseup` → revert to "hover" (if still hovering) or original
- Walks parent chain to find nearest instance with interactive variants
- Saves original variant key for clean revert

---

## Interactive Components

Component instances can map **interactive states** (Hover, Press, Focus, Disabled) to specific variant keys. In the prototype viewer, these states are automatically triggered by user mouse/touch interactions, causing the instance to visually switch variants in real-time.

### Data Model

```rust
enum InteractiveState {
    Default, Hover, Press, Focus, Disabled,
}

// Added to InstanceData:
pub interactive_variants: HashMap<InteractiveState, VariantKey>
```

### WASM API
- `set_interactive_variant(instance_id, state, variant_key_json) -> bool`
- `get_interactive_variants(instance_id) -> JSON` — `{ "hover": {...}, "press": {...} }`
- `clear_interactive_variant(instance_id, state) -> bool`
- `apply_interactive_state(instance_id, state) -> bool` — switches variant, fallback to Default

### Properties Panel
- **"INTERACTIVE VARIANTS"** section (pink card) on Instance selection
- Per-state (hover/press/focus/disabled) dropdown to select target variant
- Hint text explains prototype viewer behavior

### Prototype Viewer Behavior
- **Hover**: mouse enters instance → apply hover variant; leaves → revert to original
- **Press**: mousedown → apply press variant
- **Release**: mouseup → revert to hover (if still hovering) or original
- Falls back to Default state mapping if specific state has no mapping
- Original variant saved/restored for seamless revert
- Backward-compatible: instances without interactive variants behave as before

## Component Sets

Component Sets group multiple related components into a single visual unit with shared variant axes, similar to Figma's Component Set feature.

### Data Model

```rust
struct VariantAxis {
    name: String,        // e.g. "Size", "State", "Theme"
    values: Vec<String>, // e.g. ["Small", "Medium", "Large"]
}

struct ComponentSet {
    id: ComponentSetId,
    name: String,
    description: String,
    axes: Vec<VariantAxis>,
    variant_map: HashMap<String, ComponentId>,  // "Size=Small,State=Default" → comp_id
    component_ids: Vec<ComponentId>,
}
```

### WASM API

| Method | Description |
|--------|-------------|
| `create_component_set(name, ids_json)` | Create set from component IDs |
| `add_component_set_axis(set_id, name, values_json)` | Add variant axis |
| `update_component_set_axis(set_id, name, values_json)` | Update axis values |
| `remove_component_set_axis(set_id, name)` | Remove axis |
| `set_component_set_variant_mapping(set_id, values_json, comp_id)` | Map axis values → component |
| `add_component_to_set(set_id, comp_id)` | Add component to set |
| `remove_component_from_set(set_id, comp_id)` | Remove component from set |
| `delete_component_set(set_id)` | Delete entire set |
| `get_component_set_info(set_id)` | Get set details as JSON |
| `list_component_sets()` | List all sets |
| `get_instance_component_set_info(instance_id)` | Get set info for an instance |
| `switch_instance_set_variant(instance_id, values_json)` | Switch instance to different set variant |
| `get_component_set_render_info()` | Get bounds for rendering dashed borders |

### Visual Rendering

- Component Sets are rendered with a **dashed purple border** (#8b5cf6) around all member components
- Purple label pill shows the set name above the border
- 20px padding around the grouped components' bounding box
- Rendered as a canvas overlay (not a scene node)

### Properties Panel

When an Instance node is selected and its component belongs to a Component Set:
- A purple "COMPONENT SET" section appears with the set name
- Each axis shows a dropdown with available values
- Changing a dropdown switches the instance to the component matching the new axis combination
- The instance's component_id, variant_values, and children are swapped accordingly

### Integration

- Stored in `ComponentStore.component_sets` (serde-compatible, `#[serde(default)]`)
- Undo-compatible via existing scene snapshot mechanism
- Component Sets are metadata-only; they don't create new NodeKind variants
- Backward-compatible: existing documents without sets work unchanged
