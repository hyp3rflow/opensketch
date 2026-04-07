use crate::types::{Color, ColorSpace, Rect as BBox};
use crate::component::InstanceData;
use crate::variable::VisibilityCondition;
use crate::vector_network::VectorNetwork;
use serde::{Deserialize, Serialize};

pub type NodeId = u64;

/// Arrow head style for connectors
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum ArrowStyle {
    None,
    Arrow,
    Diamond,
    Circle,
    Square,
    OpenArrow,
}

impl Default for ArrowStyle {
    fn default() -> Self { ArrowStyle::None }
}

impl ArrowStyle {
    pub fn from_str(s: &str) -> Self {
        match s {
            "arrow" | "Arrow" => ArrowStyle::Arrow,
            "diamond" | "Diamond" => ArrowStyle::Diamond,
            "circle" | "Circle" => ArrowStyle::Circle,
            "square" | "Square" => ArrowStyle::Square,
            "open_arrow" | "OpenArrow" | "open-arrow" => ArrowStyle::OpenArrow,
            _ => ArrowStyle::None,
        }
    }
    pub fn to_str(&self) -> &'static str {
        match self {
            ArrowStyle::None => "none",
            ArrowStyle::Arrow => "arrow",
            ArrowStyle::Diamond => "diamond",
            ArrowStyle::Circle => "circle",
            ArrowStyle::Square => "square",
            ArrowStyle::OpenArrow => "open_arrow",
        }
    }
    pub fn is_visible(&self) -> bool {
        !matches!(self, ArrowStyle::None)
    }
    /// Convert from legacy bool (backward compat)
    pub fn from_bool(v: bool) -> Self {
        if v { ArrowStyle::Arrow } else { ArrowStyle::None }
    }
}

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

/// Text transform
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum TextTransform {
    None,
    Uppercase,
    Lowercase,
    Capitalize,
}

impl Default for TextTransform {
    fn default() -> Self { TextTransform::None }
}

impl TextTransform {
    /// Apply the transform to a string
    pub fn apply(&self, s: &str) -> String {
        match self {
            TextTransform::None => s.to_string(),
            TextTransform::Uppercase => s.to_uppercase(),
            TextTransform::Lowercase => s.to_lowercase(),
            TextTransform::Capitalize => {
                s.split_whitespace()
                    .map(|word| {
                        let mut chars = word.chars();
                        match chars.next() {
                            Some(c) => {
                                let upper: String = c.to_uppercase().collect();
                                format!("{}{}", upper, chars.collect::<String>())
                            }
                            None => String::new(),
                        }
                    })
                    .collect::<Vec<_>>()
                    .join(" ")
            }
        }
    }

    pub fn to_css(&self) -> &'static str {
        match self {
            TextTransform::None => "none",
            TextTransform::Uppercase => "uppercase",
            TextTransform::Lowercase => "lowercase",
            TextTransform::Capitalize => "capitalize",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "uppercase" | "Uppercase" => TextTransform::Uppercase,
            "lowercase" | "Lowercase" => TextTransform::Lowercase,
            "capitalize" | "Capitalize" => TextTransform::Capitalize,
            _ => TextTransform::None,
        }
    }
}

/// OpenType feature settings for advanced typography
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct OpenTypeFeatures {
    #[serde(default = "default_true")]
    pub ligatures: bool,
    #[serde(default)]
    pub old_style_numerals: bool,
    #[serde(default)]
    pub small_caps: bool,
    #[serde(default)]
    pub tabular_numerals: bool,
}

fn default_true() -> bool { true }

impl Default for OpenTypeFeatures {
    fn default() -> Self {
        Self { ligatures: true, old_style_numerals: false, small_caps: false, tabular_numerals: false }
    }
}

impl OpenTypeFeatures {
    pub fn to_css(&self) -> String {
        let mut parts = Vec::new();
        if !self.ligatures { parts.push("\"liga\" 0"); }
        if self.old_style_numerals { parts.push("\"onum\" 1"); }
        if self.small_caps { parts.push("\"smcp\" 1"); }
        if self.tabular_numerals { parts.push("\"tnum\" 1"); }
        parts.join(", ")
    }

    pub fn has_any(&self) -> bool {
        !self.ligatures || self.old_style_numerals || self.small_caps || self.tabular_numerals
    }
}

/// List style for text nodes
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum ListStyle {
    None,
    Bullet,
    Numbered,
    Dash,
    Checkbox,
    CheckboxChecked,
}

impl Default for ListStyle {
    fn default() -> Self { ListStyle::None }
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
    /// Per-point stroke width override. 0.0 = inherit from node's stroke width.
    #[serde(default)]
    pub stroke_width: f64,
}

impl PathPoint {
    pub fn corner(x: f64, y: f64) -> Self {
        Self { x, y, handle_in_x: x, handle_in_y: y, handle_out_x: x, handle_out_y: y, stroke_width: 0.0 }
    }

    pub fn has_handle_in(&self) -> bool {
        (self.handle_in_x - self.x).abs() > 0.001 || (self.handle_in_y - self.y).abs() > 0.001
    }

    pub fn has_handle_out(&self) -> bool {
        (self.handle_out_x - self.x).abs() > 0.001 || (self.handle_out_y - self.y).abs() > 0.001
    }
}

/// Chart type for Chart nodes
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum ChartType {
    Bar,
    Line,
    Pie,
    Donut,
    Area,
}

impl Default for ChartType {
    fn default() -> Self { ChartType::Bar }
}

impl ChartType {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "line" => ChartType::Line,
            "pie" => ChartType::Pie,
            "donut" => ChartType::Donut,
            "area" => ChartType::Area,
            _ => ChartType::Bar,
        }
    }
    pub fn as_str(&self) -> &'static str {
        match self {
            ChartType::Bar => "bar",
            ChartType::Line => "line",
            ChartType::Pie => "pie",
            ChartType::Donut => "donut",
            ChartType::Area => "area",
        }
    }
}

/// A single data point in a chart
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChartDataPoint {
    pub label: String,
    pub value: f64,
    #[serde(default)]
    pub color: Option<String>,
}

/// Default color palette for charts
pub const CHART_PALETTE: &[&str] = &[
    "#4f46e5", "#06b6d4", "#10b981", "#f59e0b", "#ef4444",
    "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
];

/// Chart configuration
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChartConfig {
    #[serde(default)]
    pub title: String,
    #[serde(default = "default_true")]
    pub show_legend: bool,
    #[serde(default = "default_true")]
    pub show_labels: bool,
    #[serde(default)]
    pub color_palette: Vec<String>,
}

