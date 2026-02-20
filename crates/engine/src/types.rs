use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct Size {
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Rect {
    pub fn contains(&self, p: Point) -> bool {
        p.x >= self.x && p.x <= self.x + self.width
            && p.y >= self.y && p.y <= self.y + self.height
    }

    pub fn from_two_points(a: Point, b: Point) -> Self {
        let x = a.x.min(b.x);
        let y = a.y.min(b.y);
        Self {
            x, y,
            width: (a.x - b.x).abs(),
            height: (a.y - b.y).abs(),
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct Color {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: f64,
}

impl Color {
    pub fn to_css(&self) -> String {
        format!("rgba({},{},{},{})", self.r, self.g, self.b, self.a)
    }

    pub fn white() -> Self { Self { r: 255, g: 255, b: 255, a: 1.0 } }
    pub fn black() -> Self { Self { r: 0, g: 0, b: 0, a: 1.0 } }
    pub fn transparent() -> Self { Self { r: 0, g: 0, b: 0, a: 0.0 } }
    pub fn blue() -> Self { Self { r: 59, g: 130, b: 246, a: 1.0 } }
}
