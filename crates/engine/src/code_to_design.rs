//! AI Code-to-Design: Parse HTML/CSS and convert to OpenSketch node tree.
//!
//! Converts HTML structure into Frame/Text/Rect nodes with CSS property mapping.

use crate::node::{
    Node, NodeKind, Fill, FillType, Stroke, Layout, LayoutMode, FlexDirection,
    Align, Justify, FlexWrap, TextAlign, FontStyle, TextSizing,
};
use crate::types::{Color, ColorSpace};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// A parsed CSS property map
type CssProps = HashMap<String, String>;

/// Intermediate representation of a parsed HTML element
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HtmlNode {
    pub tag: String,
    pub text: Option<String>,
    pub styles: CssProps,
    pub children: Vec<HtmlNode>,
    pub classes: Vec<String>,
    pub id: Option<String>,
}

/// Result of code-to-design conversion
#[derive(Debug, Serialize, Deserialize)]
pub struct CodeToDesignResult {
    pub root_id: u64,
    pub node_count: u32,
}

// ============================================================
// Simple HTML tokenizer + parser (no external crate needed)
// ============================================================

#[derive(Debug)]
enum HtmlToken {
    OpenTag { tag: String, attrs: Vec<(String, String)>, self_closing: bool },
    CloseTag { tag: String },
    Text(String),
}

fn tokenize_html(input: &str) -> Vec<HtmlToken> {
    let mut tokens = Vec::new();
    let chars: Vec<char> = input.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i < len {
        if chars[i] == '<' {
            // Skip comments
            if i + 3 < len && chars[i+1] == '!' && chars[i+2] == '-' && chars[i+3] == '-' {
                if let Some(end) = input[i..].find("-->") {
                    i += end + 3;
                    continue;
                }
            }
            // Skip DOCTYPE, meta, etc
            if i + 1 < len && chars[i+1] == '!' {
                if let Some(end) = input[i..].find('>') {
                    i += end + 1;
                    continue;
                }
            }

            let is_close = i + 1 < len && chars[i+1] == '/';
            let start = if is_close { i + 2 } else { i + 1 };

            // Find end of tag
            let mut j = start;
            while j < len && chars[j] != '>' && chars[j] != ' ' && chars[j] != '\t' && chars[j] != '\n' && chars[j] != '/' {
                j += 1;
            }
            let tag = chars[start..j].iter().collect::<String>().to_lowercase();

            if is_close {
                // Find closing >
                while j < len && chars[j] != '>' { j += 1; }
                if j < len { j += 1; }
                if !tag.is_empty() {
                    tokens.push(HtmlToken::CloseTag { tag });
                }
                i = j;
            } else {
                // Parse attributes
                let mut attrs = Vec::new();
                let mut self_closing = false;
                while j < len && chars[j] != '>' {
                    // Skip whitespace
                    while j < len && (chars[j] == ' ' || chars[j] == '\t' || chars[j] == '\n' || chars[j] == '\r') { j += 1; }
                    if j < len && chars[j] == '/' {
                        self_closing = true;
                        j += 1;
                        continue;
                    }
                    if j >= len || chars[j] == '>' { break; }

                    // Attribute name
                    let attr_start = j;
                    while j < len && chars[j] != '=' && chars[j] != ' ' && chars[j] != '>' && chars[j] != '/' { j += 1; }
                    let attr_name = chars[attr_start..j].iter().collect::<String>().to_lowercase();

                    // Attribute value
                    let mut attr_val = String::new();
                    // Skip whitespace around =
                    while j < len && chars[j] == ' ' { j += 1; }
                    if j < len && chars[j] == '=' {
                        j += 1;
                        while j < len && chars[j] == ' ' { j += 1; }
                        if j < len && (chars[j] == '"' || chars[j] == '\'') {
                            let quote = chars[j];
                            j += 1;
                            let val_start = j;
                            while j < len && chars[j] != quote { j += 1; }
                            attr_val = chars[val_start..j].iter().collect();
                            if j < len { j += 1; }
                        } else {
                            let val_start = j;
                            while j < len && chars[j] != ' ' && chars[j] != '>' { j += 1; }
                            attr_val = chars[val_start..j].iter().collect();
                        }
                    }
                    if !attr_name.is_empty() {
                        attrs.push((attr_name, attr_val));
                    }
                }
                if j < len { j += 1; } // skip >

                // Void elements
                let void_tags = ["br", "hr", "img", "input", "meta", "link", "area", "base", "col", "embed", "source", "track", "wbr"];
                if void_tags.contains(&tag.as_str()) { self_closing = true; }

                if !tag.is_empty() {
                    tokens.push(HtmlToken::OpenTag { tag, attrs, self_closing });
                }
                i = j;
            }
        } else {
            // Text content
            let start = i;
            while i < len && chars[i] != '<' { i += 1; }
            let text: String = chars[start..i].iter().collect();
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                tokens.push(HtmlToken::Text(trimmed.to_string()));
            }
        }
    }

    tokens
}

fn parse_tokens_to_tree(tokens: &[HtmlToken]) -> Vec<HtmlNode> {
    let mut idx = 0;
    parse_children(tokens, &mut idx, None)
}

