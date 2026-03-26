//! SVG Import — parse SVG markup and create OpenSketch nodes.
//!
//! Supports: rect, ellipse/circle, line, polyline, polygon, path, text, g (group),
//! with fill, stroke, opacity, transform, and gradient definitions.

use crate::node::*;
use crate::types::Color;
use crate::scene::Scene;

/// Import SVG text into the scene at the given offset.
/// Returns the IDs of newly created top-level nodes.
pub fn import_svg(scene: &mut Scene, svg_text: &str, offset_x: f64, offset_y: f64) -> Vec<NodeId> {
    let doc = match roxmltree::Document::parse(svg_text) {
        Ok(d) => d,
        Err(_) => return Vec::new(),
    };

    let svg_elem = doc.root_element();
    if svg_elem.tag_name().name() != "svg" {
        // Try to find <svg> child
        let mut found = None;
        for child in svg_elem.children() {
            if child.is_element() && child.tag_name().name() == "svg" {
                found = Some(child);
                break;
            }
        }
        if found.is_none() {
            return Vec::new();
        }
    }

    // Collect gradient defs
    let mut gradients = GradientDefs::new();
    collect_defs(&svg_elem, &mut gradients);

    let mut created_ids = Vec::new();
    let root = if svg_elem.tag_name().name() == "svg" { svg_elem } else {
        svg_elem.children().find(|c| c.is_element() && c.tag_name().name() == "svg").unwrap()
    };

    for child in root.children() {
        if !child.is_element() { continue; }
        if child.tag_name().name() == "defs" || child.tag_name().name() == "style" { continue; }
        if let Some(id) = import_element(scene, &child, None, offset_x, offset_y, &gradients) {
            created_ids.push(id);
        }
    }

    created_ids
}

// ---- Gradient definitions ----

struct GradientDef {
    kind: GradientKind,
    stops: Vec<GradientStop>,
    // For linear
    x1: f64, y1: f64, x2: f64, y2: f64,
    // For radial
    cx: f64, cy: f64, r: f64,
}

enum GradientKind { Linear, Radial }

struct GradientDefs {
    map: Vec<(String, GradientDef)>,
}

impl GradientDefs {
    fn new() -> Self { Self { map: Vec::new() } }
    fn get(&self, id: &str) -> Option<&GradientDef> {
        self.map.iter().find(|(k, _)| k == id).map(|(_, v)| v)
    }
}

fn collect_defs(elem: &roxmltree::Node, gradients: &mut GradientDefs) {
    for child in elem.children() {
        if !child.is_element() { continue; }
        let tag = child.tag_name().name();
        if tag == "defs" {
            collect_defs(&child, gradients);
            continue;
        }
        if tag == "linearGradient" || tag == "radialGradient" {
            if let Some(id) = child.attribute("id") {
                let mut stops = Vec::new();
                for stop in child.children() {
                    if stop.is_element() && stop.tag_name().name() == "stop" {
                        let offset = parse_percent_or_float(stop.attribute("offset").unwrap_or("0"));
                        let color = parse_stop_color(&stop);
                        stops.push(GradientStop { offset, color });
                    }
                }
                let def = if tag == "linearGradient" {
                    GradientDef {
                        kind: GradientKind::Linear,
                        stops,
                        x1: attr_f64(&child, "x1", 0.0),
                        y1: attr_f64(&child, "y1", 0.0),
                        x2: attr_f64(&child, "x2", 1.0),
                        y2: attr_f64(&child, "y2", 0.0),
                        cx: 0.5, cy: 0.5, r: 0.5,
                    }
                } else {
                    GradientDef {
                        kind: GradientKind::Radial,
                        stops,
                        x1: 0.0, y1: 0.0, x2: 1.0, y2: 0.0,
                        cx: attr_f64(&child, "cx", 0.5),
                        cy: attr_f64(&child, "cy", 0.5),
                        r: attr_f64(&child, "r", 0.5),
                    }
                };
                gradients.map.push((id.to_string(), def));
            }
        }
        // Recurse into nested elements
        if child.has_children() {
            collect_defs(&child, gradients);
        }
    }
}

fn parse_stop_color(stop: &roxmltree::Node) -> Color {
    // Check stop-color attribute or style
    let color_str = stop.attribute("stop-color")
        .or_else(|| {
            stop.attribute("style").and_then(|s| {
                parse_style_prop(s, "stop-color")
            })
        });
    let opacity = stop.attribute("stop-opacity")
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(1.0);
    let mut c = color_str.map(|s| parse_color(s)).unwrap_or(Color { r: 0, g: 0, b: 0, a: 1.0 });
    c.a *= opacity;
    c
}

// ---- Element import ----

