use serde::{Deserialize, Serialize};
use crate::types::Color;
use crate::node::{TextAlign, FontStyle};
use std::collections::HashMap;

pub type StyleId = u64;

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
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct StyleStore {
    pub color_styles: HashMap<StyleId, ColorStyle>,
    pub text_styles: HashMap<StyleId, TextStyle>,
    next_id: u64,
}

impl StyleStore {
    pub fn new() -> Self {
        Self {
            color_styles: HashMap::new(),
            text_styles: HashMap::new(),
            next_id: 1,
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
                if let Some(v) = updates.get("text_align").and_then(|v| v.as_str()) {
                    s.text_align = match v { "Center" => TextAlign::Center, "Right" => TextAlign::Right, _ => TextAlign::Left };
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
}
