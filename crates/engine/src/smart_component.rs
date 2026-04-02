//! Smart Component Suggestions — detects repeating visual patterns
//! and suggests extracting them as reusable components.

use crate::types::ColorSpace;
use crate::node::{Node, NodeId, NodeKind};
use crate::scene::Scene;
use serde::Serialize;
use std::collections::HashMap;

/// A suggested component extraction
#[derive(Debug, Clone, Serialize)]
pub struct ComponentSuggestion {
    /// Human-readable name for the suggestion
    pub name: String,
    /// Why this was suggested
    pub reason: String,
    /// Node IDs that form instances of this pattern
    pub groups: Vec<Vec<NodeId>>,
    /// How many instances were found
    pub instance_count: usize,
    /// Confidence score 0.0–1.0
    pub confidence: f64,
    /// Suggested component name
    pub suggested_name: String,
}

/// Fingerprint of a node subtree for structural comparison
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
struct StructuralFingerprint {
    kind_tag: String,
    child_count: usize,
    child_fingerprints: Vec<StructuralFingerprint>,
}

impl Scene {
    /// Analyze the scene and return smart component suggestions
    pub fn suggest_components(&self) -> Vec<ComponentSuggestion> {
        let mut suggestions = Vec::new();

        // Strategy 1: Structural duplicates — subtrees with identical structure
        self.find_structural_duplicates(&mut suggestions);

        // Strategy 2: Sibling pattern repetition — repeated child patterns in frames
        self.find_sibling_patterns(&mut suggestions);

        // Strategy 3: Visual similarity — nodes with same kind + similar size + same style
        self.find_visual_clones(&mut suggestions);

        // Sort by confidence descending
        suggestions.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal));

        // Deduplicate: remove suggestions where all groups are subsets of a higher-confidence one
        self.deduplicate_suggestions(&mut suggestions);

        suggestions
    }

    fn fingerprint_node(&self, id: NodeId, depth: usize) -> Option<StructuralFingerprint> {
        if depth > 10 { return None; }
        let node = self.get_node(id)?;
        let kind_tag = node.kind_name().to_string();
        let mut child_fps = Vec::new();
        for &cid in &node.children {
            if let Some(fp) = self.fingerprint_node(cid, depth + 1) {
                child_fps.push(fp);
            }
        }
        Some(StructuralFingerprint {
            kind_tag,
            child_count: child_fps.len(),
            child_fingerprints: child_fps,
        })
    }

    /// Strategy 1: Find subtrees with identical structural fingerprints
    fn find_structural_duplicates(&self, suggestions: &mut Vec<ComponentSuggestion>) {
        let mut fp_map: HashMap<StructuralFingerprint, Vec<NodeId>> = HashMap::new();

        for node in self.all_nodes() {
            // Only consider nodes with children (non-leaf, non-trivial)
            if node.children.is_empty() { continue; }
            // Skip top-level root
            if node.parent.is_none() { continue; }
            // Must be Instance-free (we want to suggest NEW components, not existing ones)
            if matches!(node.kind, NodeKind::Instance(_)) { continue; }

            if let Some(fp) = self.fingerprint_node(node.id, 0) {
                // Only interesting if the subtree has at least 2 children
                if fp.child_count >= 2 {
                    fp_map.entry(fp).or_default().push(node.id);
                }
            }
        }

        for (fp, ids) in &fp_map {
            if ids.len() >= 2 {
                let sample_name = self.get_node(ids[0])
                    .map(|n| n.name.clone())
                    .unwrap_or_else(|| "Group".to_string());

                let confidence = self.calc_structural_confidence(ids, fp);
                if confidence < 0.4 { continue; }

                let groups: Vec<Vec<NodeId>> = ids.iter().map(|&id| vec![id]).collect();
                suggestions.push(ComponentSuggestion {
                    name: format!("Repeated structure: \"{}\" ({}×)", sample_name, ids.len()),
                    reason: format!(
                        "Found {} nodes with identical structure ({} with {} children each)",
                        ids.len(), fp.kind_tag, fp.child_count
                    ),
                    instance_count: ids.len(),
                    groups,
                    confidence,
                    suggested_name: self.derive_component_name(&sample_name),
                });
            }
        }
    }

    /// Strategy 2: Repeated child patterns within a single Frame
    fn find_sibling_patterns(&self, suggestions: &mut Vec<ComponentSuggestion>) {
        for node in self.all_nodes() {
            if !matches!(node.kind, NodeKind::Frame) { continue; }
            if node.children.len() < 3 { continue; }

            // Check if children share the same fingerprint
            let mut child_fp_map: HashMap<StructuralFingerprint, Vec<NodeId>> = HashMap::new();
            for &cid in &node.children {
                if let Some(fp) = self.fingerprint_node(cid, 0) {
                    child_fp_map.entry(fp).or_default().push(cid);
                }
            }

            for (fp, ids) in &child_fp_map {
                if ids.len() >= 3 {
                    let sample_name = self.get_node(ids[0])
                        .map(|n| n.name.clone())
                        .unwrap_or_else(|| "Item".to_string());
                    let parent_name = node.name.clone();

                    let confidence = 0.6 + (ids.len() as f64 / node.children.len() as f64) * 0.3;
                    let confidence = confidence.min(0.95);

                    if fp.child_count == 0 && fp.kind_tag == "Rect" { continue; } // Skip trivial rects

                    suggestions.push(ComponentSuggestion {
                        name: format!("List item in \"{}\": \"{}\" ({}×)", parent_name, sample_name, ids.len()),
                        reason: format!(
                            "Frame \"{}\" has {} children with identical structure — likely a list/grid item",
                            parent_name, ids.len()
                        ),
                        instance_count: ids.len(),
                        groups: ids.iter().map(|&id| vec![id]).collect(),
                        confidence,
                        suggested_name: self.derive_component_name(&sample_name),
                    });
                }
            }
        }
    }

    /// Strategy 3: Visually similar leaf nodes (same kind + similar dimensions + same fill)
    fn find_visual_clones(&self, suggestions: &mut Vec<ComponentSuggestion>) {
        #[derive(Hash, PartialEq, Eq)]
        struct VisualKey {
            kind: String,
            w_bucket: i32,
            h_bucket: i32,
            fill_hex: String,
            child_count: usize,
        }

        let bucket = |v: f64| -> i32 { (v / 8.0).round() as i32 }; // 8px buckets

        let mut visual_map: HashMap<VisualKey, Vec<NodeId>> = HashMap::new();

        for node in self.all_nodes() {
            if node.parent.is_none() { continue; }
            if matches!(node.kind, NodeKind::Instance(_)) { continue; }
            // Include nodes with children (Frame/Group patterns)
            if node.children.is_empty() && !matches!(node.kind, NodeKind::Frame | NodeKind::Group) {
                // Leaf nodes — skip plain rects without meaningful structure
                if node.width < 10.0 && node.height < 10.0 { continue; }
            }

            let fill_hex = node.fills.first()
                .map(|f| format!("{:?}", f.fill_type))
                .unwrap_or_default();

            let key = VisualKey {
                kind: node.kind_name().to_string(),
                w_bucket: bucket(node.width),
                h_bucket: bucket(node.height),
                fill_hex,
                child_count: node.children.len(),
            };

            visual_map.entry(key).or_default().push(node.id);
        }

        for (key, ids) in &visual_map {
            if ids.len() < 3 { continue; }
            // Must have children to be interesting as a component
            if key.child_count == 0 { continue; }

            let sample_name = self.get_node(ids[0])
                .map(|n| n.name.clone())
                .unwrap_or_else(|| "Element".to_string());

            let confidence = 0.3 + (ids.len() as f64).min(10.0) * 0.05;

            suggestions.push(ComponentSuggestion {
                name: format!("Visual pattern: \"{}\" ({}×)", sample_name, ids.len()),
                reason: format!(
                    "Found {} {} nodes with similar size (~{}×{}) and {} children",
                    ids.len(), key.kind, key.w_bucket * 8, key.h_bucket * 8, key.child_count
                ),
                instance_count: ids.len(),
                groups: ids.iter().map(|&id| vec![id]).collect(),
                confidence,
                suggested_name: self.derive_component_name(&sample_name),
            });
        }
    }

    fn calc_structural_confidence(&self, ids: &[NodeId], fp: &StructuralFingerprint) -> f64 {
        let base = 0.5;
        let count_bonus = (ids.len() as f64 - 1.0).min(5.0) * 0.08;
        let depth_bonus = if fp.child_count >= 3 { 0.1 } else { 0.0 };

        // Check if fills are also similar
        let mut fill_match_count = 0;
        if ids.len() >= 2 {
            let ref_fills: Vec<String> = self.get_node(ids[0])
                .map(|n| n.fills.iter().map(|f| format!("{:?}", f.fill_type)).collect())
                .unwrap_or_default();
            for &id in &ids[1..] {
                let fills: Vec<String> = self.get_node(id)
                    .map(|n| n.fills.iter().map(|f| format!("{:?}", f.fill_type)).collect())
                    .unwrap_or_default();
                if fills == ref_fills { fill_match_count += 1; }
            }
        }
        let fill_bonus = if ids.len() > 1 {
            (fill_match_count as f64 / (ids.len() - 1) as f64) * 0.15
        } else { 0.0 };

        (base + count_bonus + depth_bonus + fill_bonus).min(0.95)
    }

    fn derive_component_name(&self, sample_name: &str) -> String {
        // Clean up common suffixes like numbers, "Copy", etc.
        let name = sample_name
            .trim_end_matches(|c: char| c.is_ascii_digit() || c == ' ')
            .trim_end_matches("Copy")
            .trim_end_matches("copy")
            .trim();
        if name.is_empty() {
            "Component".to_string()
        } else {
            name.to_string()
        }
    }

    fn deduplicate_suggestions(&self, suggestions: &mut Vec<ComponentSuggestion>) {
        let mut keep = vec![true; suggestions.len()];
        for i in 0..suggestions.len() {
            if !keep[i] { continue; }
            let ids_i: std::collections::HashSet<NodeId> = suggestions[i].groups.iter().flatten().copied().collect();
            for j in (i + 1)..suggestions.len() {
                if !keep[j] { continue; }
                let ids_j: std::collections::HashSet<NodeId> = suggestions[j].groups.iter().flatten().copied().collect();
                if ids_j.is_subset(&ids_i) {
                    keep[j] = false;
                }
            }
        }
        let mut idx = 0;
        suggestions.retain(|_| { let k = keep[idx]; idx += 1; k });
    }
}
