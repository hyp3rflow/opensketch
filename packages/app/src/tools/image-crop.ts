/**
 * Image Crop Mode — Figma-style interactive image cropping
 * Double-click an Image node → enter crop mode
 * Drag handles to adjust crop region, drag inside to pan crop
 * Enter/Escape to confirm/cancel
 */

export interface CropState {
  nodeId: number;
  // Normalized crop rect (0-1 in source image space)
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  // Original crop (for cancel)
  origCropX: number;
  origCropY: number;
  origCropW: number;
  origCropH: number;
  // Node bounds in scene space
  nodeX: number;
  nodeY: number;
  nodeW: number;
  nodeH: number;
  // Aspect ratio lock
  lockAspect: boolean;
}

export type CropHandle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | 'move' | null;

const HANDLE_SIZE = 8; // screen pixels

export function hitTestCropHandle(
  state: CropState,
  screenX: number,
  screenY: number,
  zoom: number,
  panX: number,
  panY: number,
): CropHandle {
  // Convert crop rect to screen coords
  const { left, top, right, bottom } = cropToScreen(state, zoom, panX, panY);
  const hs = HANDLE_SIZE;

  // Corner handles
  if (Math.abs(screenX - left) < hs && Math.abs(screenY - top) < hs) return 'nw';
  if (Math.abs(screenX - right) < hs && Math.abs(screenY - top) < hs) return 'ne';
  if (Math.abs(screenX - left) < hs && Math.abs(screenY - bottom) < hs) return 'sw';
  if (Math.abs(screenX - right) < hs && Math.abs(screenY - bottom) < hs) return 'se';

  // Edge handles
  if (Math.abs(screenY - top) < hs && screenX > left + hs && screenX < right - hs) return 'n';
  if (Math.abs(screenY - bottom) < hs && screenX > left + hs && screenX < right - hs) return 's';
  if (Math.abs(screenX - left) < hs && screenY > top + hs && screenY < bottom - hs) return 'w';
  if (Math.abs(screenX - right) < hs && screenY > top + hs && screenY < bottom - hs) return 'e';

  // Inside crop → move
  if (screenX >= left && screenX <= right && screenY >= top && screenY <= bottom) return 'move';

  return null;
}

export function getCropCursor(handle: CropHandle): string {
  switch (handle) {
    case 'nw': case 'se': return 'nwse-resize';
    case 'ne': case 'sw': return 'nesw-resize';
    case 'n': case 's': return 'ns-resize';
    case 'e': case 'w': return 'ew-resize';
    case 'move': return 'move';
    default: return 'crosshair';
  }
}

export function applyCropDrag(
  state: CropState,
  handle: CropHandle,
  dx: number, // delta in scene space
  dy: number,
  shiftKey: boolean,
): void {
  // Convert scene delta to normalized delta
  const ndx = dx / state.nodeW;
  const ndy = dy / state.nodeH;

  if (handle === 'move') {
    // Pan crop within image
    let newX = state.cropX + ndx;
    let newY = state.cropY + ndy;
    // Clamp to [0, 1-cropW/H]
    newX = Math.max(0, Math.min(1 - state.cropW, newX));
    newY = Math.max(0, Math.min(1 - state.cropH, newY));
    state.cropX = newX;
    state.cropY = newY;
    return;
  }

  // Resize crop
  let { cropX: x, cropY: y, cropW: w, cropH: h } = state;
  const minSize = 0.02; // minimum 2% of image

  switch (handle) {
    case 'nw':
      x += ndx; y += ndy; w -= ndx; h -= ndy;
      break;
    case 'ne':
      y += ndy; w += ndx; h -= ndy;
      break;
    case 'sw':
      x += ndx; w -= ndx; h += ndy;
      break;
    case 'se':
      w += ndx; h += ndy;
      break;
    case 'n':
      y += ndy; h -= ndy;
      break;
    case 's':
      h += ndy;
      break;
    case 'w':
      x += ndx; w -= ndx;
      break;
    case 'e':
      w += ndx;
      break;
  }

  // Aspect ratio lock with shift
  if (shiftKey || state.lockAspect) {
    const origRatio = state.origCropW / state.origCropH;
    if (handle === 'n' || handle === 's') {
      w = h * origRatio;
    } else if (handle === 'e' || handle === 'w') {
      h = w / origRatio;
    } else {
      // Corner: use the larger axis
      if (Math.abs(ndx) > Math.abs(ndy)) {
        h = w / origRatio;
      } else {
        w = h * origRatio;
      }
    }
  }

  // Enforce minimum size
  if (w < minSize) { w = minSize; }
  if (h < minSize) { h = minSize; }

  // Clamp to image bounds [0,1]
  if (x < 0) { w += x; x = 0; }
  if (y < 0) { h += y; y = 0; }
  if (x + w > 1) { w = 1 - x; }
  if (y + h > 1) { h = 1 - y; }

  state.cropX = x;
  state.cropY = y;
  state.cropW = Math.max(minSize, w);
  state.cropH = Math.max(minSize, h);
}

