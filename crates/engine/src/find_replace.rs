use crate::node::{Node, NodeId, NodeKind};
use crate::scene::Scene;
use crate::types::{Color, ColorSpace};
use serde::Serialize;

impl Scene {
    /// Search all nodes whose text content or name matches query. Returns matching node IDs.
    pub fn search_nodes(&self, query: &str, case_sensitive: bool) -> Vec<u64> {
        if query.is_empty() { return vec![]; }
        let q = if case_sensitive { query.to_string() } else { query.to_lowercase() };
        let mut ids = Vec::new();
        for node in self.nodes.values() {
            // Check node name
            let name = if case_sensitive { node.name.clone() } else { node.name.to_lowercase() };
            if name.contains(&q) {
                ids.push(node.id);
                continue;
            }
            // Check text content
            if let NodeKind::Text { ref content, .. } = node.kind {
                let hay = if case_sensitive { content.clone() } else { content.to_lowercase() };
                if hay.contains(&q) {
                    ids.push(node.id);
                }
            }
        }
        // Sort by render order for consistent navigation
        let order = self.render_order();
        ids.sort_by_key(|id| order.iter().position(|&o| o == *id).unwrap_or(usize::MAX));
        ids
    }

    /// Replace text in specified nodes' text content AND name. Returns count of changes made.
    pub fn replace_text_in_nodes(&mut self, query: &str, replacement: &str, node_ids: &[u64], case_sensitive: bool) -> u32 {
        if query.is_empty() { return 0; }
        let mut count = 0u32;
        for &id in node_ids {
            if let Some(node) = self.nodes.get_mut(&id) {
                // Replace in name
                let new_name = if case_sensitive {
                    node.name.replace(query, replacement)
                } else {
                    case_insensitive_replace(&node.name, query, replacement)
                };
                if new_name != node.name {
                    node.name = new_name;
                    count += 1;
                }
                // Replace in text content
                if let NodeKind::Text { ref mut content, .. } = node.kind {
                    let new_content = if case_sensitive {
                        content.replace(query, replacement)
                    } else {
                        case_insensitive_replace(content, query, replacement)
                    };
                    if new_content != *content {
                        *content = new_content;
                        count += 1;
                    }
                }
            }
        }
        count
    }
}

#[derive(Serialize, Clone)]
pub struct FindResult {
    pub node_id: u64,
    pub node_name: String,
    pub node_kind: String,
    /// For text matches: the matched text content
    pub matched_text: Option<String>,
    /// For color matches: the matched color hex
    pub matched_color: Option<String>,
    pub page_id: u64,
}

impl Scene {
    /// Find all nodes whose text content contains `query` (case-insensitive)
    pub fn find_text(&self, query: &str, case_sensitive: bool) -> Vec<FindResult> {
        let query_lower = if case_sensitive { query.to_string() } else { query.to_lowercase() };
        let mut results = Vec::new();
        let page_id = self.get_active_page_id();
        
        for node in self.nodes.values() {
            // Search text content
            if let NodeKind::Text { ref content, .. } = node.kind {
                let haystack = if case_sensitive { content.clone() } else { content.to_lowercase() };
                if haystack.contains(&query_lower) {
                    results.push(FindResult {
                        node_id: node.id,
                        node_name: node.name.clone(),
                        node_kind: kind_str(&node.kind),
                        matched_text: Some(content.clone()),
                        matched_color: None,
                        page_id,
                    });
                }
            }
            // Search node name
            let name_haystack = if case_sensitive { node.name.clone() } else { node.name.to_lowercase() };
            if name_haystack.contains(&query_lower) {
                // Avoid duplicate if already matched by text
                if !results.iter().any(|r| r.node_id == node.id) {
                    results.push(FindResult {
                        node_id: node.id,
                        node_name: node.name.clone(),
                        node_kind: kind_str(&node.kind),
                        matched_text: None,
                        matched_color: None,
                        page_id,
                    });
                }
            }
        }
        results
    }

