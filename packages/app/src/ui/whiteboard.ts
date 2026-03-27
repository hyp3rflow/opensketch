/**
 * Collaborative Whiteboard Mode
 * - Whiteboard mode toggle (toolbar)
 * - Timer widget (start/stop/reset countdown)
 * - Voting dots UI for sticky notes
 * - Freehand tool color/thickness controls
 */

import type { Editor } from "../editor";
import { icons } from "./icons";

// =============================================
// Whiteboard Mode State
// =============================================

let whiteboardMode = false;
let timerVisible = false;
let timerInterval: number | null = null;
let timerSeconds = 300; // default 5 minutes
let timerRunning = false;
let timerRemainingSeconds = 300;

let timerContainer: HTMLElement | null = null;
let whiteboardBar: HTMLElement | null = null;
let freehandOptionsEl: HTMLElement | null = null;

// Freehand tool settings
let freehandColor = "#ffffff";
let freehandWidth = 2;

export function isWhiteboardMode(): boolean {
  return whiteboardMode;
}

export function getFreehandColor(): string {
  return freehandColor;
}

export function getFreehandWidth(): number {
  return freehandWidth;
}

// =============================================
// Whiteboard Mode Toggle
// =============================================

export function setupWhiteboardMode(editor: Editor) {
  // Create floating whiteboard bar
  whiteboardBar = document.createElement("div");
  whiteboardBar.id = "whiteboard-bar";
  whiteboardBar.style.cssText = `
    position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
    display: none; align-items: center; gap: 8px;
    background: rgba(30,30,46,0.95); border-radius: 12px;
    padding: 6px 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    z-index: 900; font-size: 13px; color: #e0e0e0;
    border: 1px solid rgba(255,255,255,0.08);
  `;

  // Whiteboard label
  const label = document.createElement("span");
  label.textContent = "🎨 Whiteboard";
  label.style.cssText = "font-weight: 600; margin-right: 4px;";
  whiteboardBar.appendChild(label);

  // Quick tool buttons
  const quickTools = [
    { icon: icons.stickyNote, tool: "sticky" as const, tip: "Sticky Note" },
    { icon: icons.freehand, tool: "freehand" as const, tip: "Freehand Draw" },
    { icon: icons.connector, tool: "connector" as const, tip: "Connector" },
  ];

  for (const qt of quickTools) {
    const btn = document.createElement("button");
    btn.innerHTML = qt.icon;
    btn.title = qt.tip;
    btn.style.cssText = `
      background: rgba(255,255,255,0.08); border: none; color: #e0e0e0;
      width: 32px; height: 32px; border-radius: 8px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    `;
    btn.addEventListener("click", () => editor.setTool(qt.tool));
    btn.addEventListener("mouseenter", () => btn.style.background = "rgba(255,255,255,0.15)");
    btn.addEventListener("mouseleave", () => btn.style.background = "rgba(255,255,255,0.08)");
    whiteboardBar.appendChild(btn);
  }

  // Separator
  const sep1 = document.createElement("div");
  sep1.style.cssText = "width: 1px; height: 20px; background: rgba(255,255,255,0.15);";
  whiteboardBar.appendChild(sep1);

  // Freehand options (color + width)
  freehandOptionsEl = document.createElement("div");
  freehandOptionsEl.style.cssText = "display: flex; align-items: center; gap: 6px;";

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = freehandColor;
  colorInput.title = "Freehand color";
  colorInput.style.cssText = "width: 24px; height: 24px; border: none; background: none; cursor: pointer; padding: 0;";
  colorInput.addEventListener("input", () => { freehandColor = colorInput.value; });
  freehandOptionsEl.appendChild(colorInput);

  const widthInput = document.createElement("input");
  widthInput.type = "range";
  widthInput.min = "1";
  widthInput.max = "12";
  widthInput.value = String(freehandWidth);
  widthInput.title = "Stroke width";
  widthInput.style.cssText = "width: 60px; accent-color: #7c6ef6;";
  widthInput.addEventListener("input", () => { freehandWidth = parseInt(widthInput.value); });
  freehandOptionsEl.appendChild(widthInput);

  whiteboardBar.appendChild(freehandOptionsEl);

  // Separator
  const sep2 = document.createElement("div");
  sep2.style.cssText = "width: 1px; height: 20px; background: rgba(255,255,255,0.15);";
  whiteboardBar.appendChild(sep2);

  // Timer button
  const timerBtn = document.createElement("button");
  timerBtn.innerHTML = icons.timer;
  timerBtn.title = "Timer";
  timerBtn.style.cssText = `
    background: rgba(255,255,255,0.08); border: none; color: #e0e0e0;
    width: 32px; height: 32px; border-radius: 8px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  `;
  timerBtn.addEventListener("click", () => toggleTimer());
  timerBtn.addEventListener("mouseenter", () => timerBtn.style.background = "rgba(255,255,255,0.15)");
  timerBtn.addEventListener("mouseleave", () => timerBtn.style.background = "rgba(255,255,255,0.08)");
  whiteboardBar.appendChild(timerBtn);

  // Vote button (for selected sticky note)
  const voteBtn = document.createElement("button");
  voteBtn.innerHTML = icons.vote;
  voteBtn.title = "Vote on sticky note";
  voteBtn.style.cssText = `
    background: rgba(255,255,255,0.08); border: none; color: #e0e0e0;
    width: 32px; height: 32px; border-radius: 8px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  `;
  voteBtn.addEventListener("click", () => {
    const sel = Array.from(editor.engine.get_selection()).map(Number);
    for (const id of sel) {
      const info = editor.engine.get_sticky_info(id);
      if (info && info !== "null") {
        editor.engine.push_undo();
        editor.engine.sticky_add_vote(id, "local");
        editor.requestRender();
      }
    }
  });
  voteBtn.addEventListener("mouseenter", () => voteBtn.style.background = "rgba(255,255,255,0.15)");
  voteBtn.addEventListener("mouseleave", () => voteBtn.style.background = "rgba(255,255,255,0.08)");
  whiteboardBar.appendChild(voteBtn);

  // Close button
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.title = "Exit whiteboard mode";
  closeBtn.style.cssText = `
    background: rgba(255,80,80,0.2); border: none; color: #ff8888;
    width: 28px; height: 28px; border-radius: 8px; cursor: pointer;
    font-size: 14px; display: flex; align-items: center; justify-content: center;
  `;
  closeBtn.addEventListener("click", () => toggleWhiteboardMode(editor));
  whiteboardBar.appendChild(closeBtn);

  document.body.appendChild(whiteboardBar);

  // Create timer overlay
  createTimerWidget();
}

