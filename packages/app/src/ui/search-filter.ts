/**
 * Canvas Object Search & Filter
 * Filter nodes by type, fill color, stroke color, opacity, text content, font family, size range.
 * Matching nodes highlighted (orange), non-matching dimmed (opacity reduction).
 * Click result → pan + select. "Select All Results" for batch selection.
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

/** Get the set of matched node IDs (for render overlay) */
export function getDimmedNodeIds(): Set<number> | null {
  if (!filterActive || matchedIds.size === 0) return null;
  return matchedIds;
}

function openPanel() {
  panel = document.createElement('div');
  panel.id = 'search-filter-panel';
  panel.innerHTML = `
    <div class="sf-header">
      <span class="sf-title">🔍 Object Filter</span>
      <button class="sf-close" title="Close (Esc)">✕</button>
    </div>
    <div class="sf-body">
      <div class="sf-section">
        <label class="sf-label">Name / Text</label>
        <input class="sf-input" id="sf-text" placeholder="Search name or text…" autocomplete="off"/>
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
          <option value="Callout">Callout</option>
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
        <label class="sf-label">Stroke Color</label>
        <div class="sf-row">
          <input class="sf-input sf-color-hex" id="sf-stroke" placeholder="#rrggbb" autocomplete="off"/>
          <input type="color" id="sf-stroke-picker" value="#ffffff" />
        </div>
      </div>
      <div class="sf-section">
        <label class="sf-label">Opacity Range</label>
        <div class="sf-row">
          <input class="sf-input sf-size" id="sf-opacity-min" placeholder="Min" type="number" min="0" max="1" step="0.1"/>
          <span class="sf-dash">–</span>
          <input class="sf-input sf-size" id="sf-opacity-max" placeholder="Max" type="number" min="0" max="1" step="0.1"/>
        </div>
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
        <label class="sf-check-label"><input type="checkbox" id="sf-text-only"/> Text nodes only</label>
      </div>
      <div class="sf-actions">
        <button class="sf-btn sf-btn-primary" id="sf-apply">Filter</button>
        <button class="sf-btn sf-btn-select-all" id="sf-select-all" title="Select all matching nodes">Select All</button>
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
    width: '310px',
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

  // Color picker syncs
  syncColorPicker('sf-fill', 'sf-fill-picker');
  syncColorPicker('sf-stroke', 'sf-stroke-picker');

  // Apply filter
  panel.querySelector('#sf-apply')!.addEventListener('click', applyFilter);
  panel.querySelector('#sf-select-all')!.addEventListener('click', selectAllResults);
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

function syncColorPicker(hexId: string, pickerId: string) {
  if (!panel) return;
  const hexEl = panel.querySelector(`#${hexId}`) as HTMLInputElement;
  const pickerEl = panel.querySelector(`#${pickerId}`) as HTMLInputElement;
  pickerEl.addEventListener('input', () => { hexEl.value = pickerEl.value; });
  hexEl.addEventListener('input', () => { try { pickerEl.value = hexEl.value; } catch {} });
}

function clearInputs() {
  if (!panel) return;
  (panel.querySelector('#sf-text') as HTMLInputElement).value = '';
  (panel.querySelector('#sf-type') as HTMLSelectElement).value = '';
  (panel.querySelector('#sf-fill') as HTMLInputElement).value = '';
  (panel.querySelector('#sf-stroke') as HTMLInputElement).value = '';
  (panel.querySelector('#sf-opacity-min') as HTMLInputElement).value = '';
  (panel.querySelector('#sf-opacity-max') as HTMLInputElement).value = '';
  (panel.querySelector('#sf-min-w') as HTMLInputElement).value = '';
  (panel.querySelector('#sf-max-w') as HTMLInputElement).value = '';
  (panel.querySelector('#sf-hidden') as HTMLInputElement).checked = false;
  (panel.querySelector('#sf-locked') as HTMLInputElement).checked = false;
  (panel.querySelector('#sf-text-only') as HTMLInputElement).checked = false;
  (panel.querySelector('#sf-count') as HTMLElement).textContent = '';
  (panel.querySelector('#sf-results') as HTMLElement).innerHTML = '';
  matchedIds.clear();
  allResults = [];
  filterActive = false;
}