impl Default for ChartConfig {
    fn default() -> Self {
        Self {
            title: String::new(),
            show_legend: true,
            show_labels: true,
            color_palette: CHART_PALETTE.iter().map(|s| s.to_string()).collect(),
        }
    }
}

impl ChartConfig {
    /// Get color for data point index, using point color override or palette
    pub fn color_for(&self, index: usize, point_color: &Option<String>) -> String {
        if let Some(c) = point_color {
            return c.clone();
        }
        let palette = if self.color_palette.is_empty() {
            CHART_PALETTE.iter().map(|s| s.to_string()).collect::<Vec<_>>()
        } else {
            self.color_palette.clone()
        };
        palette[index % palette.len()].clone()
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
        /// List style (bullet, numbered, etc.)
        #[serde(default)]
        list_style: ListStyle,
        /// Indent level (0 = no indent)
        #[serde(default)]
        indent_level: u8,
        /// Text transform (uppercase/lowercase/capitalize)
        #[serde(default)]
        text_transform: TextTransform,
        /// Text indent for first line (pixels)
        #[serde(default)]
        text_indent: f64,
        /// OpenType feature settings
        #[serde(default)]
        opentype_features: OpenTypeFeatures,
        /// Variable font axis settings (e.g. {"wght": 400, "wdth": 100, "slnt": 0})
        #[serde(default)]
        font_variation_settings: std::collections::BTreeMap<String, f64>,
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
        /// Focal point X (0.0–1.0, default 0.5 = center)
        #[serde(default = "default_focal")]
        focal_x: f64,
        /// Focal point Y (0.0–1.0, default 0.5 = center)
        #[serde(default = "default_focal")]
        focal_y: f64,
        /// Crop rect (normalized 0.0–1.0 within source image). None = no crop.
        #[serde(default)]
        crop: Option<ImageCrop>,
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
    /// A FigJam-style sticky note with color theme
    StickyNote {
        /// Text content
        content: String,
        /// Font size
        #[serde(default = "default_sticky_font_size")]
        font_size: f64,
        /// Color theme: "yellow", "green", "blue", "pink", "orange", "purple", "gray"
        #[serde(default = "default_sticky_theme")]
        theme: String,
        /// Voting dots (user_id -> count)
        #[serde(default)]
        votes: Vec<StickyVote>,
    },
    /// A table with rows, columns, and cells
    Table {
        #[serde(default = "default_table_rows")]
        rows: u32,
        #[serde(default = "default_table_cols")]
        cols: u32,
        #[serde(default)]
        cells: Vec<TableCell>,
        #[serde(default)]
        col_widths: Vec<f64>,
        #[serde(default)]
        row_heights: Vec<f64>,
    },
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
        /// Arrow style at end
        #[serde(deserialize_with = "deserialize_arrow_style", default = "default_end_arrow")]
        end_arrow: ArrowStyle,
        /// Arrow style at start
        #[serde(deserialize_with = "deserialize_arrow_style", default)]
        start_arrow: ArrowStyle,
        /// Arrow head size multiplier (1.0 = default)
        #[serde(default = "default_arrow_size")]
        arrow_size: f64,
        /// Anchor position on start node (None = center)
        #[serde(default)]
        start_anchor: Option<crate::anchor::AnchorPosition>,
        /// Anchor position on end node (None = center)
        #[serde(default)]
        end_anchor: Option<crate::anchor::AnchorPosition>,
    },
    /// A chart visualization node (Bar, Line, Pie, Donut, Area)
    Chart {
        /// Chart type
        chart_type: ChartType,
        /// Data points
        data: Vec<ChartDataPoint>,
        /// Chart configuration
        config: ChartConfig,
    },
    /// A repeat grid — repeats the first child (master cell) in an N×M grid
    RepeatGrid {
        /// Number of columns
        columns: u32,
        /// Number of rows
        rows: u32,
        /// Horizontal gap between cells
        #[serde(default)]
        column_gap: f64,
        /// Vertical gap between cells
        #[serde(default)]
        row_gap: f64,
        /// Per-cell overrides: key = "row,col:child_path:field", value = override string
        #[serde(default)]
        overrides: std::collections::HashMap<String, String>,
    },
    /// A video embed node (rendered as thumbnail/poster in editor, plays in prototype viewer)
    Video {
        /// Video URL (mp4, webm, YouTube, etc.)
        src: String,
        /// Auto-play when entering prototype view
        #[serde(default)]
        autoplay: bool,
        /// Loop the video
        #[serde(default)]
        loop_video: bool,
        /// Mute audio
        #[serde(default = "default_true")]
        muted: bool,
        /// Poster/thumbnail image URL
        #[serde(default)]
        poster: Option<String>,
    },
    /// A callout shape — rounded rect body with a triangular tail pointing to a target
    Callout {
        /// Text content inside the callout
        content: String,
        /// Font size for the text
        #[serde(default = "default_callout_font_size")]
        font_size: f64,
        /// Tail target X position (absolute canvas coordinate)
        tail_x: f64,
        /// Tail target Y position (absolute canvas coordinate)
        tail_y: f64,
        /// Tail width at the base (where it meets the body)
        #[serde(default = "default_callout_tail_width")]
        tail_width: f64,
        /// Theme color: "blue", "yellow", "red", "green", "gray"
        #[serde(default = "default_callout_theme")]
        theme: String,
    },
}

fn default_callout_font_size() -> f64 { 14.0 }
fn default_callout_tail_width() -> f64 { 20.0 }
fn default_callout_theme() -> String { "blue".to_string() }

/// Table cell alignment
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum TableCellAlign {
    Left,
    Center,
    Right,
}

impl Default for TableCellAlign {
    fn default() -> Self { TableCellAlign::Left }
}

/// A cell in a Table node
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TableCell {
    pub row: u32,
    pub col: u32,
    #[serde(default = "default_row_span")]
    pub row_span: u32,
    #[serde(default = "default_col_span")]
    pub col_span: u32,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub fill: Option<Color>,
    #[serde(default)]
    pub text_align: TableCellAlign,
}

fn default_row_span() -> u32 { 1 }
fn default_col_span() -> u32 { 1 }

impl TableCell {
    pub fn new(row: u32, col: u32) -> Self {
        Self {
            row, col, row_span: 1, col_span: 1,
            content: String::new(), fill: None, text_align: TableCellAlign::default(),
        }
    }
}

fn default_sticky_font_size() -> f64 { 16.0 }
fn default_sticky_theme() -> String { "yellow".to_string() }

/// A vote on a sticky note
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StickyVote {
    pub user_id: String,
    pub count: u32,
}

