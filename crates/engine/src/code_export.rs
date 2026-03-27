//! Design-to-code component export — generates actual component code from nodes with CodeMapping.

use crate::node::{CodeFramework, CodeMapping, Node, NodeId, NodeKind, PropBinding, FlexDirection};
use crate::scene::Scene;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
pub struct ExportedComponent {
    pub component_name: String,
    pub framework: String,
    pub import_path: String,
    pub code: String,
    pub props_interface: String,
}

impl Scene {
    /// Export a single node as a code component
    pub fn export_component_code(&self, node_id: NodeId) -> Option<ExportedComponent> {
        let node = self.get_node(node_id)?;
        let mapping = node.code_mapping.as_ref()?;
        if mapping.component_name.is_empty() { return None; }

        let (code, props_iface) = match mapping.framework {
            CodeFramework::React => gen_react(node, mapping, self),
            CodeFramework::Vue => gen_vue(node, mapping, self),
            CodeFramework::SwiftUI => gen_swiftui(node, mapping, self),
            CodeFramework::Compose => gen_compose(node, mapping, self),
            CodeFramework::Flutter => gen_flutter(node, mapping, self),
        };

        Some(ExportedComponent {
            component_name: mapping.component_name.clone(),
            framework: mapping.framework.as_str().to_string(),
            import_path: mapping.import_path.clone(),
            code,
            props_interface: props_iface,
        })
    }

    /// Set code mapping on a node
    pub fn set_code_mapping(&mut self, node_id: NodeId, mapping: CodeMapping) -> bool {
        if let Some(node) = self.get_node_mut(node_id) {
            node.code_mapping = Some(mapping);
            true
        } else {
            false
        }
    }

    /// Remove code mapping from a node
    pub fn clear_code_mapping(&mut self, node_id: NodeId) -> bool {
        if let Some(node) = self.get_node_mut(node_id) {
            node.code_mapping = None;
            true
        } else {
            false
        }
    }

    /// Get code mapping as JSON
    pub fn get_code_mapping(&self, node_id: NodeId) -> Option<String> {
        let node = self.get_node(node_id)?;
        let mapping = node.code_mapping.as_ref()?;
        serde_json::to_string(mapping).ok()
    }

    /// Export all mapped components in the scene
    pub fn export_all_components(&self) -> Vec<ExportedComponent> {
        let mut result = Vec::new();
        for page in &self.pages {
            for node in &page.nodes {
                if node.code_mapping.is_some() {
                    if let Some(exp) = self.export_component_code(node.id) {
                        result.push(exp);
                    }
                }
            }
        }
        result
    }
}

// ---- Resolve design property value from node ----

fn resolve_prop_value(node: &Node, source: &str) -> String {
    match source {
        "text.content" => match &node.kind {
            NodeKind::Text { content, .. } => content.clone(),
            _ => String::new(),
        },
        "opacity" => format!("{}", node.opacity),
        "width" => format!("{}", node.width),
        "height" => format!("{}", node.height),
        "corner_radius" => format!("{}", node.corner_radius),
        "visible" => format!("{}", node.visible),
        s if s.starts_with("fill.") => {
            // fill.0.color
            let parts: Vec<&str> = s.split('.').collect();
            if parts.len() >= 3 {
                let idx: usize = parts[1].parse().unwrap_or(0);
                if let Some(fill) = node.fills.get(idx) {
                    fill.color().to_css()
                } else {
                    String::new()
                }
            } else {
                String::new()
            }
        }
        _ => String::new(),
    }
}

fn ts_type(prop_type: &str) -> &str {
    match prop_type {
        "string" | "color" | "enum" => "string",
        "number" => "number",
        "boolean" => "boolean",
        _ => "any",
    }
}

fn swift_type(prop_type: &str) -> &str {
    match prop_type {
        "string" | "enum" => "String",
        "color" => "Color",
        "number" => "CGFloat",
        "boolean" => "Bool",
        _ => "Any",
    }
}

