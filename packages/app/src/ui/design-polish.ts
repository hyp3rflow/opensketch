/**
 * Design Polish — AI-powered one-click design cleanup
 * Analyzes the scene for inconsistencies and auto-fixes spacing, alignment, colors, radii.
 */

import type { Engine } from "../wasm/opensketch_engine";

interface PolishFix {
  id: number;
  node_id: number;
  node_name: string;
  category: string;
  description: string;
  detail: string;
  before: string;
  after: string;
}

let panelEl: HTMLDivElement | null = null;

const CATEGORY_ICONS: Record<string, string> = {
  Spacing: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 6H3M21 18H3M12 2v20"/></svg>`,
  Alignment: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22V2M20 22V2M8 6h8M8 18h8"/></svg>`,
  Color: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a7 7 0 0 0 0 20z"/></svg>`,
  CornerRadius: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12V5a2 2 0 0 1 2-2h7"/><path d="M12 3h7a2 2 0 0 1 2 2v7"/></svg>`,
  Size: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h18"/></svg>`,
};

const CATEGORY_COLORS: Record<string, string> = {
  Spacing: "#a78bfa",
  Alignment: "#60a5fa",
  Color: "#f472b6",
  CornerRadius: "#34d399",
  Size: "#fbbf24",
};

export function isDesignPolishOpen(): boolean {
  return panelEl !== null;
}

export function closeDesignPolish(): void {
  if (panelEl) {
    panelEl.remove();
    panelEl = null;
  }
}