fn default_table_rows() -> u32 { 3 }
fn default_table_cols() -> u32 { 3 }

fn default_end_arrow() -> ArrowStyle { ArrowStyle::Arrow }
fn default_arrow_size() -> f64 { 1.0 }

/// Deserialize ArrowStyle from either bool (legacy) or string/enum
fn deserialize_arrow_style<'de, D>(deserializer: D) -> Result<ArrowStyle, D::Error>
where D: serde::Deserializer<'de>
{
    use serde::de;
    struct ArrowStyleVisitor;
    impl<'de> de::Visitor<'de> for ArrowStyleVisitor {
        type Value = ArrowStyle;
        fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
            f.write_str("bool, string, or ArrowStyle enum")
        }
        fn visit_bool<E: de::Error>(self, v: bool) -> Result<ArrowStyle, E> {
            Ok(ArrowStyle::from_bool(v))
        }
        fn visit_str<E: de::Error>(self, v: &str) -> Result<ArrowStyle, E> {
            Ok(ArrowStyle::from_str(v))
        }
        fn visit_string<E: de::Error>(self, v: String) -> Result<ArrowStyle, E> {
            Ok(ArrowStyle::from_str(&v))
        }
        // Handle serde enum format (e.g. "Arrow" as a unit variant)
        fn visit_unit<E: de::Error>(self) -> Result<ArrowStyle, E> {
            Ok(ArrowStyle::None)
        }
    }
    deserializer.deserialize_any(ArrowStyleVisitor)
}

fn default_line_height() -> f64 { 1.2 }
fn default_font_weight() -> u16 { 400 }
fn default_image_fit() -> String { "cover".to_string() }
fn default_focal() -> f64 { 0.5 }

/// Crop rectangle within source image (normalized 0.0–1.0)
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct ImageCrop {
    /// Left edge (0.0–1.0)
    pub x: f64,
    /// Top edge (0.0–1.0)
    pub y: f64,
    /// Width (0.0–1.0)
    pub w: f64,
    /// Height (0.0–1.0)
    pub h: f64,
}

