use crate::node::{Node, NodeId, FillType, Fill};
use crate::types::Color;
use serde::Serialize;
use std::collections::HashMap;

/// A color with usage info
#[derive(Clone, Debug, Serialize)]
pub struct ColorEntry {
    pub color: Color,
    pub hex: String,
    pub count: u32,
    pub source: String, // "fill" | "stroke" | "shadow"
}

/// A generated palette
#[derive(Clone, Debug, Serialize)]
pub struct Palette {
    pub name: String,
    pub colors: Vec<PaletteColor>,
}

#[derive(Clone, Debug, Serialize)]
pub struct PaletteColor {
    pub hex: String,
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

/// Contrast pair result
#[derive(Clone, Debug, Serialize)]
pub struct ContrastPair {
    pub color1: String,
    pub color2: String,
    pub ratio: f64,
    pub aa_normal: bool,
    pub aa_large: bool,
    pub aaa_normal: bool,
    pub aaa_large: bool,
}

fn color_to_hex(c: &Color) -> String {
    format!("#{:02x}{:02x}{:02x}", c.r, c.g, c.b)
}

fn hex_to_rgb(hex: &str) -> Option<(u8, u8, u8)> {
    let hex = hex.trim_start_matches('#');
    if hex.len() != 6 { return None; }
    let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
    let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
    let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
    Some((r, g, b))
}

fn rgb_to_hsl(r: u8, g: u8, b: u8) -> (f64, f64, f64) {
    let r = r as f64 / 255.0;
    let g = g as f64 / 255.0;
    let b = b as f64 / 255.0;
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let l = (max + min) / 2.0;
    if (max - min).abs() < 1e-10 {
        return (0.0, 0.0, l);
    }
    let d = max - min;
    let s = if l > 0.5 { d / (2.0 - max - min) } else { d / (max + min) };
    let h = if (max - r).abs() < 1e-10 {
        let mut h = (g - b) / d;
        if g < b { h += 6.0; }
        h
    } else if (max - g).abs() < 1e-10 {
        (b - r) / d + 2.0
    } else {
        (r - g) / d + 4.0
    };
    (h * 60.0, s, l)
}

fn hsl_to_rgb(h: f64, s: f64, l: f64) -> (u8, u8, u8) {
    if s.abs() < 1e-10 {
        let v = (l * 255.0).round() as u8;
        return (v, v, v);
    }
    let h = ((h % 360.0) + 360.0) % 360.0;
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let x = c * (1.0 - ((h / 60.0) % 2.0 - 1.0).abs());
    let m = l - c / 2.0;
    let (r, g, b) = match h as u32 / 60 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    (((r + m) * 255.0).round() as u8,
     ((g + m) * 255.0).round() as u8,
     ((b + m) * 255.0).round() as u8)
}

fn srgb_to_linear(c: u8) -> f64 {
    let v = c as f64 / 255.0;
    if v <= 0.04045 { v / 12.92 } else { ((v + 0.055) / 1.055).powf(2.4) }
}

fn relative_luminance(r: u8, g: u8, b: u8) -> f64 {
    0.2126 * srgb_to_linear(r) + 0.7152 * srgb_to_linear(g) + 0.0722 * srgb_to_linear(b)
}

fn contrast_ratio(l1: f64, l2: f64) -> f64 {
    let (lighter, darker) = if l1 > l2 { (l1, l2) } else { (l2, l1) };
    (lighter + 0.05) / (darker + 0.05)
}

/// Extract all unique colors used in the scene
pub fn extract_colors<'a>(nodes: impl Iterator<Item = &'a Node>) -> Vec<ColorEntry> {
    let mut map: HashMap<String, (Color, u32, String)> = HashMap::new();

    for node in nodes {
        // Fills
        for fill in &node.fills {
            if !fill.visible { continue; }
            match &fill.fill_type {
                FillType::Solid { color } => {
                    if color.a > 0.01 {
                        let hex = color_to_hex(color);
                        let e = map.entry(hex.clone()).or_insert((*color, 0, "fill".into()));
                        e.1 += 1;
                    }
                }
                FillType::LinearGradient { stops, .. } | FillType::RadialGradient { stops, .. } => {
                    for stop in stops {
                        if stop.color.a > 0.01 {
                            let hex = color_to_hex(&stop.color);
                            let e = map.entry(hex.clone()).or_insert((stop.color, 0, "fill".into()));
                            e.1 += 1;
                        }
                    }
                }
                FillType::GradientMesh { ref mesh } => {
                    for pt in &mesh.points {
                        if pt.color.a > 0.01 {
                            let hex = color_to_hex(&pt.color);
                            let e = map.entry(hex.clone()).or_insert((pt.color, 0, "fill".into()));
                            e.1 += 1;
                        }
                    }
                }
                FillType::Pattern { .. } | FillType::NoiseFill { .. } | FillType::DotPattern { .. } | FillType::CrosshatchFill { .. } => {}
            }
        }

        // Strokes
        for stroke in &node.strokes {
            if !stroke.visible { continue; }
            let c = &stroke.color;
            if c.a > 0.01 {
                let hex = color_to_hex(c);
                let e = map.entry(hex.clone()).or_insert((*c, 0, "stroke".into()));
                e.1 += 1;
            }
        }

        // Shadows
        for shadow in &node.shadows {
            if !shadow.visible { continue; }
            let c = &shadow.color;
            if c.a > 0.01 {
                let hex = color_to_hex(c);
                let e = map.entry(hex.clone()).or_insert((*c, 0, "shadow".into()));
                e.1 += 1;
            }
        }
    }

    let mut result: Vec<ColorEntry> = map.into_iter().map(|(hex, (color, count, source))| {
        ColorEntry { color, hex, count, source }
    }).collect();
    result.sort_by(|a, b| b.count.cmp(&a.count));
    result
}

