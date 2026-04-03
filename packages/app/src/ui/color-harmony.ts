import type { Editor } from "../editor";

// -------- Color conversion helpers --------

function hexToRgb(hex: string): [number, number, number] {
  hex = hex.replace("#", "");
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r,g,b].map(v => Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,"0")).join("");
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s * 100, l * 100];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) { r1 = c; g1 = x; }
  else if (h < 120) { r1 = x; g1 = c; }
  else if (h < 180) { g1 = c; b1 = x; }
  else if (h < 240) { g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  return [Math.round((r1+m)*255), Math.round((g1+m)*255), Math.round((b1+m)*255)];
}

// -------- Harmony algorithms --------

export type HarmonyType = "complementary" | "analogous" | "triadic" | "split-complementary" | "tetradic" | "monochromatic";

export interface HarmonyColor {
  hex: string;
  label: string;
}

function generateHarmony(baseHex: string, type: HarmonyType): HarmonyColor[] {
  const [r, g, b] = hexToRgb(baseHex);
  const [h, s, l] = rgbToHsl(r, g, b);

  const make = (hue: number, sat: number, lit: number, label: string): HarmonyColor => {
    const [cr, cg, cb] = hslToRgb(hue, sat, lit);
    return { hex: rgbToHex(cr, cg, cb), label };
  };

  const base: HarmonyColor = { hex: rgbToHex(r, g, b), label: "Base" };

  switch (type) {
    case "complementary":
      return [base, make(h + 180, s, l, "Complement")];
    case "analogous":
      return [make(h - 30, s, l, "−30°"), base, make(h + 30, s, l, "+30°")];
    case "triadic":
      return [base, make(h + 120, s, l, "+120°"), make(h + 240, s, l, "+240°")];
    case "split-complementary":
      return [base, make(h + 150, s, l, "+150°"), make(h + 210, s, l, "+210°")];
    case "tetradic":
      return [base, make(h + 90, s, l, "+90°"), make(h + 180, s, l, "+180°"), make(h + 270, s, l, "+270°")];
    case "monochromatic":
      return [
        make(h, s, Math.max(l - 30, 5), "Dark"),
        make(h, s, Math.max(l - 15, 10), "Darker"),
        base,
        make(h, s, Math.min(l + 15, 90), "Lighter"),
        make(h, s, Math.min(l + 30, 95), "Light"),
      ];
    default:
      return [base];
  }
}

// -------- UI --------

const HARMONY_TYPES: { value: HarmonyType; label: string }[] = [
  { value: "complementary", label: "Complementary" },
  { value: "analogous", label: "Analogous" },
  { value: "triadic", label: "Triadic" },
  { value: "split-complementary", label: "Split-Complementary" },
  { value: "tetradic", label: "Tetradic (Square)" },
  { value: "monochromatic", label: "Monochromatic" },
];

let panel: HTMLElement | null = null;

export function hideColorHarmonyPanel() {
  if (panel) { panel.remove(); panel = null; }
}

export function toggleColorHarmonyPanel(editor: Editor) {
  if (panel) { hideColorHarmonyPanel(); return; }
  showColorHarmonyPanel(editor);
}

