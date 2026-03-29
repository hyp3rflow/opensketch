/**
 * Persistent Measure Tool — click+drag to place permanent measurement lines on canvas.
 * Lines persist in scene (Rust engine), support px/rem/% units, and snap to node edges.
 */

import type { Editor } from "../editor";

export interface PersistentMeasureLine {
  id: number;
  start_x: number;
  start_y: number;
  end_x: number;
  end_y: number;
  unit: string;
  label: string;
  visible: boolean;
  page_id: number;
}

/** Snap threshold in screen pixels */
const SNAP_THRESHOLD = 8;

interface SnapTarget {
  x: number;
  y: number;
  label: string;
}

/**
 * Collect snap targets from all nodes (edges + centers).
 */
function collectSnapTargets(editor: Editor): SnapTarget[] {
  const targets: SnapTarget[] = [];
  const engine = editor.engine;
  const ids = engine.get_root_children();
  const addNode = (id: number) => {
    const info = engine.get_node_info(BigInt(id));
    if (!info) return;
    const n = JSON.parse(info);
    targets.push(
      { x: n.x, y: n.y, label: "edge" },
      { x: n.x + n.width, y: n.y, label: "edge" },
      { x: n.x, y: n.y + n.height, label: "edge" },
      { x: n.x + n.width, y: n.y + n.height, label: "edge" },
      { x: n.x + n.width / 2, y: n.y + n.height / 2, label: "center" },
      // Edge midpoints
      { x: n.x + n.width / 2, y: n.y, label: "edge" },
      { x: n.x + n.width / 2, y: n.y + n.height, label: "edge" },
      { x: n.x, y: n.y + n.height / 2, label: "edge" },
      { x: n.x + n.width, y: n.y + n.height / 2, label: "edge" },
    );
  };
  for (let i = 0; i < ids.length; i++) {
    addNode(Number(ids[i]));
  }
  return targets;
}

/**
 * Snap a scene point to the nearest snap target.
 */
function snapPoint(
  sceneX: number,
  sceneY: number,
  targets: SnapTarget[],
  zoom: number,
): { x: number; y: number; snapped: boolean } {
  let bestDist = Infinity;
  let bestX = sceneX;
  let bestY = sceneY;
  const thresh = SNAP_THRESHOLD / zoom;

  for (const t of targets) {
    const dx = Math.abs(t.x - sceneX);
    const dy = Math.abs(t.y - sceneY);
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist && dist < thresh) {
      bestDist = dist;
      bestX = t.x;
      bestY = t.y;
    }
  }
  return { x: bestX, y: bestY, snapped: bestDist < thresh };
}

/**
 * Get persistent measure lines from engine.
 */
export function getMeasureLines(editor: Editor): PersistentMeasureLine[] {
  try {
    const json = (editor.engine as any).get_measures();
    return JSON.parse(json);
  } catch {
    return [];
  }
}

/**
 * Render all persistent measure lines on the canvas.
 */
export function renderPersistentMeasures(
  ctx: CanvasRenderingContext2D,
  editor: Editor,
  zoom: number,
  panX: number,
  panY: number,
  selectedId?: number | null,
) {
  const lines = getMeasureLines(editor);
  if (lines.length === 0) return;

  ctx.save();

  for (const m of lines) {
    if (!m.visible) continue;

    const sx = m.start_x * zoom + panX;
    const sy = m.start_y * zoom + panY;
    const ex = m.end_x * zoom + panX;
    const ey = m.end_y * zoom + panY;

    const isSelected = selectedId != null && m.id === selectedId;

    // Dashed line
    ctx.strokeStyle = isSelected ? "#f97316" : "#00b4d8";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);

    // Selection glow
    if (isSelected) {
      ctx.strokeStyle = "#f97316";
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Endpoint circles
    ctx.fillStyle = isSelected ? "#f97316" : "#00b4d8";
    for (const [px, py] of [[sx, sy], [ex, ey]]) {
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Distance label pill
    const label = m.label || "";
    if (label) {
      const midX = (sx + ex) / 2;
      const midY = (sy + ey) / 2;

      ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, sans-serif";
      const tw = ctx.measureText(label).width + 10;
      const th = 18;

      // Offset label perpendicular to line
      const dx = ex - sx;
      const dy = ey - sy;
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = len > 0 ? -dy / len : 0;
      const ny = len > 0 ? dx / len : -1;
      const offset = 12;

      const lx = midX + nx * offset - tw / 2;
      const ly = midY + ny * offset - th / 2;

      // Background
      ctx.fillStyle = isSelected ? "#f97316" : "#00b4d8";
      ctx.beginPath();
      ctx.roundRect(lx, ly, tw, th, 4);
      ctx.fill();

      // Text
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, midX + nx * offset, midY + ny * offset);
    }
  }

  ctx.restore();
}

