/**
 * Design Token Export + Sync Bridge Panel
 */

import type { Editor } from '../editor';

const FORMATS = [
  { id: 'w3c', label: 'W3C DTCG', ext: 'json', desc: 'W3C Design Tokens Community Group spec' },
  { id: 'style-dictionary', label: 'Style Dictionary', ext: 'json', desc: 'Amazon Style Dictionary format' },
  { id: 'tailwind', label: 'Tailwind CSS', ext: 'js', desc: 'Tailwind theme config (module.exports)' },
  { id: 'css-variables', label: 'CSS Variables', ext: 'css', desc: 'CSS Custom Properties (:root)' },
  { id: 'scss', label: 'SCSS Variables', ext: 'scss', desc: 'SCSS $variables for Sass projects' },
] as const;

type TokenLeaf = { path: string; value: any };
type SyncDirection = 'external-to-local' | 'local-to-external';
type DiffResult = {
  addColor: TokenLeaf[]; updateColor: TokenLeaf[];
  addText: TokenLeaf[]; updateText: TokenLeaf[];
  addVar: TokenLeaf[]; updateVar: TokenLeaf[];
};
type ReverseDiffResult = {
  add: TokenLeaf[];
  update: TokenLeaf[];
  remove: TokenLeaf[];
};

let panel: HTMLDivElement | null = null;
let selectedFormat = 'w3c';
let previewContent = '';
let pendingDiff: DiffResult | null = null;
let pendingReverseDiff: ReverseDiffResult | null = null;
let syncDirection: SyncDirection = 'external-to-local';
let importedJsonRoot: any = null;
let importedFileName = 'design-tokens';

export function toggleDesignTokenExport(editor: Editor) {
  if (panel) { closePanel(); return; }
  openPanel(editor);
}

