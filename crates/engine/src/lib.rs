mod types;
mod transform;
mod node;
mod scene;
mod render;
pub mod plugin;
mod hit_test;
pub mod component;
mod layout;
pub mod layout_suggest;
mod svg_export;
mod boolean_ops;
pub mod styles;
pub mod variable;
mod design_tokens;
pub mod token;
pub mod path_utils;
pub mod animation;
mod design_lint;
pub mod accessibility;
mod design_polish;
mod color_palette;
pub mod anchor;
mod smart_select;
pub mod vector_network;
pub mod auto_animate;
pub mod branch;
mod find_replace;
pub mod permissions;
mod smart_component;
pub mod recording;
mod svg_import;
pub mod code_to_design;
pub mod code_export;
mod design_health;
mod handoff_checklist;
mod smart_replace;
mod content_fill;
pub mod crdt;
pub mod whiteboard;
mod component_playground;
mod email_export;
pub mod snapshot_test;
mod design_quiz;
pub mod migration_assistant;
pub mod stamp;
pub mod typo_scale;
mod lottie_export;
pub mod dep_graph;

use wasm_bindgen::prelude::*;
use web_sys::CanvasRenderingContext2d;
use i_overlay::core::fill_rule::FillRule;
use i_overlay::core::overlay_rule::OverlayRule;
use i_overlay::float::single::SingleFloatOverlay;
use crate::node::{Node, NodeKind, Fill, FillType, GradientStop, Stroke, StrokeAlign, LayoutMode, FlexDirection, Align, Justify, FlexWrap, TextSizing, TextOverflow, TextAlign, FontStyle, PathPoint, ConstraintH, ConstraintV, BlendMode, LayoutGrid, SizingMode, Breakpoint};

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
use crate::node::{Note, Shadow, Interaction, InteractionTrigger, InteractionAction, TransitionType, Comment};
use crate::styles::StyleStore;
use crate::permissions::PermissionStore;
use crate::recording::RecordingStore;

#[wasm_bindgen]
pub struct Engine {
    scene: Scene,
    renderer: Renderer,
    editing_node: Option<u64>,
    components: ComponentStore,
    styles: StyleStore,
    undo_stack: Vec<String>,
    redo_stack: Vec<String>,
    permissions: PermissionStore,
    /// Current user ID for permission checks
    current_user_id: String,
    recording: RecordingStore,
    crdt: crdt::CRDTDoc,
    snapshot_store: snapshot_test::SnapshotStore,
    plugin_store: plugin::PluginStore,
}

