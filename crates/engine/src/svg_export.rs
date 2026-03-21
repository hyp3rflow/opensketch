use crate::node::{Node, NodeKind, NodeId, TextAlign, FontStyle, FillType, PathPoint};
use crate::scene::Scene;

fn color_to_hex(r: u8, g: u8, b: u8) -> String {
    format!("#{:02x}{:02x}{:02x}", r, g, b)
}

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn build_filter_defs(node: &Node, filter_id: &str) -> Option<String> {
    let has_shadows = node.shadows.iter().any(|s| s.visible);
    let has_blur = node.blur > 0.0;
    if !has_shadows && !has_blur {
        return None;
    }
    let mut defs = format!(r#"<filter id="{}" x="-50%" y="-50%" width="200%" height="200%">"#, filter_id);
    if has_blur {
        defs.push_str(&format!(r#"<feGaussianBlur in="SourceGraphic" stdDeviation="{}"/>"#, node.blur));
    }
    for s in &node.shadows {
        if !s.visible { continue; }
        let hex = format!("#{:02x}{:02x}{:02x}", s.color.r, s.color.g, s.color.b);
        defs.push_str(&format!(
            r#"<feDropShadow dx="{}" dy="{}" stdDeviation="{}" flood-color="{}" flood-opacity="{}"/>"#,
            s.offset_x, s.offset_y, (s.blur + s.spread) / 2.0, hex, s.color.a
        ));
    }
    defs.push_str("</filter>");
    Some(defs)
}

fn render_node_svg(scene: &Scene, node: &Node, buf: &mut String) {
    if !node.visible {
        return;
    }

    let has_transform = node.x != 0.0 || node.y != 0.0 || node.rotation != 0.0;
    let has_opacity = node.opacity < 1.0;

    // Build filter if needed
    let filter_id = format!("filter-{}", node.id);
    let filter_defs = build_filter_defs(node, &filter_id);
    // Build gradient defs
    let gradient_defs = build_gradient_defs(node);

    if filter_defs.is_some() || gradient_defs.is_some() {
        buf.push_str("<defs>");
        if let Some(ref defs) = filter_defs {
            buf.push_str(defs);
        }
        if let Some(ref defs) = gradient_defs {
            buf.push_str(defs);
        }
        buf.push_str("</defs>\n");
    }
    let filter_attr = if filter_defs.is_some() {
        format!(r#" filter="url(#{})""#, filter_id)
    } else {
        String::new()
    };

    match &node.kind {
        NodeKind::Rect => {
            let mut attrs = format!(
                r#"<rect width="{}" height="{}""#,
                node.width, node.height
            );
            if node.corner_radius > 0.0 {
                attrs.push_str(&format!(r#" rx="{}" ry="{}""#, node.corner_radius, node.corner_radius));
            }
            append_transform(&mut attrs, node);
            append_fill_stroke(&mut attrs, node);
            if has_opacity {
                attrs.push_str(&format!(r#" opacity="{}""#, node.opacity));
            }
            append_blend_mode(&mut attrs, node);
            attrs.push_str(&filter_attr);
            attrs.push_str("/>\n");
            buf.push_str(&attrs);
        }
        NodeKind::Ellipse => {
            let cx = node.x + node.width / 2.0;
            let cy = node.y + node.height / 2.0;
            let rx = node.width / 2.0;
            let ry = node.height / 2.0;
            let mut attrs = format!(
                r#"<ellipse cx="{}" cy="{}" rx="{}" ry="{}""#,
                cx, cy, rx, ry
            );
            if node.rotation != 0.0 {
                let deg = node.rotation.to_degrees();
                attrs.push_str(&format!(r#" transform="rotate({},{},{})""#, deg, cx, cy));
            }
            append_fill_stroke(&mut attrs, node);
            if has_opacity {
                attrs.push_str(&format!(r#" opacity="{}""#, node.opacity));
            }
            append_blend_mode(&mut attrs, node);
            attrs.push_str(&filter_attr);
            attrs.push_str("/>\n");
            buf.push_str(&attrs);
        }
        NodeKind::Text { content, font_size, font_family, line_height, text_align, font_weight, font_style } => {
            let mut attrs = String::new();
            attrs.push_str("<text");
            // Position at node origin
            let tx = node.x;
            let ty = node.y + font_size * 0.8; // approximate ascent

            let anchor = match text_align {
                TextAlign::Left => "start",
                TextAlign::Center => "middle",
                TextAlign::Right => "end",
            };
            let text_x = match text_align {
                TextAlign::Left => tx,
                TextAlign::Center => tx + node.width / 2.0,
                TextAlign::Right => tx + node.width,
            };

            attrs.push_str(&format!(r#" x="{}" y="{}""#, text_x, ty));
            attrs.push_str(&format!(r#" font-family="{}""#, escape_xml(font_family)));
            attrs.push_str(&format!(r#" font-size="{}""#, font_size));
            if *font_weight != 400 {
                attrs.push_str(&format!(r#" font-weight="{}""#, font_weight));
            }
            if *font_style == FontStyle::Italic {
                attrs.push_str(r#" font-style="italic""#);
            }
            attrs.push_str(&format!(r#" text-anchor="{}""#, anchor));

            // Fill color for text
            if let Some(ref fill) = node.fill {
                let c = fill.color();
                attrs.push_str(&format!(r#" fill="{}""#, color_to_hex(c.r, c.g, c.b)));
                if c.a < 1.0 {
                    attrs.push_str(&format!(r#" fill-opacity="{}""#, c.a));
                }
            } else {
                attrs.push_str(r##" fill="#000000""##);
            }

            if node.rotation != 0.0 {
                let cx = node.x + node.width / 2.0;
                let cy = node.y + node.height / 2.0;
                let deg = node.rotation.to_degrees();
                attrs.push_str(&format!(r#" transform="rotate({},{},{})""#, deg, cx, cy));
            }

            if has_opacity {
                attrs.push_str(&format!(r#" opacity="{}""#, node.opacity));
            }
            append_blend_mode(&mut attrs, node);

            // Multi-line: split by newline
            let lines: Vec<&str> = content.split('\n').collect();
            if lines.len() <= 1 {
                attrs.push('>');
                attrs.push_str(&escape_xml(content));
                attrs.push_str("</text>\n");
            } else {
                attrs.push_str(">\n");
                let line_h = font_size * line_height;
                for (i, line) in lines.iter().enumerate() {
                    if i == 0 {
                        attrs.push_str(&format!(r#"<tspan x="{}">{}</tspan>"#, text_x, escape_xml(line)));
                    } else {
                        attrs.push_str(&format!(r#"<tspan x="{}" dy="{}">{}</tspan>"#, text_x, line_h, escape_xml(line)));
                    }
                    attrs.push('\n');
                }
                attrs.push_str("</text>\n");
            }
            buf.push_str(&attrs);
        }
        NodeKind::Frame | NodeKind::Group => {
            let mut g = String::from("<g");

            // Build transform
            let mut transforms = Vec::new();
            if node.x != 0.0 || node.y != 0.0 {
                transforms.push(format!("translate({},{})", node.x, node.y));
            }
            if node.rotation != 0.0 {
                let deg = node.rotation.to_degrees();
                let cx = node.width / 2.0;
                let cy = node.height / 2.0;
                transforms.push(format!("rotate({},{},{})", deg, cx, cy));
            }
            if !transforms.is_empty() {
                g.push_str(&format!(r#" transform="{}""#, transforms.join(" ")));
            }
            if has_opacity {
                g.push_str(&format!(r#" opacity="{}""#, node.opacity));
            }
            append_blend_mode(&mut g, node);
            g.push_str(">\n");

            // Frame background
            if matches!(node.kind, NodeKind::Frame) {
                let mut rect_attrs = format!(r#"<rect width="{}" height="{}""#, node.width, node.height);
                if node.corner_radius > 0.0 {
                    rect_attrs.push_str(&format!(r#" rx="{}" ry="{}""#, node.corner_radius, node.corner_radius));
                }
                if let Some(ref fill) = node.fill {
                    match &fill.fill_type {
                        FillType::Solid { color: c } => {
                            rect_attrs.push_str(&format!(r#" fill="{}""#, color_to_hex(c.r, c.g, c.b)));
                            if c.a < 1.0 {
                                rect_attrs.push_str(&format!(r#" fill-opacity="{}""#, c.a));
                            }
                        }
                        _ => {
                            // Gradient defs already emitted; reference by id
                            rect_attrs.push_str(&format!(r#" fill="url(#grad-{})""#, node.id));
                        }
                    }
                }
                if let Some(ref stroke) = node.stroke {
                    let c = &stroke.color;
                    rect_attrs.push_str(&format!(r#" stroke="{}" stroke-width="{}""#, color_to_hex(c.r, c.g, c.b), stroke.width));
                    if c.a < 1.0 {
                        rect_attrs.push_str(&format!(r#" stroke-opacity="{}""#, c.a));
                    }
                    append_stroke_options(&mut rect_attrs, stroke);
                }
                rect_attrs.push_str("/>\n");
                g.push_str(&rect_attrs);
            }

            // Render children with mask/clip support
            render_children_svg(scene, &node.children, &mut g, node.x, node.y, true);

            g.push_str("</g>\n");
            buf.push_str(&g);
            return; // already handled children
        }
        NodeKind::Path { ref points, closed } => {
            if points.is_empty() { return; }
            let d = build_svg_path_d(points, *closed);
            let mut attrs = format!(r#"<path d="{}""#, d);
            append_fill_stroke(&mut attrs, node);
            if has_opacity {
                attrs.push_str(&format!(r#" opacity="{}""#, node.opacity));
            }
            append_blend_mode(&mut attrs, node);
            attrs.push_str(&filter_attr);
            attrs.push_str("/>\n");
            buf.push_str(&attrs);
        }
        NodeKind::Image { ref src, ref fit } => {
            let mut attrs = String::new();
            if has_transform || node.rotation != 0.0 {
                attrs.push_str("<g");
                append_transform(&mut attrs, node);
                if has_opacity {
                    attrs.push_str(&format!(r#" opacity="{}""#, node.opacity));
                }
                append_blend_mode(&mut attrs, node);
                attrs.push_str(">\n");
            }
            // Clip with corner radius if needed
            if node.corner_radius > 0.0 {
                let clip_id = format!("clip-img-{}", node.id);
                attrs.push_str(&format!(
                    r#"<defs><clipPath id="{}"><rect width="{}" height="{}" rx="{}" ry="{}"/></clipPath></defs>"#,
                    clip_id, node.width, node.height, node.corner_radius, node.corner_radius
                ));
                attrs.push_str(&format!(r#"<image href="{}" width="{}" height="{}" clip-path="url(#{})" "#, escape_xml(src), node.width, node.height, clip_id));
            } else {
                attrs.push_str(&format!(r#"<image href="{}" width="{}" height="{}""#, escape_xml(src), node.width, node.height));
            }
            let preserve = match fit.as_str() {
                "contain" => "xMidYMid meet",
                "fill" => "none",
                _ => "xMidYMid slice", // cover
            };
            attrs.push_str(&format!(r#" preserveAspectRatio="{}""#, preserve));
            if !(has_transform || node.rotation != 0.0) && has_opacity {
                attrs.push_str(&format!(r#" opacity="{}""#, node.opacity));
            }
            if !(has_transform || node.rotation != 0.0) {
                append_blend_mode(&mut attrs, node);
            }
            attrs.push_str("/>\n");
            if has_transform || node.rotation != 0.0 {
                attrs.push_str("</g>\n");
            }
            buf.push_str(&attrs);
        }
        NodeKind::Slot { .. } | NodeKind::Instance(_) => {
            // Render as group with children
            let mut g = String::from("<g");
            let mut transforms = Vec::new();
            if node.x != 0.0 || node.y != 0.0 {
                transforms.push(format!("translate({},{})", node.x, node.y));
            }
            if !transforms.is_empty() {
                g.push_str(&format!(r#" transform="{}""#, transforms.join(" ")));
            }
            if has_opacity {
                g.push_str(&format!(r#" opacity="{}""#, node.opacity));
            }
            append_blend_mode(&mut g, node);
            g.push_str(">\n");
            buf.push_str(&g);

            render_children_svg(scene, &node.children, buf, node.x, node.y, true);

            buf.push_str("</g>\n");
            return;
        }
    }
}

/// Render children with mask/clip support for SVG export.
/// When a child has is_mask=true, a <clipPath> is created from its shape,
/// and subsequent siblings are wrapped in a <g clip-path="url(#...)"> until end or next mask.
fn render_children_svg(scene: &Scene, children: &[NodeId], buf: &mut String, parent_x: f64, parent_y: f64, adjusted: bool) {
    static CLIP_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let mut mask_active = false;

    for &child_id in children {
        if let Some(child) = scene.get_node(child_id) {
            if !child.visible { continue; }

            let mut node = child.clone();
            if adjusted {
                node.x -= parent_x;
                node.y -= parent_y;
            }

            if child.is_mask {
                if mask_active {
                    buf.push_str("</g>\n"); // close previous clip group
                }
                let clip_id = format!("clip-{}", CLIP_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed));
                // Emit the mask node itself
                if adjusted {
                    render_node_svg_adjusted(scene, &node, buf, parent_x, parent_y);
                } else {
                    render_node_svg(scene, &node, buf);
                }
                // Create clipPath def and open clipped group
                buf.push_str(&format!("<clipPath id=\"{}\">\n", clip_id));
                emit_clip_shape(buf, &node);
                buf.push_str("</clipPath>\n");
                buf.push_str(&format!("<g clip-path=\"url(#{})\">\n", clip_id));
                mask_active = true;
            } else {
                if adjusted {
                    render_node_svg_adjusted(scene, &node, buf, parent_x, parent_y);
                } else {
                    render_node_svg(scene, &node, buf);
                }
            }
        }
    }
    if mask_active {
        buf.push_str("</g>\n");
    }
}

/// Emit the shape of a node as a clip path element
fn emit_clip_shape(buf: &mut String, node: &Node) {
    match &node.kind {
        NodeKind::Rect | NodeKind::Frame | NodeKind::Instance(_) | NodeKind::Image { .. } => {
            let mut s = format!(r#"<rect x="{}" y="{}" width="{}" height="{}""#, node.x, node.y, node.width, node.height);
            if node.corner_radius > 0.0 {
                s.push_str(&format!(r#" rx="{}" ry="{}""#, node.corner_radius, node.corner_radius));
            }
            s.push_str("/>\n");
            buf.push_str(&s);
        }
        NodeKind::Ellipse => {
            buf.push_str(&format!(
                r#"<ellipse cx="{}" cy="{}" rx="{}" ry="{}"/>"#,
                node.x + node.width / 2.0, node.y + node.height / 2.0,
                node.width / 2.0, node.height / 2.0
            ));
            buf.push('\n');
        }
        NodeKind::Path { ref points, closed } => {
            if !points.is_empty() {
                let d = build_svg_path_d(points, *closed);
                buf.push_str(&format!(r#"<path d="{}"/>"#, d));
                buf.push('\n');
            }
        }
        _ => {
            buf.push_str(&format!(r#"<rect x="{}" y="{}" width="{}" height="{}"/>"#, node.x, node.y, node.width, node.height));
            buf.push('\n');
        }
    }
}

/// Render a node that has already been coordinate-adjusted (for children of groups/frames)
fn render_node_svg_adjusted(scene: &Scene, node: &Node, buf: &mut String, parent_x: f64, parent_y: f64) {
    if !node.visible {
        return;
    }

    // For container types, we need special handling
    match &node.kind {
        NodeKind::Frame | NodeKind::Group | NodeKind::Instance(_) | NodeKind::Slot { .. } => {
            let mut g = String::from("<g");
            let mut transforms = Vec::new();
            if node.x != 0.0 || node.y != 0.0 {
                transforms.push(format!("translate({},{})", node.x, node.y));
            }
            if node.rotation != 0.0 {
                let deg = node.rotation.to_degrees();
                let cx = node.width / 2.0;
                let cy = node.height / 2.0;
                transforms.push(format!("rotate({},{},{})", deg, cx, cy));
            }
            if !transforms.is_empty() {
                g.push_str(&format!(r#" transform="{}""#, transforms.join(" ")));
            }
            if node.opacity < 1.0 {
                g.push_str(&format!(r#" opacity="{}""#, node.opacity));
            }
            g.push_str(">\n");

            // Frame background
            if matches!(node.kind, NodeKind::Frame) {
                let mut rect_attrs = format!(r#"<rect width="{}" height="{}""#, node.width, node.height);
                if node.corner_radius > 0.0 {
                    rect_attrs.push_str(&format!(r#" rx="{}" ry="{}""#, node.corner_radius, node.corner_radius));
                }
                if let Some(ref fill) = node.fill {
                    match &fill.fill_type {
                        FillType::Solid { color: c } => {
                            rect_attrs.push_str(&format!(r#" fill="{}""#, color_to_hex(c.r, c.g, c.b)));
                            if c.a < 1.0 {
                                rect_attrs.push_str(&format!(r#" fill-opacity="{}""#, c.a));
                            }
                        }
                        _ => {
                            // Gradient defs already emitted; reference by id
                            rect_attrs.push_str(&format!(r#" fill="url(#grad-{})""#, node.id));
                        }
                    }
                }
                if let Some(ref stroke) = node.stroke {
                    let c = &stroke.color;
                    rect_attrs.push_str(&format!(r#" stroke="{}" stroke-width="{}""#, color_to_hex(c.r, c.g, c.b), stroke.width));
                    if c.a < 1.0 {
                        rect_attrs.push_str(&format!(r#" stroke-opacity="{}""#, c.a));
                    }
                    append_stroke_options(&mut rect_attrs, stroke);
                }
                rect_attrs.push_str("/>\n");
                g.push_str(&rect_attrs);
            }

            buf.push_str(&g);

            // Children with mask/clip support
            let original_node_x = node.x + parent_x;
            let original_node_y = node.y + parent_y;
            render_children_svg(scene, &node.children, buf, original_node_x, original_node_y, true);

            buf.push_str("</g>\n");
        }
        _ => {
            // Leaf nodes: render directly (coords already adjusted)
            render_node_svg(scene, node, buf);
        }
    }
}

fn append_blend_mode(attrs: &mut String, node: &Node) {
    use crate::node::BlendMode;
    if node.blend_mode != BlendMode::Normal {
        attrs.push_str(&format!(r#" style="mix-blend-mode:{}""#, node.blend_mode.to_css()));
    }
}

fn append_transform(attrs: &mut String, node: &Node) {
    let mut transforms = Vec::new();
    if node.x != 0.0 || node.y != 0.0 {
        transforms.push(format!("translate({},{})", node.x, node.y));
    }
    if node.rotation != 0.0 {
        let deg = node.rotation.to_degrees();
        let cx = node.width / 2.0;
        let cy = node.height / 2.0;
        transforms.push(format!("rotate({},{},{})", deg, cx, cy));
    }
    if !transforms.is_empty() {
        attrs.push_str(&format!(r#" transform="{}""#, transforms.join(" ")));
    }
}

fn build_gradient_defs(node: &Node) -> Option<String> {
    let fill = node.fill.as_ref()?;
    match &fill.fill_type {
        FillType::LinearGradient { start_x, start_y, end_x, end_y, stops } => {
            let grad_id = format!("grad-{}", node.id);
            let mut defs = format!(
                r#"<linearGradient id="{}" x1="{}%" y1="{}%" x2="{}%" y2="{}%">"#,
                grad_id, start_x * 100.0, start_y * 100.0, end_x * 100.0, end_y * 100.0
            );
            for stop in stops {
                defs.push_str(&format!(
                    r#"<stop offset="{}%" stop-color="{}" stop-opacity="{}"/>"#,
                    stop.offset * 100.0, color_to_hex(stop.color.r, stop.color.g, stop.color.b), stop.color.a
                ));
            }
            defs.push_str("</linearGradient>");
            Some(defs)
        }
        FillType::RadialGradient { center_x, center_y, radius, stops } => {
            let grad_id = format!("grad-{}", node.id);
            let mut defs = format!(
                r#"<radialGradient id="{}" cx="{}%" cy="{}%" r="{}%">"#,
                grad_id, center_x * 100.0, center_y * 100.0, radius * 100.0
            );
            for stop in stops {
                defs.push_str(&format!(
                    r#"<stop offset="{}%" stop-color="{}" stop-opacity="{}"/>"#,
                    stop.offset * 100.0, color_to_hex(stop.color.r, stop.color.g, stop.color.b), stop.color.a
                ));
            }
            defs.push_str("</radialGradient>");
            Some(defs)
        }
        FillType::Solid { .. } => None,
    }
}

fn append_fill_stroke(attrs: &mut String, node: &Node) {
    if let Some(ref fill) = node.fill {
        match &fill.fill_type {
            FillType::Solid { color: c } => {
                attrs.push_str(&format!(r#" fill="{}""#, color_to_hex(c.r, c.g, c.b)));
                if c.a < 1.0 {
                    attrs.push_str(&format!(r#" fill-opacity="{}""#, c.a));
                }
            }
            FillType::LinearGradient { .. } | FillType::RadialGradient { .. } => {
                attrs.push_str(&format!(r#" fill="url(#grad-{})""#, node.id));
            }
        }
    } else {
        attrs.push_str(r#" fill="none""#);
    }
    if let Some(ref stroke) = node.stroke {
        let c = &stroke.color;
        attrs.push_str(&format!(r#" stroke="{}" stroke-width="{}""#, color_to_hex(c.r, c.g, c.b), stroke.width));
        if c.a < 1.0 {
            attrs.push_str(&format!(r#" stroke-opacity="{}""#, c.a));
        }
        append_stroke_options(attrs, stroke);
    }
}

fn append_stroke_options(attrs: &mut String, stroke: &crate::node::Stroke) {
    if !stroke.dash_array.is_empty() {
        let dash_str: Vec<String> = stroke.dash_array.iter().map(|v| v.to_string()).collect();
        attrs.push_str(&format!(r#" stroke-dasharray="{}""#, dash_str.join(",")));
        if stroke.dash_offset != 0.0 {
            attrs.push_str(&format!(r#" stroke-dashoffset="{}""#, stroke.dash_offset));
        }
    }
    match stroke.line_cap {
        crate::node::LineCap::Round => { attrs.push_str(r#" stroke-linecap="round""#); }
        crate::node::LineCap::Square => { attrs.push_str(r#" stroke-linecap="square""#); }
        crate::node::LineCap::Butt => {} // default
    }
    match stroke.line_join {
        crate::node::LineJoin::Round => { attrs.push_str(r#" stroke-linejoin="round""#); }
        crate::node::LineJoin::Bevel => { attrs.push_str(r#" stroke-linejoin="bevel""#); }
        crate::node::LineJoin::Miter => {} // default
    }
}

/// Export a single node (and its children) as SVG string
pub fn export_node_svg(scene: &Scene, node_id: NodeId) -> String {
    let node = match scene.get_node(node_id) {
        Some(n) => n,
        None => return String::new(),
    };

    let mut body = String::new();
    render_node_svg(scene, node, &mut body);

    format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="{} {} {} {}" width="{}" height="{}">
{}</svg>"#,
        node.x, node.y, node.width, node.height,
        node.width, node.height,
        body
    )
}

/// Export multiple nodes as SVG string
pub fn export_nodes_svg(scene: &Scene, node_ids: &[NodeId]) -> String {
    if node_ids.is_empty() {
        return String::new();
    }

    // Compute bounding box
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;

    for &id in node_ids {
        if let Some(n) = scene.get_node(id) {
            min_x = min_x.min(n.x);
            min_y = min_y.min(n.y);
            max_x = max_x.max(n.x + n.width);
            max_y = max_y.max(n.y + n.height);
        }
    }

    let w = max_x - min_x;
    let h = max_y - min_y;

    let mut body = String::new();
    for &id in node_ids {
        if let Some(node) = scene.get_node(id) {
            render_node_svg(scene, node, &mut body);
        }
    }

    format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="{} {} {} {}" width="{}" height="{}">
{}</svg>"#,
        min_x, min_y, w, h, w, h, body
    )
}

fn build_svg_path_d(points: &[PathPoint], closed: bool) -> String {
    if points.is_empty() { return String::new(); }
    let mut d = format!("M{},{}", points[0].x, points[0].y);
    for i in 1..points.len() {
        let prev = &points[i - 1];
        let curr = &points[i];
        if prev.has_handle_out() || curr.has_handle_in() {
            d.push_str(&format!(" C{},{} {},{} {},{}",
                prev.handle_out_x, prev.handle_out_y,
                curr.handle_in_x, curr.handle_in_y,
                curr.x, curr.y));
        } else {
            d.push_str(&format!(" L{},{}", curr.x, curr.y));
        }
    }
    if closed && points.len() > 1 {
        let last = &points[points.len() - 1];
        let first = &points[0];
        if last.has_handle_out() || first.has_handle_in() {
            d.push_str(&format!(" C{},{} {},{} {},{}",
                last.handle_out_x, last.handle_out_y,
                first.handle_in_x, first.handle_in_y,
                first.x, first.y));
        }
        d.push_str(" Z");
    }
    d
}

/// Export entire scene as SVG
pub fn export_scene_svg(scene: &Scene) -> String {
    let data = scene.export();
    if data.nodes.is_empty() {
        return r#"<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"></svg>"#.to_string();
    }

    // Compute bounding box of all nodes
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;

    for n in &data.nodes {
        min_x = min_x.min(n.x);
        min_y = min_y.min(n.y);
        max_x = max_x.max(n.x + n.width);
        max_y = max_y.max(n.y + n.height);
    }

    let w = max_x - min_x;
    let h = max_y - min_y;

    let mut body = String::new();
    // Render root children in order
    for &id in &data.root_children {
        if let Some(node) = scene.get_node(id) {
            render_node_svg(scene, node, &mut body);
        }
    }

    format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="{} {} {} {}" width="{}" height="{}">
{}</svg>"#,
        min_x, min_y, w, h, w, h, body
    )
}
