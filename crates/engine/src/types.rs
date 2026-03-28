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

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
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

    /// Convert RGB to HSL (h: 0-360, s: 0-1, l: 0-1)
    pub fn to_hsl(&self) -> (f64, f64, f64) {
        let r = self.r as f64 / 255.0;
        let g = self.g as f64 / 255.0;
        let b = self.b as f64 / 255.0;
        let max = r.max(g).max(b);
        let min = r.min(g).min(b);
        let l = (max + min) / 2.0;
        if (max - min).abs() < 1e-10 {
            return (0.0, 0.0, l);
        }
        let d = max - min;
        let s = if l > 0.5 { d / (2.0 - max - min) } else { d / (max + min) };
        let h = if (max - r).abs() < 1e-10 {
            let mut h = (g - b) / d;
            if g < b { h += 6.0; }
            h
        } else if (max - g).abs() < 1e-10 {
            (b - r) / d + 2.0
        } else {
            (r - g) / d + 4.0
        };
        (h * 60.0, s, l)
    }

    /// Create Color from HSL (h: 0-360, s: 0-1, l: 0-1) preserving alpha
    pub fn from_hsl(h: f64, s: f64, l: f64, a: f64) -> Self {
        if s.abs() < 1e-10 {
            let v = (l * 255.0).round() as u8;
            return Self { r: v, g: v, b: v, a };
        }
        let hue_to_rgb = |p: f64, q: f64, mut t: f64| -> f64 {
            if t < 0.0 { t += 1.0; }
            if t > 1.0 { t -= 1.0; }
            if t < 1.0 / 6.0 { return p + (q - p) * 6.0 * t; }
            if t < 1.0 / 2.0 { return q; }
            if t < 2.0 / 3.0 { return p + (q - p) * (2.0 / 3.0 - t) * 6.0; }
            p
        };
        let q = if l < 0.5 { l * (1.0 + s) } else { l + s - l * s };
        let p = 2.0 * l - q;
        let h_norm = h / 360.0;
        Self {
            r: (hue_to_rgb(p, q, h_norm + 1.0 / 3.0) * 255.0).round() as u8,
            g: (hue_to_rgb(p, q, h_norm) * 255.0).round() as u8,
            b: (hue_to_rgb(p, q, h_norm - 1.0 / 3.0) * 255.0).round() as u8,
            a,
        }
    }

    /// Invert lightness for dark mode conversion.
    /// Light colors become dark, dark colors become light.
    /// Preserves hue and adjusts saturation slightly for dark backgrounds.
    pub fn to_dark_mode(&self) -> Self {
        let (h, s, l) = self.to_hsl();
        // Invert lightness: new_l = 1 - l, then compress to avoid pure black/white
        let new_l = 1.0 - l;
        // Clamp to 0.06..0.94 to avoid harsh extremes
        let new_l = new_l.max(0.06).min(0.94);
        // Slightly boost saturation for dark backgrounds (colors pop more on dark)
        let new_s = (s * 1.1).min(1.0);
        Self::from_hsl(h, new_s, new_l, self.a)
    }
}
