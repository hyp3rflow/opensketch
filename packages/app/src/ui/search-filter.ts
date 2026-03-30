/**
 * Canvas Object Search & Filter
 * Filter nodes by type, fill color, text content, font family, size range.
 * Matching nodes highlighted, non-matching dimmed (opacity reduction).
 * Click result → pan + select.
 */
import type { Editor } from '../editor';

let panel: HTMLDivElement | null = null;
let editorRef: Editor | null = null;
let matchedIds: Set<number> = new Set();
let allResults: SearchResult[] = [];
let filterActive = false;

interface SearchResult {
  id: number;
  name: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  matchReason: string;
}

export function toggleSearchFilter(editor: Editor) {
  editorRef = editor;
  if (panel) {
    closeSearchFilter();
    return;
  }
  openPanel();
}

export function closeSearchFilter() {
  clearDimming();
  if (panel) {
    panel.remove();
    panel = null;
  }
  matchedIds.clear();
  allResults = [];
  filterActive = false;
}

export function isSearchFilterOpen(): boolean {
  return panel != null;
}

/** Get the set of dimmed node IDs (for render overlay) */
export function getDimmedNodeIds(): Set<number> | null {
  if (!filterActive || matchedIds.size === 0) return null;
  return matchedIds;
}

function openPanel() {
  panel = document.createElement('div');
  panel.id = 'search-filter-panel';
  panel.innerHTML = `
    <div class="sf-header">
      <span class="sf-title">🔍 Search & Filter</span>
      <button class="sf-close" title="Close (Esc)">✕</button>
    </div>
    <div class="sf-body">
      <div class="sf-section">
        <label class="sf-label">Text Content</label>
        <input class="sf-input" id="sf-text" placeholder="Search text…" autocomplete="off"/>
      </div>
      <div class="sf-section">
        <label class="sf-label">Node Type</label>
        <select class="sf-select" id="sf-type">
          <option value="">All Types</option>
          <option value="Rect">Rectangle</option>
          <option value="Ellipse">Ellipse</option>
          <option value="Text">Text</option>
          <option value="Frame">Frame</option>
          <option value="Group">Group</option>
          <option value="Image">Image</option>
          <option value="Path">Path</option>
          <option value="Star">Star</option>
          <option value="Polygon">Polygon</option>
          <option value="Section">Section</option>
          <option value="Connector">Connector</option>
          <option value="Instance">Instance</option>
          <option value="Table">Table</option>
          <option value="Slice">Slice</option>
          <option value="VectorNetwork">Vector Network</option>
          <option value="StickyNote">Sticky Note</option>
        </select>
      </div>
      <div class="sf-section">
        <label class="sf-label">Fill Color</label>
        <div class="sf-row">
          <input class="sf-input sf-color-hex" id="sf-fill" placeholder="#rrggbb" autocomplete="off"/>
          <input type="color" id="sf-fill-picker" value="#ffffff" />
        </div>
      </div>
      <div class="sf-section">
        <label class="sf-label">Font Family</label>
        <input class="sf-input" id="sf-font" placeholder="e.g. Inter, Arial…" autocomplete="off"/>
      </div>
      <div class="sf-section">
        <label class="sf-label">Size Range (width)</label>
        <div class="sf-row">
          <input class="sf-input sf-size" id="sf-min-w" placeholder="Min W" type="number" min="0"/>
          <span class="sf-dash">–</span>
          <input class="sf-input sf-size" id="sf-max-w" placeholder="Max W" type="number" min="0"/>
        </div>
      </div>
      <div class="sf-section sf-checkboxes">
        <label class="sf-check-label"><input type="checkbox" id="sf-hidden"/> Include hidden</label>
        <label class="sf-check-label"><input type="checkbox" id="sf-locked"/> Locked only</label>
      </div>
      <div class="sf-actions">
        <button class="sf-btn sf-btn-primary" id="sf-apply">Filter</button>
        <button class="sf-btn" id="sf-clear">Clear</button>
        <span class="sf-count" id="sf-count"></span>
      </div>
      <div class="sf-results" id="sf-results"></div>
    </div>
  `;
  Object.assign(panel.style, {
    position: 'fixed',
    top: '60px',
    left: '280px',
    width: '300px',
    background: '#2a2a2a',
    borderRadius: '10px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    zIndex: '9999',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: '12px',
    color: '#eee',
    overflow: 'hidden',
  });
  document.body.appendChild(panel);
  setupPanelEvents();
  (panel.querySelector('#sf-text') as HTMLInputElement)?.focus();
}

