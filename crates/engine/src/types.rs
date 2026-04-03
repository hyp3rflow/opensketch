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

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Default)]
pub enum ColorSpace {
    #[default]
    SRGB,
    DisplayP3,
    OKLab,
    OKLCH,
}

impl ColorSpace {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "display-p3" | "displayp3" | "p3" => ColorSpace::DisplayP3,
            "oklab" => ColorSpace::OKLab,
            "oklch" => ColorSpace::OKLCH,
            _ => ColorSpace::SRGB,
        }
    }
    pub fn as_str(&self) -> &'static str {
        match self {
            ColorSpace::SRGB => "sRGB",
            ColorSpace::DisplayP3 => "Display P3",
            ColorSpace::OKLab => "OKLab",
            ColorSpace::OKLCH => "OKLCH",
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
pub struct Color {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: f64,
    #[serde(default)]
    pub color_space: ColorSpace,
}

impl Color {
    pub fn to_css(&self) -> String {
        format!("rgba({},{},{},{})", self.r, self.g, self.b, self.a)
    }

    /// CSS output respecting color_space. Modern CSS color() / oklab() / oklch() syntax.
    pub fn to_css_modern(&self) -> String {
        match self.color_space {
            ColorSpace::SRGB => self.to_css(),
            ColorSpace::DisplayP3 => {
                let (pr, pg, pb) = Self::srgb_to_p3(self.r as f64 / 255.0, self.g as f64 / 255.0, self.b as f64 / 255.0);
                format!("color(display-p3 {:.4} {:.4} {:.4} / {})", pr, pg, pb, self.a)
            }
            ColorSpace::OKLab => {
                let (l, a_val, b_val) = Self::srgb_to_oklab(self.r as f64 / 255.0, self.g as f64 / 255.0, self.b as f64 / 255.0);
                format!("oklab({:.4} {:.4} {:.4} / {})", l, a_val, b_val, self.a)
            }
            ColorSpace::OKLCH => {
                let (l, a_val, b_val) = Self::srgb_to_oklab(self.r as f64 / 255.0, self.g as f64 / 255.0, self.b as f64 / 255.0);
                let c = (a_val * a_val + b_val * b_val).sqrt();
                let h = b_val.atan2(a_val).to_degrees();
                let h = if h < 0.0 { h + 360.0 } else { h };
                format!("oklch({:.4} {:.4} {:.1} / {})", l, c, h, self.a)
            }
        }
    }

    /// Always returns rgba() for sRGB fallback
    pub fn to_srgb_fallback(&self) -> String {
        self.to_css()
    }

    /// sRGB linear → Display P3 linear (approximate via chromatic adaptation)
    pub fn srgb_to_p3(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
        // sRGB to linear
        let to_lin = |v: f64| -> f64 { if v <= 0.04045 { v / 12.92 } else { ((v + 0.055) / 1.055).powf(2.4) } };
        let lr = to_lin(r); let lg = to_lin(g); let lb = to_lin(b);
        // sRGB linear → XYZ D65
        let x = 0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb;
        let y = 0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb;
        let z = 0.0193339 * lr + 0.1191920 * lg + 0.9503041 * lb;
        // XYZ D65 → Display P3 linear
        let pr =  2.4934969 * x - 0.9313836 * y - 0.4027108 * z;
        let pg = -0.8294890 * x + 1.7626641 * y + 0.0236247 * z;
        let pb =  0.0358458 * x - 0.0761724 * y + 0.9568845 * z;
        // P3 linear → P3 gamma (same transfer as sRGB)
        let to_gam = |v: f64| -> f64 { let v = v.clamp(0.0, 1.0); if v <= 0.0031308 { v * 12.92 } else { 1.055 * v.powf(1.0/2.4) - 0.055 } };
        (to_gam(pr), to_gam(pg), to_gam(pb))
    }

    /// Display P3 → sRGB (clamped)
    pub fn p3_to_srgb(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
        let to_lin = |v: f64| -> f64 { if v <= 0.04045 { v / 12.92 } else { ((v + 0.055) / 1.055).powf(2.4) } };
        let lr = to_lin(r); let lg = to_lin(g); let lb = to_lin(b);
        // P3 linear → XYZ D65
        let x = 0.4865709 * lr + 0.2656677 * lg + 0.1982173 * lb;
        let y = 0.2289746 * lr + 0.6917385 * lg + 0.0792869 * lb;
        let z = 0.0000000 * lr + 0.0451134 * lg + 1.0439444 * lb;
        // XYZ D65 → sRGB linear
        let sr =  3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
        let sg = -0.9692660 * x + 1.8760108 * y + 0.0415560 * z;
        let sb =  0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
        let to_gam = |v: f64| -> f64 { let v = v.clamp(0.0, 1.0); if v <= 0.0031308 { v * 12.92 } else { 1.055 * v.powf(1.0/2.4) - 0.055 } };
        (to_gam(sr), to_gam(sg), to_gam(sb))
    }

    /// sRGB (0-1) → OKLab (Björn Ottosson algorithm)
    pub fn srgb_to_oklab(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
        let to_lin = |v: f64| -> f64 { if v <= 0.04045 { v / 12.92 } else { ((v + 0.055) / 1.055).powf(2.4) } };
        let lr = to_lin(r); let lg = to_lin(g); let lb = to_lin(b);
        let l_ = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
        let m_ = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
        let s_ = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
        let l_c = l_.cbrt(); let m_c = m_.cbrt(); let s_c = s_.cbrt();
        let l = 0.2104542553 * l_c + 0.7936177850 * m_c - 0.0040720468 * s_c;
        let a = 1.9779984951 * l_c - 2.4285922050 * m_c + 0.4505937099 * s_c;
        let b_val = 0.0259040371 * l_c + 0.7827717662 * m_c - 0.8086757660 * s_c;
        (l, a, b_val)
    }

    /// OKLab → sRGB (u8)
    pub fn oklab_to_srgb(l: f64, a: f64, b: f64) -> (u8, u8, u8) {
        let l_c = l + 0.3963377774 * a + 0.2158037573 * b;
        let m_c = l - 0.1055613458 * a - 0.0638541728 * b;
        let s_c = l - 0.0894841775 * a - 1.2914855480 * b;
        let l_ = l_c * l_c * l_c; let m_ = m_c * m_c * m_c; let s_ = s_c * s_c * s_c;
        let r =  4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
        let g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
        let b_out = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_;
        let to_gam = |v: f64| -> f64 { let v = v.clamp(0.0, 1.0); if v <= 0.0031308 { v * 12.92 } else { 1.055 * v.powf(1.0/2.4) - 0.055 } };
        ((to_gam(r) * 255.0).round() as u8, (to_gam(g) * 255.0).round() as u8, (to_gam(b_out) * 255.0).round() as u8)
    }

    pub fn white() -> Self { Self { r: 255, g: 255, b: 255, a: 1.0, color_space: ColorSpace::SRGB } }
    pub fn black() -> Self { Self { r: 0, g: 0, b: 0, a: 1.0, color_space: ColorSpace::SRGB } }
    pub fn transparent() -> Self { Self { r: 0, g: 0, b: 0, a: 0.0, color_space: ColorSpace::SRGB } }
    pub fn blue() -> Self { Self { r: 59, g: 130, b: 246, a: 1.0, color_space: ColorSpace::SRGB } }

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
            return Self { r: v, g: v, b: v, a, color_space: ColorSpace::default() };
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
            color_space: ColorSpace::default(),
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

/// A scene-level breakpoint for responsive multi-viewport preview.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SceneBreakpoint {
    pub name: String,
    pub width: f64,
    pub height: f64,
}

impl SceneBreakpoint {
    pub fn default_presets() -> Vec<SceneBreakpoint> {
        vec![
            SceneBreakpoint { name: "Mobile".into(), width: 375.0, height: 812.0 },
            SceneBreakpoint { name: "Tablet".into(), width: 768.0, height: 1024.0 },
            SceneBreakpoint { name: "Desktop".into(), width: 1440.0, height: 900.0 },
        ]
    }
}