fn make_palette_color(r: u8, g: u8, b: u8) -> PaletteColor {
    PaletteColor { hex: format!("#{:02x}{:02x}{:02x}", r, g, b), r, g, b }
}

/// Generate harmony palettes from a base color hex string
pub fn generate_palettes(base_hex: &str) -> Vec<Palette> {
    let (r, g, b) = match hex_to_rgb(base_hex) {
        Some(v) => v,
        None => return vec![],
    };
    let (h, s, l) = rgb_to_hsl(r, g, b);
    let base = make_palette_color(r, g, b);

    let mut palettes = vec![];

    // Complementary
    {
        let (r2, g2, b2) = hsl_to_rgb((h + 180.0) % 360.0, s, l);
        palettes.push(Palette {
            name: "Complementary".into(),
            colors: vec![base.clone(), make_palette_color(r2, g2, b2)],
        });
    }

    // Analogous
    {
        let (r1, g1, b1) = hsl_to_rgb((h + 330.0) % 360.0, s, l);
        let (r2, g2, b2) = hsl_to_rgb((h + 30.0) % 360.0, s, l);
        palettes.push(Palette {
            name: "Analogous".into(),
            colors: vec![make_palette_color(r1, g1, b1), base.clone(), make_palette_color(r2, g2, b2)],
        });
    }

    // Triadic
    {
        let (r1, g1, b1) = hsl_to_rgb((h + 120.0) % 360.0, s, l);
        let (r2, g2, b2) = hsl_to_rgb((h + 240.0) % 360.0, s, l);
        palettes.push(Palette {
            name: "Triadic".into(),
            colors: vec![base.clone(), make_palette_color(r1, g1, b1), make_palette_color(r2, g2, b2)],
        });
    }

    // Tetradic (square)
    {
        let (r1, g1, b1) = hsl_to_rgb((h + 90.0) % 360.0, s, l);
        let (r2, g2, b2) = hsl_to_rgb((h + 180.0) % 360.0, s, l);
        let (r3, g3, b3) = hsl_to_rgb((h + 270.0) % 360.0, s, l);
        palettes.push(Palette {
            name: "Tetradic".into(),
            colors: vec![base.clone(), make_palette_color(r1, g1, b1), make_palette_color(r2, g2, b2), make_palette_color(r3, g3, b3)],
        });
    }

    // Shades (same hue, varying lightness)
    {
        let mut shades = vec![];
        for i in 0..5 {
            let l2 = 0.1 + (i as f64) * 0.2; // 0.1, 0.3, 0.5, 0.7, 0.9
            let (r2, g2, b2) = hsl_to_rgb(h, s, l2);
            shades.push(make_palette_color(r2, g2, b2));
        }
        palettes.push(Palette { name: "Shades".into(), colors: shades });
    }

    palettes
}

/// Check contrast between all pairs of extracted colors
pub fn check_contrast_pairs(colors: &[ColorEntry]) -> Vec<ContrastPair> {
    let mut pairs = vec![];
    let max = colors.len().min(10); // limit to top 10 colors
    for i in 0..max {
        for j in (i+1)..max {
            let c1 = &colors[i].color;
            let c2 = &colors[j].color;
            let l1 = relative_luminance(c1.r, c1.g, c1.b);
            let l2 = relative_luminance(c2.r, c2.g, c2.b);
            let ratio = contrast_ratio(l1, l2);
            pairs.push(ContrastPair {
                color1: colors[i].hex.clone(),
                color2: colors[j].hex.clone(),
                ratio: (ratio * 100.0).round() / 100.0,
                aa_normal: ratio >= 4.5,
                aa_large: ratio >= 3.0,
                aaa_normal: ratio >= 7.0,
                aaa_large: ratio >= 4.5,
            });
        }
    }
    pairs.sort_by(|a, b| b.ratio.partial_cmp(&a.ratio).unwrap_or(std::cmp::Ordering::Equal));
    pairs
}
