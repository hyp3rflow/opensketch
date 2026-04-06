use serde::{Deserialize, Serialize};
use crate::types::{Color, ColorSpace};
use crate::node::{TextAlign, FontStyle};
use std::collections::HashMap;

pub type StyleId = u64;

// ── Style Versioning ─────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StyleVersion {
    pub id: u64,
    pub tag: String,
    pub timestamp: u64,
    pub description: String,
    pub color_styles: HashMap<StyleId, ColorStyle>,
    pub text_styles: HashMap<StyleId, TextStyle>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StyleDiffEntry {
    pub kind: String,   // "color" | "text"
    pub change: String, // "added" | "removed" | "modified"
    pub style_id: StyleId,
    pub name: String,
    pub details: String,
}

const MAX_VERSIONS: usize = 50;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ColorStyle {
    pub id: StyleId,
    pub name: String,
    pub fill_r: u8,
    pub fill_g: u8,
    pub fill_b: u8,
    pub fill_a: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TextStyle {
    pub id: StyleId,
    pub name: String,
    pub font_family: String,
    pub font_size: f64,
    pub font_weight: u16,
    pub font_style: FontStyle,
    pub line_height: f64,
    pub text_align: TextAlign,
    pub color_r: u8,
    pub color_g: u8,
    pub color_b: u8,
    pub color_a: f64,
    #[serde(default)]
    pub letter_spacing: f64,
    #[serde(default)]
    pub opentype_features: crate::node::OpenTypeFeatures,
    #[serde(default)]
    pub font_variation_settings: std::collections::BTreeMap<String, f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct StyleStore {
    pub color_styles: HashMap<StyleId, ColorStyle>,
    pub text_styles: HashMap<StyleId, TextStyle>,
    next_id: u64,
    #[serde(default)]
    pub versions: Vec<StyleVersion>,
    #[serde(default)]
    next_version_id: u64,
}

impl StyleStore {
    pub fn new() -> Self {
        Self {
            color_styles: HashMap::new(),
            text_styles: HashMap::new(),
            next_id: 1,
            versions: Vec::new(),
            next_version_id: 1,
        }
    }

    fn next_id(&mut self) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        id
    }

    // Color styles CRUD
    pub fn add_color_style(&mut self, name: String, r: u8, g: u8, b: u8, a: f64) -> StyleId {
        let id = self.next_id();
        self.color_styles.insert(id, ColorStyle {
            id, name, fill_r: r, fill_g: g, fill_b: b, fill_a: a,
        });
        id
    }

    pub fn update_color_style(&mut self, id: StyleId, name: String, r: u8, g: u8, b: u8, a: f64) -> bool {
        if let Some(s) = self.color_styles.get_mut(&id) {
            s.name = name;
            s.fill_r = r;
            s.fill_g = g;
            s.fill_b = b;
            s.fill_a = a;
            true
        } else {
            false
        }
    }

    pub fn remove_color_style(&mut self, id: StyleId) -> bool {
        self.color_styles.remove(&id).is_some()
    }

    pub fn get_color_style(&self, id: StyleId) -> Option<&ColorStyle> {
        self.color_styles.get(&id)
    }

    pub fn list_color_styles(&self) -> Vec<&ColorStyle> {
        let mut styles: Vec<_> = self.color_styles.values().collect();
        styles.sort_by_key(|s| s.id);
        styles
    }

    // Text styles CRUD
    pub fn add_text_style(&mut self, name: String, font_family: String, font_size: f64, font_weight: u16, font_style: FontStyle, line_height: f64, text_align: TextAlign, r: u8, g: u8, b: u8, a: f64) -> StyleId {
        let id = self.next_id();
        self.text_styles.insert(id, TextStyle {
            id, name, font_family, font_size, font_weight, font_style, line_height, text_align,
            color_r: r, color_g: g, color_b: b, color_a: a,
            letter_spacing: 0.0,
            opentype_features: crate::node::OpenTypeFeatures::default(),
            font_variation_settings: std::collections::BTreeMap::new(),
        });
        id
    }

    pub fn update_text_style(&mut self, id: StyleId, json: &str) -> bool {
        if let Ok(updates) = serde_json::from_str::<serde_json::Value>(json) {
            if let Some(s) = self.text_styles.get_mut(&id) {
                if let Some(v) = updates.get("name").and_then(|v| v.as_str()) { s.name = v.to_string(); }
                if let Some(v) = updates.get("font_family").and_then(|v| v.as_str()) { s.font_family = v.to_string(); }
                if let Some(v) = updates.get("font_size").and_then(|v| v.as_f64()) { s.font_size = v; }
                if let Some(v) = updates.get("font_weight").and_then(|v| v.as_u64()) { s.font_weight = v as u16; }
                if let Some(v) = updates.get("font_style").and_then(|v| v.as_str()) {
                    s.font_style = if v == "Italic" { FontStyle::Italic } else { FontStyle::Normal };
                }
                if let Some(v) = updates.get("line_height").and_then(|v| v.as_f64()) { s.line_height = v; }
                if let Some(v) = updates.get("letter_spacing").and_then(|v| v.as_f64()) { s.letter_spacing = v; }
                if let Some(v) = updates.get("text_align").and_then(|v| v.as_str()) {
                    s.text_align = match v { "Center" => TextAlign::Center, "Right" => TextAlign::Right, _ => TextAlign::Left };
                }
                if let Some(v) = updates.get("opentype_features") {
                    if let Ok(parsed) = serde_json::from_value::<crate::node::OpenTypeFeatures>(v.clone()) {
                        s.opentype_features = parsed;
                    }
                }
                if let Some(v) = updates.get("font_variation_settings") {
                    if let Ok(parsed) = serde_json::from_value::<std::collections::BTreeMap<String, f64>>(v.clone()) {
                        s.font_variation_settings = parsed;
                    }
                }
                if let Some(v) = updates.get("color_r").and_then(|v| v.as_u64()) { s.color_r = v as u8; }
                if let Some(v) = updates.get("color_g").and_then(|v| v.as_u64()) { s.color_g = v as u8; }
                if let Some(v) = updates.get("color_b").and_then(|v| v.as_u64()) { s.color_b = v as u8; }
                if let Some(v) = updates.get("color_a").and_then(|v| v.as_f64()) { s.color_a = v; }
                return true;
            }
        }
        false
    }

    pub fn remove_text_style(&mut self, id: StyleId) -> bool {
        self.text_styles.remove(&id).is_some()
    }

    pub fn get_text_style(&self, id: StyleId) -> Option<&TextStyle> {
        self.text_styles.get(&id)
    }

    pub fn list_text_styles(&self) -> Vec<&TextStyle> {
        let mut styles: Vec<_> = self.text_styles.values().collect();
        styles.sort_by_key(|s| s.id);
        styles
    }

    /// Export all styles as a portable JSON object (ids remapped on import).
    pub fn export_json(&self) -> String {
        #[derive(Serialize)]
        struct StyleLibrary<'a> {
            version: u32,
            color_styles: Vec<&'a ColorStyle>,
            text_styles: Vec<&'a TextStyle>,
        }
        let lib = StyleLibrary {
            version: 1,
            color_styles: self.list_color_styles(),
            text_styles: self.list_text_styles(),
        };
        serde_json::to_string_pretty(&lib).unwrap_or_else(|_| "{}".into())
    }

    /// Import styles from JSON, assigning new IDs. Returns (color_count, text_count).
    pub fn import_json(&mut self, json: &str) -> (usize, usize) {
        #[derive(Deserialize)]
        struct StyleLibrary {
            #[serde(default)]
            color_styles: Vec<ColorStyle>,
            #[serde(default)]
            text_styles: Vec<TextStyle>,
        }
        let lib: StyleLibrary = match serde_json::from_str(json) {
            Ok(v) => v,
            Err(_) => return (0, 0),
        };
        let cc = lib.color_styles.len();
        let tc = lib.text_styles.len();
        for cs in lib.color_styles {
            self.add_color_style(cs.name, cs.fill_r, cs.fill_g, cs.fill_b, cs.fill_a);
        }
        for ts in lib.text_styles {
            let font_style = ts.font_style;
            let text_align = ts.text_align;
            let sid = self.add_text_style(
                ts.name, ts.font_family, ts.font_size, ts.font_weight,
                font_style, ts.line_height, text_align,
                ts.color_r, ts.color_g, ts.color_b, ts.color_a,
            );
            if let Some(style) = self.text_styles.get_mut(&sid) {
                style.letter_spacing = ts.letter_spacing;
                style.opentype_features = ts.opentype_features;
                style.font_variation_settings = ts.font_variation_settings;
            }
        }
        (cc, tc)
    }

    // ── Versioning ───────────────────────────────────────

    fn next_ver_id(&mut self) -> u64 {
        let id = self.next_version_id;
        self.next_version_id += 1;
        id
    }

    /// Snapshot current styles as a named version.
    pub fn create_version(&mut self, tag: &str, description: &str, timestamp: u64) -> u64 {
        let id = self.next_ver_id();
        self.versions.push(StyleVersion {
            id,
            tag: tag.to_string(),
            timestamp,
            description: description.to_string(),
            color_styles: self.color_styles.clone(),
            text_styles: self.text_styles.clone(),
        });
        // Trim oldest if exceeding cap
        while self.versions.len() > MAX_VERSIONS {
            self.versions.remove(0);
        }
        id
    }

    pub fn list_versions(&self) -> &[StyleVersion] {
        &self.versions
    }

    pub fn remove_version(&mut self, id: u64) -> bool {
        let before = self.versions.len();
        self.versions.retain(|v| v.id != id);
        self.versions.len() < before
    }

    /// Rollback to a version. Auto-saves current state first.
    pub fn rollback_to_version(&mut self, id: u64, timestamp: u64) -> bool {
        let ver = match self.versions.iter().find(|v| v.id == id) {
            Some(v) => v.clone(),
            None => return false,
        };
        // Auto-save current state before rollback
        self.create_version("auto (pre-rollback)", "", timestamp);
        self.color_styles = ver.color_styles;
        self.text_styles = ver.text_styles;
        true
    }

    /// Diff two versions.
    pub fn diff_versions(&self, a_id: u64, b_id: u64) -> Vec<StyleDiffEntry> {
        let a = self.versions.iter().find(|v| v.id == a_id);
        let b = self.versions.iter().find(|v| v.id == b_id);
        match (a, b) {
            (Some(a), Some(b)) => Self::diff_style_sets(&a.color_styles, &a.text_styles, &b.color_styles, &b.text_styles),
            _ => vec![],
        }
    }

    /// Diff a version against current styles.
    pub fn diff_with_current(&self, version_id: u64) -> Vec<StyleDiffEntry> {
        match self.versions.iter().find(|v| v.id == version_id) {
            Some(ver) => Self::diff_style_sets(&ver.color_styles, &ver.text_styles, &self.color_styles, &self.text_styles),
            None => vec![],
        }
    }

    fn diff_style_sets(
        a_colors: &HashMap<StyleId, ColorStyle>,
        a_texts: &HashMap<StyleId, TextStyle>,
        b_colors: &HashMap<StyleId, ColorStyle>,
        b_texts: &HashMap<StyleId, TextStyle>,
    ) -> Vec<StyleDiffEntry> {
        let mut entries = Vec::new();

        // Color styles
        for (id, a) in a_colors {
            match b_colors.get(id) {
                None => entries.push(StyleDiffEntry {
                    kind: "color".into(), change: "removed".into(),
                    style_id: *id, name: a.name.clone(), details: String::new(),
                }),
                Some(b) => {
                    let mut diffs = Vec::new();
                    if a.name != b.name { diffs.push(format!("name: {} → {}", a.name, b.name)); }
                    let ac = format!("#{:02x}{:02x}{:02x}", a.fill_r, a.fill_g, a.fill_b);
                    let bc = format!("#{:02x}{:02x}{:02x}", b.fill_r, b.fill_g, b.fill_b);
                    if ac != bc { diffs.push(format!("color: {} → {}", ac, bc)); }
                    if (a.fill_a - b.fill_a).abs() > 0.001 { diffs.push(format!("opacity: {} → {}", a.fill_a, b.fill_a)); }
                    if !diffs.is_empty() {
                        entries.push(StyleDiffEntry {
                            kind: "color".into(), change: "modified".into(),
                            style_id: *id, name: b.name.clone(), details: diffs.join(", "),
                        });
                    }
                }
            }
        }
        for (id, b) in b_colors {
            if !a_colors.contains_key(id) {
                entries.push(StyleDiffEntry {
                    kind: "color".into(), change: "added".into(),
                    style_id: *id, name: b.name.clone(), details: String::new(),
                });
            }
        }

        // Text styles
        for (id, a) in a_texts {
            match b_texts.get(id) {
                None => entries.push(StyleDiffEntry {
                    kind: "text".into(), change: "removed".into(),
                    style_id: *id, name: a.name.clone(), details: String::new(),
                }),
                Some(b) => {
                    let mut diffs = Vec::new();
                    if a.name != b.name { diffs.push(format!("name: {} → {}", a.name, b.name)); }
                    if a.font_family != b.font_family { diffs.push(format!("font: {} → {}", a.font_family, b.font_family)); }
                    if (a.font_size - b.font_size).abs() > 0.01 { diffs.push(format!("size: {} → {}", a.font_size, b.font_size)); }
                    if a.font_weight != b.font_weight { diffs.push(format!("weight: {} → {}", a.font_weight, b.font_weight)); }
                    if !diffs.is_empty() {
                        entries.push(StyleDiffEntry {
                            kind: "text".into(), change: "modified".into(),
                            style_id: *id, name: b.name.clone(), details: diffs.join(", "),
                        });
                    }
                }
            }
        }
        for (id, b) in b_texts {
            if !a_texts.contains_key(id) {
                entries.push(StyleDiffEntry {
                    kind: "text".into(), change: "added".into(),
                    style_id: *id, name: b.name.clone(), details: String::new(),
                });
            }
        }

        entries
    }
}
