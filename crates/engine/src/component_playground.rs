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
