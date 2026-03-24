//! Smart Selection — similarity-based node selection with configurable criteria.
//!
//! Unlike exact `select_same_*` methods, smart selection uses distance thresholds
//! and a multi-criteria similarity score to find "similar" nodes.

use crate::node::{Node, NodeId, NodeKind};
use crate::types::Color;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Which properties to consider when computing similarity.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SmartSelectCriteria {
    /// Match fill color (with tolerance)
    pub fill_color: bool,
    /// Match stroke color (with tolerance)
    pub stroke_color: bool,
    /// Match node kind (Rect, Ellipse, etc.)
    pub node_kind: bool,
    /// Match size (width/height within tolerance)
    pub size: bool,
    /// Match opacity
    pub opacity: bool,
    /// Match corner radius
    pub corner_radius: bool,
    /// Match font (for text nodes)
    pub font: bool,
    /// Match font size (for text nodes)
    pub font_size: bool,
    /// Match stroke width
    pub stroke_width: bool,
    /// Color distance threshold (0–442, Euclidean RGB distance). Default 30.
    pub color_threshold: f64,
    /// Size tolerance as ratio (0.2 = within 20%). Default 0.2.
    pub size_threshold: f64,
    /// Opacity tolerance (absolute). Default 0.1.
    pub opacity_threshold: f64,
    /// Corner radius tolerance (pixels). Default 2.0.
    pub corner_radius_threshold: f64,
    /// Font size tolerance (pixels). Default 2.0.
    pub font_size_threshold: f64,
    /// Stroke width tolerance (pixels). Default 1.0.
    pub stroke_width_threshold: f64,
}

impl Default for SmartSelectCriteria {
    fn default() -> Self {
        Self {
            fill_color: true,
            stroke_color: false,
            node_kind: true,
            size: false,
            opacity: false,
            corner_radius: false,
            font: false,
            font_size: false,
            stroke_width: false,
            color_threshold: 30.0,
            size_threshold: 0.2,
            opacity_threshold: 0.1,
            corner_radius_threshold: 2.0,
            font_size_threshold: 2.0,
            stroke_width_threshold: 1.0,
        }
    }
}

/// Euclidean color distance in RGB space (0–441.67).
pub fn color_distance(a: &Color, b: &Color) -> f64 {
    let dr = a.r as f64 - b.r as f64;
    let dg = a.g as f64 - b.g as f64;
    let db = a.b as f64 - b.b as f64;
    let da = (a.a - b.a) * 255.0; // scale alpha to 0-255 range
    (dr * dr + dg * dg + db * db + da * da).sqrt()
}

/// Check if two sizes are similar within a ratio threshold.
fn size_similar(w1: f64, h1: f64, w2: f64, h2: f64, threshold: f64) -> bool {
    if w1 == 0.0 || h1 == 0.0 || w2 == 0.0 || h2 == 0.0 {
        return false;
    }
    let wr = (w1 - w2).abs() / w1.max(w2);
    let hr = (h1 - h2).abs() / h1.max(h2);
    wr <= threshold && hr <= threshold
}

/// Run smart selection: find all nodes similar to `reference_id` based on criteria.
/// Returns matching node IDs (including the reference node).
pub fn smart_select(
    nodes: &HashMap<NodeId, Node>,
    reference_id: NodeId,
    criteria: &SmartSelectCriteria,
) -> Vec<NodeId> {
    let reference = match nodes.get(&reference_id) {
        Some(n) => n,
        None => return vec![],
    };

    let ref_fill_color = reference.fills.first().map(|f| f.color());
    let ref_stroke_color = reference.strokes.first().map(|s| s.color);
    let ref_stroke_width = reference.strokes.first().map(|s| s.width);
    let ref_kind = std::mem::discriminant(&reference.kind);
    let ref_font = match &reference.kind {
        NodeKind::Text { font_family, .. } => Some(font_family.clone()),
        _ => None,
    };
    let ref_font_size = match &reference.kind {
        NodeKind::Text { font_size, .. } => Some(*font_size),
        _ => None,
    };

    let mut result = vec![];

    for node in nodes.values() {
        if !node.visible || node.locked {
            continue;
        }

        let mut matches = true;

        // Fill color similarity
        if criteria.fill_color {
            if let Some(ref_c) = &ref_fill_color {
                if let Some(fill) = node.fills.first() {
                    let dist = color_distance(ref_c, &fill.color());
                    if dist > criteria.color_threshold {
                        matches = false;
                    }
                } else {
                    matches = false;
                }
            }
        }

        // Stroke color similarity
        if matches && criteria.stroke_color {
            if let Some(ref_c) = &ref_stroke_color {
                if let Some(stroke) = node.strokes.first() {
                    let dist = color_distance(ref_c, &stroke.color);
                    if dist > criteria.color_threshold {
                        matches = false;
                    }
                } else {
                    matches = false;
                }
            }
        }

        // Node kind
        if matches && criteria.node_kind {
            if std::mem::discriminant(&node.kind) != ref_kind {
                matches = false;
            }
        }

        // Size
        if matches && criteria.size {
            if !size_similar(
                reference.width, reference.height,
                node.width, node.height,
                criteria.size_threshold,
            ) {
                matches = false;
            }
        }

        // Opacity
        if matches && criteria.opacity {
            if (reference.opacity - node.opacity).abs() > criteria.opacity_threshold {
                matches = false;
            }
        }

        // Corner radius
        if matches && criteria.corner_radius {
            if (reference.corner_radius - node.corner_radius).abs() > criteria.corner_radius_threshold {
                matches = false;
            }
        }

        // Font family (text nodes only)
        if matches && criteria.font {
            if let Some(ref_f) = &ref_font {
                match &node.kind {
                    NodeKind::Text { font_family, .. } => {
                        if font_family != ref_f {
                            matches = false;
                        }
                    }
                    _ => { matches = false; }
                }
            }
        }

        // Font size (text nodes only)
        if matches && criteria.font_size {
            if let Some(ref_fs) = ref_font_size {
                match &node.kind {
                    NodeKind::Text { font_size, .. } => {
                        if (*font_size - ref_fs).abs() > criteria.font_size_threshold {
                            matches = false;
                        }
                    }
                    _ => { matches = false; }
                }
            }
        }

        // Stroke width
        if matches && criteria.stroke_width {
            if let Some(ref_sw) = ref_stroke_width {
                if let Some(stroke) = node.strokes.first() {
                    if (stroke.width - ref_sw).abs() > criteria.stroke_width_threshold {
                        matches = false;
                    }
                } else {
                    matches = false;
                }
            }
        }

        if matches {
            result.push(node.id);
        }
    }

    result
}

