/// Scene Diff — compare two scene JSON snapshots and produce a change list
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Summary of a single node for diffing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeSummary {
    pub id: u64,
    pub name: String,
    pub kind: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: f64,
    pub opacity: f64,
    pub visible: bool,
    pub fill_hex: String,
    pub children_count: usize,
    pub parent_id: Option<u64>,
}

/// Type of change detected
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ChangeType {
    Added,
    Removed,
    Modified,
}

/// A single property change within a modified node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PropertyChange {
    pub property: String,
    pub old_value: String,
    pub new_value: String,
}

/// A single node-level change
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeChange {
    pub node_id: u64,
    pub node_name: String,
    pub node_kind: String,
    pub change_type: ChangeType,
    pub properties: Vec<PropertyChange>,
}

/// Full diff result between two scene snapshots
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneDiff {
    pub added: Vec<NodeChange>,
    pub removed: Vec<NodeChange>,
    pub modified: Vec<NodeChange>,
    pub total_changes: usize,
    pub added_count: usize,
    pub removed_count: usize,
    pub modified_count: usize,
}

/// Extract node summaries from a scene JSON string
pub fn extract_summaries(scene_json: &str) -> Vec<NodeSummary> {
    let val: serde_json::Value = match serde_json::from_str(scene_json) {
        Ok(v) => v,
        Err(_) => return vec![],
    };
    
    let mut summaries = Vec::new();
    
    // Try to get nodes from the scene structure
    // Scene JSON might have pages with nodes, or a flat nodes map
    if let Some(pages) = val.get("pages").and_then(|p| p.as_array()) {
        for page in pages {
            if let Some(nodes) = page.get("nodes") {
                collect_nodes_from_map(nodes, &mut summaries);
            }
        }
    }
    // Also try flat "nodes" field
    if let Some(nodes) = val.get("nodes") {
        collect_nodes_from_map(nodes, &mut summaries);
    }
    
    summaries
}

fn collect_nodes_from_map(nodes: &serde_json::Value, out: &mut Vec<NodeSummary>) {
    if let Some(map) = nodes.as_object() {
        for (id_str, node) in map {
            let id: u64 = id_str.parse().unwrap_or(0);
            if id == 0 { continue; }
            
            let name = node.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string();
            let kind = extract_kind(node);
            let x = node.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let y = node.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let width = node.get("width").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let height = node.get("height").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let rotation = node.get("rotation").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let opacity = node.get("opacity").and_then(|v| v.as_f64()).unwrap_or(1.0);
            let visible = node.get("visible").and_then(|v| v.as_bool()).unwrap_or(true);
            let fill_hex = extract_fill_hex(node);
            let children_count = node.get("children").and_then(|c| c.as_array()).map(|a| a.len()).unwrap_or(0);
            let parent_id = node.get("parent").and_then(|p| p.as_u64());
            
            out.push(NodeSummary {
                id, name, kind, x, y, width, height, rotation, opacity, visible,
                fill_hex, children_count, parent_id,
            });
        }
    }
}

fn extract_kind(node: &serde_json::Value) -> String {
    if let Some(kind) = node.get("kind") {
        if let Some(s) = kind.as_str() {
            return s.to_string();
        }
        if kind.is_object() {
            if let Some(map) = kind.as_object() {
                if let Some(key) = map.keys().next() {
                    return key.clone();
                }
            }
        }
        return format!("{}", kind);
    }
    "Unknown".to_string()
}

fn extract_fill_hex(node: &serde_json::Value) -> String {
    if let Some(fills) = node.get("fills").and_then(|f| f.as_array()) {
        if let Some(first) = fills.first() {
            if let Some(ft) = first.get("fill_type") {
                if let Some(solid) = ft.get("Solid") {
                    if let Some(color) = solid.get("color") {
                        let r = color.get("r").and_then(|v| v.as_u64()).unwrap_or(0) as u8;
                        let g = color.get("g").and_then(|v| v.as_u64()).unwrap_or(0) as u8;
                        let b = color.get("b").and_then(|v| v.as_u64()).unwrap_or(0) as u8;
                        return format!("#{:02x}{:02x}{:02x}", r, g, b);
                    }
                }
            }
        }
    }
    String::new()
}

