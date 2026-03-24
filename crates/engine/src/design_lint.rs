use crate::node::{Node, NodeId, NodeKind, FillType, LayoutMode};
use crate::types::Color;
use serde::Serialize;
use std::collections::HashMap;

/// Lint issue severity
#[derive(Clone, Debug, Serialize, PartialEq)]
pub enum LintSeverity {
    Error,
    Warning,
    Info,
}

/// Lint rule category
#[derive(Clone, Debug, Serialize, PartialEq)]
pub enum LintCategory {
    Contrast,
    TouchTarget,
    TextSize,
    AltText,
    Spacing,
    CornerRadius,
    Color,
    Naming,
    Alignment,
    Opacity,
    Stroke,
}

/// A single lint issue
#[derive(Clone, Debug, Serialize)]
pub struct LintIssue {
    pub node_id: NodeId,
    pub node_name: String,
    pub severity: LintSeverity,
    pub category: LintCategory,
    pub rule: String,
    pub message: String,
    pub detail: Option<String>,
    /// Suggested fix (human-readable)
    pub suggestion: Option<String>,
}

/// Lint configuration
#[derive(Clone, Debug)]
pub struct LintConfig {
    pub min_touch_target: f64,
    pub min_font_size: f64,
    pub min_contrast_aa: f64,
    pub min_contrast_aaa: f64,
    pub spacing_tolerance: f64,
    pub near_miss_threshold: f64,
}

impl Default for LintConfig {
    fn default() -> Self {
        Self {
            min_touch_target: 44.0,
            min_font_size: 12.0,
            min_contrast_aa: 4.5,
            min_contrast_aaa: 7.0,
            spacing_tolerance: 1.0,
            near_miss_threshold: 2.0,
        }
    }
}

fn srgb_to_linear(c: u8) -> f64 {
    let v = c as f64 / 255.0;
    if v <= 0.03928 { v / 12.92 } else { ((v + 0.055) / 1.055).powf(2.4) }
}

fn relative_luminance(c: &Color) -> f64 {
    0.2126 * srgb_to_linear(c.r) + 0.7152 * srgb_to_linear(c.g) + 0.0722 * srgb_to_linear(c.b)
}

fn contrast_ratio(l1: f64, l2: f64) -> f64 {
    let (lighter, darker) = if l1 > l2 { (l1, l2) } else { (l2, l1) };
    (lighter + 0.05) / (darker + 0.05)
}

fn solid_color(node: &Node) -> Option<Color> {
    for f in node.visible_fills() {
        if let FillType::Solid { color } = &f.fill_type {
            return Some(color.clone());
        }
    }
    None
}

fn color_key(c: &Color) -> String {
    format!("#{:02x}{:02x}{:02x}", c.r, c.g, c.b)
}