    /// Replace text in a specific node
    pub fn replace_text_in_node(&mut self, node_id: NodeId, search: &str, replacement: &str, case_sensitive: bool) -> bool {
        if let Some(node) = self.nodes.get_mut(&node_id) {
            if let NodeKind::Text { ref mut content, .. } = node.kind {
                let new_content = if case_sensitive {
                    content.replace(search, replacement)
                } else {
                    case_insensitive_replace(content, search, replacement)
                };
                if new_content != *content {
                    *content = new_content;
                    return true;
                }
            }
        }
        false
    }

    /// Replace text in all matching nodes, returns count of modified nodes
    pub fn replace_all_text(&mut self, search: &str, replacement: &str, case_sensitive: bool) -> u32 {
        let ids: Vec<NodeId> = self.nodes.keys().cloned().collect();
        let mut count = 0u32;
        for id in ids {
            if self.replace_text_in_node(id, search, replacement, case_sensitive) {
                count += 1;
            }
        }
        count
    }

    /// Find nodes by fill color (hex string like "#ff0000")
    pub fn find_by_color(&self, hex: &str) -> Vec<FindResult> {
        let target = match parse_color_approx(hex) {
            Some(c) => c,
            None => return vec![],
        };
        let page_id = self.get_active_page_id();
        let mut results = Vec::new();

        for node in self.nodes.values() {
            for fill in &node.fills {
                if let crate::node::FillType::Solid { color } = &fill.fill_type {
                    if colors_close(color, &target) {
                        results.push(FindResult {
                            node_id: node.id,
                            node_name: node.name.clone(),
                            node_kind: kind_str(&node.kind),
                            matched_text: None,
                            matched_color: Some(format!("#{:02x}{:02x}{:02x}", color.r, color.g, color.b)),
                            page_id,
                        });
                        break;
                    }
                }
            }
        }
        results
    }

    /// Replace fill color across all nodes
    pub fn replace_color(&mut self, from_hex: &str, to_hex: &str) -> u32 {
        let from = match parse_color_approx(from_hex) {
            Some(c) => c,
            None => return 0,
        };
        let to = match parse_color_approx(to_hex) {
            Some(c) => c,
            None => return 0,
        };
        let mut count = 0u32;
        let ids: Vec<NodeId> = self.nodes.keys().cloned().collect();
        for id in ids {
            if let Some(node) = self.nodes.get_mut(&id) {
                let mut changed = false;
                for fill in &mut node.fills {
                    if let crate::node::FillType::Solid { ref mut color } = fill.fill_type {
                        if colors_close(color, &from) {
                            *color = to.clone();
                            changed = true;
                        }
                    }
                }
                if let Some(ref mut stroke) = node.stroke {
                    if colors_close(&stroke.color, &from) {
                        stroke.color = to.clone();
                        changed = true;
                    }
                }
                for stroke in &mut node.strokes {
                    if colors_close(&stroke.color, &from) {
                        stroke.color = to.clone();
                        changed = true;
                    }
                }
                if changed {
                    count += 1;
                }
            }
        }
        count
    }
}

fn kind_str(kind: &NodeKind) -> String {
    match kind {
        NodeKind::Rect => "Rect".into(),
        NodeKind::Ellipse => "Ellipse".into(),
        NodeKind::Text { .. } => "Text".into(),
        NodeKind::Frame => "Frame".into(),
        NodeKind::Group => "Group".into(),
        NodeKind::Slot { .. } => "Slot".into(),
        NodeKind::Instance { .. } => "Instance".into(),
        NodeKind::Image { .. } => "Image".into(),
        NodeKind::Path { .. } => "Path".into(),
        NodeKind::Star { .. } => "Star".into(),
        NodeKind::Polygon { .. } => "Polygon".into(),
        NodeKind::Section { .. } => "Section".into(),
        NodeKind::Slice => "Slice".into(),
        NodeKind::Connector { .. } => "Connector".into(),
        NodeKind::VectorNetwork { .. } => "VectorNetwork".into(),
        NodeKind::StickyNote { .. } => "StickyNote".into(),
        NodeKind::Table { .. } => "Table".into(),
        NodeKind::Chart { .. } => "Chart".into(),
        NodeKind::RepeatGrid { .. } => "RepeatGrid".into(),
        NodeKind::Callout { .. } => "Callout".into(),
        NodeKind::Video { .. } => "Video".into(),
    }
}

