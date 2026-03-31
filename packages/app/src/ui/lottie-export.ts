import type { Editor } from "../editor";
import { t } from "./i18n";

let dialog: HTMLDivElement | null = null;

export function openLottieExportDialog(editor: Editor) {
  if (dialog) { closeLottieExportDialog(); return; }

  const sel = Array.from(editor.engine.get_selection()).map(Number);
  if (sel.length === 0) {
    alert("Select a node or frame to export as Lottie animation.");
    return;
  }

  // Get node info for display
  let nodeName = "Selection";
  if (sel.length === 1) {
    try {
      const nj = JSON.parse(editor.engine.get_node_json(BigInt(sel[0])));
      nodeName = nj.name || "Node";
    } catch {}
  } else {
    nodeName = `${sel.length} nodes`;
  }

  dialog = document.createElement("div");
  dialog.style.cssText = `
    position:fixed; top:0; left:0; right:0; bottom:0; z-index:10000;
    display:flex; align-items:center; justify-content:center;
    background:rgba(0,0,0,0.6); backdrop-filter:blur(4px);
  `;

  const card = document.createElement("div");
  card.style.cssText = `
    background:#1e1e1e; border:1px solid #333; border-radius:12px;
    width:480px; max-height:80vh; overflow-y:auto;
    padding:24px; color:#ccc; font-family:system-ui,-apple-system,sans-serif;
    box-shadow:0 20px 60px rgba(0,0,0,0.5);
  `;

  // State
  let fps = 30;
  let duration = 2;
  let looping = true;
  let previewJson: string | null = null;

  const inputCss = `
    width:100%; padding:8px 10px; font-size:13px;
    border:1px solid #444; border-radius:6px;
    background:#2a2a2a; color:#ccc; box-sizing:border-box;
    outline:none; transition:border-color 0.15s;
  `;
  const labelCss = "font-size:11px; color:#888; margin-bottom:4px; display:block;";
  const sectionCss = "margin-bottom:16px;";

  // Title
  const title = document.createElement("div");
  title.style.cssText = "font-size:16px; font-weight:600; color:#fff; margin-bottom:4px;";
  title.textContent = "Export Lottie Animation";
  card.appendChild(title);

  const subtitle = document.createElement("div");
  subtitle.style.cssText = "font-size:12px; color:#666; margin-bottom:20px;";
  subtitle.textContent = `Exporting: ${nodeName}`;
  card.appendChild(subtitle);

  // FPS
  const fpsSection = document.createElement("div");
  fpsSection.style.cssText = sectionCss;
  const fpsLabel = document.createElement("label");
  fpsLabel.style.cssText = labelCss;
  fpsLabel.textContent = "Frame Rate (FPS)";
  fpsSection.appendChild(fpsLabel);
  const fpsRow = document.createElement("div");
  fpsRow.style.cssText = "display:flex; gap:6px;";
  for (const val of [24, 30, 60]) {
    const btn = document.createElement("button");
    btn.textContent = `${val}`;
    btn.style.cssText = `
      flex:1; padding:8px; border:1px solid ${val === fps ? "#4f46e5" : "#444"};
      border-radius:6px; background:${val === fps ? "rgba(79,70,229,0.2)" : "#2a2a2a"};
      color:${val === fps ? "#818cf8" : "#ccc"}; cursor:pointer; font-size:13px;
      transition:all 0.15s;
    `;
    btn.addEventListener("click", () => {
      fps = val;
      fpsRow.querySelectorAll("button").forEach(b => {
        const v = parseInt(b.textContent!);
        b.style.borderColor = v === fps ? "#4f46e5" : "#444";
        b.style.background = v === fps ? "rgba(79,70,229,0.2)" : "#2a2a2a";
        b.style.color = v === fps ? "#818cf8" : "#ccc";
      });
    });
    fpsRow.appendChild(btn);
  }
  fpsSection.appendChild(fpsRow);
  card.appendChild(fpsSection);

  // Duration
  const durSection = document.createElement("div");
  durSection.style.cssText = sectionCss;
  const durLabel = document.createElement("label");
  durLabel.style.cssText = labelCss;
  durLabel.textContent = "Duration (seconds)";
  durSection.appendChild(durLabel);
  const durInput = document.createElement("input");
  durInput.type = "number";
  durInput.value = String(duration);
  durInput.min = "0.1"; durInput.max = "60"; durInput.step = "0.5";
  durInput.style.cssText = inputCss;
  durInput.addEventListener("change", () => { duration = parseFloat(durInput.value) || 2; });
  durSection.appendChild(durInput);
  card.appendChild(durSection);

  // Loop
  const loopSection = document.createElement("div");
  loopSection.style.cssText = sectionCss + "display:flex; align-items:center; gap:8px;";
  const loopCheck = document.createElement("input");
  loopCheck.type = "checkbox";
  loopCheck.checked = looping;
  loopCheck.style.cssText = "width:16px; height:16px; accent-color:#4f46e5;";
  loopCheck.addEventListener("change", () => { looping = loopCheck.checked; });
  const loopLabel = document.createElement("span");
  loopLabel.style.cssText = "font-size:13px; color:#ccc;";
  loopLabel.textContent = "Loop animation";
  loopSection.appendChild(loopCheck);
  loopSection.appendChild(loopLabel);
  card.appendChild(loopSection);

  // Animation info
  const infoSection = document.createElement("div");
  infoSection.style.cssText = `
    ${sectionCss} padding:12px; background:#252525; border-radius:8px;
    border:1px solid #333;
  `;
  const infoTitle = document.createElement("div");
  infoTitle.style.cssText = "font-size:11px; color:#888; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;";
  infoTitle.textContent = "Animation Tracks";
  infoSection.appendChild(infoTitle);

  // Show existing animation clips info
  try {
    const clipsJson = editor.engine.anim_get_clips();
    const clips = JSON.parse(clipsJson);
    if (clips.length > 0) {
      const info = document.createElement("div");
      info.style.cssText = "font-size:12px; color:#aaa;";
      info.textContent = `${clips.length} clip(s) found — keyframes will be included in export.`;
      infoSection.appendChild(info);
    } else {
      const info = document.createElement("div");
      info.style.cssText = "font-size:12px; color:#666; font-style:italic;";
      info.textContent = "No animation clips. Export will create a static Lottie with node shapes.";
      infoSection.appendChild(info);
      const hint = document.createElement("div");
      hint.style.cssText = "font-size:11px; color:#555; margin-top:4px;";
      hint.textContent = "Tip: Use the Animation Timeline (Alt+T) to add keyframes.";
      infoSection.appendChild(hint);
    }
  } catch {
    const info = document.createElement("div");
    info.style.cssText = "font-size:12px; color:#666;";
    info.textContent = "Static export (no animation data).";
    infoSection.appendChild(info);
  }
  card.appendChild(infoSection);

  // Preview area
  const previewSection = document.createElement("div");
  previewSection.style.cssText = `
    ${sectionCss} margin-top:8px;
  `;
  const previewBtn = document.createElement("button");
  previewBtn.style.cssText = `
    width:100%; padding:10px; border:1px solid #444; border-radius:6px;
    background:#2a2a2a; color:#aaa; cursor:pointer; font-size:12px;
    transition:all 0.15s;
  `;
  previewBtn.textContent = "🎬 Generate Preview";
  const previewContainer = document.createElement("div");
  previewContainer.style.cssText = "margin-top:8px; display:none;";

  previewBtn.addEventListener("click", () => {
    const config = JSON.stringify({ fps, duration_secs: duration, looping });
    const json = editor.engine.export_selection_lottie(config);
    if (!json || json === "null") {
      previewContainer.style.display = "block";
      previewContainer.innerHTML = `<div style="color:#f87171; font-size:12px;">Export failed — ensure nodes are selected.</div>`;
      return;
    }
    previewJson = json;
    previewContainer.style.display = "block";

    // Show JSON preview (truncated)
    const truncated = json.length > 500 ? json.substring(0, 500) + "\n..." : json;
    previewContainer.innerHTML = `
      <div style="font-size:11px; color:#888; margin-bottom:4px;">Preview (${(json.length / 1024).toFixed(1)} KB)</div>
      <pre style="
        background:#1a1a1a; border:1px solid #333; border-radius:6px;
        padding:10px; font-size:10px; color:#8b8; overflow:auto;
        max-height:150px; font-family:'JetBrains Mono',monospace;
        white-space:pre-wrap; word-break:break-all;
      ">${escapeHtml(truncated)}</pre>
    `;
  });
  previewSection.appendChild(previewBtn);
  previewSection.appendChild(previewContainer);
  card.appendChild(previewSection);

  // Action buttons
  const actions = document.createElement("div");
  actions.style.cssText = "display:flex; gap:8px; margin-top:20px;";

  const cancelBtn = document.createElement("button");
  cancelBtn.style.cssText = `
    flex:1; padding:10px; border:1px solid #444; border-radius:8px;
    background:#2a2a2a; color:#ccc; cursor:pointer; font-size:13px;
    transition:all 0.15s;
  `;
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", closeLottieExportDialog);

  const downloadBtn = document.createElement("button");
  downloadBtn.style.cssText = `
    flex:2; padding:10px; border:none; border-radius:8px;
    background:#4f46e5; color:#fff; cursor:pointer; font-size:13px;
    font-weight:600; transition:all 0.15s;
  `;
  downloadBtn.textContent = "⬇ Download .json";
  downloadBtn.addEventListener("mouseenter", () => { downloadBtn.style.background = "#6366f1"; });
  downloadBtn.addEventListener("mouseleave", () => { downloadBtn.style.background = "#4f46e5"; });
  downloadBtn.addEventListener("click", () => {
    const config = JSON.stringify({ fps, duration_secs: duration, looping });
    const json = previewJson || editor.engine.export_selection_lottie(config);
    if (!json || json === "null") {
      alert("Export failed. Select valid nodes.");
      return;
    }
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nodeName.replace(/[^a-zA-Z0-9]/g, "_")}_lottie.json`;
    a.click();
    URL.revokeObjectURL(url);
    closeLottieExportDialog();
  });

  const copyBtn = document.createElement("button");
  copyBtn.style.cssText = `
    padding:10px 16px; border:1px solid #444; border-radius:8px;
    background:#2a2a2a; color:#ccc; cursor:pointer; font-size:13px;
    transition:all 0.15s;
  `;
  copyBtn.textContent = "📋";
  copyBtn.title = "Copy JSON to clipboard";
  copyBtn.addEventListener("click", () => {
    const config = JSON.stringify({ fps, duration_secs: duration, looping });
    const json = previewJson || editor.engine.export_selection_lottie(config);
    if (json && json !== "null") {
      navigator.clipboard.writeText(json).then(() => {
        copyBtn.textContent = "✓";
        setTimeout(() => { copyBtn.textContent = "📋"; }, 1500);
      });
    }
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(downloadBtn);
  actions.appendChild(copyBtn);
  card.appendChild(actions);

  dialog.appendChild(card);
  document.body.appendChild(dialog);

  // Close on backdrop click
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) closeLottieExportDialog();
  });

  // Close on Escape
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      closeLottieExportDialog();
      window.removeEventListener("keydown", escHandler);
    }
  };
  window.addEventListener("keydown", escHandler);
}

export function closeLottieExportDialog() {
  if (dialog) {
    dialog.remove();
    dialog = null;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
