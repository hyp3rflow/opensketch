use serde_json::{json, Value};
use crate::animation::{AnimationClip, AnimProperty, Easing, AnimationTrack};
use crate::node::{Node, NodeId, NodeKind, Fill, FillType, PathPoint};
use crate::scene::Scene;

/// Export an animation clip to Lottie JSON (bodymovin format v5.7+)
pub fn export_lottie(scene: &Scene, clip_id: u64) -> Option<String> {
    let clip = scene.animations.get_clip(clip_id)?;
    let duration_ms = clip.effective_duration();
    let fps = 30.0_f64;
    let total_frames = ((duration_ms as f64 / 1000.0) * fps).ceil().max(1.0) as u32;

    // Collect all animated node IDs
    let animated_ids: Vec<NodeId> = {
        let mut ids: Vec<NodeId> = clip.tracks.iter().map(|t| t.node_id).collect();
        ids.sort();
        ids.dedup();
        ids
    };

    // Build layers (reverse order for Lottie — last in array renders first)
    let mut layers: Vec<Value> = Vec::new();
    let mut layer_idx = 0u32;

    let node_ids: Vec<NodeId> = if animated_ids.is_empty() {
        scene.root_children.clone()
    } else {
        animated_ids.clone()
    };

    for &nid in node_ids.iter().rev() {
        if let Some(node) = scene.get_node(nid) {
            let layer = node_to_lottie_layer(scene, node, clip, layer_idx, fps, total_frames);
            layers.push(layer);
            layer_idx += 1;
        }
    }

    let (w, h) = scene_dimensions(scene);

    let lottie = json!({
        "v": "5.7.4",
        "fr": fps,
        "ip": 0,
        "op": total_frames,
        "w": w,
        "h": h,
        "nm": clip.name,
        "ddd": 0,
        "assets": [],
        "layers": layers
    });

    Some(serde_json::to_string_pretty(&lottie).unwrap_or_default())
}

/// Export all clips to a JSON array
pub fn export_all_lottie(scene: &Scene) -> String {
    let results: Vec<Value> = scene.animations.clips.iter().filter_map(|clip| {
        export_lottie(scene, clip.id).and_then(|s| serde_json::from_str(&s).ok())
    }).collect();
    serde_json::to_string_pretty(&results).unwrap_or_else(|_| "[]".to_string())
}

fn scene_dimensions(scene: &Scene) -> (u32, u32) {
    match scene.get_bounds() {
        Some((x1, y1, x2, y2)) => (((x2 - x1).max(1.0)) as u32, ((y2 - y1).max(1.0)) as u32),
        None => (800, 600),
    }
}

fn node_to_lottie_layer(scene: &Scene, node: &Node, clip: &AnimationClip, idx: u32, fps: f64, total_frames: u32) -> Value {
    // Determine layer type
    match &node.kind {
        NodeKind::Rect => shape_layer(node, clip, idx, fps, total_frames, rect_shape(node)),
        NodeKind::Ellipse => shape_layer(node, clip, idx, fps, total_frames, ellipse_shape(node)),
        NodeKind::Star { points, inner_radius } => shape_layer(node, clip, idx, fps, total_frames, star_shape(node, *points, *inner_radius)),
        NodeKind::Polygon { sides } => shape_layer(node, clip, idx, fps, total_frames, polygon_shape(node, *sides)),
        NodeKind::Path { points, closed, .. } => shape_layer(node, clip, idx, fps, total_frames, path_shape(node, points, *closed)),
        NodeKind::Text { content, font_size, font_family, .. } => {
            text_layer(node, clip, idx, fps, total_frames, content, *font_size, font_family)
        }
        NodeKind::Frame | NodeKind::Group | NodeKind::Section => {
            group_layer(scene, node, clip, idx, fps, total_frames)
        }
        _ => shape_layer(node, clip, idx, fps, total_frames, rect_shape(node)),
    }
}

fn shape_layer(node: &Node, clip: &AnimationClip, idx: u32, fps: f64, total_frames: u32, group_shape: Value) -> Value {
    json!({
        "ddd": 0,
        "ind": idx,
        "ty": 4,
        "nm": node.name,
        "sr": 1,
        "ks": transform_object(node, clip, fps),
        "ao": 0,
        "shapes": [group_shape],
        "ip": 0,
        "op": total_frames,
        "st": 0,
        "bm": blend_mode_to_lottie(&node.blend_mode)
    })
}

