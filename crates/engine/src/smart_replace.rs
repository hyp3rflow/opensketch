use crate::node::{Node, NodeId, NodeKind};
use serde::{Serialize, Deserialize};
use std::collections::HashMap;

/// Thresholds for similarity matching
pub struct SimilarityThreshold {
    /// Max aspect-ratio difference (e.g. 0.15 = 15%)
    pub ratio_threshold: f64,
    /// Max area-ratio difference (e.g. 0.5 = 50%)
    pub size_threshold: f64,
}

/// A candidate node for smart replacement
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReplaceCandidate {
    pub id: u64,
    pub name: String,
    pub width: f64,
    pub height: f64,
    /// Similarity score 0.0–1.0 (1.0 = identical dimensions)
    pub similarity: f64,
}

/// Find nodes similar in size/aspect-ratio to a reference node.
pub fn find_similar_nodes(
    nodes: &HashMap<NodeId, Node>,
    target_id: NodeId,
    thresh: &SimilarityThreshold,
) -> Vec<ReplaceCandidate> {
    let target = match nodes.get(&target_id) {
        Some(n) => n,
        None => return vec![],
    };
    let target_ar = if target.height > 0.0 { target.width / target.height } else { 1.0 };
    let target_area = target.width * target.height;

    let mut candidates = Vec::new();
    for node in nodes.values() {
        if node.id == target_id { continue; }
        // Skip non-visual nodes
        match &node.kind {
            NodeKind::Slice | NodeKind::Connector { .. } => continue,
            _ => {}
        }
        if node.width <= 0.0 || node.height <= 0.0 { continue; }

        let ar = node.width / node.height;
        let area = node.width * node.height;

        let ar_diff = ((ar - target_ar) / target_ar).abs();
        let area_diff = if target_area > 0.0 { ((area - target_area) / target_area).abs() } else { 1.0 };

        if ar_diff <= thresh.ratio_threshold && area_diff <= thresh.size_threshold {
            let ar_sim = 1.0 - (ar_diff / thresh.ratio_threshold).min(1.0);
            let area_sim = 1.0 - (area_diff / thresh.size_threshold).min(1.0);
            let similarity = ar_sim * 0.6 + area_sim * 0.4;

            candidates.push(ReplaceCandidate {
                id: node.id,
                name: node.name.clone(),
                width: node.width,
                height: node.height,
                similarity,
            });
        }
    }
    candidates.sort_by(|a, b| b.similarity.partial_cmp(&a.similarity).unwrap_or(std::cmp::Ordering::Equal));
    candidates
}

/// Replace target nodes' visual content with source node's content.
/// Copies fills, strokes, opacity, corner_radius, shadows, blur, blend_mode.
/// For Image nodes, also copies src/fit. Preserves position and size.
pub fn replace_node_content(
    nodes: &mut HashMap<NodeId, Node>,
    source_id: NodeId,
    target_ids: &[NodeId],
) -> u32 {
    let source = match nodes.get(&source_id) {
        Some(n) => n.clone(),
        None => return 0,
    };

    let mut count = 0u32;
    for &tid in target_ids {
        if tid == source_id { continue; }
        if let Some(target) = nodes.get_mut(&tid) {
            // Copy visual properties
            target.fills = source.fills.clone();
            target.strokes = source.strokes.clone();
            target.opacity = source.opacity;
            target.corner_radius = source.corner_radius;
            target.shadows = source.shadows.clone();
            target.blur = source.blur;
            target.blend_mode = source.blend_mode;

            // Copy kind-specific content
            match (&source.kind, &mut target.kind) {
                (NodeKind::Image { src, fit, focal_x, focal_y, crop }, NodeKind::Image { src: ref mut ts, fit: ref mut tf, focal_x: ref mut fx, focal_y: ref mut fy, crop: ref mut tc }) => {
                    *ts = src.clone();
                    *tf = fit.clone();
                    *fx = *focal_x;
                    *fy = *focal_y;
                    *tc = crop.clone();
                }
                (NodeKind::Image { src, fit, focal_x, focal_y, crop }, _) => {
                    target.kind = NodeKind::Image { src: src.clone(), fit: fit.clone(), focal_x: *focal_x, focal_y: *focal_y, crop: crop.clone() };
                }
                _ => {
                    // For other types, visual properties (fills/strokes) are already copied
                }
            }
            count += 1;
        }
    }
    count
}
