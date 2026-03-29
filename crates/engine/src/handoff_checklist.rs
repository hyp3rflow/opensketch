use std::collections::{HashMap, HashSet};
use serde::Serialize;
use crate::node::{Node, NodeKind, FillType};
use crate::component::ComponentStore;
use crate::styles::StyleStore;
use crate::scene::Scene;

#[derive(Serialize, Clone, PartialEq)]
pub enum Severity {
    Error,
    Warning,
    Info,
}

#[derive(Serialize, Clone)]
pub struct ChecklistItem {
    pub id: String,
    pub category: String,
    pub title: String,
    pub description: String,
    pub severity: Severity,
    pub node_ids: Vec<u64>,
    pub passed: bool,
}

#[derive(Serialize, Clone)]
pub struct HandoffChecklist {
    pub total_items: usize,
    pub passed_items: usize,
    pub completion_pct: f64,
    pub categories: Vec<CategorySummary>,
    pub items: Vec<ChecklistItem>,
}

#[derive(Serialize, Clone)]
pub struct CategorySummary {
    pub name: String,
    pub total: usize,
    pub passed: usize,
}

pub fn analyze(
    scene: &Scene,
    components: &ComponentStore,
    styles: &StyleStore,
) -> HandoffChecklist {
    let mut items: Vec<ChecklistItem> = Vec::new();
    let nodes = scene.nodes_map();

    check_naming(nodes, &mut items);
    check_styles(nodes, styles, &mut items);
    check_components(nodes, components, &mut items);
    check_images(nodes, &mut items);
    check_text(nodes, &mut items);
    check_layout(nodes, &mut items);
    check_export_readiness(nodes, &mut items);

    let mut cat_map: HashMap<String, (usize, usize)> = HashMap::new();
    for item in &items {
        let entry = cat_map.entry(item.category.clone()).or_insert((0, 0));
        entry.0 += 1;
        if item.passed { entry.1 += 1; }
    }

    let mut categories: Vec<CategorySummary> = cat_map
        .into_iter()
        .map(|(name, (total, passed))| CategorySummary { name, total, passed })
        .collect();
    categories.sort_by(|a, b| a.name.cmp(&b.name));

    let total = items.len();
    let passed = items.iter().filter(|i| i.passed).count();
    let completion_pct = if total == 0 { 100.0 } else { (passed as f64 / total as f64 * 100.0).round() };

    HandoffChecklist { total_items: total, passed_items: passed, completion_pct, categories, items }
}

fn is_default_name(name: &str) -> bool {
    let n = name.trim();
    if n.is_empty() { return true; }
    let prefixes = [
        "Rectangle", "Ellipse", "Frame", "Group", "Text", "Node",
        "Star", "Polygon", "Path", "Image", "Slice", "Connector",
        "Section", "Instance",
    ];
    for prefix in &prefixes {
        if let Some(rest) = n.strip_prefix(prefix) {
            let rest = rest.trim();
            if rest.is_empty() || rest.chars().all(|c| c.is_ascii_digit() || c == ' ') {
                return true;
            }
        }
    }
    false
}

fn check_naming(nodes: &HashMap<u64, Node>, items: &mut Vec<ChecklistItem>) {
    let cat = "Naming".to_string();
    let unnamed: Vec<u64> = nodes.values()
        .filter(|n| n.visible && !matches!(n.kind, NodeKind::Group) && is_default_name(&n.name))
        .map(|n| n.id)
        .collect();

    items.push(ChecklistItem {
        id: "naming-all-named".into(),
        category: cat,
        title: "All layers are named".into(),
        description: if unnamed.is_empty() {
            "All visible layers have descriptive names.".into()
        } else {
            format!("{} layer(s) still have default names.", unnamed.len())
        },
        severity: if unnamed.is_empty() { Severity::Info } else { Severity::Warning },
        node_ids: unnamed.clone(),
        passed: unnamed.is_empty(),
    });
}

