/**
 * Canvas Performance Profiler — Right-pane "Profiler" tab
 *
 * Features:
 * - Start/Stop profiling button
 * - Real-time FPS display + frame time graph
 * - Per-node render cost list (ms, sorted descending)
 * - Heatmap overlay toggle (expensive nodes → red on canvas)
 * - LOD threshold slider with optimization suggestions
 */

import type { Engine } from "../wasm/opensketch_engine";
import type { Editor } from "../editor";

// ─── Per-node render timing data ───

export interface NodeRenderTiming {
  id: number;
  name: string;
  kind: string;
  renderMs: number;
  w: number;
  h: number;
}

/** Global profiler state accessible from editor.ts */
export const profilerState = {
  active: false,
  nodeTimings: new Map<number, { total: number; count: number; name: string; kind: string; w: number; h: number }>(),
  frameTimings: [] as number[],
  maxFrames: 120,
  heatmapEnabled: false,
  lodThreshold: 0.5, // ms — nodes below this are skipped in detail render
  onUpdate: null as (() => void) | null,
};

/** Record a single node's render time (called from editor.ts render loop) */
export function recordNodeRender(id: number, ms: number, name: string, kind: string, w: number, h: number) {
  if (!profilerState.active) return;
  const existing = profilerState.nodeTimings.get(id);
  if (existing) {
    existing.total += ms;
    existing.count++;
    existing.name = name;
    existing.kind = kind;
    existing.w = w;
    existing.h = h;
  } else {
    profilerState.nodeTimings.set(id, { total: ms, count: 1, name, kind, w, h });
  }
}

/** Record frame time */
export function recordFrameTime(ms: number) {
  if (!profilerState.active) return;
  profilerState.frameTimings.push(ms);
  if (profilerState.frameTimings.length > profilerState.maxFrames) {
    profilerState.frameTimings.shift();
  }
}

/** Get sorted node timings (descending by avg ms) */
export function getSortedNodeTimings(): NodeRenderTiming[] {
  const result: NodeRenderTiming[] = [];
  profilerState.nodeTimings.forEach((v, id) => {
    result.push({
      id,
      name: v.name,
      kind: v.kind,
      renderMs: v.count > 0 ? v.total / v.count : 0,
      w: v.w,
      h: v.h,
    });
  });
  result.sort((a, b) => b.renderMs - a.renderMs);
  return result;
}

// ─── Heatmap Overlay ───

let heatmapCanvas: HTMLCanvasElement | null = null;

