/**
 * Pixel Preview Mode
 * 
 * 1:1 pixel rendering with anti-aliasing disabled, pixel grid at high zoom,
 * and device resolution simulation (iPhone, Android, etc.)
 */
import { Editor } from "../editor";

export interface DevicePreset {
  name: string;
  width: number;
  height: number;
  dpr: number;
  category: "phone" | "tablet" | "desktop";
}

export const DEVICE_PRESETS: DevicePreset[] = [
  { name: "iPhone 15 Pro", width: 393, height: 852, dpr: 3, category: "phone" },
  { name: "iPhone 15", width: 390, height: 844, dpr: 3, category: "phone" },
  { name: "iPhone SE", width: 375, height: 667, dpr: 2, category: "phone" },
  { name: "Pixel 8", width: 412, height: 932, dpr: 2.625, category: "phone" },
  { name: "Samsung S24", width: 360, height: 780, dpr: 3, category: "phone" },
  { name: "iPad Pro 12.9\"", width: 1024, height: 1366, dpr: 2, category: "tablet" },
  { name: "iPad Air", width: 820, height: 1180, dpr: 2, category: "tablet" },
  { name: "MacBook Pro 14\"", width: 1512, height: 982, dpr: 2, category: "desktop" },
  { name: "1080p", width: 1920, height: 1080, dpr: 1, category: "desktop" },
  { name: "4K", width: 3840, height: 2160, dpr: 1, category: "desktop" },
];

export interface PixelPreviewState {
  enabled: boolean;
  device: DevicePreset | null;
  showPixelGrid: boolean;
}

/**
 * Render pixel grid overlay when zoom >= 8x
 */
export function renderPixelGrid(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  zoom: number,
  panX: number,
  panY: number
) {
  if (zoom < 8) return;
  
  ctx.save();
  
  // Calculate visible scene bounds
  const left = -panX / zoom;
  const top = -panY / zoom;
  const right = (canvasWidth - panX) / zoom;
  const bottom = (canvasHeight - panY) / zoom;
  
  // Pixel grid lines (each CSS pixel = 1 unit)
  const startX = Math.floor(left);
  const endX = Math.ceil(right);
  const startY = Math.floor(top);
  const endY = Math.ceil(bottom);
  
  // Limit lines to avoid performance issues
  const maxLines = 500;
  const xLines = endX - startX;
  const yLines = endY - startY;
  if (xLines > maxLines || yLines > maxLines) {
    ctx.restore();
    return;
  }
  
  const alpha = Math.min(0.3, (zoom - 8) / 16 * 0.3);
  ctx.strokeStyle = `rgba(128, 128, 128, ${alpha})`;
  ctx.lineWidth = 1;
  
  ctx.beginPath();
  for (let x = startX; x <= endX; x++) {
    const sx = Math.round(x * zoom + panX) + 0.5;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, canvasHeight);
  }
  for (let y = startY; y <= endY; y++) {
    const sy = Math.round(y * zoom + panY) + 0.5;
    ctx.moveTo(0, sy);
    ctx.lineTo(canvasWidth, sy);
  }
  ctx.stroke();
  
  ctx.restore();
}

/**
 * Render device frame overlay
 */
export function renderDeviceFrame(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  zoom: number,
  panX: number,
  panY: number,
  device: DevicePreset
) {
  ctx.save();
  
  // Device viewport in scene coordinates (centered at origin)
  const dw = device.width;
  const dh = device.height;
  const x = -dw / 2;
  const y = -dh / 2;
  
  // Screen coordinates
  const sx = x * zoom + panX;
  const sy = y * zoom + panY;
  const sw = dw * zoom;
  const sh = dh * zoom;
  
  // Dim area outside device viewport
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  // Top
  ctx.fillRect(0, 0, canvasWidth, Math.max(0, sy));
  // Bottom
  ctx.fillRect(0, sy + sh, canvasWidth, canvasHeight - (sy + sh));
  // Left
  ctx.fillRect(0, sy, Math.max(0, sx), sh);
  // Right
  ctx.fillRect(sx + sw, sy, canvasWidth - (sx + sw), sh);
  
  // Device frame border
  ctx.strokeStyle = "rgba(59, 130, 246, 0.6)";
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.strokeRect(sx, sy, sw, sh);
  
  // Device label
  const label = `${device.name} — ${device.width}×${device.height} @${device.dpr}x`;
  ctx.font = "11px Inter, system-ui, sans-serif";
  ctx.fillStyle = "rgba(59, 130, 246, 0.9)";
  const textW = ctx.measureText(label).width;
  const labelX = sx + sw / 2 - textW / 2;
  const labelY = sy - 8;
  
  // Label background
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  const pad = 4;
  ctx.beginPath();
  const r = 4;
  const lx = labelX - pad;
  const ly = labelY - 12;
  const lw = textW + pad * 2;
  const lh = 16;
  ctx.moveTo(lx + r, ly);
  ctx.arcTo(lx + lw, ly, lx + lw, ly + lh, r);
  ctx.arcTo(lx + lw, ly + lh, lx, ly + lh, r);
  ctx.arcTo(lx, ly + lh, lx, ly, r);
  ctx.arcTo(lx, ly, lx + lw, ly, r);
  ctx.fill();
  
  ctx.fillStyle = "rgba(59, 130, 246, 0.9)";
  ctx.fillText(label, labelX, labelY);
  
  // DPR info at bottom
  if (device.dpr > 1) {
    const physLabel = `Physical: ${Math.round(device.width * device.dpr)}×${Math.round(device.height * device.dpr)}px`;
    const physW = ctx.measureText(physLabel).width;
    const physX = sx + sw / 2 - physW / 2;
    const physY = sy + sh + 16;
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    const plx = physX - pad;
    const ply = physY - 12;
    const plw = physW + pad * 2;
    ctx.beginPath();
    ctx.moveTo(plx + r, ply);
    ctx.arcTo(plx + plw, ply, plx + plw, ply + lh, r);
    ctx.arcTo(plx + plw, ply + lh, plx, ply + lh, r);
    ctx.arcTo(plx, ply + lh, plx, ply, r);
    ctx.arcTo(plx, ply, plx + plw, ply, r);
    ctx.fill();
    ctx.fillStyle = "rgba(148, 163, 184, 0.9)";
    ctx.fillText(physLabel, physX, physY);
  }
  
  ctx.restore();
}