fn check_styles(nodes: &HashMap<u64, Node>, styles: &StyleStore, items: &mut Vec<ChecklistItem>) {
    let cat = "Styles".to_string();

    // Collect color style hex values
    let color_style_colors: HashSet<String> = styles.color_styles.values()
        .map(|cs| format!("#{:02x}{:02x}{:02x}", cs.fill_r, cs.fill_g, cs.fill_b))
        .collect();

    let mut unstyled_nodes: Vec<u64> = Vec::new();
    for n in nodes.values() {
        if !n.visible { continue; }
        for fill in &n.fills {
            if !fill.visible { continue; }
            if let FillType::Solid { color } = &fill.fill_type {
                let hex = format!("#{:02x}{:02x}{:02x}", color.r, color.g, color.b);
                if !color_style_colors.contains(&hex) && hex != "#ffffff" && hex != "#000000" {
                    unstyled_nodes.push(n.id);
                    break;
                }
            }
        }
    }
    unstyled_nodes.sort();
    unstyled_nodes.dedup();

    items.push(ChecklistItem {
        id: "styles-colors-linked".into(),
        category: cat.clone(),
        title: "Colors use shared styles".into(),
        description: if unstyled_nodes.is_empty() {
            "All fills use color styles or standard black/white.".into()
        } else {
            format!("{} node(s) use raw colors not linked to styles.", unstyled_nodes.len())
        },
        severity: if unstyled_nodes.is_empty() { Severity::Info } else { Severity::Warning },
        node_ids: unstyled_nodes.clone(),
        passed: unstyled_nodes.is_empty(),
    });

    let text_style_count = styles.text_styles.len();
    let has_text_nodes = nodes.values().any(|n| matches!(n.kind, NodeKind::Text { .. }) && n.visible);
    let has_text_styles = text_style_count > 0 || !has_text_nodes;

    items.push(ChecklistItem {
        id: "styles-text-defined".into(),
        category: cat,
        title: "Text styles are defined".into(),
        description: if has_text_styles {
            format!("{} text style(s) defined.", text_style_count)
        } else {
            "No text styles defined. Consider creating shared text styles.".into()
        },
        severity: if has_text_styles { Severity::Info } else { Severity::Warning },
        node_ids: vec![],
        passed: has_text_styles,
    });
}

fn check_components(nodes: &HashMap<u64, Node>, components: &ComponentStore, items: &mut Vec<ChecklistItem>) {
    let cat = "Components".to_string();

    let comp_ids: HashSet<u64> = components.list().iter().map(|c| c.id).collect();

    let detached: Vec<u64> = nodes.values()
        .filter(|n| {
            if let NodeKind::Instance(data) = &n.kind {
                !comp_ids.contains(&data.component_id)
            } else {
                false
            }
        })
        .map(|n| n.id)
        .collect();

    items.push(ChecklistItem {
        id: "components-no-detached".into(),
        category: cat,
        title: "No detached instances".into(),
        description: if detached.is_empty() {
            "All instances are linked to components.".into()
        } else {
            format!("{} detached instance(s) found.", detached.len())
        },
        severity: if detached.is_empty() { Severity::Info } else { Severity::Error },
        node_ids: detached.clone(),
        passed: detached.is_empty(),
    });
}

fn check_images(nodes: &HashMap<u64, Node>, items: &mut Vec<ChecklistItem>) {
    let cat = "Assets".to_string();

    let images: Vec<&Node> = nodes.values()
        .filter(|n| matches!(n.kind, NodeKind::Image { .. }) && n.visible)
        .collect();

    let unnamed_images: Vec<u64> = images.iter()
        .filter(|n| is_default_name(&n.name))
        .map(|n| n.id)
        .collect();

    items.push(ChecklistItem {
        id: "assets-images-named".into(),
        category: cat.clone(),
        title: "Images have descriptive names".into(),
        description: if unnamed_images.is_empty() {
            "All image layers have descriptive names (alt text).".into()
        } else {
            format!("{} image(s) with default names (missing alt text).", unnamed_images.len())
        },
        severity: if unnamed_images.is_empty() { Severity::Info } else { Severity::Warning },
        node_ids: unnamed_images.clone(),
        passed: unnamed_images.is_empty(),
    });

    let empty_src: Vec<u64> = images.iter()
        .filter(|n| {
            if let NodeKind::Image { src, .. } = &n.kind { src.is_empty() } else { false }
        })
        .map(|n| n.id)
        .collect();

    items.push(ChecklistItem {
        id: "assets-images-have-src".into(),
        category: cat,
        title: "Images have source URLs".into(),
        description: if empty_src.is_empty() {
            "All images have valid sources.".into()
        } else {
            format!("{} image(s) missing source URL.", empty_src.len())
        },
        severity: if empty_src.is_empty() { Severity::Info } else { Severity::Error },
        node_ids: empty_src.clone(),
        passed: empty_src.is_empty(),
    });
}

