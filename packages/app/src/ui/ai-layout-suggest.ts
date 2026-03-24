/**
 * AI Layout Suggestion — analyzes selected nodes and suggests auto-layout settings.
 * Pure heuristic approach (no LLM API needed).
 */

import type { Editor } from "../editor";
import { icons } from "./icons";

export interface LayoutSuggestion {
  mode: "flex" | "grid";
  direction?: "row" | "column";
  gap: number;
  padding: { top: number; right: number; bottom: number; left: number };
  alignItems: "start" | "center" | "end" | "stretch";
  justifyContent: "start" | "center" | "end" | "space-between";
  gridColumns?: number;
  wrap?: boolean;
  confidence: number; // 0-1
  reason: string;
}

interface NodeRect {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: string;
}

/**
 * Analyze selected nodes and suggest auto-layout settings.
 */
export function suggestLayout(editor: Editor): LayoutSuggestion | null {
  const sel = Array.from(editor.engine.get_selection()).map(Number);
  if (sel.length < 2) return null;

  // Get node rects
  const nodes: NodeRect[] = [];
  for (const id of sel) {
    try {
      const json = editor.engine.get_node_json(BigInt(id));
      if (!json) continue;
      const n = JSON.parse(json);
      nodes.push({ id, x: n.x, y: n.y, w: n.width, h: n.height, kind: getKindStr(n.kind) });
    } catch { continue; }
  }

  if (nodes.length < 2) return null;

  // Sort by position
  const sortedX = [...nodes].sort((a, b) => a.x - b.x || a.y - b.y);
  const sortedY = [...nodes].sort((a, b) => a.y - b.y || a.x - b.x);

  // Check if arranged in a row (similar Y positions)
  const yValues = nodes.map(n => n.y);
  const yRange = Math.max(...yValues) - Math.min(...yValues);
  const avgHeight = nodes.reduce((s, n) => s + n.h, 0) / nodes.length;

  const xValues = nodes.map(n => n.x);
  const xRange = Math.max(...xValues) - Math.min(...xValues);
  const avgWidth = nodes.reduce((s, n) => s + n.w, 0) / nodes.length;

  const isRow = yRange < avgHeight * 0.5;
  const isColumn = xRange < avgWidth * 0.5;

  // Check for grid pattern
  const isGrid = !isRow && !isColumn && nodes.length >= 4;

  // Calculate gaps
  let suggestion: LayoutSuggestion;

  if (isGrid) {
    suggestion = analyzeGrid(sortedY, nodes);
  } else if (isRow) {
    suggestion = analyzeLinear(sortedX, "row");
  } else if (isColumn) {
    suggestion = analyzeLinear(sortedY, "column");
  } else {
    // Ambiguous — pick row or column based on spread
    const horizontalSpread = xRange / avgWidth;
    const verticalSpread = yRange / avgHeight;
    if (horizontalSpread > verticalSpread) {
      suggestion = analyzeLinear(sortedX, "row");
      suggestion.confidence *= 0.6;
      suggestion.reason += " (ambiguous arrangement)";
    } else {
      suggestion = analyzeLinear(sortedY, "column");
      suggestion.confidence *= 0.6;
      suggestion.reason += " (ambiguous arrangement)";
    }
  }

  return suggestion;
}

function analyzeLinear(sorted: NodeRect[], dir: "row" | "column"): LayoutSuggestion {
  const isRow = dir === "row";

  // Calculate gaps between consecutive nodes
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    const gap = isRow ? (curr.x - (prev.x + prev.w)) : (curr.y - (prev.y + prev.h));
    gaps.push(Math.max(0, Math.round(gap)));
  }

  // Average gap, rounded to nice values
  const avgGap = gaps.length > 0 ? gaps.reduce((s, g) => s + g, 0) / gaps.length : 0;
  const gap = roundToNice(avgGap);

  // Check gap consistency
  const gapVariance = gaps.length > 0
    ? gaps.reduce((s, g) => s + Math.abs(g - avgGap), 0) / gaps.length
    : 0;
  const isConsistent = gapVariance < avgGap * 0.3 + 2;

  // Detect alignment on cross axis
  const crossPositions = sorted.map(n => isRow ? n.y : n.x);
  const crossSizes = sorted.map(n => isRow ? n.h : n.w);
  const crossCenters = sorted.map((n, i) => crossPositions[i]! + crossSizes[i]! / 2);
  const crossEnds = sorted.map((n, i) => crossPositions[i]! + crossSizes[i]!);

  const startSpread = Math.max(...crossPositions) - Math.min(...crossPositions);
  const centerSpread = Math.max(...crossCenters) - Math.min(...crossCenters);
  const endSpread = Math.max(...crossEnds) - Math.min(...crossEnds);

  let alignItems: LayoutSuggestion["alignItems"] = "start";
  const minSpread = Math.min(startSpread, centerSpread, endSpread);
  if (minSpread === centerSpread) alignItems = "center";
  else if (minSpread === endSpread) alignItems = "end";

  // Check if all same size on cross axis → stretch
  const sizeSpread = Math.max(...crossSizes) - Math.min(...crossSizes);
  if (sizeSpread < 2) alignItems = "stretch";

  // Detect justify (check if evenly spaced)
  let justifyContent: LayoutSuggestion["justifyContent"] = "start";
  if (isConsistent && gap > 0) justifyContent = "start";

  const confidence = isConsistent ? 0.9 : 0.6;

  return {
    mode: "flex",
    direction: dir,
    gap,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    alignItems,
    justifyContent,
    confidence,
    reason: `${sorted.length} elements in a ${dir}, ~${gap}px gap, ${alignItems}-aligned`,
  };
}