export function toggleWhiteboardMode(editor: Editor) {
  whiteboardMode = !whiteboardMode;
  if (whiteboardBar) {
    whiteboardBar.style.display = whiteboardMode ? "flex" : "none";
  }
  if (!whiteboardMode && timerVisible) {
    timerVisible = false;
    if (timerContainer) timerContainer.style.display = "none";
  }
}

// =============================================
// Timer Widget
// =============================================

function createTimerWidget() {
  timerContainer = document.createElement("div");
  timerContainer.id = "whiteboard-timer";
  timerContainer.style.cssText = `
    position: fixed; top: 60px; right: 20px;
    display: none; flex-direction: column; align-items: center; gap: 8px;
    background: rgba(30,30,46,0.95); border-radius: 16px;
    padding: 16px 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    z-index: 901; color: #e0e0e0;
    border: 1px solid rgba(255,255,255,0.08);
    min-width: 180px;
  `;

  // Time display
  const timeDisplay = document.createElement("div");
  timeDisplay.id = "timer-display";
  timeDisplay.style.cssText = "font-size: 48px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: 2px;";
  timeDisplay.textContent = formatTime(timerRemainingSeconds);
  timerContainer.appendChild(timeDisplay);

  // Duration presets
  const presets = document.createElement("div");
  presets.style.cssText = "display: flex; gap: 6px; margin-bottom: 4px;";
  for (const mins of [1, 3, 5, 10, 15]) {
    const btn = document.createElement("button");
    btn.textContent = `${mins}m`;
    btn.style.cssText = `
      background: rgba(255,255,255,0.1); border: none; color: #ccc;
      padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 12px;
    `;
    btn.addEventListener("click", () => {
      timerSeconds = mins * 60;
      timerRemainingSeconds = timerSeconds;
      timerRunning = false;
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
      updateTimerDisplay();
    });
    btn.addEventListener("mouseenter", () => btn.style.background = "rgba(255,255,255,0.2)");
    btn.addEventListener("mouseleave", () => btn.style.background = "rgba(255,255,255,0.1)");
    presets.appendChild(btn);
  }
  timerContainer.appendChild(presets);

  // Controls
  const controls = document.createElement("div");
  controls.style.cssText = "display: flex; gap: 8px;";

  const playBtn = document.createElement("button");
  playBtn.id = "timer-play";
  playBtn.textContent = "▶ Start";
  playBtn.style.cssText = `
    background: #4CAF50; border: none; color: white;
    padding: 8px 20px; border-radius: 8px; cursor: pointer;
    font-weight: 600; font-size: 14px;
  `;
  playBtn.addEventListener("click", () => {
    if (timerRunning) {
      // Pause
      timerRunning = false;
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
      playBtn.textContent = "▶ Resume";
      playBtn.style.background = "#4CAF50";
    } else {
      // Start / Resume
      if (timerRemainingSeconds <= 0) {
        timerRemainingSeconds = timerSeconds;
      }
      timerRunning = true;
      playBtn.textContent = "⏸ Pause";
      playBtn.style.background = "#FF9800";
      timerInterval = window.setInterval(() => {
        if (timerRemainingSeconds > 0) {
          timerRemainingSeconds--;
          updateTimerDisplay();
        } else {
          // Time's up!
          timerRunning = false;
          if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
          playBtn.textContent = "▶ Start";
          playBtn.style.background = "#4CAF50";
          flashTimerDone();
        }
      }, 1000);
    }
  });
  controls.appendChild(playBtn);

  const resetBtn = document.createElement("button");
  resetBtn.textContent = "↺ Reset";
  resetBtn.style.cssText = `
    background: rgba(255,255,255,0.1); border: none; color: #ccc;
    padding: 8px 16px; border-radius: 8px; cursor: pointer;
    font-weight: 500; font-size: 14px;
  `;
  resetBtn.addEventListener("click", () => {
    timerRunning = false;
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    timerRemainingSeconds = timerSeconds;
    updateTimerDisplay();
    playBtn.textContent = "▶ Start";
    playBtn.style.background = "#4CAF50";
  });
  controls.appendChild(resetBtn);

  timerContainer.appendChild(controls);
  document.body.appendChild(timerContainer);
}