function openPanel(editor: Editor) {
  panel = document.createElement('div');
  panel.className = 'design-token-export-overlay';
  panel.innerHTML = `
    <div class="design-token-export-modal">
      <div class="dte-header">
        <span class="dte-title">Design Tokens — Export / Sync Bridge</span>
        <button class="dte-close" title="Close">✕</button>
      </div>
      <div class="dte-body">
        <div class="dte-formats">
          ${FORMATS.map(f => `
            <label class="dte-format-card${f.id === selectedFormat ? ' selected' : ''}" data-format="${f.id}">
              <input type="radio" name="dte-format" value="${f.id}" ${f.id === selectedFormat ? 'checked' : ''}>
              <div class="dte-format-info">
                <span class="dte-format-label">${f.label}</span>
                <span class="dte-format-desc">${f.desc}</span>
              </div>
              <span class="dte-format-ext">.${f.ext}</span>
            </label>
          `).join('')}
        </div>
        <div class="dte-preview-section">
          <div class="dte-preview-header"><span>Export Preview</span><button class="dte-copy-btn">📋 Copy</button></div>
          <pre class="dte-preview-code"></pre>
        </div>
        <div class="dte-sync-section">
          <div class="dte-preview-header"><span>Sync Bridge (bidirectional)</span></div>
          <div class="dte-sync-dir-row">
            <label><input type="radio" name="dte-sync-dir" value="external-to-local" checked> External JSON → OpenSketch</label>
            <label><input type="radio" name="dte-sync-dir" value="local-to-external"> OpenSketch → External JSON</label>
          </div>
          <div class="dte-sync-actions">
            <button class="dte-import-btn">Import JSON…</button>
            <button class="dte-apply-btn" disabled>Apply Diff</button>
          </div>
          <pre class="dte-diff-code">No diff yet.</pre>
        </div>
      </div>
      <div class="dte-footer">
        <button class="dte-cancel-btn">Cancel</button>
        <button class="dte-download-btn">⬇ Download</button>
      </div>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    .design-token-export-overlay { position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; }
    .design-token-export-modal { background:#2a2a2a; border-radius:12px; width:700px; max-height:84vh; display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,.5); color:#e0e0e0; font:13px -apple-system,BlinkMacSystemFont,sans-serif; }
    .dte-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #3a3a3a}.dte-title{font-size:15px;font-weight:600}
    .dte-close{background:none;border:none;color:#888;cursor:pointer;font-size:16px;padding:4px 8px;border-radius:4px}.dte-close:hover{background:#3a3a3a;color:#fff}
    .dte-body{padding:16px 20px;overflow-y:auto;flex:1}.dte-formats{display:flex;flex-direction:column;gap:8px;margin-bottom:16px}
    .dte-format-card{display:flex;align-items:center;gap:12px;padding:10px 14px;background:#333;border:2px solid transparent;border-radius:8px;cursor:pointer}
    .dte-format-card.selected{border-color:#4a90d9;background:#2d3a4a}.dte-format-card input{display:none}.dte-format-info{flex:1;display:flex;flex-direction:column;gap:2px}
    .dte-format-label{font-weight:600}.dte-format-desc{font-size:11px;color:#888}.dte-format-ext{font-size:11px;color:#666;background:#222;padding:2px 6px;border-radius:4px;font-family:monospace}
    .dte-preview-section,.dte-sync-section{border-top:1px solid #3a3a3a;padding-top:12px;margin-top:8px}
    .dte-preview-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-weight:600}
    .dte-copy-btn,.dte-import-btn,.dte-apply-btn{background:#3a3a3a;border:none;color:#ccc;padding:5px 10px;border-radius:4px;cursor:pointer;font-size:12px}
    .dte-copy-btn:hover,.dte-import-btn:hover,.dte-apply-btn:hover{background:#4a4a4a}.dte-apply-btn:disabled{opacity:.5;cursor:not-allowed}
    .dte-preview-code,.dte-diff-code{background:#1a1a1a;border-radius:8px;padding:12px;font-family:SFMono-Regular,Menlo,monospace;font-size:11px;line-height:1.5;max-height:220px;overflow:auto;white-space:pre-wrap;color:#a8d8a8;margin:0}
    .dte-diff-code{color:#c8d5ff}.dte-sync-dir-row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;font-size:11px;color:#b8b8b8}.dte-sync-dir-row label{display:flex;align-items:center;gap:5px;cursor:pointer}.dte-sync-actions{display:flex;gap:8px;margin-bottom:8px}
    .dte-footer{display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid #3a3a3a}
    .dte-cancel-btn{background:#3a3a3a;border:none;color:#ccc;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px}
    .dte-download-btn{background:#4a90d9;border:none;color:#fff;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600}
  `;
  panel.appendChild(style);
  document.body.appendChild(panel);

  const codeEl = panel.querySelector('.dte-preview-code') as HTMLPreElement;
  const diffEl = panel.querySelector('.dte-diff-code') as HTMLPreElement;
  const applyBtn = panel.querySelector('.dte-apply-btn') as HTMLButtonElement;

  const updatePreview = () => {
    previewContent = editor.exportDesignTokens(selectedFormat);
    const truncated = previewContent.length > 3000 ? previewContent.slice(0, 3000) + '\n\n... (truncated)' : previewContent;
    codeEl.textContent = truncated || '(no tokens to export)';
  };
  updatePreview();

  panel.querySelector('.dte-close')!.addEventListener('click', closePanel);
  panel.querySelector('.dte-cancel-btn')!.addEventListener('click', closePanel);
  panel.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).classList.contains('design-token-export-overlay')) closePanel();
  });

  panel.querySelectorAll('.dte-format-card').forEach(card => {
    card.addEventListener('click', () => {
      selectedFormat = (card as HTMLElement).dataset.format!;
      panel!.querySelectorAll('.dte-format-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      (card.querySelector('input') as HTMLInputElement).checked = true;
      updatePreview();
    });
  });

  panel.querySelector('.dte-copy-btn')!.addEventListener('click', () => {
    navigator.clipboard.writeText(previewContent).then(() => {
      const btn = panel!.querySelector('.dte-copy-btn') as HTMLButtonElement;
      btn.textContent = '✓ Copied!';
      setTimeout(() => { btn.textContent = '📋 Copy'; }, 1200);
    });
  });

  const refreshDiffPreview = () => {
    if (!importedJsonRoot) {
      pendingDiff = null;
      pendingReverseDiff = null;
      applyBtn.disabled = true;
      diffEl.textContent = 'No diff yet. Import JSON first.';
      return;
    }
    const leaves = flattenTokens(importedJsonRoot);
    if (syncDirection === 'external-to-local') {
      pendingReverseDiff = null;
      pendingDiff = computeDiff(editor, leaves);
      diffEl.textContent = summarizeDiff(pendingDiff);
      applyBtn.disabled = totalDiff(pendingDiff) === 0;
    } else {
      pendingDiff = null;
      pendingReverseDiff = computeReverseDiff(editor, leaves);
      diffEl.textContent = summarizeReverseDiff(pendingReverseDiff);
      applyBtn.disabled = totalReverseDiff(pendingReverseDiff) === 0;
    }
  };

  panel.querySelectorAll('input[name="dte-sync-dir"]').forEach(el => {
    el.addEventListener('change', () => {
      const v = (el as HTMLInputElement).value as SyncDirection;
      if (v !== syncDirection) {
        syncDirection = v;
        refreshDiffPreview();
      }
    });
  });

  panel.querySelector('.dte-import-btn')!.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0]; if (!file) return;
      importedFileName = file.name.replace(/\.json$/i, '') || 'design-tokens';
      const fr = new FileReader();
      fr.onload = () => {
        try {
          importedJsonRoot = JSON.parse(String(fr.result || '{}'));
          refreshDiffPreview();
        } catch (e: any) {
          diffEl.textContent = `Invalid JSON: ${e?.message || e}`;
          applyBtn.disabled = true;
          importedJsonRoot = null;
          pendingDiff = null;
          pendingReverseDiff = null;
        }
      };
      fr.readAsText(file);
    };
    input.click();
  });

  applyBtn.addEventListener('click', () => {
    if (syncDirection === 'external-to-local') {
      if (!pendingDiff) return;
      const applied = applyDiff(editor, pendingDiff);
      editor.requestRender();
      diffEl.textContent = `${summarizeDiff(pendingDiff)}\n\nApplied to OpenSketch: ${applied} changes.`;
      pendingDiff = null;
      applyBtn.disabled = true;
      return;
    }

    if (!pendingReverseDiff || !importedJsonRoot) return;
    const merged = applyReverseDiff(importedJsonRoot, pendingReverseDiff);
    const text = JSON.stringify(merged, null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${importedFileName}.synced.json`;
    a.click();
    URL.revokeObjectURL(url);
    diffEl.textContent = `${summarizeReverseDiff(pendingReverseDiff)}\n\nApplied to external JSON and downloaded: ${a.download}`;
    importedJsonRoot = merged;
    pendingReverseDiff = null;
    applyBtn.disabled = true;
  });

  panel.querySelector('.dte-download-btn')!.addEventListener('click', () => { editor.downloadDesignTokens(selectedFormat); closePanel(); });

  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { closePanel(); e.stopPropagation(); } };
  document.addEventListener('keydown', onKey, true);
  (panel as any)._keyHandler = onKey;
}

function closePanel() {
  if (!panel) return;
  const handler = (panel as any)._keyHandler;
  if (handler) document.removeEventListener('keydown', handler, true);
  panel.remove();
  panel = null;
  pendingDiff = null;
  pendingReverseDiff = null;
  importedJsonRoot = null;
  syncDirection = 'external-to-local';
}

function flattenTokens(input: any, path: string[] = [], out: TokenLeaf[] = []): TokenLeaf[] {
  if (input == null) return out;

  // Style Dictionary leafs often end as primitives at the path.
  if (typeof input !== 'object') {
    out.push({ path: path.join('.'), value: input });
    return out;
  }

  const hasVal = Object.prototype.hasOwnProperty.call(input, '$value') || Object.prototype.hasOwnProperty.call(input, 'value');
  if (hasVal) {
    out.push({ path: path.join('.'), value: (input.$value ?? input.value) });
    return out;
  }

  // Allow typography bundles as direct leaves.
  if (looksLikeTypography(input)) {
    out.push({ path: path.join('.'), value: input });
    return out;
  }

  for (const [k, v] of Object.entries(input)) {
    if (k.startsWith('$')) continue;
    flattenTokens(v, [...path, k], out);
  }
  return out;
}

function resolveTokenReference(value: any, lookup: Map<string, any>, seen: Set<string> = new Set()): any {
  if (typeof value !== 'string') return value;
  const m = value.trim().match(/^\{([^}]+)\}$/);
  if (!m) return value;
  const key = m[1].trim();
  if (seen.has(key)) return value;
  const next = lookup.get(key);
  if (next === undefined) return value;
  seen.add(key);
  return resolveTokenReference(next, lookup, seen);
}

function looksLikeTypography(v: any) {
  return v && typeof v === 'object' && (v.fontFamily || v.fontSize || v.fontWeight || v.lineHeight || v.textAlign);
}

function parseColor(value: any): { r:number; g:number; b:number; a:number } | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  const hex = s.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    const h = hex[1];
    if (h.length === 3) return { r: parseInt(h[0]+h[0],16), g: parseInt(h[1]+h[1],16), b: parseInt(h[2]+h[2],16), a: 1 };
    if (h.length === 6) return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16), a: 1 };
    if (h.length === 8) return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16), a: +(parseInt(h.slice(6,8),16)/255).toFixed(3) };
  }
  const rgb = s.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const p = rgb[1].split(',').map(x=>x.trim());
    if (p.length >= 3) return { r:+p[0], g:+p[1], b:+p[2], a: p[3] != null ? +p[3] : 1 };
  }
  return null;
}

function getCollection(editor: Editor, name: string) {
  const cols: any[] = JSON.parse(editor.engine.get_collections() || '[]');
  let c = cols.find(x => x.name === name);
  if (!c) {
    const id = Number(editor.engine.create_collection(name));
    c = JSON.parse(editor.engine.get_collections() || '[]').find((x:any)=>x.id===id);
  }
  return c;
}

function computeDiff(editor: Editor, leaves: TokenLeaf[]): DiffResult {
  const colors: any[] = JSON.parse(editor.engine.list_color_styles() || '[]');
  const texts: any[] = JSON.parse(editor.engine.list_text_styles() || '[]');
  const cols: any[] = JSON.parse(editor.engine.get_collections() || '[]');
  const tokenCol = cols.find(c => c.name === 'Tokens');
  const vars = tokenCol?.variables || [];

  const cMap = new Map(colors.map(s => [s.name, s]));
  const tMap = new Map(texts.map(s => [s.name, s]));
  const vMap = new Map(vars.map((v:any) => [v.name, v]));

  const resolvedLookup = new Map(leaves.map(l => [l.path, l.value]));
  const resolvedLeaves = leaves.map(leaf => ({
    path: leaf.path,
    value: resolveTokenReference(leaf.value, resolvedLookup),
  }));

  const d: DiffResult = { addColor: [], updateColor: [], addText: [], updateText: [], addVar: [], updateVar: [] };
  for (const leaf of resolvedLeaves) {
    const name = leaf.path || 'token';
    const color = parseColor(leaf.value);
    if (color) {
      const ex = cMap.get(name);
      if (!ex) d.addColor.push(leaf); else if (ex.r!==color.r || ex.g!==color.g || ex.b!==color.b || Math.abs(ex.a-color.a)>0.001) d.updateColor.push(leaf);
      continue;
    }
    if (looksLikeTypography(leaf.value)) {
      const ex = tMap.get(name);
      if (!ex) d.addText.push(leaf); else d.updateText.push(leaf);
      continue;
    }
    if (['string','number','boolean'].includes(typeof leaf.value)) {
      const ex = vMap.get(name);
      if (!ex) d.addVar.push(leaf); else d.updateVar.push(leaf);
    }
  }
  return d;
}



function getLocalTokenLeaves(editor: Editor): TokenLeaf[] {
  let w3c: any = {};
  try {
    w3c = JSON.parse(editor.exportDesignTokens('w3c') || '{}');
  } catch {
    w3c = {};
  }
  return flattenTokens(w3c);
}

function isEqualTokenValue(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function computeReverseDiff(editor: Editor, externalLeaves: TokenLeaf[]): ReverseDiffResult {
  const localLeaves = getLocalTokenLeaves(editor);
  const eMap = new Map(externalLeaves.map(l => [l.path, l.value]));
  const lMap = new Map(localLeaves.map(l => [l.path, l.value]));
  const d: ReverseDiffResult = { add: [], update: [], remove: [] };

  for (const [path, value] of lMap.entries()) {
    const ex = eMap.get(path);
    if (ex === undefined) d.add.push({ path, value });
    else if (!isEqualTokenValue(ex, value)) d.update.push({ path, value });
  }
  for (const [path, value] of eMap.entries()) {
    if (!lMap.has(path)) d.remove.push({ path, value });
  }
  return d;
}

function summarizeReverseDiff(d: ReverseDiffResult): string {
  return [
    `External JSON sync: +${d.add.length} / ~${d.update.length} / -${d.remove.length}`,
    'Direction: OpenSketch → External JSON',
  ].join('\n');
}

function totalReverseDiff(d: ReverseDiffResult) {
  return d.add.length + d.update.length + d.remove.length;
}

function setByPath(root: any, path: string, value: any) {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return;
  let cur = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (cur[key] == null || typeof cur[key] !== 'object') cur[key] = {};
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
}

function deleteByPath(root: any, path: string) {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return;
  let cur = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    cur = cur?.[parts[i]];
    if (!cur || typeof cur !== 'object') return;
  }
  if (cur && typeof cur === 'object') delete cur[parts[parts.length - 1]];
}

function applyReverseDiff(importedRoot: any, d: ReverseDiffResult): any {
  const next = JSON.parse(JSON.stringify(importedRoot || {}));
  for (const leaf of d.remove) deleteByPath(next, leaf.path);
  for (const leaf of [...d.add, ...d.update]) setByPath(next, leaf.path, leaf.value);
  return next;
}

function summarizeDiff(d: DiffResult): string {
  return [
    `Color styles: +${d.addColor.length} / ~${d.updateColor.length}`,
    `Text styles:  +${d.addText.length} / ~${d.updateText.length}`,
    `Variables:    +${d.addVar.length} / ~${d.updateVar.length}`,
  ].join('\n');
}

function totalDiff(d: DiffResult) {
  return d.addColor.length + d.updateColor.length + d.addText.length + d.updateText.length + d.addVar.length + d.updateVar.length;
}

function applyDiff(editor: Editor, d: DiffResult): number {
  editor.engine.push_undo();
  const colors: any[] = JSON.parse(editor.engine.list_color_styles() || '[]');
  const texts: any[] = JSON.parse(editor.engine.list_text_styles() || '[]');
  let applied = 0;

  const cMap = new Map(colors.map(s => [s.name, s]));
  const tMap = new Map(texts.map(s => [s.name, s]));

  for (const leaf of [...d.addColor, ...d.updateColor]) {
    const c = parseColor(leaf.value); if (!c) continue;
    const ex = cMap.get(leaf.path);
    if (!ex) editor.engine.add_color_style(leaf.path, c.r, c.g, c.b, c.a);
    else editor.engine.update_color_style(BigInt(ex.id), leaf.path, c.r, c.g, c.b, c.a);
    applied += 1;
  }

  for (const leaf of [...d.addText, ...d.updateText]) {
    const t = leaf.value || {};
    const name = leaf.path;
    const family = String(t.fontFamily || t.font_family || 'Inter');
    const size = Number(t.fontSize ?? t.font_size ?? 16);
    const weight = Number(t.fontWeight ?? t.font_weight ?? 400);
    const style = String(t.fontStyle || t.font_style || 'Normal');
    const lineHeight = Number(t.lineHeight ?? t.line_height ?? 1.4);
    const align = String(t.textAlign || t.text_align || 'Left');
    const col = parseColor(t.color || '#000000') || { r: 0, g: 0, b: 0, a: 1 };
    const ex = tMap.get(name);
    if (!ex) {
      editor.engine.add_text_style(name, family, size, weight, style, lineHeight, align, col.r, col.g, col.b, col.a);
    } else {
      editor.engine.update_text_style(BigInt(ex.id), JSON.stringify({ ...ex, name, font_family: family, font_size: size, font_weight: weight, font_style: style, line_height: lineHeight, text_align: align, r: col.r, g: col.g, b: col.b, a: col.a }));
    }
    applied += 1;
  }

  const collection = getCollection(editor, 'Tokens');
  const modeId = Number(collection?.active_mode_id || collection?.modes?.[0]?.id || 0);
  const colId = Number(collection?.id || 0);
  const fresh = JSON.parse(editor.engine.get_collections() || '[]').find((c:any)=>c.id===colId);
  const vMap = new Map((fresh?.variables || []).map((v:any)=>[v.name,v]));

  for (const leaf of [...d.addVar, ...d.updateVar]) {
    const valType = typeof leaf.value;
    if (!['string','number','boolean'].includes(valType)) continue;
    let v = vMap.get(leaf.path);
    if (!v) {
      const id = Number(editor.engine.create_variable(BigInt(colId), leaf.path, valType));
      v = { id, name: leaf.path };
      vMap.set(leaf.path, v);
    }
    editor.engine.set_variable_value(BigInt(colId), BigInt(v.id), BigInt(modeId), JSON.stringify(leaf.value));
    applied += 1;
  }

  editor.engine.apply_variables();
  return applied;
}
