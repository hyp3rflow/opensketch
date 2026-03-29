/**
 * Component Variant Matrix View
 *
 * Displays all variant combinations of a component in a grid layout.
 * - Row axis: first variant property
 * - Column axis: second variant property
 * - Extra properties (3+): filter dropdowns
 * - Each cell renders a mini canvas preview of that variant
 */
import type { Editor } from '../editor';

let overlay: HTMLDivElement | null = null;
let editorRef: Editor | null = null;
let currentCompId: number = 0;
let matrixInstances: number[] = [];
let extraValues: Record<string, string> = {};

interface MatrixAxis {
  name: string;
  values: string[];
}

interface MatrixCell {
  row: number;
  col: number;
  variant_key_json: string;
  label: string;
  exists: boolean;
}

interface VariantMatrix {
  component_id: number;
  component_name: string;
  row_prop: MatrixAxis | null;
  col_prop: MatrixAxis | null;
  extra_props: MatrixAxis[];
  cells: MatrixCell[];
  row_count: number;
  col_count: number;
}

export function isVariantMatrixOpen(): boolean {
  return overlay !== null;
}

export function closeVariantMatrix() {
  cleanupInstances();
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
  editorRef = null;
  currentCompId = 0;
  extraValues = {};
}

function cleanupInstances() {
  if (editorRef) {
    for (const id of matrixInstances) {
      try { editorRef.engine.remove_playground_instance(BigInt(id)); } catch {}
    }
  }
  matrixInstances = [];
}

export function openVariantMatrix(editor: Editor, compId: number) {
  if (overlay) closeVariantMatrix();
  editorRef = editor;
  currentCompId = compId;
  extraValues = {};
  buildOverlay();
}

function getMatrix(): VariantMatrix | null {
  if (!editorRef) return null;
  const extraJson = Object.keys(extraValues).length > 0 ? JSON.stringify(extraValues) : '';
  const raw = editorRef.engine.get_variant_matrix(BigInt(currentCompId), extraJson);
  if (!raw || raw === 'null') return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function buildOverlay() {
  const matrix = getMatrix();
  if (!matrix) return;

  overlay = document.createElement('div');
  overlay.id = 'variant-matrix-overlay';
  Object.assign(overlay.style, {
    position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
    background: 'rgba(0,0,0,0.85)', zIndex: '10000',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', color: '#eee',
  });

  overlay.innerHTML = buildHTML(matrix);
  document.body.appendChild(overlay);
  setupEvents(matrix);
  renderPreviews(matrix);
}

function buildHTML(matrix: VariantMatrix): string {
  // Header
  let html = `
    <div class="vm-header">
      <div class="vm-title">${escHtml(matrix.component_name)} — Variant Matrix</div>
      <div class="vm-filters">${buildFilters(matrix)}</div>
      <button class="vm-close" title="Close (Esc)">✕</button>
    </div>
    <div class="vm-grid-wrapper">
  `;

  // Column headers
  if (matrix.col_prop) {
    html += `<div class="vm-grid-row vm-header-row">`;
    html += `<div class="vm-corner">${matrix.row_prop ? escHtml(matrix.row_prop.name) + ' ╲ ' + escHtml(matrix.col_prop.name) : ''}</div>`;
    for (const cv of matrix.col_prop.values) {
      html += `<div class="vm-col-header">${escHtml(cv)}</div>`;
    }
    html += `</div>`;
  }

  // Rows
  for (let r = 0; r < matrix.row_count; r++) {
    html += `<div class="vm-grid-row">`;
    if (matrix.row_prop) {
      html += `<div class="vm-row-header">${escHtml(matrix.row_prop.values[r])}</div>`;
    }
    for (let c = 0; c < matrix.col_count; c++) {
      const cell = matrix.cells[r * matrix.col_count + c];
      const cls = cell.exists ? 'vm-cell' : 'vm-cell vm-cell-empty';
      html += `<div class="${cls}" data-row="${r}" data-col="${c}" data-key='${escAttr(cell.variant_key_json)}'>
        <canvas class="vm-cell-canvas" width="160" height="120"></canvas>
        ${!cell.exists ? '<div class="vm-cell-missing">No variant</div>' : ''}
      </div>`;
    }
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

function buildFilters(matrix: VariantMatrix): string {
  if (matrix.extra_props.length === 0) return '';
  return matrix.extra_props.map(ep => {
    const current = extraValues[ep.name] || ep.values[0] || '';
    const opts = ep.values.map(v =>
      `<option value="${escAttr(v)}" ${v === current ? 'selected' : ''}>${escHtml(v)}</option>`
    ).join('');
    return `<label class="vm-filter-label">${escHtml(ep.name)}:
      <select class="vm-filter-select" data-prop="${escAttr(ep.name)}">${opts}</select>
    </label>`;
  }).join('');
}

function setupEvents(matrix: VariantMatrix) {
  if (!overlay) return;

  // Close button
  overlay.querySelector('.vm-close')?.addEventListener('click', closeVariantMatrix);

  // Escape key
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { closeVariantMatrix(); document.removeEventListener('keydown', onKey); }
  };
  document.addEventListener('keydown', onKey);

  // Filter changes
  overlay.querySelectorAll('.vm-filter-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const prop = (sel as HTMLSelectElement).dataset.prop!;
      extraValues[prop] = (sel as HTMLSelectElement).value;
      // Rebuild
      cleanupInstances();
      if (overlay) overlay.remove();
      overlay = null;
      buildOverlay();
    });
  });

  // Cell click → select variant in editor
  overlay.querySelectorAll('.vm-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const keyJson = (cell as HTMLElement).dataset.key;
      if (!keyJson || !editorRef) return;
      // Create instance in editor and close matrix
      const instId = Number(editorRef.engine.create_playground_instance(
        BigInt(currentCompId), keyJson
      ));
      if (instId > 0) {
        matrixInstances.push(instId);
      }
    });
  });
}

