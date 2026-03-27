//! CRDT-based scene synchronization
//!
//! Implements operation-level merge with vector clocks and LWW (Last Writer Wins)
//! conflict resolution for multiplayer editing.

use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use crate::node::NodeId;

/// Unique identifier for a collaborating site/client
pub type SiteId = String;

/// Lamport-style vector clock for causal ordering
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct VectorClock {
    pub clocks: HashMap<SiteId, u64>,
}

impl VectorClock {
    pub fn new() -> Self {
        Self { clocks: HashMap::new() }
    }

    /// Increment the counter for the given site and return the new value
    pub fn increment(&mut self, site: &str) -> u64 {
        let counter = self.clocks.entry(site.to_string()).or_insert(0);
        *counter += 1;
        *counter
    }

    /// Get the counter for a site
    pub fn get(&self, site: &str) -> u64 {
        self.clocks.get(site).copied().unwrap_or(0)
    }

    /// Merge another vector clock into this one (element-wise max)
    pub fn merge(&mut self, other: &VectorClock) {
        for (site, &counter) in &other.clocks {
            let entry = self.clocks.entry(site.clone()).or_insert(0);
            if counter > *entry {
                *entry = counter;
            }
        }
    }

    /// Returns true if self dominates or equals other (all counters >=)
    pub fn dominates(&self, other: &VectorClock) -> bool {
        for (site, &counter) in &other.clocks {
            if self.get(site) < counter {
                return false;
            }
        }
        true
    }

    /// Returns true if the two clocks are concurrent (neither dominates)
    pub fn is_concurrent(&self, other: &VectorClock) -> bool {
        !self.dominates(other) && !other.dominates(self)
    }
}

/// Property key for LWW register
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum PropKey {
    X,
    Y,
    Width,
    Height,
    Rotation,
    Opacity,
    Visible,
    Locked,
    Name,
    Fill,       // JSON-encoded fill data
    Stroke,     // JSON-encoded stroke data
    CornerRadius,
    Content,    // Text content
    FontFamily,
    FontSize,
    FontWeight,
    FontStyle,
    TextAlign,
    LineHeight,
    Blur,
    Shadows,    // JSON-encoded shadows array
    BlendMode,
    Overflow,
    Custom(String),
}

/// Serializable property value
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum PropValue {
    F64(f64),
    Bool(bool),
    String(String),
    U32(u32),
    /// JSON blob for complex properties (fills, strokes, shadows, etc.)
    Json(String),
    Null,
}

/// An operation that can be applied to the scene
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Operation {
    /// Unique operation ID
    pub id: String,
    /// Site that generated this operation
    pub site_id: SiteId,
    /// Vector clock at time of generation
    pub clock: VectorClock,
    /// Wall-clock timestamp (ms since epoch) for LWW tiebreaker
    pub timestamp: f64,
    /// The actual operation
    pub kind: OpKind,
}

/// Operation types
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum OpKind {
    /// Add a new node (JSON-serialized Node)
    AddNode {
        node_json: String,
        parent_id: Option<NodeId>,
    },
    /// Remove a node (tombstone)
    RemoveNode {
        node_id: NodeId,
    },
    /// Update a property on a node (LWW)
    UpdateProperty {
        node_id: NodeId,
        key: PropKey,
        value: PropValue,
    },
    /// Move a node to a new position
    MoveNode {
        node_id: NodeId,
        x: f64,
        y: f64,
    },
    /// Reparent a node
    ReparentNode {
        node_id: NodeId,
        new_parent_id: Option<NodeId>,
        index: Option<usize>,
    },
    /// Reorder children of a parent
    ReorderChildren {
        parent_id: Option<NodeId>, // None = root
        child_ids: Vec<NodeId>,
    },
    /// Page operations
    AddPage { name: String, page_id: u64 },
    RemovePage { page_id: u64 },
    RenamePage { page_id: u64, name: String },
    SetActivePage { page_id: u64 },
}

