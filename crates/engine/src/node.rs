use crate::types::{Color, Rect as BBox};
use crate::component::InstanceData;
use crate::variable::VisibilityCondition;
use crate::vector_network::VectorNetwork;
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

/// Text decoration
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum TextDecoration {
    None,
    Underline,
    Strikethrough,
    UnderlineStrikethrough,
}

impl Default for TextDecoration {
    fn default() -> Self { TextDecoration::None }
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
        #[serde(default)]
        text_decoration: TextDecoration,
        /// Letter spacing in pixels (0 = normal)
        #[serde(default)]
        letter_spacing: f64,
        /// Paragraph spacing in pixels (extra space after each paragraph/newline)
        #[serde(default)]
        paragraph_spacing: f64,
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
    /// A section container (Figma Section — page organization with title label)
    Section,
    /// A slice (export region) — not rendered on canvas, defines an area for export
    Slice,
    /// A vector network (Figma-style: vertices + segments + fill regions)
    VectorNetwork(Box<VectorNetwork>),
    /// A connector (arrow/line) between two nodes
    Connector {
        /// Source node ID (0 = unconnected, uses start_x/start_y)
        start_node_id: u64,
        /// Target node ID (0 = unconnected, uses end_x/end_y)
        end_node_id: u64,
        /// Absolute start point (used when start_node_id == 0 or for rendering)
        start_x: f64,
        start_y: f64,
        /// Absolute end point (used when end_node_id == 0 or for rendering)
        end_x: f64,
        end_y: f64,
        /// Path type: "straight" or "curved"
        path_type: String,
        /// Show arrowhead at end
        end_arrow: bool,
        /// Show arrowhead at start
        start_arrow: bool,
    },
}

