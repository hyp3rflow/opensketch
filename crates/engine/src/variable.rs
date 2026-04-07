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

    /// Export collection as CSV: header = "name,type,mode1,mode2,...", rows = variable values
    pub fn export_csv(&self) -> String {
        let mut lines = Vec::new();
        // Header
        let mut header = vec!["name".to_string(), "type".to_string()];
        for mode in &self.modes {
            header.push(mode.name.clone());
        }
        lines.push(csv_encode_row(&header));
        // Rows
        for var in &self.variables {
            let mut row = vec![var.name.clone(), format!("{:?}", var.var_type)];
            for mode in &self.modes {
                let val_str = match var.values.get(&mode.id) {
                    Some(VariableValue::Color(c)) => c.clone(),
                    Some(VariableValue::Number(n)) => n.to_string(),
                    Some(VariableValue::String(s)) => s.clone(),
                    Some(VariableValue::Boolean(b)) => b.to_string(),
                    None => String::new(),
                };
                row.push(val_str);
            }
            lines.push(csv_encode_row(&row));
        }
        lines.join("\n")
    }

    /// Import CSV into collection. Merges: updates existing variables by name, creates new ones.
    /// Returns number of variables imported/updated.
    pub fn import_csv(&mut self, csv_text: &str) -> u32 {
        let rows: Vec<Vec<String>> = csv_text.lines()
            .filter(|l| !l.trim().is_empty())
            .map(csv_decode_row)
            .collect();
        if rows.len() < 2 { return 0; }

        let header = &rows[0];
        // header[0] = "name", header[1] = "type", header[2..] = mode names
        // Map mode names to mode ids, create new modes if needed
        let mut mode_col_map: Vec<ModeId> = Vec::new();
        for i in 2..header.len() {
            let mode_name = header[i].trim();
            if let Some(m) = self.modes.iter().find(|m| m.name == mode_name) {
                mode_col_map.push(m.id);
            } else {
                // Create the mode
                let mid = self.add_mode(mode_name.to_string());
                mode_col_map.push(mid);
            }
        }

        let mut count: u32 = 0;
        for row in &rows[1..] {
            if row.len() < 2 { continue; }
            let name = row[0].trim().to_string();
            let type_str = row[1].trim();
            let var_type = match type_str {
                "Color" | "color" => VariableType::Color,
                "Number" | "number" => VariableType::Number,
                "String" | "string" => VariableType::String,
                "Boolean" | "boolean" => VariableType::Boolean,
                _ => VariableType::String,
            };

            // Find existing or create
            let var_id = if let Some(v) = self.variables.iter().find(|v| v.name == name) {
                v.id
            } else {
                self.create_variable(name, var_type.clone())
            };

            // Set values for each mode column
            for (col_idx, mode_id) in mode_col_map.iter().enumerate() {
                if let Some(val_str) = row.get(col_idx + 2) {
                    let val_str = val_str.trim();
                    if val_str.is_empty() { continue; }
                    let val = match &var_type {
                        VariableType::Color => VariableValue::Color(val_str.to_string()),
                        VariableType::Number => {
                            if let Ok(n) = val_str.parse::<f64>() {
                                VariableValue::Number(n)
                            } else { continue; }
                        }
                        VariableType::String => VariableValue::String(val_str.to_string()),
                        VariableType::Boolean => {
                            VariableValue::Boolean(val_str == "true" || val_str == "1")
                        }
                    };
                    self.update_value(var_id, *mode_id, val);
                }
            }
            count += 1;
        }
        count
    }

    /// Bulk update multiple variable values at once. Input: JSON array of {var_id, mode_id, value}.
    /// Returns number of successful updates.
    pub fn bulk_update(&mut self, updates: &[(VariableId, ModeId, VariableValue)]) -> u32 {
        let mut count = 0u32;
        for (var_id, mode_id, value) in updates {
            if self.update_value(*var_id, *mode_id, value.clone()) {
                count += 1;
            }
        }
        count
    }

    /// Resolve a variable to its current mode value.
    ///
    /// Fallback chain:
    /// 1) active mode value
    /// 2) first defined value in this collection (mode fallback)
    pub fn resolve(&self, variable_id: VariableId) -> Option<VariableValue> {
        let var = self.variables.iter().find(|v| v.id == variable_id)?;
        if let Some(v) = var.values.get(&self.active_mode_id) {
            return Some(v.clone());
        }
        // Mode fallback: first available mode value in collection order.
        for mode in &self.modes {
            if let Some(v) = var.values.get(&mode.id) {
                return Some(v.clone());
            }
        }
        // Last resort: any stored value.
        var.values.values().next().cloned()
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

// ---- CSV helpers ----

/// Encode a row as CSV (RFC 4180-ish: quote fields containing comma/quote/newline)
fn csv_encode_row(fields: &[String]) -> String {
    fields.iter().map(|f| {
        if f.contains(',') || f.contains('"') || f.contains('\n') {
            format!("\"{}\"", f.replace('"', "\"\""))
        } else {
            f.clone()
        }
    }).collect::<Vec<_>>().join(",")
}

/// Decode a CSV row respecting quoted fields
fn csv_decode_row(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();
    while let Some(ch) = chars.next() {
        if in_quotes {
            if ch == '"' {
                if chars.peek() == Some(&'"') {
                    chars.next();
                    current.push('"');
                } else {
                    in_quotes = false;
                }
            } else {
                current.push(ch);
            }
        } else if ch == '"' {
            in_quotes = true;
        } else if ch == ',' {
            fields.push(current.clone());
            current.clear();
        } else {
            current.push(ch);
        }
    }
    fields.push(current);
    fields
}