fn kotlin_type(prop_type: &str) -> &str {
    match prop_type {
        "string" | "enum" => "String",
        "color" => "Color",
        "number" => "Float",
        "boolean" => "Boolean",
        _ => "Any",
    }
}

fn dart_type(prop_type: &str) -> &str {
    match prop_type {
        "string" | "enum" => "String",
        "color" => "Color",
        "number" => "double",
        "boolean" => "bool",
        _ => "dynamic",
    }
}

fn indent(s: &str, n: usize) -> String {
    let prefix = " ".repeat(n);
    s.lines().map(|l| format!("{}{}", prefix, l)).collect::<Vec<_>>().join("\n")
}

// ---- React ----

fn gen_react(node: &Node, mapping: &CodeMapping, scene: &Scene) -> (String, String) {
    let name = &mapping.component_name;
    let props = &mapping.props;

    // Props interface
    let mut iface = format!("interface {}Props {{\n", name);
    for p in props {
        iface.push_str(&format!("  {}?: {};\n", p.prop_name, ts_type(&p.prop_type)));
    }
    if mapping.children_slot {
        iface.push_str("  children?: React.ReactNode;\n");
    }
    iface.push_str("}");

    // Component
    let mut code = String::new();
    if !mapping.import_path.is_empty() {
        code.push_str(&format!("import {{ {} }} from '{}';\n\n", name, mapping.import_path));
    }
    code.push_str(&format!("{}\n\n", iface));
    code.push_str(&format!("export function {}({{\n", name));
    for p in props {
        let dv = if !p.default_value.is_empty() {
            format!(" = {}", format_default(&p.default_value, &p.prop_type))
        } else {
            String::new()
        };
        code.push_str(&format!("  {}{},\n", p.prop_name, dv));
    }
    if mapping.children_slot {
        code.push_str("  children,\n");
    }
    code.push_str(&format!("}}: {}Props) {{\n", name));

    // Style from design
    code.push_str("  return (\n");
    code.push_str(&format!("    <div\n"));
    code.push_str("      style={{\n");
    code.push_str(&format!("        width: {},\n", node.width as i64));
    code.push_str(&format!("        height: {},\n", node.height as i64));
    if node.corner_radius > 0.0 {
        code.push_str(&format!("        borderRadius: {},\n", node.corner_radius as i64));
    }
    if node.opacity < 1.0 {
        code.push_str(&format!("        opacity: {},\n", node.opacity));
    }
    if let Some(fill) = node.fills.first() {
        code.push_str(&format!("        background: '{}',\n", fill.color().to_css()));
    }
    // Auto layout → flexbox
    if node.layout.mode != crate::node::LayoutMode::None {
        code.push_str("        display: 'flex',\n");
        let dir = match node.layout.direction {
            crate::node::FlexDirection::Row => "row",
            crate::node::FlexDirection::Column => "column",
        };
        code.push_str(&format!("        flexDirection: '{}',\n", dir));
        if node.layout.gap > 0.0 {
            code.push_str(&format!("        gap: {},\n", node.layout.gap as i64));
        }
    }
    code.push_str("      }}\n");
    code.push_str("    >\n");
    if mapping.children_slot {
        code.push_str("      {children}\n");
    }
    // Child component instances
    for &child_id in &node.children {
        if let Some(child) = scene.get_node(child_id) {
            if let Some(ref cm) = child.code_mapping {
                if !cm.component_name.is_empty() {
                    code.push_str(&format!("      <{}", cm.component_name));
                    for p in &cm.props {
                        let val = resolve_prop_value(child, &p.design_source);
                        if !val.is_empty() {
                            code.push_str(&format!(" {}={}", p.prop_name, format_jsx_attr(&val, &p.prop_type)));
                        }
                    }
                    code.push_str(" />\n");
                }
            }
        }
    }
    code.push_str("    </div>\n");
    code.push_str("  );\n");
    code.push_str("}");

    (code, iface)
}

