use crate::types::{Color, Rect as BBox};
use crate::component::InstanceData;
use serde::{Deserialize, Serialize};

pub type NodeId = u64;

/// Text alignment
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum TextAlign {
    Left,
    Center,
    Right,
}

impl Default for TextAlign {
    fn default() -> Self { TextAlign::Left }
}

/// Font style
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum FontStyle {
    Normal,
    Italic,
}

impl Default for FontStyle {
    fn default() -> Self { FontStyle::Normal }
}

/// A point on a vector path with optional bezier control handles.
/// Handle coordinates are absolute (not relative to the anchor point).
/// If handle == anchor, the segment is a straight line on that side.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PathPoint {
    pub x: f64,
    pub y: f64,
    /// Incoming control handle (absolute coords)
    pub handle_in_x: f64,
    pub handle_in_y: f64,
    /// Outgoing control handle (absolute coords)
    pub handle_out_x: f64,
    pub handle_out_y: f64,
}

impl PathPoint {
    pub fn corner(x: f64, y: f64) -> Self {
        Self { x, y, handle_in_x: x, handle_in_y: y, handle_out_x: x, handle_out_y: y }
    }

    pub fn has_handle_in(&self) -> bool {
        (self.handle_in_x - self.x).abs() > 0.001 || (self.handle_in_y - self.y).abs() > 0.001
    }

