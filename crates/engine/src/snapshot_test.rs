use serde::{Serialize, Deserialize};

/// A stored snapshot record (metadata only — actual pixel data lives in JS/IndexedDB)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Snapshot {
    pub id: String,
    pub name: String,
    pub target_type: SnapshotTarget,
    pub target_id: u64,
    pub width: u32,
    pub height: u32,
    pub timestamp: f64,
    #[serde(default)]
    pub hash: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum SnapshotTarget {
    Page,
    Frame,
    Node,
}

/// Result of comparing two image buffers pixel-by-pixel
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DiffResult {
    pub total_pixels: u32,
    pub changed_pixels: u32,
    pub diff_percentage: f64,
    pub passed: bool,
    pub threshold: f64,
    /// Per-channel max difference found
    pub max_channel_diff: u8,
}

/// Snapshot store: keeps metadata for baseline snapshots
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SnapshotStore {
    pub snapshots: Vec<Snapshot>,
    #[serde(default = "default_threshold")]
    pub threshold: f64,
    #[serde(default = "default_channel_tolerance")]
    pub channel_tolerance: u8,
}

fn default_threshold() -> f64 { 0.1 }
fn default_channel_tolerance() -> u8 { 2 }

impl SnapshotStore {
    pub fn new() -> Self {
        Self {
            snapshots: Vec::new(),
            threshold: 0.1,
            channel_tolerance: 2,
        }
    }

    pub fn add_snapshot(&mut self, snap: Snapshot) {
        // Replace existing with same id
        self.snapshots.retain(|s| s.id != snap.id);
        self.snapshots.push(snap);
    }

    pub fn remove_snapshot(&mut self, id: &str) -> bool {
        let before = self.snapshots.len();
        self.snapshots.retain(|s| s.id != id);
        self.snapshots.len() < before
    }

    pub fn get_snapshot(&self, id: &str) -> Option<&Snapshot> {
        self.snapshots.iter().find(|s| s.id == id)
    }

    pub fn get_snapshots_for_target(&self, target_type: &SnapshotTarget, target_id: u64) -> Vec<&Snapshot> {
        self.snapshots.iter()
            .filter(|s| &s.target_type == target_type && s.target_id == target_id)
            .collect()
    }

    pub fn list_all(&self) -> &[Snapshot] {
        &self.snapshots
    }

    pub fn set_threshold(&mut self, t: f64) {
        self.threshold = t.max(0.0).min(100.0);
    }

    pub fn set_channel_tolerance(&mut self, t: u8) {
        self.channel_tolerance = t;
    }
}

/// Compare two RGBA pixel buffers. Returns DiffResult.
/// `baseline` and `current` must be same-length RGBA u8 slices.
pub fn pixel_diff(baseline: &[u8], current: &[u8], width: u32, height: u32, threshold_pct: f64, channel_tolerance: u8) -> DiffResult {
    let total_pixels = width * height;
    let expected_len = (total_pixels as usize) * 4;

    if baseline.len() != expected_len || current.len() != expected_len {
        return DiffResult {
            total_pixels,
            changed_pixels: total_pixels,
            diff_percentage: 100.0,
            passed: false,
            threshold: threshold_pct,
            max_channel_diff: 255,
        };
    }

    let mut changed = 0u32;
    let mut max_diff: u8 = 0;
    let tol = channel_tolerance as i16;

    for i in (0..expected_len).step_by(4) {
        let dr = (baseline[i] as i16 - current[i] as i16).abs();
        let dg = (baseline[i+1] as i16 - current[i+1] as i16).abs();
        let db = (baseline[i+2] as i16 - current[i+2] as i16).abs();
        let da = (baseline[i+3] as i16 - current[i+3] as i16).abs();

        let m = dr.max(dg).max(db).max(da);
        if m > tol {
            changed += 1;
        }
        if (m as u8) > max_diff {
            max_diff = m as u8;
        }
    }

    let diff_pct = if total_pixels == 0 { 0.0 } else { (changed as f64 / total_pixels as f64) * 100.0 };

    DiffResult {
        total_pixels,
        changed_pixels: changed,
        diff_percentage: diff_pct,
        passed: diff_pct <= threshold_pct,
        threshold: threshold_pct,
        max_channel_diff: max_diff,
    }
}

/// Generate a diff image (RGBA) highlighting changed pixels in red
pub fn generate_diff_image(baseline: &[u8], current: &[u8], width: u32, height: u32, channel_tolerance: u8) -> Vec<u8> {
    let total = (width * height) as usize;
    let expected = total * 4;
    let mut out = vec![0u8; expected];

    if baseline.len() != expected || current.len() != expected {
        return out;
    }

    let tol = channel_tolerance as i16;

    for i in (0..expected).step_by(4) {
        let dr = (baseline[i] as i16 - current[i] as i16).abs();
        let dg = (baseline[i+1] as i16 - current[i+1] as i16).abs();
        let db = (baseline[i+2] as i16 - current[i+2] as i16).abs();
        let da = (baseline[i+3] as i16 - current[i+3] as i16).abs();

        let m = dr.max(dg).max(db).max(da);
        if m > tol {
            // Red highlight with intensity proportional to difference
            let intensity = ((m as f64 / 255.0) * 255.0).min(255.0) as u8;
            out[i] = 255;
            out[i+1] = 0;
            out[i+2] = 0;
            out[i+3] = intensity.max(128);
        } else {
            // Dimmed version of current
            out[i] = current[i] / 3;
            out[i+1] = current[i+1] / 3;
            out[i+2] = current[i+2] / 3;
            out[i+3] = 255;
        }
    }

    out
}

/// Simple FNV-1a hash for image data
pub fn hash_image_data(data: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for &b in data {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}