function toggleTimer() {
  timerVisible = !timerVisible;
  if (timerContainer) {
    timerContainer.style.display = timerVisible ? "flex" : "none";
  }
}

export function isTimerVisible(): boolean {
  return timerVisible;
}

export function toggleTimerVisibility() {
  toggleTimer();
}

function updateTimerDisplay() {
  const display = document.getElementById("timer-display");
  if (display) {
    display.textContent = formatTime(timerRemainingSeconds);
    // Color code: green > 60s, yellow 10-60s, red < 10s
    if (timerRemainingSeconds > 60) {
      display.style.color = "#e0e0e0";
    } else if (timerRemainingSeconds > 10) {
      display.style.color = "#FFB74D";
    } else {
      display.style.color = "#EF5350";
    }
  }
}

function flashTimerDone() {
  if (!timerContainer) return;
  timerContainer.style.animation = "timer-flash 0.5s ease-in-out 3";
  // Add keyframes if not present
  if (!document.getElementById("timer-flash-style")) {
    const style = document.createElement("style");
    style.id = "timer-flash-style";
    style.textContent = `
      @keyframes timer-flash {
        0%, 100% { border-color: rgba(255,255,255,0.08); }
        50% { border-color: #EF5350; box-shadow: 0 0 20px rgba(239,83,80,0.4); }
      }
    `;
    document.head.appendChild(style);
  }
  setTimeout(() => {
    if (timerContainer) timerContainer.style.animation = "";
  }, 1500);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// =============================================
// Vote UI for Sticky Notes (Properties Panel)
// =============================================

export function renderStickyVoteUI(container: HTMLElement, editor: Editor, nodeId: number): void {
  const info = editor.engine.get_sticky_info(nodeId);
  if (!info || info === "null") return;

  const data = JSON.parse(info);

  const section = document.createElement("div");
  section.style.cssText = "padding: 8px 12px; border-top: 1px solid rgba(255,255,255,0.06);";

  // Header
  const header = document.createElement("div");
  header.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;";
  const title = document.createElement("span");
  title.textContent = "Votes";
  title.style.cssText = "font-weight: 600; font-size: 12px; text-transform: uppercase; color: #888;";
  header.appendChild(title);

  const totalBadge = document.createElement("span");
  totalBadge.textContent = String(data.total_votes || 0);
  totalBadge.style.cssText = `
    background: #7c6ef6; color: white; border-radius: 10px;
    padding: 2px 8px; font-size: 11px; font-weight: 600;
  `;
  header.appendChild(totalBadge);
  section.appendChild(header);

  // Vote buttons
  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display: flex; gap: 6px;";

  const addVoteBtn = document.createElement("button");
  addVoteBtn.textContent = "👍 +1 Vote";
  addVoteBtn.style.cssText = `
    flex: 1; background: rgba(124,110,246,0.15); border: 1px solid rgba(124,110,246,0.3);
    color: #b4a8ff; padding: 6px; border-radius: 6px; cursor: pointer;
    font-size: 13px; font-weight: 500;
  `;
  addVoteBtn.addEventListener("click", () => {
    editor.engine.push_undo();
    editor.engine.sticky_add_vote(nodeId, "local");
    editor.requestRender();
    // Re-render the panel
    container.innerHTML = "";
    renderStickyVoteUI(container, editor, nodeId);
  });
  btnRow.appendChild(addVoteBtn);

  const removeVoteBtn = document.createElement("button");
  removeVoteBtn.textContent = "👎 -1";
  removeVoteBtn.style.cssText = `
    background: rgba(255,80,80,0.1); border: 1px solid rgba(255,80,80,0.2);
    color: #ff8888; padding: 6px 12px; border-radius: 6px; cursor: pointer;
    font-size: 13px;
  `;
  removeVoteBtn.addEventListener("click", () => {
    editor.engine.push_undo();
    editor.engine.sticky_remove_vote(nodeId, "local");
    editor.requestRender();
    container.innerHTML = "";
    renderStickyVoteUI(container, editor, nodeId);
  });
  btnRow.appendChild(removeVoteBtn);

  section.appendChild(btnRow);

  // Voter list
  if (data.votes && data.votes.length > 0) {
    const list = document.createElement("div");
    list.style.cssText = "margin-top: 6px; font-size: 12px; color: #999;";
    for (const v of data.votes) {
      const row = document.createElement("div");
      row.style.cssText = "display: flex; justify-content: space-between; padding: 2px 0;";
      row.innerHTML = `<span>🗳️ ${v.user_id}</span><span style="color:#b4a8ff;font-weight:600;">${v.count}</span>`;
      list.appendChild(row);
    }
    section.appendChild(list);
  }

  // Theme selector
  const themeRow = document.createElement("div");
  themeRow.style.cssText = "display: flex; gap: 4px; margin-top: 8px;";
  const themes = ["yellow", "green", "blue", "pink", "orange", "purple", "gray"];
  const themeColors: Record<string, string> = {
    yellow: "#FFF9C4", green: "#C8E6C9", blue: "#BBDEFB",
    pink: "#F8BBD0", orange: "#FFE0B2", purple: "#E1BEE7", gray: "#E0E0E0",
  };
  for (const t of themes) {
    const dot = document.createElement("button");
    dot.style.cssText = `
      width: 20px; height: 20px; border-radius: 50%;
      background: ${themeColors[t]}; border: 2px solid ${data.theme === t ? "#7c6ef6" : "transparent"};
      cursor: pointer;
    `;
    dot.title = t;
    dot.addEventListener("click", () => {
      editor.engine.push_undo();
      editor.engine.set_sticky_theme(nodeId, t);
      editor.requestRender();
      container.innerHTML = "";
      renderStickyVoteUI(container, editor, nodeId);
    });
    themeRow.appendChild(dot);
  }
  section.appendChild(themeRow);

  container.appendChild(section);
}
