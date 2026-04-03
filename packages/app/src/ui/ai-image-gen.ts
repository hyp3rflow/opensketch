/**
 * AI Image Generation — Text-to-Image for OpenSketch
 * Supports OpenAI DALL-E API (and compatible endpoints)
 */

export interface ImageGenConfig {
  apiKey: string;
  endpoint: string; // e.g. https://api.openai.com/v1
  model: string;    // e.g. dall-e-3, dall-e-2
}

interface ImageGenResult {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
}

let panelEl: HTMLDivElement | null = null;
let savedConfig: ImageGenConfig | null = null;

function loadConfig(): ImageGenConfig {
  if (savedConfig) return savedConfig;
  try {
    const raw = localStorage.getItem("opensketch_image_gen_config");
    if (raw) { savedConfig = JSON.parse(raw); return savedConfig!; }
  } catch {}
  return { apiKey: "", endpoint: "https://api.openai.com/v1", model: "dall-e-3" };
}

function saveConfig(cfg: ImageGenConfig) {
  savedConfig = cfg;
  localStorage.setItem("opensketch_image_gen_config", JSON.stringify(cfg));
}

export function isImageGenOpen(): boolean { return panelEl !== null; }

export function closeImageGen(): void {
  if (panelEl) { panelEl.remove(); panelEl = null; }
}

