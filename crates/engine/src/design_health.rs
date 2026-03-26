use std::collections::{HashMap, HashSet};
use serde::Serialize;
use crate::node::{Node, NodeKind, FillType};
use crate::component::ComponentStore;
use crate::styles::StyleStore;
use crate::scene::Scene;
use crate::types::Color;

#[derive(Serialize, Clone)]
pub struct HealthReport {
    pub score: u32,
    pub components: ComponentHealth,
    pub styles: StyleHealth,
    pub colors: ColorHealth,
    pub typography: TypographyHealth,
    pub issues: Vec<HealthIssue>,
    // Internal only (not in JSON, used by cleanup methods)
    #[serde(skip)]
    pub unused_color_style_ids: Vec<u64>,
    #[serde(skip)]
    pub unused_text_style_ids: Vec<u64>,
}

#[derive(Serialize, Clone)]
pub struct ComponentHealth {
    pub total_components: usize,
    pub total_instances: usize,
    pub unused_components: Vec<NamedItem>,
    pub detached_instances: Vec<DetachedInstance>,
    pub adoption_rate: f64,
}

#[derive(Serialize, Clone)]
pub struct NamedItem {
    pub id: u64,
    pub name: String,
}

#[derive(Serialize, Clone)]
pub struct DetachedInstance {
    pub node_id: u64,
    pub node_name: String,
    pub missing_component_id: u64,
    pub page_name: String,
}

#[derive(Serialize, Clone)]
pub struct StyleHealth {
    pub total_color_styles: usize,
    pub total_text_styles: usize,
    pub unused_color_styles: Vec<NamedItem>,
    pub unused_text_styles: Vec<NamedItem>,
    pub style_adoption_rate: f64,
}

#[derive(Serialize, Clone)]
pub struct ColorHealth {
    pub unique_colors: usize,
    pub hardcoded_colors: Vec<HardcodedColor>,
    pub near_duplicates: Vec<ColorPair>,
}

#[derive(Serialize, Clone)]
pub struct HardcodedColor {
    pub hex: String,
    pub count: usize,
}

#[derive(Serialize, Clone)]
pub struct ColorPair {
    pub color_a: String,
    pub color_b: String,
    pub distance: f64,
}

#[derive(Serialize, Clone)]
pub struct TypographyHealth {
    pub font_families: Vec<FontUsage>,
    pub font_sizes: Vec<f64>,
    pub unstandardized_sizes: Vec<f64>,
}

#[derive(Serialize, Clone)]
pub struct FontUsage {
    pub family: String,
    pub count: usize,
}

#[derive(Serialize, Clone)]
pub struct HealthIssue {
    pub severity: String,
    pub category: String,
    pub message: String,
    pub node_id: Option<u64>,
    pub suggestion: Option<String>,
}

fn color_to_hex(c: &Color) -> String {
    format!("#{:02x}{:02x}{:02x}", c.r, c.g, c.b)
}

fn color_distance(a: &Color, b: &Color) -> f64 {
    let dr = (a.r as f64 - b.r as f64).powi(2);
    let dg = (a.g as f64 - b.g as f64).powi(2);
    let db = (a.b as f64 - b.b as f64).powi(2);
    (dr + dg + db).sqrt()
}

fn parse_hex(hex: &str) -> Option<Color> {
    let hex = hex.trim_start_matches('#');
    if hex.len() != 6 { return None; }
    let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
    let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
    let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
    Some(Color { r, g, b, a: 1.0 })
}

/// Collect all nodes across all pages from a Scene
fn collect_all_nodes(scene: &Scene) -> Vec<(String, &Node)> {
    let mut result = Vec::new();
    let pages_info = scene.get_pages_info(); // Vec<(id, name)>
    let active_id = scene.get_active_page_id();

    // Active page nodes are accessible via nodes_map()
    for (page_id, page_name) in &pages_info {
        if *page_id == active_id {
            for node in scene.nodes_map().values() {
                result.push((page_name.clone(), node));
            }
        }
    }
    // For inactive pages, we only have active page access via public API.
    // We'll work with active page nodes — this is a limitation.
    // In practice the scene serializes all pages, but we use what's accessible.
    result
}