function renderPreviews(matrix: VariantMatrix) {
  if (!overlay || !editorRef) return;
  const engine = editorRef.engine;

  const canvases = overlay.querySelectorAll('.vm-cell-canvas');
  canvases.forEach((cvs, idx) => {
    const cell = matrix.cells[idx];
    if (!cell.exists) return;

    // Create a temporary instance to read its render
    const instId = Number(engine.create_playground_instance(
      BigInt(currentCompId), cell.variant_key_json
    ));
    if (instId === 0) return;

    const canvas = cvs as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) { engine.remove_playground_instance(BigInt(instId)); return; }

    // Get instance bounds
    try {
      const nj = engine.get_node_json(BigInt(instId));
      if (nj) {
        const node = JSON.parse(nj);
        const nw = node.width || 100;
        const nh = node.height || 80;

        // Scale to fit 160x120 with padding
        const maxW = 150, maxH = 110;
        const scale = Math.min(maxW / nw, maxH / nh, 2);
        const ox = (160 - nw * scale) / 2;
        const oy = (120 - nh * scale) / 2;

        ctx.clearRect(0, 0, 160, 120);
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, 160, 120);

        // Draw a simplified preview rectangle with fill color
        const fills = node.fills || [];
        if (fills.length > 0 && fills[0].color) {
          const c = fills[0].color;
          ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${c.a ?? 1})`;
        } else {
          ctx.fillStyle = '#555';
        }

        const cr = Math.min(node.corner_radius || 0, nw / 2, nh / 2) * scale;
        roundRect(ctx, ox, oy, nw * scale, nh * scale, cr);
        ctx.fill();

        // Stroke if present
        if (node.strokes && node.strokes.length > 0) {
          const s = node.strokes[0];
          ctx.strokeStyle = `rgba(${s.color?.r || 0},${s.color?.g || 0},${s.color?.b || 0},${s.color?.a ?? 1})`;
          ctx.lineWidth = Math.max(1, (s.width || 1) * scale);
          roundRect(ctx, ox, oy, nw * scale, nh * scale, cr);
          ctx.stroke();
        }

        // Label
        ctx.fillStyle = '#999';
        ctx.font = '9px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(nw)}×${Math.round(nh)}`, 80, 116);
      }
    } catch {}

    engine.remove_playground_instance(BigInt(instId));
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
}

// CSS
const style = document.createElement('style');
style.textContent = `
#variant-matrix-overlay .vm-header {
  display: flex; align-items: center; gap: 16px;
  padding: 14px 24px; width: 100%; box-sizing: border-box;
  background: rgba(30,30,30,0.95); border-bottom: 1px solid #444;
  flex-shrink: 0;
}
#variant-matrix-overlay .vm-title { font-size: 15px; font-weight: 600; flex-shrink: 0; }
#variant-matrix-overlay .vm-filters { display: flex; gap: 12px; flex: 1; }
#variant-matrix-overlay .vm-filter-label { font-size: 11px; color: #aaa; display: flex; align-items: center; gap: 4px; }
#variant-matrix-overlay .vm-filter-select {
  background: #333; border: 1px solid #555; border-radius: 4px; color: #eee;
  padding: 3px 6px; font-size: 11px;
}
#variant-matrix-overlay .vm-close {
  background: none; border: none; color: #999; cursor: pointer; font-size: 18px;
  padding: 4px 8px; flex-shrink: 0;
}
#variant-matrix-overlay .vm-close:hover { color: #fff; }
#variant-matrix-overlay .vm-grid-wrapper {
  flex: 1; overflow: auto; padding: 24px;
  display: flex; flex-direction: column; gap: 2px; align-items: flex-start;
}
#variant-matrix-overlay .vm-grid-row { display: flex; gap: 2px; }
#variant-matrix-overlay .vm-header-row { margin-bottom: 4px; }
#variant-matrix-overlay .vm-corner {
  width: 100px; height: 32px; display: flex; align-items: center; justify-content: center;
  font-size: 10px; color: #777; flex-shrink: 0;
}
#variant-matrix-overlay .vm-col-header {
  width: 164px; height: 32px; display: flex; align-items: center; justify-content: center;
  font-size: 11px; color: #aaa; font-weight: 500; flex-shrink: 0;
}
#variant-matrix-overlay .vm-row-header {
  width: 100px; height: 124px; display: flex; align-items: center; justify-content: center;
  font-size: 11px; color: #aaa; font-weight: 500; flex-shrink: 0;
}
#variant-matrix-overlay .vm-cell {
  width: 164px; height: 124px; border-radius: 8px; overflow: hidden;
  border: 1px solid #444; cursor: pointer; position: relative; flex-shrink: 0;
  transition: border-color 0.15s;
}
#variant-matrix-overlay .vm-cell:hover { border-color: #4a90d9; }
#variant-matrix-overlay .vm-cell-empty { border-style: dashed; opacity: 0.4; }
#variant-matrix-overlay .vm-cell-canvas { width: 100%; height: 100%; display: block; }
#variant-matrix-overlay .vm-cell-missing {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  font-size: 10px; color: #666;
}
`;
document.head.appendChild(style);
