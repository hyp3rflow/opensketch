/**
 * Multi-Canvas Comparison — Side-by-side page comparison with synchronized pan/zoom
 * and visual diff highlighting.
 *
 * Usage: Cmd+Alt+C to open, select two pages, synchronized navigation.
 */
import type { Editor } from "../editor";

interface PageInfo {
  id: number;
  name: string;
}

interface NodeSummary {
  id: number;
  name: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  parentId: number;
}

interface DiffResult {
  added: NodeSummary[];     // in right only
  removed: NodeSummary[];   // in left only
  modified: Array<{ left: NodeSummary; right: NodeSummary; changes: string[] }>;
  unchanged: number;
}

export function createCanvasComparison(editor: Editor) {
  let overlay: HTMLDivElement | null = null;
  let active = false;
  let leftPageId = -1;
  let rightPageId = -1;
  let pages: PageInfo[] = [];
  let zoom = 0.5;
  let panX = 0;
  let panY = 0;
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartPanX = 0;
  let dragStartPanY = 0;
  let leftCanvas: HTMLCanvasElement | null = null;
  let rightCanvas: HTMLCanvasElement | null = null;
  let diffResult: DiffResult | null = null;
  let showDiff = true;
  let savedPageId: number | null = null;

  function show() {
    if (active) return;

    try {
      pages = JSON.parse(editor.engine.get_pages()) as PageInfo[];
    } catch {
      pages = [{ id: 1, name: "Page 1" }];
    }
    if (pages.length < 2) {
      alert("Need at least 2 pages to compare.");
      return;
    }

    active = true;
    savedPageId = Number(editor.engine.get_active_page_id());
    leftPageId = pages[0].id;
    rightPageId = pages.length > 1 ? pages[1].id : pages[0].id;

    buildUI();
    renderBoth();
    computeDiff();
  }

  function hide() {
    if (!active) return;
    active = false;
    if (savedPageId !== null) {
      try { editor.engine.set_active_page(BigInt(savedPageId)); } catch {}
      savedPageId = null;
    }
    overlay?.remove();
    overlay = null;
    leftCanvas = null;
    rightCanvas = null;
    diffResult = null;
  }

  function buildUI() {
    overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:10000;background:#1a1a1a;display:flex;flex-direction:column;";

    // Top bar
    const topBar = document.createElement("div");
    topBar.style.cssText = "height:48px;background:#252525;border-bottom:1px solid #333;display:flex;align-items:center;padding:0 16px;gap:12px;flex-shrink:0;";

    const title = document.createElement("span");
    title.style.cssText = "color:#fff;font-size:14px;font-weight:600;";
    title.textContent = "📊 Page Comparison";
    topBar.appendChild(title);

    // Left page selector
    const leftLabel = document.createElement("span");
    leftLabel.style.cssText = "color:#888;font-size:12px;margin-left:20px;";
    leftLabel.textContent = "Left:";
    topBar.appendChild(leftLabel);
    const leftSel = createPageSelect(leftPageId, (id) => {
      leftPageId = id;
      renderBoth();
      computeDiff();
    });
    topBar.appendChild(leftSel);

    // Right page selector
    const rightLabel = document.createElement("span");
    rightLabel.style.cssText = "color:#888;font-size:12px;";
    rightLabel.textContent = "Right:";
    topBar.appendChild(rightLabel);
    const rightSel = createPageSelect(rightPageId, (id) => {
      rightPageId = id;
      renderBoth();
      computeDiff();
    });
    topBar.appendChild(rightSel);

    // Diff toggle
    const diffBtn = document.createElement("button");
    diffBtn.style.cssText = "margin-left:auto;padding:6px 14px;border-radius:6px;border:1px solid #555;background:#2a2a2a;color:#ccc;font-size:12px;cursor:pointer;";
    diffBtn.textContent = "🔍 Show Diff";
    diffBtn.onclick = () => {
      showDiff = !showDiff;
      diffBtn.textContent = showDiff ? "🔍 Hide Diff" : "🔍 Show Diff";
      drawDiffOverlays();
    };
    topBar.appendChild(diffBtn);

    // Zoom controls
    const zoomOut = document.createElement("button");
    zoomOut.style.cssText = "padding:4px 10px;border-radius:4px;border:1px solid #555;background:#2a2a2a;color:#ccc;font-size:14px;cursor:pointer;";
    zoomOut.textContent = "−";
    zoomOut.onclick = () => { zoom = Math.max(0.1, zoom * 0.8); renderBoth(); };
    topBar.appendChild(zoomOut);

    const zoomLabel = document.createElement("span");
    zoomLabel.id = "comp-zoom-label";
    zoomLabel.style.cssText = "color:#888;font-size:11px;min-width:40px;text-align:center;";
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    topBar.appendChild(zoomLabel);

    const zoomIn = document.createElement("button");
    zoomIn.style.cssText = "padding:4px 10px;border-radius:4px;border:1px solid #555;background:#2a2a2a;color:#ccc;font-size:14px;cursor:pointer;";
    zoomIn.textContent = "+";
    zoomIn.onclick = () => { zoom = Math.min(5, zoom * 1.25); renderBoth(); };
    topBar.appendChild(zoomIn);

    // Fit button
    const fitBtn = document.createElement("button");
    fitBtn.style.cssText = "padding:4px 10px;border-radius:4px;border:1px solid #555;background:#2a2a2a;color:#ccc;font-size:11px;cursor:pointer;";
    fitBtn.textContent = "Fit";
    fitBtn.onclick = () => { zoom = 0.5; panX = 0; panY = 0; renderBoth(); };
    topBar.appendChild(fitBtn);

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.style.cssText = "padding:6px 14px;border-radius:6px;border:none;background:#c0392b;color:#fff;font-size:12px;cursor:pointer;font-weight:600;";
    closeBtn.textContent = "Close";
    closeBtn.onclick = hide;
    topBar.appendChild(closeBtn);

    overlay.appendChild(topBar);

    // Canvas area
    const canvasArea = document.createElement("div");
    canvasArea.style.cssText = "flex:1;display:flex;gap:2px;overflow:hidden;background:#111;";

    // Left pane
    const leftPane = document.createElement("div");
    leftPane.style.cssText = "flex:1;position:relative;overflow:hidden;";
    const leftHeader = document.createElement("div");
    leftHeader.style.cssText = "position:absolute;top:8px;left:8px;z-index:1;background:rgba(0,0,0,0.7);color:#ccc;padding:4px 10px;border-radius:4px;font-size:11px;";
    leftHeader.id = "comp-left-header";
    leftPane.appendChild(leftHeader);
    leftCanvas = document.createElement("canvas");
    leftCanvas.style.cssText = "width:100%;height:100%;cursor:grab;";
    leftPane.appendChild(leftCanvas);
    canvasArea.appendChild(leftPane);

    // Divider
    const divider = document.createElement("div");
    divider.style.cssText = "width:2px;background:#444;flex-shrink:0;";
    canvasArea.appendChild(divider);

    // Right pane
    const rightPane = document.createElement("div");
    rightPane.style.cssText = "flex:1;position:relative;overflow:hidden;";
    const rightHeader = document.createElement("div");
    rightHeader.style.cssText = "position:absolute;top:8px;left:8px;z-index:1;background:rgba(0,0,0,0.7);color:#ccc;padding:4px 10px;border-radius:4px;font-size:11px;";
    rightHeader.id = "comp-right-header";
    rightPane.appendChild(rightHeader);
    rightCanvas = document.createElement("canvas");
    rightCanvas.style.cssText = "width:100%;height:100%;cursor:grab;";
    rightPane.appendChild(rightCanvas);
    canvasArea.appendChild(rightPane);

    overlay.appendChild(canvasArea);

    // Diff summary bar
    const diffBar = document.createElement("div");
    diffBar.id = "comp-diff-bar";
    diffBar.style.cssText = "height:36px;background:#252525;border-top:1px solid #333;display:flex;align-items:center;padding:0 16px;gap:16px;font-size:12px;flex-shrink:0;";
    overlay.appendChild(diffBar);

    document.body.appendChild(overlay);

    // Sync pan/zoom via mouse events on both canvases
    for (const cvs of [leftCanvas, rightCanvas]) {
      cvs.addEventListener("mousedown", onMouseDown);
      cvs.addEventListener("wheel", onWheel, { passive: false });
    }
    document.addEventListener("keydown", onKeyDown);
  }

  function createPageSelect(selectedId: number, onChange: (id: number) => void): HTMLSelectElement {
    const sel = document.createElement("select");
    sel.style.cssText = "background:#1e1e1e;color:#ccc;border:1px solid #444;border-radius:4px;padding:4px 8px;font-size:12px;";
    for (const p of pages) {
      const opt = document.createElement("option");
      opt.value = String(p.id);
      opt.textContent = p.name;
      if (p.id === selectedId) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.onchange = () => onChange(parseInt(sel.value));
    return sel;
  }

  function renderBoth() {
    if (!leftCanvas || !rightCanvas || !active) return;

    const dpr = window.devicePixelRatio || 1;

    for (const [canvas, pageId, headerId] of [
      [leftCanvas, leftPageId, "comp-left-header"],
      [rightCanvas, rightPageId, "comp-right-header"],
    ] as [HTMLCanvasElement, number, string][]) {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Clear
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(0, 0, rect.width, rect.height);

      // Set viewport on engine temporarily and render
      const oldZoom = editor.engine.get_zoom();
      const oldPanX = editor.engine.get_pan_x();
      const oldPanY = editor.engine.get_pan_y();

      editor.engine.set_viewport(zoom, panX, panY);
      editor.engine.render_page(ctx as any, BigInt(pageId));

      // Restore viewport
      editor.engine.set_viewport(oldZoom, oldPanX, oldPanY);

      // Header label
      const header = document.getElementById(headerId);
      if (header) {
        const pageName = pages.find(p => p.id === pageId)?.name || "?";
        header.textContent = pageName;
      }
    }

    // Update zoom label
    const zoomLabel = document.getElementById("comp-zoom-label");
    if (zoomLabel) zoomLabel.textContent = `${Math.round(zoom * 100)}%`;

    drawDiffOverlays();
  }

  function computeDiff() {
    if (!active) return;

    try {
      const leftNodes: NodeSummary[] = JSON.parse(editor.engine.get_page_node_summaries(BigInt(leftPageId)));
      const rightNodes: NodeSummary[] = JSON.parse(editor.engine.get_page_node_summaries(BigInt(rightPageId)));

      const leftMap = new Map(leftNodes.map(n => [n.name + "|" + n.kind, n]));
      const rightMap = new Map(rightNodes.map(n => [n.name + "|" + n.kind, n]));

      const added: NodeSummary[] = [];
      const removed: NodeSummary[] = [];
      const modified: DiffResult["modified"] = [];
      let unchanged = 0;

      // Find removed & modified
      for (const [key, ln] of leftMap) {
        const rn = rightMap.get(key);
        if (!rn) {
          removed.push(ln);
        } else {
          const changes: string[] = [];
          if (Math.abs(ln.x - rn.x) > 0.5 || Math.abs(ln.y - rn.y) > 0.5) changes.push("position");
          if (Math.abs(ln.width - rn.width) > 0.5 || Math.abs(ln.height - rn.height) > 0.5) changes.push("size");
          if (ln.fill !== rn.fill && (ln.fill || rn.fill)) changes.push("fill");
          if (changes.length > 0) {
            modified.push({ left: ln, right: rn, changes });
          } else {
            unchanged++;
          }
        }
      }

      // Find added
      for (const [key, rn] of rightMap) {
        if (!leftMap.has(key)) added.push(rn);
      }

      diffResult = { added, removed, modified, unchanged };
      updateDiffBar();
      drawDiffOverlays();
    } catch {
      diffResult = null;
    }
  }

  function updateDiffBar() {
    const bar = document.getElementById("comp-diff-bar");
    if (!bar || !diffResult) return;

    bar.innerHTML = "";

    const items = [
      { label: "Unchanged", count: diffResult.unchanged, color: "#888" },
      { label: "Added", count: diffResult.added.length, color: "#2ecc71" },
      { label: "Removed", count: diffResult.removed.length, color: "#e74c3c" },
      { label: "Modified", count: diffResult.modified.length, color: "#f39c12" },
    ];

    for (const item of items) {
      const el = document.createElement("span");
      el.style.cssText = `color:${item.color};`;
      el.textContent = `${item.label}: ${item.count}`;
      bar.appendChild(el);
    }
  }

  function drawDiffOverlays() {
    if (!showDiff || !diffResult || !leftCanvas || !rightCanvas) return;

    const dpr = window.devicePixelRatio || 1;

    // Draw on left canvas: removed (red) + modified (yellow)
    const leftCtx = leftCanvas.getContext("2d")!;
    const leftRect = leftCanvas.getBoundingClientRect();

    for (const n of diffResult.removed) {
      drawHighlight(leftCtx, n, "rgba(231, 76, 60, 0.3)", "rgba(231, 76, 60, 0.8)", leftRect);
    }
    for (const m of diffResult.modified) {
      drawHighlight(leftCtx, m.left, "rgba(243, 156, 18, 0.2)", "rgba(243, 156, 18, 0.7)", leftRect);
    }

    // Draw on right canvas: added (green) + modified (yellow)
    const rightCtx = rightCanvas.getContext("2d")!;
    const rightRect = rightCanvas.getBoundingClientRect();

    for (const n of diffResult.added) {
      drawHighlight(rightCtx, n, "rgba(46, 204, 113, 0.3)", "rgba(46, 204, 113, 0.8)", rightRect);
    }
    for (const m of diffResult.modified) {
      drawHighlight(rightCtx, m.right, "rgba(243, 156, 18, 0.2)", "rgba(243, 156, 18, 0.7)", rightRect);
    }
  }

  function drawHighlight(ctx: CanvasRenderingContext2D, node: NodeSummary, fillColor: string, strokeColor: string, rect: DOMRect) {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sx = node.x * zoom + panX;
    const sy = node.y * zoom + panY;
    const sw = node.width * zoom;
    const sh = node.height * zoom;

    ctx.fillStyle = fillColor;
    ctx.fillRect(sx, sy, sw, sh);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(sx, sy, sw, sh);
    ctx.setLineDash([]);

    // Label
    if (sw > 30 && sh > 15) {
      ctx.font = "10px system-ui";
      ctx.fillStyle = strokeColor;
      ctx.fillText(node.name || node.kind, sx + 4, sy + 12);
    }
  }

  function onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartPanX = panX;
    dragStartPanY = panY;

    const onMove = (ev: MouseEvent) => {
      if (!dragging) return;
      panX = dragStartPanX + (ev.clientX - dragStartX);
      panY = dragStartPanY + (ev.clientY - dragStartY);
      renderBoth();
    };
    const onUp = () => {
      dragging = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.max(0.05, Math.min(10, zoom * factor));

    // Zoom toward cursor
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    panX = mx - (mx - panX) * (newZoom / zoom);
    panY = my - (my - panY) * (newZoom / zoom);
    zoom = newZoom;

    renderBoth();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      hide();
      e.preventDefault();
    }
  }

  return {
    show,
    hide,
    isActive: () => active,
    toggle: () => active ? hide() : show(),
  };
}
