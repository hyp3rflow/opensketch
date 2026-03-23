use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use crate::node::{Node, NodeId, NodeKind, ConstraintH, ConstraintV, Comment, CommentReply};
use crate::types::Point;
use crate::variable::{VariableCollection, VariableBinding, VariableScope, CollectionId, VariableId, VariableValue};
use crate::types::Color;

fn parse_hex_color(hex: &str) -> Option<Color> {
    let hex = hex.trim_start_matches('#');
    let (r, g, b, a) = match hex.len() {
        6 => {
            let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
            let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
            let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
            (r, g, b, 1.0)
        }
        8 => {
            let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
            let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
            let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
            let a = u8::from_str_radix(&hex[6..8], 16).ok()?;
            (r, g, b, a as f64 / 255.0)
        }
        _ => return None,
    };
    Some(Color { r, g, b, a })
}

/// A single page within the scene
#[derive(Clone, Serialize, Deserialize)]
pub struct Page {
    pub id: u64,
    pub name: String,
    pub nodes: Vec<Node>,
    pub root_children: Vec<NodeId>,
}

/// Serialization format — backward compatible with old single-page SceneData
#[derive(Serialize, Deserialize)]
pub struct SceneData {
    /// Legacy field: nodes for single-page files
    #[serde(default)]
    pub nodes: Vec<Node>,
    #[serde(default)]
    pub root_children: Vec<NodeId>,
    #[serde(default)]
    pub next_id: NodeId,
    /// Multi-page support
    #[serde(default)]
    pub pages: Vec<Page>,
    #[serde(default)]
    pub active_page_index: usize,
    #[serde(default)]
    pub next_page_id: u64,
    /// Comments / annotations
    #[serde(default)]
    pub comments: Vec<Comment>,
    #[serde(default)]
    pub next_comment_id: u64,
    /// Variable collections
    #[serde(default)]
    pub variable_collections: Vec<VariableCollection>,
    #[serde(default)]
    pub next_collection_id: u64,
    /// Variable bindings: key = "node_id:property", value = binding
    #[serde(default)]
    pub variable_bindings: HashMap<String, VariableBinding>,
}

pub struct Scene {
    nodes: HashMap<NodeId, Node>,
    root_children: Vec<NodeId>,
    next_id: NodeId,
    pub selection: Vec<NodeId>,
    // Multi-page
    pages: Vec<Page>,
    active_page_index: usize,
    next_page_id: u64,
    // Comments
    comments: Vec<Comment>,
    next_comment_id: u64,
    // Variables
    pub variable_collections: Vec<VariableCollection>,
    next_collection_id: u64,
    pub variable_bindings: HashMap<String, VariableBinding>,
}