fn parse_children(tokens: &[HtmlToken], idx: &mut usize, parent_tag: Option<&str>) -> Vec<HtmlNode> {
    let mut children = Vec::new();

    while *idx < tokens.len() {
        match &tokens[*idx] {
            HtmlToken::CloseTag { tag } => {
                if parent_tag == Some(tag.as_str()) {
                    *idx += 1;
                    return children;
                }
                // Mismatched close tag, skip
                *idx += 1;
            }
            HtmlToken::Text(text) => {
                children.push(HtmlNode {
                    tag: "#text".to_string(),
                    text: Some(text.clone()),
                    styles: HashMap::new(),
                    children: vec![],
                    classes: vec![],
                    id: None,
                });
                *idx += 1;
            }
            HtmlToken::OpenTag { tag, attrs, self_closing } => {
                let tag = tag.clone();
                let attrs = attrs.clone();
                let sc = *self_closing;
                *idx += 1;

                let mut styles = HashMap::new();
                let mut classes = Vec::new();
                let mut id = None;

                for (name, val) in &attrs {
                    match name.as_str() {
                        "style" => {
                            parse_inline_style(val, &mut styles);
                        }
                        "class" => {
                            classes = val.split_whitespace().map(|s| s.to_string()).collect();
                        }
                        "id" => {
                            id = Some(val.clone());
                        }
                        _ => {}
                    }
                }

                let node_children = if sc {
                    vec![]
                } else {
                    parse_children(tokens, idx, Some(&tag))
                };

                children.push(HtmlNode {
                    tag,
                    text: None,
                    styles,
                    children: node_children,
                    classes,
                    id,
                });
            }
        }
    }

    children
}

fn parse_inline_style(style: &str, props: &mut CssProps) {
    for decl in style.split(';') {
        let decl = decl.trim();
        if decl.is_empty() { continue; }
        if let Some(colon) = decl.find(':') {
            let prop = decl[..colon].trim().to_lowercase();
            let val = decl[colon+1..].trim().to_string();
            props.insert(prop, val);
        }
    }
}

// ============================================================
// CSS <style> block parser
// ============================================================

fn parse_style_blocks(html: &str) -> HashMap<String, CssProps> {
    let mut style_map: HashMap<String, CssProps> = HashMap::new();
    let mut search = html;

    while let Some(start) = search.find("<style") {
        let after = &search[start..];
        if let Some(tag_end) = after.find('>') {
            let content_start = start + tag_end + 1;
            if let Some(end) = search[content_start..].find("</style>") {
                let css_text = &search[content_start..content_start + end];
                parse_css_rules(css_text, &mut style_map);
                search = &search[content_start + end + 8..];
            } else {
                break;
            }
        } else {
            break;
        }
    }

    style_map
}

fn parse_css_rules(css: &str, map: &mut HashMap<String, CssProps>) {
    let mut i = 0;
    let chars: Vec<char> = css.chars().collect();
    let len = chars.len();

    while i < len {
        // Skip whitespace
        while i < len && chars[i].is_whitespace() { i += 1; }
        if i >= len { break; }

        // Find selector (before {)
        let sel_start = i;
        while i < len && chars[i] != '{' { i += 1; }
        if i >= len { break; }
        let selector = chars[sel_start..i].iter().collect::<String>().trim().to_string();
        i += 1; // skip {

        // Find properties (before })
        let props_start = i;
        let mut depth = 1;
        while i < len && depth > 0 {
            if chars[i] == '{' { depth += 1; }
            if chars[i] == '}' { depth -= 1; }
            if depth > 0 { i += 1; }
        }
        let props_text = chars[props_start..i].iter().collect::<String>();
        if i < len { i += 1; } // skip }

        if !selector.is_empty() {
            let mut props = HashMap::new();
            parse_inline_style(&props_text, &mut props);
            // Handle comma-separated selectors
            for sel in selector.split(',') {
                let sel = sel.trim().to_string();
                if !sel.is_empty() {
                    let entry = map.entry(sel.clone()).or_insert_with(HashMap::new);
                    for (k, v) in &props {
                        entry.insert(k.clone(), v.clone());
                    }
                }
            }
        }
    }
}

fn apply_css_rules(node: &mut HtmlNode, rules: &HashMap<String, CssProps>) {
    // Match by tag
    if let Some(props) = rules.get(&node.tag) {
        for (k, v) in props {
            node.styles.entry(k.clone()).or_insert_with(|| v.clone());
        }
    }
    // Match by class
    for class in &node.classes {
        let sel = format!(".{}", class);
        if let Some(props) = rules.get(&sel) {
            for (k, v) in props {
                node.styles.entry(k.clone()).or_insert_with(|| v.clone());
            }
        }
    }
    // Match by id
    if let Some(id) = &node.id {
        let sel = format!("#{}", id);
        if let Some(props) = rules.get(&sel) {
            for (k, v) in props {
                node.styles.entry(k.clone()).or_insert_with(|| v.clone());
            }
        }
    }
    // Recurse
    for child in &mut node.children {
        apply_css_rules(child, rules);
    }
}

// ============================================================
// CSS value parsers
// ============================================================