function setupPanelEvents() {
  if (!panel) return;
  panel.querySelector('.sf-close')!.addEventListener('click', closeSearchFilter);

  // Color picker sync
  const fillHex = panel.querySelector('#sf-fill') as HTMLInputElement;
  const fillPicker = panel.querySelector('#sf-fill-picker') as HTMLInputElement;
  fillPicker.addEventListener('input', () => { fillHex.value = fillPicker.value; });
  fillHex.addEventListener('input', () => { try { fillPicker.value = fillHex.value; } catch {} });

  // Apply filter
  panel.querySelector('#sf-apply')!.addEventListener('click', applyFilter);
  panel.querySelector('#sf-clear')!.addEventListener('click', () => {
    clearDimming();
    clearInputs();
  });

  // Live filter on Enter
  panel.querySelectorAll('.sf-input, .sf-select').forEach(el => {
    el.addEventListener('keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter') applyFilter();
      if (ke.key === 'Escape') closeSearchFilter();
    });
  });
}

function clearInputs() {
  if (!panel) return;
  (panel.querySelector('#sf-text') as HTMLInputElement).value = '';
  (panel.querySelector('#sf-type') as HTMLSelectElement).value = '';
  (panel.querySelector('#sf-fill') as HTMLInputElement).value = '';
  (panel.querySelector('#sf-font') as HTMLInputElement).value = '';
  (panel.querySelector('#sf-min-w') as HTMLInputElement).value = '';
  (panel.querySelector('#sf-max-w') as HTMLInputElement).value = '';
  (panel.querySelector('#sf-count') as HTMLElement).textContent = '';
  (panel.querySelector('#sf-results') as HTMLElement).innerHTML = '';
  matchedIds.clear();
  allResults = [];
  filterActive = false;
}

function applyFilter() {
  if (!editorRef || !panel) return;
  const engine = editorRef.engine;

  const textQuery = (panel.querySelector('#sf-text') as HTMLInputElement).value.trim().toLowerCase();
  const typeFilter = (panel.querySelector('#sf-type') as HTMLSelectElement).value;
  const fillFilter = (panel.querySelector('#sf-fill') as HTMLInputElement).value.trim().toLowerCase();
  const fontFilter = (panel.querySelector('#sf-font') as HTMLInputElement).value.trim().toLowerCase();
  const minW = parseFloat((panel.querySelector('#sf-min-w') as HTMLInputElement).value) || 0;
  const maxW = parseFloat((panel.querySelector('#sf-max-w') as HTMLInputElement).value) || Infinity;

  const includeHidden = (panel.querySelector('#sf-hidden') as HTMLInputElement).checked;
  const lockedOnly = (panel.querySelector('#sf-locked') as HTMLInputElement).checked;

  const hasAnyFilter = textQuery || typeFilter || fillFilter || fontFilter || minW > 0 || maxW < Infinity || lockedOnly;
  if (!hasAnyFilter) {
    clearDimming();
    clearInputs();
    return;
  }

  // Get all nodes
  const layers: { id: number; name: string; kind: string; depth: number }[] = JSON.parse(engine.get_layer_list());
  matchedIds.clear();
  allResults = [];

  for (const layer of layers) {
    const nj = engine.get_node_json(BigInt(layer.id));
    if (!nj) continue;
    let node: any;
    try { node = JSON.parse(nj); } catch { continue; }

    const reasons: string[] = [];

    // Hidden filter: skip invisible nodes unless "Include hidden" is checked
    if (!includeHidden && node.visible === false) continue;

    // Locked filter: if "Locked only" is checked, skip unlocked nodes
    if (lockedOnly && !node.locked) continue;

    // Type filter
    if (typeFilter) {
      const kindStr = getKindString(node.kind);
      if (kindStr !== typeFilter) continue;
    }

    // Text content filter
    if (textQuery) {
      const nameMatch = (node.name || '').toLowerCase().includes(textQuery);
      const contentMatch = typeof node.kind === 'object' && node.kind.Text != null
        ? (node.kind.Text || '').toLowerCase().includes(textQuery)
        : false;
      if (!nameMatch && !contentMatch) continue;
      if (contentMatch) reasons.push('text');
      if (nameMatch) reasons.push('name');
    }

    // Fill color filter
    if (fillFilter) {
      const nodeColors = extractFillColors(node);
      const matchColor = nodeColors.some(c => c.toLowerCase().includes(fillFilter.replace('#', '')));
      if (!matchColor) continue;
      reasons.push('fill');
    }

    // Font family filter
    if (fontFilter) {
      const ff = (node.font_family || '').toLowerCase();
      if (!ff.includes(fontFilter)) continue;
      reasons.push('font');
    }

    // Size range filter
    const w = node.width || 0;
    if (w < minW || w > maxW) continue;
    if (minW > 0 || maxW < Infinity) reasons.push('size');

    matchedIds.add(layer.id);
    allResults.push({
      id: layer.id,
      name: node.name || `Node ${layer.id}`,
      kind: getKindString(node.kind),
      x: node.x || 0,
      y: node.y || 0,
      width: node.width || 0,
      height: node.height || 0,
      matchReason: reasons.join(', ') || 'match',
    });
  }

  filterActive = matchedIds.size > 0;

  // Update count
  const countEl = panel.querySelector('#sf-count') as HTMLElement;
  countEl.textContent = `${allResults.length} / ${layers.length} nodes`;

  renderResults();
  editorRef.requestRender();
}

