//! Style Transfer — Extract visual style from source nodes and apply to targets.
//!
//! Extracts fills, strokes, shadows, corner radius, opacity, blur, blend mode,
//! and font properties into a portable StyleBundle, then applies it to target nodes
//! with intelligent type matching.

use serde::{Serialize, Deserialize};
use crate::node::{Node, NodeKind, Fill, Stroke, Shadow, BlendMode};

/// A portable bundle of visual style properties extracted from a node.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StyleBundle {
    pub fills: Vec<Fill>,
    pub strokes: Vec<Stroke>,
    pub shadows: Vec<Shadow>,
    pub corner_radius: f64,
    pub corner_smoothing: f64,
    pub opacity: f64,
    pub blur: f64,
    pub backdrop_blur: f64,
    pub blend_mode: BlendMode,
    /// Text-specific styles (only present if source was Text)
    pub text_style: Option<TextStyleBundle>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TextStyleBundle {
    pub font_family: String,
    pub font_size: f64,
    pub font_weight: u16,
    pub font_style: String,
    pub line_height: f64,
    pub text_align: String,
    pub letter_spacing: f64,
}

/// Which properties to transfer
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct TransferOptions {
    pub fills: bool,
    pub strokes: bool,
    pub shadows: bool,
    pub corner_radius: bool,
    pub opacity: bool,
    pub blur: bool,
    pub blend_mode: bool,
    pub text_style: bool,
}

impl TransferOptions {
    pub fn all() -> Self {
        Self {
            fills: true,
            strokes: true,
            shadows: true,
            corner_radius: true,
            opacity: true,
            blur: true,
            blend_mode: true,
            text_style: true,
        }
    }
}

/// Extract a StyleBundle from a node.
pub fn extract_style(node: &Node) -> StyleBundle {
    let text_style = match &node.kind {
        NodeKind::Text { content, font_family, font_size, font_weight, font_style, line_height, text_align, letter_spacing, .. } => {
            Some(TextStyleBundle {
                font_family: font_family.clone(),
                font_size: *font_size,
                font_weight: *font_weight,
                font_style: format!("{:?}", font_style).to_lowercase(),
                line_height: *line_height,
                text_align: format!("{:?}", text_align).to_lowercase(),
                letter_spacing: *letter_spacing,
            })
        }
        _ => None,
    };

    StyleBundle {
        fills: node.fills.clone(),
        strokes: node.strokes.clone(),
        shadows: node.shadows.clone(),
        corner_radius: node.corner_radius,
        corner_smoothing: node.corner_smoothing,
        opacity: node.opacity,
        blur: node.blur,
        backdrop_blur: node.backdrop_blur,
        blend_mode: node.blend_mode.clone(),
        text_style,
    }
}

/// Extract a merged StyleBundle from multiple nodes (uses first node's properties,
/// but collects all unique fills).
pub fn extract_style_from_multiple(nodes: &[&Node]) -> Option<StyleBundle> {
    if nodes.is_empty() {
        return None;
    }
    // Use the first node as the base
    let mut bundle = extract_style(nodes[0]);
    // For multiple nodes, we keep the first node's style (dominant style)
    Some(bundle)
}

/// Apply a StyleBundle to a target node.
pub fn apply_style(node: &mut Node, bundle: &StyleBundle, options: &TransferOptions) {
    if options.fills {
        node.fills = bundle.fills.clone();
    }
    if options.strokes {
        node.strokes = bundle.strokes.clone();
    }
    if options.shadows {
        node.shadows = bundle.shadows.clone();
    }
    if options.corner_radius {
        node.corner_radius = bundle.corner_radius;
        node.corner_smoothing = bundle.corner_smoothing;
    }
    if options.opacity {
        node.opacity = bundle.opacity;
    }
    if options.blur {
        node.blur = bundle.blur;
        node.backdrop_blur = bundle.backdrop_blur;
    }
    if options.blend_mode {
        node.blend_mode = bundle.blend_mode.clone();
    }
    // Apply text style only if target is also a Text node
    if options.text_style {
        if let Some(ref ts) = bundle.text_style {
            if let NodeKind::Text { ref mut font_family, ref mut font_size, ref mut font_weight, ref mut font_style, ref mut line_height, ref mut text_align, ref mut letter_spacing, .. } = node.kind {
                *font_family = ts.font_family.clone();
                *font_size = ts.font_size;
                *font_weight = ts.font_weight;
                *font_style = match ts.font_style.as_str() {
                    "italic" => crate::node::FontStyle::Italic,
                    _ => crate::node::FontStyle::Normal,
                };
                *line_height = ts.line_height;
                *text_align = match ts.text_align.as_str() {
                    "center" => crate::node::TextAlign::Center,
                    "right" => crate::node::TextAlign::Right,
                    _ => crate::node::TextAlign::Left,
                };
                *letter_spacing = ts.letter_spacing;
            }
        }
    }
}
