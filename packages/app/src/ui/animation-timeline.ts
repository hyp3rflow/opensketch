/**
 * Animation Timeline Panel — bottom dockable panel for keyframe animation editing.
 * Shows tracks per selected node, keyframe diamonds, scrubber, playback controls.
 */
import type { Editor } from "../editor";
import { ICONS } from "./icons";

interface TimelineState {
  activeClipId: number | null;
  currentTime: number; // ms
  playing: boolean;
  zoom: number; // px per second
  scrollX: number; // px offset
}

export function createAnimationTimeline(editor: Editor): {
  getContainer: () => HTMLElement;
  show: () => void;
  hide: () => void;
  toggle: () => void;
  isVisible: () => boolean;
  refresh: () => void;
  destroy: () => void;
} {
  const container = document.createElement("div");
  container.className = "animation-timeline";
  container.style.cssText = `
    position:fixed;bottom:40px;left:60px;right:0;height:200px;
    background:#1e1e2e;border-top:1px solid #333;z-index:500;
    display:none;flex-direction:column;font-size:12px;color:#ccc;
    font-family:-apple-system,BlinkMacSystemFont,sans-serif;
  `;

  const state: TimelineState = {
    activeClipId: null,
    currentTime: 0,
    playing: false,
    zoom: 100, // 100px = 1 second
    scrollX: 0,
  };

  let playRafId: number | null = null;
  let playStartReal = 0;
  let playStartTime = 0;
  let snapshotBeforePlay: string | null = null;

  // ─── Top bar ───
  const topBar = document.createElement("div");
  topBar.style.cssText = `
    display:flex;align-items:center;gap:6px;padding:4px 10px;
    border-bottom:1px solid #333;height:28px;flex-shrink:0;
  `;

  const clipSelect = document.createElement("select");
  clipSelect.style.cssText = "background:#2a2a3a;color:#ccc;border:1px solid #444;border-radius:4px;padding:2px 6px;font-size:11px;";
  clipSelect.addEventListener("change", () => {
    state.activeClipId = clipSelect.value ? Number(clipSelect.value) : null;
    state.currentTime = 0;
    stopPlayback();
    renderTracks();
  });

  const addClipBtn = makeBtn("+", "New animation clip", () => {
    const name = prompt("Clip name:", `Clip ${Date.now() % 1000}`);
    if (!name) return;
    const id = Number(editor.engine.anim_add_clip(name));
    state.activeClipId = id;
    refreshClipList();
    renderTracks();
  });

  const removeClipBtn = makeBtn("🗑", "Delete clip", () => {
    if (state.activeClipId == null) return;
    if (!confirm("Delete this animation clip?")) return;
    editor.engine.anim_remove_clip(BigInt(state.activeClipId));
    state.activeClipId = null;
    refreshClipList();
    renderTracks();
  });

  // Playback controls
  const playBtn = makeBtn("▶", "Play / Pause", togglePlayback);
  const stopBtn = makeBtn("■", "Stop", () => { stopPlayback(); state.currentTime = 0; applyScrub(); renderTracks(); });
  const loopBtn = makeBtn("🔁", "Toggle loop", () => {
    if (state.activeClipId == null) return;
    const clip = JSON.parse(editor.engine.anim_get_clip(BigInt(state.activeClipId)));
    if (!clip) return;
    editor.engine.anim_set_looping(BigInt(state.activeClipId), !clip.looping);
    loopBtn.style.opacity = clip.looping ? "0.5" : "1";
  });

  const timeDisplay = document.createElement("span");
  timeDisplay.style.cssText = "color:#aaa;font-size:11px;font-variant-numeric:tabular-nums;min-width:70px;text-align:center;";

  // Record button: record current property values as keyframes
  const recordBtn = makeBtn("⏺", "Record keyframe at current time", () => {
    if (state.activeClipId == null) return;
    const count = editor.engine.anim_record_selected(
      BigInt(state.activeClipId),
      state.currentTime,
      "x,y,width,height,rotation,opacity"
    );
    if (count > 0) renderTracks();
  });
  recordBtn.style.color = "#e94560";

  // Motion Path button
  const motionPathBtn = makeBtn("🛤", "Attach motion path", () => {
    if (state.activeClipId == null) { alert("Select a clip first"); return; }
    const sel = editor.getSelection();
    if (sel.length !== 1) { alert("Select exactly one node"); return; }
    const nodeId = sel[0];

    // Get available path nodes
    const paths: { id: number; name: string }[] = JSON.parse(editor.engine.get_path_nodes());
    if (paths.length === 0) { alert("No Path nodes in scene. Draw a path first."); return; }

    // Check if already has motion path
    const existing = JSON.parse(editor.engine.anim_get_motion_path(BigInt(state.activeClipId!), BigInt(nodeId)));
    if (existing) {
      if (confirm("Remove existing motion path?")) {
        editor.engine.push_undo();
        editor.engine.anim_remove_motion_path(BigInt(state.activeClipId!), BigInt(nodeId));
        renderTracks();
      }
      return;
    }

    // Simple path picker
    const pathId = paths.length === 1 ? paths[0].id : (() => {
      const choice = prompt(
        "Select path:\n" + paths.map((p, i) => `${i + 1}. ${p.name} (#${p.id})`).join("\n") + "\n\nEnter number:",
        "1"
      );
      if (!choice) return null;
      const idx = parseInt(choice) - 1;
      return paths[idx]?.id ?? null;
    })();
    if (pathId == null) return;

    const dur = Number(prompt("Duration (ms):", "2000") || "2000");
    const orient = confirm("Orient node along path?");

    editor.engine.push_undo();
    editor.engine.anim_set_motion_path(
      BigInt(state.activeClipId!), BigInt(nodeId), BigInt(pathId),
      dur, orient, 0.0, "ease_in_out"
    );
    renderTracks();
  });

  // Lottie export button
  const lottieBtn = makeBtn("📦", "Export as Lottie JSON", () => {
    if (state.activeClipId == null) { alert("Select a clip first"); return; }
    editor.downloadLottie(state.activeClipId);
  });

  topBar.append(clipSelect, addClipBtn, removeClipBtn, sep(), playBtn, stopBtn, loopBtn, sep(), recordBtn, motionPathBtn, lottieBtn, timeDisplay);
  container.appendChild(topBar);

  // ─── Track area ───
  const trackArea = document.createElement("div");
  trackArea.style.cssText = "display:flex;flex:1;overflow:hidden;";

  // Left label column
  const labelCol = document.createElement("div");
  labelCol.style.cssText = "width:160px;flex-shrink:0;border-right:1px solid #333;overflow-y:auto;";

  // Right timeline canvas
  const timelineWrap = document.createElement("div");
  timelineWrap.style.cssText = "flex:1;position:relative;overflow:hidden;";

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "width:100%;height:100%;";
  timelineWrap.appendChild(canvas);

  trackArea.append(labelCol, timelineWrap);
  container.appendChild(trackArea);

  // ─── Events ───
  let draggingScrubber = false;

  canvas.addEventListener("pointerdown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Header area (top 20px) = scrubber drag
    if (y < 24) {
      draggingScrubber = true;
      scrubTo(x);
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    // Click on keyframe diamond — delete on right-click, select on left
    if (e.button === 2) {
      e.preventDefault();
      const kf = hitTestKeyframe(x, y);
      if (kf && state.activeClipId != null) {
        editor.engine.anim_remove_keyframe(BigInt(state.activeClipId), BigInt(kf.nodeId), kf.property, kf.time);
        renderTracks();
      }
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!draggingScrubber) return;
    const rect = canvas.getBoundingClientRect();
    scrubTo(e.clientX - rect.left);
  });

  canvas.addEventListener("pointerup", () => { draggingScrubber = false; });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // Zoom with wheel
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      state.zoom = Math.max(20, Math.min(500, state.zoom - e.deltaY * 0.5));
    } else {
      state.scrollX = Math.max(0, state.scrollX + e.deltaX + e.deltaY);
    }
    renderTracks();
  }, { passive: false });

  // ─── Functions ───
  function scrubTo(canvasX: number) {
    const ms = Math.max(0, Math.round(((canvasX + state.scrollX) / state.zoom) * 1000));
    state.currentTime = ms;
    applyScrub();
    renderTracks();
  }

  function applyScrub() {
    if (state.activeClipId == null) return;
    editor.engine.anim_apply(BigInt(state.activeClipId), state.currentTime);
    editor.requestRender();
  }

  function togglePlayback() {
    if (state.playing) { stopPlayback(); return; }
    if (state.activeClipId == null) return;

    // Save scene snapshot for restore on stop
    snapshotBeforePlay = editor.engine.export_scene();

    state.playing = true;
    playBtn.textContent = "⏸";
    playStartReal = performance.now();
    playStartTime = state.currentTime;

    function tick() {
      if (!state.playing) return;
      const elapsed = performance.now() - playStartReal;
      state.currentTime = playStartTime + Math.round(elapsed);

      const dur = editor.engine.anim_get_duration(BigInt(state.activeClipId!));
      if (dur > 0 && state.currentTime > dur) {
        const clip = JSON.parse(editor.engine.anim_get_clip(BigInt(state.activeClipId!)));
        if (clip?.looping) {
          state.currentTime = state.currentTime % dur;
          playStartTime = state.currentTime;
          playStartReal = performance.now();
        } else {
          state.currentTime = dur;
          stopPlayback();
        }
      }

      applyScrub();
      updateTimeDisplay();
      renderTracks();
      if (state.playing) playRafId = requestAnimationFrame(tick);
    }
    playRafId = requestAnimationFrame(tick);
  }

  function stopPlayback() {
    state.playing = false;
    playBtn.textContent = "▶";
    if (playRafId != null) { cancelAnimationFrame(playRafId); playRafId = null; }

    // Restore scene to pre-play state
    if (snapshotBeforePlay) {
      editor.engine.import_scene(snapshotBeforePlay);
      snapshotBeforePlay = null;
      editor.requestRender();
    }
  }

  function updateTimeDisplay() {
    const sec = (state.currentTime / 1000).toFixed(2);
    timeDisplay.textContent = `${sec}s`;
  }

  function refreshClipList() {
    const clips: any[] = JSON.parse(editor.engine.anim_get_clips());
    clipSelect.innerHTML = '<option value="">— Select clip —</option>';
    for (const c of clips) {
      const opt = document.createElement("option");
      opt.value = String(c.id);
      opt.textContent = c.name;
      if (state.activeClipId === c.id) opt.selected = true;
      clipSelect.appendChild(opt);
    }
  }

  interface TrackRow {
    nodeId: number;
    nodeName: string;
    property: string;
    keyframes: { time: number; value: number; easing: string }[];
  }

  function getTrackRows(): TrackRow[] {
    if (state.activeClipId == null) return [];
    const clipJson = editor.engine.anim_get_clip(BigInt(state.activeClipId));
    const clip = JSON.parse(clipJson);
    if (!clip || !clip.tracks) return [];

    return clip.tracks.map((t: any) => {
      let nodeName = "?";
      try {
        const nj = editor.engine.get_node_json(Number(t.node_id));
        if (nj) nodeName = JSON.parse(nj).name || `#${t.node_id}`;
      } catch {}

      let propLabel = typeof t.property === "string" ? t.property : JSON.stringify(t.property);
      if (propLabel === "MotionPath") propLabel = "🛤 Motion Path";

      return {
        nodeId: Number(t.node_id),
        nodeName,
        property: propLabel,
        keyframes: (t.keyframes || []).map((k: any) => ({
          time: k.time_ms,
          value: k.value,
          easing: typeof k.easing === "string" ? k.easing : Object.keys(k.easing || {})[0] || "EaseInOut",
        })),
      };
    });
  }

  function hitTestKeyframe(cx: number, cy: number): { nodeId: number; property: string; time: number } | null {
    const rows = getTrackRows();
    const rowH = 22;
    const headerH = 24;
    for (let i = 0; i < rows.length; i++) {
      const ry = headerH + i * rowH + rowH / 2;
      for (const kf of rows[i].keyframes) {
        const kx = (kf.time / 1000) * state.zoom - state.scrollX;
        if (Math.abs(cx - kx) < 6 && Math.abs(cy - ry) < 8) {
          return { nodeId: rows[i].nodeId, property: rows[i].property, time: kf.time };
        }
      }
    }
    return null;
  }

  function renderTracks() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement!.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    // Background
    ctx.fillStyle = "#1e1e2e";
    ctx.fillRect(0, 0, w, h);

    const headerH = 24;
    const rowH = 22;
    const rows = getTrackRows();

    // Time ruler
    ctx.fillStyle = "#252535";
    ctx.fillRect(0, 0, w, headerH);
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, headerH);
    ctx.lineTo(w, headerH);
    ctx.stroke();

    // Tick marks
    ctx.fillStyle = "#888";
    ctx.font = "9px -apple-system,sans-serif";
    ctx.textAlign = "center";
    const stepSec = state.zoom > 60 ? 0.5 : state.zoom > 30 ? 1 : 2;
    const stepPx = stepSec * state.zoom;
    const startSec = Math.floor(state.scrollX / state.zoom / stepSec) * stepSec;
    for (let s = startSec; ; s += stepSec) {
      const x = s * state.zoom - state.scrollX;
      if (x > w) break;
      if (x < 0) continue;
      ctx.strokeStyle = "#444";
      ctx.beginPath();
      ctx.moveTo(x, 14);
      ctx.lineTo(x, headerH);
      ctx.stroke();
      ctx.fillText(`${s}s`, x, 11);
    }

    // Track rows
    for (let i = 0; i < rows.length; i++) {
      const y = headerH + i * rowH;
      // Alternating bg
      if (i % 2 === 0) {
        ctx.fillStyle = "#22223a";
        ctx.fillRect(0, y, w, rowH);
      }
      // Row separator
      ctx.strokeStyle = "#333";
      ctx.beginPath();
      ctx.moveTo(0, y + rowH);
      ctx.lineTo(w, y + rowH);
      ctx.stroke();

      // Keyframe diamonds
      const cy = y + rowH / 2;
      for (const kf of rows[i].keyframes) {
        const kx = (kf.time / 1000) * state.zoom - state.scrollX;
        if (kx < -10 || kx > w + 10) continue;
        const sz = 5;
        ctx.beginPath();
        ctx.moveTo(kx, cy - sz);
        ctx.lineTo(kx + sz, cy);
        ctx.lineTo(kx, cy + sz);
        ctx.lineTo(kx - sz, cy);
        ctx.closePath();
        ctx.fillStyle = "#f9ca24";
        ctx.fill();
        ctx.strokeStyle = "#b8960f";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Labels column
    labelCol.innerHTML = "";
    // Header spacer
    const headerSpacer = document.createElement("div");
    headerSpacer.style.cssText = `height:${headerH}px;border-bottom:1px solid #333;`;
    labelCol.appendChild(headerSpacer);

    for (const row of rows) {
      const lbl = document.createElement("div");
      lbl.style.cssText = `height:${rowH}px;padding:0 8px;display:flex;align-items:center;gap:4px;white-space:nowrap;overflow:hidden;border-bottom:1px solid #2a2a3a;`;
      lbl.innerHTML = `<span style="color:#aaa;font-size:10px">${esc(row.nodeName)}</span><span style="color:#666;font-size:10px">·</span><span style="color:#7c7cf0;font-size:10px">${esc(row.property)}</span>`;
      labelCol.appendChild(lbl);
    }

    // Playhead
    const phx = (state.currentTime / 1000) * state.zoom - state.scrollX;
    if (phx >= 0 && phx <= w) {
      ctx.strokeStyle = "#e94560";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(phx, 0);
      ctx.lineTo(phx, h);
      ctx.stroke();

      // Playhead handle
      ctx.fillStyle = "#e94560";
      ctx.beginPath();
      ctx.moveTo(phx - 5, 0);
      ctx.lineTo(phx + 5, 0);
      ctx.lineTo(phx + 5, 6);
      ctx.lineTo(phx, 10);
      ctx.lineTo(phx - 5, 6);
      ctx.closePath();
      ctx.fill();
    }

    updateTimeDisplay();
  }

  function refresh() {
    refreshClipList();
    renderTracks();
  }

  function show() {
    container.style.display = "flex";
    refresh();
  }

  function hide() {
    stopPlayback();
    container.style.display = "none";
  }

  function toggle() {
    container.style.display === "none" ? show() : hide();
  }

  // ─── Helpers ───
  function makeBtn(text: string, title: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.title = title;
    btn.style.cssText = "background:#2a2a3a;color:#ccc;border:1px solid #444;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:12px;";
    btn.addEventListener("click", onClick);
    return btn;
  }

  function sep(): HTMLSpanElement {
    const s = document.createElement("span");
    s.style.cssText = "width:1px;height:16px;background:#444;";
    return s;
  }

  function esc(s: string): string {
    return s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  return {
    getContainer: () => container,
    show, hide, toggle,
    isVisible: () => container.style.display !== "none",
    refresh,
    destroy: () => { stopPlayback(); container.remove(); },
  };
}