function applyFilter() {
  if (!editorRef || !panel) return;
  const engine = editorRef.engine;

  const textQuery = (panel.querySelector('#sf-text') as HTMLInputElement).value.trim();
  const typeFilter = (panel.querySelector('#sf-type') as HTMLSelectElement).value;
  const fillFilter = (panel.querySelector('#sf-fill') as HTMLInputElement).value.trim();
  const strokeFilter = (panel.querySelector('#sf-stroke') as HTMLInputElement).value.trim();
  const opacityMin = parseFloat((panel.querySelector('#sf-opacity-min') as HTMLInputElement).value);
  const opacityMax = parseFloat((panel.querySelector('#sf-opacity-max') as HTMLInputElement).value);
  const minW = parseFloat((panel.querySelector('#sf-min-w') as HTMLInputElement).value) || 0;
  const maxW = parseFloat((panel.querySelector('#sf-max-w') as HTMLInputElement).value) || Infinity;
  const includeHidden = (panel.querySelector('#sf-hidden') as HTMLInputElement).checked;
  const lockedOnly = (panel.querySelector('#sf-locked') as HTMLInputElement).checked;
  const textOnly = (panel.querySelector('#sf-text-only') as HTMLInputElement).checked;

  const hasAnyFilter = textQuery || typeFilter || fillFilter || strokeFilter || !isNaN(opacityMin) || !isNaN(opacityMax) || minW > 0 || maxW < Infinity || lockedOnly || textOnly;
  if (!hasAnyFilter) {
    clearDimming();
    clearInputs();
    return;
  }

  // Build Rust filter criteria
  const criteria: any = {};
  if (typeFilter) criteria.kinds = [typeFilter];
  if (fillFilter) criteria.fill_color = fillFilter;
  if (strokeFilter) criteria.stroke_color = strokeFilter;
  if (!isNaN(opacityMin)) criteria.opacity_min = opacityMin;
  if (!isNaN(opacityMax)) criteria.opacity_max = opacityMax;
  if (!includeHidden) criteria.visible = true;
  if (lockedOnly) criteria.locked = true;
  if (textOnly) criteria.has_text = true;
  if (textQuery) criteria.name_pattern = textQuery;

  // Use Rust engine filter_nodes
  let rustIds: number[] = [];
  try {
    const raw = engine.filter_nodes(JSON.stringify(criteria));
    rustIds = JSON.parse(raw).map(Number);
  } catch {
    rustIds = [];
  }

  // Post-filter by size range (done in TS since Rust doesn't have it)
  matchedIds.clear();
  allResults = [];

  for (const id of rustIds) {
    try {
      const nj = engine.get_node_json(BigInt(id));
      if (!nj) continue;
      const node = JSON.parse(nj);
      const w = node.width || 0;
      if (w < minW || w > maxW) continue;

      matchedIds.add(id);
      allResults.push({
        id,
        name: node.name || `Node ${id}`,
        kind: getKindString(node.kind),
        x: node.x || 0,
        y: node.y || 0,
        width: node.width || 0,
        height: node.height || 0,
        matchReason: buildMatchReason(typeFilter, fillFilter, strokeFilter, textQuery, lockedOnly, textOnly, minW, maxW, opacityMin, opacityMax),
      });
    } catch {}
  }

  filterActive = matchedIds.size > 0;

  // Update count
  const countEl = panel.querySelector('#sf-count') as HTMLElement;
  countEl.textContent = `${allResults.length} found`;

  renderResults();
  editorRef.requestRender();
}

function buildMatchReason(type: string, fill: string, stroke: string, text: string, locked: boolean, textOnly: boolean, minW: number, maxW: number, oMin: number, oMax: number): string {
  const parts: string[] = [];
  if (type) parts.push('type');
  if (fill) parts.push('fill');
  if (stroke) parts.push('stroke');
  if (text) parts.push('name');
  if (locked) parts.push('locked');
  if (textOnly) parts.push('text');
  if (minW > 0 || maxW < Infinity) parts.push('size');
  if (!isNaN(oMin) || !isNaN(oMax)) parts.push('opacity');
  return parts.join(', ') || 'match';
}

function selectAllResults() {
  if (!editorRef || allResults.length === 0) return;
  const engine = editorRef.engine;
  engine.deselect_all();
  const ids: number[] = [];
  for (const r of allResults) {
    engine.select_node(BigInt(r.id));
    ids.push(r.id);
  }
  (editorRef as any).fireSelectionNow?.(ids);
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
      editorRef.engine.deselect_all();
      editorRef.engine.select_node(BigInt(id));
      (editorRef as any).fireSelectionNow?.([id]);
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
 * Render highlight overlay on matching nodes + dim non-matching.
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
    const nj = engine.get_node_json(BigInt(layer.id));
    if (!nj) continue;
    try {
      const node = JSON.parse(nj);
      const sx = node.x * zoom + panX;
      const sy = node.y * zoom + panY;
      const sw = node.width * zoom;
      const sh = node.height * zoom;

      if (matchedIds.has(layer.id)) {
        // Orange highlight border on matched nodes
        ctx.save();
        ctx.strokeStyle = '#ff8c00';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([]);
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.restore();
      } else {
        // Dim non-matching nodes
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(sx, sy, sw, sh);
        ctx.restore();
      }
    } catch {}
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
#search-filter-panel .sf-actions { display: flex; gap: 6px; align-items: center; margin-top: 10px; margin-bottom: 8px; flex-wrap: wrap; }
#search-filter-panel .sf-btn {
  padding: 5px 12px; background: #444; border: 1px solid #555; border-radius: 5px;
  color: #ddd; cursor: pointer; font-size: 11px;
}
#search-filter-panel .sf-btn:hover { background: #555; }
#search-filter-panel .sf-btn-primary { background: #4a90d9; border-color: #4a90d9; color: #fff; }
#search-filter-panel .sf-btn-primary:hover { background: #3a7bc8; }
#search-filter-panel .sf-btn-select-all { background: #ff8c00; border-color: #ff8c00; color: #fff; }
#search-filter-panel .sf-btn-select-all:hover { background: #e07b00; }
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
#search-filter-panel .sf-result-reason { font-size: 9px; color: #ff8c00; flex-shrink: 0; }
#search-filter-panel .sf-empty { text-align: center; color: #666; padding: 12px; font-size: 11px; }
#search-filter-panel .sf-checkboxes { display: flex; gap: 12px; flex-wrap: wrap; }
#search-filter-panel .sf-check-label { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #aaa; cursor: pointer; }
#search-filter-panel .sf-check-label input { accent-color: #4a90d9; }
`;
document.head.appendChild(style);
