use std::cell::Cell;
use wasm_bindgen::JsValue;
use web_sys::CanvasRenderingContext2d;
use wasm_bindgen::JsCast;
use crate::node::{Node, NodeKind, TextSizing, TextAlign, FontStyle, PathPoint};
use crate::scene::Scene;
use crate::transform::Transform;
use crate::types::Color;

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
}

impl Renderer {
    pub fn new(width: f64, height: f64) -> Self {
        Self {
            viewport: Transform::identity(),
            canvas_width: width,
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

        ctx.set_fill_style_str("#1a1a1a");
        ctx.fill_rect(0.0, 0.0, self.canvas_width, self.canvas_height);
        self.draw_grid(ctx);

        ctx.save();
        ctx.transform(
            self.viewport.a, self.viewport.b,
            self.viewport.c, self.viewport.d,
            self.viewport.tx, self.viewport.ty,
        ).ok();

        self.current_vp = Some(vp);
        self.render_children(ctx, &scene.get_root_children(), scene);
        self.current_vp = None;

        for &id in &scene.selection {
            if let Some(node) = scene.get_node(id) {
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
            NodeKind::Rect | NodeKind::Frame | NodeKind::Section | NodeKind::Instance(_) | NodeKind::Image { .. } => {
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

    fn render_node(&self, ctx: &CanvasRenderingContext2d, node: &Node, scene: &Scene) {
        // Slice nodes are not rendered on canvas (TS draws overlay)
        if matches!(node.kind, NodeKind::Slice) { return; }

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

        // Drop shadows: render each visible shadow by drawing the node shape with shadow settings
        // Canvas API only supports one shadow at a time, so we draw multiple passes
        for shadow in &node.shadows {
            if !shadow.visible || (shadow.blur == 0.0 && shadow.offset_x == 0.0 && shadow.offset_y == 0.0 && shadow.spread == 0.0) {
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
                NodeKind::Rect | NodeKind::Frame | NodeKind::Section | NodeKind::Instance(_) | NodeKind::Image { .. } => {
                    ctx.set_fill_style_str("rgba(0,0,0,1)");
                    if node.corner_radius > 0.0 {
                        self.draw_rounded_rect(ctx, node.x + far, node.y, node.width, node.height, node.corner_radius);
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

        match &node.kind {
            NodeKind::Rect => self.render_rect(ctx, node),
            NodeKind::Ellipse => self.render_ellipse(ctx, node),
            NodeKind::Text { content, font_size, font_family, line_height, text_align, font_weight, font_style, text_decoration, letter_spacing, paragraph_spacing, list_style, indent_level, text_transform, text_indent } => self.render_text(ctx, node, scene, content, *font_size, font_family, *line_height, text_align, *font_weight, font_style, text_decoration, *letter_spacing, *paragraph_spacing, list_style, *indent_level, text_transform, *text_indent),
            NodeKind::Frame => self.render_frame(ctx, node, scene),
            NodeKind::Group => { self.render_children(ctx, &node.children, scene); }
            NodeKind::Slot { .. } => self.render_slot(ctx, node),
            NodeKind::Instance(_) => self.render_instance(ctx, node, scene),
            NodeKind::Path { ref points, closed } => self.render_path(ctx, node, points, *closed),
            NodeKind::VectorNetwork(ref vn) => self.render_vector_network(ctx, node, vn),
            NodeKind::Image { .. } => self.render_image_placeholder(ctx, node),
            NodeKind::Star { points, inner_radius } => self.render_star(ctx, node, *points, *inner_radius),
            NodeKind::Polygon { sides } => self.render_polygon(ctx, node, *sides),
            NodeKind::Section => self.render_section(ctx, node, scene),
            NodeKind::Slice => {} // Slice nodes are rendered as overlays in TS
            NodeKind::Connector { start_node_id, end_node_id, start_x, end_x, start_y, end_y, ref path_type, end_arrow, start_arrow } => {
                self.render_connector(ctx, node, scene, *start_node_id, *end_node_id, *start_x, *start_y, *end_x, *end_y, path_type, *end_arrow, *start_arrow);
            }
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
            self.draw_rounded_rect(ctx, x, y, node.width, node.height, node.corner_radius);
            self.apply_fill_stroke(ctx, node);
            ctx.restore();
        } else {
            self.draw_rounded_rect(ctx, node.x, node.y, node.width, node.height, node.corner_radius);
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
                    self.draw_rounded_rect(ctx, node.x, node.y, node.width, node.height, node.corner_radius);
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
                self.draw_rounded_rect(ctx, node.x, node.y, node.width, node.height, node.corner_radius);
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
                        self.draw_rounded_rect(ctx, node.x, node.y, node.width, node.height, node.corner_radius);
                    } else {
                        ctx.begin_path();
                        ctx.rect(node.x, node.y, node.width, node.height);
                    }
                    ctx.clip();
                }
                if node.corner_radius > 0.0 {
                    self.draw_rounded_rect(ctx, node.x, node.y, node.width, node.height, node.corner_radius);
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
        // Clip children for Hidden/Scroll overflow
        let needs_clip = node.overflow != crate::node::Overflow::Visible;
        if needs_clip {
            ctx.save();
            ctx.begin_path();
            if node.corner_radius > 0.0 {
                self.draw_rounded_rect(ctx, node.x, node.y, node.width, node.height, node.corner_radius);
            } else {
                ctx.rect(node.x, node.y, node.width, node.height);
            }
            ctx.clip();
        }

        // Apply scroll offset for Scroll overflow
        let has_scroll = node.overflow == crate::node::Overflow::Scroll;
        if has_scroll {
            ctx.save();
            ctx.translate(node.scroll_x, node.scroll_y).ok();
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
            self.draw_rounded_rect(ctx, node.x, node.y, node.width, node.height, node.corner_radius);
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

    fn render_path(&self, ctx: &CanvasRenderingContext2d, node: &Node, points: &[PathPoint], closed: bool) {
        if points.is_empty() { return; }
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
        self.apply_fill_stroke(ctx, node);
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
        if content_h > node.height {
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
        if content_w > node.width {
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

    fn render_section(&self, ctx: &CanvasRenderingContext2d, node: &Node, scene: &Scene) {
        let r = 8.0; // rounded corners
        // Background
        ctx.set_fill_style_str("rgba(26, 26, 46, 0.6)");
        self.draw_rounded_rect(ctx, node.x, node.y, node.width, node.height, r);
        ctx.fill();

        // Border
        let lw = 1.0 / self.viewport.a;
        ctx.set_stroke_style_str("rgba(255,255,255,0.08)");
        ctx.set_line_width(lw);
        self.draw_rounded_rect(ctx, node.x, node.y, node.width, node.height, r);
        ctx.stroke();

        // Title label above the section
        let font_size = (14.0 / self.viewport.a).min(14.0);
        let gap = (6.0 / self.viewport.a).min(6.0);
        ctx.set_fill_style_str("rgba(255,255,255,0.7)");
        ctx.set_font(&format!("600 {}px Inter, system-ui, sans-serif", font_size));
        ctx.set_text_baseline("bottom");
        ctx.fill_text(&node.name, node.x, node.y - gap).ok();

        // Render children
        self.render_children(ctx, &node.children, scene);
    }

    fn render_connector(&self, ctx: &CanvasRenderingContext2d, node: &Node, scene: &Scene,
        start_node_id: u64, end_node_id: u64,
        mut sx: f64, mut sy: f64, mut ex: f64, mut ey: f64,
        path_type: &str, end_arrow: bool, start_arrow: bool)
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
        let arrow_size = (stroke_width * 4.0).max(8.0);
        if end_arrow {
            let angle = if path_type == "curved" {
                // Tangent at end of bezier
                let cx2 = sx + (ex - sx) * 0.5;
                let cy2 = ey;
                (ey - cy2).atan2(ex - cx2)
            } else {
                (ey - sy).atan2(ex - sx)
            };
            self.draw_arrowhead(ctx, ex, ey, angle, arrow_size, &stroke_color);
        }
        if start_arrow {
            let angle = if path_type == "curved" {
                let cx1 = sx + (ex - sx) * 0.5;
                let cy1 = sy;
                (sy - cy1).atan2(sx - cx1)
            } else {
                (sy - ey).atan2(sx - ex)
            };
            self.draw_arrowhead(ctx, sx, sy, angle, arrow_size, &stroke_color);
        }
    }

    fn draw_arrowhead(&self, ctx: &CanvasRenderingContext2d, x: f64, y: f64, angle: f64, size: f64, color: &str) {
        let a1 = angle - std::f64::consts::FRAC_PI_6;
        let a2 = angle + std::f64::consts::FRAC_PI_6;
        ctx.begin_path();
        ctx.move_to(x - size * a1.cos(), y - size * a1.sin());
        ctx.line_to(x, y);
        ctx.line_to(x - size * a2.cos(), y - size * a2.sin());
        ctx.set_fill_style_str(color);
        ctx.fill();
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

    fn render_selection(&self, ctx: &CanvasRenderingContext2d, node: &Node) {
        let sel_color = Color::blue().to_css();
        ctx.set_stroke_style_str(&sel_color);
        ctx.set_line_width(1.5 / self.viewport.a);
        ctx.stroke_rect(node.x, node.y, node.width, node.height);

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
    }

    fn draw_rounded_rect(&self, ctx: &CanvasRenderingContext2d, x: f64, y: f64, w: f64, h: f64, r: f64) {
        let r = r.min(w / 2.0).min(h / 2.0);
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
    }

    fn apply_single_fill_style(&self, ctx: &CanvasRenderingContext2d, fill: &crate::node::Fill, node: &Node) {
        match &fill.fill_type {
            crate::node::FillType::Solid { color } => {
                ctx.set_fill_style_str(&color.to_css());
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

    fn draw_grid(&self, ctx: &CanvasRenderingContext2d) {
        let zoom = self.viewport.a;
        if zoom < 0.3 { return; }

        let step = if zoom > 2.0 { 10.0 } else { 50.0 };
        let offset_x = self.viewport.tx % (step * zoom);
        let offset_y = self.viewport.ty % (step * zoom);

        ctx.set_stroke_style_str("rgba(255,255,255,0.04)");
        ctx.set_line_width(0.5);
        ctx.begin_path();

        let mut x = offset_x;
        while x < self.canvas_width {
            ctx.move_to(x, 0.0);
            ctx.line_to(x, self.canvas_height);
            x += step * zoom;
        }
        let mut y = offset_y;
        while y < self.canvas_height {
            ctx.move_to(0.0, y);
            ctx.line_to(self.canvas_width, y);
            y += step * zoom;
        }
        ctx.stroke();
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