/// Tombstone set — tracks deleted node IDs to handle concurrent add/remove
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct TombstoneSet {
    pub deleted: HashMap<NodeId, f64>, // node_id → deletion timestamp
}

impl TombstoneSet {
    pub fn new() -> Self { Self { deleted: HashMap::new() } }

    pub fn mark_deleted(&mut self, id: NodeId, timestamp: f64) {
        self.deleted.insert(id, timestamp);
    }

    pub fn is_deleted(&self, id: NodeId) -> bool {
        self.deleted.contains_key(&id)
    }
}

/// LWW register for a single property
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LWWRegister {
    pub value: PropValue,
    pub timestamp: f64,
    pub site_id: SiteId,
}

/// Per-node LWW state
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct NodeLWWState {
    pub registers: HashMap<String, LWWRegister>, // PropKey serialized as string key
}

/// The CRDT document that manages operation-level synchronization
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CRDTDoc {
    /// This site's ID
    pub site_id: SiteId,
    /// Global vector clock
    pub clock: VectorClock,
    /// Operation log (ordered by receipt)
    pub op_log: Vec<Operation>,
    /// Pending operations generated locally but not yet acknowledged
    pub pending_ops: Vec<Operation>,
    /// Tombstone set for deleted nodes
    pub tombstones: TombstoneSet,
    /// LWW state per node: node_id → property → LWWRegister
    pub lww_state: HashMap<NodeId, NodeLWWState>,
    /// Maximum op_log size before compaction
    pub max_log_size: usize,
}

impl Default for CRDTDoc {
    fn default() -> Self {
        Self {
            site_id: String::new(),
            clock: VectorClock::new(),
            op_log: Vec::new(),
            pending_ops: Vec::new(),
            tombstones: TombstoneSet::new(),
            lww_state: HashMap::new(),
            max_log_size: 10000,
        }
    }
}

/// Result of merging remote operations
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MergeResult {
    /// Operations that were actually applied (not rejected by conflict resolution)
    pub applied: Vec<Operation>,
    /// Operations that were rejected (superseded by newer local state)
    pub rejected: Vec<String>, // op IDs
}

impl CRDTDoc {
    pub fn new(site_id: &str) -> Self {
        Self {
            site_id: site_id.to_string(),
            ..Default::default()
        }
    }

    /// Generate an operation for a local change, auto-incrementing the clock
    pub fn generate_op(&mut self, kind: OpKind) -> Operation {
        let counter = self.clock.increment(&self.site_id);
        let op = Operation {
            id: format!("{}:{}", self.site_id, counter),
            site_id: self.site_id.clone(),
            clock: self.clock.clone(),
            timestamp: js_timestamp(),
            kind,
        };
        self.pending_ops.push(op.clone());
        self.apply_op_to_state(&op);
        op
    }

    /// Take all pending operations (for sending to server)
    pub fn take_pending(&mut self) -> Vec<Operation> {
        std::mem::take(&mut self.pending_ops)
    }

    /// Get pending operations without consuming them
    pub fn get_pending(&self) -> &[Operation] {
        &self.pending_ops
    }

    /// Acknowledge that pending ops have been sent (clear them)
    pub fn ack_pending(&mut self, op_ids: &[String]) {
        self.pending_ops.retain(|op| !op_ids.contains(&op.id));
    }

    /// Merge remote operations into this document
    pub fn merge_remote(&mut self, ops: Vec<Operation>) -> MergeResult {
        let mut result = MergeResult {
            applied: Vec::new(),
            rejected: Vec::new(),
        };

        for op in ops {
            // Skip our own ops
            if op.site_id == self.site_id {
                continue;
            }

            // Check if already processed (duplicate detection via clock)
            let remote_counter = op.clock.get(&op.site_id);
            let local_counter = self.clock.get(&op.site_id);
            if remote_counter <= local_counter {
                // Already seen this or older
                result.rejected.push(op.id.clone());
                continue;
            }

            // Merge the clock
            self.clock.merge(&op.clock);

            // Apply the operation with conflict resolution
            if self.apply_op_with_conflict_resolution(&op) {
                result.applied.push(op.clone());
            } else {
                result.rejected.push(op.id.clone());
            }

            // Add to log
            self.op_log.push(op);
        }

        // Compact log if needed
        if self.op_log.len() > self.max_log_size {
            let drain = self.op_log.len() - self.max_log_size / 2;
            self.op_log.drain(0..drain);
        }

        result
    }

