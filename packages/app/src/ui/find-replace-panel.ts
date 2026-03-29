import type { Editor } from '../editor';

let panel: HTMLDivElement | null = null;
let editorRef: Editor | null = null;
let currentResults: any[] = [];
let currentIndex = -1;
let currentMode: 'text' | 'color' | 'stroke' | 'font' = 'text';

export function toggleFindReplace(editor: Editor) {
  editorRef = editor;
  if (panel) {
    closePanel();
    return;
  }
  createPanel();
}

export function closeFindReplace() {
  closePanel();
}

function closePanel() {
  if (panel) {
    panel.remove();
    panel = null;
    currentResults = [];
    currentIndex = -1;
  }
}

function createPanel() {
  panel = document.createElement('div');
  panel.id = 'find-replace-panel';
  panel.innerHTML = `
    <div class="fr-header">
      <span class="fr-title">Find & Replace</span>
      <button class="fr-close" title="Close (Esc)">✕</button>
    </div>
    <div class="fr-body">
      <div class="fr-mode-tabs">
        <button class="fr-tab active" data-mode="text">Text</button>
        <button class="fr-tab" data-mode="color">Fill</button>
        <button class="fr-tab" data-mode="stroke">Stroke</button>
        <button class="fr-tab" data-mode="font">Font</button>
      </div>

      <!-- Text mode -->
      <div class="fr-section fr-text-section">
        <div class="fr-row">
          <input class="fr-input" id="fr-search" placeholder="Find text…" autocomplete="off"/>
          <label class="fr-case" title="Case sensitive">
            <input type="checkbox" id="fr-case"/> Aa
          </label>
        </div>
        <div class="fr-row">
          <input class="fr-input" id="fr-replace" placeholder="Replace with…" autocomplete="off"/>
        </div>
        <div class="fr-row fr-actions">
          <span class="fr-count" id="fr-count"></span>
          <button class="fr-btn" id="fr-prev" title="Previous">◀</button>
          <button class="fr-btn" id="fr-next" title="Next">▶</button>
          <button class="fr-btn" id="fr-replace-one">Replace</button>
          <button class="fr-btn" id="fr-replace-all">Replace All</button>
        </div>
      </div>

      <!-- Fill color mode -->
      <div class="fr-section fr-color-section" style="display:none">
        <div class="fr-row">
          <input class="fr-input fr-color-input" id="fr-color-search" placeholder="#ff0000" />
          <input type="color" id="fr-color-picker-search" value="#ff0000" />
        </div>
        <div class="fr-row">
          <input class="fr-input fr-color-input" id="fr-color-replace" placeholder="#00ff00" />
          <input type="color" id="fr-color-picker-replace" value="#00ff00" />
        </div>
        <div class="fr-row fr-actions">
          <span class="fr-count" id="fr-color-count"></span>
          <button class="fr-btn" id="fr-color-find">Find</button>
          <button class="fr-btn" id="fr-color-replace-btn">Replace All</button>
        </div>
      </div>

      <!-- Stroke color mode -->
      <div class="fr-section fr-stroke-section" style="display:none">
        <div class="fr-row">
          <input class="fr-input fr-color-input" id="fr-stroke-search" placeholder="#ff0000" />
          <input type="color" id="fr-stroke-picker-search" value="#ff0000" />
        </div>
        <div class="fr-row">
          <input class="fr-input fr-color-input" id="fr-stroke-replace" placeholder="#00ff00" />
          <input type="color" id="fr-stroke-picker-replace" value="#00ff00" />
        </div>
        <div class="fr-row fr-actions">
          <span class="fr-count" id="fr-stroke-count"></span>
          <button class="fr-btn" id="fr-stroke-find">Find</button>
          <button class="fr-btn" id="fr-stroke-replace-btn">Replace All</button>
        </div>
      </div>

      <!-- Font mode -->
      <div class="fr-section fr-font-section" style="display:none">
        <div class="fr-row">
          <input class="fr-input" id="fr-font-search" placeholder="Find font (e.g. Inter)…" autocomplete="off"/>
        </div>
        <div class="fr-row">
          <input class="fr-input" id="fr-font-replace" placeholder="Replace with font…" autocomplete="off"/>
        </div>
        <div class="fr-row fr-actions">
          <span class="fr-count" id="fr-font-count"></span>
          <button class="fr-btn" id="fr-font-find">Find</button>
          <button class="fr-btn" id="fr-font-replace-btn">Replace All</button>
        </div>
      </div>

      <div class="fr-results" id="fr-results"></div>
    </div>
  `;
  Object.assign(panel.style, {
    position: 'fixed',
    top: '60px',
    right: '20px',
    width: '340px',
    background: '#2a2a2a',
    borderRadius: '10px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    zIndex: '9999',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: '12px',
    color: '#eee',
    overflow: 'hidden',
  });

  document.body.appendChild(panel);
  setupEvents();
  const searchInput = panel.querySelector('#fr-search') as HTMLInputElement;
  searchInput?.focus();
}

