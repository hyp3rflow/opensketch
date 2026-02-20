use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use crate::node::{Node, NodeId};

pub type ComponentId = u64;

/// A variant property definition
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum VariantPropType {
    Boolean,
    String { options: Vec<String> },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VariantProp {
    pub name: String,
    pub prop_type: VariantPropType,
    pub default_value: VariantValue,
}

/// A concrete variant value
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum VariantValue {
    Boolean(bool),
    String(String),
}

impl VariantValue {
    pub fn to_display(&self) -> String {
        match self {
            VariantValue::Boolean(b) => b.to_string(),
            VariantValue::String(s) => s.clone(),
        }
    }
}

/// A variant key: map of property name → value
pub type VariantKey = HashMap<String, VariantValue>;

fn variant_key_to_string(key: &VariantKey) -> String {
    let mut parts: Vec<_> = key.iter().map(|(k, v)| format!("{}={}", k, v.to_display())).collect();
    parts.sort();
    parts.join(",")
}

/// Slot definition on a component
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SlotDef {
    pub name: String,
    /// The placeholder node ID within the component's template tree
    pub placeholder_node_id: NodeId,
    /// Optional default children (node IDs in template)
    pub default_children: Vec<NodeId>,
}

/// A variant entry holds a snapshot of nodes for that variant combination
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VariantData {
    pub key: VariantKey,
    /// Root node ID of the template subtree for this variant
    pub root_node_id: NodeId,
    /// All template nodes for this variant (deep clone of subtree)
    pub nodes: Vec<Node>,
}

/// Component definition
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Component {
    pub id: ComponentId,
    pub name: String,
    pub description: String,
    /// Variant property definitions
    pub properties: Vec<VariantProp>,
    /// Slot definitions
    pub slots: Vec<SlotDef>,
    /// Variant data: serialized key → VariantData
    pub variants: HashMap<String, VariantData>,
    /// Default variant key string
    pub default_variant_key: String,
}

impl Component {
    pub fn new(id: ComponentId, name: String) -> Self {
        Self {
            id,
            name,
            description: String::new(),
            properties: vec![],
            slots: vec![],
            variants: HashMap::new(),
            default_variant_key: String::new(),
        }
    }

    pub fn default_key(&self) -> VariantKey {
        self.properties.iter().map(|p| (p.name.clone(), p.default_value.clone())).collect()
    }

    pub fn get_variant(&self, key: &VariantKey) -> Option<&VariantData> {
        let key_str = variant_key_to_string(key);
        self.variants.get(&key_str).or_else(|| self.variants.get(&self.default_variant_key))
    }

    pub fn set_variant(&mut self, key: VariantKey, data: VariantData) {
        let key_str = variant_key_to_string(&key);
        if self.variants.is_empty() {
            self.default_variant_key = key_str.clone();
        }
        self.variants.insert(key_str, data);
    }
}

/// Instance overrides: what an instance can customize
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InstanceData {
    pub component_id: ComponentId,
    /// Current variant values
    pub variant_values: VariantKey,
    /// Slot fills: slot name → list of child node IDs (in the instance's own scene nodes)
    pub slot_fills: HashMap<String, Vec<NodeId>>,
    /// Per-node property overrides (node_id_in_template → overridden properties)
    pub overrides: HashMap<NodeId, NodeOverrides>,
}

/// Overridable properties on instance children
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct NodeOverrides {
    pub text: Option<String>,
    pub fill_hex: Option<String>,
    pub visible: Option<bool>,
}

/// The component store
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ComponentStore {
    components: HashMap<ComponentId, Component>,
    next_id: ComponentId,
}

impl ComponentStore {
    pub fn new() -> Self {
        Self {
            components: HashMap::new(),
            next_id: 1,
        }
    }

    pub fn create(&mut self, name: String) -> ComponentId {
        let id = self.next_id;
        self.next_id += 1;
        self.components.insert(id, Component::new(id, name));
        id
    }

    pub fn get(&self, id: ComponentId) -> Option<&Component> {
        self.components.get(&id)
    }

    pub fn get_mut(&mut self, id: ComponentId) -> Option<&mut Component> {
        self.components.get_mut(&id)
    }

    pub fn remove(&mut self, id: ComponentId) -> Option<Component> {
        self.components.remove(&id)
    }

    pub fn list(&self) -> Vec<&Component> {
        let mut v: Vec<_> = self.components.values().collect();
        v.sort_by_key(|c| c.id);
        v
    }

    pub fn export(&self) -> Vec<Component> {
        self.components.values().cloned().collect()
    }

    pub fn import(&mut self, components: Vec<Component>) {
        for c in components {
            if c.id >= self.next_id {
                self.next_id = c.id + 1;
            }
            self.components.insert(c.id, c);
        }
    }
}
