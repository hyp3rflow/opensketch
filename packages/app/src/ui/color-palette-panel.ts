import type { Editor } from "../editor";
import { icons } from "./icons";

interface ColorEntry {
  color: { r: number; g: number; b: number; a: number };
  hex: string;
  count: number;
  source: string;
}
interface PaletteColor { hex: string; r: number; g: number; b: number }
interface Palette { name: string; colors: PaletteColor[] }
interface ContrastPair {
  color1: string; color2: string; ratio: number;
  aa_normal: boolean; aa_large: boolean; aaa_normal: boolean; aaa_large: boolean;
}
interface ExtractedColor { hex: string; r: number; g: number; b: number; pct: number }

// ---------- k-means color extraction ----------
function rgbDist(a: number[], b: number[]): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

function kMeans(pixels: number[][], k: number, maxIter = 20): number[][] {
  if (pixels.length === 0) return [];
  // Init centroids using k-means++ seeding
  const centroids: number[][] = [pixels[Math.floor(Math.random() * pixels.length)].slice()];
  for (let i = 1; i < k; i++) {
    const dists = pixels.map(p => Math.min(...centroids.map(c => rgbDist(p, c))));
    const total = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let j = 0; j < dists.length; j++) {
      r -= dists[j];
      if (r <= 0) { centroids.push(pixels[j].slice()); break; }
    }
    if (centroids.length <= i) centroids.push(pixels[Math.floor(Math.random() * pixels.length)].slice());
  }

  for (let iter = 0; iter < maxIter; iter++) {
    const clusters: number[][][] = Array.from({ length: k }, () => []);
    for (const p of pixels) {
      let best = 0, bestD = Infinity;
      for (let i = 0; i < k; i++) {
        const d = rgbDist(p, centroids[i]);
        if (d < bestD) { bestD = d; best = i; }
      }
      clusters[best].push(p);
    }
    let moved = false;
    for (let i = 0; i < k; i++) {
      if (clusters[i].length === 0) continue;
      const avg = [0, 0, 0];
      for (const p of clusters[i]) { avg[0] += p[0]; avg[1] += p[1]; avg[2] += p[2]; }
      const n = clusters[i].length;
      const newC = [Math.round(avg[0] / n), Math.round(avg[1] / n), Math.round(avg[2] / n)];
      if (rgbDist(newC, centroids[i]) > 1) moved = true;
      centroids[i] = newC;
    }
    if (!moved) break;
  }
  return centroids;
}

function extractColorsFromImage(imgEl: HTMLImageElement, count = 6): ExtractedColor[] {
  const size = 64; // Sample at 64x64 for performance
  const cvs = document.createElement("canvas");
  cvs.width = size; cvs.height = size;
  const ctx = cvs.getContext("2d")!;
  ctx.drawImage(imgEl, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;

  const pixels: number[][] = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue; // skip transparent
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (pixels.length === 0) return [];

  const centroids = kMeans(pixels, Math.min(count, pixels.length));

  // Count pixels per cluster for percentage
  const counts = new Array(centroids.length).fill(0);
  for (const p of pixels) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < centroids.length; i++) {
      const d = rgbDist(p, centroids[i]);
      if (d < bestD) { bestD = d; best = i; }
    }
    counts[best]++;
  }
  const total = pixels.length;

  return centroids.map((c, i) => ({
    r: c[0], g: c[1], b: c[2],
    hex: `#${c.map(v => v.toString(16).padStart(2, "0")).join("")}`,
    pct: Math.round((counts[i] / total) * 100),
  })).sort((a, b) => b.pct - a.pct);
}

/**
 * Color Palette panel — right pane tab.
 * Extracts scene colors, generates harmony palettes, checks WCAG contrast, extracts dominant colors from images.
 */
