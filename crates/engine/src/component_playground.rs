use serde::Serialize;
use crate::component::{ComponentId, ComponentStore, VariantValue};
use crate::node::NodeId;

/// Info about a component for playground display
#[derive(Serialize)]
pub struct PlaygroundInfo {
    pub id: ComponentId,
    pub name: String,
    pub description: String,
    pub properties: Vec<PlaygroundProp>,
    pub slots: Vec<String>,
    pub variants: Vec<PlaygroundVariant>,
    pub variant_count: usize,
}

#[derive(Serialize)]
pub struct PlaygroundProp {
    pub name: String,
    pub prop_type: String, // "boolean" | "string"
    pub default_value: String,
    pub options: Vec<String>, // for string type
}

#[derive(Serialize)]
pub struct PlaygroundVariant {
    pub key_string: String,
    pub key_display: String,
    pub root_node_id: NodeId,
    pub node_count: usize,
    pub properties: Vec<PlaygroundVariantProp>,
}

#[derive(Serialize)]
pub struct PlaygroundVariantProp {
    pub name: String,
    pub value: String,
}

/// Get playground info for a component
pub fn get_playground_info(store: &ComponentStore, comp_id: ComponentId) -> Option<PlaygroundInfo> {
    let comp = store.get(comp_id)?;

    let properties: Vec<PlaygroundProp> = comp.properties.iter().map(|p| {
        let (pt, opts) = match &p.prop_type {
            crate::component::VariantPropType::Boolean => ("boolean".to_string(), vec!["true".to_string(), "false".to_string()]),
            crate::component::VariantPropType::String { options } => ("string".to_string(), options.clone()),
        };
        PlaygroundProp {
            name: p.name.clone(),
            prop_type: pt,
            default_value: p.default_value.to_display(),
            options: opts,
        }
    }).collect();

    let slots: Vec<String> = comp.slots.iter().map(|s| s.name.clone()).collect();

    let mut variants: Vec<PlaygroundVariant> = comp.variants.iter().map(|(key_str, vd)| {
        let props: Vec<PlaygroundVariantProp> = vd.key.iter().map(|(k, v)| {
            PlaygroundVariantProp { name: k.clone(), value: v.to_display() }
        }).collect();
        PlaygroundVariant {
            key_string: key_str.clone(),
            key_display: key_str.replace(',', ", "),
            root_node_id: vd.root_node_id,
            node_count: vd.nodes.len(),
            properties: props,
        }
    }).collect();
    variants.sort_by(|a, b| a.key_string.cmp(&b.key_string));

    Some(PlaygroundInfo {
        id: comp.id,
        name: comp.name.clone(),
        description: comp.description.clone(),
        properties,
        slots,
        variant_count: variants.len(),
        variants,
    })
}

/// Get all variant key strings for a component
pub fn get_variant_keys(store: &ComponentStore, comp_id: ComponentId) -> Vec<String> {
    match store.get(comp_id) {
        Some(comp) => {
            let mut keys: Vec<String> = comp.variants.keys().cloned().collect();
            keys.sort();
            keys
        }
        None => vec![],
    }
}

/// Generate a variant matrix for visualizing all variant combinations in a grid.
/// If the component has 2+ properties, the first property maps to rows, second to columns.
/// If 1 property, single row. If 3+, extra props are iterable via filters.
#[derive(Serialize)]
pub struct VariantMatrix {
    pub component_id: ComponentId,
    pub component_name: String,
    /// Row axis property (first prop), None if 0 props
    pub row_prop: Option<MatrixAxis>,
    /// Column axis property (second prop), None if <2 props
    pub col_prop: Option<MatrixAxis>,
    /// Extra properties beyond row/col (for filter dropdowns)
    pub extra_props: Vec<MatrixAxis>,
    /// Cells: row_index * col_count + col_index
    pub cells: Vec<MatrixCell>,
    pub row_count: usize,
    pub col_count: usize,
}

#[derive(Serialize)]
pub struct MatrixAxis {
    pub name: String,
    pub values: Vec<String>,
}

#[derive(Serialize)]
pub struct MatrixCell {
    pub row: usize,
    pub col: usize,
    pub variant_key_json: String,
    pub label: String,
    pub exists: bool,
}