fn group_layer(scene: &Scene, node: &Node, clip: &AnimationClip, idx: u32, fps: f64, total_frames: u32) -> Value {
    let mut child_layers: Vec<Value> = Vec::new();
    for (ci, &child_id) in node.children.iter().rev().enumerate() {
        if let Some(child) = scene.get_node(child_id) {
            child_layers.push(node_to_lottie_layer(scene, child, clip, idx * 100 + ci as u32, fps, total_frames));
        }
    }
    json!({
        "ddd": 0,
        "ind": idx,
        "ty": 0,
        "nm": node.name,
        "refId": format!("comp_{}", node.id),
        "sr": 1,
        "ks": transform_object(node, clip, fps),
        "ao": 0,
        "w": node.width as u32,
        "h": node.height as u32,
        "ip": 0,
        "op": total_frames,
        "st": 0,
        "bm": blend_mode_to_lottie(&node.blend_mode),
        "layers": child_layers
    })
}

fn text_layer(node: &Node, clip: &AnimationClip, idx: u32, fps: f64, total_frames: u32, content: &str, font_size: f64, font_family: &str) -> Value {
    let fc = fill_color_array(node);
    json!({
        "ddd": 0,
        "ind": idx,
        "ty": 5,
        "nm": node.name,
        "sr": 1,
        "ks": transform_object(node, clip, fps),
        "ao": 0,
        "t": {
            "d": {
                "k": [{
                    "s": {
                        "s": font_size,
                        "f": font_family,
                        "t": content,
                        "j": 0,
                        "tr": 0,
                        "lh": font_size * 1.2,
                        "ls": 0,
                        "fc": fc
                    },
                    "t": 0
                }]
            },
            "p": {},
            "m": { "g": 1, "a": { "a": 0, "k": [0, 0], "ix": 2 } }
        },
        "ip": 0,
        "op": total_frames,
        "st": 0,
        "bm": blend_mode_to_lottie(&node.blend_mode)
    })
}

fn fill_color_array(node: &Node) -> Vec<f64> {
    if let Some(fill) = node.fills.first() {
        if let FillType::Solid { color } = &fill.fill_type {
            return vec![color.r as f64 / 255.0, color.g as f64 / 255.0, color.b as f64 / 255.0];
        }
    }
    vec![0.0, 0.0, 0.0]
}

/// Build the Lottie transform object "ks" with animated properties
fn transform_object(node: &Node, clip: &AnimationClip, fps: f64) -> Value {
    let ax = node.width / 2.0;
    let ay = node.height / 2.0;

    json!({
        "o": animated_or_static(clip, node.id, &AnimProperty::Opacity, node.opacity * 100.0, fps),
        "r": animated_or_static(clip, node.id, &AnimProperty::Rotation, node.rotation, fps),
        "p": position_animated(clip, node, fps),
        "a": { "a": 0, "k": [ax, ay, 0.0] },
        "s": scale_animated(clip, node.id, fps)
    })
}

fn animated_or_static(clip: &AnimationClip, nid: NodeId, prop: &AnimProperty, static_val: f64, fps: f64) -> Value {
    let track = clip.tracks.iter().find(|t| t.node_id == nid && t.property == *prop);
    match track {
        Some(t) if t.keyframes.len() > 1 => {
            json!({ "a": 1, "k": keyframes_to_lottie(t, fps) })
        }
        Some(t) if t.keyframes.len() == 1 => {
            json!({ "a": 0, "k": t.keyframes[0].value })
        }
        _ => json!({ "a": 0, "k": static_val })
    }
}

