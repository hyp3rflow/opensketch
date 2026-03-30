use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TextStyleDef {
    pub name: String,
    pub font_family: String,
    pub font_size: f64,
    pub font_weight: u16,
    pub line_height: f64,
}

pub fn scale_ratio(name: &str) -> Option<f64> {
    match name {
        "minor-second" => Some(1.067),
        "major-second" => Some(1.125),
        "minor-third" => Some(1.200),
        "major-third" => Some(1.250),
        "perfect-fourth" => Some(1.333),
        "augmented-fourth" => Some(1.414),
        "perfect-fifth" => Some(1.500),
        "golden-ratio" => Some(1.618),
        _ => name.parse::<f64>().ok().filter(|&r| r > 1.0 && r < 5.0),
    }
}

pub fn generate_type_scale(base_size: f64, ratio: f64, font_family: &str) -> Vec<TextStyleDef> {
    let levels: &[(&str, i32, u16)] = &[
        ("Display", 4, 700),
        ("H1", 3, 700),
        ("H2", 2, 600),
        ("H3", 1, 600),
        ("Body", 0, 400),
        ("Small", -1, 400),
        ("Caption", -2, 400),
    ];

    levels.iter().map(|(name, exp, weight)| {
        let size = base_size * ratio.powi(*exp);
        let size_rounded = (size * 100.0).round() / 100.0;
        let lh = if *exp > 0 { 1.2 } else { 1.5 };
        TextStyleDef {
            name: name.to_string(),
            font_family: font_family.to_string(),
            font_size: size_rounded,
            font_weight: *weight,
            line_height: lh,
        }
    }).collect()
}