fn import_element(
    scene: &mut Scene,
    elem: &roxmltree::Node,
    parent_id: Option<NodeId>,
    offset_x: f64,
    offset_y: f64,
    gradients: &GradientDefs,
) -> Option<NodeId> {
    let tag = elem.tag_name().name();
    match tag {
        "rect" => import_rect(scene, elem, parent_id, offset_x, offset_y, gradients),
        "circle" => import_circle(scene, elem, parent_id, offset_x, offset_y, gradients),
        "ellipse" => import_ellipse(scene, elem, parent_id, offset_x, offset_y, gradients),
        "line" => import_line(scene, elem, parent_id, offset_x, offset_y, gradients),
        "polyline" | "polygon" => import_polyline(scene, elem, parent_id, offset_x, offset_y, gradients, tag == "polygon"),
        "path" => import_path(scene, elem, parent_id, offset_x, offset_y, gradients),
        "text" => import_text(scene, elem, parent_id, offset_x, offset_y, gradients),
        "g" => import_group(scene, elem, parent_id, offset_x, offset_y, gradients),
        "image" => import_image(scene, elem, parent_id, offset_x, offset_y),
        "use" => None, // TODO
        _ => {
            // Try to recurse into unknown containers
            if elem.has_children() {
                let mut first_id = None;
                for child in elem.children() {
                    if child.is_element() {
                        if let Some(id) = import_element(scene, &child, parent_id, offset_x, offset_y, gradients) {
                            if first_id.is_none() { first_id = Some(id); }
                        }
                    }
                }
                first_id
            } else {
                None
            }
        }
    }
}

fn import_rect(scene: &mut Scene, elem: &roxmltree::Node, parent_id: Option<NodeId>, ox: f64, oy: f64, gradients: &GradientDefs) -> Option<NodeId> {
    let x = attr_f64(elem, "x", 0.0) + ox;
    let y = attr_f64(elem, "y", 0.0) + oy;
    let w = attr_f64(elem, "width", 100.0);
    let h = attr_f64(elem, "height", 100.0);
    let rx = attr_f64(elem, "rx", 0.0);
    let ry = attr_f64(elem, "ry", rx); // SVG: ry defaults to rx

    let mut node = Node::new(0, NodeKind::Rect);
    node.x = x; node.y = y; node.width = w; node.height = h;
    node.corner_radius = rx.max(ry);
    node.name = elem.attribute("id").unwrap_or("Rect").to_string();
    node.parent = parent_id;
    apply_style(elem, &mut node, gradients);
    apply_transform(elem, &mut node);
    Some(scene.add_node(node))
}

fn import_circle(scene: &mut Scene, elem: &roxmltree::Node, parent_id: Option<NodeId>, ox: f64, oy: f64, gradients: &GradientDefs) -> Option<NodeId> {
    let cx = attr_f64(elem, "cx", 0.0);
    let cy = attr_f64(elem, "cy", 0.0);
    let r = attr_f64(elem, "r", 50.0);

    let mut node = Node::new(0, NodeKind::Ellipse);
    node.x = cx - r + ox; node.y = cy - r + oy;
    node.width = r * 2.0; node.height = r * 2.0;
    node.name = elem.attribute("id").unwrap_or("Ellipse").to_string();
    node.parent = parent_id;
    apply_style(elem, &mut node, gradients);
    apply_transform(elem, &mut node);
    Some(scene.add_node(node))
}

fn import_ellipse(scene: &mut Scene, elem: &roxmltree::Node, parent_id: Option<NodeId>, ox: f64, oy: f64, gradients: &GradientDefs) -> Option<NodeId> {
    let cx = attr_f64(elem, "cx", 0.0);
    let cy = attr_f64(elem, "cy", 0.0);
    let rx = attr_f64(elem, "rx", 50.0);
    let ry = attr_f64(elem, "ry", 50.0);

    let mut node = Node::new(0, NodeKind::Ellipse);
    node.x = cx - rx + ox; node.y = cy - ry + oy;
    node.width = rx * 2.0; node.height = ry * 2.0;
    node.name = elem.attribute("id").unwrap_or("Ellipse").to_string();
    node.parent = parent_id;
    apply_style(elem, &mut node, gradients);
    apply_transform(elem, &mut node);
    Some(scene.add_node(node))
}

fn import_line(scene: &mut Scene, elem: &roxmltree::Node, parent_id: Option<NodeId>, ox: f64, oy: f64, gradients: &GradientDefs) -> Option<NodeId> {
    let x1 = attr_f64(elem, "x1", 0.0);
    let y1 = attr_f64(elem, "y1", 0.0);
    let x2 = attr_f64(elem, "x2", 100.0);
    let y2 = attr_f64(elem, "y2", 0.0);

    let points = vec![
        PathPoint::corner(x1 + ox, y1 + oy),
        PathPoint::corner(x2 + ox, y2 + oy),
    ];
    let (bx, by, bw, bh) = path_bounds(&points);

    let mut node = Node::new(0, NodeKind::Path { points, closed: false });
    node.x = bx; node.y = by; node.width = bw.max(1.0); node.height = bh.max(1.0);
    node.name = elem.attribute("id").unwrap_or("Line").to_string();
    node.parent = parent_id;
    node.fills = vec![]; // Lines typically have no fill
    apply_style(elem, &mut node, gradients);
    apply_transform(elem, &mut node);
    Some(scene.add_node(node))
}

