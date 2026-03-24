/**
 * Diff Overlay — Visual diff between two branches/versions
 * Shows added (green), modified (yellow), removed (red) nodes as translucent overlays on canvas.
 * Modes: highlight (colored rectangles), onion-skin (opacity slider)
 */
import type { Editor } from "../editor";

interface VisualDiffNode {
  id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  prev_x?: number;
  prev_y?: number;
  prev_width?: number;
  prev_height?: number;
}

interface VisualDiff {
  added: VisualDiffNode[];
  modified: VisualDiffNode[];
  removed: VisualDiffNode[];
}

interface DiffOverlayState {
  active: boolean;
  diff: VisualDiff | null;
  sourceBranchId: number;
  targetBranchId: number;
  opacity: number; // 0-1 for overlay opacity
  showLabels: boolean;
}

const COLORS = {
  added: { fill: "rgba(34, 197, 94, 0.20)", stroke: "#22c55e", label: "#16a34a" },
  modified: { fill: "rgba(234, 179, 8, 0.20)", stroke: "#eab308", label: "#ca8a04" },
  removed: { fill: "rgba(239, 68, 68, 0.20)", stroke: "#ef4444", label: "#dc2626" },
};

export function setupDiffOverlay(editor: Editor) {
  const state: DiffOverlayState = {
    active: false,
    diff: null,
    sourceBranchId: 0,
    targetBranchId: 0,
    opacity: 0.35,
    showLabels: true,
  };

  let panelEl: HTMLElement | null = null;

  function activate(sourceId: number, targetId: number) {
    try {
      const json = editor.engine.get_visual_diff(BigInt(sourceId), BigInt(targetId));
      state.diff = JSON.parse(json) as VisualDiff;
    } catch {
      state.diff = { added: [], modified: [], removed: [] };
    }
    state.sourceBranchId = sourceId;
    state.targetBranchId = targetId;
    state.active = true;
    showPanel();
    (editor as any).needsRender = true;
  }

  function activateBranchDiff(branchId: number) {
    try {
      const json = editor.engine.get_branch_visual_diff(BigInt(branchId));
      state.diff = JSON.parse(json) as VisualDiff;
    } catch {
      state.diff = { added: [], modified: [], removed: [] };
    }
    state.sourceBranchId = branchId;
    state.targetBranchId = branchId;
    state.active = true;
    showPanel();
    (editor as any).needsRender = true;
  }

  function deactivate() {
    state.active = false;
    state.diff = null;
    hidePanel();
    (editor as any).needsRender = true;
  }

  function showPanel() {
    hidePanel();
    const diff = state.diff;
    if (!diff) return;

    panelEl = document.createElement("div");
    panelEl.className = "diff-overlay-panel";
    panelEl.innerHTML = `
      <div class="diff-overlay-header">
        <span class="diff-overlay-title">⬡ Diff Overlay</span>
        <button class="diff-overlay-close" title="Close diff overlay">✕</button>
      </div>
      <div class="diff-overlay-stats">
        <span class="diff-stat diff-stat-added">+${diff.added.length} added</span>
        <span class="diff-stat diff-stat-modified">~${diff.modified.length} modified</span>
        <span class="diff-stat diff-stat-removed">-${diff.removed.length} removed</span>
      </div>
      <div class="diff-overlay-controls">
        <label class="diff-overlay-label">
          Opacity
          <input type="range" class="diff-opacity-slider" min="10" max="80" value="${Math.round(state.opacity * 100)}" />
        </label>
        <label class="diff-overlay-label">
          <input type="checkbox" class="diff-labels-check" ${state.showLabels ? "checked" : ""} />
          Show labels
        </label>
      </div>
      <div class="diff-overlay-list"></div>
    `;

    // Events
    panelEl.querySelector(".diff-overlay-close")!.addEventListener("click", deactivate);

    const slider = panelEl.querySelector(".diff-opacity-slider") as HTMLInputElement;
    slider.addEventListener("input", () => {
      state.opacity = parseInt(slider.value) / 100;
      (editor as any).needsRender = true;
    });

    const labelsCheck = panelEl.querySelector(".diff-labels-check") as HTMLInputElement;
    labelsCheck.addEventListener("change", () => {
      state.showLabels = labelsCheck.checked;
      (editor as any).needsRender = true;
    });

    // Node list
    const listEl = panelEl.querySelector(".diff-overlay-list")!;
    const renderList = (nodes: VisualDiffNode[], type: "added" | "modified" | "removed") => {
      nodes.forEach(n => {
        const row = document.createElement("div");
        row.className = `diff-node-row diff-node-${type}`;
        const prefix = type === "added" ? "+" : type === "removed" ? "−" : "~";
        row.textContent = `${prefix} ${n.name || `Node ${n.id}`}`;
        row.title = `${n.x.toFixed(0)}, ${n.y.toFixed(0)} — ${n.width.toFixed(0)}×${n.height.toFixed(0)}`;
        row.addEventListener("click", () => {
          // Pan to node
          const cx = n.x + n.width / 2;
          const cy = n.y + n.height / 2;
          const canvas = (editor as any).canvas as HTMLCanvasElement;
          if (canvas) {
            (editor as any).panX = canvas.width / 2 / ((editor as any).dpr || 1) - cx * (editor as any).zoom;
            (editor as any).panY = canvas.height / 2 / ((editor as any).dpr || 1) - cy * (editor as any).zoom;
            (editor as any).needsRender = true;
          }
        });
        listEl.appendChild(row);
      });
    };
    renderList(diff.added, "added");
    renderList(diff.modified, "modified");
    renderList(diff.removed, "removed");

    document.body.appendChild(panelEl);
  }

  function hidePanel() {
    if (panelEl) {
      panelEl.remove();
      panelEl = null;
    }
  }

  /** Called from the render loop to draw diff overlays on the canvas */
  function renderOverlay(ctx: CanvasRenderingContext2D, zoom: number, panX: number, panY: number) {
    if (!state.active || !state.diff) return;

    ctx.save();
    const diff = state.diff;
    const alpha = state.opacity;

    const drawRect = (n: VisualDiffNode, color: typeof COLORS.added) => {
      const sx = n.x * zoom + panX;
      const sy = n.y * zoom + panY;
      const sw = n.width * zoom;
      const sh = n.height * zoom;

      // Fill
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color.fill;
      ctx.fillRect(sx, sy, sw, sh);

      // Border
      ctx.globalAlpha = Math.min(alpha + 0.3, 0.9);
      ctx.strokeStyle = color.stroke;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.setLineDash([]);

      // Label
      if (state.showLabels && sw > 30 && sh > 14) {
        ctx.globalAlpha = 0.9;
        ctx.font = "10px Inter, system-ui, sans-serif";
        ctx.fillStyle = color.label;
        const label = n.name || `${n.id}`;
        const textW = ctx.measureText(label).width;

        // Pill background
        const px = sx + 3;
        const py = sy + 3;
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.roundRect(px, py, textW + 8, 14, 3);
        ctx.fill();
        ctx.fillStyle = color.label;
        ctx.fillText(label, px + 4, py + 10.5);
      }
    };

    // Draw removed first (underneath)
    diff.removed.forEach(n => drawRect(n, COLORS.removed));

    // Draw modified — also show previous position as ghost
    diff.modified.forEach(n => {
      if (n.prev_x != null && n.prev_y != null && n.prev_width != null && n.prev_height != null) {
        const ghost: VisualDiffNode = {
          ...n,
          x: n.prev_x,
          y: n.prev_y,
          width: n.prev_width,
          height: n.prev_height,
        };
        // Draw previous position as a faint outline
        const sx = ghost.x * zoom + panX;
        const sy = ghost.y * zoom + panY;
        const sw = ghost.width * zoom;
        const sh = ghost.height * zoom;
        ctx.globalAlpha = alpha * 0.5;
        ctx.strokeStyle = COLORS.modified.stroke;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.setLineDash([]);
      }
      drawRect(n, COLORS.modified);
    });

    // Draw added on top
    diff.added.forEach(n => drawRect(n, COLORS.added));

    ctx.restore();
  }

  return {
    activate,
    activateBranchDiff,
    deactivate,
    renderOverlay,
    isActive: () => state.active,
    getState: () => state,
  };
}
