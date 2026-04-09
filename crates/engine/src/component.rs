use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use crate::node::{Node, NodeId};

// =============================================
// Interactive States (hover/press/focus/disabled)
// =============================================

/// Interactive state for component instances — auto-switches variant on user interaction
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum InteractiveState {
    Default,
    Hover,
    Press,
    Focus,
    Disabled,
}

impl InteractiveState {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "default" | "Default" => Some(InteractiveState::Default),
            "hover" | "Hover" => Some(InteractiveState::Hover),
            "press" | "Press" => Some(InteractiveState::Press),
            "focus" | "Focus" => Some(InteractiveState::Focus),
            "disabled" | "Disabled" => Some(InteractiveState::Disabled),
            _ => None,
        }
    }

    pub fn to_str(&self) -> &'static str {
        match self {
            InteractiveState::Default => "default",
            InteractiveState::Hover => "hover",
            InteractiveState::Press => "press",
            InteractiveState::Focus => "focus",
            InteractiveState::Disabled => "disabled",
        }
    }

    pub fn all() -> &'static [InteractiveState] {
        &[
            InteractiveState::Default,
            InteractiveState::Hover,
            InteractiveState::Press,
            InteractiveState::Focus,
            InteractiveState::Disabled,
        ]
    }
}

pub type ComponentId = u64;

// =============================================
// Component Properties (Figma-style)
// =============================================

/// A component property definition (Boolean, Text, InstanceSwap)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum ComponentProperty {
    BooleanProp {
        name: String,
        default: bool,
        /// Node ID within the component template whose visibility is toggled
        linked_node_id: NodeId,
    },
    TextProp {
        name: String,
        default: String,
        /// Node ID of the Text node within the component template
        linked_node_id: NodeId,
    },
    InstanceSwapProp {
        name: String,
        /// Default component ID for the slot
        default_component_id: ComponentId,
        /// Node ID of the Slot node within the component template
        linked_slot_id: NodeId,
    },
}

impl ComponentProperty {
    pub fn name(&self) -> &str {
        match self {
            ComponentProperty::BooleanProp { name, .. } => name,
            ComponentProperty::TextProp { name, .. } => name,
            ComponentProperty::InstanceSwapProp { name, .. } => name,
        }
    }

    pub fn prop_type_str(&self) -> &'static str {
        match self {
            ComponentProperty::BooleanProp { .. } => "boolean",
            ComponentProperty::TextProp { .. } => "text",
            ComponentProperty::InstanceSwapProp { .. } => "instance_swap",
        }
    }
}

/// A concrete property value override on an instance
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum PropValue {
    Boolean(bool),
    Text(String),
    InstanceSwap(ComponentId),
}

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
    /// Component properties (Boolean/Text/InstanceSwap) — Figma-style
    #[serde(default)]
    pub component_properties: Vec<ComponentProperty>,
    /// Variant-specific default values for component properties.
    /// key: canonical variant key string (e.g. "Size=Large,State=Default")
    /// value: prop name -> default value
    #[serde(default)]
    pub variant_property_defaults: HashMap<String, HashMap<String, PropValue>>,
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
            component_properties: vec![],
            variant_property_defaults: HashMap::new(),
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
    /// Component property overrides (prop_name → PropValue)
    #[serde(default)]
    pub property_overrides: HashMap<String, PropValue>,
    /// Interactive state → variant key mapping (hover/press/focus/disabled auto-switch)
    #[serde(default)]
    pub interactive_variants: HashMap<InteractiveState, VariantKey>,
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

pub type ComponentSetId = u64;

/// A variant axis definition for a component set (e.g. Size: [Small, Medium, Large])
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VariantAxis {
    pub name: String,
    pub values: Vec<String>,
}

/// A component set groups multiple components as variants along defined axes.
/// Each component in the set maps to a specific combination of axis values.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ComponentSet {
    pub id: ComponentSetId,
    pub name: String,
    #[serde(default)]
    pub description: String,
    /// Variant axes (e.g. Size, State, Theme)
    pub axes: Vec<VariantAxis>,
    /// Map from axis-value combination key (e.g. "Size=Small,State=Default") to ComponentId
    pub variant_map: HashMap<String, ComponentId>,
    /// All component IDs in this set
    pub component_ids: Vec<ComponentId>,
}

impl ComponentSet {
    pub fn new(id: ComponentSetId, name: String) -> Self {
        Self {
            id,
            name,
            description: String::new(),
            axes: vec![],
            variant_map: HashMap::new(),
            component_ids: vec![],
        }
    }

    /// Build a canonical key string from axis-value pairs
    pub fn make_key(values: &HashMap<String, String>) -> String {
        let mut parts: Vec<_> = values.iter().map(|(k, v)| format!("{}={}", k, v)).collect();
        parts.sort();
        parts.join(",")
    }

    /// Find which component matches given axis values
    pub fn get_component_for_values(&self, values: &HashMap<String, String>) -> Option<ComponentId> {
        let key = Self::make_key(values);
        self.variant_map.get(&key).copied()
    }

    /// Get axis values for a given component ID (reverse lookup)
    pub fn get_values_for_component(&self, comp_id: ComponentId) -> Option<HashMap<String, String>> {
        for (key_str, &cid) in &self.variant_map {
            if cid == comp_id {
                let mut map = HashMap::new();
                for part in key_str.split(',') {
                    if let Some((k, v)) = part.split_once('=') {
                        map.insert(k.to_string(), v.to_string());
                    }
                }
                return Some(map);
            }
        }
        None
    }
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
    #[serde(default)]
    component_sets: HashMap<ComponentSetId, ComponentSet>,
    #[serde(default)]
    next_set_id: ComponentSetId,
}

