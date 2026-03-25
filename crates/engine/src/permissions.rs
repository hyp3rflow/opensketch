use serde::{Serialize, Deserialize};
use std::collections::HashMap;

/// User role in the project
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum Role {
    Owner,
    Editor,
    Viewer,
}

impl Default for Role {
    fn default() -> Self { Role::Viewer }
}

impl Role {
    pub fn from_str(s: &str) -> Self {
        match s {
            "owner" => Role::Owner,
            "editor" => Role::Editor,
            _ => Role::Viewer,
        }
    }

    pub fn to_str(&self) -> &'static str {
        match self {
            Role::Owner => "owner",
            Role::Editor => "editor",
            Role::Viewer => "viewer",
        }
    }

    /// Whether this role can edit nodes
    pub fn can_edit(&self) -> bool {
        matches!(self, Role::Owner | Role::Editor)
    }

    /// Whether this role can manage permissions
    pub fn can_manage(&self) -> bool {
        matches!(self, Role::Owner)
    }
}

/// A user in the permission system
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProjectUser {
    pub user_id: String,
    pub name: String,
    pub role: Role,
    /// Optional avatar URL
    #[serde(default)]
    pub avatar: String,
}

/// Lock on a specific node or page — prevents others from editing
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Lock {
    /// Who holds the lock
    pub user_id: String,
    /// Timestamp (ms since epoch)
    pub locked_at: u64,
    /// Optional expiry (0 = no expiry)
    #[serde(default)]
    pub expires_at: u64,
}

/// Permission store — manages users, roles, and locks
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct PermissionStore {
    /// Project users keyed by user_id
    #[serde(default)]
    pub users: Vec<ProjectUser>,
    /// Node locks: node_id → Lock
    #[serde(default)]
    pub node_locks: HashMap<u64, Lock>,
    /// Page locks: page_id → Lock
    #[serde(default)]
    pub page_locks: HashMap<u64, Lock>,
}

impl PermissionStore {
    pub fn new() -> Self {
        Self::default()
    }

    // ── User management ────────────────────────────────

    pub fn add_user(&mut self, user_id: String, name: String, role: Role) {
        // Remove existing if any
        self.users.retain(|u| u.user_id != user_id);
        self.users.push(ProjectUser {
            user_id,
            name,
            role,
            avatar: String::new(),
        });
    }

    pub fn remove_user(&mut self, user_id: &str) {
        self.users.retain(|u| u.user_id != user_id);
        // Clean up any locks held by this user
        self.node_locks.retain(|_, l| l.user_id != user_id);
        self.page_locks.retain(|_, l| l.user_id != user_id);
    }

    pub fn set_role(&mut self, user_id: &str, role: Role) -> bool {
        if let Some(u) = self.users.iter_mut().find(|u| u.user_id == user_id) {
            u.role = role;
            true
        } else {
            false
        }
    }

    pub fn get_user(&self, user_id: &str) -> Option<&ProjectUser> {
        self.users.iter().find(|u| u.user_id == user_id)
    }

    pub fn get_role(&self, user_id: &str) -> Role {
        self.get_user(user_id).map(|u| u.role.clone()).unwrap_or(Role::Viewer)
    }

    // ── Permission checks ──────────────────────────────

    /// Check if a user can edit a specific node
    pub fn can_edit_node(&self, user_id: &str, node_id: u64) -> bool {
        let role = self.get_role(user_id);
        if !role.can_edit() {
            return false;
        }
        // Check node lock
        if let Some(lock) = self.node_locks.get(&node_id) {
            if lock.user_id != user_id {
                return false;
            }
        }
        true
    }

    /// Check if a user can edit a specific page
    pub fn can_edit_page(&self, user_id: &str, page_id: u64) -> bool {
        let role = self.get_role(user_id);
        if !role.can_edit() {
            return false;
        }
        // Check page lock
        if let Some(lock) = self.page_locks.get(&page_id) {
            if lock.user_id != user_id {
                return false;
            }
        }
        true
    }

    // ── Node locking ───────────────────────────────────

    pub fn lock_node(&mut self, user_id: &str, node_id: u64, timestamp: u64) -> bool {
        let role = self.get_role(user_id);
        if !role.can_edit() {
            return false;
        }
        // Check if already locked by someone else
        if let Some(lock) = self.node_locks.get(&node_id) {
            if lock.user_id != user_id {
                // Check expiry
                if lock.expires_at > 0 && timestamp > lock.expires_at {
                    // Expired, can take over
                } else {
                    return false;
                }
            }
        }
        self.node_locks.insert(node_id, Lock {
            user_id: user_id.to_string(),
            locked_at: timestamp,
            expires_at: 0,
        });
        true
    }

    pub fn unlock_node(&mut self, user_id: &str, node_id: u64) -> bool {
        if let Some(lock) = self.node_locks.get(&node_id) {
            // Owner can unlock anyone's lock
            let role = self.get_role(user_id);
            if lock.user_id == user_id || role.can_manage() {
                self.node_locks.remove(&node_id);
                return true;
            }
        }
        false
    }

    pub fn get_node_lock(&self, node_id: u64) -> Option<&Lock> {
        self.node_locks.get(&node_id)
    }

    // ── Page locking ───────────────────────────────────

    pub fn lock_page(&mut self, user_id: &str, page_id: u64, timestamp: u64) -> bool {
        let role = self.get_role(user_id);
        if !role.can_edit() {
            return false;
        }
        if let Some(lock) = self.page_locks.get(&page_id) {
            if lock.user_id != user_id {
                if lock.expires_at > 0 && timestamp > lock.expires_at {
                    // Expired
                } else {
                    return false;
                }
            }
        }
        self.page_locks.insert(page_id, Lock {
            user_id: user_id.to_string(),
            locked_at: timestamp,
            expires_at: 0,
        });
        true
    }

    pub fn unlock_page(&mut self, user_id: &str, page_id: u64) -> bool {
        if let Some(lock) = self.page_locks.get(&page_id) {
            let role = self.get_role(user_id);
            if lock.user_id == user_id || role.can_manage() {
                self.page_locks.remove(&page_id);
                return true;
            }
        }
        false
    }

    pub fn get_page_lock(&self, page_id: u64) -> Option<&Lock> {
        self.page_locks.get(&page_id)
    }

    // ── Serialization helpers ──────────────────────────

    pub fn get_users_json(&self) -> String {
        serde_json::to_string(&self.users).unwrap_or_default()
    }

    pub fn get_locks_json(&self) -> String {
        #[derive(Serialize)]
        struct LocksInfo {
            node_locks: HashMap<u64, Lock>,
            page_locks: HashMap<u64, Lock>,
        }
        serde_json::to_string(&LocksInfo {
            node_locks: self.node_locks.clone(),
            page_locks: self.page_locks.clone(),
        }).unwrap_or_default()
    }

    /// Clean up expired locks
    pub fn cleanup_expired(&mut self, now: u64) {
        self.node_locks.retain(|_, l| l.expires_at == 0 || l.expires_at > now);
        self.page_locks.retain(|_, l| l.expires_at == 0 || l.expires_at > now);
    }
}
