import type { Editor } from "../editor";

/**
 * Canvas Recording / Replay — floating bottom bar UI
 * Records scene snapshots over time, allows timeline scrubbing and playback.
 */

let editor: Editor;
let container: HTMLDivElement;
let isRecording = false;
let isPlaying = false;
let playbackSpeed = 1;
let playbackTime = 0; // current playback position in ms
let playbackRafId = 0;
let lastPlaybackTs = 0;
let captureInterval: ReturnType<typeof setInterval> | null = null;
let prePlaybackSnapshot: string | null = null; // scene state before playback

// Capture interval in ms (1 second)
const CAPTURE_INTERVAL_MS = 1000;

export function setupCanvasRecorder(ed: Editor): void {
  editor = ed;
  container = document.createElement("div");
  container.id = "canvas-recorder-bar";
  container.style.cssText = `
    position: fixed; bottom: 72px; left: 50%; transform: translateX(-50%);
    display: none; align-items: center; gap: 8px;
    background: rgba(30,30,46,0.95); border: 1px solid rgba(255,255,255,0.1);
    border-radius: 12px; padding: 8px 16px; z-index: 500;
    font-family: Inter, system-ui, sans-serif; font-size: 12px; color: #ccc;
    backdrop-filter: blur(12px); box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  `;
  document.body.appendChild(container);
  render();
}

export function toggleRecorderBar(): void {
  if (!container) return;
  const visible = container.style.display !== "none";
  container.style.display = visible ? "none" : "flex";
  if (!visible) render();
}

export function isRecorderVisible(): boolean {
  return container?.style.display !== "none";
}

function render(): void {
  if (!container) return;
  const eng = editor.engine as any;
  const hasData = eng.recording_has_data?.() ?? false;
  const frameCount = eng.recording_frame_count?.() ?? 0;
  const durationMs = eng.recording_duration_ms?.() ?? 0;

  container.innerHTML = "";

  // Record button
  const recBtn = document.createElement("button");
  recBtn.title = isRecording ? "Stop Recording" : "Start Recording";
  recBtn.style.cssText = `
    width: 28px; height: 28px; border-radius: 50%; border: 2px solid ${isRecording ? "#ff4444" : "rgba(255,255,255,0.3)"};
    background: ${isRecording ? "#ff4444" : "transparent"}; cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: all 0.2s;
  `;
  recBtn.innerHTML = isRecording
    ? `<svg width="12" height="12"><rect x="2" y="2" width="8" height="8" rx="1" fill="white"/></svg>`
    : `<svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="#ff4444"/></svg>`;
  recBtn.onclick = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };
  container.appendChild(recBtn);

  // Recording indicator
  if (isRecording) {
    const indicator = document.createElement("span");
    indicator.textContent = "● REC";
    indicator.style.cssText = "color: #ff4444; font-weight: 600; font-size: 11px; animation: recBlink 1s infinite;";
    container.appendChild(indicator);
    // Add blink animation if not exists
    if (!document.getElementById("rec-blink-style")) {
      const style = document.createElement("style");
      style.id = "rec-blink-style";
      style.textContent = "@keyframes recBlink { 0%,100% { opacity:1 } 50% { opacity:0.3 } }";
      document.head.appendChild(style);
    }
  }

  // Frame count
  const info = document.createElement("span");
  info.style.cssText = "color: rgba(255,255,255,0.5); font-size: 11px; min-width: 60px;";
  info.textContent = isRecording
    ? `${frameCount} frames`
    : hasData ? `${frameCount} frames · ${formatTime(durationMs)}` : "No recording";
  container.appendChild(info);

  if (hasData && !isRecording) {
    // Separator
    const sep = document.createElement("div");
    sep.style.cssText = "width: 1px; height: 20px; background: rgba(255,255,255,0.15);";
    container.appendChild(sep);

    // Play / Pause button
    const playBtn = document.createElement("button");
    playBtn.title = isPlaying ? "Pause" : "Play";
    playBtn.style.cssText = btnStyle();
    playBtn.innerHTML = isPlaying
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5,3 19,12 5,21"/></svg>`;
    playBtn.onclick = () => {
      if (isPlaying) pausePlayback();
      else startPlayback();
    };
    container.appendChild(playBtn);

    // Stop button
    const stopBtn = document.createElement("button");
    stopBtn.title = "Stop";
    stopBtn.style.cssText = btnStyle();
    stopBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`;
    stopBtn.onclick = stopPlayback;
    container.appendChild(stopBtn);

    // Timeline slider
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = String(durationMs);
    slider.value = String(Math.round(playbackTime));
    slider.style.cssText = "width: 160px; accent-color: #7c5cfc; cursor: pointer;";
    slider.oninput = () => {
      playbackTime = Number(slider.value);
      seekTo(playbackTime);
    };
    container.appendChild(slider);

    // Time display
    const timeLabel = document.createElement("span");
    timeLabel.style.cssText = "color: rgba(255,255,255,0.6); font-size: 11px; min-width: 70px; font-variant-numeric: tabular-nums;";
    timeLabel.textContent = `${formatTime(playbackTime)} / ${formatTime(durationMs)}`;
    container.appendChild(timeLabel);

    // Speed selector
    const speedBtn = document.createElement("select");
    speedBtn.style.cssText = "background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; color: #ccc; font-size: 11px; padding: 2px 4px; cursor: pointer;";
    [0.5, 1, 2, 4].forEach(s => {
      const opt = document.createElement("option");
      opt.value = String(s);
      opt.textContent = `${s}×`;
      if (s === playbackSpeed) opt.selected = true;
      speedBtn.appendChild(opt);
    });
    speedBtn.onchange = () => { playbackSpeed = Number(speedBtn.value); };
    container.appendChild(speedBtn);

    // Clear button
    const clearBtn = document.createElement("button");
    clearBtn.title = "Clear Recording";
    clearBtn.style.cssText = btnStyle() + "color: #ff6b6b;";
    clearBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>`;
    clearBtn.onclick = () => {
      stopPlayback();
      (editor.engine as any).recording_clear?.();
      render();
    };
    container.appendChild(clearBtn);
  }
}

