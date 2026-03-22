use crate::node::{Node, NodeKind, PathPoint};
use i_overlay::core::fill_rule::FillRule;
use i_overlay::core::overlay_rule::OverlayRule;
use i_overlay::float::single::SingleFloatOverlay;
use std::f64::consts::PI;

/// Boolean operation type
pub enum BooleanOp {
    Union,
    Subtract,
    Intersect,
    Exclude,
}

/// Convert a node to a polygon (list of [f64; 2] points).
/// Curves (ellipse, bezier) are approximated with line segments.
pub fn node_to_polygon(node: &Node) -> Vec<[f64; 2]> {
    match &node.kind {
        NodeKind::Rect => {
            let (x, y, w, h) = (node.x, node.y, node.width, node.height);
            vec![[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
        }
        NodeKind::Ellipse => {
            let cx = node.x + node.width / 2.0;
            let cy = node.y + node.height / 2.0;
            let rx = node.width / 2.0;
            let ry = node.height / 2.0;
            let segments = 64;
            (0..segments)
                .map(|i| {
                    let angle = 2.0 * PI * (i as f64) / (segments as f64);
                    [cx + rx * angle.cos(), cy + ry * angle.sin()]
                })
                .collect()
        }
        NodeKind::Star { points, inner_radius } => {
            let cx = node.x + node.width / 2.0;
            let cy = node.y + node.height / 2.0;
            let rx = node.width / 2.0;
            let ry = node.height / 2.0;
            let n = *points as usize;
            let mut pts = Vec::with_capacity(n * 2);
            for i in 0..(n * 2) {
                let angle = PI * (i as f64) / (n as f64) - PI / 2.0;
                let (r_x, r_y) = if i % 2 == 0 {
                    (rx, ry)
                } else {
                    (rx * inner_radius, ry * inner_radius)
                };
                pts.push([cx + r_x * angle.cos(), cy + r_y * angle.sin()]);
            }
            pts
        }
        NodeKind::Polygon { sides } => {
            let cx = node.x + node.width / 2.0;
            let cy = node.y + node.height / 2.0;
            let rx = node.width / 2.0;
            let ry = node.height / 2.0;
            let n = *sides as usize;
            (0..n)
                .map(|i| {
                    let angle = 2.0 * PI * (i as f64) / (n as f64) - PI / 2.0;
                    [cx + rx * angle.cos(), cy + ry * angle.sin()]
                })
                .collect()
        }
        NodeKind::Path { points, closed: true } => {
            // Flatten bezier path to line segments
            flatten_path_points(points)
        }
        NodeKind::Path { points, closed: false } => {
            // Open paths: close them for boolean ops
            flatten_path_points(points)
        }
        _ => {
            // Frame, Group, Text, Image, etc: use bounding box
            let (x, y, w, h) = (node.x, node.y, node.width, node.height);
            vec![[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
        }
    }
}

/// Flatten PathPoints (with bezier handles) into line segments
fn flatten_path_points(points: &[PathPoint]) -> Vec<[f64; 2]> {
    if points.is_empty() {
        return vec![];
    }
    let mut result = Vec::new();
    let n = points.len();
    for i in 0..n {
        let p0 = &points[i];
        let p1 = &points[(i + 1) % n];

        let has_curve = p0.has_handle_out() || p1.has_handle_in();
        if has_curve {
            // Cubic bezier: p0 -> handle_out -> handle_in(next) -> p1
            let steps = 16;
            for s in 0..steps {
                let t = s as f64 / steps as f64;
                let (x, y) = cubic_bezier(
                    p0.x, p0.y,
                    p0.handle_out_x, p0.handle_out_y,
                    p1.handle_in_x, p1.handle_in_y,
                    p1.x, p1.y,
                    t,
                );
                result.push([x, y]);
            }
        } else {
            result.push([p0.x, p0.y]);
        }
    }
    result
}

fn cubic_bezier(x0: f64, y0: f64, x1: f64, y1: f64, x2: f64, y2: f64, x3: f64, y3: f64, t: f64) -> (f64, f64) {
    let mt = 1.0 - t;
    let mt2 = mt * mt;
    let mt3 = mt2 * mt;
    let t2 = t * t;
    let t3 = t2 * t;
    (
        mt3 * x0 + 3.0 * mt2 * t * x1 + 3.0 * mt * t2 * x2 + t3 * x3,
        mt3 * y0 + 3.0 * mt2 * t * y1 + 3.0 * mt * t2 * y2 + t3 * y3,
    )
}

/// Perform a boolean operation on two nodes, returning result path points.
pub fn boolean_op(subject: &Node, clip: &Node, op: BooleanOp) -> Option<Vec<PathPoint>> {
    let subj_poly = node_to_polygon(subject);
    let clip_poly = node_to_polygon(clip);

    if subj_poly.len() < 3 || clip_poly.len() < 3 {
        return None;
    }

    let rule = match op {
        BooleanOp::Union => OverlayRule::Union,
        BooleanOp::Subtract => OverlayRule::Difference,
        BooleanOp::Intersect => OverlayRule::Intersect,
        BooleanOp::Exclude => OverlayRule::Xor,
    };

    let result = subj_poly.overlay(&clip_poly, rule, FillRule::EvenOdd);

    // Result is Vec<Vec<Vec<[f64; 2]>>> (shapes > contours > points)
    // Take the first shape's outer contour
    if let Some(shape) = result.first() {
        if let Some(contour) = shape.first() {
            let points: Vec<PathPoint> = contour
                .iter()
                .map(|p| PathPoint::corner(p[0], p[1]))
                .collect();
            if points.len() >= 3 {
                return Some(points);
            }
        }
    }
    None
}

/// Perform boolean operation, returning all contours (for multi-path results)
pub fn boolean_op_multi(subject: &Node, clip: &Node, op: BooleanOp) -> Vec<Vec<PathPoint>> {
    let subj_poly = node_to_polygon(subject);
    let clip_poly = node_to_polygon(clip);

    if subj_poly.len() < 3 || clip_poly.len() < 3 {
        return vec![];
    }

    let rule = match op {
        BooleanOp::Union => OverlayRule::Union,
        BooleanOp::Subtract => OverlayRule::Difference,
        BooleanOp::Intersect => OverlayRule::Intersect,
        BooleanOp::Exclude => OverlayRule::Xor,
    };

    let result = subj_poly.overlay(&clip_poly, rule, FillRule::EvenOdd);

    let mut contours = Vec::new();
    for shape in &result {
        for contour in shape {
            let points: Vec<PathPoint> = contour
                .iter()
                .map(|p| PathPoint::corner(p[0], p[1]))
                .collect();
            if points.len() >= 3 {
                contours.push(points);
            }
        }
    }
    contours
}
