use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use crate::node::{Node, NodeId, NodeKind, ConstraintH, ConstraintV};
use crate::types::Point;

#[derive(Serialize, Deserialize)]
pub struct SceneData {
    pub nodes: Vec<Node>,
    pub root_children: Vec<NodeId>,
    pub next_id: NodeId,
}

pub struct Scene {
    nodes: HashMap<NodeId, Node>,
    root_children: Vec<NodeId>,
    next_id: NodeId,
    pub selection: Vec<NodeId>,
}

impl Scene {
    pub fn new() -> Self {
        Self {
            nodes: HashMap::new(),
            root_children: vec![],
            next_id: 1,
            selection: vec![],
        }
    }

    pub fn add_node(&mut self, mut node: Node) -> NodeId {
        let id = self.next_id;
        self.next_id += 1;
        node.id = id;
        if let Some(parent_id) = node.parent {
            if let Some(parent) = self.nodes.get_mut(&parent_id) {
                parent.children.push(id);
            }
        } else {
            self.root_children.push(id);
        }
        self.nodes.insert(id, node);
        id
    }

    pub fn get_node(&self, id: NodeId) -> Option<&Node> {
        self.nodes.get(&id)
    }

    pub fn get_node_mut(&mut self, id: NodeId) -> Option<&mut Node> {
        self.nodes.get_mut(&id)
    }

    pub fn remove_node(&mut self, id: NodeId) {
        if let Some(node) = self.nodes.remove(&id) {
            self.root_children.retain(|&c| c != id);
            if let Some(parent_id) = node.parent {
                if let Some(parent) = self.nodes.get_mut(&parent_id) {
                    parent.children.retain(|&c| c != id);
                }
            }
            for child_id in node.children {
                self.remove_node(child_id);
            }
        }
        self.selection.retain(|&s| s != id);
    }

    pub fn render_order(&self) -> Vec<NodeId> {
        let mut result = vec![];
        self.collect_render_order(&self.root_children, &mut result);
        result
    }

    fn collect_render_order(&self, ids: &[NodeId], result: &mut Vec<NodeId>) {
        for &id in ids {
            result.push(id);
            if let Some(node) = self.nodes.get(&id) {
                self.collect_render_order(&node.children, result);
            }
        }
    }

    /// Return all visible, unlocked node ids whose bounds intersect the given rectangle.
    pub fn hit_test_rect(&self, x: f64, y: f64, w: f64, h: f64) -> Vec<NodeId> {
        let rx = x;
        let ry = y;
        let rx2 = x + w;
        let ry2 = y + h;
        let mut result = vec![];
        for &id in &self.render_order() {
            if let Some(node) = self.nodes.get(&id) {
                if !node.visible || node.locked { continue; }
                // Skip Frame/Group containers — only select leaf-like nodes
                let nx = node.x;
                let ny = node.y;
                let nx2 = node.x + node.width;
                let ny2 = node.y + node.height;
                // AABB overlap
                if nx < rx2 && nx2 > rx && ny < ry2 && ny2 > ry {
                    result.push(id);
                }
            }
        }
        result
    }

    pub fn hit_test(&self, point: Point) -> Option<NodeId> {
        let order = self.render_order();
        for &id in order.iter().rev() {
            if let Some(node) = self.nodes.get(&id) {
                if !node.visible || node.locked { continue; }
                if node.bounds().contains(point) {
                    return Some(id);
                }
            }
        }
        None
    }

    pub fn move_node(&mut self, id: NodeId, dx: f64, dy: f64) {
        if let Some(node) = self.nodes.get_mut(&id) {
            node.x += dx;
            node.y += dy;
        }
    }

    pub fn resize_node(&mut self, id: NodeId, width: f64, height: f64) {
        if let Some(node) = self.nodes.get_mut(&id) {
            node.width = width.max(1.0);
            node.height = height.max(1.0);
        }
    }