fn default_line_height() -> f64 { 1.2 }
fn default_font_weight() -> u16 { 400 }
fn default_image_fit() -> String { "cover".to_string() }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct GradientStop {
    pub offset: f64,
    pub color: Color,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
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

fn default_visible() -> bool { true }

/// Fill supports backward-compatible deserialization:
/// Old format: `{"color": {...}}` → Solid
/// New format: `{"fill_type": {"Solid": ...}}` or `{"fill_type": {"LinearGradient": ...}}`
#[derive(Clone, Debug, Serialize)]
pub struct Fill {
    pub fill_type: FillType,
    #[serde(default = "default_visible")]
    pub visible: bool,
}

impl<'de> serde::Deserialize<'de> for Fill {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where D: serde::Deserializer<'de>
    {
        let value = serde_json::Value::deserialize(deserializer)?;
        let visible = value.get("visible").and_then(|v| v.as_bool()).unwrap_or(true);
        // New format: has "fill_type" key
        if let Some(ft) = value.get("fill_type") {
            let fill_type: FillType = serde_json::from_value(ft.clone())
                .map_err(serde::de::Error::custom)?;
            return Ok(Fill { fill_type, visible });
        }
        // Old format: has "color" key directly
        if let Some(color_val) = value.get("color") {
            let color: Color = serde_json::from_value(color_val.clone())
                .map_err(serde::de::Error::custom)?;
            return Ok(Fill { fill_type: FillType::Solid { color }, visible });
        }
        Err(serde::de::Error::custom("expected fill_type or color"))
    }
}

impl Fill {
    pub fn solid(color: Color) -> Self {
        Fill { fill_type: FillType::Solid { color }, visible: true }
    }

    pub fn color(&self) -> Color {
        match &self.fill_type {
            FillType::Solid { color } => *color,
            FillType::LinearGradient { stops, .. } | FillType::RadialGradient { stops, .. } => {
                stops.first().map(|s| s.color).unwrap_or(Color::white())
            }
        }
    }

    pub fn set_color_r(&mut self, r: u8) {
        if let FillType::Solid { ref mut color } = self.fill_type { color.r = r; }
    }
    pub fn set_color_g(&mut self, g: u8) {
        if let FillType::Solid { ref mut color } = self.fill_type { color.g = g; }
    }
    pub fn set_color_b(&mut self, b: u8) {
        if let FillType::Solid { ref mut color } = self.fill_type { color.b = b; }
    }
    pub fn set_color_a(&mut self, a: f64) {
        if let FillType::Solid { ref mut color } = self.fill_type { color.a = a; }
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

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum StrokeAlign {
    Center,
    Inside,
    Outside,
}

impl Default for StrokeAlign {
    fn default() -> Self { StrokeAlign::Center }
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
    #[serde(default)]
    pub align: StrokeAlign,
    #[serde(default = "default_visible")]
    pub visible: bool,
}

impl Stroke {
    pub fn new(color: Color, width: f64) -> Self {
        Stroke {
            color,
            width,
            dash_array: vec![],
            dash_offset: 0.0,
            line_cap: LineCap::default(),
            line_join: LineJoin::default(),
            align: StrokeAlign::default(),
            visible: true,
        }
    }
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

/// Overflow behavior for container nodes
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum Overflow {
    Visible,
    Hidden,
    Scroll,
}

impl Default for Overflow {
    fn default() -> Self { Overflow::Visible }
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

/// Auto layout sizing mode for children (Figma-style hug/fill)
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum SizingMode {
    /// Use the node's explicit width/height
    Fixed,
    /// Shrink to fit content (only meaningful for containers)
    Hug,
    /// Expand to fill available space in parent's layout
    Fill,
}

impl Default for SizingMode {
    fn default() -> Self { SizingMode::Fixed }
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

/// Layout grid overlay type
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum LayoutGridType {
    Columns,
    Rows,
    Grid,
}

impl Default for LayoutGridType {
    fn default() -> Self { LayoutGridType::Columns }
}

/// Layout grid size mode
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum GridSizeMode {
    Auto,
    Fixed(f64),
}

impl Default for GridSizeMode {
    fn default() -> Self { GridSizeMode::Auto }
}

/// Layout grid overlay definition
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LayoutGrid {
    pub grid_type: LayoutGridType,
    pub count: u32,
    pub size_mode: GridSizeMode,
    pub gutter: f64,
    pub margin: f64,
    pub color: Color,
    pub visible: bool,
}

impl Default for LayoutGrid {
    fn default() -> Self {
        Self {
            grid_type: LayoutGridType::Columns,
            count: 12,
            size_mode: GridSizeMode::Auto,
            gutter: 20.0,
            margin: 20.0,
            color: Color { r: 255, g: 0, b: 0, a: 0.1 },
            visible: true,
        }
    }
}

/// Interaction trigger type
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum InteractionTrigger {
    OnClick,
    OnHover,
    OnPress,
    OnDrag,
}

impl Default for InteractionTrigger {
    fn default() -> Self { InteractionTrigger::OnClick }
}

/// Interaction action type
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum InteractionAction {
    NavigateTo,
    Back,
    ScrollTo,
    OpenOverlay,
    CloseOverlay,
}

impl Default for InteractionAction {
    fn default() -> Self { InteractionAction::NavigateTo }
}

/// Transition animation type
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum TransitionType {
    Instant,
    Dissolve,
    SmartAnimate,
    SlideIn,
    SlideOut,
    Push,
}

impl Default for TransitionType {
    fn default() -> Self { TransitionType::Instant }
}

/// A prototype interaction link
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Interaction {
    pub trigger: InteractionTrigger,
    pub action: InteractionAction,
    /// Target frame/page node ID (0 = none)
    pub target_node_id: u64,
    /// Target page ID (0 = same page)
    pub target_page_id: u64,
    pub transition: TransitionType,
    /// Transition duration in ms
    pub transition_duration_ms: u32,
}

impl Default for Interaction {
    fn default() -> Self {
        Self {
            trigger: InteractionTrigger::OnClick,
            action: InteractionAction::NavigateTo,
            target_node_id: 0,
            target_page_id: 0,
            transition: TransitionType::Instant,
            transition_duration_ms: 300,
        }
    }
}

/// A reply in a comment thread
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CommentReply {
    pub id: u64,
    pub author: String,
    pub text: String,
    pub timestamp: u64,
}

/// A positioned comment on the canvas (for collaborative review)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Comment {
    pub id: u64,
    pub x: f64,
    pub y: f64,
    pub author: String,
    pub text: String,
    pub timestamp: u64,
    pub resolved: bool,
    #[serde(default)]
    pub replies: Vec<CommentReply>,
    /// Optional: pinned to a specific node
    #[serde(default)]
    pub node_id: Option<u64>,
    /// Page ID this comment belongs to
    #[serde(default)]
    pub page_id: u64,
}

/// Bitmap filter effects (CSS filter functions)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BitmapFilter {
    /// Brightness multiplier (1.0 = normal, 0 = black, 2 = double)
    #[serde(default = "default_one")]
    pub brightness: f64,
    /// Contrast multiplier (1.0 = normal)
    #[serde(default = "default_one")]
    pub contrast: f64,
    /// Saturation multiplier (1.0 = normal, 0 = grayscale)
    #[serde(default = "default_one")]
    pub saturation: f64,
    /// Hue rotation in degrees (0 = normal, 0-360)
    #[serde(default)]
    pub hue_rotate: f64,
    /// Invert amount (0.0 = normal, 1.0 = fully inverted)
    #[serde(default)]
    pub invert: f64,
    /// Grayscale amount (0.0 = normal, 1.0 = fully gray)
    #[serde(default)]
    pub grayscale: f64,
    /// Sepia amount (0.0 = normal, 1.0 = fully sepia)
    #[serde(default)]
    pub sepia: f64,
    /// Whether the filter is enabled
    #[serde(default = "default_visible")]
    pub enabled: bool,
}

fn default_one() -> f64 { 1.0 }

impl Default for BitmapFilter {
    fn default() -> Self {
        Self {
            brightness: 1.0,
            contrast: 1.0,
            saturation: 1.0,
            hue_rotate: 0.0,
            invert: 0.0,
            grayscale: 0.0,
            sepia: 0.0,
            enabled: true,
        }
    }
}

impl BitmapFilter {
    /// Returns true if the filter has no effect (all defaults)
    pub fn is_identity(&self) -> bool {
        (self.brightness - 1.0).abs() < 0.001
            && (self.contrast - 1.0).abs() < 0.001
            && (self.saturation - 1.0).abs() < 0.001
            && self.hue_rotate.abs() < 0.001
            && self.invert.abs() < 0.001
            && self.grayscale.abs() < 0.001
            && self.sepia.abs() < 0.001
    }

    /// Build a CSS filter string (e.g. "brightness(1.2) contrast(0.8)")
    pub fn to_css_filter(&self) -> String {
        if !self.enabled || self.is_identity() {
            return String::new();
        }
        let mut parts = Vec::new();
        if (self.brightness - 1.0).abs() >= 0.001 {
            parts.push(format!("brightness({})", self.brightness));
        }
        if (self.contrast - 1.0).abs() >= 0.001 {
            parts.push(format!("contrast({})", self.contrast));
        }
        if (self.saturation - 1.0).abs() >= 0.001 {
            parts.push(format!("saturate({})", self.saturation));
        }
        if self.hue_rotate.abs() >= 0.001 {
            parts.push(format!("hue-rotate({}deg)", self.hue_rotate));
        }
        if self.invert.abs() >= 0.001 {
            parts.push(format!("invert({})", self.invert));
        }
        if self.grayscale.abs() >= 0.001 {
            parts.push(format!("grayscale({})", self.grayscale));
        }
        if self.sepia.abs() >= 0.001 {
            parts.push(format!("sepia({})", self.sepia));
        }
        parts.join(" ")
    }
}

/// A responsive breakpoint rule: when the parent frame's width
/// is <= max_width, override layout properties.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Breakpoint {
    /// Label for UI (e.g. "Mobile", "Tablet")
    pub label: String,
    /// Maximum width at which this breakpoint activates (inclusive)
    pub max_width: f64,
    /// Override layout direction (None = keep parent's)
    #[serde(default)]
    pub direction: Option<FlexDirection>,
    /// Override layout mode (None = keep parent's)
    #[serde(default)]
    pub layout_mode: Option<LayoutMode>,
    /// Override gap (None = keep parent's)
    #[serde(default)]
    pub gap: Option<f64>,
    /// Override padding [top, right, bottom, left] (None = keep)
    #[serde(default)]
    pub padding: Option<[f64; 4]>,
    /// Override align_items
    #[serde(default)]
    pub align_items: Option<Align>,
    /// Override justify_content
    #[serde(default)]
    pub justify_content: Option<Justify>,
    /// Override wrap
    #[serde(default)]
    pub wrap: Option<FlexWrap>,
    /// Override grid_columns
    #[serde(default)]
    pub grid_columns: Option<u32>,
    /// Hide specific children by index (0-based)
    #[serde(default)]
    pub hidden_children: Vec<usize>,
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
    /// Deprecated single fill — deserialized from old JSON, not serialized.
    #[serde(default, skip_serializing)]
    pub fill: Option<Fill>,
    /// Multiple fills (rendered bottom → top). Primary storage for fills.
    #[serde(default)]
    pub fills: Vec<Fill>,
    /// Deprecated single stroke — deserialized from old JSON, not serialized.
    #[serde(default, skip_serializing)]
    pub stroke: Option<Stroke>,
    /// Multiple strokes (rendered bottom → top). Primary storage for strokes.
    #[serde(default)]
    pub strokes: Vec<Stroke>,
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
    /// Linked color style ID (shared style)
    #[serde(default)]
    pub color_style_id: Option<u64>,
    /// Linked text style ID (shared style)
    #[serde(default)]
    pub text_style_id: Option<u64>,
    /// Layout grid overlays (Figma-style, for Frame nodes)
    #[serde(default)]
    pub layout_grids: Vec<LayoutGrid>,
    /// Prototype interactions (click → navigate to frame/page)
    #[serde(default)]
    pub interactions: Vec<Interaction>,
    /// Horizontal sizing mode in parent auto layout
    #[serde(default)]
    pub sizing_h: SizingMode,
    /// Vertical sizing mode in parent auto layout
    #[serde(default)]
    pub sizing_v: SizingMode,
    /// Min/Max size constraints (None = no limit)
    #[serde(default)]
    pub min_width: Option<f64>,
    #[serde(default)]
    pub max_width: Option<f64>,
    #[serde(default)]
    pub min_height: Option<f64>,
    #[serde(default)]
    pub max_height: Option<f64>,
    /// Bookmarked for quick access
    #[serde(default)]
    pub bookmarked: bool,
    /// Conditional visibility: show/hide based on variable value
    #[serde(default)]
    pub conditional_visibility: Option<VisibilityCondition>,
    /// Overflow behavior for Frame nodes (clip children)
    #[serde(default)]
    pub overflow: Overflow,
    /// Scroll offset (x, y) for scrollable frames
    #[serde(default)]
    pub scroll_x: f64,
    #[serde(default)]
    pub scroll_y: f64,
    /// Bitmap filter effects (brightness, contrast, saturation, etc.)
    #[serde(default)]
    pub bitmap_filter: Option<BitmapFilter>,
    /// Responsive breakpoints: layout overrides based on frame width
    #[serde(default)]
    pub breakpoints: Vec<Breakpoint>,
    /// Absolute positioning: when true, this child is excluded from parent auto-layout flow
    /// but remains a child of the frame (Figma "Absolute position")
    #[serde(default)]
    pub absolute_position: bool,
    /// Text-on-path: ID of a Path node this Text follows (None = normal text)
    #[serde(default)]
    pub text_path_id: Option<NodeId>,
    /// Text-on-path offset along the path (0.0 = start, 1.0 = end)
    #[serde(default)]
    pub text_path_offset: f64,
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
            fill: None,
            fills: vec![Fill::solid(Color { r: 200, g: 200, b: 200, a: 1.0 })],
            stroke: None,
            strokes: vec![],
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
            color_style_id: None,
            text_style_id: None,
            layout_grids: vec![],
            interactions: vec![],
            sizing_h: SizingMode::default(),
            sizing_v: SizingMode::default(),
            min_width: None,
            max_width: None,
            min_height: None,
            max_height: None,
            bookmarked: false,
            conditional_visibility: None,
            overflow: Overflow::default(),
            scroll_x: 0.0,
            scroll_y: 0.0,
            bitmap_filter: None,
            breakpoints: vec![],
            absolute_position: false,
            text_path_id: None,
            text_path_offset: 0.0,
        }
    }

    /// Clamp width/height to min/max constraints
    pub fn clamp_size(&mut self) {
        if let Some(min) = self.min_width { self.width = self.width.max(min); }
        if let Some(max) = self.max_width { self.width = self.width.min(max); }
        if let Some(min) = self.min_height { self.height = self.height.max(min); }
        if let Some(max) = self.max_height { self.height = self.height.min(max); }
    }

    pub fn bounds(&self) -> BBox {
        BBox { x: self.x, y: self.y, width: self.width, height: self.height }
    }

    /// Migrate deprecated `fill` field into `fills` (call after deserialization).
    pub fn normalize_fills(&mut self) {
        if self.fills.is_empty() {
            if let Some(f) = self.fill.take() {
                self.fills.push(f);
            }
        } else {
            self.fill = None;
        }
    }

    /// Get the first fill (backward compat helper).
    pub fn first_fill(&self) -> Option<&Fill> {
        self.fills.first()
    }

    /// Get visible fills (for rendering, bottom→top order).
    pub fn visible_fills(&self) -> impl Iterator<Item = &Fill> {
        self.fills.iter().filter(|f| f.visible)
    }

    /// Check if node has any fills.
    pub fn has_fill(&self) -> bool {
        !self.fills.is_empty()
    }

    /// Migrate deprecated `stroke` field into `strokes` (call after deserialization).
    pub fn normalize_strokes(&mut self) {
        if self.strokes.is_empty() {
            if let Some(s) = self.stroke.take() {
                self.strokes.push(s);
            }
        } else {
            self.stroke = None;
        }
    }

    /// Get the first stroke (backward compat helper).
    pub fn first_stroke(&self) -> Option<&Stroke> {
        self.strokes.first()
    }

    /// Get visible strokes (for rendering, bottom→top order).
    pub fn visible_strokes(&self) -> impl Iterator<Item = &Stroke> {
        self.strokes.iter().filter(|s| s.visible)
    }

    /// Check if node has any strokes.
    pub fn has_stroke(&self) -> bool {
        !self.strokes.is_empty()
    }
}
