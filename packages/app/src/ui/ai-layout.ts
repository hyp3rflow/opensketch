/**
 * AI Auto-Layout from Screenshot
 * Drag & drop an image → LLM vision API analyzes UI elements → auto-creates nodes
 */

import { loadConfig, type LLMConfig } from "./llm-agent";
import type { Editor } from "../editor";

interface UIElement {
  type: "frame" | "rect" | "text" | "ellipse" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
  fill?: string;        // hex color
  text?: string;         // for text elements
  fontSize?: number;
  cornerRadius?: number;
  opacity?: number;      // 0-1
  children?: UIElement[];
}

interface VisionResponse {
  elements: UIElement[];
  width: number;
  height: number;
}

const VISION_PROMPT = `Analyze this UI screenshot and identify all visible UI elements. Return a JSON object with this exact structure:

{
  "width": <original image width in pixels>,
  "height": <original image height in pixels>,
  "elements": [
    {
      "type": "frame" | "rect" | "text" | "ellipse" | "image",
      "x": <x position>,
      "y": <y position>,
      "width": <width>,
      "height": <height>,
      "name": "<descriptive name>",
      "fill": "<hex color like #FFFFFF>",
      "text": "<text content, only for type=text>",
      "fontSize": <font size, only for type=text>,
      "cornerRadius": <corner radius if rounded>,
      "children": [<nested elements>]
    }
  ]
}

Rules:
- Identify buttons, cards, headers, nav bars, input fields, icons, images, text blocks
- Use "frame" for containers/cards/sections that group other elements
- Use "rect" for buttons, inputs, dividers, backgrounds
- Use "text" for any text content
- Use "ellipse" for circular elements (avatars, round icons)
- Use "image" for photos/illustrations (represent as rect with name "Image")
- Nest children inside frames when they visually belong together
- Positions are relative to the image top-left
- Extract actual text content where readable
- Estimate colors from the screenshot
- Return ONLY valid JSON, no markdown fences or explanation`;

/** Convert a File to base64 data URL */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Call vision API to analyze the image */
async function analyzeImage(config: LLMConfig, base64DataUrl: string): Promise<VisionResponse> {
  const isAnthropic = config.endpoint.includes("anthropic");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  let url = `${config.endpoint.replace(/\/$/, "")}/chat/completions`;

  if (isAnthropic) {
    headers["x-api-key"] = config.apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  // Use a vision-capable model; fall back to configured model
  const model = config.model;

  const body = {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: VISION_PROMPT },
          {
            type: "image_url",
            image_url: { url: base64DataUrl, detail: "high" },
          },
        ],
      },
    ],
    max_tokens: 4096,
    temperature: 0,
  };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Vision API error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content || "";

  // Extract JSON from response (handle markdown fences)
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
  const parsed = JSON.parse(jsonMatch[1]!.trim());

  return parsed as VisionResponse;
}

function hexToRgba(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}

/** Recursively create nodes from parsed UI elements */
function createNodes(
  engine: any,
  elements: UIElement[],
  offsetX: number,
  offsetY: number,
  scale: number,
  parentId?: bigint,
): number[] {
  const bi = (v: number) => BigInt(v);
  const createdIds: number[] = [];

  for (const el of elements) {
    const x = offsetX + el.x * scale;
    const y = offsetY + el.y * scale;
    const w = el.width * scale;
    const h = el.height * scale;
    let nodeId: bigint;

    switch (el.type) {
      case "frame": {
        nodeId = engine.add_frame(x, y, w, h);
        break;
      }
      case "rect":
      case "image": {
        nodeId = engine.add_rect(x, y, w, h);
        break;
      }
      case "ellipse": {
        nodeId = engine.add_ellipse(x, y, w, h);
        break;
      }
      case "text": {
        const fontSize = (el.fontSize || 16) * scale;
        nodeId = engine.add_text(x, y, el.text || "Text", fontSize);
        break;
      }
      default: {
        nodeId = engine.add_rect(x, y, w, h);
        break;
      }
    }

    // Set name
    if (el.name) {
      try { engine.set_node_name(nodeId, el.name); } catch {}
    }

    // Set fill color
    if (el.fill) {
      try {
        const [r, g, b] = hexToRgba(el.fill);
        engine.set_fill_color(nodeId, r, g, b, 1.0);
      } catch {}
    }

    // Set corner radius
    if (el.cornerRadius && el.cornerRadius > 0) {
      try { engine.set_corner_radius(nodeId, el.cornerRadius * scale); } catch {}
    }

    // Set opacity
    if (el.opacity !== undefined && el.opacity < 1) {
      try { engine.set_opacity(nodeId, el.opacity); } catch {}
    }

    // Reparent into parent frame
    if (parentId !== undefined) {
      try { engine.reparent_node(nodeId, parentId); } catch {}
    }

    createdIds.push(Number(nodeId));

    // Recurse into children
    if (el.children && el.children.length > 0) {
      createNodes(engine, el.children, 0, 0, scale, nodeId);
    }
  }

  return createdIds;
}