fn import_polyline(scene: &mut Scene, elem: &roxmltree::Node, parent_id: Option<NodeId>, ox: f64, oy: f64, gradients: &GradientDefs, closed: bool) -> Option<NodeId> {
    let pts_str = elem.attribute("points").unwrap_or("");
    let points = parse_point_list(pts_str, ox, oy);
    if points.is_empty() { return None; }
    let (bx, by, bw, bh) = path_bounds(&points);

    let mut node = Node::new(0, NodeKind::Path { points, closed });
    node.x = bx; node.y = by; node.width = bw.max(1.0); node.height = bh.max(1.0);
    node.name = elem.attribute("id").unwrap_or(if closed { "Polygon" } else { "Polyline" }).to_string();
    node.parent = parent_id;
    apply_style(elem, &mut node, gradients);
    apply_transform(elem, &mut node);
    Some(scene.add_node(node))
}

fn import_path(scene: &mut Scene, elem: &roxmltree::Node, parent_id: Option<NodeId>, ox: f64, oy: f64, gradients: &GradientDefs) -> Option<NodeId> {
    let d = elem.attribute("d").unwrap_or("");
    let (points, closed) = parse_svg_path_d(d, ox, oy);
    if points.is_empty() { return None; }
    let (bx, by, bw, bh) = path_bounds(&points);

    let mut node = Node::new(0, NodeKind::Path { points, closed });
    node.x = bx; node.y = by; node.width = bw.max(1.0); node.height = bh.max(1.0);
    node.name = elem.attribute("id").unwrap_or("Path").to_string();
    node.parent = parent_id;
    apply_style(elem, &mut node, gradients);
    apply_transform(elem, &mut node);
    Some(scene.add_node(node))
}

fn import_text(scene: &mut Scene, elem: &roxmltree::Node, parent_id: Option<NodeId>, ox: f64, oy: f64, gradients: &GradientDefs) -> Option<NodeId> {
    let x = attr_f64(elem, "x", 0.0) + ox;
    let y = attr_f64(elem, "y", 0.0) + oy;

    // Collect text content from children
    let mut content = String::new();
    collect_text_content(elem, &mut content);
    let content = content.trim().to_string();
    if content.is_empty() { return None; }

    let font_size = get_style_f64(elem, "font-size", 16.0);
    let font_family = get_style_str(elem, "font-family").unwrap_or_else(|| "Inter".to_string());
    let font_weight = get_style_f64(elem, "font-weight", 400.0) as u16;
    let text_align = match get_style_str(elem, "text-anchor").as_deref() {
        Some("middle") => TextAlign::Center,
        Some("end") => TextAlign::Right,
        _ => TextAlign::Left,
    };
    let font_style = if get_style_str(elem, "font-style").as_deref() == Some("italic") {
        FontStyle::Italic
    } else {
        FontStyle::Normal
    };

    let mut node = Node::new(0, NodeKind::Text {
        content,
        font_size,
        font_family: font_family.trim_matches(|c: char| c == '\'' || c == '"').to_string(),
        line_height: 1.2,
        text_align,
        font_weight,
        font_style,
        text_decoration: TextDecoration::None,
        letter_spacing: 0.0,
        paragraph_spacing: 0.0,
        list_style: ListStyle::None,
        indent_level: 0,
        text_transform: TextTransform::None,
        text_indent: 0.0,
        opentype_features: OpenTypeFeatures::default(),
    });
    // Position text: SVG y is baseline, approximate by shifting up by font_size
    node.x = x;
    node.y = y - font_size;
    node.width = 200.0; // Will be auto-sized by TS side
    node.height = font_size * 1.4;
    node.name = elem.attribute("id").unwrap_or("Text").to_string();
    node.parent = parent_id;
    apply_style(elem, &mut node, gradients);
    apply_transform(elem, &mut node);
    Some(scene.add_node(node))
}

fn collect_text_content(elem: &roxmltree::Node, out: &mut String) {
    for child in elem.children() {
        if child.is_text() {
            out.push_str(child.text().unwrap_or(""));
        } else if child.is_element() {
            // <tspan> etc
            collect_text_content(&child, out);
        }
    }
}

fn import_group(scene: &mut Scene, elem: &roxmltree::Node, parent_id: Option<NodeId>, ox: f64, oy: f64, gradients: &GradientDefs) -> Option<NodeId> {
    // Create a Group node, then import children
    let mut group = Node::new(0, NodeKind::Group);
    group.name = elem.attribute("id").unwrap_or("Group").to_string();
    group.parent = parent_id;
    group.fills = vec![];
    apply_transform(elem, &mut group);
    let group_id = scene.add_node(group);

    let mut has_children = false;
    for child in elem.children() {
        if !child.is_element() { continue; }
        if child.tag_name().name() == "defs" { continue; }
        if import_element(scene, &child, Some(group_id), ox, oy, gradients).is_some() {
            has_children = true;
        }
    }

    if !has_children {
        // Remove empty group
        scene.remove_node(group_id);
        return None;
    }

    // Update group bounds from children
    update_group_bounds(scene, group_id);
    Some(group_id)
}

