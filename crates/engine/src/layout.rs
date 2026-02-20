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

    // Collect child sizes
    let mut child_sizes: Vec<(NodeId, f64, f64)> = vec![];
    for &cid in children {
        if let Some(child) = scene.get_node(cid) {
            if !child.visible { continue; }
            child_sizes.push((cid, child.width, child.height));
        }
    }

    if child_sizes.is_empty() { return; }

    let n = child_sizes.len() as f64;

    // Total size along main axis
    let total_main: f64 = if is_row {
        child_sizes.iter().map(|(_, w, _)| w).sum::<f64>() + gap * (n - 1.0)
    } else {
        child_sizes.iter().map(|(_, _, h)| h).sum::<f64>() + gap * (n - 1.0)
    };

    let avail_main = if is_row { content_w } else { content_h };
    let avail_cross = if is_row { content_h } else { content_w };

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
            let total_child = if is_row {
                child_sizes.iter().map(|(_, w, _)| w).sum::<f64>()
            } else {
                child_sizes.iter().map(|(_, _, h)| h).sum::<f64>()
            };
            (avail_main - total_child) / (n - 1.0)
        },
        Justify::SpaceAround => {
            let total_child = if is_row {
                child_sizes.iter().map(|(_, w, _)| w).sum::<f64>()
            } else {
                child_sizes.iter().map(|(_, _, h)| h).sum::<f64>()
            };
            let space = (avail_main - total_child) / n;
            main_pos = space / 2.0;
            space
        },
        Justify::SpaceEvenly => {
            let total_child = if is_row {
                child_sizes.iter().map(|(_, w, _)| w).sum::<f64>()
            } else {
                child_sizes.iter().map(|(_, _, h)| h).sum::<f64>()
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

    for (i, &(cid, cw, ch)) in child_sizes.iter().enumerate() {
        let child_main = if is_row { cw } else { ch };
        let child_cross = if is_row { ch } else { cw };

        // Cross axis position based on align
        let cross_pos = match layout.align_items {
            Align::Start => 0.0,
            Align::Center => (avail_cross - child_cross) / 2.0,
            Align::End => avail_cross - child_cross,
            Align::Stretch => 0.0,
        };

        let (new_x, new_y) = if is_row {
            (content_x + main_pos, content_y + cross_pos)
        } else {
            (content_x + cross_pos, content_y + main_pos)
        };

        // Apply stretch
        if let Some(child) = scene.get_node_mut(cid) {
            child.x = new_x;
            child.y = new_y;
            if layout.align_items == Align::Stretch {
                if is_row { child.height = avail_cross; }
                else { child.width = avail_cross; }
            }
        }

        main_pos += child_main;
        if i < child_sizes.len() - 1 {
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
        }
    }
}
