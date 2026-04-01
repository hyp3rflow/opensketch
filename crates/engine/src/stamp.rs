use serde::{Serialize, Deserialize};

/// Predefined annotation stamp types for design review workflows
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum StampKind {
    Approved,
    Rejected,
    WIP,
    Todo,
    NeedsRevision,
    Final,
    OnHold,
    Question,
    Love,
    Warning,
    Info,
    Fixme,
}

impl StampKind {
    pub fn label(&self) -> &'static str {
        match self {
            StampKind::Approved => "APPROVED",
            StampKind::Rejected => "REJECTED",
            StampKind::WIP => "WIP",
            StampKind::Todo => "TODO",
            StampKind::NeedsRevision => "NEEDS REVISION",
            StampKind::Final => "FINAL",
            StampKind::OnHold => "ON HOLD",
            StampKind::Question => "QUESTION",
            StampKind::Love => "LOVE",
            StampKind::Warning => "WARNING",
            StampKind::Info => "INFO",
            StampKind::Fixme => "FIXME",
        }
    }

    pub fn emoji(&self) -> &'static str {
        match self {
            StampKind::Approved => "✅",
            StampKind::Rejected => "❌",
            StampKind::WIP => "🚧",
            StampKind::Todo => "📋",
            StampKind::NeedsRevision => "🔄",
            StampKind::Final => "🏁",
            StampKind::OnHold => "⏸️",
            StampKind::Question => "❓",
            StampKind::Love => "❤️",
            StampKind::Warning => "⚠️",
            StampKind::Info => "ℹ️",
            StampKind::Fixme => "🔧",
        }
    }

    pub fn color(&self) -> &'static str {
        match self {
            StampKind::Approved => "#22c55e",
            StampKind::Rejected => "#ef4444",
            StampKind::WIP => "#f59e0b",
            StampKind::Todo => "#3b82f6",
            StampKind::NeedsRevision => "#f97316",
            StampKind::Final => "#8b5cf6",
            StampKind::OnHold => "#6b7280",
            StampKind::Question => "#06b6d4",
            StampKind::Love => "#ec4899",
            StampKind::Warning => "#eab308",
            StampKind::Info => "#0ea5e9",
            StampKind::Fixme => "#f43f5e",
        }
    }

    pub fn from_str(s: &str) -> Option<StampKind> {
        match s.to_lowercase().as_str() {
            "approved" => Some(StampKind::Approved),
            "rejected" => Some(StampKind::Rejected),
            "wip" => Some(StampKind::WIP),
            "todo" => Some(StampKind::Todo),
            "needs_revision" | "needsrevision" => Some(StampKind::NeedsRevision),
            "final" => Some(StampKind::Final),
            "on_hold" | "onhold" => Some(StampKind::OnHold),
            "question" => Some(StampKind::Question),
            "love" => Some(StampKind::Love),
            "warning" => Some(StampKind::Warning),
            "info" => Some(StampKind::Info),
            "fixme" => Some(StampKind::Fixme),
            _ => None,
        }
    }
}

/// A stamp annotation placed on the canvas
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Stamp {
    pub id: u64,
    pub kind: StampKind,
    pub x: f64,
    pub y: f64,
    pub rotation: f64,
    pub scale: f64,
    pub author: String,
    pub timestamp: f64,
    pub page_id: u64,
    /// Optional note text
    #[serde(default)]
    pub note: String,
    /// Optional target node ID
    #[serde(default)]
    pub node_id: Option<u64>,
}
