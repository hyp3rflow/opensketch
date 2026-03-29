/**
 * SVG-based cubic-bezier easing curve editor.
 * Renders a 120x120 preview with two draggable control-point handles
 * and preset buttons (Linear / EaseIn / EaseOut / EaseInOut / Custom).
 */

export interface EasingValue {
  /** "linear" | "ease_in" | "ease_out" | "ease_in_out" | "cubic_bezier:x1,y1,x2,y2" */
  str: string;
  x1: number; y1: number; x2: number; y2: number;
}

const PRESETS: Record<string, [number, number, number, number]> = {
  linear:      [0, 0, 1, 1],
  ease_in:     [0.42, 0, 1, 1],
  ease_out:    [0, 0, 0.58, 1],
  ease_in_out: [0.42, 0, 0.58, 1],
};

export function parseEasingStr(s: string): EasingValue {
  if (s.startsWith("cubic_bezier:")) {
    const nums = s.slice(13).split(",").map(n => parseFloat(n.trim()));
    if (nums.length === 4 && nums.every(n => !isNaN(n))) {
      return { str: s, x1: nums[0], y1: nums[1], x2: nums[2], y2: nums[3] };
    }
  }
  const p = PRESETS[s] || PRESETS["ease_in_out"];
  return { str: s in PRESETS ? s : "ease_in_out", x1: p[0], y1: p[1], x2: p[2], y2: p[3] };
}

export function easingToStr(x1: number, y1: number, x2: number, y2: number): string {
  for (const [name, [a, b, c, d]] of Object.entries(PRESETS)) {
    if (Math.abs(x1 - a) < 0.005 && Math.abs(y1 - b) < 0.005 &&
        Math.abs(x2 - c) < 0.005 && Math.abs(y2 - d) < 0.005) return name;
  }
  return `cubic_bezier:${x1.toFixed(2)},${y1.toFixed(2)},${x2.toFixed(2)},${y2.toFixed(2)}`;
}

/** Evaluate cubic-bezier easing at t ∈ [0,1] → [0,1] */
export function cubicBezierEval(x1: number, y1: number, x2: number, y2: number, x: number): number {
  let t = x;
  for (let i = 0; i < 8; i++) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const xAtT = ((ax * t + bx) * t + cx) * t;
    const dx = (3 * ax * t + 2 * bx) * t + cx;
    if (Math.abs(dx) < 1e-7) break;
    t -= (xAtT - x) / dx;
    t = Math.max(0, Math.min(1, t));
  }
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  return ((ay * t + by) * t + cy) * t;
}

/** Apply easing string to a raw linear t */
export function applyEasing(easingStr: string, rawT: number): number {
  const e = parseEasingStr(easingStr);
  return cubicBezierEval(e.x1, e.y1, e.x2, e.y2, rawT);
}

/**
 * Create an inline easing editor popup element.
 * @param currentEasing current easing string
 * @param onChange called with new easing string on change
 * @returns the DOM element to attach
 */