impl Scene {
    pub fn new() -> Self {
        Self {
            nodes: HashMap::new(),
            root_children: vec![],
            next_id: 1,
            selection: vec![],
            pages: vec![Page { id: 1, name: "Page 1".to_string(), nodes: vec![], root_children: vec![] }],
            active_page_index: 0,
            next_page_id: 2,
            comments: vec![],
            next_comment_id: 1,
            variable_collections: vec![],
            next_collection_id: 1,
            variable_bindings: HashMap::new(),
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

    pub fn all_nodes(&self) -> impl Iterator<Item = &Node> {
        self.nodes.values()
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

    pub fn bring_to_front(&mut self, id: NodeId) {
        let parent = self.nodes.get(&id).and_then(|n| n.parent);
        let list = if let Some(pid) = parent {
            &mut self.nodes.get_mut(&pid).unwrap().children
        } else {
            &mut self.root_children
        };
        if let Some(pos) = list.iter().position(|&c| c == id) {
            list.remove(pos);
            list.push(id);
        }
    }

    pub fn send_to_back(&mut self, id: NodeId) {
        let parent = self.nodes.get(&id).and_then(|n| n.parent);
        let list = if let Some(pid) = parent {
            &mut self.nodes.get_mut(&pid).unwrap().children
        } else {
            &mut self.root_children
        };
        if let Some(pos) = list.iter().position(|&c| c == id) {
            list.remove(pos);
            list.insert(0, id);
        }
    }

    pub fn bring_forward(&mut self, id: NodeId) {
        let parent = self.nodes.get(&id).and_then(|n| n.parent);
        let list = if let Some(pid) = parent {
            &mut self.nodes.get_mut(&pid).unwrap().children
        } else {
            &mut self.root_children
        };
        if let Some(pos) = list.iter().position(|&c| c == id) {
            if pos + 1 < list.len() {
                list.swap(pos, pos + 1);
            }
        }
    }

    pub fn send_backward(&mut self, id: NodeId) {
        let parent = self.nodes.get(&id).and_then(|n| n.parent);
        let list = if let Some(pid) = parent {
            &mut self.nodes.get_mut(&pid).unwrap().children
        } else {
            &mut self.root_children
        };
        if let Some(pos) = list.iter().position(|&c| c == id) {
            if pos > 0 {
                list.swap(pos, pos - 1);
            }
        }
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
                if !self.is_effectively_visible(id) || node.locked { continue; }
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
                if !self.is_effectively_visible(id) || node.locked { continue; }
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
            let is_container = matches!(node.kind, NodeKind::Frame | NodeKind::Group | NodeKind::Section);
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
        // Save current active page's nodes back before exporting
        let mut pages = self.pages.clone();
        if let Some(page) = pages.get_mut(self.active_page_index) {
            page.nodes = self.nodes.values().cloned().collect();
            page.root_children = self.root_children.clone();
        }
        SceneData {
            // Keep legacy fields populated for backward compat
            nodes: self.nodes.values().cloned().collect(),
            root_children: self.root_children.clone(),
            next_id: self.next_id,
            pages,
            active_page_index: self.active_page_index,
            next_page_id: self.next_page_id,
            comments: self.comments.clone(),
            next_comment_id: self.next_comment_id,
            variable_collections: self.variable_collections.clone(),
            next_collection_id: self.next_collection_id,
            variable_bindings: self.variable_bindings.clone(),
        }
    }

    pub fn import(data: SceneData) -> Self {
        if !data.pages.is_empty() {
            // Multi-page format
            let active = data.active_page_index.min(data.pages.len().saturating_sub(1));
            let mut nodes = HashMap::new();
            let root_children;
            if let Some(page) = data.pages.get(active) {
                for node in &page.nodes {
                    let mut n = node.clone();
                    n.normalize_fills();
                    n.normalize_strokes();
                    nodes.insert(n.id, n);
                }
                root_children = page.root_children.clone();
            } else {
                root_children = vec![];
            }
            let next_page_id = if data.next_page_id > 0 { data.next_page_id } else {
                data.pages.iter().map(|p| p.id).max().unwrap_or(0) + 1
            };
            let next_comment_id = if data.next_comment_id > 0 { data.next_comment_id } else {
                data.comments.iter().map(|c| c.id).max().unwrap_or(0) + 1
            };
            Self {
                nodes,
                root_children,
                next_id: data.next_id,
                selection: vec![],
                pages: {
                    let mut pages = data.pages;
                    for page in &mut pages {
                        for node in &mut page.nodes {
                            node.normalize_fills();
                            node.normalize_strokes();
                        }
                    }
                    pages
                },
                active_page_index: active,
                next_page_id,
                comments: data.comments,
                next_comment_id,
                variable_collections: data.variable_collections,
                next_collection_id: if data.next_collection_id > 0 { data.next_collection_id } else { 1 },
                variable_bindings: data.variable_bindings,
            }
        } else {
            // Legacy single-page format
            let mut nodes = HashMap::new();
            for node in &data.nodes {
                let mut n = node.clone();
                n.normalize_fills();
                n.normalize_strokes();
                nodes.insert(n.id, n);
            }
            let page = Page {
                id: 1,
                name: "Page 1".to_string(),
                nodes: data.nodes,
                root_children: data.root_children.clone(),
            };
            Self {
                nodes,
                root_children: data.root_children,
                next_id: data.next_id,
                selection: vec![],
                pages: vec![page],
                active_page_index: 0,
                next_page_id: 2,
                comments: vec![],
                next_comment_id: 1,
                variable_collections: vec![],
                next_collection_id: 1,
                variable_bindings: HashMap::new(),
            }
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

    // =============================================
    // Multi-page support
    // =============================================

    /// Save current active page's in-memory nodes back to the pages vec
    fn save_active_page(&mut self) {
        if let Some(page) = self.pages.get_mut(self.active_page_index) {
            page.nodes = self.nodes.values().cloned().collect();
            page.root_children = self.root_children.clone();
        }
    }

    /// Load a page's data into the active nodes/root_children
    fn load_page(&mut self, index: usize) {
        if let Some(page) = self.pages.get(index) {
            self.nodes.clear();
            for node in &page.nodes {
                self.nodes.insert(node.id, node.clone());
            }
            self.root_children = page.root_children.clone();
        }
    }

    pub fn add_page(&mut self, name: &str) -> u64 {
        self.save_active_page();
        let id = self.next_page_id;
        self.next_page_id += 1;
        self.pages.push(Page {
            id,
            name: name.to_string(),
            nodes: vec![],
            root_children: vec![],
        });
        id
    }

    pub fn remove_page(&mut self, page_id: u64) -> bool {
        if self.pages.len() <= 1 { return false; }
        let idx = match self.pages.iter().position(|p| p.id == page_id) {
            Some(i) => i,
            None => return false,
        };
        // If removing active page, switch first
        if idx == self.active_page_index {
            let new_idx = if idx > 0 { idx - 1 } else { 1 };
            self.save_active_page();
            self.pages.remove(idx);
            let new_active = new_idx.min(self.pages.len() - 1);
            self.active_page_index = new_active;
            self.load_page(new_active);
        } else {
            self.save_active_page();
            self.pages.remove(idx);
            // Adjust active index if needed
            if idx < self.active_page_index {
                self.active_page_index -= 1;
            }
        }
        self.selection.clear();
        true
    }

    pub fn rename_page(&mut self, page_id: u64, name: &str) {
        if let Some(page) = self.pages.iter_mut().find(|p| p.id == page_id) {
            page.name = name.to_string();
        }
    }

    pub fn set_active_page(&mut self, page_id: u64) -> bool {
        let idx = match self.pages.iter().position(|p| p.id == page_id) {
            Some(i) => i,
            None => return false,
        };
        if idx == self.active_page_index { return true; }
        self.save_active_page();
        self.active_page_index = idx;
        self.load_page(idx);
        self.selection.clear();
        true
    }

    pub fn duplicate_page(&mut self, page_id: u64) -> u64 {
        self.save_active_page();
        let src = match self.pages.iter().find(|p| p.id == page_id) {
            Some(p) => p.clone(),
            None => return 0,
        };
        let new_id = self.next_page_id;
        self.next_page_id += 1;
        self.pages.push(Page {
            id: new_id,
            name: format!("{} copy", src.name),
            nodes: src.nodes,
            root_children: src.root_children,
        });
        new_id
    }

    pub fn get_page_count(&self) -> usize {
        self.pages.len()
    }

    pub fn get_active_page_id(&self) -> u64 {
        self.pages.get(self.active_page_index).map(|p| p.id).unwrap_or(0)
    }

    pub fn get_pages_info(&self) -> Vec<(u64, String)> {
        self.pages.iter().map(|p| (p.id, p.name.clone())).collect()
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

    /// Select all visible, unlocked nodes (root level)
    pub fn select_all(&mut self) {
        self.selection.clear();
        for &id in &self.root_children {
            if let Some(node) = self.nodes.get(&id) {
                if node.visible && !node.locked {
                    self.selection.push(id);
                }
            }
        }
    }

    // =============================================
    // Comments / Annotations
    // =============================================

    pub fn add_comment(&mut self, x: f64, y: f64, author: &str, text: &str, node_id: Option<u64>) -> u64 {
        let id = self.next_comment_id;
        self.next_comment_id += 1;
        let page_id = self.pages.get(self.active_page_index).map(|p| p.id).unwrap_or(0);
        self.comments.push(Comment {
            id, x, y,
            author: author.to_string(),
            text: text.to_string(),
            timestamp: js_sys::Date::now() as u64,
            resolved: false,
            replies: vec![],
            node_id,
            page_id,
        });
        id
    }

    pub fn remove_comment(&mut self, comment_id: u64) -> bool {
        let len = self.comments.len();
        self.comments.retain(|c| c.id != comment_id);
        self.comments.len() < len
    }

    pub fn resolve_comment(&mut self, comment_id: u64, resolved: bool) {
        if let Some(c) = self.comments.iter_mut().find(|c| c.id == comment_id) {
            c.resolved = resolved;
        }
    }

    pub fn edit_comment(&mut self, comment_id: u64, text: &str) {
        if let Some(c) = self.comments.iter_mut().find(|c| c.id == comment_id) {
            c.text = text.to_string();
        }
    }

    pub fn add_reply(&mut self, comment_id: u64, author: &str, text: &str) -> u64 {
        let reply_id = self.next_comment_id;
        self.next_comment_id += 1;
        if let Some(c) = self.comments.iter_mut().find(|c| c.id == comment_id) {
            c.replies.push(CommentReply {
                id: reply_id,
                author: author.to_string(),
                text: text.to_string(),
                timestamp: js_sys::Date::now() as u64,
            });
        }
        reply_id
    }

    pub fn remove_reply(&mut self, comment_id: u64, reply_id: u64) -> bool {
        if let Some(c) = self.comments.iter_mut().find(|c| c.id == comment_id) {
            let len = c.replies.len();
            c.replies.retain(|r| r.id != reply_id);
            return c.replies.len() < len;
        }
        false
    }

    pub fn get_comments_for_page(&self) -> Vec<&Comment> {
        let page_id = self.pages.get(self.active_page_index).map(|p| p.id).unwrap_or(0);
        self.comments.iter().filter(|c| c.page_id == page_id).collect()
    }

    pub fn get_all_comments(&self) -> &[Comment] {
        &self.comments
    }

    pub fn get_comment(&self, comment_id: u64) -> Option<&Comment> {
        self.comments.iter().find(|c| c.id == comment_id)
    }

    // =============================================
    // Variable Collections
    // =============================================

    pub fn create_collection(&mut self, name: String) -> CollectionId {
        let id = self.next_collection_id;
        self.next_collection_id += 1;
        self.variable_collections.push(VariableCollection::new(id, name));
        id
    }

    pub fn delete_collection(&mut self, id: CollectionId) -> bool {
        let len = self.variable_collections.len();
        self.variable_collections.retain(|c| c.id != id);
        // Remove bindings referencing this collection
        self.variable_bindings.retain(|_, b| b.collection_id != id);
        self.variable_collections.len() < len
    }

    pub fn get_collection_mut(&mut self, id: CollectionId) -> Option<&mut VariableCollection> {
        self.variable_collections.iter_mut().find(|c| c.id == id)
    }

    pub fn get_collection(&self, id: CollectionId) -> Option<&VariableCollection> {
        self.variable_collections.iter().find(|c| c.id == id)
    }

    pub fn set_collection_scope(&mut self, id: CollectionId, scope: VariableScope) {
        if let Some(c) = self.get_collection_mut(id) {
            c.scope = scope;
        }
    }

    pub fn get_collection_scope(&self, id: CollectionId) -> Option<&VariableScope> {
        self.get_collection(id).map(|c| &c.scope)
    }

    /// Get ancestor node IDs (parent chain) for a given node
    fn get_ancestor_ids(&self, node_id: u64) -> Vec<u64> {
        let mut ancestors = Vec::new();
        let mut current = node_id;
        let mut guard = 0;
        while guard < 200 {
            guard += 1;
            if let Some(node) = self.nodes.get(&current) {
                if let Some(pid) = node.parent {
                    ancestors.push(pid);
                    current = pid;
                } else {
                    break;
                }
            } else {
                break;
            }
        }
        ancestors
    }

    /// Get the active page ID
    fn active_page_id(&self) -> u64 {
        self.pages.get(self.active_page_index).map(|p| p.id).unwrap_or(0)
    }

    /// Check if a binding's collection scope includes the given node
    fn is_binding_in_scope(&self, collection_id: CollectionId, node_id: u64) -> bool {
        let collection = match self.get_collection(collection_id) {
            Some(c) => c,
            None => return false,
        };
        match &collection.scope {
            VariableScope::Global => true,
            VariableScope::Pages(pages) => pages.contains(&self.active_page_id()),
            VariableScope::Nodes(nodes) => {
                let ancestors = self.get_ancestor_ids(node_id);
                collection.scope.contains(self.active_page_id(), node_id, &ancestors)
            }
        }
    }

    pub fn bind_variable(&mut self, node_id: u64, property: String, collection_id: CollectionId, variable_id: VariableId) {
        let key = format!("{}:{}", node_id, property);
        self.variable_bindings.insert(key, VariableBinding { collection_id, variable_id });
    }

    pub fn unbind_variable(&mut self, node_id: u64, property: &str) {
        let key = format!("{}:{}", node_id, property);
        self.variable_bindings.remove(&key);
    }

    pub fn resolve_binding(&self, node_id: u64, property: &str) -> Option<VariableValue> {
        let key = format!("{}:{}", node_id, property);
        let binding = self.variable_bindings.get(&key)?;
        let collection = self.get_collection(binding.collection_id)?;
        collection.resolve(binding.variable_id)
    }

    pub fn get_bindings_for_node(&self, node_id: u64) -> Vec<(String, VariableBinding)> {
        let prefix = format!("{}:", node_id);
        self.variable_bindings.iter()
            .filter(|(k, _)| k.starts_with(&prefix))
            .map(|(k, v)| (k[prefix.len()..].to_string(), v.clone()))
            .collect()
    }

    /// Apply all variable bindings with current active modes
    pub fn apply_variables(&mut self) {
        let bindings: Vec<(String, VariableBinding)> = self.variable_bindings.iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();

        for (key, binding) in bindings {
            // Parse key first to get node_id for scope check
            let parts: Vec<&str> = key.splitn(2, ':').collect();
            if parts.len() != 2 { continue; }
            let node_id: u64 = match parts[0].parse() {
                Ok(id) => id,
                Err(_) => continue,
            };

            // Check scope before resolving
            if !self.is_binding_in_scope(binding.collection_id, node_id) {
                continue;
            }

            let value = {
                let collection = match self.get_collection(binding.collection_id) {
                    Some(c) => c,
                    None => continue,
                };
                match collection.resolve(binding.variable_id) {
                    Some(v) => v,
                    None => continue,
                }
            };

            let property = parts[1];

            match (property, &value) {
                ("fill.0.color", VariableValue::Color(hex)) => {
                    if let Some(node) = self.nodes.get_mut(&node_id) {
                        if let Some(color) = parse_hex_color(hex) {
                            if node.fills.is_empty() {
                                node.fills.push(crate::node::Fill::solid(color));
                            } else {
                                node.fills[0] = crate::node::Fill::solid(color);
                            }
                        }
                    }
                }
                ("stroke.color", VariableValue::Color(hex)) => {
                    if let Some(node) = self.nodes.get_mut(&node_id) {
                        if let Some(color) = parse_hex_color(hex) {
                            if let Some(stroke) = node.strokes.first_mut() {
                                stroke.color = color;
                            }
                        }
                    }
                }
                ("opacity", VariableValue::Number(val)) => {
                    if let Some(node) = self.nodes.get_mut(&node_id) {
                        node.opacity = val.clamp(0.0, 1.0);
                    }
                }
                ("corner_radius", VariableValue::Number(val)) => {
                    if let Some(node) = self.nodes.get_mut(&node_id) {
                        node.corner_radius = val.max(0.0);
                    }
                }
                ("width", VariableValue::Number(val)) => {
                    if let Some(node) = self.nodes.get_mut(&node_id) {
                        node.width = val.max(1.0);
                    }
                }
                ("height", VariableValue::Number(val)) => {
                    if let Some(node) = self.nodes.get_mut(&node_id) {
                        node.height = val.max(1.0);
                    }
                }
                ("visible", VariableValue::Boolean(val)) => {
                    if let Some(node) = self.nodes.get_mut(&node_id) {
                        node.visible = *val;
                    }
                }
                _ => {}
            }
        }
    }

    // =============================================
    // Conditional Visibility
    // =============================================

    /// Check if a node is effectively visible (considering both `visible` flag and conditional visibility)
    pub fn is_effectively_visible(&self, node_id: NodeId) -> bool {
        let node = match self.nodes.get(&node_id) {
            Some(n) => n,
            None => return false,
        };
        if !node.visible { return false; }
        if let Some(ref cond) = node.conditional_visibility {
            if let Some(collection) = self.get_collection(cond.collection_id) {
                if let Some(resolved) = collection.resolve(cond.variable_id) {
                    return cond.evaluate(&resolved);
                }
            }
            // If collection/variable not found, treat as visible
        }
        true
    }

    // =============================================
    // Bookmarks
    // =============================================

    pub fn toggle_bookmark(&mut self, id: NodeId) -> bool {
        if let Some(node) = self.nodes.get_mut(&id) {
            node.bookmarked = !node.bookmarked;
            node.bookmarked
        } else {
            false
        }
    }

    pub fn is_bookmarked(&self, id: NodeId) -> bool {
        self.nodes.get(&id).map(|n| n.bookmarked).unwrap_or(false)
    }

    pub fn get_bookmarked_nodes(&self) -> Vec<(NodeId, String)> {
        self.nodes.values()
            .filter(|n| n.bookmarked)
            .map(|n| (n.id, n.name.clone()))
            .collect()
    }

    /// Get bookmarked nodes across all pages
    pub fn get_all_bookmarked_nodes(&self) -> Vec<(u64, NodeId, String, String)> {
        let mut result = Vec::new();
        // Current page
        let current_page_id = self.pages.get(self.active_page_index).map(|p| p.id).unwrap_or(0);
        let current_page_name = self.pages.get(self.active_page_index).map(|p| p.name.clone()).unwrap_or_default();
        for node in self.nodes.values() {
            if node.bookmarked {
                result.push((current_page_id, node.id, node.name.clone(), current_page_name.clone()));
            }
        }
        // Other pages
        for (i, page) in self.pages.iter().enumerate() {
            if i == self.active_page_index { continue; }
            for node in &page.nodes {
                if node.bookmarked {
                    result.push((page.id, node.id, node.name.clone(), page.name.clone()));
                }
            }
        }
        result
    }

    /// Batch rename nodes by IDs.
    /// pattern: use `{name}` for original name, `{n}` for sequential number, `{N}` for zero-padded number
    /// Example: "{name} - {n}" with ids [a,b,c] starting at 1 → "Rect - 1", "Ellipse - 2", "Text - 3"
    pub fn batch_rename(&mut self, ids: &[NodeId], pattern: &str, start_num: u32) {
        let pad_width = ((ids.len() as f64).log10().floor() as usize) + 1;
        for (i, &id) in ids.iter().enumerate() {
            let num = start_num as usize + i;
            if let Some(node) = self.get_node_mut(id) {
                let original = node.name.clone();
                let new_name = pattern
                    .replace("{name}", &original)
                    .replace("{N}", &format!("{:0>width$}", num, width = pad_width))
                    .replace("{n}", &num.to_string());
                node.name = new_name;
            }
        }
    }
}
