use std::cell::Cell;
use wasm_bindgen::JsValue;
use web_sys::CanvasRenderingContext2d;
use wasm_bindgen::JsCast;
use crate::node::{Node, NodeKind, TextSizing, TextAlign, FontStyle, PathPoint};
use crate::scene::Scene;
use crate::transform::Transform;
use crate::types::{Color, ColorSpace};

/// Axis-aligned bounding box in scene coordinates for viewport culling
#[derive(Clone, Copy)]
pub struct ViewportBounds {
    pub min_x: f64,
    pub min_y: f64,
    pub max_x: f64,
    pub max_y: f64,
}

pub struct Renderer {
    pub viewport: Transform,
    pub canvas_width: f64,
    pub canvas_height: f64,
    /// Number of nodes actually rendered in the last frame (for perf monitoring)
    pub last_rendered_count: Cell<u32>,
    /// Number of nodes culled in the last frame
    pub last_culled_count: Cell<u32>,
    current_vp: Option<ViewportBounds>,
    /// When true, skip background fill in render() (for artboard multi-page rendering)
    pub skip_background: bool,
}

impl Renderer {
    pub fn new(width: f64, height: f64) -> Self {
        Self {
            viewport: Transform::identity(),
            canvas_width: width,
            skip_background: false,
            canvas_height: height,
            last_rendered_count: Cell::new(0),
            last_culled_count: Cell::new(0),
            current_vp: None,
        }
    }

    /// Compute the visible viewport bounds in scene coordinates.
    /// Adds a margin to avoid popping at edges.
    pub fn get_viewport_bounds(&self) -> ViewportBounds {
        let zoom = self.viewport.a; // uniform scale
        if zoom <= 0.0 {
            return ViewportBounds {
                min_x: f64::NEG_INFINITY, min_y: f64::NEG_INFINITY,
                max_x: f64::INFINITY, max_y: f64::INFINITY,
            };
        }
        let inv_zoom = 1.0 / zoom;
        let margin = 100.0 * inv_zoom; // 100px margin in screen space
        let min_x = -self.viewport.tx * inv_zoom - margin;
        let min_y = -self.viewport.ty * inv_zoom - margin;
        let max_x = (self.canvas_width - self.viewport.tx) * inv_zoom + margin;
        let max_y = (self.canvas_height - self.viewport.ty) * inv_zoom + margin;
        ViewportBounds { min_x, min_y, max_x, max_y }
    }

    /// Check if a node's AABB intersects the viewport bounds.
    #[inline]
    pub fn is_node_visible_in_viewport(node: &Node, vp: &ViewportBounds) -> bool {
        // Nodes with zero or negative size are always rendered (e.g. connectors, paths)
        if node.width <= 0.0 || node.height <= 0.0 {
            return true;
        }
        node.x + node.width >= vp.min_x
            && node.x <= vp.max_x
            && node.y + node.height >= vp.min_y
            && node.y <= vp.max_y
    }

    /// Build CSS font string from text properties
    fn build_font_string(font_size: f64, font_family: &str, font_weight: u16, font_style: &FontStyle) -> String {
        let style_str = match font_style {
            FontStyle::Italic => "italic ",
            FontStyle::Normal => "",
        };
        format!("{}{} {}px {}, system-ui, sans-serif", style_str, font_weight, font_size, font_family)
    }

    /// Word-wrap text into lines fitting within max_width. If max_width is None, no wrapping.
    fn wrap_text(ctx: &CanvasRenderingContext2d, text: &str, max_width: Option<f64>) -> Vec<String> {
        let mut lines = Vec::new();
        for paragraph in text.split('\n') {
            if paragraph.is_empty() {
                lines.push(String::new());
                continue;
            }
            match max_width {
                Some(mw) if mw > 0.0 => {
                    let words: Vec<&str> = paragraph.split(' ').collect();
                    let mut current_line = String::new();
                    for word in words {
                        let test = if current_line.is_empty() {
                            word.to_string()
                        } else {
                            format!("{} {}", current_line, word)
                        };
                        if let Ok(m) = ctx.measure_text(&test) {
                            if m.width() > mw && !current_line.is_empty() {
                                lines.push(current_line);
                                current_line = word.to_string();
                            } else {
                                current_line = test;
                            }
                        } else {
                            current_line = test;
                        }
                    }
                    if !current_line.is_empty() {
                        lines.push(current_line);
                    }
                }
                _ => {
                    lines.push(paragraph.to_string());
                }
            }
        }
        if lines.is_empty() {
            lines.push(String::new());
        }
        lines
    }

    /// Measure all Fit-mode text nodes and update their dimensions
    pub fn measure_text_nodes(&self, ctx: &CanvasRenderingContext2d, scene: &mut Scene) {
        let ids: Vec<u64> = scene.all_node_ids();
        for id in ids {
            let (content, font_size, font_family, line_height, font_weight, font_style, is_fit, node_width) = {
                let node = match scene.get_node(id) {
                    Some(n) => n,
                    None => continue,
                };
                match &node.kind {
                    NodeKind::Text { content, font_size, font_family, line_height, font_weight, font_style, text_transform, .. } => {
                        (text_transform.apply(content), *font_size, font_family.clone(), *line_height, *font_weight, font_style.clone(),
                         node.text_sizing == TextSizing::Fit, node.width)
                    }
                    _ => continue,
                }
            };

            let font_str = Self::build_font_string(font_size, &font_family, font_weight, &font_style);
            ctx.set_font(&font_str);

            let max_width = if !is_fit { Some(node_width) } else { None };
            let lines = Self::wrap_text(ctx, &content, max_width);
            let line_h = font_size * line_height;

            // Use font metrics for accurate bounding box height
            let font_height = if let Ok(m) = ctx.measure_text("Mg") {
                let fa = m.font_bounding_box_ascent();
                let fd = m.font_bounding_box_descent();
                if fa > 0.0 { fa + fd } else { font_size }
            } else {
                font_size
            };
            // Line height is at least the font's natural height
            let effective_line_h = line_h.max(font_height);

            if is_fit {
                let mut max_w: f64 = 1.0;
                for line in &lines {
                    if let Ok(m) = ctx.measure_text(line) {
                        max_w = max_w.max(m.width());
                    }
                }
                let total_h = effective_line_h * lines.len() as f64;
                if let Some(node) = scene.get_node_mut(id) {
                    node.width = max_w.max(1.0);
                    node.height = total_h.max(1.0);
                }
            } else {
                // Fixed mode: update height to fit content
                let total_h = effective_line_h * lines.len() as f64;
                if let Some(node) = scene.get_node_mut(id) {
                    node.height = total_h.max(1.0);
                }
            }
        }
    }

    pub fn render(&mut self, ctx: &CanvasRenderingContext2d, scene: &Scene, _editing_node: Option<u64>) {
        self.last_rendered_count.set(0);
        self.last_culled_count.set(0);
        let vp = self.get_viewport_bounds();

        if !self.skip_background {
            let bg = &scene.canvas_background;
            let bg_css = format!("#{}", bg.bg_color);
            ctx.set_fill_style_str(&bg_css);
            ctx.fill_rect(0.0, 0.0, self.canvas_width, self.canvas_height);
            self.draw_background_pattern(ctx, bg);
        }

        ctx.save();
        ctx.transform(
            self.viewport.a, self.viewport.b,
            self.viewport.c, self.viewport.d,
            self.viewport.tx, self.viewport.ty,
        ).ok();

        self.current_vp = Some(vp);
        self.render_children(ctx, &scene.get_root_children(), scene);
        self.current_vp = None;

        // Render locked node overlays (subtle hatching + orange border)
        for &id in &scene.selection {
            if let Some(node) = scene.get_node(id) {
                if node.locked {
                    self.render_locked_overlay(ctx, node);
                }
                self.render_selection(ctx, node);
            }
        }

        // Editing text cursor indicator
        if let Some(eid) = _editing_node {
            if let Some(node) = scene.get_node(eid) {
                let lw = 1.5 / self.viewport.a;
                ctx.set_stroke_style_str("#4a4af5");
                ctx.set_line_width(lw);
                ctx.set_line_dash(&js_sys::Array::of2(&JsValue::from(4.0 / self.viewport.a), &JsValue::from(3.0 / self.viewport.a))).ok();
                ctx.stroke_rect(node.x - 2.0 / self.viewport.a, node.y - 2.0 / self.viewport.a, node.width + 4.0 / self.viewport.a, node.height + 4.0 / self.viewport.a);
                ctx.set_line_dash(&js_sys::Array::new()).ok();
            }
        }

        ctx.restore();
    }

    fn render_children(&self, ctx: &CanvasRenderingContext2d, children: &[u64], scene: &Scene) {
        let mut mask_active = false;
        for &child_id in children {
            if let Some(node) = scene.get_node(child_id) {
                if !scene.is_effectively_visible(child_id) { continue; }
                // Viewport culling: skip nodes entirely outside visible viewport
                if let Some(ref vp) = self.current_vp {
                    if !node.is_mask && !Self::is_node_visible_in_viewport(node, vp) {
                        self.last_culled_count.set(self.last_culled_count.get() + 1);
                        continue;
                    }
                }
                self.last_rendered_count.set(self.last_rendered_count.get() + 1);
                if node.is_mask {
                    if mask_active { ctx.restore(); }
                    self.render_node(ctx, node, scene);
                    ctx.save();
                    self.build_clip_path(ctx, node);
                    ctx.clip();
                    mask_active = true;
                } else {
                    self.render_node(ctx, node, scene);
                }
            }
        }
        if mask_active { ctx.restore(); }
    }

    fn build_clip_path(&self, ctx: &CanvasRenderingContext2d, node: &Node) {
        ctx.begin_path();
        match &node.kind {
            NodeKind::Rect | NodeKind::Frame | NodeKind::Section | NodeKind::Instance(_) | NodeKind::Image { .. } | NodeKind::Video { .. } => {
                if node.corner_radius > 0.0 {
                    let r = node.corner_radius.min(node.width / 2.0).min(node.height / 2.0);
                    ctx.move_to(node.x + r, node.y);
                    ctx.line_to(node.x + node.width - r, node.y);
                    ctx.arc_to(node.x + node.width, node.y, node.x + node.width, node.y + r, r).ok();
                    ctx.line_to(node.x + node.width, node.y + node.height - r);
                    ctx.arc_to(node.x + node.width, node.y + node.height, node.x + node.width - r, node.y + node.height, r).ok();
                    ctx.line_to(node.x + r, node.y + node.height);
                    ctx.arc_to(node.x, node.y + node.height, node.x, node.y + node.height - r, r).ok();
                    ctx.line_to(node.x, node.y + r);
                    ctx.arc_to(node.x, node.y, node.x + r, node.y, r).ok();
                    ctx.close_path();
                } else {
                    ctx.rect(node.x, node.y, node.width, node.height);
                }
            }
            NodeKind::Ellipse => {
                ctx.ellipse(
                    node.x + node.width / 2.0,
                    node.y + node.height / 2.0,
                    node.width / 2.0,
                    node.height / 2.0,
                    node.rotation,
                    0.0,
                    std::f64::consts::TAU,
                ).ok();
            }
            NodeKind::Path { ref points, closed } => {
                if !points.is_empty() {
                    ctx.move_to(points[0].x, points[0].y);
                    for i in 1..points.len() {
                        let prev = &points[i - 1];
                        let curr = &points[i];
                        if prev.has_handle_out() || curr.has_handle_in() {
                            ctx.bezier_curve_to(prev.handle_out_x, prev.handle_out_y, curr.handle_in_x, curr.handle_in_y, curr.x, curr.y);
                        } else {
                            ctx.line_to(curr.x, curr.y);
                        }
                    }
                    if *closed { ctx.close_path(); }
                }
            }
            NodeKind::Star { points, inner_radius } => {
                let cx = node.x + node.width / 2.0;
                let cy = node.y + node.height / 2.0;
                let rx = node.width / 2.0;
                let ry = node.height / 2.0;
                let n = (*points).max(3) as usize;
                let angle_step = std::f64::consts::TAU / (n as f64 * 2.0);
                let start_angle = -std::f64::consts::FRAC_PI_2;
                for i in 0..(n * 2) {
                    let angle = start_angle + angle_step * i as f64;
                    let (r_x, r_y) = if i % 2 == 0 { (rx, ry) } else { (rx * inner_radius, ry * inner_radius) };
                    let px = cx + angle.cos() * r_x;
                    let py = cy + angle.sin() * r_y;
                    if i == 0 { ctx.move_to(px, py); } else { ctx.line_to(px, py); }
                }
                ctx.close_path();
            }
            NodeKind::Polygon { sides } => {
                let cx = node.x + node.width / 2.0;
                let cy = node.y + node.height / 2.0;
                let rx = node.width / 2.0;
                let ry = node.height / 2.0;
                let n = (*sides).max(3) as usize;
                let angle_step = std::f64::consts::TAU / n as f64;
                let start_angle = -std::f64::consts::FRAC_PI_2;
                for i in 0..n {
                    let angle = start_angle + angle_step * i as f64;
                    let px = cx + angle.cos() * rx;
                    let py = cy + angle.sin() * ry;
                    if i == 0 { ctx.move_to(px, py); } else { ctx.line_to(px, py); }
                }
                ctx.close_path();
            }
            NodeKind::Table { .. } | NodeKind::RepeatGrid { .. } => {
                ctx.rect(node.x, node.y, node.width, node.height);
            }
            NodeKind::VectorNetwork(ref vn) => {
                // For shadow/clip purposes, draw all segments as a single path
                for seg in &vn.segments {
                    let sv = vn.get_vertex(seg.start_vertex_id);
                    let ev = vn.get_vertex(seg.end_vertex_id);
                    if let (Some(sv), Some(ev)) = (sv, ev) {
                        ctx.move_to(sv.x, sv.y);
                        match (seg.handle_start, seg.handle_end) {
                            (Some((hsx, hsy)), Some((hex, hey))) => {
                                ctx.bezier_curve_to(hsx, hsy, hex, hey, ev.x, ev.y);
                            }
                            (Some((hx, hy)), None) | (None, Some((hx, hy))) => {
                                ctx.quadratic_curve_to(hx, hy, ev.x, ev.y);
                            }
                            (None, None) => {
                                ctx.line_to(ev.x, ev.y);
                            }
                        }
                    }
                }
            }
            _ => {
                ctx.rect(node.x, node.y, node.width, node.height);
            }
        }
    }

    /// LOD level based on zoom: 0 = full, 1 = simplified (no text detail), 2 = box only
    fn lod_level(&self, node: &Node) -> u8 {
        let zoom = self.viewport.a;
        let screen_area = node.width * node.height * zoom * zoom;
        if screen_area < 16.0 {
            return 2; // Tiny on screen: just a colored box
        }
        if zoom < 0.15 {
            return 2;
        }
        if zoom < 0.35 {
            return 1; // Simplified: text becomes box, complex shapes simplified
        }
        0
    }

    /// Render a simplified LOD box for a node (solid fill rectangle)
    fn render_lod_box(&self, ctx: &CanvasRenderingContext2d, node: &Node) {
        ctx.save();
        ctx.set_global_alpha(node.opacity);
        // Use first fill color or a gray fallback
        let color = node.fills.first()
            .map(|f| f.color().to_css())
            .unwrap_or_else(|| "#cccccc".to_string());
        ctx.set_fill_style_str(&color);
        ctx.fill_rect(node.x, node.y, node.width, node.height);
        ctx.restore();
    }