function setupEvents() {
  if (!panel) return;
  
  panel.querySelector('.fr-close')!.addEventListener('click', closePanel);
  
  // Mode tabs
  panel.querySelectorAll('.fr-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      panel!.querySelectorAll('.fr-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentMode = (tab as HTMLElement).dataset.mode as any;
      panel!.querySelectorAll('.fr-section').forEach(s => (s as HTMLElement).style.display = 'none');
      const sectionMap: Record<string, string> = {
        text: '.fr-text-section', color: '.fr-color-section',
        stroke: '.fr-stroke-section', font: '.fr-font-section'
      };
      (panel!.querySelector(sectionMap[currentMode]) as HTMLElement).style.display = '';
      clearResults();
    });
  });

  // Text search
  const searchInput = panel.querySelector('#fr-search') as HTMLInputElement;
  searchInput.addEventListener('input', () => doTextSearch());
  panel.querySelector('#fr-case')!.addEventListener('change', () => doTextSearch());
  panel.querySelector('#fr-prev')!.addEventListener('click', () => navigateResult(-1));
  panel.querySelector('#fr-next')!.addEventListener('click', () => navigateResult(1));
  panel.querySelector('#fr-replace-one')!.addEventListener('click', () => doReplaceOne());
  panel.querySelector('#fr-replace-all')!.addEventListener('click', () => doReplaceAll());
  
  // Fill color sync
  syncColorInputs('fr-color-search', 'fr-color-picker-search');
  syncColorInputs('fr-color-replace', 'fr-color-picker-replace');
  panel.querySelector('#fr-color-find')!.addEventListener('click', doColorSearch);
  panel.querySelector('#fr-color-replace-btn')!.addEventListener('click', doColorReplace);

  // Stroke color sync
  syncColorInputs('fr-stroke-search', 'fr-stroke-picker-search');
  syncColorInputs('fr-stroke-replace', 'fr-stroke-picker-replace');
  panel.querySelector('#fr-stroke-find')!.addEventListener('click', doStrokeSearch);
  panel.querySelector('#fr-stroke-replace-btn')!.addEventListener('click', doStrokeReplace);

  // Font
  panel.querySelector('#fr-font-find')!.addEventListener('click', doFontSearch);
  panel.querySelector('#fr-font-replace-btn')!.addEventListener('click', doFontReplace);
  (panel.querySelector('#fr-font-search') as HTMLInputElement).addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePanel();
    if (e.key === 'Enter') doFontSearch();
  });

  // Escape to close on all inputs
  panel.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePanel();
    });
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') navigateResult(1);
  });
}

function syncColorInputs(textId: string, pickerId: string) {
  if (!panel) return;
  const text = panel.querySelector(`#${textId}`) as HTMLInputElement;
  const picker = panel.querySelector(`#${pickerId}`) as HTMLInputElement;
  picker.addEventListener('input', () => { text.value = picker.value; });
  text.addEventListener('input', () => { try { picker.value = text.value; } catch {} });
}