fn position_animated(clip: &AnimationClip, node: &Node, fps: f64) -> Value {
    let nid = node.id;
    let x_track = clip.tracks.iter().find(|t| t.node_id == nid && t.property == AnimProperty::X);
    let y_track = clip.tracks.iter().find(|t| t.node_id == nid && t.property == AnimProperty::Y);

    let ax = node.width / 2.0;
    let ay = node.height / 2.0;

    if x_track.is_some() || y_track.is_some() {
        let mut times: Vec<u32> = Vec::new();
        if let Some(xt) = x_track {
            for kf in &xt.keyframes { if !times.contains(&kf.time_ms) { times.push(kf.time_ms); } }
        }
        if let Some(yt) = y_track {
            for kf in &yt.keyframes { if !times.contains(&kf.time_ms) { times.push(kf.time_ms); } }
        }
        times.sort();

        if times.len() > 1 {
            let mut kfs: Vec<Value> = Vec::new();
            for (i, &t) in times.iter().enumerate() {
                let xv = x_track.and_then(|tr| tr.value_at(t)).unwrap_or(node.x) + ax;
                let yv = y_track.and_then(|tr| tr.value_at(t)).unwrap_or(node.y) + ay;
                let frame = time_to_frame(t, fps);
                let is_last = i == times.len() - 1;

                let easing = x_track.or(y_track).and_then(|tr| {
                    tr.keyframes.iter().find(|k| k.time_ms == t).map(|k| &k.easing)
                }).unwrap_or(&Easing::Linear);

                if is_last {
                    kfs.push(json!({ "t": frame, "s": [xv, yv, 0.0] }));
                } else {
                    let (o, i_ease) = easing_to_lottie(easing);
                    kfs.push(json!({ "t": frame, "s": [xv, yv, 0.0], "o": o, "i": i_ease }));
                }
            }
            return json!({ "a": 1, "k": kfs });
        } else if times.len() == 1 {
            let t = times[0];
            let xv = x_track.and_then(|tr| tr.value_at(t)).unwrap_or(node.x) + ax;
            let yv = y_track.and_then(|tr| tr.value_at(t)).unwrap_or(node.y) + ay;
            return json!({ "a": 0, "k": [xv, yv, 0.0] });
        }
    }

    json!({ "a": 0, "k": [node.x + ax, node.y + ay, 0.0] })
}

fn scale_animated(clip: &AnimationClip, nid: NodeId, fps: f64) -> Value {
    let sx_track = clip.tracks.iter().find(|t| t.node_id == nid && t.property == AnimProperty::ScaleX);
    let sy_track = clip.tracks.iter().find(|t| t.node_id == nid && t.property == AnimProperty::ScaleY);

    if sx_track.is_some() || sy_track.is_some() {
        let mut times: Vec<u32> = Vec::new();
        if let Some(t) = sx_track { for kf in &t.keyframes { if !times.contains(&kf.time_ms) { times.push(kf.time_ms); } } }
        if let Some(t) = sy_track { for kf in &t.keyframes { if !times.contains(&kf.time_ms) { times.push(kf.time_ms); } } }
        times.sort();

        if times.len() > 1 {
            let mut kfs: Vec<Value> = Vec::new();
            for (i, &t) in times.iter().enumerate() {
                let sv_x = sx_track.and_then(|tr| tr.value_at(t)).unwrap_or(100.0);
                let sv_y = sy_track.and_then(|tr| tr.value_at(t)).unwrap_or(100.0);
                let frame = time_to_frame(t, fps);
                if i == times.len() - 1 {
                    kfs.push(json!({ "t": frame, "s": [sv_x, sv_y, 100.0] }));
                } else {
                    let easing = sx_track.or(sy_track).and_then(|tr| tr.keyframes.iter().find(|k| k.time_ms == t).map(|k| &k.easing)).unwrap_or(&Easing::Linear);
                    let (o, i_ease) = easing_to_lottie(easing);
                    kfs.push(json!({ "t": frame, "s": [sv_x, sv_y, 100.0], "o": o, "i": i_ease }));
                }
            }
            return json!({ "a": 1, "k": kfs });
        }
    }

    json!({ "a": 0, "k": [100.0, 100.0, 100.0] })
}

fn keyframes_to_lottie(track: &AnimationTrack, fps: f64) -> Vec<Value> {
    let mut result: Vec<Value> = Vec::new();
    for (i, kf) in track.keyframes.iter().enumerate() {
        let frame = time_to_frame(kf.time_ms, fps);
        if i == track.keyframes.len() - 1 {
            result.push(json!({ "t": frame, "s": [kf.value] }));
        } else {
            let (o, i_ease) = easing_to_lottie(&kf.easing);
            result.push(json!({ "t": frame, "s": [kf.value], "o": o, "i": i_ease }));
        }
    }
    result
}

fn time_to_frame(time_ms: u32, fps: f64) -> f64 {
    (time_ms as f64 / 1000.0) * fps
}

fn easing_to_lottie(easing: &Easing) -> (Value, Value) {
    match easing {
        Easing::Linear => (
            json!({ "x": [0.0], "y": [0.0] }),
            json!({ "x": [1.0], "y": [1.0] })
        ),
        Easing::EaseIn => (
            json!({ "x": [0.42], "y": [0.0] }),
            json!({ "x": [1.0], "y": [1.0] })
        ),
        Easing::EaseOut => (
            json!({ "x": [0.0], "y": [0.0] }),
            json!({ "x": [0.58], "y": [1.0] })
        ),
        Easing::EaseInOut => (
            json!({ "x": [0.42], "y": [0.0] }),
            json!({ "x": [0.58], "y": [1.0] })
        ),
        Easing::CubicBezier(x1, y1, x2, y2) => (
            json!({ "x": [*x1], "y": [*y1] }),
            json!({ "x": [*x2], "y": [*y2] })
        ),
    }
}