fn case_insensitive_replace(text: &str, search: &str, replacement: &str) -> String {
    let lower_text = text.to_lowercase();
    let lower_search = search.to_lowercase();
    let mut result = String::new();
    let mut start = 0;
    while let Some(pos) = lower_text[start..].find(&lower_search) {
        result.push_str(&text[start..start + pos]);
        result.push_str(replacement);
        start += pos + search.len();
    }
    result.push_str(&text[start..]);
    result
}

fn parse_color_approx(hex: &str) -> Option<Color> {
    let hex = hex.trim_start_matches('#');
    if hex.len() < 6 { return None; }
    let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
    let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
    let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
    Some(Color { r, g, b, a: 1.0, color_space: ColorSpace::default() })
}

fn colors_close(a: &Color, b: &Color) -> bool {
    let dr = (a.r as i16 - b.r as i16).abs();
    let dg = (a.g as i16 - b.g as i16).abs();
    let db = (a.b as i16 - b.b as i16).abs();
    dr <= 2 && dg <= 2 && db <= 2
}

impl Scene {
    /// Find nodes by stroke color (hex string like "#ff0000")
    pub fn find_by_stroke_color(&self, hex: &str) -> Vec<FindResult> {
        let target = match parse_color_approx(hex) {
            Some(c) => c,
            None => return vec![],
        };
        let page_id = self.get_active_page_id();
        let mut results = Vec::new();

        for node in self.nodes.values() {
            // Check legacy stroke
            if let Some(ref stroke) = node.stroke {
                if colors_close(&stroke.color, &target) {
                    results.push(FindResult {
                        node_id: node.id,
                        node_name: node.name.clone(),
                        node_kind: kind_str(&node.kind),
                        matched_text: None,
                        matched_color: Some(format!("#{:02x}{:02x}{:02x}", stroke.color.r, stroke.color.g, stroke.color.b)),
                        page_id,
                    });
                    continue;
                }
            }
            // Check strokes vec
            for stroke in &node.strokes {
                if colors_close(&stroke.color, &target) {
                    results.push(FindResult {
                        node_id: node.id,
                        node_name: node.name.clone(),
                        node_kind: kind_str(&node.kind),
                        matched_text: None,
                        matched_color: Some(format!("#{:02x}{:02x}{:02x}", stroke.color.r, stroke.color.g, stroke.color.b)),
                        page_id,
                    });
                    break;
                }
            }
        }
        results
    }

    /// Replace stroke color across all nodes
    pub fn replace_stroke_color(&mut self, from_hex: &str, to_hex: &str) -> u32 {
        let from = match parse_color_approx(from_hex) {
            Some(c) => c,
            None => return 0,
        };
        let to = match parse_color_approx(to_hex) {
            Some(c) => c,
            None => return 0,
        };
        let mut count = 0u32;
        let ids: Vec<NodeId> = self.nodes.keys().cloned().collect();
        for id in ids {
            if let Some(node) = self.nodes.get_mut(&id) {
                let mut changed = false;
                if let Some(ref mut stroke) = node.stroke {
                    if colors_close(&stroke.color, &from) {
                        stroke.color = to.clone();
                        changed = true;
                    }
                }
                for stroke in &mut node.strokes {
                    if colors_close(&stroke.color, &from) {
                        stroke.color = to.clone();
                        changed = true;
                    }
                }
                if changed { count += 1; }
            }
        }
        count
    }

    /// Find nodes by font family (case-insensitive partial match)
    pub fn find_by_font(&self, query: &str) -> Vec<FindResult> {
        let query_lower = query.to_lowercase();
        let page_id = self.get_active_page_id();
        let mut results = Vec::new();

        for node in self.nodes.values() {
            if let NodeKind::Text { ref font_family, .. } = node.kind {
                if font_family.to_lowercase().contains(&query_lower) {
                    results.push(FindResult {
                        node_id: node.id,
                        node_name: node.name.clone(),
                        node_kind: kind_str(&node.kind),
                        matched_text: Some(font_family.clone()),
                        matched_color: None,
                        page_id,
                    });
                }
            }
        }
        results
    }

