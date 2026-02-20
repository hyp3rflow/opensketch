mod types;
mod transform;
mod node;
mod scene;
mod render;
mod hit_test;
pub mod component;
mod layout;

use wasm_bindgen::prelude::*;
use web_sys::CanvasRenderingContext2d;
use crate::node::{Node, NodeKind, Fill, Stroke, LayoutMode, FlexDirection, Align, Justify, FlexWrap, TextSizing};

fn parse_align(s: &str) -> Align {
    match s {
        "center" => Align::Center,
        "end" => Align::End,
        "stretch" => Align::Stretch,
        _ => Align::Start,
    }
}

fn parse_justify(s: &str) -> Justify {
    match s {
        "center" => Justify::Center,
        "end" => Justify::End,
        "space-between" | "between" => Justify::SpaceBetween,
        "space-around" | "around" => Justify::SpaceAround,
        "space-evenly" | "evenly" => Justify::SpaceEvenly,
        _ => Justify::Start,
    }
}
use crate::scene::Scene;
use crate::render::Renderer;
use crate::types::{Color, Point};
use crate::component::{ComponentStore, VariantProp, VariantPropType, VariantValue, VariantData, VariantKey, SlotDef, InstanceData, NodeOverrides};
use crate::node::Note;

#[wasm_bindgen]
pub struct Engine {
    scene: Scene,
    renderer: Renderer,
    editing_node: Option<u64>,
    components: ComponentStore,
    undo_stack: Vec<String>,
    redo_stack: Vec<String>,
}

#[wasm_bindgen]
impl Engine {
    #[wasm_bindgen(constructor)]
    pub fn new(width: f64, height: f64) -> Self {
        console_error_panic_hook::set_once();
        Self {
            scene: Scene::new(),
            renderer: Renderer::new(width, height),
            editing_node: None,
            components: ComponentStore::new(),
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
        }
    }

    pub fn render(&mut self, ctx: &CanvasRenderingContext2d) {
        self.renderer.measure_text_nodes(ctx, &mut self.scene);
        layout::compute_layouts(&mut self.scene);
        self.renderer.render(ctx, &self.scene, self.editing_node);
    }

    // =============================================
    // Undo / Redo
    // =============================================

    /// Save current scene state to undo stack. Call before any mutation.
    pub fn push_undo(&mut self) {
        let snapshot = serde_json::to_string(&self.scene.export()).unwrap_or_default();
        // Deduplicate: skip if identical to top of stack
        if self.undo_stack.last().map(|s| s.as_str()) == Some(snapshot.as_str()) {
            return;
        }
        self.undo_stack.push(snapshot);
        // Cap at 100 entries
        if self.undo_stack.len() > 100 {
            self.undo_stack.remove(0);
        }
        // Clear redo stack on new action
        self.redo_stack.clear();
    }

    /// Undo: restore previous state, push current to redo stack. Returns true if undone.
    pub fn undo(&mut self) -> bool {
        if let Some(prev) = self.undo_stack.pop() {
            let saved_selection = self.scene.selection.clone();
            let current = serde_json::to_string(&self.scene.export()).unwrap_or_default();
            self.redo_stack.push(current);
            if let Ok(data) = serde_json::from_str::<crate::scene::SceneData>(&prev) {
                self.scene = Scene::import(data);
                // Preserve selection (filter to nodes that still exist)
                self.scene.selection = saved_selection.into_iter()
                    .filter(|id| self.scene.get_node(*id).is_some())
                    .collect();
            }
            true
        } else {
            false
        }
    }

    /// Redo: restore next state, push current to undo stack. Returns true if redone.
    pub fn redo(&mut self) -> bool {
        if let Some(next) = self.redo_stack.pop() {
            let saved_selection = self.scene.selection.clone();
            let current = serde_json::to_string(&self.scene.export()).unwrap_or_default();
            self.undo_stack.push(current);
            if let Ok(data) = serde_json::from_str::<crate::scene::SceneData>(&next) {
                self.scene = Scene::import(data);
                self.scene.selection = saved_selection.into_iter()
                    .filter(|id| self.scene.get_node(*id).is_some())
                    .collect();
            }
            true
        } else {
            false
        }
    }