fn rect_shape(node: &Node) -> Value {
    let items = vec![
        json!({
            "ty": "rc",
            "d": 1,
            "s": { "a": 0, "k": [node.width, node.height] },
            "p": { "a": 0, "k": [0.0, 0.0] },
            "r": { "a": 0, "k": node.corner_radius },
            "nm": "Rect"
        })
    ];
    json!({
        "ty": "gr",
        "it": items_with_transform(node, items),
        "nm": "Shape"
    })
}

fn ellipse_shape(node: &Node) -> Value {
    let items = vec![
        json!({
            "ty": "el",
            "d": 1,
            "s": { "a": 0, "k": [node.width, node.height] },
            "p": { "a": 0, "k": [0.0, 0.0] },
            "nm": "Ellipse"
        })
    ];
    json!({
        "ty": "gr",
        "it": items_with_transform(node, items),
        "nm": "Shape"
    })
}

fn star_shape(node: &Node, points: u32, inner_radius: f64) -> Value {
    let outer_r = node.width.min(node.height) / 2.0;
    let items = vec![
        json!({
            "ty": "sr",
            "sy": 1,
            "d": 1,
            "pt": { "a": 0, "k": points },
            "p": { "a": 0, "k": [0.0, 0.0] },
            "r": { "a": 0, "k": 0.0 },
            "ir": { "a": 0, "k": outer_r * inner_radius },
            "or": { "a": 0, "k": outer_r },
            "is": { "a": 0, "k": 0.0 },
            "os": { "a": 0, "k": 0.0 },
            "nm": "Star"
        })
    ];
    json!({
        "ty": "gr",
        "it": items_with_transform(node, items),
        "nm": "Shape"
    })
}

fn polygon_shape(node: &Node, sides: u32) -> Value {
    let r = node.width.min(node.height) / 2.0;
    let items = vec![
        json!({
            "ty": "sr",
            "sy": 2,
            "d": 1,
            "pt": { "a": 0, "k": sides },
            "p": { "a": 0, "k": [0.0, 0.0] },
            "r": { "a": 0, "k": 0.0 },
            "or": { "a": 0, "k": r },
            "os": { "a": 0, "k": 0.0 },
            "nm": "Polygon"
        })
    ];
    json!({
        "ty": "gr",
        "it": items_with_transform(node, items),
        "nm": "Shape"
    })
}

fn path_shape(node: &Node, points: &[PathPoint], closed: bool) -> Value {
    let mut vertices: Vec<[f64; 2]> = Vec::new();
    let mut in_tangents: Vec<[f64; 2]> = Vec::new();
    let mut out_tangents: Vec<[f64; 2]> = Vec::new();

    let cx = node.width / 2.0;
    let cy = node.height / 2.0;

    for pt in points {
        let vx = pt.x - node.x - cx;
        let vy = pt.y - node.y - cy;
        vertices.push([vx, vy]);
        in_tangents.push([pt.handle_in_x - pt.x, pt.handle_in_y - pt.y]);
        out_tangents.push([pt.handle_out_x - pt.x, pt.handle_out_y - pt.y]);
    }

    let items = vec![
        json!({
            "ty": "sh",
            "d": 1,
            "ks": {
                "a": 0,
                "k": {
                    "c": closed,
                    "v": vertices,
                    "i": in_tangents,
                    "o": out_tangents
                }
            },
            "nm": "Path"
        })
    ];
    json!({
        "ty": "gr",
        "it": items_with_transform(node, items),
        "nm": "Shape"
    })
}

fn items_with_transform(node: &Node, mut items: Vec<Value>) -> Vec<Value> {
    for fill in node.fills.iter().filter(|f| f.visible) {
        items.push(fill_to_lottie(fill));
    }
    for stroke in node.strokes.iter() {
        items.push(stroke_to_lottie(stroke));
    }
    items.push(json!({
        "ty": "tr",
        "p": { "a": 0, "k": [0.0, 0.0] },
        "a": { "a": 0, "k": [0.0, 0.0] },
        "s": { "a": 0, "k": [100.0, 100.0] },
        "r": { "a": 0, "k": 0.0 },
        "o": { "a": 0, "k": 100.0 }
    }));
    items
}

