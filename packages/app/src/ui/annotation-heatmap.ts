/**
 * Annotation Heatmap — Visualizes comment/annotation density as a color heatmap overlay.
 * Shortcut: Cmd+Shift+H to toggle.
 * Uses engine.generate_annotation_heatmap() for grid data.
 */
import type { Editor } from "../editor";

interface HeatmapCell {
  x: number;
  y: number;
  width: number;
  height: number;
  density: number;  // 0~1 normalized
  count: number;
}

interface HeatmapData {
  cells: HeatmapCell[];
  max_density: number;
  total_comments: number;
  grid_size: number;
}

export class AnnotationHeatmap {
  private editor: Editor;
  private active = false;
  private data: HeatmapData | null = null;
  private cellSize = 150; // canvas units per cell
  private tooltip: HTMLDivElement | null = null;

  constructor(editor: Editor) {
    this.editor = editor;
  }

  toggle(): void {
    this.active = !this.active;
    if (this.active) {
      this.refresh();
    } else {
      this.data = null;
      this.removeTooltip();
    }
    this.editor.requestRender();
  }

  isActive(): boolean {
    return this.active;
  }

  refresh(): void {
    if (!this.active) return;
    try {
      const json = (this.editor.engine as any).generate_annotation_heatmap(this.cellSize);
      this.data = JSON.parse(json);
    } catch {
      this.data = null;
    }
  }

  setCellSize(size: number): void {
    this.cellSize = Math.max(50, Math.min(500, size));
    if (this.active) this.refresh();
    this.editor.requestRender();
  }

  /** Render heatmap overlay on the canvas (call from editor render loop) */
  render(ctx: CanvasRenderingContext2D, zoom: number, panX: number, panY: number): void {
    if (!this.active || !this.data || this.data.cells.length === 0) return;

    ctx.save();

    for (const cell of this.data.cells) {
      const sx = cell.x * zoom + panX;
      const sy = cell.y * zoom + panY;
      const sw = cell.width * zoom;
      const sh = cell.height * zoom;

      // Skip offscreen cells
      if (sx + sw < 0 || sy + sh < 0 || sx > ctx.canvas.width || sy > ctx.canvas.height) continue;

      // Color: low density = blue/green, high density = red/orange
      const color = this.densityColor(cell.density);
      ctx.fillStyle = color;
      ctx.fillRect(sx, sy, sw, sh);

      // Show count label for cells with enough screen space
      if (sw > 30 && sh > 20 && cell.count > 0) {
        ctx.fillStyle = cell.density > 0.5 ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.7)";
        ctx.font = `${Math.min(14, sw * 0.2)}px -apple-system, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(cell.count), sx + sw / 2, sy + sh / 2);
      }
    }

    // Legend
    this.renderLegend(ctx);

    ctx.restore();
  }

  private densityColor(d: number): string {
    // Gradient: transparent blue → green → yellow → red
    const alpha = 0.15 + d * 0.45; // 0.15 ~ 0.6
    if (d < 0.25) {
      // Blue to cyan
      const t = d / 0.25;
      return `rgba(${Math.round(50 - t * 20)}, ${Math.round(100 + t * 155)}, 255, ${alpha})`;
    } else if (d < 0.5) {
      // Cyan to green
      const t = (d - 0.25) / 0.25;
      return `rgba(${Math.round(30 + t * 100)}, ${Math.round(200 + t * 55)}, ${Math.round(255 - t * 155)}, ${alpha})`;
    } else if (d < 0.75) {
      // Green to yellow
      const t = (d - 0.5) / 0.25;
      return `rgba(${Math.round(130 + t * 125)}, ${Math.round(255 - t * 55)}, ${Math.round(100 - t * 100)}, ${alpha})`;
    } else {
      // Yellow to red
      const t = (d - 0.75) / 0.25;
      return `rgba(255, ${Math.round(200 - t * 160)}, ${Math.round(t * 30)}, ${alpha})`;
    }
  }

  private renderLegend(ctx: CanvasRenderingContext2D): void {
    if (!this.data) return;
    const w = 160, h = 50;
    const x = ctx.canvas.width - w - 16;
    const y = 16;

    // Background
    ctx.fillStyle = "rgba(30, 30, 30, 0.85)";
    ctx.beginPath();
    (ctx as any).roundRect(x, y, w, h, 8);
    ctx.fill();

    // Title
    ctx.fillStyle = "#ccc";
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`Annotations: ${this.data.total_comments}`, x + 10, y + 8);

    // Gradient bar
    const barX = x + 10, barY = y + 26, barW = w - 20, barH = 10;
    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    grad.addColorStop(0, "rgba(50, 100, 255, 0.6)");
    grad.addColorStop(0.33, "rgba(30, 200, 100, 0.6)");
    grad.addColorStop(0.66, "rgba(255, 200, 0, 0.6)");
    grad.addColorStop(1, "rgba(255, 40, 30, 0.6)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    (ctx as any).roundRect(barX, barY, barW, barH, 3);
    ctx.fill();

    // Labels
    ctx.fillStyle = "#888";
    ctx.font = "9px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Low", barX, barY + barH + 3);
    ctx.textAlign = "right";
    ctx.fillText("High", barX + barW, barY + barH + 3);
  }

  /** Handle mouse move for tooltip (call from editor) */
  handleMouseMove(canvasX: number, canvasY: number, zoom: number, panX: number, panY: number): void {
    if (!this.active || !this.data) {
      this.removeTooltip();
      return;
    }

    // Convert screen to scene coords
    const sceneX = (canvasX - panX) / zoom;
    const sceneY = (canvasY - panY) / zoom;

    const cell = this.data.cells.find(
      c => sceneX >= c.x && sceneX < c.x + c.width && sceneY >= c.y && sceneY < c.y + c.height
    );

    if (cell && cell.count > 0) {
      this.showTooltip(canvasX, canvasY, cell);
    } else {
      this.removeTooltip();
    }
  }

  private showTooltip(x: number, y: number, cell: HeatmapCell): void {
    if (!this.tooltip) {
      this.tooltip = document.createElement("div");
      this.tooltip.style.cssText = `
        position:fixed; padding:6px 10px; border-radius:6px;
        background:rgba(30,30,30,0.92); color:#e0e0e0; font-size:11px;
        pointer-events:none; z-index:10000; white-space:nowrap;
        box-shadow:0 2px 8px rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1);
      `;
      document.body.appendChild(this.tooltip);
    }
    this.tooltip.textContent = `${cell.count} annotation${cell.count > 1 ? "s" : ""} in this area`;
    this.tooltip.style.left = `${x + 12}px`;
    this.tooltip.style.top = `${y - 30}px`;
  }

  private removeTooltip(): void {
    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
    }
  }

  destroy(): void {
    this.removeTooltip();
    this.active = false;
    this.data = null;
  }
}
