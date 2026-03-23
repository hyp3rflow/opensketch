use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub type VariableId = u64;
pub type CollectionId = u64;
pub type ModeId = u64;

/// Variable type tag
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum VariableType {
    Color,
    Number,
    String,
    Boolean,
}

/// Variable value
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum VariableValue {
    /// Hex color string e.g. "#ff0000" or "rgba(255,0,0,1)"
    Color(String),
    Number(f64),
    String(String),
    Boolean(bool),
}

impl VariableValue {
    pub fn var_type(&self) -> VariableType {
        match self {
            VariableValue::Color(_) => VariableType::Color,
            VariableValue::Number(_) => VariableType::Number,
            VariableValue::String(_) => VariableType::String,
            VariableValue::Boolean(_) => VariableType::Boolean,
        }
    }
}

/// A single design variable (token)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Variable {
    pub id: VariableId,
    pub name: String,
    #[serde(rename = "value_type")]
    pub var_type: VariableType,
    /// Values per mode: mode_id -> value
    #[serde(rename = "values_by_mode")]
    pub values: HashMap<ModeId, VariableValue>,
}

/// A mode within a collection (e.g., "Light", "Dark")
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VariableMode {
    pub id: ModeId,
    pub name: String,
}

/// A collection of variables with modes
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VariableCollection {
    pub id: CollectionId,
    pub name: String,
    pub modes: Vec<VariableMode>,
    pub active_mode_id: ModeId,
    pub variables: Vec<Variable>,
    pub next_variable_id: VariableId,
    pub next_mode_id: ModeId,
    /// Scope restriction: which pages/frames can use this collection's variables
    #[serde(default)]
    pub scope: VariableScope,
}

impl VariableCollection {
    pub fn new(id: CollectionId, name: String) -> Self {
        let default_mode = VariableMode { id: 1, name: "Mode 1".to_string() };
        Self {
            id,
            name,
            modes: vec![default_mode],
            active_mode_id: 1,
            variables: vec![],
            next_variable_id: 1,
            next_mode_id: 2,
            scope: VariableScope::Global,
        }
    }

    pub fn add_mode(&mut self, name: String) -> ModeId {
        let mode_id = self.next_mode_id;
        self.next_mode_id += 1;
        self.modes.push(VariableMode { id: mode_id, name });
        // Copy first mode's values as defaults for new mode
        let first_mode_id = self.modes.first().map(|m| m.id).unwrap_or(0);
        for var in &mut self.variables {
            let default = var.values.get(&first_mode_id).cloned()
                .unwrap_or(VariableValue::String(String::new()));
            var.values.insert(mode_id, default);
        }
        mode_id
    }

    pub fn remove_mode(&mut self, mode_id: ModeId) -> bool {
        if self.modes.len() <= 1 { return false; }
        self.modes.retain(|m| m.id != mode_id);
        for var in &mut self.variables {
            var.values.remove(&mode_id);
        }
        if self.active_mode_id == mode_id {
            self.active_mode_id = self.modes.first().map(|m| m.id).unwrap_or(0);
        }
        true
    }

    pub fn rename_mode(&mut self, mode_id: ModeId, name: String) -> bool {
        if let Some(m) = self.modes.iter_mut().find(|m| m.id == mode_id) {
            m.name = name;
            true
        } else {
            false
        }
    }

    pub fn create_variable(&mut self, name: String, var_type: VariableType) -> VariableId {
        let default_value = match var_type {
            VariableType::Color => VariableValue::Color("#000000".to_string()),
            VariableType::Number => VariableValue::Number(0.0),
            VariableType::String => VariableValue::String(String::new()),
            VariableType::Boolean => VariableValue::Boolean(false),
        };
        self.create_variable_with_default(name, var_type, default_value)
    }

    pub fn create_variable_with_default(&mut self, name: String, var_type: VariableType, default_value: VariableValue) -> VariableId {
        let var_id = self.next_variable_id;
        self.next_variable_id += 1;
        let mut values = HashMap::new();
        for mode in &self.modes {
            values.insert(mode.id, default_value.clone());
        }
        self.variables.push(Variable {
            id: var_id,
            name,
            var_type,
            values,
        });
        var_id
    }

    pub fn delete_variable(&mut self, variable_id: VariableId) -> bool {
        let len = self.variables.len();
        self.variables.retain(|v| v.id != variable_id);
        self.variables.len() < len
    }

