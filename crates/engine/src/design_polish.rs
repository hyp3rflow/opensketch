use crate::node::{Node, NodeId, NodeKind, FillType, Fill, LayoutMode};
use crate::types::Color;
use serde::{Serialize, Deserialize};
use std::collections::HashMap;

/// A single polish fix that can be previewed and applied
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PolishFix {
    pub id: u32,
    pub node_id: u64,
    pub node_name: String,
    pub category: PolishCategory,
    pub description: String,
    pub detail: String,
    /// What will change
    pub before: String,
    pub after: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum PolishCategory {
    Spacing,
    Alignment,
    Color,
    CornerRadius,
    Size,
}

/// Internal action to apply
#[derive(Clone, Debug)]
pub enum PolishAction {
    SetGap { node_id: NodeId, gap: f64 },
    SetCornerRadius { node_id: NodeId, radius: f64 },
    SetFillColor { node_id: NodeId, fill_idx: usize, color: Color },
    SetPosition { node_id: NodeId, x: f64, y: f64 },
    SetSize { node_id: NodeId, w: f64, h: f64 },
    SetPadding { node_id: NodeId, top: f64, right: f64, bottom: f64, left: f64 },
}

pub struct PolishResult {
    pub fixes: Vec<PolishFix>,
    pub actions: Vec<(u32, PolishAction)>, // fix_id -> action
}

/// Analyze scene and generate polish suggestions
pub fn analyze(node_map: &HashMap<NodeId, Node>) -> PolishResult {
    let mut fixes = Vec::new();
    let mut actions = Vec::new();
    let mut fix_id: u32 = 0;
    let mut next_id = || { fix_id += 1; fix_id };

    let nodes: Vec<&Node> = node_map.values().filter(|n| n.visible).collect();

    // 1. Normalize spacing (find most common gap, fix outliers within threshold)
    normalize_spacing(&nodes, &mut fixes, &mut actions, &mut next_id);

    // 2. Standardize corner radii (cluster near values)
    standardize_radii(&nodes, &mut fixes, &mut actions, &mut next_id);

    // 3. Standardize near-miss colors
    standardize_colors(&nodes, node_map, &mut fixes, &mut actions, &mut next_id);

    // 4. Normalize padding (make symmetric where nearly symmetric)
    normalize_padding(&nodes, &mut fixes, &mut actions, &mut next_id);

    // 5. Snap sizes to common multiples (4px/8px grid)
    snap_sizes(&nodes, &mut fixes, &mut actions, &mut next_id);

    // 6. Snap positions to pixel grid
    snap_positions(&nodes, &mut fixes, &mut actions, &mut next_id);

    PolishResult { fixes, actions }
}

fn normalize_spacing(
    nodes: &[&Node],
    fixes: &mut Vec<PolishFix>,
    actions: &mut Vec<(u32, PolishAction)>,
    next_id: &mut impl FnMut() -> u32,
) {
    // Collect all layout gaps
    let mut gap_counts: HashMap<i32, Vec<NodeId>> = HashMap::new();
    for node in nodes {
        if node.layout.mode != LayoutMode::None {
            let gap_key = node.layout.gap.round() as i32;
            gap_counts.entry(gap_key).or_default().push(node.id);
        }
    }

    if gap_counts.len() < 2 { return; }

    // Find clusters of near values (within 2px)
    let mut sorted_gaps: Vec<i32> = gap_counts.keys().copied().collect();
    sorted_gaps.sort();

    for i in 0..sorted_gaps.len() {
        for j in (i + 1)..sorted_gaps.len() {
            let g1 = sorted_gaps[i];
            let g2 = sorted_gaps[j];
            let diff = (g2 - g1).abs();
            if diff > 0 && diff <= 2 {
                // Pick the more common value
                let count1 = gap_counts.get(&g1).map(|v| v.len()).unwrap_or(0);
                let count2 = gap_counts.get(&g2).map(|v| v.len()).unwrap_or(0);
                let (target, minor, minor_ids) = if count1 >= count2 {
                    (g1, g2, gap_counts.get(&g2).cloned().unwrap_or_default())
                } else {
                    (g2, g1, gap_counts.get(&g1).cloned().unwrap_or_default())
                };

                for nid in minor_ids {
                    if let Some(node) = nodes.iter().find(|n| n.id == nid) {
                        let fid = next_id();
                        fixes.push(PolishFix {
                            id: fid,
                            node_id: nid,
                            node_name: node.name.clone(),
                            category: PolishCategory::Spacing,
                            description: format!("Normalize gap {}px → {}px", minor, target),
                            detail: "Standardize spacing to match most common value".into(),
                            before: format!("{}px", minor),
                            after: format!("{}px", target),
                        });
                        actions.push((fid, PolishAction::SetGap { node_id: nid, gap: target as f64 }));
                    }
                }
            }
        }
    }
}

fn standardize_radii(
    nodes: &[&Node],
    fixes: &mut Vec<PolishFix>,
    actions: &mut Vec<(u32, PolishAction)>,
    next_id: &mut impl FnMut() -> u32,
) {
    let mut radius_counts: HashMap<i32, Vec<NodeId>> = HashMap::new();
    for node in nodes {
        if node.corner_radius > 0.0 && matches!(&node.kind, NodeKind::Rect | NodeKind::Frame) {
            let key = node.corner_radius.round() as i32;
            radius_counts.entry(key).or_default().push(node.id);
        }
    }

    if radius_counts.len() < 2 { return; }

    let mut sorted: Vec<i32> = radius_counts.keys().copied().collect();
    sorted.sort();

    for i in 0..sorted.len() {
        for j in (i + 1)..sorted.len() {
            let r1 = sorted[i];
            let r2 = sorted[j];
            let diff = (r2 - r1).abs();
            if diff > 0 && diff <= 2 {
                let count1 = radius_counts.get(&r1).map(|v| v.len()).unwrap_or(0);
                let count2 = radius_counts.get(&r2).map(|v| v.len()).unwrap_or(0);
                let (target, minor, minor_ids) = if count1 >= count2 {
                    (r1, r2, radius_counts.get(&r2).cloned().unwrap_or_default())
                } else {
                    (r2, r1, radius_counts.get(&r1).cloned().unwrap_or_default())
                };

                for nid in minor_ids {
                    if let Some(node) = nodes.iter().find(|n| n.id == nid) {
                        let fid = next_id();
                        fixes.push(PolishFix {
                            id: fid,
                            node_id: nid,
                            node_name: node.name.clone(),
                            category: PolishCategory::CornerRadius,
                            description: format!("Standardize radius {}px → {}px", minor, target),
                            detail: "Match most common corner radius".into(),
                            before: format!("{}px", minor),
                            after: format!("{}px", target),
                        });
                        actions.push((fid, PolishAction::SetCornerRadius { node_id: nid, radius: target as f64 }));
                    }
                }
            }
        }
    }
}

fn standardize_colors(
    nodes: &[&Node],
    _node_map: &HashMap<NodeId, Node>,
    fixes: &mut Vec<PolishFix>,
    actions: &mut Vec<(u32, PolishAction)>,
    next_id: &mut impl FnMut() -> u32,
) {
    // Collect all solid fill colors with their node+fill_idx
    let mut color_groups: HashMap<String, Vec<(NodeId, usize, Color)>> = HashMap::new();
    for node in nodes {
        for (idx, fill) in node.fills.iter().enumerate() {
            if !fill.visible { continue; }
            if let FillType::Solid { color } = &fill.fill_type {
                let key = format!("#{:02x}{:02x}{:02x}", color.r, color.g, color.b);
                color_groups.entry(key).or_default().push((node.id, idx, color.clone()));
            }
        }
    }

    let keys: Vec<String> = color_groups.keys().cloned().collect();
    for i in 0..keys.len() {
        for j in (i + 1)..keys.len() {
            let c1 = parse_hex(&keys[i]);
            let c2 = parse_hex(&keys[j]);
            if let (Some(c1), Some(c2)) = (c1, c2) {
                let dist = color_distance(&c1, &c2);
                if dist > 0.0 && dist <= 12.0 {
                    let g1 = &color_groups[&keys[i]];
                    let g2 = &color_groups[&keys[j]];
                    let (target_key, target_color, minor_key, minor_entries) = if g1.len() >= g2.len() {
                        (&keys[i], &c1, &keys[j], g2)
                    } else {
                        (&keys[j], &c2, &keys[i], g1)
                    };

                    for (nid, fill_idx, _) in minor_entries.iter().take(5) {
                        if let Some(node) = nodes.iter().find(|n| n.id == *nid) {
                            let fid = next_id();
                            fixes.push(PolishFix {
                                id: fid,
                                node_id: *nid,
                                node_name: node.name.clone(),
                                category: PolishCategory::Color,
                                description: format!("Standardize color {} → {}", minor_key, target_key),
                                detail: "Merge near-identical colors".into(),
                                before: minor_key.clone(),
                                after: target_key.clone(),
                            });
                            actions.push((fid, PolishAction::SetFillColor {
                                node_id: *nid,
                                fill_idx: *fill_idx,
                                color: target_color.clone(),
                            }));
                        }
                    }
                }
            }
        }
    }
}

fn normalize_padding(
    nodes: &[&Node],
    fixes: &mut Vec<PolishFix>,
    actions: &mut Vec<(u32, PolishAction)>,
    next_id: &mut impl FnMut() -> u32,
) {
    for node in nodes {
        if node.layout.mode == LayoutMode::None { continue; }
        
        // Check if H padding is nearly symmetric
        if (node.layout.padding_left - node.layout.padding_right).abs() > 0.0 && (node.layout.padding_left - node.layout.padding_right).abs() <= 2.0 {
            let avg = ((node.layout.padding_left + node.layout.padding_right) / 2.0).round();
            let fid = next_id();
            fixes.push(PolishFix {
                id: fid,
                node_id: node.id,
                node_name: node.name.clone(),
                category: PolishCategory::Spacing,
                description: format!("Symmetrize horizontal padding ({}/{} → {})", node.layout.padding_left, node.layout.padding_right, avg),
                detail: "Make left/right padding equal".into(),
                before: format!("L:{} R:{}", node.layout.padding_left, node.layout.padding_right),
                after: format!("L:{} R:{}", avg, avg),
            });
            actions.push((fid, PolishAction::SetPadding {
                node_id: node.id,
                top: node.layout.padding_top, right: avg, bottom: node.layout.padding_bottom, left: avg,
            }));
        }

        // Check V padding
        if (node.layout.padding_top - node.layout.padding_bottom).abs() > 0.0 && (node.layout.padding_top - node.layout.padding_bottom).abs() <= 2.0 {
            let avg = ((node.layout.padding_top + node.layout.padding_bottom) / 2.0).round();
            let fid = next_id();
            fixes.push(PolishFix {
                id: fid,
                node_id: node.id,
                node_name: node.name.clone(),
                category: PolishCategory::Spacing,
                description: format!("Symmetrize vertical padding ({}/{} → {})", node.layout.padding_top, node.layout.padding_bottom, avg),
                detail: "Make top/bottom padding equal".into(),
                before: format!("T:{} B:{}", node.layout.padding_top, node.layout.padding_bottom),
                after: format!("T:{} B:{}", avg, avg),
            });
            actions.push((fid, PolishAction::SetPadding {
                node_id: node.id,
                top: avg, right: node.layout.padding_right, bottom: avg, left: node.layout.padding_left,
            }));
        }
    }
}

fn snap_sizes(
    nodes: &[&Node],
    fixes: &mut Vec<PolishFix>,
    actions: &mut Vec<(u32, PolishAction)>,
    next_id: &mut impl FnMut() -> u32,
) {
    for node in nodes {
        // Skip nodes inside auto-layout (their size is managed)
        if node.parent.is_some() { continue; } // simplified: only root-level
        if matches!(&node.kind, NodeKind::Text { .. } | NodeKind::Group) { continue; }

        let w = node.width;
        let h = node.height;

        // Check if close to 4px grid
        let snap_w = (w / 4.0).round() * 4.0;
        let snap_h = (h / 4.0).round() * 4.0;

        let dw = (w - snap_w).abs();
        let dh = (h - snap_h).abs();

        if (dw > 0.0 && dw <= 2.0) || (dh > 0.0 && dh <= 2.0) {
            let new_w = if dw > 0.0 && dw <= 2.0 { snap_w } else { w };
            let new_h = if dh > 0.0 && dh <= 2.0 { snap_h } else { h };
            let fid = next_id();
            fixes.push(PolishFix {
                id: fid,
                node_id: node.id,
                node_name: node.name.clone(),
                category: PolishCategory::Size,
                description: format!("Snap size to 4px grid ({:.0}×{:.0} → {:.0}×{:.0})", w, h, new_w, new_h),
                detail: "Align dimensions to 4px grid for crispness".into(),
                before: format!("{:.0}×{:.0}", w, h),
                after: format!("{:.0}×{:.0}", new_w, new_h),
            });
            actions.push((fid, PolishAction::SetSize { node_id: node.id, w: new_w, h: new_h }));
        }
    }
}

fn snap_positions(
    nodes: &[&Node],
    fixes: &mut Vec<PolishFix>,
    actions: &mut Vec<(u32, PolishAction)>,
    next_id: &mut impl FnMut() -> u32,
) {
    for node in nodes {
        if node.parent.is_some() { continue; }
        let x = node.x;
        let y = node.y;
        let snap_x = x.round();
        let snap_y = y.round();
        let dx = (x - snap_x).abs();
        let dy = (y - snap_y).abs();

        if (dx > 0.01 && dx < 0.5) || (dy > 0.01 && dy < 0.5) {
            let fid = next_id();
            fixes.push(PolishFix {
                id: fid,
                node_id: node.id,
                node_name: node.name.clone(),
                category: PolishCategory::Alignment,
                description: format!("Snap to pixel grid ({:.1},{:.1} → {:.0},{:.0})", x, y, snap_x, snap_y),
                detail: "Remove sub-pixel positioning for sharper rendering".into(),
                before: format!("{:.1}, {:.1}", x, y),
                after: format!("{:.0}, {:.0}", snap_x, snap_y),
            });
            actions.push((fid, PolishAction::SetPosition { node_id: node.id, x: snap_x, y: snap_y }));
        }
    }
}

fn parse_hex(hex: &str) -> Option<Color> {
    let hex = hex.trim_start_matches('#');
    if hex.len() != 6 { return None; }
    Some(Color {
        r: u8::from_str_radix(&hex[0..2], 16).ok()?,
        g: u8::from_str_radix(&hex[2..4], 16).ok()?,
        b: u8::from_str_radix(&hex[4..6], 16).ok()?,
        a: 1.0,
    })
}

fn color_distance(a: &Color, b: &Color) -> f64 {
    let dr = a.r as f64 - b.r as f64;
    let dg = a.g as f64 - b.g as f64;
    let db = a.b as f64 - b.b as f64;
    (dr * dr + dg * dg + db * db).sqrt()
}

/// Apply a set of fixes by their IDs
pub fn apply_fixes(
    node_map: &mut HashMap<NodeId, Node>,
    result: &PolishResult,
    fix_ids: &[u32],
) -> u32 {
    let mut applied = 0u32;
    for (fid, action) in &result.actions {
        if !fix_ids.contains(fid) { continue; }
        match action {
            PolishAction::SetGap { node_id, gap } => {
                if let Some(node) = node_map.get_mut(node_id) {
                    node.layout.gap = *gap;
                    applied += 1;
                }
            }
            PolishAction::SetCornerRadius { node_id, radius } => {
                if let Some(node) = node_map.get_mut(node_id) {
                    node.corner_radius = *radius;
                    applied += 1;
                }
            }
            PolishAction::SetFillColor { node_id, fill_idx, color } => {
                if let Some(node) = node_map.get_mut(node_id) {
                    if let Some(fill) = node.fills.get_mut(*fill_idx) {
                        fill.fill_type = FillType::Solid { color: color.clone() };
                        applied += 1;
                    }
                }
            }
            PolishAction::SetPosition { node_id, x, y } => {
                if let Some(node) = node_map.get_mut(node_id) {
                    node.x = *x;
                    node.y = *y;
                    applied += 1;
                }
            }
            PolishAction::SetSize { node_id, w, h } => {
                if let Some(node) = node_map.get_mut(node_id) {
                    node.width = *w;
                    node.height = *h;
                    applied += 1;
                }
            }
            PolishAction::SetPadding { node_id, top, right, bottom, left } => {
                if let Some(node) = node_map.get_mut(node_id) {
                    node.layout.padding_top = *top;
                    node.layout.padding_right = *right;
                    node.layout.padding_bottom = *bottom;
                    node.layout.padding_left = *left;
                    applied += 1;
                }
            }
        }
    }
    applied
}
