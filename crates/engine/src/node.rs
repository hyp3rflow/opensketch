use crate::types::{Color, Rect as BBox};
use crate::component::InstanceData;
use serde::{Deserialize, Serialize};

pub type NodeId = u64;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum NodeKind {
    Rect,
    Ellipse,
    Text { content: String, font_size: f64, font_family: String },
    Frame,
    Group,
    /// A slot placeholder inside a component template
    Slot { slot_name: String },
    /// An instance of a component
    Instance(Box<InstanceData>),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Fill {
    pub color: Color,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Stroke {
    pub color: Color,
    pub width: f64,
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
    /// Layout properties
    #[serde(default)]
    pub layout: Layout,
    /// Attached notes (markdown documents)
    #[serde(default)]
    pub notes: Vec<Note>,
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
            fill: Some(Fill { color: Color { r: 200, g: 200, b: 200, a: 1.0 } }),
            stroke: None,
            corner_radius: 0.0,
            children: vec![],
            parent: None,
            layout: Layout::default(),
            notes: vec![],
        }
    }

    pub fn bounds(&self) -> BBox {
        BBox { x: self.x, y: self.y, width: self.width, height: self.height }
    }
}
