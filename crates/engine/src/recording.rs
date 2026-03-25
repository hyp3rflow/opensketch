use serde::{Deserialize, Serialize};

/// A single recorded frame: timestamp + serialized scene JSON
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RecordEntry {
    pub timestamp_ms: u64,
    pub snapshot: String,
}

/// Recording store — captures scene snapshots over time for replay
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct RecordingStore {
    pub entries: Vec<RecordEntry>,
    pub is_recording: bool,
    /// Timestamp (ms) when recording started
    pub start_time_ms: u64,
    /// Max frames to keep (default 600 = ~10min at 1fps)
    pub max_frames: usize,
}

impl RecordingStore {
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
            is_recording: false,
            start_time_ms: 0,
            max_frames: 600,
        }
    }

    /// Start recording. Clears previous entries.
    pub fn start(&mut self, now_ms: u64) {
        self.entries.clear();
        self.is_recording = true;
        self.start_time_ms = now_ms;
    }

    /// Stop recording.
    pub fn stop(&mut self) {
        self.is_recording = false;
    }

    /// Add a frame. Returns false if not recording or at max capacity.
    pub fn add_frame(&mut self, now_ms: u64, snapshot: String) -> bool {
        if !self.is_recording {
            return false;
        }
        if self.entries.len() >= self.max_frames {
            return false;
        }
        let timestamp_ms = now_ms.saturating_sub(self.start_time_ms);
        // Deduplicate: skip if identical to last snapshot
        if let Some(last) = self.entries.last() {
            if last.snapshot == snapshot {
                return false;
            }
        }
        self.entries.push(RecordEntry {
            timestamp_ms,
            snapshot,
        });
        true
    }

    /// Get total duration in ms
    pub fn duration_ms(&self) -> u64 {
        self.entries.last().map(|e| e.timestamp_ms).unwrap_or(0)
    }

    /// Get frame count
    pub fn frame_count(&self) -> usize {
        self.entries.len()
    }

    /// Find the snapshot for a given playback time (ms). Returns the closest frame at or before time.
    pub fn snapshot_at(&self, time_ms: u64) -> Option<&str> {
        if self.entries.is_empty() {
            return None;
        }
        // Binary search for the last entry <= time_ms
        let idx = match self.entries.binary_search_by_key(&time_ms, |e| e.timestamp_ms) {
            Ok(i) => i,
            Err(0) => 0,
            Err(i) => i - 1,
        };
        Some(&self.entries[idx].snapshot)
    }

    /// Export all entries as JSON
    pub fn export_json(&self) -> String {
        serde_json::to_string(&self.entries).unwrap_or_else(|_| "[]".to_string())
    }

    /// Clear all entries
    pub fn clear(&mut self) {
        self.entries.clear();
        self.is_recording = false;
    }
}
