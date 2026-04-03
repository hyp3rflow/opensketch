/**
 * Artboard View — Multi-canvas bird's-eye view
 * Shows all pages simultaneously on the infinite canvas with labels, borders, and interaction.
 * Each page is rendered at its canvas_x/canvas_y position.
 */
import type { Engine } from "../wasm/opensketch_engine";

interface PageLayout {
  id: number;
  name: string;
  canvas_x: number;
  canvas_y: number;
  width: number;
  height: number;
}

export class ArtboardView {
  private engine: Engine;
  enabled = false;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  /** Toggle artboard view. Returns new enabled state. */
  toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  /** Get layout of all pages from the engine */
  private getLayouts(): PageLayout[] {
    try {
      return JSON.parse(this.engine.get_all_pages_layout()) as PageLayout[];
    } catch {
      return [];
    }
  }

  /**
   * Hit test: check if screen coordinates land on a page artboard.
   * Returns page id or null.
   */
  hitTest(
    screenX: number, screenY: number,
    zoom: number, panX: number, panY: number, dpr: number
  ): number | null {
    const layouts = this.getLayouts();
    // Convert screen coords to scene coords
    const sceneX = (screenX - panX) / zoom;
    const sceneY = (screenY - panY) / zoom;

    // Check in reverse order (last = top)
    for (let i = layouts.length - 1; i >= 0; i--) {
      const p = layouts[i];
      const labelH = 30 / zoom;
      if (
        sceneX >= p.canvas_x &&
        sceneX <= p.canvas_x + p.width &&
        sceneY >= p.canvas_y - labelH &&
        sceneY <= p.canvas_y + p.height
      ) {
        return p.id;
      }
    }
    return null;
  }

  /**
   * Render all pages in artboard view.
   * For each page: render content at canvas_x/canvas_y, draw border and label.
   */
  render(
    ctx: CanvasRenderingContext2D,
    zoom: number, panX: number, panY: number,
    canvasW: number, canvasH: number,
    activePageId: number, dpr: number,
  ) {
    const layouts = this.getLayouts();
    if (layouts.length === 0) return;

    // Render each page
    for (const page of layouts) {
      const sx = page.canvas_x * zoom + panX;
      const sy = page.canvas_y * zoom + panY;
      const sw = page.width * zoom;
      const sh = page.height * zoom;

      // Skip if completely off-screen
      if (sx + sw < 0 || sy + sh < 0 || sx > canvasW || sy > canvasH) continue;

      const isActive = page.id === activePageId;

      // Page background
      ctx.fillStyle = isActive ? "#1e1e1e" : "#252525";
      ctx.fillRect(sx, sy, sw, sh);

      // Render page content
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx, sy, sw, sh);
      ctx.clip();
      try {
        // Temporarily switch page and render
        // The engine's render_page uses its internal viewport transform,
        // so we need to set viewport to position this page correctly
        const pageZoom = zoom;
        const pagePanX = panX + page.canvas_x * zoom;
        const pagePanY = panY + page.canvas_y * zoom;
        this.engine.set_viewport(pageZoom, pagePanX, pagePanY);

        if (isActive) {
          this.engine.render(ctx);
        } else {
          this.engine.render_page(ctx, page.id);
        }
      } catch {
        // Fallback text
        ctx.fillStyle = "#555";
        ctx.font = `${Math.max(12, 16 * zoom)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(page.name, sx + sw / 2, sy + sh / 2);
      }
      ctx.restore();

      // Page border
      ctx.strokeStyle = isActive ? "#4d9eff" : "#555";
      ctx.lineWidth = isActive ? 2 : 1;
      ctx.strokeRect(sx, sy, sw, sh);

      // Active page glow
      if (isActive) {
        ctx.save();
        ctx.shadowColor = "#4d9eff";
        ctx.shadowBlur = 8;
        ctx.strokeStyle = "#4d9eff44";
        ctx.lineWidth = 1;
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.restore();
      }

      // Page name label (above the artboard)
      const fontSize = Math.max(11, Math.min(14, 13));
      ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = isActive ? "#4d9eff" : "#888";
      ctx.textBaseline = "bottom";
      ctx.textAlign = "left";
      ctx.fillText(page.name, sx, sy - 6);
    }
  }
}
