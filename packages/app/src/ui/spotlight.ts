import type { Editor } from '../editor';

let overlay: HTMLDivElement | null = null;
let editorRef: Editor | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function toggleSpotlight(editor: Editor) {
  editorRef = editor;
  if (overlay) {
    closeSpotlight();
    return;
  }
  openSpotlight();
}

export function closeSpotlight() {
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
}

export function isSpotlightVisible(): boolean {
  return overlay !== null;
}

function openSpotlight() {
  if (!editorRef) return;

  overlay = document.createElement('div');
  overlay.id = 'spotlight-overlay';
  overlay.innerHTML = `
    <div class="spotlight-panel">
      <div class="spotlight-input-row">
        <svg class="spotlight-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input class="spotlight-input" type="text" placeholder="Search nodes by name, text, or type…" autocomplete="off" spellcheck="false"/>
      </div>
      <div class="spotlight-results"></div>
      <div class="spotlight-hint">↑↓ Navigate · Enter Select · Esc Close</div>
    </div>
  `;

  // Styles
  Object.assign(overlay.style, {
    position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
    background: 'rgba(0,0,0,0.3)', display: 'flex', justifyContent: 'center',
    paddingTop: '15vh', zIndex: '10000',
  });

  const panel = overlay.querySelector('.spotlight-panel') as HTMLDivElement;
  Object.assign(panel.style, {
    width: '480px', maxHeight: '420px', background: '#2a2a2a', borderRadius: '12px',
    boxShadow: '0 16px 48px rgba(0,0,0,0.5)', overflow: 'hidden', display: 'flex',
    flexDirection: 'column',
  });

  const inputRow = overlay.querySelector('.spotlight-input-row') as HTMLDivElement;
  Object.assign(inputRow.style, {
    display: 'flex', alignItems: 'center', padding: '12px 16px', gap: '10px',
    borderBottom: '1px solid #3a3a3a',
  });

  const icon = overlay.querySelector('.spotlight-icon') as SVGElement;
  Object.assign(icon.style, { flexShrink: '0', color: '#888' });

  const input = overlay.querySelector('.spotlight-input') as HTMLInputElement;
  Object.assign(input.style, {
    flex: '1', background: 'none', border: 'none', outline: 'none',
    color: '#eee', fontSize: '16px', fontFamily: 'inherit',
  });

  const results = overlay.querySelector('.spotlight-results') as HTMLDivElement;
  Object.assign(results.style, {
    flex: '1', overflowY: 'auto', padding: '4px 0',
  });

  const hint = overlay.querySelector('.spotlight-hint') as HTMLDivElement;
  Object.assign(hint.style, {
    padding: '8px 16px', fontSize: '11px', color: '#666',
    borderTop: '1px solid #3a3a3a', textAlign: 'center',
  });

  document.body.appendChild(overlay);
  input.focus();

  let selectedIdx = 0;
  let items: { id: number; name: string; kind: string; text?: string }[] = [];

  function doSearch() {
    const q = input.value.trim();
    if (!q || !editorRef) {
      results.innerHTML = '<div style="padding:24px;text-align:center;color:#666">Type to search…</div>';
      items = [];
      selectedIdx = 0;
      return;
    }

    // Use engine find_text for text+name matches
    const raw = editorRef.engine.find_text(q, false);
    const found: any[] = JSON.parse(raw);

    // Also search by node kind (type:rect, type:frame, etc.)
    const kindQuery = q.toLowerCase();
    
    items = found.map((r: any) => ({
      id: Number(r.node_id),
      name: r.node_name,
      kind: r.node_kind,
      text: r.matched_text || undefined,
    }));

    // Limit results
    items = items.slice(0, 50);
    selectedIdx = 0;
    renderResults();
  }

  function renderResults() {
    if (items.length === 0) {
      results.innerHTML = '<div style="padding:24px;text-align:center;color:#666">No results found</div>';
      return;
    }
    results.innerHTML = items.map((item, i) => {
      const sel = i === selectedIdx ? 'background:#3a3a3a;' : '';
      const kindBadge = `<span style="background:#444;color:#aaa;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:8px">${item.kind}</span>`;
      const textPreview = item.text
        ? `<div style="font-size:11px;color:#777;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:400px">${escapeHtml(item.text)}</div>`
        : '';
      return `<div class="spotlight-item" data-idx="${i}" style="padding:8px 16px;cursor:pointer;${sel}">
        <div style="display:flex;align-items:center">
          <span style="color:#ddd;font-size:13px">${escapeHtml(item.name)}</span>${kindBadge}
        </div>
        ${textPreview}
      </div>`;
    }).join('');

    // Click handlers
    results.querySelectorAll('.spotlight-item').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = parseInt((el as HTMLElement).dataset.idx || '0');
        selectItem(idx);
      });
      el.addEventListener('mouseenter', () => {
        selectedIdx = parseInt((el as HTMLElement).dataset.idx || '0');
        renderResults();
      });
    });
  }

  function selectItem(idx: number) {
    const item = items[idx];
    if (!item || !editorRef) return;
    // Select + zoom to node
    editorRef.engine.select(BigInt(item.id));
    editorRef.notifySelectionChanged([item.id]);
    // Zoom to selection
    editorRef.zoomToSelection();
    editorRef.requestRender();
    closeSpotlight();
  }

  function scrollToSelected() {
    const el = results.querySelector(`[data-idx="${selectedIdx}"]`) as HTMLElement;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('input', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(doSearch, 80);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (items.length > 0) {
        selectedIdx = (selectedIdx + 1) % items.length;
        renderResults();
        scrollToSelected();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length > 0) {
        selectedIdx = (selectedIdx - 1 + items.length) % items.length;
        renderResults();
        scrollToSelected();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items.length > 0) selectItem(selectedIdx);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeSpotlight();
    }
  });

  // Click overlay to close
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) closeSpotlight();
  });

  doSearch();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
