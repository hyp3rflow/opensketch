//! Design Token Theme Switching
//!
//! Themes (Light/Dark/Custom) define token name→value mappings.
//! Nodes bind fill/stroke to token names; switching theme updates all bound nodes.

use crate::types::ColorSpace;
use std::collections::HashMap;
use serde::{Serialize, Deserialize};

pub type ThemeId = u64;
pub type TokenId = u64;

/// A single design token value
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum TokenValue {
    Color(String),    // hex e.g. "#ff0000" or "rgba(…)"
    Number(f64),
    String(String),
    /// Alias: references another token by name, e.g. "{colors.primary}"
    #[serde(rename = "alias")]
    Alias(String),
}

impl TokenValue {
    pub fn as_color_str(&self) -> Option<&str> {
        match self {
            TokenValue::Color(s) => Some(s),
            _ => None,
        }
    }

    /// Check if this value is an alias
    pub fn is_alias(&self) -> bool {
        matches!(self, TokenValue::Alias(_))
    }

    /// Get the alias target name (without braces), if this is an alias
    pub fn alias_target(&self) -> Option<&str> {
        match self {
            TokenValue::Alias(s) => {
                let trimmed = s.trim();
                if trimmed.starts_with('{') && trimmed.ends_with('}') {
                    Some(&trimmed[1..trimmed.len()-1])
                } else {
                    Some(trimmed)
                }
            }
            _ => None,
        }
    }
}

/// A named token within a theme
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Token {
    pub id: TokenId,
    pub name: String,
    pub value: TokenValue,
}

/// A theme containing a set of tokens
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Theme {
    pub id: ThemeId,
    pub name: String,
    pub tokens: Vec<Token>,
    next_token_id: TokenId,
}

impl Theme {
    pub fn new(id: ThemeId, name: String) -> Self {
        Self { id, name, tokens: vec![], next_token_id: 1 }
    }

    pub fn add_token(&mut self, name: String, value: TokenValue) -> TokenId {
        let id = self.next_token_id;
        self.next_token_id += 1;
        self.tokens.push(Token { id, name, value });
        id
    }

    pub fn remove_token(&mut self, token_id: TokenId) -> bool {
        let len = self.tokens.len();
        self.tokens.retain(|t| t.id != token_id);
        self.tokens.len() < len
    }

    pub fn update_token(&mut self, token_id: TokenId, value: TokenValue) -> bool {
        if let Some(t) = self.tokens.iter_mut().find(|t| t.id == token_id) {
            t.value = value;
            true
        } else {
            false
        }
    }

    pub fn get_token_by_name(&self, name: &str) -> Option<&Token> {
        self.tokens.iter().find(|t| t.name == name)
    }

    pub fn get_token(&self, id: TokenId) -> Option<&Token> {
        self.tokens.iter().find(|t| t.id == id)
    }
}

/// Binding: which property of a node is bound to which token name
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TokenBinding {
    pub node_id: u64,
    pub property: TokenProperty,
    pub token_name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum TokenProperty {
    Fill,
    Stroke,
    Opacity,
    CornerRadius,
}

impl TokenProperty {
    pub fn as_str(&self) -> &'static str {
        match self {
            TokenProperty::Fill => "fill",
            TokenProperty::Stroke => "stroke",
            TokenProperty::Opacity => "opacity",
            TokenProperty::CornerRadius => "corner_radius",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "fill" => Some(TokenProperty::Fill),
            "stroke" => Some(TokenProperty::Stroke),
            "opacity" => Some(TokenProperty::Opacity),
            "corner_radius" => Some(TokenProperty::CornerRadius),
            _ => None,
        }
    }
}

/// The token store: manages themes, active theme, and bindings
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct TokenStore {
    pub themes: Vec<Theme>,
    pub active_theme_id: ThemeId,
    pub bindings: Vec<TokenBinding>,
    next_theme_id: ThemeId,
}

impl TokenStore {
    pub fn new() -> Self {
        Self {
            themes: vec![],
            active_theme_id: 0,
            bindings: vec![],
            next_theme_id: 1,
        }
    }

    pub fn create_theme(&mut self, name: String) -> ThemeId {
        let id = self.next_theme_id;
        self.next_theme_id += 1;
        self.themes.push(Theme::new(id, name));
        if self.active_theme_id == 0 {
            self.active_theme_id = id;
        }
        id
    }

    pub fn remove_theme(&mut self, id: ThemeId) -> bool {
        let len = self.themes.len();
        self.themes.retain(|t| t.id != id);
        if self.themes.len() < len {
            if self.active_theme_id == id {
                self.active_theme_id = self.themes.first().map(|t| t.id).unwrap_or(0);
            }
            true
        } else {
            false
        }
    }

    pub fn rename_theme(&mut self, id: ThemeId, name: String) -> bool {
        if let Some(t) = self.themes.iter_mut().find(|t| t.id == id) {
            t.name = name;
            true
        } else {
            false
        }
    }

    pub fn set_active_theme(&mut self, id: ThemeId) -> bool {
        if self.themes.iter().any(|t| t.id == id) {
            self.active_theme_id = id;
            true
        } else {
            false
        }
    }

