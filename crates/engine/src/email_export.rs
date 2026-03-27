//! Email-compatible HTML export — table-based layout with inline styles
//! for maximum email client compatibility (Gmail, Outlook, Apple Mail, Yahoo).

use crate::node::{Node, NodeKind, NodeId, FillType, TextAlign, FontStyle};
use crate::scene::Scene;
use crate::types::Color;

fn color_to_hex(c: &Color) -> String {
    format!("#{:02x}{:02x}{:02x}", c.r, c.g, c.b)
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn first_solid_color(node: &Node) -> Option<&Color> {
    for fill in &node.fills {
        if !fill.visible { continue; }
        if let FillType::Solid { ref color } = fill.fill_type {
            return Some(color);
        }
    }
    None
}

fn node_to_email(scene: &Scene, node_id: NodeId) -> String {
    let node = match scene.get_node(node_id) {
        Some(n) => n,
        None => return String::new(),
    };
    if !node.visible { return String::new(); }

    match &node.kind {
        NodeKind::Text { content, font_size, font_family, font_weight, font_style, text_align, line_height, .. } => {
            let mut style = format!(
                "margin:0;padding:0;font-size:{fs}px;font-family:{ff},Arial,Helvetica,sans-serif;font-weight:{fw};line-height:{lh};",
                fs = *font_size as u32,
                ff = escape_html(font_family),
                fw = font_weight,
                lh = if *line_height > 0.0 { format!("{:.1}", line_height) } else { "1.4".to_string() },
            );
            if *font_style == FontStyle::Italic {
                style.push_str("font-style:italic;");
            }
            let align = match text_align {
                TextAlign::Center => "center",
                TextAlign::Right => "right",
                _ => "left",
            };
            style.push_str(&format!("text-align:{};", align));
            if let Some(c) = first_solid_color(node) {
                style.push_str(&format!("color:{};", color_to_hex(c)));
            }
            // Convert newlines to <br>
            let html_content = escape_html(content).replace('\n', "<br>");
            format!(r#"<p style="{}">{}</p>"#, style, html_content)
        }
        NodeKind::Image { src, .. } => {
            let w = node.width as u32;
            let h = node.height as u32;
            format!(
                r#"<img src="{}" width="{}" height="{}" alt="{}" style="display:block;border:0;outline:none;max-width:100%;" />"#,
                escape_html(src), w, h, escape_html(&node.name)
            )
        }
        NodeKind::Frame | NodeKind::Group | NodeKind::Section => {
            render_container(scene, node)
        }
        NodeKind::Rect | NodeKind::Ellipse | NodeKind::Star { .. } | NodeKind::Polygon { .. } => {
            // Simple colored block
            let mut style = format!("width:{}px;height:{}px;", node.width as u32, node.height as u32);
            if let Some(c) = first_solid_color(node) {
                style.push_str(&format!("background-color:{};", color_to_hex(c)));
            }
            if node.corner_radius > 0.0 {
                style.push_str(&format!("border-radius:{}px;", node.corner_radius as u32));
            }
            if node.opacity < 1.0 {
                style.push_str(&format!("opacity:{:.2};", node.opacity));
            }
            format!(r#"<div style="{}"><!--[if mso]><v:rect style="width:{}px;height:{}px" fillcolor="{}"><![endif]--><!--[if mso]></v:rect><![endif]--></div>"#,
                style, node.width as u32, node.height as u32,
                first_solid_color(node).map(|c| color_to_hex(c)).unwrap_or_default())
        }
        _ => {
            // Skip unsupported types
            String::new()
        }
    }
}

fn render_container(scene: &Scene, node: &Node) -> String {
    let is_flex = node.layout.mode != crate::node::LayoutMode::None;
    let is_row = matches!(node.layout.direction, crate::node::FlexDirection::Row);

    let mut outer_style = String::new();
    if let Some(c) = first_solid_color(node) {
        outer_style.push_str(&format!("background-color:{};", color_to_hex(c)));
    }
    if node.corner_radius > 0.0 {
        outer_style.push_str(&format!("border-radius:{}px;", node.corner_radius as u32));
    }
    if node.opacity < 1.0 {
        outer_style.push_str(&format!("opacity:{:.2};", node.opacity));
    }

    let (pt, pr, pb, pl) = (node.layout.padding_top, node.layout.padding_right, node.layout.padding_bottom, node.layout.padding_left);
    if pt > 0.0 || pr > 0.0 || pb > 0.0 || pl > 0.0 {
        outer_style.push_str(&format!("padding:{}px {}px {}px {}px;",
            pt as u32, pr as u32, pb as u32, pl as u32));
    }

    let children_html: Vec<String> = node.children.iter()
        .map(|&cid| node_to_email(scene, cid))
        .filter(|s| !s.is_empty())
        .collect();

    if children_html.is_empty() {
        return format!(r#"<div style="width:{}px;height:{}px;{}"></div>"#,
            node.width as u32, node.height as u32, outer_style);
    }

    if is_flex && is_row {
        // Horizontal layout → table with one row, multiple cells
        let gap = node.layout.gap as u32;
        let mut html = format!(
            r#"<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;{}">"#,
            outer_style
        );
        html.push_str("<tr>");
        for (i, child) in children_html.iter().enumerate() {
            let cell_style = if i > 0 && gap > 0 {
                format!("vertical-align:top;padding-left:{}px;", gap)
            } else {
                "vertical-align:top;".to_string()
            };
            html.push_str(&format!(r#"<td style="{}">{}</td>"#, cell_style, child));
        }
        html.push_str("</tr></table>");
        html
    } else {
        // Vertical layout (column) → stacked rows
        let gap = if is_flex { node.layout.gap as u32 } else { 0 };
        let mut html = format!(
            r#"<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="{}" style="border-collapse:collapse;{}">"#,
            node.width as u32, outer_style
        );
        for (i, child) in children_html.iter().enumerate() {
            let cell_style = if i > 0 && gap > 0 {
                format!("padding-top:{}px;", gap)
            } else {
                String::new()
            };
            html.push_str(&format!(r#"<tr><td style="{}">{}</td></tr>"#, cell_style, child));
        }
        html.push_str("</table>");
        html
    }
}

/// Export the active page as email-compatible HTML
pub fn export_email_html(scene: &Scene) -> String {
    let root_ids: Vec<NodeId> = scene.root_children.clone();
    let mut body = String::new();
    for &id in &root_ids {
        body.push_str(&node_to_email(scene, id));
    }

    format!(r#"<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="x-apple-disable-message-reformatting" />
<title>Email</title>
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:AllowPNG/>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<![endif]-->
<style type="text/css">
body {{ margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }}
table {{ border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }}
img {{ -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }}
</style>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;">
<center>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="border-collapse:collapse;width:600px;margin:0 auto;">
<tr><td style="padding:0;">
{body}
</td></tr>
</table>
</center>
</body>
</html>"#)
}
