import type { Editor, ToolType } from "../editor";
import { icons } from "./icons";

const WHITEBOARD_TOOLS: ToolType[] = ["select", "sticky", "pen", "text", "freehand", "connector"];

const VOTE_COLORS = [
  "#ff6b6b", "#ffa94d", "#ffd43b", "#69db7c", "#4dabf7",
  "#9775fa", "#f783ac", "#20c997", "#ff922b", "#845ef7",
];

interface VoteDot {
  x: number;
  y: number;
  color: string;
  userId: string;
}

export class WhiteboardMode {
  private editor: Editor;
  private active = false;
  private votingActive = false;
  private voteDots: VoteDot[] = [];
  private userId = "local";
  private userColor: string;
  private timerInterval: number | null = null;
  private overlay: HTMLDivElement | null = null;
  private timerWidget: HTMLDivElement | null = null;

  constructor(editor: Editor) {
    this.editor = editor;
    this.userColor = VOTE_COLORS[Math.floor(Math.random() * VOTE_COLORS.length)];
  }

  get isActive() { return this.active; }
  get isVoting() { return this.votingActive; }

  toggle(): boolean {
    const engine = this.editor.engine;
    const nowActive = engine.toggle_whiteboard_mode();
    this.active = nowActive;

    if (nowActive) {
      this.enterWhiteboardMode();
    } else {
      this.exitWhiteboardMode();
    }
    return nowActive;
  }

  private enterWhiteboardMode() {
    // Simplify toolbar
    this.updateToolbarVisibility(true);
    // Create overlay for dot grid background
    this.createOverlay();
    // Create timer widget
    this.createTimerWidget();
    // Set tool to sticky by default
    this.editor.setTool("sticky");
    this.editor.requestRender();
  }

  private exitWhiteboardMode() {
    this.updateToolbarVisibility(false);
    this.removeOverlay();
    this.removeTimerWidget();
    this.stopTimerInterval();
    this.votingActive = false;
    this.editor.requestRender();
  }

  private updateToolbarVisibility(whiteboardMode: boolean) {
    const toolbar = document.getElementById("toolbar");
    if (!toolbar) return;
    const buttons = toolbar.querySelectorAll<HTMLElement>(".tool-btn");
    buttons.forEach(btn => {
      const tool = btn.getAttribute("data-tool") as ToolType;
      if (!tool) return;
      if (whiteboardMode) {
        btn.style.display = WHITEBOARD_TOOLS.includes(tool) ? "" : "none";
      } else {
        btn.style.display = "";
      }
    });
    // Also hide separators in whiteboard mode
    const seps = toolbar.querySelectorAll<HTMLElement>(".tool-btn-separator");
    seps.forEach(s => s.style.display = whiteboardMode ? "none" : "");
  }

  private createOverlay() {
    this.removeOverlay();
    const el = document.createElement("div");
    el.id = "whiteboard-overlay";
    el.style.cssText = `
      position: fixed; inset: 0; pointer-events: none; z-index: 0;
      background-image: radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px);
      background-size: 24px 24px;
    `;
    document.body.appendChild(el);
    this.overlay = el;
  }

  private removeOverlay() {
    this.overlay?.remove();
    this.overlay = null;
  }

