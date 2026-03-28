/**
 * Canvas Performance Profiler Panel
 * - Rolling FPS graph (60-frame window)
 * - Per-node complexity ranking (top expensive nodes)
 * - Heatmap overlay on canvas (color nodes by complexity)
 * - Optimization suggestions
 * - Memory usage tracking
 */

import type { Engine } from "../wasm/opensketch_engine";
import { ICONS } from "./icons";

interface FrameSample {
  time: number;       // timestamp
  frameMs: number;    // frame render time in ms
  rendered: number;
  culled: number;
  total: number;
}

interface NodeCost {
  id: number;
  name: string;
  kind: string;
  complexity: number;
  w: number;
  h: number;
}

let panelEl: HTMLElement | null = null;
let isOpen = false;
let engine: Engine | null = null;
let editorRef: any = null;
let heatmapEnabled = false;
let recordingInterval: number | null = null;

// Rolling sample buffer
const MAX_SAMPLES = 120;
const samples: FrameSample[] = [];

// ─── Public API ───

export function openPerfProfiler(eng: Engine, editor: any) {
  engine = eng;
  editorRef = editor;
  if (isOpen) { closePerfProfiler(); return; }
  isOpen = true;
  buildPanel();
  startRecording();
}

export function closePerfProfiler() {
  isOpen = false;
  stopRecording();
  disableHeatmap();
  panelEl?.remove();
  panelEl = null;
}

export function isPerfProfilerOpen() { return isOpen; }

export function togglePerfProfiler(eng: Engine, editor: any) {
  if (isOpen) closePerfProfiler();
  else openPerfProfiler(eng, editor);
}

// ─── Recording ───

function startRecording() {
  if (recordingInterval) return;
  recordingInterval = window.setInterval(() => {
    if (!engine || !isOpen) return;
    const hist = editorRef?._frameTimeHistory as number[] | undefined;
    const latest = hist && hist.length > 0 ? hist[hist.length - 1] : 0;
    samples.push({
      time: performance.now(),
      frameMs: latest,
      rendered: engine.get_rendered_count?.() ?? 0,
      culled: engine.get_culled_count?.() ?? 0,
      total: engine.get_node_count?.() ?? 0,
    });
    if (samples.length > MAX_SAMPLES) samples.shift();
    updatePanel();
  }, 200);
}

function stopRecording() {
  if (recordingInterval) { clearInterval(recordingInterval); recordingInterval = null; }
}

// ─── Panel UI ───