    /// Replace font family across all matching text nodes
    pub fn replace_font(&mut self, from_font: &str, to_font: &str) -> u32 {
        let from_lower = from_font.to_lowercase();
        let mut count = 0u32;
        let ids: Vec<NodeId> = self.nodes.keys().cloned().collect();
        for id in ids {
            if let Some(node) = self.nodes.get_mut(&id) {
                if let NodeKind::Text { ref mut font_family, .. } = node.kind {
                    if font_family.to_lowercase().contains(&from_lower) {
                        *font_family = to_font.to_string();
                        count += 1;
                    }
                }
            }
        }
        count
    }
}

// ── Advanced Property Search & Replace ──────────────────────

use serde::Deserialize;
use crate::node::{BlendMode, FillType, Fill};

/// Search criteria for property-based node search
#[derive(Deserialize, Default)]
pub struct PropertySearchCriteria {
    /// Fill color hex (e.g. "#ff0000")
    #[serde(default)]
    pub fill_color: Option<String>,
    /// Stroke color hex
    #[serde(default)]
    pub stroke_color: Option<String>,
    /// Font family substring (case-insensitive)
    #[serde(default)]
    pub font_family: Option<String>,
    /// Exact font size
    #[serde(default)]
    pub font_size: Option<f64>,
    /// Font size range [min, max]
    #[serde(default)]
    pub font_size_min: Option<f64>,
    #[serde(default)]
    pub font_size_max: Option<f64>,
    /// Exact opacity
    #[serde(default)]
    pub opacity: Option<f64>,
    /// Blend mode string (e.g. "multiply")
    #[serde(default)]
    pub blend_mode: Option<String>,
    /// Node kind filter (e.g. "Rect", "Text")
    #[serde(default)]
    pub node_kind: Option<String>,
    /// Corner radius exact match
    #[serde(default)]
    pub corner_radius: Option<f64>,
    /// Stroke width exact match
    #[serde(default)]
    pub stroke_width: Option<f64>,
}

/// What to replace on matched nodes
#[derive(Deserialize, Default)]
pub struct PropertyReplacement {
    #[serde(default)]
    pub fill_color: Option<String>,
    #[serde(default)]
    pub stroke_color: Option<String>,
    #[serde(default)]
    pub font_family: Option<String>,
    #[serde(default)]
    pub font_size: Option<f64>,
    #[serde(default)]
    pub opacity: Option<f64>,
    #[serde(default)]
    pub blend_mode: Option<String>,
    #[serde(default)]
    pub corner_radius: Option<f64>,
    #[serde(default)]
    pub stroke_width: Option<f64>,
}

#[derive(Serialize)]
pub struct PropertySearchResult {
    pub node_id: u64,
    pub node_name: String,
    pub node_kind: String,
    pub matched_properties: Vec<String>,
}

