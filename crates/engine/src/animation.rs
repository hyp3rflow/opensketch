use serde::{Deserialize, Serialize};
use crate::node::NodeId;
use crate::variable::{VariableId, CollectionId, VariableValue, VariableCollection};

/// Easing function for keyframe interpolation
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum Easing {
    Linear,
    EaseIn,
    EaseOut,
    EaseInOut,
    /// Custom cubic-bezier(x1, y1, x2, y2)
    CubicBezier(f64, f64, f64, f64),
}

impl Default for Easing {
    fn default() -> Self { Easing::EaseInOut }
}

impl Easing {
    /// Evaluate easing at t ∈ [0, 1] → output ∈ [0, 1]
    pub fn evaluate(&self, t: f64) -> f64 {
        let t = t.clamp(0.0, 1.0);
        match self {
            Easing::Linear => t,
            Easing::EaseIn => t * t * t,
            Easing::EaseOut => 1.0 - (1.0 - t).powi(3),
            Easing::EaseInOut => {
                if t < 0.5 { 4.0 * t * t * t }
                else { 1.0 - (-2.0 * t + 2.0).powi(3) / 2.0 }
            }
            Easing::CubicBezier(x1, y1, x2, y2) => {
                cubic_bezier_eval(*x1, *y1, *x2, *y2, t)
            }
        }
    }
}

/// Approximate cubic-bezier evaluation using Newton's method
fn cubic_bezier_eval(x1: f64, y1: f64, x2: f64, y2: f64, x: f64) -> f64 {
    // Find t for given x using Newton-Raphson
    let mut t = x;
    for _ in 0..8 {
        let cx = 3.0 * x1;
        let bx = 3.0 * (x2 - x1) - cx;
        let ax = 1.0 - cx - bx;
        let x_at_t = ((ax * t + bx) * t + cx) * t;
        let dx = (3.0 * ax * t + 2.0 * bx) * t + cx;
        if dx.abs() < 1e-7 { break; }
        t -= (x_at_t - x) / dx;
        t = t.clamp(0.0, 1.0);
    }
    // Evaluate y at t
    let cy = 3.0 * y1;
    let by = 3.0 * (y2 - y1) - cy;
    let ay = 1.0 - cy - by;
    ((ay * t + by) * t + cy) * t
}

/// Which node property is animated
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum AnimProperty {
    X,
    Y,
    Width,
    Height,
    Rotation,
    Opacity,
    CornerRadius,
    Blur,
    // Fill[index] color channels
    FillR(usize),
    FillG(usize),
    FillB(usize),
    FillA(usize),
    // Stroke width
    StrokeWidth(usize),
    // Scale (uniform, encoded as width+height percentage)
    ScaleX,
    ScaleY,
    /// Motion path: node follows a Path node. Value = progress (0.0–1.0).
    /// The associated MotionPathConfig is stored on the track.
    MotionPath,
}

/// Configuration for motion path animation
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MotionPathConfig {
    /// ID of the Path node to follow
    pub path_node_id: u64,
    /// Whether to orient the node along the path tangent
    #[serde(default = "default_true")]
    pub orient_to_path: bool,
    /// Rotation offset in degrees (added to tangent angle when orient_to_path is true)
    #[serde(default)]
    pub rotation_offset: f64,
}

fn default_true() -> bool { true }

/// Binding a keyframe value to a design variable
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct VariableBinding {
    pub collection_id: CollectionId,
    pub variable_id: VariableId,
}

/// A single keyframe: a property value at a specific time
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Keyframe {
    /// Time in milliseconds from animation start
    pub time_ms: u32,
    /// Property value at this keyframe (used as fallback when variable_binding is None or unresolved)
    pub value: f64,
    /// Easing to the NEXT keyframe
    #[serde(default)]
    pub easing: Easing,
    /// Optional variable binding — when set, value is resolved from the variable at runtime
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub variable_binding: Option<VariableBinding>,
}

impl Keyframe {
    /// Resolve the keyframe value: use variable if bound, otherwise use static value
    pub fn resolve_value(&self, collections: &[VariableCollection]) -> f64 {
        if let Some(ref binding) = self.variable_binding {
            if let Some(coll) = collections.iter().find(|c| c.id == binding.collection_id) {
                if let Some(var) = coll.variables.iter().find(|v| v.id == binding.variable_id) {
                    if let Some(val) = var.values.get(&coll.active_mode_id) {
                        return match val {
                            VariableValue::Number(n) => *n,
                            VariableValue::Boolean(b) => if *b { 1.0 } else { 0.0 },
                            VariableValue::Color(hex) => {
                                // For color bindings, extract brightness as fallback
                                parse_color_brightness(hex)
                            }
                            VariableValue::String(_) => self.value,
                        };
                    }
                }
            }
        }
        self.value
    }
}