function getKindString(kind: any): string {
  if (typeof kind === 'string') return kind;
  if (typeof kind === 'object' && kind !== null) {
    const keys = Object.keys(kind);
    return keys[0] || 'Unknown';
  }
  return 'Unknown';
}

function extractFillColors(node: any): string[] {
  const colors: string[] = [];
  if (node.fills && Array.isArray(node.fills)) {
    for (const fill of node.fills) {
      if (fill.fill_type === 'Solid' || fill.color) {
        const c = fill.color;
        if (c) {
          const hex = rgbaToHex(c.r, c.g, c.b);
          colors.push(hex);
        }
      }
    }
  } else if (node.fill) {
    const c = node.fill.color;
    if (c) {
      colors.push(rgbaToHex(c.r, c.g, c.b));
    }
  }
  return colors;
}

function rgbaToHex(r: number, g: number, b: number): string {
  return ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

function renderResults() {
  if (!panel) return;
  const container = panel.querySelector('#sf-results') as HTMLElement;
  if (allResults.length === 0) {
    container.innerHTML = '<div class="sf-empty">No matching nodes</div>';
    return;
  }
  container.innerHTML = allResults.map(r => `
    <div class="sf-result-item" data-id="${r.id}">
      <span class="sf-result-kind">${r.kind}</span>
      <span class="sf-result-name">${escapeHtml(r.name)}</span>
      <span class="sf-result-reason">${r.matchReason}</span>
    </div>
  `).join('');

  container.querySelectorAll('.sf-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = parseInt((item as HTMLElement).dataset.id || '0');
      if (!editorRef || !id) return;
      // Select and pan to node
      editorRef.engine.deselect_all();
      editorRef.engine.select(BigInt(id));
      editorRef.fireSelectionNow([id]);
      // Pan to center
      panToNode(id);
      editorRef.requestRender();
    });
  });
}

function panToNode(id: number) {
  if (!editorRef) return;
  try {
    const nj = editorRef.engine.get_node_json(BigInt(id));
    if (!nj) return;
    const node = JSON.parse(nj);
    const cx = (node.x || 0) + (node.width || 0) / 2;
    const cy = (node.y || 0) + (node.height || 0) / 2;
    const canvas = editorRef.canvas;
    const rect = canvas.getBoundingClientRect();
    const zoom = editorRef.engine.get_zoom();
    const targetPanX = rect.width / 2 - cx * zoom;
    const targetPanY = rect.height / 2 - cy * zoom;
    const currentPanX = editorRef.engine.get_pan_x();
    const currentPanY = editorRef.engine.get_pan_y();
    editorRef.engine.pan(targetPanX - currentPanX, targetPanY - currentPanY);
  } catch {}
}

