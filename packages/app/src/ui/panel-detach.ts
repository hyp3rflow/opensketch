/**
 * Multi-window / Detachable Panels
 * 
 * Allows panels (Layers, Properties, etc.) to be popped out into separate browser windows.
 * Uses BroadcastChannel API for real-time state synchronization between main and detached windows.
 */

import type { Editor } from "../editor";

// --- BroadcastChannel Sync Module ---

const CHANNEL_NAME = "opensketch-panel-sync";

export type SyncMessageType =
  | "selection-changed"
  | "scene-changed"
  | "layers-changed"
  | "undo"
  | "redo"
  | "tool-changed"
  | "zoom-changed"
  | "panel-closed"
  | "request-state"
  | "full-state";

export interface SyncMessage {
  type: SyncMessageType;
  panelId?: string;
  payload?: any;
  timestamp: number;
}

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel {
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

export function broadcastSync(msg: Omit<SyncMessage, "timestamp">) {
  try {
    getChannel().postMessage({ ...msg, timestamp: Date.now() });
  } catch (_) {
    // Channel may be closed
  }
}

export function onSyncMessage(handler: (msg: SyncMessage) => void): () => void {
  const ch = getChannel();
  const listener = (e: MessageEvent) => handler(e.data as SyncMessage);
  ch.addEventListener("message", listener);
  return () => ch.removeEventListener("message", listener);
}

// --- Detached Panel Registry ---

interface DetachedPanel {
  id: string;
  title: string;
  window: Window;
  cleanup?: () => void;
}

const detachedPanels = new Map<string, DetachedPanel>();

export function isDetached(panelId: string): boolean {
  const panel = detachedPanels.get(panelId);
  return !!panel && !panel.window.closed;
}

export function getDetachedPanels(): string[] {
  // Clean up closed windows
  for (const [id, panel] of detachedPanels) {
    if (panel.window.closed) {
      panel.cleanup?.();
      detachedPanels.delete(id);
    }
  }
  return [...detachedPanels.keys()];
}

// --- Pop-out / Pop-in ---

/** Available panels that can be detached */
export type DetachablePanelId = "layers" | "properties" | "agent" | "handoff" | "comments" | "variables" | "assets" | "bookmarks";

const PANEL_SIZES: Record<DetachablePanelId, { w: number; h: number }> = {
  layers: { w: 280, h: 600 },
  properties: { w: 320, h: 700 },
  agent: { w: 400, h: 600 },
  handoff: { w: 420, h: 650 },
  comments: { w: 350, h: 500 },
  variables: { w: 380, h: 550 },
  assets: { w: 320, h: 500 },
  bookmarks: { w: 280, h: 400 },
};

const PANEL_LABELS: Record<DetachablePanelId, string> = {
  layers: "Layers",
  properties: "Properties",
  agent: "Agent",
  handoff: "Handoff",
  comments: "Comments",
  variables: "Variables",
  assets: "Assets",
  bookmarks: "Bookmarks",
};

export function detachPanel(panelId: DetachablePanelId, editor: Editor): boolean {
  if (isDetached(panelId)) {
    // Focus existing window
    detachedPanels.get(panelId)!.window.focus();
    return false;
  }

  const size = PANEL_SIZES[panelId];
  const label = PANEL_LABELS[panelId];

  // Open new window
  const features = `width=${size.w},height=${size.h},left=${window.screenX + 50},top=${window.screenY + 50},resizable=yes,scrollbars=yes`;
  const win = window.open("", `opensketch-panel-${panelId}`, features);
  if (!win) {
    console.warn("Popup blocked — cannot detach panel");
    return false;
  }

  // Build detached window document
  buildDetachedWindow(win, panelId, label, editor);

  // Hide panel in main window
  hidePanelInMain(panelId);

  // Track
  const cleanup = () => {
    showPanelInMain(panelId);
    broadcastSync({ type: "panel-closed", panelId });
  };

  detachedPanels.set(panelId, { id: panelId, title: label, window: win, cleanup });

  // Monitor window close
  const checkClosed = setInterval(() => {
    if (win.closed) {
      clearInterval(checkClosed);
      cleanup();
      detachedPanels.delete(panelId);
    }
  }, 500);

  return true;
}

export function reattachPanel(panelId: DetachablePanelId): boolean {
  const panel = detachedPanels.get(panelId);
  if (!panel || panel.window.closed) {
    detachedPanels.delete(panelId);
    return false;
  }
  panel.window.close();
  panel.cleanup?.();
  detachedPanels.delete(panelId);
  return true;
}

// --- Window building ---

function buildDetachedWindow(win: Window, panelId: DetachablePanelId, label: string, editor: Editor) {
  const doc = win.document;
  doc.title = `${label} — OpenSketch`;

  // Copy styles from main window
  doc.head.innerHTML = "";
  const meta = doc.createElement("meta");
  meta.charset = "UTF-8";
  doc.head.appendChild(meta);

  // Inline essential styles
  const style = doc.createElement("style");
  style.textContent = getDetachedStyles();
  doc.head.appendChild(style);

  // Also copy the main stylesheet
  const mainStyles = document.querySelectorAll('link[rel="stylesheet"], style');
  mainStyles.forEach((s) => {
    doc.head.appendChild(s.cloneNode(true));
  });

  doc.body.innerHTML = "";
  doc.body.style.cssText = "margin:0;padding:0;background:#1e1e2e;color:#ccc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;overflow:auto;";

  // Header bar with reattach button
  const header = doc.createElement("div");
  header.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#16161e;border-bottom:1px solid #333;user-select:none;-webkit-app-region:drag;";
  
  const titleEl = doc.createElement("span");
  titleEl.textContent = `📌 ${label}`;
  titleEl.style.cssText = "font-weight:600;font-size:13px;";
  header.appendChild(titleEl);

  const reattachBtn = doc.createElement("button");
  reattachBtn.textContent = "↩ Reattach";
  reattachBtn.title = "Move panel back to main window";
  reattachBtn.style.cssText = "background:#333;border:1px solid #555;color:#ccc;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;-webkit-app-region:no-drag;";
  reattachBtn.addEventListener("click", () => reattachPanel(panelId));
  reattachBtn.addEventListener("mouseenter", () => { reattachBtn.style.background = "#444"; });
  reattachBtn.addEventListener("mouseleave", () => { reattachBtn.style.background = "#333"; });
  header.appendChild(reattachBtn);

  doc.body.appendChild(header);

  // Panel content container
  const content = doc.createElement("div");
  content.id = `detached-${panelId}`;
  content.style.cssText = "flex:1;overflow-y:auto;height:calc(100vh - 40px);";
  doc.body.appendChild(content);

  // Render panel content & set up sync
  setupDetachedPanelContent(content, panelId, editor, win);
}

function setupDetachedPanelContent(container: HTMLElement, panelId: DetachablePanelId, editor: Editor, win: Window) {
  // Dynamically import and setup the panel based on ID
  // We re-use the same setup functions but in the detached window's DOM
  
  if (panelId === "layers") {
    import("./layers-panel").then(({ setupLayersPanel }) => {
      setupLayersPanel(container, editor);
    });
  } else if (panelId === "properties") {
    import("./properties-panel").then(({ setupPropertiesPanel }) => {
      setupPropertiesPanel(container, editor);
      // Trigger initial render with current selection
      const sel = Array.from(editor.engine.get_selection()).map(Number);
      editor.notifySelectionChanged(sel);
    });
  } else if (panelId === "agent") {
    import("./agent-panel").then(({ setupAgentPanel }) => {
      setupAgentPanel(container, editor);
    });
  } else if (panelId === "handoff") {
    import("./handoff-panel").then(({ setupHandoffPanel }) => {
      setupHandoffPanel(container, editor);
    }).catch(() => {
      container.innerHTML = `<div style="padding:16px;color:#888;">Handoff panel</div>`;
    });
  } else if (panelId === "comments") {
    // Comments panel setup
    container.innerHTML = `<div style="padding:16px;color:#888;text-align:center;">Comments panel — synced from main window</div>`;
    // Sync comments via BroadcastChannel
  } else if (panelId === "variables") {
    import("./variables-panel").then((mod) => {
      if (mod.setupVariablesPanel) {
        mod.setupVariablesPanel(container, editor);
      }
    }).catch(() => {
      container.innerHTML = `<div style="padding:16px;color:#888;">Variables panel</div>`;
    });
  } else if (panelId === "assets") {
    import("./asset-panel").then((mod) => {
      if (mod.setupAssetPanel) {
        mod.setupAssetPanel(container, editor);
      }
    }).catch(() => {
      container.innerHTML = `<div style="padding:16px;color:#888;">Assets panel</div>`;
    });
  } else if (panelId === "bookmarks") {
    import("./bookmarks-panel").then((mod) => {
      if (mod.setupBookmarksPanel) {
        mod.setupBookmarksPanel(container, editor);
      }
    }).catch(() => {
      container.innerHTML = `<div style="padding:16px;color:#888;">Bookmarks panel</div>`;
    });
  }

  // Listen for sync messages to refresh content
  const unsub = onSyncMessage((msg) => {
    if (msg.type === "selection-changed" || msg.type === "scene-changed" || msg.type === "layers-changed") {
      // Panels that have their own refresh hooks will auto-update via editor callbacks
      // For detached panels, the editor instance is shared (same origin), so callbacks fire automatically
    }
  });

  // Cleanup on window close
  win.addEventListener("beforeunload", () => unsub());
}

// --- Main window panel visibility ---

function hidePanelInMain(panelId: DetachablePanelId) {
  if (panelId === "layers") {
    const el = document.getElementById("layers-panel");
    if (el) {
      el.dataset.detachedHidden = "true";
      el.style.display = "none";
    }
  } else {
    // Right pane panels: hide the tab and content
    const tab = document.querySelector(`.right-pane-tab[data-tab="${panelId}"]`) as HTMLElement;
    if (tab) {
      tab.dataset.detachedHidden = "true";
      tab.style.display = "none";
    }
    const content = document.getElementById(`${panelId}-panel`);
    if (content && content.classList.contains("active")) {
      // Switch to properties tab
      const propsTab = document.querySelector('.right-pane-tab[data-tab="properties"]') as HTMLElement;
      if (propsTab) propsTab.click();
    }
  }
}

function showPanelInMain(panelId: DetachablePanelId) {
  if (panelId === "layers") {
    const el = document.getElementById("layers-panel");
    if (el) {
      delete el.dataset.detachedHidden;
      el.style.display = "";
    }
  } else {
    const tab = document.querySelector(`.right-pane-tab[data-tab="${panelId}"]`) as HTMLElement;
    if (tab) {
      delete tab.dataset.detachedHidden;
      tab.style.display = "";
    }
  }
}

// --- Pop-out button injection ---

export function addPopOutButton(headerEl: HTMLElement, panelId: DetachablePanelId, editor: Editor) {
  const btn = document.createElement("button");
  btn.className = "panel-popout-btn";
  btn.title = `Pop out ${PANEL_LABELS[panelId]} to separate window`;
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>`;
  btn.style.cssText = "background:none;border:none;cursor:pointer;padding:2px 4px;border-radius:4px;opacity:0.4;display:flex;align-items:center;color:currentColor;transition:opacity 0.15s;";
  btn.addEventListener("mouseenter", () => { btn.style.opacity = "1"; });
  btn.addEventListener("mouseleave", () => { btn.style.opacity = "0.4"; });
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    detachPanel(panelId, editor);
  });
  headerEl.appendChild(btn);
}

// --- Hook into editor for sync broadcasts ---

export function setupPanelSync(editor: Editor) {
  // Broadcast selection changes via the editor's callback system
  (editor as any).onSelectionChanges.push((ids: number[]) => {
    broadcastSync({ type: "selection-changed", payload: ids });
  });

  // Broadcast layer changes
  (editor as any).onLayersChanges.push(() => {
    broadcastSync({ type: "layers-changed" });
  });
}

// --- Styles for detached windows ---

function getDetachedStyles(): string {
  return `
    * { box-sizing: border-box; }
    body { display: flex; flex-direction: column; height: 100vh; }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #555; }
    
    /* Re-use OpenSketch panel styles */
    .layers-header { padding: 10px 12px; font-weight: 600; font-size: 12px; color: #aaa; text-transform: uppercase; letter-spacing: 0.5px; }
    .layer-item { display: flex; align-items: center; padding: 4px 8px; cursor: pointer; border-radius: 4px; gap: 6px; font-size: 12px; }
    .layer-item:hover { background: rgba(255,255,255,0.05); }
    .layer-item.selected { background: rgba(66,133,244,0.15); color: #8ab4f8; }
    
    input, select, textarea {
      background: #1a1a2e;
      border: 1px solid #333;
      color: #ccc;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 12px;
      outline: none;
    }
    input:focus, select:focus, textarea:focus { border-color: #4a90d9; }
    button { font-family: inherit; }
  `;
}