function getEngine(): any {
  return editorRef ? (editorRef as any).engine : null;
}

// ── Text search/replace ──

function doTextSearch() {
  if (!panel) return;
  const engine = getEngine();
  if (!engine) return;
  const query = (panel.querySelector('#fr-search') as HTMLInputElement).value;
  const caseSensitive = (panel.querySelector('#fr-case') as HTMLInputElement).checked;
  if (!query) { clearResults(); return; }
  try {
    currentResults = JSON.parse(engine.find_text(query, caseSensitive) || '[]');
    currentIndex = currentResults.length > 0 ? 0 : -1;
    updateCount('#fr-count');
    renderResults();
    if (currentIndex >= 0) selectResult(currentIndex);
  } catch (e) { console.error('Find error:', e); }
}

function doReplaceOne() {
  if (!panel || currentIndex < 0) return;
  const engine = getEngine();
  if (!engine) return;
  const search = (panel.querySelector('#fr-search') as HTMLInputElement).value;
  const replacement = (panel.querySelector('#fr-replace') as HTMLInputElement).value;
  const caseSensitive = (panel.querySelector('#fr-case') as HTMLInputElement).checked;
  const r = currentResults[currentIndex];
  const nodeId = typeof r.node_id === 'number' ? r.node_id : Number(r.node_id);
  engine.replace_text(nodeId, search, replacement, caseSensitive);
  editorRef!.render();
  doTextSearch();
}

function doReplaceAll() {
  if (!panel) return;
  const engine = getEngine();
  if (!engine) return;
  const search = (panel.querySelector('#fr-search') as HTMLInputElement).value;
  const replacement = (panel.querySelector('#fr-replace') as HTMLInputElement).value;
  const caseSensitive = (panel.querySelector('#fr-case') as HTMLInputElement).checked;
  if (!search) return;
  const count = engine.replace_all_text(search, replacement, caseSensitive);
  editorRef!.render();
  clearResults();
  (panel.querySelector('#fr-count') as HTMLElement).textContent = `${count} replaced`;
}

// ── Fill color search/replace ──

function doColorSearch() {
  if (!panel) return;
  const engine = getEngine();
  if (!engine) return;
  const hex = (panel.querySelector('#fr-color-search') as HTMLInputElement).value;
  if (!hex) return;
  try {
    currentResults = JSON.parse(engine.find_by_color(hex) || '[]');
    currentIndex = currentResults.length > 0 ? 0 : -1;
    showCount('#fr-color-count', currentResults.length);
    renderResults();
    if (currentIndex >= 0) selectResult(currentIndex);
  } catch (e) { console.error('Color find error:', e); }
}

function doColorReplace() {
  if (!panel) return;
  const engine = getEngine();
  if (!engine) return;
  const fromHex = (panel.querySelector('#fr-color-search') as HTMLInputElement).value;
  const toHex = (panel.querySelector('#fr-color-replace') as HTMLInputElement).value;
  if (!fromHex || !toHex) return;
  const count = engine.replace_color(fromHex, toHex);
  showCount('#fr-color-count', count, true);
  currentResults = []; currentIndex = -1;
  renderResults();
  editorRef!.render();
}

// ── Stroke color search/replace ──

function doStrokeSearch() {
  if (!panel) return;
  const engine = getEngine();
  if (!engine) return;
  const hex = (panel.querySelector('#fr-stroke-search') as HTMLInputElement).value;
  if (!hex) return;
  try {
    currentResults = JSON.parse(engine.find_by_stroke_color(hex) || '[]');
    currentIndex = currentResults.length > 0 ? 0 : -1;
    showCount('#fr-stroke-count', currentResults.length);
    renderResults();
    if (currentIndex >= 0) selectResult(currentIndex);
  } catch (e) { console.error('Stroke find error:', e); }
}