impl Default for ImageCrop {
    fn default() -> Self {
        Self { x: 0.0, y: 0.0, w: 1.0, h: 1.0 }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct GradientStop {
    pub offset: f64,
    pub color: Color,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum PatternType {
    Tile,
    Brick,
    Hex,
}

impl Default for PatternType {
    fn default() -> Self { PatternType::Tile }
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
    Pattern {
        /// Image URL or data URI for the pattern tile
        src: String,
        /// Scale factor (1.0 = original size)
        scale: f64,
        /// Rotation in degrees
        rotation: f64,
        /// Pattern layout type
        pattern_type: PatternType,
        /// Tile width override (0 = use image natural size)
        tile_width: f64,
        /// Tile height override (0 = use image natural size)
        tile_height: f64,
    },
    /// Perlin noise procedural fill
    NoiseFill {
        /// Scale of the noise (higher = more zoomed in)
        scale: f64,
        /// Primary color
        color1: Color,
        /// Secondary color
        color2: Color,
        /// Noise intensity/contrast (0.0–1.0)
        intensity: f64,
        /// Seed for reproducible noise
        seed: u32,
    },
    /// Regular dot pattern fill
    DotPattern {
        /// Dot radius in pixels
        dot_radius: f64,
        /// Spacing between dot centers
        spacing: f64,
        /// Dot color
        color: Color,
        /// Background color
        bg_color: Color,
        /// Rotation angle in degrees
        angle: f64,
    },
    /// Crosshatch line pattern fill
    CrosshatchFill {
        /// Line spacing in pixels
        spacing: f64,
        /// Line width in pixels
        line_width: f64,
        /// Line color
        color: Color,
        /// Background color
        bg_color: Color,
        /// Primary angle in degrees (default 45)
        angle: f64,
        /// Density: 1 = single direction, 2 = crosshatch (two directions)
        density: u8,
    },
    /// Gradient mesh fill (multi-point color interpolation on a 2D grid)
    GradientMesh {
        mesh: MeshGradient,
    },
    /// Conic (angular/sweep) gradient fill
    ConicGradient {
        /// Center X (0.0–1.0 normalized)
        center_x: f64,
        /// Center Y (0.0–1.0 normalized)
        center_y: f64,
        /// Start angle in degrees
        angle: f64,
        /// Color stops
        stops: Vec<GradientStop>,
    },
}

/// A point on a gradient mesh grid
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct MeshPoint {
    /// Normalized x position (0.0–1.0) in node-local coords
    pub x: f64,
    /// Normalized y position (0.0–1.0) in node-local coords
    pub y: f64,
    /// Color at this point (CSS hex or rgba string)
    pub color: Color,
}

/// Gradient mesh definition: a rows×cols grid of colored points
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct MeshGradient {
    pub rows: u32,
    pub cols: u32,
    pub points: Vec<MeshPoint>,
}

impl MeshGradient {
    /// Create a default 2×2 mesh with 4 corner colors
    pub fn new_default() -> Self {
        let points = vec![
            MeshPoint { x: 0.0, y: 0.0, color: Color { r: 79, g: 70, b: 229, a: 1.0, color_space: ColorSpace::default() } },   // top-left: indigo
            MeshPoint { x: 1.0, y: 0.0, color: Color { r: 16, g: 185, b: 129, a: 1.0, color_space: ColorSpace::default() } },   // top-right: emerald
            MeshPoint { x: 0.0, y: 1.0, color: Color { r: 245, g: 158, b: 11, a: 1.0, color_space: ColorSpace::default() } },   // bottom-left: amber
            MeshPoint { x: 1.0, y: 1.0, color: Color { r: 239, g: 68, b: 68, a: 1.0, color_space: ColorSpace::default() } },    // bottom-right: red
        ];
        Self { rows: 2, cols: 2, points }
    }

    /// Get point at grid position (row, col)
    pub fn get_point(&self, row: u32, col: u32) -> Option<&MeshPoint> {
        if row < self.rows && col < self.cols {
            self.points.get((row * self.cols + col) as usize)
        } else {
            None
        }
    }

    /// Get mutable point at grid position (row, col)
    pub fn get_point_mut(&mut self, row: u32, col: u32) -> Option<&mut MeshPoint> {
        if row < self.rows && col < self.cols {
            self.points.get_mut((row * self.cols + col) as usize)
        } else {
            None
        }
    }

    /// Add a row at the bottom, interpolating colors from the last row
    pub fn add_row(&mut self) {
        let new_row = self.rows;
        let t = 1.0; // new row at bottom
        for c in 0..self.cols {
            // Interpolate between first and last row
            let top = self.get_point(0, c).cloned().unwrap_or(MeshPoint { x: c as f64 / (self.cols - 1).max(1) as f64, y: 0.0, color: Color::white() });
            let bot = self.get_point(self.rows - 1, c).cloned().unwrap_or(MeshPoint { x: c as f64 / (self.cols - 1).max(1) as f64, y: 1.0, color: Color::white() });
            let new_y = 1.0; // at the bottom
            // Redistribute y coords after
            self.points.push(MeshPoint {
                x: top.x,
                y: new_y,
                color: bot.color,
            });
        }
        self.rows += 1;
        // Redistribute y positions evenly
        for r in 0..self.rows {
            let y = r as f64 / (self.rows - 1).max(1) as f64;
            for c in 0..self.cols {
                if let Some(p) = self.points.get_mut((r * self.cols + c) as usize) {
                    p.y = y;
                }
            }
        }
    }

    /// Add a column at the right, interpolating colors
    pub fn add_col(&mut self) {
        let new_cols = self.cols + 1;
        let mut new_points = Vec::with_capacity((self.rows * new_cols) as usize);
        for r in 0..self.rows {
            for c in 0..self.cols {
                new_points.push(self.points[(r * self.cols + c) as usize].clone());
            }
            // Add new column point
            let last = self.points[(r * self.cols + self.cols - 1) as usize].clone();
            new_points.push(MeshPoint {
                x: 1.0,
                y: last.y,
                color: last.color,
            });
        }
        self.points = new_points;
        self.cols = new_cols;
        // Redistribute x positions evenly
        for r in 0..self.rows {
            for c in 0..self.cols {
                let x = c as f64 / (self.cols - 1).max(1) as f64;
                if let Some(p) = self.points.get_mut((r * self.cols + c) as usize) {
                    p.x = x;
                }
            }
        }
    }

    /// Remove the last row (min 2 rows)
    pub fn remove_row(&mut self) {
        if self.rows <= 2 { return; }
        self.points.truncate(((self.rows - 1) * self.cols) as usize);
        self.rows -= 1;
        // Redistribute y
        for r in 0..self.rows {
            let y = r as f64 / (self.rows - 1).max(1) as f64;
            for c in 0..self.cols {
                if let Some(p) = self.points.get_mut((r * self.cols + c) as usize) {
                    p.y = y;
                }
            }
        }
    }

    /// Remove the last column (min 2 cols)
    pub fn remove_col(&mut self) {
        if self.cols <= 2 { return; }
        let new_cols = self.cols - 1;
        let mut new_points = Vec::new();
        for r in 0..self.rows {
            for c in 0..new_cols {
                new_points.push(self.points[(r * self.cols + c) as usize].clone());
            }
        }
        self.points = new_points;
        self.cols = new_cols;
        // Redistribute x
        for r in 0..self.rows {
            for c in 0..self.cols {
                let x = c as f64 / (self.cols - 1).max(1) as f64;
                if let Some(p) = self.points.get_mut((r * self.cols + c) as usize) {
                    p.x = x;
                }
            }
        }
    }
}

fn default_visible() -> bool { true }

/// Fill supports backward-compatible deserialization:
/// Old format: `{"color": {...}}` → Solid
/// New format: `{"fill_type": {"Solid": ...}}` or `{"fill_type": {"LinearGradient": ...}}`
#[derive(Clone, Debug, Serialize, PartialEq)]
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
            FillType::LinearGradient { stops, .. } | FillType::RadialGradient { stops, .. } | FillType::ConicGradient { stops, .. } => {
                stops.first().map(|s| s.color).unwrap_or(Color::white())
            }
            FillType::Pattern { .. } => Color::white(),
            FillType::NoiseFill { color1, .. } => *color1,
            FillType::DotPattern { color, .. } => *color,
            FillType::CrosshatchFill { color, .. } => *color,
            FillType::GradientMesh { ref mesh } => {
                mesh.points.first().map(|p| p.color).unwrap_or(Color::white())
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

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
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
    /// Individual stroke sides — when Some, only the specified sides are stroked.
    /// Applies only to Rect/Frame/Section nodes. None = all sides.
    #[serde(default)]
    pub individual_sides: Option<StrokeSides>,
}

/// Which sides of a rectangle to stroke individually.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct StrokeSides {
    #[serde(default = "default_visible")]
    pub top: bool,
    #[serde(default = "default_visible")]
    pub right: bool,
    #[serde(default = "default_visible")]
    pub bottom: bool,
    #[serde(default = "default_visible")]
    pub left: bool,
}

impl Default for StrokeSides {
    fn default() -> Self {
        StrokeSides { top: true, right: true, bottom: true, left: true }
    }
}

impl StrokeSides {
    pub fn all() -> Self { Self { top: true, right: true, bottom: true, left: true } }
    pub fn is_all(&self) -> bool { self.top && self.right && self.bottom && self.left }
    pub fn is_none(&self) -> bool { !self.top && !self.right && !self.bottom && !self.left }
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
            individual_sides: None,
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
    Baseline,
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

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum AlignContent {
    Stretch,
    FlexStart,
    FlexEnd,
    Center,
    SpaceBetween,
    SpaceAround,
}

impl Default for AlignContent {
    fn default() -> Self { AlignContent::Stretch }
}

/// Overflow behavior for container nodes
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum Overflow {
    Visible,
    Hidden,
    Scroll,
    ScrollHorizontal,
    ScrollVertical,
}

impl Default for Overflow {
    fn default() -> Self { Overflow::Visible }
}

impl Overflow {
    pub fn clips(&self) -> bool {
        *self != Overflow::Visible
    }
    pub fn scrolls(&self) -> bool {
        matches!(self, Overflow::Scroll | Overflow::ScrollHorizontal | Overflow::ScrollVertical)
    }
    pub fn scrolls_x(&self) -> bool {
        matches!(self, Overflow::Scroll | Overflow::ScrollHorizontal)
    }
    pub fn scrolls_y(&self) -> bool {
        matches!(self, Overflow::Scroll | Overflow::ScrollVertical)
    }
}

/// Scroll snap type for scrollable containers (CSS scroll-snap-type)
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum ScrollSnapType {
    None,
    MandatoryX,
    MandatoryY,
    MandatoryBoth,
    ProximityX,
    ProximityY,
    ProximityBoth,
}

impl Default for ScrollSnapType {
    fn default() -> Self { ScrollSnapType::None }
}

/// Scroll snap alignment for children of scrollable containers (CSS scroll-snap-align)
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum ScrollSnapAlign {
    None,
    Start,
    Center,
    End,
}

impl Default for ScrollSnapAlign {
    fn default() -> Self { ScrollSnapAlign::None }
}

/// Scroll-driven animation: animates a node property based on parent scroll position.
/// When the parent frame's scroll offset is between `start_scroll` and `end_scroll`,
/// the target property interpolates from `from_value` to `to_value`.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct ScrollAnimation {
    /// Property to animate
    pub property: ScrollAnimProperty,
    /// Scroll offset (px) where animation begins
    pub start_scroll: f64,
    /// Scroll offset (px) where animation ends
    pub end_scroll: f64,
    /// Property value at start_scroll
    pub from_value: f64,
    /// Property value at end_scroll
    pub to_value: f64,
    /// Easing function
    #[serde(default)]
    pub easing: ScrollAnimEasing,
    /// Whether this node should stick (position: sticky) within the scroll range
    #[serde(default)]
    pub sticky: bool,
    /// Sticky top offset (px from parent top when stuck)
    #[serde(default)]
    pub sticky_offset: f64,
    /// Parallax speed factor (1.0 = normal, 0.5 = half speed, 2.0 = double)
    #[serde(default = "default_parallax_factor")]
    pub parallax_factor: f64,
    /// Enabled toggle
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_parallax_factor() -> f64 { 1.0 }

/// Properties that can be scroll-animated
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum ScrollAnimProperty {
    Opacity,
    X,
    Y,
    Scale,
    Rotation,
    Blur,
}

impl Default for ScrollAnimProperty {
    fn default() -> Self { ScrollAnimProperty::Opacity }
}

impl ScrollAnimProperty {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "opacity" => Some(Self::Opacity),
            "x" => Some(Self::X),
            "y" => Some(Self::Y),
            "scale" => Some(Self::Scale),
            "rotation" => Some(Self::Rotation),
            "blur" => Some(Self::Blur),
            _ => None,
        }
    }
    pub fn as_str(&self) -> &str {
        match self {
            Self::Opacity => "opacity",
            Self::X => "x",
            Self::Y => "y",
            Self::Scale => "scale",
            Self::Rotation => "rotation",
            Self::Blur => "blur",
        }
    }
}

/// Easing for scroll animations
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum ScrollAnimEasing {
    Linear,
    EaseIn,
    EaseOut,
    EaseInOut,
}

impl Default for ScrollAnimEasing {
    fn default() -> Self { ScrollAnimEasing::Linear }
}

impl ScrollAnimEasing {
    pub fn evaluate(&self, t: f64) -> f64 {
        let t = t.clamp(0.0, 1.0);
        match self {
            Self::Linear => t,
            Self::EaseIn => t * t * t,
            Self::EaseOut => 1.0 - (1.0 - t).powi(3),
            Self::EaseInOut => {
                if t < 0.5 { 4.0 * t * t * t }
                else { 1.0 - (-2.0 * t + 2.0).powi(3) / 2.0 }
            }
        }
    }
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "linear" => Some(Self::Linear),
            "ease_in" => Some(Self::EaseIn),
            "ease_out" => Some(Self::EaseOut),
            "ease_in_out" => Some(Self::EaseInOut),
            _ => None,
        }
    }
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

