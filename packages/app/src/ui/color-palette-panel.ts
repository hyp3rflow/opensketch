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

/**
 * Color Palette panel — right pane tab.
 * Extracts scene colors, generates harmony palettes, checks WCAG contrast.
 */
export function setupColorPalettePanel(container: HTMLElement, editor: Editor) {
  let selectedHex: string | null = null;
  let view: "colors" | "palettes" | "contrast" | "theme" = "colors";
  let themeHex: string = "#3b82f6";

  function refresh() {
    container.innerHTML = "";

    // Tab bar
    const tabBar = document.createElement("div");
    tabBar.style.cssText = "display:flex;border-bottom:1px solid #333;";
    for (const tab of ["colors", "palettes", "theme", "contrast"] as const) {
      const btn = document.createElement("button");
      btn.textContent = tab === "colors" ? "Colors" : tab === "palettes" ? "Harmonies" : tab === "theme" ? "Theme" : "Contrast";
      btn.style.cssText = `flex:1;padding:8px 4px;border:none;background:${view === tab ? "#333" : "transparent"};color:${view === tab ? "#fff" : "#888"};font-size:11px;cursor:pointer;border-bottom:2px solid ${view === tab ? "#4a90d9" : "transparent"};`;
      btn.onclick = () => { view = tab; refresh(); };
      tabBar.appendChild(btn);
    }
    container.appendChild(tabBar);

    const content = document.createElement("div");
    content.style.cssText = "padding:12px;overflow-y:auto;max-height:calc(100% - 36px);";
    container.appendChild(content);

    if (view === "colors") renderSceneColors(content);
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