function buildPanel() {
  panelEl?.remove();
  panelEl = document.createElement("div");
  panelEl.id = "perf-profiler-panel";
  panelEl.style.cssText = `
    position: fixed; top: 60px; right: 12px; z-index: 9990;
    width: 340px; max-height: calc(100vh - 80px);
    background: #1e1e1e; color: #e0e0e0;
    border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    font: 12px -apple-system, BlinkMacSystemFont, sans-serif;
    overflow: hidden; display: flex; flex-direction: column;
    border: 1px solid #333;
  `;
  panelEl.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #333;background:#252525;">
      <span style="font-weight:600;font-size:13px;">⚡ Performance Profiler</span>
      <div style="display:flex;gap:6px;align-items:center;">
        <button id="perf-heatmap-btn" title="Toggle heatmap overlay" style="background:none;border:1px solid #555;border-radius:4px;color:#aaa;cursor:pointer;padding:2px 8px;font-size:11px;">Heatmap</button>
        <button id="perf-close-btn" style="background:none;border:none;color:#888;cursor:pointer;font-size:16px;">✕</button>
      </div>
    </div>
    <div id="perf-content" style="overflow-y:auto;padding:10px 14px;flex:1;">
      <div id="perf-fps-section">
        <div style="font-weight:600;margin-bottom:6px;color:#999;font-size:11px;text-transform:uppercase;">Frame Time</div>
        <canvas id="perf-fps-canvas" width="310" height="80" style="width:310px;height:80px;border-radius:6px;background:#111;"></canvas>
        <div id="perf-fps-stats" style="margin-top:4px;color:#888;font-size:11px;"></div>
      </div>
      <div style="margin-top:12px;">
        <div style="font-weight:600;margin-bottom:6px;color:#999;font-size:11px;text-transform:uppercase;">Node Stats</div>
        <div id="perf-node-stats" style="color:#ccc;font-size:11px;line-height:1.6;"></div>
      </div>
      <div style="margin-top:12px;">
        <div style="font-weight:600;margin-bottom:6px;color:#999;font-size:11px;text-transform:uppercase;">Top Expensive Nodes</div>
        <div id="perf-top-nodes" style="font-size:11px;"></div>
      </div>
      <div style="margin-top:12px;">
        <div style="font-weight:600;margin-bottom:6px;color:#999;font-size:11px;text-transform:uppercase;">Suggestions</div>
        <div id="perf-suggestions" style="font-size:11px;color:#aaa;line-height:1.5;"></div>
      </div>
      <div style="margin-top:12px;">
        <div style="font-weight:600;margin-bottom:6px;color:#999;font-size:11px;text-transform:uppercase;">Memory</div>
        <div id="perf-memory" style="font-size:11px;color:#888;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(panelEl);

  panelEl.querySelector("#perf-close-btn")!.addEventListener("click", closePerfProfiler);
  panelEl.querySelector("#perf-heatmap-btn")!.addEventListener("click", () => {
    heatmapEnabled = !heatmapEnabled;
    const btn = panelEl!.querySelector("#perf-heatmap-btn") as HTMLButtonElement;
    btn.style.borderColor = heatmapEnabled ? "#4a90d9" : "#555";
    btn.style.color = heatmapEnabled ? "#4a90d9" : "#aaa";
    if (heatmapEnabled) enableHeatmap(); else disableHeatmap();
  });

  updatePanel();
}

function updatePanel() {
  if (!panelEl || !engine) return;

  // FPS graph
  drawFPSGraph();

  // FPS stats
  const statsEl = panelEl.querySelector("#perf-fps-stats") as HTMLElement;
  if (samples.length > 0) {
    const recent = samples.slice(-30);
    const avg = recent.reduce((a, s) => a + s.frameMs, 0) / recent.length;
    const max = Math.max(...recent.map(s => s.frameMs));
    const fps = avg > 0 ? Math.round(1000 / avg) : 999;
    const fpsColor = fps >= 55 ? "#4caf50" : fps >= 30 ? "#ff9800" : "#f44336";
    statsEl.innerHTML = `<span style="color:${fpsColor};font-weight:600;">${fps} FPS</span> · avg ${avg.toFixed(1)}ms · max ${max.toFixed(1)}ms`;
  }

  // Node stats
  const nodeStatsEl = panelEl.querySelector("#perf-node-stats") as HTMLElement;
  const last = samples[samples.length - 1];
  if (last) {
    nodeStatsEl.innerHTML = `Rendered: <b>${last.rendered}</b> · Culled: <b>${last.culled}</b> · Total: <b>${last.total}</b>`;
  }

  // Top nodes
  updateTopNodes();

  // Suggestions
  updateSuggestions();

  // Memory
  updateMemory();
}