    /// Check if undo is available
    pub fn can_undo(&self) -> bool {
        !self.undo_stack.is_empty()
    }

    /// Check if redo is available
    pub fn can_redo(&self) -> bool {
        !self.redo_stack.is_empty()
    }

    pub fn set_editing(&mut self, id: Option<u64>) {
        self.editing_node = id;
    }

    pub fn resize(&mut self, width: f64, height: f64) {
        self.renderer.canvas_width = width;
        self.renderer.canvas_height = height;
    }

    pub fn add_rect(&mut self, x: f64, y: f64, w: f64, h: f64) -> u64 {
        let mut node = Node::new(0, NodeKind::Rect);
        node.x = x; node.y = y; node.width = w; node.height = h;
        node.name = format!("Rect {}", self.scene.node_count() + 1);
        self.scene.add_node(node)
    }

    pub fn add_ellipse(&mut self, x: f64, y: f64, w: f64, h: f64) -> u64 {
        let mut node = Node::new(0, NodeKind::Ellipse);
        node.x = x; node.y = y; node.width = w; node.height = h;
        node.name = format!("Ellipse {}", self.scene.node_count() + 1);
        self.scene.add_node(node)
    }

    pub fn add_text(&mut self, x: f64, y: f64, content: &str, font_size: f64) -> u64 {
        let mut node = Node::new(0, NodeKind::Text {
            content: content.to_string(),
            font_size,
            font_family: "Inter".to_string(),
        });
        node.x = x; node.y = y;
        node.width = content.len() as f64 * font_size * 0.6;
        node.height = font_size * 1.2;
        node.name = format!("Text {}", self.scene.node_count() + 1);
        node.fill = Some(Fill { color: Color::black() });
        self.scene.add_node(node)
    }

    pub fn add_frame(&mut self, x: f64, y: f64, w: f64, h: f64) -> u64 {
        let mut node = Node::new(0, NodeKind::Frame);
        node.x = x; node.y = y; node.width = w; node.height = h;
        node.name = format!("Frame {}", self.scene.node_count() + 1);
        node.fill = Some(Fill { color: Color::white() });
        self.scene.add_node(node)
    }

    pub fn remove_node(&mut self, id: u64) {
        self.scene.remove_node(id);
    }

    pub fn move_node(&mut self, id: u64, dx: f64, dy: f64) {
        self.scene.move_node(id, dx, dy);
    }

    pub fn resize_node(&mut self, id: u64, w: f64, h: f64) {
        self.scene.resize_node(id, w, h);
    }