  private createTimerWidget() {
    this.removeTimerWidget();
    const w = document.createElement("div");
    w.id = "whiteboard-timer";
    w.style.cssText = `
      position: fixed; top: 60px; left: 16px; z-index: 1000;
      background: rgba(30,30,40,0.92); border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px; padding: 12px 16px; color: #fff;
      font-family: Inter, system-ui, sans-serif; font-size: 13px;
      display: flex; flex-direction: column; gap: 8px; min-width: 180px;
      backdrop-filter: blur(12px); box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    `;
    w.innerHTML = `
      <div style="font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;opacity:0.6">⏱ Timer</div>
      <div id="wb-timer-display" style="font-size:28px;font-weight:700;font-variant-numeric:tabular-nums;text-align:center">05:00</div>
      <div style="display:flex;gap:6px">
        <button id="wb-timer-start" style="flex:1;padding:4px 8px;border-radius:6px;border:none;background:#4dabf7;color:#fff;cursor:pointer;font-size:12px;font-weight:600">Start</button>
        <button id="wb-timer-stop" style="flex:1;padding:4px 8px;border-radius:6px;border:none;background:#ff6b6b;color:#fff;cursor:pointer;font-size:12px;font-weight:600">Stop</button>
        <button id="wb-timer-reset" style="flex:1;padding:4px 8px;border-radius:6px;border:none;background:rgba(255,255,255,0.15);color:#fff;cursor:pointer;font-size:12px;font-weight:600">Reset</button>
      </div>
      <div style="display:flex;gap:4px;align-items:center">
        <label style="font-size:11px;opacity:0.6">Min:</label>
        <input id="wb-timer-input" type="number" min="1" max="60" value="5" style="width:40px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:4px;color:#fff;padding:2px 4px;font-size:12px;text-align:center">
      </div>
    `;
    document.body.appendChild(w);
    this.timerWidget = w;

    w.querySelector("#wb-timer-start")!.addEventListener("click", () => this.startTimer());
    w.querySelector("#wb-timer-stop")!.addEventListener("click", () => this.stopTimer());
    w.querySelector("#wb-timer-reset")!.addEventListener("click", () => this.resetTimer());

    this.updateTimerDisplay();
  }

  private removeTimerWidget() {
    this.timerWidget?.remove();
    this.timerWidget = null;
  }

  private startTimer() {
    this.editor.engine.start_timer();
    this.stopTimerInterval();
    this.timerInterval = window.setInterval(() => {
      const remaining = this.editor.engine.tick_timer();
      this.updateTimerDisplay();
      if (remaining === 0) {
        this.stopTimerInterval();
        this.onTimerEnd();
      }
    }, 1000);
  }

  private stopTimer() {
    this.editor.engine.stop_timer();
    this.stopTimerInterval();
    this.updateTimerDisplay();
  }

  private resetTimer() {
    const input = document.getElementById("wb-timer-input") as HTMLInputElement | null;
    const mins = Math.max(1, Math.min(60, parseInt(input?.value || "5")));
    this.editor.engine.reset_timer(mins * 60);
    this.stopTimerInterval();
    this.updateTimerDisplay();
  }

  private stopTimerInterval() {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private updateTimerDisplay() {
    const display = document.getElementById("wb-timer-display");
    if (!display) return;
    const stateStr = this.editor.engine.get_timer_state();
    if (stateStr === "null") return;
    try {
      const state = JSON.parse(stateStr);
      const mins = Math.floor(state.remaining_secs / 60);
      const secs = state.remaining_secs % 60;
      display.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
      display.style.color = state.remaining_secs <= 30 ? "#ff6b6b" : "#fff";
    } catch {}
  }

  private onTimerEnd() {
    const display = document.getElementById("wb-timer-display");
    if (display) {
      display.textContent = "00:00";
      display.style.color = "#ff6b6b";
      // Flash effect
      let count = 0;
      const flash = setInterval(() => {
        display.style.opacity = count % 2 === 0 ? "0.3" : "1";
        count++;
        if (count > 10) clearInterval(flash);
      }, 300);
    }
  }

  // Voting
  toggleVoting(): boolean {
    this.votingActive = !this.votingActive;
    this.editor.engine.set_voting_enabled(this.votingActive);
    return this.votingActive;
  }

  handleCanvasClick(sceneX: number, sceneY: number): boolean {
    if (!this.active || !this.votingActive) return false;
    // Place a voting dot
    this.voteDots.push({
      x: sceneX,
      y: sceneY,
      color: this.userColor,
      userId: this.userId,
    });
    this.editor.requestRender();
    return true;
  }

  renderVoteDots(ctx: CanvasRenderingContext2D, zoom: number, panX: number, panY: number) {
    if (!this.active || this.voteDots.length === 0) return;
    for (const dot of this.voteDots) {
      const sx = dot.x * zoom + panX;
      const sy = dot.y * zoom + panY;
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fillStyle = dot.color;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  handleKeydown(key: string): boolean {
    if (key === "w" || key === "W") {
      this.toggle();
      return true;
    }
    if (this.active && (key === "v" || key === "V")) {
      this.toggleVoting();
      return true;
    }
    return false;
  }

  destroy() {
    this.stopTimerInterval();
    this.removeOverlay();
    this.removeTimerWidget();
  }
}
