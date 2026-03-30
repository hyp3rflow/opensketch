use crate::node::{Node, NodeId, NodeKind};
use std::collections::HashMap;

/// Categories of placeholder content
#[derive(Clone, Debug, PartialEq)]
pub enum ContentFillCategory {
    Names,
    Emails,
    Addresses,
    Dates,
    PhoneNumbers,
    LoremText,
    AvatarUrls,
    Numbers,
    Prices,
}

impl ContentFillCategory {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "names" => Some(Self::Names),
            "emails" => Some(Self::Emails),
            "addresses" => Some(Self::Addresses),
            "dates" => Some(Self::Dates),
            "phones" => Some(Self::PhoneNumbers),
            "lorem" => Some(Self::LoremText),
            "avatars" => Some(Self::AvatarUrls),
            "numbers" => Some(Self::Numbers),
            "prices" => Some(Self::Prices),
            _ => None,
        }
    }
}

/// Simple pseudo-random number generator (xorshift32)
struct Rng(u32);

impl Rng {
    fn new(seed: u32) -> Self {
        Rng(if seed == 0 { 1 } else { seed })
    }
    fn next(&mut self) -> u32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        x
    }
    fn pick<'a>(&mut self, items: &'a [&str]) -> &'a str {
        items[self.next() as usize % items.len()]
    }
}

const FIRST_NAMES: &[&str] = &[
    "Alice", "Bob", "Charlie", "Diana", "Edward", "Fiona", "George", "Hannah",
    "Ivan", "Julia", "Kevin", "Laura", "Michael", "Nina", "Oscar", "Paula",
    "Quinn", "Rachel", "Samuel", "Tina", "Ursula", "Victor", "Wendy", "Xavier",
    "Yuki", "Zoe", "Aria", "Benjamin", "Chloe", "Daniel",
];

const LAST_NAMES: &[&str] = &[
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Anderson", "Taylor", "Thomas", "Moore", "Jackson",
    "Martin", "Lee", "Perez", "Thompson", "White", "Harris", "Clark", "Lewis",
    "Robinson", "Walker", "Young", "King", "Wright", "Lopez", "Hill",
];

const DOMAINS: &[&str] = &[
    "gmail.com", "outlook.com", "yahoo.com", "company.io", "mail.com",
    "example.org", "work.co", "inbox.net",
];

const STREETS: &[&str] = &[
    "Oak St", "Maple Ave", "Cedar Ln", "Elm Dr", "Pine Rd",
    "Birch Way", "Walnut Blvd", "Cherry Ct", "Willow Pl", "Spruce Ter",
];

const CITIES: &[&str] = &[
    "New York", "San Francisco", "London", "Tokyo", "Berlin",
    "Paris", "Seoul", "Sydney", "Toronto", "Amsterdam",
];

const LOREM_WORDS: &[&str] = &[
    "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
    "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore",
    "magna", "aliqua", "enim", "ad", "minim", "veniam", "quis", "nostrud",
    "exercitation", "ullamco", "laboris", "nisi", "aliquip",
];

/// Generate `count` placeholder strings for the given category.
pub fn generate_content(category: &ContentFillCategory, count: usize, seed: u32) -> Vec<String> {
    let mut rng = Rng::new(seed.wrapping_add(category.as_u32() * 7 + 42));
    let mut results = Vec::with_capacity(count);

    for _ in 0..count {
        let s = match category {
            ContentFillCategory::Names => {
                format!("{} {}", rng.pick(FIRST_NAMES), rng.pick(LAST_NAMES))
            }
            ContentFillCategory::Emails => {
                let first = rng.pick(FIRST_NAMES).to_lowercase();
                let last = rng.pick(LAST_NAMES).to_lowercase();
                let domain = rng.pick(DOMAINS);
                format!("{}.{}@{}", first, last, domain)
            }
            ContentFillCategory::Addresses => {
                let num = (rng.next() % 9000 + 100) as u32;
                let street = rng.pick(STREETS);
                let city = rng.pick(CITIES);
                format!("{} {}, {}", num, street, city)
            }
            ContentFillCategory::Dates => {
                let year = 2020 + (rng.next() % 6) as u16;
                let month = (rng.next() % 12 + 1) as u8;
                let day = (rng.next() % 28 + 1) as u8;
                format!("{:04}-{:02}-{:02}", year, month, day)
            }
            ContentFillCategory::PhoneNumbers => {
                let a = rng.next() % 900 + 100;
                let b = rng.next() % 900 + 100;
                let c = rng.next() % 9000 + 1000;
                format!("({}) {}-{}", a, b, c)
            }
            ContentFillCategory::LoremText => {
                let word_count = (rng.next() % 15 + 5) as usize;
                let mut words = Vec::with_capacity(word_count);
                for _ in 0..word_count {
                    words.push(rng.pick(LOREM_WORDS).to_string());
                }
                // Capitalize first word
                if let Some(first) = words.first_mut() {
                    let mut c = first.chars();
                    if let Some(ch) = c.next() {
                        *first = ch.to_uppercase().to_string() + c.as_str();
                    }
                }
                format!("{}.", words.join(" "))
            }
            ContentFillCategory::AvatarUrls => {
                let id = rng.next() % 70 + 1;
                format!("https://i.pravatar.cc/150?img={}", id)
            }
            ContentFillCategory::Numbers => {
                let n = rng.next() % 10000;
                format!("{}", n)
            }
            ContentFillCategory::Prices => {
                let dollars = rng.next() % 999 + 1;
                let cents = rng.next() % 100;
                format!("${}.{:02}", dollars, cents)
            }
        };
        results.push(s);
    }
    results
}

// We need a numeric value for the category to use as seed offset
impl ContentFillCategory {
    fn as_u32(&self) -> u32 {
        match self {
            Self::Names => 0,
            Self::Emails => 1,
            Self::Addresses => 2,
            Self::Dates => 3,
            Self::PhoneNumbers => 4,
            Self::LoremText => 5,
            Self::AvatarUrls => 6,
            Self::Numbers => 7,
            Self::Prices => 8,
        }
    }
}

/// Fill selected nodes with content from the given category.
/// Text nodes get text content, Image nodes get avatar URLs.
/// Returns the number of nodes filled.
pub fn fill_nodes(
    nodes: &mut HashMap<NodeId, Node>,
    node_ids: &[NodeId],
    category: &ContentFillCategory,
    seed: u32,
) -> u32 {
    let count = node_ids.len();
    if count == 0 {
        return 0;
    }

    let contents = generate_content(category, count, seed);
    let mut filled = 0u32;

    for (i, &nid) in node_ids.iter().enumerate() {
        if let Some(node) = nodes.get_mut(&nid) {
            match &mut node.kind {
                NodeKind::Text { content, .. } => {
                    *content = contents[i].clone();
                    filled += 1;
                }
                NodeKind::Image { src, .. } => {
                    // For image nodes, use avatar URLs regardless of category
                    if *category == ContentFillCategory::AvatarUrls {
                        *src = contents[i].clone();
                    } else {
                        let avatar_contents = generate_content(&ContentFillCategory::AvatarUrls, 1, seed.wrapping_add(i as u32));
                        *src = avatar_contents[0].clone();
                    }
                    filled += 1;
                }
                _ => {
                    // Skip non-text, non-image nodes
                }
            }
        }
    }
    filled
}
