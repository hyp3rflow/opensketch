//! Design Tokens Export
//!
//! Exports color styles, text styles, and variable collections as design tokens
//! in multiple formats: W3C DTCG, Style Dictionary, and Tailwind CSS theme.

use serde::Serialize;
use serde_json::{json, Map, Value};

use crate::styles::StyleStore;
use crate::variable::{VariableCollection, VariableValue, VariableType};

/// Export format
pub enum TokenFormat {
    /// W3C Design Tokens Community Group (DTCG) spec
    W3C,
    /// Style Dictionary compatible
    StyleDictionary,
    /// Tailwind CSS theme config (JS object)
    Tailwind,
    /// CSS Custom Properties (variables)
    CssVariables,
}

/// Convert RGBA to hex string
fn rgba_to_hex(r: u8, g: u8, b: u8, a: f64) -> String {
    if (a - 1.0).abs() < f64::EPSILON {
        format!("#{:02x}{:02x}{:02x}", r, g, b)
    } else {
        format!("#{:02x}{:02x}{:02x}{:02x}", r, g, b, (a * 255.0).round() as u8)
    }
}

/// Sanitize a name into a valid token key (kebab-case)
fn to_token_key(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() { c.to_ascii_lowercase() } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

/// Export styles + variables as W3C DTCG format
fn export_w3c(styles: &StyleStore, collections: &[VariableCollection]) -> Value {
    let mut root = Map::new();

    // Color styles → color group
    if !styles.color_styles.is_empty() {
        let mut colors = Map::new();
        for cs in styles.list_color_styles() {
            let key = to_token_key(&cs.name);
            colors.insert(key, json!({
                "$type": "color",
                "$value": rgba_to_hex(cs.fill_r, cs.fill_g, cs.fill_b, cs.fill_a),
                "$description": cs.name
            }));
        }
        root.insert("color".into(), Value::Object(colors));
    }

    // Text styles → typography group
    if !styles.text_styles.is_empty() {
        let mut typography = Map::new();
        for ts in styles.list_text_styles() {
            let key = to_token_key(&ts.name);
            typography.insert(key, json!({
                "$type": "typography",
                "$value": {
                    "fontFamily": ts.font_family,
                    "fontSize": format!("{}px", ts.font_size),
                    "fontWeight": ts.font_weight,
                    "lineHeight": format!("{}", ts.line_height),
                    "fontStyle": format!("{:?}", ts.font_style).to_lowercase()
                },
                "$description": ts.name
            }));
        }
        root.insert("typography".into(), Value::Object(typography));
    }

    // Variable collections → per-collection groups
    for col in collections {
        let col_key = to_token_key(&col.name);
        let mut group = Map::new();

        for var in &col.variables {
            let var_key = to_token_key(&var.name);
            // Export active mode value
            let value = col.resolve(var.id);
            let (dtype, dval) = match &value {
                Some(VariableValue::Color(c)) => ("color", json!(c)),
                Some(VariableValue::Number(n)) => ("number", json!(n)),
                Some(VariableValue::String(s)) => ("string", json!(s)),
                Some(VariableValue::Boolean(b)) => ("boolean", json!(b)),
                None => continue,
            };

            let mut token = Map::new();
            token.insert("$type".into(), json!(dtype));
            token.insert("$value".into(), dval);

            // If multiple modes, add extensions
            if col.modes.len() > 1 {
                let mut modes = Map::new();
                for mode in &col.modes {
                    if let Some(v) = var.values.get(&mode.id) {
                        let mv = match v {
                            VariableValue::Color(c) => json!(c),
                            VariableValue::Number(n) => json!(n),
                            VariableValue::String(s) => json!(s),
                            VariableValue::Boolean(b) => json!(b),
                        };
                        modes.insert(to_token_key(&mode.name), mv);
                    }
                }
                token.insert("$extensions".into(), json!({ "modes": modes }));
            }

            group.insert(var_key, Value::Object(token));
        }

        if !group.is_empty() {
            root.insert(col_key, Value::Object(group));
        }
    }

    Value::Object(root)
}

/// Export as Style Dictionary format
fn export_style_dictionary(styles: &StyleStore, collections: &[VariableCollection]) -> Value {
    let mut root = Map::new();

    // Colors
    if !styles.color_styles.is_empty() {
        let mut colors = Map::new();
        for cs in styles.list_color_styles() {
            let key = to_token_key(&cs.name);
            colors.insert(key, json!({
                "value": rgba_to_hex(cs.fill_r, cs.fill_g, cs.fill_b, cs.fill_a),
                "type": "color"
            }));
        }
        root.insert("color".into(), Value::Object(colors));
    }

    // Typography
    if !styles.text_styles.is_empty() {
        let mut typo = Map::new();
        for ts in styles.list_text_styles() {
            let key = to_token_key(&ts.name);
            let mut group = Map::new();
            group.insert("fontFamily".into(), json!({ "value": ts.font_family, "type": "fontFamily" }));
            group.insert("fontSize".into(), json!({ "value": format!("{}px", ts.font_size), "type": "fontSize" }));
            group.insert("fontWeight".into(), json!({ "value": ts.font_weight, "type": "fontWeight" }));
            group.insert("lineHeight".into(), json!({ "value": ts.line_height, "type": "lineHeight" }));
            typo.insert(key, Value::Object(group));
        }
        root.insert("typography".into(), Value::Object(typo));
    }

    // Variables
    for col in collections {
        let col_key = to_token_key(&col.name);
        let mut group = Map::new();
        for var in &col.variables {
            let var_key = to_token_key(&var.name);
            let value = col.resolve(var.id);
            let (dtype, dval) = match &value {
                Some(VariableValue::Color(c)) => ("color", json!(c)),
                Some(VariableValue::Number(n)) => ("number", json!(n)),
                Some(VariableValue::String(s)) => ("string", json!(s)),
                Some(VariableValue::Boolean(b)) => ("boolean", json!(b)),
                None => continue,
            };
            group.insert(var_key, json!({ "value": dval, "type": dtype }));
        }
        if !group.is_empty() {
            root.insert(col_key, Value::Object(group));
        }
    }

    Value::Object(root)
}

/// Export as Tailwind CSS theme config
fn export_tailwind(styles: &StyleStore, collections: &[VariableCollection]) -> Value {
    let mut theme = Map::new();

    // Colors → theme.colors
    let mut colors = Map::new();
    for cs in styles.list_color_styles() {
        let key = to_token_key(&cs.name);
        colors.insert(key, json!(rgba_to_hex(cs.fill_r, cs.fill_g, cs.fill_b, cs.fill_a)));
    }
    // Also add color variables
    for col in collections {
        for var in &col.variables {
            if var.var_type == VariableType::Color {
                if let Some(VariableValue::Color(c)) = col.resolve(var.id) {
                    let key = to_token_key(&var.name);
                    colors.insert(key, json!(c));
                }
            }
        }
    }
    if !colors.is_empty() {
        theme.insert("colors".into(), Value::Object(colors));
    }

    // Typography → theme.fontFamily, fontSize
    if !styles.text_styles.is_empty() {
        let mut font_family = Map::new();
        let mut font_size = Map::new();
        for ts in styles.list_text_styles() {
            let key = to_token_key(&ts.name);
            font_family.insert(key.clone(), json!([&ts.font_family]));
            font_size.insert(key, json!(format!("{}px", ts.font_size)));
        }
        theme.insert("fontFamily".into(), Value::Object(font_family));
        theme.insert("fontSize".into(), Value::Object(font_size));
    }

    // Number variables → spacing/sizing
    let mut spacing = Map::new();
    for col in collections {
        for var in &col.variables {
            if var.var_type == VariableType::Number {
                if let Some(VariableValue::Number(n)) = col.resolve(var.id) {
                    let key = to_token_key(&var.name);
                    spacing.insert(key, json!(format!("{}px", n)));
                }
            }
        }
    }
    if !spacing.is_empty() {
        theme.insert("spacing".into(), Value::Object(spacing));
    }

    json!({ "theme": { "extend": theme } })
}

/// Export as CSS Custom Properties
fn export_css_variables(styles: &StyleStore, collections: &[VariableCollection]) -> String {
    let mut lines = vec![":root {".to_string()];

    // Color styles
    if !styles.color_styles.is_empty() {
        lines.push("  /* Color Styles */".into());
        for cs in styles.list_color_styles() {
            let key = to_token_key(&cs.name);
            let hex = rgba_to_hex(cs.fill_r, cs.fill_g, cs.fill_b, cs.fill_a);
            lines.push(format!("  --color-{}: {};", key, hex));
        }
    }

    // Text styles
    if !styles.text_styles.is_empty() {
        lines.push("  /* Typography */".into());
        for ts in styles.list_text_styles() {
            let key = to_token_key(&ts.name);
            lines.push(format!("  --font-family-{}: '{}';", key, ts.font_family));
            lines.push(format!("  --font-size-{}: {}px;", key, ts.font_size));
            lines.push(format!("  --font-weight-{}: {};", key, ts.font_weight));
            lines.push(format!("  --line-height-{}: {};", key, ts.line_height));
        }
    }

    // Variable collections
    for col in collections {
        let col_key = to_token_key(&col.name);
        let mut has_header = false;
        for var in &col.variables {
            let var_key = to_token_key(&var.name);
            let value = col.resolve(var.id);
            let css_val = match &value {
                Some(VariableValue::Color(c)) => c.clone(),
                Some(VariableValue::Number(n)) => format!("{}px", n),
                Some(VariableValue::String(s)) => format!("'{}'", s),
                Some(VariableValue::Boolean(b)) => format!("{}", if *b { 1 } else { 0 }),
                None => continue,
            };
            if !has_header {
                lines.push(format!("  /* {} */", col.name));
                has_header = true;
            }
            lines.push(format!("  --{}-{}: {};", col_key, var_key, css_val));
        }
    }

    lines.push("}".into());
    lines.join("\n")
}

/// Main export function
pub fn export_design_tokens(
    styles: &StyleStore,
    collections: &[VariableCollection],
    format: TokenFormat,
) -> String {
    match format {
        TokenFormat::CssVariables => return export_css_variables(styles, collections),
        _ => {}
    }
    let value = match format {
        TokenFormat::W3C => export_w3c(styles, collections),
        TokenFormat::StyleDictionary => export_style_dictionary(styles, collections),
        TokenFormat::Tailwind => export_tailwind(styles, collections),
        TokenFormat::CssVariables => unreachable!(),
    };
    serde_json::to_string_pretty(&value).unwrap_or_else(|_| "{}".into())
}
