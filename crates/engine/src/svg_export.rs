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

fn first_fill_color(node: &Node) -> Option<String> {
    node.visible_fills().next().map(|f| {
        let c = f.color();
        color_to_hex(c.r, c.g, c.b)
    })
}

fn first_stroke_color(node: &Node) -> Option<String> {
    node.first_stroke().map(|s| color_to_hex(s.color.r, s.color.g, s.color.b))
}

fn build_filter_defs(node: &Node, filter_id: &str) -> Option<String> {
    let has_shadows = node.shadows.iter().any(|s| s.visible);
    let has_blur = node.blur > 0.0;
    let has_bitmap = node.bitmap_filter.as_ref().map_or(false, |bf| bf.enabled && !bf.is_identity());
    if !has_shadows && !has_blur && !has_bitmap {
        return None;
    }
    let mut defs = format!(r#"<filter id="{}" x="-50%" y="-50%" width="200%" height="200%">"#, filter_id);
    if has_blur {
        defs.push_str(&format!(r#"<feGaussianBlur in="SourceGraphic" stdDeviation="{}"/>"#, node.blur));
    }
    // Bitmap filters as feComponentTransfer + feColorMatrix
    if let Some(ref bf) = node.bitmap_filter {
        if bf.enabled && !bf.is_identity() {
            // Use feComponentTransfer for brightness/contrast
            if (bf.brightness - 1.0).abs() >= 0.001 || (bf.contrast - 1.0).abs() >= 0.001 {
                let slope = bf.brightness * bf.contrast;
                let intercept = -(0.5 * bf.contrast) + 0.5;
                defs.push_str(&format!(
                    r#"<feComponentTransfer><feFuncR type="linear" slope="{}" intercept="{}"/><feFuncG type="linear" slope="{}" intercept="{}"/><feFuncB type="linear" slope="{}" intercept="{}"/></feComponentTransfer>"#,
                    slope, intercept, slope, intercept, slope, intercept
                ));
            }
            if bf.grayscale.abs() >= 0.001 {
                let g = bf.grayscale.min(1.0);
                let r1 = 0.2126 + 0.7874 * (1.0 - g);
                let g1 = 0.7152 * g;
                let b1 = 0.0722 * g;
                let r2 = 0.2126 * g;
                let g2 = 0.7152 + 0.2848 * (1.0 - g);
                let b2 = 0.0722 * g;
                let r3 = 0.2126 * g;
                let g3 = 0.7152 * g;
                let b3 = 0.0722 + 0.9278 * (1.0 - g);
                defs.push_str(&format!(
                    r#"<feColorMatrix type="matrix" values="{} {} {} 0 0 {} {} {} 0 0 {} {} {} 0 0 0 0 0 1 0"/>"#,
                    r1, g1, b1, r2, g2, b2, r3, g3, b3
                ));
            }
            if bf.sepia.abs() >= 0.001 {
                let s = bf.sepia.min(1.0);
                defs.push_str(&format!(
                    r#"<feColorMatrix type="matrix" values="{} {} {} 0 0 {} {} {} 0 0 {} {} {} 0 0 0 0 0 1 0"/>"#,
                    0.393 * s + (1.0 - s), 0.769 * s, 0.189 * s,
                    0.349 * s, 0.686 * s + (1.0 - s), 0.168 * s,
                    0.272 * s, 0.534 * s, 0.131 * s + (1.0 - s)
                ));
            }
            if (bf.saturation - 1.0).abs() >= 0.001 {
                defs.push_str(&format!(r#"<feColorMatrix type="saturate" values="{}"/>"#, bf.saturation));
            }
            if bf.hue_rotate.abs() >= 0.001 {
                defs.push_str(&format!(r#"<feColorMatrix type="hueRotate" values="{}"/>"#, bf.hue_rotate));
            }
            if bf.invert.abs() >= 0.001 {
                let inv = bf.invert.min(1.0);
                let slope = 1.0 - 2.0 * inv;
                let intercept = inv;
                defs.push_str(&format!(
                    r#"<feComponentTransfer><feFuncR type="linear" slope="{}" intercept="{}"/><feFuncG type="linear" slope="{}" intercept="{}"/><feFuncB type="linear" slope="{}" intercept="{}"/></feComponentTransfer>"#,
                    slope, intercept, slope, intercept, slope, intercept
                ));
            }
        }
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
        NodeKind::Text { content, font_size, font_family, line_height, text_align, font_weight, font_style, text_decoration, letter_spacing, paragraph_spacing, list_style, indent_level, text_transform, text_indent, opentype_features, font_variation_settings } => {
            // Apply text transform for display
            let display_content = text_transform.apply(content);
            let content = &display_content;
            // Text-on-path SVG export
            if let Some(path_id) = node.text_path_id {
                if let Some(path_node) = scene.get_node(path_id) {
                    if let NodeKind::Path { ref points, closed } = path_node.kind {
                        let path_d = crate::path_utils::path_to_svg_d(points, closed);
                        let def_id = format!("textpath-{}", node.id);
                        // Emit defs with the path
                        buf.push_str(&format!("<defs><path id=\"{}\" d=\"{}\"/></defs>\n", def_id, path_d));
                        let mut attrs = String::from("<text");
                        attrs.push_str(&format!(r#" font-family="{}""#, escape_xml(font_family)));
                        attrs.push_str(&format!(r#" font-size="{}""#, font_size));
                        if *font_weight != 400 {
                            attrs.push_str(&format!(r#" font-weight="{}""#, font_weight));
                        }
                        if *font_style == FontStyle::Italic {
                            attrs.push_str(r#" font-style="italic""#);
                        }
                        if let Some(fill) = node.visible_fills().next() {
                            let c = fill.color();
                            attrs.push_str(&format!(r#" fill="{}""#, color_to_hex(c.r, c.g, c.b)));
                            if c.a < 1.0 { attrs.push_str(&format!(r#" fill-opacity="{}""#, c.a)); }
                        }
                        if node.opacity < 1.0 { attrs.push_str(&format!(r#" opacity="{}""#, node.opacity)); }
                        let offset_pct = (node.text_path_offset * 100.0).round();
                        attrs.push_str(&format!("><textPath href=\"#{}\" startOffset=\"{}%\">{}</textPath></text>\n",
                            def_id, offset_pct, escape_xml(content)));
                        buf.push_str(&attrs);
                        return;
                    }
                }
            }

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

            // Text decoration
            let deco_str = match text_decoration {
                crate::node::TextDecoration::Underline => "underline",
                crate::node::TextDecoration::Strikethrough => "line-through",
                crate::node::TextDecoration::UnderlineStrikethrough => "underline line-through",
                crate::node::TextDecoration::None => "",
            };
            if !deco_str.is_empty() {
                attrs.push_str(&format!(r#" text-decoration="{}""#, deco_str));
            }

            // Letter spacing
            if *letter_spacing != 0.0 {
                attrs.push_str(&format!(r#" letter-spacing="{}""#, letter_spacing));
            }

            // Fill color for text
            if let Some(fill) = node.visible_fills().next() {
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

            // Style attribute for text-transform, text-indent, font-feature-settings
            {
                let mut style_parts = Vec::new();
                let tt_css = text_transform.to_css();
                if tt_css != "none" {
                    style_parts.push(format!("text-transform:{}", tt_css));
                }
                if *text_indent != 0.0 {
                    style_parts.push(format!("text-indent:{}px", text_indent));
                }
                let ot_css = opentype_features.to_css();
                if !ot_css.is_empty() {
                    style_parts.push(format!("font-feature-settings:{}", ot_css));
                }
                if opentype_features.small_caps {
                    style_parts.push("font-variant-caps:small-caps".to_string());
                }
                if !font_variation_settings.is_empty() {
                    let fvs: Vec<String> = font_variation_settings.iter()
                        .map(|(tag, val)| format!("\"{}\" {}", tag, val))
                        .collect();
                    style_parts.push(format!("font-variation-settings:{}", fvs.join(",")));
                }
                if !style_parts.is_empty() {
                    attrs.push_str(&format!(r#" style="{}""#, style_parts.join(";")));
                }
            }

            // Indent offset
            let indent_px = *indent_level as f64 * font_size * 1.5;
            let text_x_indented = text_x + indent_px;

            // List prefix helper
            let get_list_prefix = |idx: usize| -> String {
                match list_style {
                    crate::node::ListStyle::None => String::new(),
                    crate::node::ListStyle::Bullet => match indent_level {
                        0 => "• ".to_string(),
                        1 => "◦ ".to_string(),
                        _ => "▪ ".to_string(),
                    },
                    crate::node::ListStyle::Numbered => format!("{}. ", idx + 1),
                    crate::node::ListStyle::Dash => "– ".to_string(),
                    crate::node::ListStyle::Checkbox => "☐ ".to_string(),
                    crate::node::ListStyle::CheckboxChecked => "☑ ".to_string(),
                }
            };

            // Multi-line: split by newline
            let lines: Vec<&str> = content.split('\n').collect();
            if lines.len() <= 1 {
                attrs.push('>');
                let prefix = get_list_prefix(0);
                attrs.push_str(&escape_xml(&format!("{}{}", prefix, content)));
                attrs.push_str("</text>\n");
            } else {
                attrs.push_str(">\n");
                let line_h = font_size * line_height;
                for (i, line) in lines.iter().enumerate() {
                    let prefix = get_list_prefix(i);
                    let prefixed = format!("{}{}", prefix, escape_xml(line));
                    if i == 0 {
                        attrs.push_str(&format!(r#"<tspan x="{}">{}</tspan>"#, text_x_indented, prefixed));
                    } else {
                        let dy = line_h + paragraph_spacing;
                        attrs.push_str(&format!(r#"<tspan x="{}" dy="{}">{}</tspan>"#, text_x_indented, dy, prefixed));
                    }
                    attrs.push('\n');
                }
                attrs.push_str("</text>\n");
            }
            buf.push_str(&attrs);
        }
        NodeKind::Section | NodeKind::Frame | NodeKind::Group => {
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
            if matches!(node.kind, NodeKind::Frame | NodeKind::Section) {
                let mut rect_attrs = format!(r#"<rect width="{}" height="{}""#, node.width, node.height);
                if node.corner_radius > 0.0 {
                    rect_attrs.push_str(&format!(r#" rx="{}" ry="{}""#, node.corner_radius, node.corner_radius));
                }
                if let Some(fill) = node.visible_fills().next() {
                    append_fill_ref(&mut rect_attrs, &fill.fill_type, node.id);
                }
                for stroke in node.visible_strokes() {
                    let c = &stroke.color;
                    rect_attrs.push_str(&format!(r#" stroke="{}" stroke-width="{}""#, color_to_hex(c.r, c.g, c.b), stroke.width));
                    if c.a < 1.0 {
                        rect_attrs.push_str(&format!(r#" stroke-opacity="{}""#, c.a));
                    }
                    append_stroke_options(&mut rect_attrs, stroke);
                    // SVG only supports one stroke per element; break after first visible
                    break;
                }
                rect_attrs.push_str("/>\n");
                g.push_str(&rect_attrs);
            }

            // Clip children for Hidden/Scroll overflow
            let clip_overflow = (node.clip_content || node.overflow != crate::node::Overflow::Visible)
                && matches!(node.kind, NodeKind::Frame | NodeKind::Section);
            if clip_overflow {
                let clip_id = format!("clip-overflow-{}", node.id);
                g.push_str(&format!(
                    r#"<defs><clipPath id="{}"><rect width="{}" height="{}"{}/></clipPath></defs>"#,
                    clip_id, node.width, node.height,
                    if node.corner_radius > 0.0 { format!(r#" rx="{}" ry="{}""#, node.corner_radius, node.corner_radius) } else { String::new() }
                ));
                g.push_str(&format!(r#"<g clip-path="url(#{})">"#, clip_id));
                if node.overflow.scrolls() && (node.scroll_x != 0.0 || node.scroll_y != 0.0) {
                    let tx = if node.overflow.scrolls_x() { node.scroll_x } else { 0.0 };
                    let ty = if node.overflow.scrolls_y() { node.scroll_y } else { 0.0 };
                    g.push_str(&format!(r#"<g transform="translate({},{})">"#, tx, ty));
                }
            }

            // Render children with mask/clip support
            render_children_svg(scene, &node.children, &mut g, node.x, node.y, true);

            if clip_overflow {
                if node.overflow.scrolls() && (node.scroll_x != 0.0 || node.scroll_y != 0.0) {
                    g.push_str("</g>");
                }
                g.push_str("</g>");
            }

            g.push_str("</g>\n");
            buf.push_str(&g);
            return; // already handled children
        }
        NodeKind::Path { ref points, closed } => {
            if points.is_empty() { return; }
            let has_variable = points.iter().any(|p| p.stroke_width > 0.0);
            if has_variable {
                // Export variable-width stroke as a filled outline shape
                let default_width = node.first_stroke().map(|s| s.width).unwrap_or(2.0);
                let stroke_color = node.first_stroke().map(|s| color_to_hex(s.color.r, s.color.g, s.color.b)).unwrap_or_else(|| "#ffffff".to_string());
                let stroke_alpha = node.first_stroke().map(|s| s.color.a).unwrap_or(1.0);

                // First render fills if any
                if node.visible_fills().next().is_some() {
                    let d = build_svg_path_d(points, *closed);
                    let mut attrs = format!(r#"<path d="{}""#, d);
                    if let Some(fill) = node.visible_fills().next() {
                        match &fill.fill_type {
                            crate::node::FillType::Solid { color } => {
                                attrs.push_str(&format!(r#" fill="{}""#, color_to_hex(color.r, color.g, color.b)));
                                if color.a < 1.0 { attrs.push_str(&format!(r#" fill-opacity="{}""#, color.a)); }
                            }
                            _ => { attrs.push_str(r#" fill="gray""#); }
                        }
                    }
                    attrs.push_str(r#" stroke="none""#);
                    attrs.push_str("/>\n");
                    buf.push_str(&attrs);
                }

                // Build variable-width outline
                let outline_d = build_variable_width_outline_d(points, *closed, default_width);
                if !outline_d.is_empty() {
                    let mut attrs = format!(r#"<path d="{}" fill="{}" stroke="none""#, outline_d, stroke_color);
                    if stroke_alpha < 1.0 { attrs.push_str(&format!(r#" fill-opacity="{}""#, stroke_alpha)); }
                    if has_opacity { attrs.push_str(&format!(r#" opacity="{}""#, node.opacity)); }
                    append_blend_mode(&mut attrs, node);
                    attrs.push_str(&filter_attr);
                    attrs.push_str("/>\n");
                    buf.push_str(&attrs);
                }
            } else {
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
        }
        NodeKind::VectorNetwork(ref vn) => {
            let mut group = String::from("<g");
            if has_opacity { group.push_str(&format!(r#" opacity="{}""#, node.opacity)); }
            append_blend_mode(&mut group, node);
            group.push_str(&filter_attr);
            group.push_str(">\n");
            // Render regions as filled paths
            for region in &vn.regions {
                let d = vn.region_to_svg_d(region);
                if !d.is_empty() {
                    let mut attrs = format!(r#"<path d="{}""#, d);
                    // Use node fill
                    if let Some(fill) = node.visible_fills().next() {
                        match &fill.fill_type {
                            crate::node::FillType::Solid { color } => {
                                attrs.push_str(&format!(r#" fill="{}""#, color_to_hex(color.r, color.g, color.b)));
                                if color.a < 1.0 { attrs.push_str(&format!(r#" fill-opacity="{}""#, color.a)); }
                            }
                            _ => { attrs.push_str(r#" fill="gray""#); }
                        }
                    } else {
                        attrs.push_str(r#" fill="none""#);
                    }
                    attrs.push_str(r#" stroke="none""#);
                    attrs.push_str("/>\n");
                    group.push_str(&attrs);
                }
            }
            // Render all segments as stroked paths
            for seg in &vn.segments {
                let d = vn.segment_to_svg_d(seg);
                if !d.is_empty() {
                    let mut attrs = format!(r#"<path d="{}" fill="none""#, d);
                    if let Some(stroke) = node.visible_strokes().next() {
                        attrs.push_str(&format!(r#" stroke="{}" stroke-width="{}""#, color_to_hex(stroke.color.r, stroke.color.g, stroke.color.b), stroke.width));
                    }
                    attrs.push_str("/>\n");
                    group.push_str(&attrs);
                }
            }
            group.push_str("</g>\n");
            buf.push_str(&group);
        }
        NodeKind::Image { ref src, ref fit, .. } => {
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
        NodeKind::Star { points, inner_radius } => {
            let cx = node.x + node.width / 2.0;
            let cy = node.y + node.height / 2.0;
            let rx = node.width / 2.0;
            let ry = node.height / 2.0;
            let n = (*points).max(3) as usize;
            let angle_step = std::f64::consts::TAU / (n as f64 * 2.0);
            let start_angle = -std::f64::consts::FRAC_PI_2;
            let mut d = String::new();
            for i in 0..(n * 2) {
                let angle = start_angle + angle_step * i as f64;
                let (r_x, r_y) = if i % 2 == 0 { (rx, ry) } else { (rx * inner_radius, ry * inner_radius) };
                let px = cx + angle.cos() * r_x;
                let py = cy + angle.sin() * r_y;
                if i == 0 { d.push_str(&format!("M{},{}", px, py)); }
                else { d.push_str(&format!(" L{},{}", px, py)); }
            }
            d.push_str(" Z");
            let mut attrs = format!(r#"<path d="{}""#, d);
            append_fill_stroke(&mut attrs, node);
            if has_opacity { attrs.push_str(&format!(r#" opacity="{}""#, node.opacity)); }
            append_blend_mode(&mut attrs, node);
            attrs.push_str(&filter_attr);
            attrs.push_str("/>\n");
            buf.push_str(&attrs);
        }
        NodeKind::Polygon { sides } => {
            let cx = node.x + node.width / 2.0;
            let cy = node.y + node.height / 2.0;
            let rx = node.width / 2.0;
            let ry = node.height / 2.0;
            let n = (*sides).max(3) as usize;
            let angle_step = std::f64::consts::TAU / n as f64;
            let start_angle = -std::f64::consts::FRAC_PI_2;
            let pts: Vec<String> = (0..n).map(|i| {
                let angle = start_angle + angle_step * i as f64;
                format!("{},{}", cx + angle.cos() * rx, cy + angle.sin() * ry)
            }).collect();
            let mut attrs = format!(r#"<polygon points="{}""#, pts.join(" "));
            append_fill_stroke(&mut attrs, node);
            if has_opacity { attrs.push_str(&format!(r#" opacity="{}""#, node.opacity)); }
            append_blend_mode(&mut attrs, node);
            attrs.push_str(&filter_attr);
            attrs.push_str("/>\n");
            buf.push_str(&attrs);
        }
        NodeKind::Table { rows, cols, ref cells, ref col_widths, ref row_heights } => {
            let mut g = format!(r#"<g transform="translate({},{})">"#, node.x, node.y);
            if has_opacity { g = format!(r#"<g transform="translate({},{})" opacity="{}">"#, node.x, node.y, node.opacity); }

            let default_cw = node.width / (*cols).max(1) as f64;
            let default_rh = node.height / (*rows).max(1) as f64;

            let mut cx_arr: Vec<f64> = vec![0.0; *cols as usize + 1];
            for c in 0..*cols as usize { cx_arr[c + 1] = cx_arr[c] + col_widths.get(c).copied().unwrap_or(default_cw); }
            let mut ry_arr: Vec<f64> = vec![0.0; *rows as usize + 1];
            for r in 0..*rows as usize { ry_arr[r + 1] = ry_arr[r] + row_heights.get(r).copied().unwrap_or(default_rh); }

            // Background
            if let Some(fill) = node.visible_fills().next() {
                let c = fill.color();
                g.push_str(&format!(r#"<rect width="{}" height="{}" fill="{}" fill-opacity="{}"/>"#,
                    cx_arr[*cols as usize], ry_arr[*rows as usize], color_to_hex(c.r, c.g, c.b), c.a));
            }

            // Cell fills & text
            for cell in cells {
                let x = cx_arr.get(cell.col as usize).copied().unwrap_or(0.0);
                let y = ry_arr.get(cell.row as usize).copied().unwrap_or(0.0);
                let w: f64 = (cell.col..cell.col + cell.col_span).map(|c| col_widths.get(c as usize).copied().unwrap_or(default_cw)).sum();
                let h: f64 = (cell.row..cell.row + cell.row_span).map(|r| row_heights.get(r as usize).copied().unwrap_or(default_rh)).sum();
                if let Some(ref color) = cell.fill {
                    g.push_str(&format!(r#"<rect x="{}" y="{}" width="{}" height="{}" fill="{}" fill-opacity="{}"/>"#,
                        x, y, w, h, color_to_hex(color.r, color.g, color.b), color.a));
                }
                if !cell.content.is_empty() {
                    let anchor = match cell.text_align {
                        crate::node::TableCellAlign::Left => "start",
                        crate::node::TableCellAlign::Center => "middle",
                        crate::node::TableCellAlign::Right => "end",
                    };
                    let tx = match cell.text_align {
                        crate::node::TableCellAlign::Left => x + 4.0,
                        crate::node::TableCellAlign::Center => x + w / 2.0,
                        crate::node::TableCellAlign::Right => x + w - 4.0,
                    };
                    g.push_str(&format!(r#"<text x="{}" y="{}" font-size="12" text-anchor="{}" dominant-baseline="central">{}</text>"#,
                        tx, y + h / 2.0, anchor, escape_xml(&cell.content)));
                }
            }

            // Grid lines
            let stroke_hex = node.first_stroke().map(|s| color_to_hex(s.color.r, s.color.g, s.color.b)).unwrap_or_else(|| "#cccccc".to_string());
            let sw = node.first_stroke().map(|s| s.width).unwrap_or(1.0);
            for r in 0..=*rows as usize {
                g.push_str(&format!(r#"<line x1="0" y1="{}" x2="{}" y2="{}" stroke="{}" stroke-width="{}"/>"#,
                    ry_arr[r], cx_arr[*cols as usize], ry_arr[r], stroke_hex, sw));
            }
            for c in 0..=*cols as usize {
                g.push_str(&format!(r#"<line x1="{}" y1="0" x2="{}" y2="{}" stroke="{}" stroke-width="{}"/>"#,
                    cx_arr[c], cx_arr[c], ry_arr[*rows as usize], stroke_hex, sw));
            }

            g.push_str("</g>\n");
            buf.push_str(&g);
        }
        NodeKind::StickyNote { ref content, font_size, ref theme, .. } => {
            let (bg, text_color) = match theme.as_str() {
                "green" => ("#c6f6d5", "#1a4731"),
                "blue" => ("#bee3f8", "#1a365d"),
                "pink" => ("#fed7e2", "#521b41"),
                "orange" => ("#feebc8", "#652b19"),
                "purple" => ("#e9d8fd", "#322659"),
                "gray" => ("#e2e8f0", "#1a202c"),
                _ => ("#fefcbf", "#744210"),
            };
            buf.push_str(&format!(
                r#"<g><rect x="{}" y="{}" width="{}" height="{}" rx="4" fill="{}" stroke="{}" stroke-width="1""#,
                node.x, node.y, node.width, node.height, bg, bg
            ));
            if has_opacity { buf.push_str(&format!(r#" opacity="{}""#, node.opacity)); }
            buf.push_str("/>\n");
            // Text
            let padding = 12.0;
            buf.push_str(&format!(
                r#"<text x="{}" y="{}" font-size="{}" fill="{}" font-family="Inter, system-ui, sans-serif"><tspan>{}</tspan></text>"#,
                node.x + padding, node.y + padding + *font_size, font_size, text_color, escape_xml(content)
            ));
            buf.push_str("</g>\n");
        }
        NodeKind::Slice => {
            // Slice nodes are export regions — not rendered in SVG
            return;
        }
        NodeKind::Connector { start_node_id, end_node_id, start_x, end_x, start_y, end_y, ref path_type, end_arrow, start_arrow, .. } => {
            // Resolve endpoints
            let mut sx = *start_x;
            let mut sy = *start_y;
            let mut ex = *end_x;
            let mut ey = *end_y;
            if *start_node_id != 0 {
                if let Some(n) = scene.get_node(*start_node_id) {
                    sx = n.x + n.width / 2.0;
                    sy = n.y + n.height / 2.0;
                }
            }
            if *end_node_id != 0 {
                if let Some(n) = scene.get_node(*end_node_id) {
                    ex = n.x + n.width / 2.0;
                    ey = n.y + n.height / 2.0;
                }
            }

            // Arrow marker defs
            let marker_id = format!("arrow-{}", node.id);
            let stroke_hex = node.first_stroke()
                .map(|s| color_to_hex(s.color.r, s.color.g, s.color.b))
                .unwrap_or_else(|| "#ffffff".to_string());
            let mut defs = String::new();
            if *end_arrow || *start_arrow {
                defs.push_str("<defs>");
                defs.push_str(&format!(
                    r#"<marker id="{}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="{}"/></marker>"#,
                    marker_id, stroke_hex
                ));
                defs.push_str("</defs>\n");
            }
            buf.push_str(&defs);

            let mut attrs = String::new();
            if path_type == "curved" {
                let cx1 = sx + (ex - sx) * 0.5;
                let cy1 = sy;
                let cx2 = sx + (ex - sx) * 0.5;
                let cy2 = ey;
                attrs.push_str(&format!(r#"<path d="M{},{} C{},{} {},{} {},{}""#, sx, sy, cx1, cy1, cx2, cy2, ex, ey));
            } else {
                attrs.push_str(&format!(r#"<line x1="{}" y1="{}" x2="{}" y2="{}""#, sx, sy, ex, ey));
            }
            attrs.push_str(r#" fill="none""#);
            if let Some(stroke) = node.first_stroke() {
                attrs.push_str(&format!(r#" stroke="{}" stroke-width="{}""#, color_to_hex(stroke.color.r, stroke.color.g, stroke.color.b), stroke.width));
                append_stroke_options(&mut attrs, stroke);
            } else {
                attrs.push_str(r##" stroke="#ffffff" stroke-width="2""##);
            }
            if *end_arrow {
                attrs.push_str(&format!(r#" marker-end="url(#{})""#, marker_id));
            }
            if *start_arrow {
                attrs.push_str(&format!(r#" marker-start="url(#{})""#, marker_id));
            }
            if has_opacity { attrs.push_str(&format!(r#" opacity="{}""#, node.opacity)); }
            attrs.push_str("/>\n");
            buf.push_str(&attrs);
        }
        NodeKind::Callout { ref content, font_size, tail_x, tail_y, tail_width, ref theme } => {
            let x = node.x;
            let y = node.y;
            let w = node.width;
            let h = node.height;
            let r = node.corner_radius.min(w / 2.0).min(h / 2.0);

            let (bg, border, txt) = match theme.as_str() {
                "yellow" => ("#FFF9C4", "#F9A825", "#5D4037"),
                "red"    => ("#FFCDD2", "#E53935", "#B71C1C"),
                "green"  => ("#C8E6C9", "#43A047", "#1B5E20"),
                "gray"   => ("#F5F5F5", "#9E9E9E", "#424242"),
                _        => ("#BBDEFB", "#1E88E5", "#0D47A1"),
            };

            let fill_str = first_fill_color(node).unwrap_or_else(|| bg.to_string());
            let stroke_str = first_stroke_color(node).unwrap_or_else(|| border.to_string());

            // Body rect
            buf.push_str(&format!(
                r#"<rect x="{}" y="{}" width="{}" height="{}" rx="{}" fill="{}" stroke="{}" stroke-width="1.5"/>"#,
                x, y, w, h, r, fill_str, stroke_str
            ));
            buf.push('\n');

            // Tail triangle
            let cx = x + w / 2.0;
            let cy = y + h / 2.0;
            let hw = tail_width / 2.0;
            let dx = tail_x - cx;
            let dy = tail_y - cy;
            let (bx, by, px, py) = if dx.abs() / w > dy.abs() / h {
                if dx > 0.0 { (x + w, cy.max(y + r).min(y + h - r), 0.0, 1.0) }
                else { (x, cy.max(y + r).min(y + h - r), 0.0, 1.0) }
            } else {
                if dy > 0.0 { (cx.max(x + r).min(x + w - r), y + h, 1.0, 0.0) }
                else { (cx.max(x + r).min(x + w - r), y, 1.0, 0.0) }
            };
            buf.push_str(&format!(
                r#"<polygon points="{},{} {},{} {},{}" fill="{}" stroke="{}" stroke-width="1.5"/>"#,
                bx - px * hw, by - py * hw, *tail_x, *tail_y, bx + px * hw, by + py * hw, fill_str, stroke_str
            ));
            buf.push('\n');

            // Text
            if !content.is_empty() {
                buf.push_str(&format!(
                    r#"<text x="{}" y="{}" font-size="{}" fill="{}" font-family="Inter, system-ui, sans-serif">{}</text>"#,
                    x + 8.0, y + 8.0 + font_size, font_size, txt, escape_xml(content)
                ));
                buf.push('\n');
            }
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
        NodeKind::Rect | NodeKind::Frame | NodeKind::Section | NodeKind::Instance(_) | NodeKind::Image { .. } => {
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
        NodeKind::Star { points, inner_radius } => {
            let cx = node.x + node.width / 2.0;
            let cy = node.y + node.height / 2.0;
            let rx = node.width / 2.0;
            let ry = node.height / 2.0;
            let n = (*points).max(3) as usize;
            let angle_step = std::f64::consts::TAU / (n as f64 * 2.0);
            let start_angle = -std::f64::consts::FRAC_PI_2;
            let mut d = String::new();
            for i in 0..(n * 2) {
                let angle = start_angle + angle_step * i as f64;
                let (r_x, r_y) = if i % 2 == 0 { (rx, ry) } else { (rx * inner_radius, ry * inner_radius) };
                let px = cx + angle.cos() * r_x;
                let py = cy + angle.sin() * r_y;
                if i == 0 { d.push_str(&format!("M{},{}", px, py)); }
                else { d.push_str(&format!(" L{},{}", px, py)); }
            }
            d.push_str(" Z");
            buf.push_str(&format!(r#"<path d="{}"/>"#, d));
            buf.push('\n');
        }
        NodeKind::Polygon { sides } => {
            let cx = node.x + node.width / 2.0;
            let cy = node.y + node.height / 2.0;
            let rx = node.width / 2.0;
            let ry = node.height / 2.0;
            let n = (*sides).max(3) as usize;
            let angle_step = std::f64::consts::TAU / n as f64;
            let start_angle = -std::f64::consts::FRAC_PI_2;
            let pts: Vec<String> = (0..n).map(|i| {
                let angle = start_angle + angle_step * i as f64;
                format!("{},{}", cx + angle.cos() * rx, cy + angle.sin() * ry)
            }).collect();
            buf.push_str(&format!(r#"<polygon points="{}"/>"#, pts.join(" ")));
            buf.push('\n');
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
            if matches!(node.kind, NodeKind::Frame | NodeKind::Section) {
                let mut rect_attrs = format!(r#"<rect width="{}" height="{}""#, node.width, node.height);
                if node.corner_radius > 0.0 {
                    rect_attrs.push_str(&format!(r#" rx="{}" ry="{}""#, node.corner_radius, node.corner_radius));
                }
                if let Some(fill) = node.visible_fills().next() {
                    append_fill_ref(&mut rect_attrs, &fill.fill_type, node.id);
                }
                if let Some(ref stroke) = node.first_stroke() {
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
    // 3D perspective via CSS transform (SVG style attribute)
    if let Some(ref p) = node.perspective {
        let has_3d = p.rotate_x.abs() > 0.001 || p.rotate_y.abs() > 0.001 || p.rotate_z.abs() > 0.001;
        if has_3d {
            let mut parts = Vec::new();
            if p.perspective > 0.0 {
                parts.push(format!("perspective({}px)", p.perspective));
            }
            if p.rotate_x.abs() > 0.001 { parts.push(format!("rotateX({}deg)", p.rotate_x)); }
            if p.rotate_y.abs() > 0.001 { parts.push(format!("rotateY({}deg)", p.rotate_y)); }
            if p.rotate_z.abs() > 0.001 { parts.push(format!("rotateZ({}deg)", p.rotate_z)); }
            let origin = format!("{}% {}%", p.origin_x * 100.0, p.origin_y * 100.0);
            attrs.push_str(&format!(
                r#" style="transform: {}; transform-origin: {};""#,
                parts.join(" "), origin
            ));
        }
    }
}

fn append_fill_ref(attrs: &mut String, fill_type: &FillType, node_id: u64) {
    match fill_type {
        FillType::Solid { color: c } => {
            attrs.push_str(&format!(r#" fill="{}""#, color_to_hex(c.r, c.g, c.b)));
            if c.a < 1.0 {
                attrs.push_str(&format!(r#" fill-opacity="{}""#, c.a));
            }
        }
        FillType::LinearGradient { .. } | FillType::RadialGradient { .. } | FillType::ConicGradient { .. } => {
            attrs.push_str(&format!(r#" fill="url(#grad-{})""#, node_id));
        }
        FillType::Pattern { .. } => {
            attrs.push_str(&format!(r#" fill="url(#pat-{})""#, node_id));
        }
        FillType::NoiseFill { .. } | FillType::DotPattern { .. } | FillType::CrosshatchFill { .. } => {
            attrs.push_str(&format!(r#" fill="url(#tex-{})""#, node_id));
        }
        FillType::GradientMesh { .. } => {
            // Mesh gradients use a rasterized fallback pattern
            attrs.push_str(&format!(r#" fill="url(#mesh-{})""#, node_id));
        }
    }
}

fn build_gradient_defs(node: &Node) -> Option<String> {
    let fill = node.first_fill()?;
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
        FillType::ConicGradient { center_x, center_y, angle, stops } => {
            // SVG doesn't support conic gradients natively; approximate with arc segments
            let grad_id = format!("grad-{}", node.id);
            let num_segments = 72u32; // 5-degree segments
            let cx_pct = center_x * 100.0;
            let cy_pct = center_y * 100.0;
            let start_rad = angle.to_radians();
            let r = 50.0; // radius in % (large enough to cover)

            let mut svg = format!(r#"<g id="{}">"#, grad_id);
            for i in 0..num_segments {
                let t0 = i as f64 / num_segments as f64;
                let t1 = (i + 1) as f64 / num_segments as f64;
                let t_mid = (t0 + t1) / 2.0;

                // Interpolate color
                let color = interpolate_stops(stops, t_mid);

                let a0 = start_rad + t0 * std::f64::consts::TAU;
                let a1 = start_rad + t1 * std::f64::consts::TAU;

                // SVG arc segment as a path from center
                let x0 = cx_pct + a0.cos() * r;
                let y0 = cy_pct + a0.sin() * r;
                let x1 = cx_pct + a1.cos() * r;
                let y1 = cy_pct + a1.sin() * r;

                svg.push_str(&format!(
                    r#"<path d="M{}%,{}% L{}%,{}% A{}%,{}% 0 0,1 {}%,{}% Z" fill="{}" fill-opacity="{}"/>"#,
                    cx_pct, cy_pct, x0, y0, r, r, x1, y1,
                    color_to_hex(color.r, color.g, color.b), color.a
                ));
            }
            svg.push_str("</g>");
            Some(svg)
        }
                FillType::Solid { .. } => None,
        FillType::NoiseFill { scale, color1, color2, intensity, seed } => {
            // SVG noise via feTurbulence filter
            let filter_id = format!("tex-filter-{}", node.id);
            let pat_id = format!("tex-{}", node.id);
            let base_freq = 1.0 / scale.max(1.0);
            Some(format!(
                r#"<filter id="{fid}" x="0%" y="0%" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="{bf}" numOctaves="4" seed="{seed}" result="noise"/><feColorMatrix type="matrix" values="{r1} 0 0 0 {r0n} 0 {g1} 0 0 {g0n} 0 0 {b1} 0 {b0n} 0 0 0 {int} {a0}" in="noise"/></filter><rect id="{pid}" width="100%" height="100%" filter="url(#{fid})"/>"#,
                fid = filter_id, pid = pat_id, bf = base_freq, seed = seed,
                int = intensity,
                r1 = (color2.r as f64 - color1.r as f64) / 255.0,
                g1 = (color2.g as f64 - color1.g as f64) / 255.0,
                b1 = (color2.b as f64 - color1.b as f64) / 255.0,
                r0n = color1.r as f64 / 255.0,
                g0n = color1.g as f64 / 255.0,
                b0n = color1.b as f64 / 255.0,
                a0 = color1.a,
            ))
        }
        FillType::DotPattern { dot_radius, spacing, color, bg_color, angle } => {
            let pat_id = format!("tex-{}", node.id);
            let sp = spacing.max(2.0);
            let r = *dot_radius;
            let transform = if *angle != 0.0 { format!(r#" patternTransform="rotate({})""#, angle) } else { String::new() };
            Some(format!(
                r#"<pattern id="{id}" patternUnits="userSpaceOnUse" width="{sp}" height="{sp}"{tr}><rect width="{sp}" height="{sp}" fill="{bg}"/><circle cx="{half}" cy="{half}" r="{r}" fill="{fg}"/></pattern>"#,
                id = pat_id, sp = sp, r = r,
                half = sp / 2.0,
                bg = color_to_hex(bg_color.r, bg_color.g, bg_color.b),
                fg = color_to_hex(color.r, color.g, color.b),
                tr = transform,
            ))
        }
        FillType::CrosshatchFill { spacing, line_width, color, bg_color, angle, density } => {
            let pat_id = format!("tex-{}", node.id);
            let sp = spacing.max(2.0);
            let lw = *line_width;
            let transform = if *angle != 0.0 { format!(r#" patternTransform="rotate({})""#, angle) } else { String::new() };
            let fg = color_to_hex(color.r, color.g, color.b);
            let bg = color_to_hex(bg_color.r, bg_color.g, bg_color.b);
            let mut lines = format!(
                r#"<line x1="0" y1="{half}" x2="{sp}" y2="{half}" stroke="{fg}" stroke-width="{lw}"/>"#,
                half = sp / 2.0, sp = sp, fg = fg, lw = lw,
            );
            if *density >= 2 {
                lines.push_str(&format!(
                    r#"<line x1="{half}" y1="0" x2="{half}" y2="{sp}" stroke="{fg}" stroke-width="{lw}"/>"#,
                    half = sp / 2.0, sp = sp, fg = fg, lw = lw,
                ));
            }
            Some(format!(
                r#"<pattern id="{id}" patternUnits="userSpaceOnUse" width="{sp}" height="{sp}"{tr}><rect width="{sp}" height="{sp}" fill="{bg}"/>{lines}</pattern>"#,
                id = pat_id, sp = sp, bg = bg, lines = lines, tr = transform,
            ))
        }
        FillType::GradientMesh { ref mesh } => {
            // SVG2 mesh gradient is not widely supported, so we generate a series of
            // small rect elements with bilinearly interpolated colors as a fallback.
            let pat_id = format!("mesh-{}", node.id);
            let subdivs = 8u32;
            let mut svg = format!(r#"<g id="{}">"#, pat_id);
            for r in 0..(mesh.rows.saturating_sub(1)) {
                for c in 0..(mesh.cols.saturating_sub(1)) {
                    let tl = match mesh.get_point(r, c) { Some(p) => p, None => continue };
                    let tr_pt = match mesh.get_point(r, c + 1) { Some(p) => p, None => continue };
                    let bl = match mesh.get_point(r + 1, c) { Some(p) => p, None => continue };
                    let br = match mesh.get_point(r + 1, c + 1) { Some(p) => p, None => continue };
                    for sy in 0..subdivs {
                        for sx in 0..subdivs {
                            let u = (sx as f64 + 0.5) / subdivs as f64;
                            let v = (sy as f64 + 0.5) / subdivs as f64;
                            let px = tl.x * (1.0 - u) * (1.0 - v) + tr_pt.x * u * (1.0 - v) + bl.x * (1.0 - u) * v + br.x * u * v;
                            let py = tl.y * (1.0 - u) * (1.0 - v) + tr_pt.y * u * (1.0 - v) + bl.y * (1.0 - u) * v + br.y * u * v;
                            let cr = (tl.color.r as f64 * (1.0 - u) * (1.0 - v) + tr_pt.color.r as f64 * u * (1.0 - v) + bl.color.r as f64 * (1.0 - u) * v + br.color.r as f64 * u * v) as u8;
                            let cg = (tl.color.g as f64 * (1.0 - u) * (1.0 - v) + tr_pt.color.g as f64 * u * (1.0 - v) + bl.color.g as f64 * (1.0 - u) * v + br.color.g as f64 * u * v) as u8;
                            let cb = (tl.color.b as f64 * (1.0 - u) * (1.0 - v) + tr_pt.color.b as f64 * u * (1.0 - v) + bl.color.b as f64 * (1.0 - u) * v + br.color.b as f64 * u * v) as u8;
                            let w_frac = 1.0 / subdivs as f64;
                            svg.push_str(&format!(
                                r#"<rect x="{}%" y="{}%" width="{}%" height="{}%" fill="{}"/>"#,
                                (px - w_frac / 2.0) * 100.0, (py - w_frac / 2.0) * 100.0,
                                w_frac * 100.0 * 1.1, w_frac * 100.0 * 1.1,
                                color_to_hex(cr, cg, cb)
                            ));
                        }
                    }
                }
            }
            svg.push_str("</g>");
            Some(svg)
        }
        FillType::Pattern { src, scale, rotation, pattern_type, tile_width, tile_height } => {
            let pat_id = format!("pat-{}", node.id);
            let tw = if *tile_width > 0.0 { *tile_width * scale } else { 50.0 * scale };
            let th = if *tile_height > 0.0 { *tile_height * scale } else { 50.0 * scale };
            let offset_y = match pattern_type {
                crate::node::PatternType::Brick => th / 2.0,
                crate::node::PatternType::Hex => th * 0.75,
                _ => 0.0,
            };
            let mut defs = format!(
                r#"<pattern id="{}" patternUnits="userSpaceOnUse" width="{}" height="{}"{}>"#,
                pat_id, tw, th,
                if *rotation != 0.0 { format!(r#" patternTransform="rotate({})""#, rotation) } else { String::new() }
            );
            if offset_y > 0.0 {
                // For brick/hex, add a second offset tile
                defs.push_str(&format!(
                    r#"<image href="{}" width="{}" height="{}" />"#,
                    src, tw, th
                ));
                defs.push_str(&format!(
                    r#"<image href="{}" x="{}" y="{}" width="{}" height="{}" />"#,
                    src, tw / 2.0, offset_y, tw, th
                ));
            } else {
                defs.push_str(&format!(
                    r#"<image href="{}" width="{}" height="{}" />"#,
                    src, tw, th
                ));
            }
            defs.push_str("</pattern>");
            Some(defs)
        }
    }
}

fn interpolate_stops(stops: &[crate::node::GradientStop], t: f64) -> crate::types::Color {
    use crate::types::Color;
    if stops.is_empty() { return Color::white(); }
    if stops.len() == 1 || t <= stops[0].offset { return stops[0].color; }
    if t >= stops[stops.len() - 1].offset { return stops[stops.len() - 1].color; }
    for i in 1..stops.len() {
        if t <= stops[i].offset {
            let prev = &stops[i - 1];
            let curr = &stops[i];
            let range = curr.offset - prev.offset;
            let frac = if range > 0.0 { (t - prev.offset) / range } else { 0.0 };
            return Color {
                r: (prev.color.r as f64 + (curr.color.r as f64 - prev.color.r as f64) * frac) as u8,
                g: (prev.color.g as f64 + (curr.color.g as f64 - prev.color.g as f64) * frac) as u8,
                b: (prev.color.b as f64 + (curr.color.b as f64 - prev.color.b as f64) * frac) as u8,
                a: prev.color.a + (curr.color.a - prev.color.a) * frac,
            };
        }
    }
    stops[stops.len() - 1].color
}

fn append_fill_stroke(attrs: &mut String, node: &Node) {
    if let Some(fill) = node.visible_fills().next() {
        match &fill.fill_type {
            FillType::Solid { color: c } => {
                attrs.push_str(&format!(r#" fill="{}""#, color_to_hex(c.r, c.g, c.b)));
                if c.a < 1.0 {
                    attrs.push_str(&format!(r#" fill-opacity="{}""#, c.a));
                }
            }
            FillType::LinearGradient { .. } | FillType::RadialGradient { .. } | FillType::ConicGradient { .. } => {
                attrs.push_str(&format!(r#" fill="url(#grad-{})""#, node.id));
            }
            FillType::Pattern { .. } => {
                attrs.push_str(&format!(r#" fill="url(#pat-{})""#, node.id));
            }
            FillType::NoiseFill { .. } | FillType::DotPattern { .. } | FillType::CrosshatchFill { .. } => {
                attrs.push_str(&format!(r#" fill="url(#tex-{})""#, node.id));
            }
            FillType::GradientMesh { .. } => {
                attrs.push_str(&format!(r#" fill="url(#mesh-{})""#, node.id));
            }
        }
    } else {
        attrs.push_str(r#" fill="none""#);
    }
    if let Some(ref stroke) = node.first_stroke() {
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
    match stroke.align {
        crate::node::StrokeAlign::Inside => {
            attrs.push_str(r#" data-stroke-align="inside""#);
        }
        crate::node::StrokeAlign::Outside => {
            attrs.push_str(r#" paint-order="stroke" data-stroke-align="outside""#);
        }
        crate::node::StrokeAlign::Center => {} // default
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

/// Build an SVG path d-attribute for a variable-width stroke outline
fn build_variable_width_outline_d(points: &[PathPoint], closed: bool, default_width: f64) -> String {
    if points.len() < 2 { return String::new(); }

    let segments_per_curve = 16;
    let mut samples: Vec<(f64, f64, f64)> = Vec::new();

    let ew = |p: &PathPoint| -> f64 {
        if p.stroke_width > 0.0 { p.stroke_width } else { default_width }
    };

    let cubic_pt = |x0: f64, y0: f64, x1: f64, y1: f64, x2: f64, y2: f64, x3: f64, y3: f64, t: f64| -> (f64, f64) {
        let u = 1.0 - t;
        let uu = u * u;
        let tt = t * t;
        (u*uu*x0 + 3.0*uu*t*x1 + 3.0*u*tt*x2 + t*tt*x3,
         u*uu*y0 + 3.0*uu*t*y1 + 3.0*u*tt*y2 + t*tt*y3)
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
                cubic_pt(p0.x, p0.y, p0.handle_out_x, p0.handle_out_y, p1.handle_in_x, p1.handle_in_y, p1.x, p1.y, t)
            } else {
                (p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t)
            };
            samples.push((x, y, (w0 + (w1 - w0) * t) / 2.0));
        }
    }
    let last_idx = if closed { 0 } else { points.len() - 1 };
    let lp = &points[last_idx];
    samples.push((lp.x, lp.y, ew(lp) / 2.0));

    if samples.len() < 2 { return String::new(); }

    let n = samples.len();
    let mut left: Vec<(f64, f64)> = Vec::with_capacity(n);
    let mut right: Vec<(f64, f64)> = Vec::with_capacity(n);

    for i in 0..n {
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

    let mut d = format!("M{:.2},{:.2}", left[0].0, left[0].1);
    for i in 1..n {
        d.push_str(&format!(" L{:.2},{:.2}", left[i].0, left[i].1));
    }
    for i in (0..n).rev() {
        d.push_str(&format!(" L{:.2},{:.2}", right[i].0, right[i].1));
    }
    d.push_str(" Z");
    d
}

/// Export a rectangular region of the scene as SVG (for slice export)
pub fn export_region_svg(scene: &Scene, rx: f64, ry: f64, rw: f64, rh: f64) -> String {
    let mut body = String::new();
    let data = scene.export();
    for &id in &data.root_children {
        if let Some(node) = scene.get_node(id) {
            // Include nodes that intersect the region
            if node.x + node.width >= rx && node.x <= rx + rw
                && node.y + node.height >= ry && node.y <= ry + rh
                && !matches!(node.kind, NodeKind::Slice)
            {
                render_node_svg(scene, node, &mut body);
            }
        }
    }
    format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="{} {} {} {}" width="{}" height="{}">
{}</svg>"#,
        rx, ry, rw, rh, rw, rh, body
    )
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

/// Export scene SVG with <animateMotion> elements for motion path tracks in a clip.
pub fn export_scene_svg_with_animations(scene: &Scene, clip_id: u64) -> String {
    use crate::animation::AnimProperty;

    let data = scene.export();
    if data.nodes.is_empty() {
        return r#"<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"></svg>"#.to_string();
    }

    // Compute bounding box
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

    // Collect motion path tracks from the clip
    let motion_tracks: Vec<(NodeId, u64, bool, f64, u32, bool)> = if let Some(clip) = data.animations.get_clip(clip_id) {
        clip.tracks.iter().filter_map(|t| {
            if t.property == AnimProperty::MotionPath {
                if let Some(ref config) = t.motion_path {
                    let dur = t.duration_ms();
                    return Some((t.node_id, config.path_node_id, config.orient_to_path, config.rotation_offset, dur, clip.looping));
                }
            }
            None
        }).collect()
    } else {
        vec![]
    };

    let mut body = String::new();
    let mut path_defs = String::new();

    // Render root children; for nodes with motion path, wrap with <animateMotion>
    for &id in &data.root_children {
        if let Some(node) = scene.get_node(id) {
            render_node_with_animate_motion(scene, node, &mut body, &mut path_defs, &motion_tracks);
        }
    }

    let defs_section = if path_defs.is_empty() {
        String::new()
    } else {
        format!("<defs>\n{}</defs>\n", path_defs)
    };

    format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="{} {} {} {}" width="{}" height="{}">
{}{}</svg>"#,
        min_x, min_y, w, h, w, h, defs_section, body
    )
}

fn render_node_with_animate_motion(
    scene: &Scene,
    node: &Node,
    buf: &mut String,
    path_defs: &mut String,
    motion_tracks: &[(NodeId, u64, bool, f64, u32, bool)],
) {
    if !node.visible { return; }

    // Check if this node has a motion path track
    let motion = motion_tracks.iter().find(|t| t.0 == node.id);

    if let Some(&(_, path_node_id, orient, _rot_offset, dur_ms, looping)) = motion {
        if let Some(path_node) = scene.get_node(path_node_id) {
            if let NodeKind::Path { ref points, closed } = path_node.kind {
                let path_d = crate::path_utils::path_to_svg_d(points, closed);
                let dur_s = dur_ms as f64 / 1000.0;
                let repeat = if looping { "indefinite" } else { "1" };
                let rotate = if orient { "auto" } else { "0" };
                let def_id = format!("motion-path-{}", path_node_id);

                // Add path to defs
                path_defs.push_str(&format!(
                    r#"<path id="{}" d="{}"/>"#, def_id, path_d
                ));
                path_defs.push('\n');

                // Wrap node in a <g> with animateMotion
                buf.push_str("<g>\n");
                render_node_svg(scene, node, buf);
                buf.push_str(&format!(
                    "  <animateMotion dur=\"{}s\" repeatCount=\"{}\" rotate=\"{}\" fill=\"freeze\"><mpath href=\"#{}\"/></animateMotion>",
                    dur_s, repeat, rotate, def_id
                ));
                buf.push_str("\n</g>\n");
                return;
            }
        }
    }

    // No motion path — render normally
    render_node_svg(scene, node, buf);
}