impl Scene {
    /// Search nodes by multiple property criteria (AND logic)
    pub fn search_by_properties(&self, criteria: &PropertySearchCriteria) -> Vec<PropertySearchResult> {
        let mut results = Vec::new();

        for node in self.nodes.values() {
            let mut matched_props: Vec<String> = Vec::new();

            // Fill color
            if let Some(ref hex) = criteria.fill_color {
                if let Some(target) = parse_color_approx(hex) {
                    let has_match = node.fills.iter().any(|f| {
                        if let FillType::Solid { color } = &f.fill_type {
                            colors_close(color, &target)
                        } else { false }
                    });
                    if !has_match { continue; }
                    matched_props.push("fill_color".into());
                }
            }

            // Stroke color
            if let Some(ref hex) = criteria.stroke_color {
                if let Some(target) = parse_color_approx(hex) {
                    let has_match = node.strokes.iter().any(|s| colors_close(&s.color, &target));
                    if !has_match { continue; }
                    matched_props.push("stroke_color".into());
                }
            }

            // Font family
            if let Some(ref ff) = criteria.font_family {
                if let NodeKind::Text { ref font_family, .. } = node.kind {
                    if !font_family.to_lowercase().contains(&ff.to_lowercase()) { continue; }
                    matched_props.push("font_family".into());
                } else { continue; }
            }

            // Font size (exact or range)
            if criteria.font_size.is_some() || criteria.font_size_min.is_some() || criteria.font_size_max.is_some() {
                if let NodeKind::Text { font_size, .. } = &node.kind {
                    if let Some(exact) = criteria.font_size {
                        if (*font_size - exact).abs() > 0.01 { continue; }
                    }
                    if let Some(min) = criteria.font_size_min {
                        if *font_size < min { continue; }
                    }
                    if let Some(max) = criteria.font_size_max {
                        if *font_size > max { continue; }
                    }
                    matched_props.push("font_size".into());
                } else { continue; }
            }

            // Opacity
            if let Some(op) = criteria.opacity {
                if (node.opacity - op).abs() > 0.01 { continue; }
                matched_props.push("opacity".into());
            }

            // Blend mode
            if let Some(ref bm) = criteria.blend_mode {
                if node.blend_mode.to_css() != bm.as_str() { continue; }
                matched_props.push("blend_mode".into());
            }

            // Node kind
            if let Some(ref kind) = criteria.node_kind {
                if node.kind_name() != kind.as_str() { continue; }
                matched_props.push("node_kind".into());
            }

            // Corner radius
            if let Some(cr) = criteria.corner_radius {
                if (node.corner_radius - cr).abs() > 0.01 { continue; }
                matched_props.push("corner_radius".into());
            }

            // Stroke width
            if let Some(sw) = criteria.stroke_width {
                let has_match = node.strokes.iter().any(|s| (s.width - sw).abs() < 0.01);
                if !has_match { continue; }
                matched_props.push("stroke_width".into());
            }

            if matched_props.is_empty() { continue; }

            results.push(PropertySearchResult {
                node_id: node.id,
                node_name: node.name.clone(),
                node_kind: node.kind_name().to_string(),
                matched_properties: matched_props,
            });
        }
        results
    }

    /// Replace properties on specific nodes. Returns count of modified nodes.
    pub fn replace_properties(&mut self, node_ids: &[u64], replacement: &PropertyReplacement) -> u32 {
        let mut count = 0u32;
        for &id in node_ids {
            if let Some(node) = self.nodes.get_mut(&id) {
                let mut changed = false;

                // Fill color
                if let Some(ref hex) = replacement.fill_color {
                    if let Some(color) = parse_color_approx(hex) {
                        for fill in &mut node.fills {
                            if let FillType::Solid { color: ref mut c } = fill.fill_type {
                                *c = color;
                                changed = true;
                            }
                        }
                        if node.fills.is_empty() {
                            node.fills.push(Fill::solid(color));
                            changed = true;
                        }
                    }
                }

                // Stroke color
                if let Some(ref hex) = replacement.stroke_color {
                    if let Some(color) = parse_color_approx(hex) {
                        for stroke in &mut node.strokes {
                            stroke.color = color;
                            changed = true;
                        }
                    }
                }

                // Font family
                if let Some(ref ff) = replacement.font_family {
                    if let NodeKind::Text { ref mut font_family, .. } = node.kind {
                        *font_family = ff.clone();
                        changed = true;
                    }
                }

                // Font size
                if let Some(fs) = replacement.font_size {
                    if let NodeKind::Text { ref mut font_size, .. } = node.kind {
                        *font_size = fs;
                        changed = true;
                    }
                }

                // Opacity
                if let Some(op) = replacement.opacity {
                    node.opacity = op.clamp(0.0, 1.0);
                    changed = true;
                }

                // Blend mode
                if let Some(ref bm) = replacement.blend_mode {
                    node.blend_mode = BlendMode::from_str(bm);
                    changed = true;
                }

                // Corner radius
                if let Some(cr) = replacement.corner_radius {
                    node.corner_radius = cr.max(0.0);
                    changed = true;
                }

                // Stroke width
                if let Some(sw) = replacement.stroke_width {
                    for stroke in &mut node.strokes {
                        stroke.width = sw.max(0.0);
                    }
                    if !node.strokes.is_empty() { changed = true; }
                }

                if changed { count += 1; }
            }
        }
        count
    }

    /// Search and replace in one call: find by criteria, replace matched nodes. Returns (matched_count, modified_count).
    pub fn search_and_replace_properties(
        &mut self,
        criteria: &PropertySearchCriteria,
        replacement: &PropertyReplacement,
    ) -> (u32, u32) {
        let results = self.search_by_properties(criteria);
        let ids: Vec<u64> = results.iter().map(|r| r.node_id).collect();
        let matched = ids.len() as u32;
        let modified = self.replace_properties(&ids, replacement);
        (matched, modified)
    }