fn parse_color_brightness(hex: &str) -> f64 {
    let hex = hex.trim_start_matches('#');
    if hex.len() >= 6 {
        let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0) as f64;
        let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0) as f64;
        let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0) as f64;
        (r + g + b) / (3.0 * 255.0)
    } else {
        0.5
    }
}

/// A track: one property animation for one node
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AnimationTrack {
    pub node_id: NodeId,
    pub property: AnimProperty,
    pub keyframes: Vec<Keyframe>,
    /// Motion path config (only used when property == MotionPath)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub motion_path: Option<MotionPathConfig>,
}

impl AnimationTrack {
    /// Get interpolated value at time_ms. Returns None if no keyframes.
    pub fn value_at(&self, time_ms: u32) -> Option<f64> {
        self.value_at_with_vars(time_ms, &[])
    }

    /// Get interpolated value, resolving variable bindings from collections
    pub fn value_at_with_vars(&self, time_ms: u32, collections: &[VariableCollection]) -> Option<f64> {
        if self.keyframes.is_empty() { return None; }
        if self.keyframes.len() == 1 {
            return Some(self.keyframes[0].resolve_value(collections));
        }

        // Before first keyframe
        if time_ms <= self.keyframes[0].time_ms {
            return Some(self.keyframes[0].resolve_value(collections));
        }
        // After last keyframe
        let last = self.keyframes.last().unwrap();
        if time_ms >= last.time_ms {
            return Some(last.resolve_value(collections));
        }

        // Find surrounding keyframes
        for i in 0..self.keyframes.len() - 1 {
            let a = &self.keyframes[i];
            let b = &self.keyframes[i + 1];
            if time_ms >= a.time_ms && time_ms <= b.time_ms {
                let span = (b.time_ms - a.time_ms) as f64;
                if span == 0.0 { return Some(b.resolve_value(collections)); }
                let linear_t = (time_ms - a.time_ms) as f64 / span;
                let eased_t = a.easing.evaluate(linear_t);
                let va = a.resolve_value(collections);
                let vb = b.resolve_value(collections);
                return Some(va + (vb - va) * eased_t);
            }
        }
        Some(last.resolve_value(collections))
    }

    /// Duration: max keyframe time
    pub fn duration_ms(&self) -> u32 {
        self.keyframes.last().map_or(0, |k| k.time_ms)
    }
}

/// An animation clip containing multiple tracks
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AnimationClip {
    pub id: u64,
    pub name: String,
    pub tracks: Vec<AnimationTrack>,
    /// Loop mode
    #[serde(default)]
    pub looping: bool,
    /// Total duration override (0 = auto from tracks)
    #[serde(default)]
    pub duration_ms: u32,
}

impl AnimationClip {
    pub fn effective_duration(&self) -> u32 {
        if self.duration_ms > 0 { return self.duration_ms; }
        self.tracks.iter().map(|t| t.duration_ms()).max().unwrap_or(0)
    }
}

/// Animation state stored in Scene
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct AnimationStore {
    pub clips: Vec<AnimationClip>,
    #[serde(default)]
    pub next_clip_id: u64,
}

impl AnimationStore {
    pub fn new() -> Self {
        Self { clips: vec![], next_clip_id: 1 }
    }

    pub fn add_clip(&mut self, name: &str) -> u64 {
        let id = self.next_clip_id;
        self.next_clip_id += 1;
        self.clips.push(AnimationClip {
            id,
            name: name.to_string(),
            tracks: vec![],
            looping: false,
            duration_ms: 0,
        });
        id
    }

    pub fn remove_clip(&mut self, clip_id: u64) -> bool {
        let len = self.clips.len();
        self.clips.retain(|c| c.id != clip_id);
        self.clips.len() < len
    }

    pub fn get_clip(&self, clip_id: u64) -> Option<&AnimationClip> {
        self.clips.iter().find(|c| c.id == clip_id)
    }

    pub fn get_clip_mut(&mut self, clip_id: u64) -> Option<&mut AnimationClip> {
        self.clips.iter_mut().find(|c| c.id == clip_id)
    }