    fn render_node(&self, ctx: &CanvasRenderingContext2d, node: &Node, scene: &Scene) {
        // Slice nodes are not rendered on canvas (TS draws overlay)
        if matches!(node.kind, NodeKind::Slice) { return; }

        // LOD: simplify rendering at low zoom levels
        let lod = self.lod_level(node);
        if lod >= 2 && node.width > 0.0 && node.height > 0.0 {
            self.render_lod_box(ctx, node);
            // Still render children for frames/groups at lod 2
            if matches!(node.kind, NodeKind::Frame | NodeKind::Group | NodeKind::Section) {
                ctx.save();
                ctx.set_global_alpha(node.opacity);
                self.render_children(ctx, &node.children, scene);
                ctx.restore();
            }
            return;
        }
        if lod >= 1 {
            // At lod 1, replace text nodes with simple colored boxes
            if matches!(node.kind, NodeKind::Text { .. } | NodeKind::StickyNote { .. } | NodeKind::Callout { .. }) {
                self.render_lod_box(ctx, node);
                return;
            }
        }

        ctx.save();
        ctx.set_global_alpha(node.opacity);

        // Blend mode
        if node.blend_mode != crate::node::BlendMode::Normal {
            ctx.set_global_composite_operation(node.blend_mode.to_css()).ok();
        }

        // Layer blur + bitmap filters
        {
            let mut filter_parts = Vec::new();
            if node.blur > 0.0 {
                filter_parts.push(format!("blur({}px)", node.blur));
            }
            if let Some(ref bf) = node.bitmap_filter {
                let css = bf.to_css_filter();
                if !css.is_empty() {
                    filter_parts.push(css);
                }
            }
            if !filter_parts.is_empty() {
                ctx.set_filter(&filter_parts.join(" "));
            }
        }

        // Drop shadows (outer only): render each visible shadow by drawing the node shape with shadow settings
        // Canvas API only supports one shadow at a time, so we draw multiple passes
        for shadow in &node.shadows {
            if shadow.inset || !shadow.visible || (shadow.blur == 0.0 && shadow.offset_x == 0.0 && shadow.offset_y == 0.0 && shadow.spread == 0.0) {
                continue;
            }
            ctx.save();
            ctx.set_shadow_color(&shadow.color.to_css());
            ctx.set_shadow_blur(shadow.blur + shadow.spread);
            ctx.set_shadow_offset_x(shadow.offset_x);
            ctx.set_shadow_offset_y(shadow.offset_y);
            // Draw node shape offscreen so only the shadow is visible
            // We translate far away, draw the shape, and the shadow appears at the correct position
            let far = 99999.0;
            ctx.save();
            ctx.translate(-far, 0.0).ok();
            match &node.kind {
                NodeKind::Rect | NodeKind::Frame | NodeKind::Section | NodeKind::Instance(_) | NodeKind::Image { .. } | NodeKind::Video { .. } => {
                    ctx.set_fill_style_str("rgba(0,0,0,1)");
                    if node.corner_radius > 0.0 {
                        self.draw_rounded_rect_smooth(ctx, node.x + far, node.y, node.width, node.height, node.corner_radius, node.corner_smoothing);
                    } else {
                        ctx.begin_path();
                        ctx.rect(node.x + far, node.y, node.width, node.height);
                    }
                    ctx.fill();
                }
                NodeKind::Ellipse => {
                    ctx.set_fill_style_str("rgba(0,0,0,1)");
                    ctx.begin_path();
                    ctx.ellipse(
                        node.x + far + node.width / 2.0,
                        node.y + node.height / 2.0,
                        node.width / 2.0,
                        node.height / 2.0,
                        node.rotation,
                        0.0,
                        std::f64::consts::TAU,
                    ).ok();
                    ctx.fill();
                }
                NodeKind::Path { ref points, closed } => {
                    if !points.is_empty() {
                        ctx.set_stroke_style_str("rgba(0,0,0,1)");
                        ctx.set_line_width(node.first_stroke().map(|s| s.width).unwrap_or(2.0));
                        ctx.begin_path();
                        ctx.move_to(points[0].x + far, points[0].y);
                        for i in 1..points.len() {
                            let prev = &points[i - 1];
                            let curr = &points[i];
                            if prev.has_handle_out() || curr.has_handle_in() {
                                ctx.bezier_curve_to(prev.handle_out_x + far, prev.handle_out_y, curr.handle_in_x + far, curr.handle_in_y, curr.x + far, curr.y);
                            } else {
                                ctx.line_to(curr.x + far, curr.y);
                            }
                        }
                        if *closed { ctx.close_path(); }
                        ctx.stroke();
                    }
                }
                _ => {
                    ctx.set_fill_style_str("rgba(0,0,0,1)");
                    ctx.fill_rect(node.x + far, node.y, node.width, node.height);
                }
            }
            ctx.restore();
            ctx.restore();
        }

        // Backdrop blur: clip to node shape, draw existing canvas content with blur
        if node.backdrop_blur > 0.0 && node.width > 0.0 && node.height > 0.0 {
            if let Some(canvas_el) = ctx.canvas() {
                ctx.save();
                self.build_clip_path(ctx, node);
                ctx.clip();
                ctx.set_filter(&format!("blur({}px)", node.backdrop_blur));
                // Draw the current canvas content back into the clipped+blurred region
                ctx.draw_image_with_html_canvas_element(&canvas_el, 0.0, 0.0).ok();
                ctx.set_filter("none");
                ctx.restore();
            }
        }

        match &node.kind {
            NodeKind::Rect => self.render_rect(ctx, node),
            NodeKind::Ellipse => self.render_ellipse(ctx, node),
            NodeKind::Text { content, font_size, font_family, line_height, text_align, font_weight, font_style, text_decoration, letter_spacing, paragraph_spacing, list_style, indent_level, text_transform, text_indent, .. } => self.render_text(ctx, node, scene, content, *font_size, font_family, *line_height, text_align, *font_weight, font_style, text_decoration, *letter_spacing, *paragraph_spacing, list_style, *indent_level, text_transform, *text_indent),
            NodeKind::Frame => self.render_frame(ctx, node, scene),
            NodeKind::Group => { self.render_children(ctx, &node.children, scene); }
            NodeKind::Slot { .. } => self.render_slot(ctx, node),
            NodeKind::Instance(_) => self.render_instance(ctx, node, scene),
            NodeKind::Path { ref points, closed } => self.render_path(ctx, node, points, *closed),
            NodeKind::VectorNetwork(ref vn) => self.render_vector_network(ctx, node, vn),
            NodeKind::Image { .. } => self.render_image_placeholder(ctx, node),
            NodeKind::Video { .. } => self.render_video_placeholder(ctx, node),
            NodeKind::Star { points, inner_radius } => self.render_star(ctx, node, *points, *inner_radius),
            NodeKind::Polygon { sides } => self.render_polygon(ctx, node, *sides),
            NodeKind::Section => self.render_section(ctx, node, scene),
            NodeKind::StickyNote { ref content, font_size, ref theme, ref votes } => self.render_sticky_note(ctx, node, content, *font_size, theme, votes),
            NodeKind::Table { rows, cols, ref cells, ref col_widths, ref row_heights } => {
                self.render_table(ctx, node, *rows, *cols, cells, col_widths, row_heights);
            }
            NodeKind::Slice => {} // Slice nodes are rendered as overlays in TS
            NodeKind::Connector { start_node_id, end_node_id, start_x, end_x, start_y, end_y, ref path_type, ref end_arrow, ref start_arrow, arrow_size, .. } => {
                self.render_connector(ctx, node, scene, *start_node_id, *end_node_id, *start_x, *start_y, *end_x, *end_y, path_type, end_arrow, start_arrow, *arrow_size);
            }
            NodeKind::Chart { ref chart_type, ref data, ref config } => {
                self.render_chart(ctx, node, chart_type, data, config);
            }
            NodeKind::RepeatGrid { columns, rows, column_gap, row_gap, ref overrides } => {
                self.render_repeat_grid(ctx, node, scene, *columns, *rows, *column_gap, *row_gap, overrides);
            }
            NodeKind::Callout { ref content, font_size, tail_x, tail_y, tail_width, ref theme } => {
                self.render_callout(ctx, node, content, *font_size, *tail_x, *tail_y, *tail_width, theme);
            }
        }

        // Inner (inset) shadows: clip to node shape, draw inverted shadow
        for shadow in &node.shadows {
            if !shadow.inset || !shadow.visible || (shadow.blur == 0.0 && shadow.offset_x == 0.0 && shadow.offset_y == 0.0 && shadow.spread == 0.0) {
                continue;
            }
            ctx.save();
            // Clip to node shape
            match &node.kind {
                NodeKind::Ellipse => {
                    ctx.begin_path();
                    ctx.ellipse(
                        node.x + node.width / 2.0,
                        node.y + node.height / 2.0,
                        node.width / 2.0,
                        node.height / 2.0,
                        0.0, 0.0, std::f64::consts::TAU,
                    ).ok();
                    ctx.clip();
                }
                _ => {
                    if node.corner_radius > 0.0 {
                        self.draw_rounded_rect_smooth(ctx, node.x, node.y, node.width, node.height, node.corner_radius, node.corner_smoothing);
                    } else {
                        ctx.begin_path();
                        ctx.rect(node.x, node.y, node.width, node.height);
                    }
                    ctx.clip();
                }
            }
            ctx.set_shadow_color(&shadow.color.to_css());
            ctx.set_shadow_blur(shadow.blur + shadow.spread);
            ctx.set_shadow_offset_x(shadow.offset_x);
            ctx.set_shadow_offset_y(shadow.offset_y);
            ctx.set_fill_style_str("rgba(0,0,0,1)");
            // Draw rects outside each edge — shadows cast inward through the clip
            let m = (shadow.blur + shadow.spread) * 2.0 + shadow.offset_x.abs() + shadow.offset_y.abs() + 100.0;
            ctx.fill_rect(node.x - m, node.y - m, node.width + m * 2.0, m); // top
            ctx.fill_rect(node.x - m, node.y + node.height, node.width + m * 2.0, m); // bottom
            ctx.fill_rect(node.x - m, node.y, m, node.height); // left
            ctx.fill_rect(node.x + node.width, node.y, m, node.height); // right
            ctx.restore();
        }

        ctx.restore();
    }

    fn render_rect(&self, ctx: &CanvasRenderingContext2d, node: &Node) {
        if node.rotation != 0.0 {
            ctx.save();
            ctx.translate(node.x + node.width / 2.0, node.y + node.height / 2.0).ok();
            ctx.rotate(node.rotation).ok();
            let x = -node.width / 2.0;
            let y = -node.height / 2.0;
            self.draw_rounded_rect_smooth(ctx, x, y, node.width, node.height, node.corner_radius, node.corner_smoothing);
            self.apply_fill_stroke(ctx, node);
            ctx.restore();
        } else {
            self.draw_rounded_rect_smooth(ctx, node.x, node.y, node.width, node.height, node.corner_radius, node.corner_smoothing);
            self.apply_fill_stroke(ctx, node);
        }
    }

    fn render_ellipse(&self, ctx: &CanvasRenderingContext2d, node: &Node) {
        ctx.begin_path();
        ctx.ellipse(
            node.x + node.width / 2.0,
            node.y + node.height / 2.0,
            node.width / 2.0,
            node.height / 2.0,
            node.rotation,
            0.0,
            std::f64::consts::TAU,
        ).ok();
        self.apply_fill_stroke(ctx, node);
    }

    fn render_text(&self, ctx: &CanvasRenderingContext2d, node: &Node, scene: &Scene, content: &str, font_size: f64, font_family: &str, line_height: f64, text_align: &TextAlign, font_weight: u16, font_style: &FontStyle, text_decoration: &crate::node::TextDecoration, letter_spacing: f64, paragraph_spacing: f64, list_style: &crate::node::ListStyle, indent_level: u8, text_transform: &crate::node::TextTransform, text_indent: f64) {
        // Apply text transform
        let display_content = text_transform.apply(content);
        let content = &display_content;

        // Text-on-path rendering
        if let Some(path_id) = node.text_path_id {
            if let Some(path_node) = scene.get_node(path_id) {
                if let NodeKind::Path { ref points, closed } = path_node.kind {
                    self.render_text_on_path(ctx, node, content, font_size, font_family, font_weight, font_style, points, closed);
                    return;
                }
            }
        }

        if let Some(fill) = node.visible_fills().last() {
            let fill_css = fill.color().to_css();
            ctx.set_fill_style_str(&fill_css);
            let font_str = Self::build_font_string(font_size, font_family, font_weight, font_style);
            ctx.set_font(&font_str);
            ctx.set_text_baseline("alphabetic");

            // Apply letter-spacing via canvas API
            if letter_spacing != 0.0 {
                // Use the letterSpacing property on the canvas context
                let _ = js_sys::Reflect::set(
                    ctx.as_ref(),
                    &JsValue::from_str("letterSpacing"),
                    &JsValue::from_f64(letter_spacing).into(),
                );
                // Also try the CSS format for broader compatibility
                let ls_str = format!("{}px", letter_spacing);
                let _ = js_sys::Reflect::set(
                    ctx.as_ref(),
                    &JsValue::from_str("letterSpacing"),
                    &JsValue::from_str(&ls_str),
                );
            }

            // Get font metrics for baseline positioning
            let (font_ascent, font_descent) = if let Ok(m) = ctx.measure_text("Mg") {
                let fa = m.font_bounding_box_ascent();
                let fd = m.font_bounding_box_descent();
                if fa > 0.0 { (fa, fd) } else { (font_size * 0.8, font_size * 0.2) }
            } else {
                (font_size * 0.8, font_size * 0.2)
            };
            let font_height = font_ascent + font_descent;

            let max_width = if node.text_sizing == TextSizing::Fixed { Some(node.width) } else { None };
            let lines = Self::wrap_text(ctx, content, max_width);
            let line_h = (font_size * line_height).max(font_height);
            let zoom = self.viewport.a;
            // Center font within line height
            let half_leading = (line_h - font_height) / 2.0;

            // Track paragraph breaks for paragraph_spacing
            let paragraphs: Vec<&str> = content.split('\n').collect();
            let mut para_idx = 0;
            let mut lines_in_para = 0;
            // Count expected lines per paragraph for paragraph_spacing tracking
            let mut para_line_counts: Vec<usize> = Vec::new();
            {
                let mut temp_lines_count = 0;
                for p in &paragraphs {
                    let p_lines = if p.is_empty() {
                        vec![String::new()]
                    } else {
                        Self::wrap_text(ctx, p, max_width)
                    };
                    para_line_counts.push(p_lines.len());
                    temp_lines_count += p_lines.len();
                }
                let _ = temp_lines_count;
            }

            let has_underline = matches!(text_decoration, crate::node::TextDecoration::Underline | crate::node::TextDecoration::UnderlineStrikethrough);
            let has_strikethrough = matches!(text_decoration, crate::node::TextDecoration::Strikethrough | crate::node::TextDecoration::UnderlineStrikethrough);

            let mut cumulative_extra_spacing = 0.0;

            for (i, line) in lines.iter().enumerate() {
                // Track paragraph boundaries for extra spacing
                lines_in_para += 1;
                if para_idx < para_line_counts.len() && lines_in_para > para_line_counts[para_idx] {
                    para_idx += 1;
                    lines_in_para = 1;
                    cumulative_extra_spacing += paragraph_spacing;
                }

                // Baseline = top of line + half_leading + font_ascent
                let raw_y = node.y + half_leading + font_ascent + line_h * i as f64 + cumulative_extra_spacing;
                let snapped_y = (raw_y * zoom).round() / zoom;

                // Indent offset
                let indent_px = indent_level as f64 * font_size * 1.5;
                // First-line text indent
                let first_line_indent = if i == 0 || (para_idx > 0 && lines_in_para == 1) { text_indent } else { 0.0 };

                // List prefix
                let list_prefix = match list_style {
                    crate::node::ListStyle::None => String::new(),
                    crate::node::ListStyle::Bullet => {
                        match indent_level {
                            0 => "• ".to_string(),
                            1 => "◦ ".to_string(),
                            _ => "▪ ".to_string(),
                        }
                    }
                    crate::node::ListStyle::Numbered => {
                        // Use paragraph index for numbering (1-based)
                        format!("{}. ", para_idx + 1)
                    }
                    crate::node::ListStyle::Dash => "– ".to_string(),
                    crate::node::ListStyle::Checkbox => "☐ ".to_string(),
                    crate::node::ListStyle::CheckboxChecked => "☑ ".to_string(),
                };

                // Only show prefix on first line of each paragraph
                let show_prefix = lines_in_para == 1 && *list_style != crate::node::ListStyle::None;
                let prefix_width = if show_prefix {
                    ctx.measure_text(&list_prefix).map(|m| m.width()).unwrap_or(0.0)
                } else {
                    0.0
                };

                // text_align x calculation (with indent)
                let lw = ctx.measure_text(line).map(|m| m.width()).unwrap_or(0.0);
                let total_lw = lw + if show_prefix { prefix_width } else { 0.0 };
                let x = match text_align {
                    TextAlign::Left => {
                        let raw_x = node.x + indent_px + first_line_indent;
                        (raw_x * zoom).round() / zoom
                    }
                    TextAlign::Center => {
                        let raw_x = node.x + (node.width - total_lw) / 2.0 + first_line_indent;
                        (raw_x * zoom).round() / zoom
                    }
                    TextAlign::Right => {
                        let raw_x = node.x + node.width - total_lw;
                        (raw_x * zoom).round() / zoom
                    }
                };

                // Render list prefix
                if show_prefix {
                    ctx.fill_text(&list_prefix, x, snapped_y).ok();
                    ctx.fill_text(line, x + prefix_width, snapped_y).ok();
                } else {
                    let text_x = if *list_style != crate::node::ListStyle::None && indent_level > 0 {
                        x + prefix_width.max(font_size) // hanging indent for wrapped lines
                    } else {
                        x
                    };
                    ctx.fill_text(line, text_x, snapped_y).ok();
                }

                // Draw text decorations
                if has_underline || has_strikethrough {
                    ctx.set_stroke_style_str(&fill_css);
                    let decoration_thickness = (font_size / 14.0).max(1.0);
                    ctx.set_line_width(decoration_thickness);

                    if has_underline {
                        let underline_y = snapped_y + font_descent * 0.4;
                        ctx.begin_path();
                        ctx.move_to(x, underline_y);
                        ctx.line_to(x + lw, underline_y);
                        ctx.stroke();
                    }

                    if has_strikethrough {
                        let strike_y = snapped_y - font_ascent * 0.35;
                        ctx.begin_path();
                        ctx.move_to(x, strike_y);
                        ctx.line_to(x + lw, strike_y);
                        ctx.stroke();
                    }
                }
            }

            // Reset letter-spacing
            if letter_spacing != 0.0 {
                let _ = js_sys::Reflect::set(
                    ctx.as_ref(),
                    &JsValue::from_str("letterSpacing"),
                    &JsValue::from_str("0px"),
                );
            }
        }
    }

