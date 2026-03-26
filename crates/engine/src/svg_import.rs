//! SVG Import — stub (TODO: full implementation)

use crate::node::NodeId;
use crate::scene::Scene;

/// Import SVG text into the scene at the given offset.
/// Returns the IDs of newly created top-level nodes.
pub fn import_svg(_scene: &mut Scene, _svg_text: &str, _offset_x: f64, _offset_y: f64) -> Vec<NodeId> {
    // TODO: parse SVG and create nodes
    Vec::new()
}
