/**
 * Smart Component Suggestions Panel
 * AI-based detection of repeating visual patterns with component extraction suggestions.
 */

import type { Engine } from "../wasm/opensketch_engine";

interface ComponentSuggestion {
  name: string;
  reason: string;
  groups: number[][];
  instance_count: number;
  confidence: number;
  suggested_name: string;
}

let panelEl: HTMLDivElement | null = null;

export function isSmartSuggestionsOpen(): boolean {
  return panelEl !== null;
}

export function closeSmartSuggestions(): void {
  if (panelEl) {
    panelEl.remove();
    panelEl = null;
  }
}

export function openSmartSuggestions(
  engine: Engine,
  onSelectNode: (nodeId: number, pageId?: number) => void,
  onCreateComponent?: (nodeIds: number[], name: string) => void
): void {
  if (panelEl) { closeSmartSuggestions(); return; }

  const json = engine.suggest_components();
  let suggestions: ComponentSuggestion[];
  try {
    suggestions = JSON.parse(json);
  } catch {
    suggestions = [];
  }

  panelEl = document.createElement("div");
  panelEl.className = "smart-suggestions-panel";
  panelEl.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 520px; max-height: 600px; background: #2a2a2a; border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5); z-index: 9999; display: flex;
    flex-direction: column; color: #e0e0e0; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 13px; overflow: hidden;
  `;

  // Header
  const header = document.createElement("div");
  header.style.cssText = `
    padding: 16px 20px; border-bottom: 1px solid #3a3a3a; display: flex;
    align-items: center; justify-content: space-between; flex-shrink: 0;
  `;
  header.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
      </svg>
      <span style="font-weight:600;font-size:14px;">Smart Component Suggestions</span>
      <span style="color:#888;font-size:12px;">${suggestions.length} found</span>
    </div>
  `;
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = `background:none;border:none;color:#888;cursor:pointer;font-size:16px;padding:4px 8px;border-radius:4px;`;
  closeBtn.onmouseenter = () => closeBtn.style.color = "#fff";
  closeBtn.onmouseleave = () => closeBtn.style.color = "#888";
  closeBtn.onclick = closeSmartSuggestions;
  header.appendChild(closeBtn);
  panelEl.appendChild(header);

  // Body
  const body = document.createElement("div");
  body.style.cssText = `overflow-y:auto;flex:1;padding:12px 16px;`;

  if (suggestions.length === 0) {
    body.innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:#888;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="1.5" stroke-linecap="round" style="margin-bottom:12px;">
          <circle cx="12" cy="12" r="10"/><path d="M8 15h8"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="9" r="1"/>
        </svg>
        <div style="font-size:14px;margin-bottom:4px;">No patterns detected</div>
        <div style="font-size:12px;">Add more nodes to the canvas and try again.</div>
      </div>
    `;
  } else {
    for (const s of suggestions) {
      const card = document.createElement("div");
      card.style.cssText = `
        background:#333;border-radius:8px;padding:12px 16px;margin-bottom:8px;
        border:1px solid #444;transition:border-color 0.15s;cursor:default;
      `;
      card.onmouseenter = () => card.style.borderColor = "#a78bfa";
      card.onmouseleave = () => card.style.borderColor = "#444";

      const confidenceColor = s.confidence >= 0.7 ? "#4ade80" : s.confidence >= 0.5 ? "#fbbf24" : "#888";
      const confidencePct = Math.round(s.confidence * 100);

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-weight:600;font-size:13px;">${escHtml(s.name)}</span>
          <span style="font-size:11px;color:${confidenceColor};font-weight:500;">${confidencePct}%</span>
        </div>
        <div style="font-size:12px;color:#aaa;margin-bottom:8px;">${escHtml(s.reason)}</div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <span style="font-size:11px;color:#888;">Suggested name:</span>
          <span style="font-size:12px;background:#444;padding:2px 8px;border-radius:4px;">${escHtml(s.suggested_name)}</span>
          <span style="font-size:11px;color:#888;margin-left:auto;">${s.instance_count} instances</span>
        </div>
      `;

      // Actions row
      const actions = document.createElement("div");
      actions.style.cssText = `display:flex;gap:6px;margin-top:8px;`;

      // Select all button
      const selectBtn = document.createElement("button");
      selectBtn.textContent = "Select All";
      selectBtn.style.cssText = btnStyle("#555");
      selectBtn.onclick = () => {
        for (const group of s.groups) {
          for (const nodeId of group) {
            onSelectNode(nodeId);
          }
        }
      };
      actions.appendChild(selectBtn);

      // Create component button (if callback provided)
      if (onCreateComponent) {
        const createBtn = document.createElement("button");
        createBtn.textContent = "Extract Component";
        createBtn.style.cssText = btnStyle("#7c3aed");
        createBtn.onclick = () => {
          const allIds = s.groups.flat();
          onCreateComponent(allIds, s.suggested_name);
          closeSmartSuggestions();
        };
        actions.appendChild(createBtn);
      }

      card.appendChild(actions);
      body.appendChild(card);
    }
  }

  panelEl.appendChild(body);

  // Footer
  const footer = document.createElement("div");
  footer.style.cssText = `padding:10px 16px;border-top:1px solid #3a3a3a;text-align:center;flex-shrink:0;`;
  footer.innerHTML = `<span style="font-size:11px;color:#666;">Patterns detected by structural + visual analysis</span>`;
  panelEl.appendChild(footer);

  document.body.appendChild(panelEl);

  // Escape to close
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      closeSmartSuggestions();
      document.removeEventListener("keydown", onKey);
    }
  };
  document.addEventListener("keydown", onKey);
}

function btnStyle(bg: string): string {
  return `background:${bg};border:none;color:#e0e0e0;padding:4px 12px;border-radius:4px;font-size:12px;cursor:pointer;`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
