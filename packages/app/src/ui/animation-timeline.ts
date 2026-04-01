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

  // Onion skin toggle
  const onionBtn = makeBtn("🧅", "Toggle onion skin", () => {
    editor.onionSkin.enabled = !editor.onionSkin.enabled;
    onionBtn.style.opacity = editor.onionSkin.enabled ? "1" : "0.4";
    editor.requestRender();
  });
  onionBtn.style.opacity = "0.4";

  topBar.append(clipSelect, addClipBtn, removeClipBtn, sep(), playBtn, stopBtn, loopBtn, sep(), recordBtn, motionPathBtn, lottieBtn, sep(), onionBtn, timeDisplay);
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

    // Click on keyframe diamond — right-click context menu
    if (e.button === 2) {
      e.preventDefault();
      const kf = hitTestKeyframe(x, y);
      if (kf && state.activeClipId != null) {
        showKeyframeContextMenu(e.clientX, e.clientY, kf);
      }
    }
  });

  function showKeyframeContextMenu(mx: number, my: number, kf: { nodeId: number; property: string; time: number }) {
    // Remove existing
    document.querySelector(".anim-kf-ctx")?.remove();
    const menu = document.createElement("div");
    menu.className = "anim-kf-ctx";
    menu.style.cssText = `position:fixed;left:${mx}px;top:${my}px;background:#1e1e2e;border:1px solid #444;border-radius:6px;padding:4px 0;z-index:9999;min-width:160px;box-shadow:0 4px 12px rgba(0,0,0,0.5);font-size:11px;`;

    const makeItem = (label: string, onClick: () => void, color = "#ccc") => {
      const item = document.createElement("div");
      item.style.cssText = `padding:6px 12px;color:${color};cursor:pointer;transition:background 0.1s;`;
      item.textContent = label;
      item.addEventListener("mouseenter", () => { item.style.background = "#2a2a4a"; });
      item.addEventListener("mouseleave", () => { item.style.background = "none"; });
      item.addEventListener("click", () => { onClick(); menu.remove(); });
      return item;
    };

    // Delete keyframe
    menu.appendChild(makeItem("🗑 Delete Keyframe", () => {
      editor.engine.anim_remove_keyframe(BigInt(state.activeClipId!), BigInt(kf.nodeId), kf.property, kf.time);
      renderTracks();
    }, "#f87171"));

    // ─── Easing selector ───
    const easingSep = document.createElement("div");
    easingSep.style.cssText = "height:1px;background:#333;margin:4px 0;";
    menu.appendChild(easingSep);

    const easingLabel = document.createElement("div");
    easingLabel.style.cssText = "padding:4px 12px;color:#666;font-size:9px;text-transform:uppercase;letter-spacing:0.5px;";
    easingLabel.textContent = "Easing";
    menu.appendChild(easingLabel);

    // Find current easing for this keyframe
    const allRows = getTrackRows();
    let currentEasing = "EaseInOut";
    for (const row of allRows) {
      if (row.nodeId === kf.nodeId && row.property === kf.property) {
        const keyframe = row.keyframes.find(k => k.time === kf.time);
        if (keyframe) currentEasing = keyframe.easing;
      }
    }

    const setEasing = (easingStr: string) => {
      (editor.engine as any).anim_set_keyframe_easing(
        BigInt(state.activeClipId!), BigInt(kf.nodeId), kf.property, kf.time, easingStr
      );
      renderTracks();
    };

    const standardEasings: [string, string][] = [
      ["linear", "Linear"],
      ["ease_in", "Ease In"],
      ["ease_out", "Ease Out"],
      ["ease_in_out", "Ease In Out"],
    ];

    for (const [val, label] of standardEasings) {
      const isActive = currentEasing === label.replace(/ /g, "") || currentEasing.toLowerCase().replace(/_/g, "") === val.replace(/_/g, "");
      menu.appendChild(makeItem(`${isActive ? "● " : "  "}${label}`, () => setEasing(val), isActive ? "#7c7cf0" : "#ccc"));
    }

    // Spring submenu
    const springSep = document.createElement("div");
    springSep.style.cssText = "height:1px;background:#333;margin:4px 0;";
    menu.appendChild(springSep);

    const springLabel = document.createElement("div");
    springLabel.style.cssText = "padding:4px 12px;color:#666;font-size:9px;text-transform:uppercase;letter-spacing:0.5px;";
    springLabel.textContent = "🌀 Spring Physics";
    menu.appendChild(springLabel);

    const springPresets: [string, string, string][] = [
      ["spring:gentle", "Gentle", "120 / 14 / 1"],
      ["spring:default", "Default", "170 / 26 / 1"],
      ["spring:wobbly", "Wobbly", "180 / 12 / 1"],
      ["spring:stiff", "Stiff", "210 / 20 / 1"],
      ["spring:slow", "Slow", "280 / 60 / 1"],
      ["spring:bouncy", "Bouncy", "600 / 15 / 1"],
    ];

    const isSpring = currentEasing === "Spring" || currentEasing.startsWith("spring:");
    for (const [val, label, params] of springPresets) {
      const item = document.createElement("div");
      item.style.cssText = `padding:6px 12px;color:${isSpring ? "#a78bfa" : "#ccc"};cursor:pointer;transition:background 0.1s;display:flex;justify-content:space-between;align-items:center;`;
      item.innerHTML = `<span>${label}</span><span style="color:#666;font-size:9px">${params}</span>`;
      item.addEventListener("mouseenter", () => { item.style.background = "#2a2a4a"; });
      item.addEventListener("mouseleave", () => { item.style.background = "none"; });
      item.addEventListener("click", () => { setEasing(val); menu.remove(); });
      menu.appendChild(item);
    }

    // Custom spring
    menu.appendChild(makeItem("⚙ Custom Spring...", () => {
      menu.remove();
      showCustomSpringDialog(kf);
    }, "#f59e0b"));

    // Variable binding
    const sep = document.createElement("div");
    sep.style.cssText = "height:1px;background:#333;margin:4px 0;";
    menu.appendChild(sep);

    // Check if already bound
    const rows = getTrackRows();
    let isBound = false;
    for (const row of rows) {
      if (row.nodeId === kf.nodeId && row.property === kf.property) {
        const keyframe = row.keyframes.find(k => k.time === kf.time);
        if (keyframe?.variable_binding) isBound = true;
      }
    }

    if (isBound) {
      menu.appendChild(makeItem("🔓 Unbind Variable", () => {
        (editor.engine as any).anim_unbind_keyframe_variable(BigInt(state.activeClipId!), BigInt(kf.nodeId), kf.property, kf.time);
        renderTracks();
      }, "#f59e0b"));
    }

    // Bind to variable submenu
    let bindableVars: any[] = [];
    try {
      bindableVars = JSON.parse((editor.engine as any).anim_get_bindable_variables() || "[]");
    } catch {}

    if (bindableVars.length > 0) {
      const bindLabel = document.createElement("div");
      bindLabel.style.cssText = "padding:4px 12px;color:#666;font-size:9px;text-transform:uppercase;letter-spacing:0.5px;";
      bindLabel.textContent = "Bind to variable";
      menu.appendChild(bindLabel);

      for (const v of bindableVars) {
        menu.appendChild(makeItem(`📌 ${v.collection_name} / ${v.variable_name}`, () => {
          (editor.engine as any).anim_bind_keyframe_variable(
            BigInt(state.activeClipId!), BigInt(kf.nodeId), kf.property, kf.time,
            BigInt(v.collection_id), BigInt(v.variable_id)
          );
          renderTracks();
        }, "#22c55e"));
      }
    } else {
      menu.appendChild(makeItem("No bindable variables", () => {}, "#555"));
    }

    document.body.appendChild(menu);
    const close = (ev: MouseEvent) => {
      if (!menu.contains(ev.target as Node)) { menu.remove(); document.removeEventListener("click", close); }
    };
    setTimeout(() => document.addEventListener("click", close), 0);
  }

  function showCustomSpringDialog(kf: { nodeId: number; property: string; time: number }) {
    document.querySelector(".spring-dialog")?.remove();
    const dlg = document.createElement("div");
    dlg.className = "spring-dialog";
    dlg.style.cssText = `
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      background:#1e1e2e;border:1px solid #555;border-radius:10px;padding:20px;z-index:10000;
      box-shadow:0 8px 32px rgba(0,0,0,0.6);min-width:280px;font-size:12px;color:#ccc;
      font-family:-apple-system,BlinkMacSystemFont,sans-serif;
    `;

    dlg.innerHTML = `
      <div style="font-size:14px;font-weight:600;margin-bottom:12px;color:#a78bfa">🌀 Custom Spring</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <label style="display:flex;justify-content:space-between;align-items:center">
          <span>Tension</span>
          <input id="spring-tension" type="number" value="170" min="0" max="2000" step="10"
            style="width:80px;background:#2a2a3a;border:1px solid #444;border-radius:4px;padding:4px 8px;color:#fff;text-align:right"/>
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center">
          <span>Friction</span>
          <input id="spring-friction" type="number" value="26" min="0" max="200" step="1"
            style="width:80px;background:#2a2a3a;border:1px solid #444;border-radius:4px;padding:4px 8px;color:#fff;text-align:right"/>
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center">
          <span>Mass</span>
          <input id="spring-mass" type="number" value="1" min="0.01" max="100" step="0.1"
            style="width:80px;background:#2a2a3a;border:1px solid #444;border-radius:4px;padding:4px 8px;color:#fff;text-align:right"/>
        </label>
      </div>
      <canvas id="spring-preview" width="240" height="100" style="margin-top:12px;border:1px solid #333;border-radius:6px;width:100%;"></canvas>
      <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">
        <button id="spring-cancel" style="background:#333;color:#ccc;border:none;border-radius:6px;padding:6px 14px;cursor:pointer">Cancel</button>
        <button id="spring-apply" style="background:#7c3aed;color:#fff;border:none;border-radius:6px;padding:6px 14px;cursor:pointer;font-weight:600">Apply</button>
      </div>
    `;

    document.body.appendChild(dlg);

    const tInput = dlg.querySelector("#spring-tension") as HTMLInputElement;
    const fInput = dlg.querySelector("#spring-friction") as HTMLInputElement;
    const mInput = dlg.querySelector("#spring-mass") as HTMLInputElement;
    const previewCanvas = dlg.querySelector("#spring-preview") as HTMLCanvasElement;

    function drawSpringPreview() {
      const tension = parseFloat(tInput.value) || 170;
      const friction = parseFloat(fInput.value) || 26;
      const mass = Math.max(0.01, parseFloat(mInput.value) || 1);
      const ctx = previewCanvas.getContext("2d")!;
      const w = previewCanvas.width, h = previewCanvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#161625";
      ctx.fillRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = "#2a2a3a";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.2); ctx.lineTo(w, h * 0.2); // y=1 line
      ctx.moveTo(0, h * 0.8); ctx.lineTo(w, h * 0.8); // y=0 line
      ctx.stroke();
      ctx.fillStyle = "#555";
      ctx.font = "8px sans-serif";
      ctx.fillText("1", 4, h * 0.2 - 2);
      ctx.fillText("0", 4, h * 0.8 + 10);

      // Spring curve
      ctx.beginPath();
      ctx.strokeStyle = "#a78bfa";
      ctx.lineWidth = 2;
      const omega_n = Math.sqrt(tension / mass);
      const zeta = friction / (2 * Math.sqrt(tension * mass));
      const settle = zeta >= 1 ? 6 / omega_n : 6 / Math.max(0.01, zeta * omega_n);

      for (let px = 0; px < w; px++) {
        const t = (px / w);
        const time = t * settle;
        let val: number;
        if (zeta >= 1) {
          const r1 = -omega_n * (zeta - Math.sqrt(Math.max(0, zeta * zeta - 1)));
          const r2 = -omega_n * (zeta + Math.sqrt(Math.max(0, zeta * zeta - 1)));
          if (Math.abs(r1 - r2) < 1e-10) {
            val = 1 - (1 - r1 * time) * Math.exp(r1 * time);
          } else {
            const a = r2 / (r2 - r1), b = -r1 / (r2 - r1);
            val = 1 - a * Math.exp(r1 * time) - b * Math.exp(r2 * time);
          }
        } else {
          const omega_d = omega_n * Math.sqrt(1 - zeta * zeta);
          const decay = Math.exp(-zeta * omega_n * time);
          val = 1 - decay * (Math.cos(omega_d * time) + (zeta * omega_n / omega_d) * Math.sin(omega_d * time));
        }
        const py = h * 0.8 - val * (h * 0.6);
        if (px === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    drawSpringPreview();
    tInput.addEventListener("input", drawSpringPreview);
    fInput.addEventListener("input", drawSpringPreview);
    mInput.addEventListener("input", drawSpringPreview);

    dlg.querySelector("#spring-cancel")!.addEventListener("click", () => dlg.remove());
    dlg.querySelector("#spring-apply")!.addEventListener("click", () => {
      const easingStr = `spring:${tInput.value},${fInput.value},${mInput.value}`;
      (editor.engine as any).anim_set_keyframe_easing(
        BigInt(state.activeClipId!), BigInt(kf.nodeId), kf.property, kf.time, easingStr
      );
      renderTracks();
      dlg.remove();
    });

    // Close on Escape
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { dlg.remove(); document.removeEventListener("keydown", onKey); }
    };
    document.addEventListener("keydown", onKey);
  }

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
    // Sync onion skin state
    editor.onionSkin.clipId = state.activeClipId;
    editor.onionSkin.currentTime = state.currentTime;
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
    keyframes: { time: number; value: number; easing: string; variable_binding?: { collection_id: number; variable_id: number } }[];
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
          variable_binding: k.variable_binding || undefined,
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
        const isSpringKf = kf.easing === "Spring" || (typeof kf.easing === "string" && kf.easing.startsWith("spring:"));
        ctx.fillStyle = kf.variable_binding ? "#22c55e" : isSpringKf ? "#a78bfa" : "#f9ca24";
        ctx.fill();
        ctx.strokeStyle = kf.variable_binding ? "#16a34a" : isSpringKf ? "#7c3aed" : "#b8960f";
        ctx.lineWidth = 1;
        ctx.stroke();
        // Variable binding indicator (small "V" above diamond)
        if (kf.variable_binding) {
          ctx.fillStyle = "#22c55e";
          ctx.font = "bold 7px -apple-system,sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("V", kx, cy - sz - 2);
        }
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