fn import_image(scene: &mut Scene, elem: &roxmltree::Node, parent_id: Option<NodeId>, ox: f64, oy: f64) -> Option<NodeId> {
    let href = elem.attribute("href")
        .or_else(|| elem.attribute(("http://www.w3.org/1999/xlink", "href")))
        .unwrap_or("");
    if href.is_empty() { return None; }

    let x = attr_f64(elem, "x", 0.0) + ox;
    let y = attr_f64(elem, "y", 0.0) + oy;
    let w = attr_f64(elem, "width", 100.0);
    let h = attr_f64(elem, "height", 100.0);

    let mut node = Node::new(0, NodeKind::Image {
        src: href.to_string(),
        fit: "cover".to_string(),
    });
    node.x = x; node.y = y; node.width = w; node.height = h;
    node.name = elem.attribute("id").unwrap_or("Image").to_string();
    node.parent = parent_id;
    node.fills = vec![];
    apply_transform(elem, &mut node);
    Some(scene.add_node(node))
}

fn update_group_bounds(scene: &mut Scene, group_id: NodeId) {
    let children: Vec<NodeId> = scene.get_node(group_id)
        .map(|n| n.children.clone())
        .unwrap_or_default();
    if children.is_empty() { return; }

    let mut min_x = f64::MAX;
    let mut min_y = f64::MAX;
    let mut max_x = f64::MIN;
    let mut max_y = f64::MIN;

    for cid in &children {
        if let Some(c) = scene.get_node(*cid) {
            min_x = min_x.min(c.x);
            min_y = min_y.min(c.y);
            max_x = max_x.max(c.x + c.width);
            max_y = max_y.max(c.y + c.height);
        }
    }

    if let Some(g) = scene.get_node_mut(group_id) {
        g.x = min_x;
        g.y = min_y;
        g.width = (max_x - min_x).max(1.0);
        g.height = (max_y - min_y).max(1.0);
    }
}

// ---- Style application ----

fn apply_style(elem: &roxmltree::Node, node: &mut Node, gradients: &GradientDefs) {
    // Fill
    let fill_str = get_style_str(elem, "fill")
        .or_else(|| elem.attribute("fill").map(|s| s.to_string()));

    match fill_str.as_deref() {
        Some("none") => { node.fills = vec![]; }
        Some(s) if s.starts_with("url(") => {
            if let Some(grad_id) = extract_url_id(s) {
                if let Some(def) = gradients.get(grad_id) {
                    let fill = match def.kind {
                        GradientKind::Linear => Fill {
                            fill_type: FillType::LinearGradient {
                                start_x: def.x1, start_y: def.y1,
                                end_x: def.x2, end_y: def.y2,
                                stops: def.stops.clone(),
                            },
                            visible: true,
                        },
                        GradientKind::Radial => Fill {
                            fill_type: FillType::RadialGradient {
                                center_x: def.cx, center_y: def.cy,
                                radius: def.r,
                                stops: def.stops.clone(),
                            },
                            visible: true,
                        },
                    };
                    node.fills = vec![fill];
                }
            }
        }
        Some(s) => {
            let color = parse_color(s);
            let fill_opacity = get_style_f64(elem, "fill-opacity", 1.0);
            node.fills = vec![Fill::solid(Color { r: color.r, g: color.g, b: color.b, a: color.a * fill_opacity })];
        }
        None => {
            // SVG default fill is black
            // Keep default fill if no fill attribute specified
        }
    }

    // Stroke
    let stroke_str = get_style_str(elem, "stroke")
        .or_else(|| elem.attribute("stroke").map(|s| s.to_string()));
    if let Some(s) = stroke_str.as_deref() {
        if s != "none" {
            let color = parse_color(s);
            let width = get_style_f64(elem, "stroke-width", 1.0);
            let stroke_opacity = get_style_f64(elem, "stroke-opacity", 1.0);
            let mut stroke = Stroke::new(
                Color { r: color.r, g: color.g, b: color.b, a: color.a * stroke_opacity },
                width,
            );
            // Dash array
            if let Some(dash) = get_style_str(elem, "stroke-dasharray")
                .or_else(|| elem.attribute("stroke-dasharray").map(|s| s.to_string()))
            {
                if dash != "none" {
                    stroke.dash_array = dash.split(|c: char| c == ',' || c == ' ')
                        .filter(|s| !s.is_empty())
                        .filter_map(|s| s.trim().parse().ok())
                        .collect();
                }
            }
            // Line cap
            if let Some(cap) = get_style_str(elem, "stroke-linecap")
                .or_else(|| elem.attribute("stroke-linecap").map(|s| s.to_string()))
            {
                stroke.line_cap = match cap.as_str() {
                    "round" => LineCap::Round,
                    "square" => LineCap::Square,
                    _ => LineCap::Butt,
                };
            }
            // Line join
            if let Some(join) = get_style_str(elem, "stroke-linejoin")
                .or_else(|| elem.attribute("stroke-linejoin").map(|s| s.to_string()))
            {
                stroke.line_join = match join.as_str() {
                    "round" => LineJoin::Round,
                    "bevel" => LineJoin::Bevel,
                    _ => LineJoin::Miter,
                };
            }
            node.strokes = vec![stroke];
        }
    }

    // Opacity
    let opacity = get_style_f64(elem, "opacity", 1.0);
    node.opacity = opacity;
}

