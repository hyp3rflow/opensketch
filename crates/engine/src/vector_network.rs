use crate::types::ColorSpace;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

pub type VertexId = u64;
pub type SegmentId = u64;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VectorVertex {
    pub id: VertexId,
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VectorSegment {
    pub id: SegmentId,
    pub start_vertex_id: VertexId,
    pub end_vertex_id: VertexId,
    /// Outgoing bezier handle from start vertex (absolute coords, None = straight)
    pub handle_start: Option<(f64, f64)>,
    /// Incoming bezier handle to end vertex (absolute coords, None = straight)
    pub handle_end: Option<(f64, f64)>,
}

/// A region is an ordered list of segment IDs forming a closed loop for fill.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VectorRegion {
    pub segment_ids: Vec<SegmentId>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VectorNetwork {
    pub vertices: Vec<VectorVertex>,
    pub segments: Vec<VectorSegment>,
    pub regions: Vec<VectorRegion>,
    next_vertex_id: VertexId,
    next_segment_id: SegmentId,
}

impl VectorNetwork {
    pub fn new() -> Self {
        Self {
            vertices: vec![],
            segments: vec![],
            regions: vec![],
            next_vertex_id: 1,
            next_segment_id: 1,
        }
    }

    pub fn add_vertex(&mut self, x: f64, y: f64) -> VertexId {
        let id = self.next_vertex_id;
        self.next_vertex_id += 1;
        self.vertices.push(VectorVertex { id, x, y });
        id
    }

    pub fn remove_vertex(&mut self, vertex_id: VertexId) {
        // Remove all segments connected to this vertex
        self.segments.retain(|s| s.start_vertex_id != vertex_id && s.end_vertex_id != vertex_id);
        self.vertices.retain(|v| v.id != vertex_id);
        // Invalidate regions that reference removed segments
        self.regions.clear();
    }

    pub fn update_vertex(&mut self, vertex_id: VertexId, x: f64, y: f64) {
        if let Some(v) = self.vertices.iter_mut().find(|v| v.id == vertex_id) {
            v.x = x;
            v.y = y;
        }
    }

    pub fn add_segment(
        &mut self,
        start_v: VertexId,
        end_v: VertexId,
        handle_start: Option<(f64, f64)>,
        handle_end: Option<(f64, f64)>,
    ) -> SegmentId {
        let id = self.next_segment_id;
        self.next_segment_id += 1;
        self.segments.push(VectorSegment {
            id,
            start_vertex_id: start_v,
            end_vertex_id: end_v,
            handle_start,
            handle_end,
        });
        id
    }

    pub fn remove_segment(&mut self, segment_id: SegmentId) {
        self.segments.retain(|s| s.id != segment_id);
        // Invalidate regions
        self.regions.clear();
    }

    pub fn update_segment_handles(
        &mut self,
        segment_id: SegmentId,
        hs: Option<(f64, f64)>,
        he: Option<(f64, f64)>,
    ) {
        if let Some(s) = self.segments.iter_mut().find(|s| s.id == segment_id) {
            s.handle_start = hs;
            s.handle_end = he;
        }
    }

    pub fn get_vertex(&self, id: VertexId) -> Option<&VectorVertex> {
        self.vertices.iter().find(|v| v.id == id)
    }

    /// Detect closed regions (minimal cycles) in the vector network.
    /// Uses a simple approach: build adjacency, find all minimal cycles.
    pub fn detect_regions(&mut self) -> usize {
        self.regions.clear();

        if self.segments.is_empty() {
            return 0;
        }

        // Build adjacency: vertex -> [(neighbor_vertex, segment_id, is_forward)]
        let mut adj: HashMap<VertexId, Vec<(VertexId, SegmentId)>> = HashMap::new();
        for seg in &self.segments {
            adj.entry(seg.start_vertex_id).or_default().push((seg.end_vertex_id, seg.id));
            adj.entry(seg.end_vertex_id).or_default().push((seg.start_vertex_id, seg.id));
        }

        // Sort adjacency lists by angle for consistent cycle detection
        let vertex_pos: HashMap<VertexId, (f64, f64)> = self.vertices.iter()
            .map(|v| (v.id, (v.x, v.y)))
            .collect();

        for (vid, neighbors) in adj.iter_mut() {
            if let Some(&(vx, vy)) = vertex_pos.get(vid) {
                neighbors.sort_by(|a, b| {
                    let (ax, ay) = vertex_pos.get(&a.0).copied().unwrap_or((0.0, 0.0));
                    let (bx, by) = vertex_pos.get(&b.0).copied().unwrap_or((0.0, 0.0));
                    let angle_a = (ay - vy).atan2(ax - vx);
                    let angle_b = (by - vy).atan2(bx - vx);
                    angle_a.partial_cmp(&angle_b).unwrap_or(std::cmp::Ordering::Equal)
                });
            }
        }

        // Find minimal cycles using "next edge" traversal (planar face detection)
        let mut used_directed_edges: HashSet<(VertexId, VertexId)> = HashSet::new();
        let mut found_regions: Vec<Vec<SegmentId>> = vec![];

        for seg in &self.segments {
            for &(start, end) in &[(seg.start_vertex_id, seg.end_vertex_id), (seg.end_vertex_id, seg.start_vertex_id)] {
                if used_directed_edges.contains(&(start, end)) {
                    continue;
                }

                // Try to trace a minimal cycle starting from this directed edge
                let mut path_vertices: Vec<VertexId> = vec![start, end];
                let mut path_segments: Vec<SegmentId> = vec![seg.id];
                let mut current = end;
                let mut prev = start;
                let mut found = false;

                for _ in 0..100 {
                    // Find the "next" edge: the one that turns most to the right (clockwise)
                    if let Some(neighbors) = adj.get(&current) {
                        if neighbors.len() < 2 {
                            // Dead end or single connection — can't form a cycle this way
                            if neighbors.len() == 1 && neighbors[0].0 == start && path_vertices.len() > 2 {
                                // Actually completes the cycle
                                path_segments.push(neighbors[0].1);
                                found = true;
                                break;
                            }
                            break;
                        }

                        // Find the incoming angle
                        let (cx, cy) = vertex_pos.get(&current).copied().unwrap_or((0.0, 0.0));
                        let (px, py) = vertex_pos.get(&prev).copied().unwrap_or((0.0, 0.0));
                        let in_angle = (py - cy).atan2(px - cx);

                        // Find the next edge by choosing the one with the smallest positive angle difference (right turn)
                        let mut best: Option<(VertexId, SegmentId, f64)> = None;
                        for &(nv, sid) in neighbors {
                            if nv == prev {
                                continue; // Don't go back the same edge
                            }
                            let (nx, ny) = vertex_pos.get(&nv).copied().unwrap_or((0.0, 0.0));
                            let out_angle = (ny - cy).atan2(nx - cx);
                            let mut diff = out_angle - in_angle;
                            if diff <= 0.0 { diff += std::f64::consts::TAU; }
                            if diff >= std::f64::consts::TAU { diff -= std::f64::consts::TAU; }
                            // Ensure we don't pick diff == 0 (same direction as incoming = U-turn on different edge)
                            if diff < 1e-10 { diff = std::f64::consts::TAU; }
                            match &best {
                                None => best = Some((nv, sid, diff)),
                                Some((_, _, bd)) => {
                                    if diff < *bd {
                                        best = Some((nv, sid, diff));
                                    }
                                }
                            }
                        }

                        if let Some((next_v, next_sid, _)) = best {
                            if next_v == start && path_vertices.len() > 2 {
                                // Completed a cycle
                                path_segments.push(next_sid);
                                found = true;
                                break;
                            }
                            if path_vertices.contains(&next_v) {
                                // Hit an already-visited vertex that isn't start — not a minimal cycle
                                break;
                            }
                            path_vertices.push(next_v);
                            path_segments.push(next_sid);
                            prev = current;
                            current = next_v;
                        } else {
                            break;
                        }
                    } else {
                        break;
                    }
                }

                if found && path_segments.len() >= 3 {
                    // Mark all directed edges in this cycle as used
                    for i in 0..path_vertices.len() {
                        let a = path_vertices[i];
                        let b = if i + 1 < path_vertices.len() { path_vertices[i + 1] } else { path_vertices[0] };
                        used_directed_edges.insert((a, b));
                    }
                    // Check if this is a duplicate (same set of segments)
                    let mut seg_set: Vec<SegmentId> = path_segments.clone();
                    seg_set.sort();
                    let is_dup = found_regions.iter().any(|r| {
                        let mut rs: Vec<SegmentId> = r.clone();
                        rs.sort();
                        rs == seg_set
                    });
                    if !is_dup {
                        found_regions.push(path_segments);
                    }
                }
            }
        }

        for seg_ids in found_regions {
            self.regions.push(VectorRegion { segment_ids: seg_ids });
        }

        self.regions.len()
    }

    /// Split a segment at parameter t (0..1), inserting a new vertex and replacing
    /// the segment with two new segments. Returns (new_vertex_id, seg_a_id, seg_b_id).
    pub fn split_segment(&mut self, segment_id: SegmentId, t: f64) -> Option<(VertexId, SegmentId, SegmentId)> {
        let seg = self.segments.iter().find(|s| s.id == segment_id)?.clone();
        let sv = self.get_vertex(seg.start_vertex_id)?.clone();
        let ev = self.get_vertex(seg.end_vertex_id)?.clone();

        // Compute split point (and handles for the two sub-segments via de Casteljau)
        let (mid, hs_a, he_a, hs_b, he_b) = match (seg.handle_start, seg.handle_end) {
            (Some((h1x, h1y)), Some((h2x, h2y))) => {
                // Cubic bezier de Casteljau split
                let p0 = (sv.x, sv.y);
                let p1 = (h1x, h1y);
                let p2 = (h2x, h2y);
                let p3 = (ev.x, ev.y);
                let q0 = lerp2(p0, p1, t);
                let q1 = lerp2(p1, p2, t);
                let q2 = lerp2(p2, p3, t);
                let r0 = lerp2(q0, q1, t);
                let r1 = lerp2(q1, q2, t);
                let mid = lerp2(r0, r1, t);
                (mid, Some(q0), Some(r0), Some(r1), Some(q2))
            }
            _ => {
                // Linear — just lerp
                let mx = sv.x + (ev.x - sv.x) * t;
                let my = sv.y + (ev.y - sv.y) * t;
                ((mx, my), None, None, None, None)
            }
        };

        // Remove original segment
        self.remove_segment(segment_id);
        // Restore regions since remove_segment clears them
        let mid_id = self.add_vertex(mid.0, mid.1);
        let sa = self.add_segment(seg.start_vertex_id, mid_id, hs_a, he_a);
        let sb = self.add_segment(mid_id, seg.end_vertex_id, hs_b, he_b);

        Some((mid_id, sa, sb))
    }

    /// Hit-test a point against segments. Returns (segment_id, t) if within threshold (in scene coords).
    pub fn hit_test_segment(&self, px: f64, py: f64, threshold: f64) -> Option<(SegmentId, f64)> {
        let mut best: Option<(SegmentId, f64, f64)> = None; // (id, t, dist)
        for seg in &self.segments {
            let sv = self.get_vertex(seg.start_vertex_id);
            let ev = self.get_vertex(seg.end_vertex_id);
            if let (Some(sv), Some(ev)) = (sv, ev) {
                let (dist, t) = match (seg.handle_start, seg.handle_end) {
                    (Some((h1x, h1y)), Some((h2x, h2y))) => {
                        closest_point_on_cubic(sv.x, sv.y, h1x, h1y, h2x, h2y, ev.x, ev.y, px, py)
                    }
                    _ => {
                        closest_point_on_line(sv.x, sv.y, ev.x, ev.y, px, py)
                    }
                };
                if dist <= threshold {
                    if best.is_none() || dist < best.as_ref().unwrap().2 {
                        best = Some((seg.id, t, dist));
                    }
                }
            }
        }
        best.map(|(id, t, _)| (id, t))
    }

    /// Calculate bounding box from all vertices.
    pub fn bounds(&self) -> (f64, f64, f64, f64) {
        if self.vertices.is_empty() {
            return (0.0, 0.0, 0.0, 0.0);
        }
        let mut min_x = f64::INFINITY;
        let mut min_y = f64::INFINITY;
        let mut max_x = f64::NEG_INFINITY;
        let mut max_y = f64::NEG_INFINITY;
        for v in &self.vertices {
            min_x = min_x.min(v.x);
            min_y = min_y.min(v.y);
            max_x = max_x.max(v.x);
            max_y = max_y.max(v.y);
        }
        // Also consider bezier handles
        for s in &self.segments {
            if let Some((hx, hy)) = s.handle_start {
                min_x = min_x.min(hx);
                min_y = min_y.min(hy);
                max_x = max_x.max(hx);
                max_y = max_y.max(hy);
            }
            if let Some((hx, hy)) = s.handle_end {
                min_x = min_x.min(hx);
                min_y = min_y.min(hy);
                max_x = max_x.max(hx);
                max_y = max_y.max(hy);
            }
        }
        (min_x, min_y, max_x - min_x, max_y - min_y)
    }

    /// Convert a Path (linear chain) to VectorNetwork.
    pub fn from_path(points: &[super::node::PathPoint], closed: bool) -> Self {
        let mut vn = VectorNetwork::new();
        if points.is_empty() {
            return vn;
        }

        let mut vertex_ids: Vec<VertexId> = vec![];
        for p in points {
            vertex_ids.push(vn.add_vertex(p.x, p.y));
        }

        for i in 1..points.len() {
            let prev = &points[i - 1];
            let curr = &points[i];
            let hs = if prev.has_handle_out() {
                Some((prev.handle_out_x, prev.handle_out_y))
            } else {
                None
            };
            let he = if curr.has_handle_in() {
                Some((curr.handle_in_x, curr.handle_in_y))
            } else {
                None
            };
            vn.add_segment(vertex_ids[i - 1], vertex_ids[i], hs, he);
        }

        if closed && points.len() > 1 {
            let last = &points[points.len() - 1];
            let first = &points[0];
            let hs = if last.has_handle_out() {
                Some((last.handle_out_x, last.handle_out_y))
            } else {
                None
            };
            let he = if first.has_handle_in() {
                Some((first.handle_in_x, first.handle_in_y))
            } else {
                None
            };
            vn.add_segment(*vertex_ids.last().unwrap(), vertex_ids[0], hs, he);
            // Auto-detect the single region
            vn.detect_regions();
        }

        vn
    }

    /// Build SVG path data for a single region.
    pub fn region_to_svg_d(&self, region: &VectorRegion) -> String {
        if region.segment_ids.is_empty() {
            return String::new();
        }

        // Build ordered vertex chain from segment list
        let mut d = String::new();
        let mut first = true;

        for (i, &seg_id) in region.segment_ids.iter().enumerate() {
            if let Some(seg) = self.segments.iter().find(|s| s.id == seg_id) {
                let start = self.get_vertex(seg.start_vertex_id);
                let end = self.get_vertex(seg.end_vertex_id);
                if let (Some(sv), Some(ev)) = (start, end) {
                    if first {
                        d.push_str(&format!("M{:.2},{:.2}", sv.x, sv.y));
                        first = false;
                    }
                    match (seg.handle_start, seg.handle_end) {
                        (Some((hsx, hsy)), Some((hex, hey))) => {
                            d.push_str(&format!(" C{:.2},{:.2} {:.2},{:.2} {:.2},{:.2}", hsx, hsy, hex, hey, ev.x, ev.y));
                        }
                        (Some((hsx, hsy)), None) => {
                            d.push_str(&format!(" Q{:.2},{:.2} {:.2},{:.2}", hsx, hsy, ev.x, ev.y));
                        }
                        (None, Some((hex, hey))) => {
                            d.push_str(&format!(" Q{:.2},{:.2} {:.2},{:.2}", hex, hey, ev.x, ev.y));
                        }
                        (None, None) => {
                            d.push_str(&format!(" L{:.2},{:.2}", ev.x, ev.y));
                        }
                    }
                }
            }
        }
        d.push_str(" Z");
        d
    }

    /// Build SVG path data for a single segment (for stroke rendering).
    pub fn segment_to_svg_d(&self, seg: &VectorSegment) -> String {
        let start = self.get_vertex(seg.start_vertex_id);
        let end = self.get_vertex(seg.end_vertex_id);
        if let (Some(sv), Some(ev)) = (start, end) {
            let mut d = format!("M{:.2},{:.2}", sv.x, sv.y);
            match (seg.handle_start, seg.handle_end) {
                (Some((hsx, hsy)), Some((hex, hey))) => {
                    d.push_str(&format!(" C{:.2},{:.2} {:.2},{:.2} {:.2},{:.2}", hsx, hsy, hex, hey, ev.x, ev.y));
                }
                (Some((hsx, hsy)), None) => {
                    d.push_str(&format!(" Q{:.2},{:.2} {:.2},{:.2}", hsx, hsy, ev.x, ev.y));
                }
                (None, Some((hex, hey))) => {
                    d.push_str(&format!(" Q{:.2},{:.2} {:.2},{:.2}", hex, hey, ev.x, ev.y));
                }
                (None, None) => {
                    d.push_str(&format!(" L{:.2},{:.2}", ev.x, ev.y));
                }
            }
            d
        } else {
            String::new()
        }
    }
}

fn lerp2(a: (f64, f64), b: (f64, f64), t: f64) -> (f64, f64) {
    (a.0 + (b.0 - a.0) * t, a.1 + (b.1 - a.1) * t)
}

fn closest_point_on_line(x0: f64, y0: f64, x1: f64, y1: f64, px: f64, py: f64) -> (f64, f64) {
    let dx = x1 - x0;
    let dy = y1 - y0;
    let len_sq = dx * dx + dy * dy;
    if len_sq < 1e-12 {
        let d = ((px - x0).powi(2) + (py - y0).powi(2)).sqrt();
        return (d, 0.5);
    }
    let t = ((px - x0) * dx + (py - y0) * dy) / len_sq;
    let t = t.clamp(0.0, 1.0);
    let cx = x0 + t * dx;
    let cy = y0 + t * dy;
    let d = ((px - cx).powi(2) + (py - cy).powi(2)).sqrt();
    (d, t)
}

fn closest_point_on_cubic(
    x0: f64, y0: f64, h1x: f64, h1y: f64, h2x: f64, h2y: f64, x3: f64, y3: f64,
    px: f64, py: f64,
) -> (f64, f64) {
    // Sample 20 points along the curve, find closest
    let steps = 20;
    let mut best_dist = f64::INFINITY;
    let mut best_t = 0.0;
    for i in 0..=steps {
        let t = i as f64 / steps as f64;
        let it = 1.0 - t;
        let cx = it * it * it * x0 + 3.0 * it * it * t * h1x + 3.0 * it * t * t * h2x + t * t * t * x3;
        let cy = it * it * it * y0 + 3.0 * it * it * t * h1y + 3.0 * it * t * t * h2y + t * t * t * y3;
        let d = ((px - cx).powi(2) + (py - cy).powi(2)).sqrt();
        if d < best_dist {
            best_dist = d;
            best_t = t;
        }
    }
    // Refine with binary-search-like approach
    let mut lo = (best_t - 1.0 / steps as f64).max(0.0);
    let mut hi = (best_t + 1.0 / steps as f64).min(1.0);
    for _ in 0..10 {
        let m1 = lo + (hi - lo) / 3.0;
        let m2 = hi - (hi - lo) / 3.0;
        let d1 = eval_cubic_dist(x0, y0, h1x, h1y, h2x, h2y, x3, y3, px, py, m1);
        let d2 = eval_cubic_dist(x0, y0, h1x, h1y, h2x, h2y, x3, y3, px, py, m2);
        if d1 < d2 { hi = m2; } else { lo = m1; }
    }
    let t = (lo + hi) / 2.0;
    let d = eval_cubic_dist(x0, y0, h1x, h1y, h2x, h2y, x3, y3, px, py, t);
    (d, t)
}

fn eval_cubic_dist(
    x0: f64, y0: f64, h1x: f64, h1y: f64, h2x: f64, h2y: f64, x3: f64, y3: f64,
    px: f64, py: f64, t: f64,
) -> f64 {
    let it = 1.0 - t;
    let cx = it * it * it * x0 + 3.0 * it * it * t * h1x + 3.0 * it * t * t * h2x + t * t * t * x3;
    let cy = it * it * it * y0 + 3.0 * it * it * t * h1y + 3.0 * it * t * t * h2y + t * t * t * y3;
    ((px - cx).powi(2) + (py - cy).powi(2)).sqrt()
}
