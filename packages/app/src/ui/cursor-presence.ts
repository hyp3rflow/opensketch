/**
 * Cursor Presence Indicators
 * Simulates multi-user cursors on canvas for collaboration readiness.
 * Each remote cursor shows: colored arrow + name label + optional selection highlight.
 */

export interface RemoteCursor {
  id: string;
  name: string;
  color: string;
  /** Canvas (world) coordinates */
  x: number;
  y: number;
  /** Selected node IDs */
  selectedIds?: number[];
  /** Last update timestamp */
  lastSeen: number;
  /** Active tool name */
  tool?: string;
}

const CURSOR_COLORS = [
  '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7',
  '#fd79a8', '#00b894', '#e17055', '#0984e3', '#a29bfe',
];

const CURSOR_TIMEOUT_MS = 10_000; // fade out after 10s inactivity
const FADE_DURATION_MS = 2_000;

export class CursorPresence {
  private cursors: Map<string, RemoteCursor> = new Map();
  private colorIndex = 0;
  private localUserId: string;
  private localUserName: string;

  constructor(localUserId?: string, localUserName?: string) {
    this.localUserId = localUserId || `user-${Math.random().toString(36).slice(2, 8)}`;
    this.localUserName = localUserName || 'You';
  }

  /** Add or update a remote cursor */
  updateCursor(id: string, name: string, x: number, y: number, opts?: { selectedIds?: number[]; tool?: string }) {
    let cursor = this.cursors.get(id);
    if (!cursor) {
      cursor = {
        id, name,
        color: CURSOR_COLORS[this.colorIndex++ % CURSOR_COLORS.length],
        x, y,
        lastSeen: Date.now(),
      };
      this.cursors.set(id, cursor);
    }
    cursor.x = x;
    cursor.y = y;
    cursor.lastSeen = Date.now();
    if (opts?.selectedIds) cursor.selectedIds = opts.selectedIds;
    if (opts?.tool) cursor.tool = opts.tool;
  }

  removeCursor(id: string) {
    this.cursors.delete(id);
  }

  getCursors(): RemoteCursor[] {
    return Array.from(this.cursors.values());
  }

  /** Remove stale cursors */
  cleanup() {
    const now = Date.now();
    for (const [id, c] of this.cursors) {
      if (now - c.lastSeen > CURSOR_TIMEOUT_MS + FADE_DURATION_MS) {
        this.cursors.delete(id);
      }
    }
  }

  /** Render all remote cursors on the canvas */
  render(ctx: CanvasRenderingContext2D, zoom: number, panX: number, panY: number) {
    this.cleanup();
    const now = Date.now();

    for (const cursor of this.cursors.values()) {
      const age = now - cursor.lastSeen;
      let alpha = 1;
      if (age > CURSOR_TIMEOUT_MS) {
        alpha = 1 - Math.min(1, (age - CURSOR_TIMEOUT_MS) / FADE_DURATION_MS);
      }
      if (alpha <= 0) continue;

      // Convert world coords to screen coords
      const sx = cursor.x * zoom + panX;
      const sy = cursor.y * zoom + panY;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Draw cursor arrow
      this.drawCursorArrow(ctx, sx, sy, cursor.color);

      // Draw name label
      this.drawNameLabel(ctx, sx, sy, cursor.name, cursor.color);

      ctx.restore();
    }
  }

  /** Render selection highlights for remote cursors */
  renderSelectionHighlights(
    ctx: CanvasRenderingContext2D,
    zoom: number, panX: number, panY: number,
    getNodeBounds: (id: number) => { x: number; y: number; w: number; h: number } | null
  ) {
    const now = Date.now();
    for (const cursor of this.cursors.values()) {
      if (!cursor.selectedIds || cursor.selectedIds.length === 0) continue;
      const age = now - cursor.lastSeen;
      let alpha = 0.3;
      if (age > CURSOR_TIMEOUT_MS) {
        alpha *= 1 - Math.min(1, (age - CURSOR_TIMEOUT_MS) / FADE_DURATION_MS);
      }
      if (alpha <= 0) continue;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = cursor.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);

      for (const nid of cursor.selectedIds) {
        const b = getNodeBounds(nid);
        if (!b) continue;
        const rx = b.x * zoom + panX;
        const ry = b.y * zoom + panY;
        const rw = b.w * zoom;
        const rh = b.h * zoom;
        ctx.strokeRect(rx, ry, rw, rh);
      }

      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  private drawCursorArrow(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
    ctx.save();
    ctx.translate(x, y);

    // Arrow shape (Figma-style pointer)
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 16);
    ctx.lineTo(4.5, 12.5);
    ctx.lineTo(8, 20);
    ctx.lineTo(11, 19);
    ctx.lineTo(7.5, 11);
    ctx.lineTo(12, 10);
    ctx.closePath();

    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
  }

  private drawNameLabel(ctx: CanvasRenderingContext2D, x: number, y: number, name: string, color: string) {
    const labelX = x + 14;
    const labelY = y + 18;
    const fontSize = 11;
    const paddingH = 6;
    const paddingV = 3;

    ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    const metrics = ctx.measureText(name);
    const tw = metrics.width;
    const th = fontSize;

    const bgW = tw + paddingH * 2;
    const bgH = th + paddingV * 2;
    const radius = 4;

    // Rounded rect background
    ctx.beginPath();
    ctx.roundRect(labelX, labelY, bgW, bgH, radius);
    ctx.fillStyle = color;
    ctx.fill();

    // Text
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(name, labelX + paddingH, labelY + paddingV);
  }

  // --- Demo simulation helpers ---

  /** Start a demo simulation with fake remote cursors */
  startDemo(canvasWidth: number, canvasHeight: number): () => void {
    const demoUsers = [
      { id: 'demo-alice', name: 'Alice' },
      { id: 'demo-bob', name: 'Bob' },
      { id: 'demo-carol', name: 'Carol' },
    ];

    // Initialize positions
    for (const u of demoUsers) {
      this.updateCursor(u.id, u.name,
        200 + Math.random() * (canvasWidth - 400),
        200 + Math.random() * (canvasHeight - 400));
    }

    // Smooth random movement
    const targets: Map<string, { tx: number; ty: number }> = new Map();
    for (const u of demoUsers) {
      const c = this.cursors.get(u.id)!;
      targets.set(u.id, { tx: c.x, ty: c.y });
    }

    const interval = setInterval(() => {
      for (const u of demoUsers) {
        const cursor = this.cursors.get(u.id);
        if (!cursor) continue;
        const t = targets.get(u.id)!;

        // Pick new target occasionally
        if (Math.random() < 0.03) {
          t.tx = 100 + Math.random() * (canvasWidth - 200);
          t.ty = 100 + Math.random() * (canvasHeight - 200);
        }

        // Ease toward target
        const dx = t.tx - cursor.x;
        const dy = t.ty - cursor.y;
        const ease = 0.04;
        this.updateCursor(u.id, u.name, cursor.x + dx * ease, cursor.y + dy * ease);
      }
    }, 50);

    return () => {
      clearInterval(interval);
      for (const u of demoUsers) this.removeCursor(u.id);
    };
  }
}
