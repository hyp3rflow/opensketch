//! Path morphing: interpolate between two vector paths.
//!
//! When two Path nodes are matched during smart-animate, this module handles
//! point-count alignment (subdivision) and per-point lerp of anchors + handles.

use crate::types::ColorSpace;
use crate::node::PathPoint;
use serde::{Deserialize, Serialize};

/// Result of a morph operation — a set of interpolated path points.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MorphResult {
    pub points: Vec<PathPoint>,
    pub closed: bool,
}

/// Linearly interpolate between two f64 values.
#[inline]
fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

/// Linearly interpolate between two PathPoints (anchor + handles).
pub fn lerp_point(a: &PathPoint, b: &PathPoint, t: f64) -> PathPoint {
    PathPoint {
        x: lerp(a.x, b.x, t),
        y: lerp(a.y, b.y, t),
        handle_in_x: lerp(a.handle_in_x, b.handle_in_x, t),
        handle_in_y: lerp(a.handle_in_y, b.handle_in_y, t),
        handle_out_x: lerp(a.handle_out_x, b.handle_out_x, t),
        handle_out_y: lerp(a.handle_out_y, b.handle_out_y, t),
        stroke_width: lerp(a.stroke_width, b.stroke_width, t),
    }
}

/// Evaluate a cubic bezier at parameter `t` (de Casteljau).
fn cubic_bezier_at(p0: (f64, f64), p1: (f64, f64), p2: (f64, f64), p3: (f64, f64), t: f64) -> (f64, f64) {
    let s = 1.0 - t;
    let x = s * s * s * p0.0 + 3.0 * s * s * t * p1.0 + 3.0 * s * t * t * p2.0 + t * t * t * p3.0;
    let y = s * s * s * p0.1 + 3.0 * s * s * t * p1.1 + 3.0 * s * t * t * p2.1 + t * t * t * p3.1;
    (x, y)
}

/// Split a cubic bezier segment at parameter `t`, returning (left_handles, right_handles).
/// Input: p0 anchor, p0 handle_out, p1 handle_in, p1 anchor.
/// Returns the two sub-curves as (left_p0_out, left_mid_in, mid, mid_out_right, right_p1_in).
fn split_cubic(
    p0: (f64, f64), h0_out: (f64, f64), h1_in: (f64, f64), p1: (f64, f64), t: f64,
) -> SplitResult {
    let a = (lerp(p0.0, h0_out.0, t), lerp(p0.1, h0_out.1, t));
    let b = (lerp(h0_out.0, h1_in.0, t), lerp(h0_out.1, h1_in.1, t));
    let c = (lerp(h1_in.0, p1.0, t), lerp(h1_in.1, p1.1, t));
    let d = (lerp(a.0, b.0, t), lerp(a.1, b.1, t));
    let e = (lerp(b.0, c.0, t), lerp(b.1, c.1, t));
    let mid = (lerp(d.0, e.0, t), lerp(d.1, e.1, t));

    SplitResult {
        left_handle_out: a,
        left_mid_handle_in: d,
        mid,
        right_mid_handle_out: e,
        right_handle_in: c,
    }
}

struct SplitResult {
    left_handle_out: (f64, f64),
    left_mid_handle_in: (f64, f64),
    mid: (f64, f64),
    right_mid_handle_out: (f64, f64),
    right_handle_in: (f64, f64),
}