    fn render_text_on_path(&self, ctx: &CanvasRenderingContext2d, node: &Node, content: &str, font_size: f64, font_family: &str, font_weight: u16, font_style: &FontStyle, points: &[crate::node::PathPoint], closed: bool) {
        if content.is_empty() || points.len() < 2 { return; }

        let fill_css = node.visible_fills().last()
            .map(|f| f.color().to_css())
            .unwrap_or_else(|| "rgba(0,0,0,1)".to_string());
        ctx.set_fill_style_str(&fill_css);
        let font_str = Self::build_font_string(font_size, font_family, font_weight, font_style);
        ctx.set_font(&font_str);
        ctx.set_text_baseline("alphabetic");
        ctx.set_text_align("center");

        // Measure each character width
        let chars: Vec<char> = content.chars().collect();
        let widths: Vec<f64> = chars.iter().map(|c| {
            ctx.measure_text(&c.to_string()).map(|m| m.width()).unwrap_or(font_size * 0.6)
        }).collect();

        // Get positions along path
        let samples = crate::path_utils::text_positions_on_path(points, closed, &widths, node.text_path_offset);

        // Render each character rotated along the path
        for (i, sample) in samples.iter().enumerate() {
            if i >= chars.len() { break; }
            ctx.save();
            ctx.translate(sample.x, sample.y).ok();
            ctx.rotate(sample.angle).ok();
            ctx.fill_text(&chars[i].to_string(), 0.0, -font_size * 0.15).ok();
            ctx.restore();
        }

        ctx.set_text_align("start");
    }

    fn render_frame(&self, ctx: &CanvasRenderingContext2d, node: &Node, scene: &Scene) {
        // Outside strokes: draw before fills
        for stroke in node.visible_strokes() {
            if stroke.align == crate::node::StrokeAlign::Outside {
                ctx.set_stroke_style_str(&stroke.color.to_css());
                ctx.set_line_width(stroke.width * 2.0);
                self.apply_stroke_options(ctx, stroke);
                if node.corner_radius > 0.0 {
                    self.draw_rounded_rect_smooth(ctx, node.x, node.y, node.width, node.height, node.corner_radius, node.corner_smoothing);
                    ctx.stroke();
                } else {
                    ctx.stroke_rect(node.x, node.y, node.width, node.height);
                }
                if !stroke.dash_array.is_empty() { ctx.set_line_dash(&js_sys::Array::new()).ok(); }
            }
        }

        // Render all visible fills
        for fill in node.visible_fills() {
            self.apply_single_fill_style(ctx, fill, node);
            if node.corner_radius > 0.0 {
                self.draw_rounded_rect_smooth(ctx, node.x, node.y, node.width, node.height, node.corner_radius, node.corner_smoothing);
                ctx.fill();
            } else {
                ctx.fill_rect(node.x, node.y, node.width, node.height);
            }
        }
        // Center/Inside strokes: draw after fills
        for stroke in node.visible_strokes() {
            if stroke.align != crate::node::StrokeAlign::Outside {
                ctx.set_stroke_style_str(&stroke.color.to_css());
                self.apply_stroke_options(ctx, stroke);
                let w = if stroke.align == crate::node::StrokeAlign::Inside { stroke.width * 2.0 } else { stroke.width };
                ctx.set_line_width(w);
                if stroke.align == crate::node::StrokeAlign::Inside {
                    ctx.save();
                    if node.corner_radius > 0.0 {
                        self.draw_rounded_rect_smooth(ctx, node.x, node.y, node.width, node.height, node.corner_radius, node.corner_smoothing);
                    } else {
                        ctx.begin_path();
                        ctx.rect(node.x, node.y, node.width, node.height);
                    }
                    ctx.clip();
                }
                if node.corner_radius > 0.0 {
                    self.draw_rounded_rect_smooth(ctx, node.x, node.y, node.width, node.height, node.corner_radius, node.corner_smoothing);
                    ctx.stroke();
                } else {
                    ctx.stroke_rect(node.x, node.y, node.width, node.height);
                }
                if stroke.align == crate::node::StrokeAlign::Inside {
                    ctx.restore();
                }
                if !stroke.dash_array.is_empty() { ctx.set_line_dash(&js_sys::Array::new()).ok(); }
            }
        }
        // Only show label if parent doesn't have layout (avoids clutter in nested layouts)
        let parent_has_layout = node.parent
            .and_then(|pid| scene.get_node(pid))
            .map(|p| p.layout.mode != crate::node::LayoutMode::None)
            .unwrap_or(false);
        if !parent_has_layout {
            let font_size = (11.0 / self.viewport.a).min(11.0);
            let gap = (4.0 / self.viewport.a).min(4.0);
            ctx.set_fill_style_str("rgba(255,255,255,0.5)");
            ctx.set_font(&format!("{}px Inter, system-ui, sans-serif", font_size));
            ctx.set_text_baseline("bottom");
            ctx.fill_text(&node.name, node.x, node.y - gap).ok();
        }

        // Note indicator (small yellow dot + count)
        if !node.notes.is_empty() {
            let r = (5.0 / self.viewport.a).min(5.0);
            let cx = node.x + node.width - r * 2.0;
            let cy = node.y + r * 2.0;
            ctx.begin_path();
            ctx.arc(cx, cy, r, 0.0, std::f64::consts::PI * 2.0).ok();
            ctx.set_fill_style_str("rgba(251, 191, 36, 0.9)");
            ctx.fill();
            if node.notes.len() > 1 {
                let fs = (8.0 / self.viewport.a).min(8.0);
                ctx.set_font(&format!("600 {}px Inter, system-ui, sans-serif", fs));
                ctx.set_text_baseline("middle");
                ctx.set_fill_style_str("#1a1a1a");
                ctx.fill_text(&node.notes.len().to_string(), cx - fs * 0.25, cy).ok();
            }
        }
        // Resource link indicator (small blue link dot, top-left corner)
        if !node.resource_links.is_empty() {
            let r = (5.0 / self.viewport.a).min(5.0);
            let cx = node.x + r * 2.0;
            let cy = node.y + r * 2.0;
            ctx.begin_path();
            ctx.arc(cx, cy, r, 0.0, std::f64::consts::PI * 2.0).ok();
            ctx.set_fill_style_str("rgba(59, 130, 246, 0.9)");
            ctx.fill();
            // Link icon: small chain-link lines
            let s = r * 0.55;
            ctx.set_stroke_style_str("#fff");
            ctx.set_line_width((1.0 / self.viewport.a).min(1.0));
            ctx.begin_path();
            ctx.move_to(cx - s, cy);
            ctx.line_to(cx + s, cy);
            ctx.stroke();
            if node.resource_links.len() > 1 {
                let fs = (7.0 / self.viewport.a).min(7.0);
                ctx.set_font(&format!("600 {}px Inter, system-ui, sans-serif", fs));
                ctx.set_text_baseline("middle");
                ctx.set_text_align("center");
                ctx.set_fill_style_str("#fff");
                ctx.fill_text(&node.resource_links.len().to_string(), cx, cy + r * 2.0).ok();
                ctx.set_text_align("start");
            }
        }
        // Hyperlink indicator (small green link badge, top-right corner)
        if node.hyperlink.is_some() {
            let r = (5.0 / self.viewport.a).min(5.0);
            let cx = node.x + node.width - r * 2.0;
            let cy = node.y + r * 2.0;
            ctx.begin_path();
            ctx.arc(cx, cy, r, 0.0, std::f64::consts::PI * 2.0).ok();
            ctx.set_fill_style_str("rgba(34, 197, 94, 0.9)");
            ctx.fill();
            // Small arrow icon
            let s = r * 0.45;
            ctx.set_stroke_style_str("#fff");
            ctx.set_line_width((1.0 / self.viewport.a).min(1.0));
            ctx.begin_path();
            ctx.move_to(cx - s, cy + s);
            ctx.line_to(cx + s, cy - s);
            ctx.move_to(cx, cy - s);
            ctx.line_to(cx + s, cy - s);
            ctx.line_to(cx + s, cy);
            ctx.stroke();
        }
        // Clip children for clip_content or Hidden/Scroll overflow
        let needs_clip = node.clip_content || node.overflow.clips();
        if needs_clip {
            ctx.save();
            ctx.begin_path();
            if node.corner_radius > 0.0 {
                self.draw_rounded_rect_smooth(ctx, node.x, node.y, node.width, node.height, node.corner_radius, node.corner_smoothing);
            } else {
                ctx.rect(node.x, node.y, node.width, node.height);
            }
            ctx.clip();
        }

        // Apply scroll offset for Scroll overflow
        let has_scroll = node.overflow.scrolls();
        if has_scroll {
            ctx.save();
            let tx = if node.overflow.scrolls_x() { node.scroll_x } else { 0.0 };
            let ty = if node.overflow.scrolls_y() { node.scroll_y } else { 0.0 };
            ctx.translate(tx, ty).ok();
        }

        // Render per-frame background pattern (after fills, before children)
        if let Some(ref pat) = node.background_pattern {
            if pat.visible && pat.pattern != "none" {
                self.draw_frame_bg_pattern(ctx, node, pat);
            }
        }

        // Render children hierarchically (for mask support)
        self.render_children(ctx, &node.children, scene);

        if has_scroll {
            ctx.restore();
        }

        if needs_clip {
            ctx.restore();
        }

        // Render scrollbar indicators for scrollable frames
        if has_scroll {
            self.render_scrollbars(ctx, node, scene);
        }
    }

    fn render_slot(&self, ctx: &CanvasRenderingContext2d, node: &Node) {
        // Dashed border for slot placeholder
        let lw = 1.5 / self.viewport.a;
        ctx.set_stroke_style_str("rgba(168, 85, 247, 0.5)");
        ctx.set_line_width(lw);
        let dash = 4.0 / self.viewport.a;
        ctx.set_line_dash(&js_sys::Array::of2(&JsValue::from(dash), &JsValue::from(dash))).ok();
        ctx.stroke_rect(node.x, node.y, node.width, node.height);
        ctx.set_line_dash(&js_sys::Array::new()).ok();

        // Label
        let font_size = (10.0 / self.viewport.a).min(10.0);
        ctx.set_fill_style_str("rgba(168, 85, 247, 0.6)");
        ctx.set_font(&format!("{}px Inter, system-ui, sans-serif", font_size));
        ctx.set_text_baseline("top");
        let label = if let NodeKind::Slot { ref slot_name } = node.kind { slot_name.clone() } else { "slot".to_string() };
        ctx.fill_text(&label, node.x + 4.0 / self.viewport.a, node.y + 4.0 / self.viewport.a).ok();
    }

    fn render_instance(&self, ctx: &CanvasRenderingContext2d, node: &Node, scene: &Scene) {
        // Render like a frame but with diamond badge
        for fill in node.visible_fills() {
            self.apply_single_fill_style(ctx, fill, node);
            if node.corner_radius > 0.0 {
                ctx.begin_path();
                let r = node.corner_radius.min(node.width / 2.0).min(node.height / 2.0);
                ctx.round_rect_with_f64(node.x, node.y, node.width, node.height, r).ok();
                ctx.fill();
            } else {
                ctx.fill_rect(node.x, node.y, node.width, node.height);
            }
        }
        for stroke in node.visible_strokes() {
            ctx.set_stroke_style_str(&stroke.color.to_css());
            ctx.set_line_width(stroke.width);
            self.apply_stroke_options(ctx, stroke);
            ctx.stroke_rect(node.x, node.y, node.width, node.height);
            if !stroke.dash_array.is_empty() { ctx.set_line_dash(&js_sys::Array::new()).ok(); }
        }
        // Instance label (skip if parent has layout)
        let parent_has_layout = node.parent
            .and_then(|pid| scene.get_node(pid))
            .map(|p| p.layout.mode != crate::node::LayoutMode::None)
            .unwrap_or(false);
        if !parent_has_layout {
            let font_size = (11.0 / self.viewport.a).min(11.0);
            let gap = (4.0 / self.viewport.a).min(4.0);
            ctx.set_fill_style_str("rgba(16, 185, 129, 0.7)");
            ctx.set_font(&format!("{}px Inter, system-ui, sans-serif", font_size));
            ctx.set_text_baseline("bottom");
            ctx.fill_text(&node.name, node.x, node.y - gap).ok();
        }

        if !node.notes.is_empty() {
            let r = (5.0 / self.viewport.a).min(5.0);
            let cx = node.x + node.width - r * 2.0;
            let cy = node.y + r * 2.0;
            ctx.begin_path();
            ctx.arc(cx, cy, r, 0.0, std::f64::consts::PI * 2.0).ok();
            ctx.set_fill_style_str("rgba(251, 191, 36, 0.9)");
            ctx.fill();
            if node.notes.len() > 1 {
                let fs = (8.0 / self.viewport.a).min(8.0);
                ctx.set_font(&format!("600 {}px Inter, system-ui, sans-serif", fs));
                ctx.set_text_baseline("middle");
                ctx.set_fill_style_str("#1a1a1a");
                ctx.fill_text(&node.notes.len().to_string(), cx - fs * 0.25, cy).ok();
            }
        }
        // Resource link indicator (blue dot, top-left)
        if !node.resource_links.is_empty() {
            let r = (5.0 / self.viewport.a).min(5.0);
            let cx = node.x + r * 2.0;
            let cy = node.y + r * 2.0;
            ctx.begin_path();
            ctx.arc(cx, cy, r, 0.0, std::f64::consts::PI * 2.0).ok();
            ctx.set_fill_style_str("rgba(59, 130, 246, 0.9)");
            ctx.fill();
            let s = r * 0.55;
            ctx.set_stroke_style_str("#fff");
            ctx.set_line_width((1.0 / self.viewport.a).min(1.0));
            ctx.begin_path();
            ctx.move_to(cx - s, cy);
            ctx.line_to(cx + s, cy);
            ctx.stroke();
        }
        // Render children hierarchically (for mask support)
        self.render_children(ctx, &node.children, scene);
    }

