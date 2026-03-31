/**
 * Color Blindness Simulation
 * Applies SVG feColorMatrix filters to simulate various color vision deficiencies.
 * Supports: Protanopia, Deuteranopia, Tritanopia, Achromatopsia
 */

// Color matrix values from scientific color blindness simulation
// Based on Machado et al. (2009) severity=1.0
const MATRICES: Record<string, number[]> = {
  protanopia: [
    0.152286, 1.052583, -0.204868, 0, 0,
    0.114503, 0.786281, 0.099216, 0, 0,
    -0.003882, -0.048116, 1.051998, 0, 0,
    0, 0, 0, 1, 0,
  ],
  deuteranopia: [
    0.367322, 0.860646, -0.227968, 0, 0,
    0.280085, 0.672501, 0.047413, 0, 0,
    -0.011820, 0.042940, 0.968881, 0, 0,
    0, 0, 0, 1, 0,
  ],
  tritanopia: [
    1.255528, -0.076749, -0.178779, 0, 0,
    -0.078411, 0.930809, 0.147602, 0, 0,
    0.004733, 0.691367, 0.303900, 0, 0,
    0, 0, 0, 1, 0,
  ],
  achromatopsia: [
    0.2126, 0.7152, 0.0722, 0, 0,
    0.2126, 0.7152, 0.0722, 0, 0,
    0.2126, 0.7152, 0.0722, 0, 0,
    0, 0, 0, 1, 0,
  ],
};

type SimulationType = keyof typeof MATRICES | "none";

let currentMode: SimulationType = "none";
let svgFilter: SVGSVGElement | null = null;
let panelEl: HTMLElement | null = null;
let onChangeCallback: (() => void) | null = null;

const LABELS: Record<string, string> = {
  none: "Normal Vision",
  protanopia: "Protanopia (no red)",
  deuteranopia: "Deuteranopia (no green)",
  tritanopia: "Tritanopia (no blue)",
  achromatopsia: "Achromatopsia (grayscale)",
};

// ─── SVG Filter ───

function ensureSVGFilter() {
  if (svgFilter) return;
  svgFilter = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svgFilter.setAttribute("width", "0");
  svgFilter.setAttribute("height", "0");
  svgFilter.style.position = "absolute";
  svgFilter.style.pointerEvents = "none";
  svgFilter.innerHTML = `
    <defs>
      <filter id="cb-sim-filter" color-interpolation-filters="linearRGB">
        <feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"/>
      </filter>
    </defs>
  `;
  document.body.appendChild(svgFilter);
}

function applyFilter(mode: SimulationType) {
  ensureSVGFilter();
  const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
  if (!canvas) return;

  if (mode === "none") {
    canvas.style.filter = "";
    return;
  }

  const matrix = MATRICES[mode];
  if (!matrix) return;

  const fe = svgFilter!.querySelector("feColorMatrix");
  if (fe) {
    fe.setAttribute("values", matrix.join(" "));
  }
  canvas.style.filter = "url(#cb-sim-filter)";
}

// ─── Public API ───

export function setColorBlindnessMode(mode: SimulationType) {
  currentMode = mode;
  applyFilter(mode);
  onChangeCallback?.();
  updatePanelUI();
}

export function getColorBlindnessMode(): SimulationType {
  return currentMode;
}

export function toggleColorBlindnessPanel(onChange?: () => void) {
  if (onChange) onChangeCallback = onChange;
  if (panelEl) {
    closeCBPanel();
    return;
  }
  buildPanel();
}

export function closeCBPanel() {
  panelEl?.remove();
  panelEl = null;
}

// ─── Panel UI ───

function buildPanel() {
  panelEl = document.createElement("div");
  panelEl.className = "cb-sim-panel";
  panelEl.style.cssText = `
    position: fixed;
    bottom: 60px;
    left: 50%;
    transform: translateX(-50%);
    background: #1e1e2e;
    border: 1px solid #383850;
    border-radius: 12px;
    padding: 12px 16px;
    z-index: 200;
    display: flex;
    gap: 6px;
    align-items: center;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    font-family: Inter, system-ui, sans-serif;
  `;

  // Eye icon
  const icon = document.createElement("span");
  icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#cdd6f4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>`;
  icon.style.cssText = "display:flex;align-items:center;margin-right:4px;";
  panelEl.appendChild(icon);

  const modes: SimulationType[] = ["none", "protanopia", "deuteranopia", "tritanopia", "achromatopsia"];
  for (const mode of modes) {
    const btn = document.createElement("button");
    btn.textContent = mode === "none" ? "Normal" : mode.charAt(0).toUpperCase() + mode.slice(1);
    btn.title = LABELS[mode];
    btn.dataset.mode = mode;
    btn.style.cssText = `
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid transparent;
      background: ${currentMode === mode ? "#585880" : "#2a2a3e"};
      color: #cdd6f4;
      font-size: 11px;
      cursor: pointer;
      transition: background 0.15s;
      white-space: nowrap;
    `;
    btn.addEventListener("click", () => setColorBlindnessMode(mode));
    btn.addEventListener("mouseenter", () => { if (currentMode !== mode) btn.style.background = "#3a3a55"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = currentMode === mode ? "#585880" : "#2a2a3e"; });
    panelEl.appendChild(btn);
  }

  // Close button
  const close = document.createElement("button");
  close.innerHTML = "✕";
  close.title = "Close";
  close.style.cssText = "margin-left:6px;background:none;border:none;color:#888;cursor:pointer;font-size:14px;padding:2px 4px;";
  close.addEventListener("click", () => {
    setColorBlindnessMode("none");
    closeCBPanel();
  });
  panelEl.appendChild(close);

  document.body.appendChild(panelEl);
}

function updatePanelUI() {
  if (!panelEl) return;
  const buttons = panelEl.querySelectorAll("button[data-mode]") as NodeListOf<HTMLButtonElement>;
  buttons.forEach(btn => {
    const isActive = btn.dataset.mode === currentMode;
    btn.style.background = isActive ? "#585880" : "#2a2a3e";
    btn.style.borderColor = isActive ? "#7070a0" : "transparent";
  });
}