impl ComponentStore {
    pub fn new() -> Self {
        Self {
            components: HashMap::new(),
            next_id: 1,
            linked_libraries: Vec::new(),
            component_sets: HashMap::new(),
            next_set_id: 1,
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
            instance_data.property_overrides.clear();
            true
        } else {
            false
        }
    }

    // =============================================
    // Component Sets
    // =============================================

    /// Create a new component set from existing component IDs
    pub fn create_component_set(&mut self, name: String, component_ids: Vec<ComponentId>) -> ComponentSetId {
        let id = self.next_set_id;
        self.next_set_id += 1;
        let mut set = ComponentSet::new(id, name);
        set.component_ids = component_ids;
        self.component_sets.insert(id, set);
        id
    }

    pub fn get_component_set(&self, id: ComponentSetId) -> Option<&ComponentSet> {
        self.component_sets.get(&id)
    }

    pub fn get_component_set_mut(&mut self, id: ComponentSetId) -> Option<&mut ComponentSet> {
        self.component_sets.get_mut(&id)
    }

    pub fn remove_component_set(&mut self, id: ComponentSetId) -> Option<ComponentSet> {
        self.component_sets.remove(&id)
    }

    pub fn list_component_sets(&self) -> Vec<&ComponentSet> {
        let mut v: Vec<_> = self.component_sets.values().collect();
        v.sort_by_key(|s| s.id);
        v
    }

    /// Find which component set a component belongs to
    pub fn find_set_for_component(&self, comp_id: ComponentId) -> Option<&ComponentSet> {
        self.component_sets.values().find(|s| s.component_ids.contains(&comp_id))
    }

    /// Add a variant axis to a component set
    pub fn add_set_axis(&mut self, set_id: ComponentSetId, name: String, values: Vec<String>) -> bool {
        if let Some(set) = self.component_sets.get_mut(&set_id) {
            // Don't add duplicate axis
            if set.axes.iter().any(|a| a.name == name) {
                return false;
            }
            set.axes.push(VariantAxis { name, values });
            true
        } else {
            false
        }
    }

    /// Update a variant axis on a component set
    pub fn update_set_axis(&mut self, set_id: ComponentSetId, axis_name: &str, values: Vec<String>) -> bool {
        if let Some(set) = self.component_sets.get_mut(&set_id) {
            if let Some(axis) = set.axes.iter_mut().find(|a| a.name == axis_name) {
                axis.values = values;
                return true;
            }
        }
        false
    }

    /// Rename a variant axis on a component set and remap all existing variant_map keys.
    pub fn rename_set_axis(&mut self, set_id: ComponentSetId, old_name: &str, new_name: &str) -> bool {
        let new_name = new_name.trim();
        if new_name.is_empty() || old_name == new_name {
            return false;
        }

        if let Some(set) = self.component_sets.get_mut(&set_id) {
            if set.axes.iter().any(|a| a.name == new_name) {
                return false;
            }

            let Some(axis) = set.axes.iter_mut().find(|a| a.name == old_name) else {
                return false;
            };
            axis.name = new_name.to_string();

            let mut remapped: HashMap<String, ComponentId> = HashMap::new();
            for (key_str, comp_id) in set.variant_map.clone() {
                let mut values: HashMap<String, String> = HashMap::new();
                for part in key_str.split(',') {
                    if let Some((k, v)) = part.split_once('=') {
                        let nk = if k == old_name { new_name } else { k };
                        values.insert(nk.to_string(), v.to_string());
                    }
                }
                let new_key = ComponentSet::make_key(&values);
                remapped.insert(new_key, comp_id);
            }
            set.variant_map = remapped;
            return true;
        }

        false
    }

    /// Remove a variant axis from a component set
    pub fn remove_set_axis(&mut self, set_id: ComponentSetId, axis_name: &str) -> bool {
        if let Some(set) = self.component_sets.get_mut(&set_id) {
            let before = set.axes.len();
            set.axes.retain(|a| a.name != axis_name);
            set.axes.len() < before
        } else {
            false
        }
    }

    /// Map axis values to a component ID in a set
    pub fn set_variant_mapping(&mut self, set_id: ComponentSetId, values: HashMap<String, String>, comp_id: ComponentId) -> bool {
        if let Some(set) = self.component_sets.get_mut(&set_id) {
            let key = ComponentSet::make_key(&values);
            set.variant_map.insert(key, comp_id);
            if !set.component_ids.contains(&comp_id) {
                set.component_ids.push(comp_id);
            }
            true
        } else {
            false
        }
    }

    /// Add a component to a set
    pub fn add_component_to_set(&mut self, set_id: ComponentSetId, comp_id: ComponentId) -> bool {
        if let Some(set) = self.component_sets.get_mut(&set_id) {
            if !set.component_ids.contains(&comp_id) {
                set.component_ids.push(comp_id);
            }
            true
        } else {
            false
        }
    }

    /// Remove a component from a set
    pub fn remove_component_from_set(&mut self, set_id: ComponentSetId, comp_id: ComponentId) -> bool {
        if let Some(set) = self.component_sets.get_mut(&set_id) {
            set.component_ids.retain(|&id| id != comp_id);
            set.variant_map.retain(|_, &mut v| v != comp_id);
            true
        } else {
            false
        }
    }
}
