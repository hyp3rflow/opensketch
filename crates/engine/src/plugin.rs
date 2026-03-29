use serde::{Serialize, Deserialize};

/// Plugin category for marketplace filtering
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum PluginCategory {
    Design,
    Layout,
    Export,
    Accessibility,
    Developer,
}

impl Default for PluginCategory {
    fn default() -> Self { PluginCategory::Design }
}

/// A plugin entry in the marketplace/store
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PluginEntry {
    pub id: String,
    pub name: String,
    pub version: String,
    pub author: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub icon_url: String,
    #[serde(default)]
    pub category: PluginCategory,
    #[serde(default)]
    pub installed: bool,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub downloads: u32,
    #[serde(default)]
    pub rating: f32,
}

/// Manages the plugin catalog and installed plugins
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct PluginStore {
    pub catalog: Vec<PluginEntry>,
    pub installed_ids: Vec<String>,
}

impl PluginStore {
    pub fn new() -> Self {
        let mut store = Self { catalog: Vec::new(), installed_ids: Vec::new() };
        store.populate_builtin_catalog();
        store
    }

    fn populate_builtin_catalog(&mut self) {
        self.catalog = vec![
            PluginEntry {
                id: "lorem-ipsum".into(),
                name: "Lorem Ipsum Generator".into(),
                version: "1.0.0".into(),
                author: "OpenSketch".into(),
                description: "Generate placeholder lorem ipsum text on canvas or fill selected text nodes".into(),
                icon_url: String::new(),
                category: PluginCategory::Design,
                installed: false, enabled: false,
                downloads: 12500, rating: 4.7,
            },
            PluginEntry {
                id: "color-palette".into(),
                name: "Color Palette".into(),
                version: "1.0.0".into(),
                author: "OpenSketch".into(),
                description: "Curated color palettes (Material, Pastel, Ocean, etc.) for quick node styling".into(),
                icon_url: String::new(),
                category: PluginCategory::Design,
                installed: false, enabled: false,
                downloads: 9800, rating: 4.5,
            },
            PluginEntry {
                id: "grid-generator".into(),
                name: "Grid Generator".into(),
                version: "1.0.0".into(),
                author: "OpenSketch".into(),
                description: "Auto-generate rectangular grids with configurable rows, columns, spacing, and colors".into(),
                icon_url: String::new(),
                category: PluginCategory::Layout,
                installed: false, enabled: false,
                downloads: 7200, rating: 4.6,
            },
            PluginEntry {
                id: "auto-layout-helper".into(),
                name: "Auto Layout Helper".into(),
                version: "0.9.0".into(),
                author: "Community".into(),
                description: "Quick auto-layout presets: stack, grid, wrap. One-click layout application".into(),
                icon_url: String::new(),
                category: PluginCategory::Layout,
                installed: false, enabled: false,
                downloads: 5400, rating: 4.3,
            },
            PluginEntry {
                id: "svg-exporter-pro".into(),
                name: "SVG Exporter Pro".into(),
                version: "1.2.0".into(),
                author: "Community".into(),
                description: "Advanced SVG export with optimization, minification, and SVGO integration".into(),
                icon_url: String::new(),
                category: PluginCategory::Export,
                installed: false, enabled: false,
                downloads: 6100, rating: 4.4,
            },
            PluginEntry {
                id: "a11y-checker".into(),
                name: "Accessibility Checker".into(),
                version: "1.0.0".into(),
                author: "Community".into(),
                description: "Check color contrast ratios, text sizing, and WCAG compliance for your designs".into(),
                icon_url: String::new(),
                category: PluginCategory::Accessibility,
                installed: false, enabled: false,
                downloads: 4300, rating: 4.8,
            },
            PluginEntry {
                id: "code-snippet".into(),
                name: "Code Snippet".into(),
                version: "0.8.0".into(),
                author: "Community".into(),
                description: "Generate CSS, Tailwind, and React code snippets from selected nodes".into(),
                icon_url: String::new(),
                category: PluginCategory::Developer,
                installed: false, enabled: false,
                downloads: 8900, rating: 4.2,
            },
        ];
    }

    pub fn install(&mut self, id: &str) -> bool {
        if let Some(entry) = self.catalog.iter_mut().find(|e| e.id == id) {
            entry.installed = true;
            entry.enabled = true;
            if !self.installed_ids.contains(&id.to_string()) {
                self.installed_ids.push(id.to_string());
            }
            true
        } else {
            false
        }
    }

    pub fn uninstall(&mut self, id: &str) -> bool {
        if let Some(entry) = self.catalog.iter_mut().find(|e| e.id == id) {
            entry.installed = false;
            entry.enabled = false;
            self.installed_ids.retain(|i| i != id);
            true
        } else {
            false
        }
    }

    pub fn enable(&mut self, id: &str) -> bool {
        if let Some(entry) = self.catalog.iter_mut().find(|e| e.id == id && e.installed) {
            entry.enabled = true;
            true
        } else {
            false
        }
    }

    pub fn disable(&mut self, id: &str) -> bool {
        if let Some(entry) = self.catalog.iter_mut().find(|e| e.id == id && e.installed) {
            entry.enabled = false;
            true
        } else {
            false
        }
    }

    pub fn get_all(&self) -> &[PluginEntry] {
        &self.catalog
    }

    pub fn get_installed(&self) -> Vec<&PluginEntry> {
        self.catalog.iter().filter(|e| e.installed).collect()
    }

    pub fn search(&self, query: &str, category: Option<&str>) -> Vec<&PluginEntry> {
        let q = query.to_lowercase();
        self.catalog.iter().filter(|e| {
            let matches_query = q.is_empty()
                || e.name.to_lowercase().contains(&q)
                || e.description.to_lowercase().contains(&q)
                || e.author.to_lowercase().contains(&q);
            let matches_category = match category {
                Some("Design") => e.category == PluginCategory::Design,
                Some("Layout") => e.category == PluginCategory::Layout,
                Some("Export") => e.category == PluginCategory::Export,
                Some("Accessibility") => e.category == PluginCategory::Accessibility,
                Some("Developer") => e.category == PluginCategory::Developer,
                _ => true,
            };
            matches_query && matches_category
        }).collect()
    }
}
