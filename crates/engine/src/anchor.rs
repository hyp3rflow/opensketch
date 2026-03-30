use serde::{Deserialize, Serialize};
use crate::node::{Node, NodeId, NodeKind};

/// Anchor position on a node's bounding box
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum AnchorPosition {
    Top,
    Right,
    Bottom,
    Left,
    Center,
    Custom(f64, f64),
}

impl Default for AnchorPosition {
    fn default() -> Self { AnchorPosition::Center }
}

impl AnchorPosition {
    pub fn as_str(&self) -> &str {
        match self {
            AnchorPosition::Top => "top",
            AnchorPosition::Right => "right",
            AnchorPosition::Bottom => "bottom",
            AnchorPosition::Left => "left",
            AnchorPosition::Center => "center",
            AnchorPosition::Custom(_, _) => "custom",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "top" => AnchorPosition::Top,
            "right" => AnchorPosition::Right,
            "bottom" => AnchorPosition::Bottom,
            "left" => AnchorPosition::Left,
            "center" => AnchorPosition::Center,
            _ => AnchorPosition::Center,
        }
    }
}

/// An anchor point on a node
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AnchorPoint {
    pub position: AnchorPosition,
    #[serde(default)]
    pub offset_x: f64,
    #[serde(default)]
    pub offset_y: f64,
}

impl AnchorPoint {
    pub fn new(position: AnchorPosition) -> Self {
        Self { position, offset_x: 0.0, offset_y: 0.0 }
    }
}

/// Default 4 anchors for any node
pub fn default_anchors() -> Vec<AnchorPoint> {
    vec![
        AnchorPoint::new(AnchorPosition::Top),
        AnchorPoint::new(AnchorPosition::Right),
        AnchorPoint::new(AnchorPosition::Bottom),
        AnchorPoint::new(AnchorPosition::Left),
    ]
}

/// Get world-space position of an anchor on a node (rotation-aware)
pub fn get_anchor_world_pos(node: &Node, anchor: &AnchorPosition) -> (f64, f64) {
    let cx = node.x + node.width / 2.0;
    let cy = node.y + node.height / 2.0;

    // Local offset from center
    let (lx, ly) = match anchor {
        AnchorPosition::Top => (0.0, -node.height / 2.0),
        AnchorPosition::Right => (node.width / 2.0, 0.0),
        AnchorPosition::Bottom => (0.0, node.height / 2.0),
        AnchorPosition::Left => (-node.width / 2.0, 0.0),
        AnchorPosition::Center => (0.0, 0.0),
        AnchorPosition::Custom(rx, ry) => {
            // rx, ry are 0..1 normalized
            (rx * node.width - node.width / 2.0, ry * node.height - node.height / 2.0)
        }
    };

    // Apply rotation
    if node.rotation.abs() < 0.001 {
        (cx + lx, cy + ly)
    } else {
        let rad = node.rotation.to_radians();
        let cos_r = rad.cos();
        let sin_r = rad.sin();
        (cx + lx * cos_r - ly * sin_r, cy + lx * sin_r + ly * cos_r)
    }
}

/// Anchor connection info for a connector endpoint
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct AnchorConnection {
    pub node_id: NodeId,
    pub anchor: AnchorPosition,
}

/// Find nearest anchor to a scene position across all visible nodes.
/// Returns (node_id, anchor_position, world_x, world_y) if within threshold.
pub fn snap_to_nearest_anchor(
    nodes: &[&Node],
    pos_x: f64,
    pos_y: f64,
    threshold: f64,
    exclude_node_id: Option<NodeId>,
) -> Option<(NodeId, AnchorPosition, f64, f64)> {
    let threshold_sq = threshold * threshold;
    let mut best: Option<(NodeId, AnchorPosition, f64, f64, f64)> = None;

    let standard_anchors = [
        AnchorPosition::Top,
        AnchorPosition::Right,
        AnchorPosition::Bottom,
        AnchorPosition::Left,
    ];

    for node in nodes {
        if !node.visible || node.locked {
            continue;
        }
        // Skip connectors, slices, sections
        match &node.kind {
            NodeKind::Connector { .. } | NodeKind::Slice | NodeKind::Section => continue,
            _ => {}
        }
        if let Some(exc) = exclude_node_id {
            if node.id == exc { continue; }
        }

        // Check custom anchors first
        for anchor_pos in &node.anchors {
            let (wx, wy) = get_anchor_world_pos(node, &anchor_pos.position);
            let dx = wx - pos_x;
            let dy = wy - pos_y;
            let dist_sq = dx * dx + dy * dy;
            if dist_sq < threshold_sq {
                if best.is_none() || dist_sq < best.as_ref().unwrap().4 {
                    best = Some((node.id, anchor_pos.position.clone(), wx, wy, dist_sq));
                }
            }
        }

        // Check standard anchors
        for anchor_pos in &standard_anchors {
            let (wx, wy) = get_anchor_world_pos(node, anchor_pos);
            let dx = wx - pos_x;
            let dy = wy - pos_y;
            let dist_sq = dx * dx + dy * dy;
            if dist_sq < threshold_sq {
                if best.is_none() || dist_sq < best.as_ref().unwrap().4 {
                    best = Some((node.id, anchor_pos.clone(), wx, wy, dist_sq));
                }
            }
        }
    }

    best.map(|(id, pos, wx, wy, _)| (id, pos, wx, wy))
}