    /// Apply operation with LWW conflict resolution
    fn apply_op_with_conflict_resolution(&mut self, op: &Operation) -> bool {
        match &op.kind {
            OpKind::RemoveNode { node_id } => {
                self.tombstones.mark_deleted(*node_id, op.timestamp);
                true
            }
            OpKind::UpdateProperty { node_id, key, value } => {
                if self.tombstones.is_deleted(*node_id) {
                    return false; // Node was deleted, ignore property update
                }
                let key_str = serde_json::to_string(key).unwrap_or_default();
                let node_state = self.lww_state.entry(*node_id).or_default();
                if let Some(existing) = node_state.registers.get(&key_str) {
                    // LWW: higher timestamp wins; on tie, higher site_id wins
                    if op.timestamp < existing.timestamp
                        || (op.timestamp == existing.timestamp && op.site_id <= existing.site_id)
                    {
                        return false; // Existing value wins
                    }
                }
                node_state.registers.insert(key_str, LWWRegister {
                    value: value.clone(),
                    timestamp: op.timestamp,
                    site_id: op.site_id.clone(),
                });
                true
            }
            OpKind::MoveNode { node_id, .. } => {
                if self.tombstones.is_deleted(*node_id) {
                    return false;
                }
                // LWW for position
                let x_key = serde_json::to_string(&PropKey::X).unwrap_or_default();
                let node_state = self.lww_state.entry(*node_id).or_default();
                if let Some(existing) = node_state.registers.get(&x_key) {
                    if op.timestamp < existing.timestamp
                        || (op.timestamp == existing.timestamp && op.site_id <= existing.site_id)
                    {
                        return false;
                    }
                }
                // Update both X and Y registers
                let y_key = serde_json::to_string(&PropKey::Y).unwrap_or_default();
                node_state.registers.insert(x_key, LWWRegister {
                    value: PropValue::F64(0.0), // actual value applied to scene directly
                    timestamp: op.timestamp,
                    site_id: op.site_id.clone(),
                });
                node_state.registers.insert(y_key, LWWRegister {
                    value: PropValue::F64(0.0),
                    timestamp: op.timestamp,
                    site_id: op.site_id.clone(),
                });
                true
            }
            _ => {
                // AddNode, ReparentNode, ReorderChildren, Page ops: always apply
                self.apply_op_to_state(op);
                true
            }
        }
    }

    /// Apply operation side effects to CRDT internal state (tombstones, LWW)
    fn apply_op_to_state(&mut self, op: &Operation) {
        match &op.kind {
            OpKind::RemoveNode { node_id } => {
                self.tombstones.mark_deleted(*node_id, op.timestamp);
            }
            OpKind::UpdateProperty { node_id, key, value } => {
                let key_str = serde_json::to_string(key).unwrap_or_default();
                let node_state = self.lww_state.entry(*node_id).or_default();
                node_state.registers.insert(key_str, LWWRegister {
                    value: value.clone(),
                    timestamp: op.timestamp,
                    site_id: op.site_id.clone(),
                });
            }
            _ => {}
        }
    }

    /// Get the vector clock as JSON
    pub fn clock_json(&self) -> String {
        serde_json::to_string(&self.clock).unwrap_or_default()
    }

    /// Get pending ops as JSON
    pub fn pending_json(&self) -> String {
        serde_json::to_string(&self.pending_ops).unwrap_or_default()
    }
}

/// Get current timestamp in ms (uses js_sys in WASM)
fn js_timestamp() -> f64 {
    #[cfg(target_arch = "wasm32")]
    {
        js_sys::Date::now()
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as f64)
            .unwrap_or(0.0)
    }
}
