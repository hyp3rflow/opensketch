import type { Editor } from '../editor';

let panel: HTMLDivElement | null = null;
let editorRef: Editor | null = null;
let resultIds: number[] = [];
let currentIndex = -1;
let caseSensitive = false;
let lastQuery = '';

export function toggleSearchPanel(editor: Editor) {
  editorRef = editor;
  if (panel) { closeSearchPanel(); return; }
  createPanel();
}

export function closeSearchPanel() {
  if (panel) { panel.remove(); panel = null; }
  resultIds = [];
  currentIndex = -1;
  lastQuery = '';
  editorRef?.requestRender();
}

export function isSearchPanelOpen(): boolean {
  return panel !== null;
}

/** Called by editor render loop to get IDs that should have orange highlight */
export function getSearchHighlightIds(): number[] {
  return panel ? resultIds : [];
}

/** Get the currently focused result node ID (for stronger highlight) */
export function getSearchCurrentId(): number | null {
  if (!panel || currentIndex < 0 || currentIndex >= resultIds.length) return null;
  return resultIds[currentIndex]!;
}

function createPanel() {
  panel = document.createElement('div');
  panel.id = 'os-search-panel';
  panel.innerHTML = `
    <div class="sp-row">
      <input class="sp-input" id="sp-search" placeholder="Search…" autocomplete="off" spellcheck="false"/>
      <button class="sp-case ${caseSensitive ? 'active' : ''}" id="sp-case" title="Match case">Aa</button>
      <span class="sp-count" id="sp-count"></span>
      <button class="sp-nav" id="sp-prev" title="Previous (↑)">
        <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 8L6 4L10 8" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button class="sp-nav" id="sp-next" title="Next (↓)">
        <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 4L6 8L10 4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button class="sp-close" id="sp-close" title="Close (Esc)">✕</button>
    </div>
    <div class="sp-replace-row" id="sp-replace-row">
      <input class="sp-input" id="sp-replace" placeholder="Replace…" autocomplete="off" spellcheck="false"/>
      <button class="sp-btn" id="sp-replace-one">Replace</button>
      <button class="sp-btn" id="sp-replace-all">All</button>
    </div>
  `;
  Object.assign(panel.style, {
    position: 'fixed',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '10000',
  });

  document.body.appendChild(panel);
  setupPanelEvents();
  const input = panel.querySelector('#sp-search') as HTMLInputElement;
  input.focus();
}

function setupPanelEvents() {
  if (!panel) return;
  const searchInput = panel.querySelector('#sp-search') as HTMLInputElement;
  const replaceInput = panel.querySelector('#sp-replace') as HTMLInputElement;

  searchInput.addEventListener('input', () => doSearch());
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeSearchPanel(); }
    if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? navigate(-1) : navigate(1); }
  });
  replaceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeSearchPanel(); }
    if (e.key === 'Enter') { e.preventDefault(); doReplaceOne(); }
  });

  panel.querySelector('#sp-case')!.addEventListener('click', () => {
    caseSensitive = !caseSensitive;
    panel!.querySelector('#sp-case')!.classList.toggle('active', caseSensitive);
    doSearch();
  });
  panel.querySelector('#sp-prev')!.addEventListener('click', () => navigate(-1));
  panel.querySelector('#sp-next')!.addEventListener('click', () => navigate(1));
  panel.querySelector('#sp-close')!.addEventListener('click', () => closeSearchPanel());
  panel.querySelector('#sp-replace-one')!.addEventListener('click', () => doReplaceOne());
  panel.querySelector('#sp-replace-all')!.addEventListener('click', () => doReplaceAll());
}

function doSearch() {
  if (!panel || !editorRef) return;
  const query = (panel.querySelector('#sp-search') as HTMLInputElement).value;
  lastQuery = query;
  if (!query) {
    resultIds = [];
    currentIndex = -1;
    updateCount();
    editorRef.requestRender();
    return;
  }
  const engine = (editorRef as any).engine;
  try {
    const raw = engine.search_nodes(query, caseSensitive);
    // raw is a JSON string of u64 array
    resultIds = typeof raw === 'string' ? JSON.parse(raw).map(Number) : Array.from(raw).map(Number);
  } catch {
    resultIds = [];
  }
  currentIndex = resultIds.length > 0 ? 0 : -1;
  updateCount();
  if (currentIndex >= 0) focusResult();
  editorRef.requestRender();
}