/// Compute a similarity score (0.0–1.0) between two nodes across all visual properties.
/// Useful for ranking/sorting results.
pub fn similarity_score(a: &Node, b: &Node) -> f64 {
    let mut score = 0.0;
    let mut weight_total = 0.0;

    // Kind match (weight 2)
    weight_total += 2.0;
    if std::mem::discriminant(&a.kind) == std::mem::discriminant(&b.kind) {
        score += 2.0;
    }

    // Fill color similarity (weight 3)
    if let (Some(fa), Some(fb)) = (a.fills.first(), b.fills.first()) {
        weight_total += 3.0;
        let dist = color_distance(&fa.color(), &fb.color());
        score += 3.0 * (1.0 - (dist / 442.0).min(1.0));
    }

    // Size similarity (weight 1)
    weight_total += 1.0;
    let max_w = a.width.max(b.width).max(1.0);
    let max_h = a.height.max(b.height).max(1.0);
    let size_sim = 1.0 - ((a.width - b.width).abs() / max_w + (a.height - b.height).abs() / max_h) / 2.0;
    score += 1.0 * size_sim.max(0.0);

    // Opacity similarity (weight 1)
    weight_total += 1.0;
    score += 1.0 * (1.0 - (a.opacity - b.opacity).abs());

    // Corner radius (weight 0.5)
    weight_total += 0.5;
    let max_cr = a.corner_radius.max(b.corner_radius).max(1.0);
    score += 0.5 * (1.0 - (a.corner_radius - b.corner_radius).abs() / max_cr).max(0.0);

    // Stroke similarity (weight 1)
    if let (Some(sa), Some(sb)) = (a.strokes.first(), b.strokes.first()) {
        weight_total += 1.0;
        let cdist = color_distance(&sa.color, &sb.color);
        let color_sim = 1.0 - (cdist / 442.0).min(1.0);
        let max_sw = sa.width.max(sb.width).max(1.0);
        let width_sim = 1.0 - (sa.width - sb.width).abs() / max_sw;
        score += 1.0 * (color_sim * 0.7 + width_sim * 0.3);
    }

    if weight_total > 0.0 { score / weight_total } else { 0.0 }
}

/// Group suggestion: find clusters of similar nodes that could be grouped together.
/// Returns groups of node IDs where each group has nodes with similarity >= threshold.
pub fn suggest_groups(
    nodes: &HashMap<NodeId, Node>,
    similarity_threshold: f64,
) -> Vec<Vec<NodeId>> {
    let visible_nodes: Vec<&Node> = nodes.values()
        .filter(|n| n.visible && !n.locked && n.parent.is_none())
        .collect();

    if visible_nodes.len() < 2 {
        return vec![];
    }

    // Simple greedy clustering
    let mut used = vec![false; visible_nodes.len()];
    let mut groups: Vec<Vec<NodeId>> = vec![];

    for i in 0..visible_nodes.len() {
        if used[i] { continue; }
        let mut group = vec![visible_nodes[i].id];
        used[i] = true;

        for j in (i + 1)..visible_nodes.len() {
            if used[j] { continue; }
            let sim = similarity_score(visible_nodes[i], visible_nodes[j]);
            if sim >= similarity_threshold {
                group.push(visible_nodes[j].id);
                used[j] = true;
            }
        }

        if group.len() >= 2 {
            groups.push(group);
        }
    }

    groups
}
