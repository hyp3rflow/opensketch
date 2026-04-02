//! Accessibility checker — WCAG 2.1 focused subset of design lint.
//!
//! Re-uses the design_lint engine but exposes a focused API for
//! accessibility-specific checks: contrast, alt text, text size, touch targets.

use crate::design_lint::{run_lint, LintConfig, LintIssue, LintCategory, LintSeverity};
use crate::node::{Node, NodeId, NodeKind, FillType};
use crate::types::{Color, ColorSpace};
use serde::Serialize;
use std::collections::HashMap;

/// Accessibility-specific issue types
#[derive(Clone, Debug, Serialize, PartialEq)]
pub enum A11yIssueType {
    LowContrast,
    MissingAltText,
    SmallText,
    TouchTargetTooSmall,
}

/// Severity level for accessibility issues
#[derive(Clone, Debug, Serialize, PartialEq)]
pub enum A11ySeverity {
    Error,
    Warning,
    Info,
}

/// A single accessibility issue
#[derive(Clone, Debug, Serialize)]
pub struct A11yIssue {
    pub node_id: NodeId,
    pub node_name: String,
    pub issue_type: A11yIssueType,
    pub severity: A11ySeverity,
    pub message: String,
    pub suggestion: Option<String>,
}

/// WCAG 2.1 relative luminance from sRGB
fn srgb_to_linear(c: u8) -> f64 {
    let v = c as f64 / 255.0;
    if v <= 0.03928 { v / 12.92 } else { ((v + 0.055) / 1.055).powf(2.4) }
}

pub fn relative_luminance(color: &Color) -> f64 {
    0.2126 * srgb_to_linear(color.r) + 0.7152 * srgb_to_linear(color.g) + 0.0722 * srgb_to_linear(color.b)
}

/// WCAG contrast ratio between two luminance values
pub fn contrast_ratio(l1: f64, l2: f64) -> f64 {
    let (lighter, darker) = if l1 > l2 { (l1, l2) } else { (l2, l1) };
    (lighter + 0.05) / (darker + 0.05)
}

/// Run accessibility checks on a scene's node map.
/// Returns a list of accessibility issues focused on WCAG 2.1 criteria.
pub fn check_accessibility(node_map: &HashMap<NodeId, Node>) -> Vec<A11yIssue> {
    let mut issues = Vec::new();

    // Build parent map for background color lookup
    let mut parent_map: HashMap<NodeId, NodeId> = HashMap::new();
    for node in node_map.values() {
        for &child_id in &node.children {
            parent_map.insert(child_id, node.id);
        }
    }

    for node in node_map.values() {
        if !node.visible { continue; }

        match &node.kind {
            NodeKind::Text { font_size, content, .. } => {
                // SmallText: font size < 12px
                if *font_size < 12.0 {
                    issues.push(A11yIssue {
                        node_id: node.id,
                        node_name: node.name.clone(),
                        issue_type: A11yIssueType::SmallText,
                        severity: A11ySeverity::Warning,
                        message: format!("Font size {:.0}px is below minimum 12px", font_size),
                        suggestion: Some("Increase font size to at least 12px for readability".into()),
                    });
                }

                // LowContrast: check text fill vs parent background
                if let Some(text_color) = first_solid_color(node) {
                    if let Some(bg_color) = find_background_color(node.id, &parent_map, node_map) {
                        let text_lum = relative_luminance(&text_color);
                        let bg_lum = relative_luminance(&bg_color);
                        let ratio = contrast_ratio(text_lum, bg_lum);
                        let is_large = *font_size >= 18.0 || (*font_size >= 14.0); // simplified large text check
                        let min_ratio = if is_large { 3.0 } else { 4.5 };

                        if ratio < min_ratio {
                            let fixed = suggest_fix_color(&text_color, &bg_color, min_ratio);
                            let fixed_hex = format!("#{:02x}{:02x}{:02x}", fixed.r, fixed.g, fixed.b);
                            issues.push(A11yIssue {
                                node_id: node.id,
                                node_name: node.name.clone(),
                                issue_type: A11yIssueType::LowContrast,
                                severity: if ratio < 3.0 { A11ySeverity::Error } else { A11ySeverity::Warning },
                                message: format!("Contrast ratio {:.1}:1 fails WCAG AA (min {:.1}:1)", ratio, min_ratio),
                                suggestion: Some(format!("Change text color to {} for AA compliance", fixed_hex)),
                            });
                        }
                    }
                }

                // Empty text
                if content.trim().is_empty() {
                    issues.push(A11yIssue {
                        node_id: node.id,
                        node_name: node.name.clone(),
                        issue_type: A11yIssueType::MissingAltText,
                        severity: A11ySeverity::Info,
                        message: "Text node is empty".into(),
                        suggestion: Some("Add content or remove empty text node".into()),
                    });
                }
            }

            NodeKind::Image { .. } => {
                // MissingAltText: check alt_text field first, then fall back to name check
                let has_alt = node.alt_text.as_ref().map_or(false, |t| !t.trim().is_empty());
                let is_default_name = node.name.starts_with("Image ") && node.name[6..].parse::<u32>().is_ok();
                if !has_alt && is_default_name {
                    issues.push(A11yIssue {
                        node_id: node.id,
                        node_name: node.name.clone(),
                        issue_type: A11yIssueType::MissingAltText,
                        severity: A11ySeverity::Error,
                        message: "Image has no alt text for screen readers".into(),
                        suggestion: Some("Add alt text describing the image content".into()),
                    });
                } else if !has_alt {
                    issues.push(A11yIssue {
                        node_id: node.id,
                        node_name: node.name.clone(),
                        issue_type: A11yIssueType::MissingAltText,
                        severity: A11ySeverity::Warning,
                        message: "Image has no explicit alt text (using layer name as fallback)".into(),
                        suggestion: Some("Set alt text for better accessibility".into()),
                    });
                }

                // TouchTargetTooSmall for images (may be interactive)
                if node.width < 44.0 || node.height < 44.0 {
                    issues.push(A11yIssue {
                        node_id: node.id,
                        node_name: node.name.clone(),
                        issue_type: A11yIssueType::TouchTargetTooSmall,
                        severity: A11ySeverity::Warning,
                        message: format!("Image size {:.0}×{:.0} is below 44×44px touch target", node.width, node.height),
                        suggestion: Some("Ensure interactive images are at least 44×44px".into()),
                    });
                }
            }

            NodeKind::Rect | NodeKind::Ellipse | NodeKind::Star { .. } | NodeKind::Polygon { .. } => {
                // TouchTargetTooSmall for small interactive elements
                if node.width < 44.0 || node.height < 44.0 {
                    // Only flag small nodes that might be buttons (have fills/strokes)
                    if !node.fills.is_empty() || !node.strokes.is_empty() {
                        issues.push(A11yIssue {
                            node_id: node.id,
                            node_name: node.name.clone(),
                            issue_type: A11yIssueType::TouchTargetTooSmall,
                            severity: A11ySeverity::Warning,
                            message: format!("Element size {:.0}×{:.0} is below 44×44px minimum touch target", node.width, node.height),
                            suggestion: Some("Increase size to at least 44×44px for accessible touch targets".into()),
                        });
                    }
                }
            }

            _ => {}
        }
    }

    // Sort: errors first, then warnings, then info
    issues.sort_by(|a, b| severity_order(&a.severity).cmp(&severity_order(&b.severity)));
    issues
}

