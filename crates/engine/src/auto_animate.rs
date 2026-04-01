use serde::{Deserialize, Serialize};
use crate::node::{Node, NodeId, NodeKind, FillType, PathPoint};
use crate::scene::Scene;
use std::collections::HashMap;

/// Snapshot of animatable properties for a single node
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NodeSnapshot {
    pub id: u64,
    pub name: String,
    /// Position relative to the frame origin
    pub rel_x: f64,
    pub rel_y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: f64,
    pub opacity: f64,
    pub corner_radius: f64,
    pub blur: f64,
    /// First solid fill RGBA (if any)
    pub fill_r: Option<u8>,
    pub fill_g: Option<u8>,
    pub fill_b: Option<u8>,
    pub fill_a: Option<f64>,
    /// First stroke width (if any)
    pub stroke_width: Option<f64>,
    /// Path data for morphing (only for Path nodes)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path_points: Option<Vec<PathPoint>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path_closed: Option<bool>,
    /// Whether this node is a Path (for client-side morph detection)
    #[serde(default)]
    pub is_path: bool,
}

/// A matched pair of nodes between source and target frames
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AnimatePair {
    pub name: String,
    pub from: NodeSnapshot,
    pub to: NodeSnapshot,
}

/// Result of auto-animate computation
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AutoAnimateResult {
    pub pairs: Vec<AnimatePair>,
    /// Node names only in source (fade out)
    pub removed: Vec<NodeSnapshot>,
    /// Node names only in target (fade in)
    pub added: Vec<NodeSnapshot>,
}

fn snapshot_node(node: &Node, frame_x: f64, frame_y: f64) -> NodeSnapshot {
    let (fill_r, fill_g, fill_b, fill_a) = node.fills.first()
        .and_then(|f| match &f.fill_type {
            FillType::Solid { color } => Some((color.r, color.g, color.b, color.a)),
            _ => None,
        })
        .map(|(r, g, b, a)| (Some(r), Some(g), Some(b), Some(a)))
        .unwrap_or((None, None, None, None));

    let stroke_width = node.strokes.first().map(|s| s.width);

    let (path_points, path_closed, is_path) = match &node.kind {
        NodeKind::Path { points, closed } => (Some(points.clone()), Some(*closed), true),
        _ => (None, None, false),
    };

    NodeSnapshot {
        id: node.id,
        name: node.name.clone(),
        rel_x: node.x - frame_x,
        rel_y: node.y - frame_y,
        width: node.width,
        height: node.height,
        rotation: node.rotation,
        opacity: node.opacity,
        corner_radius: node.corner_radius,
        blur: node.blur,
        fill_r, fill_g, fill_b, fill_a,
        stroke_width,
        path_points, path_closed, is_path,
    }
}

fn collect_descendants(scene: &Scene, parent_id: NodeId, frame_x: f64, frame_y: f64) -> HashMap<String, NodeSnapshot> {
    let mut map = HashMap::new();
    let mut stack = vec![parent_id];
    while let Some(id) = stack.pop() {
        if let Some(node) = scene.get_node(id) {
            if id != parent_id {
                // Use first occurrence of each name
                map.entry(node.name.clone())
                    .or_insert_with(|| snapshot_node(node, frame_x, frame_y));
            }
            for &child_id in node.children.iter().rev() {
                stack.push(child_id);
            }
        }
    }
    map
}

impl Scene {
    /// Compute auto-animate pairs between two frames (matched by child node name).
    /// Returns JSON-serializable result with matched pairs, removed, and added nodes.
    pub fn compute_auto_animate(&self, from_frame_id: NodeId, to_frame_id: NodeId) -> AutoAnimateResult {
        let from_node = self.get_node(from_frame_id);
        let to_node = self.get_node(to_frame_id);

        let (from_x, from_y) = from_node.map(|n| (n.x, n.y)).unwrap_or((0.0, 0.0));
        let (to_x, to_y) = to_node.map(|n| (n.x, n.y)).unwrap_or((0.0, 0.0));

        let from_map = collect_descendants(self, from_frame_id, from_x, from_y);
        let to_map = collect_descendants(self, to_frame_id, to_x, to_y);

        let mut pairs = Vec::new();
        let mut removed = Vec::new();
        let mut added = Vec::new();

        for (name, from_snap) in &from_map {
            if let Some(to_snap) = to_map.get(name) {
                pairs.push(AnimatePair {
                    name: name.clone(),
                    from: from_snap.clone(),
                    to: to_snap.clone(),
                });
            } else {
                removed.push(from_snap.clone());
            }
        }

        for (name, to_snap) in &to_map {
            if !from_map.contains_key(name) {
                added.push(to_snap.clone());
            }
        }

        // Sort pairs by name for deterministic order
        pairs.sort_by(|a, b| a.name.cmp(&b.name));
        removed.sort_by(|a, b| a.name.cmp(&b.name));
        added.sort_by(|a, b| a.name.cmp(&b.name));

        AutoAnimateResult { pairs, removed, added }
    }

