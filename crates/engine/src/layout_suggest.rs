use crate::node::{NodeId, FlexDirection, Align, Justify, FlexWrap};
use crate::scene::Scene;
use serde::Serialize;

/// Suggested auto-layout configuration for a set of nodes.
#[derive(Serialize)]
pub struct LayoutSuggestion {
    pub direction: String,
    pub gap: f64,
    pub padding_top: f64,
    pub padding_right: f64,
    pub padding_bottom: f64,
    pub padding_left: f64,
    pub align_items: String,
    pub justify_content: String,
    pub wrap: String,
    pub confidence: f64,
    pub pattern: String, // "row", "column", "grid", "unknown"
}

struct NodeRect {
    id: NodeId,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    cx: f64,
    cy: f64,
}

/// Analyze selected nodes and suggest the best auto-layout configuration.
pub fn suggest_auto_layout(scene: &Scene, ids: &[NodeId]) -> LayoutSuggestion {
    if ids.len() < 2 {
        return default_suggestion();
    }

    // Collect node rects
    let mut rects: Vec<NodeRect> = ids.iter().filter_map(|&id| {
        scene.get_node(id).map(|n| NodeRect {
            id: n.id, x: n.x, y: n.y, w: n.width, h: n.height,
            cx: n.x + n.width / 2.0, cy: n.y + n.height / 2.0,
        })
    }).collect();

    if rects.len() < 2 {
        return default_suggestion();
    }

    // Detect pattern
    let h_score = horizontal_score(&rects);
    let v_score = vertical_score(&rects);
    let grid_score = grid_score(&rects);

    if grid_score > h_score && grid_score > v_score && grid_score > 0.5 {
        return suggest_grid(&rects);
    }

    if h_score >= v_score {
        suggest_linear(&mut rects, true, h_score)
    } else {
        suggest_linear(&mut rects, false, v_score)
    }
}

/// Score how well nodes form a horizontal row (0.0 - 1.0)
fn horizontal_score(rects: &[NodeRect]) -> f64 {
    if rects.len() < 2 { return 0.0; }

    // Check if centers are roughly aligned vertically
    let avg_cy: f64 = rects.iter().map(|r| r.cy).sum::<f64>() / rects.len() as f64;
    let max_h = rects.iter().map(|r| r.h).fold(0.0f64, f64::max);
    let cy_variance: f64 = rects.iter().map(|r| (r.cy - avg_cy).abs()).sum::<f64>() / rects.len() as f64;

    // Normalize by max height - lower variance = better row
    let alignment_score = if max_h > 0.0 {
        (1.0 - (cy_variance / max_h).min(1.0)).max(0.0)
    } else { 0.5 };

    // Check if nodes don't overlap horizontally too much
    let mut sorted: Vec<&NodeRect> = rects.iter().collect();
    sorted.sort_by(|a, b| a.x.partial_cmp(&b.x).unwrap());
    let mut overlap_count = 0;
    for i in 1..sorted.len() {
        if sorted[i].x < sorted[i-1].x + sorted[i-1].w - 1.0 {
            overlap_count += 1;
        }
    }
    let no_overlap_score = 1.0 - (overlap_count as f64 / (rects.len() - 1) as f64);

    alignment_score * 0.6 + no_overlap_score * 0.4
}

/// Score how well nodes form a vertical column (0.0 - 1.0)
fn vertical_score(rects: &[NodeRect]) -> f64 {
    if rects.len() < 2 { return 0.0; }

    let avg_cx: f64 = rects.iter().map(|r| r.cx).sum::<f64>() / rects.len() as f64;
    let max_w = rects.iter().map(|r| r.w).fold(0.0f64, f64::max);
    let cx_variance: f64 = rects.iter().map(|r| (r.cx - avg_cx).abs()).sum::<f64>() / rects.len() as f64;

    let alignment_score = if max_w > 0.0 {
        (1.0 - (cx_variance / max_w).min(1.0)).max(0.0)
    } else { 0.5 };

    let mut sorted: Vec<&NodeRect> = rects.iter().collect();
    sorted.sort_by(|a, b| a.y.partial_cmp(&b.y).unwrap());
    let mut overlap_count = 0;
    for i in 1..sorted.len() {
        if sorted[i].y < sorted[i-1].y + sorted[i-1].h - 1.0 {
            overlap_count += 1;
        }
    }
    let no_overlap_score = 1.0 - (overlap_count as f64 / (rects.len() - 1) as f64);

    alignment_score * 0.6 + no_overlap_score * 0.4
}