function clearDimming() {
  matchedIds.clear();
  allResults = [];
  filterActive = false;
  editorRef?.requestRender();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Render dimming overlay on non-matching nodes.
 * Called from editor render loop.
 */
export function renderSearchFilterDimming(
  ctx: CanvasRenderingContext2D,
  editor: Editor,
) {
  if (!filterActive || matchedIds.size === 0) return;

  const engine = editor.engine;
  const zoom = engine.get_zoom();
  const panX = engine.get_pan_x();
  const panY = engine.get_pan_y();
  const layers: { id: number }[] = JSON.parse(engine.get_layer_list());

  for (const layer of layers) {
    if (matchedIds.has(layer.id)) {
      // Draw highlight border on matched nodes
      const nj = engine.get_node_json(BigInt(layer.id));
      if (!nj) continue;
      try {
        const node = JSON.parse(nj);
        const sx = node.x * zoom + panX;
        const sy = node.y * zoom + panY;
        const sw = node.width * zoom;
        const sh = node.height * zoom;
        ctx.save();
        ctx.strokeStyle = '#4a90d9';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.restore();
      } catch {}
    } else {
      // Dim non-matching nodes
      const nj = engine.get_node_json(BigInt(layer.id));
      if (!nj) continue;
      try {
        const node = JSON.parse(nj);
        const sx = node.x * zoom + panX;
        const sy = node.y * zoom + panY;
        const sw = node.width * zoom;
        const sh = node.height * zoom;
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(sx, sy, sw, sh);
        ctx.restore();
      } catch {}
    }
  }
}

// CSS injection
const style = document.createElement('style');
style.textContent = `
#search-filter-panel .sf-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 12px; background: #333; border-bottom: 1px solid #444;
}
#search-filter-panel .sf-title { font-weight: 600; font-size: 13px; }
#search-filter-panel .sf-close {
  background: none; border: none; color: #999; cursor: pointer; font-size: 14px; padding: 2px 4px;
}
#search-filter-panel .sf-close:hover { color: #fff; }
#search-filter-panel .sf-body { padding: 10px 12px; }
#search-filter-panel .sf-section { margin-bottom: 8px; }
#search-filter-panel .sf-label { display: block; font-size: 10px; color: #888; margin-bottom: 3px; text-transform: uppercase; letter-spacing: 0.5px; }
#search-filter-panel .sf-input {
  width: 100%; padding: 6px 8px; background: #1e1e1e; border: 1px solid #444; border-radius: 5px;
  color: #eee; font-size: 12px; outline: none; box-sizing: border-box;
}
#search-filter-panel .sf-input:focus { border-color: #4a90d9; }
#search-filter-panel .sf-select {
  width: 100%; padding: 6px 8px; background: #1e1e1e; border: 1px solid #444; border-radius: 5px;
  color: #eee; font-size: 12px; outline: none;
}
#search-filter-panel .sf-row { display: flex; gap: 6px; align-items: center; }
#search-filter-panel .sf-color-hex { flex: 1; }
#search-filter-panel input[type="color"] {
  width: 28px; height: 28px; border: 1px solid #555; border-radius: 4px; padding: 0; cursor: pointer; background: none; flex-shrink: 0;
}
#search-filter-panel .sf-size { width: 80px; flex: 1; }
#search-filter-panel .sf-dash { color: #666; }
#search-filter-panel .sf-actions { display: flex; gap: 6px; align-items: center; margin-top: 10px; margin-bottom: 8px; }
#search-filter-panel .sf-btn {
  padding: 5px 12px; background: #444; border: 1px solid #555; border-radius: 5px;
  color: #ddd; cursor: pointer; font-size: 11px;
}
#search-filter-panel .sf-btn:hover { background: #555; }
#search-filter-panel .sf-btn-primary { background: #4a90d9; border-color: #4a90d9; color: #fff; }
#search-filter-panel .sf-btn-primary:hover { background: #3a7bc8; }
#search-filter-panel .sf-count { font-size: 11px; color: #888; margin-left: auto; }
#search-filter-panel .sf-results { max-height: 240px; overflow-y: auto; }
#search-filter-panel .sf-result-item {
  display: flex; align-items: center; gap: 6px; padding: 5px 6px; border-radius: 4px; cursor: pointer;
}
#search-filter-panel .sf-result-item:hover { background: #3a3a3a; }
#search-filter-panel .sf-result-kind {
  font-size: 9px; color: #888; background: #333; padding: 1px 4px; border-radius: 3px; flex-shrink: 0;
}
#search-filter-panel .sf-result-name {
  font-size: 11px; color: #ccc; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
#search-filter-panel .sf-result-reason { font-size: 9px; color: #4a90d9; flex-shrink: 0; }
#search-filter-panel .sf-empty { text-align: center; color: #666; padding: 12px; font-size: 11px; }
#search-filter-panel .sf-checkboxes { display: flex; gap: 12px; }
#search-filter-panel .sf-check-label { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #aaa; cursor: pointer; }
#search-filter-panel .sf-check-label input { accent-color: #4a90d9; }
`;
document.head.appendChild(style);
