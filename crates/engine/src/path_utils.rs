use crate::types::ColorSpace;
use crate::node::{PathPoint, TextPathAlign};

/// A point and tangent angle on a path at a given distance.
#[derive(Clone, Debug)]
pub struct PathSample {
    pub x: f64,
    pub y: f64,
    /// Tangent angle in radians
    pub angle: f64,
}

/// Compute total arc length of a path (approximated via subdivision).
pub fn path_length(points: &[PathPoint], closed: bool) -> f64 {
    if points.len() < 2 { return 0.0; }
    let mut total = 0.0;
    let seg_count = if closed { points.len() } else { points.len() - 1 };
    for i in 0..seg_count {
        let j = (i + 1) % points.len();
        total += segment_length(&points[i], &points[j]);
    }
    total
}

/// Sample a point and tangent at a given distance along the path.
pub fn point_at_length(points: &[PathPoint], closed: bool, dist: f64) -> Option<PathSample> {
    if points.len() < 2 { return None; }
    let seg_count = if closed { points.len() } else { points.len() - 1 };
    let mut remaining = dist;
    for i in 0..seg_count {
        let j = (i + 1) % points.len();
        let seg_len = segment_length(&points[i], &points[j]);
        if remaining <= seg_len || i == seg_count - 1 {
            let t = if seg_len > 0.001 { (remaining / seg_len).clamp(0.0, 1.0) } else { 0.0 };
            return Some(sample_segment(&points[i], &points[j], t));
        }
        remaining -= seg_len;
    }
    None
}

/// Get all glyph positions along a path for text rendering.
/// Returns (x, y, angle) for each character, given character widths.
pub fn text_positions_on_path(
    points: &[PathPoint],
    closed: bool,
    char_widths: &[f64],
    start_offset: f64,
    letter_spacing: f64,
    flip: bool,
    align: &TextPathAlign,
) -> Vec<PathSample> {
    let total = path_length(points, closed);
    if total <= 0.0 {
        return vec![];
    }

    let spacing = letter_spacing;
    let text_total = if char_widths.is_empty() {
        0.0
    } else {
        char_widths.iter().sum::<f64>() + spacing * (char_widths.len().saturating_sub(1) as f64)
    };

    let align_shift = match align {
        TextPathAlign::Start => 0.0,
        TextPathAlign::Center => ((total - text_total) / 2.0).max(0.0),
        TextPathAlign::End => (total - text_total).max(0.0),
    };

    let mut dist = start_offset.clamp(0.0, 1.0) * total + align_shift;
    let mut result = Vec::with_capacity(char_widths.len());

    for (i, &w) in char_widths.iter().enumerate() {
        // Place at the center of the glyph
        let forward_d = if i == 0 { dist + w / 2.0 } else { dist + spacing + w / 2.0 };
        let sampled_d = if flip {
            (total - forward_d).clamp(0.0, total)
        } else {
            forward_d
        };

        if let Some(mut sample) = point_at_length(points, closed, sampled_d) {
            if flip {
                sample.angle += std::f64::consts::PI;
            }
            result.push(sample);
        } else {
            result.push(PathSample { x: 0.0, y: 0.0, angle: 0.0 });
        }

        dist = if i == 0 { dist + w } else { dist + spacing + w };
    }

    result
}

/// Generate an SVG path d-string from PathPoints.
pub fn reverse_path_points(points: &[PathPoint]) -> Vec<PathPoint> {
    points.iter().rev().map(|p| PathPoint {
        x: p.x,
        y: p.y,
        handle_in_x: p.handle_out_x,
        handle_in_y: p.handle_out_y,
        handle_out_x: p.handle_in_x,
        handle_out_y: p.handle_in_y,
        stroke_width: p.stroke_width,
    }).collect()
}

pub fn path_to_svg_d(points: &[PathPoint], closed: bool) -> String {
    if points.is_empty() { return String::new(); }
    let mut d = format!("M{},{}", points[0].x, points[0].y);
    let seg_count = if closed { points.len() } else { points.len() - 1 };
    for i in 0..seg_count {
        let j = (i + 1) % points.len();
        let p = &points[i];
        let q = &points[j];
        if p.has_handle_out() || q.has_handle_in() {
            d.push_str(&format!(" C{},{} {},{} {},{}",
                p.handle_out_x, p.handle_out_y,
                q.handle_in_x, q.handle_in_y,
                q.x, q.y));
        } else {
            d.push_str(&format!(" L{},{}", q.x, q.y));
        }
    }
    if closed { d.push('Z'); }
    d
}

// --- Internal helpers ---

const SUBDIVISIONS: usize = 32;

fn segment_length(p: &PathPoint, q: &PathPoint) -> f64 {
    if !p.has_handle_out() && !q.has_handle_in() {
        // Straight line
        let dx = q.x - p.x;
        let dy = q.y - p.y;
        return (dx * dx + dy * dy).sqrt();
    }
    // Approximate bezier arc length
    let mut len = 0.0;
    let mut prev = (p.x, p.y);
    for i in 1..=SUBDIVISIONS {
        let t = i as f64 / SUBDIVISIONS as f64;
        let pt = eval_cubic(p, q, t);
        let dx = pt.0 - prev.0;
        let dy = pt.1 - prev.1;
        len += (dx * dx + dy * dy).sqrt();
        prev = pt;
    }
    len
}

fn sample_segment(p: &PathPoint, q: &PathPoint, t: f64) -> PathSample {
    let (x, y) = eval_cubic(p, q, t);
    // Tangent via derivative
    let dt = 0.001;
    let t1 = (t - dt).max(0.0);
    let t2 = (t + dt).min(1.0);
    let (x1, y1) = eval_cubic(p, q, t1);
    let (x2, y2) = eval_cubic(p, q, t2);
    let angle = (y2 - y1).atan2(x2 - x1);
    PathSample { x, y, angle }
}

fn eval_cubic(p: &PathPoint, q: &PathPoint, t: f64) -> (f64, f64) {
    let mt = 1.0 - t;
    let mt2 = mt * mt;
    let mt3 = mt2 * mt;
    let t2 = t * t;
    let t3 = t2 * t;
    let x = mt3 * p.x + 3.0 * mt2 * t * p.handle_out_x + 3.0 * mt * t2 * q.handle_in_x + t3 * q.x;
    let y = mt3 * p.y + 3.0 * mt2 * t * p.handle_out_y + 3.0 * mt * t2 * q.handle_in_y + t3 * q.y;
    (x, y)
}