/// Compare two scene JSON strings and return a diff
pub fn diff_scenes(old_json: &str, new_json: &str) -> SceneDiff {
    let old_summaries = extract_summaries(old_json);
    let new_summaries = extract_summaries(new_json);
    
    let old_map: HashMap<u64, &NodeSummary> = old_summaries.iter().map(|s| (s.id, s)).collect();
    let new_map: HashMap<u64, &NodeSummary> = new_summaries.iter().map(|s| (s.id, s)).collect();
    
    let mut added = Vec::new();
    let mut removed = Vec::new();
    let mut modified = Vec::new();
    
    // Find added nodes (in new but not in old)
    for (id, new_node) in &new_map {
        if !old_map.contains_key(id) {
            added.push(NodeChange {
                node_id: *id,
                node_name: new_node.name.clone(),
                node_kind: new_node.kind.clone(),
                change_type: ChangeType::Added,
                properties: vec![],
            });
        }
    }
    
    // Find removed nodes (in old but not in new)
    for (id, old_node) in &old_map {
        if !new_map.contains_key(id) {
            removed.push(NodeChange {
                node_id: *id,
                node_name: old_node.name.clone(),
                node_kind: old_node.kind.clone(),
                change_type: ChangeType::Removed,
                properties: vec![],
            });
        }
    }
    
    // Find modified nodes
    for (id, old_node) in &old_map {
        if let Some(new_node) = new_map.get(id) {
            let mut props = Vec::new();
            
            if old_node.name != new_node.name {
                props.push(PropertyChange {
                    property: "name".to_string(),
                    old_value: old_node.name.clone(),
                    new_value: new_node.name.clone(),
                });
            }
            if (old_node.x - new_node.x).abs() > 0.01 {
                props.push(PropertyChange {
                    property: "x".to_string(),
                    old_value: format!("{:.1}", old_node.x),
                    new_value: format!("{:.1}", new_node.x),
                });
            }
            if (old_node.y - new_node.y).abs() > 0.01 {
                props.push(PropertyChange {
                    property: "y".to_string(),
                    old_value: format!("{:.1}", old_node.y),
                    new_value: format!("{:.1}", new_node.y),
                });
            }
            if (old_node.width - new_node.width).abs() > 0.01 {
                props.push(PropertyChange {
                    property: "width".to_string(),
                    old_value: format!("{:.1}", old_node.width),
                    new_value: format!("{:.1}", new_node.width),
                });
            }
            if (old_node.height - new_node.height).abs() > 0.01 {
                props.push(PropertyChange {
                    property: "height".to_string(),
                    old_value: format!("{:.1}", old_node.height),
                    new_value: format!("{:.1}", new_node.height),
                });
            }
            if (old_node.rotation - new_node.rotation).abs() > 0.01 {
                props.push(PropertyChange {
                    property: "rotation".to_string(),
                    old_value: format!("{:.1}°", old_node.rotation),
                    new_value: format!("{:.1}°", new_node.rotation),
                });
            }
            if (old_node.opacity - new_node.opacity).abs() > 0.001 {
                props.push(PropertyChange {
                    property: "opacity".to_string(),
                    old_value: format!("{:.0}%", old_node.opacity * 100.0),
                    new_value: format!("{:.0}%", new_node.opacity * 100.0),
                });
            }
            if old_node.visible != new_node.visible {
                props.push(PropertyChange {
                    property: "visible".to_string(),
                    old_value: old_node.visible.to_string(),
                    new_value: new_node.visible.to_string(),
                });
            }
            if old_node.fill_hex != new_node.fill_hex && (!old_node.fill_hex.is_empty() || !new_node.fill_hex.is_empty()) {
                props.push(PropertyChange {
                    property: "fill".to_string(),
                    old_value: if old_node.fill_hex.is_empty() { "none".to_string() } else { old_node.fill_hex.clone() },
                    new_value: if new_node.fill_hex.is_empty() { "none".to_string() } else { new_node.fill_hex.clone() },
                });
            }
            if old_node.children_count != new_node.children_count {
                props.push(PropertyChange {
                    property: "children".to_string(),
                    old_value: old_node.children_count.to_string(),
                    new_value: new_node.children_count.to_string(),
                });
            }
            if old_node.kind != new_node.kind {
                props.push(PropertyChange {
                    property: "kind".to_string(),
                    old_value: old_node.kind.clone(),
                    new_value: new_node.kind.clone(),
                });
            }
            
            if !props.is_empty() {
                modified.push(NodeChange {
                    node_id: *id,
                    node_name: new_node.name.clone(),
                    node_kind: new_node.kind.clone(),
                    change_type: ChangeType::Modified,
                    properties: props,
                });
            }
        }
    }
    
    let added_count = added.len();
    let removed_count = removed.len();
    let modified_count = modified.len();
    let total_changes = added_count + removed_count + modified_count;
    
    SceneDiff {
        added,
        removed,
        modified,
        total_changes,
        added_count,
        removed_count,
        modified_count,
    }
}
