// Snapshot Testing (Visual Regression) UI
// Capture PNG snapshots of pages/frames, compare with baselines, view diff reports

import type { Editor } from '../editor';

interface SnapshotMeta {
  id: string;
  name: string;
  target_type: 'page' | 'frame' | 'node';
  target_id: number;
  width: number;
  height: number;
  timestamp: number;
  hash: number;
}

interface DiffResult {
  total_pixels: number;
  changed_pixels: number;
  diff_percentage: number;
  passed: boolean;
  threshold: number;
  max_channel_diff: number;
}

const DB_NAME = 'opensketch-snapshots';
const STORE_NAME = 'images';

// ─── IndexedDB helpers ───
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: Uint8Array): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function idbGet(key: string): Promise<Uint8Array | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// ─── Capture canvas as RGBA ───
function captureCanvasRGBA(editor: Editor, scale = 1): { data: Uint8Array; width: number; height: number } {
  const canvas = (editor as any).canvas as HTMLCanvasElement;
  const w = Math.round(canvas.width * scale);
  const h = Math.round(canvas.height * scale);

  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = h;
  const ctx = offscreen.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  return { data: new Uint8Array(imageData.data.buffer), width: w, height: h };
}

// ─── Main panel ───
export function initSnapshotPanel(editor: Editor) {
  const engine = (editor as any).engine;
  let container: HTMLDivElement | null = null;
  let visible = false;

  function getSnapshots(): SnapshotMeta[] {
    try { return JSON.parse(engine.snapshot_list()); } catch { return []; }
  }

  function show() {
    if (container) { container.remove(); }
    visible = true;
    container = document.createElement('div');
    container.id = 'snapshot-panel';
    Object.assign(container.style, {
      position: 'fixed', top: '60px', right: '320px', width: '360px', maxHeight: '80vh',
      background: '#1e1e2e', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      zIndex: '10000', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.08)', color: '#cdd6f4', fontFamily: 'system-ui, sans-serif', fontSize: '13px',
    });
    container.innerHTML = `
      <div style="padding:12px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.06)">
        <span style="font-weight:600;font-size:14px">📸 Snapshot Testing</span>
        <div style="display:flex;gap:8px;align-items:center">
          <button id="snap-capture" style="background:#89b4fa;color:#1e1e2e;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;font-weight:600">Capture</button>
          <button id="snap-close" style="background:none;border:none;color:#6c7086;cursor:pointer;font-size:16px">✕</button>
        </div>
      </div>
      <div style="padding:8px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;gap:8px;align-items:center">
        <label style="font-size:11px;color:#6c7086">Threshold %</label>
        <input id="snap-threshold" type="number" min="0" max="100" step="0.01" value="${engine.snapshot_get_threshold()}"
          style="width:60px;background:#313244;border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:#cdd6f4;padding:2px 6px;font-size:12px">
      </div>
      <div id="snap-list" style="overflow-y:auto;flex:1;padding:8px"></div>
    `;
    document.body.appendChild(container);

    container.querySelector('#snap-close')!.addEventListener('click', hide);
    container.querySelector('#snap-capture')!.addEventListener('click', captureSnapshot);
    container.querySelector('#snap-threshold')!.addEventListener('change', (e) => {
      engine.snapshot_set_threshold(parseFloat((e.target as HTMLInputElement).value));
    });
    renderList();
  }

  function hide() {
    visible = false;
    container?.remove();
    container = null;
  }

  function toggle() { visible ? hide() : show(); }

  async function captureSnapshot() {
    const { data, width, height } = captureCanvasRGBA(editor);
    const hash = engine.snapshot_hash(data);
    const id = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Get active page info
    let pageName = 'Canvas';
    try {
      const pages = JSON.parse(engine.get_pages());
      const activeId = Number(engine.get_active_page_id());
      const p = pages.find((pg: any) => pg.id === activeId);
      if (p) pageName = p.name;
    } catch {}

    const name = `${pageName} — ${new Date().toLocaleString()}`;
    let targetId = 0;
    try { targetId = Number(engine.get_active_page_id()); } catch {}

    engine.snapshot_register(id, name, 'page', targetId, width, height, Date.now(), hash);
    await idbPut(id, data);
    renderList();
  }

  async function compareSnapshot(snapId: string) {
    const meta: SnapshotMeta | null = getSnapshots().find(s => s.id === snapId) ?? null;
    if (!meta) return;
    const baseline = await idbGet(snapId);
    if (!baseline) { alert('Baseline image not found'); return; }

    const { data: current, width, height } = captureCanvasRGBA(editor);
    const resultJson = engine.snapshot_diff(baseline, current, width, height);
    const result: DiffResult = JSON.parse(resultJson);

    // Generate diff image
    const diffRGBA: Uint8Array = engine.snapshot_diff_image(baseline, current, width, height);

    showDiffReport(meta, result, baseline, current, diffRGBA, width, height);
  }

  function showDiffReport(meta: SnapshotMeta, result: DiffResult, baseline: Uint8Array, current: Uint8Array, diffRGBA: Uint8Array, w: number, h: number) {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.7)', zIndex: '20000',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    });

    const statusColor = result.passed ? '#a6e3a1' : '#f38ba8';
    const statusText = result.passed ? 'PASS ✓' : 'FAIL ✗';

    const modal = document.createElement('div');
    Object.assign(modal.style, {
      background: '#1e1e2e', borderRadius: '16px', padding: '24px', maxWidth: '90vw', maxHeight: '90vh',
      overflow: 'auto', color: '#cdd6f4', fontFamily: 'system-ui', minWidth: '600px',
    });

    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h2 style="margin:0;font-size:18px">Diff Report: ${meta.name}</h2>
        <button id="diff-close" style="background:none;border:none;color:#6c7086;cursor:pointer;font-size:20px">✕</button>
      </div>
      <div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap">
        <div style="background:#313244;border-radius:8px;padding:12px;flex:1;min-width:120px;text-align:center">
          <div style="font-size:24px;font-weight:700;color:${statusColor}">${statusText}</div>
          <div style="font-size:11px;color:#6c7086;margin-top:4px">Status</div>
        </div>
        <div style="background:#313244;border-radius:8px;padding:12px;flex:1;min-width:120px;text-align:center">
          <div style="font-size:24px;font-weight:700">${result.diff_percentage.toFixed(2)}%</div>
          <div style="font-size:11px;color:#6c7086;margin-top:4px">Diff (threshold: ${result.threshold}%)</div>
        </div>
        <div style="background:#313244;border-radius:8px;padding:12px;flex:1;min-width:120px;text-align:center">
          <div style="font-size:24px;font-weight:700">${result.changed_pixels.toLocaleString()}</div>
          <div style="font-size:11px;color:#6c7086;margin-top:4px">Changed / ${result.total_pixels.toLocaleString()} px</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button class="diff-tab active" data-tab="diff" style="padding:6px 12px;border-radius:6px;border:none;cursor:pointer;font-size:12px;background:#89b4fa;color:#1e1e2e;font-weight:600">Diff</button>
        <button class="diff-tab" data-tab="baseline" style="padding:6px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;font-size:12px;background:transparent;color:#cdd6f4">Baseline</button>
        <button class="diff-tab" data-tab="current" style="padding:6px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;font-size:12px;background:transparent;color:#cdd6f4">Current</button>
      </div>
      <div id="diff-canvas-wrap" style="border-radius:8px;overflow:hidden;background:#11111b;display:flex;justify-content:center"></div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const wrap = modal.querySelector('#diff-canvas-wrap') as HTMLDivElement;

    function renderImage(rgba: Uint8Array, iw: number, ih: number) {
      wrap.innerHTML = '';
      const c = document.createElement('canvas');
      c.width = iw; c.height = ih;
      c.style.maxWidth = '100%'; c.style.height = 'auto';
      const ctx = c.getContext('2d')!;
      const imgData = new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), iw, ih);
      ctx.putImageData(imgData, 0, 0);
      wrap.appendChild(c);
    }

    renderImage(diffRGBA, w, h);

    modal.querySelectorAll('.diff-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.diff-tab').forEach(b => {
          (b as HTMLElement).style.background = 'transparent';
          (b as HTMLElement).style.color = '#cdd6f4';
          (b as HTMLElement).style.border = '1px solid rgba(255,255,255,0.1)';
        });
        (btn as HTMLElement).style.background = '#89b4fa';
        (btn as HTMLElement).style.color = '#1e1e2e';
        (btn as HTMLElement).style.border = 'none';
        const tab = (btn as HTMLElement).dataset.tab;
        if (tab === 'diff') renderImage(diffRGBA, w, h);
        else if (tab === 'baseline') renderImage(baseline, w, h);
        else renderImage(current, w, h);
      });
    });

    modal.querySelector('#diff-close')!.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  }

  function renderList() {
    const list = container?.querySelector('#snap-list');
    if (!list) return;
    const snaps = getSnapshots();
    if (snaps.length === 0) {
      list.innerHTML = '<div style="text-align:center;padding:32px 0;color:#6c7086">No snapshots yet.<br>Click <b>Capture</b> to create a baseline.</div>';
      return;
    }
    list.innerHTML = snaps.map(s => `
      <div class="snap-item" data-id="${s.id}" style="background:#313244;border-radius:8px;padding:10px 12px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-weight:500;font-size:12px">${s.name}</div>
          <div style="font-size:10px;color:#6c7086">${s.width}×${s.height} · ${s.target_type}</div>
        </div>
        <div style="display:flex;gap:4px">
          <button class="snap-compare" data-id="${s.id}" style="background:#a6e3a1;color:#1e1e2e;border:none;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;font-weight:600">Compare</button>
          <button class="snap-delete" data-id="${s.id}" style="background:#f38ba8;color:#1e1e2e;border:none;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;font-weight:600">✕</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.snap-compare').forEach(btn => {
      btn.addEventListener('click', () => compareSnapshot((btn as HTMLElement).dataset.id!));
    });
    list.querySelectorAll('.snap-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.id!;
        engine.snapshot_remove(id);
        await idbDelete(id);
        renderList();
      });
    });
  }

  return { show, hide, toggle };
}
