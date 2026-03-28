/**
 * Canvas Annotation Stamps — predefined review stamps (Approved, Rejected, WIP, etc.)
 * Stamps are placed on the canvas as lightweight overlays for design review workflows.
 */

import type { Engine } from "../wasm/opensketch_engine";

export interface StampData {
  id: number;
  kind: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  author: string;
  timestamp: number;
  page_id: number;
  note: string;
  node_id: number | null;
}

const STAMP_KINDS = [
  { kind: "approved", label: "APPROVED", color: "#22c55e", icon: "✓" },
  { kind: "rejected", label: "REJECTED", color: "#ef4444", icon: "✕" },
  { kind: "wip", label: "WIP", color: "#f59e0b", icon: "◐" },
  { kind: "todo", label: "TODO", color: "#3b82f6", icon: "☐" },
  { kind: "needs_revision", label: "NEEDS REVISION", color: "#f97316", icon: "↻" },
  { kind: "final", label: "FINAL", color: "#8b5cf6", icon: "★" },
  { kind: "on_hold", label: "ON HOLD", color: "#6b7280", icon: "⏸" },
  { kind: "question", label: "QUESTION", color: "#06b6d4", icon: "?" },
] as const;

let activeStampKind: string | null = null;
let stampPaletteEl: HTMLDivElement | null = null;

export function isStampModeActive(): boolean {
  return activeStampKind !== null;
}

export function getActiveStampKind(): string | null {
  return activeStampKind;
}

export function setActiveStampKind(kind: string | null): void {
  activeStampKind = kind;
}

export function closeStampPalette(): void {
  if (stampPaletteEl) {
    stampPaletteEl.remove();
    stampPaletteEl = null;
  }
}

export function toggleStampPalette(
  anchorX: number,
  anchorY: number,
  onSelect: (kind: string) => void,
): void {
  if (stampPaletteEl) {
    closeStampPalette();
    return;
  }

  stampPaletteEl = document.createElement("div");
  stampPaletteEl.style.cssText = `
    position: fixed; left: ${anchorX}px; top: ${anchorY}px;
    background: #1e1e2e; border: 1px solid #2a2a3a; border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5); z-index: 9998;
    padding: 8px; display: grid; grid-template-columns: 1fr 1fr;
    gap: 4px; min-width: 240px;
    font-family: Inter, -apple-system, system-ui, sans-serif;
  `;

  const title = document.createElement("div");
  title.style.cssText = `
    grid-column: 1/-1; padding: 6px 8px 8px; font-size: 11px;
    font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.5px;
  `;
  title.textContent = "Place Stamp";
  stampPaletteEl.appendChild(title);

  for (const s of STAMP_KINDS) {
    const btn = document.createElement("button");
    btn.style.cssText = `
      display: flex; align-items: center; gap: 6px; padding: 8px 10px;
      background: ${s.color}15; border: 1px solid ${s.color}33; border-radius: 8px;
      color: ${s.color}; cursor: pointer; font-size: 12px; font-weight: 600;
      transition: background 0.15s, transform 0.1s;
    `;
    btn.innerHTML = `<span style="font-size:14px;">${s.icon}</span>${s.label}`;
    btn.addEventListener("mouseenter", () => { btn.style.background = `${s.color}25`; });
    btn.addEventListener("mouseleave", () => { btn.style.background = `${s.color}15`; });
    btn.addEventListener("click", () => {
      closeStampPalette();
      onSelect(s.kind);
    });
    stampPaletteEl.appendChild(btn);
  }

  document.body.appendChild(stampPaletteEl);

  // Viewport clamping
  requestAnimationFrame(() => {
    if (!stampPaletteEl) return;
    const rect = stampPaletteEl.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) {
      stampPaletteEl.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    if (rect.bottom > window.innerHeight - 8) {
      stampPaletteEl.style.top = `${window.innerHeight - rect.height - 8}px`;
    }
  });

  // Close on outside click
  const handler = (e: MouseEvent) => {
    if (stampPaletteEl && !stampPaletteEl.contains(e.target as Node)) {
      closeStampPalette();
      activeStampKind = null;
      window.removeEventListener("mousedown", handler);
    }
  };
  setTimeout(() => window.addEventListener("mousedown", handler), 0);
}

/**
 * Render stamps on the canvas overlay
 */
export function renderStamps(
  ctx: CanvasRenderingContext2D,
  engine: Engine,
  pageId: number,
  zoom: number,
  panX: number,
  panY: number,
): void {
  let stamps: StampData[];
  try {
    stamps = JSON.parse(engine.get_stamps(BigInt(pageId)));
  } catch {
    return;
  }
  if (stamps.length === 0) return;

  for (const stamp of stamps) {
    const kindStr = typeof stamp.kind === "string" ? stamp.kind.toLowerCase() : String(stamp.kind).toLowerCase();
    const info = STAMP_KINDS.find(k => k.kind === kindStr) ??
      STAMP_KINDS.find(k => k.kind === "todo")!;

    const sx = stamp.x * zoom + panX;
    const sy = stamp.y * zoom + panY;
    const scale = stamp.scale * Math.max(0.6, Math.min(1.2, 1 / zoom));

    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(scale, scale);
    if (stamp.rotation) ctx.rotate(stamp.rotation * Math.PI / 180);

    // Badge background
    const label = info.label;
    ctx.font = "bold 12px Inter, system-ui, sans-serif";
    const textW = ctx.measureText(label).width;
    const padH = 10, padV = 6;
    const w = textW + padH * 2 + 20; // 20 for icon
    const h = 24;
    const r = 6;

    // Shadow
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;

    // Rounded rect
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, r);
    ctx.fillStyle = info.color;
    ctx.fill();

    ctx.shadowColor = "transparent";

    // Border
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Icon + text
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 12px Inter, system-ui, sans-serif";
    ctx.fillText(`${info.icon} ${label}`, 0, 0.5);

    // Note indicator
    if (stamp.note) {
      ctx.beginPath();
      ctx.arc(w / 2 - 4, -h / 2 + 4, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
    }

    ctx.restore();
  }
}

/**
 * Hit-test stamps — returns stamp id if click hits a stamp, null otherwise
 */
export function hitTestStamp(
  engine: Engine,
  pageId: number,
  canvasX: number,
  canvasY: number,
  zoom: number,
  panX: number,
  panY: number,
): number | null {
  let stamps: StampData[];
  try {
    stamps = JSON.parse(engine.get_stamps(BigInt(pageId)));
  } catch {
    return null;
  }

  // Check in reverse order (top stamp first)
  for (let i = stamps.length - 1; i >= 0; i--) {
    const stamp = stamps[i];
    const sx = stamp.x * zoom + panX;
    const sy = stamp.y * zoom + panY;
    const scale = stamp.scale * Math.max(0.6, Math.min(1.2, 1 / zoom));
    const halfW = 70 * scale;
    const halfH = 14 * scale;

    if (
      canvasX >= sx - halfW && canvasX <= sx + halfW &&
      canvasY >= sy - halfH && canvasY <= sy + halfH
    ) {
      return stamp.id;
    }
  }
  return null;
}
