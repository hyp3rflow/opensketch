use crate::node::{Node, NodeId, NodeKind};
use crate::scene::Scene;
use crate::types::Color;
use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct FindResult {
    pub node_id: u64,
    pub node_name: String,
    pub node_kind: String,
    /// For text matches: the matched text content
    pub matched_text: Option<String>,
    /// For color matches: the matched color hex
    pub matched_color: Option<String>,
    pub page_id: u64,
}

impl Scene {
    /// Find all nodes whose text content contains `query` (case-insensitive)
    pub fn find_text(&self, query: &str, case_sensitive: bool) -> Vec<FindResult> {
        let query_lower = if case_sensitive { query.to_string() } else { query.to_lowercase() };
        let mut results = Vec::new();
        let page_id = self.get_active_page_id();
        
        for node in self.nodes.values() {
            // Search text content
            if let NodeKind::Text { ref content, .. } = node.kind {
                let haystack = if case_sensitive { content.clone() } else { content.to_lowercase() };
                if haystack.contains(&query_lower) {
                    results.push(FindResult {
                        node_id: node.id,
                        node_name: node.name.clone(),
                        node_kind: kind_str(&node.kind),
                        matched_text: Some(content.clone()),
                        matched_color: None,
                        page_id,
                    });
                }
            }
            // Search node name
            let name_haystack = if case_sensitive { node.name.clone() } else { node.name.to_lowercase() };
            if name_haystack.contains(&query_lower) {
                // Avoid duplicate if already matched by text
                if !results.iter().any(|r| r.node_id == node.id) {
                    results.push(FindResult {
                        node_id: node.id,
                        node_name: node.name.clone(),
                        node_kind: kind_str(&node.kind),
                        matched_text: None,
                        matched_color: None,
                        page_id,
                    });
                }
            }
        }
        results
    }

    /// Replace text in a specific node
    pub fn replace_text_in_node(&mut self, node_id: NodeId, search: &str, replacement: &str, case_sensitive: bool) -> bool {
        if let Some(node) = self.nodes.get_mut(&node_id) {
            if let NodeKind::Text { ref mut content, .. } = node.kind {
                let new_content = if case_sensitive {
                    content.replace(search, replacement)
                } else {
                    case_insensitive_replace(content, search, replacement)
                };
                if new_content != *content {
                    *content = new_content;
                    return true;
                }
            }
        }
        false
    }

    /// Replace text in all matching nodes, returns count of modified nodes
    pub fn replace_all_text(&mut self, search: &str, replacement: &str, case_sensitive: bool) -> u32 {
        let ids: Vec<NodeId> = self.nodes.keys().cloned().collect();
        let mut count = 0u32;
        for id in ids {
            if self.replace_text_in_node(id, search, replacement, case_sensitive) {
                count += 1;
            }
        }
        count
    }

    /// Find nodes by fill color (hex string like "#ff0000")
    pub fn find_by_color(&self, hex: &str) -> Vec<FindResult> {
        let target = match parse_color_approx(hex) {
            Some(c) => c,
            None => return vec![],
        };
        let page_id = self.get_active_page_id();
        let mut results = Vec::new();

        for node in self.nodes.values() {
            for fill in &node.fills {
                if let crate::node::FillType::Solid { color } = &fill.fill_type {
                    if colors_close(color, &target) {
                        results.push(FindResult {
                            node_id: node.id,
                            node_name: node.name.clone(),
                            node_kind: kind_str(&node.kind),
                            matched_text: None,
                            matched_color: Some(format!("#{:02x}{:02x}{:02x}", color.r, color.g, color.b)),
                            page_id,
                        });
                        break;
                    }
                }
            }
        }
        results
    }

    /// Replace fill color across all nodes
    pub fn replace_color(&mut self, from_hex: &str, to_hex: &str) -> u32 {
        let from = match parse_color_approx(from_hex) {
            Some(c) => c,
            None => return 0,
        };
        let to = match parse_color_approx(to_hex) {
            Some(c) => c,
            None => return 0,
        };
        let mut count = 0u32;
        let ids: Vec<NodeId> = self.nodes.keys().cloned().collect();
        for id in ids {
            if let Some(node) = self.nodes.get_mut(&id) {
                let mut changed = false;
                for fill in &mut node.fills {
                    if let crate::node::FillType::Solid { ref mut color } = fill.fill_type {
                        if colors_close(color, &from) {
                            *color = to.clone();
                            changed = true;
                        }
                    }
                }
                if let Some(ref mut stroke) = node.stroke {
                    if colors_close(&stroke.color, &from) {
                        stroke.color = to.clone();
                        changed = true;
                    }
                }
                for stroke in &mut node.strokes {
                    if colors_close(&stroke.color, &from) {
                        stroke.color = to.clone();
                        changed = true;
                    }
                }
                if changed {
                    count += 1;
                }
            }
        }
        count
    }
}

fn kind_str(kind: &NodeKind) -> String {
    match kind {
        NodeKind::Rect => "Rect".into(),
        NodeKind::Ellipse => "Ellipse".into(),
        NodeKind::Text { .. } => "Text".into(),
        NodeKind::Frame => "Frame".into(),
        NodeKind::Group => "Group".into(),
        NodeKind::Slot { .. } => "Slot".into(),
        NodeKind::Instance { .. } => "Instance".into(),
        NodeKind::Image { .. } => "Image".into(),
        NodeKind::Path { .. } => "Path".into(),
        NodeKind::Star { .. } => "Star".into(),
        NodeKind::Polygon { .. } => "Polygon".into(),
        NodeKind::Section { .. } => "Section".into(),
        NodeKind::Slice => "Slice".into(),
        NodeKind::Connector { .. } => "Connector".into(),
        NodeKind::VectorNetwork { .. } => "VectorNetwork".into(),
        NodeKind::StickyNote { .. } => "StickyNote".into(),
        NodeKind::Table { .. } => "Table".into(),
        NodeKind::Table { .. } => "Table".into(),
    }
}

fn case_insensitive_replace(text: &str, search: &str, replacement: &str) -> String {
    let lower_text = text.to_lowercase();
    let lower_search = search.to_lowercase();
    let mut result = String::new();
    let mut start = 0;
    while let Some(pos) = lower_text[start..].find(&lower_search) {
        result.push_str(&text[start..start + pos]);
        result.push_str(replacement);
        start += pos + search.len();
    }
    result.push_str(&text[start..]);
    result
}

fn parse_color_approx(hex: &str) -> Option<Color> {
    let hex = hex.trim_start_matches('#');
    if hex.len() < 6 { return None; }
    let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
    let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
    let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
    Some(Color { r, g, b, a: 1.0 })
}

fn colors_close(a: &Color, b: &Color) -> bool {
    let dr = (a.r as i16 - b.r as i16).abs();
    let dg = (a.g as i16 - b.g as i16).abs();
    let db = (a.b as i16 - b.b as i16).abs();
    dr <= 2 && dg <= 2 && db <= 2
}
