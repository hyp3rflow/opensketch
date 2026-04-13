use crate::types::ColorSpace;
use crate::node::*;
use crate::scene::Scene;
// Breakpoint is used from node::*

/// Run layout on all nodes with layout.mode != None.
/// This repositions children based on the parent's layout settings.
pub fn compute_layouts(scene: &mut Scene) {
    // Collect nodes that have layout enabled (we need to avoid borrow issues)
    let ids: Vec<NodeId> = scene.all_node_ids().into_iter().filter(|&id| {
        scene.get_node(id).map(|n| n.layout.mode != LayoutMode::None).unwrap_or(false)
    }).collect();

    // Apply responsive breakpoints before computing layouts
    for &id in &ids {
        apply_breakpoints(scene, id);
    }

    for id in ids {
        compute_node_layout(scene, id);
        apply_hug_sizing(scene, id);
    }
}

/// Resolve the effective layout for a node, applying responsive breakpoint overrides
/// based on the node's current width. Does NOT mutate the node.
fn resolve_layout_with_breakpoints(node: &Node) -> Layout {
    let mut layout = node.layout.clone();
    if node.breakpoints.is_empty() { return layout; }

    // Find the best matching breakpoint: smallest max_width that is >= node width
    let mut candidates: Vec<&Breakpoint> = node.breakpoints.iter()
        .filter(|bp| node.width <= bp.max_width)
        .collect();
    candidates.sort_by(|a, b| a.max_width.partial_cmp(&b.max_width).unwrap());

    let bp = match candidates.first() {
        Some(bp) => *bp,
        None => return layout,
    };

    if let Some(ref dir) = bp.direction { layout.direction = dir.clone(); }
    if let Some(ref mode) = bp.layout_mode { layout.mode = mode.clone(); }
    if let Some(gap) = bp.gap { layout.gap = gap; }
    if let Some(ref pad) = bp.padding {
        layout.padding_top = pad[0];
        layout.padding_right = pad[1];
        layout.padding_bottom = pad[2];
        layout.padding_left = pad[3];
    }
    if let Some(ref ai) = bp.align_items { layout.align_items = ai.clone(); }
    if let Some(ref jc) = bp.justify_content { layout.justify_content = jc.clone(); }
    if let Some(ref w) = bp.wrap { layout.wrap = w.clone(); }
    if let Some(cols) = bp.grid_columns { layout.grid_columns = cols; }

    layout
}

/// Get the active breakpoint's hidden_children indices for a node, if any.
fn get_active_hidden_children(node: &Node) -> Vec<usize> {
    if node.breakpoints.is_empty() { return vec![]; }
    let mut candidates: Vec<&Breakpoint> = node.breakpoints.iter()
        .filter(|bp| node.width <= bp.max_width)
        .collect();
    candidates.sort_by(|a, b| a.max_width.partial_cmp(&b.max_width).unwrap());
    candidates.first().map(|bp| bp.hidden_children.clone()).unwrap_or_default()
}

/// Temporarily apply breakpoint overrides, then restore after layout.
fn apply_breakpoints(scene: &mut Scene, node_id: NodeId) {
    // Nothing to do here — breakpoints are resolved inline in compute_node_layout
}

/// After layout, if the parent uses Hug sizing, shrink it to wrap its children tightly.
fn apply_hug_sizing(scene: &mut Scene, parent_id: NodeId) {
    let (sizing_h, sizing_v, layout, children) = {
        let node = match scene.get_node(parent_id) {
            Some(n) => n,
            None => return,
        };
        (node.sizing_h.clone(), node.sizing_v.clone(), node.layout.clone(), node.children.clone())
    };

    if sizing_h == SizingMode::Fixed && sizing_v == SizingMode::Fixed {
        return;
    }

    // Compute bounding box of children
    let mut min_x = f64::MAX;
    let mut min_y = f64::MAX;
    let mut max_x = f64::MIN;
    let mut max_y = f64::MIN;
    let mut has_child = false;

    for &cid in &children {
        if let Some(child) = scene.get_node(cid) {
            if !child.visible || child.absolute_position { continue; }
            has_child = true;
            min_x = min_x.min(child.x);
            min_y = min_y.min(child.y);
            max_x = max_x.max(child.x + child.width);
            max_y = max_y.max(child.y + child.height);
        }
    }

    if !has_child { return; }

    if let Some(parent) = scene.get_node_mut(parent_id) {
        if sizing_h == SizingMode::Hug {
            let new_w = (max_x - parent.x) + layout.padding_right;
            parent.width = new_w.max(1.0);
        }
        if sizing_v == SizingMode::Hug {
            let new_h = (max_y - parent.y) + layout.padding_bottom;
            parent.height = new_h.max(1.0);
        }
        // Apply min/max constraints after hug sizing
        parent.clamp_size();
    }
}