fn parse_css_color(val: &str) -> Option<Color> {
    let val = val.trim();
    // Named colors
    match val {
        "black" => return Some(Color { r: 0, g: 0, b: 0, a: 1.0, color_space: ColorSpace::default() }),
        "white" => return Some(Color { r: 255, g: 255, b: 255, a: 1.0, color_space: ColorSpace::default() }),
        "red" => return Some(Color { r: 255, g: 0, b: 0, a: 1.0, color_space: ColorSpace::default() }),
        "green" => return Some(Color { r: 0, g: 128, b: 0, a: 1.0, color_space: ColorSpace::default() }),
        "blue" => return Some(Color { r: 0, g: 0, b: 255, a: 1.0, color_space: ColorSpace::default() }),
        "gray" | "grey" => return Some(Color { r: 128, g: 128, b: 128, a: 1.0, color_space: ColorSpace::default() }),
        "transparent" => return Some(Color { r: 0, g: 0, b: 0, a: 0.0, color_space: ColorSpace::default() }),
        "yellow" => return Some(Color { r: 255, g: 255, b: 0, a: 1.0, color_space: ColorSpace::default() }),
        "orange" => return Some(Color { r: 255, g: 165, b: 0, a: 1.0, color_space: ColorSpace::default() }),
        "purple" => return Some(Color { r: 128, g: 0, b: 128, a: 1.0, color_space: ColorSpace::default() }),
        "pink" => return Some(Color { r: 255, g: 192, b: 203, a: 1.0, color_space: ColorSpace::default() }),
        "cyan" => return Some(Color { r: 0, g: 255, b: 255, a: 1.0, color_space: ColorSpace::default() }),
        _ => {}
    }

    // #hex
    if val.starts_with('#') {
        let hex = &val[1..];
        return match hex.len() {
            3 => {
                let r = u8::from_str_radix(&hex[0..1], 16).ok()? * 17;
                let g = u8::from_str_radix(&hex[1..2], 16).ok()? * 17;
                let b = u8::from_str_radix(&hex[2..3], 16).ok()? * 17;
                Some(Color { r, g, b, a: 1.0, color_space: ColorSpace::default() })
            }
            6 => {
                let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
                let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
                let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
                Some(Color { r, g, b, a: 1.0, color_space: ColorSpace::default() })
            }
            8 => {
                let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
                let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
                let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
                let a = u8::from_str_radix(&hex[6..8], 16).ok()? as f64 / 255.0;
                Some(Color { r, g, b, a, color_space: ColorSpace::default() })
            }
            _ => None,
        };
    }

    // rgb(r, g, b) or rgba(r, g, b, a)
    if val.starts_with("rgb") {
        let inner = val.replace("rgba(", "").replace("rgb(", "").replace(")", "");
        let parts: Vec<&str> = inner.split(',').collect();
        if parts.len() >= 3 {
            let r = parts[0].trim().parse::<u8>().ok()?;
            let g = parts[1].trim().parse::<u8>().ok()?;
            let b = parts[2].trim().parse::<u8>().ok()?;
            let a = if parts.len() >= 4 { parts[3].trim().parse::<f64>().unwrap_or(1.0) } else { 1.0 };
            return Some(Color { r, g, b, a, color_space: ColorSpace::default() });
        }
    }

    None
}

fn parse_css_length(val: &str) -> Option<f64> {
    let val = val.trim();
    if val == "0" { return Some(0.0); }
    if val == "auto" || val == "none" { return None; }
    // Remove units
    let num_str = val.trim_end_matches("px")
        .trim_end_matches("rem")
        .trim_end_matches("em")
        .trim_end_matches("pt")
        .trim_end_matches('%')
        .trim();
    let num = num_str.parse::<f64>().ok()?;
    // Convert rem/em to px (assume 16px base)
    if val.ends_with("rem") || val.ends_with("em") {
        Some(num * 16.0)
    } else if val.ends_with("pt") {
        Some(num * 1.333)
    } else {
        Some(num)
    }
}

// ============================================================
// HTML → OpenSketch Node conversion
// ============================================================

use crate::scene::Scene;

/// Convert HTML/CSS code into OpenSketch nodes, returning the root frame ID and node count.
pub fn code_to_design(scene: &mut Scene, html: &str, offset_x: f64, offset_y: f64) -> CodeToDesignResult {
    // Parse <style> blocks
    let css_rules = parse_style_blocks(html);

    // Parse HTML tokens
    let tokens = tokenize_html(html);
    let mut tree = parse_tokens_to_tree(&tokens);

    // Apply CSS rules to tree
    for node in &mut tree {
        apply_css_rules(node, &css_rules);
    }

    // Find the body or first meaningful container
    let root_nodes = find_body_content(&tree);

    // Create a root frame
    let mut root = Node::new(0, NodeKind::Frame);
    root.x = offset_x;
    root.y = offset_y;
    root.width = 800.0;
    root.height = 600.0;
    root.name = "Imported HTML".to_string();
    root.fills = vec![Fill::solid(Color { r: 255, g: 255, b: 255, a: 1.0, color_space: ColorSpace::default() })];
    root.layout = Layout {
        mode: LayoutMode::Flex,
        direction: FlexDirection::Column,
        gap: 0.0,
        ..Default::default()
    };
    root.overflow = crate::node::Overflow::Hidden;

    let root_id = scene.add_node(root);
    let mut count = 1u32;

    for html_node in &root_nodes {
        let ids = convert_html_node(scene, html_node, root_id);
        count += ids as u32;
    }

    // Auto-size root frame based on children
    auto_size_frame(scene, root_id);

    CodeToDesignResult { root_id, node_count: count }
}