/// Text overflow behavior when content exceeds node bounds
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum TextOverflow {
    Visible,
    Clip,
    Ellipsis,
}

impl Default for TextOverflow {
    fn default() -> Self { TextOverflow::Visible }
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
    #[serde(default)]
    pub align_content: AlignContent,
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
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Shadow {
    pub color: Color,
    pub offset_x: f64,
    pub offset_y: f64,
    pub blur: f64,
    pub spread: f64,
    pub visible: bool,
    /// When true, renders as inner (inset) shadow
    #[serde(default)]
    pub inset: bool,
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
            color: Color { r: 255, g: 0, b: 0, a: 0.1, color_space: ColorSpace::default() },
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
    OnSwipeLeft,
    OnSwipeRight,
    OnSwipeUp,
    OnSwipeDown,
    OnLongPress,
    OnPinchIn,
    OnPinchOut,
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
    SwapVariant,
    /// Set a prototype variable value
    SetVariable,
}

/// Comparison operators for prototype conditions
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum ConditionOperator {
    Equal,
    NotEqual,
    GreaterThan,
    LessThan,
    GreaterThanOrEqual,
    LessThanOrEqual,
}

impl Default for ConditionOperator {
    fn default() -> Self { ConditionOperator::Equal }
}

impl ConditionOperator {
    pub fn from_str(s: &str) -> Self {
        match s {
            "==" | "eq" => ConditionOperator::Equal,
            "!=" | "ne" => ConditionOperator::NotEqual,
            ">" | "gt" => ConditionOperator::GreaterThan,
            "<" | "lt" => ConditionOperator::LessThan,
            ">=" | "gte" => ConditionOperator::GreaterThanOrEqual,
            "<=" | "lte" => ConditionOperator::LessThanOrEqual,
            _ => ConditionOperator::Equal,
        }
    }

    pub fn to_str(&self) -> &'static str {
        match self {
            ConditionOperator::Equal => "==",
            ConditionOperator::NotEqual => "!=",
            ConditionOperator::GreaterThan => ">",
            ConditionOperator::LessThan => "<",
            ConditionOperator::GreaterThanOrEqual => ">=",
            ConditionOperator::LessThanOrEqual => "<=",
        }
    }

    /// Evaluate the condition: compare left vs right as numbers if possible, else string comparison
    pub fn evaluate(&self, left: &str, right: &str) -> bool {
        // Try numeric comparison first
        if let (Ok(l), Ok(r)) = (left.parse::<f64>(), right.parse::<f64>()) {
            return match self {
                ConditionOperator::Equal => (l - r).abs() < f64::EPSILON,
                ConditionOperator::NotEqual => (l - r).abs() >= f64::EPSILON,
                ConditionOperator::GreaterThan => l > r,
                ConditionOperator::LessThan => l < r,
                ConditionOperator::GreaterThanOrEqual => l >= r,
                ConditionOperator::LessThanOrEqual => l <= r,
            };
        }
        // Boolean: "true"/"false"
        if let (Ok(l), Ok(r)) = (left.parse::<bool>(), right.parse::<bool>()) {
            return match self {
                ConditionOperator::Equal => l == r,
                ConditionOperator::NotEqual => l != r,
                _ => false,
            };
        }
        // String comparison
        match self {
            ConditionOperator::Equal => left == right,
            ConditionOperator::NotEqual => left != right,
            ConditionOperator::GreaterThan => left > right,
            ConditionOperator::LessThan => left < right,
            ConditionOperator::GreaterThanOrEqual => left >= right,
            ConditionOperator::LessThanOrEqual => left <= right,
        }
    }
}

