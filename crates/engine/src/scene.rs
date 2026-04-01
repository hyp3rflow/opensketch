use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use crate::node::{Node, NodeId, NodeKind, ConstraintH, ConstraintV, Comment, CommentReply};
use crate::types::Point;
use crate::variable::{VariableCollection, VariableBinding, VariableScope, CollectionId, ModeId, VariableId, VariableValue};
use crate::token::TokenStore;

/// A responsive breakpoint preset with variable-mode mappings.
/// When the preview width matches this preset, variable collections
/// switch to their mapped modes automatically.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ResponsivePreset {
    pub id: u64,
    pub label: String,
    /// Viewport width for this preset
    pub width: f64,
    /// Optional viewport height (for preview)
    #[serde(default)]
    pub height: Option<f64>,
    /// Collection ID → Mode ID mapping: when this preset is active,
    /// switch each collection to the specified mode.
    #[serde(default)]
    pub mode_mappings: HashMap<u64, u64>,
}

/// Tracks the responsive preview state
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct ResponsiveState {
    /// Global breakpoint presets sorted by width ascending
    #[serde(default)]
    pub presets: Vec<ResponsivePreset>,
    #[serde(default)]
    pub next_preset_id: u64,
    /// Currently active preset id (0 = none / default)
    #[serde(default)]
    pub active_preset_id: u64,
}
use crate::types::Color;
use crate::animation::AnimationStore;
use crate::whiteboard::WhiteboardState;
use crate::branch::{Branch, BranchSnapshot, BranchDiff, VisualDiff, compute_diff, compute_visual_diff, merge_snapshots, ReviewRequest, ReviewComment, ReviewStatus};
use crate::component::ComponentLibrary;
use crate::stamp::{Stamp, StampKind};

/// An ephemeral annotation stroke (for review, auto-expires)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AnnotationStroke {
    pub id: u64,
    pub points: Vec<(f64, f64)>,
    pub color: String,
    pub width: f64,
    pub opacity: f64,
    pub created_at: f64,
}

/// Unit for persistent measure lines
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum MeasureUnit {
    Px,
    Rem,
    Percent,
}

impl Default for MeasureUnit {
    fn default() -> Self { MeasureUnit::Px }
}

/// A saved canvas view (position + zoom) that can be shared as a link
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ViewBookmark {
    pub id: u64,
    pub name: String,
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
    #[serde(default)]
    pub page_id: u64,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub created_at: f64,
    #[serde(default)]
    pub color: String,
}

/// A persistent measurement line placed on the canvas
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MeasureLine {
    pub id: u64,
    pub start_x: f64,
    pub start_y: f64,
    pub end_x: f64,
    pub end_y: f64,
    #[serde(default)]
    pub unit: MeasureUnit,
    #[serde(default)]
    pub label: String,
    #[serde(default = "default_true")]
    pub visible: bool,
    #[serde(default)]
    pub page_id: u64,
}

fn default_true() -> bool { true }

/// Canvas background pattern configuration
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CanvasBackground {
    /// Pattern type: "none", "grid", "dots", "lines", "cross"
    #[serde(default = "default_bg_pattern")]
    pub pattern: String,
    /// Background color (hex without #)
    #[serde(default = "default_bg_color")]
    pub bg_color: String,
    /// Pattern color (hex without #)
    #[serde(default = "default_pattern_color")]
    pub pattern_color: String,
    /// Grid/dot spacing in scene pixels
    #[serde(default = "default_bg_spacing")]
    pub spacing: f64,
    /// Pattern opacity 0.0-1.0
    #[serde(default = "default_bg_opacity")]
    pub opacity: f64,
    /// Dot radius (for dots pattern)
    #[serde(default = "default_dot_size")]
    pub dot_size: f64,
}

fn default_bg_pattern() -> String { "grid".to_string() }
fn default_bg_color() -> String { "1a1a1a".to_string() }
fn default_pattern_color() -> String { "ffffff".to_string() }
fn default_bg_spacing() -> f64 { 50.0 }
fn default_bg_opacity() -> f64 { 0.04 }
fn default_dot_size() -> f64 { 1.5 }

impl Default for CanvasBackground {
    fn default() -> Self {
        Self {
            pattern: default_bg_pattern(),
            bg_color: default_bg_color(),
            pattern_color: default_pattern_color(),
            spacing: default_bg_spacing(),
            opacity: default_bg_opacity(),
            dot_size: default_dot_size(),
        }
    }
}

pub fn parse_hex_color(hex: &str) -> Option<Color> {
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
    /// Animation clips
    #[serde(default)]
    pub animations: AnimationStore,
    /// Branches
    #[serde(default)]
    pub branches: Vec<Branch>,
    #[serde(default)]
    pub active_branch_id: u64,
    #[serde(default)]
    pub next_branch_id: u64,
    /// Linked component libraries
    #[serde(default)]
    pub linked_libraries: Vec<ComponentLibrary>,
    /// Responsive token presets
    #[serde(default)]
    pub responsive: ResponsiveState,
    /// Reviews
    #[serde(default)]
    pub reviews: Vec<ReviewRequest>,
    #[serde(default)]
    pub review_comments: Vec<ReviewComment>,
    #[serde(default)]
    pub next_review_id: u64,
    #[serde(default)]
    pub next_review_comment_id: u64,
    #[serde(default)]
    pub whiteboard_state: WhiteboardState,
    #[serde(default)]
    pub token_store: TokenStore,
    #[serde(default)]
    pub stamps: Vec<Stamp>,
    #[serde(default, rename = "next_stamp_id")]
    pub next_stamp_id: u64,
    #[serde(default)]
    pub canvas_background: CanvasBackground,
    #[serde(default)]
    pub measure_lines: Vec<MeasureLine>,
    #[serde(default)]
    pub next_measure_id: u64,
    #[serde(default)]
    pub view_bookmarks: Vec<ViewBookmark>,
    #[serde(default)]
    pub next_view_bookmark_id: u64,
    #[serde(default)]
    pub annotations: Vec<AnnotationStroke>,
    #[serde(default)]
    pub next_annotation_id: u64,
}

pub struct Scene {
    pub(crate) nodes: HashMap<NodeId, Node>,
    pub(crate) root_children: Vec<NodeId>,
    next_id: NodeId,
    pub selection: Vec<NodeId>,
    // Multi-page
    pub(crate) pages: Vec<Page>,
    pub(crate) active_page_index: usize,
    next_page_id: u64,
    // Comments
    comments: Vec<Comment>,
    next_comment_id: u64,
    // Variables
    pub variable_collections: Vec<VariableCollection>,
    next_collection_id: u64,
    pub variable_bindings: HashMap<String, VariableBinding>,
    // Animations
    pub animations: AnimationStore,
    // Branches
    pub(crate) branches: Vec<Branch>,
    pub(crate) active_branch_id: u64,
    next_branch_id: u64,
    // Linked component libraries
    pub linked_libraries: Vec<ComponentLibrary>,
    // Responsive token presets
    pub responsive: ResponsiveState,
    // Reviews
    pub(crate) reviews: Vec<ReviewRequest>,
    pub(crate) review_comments: Vec<ReviewComment>,
    next_review_id: u64,
    next_review_comment_id: u64,
    pub whiteboard_state: WhiteboardState,
    pub token_store: TokenStore,
    // Stamps
    stamps: Vec<Stamp>,
    next_stamp_id: u64,
    // Canvas background
    pub canvas_background: CanvasBackground,
    // Persistent measure lines
    measure_lines: Vec<MeasureLine>,
    next_measure_id: u64,
    // View bookmarks
    view_bookmarks: Vec<ViewBookmark>,
    next_view_bookmark_id: u64,
    // Ephemeral annotation strokes
    annotations: Vec<AnnotationStroke>,
    next_annotation_id: u64,
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
            animations: AnimationStore::new(),
            branches: vec![Branch {
                id: 1,
                name: "main".to_string(),
                parent_branch_id: None,
                created_at: 0.0,
                base_snapshot: BranchSnapshot {
                    pages: vec![Page { id: 1, name: "Page 1".to_string(), nodes: vec![], root_children: vec![] }],
                    active_page_index: 0,
                    next_page_id: 2,
                    next_id: 1,
                },
                current_snapshot: None,
            }],
            active_branch_id: 1,
            next_branch_id: 2,
            linked_libraries: vec![],
            responsive: ResponsiveState::default(),
            reviews: vec![],
            review_comments: vec![],
            next_review_id: 1,
            next_review_comment_id: 1,
            whiteboard_state: WhiteboardState::default(),
            token_store: TokenStore::new(),
            stamps: vec![],
            next_stamp_id: 1,
            canvas_background: CanvasBackground::default(),
            measure_lines: vec![],
            next_measure_id: 1,
            view_bookmarks: vec![],
            next_view_bookmark_id: 1,
            annotations: vec![],
            next_annotation_id: 1,
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

    /// Add a node with its existing ID (no reassignment). Used by playground.
    pub fn add_node_direct(&mut self, node: Node) {
        let id = node.id;
        if id >= self.next_id {
            self.next_id = id + 1;
        }
        if node.parent.is_none() && !self.root_children.contains(&id) {
            // Don't add to root_children for playground temp nodes
        }
        self.nodes.insert(id, node);
    }

    /// Return the next available node id
    pub fn next_id(&mut self) -> NodeId {
        let id = self.next_id;
        self.next_id += 1;
        id
    }

    /// Collect all ids in a subtree (including root)
    pub fn collect_subtree_ids(&self, root_id: NodeId) -> Vec<NodeId> {
        let mut result = vec![];
        let mut stack = vec![root_id];
        while let Some(id) = stack.pop() {
            result.push(id);
            if let Some(node) = self.nodes.get(&id) {
                for &child in &node.children {
                    stack.push(child);
                }
            }
        }
        result
    }

    pub fn get_node(&self, id: NodeId) -> Option<&Node> {
        self.nodes.get(&id)
    }

    pub fn get_node_mut(&mut self, id: NodeId) -> Option<&mut Node> {
        self.nodes.get_mut(&id)
    }

    pub fn nodes_map(&self) -> &HashMap<NodeId, Node> {
        &self.nodes
    }

