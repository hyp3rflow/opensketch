use crate::node::NodeId;
use crate::scene::Scene;
use crate::types::Point;

pub fn hit_test_handles(scene: &Scene, node_id: NodeId, point: Point, handle_size: f64) -> Option<usize> {
    let node = scene.get_node(node_id)?;
    let hs = handle_size / 2.0;
    let handles = [
        Point { x: node.x, y: node.y },
        Point { x: node.x + node.width, y: node.y },
        Point { x: node.x, y: node.y + node.height },
        Point { x: node.x + node.width, y: node.y + node.height },
    ];
    for (i, h) in handles.iter().enumerate() {
        if (point.x - h.x).abs() < hs && (point.y - h.y).abs() < hs {
            return Some(i);
        }
    }
    None
}