/// Condition for conditional interactions
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct InteractionCondition {
    /// Variable name to check
    pub variable: String,
    /// Comparison operator
    pub operator: ConditionOperator,
    /// Value to compare against
    pub value: String,
}

/// Prototype variable definition (stored at scene level)
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct PrototypeVariable {
    pub name: String,
    /// "number" | "string" | "boolean"
    pub var_type: String,
    pub default_value: String,
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

/// Resource link type (external dev resources)
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum ResourceLinkType {
    GitHub,
    Storybook,
    Jira,
    Figma,
    Custom,
}

impl Default for ResourceLinkType {
    fn default() -> Self { ResourceLinkType::Custom }
}

impl ResourceLinkType {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "github" => ResourceLinkType::GitHub,
            "storybook" => ResourceLinkType::Storybook,
            "jira" => ResourceLinkType::Jira,
            "figma" => ResourceLinkType::Figma,
            _ => ResourceLinkType::Custom,
        }
    }
    pub fn as_str(&self) -> &'static str {
        match self {
            ResourceLinkType::GitHub => "GitHub",
            ResourceLinkType::Storybook => "Storybook",
            ResourceLinkType::Jira => "Jira",
            ResourceLinkType::Figma => "Figma",
            ResourceLinkType::Custom => "Custom",
        }
    }
}

/// An external resource link attached to a node (GitHub issue, Storybook URL, Jira ticket, etc.)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ResourceLink {
    pub url: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub link_type: ResourceLinkType,
}

/// Link type for node references
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum LinkType {
    Reference,
    DependsOn,
    Related,
}

impl Default for LinkType {
    fn default() -> Self { LinkType::Reference }
}

impl LinkType {
    pub fn from_str(s: &str) -> Self {
        match s {
            "DependsOn" | "depends_on" => LinkType::DependsOn,
            "Related" | "related" => LinkType::Related,
            _ => LinkType::Reference,
        }
    }
    pub fn as_str(&self) -> &'static str {
        match self {
            LinkType::Reference => "Reference",
            LinkType::DependsOn => "DependsOn",
            LinkType::Related => "Related",
        }
    }
}

/// A link/reference from this node to another node
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NodeLink {
    pub target_id: NodeId,
    pub link_type: LinkType,
    #[serde(default)]
    pub label: String,
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
    /// Easing curve for transition: "linear"|"ease_in"|"ease_out"|"ease_in_out"|"cubic_bezier:x1,y1,x2,y2"
    #[serde(default = "default_easing_str")]
    pub easing: String,
    /// For SwapVariant action: JSON variant key (e.g. {"State":"Hover","Disabled":"false"})
    #[serde(default)]
    pub variant_key_json: String,
    /// Optional condition — interaction only fires when condition is met
    #[serde(default)]
    pub condition: Option<InteractionCondition>,
    /// For SetVariable action: variable name to set
    #[serde(default)]
    pub set_variable_name: String,
    /// For SetVariable action: expression to evaluate (literal value, or "+1"/"-1" for increment/decrement)
    #[serde(default)]
    pub set_variable_expression: String,
    /// Smart Animate timeline keyframes JSON (MVP): [{"time":0,"label":"Start","easing":"..."}, ...]
    #[serde(default)]
    pub smart_animate_timeline_json: String,
}

fn default_easing_str() -> String { "ease_in_out".to_string() }

impl Default for Interaction {
    fn default() -> Self {
        Self {
            trigger: InteractionTrigger::OnClick,
            action: InteractionAction::NavigateTo,
            target_node_id: 0,
            target_page_id: 0,
            transition: TransitionType::Instant,
            transition_duration_ms: 300,
            easing: "ease_in_out".to_string(),
            variant_key_json: String::new(),
            condition: None,
            set_variable_name: String::new(),
            set_variable_expression: String::new(),
            smart_animate_timeline_json: String::new(),
        }
    }
}

/// A reaction on a comment (emoji + users who reacted)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Reaction {
    pub emoji: String,
    pub users: Vec<String>,
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
    /// Assignee (user who should act on this comment)
    #[serde(default)]
    pub assignee: Option<String>,
    /// Extracted @mentions from text and replies
    #[serde(default)]
    pub mentions: Vec<String>,
    /// Emoji reactions on this comment
    #[serde(default)]
    pub reactions: Vec<Reaction>,
}

impl Comment {
    /// Extract all unique @mentions from the comment text and all replies
    pub fn extract_mentions(&mut self) {
        let mut all = parse_mentions(&self.text);
        for r in &self.replies {
            all.extend(parse_mentions(&r.text));
        }
        all.sort();
        all.dedup();
        self.mentions = all;
    }
}

/// Parse @username mentions from text. Usernames: alphanumeric, underscore, hyphen, dot.
pub fn parse_mentions(text: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut chars = text.char_indices().peekable();
    while let Some((i, ch)) = chars.next() {
        if ch == '@' && (i == 0 || !text[..i].ends_with(|c: char| c.is_alphanumeric())) {
            let start = i + 1;
            let mut end = start;
            while let Some(&(j, c)) = chars.peek() {
                if c.is_alphanumeric() || c == '_' || c == '-' || c == '.' {
                    end = j + c.len_utf8();
                    chars.next();
                } else {
                    break;
                }
            }
            if end > start {
                result.push(text[start..end].to_string());
            }
        }
    }
    result
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

/// 3D perspective transform
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Perspective3D {
    pub rotate_x: f64,
    pub rotate_y: f64,
    pub rotate_z: f64,
    pub perspective: f64,
    pub origin_x: f64,
    pub origin_y: f64,
}

impl Default for Perspective3D {
    fn default() -> Self {
        Self {
            rotate_x: 0.0,
            rotate_y: 0.0,
            rotate_z: 0.0,
            perspective: 800.0,
            origin_x: 0.5,
            origin_y: 0.5,
        }
    }
}

/// 4-point corner pin distortion (normalized to node bounds)
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct CornerPin {
    pub tl_x: f64,
    pub tl_y: f64,
    pub tr_x: f64,
    pub tr_y: f64,
    pub br_x: f64,
    pub br_y: f64,
    pub bl_x: f64,
    pub bl_y: f64,
}

impl Default for CornerPin {
    fn default() -> Self {
        Self {
            tl_x: 0.0,
            tl_y: 0.0,
            tr_x: 1.0,
            tr_y: 0.0,
            br_x: 1.0,
            br_y: 1.0,
            bl_x: 0.0,
            bl_y: 1.0,
        }
    }
}

// =============================================
// Design-to-code component mapping
// =============================================

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum CodeFramework {
    React,
    Vue,
    SwiftUI,
    Compose,
    Flutter,
}

impl Default for CodeFramework {
    fn default() -> Self { Self::React }
}

impl CodeFramework {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "react" => Some(Self::React),
            "vue" => Some(Self::Vue),
            "swiftui" => Some(Self::SwiftUI),
            "compose" => Some(Self::Compose),
            "flutter" => Some(Self::Flutter),
            _ => None,
        }
    }
    pub fn as_str(&self) -> &str {
        match self {
            Self::React => "react",
            Self::Vue => "vue",
            Self::SwiftUI => "swiftui",
            Self::Compose => "compose",
            Self::Flutter => "flutter",
        }
    }
}