fn check_text(nodes: &HashMap<u64, Node>, items: &mut Vec<ChecklistItem>) {
    let cat = "Text".to_string();

    let text_nodes: Vec<&Node> = nodes.values()
        .filter(|n| matches!(n.kind, NodeKind::Text { .. }) && n.visible)
        .collect();

    let empty_text: Vec<u64> = text_nodes.iter()
        .filter(|n| {
            if let NodeKind::Text { content, .. } = &n.kind { content.trim().is_empty() } else { false }
        })
        .map(|n| n.id)
        .collect();

    items.push(ChecklistItem {
        id: "text-no-empty".into(),
        category: cat.clone(),
        title: "No empty text layers".into(),
        description: if empty_text.is_empty() {
            "All text layers contain content.".into()
        } else {
            format!("{} empty text layer(s) found.", empty_text.len())
        },
        severity: if empty_text.is_empty() { Severity::Info } else { Severity::Warning },
        node_ids: empty_text.clone(),
        passed: empty_text.is_empty(),
    });

    let small_text: Vec<u64> = text_nodes.iter()
        .filter(|n| {
            if let NodeKind::Text { font_size, .. } = &n.kind { *font_size < 10.0 } else { false }
        })
        .map(|n| n.id)
        .collect();

    items.push(ChecklistItem {
        id: "text-min-size".into(),
        category: cat,
        title: "Text meets minimum size (10px)".into(),
        description: if small_text.is_empty() {
            "All text is at least 10px.".into()
        } else {
            format!("{} text layer(s) below 10px.", small_text.len())
        },
        severity: if small_text.is_empty() { Severity::Info } else { Severity::Warning },
        node_ids: small_text.clone(),
        passed: small_text.is_empty(),
    });
}

fn check_layout(nodes: &HashMap<u64, Node>, items: &mut Vec<ChecklistItem>) {
    let cat = "Layout".to_string();

    let fractional: Vec<u64> = nodes.values()
        .filter(|n| n.visible && (n.x.fract().abs() > 0.01 || n.y.fract().abs() > 0.01
            || n.width.fract().abs() > 0.01 || n.height.fract().abs() > 0.01))
        .map(|n| n.id)
        .collect();

    items.push(ChecklistItem {
        id: "layout-pixel-aligned".into(),
        category: cat.clone(),
        title: "Layers are pixel-aligned".into(),
        description: if fractional.is_empty() {
            "All layers have integer positions and sizes.".into()
        } else {
            format!("{} layer(s) have sub-pixel values.", fractional.len())
        },
        severity: Severity::Info,
        node_ids: fractional.clone(),
        passed: fractional.is_empty(),
    });

    let zero_size: Vec<u64> = nodes.values()
        .filter(|n| n.visible && (n.width <= 0.0 || n.height <= 0.0))
        .map(|n| n.id)
        .collect();

    items.push(ChecklistItem {
        id: "layout-no-zero-size".into(),
        category: cat,
        title: "No zero-size layers".into(),
        description: if zero_size.is_empty() {
            "All visible layers have positive dimensions.".into()
        } else {
            format!("{} layer(s) with zero/negative size.", zero_size.len())
        },
        severity: if zero_size.is_empty() { Severity::Info } else { Severity::Error },
        node_ids: zero_size.clone(),
        passed: zero_size.is_empty(),
    });
}

fn check_export_readiness(nodes: &HashMap<u64, Node>, items: &mut Vec<ChecklistItem>) {
    let cat = "Export".to_string();

    let top_frames: Vec<&Node> = nodes.values()
        .filter(|n| matches!(n.kind, NodeKind::Frame) && n.parent.map_or(true, |p| p == 0))
        .collect();

    let unnamed_frames: Vec<u64> = top_frames.iter()
        .filter(|n| is_default_name(&n.name))
        .map(|n| n.id)
        .collect();

    items.push(ChecklistItem {
        id: "export-frames-named".into(),
        category: cat.clone(),
        title: "Top-level frames are named".into(),
        description: if unnamed_frames.is_empty() {
            "All top-level frames have descriptive names.".into()
        } else {
            format!("{} top-level frame(s) with default names.", unnamed_frames.len())
        },
        severity: if unnamed_frames.is_empty() { Severity::Info } else { Severity::Warning },
        node_ids: unnamed_frames.clone(),
        passed: unnamed_frames.is_empty(),
    });

    let total = nodes.len();
    items.push(ChecklistItem {
        id: "export-node-count".into(),
        category: cat,
        title: "Scene complexity".into(),
        description: format!("{} total nodes in scene.", total),
        severity: Severity::Info,
        node_ids: vec![],
        passed: true,
    });
}