/** Generate image via API — returns data URL */
export async function generateImage(
  prompt: string,
  size: string = "1024x1024",
  config?: ImageGenConfig,
): Promise<{ dataUrl: string; revisedPrompt?: string }> {
  const cfg = config || loadConfig();
  if (!cfg.apiKey) throw new Error("API key not configured. Open AI Image panel to set it.");

  const endpoint = cfg.endpoint.replace(/\/$/, "");
  const res = await fetch(`${endpoint}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      prompt,
      n: 1,
      size,
      response_format: "b64_json",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Image generation failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  const img: ImageGenResult = data.data?.[0];
  if (!img) throw new Error("No image returned");

  const dataUrl = img.b64_json
    ? `data:image/png;base64,${img.b64_json}`
    : img.url || "";

  return { dataUrl, revisedPrompt: img.revised_prompt };
}

const SIZES = ["1024x1024", "1792x1024", "1024x1792", "512x512", "256x256"];

export function openImageGen(
  onGenerated: (dataUrl: string, width: number, height: number, prompt: string) => void,
): void {
  if (panelEl) { closeImageGen(); return; }

  const cfg = loadConfig();

  panelEl = document.createElement("div");
  panelEl.style.cssText = `
    position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
    width:480px; background:#1e1e2e; border-radius:14px;
    box-shadow:0 12px 48px rgba(0,0,0,0.6); z-index:9999; display:flex;
    flex-direction:column; color:#e0e0e0; font-family:Inter,-apple-system,system-ui,sans-serif;
    font-size:13px; border:1px solid #2a2a3a;
  `;

  // Header
  const header = document.createElement("div");
  header.style.cssText = `padding:16px 20px; border-bottom:1px solid #2a2a3a; display:flex; align-items:center; justify-content:space-between;`;
  header.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>
      </svg>
      <span style="font-weight:600; font-size:14px;">AI Image Generation</span>
    </div>
  `;
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = `background:none; border:none; color:#888; cursor:pointer; font-size:16px; padding:4px;`;
  closeBtn.addEventListener("click", closeImageGen);
  header.appendChild(closeBtn);
  panelEl.appendChild(header);

  // Config section (collapsible)
  const configToggle = document.createElement("button");
  configToggle.textContent = "⚙ Settings";
  configToggle.style.cssText = `background:none; border:none; color:#888; cursor:pointer; font-size:11px; padding:8px 20px 0; text-align:left;`;
  panelEl.appendChild(configToggle);

  const configSection = document.createElement("div");
  configSection.style.cssText = `padding:8px 20px; display:none; gap:8px; flex-direction:column;`;
  configSection.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:6px;">
      <label style="font-size:11px; color:#888;">API Endpoint</label>
      <input id="igen-endpoint" value="${cfg.endpoint}" style="background:#2a2a3a; border:1px solid #3a3a4a; border-radius:6px; color:#e0e0e0; padding:6px 10px; font-size:12px;" />
      <label style="font-size:11px; color:#888;">API Key</label>
      <input id="igen-apikey" type="password" value="${cfg.apiKey}" placeholder="sk-..." style="background:#2a2a3a; border:1px solid #3a3a4a; border-radius:6px; color:#e0e0e0; padding:6px 10px; font-size:12px;" />
      <label style="font-size:11px; color:#888;">Model</label>
      <input id="igen-model" value="${cfg.model}" style="background:#2a2a3a; border:1px solid #3a3a4a; border-radius:6px; color:#e0e0e0; padding:6px 10px; font-size:12px;" />
    </div>
  `;
  panelEl.appendChild(configSection);
  configToggle.addEventListener("click", () => {
    const vis = configSection.style.display === "none";
    configSection.style.display = vis ? "flex" : "none";
  });

  // Prompt area
  const body = document.createElement("div");
  body.style.cssText = `padding:16px 20px; display:flex; flex-direction:column; gap:12px;`;

  const promptArea = document.createElement("textarea");
  promptArea.placeholder = "Describe the image you want to generate...";
  promptArea.style.cssText = `
    width:100%; min-height:80px; background:#2a2a3a; border:1px solid #3a3a4a;
    border-radius:8px; color:#e0e0e0; padding:10px 12px; font-size:13px;
    font-family:inherit; resize:vertical; outline:none;
  `;
  promptArea.addEventListener("focus", () => { promptArea.style.borderColor = "#a78bfa"; });
  promptArea.addEventListener("blur", () => { promptArea.style.borderColor = "#3a3a4a"; });
  body.appendChild(promptArea);

  // Size selector
  const sizeRow = document.createElement("div");
  sizeRow.style.cssText = `display:flex; align-items:center; gap:8px;`;
  sizeRow.innerHTML = `<span style="font-size:12px; color:#888;">Size:</span>`;
  const sizeSelect = document.createElement("select");
  sizeSelect.style.cssText = `background:#2a2a3a; border:1px solid #3a3a4a; border-radius:6px; color:#e0e0e0; padding:4px 8px; font-size:12px;`;
  for (const s of SIZES) {
    const opt = document.createElement("option");
    opt.value = s; opt.textContent = s;
    sizeSelect.appendChild(opt);
  }
  sizeRow.appendChild(sizeSelect);
  body.appendChild(sizeRow);

  // Status
  const status = document.createElement("div");
  status.style.cssText = `font-size:12px; color:#888; min-height:18px;`;
  body.appendChild(status);

  // Generate button
  const genBtn = document.createElement("button");
  genBtn.textContent = "✨ Generate Image";
  genBtn.style.cssText = `
    background:#a78bfa; border:none; border-radius:8px; color:#fff;
    padding:10px 20px; cursor:pointer; font-size:13px; font-weight:600;
    transition:opacity 0.15s;
  `;
  genBtn.addEventListener("click", async () => {
    const prompt = promptArea.value.trim();
    if (!prompt) { status.textContent = "Please enter a prompt."; return; }

    // Save config
    const curCfg: ImageGenConfig = {
      apiKey: (panelEl!.querySelector("#igen-apikey") as HTMLInputElement).value.trim(),
      endpoint: (panelEl!.querySelector("#igen-endpoint") as HTMLInputElement).value.trim(),
      model: (panelEl!.querySelector("#igen-model") as HTMLInputElement).value.trim(),
    };
    saveConfig(curCfg);

    if (!curCfg.apiKey) { status.textContent = "⚠ API key required. Open Settings."; return; }

    genBtn.disabled = true;
    genBtn.style.opacity = "0.5";
    status.textContent = "🎨 Generating image...";

    try {
      const size = sizeSelect.value;
      const result = await generateImage(prompt, size, curCfg);
      const [w, h] = size.split("x").map(Number);
      status.textContent = result.revisedPrompt
        ? `✅ Done — revised: "${result.revisedPrompt.slice(0, 80)}..."`
        : "✅ Image generated!";
      onGenerated(result.dataUrl, w, h, prompt);
      // Don't close — user might want to generate more
    } catch (e: any) {
      status.textContent = `❌ ${e.message}`;
    } finally {
      genBtn.disabled = false;
      genBtn.style.opacity = "1";
    }
  });
  body.appendChild(genBtn);
  panelEl.appendChild(body);

  // Quick prompts
  const quickSection = document.createElement("div");
  quickSection.style.cssText = `padding:0 20px 16px; display:flex; flex-wrap:wrap; gap:6px;`;
  const quickPrompts = [
    "🏔 Mountain landscape at sunset",
    "🎨 Abstract gradient background",
    "👤 Professional avatar placeholder",
    "📱 Mobile app mockup screen",
    "🏠 Minimalist house icon",
    "🌊 Ocean waves pattern",
  ];
  for (const qp of quickPrompts) {
    const chip = document.createElement("button");
    chip.textContent = qp;
    chip.style.cssText = `
      background:#2a2a3a; border:1px solid #3a3a4a; border-radius:16px;
      color:#ccc; padding:4px 10px; cursor:pointer; font-size:11px;
      transition:background 0.15s;
    `;
    chip.addEventListener("mouseenter", () => { chip.style.background = "#3a3a4a"; });
    chip.addEventListener("mouseleave", () => { chip.style.background = "#2a2a3a"; });
    chip.addEventListener("click", () => { promptArea.value = qp.slice(2).trim(); });
    quickSection.appendChild(chip);
  }
  panelEl.appendChild(quickSection);

  document.body.appendChild(panelEl);
  promptArea.focus();

  // ESC to close
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") { closeImageGen(); window.removeEventListener("keydown", escHandler); }
  };
  window.addEventListener("keydown", escHandler);

  // Ctrl+Enter to generate
  promptArea.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { genBtn.click(); }
  });
}