    pub fn set_node_position(&mut self, id: u64, x: f64, y: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.x = x;
            node.y = y;
        }
    }

    pub fn set_fill_color(&mut self, id: u64, r: u8, g: u8, b: u8, a: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.fill = Some(Fill { color: Color { r, g, b, a } });
        }
    }

    pub fn set_stroke(&mut self, id: u64, r: u8, g: u8, b: u8, a: f64, width: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.stroke = Some(Stroke { color: Color { r, g, b, a }, width });
        }
    }

    pub fn set_corner_radius(&mut self, id: u64, radius: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.corner_radius = radius;
        }
    }

    pub fn set_opacity(&mut self, id: u64, opacity: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.opacity = opacity.clamp(0.0, 1.0);
        }
    }

    pub fn set_node_name(&mut self, id: u64, name: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.name = name.to_string();
        }
    }

    pub fn set_text_content(&mut self, id: u64, content: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Text { content: ref mut c, font_size, .. } = node.kind {
                *c = content.to_string();
                node.width = content.len() as f64 * font_size * 0.6;
            }
        }
    }

    pub fn set_font_size(&mut self, id: u64, size: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Text { ref mut font_size, ref content, .. } = node.kind {
                *font_size = size;
                node.width = content.len() as f64 * size * 0.6;
                node.height = size * 1.2;
            }
        }
    }

    pub fn set_font_family(&mut self, id: u64, family: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Text { ref mut font_family, .. } = node.kind {
                *font_family = family.to_string();
            }
        }
    }

    pub fn set_visible(&mut self, id: u64, visible: bool) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.visible = visible;
        }
    }

    pub fn set_locked(&mut self, id: u64, locked: bool) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.locked = locked;
        }
    }

    pub fn select(&mut self, id: u64) {
        self.scene.selection = vec![id];
    }

    pub fn add_to_selection(&mut self, id: u64) {
        if !self.scene.selection.contains(&id) {
            self.scene.selection.push(id);
        }
    }

    pub fn deselect_all(&mut self) {
        self.scene.selection.clear();
    }

    pub fn get_selection(&self) -> Vec<u64> {
        self.scene.selection.clone()
    }

    pub fn hit_test(&self, screen_x: f64, screen_y: f64) -> Option<u64> {
        let (sx, sy) = self.renderer.screen_to_scene(screen_x, screen_y);
        self.scene.hit_test(Point { x: sx, y: sy })
    }

    pub fn hit_test_handle(&self, screen_x: f64, screen_y: f64) -> i32 {
        let (sx, sy) = self.renderer.screen_to_scene(screen_x, screen_y);
        let handle_size = 8.0 / self.renderer.viewport.a;
        for &id in &self.scene.selection {
            if let Some(idx) = hit_test::hit_test_handles(&self.scene, id, Point { x: sx, y: sy }, handle_size) {
                return idx as i32;
            }
        }
        -1
    }

    pub fn zoom(&mut self, delta: f64, cx: f64, cy: f64) {
        self.renderer.zoom(delta, cx, cy);
    }

    pub fn pan(&mut self, dx: f64, dy: f64) {
        self.renderer.pan(dx, dy);
    }

    /// Center the viewport on a scene-space point
    pub fn pan_to(&mut self, scene_x: f64, scene_y: f64) {
        let zoom = self.renderer.viewport.a;
        let cx = self.renderer.canvas_width / 2.0;
        let cy = self.renderer.canvas_height / 2.0;
        self.renderer.viewport.tx = cx - scene_x * zoom;
        self.renderer.viewport.ty = cy - scene_y * zoom;
    }

    pub fn get_zoom(&self) -> f64 {
        self.renderer.viewport.a
    }

    pub fn screen_to_scene_x(&self, x: f64, y: f64) -> f64 {
        self.renderer.screen_to_scene(x, y).0
    }

    pub fn screen_to_scene_y(&self, x: f64, y: f64) -> f64 {
        self.renderer.screen_to_scene(x, y).1
    }

    pub fn get_node_json(&self, id: u64) -> Option<String> {
        self.scene.get_node(id).map(|n| serde_json::to_string(n).unwrap_or_default())
    }

    pub fn get_layer_list(&self) -> String {
        let layers: Vec<_> = self.scene.render_order().iter()
            .filter_map(|&id| {
                self.scene.get_node(id).map(|n| {
                    serde_json::json!({
                        "id": n.id,
                        "name": n.name,
                        "kind": format!("{:?}", n.kind),
                        "visible": n.visible,
                        "locked": n.locked,
                        "parent": n.parent,
                        "children": n.children,
                    })
                })
            })
            .collect();
        serde_json::to_string(&layers).unwrap_or_default()
    }

    /// Get root-level node IDs (no parent)
    pub fn get_root_children(&self) -> String {
        serde_json::to_string(&self.scene.export().root_children).unwrap_or_default()
    }

    // === File I/O ===

    /// Export entire scene as JSON
    pub fn export_scene(&self) -> String {
        serde_json::to_string(&self.scene.export()).unwrap_or_default()
    }

    /// Import scene from JSON, replacing current scene
    pub fn import_scene(&mut self, json: &str) -> bool {
        match serde_json::from_str::<crate::scene::SceneData>(json) {
            Ok(data) => {
                self.scene = crate::scene::Scene::import(data);
                true
            }
            Err(_) => false,
        }
    }

    // === Frame Tools ===

    /// Get all children of a frame/group node
    pub fn get_frame_children(&self, id: u64) -> String {
        let children = self.scene.get_children_of(id);
        let result: Vec<_> = children.iter()
            .filter_map(|&cid| {
                self.scene.get_node(cid).map(|n| serde_json::to_value(n).unwrap_or_default())
            })
            .collect();
        serde_json::to_string(&result).unwrap_or_default()
    }

    /// Get full subtree of a frame (recursive) as JSON
    pub fn get_frame_tree(&self, id: u64) -> String {
        fn collect(scene: &crate::scene::Scene, id: u64) -> serde_json::Value {
            if let Some(node) = scene.get_node(id) {
                let children: Vec<_> = node.children.iter().map(|&cid| collect(scene, cid)).collect();
                let mut val = serde_json::to_value(node).unwrap_or_default();
                if let Some(obj) = val.as_object_mut() {
                    obj.insert("_children".to_string(), serde_json::Value::Array(children));
                }
                val
            } else {
                serde_json::Value::Null
            }
        }
        serde_json::to_string(&collect(&self.scene, id)).unwrap_or_default()
    }

    /// Move a node into a frame (reparent)
    pub fn reparent_node(&mut self, node_id: u64, new_parent: Option<u64>) {
        self.scene.reparent(node_id, new_parent);
    }

    /// Duplicate a node (shallow copy)
    pub fn duplicate_node(&mut self, id: u64) -> u64 {
        if let Some(node) = self.scene.get_node(id) {
            let mut new_node = node.clone();
            new_node.x += 20.0;
            new_node.y += 20.0;
            new_node.parent = node.parent;
            new_node.children = vec![];
            self.scene.add_node(new_node)
        } else {
            0
        }
    }

    /// Get all frames (nodes of kind Frame)
    pub fn get_frames(&self) -> String {
        let frames: Vec<_> = self.scene.all_node_ids().iter()
            .filter_map(|&id| {
                self.scene.get_node(id).and_then(|n| {
                    match n.kind {
                        NodeKind::Frame => Some(serde_json::json!({
                            "id": n.id,
                            "name": n.name,
                            "x": n.x,
                            "y": n.y,
                            "width": n.width,
                            "height": n.height,
                            "children_count": n.children.len(),
                        })),
                        _ => None,
                    }
                })
            })
            .collect();
        serde_json::to_string(&frames).unwrap_or_default()
    }

    /// Find nodes by name (partial match)
    pub fn find_by_name(&self, query: &str) -> String {
        let lower = query.to_lowercase();
        let results: Vec<_> = self.scene.all_node_ids().iter()
            .filter_map(|&id| {
                self.scene.get_node(id).and_then(|n| {
                    if n.name.to_lowercase().contains(&lower) {
                        Some(serde_json::json!({
                            "id": n.id,
                            "name": n.name,
                            "kind": format!("{:?}", n.kind),
                        }))
                    } else {
                        None
                    }
                })
            })
            .collect();
        serde_json::to_string(&results).unwrap_or_default()
    }

    // =============================================
    // Component System
    // =============================================

    /// Create a component from an existing frame node.
    /// The frame's subtree becomes the default variant template.
    pub fn create_component(&mut self, frame_id: u64, name: &str) -> u64 {
        let comp_id = self.components.create(name.to_string());

        // Deep clone the frame subtree as template
        let nodes = self.deep_clone_subtree(frame_id);
        let default_key = std::collections::HashMap::new();
        let key_str = String::new();

        if let Some(comp) = self.components.get_mut(comp_id) {
            comp.default_variant_key = key_str.clone();
            comp.variants.insert(key_str, VariantData {
                key: default_key,
                root_node_id: frame_id,
                nodes,
            });
        }

        // Mark the original frame as a component source (via name prefix)
        if let Some(node) = self.scene.get_node_mut(frame_id) {
            node.name = node.name.trim_start_matches("⬡ ").trim_start_matches("[C] ").to_string();
            node.name = format!("[C] {}", node.name);
        }

        comp_id
    }

    fn deep_clone_subtree(&self, id: u64) -> Vec<Node> {
        let mut result = vec![];
        if let Some(node) = self.scene.get_node(id) {
            result.push(node.clone());
            for &child_id in &node.children {
                result.extend(self.deep_clone_subtree(child_id));
            }
        }
        result
    }

    /// Add a variant property to a component
    pub fn add_variant_prop(&mut self, comp_id: u64, name: &str, prop_type_json: &str) -> bool {
        let prop: Result<serde_json::Value, _> = serde_json::from_str(prop_type_json);
        let prop = match prop {
            Ok(v) => v,
            Err(_) => return false,
        };

        let (pt, default) = if prop.get("type").and_then(|t| t.as_str()) == Some("boolean") {
            let def = prop.get("default").and_then(|d| d.as_bool()).unwrap_or(false);
            (VariantPropType::Boolean, VariantValue::Boolean(def))
        } else if prop.get("type").and_then(|t| t.as_str()) == Some("string") {
            let options: Vec<String> = prop.get("options")
                .and_then(|o| o.as_array())
                .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default();
            let def = prop.get("default").and_then(|d| d.as_str())
                .unwrap_or(options.first().map(|s| s.as_str()).unwrap_or(""))
                .to_string();
            (VariantPropType::String { options }, VariantValue::String(def))
        } else {
            return false;
        };

        if let Some(comp) = self.components.get_mut(comp_id) {
            comp.properties.push(VariantProp {
                name: name.to_string(),
                prop_type: pt,
                default_value: default,
            });
            true
        } else {
            false
        }
    }

    /// Add a variant (combination of prop values) with its own template nodes
    pub fn add_variant(&mut self, comp_id: u64, key_json: &str, frame_id: u64) -> bool {
        let key: Result<VariantKey, _> = serde_json::from_str(key_json);
        let key = match key {
            Ok(k) => k,
            Err(_) => return false,
        };

        let nodes = self.deep_clone_subtree(frame_id);

        if let Some(comp) = self.components.get_mut(comp_id) {
            comp.set_variant(key, VariantData {
                key: std::collections::HashMap::new(),
                root_node_id: frame_id,
                nodes,
            });
            true
        } else {
            false
        }
    }

    /// Add a slot definition to a component
    pub fn add_slot(&mut self, comp_id: u64, slot_name: &str, placeholder_node_id: u64) -> bool {
        if let Some(comp) = self.components.get_mut(comp_id) {
            comp.slots.push(SlotDef {
                name: slot_name.to_string(),
                placeholder_node_id,
                default_children: vec![],
            });
            // Mark placeholder node as Slot kind
            if let Some(node) = self.scene.get_node_mut(placeholder_node_id) {
                node.kind = NodeKind::Slot { slot_name: slot_name.to_string() };
                node.name = format!("[S] {}", slot_name);
            }
            true
        } else {
            false
        }
    }

    /// Create an instance of a component at (x, y).
    /// Deep-clones the default variant's template into the scene.
    pub fn create_instance(&mut self, comp_id: u64, x: f64, y: f64) -> u64 {
        let comp = match self.components.get(comp_id) {
            Some(c) => c.clone(),
            None => return 0,
        };

        let default_key = comp.default_key();
        let variant = match comp.get_variant(&default_key) {
            Some(v) => v.clone(),
            None => match comp.variants.values().next() {
                Some(v) => v.clone(),
                None => return 0,
            }
        };

        // Create the instance root frame
        let mut instance_root = Node::new(0, NodeKind::Instance(Box::new(InstanceData {
            component_id: comp_id,
            variant_values: default_key,
            slot_fills: std::collections::HashMap::new(),
            overrides: std::collections::HashMap::new(),
        })));
        instance_root.name = format!("[I] {}", comp.name);

        // Copy geometry + layout from template root
        if let Some(template_root) = variant.nodes.first() {
            instance_root.width = template_root.width;
            instance_root.height = template_root.height;
            instance_root.fill = template_root.fill.clone();
            instance_root.stroke = template_root.stroke.clone();
            instance_root.corner_radius = template_root.corner_radius;
            instance_root.layout = template_root.layout.clone();
        }

        instance_root.x = x;
        instance_root.y = y;

        let root_id = self.scene.add_node(instance_root);

        // Deep-clone template children into scene as children of instance root
        if let Some(template_root) = variant.nodes.first() {
            let offset_x = x - template_root.x;
            let offset_y = y - template_root.y;
            self.clone_template_children(template_root, &variant.nodes, root_id, offset_x, offset_y);
        }

        root_id
    }

    fn clone_template_children(&mut self, template_parent: &Node, all_nodes: &[Node], scene_parent: u64, dx: f64, dy: f64) {
        for &child_id in &template_parent.children {
            if let Some(template_child) = all_nodes.iter().find(|n| n.id == child_id) {
                let mut new_node = template_child.clone();
                // Only offset if parent doesn't have layout (layout will reposition)
                let parent_has_layout = self.scene.get_node(scene_parent)
                    .map(|p| p.layout.mode != LayoutMode::None)
                    .unwrap_or(false);
                if !parent_has_layout {
                    new_node.x += dx;
                    new_node.y += dy;
                }
                new_node.parent = Some(scene_parent);
                new_node.children = vec![];
                let new_id = self.scene.add_node(new_node);
                self.clone_template_children(template_child, all_nodes, new_id, dx, dy);
            }
        }
    }

    /// Switch an instance to a different variant
    pub fn set_instance_variant(&mut self, instance_id: u64, key_json: &str) -> bool {
        let key: Result<VariantKey, _> = serde_json::from_str(key_json);
        let key = match key {
            Ok(k) => k,
            Err(_) => return false,
        };

        // Get component ID from instance
        let comp_id = if let Some(node) = self.scene.get_node(instance_id) {
            if let NodeKind::Instance(data) = &node.kind {
                data.component_id
            } else {
                return false;
            }
        } else {
            return false;
        };

        let comp = match self.components.get(comp_id) {
            Some(c) => c.clone(),
            None => return false,
        };

        let variant = match comp.get_variant(&key) {
            Some(v) => v.clone(),
            None => return false,
        };

        // Remove old children
        if let Some(node) = self.scene.get_node(instance_id) {
            let old_children = node.children.clone();
            for cid in old_children {
                self.scene.remove_node(cid);
            }
        }

        // Get instance position
        let (x, y) = if let Some(node) = self.scene.get_node(instance_id) {
            (node.x, node.y)
        } else {
            return false;
        };

        // Update instance variant values
        if let Some(node) = self.scene.get_node_mut(instance_id) {
            if let NodeKind::Instance(data) = &mut node.kind {
                data.variant_values = key;
            }
            // Update geometry + layout from new variant
            if let Some(template_root) = variant.nodes.first() {
                node.width = template_root.width;
                node.height = template_root.height;
                node.fill = template_root.fill.clone();
                node.stroke = template_root.stroke.clone();
                node.corner_radius = template_root.corner_radius;
                node.layout = template_root.layout.clone();
            }
        }

        // Clone new variant's children
        if let Some(template_root) = variant.nodes.first() {
            let dx = x - template_root.x;
            let dy = y - template_root.y;
            self.clone_template_children(template_root, &variant.nodes, instance_id, dx, dy);
        }

        true
    }

    /// Fill a slot in an instance with a node
    pub fn fill_slot(&mut self, instance_id: u64, slot_name: &str, content_node_id: u64) -> bool {
        // Find the slot placeholder in instance children
        let slot_node = self.find_slot_in_children(instance_id, slot_name);
        if let Some(slot_id) = slot_node {
            // Reparent the content into the slot
            self.scene.reparent(content_node_id, Some(slot_id));

            // Update instance's slot_fills
            if let Some(node) = self.scene.get_node_mut(instance_id) {
                if let NodeKind::Instance(data) = &mut node.kind {
                    data.slot_fills.entry(slot_name.to_string())
                        .or_insert_with(Vec::new)
                        .push(content_node_id);
                }
            }
            true
        } else {
            false
        }
    }

    fn find_slot_in_children(&self, parent_id: u64, slot_name: &str) -> Option<u64> {
        if let Some(node) = self.scene.get_node(parent_id) {
            for &child_id in &node.children {
                if let Some(child) = self.scene.get_node(child_id) {
                    if let NodeKind::Slot { slot_name: ref sn } = child.kind {
                        if sn == slot_name {
                            return Some(child_id);
                        }
                    }
                    // Recurse
                    if let Some(found) = self.find_slot_in_children(child_id, slot_name) {
                        return Some(found);
                    }
                }
            }
        }
        None
    }

    /// List all components
    pub fn get_components(&self) -> String {
        let list: Vec<_> = self.components.list().iter().map(|c| {
            serde_json::json!({
                "id": c.id,
                "name": c.name,
                "properties": c.properties.iter().map(|p| {
                    serde_json::json!({
                        "name": p.name,
                        "type": match &p.prop_type {
                            VariantPropType::Boolean => "boolean".to_string(),
                            VariantPropType::String { options } => format!("string({})", options.join("|")),
                        },
                        "default": p.default_value.to_display(),
                    })
                }).collect::<Vec<_>>(),
                "slots": c.slots.iter().map(|s| &s.name).collect::<Vec<_>>(),
                "variant_count": c.variants.len(),
            })
        }).collect();
        serde_json::to_string(&list).unwrap_or_default()
    }

    /// Get component detail
    pub fn get_component(&self, comp_id: u64) -> String {
        match self.components.get(comp_id) {
            Some(c) => serde_json::to_string(c).unwrap_or_default(),
            None => "null".to_string(),
        }
    }

    /// Override a text property in an instance child
    pub fn set_instance_override(&mut self, instance_id: u64, target_node_id: u64, override_json: &str) -> bool {
        let overrides: Result<NodeOverrides, _> = serde_json::from_str(override_json);
        let overrides = match overrides {
            Ok(o) => o,
            Err(_) => return false,
        };

        // Apply text override directly to the scene node
        if let Some(text) = &overrides.text {
            if let Some(node) = self.scene.get_node_mut(target_node_id) {
                if let NodeKind::Text { content, .. } = &mut node.kind {
                    *content = text.clone();
                }
            }
        }

        if let Some(vis) = overrides.visible {
            if let Some(node) = self.scene.get_node_mut(target_node_id) {
                node.visible = vis;
            }
        }

        // Store override in instance data
        if let Some(node) = self.scene.get_node_mut(instance_id) {
            if let NodeKind::Instance(data) = &mut node.kind {
                data.overrides.insert(target_node_id, overrides);
            }
        }

        true
    }

    // =============================================
    // Instance → Component info
    // =============================================

    /// Get component info for an instance node. Returns JSON: { component_id, component_name, source_node_id } or "null"
    pub fn get_instance_component_info(&self, node_id: u64) -> String {
        let comp_id = if let Some(node) = self.scene.get_node(node_id) {
            match &node.kind {
                NodeKind::Instance(data) => data.component_id,
                _ => return "null".to_string(),
            }
        } else {
            return "null".to_string();
        };

        if let Some(comp) = self.components.get(comp_id) {
            // Find source node from default variant
            let source_id = comp.variants.get(&comp.default_variant_key)
                .map(|v| v.root_node_id)
                .unwrap_or(0);
            format!(
                r#"{{"component_id":{},"component_name":"{}","source_node_id":{}}}"#,
                comp_id,
                comp.name.replace('"', "\\\""),
                source_id
            )
        } else {
            "null".to_string()
        }
    }

    // =============================================
    // Text Sizing
    // =============================================

    /// Set text sizing mode: "fit" or "fixed"
    pub fn set_text_sizing(&mut self, id: u64, mode: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.text_sizing = match mode {
                "fixed" => TextSizing::Fixed,
                _ => TextSizing::Fit,
            };
        }
    }

    /// Get text sizing mode
    pub fn get_text_sizing(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            match node.text_sizing {
                TextSizing::Fit => "fit".to_string(),
                TextSizing::Fixed => "fixed".to_string(),
            }
        } else {
            "fit".to_string()
        }
    }

    // =============================================
    // Layout
    // =============================================

    /// Set layout mode on a node: "none", "flex", "grid"
    pub fn set_layout_mode(&mut self, id: u64, mode: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.layout.mode = match mode {
                "flex" => LayoutMode::Flex,
                "grid" => LayoutMode::Grid,
                _ => LayoutMode::None,
            };
        }
    }

    /// Set flex direction: "row" or "column"
    pub fn set_flex_direction(&mut self, id: u64, dir: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.layout.direction = match dir {
                "column" | "col" => FlexDirection::Column,
                _ => FlexDirection::Row,
            };
        }
    }

    /// Set align-items: "start", "center", "end", "stretch"
    pub fn set_align_items(&mut self, id: u64, align: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.layout.align_items = parse_align(align);
        }
    }

    /// Set justify-content: "start", "center", "end", "space-between", "space-around", "space-evenly"
    pub fn set_justify_content(&mut self, id: u64, justify: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.layout.justify_content = parse_justify(justify);
        }
    }

    /// Set gap between children
    pub fn set_layout_gap(&mut self, id: u64, gap: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.layout.gap = gap;
        }
    }

    /// Set padding (all sides)
    pub fn set_layout_padding(&mut self, id: u64, top: f64, right: f64, bottom: f64, left: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.layout.padding_top = top;
            node.layout.padding_right = right;
            node.layout.padding_bottom = bottom;
            node.layout.padding_left = left;
        }
    }

    /// Set grid columns
    pub fn set_grid_columns(&mut self, id: u64, cols: u32) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.layout.grid_columns = cols;
        }
    }

    /// Set flex wrap: "nowrap" or "wrap"
    pub fn set_flex_wrap(&mut self, id: u64, wrap: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.layout.wrap = match wrap {
                "wrap" => FlexWrap::Wrap,
                _ => FlexWrap::NoWrap,
            };
        }
    }

    /// Get layout as JSON
    pub fn get_layout(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            serde_json::to_string(&node.layout).unwrap_or_default()
        } else {
            "null".to_string()
        }
    }

    // =============================================
    // Notes
    // =============================================

    /// Add a note to a node
    pub fn add_note(&mut self, node_id: u64, content: &str, tags_json: &str) -> bool {
        let tags: Vec<String> = serde_json::from_str(tags_json).unwrap_or_default();
        if let Some(node) = self.scene.get_node_mut(node_id) {
            node.notes.push(Note {
                content: content.to_string(),
                tags,
                updated_at: js_sys::Date::now() as u64,
            });
            true
        } else {
            false
        }
    }

    /// Update a note by index
    pub fn update_note(&mut self, node_id: u64, index: usize, content: &str) -> bool {
        if let Some(node) = self.scene.get_node_mut(node_id) {
            if let Some(note) = node.notes.get_mut(index) {
                note.content = content.to_string();
                note.updated_at = js_sys::Date::now() as u64;
                return true;
            }
        }
        false
    }

    /// Remove a note by index
    pub fn remove_note(&mut self, node_id: u64, index: usize) -> bool {
        if let Some(node) = self.scene.get_node_mut(node_id) {
            if index < node.notes.len() {
                node.notes.remove(index);
                return true;
            }
        }
        false
    }

    /// Get all notes for a node as JSON
    pub fn get_notes(&self, node_id: u64) -> String {
        if let Some(node) = self.scene.get_node(node_id) {
            serde_json::to_string(&node.notes).unwrap_or_default()
        } else {
            "[]".to_string()
        }
    }

    /// Get node JSON enriched with notes (for agent consumption)
    pub fn get_node_with_notes(&self, node_id: u64) -> String {
        if let Some(node) = self.scene.get_node(node_id) {
            let mut val = serde_json::to_value(node).unwrap_or_default();
            if let Some(obj) = val.as_object_mut() {
                // Add children tree summary
                let children_summary: Vec<_> = node.children.iter().filter_map(|&cid| {
                    self.scene.get_node(cid).map(|c| serde_json::json!({
                        "id": c.id,
                        "name": c.name,
                        "kind": format!("{:?}", c.kind),
                        "notes_count": c.notes.len(),
                    }))
                }).collect();
                obj.insert("children_summary".to_string(), serde_json::Value::Array(children_summary));
            }
            serde_json::to_string(&val).unwrap_or_default()
        } else {
            "null".to_string()
        }
    }
}