function btnStyle(): string {
  return "background: none; border: none; color: #ccc; cursor: pointer; padding: 4px; border-radius: 4px; display: flex; align-items: center;";
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function startRecording(): void {
  const eng = editor.engine as any;
  isRecording = true;
  isPlaying = false;
  playbackTime = 0;
  eng.recording_start?.(BigInt(Date.now()));

  // Capture periodically
  captureInterval = setInterval(() => {
    if (!isRecording) return;
    eng.recording_capture?.(BigInt(Date.now()));
    render();
  }, CAPTURE_INTERVAL_MS);

  render();
}

function stopRecording(): void {
  isRecording = false;
  const eng = editor.engine as any;
  // Capture final frame
  eng.recording_capture?.(BigInt(Date.now()));
  eng.recording_stop?.();
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
  }
  render();
}

function startPlayback(): void {
  if (isPlaying) return;
  const eng = editor.engine as any;
  const durationMs = Number(eng.recording_duration_ms?.() ?? 0);
  if (durationMs === 0) return;

  // Save current scene for restoration after playback
  if (!prePlaybackSnapshot) {
    prePlaybackSnapshot = eng.export_scene?.();
  }

  isPlaying = true;
  lastPlaybackTs = performance.now();

  // If at end, restart from beginning
  if (playbackTime >= durationMs) {
    playbackTime = 0;
  }

  playbackLoop();
  render();
}

function playbackLoop(): void {
  if (!isPlaying) return;
  const now = performance.now();
  const delta = (now - lastPlaybackTs) * playbackSpeed;
  lastPlaybackTs = now;
  playbackTime += delta;

  const eng = editor.engine as any;
  const durationMs = Number(eng.recording_duration_ms?.() ?? 0);

  if (playbackTime >= durationMs) {
    playbackTime = durationMs;
    pausePlayback();
    render();
    return;
  }

  seekTo(playbackTime);
  render();
  playbackRafId = requestAnimationFrame(playbackLoop);
}

function pausePlayback(): void {
  isPlaying = false;
  if (playbackRafId) {
    cancelAnimationFrame(playbackRafId);
    playbackRafId = 0;
  }
  render();
}

function stopPlayback(): void {
  pausePlayback();
  playbackTime = 0;

  // Restore original scene
  if (prePlaybackSnapshot) {
    const eng = editor.engine as any;
    eng.import_scene?.(prePlaybackSnapshot);
    prePlaybackSnapshot = null;
    editor.requestRender();
  }
  render();
}

function seekTo(timeMs: number): void {
  const eng = editor.engine as any;
  eng.recording_seek?.(BigInt(Math.round(timeMs)));
  editor.requestRender();
}