fn format_default(val: &str, prop_type: &str) -> String {
    match prop_type {
        "string" | "color" | "enum" => format!("'{}'", val),
        "boolean" => val.to_string(),
        "number" => val.to_string(),
        _ => format!("'{}'", val),
    }
}

fn format_jsx_attr(val: &str, prop_type: &str) -> String {
    match prop_type {
        "string" | "color" | "enum" => format!("\"{}\"", val),
        _ => format!("{{{}}}", val),
    }
}

// ---- Vue ----

fn gen_vue(node: &Node, mapping: &CodeMapping, _scene: &Scene) -> (String, String) {
    let name = &mapping.component_name;
    let props = &mapping.props;

    let mut props_def = String::from("const props = defineProps<{\n");
    for p in props {
        props_def.push_str(&format!("  {}?: {};\n", p.prop_name, ts_type(&p.prop_type)));
    }
    props_def.push_str("}>();");

    let mut code = format!("<script setup lang=\"ts\">\n{}\n</script>\n\n", props_def);
    code.push_str("<template>\n");
    code.push_str(&format!("  <div class=\"{}\">\n", to_kebab(name)));
    if mapping.children_slot {
        code.push_str("    <slot />\n");
    }
    code.push_str("  </div>\n");
    code.push_str("</template>\n\n");
    code.push_str("<style scoped>\n");
    code.push_str(&format!(".{} {{\n", to_kebab(name)));
    code.push_str(&format!("  width: {}px;\n", node.width as i64));
    code.push_str(&format!("  height: {}px;\n", node.height as i64));
    if node.corner_radius > 0.0 {
        code.push_str(&format!("  border-radius: {}px;\n", node.corner_radius as i64));
    }
    if let Some(fill) = node.fills.first() {
        code.push_str(&format!("  background: {};\n", fill.color().to_css()));
    }
    code.push_str("}\n");
    code.push_str("</style>");

    (code, props_def)
}

// ---- SwiftUI ----

fn gen_swiftui(node: &Node, mapping: &CodeMapping, _scene: &Scene) -> (String, String) {
    let name = &mapping.component_name;
    let props = &mapping.props;

    let mut props_iface = String::new();
    let mut code = format!("struct {}: View {{\n", name);
    for p in props {
        let st = swift_type(&p.prop_type);
        code.push_str(&format!("    var {}: {}", p.prop_name, st));
        if !p.default_value.is_empty() {
            code.push_str(&format!(" = {}", format_swift_default(&p.default_value, &p.prop_type)));
        }
        code.push_str("\n");
        props_iface.push_str(&format!("var {}: {}\n", p.prop_name, st));
    }
    code.push_str("\n    var body: some View {\n");
    code.push_str("        RoundedRectangle(cornerRadius: ");
    code.push_str(&format!("{})\n", node.corner_radius));
    if let Some(fill) = node.fills.first() {
        code.push_str(&format!("            .fill(Color(hex: \"{}\"))\n", fill.color().to_css()));
    }
    code.push_str(&format!("            .frame(width: {}, height: {})\n", node.width, node.height));
    if node.opacity < 1.0 {
        code.push_str(&format!("            .opacity({})\n", node.opacity));
    }
    code.push_str("    }\n");
    code.push_str("}");

    (code, props_iface)
}

fn format_swift_default(val: &str, prop_type: &str) -> String {
    match prop_type {
        "string" | "enum" => format!("\"{}\"", val),
        "color" => format!("Color(hex: \"{}\")", val),
        _ => val.to_string(),
    }
}

// ---- Compose (Kotlin) ----