function doStrokeReplace() {
  if (!panel) return;
  const engine = getEngine();
  if (!engine) return;
  const fromHex = (panel.querySelector('#fr-stroke-search') as HTMLInputElement).value;
  const toHex = (panel.querySelector('#fr-stroke-replace') as HTMLInputElement).value;
  if (!fromHex || !toHex) return;
  const count = engine.replace_stroke_color(fromHex, toHex);
  showCount('#fr-stroke-count', count, true);
  currentResults = []; currentIndex = -1;
  renderResults();
  editorRef!.render();
}

// ── Font search/replace ──

function doFontSearch() {
  if (!panel) return;
  const engine = getEngine();
  if (!engine) return;
  const query = (panel.querySelector('#fr-font-search') as HTMLInputElement).value;
  if (!query) { clearResults(); return; }
  try {
    currentResults = JSON.parse(engine.find_by_font(query) || '[]');
    currentIndex = currentResults.length > 0 ? 0 : -1;
    showCount('#fr-font-count', currentResults.length);
    renderResults();
    if (currentIndex >= 0) selectResult(currentIndex);
  } catch (e) { console.error('Font find error:', e); }
}

function doFontReplace() {
  if (!panel) return;
  const engine = getEngine();
  if (!engine) return;
  const fromFont = (panel.querySelector('#fr-font-search') as HTMLInputElement).value;
  const toFont = (panel.querySelector('#fr-font-replace') as HTMLInputElement).value;
  if (!fromFont || !toFont) return;
  const count = engine.replace_font(fromFont, toFont);
  showCount('#fr-font-count', count, true);
  currentResults = []; currentIndex = -1;
  renderResults();
  editorRef!.render();
}

// ── Shared helpers ──

function showCount(selector: string, n: number, replaced = false) {
  if (!panel) return;
  (panel.querySelector(selector) as HTMLElement).textContent = replaced ? `${n} replaced` : `${n} found`;
}

function updateCount(selector: string) {
  if (!panel) return;
  const el = panel.querySelector(selector) as HTMLElement;
  if (currentResults.length === 0) { el.textContent = 'No results'; }
  else { el.textContent = `${currentIndex + 1} / ${currentResults.length}`; }
}

function navigateResult(dir: number) {
  if (currentResults.length === 0) return;
  currentIndex = (currentIndex + dir + currentResults.length) % currentResults.length;
  updateCount('#fr-count');
  selectResult(currentIndex);
  highlightResultItem();
}

function selectResult(idx: number) {
  if (!editorRef || idx < 0 || idx >= currentResults.length) return;
  const r = currentResults[idx];
  const nodeId = typeof r.node_id === 'number' ? r.node_id : Number(r.node_id);
  (editorRef as any).selectedIds = [nodeId];
  editorRef.render();
  try {
    const engine = getEngine();
    const info = JSON.parse(engine.get_node_info(nodeId));
    if (info) {
      const cx = info.x + info.width / 2;
      const cy = info.y + info.height / 2;
      const canvas = (editorRef as any).canvas as HTMLCanvasElement;
      (editorRef as any).panX = canvas.width / 2 / devicePixelRatio - cx * (editorRef as any).zoom;
      (editorRef as any).panY = canvas.height / 2 / devicePixelRatio - cy * (editorRef as any).zoom;
      editorRef.render();
    }
  } catch {}
}

function clearResults() {
  currentResults = [];
  currentIndex = -1;
  if (!panel) return;
  panel.querySelectorAll('.fr-count').forEach(el => (el as HTMLElement).textContent = '');
  (panel.querySelector('#fr-results') as HTMLElement).innerHTML = '';
}