    pub fn update_variable_value(&mut self, variable_id: VariableId, mode_id: ModeId, value: VariableValue) -> bool {
        self.update_value(variable_id, mode_id, value)
    }

    pub fn update_value(&mut self, variable_id: VariableId, mode_id: ModeId, value: VariableValue) -> bool {
        if let Some(var) = self.variables.iter_mut().find(|v| v.id == variable_id) {
            var.values.insert(mode_id, value);
            true
        } else {
            false
        }
    }

    pub fn rename_variable(&mut self, variable_id: VariableId, name: String) -> bool {
        if let Some(var) = self.variables.iter_mut().find(|v| v.id == variable_id) {
            var.name = name;
            true
        } else {
            false
        }
    }

    /// Resolve a variable to its current mode value
    pub fn resolve(&self, variable_id: VariableId) -> Option<VariableValue> {
        let var = self.variables.iter().find(|v| v.id == variable_id)?;
        var.values.get(&self.active_mode_id).cloned()
    }
}

/// Comparison operator for conditional visibility
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum VisibilityOperator {
    Eq,
    NotEq,
    Gt,
    Lt,
    Gte,
    Lte,
    IsTrue,
    IsFalse,
}

/// Conditional visibility: show/hide a node based on a variable's value
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VisibilityCondition {
    pub collection_id: CollectionId,
    pub variable_id: VariableId,
    pub operator: VisibilityOperator,
    /// Comparison value (ignored for IsTrue/IsFalse)
    #[serde(default)]
    pub value: Option<VariableValue>,
}

impl VisibilityCondition {
    /// Evaluate the condition against a resolved variable value. Returns true if the node should be visible.
    pub fn evaluate(&self, resolved: &VariableValue) -> bool {
        match &self.operator {
            VisibilityOperator::IsTrue => matches!(resolved, VariableValue::Boolean(true)),
            VisibilityOperator::IsFalse => matches!(resolved, VariableValue::Boolean(false)),
            _ => {
                let Some(ref compare_value) = self.value else { return true; };
                match (&self.operator, resolved, compare_value) {
                    (VisibilityOperator::Eq, a, b) => a == b,
                    (VisibilityOperator::NotEq, a, b) => a != b,
                    (VisibilityOperator::Gt, VariableValue::Number(a), VariableValue::Number(b)) => a > b,
                    (VisibilityOperator::Lt, VariableValue::Number(a), VariableValue::Number(b)) => a < b,
                    (VisibilityOperator::Gte, VariableValue::Number(a), VariableValue::Number(b)) => a >= b,
                    (VisibilityOperator::Lte, VariableValue::Number(a), VariableValue::Number(b)) => a <= b,
                    _ => true, // type mismatch → visible
                }
            }
        }
    }
}

/// Variable binding: links a node property to a variable
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VariableBinding {
    pub collection_id: CollectionId,
    pub variable_id: VariableId,
}

/// Scope restriction for a variable collection
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum VariableScope {
    /// Available everywhere (default)
    Global,
    /// Restricted to specific pages (by page id)
    Pages(Vec<u64>),
    /// Restricted to specific frames/nodes (by node id)
    Nodes(Vec<u64>),
}

impl Default for VariableScope {
    fn default() -> Self { VariableScope::Global }
}

impl VariableScope {
    /// Check if a given (page_id, node_id, ancestor_ids) is within scope.
    /// For Pages scope: page_id must be in the list.
    /// For Nodes scope: the node or any of its ancestors must be in the list.
    pub fn contains(&self, page_id: u64, node_id: u64, ancestor_ids: &[u64]) -> bool {
        match self {
            VariableScope::Global => true,
            VariableScope::Pages(pages) => pages.contains(&page_id),
            VariableScope::Nodes(nodes) => {
                nodes.contains(&node_id) || ancestor_ids.iter().any(|a| nodes.contains(a))
            }
        }
    }
}

/// Store for all variable collections (kept for backward compat, unused in scene currently)
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct VariableStore {
    pub collections: Vec<VariableCollection>,
    pub next_collection_id: CollectionId,
}

impl VariableStore {
    pub fn new() -> Self {
        Self { collections: vec![], next_collection_id: 1 }
    }
}