#[derive(serde::Serialize)]
struct CropSuggestion {
    label: String,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

/// Compute crop suggestions centered on focal point for a given target aspect ratio
fn compute_crop_suggestions(fx: f64, fy: f64, img_w: f64, img_h: f64, target_ratio: f64) -> Vec<CropSuggestion> {
    let mut suggestions = Vec::new();

    // Helper: compute best crop rect for a given aspect ratio centered on focal point
    let make_crop = |ratio: f64, label: &str| -> CropSuggestion {
        let img_ratio = img_w / img_h.max(1.0);
        let (cw, ch) = if ratio > img_ratio {
            // width-limited
            (1.0, (img_w / ratio) / img_h)
        } else {
            // height-limited
            ((img_h * ratio) / img_w, 1.0)
        };
        let cw = cw.min(1.0);
        let ch = ch.min(1.0);
        // Center on focal point, clamped to image bounds
        let cx = (fx - cw / 2.0).clamp(0.0, 1.0 - cw);
        let cy = (fy - ch / 2.0).clamp(0.0, 1.0 - ch);
        CropSuggestion { label: label.to_string(), x: cx, y: cy, w: cw, h: ch }
    };

    // Node aspect ratio (smart fit)
    suggestions.push(make_crop(target_ratio, "Smart Fit"));

    // Rule of thirds: nudge focal toward nearest third intersection
    {
        let thirds_x = [1.0/3.0, 2.0/3.0];
        let thirds_y = [1.0/3.0, 2.0/3.0];
        let mut best_dx = f64::MAX;
        let mut best_tx = fx;
        let mut best_ty = fy;
        for &tx in &thirds_x {
            for &ty in &thirds_y {
                let d = (fx - tx).powi(2) + (fy - ty).powi(2);
                if d < best_dx { best_dx = d; best_tx = tx; best_ty = ty; }
            }
        }
        let img_ratio = img_w / img_h.max(1.0);
        let (cw, ch) = if target_ratio > img_ratio {
            (1.0, (img_w / target_ratio) / img_h)
        } else {
            ((img_h * target_ratio) / img_w, 1.0)
        };
        let cw = cw.min(1.0);
        let ch = ch.min(1.0);
        let cx = (best_tx - cw / 2.0).clamp(0.0, 1.0 - cw);
        let cy = (best_ty - ch / 2.0).clamp(0.0, 1.0 - ch);
        suggestions.push(CropSuggestion { label: "Rule of Thirds".into(), x: cx, y: cy, w: cw, h: ch });
    }

    // Center crop
    {
        let img_ratio = img_w / img_h.max(1.0);
        let (cw, ch) = if target_ratio > img_ratio {
            (1.0, (img_w / target_ratio) / img_h)
        } else {
            ((img_h * target_ratio) / img_w, 1.0)
        };
        let cw = cw.min(1.0);
        let ch = ch.min(1.0);
        let cx = (0.5 - cw / 2.0).max(0.0);
        let cy = (0.5 - ch / 2.0).max(0.0);
        suggestions.push(CropSuggestion { label: "Center".into(), x: cx, y: cy, w: cw, h: ch });
    }

    // Square crop centered on focal
    suggestions.push(make_crop(1.0, "Square"));

    // 16:9 crop centered on focal
    suggestions.push(make_crop(16.0 / 9.0, "16:9"));

    // 4:3 crop
    suggestions.push(make_crop(4.0 / 3.0, "4:3"));

    suggestions
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
            permissions: PermissionStore::new(),
            current_user_id: String::from("local"),
            snapshot_store: snapshot_test::SnapshotStore::new(),
            recording: RecordingStore::new(),
            crdt: crdt::CRDTDoc::new("local"),
            plugin_store: plugin::PluginStore::new(),
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

    /// Get per-node render complexity scores for all nodes.
    /// Returns JSON: [{ "id": number, "name": string, "kind": string, "complexity": number, "w": number, "h": number }]
    pub fn get_node_complexity_report(&self) -> String {
        let mut entries = vec![];
        for node in self.scene.all_nodes() {
            if !node.visible { continue; }
            let c = node.render_complexity();
            entries.push(format!(
                r#"{{"id":{},"name":"{}","kind":"{}","complexity":{},"w":{},"h":{}}}"#,
                node.id,
                node.name.replace('"', r#"\""#),
                node.kind_name(),
                c,
                node.width as u32,
                node.height as u32,
            ));
        }
        format!("[{}]", entries.join(","))
    }

    /// Get complexity score for a single node
    pub fn get_node_complexity(&self, id: u64) -> u32 {
        self.scene.get_node(id).map(|n| n.render_complexity()).unwrap_or(0)
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
            list_style: crate::node::ListStyle::default(),
            indent_level: 0,
            text_transform: crate::node::TextTransform::default(),
            text_indent: 0.0,
            opentype_features: crate::node::OpenTypeFeatures::default(),
            font_variation_settings: std::collections::BTreeMap::new(),
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

    // === Table methods ===

    pub fn add_table(&mut self, x: f64, y: f64, rows: u32, cols: u32, cell_w: f64, cell_h: f64) -> u64 {
        let rows = rows.max(1);
        let cols = cols.max(1);
        let col_widths = vec![cell_w; cols as usize];
        let row_heights = vec![cell_h; rows as usize];
        let mut cells = Vec::new();
        for r in 0..rows {
            for c in 0..cols {
                cells.push(crate::node::TableCell::new(r, c));
            }
        }
        let w = cell_w * cols as f64;
        let h = cell_h * rows as f64;
        let mut node = Node::new(0, NodeKind::Table { rows, cols, cells, col_widths, row_heights });
        node.x = x; node.y = y; node.width = w; node.height = h;
        node.name = format!("Table {}", self.scene.node_count() + 1);
        node.fills = vec![crate::node::Fill::solid(crate::types::Color { r: 45, g: 45, b: 45, a: 1.0 })];
        node.strokes = vec![crate::node::Stroke::new(crate::types::Color { r: 100, g: 100, b: 100, a: 1.0 }, 1.0)];
        self.scene.add_node(node)
    }

    pub fn table_set_cell(&mut self, id: u64, row: u32, col: u32, content: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Table { ref mut cells, .. } = node.kind {
                if let Some(cell) = cells.iter_mut().find(|c| c.row == row && c.col == col) {
                    cell.content = content.to_string();
                }
            }
        }
    }

    pub fn table_get_cell(&self, id: u64, row: u32, col: u32) -> String {
        if let Some(node) = self.scene.get_node(id) {
            if let NodeKind::Table { ref cells, .. } = node.kind {
                if let Some(cell) = cells.iter().find(|c| c.row == row && c.col == col) {
                    return serde_json::to_string(cell).unwrap_or_default();
                }
            }
        }
        String::new()
    }

    pub fn table_set_cell_fill(&mut self, id: u64, row: u32, col: u32, r: u8, g: u8, b: u8, a: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Table { ref mut cells, .. } = node.kind {
                if let Some(cell) = cells.iter_mut().find(|c| c.row == row && c.col == col) {
                    cell.fill = Some(crate::types::Color { r, g, b, a });
                }
            }
        }
    }

    pub fn table_merge_cells(&mut self, id: u64, row: u32, col: u32, row_span: u32, col_span: u32) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Table { ref mut cells, rows, cols, .. } = node.kind {
                let rs = row_span.max(1).min(rows - row);
                let cs = col_span.max(1).min(cols - col);
                // Remove cells covered by the merge (except anchor)
                cells.retain(|c| {
                    if c.row == row && c.col == col { return true; }
                    !(c.row >= row && c.row < row + rs && c.col >= col && c.col < col + cs)
                });
                if let Some(cell) = cells.iter_mut().find(|c| c.row == row && c.col == col) {
                    cell.row_span = rs;
                    cell.col_span = cs;
                }
            }
        }
    }

    pub fn table_add_row(&mut self, id: u64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Table { ref mut rows, cols, ref mut cells, ref mut row_heights, .. } = node.kind {
                let new_row = *rows;
                for c in 0..cols {
                    cells.push(crate::node::TableCell::new(new_row, c));
                }
                let h = row_heights.last().copied().unwrap_or(36.0);
                row_heights.push(h);
                *rows += 1;
                node.height += h;
            }
        }
    }

    pub fn table_add_col(&mut self, id: u64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Table { rows, ref mut cols, ref mut cells, ref mut col_widths, .. } = node.kind {
                let new_col = *cols;
                for r in 0..rows {
                    cells.push(crate::node::TableCell::new(r, new_col));
                }
                let w = col_widths.last().copied().unwrap_or(100.0);
                col_widths.push(w);
                *cols += 1;
                node.width += w;
            }
        }
    }

    pub fn table_remove_row(&mut self, id: u64, row: u32) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Table { ref mut rows, ref mut cells, ref mut row_heights, .. } = node.kind {
                if *rows <= 1 { return; }
                let h = row_heights.get(row as usize).copied().unwrap_or(36.0);
                cells.retain(|c| c.row != row);
                for c in cells.iter_mut() { if c.row > row { c.row -= 1; } }
                if (row as usize) < row_heights.len() { row_heights.remove(row as usize); }
                *rows -= 1;
                node.height -= h;
            }
        }
    }

    pub fn table_remove_col(&mut self, id: u64, col: u32) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Table { ref mut cols, ref mut cells, ref mut col_widths, .. } = node.kind {
                if *cols <= 1 { return; }
                let w = col_widths.get(col as usize).copied().unwrap_or(100.0);
                cells.retain(|c| c.col != col);
                for c in cells.iter_mut() { if c.col > col { c.col -= 1; } }
                if (col as usize) < col_widths.len() { col_widths.remove(col as usize); }
                *cols -= 1;
                node.width -= w;
            }
        }
    }

    pub fn table_set_col_width(&mut self, id: u64, col: u32, w: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Table { ref mut col_widths, .. } = node.kind {
                let w = w.max(20.0);
                if (col as usize) < col_widths.len() {
                    let old = col_widths[col as usize];
                    col_widths[col as usize] = w;
                    node.width += w - old;
                }
            }
        }
    }

    pub fn table_set_row_height(&mut self, id: u64, row: u32, h: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Table { ref mut row_heights, .. } = node.kind {
                let h = h.max(16.0);
                if (row as usize) < row_heights.len() {
                    let old = row_heights[row as usize];
                    row_heights[row as usize] = h;
                    node.height += h - old;
                }
            }
        }
    }

    pub fn table_import_csv(&mut self, id: u64, csv_text: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Table { ref mut rows, ref mut cols, ref mut cells, ref mut col_widths, ref mut row_heights } = node.kind {
                let lines: Vec<&str> = csv_text.lines().collect();
                if lines.is_empty() { return; }
                let parsed: Vec<Vec<String>> = lines.iter().map(|line| {
                    line.split(',').map(|s| s.trim().trim_matches('"').to_string()).collect()
                }).collect();
                let new_rows = parsed.len() as u32;
                let new_cols = parsed.iter().map(|r| r.len()).max().unwrap_or(1) as u32;
                let cw = col_widths.first().copied().unwrap_or(100.0);
                let rh = row_heights.first().copied().unwrap_or(36.0);
                *rows = new_rows;
                *cols = new_cols;
                *col_widths = vec![cw; new_cols as usize];
                *row_heights = vec![rh; new_rows as usize];
                cells.clear();
                for (r, row_data) in parsed.iter().enumerate() {
                    for (c, val) in row_data.iter().enumerate() {
                        let mut cell = crate::node::TableCell::new(r as u32, c as u32);
                        cell.content = val.clone();
                        cells.push(cell);
                    }
                    // Fill remaining cols with empty cells
                    for c in row_data.len()..new_cols as usize {
                        cells.push(crate::node::TableCell::new(r as u32, c as u32));
                    }
                }
                node.width = cw * new_cols as f64;
                node.height = rh * new_rows as f64;
            }
        }
    }

    pub fn table_sort(&mut self, id: u64, col: u32, ascending: bool) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Table { rows, cols: _, ref mut cells, .. } = node.kind {
                // Build row data
                let mut row_contents: Vec<(u32, String)> = (0..rows).map(|r| {
                    let val = cells.iter().find(|c| c.row == r && c.col == col)
                        .map(|c| c.content.clone()).unwrap_or_default();
                    (r, val)
                }).collect();
                row_contents.sort_by(|a, b| {
                    let cmp = a.1.cmp(&b.1);
                    if ascending { cmp } else { cmp.reverse() }
                });
                // Remap rows
                let row_map: Vec<u32> = row_contents.iter().map(|(r, _)| *r).collect();
                let old_cells = cells.clone();
                cells.clear();
                for (new_r, &old_r) in row_map.iter().enumerate() {
                    for c in old_cells.iter().filter(|c| c.row == old_r) {
                        let mut nc = c.clone();
                        nc.row = new_r as u32;
                        cells.push(nc);
                    }
                }
            }
        }
    }

    pub fn table_get_info(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            if let NodeKind::Table { rows, cols, ref cells, ref col_widths, ref row_heights } = node.kind {
                let obj = serde_json::json!({
                    "rows": rows,
                    "cols": cols,
                    "col_widths": col_widths,
                    "row_heights": row_heights,
                    "cells": cells,
                });
                return serde_json::to_string(&obj).unwrap_or_default();
            }
        }
        String::new()
    }

    pub fn add_image(&mut self, x: f64, y: f64, w: f64, h: f64, src: &str) -> u64 {
        let mut node = Node::new(0, NodeKind::Image {
            src: src.to_string(),
            fit: "cover".to_string(),
            focal_x: 0.5,
            focal_y: 0.5,
            crop: None,
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
                points.push(PathPoint { x, y, handle_in_x: hix, handle_in_y: hiy, handle_out_x: hox, handle_out_y: hoy, stroke_width: 0.0 });
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
    // Variable-width stroke
    // =============================================

    /// Set per-point stroke width on a path point
    pub fn path_set_point_stroke_width(&mut self, id: u64, index: u32, width: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Path { ref mut points, .. } = node.kind {
                if let Some(pt) = points.get_mut(index as usize) {
                    pt.stroke_width = width.max(0.0);
                }
            }
        }
    }

    /// Get per-point stroke width
    pub fn path_get_point_stroke_width(&self, id: u64, index: u32) -> f64 {
        if let Some(node) = self.scene.get_node(id) {
            if let NodeKind::Path { ref points, .. } = node.kind {
                if let Some(pt) = points.get(index as usize) {
                    return pt.stroke_width;
                }
            }
        }
        0.0
    }

    /// Check if any point has a custom stroke width
    pub fn has_variable_stroke(&self, id: u64) -> bool {
        if let Some(node) = self.scene.get_node(id) {
            if let NodeKind::Path { ref points, .. } = node.kind {
                return points.iter().any(|p| p.stroke_width > 0.0);
            }
        }
        false
    }

    /// Get stroke profile as JSON array of {index, width}
    pub fn path_get_stroke_profile(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            if let NodeKind::Path { ref points, .. } = node.kind {
                let profile: Vec<serde_json::Value> = points.iter().enumerate().map(|(i, p)| {
                    serde_json::json!({"index": i, "width": p.stroke_width})
                }).collect();
                return serde_json::to_string(&profile).unwrap_or_default();
            }
        }
        "[]".to_string()
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

    /// Split a segment at t (0..1), returning JSON {vertex_id, seg_a_id, seg_b_id}
    pub fn vn_split_segment(&mut self, node_id: u64, segment_id: u64, t: f64) -> String {
        if let Some(node) = self.scene.get_node_mut(node_id) {
            if let NodeKind::VectorNetwork(ref mut vn) = node.kind {
                if let Some((vid, sa, sb)) = vn.split_segment(segment_id, t) {
                    vn.detect_regions();
                    recalc_vn_bounds(node);
                    return format!(r#"{{"vertex_id":{},"seg_a_id":{},"seg_b_id":{}}}"#, vid, sa, sb);
                }
            }
        }
        "{}".to_string()
    }

    /// Hit-test segments in a vector network. Returns JSON {segment_id, t} or "{}"
    pub fn vn_hit_test_segment(&self, node_id: u64, scene_x: f64, scene_y: f64, threshold: f64) -> String {
        if let Some(node) = self.scene.get_node(node_id) {
            if let NodeKind::VectorNetwork(ref vn) = node.kind {
                if let Some((seg_id, t)) = vn.hit_test_segment(scene_x, scene_y, threshold) {
                    return format!(r#"{{"segment_id":{},"t":{:.4}}}"#, seg_id, t);
                }
            }
        }
        "{}".to_string()
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

    // --- Image focal point & crop ---

    pub fn set_image_focal_point(&mut self, id: u64, fx: f64, fy: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Image { ref mut focal_x, ref mut focal_y, .. } = node.kind {
                *focal_x = fx.clamp(0.0, 1.0);
                *focal_y = fy.clamp(0.0, 1.0);
            }
        }
    }

    pub fn get_image_focal_point(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            if let NodeKind::Image { focal_x, focal_y, .. } = &node.kind {
                return format!("{{\"x\":{},\"y\":{}}}", focal_x, focal_y);
            }
        }
        "{}".into()
    }

    pub fn set_image_crop(&mut self, id: u64, cx: f64, cy: f64, cw: f64, ch: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Image { ref mut crop, .. } = node.kind {
                *crop = Some(node::ImageCrop {
                    x: cx.clamp(0.0, 1.0),
                    y: cy.clamp(0.0, 1.0),
                    w: cw.clamp(0.01, 1.0),
                    h: ch.clamp(0.01, 1.0),
                });
            }
        }
    }

    pub fn clear_image_crop(&mut self, id: u64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Image { ref mut crop, .. } = node.kind {
                *crop = None;
            }
        }
    }

    pub fn get_image_crop(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            if let NodeKind::Image { ref crop, .. } = node.kind {
                if let Some(c) = crop {
                    return format!("{{\"x\":{},\"y\":{},\"w\":{},\"h\":{}}}", c.x, c.y, c.w, c.h);
                }
            }
        }
        "null".into()
    }

    pub fn get_image_info(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            if let NodeKind::Image { ref src, ref fit, focal_x, focal_y, ref crop } = node.kind {
                let crop_json = if let Some(c) = crop {
                    format!("{{\"x\":{},\"y\":{},\"w\":{},\"h\":{}}}", c.x, c.y, c.w, c.h)
                } else {
                    "null".into()
                };
                return format!(
                    "{{\"src\":\"{}\",\"fit\":\"{}\",\"focal_x\":{},\"focal_y\":{},\"crop\":{}}}",
                    src.replace('\\', "\\\\").replace('"', "\\\""),
                    fit, focal_x, focal_y, crop_json
                );
            }
        }
        "{}".into()
    }

    /// Suggest crop rects based on focal point and common aspect ratios
    pub fn suggest_crops(&self, id: u64, img_w: f64, img_h: f64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            if let NodeKind::Image { focal_x, focal_y, .. } = &node.kind {
                let target_ratio = node.width / node.height.max(1.0);
                let suggestions = compute_crop_suggestions(*focal_x, *focal_y, img_w, img_h, target_ratio);
                return serde_json::to_string(&suggestions).unwrap_or_else(|_| "[]".into());
            }
        }
        "[]".into()
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
    // Sticky Note API
    // =============================================

    /// Create a FigJam-style sticky note
    pub fn add_sticky_note(&mut self, x: f64, y: f64, w: f64, h: f64, content: &str, theme: &str) -> u64 {
        let valid_theme = match theme {
            "yellow" | "green" | "blue" | "pink" | "orange" | "purple" | "gray" => theme.to_string(),
            _ => "yellow".to_string(),
        };
        let mut node = Node::new(0, NodeKind::StickyNote {
            content: content.to_string(),
            font_size: 16.0,
            theme: valid_theme,
            votes: vec![],
        });
        node.x = x; node.y = y;
        node.width = w.max(100.0);
        node.height = h.max(100.0);
        node.name = format!("Sticky {}", self.scene.node_count() + 1);
        node.fills = vec![];
        self.scene.add_node(node)
    }

    pub fn set_sticky_content(&mut self, id: u64, content: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::StickyNote { content: ref mut c, .. } = node.kind {
                *c = content.to_string();
            }
        }
    }

    pub fn set_sticky_theme(&mut self, id: u64, theme: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::StickyNote { theme: ref mut t, .. } = node.kind {
                *t = match theme {
                    "yellow" | "green" | "blue" | "pink" | "orange" | "purple" | "gray" => theme.to_string(),
                    _ => "yellow".to_string(),
                };
            }
        }
    }

    pub fn set_sticky_font_size(&mut self, id: u64, size: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::StickyNote { ref mut font_size, .. } = node.kind {
                *font_size = size.clamp(8.0, 72.0);
            }
        }
    }

    pub fn sticky_add_vote(&mut self, id: u64, user_id: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::StickyNote { ref mut votes, .. } = node.kind {
                if let Some(v) = votes.iter_mut().find(|v| v.user_id == user_id) {
                    v.count += 1;
                } else {
                    votes.push(crate::node::StickyVote { user_id: user_id.to_string(), count: 1 });
                }
            }
        }
    }

    pub fn sticky_remove_vote(&mut self, id: u64, user_id: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::StickyNote { ref mut votes, .. } = node.kind {
                if let Some(v) = votes.iter_mut().find(|v| v.user_id == user_id) {
                    if v.count > 1 { v.count -= 1; } else {
                        votes.retain(|v| v.user_id != user_id);
                    }
                }
            }
        }
    }

    pub fn get_sticky_info(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            if let NodeKind::StickyNote { ref content, font_size, ref theme, ref votes } = node.kind {
                return serde_json::json!({
                    "content": content,
                    "font_size": font_size,
                    "theme": theme,
                    "votes": votes.iter().map(|v| serde_json::json!({"user_id": v.user_id, "count": v.count})).collect::<Vec<_>>(),
                    "total_votes": votes.iter().map(|v| v.count).sum::<u32>(),
                }).to_string();
            }
        }
        "null".to_string()
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
            start_anchor: None,
            end_anchor: None,
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

    /// Get the full dependency graph for the active page as JSON.
    pub fn get_dependency_graph(&self) -> String {
        let edges = self.scene.get_dependency_graph(&self.components);
        let cycles = dep_graph::detect_cycles(&edges);
        serde_json::json!({
            "edges": edges,
            "cycles": cycles,
        }).to_string()
    }

    /// Get dependencies for a specific node as JSON.
    pub fn get_node_dependencies(&self, node_id: u64) -> String {
        let edges = self.scene.get_dependencies_for(node_id, &self.components);
        serde_json::json!(edges).to_string()
    }

    pub fn get_connector_info(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            if let NodeKind::Connector { start_node_id, end_node_id, start_x, start_y, end_x, end_y, ref path_type, end_arrow, start_arrow, ref start_anchor, ref end_anchor } = node.kind {
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
                    "start_anchor": start_anchor.as_ref().map(|a| a.as_str()),
                    "end_anchor": end_anchor.as_ref().map(|a| a.as_str()),
                }).to_string();
            }
        }
        "null".to_string()
    }

    /// Update connector bounds when connected nodes move
    pub fn update_connector_bounds(&mut self, id: u64) {
        let (start_node_id, end_node_id, mut sx, mut sy, mut ex, mut ey, start_anchor, end_anchor) = {
            if let Some(node) = self.scene.get_node(id) {
                if let NodeKind::Connector { start_node_id, end_node_id, start_x, start_y, end_x, end_y, ref start_anchor, ref end_anchor, .. } = node.kind {
                    (start_node_id, end_node_id, start_x, start_y, end_x, end_y, start_anchor.clone(), end_anchor.clone())
                } else { return; }
            } else { return; }
        };

        if start_node_id != 0 {
            if let Some(n) = self.scene.get_node(start_node_id) {
                let anchor = start_anchor.as_ref().unwrap_or(&anchor::AnchorPosition::Center);
                let (ax, ay) = anchor::get_anchor_world_pos(n, anchor);
                sx = ax;
                sy = ay;
            }
        }
        if end_node_id != 0 {
            if let Some(n) = self.scene.get_node(end_node_id) {
                let anchor = end_anchor.as_ref().unwrap_or(&anchor::AnchorPosition::Center);
                let (ax, ay) = anchor::get_anchor_world_pos(n, anchor);
                ex = ax;
                ey = ay;
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

    // =============================================
    // Anchor Points API
    // =============================================

    /// Get all anchor points for a node as JSON: [{position, world_x, world_y}]
    pub fn get_node_anchors(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            let standard = [
                anchor::AnchorPosition::Top,
                anchor::AnchorPosition::Right,
                anchor::AnchorPosition::Bottom,
                anchor::AnchorPosition::Left,
            ];
            let mut anchors: Vec<serde_json::Value> = standard.iter().map(|ap| {
                let (wx, wy) = anchor::get_anchor_world_pos(node, ap);
                serde_json::json!({"position": ap.as_str(), "world_x": wx, "world_y": wy})
            }).collect();
            for ap in &node.anchors {
                let (wx, wy) = anchor::get_anchor_world_pos(node, &ap.position);
                let pos_str = match &ap.position {
                    anchor::AnchorPosition::Custom(rx, ry) => format!("custom:{:.3},{:.3}", rx, ry),
                    other => other.as_str().to_string(),
                };
                anchors.push(serde_json::json!({"position": pos_str, "world_x": wx, "world_y": wy, "custom": true}));
            }
            return serde_json::to_string(&anchors).unwrap_or_else(|_| "[]".into());
        }
        "[]".to_string()
    }

    /// Add a custom anchor point to a node (rx, ry are 0..1 normalized)
    pub fn add_custom_anchor(&mut self, id: u64, rx: f64, ry: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.anchors.push(anchor::AnchorPoint::new(
                anchor::AnchorPosition::Custom(rx.clamp(0.0, 1.0), ry.clamp(0.0, 1.0))
            ));
        }
    }

    /// Remove a custom anchor by index
    pub fn remove_custom_anchor(&mut self, id: u64, index: u32) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if (index as usize) < node.anchors.len() {
                node.anchors.remove(index as usize);
            }
        }
    }

    /// Snap a scene position to the nearest anchor. Returns JSON or "null".
    /// threshold is in scene units.
    pub fn snap_to_anchor(&self, x: f64, y: f64, threshold: f64, exclude_node_id: u64) -> String {
        let nodes: Vec<&Node> = self.scene.all_nodes().collect();
        let exclude = if exclude_node_id == 0 { None } else { Some(exclude_node_id) };
        if let Some((node_id, pos, wx, wy)) = anchor::snap_to_nearest_anchor(&nodes, x, y, threshold, exclude) {
            serde_json::json!({
                "node_id": node_id,
                "anchor": pos.as_str(),
                "world_x": wx,
                "world_y": wy,
            }).to_string()
        } else {
            "null".to_string()
        }
    }

    /// Connect a connector's start/end to a specific node anchor
    pub fn connect_to_anchor(&mut self, connector_id: u64, is_start: bool, target_node_id: u64, anchor_str: &str) {
        let anchor_pos = anchor::AnchorPosition::from_str(anchor_str);
        if let Some(node) = self.scene.get_node_mut(connector_id) {
            if let NodeKind::Connector {
                ref mut start_node_id, ref mut end_node_id,
                ref mut start_anchor, ref mut end_anchor, ..
            } = node.kind {
                if is_start {
                    *start_node_id = target_node_id;
                    *start_anchor = Some(anchor_pos);
                } else {
                    *end_node_id = target_node_id;
                    *end_anchor = Some(anchor_pos);
                }
            }
        }
        self.update_connector_bounds(connector_id);
    }

    /// Disconnect a connector endpoint from its anchor
    pub fn disconnect_anchor(&mut self, connector_id: u64, is_start: bool) {
        if let Some(node) = self.scene.get_node_mut(connector_id) {
            if let NodeKind::Connector {
                ref mut start_node_id, ref mut end_node_id,
                ref mut start_anchor, ref mut end_anchor, ..
            } = node.kind {
                if is_start {
                    *start_node_id = 0;
                    *start_anchor = None;
                } else {
                    *end_node_id = 0;
                    *end_anchor = None;
                }
            }
        }
    }

    // --- Callout ---

    pub fn add_callout(&mut self, x: f64, y: f64, w: f64, h: f64, content: &str, tail_x: f64, tail_y: f64) -> u64 {
        let mut node = Node::new(0, NodeKind::Callout {
            content: content.to_string(),
            font_size: 14.0,
            tail_x,
            tail_y,
            tail_width: 20.0,
            theme: "blue".to_string(),
        });
        node.x = x;
        node.y = y;
        node.width = w;
        node.height = h;
        node.corner_radius = 8.0;
        node.name = format!("Callout {}", self.scene.node_count() + 1);
        node.fills = vec![];  // Use theme colors by default
        self.scene.add_node(node)
    }

    pub fn set_callout_content(&mut self, id: u64, content: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Callout { content: ref mut c, .. } = node.kind {
                *c = content.to_string();
            }
        }
    }

    pub fn set_callout_tail(&mut self, id: u64, tail_x: f64, tail_y: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Callout { tail_x: ref mut tx, tail_y: ref mut ty, .. } = node.kind {
                *tx = tail_x;
                *ty = tail_y;
            }
        }
    }

    pub fn set_callout_tail_width(&mut self, id: u64, width: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Callout { tail_width: ref mut tw, .. } = node.kind {
                *tw = width;
            }
        }
    }

    pub fn set_callout_theme(&mut self, id: u64, theme: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Callout { theme: ref mut t, .. } = node.kind {
                *t = theme.to_string();
            }
        }
    }

    pub fn set_callout_font_size(&mut self, id: u64, size: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Callout { font_size: ref mut fs, .. } = node.kind {
                *fs = size;
            }
        }
    }

    pub fn get_callout_info(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            if let NodeKind::Callout { ref content, font_size, tail_x, tail_y, tail_width, ref theme } = node.kind {
                return serde_json::json!({
                    "content": content,
                    "font_size": font_size,
                    "tail_x": tail_x,
                    "tail_y": tail_y,
                    "tail_width": tail_width,
                    "theme": theme,
                }).to_string();
            }
        }
        "null".to_string()
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
                    FillType::Pattern { src, scale, rotation, pattern_type, tile_width, tile_height } => {
                        serde_json::json!({
                            "type": "Pattern",
                            "src": src,
                            "scale": scale,
                            "rotation": rotation,
                            "pattern_type": format!("{:?}", pattern_type),
                            "tile_width": tile_width,
                            "tile_height": tile_height,
                        }).to_string()
                    }
                    FillType::NoiseFill { scale, color1, color2, intensity, seed } => {
                        serde_json::json!({
                            "type": "NoiseFill",
                            "scale": scale,
                            "color1": { "r": color1.r, "g": color1.g, "b": color1.b, "a": color1.a },
                            "color2": { "r": color2.r, "g": color2.g, "b": color2.b, "a": color2.a },
                            "intensity": intensity,
                            "seed": seed,
                        }).to_string()
                    }
                    FillType::DotPattern { dot_radius, spacing, color, bg_color, angle } => {
                        serde_json::json!({
                            "type": "DotPattern",
                            "dot_radius": dot_radius,
                            "spacing": spacing,
                            "color": { "r": color.r, "g": color.g, "b": color.b, "a": color.a },
                            "bg_color": { "r": bg_color.r, "g": bg_color.g, "b": bg_color.b, "a": bg_color.a },
                            "angle": angle,
                        }).to_string()
                    }
                    FillType::CrosshatchFill { spacing, line_width, color, bg_color, angle, density } => {
                        serde_json::json!({
                            "type": "CrosshatchFill",
                            "spacing": spacing,
                            "line_width": line_width,
                            "color": { "r": color.r, "g": color.g, "b": color.b, "a": color.a },
                            "bg_color": { "r": bg_color.r, "g": bg_color.g, "b": bg_color.b, "a": bg_color.a },
                            "angle": angle,
                            "density": density,
                        }).to_string()
                    }
                    FillType::GradientMesh { ref mesh } => {
                        serde_json::json!({
                            "type": "GradientMesh",
                            "rows": mesh.rows,
                            "cols": mesh.cols,
                            "points": mesh.points.iter().enumerate().map(|(i, p)| serde_json::json!({
                                "index": i,
                                "x": p.x, "y": p.y,
                                "r": p.color.r, "g": p.color.g, "b": p.color.b, "a": p.color.a
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
                    FillType::Pattern { src, scale, rotation, pattern_type, tile_width, tile_height } => {
                        serde_json::json!({
                            "index": i,
                            "type": "Pattern",
                            "visible": fill.visible,
                            "src": src,
                            "scale": scale,
                            "rotation": rotation,
                            "pattern_type": format!("{:?}", pattern_type),
                            "tile_width": tile_width,
                            "tile_height": tile_height,
                        })
                    }
                    FillType::NoiseFill { scale, color1, color2, intensity, seed } => {
                        serde_json::json!({
                            "index": i,
                            "type": "NoiseFill",
                            "visible": fill.visible,
                            "scale": scale,
                            "color1": { "r": color1.r, "g": color1.g, "b": color1.b, "a": color1.a },
                            "color2": { "r": color2.r, "g": color2.g, "b": color2.b, "a": color2.a },
                            "intensity": intensity,
                            "seed": seed,
                        })
                    }
                    FillType::DotPattern { dot_radius, spacing, color, bg_color, angle } => {
                        serde_json::json!({
                            "index": i,
                            "type": "DotPattern",
                            "visible": fill.visible,
                            "dot_radius": dot_radius,
                            "spacing": spacing,
                            "color": { "r": color.r, "g": color.g, "b": color.b, "a": color.a },
                            "bg_color": { "r": bg_color.r, "g": bg_color.g, "b": bg_color.b, "a": bg_color.a },
                            "angle": angle,
                        })
                    }
                    FillType::CrosshatchFill { spacing, line_width, color, bg_color, angle, density } => {
                        serde_json::json!({
                            "index": i,
                            "type": "CrosshatchFill",
                            "visible": fill.visible,
                            "spacing": spacing,
                            "line_width": line_width,
                            "color": { "r": color.r, "g": color.g, "b": color.b, "a": color.a },
                            "bg_color": { "r": bg_color.r, "g": bg_color.g, "b": bg_color.b, "a": bg_color.a },
                            "angle": angle,
                            "density": density,
                        })
                    }
                    FillType::GradientMesh { ref mesh } => {
                        serde_json::json!({
                            "index": i,
                            "type": "GradientMesh",
                            "visible": fill.visible,
                            "rows": mesh.rows,
                            "cols": mesh.cols,
                            "points": mesh.points.iter().enumerate().map(|(pi, p)| serde_json::json!({
                                "index": pi,
                                "x": p.x, "y": p.y,
                                "r": p.color.r, "g": p.color.g, "b": p.color.b, "a": p.color.a
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

    /// Set fill at index to pattern.
    pub fn set_fill_pattern_at(&mut self, id: u64, index: u32, src: &str, scale: f64, rotation: f64, pattern_type: &str, tile_width: f64, tile_height: f64) {
        let pt = match pattern_type {
            "Brick" => crate::node::PatternType::Brick,
            "Hex" => crate::node::PatternType::Hex,
            _ => crate::node::PatternType::Tile,
        };
        if let Some(node) = self.scene.get_node_mut(id) {
            let idx = index as usize;
            if idx < node.fills.len() {
                node.fills[idx] = Fill {
                    fill_type: FillType::Pattern {
                        src: src.to_string(),
                        scale: scale.max(0.1).min(10.0),
                        rotation,
                        pattern_type: pt,
                        tile_width: tile_width.max(0.0),
                        tile_height: tile_height.max(0.0),
                    },
                    visible: node.fills[idx].visible,
                };
            }
        }
    }

    /// Set fill at index to noise fill.
    pub fn set_fill_noise_at(&mut self, id: u64, index: u32, scale: f64, c1r: u8, c1g: u8, c1b: u8, c1a: f64, c2r: u8, c2g: u8, c2b: u8, c2a: f64, intensity: f64, seed: u32) {
        if let Some(node) = self.scene.get_node_mut(id) {
            let idx = index as usize;
            if idx < node.fills.len() {
                node.fills[idx] = Fill {
                    fill_type: FillType::NoiseFill {
                        scale: scale.max(2.0),
                        color1: Color { r: c1r, g: c1g, b: c1b, a: c1a },
                        color2: Color { r: c2r, g: c2g, b: c2b, a: c2a },
                        intensity: intensity.max(0.0).min(1.0),
                        seed,
                    },
                    visible: node.fills[idx].visible,
                };
            }
        }
    }

    /// Set fill at index to dot pattern.
    pub fn set_fill_dot_pattern_at(&mut self, id: u64, index: u32, dot_radius: f64, spacing: f64, cr: u8, cg: u8, cb: u8, ca: f64, bgr: u8, bgg: u8, bgb: u8, bga: f64, angle: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            let idx = index as usize;
            if idx < node.fills.len() {
                node.fills[idx] = Fill {
                    fill_type: FillType::DotPattern {
                        dot_radius: dot_radius.max(0.5),
                        spacing: spacing.max(2.0),
                        color: Color { r: cr, g: cg, b: cb, a: ca },
                        bg_color: Color { r: bgr, g: bgg, b: bgb, a: bga },
                        angle,
                    },
                    visible: node.fills[idx].visible,
                };
            }
        }
    }

    /// Set fill at index to crosshatch fill.
    pub fn set_fill_crosshatch_at(&mut self, id: u64, index: u32, spacing: f64, line_width: f64, cr: u8, cg: u8, cb: u8, ca: f64, bgr: u8, bgg: u8, bgb: u8, bga: f64, angle: f64, density: u8) {
        if let Some(node) = self.scene.get_node_mut(id) {
            let idx = index as usize;
            if idx < node.fills.len() {
                node.fills[idx] = Fill {
                    fill_type: FillType::CrosshatchFill {
                        spacing: spacing.max(2.0),
                        line_width: line_width.max(0.5),
                        color: Color { r: cr, g: cg, b: cb, a: ca },
                        bg_color: Color { r: bgr, g: bgg, b: bgb, a: bga },
                        angle,
                        density: density.max(1).min(2),
                    },
                    visible: node.fills[idx].visible,
                };
            }
        }
    }

    /// Set fill at index to gradient mesh. points_json: [{"x":0,"y":0,"r":255,"g":0,"b":0,"a":1}, ...]
    pub fn set_fill_gradient_mesh_at(&mut self, id: u64, index: u32, rows: u32, cols: u32, points_json: &str) {
        let pts: Vec<serde_json::Value> = serde_json::from_str(points_json).unwrap_or_default();
        let mesh_points: Vec<crate::node::MeshPoint> = pts.iter().map(|p| crate::node::MeshPoint {
            x: p["x"].as_f64().unwrap_or(0.0),
            y: p["y"].as_f64().unwrap_or(0.0),
            color: Color {
                r: p["r"].as_u64().unwrap_or(200) as u8,
                g: p["g"].as_u64().unwrap_or(200) as u8,
                b: p["b"].as_u64().unwrap_or(200) as u8,
                a: p["a"].as_f64().unwrap_or(1.0),
            },
        }).collect();
        if let Some(node) = self.scene.get_node_mut(id) {
            let idx = index as usize;
            if idx < node.fills.len() {
                node.fills[idx] = Fill {
                    fill_type: FillType::GradientMesh {
                        mesh: crate::node::MeshGradient {
                            rows: rows.max(2),
                            cols: cols.max(2),
                            points: mesh_points,
                        },
                    },
                    visible: node.fills[idx].visible,
                };
            }
        }
    }

    /// Set a gradient mesh with default 2x2 grid
    pub fn set_fill_gradient_mesh_default_at(&mut self, id: u64, index: u32) {
        if let Some(node) = self.scene.get_node_mut(id) {
            let idx = index as usize;
            if idx < node.fills.len() {
                node.fills[idx] = Fill {
                    fill_type: FillType::GradientMesh {
                        mesh: crate::node::MeshGradient::new_default(),
                    },
                    visible: node.fills[idx].visible,
                };
            }
        }
    }

    /// Set mesh point color by index
    pub fn mesh_set_point_color(&mut self, id: u64, fill_index: u32, point_index: u32, r: u8, g: u8, b: u8, a: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            let fi = fill_index as usize;
            if fi < node.fills.len() {
                if let FillType::GradientMesh { ref mut mesh } = node.fills[fi].fill_type {
                    if let Some(pt) = mesh.points.get_mut(point_index as usize) {
                        pt.color = Color { r, g, b, a };
                    }
                }
            }
        }
    }

    /// Set mesh point position by index
    pub fn mesh_set_point_position(&mut self, id: u64, fill_index: u32, point_index: u32, x: f64, y: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            let fi = fill_index as usize;
            if fi < node.fills.len() {
                if let FillType::GradientMesh { ref mut mesh } = node.fills[fi].fill_type {
                    if let Some(pt) = mesh.points.get_mut(point_index as usize) {
                        pt.x = x.clamp(0.0, 1.0);
                        pt.y = y.clamp(0.0, 1.0);
                    }
                }
            }
        }
    }

    /// Add a row to a mesh gradient
    pub fn mesh_add_row(&mut self, id: u64, fill_index: u32) {
        if let Some(node) = self.scene.get_node_mut(id) {
            let fi = fill_index as usize;
            if fi < node.fills.len() {
                if let FillType::GradientMesh { ref mut mesh } = node.fills[fi].fill_type {
                    mesh.add_row();
                }
            }
        }
    }

    /// Add a column to a mesh gradient
    pub fn mesh_add_col(&mut self, id: u64, fill_index: u32) {
        if let Some(node) = self.scene.get_node_mut(id) {
            let fi = fill_index as usize;
            if fi < node.fills.len() {
                if let FillType::GradientMesh { ref mut mesh } = node.fills[fi].fill_type {
                    mesh.add_col();
                }
            }
        }
    }

    /// Remove a row from a mesh gradient
    pub fn mesh_remove_row(&mut self, id: u64, fill_index: u32) {
        if let Some(node) = self.scene.get_node_mut(id) {
            let fi = fill_index as usize;
            if fi < node.fills.len() {
                if let FillType::GradientMesh { ref mut mesh } = node.fills[fi].fill_type {
                    mesh.remove_row();
                }
            }
        }
    }

    /// Remove a column from a mesh gradient
    pub fn mesh_remove_col(&mut self, id: u64, fill_index: u32) {
        if let Some(node) = self.scene.get_node_mut(id) {
            let fi = fill_index as usize;
            if fi < node.fills.len() {
                if let FillType::GradientMesh { ref mut mesh } = node.fills[fi].fill_type {
                    mesh.remove_col();
                }
            }
        }
    }

    /// Get mesh gradient info as JSON
    pub fn mesh_get_info(&self, id: u64, fill_index: u32) -> String {
        if let Some(node) = self.scene.get_node(id) {
            let fi = fill_index as usize;
            if fi < node.fills.len() {
                if let FillType::GradientMesh { ref mesh } = node.fills[fi].fill_type {
                    return serde_json::json!({
                        "rows": mesh.rows,
                        "cols": mesh.cols,
                        "points": mesh.points.iter().enumerate().map(|(i, p)| serde_json::json!({
                            "index": i,
                            "x": p.x, "y": p.y,
                            "r": p.color.r, "g": p.color.g, "b": p.color.b, "a": p.color.a
                        })).collect::<Vec<_>>()
                    }).to_string();
                }
            }
        }
        "null".to_string()
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
        let sides = stroke.individual_sides.as_ref().map(|s| {
            serde_json::json!({ "top": s.top, "right": s.right, "bottom": s.bottom, "left": s.left })
        });
        serde_json::json!({
            "color": { "r": stroke.color.r, "g": stroke.color.g, "b": stroke.color.b, "a": stroke.color.a },
            "width": stroke.width,
            "dash_array": stroke.dash_array,
            "dash_offset": stroke.dash_offset,
            "line_cap": cap,
            "line_join": join,
            "align": align,
            "visible": stroke.visible,
            "individual_sides": sides,
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

    /// Set individual stroke sides at index. Pass JSON: {"top":true,"right":true,"bottom":false,"left":false}
    /// Pass "null" or empty string to clear (stroke all sides).
    pub fn set_stroke_sides_at(&mut self, id: u64, index: u32, sides_json: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            let idx = index as usize;
            if idx < node.strokes.len() {
                if sides_json.is_empty() || sides_json == "null" {
                    node.strokes[idx].individual_sides = None;
                } else if let Ok(v) = serde_json::from_str::<serde_json::Value>(sides_json) {
                    let sides = crate::node::StrokeSides {
                        top: v["top"].as_bool().unwrap_or(true),
                        right: v["right"].as_bool().unwrap_or(true),
                        bottom: v["bottom"].as_bool().unwrap_or(true),
                        left: v["left"].as_bool().unwrap_or(true),
                    };
                    if sides.is_all() {
                        node.strokes[idx].individual_sides = None;
                    } else {
                        node.strokes[idx].individual_sides = Some(sides);
                    }
                }
            }
        }
    }

    /// Set individual stroke sides on the primary stroke (index 0).
    pub fn set_stroke_sides(&mut self, id: u64, sides_json: &str) {
        self.set_stroke_sides_at(id, 0, sides_json);
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

    /// Batch find/replace in selected node names.
    /// use_regex: if true, `find` is treated as a regex pattern.
    pub fn batch_find_replace_selection(&mut self, find: &str, replace: &str, use_regex: bool) -> u32 {
        let ids = self.scene.selection.clone();
        if ids.is_empty() { return 0; }
        self.push_undo();
        self.scene.batch_find_replace(&ids, find, replace, use_regex)
    }

    /// Preview batch rename (returns JSON array of {id, oldName, newName}).
    pub fn batch_rename_preview(&self, pattern: &str, start_num: u32) -> String {
        let ids = &self.scene.selection;
        let pad_width = if ids.is_empty() { 1 } else { ((ids.len() as f64).log10().floor() as usize) + 1 };
        let mut results = Vec::new();
        for (i, &id) in ids.iter().enumerate() {
            let num = start_num as usize + i;
            if let Some(node) = self.scene.get_node(id) {
                let original = &node.name;
                let new_name = pattern
                    .replace("{name}", original)
                    .replace("{N}", &format!("{:0>width$}", num, width = pad_width))
                    .replace("{n}", &num.to_string());
                results.push(serde_json::json!({"id": id, "oldName": original, "newName": new_name}));
            }
        }
        serde_json::to_string(&results).unwrap_or_else(|_| "[]".to_string())
    }

    /// Preview batch find/replace (returns JSON array of {id, oldName, newName}).
    pub fn batch_find_replace_preview(&self, find: &str, replace: &str, use_regex: bool) -> String {
        let ids = &self.scene.selection;
        let mut results = Vec::new();
        if find.is_empty() { return "[]".to_string(); }
        for &id in ids {
            if let Some(node) = self.scene.get_node(id) {
                let old = &node.name;
                let new_name = if use_regex {
                    match regex::Regex::new(find) {
                        Ok(re) => re.replace_all(old, replace).to_string(),
                        Err(_) => continue,
                    }
                } else {
                    old.replace(find, replace)
                };
                if new_name != *old {
                    results.push(serde_json::json!({"id": id, "oldName": old, "newName": new_name}));
                }
            }
        }
        serde_json::to_string(&results).unwrap_or_else(|_| "[]".to_string())
    }

    /// Enhanced batch rename preview with mode support. mode: "prefix" | "find_replace" | "regex"
    pub fn batch_rename_preview_ex(&self, mode: &str, pattern: &str, find: &str, replace_with: &str, start_num: u32, case_sensitive: bool) -> String {
        let ids = self.scene.selection.clone();
        self.scene.batch_rename_preview(&ids, mode, pattern, find, replace_with, start_num, case_sensitive)
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
        easing: &str,
    ) -> i32 {
        let trig = match trigger {
            "hover" => InteractionTrigger::OnHover,
            "press" => InteractionTrigger::OnPress,
            "drag" => InteractionTrigger::OnDrag,
            "swipe-left" => InteractionTrigger::OnSwipeLeft,
            "swipe-right" => InteractionTrigger::OnSwipeRight,
            "swipe-up" => InteractionTrigger::OnSwipeUp,
            "swipe-down" => InteractionTrigger::OnSwipeDown,
            "long-press" => InteractionTrigger::OnLongPress,
            "pinch-in" => InteractionTrigger::OnPinchIn,
            "pinch-out" => InteractionTrigger::OnPinchOut,
            _ => InteractionTrigger::OnClick,
        };
        let act = match action {
            "back" => InteractionAction::Back,
            "scroll-to" => InteractionAction::ScrollTo,
            "open-overlay" => InteractionAction::OpenOverlay,
            "close-overlay" => InteractionAction::CloseOverlay,
            "swap-variant" => InteractionAction::SwapVariant,
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
            let easing_str = if easing.is_empty() { "ease_in_out" } else { easing };
            let interaction = Interaction {
                trigger: trig,
                action: act,
                target_node_id,
                target_page_id,
                transition: trans,
                transition_duration_ms,
                easing: easing_str.to_string(),
                variant_key_json: String::new(),
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

    /// Set the variant_key_json on an existing interaction (for SwapVariant action)
    pub fn set_interaction_easing(&mut self, id: u64, index: u32, easing: &str) -> bool {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let Some(inter) = node.interactions.get_mut(index as usize) {
                inter.easing = easing.to_string();
                return true;
            }
        }
        false
    }

    pub fn set_interaction_variant_key(&mut self, id: u64, index: u32, variant_key_json: &str) -> bool {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let Some(inter) = node.interactions.get_mut(index as usize) {
                inter.variant_key_json = variant_key_json.to_string();
                return true;
            }
        }
        false
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

    // ── Node Links / References ──────────────────────────────

    /// Add a link from node `id` to `target_id`. Returns index or -1.
    pub fn add_node_link(&mut self, id: u64, target_id: u64, link_type: &str, label: &str) -> i32 {
        if id == target_id { return -1; }
        if self.scene.get_node(target_id).is_none() { return -1; }
        if let Some(node) = self.scene.get_node_mut(id) {
            node.links.push(crate::node::NodeLink {
                target_id,
                link_type: crate::node::LinkType::from_str(link_type),
                label: label.to_string(),
            });
            (node.links.len() - 1) as i32
        } else {
            -1
        }
    }

    /// Remove a link by index from a node. Returns true on success.
    pub fn remove_node_link(&mut self, id: u64, index: u32) -> bool {
        if let Some(node) = self.scene.get_node_mut(id) {
            let idx = index as usize;
            if idx < node.links.len() {
                node.links.remove(idx);
                return true;
            }
        }
        false
    }

    /// Clear all links on a node.
    pub fn clear_node_links(&mut self, id: u64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.links.clear();
        }
    }

    /// Get outgoing links of a node as JSON array.
    pub fn get_node_links(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            let links: Vec<serde_json::Value> = node.links.iter().map(|l| {
                let target_name = self.scene.get_node(l.target_id)
                    .map(|n| n.name.clone())
                    .unwrap_or_else(|| format!("#{}", l.target_id));
                serde_json::json!({
                    "target_id": l.target_id,
                    "target_name": target_name,
                    "link_type": l.link_type.as_str(),
                    "label": l.label,
                })
            }).collect();
            serde_json::to_string(&links).unwrap_or_else(|_| "[]".to_string())
        } else {
            "[]".to_string()
        }
    }

    /// Get incoming links (all nodes that link TO this node) as JSON array.
    pub fn get_incoming_links(&self, id: u64) -> String {
        let mut result: Vec<serde_json::Value> = vec![];
        for node in self.scene.all_nodes() {
            for (i, link) in node.links.iter().enumerate() {
                if link.target_id == id {
                    result.push(serde_json::json!({
                        "source_id": node.id,
                        "source_name": node.name,
                        "link_type": link.link_type.as_str(),
                        "label": link.label,
                        "index": i,
                    }));
                }
            }
        }
        serde_json::to_string(&result).unwrap_or_else(|_| "[]".to_string())
    }

    /// Get all links in the scene for canvas rendering.
    pub fn get_all_links(&self) -> String {
        let mut result: Vec<serde_json::Value> = vec![];
        for node in self.scene.all_nodes() {
            for link in &node.links {
                if let Some(target) = self.scene.get_node(link.target_id) {
                    result.push(serde_json::json!({
                        "source_id": node.id,
                        "source_x": node.x,
                        "source_y": node.y,
                        "source_w": node.width,
                        "source_h": node.height,
                        "target_id": target.id,
                        "target_x": target.x,
                        "target_y": target.y,
                        "target_w": target.width,
                        "target_h": target.height,
                        "link_type": link.link_type.as_str(),
                        "label": link.label,
                    }));
                }
            }
        }
        serde_json::to_string(&result).unwrap_or_else(|_| "[]".to_string())
    }

    // ── Auto-Animate (Smart Animate) ────────────────────────────

    /// Compute auto-animate matched node pairs between two frames.
    /// Returns JSON with { pairs, removed, added } for smart animate transitions.
    pub fn compute_auto_animate(&self, from_frame_id: u64, to_frame_id: u64) -> String {
        let result = self.scene.compute_auto_animate(from_frame_id, to_frame_id);
        serde_json::to_string(&result).unwrap_or_else(|_| r#"{"pairs":[],"removed":[],"added":[]}"#.to_string())
    }

    /// Compute auto-animate pairs between two pages (matched by node name across pages).
    pub fn compute_auto_animate_pages(&self, from_page_id: u64, to_page_id: u64) -> String {
        let result = self.scene.compute_auto_animate_pages(from_page_id, to_page_id);
        serde_json::to_string(&result).unwrap_or_else(|_| r#"{"pairs":[],"removed":[],"added":[]}"#.to_string())
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

    /// Select all nodes with the same name as the given node. Returns selected IDs.
    pub fn select_same_name(&mut self, reference_id: u64) -> Vec<u64> {
        self.scene.select_same_name(reference_id)
    }

    /// Select all nodes with the same name AND kind as the given node. Returns selected IDs.
    pub fn select_same_name_and_kind(&mut self, reference_id: u64) -> Vec<u64> {
        self.scene.select_same_name_and_kind(reference_id)
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

    /// Returns the kind name of a node (e.g. "Rect", "Text", "Frame").
    pub fn get_node_kind(&self, id: u64) -> Option<String> {
        self.scene.get_node(id).map(|n| n.kind_name().to_string())
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

    // === Recording / Replay ===

    /// Start recording canvas history. Clears previous recording.
    pub fn recording_start(&mut self, now_ms: u64) {
        self.recording.start(now_ms);
        // Capture initial frame
        let snapshot = self.export_scene();
        self.recording.add_frame(now_ms, snapshot);
    }

    /// Stop recording.
    pub fn recording_stop(&mut self) {
        self.recording.stop();
    }

    /// Capture a frame during recording. Call periodically (e.g. on scene change).
    pub fn recording_capture(&mut self, now_ms: u64) -> bool {
        if !self.recording.is_recording {
            return false;
        }
        let snapshot = self.export_scene();
        self.recording.add_frame(now_ms, snapshot)
    }

    /// Is currently recording?
    pub fn recording_is_active(&self) -> bool {
        self.recording.is_recording
    }

    /// Get recording frame count.
    pub fn recording_frame_count(&self) -> u32 {
        self.recording.frame_count() as u32
    }

    /// Get recording duration in ms.
    pub fn recording_duration_ms(&self) -> u64 {
        self.recording.duration_ms()
    }

    /// Seek to a specific time in the recording. Restores the scene snapshot.
    /// Returns true if a snapshot was found and applied.
    pub fn recording_seek(&mut self, time_ms: u64) -> bool {
        if let Some(snapshot) = self.recording.snapshot_at(time_ms) {
            let snapshot = snapshot.to_string();
            match serde_json::from_str::<crate::scene::SceneData>(&snapshot) {
                Ok(data) => {
                    self.scene = crate::scene::Scene::import(data);
                    true
                }
                Err(_) => false,
            }
        } else {
            false
        }
    }

    /// Clear recording data.
    pub fn recording_clear(&mut self) {
        self.recording.clear();
    }

    /// Has any recording data?
    pub fn recording_has_data(&self) -> bool {
        self.recording.frame_count() > 0
    }

    /// Set max frames limit (default 600).
    pub fn recording_set_max_frames(&mut self, max: u32) {
        self.recording.max_frames = max as usize;
    }

    /// Export recording as JSON string.
    pub fn recording_export_json(&self) -> String {
        self.recording.export_json()
    }

    /// Import recording from JSON string. Returns true on success.
    pub fn recording_import_json(&mut self, json: &str) -> bool {
        match serde_json::from_str::<Vec<crate::recording::RecordEntry>>(json) {
            Ok(entries) => {
                self.recording.entries = entries;
                self.recording.is_recording = false;
                true
            }
            Err(_) => false,
        }
    }

    /// Get a specific recording frame's snapshot by index.
    pub fn recording_get_frame(&self, index: u32) -> String {
        self.recording.entries.get(index as usize)
            .map(|e| e.snapshot.clone())
            .unwrap_or_default()
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
            responsive_rules: vec![],
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

    /// Add a responsive variant rule to an instance
    pub fn add_responsive_variant_rule(&mut self, instance_id: u64, label: &str, max_width: f64, variant_key_json: &str) -> bool {
        let key: Result<VariantKey, _> = serde_json::from_str(variant_key_json);
        let key = match key {
            Ok(k) => k,
            Err(_) => return false,
        };
        if let Some(node) = self.scene.get_node_mut(instance_id) {
            if let NodeKind::Instance(data) = &mut node.kind {
                data.responsive_rules.push(component::ResponsiveVariantRule {
                    label: label.to_string(),
                    max_width,
                    variant_key: key,
                });
                // Sort by max_width ascending so matching logic works correctly
                data.responsive_rules.sort_by(|a, b| a.max_width.partial_cmp(&b.max_width).unwrap_or(std::cmp::Ordering::Equal));
                return true;
            }
        }
        false
    }

    /// Remove a responsive variant rule by index
    pub fn remove_responsive_variant_rule(&mut self, instance_id: u64, index: u32) -> bool {
        if let Some(node) = self.scene.get_node_mut(instance_id) {
            if let NodeKind::Instance(data) = &mut node.kind {
                let idx = index as usize;
                if idx < data.responsive_rules.len() {
                    data.responsive_rules.remove(idx);
                    return true;
                }
            }
        }
        false
    }

    /// Get responsive variant rules as JSON
    pub fn get_responsive_variant_rules(&self, instance_id: u64) -> String {
        if let Some(node) = self.scene.get_node(instance_id) {
            if let NodeKind::Instance(data) = &node.kind {
                return serde_json::to_string(&data.responsive_rules).unwrap_or_else(|_| "[]".to_string());
            }
        }
        "[]".to_string()
    }

    /// Clear all responsive variant rules from an instance
    pub fn clear_responsive_variant_rules(&mut self, instance_id: u64) -> bool {
        if let Some(node) = self.scene.get_node_mut(instance_id) {
            if let NodeKind::Instance(data) = &mut node.kind {
                data.responsive_rules.clear();
                return true;
            }
        }
        false
    }

    /// Apply responsive variant rules for all instance children of a frame.
    /// Returns the number of instances that were switched.
    pub fn apply_responsive_variants(&mut self, frame_id: u64) -> u32 {
        let frame_width = if let Some(node) = self.scene.get_node(frame_id) {
            node.width
        } else {
            return 0;
        };

        let children: Vec<u64> = if let Some(node) = self.scene.get_node(frame_id) {
            node.children.clone()
        } else {
            return 0;
        };

        let mut switched = 0u32;
        for child_id in children {
            // Check if child is an instance with responsive rules
            let target_key = if let Some(node) = self.scene.get_node(child_id) {
                if let NodeKind::Instance(data) = &node.kind {
                    if data.responsive_rules.is_empty() {
                        continue;
                    }
                    // Find matching rule: rules sorted by max_width ascending,
                    // pick the largest max_width that is >= frame_width (most specific match)
                    // Actually: pick the smallest max_width that is >= frame_width
                    // i.e. mobile-first: if frame_width <= 375, match "Mobile" (375),
                    // if frame_width <= 768, match "Tablet" (768), etc.
                    let mut matched: Option<&VariantKey> = None;
                    for rule in &data.responsive_rules {
                        if frame_width <= rule.max_width {
                            matched = Some(&rule.variant_key);
                            break; // first match (smallest max_width that fits)
                        }
                    }
                    if let Some(key) = matched {
                        if *key != data.variant_values {
                            Some(serde_json::to_string(key).unwrap_or_default())
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            };

            if let Some(key_json) = target_key {
                if self.set_instance_variant(child_id, &key_json) {
                    switched += 1;
                }
            }
        }
        switched
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
    // Style Override Indicators
    // =============================================

    /// Detect which visual properties of an instance's children differ from the component template.
    /// Returns JSON: { overrides: [{ node_id, node_name, properties: ["fill","opacity",...] }] } or "null"
    #[wasm_bindgen]
    pub fn get_instance_overridden_props(&self, instance_id: u64) -> String {
        let (comp_id, variant_values) = match self.scene.get_node(instance_id) {
            Some(n) => match &n.kind {
                NodeKind::Instance(data) => (data.component_id, data.variant_values.clone()),
                _ => return "null".to_string(),
            },
            None => return "null".to_string(),
        };

        let comp = match self.components.get(comp_id) {
            Some(c) => c,
            None => return "null".to_string(),
        };

        let variant = match comp.get_variant(&variant_values) {
            Some(v) => v,
            None => match comp.variants.values().next() {
                Some(v) => v,
                None => return "null".to_string(),
            }
        };

        let template_root = match variant.nodes.first() {
            Some(r) => r,
            None => return "null".to_string(),
        };

        let instance_node = self.scene.get_node(instance_id).unwrap();
        let mut result: Vec<serde_json::Value> = Vec::new();

        // Compare instance root vs template root
        let root_overrides = Self::compare_node_props(instance_node, template_root);
        if !root_overrides.is_empty() {
            result.push(serde_json::json!({
                "node_id": instance_id,
                "node_name": instance_node.name,
                "properties": root_overrides,
            }));
        }

        // Recursively compare children
        self.compare_children_recursive(
            &instance_node.children,
            template_root,
            &variant.nodes,
            &mut result,
        );

        serde_json::to_string(&serde_json::json!({ "overrides": result }))
            .unwrap_or_else(|_| "null".to_string())
    }

    /// Reset all overrides on an instance child, restoring template values.
    /// Returns true on success.
    #[wasm_bindgen]
    pub fn reset_instance_overrides(&mut self, instance_id: u64, target_node_id: u64) -> bool {
        let (comp_id, variant_values) = match self.scene.get_node(instance_id) {
            Some(n) => match &n.kind {
                NodeKind::Instance(data) => (data.component_id, data.variant_values.clone()),
                _ => return false,
            },
            None => return false,
        };

        let comp = match self.components.get(comp_id) {
            Some(c) => c,
            None => return false,
        };

        let variant = match comp.get_variant(&variant_values) {
            Some(v) => v.clone(),
            None => match comp.variants.values().next() {
                Some(v) => v.clone(),
                None => return false,
            }
        };

        // Find the template node that corresponds to this target
        let template_node = if target_node_id == instance_id {
            match variant.nodes.first() {
                Some(r) => r.clone(),
                None => return false,
            }
        } else {
            // Find by matching tree position
            let instance_root = match self.scene.get_node(instance_id) {
                Some(n) => n.clone(),
                None => return false,
            };
            match self.find_template_for_child(target_node_id, &instance_root.children, variant.nodes.first().unwrap(), &variant.nodes) {
                Some(t) => t.clone(),
                None => return false,
            }
        };

        // Restore properties
        if let Some(node) = self.scene.get_node_mut(target_node_id) {
            node.fills = template_node.fills.clone();
            node.strokes = template_node.strokes.clone();
            node.opacity = template_node.opacity;
            node.corner_radius = template_node.corner_radius;
            node.blur = template_node.blur;
            node.shadows = template_node.shadows.clone();
            node.blend_mode = template_node.blend_mode.clone();
            node.visible = template_node.visible;
            node.width = template_node.width;
            node.height = template_node.height;
            if let (NodeKind::Text { content, .. }, NodeKind::Text { content: tc, .. }) =
                (&mut node.kind, &template_node.kind) {
                *content = tc.clone();
            }
        }

        // Clear stored overrides
        if let Some(inst) = self.scene.get_node_mut(instance_id) {
            if let NodeKind::Instance(data) = &mut inst.kind {
                data.overrides.remove(&target_node_id);
            }
        }

        self.push_undo();
        true
    }

    /// Reset ALL overrides on an instance (restore all children to template).
    #[wasm_bindgen]
    pub fn reset_all_instance_overrides(&mut self, instance_id: u64) -> bool {
        // Get all overridden node IDs first
        let info_json = self.get_instance_overridden_props(instance_id);
        let info: serde_json::Value = match serde_json::from_str(&info_json) {
            Ok(v) => v,
            Err(_) => return false,
        };

        let overrides = match info.get("overrides").and_then(|o| o.as_array()) {
            Some(arr) => arr.clone(),
            None => return false,
        };

        if overrides.is_empty() { return true; }

        for ov in &overrides {
            if let Some(nid) = ov.get("node_id").and_then(|v| v.as_u64()) {
                // Re-fetch comp info each time since we mutate
                let (comp_id, variant_values) = match self.scene.get_node(instance_id) {
                    Some(n) => match &n.kind {
                        NodeKind::Instance(data) => (data.component_id, data.variant_values.clone()),
                        _ => continue,
                    },
                    None => continue,
                };
                let comp = match self.components.get(comp_id) {
                    Some(c) => c,
                    None => continue,
                };
                let variant = match comp.get_variant(&variant_values) {
                    Some(v) => v.clone(),
                    None => continue,
                };
                let template_root = match variant.nodes.first() {
                    Some(r) => r,
                    None => continue,
                };

                let template_node = if nid == instance_id {
                    template_root.clone()
                } else {
                    let inst = match self.scene.get_node(instance_id) {
                        Some(n) => n.clone(),
                        None => continue,
                    };
                    match self.find_template_for_child(nid, &inst.children, template_root, &variant.nodes) {
                        Some(t) => t.clone(),
                        None => continue,
                    }
                };

                if let Some(node) = self.scene.get_node_mut(nid) {
                    node.fills = template_node.fills.clone();
                    node.strokes = template_node.strokes.clone();
                    node.opacity = template_node.opacity;
                    node.corner_radius = template_node.corner_radius;
                    node.blur = template_node.blur;
                    node.shadows = template_node.shadows.clone();
                    node.blend_mode = template_node.blend_mode.clone();
                    node.visible = template_node.visible;
                    node.width = template_node.width;
                    node.height = template_node.height;
                    if let (NodeKind::Text { content, .. }, NodeKind::Text { content: tc, .. }) =
                        (&mut node.kind, &template_node.kind) {
                        *content = tc.clone();
                    }
                }
            }
        }

        // Clear all overrides in instance data
        if let Some(inst) = self.scene.get_node_mut(instance_id) {
            if let NodeKind::Instance(data) = &mut inst.kind {
                data.overrides.clear();
            }
        }

        self.push_undo();
        true
    }

    // =============================================
    // Component Playground
    // =============================================

    /// Get playground info for a component (properties, slots, variants).
    /// Returns JSON PlaygroundInfo or "null".
    #[wasm_bindgen]
    pub fn get_playground_info(&self, comp_id: u64) -> String {
        match component_playground::get_playground_info(&self.components, comp_id) {
            Some(info) => serde_json::to_string(&info).unwrap_or_else(|_| "null".to_string()),
            None => "null".to_string(),
        }
    }

    /// Get all variant keys for a component's playground.
    /// Returns JSON array of variant key strings or "[]".
    #[wasm_bindgen]
    pub fn get_playground_variants(&self, comp_id: u64) -> String {
        let keys = component_playground::get_variant_keys(&self.components, comp_id);
        serde_json::to_string(&keys).unwrap_or_else(|_| "[]".to_string())
    }

    /// Create a temporary playground instance. Returns node id or 0.
    #[wasm_bindgen]
    pub fn create_playground_instance(&mut self, comp_id: u64, variant_key_json: &str) -> u64 {
        let variant_key = match component_playground::parse_variant_key_json(variant_key_json) {
            Some(k) => k,
            None => {
                match self.components.get(comp_id) {
                    Some(c) => c.default_key(),
                    None => return 0,
                }
            }
        };
        let comp = match self.components.get(comp_id) {
            Some(c) => c,
            None => return 0,
        };
        let variant_data = match comp.get_variant(&variant_key) {
            Some(vd) => vd.clone(),
            None => return 0,
        };
        for node in &variant_data.nodes {
            self.scene.add_node_direct(node.clone());
        }
        let instance_id = self.scene.next_id();
        let mut instance_node = crate::node::Node::new(instance_id, NodeKind::Instance(Box::new(crate::component::InstanceData {
            component_id: comp_id,
            variant_values: variant_key,
            slot_fills: std::collections::HashMap::new(),
            overrides: std::collections::HashMap::new(),
            responsive_rules: vec![],
        })));
        instance_node.name = format!("Playground_{}", comp.name);
        if let Some(root) = self.scene.get_node(variant_data.root_node_id) {
            instance_node.width = root.width;
            instance_node.height = root.height;
        }
        if let Some(root) = self.scene.get_node(variant_data.root_node_id) {
            instance_node.children = root.children.clone();
        }
        self.scene.add_node_direct(instance_node);
        instance_id
    }

    /// Remove a playground instance and its template nodes
    #[wasm_bindgen]
    pub fn remove_playground_instance(&mut self, instance_id: u64) -> bool {
        let ids = self.scene.collect_subtree_ids(instance_id);
        for id in ids {
            self.scene.remove_node(id);
        }
        true
    }

    /// Generate a variant matrix for a component.
    /// Returns JSON VariantMatrix or "null".
    /// extra_values_json: optional JSON { "propName": "value" } for 3+ prop filtering.
    #[wasm_bindgen]
    pub fn get_variant_matrix(&self, comp_id: u64, extra_values_json: &str) -> String {
        let extra = if extra_values_json.is_empty() { None } else { Some(extra_values_json) };
        match component_playground::generate_variant_matrix(&self.components, comp_id, extra) {
            Some(matrix) => serde_json::to_string(&matrix).unwrap_or_else(|_| "null".to_string()),
            None => "null".to_string(),
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
                responsive_rules: vec![],
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

    pub fn set_list_style(&mut self, id: u64, style: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Text { ref mut list_style, .. } = node.kind {
                *list_style = match style {
                    "bullet" | "Bullet" => crate::node::ListStyle::Bullet,
                    "numbered" | "Numbered" => crate::node::ListStyle::Numbered,
                    "dash" | "Dash" => crate::node::ListStyle::Dash,
                    "checkbox" | "Checkbox" => crate::node::ListStyle::Checkbox,
                    "checkbox-checked" | "CheckboxChecked" => crate::node::ListStyle::CheckboxChecked,
                    _ => crate::node::ListStyle::None,
                };
            }
        }
    }

    pub fn get_list_style(&self, id: u64) -> String {
        self.scene.get_node(id).map(|n| {
            if let NodeKind::Text { ref list_style, .. } = n.kind {
                match list_style {
                    crate::node::ListStyle::None => "none",
                    crate::node::ListStyle::Bullet => "bullet",
                    crate::node::ListStyle::Numbered => "numbered",
                    crate::node::ListStyle::Dash => "dash",
                    crate::node::ListStyle::Checkbox => "checkbox",
                    crate::node::ListStyle::CheckboxChecked => "checkbox-checked",
                }
            } else { "none" }
        }).unwrap_or("none").to_string()
    }

    pub fn set_indent_level(&mut self, id: u64, level: u8) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Text { ref mut indent_level, .. } = node.kind {
                *indent_level = level.min(10);
            }
        }
    }

    pub fn get_indent_level(&self, id: u64) -> u8 {
        self.scene.get_node(id).map(|n| {
            if let NodeKind::Text { indent_level, .. } = &n.kind { *indent_level } else { 0 }
        }).unwrap_or(0)
    }

    // =============================================
    // Text Transform & Indent
    // =============================================

    pub fn set_text_transform(&mut self, id: u64, transform: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Text { ref mut text_transform, .. } = node.kind {
                *text_transform = crate::node::TextTransform::from_str(transform);
            }
        }
    }

    pub fn get_text_transform(&self, id: u64) -> String {
        self.scene.get_node(id).map(|n| {
            if let NodeKind::Text { ref text_transform, .. } = n.kind {
                text_transform.to_css().to_string()
            } else { "none".to_string() }
        }).unwrap_or_else(|| "none".to_string())
    }

    pub fn set_text_indent(&mut self, id: u64, indent: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Text { ref mut text_indent, .. } = node.kind {
                *text_indent = indent.max(-500.0).min(500.0);
            }
        }
    }

    pub fn get_text_indent(&self, id: u64) -> f64 {
        self.scene.get_node(id).map(|n| {
            if let NodeKind::Text { text_indent, .. } = &n.kind { *text_indent } else { 0.0 }
        }).unwrap_or(0.0)
    }

    // =============================================
    // OpenType Features
    // =============================================

    pub fn set_opentype_ligatures(&mut self, id: u64, enabled: bool) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Text { ref mut opentype_features, .. } = node.kind {
                opentype_features.ligatures = enabled;
            }
        }
    }

    pub fn set_opentype_old_style_numerals(&mut self, id: u64, enabled: bool) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Text { ref mut opentype_features, .. } = node.kind {
                opentype_features.old_style_numerals = enabled;
            }
        }
    }

    pub fn set_opentype_small_caps(&mut self, id: u64, enabled: bool) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Text { ref mut opentype_features, .. } = node.kind {
                opentype_features.small_caps = enabled;
            }
        }
    }

    pub fn set_opentype_tabular_numerals(&mut self, id: u64, enabled: bool) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Text { ref mut opentype_features, .. } = node.kind {
                opentype_features.tabular_numerals = enabled;
            }
        }
    }

    pub fn get_opentype_features(&self, id: u64) -> String {
        if let Some(n) = self.scene.get_node(id) {
            if let NodeKind::Text { ref opentype_features, .. } = n.kind {
                return serde_json::json!({
                    "ligatures": opentype_features.ligatures,
                    "old_style_numerals": opentype_features.old_style_numerals,
                    "small_caps": opentype_features.small_caps,
                    "tabular_numerals": opentype_features.tabular_numerals,
                }).to_string();
            }
        }
        "{}".to_string()
    }

    // =============================================
    // Variable Font Axes
    // =============================================

    /// Set a variable font axis value (e.g. "wght" -> 700, "wdth" -> 75)
    pub fn set_font_variation_axis(&mut self, id: u64, tag: &str, value: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Text { ref mut font_variation_settings, .. } = node.kind {
                font_variation_settings.insert(tag.to_string(), value);
            }
        }
    }

    /// Remove a variable font axis
    pub fn remove_font_variation_axis(&mut self, id: u64, tag: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let NodeKind::Text { ref mut font_variation_settings, .. } = node.kind {
                font_variation_settings.remove(tag);
            }
        }
    }

    /// Get all variable font axis settings as JSON
    pub fn get_font_variation_settings(&self, id: u64) -> String {
        if let Some(n) = self.scene.get_node(id) {
            if let NodeKind::Text { ref font_variation_settings, .. } = n.kind {
                return serde_json::to_string(font_variation_settings).unwrap_or_else(|_| "{}".to_string());
            }
        }
        "{}".to_string()
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

    /// Set text overflow mode (visible/clip/ellipsis)
    pub fn set_text_overflow(&mut self, id: u64, mode: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.text_overflow = match mode {
                "clip" => TextOverflow::Clip,
                "ellipsis" => TextOverflow::Ellipsis,
                _ => TextOverflow::Visible,
            };
        }
    }

    /// Get text overflow mode
    pub fn get_text_overflow(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            match node.text_overflow {
                TextOverflow::Visible => "visible".to_string(),
                TextOverflow::Clip => "clip".to_string(),
                TextOverflow::Ellipsis => "ellipsis".to_string(),
            }
        } else {
            "visible".to_string()
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
    /// Explicitly recompute all auto-layouts. Called during interactive resize.
    pub fn compute_layout(&mut self) {
        layout::compute_layouts(&mut self.scene);
    }

    /// Get active breakpoint info for a node during resize. Returns JSON with label/max_width or "null".
    pub fn get_active_breakpoint_info(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            if node.breakpoints.is_empty() { return "null".to_string(); }
            let mut candidates: Vec<&Breakpoint> = node.breakpoints.iter()
                .filter(|bp| node.width <= bp.max_width)
                .collect();
            candidates.sort_by(|a, b| a.max_width.partial_cmp(&b.max_width).unwrap());
            if let Some(bp) = candidates.first() {
                return format!(r#"{{"label":"{}","max_width":{}}}"#, bp.label, bp.max_width);
            }
        }
        "null".to_string()
    }

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

    /// Set individual padding sides
    pub fn set_layout_padding_top(&mut self, id: u64, val: f64) {
        if let Some(node) = self.scene.get_node_mut(id) { node.layout.padding_top = val; }
    }
    pub fn set_layout_padding_right(&mut self, id: u64, val: f64) {
        if let Some(node) = self.scene.get_node_mut(id) { node.layout.padding_right = val; }
    }
    pub fn set_layout_padding_bottom(&mut self, id: u64, val: f64) {
        if let Some(node) = self.scene.get_node_mut(id) { node.layout.padding_bottom = val; }
    }
    pub fn set_layout_padding_left(&mut self, id: u64, val: f64) {
        if let Some(node) = self.scene.get_node_mut(id) { node.layout.padding_left = val; }
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

    pub fn distribute_selection_with_spacing(&mut self, axis: &str, spacing: f64) {
        let ids: Vec<u64> = self.scene.selection.iter().copied().collect();
        self.push_undo();
        self.scene.distribute_with_spacing(&ids, axis, spacing);
    }

    pub fn get_selection_spacing(&self, axis: &str) -> String {
        let ids: Vec<u64> = self.scene.selection.iter().copied().collect();
        self.scene.get_spacing_between(&ids, axis)
    }

    /// Smart tidy up: equalize spacing + cross-axis align for selected nodes
    pub fn tidy_up_selection(&mut self) -> String {
        let ids: Vec<u64> = self.scene.selection.iter().copied().collect();
        if ids.len() < 2 { return "{}".to_string(); }
        self.push_undo();
        self.scene.tidy_up(&ids)
    }

    /// Smart distribute selection as a 2D grid (detect rows/columns, align + distribute).
    /// Returns JSON: { rows, cols, row_gap, col_gap, count }
    pub fn smart_distribute_grid(&mut self) -> String {
        let ids: Vec<u64> = self.scene.selection.iter().copied().collect();
        if ids.len() < 4 { return "{}".to_string(); }
        self.push_undo();
        self.scene.smart_distribute_grid(&ids)
    }

    /// Smart distribute preview: returns JSON with detected gaps and recommended gap.
    pub fn smart_distribute_preview(&self, ids_json: &str) -> String {
        let ids: Vec<u64> = serde_json::from_str(ids_json).unwrap_or_default();
        self.scene.smart_distribute_preview(&ids)
    }

    /// Smart distribute horizontally with optional custom gap.
    pub fn smart_distribute_h(&mut self, ids_json: &str, gap: f64) {
        let ids: Vec<u64> = serde_json::from_str(ids_json).unwrap_or_default();
        let reference = if gap < 0.0 { None } else { Some(gap) };
        self.push_undo();
        self.scene.smart_distribute_h(&ids, reference);
    }

    /// Smart distribute vertically with optional custom gap.
    pub fn smart_distribute_v(&mut self, ids_json: &str, gap: f64) {
        let ids: Vec<u64> = serde_json::from_str(ids_json).unwrap_or_default();
        let reference = if gap < 0.0 { None } else { Some(gap) };
        self.push_undo();
        self.scene.smart_distribute_v(&ids, reference);
    }

    // =============================================
    // SVG Export
    // =============================================

    /// Export entire scene as SVG
    pub fn export_svg(&self) -> String {
        svg_export::export_scene_svg(&self.scene)
    }

    /// Export active page as email-compatible HTML (table-based, inline styles)
    pub fn export_email_html(&self) -> String {
        email_export::export_email_html(&self.scene)
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

    /// Export a rectangular region as SVG (for slice export)
    pub fn export_region_svg(&self, x: f64, y: f64, w: f64, h: f64) -> String {
        svg_export::export_region_svg(&self.scene, x, y, w, h)
    }

    /// Import SVG markup into the scene. Returns JSON array of created top-level node IDs.
    /// Convert HTML/CSS code to OpenSketch design nodes.
    /// Returns JSON: { "root_id": number, "node_count": number }
    pub fn code_to_design(&mut self, html: &str, offset_x: f64, offset_y: f64) -> String {
        self.push_undo();
        let result = code_to_design::code_to_design(&mut self.scene, html, offset_x, offset_y);
        // Select the root node
        self.scene.selection = vec![result.root_id];
        serde_json::to_string(&result).unwrap_or_else(|_| "{}".into())
    }

    pub fn import_svg(&mut self, svg_text: &str, offset_x: f64, offset_y: f64) -> String {
        self.push_undo();
        let ids = svg_import::import_svg(&mut self.scene, svg_text, offset_x, offset_y);
        let id_nums: Vec<u64> = ids.iter().map(|id| *id).collect();
        // Select imported nodes
        self.scene.selection = ids;
        serde_json::to_string(&id_nums).unwrap_or_else(|_| "[]".into())
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
    // 3D Perspective Transform
    // =============================================

    pub fn set_perspective(&mut self, id: u64, rotate_x: f64, rotate_y: f64, rotate_z: f64, perspective: f64, origin_x: f64, origin_y: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.perspective = Some(crate::node::Perspective3D {
                rotate_x, rotate_y, rotate_z, perspective, origin_x, origin_y,
            });
        }
    }

    pub fn get_perspective(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            if let Some(ref p) = node.perspective {
                return serde_json::to_string(p).unwrap_or_default();
            }
        }
        String::new()
    }

    pub fn clear_perspective(&mut self, id: u64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.perspective = None;
        }
    }

    pub fn set_perspective_rotation(&mut self, id: u64, rx: f64, ry: f64, rz: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            let p = node.perspective.get_or_insert(crate::node::Perspective3D::default());
            p.rotate_x = rx;
            p.rotate_y = ry;
            p.rotate_z = rz;
        }
    }

    pub fn set_perspective_distance(&mut self, id: u64, distance: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            let p = node.perspective.get_or_insert(crate::node::Perspective3D::default());
            p.perspective = distance;
        }
    }

    pub fn set_perspective_origin(&mut self, id: u64, ox: f64, oy: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            let p = node.perspective.get_or_insert(crate::node::Perspective3D::default());
            p.origin_x = ox;
            p.origin_y = oy;
        }
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

    /// Resize + immediately recompute layouts (for interactive drag preview)
    pub fn resize_node_with_layout(&mut self, id: u64, w: f64, h: f64) {
        self.scene.resize_node_with_constraints(id, w, h);
        layout::compute_layouts(&mut self.scene);
    }

    // =============================================
    // Content-aware resize (proportional scaling)
    // =============================================

    /// Scale a node proportionally — resizes + scales all visual properties
    /// (font size, corner radius, stroke widths, shadows, padding, gap, children).
    pub fn scale_node_proportional(&mut self, id: u64, scale_x: f64, scale_y: f64) {
        self.scene.scale_node_proportional(id, scale_x, scale_y);
        layout::compute_layouts(&mut self.scene);
    }

    /// Get the aspect ratio (w/h) of a node. Returns 0 if not available.
    pub fn get_node_aspect_ratio(&self, id: u64) -> f64 {
        self.scene.get_node_aspect_ratio(id).unwrap_or(0.0)
    }

    /// Check if a node is an Image node
    pub fn is_image_node(&self, id: u64) -> bool {
        self.scene.is_image_node(id)
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
    // Page Comparison
    // =============================================

    /// Get node summaries for a page (for diff computation).
    /// Returns JSON array of {id, name, kind, x, y, width, height, fill, parentId}.
    pub fn get_page_node_summaries(&mut self, page_id: u64) -> String {
        let summaries = self.scene.get_page_node_summaries(page_id);
        let arr: Vec<serde_json::Value> = summaries.into_iter().map(|(id, name, kind, x, y, w, h, fill, pid)| {
            serde_json::json!({
                "id": id, "name": name, "kind": kind,
                "x": x, "y": y, "width": w, "height": h,
                "fill": fill, "parentId": pid
            })
        }).collect();
        serde_json::to_string(&arr).unwrap_or_else(|_| "[]".into())
    }

    /// Render a specific page to the given canvas context.
    /// Temporarily switches page, renders, then restores.
    pub fn render_page(&mut self, ctx: &CanvasRenderingContext2d, page_id: u64) {
        let saved_id = self.scene.get_active_page_id();
        if self.scene.switch_to_page_temporarily(page_id) {
            self.scene.apply_variables();
            self.renderer.measure_text_nodes(ctx, &mut self.scene);
            layout::compute_layouts(&mut self.scene);
            self.renderer.render(ctx, &self.scene, None);
            self.scene.restore_page(saved_id);
        }
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

    // =============================================
    // Review workflow
    // =============================================

    pub fn create_review(&mut self, branch_id: u64, title: &str, description: &str, reviewer: &str) -> u64 {
        self.push_undo();
        self.scene.create_review(branch_id, title, description, reviewer)
    }

    pub fn approve_review(&mut self, review_id: u64) -> bool {
        self.push_undo();
        self.scene.approve_review(review_id)
    }

    pub fn reject_review(&mut self, review_id: u64, reason: &str) -> bool {
        self.push_undo();
        self.scene.reject_review(review_id, reason)
    }

    pub fn merge_review(&mut self, review_id: u64) -> bool {
        self.push_undo();
        self.scene.merge_review(review_id)
    }

    pub fn add_review_comment(&mut self, review_id: u64, node_id: u64, text: &str, author: &str) -> u64 {
        self.push_undo();
        let nid = if node_id == 0 { None } else { Some(node_id) };
        self.scene.add_review_comment(review_id, nid, text, author)
    }

    pub fn resolve_review_comment(&mut self, comment_id: u64) -> bool {
        self.push_undo();
        self.scene.resolve_review_comment(comment_id)
    }

    pub fn get_reviews(&self) -> String {
        self.scene.get_reviews()
    }

    pub fn get_review(&self, review_id: u64) -> String {
        self.scene.get_review(review_id)
    }

    pub fn get_review_comments(&self, review_id: u64) -> String {
        self.scene.get_review_comments(review_id)
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

    /// Generate a typography scale as JSON. scale_name can be "major-third", "perfect-fourth", etc. or a custom ratio like "1.333".
    pub fn generate_type_scale(&self, base_size: f64, scale_name: &str, font_family: &str) -> String {
        let ratio = crate::typo_scale::scale_ratio(scale_name).unwrap_or(1.25);
        let styles = crate::typo_scale::generate_type_scale(base_size, ratio, font_family);
        serde_json::to_string(&styles).unwrap_or_default()
    }

    /// Apply a typography scale to the StyleStore. Returns count of styles added/updated.
    /// If update_existing is true, existing styles with the same name are updated.
    pub fn apply_type_scale(&mut self, base_size: f64, scale_name: &str, font_family: &str, update_existing: bool) -> u32 {
        let ratio = crate::typo_scale::scale_ratio(scale_name).unwrap_or(1.25);
        let defs = crate::typo_scale::generate_type_scale(base_size, ratio, font_family);
        let mut count = 0u32;
        for def in &defs {
            let mut found = false;
            if update_existing {
                // Find existing style by name
                let existing: Vec<_> = self.styles.text_styles.iter()
                    .filter(|(_, s)| s.name == def.name)
                    .map(|(id, _)| *id)
                    .collect();
                for id in existing {
                    let json = serde_json::json!({
                        "font_family": def.font_family,
                        "font_size": def.font_size,
                        "font_weight": def.font_weight,
                        "line_height": def.line_height,
                    }).to_string();
                    self.styles.update_text_style(id, &json);
                    found = true;
                    count += 1;
                }
            }
            if !found {
                self.styles.add_text_style(
                    def.name.clone(), def.font_family.clone(), def.font_size,
                    def.font_weight, crate::node::FontStyle::Normal, def.line_height,
                    crate::node::TextAlign::Left, 0, 0, 0, 1.0,
                );
                count += 1;
            }
        }
        count
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

    // ── Style Versioning ─────────────────────────────────

    /// Create a style version snapshot. Returns version ID.
    pub fn style_version_create(&mut self, tag: &str, description: &str, timestamp: f64) -> u64 {
        self.styles.create_version(tag, description, timestamp as u64)
    }

    /// List all style versions as JSON array.
    pub fn style_version_list(&self) -> String {
        let versions: Vec<serde_json::Value> = self.styles.list_versions().iter().map(|v| {
            serde_json::json!({
                "id": v.id,
                "tag": v.tag,
                "timestamp": v.timestamp,
                "description": v.description,
                "colorCount": v.color_styles.len(),
                "textCount": v.text_styles.len(),
            })
        }).collect();
        serde_json::to_string(&versions).unwrap_or_default()
    }

    /// Remove a style version.
    pub fn style_version_remove(&mut self, id: u64) -> bool {
        self.styles.remove_version(id)
    }

    /// Rollback styles to a version. Auto-saves current state first.
    pub fn style_version_rollback(&mut self, id: u64, timestamp: f64) -> bool {
        self.styles.rollback_to_version(id, timestamp as u64)
    }

    /// Diff two style versions. Returns JSON array of diff entries.
    pub fn style_version_diff(&self, a: u64, b: u64) -> String {
        let diffs = self.styles.diff_versions(a, b);
        serde_json::to_string(&diffs).unwrap_or_default()
    }

    /// Diff a style version against current styles.
    pub fn style_version_diff_current(&self, id: u64) -> String {
        let diffs = self.styles.diff_with_current(id);
        serde_json::to_string(&diffs).unwrap_or_default()
    }

    /// Export design tokens in the specified format.
    /// format: "w3c" | "style-dictionary" | "tailwind"
    /// Returns JSON string.
    pub fn export_design_tokens(&self, format: &str) -> String {
        let fmt = match format {
            "style-dictionary" => design_tokens::TokenFormat::StyleDictionary,
            "tailwind" => design_tokens::TokenFormat::Tailwind,
            "css-variables" | "css" => design_tokens::TokenFormat::CssVariables,
            _ => design_tokens::TokenFormat::W3C,
        };
        design_tokens::export_design_tokens(&self.styles, &self.scene.variable_collections, fmt)
    }

    // ── Design Token Theme Switching ──

    #[wasm_bindgen]
    pub fn token_create_theme(&mut self, name: &str) -> u64 {
        self.push_undo();
        self.scene.token_store.create_theme(name.to_string())
    }

    #[wasm_bindgen]
    pub fn token_remove_theme(&mut self, theme_id: u64) -> bool {
        self.push_undo();
        self.scene.token_store.remove_theme(theme_id)
    }

    #[wasm_bindgen]
    pub fn token_rename_theme(&mut self, theme_id: u64, name: &str) -> bool {
        self.scene.token_store.rename_theme(theme_id, name.to_string())
    }

    #[wasm_bindgen]
    pub fn token_set_active_theme(&mut self, theme_id: u64) -> bool {
        self.push_undo();
        let ok = self.scene.token_store.set_active_theme(theme_id);
        if ok {
            self.scene.apply_token_theme();
        }
        ok
    }

    #[wasm_bindgen]
    pub fn token_get_active_theme(&self) -> u64 {
        self.scene.token_store.active_theme_id
    }

    #[wasm_bindgen]
    pub fn token_get_themes(&self) -> String {
        let themes: Vec<serde_json::Value> = self.scene.token_store.themes.iter().map(|t| {
            serde_json::json!({
                "id": t.id,
                "name": t.name,
                "tokenCount": t.tokens.len()
            })
        }).collect();
        serde_json::to_string(&themes).unwrap_or_else(|_| "[]".into())
    }

    #[wasm_bindgen]
    pub fn token_add_token(&mut self, theme_id: u64, name: &str, value_type: &str, value: &str) -> u64 {
        self.push_undo();
        use crate::token::TokenValue;
        let tv = match value_type {
            "color" => TokenValue::Color(value.to_string()),
            "number" => TokenValue::Number(value.parse().unwrap_or(0.0)),
            _ => TokenValue::String(value.to_string()),
        };
        self.scene.token_store.add_token(theme_id, name.to_string(), tv).unwrap_or(0)
    }

    #[wasm_bindgen]
    pub fn token_remove_token(&mut self, theme_id: u64, token_id: u64) -> bool {
        self.push_undo();
        self.scene.token_store.remove_token(theme_id, token_id)
    }

    #[wasm_bindgen]
    pub fn token_update_token(&mut self, theme_id: u64, token_id: u64, value_type: &str, value: &str) -> bool {
        self.push_undo();
        use crate::token::TokenValue;
        let tv = match value_type {
            "color" => TokenValue::Color(value.to_string()),
            "number" => TokenValue::Number(value.parse().unwrap_or(0.0)),
            _ => TokenValue::String(value.to_string()),
        };
        let ok = self.scene.token_store.update_token(theme_id, token_id, tv);
        if ok {
            self.scene.apply_token_theme();
        }
        ok
    }

    #[wasm_bindgen]
    pub fn token_get_tokens(&self, theme_id: u64) -> String {
        if let Some(theme) = self.scene.token_store.get_theme(theme_id) {
            let tokens: Vec<serde_json::Value> = theme.tokens.iter().map(|t| {
                let (vtype, vstr) = match &t.value {
                    token::TokenValue::Color(c) => ("color", c.clone()),
                    token::TokenValue::Number(n) => ("number", n.to_string()),
                    token::TokenValue::String(s) => ("string", s.clone()),
                };
                serde_json::json!({
                    "id": t.id,
                    "name": t.name,
                    "type": vtype,
                    "value": vstr
                })
            }).collect();
            serde_json::to_string(&tokens).unwrap_or_else(|_| "[]".into())
        } else {
            "[]".into()
        }
    }

    #[wasm_bindgen]
    pub fn token_bind_node(&mut self, node_id: u64, property: &str, token_name: &str) {
        use crate::token::TokenProperty;
        self.push_undo();
        if let Some(prop) = TokenProperty::from_str(property) {
            self.scene.token_store.bind(node_id, prop, token_name.to_string());
            self.scene.apply_token_theme();
        }
    }

    #[wasm_bindgen]
    pub fn token_unbind_node(&mut self, node_id: u64, property: &str) {
        use crate::token::TokenProperty;
        self.push_undo();
        if let Some(prop) = TokenProperty::from_str(property) {
            self.scene.token_store.unbind(node_id, prop);
        }
    }

    #[wasm_bindgen]
    pub fn token_get_bindings(&self, node_id: u64) -> String {
        let bindings: Vec<serde_json::Value> = self.scene.token_store.get_bindings_for_node(node_id).iter().map(|b| {
            serde_json::json!({
                "property": b.property.as_str(),
                "tokenName": b.token_name
            })
        }).collect();
        serde_json::to_string(&bindings).unwrap_or_else(|_| "[]".into())
    }

    #[wasm_bindgen]
    pub fn token_export_json(&self) -> String {
        self.scene.token_store.export_json()
    }

    #[wasm_bindgen]
    pub fn token_import_json(&mut self, json: &str) -> bool {
        if let Some(store) = token::TokenStore::import_json(json) {
            self.push_undo();
            self.scene.token_store = store;
            self.scene.apply_token_theme();
            true
        } else {
            false
        }
    }

    /// Analyze design system health: component usage, detached instances, unused styles, consistency score
    #[wasm_bindgen]
    pub fn get_design_health(&self) -> String {
        let report = design_health::analyze_health(&self.scene, &self.components, &self.styles);
        serde_json::to_string(&report).unwrap_or_else(|_| "{}".to_string())
    }

    /// Run handoff checklist analysis — returns JSON with all checks, pass/fail, node IDs
    #[wasm_bindgen]
    pub fn get_handoff_checklist(&self) -> String {
        let report = handoff_checklist::analyze(&self.scene, &self.components, &self.styles);
        serde_json::to_string(&report).unwrap_or_else(|_| "{}".to_string())
    }

    /// Remove unused color styles
    #[wasm_bindgen]
    pub fn remove_unused_color_styles(&mut self) -> u32 {
        let report = design_health::analyze_health(&self.scene, &self.components, &self.styles);
        let mut removed = 0u32;
        for id in &report.unused_color_style_ids {
            if self.styles.remove_color_style(*id) { removed += 1; }
        }
        removed
    }

    /// Remove unused text styles
    #[wasm_bindgen]
    pub fn remove_unused_text_styles(&mut self) -> u32 {
        let report = design_health::analyze_health(&self.scene, &self.components, &self.styles);
        let mut removed = 0u32;
        for id in &report.unused_text_style_ids {
            if self.styles.remove_text_style(*id) { removed += 1; }
        }
        removed
    }

    // =============================================
    // Migration Assistant
    // =============================================

    /// Scan scene for hardcoded styles and suggest migrations to shared styles
    pub fn scan_migration_suggestions(&self) -> String {
        let suggestions = migration_assistant::scan_for_migration_suggestions(&self.scene, &self.styles);
        serde_json::to_string(&suggestions).unwrap_or_else(|_| "[]".to_string())
    }

    /// Apply a migration suggestion: link node to existing style
    pub fn apply_migration_suggestion(&mut self, node_id: u64, style_id: u64, property: &str) -> bool {
        let prop = match property {
            "Fill" => migration_assistant::MigrationProperty::Fill,
            "Stroke" => migration_assistant::MigrationProperty::Stroke,
            "TextStyle" => migration_assistant::MigrationProperty::TextStyle,
            _ => return false,
        };
        self.push_undo();
        migration_assistant::apply_migration(&mut self.scene, &self.styles, node_id, style_id, &prop)
    }

    /// Create a new color style from suggestion and apply to node
    pub fn migration_create_and_apply_color(&mut self, node_id: u64, name: &str, r: u8, g: u8, b: u8, a: f64) -> u64 {
        self.push_undo();
        let style_id = self.styles.add_color_style(name.to_string(), r, g, b, a);
        if let Some(node) = self.scene.get_node_mut(node_id) {
            node.color_style_id = Some(style_id);
        }
        style_id
    }

    /// Create a new text style from suggestion and apply to node
    pub fn migration_create_and_apply_text(&mut self, node_id: u64, name: &str) -> u64 {
        self.push_undo();
        // Extract current text props from node
        if let Some(node) = self.scene.get_node(node_id) {
            if let NodeKind::Text { ref font_family, font_size, font_weight, ref font_style, line_height, ref text_align, .. } = node.kind {
                let fill_color = node.fills.first().map(|f| f.color()).unwrap_or(crate::types::Color::black());
                let style_id = self.styles.add_text_style(
                    name.to_string(), font_family.clone(), font_size, font_weight,
                    font_style.clone(), line_height, text_align.clone(),
                    fill_color.r, fill_color.g, fill_color.b, fill_color.a,
                );
                // Need mutable access now
                if let Some(node_mut) = self.scene.get_node_mut(node_id) {
                    node_mut.text_style_id = Some(style_id);
                }
                return style_id;
            }
        }
        0
    }

    /// Run focused accessibility checks (WCAG 2.1) → JSON array of A11yIssue
    pub fn check_accessibility(&self) -> String {
        let issues = accessibility::check_accessibility(self.scene.nodes_map());
        serde_json::to_string(&issues).unwrap_or_else(|_| "[]".to_string())
    }

    pub fn run_design_lint(&self) -> String {
        let config = design_lint::LintConfig::default();
        let issues = design_lint::run_lint(self.scene.nodes_map(), &config);
        serde_json::to_string(&issues).unwrap_or_else(|_| "[]".to_string())
    }

    /// Get auto-fix suggestions for WCAG contrast violations
    #[wasm_bindgen]
    pub fn get_a11y_fixes(&self) -> String {
        let config = design_lint::LintConfig::default();
        let fixes = design_lint::get_accessibility_fixes(self.scene.nodes_map(), &config);
        serde_json::to_string(&fixes).unwrap_or_else(|_| "[]".to_string())
    }

    /// Apply a suggested accessible color to a node's first solid fill
    #[wasm_bindgen]
    pub fn apply_a11y_fix(&mut self, node_id: u64, r: u8, g: u8, b: u8) -> bool {
        self.push_undo();
        let nid = node_id as crate::node::NodeId;
        if let Some(node) = self.scene.get_node_mut(nid) {
            // Find first solid fill and update its color
            for fill in node.fills.iter_mut() {
                if let crate::node::FillType::Solid { color } = &mut fill.fill_type {
                    color.r = r;
                    color.g = g;
                    color.b = b;
                    return true;
                }
            }
        }
        false
    }

    /// Apply all accessibility fixes at once
    #[wasm_bindgen]
    pub fn apply_all_a11y_fixes(&mut self) -> u32 {
        let config = design_lint::LintConfig::default();
        let fixes = design_lint::get_accessibility_fixes(self.scene.nodes_map(), &config);
        if fixes.is_empty() { return 0; }
        self.push_undo();
        let mut count = 0u32;
        for fix in &fixes {
            if let Some(node) = self.scene.get_node_mut(fix.node_id) {
                for fill in node.fills.iter_mut() {
                    if let crate::node::FillType::Solid { color } = &mut fill.fill_type {
                        color.r = fix.suggested_r;
                        color.g = fix.suggested_g;
                        color.b = fix.suggested_b;
                        count += 1;
                        break;
                    }
                }
            }
        }
        count
    }

    /// Run accessibility audit → JSON array (alias for check_accessibility)
    #[wasm_bindgen]
    pub fn run_accessibility_audit(&self) -> String {
        self.check_accessibility()
    }

    /// Set alt text on a node (for Image accessibility)
    #[wasm_bindgen]
    pub fn set_alt_text(&mut self, node_id: u64, text: &str) {
        self.push_undo();
        let nid = node_id as crate::node::NodeId;
        if let Some(node) = self.scene.get_node_mut(nid) {
            node.alt_text = if text.is_empty() { None } else { Some(text.to_string()) };
        }
    }

    /// Get alt text from a node
    #[wasm_bindgen]
    pub fn get_alt_text(&self, node_id: u64) -> String {
        let nid = node_id as crate::node::NodeId;
        self.scene.nodes_map().get(&nid)
            .and_then(|n| n.alt_text.clone())
            .unwrap_or_default()
    }

    /// Analyze scene and return statistics as JSON (node count, type distribution, style usage, component coverage)
    #[wasm_bindgen]
    pub fn get_scene_analysis(&self) -> String {
        use std::collections::HashMap;
        let nodes = self.scene.nodes_map();
        let total = nodes.len();
        let mut kind_counts: HashMap<String, usize> = HashMap::new();
        let mut has_fill = 0usize;
        let mut has_stroke = 0usize;
        let mut has_layout = 0usize;
        let mut has_notes = 0usize;
        let mut instance_count = 0usize;
        let mut names: Vec<String> = Vec::new();

        for (_id, node) in nodes.iter() {
            let kind_str = match &node.kind {
                NodeKind::Rect => "Rect", NodeKind::Ellipse => "Ellipse",
                NodeKind::Text { .. } => "Text", NodeKind::Frame => "Frame",
                NodeKind::Group => "Group", NodeKind::Slot { .. } => "Slot",
                NodeKind::Instance(_) => "Instance", NodeKind::Image { .. } => "Image",
                NodeKind::Star { .. } => "Star", NodeKind::Polygon { .. } => "Polygon",
                NodeKind::Section => "Section", NodeKind::Slice => "Slice",
                NodeKind::Connector { .. } => "Connector",
                NodeKind::Path { .. } => "Path",
                NodeKind::VectorNetwork(_) => "VectorNetwork",
                NodeKind::StickyNote { .. } => "StickyNote",
                NodeKind::Table { .. } => "Table",
                NodeKind::Callout { .. } => "Callout",
            }.to_string();
            *kind_counts.entry(kind_str).or_insert(0) += 1;
            if !node.fills.is_empty() { has_fill += 1; }
            if node.stroke.is_some() { has_stroke += 1; }
            if node.layout.mode != LayoutMode::None { has_layout += 1; }
            if !node.notes.is_empty() { has_notes += 1; }
            names.push(node.name.clone());
            if let NodeKind::Instance(_) = &node.kind { instance_count += 1; }
        }

        let result = serde_json::json!({
            "total_nodes": total,
            "kind_distribution": kind_counts,
            "fill_count": has_fill,
            "stroke_count": has_stroke,
            "layout_count": has_layout,
            "notes_count": has_notes,
            "component_count": self.components.list().len(),
            "instance_count": instance_count,
            "node_names": names,
        });
        serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string())
    }

    /// Analyze design and return polish suggestions as JSON
    #[wasm_bindgen]
    pub fn analyze_polish(&self) -> String {
        let result = design_polish::analyze(self.scene.nodes_map());
        serde_json::to_string(&result.fixes).unwrap_or_else(|_| "[]".to_string())
    }

    /// Apply polish fixes by their IDs (JSON array of u32)
    #[wasm_bindgen]
    pub fn apply_polish(&mut self, fix_ids_json: &str) -> u32 {
        let fix_ids: Vec<u32> = serde_json::from_str(fix_ids_json).unwrap_or_default();
        if fix_ids.is_empty() { return 0; }
        self.push_undo();
        let result = design_polish::analyze(self.scene.nodes_map());
        let nodes = self.scene.nodes_map_mut();
        design_polish::apply_fixes(nodes, &result, &fix_ids)
    }

    // ── Smart Replace ──────────────────────────────────────

    /// Find nodes with similar size/aspect-ratio to the target node.
    /// Returns JSON array of {id, name, width, height, similarity}.
    #[wasm_bindgen]
    pub fn find_similar_nodes(&self, target_id: u64, ratio_threshold: f64, size_threshold: f64) -> String {
        let thresh = smart_replace::SimilarityThreshold {
            ratio_threshold,
            size_threshold,
        };
        let results = smart_replace::find_similar_nodes(self.scene.nodes_map(), target_id, &thresh);
        serde_json::to_string(&results).unwrap_or_else(|_| "[]".to_string())
    }

    /// Replace target nodes' content with the source node's visual properties.
    /// target_ids_json: JSON array of u64 node IDs.
    /// Returns the number of nodes replaced.
    #[wasm_bindgen]
    pub fn replace_with_node(&mut self, source_id: u64, target_ids_json: &str) -> u32 {
        let target_ids: Vec<u64> = serde_json::from_str(target_ids_json).unwrap_or_default();
        if target_ids.is_empty() { return 0; }
        self.push_undo();
        let nodes = self.scene.nodes_map_mut();
        smart_replace::replace_node_content(nodes, source_id, &target_ids)
    }

    /// Replace with configurable options.
    /// options_json: JSON object with keep_size, keep_position, transfer_style booleans.
    #[wasm_bindgen]
    pub fn replace_with_node_options(&mut self, source_id: u64, target_ids_json: &str, options_json: &str) -> u32 {
        let target_ids: Vec<u64> = serde_json::from_str(target_ids_json).unwrap_or_default();
        if target_ids.is_empty() { return 0; }
        let options: smart_replace::ReplaceOptions = serde_json::from_str(options_json).unwrap_or_default();
        self.push_undo();
        let nodes = self.scene.nodes_map_mut();
        smart_replace::replace_node_content_with_options(nodes, source_id, &target_ids, &options)
    }

    /// Replace all currently selected nodes with the source node's content.
    /// Returns the number of nodes replaced.
    #[wasm_bindgen]
    pub fn replace_selection_with(&mut self, source_id: u64) -> u32 {
        let sel: Vec<u64> = self.scene.selection.clone();
        if sel.is_empty() { return 0; }
        self.push_undo();
        let nodes = self.scene.nodes_map_mut();
        smart_replace::replace_node_content(nodes, source_id, &sel)
    }

    /// Replace selection with options.
    #[wasm_bindgen]
    pub fn replace_selection_with_options(&mut self, source_id: u64, options_json: &str) -> u32 {
        let sel: Vec<u64> = self.scene.selection.clone();
        if sel.is_empty() { return 0; }
        let options: smart_replace::ReplaceOptions = serde_json::from_str(options_json).unwrap_or_default();
        self.push_undo();
        let nodes = self.scene.nodes_map_mut();
        smart_replace::replace_node_content_with_options(nodes, source_id, &sel, &options)
    }

    /// Replace selected nodes with a new component instance.
    /// Creates a fresh instance of the given component for each target.
    /// Returns the number of nodes replaced.
    #[wasm_bindgen]
    pub fn replace_selection_with_component(&mut self, component_id: u64, options_json: &str) -> u32 {
        let sel: Vec<u64> = self.scene.selection.clone();
        if sel.is_empty() { return 0; }
        let options: smart_replace::ReplaceOptions = serde_json::from_str(options_json).unwrap_or_default();

        // Get component info
        let comp = match self.components.get(component_id) {
            Some(c) => c.clone(),
            None => return 0,
        };

        // Get default variant data for style transfer
        let default_key = comp.default_key();
        let variant_data = comp.get_variant(&default_key).cloned();

        self.push_undo();
        let mut count = 0u32;
        for &tid in &sel {
            if let Some(target) = self.scene.nodes_map_mut().get_mut(&tid) {
                let saved_x = target.x;
                let saved_y = target.y;
                let saved_w = target.width;
                let saved_h = target.height;

                // Convert to Instance
                let instance_data = InstanceData {
                    component_id,
                    variant_values: default_key.clone(),
                    slot_fills: std::collections::HashMap::new(),
                    overrides: std::collections::HashMap::new(),
                    responsive_rules: vec![],
                };
                target.kind = NodeKind::Instance(Box::new(instance_data));
                target.name = format!("{} (instance)", comp.name);

                // Apply source component style if transfer_style and variant has node data
                if options.transfer_style {
                    if let Some(ref vd) = variant_data {
                        if let Some(root) = vd.nodes.first() {
                            target.fills = root.fills.clone();
                            target.strokes = root.strokes.clone();
                            target.opacity = root.opacity;
                            target.corner_radius = root.corner_radius;
                            target.shadows = root.shadows.clone();
                            target.blur = root.blur;
                            target.blend_mode = root.blend_mode;
                        }
                    }
                }

                if options.keep_position {
                    target.x = saved_x;
                    target.y = saved_y;
                }
                if options.keep_size {
                    target.width = saved_w;
                    target.height = saved_h;
                }
                count += 1;
            }
        }
        count
    }

    // ── Smart Content Fill ──────────────────────────────────

    /// Fill selected nodes with placeholder content.
    /// category: "names" | "emails" | "addresses" | "dates" | "phones" | "lorem" | "avatars" | "numbers" | "prices"
    /// node_ids_json: JSON array of u64 node IDs.
    /// seed: random seed for reproducible content.
    /// Returns the number of nodes filled.
    #[wasm_bindgen]
    pub fn fill_content(&mut self, node_ids_json: &str, category: &str, seed: u32) -> u32 {
        let node_ids: Vec<u64> = serde_json::from_str(node_ids_json).unwrap_or_default();
        if node_ids.is_empty() { return 0; }
        let cat = match content_fill::ContentFillCategory::from_str(category) {
            Some(c) => c,
            None => return 0,
        };
        self.push_undo();
        let nodes = self.scene.nodes_map_mut();
        content_fill::fill_nodes(nodes, &node_ids, &cat, seed)
    }

    /// Fill currently selected nodes with placeholder content.
    /// Returns the number of nodes filled.
    #[wasm_bindgen]
    pub fn fill_selection_content(&mut self, category: &str, seed: u32) -> u32 {
        let sel: Vec<u64> = self.scene.selection.clone();
        if sel.is_empty() { return 0; }
        let cat = match content_fill::ContentFillCategory::from_str(category) {
            Some(c) => c,
            None => return 0,
        };
        self.push_undo();
        let nodes = self.scene.nodes_map_mut();
        content_fill::fill_nodes(nodes, &sel, &cat, seed)
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

    /// Set assignee for a comment
    pub fn set_comment_assignee(&mut self, comment_id: u32, assignee: &str) {
        let a = if assignee.is_empty() { None } else { Some(assignee.to_string()) };
        self.scene.set_comment_assignee(comment_id as u64, a);
    }

    /// Get comments filtered by mention (username mentioned in text)
    pub fn get_comments_by_mention(&self, username: &str) -> String {
        let comments: Vec<&Comment> = self.scene.get_all_comments()
            .iter()
            .filter(|c| c.mentions.iter().any(|m| m == username))
            .collect();
        serde_json::to_string(&comments).unwrap_or_else(|_| "[]".to_string())
    }

    /// Get unresolved comment count
    pub fn get_unresolved_comment_count(&self) -> u32 {
        self.scene.get_all_comments().iter().filter(|c| !c.resolved).count() as u32
    }

    /// Export all comments as Markdown report
    pub fn export_comments_markdown(&self) -> String {
        self.scene.export_comments_markdown()
    }

    pub fn export_annotations_markdown(&self) -> String {
        self.scene.export_annotations_markdown()
    }

    /// Generate annotation heatmap data.
    /// Returns JSON: { cells: [{x, y, width, height, density, count}], max_density, total_comments, grid_size }
    pub fn generate_annotation_heatmap(&self, cell_size: f64) -> String {
        let comments = self.scene.get_all_comments();
        let stamps: Vec<(f64, f64)> = self.scene.all_nodes()
            .filter(|n| matches!(n.kind, crate::node::NodeKind::Callout { .. }))
            .map(|n| (n.x + n.width / 2.0, n.y + n.height / 2.0))
            .collect();

        if comments.is_empty() && stamps.is_empty() {
            return r#"{"cells":[],"max_density":0,"total_comments":0,"grid_size":0}"#.to_string();
        }

        // Collect all annotation points
        let mut points: Vec<(f64, f64)> = comments.iter().map(|c| (c.x, c.y)).collect();
        points.extend(stamps);

        // Find bounds
        let min_x = points.iter().map(|p| p.0).fold(f64::INFINITY, f64::min);
        let min_y = points.iter().map(|p| p.1).fold(f64::INFINITY, f64::min);
        let max_x = points.iter().map(|p| p.0).fold(f64::NEG_INFINITY, f64::max);
        let max_y = points.iter().map(|p| p.1).fold(f64::NEG_INFINITY, f64::max);

        let cell = if cell_size > 0.0 { cell_size } else { 100.0 };
        // Add padding
        let pad = cell;
        let x0 = min_x - pad;
        let y0 = min_y - pad;
        let x1 = max_x + pad;
        let y1 = max_y + pad;

        let cols = ((x1 - x0) / cell).ceil() as usize;
        let rows = ((y1 - y0) / cell).ceil() as usize;

        let mut grid = vec![0u32; cols * rows];
        for (px, py) in &points {
            let c = ((px - x0) / cell).floor() as usize;
            let r = ((py - y0) / cell).floor() as usize;
            if c < cols && r < rows {
                grid[r * cols + c] += 1;
            }
        }

        let max_density = grid.iter().copied().max().unwrap_or(0);

        let mut cells = Vec::new();
        for r in 0..rows {
            for c in 0..cols {
                let count = grid[r * cols + c];
                if count > 0 {
                    let density = if max_density > 0 { count as f64 / max_density as f64 } else { 0.0 };
                    cells.push(serde_json::json!({
                        "x": x0 + c as f64 * cell,
                        "y": y0 + r as f64 * cell,
                        "width": cell,
                        "height": cell,
                        "density": density,
                        "count": count
                    }));
                }
            }
        }

        serde_json::json!({
            "cells": cells,
            "max_density": max_density,
            "total_comments": points.len(),
            "grid_size": cell
        }).to_string()
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

    // =============================================
    // Design-to-code component mapping
    // =============================================

    /// Set code mapping on a node (JSON: { component_name, framework, import_path, props, children_slot })
    #[wasm_bindgen]
    pub fn set_code_mapping(&mut self, node_id: u64, json: &str) -> bool {
        match serde_json::from_str::<node::CodeMapping>(json) {
            Ok(mapping) => {
                self.push_undo();
                self.scene.set_code_mapping(node_id, mapping)
            }
            Err(_) => false,
        }
    }

    /// Get code mapping JSON for a node (null string if none)
    #[wasm_bindgen]
    pub fn get_code_mapping(&self, node_id: u64) -> String {
        self.scene.get_code_mapping(node_id).unwrap_or_default()
    }

    /// Remove code mapping from a node
    #[wasm_bindgen]
    pub fn clear_code_mapping(&mut self, node_id: u64) -> bool {
        self.push_undo();
        self.scene.clear_code_mapping(node_id)
    }

    /// Export component code for a mapped node → JSON { component_name, framework, import_path, code, props_interface }
    #[wasm_bindgen]
    pub fn export_component_code(&self, node_id: u64) -> String {
        match self.scene.export_component_code(node_id) {
            Some(exp) => serde_json::to_string(&exp).unwrap_or_default(),
            None => String::new(),
        }
    }

    /// Export all mapped components → JSON array
    #[wasm_bindgen]
    pub fn export_all_components(&self) -> String {
        let comps = self.scene.export_all_components();
        serde_json::to_string(&comps).unwrap_or_else(|_| "[]".to_string())
    }

    // =============================================
    // Whiteboard Mode
    // =============================================

    pub fn toggle_whiteboard_mode(&mut self) -> bool {
        self.scene.whiteboard_state.active = !self.scene.whiteboard_state.active;
        if self.scene.whiteboard_state.active && self.scene.whiteboard_state.timer.is_none() {
            self.scene.whiteboard_state.timer = Some(whiteboard::WhiteboardTimer::default());
        }
        self.scene.whiteboard_state.active
    }

    pub fn get_whiteboard_active(&self) -> bool {
        self.scene.whiteboard_state.active
    }

    pub fn start_timer(&mut self) {
        if let Some(ref mut timer) = self.scene.whiteboard_state.timer {
            timer.running = true;
        }
    }

    pub fn stop_timer(&mut self) {
        if let Some(ref mut timer) = self.scene.whiteboard_state.timer {
            timer.running = false;
        }
    }

    pub fn reset_timer(&mut self, duration_secs: u32) {
        let dur = if duration_secs == 0 { 300 } else { duration_secs };
        self.scene.whiteboard_state.timer = Some(whiteboard::WhiteboardTimer {
            duration_secs: dur,
            remaining_secs: dur,
            running: false,
        });
    }

    pub fn tick_timer(&mut self) -> u32 {
        if let Some(ref mut timer) = self.scene.whiteboard_state.timer {
            if timer.running && timer.remaining_secs > 0 {
                timer.remaining_secs -= 1;
                if timer.remaining_secs == 0 {
                    timer.running = false;
                }
            }
            timer.remaining_secs
        } else {
            0
        }
    }

    pub fn get_timer_state(&self) -> String {
        match &self.scene.whiteboard_state.timer {
            Some(timer) => serde_json::json!({
                "duration_secs": timer.duration_secs,
                "remaining_secs": timer.remaining_secs,
                "running": timer.running,
            }).to_string(),
            None => "null".to_string(),
        }
    }

    pub fn set_voting_enabled(&mut self, enabled: bool) {
        self.scene.whiteboard_state.voting_enabled = enabled;
    }

    pub fn get_voting_enabled(&self) -> bool {
        self.scene.whiteboard_state.voting_enabled
    }

    // =============================================
    // Canvas Background Patterns
    // =============================================

    /// Set canvas background pattern type: "none", "grid", "dots", "lines", "cross"
    pub fn set_bg_pattern(&mut self, pattern: &str) {
        self.scene.canvas_background.pattern = pattern.to_string();
    }

    /// Set canvas background color (hex without #, e.g. "1a1a1a")
    pub fn set_bg_color(&mut self, hex: &str) {
        self.scene.canvas_background.bg_color = hex.to_string();
    }

    /// Set pattern color (hex without #, e.g. "ffffff")
    pub fn set_bg_pattern_color(&mut self, hex: &str) {
        self.scene.canvas_background.pattern_color = hex.to_string();
    }

    /// Set pattern spacing in scene pixels
    pub fn set_bg_spacing(&mut self, spacing: f64) {
        self.scene.canvas_background.spacing = spacing.clamp(5.0, 500.0);
    }

    /// Set pattern opacity (0.0-1.0)
    pub fn set_bg_opacity(&mut self, opacity: f64) {
        self.scene.canvas_background.opacity = opacity.clamp(0.0, 1.0);
    }

    /// Set dot size for dots pattern
    pub fn set_bg_dot_size(&mut self, size: f64) {
        self.scene.canvas_background.dot_size = size.clamp(0.5, 10.0);
    }

    /// Get canvas background settings as JSON
    pub fn get_bg_settings(&self) -> String {
        serde_json::to_string(&self.scene.canvas_background).unwrap_or_else(|_| "{}".to_string())
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

    /// Export animation clip as Lottie JSON
    #[wasm_bindgen]
    pub fn export_lottie(&self, clip_id: u64) -> String {
        lottie_export::export_lottie(&self.scene, clip_id).unwrap_or_else(|| "null".to_string())
    }

    /// Export all animation clips as Lottie JSON array
    #[wasm_bindgen]
    pub fn export_all_lottie(&self) -> String {
        lottie_export::export_all_lottie(&self.scene)
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

    /// Generate a full design theme from a single brand color hex
    #[wasm_bindgen]
    pub fn generate_design_theme(&self, brand_hex: &str) -> String {
        match color_palette::generate_design_theme(brand_hex) {
            Some(theme) => serde_json::to_string(&theme).unwrap_or_else(|_| "null".into()),
            None => "null".into(),
        }
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

    // ── Motion Path Animation ─────────────────────────────────────

    /// Set up a motion path track: node follows a Path node.
    /// Creates a MotionPath track with keyframes at 0ms (0.0) and duration_ms (1.0).
    #[wasm_bindgen]
    pub fn anim_set_motion_path(&mut self, clip_id: u64, node_id: u64, path_node_id: u64, duration_ms: u32, orient: bool, rotation_offset: f64, easing: &str) -> bool {
        let ease = parse_easing(easing);
        let config = animation::MotionPathConfig {
            path_node_id,
            orient_to_path: orient,
            rotation_offset,
        };
        // Remove existing motion path track for this node if any
        if let Some(clip) = self.scene.animations.get_clip_mut(clip_id) {
            clip.tracks.retain(|t| !(t.node_id == node_id && t.property == animation::AnimProperty::MotionPath));
            clip.tracks.push(animation::AnimationTrack {
                node_id,
                property: animation::AnimProperty::MotionPath,
                keyframes: vec![
                    animation::Keyframe { time_ms: 0, value: 0.0, easing: ease },
                    animation::Keyframe { time_ms: duration_ms, value: 1.0, easing: animation::Easing::Linear },
                ],
                motion_path: Some(config),
            });
            true
        } else { false }
    }

    /// Update motion path config on an existing track
    #[wasm_bindgen]
    pub fn anim_update_motion_path(&mut self, clip_id: u64, node_id: u64, orient: bool, rotation_offset: f64) -> bool {
        if let Some(clip) = self.scene.animations.get_clip_mut(clip_id) {
            if let Some(track) = clip.tracks.iter_mut().find(|t| t.node_id == node_id && t.property == animation::AnimProperty::MotionPath) {
                if let Some(ref mut config) = track.motion_path {
                    config.orient_to_path = orient;
                    config.rotation_offset = rotation_offset;
                    return true;
                }
            }
        }
        false
    }

    /// Remove motion path track from a clip
    #[wasm_bindgen]
    pub fn anim_remove_motion_path(&mut self, clip_id: u64, node_id: u64) -> bool {
        if let Some(clip) = self.scene.animations.get_clip_mut(clip_id) {
            let len = clip.tracks.len();
            clip.tracks.retain(|t| !(t.node_id == node_id && t.property == animation::AnimProperty::MotionPath));
            clip.tracks.len() < len
        } else { false }
    }

    /// Get motion path info for a node in a clip. Returns JSON or "null".
    #[wasm_bindgen]
    pub fn anim_get_motion_path(&self, clip_id: u64, node_id: u64) -> String {
        if let Some(clip) = self.scene.animations.get_clip(clip_id) {
            if let Some(track) = clip.tracks.iter().find(|t| t.node_id == node_id && t.property == animation::AnimProperty::MotionPath) {
                if let Some(ref config) = track.motion_path {
                    return serde_json::json!({
                        "path_node_id": config.path_node_id,
                        "orient_to_path": config.orient_to_path,
                        "rotation_offset": config.rotation_offset,
                        "keyframes": track.keyframes,
                    }).to_string();
                }
            }
        }
        "null".to_string()
    }

    /// Evaluate a motion path at a given progress (0.0–1.0).
    /// Returns JSON: { "x": f64, "y": f64, "angle": f64 } or "null" if invalid.
    #[wasm_bindgen]
    pub fn evaluate_motion_path(&self, path_node_id: u64, progress: f64) -> String {
        if let Some(path_node) = self.scene.get_node(path_node_id) {
            if let NodeKind::Path { ref points, closed } = path_node.kind {
                let total_len = crate::path_utils::path_length(points, closed);
                let dist = progress.clamp(0.0, 1.0) * total_len;
                if let Some(sample) = crate::path_utils::point_at_length(points, closed, dist) {
                    return serde_json::json!({
                        "x": sample.x,
                        "y": sample.y,
                        "angle": sample.angle.to_degrees(),
                    }).to_string();
                }
            }
        }
        "null".to_string()
    }

    /// Get motion path visualization data: sampled points along a path for canvas overlay.
    /// Returns JSON array of {x, y} points (up to 50 samples).
    #[wasm_bindgen]
    pub fn get_motion_path_samples(&self, path_node_id: u64, sample_count: u32) -> String {
        let count = (sample_count.max(2).min(100)) as usize;
        if let Some(path_node) = self.scene.get_node(path_node_id) {
            if let NodeKind::Path { ref points, closed } = path_node.kind {
                let total_len = crate::path_utils::path_length(points, closed);
                let mut samples = Vec::with_capacity(count);
                for i in 0..count {
                    let progress = i as f64 / (count - 1) as f64;
                    let dist = progress * total_len;
                    if let Some(s) = crate::path_utils::point_at_length(points, closed, dist) {
                        samples.push(serde_json::json!({"x": s.x, "y": s.y}));
                    }
                }
                return serde_json::to_string(&samples).unwrap_or_else(|_| "[]".to_string());
            }
        }
        "[]".to_string()
    }

    /// Export SVG with animateMotion elements for motion path tracks.
    /// Returns full SVG string with embedded animations.
    #[wasm_bindgen]
    pub fn export_svg_with_animations(&self, clip_id: u64) -> String {
        svg_export::export_scene_svg_with_animations(&self.scene, clip_id)
    }

    /// Get all Path nodes in the scene (for motion path picker)
    #[wasm_bindgen]
    pub fn get_path_nodes(&self) -> String {
        let paths: Vec<serde_json::Value> = self.scene.all_nodes()
            .filter(|n| matches!(n.kind, crate::node::NodeKind::Path { .. }))
            .map(|n| serde_json::json!({"id": n.id, "name": &n.name}))
            .collect();
        serde_json::to_string(&paths).unwrap_or_else(|_| "[]".to_string())
    }

    // ── Find & Replace ──────────────────────────────────────────

    /// Search nodes by text content + name. Returns JSON array of node IDs.
    #[wasm_bindgen]
    pub fn search_nodes(&self, query: &str, case_sensitive: bool) -> JsValue {
        let ids = self.scene.search_nodes(query, case_sensitive);
        let json = serde_json::to_string(&ids).unwrap_or_else(|_| "[]".to_string());
        JsValue::from_str(&json)
    }

    /// Filter nodes by object properties (kind, fill/stroke color, opacity, visibility, locked, has_text, name pattern).
    /// criteria_json: JSON object with optional fields: kinds (string[]), fill_color, stroke_color, opacity_min, opacity_max, visible, locked, has_text, name_pattern
    /// Returns JSON array of matching node IDs.
    #[wasm_bindgen]
    pub fn filter_nodes(&self, criteria_json: &str) -> String {
        let ids = self.scene.filter_nodes(criteria_json);
        serde_json::to_string(&ids).unwrap_or_else(|_| "[]".to_string())
    }

    /// Replace text in specified nodes (text content + name). Returns count of changes.
    #[wasm_bindgen]
    pub fn replace_in_nodes(&mut self, query: &str, replacement: &str, node_ids_json: &str, case_sensitive: bool) -> u32 {
        let node_ids: Vec<u64> = serde_json::from_str(node_ids_json).unwrap_or_default();
        self.push_undo();
        self.scene.replace_text_in_nodes(query, replacement, &node_ids, case_sensitive)
    }

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

    #[wasm_bindgen]
    pub fn find_by_stroke_color(&self, hex: &str) -> String {
        let results = self.scene.find_by_stroke_color(hex);
        serde_json::to_string(&results).unwrap_or_default()
    }

    #[wasm_bindgen]
    pub fn replace_stroke_color(&mut self, from_hex: &str, to_hex: &str) -> u32 {
        self.push_undo();
        self.scene.replace_stroke_color(from_hex, to_hex)
    }

    #[wasm_bindgen]
    pub fn find_by_font(&self, query: &str) -> String {
        let results = self.scene.find_by_font(query);
        serde_json::to_string(&results).unwrap_or_default()
    }

    #[wasm_bindgen]
    pub fn replace_font(&mut self, from_font: &str, to_font: &str) -> u32 {
        self.push_undo();
        self.scene.replace_font(from_font, to_font)
    }

    /// Search nodes by property criteria (JSON). Returns JSON array of matches.
    #[wasm_bindgen]
    pub fn search_by_properties(&self, criteria_json: &str) -> String {
        let criteria: crate::find_replace::PropertySearchCriteria = 
            serde_json::from_str(criteria_json).unwrap_or_default();
        let results = self.scene.search_by_properties(&criteria);
        serde_json::to_string(&results).unwrap_or_else(|_| "[]".to_string())
    }

    /// Replace properties on specific nodes (JSON node_ids array + replacement JSON). Returns modified count.
    #[wasm_bindgen]
    pub fn replace_properties(&mut self, node_ids_json: &str, replacement_json: &str) -> u32 {
        let node_ids: Vec<u64> = serde_json::from_str(node_ids_json).unwrap_or_default();
        let replacement: crate::find_replace::PropertyReplacement = 
            serde_json::from_str(replacement_json).unwrap_or_default();
        self.push_undo();
        self.scene.replace_properties(&node_ids, &replacement)
    }

    /// Search and replace properties in one call. Returns JSON {matched, modified}.
    #[wasm_bindgen]
    pub fn search_and_replace_properties(&mut self, criteria_json: &str, replacement_json: &str) -> String {
        let criteria: crate::find_replace::PropertySearchCriteria = 
            serde_json::from_str(criteria_json).unwrap_or_default();
        let replacement: crate::find_replace::PropertyReplacement = 
            serde_json::from_str(replacement_json).unwrap_or_default();
        self.push_undo();
        let (matched, modified) = self.scene.search_and_replace_properties(&criteria, &replacement);
        format!("{{\"matched\":{},\"modified\":{}}}", matched, modified)
    }

    // ── Permissions ─────────────────────────────────────────────

    #[wasm_bindgen]
    pub fn set_current_user(&mut self, user_id: &str) {
        self.current_user_id = user_id.to_string();
    }

    #[wasm_bindgen]
    pub fn get_current_user(&self) -> String {
        self.current_user_id.clone()
    }

    #[wasm_bindgen]
    pub fn perm_add_user(&mut self, user_id: &str, name: &str, role: &str) {
        self.permissions.add_user(
            user_id.to_string(),
            name.to_string(),
            permissions::Role::from_str(role),
        );
    }

    #[wasm_bindgen]
    pub fn perm_remove_user(&mut self, user_id: &str) {
        self.permissions.remove_user(user_id);
    }

    #[wasm_bindgen]
    pub fn perm_set_role(&mut self, user_id: &str, role: &str) -> bool {
        self.permissions.set_role(user_id, permissions::Role::from_str(role))
    }

    #[wasm_bindgen]
    pub fn perm_get_role(&self, user_id: &str) -> String {
        self.permissions.get_role(user_id).to_str().to_string()
    }

    #[wasm_bindgen]
    pub fn perm_get_users(&self) -> String {
        self.permissions.get_users_json()
    }

    #[wasm_bindgen]
    pub fn perm_can_edit_node(&self, node_id: u64) -> bool {
        self.permissions.can_edit_node(&self.current_user_id, node_id)
    }

    #[wasm_bindgen]
    pub fn perm_can_edit_page(&self, page_id: u64) -> bool {
        self.permissions.can_edit_page(&self.current_user_id, page_id)
    }

    #[wasm_bindgen]
    pub fn perm_lock_node(&mut self, node_id: u64, timestamp: u64) -> bool {
        self.permissions.lock_node(&self.current_user_id, node_id, timestamp)
    }

    #[wasm_bindgen]
    pub fn perm_unlock_node(&mut self, node_id: u64) -> bool {
        self.permissions.unlock_node(&self.current_user_id, node_id)
    }

    #[wasm_bindgen]
    pub fn perm_lock_page(&mut self, page_id: u64, timestamp: u64) -> bool {
        self.permissions.lock_page(&self.current_user_id, page_id, timestamp)
    }

    #[wasm_bindgen]
    pub fn perm_unlock_page(&mut self, page_id: u64) -> bool {
        self.permissions.unlock_page(&self.current_user_id, page_id)
    }

    #[wasm_bindgen]
    pub fn perm_get_locks(&self) -> String {
        self.permissions.get_locks_json()
    }

    #[wasm_bindgen]
    pub fn perm_get_node_lock(&self, node_id: u64) -> String {
        match self.permissions.get_node_lock(node_id) {
            Some(lock) => serde_json::to_string(lock).unwrap_or_default(),
            None => String::new(),
        }
    }

    #[wasm_bindgen]
    pub fn perm_get_page_lock(&self, page_id: u64) -> String {
        match self.permissions.get_page_lock(page_id) {
            Some(lock) => serde_json::to_string(lock).unwrap_or_default(),
            None => String::new(),
        }
    }

    #[wasm_bindgen]
    pub fn perm_cleanup_expired(&mut self, now: u64) {
        self.permissions.cleanup_expired(now);
    }

    /// Get component usage analytics as JSON
    #[wasm_bindgen]
    pub fn component_analytics(&self) -> String {
        self.scene.get_component_analytics(&self.components)
    }

    /// Smart component suggestions — detect repeating patterns and suggest extraction
    #[wasm_bindgen]
    pub fn suggest_components(&self) -> String {
        let suggestions = self.scene.suggest_components();
        serde_json::to_string(&suggestions).unwrap_or_else(|_| "[]".to_string())
    }

    // =============================================
    // CRDT — Operation-Level Sync
    // =============================================

    /// Set the site ID for this CRDT instance
    #[wasm_bindgen]
    pub fn set_site_id(&mut self, site_id: &str) {
        self.crdt.site_id = site_id.to_string();
    }

    /// Get the current site ID
    #[wasm_bindgen]
    pub fn get_site_id(&self) -> String {
        self.crdt.site_id.clone()
    }

    /// Get the vector clock as JSON
    #[wasm_bindgen]
    pub fn get_vector_clock(&self) -> String {
        self.crdt.clock_json()
    }

    /// Get pending (unsent) operations as JSON
    #[wasm_bindgen]
    pub fn get_pending_operations(&self) -> String {
        self.crdt.pending_json()
    }

    /// Take and return pending operations, clearing them from the queue
    #[wasm_bindgen]
    pub fn take_pending_operations(&mut self) -> String {
        let ops = self.crdt.take_pending();
        serde_json::to_string(&ops).unwrap_or_else(|_| "[]".to_string())
    }

    /// Acknowledge that specific operations have been sent (by their IDs, JSON array of strings)
    #[wasm_bindgen]
    pub fn ack_operations(&mut self, op_ids_json: &str) {
        if let Ok(ids) = serde_json::from_str::<Vec<String>>(op_ids_json) {
            self.crdt.ack_pending(&ids);
        }
    }

    /// Apply remote operations (JSON array of Operation) and return merge result as JSON
    #[wasm_bindgen]
    pub fn apply_remote_operations(&mut self, ops_json: &str) -> String {
        let ops: Vec<crdt::Operation> = match serde_json::from_str(ops_json) {
            Ok(o) => o,
            Err(e) => return format!("{{\"error\":\"{}\"}}", e),
        };

        let merge_result = self.crdt.merge_remote(ops.clone());

        // Apply the accepted operations to the actual scene
        for op in &merge_result.applied {
            self.apply_crdt_op_to_scene(op);
        }

        serde_json::to_string(&merge_result).unwrap_or_else(|_| "{}".to_string())
    }

    /// Generate a CRDT operation for adding a node (call after add_node)
    #[wasm_bindgen]
    pub fn crdt_add_node(&mut self, node_id: u64, parent_id: f64) -> String {
        let parent = if parent_id < 0.0 { None } else { Some(parent_id as u64) };
        let node_json = if let Some(node) = self.scene.get_node(node_id) {
            serde_json::to_string(node).unwrap_or_default()
        } else {
            return "{}".to_string();
        };
        let op = self.crdt.generate_op(crdt::OpKind::AddNode { node_json, parent_id: parent });
        serde_json::to_string(&op).unwrap_or_else(|_| "{}".to_string())
    }

    /// Generate a CRDT operation for removing a node
    #[wasm_bindgen]
    pub fn crdt_remove_node(&mut self, node_id: u64) -> String {
        let op = self.crdt.generate_op(crdt::OpKind::RemoveNode { node_id });
        serde_json::to_string(&op).unwrap_or_else(|_| "{}".to_string())
    }

    /// Generate a CRDT operation for updating a node property
    /// key: property name string, value_json: JSON-encoded value
    #[wasm_bindgen]
    pub fn crdt_update_property(&mut self, node_id: u64, key: &str, value_json: &str) -> String {
        let prop_key = parse_prop_key(key);
        let prop_value: crdt::PropValue = serde_json::from_str(value_json)
            .unwrap_or(crdt::PropValue::Json(value_json.to_string()));
        let op = self.crdt.generate_op(crdt::OpKind::UpdateProperty {
            node_id,
            key: prop_key,
            value: prop_value,
        });
        serde_json::to_string(&op).unwrap_or_else(|_| "{}".to_string())
    }

    /// Generate a CRDT operation for moving a node
    #[wasm_bindgen]
    pub fn crdt_move_node(&mut self, node_id: u64, x: f64, y: f64) -> String {
        let op = self.crdt.generate_op(crdt::OpKind::MoveNode { node_id, x, y });
        serde_json::to_string(&op).unwrap_or_else(|_| "{}".to_string())
    }

    /// Generate a CRDT operation for reparenting a node
    #[wasm_bindgen]
    pub fn crdt_reparent_node(&mut self, node_id: u64, new_parent_id: f64, index: f64) -> String {
        let parent = if new_parent_id < 0.0 { None } else { Some(new_parent_id as u64) };
        let idx = if index < 0.0 { None } else { Some(index as usize) };
        let op = self.crdt.generate_op(crdt::OpKind::ReparentNode {
            node_id,
            new_parent_id: parent,
            index: idx,
        });
        serde_json::to_string(&op).unwrap_or_else(|_| "{}".to_string())
    }

    /// Get CRDT state summary as JSON (for debugging)
    #[wasm_bindgen]
    pub fn get_crdt_state(&self) -> String {
        let state = serde_json::json!({
            "site_id": self.crdt.site_id,
            "clock": self.crdt.clock,
            "pending_count": self.crdt.pending_ops.len(),
            "op_log_size": self.crdt.op_log.len(),
            "tombstone_count": self.crdt.tombstones.deleted.len(),
        });
        state.to_string()
    }

    // ── Snapshot Testing ──

    /// Register a snapshot (metadata only; pixel data stored in JS)
    #[wasm_bindgen]
    pub fn snapshot_register(&mut self, id: &str, name: &str, target_type: &str, target_id: u64, width: u32, height: u32, timestamp: f64, hash: f64) {
        let tt = match target_type {
            "page" => snapshot_test::SnapshotTarget::Page,
            "frame" => snapshot_test::SnapshotTarget::Frame,
            _ => snapshot_test::SnapshotTarget::Node,
        };
        self.snapshot_store.add_snapshot(snapshot_test::Snapshot {
            id: id.to_string(),
            name: name.to_string(),
            target_type: tt,
            target_id,
            width,
            height,
            timestamp,
            hash: hash as u64,
        });
    }

    /// Remove a snapshot by id
    #[wasm_bindgen]
    pub fn snapshot_remove(&mut self, id: &str) -> bool {
        self.snapshot_store.remove_snapshot(id)
    }

    /// List all snapshots as JSON
    #[wasm_bindgen]
    pub fn snapshot_list(&self) -> String {
        serde_json::to_string(&self.snapshot_store.snapshots).unwrap_or_else(|_| "[]".to_string())
    }

    /// Get snapshots for a specific target
    #[wasm_bindgen]
    pub fn snapshot_list_for_target(&self, target_type: &str, target_id: u64) -> String {
        let tt = match target_type {
            "page" => snapshot_test::SnapshotTarget::Page,
            "frame" => snapshot_test::SnapshotTarget::Frame,
            _ => snapshot_test::SnapshotTarget::Node,
        };
        let snaps: Vec<_> = self.snapshot_store.get_snapshots_for_target(&tt, target_id);
        serde_json::to_string(&snaps).unwrap_or_else(|_| "[]".to_string())
    }

    /// Pixel-diff two RGBA buffers. Returns JSON DiffResult.
    #[wasm_bindgen]
    pub fn snapshot_diff(&self, baseline: &[u8], current: &[u8], width: u32, height: u32) -> String {
        let result = snapshot_test::pixel_diff(
            baseline, current, width, height,
            self.snapshot_store.threshold,
            self.snapshot_store.channel_tolerance,
        );
        serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string())
    }

    /// Generate a diff image (RGBA u8 array) highlighting changes in red
    #[wasm_bindgen]
    pub fn snapshot_diff_image(&self, baseline: &[u8], current: &[u8], width: u32, height: u32) -> Vec<u8> {
        snapshot_test::generate_diff_image(baseline, current, width, height, self.snapshot_store.channel_tolerance)
    }

    /// Set diff threshold (percentage 0-100)
    #[wasm_bindgen]
    pub fn snapshot_set_threshold(&mut self, threshold: f64) {
        self.snapshot_store.set_threshold(threshold);
    }

    /// Get current threshold
    #[wasm_bindgen]
    pub fn snapshot_get_threshold(&self) -> f64 {
        self.snapshot_store.threshold
    }

    /// Set channel tolerance (0-255)
    #[wasm_bindgen]
    pub fn snapshot_set_channel_tolerance(&mut self, tolerance: u8) {
        self.snapshot_store.set_channel_tolerance(tolerance);
    }

    /// Hash image data (FNV-1a) — returns as f64 for JS compat
    #[wasm_bindgen]
    pub fn snapshot_hash(&self, data: &[u8]) -> f64 {
        snapshot_test::hash_image_data(data) as f64
    }
}

/// Apply a CRDT operation to the actual scene
impl Engine {
    fn apply_crdt_op_to_scene(&mut self, op: &crdt::Operation) {
        match &op.kind {
            crdt::OpKind::AddNode { node_json, parent_id } => {
                if let Ok(node) = serde_json::from_str::<crate::node::Node>(node_json) {
                    let id = self.scene.add_node(node);
                    if let Some(pid) = parent_id {
                        self.scene.reparent(id, Some(*pid));
                    }
                }
            }
            crdt::OpKind::RemoveNode { node_id } => {
                self.scene.remove_node(*node_id);
            }
            crdt::OpKind::UpdateProperty { node_id, key, value } => {
                if let Some(node) = self.scene.get_node_mut(*node_id) {
                    apply_prop_value(node, key, value);
                }
            }
            crdt::OpKind::MoveNode { node_id, x, y } => {
                if let Some(node) = self.scene.get_node_mut(*node_id) {
                    node.x = *x;
                    node.y = *y;
                }
            }
            crdt::OpKind::ReparentNode { node_id, new_parent_id, .. } => {
                self.scene.reparent(*node_id, *new_parent_id);
            }
            crdt::OpKind::ReorderChildren { parent_id, child_ids } => {
                match parent_id {
                    None => {
                        // Reorder root children
                        let root = self.scene.get_root_children();
                        let mut new_order = Vec::new();
                        for &id in child_ids {
                            if root.contains(&id) {
                                new_order.push(id);
                            }
                        }
                        // Keep any not in child_ids at the end
                        for &id in &root {
                            if !new_order.contains(&id) {
                                new_order.push(id);
                            }
                        }
                        self.scene.root_children = new_order;
                    }
                    Some(pid) => {
                        if let Some(parent) = self.scene.get_node_mut(*pid) {
                            let mut new_order = Vec::new();
                            for &id in child_ids {
                                if parent.children.contains(&id) {
                                    new_order.push(id);
                                }
                            }
                            for &id in &parent.children.clone() {
                                if !new_order.contains(&id) {
                                    new_order.push(id);
                                }
                            }
                            parent.children = new_order;
                        }
                    }
                }
            }
            crdt::OpKind::AddPage { name, page_id: _ } => {
                self.scene.add_page(name);
            }
            crdt::OpKind::RemovePage { page_id } => {
                self.scene.remove_page(*page_id);
            }
            crdt::OpKind::RenamePage { page_id, name } => {
                self.scene.rename_page(*page_id, name);
            }
            crdt::OpKind::SetActivePage { page_id } => {
                self.scene.set_active_page(*page_id);
            }
        }
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
        "motion_path" => Some(MotionPath),
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
        MotionPath => Some(0.0), // progress, not a static property
    }
}

fn parse_prop_key(s: &str) -> crdt::PropKey {
    match s {
        "x" => crdt::PropKey::X,
        "y" => crdt::PropKey::Y,
        "width" => crdt::PropKey::Width,
        "height" => crdt::PropKey::Height,
        "rotation" => crdt::PropKey::Rotation,
        "opacity" => crdt::PropKey::Opacity,
        "visible" => crdt::PropKey::Visible,
        "locked" => crdt::PropKey::Locked,
        "name" => crdt::PropKey::Name,
        "fill" => crdt::PropKey::Fill,
        "stroke" => crdt::PropKey::Stroke,
        "corner_radius" => crdt::PropKey::CornerRadius,
        "content" => crdt::PropKey::Content,
        "font_family" => crdt::PropKey::FontFamily,
        "font_size" => crdt::PropKey::FontSize,
        "font_weight" => crdt::PropKey::FontWeight,
        "font_style" => crdt::PropKey::FontStyle,
        "text_align" => crdt::PropKey::TextAlign,
        "line_height" => crdt::PropKey::LineHeight,
        "blur" => crdt::PropKey::Blur,
        "shadows" => crdt::PropKey::Shadows,
        "blend_mode" => crdt::PropKey::BlendMode,
        "overflow" => crdt::PropKey::Overflow,
        other => crdt::PropKey::Custom(other.to_string()),
    }
}

fn apply_prop_value(node: &mut node::Node, key: &crdt::PropKey, value: &crdt::PropValue) {
    match key {
        crdt::PropKey::X => if let crdt::PropValue::F64(v) = value { node.x = *v; },
        crdt::PropKey::Y => if let crdt::PropValue::F64(v) = value { node.y = *v; },
        crdt::PropKey::Width => if let crdt::PropValue::F64(v) = value { node.width = *v; },
        crdt::PropKey::Height => if let crdt::PropValue::F64(v) = value { node.height = *v; },
        crdt::PropKey::Rotation => if let crdt::PropValue::F64(v) = value { node.rotation = *v; },
        crdt::PropKey::Opacity => if let crdt::PropValue::F64(v) = value { node.opacity = *v; },
        crdt::PropKey::Visible => if let crdt::PropValue::Bool(v) = value { node.visible = *v; },
        crdt::PropKey::Locked => if let crdt::PropValue::Bool(v) = value { node.locked = *v; },
        crdt::PropKey::Name => if let crdt::PropValue::String(v) = value { node.name = v.clone(); },
        crdt::PropKey::CornerRadius => if let crdt::PropValue::F64(v) = value { node.corner_radius = *v; },
        crdt::PropKey::Blur => if let crdt::PropValue::F64(v) = value { node.blur = *v; },
        crdt::PropKey::Content => {
            if let crdt::PropValue::String(v) = value {
                if let NodeKind::Text { ref mut content, .. } = node.kind {
                    *content = v.clone();
                }
            }
        },
        crdt::PropKey::FontFamily => {
            if let crdt::PropValue::String(v) = value {
                if let NodeKind::Text { ref mut font_family, .. } = node.kind {
                    *font_family = v.clone();
                }
            }
        },
        crdt::PropKey::FontSize => {
            if let crdt::PropValue::F64(v) = value {
                if let NodeKind::Text { ref mut font_size, .. } = node.kind {
                    *font_size = *v;
                }
            }
        },
        crdt::PropKey::Fill => {
            if let crdt::PropValue::Json(json) = value {
                if let Ok(fills) = serde_json::from_str::<Vec<node::Fill>>(json) {
                    node.fills = fills;
                }
            }
        },
        crdt::PropKey::Stroke => {
            if let crdt::PropValue::Json(json) = value {
                if let Ok(strokes) = serde_json::from_str::<Vec<node::Stroke>>(json) {
                    node.strokes = strokes;
                }
            }
        },
        crdt::PropKey::Shadows => {
            if let crdt::PropValue::Json(json) = value {
                if let Ok(shadows) = serde_json::from_str::<Vec<node::Shadow>>(json) {
                    node.shadows = shadows;
                }
            }
        },
        crdt::PropKey::BlendMode => {
            if let crdt::PropValue::String(v) = value {
                if let Ok(mode) = serde_json::from_str::<node::BlendMode>(&format!("\"{}\"", v)) {
                    node.blend_mode = mode;
                }
            }
        },
        _ => {
            // Custom or unhandled properties — ignore for now
        }
    }
}

// --- Style Override Indicator helpers (non-wasm) ---
impl Engine {
    fn compare_node_props(instance_node: &crate::node::Node, template_node: &crate::node::Node) -> Vec<String> {
        let mut overridden = Vec::new();

        // Compare fills
        if instance_node.fills != template_node.fills {
            overridden.push("fill".to_string());
        }
        // Compare strokes
        if instance_node.strokes != template_node.strokes {
            overridden.push("stroke".to_string());
        }
        // Opacity
        if (instance_node.opacity - template_node.opacity).abs() > 0.001 {
            overridden.push("opacity".to_string());
        }
        // Corner radius
        if (instance_node.corner_radius - template_node.corner_radius).abs() > 0.001 {
            overridden.push("corner_radius".to_string());
        }
        // Size
        if (instance_node.width - template_node.width).abs() > 0.1
            || (instance_node.height - template_node.height).abs() > 0.1 {
            overridden.push("size".to_string());
        }
        // Visibility
        if instance_node.visible != template_node.visible {
            overridden.push("visible".to_string());
        }
        // Blur
        if (instance_node.blur - template_node.blur).abs() > 0.001 {
            overridden.push("blur".to_string());
        }
        // Shadows
        if instance_node.shadows != template_node.shadows {
            overridden.push("shadow".to_string());
        }
        // Blend mode
        if instance_node.blend_mode != template_node.blend_mode {
            overridden.push("blend_mode".to_string());
        }
        // Text content
        if let (NodeKind::Text { content: ic, font_size: ifs, font_family: iff, font_weight: ifw, .. },
                NodeKind::Text { content: tc, font_size: tfs, font_family: tff, font_weight: tfw, .. }) =
            (&instance_node.kind, &template_node.kind) {
            if ic != tc { overridden.push("text".to_string()); }
            if (ifs - tfs).abs() > 0.1 { overridden.push("font_size".to_string()); }
            if iff != tff { overridden.push("font_family".to_string()); }
            if ifw != tfw { overridden.push("font_weight".to_string()); }
        }

        overridden
    }

    fn compare_children_recursive(
        &self,
        instance_children: &[u64],
        template_parent: &crate::node::Node,
        all_template_nodes: &[crate::node::Node],
        result: &mut Vec<serde_json::Value>,
    ) {
        for (i, &child_id) in instance_children.iter().enumerate() {
            let template_child_id = template_parent.children.get(i);
            let template_child = template_child_id.and_then(|&tid|
                all_template_nodes.iter().find(|n| n.id == tid)
            );

            if let (Some(instance_child), Some(tmpl)) = (self.scene.get_node(child_id), template_child) {
                let overrides = Self::compare_node_props(instance_child, tmpl);
                if !overrides.is_empty() {
                    result.push(serde_json::json!({
                        "node_id": child_id,
                        "node_name": instance_child.name,
                        "properties": overrides,
                    }));
                }
                // Recurse
                self.compare_children_recursive(&instance_child.children, tmpl, all_template_nodes, result);
            }
        }
    }

    fn find_template_for_child<'a>(
        &self,
        target_id: u64,
        instance_children: &[u64],
        template_parent: &'a crate::node::Node,
        all_template_nodes: &'a [crate::node::Node],
    ) -> Option<&'a crate::node::Node> {
        for (i, &child_id) in instance_children.iter().enumerate() {
            let template_child_id = template_parent.children.get(i);
            let template_child = template_child_id.and_then(|&tid|
                all_template_nodes.iter().find(|n| n.id == tid)
            );

            if child_id == target_id {
                return template_child;
            }

            if let (Some(instance_child), Some(tmpl)) = (self.scene.get_node(child_id), template_child) {
                if let Some(found) = self.find_template_for_child(target_id, &instance_child.children, tmpl, all_template_nodes) {
                    return Some(found);
                }
            }
        }
        None
    }
}

// --- Design Quiz / Interview Mode ---
#[wasm_bindgen]
impl Engine {
    /// Generate quiz questions from the current design file (seed for randomization)
    pub fn generate_quiz(&self, seed: u32) -> String {
        let questions = design_quiz::generate_quiz(&self.scene, &self.components, &self.styles, seed as u64);
        serde_json::to_string(&questions).unwrap_or_else(|_| "[]".into())
    }

    /// Generate a design review checklist
    pub fn generate_review_checklist(&self) -> String {
        let items = design_quiz::generate_review_checklist(&self.scene, &self.components, &self.styles);
        serde_json::to_string(&items).unwrap_or_else(|_| "[]".into())
    }

    // ---- Stamps ----

    pub fn add_stamp(&mut self, kind: &str, x: f64, y: f64, author: &str, page_id: u64, note: &str, timestamp: f64) -> u64 {
        self.scene.add_stamp_with_note(kind, x, y, author, page_id, note, None, timestamp)
    }

    pub fn add_stamp_on_node(&mut self, kind: &str, x: f64, y: f64, author: &str, page_id: u64, note: &str, node_id: u32, timestamp: f64) -> u64 {
        self.scene.add_stamp_with_note(kind, x, y, author, page_id, note, Some(node_id as u64), timestamp)
    }

    pub fn remove_stamp(&mut self, stamp_id: u64) -> bool {
        self.scene.remove_stamp(stamp_id)
    }

    pub fn update_stamp_position(&mut self, stamp_id: u64, x: f64, y: f64) -> bool {
        self.scene.update_stamp_position(stamp_id, x, y)
    }

    pub fn update_stamp_note(&mut self, stamp_id: u64, note: &str) -> bool {
        self.scene.update_stamp_note(stamp_id, note)
    }

    pub fn get_stamps(&self, page_id: u64) -> String {
        self.scene.get_stamps_for_page(page_id)
    }

    pub fn get_all_stamps(&self) -> String {
        self.scene.get_all_stamps()
    }

    pub fn get_stamp_count(&self) -> u32 {
        self.scene.get_stamp_count() as u32
    }

    // ── Persistent Measure Lines ────────────────────────────────

    pub fn add_measure(&mut self, start_x: f64, start_y: f64, end_x: f64, end_y: f64) -> u64 {
        self.push_undo();
        let page_id = self.scene.get_active_page_id();
        self.scene.add_measure_line(start_x, start_y, end_x, end_y, page_id)
    }

    pub fn remove_measure(&mut self, id: u64) -> bool {
        self.push_undo();
        self.scene.remove_measure_line(id)
    }

    pub fn update_measure(&mut self, id: u64, start_x: f64, start_y: f64, end_x: f64, end_y: f64) -> bool {
        self.scene.update_measure_line(id, start_x, start_y, end_x, end_y)
    }

    pub fn get_measures(&self) -> String {
        let page_id = self.scene.get_active_page_id();
        self.scene.get_measure_lines_json(page_id)
    }

    pub fn set_measure_unit(&mut self, id: u64, unit: &str) -> bool {
        self.scene.set_measure_unit(id, unit)
    }

    pub fn set_measure_label(&mut self, id: u64, label: &str) -> bool {
        self.scene.set_measure_label(id, label)
    }

    pub fn set_measure_visible(&mut self, id: u64, visible: bool) -> bool {
        self.scene.set_measure_visible(id, visible)
    }

    pub fn snap_measure_to_node(&self, node_id: u64) -> String {
        match self.scene.snap_measure_to_node(node_id) {
            Some((x1, y1, x2, y2)) => format!("{{\"x1\":{},\"y1\":{},\"x2\":{},\"y2\":{}}}", x1, y1, x2, y2),
            None => "null".to_string(),
        }
    }

    pub fn clear_measures(&mut self) -> u32 {
        self.push_undo();
        let page_id = self.scene.get_active_page_id();
        self.scene.clear_measure_lines(page_id)
    }

    // ── View Bookmarks ──────────────────────────────────────────

    pub fn add_view_bookmark(&mut self, name: &str, x: f64, y: f64, zoom: f64, description: &str, color: &str) -> u64 {
        let page_id = self.scene.get_active_page_id();
        self.scene.add_view_bookmark(name, x, y, zoom, page_id, description, color)
    }

    pub fn remove_view_bookmark(&mut self, id: u64) -> bool {
        self.scene.remove_view_bookmark(id)
    }

    pub fn update_view_bookmark(&mut self, id: u64, name: &str, description: &str, color: &str) -> bool {
        self.scene.update_view_bookmark(id, name, description, color)
    }

    pub fn get_view_bookmarks(&self) -> String {
        self.scene.get_view_bookmarks_json()
    }

    pub fn get_view_bookmarks_for_page(&self) -> String {
        let page_id = self.scene.get_active_page_id();
        self.scene.get_view_bookmarks_for_page_json(page_id)
    }

    // ── Auto Dark Mode ─────────────────────────────────────────
    /// Convert all nodes in the scene to dark mode colors.
    /// Returns the number of nodes affected.
    pub fn auto_dark_mode_all(&mut self) -> u32 {
        self.push_undo();
        self.scene.auto_dark_mode()
    }

    /// Convert selected nodes (and their descendants) to dark mode colors.
    /// Returns the number of nodes affected.
    pub fn auto_dark_mode_selection(&mut self) -> u32 {
        self.push_undo();
        self.scene.auto_dark_mode_selection()
    }

    // ── Canvas Background Pattern ──────────────────────────────

    /// Get the scene-level canvas background configuration as JSON
    pub fn get_canvas_background(&self) -> String {
        serde_json::to_string(&self.scene.canvas_background).unwrap_or_else(|_| "{}".to_string())
    }

    /// Set scene-level canvas background pattern
    pub fn set_canvas_background(&mut self, pattern: &str, bg_color: &str, pattern_color: &str, spacing: f64, opacity: f64, dot_size: f64) {
        self.scene.canvas_background.pattern = pattern.to_string();
        self.scene.canvas_background.bg_color = bg_color.to_string();
        self.scene.canvas_background.pattern_color = pattern_color.to_string();
        self.scene.canvas_background.spacing = spacing.max(5.0);
        self.scene.canvas_background.opacity = opacity.clamp(0.0, 1.0);
        self.scene.canvas_background.dot_size = dot_size.max(0.5);
    }

    /// Set only the pattern type for scene background
    pub fn set_canvas_background_pattern(&mut self, pattern: &str) {
        self.scene.canvas_background.pattern = pattern.to_string();
    }

    /// Set only the background color
    pub fn set_canvas_background_color(&mut self, color: &str) {
        self.scene.canvas_background.bg_color = color.to_string();
    }

    /// Get per-frame background pattern as JSON (null if not set)
    pub fn get_frame_background_pattern(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            if let Some(ref pat) = node.background_pattern {
                return serde_json::to_string(pat).unwrap_or_else(|_| "null".to_string());
            }
        }
        "null".to_string()
    }

    /// Set per-frame background pattern
    pub fn set_frame_background_pattern(&mut self, id: u64, pattern: &str, color: &str, spacing: f64, opacity: f64, size: f64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.background_pattern = Some(crate::node::FrameBackgroundPattern {
                pattern: pattern.to_string(),
                color: color.to_string(),
                spacing: spacing.max(5.0),
                opacity: opacity.clamp(0.0, 1.0),
                size: size.max(0.5),
                visible: true,
            });
        }
    }

    /// Remove per-frame background pattern (revert to scene-level)
    pub fn clear_frame_background_pattern(&mut self, id: u64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.background_pattern = None;
        }
    }

    /// Set per-frame background pattern visibility
    pub fn set_frame_background_pattern_visible(&mut self, id: u64, visible: bool) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let Some(ref mut pat) = node.background_pattern {
                pat.visible = visible;
            }
        }
    }

    // ── Plugin Marketplace WASM bindings ──

    /// Get all plugins in the catalog as JSON
    pub fn get_plugins(&self) -> String {
        serde_json::to_string(self.plugin_store.get_all()).unwrap_or_else(|_| "[]".into())
    }

    /// Get installed plugins as JSON
    pub fn get_installed_plugins(&self) -> String {
        let installed: Vec<_> = self.plugin_store.get_installed();
        serde_json::to_string(&installed).unwrap_or_else(|_| "[]".into())
    }

    /// Search plugins by query and optional category filter, returns JSON
    pub fn search_plugins(&self, query: &str, category: &str) -> String {
        let cat = if category.is_empty() || category == "All" { None } else { Some(category) };
        let results: Vec<_> = self.plugin_store.search(query, cat);
        serde_json::to_string(&results).unwrap_or_else(|_| "[]".into())
    }

    /// Install a plugin by id, returns true on success
    pub fn install_plugin(&mut self, id: &str) -> bool {
        self.plugin_store.install(id)
    }

    /// Uninstall a plugin by id
    pub fn uninstall_plugin(&mut self, id: &str) -> bool {
        self.plugin_store.uninstall(id)
    }

    /// Enable a plugin by id
    pub fn enable_plugin(&mut self, id: &str) -> bool {
        self.plugin_store.enable(id)
    }

    /// Disable a plugin by id
    pub fn disable_plugin(&mut self, id: &str) -> bool {
        self.plugin_store.disable(id)
    }

    // =============================================
    // Text Flow (linked text overflow)
    // =============================================

    #[wasm_bindgen]
    pub fn link_text_flow(&mut self, from_id: u64, to_id: u64) -> bool {
        self.push_undo();
        self.scene.link_text_flow(from_id, to_id)
    }

    #[wasm_bindgen]
    pub fn unlink_text_flow(&mut self, from_id: u64) {
        self.push_undo();
        self.scene.unlink_text_flow(from_id);
    }

    #[wasm_bindgen]
    pub fn get_text_flow_chain(&self, start_id: u64) -> String {
        let chain = self.scene.get_text_flow_chain(start_id);
        serde_json::to_string(&chain).unwrap_or_else(|_| "[]".to_string())
    }

    #[wasm_bindgen]
    pub fn get_text_flow_next(&self, id: u64) -> JsValue {
        match self.scene.get_node(id).and_then(|n| n.text_flow_next) {
            Some(next) => JsValue::from_f64(next as f64),
            None => JsValue::NULL,
        }
    }

    #[wasm_bindgen]
    pub fn distribute_text_flow(&mut self, start_id: u64, full_text: &str, capacities_json: &str) -> bool {
        let caps: Vec<usize> = serde_json::from_str(capacities_json).unwrap_or_default();
        self.scene.distribute_text_flow(start_id, full_text, caps);
        true
    }

    // =============================================
    // Resource Links (Dev resource linker)
    // =============================================

    /// Add an external resource link to a node. Returns the index of the new link.
    #[wasm_bindgen]
    pub fn add_resource_link(&mut self, id: u64, url: &str, label: &str, link_type: &str) -> i32 {
        if let Some(node) = self.scene.get_node_mut(id) {
            let rl = crate::node::ResourceLink {
                url: url.to_string(),
                label: label.to_string(),
                link_type: crate::node::ResourceLinkType::from_str(link_type),
            };
            node.resource_links.push(rl);
            (node.resource_links.len() - 1) as i32
        } else {
            -1
        }
    }

    /// Remove a resource link by index.
    #[wasm_bindgen]
    pub fn remove_resource_link(&mut self, id: u64, index: u32) -> bool {
        if let Some(node) = self.scene.get_node_mut(id) {
            if (index as usize) < node.resource_links.len() {
                node.resource_links.remove(index as usize);
                return true;
            }
        }
        false
    }

    /// Update a resource link at the given index.
    #[wasm_bindgen]
    pub fn update_resource_link(&mut self, id: u64, index: u32, url: &str, label: &str, link_type: &str) -> bool {
        if let Some(node) = self.scene.get_node_mut(id) {
            if let Some(rl) = node.resource_links.get_mut(index as usize) {
                rl.url = url.to_string();
                rl.label = label.to_string();
                rl.link_type = crate::node::ResourceLinkType::from_str(link_type);
                return true;
            }
        }
        false
    }

    /// Get all resource links for a node as JSON array.
    #[wasm_bindgen]
    pub fn get_resource_links(&self, id: u64) -> String {
        if let Some(node) = self.scene.get_node(id) {
            return serde_json::to_string(&node.resource_links).unwrap_or_else(|_| "[]".to_string());
        }
        "[]".to_string()
    }

    /// Get resource link count for a node.
    #[wasm_bindgen]
    pub fn get_resource_link_count(&self, id: u64) -> u32 {
        self.scene.get_node(id).map(|n| n.resource_links.len() as u32).unwrap_or(0)
    }

    // =============================================
    // Hyperlinks (external URL or internal page link)
    // =============================================

    pub fn set_hyperlink(&mut self, id: u64, url: &str) {
        if let Some(node) = self.scene.get_node_mut(id) {
            if url.is_empty() {
                node.hyperlink = None;
            } else {
                node.hyperlink = Some(url.to_string());
            }
        }
    }

    pub fn get_hyperlink(&self, id: u64) -> String {
        self.scene.get_node(id)
            .and_then(|n| n.hyperlink.as_ref())
            .cloned()
            .unwrap_or_default()
    }

    pub fn clear_hyperlink(&mut self, id: u64) {
        if let Some(node) = self.scene.get_node_mut(id) {
            node.hyperlink = None;
        }
    }

    // =============================================
    // Annotation strokes (ephemeral review drawings)
    // =============================================

    pub fn add_annotation(&mut self, color: &str, width: f64, opacity: f64, created_at: f64) -> u64 {
        self.scene.add_annotation(color, width, opacity, created_at)
    }

    pub fn annotation_add_point(&mut self, id: u64, x: f64, y: f64) {
        self.scene.annotation_add_point(id, x, y);
    }

    pub fn finish_annotation(&mut self, _id: u64) {
        // No-op on engine side; TS handles timer setup
    }

    pub fn remove_annotation(&mut self, id: u64) {
        self.scene.remove_annotation(id);
    }

    pub fn get_annotations(&self) -> String {
        self.scene.get_annotations()
    }

    pub fn clear_expired_annotations(&mut self, now_ms: f64, ttl_ms: f64) -> u32 {
        self.scene.clear_expired_annotations(now_ms, ttl_ms)
    }

}