fn apply_transform(elem: &roxmltree::Node, node: &mut Node) {
    let transform = elem.attribute("transform").unwrap_or("");
    if transform.is_empty() { return; }

    // Parse simple transforms: translate, rotate, scale
    // For translate, adjust x/y. For rotate, set rotation.
    for part in split_transforms(transform) {
        let part = part.trim();
        if part.starts_with("translate(") {
            let vals = extract_transform_values(part);
            if vals.len() >= 1 { node.x += vals[0]; }
            if vals.len() >= 2 { node.y += vals[1]; }
        } else if part.starts_with("rotate(") {
            let vals = extract_transform_values(part);
            if vals.len() >= 1 { node.rotation = vals[0]; }
        }
        // scale and matrix are harder — skip for now, would need full transform decomposition
    }
}

fn split_transforms(s: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut depth = 0;
    let mut start = 0;
    for (i, c) in s.char_indices() {
        match c {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth == 0 {
                    result.push(s[start..=i].trim().to_string());
                    start = i + 1;
                }
            }
            _ => {}
        }
    }
    result
}

fn extract_transform_values(s: &str) -> Vec<f64> {
    let start = s.find('(').map(|i| i + 1).unwrap_or(0);
    let end = s.find(')').unwrap_or(s.len());
    s[start..end]
        .split(|c: char| c == ',' || c == ' ')
        .filter(|s| !s.is_empty())
        .filter_map(|s| s.trim().parse().ok())
        .collect()
}

// ---- SVG path d attribute parser ----

