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

/// Documentation for a component property
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PropDoc {
    pub name: String,
    pub description: String,
    pub default_display: String,
}

/// Usage example for a component
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ComponentExample {
    pub title: String,
    pub description: String,
    /// Optional variant key to show for this example
    pub variant_key: Option<VariantKey>,
}

/// Full documentation for a component
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ComponentDoc {
    /// Detailed usage guidelines (markdown)
    pub guidelines: String,
    /// Tags for categorization / search
    pub tags: Vec<String>,
    /// External links (e.g. design system docs, Storybook)
    pub links: Vec<(String, String)>,
    /// Per-property documentation
    pub prop_docs: Vec<PropDoc>,
    /// Usage examples
    pub examples: Vec<ComponentExample>,
    /// Changelog entries (newest first)
    pub changelog: Vec<String>,
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
    /// Documentation
    #[serde(default)]
    pub doc: ComponentDoc,
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
            doc: ComponentDoc::default(),
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
    /// Responsive variant rules: auto-switch variant based on parent frame width
    #[serde(default)]
    pub responsive_rules: Vec<ResponsiveVariantRule>,
}

/// Responsive variant rule: when parent width <= max_width, switch to this variant
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ResponsiveVariantRule {
    /// Label for UI (e.g. "Mobile", "Tablet")
    pub label: String,
    /// Maximum width at which this rule activates (inclusive)
    pub max_width: f64,
    /// Target variant key to switch to
    pub variant_key: VariantKey,
}

/// Overridable properties on instance children
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct NodeOverrides {
    pub text: Option<String>,
    pub fill_hex: Option<String>,
    pub visible: Option<bool>,
}

/// A shared component library (importable/exportable bundle)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ComponentLibrary {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub version: String,
    pub components: HashMap<ComponentId, Component>,
}

/// The component store
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ComponentStore {
    components: HashMap<ComponentId, Component>,
    next_id: ComponentId,
    #[serde(default)]
    pub linked_libraries: Vec<ComponentLibrary>,
}

impl ComponentStore {
    pub fn new() -> Self {
        Self {
            components: HashMap::new(),
            next_id: 1,
            linked_libraries: Vec::new(),
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

    /// Search components by name (case-insensitive substring match)
    pub fn search_components(&self, query: &str) -> Vec<&Component> {
        let q = query.to_lowercase();
        let mut results: Vec<_> = self.components.values()
            .filter(|c| c.name.to_lowercase().contains(&q))
            .collect();
        results.sort_by_key(|c| c.id);
        results
    }

    /// Export selected components as a ComponentLibrary JSON string
    pub fn export_library(&self, name: &str, version: &str, component_ids: &[ComponentId]) -> ComponentLibrary {
        let mut comps = HashMap::new();
        for &id in component_ids {
            if let Some(c) = self.components.get(&id) {
                comps.insert(id, c.clone());
            }
        }
        ComponentLibrary {
            id: format!("lib-{}", self.next_id.wrapping_add(9999)),
            name: name.to_string(),
            version: version.to_string(),
            components: comps,
        }
    }

    /// Import a component library: merge components, add to linked_libraries
    pub fn import_library(&mut self, lib: ComponentLibrary) {
        for (_, comp) in &lib.components {
            let new_id = self.next_id;
            self.next_id += 1;
            let mut new_comp = comp.clone();
            new_comp.id = new_id;
            self.components.insert(new_id, new_comp);
        }
        self.linked_libraries.push(lib);
    }

    /// Get linked libraries info
    pub fn get_linked_libraries_info(&self) -> Vec<(&str, &str, &str, usize)> {
        self.linked_libraries.iter()
            .map(|l| (l.id.as_str(), l.name.as_str(), l.version.as_str(), l.components.len()))
            .collect()
    }

    /// Unlink a library by id
    pub fn unlink_library(&mut self, library_id: &str) -> bool {
        let before = self.linked_libraries.len();
        self.linked_libraries.retain(|l| l.id != library_id);
        self.linked_libraries.len() < before
    }

    /// Sync a linked library: update its components, refresh matching components in store
    pub fn sync_library(&mut self, library_id: &str, updated_lib: ComponentLibrary) -> u32 {
        let mut synced = 0u32;
        // Update components in store that match by name
        for (_, lib_comp) in &updated_lib.components {
            let existing_id = self.components.iter()
                .find(|(_, c)| c.name == lib_comp.name)
                .map(|(&id, _)| id);
            if let Some(eid) = existing_id {
                let mut updated_comp = lib_comp.clone();
                updated_comp.id = eid;
                self.components.insert(eid, updated_comp);
                synced += 1;
            }
        }
        // Update the linked library entry
        if let Some(lib) = self.linked_libraries.iter_mut().find(|l| l.id.as_str() == library_id) {
            *lib = updated_lib;
        }
        synced
    }

    /// Swap an instance's master component. Returns the new component_id on success.
    /// This updates the instance's component_id, resets variant values to defaults,
    /// and clears overrides/slot fills.
    pub fn swap_instance_component(
        &self,
        instance_data: &mut crate::component::InstanceData,
        new_component_id: ComponentId,
    ) -> bool {
        if let Some(comp) = self.components.get(&new_component_id) {
            instance_data.component_id = new_component_id;
            instance_data.variant_values = comp.default_key();
            instance_data.slot_fills.clear();
            instance_data.overrides.clear();
            true
        } else {
            false
        }
    }
}