    /// Resize a Frame/Group and apply constraints to its children.
    /// Child positions are absolute in our scene, so we convert to/from local coords.
    pub fn resize_node_with_constraints(&mut self, id: NodeId, new_width: f64, new_height: f64) {
        let (parent_x, parent_y, old_w, old_h, is_container) = if let Some(node) = self.nodes.get(&id) {
            let is_container = matches!(node.kind, NodeKind::Frame | NodeKind::Group);
            (node.x, node.y, node.width, node.height, is_container)
        } else {
            return;
        };

        if !is_container || old_w < 1.0 || old_h < 1.0 {
            self.resize_node(id, new_width, new_height);
            return;
        }

        let children: Vec<NodeId> = self.nodes.get(&id).map(|n| n.children.clone()).unwrap_or_default();

        // Collect child constraint data before mutation
        struct ChildData { id: NodeId, lx: f64, ly: f64, w: f64, h: f64, ch: ConstraintH, cv: ConstraintV }
        let child_data: Vec<ChildData> = children.iter().filter_map(|&cid| {
            self.nodes.get(&cid).map(|c| ChildData {
                id: cid,
                lx: c.x - parent_x,
                ly: c.y - parent_y,
                w: c.width,
                h: c.height,
                ch: c.constraints.horizontal.clone(),
                cv: c.constraints.vertical.clone(),
            })
        }).collect();

        // Resize parent
        let nw = new_width.max(1.0);
        let nh = new_height.max(1.0);
        if let Some(node) = self.nodes.get_mut(&id) {
            node.width = nw;
            node.height = nh;
        }

        // Apply constraints to each child
        for cd in child_data {
            let mut cx = cd.lx;
            let mut cy = cd.ly;
            let mut cw = cd.w;
            let mut ch = cd.h;

            match cd.ch {
                ConstraintH::Left => {}
                ConstraintH::Right => {
                    let right_margin = old_w - (cx + cw);
                    cx = nw - right_margin - cw;
                }
                ConstraintH::LeftAndRight => {
                    let right_margin = old_w - (cx + cw);
                    cw = (nw - cx - right_margin).max(1.0);
                }
                ConstraintH::Center => {
                    let center_ratio = (cx + cw / 2.0) / old_w;
                    cx = center_ratio * nw - cw / 2.0;
                }
                ConstraintH::Scale => {
                    let ratio = nw / old_w;
                    cx *= ratio;
                    cw = (cw * ratio).max(1.0);
                }
            }

            match cd.cv {
                ConstraintV::Top => {}
                ConstraintV::Bottom => {
                    let bottom_margin = old_h - (cy + ch);
                    cy = nh - bottom_margin - ch;
                }
                ConstraintV::TopAndBottom => {
                    let bottom_margin = old_h - (cy + ch);
                    ch = (nh - cy - bottom_margin).max(1.0);
                }
                ConstraintV::Center => {
                    let center_ratio = (cy + ch / 2.0) / old_h;
                    cy = center_ratio * nh - ch / 2.0;
                }
                ConstraintV::Scale => {
                    let ratio = nh / old_h;
                    cy *= ratio;
                    ch = (ch * ratio).max(1.0);
                }
            }

            if let Some(child) = self.nodes.get_mut(&cd.id) {
                child.x = parent_x + cx;
                child.y = parent_y + cy;
                child.width = cw;
                child.height = ch;
            }
        }
    }

    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }

    pub fn export(&self) -> SceneData {
        SceneData {
            nodes: self.nodes.values().cloned().collect(),
            root_children: self.root_children.clone(),
            next_id: self.next_id,
        }
    }

    pub fn import(data: SceneData) -> Self {
        let mut nodes = HashMap::new();
        for node in data.nodes {
            nodes.insert(node.id, node);
        }
        Self {
            nodes,
            root_children: data.root_children,
            next_id: data.next_id,
            selection: vec![],
        }
    }

    pub fn get_root_children(&self) -> Vec<NodeId> {
        self.root_children.clone()
    }

    pub fn get_children_of(&self, parent_id: NodeId) -> Vec<NodeId> {
        if let Some(node) = self.nodes.get(&parent_id) {
            node.children.clone()
        } else {
            vec![]
        }
    }

    pub fn all_node_ids(&self) -> Vec<NodeId> {
        self.render_order()
    }

    // =============================================
    // Alignment & Distribution
    // =============================================

    pub fn align_left(&mut self, ids: &[NodeId]) {
        if ids.len() < 2 { return; }
        let min_x = ids.iter().filter_map(|&id| self.nodes.get(&id)).map(|n| n.x).fold(f64::INFINITY, f64::min);
        for &id in ids {
            if let Some(node) = self.nodes.get_mut(&id) { node.x = min_x; }
        }
    }

    pub fn align_center_h(&mut self, ids: &[NodeId]) {
        if ids.len() < 2 { return; }
        let (min_x, max_x2) = ids.iter().filter_map(|&id| self.nodes.get(&id)).fold((f64::INFINITY, f64::NEG_INFINITY), |(mn, mx), n| (mn.min(n.x), mx.max(n.x + n.width)));
        let center = (min_x + max_x2) / 2.0;
        for &id in ids {
            if let Some(node) = self.nodes.get_mut(&id) { node.x = center - node.width / 2.0; }
        }
    }

    pub fn align_right(&mut self, ids: &[NodeId]) {
        if ids.len() < 2 { return; }
        let max_x2 = ids.iter().filter_map(|&id| self.nodes.get(&id)).map(|n| n.x + n.width).fold(f64::NEG_INFINITY, f64::max);
        for &id in ids {
            if let Some(node) = self.nodes.get_mut(&id) { node.x = max_x2 - node.width; }
        }
    }

    pub fn align_top(&mut self, ids: &[NodeId]) {
        if ids.len() < 2 { return; }
        let min_y = ids.iter().filter_map(|&id| self.nodes.get(&id)).map(|n| n.y).fold(f64::INFINITY, f64::min);
        for &id in ids {
            if let Some(node) = self.nodes.get_mut(&id) { node.y = min_y; }
        }
    }

    pub fn align_center_v(&mut self, ids: &[NodeId]) {
        if ids.len() < 2 { return; }
        let (min_y, max_y2) = ids.iter().filter_map(|&id| self.nodes.get(&id)).fold((f64::INFINITY, f64::NEG_INFINITY), |(mn, mx), n| (mn.min(n.y), mx.max(n.y + n.height)));
        let center = (min_y + max_y2) / 2.0;
        for &id in ids {
            if let Some(node) = self.nodes.get_mut(&id) { node.y = center - node.height / 2.0; }
        }
    }

    pub fn align_bottom(&mut self, ids: &[NodeId]) {
        if ids.len() < 2 { return; }
        let max_y2 = ids.iter().filter_map(|&id| self.nodes.get(&id)).map(|n| n.y + n.height).fold(f64::NEG_INFINITY, f64::max);
        for &id in ids {
            if let Some(node) = self.nodes.get_mut(&id) { node.y = max_y2 - node.height; }
        }
    }

    pub fn distribute_horizontal(&mut self, ids: &[NodeId]) {
        if ids.len() < 3 { return; }
        let mut items: Vec<(NodeId, f64, f64)> = ids.iter().filter_map(|&id| self.nodes.get(&id).map(|n| (id, n.x, n.width))).collect();
        items.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
        let total_width: f64 = items.iter().map(|i| i.2).sum();
        let min_x = items.first().unwrap().1;
        let max_x2 = items.last().map(|i| i.1 + i.2).unwrap();
        let gap = (max_x2 - min_x - total_width) / (items.len() - 1) as f64;
        let mut cursor = min_x;
        for (id, _, w) in &items {
            if let Some(node) = self.nodes.get_mut(id) { node.x = cursor; }
            cursor += w + gap;
        }
    }

    pub fn distribute_vertical(&mut self, ids: &[NodeId]) {
        if ids.len() < 3 { return; }
        let mut items: Vec<(NodeId, f64, f64)> = ids.iter().filter_map(|&id| self.nodes.get(&id).map(|n| (id, n.y, n.height))).collect();
        items.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
        let total_height: f64 = items.iter().map(|i| i.2).sum();
        let min_y = items.first().unwrap().1;
        let max_y2 = items.last().map(|i| i.1 + i.2).unwrap();
        let gap = (max_y2 - min_y - total_height) / (items.len() - 1) as f64;
        let mut cursor = min_y;
        for (id, _, h) in &items {
            if let Some(node) = self.nodes.get_mut(id) { node.y = cursor; }
            cursor += h + gap;
        }
    }

    /// Returns (min_x, min_y, max_x, max_y) bounding box of all nodes, or None if empty.
    pub fn get_bounds(&self) -> Option<(f64, f64, f64, f64)> {
        let mut min_x = f64::INFINITY;
        let mut min_y = f64::INFINITY;
        let mut max_x = f64::NEG_INFINITY;
        let mut max_y = f64::NEG_INFINITY;
        for node in self.nodes.values() {
            min_x = min_x.min(node.x);
            min_y = min_y.min(node.y);
            max_x = max_x.max(node.x + node.width);
            max_y = max_y.max(node.y + node.height);
        }
        if min_x.is_finite() { Some((min_x, min_y, max_x, max_y)) } else { None }
    }

    /// Returns bounding box of given node ids, or None if empty.
    pub fn get_bounds_of(&self, ids: &[NodeId]) -> Option<(f64, f64, f64, f64)> {
        let mut min_x = f64::INFINITY;
        let mut min_y = f64::INFINITY;
        let mut max_x = f64::NEG_INFINITY;
        let mut max_y = f64::NEG_INFINITY;
        for &id in ids {
            if let Some(node) = self.nodes.get(&id) {
                min_x = min_x.min(node.x);
                min_y = min_y.min(node.y);
                max_x = max_x.max(node.x + node.width);
                max_y = max_y.max(node.y + node.height);
            }
        }
        if min_x.is_finite() { Some((min_x, min_y, max_x, max_y)) } else { None }
    }

    pub fn reparent(&mut self, node_id: NodeId, new_parent: Option<NodeId>) {
        // Remove from old parent
        if let Some(node) = self.nodes.get(&node_id) {
            if let Some(old_parent) = node.parent {
                if let Some(p) = self.nodes.get_mut(&old_parent) {
                    p.children.retain(|&c| c != node_id);
                }
            } else {
                self.root_children.retain(|&c| c != node_id);
            }
        }
        // Add to new parent
        if let Some(pid) = new_parent {
            if let Some(p) = self.nodes.get_mut(&pid) {
                p.children.push(node_id);
            }
            if let Some(node) = self.nodes.get_mut(&node_id) {
                node.parent = Some(pid);
            }
        } else {
            self.root_children.push(node_id);
            if let Some(node) = self.nodes.get_mut(&node_id) {
                node.parent = None;
            }
        }
    }
}