function analyzeGrid(sorted: NodeRect[], nodes: NodeRect[]): LayoutSuggestion {
  // Group by approximate Y rows
  const rowThreshold = Math.min(...nodes.map(n => n.h)) * 0.5;
  const rows: NodeRect[][] = [];
  let currentRow: NodeRect[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const prev = currentRow[0]!;
    const curr = sorted[i]!;
    if (Math.abs(curr.y - prev.y) < rowThreshold) {
      currentRow.push(curr);
    } else {
      rows.push(currentRow.sort((a, b) => a.x - b.x));
      currentRow = [curr];
    }
  }
  rows.push(currentRow.sort((a, b) => a.x - b.x));

  // Detect column count
  const colCounts = rows.map(r => r.length);
  const maxCols = Math.max(...colCounts);

  // Calculate gaps
  const hGaps: number[] = [];
  const vGaps: number[] = [];
  for (const row of rows) {
    for (let i = 1; i < row.length; i++) {
      hGaps.push(Math.max(0, row[i]!.x - (row[i - 1]!.x + row[i - 1]!.w)));
    }
  }
  for (let i = 1; i < rows.length; i++) {
    const prevBottom = Math.max(...rows[i - 1]!.map(n => n.y + n.h));
    const currTop = Math.min(...rows[i]!.map(n => n.y));
    vGaps.push(Math.max(0, currTop - prevBottom));
  }

  const avgHGap = hGaps.length > 0 ? hGaps.reduce((s, g) => s + g, 0) / hGaps.length : 0;
  const avgVGap = vGaps.length > 0 ? vGaps.reduce((s, g) => s + g, 0) / vGaps.length : 0;
  const gap = roundToNice((avgHGap + avgVGap) / 2);

  return {
    mode: "grid",
    gridColumns: maxCols,
    gap,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    alignItems: "start",
    justifyContent: "start",
    confidence: 0.75,
    reason: `${nodes.length} elements in ${rows.length}×${maxCols} grid, ~${gap}px gap`,
  };
}

function roundToNice(v: number): number {
  if (v <= 2) return Math.round(v);
  if (v <= 6) return Math.round(v / 2) * 2;
  if (v <= 16) return Math.round(v / 4) * 4;
  if (v <= 32) return Math.round(v / 8) * 8;
  return Math.round(v / 16) * 16;
}

function getKindStr(kind: any): string {
  if (typeof kind === "string") return kind;
  if (typeof kind === "object") return Object.keys(kind)[0] || "Unknown";
  return "Unknown";
}

/**
 * Apply layout suggestion: wraps selected nodes in a frame with the suggested layout.
 */
export function applyLayoutSuggestion(editor: Editor, suggestion: LayoutSuggestion): number {
  const sel = Array.from(editor.engine.get_selection()).map(Number);
  if (sel.length < 2) return 0;

  editor.engine.push_undo();

  // Get bounding box of selected nodes
  const nodes: { id: number; x: number; y: number; w: number; h: number }[] = [];
  for (const id of sel) {
    try {
      const json = editor.engine.get_node_json(BigInt(id));
      if (!json) continue;
      const n = JSON.parse(json);
      nodes.push({ id, x: n.x, y: n.y, w: n.width, h: n.height });
    } catch { continue; }
  }

  const minX = Math.min(...nodes.map(n => n.x));
  const minY = Math.min(...nodes.map(n => n.y));
  const maxX = Math.max(...nodes.map(n => n.x + n.w));
  const maxY = Math.max(...nodes.map(n => n.y + n.h));

  const pad = suggestion.padding;
  const frameW = (maxX - minX) + pad.left + pad.right;
  const frameH = (maxY - minY) + pad.top + pad.bottom;

  // Create wrapping frame
  const frameId = Number(editor.engine.add_frame(minX - pad.left, minY - pad.top, frameW, frameH));
  editor.engine.set_node_name(BigInt(frameId), "Auto Layout Frame");

  // Reparent selected nodes into frame (order by position)
  const sorted = suggestion.direction === "column"
    ? [...nodes].sort((a, b) => a.y - b.y)
    : [...nodes].sort((a, b) => a.x - b.x);

  for (const n of sorted) {
    editor.engine.reparent_node(BigInt(n.id), BigInt(frameId));
  }

  // Apply layout settings
  editor.engine.set_layout_mode(BigInt(frameId), suggestion.mode);

  if (suggestion.mode === "flex" && suggestion.direction) {
    editor.engine.set_flex_direction(BigInt(frameId), suggestion.direction);
  }
  if (suggestion.mode === "grid" && suggestion.gridColumns) {
    editor.engine.set_grid_columns(BigInt(frameId), suggestion.gridColumns);
  }

  editor.engine.set_layout_gap(BigInt(frameId), suggestion.gap);
  editor.engine.set_layout_padding(BigInt(frameId), pad.top, pad.right, pad.bottom, pad.left);
  editor.engine.set_align_items(BigInt(frameId), suggestion.alignItems);
  editor.engine.set_justify_content(BigInt(frameId), suggestion.justifyContent);

  // Select the new frame
  editor.engine.deselect_all();
  editor.engine.select(BigInt(frameId));
  editor.requestRender();

  return frameId;
}