fn fill_to_lottie(fill: &Fill) -> Value {
    match &fill.fill_type {
        FillType::Solid { color } => {
            json!({
                "ty": "fl",
                "c": { "a": 0, "k": [color.r as f64 / 255.0, color.g as f64 / 255.0, color.b as f64 / 255.0, 1.0] },
                "o": { "a": 0, "k": color.a as f64 / 255.0 * 100.0 },
                "r": 1,
                "bm": 0,
                "nm": "Fill"
            })
        }
        FillType::LinearGradient { stops, start_x, start_y, end_x, end_y } => {
            let colors = gradient_stops_to_lottie(stops);
            json!({
                "ty": "gf",
                "o": { "a": 0, "k": 100.0 },
                "r": 1,
                "bm": 0,
                "t": 1,
                "s": { "a": 0, "k": [*start_x * 100.0, *start_y * 100.0] },
                "e": { "a": 0, "k": [*end_x * 100.0, *end_y * 100.0] },
                "g": { "p": stops.len(), "k": { "a": 0, "k": colors } },
                "nm": "Gradient Fill"
            })
        }
        FillType::RadialGradient { stops, center_x, center_y, radius, .. } => {
            let colors = gradient_stops_to_lottie(stops);
            json!({
                "ty": "gf",
                "o": { "a": 0, "k": 100.0 },
                "r": 1,
                "bm": 0,
                "t": 2,
                "s": { "a": 0, "k": [*center_x * 100.0, *center_y * 100.0] },
                "e": { "a": 0, "k": [(*center_x + *radius) * 100.0, *center_y * 100.0] },
                "g": { "p": stops.len(), "k": { "a": 0, "k": colors } },
                "nm": "Gradient Fill"
            })
        }
        // Other fill types (Pattern, Noise, etc.) → fallback to solid white
        _ => {
            let c = fill.color();
            json!({
                "ty": "fl",
                "c": { "a": 0, "k": [c.r as f64 / 255.0, c.g as f64 / 255.0, c.b as f64 / 255.0, 1.0] },
                "o": { "a": 0, "k": c.a as f64 / 255.0 * 100.0 },
                "r": 1,
                "bm": 0,
                "nm": "Fill"
            })
        }
    }
}

fn gradient_stops_to_lottie(stops: &[crate::node::GradientStop]) -> Vec<f64> {
    let mut colors: Vec<f64> = Vec::new();
    for stop in stops {
        colors.push(stop.offset);
        colors.push(stop.color.r as f64 / 255.0);
        colors.push(stop.color.g as f64 / 255.0);
        colors.push(stop.color.b as f64 / 255.0);
    }
    colors
}

fn stroke_to_lottie(stroke: &crate::node::Stroke) -> Value {
    use crate::node::{LineCap, LineJoin};
    let c = &stroke.color;
    let mut v = json!({
        "ty": "st",
        "c": { "a": 0, "k": [c.r as f64 / 255.0, c.g as f64 / 255.0, c.b as f64 / 255.0, 1.0] },
        "o": { "a": 0, "k": 100.0 },
        "w": { "a": 0, "k": stroke.width },
        "lc": match stroke.line_cap { LineCap::Butt => 1, LineCap::Round => 2, LineCap::Square => 3 },
        "lj": match stroke.line_join { LineJoin::Miter => 1, LineJoin::Round => 2, LineJoin::Bevel => 3 },
        "nm": "Stroke"
    });
    if !stroke.dash_array.is_empty() {
        let dashes: Vec<Value> = stroke.dash_array.iter().enumerate().map(|(i, &d)| {
            json!({ "n": if i % 2 == 0 { "d" } else { "g" }, "v": { "a": 0, "k": d } })
        }).collect();
        v["d"] = json!(dashes);
    }
    v
}

fn blend_mode_to_lottie(bm: &crate::node::BlendMode) -> u32 {
    use crate::node::BlendMode;
    match bm {
        BlendMode::Normal => 0,
        BlendMode::Multiply => 1,
        BlendMode::Screen => 2,
        BlendMode::Overlay => 3,
        BlendMode::Darken => 4,
        BlendMode::Lighten => 5,
        BlendMode::ColorDodge => 6,
        BlendMode::ColorBurn => 7,
        BlendMode::HardLight => 8,
        BlendMode::SoftLight => 9,
        BlendMode::Difference => 10,
        BlendMode::Exclusion => 11,
        BlendMode::Hue => 12,
        BlendMode::Saturation => 13,
        BlendMode::Color => 14,
        BlendMode::Luminosity => 15,
    }
}