    fn render_image_placeholder(&self, ctx: &CanvasRenderingContext2d, node: &Node) {
        // Draw a light placeholder rect; actual image drawn by TS overlay
        if let Some(fill) = node.visible_fills().next() {
            ctx.set_fill_style_str(&fill.color().to_css());
        } else {
            ctx.set_fill_style_str("rgba(40,40,40,1)");
        }
        if node.corner_radius > 0.0 {
            self.draw_rounded_rect_smooth(ctx, node.x, node.y, node.width, node.height, node.corner_radius, node.corner_smoothing);
            ctx.fill();
        } else {
            ctx.fill_rect(node.x, node.y, node.width, node.height);
        }
        // Image icon placeholder (cross lines)
        let cx = node.x + node.width / 2.0;
        let cy = node.y + node.height / 2.0;
        let icon_size = (node.width.min(node.height) * 0.3).min(24.0 / self.viewport.a);
        ctx.set_stroke_style_str("rgba(255,255,255,0.2)");
        ctx.set_line_width(1.5 / self.viewport.a);
        // Mountain/image icon
        ctx.begin_path();
        ctx.move_to(cx - icon_size, cy + icon_size * 0.6);
        ctx.line_to(cx - icon_size * 0.3, cy - icon_size * 0.2);
        ctx.line_to(cx + icon_size * 0.1, cy + icon_size * 0.3);
        ctx.line_to(cx + icon_size * 0.5, cy - icon_size * 0.5);
        ctx.line_to(cx + icon_size, cy + icon_size * 0.6);
        ctx.stroke();
        // Sun circle
        ctx.begin_path();
        ctx.arc(cx - icon_size * 0.5, cy - icon_size * 0.4, icon_size * 0.2, 0.0, std::f64::consts::TAU).ok();
        ctx.stroke();

        // Frame label
        let font_size = (11.0 / self.viewport.a).min(11.0);
        let gap = (4.0 / self.viewport.a).min(4.0);
        ctx.set_fill_style_str("rgba(255,255,255,0.4)");
        ctx.set_font(&format!("{}px Inter, system-ui, sans-serif", font_size));
        ctx.set_text_baseline("bottom");
        ctx.fill_text(&node.name, node.x, node.y - gap).ok();
    }

    fn render_video_placeholder(&self, ctx: &CanvasRenderingContext2d, node: &Node) {
        // Dark placeholder rect — actual poster/video drawn by TS overlay
        ctx.set_fill_style_str("rgba(30,30,30,1)");
        if node.corner_radius > 0.0 {
            self.draw_rounded_rect_smooth(ctx, node.x, node.y, node.width, node.height, node.corner_radius, node.corner_smoothing);
            ctx.fill();
        } else {
            ctx.fill_rect(node.x, node.y, node.width, node.height);
        }
        // Play button icon (circle + triangle)
        let cx = node.x + node.width / 2.0;
        let cy = node.y + node.height / 2.0;
        let r = (node.width.min(node.height) * 0.15).min(24.0 / self.viewport.a);
        // Circle
        ctx.set_fill_style_str("rgba(255,255,255,0.25)");
        ctx.begin_path();
        ctx.arc(cx, cy, r, 0.0, std::f64::consts::TAU).ok();
        ctx.fill();
        // Triangle (play icon)
        ctx.set_fill_style_str("rgba(255,255,255,0.6)");
        ctx.begin_path();
        let tri_r = r * 0.5;
        ctx.move_to(cx - tri_r * 0.4, cy - tri_r * 0.7);
        ctx.line_to(cx + tri_r * 0.8, cy);
        ctx.line_to(cx - tri_r * 0.4, cy + tri_r * 0.7);
        ctx.close_path();
        ctx.fill();

        // Node label
        let font_size = (11.0 / self.viewport.a).min(11.0);
        let gap = (4.0 / self.viewport.a).min(4.0);
        ctx.set_fill_style_str("rgba(255,255,255,0.4)");
        ctx.set_font(&format!("{}px Inter, system-ui, sans-serif", font_size));
        ctx.set_text_baseline("bottom");
        ctx.fill_text(&node.name, node.x, node.y - gap).ok();
    }

    fn render_path(&self, ctx: &CanvasRenderingContext2d, node: &Node, points: &[PathPoint], closed: bool) {
        if points.is_empty() { return; }

        // Check for variable-width stroke
        let has_variable = points.iter().any(|p| p.stroke_width > 0.0);

        ctx.begin_path();
        ctx.move_to(points[0].x, points[0].y);
        for i in 1..points.len() {
            let prev = &points[i - 1];
            let curr = &points[i];
            if prev.has_handle_out() || curr.has_handle_in() {
                ctx.bezier_curve_to(
                    prev.handle_out_x, prev.handle_out_y,
                    curr.handle_in_x, curr.handle_in_y,
                    curr.x, curr.y,
                );
            } else {
                ctx.line_to(curr.x, curr.y);
            }
        }
        if closed && points.len() > 1 {
            let last = &points[points.len() - 1];
            let first = &points[0];
            if last.has_handle_out() || first.has_handle_in() {
                ctx.bezier_curve_to(
                    last.handle_out_x, last.handle_out_y,
                    first.handle_in_x, first.handle_in_y,
                    first.x, first.y,
                );
            } else {
                ctx.close_path();
            }
        }

        if has_variable {
            // Fill the path normally if it has fills
            for fill in node.visible_fills() {
                self.apply_single_fill_style(ctx, fill, node);
                ctx.fill();
            }
            // Render variable-width stroke as filled outline
            let default_width = node.first_stroke().map(|s| s.width).unwrap_or(2.0);
            let stroke_color = node.first_stroke().map(|s| s.color.to_css()).unwrap_or_else(|| "rgba(255,255,255,1)".to_string());
            Self::render_variable_width_stroke(ctx, points, closed, default_width, &stroke_color);
        } else {
            self.apply_fill_stroke(ctx, node);
        }
    }

    /// Render a variable-width stroke by building left/right offset curves and filling.
    fn render_variable_width_stroke(
        ctx: &CanvasRenderingContext2d,
        points: &[PathPoint],
        closed: bool,
        default_width: f64,
        stroke_color: &str,
    ) {
        if points.len() < 2 { return; }

        // 1. Flatten path to polyline with interpolated widths
        let segments_per_curve = 16;
        let mut samples: Vec<(f64, f64, f64)> = Vec::new(); // (x, y, half_width)

        // Helper: get effective width at a point
        let ew = |p: &PathPoint| -> f64 {
            if p.stroke_width > 0.0 { p.stroke_width } else { default_width }
        };

        let num_segs = if closed { points.len() } else { points.len() - 1 };
        for seg in 0..num_segs {
            let i0 = seg;
            let i1 = (seg + 1) % points.len();
            let p0 = &points[i0];
            let p1 = &points[i1];
            let w0 = ew(p0);
            let w1 = ew(p1);
            let is_curve = p0.has_handle_out() || p1.has_handle_in();
            let steps = if is_curve { segments_per_curve } else { 1 };

            for s in 0..steps {
                let t = s as f64 / steps as f64;
                let (x, y) = if is_curve {
                    cubic_bezier_point(p0.x, p0.y, p0.handle_out_x, p0.handle_out_y, p1.handle_in_x, p1.handle_in_y, p1.x, p1.y, t)
                } else {
                    (p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t)
                };
                let w = w0 + (w1 - w0) * t;
                samples.push((x, y, w / 2.0));
            }
        }
        // Add the last point
        let last_idx = if closed { 0 } else { points.len() - 1 };
        let lp = &points[last_idx];
        samples.push((lp.x, lp.y, ew(lp) / 2.0));

        if samples.len() < 2 { return; }

        // 2. Compute normals and build left/right outlines
        let n = samples.len();
        let mut left: Vec<(f64, f64)> = Vec::with_capacity(n);
        let mut right: Vec<(f64, f64)> = Vec::with_capacity(n);

        for i in 0..n {
            // Tangent by central difference
            let (tx, ty) = if i == 0 {
                (samples[1].0 - samples[0].0, samples[1].1 - samples[0].1)
            } else if i == n - 1 {
                (samples[n-1].0 - samples[n-2].0, samples[n-1].1 - samples[n-2].1)
            } else {
                (samples[i+1].0 - samples[i-1].0, samples[i+1].1 - samples[i-1].1)
            };
            let len = (tx * tx + ty * ty).sqrt().max(1e-10);
            let nx = -ty / len;
            let ny = tx / len;
            let (x, y, hw) = samples[i];
            left.push((x + nx * hw, y + ny * hw));
            right.push((x - nx * hw, y - ny * hw));
        }

        // 3. Draw filled outline
        ctx.begin_path();
        ctx.move_to(left[0].0, left[0].1);
        for i in 1..n {
            ctx.line_to(left[i].0, left[i].1);
        }
        // Connect to right side in reverse
        for i in (0..n).rev() {
            ctx.line_to(right[i].0, right[i].1);
        }
        ctx.close_path();
        ctx.set_fill_style_str(stroke_color);
        ctx.fill();
    }

    fn render_vector_network(&self, ctx: &CanvasRenderingContext2d, node: &Node, vn: &crate::vector_network::VectorNetwork) {
        // Render filled regions
        for region in &vn.regions {
            ctx.begin_path();
            let mut first = true;
            for &seg_id in &region.segment_ids {
                if let Some(seg) = vn.segments.iter().find(|s| s.id == seg_id) {
                    let sv = vn.get_vertex(seg.start_vertex_id);
                    let ev = vn.get_vertex(seg.end_vertex_id);
                    if let (Some(sv), Some(ev)) = (sv, ev) {
                        if first {
                            ctx.move_to(sv.x, sv.y);
                            first = false;
                        }
                        match (seg.handle_start, seg.handle_end) {
                            (Some((hsx, hsy)), Some((hex, hey))) => {
                                ctx.bezier_curve_to(hsx, hsy, hex, hey, ev.x, ev.y);
                            }
                            (Some((hx, hy)), None) | (None, Some((hx, hy))) => {
                                ctx.quadratic_curve_to(hx, hy, ev.x, ev.y);
                            }
                            (None, None) => {
                                ctx.line_to(ev.x, ev.y);
                            }
                        }
                    }
                }
            }
            ctx.close_path();
            // Fill the region
            for fill in node.visible_fills() {
                let css = match &fill.fill_type {
                    crate::node::FillType::Solid { color } => color.to_css(),
                    _ => "rgba(200,200,200,1)".to_string(),
                };
                ctx.set_fill_style_str(&css);
                ctx.fill();
            }
        }

        // Render all segments as strokes
        for seg in &vn.segments {
            let sv = vn.get_vertex(seg.start_vertex_id);
            let ev = vn.get_vertex(seg.end_vertex_id);
            if let (Some(sv), Some(ev)) = (sv, ev) {
                ctx.begin_path();
                ctx.move_to(sv.x, sv.y);
                match (seg.handle_start, seg.handle_end) {
                    (Some((hsx, hsy)), Some((hex, hey))) => {
                        ctx.bezier_curve_to(hsx, hsy, hex, hey, ev.x, ev.y);
                    }
                    (Some((hx, hy)), None) | (None, Some((hx, hy))) => {
                        ctx.quadratic_curve_to(hx, hy, ev.x, ev.y);
                    }
                    (None, None) => {
                        ctx.line_to(ev.x, ev.y);
                    }
                }
                for stroke in node.visible_strokes() {
                    ctx.set_stroke_style_str(&stroke.color.to_css());
                    ctx.set_line_width(stroke.width);
                    ctx.stroke();
                }
            }
        }
    }

    fn render_star(&self, ctx: &CanvasRenderingContext2d, node: &Node, points: u32, inner_radius: f64) {
        let cx = node.x + node.width / 2.0;
        let cy = node.y + node.height / 2.0;
        let rx = node.width / 2.0;
        let ry = node.height / 2.0;
        let n = points.max(3) as usize;
        let angle_step = std::f64::consts::TAU / (n as f64 * 2.0);
        let start_angle = -std::f64::consts::FRAC_PI_2; // start from top

        ctx.begin_path();
        for i in 0..(n * 2) {
            let angle = start_angle + angle_step * i as f64;
            let (r_x, r_y) = if i % 2 == 0 { (rx, ry) } else { (rx * inner_radius, ry * inner_radius) };
            let px = cx + angle.cos() * r_x;
            let py = cy + angle.sin() * r_y;
            if i == 0 { ctx.move_to(px, py); } else { ctx.line_to(px, py); }
        }
        ctx.close_path();
        self.apply_fill_stroke(ctx, node);
    }

    fn render_polygon(&self, ctx: &CanvasRenderingContext2d, node: &Node, sides: u32) {
        let cx = node.x + node.width / 2.0;
        let cy = node.y + node.height / 2.0;
        let rx = node.width / 2.0;
        let ry = node.height / 2.0;
        let n = sides.max(3) as usize;
        let angle_step = std::f64::consts::TAU / n as f64;
        let start_angle = -std::f64::consts::FRAC_PI_2;

        ctx.begin_path();
        for i in 0..n {
            let angle = start_angle + angle_step * i as f64;
            let px = cx + angle.cos() * rx;
            let py = cy + angle.sin() * ry;
            if i == 0 { ctx.move_to(px, py); } else { ctx.line_to(px, py); }
        }
        ctx.close_path();
        self.apply_fill_stroke(ctx, node);
    }

    fn render_table(&self, ctx: &CanvasRenderingContext2d, node: &Node, rows: u32, cols: u32, cells: &[crate::node::TableCell], col_widths: &[f64], row_heights: &[f64]) {
        if rows == 0 || cols == 0 { return; }

        // Compute cell positions
        let default_cw = node.width / cols as f64;
        let default_rh = node.height / rows as f64;
        let cw = |c: usize| -> f64 { col_widths.get(c).copied().unwrap_or(default_cw) };
        let rh = |r: usize| -> f64 { row_heights.get(r).copied().unwrap_or(default_rh) };

        // Cumulative positions
        let mut col_x: Vec<f64> = vec![0.0; cols as usize + 1];
        for c in 0..cols as usize { col_x[c + 1] = col_x[c] + cw(c); }
        let mut row_y: Vec<f64> = vec![0.0; rows as usize + 1];
        for r in 0..rows as usize { row_y[r + 1] = row_y[r] + rh(r); }

        // Background
        for fill in node.visible_fills() {
            self.apply_single_fill_style(ctx, fill, node);
            ctx.fill_rect(node.x, node.y, col_x[cols as usize], row_y[rows as usize]);
        }

        // Cell fills
        for cell in cells {
            if let Some(color) = &cell.fill {
                let cx = node.x + col_x.get(cell.col as usize).copied().unwrap_or(0.0);
                let cy = node.y + row_y.get(cell.row as usize).copied().unwrap_or(0.0);
                let cw_span: f64 = (cell.col..cell.col + cell.col_span).map(|c| col_widths.get(c as usize).copied().unwrap_or(default_cw)).sum();
                let ch_span: f64 = (cell.row..cell.row + cell.row_span).map(|r| row_heights.get(r as usize).copied().unwrap_or(default_rh)).sum();
                ctx.set_fill_style_str(&color.to_css());
                ctx.fill_rect(cx, cy, cw_span, ch_span);
            }
        }

        // Grid lines
        let stroke_color = node.first_stroke().map(|s| s.color.to_css()).unwrap_or_else(|| "rgba(255,255,255,0.3)".to_string());
        let stroke_width = node.first_stroke().map(|s| s.width).unwrap_or(1.0);
        ctx.set_stroke_style_str(&stroke_color);
        ctx.set_line_width(stroke_width);

        // Horizontal lines
        for r in 0..=rows as usize {
            let y = node.y + row_y[r];
            ctx.begin_path();
            ctx.move_to(node.x, y);
            ctx.line_to(node.x + col_x[cols as usize], y);
            ctx.stroke();
        }
        // Vertical lines
        for c in 0..=cols as usize {
            let x = node.x + col_x[c];
            ctx.begin_path();
            ctx.move_to(x, node.y);
            ctx.line_to(x, node.y + row_y[rows as usize]);
            ctx.stroke();
        }

        // Cell text
        let font_size = 12.0;
        ctx.set_font(&format!("{}px Inter, system-ui, sans-serif", font_size));
        ctx.set_text_baseline("middle");
        let text_color = node.visible_fills().last().map(|f| {
            let c = f.color();
            // Use contrasting text color
            if (c.r as u16 + c.g as u16 + c.b as u16) > 384 { "rgba(0,0,0,0.85)".to_string() } else { "rgba(255,255,255,0.85)".to_string() }
        }).unwrap_or_else(|| "rgba(255,255,255,0.85)".to_string());
        ctx.set_fill_style_str(&text_color);

        for cell in cells {
            if cell.content.is_empty() { continue; }
            let cx = node.x + col_x.get(cell.col as usize).copied().unwrap_or(0.0);
            let cy = node.y + row_y.get(cell.row as usize).copied().unwrap_or(0.0);
            let cw_span: f64 = (cell.col..cell.col + cell.col_span).map(|c| col_widths.get(c as usize).copied().unwrap_or(default_cw)).sum();
            let ch_span: f64 = (cell.row..cell.row + cell.row_span).map(|r| row_heights.get(r as usize).copied().unwrap_or(default_rh)).sum();
            let padding = 4.0;
            let text_x = match cell.text_align {
                crate::node::TableCellAlign::Left => { ctx.set_text_align("left"); cx + padding }
                crate::node::TableCellAlign::Center => { ctx.set_text_align("center"); cx + cw_span / 2.0 }
                crate::node::TableCellAlign::Right => { ctx.set_text_align("right"); cx + cw_span - padding }
            };
            ctx.fill_text(&cell.content, text_x, cy + ch_span / 2.0).ok();
        }
        ctx.set_text_align("start");
    }