// ============================================================
// Floating suggestion card UI
// ============================================================

let currentOverlay: HTMLElement | null = null;

export function dismissSuggestion() {
  if (currentOverlay) {
    currentOverlay.remove();
    currentOverlay = null;
  }
}

export function showLayoutSuggestion(editor: Editor) {
  dismissSuggestion();

  const suggestion = suggestLayout(editor);
  if (!suggestion) return;

  const overlay = document.createElement("div");
  overlay.className = "ai-layout-suggestion";
  overlay.style.cssText = `
    position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
    background:#1e1e2e;border:1px solid #3a3a5a;border-radius:12px;
    padding:16px 20px;box-shadow:0 8px 32px rgba(0,0,0,0.5);
    z-index:10000;min-width:320px;max-width:420px;
    font-family:Inter,system-ui,sans-serif;animation:slideUp 0.2s ease-out;
  `;

  const confidenceColor = suggestion.confidence > 0.7 ? "#10b981" : suggestion.confidence > 0.4 ? "#f59e0b" : "#ef4444";
  const confidencePct = Math.round(suggestion.confidence * 100);

  const modeLabel = suggestion.mode === "grid"
    ? `Grid (${suggestion.gridColumns} cols)`
    : `Flex ${suggestion.direction}`;

  overlay.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
      <span style="font-size:18px;">✨</span>
      <span style="font-size:13px;font-weight:600;color:#e0e0ff;">Layout Suggestion</span>
      <span style="margin-left:auto;font-size:10px;color:${confidenceColor};background:${confidenceColor}20;padding:2px 8px;border-radius:10px;">${confidencePct}% match</span>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
      <span class="ai-tag">${modeLabel}</span>
      <span class="ai-tag">Gap: ${suggestion.gap}px</span>
      <span class="ai-tag">Align: ${suggestion.alignItems}</span>
      ${suggestion.justifyContent !== "start" ? `<span class="ai-tag">Justify: ${suggestion.justifyContent}</span>` : ""}
    </div>
    <div style="font-size:11px;color:#888;margin-bottom:14px;">${suggestion.reason}</div>
    <div style="display:flex;gap:8px;">
      <button class="ai-apply-btn" style="flex:1;">Apply Layout</button>
      <button class="ai-dismiss-btn" style="flex:0;">Dismiss</button>
    </div>
  `;

  // Inject tag styles
  const style = document.createElement("style");
  style.textContent = `
    @keyframes slideUp { from { opacity:0; transform:translateX(-50%) translateY(16px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
    .ai-tag { font-size:11px; color:#a5b4fc; background:#4f46e520; border:1px solid #4f46e540; padding:3px 10px; border-radius:8px; }
    .ai-apply-btn { padding:8px 16px; background:#4f46e5; color:white; border:none; border-radius:8px; cursor:pointer; font-size:12px; font-weight:600; transition:background 0.15s; }
    .ai-apply-btn:hover { background:#4338ca; }
    .ai-dismiss-btn { padding:8px 12px; background:#2a2a3a; color:#888; border:1px solid #3a3a4a; border-radius:8px; cursor:pointer; font-size:12px; transition:all 0.15s; }
    .ai-dismiss-btn:hover { color:#ccc; border-color:#555; }
  `;
  overlay.appendChild(style);

  overlay.querySelector(".ai-apply-btn")!.addEventListener("click", () => {
    applyLayoutSuggestion(editor, suggestion);
    dismissSuggestion();
    // Trigger UI refresh
    editor.requestRender();
  });

  overlay.querySelector(".ai-dismiss-btn")!.addEventListener("click", () => {
    dismissSuggestion();
  });

  document.body.appendChild(overlay);
  currentOverlay = overlay;

  // Auto-dismiss after 15s
  setTimeout(() => {
    if (currentOverlay === overlay) dismissSuggestion();
  }, 15000);
}

/**
 * Get suggestion as JSON (for LLM agent tool).
 */
export function suggestLayoutJSON(editor: Editor): string {
  const suggestion = suggestLayout(editor);
  if (!suggestion) return JSON.stringify({ error: "Select 2+ nodes to get layout suggestions" });
  return JSON.stringify(suggestion);
}
