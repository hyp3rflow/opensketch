/**
 * Artboard Templates / Presets — device-specific artboard presets
 * iPhone, iPad, Desktop, Watch, A4, etc. One-click creation.
 * Custom preset save/delete, localStorage persistence.
 */

import type { Editor } from "../editor";

// ============================================================
// Types
// ============================================================

export interface ArtboardPreset {
  id: string;
  name: string;
  category: ArtboardCategory;
  width: number;
  height: number;
  builtIn: boolean;
}

export type ArtboardCategory =
  | "Phone"
  | "Tablet"
  | "Desktop"
  | "Watch"
  | "Paper"
  | "Social"
  | "Custom";

// ============================================================
// Built-in Presets
// ============================================================

const BUILTIN_PRESETS: ArtboardPreset[] = [
  // Phone
  { id: "iphone-16", name: "iPhone 16", category: "Phone", width: 393, height: 852, builtIn: true },
  { id: "iphone-16-pro", name: "iPhone 16 Pro", category: "Phone", width: 402, height: 874, builtIn: true },
  { id: "iphone-16-pro-max", name: "iPhone 16 Pro Max", category: "Phone", width: 440, height: 956, builtIn: true },
  { id: "iphone-se", name: "iPhone SE", category: "Phone", width: 375, height: 667, builtIn: true },
  { id: "pixel-9", name: "Pixel 9", category: "Phone", width: 412, height: 923, builtIn: true },
  { id: "galaxy-s24", name: "Galaxy S24", category: "Phone", width: 360, height: 780, builtIn: true },
  { id: "android-small", name: "Android Small", category: "Phone", width: 360, height: 640, builtIn: true },
  { id: "android-large", name: "Android Large", category: "Phone", width: 412, height: 915, builtIn: true },

  // Tablet
  { id: "ipad-mini", name: "iPad Mini", category: "Tablet", width: 744, height: 1133, builtIn: true },
  { id: "ipad-10", name: 'iPad 10.9"', category: "Tablet", width: 820, height: 1180, builtIn: true },
  { id: "ipad-air", name: "iPad Air", category: "Tablet", width: 820, height: 1180, builtIn: true },
  { id: "ipad-pro-11", name: 'iPad Pro 11"', category: "Tablet", width: 834, height: 1194, builtIn: true },
  { id: "ipad-pro-13", name: 'iPad Pro 13"', category: "Tablet", width: 1024, height: 1366, builtIn: true },
  { id: "surface-pro", name: "Surface Pro", category: "Tablet", width: 912, height: 1368, builtIn: true },

  // Desktop
  { id: "macbook-air-13", name: 'MacBook Air 13"', category: "Desktop", width: 1470, height: 956, builtIn: true },
  { id: "macbook-pro-14", name: 'MacBook Pro 14"', category: "Desktop", width: 1512, height: 982, builtIn: true },
  { id: "macbook-pro-16", name: 'MacBook Pro 16"', category: "Desktop", width: 1728, height: 1117, builtIn: true },
  { id: "desktop-1080", name: "Desktop 1080p", category: "Desktop", width: 1920, height: 1080, builtIn: true },
  { id: "desktop-1440", name: "Desktop 1440p", category: "Desktop", width: 2560, height: 1440, builtIn: true },
  { id: "desktop-4k", name: "Desktop 4K", category: "Desktop", width: 3840, height: 2160, builtIn: true },
  { id: "imac-24", name: 'iMac 24"', category: "Desktop", width: 2240, height: 1260, builtIn: true },

  // Watch
  { id: "apple-watch-41", name: "Apple Watch 41mm", category: "Watch", width: 176, height: 215, builtIn: true },
  { id: "apple-watch-45", name: "Apple Watch 45mm", category: "Watch", width: 198, height: 242, builtIn: true },
  { id: "apple-watch-49", name: "Apple Watch Ultra 49mm", category: "Watch", width: 205, height: 251, builtIn: true },

  // Paper
  { id: "a4", name: "A4", category: "Paper", width: 595, height: 842, builtIn: true },
  { id: "a3", name: "A3", category: "Paper", width: 842, height: 1191, builtIn: true },
  { id: "letter", name: "US Letter", category: "Paper", width: 612, height: 792, builtIn: true },
  { id: "legal", name: "US Legal", category: "Paper", width: 612, height: 1008, builtIn: true },

  // Social
  { id: "ig-post", name: "Instagram Post", category: "Social", width: 1080, height: 1080, builtIn: true },
  { id: "ig-story", name: "Instagram Story", category: "Social", width: 1080, height: 1920, builtIn: true },
  { id: "x-post", name: "X/Twitter Post", category: "Social", width: 1200, height: 675, builtIn: true },
  { id: "fb-cover", name: "Facebook Cover", category: "Social", width: 820, height: 312, builtIn: true },
  { id: "yt-thumbnail", name: "YouTube Thumbnail", category: "Social", width: 1280, height: 720, builtIn: true },
  { id: "linkedin-banner", name: "LinkedIn Banner", category: "Social", width: 1584, height: 396, builtIn: true },
];