    fn render_scrollbars(&self, ctx: &CanvasRenderingContext2d, node: &Node, scene: &Scene) {
        // Calculate content bounds from children
        let mut min_x = f64::MAX;
        let mut min_y = f64::MAX;
        let mut max_x = f64::MIN;
        let mut max_y = f64::MIN;
        for &cid in &node.children {
            if let Some(c) = scene.get_node(cid) {
                if !c.visible { continue; }
                min_x = min_x.min(c.x);
                min_y = min_y.min(c.y);
                max_x = max_x.max(c.x + c.width);
                max_y = max_y.max(c.y + c.height);
            }
        }
        if min_x >= max_x || min_y >= max_y { return; }

        let content_w = max_x - min_x;
        let content_h = max_y - min_y;
        let bar_thickness = 4.0 / self.viewport.a;
        let bar_margin = 2.0 / self.viewport.a;

        // Vertical scrollbar
        if content_h > node.height && node.overflow.scrolls_y() {
            let visible_ratio = (node.height / content_h).min(1.0);
            let scroll_ratio = (-node.scroll_y / (content_h - node.height)).clamp(0.0, 1.0);
            let track_h = node.height - bar_margin * 2.0;
            let thumb_h = (track_h * visible_ratio).max(20.0 / self.viewport.a);
            let thumb_y = node.y + bar_margin + scroll_ratio * (track_h - thumb_h);
            let thumb_x = node.x + node.width - bar_thickness - bar_margin;

            ctx.set_fill_style_str("rgba(255,255,255,0.3)");
            ctx.begin_path();
            let r = bar_thickness / 2.0;
            self.draw_rounded_rect(ctx, thumb_x, thumb_y, bar_thickness, thumb_h, r);
            ctx.fill();
        }

        // Horizontal scrollbar
        if content_w > node.width && node.overflow.scrolls_x() {
            let visible_ratio = (node.width / content_w).min(1.0);
            let scroll_ratio = (-node.scroll_x / (content_w - node.width)).clamp(0.0, 1.0);
            let track_w = node.width - bar_margin * 2.0;
            let thumb_w = (track_w * visible_ratio).max(20.0 / self.viewport.a);
            let thumb_x = node.x + bar_margin + scroll_ratio * (track_w - thumb_w);
            let thumb_y = node.y + node.height - bar_thickness - bar_margin;

            ctx.set_fill_style_str("rgba(255,255,255,0.3)");
            ctx.begin_path();
            let r = bar_thickness / 2.0;
            self.draw_rounded_rect(ctx, thumb_x, thumb_y, thumb_w, bar_thickness, r);
            ctx.fill();
        }
    }

    fn render_sticky_note(&self, ctx: &CanvasRenderingContext2d, node: &Node, content: &str, font_size: f64, theme: &str, votes: &[crate::node::StickyVote]) {
        let (bg, text_color, border) = match theme {
            "green" => ("#c6f6d5", "#1a4731", "#9ae6b4"),
            "blue" => ("#bee3f8", "#1a365d", "#90cdf4"),
            "pink" => ("#fed7e2", "#521b41", "#fbb6ce"),
            "orange" => ("#feebc8", "#652b19", "#fbd38d"),
            "purple" => ("#e9d8fd", "#322659", "#d6bcfa"),
            "gray" => ("#e2e8f0", "#1a202c", "#cbd5e0"),
            _ => ("#fefcbf", "#744210", "#f6e05e"), // yellow default
        };

        // Shadow
        ctx.save();
        ctx.set_shadow_color("rgba(0,0,0,0.15)");
        ctx.set_shadow_blur(8.0);
        ctx.set_shadow_offset_x(0.0);
        ctx.set_shadow_offset_y(2.0);

        let r = 4.0;
        // Background
        ctx.set_fill_style_str(bg);
        self.draw_rounded_rect_smooth(ctx, node.x, node.y, node.width, node.height, r, node.corner_smoothing);
        ctx.fill();
        ctx.restore();

        // Border
        ctx.set_stroke_style_str(border);
        ctx.set_line_width(1.0);
        self.draw_rounded_rect_smooth(ctx, node.x, node.y, node.width, node.height, r, node.corner_smoothing);
        ctx.stroke();

        // Folded corner
        let fold = 12.0;
        ctx.begin_path();
        ctx.move_to(node.x + node.width - fold, node.y);
        ctx.line_to(node.x + node.width, node.y + fold);
        ctx.line_to(node.x + node.width - fold, node.y + fold);
        ctx.close_path();
        ctx.set_fill_style_str(border);
        ctx.fill();

        // Text content
        let padding = 12.0;
        ctx.set_fill_style_str(text_color);
        ctx.set_font(&format!("{}px Inter, system-ui, sans-serif", font_size));
        ctx.set_text_baseline("top");

        let max_w = node.width - padding * 2.0;
        let line_h = font_size * 1.4;
        let mut y = node.y + padding;
        // Simple word wrap
        for paragraph in content.split('\n') {
            let words: Vec<&str> = paragraph.split_whitespace().collect();
            if words.is_empty() {
                y += line_h;
                continue;
            }
            let mut line = String::new();
            for word in words {
                let test = if line.is_empty() { word.to_string() } else { format!("{} {}", line, word) };
                let tw = ctx.measure_text(&test).map(|m| m.width()).unwrap_or(0.0);
                if tw > max_w && !line.is_empty() {
                    ctx.fill_text(&line, node.x + padding, y).ok();
                    y += line_h;
                    line = word.to_string();
                } else {
                    line = test;
                }
            }
            if !line.is_empty() {
                ctx.fill_text(&line, node.x + padding, y).ok();
                y += line_h;
            }
        }

        // Voting dots
        if !votes.is_empty() {
            let total: u32 = votes.iter().map(|v| v.count).sum();
            if total > 0 {
                let dot_y = node.y + node.height - 16.0;
                let dot_x = node.x + padding;
                let dot_r = 5.0;
                let colors = ["#e53e3e", "#dd6b20", "#d69e2e", "#38a169", "#3182ce", "#805ad5"];
                let mut dx = 0.0;
                for (i, vote) in votes.iter().enumerate() {
                    let color = colors[i % colors.len()];
                    for _ in 0..vote.count.min(5) {
                        ctx.begin_path();
                        ctx.arc(dot_x + dx + dot_r, dot_y, dot_r, 0.0, std::f64::consts::PI * 2.0).ok();
                        ctx.set_fill_style_str(color);
                        ctx.fill();
                        dx += dot_r * 2.5;
                    }
                }
            }
        }
    }

    fn render_section(&self, ctx: &CanvasRenderingContext2d, node: &Node, scene: &Scene) {
        let r = 8.0; // rounded corners

        // Background: use node.fills if non-empty, otherwise default
        if !node.fills.is_empty() {
            for fill in &node.fills {
                if !fill.visible { continue; }
                self.apply_single_fill_style(ctx, fill, node);
                self.draw_rounded_rect_smooth(ctx, node.x, node.y, node.width, node.height, r, node.corner_smoothing);
                ctx.fill();
            }
        } else {
            ctx.set_fill_style_str("rgba(26, 26, 46, 0.6)");
            self.draw_rounded_rect_smooth(ctx, node.x, node.y, node.width, node.height, r, node.corner_smoothing);
            ctx.fill();
        }

        // Border
        let lw = 1.0 / self.viewport.a;
        ctx.set_stroke_style_str("rgba(255,255,255,0.08)");
        ctx.set_line_width(lw);
        self.draw_rounded_rect_smooth(ctx, node.x, node.y, node.width, node.height, r, node.corner_smoothing);
        ctx.stroke();

        // Title label above the section
        let base_font_size = node.section_title_font_size.unwrap_or(14.0);
        let font_size = (base_font_size / self.viewport.a).min(base_font_size);
        let gap = (6.0 / self.viewport.a).min(6.0);
        let title_color = node.section_title_color.as_deref().unwrap_or("rgba(255,255,255,0.7)");
        ctx.set_fill_style_str(title_color);
        ctx.set_font(&format!("600 {}px Inter, system-ui, sans-serif", font_size));
        ctx.set_text_baseline("bottom");

        // Collapse/expand icon
        let icon = if node.section_collapsed { "\u{25B6} " } else { "\u{25BC} " };
        let title = format!("{}{}", icon, node.name);
        ctx.fill_text(&title, node.x, node.y - gap).ok();

        // Render children only if not collapsed
        if !node.section_collapsed {
            let needs_clip = node.clip_content || node.overflow.clips();
            if needs_clip {
                ctx.save();
                ctx.begin_path();
                self.draw_rounded_rect_smooth(ctx, node.x, node.y, node.width, node.height, r, node.corner_smoothing);
                ctx.clip();
            }
            self.render_children(ctx, &node.children, scene);
            if needs_clip {
                ctx.restore();
            }
        }
    }

    fn render_connector(&self, ctx: &CanvasRenderingContext2d, node: &Node, scene: &Scene,
        start_node_id: u64, end_node_id: u64,
        mut sx: f64, mut sy: f64, mut ex: f64, mut ey: f64,
        path_type: &str, end_arrow: &crate::node::ArrowStyle, start_arrow: &crate::node::ArrowStyle, arrow_size_mult: f64)
    {
        // Resolve endpoints from connected nodes
        if start_node_id != 0 {
            if let Some(n) = scene.get_node(start_node_id) {
                sx = n.x + n.width / 2.0;
                sy = n.y + n.height / 2.0;
            }
        }
        if end_node_id != 0 {
            if let Some(n) = scene.get_node(end_node_id) {
                ex = n.x + n.width / 2.0;
                ey = n.y + n.height / 2.0;
            }
        }

        // Clip to node edge if connected
        if start_node_id != 0 {
            if let Some(n) = scene.get_node(start_node_id) {
                let (cx, cy) = Self::clip_to_rect(sx, sy, ex, ey, n.x, n.y, n.width, n.height);
                sx = cx; sy = cy;
            }
        }
        if end_node_id != 0 {
            if let Some(n) = scene.get_node(end_node_id) {
                let (cx, cy) = Self::clip_to_rect(ex, ey, sx, sy, n.x, n.y, n.width, n.height);
                ex = cx; ey = cy;
            }
        }

        let stroke_color = node.first_stroke()
            .map(|s| s.color.to_css())
            .unwrap_or_else(|| "rgba(255,255,255,0.8)".to_string());
        let stroke_width = node.first_stroke().map(|s| s.width).unwrap_or(2.0);

        ctx.set_stroke_style_str(&stroke_color);
        ctx.set_line_width(stroke_width);
        ctx.set_line_cap("round");
        ctx.set_line_join("round");

        // Apply dash if set
        if let Some(ref stroke) = node.first_stroke() {
            if !stroke.dash_array.is_empty() {
                let arr = js_sys::Array::new();
                for &v in &stroke.dash_array { arr.push(&JsValue::from(v)); }
                ctx.set_line_dash(&arr).ok();
                ctx.set_line_dash_offset(stroke.dash_offset);
            }
        }

        ctx.begin_path();
        ctx.move_to(sx, sy);

        if path_type == "curved" {
            let dx = ex - sx;
            let dy = ey - sy;
            // Use a cubic bezier with control points offset perpendicular
            let cx1 = sx + dx * 0.5;
            let cy1 = sy;
            let cx2 = sx + dx * 0.5;
            let cy2 = ey;
            ctx.bezier_curve_to(cx1, cy1, cx2, cy2, ex, ey);
        } else {
            ctx.line_to(ex, ey);
        }
        ctx.stroke();

        // Reset dash
        ctx.set_line_dash(&js_sys::Array::new()).ok();

        // Arrowheads
        let arrow_size = (stroke_width * 4.0).max(8.0) * arrow_size_mult;
        if end_arrow.is_visible() {
            let angle = if path_type == "curved" {
                let cx2 = sx + (ex - sx) * 0.5;
                let cy2 = ey;
                (ey - cy2).atan2(ex - cx2)
            } else {
                (ey - sy).atan2(ex - sx)
            };
            self.draw_arrowhead_styled(ctx, ex, ey, angle, arrow_size, &stroke_color, end_arrow, stroke_width);
        }
        if start_arrow.is_visible() {
            let angle = if path_type == "curved" {
                let cx1 = sx + (ex - sx) * 0.5;
                let cy1 = sy;
                (sy - cy1).atan2(sx - cx1)
            } else {
                (sy - ey).atan2(sx - ex)
            };
            self.draw_arrowhead_styled(ctx, sx, sy, angle, arrow_size, &stroke_color, start_arrow, stroke_width);
        }
    }

    fn draw_arrowhead_styled(&self, ctx: &CanvasRenderingContext2d, x: f64, y: f64, angle: f64, size: f64, color: &str, style: &crate::node::ArrowStyle, stroke_width: f64) {
        use crate::node::ArrowStyle;
        match style {
            ArrowStyle::None => {},
            ArrowStyle::Arrow => {
                // Filled triangle
                let a1 = angle - std::f64::consts::FRAC_PI_6;
                let a2 = angle + std::f64::consts::FRAC_PI_6;
                ctx.begin_path();
                ctx.move_to(x - size * a1.cos(), y - size * a1.sin());
                ctx.line_to(x, y);
                ctx.line_to(x - size * a2.cos(), y - size * a2.sin());
                ctx.close_path();
                ctx.set_fill_style_str(color);
                ctx.fill();
            },
            ArrowStyle::OpenArrow => {
                // Open V shape (no fill, just stroke)
                let a1 = angle - std::f64::consts::FRAC_PI_6;
                let a2 = angle + std::f64::consts::FRAC_PI_6;
                ctx.begin_path();
                ctx.move_to(x - size * a1.cos(), y - size * a1.sin());
                ctx.line_to(x, y);
                ctx.line_to(x - size * a2.cos(), y - size * a2.sin());
                ctx.set_stroke_style_str(color);
                ctx.set_line_width(stroke_width);
                ctx.stroke();
            },
            ArrowStyle::Diamond => {
                // Rotated square (diamond)
                let hs = size * 0.5;
                ctx.begin_path();
                ctx.move_to(x + hs * angle.cos(), y + hs * angle.sin());
                ctx.line_to(x + hs * (angle + std::f64::consts::FRAC_PI_2).cos(), y + hs * (angle + std::f64::consts::FRAC_PI_2).sin());
                ctx.line_to(x - hs * angle.cos(), y - hs * angle.sin());
                ctx.line_to(x + hs * (angle - std::f64::consts::FRAC_PI_2).cos(), y + hs * (angle - std::f64::consts::FRAC_PI_2).sin());
                ctx.close_path();
                ctx.set_fill_style_str(color);
                ctx.fill();
            },
            ArrowStyle::Circle => {
                let r = size * 0.35;
                ctx.begin_path();
                ctx.arc(x, y, r, 0.0, std::f64::consts::TAU).ok();
                ctx.set_fill_style_str(color);
                ctx.fill();
            },
            ArrowStyle::Square => {
                let hs = size * 0.35;
                // Axis-aligned square centered at (x,y)
                ctx.begin_path();
                let cos_a = angle.cos();
                let sin_a = angle.sin();
                // Rotated square
                for i in 0..4 {
                    let corner_angle = angle + std::f64::consts::FRAC_PI_4 + (i as f64) * std::f64::consts::FRAC_PI_2;
                    let cx = x + hs * 1.414 * corner_angle.cos();
                    let cy = y + hs * 1.414 * corner_angle.sin();
                    if i == 0 { ctx.move_to(cx, cy); } else { ctx.line_to(cx, cy); }
                }
                ctx.close_path();
                ctx.set_fill_style_str(color);
                ctx.fill();
            },
        }
    }