    pub fn add_keyframe(&mut self, clip_id: u64, node_id: NodeId, property: AnimProperty, time_ms: u32, value: f64, easing: Easing) -> bool {
        let clip = match self.get_clip_mut(clip_id) {
            Some(c) => c,
            None => return false,
        };

        // Find or create track
        let track = match clip.tracks.iter_mut().find(|t| t.node_id == node_id && t.property == property) {
            Some(t) => t,
            None => {
                clip.tracks.push(AnimationTrack {
                    node_id,
                    property: property.clone(),
                    keyframes: vec![],
                    motion_path: None,
                });
                clip.tracks.last_mut().unwrap()
            }
        };

        // Insert or update keyframe at time
        match track.keyframes.iter().position(|k| k.time_ms == time_ms) {
            Some(idx) => {
                track.keyframes[idx].value = value;
                track.keyframes[idx].easing = easing;
            }
            None => {
                track.keyframes.push(Keyframe { time_ms, value, easing, variable_binding: None });
                track.keyframes.sort_by_key(|k| k.time_ms);
            }
        }
        true
    }

    pub fn remove_keyframe(&mut self, clip_id: u64, node_id: NodeId, property: &AnimProperty, time_ms: u32) -> bool {
        let clip = match self.get_clip_mut(clip_id) {
            Some(c) => c,
            None => return false,
        };

        let track_idx = clip.tracks.iter().position(|t| t.node_id == node_id && &t.property == property);
        if let Some(idx) = track_idx {
            let len = clip.tracks[idx].keyframes.len();
            clip.tracks[idx].keyframes.retain(|k| k.time_ms != time_ms);
            let removed = clip.tracks[idx].keyframes.len() < len;
            if clip.tracks[idx].keyframes.is_empty() {
                clip.tracks.remove(idx);
            }
            return removed;
        }
        false
    }

    /// Get all interpolated values for a clip at a given time
    pub fn evaluate_clip(&self, clip_id: u64, time_ms: u32) -> Vec<(NodeId, AnimProperty, f64)> {
        self.evaluate_clip_with_vars(clip_id, time_ms, &[])
    }

    /// Evaluate clip with variable resolution
    pub fn evaluate_clip_with_vars(&self, clip_id: u64, time_ms: u32, collections: &[VariableCollection]) -> Vec<(NodeId, AnimProperty, f64)> {
        let clip = match self.get_clip(clip_id) {
            Some(c) => c,
            None => return vec![],
        };

        let effective_time = if clip.looping && clip.effective_duration() > 0 {
            time_ms % clip.effective_duration()
        } else {
            time_ms.min(clip.effective_duration())
        };

        clip.tracks.iter().filter_map(|track| {
            track.value_at_with_vars(effective_time, collections).map(|v| (track.node_id, track.property.clone(), v))
        }).collect()
    }

    /// Bind a keyframe to a variable
    pub fn bind_keyframe_to_variable(&mut self, clip_id: u64, node_id: NodeId, property: &AnimProperty, time_ms: u32, collection_id: CollectionId, variable_id: VariableId) -> bool {
        let clip = match self.get_clip_mut(clip_id) {
            Some(c) => c,
            None => return false,
        };
        if let Some(track) = clip.tracks.iter_mut().find(|t| t.node_id == node_id && &t.property == property) {
            if let Some(kf) = track.keyframes.iter_mut().find(|k| k.time_ms == time_ms) {
                kf.variable_binding = Some(VariableBinding { collection_id, variable_id });
                return true;
            }
        }
        false
    }

    /// Unbind a keyframe from its variable
    pub fn unbind_keyframe_variable(&mut self, clip_id: u64, node_id: NodeId, property: &AnimProperty, time_ms: u32) -> bool {
        let clip = match self.get_clip_mut(clip_id) {
            Some(c) => c,
            None => return false,
        };
        if let Some(track) = clip.tracks.iter_mut().find(|t| t.node_id == node_id && &t.property == property) {
            if let Some(kf) = track.keyframes.iter_mut().find(|k| k.time_ms == time_ms) {
                kf.variable_binding = None;
                return true;
            }
        }
        false
    }

    /// Get all variable bindings in a clip as JSON
    pub fn get_clip_variable_bindings(&self, clip_id: u64) -> String {
        let clip = match self.get_clip(clip_id) {
            Some(c) => c,
            None => return "[]".to_string(),
        };
        let mut bindings = vec![];
        for track in &clip.tracks {
            for kf in &track.keyframes {
                if let Some(ref b) = kf.variable_binding {
                    bindings.push(serde_json::json!({
                        "node_id": track.node_id,
                        "property": track.property,
                        "time_ms": kf.time_ms,
                        "collection_id": b.collection_id,
                        "variable_id": b.variable_id,
                        "resolved_value": kf.value,
                    }));
                }
            }
        }
        serde_json::to_string(&bindings).unwrap_or_else(|_| "[]".to_string())
    }
}