fn find_body_content(tree: &[HtmlNode]) -> Vec<HtmlNode> {
    // Look for <body>
    for node in tree {
        if node.tag == "body" {
            return node.children.clone();
        }
        if node.tag == "html" {
            for child in &node.children {
                if child.tag == "body" {
                    return child.children.clone();
                }
            }
            // If no body found in html, return html's children (skip head)
            return node.children.iter()
                .filter(|c| c.tag != "head" && c.tag != "style" && c.tag != "script")
                .cloned()
                .collect();
        }
    }
    // No html/body wrapper — return all non-meta nodes
    tree.iter()
        .filter(|c| c.tag != "head" && c.tag != "style" && c.tag != "script" && c.tag != "meta" && c.tag != "link")
        .cloned()
        .collect()
}

fn convert_html_node(scene: &mut Scene, html_node: &HtmlNode, parent_id: u64) -> usize {
    let tag = html_node.tag.as_str();

    // Skip invisible/meta tags
    match tag {
        "script" | "style" | "meta" | "link" | "head" | "title" | "noscript" => return 0,
        _ => {}
    }

    // Text node
    if tag == "#text" {
        if let Some(text) = &html_node.text {
            let text = text.trim();
            if text.is_empty() { return 0; }
            let node_id = create_text_node(scene, text, &html_node.styles);
            scene.reparent(node_id, Some(parent_id));
            return 1;
        }
        return 0;
    }

    // Check if this is a pure text element (only text children)
    let is_text_element = is_text_tag(tag) || (html_node.children.len() > 0 && html_node.children.iter().all(|c| c.tag == "#text"));

    if is_text_element && !html_node.children.is_empty() {
        let full_text: String = html_node.children.iter()
            .filter_map(|c| c.text.as_ref())
            .map(|t| t.trim())
            .collect::<Vec<_>>()
            .join(" ");
        if full_text.is_empty() { return 0; }
        let node_id = create_text_node(scene, &full_text, &html_node.styles);
        apply_text_styles(scene, node_id, tag, &html_node.styles);
        scene.reparent(node_id, Some(parent_id));
        return 1;
    }

    // Container element → Frame
    if is_container_tag(tag) || !html_node.children.is_empty() {
        let node_id = create_frame_node(scene, tag, &html_node.styles, &html_node.classes);
        scene.reparent(node_id, Some(parent_id));
        let mut count = 1usize;

        for child in &html_node.children {
            count += convert_html_node(scene, child, node_id);
        }

        auto_size_frame(scene, node_id);
        return count;
    }

    // Leaf elements
    match tag {
        "img" => {
            let node_id = create_rect_node(scene, &html_node.styles);
            if let Some(node) = scene.get_node_mut(node_id) {
                node.name = "Image Placeholder".to_string();
                node.fills = vec![Fill::solid(Color { r: 200, g: 200, b: 220, a: 1.0, color_space: ColorSpace::default() })];
            }
            scene.reparent(node_id, Some(parent_id));
            1
        }
        "hr" => {
            let mut node = Node::new(0, NodeKind::Rect);
            node.width = 0.0; // fill
            node.height = 2.0;
            node.name = "Divider".to_string();
            node.fills = vec![Fill::solid(Color { r: 200, g: 200, b: 200, a: 1.0, color_space: ColorSpace::default() })];
            node.sizing_h = crate::node::SizingMode::Fill;
            let id = scene.add_node(node);
            scene.reparent(id, Some(parent_id));
            1
        }
        "br" => 0,
        "input" | "textarea" | "select" => {
            let node_id = create_input_node(scene, tag, &html_node.styles);
            scene.reparent(node_id, Some(parent_id));
            1
        }
        "button" => {
            let text = html_node.children.iter()
                .filter_map(|c| c.text.as_ref())
                .map(|t| t.trim())
                .collect::<Vec<_>>()
                .join(" ");
            let node_id = create_button_node(scene, &text, &html_node.styles);
            scene.reparent(node_id, Some(parent_id));
            1
        }
        _ => {
            // Generic inline → just a rect or skip
            if html_node.children.is_empty() {
                0
            } else {
                let node_id = create_frame_node(scene, tag, &html_node.styles, &html_node.classes);
                scene.reparent(node_id, Some(parent_id));
                let mut count = 1;
                for child in &html_node.children {
                    count += convert_html_node(scene, child, node_id);
                }
                auto_size_frame(scene, node_id);
                count
            }
        }
    }
}