    /// Clip a line from center to target through a rectangle edge
    fn clip_to_rect(cx: f64, cy: f64, tx: f64, ty: f64, rx: f64, ry: f64, rw: f64, rh: f64) -> (f64, f64) {
        let dx = tx - cx;
        let dy = ty - cy;
        if dx.abs() < 0.001 && dy.abs() < 0.001 { return (cx, cy); }

        let hw = rw / 2.0;
        let hh = rh / 2.0;
        let mut t = f64::INFINITY;

        // Check each edge
        if dx.abs() > 0.001 {
            let t1 = hw / dx.abs();
            if t1 > 0.0 { t = t.min(t1); }
        }
        if dy.abs() > 0.001 {
            let t2 = hh / dy.abs();
            if t2 > 0.0 { t = t.min(t2); }
        }
        if t == f64::INFINITY { return (cx, cy); }
        (cx + dx * t, cy + dy * t)
    }

    fn apply_repeat_grid_overrides(&self, mut node: Node, row: u32, col: u32, path: &str, overrides: &std::collections::HashMap<String, String>) -> Node {
        let prefix = format!("{},{}:{}:", row, col, path);
        for (key, value) in overrides.iter() {
            if !key.starts_with(&prefix) { continue; }
            let field = &key[prefix.len()..];
            match (&mut node.kind, field) {
                (NodeKind::Text { content, .. }, "text") | (NodeKind::Text { content, .. }, "text_content") => {
                    *content = value.clone();
                }
                (NodeKind::Image { src, .. }, "src") => {
                    *src = value.clone();
                }
                (NodeKind::Video { src, .. }, "src") => {
                    *src = value.clone();
                }
                _ => {}
            }
        }
        node
    }

    fn render_repeat_grid_node(&self, ctx: &CanvasRenderingContext2d, scene: &Scene, node_id: u64, row: u32, col: u32, path: &str, overrides: &std::collections::HashMap<String, String>) {
        let node = match scene.get_node(node_id) {
            Some(n) => n.clone(),
            None => return,
        };
        let rendered = self.apply_repeat_grid_overrides(node, row, col, path, overrides);
        self.render_node(ctx, &rendered, scene);
        for (idx, child_id) in rendered.children.iter().enumerate() {
            let child_path = format!("{}/{}", path, idx);
            self.render_repeat_grid_node(ctx, scene, *child_id, row, col, &child_path, overrides);
        }
    }

    fn render_repeat_grid(&self, ctx: &CanvasRenderingContext2d, node: &Node, scene: &Scene, columns: u32, rows: u32, column_gap: f64, row_gap: f64, overrides: &std::collections::HashMap<String, String>) {
        // RepeatGrid renders by drawing the first child (master cell) at each grid position.
        if node.children.is_empty() { return; }
        let master_id = node.children[0];
        let master = match scene.get_node(master_id) {
            Some(m) => m,
            None => return,
        };
        let cell_w = master.width;
        let cell_h = master.height;
        let base_x = node.x;
        let base_y = node.y;

        for r in 0..rows {
            for c in 0..columns {
                let offset_x = c as f64 * (cell_w + column_gap);
                let offset_y = r as f64 * (cell_h + row_gap);
                ctx.save();
                ctx.translate(offset_x + base_x - master.x, offset_y + base_y - master.y).ok();
                self.render_repeat_grid_node(ctx, scene, master_id, r, c, "0", overrides);
                ctx.restore();
            }
        }
    }

    fn render_callout(&self, ctx: &CanvasRenderingContext2d, node: &Node, content: &str, font_size: f64, tail_x: f64, tail_y: f64, tail_width: f64, theme: &str) {
        let x = node.x;
        let y = node.y;
        let w = node.width;
        let h = node.height;
        let r = node.corner_radius.min(w / 2.0).min(h / 2.0);

        // Theme colors
        let (bg_color, border_color, text_color) = match theme {
            "yellow" => ("#FFF9C4", "#F9A825", "#5D4037"),
            "red"    => ("#FFCDD2", "#E53935", "#B71C1C"),
            "green"  => ("#C8E6C9", "#43A047", "#1B5E20"),
            "gray"   => ("#F5F5F5", "#9E9E9E", "#424242"),
            _        => ("#BBDEFB", "#1E88E5", "#0D47A1"), // blue default
        };

        // Determine tail base: find closest edge center to tail point
        let cx = x + w / 2.0;
        let cy = y + h / 2.0;
        let hw = tail_width / 2.0;

        // Tail direction from body center to tail tip
        let dx = tail_x - cx;
        let dy = tail_y - cy;

        // Calculate base point on body edge
        let (base_x, base_y, perp_x, perp_y) = if dx.abs() / w > dy.abs() / h {
            // Tail exits from left or right
            if dx > 0.0 {
                (x + w, cy.max(y + r).min(y + h - r), 0.0, 1.0)
            } else {
                (x, cy.max(y + r).min(y + h - r), 0.0, 1.0)
            }
        } else {
            // Tail exits from top or bottom
            if dy > 0.0 {
                (cx.max(x + r).min(x + w - r), y + h, 1.0, 0.0)
            } else {
                (cx.max(x + r).min(x + w - r), y, 1.0, 0.0)
            }
        };

        // Draw body (rounded rect) + tail
        ctx.begin_path();
        // Rounded rect body
        self.draw_rounded_rect(ctx, x, y, w, h, r);

        // Draw tail as separate triangle
        ctx.move_to(base_x - perp_x * hw, base_y - perp_y * hw);
        ctx.line_to(tail_x, tail_y);
        ctx.line_to(base_x + perp_x * hw, base_y + perp_y * hw);
        ctx.close_path();

        // Fill
        if node.visible_fills().count() > 0 {
            self.apply_fill_stroke(ctx, node);
        } else {
            ctx.set_fill_style_str(bg_color);
            ctx.fill();
            ctx.set_stroke_style_str(border_color);
            ctx.set_line_width(1.5);
            // Stroke the body
            self.draw_rounded_rect(ctx, x, y, w, h, r);
            ctx.stroke();
            // Stroke the tail
            ctx.begin_path();
            ctx.move_to(base_x - perp_x * hw, base_y - perp_y * hw);
            ctx.line_to(tail_x, tail_y);
            ctx.line_to(base_x + perp_x * hw, base_y + perp_y * hw);
            ctx.stroke();
        }

        // Render text content
        if !content.is_empty() {
            let fill_css = if node.visible_fills().count() > 0 {
                node.visible_fills().last().map(|f| f.color().to_css()).unwrap_or_else(|| text_color.to_string())
            } else {
                text_color.to_string()
            };
            // Use node fill for text color, or theme text color
            let actual_text_color = if node.visible_fills().count() > 0 { text_color.to_string() } else { text_color.to_string() };
            ctx.set_fill_style_str(&actual_text_color);
            let font_str = format!("{}px Inter, system-ui, sans-serif", font_size);
            ctx.set_font(&font_str);
            ctx.set_text_baseline("top");

            let padding = 8.0;
            let max_w = w - padding * 2.0;
            // Simple word wrap
            let words: Vec<&str> = content.split_whitespace().collect();
            let line_h = font_size * 1.4;
            let mut lines: Vec<String> = vec![];
            let mut current_line = String::new();

            for word in &words {
                let test = if current_line.is_empty() {
                    word.to_string()
                } else {
                    format!("{} {}", current_line, word)
                };
                let metrics = ctx.measure_text(&test).unwrap();
                if metrics.width() > max_w && !current_line.is_empty() {
                    lines.push(current_line);
                    current_line = word.to_string();
                } else {
                    current_line = test;
                }
            }
            if !current_line.is_empty() { lines.push(current_line); }

            for (i, line) in lines.iter().enumerate() {
                ctx.fill_text(line, x + padding, y + padding + i as f64 * line_h).ok();
            }
        }
    }

    fn render_chart(&self, ctx: &CanvasRenderingContext2d, node: &Node, chart_type: &crate::node::ChartType, data: &[crate::node::ChartDataPoint], config: &crate::node::ChartConfig) {
        use crate::node::ChartType;
        let x = node.x;
        let y = node.y;
        let w = node.width;
        let h = node.height;

        // Background
        ctx.set_fill_style_str("rgba(30,30,30,0.9)");
        self.draw_rounded_rect(ctx, x, y, w, h, 8.0);
        ctx.fill();

        // Border
        ctx.set_stroke_style_str("rgba(255,255,255,0.1)");
        ctx.set_line_width(1.0);
        self.draw_rounded_rect(ctx, x, y, w, h, 8.0);
        ctx.stroke();

        if data.is_empty() {
            let fs = (14.0 / self.viewport.a).min(14.0);
            ctx.set_fill_style_str("rgba(255,255,255,0.3)");
            ctx.set_font(&format!("{}px Inter, system-ui, sans-serif", fs));
            ctx.set_text_baseline("middle");
            ctx.set_text_align("center");
            ctx.fill_text("No data", x + w / 2.0, y + h / 2.0).ok();
            ctx.set_text_align("start");
            return;
        }

        let padding = 16.0;
        let title_h = if config.title.is_empty() { 0.0 } else { 24.0 };
        let legend_h = if config.show_legend { 24.0 } else { 0.0 };
        let chart_x = x + padding;
        let chart_y = y + padding + title_h;
        let chart_w = w - padding * 2.0;
        let chart_h = h - padding * 2.0 - title_h - legend_h;

        // Title
        if !config.title.is_empty() {
            let fs = 13.0;
            ctx.set_fill_style_str("rgba(255,255,255,0.9)");
            ctx.set_font(&format!("600 {}px Inter, system-ui, sans-serif", fs));
            ctx.set_text_baseline("top");
            ctx.set_text_align("left");
            ctx.fill_text(&config.title, x + padding, y + padding).ok();
        }

        let max_val = data.iter().map(|d| d.value).fold(f64::NEG_INFINITY, f64::max).max(0.001);

        match chart_type {
            ChartType::Bar => {
                let gap = 4.0;
                let bar_w = ((chart_w - gap * (data.len() as f64 - 1.0).max(0.0)) / data.len() as f64).max(2.0);
                for (i, dp) in data.iter().enumerate() {
                    let color = config.color_for(i, &dp.color);
                    let bar_h = (dp.value / max_val) * chart_h;
                    let bx = chart_x + i as f64 * (bar_w + gap);
                    let by = chart_y + chart_h - bar_h;
                    ctx.set_fill_style_str(&color);
                    ctx.begin_path();
                    ctx.round_rect_with_f64(bx, by, bar_w, bar_h, 3.0).ok();
                    ctx.fill();
                    if config.show_labels {
                        let fs = 9.0;
                        ctx.set_fill_style_str("rgba(255,255,255,0.6)");
                        ctx.set_font(&format!("{}px Inter, system-ui, sans-serif", fs));
                        ctx.set_text_baseline("top");
                        ctx.set_text_align("center");
                        ctx.fill_text(&dp.label, bx + bar_w / 2.0, chart_y + chart_h + 3.0).ok();
                    }
                }
            }
            ChartType::Line | ChartType::Area => {
                let step = if data.len() > 1 { chart_w / (data.len() - 1) as f64 } else { chart_w };
                if *chart_type == ChartType::Area {
                    ctx.begin_path();
                    ctx.move_to(chart_x, chart_y + chart_h);
                    for (i, dp) in data.iter().enumerate() {
                        let px = chart_x + i as f64 * step;
                        let py = chart_y + chart_h - (dp.value / max_val) * chart_h;
                        ctx.line_to(px, py);
                    }
                    ctx.line_to(chart_x + (data.len() - 1) as f64 * step, chart_y + chart_h);
                    ctx.close_path();
                    let color = config.color_for(0, &None);
                    // Parse hex to rgba for transparency
                    ctx.set_fill_style_str(&format!("{}40", color));
                    ctx.fill();
                }
                // Line
                ctx.begin_path();
                for (i, dp) in data.iter().enumerate() {
                    let px = chart_x + i as f64 * step;
                    let py = chart_y + chart_h - (dp.value / max_val) * chart_h;
                    if i == 0 { ctx.move_to(px, py); } else { ctx.line_to(px, py); }
                }
                let line_color = config.color_for(0, &None);
                ctx.set_stroke_style_str(&line_color);
                ctx.set_line_width(2.0);
                ctx.stroke();
                // Points
                for (i, dp) in data.iter().enumerate() {
                    let px = chart_x + i as f64 * step;
                    let py = chart_y + chart_h - (dp.value / max_val) * chart_h;
                    let color = config.color_for(i, &dp.color);
                    ctx.begin_path();
                    ctx.arc(px, py, 3.5, 0.0, std::f64::consts::TAU).ok();
                    ctx.set_fill_style_str(&color);
                    ctx.fill();
                    if config.show_labels {
                        ctx.set_fill_style_str("rgba(255,255,255,0.6)");
                        ctx.set_font("9px Inter, system-ui, sans-serif");
                        ctx.set_text_baseline("top");
                        ctx.set_text_align("center");
                        ctx.fill_text(&dp.label, px, chart_y + chart_h + 3.0).ok();
                    }
                }
            }
            ChartType::Pie | ChartType::Donut => {
                let cx = chart_x + chart_w / 2.0;
                let cy = chart_y + chart_h / 2.0;
                let radius = chart_w.min(chart_h) / 2.0 - 4.0;
                let inner_r = if *chart_type == ChartType::Donut { radius * 0.55 } else { 0.0 };
                let total: f64 = data.iter().map(|d| d.value).sum();
                if total <= 0.0 { return; }
                let mut start_angle = -std::f64::consts::FRAC_PI_2;
                for (i, dp) in data.iter().enumerate() {
                    let sweep = (dp.value / total) * std::f64::consts::TAU;
                    let end_angle = start_angle + sweep;
                    let color = config.color_for(i, &dp.color);
                    ctx.begin_path();
                    ctx.arc(cx, cy, radius, start_angle, end_angle).ok();
                    if inner_r > 0.0 {
                        ctx.arc_with_anticlockwise(cx, cy, inner_r, end_angle, start_angle, true).ok();
                    } else {
                        ctx.line_to(cx, cy);
                    }
                    ctx.close_path();
                    ctx.set_fill_style_str(&color);
                    ctx.fill();
                    // Label
                    if config.show_labels {
                        let mid = start_angle + sweep / 2.0;
                        let lr = radius * 0.7;
                        let lx = cx + mid.cos() * lr;
                        let ly = cy + mid.sin() * lr;
                        ctx.set_fill_style_str("rgba(255,255,255,0.9)");
                        ctx.set_font("9px Inter, system-ui, sans-serif");
                        ctx.set_text_baseline("middle");
                        ctx.set_text_align("center");
                        ctx.fill_text(&dp.label, lx, ly).ok();
                    }
                    start_angle = end_angle;
                }
            }
        }

        // Legend
        if config.show_legend {
            let ly = y + h - padding - 4.0;
            let fs = 9.0;
            ctx.set_font(&format!("{}px Inter, system-ui, sans-serif", fs));
            ctx.set_text_baseline("middle");
            ctx.set_text_align("left");
            let mut lx = chart_x;
            for (i, dp) in data.iter().enumerate() {
                let color = config.color_for(i, &dp.color);
                ctx.set_fill_style_str(&color);
                ctx.fill_rect(lx, ly - 4.0, 8.0, 8.0);
                ctx.set_fill_style_str("rgba(255,255,255,0.7)");
                ctx.fill_text(&dp.label, lx + 11.0, ly).ok();
                let tw = ctx.measure_text(&dp.label).map(|m| m.width()).unwrap_or(30.0);
                lx += 11.0 + tw + 10.0;
                if lx > x + w - padding { break; }
            }
        }
        ctx.set_text_align("start");
    }