fn parse_svg_path_d(d: &str, ox: f64, oy: f64) -> (Vec<PathPoint>, bool) {
    let mut points: Vec<PathPoint> = Vec::new();
    let mut closed = false;
    let mut cx = 0.0_f64;  // current point
    let mut cy = 0.0_f64;
    let mut start_x = 0.0_f64;  // subpath start
    let mut start_y = 0.0_f64;

    let tokens = tokenize_path_d(d);
    let mut i = 0;

    while i < tokens.len() {
        let cmd = tokens[i].clone();
        i += 1;

        match cmd.as_str() {
            "M" => {
                // Absolute moveto
                while i + 1 < tokens.len() && is_number(&tokens[i]) {
                    cx = parse_num(&tokens[i]); i += 1;
                    cy = parse_num(&tokens[i]); i += 1;
                    start_x = cx; start_y = cy;
                    // If there are more coords after M, they're treated as L
                    if !points.is_empty() || i + 1 >= tokens.len() || !is_number(&tokens[i]) {
                        break;
                    }
                }
                points.push(PathPoint::corner(cx + ox, cy + oy));
                // Subsequent coords are lineto
                while i + 1 < tokens.len() && is_number(&tokens[i]) {
                    cx = parse_num(&tokens[i]); i += 1;
                    cy = parse_num(&tokens[i]); i += 1;
                    points.push(PathPoint::corner(cx + ox, cy + oy));
                }
            }
            "m" => {
                // Relative moveto
                if i + 1 < tokens.len() && is_number(&tokens[i]) {
                    cx += parse_num(&tokens[i]); i += 1;
                    cy += parse_num(&tokens[i]); i += 1;
                    start_x = cx; start_y = cy;
                }
                points.push(PathPoint::corner(cx + ox, cy + oy));
                while i + 1 < tokens.len() && is_number(&tokens[i]) {
                    cx += parse_num(&tokens[i]); i += 1;
                    cy += parse_num(&tokens[i]); i += 1;
                    points.push(PathPoint::corner(cx + ox, cy + oy));
                }
            }
            "L" => {
                while i + 1 < tokens.len() && is_number(&tokens[i]) {
                    cx = parse_num(&tokens[i]); i += 1;
                    cy = parse_num(&tokens[i]); i += 1;
                    points.push(PathPoint::corner(cx + ox, cy + oy));
                }
            }
            "l" => {
                while i + 1 < tokens.len() && is_number(&tokens[i]) {
                    cx += parse_num(&tokens[i]); i += 1;
                    cy += parse_num(&tokens[i]); i += 1;
                    points.push(PathPoint::corner(cx + ox, cy + oy));
                }
            }
            "H" => {
                while i < tokens.len() && is_number(&tokens[i]) {
                    cx = parse_num(&tokens[i]); i += 1;
                    points.push(PathPoint::corner(cx + ox, cy + oy));
                }
            }
            "h" => {
                while i < tokens.len() && is_number(&tokens[i]) {
                    cx += parse_num(&tokens[i]); i += 1;
                    points.push(PathPoint::corner(cx + ox, cy + oy));
                }
            }
            "V" => {
                while i < tokens.len() && is_number(&tokens[i]) {
                    cy = parse_num(&tokens[i]); i += 1;
                    points.push(PathPoint::corner(cx + ox, cy + oy));
                }
            }
            "v" => {
                while i < tokens.len() && is_number(&tokens[i]) {
                    cy += parse_num(&tokens[i]); i += 1;
                    points.push(PathPoint::corner(cx + ox, cy + oy));
                }
            }
            "C" => {
                while i + 5 < tokens.len() && is_number(&tokens[i]) {
                    let cp1x = parse_num(&tokens[i]) + ox; i += 1;
                    let cp1y = parse_num(&tokens[i]) + oy; i += 1;
                    let cp2x = parse_num(&tokens[i]) + ox; i += 1;
                    let cp2y = parse_num(&tokens[i]) + oy; i += 1;
                    cx = parse_num(&tokens[i]); i += 1;
                    cy = parse_num(&tokens[i]); i += 1;
                    // Set handle_out on previous point
                    if let Some(prev) = points.last_mut() {
                        prev.handle_out_x = cp1x;
                        prev.handle_out_y = cp1y;
                    }
                    let mut pt = PathPoint::corner(cx + ox, cy + oy);
                    pt.handle_in_x = cp2x;
                    pt.handle_in_y = cp2y;
                    points.push(pt);
                }
            }
            "c" => {
                while i + 5 < tokens.len() && is_number(&tokens[i]) {
                    let cp1x = cx + parse_num(&tokens[i]); i += 1;
                    let cp1y = cy + parse_num(&tokens[i]); i += 1;
                    let cp2x = cx + parse_num(&tokens[i]); i += 1;
                    let cp2y = cy + parse_num(&tokens[i]); i += 1;
                    let nx = cx + parse_num(&tokens[i]); i += 1;
                    let ny = cy + parse_num(&tokens[i]); i += 1;
                    if let Some(prev) = points.last_mut() {
                        prev.handle_out_x = cp1x + ox;
                        prev.handle_out_y = cp1y + oy;
                    }
                    let mut pt = PathPoint::corner(nx + ox, ny + oy);
                    pt.handle_in_x = cp2x + ox;
                    pt.handle_in_y = cp2y + oy;
                    points.push(pt);
                    cx = nx; cy = ny;
                }
            }
            "S" => {
                while i + 3 < tokens.len() && is_number(&tokens[i]) {
                    let cp2x = parse_num(&tokens[i]) + ox; i += 1;
                    let cp2y = parse_num(&tokens[i]) + oy; i += 1;
                    cx = parse_num(&tokens[i]); i += 1;
                    cy = parse_num(&tokens[i]); i += 1;
                    // Reflect previous handle
                    if let Some(prev) = points.last_mut() {
                        let rx = 2.0 * prev.x - prev.handle_in_x;
                        let ry = 2.0 * prev.y - prev.handle_in_y;
                        prev.handle_out_x = rx;
                        prev.handle_out_y = ry;
                    }
                    let mut pt = PathPoint::corner(cx + ox, cy + oy);
                    pt.handle_in_x = cp2x;
                    pt.handle_in_y = cp2y;
                    points.push(pt);
                }
            }
            "s" => {
                while i + 3 < tokens.len() && is_number(&tokens[i]) {
                    let cp2x = cx + parse_num(&tokens[i]); i += 1;
                    let cp2y = cy + parse_num(&tokens[i]); i += 1;
                    let nx = cx + parse_num(&tokens[i]); i += 1;
                    let ny = cy + parse_num(&tokens[i]); i += 1;
                    if let Some(prev) = points.last_mut() {
                        let rx = 2.0 * prev.x - prev.handle_in_x;
                        let ry = 2.0 * prev.y - prev.handle_in_y;
                        prev.handle_out_x = rx;
                        prev.handle_out_y = ry;
                    }
                    let mut pt = PathPoint::corner(nx + ox, ny + oy);
                    pt.handle_in_x = cp2x + ox;
                    pt.handle_in_y = cp2y + oy;
                    points.push(pt);
                    cx = nx; cy = ny;
                }
            }
            "Q" => {
                // Quadratic bezier — convert to cubic approximation
                while i + 3 < tokens.len() && is_number(&tokens[i]) {
                    let qx = parse_num(&tokens[i]) + ox; i += 1;
                    let qy = parse_num(&tokens[i]) + oy; i += 1;
                    cx = parse_num(&tokens[i]); i += 1;
                    cy = parse_num(&tokens[i]); i += 1;
                    if let Some(prev) = points.last_mut() {
                        // Convert Q to C: cp1 = p0 + 2/3*(q-p0), cp2 = p1 + 2/3*(q-p1)
                        prev.handle_out_x = prev.x + 2.0/3.0 * (qx - prev.x);
                        prev.handle_out_y = prev.y + 2.0/3.0 * (qy - prev.y);
                    }
                    let mut pt = PathPoint::corner(cx + ox, cy + oy);
                    pt.handle_in_x = (cx + ox) + 2.0/3.0 * (qx - (cx + ox));
                    pt.handle_in_y = (cy + oy) + 2.0/3.0 * (qy - (cy + oy));
                    points.push(pt);
                }
            }
            "q" => {
                while i + 3 < tokens.len() && is_number(&tokens[i]) {
                    let qx = cx + parse_num(&tokens[i]); i += 1;
                    let qy = cy + parse_num(&tokens[i]); i += 1;
                    let nx = cx + parse_num(&tokens[i]); i += 1;
                    let ny = cy + parse_num(&tokens[i]); i += 1;
                    if let Some(prev) = points.last_mut() {
                        prev.handle_out_x = prev.x + 2.0/3.0 * ((qx + ox) - prev.x);
                        prev.handle_out_y = prev.y + 2.0/3.0 * ((qy + oy) - prev.y);
                    }
                    let mut pt = PathPoint::corner(nx + ox, ny + oy);
                    pt.handle_in_x = (nx + ox) + 2.0/3.0 * ((qx + ox) - (nx + ox));
                    pt.handle_in_y = (ny + oy) + 2.0/3.0 * ((qy + oy) - (ny + oy));
                    points.push(pt);
                    cx = nx; cy = ny;
                }
            }
            "A" | "a" => {
                // Arc — approximate with line segments (simplified)
                let rel = cmd == "a";
                while i + 6 < tokens.len() && is_number(&tokens[i]) {
                    let _rx = parse_num(&tokens[i]); i += 1;
                    let _ry = parse_num(&tokens[i]); i += 1;
                    let _rot = parse_num(&tokens[i]); i += 1;
                    let _large = parse_num(&tokens[i]); i += 1;
                    let _sweep = parse_num(&tokens[i]); i += 1;
                    let ex = parse_num(&tokens[i]); i += 1;
                    let ey = parse_num(&tokens[i]); i += 1;
                    if rel {
                        cx += ex; cy += ey;
                    } else {
                        cx = ex; cy = ey;
                    }
                    // Simplified: just lineto the endpoint
                    points.push(PathPoint::corner(cx + ox, cy + oy));
                }
            }
            "Z" | "z" => {
                closed = true;
                cx = start_x; cy = start_y;
            }
            _ => {}
        }
    }

    (points, closed)
}