    pub fn nodes_map_mut(&mut self) -> &mut HashMap<NodeId, Node> {
        &mut self.nodes
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

    /// Returns IDs of nodes whose bounds intersect the given viewport rectangle.
    pub fn get_visible_node_ids(&self, vx: f64, vy: f64, vw: f64, vh: f64) -> Vec<NodeId> {
        let vx2 = vx + vw;
        let vy2 = vy + vh;
        let mut result = vec![];
        for &id in &self.render_order() {
            if let Some(node) = self.nodes.get(&id) {
                if !self.is_effectively_visible(id) { continue; }
                let nx = node.x;
                let ny = node.y;
                let nx2 = node.x + node.width;
                let ny2 = node.y + node.height;
                if nx < vx2 && nx2 > vx && ny < vy2 && ny2 > vy {
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

    /// Apply responsive variant rules to Instance children of a frame.
    /// For each child Instance with responsive_rules, check parent width
    /// and switch to the matching variant (smallest max_width that is >= parent width).
    /// Returns the number of instances that were switched.
    pub fn apply_responsive_variants(&mut self, frame_id: NodeId) -> u32 {
        let frame_width = match self.nodes.get(&frame_id) {
            Some(n) => n.width,
            None => return 0,
        };
        let children: Vec<NodeId> = match self.nodes.get(&frame_id) {
            Some(n) => n.children.clone(),
            None => return 0,
        };

        let mut switched = 0u32;
        for child_id in children {
            let target_key = {
                let child = match self.nodes.get(&child_id) {
                    Some(n) => n,
                    None => continue,
                };
                let inst = match &child.kind {
                    crate::node::NodeKind::Instance(data) => data,
                    _ => continue,
                };
                if inst.responsive_rules.is_empty() { continue; }

                // Sort rules by max_width ascending, pick the first one where frame_width <= max_width
                let mut sorted_rules: Vec<_> = inst.responsive_rules.iter().collect();
                sorted_rules.sort_by(|a, b| a.max_width.partial_cmp(&b.max_width).unwrap_or(std::cmp::Ordering::Equal));

                let mut target: Option<crate::component::VariantKey> = None;
                for rule in &sorted_rules {
                    if frame_width <= rule.max_width {
                        target = Some(rule.variant_key.clone());
                        break;
                    }
                }
                // If no rule matches (frame is wider than all breakpoints), keep current
                match target {
                    Some(k) => k,
                    None => continue,
                }
            };

            // Switch variant
            if let Some(child) = self.nodes.get_mut(&child_id) {
                if let crate::node::NodeKind::Instance(ref mut data) = child.kind {
                    if data.variant_values != target_key {
                        data.variant_values = target_key;
                        switched += 1;
                    }
                }
            }
        }
        switched
    }

    /// Scale a node proportionally: resize + scale all visual properties
    /// (font size, corner radius, stroke widths, shadow offsets/blur, padding, gap, etc.)
    /// scale_x/scale_y are the ratio of new size / old size.
    pub fn scale_node_proportional(&mut self, id: NodeId, scale_x: f64, scale_y: f64) {
        let scale = (scale_x + scale_y) / 2.0; // uniform scale factor for non-directional props
        if let Some(node) = self.nodes.get_mut(&id) {
            // Scale size
            node.width = (node.width * scale_x).max(1.0);
            node.height = (node.height * scale_y).max(1.0);

            // Scale corner radius
            if node.corner_radius > 0.0 {
                node.corner_radius = (node.corner_radius * scale).max(0.0);
            }

            // Scale strokes
            for stroke in &mut node.strokes {
                stroke.width *= scale;
                if !stroke.dash_array.is_empty() {
                    for d in &mut stroke.dash_array {
                        *d *= scale;
                    }
                    stroke.dash_offset *= scale;
                }
            }

            // Scale shadows
            for shadow in &mut node.shadows {
                shadow.offset_x *= scale_x;
                shadow.offset_y *= scale_y;
                shadow.blur *= scale;
                shadow.spread *= scale;
            }

            // Scale blur
            if node.blur > 0.0 {
                node.blur *= scale;
            }

            // Scale text properties
            if let NodeKind::Text { ref mut font_size, ref mut line_height, ref mut letter_spacing, ref mut paragraph_spacing, ref mut text_indent, .. } = node.kind {
                *font_size = (*font_size * scale).max(1.0);
                *line_height *= scale;
                *letter_spacing *= scale;
                *paragraph_spacing *= scale;
                *text_indent *= scale;
            }

            // Scale layout padding and gap
            if node.layout.mode != crate::node::LayoutMode::None {
                node.layout.gap *= scale;
                node.layout.padding_top *= scale;
                node.layout.padding_right *= scale;
                node.layout.padding_bottom *= scale;
                node.layout.padding_left *= scale;
            }

            // Scale min/max constraints
            if let Some(ref mut v) = node.min_width { *v *= scale_x; }
            if let Some(ref mut v) = node.max_width { *v *= scale_x; }
            if let Some(ref mut v) = node.min_height { *v *= scale_y; }
            if let Some(ref mut v) = node.max_height { *v *= scale_y; }
        }

        // Recursively scale children (position offset relative to parent + size)
        let children: Vec<NodeId> = self.nodes.get(&id).map(|n| n.children.clone()).unwrap_or_default();
        let (parent_x, parent_y) = self.nodes.get(&id).map(|n| (n.x, n.y)).unwrap_or((0.0, 0.0));
        // We need the old parent position before scale - but we already scaled.
        // Actually we need to reposition children. Let's compute offsets.
        for &cid in &children {
            if let Some(child) = self.nodes.get(&cid) {
                let local_x = child.x - parent_x;
                let local_y = child.y - parent_y;
                let new_local_x = local_x * scale_x;
                let new_local_y = local_y * scale_y;
                let new_x = parent_x + new_local_x;
                let new_y = parent_y + new_local_y;
                // Store before recursive call
                let old_w = child.width;
                let old_h = child.height;
                if let Some(c) = self.nodes.get_mut(&cid) {
                    c.x = new_x;
                    c.y = new_y;
                }
                // Recursively scale child with its own scale factors
                let child_sx = if old_w > 0.0 { (old_w * scale_x) / old_w } else { scale_x };
                let child_sy = if old_h > 0.0 { (old_h * scale_y) / old_h } else { scale_y };
                self.scale_node_proportional(cid, child_sx, child_sy);
            }
        }
    }

    /// Get the aspect ratio of a node (width / height). Returns None if height is 0.
    pub fn get_node_aspect_ratio(&self, id: NodeId) -> Option<f64> {
        self.nodes.get(&id).and_then(|n| {
            if n.height > 0.0 { Some(n.width / n.height) } else { None }
        })
    }

    /// Check if a node is an Image node
    pub fn is_image_node(&self, id: NodeId) -> bool {
        self.nodes.get(&id).map(|n| matches!(n.kind, NodeKind::Image { .. })).unwrap_or(false)
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
            animations: self.animations.clone(),
            branches: self.branches.clone(),
            active_branch_id: self.active_branch_id,
            next_branch_id: self.next_branch_id,
            linked_libraries: self.linked_libraries.clone(),
            responsive: self.responsive.clone(),
            reviews: self.reviews.clone(),
            review_comments: self.review_comments.clone(),
            next_review_id: self.next_review_id,
            next_review_comment_id: self.next_review_comment_id,
            whiteboard_state: self.whiteboard_state.clone(),
            token_store: self.token_store.clone(),
            stamps: self.stamps.clone(),
            next_stamp_id: self.next_stamp_id,
            canvas_background: self.canvas_background.clone(),
            measure_lines: self.measure_lines.clone(),
            next_measure_id: self.next_measure_id,
            view_bookmarks: self.view_bookmarks.clone(),
            next_view_bookmark_id: self.next_view_bookmark_id,
            annotations: self.annotations.clone(),
            next_annotation_id: self.next_annotation_id,
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
                animations: data.animations,
                branches: if data.branches.is_empty() {
                    vec![Branch {
                        id: 1,
                        name: "main".to_string(),
                        parent_branch_id: None,
                        created_at: 0.0,
                        base_snapshot: BranchSnapshot {
                            pages: vec![],
                            active_page_index: 0,
                            next_page_id: 1,
                            next_id: 1,
                        },
                        current_snapshot: None,
                    }]
                } else {
                    data.branches
                },
                active_branch_id: if data.active_branch_id > 0 { data.active_branch_id } else { 1 },
                next_branch_id: if data.next_branch_id > 0 { data.next_branch_id } else { 2 },
                linked_libraries: data.linked_libraries,
                responsive: data.responsive,
                reviews: data.reviews.clone(),
                review_comments: data.review_comments.clone(),
                next_review_id: if data.next_review_id > 0 { data.next_review_id } else { 1 },
                next_review_comment_id: if data.next_review_comment_id > 0 { data.next_review_comment_id } else { 1 },
                whiteboard_state: data.whiteboard_state.clone(),
                token_store: data.token_store.clone(),
                stamps: data.stamps.clone(),
                next_stamp_id: if data.next_stamp_id > 0 { data.next_stamp_id } else { 1 },
                canvas_background: data.canvas_background.clone(),
                measure_lines: data.measure_lines.clone(),
                next_measure_id: if data.next_measure_id > 0 { data.next_measure_id } else { 1 },
                view_bookmarks: data.view_bookmarks.clone(),
                next_view_bookmark_id: if data.next_view_bookmark_id > 0 { data.next_view_bookmark_id } else { 1 },
                annotations: data.annotations.clone(),
                next_annotation_id: if data.next_annotation_id > 0 { data.next_annotation_id } else { 1 },
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
                animations: AnimationStore::new(),
                branches: vec![Branch {
                    id: 1,
                    name: "main".to_string(),
                    parent_branch_id: None,
                    created_at: 0.0,
                    base_snapshot: BranchSnapshot {
                        pages: vec![],
                        active_page_index: 0,
                        next_page_id: 1,
                        next_id: 1,
                    },
                    current_snapshot: None,
                }],
                active_branch_id: 1,
                next_branch_id: 2,
                linked_libraries: vec![],
                responsive: ResponsiveState::default(),
                reviews: vec![],
                review_comments: vec![],
                next_review_id: 1,
                next_review_comment_id: 1,
                whiteboard_state: data.whiteboard_state.clone(),
                token_store: data.token_store.clone(),
                stamps: data.stamps.clone(),
                next_stamp_id: if data.next_stamp_id > 0 { data.next_stamp_id } else { 1 },
                canvas_background: data.canvas_background.clone(),
                measure_lines: data.measure_lines.clone(),
                next_measure_id: if data.next_measure_id > 0 { data.next_measure_id } else { 1 },
                view_bookmarks: data.view_bookmarks.clone(),
                next_view_bookmark_id: if data.next_view_bookmark_id > 0 { data.next_view_bookmark_id } else { 1 },
                annotations: data.annotations.clone(),
                next_annotation_id: if data.next_annotation_id > 0 { data.next_annotation_id } else { 1 },
            }
        }
    }

    /// Apply all token bindings from the active theme to bound nodes
    pub fn apply_token_theme(&mut self) {
        use crate::token::{TokenProperty, TokenValue};
        use crate::node::Fill;
        use crate::types::Color;

        let bindings = self.token_store.bindings.clone();
        for binding in &bindings {
            let value = self.token_store.resolve(&binding.token_name).cloned();
            if let Some(value) = value {
                if let Some(node) = self.nodes.get_mut(&binding.node_id) {
                    match &binding.property {
                        TokenProperty::Fill => {
                            if let TokenValue::Color(hex) = &value {
                                if let Some(color) = parse_hex_color(hex) {
                                    if node.fills.is_empty() {
                                        node.fills.push(Fill::solid(color));
                                    } else {
                                        node.fills[0] = Fill::solid(color);
                                    }
                                }
                            }
                        }
                        TokenProperty::Stroke => {
                            if let TokenValue::Color(hex) = &value {
                                if let Some(color) = parse_hex_color(hex) {
                                    if !node.strokes.is_empty() {
                                        node.strokes[0].color = color;
                                    }
                                }
                            }
                        }
                        TokenProperty::Opacity => {
                            if let TokenValue::Number(n) = &value {
                                node.opacity = *n;
                            }
                        }
                        TokenProperty::CornerRadius => {
                            if let TokenValue::Number(n) = &value {
                                node.corner_radius = *n;
                            }
                        }
                    }
                }
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

    /// Snap all nodes to pixel grid (round x/y/width/height to integers).
    /// Returns the number of nodes modified.
    pub fn snap_to_pixels(&mut self) -> u32 {
        let mut count = 0u32;
        let ids: Vec<NodeId> = self.nodes.keys().copied().collect();
        for id in ids {
            if let Some(node) = self.nodes.get_mut(&id) {
                let ox = node.x;
                let oy = node.y;
                let ow = node.width;
                let oh = node.height;
                node.x = node.x.round();
                node.y = node.y.round();
                node.width = node.width.round().max(1.0);
                node.height = node.height.round().max(1.0);
                if (node.x - ox).abs() > 0.001
                    || (node.y - oy).abs() > 0.001
                    || (node.width - ow).abs() > 0.001
                    || (node.height - oh).abs() > 0.001
                {
                    count += 1;
                }
            }
        }
        count
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

    /// Distribute nodes with a specific spacing value along an axis.
    /// Sorts by position, places first node at its current position, then spaces others by `spacing`.
    pub fn distribute_with_spacing(&mut self, ids: &[NodeId], axis: &str, spacing: f64) {
        if ids.len() < 2 { return; }
        let spacing = spacing.max(0.0);
        match axis {
            "horizontal" => {
                let mut items: Vec<(NodeId, f64, f64)> = ids.iter()
                    .filter_map(|&id| self.nodes.get(&id).map(|n| (id, n.x, n.width)))
                    .collect();
                items.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
                let mut cursor = items[0].1;
                for (id, _, w) in &items {
                    if let Some(node) = self.nodes.get_mut(id) { node.x = cursor; }
                    cursor += w + spacing;
                }
            }
            "vertical" => {
                let mut items: Vec<(NodeId, f64, f64)> = ids.iter()
                    .filter_map(|&id| self.nodes.get(&id).map(|n| (id, n.y, n.height)))
                    .collect();
                items.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
                let mut cursor = items[0].1;
                for (id, _, h) in &items {
                    if let Some(node) = self.nodes.get_mut(id) { node.y = cursor; }
                    cursor += h + spacing;
                }
            }
            _ => {}
        }
    }

    /// Get spacing info between sorted nodes. Returns JSON: { axis, gaps: [f64], uniform: bool, avg_gap: f64 }
    pub fn get_spacing_between(&self, ids: &[NodeId], axis: &str) -> String {
        if ids.len() < 2 { return "{}".to_string(); }
        let gaps: Vec<f64> = match axis {
            "horizontal" => {
                let mut items: Vec<(f64, f64)> = ids.iter()
                    .filter_map(|&id| self.nodes.get(&id).map(|n| (n.x, n.width)))
                    .collect();
                items.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
                items.windows(2).map(|w| w[1].0 - (w[0].0 + w[0].1)).collect()
            }
            "vertical" => {
                let mut items: Vec<(f64, f64)> = ids.iter()
                    .filter_map(|&id| self.nodes.get(&id).map(|n| (n.y, n.height)))
                    .collect();
                items.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
                items.windows(2).map(|w| w[1].0 - (w[0].0 + w[0].1)).collect()
            }
            _ => vec![],
        };
        let avg = if gaps.is_empty() { 0.0 } else { gaps.iter().sum::<f64>() / gaps.len() as f64 };
        let uniform = gaps.iter().all(|g| (g - avg).abs() < 0.5);
        format!("{{\"axis\":\"{}\",\"gaps\":{:?},\"uniform\":{},\"avg_gap\":{:.1}}}", axis, gaps, uniform, avg)
    }

    /// Smart tidy up: detect dominant axis, equalize spacing, align cross-axis.
    /// Returns JSON: { axis, gap, count }
    pub fn tidy_up(&mut self, ids: &[NodeId]) -> String {
        if ids.len() < 2 { return "{}".to_string(); }

        // Gather bounds
        let mut items: Vec<(NodeId, f64, f64, f64, f64)> = ids.iter()
            .filter_map(|&id| self.nodes.get(&id).map(|n| (id, n.x, n.y, n.width, n.height)))
            .collect();
        if items.len() < 2 { return "{}".to_string(); }

        // Determine dominant axis by spread
        let x_spread = items.iter().map(|i| i.1 + i.3).fold(f64::NEG_INFINITY, f64::max)
            - items.iter().map(|i| i.1).fold(f64::INFINITY, f64::min);
        let y_spread = items.iter().map(|i| i.2 + i.4).fold(f64::NEG_INFINITY, f64::max)
            - items.iter().map(|i| i.2).fold(f64::INFINITY, f64::min);

        let horizontal = x_spread >= y_spread;
        let axis = if horizontal { "horizontal" } else { "vertical" };

        if horizontal {
            items.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
        } else {
            items.sort_by(|a, b| a.2.partial_cmp(&b.2).unwrap());
        }

        // Calculate current gaps and find median
        let gaps: Vec<f64> = if horizontal {
            items.windows(2).map(|w| w[1].1 - (w[0].1 + w[0].3)).collect()
        } else {
            items.windows(2).map(|w| w[1].2 - (w[0].2 + w[0].4)).collect()
        };

        // Use median gap, rounded to nearest nice number (multiple of 4, min 0)
        let mut sorted_gaps = gaps.clone();
        sorted_gaps.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let median = if sorted_gaps.is_empty() { 0.0 } else { sorted_gaps[sorted_gaps.len() / 2] };
        let nice_gap = if median <= 2.0 { 0.0 } else { (median / 4.0).round() * 4.0 };
        let gap = nice_gap.max(0.0);

        // Distribute along main axis with uniform gap
        if horizontal {
            let mut cursor = items[0].1;
            for &(id, _, _, w, _) in &items {
                if let Some(node) = self.nodes.get_mut(&id) { node.x = cursor; }
                cursor += w + gap;
            }
        } else {
            let mut cursor = items[0].2;
            for &(id, _, _, _, h) in &items {
                if let Some(node) = self.nodes.get_mut(&id) { node.y = cursor; }
                cursor += h + gap;
            }
        }

        // Align cross-axis: center align
        if horizontal {
            // center vertically
            let min_y = items.iter().map(|i| i.2).fold(f64::INFINITY, f64::min);
            let max_y2 = items.iter().map(|i| i.2 + i.4).fold(f64::NEG_INFINITY, f64::max);
            let center_y = (min_y + max_y2) / 2.0;
            for &(id, _, _, _, h) in &items {
                if let Some(node) = self.nodes.get_mut(&id) { node.y = center_y - h / 2.0; }
            }
        } else {
            // center horizontally
            let min_x = items.iter().map(|i| i.1).fold(f64::INFINITY, f64::min);
            let max_x2 = items.iter().map(|i| i.1 + i.3).fold(f64::NEG_INFINITY, f64::max);
            let center_x = (min_x + max_x2) / 2.0;
            for &(id, _, _, w, _) in &items {
                if let Some(node) = self.nodes.get_mut(&id) { node.x = center_x - w / 2.0; }
            }
        }

        format!("{{\"axis\":\"{}\",\"gap\":{:.1},\"count\":{}}}", axis, gap, items.len())
    }

    /// Smart distribute: detect 2D grid pattern and align rows + distribute columns simultaneously.
    /// Returns JSON: { rows, cols, row_gap, col_gap, count }
    pub fn smart_distribute_grid(&mut self, ids: &[NodeId]) -> String {
        if ids.len() < 4 { return "{}".to_string(); }

        // Gather bounds
        let items: Vec<(NodeId, f64, f64, f64, f64)> = ids.iter()
            .filter_map(|&id| self.nodes.get(&id).map(|n| (id, n.x, n.y, n.width, n.height)))
            .collect();
        if items.len() < 4 { return "{}".to_string(); }

        // Cluster Y positions into rows (tolerance = median height * 0.5)
        let median_h = {
            let mut hs: Vec<f64> = items.iter().map(|i| i.4).collect();
            hs.sort_by(|a, b| a.partial_cmp(b).unwrap());
            hs[hs.len() / 2]
        };
        let tolerance = (median_h * 0.5).max(8.0);

        // Sort by Y then cluster
        let mut sorted_by_y: Vec<(NodeId, f64, f64, f64, f64)> = items.clone();
        sorted_by_y.sort_by(|a, b| a.2.partial_cmp(&b.2).unwrap());

        let mut rows: Vec<Vec<(NodeId, f64, f64, f64, f64)>> = Vec::new();
        let mut current_row: Vec<(NodeId, f64, f64, f64, f64)> = vec![sorted_by_y[0]];
        let mut row_y = sorted_by_y[0].2;

        for &item in &sorted_by_y[1..] {
            if (item.2 - row_y).abs() < tolerance {
                current_row.push(item);
            } else {
                rows.push(current_row.clone());
                current_row = vec![item];
                row_y = item.2;
            }
        }
        rows.push(current_row);

        // Need at least 2 rows and 2 columns to be a grid
        if rows.len() < 2 { return "{}".to_string(); }

        // Sort each row by X
        for row in &mut rows {
            row.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
        }

        let max_cols = rows.iter().map(|r| r.len()).max().unwrap_or(0);
        if max_cols < 2 { return "{}".to_string(); }

        // Determine column X positions: use first (longest) row as reference
        let ref_row = rows.iter().max_by_key(|r| r.len()).unwrap();

        // Calculate uniform column gap from reference row
        let col_gap = if ref_row.len() >= 2 {
            let gaps: Vec<f64> = ref_row.windows(2)
                .map(|w| w[1].1 - (w[0].1 + w[0].3))
                .collect();
            let mut sg = gaps.clone();
            sg.sort_by(|a, b| a.partial_cmp(b).unwrap());
            let med = sg[sg.len() / 2];
            (med / 4.0).round() * 4.0
        } else { 16.0 };
        let col_gap = col_gap.max(0.0);

        // Calculate uniform row gap
        let row_centers: Vec<f64> = rows.iter().map(|r| {
            let avg_y = r.iter().map(|i| i.2 + i.4 / 2.0).sum::<f64>() / r.len() as f64;
            avg_y
        }).collect();
        let row_heights: Vec<f64> = rows.iter().map(|r| {
            r.iter().map(|i| i.4).fold(0.0_f64, f64::max)
        }).collect();

        let row_gap = if rows.len() >= 2 {
            let gaps: Vec<f64> = (0..rows.len()-1).map(|i| {
                let bottom_of_row = row_centers[i] + row_heights[i] / 2.0;
                let top_of_next = row_centers[i+1] - row_heights[i+1] / 2.0;
                top_of_next - bottom_of_row
            }).collect();
            let mut sg = gaps;
            sg.sort_by(|a, b| a.partial_cmp(b).unwrap());
            let med = sg[sg.len() / 2];
            (med / 4.0).round() * 4.0
        } else { 16.0 };
        let row_gap = row_gap.max(0.0);

        // Place grid: start from top-left of first row's first item
        let start_x = ref_row[0].1;
        let start_y = rows[0].iter().map(|i| i.2).fold(f64::INFINITY, f64::min);

        // Build column widths from max width in each column across all rows
        let mut col_widths = vec![0.0_f64; max_cols];
        for row in &rows {
            for (ci, item) in row.iter().enumerate() {
                col_widths[ci] = col_widths[ci].max(item.3);
            }
        }

        // Place nodes
        let mut cursor_y = start_y;
        for (ri, row) in rows.iter().enumerate() {
            let row_h = row_heights[ri];
            let mut cursor_x = start_x;
            for (ci, &(id, _, _, w, h)) in row.iter().enumerate() {
                if let Some(node) = self.nodes.get_mut(&id) {
                    // Center horizontally within column
                    node.x = cursor_x + (col_widths[ci] - w) / 2.0;
                    // Center vertically within row
                    node.y = cursor_y + (row_h - h) / 2.0;
                }
                cursor_x += col_widths[ci] + col_gap;
            }
            cursor_y += row_h + row_gap;
        }

        let num_rows = rows.len();
        format!("{{\"rows\":{},\"cols\":{},\"row_gap\":{:.1},\"col_gap\":{:.1},\"count\":{}}}", 
            num_rows, max_cols, row_gap, col_gap, items.len())
    }

    /// Smart distribute: analyze gaps between nodes and return preview JSON.
    /// Returns { h_gaps: [f64], v_gaps: [f64], h_recommended: f64, v_recommended: f64, moves_h: [{id, from, to, delta}], moves_v: [...] }
    pub fn smart_distribute_preview(&self, ids: &[NodeId]) -> String {
        if ids.len() < 3 { return "{}".to_string(); }

        let items: Vec<(NodeId, f64, f64, f64, f64)> = ids.iter()
            .filter_map(|&id| self.nodes.get(&id).map(|n| (id, n.x, n.y, n.width, n.height)))
            .collect();
        if items.len() < 3 { return "{}".to_string(); }

        // Horizontal analysis
        let mut h_sorted = items.clone();
        h_sorted.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
        let h_gaps: Vec<f64> = h_sorted.windows(2)
            .map(|w| w[1].1 - (w[0].1 + w[0].3))
            .collect();
        let h_rec = Self::find_recommended_gap(&h_gaps);

        // Vertical analysis
        let mut v_sorted = items.clone();
        v_sorted.sort_by(|a, b| a.2.partial_cmp(&b.2).unwrap());
        let v_gaps: Vec<f64> = v_sorted.windows(2)
            .map(|w| w[1].2 - (w[0].2 + w[0].4))
            .collect();
        let v_rec = Self::find_recommended_gap(&v_gaps);

        // Compute moves for H
        let moves_h = Self::compute_moves_h(&h_sorted, h_rec);
        let moves_v = Self::compute_moves_v(&v_sorted, v_rec);

        let h_gaps_json: Vec<String> = h_gaps.iter().map(|g| format!("{:.1}", g)).collect();
        let v_gaps_json: Vec<String> = v_gaps.iter().map(|g| format!("{:.1}", g)).collect();

        format!("{{\"h_gaps\":[{}],\"v_gaps\":[{}],\"h_recommended\":{:.1},\"v_recommended\":{:.1},\"moves_h\":[{}],\"moves_v\":[{}]}}",
            h_gaps_json.join(","), v_gaps_json.join(","), h_rec, v_rec,
            moves_h.join(","), moves_v.join(","))
    }

    fn find_recommended_gap(gaps: &[f64]) -> f64 {
        if gaps.is_empty() { return 0.0; }
        // Round gaps to nearest integer for mode detection
        let rounded: Vec<i64> = gaps.iter().map(|g| g.round() as i64).collect();
        // Find mode (most frequent)
        let mut counts = std::collections::HashMap::new();
        for &r in &rounded {
            *counts.entry(r).or_insert(0usize) += 1;
        }
        let mode = counts.into_iter().max_by_key(|&(_, c)| c).map(|(v, _)| v).unwrap_or(0);
        // If mode has count > 1, use it; otherwise use median
        let mode_count = rounded.iter().filter(|&&r| r == mode).count();
        if mode_count > 1 {
            mode as f64
        } else {
            let mut sorted = gaps.to_vec();
            sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
            sorted[sorted.len() / 2]
        }
    }

    fn compute_moves_h(sorted: &[(NodeId, f64, f64, f64, f64)], gap: f64) -> Vec<String> {
        let mut moves = Vec::new();
        let mut cursor = sorted[0].1;
        for &(id, orig_x, _, w, _) in sorted {
            let delta = cursor - orig_x;
            if delta.abs() > 0.1 {
                moves.push(format!("{{\"id\":{},\"from\":{:.1},\"to\":{:.1},\"delta\":{:.1}}}", id, orig_x, cursor, delta));
            }
            cursor += w + gap;
        }
        moves
    }

    fn compute_moves_v(sorted: &[(NodeId, f64, f64, f64, f64)], gap: f64) -> Vec<String> {
        let mut moves = Vec::new();
        let mut cursor = sorted[0].2;
        for &(id, _, orig_y, _, h) in sorted {
            let delta = cursor - orig_y;
            if delta.abs() > 0.1 {
                moves.push(format!("{{\"id\":{},\"from\":{:.1},\"to\":{:.1},\"delta\":{:.1}}}", id, orig_y, cursor, delta));
            }
            cursor += h + gap;
        }
        moves
    }

    /// Smart distribute horizontally: normalize gaps using recommended or custom gap.
    pub fn smart_distribute_h(&mut self, ids: &[NodeId], reference_gap: Option<f64>) {
        if ids.len() < 3 { return; }
        let mut items: Vec<(NodeId, f64, f64)> = ids.iter()
            .filter_map(|&id| self.nodes.get(&id).map(|n| (id, n.x, n.width)))
            .collect();
        if items.len() < 3 { return; }
        items.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());

        let gap = reference_gap.unwrap_or_else(|| {
            let gaps: Vec<f64> = items.windows(2).map(|w| w[1].1 - (w[0].1 + w[0].2)).collect();
            Self::find_recommended_gap(&gaps)
        });

        let mut cursor = items[0].1;
        for &(id, _, w) in &items {
            if let Some(node) = self.nodes.get_mut(&id) { node.x = cursor; }
            cursor += w + gap;
        }
    }

    /// Smart distribute vertically: normalize gaps using recommended or custom gap.
    pub fn smart_distribute_v(&mut self, ids: &[NodeId], reference_gap: Option<f64>) {
        if ids.len() < 3 { return; }
        let mut items: Vec<(NodeId, f64, f64)> = ids.iter()
            .filter_map(|&id| self.nodes.get(&id).map(|n| (id, n.y, n.height)))
            .collect();
        if items.len() < 3 { return; }
        items.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());

        let gap = reference_gap.unwrap_or_else(|| {
            let gaps: Vec<f64> = items.windows(2).map(|w| w[1].1 - (w[0].1 + w[0].2)).collect();
            Self::find_recommended_gap(&gaps)
        });

        let mut cursor = items[0].1;
        for &(id, _, h) in &items {
            if let Some(node) = self.nodes.get_mut(&id) { node.y = cursor; }
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

    // ── Page Comparison Helpers ─────────────────────────────────────

    /// Get node summaries for a specific page (without switching active page).
    /// Returns Vec of (id, name, kind_str, x, y, width, height, fill_hex, parent_id).
    pub fn get_page_node_summaries(&mut self, page_id: u64) -> Vec<(u64, String, String, f64, f64, f64, f64, String, u64)> {
        // Save current state
        self.save_active_page();
        let saved_idx = self.active_page_index;

        let target_idx = match self.pages.iter().position(|p| p.id == page_id) {
            Some(i) => i,
            None => return vec![],
        };

        self.load_page(target_idx);

        let summaries: Vec<_> = self.nodes.values().map(|n| {
            let kind_str = format!("{:?}", n.kind).split('(').next().unwrap_or("Unknown").split('{').next().unwrap_or("Unknown").trim().to_string();
            let fill_hex = if let Some(f) = n.fills.first() {
                match &f.fill_type {
                    crate::node::FillType::Solid { color } => format!("#{:02x}{:02x}{:02x}", color.r, color.g, color.b),
                    _ => String::new(),
                }
            } else {
                String::new()
            };
            let parent_id = n.parent.unwrap_or(0);
            (n.id, n.name.clone(), kind_str, n.x, n.y, n.width, n.height, fill_hex, parent_id)
        }).collect();

        // Restore
        self.load_page(saved_idx);
        self.active_page_index = saved_idx;

        summaries
    }

    /// Temporarily switch to a page, render, then switch back.
    /// Returns true if rendered successfully.
    pub fn switch_to_page_temporarily(&mut self, page_id: u64) -> bool {
        self.save_active_page();
        let target_idx = match self.pages.iter().position(|p| p.id == page_id) {
            Some(i) => i,
            None => return false,
        };
        self.active_page_index = target_idx;
        self.load_page(target_idx);
        true
    }

    pub fn restore_page(&mut self, saved_page_id: u64) {
        self.save_active_page();
        let idx = self.pages.iter().position(|p| p.id == saved_page_id).unwrap_or(0);
        self.active_page_index = idx;
        self.load_page(idx);
    }

    // ── Persistent Measure Lines ─────────────────────────────────────

    pub fn add_measure_line(&mut self, start_x: f64, start_y: f64, end_x: f64, end_y: f64, page_id: u64) -> u64 {
        let id = self.next_measure_id;
        self.next_measure_id += 1;
        self.measure_lines.push(MeasureLine {
            id, start_x, start_y, end_x, end_y,
            unit: MeasureUnit::Px,
            label: String::new(),
            visible: true,
            page_id,
        });
        id
    }

    pub fn remove_measure_line(&mut self, id: u64) -> bool {
        let len = self.measure_lines.len();
        self.measure_lines.retain(|m| m.id != id);
        self.measure_lines.len() < len
    }

    pub fn update_measure_line(&mut self, id: u64, start_x: f64, start_y: f64, end_x: f64, end_y: f64) -> bool {
        if let Some(m) = self.measure_lines.iter_mut().find(|m| m.id == id) {
            m.start_x = start_x; m.start_y = start_y;
            m.end_x = end_x; m.end_y = end_y;
            true
        } else { false }
    }

    pub fn set_measure_unit(&mut self, id: u64, unit: &str) -> bool {
        if let Some(m) = self.measure_lines.iter_mut().find(|m| m.id == id) {
            m.unit = match unit {
                "rem" | "Rem" => MeasureUnit::Rem,
                "percent" | "Percent" | "%" => MeasureUnit::Percent,
                _ => MeasureUnit::Px,
            };
            true
        } else { false }
    }

    pub fn set_measure_label(&mut self, id: u64, label: &str) -> bool {
        if let Some(m) = self.measure_lines.iter_mut().find(|m| m.id == id) {
            m.label = label.to_string();
            true
        } else { false }
    }

    pub fn set_measure_visible(&mut self, id: u64, visible: bool) -> bool {
        if let Some(m) = self.measure_lines.iter_mut().find(|m| m.id == id) {
            m.visible = visible;
            true
        } else { false }
    }

    pub fn get_measure_lines_json(&self, page_id: u64) -> String {
        let filtered: Vec<&MeasureLine> = if page_id == 0 {
            self.measure_lines.iter().collect()
        } else {
            self.measure_lines.iter().filter(|m| m.page_id == page_id).collect()
        };
        serde_json::to_string(&filtered).unwrap_or_else(|_| "[]".to_string())
    }

    pub fn snap_measure_to_node(&self, node_id: u64) -> Option<(f64, f64, f64, f64)> {
        self.nodes.get(&node_id).map(|n| (n.x, n.y, n.x + n.width, n.y + n.height))
    }

    pub fn clear_measure_lines(&mut self, page_id: u64) -> u32 {
        let before = self.measure_lines.len();
        self.measure_lines.retain(|m| m.page_id != page_id);
        (before - self.measure_lines.len()) as u32
    }

    // ─── View Bookmarks ──────────────────────────────────────

    pub fn add_view_bookmark(&mut self, name: &str, x: f64, y: f64, zoom: f64, page_id: u64, description: &str, color: &str) -> u64 {
        let id = self.next_view_bookmark_id;
        self.next_view_bookmark_id += 1;
        self.view_bookmarks.push(ViewBookmark {
            id, name: name.to_string(), x, y, zoom, page_id,
            description: description.to_string(),
            created_at: js_sys::Date::now(),
            color: if color.is_empty() { "#4ecdc4".to_string() } else { color.to_string() },
        });
        id
    }

    pub fn remove_view_bookmark(&mut self, id: u64) -> bool {
        let len = self.view_bookmarks.len();
        self.view_bookmarks.retain(|b| b.id != id);
        self.view_bookmarks.len() < len
    }

    pub fn update_view_bookmark(&mut self, id: u64, name: &str, description: &str, color: &str) -> bool {
        if let Some(b) = self.view_bookmarks.iter_mut().find(|b| b.id == id) {
            if !name.is_empty() { b.name = name.to_string(); }
            if !description.is_empty() { b.description = description.to_string(); }
            if !color.is_empty() { b.color = color.to_string(); }
            true
        } else { false }
    }

    pub fn get_view_bookmarks_json(&self) -> String {
        serde_json::to_string(&self.view_bookmarks).unwrap_or_else(|_| "[]".to_string())
    }

    pub fn get_view_bookmarks_for_page_json(&self, page_id: u64) -> String {
        let filtered: Vec<&ViewBookmark> = self.view_bookmarks.iter()
            .filter(|b| b.page_id == page_id || b.page_id == 0)
            .collect();
        serde_json::to_string(&filtered).unwrap_or_else(|_| "[]".to_string())
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

    /// Wrap the given nodes in a new Frame, returning the frame's ID.
    /// The frame is sized to the bounding box of the nodes (+padding 0).
    /// Children are reparented and their positions adjusted to be relative to the frame.
    pub fn wrap_in_frame(&mut self, ids: &[NodeId]) -> Option<NodeId> {
        if ids.is_empty() { return None; }
        let bounds = self.get_bounds_of(ids)?;
        let (min_x, min_y, max_x, max_y) = bounds;
        let fw = max_x - min_x;
        let fh = max_y - min_y;

        // Determine insertion point: use the first selected node's parent and position
        let first_parent = self.nodes.get(&ids[0]).and_then(|n| n.parent);
        // Find the earliest index among siblings for insertion order
        let sibling_list: Vec<NodeId> = if let Some(pid) = first_parent {
            self.nodes.get(&pid).map(|p| p.children.clone()).unwrap_or_default()
        } else {
            self.root_children.clone()
        };
        let earliest_idx = sibling_list.iter().position(|c| ids.contains(c)).unwrap_or(sibling_list.len());

        // Create frame node
        let mut frame = Node::new(0, NodeKind::Frame);
        frame.x = min_x;
        frame.y = min_y;
        frame.width = fw;
        frame.height = fh;
        frame.name = format!("Frame {}", self.node_count() + 1);
        frame.fills = vec![crate::node::Fill::solid(crate::types::Color { r: 255, g: 255, b: 255, a: 1.0 })];
        frame.parent = first_parent;

        let frame_id = self.next_id;
        self.next_id += 1;
        frame.id = frame_id;

        // Remove selected nodes from their current parent's children list
        for &id in ids {
            if let Some(node) = self.nodes.get(&id) {
                if let Some(old_parent) = node.parent {
                    if let Some(p) = self.nodes.get_mut(&old_parent) {
                        p.children.retain(|&c| !ids.contains(&c));
                    }
                } else {
                    self.root_children.retain(|&c| !ids.contains(&c));
                }
            }
        }

        // Insert frame at the earliest position
        if let Some(pid) = first_parent {
            if let Some(p) = self.nodes.get_mut(&pid) {
                let insert_at = earliest_idx.min(p.children.len());
                p.children.insert(insert_at, frame_id);
            }
        } else {
            let insert_at = earliest_idx.min(self.root_children.len());
            self.root_children.insert(insert_at, frame_id);
        }

        // Reparent children into frame, adjust positions to local coords
        let mut frame_children = Vec::new();
        for &id in ids {
            if let Some(node) = self.nodes.get_mut(&id) {
                node.x -= min_x;
                node.y -= min_y;
                node.parent = Some(frame_id);
                frame_children.push(id);
            }
        }
        frame.children = frame_children;
        self.nodes.insert(frame_id, frame);

        Some(frame_id)
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
        let mut comment = Comment {
            id, x, y,
            author: author.to_string(),
            text: text.to_string(),
            timestamp: js_sys::Date::now() as u64,
            resolved: false,
            replies: vec![],
            node_id,
            page_id,
            assignee: None,
            mentions: vec![],
        };
        comment.extract_mentions();
        self.comments.push(comment);
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
            c.extract_mentions();
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
            c.extract_mentions();
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

    pub fn set_comment_assignee(&mut self, comment_id: u64, assignee: Option<String>) {
        if let Some(c) = self.comments.iter_mut().find(|c| c.id == comment_id) {
            c.assignee = assignee;
        }
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

    /// Export all comments as a Markdown report
    pub fn export_comments_markdown(&self) -> String {
        self.export_annotations_markdown()
    }

    /// Export all annotations (comments + node notes) as Markdown report
    pub fn export_annotations_markdown(&self) -> String {
        let mut md = String::from("# Annotations Report\n\n");
        md.push_str("_Generated from OpenSketch_\n\n---\n\n");

        // === COMMENTS SECTION ===
        md.push_str("## 💬 Comments\n\n");

        let mut page_map: std::collections::BTreeMap<u64, (String, Vec<&Comment>)> = std::collections::BTreeMap::new();
        for page in &self.pages {
            page_map.insert(page.id, (page.name.clone(), Vec::new()));
        }
        for c in &self.comments {
            page_map.entry(c.page_id).or_insert_with(|| (format!("Page {}", c.page_id), Vec::new())).1.push(c);
        }

        let mut has_comments = false;
        let mut total_open = 0usize;
        let mut total_resolved = 0usize;

        for (_pid, (page_name, comments)) in &page_map {
            if comments.is_empty() { continue; }
            has_comments = true;
            let open: Vec<_> = comments.iter().filter(|c| !c.resolved).collect();
            let resolved: Vec<_> = comments.iter().filter(|c| c.resolved).collect();
            total_open += open.len();
            total_resolved += resolved.len();

            md.push_str(&format!("### 📄 {}\n\n", page_name));

            if !open.is_empty() {
                md.push_str(&format!("#### Open ({})\n\n", open.len()));
                for c in &open {
                    self.format_comment_rich(&mut md, c);
                }
            }
            if !resolved.is_empty() {
                md.push_str(&format!("#### ✅ Resolved ({})\n\n", resolved.len()));
                for c in &resolved {
                    self.format_comment_rich(&mut md, c);
                }
            }
        }
        if !has_comments {
            md.push_str("_No comments._\n\n");
        } else {
            md.push_str(&format!("> **Summary:** {} open, {} resolved, {} total\n\n", total_open, total_resolved, total_open + total_resolved));
        }

        // === NODE NOTES SECTION ===
        md.push_str("---\n\n## 📝 Node Notes\n\n");

        let mut noted_nodes: Vec<&Node> = self.nodes.values()
            .filter(|n| !n.notes.is_empty())
            .collect();
        noted_nodes.sort_by_key(|n| n.id);

        if noted_nodes.is_empty() {
            md.push_str("_No node notes._\n\n");
        } else {
            for node in &noted_nodes {
                md.push_str(&format!("### {} `{:?}`\n\n", node.name, node.kind_name()));
                for note in &node.notes {
                    if !note.tags.is_empty() {
                        let tags: Vec<String> = note.tags.iter().map(|t| format!("`{}`", t)).collect();
                        md.push_str(&format!("**Tags:** {}  \n", tags.join(", ")));
                    }
                    md.push_str(&note.content);
                    md.push_str("\n\n");
                }
            }
            md.push_str(&format!("> **Total:** {} nodes with notes\n\n", noted_nodes.len()));
        }

        md
    }

    /// Export annotations as JSON (for programmatic use)
    pub fn export_annotations_json(&self) -> String {
        #[derive(Serialize)]
        struct AnnotationExport {
            comments: Vec<CommentExport>,
            notes: Vec<NoteExport>,
        }
        #[derive(Serialize)]
        struct CommentExport {
            id: u64,
            author: String,
            text: String,
            x: f64,
            y: f64,
            resolved: bool,
            page: String,
            node_name: Option<String>,
            replies: Vec<ReplyExport>,
        }
        #[derive(Serialize)]
        struct ReplyExport {
            author: String,
            text: String,
        }
        #[derive(Serialize)]
        struct NoteExport {
            node_id: u64,
            node_name: String,
            node_kind: String,
            tags: Vec<String>,
            content: String,
        }

        let page_names: HashMap<u64, String> = self.pages.iter().map(|p| (p.id, p.name.clone())).collect();

        let comments: Vec<CommentExport> = self.comments.iter().map(|c| {
            CommentExport {
                id: c.id,
                author: c.author.clone(),
                text: c.text.clone(),
                x: c.x,
                y: c.y,
                resolved: c.resolved,
                page: page_names.get(&c.page_id).cloned().unwrap_or_else(|| format!("Page {}", c.page_id)),
                node_name: c.node_id.and_then(|nid| self.nodes.get(&nid).map(|n| n.name.clone())),
                replies: c.replies.iter().map(|r| ReplyExport { author: r.author.clone(), text: r.text.clone() }).collect(),
            }
        }).collect();

        let notes: Vec<NoteExport> = self.nodes.values()
            .filter(|n| !n.notes.is_empty())
            .flat_map(|node| {
                node.notes.iter().map(move |note| NoteExport {
                    node_id: node.id,
                    node_name: node.name.clone(),
                    node_kind: node.kind_name().to_string(),
                    tags: note.tags.clone(),
                    content: note.content.clone(),
                })
            }).collect();

        serde_json::to_string_pretty(&AnnotationExport { comments, notes }).unwrap_or_else(|_| "{}".to_string())
    }

    fn format_comment_rich(&self, md: &mut String, c: &Comment) {
        let node_ref = match c.node_id {
            Some(nid) => {
                if let Some(node) = self.nodes.get(&nid) {
                    format!(" → **{}**", node.name)
                } else {
                    format!(" → Node #{}", nid)
                }
            }
            None => String::new(),
        };

        md.push_str(&format!("- **{}**{}: {}\n", c.author, node_ref, c.text));
        md.push_str(&format!("  _at ({:.0}, {:.0})_\n", c.x, c.y));
        for r in &c.replies {
            md.push_str(&format!("  - **{}**: {}\n", r.author, r.text));
        }
        md.push('\n');
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

    // =============================================
    // Responsive Token System
    // =============================================

    pub fn add_responsive_preset(&mut self, label: String, width: f64, height: Option<f64>) -> u64 {
        let id = self.responsive.next_preset_id + 1;
        self.responsive.next_preset_id = id;
        self.responsive.presets.push(ResponsivePreset {
            id,
            label,
            width,
            height,
            mode_mappings: HashMap::new(),
        });
        self.responsive.presets.sort_by(|a, b| a.width.partial_cmp(&b.width).unwrap());
        id
    }

    pub fn remove_responsive_preset(&mut self, preset_id: u64) -> bool {
        let len = self.responsive.presets.len();
        self.responsive.presets.retain(|p| p.id != preset_id);
        if self.responsive.active_preset_id == preset_id {
            self.responsive.active_preset_id = 0;
        }
        self.responsive.presets.len() < len
    }

    pub fn update_responsive_preset(&mut self, preset_id: u64, label: Option<String>, width: Option<f64>, height: Option<Option<f64>>) -> bool {
        if let Some(p) = self.responsive.presets.iter_mut().find(|p| p.id == preset_id) {
            if let Some(l) = label { p.label = l; }
            if let Some(w) = width { p.width = w; }
            if let Some(h) = height { p.height = h; }
            true
        } else {
            false
        }
    }

    /// Set a mode mapping: when this preset is active, switch collection to the given mode.
    pub fn set_preset_mode_mapping(&mut self, preset_id: u64, collection_id: CollectionId, mode_id: ModeId) -> bool {
        if let Some(p) = self.responsive.presets.iter_mut().find(|p| p.id == preset_id) {
            p.mode_mappings.insert(collection_id, mode_id);
            true
        } else {
            false
        }
    }

    /// Remove a mode mapping from a preset.
    pub fn remove_preset_mode_mapping(&mut self, preset_id: u64, collection_id: CollectionId) -> bool {
        if let Some(p) = self.responsive.presets.iter_mut().find(|p| p.id == preset_id) {
            p.mode_mappings.remove(&collection_id).is_some()
        } else {
            false
        }
    }

    /// Activate a preset: switch all mapped collections to their mapped modes, then apply variables.
    pub fn activate_preset(&mut self, preset_id: u64) -> bool {
        let mappings = if preset_id == 0 {
            self.responsive.active_preset_id = 0;
            return true;
        } else if let Some(p) = self.responsive.presets.iter().find(|p| p.id == preset_id) {
            p.mode_mappings.clone()
        } else {
            return false;
        };

        self.responsive.active_preset_id = preset_id;

        // Switch collection modes
        for (col_id, mode_id) in &mappings {
            if let Some(col) = self.variable_collections.iter_mut().find(|c| c.id == *col_id) {
                if col.modes.iter().any(|m| m.id == *mode_id) {
                    col.active_mode_id = *mode_id;
                }
            }
        }

        // Re-apply variable bindings
        self.apply_variables();
        true
    }

    /// Find and activate the preset matching a given viewport width (closest ≤ width, or smallest if none).
    pub fn set_preview_width(&mut self, width: f64) -> u64 {
        if self.responsive.presets.is_empty() {
            return 0;
        }
        // Find the preset with the largest width ≤ given width
        let preset_id = self.responsive.presets.iter()
            .rev()
            .find(|p| p.width <= width)
            .or_else(|| self.responsive.presets.first())
            .map(|p| p.id)
            .unwrap_or(0);

        if preset_id != self.responsive.active_preset_id {
            self.activate_preset(preset_id);
        }
        preset_id
    }

    pub fn get_responsive_presets_json(&self) -> String {
        serde_json::to_string(&self.responsive.presets).unwrap_or_else(|_| "[]".to_string())
    }

    pub fn get_active_preset_id(&self) -> u64 {
        self.responsive.active_preset_id
    }

    // =============================================
    // Smart Selection
    // =============================================

    /// Deep hit test: traverse into Frame/Group children to find the deepest leaf node at point.
    pub fn deep_hit_test(&self, point: Point) -> Option<NodeId> {
        self.deep_hit_test_in(&self.root_children, point)
    }

    fn deep_hit_test_in(&self, ids: &[NodeId], point: Point) -> Option<NodeId> {
        // Iterate in reverse (top-most first)
        for &id in ids.iter().rev() {
            if let Some(node) = self.nodes.get(&id) {
                if !self.is_effectively_visible(id) || node.locked { continue; }
                if !node.bounds().contains(point) { continue; }
                // If container, recurse into children first
                if !node.children.is_empty() {
                    if let Some(child_id) = self.deep_hit_test_in(&node.children, point) {
                        return Some(child_id);
                    }
                }
                // Return this node if no deeper child was hit
                return Some(id);
            }
        }
        None
    }

    /// Select all nodes with the same first fill color as the given node.
    /// Select all nodes with the same name as the given node.
    pub fn select_same_name(&mut self, reference_id: NodeId) -> Vec<NodeId> {
        let ref_name = match self.nodes.get(&reference_id) {
            Some(n) => n.name.clone(),
            None => return vec![],
        };
        let mut result = vec![];
        for node in self.nodes.values() {
            if !node.visible || node.locked { continue; }
            if node.name == ref_name {
                result.push(node.id);
            }
        }
        self.selection = result.clone();
        result
    }

    /// Select all nodes with the same name AND kind as the given node.
    pub fn select_same_name_and_kind(&mut self, reference_id: NodeId) -> Vec<NodeId> {
        let (ref_name, ref_kind) = match self.nodes.get(&reference_id) {
            Some(n) => (n.name.clone(), std::mem::discriminant(&n.kind)),
            None => return vec![],
        };
        let mut result = vec![];
        for node in self.nodes.values() {
            if !node.visible || node.locked { continue; }
            if node.name == ref_name && std::mem::discriminant(&node.kind) == ref_kind {
                result.push(node.id);
            }
        }
        self.selection = result.clone();
        result
    }

    pub fn select_same_fill(&mut self, reference_id: NodeId) -> Vec<NodeId> {
        let ref_fill = self.nodes.get(&reference_id)
            .and_then(|n| n.fills.first())
            .cloned();
        let ref_fill = match ref_fill {
            Some(f) => f,
            None => return vec![],
        };
        let mut result = vec![];
        for node in self.nodes.values() {
            if !node.visible || node.locked { continue; }
            if let Some(fill) = node.fills.first() {
                if fill.color() == ref_fill.color() && fill.fill_type == ref_fill.fill_type {
                    result.push(node.id);
                }
            }
        }
        self.selection = result.clone();
        result
    }

    /// Select all nodes with the same NodeKind variant as the given node.
    pub fn select_same_kind(&mut self, reference_id: NodeId) -> Vec<NodeId> {
        let ref_kind = match self.nodes.get(&reference_id) {
            Some(n) => std::mem::discriminant(&n.kind),
            None => return vec![],
        };
        let mut result = vec![];
        for node in self.nodes.values() {
            if !node.visible || node.locked { continue; }
            if std::mem::discriminant(&node.kind) == ref_kind {
                result.push(node.id);
            }
        }
        self.selection = result.clone();
        result
    }

    /// Select all nodes with the same first stroke color as the given node.
    pub fn select_same_stroke(&mut self, reference_id: NodeId) -> Vec<NodeId> {
        let ref_stroke = self.nodes.get(&reference_id)
            .and_then(|n| n.strokes.first())
            .cloned();
        let ref_stroke = match ref_stroke {
            Some(s) => s,
            None => return vec![],
        };
        let mut result = vec![];
        for node in self.nodes.values() {
            if !node.visible || node.locked { continue; }
            if let Some(stroke) = node.strokes.first() {
                if stroke.color == ref_stroke.color {
                    result.push(node.id);
                }
            }
        }
        self.selection = result.clone();
        result
    }

    /// Select all text nodes with the same font_family as the given text node.
    pub fn select_same_font(&mut self, reference_id: NodeId) -> Vec<NodeId> {
        let ref_font = match self.nodes.get(&reference_id) {
            Some(n) => match &n.kind {
                NodeKind::Text { font_family, .. } => font_family.clone(),
                _ => return vec![],
            },
            None => return vec![],
        };
        let mut result = vec![];
        for node in self.nodes.values() {
            if !node.visible || node.locked { continue; }
            if let NodeKind::Text { font_family, .. } = &node.kind {
                if *font_family == ref_font {
                    result.push(node.id);
                }
            }
        }
        self.selection = result.clone();
        result
    }

    /// Batch rename nodes by IDs.
    /// pattern: use `{name}` for original name, `{n}` for sequential number, `{N}` for zero-padded number
    /// Example: "{name} - {n}" with ids [a,b,c] starting at 1 → "Rect - 1", "Ellipse - 2", "Text - 3"
    pub fn batch_rename(&mut self, ids: &[NodeId], pattern: &str, start_num: u32) {
        let pad_width = if ids.is_empty() { 1 } else { ((ids.len() as f64).log10().floor() as usize) + 1 };
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

    /// Batch find/replace in node names.
    pub fn batch_find_replace(&mut self, ids: &[NodeId], find: &str, replace: &str, use_regex: bool) -> u32 {
        let mut count = 0u32;
        if find.is_empty() { return 0; }
        for &id in ids {
            if let Some(node) = self.get_node_mut(id) {
                let old = node.name.clone();
                let new_name = if use_regex {
                    match regex::Regex::new(find) {
                        Ok(re) => re.replace_all(&old, replace).to_string(),
                        Err(_) => continue,
                    }
                } else {
                    old.replace(find, replace)
                };
                if new_name != old {
                    node.name = new_name;
                    count += 1;
                }
            }
        }
        count
    }

    /// Preview batch rename results without modifying nodes. Returns JSON array of {id, original, preview}.
    /// mode: "prefix" | "find_replace" | "regex"
    pub fn batch_rename_preview(&self, ids: &[NodeId], mode: &str, pattern: &str, find: &str, replace_with: &str, start_num: u32, case_sensitive: bool) -> String {
        let pad_width = if ids.is_empty() { 1 } else { ((ids.len() as f64).log10().floor() as usize) + 1 };
        let re = if mode == "regex" && !find.is_empty() {
            regex::Regex::new(find).ok()
        } else { None };

        let mut entries = Vec::new();
        for (i, &id) in ids.iter().enumerate() {
            if let Some(node) = self.get_node(id) {
                let original = &node.name;
                let preview = match mode {
                    "prefix" => {
                        let num = start_num as usize + i;
                        pattern
                            .replace("{name}", original)
                            .replace("{N}", &format!("{:0>width$}", num, width = pad_width))
                            .replace("{n}", &num.to_string())
                    }
                    "find_replace" => {
                        if find.is_empty() { original.clone() }
                        else if case_sensitive { original.replace(find, replace_with) }
                        else {
                            let lower = original.to_lowercase();
                            let find_lower = find.to_lowercase();
                            let mut result = String::new();
                            let mut start = 0;
                            while let Some(pos) = lower[start..].find(&find_lower) {
                                result.push_str(&original[start..start + pos]);
                                result.push_str(replace_with);
                                start += pos + find.len();
                            }
                            result.push_str(&original[start..]);
                            result
                        }
                    }
                    "regex" => {
                        if let Some(ref re) = re {
                            re.replace_all(original, replace_with).to_string()
                        } else { original.clone() }
                    }
                    _ => original.clone(),
                };
                entries.push(format!(
                    r#"{{"id":{},"original":"{}","preview":"{}"}}"#,
                    id,
                    original.replace('\\', "\\\\").replace('"', "\\\""),
                    preview.replace('\\', "\\\\").replace('"', "\\\""),
                ));
            }
        }
        format!("[{}]", entries.join(","))
    }

    // ─── Animation methods ───

    pub fn anim_add_clip(&mut self, name: &str) -> u64 {
        self.animations.add_clip(name)
    }

    pub fn anim_remove_clip(&mut self, clip_id: u64) -> bool {
        self.animations.remove_clip(clip_id)
    }

    pub fn anim_rename_clip(&mut self, clip_id: u64, name: &str) -> bool {
        if let Some(clip) = self.animations.get_clip_mut(clip_id) {
            clip.name = name.to_string();
            true
        } else { false }
    }

    pub fn anim_set_looping(&mut self, clip_id: u64, looping: bool) -> bool {
        if let Some(clip) = self.animations.get_clip_mut(clip_id) {
            clip.looping = looping;
            true
        } else { false }
    }

    pub fn anim_set_duration(&mut self, clip_id: u64, duration_ms: u32) -> bool {
        if let Some(clip) = self.animations.get_clip_mut(clip_id) {
            clip.duration_ms = duration_ms;
            true
        } else { false }
    }

    pub fn anim_add_keyframe(
        &mut self, clip_id: u64, node_id: NodeId,
        property: crate::animation::AnimProperty,
        time_ms: u32, value: f64, easing: crate::animation::Easing,
    ) -> bool {
        self.animations.add_keyframe(clip_id, node_id, property, time_ms, value, easing)
    }

    pub fn anim_remove_keyframe(
        &mut self, clip_id: u64, node_id: NodeId,
        property: &crate::animation::AnimProperty,
        time_ms: u32,
    ) -> bool {
        self.animations.remove_keyframe(clip_id, node_id, property, time_ms)
    }

    /// Set easing on an existing keyframe
    pub fn anim_set_keyframe_easing(
        &mut self, clip_id: u64, node_id: NodeId,
        property: &crate::animation::AnimProperty,
        time_ms: u32, easing: crate::animation::Easing,
    ) -> bool {
        if let Some(clip) = self.animations.get_clip_mut(clip_id) {
            if let Some(track) = clip.tracks.iter_mut().find(|t| t.node_id == node_id && &t.property == property) {
                if let Some(kf) = track.keyframes.iter_mut().find(|k| k.time_ms == time_ms) {
                    kf.easing = easing;
                    return true;
                }
            }
        }
        false
    }

    /// Apply animation values at a given time, mutating nodes in-place. Returns changed node IDs.
    pub fn anim_apply(&mut self, clip_id: u64, time_ms: u32) -> Vec<NodeId> {
        let values = self.animations.evaluate_clip(clip_id, time_ms);
        // Collect motion path configs for motion path tracks
        let motion_configs: Vec<(NodeId, f64, crate::animation::MotionPathConfig)> = {
            if let Some(clip) = self.animations.get_clip(clip_id) {
                let effective_time = if clip.looping && clip.effective_duration() > 0 {
                    time_ms % clip.effective_duration()
                } else {
                    time_ms.min(clip.effective_duration())
                };
                clip.tracks.iter().filter_map(|track| {
                    if track.property == crate::animation::AnimProperty::MotionPath {
                        if let Some(config) = &track.motion_path {
                            let progress = track.value_at(effective_time).unwrap_or(0.0);
                            Some((track.node_id, progress, config.clone()))
                        } else { None }
                    } else { None }
                }).collect()
            } else { vec![] }
        };

        let mut changed = Vec::new();
        for (node_id, prop, val) in values {
            if let Some(node) = self.nodes.get_mut(&node_id) {
                use crate::animation::AnimProperty::*;
                match prop {
                    X => node.x = val,
                    Y => node.y = val,
                    Width => node.width = val.max(0.0),
                    Height => node.height = val.max(0.0),
                    Rotation => node.rotation = val,
                    Opacity => node.opacity = val.clamp(0.0, 1.0),
                    CornerRadius => node.corner_radius = val.max(0.0),
                    Blur => node.blur = val.max(0.0),
                    FillR(idx) => {
                        if let Some(fill) = node.fills.get_mut(idx) {
                            fill.set_color_r(val as u8);
                        }
                    }
                    FillG(idx) => {
                        if let Some(fill) = node.fills.get_mut(idx) {
                            fill.set_color_g(val as u8);
                        }
                    }
                    FillB(idx) => {
                        if let Some(fill) = node.fills.get_mut(idx) {
                            fill.set_color_b(val as u8);
                        }
                    }
                    FillA(idx) => {
                        if let Some(fill) = node.fills.get_mut(idx) {
                            fill.set_color_a(val);
                        }
                    }
                    StrokeWidth(idx) => {
                        if let Some(stroke) = node.strokes.get_mut(idx) {
                            stroke.width = val.max(0.0);
                        }
                    }
                    ScaleX => { /* handled in TS as width % */ }
                    ScaleY => { /* handled in TS as height % */ }
                    MotionPath => { /* handled below with path sampling */ }
                    PathMorph => { /* handled in TS or below with path_morph */ }
                };
                if !changed.contains(&node_id) { changed.push(node_id); }
            }
        }

        // Apply motion path positions
        for (node_id, progress, config) in &motion_configs {
            // Get path points from the path node
            let path_data: Option<(Vec<crate::node::PathPoint>, bool)> = self.nodes.get(&config.path_node_id).and_then(|pn| {
                if let crate::node::NodeKind::Path { ref points, closed } = pn.kind {
                    Some((points.clone(), closed))
                } else { None }
            });
            if let Some((points, closed)) = path_data {
                let total_len = crate::path_utils::path_length(&points, closed);
                let dist = progress.clamp(0.0, 1.0) * total_len;
                if let Some(sample) = crate::path_utils::point_at_length(&points, closed, dist) {
                    if let Some(node) = self.nodes.get_mut(node_id) {
                        // Center the node on the path point
                        node.x = sample.x - node.width / 2.0;
                        node.y = sample.y - node.height / 2.0;
                        if config.orient_to_path {
                            node.rotation = sample.angle.to_degrees() + config.rotation_offset;
                        }
                        if !changed.contains(node_id) { changed.push(*node_id); }
                    }
                }
            }
        }

        changed
    }

    /// Apply animation with variable-bound keyframe resolution
    pub fn anim_apply_with_vars(&mut self, clip_id: u64, time_ms: u32) -> Vec<NodeId> {
        let collections = self.variable_collections.clone();
        let values = self.animations.evaluate_clip_with_vars(clip_id, time_ms, &collections);
        let mut changed = Vec::new();
        for (node_id, prop, val) in values {
            if let Some(node) = self.nodes.get_mut(&node_id) {
                use crate::animation::AnimProperty::*;
                match prop {
                    X => node.x = val,
                    Y => node.y = val,
                    Width => node.width = val.max(0.0),
                    Height => node.height = val.max(0.0),
                    Rotation => node.rotation = val,
                    Opacity => node.opacity = val.clamp(0.0, 1.0),
                    CornerRadius => node.corner_radius = val.max(0.0),
                    Blur => node.blur = val.max(0.0),
                    FillR(idx) => { if let Some(f) = node.fills.get_mut(idx) { f.set_color_r(val as u8); } }
                    FillG(idx) => { if let Some(f) = node.fills.get_mut(idx) { f.set_color_g(val as u8); } }
                    FillB(idx) => { if let Some(f) = node.fills.get_mut(idx) { f.set_color_b(val as u8); } }
                    FillA(idx) => { if let Some(f) = node.fills.get_mut(idx) { f.set_color_a(val); } }
                    StrokeWidth(idx) => { if let Some(s) = node.strokes.get_mut(idx) { s.width = val.max(0.0); } }
                    ScaleX | ScaleY | MotionPath | PathMorph => { /* handled in TS / motion path logic */ }
                };
                if !changed.contains(&node_id) { changed.push(node_id); }
            }
        }
        changed
    }

    pub fn anim_get_clips_json(&self) -> String {
        serde_json::to_string(&self.animations.clips).unwrap_or_else(|_| "[]".to_string())
    }

    pub fn anim_get_clip_json(&self, clip_id: u64) -> Option<String> {
        self.animations.get_clip(clip_id).map(|c| serde_json::to_string(c).unwrap_or_default())
    }

    // =============================================
    // Branching
    // =============================================

    fn make_snapshot(&mut self) -> BranchSnapshot {
        self.save_active_page();
        BranchSnapshot {
            pages: self.pages.clone(),
            active_page_index: self.active_page_index,
            next_page_id: self.next_page_id,
            next_id: self.next_id,
        }
    }

    fn restore_snapshot(&mut self, snap: &BranchSnapshot) {
        self.pages = snap.pages.clone();
        self.active_page_index = snap.active_page_index.min(self.pages.len().saturating_sub(1));
        self.next_page_id = snap.next_page_id;
        self.next_id = snap.next_id;
        self.load_page(self.active_page_index);
        self.selection.clear();
    }

    pub fn create_branch(&mut self, name: &str) -> u64 {
        let snapshot = self.make_snapshot();
        let id = self.next_branch_id;
        self.next_branch_id += 1;
        let branch = Branch {
            id,
            name: name.to_string(),
            parent_branch_id: Some(self.active_branch_id),
            created_at: js_sys::Date::now(),
            base_snapshot: snapshot.clone(),
            current_snapshot: Some(snapshot),
        };
        self.branches.push(branch);
        // Switch to new branch
        self.save_current_branch();
        self.active_branch_id = id;
        id
    }

    fn save_current_branch(&mut self) {
        let snapshot = self.make_snapshot();
        if let Some(branch) = self.branches.iter_mut().find(|b| b.id == self.active_branch_id) {
            branch.current_snapshot = Some(snapshot);
        }
    }

    pub fn switch_branch(&mut self, target_id: u64) -> bool {
        if target_id == self.active_branch_id { return true; }
        if !self.branches.iter().any(|b| b.id == target_id) { return false; }
        
        // Save current branch state
        self.save_current_branch();
        
        // Restore target branch state
        let snap = {
            let branch = self.branches.iter().find(|b| b.id == target_id).unwrap();
            branch.current_snapshot.clone().unwrap_or_else(|| branch.base_snapshot.clone())
        };
        self.restore_snapshot(&snap);
        self.active_branch_id = target_id;
        true
    }

    pub fn merge_branch(&mut self, source_id: u64, target_id: u64) -> bool {
        if source_id == target_id { return false; }
        
        // Save current state first
        self.save_current_branch();
        
        let source_snap = {
            let branch = match self.branches.iter().find(|b| b.id == source_id) {
                Some(b) => b,
                None => return false,
            };
            branch.current_snapshot.clone().unwrap_or_else(|| branch.base_snapshot.clone())
        };
        
        let target_idx = match self.branches.iter().position(|b| b.id == target_id) {
            Some(i) => i,
            None => return false,
        };
        
        // Merge source into target's current snapshot
        let mut target_snap = self.branches[target_idx].current_snapshot.clone()
            .unwrap_or_else(|| self.branches[target_idx].base_snapshot.clone());
        merge_snapshots(&source_snap, &mut target_snap);
        self.branches[target_idx].current_snapshot = Some(target_snap.clone());
        
        // If we're on the target branch, restore
        if self.active_branch_id == target_id {
            self.restore_snapshot(&target_snap);
        }
        true
    }

    pub fn delete_branch(&mut self, id: u64) -> bool {
        // Can't delete main (id=1) or active branch
        if id == 1 { return false; }
        if id == self.active_branch_id { return false; }
        let len = self.branches.len();
        self.branches.retain(|b| b.id != id);
        self.branches.len() < len
    }

    pub fn list_branches(&self) -> Vec<(u64, String, bool)> {
        self.branches.iter().map(|b| (b.id, b.name.clone(), b.id == self.active_branch_id)).collect()
    }

    pub fn rename_branch(&mut self, id: u64, name: &str) -> bool {
        if let Some(branch) = self.branches.iter_mut().find(|b| b.id == id) {
            branch.name = name.to_string();
            true
        } else {
            false
        }
    }

    pub fn get_branch_diff(&mut self, branch_id: u64) -> Option<BranchDiff> {
        // Save current if it's the active branch
        if branch_id == self.active_branch_id {
            self.save_current_branch();
        }
        let branch = self.branches.iter().find(|b| b.id == branch_id)?;
        let current = branch.current_snapshot.as_ref().unwrap_or(&branch.base_snapshot);
        Some(compute_diff(&branch.base_snapshot, current))
    }

    /// Get visual diff between two branches (with node positions for overlay rendering)
    pub fn get_visual_diff(&mut self, branch_a_id: u64, branch_b_id: u64) -> Option<VisualDiff> {
        self.save_current_branch();
        let snap_a = {
            let branch = self.branches.iter().find(|b| b.id == branch_a_id)?;
            branch.current_snapshot.clone().unwrap_or_else(|| branch.base_snapshot.clone())
        };
        let snap_b = {
            let branch = self.branches.iter().find(|b| b.id == branch_b_id)?;
            branch.current_snapshot.clone().unwrap_or_else(|| branch.base_snapshot.clone())
        };
        Some(compute_visual_diff(&snap_a, &snap_b))
    }

    /// Get visual diff of a branch against its own base snapshot
    pub fn get_branch_visual_diff(&mut self, branch_id: u64) -> Option<VisualDiff> {
        if branch_id == self.active_branch_id {
            self.save_current_branch();
        }
        let branch = self.branches.iter().find(|b| b.id == branch_id)?;
        let current = branch.current_snapshot.as_ref().unwrap_or(&branch.base_snapshot);
        Some(compute_visual_diff(&branch.base_snapshot, current))
    }

    pub fn get_active_branch_id(&self) -> u64 {
        self.active_branch_id
    }

    /// Component analytics: count instances per component, find usage locations, detect unused
    pub fn get_component_analytics(&self, component_store: &crate::component::ComponentStore) -> String {
        use std::collections::HashMap;

        #[derive(serde::Serialize)]
        struct InstanceLocation {
            node_id: u64,
            node_name: String,
            page_id: u64,
            page_name: String,
        }

        #[derive(serde::Serialize)]
        struct ComponentStat {
            component_id: u64,
            component_name: String,
            instance_count: usize,
            locations: Vec<InstanceLocation>,
            variant_usage: HashMap<String, usize>,
        }

        #[derive(serde::Serialize)]
        struct Analytics {
            stats: Vec<ComponentStat>,
            unused_components: Vec<(u64, String)>,
            total_instances: usize,
            total_components: usize,
        }

        let mut usage: HashMap<u64, (usize, Vec<InstanceLocation>, HashMap<String, usize>)> = HashMap::new();

        // Collect all nodes across all pages
        // Active page nodes are in self.nodes, inactive pages in self.pages[i].nodes
        let mut page_nodes: Vec<(u64, &str, Vec<&Node>)> = Vec::new();

        for (i, page) in self.pages.iter().enumerate() {
            if i == self.active_page_index {
                // Active page: use self.nodes
                let nodes: Vec<&Node> = self.nodes.values().collect();
                page_nodes.push((page.id, &page.name, nodes));
            } else {
                let nodes: Vec<&Node> = page.nodes.iter().collect();
                page_nodes.push((page.id, &page.name, nodes));
            }
        }

        for (page_id, page_name, nodes) in &page_nodes {
            for node in nodes {
                if let crate::node::NodeKind::Instance(ref instance_data) = node.kind {
                    let comp_id = instance_data.component_id;
                    let entry = usage.entry(comp_id).or_insert_with(|| (0, Vec::new(), HashMap::new()));
                    entry.0 += 1;
                    entry.1.push(InstanceLocation {
                        node_id: node.id,
                        node_name: node.name.clone(),
                        page_id: *page_id,
                        page_name: page_name.to_string(),
                    });
                    // Track variant usage
                    let variant_key: Vec<String> = {
                        let mut parts: Vec<_> = instance_data.variant_values.iter()
                            .map(|(k, v)| format!("{}={}", k, v.to_display()))
                            .collect();
                        parts.sort();
                        parts
                    };
                    let key_str = if variant_key.is_empty() { "default".to_string() } else { variant_key.join(",") };
                    *entry.2.entry(key_str).or_insert(0) += 1;
                }
            }
        }

        let all_components = component_store.list();
        let total_components = all_components.len();

        let mut stats: Vec<ComponentStat> = Vec::new();
        let mut unused: Vec<(u64, String)> = Vec::new();

        for comp in &all_components {
            if let Some((count, locations, variant_usage)) = usage.remove(&comp.id) {
                stats.push(ComponentStat {
                    component_id: comp.id,
                    component_name: comp.name.clone(),
                    instance_count: count,
                    locations,
                    variant_usage,
                });
            } else {
                unused.push((comp.id, comp.name.clone()));
            }
        }

        stats.sort_by(|a, b| b.instance_count.cmp(&a.instance_count));

        let total_instances: usize = stats.iter().map(|s| s.instance_count).sum();

        let analytics = Analytics {
            stats,
            unused_components: unused,
            total_instances,
            total_components,
        };

        serde_json::to_string(&analytics).unwrap_or_default()
    }

    // =============================================
    // Review workflow
    // =============================================

    pub fn create_review(&mut self, branch_id: u64, title: &str, description: &str, reviewer: &str) -> u64 {
        let id = self.next_review_id;
        self.next_review_id += 1;
        let now = js_sys::Date::now();
        self.reviews.push(ReviewRequest {
            id,
            branch_id,
            title: title.to_string(),
            description: description.to_string(),
            status: ReviewStatus::Open,
            reviewer: reviewer.to_string(),
            created_at: now,
            updated_at: now,
        });
        id
    }

    pub fn approve_review(&mut self, review_id: u64) -> bool {
        if let Some(r) = self.reviews.iter_mut().find(|r| r.id == review_id) {
            if r.status == ReviewStatus::Open {
                r.status = ReviewStatus::Approved;
                r.updated_at = js_sys::Date::now();
                return true;
            }
        }
        false
    }

    pub fn reject_review(&mut self, review_id: u64, reason: &str) -> bool {
        if let Some(r) = self.reviews.iter_mut().find(|r| r.id == review_id) {
            if r.status == ReviewStatus::Open {
                r.status = ReviewStatus::Rejected;
                r.description = format!("{}\n\n---\nRejection reason: {}", r.description, reason);
                r.updated_at = js_sys::Date::now();
                return true;
            }
        }
        false
    }

    pub fn merge_review(&mut self, review_id: u64) -> bool {
        if let Some(r) = self.reviews.iter_mut().find(|r| r.id == review_id) {
            if r.status == ReviewStatus::Approved {
                let branch_id = r.branch_id;
                r.status = ReviewStatus::Merged;
                r.updated_at = js_sys::Date::now();
                // Find parent branch and merge
                if let Some(branch) = self.branches.iter().find(|b| b.id == branch_id) {
                    if let Some(parent_id) = branch.parent_branch_id {
                        return self.merge_branch(branch_id, parent_id);
                    }
                }
            }
        }
        false
    }

    pub fn add_review_comment(&mut self, review_id: u64, node_id: Option<u64>, text: &str, author: &str) -> u64 {
        let id = self.next_review_comment_id;
        self.next_review_comment_id += 1;
        self.review_comments.push(ReviewComment {
            id,
            review_id,
            node_id,
            text: text.to_string(),
            author: author.to_string(),
            timestamp: js_sys::Date::now(),
            resolved: false,
        });
        id
    }

    pub fn resolve_review_comment(&mut self, comment_id: u64) -> bool {
        if let Some(c) = self.review_comments.iter_mut().find(|c| c.id == comment_id) {
            c.resolved = true;
            true
        } else {
            false
        }
    }

    pub fn get_reviews(&self) -> String {
        serde_json::to_string(&self.reviews).unwrap_or_else(|_| "[]".to_string())
    }

    pub fn get_review(&self, review_id: u64) -> String {
        if let Some(r) = self.reviews.iter().find(|r| r.id == review_id) {
            serde_json::to_string(r).unwrap_or_else(|_| "{}".to_string())
        } else {
            "{}".to_string()
        }
    }

    pub fn get_review_comments(&self, review_id: u64) -> String {
        let comments: Vec<&ReviewComment> = self.review_comments.iter().filter(|c| c.review_id == review_id).collect();
        serde_json::to_string(&comments).unwrap_or_else(|_| "[]".to_string())
    }

    // ---- Stamps ----

    pub fn add_stamp(&mut self, kind_str: &str, x: f64, y: f64, author: &str, page_id: u64) -> u64 {
        let kind = StampKind::from_str(kind_str).unwrap_or(StampKind::Todo);
        let id = self.next_stamp_id;
        self.next_stamp_id += 1;
        self.stamps.push(Stamp {
            id,
            kind,
            x,
            y,
            rotation: 0.0,
            scale: 1.0,
            author: author.to_string(),
            timestamp: 0.0, // set from JS side
            page_id,
            note: String::new(),
            node_id: None,
        });
        id
    }

    pub fn add_stamp_with_note(&mut self, kind_str: &str, x: f64, y: f64, author: &str, page_id: u64, note: &str, node_id: Option<u64>, timestamp: f64) -> u64 {
        let kind = StampKind::from_str(kind_str).unwrap_or(StampKind::Todo);
        let id = self.next_stamp_id;
        self.next_stamp_id += 1;
        self.stamps.push(Stamp {
            id,
            kind,
            x,
            y,
            rotation: 0.0,
            scale: 1.0,
            author: author.to_string(),
            timestamp,
            page_id,
            note: note.to_string(),
            node_id,
        });
        id
    }

    pub fn remove_stamp(&mut self, stamp_id: u64) -> bool {
        let len = self.stamps.len();
        self.stamps.retain(|s| s.id != stamp_id);
        self.stamps.len() < len
    }

    pub fn update_stamp_position(&mut self, stamp_id: u64, x: f64, y: f64) -> bool {
        if let Some(s) = self.stamps.iter_mut().find(|s| s.id == stamp_id) {
            s.x = x;
            s.y = y;
            true
        } else {
            false
        }
    }

    pub fn update_stamp_note(&mut self, stamp_id: u64, note: &str) -> bool {
        if let Some(s) = self.stamps.iter_mut().find(|s| s.id == stamp_id) {
            s.note = note.to_string();
            true
        } else {
            false
        }
    }

    pub fn get_stamps_for_page(&self, page_id: u64) -> String {
        let page_stamps: Vec<&Stamp> = self.stamps.iter().filter(|s| s.page_id == page_id).collect();
        serde_json::to_string(&page_stamps).unwrap_or_else(|_| "[]".to_string())
    }

    pub fn get_all_stamps(&self) -> String {
        serde_json::to_string(&self.stamps).unwrap_or_else(|_| "[]".to_string())
    }

    pub fn get_stamp_count(&self) -> usize {
        self.stamps.len()
    }

    pub fn get_stamps_for_node(&self, node_id: u64) -> String {
        let node_stamps: Vec<&Stamp> = self.stamps.iter().filter(|s| s.node_id == Some(node_id)).collect();
        serde_json::to_string(&node_stamps).unwrap_or_else(|_| "[]".to_string())
    }

    // ── Auto Dark Mode ───────────────────────────────────────────────
    /// Convert all nodes in the scene to dark mode theme.
    /// Inverts lightness of fills, strokes, shadows, and text colors.
    /// Returns the number of nodes affected.
    pub fn auto_dark_mode(&mut self) -> u32 {
        use crate::node::FillType;
        let ids: Vec<NodeId> = self.nodes.keys().cloned().collect();
        let mut count = 0u32;
        for id in ids {
            if let Some(node) = self.nodes.get_mut(&id) {
                let mut changed = false;
                // Convert fills
                for fill in node.fills.iter_mut() {
                    if !fill.visible { continue; }
                    match &mut fill.fill_type {
                        FillType::Solid { color } => {
                            *color = color.to_dark_mode();
                            changed = true;
                        }
                        FillType::LinearGradient { stops, .. } |
                        FillType::RadialGradient { stops, .. } |
                        FillType::ConicGradient { stops, .. } => {
                            for stop in stops.iter_mut() {
                                stop.color = stop.color.to_dark_mode();
                            }
                            changed = true;
                        }
                        FillType::NoiseFill { color1, color2, .. } => {
                            *color1 = color1.to_dark_mode();
                            *color2 = color2.to_dark_mode();
                            changed = true;
                        }
                        FillType::DotPattern { color, bg_color, .. } => {
                            *color = color.to_dark_mode();
                            *bg_color = bg_color.to_dark_mode();
                            changed = true;
                        }
                        FillType::CrosshatchFill { color, bg_color, .. } => {
                            *color = color.to_dark_mode();
                            *bg_color = bg_color.to_dark_mode();
                            changed = true;
                        }
                        FillType::GradientMesh { mesh } => {
                            for pt in mesh.points.iter_mut() {
                                pt.color = pt.color.to_dark_mode();
                            }
                            changed = true;
                        }
                        _ => {} // Pattern/Image fills left as-is
                    }
                }
                // Convert strokes
                for stroke in node.strokes.iter_mut() {
                    if stroke.visible {
                        stroke.color = stroke.color.to_dark_mode();
                        changed = true;
                    }
                }
                // Convert shadows — also boost blur slightly for dark mode
                for shadow in node.shadows.iter_mut() {
                    if shadow.visible {
                        shadow.color = shadow.color.to_dark_mode();
                        // Increase shadow opacity for visibility on dark bg
                        shadow.color.a = (shadow.color.a * 1.3).min(1.0);
                        shadow.blur *= 1.2;
                        changed = true;
                    }
                }
                if changed { count += 1; }
            }
        }
        count
    }

    /// Convert selected nodes to dark mode theme.
    /// Returns the number of nodes affected.
    pub fn auto_dark_mode_selection(&mut self) -> u32 {
        use crate::node::FillType;
        let ids = self.selection.clone();
        let mut all_ids = Vec::new();
        for &id in &ids {
            for child_id in self.collect_subtree_ids(id) {
                all_ids.push(child_id);
            }
        }
        let mut count = 0u32;
        for id in all_ids {
            if let Some(node) = self.nodes.get_mut(&id) {
                let mut changed = false;
                for fill in node.fills.iter_mut() {
                    if !fill.visible { continue; }
                    match &mut fill.fill_type {
                        FillType::Solid { color } => { *color = color.to_dark_mode(); changed = true; }
                        FillType::LinearGradient { stops, .. } |
                        FillType::RadialGradient { stops, .. } |
                        FillType::ConicGradient { stops, .. } => {
                            for stop in stops.iter_mut() { stop.color = stop.color.to_dark_mode(); }
                            changed = true;
                        }
                        FillType::NoiseFill { color1, color2, .. } => {
                            *color1 = color1.to_dark_mode(); *color2 = color2.to_dark_mode(); changed = true;
                        }
                        FillType::DotPattern { color, bg_color, .. } => {
                            *color = color.to_dark_mode(); *bg_color = bg_color.to_dark_mode(); changed = true;
                        }
                        FillType::CrosshatchFill { color, bg_color, .. } => {
                            *color = color.to_dark_mode(); *bg_color = bg_color.to_dark_mode(); changed = true;
                        }
                        FillType::GradientMesh { mesh } => {
                            for pt in mesh.points.iter_mut() { pt.color = pt.color.to_dark_mode(); }
                            changed = true;
                        }
                        _ => {}
                    }
                }
                for stroke in node.strokes.iter_mut() {
                    if stroke.visible { stroke.color = stroke.color.to_dark_mode(); changed = true; }
                }
                for shadow in node.shadows.iter_mut() {
                    if shadow.visible {
                        shadow.color = shadow.color.to_dark_mode();
                        shadow.color.a = (shadow.color.a * 1.3).min(1.0);
                        shadow.blur *= 1.2;
                        changed = true;
                    }
                }
                if changed { count += 1; }
            }
        }
        count
    }

    // =============================================
    // Text Flow
    // =============================================

    /// Link text flow from one text node to another. Returns false if cycle detected or nodes invalid.
    pub fn link_text_flow(&mut self, from_id: NodeId, to_id: NodeId) -> bool {
        if from_id == to_id { return false; }
        // Both must be Text nodes
        if !matches!(self.get_node(from_id).map(|n| &n.kind), Some(NodeKind::Text { .. })) { return false; }
        if !matches!(self.get_node(to_id).map(|n| &n.kind), Some(NodeKind::Text { .. })) { return false; }
        // Cycle detection: walk from to_id forward, ensure we never reach from_id
        let mut cur = to_id;
        loop {
            if cur == from_id { return false; } // cycle
            match self.get_node(cur).and_then(|n| n.text_flow_next) {
                Some(next) => cur = next,
                None => break,
            }
        }
        if let Some(node) = self.get_node_mut(from_id) {
            node.text_flow_next = Some(to_id);
        }
        true
    }

    /// Unlink text flow from a node.
    pub fn unlink_text_flow(&mut self, from_id: NodeId) {
        if let Some(node) = self.get_node_mut(from_id) {
            node.text_flow_next = None;
        }
    }

    /// Get the full text flow chain starting from start_id.
    pub fn get_text_flow_chain(&self, start_id: NodeId) -> Vec<NodeId> {
        let mut chain = vec![start_id];
        let mut cur = start_id;
        let mut visited = std::collections::HashSet::new();
        visited.insert(cur);
        loop {
            match self.get_node(cur).and_then(|n| n.text_flow_next) {
                Some(next) if !visited.contains(&next) => {
                    chain.push(next);
                    visited.insert(next);
                    cur = next;
                }
                _ => break,
            }
        }
        chain
    }

    /// Distribute text across a flow chain by setting each node's text content.
    /// `capacities` is the max character count for each node in the chain.
    pub fn distribute_text_flow(&mut self, start_id: NodeId, full_text: &str, capacities: Vec<usize>) {
        let chain = self.get_text_flow_chain(start_id);
        let mut remaining = full_text;
        for (i, &nid) in chain.iter().enumerate() {
            let cap = capacities.get(i).copied().unwrap_or(usize::MAX);
            let take = remaining.len().min(cap);
            // Find a char boundary
            let take = if take < remaining.len() {
                // Try to break at word boundary
                let slice = &remaining[..take];
                match slice.rfind(|c: char| c.is_whitespace()) {
                    Some(pos) if pos > 0 => pos + 1,
                    _ => take,
                }
            } else {
                take
            };
            // Ensure we're at a char boundary
            let take = remaining.floor_char_boundary(take);
            let (chunk, rest) = remaining.split_at(take);
            if let Some(node) = self.get_node_mut(nid) {
                if let NodeKind::Text { ref mut content, .. } = node.kind {
                    *content = chunk.to_string();
                }
            }
            remaining = rest.trim_start();
            if remaining.is_empty() { break; }
        }
    }

    // =============================================
    // Annotation strokes (ephemeral review drawings)
    // =============================================

    pub fn add_annotation(&mut self, color: &str, width: f64, opacity: f64, created_at: f64) -> u64 {
        let id = self.next_annotation_id;
        self.next_annotation_id += 1;
        self.annotations.push(AnnotationStroke {
            id,
            points: vec![],
            color: color.to_string(),
            width,
            opacity,
            created_at,
        });
        id
    }

    pub fn annotation_add_point(&mut self, id: u64, x: f64, y: f64) {
        if let Some(a) = self.annotations.iter_mut().find(|a| a.id == id) {
            a.points.push((x, y));
        }
    }

    pub fn remove_annotation(&mut self, id: u64) {
        self.annotations.retain(|a| a.id != id);
    }

    pub fn get_annotations(&self) -> String {
        serde_json::to_string(&self.annotations).unwrap_or_else(|_| "[]".to_string())
    }

    pub fn clear_expired_annotations(&mut self, now_ms: f64, ttl_ms: f64) -> u32 {
        let before = self.annotations.len();
        self.annotations.retain(|a| (now_ms - a.created_at) < ttl_ms);
        (before - self.annotations.len()) as u32
    }

    // ── Path Morphing ────────────────────────────────────────

    /// Check if two nodes are both Paths and can be morphed.
    pub fn can_morph_paths(&self, id_a: u64, id_b: u64) -> bool {
        let a = self.get_node(id_a);
        let b = self.get_node(id_b);
        match (a, b) {
            (Some(na), Some(nb)) => {
                if let (
                    crate::node::NodeKind::Path { points: pa, .. },
                    crate::node::NodeKind::Path { points: pb, .. },
                ) = (&na.kind, &nb.kind) {
                    crate::path_morph::can_morph(pa, pb)
                } else {
                    false
                }
            }
            _ => false,
        }
    }

    /// Morph between two Path nodes at parameter t (0=from, 1=to).
    pub fn morph_paths(&self, from_id: u64, to_id: u64, t: f64) -> Option<crate::path_morph::MorphResult> {
        let from_node = self.get_node(from_id)?;
        let to_node = self.get_node(to_id)?;

        if let (
            crate::node::NodeKind::Path { points: from_pts, closed: from_closed },
            crate::node::NodeKind::Path { points: to_pts, closed: to_closed },
        ) = (&from_node.kind, &to_node.kind) {
            Some(crate::path_morph::morph_paths(from_pts, *from_closed, to_pts, *to_closed, t))
        } else {
            None
        }
    }
}