    /// Compute auto-animate pairs between two pages (matched by top-level node name).
    /// Temporarily reads page data without switching the active page.
    pub fn compute_auto_animate_pages(&self, from_page_id: u64, to_page_id: u64) -> AutoAnimateResult {
        let from_page = self.pages.iter().find(|p| p.id == from_page_id);
        let to_page = self.pages.iter().find(|p| p.id == to_page_id);

        // Helper: collect snapshots from a page's nodes
        fn collect_page_snapshots(page: &crate::scene::Page) -> std::collections::HashMap<String, NodeSnapshot> {
            let mut map = std::collections::HashMap::new();
            let node_map: std::collections::HashMap<u64, &crate::node::Node> =
                page.nodes.iter().map(|n| (n.id, n)).collect();

            // Recursively collect all nodes, using (0,0) as page origin
            fn collect_recursive(
                node_map: &std::collections::HashMap<u64, &crate::node::Node>,
                children: &[u64],
                parent_x: f64,
                parent_y: f64,
                result: &mut std::collections::HashMap<String, NodeSnapshot>,
            ) {
                for &child_id in children {
                    if let Some(node) = node_map.get(&child_id) {
                        result.entry(node.name.clone())
                            .or_insert_with(|| snapshot_node(node, parent_x, parent_y));
                        collect_recursive(node_map, &node.children, parent_x, parent_y, result);
                    }
                }
            }

            collect_recursive(&node_map, &page.root_children, 0.0, 0.0, &mut map);
            map
        }

        // Also handle current active page (whose data is in self.nodes, not pages[])
        let active_page_id = self.pages.get(self.active_page_index).map(|p| p.id).unwrap_or(u64::MAX);

        let from_map = if from_page_id == active_page_id {
            // Active page: use self.nodes + self.root_children
            let mut map = std::collections::HashMap::new();
            fn collect_active(scene: &Scene, children: &[u64], ox: f64, oy: f64, result: &mut std::collections::HashMap<String, NodeSnapshot>) {
                for &cid in children {
                    if let Some(node) = scene.get_node(cid) {
                        result.entry(node.name.clone())
                            .or_insert_with(|| snapshot_node(node, ox, oy));
                        collect_active(scene, &node.children, ox, oy, result);
                    }
                }
            }
            collect_active(self, &self.root_children, 0.0, 0.0, &mut map);
            map
        } else if let Some(page) = from_page {
            collect_page_snapshots(page)
        } else {
            std::collections::HashMap::new()
        };

        let to_map = if to_page_id == active_page_id {
            let mut map = std::collections::HashMap::new();
            fn collect_active2(scene: &Scene, children: &[u64], ox: f64, oy: f64, result: &mut std::collections::HashMap<String, NodeSnapshot>) {
                for &cid in children {
                    if let Some(node) = scene.get_node(cid) {
                        result.entry(node.name.clone())
                            .or_insert_with(|| snapshot_node(node, ox, oy));
                        collect_active2(scene, &node.children, ox, oy, result);
                    }
                }
            }
            collect_active2(self, &self.root_children, 0.0, 0.0, &mut map);
            map
        } else if let Some(page) = to_page {
            collect_page_snapshots(page)
        } else {
            std::collections::HashMap::new()
        };

        let mut pairs = Vec::new();
        let mut removed = Vec::new();
        let mut added = Vec::new();

        for (name, from_snap) in &from_map {
            if let Some(to_snap) = to_map.get(name) {
                pairs.push(AnimatePair {
                    name: name.clone(),
                    from: from_snap.clone(),
                    to: to_snap.clone(),
                });
            } else {
                removed.push(from_snap.clone());
            }
        }

        for (name, to_snap) in &to_map {
            if !from_map.contains_key(name) {
                added.push(to_snap.clone());
            }
        }

        pairs.sort_by(|a, b| a.name.cmp(&b.name));
        removed.sort_by(|a, b| a.name.cmp(&b.name));
        added.sort_by(|a, b| a.name.cmp(&b.name));

        AutoAnimateResult { pairs, removed, added }
    }
}