export function openDesignPolish(
  engine: Engine,
  onApplied: () => void,
  onSelectNode?: (nodeId: number) => void,
): void {
  if (panelEl) { closeDesignPolish(); return; }

  const json = engine.analyze_polish();
  let fixes: PolishFix[];
  try {
    fixes = JSON.parse(json);
  } catch {
    fixes = [];
  }

  const selected = new Set<number>(fixes.map(f => f.id));

  panelEl = document.createElement("div");
  panelEl.className = "design-polish-panel";
  panelEl.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 560px; max-height: 640px; background: #1e1e2e; border-radius: 14px;
    box-shadow: 0 12px 48px rgba(0,0,0,0.6); z-index: 9999; display: flex;
    flex-direction: column; color: #e0e0e0; font-family: Inter, -apple-system, system-ui, sans-serif;
    font-size: 13px; overflow: hidden; border: 1px solid #2a2a3a;
  `;

  // Header
  const header = document.createElement("div");
  header.style.cssText = `
    padding: 18px 22px; border-bottom: 1px solid #2a2a3a; display: flex;
    align-items: center; justify-content: space-between; flex-shrink: 0;
  `;
  header.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;">
      <span style="font-size:22px;">✨</span>
      <div>
        <div style="font-weight:700;font-size:15px;color:#f0f0ff;">Polish Design</div>
        <div style="font-size:11px;color:#666;margin-top:2px;">${fixes.length} improvement${fixes.length !== 1 ? "s" : ""} found</div>
      </div>
    </div>
  `;
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = `background:none;border:none;color:#666;cursor:pointer;font-size:16px;padding:6px 10px;border-radius:6px;transition:all 0.15s;`;
  closeBtn.onmouseenter = () => { closeBtn.style.color = "#fff"; closeBtn.style.background = "#333"; };
  closeBtn.onmouseleave = () => { closeBtn.style.color = "#666"; closeBtn.style.background = "none"; };
  closeBtn.onclick = closeDesignPolish;
  header.appendChild(closeBtn);
  panelEl.appendChild(header);

  // Body
  const body = document.createElement("div");
  body.style.cssText = `overflow-y:auto;flex:1;padding:12px 16px;`;

  if (fixes.length === 0) {
    body.innerHTML = `
      <div style="text-align:center;padding:48px 20px;color:#888;">
        <span style="font-size:48px;display:block;margin-bottom:16px;">🎉</span>
        <div style="font-size:15px;font-weight:600;color:#aaa;margin-bottom:6px;">Looking great!</div>
        <div style="font-size:12px;">No polish improvements found. Your design is clean.</div>
      </div>
    `;
  } else {
    // Group by category
    const groups: Record<string, PolishFix[]> = {};
    for (const f of fixes) {
      (groups[f.category] ??= []).push(f);
    }

    for (const [cat, catFixes] of Object.entries(groups)) {
      const group = document.createElement("div");
      group.style.cssText = `margin-bottom:16px;`;

      const catHeader = document.createElement("div");
      catHeader.style.cssText = `display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:0 4px;`;
      const color = CATEGORY_COLORS[cat] || "#888";
      catHeader.innerHTML = `
        <span style="color:${color};">${CATEGORY_ICONS[cat] || ""}</span>
        <span style="font-size:12px;font-weight:600;color:${color};text-transform:uppercase;letter-spacing:0.5px;">${cat}</span>
        <span style="font-size:11px;color:#555;">(${catFixes.length})</span>
      `;
      group.appendChild(catHeader);

      for (const fix of catFixes) {
        const card = document.createElement("div");
        card.style.cssText = `
          background:#252535;border-radius:10px;padding:10px 14px;margin-bottom:6px;
          border:1px solid #2a2a3a;display:flex;align-items:flex-start;gap:10px;
          transition:border-color 0.15s;cursor:default;
        `;
        card.onmouseenter = () => card.style.borderColor = color;
        card.onmouseleave = () => card.style.borderColor = "#2a2a3a";

        // Checkbox
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = selected.has(fix.id);
        cb.style.cssText = `margin-top:3px;accent-color:${color};cursor:pointer;`;
        cb.onchange = () => {
          if (cb.checked) selected.add(fix.id);
          else selected.delete(fix.id);
          updateCounter();
        };
        card.appendChild(cb);

        // Content
        const content = document.createElement("div");
        content.style.cssText = `flex:1;min-width:0;`;
        content.innerHTML = `
          <div style="font-size:13px;font-weight:500;color:#e0e0ff;margin-bottom:3px;">${esc(fix.description)}</div>
          <div style="font-size:11px;color:#777;margin-bottom:4px;">${esc(fix.detail)}</div>
          <div style="display:flex;gap:6px;align-items:center;font-size:11px;">
            <span style="color:#ef4444;background:#ef444415;padding:1px 6px;border-radius:4px;text-decoration:line-through;">${esc(fix.before)}</span>
            <span style="color:#555;">→</span>
            <span style="color:#10b981;background:#10b98115;padding:1px 6px;border-radius:4px;">${esc(fix.after)}</span>
          </div>
        `;
        card.appendChild(content);

        // Node link
        if (onSelectNode) {
          const link = document.createElement("button");
          link.textContent = "⌖";
          link.title = `Select "${fix.node_name}"`;
          link.style.cssText = `background:none;border:none;color:#555;cursor:pointer;font-size:14px;padding:2px 4px;border-radius:4px;flex-shrink:0;`;
          link.onmouseenter = () => link.style.color = "#fff";
          link.onmouseleave = () => link.style.color = "#555";
          link.onclick = () => onSelectNode(fix.node_id);
          card.appendChild(link);
        }

        group.appendChild(card);
      }

      body.appendChild(group);
    }
  }

  panelEl.appendChild(body);

  // Footer
  const footer = document.createElement("div");
  footer.style.cssText = `padding:14px 18px;border-top:1px solid #2a2a3a;display:flex;align-items:center;gap:10px;flex-shrink:0;`;

  const counter = document.createElement("span");
  counter.style.cssText = `font-size:12px;color:#888;flex:1;`;
  const updateCounter = () => {
    counter.textContent = `${selected.size} of ${fixes.length} selected`;
  };
  updateCounter();
  footer.appendChild(counter);

  if (fixes.length > 0) {
    // Select all / none
    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = "Select All";
    toggleBtn.style.cssText = `background:#2a2a3a;border:1px solid #3a3a4a;color:#aaa;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:12px;transition:all 0.15s;`;
    toggleBtn.onclick = () => {
      const allSelected = selected.size === fixes.length;
      fixes.forEach(f => allSelected ? selected.delete(f.id) : selected.add(f.id));
      body.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach(cb => cb.checked = !allSelected);
      toggleBtn.textContent = allSelected ? "Select All" : "Deselect All";
      updateCounter();
    };
    footer.appendChild(toggleBtn);

    // Apply button
    const applyBtn = document.createElement("button");
    applyBtn.textContent = "✨ Apply Polish";
    applyBtn.style.cssText = `background:#4f46e5;border:none;color:white;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;transition:background 0.15s;`;
    applyBtn.onmouseenter = () => applyBtn.style.background = "#4338ca";
    applyBtn.onmouseleave = () => applyBtn.style.background = "#4f46e5";
    applyBtn.onclick = () => {
      if (selected.size === 0) return;
      const ids = JSON.stringify(Array.from(selected));
      const count = engine.apply_polish(ids);
      closeDesignPolish();
      onApplied();
      // Show brief toast
      showToast(`✨ Applied ${count} polish fix${count !== 1 ? "es" : ""}`);
    };
    footer.appendChild(applyBtn);
  }

  panelEl.appendChild(footer);
  document.body.appendChild(panelEl);

  // Escape to close
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      closeDesignPolish();
      document.removeEventListener("keydown", onKey);
    }
  };
  document.addEventListener("keydown", onKey);
}

function showToast(msg: string) {
  const toast = document.createElement("div");
  toast.style.cssText = `
    position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
    background:#1e1e2e;border:1px solid #3a3a5a;border-radius:10px;
    padding:10px 20px;color:#e0e0ff;font-size:13px;font-weight:500;
    box-shadow:0 8px 32px rgba(0,0,0,0.5);z-index:10001;
    animation:slideUp 0.2s ease-out;font-family:Inter,system-ui,sans-serif;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = "0"; toast.style.transition = "opacity 0.3s"; }, 2000);
  setTimeout(() => toast.remove(), 2500);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