    fn render_selection(&self, ctx: &CanvasRenderingContext2d, node: &Node) {
        let sel_color = if node.locked {
            "#f97316".to_string() // orange for locked
        } else {
            Color::blue().to_css()
        };
        ctx.set_stroke_style_str(&sel_color);
        ctx.set_line_width(1.5 / self.viewport.a);
        ctx.stroke_rect(node.x, node.y, node.width, node.height);

        if !node.locked {
            // Only show resize handles for unlocked nodes
            let hs = 6.0 / self.viewport.a;
            let handles = [
                (node.x, node.y),
                (node.x + node.width, node.y),
                (node.x, node.y + node.height),
                (node.x + node.width, node.y + node.height),
            ];
            ctx.set_fill_style_str("white");
            for (hx, hy) in handles {
                ctx.fill_rect(hx - hs / 2.0, hy - hs / 2.0, hs, hs);
                ctx.stroke_rect(hx - hs / 2.0, hy - hs / 2.0, hs, hs);
            }
        } else {
            // Show a small lock badge at top-left corner for locked nodes
            let badge_size = 16.0 / self.viewport.a;
            let bx = node.x - badge_size * 0.25;
            let by = node.y - badge_size * 0.25;
            ctx.set_fill_style_str("rgba(249, 115, 22, 0.85)");
            let br = badge_size * 0.2;
            self.draw_rounded_rect(ctx, bx, by, badge_size, badge_size, br);
            ctx.fill();
            // Draw a simple lock shape
            ctx.set_stroke_style_str("white");
            ctx.set_fill_style_str("white");
            ctx.set_line_width(1.0 / self.viewport.a);
            let lx = bx + badge_size * 0.28;
            let ly = by + badge_size * 0.45;
            let lw = badge_size * 0.44;
            let lh = badge_size * 0.35;
            ctx.fill_rect(lx, ly, lw, lh); // lock body
            ctx.begin_path();
            let arc_cx = bx + badge_size * 0.5;
            let arc_cy = ly;
            let arc_r = badge_size * 0.16;
            ctx.arc(arc_cx, arc_cy, arc_r, std::f64::consts::PI, 0.0).ok();
            ctx.stroke(); // lock shackle
        }
    }

    /// Render a subtle overlay for locked nodes (diagonal stripes)
    fn render_locked_overlay(&self, ctx: &CanvasRenderingContext2d, node: &Node) {
        ctx.save();
        ctx.set_global_alpha(0.06);
        ctx.set_fill_style_str("#f97316");
        ctx.fill_rect(node.x, node.y, node.width, node.height);
        ctx.restore();
    }

    fn draw_rounded_rect(&self, ctx: &CanvasRenderingContext2d, x: f64, y: f64, w: f64, h: f64, r: f64) {
        self.draw_rounded_rect_smooth(ctx, x, y, w, h, r, 0.0);
    }

    fn draw_rounded_rect_smooth(&self, ctx: &CanvasRenderingContext2d, x: f64, y: f64, w: f64, h: f64, r: f64, smoothing: f64) {
        let r = r.min(w / 2.0).min(h / 2.0);
        if r <= 0.0 {
            ctx.begin_path();
            ctx.rect(x, y, w, h);
            return;
        }
        let s = smoothing.max(0.0).min(1.0);
        if s < 0.001 {
            // Standard arc_to rounded rect
            ctx.begin_path();
            ctx.move_to(x + r, y);
            ctx.line_to(x + w - r, y);
            ctx.arc_to(x + w, y, x + w, y + r, r).ok();
            ctx.line_to(x + w, y + h - r);
            ctx.arc_to(x + w, y + h, x + w - r, y + h, r).ok();
            ctx.line_to(x + r, y + h);
            ctx.arc_to(x, y + h, x, y + h - r, r).ok();
            ctx.line_to(x, y + r);
            ctx.arc_to(x, y, x + r, y, r).ok();
            ctx.close_path();
        } else {
            // Squircle (iOS-style superellipse corner smoothing) via cubic bezier
            // Based on Figma's corner smoothing approach
            // k = bezier handle length factor: circular arc ≈ 0.5523, full squircle ≈ 1.0
            let k_arc = 0.5523;
            let k = k_arc + s * (1.0 - k_arc); // lerp from circular to squircle
            let hr = r * k; // handle distance from corner

            ctx.begin_path();
            // Top edge, starting from top-left corner end
            ctx.move_to(x + r, y);
            ctx.line_to(x + w - r, y);
            // Top-right corner
            ctx.bezier_curve_to(x + w - r + hr, y, x + w, y + r - hr, x + w, y + r);
            // Right edge
            ctx.line_to(x + w, y + h - r);
            // Bottom-right corner
            ctx.bezier_curve_to(x + w, y + h - r + hr, x + w - r + hr, y + h, x + w - r, y + h);
            // Bottom edge
            ctx.line_to(x + r, y + h);
            // Bottom-left corner
            ctx.bezier_curve_to(x + r - hr, y + h, x, y + h - r + hr, x, y + h - r);
            // Left edge
            ctx.line_to(x, y + r);
            // Top-left corner
            ctx.bezier_curve_to(x, y + r - hr, x + r - hr, y, x + r, y);
            ctx.close_path();
        }
    }

    fn apply_single_fill_style(&self, ctx: &CanvasRenderingContext2d, fill: &crate::node::Fill, node: &Node) {
        match &fill.fill_type {
            crate::node::FillType::Solid { color } => {
                if color.color_space != crate::types::ColorSpace::SRGB {
                    ctx.set_fill_style_str(&color.to_css_modern());
                } else {
                    ctx.set_fill_style_str(&color.to_css());
                }
            }
            crate::node::FillType::LinearGradient { start_x, start_y, end_x, end_y, stops } => {
                let grad = ctx.create_linear_gradient(
                    node.x + start_x * node.width,
                    node.y + start_y * node.height,
                    node.x + end_x * node.width,
                    node.y + end_y * node.height,
                );
                for stop in stops {
                    grad.add_color_stop(stop.offset as f32, &stop.color.to_css()).ok();
                }
                ctx.set_fill_style(&grad);
            }
            crate::node::FillType::RadialGradient { center_x, center_y, radius, stops } => {
                let cx = node.x + center_x * node.width;
                let cy = node.y + center_y * node.height;
                let r = radius * node.width.max(node.height);
                if let Ok(grad) = ctx.create_radial_gradient(cx, cy, 0.0, cx, cy, r) {
                    for stop in stops {
                        grad.add_color_stop(stop.offset as f32, &stop.color.to_css()).ok();
                    }
                    ctx.set_fill_style(&grad);
                }
            }
            crate::node::FillType::Pattern { src, scale, rotation, pattern_type, tile_width, tile_height } => {
                // Pattern fills are rendered via JS createPattern — here we set a placeholder.
                let _ = (src, scale, rotation, pattern_type, tile_width, tile_height);
                ctx.set_fill_style_str("rgba(200,200,200,0.5)");
            }
            crate::node::FillType::NoiseFill { scale, color1, color2, intensity, seed } => {
                // Render noise fill as a grid of small rectangles with pseudo-random colors
                // Uses a simple hash-based noise for WASM compatibility
                let cell_size = (*scale).max(2.0);
                let cols = (node.width / cell_size).ceil() as u32;
                let rows = (node.height / cell_size).ceil() as u32;
                // Limit to avoid perf issues
                let max_cells = 10000u32;
                let (cols, rows, cs) = if cols * rows > max_cells {
                    let factor = ((cols * rows) as f64 / max_cells as f64).sqrt();
                    let new_cs = cell_size * factor;
                    ((node.width / new_cs).ceil() as u32, (node.height / new_cs).ceil() as u32, new_cs)
                } else {
                    (cols, rows, cell_size)
                };
                ctx.save();
                ctx.begin_path();
                ctx.rect(node.x, node.y, node.width, node.height);
                ctx.clip();
                for ry in 0..rows {
                    for cx in 0..cols {
                        // Simple hash noise
                        let hash = Self::noise_hash(cx, ry, *seed);
                        let t = (hash as f64 / 255.0) * intensity;
                        let r = (color1.r as f64 * (1.0 - t) + color2.r as f64 * t) as u8;
                        let g = (color1.g as f64 * (1.0 - t) + color2.g as f64 * t) as u8;
                        let b = (color1.b as f64 * (1.0 - t) + color2.b as f64 * t) as u8;
                        let a = color1.a * (1.0 - t) + color2.a * t;
                        ctx.set_fill_style_str(&format!("rgba({},{},{},{})", r, g, b, a));
                        ctx.fill_rect(node.x + cx as f64 * cs, node.y + ry as f64 * cs, cs, cs);
                    }
                }
                ctx.restore();
                return; // Already filled
            }
            crate::node::FillType::DotPattern { dot_radius, spacing, color, bg_color, angle } => {
                // Fill background
                ctx.set_fill_style_str(&bg_color.to_css());
                ctx.fill_rect(node.x, node.y, node.width, node.height);
                // Draw dots
                ctx.save();
                ctx.begin_path();
                ctx.rect(node.x, node.y, node.width, node.height);
                ctx.clip();
                let sp = (*spacing).max(2.0);
                let rad = *dot_radius;
                let angle_rad = angle.to_radians();
                let cx_center = node.x + node.width / 2.0;
                let cy_center = node.y + node.height / 2.0;
                ctx.translate(cx_center, cy_center).ok();
                ctx.rotate(angle_rad).ok();
                ctx.translate(-cx_center, -cy_center).ok();
                // Expand range to cover rotated area
                let diag = (node.width * node.width + node.height * node.height).sqrt();
                let start_x = node.x + node.width / 2.0 - diag / 2.0;
                let start_y = node.y + node.height / 2.0 - diag / 2.0;
                ctx.set_fill_style_str(&color.to_css());
                let mut py = start_y;
                while py < start_y + diag {
                    let mut px = start_x;
                    while px < start_x + diag {
                        ctx.begin_path();
                        ctx.arc(px, py, rad, 0.0, std::f64::consts::TAU).ok();
                        ctx.fill();
                        px += sp;
                    }
                    py += sp;
                }
                ctx.restore();
                return;
            }
            crate::node::FillType::CrosshatchFill { spacing, line_width, color, bg_color, angle, density } => {
                // Fill background
                ctx.set_fill_style_str(&bg_color.to_css());
                ctx.fill_rect(node.x, node.y, node.width, node.height);
                ctx.save();
                ctx.begin_path();
                ctx.rect(node.x, node.y, node.width, node.height);
                ctx.clip();
                let sp = (*spacing).max(2.0);
                let lw = *line_width;
                let angle_rad = angle.to_radians();
                ctx.set_stroke_style_str(&color.to_css());
                ctx.set_line_width(lw);
                let diag = (node.width * node.width + node.height * node.height).sqrt();
                let cx_center = node.x + node.width / 2.0;
                let cy_center = node.y + node.height / 2.0;
                // Draw lines at primary angle
                let draw_lines = |ctx: &CanvasRenderingContext2d, ang: f64| {
                    ctx.save();
                    ctx.translate(cx_center, cy_center).ok();
                    ctx.rotate(ang).ok();
                    let half = diag / 2.0;
                    let mut offset = -half;
                    while offset <= half {
                        ctx.begin_path();
                        ctx.move_to(-half, offset);
                        ctx.line_to(half, offset);
                        ctx.stroke();
                        offset += sp;
                    }
                    ctx.restore();
                };
                draw_lines(ctx, angle_rad);
                if *density >= 2 {
                    draw_lines(ctx, angle_rad + std::f64::consts::FRAC_PI_2);
                }
                ctx.restore();
                return;
            }
            crate::node::FillType::ConicGradient { center_x, center_y, angle, stops } => {
                // Render conic gradient by drawing many arc segments
                if stops.is_empty() { return; }
                let cx = node.x + center_x * node.width;
                let cy = node.y + center_y * node.height;
                let r = (node.width * node.width + node.height * node.height).sqrt();
                let start_angle_rad = angle.to_radians();
                let num_segments = 360u32;

                ctx.save();
                ctx.begin_path();
                ctx.rect(node.x, node.y, node.width, node.height);
                ctx.clip();

                for i in 0..num_segments {
                    let t0 = i as f64 / num_segments as f64;
                    let t1 = (i + 1) as f64 / num_segments as f64;
                    let t_mid = (t0 + t1) / 2.0;

                    // Interpolate color at t_mid
                    let color = Self::interpolate_gradient_stops(stops, t_mid);

                    let a0 = start_angle_rad + t0 * std::f64::consts::TAU;
                    let a1 = start_angle_rad + t1 * std::f64::consts::TAU;

                    ctx.set_fill_style_str(&format!("rgba({},{},{},{})", color.r, color.g, color.b, color.a));
                    ctx.begin_path();
                    ctx.move_to(cx, cy);
                    ctx.arc(cx, cy, r, a0, a1).ok();
                    ctx.close_path();
                    ctx.fill();
                }

                ctx.restore();
                return;
            }
            crate::node::FillType::GradientMesh { ref mesh } => {
                // Render gradient mesh via tessellation: for each cell in the grid,
                // subdivide into small triangles with bilinearly interpolated colors.
                if mesh.rows < 2 || mesh.cols < 2 { return; }
                ctx.save();
                ctx.begin_path();
                ctx.rect(node.x, node.y, node.width, node.height);
                ctx.clip();

                let subdivs = 8u32; // subdivisions per cell for smooth interpolation
                for r in 0..(mesh.rows - 1) {
                    for c in 0..(mesh.cols - 1) {
                        // Get 4 corners of this cell
                        let tl = match mesh.get_point(r, c) { Some(p) => p, None => continue };
                        let tr = match mesh.get_point(r, c + 1) { Some(p) => p, None => continue };
                        let bl = match mesh.get_point(r + 1, c) { Some(p) => p, None => continue };
                        let br = match mesh.get_point(r + 1, c + 1) { Some(p) => p, None => continue };

                        for sy in 0..subdivs {
                            for sx in 0..subdivs {
                                let u0 = sx as f64 / subdivs as f64;
                                let v0 = sy as f64 / subdivs as f64;
                                let u1 = (sx + 1) as f64 / subdivs as f64;
                                let v1 = (sy + 1) as f64 / subdivs as f64;

                                // Bilinear position interpolation
                                let lerp_x = |u: f64, v: f64| -> f64 {
                                    let top = tl.x * (1.0 - u) + tr.x * u;
                                    let bot = bl.x * (1.0 - u) + br.x * u;
                                    top * (1.0 - v) + bot * v
                                };
                                let lerp_y = |u: f64, v: f64| -> f64 {
                                    let top = tl.y * (1.0 - u) + tr.y * u;
                                    let bot = bl.y * (1.0 - u) + br.y * u;
                                    top * (1.0 - v) + bot * v
                                };

                                // Center color via bilinear interpolation
                                let um = (u0 + u1) / 2.0;
                                let vm = (v0 + v1) / 2.0;
                                let lerp_color = |u: f64, v: f64| -> (u8, u8, u8, f64) {
                                    let top_r = tl.color.r as f64 * (1.0 - u) + tr.color.r as f64 * u;
                                    let top_g = tl.color.g as f64 * (1.0 - u) + tr.color.g as f64 * u;
                                    let top_b = tl.color.b as f64 * (1.0 - u) + tr.color.b as f64 * u;
                                    let top_a = tl.color.a * (1.0 - u) + tr.color.a * u;
                                    let bot_r = bl.color.r as f64 * (1.0 - u) + br.color.r as f64 * u;
                                    let bot_g = bl.color.g as f64 * (1.0 - u) + br.color.g as f64 * u;
                                    let bot_b = bl.color.b as f64 * (1.0 - u) + br.color.b as f64 * u;
                                    let bot_a = bl.color.a * (1.0 - u) + br.color.a * u;
                                    (
                                        (top_r * (1.0 - v) + bot_r * v) as u8,
                                        (top_g * (1.0 - v) + bot_g * v) as u8,
                                        (top_b * (1.0 - v) + bot_b * v) as u8,
                                        top_a * (1.0 - v) + bot_a * v,
                                    )
                                };
                                let (cr, cg, cb, ca) = lerp_color(um, vm);

                                let px0 = node.x + lerp_x(u0, v0) * node.width;
                                let py0 = node.y + lerp_y(u0, v0) * node.height;
                                let px1 = node.x + lerp_x(u1, v0) * node.width;
                                let py1 = node.y + lerp_y(u1, v0) * node.height;
                                let px2 = node.x + lerp_x(u1, v1) * node.width;
                                let py2 = node.y + lerp_y(u1, v1) * node.height;
                                let px3 = node.x + lerp_x(u0, v1) * node.width;
                                let py3 = node.y + lerp_y(u0, v1) * node.height;

                                ctx.set_fill_style_str(&format!("rgba({},{},{},{})", cr, cg, cb, ca));
                                ctx.begin_path();
                                ctx.move_to(px0, py0);
                                ctx.line_to(px1, py1);
                                ctx.line_to(px2, py2);
                                ctx.line_to(px3, py3);
                                ctx.close_path();
                                ctx.fill();
                            }
                        }
                    }
                }
                ctx.restore();
                return;
            }
        }
    }

