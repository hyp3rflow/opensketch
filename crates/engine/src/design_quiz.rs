//! Design Quiz / Interview Mode
//!
//! Generates quiz questions from the design file's components, styles,
//! variables, and lint issues.

use crate::types::ColorSpace;
use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use crate::scene::Scene;
use crate::component::ComponentStore;
use crate::node::NodeKind;
use crate::styles::StyleStore;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct QuizQuestion {
    pub id: u32,
    pub category: QuizCategory,
    pub question: String,
    pub options: Vec<String>,
    pub correct_index: usize,
    pub explanation: String,
    pub difficulty: QuizDifficulty,
    pub related_id: Option<u64>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum QuizCategory {
    ComponentUsage,
    StyleGuide,
    DesignTokens,
    LayoutPatterns,
    Accessibility,
    DesignSystem,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum QuizDifficulty { Easy, Medium, Hard }

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChecklistItem {
    pub category: String,
    pub text: String,
    pub passed: bool,
    pub suggestion: Option<String>,
}

struct SimpleRng { state: u64 }
impl SimpleRng {
    fn new(seed: u64) -> Self { Self { state: seed.wrapping_add(1) } }
    fn next(&mut self) -> u64 {
        self.state = self.state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        self.state >> 33
    }
    fn shuffle<T>(&mut self, slice: &mut [T]) {
        for i in (1..slice.len()).rev() {
            let j = (self.next() as usize) % (i + 1);
            slice.swap(i, j);
        }
    }
}

fn make_opts(correct: usize, offsets: &[i64]) -> (Vec<String>, usize) {
    let mut opts: Vec<String> = offsets.iter().map(|o| {
        let v = (correct as i64 + o).max(0) as usize;
        v.to_string()
    }).collect();
    opts.insert(0, correct.to_string());
    opts.sort();
    opts.dedup();
    while opts.len() < 4 { opts.push((correct + opts.len() + 10).to_string()); }
    opts.truncate(4);
    let ci = opts.iter().position(|o| o == &correct.to_string()).unwrap_or(0);
    (opts, ci)
}

pub fn generate_quiz(scene: &Scene, components: &ComponentStore, styles: &StyleStore, seed: u64) -> Vec<QuizQuestion> {
    let mut questions = Vec::new();
    let mut id_counter = 1u32;
    let mut rng = SimpleRng::new(seed);

    let comp_list: Vec<_> = components.list();

    // Component count
    if comp_list.len() >= 2 {
        let (opts, ci) = make_opts(comp_list.len(), &[2, -1, 5]);
        questions.push(QuizQuestion {
            id: id_counter, category: QuizCategory::ComponentUsage,
            question: "How many components are defined in this design system?".into(),
            options: opts, correct_index: ci,
            explanation: format!("There are {} components.", comp_list.len()),
            difficulty: QuizDifficulty::Easy, related_id: None,
        });
        id_counter += 1;
    }

    // Variant count per component
    for comp in comp_list.iter().take(5) {
        let vc = comp.variants.len();
        if vc > 0 {
            let (opts, ci) = make_opts(vc, &[1, -1, 3]);
            questions.push(QuizQuestion {
                id: id_counter, category: QuizCategory::ComponentUsage,
                question: format!("How many variants does '{}' have?", comp.name),
                options: opts, correct_index: ci,
                explanation: format!("'{}' has {} variant(s).", comp.name, vc),
                difficulty: QuizDifficulty::Medium, related_id: Some(comp.id),
            });
            id_counter += 1;
        }
    }

    // Color styles
    let color_styles = styles.list_color_styles();
    if !color_styles.is_empty() {
        let (opts, ci) = make_opts(color_styles.len(), &[2, -2, 4]);
        questions.push(QuizQuestion {
            id: id_counter, category: QuizCategory::StyleGuide,
            question: "How many color styles are defined?".into(),
            options: opts, correct_index: ci,
            explanation: format!("{} color styles.", color_styles.len()),
            difficulty: QuizDifficulty::Easy, related_id: None,
        });
        id_counter += 1;

        if color_styles.len() >= 2 {
            let real_name = &color_styles[0].name;
            let mut opts = vec![real_name.clone(), format!("{}-alt", real_name), "NonExistent-XYZ".into(), "Undefined/Color".into()];
            rng.shuffle(&mut opts);
            let ci = opts.iter().position(|o| o == real_name).unwrap_or(0);
            questions.push(QuizQuestion {
                id: id_counter, category: QuizCategory::StyleGuide,
                question: "Which is an actual color style in this file?".into(),
                options: opts, correct_index: ci,
                explanation: format!("'{}' is a defined color style.", real_name),
                difficulty: QuizDifficulty::Medium, related_id: None,
            });
            id_counter += 1;
        }
    }

    // Text styles
    let text_styles = styles.list_text_styles();
    if !text_styles.is_empty() {
        let (opts, ci) = make_opts(text_styles.len(), &[1, -1, 3]);
        questions.push(QuizQuestion {
            id: id_counter, category: QuizCategory::StyleGuide,
            question: "How many text styles are defined?".into(),
            options: opts, correct_index: ci,
            explanation: format!("{} text styles.", text_styles.len()),
            difficulty: QuizDifficulty::Easy, related_id: None,
        });
        id_counter += 1;
    }

    // Variable collections
    let collections = &scene.variable_collections;
    if !collections.is_empty() {
        let (opts, ci) = make_opts(collections.len(), &[1, -1, 2]);
        questions.push(QuizQuestion {
            id: id_counter, category: QuizCategory::DesignTokens,
            question: "How many variable collections exist?".into(),
            options: opts, correct_index: ci,
            explanation: format!("{} collection(s).", collections.len()),
            difficulty: QuizDifficulty::Easy, related_id: None,
        });
        id_counter += 1;

        for coll in collections.iter().take(3) {
            let mc = coll.modes.len();
            if mc >= 2 {
                let (opts, ci) = make_opts(mc, &[1, -1, 2]);
                questions.push(QuizQuestion {
                    id: id_counter, category: QuizCategory::DesignTokens,
                    question: format!("How many modes in '{}'?", coll.name),
                    options: opts, correct_index: ci,
                    explanation: format!("'{}' has {} mode(s).", coll.name, mc),
                    difficulty: QuizDifficulty::Medium, related_id: None,
                });
                id_counter += 1;
            }
        }
    }

    // Auto layout count
    let all_nodes: Vec<_> = scene.all_nodes().cloned().collect();
    let al_count = all_nodes.iter().filter(|n| n.layout.mode != crate::node::LayoutMode::None).count();
    if al_count > 0 {
        let (opts, ci) = make_opts(al_count, &[3, -2, 6]);
        questions.push(QuizQuestion {
            id: id_counter, category: QuizCategory::LayoutPatterns,
            question: "How many frames use auto layout?".into(),
            options: opts, correct_index: ci,
            explanation: format!("{} frames.", al_count),
            difficulty: QuizDifficulty::Medium, related_id: None,
        });
        id_counter += 1;
    }

    // Page count
    if scene.pages.len() >= 2 {
        let (opts, ci) = make_opts(scene.pages.len(), &[1, -1, 2]);
        questions.push(QuizQuestion {
            id: id_counter, category: QuizCategory::DesignSystem,
            question: "How many pages does this file have?".into(),
            options: opts, correct_index: ci,
            explanation: format!("{} pages.", scene.pages.len()),
            difficulty: QuizDifficulty::Easy, related_id: None,
        });
        id_counter += 1;
    }

    // A11y knowledge questions
    for (q, opts, ci, expl) in vec![
        ("What is the minimum WCAG AA contrast ratio for normal text?",
         vec!["3:1", "4.5:1", "7:1", "2:1"], 1,
         "WCAG AA requires 4.5:1 for normal text."),
        ("What is the recommended minimum touch target size?",
         vec!["24×24px", "32×32px", "44×44px", "56×56px"], 2,
         "WCAG 2.5.5 recommends 44×44px."),
        ("Which heading level for the main page title?",
         vec!["<h3>", "<h1>", "<h2>", "<h4>"], 1,
         "<h1> for proper document hierarchy."),
    ] {
        questions.push(QuizQuestion {
            id: id_counter, category: QuizCategory::Accessibility,
            question: q.into(),
            options: opts.into_iter().map(|s| s.into()).collect(),
            correct_index: ci, explanation: expl.into(),
            difficulty: QuizDifficulty::Hard, related_id: None,
        });
        id_counter += 1;
    }

    // Most common node kind
    let mut kind_counts: HashMap<&str, usize> = HashMap::new();
    for n in &all_nodes {
        let k = match &n.kind {
            NodeKind::Rect => "Rectangle",
            NodeKind::Ellipse => "Ellipse",
            NodeKind::Text { .. } => "Text",
            NodeKind::Frame => "Frame",
            NodeKind::Group => "Group",
            NodeKind::Image { .. } => "Image",
            NodeKind::Star { .. } => "Star",
            NodeKind::Polygon { .. } => "Polygon",
            NodeKind::Path { .. } => "Path",
            NodeKind::Section => "Section",
            _ => "Other",
        };
        *kind_counts.entry(k).or_default() += 1;
    }
    if let Some((&most_common, &count)) = kind_counts.iter().max_by_key(|(_,c)| *c) {
        let mut opts: Vec<String> = kind_counts.keys().take(4).map(|s| s.to_string()).collect();
        if !opts.contains(&most_common.to_string()) { 
            if !opts.is_empty() { opts[0] = most_common.to_string(); } else { opts.push(most_common.to_string()); }
        }
        while opts.len() < 4 {
            for fallback in &["Ellipse","Star","Polygon","Vector"] {
                if !opts.contains(&fallback.to_string()) { opts.push(fallback.to_string()); break; }
            }
            if opts.len() < 4 { opts.push(format!("Type{}", opts.len())); }
        }
        opts.truncate(4);
        let ci = opts.iter().position(|o| o == most_common).unwrap_or(0);
        questions.push(QuizQuestion {
            id: id_counter, category: QuizCategory::DesignSystem,
            question: "What is the most common node type?".into(),
            options: opts, correct_index: ci,
            explanation: format!("{} ({} nodes).", most_common, count),
            difficulty: QuizDifficulty::Medium, related_id: None,
        });
        id_counter += 1;
    }

    rng.shuffle(&mut questions);
    for (i, q) in questions.iter_mut().enumerate() { q.id = (i + 1) as u32; }
    questions
}

pub fn generate_review_checklist(scene: &Scene, components: &ComponentStore, styles: &StyleStore) -> Vec<ChecklistItem> {
    let mut items = Vec::new();
    let all_nodes: Vec<_> = scene.all_nodes().cloned().collect();

    // Component adoption
    let instance_count = all_nodes.iter().filter(|n| matches!(n.kind, NodeKind::Instance(_))).count();
    let total = all_nodes.len().max(1);
    let adoption = (instance_count as f64 / total as f64 * 100.0) as u32;
    items.push(ChecklistItem {
        category: "Components".into(),
        text: format!("Component adoption: {}% ({}/{})", adoption, instance_count, total),
        passed: adoption >= 30,
        suggestion: if adoption < 30 { Some("Extract repeated patterns into components.".into()) } else { None },
    });

    // Unused components
    let used_ids: std::collections::HashSet<u64> = all_nodes.iter().filter_map(|n| {
        if let NodeKind::Instance(data) = &n.kind { Some(data.component_id) } else { None }
    }).collect();
    let unused = components.list().iter().filter(|c| !used_ids.contains(&c.id)).count();
    items.push(ChecklistItem {
        category: "Components".into(),
        text: format!("{} unused component(s)", unused),
        passed: unused == 0,
        suggestion: if unused > 0 { Some("Remove or document unused components.".into()) } else { None },
    });

    // Styles
    let cs = styles.list_color_styles().len();
    items.push(ChecklistItem {
        category: "Styles".into(), text: format!("{} color styles", cs),
        passed: cs >= 3,
        suggestion: if cs < 3 { Some("Define color styles for consistency.".into()) } else { None },
    });
    let ts = styles.list_text_styles().len();
    items.push(ChecklistItem {
        category: "Styles".into(), text: format!("{} text styles", ts),
        passed: ts >= 2,
        suggestion: if ts < 2 { Some("Create text styles for headings/body.".into()) } else { None },
    });

    // Organization
    items.push(ChecklistItem {
        category: "Organization".into(), text: format!("{} page(s)", scene.pages.len()),
        passed: scene.pages.len() >= 2,
        suggestion: if scene.pages.len() < 2 { Some("Organize across multiple pages.".into()) } else { None },
    });

    let default_named = all_nodes.iter().filter(|n| {
        n.name.starts_with("Rectangle ") || n.name.starts_with("Ellipse ") || n.name.starts_with("Frame ") || n.name.starts_with("Group ")
    }).count();
    items.push(ChecklistItem {
        category: "Organization".into(), text: format!("{} default-named layers", default_named),
        passed: default_named == 0,
        suggestion: if default_named > 0 { Some("Rename layers for clarity.".into()) } else { None },
    });

    // Layout
    let al = all_nodes.iter().filter(|n| n.layout.mode != crate::node::LayoutMode::None).count();
    items.push(ChecklistItem {
        category: "Layout".into(), text: format!("{} auto layout frames", al),
        passed: al > 0,
        suggestion: if al == 0 { Some("Use auto layout for responsive designs.".into()) } else { None },
    });

    // Variables
    items.push(ChecklistItem {
        category: "Tokens".into(), text: format!("{} variable collection(s)", scene.variable_collections.len()),
        passed: !scene.variable_collections.is_empty(),
        suggestion: if scene.variable_collections.is_empty() { Some("Define variables for design tokens.".into()) } else { None },
    });

    items
}