pub fn generate_variant_matrix(
    store: &ComponentStore,
    comp_id: ComponentId,
    extra_values_json: Option<&str>,
) -> Option<VariantMatrix> {
    let comp = store.get(comp_id)?;
    if comp.properties.is_empty() {
        // No properties — single cell with default variant
        return Some(VariantMatrix {
            component_id: comp_id,
            component_name: comp.name.clone(),
            row_prop: None,
            col_prop: None,
            extra_props: vec![],
            cells: vec![MatrixCell {
                row: 0, col: 0,
                variant_key_json: "{}".to_string(),
                label: "Default".to_string(),
                exists: !comp.variants.is_empty(),
            }],
            row_count: 1,
            col_count: 1,
        });
    }

    // Parse extra prop fixed values (for 3+ prop filtering)
    let extra_fixed: std::collections::HashMap<String, String> = extra_values_json
        .and_then(|j| serde_json::from_str(j).ok())
        .unwrap_or_default();

    // Get all values for each property
    let prop_values: Vec<(String, Vec<String>)> = comp.properties.iter().map(|p| {
        let vals = match &p.prop_type {
            crate::component::VariantPropType::Boolean => vec!["true".to_string(), "false".to_string()],
            crate::component::VariantPropType::String { options } => options.clone(),
        };
        (p.name.clone(), vals)
    }).collect();

    let (row_prop, col_prop, extras) = match prop_values.len() {
        0 => (None, None, vec![]),
        1 => (Some(&prop_values[0]), None, vec![]),
        _ => (Some(&prop_values[0]), Some(&prop_values[1]), prop_values[2..].to_vec()),
    };

    let row_values = row_prop.map(|(_, v)| v.clone()).unwrap_or_else(|| vec!["_".to_string()]);
    let col_values = col_prop.map(|(_, v)| v.clone()).unwrap_or_else(|| vec!["_".to_string()]);

    let row_count = row_values.len();
    let col_count = col_values.len();

    let mut cells = Vec::with_capacity(row_count * col_count);

    for (ri, rv) in row_values.iter().enumerate() {
        for (ci, cv) in col_values.iter().enumerate() {
            let mut key_map = std::collections::HashMap::new();
            if let Some((name, _)) = row_prop {
                key_map.insert(name.clone(), rv.clone());
            }
            if let Some((name, _)) = col_prop {
                key_map.insert(name.clone(), cv.clone());
            }
            // Fill extra props with fixed values or defaults
            for (ename, evalues) in &extras {
                let val = extra_fixed.get(ename).cloned()
                    .unwrap_or_else(|| evalues.first().cloned().unwrap_or_default());
                key_map.insert(ename.clone(), val);
            }

            let variant_key_json = serde_json::to_string(&key_map).unwrap_or_default();

            // Check if this variant actually exists
            let parsed_key = parse_variant_key_json(&variant_key_json);
            let exists = parsed_key.as_ref()
                .and_then(|k| comp.get_variant(k))
                .is_some();

            let label = if col_prop.is_some() {
                format!("{} × {}", rv, cv)
            } else {
                rv.clone()
            };

            cells.push(MatrixCell { row: ri, col: ci, variant_key_json, label, exists });
        }
    }

    Some(VariantMatrix {
        component_id: comp_id,
        component_name: comp.name.clone(),
        row_prop: row_prop.map(|(n, v)| MatrixAxis { name: n.clone(), values: v.clone() }),
        col_prop: col_prop.map(|(n, v)| MatrixAxis { name: n.clone(), values: v.clone() }),
        extra_props: extras.iter().map(|(n, v)| MatrixAxis { name: n.clone(), values: v.clone() }).collect(),
        cells,
        row_count,
        col_count,
    })
}

/// Build a VariantKey from a JSON object { "prop": "value", ... }
pub fn parse_variant_key_json(json: &str) -> Option<std::collections::HashMap<String, VariantValue>> {
    let map: std::collections::HashMap<String, String> = serde_json::from_str(json).ok()?;
    let mut key = std::collections::HashMap::new();
    for (k, v) in map {
        let val = if v == "true" {
            VariantValue::Boolean(true)
        } else if v == "false" {
            VariantValue::Boolean(false)
        } else {
            VariantValue::String(v)
        };
        key.insert(k, val);
    }
    Some(key)
}