export function showColorHarmonyPanel(editor: Editor) {
  hideColorHarmonyPanel();

  let baseColor = "#3b82f6";
  let harmonyType: HarmonyType = "complementary";

  // Try to get the fill color of the selected node
  const sel = editor.getSelection();
  if (sel.length > 0) {
    try {
      const info = editor.engine.get_fill_info(BigInt(sel[0]));
      if (info) {
        const parsed = JSON.parse(info);
        if (parsed && parsed.color) {
          const c = parsed.color;
          baseColor = rgbToHex(c.r, c.g, c.b);
        }
      }
    } catch { /* ignore */ }
  }

  const el = document.createElement("div");
  el.id = "color-harmony-panel";
  el.style.cssText = `
    position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
    z-index:10001; background:#2c2c2c; border:1px solid #444;
    border-radius:12px; padding:20px; min-width:360px;
    box-shadow:0 16px 48px rgba(0,0,0,0.6);
    font-family:Inter,system-ui,sans-serif; color:#e0e0e0; font-size:13px;
  `;

  // Title
  const title = document.createElement("div");
  title.style.cssText = "display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;";
  const titleText = document.createElement("span");
  titleText.textContent = "Color Harmony";
  titleText.style.cssText = "font-size:15px; font-weight:600;";
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = "background:none; border:none; color:#888; cursor:pointer; font-size:16px; padding:2px 6px;";
  closeBtn.addEventListener("click", hideColorHarmonyPanel);
  title.appendChild(titleText);
  title.appendChild(closeBtn);
  el.appendChild(title);

  // Base color input row
  const baseRow = document.createElement("div");
  baseRow.style.cssText = "display:flex; align-items:center; gap:8px; margin-bottom:12px;";
  const colorPreview = document.createElement("div");
  colorPreview.style.cssText = `width:32px; height:32px; border-radius:8px; border:2px solid #555; background:${baseColor}; cursor:pointer;`;
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = baseColor;
  colorInput.style.cssText = "position:absolute; opacity:0; width:0; height:0;";
  colorPreview.addEventListener("click", () => colorInput.click());
  colorInput.addEventListener("input", () => {
    baseColor = colorInput.value;
    colorPreview.style.background = baseColor;
    hexInput.value = baseColor;
    update();
  });
  const hexInput = document.createElement("input");
  hexInput.type = "text";
  hexInput.value = baseColor;
  hexInput.style.cssText = `
    flex:1; padding:6px 8px; background:#1a1a1a; border:1px solid #444;
    border-radius:6px; color:#eee; font-size:13px; font-family:monospace; outline:none;
  `;
  hexInput.addEventListener("input", () => {
    const v = hexInput.value.trim();
    if (/^#?[0-9a-fA-F]{6}$/.test(v)) {
      baseColor = v.startsWith("#") ? v : "#" + v;
      colorPreview.style.background = baseColor;
      colorInput.value = baseColor;
      update();
    }
  });
  const pickFromSelBtn = document.createElement("button");
  pickFromSelBtn.textContent = "From Selection";
  pickFromSelBtn.style.cssText = `
    padding:6px 10px; border:1px solid #555; border-radius:6px;
    background:#333; color:#ccc; cursor:pointer; font-size:11px; font-family:inherit; white-space:nowrap;
  `;
  pickFromSelBtn.addEventListener("click", () => {
    const s = editor.getSelection();
    if (s.length > 0) {
      try {
        const info = editor.engine.get_fill_info(BigInt(s[0]));
        if (info) {
          const parsed = JSON.parse(info);
          if (parsed?.color) {
            baseColor = rgbToHex(parsed.color.r, parsed.color.g, parsed.color.b);
            colorPreview.style.background = baseColor;
            colorInput.value = baseColor;
            hexInput.value = baseColor;
            update();
          }
        }
      } catch { /* ignore */ }
    }
  });
  baseRow.appendChild(colorPreview);
  baseRow.appendChild(colorInput);
  baseRow.appendChild(hexInput);
  baseRow.appendChild(pickFromSelBtn);
  el.appendChild(baseRow);

  // Harmony type select
  const typeRow = document.createElement("div");
  typeRow.style.cssText = "margin-bottom:14px;";
  const typeSelect = document.createElement("select");
  typeSelect.style.cssText = `
    width:100%; padding:6px 8px; background:#1a1a1a; border:1px solid #444;
    border-radius:6px; color:#eee; font-size:13px; font-family:inherit; outline:none;
  `;
  for (const ht of HARMONY_TYPES) {
    const opt = document.createElement("option");
    opt.value = ht.value;
    opt.textContent = ht.label;
    if (ht.value === harmonyType) opt.selected = true;
    typeSelect.appendChild(opt);
  }
  typeSelect.addEventListener("change", () => {
    harmonyType = typeSelect.value as HarmonyType;
    update();
  });
  typeRow.appendChild(typeSelect);
  el.appendChild(typeRow);

  // Color wheel visualization
  const wheelCanvas = document.createElement("canvas");
  wheelCanvas.width = 200;
  wheelCanvas.height = 200;
  wheelCanvas.style.cssText = "display:block; margin:0 auto 14px;";
  el.appendChild(wheelCanvas);

  // Results container
  const results = document.createElement("div");
  results.style.cssText = "display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;";
  el.appendChild(results);

  // Apply button
  const applyRow = document.createElement("div");
  applyRow.style.cssText = "display:flex; gap:8px; justify-content:flex-end;";
  const applyAllBtn = document.createElement("button");
  applyAllBtn.textContent = "Apply to Selection";
  applyAllBtn.style.cssText = `
    padding:7px 16px; border:none; border-radius:6px;
    background:#3b82f6; color:#fff; cursor:pointer; font-size:13px; font-weight:500; font-family:inherit;
  `;
  applyAllBtn.title = "Apply harmony colors to selected nodes (one color per node)";
  applyAllBtn.addEventListener("click", () => {
    const sel = editor.getSelection();
    const colors = generateHarmony(baseColor, harmonyType);
    for (let i = 0; i < Math.min(sel.length, colors.length); i++) {
      const [cr, cg, cb] = hexToRgb(colors[i].hex);
      try {
        editor.engine.set_fill_color(BigInt(sel[i]), cr, cg, cb, 1.0);
      } catch { /* ignore */ }
    }
    editor.requestRender();
  });
  applyRow.appendChild(applyAllBtn);
  el.appendChild(applyRow);

  function drawWheel(colors: HarmonyColor[]) {
    const ctx = wheelCanvas.getContext("2d")!;
    const cx = 100, cy = 100, radius = 85;
    ctx.clearRect(0, 0, 200, 200);

    // Draw hue wheel
    for (let angle = 0; angle < 360; angle++) {
      const startRad = (angle - 1) * Math.PI / 180;
      const endRad = (angle + 1) * Math.PI / 180;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startRad, endRad);
      ctx.arc(cx, cy, radius - 18, endRad, startRad, true);
      ctx.closePath();
      const [wr, wg, wb] = hslToRgb(angle, 80, 55);
      ctx.fillStyle = `rgb(${wr},${wg},${wb})`;
      ctx.fill();
    }

    // Draw markers for harmony colors
    for (const color of colors) {
      const [cr, cg, cb] = hexToRgb(color.hex);
      const [ch] = rgbToHsl(cr, cg, cb);
      const rad = (ch - 90) * Math.PI / 180;
      const mx = cx + (radius - 9) * Math.cos(rad);
      const my = cy + (radius - 9) * Math.sin(rad);

      ctx.beginPath();
      ctx.arc(mx, my, 7, 0, Math.PI * 2);
      ctx.fillStyle = color.hex;
      ctx.fill();
      ctx.strokeStyle = color.label === "Base" ? "#fff" : "#aaa";
      ctx.lineWidth = color.label === "Base" ? 3 : 2;
      ctx.stroke();
    }
  }

  function update() {
    const colors = generateHarmony(baseColor, harmonyType);
    drawWheel(colors);

    results.innerHTML = "";
    for (const color of colors) {
      const swatch = document.createElement("div");
      swatch.style.cssText = `
        display:flex; flex-direction:column; align-items:center; gap:4px; cursor:pointer;
        padding:8px; border-radius:8px; background:#1a1a1a; border:1px solid #333;
        min-width:60px;
      `;
      swatch.title = `Click to copy ${color.hex}`;
      const colorBox = document.createElement("div");
      colorBox.style.cssText = `width:40px; height:40px; border-radius:6px; border:1px solid #555; background:${color.hex};`;
      const hexLabel = document.createElement("div");
      hexLabel.textContent = color.hex;
      hexLabel.style.cssText = "font-size:10px; font-family:monospace; color:#aaa;";
      const nameLabel = document.createElement("div");
      nameLabel.textContent = color.label;
      nameLabel.style.cssText = "font-size:10px; color:#888;";
      swatch.appendChild(colorBox);
      swatch.appendChild(hexLabel);
      swatch.appendChild(nameLabel);
      swatch.addEventListener("click", () => {
        navigator.clipboard.writeText(color.hex).then(() => {
          hexLabel.textContent = "Copied!";
          setTimeout(() => { hexLabel.textContent = color.hex; }, 1000);
        });
      });
      results.appendChild(swatch);
    }
  }

  update();

  // Backdrop
  const backdrop = document.createElement("div");
  backdrop.style.cssText = "position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,0.3);";
  backdrop.addEventListener("click", hideColorHarmonyPanel);

  document.body.appendChild(backdrop);
  document.body.appendChild(el);
  panel = el;

  // Store backdrop ref for cleanup
  (el as any)._backdrop = backdrop;
  const origHide = hideColorHarmonyPanel;
  // Patch hide to also remove backdrop
  const patchedHide = () => {
    const bd = panel ? (panel as any)._backdrop : backdrop;
    if (bd) bd.remove();
    if (panel) { panel.remove(); panel = null; }
  };
  closeBtn.removeEventListener("click", hideColorHarmonyPanel);
  closeBtn.addEventListener("click", patchedHide);
  backdrop.removeEventListener("click", hideColorHarmonyPanel);
  backdrop.addEventListener("click", patchedHide);
  // Re-assign module-level hide
  _patchedHide = patchedHide;
}

let _patchedHide: (() => void) | null = null;

// Override exported hide
export function safeHideColorHarmony() {
  if (_patchedHide) { _patchedHide(); _patchedHide = null; }
  else hideColorHarmonyPanel();
}