fn tokenize_path_d(d: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut buf = String::new();

    let chars: Vec<char> = d.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        let c = chars[i];
        if c.is_ascii_alphabetic() {
            if !buf.is_empty() {
                tokens.push(buf.clone());
                buf.clear();
            }
            tokens.push(c.to_string());
            i += 1;
        } else if c == '-' || c == '+' || c == '.' || c.is_ascii_digit() {
            // Start of number
            if !buf.is_empty() && (c == '-' || c == '+') {
                // Negative sign after number = new number
                tokens.push(buf.clone());
                buf.clear();
            }
            if c == '.' && buf.contains('.') {
                // Second decimal point = new number
                tokens.push(buf.clone());
                buf.clear();
            }
            buf.push(c);
            i += 1;
        } else {
            // Whitespace, comma, etc.
            if !buf.is_empty() {
                tokens.push(buf.clone());
                buf.clear();
            }
            i += 1;
        }
    }
    if !buf.is_empty() {
        tokens.push(buf);
    }

    tokens
}

fn is_number(s: &str) -> bool {
    if s.is_empty() { return false; }
    let first = s.as_bytes()[0];
    first == b'-' || first == b'+' || first == b'.' || first.is_ascii_digit()
}

fn parse_num(s: &str) -> f64 {
    s.parse().unwrap_or(0.0)
}

// ---- Utility functions ----

fn parse_point_list(s: &str, ox: f64, oy: f64) -> Vec<PathPoint> {
    let nums: Vec<f64> = s.split(|c: char| c == ',' || c == ' ' || c == '\n' || c == '\t')
        .filter(|s| !s.is_empty())
        .filter_map(|s| s.trim().parse().ok())
        .collect();
    let mut pts = Vec::new();
    let mut i = 0;
    while i + 1 < nums.len() {
        pts.push(PathPoint::corner(nums[i] + ox, nums[i + 1] + oy));
        i += 2;
    }
    pts
}

fn path_bounds(points: &[PathPoint]) -> (f64, f64, f64, f64) {
    if points.is_empty() {
        return (0.0, 0.0, 0.0, 0.0);
    }
    let mut min_x = f64::MAX;
    let mut min_y = f64::MAX;
    let mut max_x = f64::MIN;
    let mut max_y = f64::MIN;
    for p in points {
        min_x = min_x.min(p.x).min(p.handle_in_x).min(p.handle_out_x);
        min_y = min_y.min(p.y).min(p.handle_in_y).min(p.handle_out_y);
        max_x = max_x.max(p.x).max(p.handle_in_x).max(p.handle_out_x);
        max_y = max_y.max(p.y).max(p.handle_in_y).max(p.handle_out_y);
    }
    (min_x, min_y, max_x - min_x, max_y - min_y)
}