// ============================================================
// Custom preset storage
// ============================================================

const STORAGE_KEY = "opensketch-artboard-presets";

function loadCustomPresets(): ArtboardPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ArtboardPreset[];
  } catch { return []; }
}

function saveCustomPresets(presets: ArtboardPreset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

function getAllPresets(): ArtboardPreset[] {
  return [...BUILTIN_PRESETS, ...loadCustomPresets()];
}

function getCategories(): ArtboardCategory[] {
  const cats = new Set<ArtboardCategory>();
  for (const p of getAllPresets()) cats.add(p.category);
  return Array.from(cats);
}

// ============================================================
// Create artboard (Frame node)
// ============================================================

export function createArtboard(editor: Editor, preset: ArtboardPreset) {
  editor.engine.push_undo();
  const zoom = (editor as any).zoom || 1;
  const panX = (editor as any).panX || 0;
  const panY = (editor as any).panY || 0;
  const canvas = editor.canvas;
  const cx = (-panX + canvas.width / 2) / zoom;
  const cy = (-panY + canvas.height / 2) / zoom;
  const x = cx - preset.width / 2;
  const y = cy - preset.height / 2;

  const id = Number(editor.engine.add_frame(x, y, preset.width, preset.height));
  editor.engine.set_node_name(BigInt(id), preset.name);

  editor.engine.deselect_all();
  editor.engine.add_to_selection(BigInt(id));
  editor.requestRender();
}

// ============================================================
// UI Panel
// ============================================================

export function setupArtboardPresetsPanel(container: HTMLElement, editor: Editor) {
  let filter = "";
  let activeCategory: ArtboardCategory | "All" = "All";
  let orientation: "portrait" | "landscape" = "portrait";

  function render() {
    const presets = getAllPresets();
    const categories: (ArtboardCategory | "All")[] = ["All", ...getCategories()];
    const filtered = presets.filter((p) => {
      if (activeCategory !== "All" && p.category !== activeCategory) return false;
      if (filter && !p.name.toLowerCase().includes(filter.toLowerCase())) return false;
      return true;
    });

    container.innerHTML = `
      <div style="padding:12px;display:flex;flex-direction:column;gap:10px;height:100%;overflow:hidden;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:13px;font-weight:600;color:#e2e8f0;">Artboard Presets</div>
          <div style="display:flex;gap:2px;">
            <button id="ab-portrait" title="Portrait" style="padding:3px 6px;border-radius:4px;border:none;font-size:11px;cursor:pointer;background:${orientation === "portrait" ? "#6366f1" : "#2d2d44"};color:${orientation === "portrait" ? "#fff" : "#94a3b8"};">↕</button>
            <button id="ab-landscape" title="Landscape" style="padding:3px 6px;border-radius:4px;border:none;font-size:11px;cursor:pointer;background:${orientation === "landscape" ? "#6366f1" : "#2d2d44"};color:${orientation === "landscape" ? "#fff" : "#94a3b8"};">↔</button>
          </div>
        </div>
        <input id="ab-search" type="text" placeholder="Search presets…"
          value="${filter}"
          style="width:100%;padding:6px 10px;border-radius:6px;border:1px solid #3d3d5c;background:#1e1e36;color:#e2e8f0;font-size:12px;outline:none;box-sizing:border-box;" />
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
          ${categories.map((c) => `<button class="ab-cat-btn" data-cat="${c}" style="padding:3px 8px;border-radius:4px;border:none;font-size:11px;cursor:pointer;background:${c === activeCategory ? "#6366f1" : "#2d2d44"};color:${c === activeCategory ? "#fff" : "#94a3b8"};">${c}</button>`).join("")}
        </div>
        <div style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:4px;padding-right:4px;" id="ab-list">
          ${filtered.map((p) => {
            const w = orientation === "landscape" ? Math.max(p.width, p.height) : Math.min(p.width, p.height);
            const h = orientation === "landscape" ? Math.min(p.width, p.height) : Math.max(p.width, p.height);
            const aspectW = Math.round((w / Math.max(w, h)) * 28);
            const aspectH = Math.round((h / Math.max(w, h)) * 28);
            return `
            <div class="ab-card" data-id="${p.id}" style="padding:8px 12px;background:#252540;border-radius:8px;cursor:pointer;border:1px solid transparent;transition:border-color .15s;display:flex;align-items:center;gap:10px;" onmouseenter="this.style.borderColor='#6366f1'" onmouseleave="this.style.borderColor='transparent'">
              <div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
                <div style="width:${aspectW}px;height:${aspectH}px;border:1.5px solid #6366f1;border-radius:3px;background:#6366f120;"></div>
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:12px;font-weight:600;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div>
                <div style="font-size:10px;color:#94a3b8;">${w} × ${h}</div>
              </div>
              ${!p.builtIn ? `<button class="ab-delete-btn" data-id="${p.id}" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:14px;padding:2px 4px;" title="Delete">✕</button>` : ""}
            </div>`;
          }).join("")}
          ${filtered.length === 0 ? '<div style="color:#64748b;font-size:12px;text-align:center;padding:20px;">No presets found</div>' : ""}
        </div>
        <div style="border-top:1px solid #3d3d5c;padding-top:10px;display:flex;flex-direction:column;gap:6px;">
          <button id="ab-custom-btn" style="width:100%;padding:7px;border-radius:6px;border:none;background:#6366f1;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">+ Custom Artboard</button>
        </div>
      </div>
    `;

    // Events
    container.querySelector("#ab-search")?.addEventListener("input", (e) => {
      filter = (e.target as HTMLInputElement).value;
      render();
    });

    container.querySelector("#ab-portrait")?.addEventListener("click", () => { orientation = "portrait"; render(); });
    container.querySelector("#ab-landscape")?.addEventListener("click", () => { orientation = "landscape"; render(); });

    container.querySelectorAll(".ab-cat-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeCategory = (btn as HTMLElement).dataset.cat as any;
        render();
      });
    });

    container.querySelectorAll(".ab-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).classList.contains("ab-delete-btn")) return;
        const id = (card as HTMLElement).dataset.id!;
        const preset = getAllPresets().find((p) => p.id === id);
        if (preset) {
          const p = { ...preset };
          if (orientation === "landscape" && p.width < p.height) {
            [p.width, p.height] = [p.height, p.width];
          } else if (orientation === "portrait" && p.width > p.height) {
            [p.width, p.height] = [p.height, p.width];
          }
          createArtboard(editor, p);
        }
      });
    });

    container.querySelectorAll(".ab-delete-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.id!;
        if (confirm("Delete this custom preset?")) {
          const customs = loadCustomPresets().filter((p) => p.id !== id);
          saveCustomPresets(customs);
          render();
        }
      });
    });

    container.querySelector("#ab-custom-btn")?.addEventListener("click", () => {
      const name = prompt("Preset name:", "My Artboard");
      if (!name) return;
      const wStr = prompt("Width (px):", "1440");
      if (!wStr) return;
      const hStr = prompt("Height (px):", "900");
      if (!hStr) return;
      const w = parseInt(wStr, 10);
      const h = parseInt(hStr, 10);
      if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) { alert("Invalid dimensions."); return; }

      const preset: ArtboardPreset = {
        id: `custom-${Date.now()}`,
        name,
        category: "Custom",
        width: w,
        height: h,
        builtIn: false,
      };
      const customs = loadCustomPresets();
      customs.push(preset);
      saveCustomPresets(customs);
      render();
    });
  }

  render();
}
