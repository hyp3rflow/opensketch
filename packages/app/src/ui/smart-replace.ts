/**
 * Smart Replace — find and replace nodes with similar size/aspect-ratio
 */

import type { Engine } from "../wasm/opensketch_engine";

interface SimilarNode {
  id: number;
  name: string;
  width: number;
  height: number;
  similarity: number;
}

let panelEl: HTMLDivElement | null = null;

export function isSmartReplaceOpen(): boolean {
  return panelEl !== null;
}

export function closeSmartReplace(): void {
  if (panelEl) {
    panelEl.remove();
    panelEl = null;
  }
}

export function openSmartReplace(
  engine: Engine,
  sourceNodeId: number,
  onApplied: () => void,
  onHighlightNode?: (nodeId: number | null) => void,
): void {
  if (panelEl) { closeSmartReplace(); return; }

  let ratioThreshold = 0.1;
  let sizeThreshold = 0.5;

  function findSimilar(): SimilarNode[] {
    try {
      const json = engine.find_similar_nodes(sourceNodeId, ratioThreshold, sizeThreshold);
      return JSON.parse(json);
    } catch {
      return [];
    }
  }

  let results = findSimilar();
  const selected = new Set<number>(results.map(r => r.id));

  panelEl = document.createElement("div");
  panelEl.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 520px; max-height: 600px; background: #1e1e2e; border-radius: 14px;
    box-shadow: 0 12px 48px rgba(0,0,0,0.6); z-index: 9999; display: flex;
    flex-direction: column; color: #e0e0e0; font-family: Inter, -apple-system, system-ui, sans-serif;
    font-size: 13px; overflow: hidden; border: 1px solid #2a2a3a;
  `;

  // Header
  const header = document.createElement("div");
  header.style.cssText = `
    padding: 16px 20px; border-bottom: 1px solid #2a2a3a; display: flex;
    align-items: center; justify-content: space-between; flex-shrink: 0;
  `;
  header.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M16 3h5v5"/><path d="M8 21H3v-5"/><path d="M21 3l-8.5 8.5"/><path d="M3 21l8.5-8.5"/>
      </svg>
      <span style="font-weight:600; font-size:14px;">Smart Replace</span>
      <span style="color:#888; font-size:12px;">${results.length} similar node${results.length !== 1 ? "s" : ""}</span>
    </div>
  `;
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = `background:none; border:none; color:#888; cursor:pointer; font-size:16px; padding:4px;`;
  closeBtn.addEventListener("click", closeSmartReplace);
  header.appendChild(closeBtn);
  panelEl.appendChild(header);

  // Threshold controls
  const controls = document.createElement("div");
  controls.style.cssText = `padding: 10px 20px; border-bottom: 1px solid #2a2a3a; display:flex; gap:16px; align-items:center; font-size:12px; color:#999;`;
  controls.innerHTML = `
    <label style="display:flex; align-items:center; gap:6px;">
      Ratio ±<input type="number" value="${ratioThreshold * 100}" min="1" max="100" step="5" style="width:48px; background:#2a2a3a; border:1px solid #3a3a4a; border-radius:4px; color:#e0e0e0; padding:2px 4px; font-size:12px;" id="sr-ratio">%
    </label>
    <label style="display:flex; align-items:center; gap:6px;">
      Size ±<input type="number" value="${sizeThreshold * 100}" min="10" max="200" step="10" style="width:48px; background:#2a2a3a; border:1px solid #3a3a4a; border-radius:4px; color:#e0e0e0; padding:2px 4px; font-size:12px;" id="sr-size">%
    </label>
    <button id="sr-refresh" style="background:#a78bfa22; border:1px solid #a78bfa44; border-radius:6px; color:#a78bfa; padding:3px 10px; cursor:pointer; font-size:12px;">Refresh</button>
  `;
  panelEl.appendChild(controls);

  // List
  const list = document.createElement("div");
  list.style.cssText = `flex:1; overflow-y:auto; padding:8px 12px;`;

  function renderList() {
    list.innerHTML = "";
    if (results.length === 0) {
      list.innerHTML = `<div style="text-align:center; padding:40px 0; color:#666;">No similar nodes found.<br><span style="font-size:11px;">Try increasing the thresholds.</span></div>`;
      return;
    }
    for (const r of results) {
      const row = document.createElement("label");
      row.style.cssText = `
        display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:8px;
        cursor:pointer; transition:background 0.15s;
      `;
      row.addEventListener("mouseenter", () => {
        row.style.background = "#2a2a3a";
        onHighlightNode?.(r.id);
      });
      row.addEventListener("mouseleave", () => {
        row.style.background = "transparent";
        onHighlightNode?.(null);
      });

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selected.has(r.id);
      cb.style.cssText = `accent-color:#a78bfa;`;
      cb.addEventListener("change", () => {
        if (cb.checked) selected.add(r.id); else selected.delete(r.id);
      });

      const simPct = Math.round(r.similarity * 100);
      const simColor = simPct >= 80 ? "#34d399" : simPct >= 50 ? "#fbbf24" : "#f87171";

      row.innerHTML = `
        <div style="width:32px; height:32px; background:#2a2a3a; border-radius:6px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
        </div>
        <div style="flex:1; min-width:0;">
          <div style="font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${r.name || `Node ${r.id}`}</div>
          <div style="font-size:11px; color:#888;">${Math.round(r.width)}×${Math.round(r.height)}</div>
        </div>
        <div style="font-size:12px; font-weight:600; color:${simColor};">${simPct}%</div>
      `;
      row.prepend(cb);
      list.appendChild(row);
    }
  }
  renderList();
  panelEl.appendChild(list);

  // Footer
  const footer = document.createElement("div");
  footer.style.cssText = `
    padding: 14px 20px; border-top: 1px solid #2a2a3a; display:flex;
    justify-content: flex-end; gap:10px; flex-shrink:0;
  `;

  const selectAllBtn = document.createElement("button");
  selectAllBtn.textContent = "Select All";
  selectAllBtn.style.cssText = `background:none; border:1px solid #3a3a4a; border-radius:8px; color:#ccc; padding:6px 14px; cursor:pointer; font-size:12px;`;
  selectAllBtn.addEventListener("click", () => {
    results.forEach(r => selected.add(r.id));
    renderList();
  });

  const replaceSelectedBtn = document.createElement("button");
  replaceSelectedBtn.textContent = "Replace Selected";
  replaceSelectedBtn.style.cssText = `background:#a78bfa33; border:1px solid #a78bfa66; border-radius:8px; color:#a78bfa; padding:6px 14px; cursor:pointer; font-size:12px; font-weight:500;`;
  replaceSelectedBtn.addEventListener("click", () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const count = engine.replace_with_node(sourceNodeId, JSON.stringify(ids));
    onApplied();
    closeSmartReplace();
  });

  const replaceAllBtn = document.createElement("button");
  replaceAllBtn.textContent = "Replace All";
  replaceAllBtn.style.cssText = `background:#a78bfa; border:none; border-radius:8px; color:#fff; padding:6px 16px; cursor:pointer; font-size:12px; font-weight:600;`;
  replaceAllBtn.addEventListener("click", () => {
    const ids = results.map(r => r.id);
    if (ids.length === 0) return;
    const count = engine.replace_with_node(sourceNodeId, JSON.stringify(ids));
    onApplied();
    closeSmartReplace();
  });

  footer.appendChild(selectAllBtn);
  footer.appendChild(replaceSelectedBtn);
  footer.appendChild(replaceAllBtn);
  panelEl.appendChild(footer);

  // Wire up refresh
  document.body.appendChild(panelEl);
  const refreshBtn = panelEl.querySelector("#sr-refresh") as HTMLButtonElement;
  const ratioInput = panelEl.querySelector("#sr-ratio") as HTMLInputElement;
  const sizeInput = panelEl.querySelector("#sr-size") as HTMLInputElement;
  refreshBtn?.addEventListener("click", () => {
    ratioThreshold = (parseFloat(ratioInput.value) || 10) / 100;
    sizeThreshold = (parseFloat(sizeInput.value) || 50) / 100;
    results = findSimilar();
    selected.clear();
    results.forEach(r => selected.add(r.id));
    renderList();
    // Update count in header
    const countSpan = header.querySelector("span:last-of-type") as HTMLElement;
    if (countSpan) countSpan.textContent = `${results.length} similar node${results.length !== 1 ? "s" : ""}`;
  });

  // ESC to close
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      closeSmartReplace();
      window.removeEventListener("keydown", escHandler);
    }
  };
  window.addEventListener("keydown", escHandler);
}