/// Score how well nodes form a grid pattern
fn grid_score(rects: &[NodeRect]) -> f64 {
    if rects.len() < 4 { return 0.0; }

    // Check if there are multiple distinct rows AND columns
    let mut ys: Vec<f64> = rects.iter().map(|r| r.cy).collect();
    ys.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let row_count = count_clusters(&ys, 10.0);

    let mut xs: Vec<f64> = rects.iter().map(|r| r.cx).collect();
    xs.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let col_count = count_clusters(&xs, 10.0);

    if row_count >= 2 && col_count >= 2 {
        let expected = row_count * col_count;
        let actual = rects.len();
        let fill_ratio = actual as f64 / expected as f64;
        fill_ratio.min(1.0) * 0.8
    } else {
        0.0
    }
}

fn count_clusters(sorted_vals: &[f64], threshold: f64) -> usize {
    if sorted_vals.is_empty() { return 0; }
    let mut count = 1;
    let mut last = sorted_vals[0];
    for &v in &sorted_vals[1..] {
        if (v - last).abs() > threshold {
            count += 1;
            last = v;
        }
    }
    count
}

fn suggest_linear(rects: &mut Vec<NodeRect>, is_row: bool, score: f64) -> LayoutSuggestion {
    // Sort by position
    if is_row {
        rects.sort_by(|a, b| a.x.partial_cmp(&b.x).unwrap());
    } else {
        rects.sort_by(|a, b| a.y.partial_cmp(&b.y).unwrap());
    }

    // Calculate gaps between consecutive nodes
    let gaps: Vec<f64> = rects.windows(2).map(|w| {
        if is_row {
            w[1].x - (w[0].x + w[0].w)
        } else {
            w[1].y - (w[0].y + w[0].h)
        }
    }).collect();

    // Use median gap (robust to outliers)
    let gap = if gaps.is_empty() { 8.0 } else {
        let mut sorted_gaps = gaps.clone();
        sorted_gaps.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let mid = sorted_gaps.len() / 2;
        let raw_gap = sorted_gaps[mid];
        // Round to nice number
        round_to_nice(raw_gap.max(0.0))
    };

    // Detect alignment
    let align = if is_row {
        detect_cross_alignment(rects, false)
    } else {
        detect_cross_alignment(rects, true)
    };

    // Detect justify
    let justify = detect_justify(&gaps, is_row, rects);

    LayoutSuggestion {
        direction: if is_row { "row".to_string() } else { "column".to_string() },
        gap,
        padding_top: 0.0,
        padding_right: 0.0,
        padding_bottom: 0.0,
        padding_left: 0.0,
        align_items: align,
        justify_content: justify,
        wrap: "nowrap".to_string(),
        confidence: score,
        pattern: if is_row { "row".to_string() } else { "column".to_string() },
    }
}