export function renderProfilerHeatmap(editor: Editor) {
  if (!profilerState.heatmapEnabled) {
    if (heatmapCanvas) { heatmapCanvas.remove(); heatmapCanvas = null; }
    return;
  }

  const mainCanvas = editor.canvas;
  if (!heatmapCanvas) {
    heatmapCanvas = document.createElement("canvas");
    heatmapCanvas.id = "profiler-heatmap-overlay";
    heatmapCanvas.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;z-index:50;opacity:0.35;";
    mainCanvas.parentElement?.appendChild(heatmapCanvas);
  }

  const dpr = window.devicePixelRatio || 1;
  heatmapCanvas.width = mainCanvas.width;
  heatmapCanvas.height = mainCanvas.height;
  heatmapCanvas.style.width = mainCanvas.clientWidth + "px";
  heatmapCanvas.style.height = mainCanvas.clientHeight + "px";

  const ctx = heatmapCanvas.getContext("2d")!;
  ctx.clearRect(0, 0, heatmapCanvas.width, heatmapCanvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const timings = getSortedNodeTimings();
  if (timings.length === 0) return;
  const maxMs = Math.max(timings[0].renderMs, 0.01);

  const zoom = editor.engine.get_zoom?.() ?? 1;
  const panX = editor.engine.get_pan_x?.() ?? 0;
  const panY = editor.engine.get_pan_y?.() ?? 0;

  for (const n of timings) {
    try {
      const nx = Number(editor.engine.get_x(BigInt(n.id)));
      const ny = Number(editor.engine.get_y(BigInt(n.id)));
      const sx = nx * zoom + panX;
      const sy = ny * zoom + panY;
      const sw = n.w * zoom;
      const sh = n.h * zoom;

      // Green → Yellow → Red
      const ratio = Math.min(n.renderMs / maxMs, 1);
      const r = Math.round(ratio > 0.5 ? 255 : ratio * 2 * 255);
      const g = Math.round(ratio < 0.5 ? 255 : (1 - ratio) * 2 * 255);
      ctx.fillStyle = `rgba(${r},${g},0,0.6)`;
      ctx.fillRect(sx, sy, sw, sh);

      if (sw > 50 && sh > 16) {
        ctx.fillStyle = "#fff";
        ctx.font = "bold 10px monospace";
        ctx.fillText(`${n.renderMs.toFixed(2)}ms`, sx + 3, sy + 12);
      }
    } catch { /* node may not exist anymore */ }
  }
}

export function cleanupProfilerHeatmap() {
  if (heatmapCanvas) { heatmapCanvas.remove(); heatmapCanvas = null; }
}

// ─── Panel UI (Right Pane) ───

let refreshInterval: number | null = null;

export function setupProfilerPanel(container: HTMLElement, editor: Editor) {
  function render() {
    container.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.style.cssText = "padding:12px;font:12px -apple-system,BlinkMacSystemFont,sans-serif;color:#e0e0e0;";

    // ── Header with Start/Stop + FPS ──
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;";

    const startBtn = document.createElement("button");
    startBtn.style.cssText = `
      padding:6px 14px;border-radius:6px;border:1px solid #555;cursor:pointer;
      font-size:12px;font-weight:600;
      background:${profilerState.active ? "#d32f2f" : "#388e3c"};color:#fff;
    `;
    startBtn.textContent = profilerState.active ? "⏹ Stop" : "▶ Start";
    startBtn.onclick = () => {
      if (profilerState.active) {
        stopProfiling();
      } else {
        startProfiling();
      }
      render();
    };

    const fpsLabel = document.createElement("span");
    fpsLabel.style.cssText = "font-size:18px;font-weight:700;";
    if (profilerState.frameTimings.length > 0) {
      const recent = profilerState.frameTimings.slice(-30);
      const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const fps = avg > 0 ? Math.round(1000 / avg) : 0;
      const color = fps >= 55 ? "#4caf50" : fps >= 30 ? "#ff9800" : "#f44336";
      fpsLabel.style.color = color;
      fpsLabel.textContent = `${fps} FPS`;
    } else {
      fpsLabel.style.color = "#666";
      fpsLabel.textContent = "— FPS";
    }

    header.appendChild(startBtn);
    header.appendChild(fpsLabel);
    wrapper.appendChild(header);

    // ── Frame Time Graph ──
    const graphSection = document.createElement("div");
    graphSection.style.cssText = "margin-bottom:14px;";
    const graphLabel = document.createElement("div");
    graphLabel.style.cssText = "font-weight:600;margin-bottom:4px;color:#999;font-size:10px;text-transform:uppercase;";
    graphLabel.textContent = "Frame Time";
    graphSection.appendChild(graphLabel);

    const graphCanvas = document.createElement("canvas");
    graphCanvas.width = 280;
    graphCanvas.height = 60;
    graphCanvas.style.cssText = "width:100%;height:60px;border-radius:6px;background:#111;";
    graphSection.appendChild(graphCanvas);
    wrapper.appendChild(graphSection);

    // Draw frame graph
    requestAnimationFrame(() => drawFrameGraph(graphCanvas));

    // ── Stats line ──
    if (profilerState.frameTimings.length > 0) {
      const recent = profilerState.frameTimings.slice(-30);
      const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const max = Math.max(...recent);
      const statsEl = document.createElement("div");
      statsEl.style.cssText = "margin-bottom:14px;color:#888;font-size:11px;";
      statsEl.textContent = `avg ${avg.toFixed(1)}ms · max ${max.toFixed(1)}ms · ${profilerState.frameTimings.length} samples`;
      wrapper.appendChild(statsEl);
    }

    // ── Heatmap Toggle ──
    const heatmapRow = document.createElement("div");
    heatmapRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:14px;";
    const heatmapCb = document.createElement("input");
    heatmapCb.type = "checkbox";
    heatmapCb.checked = profilerState.heatmapEnabled;
    heatmapCb.onchange = () => {
      profilerState.heatmapEnabled = heatmapCb.checked;
      if (!profilerState.heatmapEnabled) cleanupProfilerHeatmap();
      editor.requestRender();
    };
    const heatmapLabel = document.createElement("label");
    heatmapLabel.style.cssText = "font-size:11px;color:#ccc;cursor:pointer;";
    heatmapLabel.textContent = "🔥 Heatmap overlay on canvas";
    heatmapLabel.prepend(heatmapCb);
    heatmapRow.appendChild(heatmapLabel);
    wrapper.appendChild(heatmapRow);

    // ── LOD Threshold Slider ──
    const lodSection = document.createElement("div");
    lodSection.style.cssText = "margin-bottom:14px;";
    const lodLabel = document.createElement("div");
    lodLabel.style.cssText = "font-weight:600;margin-bottom:4px;color:#999;font-size:10px;text-transform:uppercase;";
    lodLabel.textContent = `LOD Threshold: ${profilerState.lodThreshold.toFixed(2)}ms`;
    lodSection.appendChild(lodLabel);

    const lodSlider = document.createElement("input");
    lodSlider.type = "range";
    lodSlider.min = "0";
    lodSlider.max = "5";
    lodSlider.step = "0.05";
    lodSlider.value = String(profilerState.lodThreshold);
    lodSlider.style.cssText = "width:100%;accent-color:#4a90d9;";
    lodSlider.oninput = () => {
      profilerState.lodThreshold = parseFloat(lodSlider.value);
      lodLabel.textContent = `LOD Threshold: ${profilerState.lodThreshold.toFixed(2)}ms`;
    };
    lodSection.appendChild(lodSlider);

    const lodHint = document.createElement("div");
    lodHint.style.cssText = "font-size:10px;color:#666;margin-top:2px;";
    lodHint.textContent = "Nodes with render cost below threshold can use simplified rendering.";
    lodSection.appendChild(lodHint);
    wrapper.appendChild(lodSection);

    // ── Node Render Cost List ──
    const listSection = document.createElement("div");
    const listLabel = document.createElement("div");
    listLabel.style.cssText = "font-weight:600;margin-bottom:6px;color:#999;font-size:10px;text-transform:uppercase;";
    listLabel.textContent = "Node Render Cost";
    listSection.appendChild(listLabel);

    const timings = getSortedNodeTimings();
    if (timings.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "color:#555;font-size:11px;padding:8px 0;";
      empty.textContent = profilerState.active ? "Collecting data…" : "Start profiling to measure render costs.";
      listSection.appendChild(empty);
    } else {
      const maxMs = timings[0].renderMs || 0.01;
      const top = timings.slice(0, 20);
      for (const n of top) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:3px;cursor:pointer;padding:2px 4px;border-radius:4px;";
        row.onmouseenter = () => { row.style.background = "#333"; };
        row.onmouseleave = () => { row.style.background = "none"; };
        row.onclick = () => {
          // Select node on click
          try {
            editor.engine.deselect_all();
            editor.engine.select_node(BigInt(n.id));
            editor.requestRender();
          } catch {}
        };

        const pct = (n.renderMs / maxMs) * 100;
        const color = pct > 75 ? "#f44336" : pct > 40 ? "#ff9800" : "#4caf50";

        // Bar
        const bar = document.createElement("div");
        bar.style.cssText = `width:50px;height:6px;background:#333;border-radius:3px;overflow:hidden;flex-shrink:0;`;
        const barFill = document.createElement("div");
        barFill.style.cssText = `width:${pct}%;height:100%;background:${color};border-radius:3px;`;
        bar.appendChild(barFill);
        row.appendChild(bar);

        // Time
        const time = document.createElement("span");
        time.style.cssText = `color:${color};width:40px;text-align:right;font-weight:600;font-size:11px;flex-shrink:0;`;
        time.textContent = n.renderMs >= 1 ? `${n.renderMs.toFixed(1)}ms` : `${(n.renderMs * 1000).toFixed(0)}µs`;
        row.appendChild(time);

        // Name
        const name = document.createElement("span");
        name.style.cssText = "color:#ccc;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;";
        name.title = n.name;
        name.textContent = n.name || `Node ${n.id}`;
        row.appendChild(name);

        // Kind badge
        const kind = document.createElement("span");
        kind.style.cssText = "color:#666;font-size:9px;flex-shrink:0;";
        kind.textContent = n.kind;
        row.appendChild(kind);

        listSection.appendChild(row);
      }
      if (timings.length > 20) {
        const more = document.createElement("div");
        more.style.cssText = "color:#555;font-size:10px;padding:4px 0;";
        more.textContent = `… and ${timings.length - 20} more nodes`;
        listSection.appendChild(more);
      }
    }
    wrapper.appendChild(listSection);

    // ── Optimization Suggestions ──
    const sugSection = document.createElement("div");
    sugSection.style.cssText = "margin-top:14px;";
    const sugLabel = document.createElement("div");
    sugLabel.style.cssText = "font-weight:600;margin-bottom:4px;color:#999;font-size:10px;text-transform:uppercase;";
    sugLabel.textContent = "Optimization Suggestions";
    sugSection.appendChild(sugLabel);

    const suggestions = generateSuggestions(timings, editor);
    const sugContent = document.createElement("div");
    sugContent.style.cssText = "font-size:11px;color:#aaa;line-height:1.6;";
    sugContent.innerHTML = suggestions.join("<br>");
    sugSection.appendChild(sugContent);
    wrapper.appendChild(sugSection);

    container.appendChild(wrapper);
  }

  function startProfiling() {
    profilerState.active = true;
    profilerState.nodeTimings.clear();
    profilerState.frameTimings = [];
    // Start periodic UI refresh
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = window.setInterval(() => {
      if (profilerState.active) render();
    }, 500);
    editor.requestRender();
  }

  function stopProfiling() {
    profilerState.active = false;
    if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
    profilerState.heatmapEnabled = false;
    cleanupProfilerHeatmap();
  }

  profilerState.onUpdate = render;
  render();

  // Cleanup when tab switches away
  return () => {
    if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
  };
}