/**
 * State for the measure tool interaction.
 */
export class MeasureToolState {
  active = false;
  startX = 0;
  startY = 0;
  currentX = 0;
  currentY = 0;
  dragging = false;
  private snapTargets: SnapTarget[] = [];
  private _selectedId: number | null = null;

  get selectedMeasureId() { return this._selectedId; }
  set selectedMeasureId(id: number | null) { this._selectedId = id; }

  onPointerDown(editor: Editor, sceneX: number, sceneY: number, zoom: number) {
    this.snapTargets = collectSnapTargets(editor);
    const snapped = snapPoint(sceneX, sceneY, this.snapTargets, zoom);
    this.startX = snapped.x;
    this.startY = snapped.y;
    this.currentX = snapped.x;
    this.currentY = snapped.y;
    this.dragging = true;
  }

  onPointerMove(editor: Editor, sceneX: number, sceneY: number, zoom: number) {
    if (!this.dragging) return;
    const snapped = snapPoint(sceneX, sceneY, this.snapTargets, zoom);
    this.currentX = snapped.x;
    this.currentY = snapped.y;
  }

  onPointerUp(editor: Editor) {
    if (!this.dragging) return;
    this.dragging = false;

    const dx = this.currentX - this.startX;
    const dy = this.currentY - this.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 2) return; // Too short, ignore

    editor.engine.push_undo();
    const pageId = Number(editor.engine.get_active_page_id());
    // add_measure_line computes label automatically in Rust
    const id = Number(editor.engine.add_measure_line(
      this.startX, this.startY,
      this.currentX, this.currentY,
      BigInt(pageId),
    ));
    this._selectedId = id;
    editor.requestRender();
  }

  /** Render preview line while dragging */
  renderPreview(ctx: CanvasRenderingContext2D, zoom: number, panX: number, panY: number) {
    if (!this.dragging) return;

    const sx = this.startX * zoom + panX;
    const sy = this.startY * zoom + panY;
    const ex = this.currentX * zoom + panX;
    const ey = this.currentY * zoom + panY;

    ctx.save();
    ctx.strokeStyle = "#00b4d8";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);

    // Preview distance
    const dx = this.currentX - this.startX;
    const dy = this.currentY - this.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 5) {
      const midX = (sx + ex) / 2;
      const midY = (sy + ey) / 2;
      const label = `${dist.toFixed(1)}px`;
      ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, sans-serif";
      const tw = ctx.measureText(label).width + 10;
      const th = 18;
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = "#00b4d8";
      ctx.beginPath();
      ctx.roundRect(midX - tw / 2, midY - th - 6, tw, th, 4);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, midX, midY - th / 2 - 6);
    }

    // Endpoint dots
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "#00b4d8";
    for (const [px, py] of [[sx, sy], [ex, ey]]) {
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

/**
 * Hit-test persistent measure lines. Returns id of clicked line or null.
 */
export function hitTestMeasureLine(
  editor: Editor,
  sceneX: number,
  sceneY: number,
  zoom: number,
): number | null {
  const lines = getMeasureLines(editor);
  const thresh = 6 / zoom;

  for (const m of lines) {
    if (!m.visible) continue;
    // Point-to-segment distance
    const dx = m.end_x - m.start_x;
    const dy = m.end_y - m.start_y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1) continue;
    let t = ((sceneX - m.start_x) * dx + (sceneY - m.start_y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = m.start_x + t * dx;
    const py = m.start_y + t * dy;
    const dist = Math.sqrt((sceneX - px) ** 2 + (sceneY - py) ** 2);
    if (dist < thresh) return m.id;
  }
  return null;
}
