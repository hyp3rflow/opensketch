mod types;
mod transform;
mod node;
mod scene;
mod render;
mod hit_test;
pub mod component;
mod layout;
pub mod layout_suggest;
mod svg_export;
mod boolean_ops;
pub mod styles;
pub mod variable;
mod design_tokens;
pub mod path_utils;
pub mod animation;
mod design_lint;
mod color_palette;
mod smart_select;
pub mod vector_network;
pub mod branch;
mod find_replace;

use wasm_bindgen::prelude::*;
use web_sys::CanvasRenderingContext2d;
use i_overlay::core::fill_rule::FillRule;
use i_overlay::core::overlay_rule::OverlayRule;
use i_overlay::float::single::SingleFloatOverlay;
use crate::node::{Node, NodeKind, Fill, FillType, GradientStop, Stroke, StrokeAlign, LayoutMode, FlexDirection, Align, Justify, FlexWrap, TextSizing, TextAlign, FontStyle, PathPoint, ConstraintH, ConstraintV, BlendMode, LayoutGrid, SizingMode, Breakpoint};

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
use crate::node::{Note, Shadow, Interaction, InteractionTrigger, InteractionAction, TransitionType};
use crate::styles::StyleStore;

#[wasm_bindgen]
pub struct Engine {
    scene: Scene,
    renderer: Renderer,
    editing_node: Option<u64>,
    components: ComponentStore,
    styles: StyleStore,
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
            styles: StyleStore::new(),
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
        }
    }

    pub fn render(&mut self, ctx: &CanvasRenderingContext2d) {
        self.scene.apply_variables();
        self.renderer.measure_text_nodes(ctx, &mut self.scene);
        layout::compute_layouts(&mut self.scene);
        self.renderer.render(ctx, &self.scene, self.editing_node);
    }

    // =============================================
    // Performance Stats
    // =============================================

    /// Get the number of nodes rendered in the last frame (after viewport culling)
    pub fn get_rendered_count(&self) -> u32 {
        self.renderer.last_rendered_count.get()
    }

    /// Get the number of nodes culled (skipped) in the last frame
    pub fn get_culled_count(&self) -> u32 {
        self.renderer.last_culled_count.get()
    }

    /// Get total node count in the scene
    pub fn get_node_count(&self) -> u32 {
        self.scene.node_count() as u32
    }

    /// Get IDs of nodes visible in the given viewport rectangle (scene coordinates).
    /// Useful for TS-side optimizations.
    pub fn get_visible_nodes(&self, vp_x: f64, vp_y: f64, vp_w: f64, vp_h: f64) -> Vec<u64> {
        let vp = render::ViewportBounds {
            min_x: vp_x,
            min_y: vp_y,
            max_x: vp_x + vp_w,
            max_y: vp_y + vp_h,
        };
        let mut result = vec![];
        for node in self.scene.all_nodes() {
            if node.visible && render::Renderer::is_node_visible_in_viewport(node, &vp) {
                result.push(node.id);
            }
        }
        result
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
            line_height: 1.2,
            text_align: TextAlign::default(),
            font_weight: 400,
            font_style: FontStyle::default(),
            text_decoration: crate::node::TextDecoration::default(),
            letter_spacing: 0.0,
            paragraph_spacing: 0.0,
        });
        node.x = x; node.y = y;
        node.width = content.len() as f64 * font_size * 0.6;
        node.height = font_size * 1.2;
        node.name = format!("Text {}", self.scene.node_count() + 1);
        node.fills = vec![Fill::solid(Color::black())];
        self.scene.add_node(node)
    }

    pub fn add_star(&mut self, x: f64, y: f64, w: f64, h: f64, points: u32, inner_radius: f64) -> u64 {
        let mut node = Node::new(0, NodeKind::Star { points: points.max(3), inner_radius: inner_radius.clamp(0.0, 1.0) });
        node.x = x; node.y = y; node.width = w; node.height = h;
        node.name = format!("Star {}", self.scene.node_count() + 1);
        self.scene.add_node(node)
    }

    pub fn add_polygon(&mut self, x: f64, y: f64, w: f64, h: f64, sides: u32) -> u64 {
        let mut node = Node::new(0, NodeKind::Polygon { sides: sides.max(3) });
        node.x = x; node.y = y; node.width = w; node.height = h;
        node.name = format!("Polygon {}", self.scene.node_count() + 1);
        self.scene.add_node(node)
    }

    pub fn set_star_points(&mut self, id: u64, points: u32) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Star { points: ref mut p, .. } = node.kind {
                *p = points.max(3);
            }
        }
    }

    pub fn set_star_inner_radius(&mut self, id: u64, inner_radius: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Star { inner_radius: ref mut ir, .. } = node.kind {
                *ir = inner_radius.clamp(0.0, 1.0);
            }
        }
    }

    pub fn set_polygon_sides(&mut self, id: u64, sides: u32) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Polygon { sides: ref mut s } = node.kind {
                *s = sides.max(3);
            }
        }
    }

    pub fn get_star_points(&self, id: u64) -> u32 {
        if let Some(node) = self.scene.get_node(id) {
            if let NodeKind::Star { points, .. } = node.kind { return points; }
        }
        5
    }

    pub fn get_star_inner_radius(&self, id: u64) -> f64 {
        if let Some(node) = self.scene.get_node(id) {
            if let NodeKind::Star { inner_radius, .. } = node.kind { return inner_radius; }
        }
        0.4
    }

    pub fn get_polygon_sides(&self, id: u64) -> u32 {
        if let Some(node) = self.scene.get_node(id) {
            if let NodeKind::Polygon { sides } = node.kind { return sides; }
        }
        6
    }

    pub fn add_image(&mut self, x: f64, y: f64, w: f64, h: f64, src: &str) -> u64 {
        let mut node = Node::new(0, NodeKind::Image {
            src: src.to_string(),
            fit: "cover".to_string(),
        });
        node.x = x; node.y = y; node.width = w; node.height = h;
        node.name = format!("Image {}", self.scene.node_count() + 1);
        node.fills = vec![];
        self.scene.add_node(node)
    }

    pub fn set_image_src(&mut self, id: u64, src: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Image { src: ref mut s, .. } = node.kind {
                *s = src.to_string();
            }
        }
    }

    // =============================================
    // Path / Pen tool
    // =============================================

    /// Create a new empty path node at the given position
    pub fn add_path(&mut self, x: f64, y: f64) -> u64 {
        let mut node = Node::new(0, NodeKind::Path { points: vec![], closed: false });
        node.x = x; node.y = y; node.width = 0.0; node.height = 0.0;
        node.name = format!("Path {}", self.scene.node_count() + 1);
        node.fills = vec![];
        node.strokes = vec![Stroke::new(crate::types::Color::white(), 2.0)];
        self.scene.add_node(node)
    }

    /// Add a corner point (no bezier handles) to a path
    pub fn path_add_point(&mut self, id: u64, x: f64, y: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Path { ref mut points, .. } = node.kind {
                points.push(PathPoint::corner(x, y));
                recalc_path_bounds(node);
            }
        }
    }

    /// Add a point with bezier handles to a path
    pub fn path_add_curve_point(&mut self, id: u64, x: f64, y: f64, hix: f64, hiy: f64, hox: f64, hoy: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Path { ref mut points, .. } = node.kind {
                points.push(PathPoint { x, y, handle_in_x: hix, handle_in_y: hiy, handle_out_x: hox, handle_out_y: hoy });
                recalc_path_bounds(node);
            }
        }
    }

    /// Update a path point's position
    pub fn path_set_point(&mut self, id: u64, index: u32, x: f64, y: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Path { ref mut points, .. } = node.kind {
                if let Some(pt) = points.get_mut(index as usize) {
                    let dx = x - pt.x;
                    let dy = y - pt.y;
                    pt.x = x; pt.y = y;
                    pt.handle_in_x += dx; pt.handle_in_y += dy;
                    pt.handle_out_x += dx; pt.handle_out_y += dy;
                }
                recalc_path_bounds(node);
            }
        }
    }

    /// Update a path point's outgoing handle
    pub fn path_set_handle_out(&mut self, id: u64, index: u32, hx: f64, hy: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Path { ref mut points, .. } = node.kind {
                if let Some(pt) = points.get_mut(index as usize) {
                    pt.handle_out_x = hx; pt.handle_out_y = hy;
                    // Mirror: set handle_in symmetrically
                    pt.handle_in_x = 2.0 * pt.x - hx;
                    pt.handle_in_y = 2.0 * pt.y - hy;
                }
                recalc_path_bounds(node);
            }
        }
    }

    /// Update a path point's incoming handle
    pub fn path_set_handle_in(&mut self, id: u64, index: u32, hx: f64, hy: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Path { ref mut points, .. } = node.kind {
                if let Some(pt) = points.get_mut(index as usize) {
                    pt.handle_in_x = hx; pt.handle_in_y = hy;
                }
                recalc_path_bounds(node);
            }
        }
    }

    /// Remove a point from a path by index
    pub fn path_remove_point(&mut self, id: u64, index: u32) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Path { ref mut points, .. } = node.kind {
                if (index as usize) < points.len() {
                    points.remove(index as usize);
                }
                recalc_path_bounds(node);
            }
        }
    }

    /// Close or open a path
    pub fn path_set_closed(&mut self, id: u64, closed: bool) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Path { closed: ref mut c, .. } = node.kind {
                *c = closed;
            }
        }
    }

    /// Get path data as JSON: { points: [...], closed: bool }
    pub fn path_get_data(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            if let NodeKind::Path { ref points, closed } = node.kind {
                return serde_json::to_string(&serde_json::json!({
                    "points": points,
                    "closed": closed,
                })).unwrap_or_default();
            }
        }
        "{}".to_string()
    }

    /// Get the number of points in a path
    pub fn path_point_count(&self, id: u64) -> u32 {
        if let Some(node) = self.scene.get_node(id) {
            if let NodeKind::Path { ref points, .. } = node.kind {
                return points.len() as u32;
            }
        }
        0
    }

    // =============================================
    // Vector Network
    // =============================================

    /// Create a new vector network node
    pub fn add_vector_network(&mut self, x: f64, y: f64, w: f64, h: f64) -> u64 {
        let mut node = Node::new(0, NodeKind::VectorNetwork(Box::new(crate::vector_network::VectorNetwork::new())));
        node.x = x; node.y = y; node.width = w; node.height = h;
        node.name = format!("Vector {}", self.scene.node_count() + 1);
        node.fills = vec![Fill::solid(Color { r: 200, g: 200, b: 200, a: 1.0 })];
        node.strokes = vec![Stroke::new(Color::white(), 2.0)];
        self.scene.add_node(node)
    }

    /// Add a vertex to a vector network node, returns vertex id
    pub fn vn_add_vertex(&mut self, node_id: u64, x: f64, y: f64) -> u64 {
        if let Some(node) = self.scene.get_node_mut(node_id) {
            if let NodeKind::VectorNetwork(ref mut vn) = node.kind {
                let vid = vn.add_vertex(x, y);
                recalc_vn_bounds(node);
                return vid;
            }
        }
        0
    }

    /// Remove a vertex from a vector network
    pub fn vn_remove_vertex(&mut self, node_id: u64, vertex_id: u64) {
        if let Some(node) = self.scene.get_node_mut(node_id) {
            if let NodeKind::VectorNetwork(ref mut vn) = node.kind {
                vn.remove_vertex(vertex_id);
                recalc_vn_bounds(node);
            }
        }
    }

    /// Add a segment between two vertices. handle coords are 0,0 for no handle.
    pub fn vn_add_segment(&mut self, node_id: u64, start_v: u64, end_v: u64, hs_x: f64, hs_y: f64, he_x: f64, he_y: f64) -> u64 {
        if let Some(node) = self.scene.get_node_mut(node_id) {
            if let NodeKind::VectorNetwork(ref mut vn) = node.kind {
                let hs = if hs_x == 0.0 && hs_y == 0.0 { None } else { Some((hs_x, hs_y)) };
                let he = if he_x == 0.0 && he_y == 0.0 { None } else { Some((he_x, he_y)) };
                let sid = vn.add_segment(start_v, end_v, hs, he);
                return sid;
            }
        }
        0
    }

    /// Remove a segment from a vector network
    pub fn vn_remove_segment(&mut self, node_id: u64, segment_id: u64) {
        if let Some(node) = self.scene.get_node_mut(node_id) {
            if let NodeKind::VectorNetwork(ref mut vn) = node.kind {
                vn.remove_segment(segment_id);
            }
        }
    }

    /// Get vector network data as JSON
    pub fn vn_get_data(&self, node_id: u64) -> String {
        if let Some(node) = self.scene.get_node(node_id) {
            if let NodeKind::VectorNetwork(ref vn) = node.kind {
                return serde_json::to_string(vn.as_ref()).unwrap_or_else(|_| "{}".to_string());
            }
        }
        "{}".to_string()
    }

    /// Update a vertex position
    pub fn vn_update_vertex(&mut self, node_id: u64, vertex_id: u64, x: f64, y: f64) {
        if let Some(node) = self.scene.get_node_mut(node_id) {
            if let NodeKind::VectorNetwork(ref mut vn) = node.kind {
                vn.update_vertex(vertex_id, x, y);
                recalc_vn_bounds(node);
            }
        }
    }

    /// Update segment handles
    pub fn vn_update_segment_handles(&mut self, node_id: u64, seg_id: u64, hs_x: f64, hs_y: f64, he_x: f64, he_y: f64) {
        if let Some(node) = self.scene.get_node_mut(node_id) {
            if let NodeKind::VectorNetwork(ref mut vn) = node.kind {
                let hs = if hs_x == 0.0 && hs_y == 0.0 { None } else { Some((hs_x, hs_y)) };
                let he = if he_x == 0.0 && he_y == 0.0 { None } else { Some((he_x, he_y)) };
                vn.update_segment_handles(seg_id, hs, he);
            }
        }
    }

    /// Detect regions (closed loops) in a vector network. Returns region count.
    pub fn vn_detect_regions(&mut self, node_id: u64) -> u32 {
        if let Some(node) = self.scene.get_node_mut(node_id) {
            if let NodeKind::VectorNetwork(ref mut vn) = node.kind {
                return vn.detect_regions() as u32;
            }
        }
        0
    }

    /// Convert a Path node to VectorNetwork. Returns true on success.
    pub fn convert_path_to_vector_network(&mut self, node_id: u64) -> bool {
        if let Some(node) = self.scene.get_node_mut(node_id) {
            if let NodeKind::Path { ref points, closed } = node.kind {
                let vn = crate::vector_network::VectorNetwork::from_path(points, closed);
                node.kind = NodeKind::VectorNetwork(Box::new(vn));
                return true;
            }
        }
        false
    }

    pub fn set_image_fit(&mut self, id: u64, fit: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Image { fit: ref mut f, .. } = node.kind {
                *f = match fit {
                    "contain" => "contain".to_string(),
                    "fill" => "fill".to_string(),
                    _ => "cover".to_string(),
                };
            }
        }
    }

    pub fn get_image_src(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            if let NodeKind::Image { ref src, .. } = node.kind {
                return src.clone();
            }
        }
        String::new()
    }

    pub fn add_section(&mut self, name: &str, x: f64, y: f64, w: f64, h: f64) -> u64 {
        let mut node = Node::new(0, NodeKind::Section);
        node.x = x; node.y = y; node.width = w; node.height = h;
        node.name = if name.is_empty() { format!("Section {}", self.scene.node_count() + 1) } else { name.to_string() };
        node.fills = vec![];
        node.corner_radius = 8.0;
        self.scene.add_node(node)
    }

    pub fn add_slice(&mut self, name: &str, x: f64, y: f64, w: f64, h: f64) -> u64 {
        let mut node = Node::new(0, NodeKind::Slice);
        node.x = x; node.y = y; node.width = w; node.height = h;
        node.name = if name.is_empty() { format!("Slice {}", self.scene.node_count() + 1) } else { name.to_string() };
        node.fills = vec![];
        node.opacity = 1.0;
        self.scene.add_node(node)
    }

    // =============================================
    // Connector API
    // =============================================

    /// Create a connector between two points (or nodes).
    /// start_node_id/end_node_id: 0 means unconnected (use absolute coords).
    pub fn add_connector(&mut self, sx: f64, sy: f64, ex: f64, ey: f64, start_node_id: u64, end_node_id: u64) -> u64 {
        let min_x = sx.min(ex);
        let min_y = sy.min(ey);
        let w = (ex - sx).abs().max(1.0);
        let h = (ey - sy).abs().max(1.0);
        let mut node = Node::new(0, NodeKind::Connector {
            start_node_id,
            end_node_id,
            start_x: sx,
            start_y: sy,
            end_x: ex,
            end_y: ey,
            path_type: "straight".to_string(),
            end_arrow: true,
            start_arrow: false,
        });
        node.x = min_x;
        node.y = min_y;
        node.width = w;
        node.height = h;
        node.name = format!("Connector {}", self.scene.node_count() + 1);
        node.fills = vec![];
        node.strokes = vec![Stroke::new(Color::white(), 2.0)];
        self.scene.add_node(node)
    }

    pub fn set_connector_path_type(&mut self, id: u64, path_type: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Connector { path_type: ref mut pt, .. } = node.kind {
                *pt = path_type.to_string();
            }
        }
    }

    pub fn set_connector_arrows(&mut self, id: u64, start_arrow: bool, end_arrow: bool) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Connector { start_arrow: ref mut sa, end_arrow: ref mut ea, .. } = node.kind {
                *sa = start_arrow;
                *ea = end_arrow;
            }
        }
    }

    pub fn set_connector_endpoints(&mut self, id: u64, sx: f64, sy: f64, ex: f64, ey: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Connector { start_x: ref mut sxr, start_y: ref mut syr, end_x: ref mut exr, end_y: ref mut eyr, .. } = node.kind {
                *sxr = sx; *syr = sy; *exr = ex; *eyr = ey;
            }
            node.x = sx.min(ex);
            node.y = sy.min(ey);
            node.width = (ex - sx).abs().max(1.0);
            node.height = (ey - sy).abs().max(1.0);
        }
    }

    pub fn set_connector_nodes(&mut self, id: u64, start_node_id: u64, end_node_id: u64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Connector { start_node_id: ref mut sn, end_node_id: ref mut en, .. } = node.kind {
                *sn = start_node_id;
                *en = end_node_id;
            }
        }
    }

    pub fn get_connector_info(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            if let NodeKind::Connector { start_node_id, end_node_id, start_x, start_y, end_x, end_y, ref path_type, end_arrow, start_arrow } = node.kind {
                return serde_json::json!({
                    "start_node_id": start_node_id,
                    "end_node_id": end_node_id,
                    "start_x": start_x,
                    "start_y": start_y,
                    "end_x": end_x,
                    "end_y": end_y,
                    "path_type": path_type,
                    "end_arrow": end_arrow,
                    "start_arrow": start_arrow,
                }).to_string();
            }
        }
        "null".to_string()
    }

    /// Update connector bounds when connected nodes move
    pub fn update_connector_bounds(&mut self, id: u64) {
        let (start_node_id, end_node_id, mut sx, mut sy, mut ex, mut ey) = {
            if let Some(node) = self.scene.get_node(id) {
                if let NodeKind::Connector { start_node_id, end_node_id, start_x, start_y, end_x, end_y, .. } = node.kind {
                    (start_node_id, end_node_id, start_x, start_y, end_x, end_y)
                } else { return; }
            } else { return; }
        };

        if start_node_id != 0 {
            if let Some(n) = self.scene.get_node(start_node_id) {
                sx = n.x + n.width / 2.0;
                sy = n.y + n.height / 2.0;
            }
        }
        if end_node_id != 0 {
            if let Some(n) = self.scene.get_node(end_node_id) {
                ex = n.x + n.width / 2.0;
                ey = n.y + n.height / 2.0;
            }
        }

        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Connector { start_x: ref mut sxr, start_y: ref mut syr, end_x: ref mut exr, end_y: ref mut eyr, .. } = node.kind {
                *sxr = sx; *syr = sy; *exr = ex; *eyr = ey;
            }
            node.x = sx.min(ex);
            node.y = sy.min(ey);
            node.width = (ex - sx).abs().max(1.0);
            node.height = (ey - sy).abs().max(1.0);
        }
    }

    /// Get all connector IDs that reference a given node
    pub fn get_connectors_for_node(&self, node_id: u64) -> Vec<u64> {
        let mut result = vec![];
        for n in self.scene.all_nodes() {
            if let NodeKind::Connector { start_node_id, end_node_id, .. } = n.kind {
                if start_node_id == node_id || end_node_id == node_id {
                    result.push(n.id);
                }
            }
        }
        result
    }

    pub fn add_frame(&mut self, x: f64, y: f64, w: f64, h: f64) -> u64 {
        let mut node = Node::new(0, NodeKind::Frame);
        node.x = x; node.y = y; node.width = w; node.height = h;
        node.name = format!("Frame {}", self.scene.node_count() + 1);
        node.fills = vec![Fill::solid(Color::white())];
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
            if node.fills.is_empty() {
                node.fills.push(Fill::solid(Color { r, g, b, a }));
            } else {
                node.fills[0] = Fill::solid(Color { r, g, b, a });
            }
        }
    }

    /// Set fill to a linear gradient. stops_json: [{"offset":0,"r":255,"g":0,"b":0,"a":1}, ...]
    pub fn set_fill_linear_gradient(&mut self, id: u64, start_x: f64, start_y: f64, end_x: f64, end_y: f64, stops_json: &str) {
        let stops: Vec<serde_json::Value> = serde_json::from_str(stops_json).unwrap_or_default();
        let gradient_stops: Vec<GradientStop> = stops.iter().map(|s| GradientStop {
            offset: s["offset"].as_f64().unwrap_or(0.0),
            color: Color {
                r: s["r"].as_u64().unwrap_or(0) as u8,
                g: s["g"].as_u64().unwrap_or(0) as u8,
                b: s["b"].as_u64().unwrap_or(0) as u8,
                a: s["a"].as_f64().unwrap_or(1.0),
            },
        }).collect();
        if let Some(node) = self.scene.get_node_mut(id) {
            let new_fill = Fill {
                fill_type: FillType::LinearGradient {
                    start_x, start_y, end_x, end_y,
                    stops: gradient_stops,
                },
                visible: true,
            };
            if node.fills.is_empty() {
                node.fills.push(new_fill);
            } else {
                node.fills[0] = new_fill;
            }
        }
    }

    /// Set fill to a radial gradient. stops_json: [{"offset":0,"r":255,"g":0,"b":0,"a":1}, ...]
    pub fn set_fill_radial_gradient(&mut self, id: u64, center_x: f64, center_y: f64, radius: f64, stops_json: &str) {
        let stops: Vec<serde_json::Value> = serde_json::from_str(stops_json).unwrap_or_default();
        let gradient_stops: Vec<GradientStop> = stops.iter().map(|s| GradientStop {
            offset: s["offset"].as_f64().unwrap_or(0.0),
            color: Color {
                r: s["r"].as_u64().unwrap_or(0) as u8,
                g: s["g"].as_u64().unwrap_or(0) as u8,
                b: s["b"].as_u64().unwrap_or(0) as u8,
                a: s["a"].as_f64().unwrap_or(1.0),
            },
        }).collect();
        if let Some(node) = self.scene.get_node_mut(id) {
            let new_fill = Fill {
                fill_type: FillType::RadialGradient {
                    center_x, center_y, radius,
                    stops: gradient_stops,
                },
                visible: true,
            };
            if node.fills.is_empty() {
                node.fills.push(new_fill);
            } else {
                node.fills[0] = new_fill;
            }
        }
    }

    /// Get fill info as JSON: { "type": "Solid"|"LinearGradient"|"RadialGradient", ... }
    pub fn get_fill_info(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            if let Some(fill) = node.first_fill() {
                return match &fill.fill_type {
                    FillType::Solid { color } => {
                        serde_json::json!({
                            "type": "Solid",
                            "color": { "r": color.r, "g": color.g, "b": color.b, "a": color.a }
                        }).to_string()
                    }
                    FillType::LinearGradient { start_x, start_y, end_x, end_y, stops } => {
                        serde_json::json!({
                            "type": "LinearGradient",
                            "start_x": start_x, "start_y": start_y,
                            "end_x": end_x, "end_y": end_y,
                            "stops": stops.iter().map(|s| serde_json::json!({
                                "offset": s.offset, "r": s.color.r, "g": s.color.g, "b": s.color.b, "a": s.color.a
                            })).collect::<Vec<_>>()
                        }).to_string()
                    }
                    FillType::RadialGradient { center_x, center_y, radius, stops } => {
                        serde_json::json!({
                            "type": "RadialGradient",
                            "center_x": center_x, "center_y": center_y, "radius": radius,
                            "stops": stops.iter().map(|s| serde_json::json!({
                                "offset": s.offset, "r": s.color.r, "g": s.color.g, "b": s.color.b, "a": s.color.a
                            })).collect::<Vec<_>>()
                        }).to_string()
                    }
                };
            }
        }
        "null".to_string()
    }

    // =============================================
    // Multi-fill API
    // =============================================

    /// Add a solid fill to the node. Returns the index.
    pub fn add_fill(&mut self, id: u64, r: u8, g: u8, b: u8, a: f64) -> i32 {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.fills.push(Fill::solid(Color { r, g, b, a }));
            (node.fills.len() - 1) as i32
        } else {
            -1
        }
    }

    /// Remove a fill by index.
    pub fn remove_fill(&mut self, id: u64, index: u32) -> bool {
        if let Some(node) = self.scene.get_node_mut(id) {
            let idx = index as usize;
            if idx < node.fills.len() {
                node.fills.remove(idx);
                return true;
            }
        }
        false
    }

    /// Update fill at index with a solid color.
    pub fn update_fill_at(&mut self, id: u64, index: u32, r: u8, g: u8, b: u8, a: f64) -> bool {
        if let Some(node) = self.scene.get_node_mut(id) {
            let idx = index as usize;
            if idx < node.fills.len() {
                node.fills[idx] = Fill::solid(Color { r, g, b, a });
                return true;
            }
        }
        false
    }

    /// Set fill visible/hidden at index.
    pub fn set_fill_visible_at(&mut self, id: u64, index: u32, visible: bool) -> bool {
        if let Some(node) = self.scene.get_node_mut(id) {
            let idx = index as usize;
            if idx < node.fills.len() {
                node.fills[idx].visible = visible;
                return true;
            }
        }
        false
    }

    /// Get all fills as JSON array.
    pub fn get_fills(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            let fills: Vec<serde_json::Value> = node.fills.iter().enumerate().map(|(i, fill)| {
                let base = match &fill.fill_type {
                    FillType::Solid { color } => {
                        serde_json::json!({
                            "index": i,
                            "type": "Solid",
                            "visible": fill.visible,
                            "color": { "r": color.r, "g": color.g, "b": color.b, "a": color.a }
                        })
                    }
                    FillType::LinearGradient { start_x, start_y, end_x, end_y, stops } => {
                        serde_json::json!({
                            "index": i,
                            "type": "LinearGradient",
                            "visible": fill.visible,
                            "start_x": start_x, "start_y": start_y,
                            "end_x": end_x, "end_y": end_y,
                            "stops": stops.iter().map(|s| serde_json::json!({
                                "offset": s.offset, "r": s.color.r, "g": s.color.g, "b": s.color.b, "a": s.color.a
                            })).collect::<Vec<_>>()
                        })
                    }
                    FillType::RadialGradient { center_x, center_y, radius, stops } => {
                        serde_json::json!({
                            "index": i,
                            "type": "RadialGradient",
                            "visible": fill.visible,
                            "center_x": center_x, "center_y": center_y, "radius": radius,
                            "stops": stops.iter().map(|s| serde_json::json!({
                                "offset": s.offset, "r": s.color.r, "g": s.color.g, "b": s.color.b, "a": s.color.a
                            })).collect::<Vec<_>>()
                        })
                    }
                };
                base
            }).collect();
            serde_json::to_string(&fills).unwrap_or_else(|_| "[]".to_string())
        } else {
            "[]".to_string()
        }
    }

    /// Get fill count for a node.
    pub fn get_fill_count(&self, id: u64) -> u32 {
        self.scene.get_node(id)
            .map(|n| n.fills.len() as u32)
            .unwrap_or(0)
    }

    /// Move a fill from one index to another.
    pub fn move_fill(&mut self, id: u64, from_index: u32, to_index: u32) -> bool {
        if let Some(node) = self.scene.get_node_mut(id) {
            let from = from_index as usize;
            let to = to_index as usize;
            if from < node.fills.len() && to < node.fills.len() && from != to {
                let fill = node.fills.remove(from);
                node.fills.insert(to, fill);
                return true;
            }
        }
        false
    }

    /// Set fill at index to linear gradient.
    pub fn set_fill_linear_gradient_at(&mut self, id: u64, index: u32, start_x: f64, start_y: f64, end_x: f64, end_y: f64, stops_json: &str) {
        let stops: Vec<serde_json::Value> = serde_json::from_str(stops_json).unwrap_or_default();
        let gradient_stops: Vec<GradientStop> = stops.iter().map(|s| GradientStop {
            offset: s["offset"].as_f64().unwrap_or(0.0),
            color: Color {
                r: s["r"].as_u64().unwrap_or(0) as u8,
                g: s["g"].as_u64().unwrap_or(0) as u8,
                b: s["b"].as_u64().unwrap_or(0) as u8,
                a: s["a"].as_f64().unwrap_or(1.0),
            },
        }).collect();
        if let Some(node) = self.scene.get_node_mut(id) {
            let idx = index as usize;
            if idx < node.fills.len() {
                node.fills[idx] = Fill {
                    fill_type: FillType::LinearGradient {
                        start_x, start_y, end_x, end_y,
                        stops: gradient_stops,
                    },
                    visible: node.fills[idx].visible,
                };
            }
        }
    }

    /// Set fill at index to radial gradient.
    pub fn set_fill_radial_gradient_at(&mut self, id: u64, index: u32, center_x: f64, center_y: f64, radius: f64, stops_json: &str) {
        let stops: Vec<serde_json::Value> = serde_json::from_str(stops_json).unwrap_or_default();
        let gradient_stops: Vec<GradientStop> = stops.iter().map(|s| GradientStop {
            offset: s["offset"].as_f64().unwrap_or(0.0),
            color: Color {
                r: s["r"].as_u64().unwrap_or(0) as u8,
                g: s["g"].as_u64().unwrap_or(0) as u8,
                b: s["b"].as_u64().unwrap_or(0) as u8,
                a: s["a"].as_f64().unwrap_or(1.0),
            },
        }).collect();
        if let Some(node) = self.scene.get_node_mut(id) {
            let idx = index as usize;
            if idx < node.fills.len() {
                node.fills[idx] = Fill {
                    fill_type: FillType::RadialGradient {
                        center_x, center_y, radius,
                        stops: gradient_stops,
                    },
                    visible: node.fills[idx].visible,
                };
            }
        }
    }

    /// Set stroke at index 0 (backward compat). Creates if empty.
    pub fn set_stroke(&mut self, id: u64, r: u8, g: u8, b: u8, a: f64, width: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if node.strokes.is_empty() {
                node.strokes.push(Stroke::new(Color { r, g, b, a }, width));
            } else {
                let s = &mut node.strokes[0];
                s.color = Color { r, g, b, a };
                s.width = width;
            }
        }
    }

    /// Set stroke alignment (index 0)
    pub fn set_stroke_align(&mut self, id: u64, align: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let Some(stroke) = node.strokes.first_mut() {
                stroke.align = match align {
                    "Inside" => StrokeAlign::Inside,
                    "Outside" => StrokeAlign::Outside,
                    _ => StrokeAlign::Center,
                };
            }
        }
    }

    fn stroke_to_json(stroke: &Stroke) -> serde_json::Value {
        let cap = match stroke.line_cap {
            crate::node::LineCap::Butt => "butt",
            crate::node::LineCap::Round => "round",
            crate::node::LineCap::Square => "square",
        };
        let join = match stroke.line_join {
            crate::node::LineJoin::Miter => "miter",
            crate::node::LineJoin::Round => "round",
            crate::node::LineJoin::Bevel => "bevel",
        };
        let align = match stroke.align {
            crate::node::StrokeAlign::Center => "Center",
            crate::node::StrokeAlign::Inside => "Inside",
            crate::node::StrokeAlign::Outside => "Outside",
        };
        serde_json::json!({
            "color": { "r": stroke.color.r, "g": stroke.color.g, "b": stroke.color.b, "a": stroke.color.a },
            "width": stroke.width,
            "dash_array": stroke.dash_array,
            "dash_offset": stroke.dash_offset,
            "line_cap": cap,
            "line_join": join,
            "align": align,
            "visible": stroke.visible,
        })
    }

    /// Get stroke info as JSON (index 0, backward compat)
    pub fn get_stroke_info(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            if let Some(stroke) = node.strokes.first() {
                return Self::stroke_to_json(stroke).to_string();
            }
        }
        "null".to_string()
    }

    /// Get all strokes as JSON array
    pub fn get_strokes_info(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            let arr: Vec<serde_json::Value> = node.strokes.iter().map(|s| Self::stroke_to_json(s)).collect();
            return serde_json::to_string(&arr).unwrap_or_else(|_| "[]".to_string());
        }
        "[]".to_string()
    }

    // =============================================
    // Multi-stroke API
    // =============================================

    /// Add a stroke. Returns the index.
    pub fn add_stroke(&mut self, id: u64, r: u8, g: u8, b: u8, a: f64, width: f64) -> i32 {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.strokes.push(Stroke::new(Color { r, g, b, a }, width));
            (node.strokes.len() - 1) as i32
        } else {
            -1
        }
    }

    /// Remove a stroke by index.
    pub fn remove_stroke(&mut self, id: u64, index: u32) -> bool {
        if let Some(node) = self.scene.get_node_mut(id) {
            let idx = index as usize;
            if idx < node.strokes.len() {
                node.strokes.remove(idx);
                return true;
            }
        }
        false
    }

    /// Update stroke at index with color and width.
    pub fn update_stroke_at(&mut self, id: u64, index: u32, r: u8, g: u8, b: u8, a: f64, width: f64) -> bool {
        if let Some(node) = self.scene.get_node_mut(id) {
            let idx = index as usize;
            if idx < node.strokes.len() {
                node.strokes[idx].color = Color { r, g, b, a };
                node.strokes[idx].width = width;
                return true;
            }
        }
        false
    }

    /// Set stroke visible/hidden at index.
    pub fn set_stroke_visible_at(&mut self, id: u64, index: u32, visible: bool) -> bool {
        if let Some(node) = self.scene.get_node_mut(id) {
            let idx = index as usize;
            if idx < node.strokes.len() {
                node.strokes[idx].visible = visible;
                return true;
            }
        }
        false
    }

    /// Set stroke dash at index.
    pub fn set_stroke_dash_at(&mut self, id: u64, index: u32, dash_pattern: &str, dash_offset: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            let idx = index as usize;
            if idx < node.strokes.len() {
                node.strokes[idx].dash_array = dash_pattern.split(',')
                    .filter_map(|s| s.trim().parse::<f64>().ok())
                    .collect();
                node.strokes[idx].dash_offset = dash_offset;
            }
        }
    }

    /// Set stroke cap at index.
    pub fn set_stroke_cap_at(&mut self, id: u64, index: u32, cap: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            let idx = index as usize;
            if idx < node.strokes.len() {
                node.strokes[idx].line_cap = match cap {
                    "round" => crate::node::LineCap::Round,
                    "square" => crate::node::LineCap::Square,
                    _ => crate::node::LineCap::Butt,
                };
            }
        }
    }

    /// Set stroke join at index.
    pub fn set_stroke_join_at(&mut self, id: u64, index: u32, join: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            let idx = index as usize;
            if idx < node.strokes.len() {
                node.strokes[idx].line_join = match join {
                    "round" => crate::node::LineJoin::Round,
                    "bevel" => crate::node::LineJoin::Bevel,
                    _ => crate::node::LineJoin::Miter,
                };
            }
        }
    }

    /// Set stroke align at index.
    pub fn set_stroke_align_at(&mut self, id: u64, index: u32, align: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            let idx = index as usize;
            if idx < node.strokes.len() {
                node.strokes[idx].align = match align {
                    "Inside" => StrokeAlign::Inside,
                    "Outside" => StrokeAlign::Outside,
                    _ => StrokeAlign::Center,
                };
            }
        }
    }

    pub fn set_stroke_dash(&mut self, id: u64, dash_pattern: &str, dash_offset: f64) {
        self.set_stroke_dash_at(id, 0, dash_pattern, dash_offset);
    }

    pub fn set_stroke_cap(&mut self, id: u64, cap: &str) {
        self.set_stroke_cap_at(id, 0, cap);
    }

    pub fn set_stroke_join(&mut self, id: u64, join: &str) {
        self.set_stroke_join_at(id, 0, join);
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

    /// Batch rename selected nodes.
    /// pattern: {name} = original name, {n} = number, {N} = zero-padded number
    pub fn batch_rename_selection(&mut self, pattern: &str, start_num: u32) -> u32 {
        let ids = self.scene.selection.clone();
        if ids.is_empty() { return 0; }
        self.push_undo();
        self.scene.batch_rename(&ids, pattern, start_num);
        ids.len() as u32
    }

    // =============================================
    // Bookmarks
    // =============================================

    pub fn toggle_bookmark(&mut self, id: u64) -> bool {
        self.scene.toggle_bookmark(id)
    }

    pub fn is_bookmarked(&self, id: u64) -> bool {
        self.scene.is_bookmarked(id)
    }

    /// Get bookmarked nodes on current page as JSON: [{id, name, kind}]
    pub fn get_bookmarked_nodes(&self) -> String {
        let nodes: Vec<serde_json::Value> = self.scene.get_bookmarked_nodes()
            .into_iter()
            .map(|(id, name)| {
                let kind = self.scene.get_node(id).map(|n| format!("{:?}", n.kind)).unwrap_or_default();
                // Truncate kind to the variant name (e.g. "Text { ... }" -> "Text")
                let kind_short = kind.split_whitespace().next().unwrap_or(&kind).to_string();
                serde_json::json!({"id": id, "name": name, "kind": kind_short})
            })
            .collect();
        serde_json::to_string(&nodes).unwrap_or_else(|_| "[]".to_string())
    }

    /// Get all bookmarked nodes across all pages as JSON: [{page_id, page_name, id, name}]
    pub fn get_all_bookmarked_nodes(&self) -> String {
        let nodes: Vec<serde_json::Value> = self.scene.get_all_bookmarked_nodes()
            .into_iter()
            .map(|(page_id, id, name, page_name)| serde_json::json!({
                "page_id": page_id,
                "page_name": page_name,
                "id": id,
                "name": name,
            }))
            .collect();
        serde_json::to_string(&nodes).unwrap_or_else(|_| "[]".to_string())
    }

    pub fn set_text_content(&mut self, id: u64, content: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Text { content: ref mut c, .. } = node.kind {
                *c = content.to_string();
            }
        }
    }

    pub fn set_font_size(&mut self, id: u64, size: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Text { ref mut font_size, .. } = node.kind {
                *font_size = size;
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

    pub fn set_mask(&mut self, id: u64, is_mask: bool) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.is_mask = is_mask;
        }
    }

    pub fn get_mask(&self, id: u64) -> bool {
        self.scene.get_node(id).map(|n| n.is_mask).unwrap_or(false)
    }

    pub fn set_blend_mode(&mut self, id: u64, mode: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.blend_mode = BlendMode::from_str(mode);
        }
    }

    pub fn get_blend_mode(&self, id: u64) -> String {
        self.scene.get_node(id)
            .map(|n| n.blend_mode.to_css().to_string())
            .unwrap_or_else(|| "normal".to_string())
    }

    // ── Prototype interactions ──────────────────────────────

    /// Add an interaction to a node. Returns the index of the new interaction.
    pub fn add_interaction(
        &mut self, id: u64,
        trigger: &str, action: &str,
        target_node_id: u64, target_page_id: u64,
        transition: &str, transition_duration_ms: u32,
    ) -> i32 {
        let trig = match trigger {
            "hover" => InteractionTrigger::OnHover,
            "press" => InteractionTrigger::OnPress,
            "drag" => InteractionTrigger::OnDrag,
            _ => InteractionTrigger::OnClick,
        };
        let act = match action {
            "back" => InteractionAction::Back,
            "scroll-to" => InteractionAction::ScrollTo,
            "open-overlay" => InteractionAction::OpenOverlay,
            "close-overlay" => InteractionAction::CloseOverlay,
            _ => InteractionAction::NavigateTo,
        };
        let trans = match transition {
            "dissolve" => TransitionType::Dissolve,
            "smart-animate" => TransitionType::SmartAnimate,
            "slide-in" => TransitionType::SlideIn,
            "slide-out" => TransitionType::SlideOut,
            "push" => TransitionType::Push,
            _ => TransitionType::Instant,
        };
        if let Some(node) = self.scene.get_node_mut(id) {
            let interaction = Interaction {
                trigger: trig,
                action: act,
                target_node_id,
                target_page_id,
                transition: trans,
                transition_duration_ms,
            };
            node.interactions.push(interaction);
            (node.interactions.len() - 1) as i32
        } else {
            -1
        }
    }

    /// Remove an interaction by index
    pub fn remove_interaction(&mut self, id: u64, index: u32) -> bool {
        if let Some(node) = self.scene.get_node_mut(id) {
            let idx = index as usize;
            if idx < node.interactions.len() {
                node.interactions.remove(idx);
                return true;
            }
        }
        false
    }

    /// Clear all interactions on a node
    pub fn clear_interactions(&mut self, id: u64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.interactions.clear();
        }
    }

    /// Get interactions as JSON array
    pub fn get_interactions(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            serde_json::to_string(&node.interactions).unwrap_or_else(|_| "[]".to_string())
        } else {
            "[]".to_string()
        }
    }

    /// Get interaction count for a node
    pub fn get_interaction_count(&self, id: u64) -> u32 {
        self.scene.get_node(id)
            .map(|n| n.interactions.len() as u32)
            .unwrap_or(0)
    }

    /// Get all nodes with interactions (returns JSON: [{id, interactions: [...]}])
    pub fn get_all_interactions(&self) -> String {
        let mut result: Vec<serde_json::Value> = vec![];
        for node in self.scene.all_nodes() {
            if !node.interactions.is_empty() {
                let val = serde_json::json!({
                    "id": node.id,
                    "name": node.name,
                    "interactions": node.interactions,
                });
                result.push(val);
            }
        }
        serde_json::to_string(&result).unwrap_or_else(|_| "[]".to_string())
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

    /// Hit-test a screen-space rectangle and return all intersecting node IDs.
    pub fn hit_test_rect(&self, sx1: f64, sy1: f64, sx2: f64, sy2: f64) -> Vec<u64> {
        let (x1, y1) = self.renderer.screen_to_scene(sx1, sy1);
        let (x2, y2) = self.renderer.screen_to_scene(sx2, sy2);
        let rx = x1.min(x2);
        let ry = y1.min(y2);
        let rw = (x2 - x1).abs();
        let rh = (y2 - y1).abs();
        self.scene.hit_test_rect(rx, ry, rw, rh)
    }

    /// Get node IDs visible within a viewport rectangle (scene coordinates).
    pub fn get_visible_node_ids(&self, vx: f64, vy: f64, vw: f64, vh: f64) -> Vec<u64> {
        self.scene.get_visible_node_ids(vx, vy, vw, vh)
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

    /// Deep hit test: find the deepest leaf node at screen position (traverses into Frame/Group)
    pub fn deep_hit_test(&self, screen_x: f64, screen_y: f64) -> Option<u64> {
        let (sx, sy) = self.renderer.screen_to_scene(screen_x, screen_y);
        self.scene.deep_hit_test(Point { x: sx, y: sy })
    }

    /// Select all nodes with the same fill as the given node. Returns selected IDs.
    pub fn select_same_fill(&mut self, reference_id: u64) -> Vec<u64> {
        self.scene.select_same_fill(reference_id)
    }

    /// Select all nodes with the same kind as the given node. Returns selected IDs.
    pub fn select_same_kind(&mut self, reference_id: u64) -> Vec<u64> {
        self.scene.select_same_kind(reference_id)
    }

    /// Select all nodes with the same stroke color as the given node. Returns selected IDs.
    pub fn select_same_font(&mut self, reference_id: u64) -> Vec<u64> {
        self.scene.select_same_font(reference_id)
    }

    pub fn select_same_stroke(&mut self, reference_id: u64) -> Vec<u64> {
        self.scene.select_same_stroke(reference_id)
    }

    /// Smart select: find nodes similar to reference based on criteria JSON.
    /// criteria_json: JSON string of SmartSelectCriteria (or empty for defaults).
    /// Returns selected node IDs.
    pub fn smart_select(&mut self, reference_id: u64, criteria_json: &str) -> Vec<u64> {
        let criteria: smart_select::SmartSelectCriteria = if criteria_json.is_empty() {
            smart_select::SmartSelectCriteria::default()
        } else {
            serde_json::from_str(criteria_json).unwrap_or_default()
        };
        let result = smart_select::smart_select(&self.scene.nodes, reference_id, &criteria);
        self.scene.selection = result.clone();
        result
    }

    /// Compute similarity score (0–1) between two nodes.
    pub fn similarity_score(&self, id_a: u64, id_b: u64) -> f64 {
        let a = match self.scene.nodes.get(&id_a) { Some(n) => n, None => return 0.0 };
        let b = match self.scene.nodes.get(&id_b) { Some(n) => n, None => return 0.0 };
        smart_select::similarity_score(a, b)
    }

    /// Suggest groups of similar nodes. Returns JSON array of arrays of node IDs.
    pub fn suggest_groups(&self, threshold: f64) -> String {
        let groups = smart_select::suggest_groups(&self.scene.nodes, threshold);
        serde_json::to_string(&groups).unwrap_or_else(|_| "[]".to_string())
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

    pub fn get_pan_x(&self) -> f64 {
        self.renderer.viewport.tx
    }

    pub fn get_pan_y(&self) -> f64 {
        self.renderer.viewport.ty
    }

    pub fn set_viewport(&mut self, zoom: f64, tx: f64, ty: f64) {
        let z = zoom.clamp(0.1, 10.0);
        self.renderer.viewport.a = z;
        self.renderer.viewport.d = z;
        self.renderer.viewport.tx = tx;
        self.renderer.viewport.ty = ty;
    }

    pub fn get_canvas_width(&self) -> f64 {
        self.renderer.canvas_width
    }

    pub fn get_canvas_height(&self) -> f64 {
        self.renderer.canvas_height
    }

    /// Returns JSON "[minX, minY, maxX, maxY]" or "" if no nodes.
    pub fn get_scene_bounds(&self) -> String {
        match self.scene.get_bounds() {
            Some((x1, y1, x2, y2)) => format!("[{},{},{},{}]", x1, y1, x2, y2),
            None => String::new(),
        }
    }

    /// Returns JSON "[minX, minY, maxX, maxY]" for current selection, or "".
    pub fn get_selection_bounds(&self) -> String {
        let sel = &self.scene.selection;
        if sel.is_empty() { return String::new(); }
        match self.scene.get_bounds_of(sel) {
            Some((x1, y1, x2, y2)) => format!("[{},{},{},{}]", x1, y1, x2, y2),
            None => String::new(),
        }
    }

    pub fn screen_to_scene_x(&self, x: f64, y: f64) -> f64 {
        self.renderer.screen_to_scene(x, y).0
    }

    pub fn screen_to_scene_y(&self, x: f64, y: f64) -> f64 {
        self.renderer.screen_to_scene(x, y).1
    }

    pub fn get_node_name(&self, id: u64) -> Option<String> {
        self.scene.get_node(id).map(|n| n.name.clone())
    }

    /// Returns compact JSON array of node rects for minimap rendering.
    /// Each entry: [id, x, y, w, h, "fillColor", "kindChar"]
    /// Only includes visible nodes.
    pub fn get_minimap_data(&self) -> String {
        let order = self.scene.render_order();
        let mut entries = Vec::new();
        for &id in &order {
            if let Some(node) = self.scene.get_node(id) {
                if !node.visible { continue; }
                let fill_color = if let Some(f) = node.fills.iter().find(|f| f.visible) {
                    let c = f.color();
                    format!("rgba({},{},{},{:.2})", c.r, c.g, c.b, c.a as f64 / 255.0)
                } else {
                    "rgba(200,200,200,0.5)".to_string()
                };
                let kind_char = match &node.kind {
                    crate::node::NodeKind::Rect => "R",
                    crate::node::NodeKind::Ellipse => "E",
                    crate::node::NodeKind::Text { .. } => "T",
                    crate::node::NodeKind::Frame => "F",
                    crate::node::NodeKind::Group => "G",
                    crate::node::NodeKind::Image { .. } => "I",
                    crate::node::NodeKind::Path { .. } => "P",
                    crate::node::NodeKind::Star { .. } => "S",
                    crate::node::NodeKind::Polygon { .. } => "N",
                    _ => "O",
                };
                entries.push(format!(
                    "[{},{},{},{},{},\"{}\",\"{}\"]",
                    id, node.x, node.y, node.width, node.height, fill_color, kind_char
                ));
            }
        }
        format!("[{}]", entries.join(","))
    }

    pub fn get_node_json(&self, id: u64) -> Option<String> {
        self.scene.get_node(id).map(|n| serde_json::to_string(n).unwrap_or_default())
    }

    pub fn get_layer_list(&self) -> String {
        let layers: Vec<_> = self.scene.render_order().iter()
            .filter_map(|&id| {
                self.scene.get_node(id).map(|n| {
                    let effectively_visible = self.scene.is_effectively_visible(id);
                    serde_json::json!({
                        "id": n.id,
                        "name": n.name,
                        "kind": format!("{:?}", n.kind),
                        "visible": n.visible,
                        "locked": n.locked,
                        "parent": n.parent,
                        "children": n.children,
                        "is_mask": n.is_mask,
                        "effectively_visible": effectively_visible,
                        "has_condition": n.conditional_visibility.is_some(),
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

    // === Copy / Paste ===

    /// Serialize selected nodes (with subtrees) as JSON for clipboard.
    pub fn copy_selected(&self) -> String {
        let sel = &self.scene.selection;
        if sel.is_empty() {
            return "[]".to_string();
        }
        let mut nodes: Vec<serde_json::Value> = Vec::new();
        for &id in sel {
            fn collect_tree(scene: &Scene, id: u64) -> Vec<Node> {
                let mut result = Vec::new();
                if let Some(node) = scene.get_node(id) {
                    result.push(node.clone());
                    for &child_id in &node.children {
                        result.extend(collect_tree(scene, child_id));
                    }
                }
                result
            }
            let tree_nodes = collect_tree(&self.scene, id);
            for n in tree_nodes {
                nodes.push(serde_json::to_value(&n).unwrap_or_default());
            }
        }
        serde_json::to_string(&nodes).unwrap_or_default()
    }

    /// Paste nodes from JSON. Assigns new IDs, offsets positions, and selects pasted nodes.
    /// Returns the new top-level node IDs as JSON array.
    pub fn paste_nodes(&mut self, json: &str, offset_x: f64, offset_y: f64) -> String {
        let parsed: Vec<Node> = match serde_json::from_str(json) {
            Ok(v) => v,
            Err(_) => return "[]".to_string(),
        };
        if parsed.is_empty() {
            return "[]".to_string();
        }

        // Build old_id -> new_id mapping
        use std::collections::HashMap;
        let mut id_map: HashMap<u64, u64> = HashMap::new();
        // First pass: assign new IDs
        let mut new_nodes: Vec<Node> = Vec::new();
        for node in &parsed {
            let old_id = node.id;
            // Use scene's add_node later, but we need to pre-assign IDs
            id_map.insert(old_id, 0); // placeholder
            new_nodes.push(node.clone());
        }

        // Figure out which are top-level (their parent is not in the copied set)
        let copied_ids: std::collections::HashSet<u64> = parsed.iter().map(|n| n.id).collect();

        // Assign real new IDs and remap
        let mut real_id_map: HashMap<u64, u64> = HashMap::new();
        let mut top_level_ids: Vec<u64> = Vec::new();

        for node in &mut new_nodes {
            let old_id = node.id;
            // Remap children and parent later; first add to scene
            let is_top = node.parent.map_or(true, |p| !copied_ids.contains(&p));
            if is_top {
                node.parent = None;
                node.x += offset_x;
                node.y += offset_y;
            }
            node.children.clear(); // will be re-added by scene.add_node
            node.id = 0;
            let new_id = self.scene.add_node(node.clone());
            real_id_map.insert(old_id, new_id);
            if is_top {
                top_level_ids.push(new_id);
            }
        }

        // Reparent children
        for node in &parsed {
            for &child_old_id in &node.children {
                if let (Some(&parent_new), Some(&child_new)) = (real_id_map.get(&node.id), real_id_map.get(&child_old_id)) {
                    self.scene.reparent(child_new, Some(parent_new));
                }
            }
        }

        // Select pasted top-level nodes
        self.scene.selection = top_level_ids.clone();

        serde_json::to_string(&top_level_ids).unwrap_or_default()
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
            instance_root.fills = template_root.fills.clone();
            instance_root.strokes = template_root.strokes.clone();
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

    /// Walk up the ancestor chain from `node_id`, recomputing auto-layout
    /// and hug sizing for each ancestor that has layout enabled.
    fn reflow_ancestors(&mut self, node_id: u64) {
        let mut current = node_id;
        loop {
            let parent_id = match self.scene.get_node(current) {
                Some(n) => n.parent,
                None => break,
            };
            let pid = match parent_id {
                Some(p) => p,
                None => break,
            };
            let has_layout = self.scene.get_node(pid)
                .map(|n| n.layout.mode != crate::node::LayoutMode::None)
                .unwrap_or(false);
            if has_layout {
                crate::layout::compute_layouts(&mut self.scene);
                break;
            }
            // Even without layout, check hug sizing
            let is_hug = self.scene.get_node(pid)
                .map(|n| n.sizing_h == crate::node::SizingMode::Hug || n.sizing_v == crate::node::SizingMode::Hug)
                .unwrap_or(false);
            if is_hug {
                crate::layout::compute_layouts(&mut self.scene);
                break;
            }
            current = pid;
        }
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
                node.fills = template_root.fills.clone();
                node.strokes = template_root.strokes.clone();
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

        // Trigger parent auto-layout reflow after variant size change
        self.reflow_ancestors(instance_id);

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
        let (comp_id, current_values) = if let Some(node) = self.scene.get_node(node_id) {
            match &node.kind {
                NodeKind::Instance(data) => (data.component_id, data.variant_values.clone()),
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

            let properties: Vec<_> = comp.properties.iter().map(|p| {
                let current = current_values.get(&p.name)
                    .map(|v| v.to_display())
                    .unwrap_or_else(|| p.default_value.to_display());
                serde_json::json!({
                    "name": p.name,
                    "type": match &p.prop_type {
                        VariantPropType::Boolean => serde_json::json!({"kind": "boolean"}),
                        VariantPropType::String { options } => serde_json::json!({"kind": "string", "options": options}),
                    },
                    "default": p.default_value.to_display(),
                    "current": current,
                })
            }).collect();

            let variant_keys: Vec<_> = comp.variants.keys().cloned().collect();

            let current_obj: serde_json::Map<String, serde_json::Value> = current_values.iter()
                .map(|(k, v)| (k.clone(), serde_json::Value::String(v.to_display())))
                .collect();

            serde_json::to_string(&serde_json::json!({
                "component_id": comp_id,
                "component_name": comp.name,
                "source_node_id": source_id,
                "properties": properties,
                "variant_keys": variant_keys,
                "current_variant_values": current_obj,
            })).unwrap_or_else(|_| "null".to_string())
        } else {
            "null".to_string()
        }
    }

    // =============================================
    // Component Search & Swap
    // =============================================

    /// Search components by name (case-insensitive substring match).
    /// Returns JSON array of { id, name, description, variant_count }
    pub fn search_components(&self, query: &str) -> String {
        let results: Vec<_> = self.components.search_components(query).iter().map(|c| {
            serde_json::json!({
                "id": c.id,
                "name": c.name,
                "description": c.description,
                "variant_count": c.variants.len(),
            })
        }).collect();
        serde_json::to_string(&results).unwrap_or_else(|_| "[]".to_string())
    }

    /// Find all instance nodes in the scene, optionally filtered by component_id.
    /// Returns JSON array of { node_id, node_name, component_id, component_name }
    pub fn find_instances(&self, filter_comp_id: u64) -> String {
        let mut results = vec![];
        for node in self.scene.all_nodes() {
            if let NodeKind::Instance(data) = &node.kind {
                if filter_comp_id == 0 || data.component_id == filter_comp_id {
                    let comp_name = self.components.get(data.component_id)
                        .map(|c| c.name.clone())
                        .unwrap_or_else(|| "Unknown".to_string());
                    results.push(serde_json::json!({
                        "node_id": node.id,
                        "node_name": node.name,
                        "component_id": data.component_id,
                        "component_name": comp_name,
                    }));
                }
            }
        }
        serde_json::to_string(&results).unwrap_or_else(|_| "[]".to_string())
    }

    /// Swap an instance's master component to a different component.
    /// Removes old children, re-clones from new component's default variant.
    pub fn swap_instance_component(&mut self, instance_id: u64, new_comp_id: u64) -> bool {
        // Verify instance exists
        let (x, y) = if let Some(node) = self.scene.get_node(instance_id) {
            if let NodeKind::Instance(_) = &node.kind {
                (node.x, node.y)
            } else {
                return false;
            }
        } else {
            return false;
        };

        let comp = match self.components.get(new_comp_id) {
            Some(c) => c.clone(),
            None => return false,
        };

        let default_key = comp.default_key();
        let variant = match comp.get_variant(&default_key) {
            Some(v) => v.clone(),
            None => match comp.variants.values().next() {
                Some(v) => v.clone(),
                None => return false,
            }
        };

        // Remove old children
        if let Some(node) = self.scene.get_node(instance_id) {
            let old_children = node.children.clone();
            for cid in old_children {
                self.scene.remove_node(cid);
            }
        }

        // Update instance data and geometry
        if let Some(node) = self.scene.get_node_mut(instance_id) {
            node.kind = NodeKind::Instance(Box::new(InstanceData {
                component_id: new_comp_id,
                variant_values: default_key,
                slot_fills: std::collections::HashMap::new(),
                overrides: std::collections::HashMap::new(),
            }));
            node.name = format!("[I] {}", comp.name);
            if let Some(template_root) = variant.nodes.first() {
                node.width = template_root.width;
                node.height = template_root.height;
                node.fills = template_root.fills.clone();
                node.strokes = template_root.strokes.clone();
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

    // =============================================
    // Component Documentation
    // =============================================

    /// Get component documentation as JSON
    pub fn get_component_doc(&self, comp_id: u64) -> String {
        match self.components.get(comp_id) {
            Some(comp) => serde_json::to_string(&serde_json::json!({
                "id": comp.id,
                "name": comp.name,
                "description": comp.description,
                "guidelines": comp.doc.guidelines,
                "tags": comp.doc.tags,
                "links": comp.doc.links.iter().map(|(l, u)| serde_json::json!({"label": l, "url": u})).collect::<Vec<_>>(),
                "prop_docs": comp.doc.prop_docs.iter().map(|p| serde_json::json!({"name": p.name, "description": p.description, "default": p.default_display})).collect::<Vec<_>>(),
                "examples": comp.doc.examples.iter().map(|e| serde_json::json!({"title": e.title, "description": e.description})).collect::<Vec<_>>(),
                "changelog": comp.doc.changelog,
            })).unwrap_or_else(|_| "null".into()),
            None => "null".into(),
        }
    }

    /// Set component description
    pub fn set_component_description(&mut self, comp_id: u64, desc: &str) -> bool {
        if let Some(comp) = self.components.get_mut(comp_id) {
            comp.description = desc.to_string();
            true
        } else { false }
    }

    /// Set component guidelines (markdown)
    pub fn set_component_guidelines(&mut self, comp_id: u64, guidelines: &str) -> bool {
        if let Some(comp) = self.components.get_mut(comp_id) {
            comp.doc.guidelines = guidelines.to_string();
            true
        } else { false }
    }

    /// Set component tags (comma-separated)
    pub fn set_component_tags(&mut self, comp_id: u64, tags_csv: &str) -> bool {
        if let Some(comp) = self.components.get_mut(comp_id) {
            comp.doc.tags = tags_csv.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
            true
        } else { false }
    }

    /// Add a link to component docs
    pub fn add_component_link(&mut self, comp_id: u64, label: &str, url: &str) -> bool {
        if let Some(comp) = self.components.get_mut(comp_id) {
            comp.doc.links.push((label.to_string(), url.to_string()));
            true
        } else { false }
    }

    /// Remove a link by index
    pub fn remove_component_link(&mut self, comp_id: u64, index: u32) -> bool {
        if let Some(comp) = self.components.get_mut(comp_id) {
            let i = index as usize;
            if i < comp.doc.links.len() {
                comp.doc.links.remove(i);
                return true;
            }
        }
        false
    }

    /// Set property documentation
    pub fn set_component_prop_doc(&mut self, comp_id: u64, prop_name: &str, description: &str, default_display: &str) -> bool {
        if let Some(comp) = self.components.get_mut(comp_id) {
            if let Some(pd) = comp.doc.prop_docs.iter_mut().find(|p| p.name == prop_name) {
                pd.description = description.to_string();
                pd.default_display = default_display.to_string();
            } else {
                comp.doc.prop_docs.push(crate::component::PropDoc {
                    name: prop_name.to_string(),
                    description: description.to_string(),
                    default_display: default_display.to_string(),
                });
            }
            true
        } else { false }
    }

    /// Remove property documentation by name
    pub fn remove_component_prop_doc(&mut self, comp_id: u64, prop_name: &str) -> bool {
        if let Some(comp) = self.components.get_mut(comp_id) {
            let before = comp.doc.prop_docs.len();
            comp.doc.prop_docs.retain(|p| p.name != prop_name);
            comp.doc.prop_docs.len() < before
        } else { false }
    }

    /// Add a usage example
    pub fn add_component_example(&mut self, comp_id: u64, title: &str, description: &str) -> bool {
        if let Some(comp) = self.components.get_mut(comp_id) {
            comp.doc.examples.push(crate::component::ComponentExample {
                title: title.to_string(),
                description: description.to_string(),
                variant_key: None,
            });
            true
        } else { false }
    }

    /// Remove an example by index
    pub fn remove_component_example(&mut self, comp_id: u64, index: u32) -> bool {
        if let Some(comp) = self.components.get_mut(comp_id) {
            let i = index as usize;
            if i < comp.doc.examples.len() {
                comp.doc.examples.remove(i);
                return true;
            }
        }
        false
    }

    /// Add a changelog entry (prepended, newest first)
    pub fn add_component_changelog(&mut self, comp_id: u64, entry: &str) -> bool {
        if let Some(comp) = self.components.get_mut(comp_id) {
            comp.doc.changelog.insert(0, entry.to_string());
            true
        } else { false }
    }

    /// Export all component docs as JSON
    pub fn export_component_docs(&self) -> String {
        let docs: Vec<_> = self.components.list().iter().map(|c| {
            serde_json::json!({
                "id": c.id,
                "name": c.name,
                "description": c.description,
                "guidelines": c.doc.guidelines,
                "tags": c.doc.tags,
                "links": c.doc.links.iter().map(|(l, u)| serde_json::json!({"label": l, "url": u})).collect::<Vec<_>>(),
                "prop_docs": c.doc.prop_docs.iter().map(|p| serde_json::json!({"name": p.name, "description": p.description, "default": p.default_display})).collect::<Vec<_>>(),
                "examples": c.doc.examples.iter().map(|e| serde_json::json!({"title": e.title, "description": e.description})).collect::<Vec<_>>(),
                "changelog": c.doc.changelog,
            })
        }).collect();
        serde_json::to_string(&docs).unwrap_or_else(|_| "[]".into())
    }

    // =============================================
    // Component Library (shared libraries)
    // =============================================

    /// Export selected components as a library JSON string
    pub fn export_component_library(&self, name: &str, version: &str, component_ids_json: &str) -> String {
        let ids: Vec<u64> = serde_json::from_str(component_ids_json).unwrap_or_default();
        let lib = self.components.export_library(name, version, &ids);
        serde_json::to_string(&lib).unwrap_or_else(|_| "{}".into())
    }

    /// Import a component library from JSON string
    pub fn import_component_library(&mut self, json: &str) -> bool {
        match serde_json::from_str::<crate::component::ComponentLibrary>(json) {
            Ok(lib) => {
                self.components.import_library(lib);
                true
            }
            Err(_) => false,
        }
    }

    /// Get linked libraries as JSON array
    pub fn get_linked_libraries(&self) -> String {
        let libs: Vec<_> = self.components.get_linked_libraries_info().iter().map(|(id, name, version, count)| {
            serde_json::json!({
                "id": id,
                "name": name,
                "version": version,
                "component_count": count,
            })
        }).collect();
        serde_json::to_string(&libs).unwrap_or_else(|_| "[]".into())
    }

    /// Unlink a library by id
    pub fn unlink_library(&mut self, library_id: &str) -> bool {
        self.components.unlink_library(library_id)
    }

    /// Sync a linked library with updated JSON data
    pub fn sync_library(&mut self, library_id: &str, json: &str) -> u32 {
        match serde_json::from_str::<crate::component::ComponentLibrary>(json) {
            Ok(lib) => self.components.sync_library(library_id, lib),
            Err(_) => 0,
        }
    }

    // =============================================
    // Text Properties (Stage 2 & 3)
    // =============================================

    pub fn set_line_height(&mut self, id: u64, value: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Text { ref mut line_height, .. } = node.kind {
                *line_height = value.max(0.5).min(5.0);
            }
        }
    }

    pub fn set_text_align(&mut self, id: u64, align: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Text { ref mut text_align, .. } = node.kind {
                *text_align = match align {
                    "center" => TextAlign::Center,
                    "right" => TextAlign::Right,
                    _ => TextAlign::Left,
                };
            }
        }
    }

    pub fn set_font_weight(&mut self, id: u64, weight: u16) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Text { ref mut font_weight, .. } = node.kind {
                *font_weight = weight;
            }
        }
    }

    pub fn set_font_style(&mut self, id: u64, style: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Text { ref mut font_style, .. } = node.kind {
                *font_style = match style {
                    "italic" => FontStyle::Italic,
                    _ => FontStyle::Normal,
                };
            }
        }
    }

    pub fn set_text_decoration(&mut self, id: u64, decoration: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Text { ref mut text_decoration, .. } = node.kind {
                *text_decoration = match decoration {
                    "underline" => crate::node::TextDecoration::Underline,
                    "strikethrough" => crate::node::TextDecoration::Strikethrough,
                    "underline-strikethrough" => crate::node::TextDecoration::UnderlineStrikethrough,
                    _ => crate::node::TextDecoration::None,
                };
            }
        }
    }

    pub fn set_letter_spacing(&mut self, id: u64, spacing: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Text { ref mut letter_spacing, .. } = node.kind {
                *letter_spacing = spacing.max(-10.0).min(100.0);
            }
        }
    }

    pub fn set_paragraph_spacing(&mut self, id: u64, spacing: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Text { ref mut paragraph_spacing, .. } = node.kind {
                *paragraph_spacing = spacing.max(0.0).min(200.0);
            }
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

    /// Suggest auto-layout settings for selected nodes (heuristic-based).
    /// Returns JSON: { direction, gap, padding_*, align_items, justify_content, wrap, confidence, pattern }
    pub fn suggest_auto_layout(&self, ids: &[u64]) -> String {
        let suggestion = layout_suggest::suggest_auto_layout(&self.scene, ids);
        serde_json::to_string(&suggestion).unwrap_or_else(|_| "null".to_string())
    }

    /// Wrap selected nodes in a Frame and apply suggested auto-layout.
    /// Returns the new frame's ID, or 0 on failure.
    pub fn apply_auto_layout_suggestion(&mut self, ids: &[u64]) -> u64 {
        if ids.len() < 2 { return 0; }

        let suggestion = layout_suggest::suggest_auto_layout(&self.scene, ids);

        // Compute bounding box of selected nodes
        let bounds = match self.scene.get_bounds_of(ids) {
            Some(b) => b,
            None => return 0,
        };
        let (min_x, min_y, max_x, max_y) = bounds;

        // Create a Frame at the bounding box
        let mut frame = crate::node::Node::new(0, NodeKind::Frame);
        frame.x = min_x;
        frame.y = min_y;
        frame.width = max_x - min_x;
        frame.height = max_y - min_y;
        frame.name = format!("Auto Layout {}", self.scene.node_count() + 1);
        frame.fills = vec![crate::node::Fill::solid(crate::types::Color { r: 30, g: 30, b: 30, a: 0.0 })];

        // Set layout properties
        frame.layout.mode = LayoutMode::Flex;
        frame.layout.direction = if suggestion.direction == "row" { FlexDirection::Row } else { FlexDirection::Column };
        frame.layout.gap = suggestion.gap;
        frame.layout.padding_top = suggestion.padding_top;
        frame.layout.padding_right = suggestion.padding_right;
        frame.layout.padding_bottom = suggestion.padding_bottom;
        frame.layout.padding_left = suggestion.padding_left;
        frame.layout.align_items = parse_align(&suggestion.align_items);
        frame.layout.justify_content = parse_justify(&suggestion.justify_content);
        frame.layout.wrap = if suggestion.wrap == "wrap" { FlexWrap::Wrap } else { FlexWrap::NoWrap };

        let frame_id = self.scene.add_node(frame);

        // Reparent selected nodes into the frame
        let mut sorted_ids: Vec<u64> = ids.to_vec();
        // Sort by position to maintain visual order
        if suggestion.direction == "row" {
            sorted_ids.sort_by(|a, b| {
                let ax = self.scene.get_node(*a).map(|n| n.x).unwrap_or(0.0);
                let bx = self.scene.get_node(*b).map(|n| n.x).unwrap_or(0.0);
                ax.partial_cmp(&bx).unwrap()
            });
        } else {
            sorted_ids.sort_by(|a, b| {
                let ay = self.scene.get_node(*a).map(|n| n.y).unwrap_or(0.0);
                let by = self.scene.get_node(*b).map(|n| n.y).unwrap_or(0.0);
                ay.partial_cmp(&by).unwrap()
            });
        }

        for &child_id in &sorted_ids {
            self.scene.reparent(child_id, Some(frame_id));
        }

        // Select the new frame
        self.scene.selection = vec![frame_id];

        frame_id
    }

    /// Get layout as JSON
    pub fn get_layout(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            serde_json::to_string(&node.layout).unwrap_or_default()
        } else {
            "null".to_string()
        }
    }

    /// Set horizontal sizing mode: "fixed", "hug", "fill"
    pub fn set_sizing_h(&mut self, id: u64, mode: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.sizing_h = match mode {
                "hug" => SizingMode::Hug,
                "fill" => SizingMode::Fill,
                _ => SizingMode::Fixed,
            };
        }
    }

    /// Set vertical sizing mode: "fixed", "hug", "fill"
    pub fn set_sizing_v(&mut self, id: u64, mode: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.sizing_v = match mode {
                "hug" => SizingMode::Hug,
                "fill" => SizingMode::Fill,
                _ => SizingMode::Fixed,
            };
        }
    }

    /// Get sizing modes as JSON: { "h": "fixed"|"hug"|"fill", "v": "fixed"|"hug"|"fill" }
    pub fn get_sizing(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            let h = match node.sizing_h {
                SizingMode::Fixed => "fixed",
                SizingMode::Hug => "hug",
                SizingMode::Fill => "fill",
            };
            let v = match node.sizing_v {
                SizingMode::Fixed => "fixed",
                SizingMode::Hug => "hug",
                SizingMode::Fill => "fill",
            };
            format!(r#"{{"h":"{}","v":"{}"}}"#, h, v)
        } else {
            "null".to_string()
        }
    }

    // =============================================
    // Absolute positioning (exclude from parent auto-layout flow)

    pub fn set_absolute_position(&mut self, id: u64, absolute: bool) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.absolute_position = absolute;
        }
    }

    pub fn get_absolute_position(&self, id: u64) -> bool {
        self.scene.get_node(id).map(|n| n.absolute_position).unwrap_or(false)
    }

    // =============================================
    // Min/Max size constraints

    pub fn set_min_width(&mut self, id: u64, val: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.min_width = if val <= 0.0 { None } else { Some(val) };
        }
    }

    pub fn set_max_width(&mut self, id: u64, val: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.max_width = if val <= 0.0 { None } else { Some(val) };
        }
    }

    pub fn set_min_height(&mut self, id: u64, val: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.min_height = if val <= 0.0 { None } else { Some(val) };
        }
    }

    pub fn set_max_height(&mut self, id: u64, val: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.max_height = if val <= 0.0 { None } else { Some(val) };
        }
    }

    pub fn get_min_max_size(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            format!(
                r#"{{"min_w":{},"max_w":{},"min_h":{},"max_h":{}}}"#,
                node.min_width.map(|v| v.to_string()).unwrap_or("null".to_string()),
                node.max_width.map(|v| v.to_string()).unwrap_or("null".to_string()),
                node.min_height.map(|v| v.to_string()).unwrap_or("null".to_string()),
                node.max_height.map(|v| v.to_string()).unwrap_or("null".to_string()),
            )
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

    // =============================================
    // Alignment & Distribution
    // =============================================

    pub fn align_left(&mut self, ids: Vec<u64>) { self.scene.align_left(&ids); }
    pub fn align_center_h(&mut self, ids: Vec<u64>) { self.scene.align_center_h(&ids); }
    pub fn align_right(&mut self, ids: Vec<u64>) { self.scene.align_right(&ids); }
    pub fn align_top(&mut self, ids: Vec<u64>) { self.scene.align_top(&ids); }
    pub fn align_center_v(&mut self, ids: Vec<u64>) { self.scene.align_center_v(&ids); }
    pub fn align_bottom(&mut self, ids: Vec<u64>) { self.scene.align_bottom(&ids); }
    pub fn distribute_horizontal(&mut self, ids: Vec<u64>) { self.scene.distribute_horizontal(&ids); }
    pub fn distribute_vertical(&mut self, ids: Vec<u64>) { self.scene.distribute_vertical(&ids); }

    /// Align current selection by direction: "left","center_h","right","top","center_v","bottom"
    pub fn align_selection(&mut self, direction: &str) {
        let ids = self.scene.selection.clone();
        if ids.len() < 2 { return; }
        match direction {
            "left" => self.scene.align_left(&ids),
            "center_h" => self.scene.align_center_h(&ids),
            "right" => self.scene.align_right(&ids),
            "top" => self.scene.align_top(&ids),
            "center_v" => self.scene.align_center_v(&ids),
            "bottom" => self.scene.align_bottom(&ids),
            _ => {}
        }
    }

    /// Distribute current selection: "horizontal" or "vertical"
    pub fn distribute_selection(&mut self, axis: &str) {
        let ids = self.scene.selection.clone();
        match axis {
            "horizontal" => self.scene.distribute_horizontal(&ids),
            "vertical" => self.scene.distribute_vertical(&ids),
            _ => {}
        }
    }

    // =============================================
    // SVG Export
    // =============================================

    /// Export entire scene as SVG
    pub fn export_svg(&self) -> String {
        svg_export::export_scene_svg(&self.scene)
    }

    /// Export selected nodes as SVG
    pub fn export_selection_svg(&self) -> String {
        if self.scene.selection.is_empty() {
            return String::new();
        }
        svg_export::export_nodes_svg(&self.scene, &self.scene.selection)
    }

    /// Export a single node as SVG
    pub fn export_node_svg(&self, node_id: u64) -> String {
        svg_export::export_node_svg(&self.scene, node_id)
    }

    /// Get all slice nodes as JSON array [{id, name, x, y, width, height}]
    pub fn get_slices(&self) -> String {
        let slices: Vec<serde_json::Value> = self.scene.all_nodes()
            .filter(|n| matches!(n.kind, NodeKind::Slice))
            .map(|n| serde_json::json!({
                "id": n.id as f64,
                "name": &n.name,
                "x": n.x,
                "y": n.y,
                "width": n.width,
                "height": n.height,
            }))
            .collect();
        serde_json::to_string(&slices).unwrap_or_else(|_| "[]".to_string())
    }

    /// Get all notes for a node as JSON
    pub fn get_notes(&self, node_id: u64) -> String {
        if let Some(node) = self.scene.get_node(node_id) {
            serde_json::to_string(&node.notes).unwrap_or_default()
        } else {
            "[]".to_string()
        }
    }

    // =============================================
    // Shadows & Blur
    // =============================================

    pub fn add_shadow(&mut self, id: u64, r: u8, g: u8, b: u8, a: f64, offset_x: f64, offset_y: f64, blur: f64, spread: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.shadows.push(Shadow {
                color: Color { r, g, b, a },
                offset_x, offset_y, blur, spread,
                visible: true,
            });
        }
    }

    pub fn remove_shadow(&mut self, id: u64, index: usize) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if index < node.shadows.len() {
                node.shadows.remove(index);
            }
        }
    }

    pub fn set_shadow_visible(&mut self, id: u64, index: usize, visible: bool) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let Some(s) = node.shadows.get_mut(index) {
                s.visible = visible;
            }
        }
    }

    pub fn update_shadow(&mut self, id: u64, index: usize, r: u8, g: u8, b: u8, a: f64, offset_x: f64, offset_y: f64, blur: f64, spread: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let Some(s) = node.shadows.get_mut(index) {
                s.color = Color { r, g, b, a };
                s.offset_x = offset_x;
                s.offset_y = offset_y;
                s.blur = blur;
                s.spread = spread;
            }
        }
    }

    pub fn set_blur(&mut self, id: u64, blur: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.blur = blur.max(0.0);
        }
    }

    pub fn get_shadows(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            serde_json::to_string(&node.shadows).unwrap_or_default()
        } else {
            "[]".to_string()
        }
    }

    pub fn get_blur(&self, id: u64) -> f64 {
        if let Some(node) = self.scene.get_node(id) {
            node.blur
        } else {
            0.0
        }
    }

    // =============================================
    // Bitmap Filters
    // =============================================

    /// Set bitmap filter on a node (brightness, contrast, saturation, hue_rotate, invert, grayscale, sepia)
    pub fn set_bitmap_filter(&mut self, id: u64, brightness: f64, contrast: f64, saturation: f64, hue_rotate: f64, invert: f64, grayscale: f64, sepia: f64) {
        self.push_undo();
        if let Some(node) = self.scene.get_node_mut(id) {
            node.bitmap_filter = Some(crate::node::BitmapFilter {
                brightness,
                contrast,
                saturation,
                hue_rotate,
                invert,
                grayscale,
                sepia,
                enabled: true,
            });
        }
    }

    /// Remove bitmap filter from a node
    pub fn remove_bitmap_filter(&mut self, id: u64) {
        self.push_undo();
        if let Some(node) = self.scene.get_node_mut(id) {
            node.bitmap_filter = None;
        }
    }

    /// Set bitmap filter enabled/disabled
    pub fn set_bitmap_filter_enabled(&mut self, id: u64, enabled: bool) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let Some(ref mut bf) = node.bitmap_filter {
                bf.enabled = enabled;
            }
        }
    }

    /// Get bitmap filter as JSON string (or empty string if none)
    pub fn get_bitmap_filter(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            if let Some(ref bf) = node.bitmap_filter {
                return serde_json::to_string(bf).unwrap_or_default();
            }
        }
        String::new()
    }

    // =============================================
    // Constraints
    // =============================================

    /// Set constraints on a node: horizontal and vertical
    pub fn set_constraints(&mut self, id: u64, horizontal: &str, vertical: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.constraints.horizontal = match horizontal {
                "right" => ConstraintH::Right,
                "left_and_right" | "leftAndRight" => ConstraintH::LeftAndRight,
                "center" => ConstraintH::Center,
                "scale" => ConstraintH::Scale,
                _ => ConstraintH::Left,
            };
            node.constraints.vertical = match vertical {
                "bottom" => ConstraintV::Bottom,
                "top_and_bottom" | "topAndBottom" => ConstraintV::TopAndBottom,
                "center" => ConstraintV::Center,
                "scale" => ConstraintV::Scale,
                _ => ConstraintV::Top,
            };
        }
    }

    /// Get constraints as JSON: { "horizontal": "left", "vertical": "top" }
    pub fn get_constraints(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            let h = match node.constraints.horizontal {
                ConstraintH::Left => "left",
                ConstraintH::Right => "right",
                ConstraintH::LeftAndRight => "leftAndRight",
                ConstraintH::Center => "center",
                ConstraintH::Scale => "scale",
            };
            let v = match node.constraints.vertical {
                ConstraintV::Top => "top",
                ConstraintV::Bottom => "bottom",
                ConstraintV::TopAndBottom => "topAndBottom",
                ConstraintV::Center => "center",
                ConstraintV::Scale => "scale",
            };
            format!(r#"{{"horizontal":"{}","vertical":"{}"}}"#, h, v)
        } else {
            r#"{"horizontal":"left","vertical":"top"}"#.to_string()
        }
    }

    /// Resize a frame with constraint-aware child repositioning
    pub fn resize_node_with_constraints(&mut self, id: u64, w: f64, h: f64) {
        self.scene.resize_node_with_constraints(id, w, h);
    }

    // =============================================
    // Multi-page support
    // =============================================

    pub fn add_page(&mut self, name: &str) -> u64 {
        self.scene.add_page(name)
    }

    pub fn remove_page(&mut self, page_id: u64) -> bool {
        self.scene.remove_page(page_id)
    }

    pub fn rename_page(&mut self, page_id: u64, name: &str) {
        self.scene.rename_page(page_id, name);
    }

    pub fn set_active_page(&mut self, page_id: u64) -> bool {
        self.scene.set_active_page(page_id)
    }

    pub fn duplicate_page(&mut self, page_id: u64) -> u64 {
        self.scene.duplicate_page(page_id)
    }

    pub fn get_pages(&self) -> String {
        let info = self.scene.get_pages_info();
        let arr: Vec<serde_json::Value> = info.iter().map(|(id, name)| {
            serde_json::json!({"id": id, "name": name})
        }).collect();
        serde_json::to_string(&arr).unwrap_or_default()
    }

    pub fn get_active_page_id(&self) -> u64 {
        self.scene.get_active_page_id()
    }

    pub fn get_page_count(&self) -> usize {
        self.scene.get_page_count()
    }

    // =============================================
    // Branching
    // =============================================

    pub fn create_branch(&mut self, name: &str) -> u64 {
        self.push_undo();
        self.scene.create_branch(name)
    }

    pub fn switch_branch(&mut self, id: u64) -> bool {
        self.push_undo();
        self.scene.switch_branch(id)
    }

    pub fn merge_branch(&mut self, source_id: u64, target_id: u64) -> bool {
        self.push_undo();
        self.scene.merge_branch(source_id, target_id)
    }

    pub fn delete_branch(&mut self, id: u64) -> bool {
        self.push_undo();
        self.scene.delete_branch(id)
    }

    pub fn list_branches(&self) -> String {
        let branches = self.scene.list_branches();
        let items: Vec<serde_json::Value> = branches.iter().map(|(id, name, active)| {
            serde_json::json!({ "id": *id, "name": name, "active": *active })
        }).collect();
        serde_json::to_string(&items).unwrap_or_else(|_| "[]".to_string())
    }

    pub fn rename_branch(&mut self, id: u64, name: &str) -> bool {
        self.scene.rename_branch(id, name)
    }

    pub fn get_branch_diff(&mut self, branch_id: u64) -> String {
        match self.scene.get_branch_diff(branch_id) {
            Some(diff) => serde_json::to_string(&diff).unwrap_or_else(|_| "{}".to_string()),
            None => "{}".to_string(),
        }
    }

    pub fn get_active_branch_id(&self) -> u64 {
        self.scene.get_active_branch_id()
    }

    /// Get visual diff between two branches (with node positions for canvas overlay)
    pub fn get_visual_diff(&mut self, branch_a_id: u64, branch_b_id: u64) -> String {
        match self.scene.get_visual_diff(branch_a_id, branch_b_id) {
            Some(diff) => serde_json::to_string(&diff).unwrap_or_else(|_| "{}".to_string()),
            None => "{}".to_string(),
        }
    }

    /// Get visual diff of a branch against its base snapshot
    pub fn get_branch_visual_diff(&mut self, branch_id: u64) -> String {
        match self.scene.get_branch_visual_diff(branch_id) {
            Some(diff) => serde_json::to_string(&diff).unwrap_or_else(|_| "{}".to_string()),
            None => "{}".to_string(),
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
    // =============================================
    // Boolean Operations
    // =============================================

    // =============================================
    // Styles Library
    // =============================================

    /// Add a color style. Returns the style ID.
    pub fn add_color_style(&mut self, name: &str, r: u8, g: u8, b: u8, a: f64) -> u64 {
        self.styles.add_color_style(name.to_string(), r, g, b, a)
    }

    /// Update a color style by ID.
    pub fn update_color_style(&mut self, id: u64, name: &str, r: u8, g: u8, b: u8, a: f64) -> bool {
        self.styles.update_color_style(id, name.to_string(), r, g, b, a)
    }

    /// Remove a color style.
    pub fn remove_color_style(&mut self, id: u64) -> bool {
        // Detach from all nodes that reference this style
        let node_ids: Vec<u64> = self.scene.all_node_ids();
        for nid in node_ids {
            if let Some(node) = self.scene.get_node_mut(nid) {
                if node.color_style_id == Some(id) {
                    node.color_style_id = None;
                }
            }
        }
        self.styles.remove_color_style(id)
    }

    /// List all color styles as JSON array.
    pub fn list_color_styles(&self) -> String {
        let styles: Vec<_> = self.styles.list_color_styles().iter().map(|s| {
            serde_json::json!({
                "id": s.id, "name": s.name,
                "r": s.fill_r, "g": s.fill_g, "b": s.fill_b, "a": s.fill_a,
            })
        }).collect();
        serde_json::to_string(&styles).unwrap_or_default()
    }

    /// Add a text style. Returns the style ID.
    pub fn add_text_style(&mut self, name: &str, font_family: &str, font_size: f64, font_weight: u16, font_style: &str, line_height: f64, text_align: &str, r: u8, g: u8, b: u8, a: f64) -> u64 {
        let fs = if font_style == "italic" { crate::node::FontStyle::Italic } else { crate::node::FontStyle::Normal };
        let ta = match text_align {
            "center" => crate::node::TextAlign::Center,
            "right" => crate::node::TextAlign::Right,
            _ => crate::node::TextAlign::Left,
        };
        self.styles.add_text_style(name.to_string(), font_family.to_string(), font_size, font_weight, fs, line_height, ta, r, g, b, a)
    }

    /// Update a text style by ID (JSON partial update).
    pub fn update_text_style(&mut self, id: u64, json: &str) -> bool {
        self.styles.update_text_style(id, json)
    }

    /// Remove a text style.
    pub fn remove_text_style(&mut self, id: u64) -> bool {
        let node_ids: Vec<u64> = self.scene.all_node_ids();
        for nid in node_ids {
            if let Some(node) = self.scene.get_node_mut(nid) {
                if node.text_style_id == Some(id) {
                    node.text_style_id = None;
                }
            }
        }
        self.styles.remove_text_style(id)
    }

    /// List all text styles as JSON array.
    pub fn list_text_styles(&self) -> String {
        let styles: Vec<_> = self.styles.list_text_styles().iter().map(|s| {
            serde_json::json!({
                "id": s.id, "name": s.name,
                "font_family": s.font_family, "font_size": s.font_size,
                "font_weight": s.font_weight, "font_style": format!("{:?}", s.font_style),
                "line_height": s.line_height, "text_align": format!("{:?}", s.text_align),
                "r": s.color_r, "g": s.color_g, "b": s.color_b, "a": s.color_a,
            })
        }).collect();
        serde_json::to_string(&styles).unwrap_or_default()
    }

    /// Apply a color style to a node (sets fill color + links style ID).
    pub fn apply_color_style(&mut self, node_id: u64, style_id: u64) -> bool {
        if let Some(style) = self.styles.get_color_style(style_id) {
            let (r, g, b, a) = (style.fill_r, style.fill_g, style.fill_b, style.fill_a);
            if let Some(node) = self.scene.get_node_mut(node_id) {
                node.fills = vec![crate::node::Fill::solid(Color { r, g, b, a })];
                node.color_style_id = Some(style_id);
                return true;
            }
        }
        false
    }

    /// Detach color style from a node (keeps current fill, removes link).
    pub fn detach_color_style(&mut self, node_id: u64) -> bool {
        if let Some(node) = self.scene.get_node_mut(node_id) {
            node.color_style_id = None;
            true
        } else {
            false
        }
    }

    /// Apply a text style to a text node (sets font props + links style ID).
    pub fn apply_text_style(&mut self, node_id: u64, style_id: u64) -> bool {
        if let Some(style) = self.styles.get_text_style(style_id).cloned() {
            if let Some(node) = self.scene.get_node_mut(node_id) {
                if let NodeKind::Text { ref mut font_family, ref mut font_size, ref mut font_weight, ref mut font_style, ref mut line_height, ref mut text_align, .. } = node.kind {
                    *font_family = style.font_family;
                    *font_size = style.font_size;
                    *font_weight = style.font_weight;
                    *font_style = style.font_style;
                    *line_height = style.line_height;
                    *text_align = style.text_align;
                    node.fills = vec![crate::node::Fill::solid(Color { r: style.color_r, g: style.color_g, b: style.color_b, a: style.color_a })];
                }
                node.text_style_id = Some(style_id);
                return true;
            }
        }
        false
    }

    /// Detach text style from a node.
    pub fn detach_text_style(&mut self, node_id: u64) -> bool {
        if let Some(node) = self.scene.get_node_mut(node_id) {
            node.text_style_id = None;
            true
        } else {
            false
        }
    }

    /// Get style info for a node as JSON: { color_style_id, text_style_id, color_style_name, text_style_name }
    pub fn get_node_style_info(&self, node_id: u64) -> String {
        if let Some(node) = self.scene.get_node(node_id) {
            let cs_name = node.color_style_id.and_then(|id| self.styles.get_color_style(id)).map(|s| s.name.clone());
            let ts_name = node.text_style_id.and_then(|id| self.styles.get_text_style(id)).map(|s| s.name.clone());
            serde_json::json!({
                "color_style_id": node.color_style_id,
                "text_style_id": node.text_style_id,
                "color_style_name": cs_name,
                "text_style_name": ts_name,
            }).to_string()
        } else {
            "null".to_string()
        }
    }

    /// Sync all nodes linked to a color style (after style update).
    pub fn sync_color_style(&mut self, style_id: u64) {
        if let Some(style) = self.styles.get_color_style(style_id).cloned() {
            let node_ids: Vec<u64> = self.scene.all_node_ids();
            for nid in node_ids {
                if let Some(node) = self.scene.get_node_mut(nid) {
                    if node.color_style_id == Some(style_id) {
                        node.fills = vec![crate::node::Fill::solid(Color { r: style.fill_r, g: style.fill_g, b: style.fill_b, a: style.fill_a })];
                    }
                }
            }
        }
    }

    /// Sync all nodes linked to a text style (after style update).
    pub fn sync_text_style(&mut self, style_id: u64) {
        if let Some(style) = self.styles.get_text_style(style_id).cloned() {
            let node_ids: Vec<u64> = self.scene.all_node_ids();
            for nid in node_ids {
                if let Some(node) = self.scene.get_node_mut(nid) {
                    if node.text_style_id == Some(style_id) {
                        if let NodeKind::Text { ref mut font_family, ref mut font_size, ref mut font_weight, ref mut font_style, ref mut line_height, ref mut text_align, .. } = node.kind {
                            *font_family = style.font_family.clone();
                            *font_size = style.font_size;
                            *font_weight = style.font_weight;
                            *font_style = style.font_style.clone();
                            *line_height = style.line_height;
                            *text_align = style.text_align.clone();
                            node.fills = vec![crate::node::Fill::solid(Color { r: style.color_r, g: style.color_g, b: style.color_b, a: style.color_a })];
                        }
                    }
                }
            }
        }
    }

    /// Export all styles as JSON for file download.
    pub fn export_styles(&self) -> String {
        self.styles.export_json()
    }

    /// Import styles from JSON. Returns "cc,tc" (color count, text count imported).
    pub fn import_styles(&mut self, json: &str) -> String {
        let (cc, tc) = self.styles.import_json(json);
        format!("{},{}", cc, tc)
    }

    /// Export design tokens in the specified format.
    /// format: "w3c" | "style-dictionary" | "tailwind"
    /// Returns JSON string.
    pub fn export_design_tokens(&self, format: &str) -> String {
        let fmt = match format {
            "style-dictionary" => design_tokens::TokenFormat::StyleDictionary,
            "tailwind" => design_tokens::TokenFormat::Tailwind,
            _ => design_tokens::TokenFormat::W3C,
        };
        design_tokens::export_design_tokens(&self.styles, &self.scene.variable_collections, fmt)
    }

    /// Run design lint on all visible nodes in the active page.
    /// Returns JSON array of lint issues.
    #[wasm_bindgen]
    pub fn run_design_lint(&self) -> String {
        let config = design_lint::LintConfig::default();
        let issues = design_lint::run_lint(self.scene.nodes_map(), &config);
        serde_json::to_string(&issues).unwrap_or_else(|_| "[]".to_string())
    }

    /// Perform a boolean operation on selected nodes.
    /// op: "union" | "subtract" | "intersect" | "exclude"
    /// Returns the new node ID, or 0 if failed.
    pub fn boolean_operation(&mut self, op: &str) -> u64 {
        let sel = self.scene.selection.clone();
        if sel.len() < 2 {
            return 0;
        }

        // Get subject (first selected) and clip (second selected)
        let subject = match self.scene.get_node(sel[0]) {
            Some(n) => n.clone(),
            None => return 0,
        };
        let clip = match self.scene.get_node(sel[1]) {
            Some(n) => n.clone(),
            None => return 0,
        };

        let mut result_points = match boolean_ops::boolean_op(&subject, &clip, match op {
            "union" => boolean_ops::BooleanOp::Union,
            "subtract" => boolean_ops::BooleanOp::Subtract,
            "intersect" => boolean_ops::BooleanOp::Intersect,
            "exclude" => boolean_ops::BooleanOp::Exclude,
            _ => return 0,
        }) {
            Some(pts) => pts,
            None => return 0,
        };

        // Chain with additional nodes for union/intersect
        if sel.len() > 2 && (op == "union" || op == "intersect") {
            for &id in &sel[2..] {
                let next_node = match self.scene.get_node(id) {
                    Some(n) => n.clone(),
                    None => continue,
                };
                // Create temp path node from current result
                let mut temp = Node::new(0, NodeKind::Path { points: result_points.clone(), closed: true });
                // Calculate bounds
                recalc_path_bounds(&mut temp);
                let chain_op = match op {
                    "union" => boolean_ops::BooleanOp::Union,
                    "intersect" => boolean_ops::BooleanOp::Intersect,
                    _ => boolean_ops::BooleanOp::Union,
                };
                if let Some(pts) = boolean_ops::boolean_op(&temp, &next_node, chain_op) {
                    result_points = pts;
                }
            }
        }

        // Use first node's fills for the result
        let fills = subject.fills.clone();
        let strokes = subject.strokes.clone();

        // Create result path node
        let mut result_node = Node::new(0, NodeKind::Path { points: result_points, closed: true });
        result_node.fills = fills;
        result_node.strokes = strokes;
        let op_name = match op {
            "union" => "Union",
            "subtract" => "Subtract",
            "intersect" => "Intersect",
            "exclude" => "Exclude",
            _ => "Boolean",
        };
        result_node.name = format!("{} {}", op_name, self.scene.node_count() + 1);
        recalc_path_bounds(&mut result_node);

        let new_id = self.scene.add_node(result_node);

        // Remove original nodes
        for &id in &sel {
            self.scene.remove_node(id);
        }

        // Select the new node
        self.scene.selection = vec![new_id];

        new_id
    }

    /// Flatten selected nodes into Path nodes.
    /// Each selected non-path node is converted to a Path (polygon approximation).
    /// Groups/Frames are recursively flattened into a single union path.
    /// Returns the number of nodes flattened.
    pub fn flatten_selection(&mut self) -> u32 {
        self.push_undo();
        let sel = self.scene.selection.clone();
        if sel.is_empty() {
            return 0;
        }

        let mut count = 0u32;
        let mut new_selection = Vec::new();

        for &id in &sel {
            let node = match self.scene.get_node(id) {
                Some(n) => n.clone(),
                None => continue,
            };

            match &node.kind {
                // Already a path — skip
                NodeKind::Path { .. } => {
                    new_selection.push(id);
                    continue;
                }
                // Frame/Group: collect children polygons → union them all into one path
                NodeKind::Frame | NodeKind::Group => {
                    let child_ids = node.children.clone();
                    if child_ids.is_empty() {
                        new_selection.push(id);
                        continue;
                    }
                    // Collect all child polygons
                    let mut polygons: Vec<Vec<[f64; 2]>> = Vec::new();
                    for &cid in &child_ids {
                        if let Some(child) = self.scene.get_node(cid) {
                            let poly = boolean_ops::node_to_polygon(child);
                            if poly.len() >= 3 {
                                polygons.push(poly);
                            }
                        }
                    }
                    if polygons.is_empty() {
                        new_selection.push(id);
                        continue;
                    }
                    // Union all polygons
                    let mut result_poly = polygons[0].clone();
                    for poly in &polygons[1..] {
                        let res = result_poly.overlay(poly, OverlayRule::Union, FillRule::EvenOdd);
                        if let Some(shape) = res.first() {
                            if let Some(contour) = shape.first() {
                                if contour.len() >= 3 {
                                    result_poly = contour.clone();
                                }
                            }
                        }
                    }
                    let points: Vec<PathPoint> = result_poly.iter().map(|p| PathPoint::corner(p[0], p[1])).collect();
                    let mut result_node = Node::new(0, NodeKind::Path { points, closed: true });
                    result_node.name = format!("Flattened {}", node.name);
                    result_node.fills = node.fills.clone();
                    result_node.strokes = node.strokes.clone();
                    result_node.opacity = node.opacity;
                    result_node.blend_mode = node.blend_mode.clone();
                    recalc_path_bounds(&mut result_node);
                    let new_id = self.scene.add_node(result_node);
                    self.scene.remove_node(id);
                    new_selection.push(new_id);
                    count += 1;
                }
                // Simple shapes: convert to path
                _ => {
                    let poly = boolean_ops::node_to_polygon(&node);
                    if poly.len() < 3 {
                        new_selection.push(id);
                        continue;
                    }
                    let points: Vec<PathPoint> = poly.iter().map(|p| PathPoint::corner(p[0], p[1])).collect();
                    let closed = true;
                    let mut result_node = Node::new(0, NodeKind::Path { points, closed });
                    result_node.name = format!("Flattened {}", node.name);
                    result_node.fills = node.fills.clone();
                    result_node.strokes = node.strokes.clone();
                    result_node.opacity = node.opacity;
                    result_node.corner_radius = 0.0; // path doesn't use corner radius
                    result_node.shadows = node.shadows.clone();
                    result_node.blur = node.blur;
                    result_node.bitmap_filter = node.bitmap_filter.clone();
                    result_node.blend_mode = node.blend_mode.clone();
                    recalc_path_bounds(&mut result_node);
                    let new_id = self.scene.add_node(result_node);
                    self.scene.remove_node(id);
                    new_selection.push(new_id);
                    count += 1;
                }
            }
        }

        self.scene.selection = new_selection;
        count
    }

    // =============================================
    // Layout Grid Overlay
    // =============================================

    /// Add a layout grid to a node. grid_json: { "grid_type": "Columns"|"Rows"|"Grid", "count": 12, ... }
    pub fn add_layout_grid(&mut self, node_id: u64, grid_json: &str) -> bool {
        let grid: LayoutGrid = match serde_json::from_str(grid_json) {
            Ok(g) => g,
            Err(_) => LayoutGrid::default(),
        };
        if let Some(node) = self.scene.get_node_mut(node_id) {
            node.layout_grids.push(grid);
            true
        } else {
            false
        }
    }

    /// Remove a layout grid by index
    pub fn remove_layout_grid(&mut self, node_id: u64, index: u32) -> bool {
        let idx = index as usize;
        if let Some(node) = self.scene.get_node_mut(node_id) {
            if idx < node.layout_grids.len() {
                node.layout_grids.remove(idx);
                return true;
            }
        }
        false
    }

    /// Update a layout grid at index
    pub fn update_layout_grid(&mut self, node_id: u64, index: u32, grid_json: &str) -> bool {
        let idx = index as usize;
        let grid: LayoutGrid = match serde_json::from_str(grid_json) {
            Ok(g) => g,
            Err(_) => return false,
        };
        if let Some(node) = self.scene.get_node_mut(node_id) {
            if let Some(g) = node.layout_grids.get_mut(idx) {
                *g = grid;
                return true;
            }
        }
        false
    }

    /// Get layout grids as JSON array
    pub fn get_layout_grids(&self, node_id: u64) -> String {
        if let Some(node) = self.scene.get_node(node_id) {
            serde_json::to_string(&node.layout_grids).unwrap_or_else(|_| "[]".to_string())
        } else {
            "[]".to_string()
        }
    }

    /// Toggle visibility of a specific layout grid
    pub fn set_layout_grid_visible(&mut self, node_id: u64, index: u32, visible: bool) {
        if let Some(node) = self.scene.get_node_mut(node_id) {
            if let Some(g) = node.layout_grids.get_mut(index as usize) {
                g.visible = visible;
            }
        }
    }

    // =============================================
    // Comments / Annotations
    // =============================================

    /// Add a comment at (x, y) canvas coords. Returns comment ID.
    pub fn add_comment(&mut self, x: f64, y: f64, author: &str, text: &str) -> u32 {
        self.push_undo();
        self.scene.add_comment(x, y, author, text, None) as u32
    }

    /// Add a comment pinned to a specific node
    pub fn add_comment_on_node(&mut self, x: f64, y: f64, author: &str, text: &str, node_id: u32) -> u32 {
        self.push_undo();
        self.scene.add_comment(x, y, author, text, Some(node_id as u64)) as u32
    }

    /// Remove a comment by ID
    pub fn remove_comment(&mut self, comment_id: u32) -> bool {
        self.push_undo();
        self.scene.remove_comment(comment_id as u64)
    }

    /// Resolve/unresolve a comment
    pub fn resolve_comment(&mut self, comment_id: u32, resolved: bool) {
        self.push_undo();
        self.scene.resolve_comment(comment_id as u64, resolved);
    }

    /// Edit comment text
    pub fn edit_comment(&mut self, comment_id: u32, text: &str) {
        self.push_undo();
        self.scene.edit_comment(comment_id as u64, text);
    }

    /// Add a reply to a comment thread
    pub fn add_reply(&mut self, comment_id: u32, author: &str, text: &str) -> u32 {
        self.push_undo();
        self.scene.add_reply(comment_id as u64, author, text) as u32
    }

    /// Remove a reply
    pub fn remove_reply(&mut self, comment_id: u32, reply_id: u32) -> bool {
        self.push_undo();
        self.scene.remove_reply(comment_id as u64, reply_id as u64)
    }

    /// Get all comments for current page as JSON
    pub fn get_comments(&self) -> String {
        let comments = self.scene.get_comments_for_page();
        serde_json::to_string(&comments).unwrap_or_else(|_| "[]".to_string())
    }

    /// Get all comments (all pages) as JSON
    pub fn get_all_comments(&self) -> String {
        serde_json::to_string(self.scene.get_all_comments()).unwrap_or_else(|_| "[]".to_string())
    }

    /// Get a single comment as JSON
    pub fn get_comment(&self, comment_id: u32) -> String {
        match self.scene.get_comment(comment_id as u64) {
            Some(c) => serde_json::to_string(c).unwrap_or_else(|_| "null".to_string()),
            None => "null".to_string(),
        }
    }

    /// Get comment count for current page
    pub fn get_comment_count(&self) -> u32 {
        self.scene.get_comments_for_page().len() as u32
    }

    /// Export all comments as Markdown report
    pub fn export_comments_markdown(&self) -> String {
        self.scene.export_comments_markdown()
    }

    pub fn export_annotations_markdown(&self) -> String {
        self.scene.export_annotations_markdown()
    }

    pub fn export_annotations_json(&self) -> String {
        self.scene.export_annotations_json()
    }

    pub fn select_all(&mut self) {
        self.scene.select_all();
    }

    pub fn bring_to_front(&mut self, id: u64) {
        self.scene.bring_to_front(id);
    }

    pub fn send_to_back(&mut self, id: u64) {
        self.scene.send_to_back(id);
    }

    pub fn bring_forward(&mut self, id: u64) {
        self.scene.bring_forward(id);
    }

    pub fn send_backward(&mut self, id: u64) {
        self.scene.send_backward(id);
    }

    pub fn group_selected(&mut self) -> u64 {
        if self.scene.selection.len() < 2 { return 0; }
        let sel = self.scene.selection.clone();
        let bounds = match self.scene.get_bounds_of(&sel) {
            Some(b) => b,
            None => return 0,
        };
        let mut group = Node::new(0, NodeKind::Group);
        group.x = bounds.0;
        group.y = bounds.1;
        group.width = bounds.2 - bounds.0;
        group.height = bounds.3 - bounds.1;
        group.name = format!("Group {}", self.scene.node_count() + 1);
        let first_parent = self.scene.get_node(sel[0]).and_then(|n| n.parent);
        group.parent = first_parent;
        let group_id = self.scene.add_node(group);
        for &id in &sel {
            self.scene.reparent(id, Some(group_id));
        }
        self.scene.selection = vec![group_id];
        group_id
    }

    pub fn ungroup(&mut self, id: u64) -> bool {
        let (children, parent) = if let Some(node) = self.scene.get_node(id) {
            match node.kind {
                NodeKind::Group => (node.children.clone(), node.parent),
                _ => return false,
            }
        } else {
            return false;
        };
        let mut new_sel = vec![];
        for cid in &children {
            self.scene.reparent(*cid, parent);
            new_sel.push(*cid);
        }
        self.scene.remove_node(id);
        self.scene.selection = new_sel;
        true
    }

    // =============================================
    // Variable Collections
    // =============================================

    pub fn create_collection(&mut self, name: &str) -> u64 {
        self.scene.create_collection(name.to_string())
    }

    pub fn rename_collection(&mut self, id: u64, name: &str) {
        if let Some(c) = self.scene.get_collection_mut(id) {
            c.name = name.to_string();
        }
    }

    pub fn delete_collection(&mut self, id: u64) -> bool {
        self.scene.delete_collection(id)
    }

    pub fn var_add_mode(&mut self, collection_id: u64, name: &str) -> u64 {
        if let Some(c) = self.scene.get_collection_mut(collection_id) {
            c.add_mode(name.to_string())
        } else {
            0
        }
    }

    pub fn var_rename_mode(&mut self, collection_id: u64, mode_id: u64, name: &str) {
        if let Some(c) = self.scene.get_collection_mut(collection_id) {
            c.rename_mode(mode_id, name.to_string());
        }
    }

    pub fn var_delete_mode(&mut self, collection_id: u64, mode_id: u64) -> bool {
        if let Some(c) = self.scene.get_collection_mut(collection_id) {
            c.remove_mode(mode_id)
        } else {
            false
        }
    }

    pub fn set_active_mode(&mut self, collection_id: u64, mode_id: u64) {
        if let Some(c) = self.scene.get_collection_mut(collection_id) {
            if c.modes.iter().any(|m| m.id == mode_id) {
                c.active_mode_id = mode_id;
            }
        }
    }

    pub fn create_variable(&mut self, collection_id: u64, name: &str, var_type: &str) -> u64 {
        let vt = match var_type {
            "Color" | "color" => variable::VariableType::Color,
            "Number" | "number" => variable::VariableType::Number,
            "String" | "string" => variable::VariableType::String,
            "Boolean" | "boolean" => variable::VariableType::Boolean,
            _ => variable::VariableType::Color,
        };
        if let Some(c) = self.scene.get_collection_mut(collection_id) {
            c.create_variable(name.to_string(), vt)
        } else {
            0
        }
    }

    pub fn set_variable_value(&mut self, collection_id: u64, var_id: u64, mode_id: u64, value_json: &str) -> bool {
        let val: serde_json::Value = match serde_json::from_str(value_json) {
            Ok(v) => v,
            Err(_) => return false,
        };
        let var_val = if let Some(s) = val.get("Color").and_then(|v| v.as_str()) {
            variable::VariableValue::Color(s.to_string())
        } else if let Some(n) = val.get("Number").and_then(|v| v.as_f64()) {
            variable::VariableValue::Number(n)
        } else if let Some(s) = val.get("String").and_then(|v| v.as_str()) {
            variable::VariableValue::String(s.to_string())
        } else if let Some(b) = val.get("Boolean").and_then(|v| v.as_bool()) {
            variable::VariableValue::Boolean(b)
        } else {
            return false;
        };
        if let Some(c) = self.scene.get_collection_mut(collection_id) {
            c.update_variable_value(var_id, mode_id, var_val)
        } else {
            false
        }
    }

    pub fn delete_variable(&mut self, collection_id: u64, var_id: u64) -> bool {
        if let Some(c) = self.scene.get_collection_mut(collection_id) {
            c.delete_variable(var_id)
        } else {
            false
        }
    }

    pub fn get_collections(&self) -> String {
        serde_json::to_string(&self.scene.variable_collections).unwrap_or_else(|_| "[]".to_string())
    }

    pub fn bind_variable(&mut self, node_id: u64, property: &str, collection_id: u64, var_id: u64) {
        self.scene.bind_variable(node_id, property.to_string(), collection_id, var_id);
    }

    pub fn unbind_variable(&mut self, node_id: u64, property: &str) {
        self.scene.unbind_variable(node_id, property);
    }

    pub fn get_bindings(&self, node_id: u64) -> String {
        let bindings = self.scene.get_bindings_for_node(node_id);
        let result: Vec<serde_json::Value> = bindings.iter().map(|(prop, b)| {
            serde_json::json!({
                "property": prop,
                "collection_id": b.collection_id,
                "variable_id": b.variable_id,
            })
        }).collect();
        serde_json::to_string(&result).unwrap_or_else(|_| "[]".to_string())
    }

    pub fn apply_variables(&mut self) {
        self.scene.apply_variables();
    }

    /// Set collection scope: "global", "pages:[1,2,3]", or "nodes:[4,5,6]"
    pub fn set_collection_scope(&mut self, collection_id: u64, scope_json: &str) -> bool {
        use crate::variable::VariableScope;
        let scope: Result<VariableScope, _> = serde_json::from_str(scope_json);
        match scope {
            Ok(s) => {
                self.scene.set_collection_scope(collection_id, s);
                true
            }
            Err(_) => false,
        }
    }

    /// Get collection scope as JSON
    pub fn get_collection_scope(&self, collection_id: u64) -> String {
        match self.scene.get_collection_scope(collection_id) {
            Some(scope) => serde_json::to_string(scope).unwrap_or_else(|_| "\"Global\"".to_string()),
            None => "null".to_string(),
        }
    }

    // =============================================
    // Conditional Visibility
    // =============================================

    pub fn set_conditional_visibility(&mut self, node_id: u64, collection_id: u64, variable_id: u64, operator: &str, value_json: &str) {
        use crate::variable::{VisibilityOperator, VisibilityCondition, VariableValue};
        let op = match operator {
            "eq" => VisibilityOperator::Eq,
            "neq" => VisibilityOperator::NotEq,
            "gt" => VisibilityOperator::Gt,
            "lt" => VisibilityOperator::Lt,
            "gte" => VisibilityOperator::Gte,
            "lte" => VisibilityOperator::Lte,
            "is_true" => VisibilityOperator::IsTrue,
            "is_false" => VisibilityOperator::IsFalse,
            _ => VisibilityOperator::Eq,
        };
        let value: Option<VariableValue> = if value_json.is_empty() || operator == "is_true" || operator == "is_false" {
            None
        } else {
            serde_json::from_str(value_json).ok()
        };
        if let Some(node) = self.scene.get_node_mut(node_id) {
            node.conditional_visibility = Some(VisibilityCondition {
                collection_id,
                variable_id,
                operator: op,
                value,
            });
        }
    }

    pub fn get_conditional_visibility(&self, node_id: u64) -> String {
        if let Some(node) = self.scene.get_node(node_id) {
            if let Some(ref cond) = node.conditional_visibility {
                return serde_json::to_string(cond).unwrap_or_else(|_| "null".to_string());
            }
        }
        "null".to_string()
    }

    pub fn clear_conditional_visibility(&mut self, node_id: u64) {
        if let Some(node) = self.scene.get_node_mut(node_id) {
            node.conditional_visibility = None;
        }
    }

    pub fn is_effectively_visible(&self, node_id: u64) -> bool {
        self.scene.is_effectively_visible(node_id)
    }

    // --- Scrollable frames ---

    pub fn set_overflow(&mut self, node_id: u64, overflow: &str) {
        if let Some(node) = self.scene.get_node_mut(node_id) {
            node.overflow = match overflow {
                "hidden" => crate::node::Overflow::Hidden,
                "scroll" => crate::node::Overflow::Scroll,
                _ => crate::node::Overflow::Visible,
            };
        }
    }

    pub fn get_overflow(&self, node_id: u64) -> String {
        self.scene.get_node(node_id).map(|n| match n.overflow {
            crate::node::Overflow::Visible => "visible",
            crate::node::Overflow::Hidden => "hidden",
            crate::node::Overflow::Scroll => "scroll",
        }).unwrap_or("visible").to_string()
    }

    pub fn set_scroll_offset(&mut self, node_id: u64, scroll_x: f64, scroll_y: f64) {
        if let Some(node) = self.scene.get_node_mut(node_id) {
            node.scroll_x = scroll_x;
            node.scroll_y = scroll_y;
        }
    }

    pub fn get_scroll_offset(&self, node_id: u64) -> String {
        self.scene.get_node(node_id).map(|n| {
            format!("{{\"x\":{},\"y\":{}}}", n.scroll_x, n.scroll_y)
        }).unwrap_or_else(|| "{\"x\":0,\"y\":0}".to_string())
    }

    /// Get the content bounds of a frame's children (for scroll limits)
    pub fn get_content_bounds(&self, node_id: u64) -> String {
        if let Some(node) = self.scene.get_node(node_id) {
            let mut min_x = f64::MAX;
            let mut min_y = f64::MAX;
            let mut max_x = f64::MIN;
            let mut max_y = f64::MIN;
            for &cid in &node.children {
                if let Some(c) = self.scene.get_node(cid) {
                    if !c.visible { continue; }
                    min_x = min_x.min(c.x);
                    min_y = min_y.min(c.y);
                    max_x = max_x.max(c.x + c.width);
                    max_y = max_y.max(c.y + c.height);
                }
            }
            if min_x < max_x && min_y < max_y {
                return format!("{{\"x\":{},\"y\":{},\"width\":{},\"height\":{}}}", min_x, min_y, max_x - min_x, max_y - min_y);
            }
        }
        format!("{{\"x\":0,\"y\":0,\"width\":0,\"height\":0}}")
    }

    // =============================================
    // Text on Path
    // =============================================

    /// Attach a text node to a path node (text follows the path curve).
    pub fn set_text_path(&mut self, text_id: u64, path_id: u64) {
        if let Some(node) = self.scene.get_node_mut(text_id) {
            if let NodeKind::Text { .. } = &node.kind {
                node.text_path_id = if path_id == 0 { None } else { Some(path_id) };
            }
        }
    }

    /// Detach text from path (revert to normal text).
    pub fn clear_text_path(&mut self, text_id: u64) {
        if let Some(node) = self.scene.get_node_mut(text_id) {
            node.text_path_id = None;
            node.text_path_offset = 0.0;
        }
    }

    /// Set the start offset (0.0–1.0) for text-on-path.
    pub fn set_text_path_offset(&mut self, text_id: u64, offset: f64) {
        if let Some(node) = self.scene.get_node_mut(text_id) {
            node.text_path_offset = offset.clamp(0.0, 1.0);
        }
    }

    /// Get text-on-path info as JSON: { path_id, offset } or null.
    pub fn get_text_path_info(&self, text_id: u64) -> String {
        if let Some(node) = self.scene.get_node(text_id) {
            if let Some(pid) = node.text_path_id {
                return serde_json::json!({
                    "path_id": pid,
                    "offset": node.text_path_offset,
                }).to_string();
            }
        }
        "null".to_string()
    }

    /// Get glyph positions for text-on-path rendering.
    /// char_widths_json: JSON array of character widths (measured in TS).
    /// Returns JSON array of {x, y, angle} for each character.
    pub fn get_text_on_path_positions(&self, text_id: u64, char_widths_json: &str) -> String {
        let node = match self.scene.get_node(text_id) {
            Some(n) => n,
            None => return "[]".to_string(),
        };
        let path_id = match node.text_path_id {
            Some(id) => id,
            None => return "[]".to_string(),
        };
        let offset = node.text_path_offset;
        let path_node = match self.scene.get_node(path_id) {
            Some(n) => n,
            None => return "[]".to_string(),
        };
        let (points, closed) = match &path_node.kind {
            NodeKind::Path { points, closed } => (points, *closed),
            _ => return "[]".to_string(),
        };
        let widths: Vec<f64> = serde_json::from_str(char_widths_json).unwrap_or_default();
        let samples = path_utils::text_positions_on_path(points, closed, &widths, offset);
        let result: Vec<serde_json::Value> = samples.iter().map(|s| {
            serde_json::json!({"x": s.x, "y": s.y, "angle": s.angle})
        }).collect();
        serde_json::to_string(&result).unwrap_or_else(|_| "[]".to_string())
    }

    /// Get the SVG path d-string for a path node (for SVG textPath).
    pub fn get_path_svg_d(&self, path_id: u64) -> String {
        if let Some(node) = self.scene.get_node(path_id) {
            if let NodeKind::Path { ref points, closed } = node.kind {
                return path_utils::path_to_svg_d(points, closed);
            }
        }
        String::new()
    }
}

/// Recalculate a path node's bounding box from its points (including bezier handles).
fn recalc_path_bounds(node: &mut Node) {
    if let NodeKind::Path { ref points, .. } = node.kind {
        if points.is_empty() {
            node.width = 0.0;
            node.height = 0.0;
            return;
        }
        let mut min_x = f64::INFINITY;
        let mut min_y = f64::INFINITY;
        let mut max_x = f64::NEG_INFINITY;
        let mut max_y = f64::NEG_INFINITY;
        for pt in points {
            for (px, py) in [(pt.x, pt.y), (pt.handle_in_x, pt.handle_in_y), (pt.handle_out_x, pt.handle_out_y)] {
                min_x = min_x.min(px);
                min_y = min_y.min(py);
                max_x = max_x.max(px);
                max_y = max_y.max(py);
            }
        }
        node.x = min_x;
        node.y = min_y;
        node.width = (max_x - min_x).max(1.0);
        node.height = (max_y - min_y).max(1.0);
    }
}

fn recalc_vn_bounds(node: &mut Node) {
    if let NodeKind::VectorNetwork(ref vn) = node.kind {
        let (bx, by, bw, bh) = vn.bounds();
        if bw > 0.0 || bh > 0.0 {
            node.x = bx;
            node.y = by;
            node.width = bw.max(1.0);
            node.height = bh.max(1.0);
        }
    }
}

// ---- Responsive Breakpoints (inside Engine impl) ----
#[wasm_bindgen]
impl Engine {

    /// Add a breakpoint to a node. `json` is a JSON-serialized Breakpoint object.
    /// Returns the index of the added breakpoint.
    pub fn add_breakpoint(&mut self, id: u64, json: &str) -> i32 {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let Ok(bp) = serde_json::from_str::<Breakpoint>(json) {
                node.breakpoints.push(bp);
                // Keep sorted by max_width ascending
                node.breakpoints.sort_by(|a, b| a.max_width.partial_cmp(&b.max_width).unwrap());
                return (node.breakpoints.len() - 1) as i32;
            }
        }
        -1
    }

    /// Remove a breakpoint by index.
    pub fn remove_breakpoint(&mut self, id: u64, index: u32) {
        if let Some(node) = self.scene.get_node_mut(id) {
            let idx = index as usize;
            if idx < node.breakpoints.len() {
                node.breakpoints.remove(idx);
            }
        }
    }

    /// Update a breakpoint at index. `json` is a JSON-serialized Breakpoint.
    pub fn update_breakpoint(&mut self, id: u64, index: u32, json: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            let idx = index as usize;
            if idx < node.breakpoints.len() {
                if let Ok(bp) = serde_json::from_str::<Breakpoint>(json) {
                    node.breakpoints[idx] = bp;
                    node.breakpoints.sort_by(|a, b| a.max_width.partial_cmp(&b.max_width).unwrap());
                }
            }
        }
    }

    /// Get all breakpoints for a node as JSON array.
    pub fn get_breakpoints(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            serde_json::to_string(&node.breakpoints).unwrap_or_else(|_| "[]".to_string())
        } else {
            "[]".to_string()
        }
    }

    /// Get the count of breakpoints for a node.
    pub fn get_breakpoint_count(&self, id: u64) -> u32 {
        self.scene.get_node(id).map(|n| n.breakpoints.len() as u32).unwrap_or(0)
    }

    /// Get the active breakpoint index for a node based on its current width (-1 = none active).
    pub fn get_active_breakpoint(&self, id: u64) -> i32 {
        if let Some(node) = self.scene.get_node(id) {
            if node.breakpoints.is_empty() { return -1; }
            // Find smallest max_width >= node.width
            for (i, bp) in node.breakpoints.iter().enumerate() {
                if node.width <= bp.max_width {
                    return i as i32;
                }
            }
        }
        -1
    }

    // ─── Responsive Token System WASM bindings ───

    #[wasm_bindgen]
    pub fn add_responsive_preset(&mut self, label: &str, width: f64, height: f64) -> u64 {
        let h = if height > 0.0 { Some(height) } else { None };
        self.scene.add_responsive_preset(label.to_string(), width, h)
    }

    #[wasm_bindgen]
    pub fn remove_responsive_preset(&mut self, preset_id: u64) -> bool {
        self.scene.remove_responsive_preset(preset_id)
    }

    #[wasm_bindgen]
    pub fn update_responsive_preset(&mut self, preset_id: u64, label: &str, width: f64, height: f64) -> bool {
        let l = if label.is_empty() { None } else { Some(label.to_string()) };
        let w = if width > 0.0 { Some(width) } else { None };
        let h = if height > 0.0 { Some(Some(height)) } else if height == 0.0 { None } else { Some(None) };
        self.scene.update_responsive_preset(preset_id, l, w, h)
    }

    #[wasm_bindgen]
    pub fn set_preset_mode_mapping(&mut self, preset_id: u64, collection_id: u64, mode_id: u64) -> bool {
        self.scene.set_preset_mode_mapping(preset_id, collection_id, mode_id)
    }

    #[wasm_bindgen]
    pub fn remove_preset_mode_mapping(&mut self, preset_id: u64, collection_id: u64) -> bool {
        self.scene.remove_preset_mode_mapping(preset_id, collection_id)
    }

    #[wasm_bindgen]
    pub fn activate_responsive_preset(&mut self, preset_id: u64) -> bool {
        self.scene.activate_preset(preset_id)
    }

    #[wasm_bindgen]
    pub fn set_preview_width(&mut self, width: f64) -> u64 {
        self.scene.set_preview_width(width)
    }

    #[wasm_bindgen]
    pub fn get_responsive_presets(&self) -> String {
        self.scene.get_responsive_presets_json()
    }

    #[wasm_bindgen]
    pub fn get_active_preset_id(&self) -> u64 {
        self.scene.get_active_preset_id()
    }

    // ─── Animation WASM bindings ───

    #[wasm_bindgen]
    pub fn anim_add_clip(&mut self, name: &str) -> u64 {
        self.scene.anim_add_clip(name)
    }

    #[wasm_bindgen]
    pub fn anim_remove_clip(&mut self, clip_id: u64) -> bool {
        self.scene.anim_remove_clip(clip_id)
    }

    #[wasm_bindgen]
    pub fn anim_rename_clip(&mut self, clip_id: u64, name: &str) -> bool {
        self.scene.anim_rename_clip(clip_id, name)
    }

    #[wasm_bindgen]
    pub fn anim_set_looping(&mut self, clip_id: u64, looping: bool) -> bool {
        self.scene.anim_set_looping(clip_id, looping)
    }

    #[wasm_bindgen]
    pub fn anim_set_duration(&mut self, clip_id: u64, duration_ms: u32) -> bool {
        self.scene.anim_set_duration(clip_id, duration_ms)
    }

    /// Add a keyframe. property: "x"|"y"|"width"|"height"|"rotation"|"opacity"|"corner_radius"|"blur"|"fill_r:0"|"fill_g:0"|"fill_b:0"|"fill_a:0"|"stroke_width:0"
    /// easing: "linear"|"ease_in"|"ease_out"|"ease_in_out"|"cubic_bezier:x1,y1,x2,y2"
    #[wasm_bindgen]
    pub fn anim_add_keyframe(&mut self, clip_id: u64, node_id: u64, property: &str, time_ms: u32, value: f64, easing: &str) -> bool {
        let prop = match parse_anim_property(property) {
            Some(p) => p,
            None => return false,
        };
        let ease = parse_easing(easing);
        self.scene.anim_add_keyframe(clip_id, node_id, prop, time_ms, value, ease)
    }

    #[wasm_bindgen]
    pub fn anim_remove_keyframe(&mut self, clip_id: u64, node_id: u64, property: &str, time_ms: u32) -> bool {
        let prop = match parse_anim_property(property) {
            Some(p) => p,
            None => return false,
        };
        self.scene.anim_remove_keyframe(clip_id, node_id, &prop, time_ms)
    }

    /// Apply animation at time_ms, returns JSON array of changed node IDs
    #[wasm_bindgen]
    pub fn anim_apply(&mut self, clip_id: u64, time_ms: u32) -> String {
        let changed = self.scene.anim_apply(clip_id, time_ms);
        serde_json::to_string(&changed).unwrap_or_else(|_| "[]".to_string())
    }

    #[wasm_bindgen]
    pub fn anim_get_clips(&self) -> String {
        self.scene.anim_get_clips_json()
    }

    #[wasm_bindgen]
    pub fn anim_get_clip(&self, clip_id: u64) -> String {
        self.scene.anim_get_clip_json(clip_id).unwrap_or_else(|| "null".to_string())
    }

    /// Get clip duration in ms
    #[wasm_bindgen]
    pub fn anim_get_duration(&self, clip_id: u64) -> u32 {
        self.scene.animations.get_clip(clip_id).map(|c| c.effective_duration()).unwrap_or(0)
    }

    /// Record current property values as keyframes for selected nodes
    #[wasm_bindgen]
    /// Extract all unique colors used in the scene
    #[wasm_bindgen]
    pub fn extract_colors(&self) -> String {
        let entries = color_palette::extract_colors(self.scene.all_nodes());
        serde_json::to_string(&entries).unwrap_or_else(|_| "[]".into())
    }

    /// Generate harmony palettes from a base hex color (e.g. "#ff6600")
    #[wasm_bindgen]
    pub fn generate_palettes(&self, base_hex: &str) -> String {
        let palettes = color_palette::generate_palettes(base_hex);
        serde_json::to_string(&palettes).unwrap_or_else(|_| "[]".into())
    }

    /// Check contrast between extracted scene colors (WCAG AA/AAA)
    #[wasm_bindgen]
    pub fn check_color_contrast(&self) -> String {
        let entries = color_palette::extract_colors(self.scene.all_nodes());
        let pairs = color_palette::check_contrast_pairs(&entries);
        serde_json::to_string(&pairs).unwrap_or_else(|_| "[]".into())
    }

    #[wasm_bindgen]
    pub fn anim_record_selected(&mut self, clip_id: u64, time_ms: u32, properties: &str) -> u32 {
        let sel: Vec<u64> = self.scene.selection.clone();
        let props: Vec<&str> = properties.split(',').collect();
        // Collect values first to avoid borrow conflict
        let mut to_add: Vec<(u64, animation::AnimProperty, f64)> = Vec::new();
        for &nid in &sel {
            if let Some(node) = self.scene.get_node(nid) {
                for prop_str in &props {
                    let prop_str = prop_str.trim();
                    if let Some(prop) = parse_anim_property(prop_str) {
                        if let Some(v) = get_node_property_value(node, &prop) {
                            to_add.push((nid, prop, v));
                        }
                    }
                }
            }
        }
        let mut count = 0u32;
        for (nid, prop, v) in to_add {
            if self.scene.anim_add_keyframe(clip_id, nid, prop, time_ms, v, animation::Easing::EaseInOut) {
                count += 1;
            }
        }
        count
    }

    // ── Find & Replace ──────────────────────────────────────────

    #[wasm_bindgen]
    pub fn find_text(&self, query: &str, case_sensitive: bool) -> String {
        let results = self.scene.find_text(query, case_sensitive);
        serde_json::to_string(&results).unwrap_or_default()
    }

    #[wasm_bindgen]
    pub fn replace_text(&mut self, node_id: u64, search: &str, replacement: &str, case_sensitive: bool) -> bool {
        self.push_undo();
        self.scene.replace_text_in_node(node_id, search, replacement, case_sensitive)
    }

    #[wasm_bindgen]
    pub fn replace_all_text(&mut self, search: &str, replacement: &str, case_sensitive: bool) -> u32 {
        self.push_undo();
        self.scene.replace_all_text(search, replacement, case_sensitive)
    }

    #[wasm_bindgen]
    pub fn find_by_color(&self, hex: &str) -> String {
        let results = self.scene.find_by_color(hex);
        serde_json::to_string(&results).unwrap_or_default()
    }

    #[wasm_bindgen]
    pub fn replace_color(&mut self, from_hex: &str, to_hex: &str) -> u32 {
        self.push_undo();
        self.scene.replace_color(from_hex, to_hex)
    }
}

