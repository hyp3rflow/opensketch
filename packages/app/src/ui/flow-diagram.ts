import type { Editor } from "../editor";

let flowPanel: HTMLDivElement | null = null;
let isOpen = false;

interface FlowConnection {
  source_node_id: number;
  source_page_id: number;
  target_node_id: number;
  target_page_id: number;
  trigger: string;
  action: string;
}

interface PrototypeFlow {
  id: number;
  name: string;
  start_frame_id: number | null;
  start_page_id: number;
}

export function toggleFlowDiagram(editor: Editor) {
  if (isOpen) {
    closeFlowDiagram();
  } else {
    openFlowDiagram(editor);
  }
}

export function closeFlowDiagram() {
  if (flowPanel) {
    flowPanel.remove();
    flowPanel = null;
  }
  isOpen = false;
}

function openFlowDiagram(editor: Editor) {
  closeFlowDiagram();
  isOpen = true;

  flowPanel = document.createElement("div");
  flowPanel.style.cssText = `
    position:fixed;top:0;left:0;right:0;bottom:0;
    background:#111;z-index:9000;display:flex;flex-direction:column;
  `;

  // Header
  const header = document.createElement("div");
  header.style.cssText = `
    display:flex;align-items:center;justify-content:space-between;
    padding:12px 20px;background:#1a1a1a;border-bottom:1px solid #333;flex-shrink:0;
  `;
  const title = document.createElement("span");
  title.style.cssText = "color:#fff;font-size:14px;font-weight:600;";
  title.textContent = "Prototype Flow Diagram";
  header.appendChild(title);

  // Flow selector
  const flowSelect = document.createElement("select");
  flowSelect.style.cssText = "background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:4px;padding:4px 8px;font-size:12px;margin:0 12px;";
  const flowsJson = editor.engine.get_prototype_flows();
  const flows: PrototypeFlow[] = JSON.parse(flowsJson || "[]");
  const allOpt = document.createElement("option");
  allOpt.value = "0";
  allOpt.textContent = "All Connections";
  flowSelect.appendChild(allOpt);
  flows.forEach(f => {
    const opt = document.createElement("option");
    opt.value = String(f.id);
    opt.textContent = f.name;
    flowSelect.appendChild(opt);
  });
  header.appendChild(flowSelect);

  const stats = document.createElement("div");
  stats.style.cssText = "color:#94a3b8;font-size:11px;min-width:220px;";
  header.appendChild(stats);

  const closeBtn = document.createElement("button");
  closeBtn.style.cssText = "background:#333;border:1px solid #555;border-radius:6px;color:#fff;padding:6px 16px;cursor:pointer;font-size:12px;";
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", closeFlowDiagram);
  header.appendChild(closeBtn);
  flowPanel.appendChild(header);

  // Canvas area
  const canvasContainer = document.createElement("div");
  canvasContainer.style.cssText = "flex:1;position:relative;overflow:hidden;";
  flowPanel.appendChild(canvasContainer);

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;";
  canvasContainer.appendChild(canvas);

  document.body.appendChild(flowPanel);

  // Pan/zoom state
  let panX = 0, panY = 0, zoom = 0.5;
  let dragging = false, lastX = 0, lastY = 0;

  const resize = () => {
    canvas.width = canvasContainer.clientWidth * devicePixelRatio;
    canvas.height = canvasContainer.clientHeight * devicePixelRatio;
    draw();
  };

  const draw = () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.scale(devicePixelRatio, devicePixelRatio);

    const cw = w / devicePixelRatio;
    const ch = h / devicePixelRatio;

    // Get data
    const pagesJson = editor.engine.get_pages();
    const pages: { id: number; name: string }[] = JSON.parse(pagesJson || "[]");

    const selectedFlowId = parseInt(flowSelect.value);
    let connections: FlowConnection[];
    if (selectedFlowId > 0) {
      connections = JSON.parse(editor.engine.get_flow_connections(BigInt(selectedFlowId)) || "[]");
    } else {
      connections = JSON.parse(editor.engine.get_all_cross_page_interactions() || "[]");
    }

    const outgoingCount = new Map<number, number>();
    const incomingCount = new Map<number, number>();
    for (const conn of connections) {
      outgoingCount.set(conn.source_page_id, (outgoingCount.get(conn.source_page_id) || 0) + 1);
      incomingCount.set(conn.target_page_id, (incomingCount.get(conn.target_page_id) || 0) + 1);
    }
    const deadEnds = pages.filter((p) => (outgoingCount.get(p.id) || 0) === 0);
    const isolated = pages.filter((p) => (outgoingCount.get(p.id) || 0) === 0 && (incomingCount.get(p.id) || 0) === 0);
    stats.innerHTML = `Connections: <b style="color:#e2e8f0;">${connections.length}</b> · Dead ends: <b style="color:${deadEnds.length ? "#fca5a5" : "#86efac"};">${deadEnds.length}</b>${isolated.length ? ` <span style="color:#64748b;">(isolated ${isolated.length})</span>` : ""}`;

    // Find selected flow for start frame marker
    const selectedFlow = flows.find(f => f.id === selectedFlowId);

    // Layout pages in a grid
    const pageW = 200, pageH = 140, gap = 60;
    const cols = Math.max(1, Math.floor(Math.sqrt(pages.length)));
    const pagePositions: Map<number, { x: number; y: number }> = new Map();

    pages.forEach((page, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * (pageW + gap) + gap;
      const y = row * (pageH + gap) + gap;
      pagePositions.set(page.id, { x, y });
    });

    // Center the view initially
    if (panX === 0 && panY === 0 && pages.length > 0) {
      const totalW = cols * (pageW + gap) + gap;
      const totalRows = Math.ceil(pages.length / cols);
      const totalH = totalRows * (pageH + gap) + gap;
      panX = cw / 2 - (totalW * zoom) / 2;
      panY = ch / 2 - (totalH * zoom) / 2;
    }

    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    // Draw pages as rounded rectangles
    pages.forEach((page) => {
      const pos = pagePositions.get(page.id);
      if (!pos) return;

      const isDeadEnd = (outgoingCount.get(page.id) || 0) === 0;

      // Page card
      ctx.fillStyle = isDeadEnd ? "#2b1f24" : "#1e1e1e";
      ctx.strokeStyle = isDeadEnd ? "#ef4444" : "#444";
      ctx.lineWidth = isDeadEnd ? 1.5 : 1;
      roundRect(ctx, pos.x, pos.y, pageW, pageH, 8);
      ctx.fill();
      ctx.stroke();

      // Page name
      ctx.fillStyle = "#ccc";
      ctx.font = "12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(page.name, pos.x + pageW / 2, pos.y + pageH / 2 + 4, pageW - 16);

      // Start frame marker
      if (selectedFlow && selectedFlow.start_page_id === page.id && selectedFlow.start_frame_id) {
        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        ctx.arc(pos.x + 12, pos.y + 12, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#22c55e";
        ctx.font = "9px Inter, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("START", pos.x + 20, pos.y + 15);
      }

      if (isDeadEnd) {
        ctx.fillStyle = "#fca5a5";
        ctx.font = "9px Inter, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("DEAD END", pos.x + 8, pos.y + pageH - 8);
      }
    });

    // Draw connection arrows
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.fillStyle = "#3b82f6";

    connections.forEach(conn => {
      const srcPos = pagePositions.get(conn.source_page_id);
      const tgtPos = pagePositions.get(conn.target_page_id);
      if (!srcPos || !tgtPos) return;

      // From right edge of source to left edge of target
      let sx = srcPos.x + pageW;
      let sy = srcPos.y + pageH / 2;
      let ex = tgtPos.x;
      let ey = tgtPos.y + pageH / 2;

      // If same page, draw a loop
      if (conn.source_page_id === conn.target_page_id) {
        sx = srcPos.x + pageW / 2;
        sy = srcPos.y + pageH;
        ex = srcPos.x + pageW / 2 + 20;
        ey = srcPos.y + pageH;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.bezierCurveTo(sx, sy + 30, ex, ey + 30, ex, ey);
        ctx.stroke();
        drawArrowHead(ctx, ex, ey, -Math.PI / 2);
        return;
      }

      // Bezier curve between pages
      const midX = (sx + ex) / 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.bezierCurveTo(midX, sy, midX, ey, ex, ey);
      ctx.stroke();

      // Arrowhead
      const angle = Math.atan2(ey - sy, ex - sx);
      drawArrowHead(ctx, ex, ey, angle);
    });

    ctx.restore();
  };

  // Event handlers
  canvasContainer.addEventListener("mousedown", (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  canvasContainer.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    panX += e.clientX - lastX;
    panY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    draw();
  });
  canvasContainer.addEventListener("mouseup", () => { dragging = false; });
  canvasContainer.addEventListener("mouseleave", () => { dragging = false; });
  canvasContainer.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvasContainer.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const oldZoom = zoom;
    zoom *= e.deltaY > 0 ? 0.9 : 1.1;
    zoom = Math.max(0.1, Math.min(3, zoom));
    panX = mx - (mx - panX) * (zoom / oldZoom);
    panY = my - (my - panY) * (zoom / oldZoom);
    draw();
  }, { passive: false });

  flowSelect.addEventListener("change", draw);

  requestAnimationFrame(resize);
  window.addEventListener("resize", resize);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawArrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) {
  const size = 8;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, -size / 2);
  ctx.lineTo(-size, size / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function isFlowDiagramOpen() {
  return isOpen;
}