/** Show the AI Layout drop overlay */
export function showAILayoutOverlay() {
  let overlay = document.getElementById("ai-layout-overlay");
  if (overlay) { overlay.style.display = "flex"; return; }

  overlay = document.createElement("div");
  overlay.id = "ai-layout-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 10000;
    display: flex; align-items: center; justify-content: center;
    background: rgba(79, 70, 229, 0.15); backdrop-filter: blur(2px);
    pointer-events: none;
  `;
  overlay.innerHTML = `
    <div style="
      background: white; border-radius: 16px; padding: 32px 48px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      display: flex; flex-direction: column; align-items: center; gap: 12px;
    ">
      <div style="font-size: 36px;">🤖</div>
      <div style="font-size: 16px; font-weight: 600; color: #1a1a2e;">AI Auto-Layout</div>
      <div style="font-size: 13px; color: #666;">Analyzing screenshot with vision AI...</div>
      <div class="ai-layout-spinner" style="
        width: 24px; height: 24px; border: 3px solid #e0e0e0;
        border-top-color: #4F46E5; border-radius: 50%;
        animation: ai-spin 0.8s linear infinite;
      "></div>
    </div>
  `;

  // Add spinner animation
  if (!document.getElementById("ai-layout-styles")) {
    const style = document.createElement("style");
    style.id = "ai-layout-styles";
    style.textContent = `@keyframes ai-spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }

  document.body.appendChild(overlay);
}

export function hideAILayoutOverlay() {
  const overlay = document.getElementById("ai-layout-overlay");
  if (overlay) overlay.style.display = "none";
}

/** Show a choice dialog when an image is dropped: "Image node" vs "AI Layout" */
export function showImageDropChoice(
  x: number,
  y: number,
  onImage: () => void,
  onAILayout: () => void,
): void {
  // Remove any existing
  const existing = document.getElementById("ai-layout-choice");
  if (existing) existing.remove();

  const dialog = document.createElement("div");
  dialog.id = "ai-layout-choice";
  dialog.style.cssText = `
    position: fixed; left: ${x}px; top: ${y}px; z-index: 10001;
    background: white; border-radius: 12px; padding: 8px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.18);
    display: flex; flex-direction: column; gap: 2px;
    min-width: 180px;
  `;

  const btnStyle = `
    display: flex; align-items: center; gap: 10px;
    padding: 10px 14px; border: none; background: none;
    border-radius: 8px; cursor: pointer; font-size: 13px;
    color: #1a1a2e; text-align: left; width: 100%;
  `;

  dialog.innerHTML = `
    <button id="ai-choice-image" style="${btnStyle}">
      <span style="font-size: 18px;">🖼️</span>
      <span>Add as Image</span>
    </button>
    <button id="ai-choice-layout" style="${btnStyle}">
      <span style="font-size: 18px;">🤖</span>
      <div>
        <div>AI Auto-Layout</div>
        <div style="font-size: 11px; color: #888; margin-top: 2px;">Analyze & create nodes</div>
      </div>
    </button>
  `;

  document.body.appendChild(dialog);

  // Hover styles
  dialog.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("mouseenter", () => btn.style.background = "#f3f4f6");
    btn.addEventListener("mouseleave", () => btn.style.background = "none");
  });

  const cleanup = () => { dialog.remove(); document.removeEventListener("mousedown", outsideClick); };
  const outsideClick = (e: MouseEvent) => {
    if (!dialog.contains(e.target as Node)) cleanup();
  };
  setTimeout(() => document.addEventListener("mousedown", outsideClick), 0);

  dialog.querySelector("#ai-choice-image")!.addEventListener("click", () => { cleanup(); onImage(); });
  dialog.querySelector("#ai-choice-layout")!.addEventListener("click", () => { cleanup(); onAILayout(); });
}

/** Main entry: process an image file with AI vision and create nodes */
export async function processAILayout(
  editor: Editor,
  file: File,
  dropX: number,
  dropY: number,
): Promise<number[]> {
  const config = loadConfig();
  if (!config) {
    alert("Please configure LLM API settings in the Agent panel first (API key, endpoint, model).");
    return [];
  }

  showAILayoutOverlay();

  try {
    const base64 = await fileToBase64(file);
    const result = await analyzeImage(config, base64);

    // Scale to fit within 800px max dimension
    const maxDim = 800;
    const imgScale = Math.min(1, maxDim / Math.max(result.width || 800, result.height || 600));

    // Convert drop position to scene coordinates
    const engine = (editor as any).engine;
    const sceneX = engine.screen_to_scene_x(dropX, dropY);
    const sceneY = engine.screen_to_scene_y(dropX, dropY);

    engine.push_undo();
    const ids = createNodes(engine, result.elements, sceneX, sceneY, imgScale);

    editor.requestRender();
    (editor as any).onLayersChanges?.forEach((fn: () => void) => fn());

    hideAILayoutOverlay();

    console.log(`AI Layout: created ${ids.length} nodes from screenshot`);
    return ids;
  } catch (err: any) {
    hideAILayoutOverlay();
    console.error("AI Layout failed:", err);
    alert(`AI Layout failed: ${err.message}`);
    return [];
  }
}