function renderResults() {
  if (!panel) return;
  const container = panel.querySelector('#fr-results') as HTMLElement;
  if (currentResults.length === 0) { container.innerHTML = ''; return; }
  container.innerHTML = currentResults.map((r, i) => `
    <div class="fr-result-item ${i === currentIndex ? 'active' : ''}" data-idx="${i}">
      <span class="fr-result-kind">${r.node_kind}</span>
      <span class="fr-result-name">${escapeHtml(r.node_name)}</span>
      ${r.matched_text ? `<span class="fr-result-text">${escapeHtml(r.matched_text.substring(0, 60))}</span>` : ''}
      ${r.matched_color ? `<span class="fr-result-color" style="background:${r.matched_color}"></span>` : ''}
    </div>
  `).join('');
  
  container.querySelectorAll('.fr-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt((item as HTMLElement).dataset.idx || '0');
      currentIndex = idx;
      selectResult(idx);
      highlightResultItem();
    });
  });
}

function highlightResultItem() {
  if (!panel) return;
  panel.querySelectorAll('.fr-result-item').forEach((item, i) => {
    item.classList.toggle('active', i === currentIndex);
  });
  const active = panel.querySelector('.fr-result-item.active');
  active?.scrollIntoView({ block: 'nearest' });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// CSS injection
const style = document.createElement('style');
style.textContent = `
#find-replace-panel .fr-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 12px; background: #333; border-bottom: 1px solid #444;
}
#find-replace-panel .fr-title { font-weight: 600; font-size: 13px; }
#find-replace-panel .fr-close {
  background: none; border: none; color: #999; cursor: pointer; font-size: 14px; padding: 2px 4px;
}
#find-replace-panel .fr-close:hover { color: #fff; }
#find-replace-panel .fr-body { padding: 10px 12px; }
#find-replace-panel .fr-mode-tabs {
  display: flex; gap: 0; margin-bottom: 10px; border-radius: 6px; overflow: hidden; border: 1px solid #444;
}
#find-replace-panel .fr-tab {
  flex: 1; padding: 5px 0; text-align: center; background: #333; border: none; color: #aaa; cursor: pointer; font-size: 11px;
}
#find-replace-panel .fr-tab.active { background: #4a90d9; color: #fff; }
#find-replace-panel .fr-row { display: flex; gap: 6px; margin-bottom: 6px; align-items: center; }
#find-replace-panel .fr-input {
  flex: 1; padding: 6px 8px; background: #1e1e1e; border: 1px solid #444; border-radius: 5px;
  color: #eee; font-size: 12px; outline: none;
}
#find-replace-panel .fr-input:focus { border-color: #4a90d9; }
#find-replace-panel .fr-case { font-size: 11px; color: #888; cursor: pointer; white-space: nowrap; }
#find-replace-panel .fr-case input { margin-right: 2px; }
#find-replace-panel .fr-actions { gap: 4px; }
#find-replace-panel .fr-count { font-size: 11px; color: #888; min-width: 60px; }
#find-replace-panel .fr-btn {
  padding: 4px 8px; background: #444; border: 1px solid #555; border-radius: 4px;
  color: #ddd; cursor: pointer; font-size: 11px; white-space: nowrap;
}
#find-replace-panel .fr-btn:hover { background: #555; }
#find-replace-panel .fr-color-input { max-width: 120px; }
#find-replace-panel input[type="color"] {
  width: 28px; height: 28px; border: 1px solid #555; border-radius: 4px; padding: 0; cursor: pointer; background: none;
}
#find-replace-panel .fr-results {
  max-height: 200px; overflow-y: auto; margin-top: 8px;
}
#find-replace-panel .fr-result-item {
  display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 4px; cursor: pointer;
}
#find-replace-panel .fr-result-item:hover { background: #3a3a3a; }
#find-replace-panel .fr-result-item.active { background: #4a90d933; outline: 1px solid #4a90d9; }
#find-replace-panel .fr-result-kind {
  font-size: 10px; color: #888; background: #333; padding: 1px 4px; border-radius: 3px;
}
#find-replace-panel .fr-result-name { font-size: 11px; color: #ccc; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#find-replace-panel .fr-result-text { font-size: 10px; color: #888; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#find-replace-panel .fr-result-color { width: 14px; height: 14px; border-radius: 3px; border: 1px solid #555; }
`;
document.head.appendChild(style);