    pub fn active_theme(&self) -> Option<&Theme> {
        self.themes.iter().find(|t| t.id == self.active_theme_id)
    }

    pub fn active_theme_mut(&mut self) -> Option<&mut Theme> {
        let id = self.active_theme_id;
        self.themes.iter_mut().find(|t| t.id == id)
    }

    pub fn get_theme(&self, id: ThemeId) -> Option<&Theme> {
        self.themes.iter().find(|t| t.id == id)
    }

    pub fn get_theme_mut(&mut self, id: ThemeId) -> Option<&mut Theme> {
        self.themes.iter_mut().find(|t| t.id == id)
    }

    /// Add a token to a specific theme
    pub fn add_token(&mut self, theme_id: ThemeId, name: String, value: TokenValue) -> Option<TokenId> {
        self.get_theme_mut(theme_id).map(|t| t.add_token(name, value))
    }

    /// Remove a token from a specific theme
    pub fn remove_token(&mut self, theme_id: ThemeId, token_id: TokenId) -> bool {
        self.get_theme_mut(theme_id).map(|t| t.remove_token(token_id)).unwrap_or(false)
    }

    /// Update a token value in a specific theme
    pub fn update_token(&mut self, theme_id: ThemeId, token_id: TokenId, value: TokenValue) -> bool {
        self.get_theme_mut(theme_id).map(|t| t.update_token(token_id, value)).unwrap_or(false)
    }

    /// Bind a node property to a token name
    pub fn bind(&mut self, node_id: u64, property: TokenProperty, token_name: String) {
        // Remove existing binding for same node+property
        self.bindings.retain(|b| !(b.node_id == node_id && b.property == property));
        self.bindings.push(TokenBinding { node_id, property, token_name });
    }

    /// Unbind a node property
    pub fn unbind(&mut self, node_id: u64, property: TokenProperty) {
        self.bindings.retain(|b| !(b.node_id == node_id && b.property == property));
    }

    /// Unbind all bindings for a node
    pub fn unbind_all(&mut self, node_id: u64) {
        self.bindings.retain(|b| b.node_id != node_id);
    }

    /// Get bindings for a specific node
    pub fn get_bindings_for_node(&self, node_id: u64) -> Vec<&TokenBinding> {
        self.bindings.iter().filter(|b| b.node_id == node_id).collect()
    }

    /// Resolve a token name in the active theme (shallow — may return Alias)
    pub fn resolve(&self, token_name: &str) -> Option<&TokenValue> {
        self.active_theme()
            .and_then(|t| t.get_token_by_name(token_name))
            .map(|t| &t.value)
    }

    /// Resolve a token name deeply — follows alias chains (max 16 depth, cycle-safe)
    pub fn resolve_deep(&self, token_name: &str) -> Option<TokenValue> {
        let theme = self.active_theme()?;
        let mut current_name = token_name.to_string();
        let mut visited = std::collections::HashSet::new();
        let max_depth = 16;

        for _ in 0..max_depth {
            if !visited.insert(current_name.clone()) {
                return None; // cycle detected
            }
            let token = theme.get_token_by_name(&current_name)?;
            match &token.value {
                TokenValue::Alias(alias_str) => {
                    let target = alias_str.trim();
                    current_name = if target.starts_with('{') && target.ends_with('}') {
                        target[1..target.len()-1].to_string()
                    } else {
                        target.to_string()
                    };
                }
                other => return Some(other.clone()),
            }
        }
        None // max depth exceeded
    }

    /// Get the full alias chain for a token name (for debugging/UI)
    pub fn get_alias_chain(&self, token_name: &str) -> Vec<String> {
        let theme = match self.active_theme() {
            Some(t) => t,
            None => return vec![token_name.to_string()],
        };
        let mut chain = vec![token_name.to_string()];
        let mut current_name = token_name.to_string();
        let max_depth = 16;

        for _ in 0..max_depth {
            let token = match theme.get_token_by_name(&current_name) {
                Some(t) => t,
                None => break,
            };
            match &token.value {
                TokenValue::Alias(alias_str) => {
                    let target = alias_str.trim();
                    let target = if target.starts_with('{') && target.ends_with('}') {
                        &target[1..target.len()-1]
                    } else {
                        target
                    };
                    if chain.contains(&target.to_string()) {
                        chain.push(format!("⟲ {}", target)); // cycle marker
                        break;
                    }
                    chain.push(target.to_string());
                    current_name = target.to_string();
                }
                _ => break,
            }
        }
        chain
    }

    /// Set a token as an alias of another token
    pub fn set_alias(&mut self, theme_id: ThemeId, token_id: TokenId, target_name: String) -> bool {
        let alias_value = format!("{{{}}}", target_name);
        self.update_token(theme_id, token_id, TokenValue::Alias(alias_value))
    }

    /// Export all themes as JSON
    pub fn export_json(&self) -> String {
        serde_json::to_string_pretty(self).unwrap_or_else(|_| "{}".into())
    }

    /// Import from JSON
    pub fn import_json(json: &str) -> Option<Self> {
        serde_json::from_str(json).ok()
    }
}
