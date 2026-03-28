/**
 * Voice-controlled design — Web Speech API
 * Captures speech → sends to LLM agent for parsing/execution
 */

import type { Editor } from "../editor";
import { icons } from "./icons";

interface VoiceState {
  recognition: SpeechRecognition | null;
  isListening: boolean;
  button: HTMLButtonElement | null;
  indicator: HTMLDivElement | null;
}

const state: VoiceState = {
  recognition: null,
  isListening: false,
  button: null,
  indicator: null,
};

// Direct command patterns (no LLM needed)
const DIRECT_COMMANDS: { pattern: RegExp; action: (editor: Editor, match: RegExpMatchArray) => void }[] = [
  {
    pattern: /^undo$/i,
    action: (editor) => { editor.engine.undo(); editor.requestRender(); },
  },
  {
    pattern: /^redo$/i,
    action: (editor) => { editor.engine.redo(); editor.requestRender(); },
  },
  {
    pattern: /^delete$/i,
    action: (editor) => {
      const sel = Array.from(editor.engine.get_selection());
      if (sel.length > 0) {
        editor.engine.push_undo();
        sel.forEach(id => editor.engine.delete_node(id));
        editor.requestRender();
      }
    },
  },
  {
    pattern: /^select all$/i,
    action: (editor) => { editor.engine.select_all(); editor.requestRender(); },
  },
  {
    pattern: /^deselect$/i,
    action: (editor) => { editor.engine.deselect_all(); editor.requestRender(); },
  },
  {
    pattern: /^zoom (?:to )?fit$/i,
    action: (editor) => { editor.zoomToFit(); },
  },
  {
    pattern: /^zoom (?:to )?100$/i,
    action: (editor) => { editor.zoomTo100(); },
  },
];

function showTranscript(text: string, status: "listening" | "processing" | "done" | "error") {
  if (!state.indicator) return;
  const colors = { listening: "#ef4444", processing: "#f59e0b", done: "#10b981", error: "#ef4444" };
  const labels = { listening: "🎤 Listening...", processing: "⏳ Processing...", done: "✅", error: "❌" };
  state.indicator.style.display = "flex";
  state.indicator.style.borderColor = colors[status];
  state.indicator.innerHTML = `
    <span style="color:${colors[status]};font-size:11px;font-weight:600;">${labels[status]}</span>
    <span style="font-size:12px;color:#e2e8f0;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${text}</span>
  `;
  if (status === "done" || status === "error") {
    setTimeout(() => { if (state.indicator) state.indicator.style.display = "none"; }, 2500);
  }
}

function processTranscript(text: string, editor: Editor) {
  const trimmed = text.trim();
  if (!trimmed) return;

  showTranscript(trimmed, "processing");

  // Try direct commands first
  for (const cmd of DIRECT_COMMANDS) {
    const match = trimmed.match(cmd.pattern);
    if (match) {
      cmd.action(editor, match);
      showTranscript(`${trimmed} ✓`, "done");
      return;
    }
  }

  // Send to LLM agent via the agent panel's sendLLM
  const agentInput = document.querySelector<HTMLInputElement>(".agent-input");
  if (agentInput) {
    // Switch to agent tab
    const agentTab = document.querySelector('[data-tab="agent"]') as HTMLElement;
    agentTab?.click();

    // Set input value and trigger send
    agentInput.value = `[Voice] ${trimmed}`;
    agentInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    showTranscript(trimmed, "done");
  } else {
    showTranscript("Agent panel not found", "error");
  }
}

function initRecognition(editor: Editor): SpeechRecognition | null {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    state.isListening = true;
    state.button?.classList.add("voice-active");
    showTranscript("", "listening");
  };

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    let finalTranscript = "";
    let interimTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result && result[0]) {
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }
    }
    if (interimTranscript) {
      showTranscript(interimTranscript, "listening");
    }
    if (finalTranscript) {
      processTranscript(finalTranscript, editor);
    }
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    state.isListening = false;
    state.button?.classList.remove("voice-active");
    if (event.error !== "aborted" && event.error !== "no-speech") {
      showTranscript(`Error: ${event.error}`, "error");
    }
  };

  recognition.onend = () => {
    state.isListening = false;
    state.button?.classList.remove("voice-active");
  };

  return recognition;
}

export function toggleVoice(editor: Editor) {
  if (state.isListening) {
    state.recognition?.stop();
    return;
  }

  if (!state.recognition) {
    state.recognition = initRecognition(editor);
  }

  if (!state.recognition) {
    showTranscript("Speech API not supported", "error");
    return;
  }

  try {
    state.recognition.start();
  } catch {
    // Already started
  }
}

export function setupVoiceControl(toolbarContainer: HTMLElement, editor: Editor) {
  // Check browser support
  const supported = !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;

  // Add mic button to toolbar
  const sep = document.createElement("div");
  sep.className = "tool-btn-separator";
  toolbarContainer.appendChild(sep);

  const btn = document.createElement("button");
  btn.className = "tool-btn";
  btn.id = "voice-control-btn";
  btn.title = supported ? "Voice Command (⌘⇧V)" : "Voice not supported in this browser";
  btn.innerHTML = icons.mic;
  btn.disabled = !supported;
  btn.addEventListener("click", () => toggleVoice(editor));
  toolbarContainer.appendChild(btn);
  state.button = btn;

  // Floating transcript indicator
  const indicator = document.createElement("div");
  indicator.className = "voice-indicator";
  indicator.style.cssText = `
    display: none;
    position: fixed;
    top: 60px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(15, 23, 42, 0.95);
    border: 2px solid #ef4444;
    border-radius: 12px;
    padding: 8px 16px;
    gap: 8px;
    align-items: center;
    z-index: 10000;
    backdrop-filter: blur(8px);
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;
  document.body.appendChild(indicator);
  state.indicator = indicator;

  // Keyboard shortcut: Cmd+Shift+V (or Ctrl+Shift+V)
  // Registered via shortcut manager if available, otherwise direct
  (window as any).__toggleVoice = () => toggleVoice(editor);

  // Add CSS for active state
  const style = document.createElement("style");
  style.textContent = `
    .voice-active {
      background: rgba(239, 68, 68, 0.3) !important;
      animation: voice-pulse 1s infinite;
    }
    @keyframes voice-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
      50% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
    }
  `;
  document.head.appendChild(style);
}