/**
 * Setup pixel preview toggle UI in zoom controls bar
 */
export function setupPixelPreviewButton(container: HTMLElement, editor: Editor): HTMLElement {
  const btn = document.createElement("button");
  btn.className = "zoom-btn pixel-preview-btn";
  btn.title = "Pixel Preview (Alt+P)";
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1" y="1" width="4" height="4" fill="currentColor" opacity="0.6"/>
    <rect x="5" y="1" width="4" height="4" fill="currentColor" opacity="0.3"/>
    <rect x="9" y="1" width="4" height="4" fill="currentColor" opacity="0.6"/>
    <rect x="1" y="5" width="4" height="4" fill="currentColor" opacity="0.3"/>
    <rect x="5" y="5" width="4" height="4" fill="currentColor" opacity="0.6"/>
    <rect x="9" y="5" width="4" height="4" fill="currentColor" opacity="0.3"/>
    <rect x="1" y="9" width="4" height="4" fill="currentColor" opacity="0.6"/>
    <rect x="5" y="9" width="4" height="4" fill="currentColor" opacity="0.3"/>
    <rect x="9" y="9" width="4" height="4" fill="currentColor" opacity="0.6"/>
  </svg>`;
  
  btn.addEventListener("click", () => {
    editor.togglePixelPreview();
    btn.classList.toggle("active", editor.isPixelPreviewEnabled());
  });
  
  // Insert before the zoom-fit button (last button)
  const fitBtn = container.querySelector(".zoom-fit");
  if (fitBtn) {
    container.insertBefore(btn, fitBtn);
  } else {
    container.appendChild(btn);
  }
  
  return btn;
}

/**
 * Device picker dropdown
 */
export function showDevicePicker(
  anchorEl: HTMLElement,
  currentDevice: DevicePreset | null,
  onSelect: (device: DevicePreset | null) => void
) {
  // Remove existing
  document.querySelector(".pixel-device-picker")?.remove();
  
  const picker = document.createElement("div");
  picker.className = "pixel-device-picker";
  picker.style.cssText = `
    position: fixed; z-index: 9999;
    background: #1e1e1e; border: 1px solid #333; border-radius: 8px;
    padding: 4px; min-width: 200px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    font: 12px Inter, system-ui, sans-serif; color: #ccc;
  `;
  
  // Position above anchor
  const rect = anchorEl.getBoundingClientRect();
  picker.style.left = `${rect.left}px`;
  picker.style.bottom = `${window.innerHeight - rect.top + 4}px`;
  
  // "None" option
  const noneItem = document.createElement("div");
  noneItem.textContent = "No device frame";
  noneItem.style.cssText = `padding: 6px 10px; cursor: pointer; border-radius: 4px; ${!currentDevice ? 'color: #60a5fa;' : ''}`;
  noneItem.addEventListener("mouseenter", () => noneItem.style.background = "#2a2a2a");
  noneItem.addEventListener("mouseleave", () => noneItem.style.background = "");
  noneItem.addEventListener("click", () => { onSelect(null); picker.remove(); });
  picker.appendChild(noneItem);
  
  // Separator
  const sep = document.createElement("div");
  sep.style.cssText = "height: 1px; background: #333; margin: 4px 0;";
  picker.appendChild(sep);
  
  // Group by category
  const categories: Record<string, DevicePreset[]> = { phone: [], tablet: [], desktop: [] };
  for (const d of DEVICE_PRESETS) categories[d.category].push(d);
  
  for (const [cat, devices] of Object.entries(categories)) {
    if (devices.length === 0) continue;
    const header = document.createElement("div");
    header.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
    header.style.cssText = "padding: 4px 10px; color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;";
    picker.appendChild(header);
    
    for (const device of devices) {
      const item = document.createElement("div");
      const isActive = currentDevice?.name === device.name;
      item.textContent = `${device.name}  ${device.width}×${device.height}`;
      item.style.cssText = `padding: 6px 10px; cursor: pointer; border-radius: 4px; ${isActive ? 'color: #60a5fa;' : ''}`;
      item.addEventListener("mouseenter", () => item.style.background = "#2a2a2a");
      item.addEventListener("mouseleave", () => item.style.background = "");
      item.addEventListener("click", () => { onSelect(device); picker.remove(); });
      picker.appendChild(item);
    }
  }
  
  document.body.appendChild(picker);
  
  // Close on click outside
  const close = (e: MouseEvent) => {
    if (!picker.contains(e.target as Node) && e.target !== anchorEl) {
      picker.remove();
      document.removeEventListener("mousedown", close);
    }
  };
  setTimeout(() => document.addEventListener("mousedown", close), 0);
}