function navigate(dir: number) {
  if (resultIds.length === 0) return;
  currentIndex = (currentIndex + dir + resultIds.length) % resultIds.length;
  updateCount();
  focusResult();
}

function focusResult() {
  if (!editorRef || currentIndex < 0) return;
  const id = resultIds[currentIndex]!;
  const engine = (editorRef as any).engine;
  // Select the node
  engine.deselect_all();
  engine.select_node(BigInt(id));
  // Pan to it
  try {
    editorRef.zoomToSelection();
  } catch {
    // fallback: just render
  }
  editorRef.requestRender();
  // Fire selection change
  (editorRef as any).fireSelectionNow?.([id]);
}

function doReplaceOne() {
  if (!panel || !editorRef || currentIndex < 0) return;
  const query = (panel.querySelector('#sp-search') as HTMLInputElement).value;
  const replacement = (panel.querySelector('#sp-replace') as HTMLInputElement).value;
  if (!query) return;
  const engine = (editorRef as any).engine;
  const nodeId = resultIds[currentIndex]!;
  engine.push_undo();
  engine.replace_in_nodes(query, replacement, JSON.stringify([nodeId]), caseSensitive);
  editorRef.requestRender();
  (editorRef as any).onLayersChanges?.forEach((fn: () => void) => fn());
  doSearch();
}

function doReplaceAll() {
  if (!panel || !editorRef) return;
  const query = (panel.querySelector('#sp-search') as HTMLInputElement).value;
  const replacement = (panel.querySelector('#sp-replace') as HTMLInputElement).value;
  if (!query) return;
  const engine = (editorRef as any).engine;
  engine.push_undo();
  const count = engine.replace_in_nodes(query, replacement, JSON.stringify(resultIds), caseSensitive);
  editorRef.requestRender();
  (editorRef as any).onLayersChanges?.forEach((fn: () => void) => fn());
  resultIds = [];
  currentIndex = -1;
  const countEl = panel.querySelector('#sp-count') as HTMLElement;
  countEl.textContent = `${count} replaced`;
}

function updateCount() {
  if (!panel) return;
  const el = panel.querySelector('#sp-count') as HTMLElement;
  if (resultIds.length === 0) {
    el.textContent = lastQuery ? 'No results' : '';
  } else {
    el.textContent = `${currentIndex + 1}/${resultIds.length}`;
  }
}

// CSS
const style = document.createElement('style');
style.textContent = `
#os-search-panel {
  background: #2a2a2a;
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06);
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  font-size: 13px;
  color: #eee;
  padding: 6px 8px;
  min-width: 400px;
}
#os-search-panel .sp-row, #os-search-panel .sp-replace-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
#os-search-panel .sp-replace-row { margin-top: 4px; }
#os-search-panel .sp-input {
  flex: 1;
  padding: 5px 8px;
  background: #1a1a1a;
  border: 1px solid #3a3a3a;
  border-radius: 5px;
  color: #eee;
  font-size: 13px;
  outline: none;
  min-width: 0;
}
#os-search-panel .sp-input:focus { border-color: #4a90d9; }
#os-search-panel .sp-case {
  padding: 3px 6px;
  background: none;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  color: #888;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
}
#os-search-panel .sp-case:hover { color: #ccc; border-color: #555; }
#os-search-panel .sp-case.active { color: #4a90d9; border-color: #4a90d9; background: rgba(74,144,217,0.1); }
#os-search-panel .sp-count {
  font-size: 11px;
  color: #888;
  min-width: 56px;
  text-align: center;
  white-space: nowrap;
}
#os-search-panel .sp-nav, #os-search-panel .sp-close {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  padding: 3px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}
#os-search-panel .sp-nav:hover, #os-search-panel .sp-close:hover { background: #3a3a3a; color: #eee; }
#os-search-panel .sp-btn {
  padding: 4px 10px;
  background: #3a3a3a;
  border: 1px solid #4a4a4a;
  border-radius: 5px;
  color: #ddd;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}
#os-search-panel .sp-btn:hover { background: #4a4a4a; }
`;
document.head.appendChild(style);
