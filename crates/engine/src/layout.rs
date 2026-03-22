use crate::node::*;
use crate::scene::Scene;

/// Run layout on all nodes with layout.mode != None.
/// This repositions children based on the parent's layout settings.
pub fn compute_layouts(scene: &mut Scene) {
    // Collect nodes that have layout enabled (we need to avoid borrow issues)
    let ids: Vec<NodeId> = scene.all_node_ids().into_iter().filter(|&id| {
        scene.get_node(id).map(|n| n.layout.mode != LayoutMode::None).unwrap_or(false)
    }).collect();

    for id in ids {
        compute_node_layout(scene, id);
        apply_hug_sizing(scene, id);
    }
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
            if !child.visible { continue; }
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
    }
}

fn compute_node_layout(scene: &mut Scene, parent_id: NodeId) {
    // Read parent info
    let (layout, parent_x, parent_y, parent_w, parent_h, children) = {
        let node = match scene.get_node(parent_id) {
            Some(n) => n,
            None => return,
        };
        (node.layout.clone(), node.x, node.y, node.width, node.height, node.children.clone())
    };

    if children.is_empty() { return; }

    match layout.mode {
        LayoutMode::Flex => compute_flex(scene, &layout, parent_x, parent_y, parent_w, parent_h, &children),
        LayoutMode::Grid => compute_grid(scene, &layout, parent_x, parent_y, parent_w, parent_h, &children),
        LayoutMode::None => {}
    }
}

fn compute_flex(scene: &mut Scene, layout: &Layout, px: f64, py: f64, pw: f64, ph: f64, children: &[NodeId]) {
    let content_x = px + layout.padding_left;
    let content_y = py + layout.padding_top;
    let content_w = pw - layout.padding_left - layout.padding_right;
    let content_h = ph - layout.padding_top - layout.padding_bottom;

    let is_row = layout.direction == FlexDirection::Row;
    let gap = layout.gap;

    // Collect child info including sizing modes
    struct ChildInfo {
        id: NodeId,
        w: f64,
        h: f64,
        fill_main: bool,
        fill_cross: bool,
    }
    let mut child_infos: Vec<ChildInfo> = vec![];
    for &cid in children {
        if let Some(child) = scene.get_node(cid) {
            if !child.visible { continue; }
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
            child_infos.push(ChildInfo { id: cid, w: child.width, h: child.height, fill_main, fill_cross });
        }
    }

    if child_infos.is_empty() { return; }

    let n = child_infos.len() as f64;
    let avail_main = if is_row { content_w } else { content_h };
    let avail_cross = if is_row { content_h } else { content_w };

    // Calculate fill sizes: distribute remaining space among fill children
    let fill_count = child_infos.iter().filter(|c| c.fill_main).count() as f64;
    let fixed_total: f64 = child_infos.iter()
        .filter(|c| !c.fill_main)
        .map(|c| if is_row { c.w } else { c.h })
        .sum();
    let total_gaps = gap * (n - 1.0);
    let fill_each = if fill_count > 0.0 {
        ((avail_main - fixed_total - total_gaps) / fill_count).max(0.0)
    } else {
        0.0
    };

    // Update fill children sizes
    for ci in child_infos.iter_mut() {
        if ci.fill_main {
            if is_row { ci.w = fill_each; } else { ci.h = fill_each; }
        }
    }

    // Total size along main axis (after fill distribution)
    let total_main: f64 = if is_row {
        child_infos.iter().map(|c| c.w).sum::<f64>() + gap * (n - 1.0)
    } else {
        child_infos.iter().map(|c| c.h).sum::<f64>() + gap * (n - 1.0)
    };

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
            let total_child: f64 = if is_row {
                child_infos.iter().map(|c| c.w).sum()
            } else {
                child_infos.iter().map(|c| c.h).sum()
            };
            (avail_main - total_child) / (n - 1.0)
        },
        Justify::SpaceAround => {
            let total_child: f64 = if is_row {
                child_infos.iter().map(|c| c.w).sum()
            } else {
                child_infos.iter().map(|c| c.h).sum()
            };
            let space = (avail_main - total_child) / n;
            main_pos = space / 2.0;
            space
        },
        Justify::SpaceEvenly => {
            let total_child: f64 = if is_row {
                child_infos.iter().map(|c| c.w).sum()
            } else {
                child_infos.iter().map(|c| c.h).sum()
            };
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

    for (i, ci) in child_infos.iter().enumerate() {
        let child_main = if is_row { ci.w } else { ci.h };
        let child_cross = if is_row { ci.h } else { ci.w };

        // Cross axis position based on align (fill_cross acts like stretch)
        let should_stretch = layout.align_items == Align::Stretch || ci.fill_cross;
        let cross_pos = if should_stretch {
            0.0
        } else {
            match layout.align_items {
                Align::Start => 0.0,
                Align::Center => (avail_cross - child_cross) / 2.0,
                Align::End => avail_cross - child_cross,
                Align::Stretch => 0.0,
            }
        };

        let (new_x, new_y) = if is_row {
            (content_x + main_pos, content_y + cross_pos)
        } else {
            (content_x + cross_pos, content_y + main_pos)
        };

        if let Some(child) = scene.get_node_mut(ci.id) {
            child.x = new_x;
            child.y = new_y;
            // Apply fill main axis size
            if ci.fill_main {
                if is_row { child.width = ci.w; } else { child.height = ci.h; }
            }
            // Apply stretch/fill cross axis
            if should_stretch {
                if is_row { child.height = avail_cross; }
                else { child.width = avail_cross; }
            }
            // Apply min/max size constraints
            child.clamp_size();
        }

        main_pos += child_main;
        if i < child_infos.len() - 1 {
            main_pos += use_gap;
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
            if !child.visible { continue; }
            visible_children.push((cid, child.height));
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
