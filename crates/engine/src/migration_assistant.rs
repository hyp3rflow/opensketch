use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::node::{NodeKind, FillType};
use crate::styles::{StyleStore, StyleId};
use crate::types::{Color, ColorSpace};
use crate::scene::Scene;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum MigrationProperty {
    Fill,
    Stroke,
    TextStyle,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MigrationSuggestion {
    pub node_id: u64,
    pub node_name: String,
    pub property: String,
    pub current_value: String,
    pub suggested_style_id: Option<u64>,
    pub suggested_style_name: Option<String>,
    pub suggested_new_style_name: Option<String>,
    pub occurrence_count: u32,
}

fn color_hex(c: &Color) -> String {
    if (c.a - 1.0).abs() < 0.001 {
        format!("#{:02x}{:02x}{:02x}", c.r, c.g, c.b)
    } else {
        format!("#{:02x}{:02x}{:02x}{:02x}", c.r, c.g, c.b, (c.a * 255.0) as u8)
    }
}

fn colors_match(c: &Color, r: u8, g: u8, b: u8, a: f64) -> bool {
    c.r == r && c.g == g && c.b == b && (c.a - a).abs() < 0.01
}

#[derive(Hash, Eq, PartialEq, Clone)]
struct TextKey {
    font_family: String,
    font_size_x100: i64,
    font_weight: u16,
}

pub fn scan_for_migration_suggestions(scene: &Scene, styles: &StyleStore) -> Vec<MigrationSuggestion> {
    let mut fill_map: HashMap<String, Vec<(u64, String)>> = HashMap::new();
    let mut stroke_map: HashMap<String, Vec<(u64, String)>> = HashMap::new();
    let mut text_map: HashMap<TextKey, Vec<(u64, String)>> = HashMap::new();

    for node in scene.all_nodes() {
        // Skip nodes already linked to styles
        if node.color_style_id.is_some() && node.text_style_id.is_some() { continue; }

        if node.color_style_id.is_none() {
            for fill in &node.fills {
                if !fill.visible { continue; }
                if matches!(fill.fill_type, FillType::Solid { .. }) {
                    let hex = color_hex(&fill.color());
                    fill_map.entry(hex).or_default().push((node.id, node.name.clone()));
                }
            }
            for stroke in &node.strokes {
                if !stroke.visible { continue; }
                let hex = color_hex(&stroke.color);
                stroke_map.entry(hex).or_default().push((node.id, node.name.clone()));
            }
        }

        if node.text_style_id.is_none() {
            if let NodeKind::Text { ref font_family, font_size, font_weight, .. } = node.kind {
                let key = TextKey {
                    font_family: font_family.clone(),
                    font_size_x100: (font_size * 100.0) as i64,
                    font_weight,
                };
                text_map.entry(key).or_default().push((node.id, node.name.clone()));
            }
        }
    }

    let mut suggestions = Vec::new();

    let find_color_style = |color: &Color| -> Option<(StyleId, String)> {
        for cs in styles.color_styles.values() {
            if colors_match(color, cs.fill_r, cs.fill_g, cs.fill_b, cs.fill_a) {
                return Some((cs.id, cs.name.clone()));
            }
        }
        None
    };

    // Fill colors
    for (hex, nodes) in &fill_map {
        let sample = scene.get_node(nodes[0].0).unwrap();
        let sample_color = sample.fills.iter()
            .find(|f| f.visible && matches!(f.fill_type, FillType::Solid { .. }) && color_hex(&f.color()) == *hex)
            .map(|f| f.color());
        let sample_color = match sample_color { Some(c) => c, None => continue };

        let style_match = find_color_style(&sample_color);
        if style_match.is_none() && nodes.len() < 2 { continue; }

        for (nid, nname) in nodes {
            let (sid, sname, new_name) = match &style_match {
                Some((id, name)) => (Some(*id), Some(name.clone()), None),
                None => (None, None, Some(format!("Color/{}", hex.trim_start_matches('#').to_uppercase()))),
            };
            suggestions.push(MigrationSuggestion {
                node_id: *nid, node_name: nname.clone(), property: "Fill".into(),
                current_value: hex.clone(), suggested_style_id: sid,
                suggested_style_name: sname, suggested_new_style_name: new_name,
                occurrence_count: nodes.len() as u32,
            });
        }
    }

    // Stroke colors
    for (hex, nodes) in &stroke_map {
        let sample = scene.get_node(nodes[0].0).unwrap();
        let sample_color = sample.strokes.iter()
            .find(|s| s.visible && color_hex(&s.color) == *hex)
            .map(|s| s.color);
        let sample_color = match sample_color { Some(c) => c, None => continue };

        let style_match = find_color_style(&sample_color);
        if style_match.is_none() && nodes.len() < 2 { continue; }

        for (nid, nname) in nodes {
            let (sid, sname, new_name) = match &style_match {
                Some((id, name)) => (Some(*id), Some(name.clone()), None),
                None => (None, None, Some(format!("Stroke/{}", hex.trim_start_matches('#').to_uppercase()))),
            };
            suggestions.push(MigrationSuggestion {
                node_id: *nid, node_name: nname.clone(), property: "Stroke".into(),
                current_value: hex.clone(), suggested_style_id: sid,
                suggested_style_name: sname, suggested_new_style_name: new_name,
                occurrence_count: nodes.len() as u32,
            });
        }
    }

    // Text styles
    let find_text_style = |key: &TextKey| -> Option<(StyleId, String)> {
        for ts in styles.text_styles.values() {
            if ts.font_family == key.font_family
                && ((ts.font_size * 100.0) as i64) == key.font_size_x100
                && ts.font_weight == key.font_weight
            {
                return Some((ts.id, ts.name.clone()));
            }
        }
        None
    };

    for (key, nodes) in &text_map {
        let style_match = find_text_style(key);
        if style_match.is_none() && nodes.len() < 2 { continue; }

        let size = key.font_size_x100 as f64 / 100.0;
        for (nid, nname) in nodes {
            let (sid, sname, new_name) = match &style_match {
                Some((id, name)) => (Some(*id), Some(name.clone()), None),
                None => (None, None, Some(format!("{}/{}px/w{}", key.font_family, size, key.font_weight))),
            };
            suggestions.push(MigrationSuggestion {
                node_id: *nid, node_name: nname.clone(), property: "TextStyle".into(),
                current_value: format!("{}/{}/{}", key.font_family, size, key.font_weight),
                suggested_style_id: sid, suggested_style_name: sname,
                suggested_new_style_name: new_name,
                occurrence_count: nodes.len() as u32,
            });
        }
    }

    // Sort: existing matches first, then by occurrence count desc
    suggestions.sort_by(|a, b| {
        b.suggested_style_id.is_some().cmp(&a.suggested_style_id.is_some())
            .then(b.occurrence_count.cmp(&a.occurrence_count))
    });

    suggestions
}

/// Apply a migration: link node property to an existing style.
pub fn apply_migration(scene: &mut Scene, styles: &StyleStore, node_id: u64, style_id: u64, property: &MigrationProperty) -> bool {
    match property {
        MigrationProperty::Fill => {
            if let Some(cs) = styles.get_color_style(style_id) {
                let new_color = Color { r: cs.fill_r, g: cs.fill_g, b: cs.fill_b, a: cs.fill_a, color_space: ColorSpace::default() };
                if let Some(node) = scene.get_node_mut(node_id) {
                    if let Some(fill) = node.fills.iter_mut().find(|f| f.visible && matches!(f.fill_type, FillType::Solid { .. })) {
                        fill.fill_type = FillType::Solid { color: new_color };
                    }
                    node.color_style_id = Some(style_id);
                    return true;
                }
            }
            false
        }
        MigrationProperty::Stroke => {
            if let Some(cs) = styles.get_color_style(style_id) {
                let new_color = Color { r: cs.fill_r, g: cs.fill_g, b: cs.fill_b, a: cs.fill_a, color_space: ColorSpace::default() };
                if let Some(node) = scene.get_node_mut(node_id) {
                    if let Some(stroke) = node.strokes.iter_mut().find(|s| s.visible) {
                        stroke.color = new_color;
                    }
                    node.color_style_id = Some(style_id);
                    return true;
                }
            }
            false
        }
        MigrationProperty::TextStyle => {
            if let Some(ts) = styles.get_text_style(style_id) {
                if let Some(node) = scene.get_node_mut(node_id) {
                    if let NodeKind::Text { ref mut font_family, ref mut font_size, ref mut font_weight, ref mut line_height, ref mut text_align, ref mut font_style, .. } = node.kind {
                        *font_family = ts.font_family.clone();
                        *font_size = ts.font_size;
                        *font_weight = ts.font_weight;
                        *font_style = ts.font_style.clone();
                        *line_height = ts.line_height;
                        *text_align = ts.text_align.clone();
                    }
                    node.text_style_id = Some(style_id);
                    return true;
                }
            }
            false
        }
    }
}
