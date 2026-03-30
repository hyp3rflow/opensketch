/**
 * Nudge Hint Overlay
 * Shows inline coordinate + delta hints when arrow-key nudging nodes.
 * Auto-fades after 800ms of inactivity.
 */

let hintEl: HTMLDivElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function ensureHint(): HTMLDivElement {
  if (hintEl) return hintEl;
  hintEl = document.createElement('div');
  hintEl.className = 'nudge-hint-overlay';
  Object.assign(hintEl.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: '9999',
    background: 'rgba(24,24,27,0.88)',
    color: '#fff',
    fontSize: '11px',
    fontFamily: 'Inter, system-ui, sans-serif',
    padding: '4px 8px',
    borderRadius: '6px',
    lineHeight: '1.4',
    whiteSpace: 'nowrap',
    opacity: '0',
    transition: 'opacity 0.15s ease',
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
  });
  document.body.appendChild(hintEl);
  return hintEl;
}

export interface NudgeInfo {
  /** Final position of selection bounding box center (screen coords) */
  screenX: number;
  screenY: number;
  /** Node position in scene coords */
  nodeX: number;
  nodeY: number;
  /** Delta applied */
  dx: number;
  dy: number;
  /** Width/height of selection */
  nodeW: number;
  nodeH: number;
}

export function showNudgeHint(info: NudgeInfo) {
  const el = ensureHint();

  const x = Math.round(info.nodeX * 100) / 100;
  const y = Math.round(info.nodeY * 100) / 100;

  const dxLabel = info.dx !== 0 ? `Δx: ${info.dx > 0 ? '+' : ''}${info.dx}` : '';
  const dyLabel = info.dy !== 0 ? `Δy: ${info.dy > 0 ? '+' : ''}${info.dy}` : '';
  const delta = [dxLabel, dyLabel].filter(Boolean).join('  ');

  el.innerHTML = `<span style="color:#8bb4f0">${x}, ${y}</span>` +
    (delta ? `<span style="margin-left:8px;color:#a0a0a0">${delta}</span>` : '');

  // Position hint below-right of selection center
  el.style.left = `${info.screenX + 16}px`;
  el.style.top = `${info.screenY + 16}px`;
  el.style.opacity = '1';

  // Reset hide timer
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (el) el.style.opacity = '0';
  }, 800);
}

export function hideNudgeHint() {
  if (hintEl) {
    hintEl.style.opacity = '0';
  }
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}