fn suggest_grid(rects: &[NodeRect]) -> LayoutSuggestion {
    // Detect columns from x clusters
    let mut xs: Vec<f64> = rects.iter().map(|r| r.cx).collect();
    xs.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let col_count = count_clusters(&xs, 10.0);

    // Calculate gap from neighboring nodes
    let mut h_gaps: Vec<f64> = Vec::new();
    let mut v_gaps: Vec<f64> = Vec::new();
    for i in 0..rects.len() {
        for j in (i+1)..rects.len() {
            let hg = rects[j].x - (rects[i].x + rects[i].w);
            let vg = rects[j].y - (rects[i].y + rects[i].h);
            if hg > 0.0 && hg < 200.0 && (rects[i].cy - rects[j].cy).abs() < 20.0 {
                h_gaps.push(hg);
            }
            if vg > 0.0 && vg < 200.0 && (rects[i].cx - rects[j].cx).abs() < 20.0 {
                v_gaps.push(vg);
            }
        }
    }

    let gap = if !h_gaps.is_empty() {
        h_gaps.sort_by(|a, b| a.partial_cmp(b).unwrap());
        round_to_nice(h_gaps[h_gaps.len() / 2])
    } else { 8.0 };

    LayoutSuggestion {
        direction: "row".to_string(),
        gap,
        padding_top: 0.0,
        padding_right: 0.0,
        padding_bottom: 0.0,
        padding_left: 0.0,
        align_items: "start".to_string(),
        justify_content: "start".to_string(),
        wrap: "wrap".to_string(),
        confidence: 0.7,
        pattern: "grid".to_string(),
    }
}

/// Detect cross-axis alignment (Start/Center/End/Stretch)
fn detect_cross_alignment(rects: &[NodeRect], horizontal: bool) -> String {
    if rects.len() < 2 { return "start".to_string(); }

    let (starts, ends, sizes): (Vec<f64>, Vec<f64>, Vec<f64>) = if horizontal {
        (rects.iter().map(|r| r.x).collect(),
         rects.iter().map(|r| r.x + r.w).collect(),
         rects.iter().map(|r| r.w).collect())
    } else {
        (rects.iter().map(|r| r.y).collect(),
         rects.iter().map(|r| r.y + r.h).collect(),
         rects.iter().map(|r| r.h).collect())
    };

    let start_var = variance(&starts);
    let end_var = variance(&ends);
    let center_var = variance(&rects.iter().map(|r| if horizontal { r.cx } else { r.cy }).collect::<Vec<_>>());
    let size_var = variance(&sizes);

    // Check stretch: all same size
    if size_var < 4.0 && start_var < 4.0 {
        return "stretch".to_string();
    }

    let min_var = start_var.min(end_var).min(center_var);
    if min_var == start_var { "start".to_string() }
    else if min_var == center_var { "center".to_string() }
    else { "end".to_string() }
}

fn detect_justify(gaps: &[f64], _is_row: bool, _rects: &[NodeRect]) -> String {
    if gaps.is_empty() { return "start".to_string(); }

    let gap_var = variance(gaps);
    let avg_gap = gaps.iter().sum::<f64>() / gaps.len() as f64;

    // If gaps are very consistent, it's likely start or space-between
    if gap_var < 4.0 {
        "start".to_string()
    } else if avg_gap > 20.0 && gap_var > 100.0 {
        "space-between".to_string()
    } else {
        "start".to_string()
    }
}

fn variance(vals: &[f64]) -> f64 {
    if vals.is_empty() { return 0.0; }
    let mean = vals.iter().sum::<f64>() / vals.len() as f64;
    vals.iter().map(|v| (v - mean) * (v - mean)).sum::<f64>() / vals.len() as f64
}

fn round_to_nice(val: f64) -> f64 {
    if val <= 0.0 { return 0.0; }
    let rounded = val.round();
    // Snap to common values: 4, 8, 12, 16, 20, 24, 32
    let nice_values = [0.0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 16.0, 20.0, 24.0, 32.0, 40.0, 48.0, 64.0];
    let mut best = rounded;
    let mut best_dist = f64::MAX;
    for &nv in &nice_values {
        let dist = (rounded - nv).abs();
        if dist < best_dist {
            best_dist = dist;
            best = nv;
        }
    }
    // Only snap if close enough (within 3px)
    if best_dist <= 3.0 { best } else { rounded }
}

fn default_suggestion() -> LayoutSuggestion {
    LayoutSuggestion {
        direction: "column".to_string(),
        gap: 8.0,
        padding_top: 0.0,
        padding_right: 0.0,
        padding_bottom: 0.0,
        padding_left: 0.0,
        align_items: "start".to_string(),
        justify_content: "start".to_string(),
        wrap: "nowrap".to_string(),
        confidence: 0.0,
        pattern: "unknown".to_string(),
    }
}