fn is_text_tag(tag: &str) -> bool {
    matches!(tag, "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "a" | "strong" | "em" | "b" | "i" | "u" | "s" | "label" | "small" | "code" | "pre" | "li")
}

fn is_container_tag(tag: &str) -> bool {
    matches!(tag, "div" | "section" | "article" | "main" | "header" | "footer" | "nav" | "aside" | "form" | "fieldset" | "ul" | "ol" | "table" | "thead" | "tbody" | "tr" | "td" | "th" | "figure" | "figcaption" | "details" | "summary" | "dialog" | "card")
}

fn create_text_node(scene: &mut Scene, text: &str, styles: &CssProps) -> u64 {
    let font_size = styles.get("font-size")
        .and_then(|v| parse_css_length(v))
        .unwrap_or(16.0);
    let font_family = styles.get("font-family")
        .map(|v| v.split(',').next().unwrap_or("Inter").trim().trim_matches('"').trim_matches('\'').to_string())
        .unwrap_or_else(|| "Inter".to_string());
    let font_weight = styles.get("font-weight")
        .and_then(|v| match v.as_str() {
            "bold" => Some(700),
            "normal" => Some(400),
            "lighter" => Some(300),
            "bolder" => Some(800),
            _ => v.parse::<u16>().ok(),
        })
        .unwrap_or(400);
    let font_style = if styles.get("font-style").map(|v| v == "italic").unwrap_or(false) {
        FontStyle::Italic
    } else {
        FontStyle::Normal
    };
    let text_align = match styles.get("text-align").map(|s| s.as_str()) {
        Some("center") => TextAlign::Center,
        Some("right") | Some("end") => TextAlign::Right,
        _ => TextAlign::Left,
    };
    let line_height = styles.get("line-height")
        .and_then(|v| {
            if v.ends_with("px") {
                let px = parse_css_length(v)?;
                Some(px / font_size)
            } else {
                v.parse::<f64>().ok()
            }
        })
        .unwrap_or(1.4);

    let color = styles.get("color")
        .and_then(|v| parse_css_color(v))
        .unwrap_or(Color { r: 0, g: 0, b: 0, a: 1.0, color_space: ColorSpace::default() });

    let estimated_width = text.len() as f64 * font_size * 0.55;
    let estimated_height = font_size * line_height;

    let mut node = Node::new(0, NodeKind::Text {
        content: text.to_string(),
        font_size,
        font_family,
        line_height,
        text_align,
        font_weight,
        font_style,
        text_decoration: crate::node::TextDecoration::default(),
        letter_spacing: styles.get("letter-spacing").and_then(|v| parse_css_length(v)).unwrap_or(0.0),
        paragraph_spacing: 0.0,
        list_style: crate::node::ListStyle::default(),
        indent_level: 0,
        text_transform: crate::node::TextTransform::default(),
        text_indent: 0.0,
        opentype_features: crate::node::OpenTypeFeatures::default(), font_variation_settings: std::collections::BTreeMap::new(),
    });
    node.width = estimated_width.min(600.0).max(20.0);
    node.height = estimated_height;
    node.fills = vec![Fill::solid(color)];
    node.text_sizing = TextSizing::Fit;
    node.name = format!("Text: {}", if text.len() > 20 { &text[..20] } else { text });

    // Apply opacity
    if let Some(opacity) = styles.get("opacity").and_then(|v| v.parse::<f64>().ok()) {
        node.opacity = opacity.clamp(0.0, 1.0);
    }

    scene.add_node(node)
}

fn apply_text_styles(scene: &mut Scene, node_id: u64, tag: &str, styles: &CssProps) {
    if let Some(node) = scene.get_node_mut(node_id) {
        // Apply tag-based defaults
        match tag {
            "h1" => {
                if let NodeKind::Text { ref mut font_size, ref mut font_weight, .. } = node.kind {
                    if !styles.contains_key("font-size") { *font_size = 32.0; }
                    if !styles.contains_key("font-weight") { *font_weight = 700; }
                }
                if !styles.contains_key("font-size") {
                    node.width = node.width.max(200.0);
                    node.height = 38.0;
                }
            }
            "h2" => {
                if let NodeKind::Text { ref mut font_size, ref mut font_weight, .. } = node.kind {
                    if !styles.contains_key("font-size") { *font_size = 24.0; }
                    if !styles.contains_key("font-weight") { *font_weight = 700; }
                }
                if !styles.contains_key("font-size") { node.height = 29.0; }
            }
            "h3" => {
                if let NodeKind::Text { ref mut font_size, ref mut font_weight, .. } = node.kind {
                    if !styles.contains_key("font-size") { *font_size = 20.0; }
                    if !styles.contains_key("font-weight") { *font_weight = 600; }
                }
            }
            "h4" | "h5" | "h6" => {
                if let NodeKind::Text { ref mut font_weight, .. } = node.kind {
                    if !styles.contains_key("font-weight") { *font_weight = 600; }
                }
            }
            "strong" | "b" => {
                if let NodeKind::Text { ref mut font_weight, .. } = node.kind {
                    *font_weight = 700;
                }
            }
            "em" | "i" => {
                if let NodeKind::Text { ref mut font_style, .. } = node.kind {
                    *font_style = FontStyle::Italic;
                }
            }
            "code" | "pre" => {
                if let NodeKind::Text { ref mut font_family, .. } = node.kind {
                    if !styles.contains_key("font-family") {
                        *font_family = "monospace".to_string();
                    }
                }
            }
            "small" => {
                if let NodeKind::Text { ref mut font_size, .. } = node.kind {
                    if !styles.contains_key("font-size") { *font_size = 12.0; }
                }
            }
            _ => {}
        }
    }
}

fn create_frame_node(scene: &mut Scene, tag: &str, styles: &CssProps, _classes: &[String]) -> u64 {
    let mut node = Node::new(0, NodeKind::Frame);
    node.width = 800.0;
    node.height = 100.0;
    node.name = tag_to_name(tag);

    // Default layout: column flex
    node.layout = Layout {
        mode: LayoutMode::Flex,
        direction: FlexDirection::Column,
        gap: 0.0,
        ..Default::default()
    };

    // Apply CSS flex/grid
    if let Some(display) = styles.get("display") {
        match display.as_str() {
            "flex" => {
                node.layout.mode = LayoutMode::Flex;
                if let Some(dir) = styles.get("flex-direction") {
                    node.layout.direction = match dir.as_str() {
                        "row" => FlexDirection::Row,
                        "row-reverse" => FlexDirection::Row,
                        _ => FlexDirection::Column,
                    };
                }
            }
            "grid" => {
                node.layout.mode = LayoutMode::Grid;
                if let Some(cols) = styles.get("grid-template-columns") {
                    let col_count = cols.split_whitespace().count().max(1) as u32;
                    node.layout.grid_columns = col_count;
                }
            }
            "inline-flex" => {
                node.layout.mode = LayoutMode::Flex;
                node.layout.direction = FlexDirection::Row;
            }
            _ => {}
        }
    }

    // flex-wrap
    if let Some(wrap) = styles.get("flex-wrap") {
        node.layout.wrap = if wrap == "wrap" { FlexWrap::Wrap } else { FlexWrap::NoWrap };
    }

    // align-items
    if let Some(ai) = styles.get("align-items") {
        node.layout.align_items = match ai.as_str() {
            "center" => Align::Center,
            "flex-end" | "end" => Align::End,
            "stretch" => Align::Stretch,
            "baseline" => Align::Baseline,
            _ => Align::Start,
        };
    }

    // justify-content
    if let Some(jc) = styles.get("justify-content") {
        node.layout.justify_content = match jc.as_str() {
            "center" => Justify::Center,
            "flex-end" | "end" => Justify::End,
            "space-between" => Justify::SpaceBetween,
            "space-around" => Justify::SpaceAround,
            "space-evenly" => Justify::SpaceEvenly,
            _ => Justify::Start,
        };
    }

    // gap
    if let Some(gap) = styles.get("gap").and_then(|v| parse_css_length(v)) {
        node.layout.gap = gap;
    }

    // padding
    apply_padding(styles, &mut node);

    // background
    if let Some(bg) = styles.get("background-color").or(styles.get("background")) {
        if let Some(color) = parse_css_color(bg) {
            node.fills = vec![Fill::solid(color)];
        } else {
            node.fills = vec![];
        }
    } else {
        node.fills = vec![];
    }

    // border-radius
    if let Some(br) = styles.get("border-radius").and_then(|v| parse_css_length(v)) {
        node.corner_radius = br;
    }

    // border → stroke
    if let Some(border) = styles.get("border") {
        if let Some(stroke) = parse_border_shorthand(border) {
            node.strokes = vec![stroke];
        }
    }
    if let Some(bc) = styles.get("border-color") {
        if let Some(color) = parse_css_color(bc) {
            let width = styles.get("border-width").and_then(|v| parse_css_length(v)).unwrap_or(1.0);
            node.strokes = vec![Stroke::new(color, width)];
        }
    }

    // width/height
    if let Some(w) = styles.get("width").and_then(|v| parse_css_length(v)) {
        node.width = w;
    }
    if let Some(h) = styles.get("height").and_then(|v| parse_css_length(v)) {
        node.height = h;
    }
    if let Some(mw) = styles.get("min-width").and_then(|v| parse_css_length(v)) {
        node.min_width = Some(mw);
    }
    if let Some(mh) = styles.get("min-height").and_then(|v| parse_css_length(v)) {
        node.min_height = Some(mh);
    }
    if let Some(mw) = styles.get("max-width").and_then(|v| parse_css_length(v)) {
        node.max_width = Some(mw);
    }

    // opacity
    if let Some(opacity) = styles.get("opacity").and_then(|v| v.parse::<f64>().ok()) {
        node.opacity = opacity.clamp(0.0, 1.0);
    }

    // box-shadow → shadow
    if let Some(shadow) = styles.get("box-shadow") {
        if let Some(s) = parse_box_shadow(shadow) {
            node.shadows = vec![s];
        }
    }

    // overflow
    if let Some(ov) = styles.get("overflow") {
        node.overflow = match ov.as_str() {
            "hidden" => crate::node::Overflow::Hidden,
            "scroll" | "auto" => crate::node::Overflow::Scroll,
            _ => crate::node::Overflow::Visible,
        };
    }

    scene.add_node(node)
}

fn apply_padding(styles: &CssProps, node: &mut Node) {
    // Shorthand padding
    if let Some(p) = styles.get("padding") {
        let parts: Vec<f64> = p.split_whitespace()
            .filter_map(|v| parse_css_length(v))
            .collect();
        match parts.len() {
            1 => {
                node.layout.padding_top = parts[0];
                node.layout.padding_right = parts[0];
                node.layout.padding_bottom = parts[0];
                node.layout.padding_left = parts[0];
            }
            2 => {
                node.layout.padding_top = parts[0];
                node.layout.padding_bottom = parts[0];
                node.layout.padding_right = parts[1];
                node.layout.padding_left = parts[1];
            }
            4 => {
                node.layout.padding_top = parts[0];
                node.layout.padding_right = parts[1];
                node.layout.padding_bottom = parts[2];
                node.layout.padding_left = parts[3];
            }
            _ => {}
        }
    }
    // Individual padding
    if let Some(v) = styles.get("padding-top").and_then(|v| parse_css_length(v)) { node.layout.padding_top = v; }
    if let Some(v) = styles.get("padding-right").and_then(|v| parse_css_length(v)) { node.layout.padding_right = v; }
    if let Some(v) = styles.get("padding-bottom").and_then(|v| parse_css_length(v)) { node.layout.padding_bottom = v; }
    if let Some(v) = styles.get("padding-left").and_then(|v| parse_css_length(v)) { node.layout.padding_left = v; }
}

fn parse_border_shorthand(val: &str) -> Option<Stroke> {
    // "1px solid #333"
    let parts: Vec<&str> = val.split_whitespace().collect();
    if parts.len() < 2 { return None; }
    let width = parse_css_length(parts[0]).unwrap_or(1.0);
    // Last part is usually color
    let color = if parts.len() >= 3 {
        parse_css_color(parts[2]).unwrap_or(Color { r: 200, g: 200, b: 200, a: 1.0, color_space: ColorSpace::default() })
    } else {
        Color { r: 200, g: 200, b: 200, a: 1.0, color_space: ColorSpace::default() }
    };
    Some(Stroke::new(color, width))
}

fn parse_box_shadow(val: &str) -> Option<crate::node::Shadow> {
    // Simple: "0 2px 4px rgba(0,0,0,0.1)" or "2px 4px 8px #000"
    let val = val.trim();
    if val == "none" { return None; }

    // Try to extract numbers and color
    let mut nums = Vec::new();
    let mut color = Color { r: 0, g: 0, b: 0, a: 0.25, color_space: ColorSpace::default() };
    let mut i = 0;
    let chars: Vec<char> = val.chars().collect();

    while i < chars.len() {
        if chars[i] == '#' || (chars[i] == 'r' && i + 2 < chars.len() && chars[i+1] == 'g' && chars[i+2] == 'b') {
            let rest: String = chars[i..].iter().collect();
            // Find the end of the color value
            let end = if rest.starts_with("rgb") {
                rest.find(')').map(|p| p + 1).unwrap_or(rest.len())
            } else {
                // hex: up to next space or end
                rest.find(' ').unwrap_or(rest.len())
            };
            if let Some(c) = parse_css_color(&rest[..end]) {
                color = c;
            }
            i += end;
        } else if chars[i] == '-' || chars[i].is_ascii_digit() {
            let start = i;
            if chars[i] == '-' { i += 1; }
            while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') { i += 1; }
            // skip unit
            while i < chars.len() && chars[i].is_alphabetic() { i += 1; }
            let num_str: String = chars[start..i].iter().collect();
            if let Some(n) = parse_css_length(&num_str) {
                nums.push(n);
            }
        } else {
            i += 1;
        }
    }

    let offset_x = nums.first().copied().unwrap_or(0.0);
    let offset_y = nums.get(1).copied().unwrap_or(2.0);
    let blur = nums.get(2).copied().unwrap_or(4.0);
    let spread = nums.get(3).copied().unwrap_or(0.0);

    Some(crate::node::Shadow {
        color,
        offset_x,
        offset_y,
        blur,
        spread,
        visible: true,
        inset: false,
    })
}

fn create_rect_node(scene: &mut Scene, styles: &CssProps) -> u64 {
    let mut node = Node::new(0, NodeKind::Rect);
    node.width = styles.get("width").and_then(|v| parse_css_length(v)).unwrap_or(100.0);
    node.height = styles.get("height").and_then(|v| parse_css_length(v)).unwrap_or(100.0);
    node.name = "Rectangle".to_string();

    if let Some(bg) = styles.get("background-color").or(styles.get("background")) {
        if let Some(color) = parse_css_color(bg) {
            node.fills = vec![Fill::solid(color)];
        }
    }
    if let Some(br) = styles.get("border-radius").and_then(|v| parse_css_length(v)) {
        node.corner_radius = br;
    }

    scene.add_node(node)
}

fn create_input_node(scene: &mut Scene, tag: &str, styles: &CssProps) -> u64 {
    let mut node = Node::new(0, NodeKind::Frame);
    node.width = styles.get("width").and_then(|v| parse_css_length(v)).unwrap_or(200.0);
    node.height = styles.get("height").and_then(|v| parse_css_length(v)).unwrap_or(36.0);
    node.name = match tag {
        "textarea" => "Textarea".to_string(),
        "select" => "Select".to_string(),
        _ => "Input".to_string(),
    };
    node.fills = vec![Fill::solid(Color { r: 255, g: 255, b: 255, a: 1.0, color_space: ColorSpace::default() })];
    node.strokes = vec![Stroke::new(Color { r: 200, g: 200, b: 200, a: 1.0, color_space: ColorSpace::default() }, 1.0)];
    node.corner_radius = 4.0;
    node.layout = Layout {
        mode: LayoutMode::Flex,
        direction: FlexDirection::Row,
        align_items: Align::Center,
        padding_left: 8.0,
        padding_right: 8.0,
        ..Default::default()
    };

    if tag == "textarea" {
        node.height = 80.0;
    }

    scene.add_node(node)
}

fn create_button_node(scene: &mut Scene, text: &str, styles: &CssProps) -> u64 {
    let bg_color = styles.get("background-color")
        .or(styles.get("background"))
        .and_then(|v| parse_css_color(v))
        .unwrap_or(Color { r: 59, g: 130, b: 246, a: 1.0, color_space: ColorSpace::default() });
    let text_color = styles.get("color")
        .and_then(|v| parse_css_color(v))
        .unwrap_or(Color { r: 255, g: 255, b: 255, a: 1.0, color_space: ColorSpace::default() });

    let mut frame = Node::new(0, NodeKind::Frame);
    frame.name = format!("Button: {}", text);
    frame.fills = vec![Fill::solid(bg_color)];
    frame.corner_radius = styles.get("border-radius").and_then(|v| parse_css_length(v)).unwrap_or(6.0);
    frame.layout = Layout {
        mode: LayoutMode::Flex,
        direction: FlexDirection::Row,
        align_items: Align::Center,
        justify_content: Justify::Center,
        padding_top: 8.0,
        padding_bottom: 8.0,
        padding_left: 16.0,
        padding_right: 16.0,
        ..Default::default()
    };
    frame.sizing_h = crate::node::SizingMode::Hug;
    frame.sizing_v = crate::node::SizingMode::Hug;

    let frame_id = scene.add_node(frame);

    // Add text child
    let font_size = styles.get("font-size").and_then(|v| parse_css_length(v)).unwrap_or(14.0);
    let label = if text.is_empty() { "Button" } else { text };
    let mut text_node = Node::new(0, NodeKind::Text {
        content: label.to_string(),
        font_size,
        font_family: "Inter".to_string(),
        line_height: 1.4,
        text_align: TextAlign::Center,
        font_weight: 500,
        font_style: FontStyle::Normal,
        text_decoration: crate::node::TextDecoration::default(),
        letter_spacing: 0.0,
        paragraph_spacing: 0.0,
        list_style: crate::node::ListStyle::default(),
        indent_level: 0,
        text_transform: crate::node::TextTransform::default(),
        text_indent: 0.0,
        opentype_features: crate::node::OpenTypeFeatures::default(), font_variation_settings: std::collections::BTreeMap::new(),
    });
    text_node.fills = vec![Fill::solid(text_color)];
    text_node.name = "Label".to_string();
    text_node.width = label.len() as f64 * font_size * 0.55;
    text_node.height = font_size * 1.4;

    let text_id = scene.add_node(text_node);
    scene.reparent(text_id, Some(frame_id));

    frame_id
}

fn tag_to_name(tag: &str) -> String {
    match tag {
        "div" => "Div".to_string(),
        "section" => "Section".to_string(),
        "article" => "Article".to_string(),
        "header" => "Header".to_string(),
        "footer" => "Footer".to_string(),
        "nav" => "Nav".to_string(),
        "aside" => "Sidebar".to_string(),
        "main" => "Main".to_string(),
        "form" => "Form".to_string(),
        "ul" | "ol" => "List".to_string(),
        "li" => "List Item".to_string(),
        "table" => "Table".to_string(),
        "tr" => "Row".to_string(),
        "td" | "th" => "Cell".to_string(),
        "figure" => "Figure".to_string(),
        _ => format!("{}", tag),
    }
}

fn auto_size_frame(scene: &mut Scene, frame_id: u64) {
    let children_ids = scene.get_node(frame_id).map(|n| n.children.clone()).unwrap_or_default();
    if children_ids.is_empty() { return; }

    // Collect child sizes first (immutable borrow)
    let mut child_sizes: Vec<(f64, f64)> = Vec::new();
    for cid in &children_ids {
        if let Some(child) = scene.get_node(*cid) {
            child_sizes.push((child.width, child.height));
        }
    }

    let count = child_sizes.len();
    let max_w: f64 = child_sizes.iter().map(|(w, _)| *w).fold(0.0, f64::max);
    let total_h: f64 = child_sizes.iter().map(|(_, h)| *h).sum();
    let total_w: f64 = child_sizes.iter().map(|(w, _)| *w).sum();
    let max_h: f64 = child_sizes.iter().map(|(_, h)| *h).fold(0.0, f64::max);

    if let Some(node) = scene.get_node_mut(frame_id) {
        let gap = node.layout.gap;
        let pad_h = node.layout.padding_top + node.layout.padding_bottom;
        let pad_w = node.layout.padding_left + node.layout.padding_right;
        let gap_total = if count > 1 { gap * (count as f64 - 1.0) } else { 0.0 };

        match node.layout.direction {
            FlexDirection::Column => {
                let h = total_h + gap_total + pad_h;
                if node.height < h { node.height = h; }
                let w = max_w + pad_w;
                if w > 0.0 { node.width = node.width.max(w); }
            }
            FlexDirection::Row => {
                let w = total_w + gap_total + pad_w;
                if w > 0.0 { node.width = node.width.max(w); }
                let h = max_h + pad_h;
                if node.height < h { node.height = h; }
            }
        }
    }
}
