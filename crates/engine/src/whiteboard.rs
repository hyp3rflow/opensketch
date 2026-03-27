use serde::{Serialize, Deserialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WhiteboardTimer {
    pub duration_secs: u32,
    pub remaining_secs: u32,
    pub running: bool,
}

impl Default for WhiteboardTimer {
    fn default() -> Self {
        Self {
            duration_secs: 300,
            remaining_secs: 300,
            running: false,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct WhiteboardState {
    pub active: bool,
    #[serde(default)]
    pub timer: Option<WhiteboardTimer>,
    #[serde(default)]
    pub voting_enabled: bool,
}
