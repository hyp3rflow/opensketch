import type { Editor } from "../editor";
import { icons } from "./icons";

type MediaItem = { id: number; name: string; kind: "Image" | "Video"; src: string; reason: string };

export function setupAssetPanel(container: HTMLElement, editor: Editor) {
  let searchQuery = "";
  let brokenMedia: MediaItem[] = [];
  let scanning = false;

  function refresh() {
    container.innerHTML = "";

    // Search bar
    const searchBar = document.createElement("div");
    searchBar.style.cssText = "padding:8px 12px;border-bottom:1px solid #333;";
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search assets…";
    searchInput.value = searchQuery;
    searchInput.style.cssText = "width:100%;background:#1a1a1a;border:1px solid #444;border-radius:6px;padding:6px 10px;color:#ccc;font-size:12px;outline:none;box-sizing:border-box;";
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value.toLowerCase();
      refresh();
    });
    searchBar.appendChild(searchInput);
    container.appendChild(searchBar);

    const scrollArea = document.createElement("div");
    scrollArea.style.cssText = "overflow-y:auto;flex:1;padding:8px 12px;";

    // === Asset Relink Manager Section ===
    renderBrokenMediaSection(scrollArea);

    // === Components Section ===
    renderSection(scrollArea, "Components", () => {
      const comps = JSON.parse(editor.engine.get_components() || "[]") as Array<{
        id: number; name: string; variant_count: number; slots: string[];
      }>;
      return comps.filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery));
    }, (comp: any) => {
      const item = document.createElement("div");
      item.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;transition:background 0.15s;";
      item.addEventListener("mouseenter", () => item.style.background = "#2a2a2a");
      item.addEventListener("mouseleave", () => item.style.background = "");

      const icon = document.createElement("span");
      icon.innerHTML = icons.component || `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`;
      icon.style.cssText = "flex-shrink:0;display:flex;align-items:center;";

      const label = document.createElement("span");
      label.textContent = comp.name;
      label.style.cssText = "font-size:12px;color:#ddd;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

      const badge = document.createElement("span");
      badge.textContent = `${comp.variant_count}v`;
      badge.style.cssText = "font-size:10px;color:#666;flex-shrink:0;";

      item.appendChild(icon);
      item.appendChild(label);
      item.appendChild(badge);

      item.addEventListener("click", () => {
        editor.engine.push_undo();
        const id = editor.engine.create_instance(comp.id, 100, 100);
        if (id) {
          editor.engine.set_selection(new Uint32Array([id]));
          editor.requestRender();
        }
      });

      return item;
    });

    // === Color Styles Section ===
    renderSection(scrollArea, "Color Styles", () => {
      const styles = JSON.parse(editor.engine.list_color_styles() || "[]") as Array<{
        id: number; name: string; r: number; g: number; b: number; a: number;
      }>;
      return styles.filter(s => !searchQuery || s.name.toLowerCase().includes(searchQuery));
    }, (style: any) => {
      const item = document.createElement("div");
      item.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;transition:background 0.15s;";
      item.addEventListener("mouseenter", () => item.style.background = "#2a2a2a");
      item.addEventListener("mouseleave", () => item.style.background = "");

      const swatch = document.createElement("div");
      swatch.style.cssText = `width:20px;height:20px;border-radius:4px;flex-shrink:0;border:1px solid #444;background:rgba(${style.r},${style.g},${style.b},${style.a});`;

      const label = document.createElement("span");
      label.textContent = style.name;
      label.style.cssText = "font-size:12px;color:#ddd;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

      const hex = document.createElement("span");
      hex.textContent = `#${style.r.toString(16).padStart(2,"0")}${style.g.toString(16).padStart(2,"0")}${style.b.toString(16).padStart(2,"0")}`;
      hex.style.cssText = "font-size:10px;color:#666;flex-shrink:0;font-family:monospace;";

      item.appendChild(swatch);
      item.appendChild(label);
      item.appendChild(hex);

      item.addEventListener("click", () => {
        const sel = editor.engine.get_selection();
        if (sel.length > 0) {
          editor.engine.push_undo();
          for (const nid of sel) {
            editor.engine.apply_color_style(nid, style.id);
          }
          editor.requestRender();
        }
      });

      return item;
    });

    // === Text Styles Section ===
    renderSection(scrollArea, "Text Styles", () => {
      const styles = JSON.parse(editor.engine.list_text_styles() || "[]") as Array<{
        id: number; name: string; font_family: string; font_size: number;
        font_weight: number; font_style: string;
      }>;
      return styles.filter(s => !searchQuery || s.name.toLowerCase().includes(searchQuery));
    }, (style: any) => {
      const item = document.createElement("div");
      item.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;transition:background 0.15s;";
      item.addEventListener("mouseenter", () => item.style.background = "#2a2a2a");
      item.addEventListener("mouseleave", () => item.style.background = "");

      const preview = document.createElement("span");
      preview.textContent = "Ag";
      preview.style.cssText = `font-family:'${style.font_family}',sans-serif;font-size:16px;font-weight:${style.font_weight};font-style:${style.font_style === "Italic" ? "italic" : "normal"};color:#aaa;width:28px;text-align:center;flex-shrink:0;`;

      const info = document.createElement("div");
      info.style.cssText = "flex:1;overflow:hidden;";
      const nameEl = document.createElement("div");
      nameEl.textContent = style.name;
      nameEl.style.cssText = "font-size:12px;color:#ddd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      const detailEl = document.createElement("div");
      detailEl.textContent = `${style.font_family} ${style.font_weight} / ${style.font_size}px`;
      detailEl.style.cssText = "font-size:10px;color:#666;";
      info.appendChild(nameEl);
      info.appendChild(detailEl);

      item.appendChild(preview);
      item.appendChild(info);

      item.addEventListener("click", () => {
        const sel = editor.engine.get_selection();
        if (sel.length > 0) {
          editor.engine.push_undo();
          for (const nid of sel) {
            editor.engine.apply_text_style(nid, style.id);
          }
          editor.requestRender();
        }
      });

      return item;
    });

    container.appendChild(scrollArea);
  }

  function renderBrokenMediaSection(parent: HTMLElement) {
    const section = document.createElement("div");
    section.style.cssText = "margin-bottom:16px;border:1px solid #333;border-radius:8px;background:#20202b;";

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid #2f2f42;";
    header.innerHTML = `<span style="font-size:11px;font-weight:700;color:#fca5a5;letter-spacing:.4px;text-transform:uppercase;">Asset Relink Manager</span>`;

    const scanBtn = document.createElement("button");
    scanBtn.textContent = scanning ? "Scanning…" : "Scan";
    scanBtn.disabled = scanning;
    scanBtn.style.cssText = "font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid #4b5563;background:#1f2937;color:#dbeafe;cursor:pointer;";
    scanBtn.addEventListener("click", async () => {
      scanning = true;
      refresh();
      brokenMedia = await detectBrokenMedia();
      scanning = false;
      refresh();
    });
    header.appendChild(scanBtn);
    section.appendChild(header);

    const body = document.createElement("div");
    body.style.cssText = "padding:8px 10px;";
    if (scanning) {
      body.innerHTML = `<div style="font-size:11px;color:#9ca3af;">Scanning image/video sources…</div>`;
    } else if (brokenMedia.length === 0) {
      body.innerHTML = `<div style="font-size:11px;color:#9ca3af;">No broken media detected (run Scan to refresh).</div>`;
    } else {
      const summary = document.createElement("div");
      summary.style.cssText = "font-size:11px;color:#fca5a5;margin-bottom:8px;";
      summary.textContent = `${brokenMedia.length} broken media node(s) detected`;
      body.appendChild(summary);

      const mapRow = document.createElement("div");
      mapRow.style.cssText = "display:flex;gap:6px;margin-bottom:8px;";
      const fromInput = document.createElement("input");
      fromInput.placeholder = "Find path prefix";
      fromInput.style.cssText = "flex:1;min-width:0;background:#111827;border:1px solid #374151;border-radius:6px;padding:6px 8px;color:#e5e7eb;font-size:11px;";
      const toInput = document.createElement("input");
      toInput.placeholder = "Replace with";
      toInput.style.cssText = fromInput.style.cssText;
      const relinkAllBtn = document.createElement("button");
      relinkAllBtn.textContent = "Relink all";
      relinkAllBtn.style.cssText = "font-size:11px;padding:6px 8px;border-radius:6px;border:1px solid #2563eb;background:#1d4ed8;color:#dbeafe;cursor:pointer;";
      relinkAllBtn.addEventListener("click", () => {
        const from = fromInput.value.trim();
        const to = toInput.value.trim();
        if (!from || !to) return;
        editor.engine.push_undo();
        for (const item of brokenMedia) {
          if (!item.src.includes(from)) continue;
          const next = item.src.replace(from, to);
          if (item.kind === "Image") (editor.engine as any).set_image_src?.(BigInt(item.id), next);
          else (editor.engine as any).set_video_src?.(BigInt(item.id), next);
        }
        brokenMedia = [];
        refresh();
        editor.requestRender();
      });
      mapRow.append(fromInput, toInput, relinkAllBtn);
      body.appendChild(mapRow);

      const list = document.createElement("div");
      list.style.cssText = "max-height:160px;overflow:auto;border:1px solid #34344d;border-radius:6px;";
      for (const item of brokenMedia.slice(0, 40)) {
        const row = document.createElement("div");
        row.style.cssText = "padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.05);";
        row.innerHTML = `<div style="font-size:11px;color:#f3f4f6;">${item.name} <span style="color:#94a3b8">(${item.kind} #${item.id})</span></div><div style="font-size:10px;color:#fca5a5">${item.reason}</div><div style="font-size:10px;color:#9ca3af;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(item.src || "(empty)")}</div>`;
        list.appendChild(row);
      }
      body.appendChild(list);
    }
    section.appendChild(body);
    parent.appendChild(section);
  }

  async function detectBrokenMedia(): Promise<MediaItem[]> {
    const items: MediaItem[] = [];
    const layers = safeParse((editor.engine as any).get_layer_list?.() || "[]");
    const ids = collectLayerIds(layers);
    for (const id of ids) {
      const raw = (editor.engine as any).get_node_json?.(BigInt(id));
      if (!raw) continue;
      const node = safeParse(raw);
      if (!node) continue;
      const kind = String(node.kind || "");
      if (kind !== "Image" && kind !== "Video") continue;
      const src = kind === "Image"
        ? String((editor.engine as any).get_image_src?.(BigInt(id)) || "")
        : String((editor.engine as any).get_video_src?.(BigInt(id)) || "");
      const reason = await getBrokenReason(src, kind);
      if (reason) items.push({ id, name: String(node.name || `${kind} ${id}`), kind: kind as "Image" | "Video", src, reason });
    }
    return items;
  }

  async function getBrokenReason(src: string, kind: "Image" | "Video"): Promise<string | null> {
    const s = src.trim();
    if (!s) return "Source is empty";
    if (/^file:\/\//i.test(s)) return "Local file:// path is not portable";
    if (/^[A-Za-z]:\\/.test(s)) return "Absolute OS path is not portable";
    if (!/^https?:\/\//i.test(s) && !/^data:/i.test(s) && !/^blob:/i.test(s) && !s.startsWith("/")) {
      return "Relative path may be broken after file move";
    }
    try {
      if (kind === "Image") {
        await testImageLoad(s);
      }
    } catch {
      return "Load failed";
    }
    return null;
  }

  function testImageLoad(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const t = window.setTimeout(() => reject(new Error("timeout")), 1500);
      img.onload = () => { window.clearTimeout(t); resolve(); };
      img.onerror = () => { window.clearTimeout(t); reject(new Error("error")); };
      img.src = src;
    });
  }

  function collectLayerIds(items: any[]): number[] {
    const out: number[] = [];
    const walk = (arr: any[]) => {
      for (const item of arr || []) {
        const id = Number(item?.id || 0);
        if (id > 0) out.push(id);
        if (Array.isArray(item?.children)) walk(item.children);
      }
    };
    walk(items);
    return out;
  }

  function safeParse(raw: string): any {
    try { return JSON.parse(raw); } catch { return null; }
  }

  function renderSection<T>(
    parent: HTMLElement,
    title: string,
    getItems: () => T[],
    renderItem: (item: T) => HTMLElement,
  ) {
    const items = getItems();

    const section = document.createElement("div");
    section.style.cssText = "margin-bottom:16px;";

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:4px 0;margin-bottom:4px;";
    const titleEl = document.createElement("span");
    titleEl.textContent = title;
    titleEl.style.cssText = "font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px;";
    const countEl = document.createElement("span");
    countEl.textContent = `${items.length}`;
    countEl.style.cssText = "font-size:10px;color:#555;";
    header.appendChild(titleEl);
    header.appendChild(countEl);
    section.appendChild(header);

    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = `No ${title.toLowerCase()}`;
      empty.style.cssText = "font-size:11px;color:#555;padding:8px;text-align:center;";
      section.appendChild(empty);
    } else {
      for (const item of items) {
        section.appendChild(renderItem(item));
      }
    }

    parent.appendChild(section);
  }

  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Refresh when selection changes
  editor.onSelection(() => refresh());

  refresh();
}