/// Run all design lint rules on a node map.
pub fn run_lint(node_map: &HashMap<NodeId, Node>, config: &LintConfig) -> Vec<LintIssue> {
    let mut issues = Vec::new();
    let nodes: Vec<&Node> = node_map.values().collect();
    let node_ref_map: HashMap<NodeId, &Node> = node_map.iter().map(|(id, n)| (*id, n)).collect();

    // Pre-collect values for consistency checks
    let mut corner_radii: Vec<(NodeId, f64)> = Vec::new();
    let mut spacings: Vec<f64> = Vec::new();
    let mut color_usage: HashMap<String, Vec<NodeId>> = HashMap::new();

    for node in &nodes {
        if !node.visible { continue; }
        let kind_str = match &node.kind {
            NodeKind::Rect => "Rect",
            NodeKind::Ellipse => "Ellipse",
            NodeKind::Text { .. } => "Text",
            NodeKind::Frame => "Frame",
            NodeKind::Group => "Group",
            NodeKind::Image { .. } => "Image",
            NodeKind::Star { .. } => "Star",
            NodeKind::Polygon { .. } => "Polygon",
            NodeKind::Path { .. } => "Path",
            NodeKind::Section => "Section",
            NodeKind::Slice => continue,
            NodeKind::Connector { .. } => continue,
            _ => "Other",
        };

        // === Text checks ===
        if let NodeKind::Text { font_size, content, .. } = &node.kind {
            // Small font
            if *font_size < config.min_font_size {
                issues.push(LintIssue {
                    node_id: node.id, node_name: node.name.clone(),
                    severity: LintSeverity::Warning,
                    category: LintCategory::TextSize,
                    rule: "min-font-size".into(),
                    message: format!("Font size {:.0}px is below minimum {:.0}px", font_size, config.min_font_size),
                    detail: None,
                    suggestion: Some(format!("Increase to at least {:.0}px", config.min_font_size)),
                });
            }

            // Empty text node
            if content.trim().is_empty() {
                issues.push(LintIssue {
                    node_id: node.id, node_name: node.name.clone(),
                    severity: LintSeverity::Info,
                    category: LintCategory::Naming,
                    rule: "empty-text".into(),
                    message: "Text node has empty content".into(),
                    detail: None,
                    suggestion: Some("Add content or delete this node".into()),
                });
            }

            // Contrast check: text color vs parent fill
            if let Some(text_color) = solid_color(node) {
                let bg_color = node.parent
                    .and_then(|pid| node_ref_map.get(&pid))
                    .and_then(|p| solid_color(p))
                    .unwrap_or(Color { r: 255, g: 255, b: 255, a: 1.0 });

                let fg_lum = relative_luminance(&text_color);
                let bg_lum = relative_luminance(&bg_color);
                let ratio = contrast_ratio(fg_lum, bg_lum);

                let is_large = *font_size >= 24.0
                    || (*font_size >= 18.66 && match &node.kind {
                        NodeKind::Text { font_weight, .. } => *font_weight >= 700,
                        _ => false,
                    });
                let aa_min = if is_large { 3.0 } else { config.min_contrast_aa };

                if ratio < aa_min {
                    issues.push(LintIssue {
                        node_id: node.id, node_name: node.name.clone(),
                        severity: LintSeverity::Error,
                        category: LintCategory::Contrast,
                        rule: "contrast-aa".into(),
                        message: format!("Contrast ratio {:.1}:1 fails WCAG AA (needs ≥{:.1}:1)", ratio, aa_min),
                        detail: Some(format!("Text: {} | Background: {}", color_key(&text_color), color_key(&bg_color))),
                        suggestion: Some("Darken text or lighten background".into()),
                    });
                }
            }
        }

        // === Touch target ===
        if !matches!(&node.kind, NodeKind::Frame | NodeKind::Group | NodeKind::Section) && node.children.is_empty() {
            if node.width >= 8.0 && node.height >= 8.0 && (node.width < config.min_touch_target || node.height < config.min_touch_target) {
                issues.push(LintIssue {
                    node_id: node.id, node_name: node.name.clone(),
                    severity: LintSeverity::Warning,
                    category: LintCategory::TouchTarget,
                    rule: "min-touch-target".into(),
                    message: format!("Size {:.0}×{:.0}px is below {:.0}×{:.0}px touch target", node.width, node.height, config.min_touch_target, config.min_touch_target),
                    detail: None,
                    suggestion: Some(format!("Increase to at least {:.0}×{:.0}px", config.min_touch_target, config.min_touch_target)),
                });
            }
        }

        // === Image alt text ===
        if matches!(&node.kind, NodeKind::Image { .. }) {
            let generic = node.name.is_empty() || node.name.starts_with("Image ");
            if generic {
                issues.push(LintIssue {
                    node_id: node.id, node_name: node.name.clone(),
                    severity: LintSeverity::Error,
                    category: LintCategory::AltText,
                    rule: "image-alt".into(),
                    message: "Image lacks descriptive name (used as alt text)".into(),
                    detail: None,
                    suggestion: Some("Rename to describe the image content".into()),
                });
            }
        }

        // === Corner radius collection ===
        if node.corner_radius > 0.0 && matches!(&node.kind, NodeKind::Rect | NodeKind::Frame) {
            corner_radii.push((node.id, node.corner_radius));
        }

        // === Color collection ===
        if let Some(c) = solid_color(node) {
            let key = color_key(&c);
            color_usage.entry(key).or_default().push(node.id);
        }

        // === Opacity checks ===
        if node.opacity > 0.0 && node.opacity < 0.1 {
            issues.push(LintIssue {
                node_id: node.id, node_name: node.name.clone(),
                severity: LintSeverity::Info,
                category: LintCategory::Opacity,
                rule: "near-invisible".into(),
                message: format!("Opacity {:.0}% makes this nearly invisible", node.opacity * 100.0),
                detail: None,
                suggestion: Some("Hide the node or increase opacity".into()),
            });
        }

        // === Naming: default names ===
        let is_default_name = match &node.kind {
            NodeKind::Rect => node.name == "Rect" || node.name.starts_with("Rect "),
            NodeKind::Ellipse => node.name == "Ellipse" || node.name.starts_with("Ellipse "),
            NodeKind::Frame => node.name == "Frame" || node.name.starts_with("Frame "),
            NodeKind::Group => node.name == "Group" || node.name.starts_with("Group "),
            _ => false,
        };
        if is_default_name && !node.children.is_empty() {
            issues.push(LintIssue {
                node_id: node.id, node_name: node.name.clone(),
                severity: LintSeverity::Info,
                category: LintCategory::Naming,
                rule: "default-name".into(),
                message: "Container has a default name".into(),
                detail: None,
                suggestion: Some("Give a descriptive name for better organization".into()),
            });
        }

        // === Auto-layout spacing collection ===
        if node.layout.mode != LayoutMode::None {
            spacings.push(node.layout.gap);
        }

        // === Stroke without fill ===
        if !node.strokes.is_empty() && node.fills.is_empty() && !matches!(&node.kind, NodeKind::Path { .. } | NodeKind::Connector { .. }) {
            // This is fine, just info
        }

        // === Zero-size node ===
        if node.width == 0.0 || node.height == 0.0 {
            if !matches!(&node.kind, NodeKind::Connector { .. }) {
                issues.push(LintIssue {
                    node_id: node.id, node_name: node.name.clone(),
                    severity: LintSeverity::Warning,
                    category: LintCategory::Alignment,
                    rule: "zero-size".into(),
                    message: format!("Node has zero {} ({}×{})", if node.width == 0.0 { "width" } else { "height" }, node.width, node.height),
                    detail: None,
                    suggestion: Some("Set a non-zero size or delete".into()),
                });
            }
        }
    }

    // === Cross-node consistency checks ===

    // Corner radius near-misses: find radii that are close but not equal
    let mut unique_radii: Vec<f64> = corner_radii.iter().map(|(_, r)| *r).collect();
    unique_radii.sort_by(|a, b| a.partial_cmp(b).unwrap());
    unique_radii.dedup();
    for &(node_id, radius) in &corner_radii {
        for &other_r in &unique_radii {
            if other_r != radius {
                let diff = (radius - other_r).abs();
                if diff > 0.0 && diff <= config.near_miss_threshold {
                    let node_name = node_ref_map.get(&node_id).map(|n| n.name.clone()).unwrap_or_default();
                    issues.push(LintIssue {
                        node_id, node_name,
                        severity: LintSeverity::Warning,
                        category: LintCategory::CornerRadius,
                        rule: "inconsistent-radius".into(),
                        message: format!("Corner radius {:.0}px is close to {:.0}px used elsewhere", radius, other_r),
                        detail: None,
                        suggestion: Some(format!("Standardize to {:.0}px", other_r)),
                    });
                    break;
                }
            }
        }
    }

    // Spacing near-misses
    let mut unique_spacings: Vec<f64> = spacings.clone();
    unique_spacings.sort_by(|a, b| a.partial_cmp(b).unwrap());
    unique_spacings.dedup();
    // Only flag if there are spacings that are close but not equal
    for node in &nodes {
        if node.layout.mode != LayoutMode::None {
            let gap = node.layout.gap;
            for &other_g in &unique_spacings {
                if other_g != gap {
                    let diff = (gap - other_g).abs();
                    if diff > 0.0 && diff <= config.spacing_tolerance {
                        issues.push(LintIssue {
                            node_id: node.id, node_name: node.name.clone(),
                            severity: LintSeverity::Warning,
                            category: LintCategory::Spacing,
                            rule: "inconsistent-spacing".into(),
                            message: format!("Gap {:.0}px is close to {:.0}px used elsewhere", gap, other_g),
                            detail: None,
                            suggestion: Some(format!("Standardize to {:.0}px", other_g)),
                        });
                        break;
                    }
                }
            }
        }
    }

    // Near-miss colors: find colors that are very similar but not identical
    let color_keys: Vec<String> = color_usage.keys().cloned().collect();
    for i in 0..color_keys.len() {
        for j in (i+1)..color_keys.len() {
            let c1 = parse_hex(&color_keys[i]);
            let c2 = parse_hex(&color_keys[j]);
            if let (Some(c1), Some(c2)) = (c1, c2) {
                let diff = color_distance(&c1, &c2);
                if diff > 0.0 && diff <= 15.0 {
                    // Flag nodes using the less-common color
                    let ids1 = &color_usage[&color_keys[i]];
                    let ids2 = &color_usage[&color_keys[j]];
                    let (minor_key, minor_ids, major_key) = if ids1.len() <= ids2.len() {
                        (&color_keys[i], ids1, &color_keys[j])
                    } else {
                        (&color_keys[j], ids2, &color_keys[i])
                    };
                    for &nid in minor_ids.iter().take(3) {
                        let node_name = node_ref_map.get(&nid).map(|n| n.name.clone()).unwrap_or_default();
                        issues.push(LintIssue {
                            node_id: nid, node_name,
                            severity: LintSeverity::Info,
                            category: LintCategory::Color,
                            rule: "near-miss-color".into(),
                            message: format!("Color {} is very similar to {} (used more often)", minor_key, major_key),
                            detail: None,
                            suggestion: Some(format!("Consider using {} instead", major_key)),
                        });
                    }
                }
            }
        }
    }

    issues
}

fn parse_hex(hex: &str) -> Option<Color> {
    let hex = hex.trim_start_matches('#');
    if hex.len() != 6 { return None; }
    Some(Color {
        r: u8::from_str_radix(&hex[0..2], 16).ok()?,
        g: u8::from_str_radix(&hex[2..4], 16).ok()?,
        b: u8::from_str_radix(&hex[4..6], 16).ok()?,
        a: 1.0,
    })
}

fn color_distance(a: &Color, b: &Color) -> f64 {
    let dr = a.r as f64 - b.r as f64;
    let dg = a.g as f64 - b.g as f64;
    let db = a.b as f64 - b.b as f64;
    (dr * dr + dg * dg + db * db).sqrt()
}