function cropToScreen(
  state: CropState,
  zoom: number,
  panX: number,
  panY: number,
): { left: number; top: number; right: number; bottom: number } {
  // Crop is relative to the node's image. The node displays the full image
  // mapped to nodeX/Y/W/H. Crop rect in scene coords:
  const left = (state.nodeX + state.cropX * state.nodeW) * zoom + panX;
  const top = (state.nodeY + state.cropY * state.nodeH) * zoom + panY;
  const right = (state.nodeX + (state.cropX + state.cropW) * state.nodeW) * zoom + panX;
  const bottom = (state.nodeY + (state.cropY + state.cropH) * state.nodeH) * zoom + panY;
  return { left, top, right, bottom };
}

export function renderCropOverlay(
  ctx: CanvasRenderingContext2D,
  state: CropState,
  zoom: number,
  panX: number,
  panY: number,
): void {
  const { left, top, right, bottom } = cropToScreen(state, zoom, panX, panY);
  const nodeLeft = state.nodeX * zoom + panX;
  const nodeTop = state.nodeY * zoom + panY;
  const nodeRight = (state.nodeX + state.nodeW) * zoom + panX;
  const nodeBottom = (state.nodeY + state.nodeH) * zoom + panY;

  // Dim outside crop area (but within node bounds)
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  // Top strip
  ctx.fillRect(nodeLeft, nodeTop, nodeRight - nodeLeft, top - nodeTop);
  // Bottom strip
  ctx.fillRect(nodeLeft, bottom, nodeRight - nodeLeft, nodeBottom - bottom);
  // Left strip
  ctx.fillRect(nodeLeft, top, left - nodeLeft, bottom - top);
  // Right strip
  ctx.fillRect(right, top, nodeRight - right, bottom - top);
  ctx.restore();

  // Crop border
  ctx.save();
  ctx.strokeStyle = '#4a90ff';
  ctx.lineWidth = 2;
  ctx.strokeRect(left, top, right - left, bottom - top);

  // Rule of thirds grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  const w = right - left;
  const h = bottom - top;
  for (let i = 1; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(left + (w * i) / 3, top);
    ctx.lineTo(left + (w * i) / 3, bottom);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(left, top + (h * i) / 3);
    ctx.lineTo(right, top + (h * i) / 3);
    ctx.stroke();
  }

  // Corner handles
  const hs = HANDLE_SIZE;
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#4a90ff';
  ctx.lineWidth = 2;

  const handles = [
    [left, top], [right, top], [left, bottom], [right, bottom], // corners
    [left + w / 2, top], [left + w / 2, bottom], // edges
    [left, top + h / 2], [right, top + h / 2],
  ];

  for (const [hx, hy] of handles) {
    ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
    ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
  }

  // Size label
  const cropPctW = Math.round(state.cropW * 100);
  const cropPctH = Math.round(state.cropH * 100);
  const label = `${cropPctW}% × ${cropPctH}%`;
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  const tm = ctx.measureText(label);
  const lx = left + w / 2 - tm.width / 2 - 4;
  const ly = bottom + 6;
  ctx.fillRect(lx, ly, tm.width + 8, 18);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, lx + 4, ly + 13);

  ctx.restore();
}