/// A single prop binding: design property → component prop
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PropBinding {
    pub prop_name: String,
    pub prop_type: String,       // "string" | "number" | "boolean" | "color" | "enum"
    pub default_value: String,
    pub design_source: String,   // which design property this maps from, e.g. "fill.0.color", "text.content", "opacity"
}

/// Maps a design node to a code component
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct CodeMapping {
    pub component_name: String,
    pub framework: CodeFramework,
    pub import_path: String,     // e.g. "@/components/Button"
    pub props: Vec<PropBinding>,
    pub children_slot: bool,     // whether children map to component children/slot
}

/// Attached note (markdown)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Note {
    pub content: String,
    pub tags: Vec<String>,
    pub updated_at: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CornerRadii {
    pub top_left: f64,
    pub top_right: f64,
    pub bottom_right: f64,
    pub bottom_left: f64,
}

impl CornerRadii {
    pub fn uniform(v: f64) -> Self {
        Self { top_left: v, top_right: v, bottom_right: v, bottom_left: v }
    }
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
    /// Per-corner radii override. None = use uniform `corner_radius`.
    #[serde(default)]
    pub corner_radii: Option<CornerRadii>,
    /// Corner smoothing (0.0 = circular arc, 1.0 = full squircle / iOS style)
    #[serde(default)]
    pub corner_smoothing: f64,
    pub children: Vec<NodeId>,
    pub parent: Option<NodeId>,
    /// Text sizing mode (Fit = auto-size to content, Fixed = manual)
    #[serde(default)]
    pub text_sizing: TextSizing,
    /// Text overflow behavior (Visible/Clip/Ellipsis)
    #[serde(default)]
    pub text_overflow: TextOverflow,
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
    /// Backdrop blur: blurs content behind this node (frosted glass effect)
    #[serde(default)]
    pub backdrop_blur: f64,
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
    /// Scroll snap type for scrollable container frames
    #[serde(default)]
    pub scroll_snap_type: ScrollSnapType,
    /// Scroll snap alignment for child nodes in scrollable containers
    #[serde(default)]
    pub scroll_snap_align: ScrollSnapAlign,
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
    /// Auto-layout wrap break: when true and parent wrap is enabled, force this child to start a new line/column.
    #[serde(default)]
    pub wrap_before: bool,
    /// Text-on-path: ID of a Path node this Text follows (None = normal text)
    #[serde(default)]
    pub text_path_id: Option<NodeId>,
    /// Text-on-path offset along the path (0.0 = start, 1.0 = end)
    #[serde(default)]
    pub text_path_offset: f64,
    /// Text-on-path baseline offset in px (+ moves away from path normal)
    #[serde(default)]
    pub text_path_baseline_offset: f64,
    /// Text-on-path direction flip
    #[serde(default)]
    pub text_path_flip: bool,
    /// 3D perspective transform
    #[serde(default)]
    pub perspective: Option<Perspective3D>,
    /// 4-point corner pin distortion (normalized to node bounds)
    #[serde(default)]
    pub corner_pin: Option<CornerPin>,
    /// Design-to-code component mapping
    #[serde(default)]
    pub code_mapping: Option<CodeMapping>,
    /// Per-frame background pattern override (None = inherit scene-level)
    #[serde(default)]
    pub background_pattern: Option<FrameBackgroundPattern>,
    /// Links/references to other nodes
    #[serde(default)]
    pub links: Vec<NodeLink>,
    /// Text flow: ID of next text node in flow chain (None = no flow)
    #[serde(default)]
    pub text_flow_next: Option<NodeId>,
    /// External resource links (GitHub, Storybook, Jira, etc.)
    #[serde(default)]
    pub resource_links: Vec<ResourceLink>,
    /// Scroll-driven animations (animate properties based on parent frame scroll position)
    #[serde(default)]
    pub scroll_animations: Vec<ScrollAnimation>,
    /// Keep node fixed in Prototype viewer when parent scrolls (header/footer style)
    #[serde(default)]
    pub prototype_fixed: bool,
    /// Fixed region in prototype when `prototype_fixed` is true: "auto" | "top" | "bottom"
    #[serde(default = "default_prototype_fixed_region")]
    pub prototype_fixed_region: String,
    /// Per-axis bounce enable for prototype scroll containers (Frame/Section)
    #[serde(default = "default_true")]
    pub prototype_scroll_bounce_x: bool,
    #[serde(default = "default_true")]
    pub prototype_scroll_bounce_y: bool,
    /// Per-axis overscroll amount in px for prototype viewer.
    /// -1 means "auto" (use selected physics preset default)
    #[serde(default = "default_proto_overscroll")]
    pub prototype_scroll_overscroll_x: f64,
    #[serde(default = "default_proto_overscroll")]
    pub prototype_scroll_overscroll_y: f64,
    /// Alt text for Image nodes (accessibility / screen readers)
    #[serde(default)]
    pub alt_text: Option<String>,
    /// Custom anchor points (in addition to the default Top/Right/Bottom/Left)
    #[serde(default)]
    pub anchors: Vec<crate::anchor::AnchorPoint>,
    /// Hyperlink: external URL or internal page link (e.g. "https://..." or "page:PAGE_ID")
    #[serde(default)]
    pub hyperlink: Option<String>,
    /// Clip content: when true, children outside this frame/section bounds are clipped.
    /// Defaults to true for Figma compatibility.
    #[serde(default = "default_true")]
    pub clip_content: bool,
    /// Section collapsed state (children hidden when true)
    #[serde(default)]
    pub section_collapsed: bool,
    /// Section title color override (None = default rgba(255,255,255,0.7))
    #[serde(default)]
    pub section_title_color: Option<String>,
    /// Section title font size override (None = default 14)
    #[serde(default)]
    pub section_title_font_size: Option<f64>,
}

