import type { Editor } from "../editor";

const SCALES = [
  { label: "Minor Second (1.067)", value: "minor-second" },
  { label: "Major Second (1.125)", value: "major-second" },
  { label: "Minor Third (1.200)", value: "minor-third" },
  { label: "Major Third (1.250)", value: "major-third" },
  { label: "Perfect Fourth (1.333)", value: "perfect-fourth" },
  { label: "Augmented Fourth (1.414)", value: "augmented-fourth" },
  { label: "Perfect Fifth (1.500)", value: "perfect-fifth" },
  { label: "Golden Ratio (1.618)", value: "golden-ratio" },
  { label: "Custom…", value: "custom" },
];

const RATIOS: Record<string, number> = {
  "minor-second": 1.067,
  "major-second": 1.125,
  "minor-third": 1.200,
  "major-third": 1.250,
  "perfect-fourth": 1.333,
  "augmented-fourth": 1.414,
  "perfect-fifth": 1.500,
  "golden-ratio": 1.618,
};

interface ScaleLevel {
  name: string;
  font_size: number;
  font_weight: number;
  line_height: number;
}

function computePreview(baseSize: number, ratio: number): ScaleLevel[] {
  const levels: [string, number, number][] = [
    ["Display", 4, 700], ["H1", 3, 700], ["H2", 2, 600], ["H3", 1, 600],
    ["Body", 0, 400], ["Small", -1, 400], ["Caption", -2, 400],
  ];
  return levels.map(([name, exp, weight]) => ({
    name,
    font_size: Math.round(baseSize * Math.pow(ratio, exp) * 100) / 100,
    font_weight: weight,
    line_height: exp > 0 ? 1.2 : 1.5,
  }));
}

export function openTypoScaleModal(editor: Editor) {
  // Remove existing
  document.getElementById("typo-scale-modal")?.remove();

  let scaleName = "perfect-fourth";
  let customRatio = 1.333;
  let baseSize = 16;
  let fontFamily = "Inter";
  let updateExisting = true;

  const overlay = document.createElement("div");
  overlay.id = "typo-scale-modal";
  overlay.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);";
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  const modal = document.createElement("div");
  modal.style.cssText = "background:#2a2a2a;border-radius:12px;padding:20px;width:420px;max-height:80vh;overflow-y:auto;color:#e0e0e0;font-family:system-ui;box-shadow:0 8px 32px rgba(0,0,0,0.5);";

  function render() {
    const ratio = scaleName === "custom" ? customRatio : (RATIOS[scaleName] || 1.25);
    const preview = computePreview(baseSize, ratio);

    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <span style="font-size:15px;font-weight:600;">Typography Scale</span>
        <button id="tsc-close" style="background:none;border:none;color:#999;font-size:18px;cursor:pointer;">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
        <label style="font-size:11px;color:#888;">
          Scale
          <select id="tsc-scale" style="width:100%;margin-top:4px;padding:6px 8px;background:#1e1e1e;border:1px solid #444;border-radius:6px;color:#e0e0e0;font-size:12px;">
            ${SCALES.map(s => `<option value="${s.value}" ${s.value === scaleName ? "selected" : ""}>${s.label}</option>`).join("")}
          </select>
        </label>
        <label style="font-size:11px;color:#888;">
          ${scaleName === "custom" ? "Custom Ratio" : "Base Size (px)"}
          <input id="tsc-base" type="number" step="${scaleName === "custom" ? "0.001" : "1"}" value="${scaleName === "custom" ? customRatio : baseSize}" min="1" style="width:100%;margin-top:4px;padding:6px 8px;background:#1e1e1e;border:1px solid #444;border-radius:6px;color:#e0e0e0;font-size:12px;box-sizing:border-box;">
        </label>
      </div>
      ${scaleName === "custom" ? `
      <div style="margin-bottom:12px;">
        <label style="font-size:11px;color:#888;">
          Base Size (px)
          <input id="tsc-base-size" type="number" step="1" value="${baseSize}" min="1" style="width:100%;margin-top:4px;padding:6px 8px;background:#1e1e1e;border:1px solid #444;border-radius:6px;color:#e0e0e0;font-size:12px;box-sizing:border-box;">
        </label>
      </div>` : ""}
      <div style="margin-bottom:16px;">
        <label style="font-size:11px;color:#888;">
          Font Family
          <input id="tsc-font" type="text" value="${fontFamily}" style="width:100%;margin-top:4px;padding:6px 8px;background:#1e1e1e;border:1px solid #444;border-radius:6px;color:#e0e0e0;font-size:12px;box-sizing:border-box;">
        </label>
      </div>
      <div style="margin-bottom:16px;">
        <div style="font-size:11px;color:#888;margin-bottom:8px;">Preview</div>
        <div style="background:#1e1e1e;border-radius:8px;padding:12px;">
          ${preview.map(l => `
            <div style="display:flex;align-items:baseline;justify-content:space-between;padding:4px 0;border-bottom:1px solid #333;">
              <span style="font-family:${fontFamily},system-ui;font-size:${Math.min(l.font_size, 28)}px;font-weight:${l.font_weight};color:#e0e0e0;line-height:1.3;">Aa</span>
              <span style="font-size:11px;color:#888;white-space:nowrap;">${l.name} · ${l.font_size}px · ${l.font_weight}</span>
            </div>
          `).join("")}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <input type="checkbox" id="tsc-update" ${updateExisting ? "checked" : ""}>
        <label for="tsc-update" style="font-size:12px;color:#aaa;">Update existing styles with same name</label>
      </div>
      <button id="tsc-generate" style="width:100%;padding:10px;background:#6366F1;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">Generate Styles</button>
    `;

    // Events
    modal.querySelector("#tsc-close")!.addEventListener("click", () => overlay.remove());
    modal.querySelector("#tsc-scale")!.addEventListener("change", (e) => {
      scaleName = (e.target as HTMLSelectElement).value;
      render();
    });
    modal.querySelector("#tsc-base")!.addEventListener("input", (e) => {
      const v = parseFloat((e.target as HTMLInputElement).value);
      if (scaleName === "custom") { if (v > 1) customRatio = v; }
      else { if (v >= 1) baseSize = v; }
      render();
    });
    if (scaleName === "custom") {
      modal.querySelector("#tsc-base-size")!.addEventListener("input", (e) => {
        const v = parseFloat((e.target as HTMLInputElement).value);
        if (v >= 1) baseSize = v;
        render();
      });
    }
    modal.querySelector("#tsc-font")!.addEventListener("input", (e) => {
      fontFamily = (e.target as HTMLInputElement).value || "Inter";
      render();
    });
    modal.querySelector("#tsc-update")!.addEventListener("change", (e) => {
      updateExisting = (e.target as HTMLInputElement).checked;
    });
    modal.querySelector("#tsc-generate")!.addEventListener("click", () => {
      const scaleValue = scaleName === "custom" ? customRatio.toString() : scaleName;
      const count = editor.engine.apply_type_scale(baseSize, scaleValue, fontFamily, updateExisting);
      overlay.remove();
      editor.requestRender();
      // Refresh properties panel if visible
      (editor as any).refreshPropertiesPanel?.();
    });
  }

  render();
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}