/// Subdivide a path to have exactly `target_count` points by splitting the longest segments.
/// The input path must have at least 1 point.
pub fn subdivide_path(points: &[PathPoint], closed: bool, target_count: usize) -> Vec<PathPoint> {
    if points.len() >= target_count || points.is_empty() {
        return points.to_vec();
    }

    let mut result = points.to_vec();
    let seg_count = if closed { result.len() } else { result.len().saturating_sub(1) };
    if seg_count == 0 {
        // Duplicate the single point
        while result.len() < target_count {
            result.push(result[0].clone());
        }
        return result;
    }

    while result.len() < target_count {
        // Find the longest segment to split
        let cur_seg_count = if closed { result.len() } else { result.len() - 1 };
        let mut best_seg = 0;
        let mut best_len = f64::NEG_INFINITY;

        for i in 0..cur_seg_count {
            let j = (i + 1) % result.len();
            let p0 = &result[i];
            let p1 = &result[j];
            // Approximate segment length (chord length)
            let dx = p1.x - p0.x;
            let dy = p1.y - p0.y;
            let chord = (dx * dx + dy * dy).sqrt();

            // Also consider handle deviation for better splitting of curves
            let h_dx = (p0.handle_out_x - p0.x).abs() + (p1.handle_in_x - p1.x).abs();
            let h_dy = (p0.handle_out_y - p0.y).abs() + (p1.handle_in_y - p1.y).abs();
            let complexity = chord + h_dx + h_dy;

            if complexity > best_len {
                best_len = complexity;
                best_seg = i;
            }
        }

        // Split the best segment at t=0.5
        let j = (best_seg + 1) % result.len();
        let p0 = result[best_seg].clone();
        let p1 = result[j].clone();

        let sr = split_cubic(
            (p0.x, p0.y),
            (p0.handle_out_x, p0.handle_out_y),
            (p1.handle_in_x, p1.handle_in_y),
            (p1.x, p1.y),
            0.5,
        );

        // Update p0's handle_out
        result[best_seg].handle_out_x = sr.left_handle_out.0;
        result[best_seg].handle_out_y = sr.left_handle_out.1;

        // Create new midpoint
        let mid_point = PathPoint {
            x: sr.mid.0,
            y: sr.mid.1,
            handle_in_x: sr.left_mid_handle_in.0,
            handle_in_y: sr.left_mid_handle_in.1,
            handle_out_x: sr.right_mid_handle_out.0,
            handle_out_y: sr.right_mid_handle_out.1,
            stroke_width: lerp(p0.stroke_width, p1.stroke_width, 0.5),
        };

        // Update p1's handle_in
        let j_actual = if j == 0 && closed { 0 } else { j };
        result[j_actual].handle_in_x = sr.right_handle_in.0;
        result[j_actual].handle_in_y = sr.right_handle_in.1;

        // Insert midpoint after best_seg
        let insert_pos = best_seg + 1;
        result.insert(insert_pos, mid_point);
    }

    result
}

/// Rotate/reorder a closed path's points so that the first point in `source` is
/// closest to the first point of `target`. This minimizes twisting during morph.
pub fn align_start_point(source: &mut Vec<PathPoint>, target: &[PathPoint]) {
    if source.len() <= 1 || target.is_empty() {
        return;
    }

    let tx = target[0].x;
    let ty = target[0].y;

    let mut best_idx = 0;
    let mut best_dist = f64::MAX;
    for (i, p) in source.iter().enumerate() {
        let d = (p.x - tx) * (p.x - tx) + (p.y - ty) * (p.y - ty);
        if d < best_dist {
            best_dist = d;
            best_idx = i;
        }
    }

    if best_idx > 0 {
        source.rotate_left(best_idx);
    }
}

/// Morph between two sets of path points at parameter `t` (0 = from, 1 = to).
/// Automatically subdivides the shorter path and aligns start points for closed paths.
pub fn morph_paths(
    from_points: &[PathPoint],
    from_closed: bool,
    to_points: &[PathPoint],
    to_closed: bool,
    t: f64,
) -> MorphResult {
    if from_points.is_empty() && to_points.is_empty() {
        return MorphResult { points: vec![], closed: from_closed || to_closed };
    }

    let target_count = from_points.len().max(to_points.len());
    let mut from_sub = subdivide_path(from_points, from_closed, target_count);
    let mut to_sub = subdivide_path(to_points, to_closed, target_count);

    // Align start points for closed paths to minimize twisting
    let result_closed = if from_closed && to_closed {
        align_start_point(&mut from_sub, &to_sub);
        true
    } else {
        // If one is closed and other open, morph toward the target's closed state at t>0.5
        if t > 0.5 { to_closed } else { from_closed }
    };

    let points: Vec<PathPoint> = from_sub
        .iter()
        .zip(to_sub.iter())
        .map(|(a, b)| lerp_point(a, b, t))
        .collect();

    MorphResult { points, closed: result_closed }
}

/// Check if two paths can be meaningfully morphed.
/// Returns true if both have at least 1 point.
pub fn can_morph(from_points: &[PathPoint], to_points: &[PathPoint]) -> bool {
    !from_points.is_empty() && !to_points.is_empty()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lerp_point() {
        let a = PathPoint::corner(0.0, 0.0);
        let b = PathPoint::corner(10.0, 20.0);
        let mid = lerp_point(&a, &b, 0.5);
        assert!((mid.x - 5.0).abs() < 0.001);
        assert!((mid.y - 10.0).abs() < 0.001);
    }

    #[test]
    fn test_subdivide() {
        let pts = vec![
            PathPoint::corner(0.0, 0.0),
            PathPoint::corner(100.0, 0.0),
        ];
        let result = subdivide_path(&pts, false, 4);
        assert_eq!(result.len(), 4);
    }

    #[test]
    fn test_morph_basic() {
        let from = vec![PathPoint::corner(0.0, 0.0), PathPoint::corner(100.0, 0.0)];
        let to = vec![PathPoint::corner(0.0, 0.0), PathPoint::corner(0.0, 100.0), PathPoint::corner(100.0, 100.0)];
        let result = morph_paths(&from, false, &to, false, 0.5);
        assert_eq!(result.points.len(), 3);
    }
}
