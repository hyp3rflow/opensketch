use wasm_bindgen::JsValue;
use web_sys::CanvasRenderingContext2d;
use crate::node::{Node, NodeKind, TextSizing, TextAlign, FontStyle};
use crate::scene::Scene;
use crate::transform::Transform;
use crate::types::Color;

pub struct Renderer {
    pub viewport: Transform,
    pub canvas_width: f64,
    pub canvas_height: f64,
}

impl Renderer {
    pub fn new(width: f64, height: f64) -> Self {
        Self {
            viewport: Transform::identity(),
            canvas_width: width,
            canvas_height: height,
        }
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
                    NodeKind::Text { content, font_size, font_family, line_height, font_weight, font_style, .. } => {
                        (content.clone(), *font_size, font_family.clone(), *line_height, *font_weight, font_style.clone(),
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

            if is_fit {
                let mut max_w: f64 = 1.0;
                for line in &lines {
                    if let Ok(m) = ctx.measure_text(line) {
                        max_w = max_w.max(m.width());
                    }
                }
                let total_h = line_h * lines.len() as f64;
                if let Some(node) = scene.get_node_mut(id) {
                    node.width = max_w.max(1.0);
                    node.height = total_h.max(1.0);
                }
            } else {
                // Fixed mode: update height to fit content
                let total_h = line_h * lines.len() as f64;
                if let Some(node) = scene.get_node_mut(id) {
                    node.height = total_h.max(1.0);
                }
            }
        }
    }

    pub fn render(&self, ctx: &CanvasRenderingContext2d, scene: &Scene, _editing_node: Option<u64>) {
        ctx.set_fill_style_str("#1a1a1a");
        ctx.fill_rect(0.0, 0.0, self.canvas_width, self.canvas_height);
        self.draw_grid(ctx);

        ctx.save();
        ctx.transform(
            self.viewport.a, self.viewport.b,
            self.viewport.c, self.viewport.d,
            self.viewport.tx, self.viewport.ty,
        ).ok();

        for id in scene.render_order() {
            if let Some(node) = scene.get_node(id) {
                if !node.visible { continue; }
                self.render_node(ctx, node, scene);
            }
        }

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

    fn render_node(&self, ctx: &CanvasRenderingContext2d, node: &Node, scene: &Scene) {
        ctx.save();
        ctx.set_global_alpha(node.opacity);

        match &node.kind {
            NodeKind::Rect => self.render_rect(ctx, node),
            NodeKind::Ellipse => self.render_ellipse(ctx, node),
            NodeKind::Text { content, font_size, font_family, line_height, text_align, font_weight, font_style } => self.render_text(ctx, node, content, *font_size, font_family, *line_height, text_align, *font_weight, font_style),
            NodeKind::Frame => self.render_frame(ctx, node, scene),
            NodeKind::Group => {}
            NodeKind::Slot { .. } => self.render_slot(ctx, node),
            NodeKind::Instance(_) => self.render_instance(ctx, node, scene),
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

    fn render_text(&self, ctx: &CanvasRenderingContext2d, node: &Node, content: &str, font_size: f64, font_family: &str, line_height: f64, text_align: &TextAlign, font_weight: u16, font_style: &FontStyle) {
        if let Some(fill) = &node.fill {
            ctx.set_fill_style_str(&fill.color.to_css());
            let font_str = Self::build_font_string(font_size, font_family, font_weight, font_style);
            ctx.set_font(&font_str);
            ctx.set_text_baseline("alphabetic");

            // Get ascent for baseline offset
            let ascent = if let Ok(m) = ctx.measure_text("M") {
                m.actual_bounding_box_ascent()
            } else {
                font_size * 0.8
            };

            let max_width = if node.text_sizing == TextSizing::Fixed { Some(node.width) } else { None };
            let lines = Self::wrap_text(ctx, content, max_width);
            let line_h = font_size * line_height;
            let zoom = self.viewport.a;

            for (i, line) in lines.iter().enumerate() {
                // HiDPI pixel snap: snap y to device pixels
                let raw_y = node.y + ascent + line_h * i as f64;
                let snapped_y = (raw_y * zoom).round() / zoom;

                // text_align x calculation
                let x = match text_align {
                    TextAlign::Left => {
                        let raw_x = node.x;
                        (raw_x * zoom).round() / zoom
                    }
                    TextAlign::Center => {
                        let lw = ctx.measure_text(line).map(|m| m.width()).unwrap_or(0.0);
                        let raw_x = node.x + (node.width - lw) / 2.0;
                        (raw_x * zoom).round() / zoom
                    }
                    TextAlign::Right => {
                        let lw = ctx.measure_text(line).map(|m| m.width()).unwrap_or(0.0);
                        let raw_x = node.x + node.width - lw;
                        (raw_x * zoom).round() / zoom
                    }
                };

                ctx.fill_text(line, x, snapped_y).ok();
            }
        }
    }

    fn render_frame(&self, ctx: &CanvasRenderingContext2d, node: &Node, scene: &Scene) {
        if let Some(fill) = &node.fill {
            ctx.set_fill_style_str(&fill.color.to_css());
            if node.corner_radius > 0.0 {
                self.draw_rounded_rect(ctx, node.x, node.y, node.width, node.height, node.corner_radius);
                ctx.fill();
            } else {
                ctx.fill_rect(node.x, node.y, node.width, node.height);
            }
        }
        if let Some(stroke) = &node.stroke {
            ctx.set_stroke_style_str(&stroke.color.to_css());
            ctx.set_line_width(stroke.width);
            if node.corner_radius > 0.0 {
                self.draw_rounded_rect(ctx, node.x, node.y, node.width, node.height, node.corner_radius);
                ctx.stroke();
            } else {
                ctx.stroke_rect(node.x, node.y, node.width, node.height);
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
        if let Some(fill) = &node.fill {
            ctx.set_fill_style_str(&fill.color.to_css());
            if node.corner_radius > 0.0 {
                ctx.begin_path();
                let r = node.corner_radius.min(node.width / 2.0).min(node.height / 2.0);
                ctx.round_rect_with_f64(node.x, node.y, node.width, node.height, r).ok();
                ctx.fill();
            } else {
                ctx.fill_rect(node.x, node.y, node.width, node.height);
            }
        }
        if let Some(stroke) = &node.stroke {
            ctx.set_stroke_style_str(&stroke.color.to_css());
            ctx.set_line_width(stroke.width);
            ctx.stroke_rect(node.x, node.y, node.width, node.height);
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

    fn apply_fill_stroke(&self, ctx: &CanvasRenderingContext2d, node: &Node) {
        if let Some(fill) = &node.fill {
            ctx.set_fill_style_str(&fill.color.to_css());
            ctx.fill();
        }
        if let Some(stroke) = &node.stroke {
            ctx.set_stroke_style_str(&stroke.color.to_css());
            ctx.set_line_width(stroke.width);
            ctx.stroke();
        }
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