function drawFPSGraph() {
  const canvas = panelEl?.querySelector("#perf-fps-canvas") as HTMLCanvasElement;
  if (!canvas) return;
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  if (samples.length < 2) return;

  // Target line at 16.67ms (60fps)
  const maxMs = Math.max(33, ...samples.map(s => s.frameMs));
  const target60 = (16.67 / maxMs) * H;
  ctx.strokeStyle = "#4caf5044";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, H - target60);
  ctx.lineTo(W, H - target60);
  ctx.stroke();
  ctx.setLineDash([]);

  // Frame time bars
  const barW = W / MAX_SAMPLES;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const h = Math.max(1, (s.frameMs / maxMs) * H);
    const x = i * barW;
    const ratio = s.frameMs / 16.67;
    ctx.fillStyle = ratio <= 1 ? "#4caf50" : ratio <= 2 ? "#ff9800" : "#f44336";
    ctx.fillRect(x, H - h, barW - 1, h);
  }

  // Labels
  ctx.fillStyle = "#666";
  ctx.font = "9px monospace";
  ctx.fillText("60fps", 2, H - target60 - 2);
  ctx.fillText(`${maxMs.toFixed(0)}ms`, W - 30, 10);
}

function updateTopNodes() {
  const el = panelEl?.querySelector("#perf-top-nodes") as HTMLElement;
  if (!el || !engine) return;

  try {
    const json = (engine as any).get_node_complexity_report?.();
    if (!json) { el.innerHTML = '<span style="color:#666;">N/A</span>'; return; }
    const nodes: NodeCost[] = JSON.parse(json);
    nodes.sort((a, b) => b.complexity - a.complexity);
    const top = nodes.slice(0, 10);
    const maxC = top[0]?.complexity ?? 1;

    el.innerHTML = top.map(n => {
      const pct = (n.complexity / maxC) * 100;
      const color = pct > 75 ? "#f44336" : pct > 40 ? "#ff9800" : "#4caf50";
      return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
        <div style="width:60px;height:6px;background:#333;border-radius:3px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${color};border-radius:3px;"></div>
        </div>
        <span style="color:${color};width:24px;text-align:right;font-weight:600;">${n.complexity}</span>
        <span style="color:#ccc;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${n.name}">${n.name}</span>
        <span style="color:#666;font-size:10px;">${n.kind}</span>
      </div>`;
    }).join("");
  } catch {
    el.innerHTML = '<span style="color:#666;">Error reading nodes</span>';
  }
}

function updateSuggestions() {
  const el = panelEl?.querySelector("#perf-suggestions") as HTMLElement;
  if (!el || !engine) return;

  const suggestions: string[] = [];
  const last = samples[samples.length - 1];

  if (last) {
    if (last.total > 500) suggestions.push("🔶 Large scene (>500 nodes). Consider grouping/componentizing to reduce tree depth.");
    if (last.total > 1000) suggestions.push("🔴 Very large scene (>1000 nodes). Use pages to split content.");
    if (last.rendered > 200) suggestions.push("🔶 Many visible nodes. Frame off-screen content to enable culling.");
    if (last.culled === 0 && last.total > 50) suggestions.push("💡 No nodes culled. Spread content across a larger canvas for better culling.");
  }

  const recent = samples.slice(-30);
  if (recent.length > 5) {
    const avg = recent.reduce((a, s) => a + s.frameMs, 0) / recent.length;
    if (avg > 16.67) suggestions.push("🔴 Below 60fps. Reduce shadows, blurs, and complex gradients on visible nodes.");
    if (avg > 33) suggestions.push("🔴 Below 30fps! Consider simplifying paths (reduce point count) and removing blur effects.");
  }

  try {
    const json = (engine as any).get_node_complexity_report?.();
    if (json) {
      const nodes: NodeCost[] = JSON.parse(json);
      const highCost = nodes.filter(n => n.complexity > 20);
      if (highCost.length > 5) suggestions.push(`🔶 ${highCost.length} high-complexity nodes. Review shadows, blurs, and path points.`);
      const bigImages = nodes.filter(n => n.kind === "Image" && (n.w > 2000 || n.h > 2000));
      if (bigImages.length > 0) suggestions.push(`🔶 ${bigImages.length} large image(s). Consider resizing for better performance.`);
    }
  } catch {}

  if (suggestions.length === 0) suggestions.push("✅ Performance looks good! No issues detected.");
  el.innerHTML = suggestions.join("<br>");
}

function updateMemory() {
  const el = panelEl?.querySelector("#perf-memory") as HTMLElement;
  if (!el) return;

  const perf = (performance as any);
  if (perf.memory) {
    const used = (perf.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1);
    const total = (perf.memory.totalJSHeapSize / (1024 * 1024)).toFixed(1);
    const limit = (perf.memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(0);
    el.innerHTML = `Heap: ${used} MB / ${total} MB (limit: ${limit} MB)`;
  } else {
    el.innerHTML = `<span style="color:#666;">Memory API not available (Chrome only)</span>`;
  }
}

// ─── Heatmap Overlay ───

let heatmapOverlay: HTMLCanvasElement | null = null;

function enableHeatmap() {
  if (!editorRef || !engine) return;
  // Create overlay canvas on top of main canvas
  if (!heatmapOverlay) {
    heatmapOverlay = document.createElement("canvas");
    heatmapOverlay.id = "perf-heatmap-overlay";
    heatmapOverlay.style.cssText = `
      position: absolute; top: 0; left: 0;
      pointer-events: none; z-index: 50; opacity: 0.4;
    `;
    editorRef.canvas.parentElement?.appendChild(heatmapOverlay);
  }
  renderHeatmap();
  // Re-render on each frame
  (editorRef as any)._perfHeatmapCb = () => { if (heatmapEnabled) renderHeatmap(); };
}

function disableHeatmap() {
  heatmapEnabled = false;
  if (heatmapOverlay) { heatmapOverlay.remove(); heatmapOverlay = null; }
  if (editorRef) (editorRef as any)._perfHeatmapCb = null;
}

function renderHeatmap() {
  if (!heatmapOverlay || !engine || !editorRef) return;
  const mainCanvas = editorRef.canvas as HTMLCanvasElement;
  const dpr = window.devicePixelRatio || 1;
  heatmapOverlay.width = mainCanvas.width;
  heatmapOverlay.height = mainCanvas.height;
  heatmapOverlay.style.width = mainCanvas.style.width;
  heatmapOverlay.style.height = mainCanvas.style.height;

  const ctx = heatmapOverlay.getContext("2d")!;
  ctx.clearRect(0, 0, heatmapOverlay.width, heatmapOverlay.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  try {
    const json = (engine as any).get_node_complexity_report?.();
    if (!json) return;
    const nodes: NodeCost[] = JSON.parse(json);
    if (nodes.length === 0) return;
    const maxC = Math.max(...nodes.map(n => n.complexity), 1);

    const zoom = editorRef.engine.get_zoom?.() ?? 1;
    const panX = editorRef.engine.get_pan_x?.() ?? 0;
    const panY = editorRef.engine.get_pan_y?.() ?? 0;

    for (const n of nodes) {
      // Get node position from engine
      const nx = editorRef.engine.get_node_x?.(BigInt(n.id)) ?? 0;
      const ny = editorRef.engine.get_node_y?.(BigInt(n.id)) ?? 0;
      const nw = n.w;
      const nh = n.h;

      // Transform to screen coords
      const sx = nx * zoom + panX;
      const sy = ny * zoom + panY;
      const sw = nw * zoom;
      const sh = nh * zoom;

      // Color: green → yellow → red based on complexity
      const ratio = n.complexity / maxC;
      const r = Math.round(ratio > 0.5 ? 255 : ratio * 2 * 255);
      const g = Math.round(ratio < 0.5 ? 255 : (1 - ratio) * 2 * 255);
      ctx.fillStyle = `rgba(${r},${g},0,0.6)`;
      ctx.fillRect(sx, sy, sw, sh);

      // Label
      if (sw > 40 && sh > 14) {
        ctx.fillStyle = "#fff";
        ctx.font = "bold 10px monospace";
        ctx.fillText(`${n.complexity}`, sx + 3, sy + 11);
      }
    }
  } catch {}
}