    /// Filter nodes by object properties (kind, fill color, stroke color, opacity, visibility, locked, has_text, name pattern).
    /// Returns matching node IDs in render order.
    pub fn filter_nodes(&self, criteria_json: &str) -> Vec<u64> {
        let criteria: serde_json::Value = match serde_json::from_str(criteria_json) {
            Ok(v) => v,
            Err(_) => return vec![],
        };

        let kinds: Option<Vec<&str>> = criteria.get("kinds")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect());

        let fill_color: Option<&str> = criteria.get("fill_color").and_then(|v| v.as_str());
        let stroke_color: Option<&str> = criteria.get("stroke_color").and_then(|v| v.as_str());
        let opacity_min: Option<f64> = criteria.get("opacity_min").and_then(|v| v.as_f64());
        let opacity_max: Option<f64> = criteria.get("opacity_max").and_then(|v| v.as_f64());
        let visible: Option<bool> = criteria.get("visible").and_then(|v| v.as_bool());
        let locked: Option<bool> = criteria.get("locked").and_then(|v| v.as_bool());
        let has_text: Option<bool> = criteria.get("has_text").and_then(|v| v.as_bool());
        let name_pattern: Option<&str> = criteria.get("name_pattern").and_then(|v| v.as_str());

        let order = self.render_order();
        let mut result = Vec::new();

        for &id in &order {
            let node = match self.nodes.get(&id) {
                Some(n) => n,
                None => continue,
            };

            // Kind filter
            if let Some(ref ks) = kinds {
                if !ks.is_empty() && !ks.iter().any(|k| k.eq_ignore_ascii_case(node.kind_name())) {
                    continue;
                }
            }

            // Fill color filter (hex match, case-insensitive, tolerance ±2)
            if let Some(fc) = fill_color {
                let fc_clean = fc.trim_start_matches('#').to_lowercase();
                if fc_clean.len() >= 6 {
                    let target = crate::scene::parse_hex_color(&fc_clean);
                    let mut matched = false;
                    if let Some(tc) = target {
                        for fill in &node.fills {
                            let c = fill.color();
                            if (c.r as i16 - tc.r as i16).abs() <= 2
                                && (c.g as i16 - tc.g as i16).abs() <= 2
                                && (c.b as i16 - tc.b as i16).abs() <= 2
                            {
                                matched = true;
                                break;
                            }
                        }
                    }
                    if !matched { continue; }
                }
            }

            // Stroke color filter
            if let Some(sc) = stroke_color {
                let sc_clean = sc.trim_start_matches('#').to_lowercase();
                if sc_clean.len() >= 6 {
                    let target = crate::scene::parse_hex_color(&sc_clean);
                    let mut matched = false;
                    if let Some(tc) = target {
                        for stroke in &node.strokes {
                            let c = &stroke.color;
                            if (c.r as i16 - tc.r as i16).abs() <= 2
                                && (c.g as i16 - tc.g as i16).abs() <= 2
                                && (c.b as i16 - tc.b as i16).abs() <= 2
                            {
                                matched = true;
                                break;
                            }
                        }
                    }
                    if !matched { continue; }
                }
            }

            // Opacity range
            if let Some(omin) = opacity_min {
                if node.opacity < omin { continue; }
            }
            if let Some(omax) = opacity_max {
                if node.opacity > omax { continue; }
            }

            // Visibility
            if let Some(v) = visible {
                if node.visible != v { continue; }
            }

            // Locked
            if let Some(l) = locked {
                if node.locked != l { continue; }
            }

            // Has text
            if let Some(ht) = has_text {
                let is_text = matches!(node.kind, NodeKind::Text { .. });
                if ht != is_text { continue; }
            }

            // Name pattern (case-insensitive contains)
            if let Some(pat) = name_pattern {
                if !pat.is_empty() && !node.name.to_lowercase().contains(&pat.to_lowercase()) {
                    continue;
                }
            }

            result.push(id);
        }

        result
    }
}