fn severity_order(s: &A11ySeverity) -> u8 {
    match s {
        A11ySeverity::Error => 0,
        A11ySeverity::Warning => 1,
        A11ySeverity::Info => 2,
    }
}

/// Suggest a fix color that meets WCAG AA contrast ratio against the background.
/// Adjusts luminance of the foreground color to meet the target ratio.
pub fn suggest_fix_color(fg: &Color, bg: &Color, target_ratio: f64) -> Color {
    let bg_lum = relative_luminance(bg);
    let fg_lum = relative_luminance(fg);
    let current_ratio = contrast_ratio(fg_lum, bg_lum);
    if current_ratio >= target_ratio {
        return fg.clone(); // already passes
    }

    // Try darkening or lightening the foreground
    let mut best = fg.clone();
    let mut best_ratio = current_ratio;

    // Determine direction: if fg is lighter than bg, darken; else lighten
    let darken = fg_lum > bg_lum;

    for step in 1..=255 {
        let factor = if darken {
            1.0 - (step as f64 / 255.0)
        } else {
            1.0 + (step as f64 / 255.0) * 2.0
        };
        let r = (fg.r as f64 * factor).round().clamp(0.0, 255.0) as u8;
        let g = (fg.g as f64 * factor).round().clamp(0.0, 255.0) as u8;
        let b = (fg.b as f64 * factor).round().clamp(0.0, 255.0) as u8;
        let candidate = Color { r, g, b, a: fg.a, color_space: ColorSpace::default() };
        let ratio = contrast_ratio(relative_luminance(&candidate), bg_lum);
        if ratio >= target_ratio {
            if ratio < best_ratio || best_ratio < target_ratio {
                best = candidate;
                best_ratio = ratio;
            }
            break;
        }
        if ratio > best_ratio {
            best = candidate;
            best_ratio = ratio;
        }
    }
    best
}

fn first_solid_color(node: &Node) -> Option<Color> {
    for f in node.visible_fills() {
        if let FillType::Solid { color } = &f.fill_type {
            return Some(color.clone());
        }
    }
    None
}

fn find_background_color(node_id: NodeId, parent_map: &HashMap<NodeId, NodeId>, node_map: &HashMap<NodeId, Node>) -> Option<Color> {
    let mut current = node_id;
    while let Some(&parent_id) = parent_map.get(&current) {
        if let Some(parent) = node_map.get(&parent_id) {
            if let Some(color) = first_solid_color(parent) {
                return Some(color);
            }
        }
        current = parent_id;
    }
    // Default white background
    Some(Color { r: 255, g: 255, b: 255, a: 1.0, color_space: ColorSpace::default() })
}
