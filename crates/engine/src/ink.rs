use serde::{Deserialize, Serialize};
use crate::node::PathPoint;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InkPoint {
    pub x: f64,
    pub y: f64,
    #[serde(default)]
    pub pressure: f64,
    #[serde(default)]
    pub timestamp: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ShapeRecognition {
    pub shape: String,       // "circle", "rect", "triangle", "arrow", "line", "freehand"
    pub confidence: f64,
    pub bounds: (f64, f64, f64, f64), // x, y, w, h
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vertices: Option<Vec<(f64, f64)>>,
}

// =============================================
// Ramer-Douglas-Peucker simplification
// =============================================

fn perpendicular_distance(p: &InkPoint, a: &InkPoint, b: &InkPoint) -> f64 {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let len_sq = dx * dx + dy * dy;
    if len_sq < 1e-10 {
        return ((p.x - a.x).powi(2) + (p.y - a.y).powi(2)).sqrt();
    }
    ((dy * p.x - dx * p.y + b.x * a.y - b.y * a.x).abs()) / len_sq.sqrt()
}

pub fn simplify_path(points: &[InkPoint], tolerance: f64) -> Vec<InkPoint> {
    if points.len() <= 2 {
        return points.to_vec();
    }
    let mut max_dist = 0.0;
    let mut max_idx = 0;
    let first = &points[0];
    let last = &points[points.len() - 1];
    for i in 1..points.len() - 1 {
        let d = perpendicular_distance(&points[i], first, last);
        if d > max_dist {
            max_dist = d;
            max_idx = i;
        }
    }
    if max_dist > tolerance {
        let left = simplify_path(&points[..=max_idx], tolerance);
        let right = simplify_path(&points[max_idx..], tolerance);
        let mut result = left;
        result.extend_from_slice(&right[1..]);
        result
    } else {
        vec![first.clone(), last.clone()]
    }
}

// =============================================
// Chaikin's corner cutting
// =============================================

pub fn smooth_path(points: &[InkPoint], iterations: u32) -> Vec<InkPoint> {
    if points.len() < 3 {
        return points.to_vec();
    }
    let mut pts = points.to_vec();
    for _ in 0..iterations {
        let mut new_pts = Vec::with_capacity(pts.len() * 2);
        new_pts.push(pts[0].clone());
        for i in 0..pts.len() - 1 {
            let a = &pts[i];
            let b = &pts[i + 1];
            new_pts.push(InkPoint {
                x: 0.75 * a.x + 0.25 * b.x,
                y: 0.75 * a.y + 0.25 * b.y,
                pressure: 0.75 * a.pressure + 0.25 * b.pressure,
                timestamp: 0.0,
            });
            new_pts.push(InkPoint {
                x: 0.25 * a.x + 0.75 * b.x,
                y: 0.25 * a.y + 0.75 * b.y,
                pressure: 0.25 * a.pressure + 0.75 * b.pressure,
                timestamp: 0.0,
            });
        }
        new_pts.push(pts.last().unwrap().clone());
        pts = new_pts;
    }
    pts
}

// =============================================
// Shape recognition
// =============================================

fn bounding_box(points: &[InkPoint]) -> (f64, f64, f64, f64) {
    let mut min_x = f64::MAX;
    let mut min_y = f64::MAX;
    let mut max_x = f64::MIN;
    let mut max_y = f64::MIN;
    for p in points {
        if p.x < min_x { min_x = p.x; }
        if p.y < min_y { min_y = p.y; }
        if p.x > max_x { max_x = p.x; }
        if p.y > max_y { max_y = p.y; }
    }
    (min_x, min_y, max_x - min_x, max_y - min_y)
}

fn path_length(points: &[InkPoint]) -> f64 {
    let mut len = 0.0;
    for i in 1..points.len() {
        let dx = points[i].x - points[i - 1].x;
        let dy = points[i].y - points[i - 1].y;
        len += (dx * dx + dy * dy).sqrt();
    }
    len
}

fn is_closed(points: &[InkPoint], threshold_ratio: f64) -> bool {
    if points.len() < 3 { return false; }
    let first = &points[0];
    let last = &points[points.len() - 1];
    let dist = ((first.x - last.x).powi(2) + (first.y - last.y).powi(2)).sqrt();
    let (_, _, w, h) = bounding_box(points);
    let diag = (w * w + h * h).sqrt().max(1.0);
    dist / diag < threshold_ratio
}

/// Shoelace formula for signed area
fn signed_area(points: &[InkPoint]) -> f64 {
    let n = points.len();
    if n < 3 { return 0.0; }
    let mut area = 0.0;
    for i in 0..n {
        let j = (i + 1) % n;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    area / 2.0
}

/// Detect corners using angle threshold
fn detect_corners(points: &[InkPoint], angle_threshold: f64) -> Vec<usize> {
    if points.len() < 5 { return vec![]; }
    let window = (points.len() / 10).max(3).min(10);
    let mut corners = vec![0usize];
    for i in window..points.len() - window {
        let prev = &points[i - window];
        let curr = &points[i];
        let next = &points[i + window];
        let dx1 = curr.x - prev.x;
        let dy1 = curr.y - prev.y;
        let dx2 = next.x - curr.x;
        let dy2 = next.y - curr.y;
        let dot = dx1 * dx2 + dy1 * dy2;
        let len1 = (dx1 * dx1 + dy1 * dy1).sqrt();
        let len2 = (dx2 * dx2 + dy2 * dy2).sqrt();
        if len1 > 1e-6 && len2 > 1e-6 {
            let cos_angle = (dot / (len1 * len2)).clamp(-1.0, 1.0);
            let angle = cos_angle.acos();
            if angle < angle_threshold {
                // Check not too close to last corner
                if corners.last().map_or(true, |&c| i - c > window) {
                    corners.push(i);
                }
            }
        }
    }
    corners.push(points.len() - 1);
    corners
}

pub fn recognize_shape(points: &[InkPoint]) -> ShapeRecognition {
    let (bx, by, bw, bh) = bounding_box(points);
    let default = ShapeRecognition {
        shape: "freehand".to_string(),
        confidence: 0.0,
        bounds: (bx, by, bw, bh),
        vertices: None,
    };

    if points.len() < 5 {
        // Check for line
        if points.len() >= 2 {
            return ShapeRecognition {
                shape: "line".to_string(),
                confidence: 0.9,
                bounds: (bx, by, bw, bh),
                vertices: Some(vec![
                    (points[0].x, points[0].y),
                    (points[points.len() - 1].x, points[points.len() - 1].y),
                ]),
            };
        }
        return default;
    }

    let closed = is_closed(points, 0.15);

    // Check for straight line first
    if !closed {
        let simplified = simplify_path(points, bw.max(bh) * 0.05);
        if simplified.len() <= 2 {
            return ShapeRecognition {
                shape: "line".to_string(),
                confidence: 0.85,
                bounds: (bx, by, bw, bh),
                vertices: Some(vec![
                    (points[0].x, points[0].y),
                    (points[points.len() - 1].x, points[points.len() - 1].y),
                ]),
            };
        }

        // Check for arrow (open path with a fork at end)
        let corners = detect_corners(points, std::f64::consts::PI * 0.55);
        if corners.len() >= 3 && corners.len() <= 5 {
            // Could be an arrow shape
            let verts: Vec<(f64, f64)> = corners.iter().map(|&i| (points[i].x, points[i].y)).collect();
            return ShapeRecognition {
                shape: "arrow".to_string(),
                confidence: 0.6,
                bounds: (bx, by, bw, bh),
                vertices: Some(verts),
            };
        }
    }

    if !closed {
        return default;
    }

    // Closed shape analysis
    let area = signed_area(points).abs();
    let bbox_area = bw * bh;
    if bbox_area < 1.0 { return default; }
    let area_ratio = area / bbox_area;
    let aspect = if bh > 1e-6 { bw / bh } else { 1.0 };
    let perimeter = path_length(points);

    // Circularity: 4π·area / perimeter²  (1.0 = perfect circle)
    let circularity = if perimeter > 1e-6 {
        4.0 * std::f64::consts::PI * area / (perimeter * perimeter)
    } else {
        0.0
    };

    // Circle/Ellipse: high circularity, area_ratio near π/4 ≈ 0.785
    if circularity > 0.7 && area_ratio > 0.6 {
        let conf = circularity.min(1.0);
        return ShapeRecognition {
            shape: "circle".to_string(),
            confidence: conf,
            bounds: (bx, by, bw, bh),
            vertices: None,
        };
    }

    // Detect corners for polygon classification
    let corners = detect_corners(points, std::f64::consts::PI * 0.6);
    let n_corners = corners.len().saturating_sub(1); // remove duplicate start/end

    // Triangle: 3 corners, area_ratio ~0.5
    if n_corners == 3 && area_ratio > 0.3 && area_ratio < 0.7 {
        let verts: Vec<(f64, f64)> = corners[..3].iter().map(|&i| (points[i].x, points[i].y)).collect();
        return ShapeRecognition {
            shape: "triangle".to_string(),
            confidence: 0.75,
            bounds: (bx, by, bw, bh),
            vertices: Some(verts),
        };
    }

    // Rectangle: 4 corners, high area_ratio, aspect reasonable
    if (n_corners == 4 || n_corners == 5) && area_ratio > 0.7 {
        return ShapeRecognition {
            shape: "rect".to_string(),
            confidence: area_ratio.min(1.0),
            bounds: (bx, by, bw, bh),
            vertices: None,
        };
    }

    // Fallback: if area_ratio is high and roughly square/rect-ish
    if area_ratio > 0.75 && aspect > 0.3 && aspect < 3.0 {
        return ShapeRecognition {
            shape: "rect".to_string(),
            confidence: 0.6,
            bounds: (bx, by, bw, bh),
            vertices: None,
        };
    }

    default
}

// =============================================
// Ink → PathPoint conversion
// =============================================

pub fn ink_to_path_points(ink_points: &[InkPoint], simplify_tolerance: f64) -> Vec<PathPoint> {
    let simplified = simplify_path(ink_points, simplify_tolerance);
    let smoothed = smooth_path(&simplified, 2);

    let n = smoothed.len();
    let mut path_points = Vec::with_capacity(n);

    for i in 0..n {
        let p = &smoothed[i];
        if n < 3 || i == 0 || i == n - 1 {
            path_points.push(PathPoint::corner(p.x, p.y));
        } else {
            let prev = &smoothed[i - 1];
            let next = &smoothed[i + 1];
            let tension = 0.3;
            let hix = p.x - (next.x - prev.x) * tension;
            let hiy = p.y - (next.y - prev.y) * tension;
            let hox = p.x + (next.x - prev.x) * tension;
            let hoy = p.y + (next.y - prev.y) * tension;
            path_points.push(PathPoint {
                x: p.x,
                y: p.y,
                handle_in_x: hix,
                handle_in_y: hiy,
                handle_out_x: hox,
                handle_out_y: hoy,
                stroke_width: 0.0,
            });
        }
    }

    path_points
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_circle(cx: f64, cy: f64, r: f64, n: usize) -> Vec<InkPoint> {
        (0..n).map(|i| {
            let angle = 2.0 * std::f64::consts::PI * i as f64 / n as f64;
            InkPoint { x: cx + r * angle.cos(), y: cy + r * angle.sin(), pressure: 0.5, timestamp: i as f64 }
        }).collect()
    }

    #[test]
    fn test_recognize_circle() {
        let pts = make_circle(100.0, 100.0, 50.0, 50);
        let result = recognize_shape(&pts);
        assert_eq!(result.shape, "circle");
        assert!(result.confidence > 0.7);
    }

    #[test]
    fn test_simplify() {
        let pts: Vec<InkPoint> = (0..100).map(|i| InkPoint {
            x: i as f64,
            y: (i as f64 * 0.1).sin() * 2.0,
            pressure: 0.5,
            timestamp: i as f64,
        }).collect();
        let simplified = simplify_path(&pts, 1.0);
        assert!(simplified.len() < pts.len());
        assert!(simplified.len() >= 2);
    }
}
