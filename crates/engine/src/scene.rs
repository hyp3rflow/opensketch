use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use crate::node::{Node, NodeId};
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
