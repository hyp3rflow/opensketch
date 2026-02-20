use crate::types::Point;

/// 2D affine transform matrix [a, b, c, d, tx, ty]
#[derive(Clone, Copy, Debug)]
pub struct Transform {
    pub a: f64, pub b: f64,
    pub c: f64, pub d: f64,
    pub tx: f64, pub ty: f64,
}

impl Transform {
    pub fn identity() -> Self {
        Self { a: 1.0, b: 0.0, c: 0.0, d: 1.0, tx: 0.0, ty: 0.0 }
    }

    pub fn translate(x: f64, y: f64) -> Self {
        Self { a: 1.0, b: 0.0, c: 0.0, d: 1.0, tx: x, ty: y }
    }

    pub fn scale(sx: f64, sy: f64) -> Self {
        Self { a: sx, b: 0.0, c: 0.0, d: sy, tx: 0.0, ty: 0.0 }
    }

    pub fn multiply(&self, other: &Transform) -> Self {
        Self {
            a: self.a * other.a + self.b * other.c,
            b: self.a * other.b + self.b * other.d,
            c: self.c * other.a + self.d * other.c,
            d: self.c * other.b + self.d * other.d,
            tx: self.a * other.tx + self.b * other.ty + self.tx,
            ty: self.c * other.tx + self.d * other.ty + self.ty,
        }
    }

    pub fn apply(&self, p: Point) -> Point {
        Point {
            x: self.a * p.x + self.b * p.y + self.tx,
            y: self.c * p.x + self.d * p.y + self.ty,
        }
    }

    pub fn inverse(&self) -> Option<Self> {
        let det = self.a * self.d - self.b * self.c;
        if det.abs() < 1e-10 { return None; }
        let inv = 1.0 / det;
        Some(Self {
            a: self.d * inv,
            b: -self.b * inv,
            c: -self.c * inv,
            d: self.a * inv,
            tx: (self.b * self.ty - self.d * self.tx) * inv,
            ty: (self.c * self.tx - self.a * self.ty) * inv,
        })
    }
}