fn compute_node_layout(scene: &mut Scene, parent_id: NodeId) {
    // Read parent info, applying breakpoint overrides
    let (layout, parent_x, parent_y, parent_w, parent_h, children, hidden_indices) = {
        let node = match scene.get_node(parent_id) {
            Some(n) => n,
            None => return,
        };
        let layout = resolve_layout_with_breakpoints(node);
        let hidden = get_active_hidden_children(node);
        (layout, node.x, node.y, node.width, node.height, node.children.clone(), hidden)
    };

    // Temporarily hide children based on active breakpoint
    let mut restored_visibility: Vec<(NodeId, bool)> = vec![];
    for &idx in &hidden_indices {
        if idx < children.len() {
            if let Some(child) = scene.get_node_mut(children[idx]) {
                if child.visible {
                    restored_visibility.push((children[idx], true));
                    child.visible = false;
                }
            }
        }
    }

    if children.is_empty() { return; }

    match layout.mode {
        LayoutMode::Flex => compute_flex(scene, &layout, parent_x, parent_y, parent_w, parent_h, &children),
        LayoutMode::Grid => compute_grid(scene, &layout, parent_x, parent_y, parent_w, parent_h, &children),
        LayoutMode::None => {}
    }

    // Restore visibility for breakpoint-hidden children
    for (cid, was_visible) in restored_visibility {
        if let Some(child) = scene.get_node_mut(cid) {
            child.visible = was_visible;
        }
    }
}