export function setupColorPalettePanel(container: HTMLElement, editor: Editor) {
  let selectedHex: string | null = null;
  let view: "colors" | "palettes" | "contrast" | "theme" | "extract" = "colors";
  let themeHex: string = "#3b82f6";
  let extractedColors: ExtractedColor[] = [];
  let extracting = false;

  function refresh() {
    container.innerHTML = "";

    // Tab bar
    const tabBar = document.createElement("div");
    tabBar.style.cssText = "display:flex;border-bottom:1px solid #333;";
    for (const tab of ["colors", "extract", "palettes", "theme", "contrast"] as const) {
      const btn = document.createElement("button");
      btn.textContent = tab === "colors" ? "Colors" : tab === "extract" ? "Extract" : tab === "palettes" ? "Harmonies" : tab === "theme" ? "Theme" : "Contrast";
      btn.style.cssText = `flex:1;padding:8px 4px;border:none;background:${view === tab ? "#333" : "transparent"};color:${view === tab ? "#fff" : "#888"};font-size:11px;cursor:pointer;border-bottom:2px solid ${view === tab ? "#4a90d9" : "transparent"};`;
      btn.onclick = () => { view = tab; refresh(); };
      tabBar.appendChild(btn);
    }
    container.appendChild(tabBar);

    const content = document.createElement("div");
    content.style.cssText = "padding:12px;overflow-y:auto;max-height:calc(100% - 36px);";
    container.appendChild(content);

    if (view === "colors") renderSceneColors(content);
    else if (view === "extract") renderExtract(content);
    else if (view === "palettes") renderPalettes(content);
    else if (view === "theme") renderTheme(content);
    else renderContrast(content);
  }

  function renderSceneColors(el: HTMLElement) {
    let entries: ColorEntry[];
    try {
      entries = JSON.parse(editor.engine.extract_colors());
    } catch { entries = []; }

    if (entries.length === 0) {
      el.innerHTML = `<div style="text-align:center;color:#666;padding-top:40px;font-size:12px;">No colors in scene</div>`;
      return;
    }

    el.innerHTML = `<div style="font-size:11px;color:#888;margin-bottom:8px;">${entries.length} unique color${entries.length > 1 ? "s" : ""} — click to generate harmonies</div>`;

    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(4,1fr);gap:6px;";

    for (const entry of entries) {
      const swatch = document.createElement("div");
      swatch.style.cssText = `aspect-ratio:1;border-radius:6px;cursor:pointer;background:${entry.hex};border:2px solid ${selectedHex === entry.hex ? "#fff" : "transparent"};transition:border-color 0.15s;position:relative;`;
      swatch.title = `${entry.hex} (${entry.source} ×${entry.count})`;

      // Count badge
      if (entry.count > 1) {
        const badge = document.createElement("span");
        badge.textContent = String(entry.count);
        badge.style.cssText = "position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.6);color:#fff;font-size:9px;padding:1px 4px;border-radius:4px;";
        swatch.appendChild(badge);
      }

      swatch.onclick = () => {
        selectedHex = entry.hex;
        view = "palettes";
        refresh();
      };
      swatch.onmouseenter = () => { swatch.style.borderColor = "#fff"; };
      swatch.onmouseleave = () => { swatch.style.borderColor = selectedHex === entry.hex ? "#fff" : "transparent"; };

      // Click to apply
      swatch.oncontextmenu = (e) => {
        e.preventDefault();
        const sel = Array.from(editor.engine.get_selection()).map(Number);
        if (sel.length === 0) return;
        for (const id of sel) {
          editor.engine.set_fill_color(BigInt(id), entry.color.r, entry.color.g, entry.color.b, entry.color.a);
        }
        editor.render();
      };

      grid.appendChild(swatch);
    }
    el.appendChild(grid);

    el.innerHTML += `<div style="font-size:10px;color:#555;margin-top:8px;">Right-click swatch to apply to selection</div>`;
  }

  function renderPalettes(el: HTMLElement) {
    if (!selectedHex) {
      el.innerHTML = `<div style="text-align:center;color:#666;padding-top:40px;font-size:12px;">Select a color from Scene Colors tab</div>`;
      return;
    }

    // Color picker
    const pickerRow = document.createElement("div");
    pickerRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:12px;";
    const swatch = document.createElement("div");
    swatch.style.cssText = `width:32px;height:32px;border-radius:6px;background:${selectedHex};border:1px solid #555;`;
    const input = document.createElement("input");
    input.type = "text";
    input.value = selectedHex;
    input.style.cssText = "flex:1;padding:6px 8px;border-radius:6px;border:1px solid #444;background:#2a2a2a;color:#ccc;font-size:12px;font-family:monospace;";
    input.onchange = () => {
      const v = input.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        selectedHex = v;
        refresh();
      }
    };
    pickerRow.appendChild(swatch);
    pickerRow.appendChild(input);
    el.appendChild(pickerRow);

    let palettes: Palette[];
    try {
      palettes = JSON.parse(editor.engine.generate_palettes(selectedHex));
    } catch { palettes = []; }

    for (const palette of palettes) {
      const section = document.createElement("div");
      section.style.cssText = "margin-bottom:12px;";

      const title = document.createElement("div");
      title.textContent = palette.name;
      title.style.cssText = "font-size:11px;color:#aaa;margin-bottom:4px;font-weight:500;";
      section.appendChild(title);

      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:4px;";

      for (const c of palette.colors) {
        const s = document.createElement("div");
        s.style.cssText = `flex:1;height:32px;border-radius:4px;background:${c.hex};cursor:pointer;border:2px solid transparent;transition:border-color 0.15s;`;
        s.title = c.hex;
        s.onmouseenter = () => { s.style.borderColor = "#fff"; };
        s.onmouseleave = () => { s.style.borderColor = "transparent"; };
        s.onclick = () => {
          const sel = Array.from(editor.engine.get_selection()).map(Number);
          if (sel.length === 0) {
            navigator.clipboard.writeText(c.hex);
            return;
          }
          for (const id of sel) {
            editor.engine.set_fill_color(BigInt(id), c.r, c.g, c.b, 1.0);
          }
          editor.render();
        };
        row.appendChild(s);
      }
      section.appendChild(row);
      el.appendChild(section);
    }

    el.innerHTML += `<div style="font-size:10px;color:#555;margin-top:4px;">Click color to apply to selection (or copy hex if nothing selected)</div>`;
  }

  function renderTheme(el: HTMLElement) {
    // Brand color input
    const inputRow = document.createElement("div");
    inputRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:12px;";
    const colorPicker = document.createElement("input");
    colorPicker.type = "color";
    colorPicker.value = themeHex;
    colorPicker.style.cssText = "width:36px;height:36px;border:none;background:none;cursor:pointer;padding:0;";
    colorPicker.oninput = () => { themeHex = colorPicker.value; hexInput.value = themeHex; };
    colorPicker.onchange = () => { themeHex = colorPicker.value; hexInput.value = themeHex; refresh(); };
    const hexInput = document.createElement("input");
    hexInput.type = "text";
    hexInput.value = themeHex;
    hexInput.placeholder = "#3b82f6";
    hexInput.style.cssText = "flex:1;padding:6px 8px;border-radius:6px;border:1px solid #444;background:#2a2a2a;color:#ccc;font-size:12px;font-family:monospace;";
    hexInput.onchange = () => {
      const v = hexInput.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) { themeHex = v; colorPicker.value = v; refresh(); }
    };
    const genBtn = document.createElement("button");
    genBtn.textContent = "Generate";
    genBtn.style.cssText = "padding:6px 12px;border-radius:6px;border:none;background:#4a90d9;color:#fff;font-size:11px;cursor:pointer;font-weight:500;";
    genBtn.onclick = () => refresh();
    inputRow.appendChild(colorPicker);
    inputRow.appendChild(hexInput);
    inputRow.appendChild(genBtn);
    el.appendChild(inputRow);

    // Generate theme
    interface ThemeColor { role: string; hex: string; r: number; g: number; b: number }
    interface ThemeGroup { name: string; colors: ThemeColor[] }
    interface DesignTheme { name: string; brand_hex: string; groups: ThemeGroup[] }

    let theme: DesignTheme | null = null;
    try {
      const raw = (editor.engine as any).generate_design_theme(themeHex);
      theme = JSON.parse(raw);
    } catch { /* */ }

    if (!theme) {
      el.innerHTML += `<div style="text-align:center;color:#666;padding-top:20px;font-size:12px;">Enter a valid hex color above</div>`;
      return;
    }

    for (const group of theme.groups) {
      const section = document.createElement("div");
      section.style.cssText = "margin-bottom:10px;";

      const title = document.createElement("div");
      title.style.cssText = "font-size:10px;color:#888;margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;";
      title.textContent = group.name;
      section.appendChild(title);

      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:2px;";

      for (const c of group.colors) {
        const s = document.createElement("div");
        s.style.cssText = `flex:1;height:28px;background:${c.hex};cursor:pointer;position:relative;`;
        if (c === group.colors[0]) s.style.borderRadius = "4px 0 0 4px";
        if (c === group.colors[group.colors.length - 1]) s.style.borderRadius = "0 4px 4px 0";
        s.title = `${c.role}: ${c.hex}`;
        s.onclick = () => {
          const sel = Array.from(editor.engine.get_selection()).map(Number);
          if (sel.length === 0) { navigator.clipboard.writeText(c.hex); return; }
          for (const id of sel) {
            editor.engine.set_fill_color(BigInt(id), c.r, c.g, c.b, 1.0);
          }
          editor.render();
        };
        row.appendChild(s);
      }
      section.appendChild(row);
      el.appendChild(section);
    }

    // Apply all primary-500 to selection hint
    el.innerHTML += `<div style="font-size:10px;color:#555;margin-top:8px;">Click any swatch to apply to selection (or copy hex). Enter your brand color to generate a full design system palette.</div>`;
  }

  function renderExtract(el: HTMLElement) {
    // Find image nodes in scene
    const sel = Array.from(editor.engine.get_selection()).map(Number);
    let imageNodes: { id: number; name: string; src: string }[] = [];
    try {
      const allNodes = JSON.parse(editor.engine.get_all_nodes());
      imageNodes = allNodes.filter((n: any) => n.kind === "Image" && n.image_src).map((n: any) => ({
        id: n.id, name: n.name || `Image ${n.id}`, src: n.image_src,
      }));
    } catch { /* */ }

    // Header
    const header = document.createElement("div");
    header.style.cssText = "font-size:11px;color:#888;margin-bottom:10px;";
    header.textContent = `Extract dominant colors from image nodes using k-means clustering`;
    el.appendChild(header);

    if (imageNodes.length === 0) {
      el.innerHTML += `<div style="text-align:center;color:#666;padding-top:30px;font-size:12px;">No image nodes in scene.<br>Add an image to extract colors.</div>`;
      return;
    }

    // If selection contains an image, show it first
    const selectedImages = imageNodes.filter(n => sel.includes(n.id));
    const displayNodes = selectedImages.length > 0 ? selectedImages : imageNodes.slice(0, 5);

    for (const imgNode of displayNodes) {
      const section = document.createElement("div");
      section.style.cssText = "margin-bottom:14px;padding:8px;background:#1e1e1e;border-radius:8px;";

      const nameEl = document.createElement("div");
      nameEl.style.cssText = "font-size:11px;color:#ccc;margin-bottom:6px;font-weight:500;display:flex;align-items:center;gap:6px;";
      nameEl.textContent = imgNode.name;
      section.appendChild(nameEl);

      const extractBtn = document.createElement("button");
      extractBtn.textContent = extracting ? "Extracting…" : "Extract Colors";
      extractBtn.style.cssText = "padding:5px 12px;border-radius:6px;border:none;background:#4a90d9;color:#fff;font-size:11px;cursor:pointer;font-weight:500;margin-bottom:8px;";
      extractBtn.disabled = extracting;
      extractBtn.onclick = () => {
        extracting = true;
        refresh();
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          extractedColors = extractColorsFromImage(img, 8);
          extracting = false;
          refresh();
        };
        img.onerror = () => {
          extracting = false;
          extractedColors = [];
          refresh();
        };
        img.src = imgNode.src;
      };
      section.appendChild(extractBtn);

      el.appendChild(section);
    }

    // Show extracted colors
    if (extractedColors.length > 0) {
      const resultSection = document.createElement("div");
      resultSection.style.cssText = "margin-top:4px;";

      const title = document.createElement("div");
      title.style.cssText = "font-size:11px;color:#aaa;margin-bottom:8px;font-weight:500;";
      title.textContent = `Extracted ${extractedColors.length} dominant colors`;
      resultSection.appendChild(title);

      const grid = document.createElement("div");
      grid.style.cssText = "display:flex;flex-direction:column;gap:4px;";

      for (const c of extractedColors) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:8px;padding:4px 8px;background:#1e1e1e;border-radius:6px;cursor:pointer;";
        row.onmouseenter = () => { row.style.background = "#2a2a2a"; };
        row.onmouseleave = () => { row.style.background = "#1e1e1e"; };

        const swatch = document.createElement("div");
        swatch.style.cssText = `width:24px;height:24px;border-radius:4px;background:${c.hex};border:1px solid #555;flex-shrink:0;`;

        const info = document.createElement("div");
        info.style.cssText = "flex:1;";
        info.innerHTML = `<span style="font-size:12px;font-family:monospace;color:#ccc;">${c.hex}</span><span style="font-size:10px;color:#666;margin-left:6px;">${c.pct}%</span>`;

        const applyBtn = document.createElement("button");
        applyBtn.textContent = "Apply";
        applyBtn.title = "Apply to selection";
        applyBtn.style.cssText = "padding:3px 8px;border-radius:4px;border:none;background:#333;color:#aaa;font-size:10px;cursor:pointer;";
        applyBtn.onclick = (e) => {
          e.stopPropagation();
          const s = Array.from(editor.engine.get_selection()).map(Number);
          for (const id of s) {
            editor.engine.set_fill_color(BigInt(id), c.r, c.g, c.b, 1.0);
          }
          editor.render();
        };

        const saveBtn = document.createElement("button");
        saveBtn.textContent = "Save";
        saveBtn.title = "Save as color style";
        saveBtn.style.cssText = "padding:3px 8px;border-radius:4px;border:none;background:#333;color:#aaa;font-size:10px;cursor:pointer;";
        saveBtn.onclick = (e) => {
          e.stopPropagation();
          editor.engine.add_color_style(`Extracted ${c.hex}`, c.r, c.g, c.b, 1.0);
          saveBtn.textContent = "✓";
          saveBtn.style.color = "#4caf50";
          setTimeout(() => { saveBtn.textContent = "Save"; saveBtn.style.color = "#aaa"; }, 1500);
        };

        // Click row to copy hex
        row.onclick = () => { navigator.clipboard.writeText(c.hex); };

        row.appendChild(swatch);
        row.appendChild(info);
        row.appendChild(applyBtn);
        row.appendChild(saveBtn);
        grid.appendChild(row);
      }
      resultSection.appendChild(grid);

      // Save all as styles button
      const saveAllBtn = document.createElement("button");
      saveAllBtn.textContent = "Save All as Color Styles";
      saveAllBtn.style.cssText = "width:100%;padding:8px;border-radius:6px;border:1px solid #444;background:#2a2a2a;color:#ccc;font-size:11px;cursor:pointer;margin-top:10px;";
      saveAllBtn.onclick = () => {
        for (const c of extractedColors) {
          editor.engine.add_color_style(`Extracted ${c.hex}`, c.r, c.g, c.b, 1.0);
        }
        saveAllBtn.textContent = `✓ Saved ${extractedColors.length} styles`;
        saveAllBtn.style.color = "#4caf50";
        setTimeout(() => { saveAllBtn.textContent = "Save All as Color Styles"; saveAllBtn.style.color = "#ccc"; }, 2000);
      };
      resultSection.appendChild(saveAllBtn);

      el.appendChild(resultSection);

      el.innerHTML += `<div style="font-size:10px;color:#555;margin-top:8px;">Click row to copy hex • Apply to fill selection • Save to color styles library</div>`;
    }
  }

  function renderContrast(el: HTMLElement) {
    let pairs: ContrastPair[];
    try {
      pairs = JSON.parse(editor.engine.check_color_contrast());
    } catch { pairs = []; }

    if (pairs.length === 0) {
      el.innerHTML = `<div style="text-align:center;color:#666;padding-top:40px;font-size:12px;">Need 2+ colors in scene to check contrast</div>`;
      return;
    }

    el.innerHTML = `<div style="font-size:11px;color:#888;margin-bottom:8px;">WCAG Contrast Checks (${pairs.length} pairs)</div>`;

    const list = document.createElement("div");
    list.style.cssText = "display:flex;flex-direction:column;gap:6px;";

    for (const pair of pairs) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:6px;padding:6px 8px;background:#1e1e1e;border-radius:6px;";

      const s1 = document.createElement("div");
      s1.style.cssText = `width:20px;height:20px;border-radius:4px;background:${pair.color1};border:1px solid #555;`;
      const s2 = document.createElement("div");
      s2.style.cssText = `width:20px;height:20px;border-radius:4px;background:${pair.color2};border:1px solid #555;`;

      const ratio = document.createElement("span");
      ratio.textContent = `${pair.ratio.toFixed(2)}:1`;
      ratio.style.cssText = `font-size:12px;font-weight:600;font-family:monospace;color:${pair.aa_normal ? "#4caf50" : pair.aa_large ? "#ff9800" : "#f44336"};min-width:50px;`;

      const badges = document.createElement("span");
      badges.style.cssText = "display:flex;gap:3px;flex:1;justify-content:flex-end;";
      const badge = (text: string, pass: boolean) => {
        const b = document.createElement("span");
        b.textContent = text;
        b.style.cssText = `font-size:9px;padding:2px 4px;border-radius:3px;background:${pass ? "rgba(76,175,80,0.2)" : "rgba(244,67,54,0.15)"};color:${pass ? "#4caf50" : "#f44336"};`;
        return b;
      };
      badges.appendChild(badge("AA", pair.aa_normal));
      badges.appendChild(badge("AA+", pair.aa_large));
      badges.appendChild(badge("AAA", pair.aaa_normal));

      row.appendChild(s1);
      row.appendChild(s2);
      row.appendChild(ratio);
      row.appendChild(badges);
      list.appendChild(row);
    }
    el.appendChild(list);
  }

  return { refresh };
}