fn parse_anim_property(s: &str) -> Option<animation::AnimProperty> {
    use animation::AnimProperty::*;
    match s {
        "x" => Some(X),
        "y" => Some(Y),
        "width" => Some(Width),
        "height" => Some(Height),
        "rotation" => Some(Rotation),
        "opacity" => Some(Opacity),
        "corner_radius" => Some(CornerRadius),
        "blur" => Some(Blur),
        "scale_x" => Some(ScaleX),
        "scale_y" => Some(ScaleY),
        _ if s.starts_with("fill_r:") => s[7..].parse::<usize>().ok().map(FillR),
        _ if s.starts_with("fill_g:") => s[7..].parse::<usize>().ok().map(FillG),
        _ if s.starts_with("fill_b:") => s[7..].parse::<usize>().ok().map(FillB),
        _ if s.starts_with("fill_a:") => s[7..].parse::<usize>().ok().map(FillA),
        _ if s.starts_with("stroke_width:") => s[13..].parse::<usize>().ok().map(StrokeWidth),
        _ => None,
    }
}

fn parse_easing(s: &str) -> animation::Easing {
    match s {
        "linear" => animation::Easing::Linear,
        "ease_in" => animation::Easing::EaseIn,
        "ease_out" => animation::Easing::EaseOut,
        "ease_in_out" => animation::Easing::EaseInOut,
        _ if s.starts_with("cubic_bezier:") => {
            let nums: Vec<f64> = s[13..].split(',').filter_map(|n| n.trim().parse().ok()).collect();
            if nums.len() == 4 {
                animation::Easing::CubicBezier(nums[0], nums[1], nums[2], nums[3])
            } else {
                animation::Easing::EaseInOut
            }
        }
        _ => animation::Easing::EaseInOut,
    }
}

fn get_node_property_value(node: &node::Node, prop: &animation::AnimProperty) -> Option<f64> {
    use animation::AnimProperty::*;
    match prop {
        X => Some(node.x),
        Y => Some(node.y),
        Width => Some(node.width),
        Height => Some(node.height),
        Rotation => Some(node.rotation),
        Opacity => Some(node.opacity),
        CornerRadius => Some(node.corner_radius),
        Blur => Some(node.blur),
        FillR(idx) => node.fills.get(*idx).map(|f| f.color().r as f64),
        FillG(idx) => node.fills.get(*idx).map(|f| f.color().g as f64),
        FillB(idx) => node.fills.get(*idx).map(|f| f.color().b as f64),
        FillA(idx) => node.fills.get(*idx).map(|f| f.color().a),
        StrokeWidth(idx) => node.strokes.get(*idx).map(|s| s.width),
        ScaleX => Some(node.width),
        ScaleY => Some(node.height),
    }
}