function drawFrameGraph(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const data = profilerState.frameTimings;
  if (data.length < 2) return;

  const maxMs = Math.max(33, ...data);

  // 60fps target line
  const target60 = (16.67 / maxMs) * H;
  ctx.strokeStyle = "#4caf5044";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, H - target60);
  ctx.lineTo(W, H - target60);
  ctx.stroke();
  ctx.setLineDash([]);

  // Bars
  const barW = W / profilerState.maxFrames;
  for (let i = 0; i < data.length; i++) {
    const h = Math.max(1, (data[i] / maxMs) * H);
    const ratio = data[i] / 16.67;
    ctx.fillStyle = ratio <= 1 ? "#4caf50" : ratio <= 2 ? "#ff9800" : "#f44336";
    ctx.fillRect(i * barW, H - h, barW - 1, h);
  }

  // Labels
  ctx.fillStyle = "#555";
  ctx.font = "8px monospace";
  ctx.fillText("60fps", 2, H - target60 - 2);
}

function generateSuggestions(timings: NodeRenderTiming[], editor: Editor): string[] {
  const suggestions: string[] = [];

  const expensive = timings.filter(n => n.renderMs > 2);
  if (expensive.length > 0) {
    suggestions.push(`🔴 ${expensive.length} node(s) take >2ms to render. Consider simplifying complex paths or effects.`);
  }

  const moderate = timings.filter(n => n.renderMs > 0.5 && n.renderMs <= 2);
  if (moderate.length > 10) {
    suggestions.push(`🔶 ${moderate.length} nodes with moderate cost (0.5–2ms). Grouping into frames can enable viewport culling.`);
  }

  const bigNodes = timings.filter(n => n.w > 2000 || n.h > 2000);
  if (bigNodes.length > 0) {
    suggestions.push(`🔶 ${bigNodes.length} oversized node(s) (>2000px). Consider resizing for better performance.`);
  }

  const totalNodes = timings.length;
  if (totalNodes > 500) {
    suggestions.push("🔶 Large scene (>500 nodes). Use pages to split content.");
  }

  if (profilerState.lodThreshold > 0) {
    const belowThreshold = timings.filter(n => n.renderMs < profilerState.lodThreshold);
    if (belowThreshold.length > 0) {
      suggestions.push(`💡 ${belowThreshold.length} nodes below LOD threshold (${profilerState.lodThreshold.toFixed(2)}ms) — candidates for simplified rendering at lower zoom levels.`);
    }
  }

  const recent = profilerState.frameTimings.slice(-30);
  if (recent.length > 5) {
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    if (avg > 33) {
      suggestions.push("🔴 Below 30fps! Remove blur/shadow effects and reduce visible node count.");
    } else if (avg > 16.67) {
      suggestions.push("🔶 Below 60fps. Consider reducing complex gradients and path points.");
    }
  }

  if (suggestions.length === 0) {
    suggestions.push("✅ Performance looks good! No issues detected.");
  }

  return suggestions;
}
