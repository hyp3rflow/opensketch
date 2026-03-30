use serde::Serialize;
use std::collections::{HashMap, HashSet};
use crate::node::{Node, NodeId, NodeKind};
use crate::component::ComponentStore;
use crate::scene::Scene;

#[derive(Clone, Debug, Serialize, PartialEq)]
pub enum EdgeType {
    ComponentInstance,
    Connector,
    Interaction,
    Comment,
}

#[derive(Clone, Debug, Serialize)]
pub struct DependencyEdge {
    pub from_id: u64,
    pub to_id: u64,
    pub edge_type: EdgeType,
}

impl Scene {
    /// Collect all dependency edges from current active page nodes + comments.
    pub fn get_dependency_graph(&self, components: &ComponentStore) -> Vec<DependencyEdge> {
        let mut edges = Vec::new();

        // Iterate all nodes
        for node in self.nodes.values() {
            Self::collect_node_edges(node, &self.nodes, components, &mut edges);
        }

        // Comments referencing nodes
        for comment in self.get_all_comments() {
            if let Some(nid) = comment.node_id {
                if nid != 0 {
                    edges.push(DependencyEdge {
                        from_id: comment.id,
                        to_id: nid,
                        edge_type: EdgeType::Comment,
                    });
                }
            }
        }

        edges
    }

    fn collect_node_edges(node: &Node, _all_nodes: &HashMap<NodeId, Node>, _components: &ComponentStore, edges: &mut Vec<DependencyEdge>) {
        let nid = node.id;

        match &node.kind {
            NodeKind::Instance(inst) => {
                if inst.component_id != 0 {
                    edges.push(DependencyEdge {
                        from_id: nid,
                        to_id: inst.component_id,
                        edge_type: EdgeType::ComponentInstance,
                    });
                }
            }
            NodeKind::Connector { start_node_id, end_node_id, .. } => {
                if *start_node_id != 0 {
                    edges.push(DependencyEdge {
                        from_id: nid,
                        to_id: *start_node_id,
                        edge_type: EdgeType::Connector,
                    });
                }
                if *end_node_id != 0 {
                    edges.push(DependencyEdge {
                        from_id: nid,
                        to_id: *end_node_id,
                        edge_type: EdgeType::Connector,
                    });
                }
            }
            _ => {}
        }

        // Interactions
        for interaction in &node.interactions {
            if interaction.target_node_id != 0 {
                edges.push(DependencyEdge {
                    from_id: nid,
                    to_id: interaction.target_node_id,
                    edge_type: EdgeType::Interaction,
                });
            }
        }
    }

    /// Get edges involving a specific node (as source or target).
    pub fn get_dependencies_for(&self, node_id: u64, components: &ComponentStore) -> Vec<DependencyEdge> {
        let all = self.get_dependency_graph(components);
        all.into_iter()
            .filter(|e| e.from_id == node_id || e.to_id == node_id)
            .collect()
    }
}

/// Detect cycles in the dependency graph using DFS.
pub fn detect_cycles(edges: &[DependencyEdge]) -> Vec<Vec<u64>> {
    // Build adjacency list
    let mut adj: HashMap<u64, Vec<u64>> = HashMap::new();
    let mut all_nodes: HashSet<u64> = HashSet::new();
    for e in edges {
        adj.entry(e.from_id).or_default().push(e.to_id);
        all_nodes.insert(e.from_id);
        all_nodes.insert(e.to_id);
    }

    let mut cycles = Vec::new();
    let mut visited = HashSet::new();
    let mut rec_stack = HashSet::new();
    let mut path = Vec::new();

    for &node in &all_nodes {
        if !visited.contains(&node) {
            dfs_cycles(node, &adj, &mut visited, &mut rec_stack, &mut path, &mut cycles);
        }
    }

    cycles
}

fn dfs_cycles(
    node: u64,
    adj: &HashMap<u64, Vec<u64>>,
    visited: &mut HashSet<u64>,
    rec_stack: &mut HashSet<u64>,
    path: &mut Vec<u64>,
    cycles: &mut Vec<Vec<u64>>,
) {
    visited.insert(node);
    rec_stack.insert(node);
    path.push(node);

    if let Some(neighbors) = adj.get(&node) {
        for &next in neighbors {
            if !visited.contains(&next) {
                dfs_cycles(next, adj, visited, rec_stack, path, cycles);
            } else if rec_stack.contains(&next) {
                // Found a cycle: extract from path
                if let Some(pos) = path.iter().position(|&n| n == next) {
                    let cycle: Vec<u64> = path[pos..].to_vec();
                    cycles.push(cycle);
                }
            }
        }
    }

    path.pop();
    rec_stack.remove(&node);
}