fn compute_flex(scene: &mut Scene, layout: &Layout, px: f64, py: f64, pw: f64, ph: f64, children: &[NodeId]) {
    let content_x = px + layout.padding_left;
    let content_y = py + layout.padding_top;
    let content_w = pw - layout.padding_left - layout.padding_right;
    let content_h = ph - layout.padding_top - layout.padding_bottom;

    let is_row = layout.direction == FlexDirection::Row;
    let gap = layout.gap;
    let do_wrap = layout.wrap == FlexWrap::Wrap;

    // Collect child info including sizing modes
    struct ChildInfo {
        id: NodeId,
        w: f64,
        h: f64,
        min_w: Option<f64>,
        max_w: Option<f64>,
        min_h: Option<f64>,
        max_h: Option<f64>,
        fill_main: bool,
        fill_cross: bool,
        wrap_before: bool,
        first_baseline_offset: f64,
        last_baseline_offset: f64,
    }
    let mut child_infos: Vec<ChildInfo> = vec![];
    for &cid in children {
        if let Some(child) = scene.get_node(cid) {
            if !child.visible || child.absolute_position { continue; }
            let fill_main = if is_row {
                child.sizing_h == SizingMode::Fill
            } else {
                child.sizing_v == SizingMode::Fill
            };
            let fill_cross = if is_row {
                child.sizing_v == SizingMode::Fill
            } else {
                child.sizing_h == SizingMode::Fill
            };
            let mut w = child.width;
            let mut h = child.height;
            if let Some(min) = child.min_width { w = w.max(min); }
            if let Some(max) = child.max_width { w = w.min(max); }
            if let Some(min) = child.min_height { h = h.max(min); }
            if let Some(max) = child.max_height { h = h.min(max); }
            let (first_baseline_offset, last_baseline_offset) = match &child.kind {
                NodeKind::Text { font_size, line_height, content, .. } => {
                    // Approximate first baseline from top: half-leading + ascent.
                    // Renderer uses alphabetic baseline with measured ascent; 0.8*font_size is a stable fallback.
                    let lh_px = (*line_height).max(0.1) * *font_size;
                    let ascent = *font_size * 0.8;
                    let first = ((lh_px - *font_size).max(0.0) / 2.0 + ascent).min(h);
                    let line_count = content.split('\n').count().max(1) as f64;
                    let last = (first + (line_count - 1.0).max(0.0) * lh_px).min(h);
                    (first, last)
                }
                _ => (h, h),
            };
            child_infos.push(ChildInfo {
                id: cid,
                w,
                h,
                min_w: child.min_width,
                max_w: child.max_width,
                min_h: child.min_height,
                max_h: child.max_height,
                fill_main,
                fill_cross,
                wrap_before: child.wrap_before,
                first_baseline_offset,
                last_baseline_offset,
            });
        }
    }

    if child_infos.is_empty() { return; }

    let avail_main = if is_row { content_w } else { content_h };
    let avail_cross = if is_row { content_h } else { content_w };

    // --- Wrap: split children into lines ---
    let lines: Vec<Vec<usize>> = if do_wrap {
        let mut lines: Vec<Vec<usize>> = vec![vec![]];
        let mut line_main = 0.0;
        for (i, ci) in child_infos.iter().enumerate() {
            let child_main = if is_row { ci.w } else { ci.h };
            let needs_forced_break = ci.wrap_before && !lines.last().unwrap().is_empty();
            if needs_forced_break {
                lines.push(vec![i]);
                line_main = child_main;
                continue;
            }
            let needed = if lines.last().unwrap().is_empty() { child_main } else { line_main + gap + child_main };
            if !lines.last().unwrap().is_empty() && needed > avail_main {
                // Start new line
                lines.push(vec![i]);
                line_main = child_main;
            } else {
                line_main = needed;
                lines.last_mut().unwrap().push(i);
            }
        }
        lines
    } else {
        vec![(0..child_infos.len()).collect()]
    };

    let num_lines = lines.len();

    // Calculate per-line cross sizes
    let line_cross_sizes: Vec<f64> = lines.iter().map(|line| {
        line.iter().map(|&i| {
            if is_row { child_infos[i].h } else { child_infos[i].w }
        }).fold(0.0_f64, f64::max)
    }).collect();

    let total_lines_cross: f64 = line_cross_sizes.iter().sum::<f64>() + gap * (num_lines as f64 - 1.0).max(0.0);
    let extra_cross = avail_cross - total_lines_cross;

    // Compute per-line cross offsets based on align_content
    let line_cross_offsets: Vec<f64> = {
        use crate::node::AlignContent;
        let nl = num_lines as f64;
        match layout.align_content {
            AlignContent::FlexStart => {
                let mut offsets = Vec::with_capacity(num_lines);
                let mut acc = 0.0;
                for (i, &lc) in line_cross_sizes.iter().enumerate() {
                    offsets.push(acc);
                    acc += lc + gap;
                }
                offsets
            }
            AlignContent::FlexEnd => {
                let mut offsets = Vec::with_capacity(num_lines);
                let mut acc = extra_cross.max(0.0);
                for (i, &lc) in line_cross_sizes.iter().enumerate() {
                    offsets.push(acc);
                    acc += lc + gap;
                }
                offsets
            }
            AlignContent::Center => {
                let mut offsets = Vec::with_capacity(num_lines);
                let mut acc = (extra_cross / 2.0).max(0.0);
                for &lc in &line_cross_sizes {
                    offsets.push(acc);
                    acc += lc + gap;
                }
                offsets
            }
            AlignContent::SpaceBetween => {
                let mut offsets = Vec::with_capacity(num_lines);
                let line_gap = if nl > 1.0 { extra_cross.max(0.0) / (nl - 1.0) } else { 0.0 };
                let mut acc = 0.0;
                for &lc in &line_cross_sizes {
                    offsets.push(acc);
                    acc += lc + line_gap;
                }
                offsets
            }
            AlignContent::SpaceAround => {
                let mut offsets = Vec::with_capacity(num_lines);
                let space = if nl > 0.0 { extra_cross.max(0.0) / nl } else { 0.0 };
                let mut acc = space / 2.0;
                for &lc in &line_cross_sizes {
                    offsets.push(acc);
                    acc += lc + space;
                }
                offsets
            }
            AlignContent::Stretch => {
                // Distribute extra space equally among lines
                let stretch_extra = if num_lines > 0 { extra_cross.max(0.0) / num_lines as f64 } else { 0.0 };
                let mut offsets = Vec::with_capacity(num_lines);
                let mut acc = 0.0;
                for &lc in &line_cross_sizes {
                    offsets.push(acc);
                    acc += lc + stretch_extra + gap;
                }
                offsets
            }
        }
    };

    // For Stretch, compute effective per-line cross size (original + extra)
    let stretch_extra_per_line = if layout.align_content == crate::node::AlignContent::Stretch && num_lines > 0 {
        extra_cross.max(0.0) / num_lines as f64
    } else {
        0.0
    };

    for (line_idx, line) in lines.iter().enumerate() {
        let cross_offset = line_cross_offsets[line_idx];
        let n = line.len() as f64;
        let line_cross = line_cross_sizes[line_idx];

        // Calculate fill sizes for this line (respect min/max constraints via bounded distribution)
        let fixed_total: f64 = line.iter()
            .filter(|&&i| !child_infos[i].fill_main)
            .map(|&i| if is_row { child_infos[i].w } else { child_infos[i].h })
            .sum();
        let total_gaps = gap * (n - 1.0).max(0.0);
        let available_for_fill = (avail_main - fixed_total - total_gaps).max(0.0);

        let fill_indices: Vec<usize> = line.iter().copied().filter(|&i| child_infos[i].fill_main).collect();
        if !fill_indices.is_empty() {
            let mut remaining = available_for_fill;
            let mut flexing: Vec<usize> = Vec::with_capacity(fill_indices.len());

            // 1) Assign minimums first
            for &i in &fill_indices {
                let min_main = if is_row { child_infos[i].min_w.unwrap_or(0.0) } else { child_infos[i].min_h.unwrap_or(0.0) };
                if is_row { child_infos[i].w = min_main; } else { child_infos[i].h = min_main; }
                remaining -= min_main;
                flexing.push(i);
            }

            // 2) Distribute remaining equally, capping at each child's max
            if remaining > 0.0 {
                while !flexing.is_empty() {
                    let share = remaining / flexing.len() as f64;
                    let mut consumed = 0.0;
                    let mut next_flexing: Vec<usize> = Vec::with_capacity(flexing.len());

                    for &i in &flexing {
                        let current = if is_row { child_infos[i].w } else { child_infos[i].h };
                        let max_main = if is_row { child_infos[i].max_w.unwrap_or(f64::INFINITY) } else { child_infos[i].max_h.unwrap_or(f64::INFINITY) };
                        let target = (current + share).min(max_main);
                        let delta = (target - current).max(0.0);
                        consumed += delta;
                        if is_row { child_infos[i].w = target; } else { child_infos[i].h = target; }
                        if target + 1e-6 < max_main {
                            next_flexing.push(i);
                        }
                    }

                    if consumed <= 1e-9 {
                        break;
                    }
                    remaining = (remaining - consumed).max(0.0);
                    flexing = next_flexing;
                    if remaining <= 1e-9 {
                        break;
                    }
                }
            }
        }

        // Total size along main axis for this line
        let total_main: f64 = line.iter().map(|&i| {
            if is_row { child_infos[i].w } else { child_infos[i].h }
        }).sum::<f64>() + gap * (n - 1.0).max(0.0);

        // Main axis start position based on justify
        let mut main_pos = match layout.justify_content {
            Justify::Start => 0.0,
            Justify::Center => (avail_main - total_main) / 2.0,
            Justify::End => avail_main - total_main,
            Justify::SpaceBetween => 0.0,
            Justify::SpaceAround => 0.0,
            Justify::SpaceEvenly => 0.0,
        };

        // Calculate spacing for distribute modes
        let extra_gap = match layout.justify_content {
            Justify::SpaceBetween if n > 1.0 => {
                let total_child: f64 = line.iter().map(|&i| {
                    if is_row { child_infos[i].w } else { child_infos[i].h }
                }).sum();
                (avail_main - total_child) / (n - 1.0)
            },
            Justify::SpaceAround => {
                let total_child: f64 = line.iter().map(|&i| {
                    if is_row { child_infos[i].w } else { child_infos[i].h }
                }).sum();
                let space = (avail_main - total_child) / n;
                main_pos = space / 2.0;
                space
            },
            Justify::SpaceEvenly => {
                let total_child: f64 = line.iter().map(|&i| {
                    if is_row { child_infos[i].w } else { child_infos[i].h }
                }).sum();
                let space = (avail_main - total_child) / (n + 1.0);
                main_pos = space;
                space
            },
            _ => gap,
        };

        let use_gap = match layout.justify_content {
            Justify::SpaceBetween | Justify::SpaceAround | Justify::SpaceEvenly => extra_gap,
            _ => gap,
        };

        // Cross axis for this line (when wrapping, each line gets its own cross region)
        let line_avail_cross = if do_wrap { line_cross + stretch_extra_per_line } else { avail_cross };

        let is_first_baseline = matches!(layout.align_items, Align::Baseline | Align::FirstBaseline);
        let is_last_baseline = layout.align_items == Align::LastBaseline;

        let line_first_baseline = if is_row && is_first_baseline {
            line.iter().map(|&i| child_infos[i].first_baseline_offset).fold(0.0_f64, f64::max)
        } else {
            0.0
        };
        let line_last_baseline = if is_row && is_last_baseline {
            line.iter().map(|&i| child_infos[i].last_baseline_offset).fold(0.0_f64, f64::max)
        } else {
            0.0
        };

        for (j, &i) in line.iter().enumerate() {
            let ci = &child_infos[i];
            let child_main = if is_row { ci.w } else { ci.h };
            let child_cross = if is_row { ci.h } else { ci.w };

            let should_stretch = layout.align_items == Align::Stretch || ci.fill_cross;
            let cross_pos = if should_stretch {
                0.0
            } else {
                match layout.align_items {
                    Align::Start => 0.0,
                    Align::Center => (line_avail_cross - child_cross) / 2.0,
                    Align::End => line_avail_cross - child_cross,
                    Align::Stretch => 0.0,
                    Align::Baseline | Align::FirstBaseline => {
                        if is_row {
                            (line_first_baseline - ci.first_baseline_offset).max(0.0)
                        } else {
                            0.0
                        }
                    }
                    Align::LastBaseline => {
                        if is_row {
                            (line_last_baseline - ci.last_baseline_offset).max(0.0)
                        } else {
                            0.0
                        }
                    }
                }
            };

            let (new_x, new_y) = if is_row {
                (content_x + main_pos, content_y + cross_offset + cross_pos)
            } else {
                (content_x + cross_offset + cross_pos, content_y + main_pos)
            };

            if let Some(child) = scene.get_node_mut(ci.id) {
                child.x = new_x;
                child.y = new_y;
                if ci.fill_main {
                    if is_row { child.width = ci.w; } else { child.height = ci.h; }
                }
                if should_stretch {
                    if is_row { child.height = line_avail_cross; }
                    else { child.width = line_avail_cross; }
                }
                child.clamp_size();
            }

            main_pos += child_main;
            if j < line.len() - 1 {
                main_pos += use_gap;
            }
        }

    }
}