export function createEasingEditor(
  currentEasing: string,
  onChange: (easing: string) => void,
): HTMLDivElement {
  const SIZE = 120;
  const PAD = 8;
  const el = document.createElement("div");
  el.style.cssText = `background:#1a1a1a;border:1px solid #444;border-radius:8px;padding:${PAD}px;width:${SIZE + PAD * 2}px;z-index:9999;`;

  let { x1, y1, x2, y2 } = parseEasingStr(currentEasing);

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("width", String(SIZE));
  svg.setAttribute("height", String(SIZE));
  svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
  svg.style.cssText = "display:block;margin:0 auto 6px;cursor:crosshair;";

  // Background grid
  const grid = document.createElementNS(svgNS, "rect");
  grid.setAttribute("width", String(SIZE));
  grid.setAttribute("height", String(SIZE));
  grid.setAttribute("fill", "#222");
  grid.setAttribute("rx", "4");
  svg.appendChild(grid);

  // Diagonal reference line
  const diag = document.createElementNS(svgNS, "line");
  diag.setAttribute("x1", "0"); diag.setAttribute("y1", String(SIZE));
  diag.setAttribute("x2", String(SIZE)); diag.setAttribute("y2", "0");
  diag.setAttribute("stroke", "#333"); diag.setAttribute("stroke-width", "1");
  svg.appendChild(diag);

  // Curve path
  const curvePath = document.createElementNS(svgNS, "path");
  curvePath.setAttribute("fill", "none");
  curvePath.setAttribute("stroke", "#6ea8fe");
  curvePath.setAttribute("stroke-width", "2");
  svg.appendChild(curvePath);

  // Control lines
  const line1 = document.createElementNS(svgNS, "line");
  line1.setAttribute("stroke", "#888"); line1.setAttribute("stroke-width", "1");
  line1.setAttribute("stroke-dasharray", "3,2");
  svg.appendChild(line1);
  const line2 = document.createElementNS(svgNS, "line");
  line2.setAttribute("stroke", "#888"); line2.setAttribute("stroke-width", "1");
  line2.setAttribute("stroke-dasharray", "3,2");
  svg.appendChild(line2);

  // Handles
  function makeHandle(color: string) {
    const c = document.createElementNS(svgNS, "circle");
    c.setAttribute("r", "5");
    c.setAttribute("fill", color);
    c.setAttribute("stroke", "#fff");
    c.setAttribute("stroke-width", "1.5");
    c.style.cursor = "grab";
    return c;
  }
  const h1 = makeHandle("#ff6b6b");
  const h2 = makeHandle("#51cf66");
  svg.appendChild(h1);
  svg.appendChild(h2);

  function toSvg(x: number, y: number): [number, number] {
    return [x * SIZE, (1 - y) * SIZE];
  }

  function update() {
    const [sx1, sy1] = toSvg(x1, y1);
    const [sx2, sy2] = toSvg(x2, y2);
    curvePath.setAttribute("d",
      `M 0 ${SIZE} C ${sx1} ${sy1}, ${sx2} ${sy2}, ${SIZE} 0`);
    h1.setAttribute("cx", String(sx1)); h1.setAttribute("cy", String(sy1));
    h2.setAttribute("cx", String(sx2)); h2.setAttribute("cy", String(sy2));
    line1.setAttribute("x1", "0"); line1.setAttribute("y1", String(SIZE));
    line1.setAttribute("x2", String(sx1)); line1.setAttribute("y2", String(sy1));
    line2.setAttribute("x1", String(SIZE)); line2.setAttribute("y1", "0");
    line2.setAttribute("x2", String(sx2)); line2.setAttribute("y2", String(sy2));
  }
  update();

  // Drag logic
  function setupDrag(handle: SVGCircleElement, setXY: (x: number, y: number) => void) {
    let dragging = false;
    handle.addEventListener("pointerdown", (e) => {
      e.stopPropagation(); e.preventDefault();
      dragging = true;
      handle.style.cursor = "grabbing";
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const rect = svg.getBoundingClientRect();
      const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / SIZE));
      const ny = Math.max(-0.5, Math.min(1.5, 1 - (e.clientY - rect.top) / SIZE));
      setXY(nx, ny);
      update();
      onChange(easingToStr(x1, y1, x2, y2));
    });
    const stop = () => { dragging = false; handle.style.cursor = "grab"; };
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  }

  setupDrag(h1, (nx, ny) => { x1 = nx; y1 = ny; });
  setupDrag(h2, (nx, ny) => { x2 = nx; y2 = ny; });

  el.appendChild(svg);

  // Preset buttons
  const presetRow = document.createElement("div");
  presetRow.style.cssText = "display:flex;flex-wrap:wrap;gap:3px;justify-content:center;";
  const presetLabels: [string, string][] = [
    ["linear", "Lin"],
    ["ease_in", "In"],
    ["ease_out", "Out"],
    ["ease_in_out", "InOut"],
  ];
  for (const [val, label] of presetLabels) {
    const btn = document.createElement("button");
    btn.style.cssText = "font-size:9px;padding:2px 5px;background:#2a2a2a;border:1px solid #444;border-radius:3px;color:#ccc;cursor:pointer;";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      const p = PRESETS[val];
      x1 = p[0]; y1 = p[1]; x2 = p[2]; y2 = p[3];
      update();
      onChange(val);
    });
    presetRow.appendChild(btn);
  }
  el.appendChild(presetRow);

  return el;
}
