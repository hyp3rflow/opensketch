use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use crate::node::{Node, NodeId};
use crate::scene::{Page, SceneData};

/// A snapshot of scene state for branching
#[derive(Clone, Serialize, Deserialize)]
pub struct BranchSnapshot {
    pub pages: Vec<Page>,
    pub active_page_index: usize,
    pub next_page_id: u64,
    pub next_id: NodeId,
}

/// A design branch for version control
#[derive(Clone, Serialize, Deserialize)]
pub struct Branch {
    pub id: u64,
    pub name: String,
    pub parent_branch_id: Option<u64>,
    pub created_at: f64, // js_sys::Date::now()
    pub base_snapshot: BranchSnapshot,
    /// Current working state (saved when switching away)
    pub current_snapshot: Option<BranchSnapshot>,
}

/// Diff result between base snapshot and current state
#[derive(Clone, Serialize, Deserialize)]
pub struct BranchDiff {
    pub added: Vec<DiffNode>,
    pub modified: Vec<DiffNode>,
    pub removed: Vec<DiffNode>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct DiffNode {
    pub id: NodeId,
    pub name: String,
}

impl BranchSnapshot {
    /// Collect all node IDs across all pages
    pub fn all_node_ids(&self) -> HashMap<NodeId, Node> {
        let mut map = HashMap::new();
        for page in &self.pages {
            for node in &page.nodes {
                map.insert(node.id, node.clone());
            }
        }
        map
    }
}

/// Compute diff between base snapshot and current snapshot
pub fn compute_diff(base: &BranchSnapshot, current: &BranchSnapshot) -> BranchDiff {
    let base_nodes = base.all_node_ids();
    let current_nodes = current.all_node_ids();

    let mut added = Vec::new();
    let mut modified = Vec::new();
    let mut removed = Vec::new();

    // Check for added and modified
    for (id, node) in &current_nodes {
        match base_nodes.get(id) {
            None => added.push(DiffNode { id: *id, name: node.name.clone() }),
            Some(base_node) => {
                // Compare by serialization (simple but effective)
                let cur_json = serde_json::to_string(node).unwrap_or_default();
                let base_json = serde_json::to_string(base_node).unwrap_or_default();
                if cur_json != base_json {
                    modified.push(DiffNode { id: *id, name: node.name.clone() });
                }
            }
        }
    }

    // Check for removed
    for (id, node) in &base_nodes {
        if !current_nodes.contains_key(id) {
            removed.push(DiffNode { id: *id, name: node.name.clone() });
        }
    }

    BranchDiff { added, modified, removed }
}

/// Merge source branch nodes into target branch snapshot
/// Strategy: add new nodes, update modified nodes from source
pub fn merge_snapshots(source: &BranchSnapshot, target: &mut BranchSnapshot) {
    let source_nodes = source.all_node_ids();
    
    // For each page in target, merge nodes from source
    // Strategy: iterate source pages, for each node either update existing or add
    for source_page in &source.pages {
        // Find matching page in target by id
        let target_page = target.pages.iter_mut().find(|p| p.id == source_page.id);
        if let Some(tp) = target_page {
            let mut target_node_map: HashMap<NodeId, usize> = HashMap::new();
            for (i, node) in tp.nodes.iter().enumerate() {
                target_node_map.insert(node.id, i);
            }
            for node in &source_page.nodes {
                if let Some(&idx) = target_node_map.get(&node.id) {
                    // Update existing node
                    tp.nodes[idx] = node.clone();
                } else {
                    // Add new node
                    tp.nodes.push(node.clone());
                    if node.parent.is_none() && !tp.root_children.contains(&node.id) {
                        tp.root_children.push(node.id);
                    }
                }
            }
        } else {
            // Source has a page that target doesn't — add it
            target.pages.push(source_page.clone());
        }
    }
    
    // Update next_id to max
    if source.next_id > target.next_id {
        target.next_id = source.next_id;
    }
    if source.next_page_id > target.next_page_id {
        target.next_page_id = source.next_page_id;
    }
}
