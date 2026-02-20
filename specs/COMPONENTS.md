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
Removes old children, clones new variant's template.

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