    pub fn has_handle_out(&self) -> bool {
        (self.handle_out_x - self.x).abs() > 0.001 || (self.handle_out_y - self.y).abs() > 0.001
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum NodeKind {
    Rect,
    Ellipse,
    Text {
        content: String,
        font_size: f64,
        font_family: String,
        #[serde(default = "default_line_height")]
        line_height: f64,
        #[serde(default)]
        text_align: TextAlign,
        #[serde(default = "default_font_weight")]
        font_weight: u16,
        #[serde(default)]
        font_style: FontStyle,
    },
    Frame,
    Group,
    /// A slot placeholder inside a component template
    Slot { slot_name: String },
    /// An instance of a component
    Instance(Box<InstanceData>),
    /// A vector path (bezier curves)
    Path {
        /// Path points with bezier handles
        points: Vec<PathPoint>,
        /// Whether the path is closed
        closed: bool,
    },
    /// An image node (rendered via TS-side drawImage)
    Image {
        /// URL or data URI of the image
        src: String,
        /// Object-fit mode: "cover", "contain", "fill"
        #[serde(default = "default_image_fit")]
        fit: String,
    },
    /// A star shape with configurable point count and inner radius ratio
    Star {
        /// Number of points (tips)
        points: u32,
        /// Inner radius as a ratio of outer radius (0.0–1.0)
        inner_radius: f64,
    },
    /// A regular polygon with configurable side count
    Polygon {
        /// Number of sides
        sides: u32,
    },
}

fn default_line_height() -> f64 { 1.2 }
fn default_font_weight() -> u16 { 400 }
fn default_image_fit() -> String { "cover".to_string() }

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GradientStop {
    pub offset: f64,
    pub color: Color,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum FillType {
    Solid {
        color: Color,
    },
    LinearGradient {
        start_x: f64,
        start_y: f64,
        end_x: f64,
        end_y: f64,
        stops: Vec<GradientStop>,
    },
    RadialGradient {
        center_x: f64,
        center_y: f64,
        radius: f64,
        stops: Vec<GradientStop>,
    },
}

/// Fill supports backward-compatible deserialization:
/// Old format: `{"color": {...}}` → Solid
/// New format: `{"fill_type": {"Solid": ...}}` or `{"fill_type": {"LinearGradient": ...}}`
#[derive(Clone, Debug, Serialize)]
pub struct Fill {
    pub fill_type: FillType,
}

impl<'de> serde::Deserialize<'de> for Fill {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where D: serde::Deserializer<'de>
    {
        let value = serde_json::Value::deserialize(deserializer)?;
        // New format: has "fill_type" key
        if let Some(ft) = value.get("fill_type") {
            let fill_type: FillType = serde_json::from_value(ft.clone())
                .map_err(serde::de::Error::custom)?;
            return Ok(Fill { fill_type });
        }
        // Old format: has "color" key directly
        if let Some(color_val) = value.get("color") {
            let color: Color = serde_json::from_value(color_val.clone())
                .map_err(serde::de::Error::custom)?;
            return Ok(Fill::solid(color));
        }
        Err(serde::de::Error::custom("expected fill_type or color"))
    }
}

impl Fill {
    pub fn solid(color: Color) -> Self {
        Fill { fill_type: FillType::Solid { color } }
    }

    pub fn color(&self) -> Color {
        match &self.fill_type {
            FillType::Solid { color } => *color,
            FillType::LinearGradient { stops, .. } | FillType::RadialGradient { stops, .. } => {
                stops.first().map(|s| s.color).unwrap_or(Color::white())
            }
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum LineCap {
    Butt,
    Round,
    Square,
}

impl Default for LineCap {
    fn default() -> Self { LineCap::Butt }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum LineJoin {
    Miter,
    Round,
    Bevel,
}

impl Default for LineJoin {
    fn default() -> Self { LineJoin::Miter }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Stroke {
    pub color: Color,
    pub width: f64,
    #[serde(default)]
    pub dash_array: Vec<f64>,
    #[serde(default)]
    pub dash_offset: f64,
    #[serde(default)]
    pub line_cap: LineCap,
    #[serde(default)]
    pub line_join: LineJoin,
}

/// Layout mode for container nodes
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum LayoutMode {
    None,
    Flex,
    Grid,
}

impl Default for LayoutMode {
    fn default() -> Self { LayoutMode::None }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum FlexDirection {
    Row,
    Column,
}

impl Default for FlexDirection {
    fn default() -> Self { FlexDirection::Row }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum Align {
    Start,
    Center,
    End,
    Stretch,
}

impl Default for Align {
    fn default() -> Self { Align::Start }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum Justify {
    Start,
    Center,
    End,
    SpaceBetween,
    SpaceAround,
    SpaceEvenly,
}

impl Default for Justify {
    fn default() -> Self { Justify::Start }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum FlexWrap {
    NoWrap,
    Wrap,
}

impl Default for FlexWrap {
    fn default() -> Self { FlexWrap::NoWrap }
}

/// Text sizing mode
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum TextSizing {
    Fit,
    Fixed,
}

impl Default for TextSizing {
    fn default() -> Self { TextSizing::Fit }
}

/// Layout properties for container nodes (Frame, Instance, Group)
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct Layout {
    pub mode: LayoutMode,
    pub direction: FlexDirection,
    pub align_items: Align,
    pub justify_content: Justify,
    pub gap: f64,
    pub padding_top: f64,
    pub padding_right: f64,
    pub padding_bottom: f64,
    pub padding_left: f64,
    pub wrap: FlexWrap,
    // Grid-specific
    pub grid_columns: u32,
    pub grid_rows: u32,
}

/// Horizontal constraint
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum ConstraintH {
    Left,
    Right,
    LeftAndRight,
    Center,
    Scale,
}

impl Default for ConstraintH {
    fn default() -> Self { ConstraintH::Left }
}

/// Vertical constraint
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum ConstraintV {
    Top,
    Bottom,
    TopAndBottom,
    Center,
    Scale,
}

impl Default for ConstraintV {
    fn default() -> Self { ConstraintV::Top }
}

/// Constraints for responsive resize
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct Constraints {
    pub horizontal: ConstraintH,
    pub vertical: ConstraintV,
}

/// Drop shadow effect
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Shadow {
    pub color: Color,
    pub offset_x: f64,
    pub offset_y: f64,
    pub blur: f64,
    pub spread: f64,
    pub visible: bool,
}

/// Blend mode for layer compositing
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
pub enum BlendMode {
    Normal,
    Multiply,
    Screen,
    Overlay,
    Darken,
    Lighten,
    ColorDodge,
    ColorBurn,
    HardLight,
    SoftLight,
    Difference,
    Exclusion,
    Hue,
    Saturation,
    Color,
    Luminosity,
}

impl Default for BlendMode {
    fn default() -> Self { BlendMode::Normal }
}

impl BlendMode {
    /// Returns the CSS `globalCompositeOperation` / `mix-blend-mode` value
    pub fn to_css(&self) -> &'static str {
        match self {
            BlendMode::Normal => "normal",
            BlendMode::Multiply => "multiply",
            BlendMode::Screen => "screen",
            BlendMode::Overlay => "overlay",
            BlendMode::Darken => "darken",
            BlendMode::Lighten => "lighten",
            BlendMode::ColorDodge => "color-dodge",
            BlendMode::ColorBurn => "color-burn",
            BlendMode::HardLight => "hard-light",
            BlendMode::SoftLight => "soft-light",
            BlendMode::Difference => "difference",
            BlendMode::Exclusion => "exclusion",
            BlendMode::Hue => "hue",
            BlendMode::Saturation => "saturation",
            BlendMode::Color => "color",
            BlendMode::Luminosity => "luminosity",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "multiply" => BlendMode::Multiply,
            "screen" => BlendMode::Screen,
            "overlay" => BlendMode::Overlay,
            "darken" => BlendMode::Darken,
            "lighten" => BlendMode::Lighten,
            "color-dodge" => BlendMode::ColorDodge,
            "color-burn" => BlendMode::ColorBurn,
            "hard-light" => BlendMode::HardLight,
            "soft-light" => BlendMode::SoftLight,
            "difference" => BlendMode::Difference,
            "exclusion" => BlendMode::Exclusion,
            "hue" => BlendMode::Hue,
            "saturation" => BlendMode::Saturation,
            "color" => BlendMode::Color,
            "luminosity" => BlendMode::Luminosity,
            _ => BlendMode::Normal,
        }
    }
}

/// Attached note (markdown)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Note {
    pub content: String,
    pub tags: Vec<String>,
    pub updated_at: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Node {
    pub id: NodeId,
    pub name: String,
    pub kind: NodeKind,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: f64,
    pub opacity: f64,
    pub visible: bool,
    pub locked: bool,
    pub fill: Option<Fill>,
    pub stroke: Option<Stroke>,
    pub corner_radius: f64,
    pub children: Vec<NodeId>,
    pub parent: Option<NodeId>,
    /// Text sizing mode (Fit = auto-size to content, Fixed = manual)
    #[serde(default)]
    pub text_sizing: TextSizing,
    /// Layout properties
    #[serde(default)]
    pub layout: Layout,
    /// Attached notes (markdown documents)
    #[serde(default)]
    pub notes: Vec<Note>,
    /// Drop shadows
    #[serde(default)]
    pub shadows: Vec<Shadow>,
    /// Layer blur (0 = none)
    #[serde(default)]
    pub blur: f64,
    /// Constraints (responsive resize behavior relative to parent)
    #[serde(default)]
    pub constraints: Constraints,
    /// When true, this node acts as a mask — clipping all subsequent siblings
    #[serde(default)]
    pub is_mask: bool,
    /// Blend mode for compositing
    #[serde(default)]
    pub blend_mode: BlendMode,
}

impl Node {
    pub fn new(id: NodeId, kind: NodeKind) -> Self {
        Self {
            id,
            name: format!("{:?}", kind),
            kind,
            x: 0.0, y: 0.0,
            width: 100.0, height: 100.0,
            rotation: 0.0,
            opacity: 1.0,
            visible: true,
            locked: false,
            fill: Some(Fill::solid(Color { r: 200, g: 200, b: 200, a: 1.0 })),
            stroke: None,
            corner_radius: 0.0,
            children: vec![],
            parent: None,
            text_sizing: TextSizing::default(),
            layout: Layout::default(),
            notes: vec![],
            shadows: vec![],
            blur: 0.0,
            constraints: Constraints::default(),
            is_mask: false,
            blend_mode: BlendMode::default(),
        }
    }

    pub fn bounds(&self) -> BBox {
        BBox { x: self.x, y: self.y, width: self.width, height: self.height }
    }
}
