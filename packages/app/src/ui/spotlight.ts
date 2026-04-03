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

type SpotlightCategory = 'node' | 'page' | 'component' | 'variable';

interface SpotlightItem {
  category: SpotlightCategory;
  id: number;
  name: string;
  detail: string;      // kind badge text
  subtext?: string;     // secondary line
  collectionId?: number; // for variables
}

const CATEGORY_COLORS: Record<SpotlightCategory, string> = {
  node: '#4a90d9',
  page: '#d9a34a',
  component: '#9b59b6',
  variable: '#27ae60',
};

const CATEGORY_LABELS: Record<SpotlightCategory, string> = {
  node: 'Node',
  page: 'Page',
  component: 'Component',
  variable: 'Variable',
};

const CATEGORY_ICONS: Record<SpotlightCategory, string> = {
  node: '<circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  page: '<rect x="2" y="1" width="8" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  component: '<path d="M6 1L11 6L6 11L1 6Z" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  variable: '<path d="M2 3C4 3 4 9 6 9S8 3 10 3" fill="none" stroke="currentColor" stroke-width="1.5"/>',
};

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
        <input class="spotlight-input" type="text" placeholder="Search nodes, pages, components, variables…" autocomplete="off" spellcheck="false"/>
      </div>
      <div class="spotlight-filters"></div>
      <div class="spotlight-results"></div>
      <div class="spotlight-hint">↑↓ Navigate · Enter Select · Tab Filter · Esc Close</div>
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
    width: '520px', maxHeight: '480px', background: '#2a2a2a', borderRadius: '12px',
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

  const filtersRow = overlay.querySelector('.spotlight-filters') as HTMLDivElement;
  Object.assign(filtersRow.style, {
    display: 'flex', gap: '6px', padding: '8px 16px',
    borderBottom: '1px solid #3a3a3a',
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
  let items: SpotlightItem[] = [];
  let activeFilter: SpotlightCategory | null = null;

  // Render filter chips
  function renderFilters() {
    const cats: (SpotlightCategory | null)[] = [null, 'node', 'page', 'component', 'variable'];
    filtersRow.innerHTML = cats.map(cat => {
      const label = cat ? CATEGORY_LABELS[cat] : 'All';
      const isActive = cat === activeFilter;
      const bg = isActive ? (cat ? CATEGORY_COLORS[cat] : '#555') : '#3a3a3a';
      const color = isActive ? '#fff' : '#aaa';
      return `<span class="spotlight-filter" data-cat="${cat ?? ''}" style="
        padding:3px 10px;border-radius:10px;font-size:11px;cursor:pointer;
        background:${bg};color:${color};transition:all .15s;user-select:none;
      ">${label}</span>`;
    }).join('');
    filtersRow.querySelectorAll('.spotlight-filter').forEach(el => {
      el.addEventListener('click', () => {
        const c = (el as HTMLElement).dataset.cat;
        activeFilter = c ? c as SpotlightCategory : null;
        renderFilters();
        doSearch();
        input.focus();
      });
    });
  }
  renderFilters();

  // --- Quick Create command parsing ---
  // Patterns: "create rect 200x100", "create ellipse 50x50", "create text Hello World",
  //           "create frame 400x300", "create star", "create polygon"
  // Optional position: "create rect 200x100 at 50,100"
  const CREATE_RE = /^create\s+(rect|ellipse|frame|text|star|polygon|section|image)\s*(.*)/i;
  const SIZE_RE = /^(\d+)\s*[x×]\s*(\d+)/;
  const AT_RE = /at\s+(-?\d+)\s*[,\s]\s*(-?\d+)/i;

  interface QuickCreateCmd {
    kind: string;
    width: number;
    height: number;
    x: number;
    y: number;
    textContent?: string;
  }

  function parseCreateCmd(q: string): QuickCreateCmd | null {
    const m = CREATE_RE.exec(q);
    if (!m) return null;
    const kind = m[1].toLowerCase();
    const rest = m[2].trim();
    let width = 100, height = 100;
    let x = 0, y = 0;
    let textContent: string | undefined;

    // For text nodes, check if there's quoted or unquoted text content
    if (kind === 'text') {
      const quotedMatch = rest.match(/^["'](.+?)["']\s*(.*)/);
      if (quotedMatch) {
        textContent = quotedMatch[1];
        const afterText = quotedMatch[2];
        const sizeM = SIZE_RE.exec(afterText);
        if (sizeM) { width = parseInt(sizeM[1]); height = parseInt(sizeM[2]); }
        else { width = 200; height = 40; }
        const atM = AT_RE.exec(afterText);
        if (atM) { x = parseInt(atM[1]); y = parseInt(atM[2]); }
      } else {
        // No quotes — treat everything before "at" or size as text
        const atM = AT_RE.exec(rest);
        const sizeM = SIZE_RE.exec(rest);
        let textEnd = rest.length;
        if (atM && atM.index !== undefined) textEnd = Math.min(textEnd, atM.index);
        if (sizeM && sizeM.index !== undefined) textEnd = Math.min(textEnd, sizeM.index);
        textContent = rest.slice(0, textEnd).trim() || 'Text';
        if (sizeM) { width = parseInt(sizeM[1]); height = parseInt(sizeM[2]); }
        else { width = 200; height = 40; }
        if (atM) { x = parseInt(atM[1]); y = parseInt(atM[2]); }
      }
    } else {
      const sizeM = SIZE_RE.exec(rest);
      if (sizeM) { width = parseInt(sizeM[1]); height = parseInt(sizeM[2]); }
      const atM = AT_RE.exec(rest);
      if (atM) { x = parseInt(atM[1]); y = parseInt(atM[2]); }
    }

    // Default position: center of viewport
    if (!AT_RE.test(q) && editorRef) {
      const canvas = editorRef.canvas;
      const zoom = editorRef.zoom;
      const panX = editorRef.panX;
      const panY = editorRef.panY;
      const cw = canvas.width / (window.devicePixelRatio || 1);
      const ch = canvas.height / (window.devicePixelRatio || 1);
      x = Math.round((cw / 2 - panX) / zoom - width / 2);
      y = Math.round((ch / 2 - panY) / zoom - height / 2);
    }

    return { kind, width, height, x, y, textContent };
  }

  function executeCreateCmd(cmd: QuickCreateCmd): boolean {
    if (!editorRef) return false;
    const e = editorRef.engine;
    let nodeId: bigint | number = 0;
    try {
      switch (cmd.kind) {
        case 'rect':
          nodeId = e.add_rect(cmd.x, cmd.y, cmd.width, cmd.height);
          break;
        case 'ellipse':
          nodeId = e.add_ellipse(cmd.x, cmd.y, cmd.width, cmd.height);
          break;
        case 'frame':
          nodeId = e.add_frame(cmd.x, cmd.y, cmd.width, cmd.height);
          break;
        case 'text':
          nodeId = e.add_text(cmd.textContent || 'Text', cmd.x, cmd.y);
          break;
        case 'star':
          nodeId = e.add_star(cmd.x, cmd.y, cmd.width, cmd.height, 5, 0.38);
          break;
        case 'polygon':
          nodeId = e.add_polygon(cmd.x, cmd.y, cmd.width, cmd.height, 6);
          break;
        case 'section':
          nodeId = e.add_section(cmd.x, cmd.y, cmd.width, cmd.height);
          break;
        case 'image':
          nodeId = e.add_image('', cmd.x, cmd.y, cmd.width, cmd.height);
          break;
        default:
          return false;
      }
      const nid = Number(nodeId);
      if (nid > 0) {
        e.select(BigInt(nid));
        editorRef.notifySelectionChanged([nid]);
        editorRef.requestRender();
      }
      return nid > 0;
    } catch {
      return false;
    }
  }

  function doSearch() {
    const q = input.value.trim();
    if (!q || !editorRef) {
      results.innerHTML = '<div style="padding:24px;text-align:center;color:#666">Type to search… or <span style="color:#818cf8">create rect 200x100</span></div>';
      items = [];
      selectedIdx = 0;
      return;
    }

    // Check for quick create command
    const createCmd = parseCreateCmd(q);
    if (createCmd) {
      items = [];
      selectedIdx = 0;
      const preview = `${createCmd.kind} ${createCmd.width}×${createCmd.height} at (${createCmd.x}, ${createCmd.y})${createCmd.textContent ? ` — "${createCmd.textContent}"` : ''}`;
      results.innerHTML = `
        <div class="spotlight-item spotlight-create-item" data-action="create" style="padding:12px 16px;cursor:pointer;background:#1a2744;border-left:3px solid #818cf8;margin:8px 12px;border-radius:6px;">
          <div style="display:flex;align-items:center;gap:8px">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span style="color:#818cf8;font-weight:600;font-size:13px">Quick Create</span>
          </div>
          <div style="color:#aaa;font-size:12px;margin-top:4px">${escapeHtml(preview)}</div>
          <div style="color:#666;font-size:11px;margin-top:2px">Press Enter to create</div>
        </div>
      `;
      const createEl = results.querySelector('.spotlight-create-item');
      createEl?.addEventListener('click', () => {
        executeCreateCmd(createCmd);
        closeSpotlight();
      });
      // Override Enter to execute create
      (input as any).__createCmd = createCmd;
      return;
    }
    (input as any).__createCmd = null;

    const allItems: SpotlightItem[] = [];
    const ql = q.toLowerCase();

    // 1. Nodes (via engine find_text)
    if (!activeFilter || activeFilter === 'node') {
      try {
        const raw = editorRef.engine.find_text(q, false);
        const found: any[] = JSON.parse(raw);
        for (const r of found.slice(0, 30)) {
          allItems.push({
            category: 'node',
            id: Number(r.node_id),
            name: r.node_name,
            detail: r.node_kind,
            subtext: r.matched_text || undefined,
          });
        }
      } catch { /* ignore */ }
    }

    // 2. Pages
    if (!activeFilter || activeFilter === 'page') {
      try {
        const pages: any[] = JSON.parse(editorRef.engine.get_pages());
        for (const p of pages) {
          if (p.name.toLowerCase().includes(ql)) {
            allItems.push({
              category: 'page',
              id: Number(p.id),
              name: p.name,
              detail: 'Page',
            });
          }
        }
      } catch { /* ignore */ }
    }

    // 3. Components
    if (!activeFilter || activeFilter === 'component') {
      try {
        const comps: any[] = JSON.parse(editorRef.engine.search_components(q));
        for (const c of comps.slice(0, 20)) {
          allItems.push({
            category: 'component',
            id: Number(c.id),
            name: c.name,
            detail: `${c.variant_count} variant${c.variant_count !== 1 ? 's' : ''}`,
            subtext: c.description || undefined,
          });
        }
      } catch { /* ignore */ }
    }

    // 4. Variables
    if (!activeFilter || activeFilter === 'variable') {
      try {
        const collections: any[] = JSON.parse(editorRef.engine.get_collections());
        for (const col of collections) {
          if (col.variables) {
            for (const v of col.variables) {
              if (v.name.toLowerCase().includes(ql) || col.name.toLowerCase().includes(ql)) {
                allItems.push({
                  category: 'variable',
                  id: Number(v.id),
                  name: v.name,
                  detail: v.var_type || 'Variable',
                  subtext: col.name,
                  collectionId: Number(col.id),
                });
              }
            }
          }
        }
      } catch { /* ignore */ }
    }

    items = allItems.slice(0, 50);
    selectedIdx = 0;
    renderResults();
  }

  function renderResults() {
    if (items.length === 0) {
      results.innerHTML = '<div style="padding:24px;text-align:center;color:#666">No results found</div>';
      return;
    }

    // Group by category for display
    let lastCat: SpotlightCategory | null = null;
    let html = '';
    let globalIdx = 0;

    for (const item of items) {
      if (item.category !== lastCat) {
        lastCat = item.category;
        html += `<div style="padding:4px 16px 2px;font-size:10px;font-weight:600;color:${CATEGORY_COLORS[item.category]};text-transform:uppercase;letter-spacing:0.5px;margin-top:4px">${CATEGORY_LABELS[item.category]}s</div>`;
      }

      const sel = globalIdx === selectedIdx ? 'background:#3a3a3a;' : '';
      const iconSvg = `<svg width="12" height="12" viewBox="0 0 12 12" style="color:${CATEGORY_COLORS[item.category]};flex-shrink:0">${CATEGORY_ICONS[item.category]}</svg>`;
      const detailBadge = `<span style="background:#444;color:#aaa;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:8px">${escapeHtml(item.detail)}</span>`;
      const subLine = item.subtext
        ? `<div style="font-size:11px;color:#666;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:420px">${escapeHtml(item.subtext)}</div>`
        : '';

      html += `<div class="spotlight-item" data-idx="${globalIdx}" style="padding:6px 16px;cursor:pointer;${sel};display:flex;align-items:flex-start;gap:8px">
        <div style="margin-top:3px">${iconSvg}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center">
            <span style="color:#ddd;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(item.name)}</span>${detailBadge}
          </div>
          ${subLine}
        </div>
      </div>`;
      globalIdx++;
    }

    results.innerHTML = html;

    results.querySelectorAll('.spotlight-item').forEach(el => {
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

    switch (item.category) {
      case 'node':
        editorRef.engine.select(BigInt(item.id));
        editorRef.notifySelectionChanged([item.id]);
        editorRef.zoomToSelection();
        break;
      case 'page':
        editorRef.engine.set_active_page(BigInt(item.id));
        editorRef.zoomToFit();
        // Dispatch event so page tabs UI updates
        window.dispatchEvent(new CustomEvent('opensketch-page-changed'));
        break;
      case 'component': {
        // Find instance or component master node and select it
        try {
          const instances: any[] = JSON.parse(editorRef.engine.find_instances(BigInt(item.id) as any));
          if (instances.length > 0) {
            const nodeId = Number(instances[0].node_id);
            editorRef.engine.select(BigInt(nodeId));
            editorRef.notifySelectionChanged([nodeId]);
            editorRef.zoomToSelection();
          }
        } catch { /* ignore */ }
        break;
      }
      case 'variable':
        // No spatial location — just show info or open variables panel if available
        break;
    }

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
      const cmd = (input as any).__createCmd as QuickCreateCmd | null;
      if (cmd) {
        executeCreateCmd(cmd);
        closeSpotlight();
      } else if (items.length > 0) {
        selectItem(selectedIdx);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      // Cycle filter
      const cats: (SpotlightCategory | null)[] = [null, 'node', 'page', 'component', 'variable'];
      const curIdx = cats.indexOf(activeFilter);
      activeFilter = cats[(curIdx + 1) % cats.length];
      renderFilters();
      doSearch();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeSpotlight();
    }
  });

  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) closeSpotlight();
  });

  doSearch();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