fn attr_f64(elem: &roxmltree::Node, name: &str, default: f64) -> f64 {
    elem.attribute(name)
        .and_then(|s| {
            // Handle values with units like "100px"
            let s = s.trim().trim_end_matches("px").trim_end_matches("pt").trim_end_matches("%");
            s.parse().ok()
        })
        .unwrap_or(default)
}

fn parse_percent_or_float(s: &str) -> f64 {
    let s = s.trim();
    if s.ends_with('%') {
        s.trim_end_matches('%').parse::<f64>().unwrap_or(0.0) / 100.0
    } else {
        s.parse().unwrap_or(0.0)
    }
}

fn parse_color(s: &str) -> Color {
    let s = s.trim();

    // Named colors
    match s {
        "white" => return Color { r: 255, g: 255, b: 255, a: 1.0 },
        "black" => return Color { r: 0, g: 0, b: 0, a: 1.0 },
        "red" => return Color { r: 255, g: 0, b: 0, a: 1.0 },
        "green" => return Color { r: 0, g: 128, b: 0, a: 1.0 },
        "blue" => return Color { r: 0, g: 0, b: 255, a: 1.0 },
        "yellow" => return Color { r: 255, g: 255, b: 0, a: 1.0 },
        "cyan" | "aqua" => return Color { r: 0, g: 255, b: 255, a: 1.0 },
        "magenta" | "fuchsia" => return Color { r: 255, g: 0, b: 255, a: 1.0 },
        "gray" | "grey" => return Color { r: 128, g: 128, b: 128, a: 1.0 },
        "orange" => return Color { r: 255, g: 165, b: 0, a: 1.0 },
        "purple" => return Color { r: 128, g: 0, b: 128, a: 1.0 },
        "transparent" => return Color { r: 0, g: 0, b: 0, a: 0.0 },
        _ => {}
    }

    // #hex
    if s.starts_with('#') {
        let hex = &s[1..];
        return match hex.len() {
            3 => {
                let r = u8::from_str_radix(&hex[0..1], 16).unwrap_or(0) * 17;
                let g = u8::from_str_radix(&hex[1..2], 16).unwrap_or(0) * 17;
                let b = u8::from_str_radix(&hex[2..3], 16).unwrap_or(0) * 17;
                Color { r, g, b, a: 1.0 }
            }
            6 => {
                let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0);
                let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0);
                let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0);
                Color { r, g, b, a: 1.0 }
            }
            8 => {
                let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0);
                let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0);
                let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0);
                let a = u8::from_str_radix(&hex[6..8], 16).unwrap_or(255);
                Color { r, g, b, a: a as f64 / 255.0 }
            }
            _ => Color { r: 0, g: 0, b: 0, a: 1.0 },
        };
    }

    // rgb(r, g, b) / rgba(r, g, b, a)
    if s.starts_with("rgb") {
        let inner = s.trim_start_matches("rgba(").trim_start_matches("rgb(").trim_end_matches(')');
        let parts: Vec<&str> = inner.split(|c: char| c == ',' || c == ' ' || c == '/')
            .filter(|s| !s.is_empty())
            .collect();
        let r = parts.first().and_then(|s| s.trim().parse().ok()).unwrap_or(0);
        let g = parts.get(1).and_then(|s| s.trim().parse().ok()).unwrap_or(0);
        let b = parts.get(2).and_then(|s| s.trim().parse().ok()).unwrap_or(0);
        let a = parts.get(3).and_then(|s| s.trim().parse().ok()).unwrap_or(1.0);
        return Color { r, g, b, a };
    }

    Color { r: 0, g: 0, b: 0, a: 1.0 }
}

fn extract_url_id(s: &str) -> Option<&str> {
    // url(#id) → id
    let s = s.trim();
    if s.starts_with("url(#") && s.ends_with(')') {
        Some(&s[5..s.len()-1])
    } else {
        None
    }
}

fn get_style_str(elem: &roxmltree::Node, prop: &str) -> Option<String> {
    // Check inline style attribute first, then direct attribute
    if let Some(style) = elem.attribute("style") {
        if let Some(val) = parse_style_prop(style, prop) {
            return Some(val.to_string());
        }
    }
    elem.attribute(prop).map(|s| s.to_string())
}

fn get_style_f64(elem: &roxmltree::Node, prop: &str, default: f64) -> f64 {
    get_style_str(elem, prop)
        .and_then(|s| {
            let s = s.trim().trim_end_matches("px").trim_end_matches("pt");
            s.parse().ok()
        })
        .unwrap_or(default)
}

fn parse_style_prop<'a>(style: &'a str, prop: &str) -> Option<&'a str> {
    for decl in style.split(';') {
        let decl = decl.trim();
        if let Some(colon) = decl.find(':') {
            let key = decl[..colon].trim();
            if key == prop {
                return Some(decl[colon+1..].trim());
            }
        }
    }
    None
}