    /// Apply first visible fill style (backward-compat helper for contexts that set fill once).
    fn apply_fill_style(&self, ctx: &CanvasRenderingContext2d, node: &Node) {
        if let Some(fill) = node.visible_fills().next() {
            self.apply_single_fill_style(ctx, fill, node);
        }
    }

    fn apply_fill_stroke(&self, ctx: &CanvasRenderingContext2d, node: &Node) {
        // Outside strokes first (drawn behind fills)
        let has_outside = node.visible_strokes().any(|s| s.align == crate::node::StrokeAlign::Outside);
        if has_outside {
            for stroke in node.visible_strokes() {
                if stroke.align == crate::node::StrokeAlign::Outside {
                    ctx.save();
                    ctx.set_stroke_style_str(&stroke.color.to_css());
                    ctx.set_line_width(stroke.width * 2.0);
                    self.apply_stroke_options(ctx, stroke);
                    ctx.stroke();
                    if !stroke.dash_array.is_empty() {
                        ctx.set_line_dash(&js_sys::Array::new()).ok();
                    }
                    ctx.restore();
                }
            }
            // Fill on top (masks inner half of outside strokes)
            if node.has_fill() {
                for fill in node.visible_fills() {
                    self.apply_single_fill_style(ctx, fill, node);
                    ctx.fill();
                }
            } else {
                ctx.save();
                ctx.begin_path();
                ctx.rect(-1e6, -1e6, 2e6, 2e6);
                ctx.set_fill_style_str("rgba(0,0,0,0)");
                ctx.fill();
                ctx.restore();
            }
            // Center/Inside strokes after fills
            for stroke in node.visible_strokes() {
                if stroke.align != crate::node::StrokeAlign::Outside {
                    ctx.set_stroke_style_str(&stroke.color.to_css());
                    self.apply_stroke_options(ctx, stroke);
                    match stroke.align {
                        crate::node::StrokeAlign::Inside => {
                            ctx.save();
                            ctx.clip();
                            ctx.set_line_width(stroke.width * 2.0);
                            ctx.stroke();
                            ctx.restore();
                        }
                        _ => {
                            ctx.set_line_width(stroke.width);
                            ctx.stroke();
                        }
                    }
                    if !stroke.dash_array.is_empty() {
                        ctx.set_line_dash(&js_sys::Array::new()).ok();
                    }
                }
            }
            return;
        }

        // No outside strokes: fills first, then center/inside strokes
        for fill in node.visible_fills() {
            self.apply_single_fill_style(ctx, fill, node);
            ctx.fill();
        }
        for stroke in node.visible_strokes() {
            ctx.set_stroke_style_str(&stroke.color.to_css());
            self.apply_stroke_options(ctx, stroke);
            match stroke.align {
                crate::node::StrokeAlign::Inside => {
                    ctx.save();
                    ctx.clip();
                    ctx.set_line_width(stroke.width * 2.0);
                    ctx.stroke();
                    ctx.restore();
                }
                _ => {
                    ctx.set_line_width(stroke.width);
                    ctx.stroke();
                }
            }
            if !stroke.dash_array.is_empty() {
                ctx.set_line_dash(&js_sys::Array::new()).ok();
            }
        }
    }

    fn apply_stroke_options(&self, ctx: &CanvasRenderingContext2d, stroke: &crate::node::Stroke) {
        // Dash pattern
        if !stroke.dash_array.is_empty() {
            let arr = js_sys::Array::new();
            for &v in &stroke.dash_array {
                arr.push(&JsValue::from(v));
            }
            ctx.set_line_dash(&arr).ok();
            ctx.set_line_dash_offset(stroke.dash_offset);
        }
        // Line cap
        ctx.set_line_cap(match &stroke.line_cap {
            crate::node::LineCap::Butt => "butt",
            crate::node::LineCap::Round => "round",
            crate::node::LineCap::Square => "square",
        });
        // Line join
        ctx.set_line_join(match &stroke.line_join {
            crate::node::LineJoin::Miter => "miter",
            crate::node::LineJoin::Round => "round",
            crate::node::LineJoin::Bevel => "bevel",
        });
    }

    /// Simple hash-based pseudo-random noise for procedural fills
    /// Interpolate a color from gradient stops at position t (0.0–1.0)
    fn interpolate_gradient_stops(stops: &[crate::node::GradientStop], t: f64) -> crate::types::Color {
        if stops.is_empty() {
            return crate::types::Color::white();
        }
        if stops.len() == 1 || t <= stops[0].offset {
            return stops[0].color;
        }
        if t >= stops[stops.len() - 1].offset {
            return stops[stops.len() - 1].color;
        }
        for i in 1..stops.len() {
            if t <= stops[i].offset {
                let prev = &stops[i - 1];
                let curr = &stops[i];
                let range = curr.offset - prev.offset;
                let frac = if range > 0.0 { (t - prev.offset) / range } else { 0.0 };
                return crate::types::Color {
                    r: (prev.color.r as f64 + (curr.color.r as f64 - prev.color.r as f64) * frac) as u8,
                    g: (prev.color.g as f64 + (curr.color.g as f64 - prev.color.g as f64) * frac) as u8,
                    b: (prev.color.b as f64 + (curr.color.b as f64 - prev.color.b as f64) * frac) as u8,
                    a: prev.color.a + (curr.color.a - prev.color.a) * frac, color_space: ColorSpace::default() };
            }
        }
        stops[stops.len() - 1].color
    }

    fn noise_hash(x: u32, y: u32, seed: u32) -> u8 {
        let mut h = seed.wrapping_mul(374761393)
            .wrapping_add(x.wrapping_mul(668265263))
            .wrapping_add(y.wrapping_mul(2654435761));
        h = (h ^ (h >> 13)).wrapping_mul(1274126177);
        h = h ^ (h >> 16);
        (h & 0xFF) as u8
    }

    fn draw_background_pattern(&self, ctx: &CanvasRenderingContext2d, bg: &crate::scene::CanvasBackground) {
        if bg.pattern == "none" || bg.opacity <= 0.0 { return; }

        let zoom = self.viewport.a;
        if zoom < 0.15 { return; }

        let spacing = bg.spacing;
        let step = if zoom > 2.0 { (spacing / 5.0).max(5.0) } else { spacing };
        let screen_step = step * zoom;
        if screen_step < 4.0 { return; } // too dense to render

        // Parse pattern color
        let hex = &bg.pattern_color;
        let (pr, pg, pb) = if hex.len() >= 6 {
            (
                u8::from_str_radix(&hex[0..2], 16).unwrap_or(255),
                u8::from_str_radix(&hex[2..4], 16).unwrap_or(255),
                u8::from_str_radix(&hex[4..6], 16).unwrap_or(255),
            )
        } else {
            (255, 255, 255)
        };
        let color_str = format!("rgba({},{},{},{})", pr, pg, pb, bg.opacity);

        let offset_x = self.viewport.tx % screen_step;
        let offset_y = self.viewport.ty % screen_step;

        match bg.pattern.as_str() {
            "dots" => {
                ctx.set_fill_style_str(&color_str);
                let r = bg.dot_size * (zoom.min(2.0));
                let mut x = offset_x;
                while x < self.canvas_width + screen_step {
                    let mut y = offset_y;
                    while y < self.canvas_height + screen_step {
                        ctx.begin_path();
                        ctx.arc(x, y, r, 0.0, std::f64::consts::TAU).ok();
                        ctx.fill();
                        y += screen_step;
                    }
                    x += screen_step;
                }
            }
            "lines" => {
                // Horizontal lines only
                ctx.set_stroke_style_str(&color_str);
                ctx.set_line_width(0.5);
                ctx.begin_path();
                let mut y = offset_y;
                while y < self.canvas_height + screen_step {
                    ctx.move_to(0.0, y);
                    ctx.line_to(self.canvas_width, y);
                    y += screen_step;
                }
                ctx.stroke();
            }
            "checkerboard" => {
                // Checkerboard pattern for transparent background representation
                let size = (spacing * zoom * 0.5).max(4.0);
                let light_str = format!("rgba({},{},{},{})", pr, pg, pb, bg.opacity * 0.3);
                let dark_str = format!("rgba({},{},{},{})", pr, pg, pb, bg.opacity * 0.15);
                let mut xi = 0u32;
                let mut x = offset_x - screen_step;
                while x < self.canvas_width + screen_step {
                    let mut yi = 0u32;
                    let mut y = offset_y - screen_step;
                    while y < self.canvas_height + screen_step {
                        let is_dark = (xi + yi) % 2 == 0;
                        ctx.set_fill_style_str(if is_dark { &dark_str } else { &light_str });
                        ctx.fill_rect(x, y, size, size);
                        y += size;
                        yi += 1;
                    }
                    x += size;
                    xi += 1;
                }
            }
            "cross" => {
                // Cross marks at intersections
                ctx.set_stroke_style_str(&color_str);
                ctx.set_line_width(0.5);
                let arm = 3.0 * zoom.min(2.0);
                ctx.begin_path();
                let mut x = offset_x;
                while x < self.canvas_width + screen_step {
                    let mut y = offset_y;
                    while y < self.canvas_height + screen_step {
                        ctx.move_to(x - arm, y);
                        ctx.line_to(x + arm, y);
                        ctx.move_to(x, y - arm);
                        ctx.line_to(x, y + arm);
                        y += screen_step;
                    }
                    x += screen_step;
                }
                ctx.stroke();
            }
            _ => {
                // "grid" — default grid lines
                ctx.set_stroke_style_str(&color_str);
                ctx.set_line_width(0.5);
                ctx.begin_path();
                let mut x = offset_x;
                while x < self.canvas_width + screen_step {
                    ctx.move_to(x, 0.0);
                    ctx.line_to(x, self.canvas_height);
                    x += screen_step;
                }
                let mut y = offset_y;
                while y < self.canvas_height + screen_step {
                    ctx.move_to(0.0, y);
                    ctx.line_to(self.canvas_width, y);
                    y += screen_step;
                }
                ctx.stroke();
            }
        }
    }

    /// Draw background pattern inside a frame's bounds (in scene coordinates)
    fn draw_frame_bg_pattern(&self, ctx: &CanvasRenderingContext2d, node: &Node, pat: &crate::node::FrameBackgroundPattern) {
        let zoom = self.viewport.a;
        let spacing = pat.spacing;
        let opacity = pat.opacity;
        let size = pat.size;
        let hex = &pat.color;
        let (pr, pg, pb) = if hex.len() >= 6 {
            let h = hex.trim_start_matches('#');
            (
                u8::from_str_radix(&h[0..2], 16).unwrap_or(255),
                u8::from_str_radix(&h[2..4], 16).unwrap_or(255),
                u8::from_str_radix(&h[4..6], 16).unwrap_or(255),
            )
        } else { (255, 255, 255) };
        let color_str = format!("rgba({},{},{},{})", pr, pg, pb, opacity);

        ctx.save();
        // Clip to frame
        ctx.begin_path();
        if node.corner_radius > 0.0 {
            self.draw_rounded_rect_smooth(ctx, node.x, node.y, node.width, node.height, node.corner_radius, node.corner_smoothing);
        } else {
            ctx.rect(node.x, node.y, node.width, node.height);
        }
        ctx.clip();

        let start_x = node.x - (node.x % spacing).abs();
        let start_y = node.y - (node.y % spacing).abs();
        let end_x = node.x + node.width;
        let end_y = node.y + node.height;

        match pat.pattern.as_str() {
            "dots" => {
                let r = size;
                ctx.set_fill_style_str(&color_str);
                let mut x = start_x;
                while x <= end_x {
                    let mut y = start_y;
                    while y <= end_y {
                        ctx.begin_path();
                        ctx.arc(x, y, r, 0.0, std::f64::consts::TAU).ok();
                        ctx.fill();
                        y += spacing;
                    }
                    x += spacing;
                }
            }
            "grid" => {
                ctx.set_stroke_style_str(&color_str);
                ctx.set_line_width((size / zoom).max(0.5));
                ctx.begin_path();
                let mut x = start_x;
                while x <= end_x {
                    ctx.move_to(x, node.y);
                    ctx.line_to(x, end_y);
                    x += spacing;
                }
                let mut y = start_y;
                while y <= end_y {
                    ctx.move_to(node.x, y);
                    ctx.line_to(end_x, y);
                    y += spacing;
                }
                ctx.stroke();
            }
            "lines" => {
                ctx.set_stroke_style_str(&color_str);
                ctx.set_line_width((size / zoom).max(0.5));
                ctx.begin_path();
                let mut y = start_y;
                while y <= end_y {
                    ctx.move_to(node.x, y);
                    ctx.line_to(end_x, y);
                    y += spacing;
                }
                ctx.stroke();
            }
            "cross" => {
                ctx.set_stroke_style_str(&color_str);
                ctx.set_line_width((size / zoom).max(0.5));
                let arm = 3.0;
                let mut x = start_x;
                while x <= end_x {
                    let mut y = start_y;
                    while y <= end_y {
                        ctx.begin_path();
                        ctx.move_to(x - arm, y);
                        ctx.line_to(x + arm, y);
                        ctx.move_to(x, y - arm);
                        ctx.line_to(x, y + arm);
                        ctx.stroke();
                        y += spacing;
                    }
                    x += spacing;
                }
            }
            _ => {}
        }
        ctx.restore();
    }

    pub fn screen_to_scene(&self, x: f64, y: f64) -> (f64, f64) {
        if let Some(inv) = self.viewport.inverse() {
            let p = inv.apply(crate::types::Point { x, y });
            (p.x, p.y)
        } else {
            (x, y)
        }
    }

    pub fn zoom(&mut self, delta: f64, cx: f64, cy: f64) {
        let factor = if delta > 0.0 { 0.9 } else { 1.1 };
        let new_zoom = (self.viewport.a * factor).clamp(0.1, 10.0);
        let scale = new_zoom / self.viewport.a;

        self.viewport.tx = cx - (cx - self.viewport.tx) * scale;
        self.viewport.ty = cy - (cy - self.viewport.ty) * scale;
        self.viewport.a = new_zoom;
        self.viewport.d = new_zoom;
    }

    pub fn pan(&mut self, dx: f64, dy: f64) {
        self.viewport.tx += dx;
        self.viewport.ty += dy;
    }
}

/// Evaluate a cubic bezier at parameter t
fn cubic_bezier_point(x0: f64, y0: f64, x1: f64, y1: f64, x2: f64, y2: f64, x3: f64, y3: f64, t: f64) -> (f64, f64) {
    let u = 1.0 - t;
    let uu = u * u;
    let tt = t * t;
    let uuu = uu * u;
    let ttt = tt * t;
    let x = uuu * x0 + 3.0 * uu * t * x1 + 3.0 * u * tt * x2 + ttt * x3;
    let y = uuu * y0 + 3.0 * uu * t * y1 + 3.0 * u * tt * y2 + ttt * y3;
    (x, y)
}