/// Per-frame background pattern configuration
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct FrameBackgroundPattern {
    /// Pattern type: "none", "grid", "dots", "lines", "cross"
    #[serde(default = "default_frame_bg_pattern")]
    pub pattern: String,
    /// Pattern color hex (without #)
    #[serde(default = "default_frame_bg_color")]
    pub color: String,
    /// Spacing in pixels
    #[serde(default = "default_frame_bg_spacing")]
    pub spacing: f64,
    /// Opacity 0.0-1.0
    #[serde(default = "default_frame_bg_opacity")]
    pub opacity: f64,
    /// Dot/line size
    #[serde(default = "default_frame_bg_size")]
    pub size: f64,
    /// Visible toggle
    #[serde(default = "default_true")]
    pub visible: bool,
}

fn default_frame_bg_pattern() -> String { "dots".to_string() }
fn default_frame_bg_color() -> String { "ffffff".to_string() }
fn default_frame_bg_spacing() -> f64 { 20.0 }
fn default_frame_bg_opacity() -> f64 { 0.15 }
fn default_frame_bg_size() -> f64 { 1.5 }
fn default_prototype_fixed_region() -> String { "auto".to_string() }
fn default_proto_overscroll() -> f64 { -1.0 }

impl Node {
    pub fn kind_name(&self) -> &str {
        match &self.kind {
            NodeKind::Rect => "Rect",
            NodeKind::Ellipse => "Ellipse",
            NodeKind::Text { .. } => "Text",
            NodeKind::Frame => "Frame",
            NodeKind::Group => "Group",
            NodeKind::Slot { .. } => "Slot",
            NodeKind::Instance { .. } => "Instance",
            NodeKind::Image { .. } => "Image",
            NodeKind::Star { .. } => "Star",
            NodeKind::Polygon { .. } => "Polygon",
            NodeKind::Path { .. } => "Path",
            NodeKind::Section => "Section",
            NodeKind::Slice => "Slice",
            NodeKind::StickyNote { .. } => "StickyNote",
            NodeKind::Table { .. } => "Table",
            NodeKind::Connector { .. } => "Connector",
            NodeKind::VectorNetwork { .. } => "VectorNetwork",
            NodeKind::Chart { .. } => "Chart",
            NodeKind::RepeatGrid { .. } => "RepeatGrid",
            NodeKind::Callout { .. } => "Callout",
            NodeKind::Video { .. } => "Video",
        }
    }

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
            fills: vec![Fill::solid(Color { r: 200, g: 200, b: 200, a: 1.0, color_space: ColorSpace::default() })],
            stroke: None,
            strokes: vec![],
            corner_radius: 0.0,
            corner_radii: None,
            corner_smoothing: 0.0,
            children: vec![],
            parent: None,
            text_sizing: TextSizing::default(),
            text_overflow: TextOverflow::default(),
            layout: Layout::default(),
            notes: vec![],
            shadows: vec![],
            blur: 0.0,
            backdrop_blur: 0.0,
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
            scroll_snap_type: ScrollSnapType::None,
            scroll_snap_align: ScrollSnapAlign::None,
            bitmap_filter: None,
            breakpoints: vec![],
            absolute_position: false,
            wrap_before: false,
            text_path_id: None,
            text_path_offset: 0.0,
            text_path_baseline_offset: 0.0,
            text_path_flip: false,
            perspective: None,
            corner_pin: None,
            code_mapping: None,
            background_pattern: None,
            links: vec![],
            text_flow_next: None,
            resource_links: vec![],
            scroll_animations: vec![],
            prototype_fixed: false,
            prototype_fixed_region: default_prototype_fixed_region(),
            prototype_scroll_bounce_x: true,
            prototype_scroll_bounce_y: true,
            prototype_scroll_overscroll_x: default_proto_overscroll(),
            prototype_scroll_overscroll_y: default_proto_overscroll(),
            alt_text: None,
            anchors: vec![],
            hyperlink: None,
            clip_content: true,
            section_collapsed: false,
            section_title_color: None,
            section_title_font_size: None,
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

    /// Compute a render complexity score for this node (higher = more expensive to render).
    /// Score factors: fills, strokes, shadows, blur, gradients, blend modes, path points, children, etc.
    pub fn render_complexity(&self) -> u32 {
        let mut score: u32 = 1; // base cost

        // Fill cost
        for f in &self.fills {
            if !f.visible { continue; }
            score += match &f.fill_type {
                FillType::Solid { .. } => 1,
                FillType::LinearGradient { .. } | FillType::RadialGradient { .. } | FillType::ConicGradient { .. } => 3,
                FillType::Pattern { .. } => 4,
                _ => 3, // NoiseFill, DotPattern, etc.
            };
        }

        // Stroke cost
        for s in &self.strokes {
            if !s.visible { continue; }
            score += 2;
            if !s.dash_array.is_empty() { score += 1; } // dashed = extra
        }

        // Shadow cost (each shadow = separate draw pass)
        for sh in &self.shadows {
            if sh.visible { score += 4; }
        }

        // Blur cost (filter operation)
        if self.blur > 0.0 { score += 5; }

        // Blend mode cost
        if self.blend_mode != BlendMode::Normal { score += 2; }

        // Rotation cost (transform)
        if self.rotation != 0.0 { score += 1; }

        // Opacity cost (transparency compositing)
        if self.opacity < 1.0 && self.opacity > 0.0 { score += 1; }

        // Bitmap filter cost
        if self.bitmap_filter.is_some() { score += 3; }

        // Mask cost
        if self.is_mask { score += 3; }

        // Kind-specific costs
        match &self.kind {
            NodeKind::Text { .. } => { score += 3; } // text measurement + rendering
            NodeKind::Path { points, .. } => { score += (points.len() as u32).min(20); }
            NodeKind::VectorNetwork(ref vn) => {
                score += (vn.vertices.len() as u32 / 2).min(15);
            }
            NodeKind::Star { points, .. } => { score += *points; }
            NodeKind::Polygon { sides, .. } => { score += *sides; }
            NodeKind::Image { .. } => { score += 4; } // image decode + draw
            NodeKind::Table { rows, cols, .. } => { score += rows * cols; }
            NodeKind::Chart { ref data, .. } => { score += data.len() as u32 + 3; }
            NodeKind::RepeatGrid { columns, rows, .. } => { score += columns * rows * 2; }
            _ => {}
        }

        // Perspective 3D
        if self.perspective.is_some() { score += 5; }

        // Children count (container overhead)
        score += self.children.len() as u32;

        score
    }
}