fn gen_compose(node: &Node, mapping: &CodeMapping, _scene: &Scene) -> (String, String) {
    let name = &mapping.component_name;
    let props = &mapping.props;

    let mut params = String::new();
    for (i, p) in props.iter().enumerate() {
        if i > 0 { params.push_str(",\n    "); }
        params.push_str(&format!("{}: {}", p.prop_name, kotlin_type(&p.prop_type)));
        if !p.default_value.is_empty() {
            params.push_str(&format!(" = {}", format_kotlin_default(&p.default_value, &p.prop_type)));
        }
    }

    let mut code = format!("@Composable\nfun {}(\n    {}\n) {{\n", name, params);
    code.push_str("    Box(\n");
    code.push_str("        modifier = Modifier\n");
    code.push_str(&format!("            .size(width = {}.dp, height = {}.dp)\n", node.width as i64, node.height as i64));
    if node.corner_radius > 0.0 {
        code.push_str(&format!("            .clip(RoundedCornerShape({}.dp))\n", node.corner_radius as i64));
    }
    if let Some(fill) = node.fills.first() {
        code.push_str(&format!("            .background(Color(0xFF{}))\n", fill.color().to_css().trim_start_matches('#')));
    }
    if node.opacity < 1.0 {
        code.push_str(&format!("            .alpha({}f)\n", node.opacity));
    }
    code.push_str("    ) {\n");
    if mapping.children_slot {
        code.push_str("        content()\n");
    }
    code.push_str("    }\n");
    code.push_str("}");

    (code, params)
}

fn format_kotlin_default(val: &str, prop_type: &str) -> String {
    match prop_type {
        "string" | "enum" => format!("\"{}\"", val),
        "color" => format!("Color(0xFF{})", val.trim_start_matches('#')),
        _ => val.to_string(),
    }
}

// ---- Flutter (Dart) ----

fn gen_flutter(node: &Node, mapping: &CodeMapping, _scene: &Scene) -> (String, String) {
    let name = &mapping.component_name;
    let props = &mapping.props;

    let mut params = String::new();
    for p in props {
        params.push_str(&format!("    {} {}",  dart_type(&p.prop_type), p.prop_name));
        if !p.default_value.is_empty() {
            params.push_str(&format!(" = {}", format_dart_default(&p.default_value, &p.prop_type)));
        }
        params.push_str(",\n");
    }

    let mut code = format!("class {} extends StatelessWidget {{\n", name);
    for p in props {
        code.push_str(&format!("  final {} {};\n", dart_type(&p.prop_type), p.prop_name));
    }
    if mapping.children_slot {
        code.push_str("  final Widget? child;\n");
    }
    code.push_str(&format!("\n  const {}({{\n    super.key,\n{}  }});\n\n", name, params));
    code.push_str("  @override\n  Widget build(BuildContext context) {\n");
    code.push_str("    return Container(\n");
    code.push_str(&format!("      width: {},\n", node.width));
    code.push_str(&format!("      height: {},\n", node.height));
    code.push_str("      decoration: BoxDecoration(\n");
    if node.corner_radius > 0.0 {
        code.push_str(&format!("        borderRadius: BorderRadius.circular({}),\n", node.corner_radius));
    }
    if let Some(fill) = node.fills.first() {
        code.push_str(&format!("        color: Color(0xFF{}),\n", fill.color().to_css().trim_start_matches('#')));
    }
    code.push_str("      ),\n");
    if mapping.children_slot {
        code.push_str("      child: child,\n");
    }
    code.push_str("    );\n");
    code.push_str("  }\n");
    code.push_str("}");

    (code, params)
}

fn format_dart_default(val: &str, prop_type: &str) -> String {
    match prop_type {
        "string" | "enum" => format!("'{}'", val),
        "color" => format!("Color(0xFF{})", val.trim_start_matches('#')),
        _ => val.to_string(),
    }
}

fn to_kebab(s: &str) -> String {
    let mut result = String::new();
    for (i, c) in s.chars().enumerate() {
        if c.is_uppercase() {
            if i > 0 { result.push('-'); }
            result.push(c.to_lowercase().next().unwrap());
        } else {
            result.push(c);
        }
    }
    result
}