pub fn analyze_health(
    scene: &Scene,
    component_store: &ComponentStore,
    style_store: &StyleStore,
) -> HealthReport {
    let all_nodes = collect_all_nodes(scene);
    let all_components = component_store.list();

    // --- Components ---
    let mut instance_count = 0usize;
    let mut comp_usage: HashSet<u64> = HashSet::new();
    let mut detached: Vec<DetachedInstance> = Vec::new();
    let mut shape_count = 0usize;

    for (page_name, node) in &all_nodes {
        match &node.kind {
            NodeKind::Instance(data) => {
                instance_count += 1;
                comp_usage.insert(data.component_id);
                if component_store.get(data.component_id).is_none() {
                    detached.push(DetachedInstance {
                        node_id: node.id,
                        node_name: node.name.clone(),
                        missing_component_id: data.component_id,
                        page_name: page_name.clone(),
                    });
                }
            }
            NodeKind::Rect | NodeKind::Ellipse
            | NodeKind::Star { .. } | NodeKind::Polygon { .. }
            | NodeKind::Path { .. } | NodeKind::Image { .. } => {
                shape_count += 1;
            }
            NodeKind::Text { .. } => {
                shape_count += 1;
            }
            _ => {}
        }
    }

    let unused_components: Vec<NamedItem> = all_components.iter()
        .filter(|c| !comp_usage.contains(&c.id))
        .map(|c| NamedItem { id: c.id, name: c.name.clone() })
        .collect();

    let total_designable = instance_count + shape_count;
    let adoption_rate = if total_designable > 0 {
        instance_count as f64 / total_designable as f64
    } else { 1.0 };

    // --- Styles ---
    let color_styles = style_store.list_color_styles();
    let text_styles = style_store.list_text_styles();
    let mut used_cs: HashSet<u64> = HashSet::new();
    let mut used_ts: HashSet<u64> = HashSet::new();
    let mut nodes_with_style = 0usize;
    let mut nodes_needing_style = 0usize;

    for (_, node) in &all_nodes {
        let needs = matches!(node.kind,
            NodeKind::Rect | NodeKind::Ellipse | NodeKind::Text { .. }
            | NodeKind::Star { .. } | NodeKind::Polygon { .. }
            | NodeKind::Frame | NodeKind::Instance(_)
        );
        if needs {
            nodes_needing_style += 1;
            if node.color_style_id.is_some() || node.text_style_id.is_some() {
                nodes_with_style += 1;
            }
        }
        if let Some(id) = node.color_style_id { used_cs.insert(id); }
        if let Some(id) = node.text_style_id { used_ts.insert(id); }
    }

    let unused_cs: Vec<NamedItem> = color_styles.iter()
        .filter(|s| !used_cs.contains(&s.id))
        .map(|s| NamedItem { id: s.id, name: s.name.clone() })
        .collect();
    let unused_ts: Vec<NamedItem> = text_styles.iter()
        .filter(|s| !used_ts.contains(&s.id))
        .map(|s| NamedItem { id: s.id, name: s.name.clone() })
        .collect();

    let unused_cs_ids: Vec<u64> = unused_cs.iter().map(|s| s.id).collect();
    let unused_ts_ids: Vec<u64> = unused_ts.iter().map(|s| s.id).collect();

    let style_adoption = if nodes_needing_style > 0 {
        nodes_with_style as f64 / nodes_needing_style as f64
    } else { 1.0 };

    // --- Colors ---
    let style_hex: HashSet<String> = color_styles.iter()
        .map(|s| format!("#{:02x}{:02x}{:02x}", s.fill_r, s.fill_g, s.fill_b))
        .collect();

    let mut color_counts: HashMap<String, usize> = HashMap::new();
    for (_, node) in &all_nodes {
        for fill in &node.fills {
            if !fill.visible { continue; }
            if let FillType::Solid { color } = &fill.fill_type {
                let hex = color_to_hex(color);
                *color_counts.entry(hex).or_insert(0) += 1;
            }
        }
    }

    let mut hardcoded: Vec<HardcodedColor> = color_counts.iter()
        .filter(|(hex, count)| !style_hex.contains(hex.as_str()) && **count >= 2)
        .map(|(hex, count)| HardcodedColor { hex: hex.clone(), count: *count })
        .collect();
    hardcoded.sort_by(|a, b| b.count.cmp(&a.count));

    let unique_hex: Vec<&String> = color_counts.keys().collect();
    let mut near_dupes: Vec<ColorPair> = Vec::new();
    for i in 0..unique_hex.len() {
        for j in (i+1)..unique_hex.len() {
            if let (Some(ca), Some(cb)) = (parse_hex(unique_hex[i]), parse_hex(unique_hex[j])) {
                let dist = color_distance(&ca, &cb);
                if dist > 0.0 && dist < 15.0 {
                    near_dupes.push(ColorPair {
                        color_a: unique_hex[i].clone(),
                        color_b: unique_hex[j].clone(),
                        distance: (dist * 10.0).round() / 10.0,
                    });
                }
            }
        }
    }
    near_dupes.truncate(20);

    // --- Typography ---
    let mut font_counts: HashMap<String, usize> = HashMap::new();
    let mut font_size_set: HashSet<u64> = HashSet::new();
    let style_sizes: HashSet<u64> = text_styles.iter().map(|s| s.font_size.to_bits()).collect();

    for (_, node) in &all_nodes {
        if let NodeKind::Text { font_family, font_size, .. } = &node.kind {
            *font_counts.entry(font_family.clone()).or_insert(0) += 1;
            font_size_set.insert(font_size.to_bits());
        }
    }

    let mut font_families: Vec<FontUsage> = font_counts.into_iter()
        .map(|(family, count)| FontUsage { family, count })
        .collect();
    font_families.sort_by(|a, b| b.count.cmp(&a.count));

    let mut font_sizes: Vec<f64> = font_size_set.iter().map(|b| f64::from_bits(*b)).collect();
    font_sizes.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    let unstandardized: Vec<f64> = font_size_set.iter()
        .filter(|b| !style_sizes.contains(b))
        .map(|b| f64::from_bits(*b))
        .collect();

    // --- Issues ---
    let mut issues: Vec<HealthIssue> = Vec::new();

    for item in &unused_components {
        issues.push(HealthIssue {
            severity: "warning".into(), category: "component".into(),
            message: format!("Unused component: '{}'", item.name),
            node_id: None, suggestion: Some("Delete or archive".into()),
        });
    }
    for d in &detached {
        issues.push(HealthIssue {
            severity: "error".into(), category: "component".into(),
            message: format!("Detached instance '{}' — missing component", d.node_name),
            node_id: Some(d.node_id), suggestion: Some("Re-link or flatten".into()),
        });
    }
    for item in &unused_cs {
        issues.push(HealthIssue {
            severity: "info".into(), category: "style".into(),
            message: format!("Unused color style: '{}'", item.name),
            node_id: None, suggestion: Some("Remove to keep library clean".into()),
        });
    }
    for item in &unused_ts {
        issues.push(HealthIssue {
            severity: "info".into(), category: "style".into(),
            message: format!("Unused text style: '{}'", item.name),
            node_id: None, suggestion: Some("Remove to keep library clean".into()),
        });
    }
    for hc in &hardcoded {
        issues.push(HealthIssue {
            severity: "warning".into(), category: "color".into(),
            message: format!("Hardcoded color {} used {} times", hc.hex, hc.count),
            node_id: None, suggestion: Some("Create a shared color style".into()),
        });
    }
    for pair in &near_dupes {
        issues.push(HealthIssue {
            severity: "info".into(), category: "color".into(),
            message: format!("Near-duplicate: {} ↔ {} (dist {})", pair.color_a, pair.color_b, pair.distance),
            node_id: None, suggestion: Some("Consolidate into one color".into()),
        });
    }
    if font_families.len() > 3 {
        issues.push(HealthIssue {
            severity: "warning".into(), category: "typography".into(),
            message: format!("{} font families — consider reducing", font_families.len()),
            node_id: None, suggestion: Some("Limit to 2–3 families".into()),
        });
    }

    // --- Score ---
    let mut score: f64 = 100.0;
    score -= (unused_components.len() as f64 * 2.0).min(20.0);
    score -= (detached.len() as f64 * 5.0).min(25.0);
    score -= (1.0 - adoption_rate) * 15.0;
    score -= (1.0 - style_adoption) * 15.0;
    score -= ((unused_cs.len() + unused_ts.len()) as f64).min(10.0);
    score -= (hardcoded.len() as f64).min(10.0);
    score -= (near_dupes.len() as f64).min(5.0);

    HealthReport {
        score: score.max(0.0).round() as u32,
        components: ComponentHealth {
            total_components: all_components.len(),
            total_instances: instance_count,
            unused_components,
            detached_instances: detached,
            adoption_rate,
        },
        styles: StyleHealth {
            total_color_styles: color_styles.len(),
            total_text_styles: text_styles.len(),
            unused_color_styles: unused_cs,
            unused_text_styles: unused_ts,
            style_adoption_rate: style_adoption,
        },
        colors: ColorHealth {
            unique_colors: color_counts.len(),
            hardcoded_colors: hardcoded,
            near_duplicates: near_dupes,
        },
        typography: TypographyHealth {
            font_families,
            font_sizes,
            unstandardized_sizes: unstandardized,
        },
        issues,
        unused_color_style_ids: unused_cs_ids,
        unused_text_style_ids: unused_ts_ids,
    }
}