fn compute_grid(scene: &mut Scene, layout: &Layout, px: f64, py: f64, pw: f64, ph: f64, children: &[NodeId]) {
    let content_x = px + layout.padding_left;
    let content_y = py + layout.padding_top;
    let content_w = pw - layout.padding_left - layout.padding_right;
    let content_h = ph - layout.padding_top - layout.padding_bottom;

    let cols = layout.grid_columns.max(1) as usize;
    let gap = layout.gap;

    let col_w = (content_w - gap * (cols as f64 - 1.0)) / cols as f64;

    let mut visible_children: Vec<(NodeId, f64)> = vec![];
    for &cid in children {
        if let Some(child) = scene.get_node(cid) {
            if !child.visible || child.absolute_position { continue; }
            let mut h = child.height;
            if let Some(min_h) = child.min_height { h = h.max(min_h); }
            if let Some(max_h) = child.max_height { h = h.min(max_h); }
            visible_children.push((cid, h));
        }
    }

    for (i, &(cid, ch)) in visible_children.iter().enumerate() {
        let col = i % cols;
        let row = i / cols;

        // Calculate row Y by summing previous rows
        let mut row_y = 0.0;
        for r in 0..row {
            let row_h = visible_children.iter().skip(r * cols).take(cols)
                .map(|(_, h)| *h).fold(0.0_f64, f64::max);
            row_y += row_h + gap;
        }

        let x = content_x + col as f64 * (col_w + gap);
        let y = content_y + row_y;

        if let Some(child) = scene.get_node_mut(cid) {
            child.x = x;
            child.y = y;
            child.width = col_w; // Grid children fill column width
            // Apply min/max size constraints
            child.clamp_size();
        }
    }
}
