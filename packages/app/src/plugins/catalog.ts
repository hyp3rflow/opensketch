/**
 * Plugin Marketplace Catalog
 * Built-in catalog of available plugins with metadata for browsing.
 */

import type { Plugin } from "./types";
import { LoremIpsumPlugin } from "./samples/lorem-ipsum";
import { ColorPalettePlugin } from "./samples/color-palette";
import { GridGeneratorPlugin } from "./samples/grid-generator";
import { AutoRenamePlugin } from "./samples/auto-rename";
import { AccessibilityCheckerPlugin } from "./samples/accessibility-checker";

export type PluginCategory = "All" | "Design" | "Layout" | "Text" | "Accessibility" | "Developer";

export interface CatalogEntry {
  plugin: Plugin;
  category: PluginCategory;
  author: string;
  downloads: number;  // simulated
  rating: number;     // 1-5 simulated
  tags: string[];
}

export const PLUGIN_CATALOG: CatalogEntry[] = [
  {
    plugin: LoremIpsumPlugin,
    category: "Text",
    author: "OpenSketch",
    downloads: 12400,
    rating: 4.7,
    tags: ["text", "placeholder", "lorem", "content"],
  },
  {
    plugin: ColorPalettePlugin,
    category: "Design",
    author: "OpenSketch",
    downloads: 9800,
    rating: 4.5,
    tags: ["color", "palette", "extract", "design"],
  },
  {
    plugin: GridGeneratorPlugin,
    category: "Layout",
    author: "OpenSketch",
    downloads: 7200,
    rating: 4.6,
    tags: ["grid", "layout", "generate", "rectangle"],
  },
  {
    plugin: AutoRenamePlugin,
    category: "Developer",
    author: "OpenSketch",
    downloads: 5100,
    rating: 4.3,
    tags: ["rename", "organize", "layers", "productivity"],
  },
  {
    plugin: AccessibilityCheckerPlugin,
    category: "Accessibility",
    author: "OpenSketch",
    downloads: 6300,
    rating: 4.8,
    tags: ["a11y", "accessibility", "contrast", "wcag"],
  },
];

export const ALL_CATEGORIES: PluginCategory[] = ["All", "Design", "Layout", "Text", "Accessibility", "Developer"];

export function searchCatalog(query: string, category: PluginCategory): CatalogEntry[] {
  let results = PLUGIN_CATALOG;
  if (category !== "All") {
    results = results.filter(e => e.category === category);
  }
  if (query.trim()) {
    const q = query.toLowerCase();
    results = results.filter(e =>
      e.plugin.name.toLowerCase().includes(q) ||
      (e.plugin.description || "").toLowerCase().includes(q) ||
      e.tags.some(t => t.includes(q))
    );
  }
  return results;
}
