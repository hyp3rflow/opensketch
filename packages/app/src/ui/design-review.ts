/**
 * Design Review — Checklist generation from scene analysis
 * Pure TS analysis: naming conventions, consistency, alignment, accessibility hints
 */
import type { Editor } from "../editor";

export interface ChecklistItem {
  id: string;
  category: "naming" | "consistency" | "alignment" | "accessibility" | "layout" | "components";
  severity: "info" | "warning" | "error";
  message: string;
  nodeIds?: number[];
  passed: boolean;
}

export function generateDesignReview(editor: Editor): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  let analysis: any;
  try {
    analysis = JSON.parse(editor.engine.get_scene_analysis());
  } catch {
    return [{ id: "err", category: "consistency", severity: "error", message: "Failed to analyze scene", passed: false }];
  }

  const names: string[] = analysis.node_names || [];
  const total = analysis.total_nodes || 0;
  const kinds = analysis.kind_distribution || {};

  // 1. Naming conventions
  const defaultNames = names.filter((n: string) => /^(Rect|Ellipse|Frame|Text|Group|Node)\s*\d*$/i.test(n));
  items.push({
    id: "naming-defaults",
    category: "naming",
    severity: defaultNames.length > 0 ? "warning" : "info",
    message: defaultNames.length > 0
      ? `${defaultNames.length} node(s) still have default names (e.g. "${defaultNames[0]}")`
      : "All nodes have meaningful names ✓",
    passed: defaultNames.length === 0,
  });

  // 2. Empty names
  const emptyNames = names.filter((n: string) => !n || n.trim() === "");
  if (emptyNames.length > 0) {
    items.push({
      id: "naming-empty",
      category: "naming",
      severity: "warning",
      message: `${emptyNames.length} node(s) have empty names`,
      passed: false,
    });
  }

  // 3. Component usage
  const compCount = analysis.component_count || 0;
  const instanceCount = analysis.instance_count || 0;
  items.push({
    id: "components-usage",
    category: "components",
    severity: compCount === 0 && total > 10 ? "warning" : "info",
    message: compCount === 0 && total > 10
      ? `No components defined despite ${total} nodes — consider creating reusable components`
      : `${compCount} component(s), ${instanceCount} instance(s)`,
    passed: !(compCount === 0 && total > 10),
  });

  // 4. Layout usage
  const layoutCount = analysis.layout_count || 0;
  const frameCount = kinds["Frame"] || 0;
  items.push({
    id: "layout-auto",
    category: "layout",
    severity: frameCount > 3 && layoutCount === 0 ? "warning" : "info",
    message: layoutCount > 0
      ? `${layoutCount}/${frameCount} frame(s) use auto-layout ✓`
      : frameCount > 3
        ? `No auto-layout used — consider using Flex/Grid for consistent spacing`
        : `${frameCount} frame(s), no auto-layout (OK for small designs)`,
    passed: !(frameCount > 3 && layoutCount === 0),
  });

  // 5. Notes/documentation
  const notesCount = analysis.notes_count || 0;
  items.push({
    id: "docs-notes",
    category: "accessibility",
    severity: "info",
    message: notesCount > 0
      ? `${notesCount} node(s) have documentation notes ✓`
      : "No documentation notes found — consider adding notes for handoff",
    passed: notesCount > 0,
  });

  // 6. Fill consistency
  const fillCount = analysis.fill_count || 0;
  items.push({
    id: "style-fills",
    category: "consistency",
    severity: "info",
    message: `${fillCount}/${total} node(s) have fills`,
    passed: true,
  });

  // 7. Scene complexity
  items.push({
    id: "complexity",
    category: "consistency",
    severity: total > 200 ? "warning" : "info",
    message: total > 200
      ? `Scene has ${total} nodes — consider breaking into pages/sections`
      : `Scene has ${total} nodes`,
    passed: total <= 200,
  });

  return items;
}

/** Format checklist as plain text for LLM consumption */
export function formatChecklist(items: ChecklistItem[]): string {
  const icon = (i: ChecklistItem) => i.passed ? "✅" : i.severity === "error" ? "❌" : "⚠️";
  const lines = items.map(i => `${icon(i)} [${i.category}] ${i.message}`);
  const passed = items.filter(i => i.passed).length;
  return `Design Review: ${passed}/${items.length} checks passed\n\n${lines.join("\n")}`;
}
