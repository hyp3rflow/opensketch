import type { Editor } from "../editor";
import { icons } from "./icons";
import { createExportPresetsSection } from "./export-presets";
import { openComponentSwapDialog } from "./component-search";
import { renderStyleVersioningSection } from "./style-versioning";
import { createEasingEditor } from "./easing-editor";
import { createTokenThemeSwitcher, createTokenBindingSection } from "./token-panel";
import { createNodeLinksSection } from "./node-links";
import { t } from "./i18n";
import { createStyleTransferSection } from "./style-transfer";
import { renderScrollAnimSection } from "./scroll-animation";
import { openARQuickLook } from "./ar-quicklook";
import { downloadDesignSystemDocs } from "./design-system-docs";

// Stage 4: Google Fonts list
const googleFonts = [
  "Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins",
  "Raleway", "Nunito", "Ubuntu", "Playfair Display", "Merriweather",
  "Source Sans 3", "Oswald", "Noto Sans", "Noto Sans KR", "Noto Sans JP",
  "PT Sans", "Rubik", "Work Sans", "Fira Sans", "DM Sans",
  "Quicksand", "Inconsolata", "JetBrains Mono", "Fira Code",
  "IBM Plex Sans", "IBM Plex Mono", "Space Grotesk", "Outfit", "Pretendard",
];

const loadedFonts = new Set<string>(["Inter", "system-ui", "Arial", "Helvetica", "Georgia", "Times New Roman", "Courier New", "Menlo", "Monaco"]);

async function loadGoogleFont(family: string, editor: Editor) {
  if (loadedFonts.has(family)) return;
  loadedFonts.add(family);
  try {
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&display=swap`;
    const resp = await fetch(url);
    const css = await resp.text();
    // Extract font-face declarations and load via FontFace API
    const faceRegex = /@font-face\s*\{[^}]*src:\s*url\(([^)]+)\)[^}]*font-weight:\s*(\d+)[^}]*font-style:\s*(\w+)[^}]*/g;
    let match;
    const promises: Promise<void>[] = [];
    while ((match = faceRegex.exec(css)) !== null) {
      const fontUrl = match[1];
      const weight = match[2] || "400";
      const style = match[3] || "normal";
      const face = new FontFace(family, `url(${fontUrl})`, { weight, style });
      promises.push(face.load().then((loaded) => { document.fonts.add(loaded); }));
    }
    // Fallback: if regex didn't match, inject as stylesheet
    if (promises.length === 0) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      document.head.appendChild(link);
      await new Promise((r) => { link.onload = r; setTimeout(r, 3000); });
    } else {
      await Promise.all(promises);
    }
    editor.requestRender();
  } catch (e) {
    console.warn(`Failed to load font: ${family}`, e);
  }
}

export function setupPropertiesPanel(container: HTMLElement, editor: Editor) {
  // Push undo once per property edit session (debounced)
  let undoPushed = false;
  function ensureUndo() {
    if (!undoPushed) {
      editor.engine.push_undo();
      undoPushed = true;
      // Reset after 500ms so next edit creates a new undo point
      setTimeout(() => { undoPushed = false; }, 500);
    }
  }

  // Intercept all change/input events to push undo before mutation
  container.addEventListener("change", () => ensureUndo(), true);
  container.addEventListener("input", () => ensureUndo(), true);

  function refresh(ids: number[]) {
    undoPushed = false;
    container.innerHTML = "";
    if (ids.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.style.cssText = "display:flex;flex-direction:column;align-items:center;padding-top:60px;color:#555;";
      emptyDiv.innerHTML = `
        <span style="opacity:0.4;margin-bottom:8px;">${icons.cursor}</span>
        <span style="font-size:11px;">${t("properties.selectElement")}</span>`;

      // Design Token Theme Switcher
      container.appendChild(createTokenThemeSwitcher(editor, () => refresh(ids)));

      // Styles Library section
      const libSection = document.createElement("div");
      libSection.style.cssText = "width:100%;padding:20px 16px;margin-top:40px;border-top:1px solid #333;";
      const libTitle = document.createElement("div");
      libTitle.style.cssText = "font-size:11px;font-weight:600;color:#888;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;";
      libTitle.textContent = t("properties.stylesLibrary");
      libSection.appendChild(libTitle);

      const btnStyle = "padding:6px 12px;font-size:11px;border:1px solid #444;border-radius:4px;background:#2a2a2a;color:#ccc;cursor:pointer;flex:1;text-align:center;";
      const btnRow = document.createElement("div");
      btnRow.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;";

      const exportBtn = document.createElement("button");
      exportBtn.textContent = t("properties.exportStyles");
      exportBtn.style.cssText = btnStyle;
      exportBtn.onclick = () => {
        const json = editor.engine.export_styles();
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "opensketch-styles.json";
        a.click();
        URL.revokeObjectURL(url);
      };

      const importBtn = document.createElement("button");
      importBtn.textContent = t("properties.importStyles");
      importBtn.style.cssText = btnStyle;
      importBtn.onclick = () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const result = editor.engine.import_styles(reader.result as string);
            const [cc, tc] = result.split(",").map(Number);
            alert(`Imported ${cc} color style(s) and ${tc} text style(s).`);
            editor.requestRender();
          };
          reader.readAsText(file);
        };
        input.click();
      };

      const docsBtn = document.createElement("button");
      docsBtn.textContent = "Docs HTML";
      docsBtn.style.cssText = btnStyle;
      docsBtn.onclick = () => downloadDesignSystemDocs(editor);

      btnRow.appendChild(exportBtn);
      btnRow.appendChild(importBtn);
      btnRow.appendChild(docsBtn);
      libSection.appendChild(btnRow);
      emptyDiv.appendChild(libSection);

      // Style Versioning section
      import('../ui/style-versioning').then(({ createStyleVersioningPanel }) => {
        const vPanel = createStyleVersioningPanel(editor);
        emptyDiv.appendChild(vPanel);
      });

      // Design Tokens section
      const tokensSection = document.createElement("div");
      tokensSection.style.cssText = "width:100%;padding:12px 16px;border-top:1px solid #333;";
      const tokensTitle = document.createElement("div");
      tokensTitle.style.cssText = "font-size:11px;font-weight:600;color:#888;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;";
      tokensTitle.textContent = t("properties.designTokens");
      tokensSection.appendChild(tokensTitle);

      const tokenFormats = [
        { label: "CSS Variables", key: "css" },
        { label: "Tailwind", key: "tailwind" },
        { label: "SCSS", key: "scss" },
        { label: "W3C DTCG", key: "w3c" },
        { label: "Style Dictionary", key: "style-dictionary" },
      ];
      const tokenBtnRow = document.createElement("div");
      tokenBtnRow.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;";
      for (const fmt of tokenFormats) {
        const btn = document.createElement("button");
        btn.textContent = fmt.label;
        btn.style.cssText = btnStyle;
        btn.onclick = () => editor.downloadDesignTokens(fmt.key);
        tokenBtnRow.appendChild(btn);
      }
      tokensSection.appendChild(tokenBtnRow);
      emptyDiv.appendChild(tokensSection);

      // Style Versioning section
      renderStyleVersioningSection(emptyDiv, editor);

      // Canvas Background section
      const bgSection = document.createElement("div");
      bgSection.style.cssText = "width:100%;padding:12px 16px;border-top:1px solid #333;";
      const bgTitle = document.createElement("div");
      bgTitle.style.cssText = "font-size:11px;font-weight:600;color:#888;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;";
      bgTitle.textContent = t("properties.canvasBg");
      bgSection.appendChild(bgTitle);

      let bgSettings: { pattern: string; bg_color: string; pattern_color: string; spacing: number; opacity: number; dot_size: number };
      try { bgSettings = JSON.parse(editor.engine.get_bg_settings()); } catch { bgSettings = { pattern: "grid", bg_color: "1a1a1a", pattern_color: "ffffff", spacing: 50, opacity: 0.04, dot_size: 1.5 }; }

      const inputCss = "width:100%;padding:4px 6px;font-size:11px;border:1px solid #444;border-radius:4px;background:#2a2a2a;color:#ccc;box-sizing:border-box;";
      const labelCss = "font-size:10px;color:#666;margin-bottom:2px;";

      // Preset buttons
      const presetRow = document.createElement("div");
      presetRow.style.cssText = "display:flex;gap:4px;margin-bottom:10px;";
      const presets: [string, string, string, number][] = [
        ["White", "ffffff", "none", 0.04],
        ["Dark", "1a1a2e", "grid", 0.04],
        ["Transparent", "cccccc", "checkerboard", 0.5],
      ];
      for (const [label, bgCol, pat, opa] of presets) {
        const btn = document.createElement("button");
        const isActive = bgSettings.bg_color === bgCol && bgSettings.pattern === pat;
        btn.textContent = label;
        btn.style.cssText = `flex:1;padding:5px 4px;font-size:10px;border:1px solid ${isActive ? "#4f46e5" : "#444"};border-radius:4px;background:${isActive ? "rgba(79,70,229,0.15)" : "#2a2a2a"};color:${isActive ? "#818cf8" : "#ccc"};cursor:pointer;transition:all 0.15s;`;
        btn.addEventListener("mouseenter", () => { if (!isActive) { btn.style.borderColor = "#4f46e5"; btn.style.color = "#818cf8"; } });
        btn.addEventListener("mouseleave", () => { if (!isActive) { btn.style.borderColor = "#444"; btn.style.color = "#ccc"; } });
        btn.onclick = () => {
          editor.engine.push_undo();
          editor.engine.set_bg_color(bgCol);
          editor.engine.set_bg_pattern(pat);
          editor.engine.set_bg_opacity(opa);
          if (pat === "checkerboard") editor.engine.set_bg_pattern_color("888888");
          else editor.engine.set_bg_pattern_color("ffffff");
          editor.requestRender();
          refresh(ids);
        };
        presetRow.appendChild(btn);
      }
      bgSection.appendChild(presetRow);

      // Pattern type
      const patternRow = document.createElement("div");
      patternRow.style.cssText = "margin-bottom:8px;";
      const patternLabel = document.createElement("div");
      patternLabel.style.cssText = labelCss;
      patternLabel.textContent = t("properties.pattern");
      patternRow.appendChild(patternLabel);
      const patternSelect = document.createElement("select");
      patternSelect.style.cssText = inputCss;
      for (const opt of ["grid", "dots", "lines", "cross", "checkerboard", "none"]) {
        const o = document.createElement("option");
        o.value = opt; o.textContent = opt.charAt(0).toUpperCase() + opt.slice(1);
        if (opt === bgSettings.pattern) o.selected = true;
        patternSelect.appendChild(o);
      }
      patternSelect.onchange = () => { editor.engine.set_bg_pattern(patternSelect.value); editor.requestRender(); };
      patternRow.appendChild(patternSelect);
      bgSection.appendChild(patternRow);

      // Colors row
      const colorsRow = document.createElement("div");
      colorsRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;";
      for (const [label, val, setter] of [["BG Color", bgSettings.bg_color, "set_bg_color"], ["Pattern Color", bgSettings.pattern_color, "set_bg_pattern_color"]] as const) {
        const col = document.createElement("div");
        const lbl = document.createElement("div");
        lbl.style.cssText = labelCss; lbl.textContent = label;
        col.appendChild(lbl);
        const colorWrap = document.createElement("div");
        colorWrap.style.cssText = "display:flex;gap:4px;align-items:center;";
        const swatch = document.createElement("input");
        swatch.type = "color"; swatch.value = "#" + val;
        swatch.style.cssText = "width:24px;height:24px;border:1px solid #555;border-radius:4px;padding:0;cursor:pointer;background:none;";
        const hexInput = document.createElement("input");
        hexInput.value = val; hexInput.style.cssText = inputCss + "flex:1;";
        const update = (hex: string) => {
          const clean = hex.replace("#", "");
          (editor.engine as any)[setter](clean);
          editor.requestRender();
        };
        swatch.oninput = () => { hexInput.value = swatch.value.replace("#", ""); update(swatch.value); };
        hexInput.onchange = () => { swatch.value = "#" + hexInput.value; update(hexInput.value); };
        colorWrap.appendChild(swatch);
        colorWrap.appendChild(hexInput);
        col.appendChild(colorWrap);
        colorsRow.appendChild(col);
      }
      bgSection.appendChild(colorsRow);

      // Spacing + Opacity + Dot Size row
      const numRow = document.createElement("div");
      numRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:4px;";
      for (const [label, val, setter, min, max, step] of [
        ["Spacing", bgSettings.spacing, "set_bg_spacing", 5, 500, 5],
        ["Opacity", bgSettings.opacity, "set_bg_opacity", 0, 1, 0.01],
        ["Dot Size", bgSettings.dot_size, "set_bg_dot_size", 0.5, 10, 0.5],
      ] as const) {
        const col = document.createElement("div");
        const lbl = document.createElement("div");
        lbl.style.cssText = labelCss; lbl.textContent = label;
        col.appendChild(lbl);
        const inp = document.createElement("input");
        inp.type = "number"; inp.value = String(val); inp.min = String(min); inp.max = String(max); inp.step = String(step);
        inp.style.cssText = inputCss;
        inp.onchange = () => { (editor.engine as any)[setter](parseFloat(inp.value) || val); editor.requestRender(); };
        col.appendChild(inp);
        numRow.appendChild(col);
      }
      bgSection.appendChild(numRow);
      emptyDiv.appendChild(bgSection);

      // Freehand / Ink settings
      if (editor.currentTool === "freehand") {
        const inkSection = document.createElement("div");
        inkSection.style.cssText = "width:100%;padding:12px 16px;border-top:1px solid #333;";

        const inkTitle = document.createElement("div");
        inkTitle.style.cssText = "font-size:11px;font-weight:600;color:#888;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;";
        inkTitle.textContent = "Ink Recognition";
        inkSection.appendChild(inkTitle);

        const settings = editor.getInkSettings();

        const recogRow = document.createElement("label");
        recogRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;font-size:11px;color:#ccc;";
        recogRow.textContent = "Shape recognition";
        const recogToggle = document.createElement("input");
        recogToggle.type = "checkbox";
        recogToggle.checked = !!settings.shapeRecognition;
        recogToggle.onchange = () => {
          editor.setInkShapeRecognition(recogToggle.checked);
          editor.requestRender();
        };
        recogRow.appendChild(recogToggle);
        inkSection.appendChild(recogRow);

        const simplifyWrap = document.createElement("div");
        simplifyWrap.style.cssText = "display:flex;flex-direction:column;gap:4px;";
        const simplifyLabel = document.createElement("div");
        simplifyLabel.style.cssText = "font-size:10px;color:#666;";
        simplifyLabel.textContent = "Path simplify tolerance";
        const simplifyInput = document.createElement("input");
        simplifyInput.type = "range";
        simplifyInput.min = "0.2";
        simplifyInput.max = "8";
        simplifyInput.step = "0.2";
        simplifyInput.value = String(settings.simplifyTolerance ?? 2.0);
        const simplifyValue = document.createElement("div");
        simplifyValue.style.cssText = "font-size:10px;color:#8a8a8a;";
        simplifyValue.textContent = `${Number(simplifyInput.value).toFixed(1)}`;
        simplifyInput.oninput = () => {
          const v = parseFloat(simplifyInput.value) || 2.0;
          simplifyValue.textContent = v.toFixed(1);
          editor.setInkSimplifyTolerance(v);
          editor.requestRender();
        };
        simplifyWrap.appendChild(simplifyLabel);
        simplifyWrap.appendChild(simplifyInput);
        simplifyWrap.appendChild(simplifyValue);
        inkSection.appendChild(simplifyWrap);

        const hint = document.createElement("div");
        hint.style.cssText = "margin-top:8px;font-size:10px;line-height:1.4;color:#777;";
        hint.textContent = "Recognizes line/circle/rectangle/triangle/arrow when confidence is high.";
        inkSection.appendChild(hint);

        emptyDiv.appendChild(inkSection);
      }

      container.appendChild(emptyDiv);
      return;
    }

    if (ids.length > 1) {
      const wrap = document.createElement("div");
      wrap.style.cssText = "padding:12px;";
      const title = document.createElement("div");
      title.className = "prop-section-title";
      title.textContent = `${ids.length} elements selected`;
      wrap.appendChild(title);

      // Alignment section
      const alignSection = createSection("Align");
      const alignRow = document.createElement("div");
      alignRow.style.cssText = "display:grid;grid-template-columns:repeat(6,1fr);gap:2px;margin-bottom:8px;";

      const bigIds = new BigUint64Array(ids.map((i) => BigInt(i)));
      const alignActions: { icon: string; label: string; fn: () => void }[] = [
        { icon: icons.alignLeft, label: "Align left", fn: () => editor.engine.align_left(bigIds) },
        { icon: icons.alignCenterH, label: "Align center H", fn: () => editor.engine.align_center_h(bigIds) },
        { icon: icons.alignRight, label: "Align right", fn: () => editor.engine.align_right(bigIds) },
        { icon: icons.alignTop, label: "Align top", fn: () => editor.engine.align_top(bigIds) },
        { icon: icons.alignCenterV, label: "Align center V", fn: () => editor.engine.align_center_v(bigIds) },
        { icon: icons.alignBottom, label: "Align bottom", fn: () => editor.engine.align_bottom(bigIds) },
      ];
      for (const a of alignActions) {
        const btn = document.createElement("button");
        btn.title = a.label;
        btn.style.cssText = "padding:6px 0;border:1px solid #3a3a3a;border-radius:6px;background:#2a2a2a;color:#888;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s;";
        btn.innerHTML = a.icon.replace(/width="\d+"/, 'width="16"').replace(/height="\d+"/, 'height="16"');
        btn.addEventListener("mouseenter", () => { btn.style.borderColor = "#4f46e5"; btn.style.color = "#818cf8"; });
        btn.addEventListener("mouseleave", () => { btn.style.borderColor = "#3a3a3a"; btn.style.color = "#888"; });
        btn.addEventListener("click", () => { editor.engine.push_undo(); a.fn(); editor.requestRender(); });
        alignRow.appendChild(btn);
      }
      alignSection.appendChild(alignRow);

      // Distribute row (only if 3+)
      if (ids.length >= 3) {
        const distRow = document.createElement("div");
        distRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:4px;";
        const distActions: { icon: string; label: string; fn: () => void }[] = [
          { icon: icons.distributeH, label: "Distribute horizontally", fn: () => editor.engine.distribute_horizontal(new BigUint64Array(ids.map((i) => BigInt(i)))) },
          { icon: icons.distributeV, label: "Distribute vertically", fn: () => editor.engine.distribute_vertical(new BigUint64Array(ids.map((i) => BigInt(i)))) },
        ];
        for (const d of distActions) {
          const btn = document.createElement("button");
          btn.title = d.label;
          btn.style.cssText = "padding:6px;border:1px solid #3a3a3a;border-radius:6px;background:#2a2a2a;color:#888;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;font-size:10px;transition:all 0.15s;";
          btn.innerHTML = d.icon.replace(/width="\d+"/, 'width="14"').replace(/height="\d+"/, 'height="14"') + `<span>${d.label.replace("Distribute ", "")}</span>`;
          btn.addEventListener("mouseenter", () => { btn.style.borderColor = "#4f46e5"; btn.style.color = "#818cf8"; });
          btn.addEventListener("mouseleave", () => { btn.style.borderColor = "#3a3a3a"; btn.style.color = "#888"; });
          btn.addEventListener("click", () => { editor.engine.push_undo(); d.fn(); editor.requestRender(); });
          distRow.appendChild(btn);
        }
        alignSection.appendChild(distRow);
      }

      // Smart grid distribute (4+ nodes)
      if (ids.length >= 4) {
        const gridBtn = document.createElement("button");
        gridBtn.title = "Smart grid distribute — detect rows/columns and align";
        gridBtn.style.cssText = "padding:6px;border:1px solid #3a3a3a;border-radius:6px;background:#2a2a2a;color:#888;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;font-size:10px;transition:all 0.15s;margin-top:4px;width:100%;";
        gridBtn.innerHTML = `${icons.grid.replace(/width="\d+"/, 'width="14"').replace(/height="\d+"/, 'height="14"')}<span>Grid distribute</span>`;
        gridBtn.addEventListener("mouseenter", () => { gridBtn.style.borderColor = "#4f46e5"; gridBtn.style.color = "#818cf8"; });
        gridBtn.addEventListener("mouseleave", () => { gridBtn.style.borderColor = "#3a3a3a"; gridBtn.style.color = "#888"; });
        gridBtn.addEventListener("click", () => { (editor.engine as any).smart_distribute_grid(); editor.requestRender(); });
        alignSection.appendChild(gridBtn);
      }

      // Smart Distribute (3+ nodes) — detect uneven spacing and normalize
      if (ids.length >= 3) {
        const smartBtn = document.createElement("button");
        smartBtn.title = "Smart distribute — normalize uneven spacing";
        smartBtn.style.cssText = "padding:6px;border:1px solid #3a3a3a;border-radius:6px;background:#2a2a2a;color:#888;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;font-size:10px;transition:all 0.15s;margin-top:4px;width:100%;position:relative;";
        smartBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 18h18"/><rect x="5" y="10" width="3" height="4" rx="0.5"/><rect x="10.5" y="10" width="3" height="4" rx="0.5"/><rect x="16" y="10" width="3" height="4" rx="0.5"/><path d="M8 12h2.5M13.5 12h2.5" stroke-dasharray="1.5 1.5"/></svg><span>Smart Distribute</span>`;
        smartBtn.addEventListener("mouseenter", () => { smartBtn.style.borderColor = "#4f46e5"; smartBtn.style.color = "#818cf8"; });
        smartBtn.addEventListener("mouseleave", () => { if (!smartBtn.querySelector(".smart-dist-popover")) { smartBtn.style.borderColor = "#3a3a3a"; smartBtn.style.color = "#888"; } });
        smartBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          // Remove existing popover
          const existing = smartBtn.querySelector(".smart-dist-popover");
          if (existing) { existing.remove(); smartBtn.style.borderColor = "#3a3a3a"; smartBtn.style.color = "#888"; return; }
          // Get preview
          const idsJson = JSON.stringify(ids.map(Number));
          const preview = JSON.parse((editor.engine as any).smart_distribute_preview(idsJson) || "{}");
          if (!preview.h_gaps) return;
          // Build popover
          const pop = document.createElement("div");
          pop.className = "smart-dist-popover";
          pop.style.cssText = "position:absolute;left:0;top:calc(100% + 4px);width:100%;background:#1e1e1e;border:1px solid #3a3a3a;border-radius:8px;padding:8px;z-index:100;box-shadow:0 4px 12px rgba(0,0,0,0.5);";
          pop.addEventListener("click", (ev) => ev.stopPropagation());

          const hGaps = (preview.h_gaps as number[]).map((g: number) => g.toFixed(0)).join(", ");
          const vGaps = (preview.v_gaps as number[]).map((g: number) => g.toFixed(0)).join(", ");

          pop.innerHTML = `
            <div style="font-size:10px;color:#aaa;margin-bottom:6px;">
              <div>H gaps: <span style="color:#ccc;">${hGaps}</span> → rec: <b style="color:#818cf8;">${preview.h_recommended.toFixed(0)}</b></div>
              <div>V gaps: <span style="color:#ccc;">${vGaps}</span> → rec: <b style="color:#818cf8;">${preview.v_recommended.toFixed(0)}</b></div>
            </div>
            <div style="display:flex;gap:4px;align-items:center;margin-bottom:6px;">
              <span style="font-size:10px;color:#888;">Gap:</span>
              <input type="number" class="sd-gap-input" value="" placeholder="auto" style="width:48px;padding:3px 5px;font-size:11px;border:1px solid #3a3a3a;border-radius:4px;background:#1e1e1e;color:#ccc;text-align:center;" />
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
              <button class="sd-apply-h" style="padding:5px;border:1px solid rgba(79,70,229,0.4);border-radius:4px;background:rgba(79,70,229,0.15);color:#818cf8;cursor:pointer;font-size:10px;transition:all 0.15s;">Apply H</button>
              <button class="sd-apply-v" style="padding:5px;border:1px solid rgba(79,70,229,0.4);border-radius:4px;background:rgba(79,70,229,0.15);color:#818cf8;cursor:pointer;font-size:10px;transition:all 0.15s;">Apply V</button>
            </div>
          `;
          smartBtn.appendChild(pop);

          const gapInput = pop.querySelector(".sd-gap-input") as HTMLInputElement;
          const applyH = pop.querySelector(".sd-apply-h") as HTMLButtonElement;
          const applyV = pop.querySelector(".sd-apply-v") as HTMLButtonElement;

          applyH.addEventListener("click", (ev) => {
            ev.stopPropagation();
            const gap = gapInput.value ? parseFloat(gapInput.value) : -1;
            (editor.engine as any).smart_distribute_h(idsJson, gap);
            editor.requestRender();
            pop.remove();
          });
          applyV.addEventListener("click", (ev) => {
            ev.stopPropagation();
            const gap = gapInput.value ? parseFloat(gapInput.value) : -1;
            (editor.engine as any).smart_distribute_v(idsJson, gap);
            editor.requestRender();
            pop.remove();
          });

          // Close on outside click
          const closeHandler = (ev: MouseEvent) => {
            if (!pop.contains(ev.target as Node) && ev.target !== smartBtn) {
              pop.remove();
              smartBtn.style.borderColor = "#3a3a3a"; smartBtn.style.color = "#888";
              document.removeEventListener("click", closeHandler);
            }
          };
          setTimeout(() => document.addEventListener("click", closeHandler), 0);
        });
        alignSection.appendChild(smartBtn);
      }

      // Tidy Up button (3+ nodes) — normalizes uneven spacing
      if (ids.length >= 3) {
        const tidyRow = document.createElement("div");
        tidyRow.style.cssText = "display:flex;gap:4px;align-items:stretch;margin-top:4px;";

        // Spacing info badge
        const infoSpan = document.createElement("span");
        infoSpan.style.cssText = "font-size:9px;color:#666;display:flex;align-items:center;padding:0 4px;flex-shrink:0;min-width:0;";
        try {
          const hInfo = JSON.parse((editor.engine as any).get_spacing_between(new BigUint64Array(ids.map(i => BigInt(i))), "horizontal") || "{}");
          const vInfo = JSON.parse((editor.engine as any).get_spacing_between(new BigUint64Array(ids.map(i => BigInt(i))), "vertical") || "{}");
          const hUniform = hInfo.uniform;
          const vUniform = vInfo.uniform;
          if (!hUniform || !vUniform) {
            infoSpan.textContent = "⚠ uneven";
            infoSpan.style.color = "#f59e0b";
          } else {
            infoSpan.textContent = "✓ even";
            infoSpan.style.color = "#22c55e";
          }
        } catch { infoSpan.textContent = ""; }

        const tidyBtn = document.createElement("button");
        tidyBtn.title = "Tidy up — normalize spacing & align";
        tidyBtn.style.cssText = "flex:1;padding:6px;border:1px solid #3a3a3a;border-radius:6px;background:#2a2a2a;color:#888;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;font-size:10px;transition:all 0.15s;";
        tidyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 12h18M3 18h18"/><circle cx="7" cy="6" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="17" cy="18" r="1.5" fill="currentColor"/></svg><span>Tidy up</span>`;
        tidyBtn.addEventListener("mouseenter", () => { tidyBtn.style.borderColor = "#4f46e5"; tidyBtn.style.color = "#818cf8"; });
        tidyBtn.addEventListener("mouseleave", () => { tidyBtn.style.borderColor = "#3a3a3a"; tidyBtn.style.color = "#888"; });
        tidyBtn.addEventListener("click", () => {
          editor.engine.push_undo();
          const result = (editor.engine as any).tidy_up_selection();
          editor.requestRender();
          try {
            const r = JSON.parse(result);
            if (r.axis) {
              infoSpan.textContent = `${r.axis === "horizontal" ? "H" : "V"} gap: ${r.gap}px`;
              infoSpan.style.color = "#22c55e";
            }
          } catch {}
          // Refresh properties panel
          editor.onSelectionChanged?.();
        });

        tidyRow.appendChild(infoSpan);
        tidyRow.appendChild(tidyBtn);
        alignSection.appendChild(tidyRow);
      }

      // Auto-spacing section (2+ nodes)
      if (ids.length >= 2) {
        const spacingRow = document.createElement("div");
        spacingRow.style.cssText = "display:flex;gap:4px;align-items:center;margin-top:6px;";
        const spacingLabel = document.createElement("span");
        spacingLabel.textContent = t("properties.spacing");
        spacingLabel.style.cssText = "font-size:10px;color:#888;flex-shrink:0;";
        const spacingInput = document.createElement("input");
        spacingInput.type = "number";
        spacingInput.value = "20";
        spacingInput.min = "0";
        spacingInput.step = "1";
        spacingInput.style.cssText = "width:48px;padding:4px 6px;font-size:11px;border:1px solid #3a3a3a;border-radius:4px;background:#1e1e1e;color:#ccc;text-align:center;";
        const makeSpBtn = (label: string, axis: string) => {
          const btn = document.createElement("button");
          btn.title = `Auto-space ${label}`;
          btn.style.cssText = "padding:4px 8px;border:1px solid #3a3a3a;border-radius:4px;background:#2a2a2a;color:#888;cursor:pointer;font-size:10px;transition:all 0.15s;flex:1;";
          btn.textContent = label;
          btn.addEventListener("mouseenter", () => { btn.style.borderColor = "#4f46e5"; btn.style.color = "#818cf8"; });
          btn.addEventListener("mouseleave", () => { btn.style.borderColor = "#3a3a3a"; btn.style.color = "#888"; });
          btn.addEventListener("click", () => {
            const gap = parseFloat(spacingInput.value) || 0;
            editor.engine.push_undo();
            (editor.engine as any).distribute_selection_with_spacing(axis, gap);
            editor.requestRender();
          });
          return btn;
        };
        spacingRow.appendChild(spacingLabel);
        spacingRow.appendChild(spacingInput);
        spacingRow.appendChild(makeSpBtn("H", "horizontal"));
        spacingRow.appendChild(makeSpBtn("V", "vertical"));
        alignSection.appendChild(spacingRow);
      }

      wrap.appendChild(alignSection);

      // Auto-suggest Layout section (2+ nodes)
      const suggestSection = createSection("AI Layout");
      const suggestBtn = document.createElement("button");
      suggestBtn.style.cssText = `
        width:100%; padding:8px 12px; border:1px solid rgba(79,70,229,0.3);
        border-radius:8px; background:rgba(79,70,229,0.1); color:#818cf8;
        cursor:pointer; font-size:12px; font-weight:500;
        display:flex; align-items:center; justify-content:center; gap:6px;
        transition:all 0.15s;
      `;
      suggestBtn.innerHTML = `${icons.layout ? icons.layout.replace(/width="\d+"/, 'width="16"').replace(/height="\d+"/, 'height="16"') : "✨"} <span>Auto-suggest Layout</span>`;
      suggestBtn.addEventListener("mouseenter", () => { suggestBtn.style.background = "rgba(79,70,229,0.2)"; suggestBtn.style.borderColor = "rgba(79,70,229,0.5)"; });
      suggestBtn.addEventListener("mouseleave", () => { suggestBtn.style.background = "rgba(79,70,229,0.1)"; suggestBtn.style.borderColor = "rgba(79,70,229,0.3)"; });
      suggestBtn.addEventListener("click", () => {
        const idsArr = new BigUint64Array(ids.map((i) => BigInt(i)));
        // Preview suggestion first
        const suggestionJson = editor.engine.suggest_auto_layout(idsArr);
        const suggestion = JSON.parse(suggestionJson);

        // Show suggestion preview
        const previewDiv = document.createElement("div");
        previewDiv.style.cssText = `
          margin-top:8px; padding:10px; background:#1e1e1e;
          border:1px solid #333; border-radius:8px; font-size:11px; color:#aaa;
        `;

        const patternLabel = document.createElement("div");
        patternLabel.style.cssText = "font-size:10px;color:#818cf8;font-weight:600;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:6px;";
        patternLabel.textContent = `Detected: ${suggestion.pattern} (${Math.round(suggestion.confidence * 100)}% confidence)`;
        previewDiv.appendChild(patternLabel);

        const details = [
          `Direction: ${suggestion.direction}`,
          `Gap: ${suggestion.gap}px`,
          `Align: ${suggestion.align_items}`,
          `Justify: ${suggestion.justify_content}`,
          suggestion.wrap !== "nowrap" ? `Wrap: ${suggestion.wrap}` : null,
        ].filter(Boolean);

        const detailsDiv = document.createElement("div");
        detailsDiv.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;";
        for (const d of details) {
          const chip = document.createElement("span");
          chip.style.cssText = "padding:2px 6px;background:#2a2a2a;border-radius:4px;font-size:10px;color:#ccc;";
          chip.textContent = d!;
          detailsDiv.appendChild(chip);
        }
        previewDiv.appendChild(detailsDiv);

        const applyBtn = document.createElement("button");
        applyBtn.style.cssText = `
          width:100%; padding:6px; border:none; border-radius:6px;
          background:#4f46e5; color:#fff; cursor:pointer; font-size:11px; font-weight:500;
          transition:background 0.15s;
        `;
        applyBtn.textContent = t("properties.applyAutoLayout");
        applyBtn.addEventListener("mouseenter", () => { applyBtn.style.background = "#6366f1"; });
        applyBtn.addEventListener("mouseleave", () => { applyBtn.style.background = "#4f46e5"; });
        applyBtn.addEventListener("click", () => {
          editor.engine.push_undo();
          const frameId = editor.engine.apply_auto_layout_suggestion(idsArr);
          if (frameId) {
            editor.requestRender();
            editor.notifyLayers();
            refresh([Number(frameId)]);
            editor.fireSelectionNow([Number(frameId)]);
          }
        });
        previewDiv.appendChild(applyBtn);

        // Remove previous preview if exists
        const existingPreview = suggestSection.querySelector(".ai-layout-preview");
        if (existingPreview) existingPreview.remove();
        previewDiv.className = "ai-layout-preview";
        suggestSection.appendChild(previewDiv);
      });
      suggestSection.appendChild(suggestBtn);
      wrap.appendChild(suggestSection);

      // =============================================
      // Batch Property Edit (fill/stroke/opacity/corner-radius)
      // =============================================
      const batchSection = createSection("Properties");
      const batchIds = ids.map((i) => BigInt(i));
      let batchProps: any = {};
      try {
        batchProps = JSON.parse((editor.engine as any).get_batch_properties(ids));
      } catch {}

      const inputCssBatch = "width:100%;padding:4px 6px;font-size:11px;border:1px solid #444;border-radius:4px;background:#2a2a2a;color:#ccc;box-sizing:border-box;";
      const labelCssBatch = "font-size:10px;color:#666;margin-bottom:2px;";

      // --- Fill ---
      const fillRow = document.createElement("div");
      fillRow.style.cssText = "margin-bottom:8px;";
      const fillLabel = document.createElement("div");
      fillLabel.style.cssText = labelCssBatch;
      fillLabel.textContent = "Fill";
      fillRow.appendChild(fillLabel);
      const fillWrap = document.createElement("div");
      fillWrap.style.cssText = "display:flex;gap:4px;align-items:center;";
      const fillSwatch = document.createElement("input");
      fillSwatch.type = "color";
      const fillHex = document.createElement("input");
      fillHex.style.cssText = inputCssBatch + "flex:1;";
      if (batchProps.fill === "mixed") {
        fillSwatch.value = "#888888";
        fillHex.value = "";
        fillHex.placeholder = "Mixed";
      } else if (batchProps.fill) {
        const fc = batchProps.fill;
        const hex = ((1 << 24) + (fc.r << 16) + (fc.g << 8) + fc.b).toString(16).slice(1);
        fillSwatch.value = "#" + hex;
        fillHex.value = hex;
      } else {
        fillSwatch.value = "#cccccc";
        fillHex.value = "";
        fillHex.placeholder = "No fill";
      }
      fillSwatch.style.cssText = "width:24px;height:24px;border:1px solid #555;border-radius:4px;padding:0;cursor:pointer;background:none;";
      const applyFill = (hex: string) => {
        const c = hex.replace("#", "");
        const r = parseInt(c.substring(0, 2), 16) || 0;
        const g = parseInt(c.substring(2, 4), 16) || 0;
        const b = parseInt(c.substring(4, 6), 16) || 0;
        editor.engine.push_undo();
        (editor.engine as any).batch_set_fill(ids, r, g, b, 1.0);
        editor.requestRender();
      };
      fillSwatch.addEventListener("input", () => { fillHex.value = fillSwatch.value.replace("#", ""); applyFill(fillSwatch.value); });
      fillHex.addEventListener("change", () => { fillSwatch.value = "#" + fillHex.value; applyFill(fillHex.value); });
      fillWrap.appendChild(fillSwatch);
      fillWrap.appendChild(fillHex);
      fillRow.appendChild(fillWrap);
      batchSection.appendChild(fillRow);

      // --- Stroke ---
      const strokeRow = document.createElement("div");
      strokeRow.style.cssText = "margin-bottom:8px;";
      const strokeLabel = document.createElement("div");
      strokeLabel.style.cssText = labelCssBatch;
      strokeLabel.textContent = "Stroke";
      strokeRow.appendChild(strokeLabel);
      const strokeWrap = document.createElement("div");
      strokeWrap.style.cssText = "display:flex;gap:4px;align-items:center;";
      const strokeSwatch = document.createElement("input");
      strokeSwatch.type = "color";
      strokeSwatch.style.cssText = "width:24px;height:24px;border:1px solid #555;border-radius:4px;padding:0;cursor:pointer;background:none;";
      const strokeHex = document.createElement("input");
      strokeHex.style.cssText = inputCssBatch + "flex:1;";
      const strokeWidthInput = document.createElement("input");
      strokeWidthInput.type = "number";
      strokeWidthInput.min = "0";
      strokeWidthInput.step = "1";
      strokeWidthInput.style.cssText = inputCssBatch + "width:48px;text-align:center;";
      let currentStrokeWidth = 1;
      if (batchProps.stroke === "mixed") {
        strokeSwatch.value = "#888888";
        strokeHex.value = "";
        strokeHex.placeholder = "Mixed";
        strokeWidthInput.value = "";
        strokeWidthInput.placeholder = "—";
      } else if (batchProps.stroke) {
        const sc = batchProps.stroke;
        const hex = ((1 << 24) + (sc.r << 16) + (sc.g << 8) + sc.b).toString(16).slice(1);
        strokeSwatch.value = "#" + hex;
        strokeHex.value = hex;
        strokeWidthInput.value = String(sc.width);
        currentStrokeWidth = sc.width;
      } else {
        strokeSwatch.value = "#ffffff";
        strokeHex.value = "";
        strokeHex.placeholder = "No stroke";
        strokeWidthInput.value = "1";
      }
      const applyStroke = (hex: string, width: number) => {
        const c = hex.replace("#", "");
        const r = parseInt(c.substring(0, 2), 16) || 0;
        const g = parseInt(c.substring(2, 4), 16) || 0;
        const b = parseInt(c.substring(4, 6), 16) || 0;
        editor.engine.push_undo();
        (editor.engine as any).batch_set_stroke(ids, r, g, b, 1.0, width);
        editor.requestRender();
      };
      strokeSwatch.addEventListener("input", () => {
        strokeHex.value = strokeSwatch.value.replace("#", "");
        applyStroke(strokeSwatch.value, parseFloat(strokeWidthInput.value) || currentStrokeWidth);
      });
      strokeHex.addEventListener("change", () => {
        strokeSwatch.value = "#" + strokeHex.value;
        applyStroke(strokeHex.value, parseFloat(strokeWidthInput.value) || currentStrokeWidth);
      });
      strokeWidthInput.addEventListener("change", () => {
        applyStroke(strokeSwatch.value, parseFloat(strokeWidthInput.value) || 1);
      });
      strokeWrap.appendChild(strokeSwatch);
      strokeWrap.appendChild(strokeHex);
      strokeWrap.appendChild(strokeWidthInput);
      strokeRow.appendChild(strokeWrap);
      batchSection.appendChild(strokeRow);

      // --- Opacity & Corner Radius ---
      const opCrRow = document.createElement("div");
      opCrRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:6px;";

      // Opacity
      const opCol = document.createElement("div");
      const opLabel = document.createElement("div");
      opLabel.style.cssText = labelCssBatch;
      opLabel.textContent = "Opacity";
      opCol.appendChild(opLabel);
      const opInput = document.createElement("input");
      opInput.type = "number";
      opInput.min = "0";
      opInput.max = "100";
      opInput.step = "1";
      opInput.style.cssText = inputCssBatch;
      if (batchProps.opacity === "mixed") {
        opInput.value = "";
        opInput.placeholder = "Mixed";
      } else {
        opInput.value = String(Math.round((batchProps.opacity ?? 1) * 100));
      }
      opInput.addEventListener("change", () => {
        const val = parseFloat(opInput.value);
        if (isNaN(val)) return;
        editor.engine.push_undo();
        (editor.engine as any).batch_set_opacity(ids, val / 100);
        editor.requestRender();
      });
      opCol.appendChild(opInput);
      opCrRow.appendChild(opCol);

      // Corner Radius
      const crCol = document.createElement("div");
      const crLabel = document.createElement("div");
      crLabel.style.cssText = labelCssBatch;
      crLabel.textContent = "Radius";
      crCol.appendChild(crLabel);
      const crInput = document.createElement("input");
      crInput.type = "number";
      crInput.min = "0";
      crInput.step = "1";
      crInput.style.cssText = inputCssBatch;
      if (batchProps.corner_radius === "mixed") {
        crInput.value = "";
        crInput.placeholder = "Mixed";
      } else {
        crInput.value = String(Math.round(batchProps.corner_radius ?? 0));
      }
      crInput.addEventListener("change", () => {
        const val = parseFloat(crInput.value);
        if (isNaN(val)) return;
        editor.engine.push_undo();
        (editor.engine as any).batch_set_corner_radius(ids, val);
        editor.requestRender();
      });
      crCol.appendChild(crInput);
      opCrRow.appendChild(crCol);

      batchSection.appendChild(opCrRow);
      wrap.appendChild(batchSection);

      // =============================================
      // Selection Colors (Figma-style)
      // =============================================
      try {
        const idsJsonStr = JSON.stringify(ids);
        const colorsJson = (editor.engine as any).get_selection_colors(idsJsonStr);
        const colors: { hex: string; alpha: number; count: number; source: string }[] = JSON.parse(colorsJson);
        if (colors.length > 0) {
          const colorSection = createSection("Selection Colors");
          const colorGrid = document.createElement("div");
          colorGrid.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;";
          for (const c of colors) {
            const item = document.createElement("div");
            item.style.cssText = "display:flex;align-items:center;gap:4px;padding:4px 8px;background:#1e1e1e;border:1px solid #333;border-radius:6px;cursor:pointer;transition:all 0.15s;";
            item.addEventListener("mouseenter", () => { item.style.borderColor = "#4f46e5"; });
            item.addEventListener("mouseleave", () => { item.style.borderColor = "#333"; });

            const swatch = document.createElement("input");
            swatch.type = "color";
            swatch.value = c.hex;
            swatch.style.cssText = "width:20px;height:20px;border:1px solid #555;border-radius:4px;cursor:pointer;padding:0;background:none;";

            const label = document.createElement("span");
            label.style.cssText = "font-size:10px;color:#aaa;font-family:monospace;";
            label.textContent = c.hex.toUpperCase();

            const badge = document.createElement("span");
            badge.style.cssText = "font-size:9px;color:#666;background:#2a2a2a;padding:1px 4px;border-radius:3px;";
            badge.textContent = `${c.count}× ${c.source === "both" ? "F+S" : c.source === "fill" ? "F" : "S"}`;

            swatch.addEventListener("input", () => {
              const hex = swatch.value.replace("#", "");
              const nr = parseInt(hex.substring(0, 2), 16);
              const ng = parseInt(hex.substring(2, 4), 16);
              const nb = parseInt(hex.substring(4, 6), 16);
              const oldHex = c.hex.replace("#", "");
              editor.engine.push_undo();
              (editor.engine as any).replace_color_in_nodes(idsJsonStr, oldHex, nr, ng, nb, c.alpha);
              editor.requestRender();
              label.textContent = swatch.value.toUpperCase();
              c.hex = swatch.value;
            });

            item.appendChild(swatch);
            item.appendChild(label);
            item.appendChild(badge);
            colorGrid.appendChild(item);
          }
          colorSection.appendChild(colorGrid);
          wrap.appendChild(colorSection);
        }
      } catch {}

      container.appendChild(wrap);
      return;
    }

    const bid = BigInt(ids[0]!);
    const nodeJson = editor.engine.get_node_json(bid);
    if (!nodeJson) return;
    const node = JSON.parse(nodeJson);
    const id = bid;

    // --- Node type badge + name ---
    const header = document.createElement("div");
    header.style.cssText = "margin-bottom:16px;";

    const kindBadge = document.createElement("div");
    const kindLabel = getKindLabel(node.kind);
    kindBadge.style.cssText = "font-size:10px;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;";
    kindBadge.textContent = kindLabel;
    header.appendChild(kindBadge);

    // Instance → Main Component link
    const compInfoJson = editor.engine.get_instance_component_info(id);
    const compInfo = JSON.parse(compInfoJson);
    if (compInfo) {
      const compCard = document.createElement("div");
      compCard.style.cssText = `
        display:flex; align-items:center; gap:8px;
        padding:8px 10px; margin-bottom:8px;
        background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.2);
        border-radius:8px;
      `;
      const compIcon = document.createElement("span");
      compIcon.innerHTML = icons.component.replace(/width="\d+"/, 'width="14"').replace(/height="\d+"/, 'height="14"');
      compIcon.style.cssText = "opacity:0.7;color:#10b981;flex-shrink:0;display:flex;";
      compCard.appendChild(compIcon);

      const compText = document.createElement("div");
      compText.style.cssText = "flex:1;min-width:0;";
      const compLabel = document.createElement("div");
      compLabel.style.cssText = "font-size:10px;color:#10b981;letter-spacing:0.3px;";
      compLabel.textContent = t("properties.mainComponent");
      compText.appendChild(compLabel);
      const compName = document.createElement("div");
      compName.style.cssText = "font-size:12px;color:#ccc;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      compName.textContent = compInfo.component_name;
      compText.appendChild(compName);
      compCard.appendChild(compText);

      const goBtn = document.createElement("button");
      goBtn.style.cssText = `
        background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.3);
        border-radius:6px; padding:4px 10px; color:#10b981;
        cursor:pointer; font-size:11px; font-weight:500;
        transition:all 0.15s; flex-shrink:0;
      `;
      goBtn.textContent = t("properties.goTo");
      goBtn.addEventListener("mouseenter", () => { goBtn.style.background = "rgba(16,185,129,0.25)"; });
      goBtn.addEventListener("mouseleave", () => { goBtn.style.background = "rgba(16,185,129,0.15)"; });
      goBtn.addEventListener("click", () => {
        const sourceId = BigInt(compInfo.source_node_id);
        editor.engine.select(sourceId);
        // Scroll to the component source node
        const srcJson = editor.engine.get_node_json(sourceId);
        if (srcJson) {
          const src = JSON.parse(srcJson);
          editor.engine.pan_to(src.x + src.width / 2, src.y + src.height / 2);
        }
        editor.requestRender();
        refresh([Number(sourceId)]);
        editor.fireSelectionNow([Number(sourceId)]);
      });
      compCard.appendChild(goBtn);

      const swapBtn = document.createElement("button");
      swapBtn.style.cssText = `
        background:rgba(79,70,229,0.15); border:1px solid rgba(79,70,229,0.3);
        border-radius:6px; padding:4px 10px; color:#818cf8;
        cursor:pointer; font-size:11px; font-weight:500;
        transition:all 0.15s; flex-shrink:0;
      `;
      swapBtn.textContent = t("properties.swap");
      swapBtn.title = "Swap to a different component";
      swapBtn.addEventListener("mouseenter", () => { swapBtn.style.background = "rgba(79,70,229,0.25)"; });
      swapBtn.addEventListener("mouseleave", () => { swapBtn.style.background = "rgba(79,70,229,0.15)"; });
      swapBtn.addEventListener("click", () => {
        openComponentSwapDialog(editor, Number(id));
      });
      compCard.appendChild(swapBtn);

      const playgroundBtn = document.createElement("button");
      playgroundBtn.style.cssText = `
        background:rgba(123,97,255,0.15); border:1px solid rgba(123,97,255,0.3);
        border-radius:6px; padding:4px 10px; color:#b4a0ff;
        cursor:pointer; font-size:11px; font-weight:500;
        transition:all 0.15s; flex-shrink:0;
      `;
      playgroundBtn.textContent = "▶ Playground";
      playgroundBtn.title = "Open Component Playground (⌘⇧G)";
      playgroundBtn.addEventListener("mouseenter", () => { playgroundBtn.style.background = "rgba(123,97,255,0.25)"; });
      playgroundBtn.addEventListener("mouseleave", () => { playgroundBtn.style.background = "rgba(123,97,255,0.15)"; });
      playgroundBtn.addEventListener("click", () => {
        import("./component-playground").then(({ openComponentPlayground }) => {
          openComponentPlayground(editor.engine, compInfo.component_id);
        });
      });
      compCard.appendChild(playgroundBtn);

      // === Detach Instance Button ===
      const detachBtn = document.createElement("button");
      detachBtn.style.cssText = `
        background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.25);
        border-radius:6px; padding:4px 10px; color:#ef4444;
        cursor:pointer; font-size:11px; font-weight:500;
        transition:all 0.15s; flex-shrink:0;
      `;
      detachBtn.textContent = "Detach";
      detachBtn.title = "Detach instance (convert to Frame) — ⌘⌥B";
      detachBtn.addEventListener("mouseenter", () => { detachBtn.style.background = "rgba(239,68,68,0.22)"; });
      detachBtn.addEventListener("mouseleave", () => { detachBtn.style.background = "rgba(239,68,68,0.12)"; });
      detachBtn.addEventListener("click", () => {
        editor.engine.detach_instance(BigInt(id));
        editor.requestRender();
        refresh([id]);
        editor.fireSelectionNow([id]);
        (editor as any).onLayersChanges?.forEach?.((fn: any) => fn());
      });
      compCard.appendChild(detachBtn);

      // === Multi-Edit Mode Button ===
      const multiEditInfoJson = editor.engine.get_multi_edit_info(BigInt(id));
      const multiEditInfo = JSON.parse(multiEditInfoJson);
      if (multiEditInfo && multiEditInfo.instance_count > 1) {
        const multiEditBtn = document.createElement("button");
        const isMultiEdit = (editor as any)._multiEditMode === true;
        multiEditBtn.style.cssText = `
          background:${isMultiEdit ? "rgba(245,158,11,0.25)" : "rgba(245,158,11,0.10)"};
          border:1px solid ${isMultiEdit ? "rgba(245,158,11,0.5)" : "rgba(245,158,11,0.25)"};
          border-radius:6px; padding:4px 10px; color:#f59e0b;
          cursor:pointer; font-size:11px; font-weight:500;
          transition:all 0.15s; flex-shrink:0;
        `;
        multiEditBtn.textContent = isMultiEdit ? `✦ Multi (${multiEditInfo.instance_count})` : `Multi (${multiEditInfo.instance_count})`;
        multiEditBtn.title = isMultiEdit
          ? "Multi-edit ON: changes apply to all instances of this component"
          : "Enable multi-edit: edit all instances of this component simultaneously";
        multiEditBtn.addEventListener("mouseenter", () => { multiEditBtn.style.background = "rgba(245,158,11,0.25)"; });
        multiEditBtn.addEventListener("mouseleave", () => {
          multiEditBtn.style.background = (editor as any)._multiEditMode ? "rgba(245,158,11,0.25)" : "rgba(245,158,11,0.10)";
        });
        multiEditBtn.addEventListener("click", () => {
          (editor as any)._multiEditMode = !(editor as any)._multiEditMode;
          if ((editor as any)._multiEditMode) {
            // Highlight all sibling instances
            const siblingIds: number[] = JSON.parse(editor.engine.get_sibling_instances(BigInt(id)));
            (editor as any)._multiEditInstanceIds = siblingIds;
            (editor as any)._multiEditCompId = multiEditInfo.component_id;
          } else {
            (editor as any)._multiEditInstanceIds = null;
            (editor as any)._multiEditCompId = null;
          }
          editor.requestRender();
          refresh([id]);
        });
        compCard.appendChild(multiEditBtn);

        // Show multi-edit status banner when active
        if (isMultiEdit) {
          const banner = document.createElement("div");
          banner.style.cssText = `
            display:flex; align-items:center; gap:6px;
            padding:6px 10px; margin-top:6px;
            background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.2);
            border-radius:6px; font-size:11px; color:#f59e0b;
          `;
          banner.innerHTML = `✦ Multi-edit active — editing <b>${multiEditInfo.instance_count}</b> instances of <b>${multiEditInfo.component_name}</b>`;

          const selectAllBtn = document.createElement("button");
          selectAllBtn.style.cssText = `
            margin-left:auto; background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.3);
            border-radius:4px; padding:2px 8px; color:#f59e0b;
            cursor:pointer; font-size:10px; white-space:nowrap;
          `;
          selectAllBtn.textContent = "Select All";
          selectAllBtn.addEventListener("click", () => {
            const selectedJson = editor.engine.multi_edit_select_all(BigInt(id));
            const selectedIds: number[] = JSON.parse(selectedJson);
            editor.requestRender();
            editor.fireSelectionNow(selectedIds);
          });
          banner.appendChild(selectAllBtn);
          header.appendChild(banner);
        }
      }

      header.appendChild(compCard);

      // === Variant Picker ===
      if (compInfo.properties && compInfo.properties.length > 0) {
        const variantSection = document.createElement("div");
        variantSection.style.cssText = `
          margin-bottom:8px; padding:8px 10px;
          background:rgba(139,92,246,0.06); border:1px solid rgba(139,92,246,0.15);
          border-radius:8px;
        `;

        const variantTitle = document.createElement("div");
        variantTitle.style.cssText = "font-size:10px;color:#8b5cf6;letter-spacing:0.3px;margin-bottom:6px;font-weight:600;";
        variantTitle.textContent = "VARIANTS";
        variantSection.appendChild(variantTitle);

        for (const prop of compInfo.properties) {
          const propRow = document.createElement("div");
          propRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:4px;";

          const propLabel = document.createElement("span");
          propLabel.style.cssText = "font-size:11px;color:#999;min-width:60px;";
          propLabel.textContent = prop.name;
          propRow.appendChild(propLabel);

          if (prop.type.kind === "boolean") {
            const toggle = document.createElement("button");
            const isOn = prop.current === "true";
            toggle.style.cssText = `
              width:32px; height:18px; border-radius:9px; border:none; cursor:pointer;
              background:${isOn ? "#8b5cf6" : "#444"}; position:relative; transition:background 0.2s;
            `;
            const knob = document.createElement("span");
            knob.style.cssText = `
              position:absolute; top:2px; ${isOn ? "right:2px" : "left:2px"};
              width:14px; height:14px; border-radius:7px; background:#fff; transition:all 0.2s;
            `;
            toggle.appendChild(knob);
            toggle.addEventListener("click", () => {
              const newVal = prop.current === "true" ? "false" : "true";
              const newKey: Record<string, any> = { ...(compInfo.current_variant_values || {}) };
              newKey[prop.name] = { Boolean: newVal === "true" };
              if ((editor as any)._multiEditMode) {
                editor.engine.multi_edit_set_variant(BigInt(id), JSON.stringify(newKey));
              } else {
                editor.engine.set_instance_variant(BigInt(id), JSON.stringify(newKey));
              }
              editor.requestRender();
              refresh([id]);
            });
            propRow.appendChild(toggle);
          } else if (prop.type.kind === "string" && prop.type.options) {
            const select = document.createElement("select");
            select.style.cssText = `
              flex:1; background:#2a2a2a; border:1px solid #444; border-radius:4px;
              color:#ccc; font-size:11px; padding:3px 6px; outline:none; cursor:pointer;
            `;
            for (const opt of prop.type.options) {
              const option = document.createElement("option");
              option.value = opt;
              option.textContent = opt;
              if (opt === prop.current) option.selected = true;
              select.appendChild(option);
            }
            select.addEventListener("change", () => {
              const newKey: Record<string, any> = { ...(compInfo.current_variant_values || {}) };
              newKey[prop.name] = { String: select.value };
              if ((editor as any)._multiEditMode) {
                editor.engine.multi_edit_set_variant(BigInt(id), JSON.stringify(newKey));
              } else {
                editor.engine.set_instance_variant(BigInt(id), JSON.stringify(newKey));
              }
              editor.requestRender();
              refresh([id]);
            });
            propRow.appendChild(select);
          }

          variantSection.appendChild(propRow);
        }

        header.appendChild(variantSection);
      }

      // === Component Set Variant Switcher ===
      try {
        const setInfoJson = (editor.engine as any).get_instance_component_set_info?.(BigInt(id));
        if (setInfoJson) {
          const setInfo = JSON.parse(setInfoJson);
          if (setInfo && setInfo.axes && setInfo.axes.length > 0) {
            const setSection = document.createElement("div");
            setSection.style.cssText = `
              margin-bottom:8px; padding:8px 10px;
              background:rgba(139,92,246,0.08); border:1px solid rgba(139,92,246,0.2);
              border-radius:8px;
            `;

            const setTitle = document.createElement("div");
            setTitle.style.cssText = "font-size:10px;color:#8b5cf6;letter-spacing:0.3px;margin-bottom:6px;font-weight:600;display:flex;align-items:center;gap:4px;";
            setTitle.innerHTML = `<span style="display:inline-flex;gap:1px;"><span style="width:3px;height:3px;background:#8b5cf6;border-radius:1px;"></span><span style="width:3px;height:3px;background:#8b5cf6;border-radius:1px;"></span><span style="width:3px;height:3px;background:#8b5cf6;border-radius:1px;"></span><span style="width:3px;height:3px;background:#8b5cf6;border-radius:1px;"></span></span> COMPONENT SET: ${setInfo.set_name}`;
            setSection.appendChild(setTitle);

            // Build current axis values
            const currentValues: Record<string, string> = {};
            for (const axis of setInfo.axes) {
              currentValues[axis.name] = axis.current || axis.values[0] || "";
            }

            for (const axis of setInfo.axes) {
              const row = document.createElement("div");
              row.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:4px;";

              const label = document.createElement("span");
              label.style.cssText = "font-size:11px;color:#a78bfa;min-width:60px;font-weight:500;";
              label.textContent = axis.name;
              row.appendChild(label);

              const select = document.createElement("select");
              select.style.cssText = `
                flex:1; background:#2a2a2a; border:1px solid rgba(139,92,246,0.3); border-radius:4px;
                color:#ccc; font-size:11px; padding:3px 6px; outline:none; cursor:pointer;
              `;
              for (const val of axis.values) {
                const option = document.createElement("option");
                option.value = val;
                option.textContent = val;
                if (val === axis.current) option.selected = true;
                select.appendChild(option);
              }
              select.addEventListener("change", () => {
                const newValues = { ...currentValues, [axis.name]: select.value };
                (editor.engine as any).switch_instance_set_variant(BigInt(id), JSON.stringify(newValues));
                editor.requestRender();
                refresh([id]);
              });
              row.appendChild(select);
              setSection.appendChild(row);
            }

            header.appendChild(setSection);
          }
        }
      } catch {}

      // === Interactive Variants (hover/press/focus/disabled) ===
      try {
        const ivJson = editor.engine.get_interactive_variants(BigInt(id));
        const interactiveVariants: Record<string, Record<string, any>> = JSON.parse(ivJson);
        const INTERACTIVE_STATES = ["hover", "press", "focus", "disabled"];

        const ivSection = document.createElement("div");
        ivSection.style.cssText = `
          margin-bottom:8px; padding:8px 10px;
          background:rgba(236,72,153,0.06); border:1px solid rgba(236,72,153,0.15);
          border-radius:8px;
        `;
        const ivTitle = document.createElement("div");
        ivTitle.style.cssText = "font-size:10px;color:#ec4899;letter-spacing:0.3px;margin-bottom:6px;font-weight:600;";
        ivTitle.textContent = "INTERACTIVE VARIANTS";
        ivSection.appendChild(ivTitle);

        // Collect available variant key strings from component info
        const variantKeyStrs: string[] = compInfo.variant_keys || [];

        for (const state of INTERACTIVE_STATES) {
          const row = document.createElement("div");
          row.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:11px;color:#e5e7eb;";

          const label = document.createElement("span");
          label.style.cssText = "color:#ec4899;font-weight:600;min-width:60px;text-transform:capitalize;";
          label.textContent = state;
          row.appendChild(label);

          const select = document.createElement("select");
          select.style.cssText = "flex:1;background:#1e1e2e;color:#e5e7eb;border:1px solid rgba(236,72,153,0.3);border-radius:4px;padding:2px 4px;font-size:10px;";

          // "None" option
          const noneOpt = document.createElement("option");
          noneOpt.value = "";
          noneOpt.textContent = "— None —";
          select.appendChild(noneOpt);

          // Add each variant key as an option
          for (const vkStr of variantKeyStrs) {
            const opt = document.createElement("option");
            opt.value = vkStr;
            opt.textContent = vkStr;
            select.appendChild(opt);
          }

          // Set current value
          const currentKey = interactiveVariants[state];
          if (currentKey) {
            const currentStr = Object.entries(currentKey)
              .map(([k, v]) => {
                const val = typeof v === 'object' && v !== null && 'String' in (v as any) ? (v as any).String : (typeof v === 'object' && v !== null && 'Boolean' in (v as any) ? (v as any).Boolean : v);
                return `${k}=${val}`;
              })
              .sort()
              .join(",");
            select.value = currentStr;
          }

          select.onchange = () => {
            editor.pushUndo();
            if (select.value === "") {
              editor.engine.clear_interactive_variant(BigInt(id), state);
            } else {
              // Parse variant key string "prop1=val1,prop2=val2" back to JSON
              const parts = select.value.split(",");
              const keyObj: Record<string, any> = {};
              for (const part of parts) {
                const [k, v] = part.split("=");
                if (k) {
                  if (v === "true") keyObj[k] = { "Boolean": true };
                  else if (v === "false") keyObj[k] = { "Boolean": false };
                  else keyObj[k] = { "String": v };
                }
              }
              editor.engine.set_interactive_variant(BigInt(id), state, JSON.stringify(keyObj));
            }
            editor.requestRender();
            updatePanel();
          };

          row.appendChild(select);
          ivSection.appendChild(row);
        }

        const ivHint = document.createElement("div");
        ivHint.style.cssText = "font-size:9px;color:#6b7280;font-style:italic;margin-top:4px;";
        ivHint.textContent = "Map states to variants for prototype viewer interaction";
        ivSection.appendChild(ivHint);

        header.appendChild(ivSection);
      } catch(_) {}

      // === Responsive Variant Rules ===
      try {
        const rulesJson = editor.engine.get_responsive_variant_rules(BigInt(id));
        const rules: Array<{label: string, max_width: number, variant_key: Record<string, any>}> = JSON.parse(rulesJson);

        const rvSection = document.createElement("div");
        rvSection.style.cssText = `
          margin-bottom:8px; padding:8px 10px;
          background:rgba(16,185,129,0.06); border:1px solid rgba(16,185,129,0.15);
          border-radius:8px;
        `;
        const rvTitle = document.createElement("div");
        rvTitle.style.cssText = "font-size:10px;color:#10b981;letter-spacing:0.3px;margin-bottom:6px;font-weight:600;display:flex;align-items:center;justify-content:space-between;";
        rvTitle.innerHTML = `RESPONSIVE VARIANTS`;

        const addBtn = document.createElement("button");
        addBtn.style.cssText = `
          background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.3);
          border-radius:4px; padding:1px 6px; color:#10b981;
          cursor:pointer; font-size:10px; font-weight:500;
        `;
        addBtn.textContent = "+ Add";
        addBtn.onclick = () => {
          const label = prompt("Breakpoint label (e.g. Mobile, Tablet):", "Mobile");
          if (!label) return;
          const maxW = prompt("Max width (px):", "375");
          if (!maxW) return;
          // Use current variant as default target
          const currentVariant = compInfo.current_variant_values || {};
          const keyJson = JSON.stringify(currentVariant);
          editor.pushUndo();
          editor.engine.add_responsive_variant_rule(BigInt(id), label, parseFloat(maxW), keyJson);
          editor.requestRender();
          updatePanel();
        };
        rvTitle.appendChild(addBtn);
        rvSection.appendChild(rvTitle);

        for (let ri = 0; ri < rules.length; ri++) {
          const rule = rules[ri];
          const row = document.createElement("div");
          row.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:11px;color:#e5e7eb;";
          row.innerHTML = `
            <span style="color:#10b981;font-weight:600;min-width:60px;">${rule.label}</span>
            <span style="color:#9ca3af;">≤ ${rule.max_width}px</span>
            <span style="color:#6b7280;font-size:10px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">→ ${Object.entries(rule.variant_key).map(([k,v]) => `${k}=${typeof v === 'object' && v !== null && 'String' in (v as any) ? (v as any).String : v}`).join(', ')}</span>
          `;
          const delBtn = document.createElement("button");
          delBtn.style.cssText = "background:none;border:none;color:#ef4444;cursor:pointer;font-size:12px;padding:0 2px;";
          delBtn.textContent = "×";
          delBtn.onclick = () => {
            editor.pushUndo();
            editor.engine.remove_responsive_variant_rule(BigInt(id), ri);
            editor.requestRender();
            updatePanel();
          };
          row.appendChild(delBtn);
          rvSection.appendChild(row);
        }

        if (rules.length === 0) {
          const hint = document.createElement("div");
          hint.style.cssText = "font-size:10px;color:#6b7280;font-style:italic;";
          hint.textContent = "Add rules to auto-switch variant on parent resize";
          rvSection.appendChild(hint);
        }

        header.appendChild(rvSection);
      } catch(_) {}

      // === Style Override Indicators ===
      try {
        const overrideJson = editor.engine.get_instance_overridden_props(id);
        const overrideInfo = JSON.parse(overrideJson);
        if (overrideInfo && overrideInfo.overrides && overrideInfo.overrides.length > 0) {
          const overrideCard = document.createElement("div");
          overrideCard.style.cssText = `
            margin-bottom:8px; padding:8px 10px;
            background:rgba(59,130,246,0.06); border:1px solid rgba(59,130,246,0.15);
            border-radius:8px;
          `;
          const overrideHeader = document.createElement("div");
          overrideHeader.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;";
          const overrideTitle = document.createElement("div");
          overrideTitle.style.cssText = "font-size:10px;color:#3b82f6;letter-spacing:0.3px;font-weight:600;display:flex;align-items:center;gap:4px;";
          overrideTitle.innerHTML = `<span style="width:6px;height:6px;border-radius:50%;background:#3b82f6;display:inline-block;"></span> ${overrideInfo.overrides.length} OVERRIDE${overrideInfo.overrides.length > 1 ? 'S' : ''}`;
          overrideHeader.appendChild(overrideTitle);

          const resetAllBtn = document.createElement("button");
          resetAllBtn.style.cssText = `
            background:rgba(59,130,246,0.15); border:1px solid rgba(59,130,246,0.3);
            border-radius:4px; padding:2px 8px; color:#60a5fa;
            cursor:pointer; font-size:10px; font-weight:500;
            transition:all 0.15s;
          `;
          resetAllBtn.textContent = t("properties.resetAll");
          resetAllBtn.addEventListener("mouseenter", () => { resetAllBtn.style.background = "rgba(59,130,246,0.25)"; });
          resetAllBtn.addEventListener("mouseleave", () => { resetAllBtn.style.background = "rgba(59,130,246,0.15)"; });
          resetAllBtn.addEventListener("click", () => {
            if (confirm("Reset all overrides to match the main component?")) {
              editor.engine.reset_all_instance_overrides(BigInt(id));
              editor.requestRender();
              refresh([id]);
            }
          });
          overrideHeader.appendChild(resetAllBtn);
          overrideCard.appendChild(overrideHeader);

          for (const ov of overrideInfo.overrides) {
            const ovRow = document.createElement("div");
            ovRow.style.cssText = "display:flex;align-items:center;gap:6px;padding:3px 0;font-size:11px;color:#94a3b8;";
            ovRow.innerHTML = `<span style="width:5px;height:5px;border-radius:50%;background:#3b82f6;flex-shrink:0;"></span>`;
            const ovName = document.createElement("span");
            ovName.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
            ovName.textContent = `${ov.node_name}: ${ov.properties.join(", ")}`;
            ovRow.appendChild(ovName);

            const resetBtn = document.createElement("button");
            resetBtn.style.cssText = "background:none;border:none;color:#60a5fa;cursor:pointer;font-size:10px;padding:0 2px;opacity:0.7;";
            resetBtn.textContent = "↺";
            resetBtn.title = "Reset this node's overrides";
            resetBtn.addEventListener("click", () => {
              editor.engine.reset_instance_overrides(BigInt(id), BigInt(ov.node_id));
              editor.requestRender();
              refresh([id]);
            });
            ovRow.appendChild(resetBtn);
            overrideCard.appendChild(ovRow);
          }

          header.appendChild(overrideCard);
        }
      } catch { /* ignore if engine doesn't support */ }

      // === Component Prop Controls ===
      try {
        const propValsJson = editor.engine.get_instance_prop_values(BigInt(id));
        const propVals: Array<{
          name: string;
          prop_type: string;
          value: { type: string; value: any };
          overridden: boolean;
          definition: any;
        }> = JSON.parse(propValsJson);

        if (propVals && propVals.length > 0) {
          const cpSection = document.createElement("div");
          cpSection.style.cssText = `
            margin-bottom:8px; padding:8px 10px;
            background:rgba(251,191,36,0.06); border:1px solid rgba(251,191,36,0.15);
            border-radius:8px;
          `;
          const cpTitle = document.createElement("div");
          cpTitle.style.cssText = "font-size:10px;color:#fbbf24;letter-spacing:0.3px;margin-bottom:6px;font-weight:600;";
          cpTitle.textContent = "COMPONENT PROPS";
          cpSection.appendChild(cpTitle);

          for (const pv of propVals) {
            const propRow = document.createElement("div");
            propRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:4px;";

            // Override indicator (blue dot)
            if (pv.overridden) {
              const dot = document.createElement("span");
              dot.style.cssText = "width:6px;height:6px;border-radius:50%;background:#3b82f6;flex-shrink:0;";
              dot.title = "Overridden";
              propRow.appendChild(dot);
            }

            const propLabel = document.createElement("span");
            propLabel.style.cssText = `font-size:11px;color:#999;min-width:60px;${pv.overridden ? "" : "margin-left:12px;"}`;
            propLabel.textContent = pv.name;
            propRow.appendChild(propLabel);

            if (pv.prop_type === "boolean") {
              const toggle = document.createElement("button");
              const isOn = pv.value.value === true;
              toggle.style.cssText = `
                width:32px; height:18px; border-radius:9px; border:none; cursor:pointer;
                background:${isOn ? "#fbbf24" : "#444"}; position:relative; transition:background 0.2s;
              `;
              const knob = document.createElement("span");
              knob.style.cssText = `
                position:absolute; top:2px; ${isOn ? "right:2px" : "left:2px"};
                width:14px; height:14px; border-radius:7px; background:#fff; transition:all 0.2s;
              `;
              toggle.appendChild(knob);
              toggle.addEventListener("click", () => {
                editor.engine.push_undo();
                editor.engine.set_instance_prop_override(
                  BigInt(id), pv.name,
                  JSON.stringify({ type: "boolean", value: !isOn })
                );
                editor.requestRender();
                refresh([id]);
              });
              propRow.appendChild(toggle);
            } else if (pv.prop_type === "text") {
              const input = document.createElement("input");
              input.style.cssText = `
                flex:1; background:#2a2a2a; border:1px solid #444; border-radius:4px;
                color:#ccc; font-size:11px; padding:3px 6px; outline:none;
              `;
              input.value = pv.value.value || "";
              input.addEventListener("change", () => {
                editor.engine.push_undo();
                editor.engine.set_instance_prop_override(
                  BigInt(id), pv.name,
                  JSON.stringify({ type: "text", value: input.value })
                );
                editor.requestRender();
              });
              propRow.appendChild(input);
            } else if (pv.prop_type === "instance_swap") {
              const select = document.createElement("select");
              select.style.cssText = `
                flex:1; background:#2a2a2a; border:1px solid #444; border-radius:4px;
                color:#ccc; font-size:11px; padding:3px 6px; outline:none; cursor:pointer;
              `;
              // Get all components for dropdown
              try {
                const compsJson = editor.engine.get_components();
                const comps: Array<{ id: number; name: string }> = JSON.parse(compsJson);
                for (const c of comps) {
                  const opt = document.createElement("option");
                  opt.value = String(c.id);
                  opt.textContent = c.name;
                  if (c.id === pv.value.value) opt.selected = true;
                  select.appendChild(opt);
                }
              } catch {}
              select.addEventListener("change", () => {
                editor.engine.push_undo();
                editor.engine.set_instance_prop_override(
                  BigInt(id), pv.name,
                  JSON.stringify({ type: "instance_swap", value: parseInt(select.value) })
                );
                editor.requestRender();
                refresh([id]);
              });
              propRow.appendChild(select);
            }

            // Reset button (if overridden)
            if (pv.overridden) {
              const resetBtn = document.createElement("button");
              resetBtn.style.cssText = "background:none;border:none;color:#60a5fa;cursor:pointer;font-size:10px;padding:0 2px;opacity:0.7;flex-shrink:0;";
              resetBtn.textContent = "↺";
              resetBtn.title = "Reset to default";
              resetBtn.addEventListener("click", () => {
                editor.engine.push_undo();
                editor.engine.reset_instance_prop(BigInt(id), pv.name);
                editor.requestRender();
                refresh([id]);
              });
              propRow.appendChild(resetBtn);
            }

            cpSection.appendChild(propRow);
          }

          header.appendChild(cpSection);
        }
      } catch { /* ignore if engine doesn't support */ }
    }

    // === Component Properties Editor (for component source nodes) ===
    try {
      // Check if the selected node is a component source (name starts with "[C] ")
      if (node.name && node.name.startsWith("[C] ")) {
        // Find the component ID by searching components
        const compsJson = editor.engine.get_components();
        const comps: Array<{ id: number; name: string }> = JSON.parse(compsJson);
        const compName = node.name.replace("[C] ", "");
        const matchedComp = comps.find((c: any) => c.name === compName);
        if (matchedComp) {
          const compId = matchedComp.id;
          const propsJson = editor.engine.get_component_properties(BigInt(compId));
          const props: Array<{ type: string; name: string; default: any; linked_node_id?: number; default_component_id?: number; linked_slot_id?: number }> = JSON.parse(propsJson);

          const cpEditorSection = document.createElement("div");
          cpEditorSection.style.cssText = `
            margin-bottom:8px; padding:8px 10px;
            background:rgba(251,191,36,0.06); border:1px solid rgba(251,191,36,0.15);
            border-radius:8px;
          `;
          const cpEditorTitle = document.createElement("div");
          cpEditorTitle.style.cssText = "font-size:10px;color:#fbbf24;letter-spacing:0.3px;margin-bottom:6px;font-weight:600;display:flex;align-items:center;justify-content:space-between;";
          cpEditorTitle.innerHTML = "COMPONENT PROPERTIES";

          const addPropBtn = document.createElement("button");
          addPropBtn.style.cssText = `
            background:rgba(251,191,36,0.15); border:1px solid rgba(251,191,36,0.3);
            border-radius:4px; padding:1px 6px; color:#fbbf24;
            cursor:pointer; font-size:10px; font-weight:500;
          `;
          addPropBtn.textContent = "+ Add";
          addPropBtn.addEventListener("click", () => {
            // Show add property dialog
            const propType = prompt("Property type (boolean, text, instance_swap):", "boolean");
            if (!propType || !["boolean", "text", "instance_swap"].includes(propType)) return;
            const propName = prompt("Property name:", "");
            if (!propName) return;

            let propJson: any = { type: propType, name: propName };

            // Get children for linked node selection
            const childrenIds = self_getChildrenForComponent(editor, id);
            const childNames = childrenIds.map((cid: number) => {
              const nj = editor.engine.get_node_json(BigInt(cid));
              const n = JSON.parse(nj);
              return `${cid}: ${n.name}`;
            });

            if (propType === "boolean") {
              propJson.default = true;
              const linkedStr = prompt(`Linked node (visibility toggle):\n${childNames.join("\n")}\nEnter node ID:`, "0");
              propJson.linked_node_id = parseInt(linkedStr || "0");
            } else if (propType === "text") {
              propJson.default = prompt("Default text:", "") || "";
              const linkedStr = prompt(`Linked text node:\n${childNames.join("\n")}\nEnter node ID:`, "0");
              propJson.linked_node_id = parseInt(linkedStr || "0");
            } else if (propType === "instance_swap") {
              propJson.default_component_id = 0;
              const linkedStr = prompt(`Linked slot node:\n${childNames.join("\n")}\nEnter node ID:`, "0");
              propJson.linked_slot_id = parseInt(linkedStr || "0");
            }

            editor.engine.push_undo();
            editor.engine.add_component_property(BigInt(compId), JSON.stringify(propJson));
            editor.requestRender();
            refresh([id]);
          });
          cpEditorTitle.appendChild(addPropBtn);
          cpEditorSection.appendChild(cpEditorTitle);

          if (props.length === 0) {
            const hint = document.createElement("div");
            hint.style.cssText = "font-size:11px;color:#666;padding:4px 0;";
            hint.textContent = "No properties defined. Add Boolean, Text, or Instance Swap properties.";
            cpEditorSection.appendChild(hint);
          } else {
            for (const prop of props) {
              const propRow = document.createElement("div");
              propRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:3px;font-size:11px;color:#ccc;";

              const typeBadge = document.createElement("span");
              typeBadge.style.cssText = `
                font-size:9px; padding:1px 4px; border-radius:3px; flex-shrink:0;
                background:${prop.type === "boolean" ? "rgba(16,185,129,0.2);color:#10b981" : prop.type === "text" ? "rgba(59,130,246,0.2);color:#3b82f6" : "rgba(139,92,246,0.2);color:#8b5cf6"};
              `;
              typeBadge.textContent = prop.type === "instance_swap" ? "swap" : prop.type;
              propRow.appendChild(typeBadge);

              const nameSpan = document.createElement("span");
              nameSpan.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
              nameSpan.textContent = prop.name;
              propRow.appendChild(nameSpan);

              const removeBtn = document.createElement("button");
              removeBtn.style.cssText = "background:none;border:none;color:#f87171;cursor:pointer;font-size:10px;padding:0 2px;opacity:0.7;flex-shrink:0;";
              removeBtn.textContent = "✕";
              removeBtn.title = "Remove property";
              removeBtn.addEventListener("click", () => {
                if (confirm(`Remove property "${prop.name}"?`)) {
                  editor.engine.push_undo();
                  editor.engine.remove_component_property(BigInt(compId), prop.name);
                  editor.requestRender();
                  refresh([id]);
                }
              });
              propRow.appendChild(removeBtn);
              cpEditorSection.appendChild(propRow);
            }
          }

          header.appendChild(cpEditorSection);
        }
      }
    } catch { /* ignore */ }

    const nameInput = document.createElement("input");
    nameInput.className = "prop-input";
    nameInput.value = node.name;
    nameInput.style.cssText = "width:100%;font-size:13px;font-weight:500;";
    nameInput.addEventListener("change", () => {
      editor.engine.set_node_name(id, nameInput.value);
    });
    // Lock toggle button next to name
    const lockToggle = document.createElement("button");
    lockToggle.title = node.locked ? "Unlock (locked nodes cannot be moved or resized)" : "Lock (prevent move/resize)";
    lockToggle.innerHTML = (node.locked ? icons.lock : icons.lockOpen).replace(/width="18"/, 'width="16"').replace(/height="18"/, 'height="16"');
    lockToggle.style.cssText = `background:${node.locked ? "rgba(249,115,22,0.15)" : "transparent"};border:1px solid ${node.locked ? "#f97316" : "#444"};border-radius:4px;padding:3px 5px;cursor:pointer;color:${node.locked ? "#f97316" : "#888"};flex-shrink:0;margin-left:4px;display:flex;align-items:center;`;
    lockToggle.addEventListener("click", () => {
      editor.engine.push_undo();
      editor.engine.set_locked(id, !node.locked);
      editor.requestRender();
      renderProperties(editor);
    });
    header.appendChild(nameInput);
    header.appendChild(lockToggle);
    container.appendChild(header);

    // --- Position ---
    const posSection = createSection("Position");
    const posRow = document.createElement("div");
    posRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:6px;";
    posRow.appendChild(createLabeledInput("X", node.x.toFixed(0), (v) => {
      editor.engine.set_node_position(id, parseFloat(v), node.y);
      editor.requestRender();
    }));
    posRow.appendChild(createLabeledInput("Y", node.y.toFixed(0), (v) => {
      editor.engine.set_node_position(id, node.x, parseFloat(v));
      editor.requestRender();
    }));
    posSection.appendChild(posRow);
    container.appendChild(posSection);

    // --- Size ---
    const sizeSection = createSection("Size");
    const sizeRow = document.createElement("div");
    sizeRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:6px;";
    sizeRow.appendChild(createLabeledInput("W", node.width.toFixed(0), (v) => {
      editor.engine.resize_node(id, parseFloat(v), node.height);
      editor.requestRender();
    }));
    sizeRow.appendChild(createLabeledInput("H", node.height.toFixed(0), (v) => {
      editor.engine.resize_node(id, node.width, parseFloat(v));
      editor.requestRender();
    }));
    sizeSection.appendChild(sizeRow);

    // Rotation + corner radius row
    const hasCorner = node.corner_radius !== undefined && (kindLabel === "Rectangle" || kindLabel === "Frame");
    const rotRow = document.createElement("div");
    rotRow.style.cssText = hasCorner
      ? "display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;"
      : "display:grid;grid-template-columns:1fr;gap:6px;margin-top:6px;";
    rotRow.appendChild(createLabeledInput(icons.rotation, node.rotation?.toFixed(1) ?? "0", (_v) => {
      // rotation setter not yet exposed
    }));
    if (hasCorner) {
      rotRow.appendChild(createLabeledInput(icons.cornerRadius, node.corner_radius.toFixed(0), (v) => {
        editor.engine.set_corner_radius(id, parseFloat(v));
        if ((editor as any)._multiEditMode) {
          editor.engine.multi_edit_set_property(BigInt(id), "corner_radius", v);
        }
        editor.requestRender();
      }));
    }
    sizeSection.appendChild(rotRow);

    // Corner Smoothing slider (squircle) — only when corner radius > 0
    if (hasCorner && node.corner_radius > 0) {
      const smoothVal = (editor.engine as any).get_corner_smoothing ? (editor.engine as any).get_corner_smoothing(id) : 0;
      const smRow = document.createElement("div");
      smRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-top:4px;";
      const smLabel = document.createElement("span");
      smLabel.style.cssText = "font-size:11px;color:#aaa;white-space:nowrap;min-width:70px;";
      smLabel.textContent = "Smoothing";
      const smSlider = document.createElement("input");
      smSlider.type = "range";
      smSlider.min = "0";
      smSlider.max = "100";
      smSlider.value = String(Math.round(smoothVal * 100));
      smSlider.style.cssText = "flex:1;height:4px;accent-color:#4a90d9;cursor:pointer;";
      const smNum = document.createElement("input");
      smNum.type = "number";
      smNum.min = "0";
      smNum.max = "100";
      smNum.value = String(Math.round(smoothVal * 100));
      smNum.style.cssText = "width:36px;background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#ddd;font-size:11px;text-align:center;padding:2px;";
      const setSmoothing = (v: number) => {
        const clamped = Math.max(0, Math.min(100, v)) / 100;
        (editor.engine as any).set_corner_smoothing(id, clamped);
        editor.requestRender();
      };
      smSlider.addEventListener("input", () => {
        smNum.value = smSlider.value;
        setSmoothing(parseInt(smSlider.value));
      });
      smNum.addEventListener("change", () => {
        smSlider.value = smNum.value;
        setSmoothing(parseInt(smNum.value));
      });
      smRow.appendChild(smLabel);
      smRow.appendChild(smSlider);
      smRow.appendChild(smNum);
      sizeSection.appendChild(smRow);
    }

    // Sizing mode (Hug/Fill/Fixed) — show for nodes in auto-layout parent
    if (node.parent) {
      const _parentJsonSz = editor.engine.get_node_json(BigInt(node.parent));
      if (_parentJsonSz) {
        const _parentNodeSz = JSON.parse(_parentJsonSz);
        const _parentLayoutSz = JSON.parse(editor.engine.get_layout(BigInt(Number(_parentNodeSz.id))) || "{}");
        if (_parentLayoutSz.mode && _parentLayoutSz.mode !== "None") {
          const sizingJson = editor.engine.get_sizing(BigInt(id));
          const sizing = JSON.parse(sizingJson || '{"h":"fixed","v":"fixed"}');
          const szRow = document.createElement("div");
          szRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;";
          for (const axis of ["h", "v"] as const) {
            const wrap = document.createElement("div");
            wrap.style.cssText = "display:flex;align-items:center;gap:4px;";
            const lbl = document.createElement("span");
            lbl.style.cssText = "font-size:10px;color:#666;width:12px;";
            lbl.textContent = axis === "h" ? "W" : "H";
            wrap.appendChild(lbl);
            const sel = document.createElement("select");
            sel.className = "prop-input";
            sel.style.cssText = "flex:1;font-size:11px;padding:3px 4px;";
            for (const m of ["fixed", "fill", "hug"]) {
              const opt = document.createElement("option");
              opt.value = m;
              opt.textContent = m === "fixed" ? "Fixed" : m === "fill" ? "Fill" : "Hug";
              opt.selected = sizing[axis] === m;
              sel.appendChild(opt);
            }
            sel.addEventListener("change", () => {
              editor.engine.push_undo();
              if (axis === "h") {
                editor.engine.set_sizing_h(BigInt(id), sel.value);
              } else {
                editor.engine.set_sizing_v(BigInt(id), sel.value);
              }
              editor.requestRender();
              refresh(ids);
            });
            wrap.appendChild(sel);
            szRow.appendChild(wrap);
          }
          sizeSection.appendChild(szRow);

          // Absolute position toggle
          const isAbsolute = editor.engine.get_absolute_position(BigInt(id));
          const absRow = document.createElement("div");
          absRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-top:6px;";
          const absCheck = document.createElement("input");
          absCheck.type = "checkbox";
          absCheck.checked = isAbsolute;
          absCheck.style.cssText = "margin:0;accent-color:#4f46e5;";
          absCheck.addEventListener("change", () => {
            editor.engine.push_undo();
            editor.engine.set_absolute_position(BigInt(id), absCheck.checked);
            editor.requestRender();
            refresh(ids);
          });
          const absLabel = document.createElement("span");
          absLabel.style.cssText = "font-size:11px;color:#999;";
          absLabel.textContent = t("properties.absolutePosition");
          absRow.appendChild(absCheck);
          absRow.appendChild(absLabel);
          sizeSection.appendChild(absRow);
        }
      }
    }

    // Also show Hug sizing option on the auto-layout container itself
    {
      const sizingJson = editor.engine.get_sizing(BigInt(id));
      const sizing = JSON.parse(sizingJson || '{"h":"fixed","v":"fixed"}');
      const layoutJson2 = editor.engine.get_layout(BigInt(id));
      const layout2 = JSON.parse(layoutJson2 || "{}");
      if (layout2.mode && layout2.mode !== "None") {
        const szRow2 = document.createElement("div");
        szRow2.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;";
        for (const axis of ["h", "v"] as const) {
          const wrap = document.createElement("div");
          wrap.style.cssText = "display:flex;align-items:center;gap:4px;";
          const lbl = document.createElement("span");
          lbl.style.cssText = "font-size:10px;color:#666;width:12px;";
          lbl.textContent = axis === "h" ? "W" : "H";
          wrap.appendChild(lbl);
          const sel = document.createElement("select");
          sel.className = "prop-input";
          sel.style.cssText = "flex:1;font-size:11px;padding:3px 4px;";
          for (const m of ["fixed", "hug"]) {
            const opt = document.createElement("option");
            opt.value = m;
            opt.textContent = m === "fixed" ? "Fixed" : "Hug";
            opt.selected = sizing[axis] === m;
            sel.appendChild(opt);
          }
          sel.addEventListener("change", () => {
            editor.engine.push_undo();
            if (axis === "h") {
              editor.engine.set_sizing_h(BigInt(id), sel.value);
            } else {
              editor.engine.set_sizing_v(BigInt(id), sel.value);
            }
            editor.requestRender();
            refresh(ids);
          });
          wrap.appendChild(sel);
          szRow2.appendChild(wrap);
        }
        sizeSection.appendChild(szRow2);
      }
    }

    // --- Min/Max size constraints ---
    {
      const mmJson = editor.engine.get_min_max_size(BigInt(id));
      const mm = JSON.parse(mmJson || '{"min_w":null,"max_w":null,"min_h":null,"max_h":null}');
      const mmRow = document.createElement("div");
      mmRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:4px;margin-top:6px;";
      for (const [key, label] of [["min_w","Min W"],["max_w","Max W"],["min_h","Min H"],["max_h","Max H"]] as const) {
        const wrap = document.createElement("div");
        wrap.style.cssText = "display:flex;flex-direction:column;gap:2px;";
        const lbl = document.createElement("span");
        lbl.style.cssText = "font-size:9px;color:#888;";
        lbl.textContent = label;
        wrap.appendChild(lbl);
        const inp = document.createElement("input");
        inp.type = "number";
        inp.className = "prop-input";
        inp.style.cssText = "width:100%;font-size:11px;padding:3px 4px;";
        inp.placeholder = "—";
        inp.value = mm[key] != null ? String(mm[key]) : "";
        inp.addEventListener("change", () => {
          editor.engine.push_undo();
          const val = inp.value === "" ? 0 : parseFloat(inp.value);
          const bigId = BigInt(id);
          if (key === "min_w") editor.engine.set_min_width(bigId, val);
          else if (key === "max_w") editor.engine.set_max_width(bigId, val);
          else if (key === "min_h") editor.engine.set_min_height(bigId, val);
          else editor.engine.set_max_height(bigId, val);
          editor.requestRender();
          refresh(ids);
        });
        wrap.appendChild(inp);
        mmRow.appendChild(wrap);
      }
      sizeSection.appendChild(mmRow);
    }

    container.appendChild(sizeSection);

    // --- Constraints (only for children of Frame) ---
    if (node.parent) {
      const parentJson = editor.engine.get_node_json(BigInt(node.parent));
      if (parentJson) {
        const parentNode = JSON.parse(parentJson);
        const parentKind = typeof parentNode.kind === "string" ? parentNode.kind : Object.keys(parentNode.kind)[0];
        if (parentKind === "Frame" || parentKind === "Group") {
          const constraintsJson = editor.engine.get_constraints(BigInt(id));
          const constraints = JSON.parse(constraintsJson);
          const constraintSection = createSection("Constraints");

          const hOptions = [
            { value: "left", label: "Left" },
            { value: "right", label: "Right" },
            { value: "leftAndRight", label: "Left & Right" },
            { value: "center", label: "Center" },
            { value: "scale", label: "Scale" },
          ];
          const vOptions = [
            { value: "top", label: "Top" },
            { value: "bottom", label: "Bottom" },
            { value: "topAndBottom", label: "Top & Bottom" },
            { value: "center", label: "Center" },
            { value: "scale", label: "Scale" },
          ];

          const hRow = document.createElement("div");
          hRow.className = "prop-row";
          const hLabel = document.createElement("span");
          hLabel.className = "prop-label";
          hLabel.textContent = "H";
          hLabel.style.width = "24px";
          const hSelect = document.createElement("select");
          hSelect.className = "prop-input";
          hSelect.style.flex = "1";
          for (const opt of hOptions) {
            const o = document.createElement("option");
            o.value = opt.value;
            o.textContent = opt.label;
            if (constraints.horizontal === opt.value) o.selected = true;
            hSelect.appendChild(o);
          }
          hSelect.addEventListener("change", () => {
            editor.engine.push_undo();
            editor.engine.set_constraints(BigInt(id), hSelect.value, vSelect.value);
            editor.requestRender();
          });
          hRow.appendChild(hLabel);
          hRow.appendChild(hSelect);
          constraintSection.appendChild(hRow);

          const vRow = document.createElement("div");
          vRow.className = "prop-row";
          const vLabel = document.createElement("span");
          vLabel.className = "prop-label";
          vLabel.textContent = "V";
          vLabel.style.width = "24px";
          const vSelect = document.createElement("select");
          vSelect.className = "prop-input";
          vSelect.style.flex = "1";
          for (const opt of vOptions) {
            const o = document.createElement("option");
            o.value = opt.value;
            o.textContent = opt.label;
            if (constraints.vertical === opt.value) o.selected = true;
            vSelect.appendChild(o);
          }
          vSelect.addEventListener("change", () => {
            editor.engine.push_undo();
            editor.engine.set_constraints(BigInt(id), hSelect.value, vSelect.value);
            editor.requestRender();
          });
          vRow.appendChild(vLabel);
          vRow.appendChild(vSelect);
          constraintSection.appendChild(vRow);

          container.appendChild(constraintSection);
        }
      }
    }

    // --- Appearance ---
    const appSection = createSection("Appearance");

    // Opacity slider row
    const opacityRow = document.createElement("div");
    opacityRow.className = "prop-row";
    const opacityLabel = document.createElement("span");
    opacityLabel.className = "prop-label";
    opacityLabel.style.cssText = "display:flex;align-items:center;justify-content:center;width:24px;";
    opacityLabel.innerHTML = icons.opacity;
    opacityRow.appendChild(opacityLabel);

    const opacitySlider = document.createElement("input");
    opacitySlider.type = "range";
    opacitySlider.min = "0";
    opacitySlider.max = "100";
    opacitySlider.value = String(Math.round(node.opacity * 100));
    opacitySlider.className = "prop-slider";
    opacityRow.appendChild(opacitySlider);

    const opacityVal = document.createElement("input");
    opacityVal.className = "prop-input";
    opacityVal.style.width = "48px";
    opacityVal.style.flex = "none";
    opacityVal.value = Math.round(node.opacity * 100) + "%";
    opacityRow.appendChild(opacityVal);

    const setOpacity = (pct: number) => {
      const clamped = Math.max(0, Math.min(100, pct));
      editor.engine.set_opacity(id, clamped / 100);
      if ((editor as any)._multiEditMode) {
        editor.engine.multi_edit_set_property(BigInt(id), "opacity", JSON.stringify(clamped / 100));
      }
      opacitySlider.value = String(clamped);
      opacityVal.value = clamped + "%";
      editor.requestRender();
    };
    opacitySlider.addEventListener("input", () => setOpacity(parseInt(opacitySlider.value)));
    opacityVal.addEventListener("change", () => setOpacity(parseInt(opacityVal.value)));
    appSection.appendChild(opacityRow);

    // Mask toggle
    {
      const maskRow = document.createElement("div");
      maskRow.className = "prop-row";
      maskRow.style.alignItems = "center";
      const maskLabel = document.createElement("label");
      maskLabel.style.cssText = "display:flex;align-items:center;gap:6px;cursor:pointer;color:#aaa;font-size:12px;";
      const maskCheck = document.createElement("input");
      maskCheck.type = "checkbox";
      maskCheck.checked = editor.engine.get_mask(BigInt(id));
      maskCheck.style.cssText = "accent-color:#818cf8;";
      maskCheck.addEventListener("change", () => {
        ensureUndo();
        editor.engine.set_mask(BigInt(id), maskCheck.checked);
        editor.requestRender();
        editor.notifyLayers();
      });
      maskLabel.appendChild(maskCheck);
      maskLabel.appendChild(document.createTextNode("Use as mask"));
      maskRow.appendChild(maskLabel);
      appSection.appendChild(maskRow);
    }

    container.appendChild(appSection);

    // --- Color Style ---
    {
      const styleSection = createSection("Color Style");
      const styleInfoJson = editor.engine.get_node_style_info(id);
      const styleInfo = JSON.parse(styleInfoJson || "null");
      const colorStylesJson = editor.engine.list_color_styles();
      const colorStyles: any[] = JSON.parse(colorStylesJson || "[]");

      const styleRow = document.createElement("div");
      styleRow.style.cssText = "display:flex;gap:4px;align-items:center;";

      const styleSelect = document.createElement("select");
      styleSelect.className = "prop-input";
      styleSelect.style.flex = "1";
      const noneOpt = document.createElement("option");
      noneOpt.value = "";
      noneOpt.textContent = styleInfo?.color_style_id ? "— Detach —" : "— None —";
      styleSelect.appendChild(noneOpt);
      for (const cs of colorStyles) {
        const opt = document.createElement("option");
        opt.value = String(cs.id);
        opt.textContent = cs.name;
        opt.style.color = `rgb(${cs.r},${cs.g},${cs.b})`;
        if (styleInfo?.color_style_id === cs.id) opt.selected = true;
        styleSelect.appendChild(opt);
      }
      styleSelect.addEventListener("change", () => {
        ensureUndo();
        if (styleSelect.value) {
          editor.engine.apply_color_style(id, BigInt(styleSelect.value));
        } else {
          editor.engine.detach_color_style(id);
        }
        editor.requestRender();
        refresh(ids);
      });
      styleRow.appendChild(styleSelect);

      // Quick create from current fill
      const createBtn = document.createElement("button");
      createBtn.style.cssText = "background:none;border:1px solid #444;border-radius:4px;color:#888;cursor:pointer;font-size:11px;padding:3px 6px;white-space:nowrap;";
      createBtn.textContent = "+";
      createBtn.title = "Create color style from current fill";
      createBtn.addEventListener("click", () => {
        ensureUndo();
        const fillInfoJson = editor.engine.get_fill_info(id);
        const fillInfo = JSON.parse(fillInfoJson || "null");
        const c = fillInfo?.color || { r: 200, g: 200, b: 200, a: 1 };
        const name = prompt("Color style name:", "Color " + (colorStyles.length + 1));
        if (name) {
          const sid = editor.engine.add_color_style(name, c.r, c.g, c.b, c.a);
          editor.engine.apply_color_style(id, sid);
          editor.requestRender();
          refresh(ids);
        }
      });
      styleRow.appendChild(createBtn);
      styleSection.appendChild(styleRow);

      // Show linked style indicator
      if (styleInfo?.color_style_name) {
        const linkedLabel = document.createElement("div");
        linkedLabel.style.cssText = "font-size:10px;color:#818cf8;margin-top:4px;";
        linkedLabel.textContent = `🔗 ${styleInfo.color_style_name}`;
        styleSection.appendChild(linkedLabel);
      }

      container.appendChild(styleSection);
    }

    // --- Fills (multi-fill) ---
    {
      const fillSection = createSection("Fill");
      const fillsJson = editor.engine.get_fills(id);
      const fills: any[] = JSON.parse(fillsJson || "[]");

      fills.forEach((fill: any, idx: number) => {
        const fillWrap = document.createElement("div");
        fillWrap.style.cssText = "background:#1e1e1e;border-radius:6px;padding:8px;margin-bottom:6px;position:relative;";

        // Header: visibility toggle + fill type + delete
        const hdr = document.createElement("div");
        hdr.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:6px;";

        const visBtn = document.createElement("button");
        visBtn.style.cssText = `width:18px;height:18px;border:1px solid ${fill.visible ? "#4f46e5" : "#444"};border-radius:4px;background:${fill.visible ? "#4f46e520" : "#2a2a2a"};cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;`;
        visBtn.innerHTML = fill.visible ? icons.eye.replace(/width="\d+"/, 'width="12"').replace(/height="\d+"/, 'height="12"') : icons.eyeOff.replace(/width="\d+"/, 'width="12"').replace(/height="\d+"/, 'height="12"');
        visBtn.addEventListener("click", () => {
          ensureUndo();
          editor.engine.set_fill_visible_at(id, idx, !fill.visible);
          editor.requestRender();
          refresh(ids);
        });
        hdr.appendChild(visBtn);

        // Fill type selector
        const typeSelect = document.createElement("select");
        typeSelect.className = "prop-input";
        typeSelect.style.cssText = "flex:1;font-size:11px;";
        for (const t of ["Solid", "LinearGradient", "RadialGradient", "ConicGradient", "Pattern", "NoiseFill", "DotPattern", "CrosshatchFill", "GradientMesh"]) {
          const opt = document.createElement("option");
          opt.value = t;
          opt.textContent = t === "LinearGradient" ? "Linear" : t === "RadialGradient" ? "Radial" : t === "ConicGradient" ? "Conic" : t === "NoiseFill" ? "Noise" : t === "DotPattern" ? "Dots" : t === "CrosshatchFill" ? "Crosshatch" : t === "GradientMesh" ? "Mesh" : t;
          if (fill.type === t) opt.selected = true;
          typeSelect.appendChild(opt);
        }
        typeSelect.addEventListener("change", () => {
          ensureUndo();
          if (typeSelect.value === "Solid") {
            const c = fill.color || fill.stops?.[0] || { r: 200, g: 200, b: 200, a: 1 };
            editor.engine.update_fill_at(id, idx, c.r, c.g, c.b, c.a);
          } else if (typeSelect.value === "LinearGradient") {
            const stops = fill.stops || [
              { offset: 0, r: 79, g: 70, b: 229, a: 1 },
              { offset: 1, r: 16, g: 185, b: 129, a: 1 },
            ];
            editor.engine.set_fill_linear_gradient_at(id, idx, 0, 0, 1, 1, JSON.stringify(stops));
          } else if (typeSelect.value === "RadialGradient") {
            const stops = fill.stops || [
              { offset: 0, r: 79, g: 70, b: 229, a: 1 },
              { offset: 1, r: 16, g: 185, b: 129, a: 1 },
            ];
            editor.engine.set_fill_radial_gradient_at(id, idx, 0.5, 0.5, 0.5, JSON.stringify(stops));
          } else if (typeSelect.value === "ConicGradient") {
            const stops = fill.stops || [
              { offset: 0, r: 255, g: 0, b: 0, a: 1 },
              { offset: 0.33, r: 0, g: 255, b: 0, a: 1 },
              { offset: 0.66, r: 0, g: 0, b: 255, a: 1 },
              { offset: 1, r: 255, g: 0, b: 0, a: 1 },
            ];
            editor.engine.set_fill_conic_gradient_at(id, idx, 0.5, 0.5, 0, JSON.stringify(stops));
          } else if (typeSelect.value === "Pattern") {
            editor.engine.set_fill_pattern_at(id, idx, "", 1.0, 0, "Tile", 50, 50);
          } else if (typeSelect.value === "NoiseFill") {
            editor.engine.set_fill_noise_at(id, idx, 8.0, 40, 40, 60, 1.0, 200, 200, 220, 1.0, 0.7, 42);
          } else if (typeSelect.value === "DotPattern") {
            editor.engine.set_fill_dot_pattern_at(id, idx, 3.0, 12.0, 100, 100, 120, 1.0, 30, 30, 40, 1.0, 0.0);
          } else if (typeSelect.value === "CrosshatchFill") {
            editor.engine.set_fill_crosshatch_at(id, idx, 10.0, 1.0, 100, 100, 120, 1.0, 30, 30, 40, 1.0, 45.0, 2);
          } else if (typeSelect.value === "GradientMesh") {
            editor.engine.set_fill_gradient_mesh_default_at(id, idx);
          }
          editor.requestRender();
          refresh(ids);
        });
        hdr.appendChild(typeSelect);

        // Move up/down buttons
        if (fills.length > 1) {
          if (idx > 0) {
            const upBtn = document.createElement("button");
            upBtn.style.cssText = "background:none;border:1px solid #444;border-radius:4px;color:#888;cursor:pointer;font-size:10px;padding:2px 4px;";
            upBtn.textContent = "▲";
            upBtn.title = "Move up";
            upBtn.addEventListener("click", () => { ensureUndo(); editor.engine.move_fill(id, idx, idx - 1); editor.requestRender(); refresh(ids); });
            hdr.appendChild(upBtn);
          }
          if (idx < fills.length - 1) {
            const dnBtn = document.createElement("button");
            dnBtn.style.cssText = "background:none;border:1px solid #444;border-radius:4px;color:#888;cursor:pointer;font-size:10px;padding:2px 4px;";
            dnBtn.textContent = "▼";
            dnBtn.title = "Move down";
            dnBtn.addEventListener("click", () => { ensureUndo(); editor.engine.move_fill(id, idx, idx + 1); editor.requestRender(); refresh(ids); });
            hdr.appendChild(dnBtn);
          }
        }

        const delBtn = document.createElement("button");
        delBtn.style.cssText = "background:transparent;border:none;color:#555;cursor:pointer;font-size:11px;padding:2px 4px;border-radius:4px;";
        delBtn.textContent = "✕";
        delBtn.addEventListener("click", () => { ensureUndo(); editor.engine.remove_fill(id, idx); editor.requestRender(); refresh(ids); });
        hdr.appendChild(delBtn);
        fillWrap.appendChild(hdr);

        // Fill content based on type
        if (fill.type === "Pattern") {
          // Pattern fill UI
          const patWrap = document.createElement("div");
          patWrap.style.cssText = "display:flex;flex-direction:column;gap:4px;";

          // Image source (file picker)
          const srcRow = document.createElement("div");
          srcRow.style.cssText = "display:flex;align-items:center;gap:4px;";
          const srcLabel = document.createElement("span");
          srcLabel.style.cssText = "font-size:10px;color:#888;width:32px;";
          srcLabel.textContent = "Src";
          srcRow.appendChild(srcLabel);
          const srcBtn = document.createElement("button");
          srcBtn.className = "prop-add-btn";
          srcBtn.style.cssText = "flex:1;font-size:10px;padding:3px 6px;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;";
          srcBtn.textContent = fill.src ? "Change image…" : "Choose image…";
          srcBtn.addEventListener("click", () => {
            const inp = document.createElement("input");
            inp.type = "file";
            inp.accept = "image/*";
            inp.addEventListener("change", () => {
              const file = inp.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                ensureUndo();
                const dataUrl = reader.result as string;
                editor.engine.set_fill_pattern_at(
                  id, idx, dataUrl,
                  fill.scale ?? 1, fill.rotation ?? 0,
                  fill.pattern_type ?? "Tile",
                  fill.tile_width ?? 0, fill.tile_height ?? 0
                );
                editor.requestRender();
                refresh(ids);
              };
              reader.readAsDataURL(file);
            });
            inp.click();
          });
          srcRow.appendChild(srcBtn);
          patWrap.appendChild(srcRow);

          // Scale
          const scaleRow = document.createElement("div");
          scaleRow.style.cssText = "display:flex;align-items:center;gap:4px;";
          const scaleLabel = document.createElement("span");
          scaleLabel.style.cssText = "font-size:10px;color:#888;width:32px;";
          scaleLabel.textContent = t("properties.scale");
          scaleRow.appendChild(scaleLabel);
          const scaleInput = document.createElement("input");
          scaleInput.className = "prop-input";
          scaleInput.style.cssText = "flex:1;font-size:11px;";
          scaleInput.type = "number";
          scaleInput.step = "0.1";
          scaleInput.min = "0.1";
          scaleInput.max = "10";
          scaleInput.value = String(fill.scale ?? 1);
          scaleInput.addEventListener("change", () => {
            ensureUndo();
            editor.engine.set_fill_pattern_at(
              id, idx, fill.src ?? "",
              parseFloat(scaleInput.value) || 1, fill.rotation ?? 0,
              fill.pattern_type ?? "Tile",
              fill.tile_width ?? 0, fill.tile_height ?? 0
            );
            editor.requestRender();
            refresh(ids);
          });
          scaleRow.appendChild(scaleInput);
          patWrap.appendChild(scaleRow);

          // Rotation
          const rotRow = document.createElement("div");
          rotRow.style.cssText = "display:flex;align-items:center;gap:4px;";
          const rotLabel = document.createElement("span");
          rotLabel.style.cssText = "font-size:10px;color:#888;width:32px;";
          rotLabel.textContent = t("properties.rotation");
          rotRow.appendChild(rotLabel);
          const rotInput = document.createElement("input");
          rotInput.className = "prop-input";
          rotInput.style.cssText = "flex:1;font-size:11px;";
          rotInput.type = "number";
          rotInput.value = String(fill.rotation ?? 0);
          rotInput.addEventListener("change", () => {
            ensureUndo();
            editor.engine.set_fill_pattern_at(
              id, idx, fill.src ?? "",
              fill.scale ?? 1, parseFloat(rotInput.value) || 0,
              fill.pattern_type ?? "Tile",
              fill.tile_width ?? 0, fill.tile_height ?? 0
            );
            editor.requestRender();
            refresh(ids);
          });
          rotRow.appendChild(rotInput);
          rotRow.appendChild(document.createTextNode("°"));
          patWrap.appendChild(rotRow);

          // Pattern type
          const ptRow = document.createElement("div");
          ptRow.style.cssText = "display:flex;align-items:center;gap:4px;";
          const ptLabel = document.createElement("span");
          ptLabel.style.cssText = "font-size:10px;color:#888;width:32px;";
          ptLabel.textContent = "Type";
          ptRow.appendChild(ptLabel);
          const ptSelect = document.createElement("select");
          ptSelect.className = "prop-input";
          ptSelect.style.cssText = "flex:1;font-size:11px;";
          for (const pt of ["Tile", "Brick", "Hex"]) {
            const opt = document.createElement("option");
            opt.value = pt;
            opt.textContent = pt;
            if ((fill.pattern_type ?? "Tile") === pt) opt.selected = true;
            ptSelect.appendChild(opt);
          }
          ptSelect.addEventListener("change", () => {
            ensureUndo();
            editor.engine.set_fill_pattern_at(
              id, idx, fill.src ?? "",
              fill.scale ?? 1, fill.rotation ?? 0,
              ptSelect.value,
              fill.tile_width ?? 0, fill.tile_height ?? 0
            );
            editor.requestRender();
            refresh(ids);
          });
          ptRow.appendChild(ptSelect);
          patWrap.appendChild(ptRow);

          // Tile size
          const tileRow = document.createElement("div");
          tileRow.style.cssText = "display:flex;align-items:center;gap:4px;";
          const tileLabel = document.createElement("span");
          tileLabel.style.cssText = "font-size:10px;color:#888;width:32px;";
          tileLabel.textContent = "Tile";
          tileRow.appendChild(tileLabel);
          const twInput = document.createElement("input");
          twInput.className = "prop-input";
          twInput.style.cssText = "flex:1;font-size:11px;";
          twInput.type = "number";
          twInput.placeholder = "W";
          twInput.value = String(fill.tile_width ?? 0);
          const thInput = document.createElement("input");
          thInput.className = "prop-input";
          thInput.style.cssText = "flex:1;font-size:11px;";
          thInput.type = "number";
          thInput.placeholder = "H";
          thInput.value = String(fill.tile_height ?? 0);
          const updateTile = () => {
            ensureUndo();
            editor.engine.set_fill_pattern_at(
              id, idx, fill.src ?? "",
              fill.scale ?? 1, fill.rotation ?? 0,
              fill.pattern_type ?? "Tile",
              parseFloat(twInput.value) || 0, parseFloat(thInput.value) || 0
            );
            editor.requestRender();
            refresh(ids);
          };
          twInput.addEventListener("change", updateTile);
          thInput.addEventListener("change", updateTile);
          tileRow.appendChild(twInput);
          tileRow.appendChild(thInput);
          patWrap.appendChild(tileRow);

          fillWrap.appendChild(patWrap);
        } else if (fill.type === "NoiseFill") {
          // Noise fill UI
          const nw = document.createElement("div");
          nw.style.cssText = "display:flex;flex-direction:column;gap:4px;";
          const makeRow = (label: string, val: string, onChange: (v: string) => void, props?: any) => {
            const row = document.createElement("div");
            row.style.cssText = "display:flex;align-items:center;gap:4px;";
            const lbl = document.createElement("span");
            lbl.style.cssText = "font-size:10px;color:#888;width:42px;";
            lbl.textContent = label;
            row.appendChild(lbl);
            const inp = document.createElement("input");
            inp.className = "prop-input";
            inp.style.cssText = "flex:1;font-size:11px;";
            inp.type = "number";
            inp.value = val;
            if (props) Object.assign(inp, props);
            inp.addEventListener("change", () => { ensureUndo(); onChange(inp.value); editor.requestRender(); refresh(ids); });
            row.appendChild(inp);
            return row;
          };
          const c1 = fill.color1 || { r: 40, g: 40, b: 60, a: 1 };
          const c2 = fill.color2 || { r: 200, g: 200, b: 220, a: 1 };
          const applyNoise = () => {
            editor.engine.set_fill_noise_at(id, idx, parseFloat((nw.querySelector('[data-p="scale"]') as any)?.value) || 8, c1.r, c1.g, c1.b, c1.a, c2.r, c2.g, c2.b, c2.a, parseFloat((nw.querySelector('[data-p="intensity"]') as any)?.value) || 0.7, parseInt((nw.querySelector('[data-p="seed"]') as any)?.value) || 42);
          };
          const scaleR = makeRow("Scale", String(fill.scale ?? 8), () => applyNoise());
          (scaleR.querySelector("input") as any).dataset.p = "scale";
          (scaleR.querySelector("input") as any).step = "1"; (scaleR.querySelector("input") as any).min = "2";
          nw.appendChild(scaleR);
          const intR = makeRow("Intensity", String(fill.intensity ?? 0.7), () => applyNoise());
          (intR.querySelector("input") as any).dataset.p = "intensity";
          (intR.querySelector("input") as any).step = "0.05"; (intR.querySelector("input") as any).min = "0"; (intR.querySelector("input") as any).max = "1";
          nw.appendChild(intR);
          const seedR = makeRow("Seed", String(fill.seed ?? 42), () => applyNoise());
          (seedR.querySelector("input") as any).dataset.p = "seed";
          nw.appendChild(seedR);
          // Color 1
          const c1Label = document.createElement("span");
          c1Label.style.cssText = "font-size:10px;color:#888;";
          c1Label.textContent = "Color 1";
          nw.appendChild(c1Label);
          nw.appendChild(createColorRow(c1, (r, g, b, a) => {
            c1.r = r; c1.g = g; c1.b = b; c1.a = a;
            ensureUndo(); applyNoise(); editor.requestRender(); refresh(ids);
          }));
          const c2Label = document.createElement("span");
          c2Label.style.cssText = "font-size:10px;color:#888;";
          c2Label.textContent = "Color 2";
          nw.appendChild(c2Label);
          nw.appendChild(createColorRow(c2, (r, g, b, a) => {
            c2.r = r; c2.g = g; c2.b = b; c2.a = a;
            ensureUndo(); applyNoise(); editor.requestRender(); refresh(ids);
          }));
          fillWrap.appendChild(nw);
        } else if (fill.type === "DotPattern") {
          // Dot pattern fill UI
          const dw = document.createElement("div");
          dw.style.cssText = "display:flex;flex-direction:column;gap:4px;";
          const dc = fill.color || { r: 100, g: 100, b: 120, a: 1 };
          const dbg = fill.bg_color || { r: 30, g: 30, b: 40, a: 1 };
          const applyDot = (dotR?: number, sp?: number, ang?: number) => {
            editor.engine.set_fill_dot_pattern_at(id, idx, dotR ?? fill.dot_radius ?? 3, sp ?? fill.spacing ?? 12, dc.r, dc.g, dc.b, dc.a, dbg.r, dbg.g, dbg.b, dbg.a, ang ?? fill.angle ?? 0);
          };
          const mkRow = (label: string, val: string, key: string, props?: any) => {
            const row = document.createElement("div");
            row.style.cssText = "display:flex;align-items:center;gap:4px;";
            const lbl = document.createElement("span");
            lbl.style.cssText = "font-size:10px;color:#888;width:42px;";
            lbl.textContent = label;
            row.appendChild(lbl);
            const inp = document.createElement("input");
            inp.className = "prop-input";
            inp.style.cssText = "flex:1;font-size:11px;";
            inp.type = "number";
            inp.value = val;
            inp.dataset.p = key;
            if (props) Object.assign(inp, props);
            inp.addEventListener("change", () => {
              ensureUndo();
              const dr = parseFloat((dw.querySelector('[data-p="radius"]') as any)?.value) || 3;
              const sp = parseFloat((dw.querySelector('[data-p="spacing"]') as any)?.value) || 12;
              const ang = parseFloat((dw.querySelector('[data-p="angle"]') as any)?.value) || 0;
              applyDot(dr, sp, ang);
              editor.requestRender(); refresh(ids);
            });
            row.appendChild(inp);
            return row;
          };
          dw.appendChild(mkRow("Radius", String(fill.dot_radius ?? 3), "radius", { step: "0.5", min: "0.5" }));
          dw.appendChild(mkRow("Spacing", String(fill.spacing ?? 12), "spacing", { step: "1", min: "2" }));
          dw.appendChild(mkRow("Angle", String(fill.angle ?? 0), "angle", { step: "5" }));
          const dcLabel = document.createElement("span");
          dcLabel.style.cssText = "font-size:10px;color:#888;";
          dcLabel.textContent = "Dot Color";
          dw.appendChild(dcLabel);
          dw.appendChild(createColorRow(dc, (r, g, b, a) => {
            dc.r = r; dc.g = g; dc.b = b; dc.a = a;
            ensureUndo(); applyDot(); editor.requestRender(); refresh(ids);
          }));
          const dbgLabel = document.createElement("span");
          dbgLabel.style.cssText = "font-size:10px;color:#888;";
          dbgLabel.textContent = "Background";
          dw.appendChild(dbgLabel);
          dw.appendChild(createColorRow(dbg, (r, g, b, a) => {
            dbg.r = r; dbg.g = g; dbg.b = b; dbg.a = a;
            ensureUndo(); applyDot(); editor.requestRender(); refresh(ids);
          }));
          fillWrap.appendChild(dw);
        } else if (fill.type === "CrosshatchFill") {
          // Crosshatch fill UI
          const cw = document.createElement("div");
          cw.style.cssText = "display:flex;flex-direction:column;gap:4px;";
          const cc = fill.color || { r: 100, g: 100, b: 120, a: 1 };
          const cbg = fill.bg_color || { r: 30, g: 30, b: 40, a: 1 };
          const applyCross = () => {
            const sp = parseFloat((cw.querySelector('[data-p="spacing"]') as any)?.value) || 10;
            const lw = parseFloat((cw.querySelector('[data-p="lineWidth"]') as any)?.value) || 1;
            const ang = parseFloat((cw.querySelector('[data-p="angle"]') as any)?.value) || 45;
            const den = parseInt((cw.querySelector('[data-p="density"]') as any)?.value) || 2;
            editor.engine.set_fill_crosshatch_at(id, idx, sp, lw, cc.r, cc.g, cc.b, cc.a, cbg.r, cbg.g, cbg.b, cbg.a, ang, den);
          };
          const mkCRow = (label: string, val: string, key: string, props?: any) => {
            const row = document.createElement("div");
            row.style.cssText = "display:flex;align-items:center;gap:4px;";
            const lbl = document.createElement("span");
            lbl.style.cssText = "font-size:10px;color:#888;width:48px;";
            lbl.textContent = label;
            row.appendChild(lbl);
            const inp = document.createElement("input");
            inp.className = "prop-input";
            inp.style.cssText = "flex:1;font-size:11px;";
            inp.type = "number";
            inp.value = val;
            inp.dataset.p = key;
            if (props) Object.assign(inp, props);
            inp.addEventListener("change", () => { ensureUndo(); applyCross(); editor.requestRender(); refresh(ids); });
            row.appendChild(inp);
            return row;
          };
          cw.appendChild(mkCRow("Spacing", String(fill.spacing ?? 10), "spacing", { step: "1", min: "2" }));
          cw.appendChild(mkCRow("Width", String(fill.line_width ?? 1), "lineWidth", { step: "0.5", min: "0.5" }));
          cw.appendChild(mkCRow("Angle", String(fill.angle ?? 45), "angle", { step: "5" }));
          cw.appendChild(mkCRow("Density", String(fill.density ?? 2), "density", { step: "1", min: "1", max: "2" }));
          const ccLabel = document.createElement("span");
          ccLabel.style.cssText = "font-size:10px;color:#888;";
          ccLabel.textContent = "Line Color";
          cw.appendChild(ccLabel);
          cw.appendChild(createColorRow(cc, (r, g, b, a) => {
            cc.r = r; cc.g = g; cc.b = b; cc.a = a;
            ensureUndo(); applyCross(); editor.requestRender(); refresh(ids);
          }));
          const cbgLabel = document.createElement("span");
          cbgLabel.style.cssText = "font-size:10px;color:#888;";
          cbgLabel.textContent = "Background";
          cw.appendChild(cbgLabel);
          cw.appendChild(createColorRow(cbg, (r, g, b, a) => {
            cbg.r = r; cbg.g = g; cbg.b = b; cbg.a = a;
            ensureUndo(); applyCross(); editor.requestRender(); refresh(ids);
          }));
          fillWrap.appendChild(cw);
        } else if (fill.type === "GradientMesh") {
          // Gradient Mesh UI
          const mw = document.createElement("div");
          mw.style.cssText = "display:flex;flex-direction:column;gap:4px;";
          const meshRows = fill.rows || 2;
          const meshCols = fill.cols || 2;
          const meshPts = fill.points || [];

          // Grid size info
          const sizeRow = document.createElement("div");
          sizeRow.style.cssText = "display:flex;align-items:center;gap:4px;";
          const sizeLabel = document.createElement("span");
          sizeLabel.style.cssText = "font-size:10px;color:#888;flex:1;";
          sizeLabel.textContent = `Grid: ${meshRows}×${meshCols} (${meshPts.length} points)`;
          sizeRow.appendChild(sizeLabel);
          mw.appendChild(sizeRow);

          // Row/Col buttons
          const btnRow = document.createElement("div");
          btnRow.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;";
          const mkBtn = (label: string, fn_: () => void) => {
            const b = document.createElement("button");
            b.style.cssText = "background:#333;border:1px solid #555;border-radius:4px;color:#ccc;cursor:pointer;font-size:10px;padding:2px 6px;";
            b.textContent = label;
            b.addEventListener("click", () => { ensureUndo(); fn_(); editor.requestRender(); refresh(ids); });
            return b;
          };
          btnRow.appendChild(mkBtn("+Row", () => editor.engine.mesh_add_row(id, idx)));
          btnRow.appendChild(mkBtn("-Row", () => editor.engine.mesh_remove_row(id, idx)));
          btnRow.appendChild(mkBtn("+Col", () => editor.engine.mesh_add_col(id, idx)));
          btnRow.appendChild(mkBtn("-Col", () => editor.engine.mesh_remove_col(id, idx)));
          mw.appendChild(btnRow);

          // Mesh points list (compact)
          const ptsLabel = document.createElement("span");
          ptsLabel.style.cssText = "font-size:10px;color:#888;margin-top:4px;";
          ptsLabel.textContent = "Points (click to edit color):";
          mw.appendChild(ptsLabel);

          const ptsGrid = document.createElement("div");
          ptsGrid.style.cssText = `display:grid;grid-template-columns:repeat(${meshCols}, 1fr);gap:2px;`;
          for (let pi = 0; pi < meshPts.length; pi++) {
            const pt = meshPts[pi];
            const swatch = document.createElement("input");
            swatch.type = "color";
            swatch.value = `#${(pt.r ?? 200).toString(16).padStart(2, '0')}${(pt.g ?? 200).toString(16).padStart(2, '0')}${(pt.b ?? 200).toString(16).padStart(2, '0')}`;
            swatch.style.cssText = "width:100%;height:20px;border:1px solid #555;border-radius:3px;padding:0;cursor:pointer;background:none;";
            swatch.title = `Point ${pi} (${pt.x?.toFixed(2)}, ${pt.y?.toFixed(2)})`;
            const ptIdx = pi;
            swatch.addEventListener("input", () => {
              const hex = swatch.value;
              const r = parseInt(hex.slice(1, 3), 16);
              const g = parseInt(hex.slice(3, 5), 16);
              const b = parseInt(hex.slice(5, 7), 16);
              ensureUndo();
              editor.engine.mesh_set_point_color(id, idx, ptIdx, r, g, b, 1.0);
              editor.requestRender();
            });
            ptsGrid.appendChild(swatch);
          }
          mw.appendChild(ptsGrid);

          // Hint for mesh edit mode
          const hint = document.createElement("span");
          hint.style.cssText = "font-size:9px;color:#666;margin-top:2px;";
          hint.textContent = "Double-click node to enter mesh edit mode";
          mw.appendChild(hint);

          fillWrap.appendChild(mw);
        } else if (fill.type === "Solid") {
          const color = fill.color || { r: 200, g: 200, b: 200, a: 1 };
          fillWrap.appendChild(createColorRow(color, (r, g, b, a) => {
            editor.engine.update_fill_at(id, idx, r, g, b, a);
            editor.requestRender();
          }));

          // Color Space dropdown
          const csRow = document.createElement("div");
          csRow.style.cssText = "display:flex;align-items:center;gap:4px;margin-top:4px;";
          const csLabel = document.createElement("span");
          csLabel.style.cssText = "font-size:9px;color:#888;width:48px;flex-shrink:0;";
          csLabel.textContent = "Space";
          csRow.appendChild(csLabel);
          const csSelect = document.createElement("select");
          csSelect.className = "prop-input";
          csSelect.style.cssText = "flex:1;font-size:10px;padding:2px 4px;";
          const currentSpace = fill.color_space || "sRGB";
          for (const sp of ["sRGB", "Display P3", "OKLab", "OKLCH"]) {
            const opt = document.createElement("option");
            opt.value = sp;
            opt.textContent = sp;
            if (sp === currentSpace) opt.selected = true;
            csSelect.appendChild(opt);
          }
          csSelect.addEventListener("change", () => {
            ensureUndo();
            editor.engine.set_color_space(id, idx, csSelect.value);
            editor.requestRender();
            refresh(ids);
          });
          csRow.appendChild(csSelect);
          fillWrap.appendChild(csRow);
        } else {
          // Conic gradient-specific controls
          if (fill.type === "ConicGradient") {
            const conicRow = document.createElement("div");
            conicRow.style.cssText = "display:flex;gap:4px;margin-bottom:6px;align-items:center;";
            for (const [label, key, def] of [["CX", "center_x", 0.5], ["CY", "center_y", 0.5], ["Angle", "angle", 0]] as [string, string, number][]) {
              const lbl = document.createElement("span");
              lbl.style.cssText = "font-size:9px;color:#888;";
              lbl.textContent = label;
              conicRow.appendChild(lbl);
              const inp = document.createElement("input");
              inp.className = "prop-input";
              inp.style.cssText = "width:44px;font-size:11px;text-align:center;";
              inp.value = key === "angle" ? String(Math.round(fill[key] ?? def)) : String(Math.round((fill[key] ?? def) * 100)) + "%";
              inp.addEventListener("change", () => {
                ensureUndo();
                const v = key === "angle" ? parseFloat(inp.value) || 0 : (parseInt(inp.value) || 0) / 100;
                (fill as any)[key] = v;
                editor.engine.set_fill_conic_gradient_at(id, idx, fill.center_x ?? 0.5, fill.center_y ?? 0.5, fill.angle ?? 0, JSON.stringify(fill.stops || []));
                editor.requestRender();
              });
              conicRow.appendChild(inp);
            }
            fillWrap.appendChild(conicRow);
          }
          // Gradient stops
          const stops: any[] = fill.stops || [];
          stops.forEach((stop: any, si: number) => {
            const stopRow = document.createElement("div");
            stopRow.style.cssText = "display:flex;align-items:center;gap:4px;margin-bottom:4px;";
            const offsetInput = document.createElement("input");
            offsetInput.className = "prop-input";
            offsetInput.style.cssText = "width:40px;flex:none;text-align:center;font-size:11px;";
            offsetInput.value = Math.round(stop.offset * 100) + "%";
            offsetInput.addEventListener("change", () => {
              const newOffset = parseInt(offsetInput.value) / 100;
              stops[si].offset = Math.max(0, Math.min(1, isNaN(newOffset) ? stop.offset : newOffset));
              applyGrad();
            });
            stopRow.appendChild(offsetInput);
            stopRow.appendChild(createColorRow(
              { r: stop.r, g: stop.g, b: stop.b, a: stop.a },
              (r, g, b, a) => { stops[si] = { ...stops[si], r, g, b, a }; applyGrad(); }
            ));
            if (stops.length > 2) {
              const sdel = document.createElement("button");
              sdel.style.cssText = "background:none;border:none;color:#555;cursor:pointer;font-size:11px;padding:2px;";
              sdel.textContent = "✕";
              sdel.addEventListener("click", () => { stops.splice(si, 1); applyGrad(); refresh(ids); });
              stopRow.appendChild(sdel);
            }
            fillWrap.appendChild(stopRow);
          });
          const addStopBtn = document.createElement("button");
          addStopBtn.className = "prop-add-btn";
          addStopBtn.textContent = "+ Add stop";
          addStopBtn.addEventListener("click", () => { ensureUndo(); stops.push({ offset: 0.5, r: 255, g: 255, b: 255, a: 1 }); applyGrad(); refresh(ids); });
          fillWrap.appendChild(addStopBtn);

          function applyGrad() {
            ensureUndo();
            if (fill.type === "LinearGradient") {
              editor.engine.set_fill_linear_gradient_at(id, idx, fill.start_x ?? 0, fill.start_y ?? 0, fill.end_x ?? 1, fill.end_y ?? 1, JSON.stringify(stops));
            } else if (fill.type === "ConicGradient") {
              editor.engine.set_fill_conic_gradient_at(id, idx, fill.center_x ?? 0.5, fill.center_y ?? 0.5, fill.angle ?? 0, JSON.stringify(stops));
            } else {
              editor.engine.set_fill_radial_gradient_at(id, idx, fill.center_x ?? 0.5, fill.center_y ?? 0.5, fill.radius ?? 0.5, JSON.stringify(stops));
            }
            editor.requestRender();
          }
        }

        fillSection.appendChild(fillWrap);
      });

      // Add fill button
      const addFillBtn = document.createElement("button");
      addFillBtn.className = "prop-add-btn";
      addFillBtn.textContent = "+ Add fill";
      addFillBtn.addEventListener("click", () => {
        ensureUndo();
        editor.engine.add_fill(id, 200, 200, 200, 1.0);
        editor.requestRender();
        refresh(ids);
      });
      fillSection.appendChild(addFillBtn);

      container.appendChild(fillSection);
    }

    // --- Variable Bindings ---
    {
      const bindSection = createSection("Variable Bindings");
      const bindingsJson = editor.engine.get_bindings(id);
      const bindings: any[] = JSON.parse(bindingsJson || "[]");
      const collectionsJson = editor.engine.get_collections();
      const collections: any[] = JSON.parse(collectionsJson || "[]");

      const bindableProps = ["fill.0.color", "stroke.color", "opacity", "corner_radius", "width", "height", "visible"];

      for (const prop of bindableProps) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:4px;";

        const label = document.createElement("span");
        label.style.cssText = "font-size:10px;color:#888;min-width:80px;";
        label.textContent = prop;
        row.appendChild(label);

        const existing = bindings.find((b: any) => b.property === prop);

        if (existing) {
          const col = collections.find((c: any) => c.id === existing.collection_id);
          const varName = col?.variables?.find((v: any) => v.id === existing.variable_id)?.name || "?";
          const badge = document.createElement("span");
          badge.style.cssText = "font-size:10px;color:#818cf8;background:rgba(79,70,229,0.1);padding:2px 6px;border-radius:3px;flex:1;";
          badge.textContent = `${col?.name || "?"} / ${varName}`;
          row.appendChild(badge);

          const unbindBtn = document.createElement("button");
          unbindBtn.style.cssText = "background:none;border:none;color:#f87171;cursor:pointer;font-size:10px;padding:2px;";
          unbindBtn.textContent = "✕";
          unbindBtn.addEventListener("click", () => {
            editor.engine.push_undo();
            editor.engine.unbind_variable(id, prop);
            editor.engine.apply_variables();
            editor.requestRender();
            refresh(ids);
          });
          row.appendChild(unbindBtn);
        } else if (collections.length > 0) {
          const bindBtn = document.createElement("button");
          bindBtn.style.cssText = "background:none;border:1px solid #444;border-radius:4px;color:#888;cursor:pointer;font-size:10px;padding:2px 6px;";
          bindBtn.innerHTML = "⚡ Bind";
          bindBtn.addEventListener("click", () => {
            // Simple picker: show popup
            const popup = document.createElement("div");
            popup.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1e1e1e;border:1px solid #444;border-radius:8px;padding:16px;z-index:10000;min-width:250px;max-height:400px;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.5);";

            const popTitle = document.createElement("div");
            popTitle.style.cssText = "font-size:12px;color:#ccc;font-weight:600;margin-bottom:10px;";
            popTitle.textContent = `Bind "${prop}" to variable`;
            popup.appendChild(popTitle);

            for (const col of collections) {
              const colLabel = document.createElement("div");
              colLabel.style.cssText = "font-size:10px;color:#666;margin-top:8px;margin-bottom:4px;text-transform:uppercase;";
              colLabel.textContent = col.name;
              popup.appendChild(colLabel);

              const expectedType = (prop === "fill.0.color" || prop === "stroke.color") ? "Color" : prop === "visible" ? "Boolean" : "Number";
              const matchingVars = col.variables.filter((v: any) => v.value_type === expectedType);

              if (matchingVars.length === 0) {
                const noVars = document.createElement("div");
                noVars.style.cssText = "font-size:10px;color:#555;padding:4px 0;";
                noVars.textContent = `No ${expectedType} variables`;
                popup.appendChild(noVars);
              }

              for (const v of matchingVars) {
                const vBtn = document.createElement("button");
                vBtn.style.cssText = "display:block;width:100%;text-align:left;background:#2a2a2a;border:1px solid #333;border-radius:4px;color:#ccc;cursor:pointer;font-size:11px;padding:6px 8px;margin-bottom:2px;";
                vBtn.textContent = v.name;
                vBtn.addEventListener("mouseenter", () => { vBtn.style.borderColor = "#4f46e5"; });
                vBtn.addEventListener("mouseleave", () => { vBtn.style.borderColor = "#333"; });
                vBtn.addEventListener("click", () => {
                  editor.engine.push_undo();
                  editor.engine.bind_variable(id, prop, BigInt(col.id), BigInt(v.id));
                  editor.engine.apply_variables();
                  editor.requestRender();
                  document.body.removeChild(popup);
                  refresh(ids);
                });
                popup.appendChild(vBtn);
              }
            }

            const cancelBtn = document.createElement("button");
            cancelBtn.style.cssText = "margin-top:10px;width:100%;background:#333;border:none;border-radius:4px;color:#888;cursor:pointer;font-size:11px;padding:6px;";
            cancelBtn.textContent = "Cancel";
            cancelBtn.addEventListener("click", () => document.body.removeChild(popup));
            popup.appendChild(cancelBtn);

            document.body.appendChild(popup);
          });
          row.appendChild(bindBtn);
        }

        bindSection.appendChild(row);
      }

      if (collections.length === 0) {
        const hint = document.createElement("div");
        hint.style.cssText = "font-size:10px;color:#555;text-align:center;padding:8px 0;";
        hint.textContent = "Create a variable collection first";
        bindSection.appendChild(hint);
      }

      container.appendChild(bindSection);
    }

    // --- Stroke ---
    {
      const strokeSection = createSection("Stroke");
      const strokes: any[] = (() => {
        try { return JSON.parse(editor.engine.get_strokes_info(id)); } catch { return []; }
      })();
      if (strokes.length > 0) {
        strokes.forEach((stroke: any, idx: number) => {
          const strokeItem = document.createElement("div");
          strokeItem.style.cssText = "margin-bottom:8px;padding:6px;background:rgba(255,255,255,0.03);border-radius:6px;";

          // Header row: color + width + visible + remove
          const headerRow = document.createElement("div");
          headerRow.className = "prop-row";
          headerRow.style.gap = "4px";

          // Visible toggle
          const visBtn = document.createElement("button");
          visBtn.className = "prop-icon-btn";
          visBtn.innerHTML = stroke.visible ? icons.eye : icons.eyeOff;
          visBtn.title = stroke.visible ? "Hide stroke" : "Show stroke";
          visBtn.addEventListener("click", () => {
            editor.engine.set_stroke_visible_at(id, idx, !stroke.visible);
            editor.requestRender(); refresh(ids);
          });
          headerRow.appendChild(visBtn);

          headerRow.appendChild(createColorRow(
            stroke.color,
            (r: number, g: number, b: number, a: number) => {
              editor.engine.update_stroke_at(id, idx, r, g, b, a, stroke.width);
              editor.requestRender();
            }
          ));

          const wInput = document.createElement("input");
          wInput.className = "prop-input";
          wInput.style.width = "40px";
          wInput.value = stroke.width.toFixed(0);
          wInput.addEventListener("change", () => {
            const w = parseFloat(wInput.value) || 1;
            editor.engine.update_stroke_at(id, idx, stroke.color.r, stroke.color.g, stroke.color.b, stroke.color.a, w);
            editor.requestRender(); refresh(ids);
          });
          headerRow.appendChild(wInput);

          const removeBtn = document.createElement("button");
          removeBtn.className = "prop-icon-btn";
          removeBtn.innerHTML = "×";
          removeBtn.title = "Remove stroke";
          removeBtn.addEventListener("click", () => {
            editor.engine.remove_stroke(id, idx);
            editor.requestRender(); refresh(ids);
          });
          headerRow.appendChild(removeBtn);
          strokeItem.appendChild(headerRow);

          // Dash pattern
          const dashRow = document.createElement("div");
          dashRow.className = "prop-row";
          dashRow.style.marginTop = "4px";
          const dashLabel = document.createElement("span");
          dashLabel.className = "prop-label";
          dashLabel.textContent = "Dash";
          dashRow.appendChild(dashLabel);
          const dashInput = document.createElement("input");
          dashInput.className = "prop-input";
          dashInput.placeholder = "e.g. 10,5";
          dashInput.value = (stroke.dash_array && stroke.dash_array.length > 0) ? stroke.dash_array.join(",") : "";
          dashInput.addEventListener("change", () => {
            editor.engine.set_stroke_dash_at(id, idx, dashInput.value, 0);
            editor.requestRender();
          });
          dashRow.appendChild(dashInput);
          strokeItem.appendChild(dashRow);

          // Cap / Join / Align row
          const optRow = document.createElement("div");
          optRow.className = "prop-row";
          optRow.style.cssText = "margin-top:4px;gap:4px;";
          for (const [label, values, current, setter] of [
            ["Cap", ["butt", "round", "square"], stroke.line_cap || "butt", (v: string) => editor.engine.set_stroke_cap_at(id, idx, v)],
            ["Join", ["miter", "round", "bevel"], stroke.line_join || "miter", (v: string) => editor.engine.set_stroke_join_at(id, idx, v)],
            ["Align", ["Center", "Inside", "Outside"], stroke.align || "Center", (v: string) => editor.engine.set_stroke_align_at(id, idx, v)],
          ] as [string, string[], string, (v: string) => void][]) {
            const sel = document.createElement("select");
            sel.className = "prop-input";
            sel.title = label;
            sel.style.flex = "1";
            for (const v of values) {
              const opt = document.createElement("option");
              opt.value = v;
              opt.textContent = v.charAt(0).toUpperCase() + v.slice(1);
              if (v === current) opt.selected = true;
              sel.appendChild(opt);
            }
            sel.addEventListener("change", () => { setter(sel.value); editor.requestRender(); });
            optRow.appendChild(sel);
          }
          strokeItem.appendChild(optRow);

          strokeSection.appendChild(strokeItem);
        });
      }
      const addBtn = document.createElement("button");
      addBtn.className = "prop-add-btn";
      addBtn.textContent = "+ Add stroke";
      addBtn.addEventListener("click", () => {
        editor.engine.add_stroke(id, 0, 0, 0, 1.0, 1);
        editor.requestRender();
        refresh(ids);
      });
      strokeSection.appendChild(addBtn);
      container.appendChild(strokeSection);
    }

    // --- Effects (Shadows + Blur) ---
    {
      const effectsSection = createSection("Effects");

      // Layer blur
      const blurVal = editor.engine.get_blur(BigInt(id));
      const blurRow = document.createElement("div");
      blurRow.className = "prop-row";
      const blurLabel = document.createElement("span");
      blurLabel.className = "prop-label";
      blurLabel.style.width = "40px";
      blurLabel.textContent = "Blur";
      blurRow.appendChild(blurLabel);
      const blurInput = document.createElement("input");
      blurInput.className = "prop-input";
      blurInput.value = String(blurVal || 0);
      blurInput.addEventListener("change", () => {
        editor.engine.set_blur(BigInt(id), parseFloat(blurInput.value) || 0);
        editor.requestRender();
      });
      blurRow.appendChild(blurInput);
      effectsSection.appendChild(blurRow);

      // Backdrop blur
      const bdBlurVal = editor.engine.get_backdrop_blur(BigInt(id));
      const bdBlurRow = document.createElement("div");
      bdBlurRow.className = "prop-row";
      const bdBlurLabel = document.createElement("span");
      bdBlurLabel.className = "prop-label";
      bdBlurLabel.style.width = "40px";
      bdBlurLabel.textContent = "BG Blur";
      bdBlurRow.appendChild(bdBlurLabel);
      const bdBlurInput = document.createElement("input");
      bdBlurInput.className = "prop-input";
      bdBlurInput.value = String(bdBlurVal || 0);
      bdBlurInput.addEventListener("change", () => {
        editor.engine.set_backdrop_blur(BigInt(id), parseFloat(bdBlurInput.value) || 0);
        editor.requestRender();
      });
      bdBlurRow.appendChild(bdBlurInput);
      effectsSection.appendChild(bdBlurRow);

      // Blend mode
      const blendRow = document.createElement("div");
      blendRow.className = "prop-row";
      const blendLabel = document.createElement("span");
      blendLabel.className = "prop-label";
      blendLabel.style.width = "40px";
      blendLabel.textContent = "Blend";
      blendRow.appendChild(blendLabel);
      const blendSelect = document.createElement("select");
      blendSelect.className = "prop-input";
      const blendModes = [
        "normal", "multiply", "screen", "overlay", "darken", "lighten",
        "color-dodge", "color-burn", "hard-light", "soft-light",
        "difference", "exclusion", "hue", "saturation", "color", "luminosity"
      ];
      const currentBlend = editor.engine.get_blend_mode(BigInt(id));
      for (const mode of blendModes) {
        const opt = document.createElement("option");
        opt.value = mode;
        opt.textContent = mode.charAt(0).toUpperCase() + mode.slice(1).replace(/-/g, " ");
        if (mode === currentBlend) opt.selected = true;
        blendSelect.appendChild(opt);
      }
      blendSelect.addEventListener("change", () => {
        editor.engine.set_blend_mode(BigInt(id), blendSelect.value);
        editor.requestRender();
      });
      blendRow.appendChild(blendSelect);
      effectsSection.appendChild(blendRow);

      // Bitmap Filters
      {
        const bfJson = editor.engine.get_bitmap_filter(BigInt(id));
        const bf = bfJson ? JSON.parse(bfJson) : null;
        const hasBf = bf !== null;

        const bfHeader = document.createElement("div");
        bfHeader.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-top:8px;margin-bottom:4px;";
        const bfLabel = document.createElement("span");
        bfLabel.style.cssText = "font-size:11px;color:#888;";
        bfLabel.textContent = "Filters";
        bfHeader.appendChild(bfLabel);

        if (!hasBf) {
          const addBtn = document.createElement("button");
          addBtn.style.cssText = "background:#333;border:none;color:#ccc;font-size:10px;padding:2px 8px;border-radius:4px;cursor:pointer;";
          addBtn.textContent = "+ Add";
          addBtn.addEventListener("click", () => {
            editor.engine.set_bitmap_filter(BigInt(id), 1.0, 1.0, 1.0, 0, 0, 0, 0);
            editor.requestRender();
            refresh(ids);
          });
          bfHeader.appendChild(addBtn);
        } else {
          const rmBtn = document.createElement("button");
          rmBtn.style.cssText = "background:none;border:none;color:#f87171;font-size:10px;cursor:pointer;padding:2px 4px;";
          rmBtn.textContent = "✕";
          rmBtn.addEventListener("click", () => {
            editor.engine.remove_bitmap_filter(BigInt(id));
            editor.requestRender();
            refresh(ids);
          });
          bfHeader.appendChild(rmBtn);
        }
        effectsSection.appendChild(bfHeader);

        if (hasBf) {
          const bfWrap = document.createElement("div");
          bfWrap.style.cssText = "background:#1e1e1e;border-radius:6px;padding:8px;margin-bottom:6px;";

          // Enable toggle
          const enableRow = document.createElement("div");
          enableRow.className = "prop-row";
          const enableCb = document.createElement("input");
          enableCb.type = "checkbox";
          enableCb.checked = bf.enabled !== false;
          enableCb.style.cssText = "margin-right:6px;";
          enableCb.addEventListener("change", () => {
            editor.engine.set_bitmap_filter_enabled(BigInt(id), enableCb.checked);
            editor.requestRender();
          });
          const enableLbl = document.createElement("span");
          enableLbl.style.cssText = "font-size:11px;color:#aaa;";
          enableLbl.textContent = "Enabled";
          enableRow.appendChild(enableCb);
          enableRow.appendChild(enableLbl);
          bfWrap.appendChild(enableRow);

          const filterProps: [string, string, number, number, number, number][] = [
            ["brightness", "Brightness", 0, 3, 0.05, bf.brightness],
            ["contrast", "Contrast", 0, 3, 0.05, bf.contrast],
            ["saturation", "Saturation", 0, 3, 0.05, bf.saturation],
            ["hue_rotate", "Hue Rotate", 0, 360, 1, bf.hue_rotate],
            ["invert", "Invert", 0, 1, 0.05, bf.invert],
            ["grayscale", "Grayscale", 0, 1, 0.05, bf.grayscale],
            ["sepia", "Sepia", 0, 1, 0.05, bf.sepia],
          ];

          const currentVals: Record<string, number> = {
            brightness: bf.brightness, contrast: bf.contrast, saturation: bf.saturation,
            hue_rotate: bf.hue_rotate, invert: bf.invert, grayscale: bf.grayscale, sepia: bf.sepia,
          };

          const applyFilter = () => {
            editor.engine.set_bitmap_filter(
              BigInt(id),
              currentVals.brightness, currentVals.contrast, currentVals.saturation,
              currentVals.hue_rotate, currentVals.invert, currentVals.grayscale, currentVals.sepia,
            );
            editor.requestRender();
          };

          for (const [key, label, min, max, step, val] of filterProps) {
            const row = document.createElement("div");
            row.style.cssText = "display:flex;align-items:center;gap:4px;margin-bottom:4px;";
            const lbl = document.createElement("span");
            lbl.style.cssText = "font-size:10px;color:#888;width:60px;flex-shrink:0;";
            lbl.textContent = label;
            row.appendChild(lbl);

            const range = document.createElement("input");
            range.type = "range";
            range.min = String(min);
            range.max = String(max);
            range.step = String(step);
            range.value = String(val);
            range.style.cssText = "flex:1;height:4px;accent-color:#818cf8;";

            const numInput = document.createElement("input");
            numInput.className = "prop-input";
            numInput.style.cssText = "width:45px;font-size:10px;text-align:right;";
            numInput.value = key === "hue_rotate" ? String(Math.round(val)) + "°" : String(Math.round(val * 100) / 100);

            range.addEventListener("input", () => {
              currentVals[key] = parseFloat(range.value);
              numInput.value = key === "hue_rotate" ? String(Math.round(currentVals[key])) + "°" : String(Math.round(currentVals[key] * 100) / 100);
              applyFilter();
            });

            numInput.addEventListener("change", () => {
              currentVals[key] = parseFloat(numInput.value) || 0;
              range.value = String(currentVals[key]);
              applyFilter();
            });

            row.appendChild(range);
            row.appendChild(numInput);
            bfWrap.appendChild(row);
          }
          effectsSection.appendChild(bfWrap);
        }
      }

      // Shadows
      const shadowsJson = editor.engine.get_shadows(BigInt(id));
      const shadows: any[] = JSON.parse(shadowsJson);

      shadows.forEach((shadow: any, idx: number) => {
        const shadowWrap = document.createElement("div");
        shadowWrap.style.cssText = "background:#1e1e1e;border-radius:6px;padding:8px;margin-bottom:6px;position:relative;";

        // Header: visibility toggle + "Shadow N" + delete
        const headerRow = document.createElement("div");
        headerRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:6px;";

        const visBtn = document.createElement("button");
        visBtn.style.cssText = `background:none;border:none;cursor:pointer;padding:2px;color:${shadow.visible ? "#818cf8" : "#555"};font-size:12px;`;
        visBtn.textContent = shadow.visible ? "👁" : "👁‍🗨";
        visBtn.addEventListener("click", () => {
          ensureUndo();
          editor.engine.set_shadow_visible(BigInt(id), idx, !shadow.visible);
          editor.requestRender();
          refresh(ids);
        });
        headerRow.appendChild(visBtn);

        const insetBtn = document.createElement("button");
        insetBtn.style.cssText = `background:${shadow.inset ? "#818cf8" : "#333"};border:1px solid ${shadow.inset ? "#818cf8" : "#555"};border-radius:3px;cursor:pointer;padding:1px 5px;color:${shadow.inset ? "#fff" : "#999"};font-size:9px;`;
        insetBtn.textContent = "Inner";
        insetBtn.title = shadow.inset ? "Inner shadow (click for drop)" : "Drop shadow (click for inner)";
        insetBtn.addEventListener("click", () => {
          ensureUndo();
          (editor.engine as any).set_shadow_inset(BigInt(id), idx, !shadow.inset);
          editor.requestRender();
          refresh(ids);
        });
        headerRow.appendChild(insetBtn);

        const label = document.createElement("span");
        label.style.cssText = "font-size:11px;color:#888;flex:1;";
        label.textContent = shadow.inset ? `Inner Shadow ${idx + 1}` : `Shadow ${idx + 1}`;
        headerRow.appendChild(label);

        const delBtn = document.createElement("button");
        delBtn.style.cssText = "background:none;border:none;cursor:pointer;color:#555;font-size:11px;padding:2px 4px;";
        delBtn.textContent = "✕";
        delBtn.addEventListener("click", () => {
          ensureUndo();
          editor.engine.remove_shadow(BigInt(id), idx);
          editor.requestRender();
          refresh(ids);
        });
        headerRow.appendChild(delBtn);
        shadowWrap.appendChild(headerRow);

        // Color row
        shadowWrap.appendChild(createColorRow(
          shadow.color,
          (r, g, b, a) => {
            editor.engine.update_shadow(BigInt(id), idx, r, g, b, a, shadow.offset_x, shadow.offset_y, shadow.blur, shadow.spread);
            editor.requestRender();
          }
        ));

        // Offset + blur + spread row
        const propsRow = document.createElement("div");
        propsRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:4px;margin-top:6px;";
        const makeInput = (lbl: string, val: number, field: string) => {
          const w = createLabeledInput(lbl, String(val), (v) => {
            const s = { ...shadow };
            (s as any)[field] = parseFloat(v) || 0;
            editor.engine.update_shadow(BigInt(id), idx, s.color.r, s.color.g, s.color.b, s.color.a, s.offset_x, s.offset_y, s.blur, s.spread);
            editor.requestRender();
          });
          return w;
        };
        propsRow.appendChild(makeInput("X", shadow.offset_x, "offset_x"));
        propsRow.appendChild(makeInput("Y", shadow.offset_y, "offset_y"));
        propsRow.appendChild(makeInput("B", shadow.blur, "blur"));
        propsRow.appendChild(makeInput("S", shadow.spread, "spread"));
        shadowWrap.appendChild(propsRow);

        effectsSection.appendChild(shadowWrap);
      });

      // Effect presets (shadow/blur/filter combos)
      {
        type EffectPreset = {
          name: string;
          blur: number;
          backdropBlur: number;
          blend: string;
          bitmapFilter: any | null;
          shadows: any[];
        };
        const PRESET_KEY = "opensketch-effect-presets";
        const loadPresets = (): EffectPreset[] => {
          try {
            const raw = localStorage.getItem(PRESET_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        };
        const savePresets = (presets: EffectPreset[]) => {
          localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
        };
        const readCurrent = (): EffectPreset => ({
          name: "",
          blur: parseFloat(blurInput.value) || 0,
          backdropBlur: parseFloat(bdBlurInput.value) || 0,
          blend: blendSelect.value || "normal",
          bitmapFilter: (() => {
            try { return editor.engine.get_bitmap_filter(BigInt(id)) ? JSON.parse(editor.engine.get_bitmap_filter(BigInt(id))) : null; } catch { return null; }
          })(),
          shadows: (() => {
            try { return JSON.parse(editor.engine.get_shadows(BigInt(id)) || "[]"); } catch { return []; }
          })(),
        });

        const presetRow = document.createElement("div");
        presetRow.style.cssText = "display:flex;gap:4px;margin-top:8px;flex-wrap:wrap;";

        const saveBtn = document.createElement("button");
        saveBtn.className = "prop-add-btn";
        saveBtn.style.marginTop = "0";
        saveBtn.textContent = "Save preset";
        saveBtn.addEventListener("click", () => {
          const name = prompt("Preset name", `Effect Preset ${new Date().toLocaleTimeString()}`)?.trim();
          if (!name) return;
          const presets = loadPresets();
          presets.push({ ...readCurrent(), name });
          savePresets(presets);
          alert(`Saved: ${name}`);
        });
        presetRow.appendChild(saveBtn);

        const applyBtn = document.createElement("button");
        applyBtn.className = "prop-add-btn";
        applyBtn.style.marginTop = "0";
        applyBtn.textContent = "Apply preset";
        applyBtn.addEventListener("click", () => {
          const presets = loadPresets();
          if (!presets.length) { alert("No effect presets saved yet."); return; }
          const list = presets.map((p, i) => `${i + 1}. ${p.name}`).join("\n");
          const idx = Math.max(0, (parseInt(prompt(`Apply which preset?\n${list}`, "1") || "1", 10) || 1) - 1);
          const p = presets[idx];
          if (!p) return;
          ensureUndo();
          editor.engine.set_blur(BigInt(id), Number(p.blur) || 0);
          editor.engine.set_backdrop_blur(BigInt(id), Number(p.backdropBlur) || 0);
          editor.engine.set_blend_mode(BigInt(id), p.blend || "normal");
          // Replace bitmap filter
          editor.engine.remove_bitmap_filter(BigInt(id));
          if (p.bitmapFilter) {
            editor.engine.set_bitmap_filter(
              BigInt(id),
              p.bitmapFilter.brightness ?? 1,
              p.bitmapFilter.contrast ?? 1,
              p.bitmapFilter.saturation ?? 1,
              p.bitmapFilter.hue_rotate ?? 0,
              p.bitmapFilter.invert ?? 0,
              p.bitmapFilter.grayscale ?? 0,
              p.bitmapFilter.sepia ?? 0,
            );
            if (typeof p.bitmapFilter.enabled === "boolean") {
              editor.engine.set_bitmap_filter_enabled(BigInt(id), p.bitmapFilter.enabled);
            }
          }
          // Replace shadows
          const existing = (() => { try { return JSON.parse(editor.engine.get_shadows(BigInt(id)) || "[]"); } catch { return []; } })();
          for (let i = existing.length - 1; i >= 0; i--) editor.engine.remove_shadow(BigInt(id), i);
          for (const s of (p.shadows || [])) {
            const isInner = !!s.inset;
            if (isInner && (editor.engine as any).add_inner_shadow) {
              (editor.engine as any).add_inner_shadow(BigInt(id), s.color?.r ?? 0, s.color?.g ?? 0, s.color?.b ?? 0, s.color?.a ?? 0.25, s.offset_x ?? 0, s.offset_y ?? 4, s.blur ?? 8, s.spread ?? 0);
            } else {
              editor.engine.add_shadow(BigInt(id), s.color?.r ?? 0, s.color?.g ?? 0, s.color?.b ?? 0, s.color?.a ?? 0.25, s.offset_x ?? 0, s.offset_y ?? 4, s.blur ?? 8, s.spread ?? 0);
            }
            const newIdx = Math.max(0, (JSON.parse(editor.engine.get_shadows(BigInt(id)) || "[]").length - 1));
            editor.engine.set_shadow_visible(BigInt(id), newIdx, s.visible !== false);
          }
          editor.requestRender();
          refresh(ids);
        });
        presetRow.appendChild(applyBtn);

        const exportBtn = document.createElement("button");
        exportBtn.className = "prop-add-btn";
        exportBtn.style.marginTop = "0";
        exportBtn.textContent = "Export";
        exportBtn.addEventListener("click", () => {
          const payload = JSON.stringify(loadPresets(), null, 2);
          prompt("Copy effect presets JSON", payload);
        });
        presetRow.appendChild(exportBtn);

        const importBtn = document.createElement("button");
        importBtn.className = "prop-add-btn";
        importBtn.style.marginTop = "0";
        importBtn.textContent = "Import";
        importBtn.addEventListener("click", () => {
          const raw = prompt("Paste effect presets JSON");
          if (!raw) return;
          try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) throw new Error("Expected array");
            savePresets(parsed);
            alert(`Imported ${parsed.length} presets`);
          } catch {
            alert("Invalid JSON");
          }
        });
        presetRow.appendChild(importBtn);

        effectsSection.appendChild(presetRow);
      }

      const addShadowBtn = document.createElement("button");
      addShadowBtn.className = "prop-add-btn";
      addShadowBtn.textContent = "+ Add drop shadow";
      addShadowBtn.addEventListener("click", () => {
        ensureUndo();
        editor.engine.add_shadow(BigInt(id), 0, 0, 0, 0.25, 0, 4, 8, 0);
        editor.requestRender();
        refresh(ids);
      });
      effectsSection.appendChild(addShadowBtn);

      const addInnerShadowBtn = document.createElement("button");
      addInnerShadowBtn.className = "prop-add-btn";
      addInnerShadowBtn.style.marginTop = "2px";
      addInnerShadowBtn.textContent = "+ Add inner shadow";
      addInnerShadowBtn.addEventListener("click", () => {
        ensureUndo();
        (editor.engine as any).add_inner_shadow(BigInt(id), 0, 0, 0, 0.25, 0, 2, 4, 0);
        editor.requestRender();
        refresh(ids);
      });
      effectsSection.appendChild(addInnerShadowBtn);

      container.appendChild(effectsSection);
    }

    // --- Effects (Shadows + Blur) ---
    {
      const effectsSection = document.createElement("div");
      effectsSection.className = "prop-section";

      const effectsTitle = document.createElement("div");
      effectsTitle.className = "prop-section-title";
      effectsTitle.textContent = "Effects";
      effectsSection.appendChild(effectsTitle);

      // Layer blur
      const blurRow = document.createElement("div");
      blurRow.className = "prop-row";
      const blurLabel = document.createElement("span");
      blurLabel.className = "prop-label";
      blurLabel.style.width = "40px";
      blurLabel.textContent = "Blur";
      blurRow.appendChild(blurLabel);
      const blurInput = document.createElement("input");
      blurInput.className = "prop-input";
      blurInput.type = "number";
      blurInput.min = "0";
      blurInput.step = "1";
      blurInput.value = String(editor.engine.get_blur(id) || 0);
      blurInput.addEventListener("change", () => {
        editor.engine.set_blur(id, parseFloat(blurInput.value) || 0);
        editor.requestRender();
      });
      blurRow.appendChild(blurInput);
      effectsSection.appendChild(blurRow);

      // Backdrop blur
      const bdBlurRow2 = document.createElement("div");
      bdBlurRow2.className = "prop-row";
      const bdBlurLabel2 = document.createElement("span");
      bdBlurLabel2.className = "prop-label";
      bdBlurLabel2.style.width = "40px";
      bdBlurLabel2.textContent = "BG Blur";
      bdBlurRow2.appendChild(bdBlurLabel2);
      const bdBlurInput2 = document.createElement("input");
      bdBlurInput2.className = "prop-input";
      bdBlurInput2.type = "number";
      bdBlurInput2.min = "0";
      bdBlurInput2.step = "1";
      bdBlurInput2.value = String(editor.engine.get_backdrop_blur(id) || 0);
      bdBlurInput2.addEventListener("change", () => {
        editor.engine.set_backdrop_blur(id, parseFloat(bdBlurInput2.value) || 0);
        editor.requestRender();
      });
      bdBlurRow2.appendChild(bdBlurInput2);
      effectsSection.appendChild(bdBlurRow2);

      // Shadows
      const shadowsJson = editor.engine.get_shadows(id);
      const shadows: any[] = JSON.parse(shadowsJson || "[]");

      shadows.forEach((shadow: any, idx: number) => {
        const shadowEl = document.createElement("div");
        shadowEl.style.cssText = "background:#1e1e1e;border-radius:6px;padding:8px;margin-bottom:6px;position:relative;";

        // Header: visibility toggle + "Drop Shadow" + delete
        const hdr = document.createElement("div");
        hdr.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:6px;";

        const visBtn = document.createElement("button");
        visBtn.style.cssText = `width:18px;height:18px;border:1px solid ${shadow.visible ? "#4f46e5" : "#444"};border-radius:4px;background:${shadow.visible ? "#4f46e520" : "#2a2a2a"};cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;`;
        visBtn.innerHTML = shadow.visible ? icons.eye.replace(/width="\d+"/, 'width="12"').replace(/height="\d+"/, 'height="12"') : icons.eyeOff.replace(/width="\d+"/, 'width="12"').replace(/height="\d+"/, 'height="12"');
        visBtn.addEventListener("click", () => {
          ensureUndo();
          editor.engine.set_shadow_visible(id, idx, !shadow.visible);
          editor.requestRender();
          refresh(ids);
        });
        hdr.appendChild(visBtn);

        const label = document.createElement("span");
        label.style.cssText = "flex:1;font-size:11px;color:#888;";
        label.textContent = "Drop shadow";
        hdr.appendChild(label);

        const delBtn = document.createElement("button");
        delBtn.style.cssText = "background:transparent;border:none;color:#555;cursor:pointer;font-size:11px;padding:2px 4px;border-radius:4px;";
        delBtn.textContent = "✕";
        delBtn.addEventListener("click", () => {
          ensureUndo();
          editor.engine.remove_shadow(id, idx);
          editor.requestRender();
          refresh(ids);
        });
        hdr.appendChild(delBtn);
        shadowEl.appendChild(hdr);

        // Color row
        const colorRow = createColorRow(
          shadow.color,
          (r, g, b, a) => {
            editor.engine.update_shadow(id, idx, r, g, b, a, shadow.offset_x, shadow.offset_y, shadow.blur, shadow.spread);
            editor.requestRender();
          }
        );
        shadowEl.appendChild(colorRow);

        // Offset X/Y + Blur + Spread
        const paramsRow = document.createElement("div");
        paramsRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:4px;margin-top:6px;";

        const makeParam = (lbl: string, val: number, key: string) => {
          const w = document.createElement("div");
          w.style.cssText = "display:flex;flex-direction:column;gap:2px;";
          const l = document.createElement("span");
          l.style.cssText = "font-size:9px;color:#555;text-align:center;";
          l.textContent = lbl;
          w.appendChild(l);
          const inp = document.createElement("input");
          inp.className = "prop-input";
          inp.style.cssText = "text-align:center;font-size:11px;padding:3px 2px;";
          inp.type = "number";
          inp.value = String(val);
          inp.addEventListener("change", () => {
            ensureUndo();
            const s = shadow;
            const updated = { ...s, [key]: parseFloat(inp.value) || 0 };
            editor.engine.update_shadow(id, idx, s.color.r, s.color.g, s.color.b, s.color.a, updated.offset_x, updated.offset_y, updated.blur, updated.spread);
            editor.requestRender();
            refresh(ids);
          });
          w.appendChild(inp);
          return w;
        };

        paramsRow.appendChild(makeParam("X", shadow.offset_x, "offset_x"));
        paramsRow.appendChild(makeParam("Y", shadow.offset_y, "offset_y"));
        paramsRow.appendChild(makeParam("Blur", shadow.blur, "blur"));
        paramsRow.appendChild(makeParam("Spread", shadow.spread, "spread"));
        shadowEl.appendChild(paramsRow);

        effectsSection.appendChild(shadowEl);
      });

      const addShadowBtn = document.createElement("button");
      addShadowBtn.className = "prop-add-btn";
      addShadowBtn.textContent = "+ Add drop shadow";
      addShadowBtn.addEventListener("click", () => {
        ensureUndo();
        editor.engine.add_shadow(id, 0, 0, 0, 0.25, 0, 4, 8, 0);
        editor.requestRender();
        refresh(ids);
      });
      effectsSection.appendChild(addShadowBtn);

      container.appendChild(effectsSection);
    }

    // --- 3D Transform ---
    {
      const section3d = createSection("3D Transform");
      const pJson = editor.engine.get_perspective(BigInt(id));
      let perspective: any = pJson ? JSON.parse(pJson) : null;
      const enabled = !!perspective;

      // Enable checkbox
      const enableRow = document.createElement("div");
      enableRow.className = "prop-row";
      const enableCb = document.createElement("input");
      enableCb.type = "checkbox";
      enableCb.checked = enabled;
      enableCb.style.cssText = "margin-right:6px;";
      enableCb.addEventListener("change", () => {
        if (enableCb.checked) {
          editor.engine.set_perspective(BigInt(id), 0, 0, 0, 800, 0.5, 0.5);
        } else {
          editor.engine.clear_perspective(BigInt(id));
        }
        editor.requestRender();
        refresh(ids);
      });
      const enableLabel = document.createElement("span");
      enableLabel.style.cssText = "font-size:11px;color:#aaa;";
      enableLabel.textContent = "Enable 3D";
      enableRow.appendChild(enableCb);
      enableRow.appendChild(enableLabel);
      section3d.appendChild(enableRow);

      if (enabled && perspective) {
        const make3DInput = (label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void) => {
          const row = document.createElement("div");
          row.className = "prop-row";
          row.style.cssText = "display:flex;align-items:center;gap:6px;";
          const lbl = document.createElement("span");
          lbl.style.cssText = "font-size:10px;color:#666;width:60px;flex-shrink:0;";
          lbl.textContent = label;
          row.appendChild(lbl);
          const slider = document.createElement("input");
          slider.type = "range";
          slider.min = String(min);
          slider.max = String(max);
          slider.step = String(step);
          slider.value = String(value);
          slider.style.cssText = "flex:1;accent-color:#7c3aed;";
          const num = document.createElement("input");
          num.className = "prop-input";
          num.type = "number";
          num.min = String(min);
          num.max = String(max);
          num.step = String(step);
          num.value = String(Math.round(value * 10) / 10);
          num.style.width = "50px";
          const update = (v: number) => {
            slider.value = String(v);
            num.value = String(Math.round(v * 10) / 10);
            onChange(v);
            editor.requestRender();
          };
          slider.addEventListener("input", () => update(parseFloat(slider.value)));
          num.addEventListener("change", () => update(parseFloat(num.value) || 0));
          row.appendChild(slider);
          row.appendChild(num);
          return row;
        };

        section3d.appendChild(make3DInput("Rotate X", perspective.rotate_x, -180, 180, 1, (v) => {
          editor.engine.set_perspective_rotation(BigInt(id), v, perspective.rotate_y, perspective.rotate_z);
          perspective.rotate_x = v;
        }));
        section3d.appendChild(make3DInput("Rotate Y", perspective.rotate_y, -180, 180, 1, (v) => {
          editor.engine.set_perspective_rotation(BigInt(id), perspective.rotate_x, v, perspective.rotate_z);
          perspective.rotate_y = v;
        }));
        section3d.appendChild(make3DInput("Rotate Z", perspective.rotate_z, -180, 180, 1, (v) => {
          editor.engine.set_perspective_rotation(BigInt(id), perspective.rotate_x, perspective.rotate_y, v);
          perspective.rotate_z = v;
        }));
        section3d.appendChild(make3DInput("Distance", perspective.perspective, 0, 2000, 10, (v) => {
          editor.engine.set_perspective_distance(BigInt(id), v);
          perspective.perspective = v;
        }));
        section3d.appendChild(make3DInput("Origin X", perspective.origin_x, 0, 1, 0.05, (v) => {
          editor.engine.set_perspective_origin(BigInt(id), v, perspective.origin_y);
          perspective.origin_x = v;
        }));
        section3d.appendChild(make3DInput("Origin Y", perspective.origin_y, 0, 1, 0.05, (v) => {
          editor.engine.set_perspective_origin(BigInt(id), perspective.origin_x, v);
          perspective.origin_y = v;
        }));

        // Reset button
        const resetBtn = document.createElement("button");
        resetBtn.className = "prop-btn";
        resetBtn.textContent = "Reset";
        resetBtn.style.cssText = "margin-top:4px;font-size:10px;padding:3px 8px;";
        resetBtn.addEventListener("click", () => {
          editor.engine.set_perspective(BigInt(id), 0, 0, 0, 800, 0.5, 0.5);
          editor.requestRender();
          refresh(ids);
        });
        section3d.appendChild(resetBtn);

        // AR Quick Look / model-viewer preview for 3D assets
        const kindObj: any = node?.kind;
        const arSource = (
          kindObj?.Image?.src
          || kindObj?.image?.src
          || kindObj?.Video?.src
          || kindObj?.video?.src
        );
        if (typeof arSource === "string" && arSource.trim()) {
          const arBtn = document.createElement("button");
          arBtn.className = "prop-btn";
          arBtn.textContent = "AR Preview";
          arBtn.style.cssText = "margin-top:6px;font-size:10px;padding:3px 8px;";
          arBtn.title = "Open Quick Look / model-viewer preview + mobile QR";
          arBtn.addEventListener("click", () => {
            openARQuickLook({
              src: arSource,
              title: String((node as any)?.name || ""),
            });
          });
          section3d.appendChild(arBtn);
        }
      }

      container.appendChild(section3d);
    }

    // --- Node Links ---
    {
      const linksSection = createSection("Links");
      createNodeLinksSection(linksSection, editor, Number(id), () => refresh(ids));
      container.appendChild(linksSection);
    }

    // --- Resource Links (Dev resource linker) ---
    {
      const resSection = createSection("Resources");
      createResourceLinksSection(resSection, editor, Number(id), () => refresh(ids));
      container.appendChild(resSection);
    }

    // --- Node Stamps (Annotation Stickers) ---
    {
      const stampSection = createSection("Stamps");
      try {
        const stampsJson = (editor.engine as any).get_stamps_for_node(BigInt(id));
        const stamps: Array<{id: number; kind: string; note: string; author: string; timestamp: number}> = JSON.parse(stampsJson);
        if (stamps.length > 0) {
          const STAMP_INFO: Record<string, {color: string; icon: string}> = {
            approved: {color:"#22c55e",icon:"✅"}, rejected: {color:"#ef4444",icon:"❌"},
            question: {color:"#06b6d4",icon:"❓"}, fixme: {color:"#f43f5e",icon:"🔧"},
            love: {color:"#ec4899",icon:"❤️"}, warning: {color:"#eab308",icon:"⚠️"},
            info: {color:"#0ea5e9",icon:"ℹ️"}, todo: {color:"#3b82f6",icon:"📋"},
            wip: {color:"#f59e0b",icon:"🚧"}, needs_revision: {color:"#f97316",icon:"🔄"},
            final: {color:"#8b5cf6",icon:"🏁"}, on_hold: {color:"#6b7280",icon:"⏸️"},
          };
          for (const stamp of stamps) {
            const kindKey = typeof stamp.kind === "string" ? stamp.kind.toLowerCase() : String(stamp.kind).toLowerCase();
            const info = STAMP_INFO[kindKey] ?? {color:"#888",icon:"📌"};
            const row = document.createElement("div");
            row.style.cssText = `display:flex;align-items:center;gap:6px;padding:4px 0;`;
            row.innerHTML = `
              <span style="font-size:14px;">${info.icon}</span>
              <span style="flex:1;font-size:11px;color:${info.color};font-weight:600;">${kindKey.toUpperCase().replace("_"," ")}</span>
              ${stamp.note ? `<span style="font-size:10px;color:#888;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${stamp.note}">${stamp.note}</span>` : ""}
            `;
            const delBtn = document.createElement("button");
            delBtn.textContent = "✕";
            delBtn.style.cssText = `background:none;border:none;color:#666;cursor:pointer;font-size:11px;padding:2px 4px;`;
            delBtn.addEventListener("click", () => {
              (editor.engine as any).remove_stamp(BigInt(stamp.id));
              refresh(ids);
            });
            row.appendChild(delBtn);
            stampSection.appendChild(row);
          }
        } else {
          const empty = document.createElement("div");
          empty.style.cssText = "font-size:11px;color:#555;padding:4px 0;";
          empty.textContent = "No stamps on this node";
          stampSection.appendChild(empty);
        }
      } catch { /* engine may not have method */ }
      container.appendChild(stampSection);
    }

    // --- Hyperlink ---
    {
      const hlSection = createSection("Hyperlink");
      const currentLink = (editor.engine as any).get_hyperlink(BigInt(id)) as string;
      
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:4px;align-items:center;padding:4px 12px;";
      
      const inp = document.createElement("input");
      inp.type = "text";
      inp.placeholder = "https://... or page:PAGE_ID";
      inp.value = currentLink || "";
      inp.style.cssText = "flex:1;font-size:11px;padding:4px 6px;border:1px solid #555;border-radius:4px;background:#2a2a2a;color:#ddd;";
      inp.addEventListener("change", () => {
        editor.engine.push_undo();
        (editor.engine as any).set_hyperlink(BigInt(id), inp.value.trim());
        editor.requestRender();
      });
      row.appendChild(inp);

      if (currentLink) {
        const openBtn = document.createElement("button");
        openBtn.textContent = "↗";
        openBtn.title = "Open link";
        openBtn.style.cssText = "font-size:13px;background:none;border:1px solid #555;border-radius:4px;color:#4ade80;cursor:pointer;padding:2px 6px;";
        openBtn.addEventListener("click", () => {
          if (currentLink.startsWith("page:")) {
            const pageId = parseInt(currentLink.replace("page:", ""), 10);
            if (!isNaN(pageId)) {
              (editor.engine as any).set_active_page(BigInt(pageId));
              editor.requestRender();
            }
          } else {
            window.open(currentLink, "_blank");
          }
        });
        row.appendChild(openBtn);

        const clearBtn = document.createElement("button");
        clearBtn.textContent = "✕";
        clearBtn.title = "Remove link";
        clearBtn.style.cssText = "font-size:11px;background:none;border:1px solid #555;border-radius:4px;color:#f87171;cursor:pointer;padding:2px 6px;";
        clearBtn.addEventListener("click", () => {
          editor.engine.push_undo();
          (editor.engine as any).clear_hyperlink(BigInt(id));
          editor.requestRender();
          refresh(ids);
        });
        row.appendChild(clearBtn);
      }

      // Page link shortcuts
      try {
        const pagesJson = (editor.engine as any).get_pages();
        const pages: {id: number; name: string}[] = JSON.parse(pagesJson || "[]");
        if (pages.length > 1) {
          const pageRow = document.createElement("div");
          pageRow.style.cssText = "padding:2px 12px;";
          const sel = document.createElement("select");
          sel.style.cssText = "width:100%;font-size:11px;padding:3px 4px;border:1px solid #555;border-radius:4px;background:#2a2a2a;color:#ddd;";
          sel.innerHTML = `<option value="">Link to page…</option>` + pages.map(p => 
            `<option value="page:${p.id}" ${currentLink === `page:${p.id}` ? 'selected' : ''}>${p.name}</option>`
          ).join("");
          sel.addEventListener("change", () => {
            if (sel.value) {
              editor.engine.push_undo();
              (editor.engine as any).set_hyperlink(BigInt(id), sel.value);
              editor.requestRender();
              refresh(ids);
            }
          });
          pageRow.appendChild(sel);
          hlSection.appendChild(row);
          hlSection.appendChild(pageRow);
        } else {
          hlSection.appendChild(row);
        }
      } catch {
        hlSection.appendChild(row);
      }
      
      container.appendChild(hlSection);
    }

    // --- Motion Path ---
    {
      const mpSection = createSection("Motion Path");
      const pathNodesJson = editor.engine.get_path_nodes();
      const pathNodes: {id: number; name: string}[] = JSON.parse(pathNodesJson || "[]");

      if (pathNodes.length > 0) {
        // Get animation clips
        const clipsJson = editor.engine.anim_get_clips();
        const clips: {id: number; name: string}[] = JSON.parse(clipsJson || "[]");

        // Clip selector
        const clipRow = document.createElement("div");
        clipRow.style.cssText = "display:flex;gap:4px;margin-bottom:6px;align-items:center;";
        const clipLbl = document.createElement("span");
        clipLbl.style.cssText = "font-size:10px;color:#666;width:50px;flex-shrink:0;";
        clipLbl.textContent = "Clip";
        clipRow.appendChild(clipLbl);
        const clipSel = document.createElement("select");
        clipSel.className = "prop-input";
        clipSel.style.flex = "1";
        if (clips.length === 0) {
          const opt = document.createElement("option");
          opt.textContent = "(no clips)";
          clipSel.appendChild(opt);
          clipSel.disabled = true;
        } else {
          for (const c of clips) {
            const opt = document.createElement("option");
            opt.value = String(c.id);
            opt.textContent = c.name;
            clipSel.appendChild(opt);
          }
        }
        clipRow.appendChild(clipSel);
        mpSection.appendChild(clipRow);

        const getClipId = () => {
          const v = clipSel.value;
          return v ? Number(v) : 0;
        };

        // Check existing motion path
        const checkExisting = () => {
          const clipId = getClipId();
          if (!clipId) return null;
          try {
            const info = JSON.parse(editor.engine.anim_get_motion_path(BigInt(clipId), id));
            return info;
          } catch { return null; }
        };

        let existing = checkExisting();

        // Path selector
        const pathRow = document.createElement("div");
        pathRow.style.cssText = "display:flex;gap:4px;margin-bottom:6px;align-items:center;";
        const pathLbl = document.createElement("span");
        pathLbl.style.cssText = "font-size:10px;color:#666;width:50px;flex-shrink:0;";
        pathLbl.textContent = "Path";
        pathRow.appendChild(pathLbl);
        const pathSel = document.createElement("select");
        pathSel.className = "prop-input";
        pathSel.style.flex = "1";
        const noneOpt = document.createElement("option");
        noneOpt.value = "0";
        noneOpt.textContent = "(none)";
        pathSel.appendChild(noneOpt);
        for (const p of pathNodes) {
          const opt = document.createElement("option");
          opt.value = String(p.id);
          opt.textContent = p.name || `Path ${p.id}`;
          if (existing && existing.path_node_id === p.id) opt.selected = true;
          pathSel.appendChild(opt);
        }
        pathRow.appendChild(pathSel);
        mpSection.appendChild(pathRow);

        // Duration
        const durRow = document.createElement("div");
        durRow.style.cssText = "display:flex;gap:4px;margin-bottom:6px;align-items:center;";
        const durLbl = document.createElement("span");
        durLbl.style.cssText = "font-size:10px;color:#666;width:50px;flex-shrink:0;";
        durLbl.textContent = "Duration";
        durRow.appendChild(durLbl);
        const durInput = document.createElement("input");
        durInput.type = "number";
        durInput.className = "prop-input";
        durInput.style.flex = "1";
        durInput.value = "1000";
        durInput.min = "100";
        durInput.step = "100";
        durRow.appendChild(durInput);
        const durUnit = document.createElement("span");
        durUnit.style.cssText = "font-size:10px;color:#666;";
        durUnit.textContent = "ms";
        durRow.appendChild(durUnit);
        mpSection.appendChild(durRow);

        // Easing
        const easeRow = document.createElement("div");
        easeRow.style.cssText = "display:flex;gap:4px;margin-bottom:6px;align-items:center;";
        const easeLbl = document.createElement("span");
        easeLbl.style.cssText = "font-size:10px;color:#666;width:50px;flex-shrink:0;";
        easeLbl.textContent = "Easing";
        easeRow.appendChild(easeLbl);
        const easeSel = document.createElement("select");
        easeSel.className = "prop-input";
        easeSel.style.flex = "1";
        for (const e of ["ease-in-out", "linear", "ease-in", "ease-out"]) {
          const opt = document.createElement("option");
          opt.value = e;
          opt.textContent = e;
          easeSel.appendChild(opt);
        }
        easeRow.appendChild(easeSel);
        mpSection.appendChild(easeRow);

        // Auto-orient toggle
        const orientRow = document.createElement("div");
        orientRow.style.cssText = "display:flex;gap:4px;margin-bottom:6px;align-items:center;";
        const orientLbl = document.createElement("span");
        orientLbl.style.cssText = "font-size:10px;color:#666;width:50px;flex-shrink:0;";
        orientLbl.textContent = "Orient";
        orientRow.appendChild(orientLbl);
        const orientCb = document.createElement("input");
        orientCb.type = "checkbox";
        orientCb.checked = existing ? existing.orient_to_path : true;
        orientRow.appendChild(orientCb);
        const orientTxt = document.createElement("span");
        orientTxt.style.cssText = "font-size:10px;color:#aaa;";
        orientTxt.textContent = "Auto-orient to path";
        orientRow.appendChild(orientTxt);
        mpSection.appendChild(orientRow);

        // Apply / Remove buttons
        const btnRow = document.createElement("div");
        btnRow.style.cssText = "display:flex;gap:4px;margin-top:4px;";
        const applyBtn = document.createElement("button");
        applyBtn.style.cssText = "flex:1;padding:4px 8px;border:none;border-radius:4px;background:#3b82f6;color:#fff;font-size:11px;cursor:pointer;";
        applyBtn.textContent = existing ? "Update" : "Apply";
        applyBtn.addEventListener("click", () => {
          const clipId = getClipId();
          const pathId = Number(pathSel.value);
          if (!clipId || !pathId) return;
          ensureUndo();
          editor.engine.anim_set_motion_path(
            BigInt(clipId), id, BigInt(pathId),
            Number(durInput.value) || 1000,
            orientCb.checked, 0.0, easeSel.value
          );
          editor.requestRender();
          refresh(ids);
        });
        btnRow.appendChild(applyBtn);

        if (existing) {
          const removeBtn = document.createElement("button");
          removeBtn.style.cssText = "flex:1;padding:4px 8px;border:1px solid #444;border-radius:4px;background:#2a2a2a;color:#e0e0e0;font-size:11px;cursor:pointer;";
          removeBtn.textContent = "Remove";
          removeBtn.addEventListener("click", () => {
            const clipId = getClipId();
            if (!clipId) return;
            ensureUndo();
            editor.engine.anim_remove_motion_path(BigInt(clipId), id);
            editor.requestRender();
            refresh(ids);
          });
          btnRow.appendChild(removeBtn);
        }
        mpSection.appendChild(btnRow);
      } else {
        const noPath = document.createElement("div");
        noPath.style.cssText = "font-size:10px;color:#666;padding:4px;";
        noPath.textContent = "No path nodes in scene. Draw a path first.";
        mpSection.appendChild(noPath);
      }
      container.appendChild(mpSection);
    }

    // --- Prototype Interactions ---
    {
      const interSection = createSection("Interactions");

      const interJson = editor.engine.get_interactions(id);
      const interactions: any[] = JSON.parse(interJson || "[]");

      // Get all frames across all pages for target selection
      const pagesJson = editor.engine.get_pages();
      const pages: any[] = JSON.parse(pagesJson || "[]");

      interactions.forEach((inter: any, idx: number) => {
        const interEl = document.createElement("div");
        interEl.style.cssText = "background:#1e1e1e;border-radius:6px;padding:8px;margin-bottom:6px;position:relative;";

        // Header: trigger label + delete
        const hdr = document.createElement("div");
        hdr.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;";
        const trigLabel = document.createElement("span");
        trigLabel.style.cssText = "font-size:11px;color:#aaa;";
        trigLabel.textContent = `${inter.trigger || "OnClick"} → ${inter.action || "NavigateTo"}`;
        hdr.appendChild(trigLabel);

        const delBtn = document.createElement("button");
        delBtn.style.cssText = "width:18px;height:18px;border:1px solid #444;border-radius:4px;background:#2a2a2a;cursor:pointer;padding:0;color:#888;font-size:12px;line-height:1;";
        delBtn.textContent = "×";
        delBtn.addEventListener("click", () => {
          ensureUndo();
          editor.engine.remove_interaction(id, idx);
          editor.requestRender();
          refresh(ids);
        });
        hdr.appendChild(delBtn);
        interEl.appendChild(hdr);

        // Trigger select
        const trigRow = document.createElement("div");
        trigRow.style.cssText = "display:flex;gap:4px;margin-bottom:4px;align-items:center;";
        const trigLbl = document.createElement("span");
        trigLbl.style.cssText = "font-size:10px;color:#666;width:50px;flex-shrink:0;";
        trigLbl.textContent = "Trigger";
        trigRow.appendChild(trigLbl);
        const trigSelect = document.createElement("select");
        trigSelect.className = "prop-input";
        trigSelect.style.flex = "1";
        const triggers = [
          { value: "click", label: "Click" },
          { value: "hover", label: "Hover" },
          { value: "press", label: "Press" },
          { value: "drag", label: "Drag" },
          { value: "swipe-left", label: "Swipe Left" },
          { value: "swipe-right", label: "Swipe Right" },
          { value: "swipe-up", label: "Swipe Up" },
          { value: "swipe-down", label: "Swipe Down" },
          { value: "long-press", label: "Long Press" },
          { value: "pinch-in", label: "Pinch In" },
          { value: "pinch-out", label: "Pinch Out" },
        ];
        const trigMap: Record<string, string> = {
          OnClick: "click", OnHover: "hover", OnPress: "press", OnDrag: "drag",
          OnSwipeLeft: "swipe-left", OnSwipeRight: "swipe-right",
          OnSwipeUp: "swipe-up", OnSwipeDown: "swipe-down",
          OnLongPress: "long-press", OnPinchIn: "pinch-in", OnPinchOut: "pinch-out",
        };
        for (const t of triggers) {
          const opt = document.createElement("option");
          opt.value = t.value;
          opt.textContent = t.label;
          if ((trigMap[inter.trigger] || "click") === t.value) opt.selected = true;
          trigSelect.appendChild(opt);
        }
        trigSelect.addEventListener("change", () => {
          ensureUndo();
          editor.engine.remove_interaction(id, idx);
          const newIdx = editor.engine.add_interaction(
            id, trigSelect.value, actSelect.value,
            BigInt(inter.target_node_id || 0), BigInt(inter.target_page_id || 0),
            transSelect.value, parseInt(durInput.value) || 300,
            inter.easing || "ease_in_out"
          );
          if (newIdx >= 0 && inter.variant_key_json) {
            editor.engine.set_interaction_variant_key(id, newIdx, inter.variant_key_json);
          }
          editor.requestRender();
          refresh(ids);
        });
        trigRow.appendChild(trigSelect);
        interEl.appendChild(trigRow);

        // Action select
        const actRow = document.createElement("div");
        actRow.style.cssText = "display:flex;gap:4px;margin-bottom:4px;align-items:center;";
        const actLbl = document.createElement("span");
        actLbl.style.cssText = "font-size:10px;color:#666;width:50px;flex-shrink:0;";
        actLbl.textContent = "Action";
        actRow.appendChild(actLbl);
        const actSelect = document.createElement("select");
        actSelect.className = "prop-input";
        actSelect.style.flex = "1";
        for (const a of ["navigate-to", "back", "scroll-to", "open-overlay", "close-overlay", "swap-variant", "set-variable"]) {
          const opt = document.createElement("option");
          opt.value = a;
          opt.textContent = a.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
          const actMap: Record<string, string> = { NavigateTo: "navigate-to", Back: "back", ScrollTo: "scroll-to", OpenOverlay: "open-overlay", CloseOverlay: "close-overlay", SwapVariant: "swap-variant", SetVariable: "set-variable" };
          if ((actMap[inter.action] || "navigate-to") === a) opt.selected = true;
          actSelect.appendChild(opt);
        }
        actRow.appendChild(actSelect);
        interEl.appendChild(actRow);

        // Target node ID input (simple for now)
        const targetRow = document.createElement("div");
        targetRow.style.cssText = "display:flex;gap:4px;margin-bottom:4px;align-items:center;";
        const targetLbl = document.createElement("span");
        targetLbl.style.cssText = "font-size:10px;color:#666;width:50px;flex-shrink:0;";
        targetLbl.textContent = "Target";
        targetRow.appendChild(targetLbl);
        const targetInput = document.createElement("input");
        targetInput.className = "prop-input";
        targetInput.style.flex = "1";
        targetInput.type = "number";
        targetInput.placeholder = "Frame ID";
        targetInput.value = String(inter.target_node_id || "");
        targetInput.addEventListener("change", () => {
          ensureUndo();
          editor.engine.remove_interaction(id, idx);
          const newIdx = editor.engine.add_interaction(
            id, trigSelect.value, actSelect.value,
            BigInt(parseInt(targetInput.value) || 0), BigInt(inter.target_page_id || 0),
            transSelect.value, parseInt(durInput.value) || 300,
            inter.easing || "ease_in_out"
          );
          if (newIdx >= 0 && variantInput.value) {
            editor.engine.set_interaction_variant_key(id, newIdx, variantInput.value);
          }
          editor.requestRender();
          refresh(ids);
        });
        targetRow.appendChild(targetInput);
        interEl.appendChild(targetRow);

        // Variant key JSON input (shown when action is SwapVariant)
        const variantRow = document.createElement("div");
        variantRow.style.cssText = "display:flex;gap:4px;margin-bottom:4px;align-items:center;";
        variantRow.style.display = inter.action === "SwapVariant" ? "flex" : "none";
        const variantLbl = document.createElement("span");
        variantLbl.style.cssText = "font-size:10px;color:#666;width:50px;flex-shrink:0;";
        variantLbl.textContent = "Variant";
        variantRow.appendChild(variantLbl);
        const variantInput = document.createElement("input");
        variantInput.className = "prop-input";
        variantInput.style.flex = "1";
        variantInput.placeholder = '{"State":"Hover"}';
        variantInput.value = inter.variant_key_json || "";
        variantInput.addEventListener("change", () => {
          ensureUndo();
          editor.engine.set_interaction_variant_key(id, idx, variantInput.value);
          editor.requestRender();
        });
        variantRow.appendChild(variantInput);
        interEl.appendChild(variantRow);

        // --- SetVariable fields (shown when action is SetVariable) ---
        const setVarRow = document.createElement("div");
        setVarRow.style.cssText = "margin-bottom:4px;";
        setVarRow.style.display = inter.action === "SetVariable" ? "" : "none";
        {
          const r1 = document.createElement("div");
          r1.style.cssText = "display:flex;gap:4px;margin-bottom:4px;align-items:center;";
          const l1 = document.createElement("span");
          l1.style.cssText = "font-size:10px;color:#666;width:50px;flex-shrink:0;";
          l1.textContent = "Var Name";
          r1.appendChild(l1);
          const svNameInput = document.createElement("input");
          svNameInput.className = "prop-input";
          svNameInput.style.flex = "1";
          svNameInput.placeholder = "variable name";
          svNameInput.value = inter.set_variable_name || "";
          svNameInput.addEventListener("change", () => {
            ensureUndo();
            editor.engine.set_interaction_set_variable(id, idx, svNameInput.value, svExprInput.value);
            editor.requestRender();
          });
          r1.appendChild(svNameInput);
          setVarRow.appendChild(r1);

          const r2 = document.createElement("div");
          r2.style.cssText = "display:flex;gap:4px;align-items:center;";
          const l2 = document.createElement("span");
          l2.style.cssText = "font-size:10px;color:#666;width:50px;flex-shrink:0;";
          l2.textContent = "Expr";
          r2.appendChild(l2);
          const svExprInput = document.createElement("input");
          svExprInput.className = "prop-input";
          svExprInput.style.flex = "1";
          svExprInput.placeholder = "+1, -1, toggle, or value";
          svExprInput.value = inter.set_variable_expression || "";
          svExprInput.addEventListener("change", () => {
            ensureUndo();
            editor.engine.set_interaction_set_variable(id, idx, svNameInput.value, svExprInput.value);
            editor.requestRender();
          });
          r2.appendChild(svExprInput);
          setVarRow.appendChild(r2);
        }
        interEl.appendChild(setVarRow);

        // --- Condition (optional, applies to any interaction) ---
        const condRow = document.createElement("div");
        condRow.style.cssText = "margin-top:6px;border-top:1px solid #333;padding-top:6px;";
        {
          const condLabel = document.createElement("span");
          condLabel.style.cssText = "font-size:10px;color:#818cf8;display:block;margin-bottom:4px;";
          condLabel.textContent = "Condition (optional)";
          condRow.appendChild(condLabel);

          const cond = inter.condition || { variable: "", operator: "Equal", value: "" };
          const cr = document.createElement("div");
          cr.style.cssText = "display:flex;gap:4px;align-items:center;";

          const condVarInput = document.createElement("input");
          condVarInput.className = "prop-input";
          condVarInput.style.cssText = "flex:1;";
          condVarInput.placeholder = "variable";
          condVarInput.value = cond.variable;

          const condOpSelect = document.createElement("select");
          condOpSelect.className = "prop-input";
          condOpSelect.style.cssText = "width:50px;";
          for (const [val, label] of [["Equal","=="],["NotEqual","!="],["GreaterThan",">"],["LessThan","<"],["GreaterThanOrEqual",">="],["LessThanOrEqual","<="]]) {
            const o = document.createElement("option");
            o.value = val; o.textContent = label;
            if (cond.operator === val) o.selected = true;
            condOpSelect.appendChild(o);
          }

          const condValInput = document.createElement("input");
          condValInput.className = "prop-input";
          condValInput.style.cssText = "flex:1;";
          condValInput.placeholder = "value";
          condValInput.value = cond.value;

          const applyCond = () => {
            ensureUndo();
            if (condVarInput.value.trim()) {
              const condJson = JSON.stringify({ variable: condVarInput.value.trim(), operator: condOpSelect.value, value: condValInput.value });
              editor.engine.set_interaction_condition(id, idx, condJson);
            } else {
              editor.engine.set_interaction_condition(id, idx, "");
            }
            editor.requestRender();
          };
          condVarInput.addEventListener("change", applyCond);
          condOpSelect.addEventListener("change", applyCond);
          condValInput.addEventListener("change", applyCond);

          cr.appendChild(condVarInput);
          cr.appendChild(condOpSelect);
          cr.appendChild(condValInput);
          condRow.appendChild(cr);

          if (inter.condition) {
            const clearCondBtn = document.createElement("button");
            clearCondBtn.style.cssText = "margin-top:4px;font-size:10px;color:#e94560;background:none;border:none;cursor:pointer;padding:0;";
            clearCondBtn.textContent = "Clear condition";
            clearCondBtn.addEventListener("click", () => {
              ensureUndo();
              editor.engine.set_interaction_condition(id, idx, "");
              editor.requestRender();
              refresh(ids);
            });
            condRow.appendChild(clearCondBtn);
          }
        }
        interEl.appendChild(condRow);

        // Show/hide variant row based on action
        actSelect.addEventListener("change", () => {
          variantRow.style.display = actSelect.value === "swap-variant" ? "flex" : "none";
          setVarRow.style.display = actSelect.value === "set-variable" ? "" : "none";
        });

        // Transition select
        const transRow = document.createElement("div");
        transRow.style.cssText = "display:flex;gap:4px;margin-bottom:4px;align-items:center;";
        const transLbl = document.createElement("span");
        transLbl.style.cssText = "font-size:10px;color:#666;width:50px;flex-shrink:0;";
        transLbl.textContent = "Transition";
        transRow.appendChild(transLbl);
        const transSelect = document.createElement("select");
        transSelect.className = "prop-input";
        transSelect.style.flex = "1";
        for (const tr of ["instant", "dissolve", "smart-animate", "slide-in", "slide-out", "push"]) {
          const opt = document.createElement("option");
          opt.value = tr;
          opt.textContent = tr.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
          const trMap: Record<string, string> = { Instant: "instant", Dissolve: "dissolve", SmartAnimate: "smart-animate", SlideIn: "slide-in", SlideOut: "slide-out", Push: "push" };
          if ((trMap[inter.transition] || "instant") === tr) opt.selected = true;
          transSelect.appendChild(opt);
        }
        transRow.appendChild(transSelect);
        interEl.appendChild(transRow);

        // Duration
        const durRow = document.createElement("div");
        durRow.style.cssText = "display:flex;gap:4px;align-items:center;";
        const durLbl = document.createElement("span");
        durLbl.style.cssText = "font-size:10px;color:#666;width:50px;flex-shrink:0;";
        durLbl.textContent = "Duration";
        durRow.appendChild(durLbl);
        const durInput = document.createElement("input");
        durInput.className = "prop-input";
        durInput.style.flex = "1";
        durInput.type = "number";
        durInput.min = "0";
        durInput.step = "50";
        durInput.value = String(inter.transition_duration_ms || 300);
        durInput.addEventListener("change", () => {
          ensureUndo();
          editor.engine.remove_interaction(id, idx);
          editor.engine.add_interaction(
            id, trigSelect.value, actSelect.value,
            BigInt(inter.target_node_id || 0), BigInt(inter.target_page_id || 0),
            transSelect.value, parseInt(durInput.value) || 300,
            inter.easing || "ease_in_out"
          );
          editor.requestRender();
          refresh(ids);
        });
        const durMs = document.createElement("span");
        durMs.style.cssText = "font-size:10px;color:#666;";
        durMs.textContent = "ms";
        durRow.appendChild(durInput);
        durRow.appendChild(durMs);
        interEl.appendChild(durRow);

        // --- Easing Curve Editor ---
        {
          const easingRow = document.createElement("div");
          easingRow.style.cssText = "margin-top:6px;";
          const easingLbl = document.createElement("span");
          easingLbl.style.cssText = "font-size:10px;color:#666;display:block;margin-bottom:4px;";
          easingLbl.textContent = "Easing";
          easingRow.appendChild(easingLbl);

          const easingEditor = createEasingEditor(inter.easing || "ease_in_out", (newEasing: string) => {
            ensureUndo();
            editor.engine.set_interaction_easing(id, idx, newEasing);
            editor.requestRender();
          });
          easingRow.appendChild(easingEditor);
          interEl.appendChild(easingRow);
        }

        interSection.appendChild(interEl);
      });

      // Add interaction button
      const addInterBtn = document.createElement("button");
      addInterBtn.className = "prop-add-btn";
      addInterBtn.textContent = "+ Add interaction";
      addInterBtn.addEventListener("click", () => {
        ensureUndo();
        editor.engine.add_interaction(id, "click", "navigate-to", BigInt(0), BigInt(0), "instant", 300, "ease_in_out");
        editor.requestRender();
        refresh(ids);
      });
      interSection.appendChild(addInterBtn);

      container.appendChild(interSection);
    }

    // --- Scroll Animations ---
    {
      renderScrollAnimSection(container, editor);
    }

    // --- Prototype Variables (scene-level) ---
    {
      const varSection = createSection("Prototype Variables");
      let vars: { name: string; var_type: string; default_value: string }[] = [];
      try { vars = JSON.parse(editor.engine.get_prototype_variables() || "[]"); } catch {}

      vars.forEach((v) => {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;gap:4px;margin-bottom:4px;align-items:center;";

        const nameSpan = document.createElement("span");
        nameSpan.style.cssText = "font-size:11px;color:#ccc;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        nameSpan.textContent = v.name;
        nameSpan.title = `${v.name} (${v.var_type}) = ${v.default_value}`;
        row.appendChild(nameSpan);

        const typeSpan = document.createElement("span");
        typeSpan.style.cssText = "font-size:10px;color:#818cf8;width:48px;text-align:center;";
        typeSpan.textContent = v.var_type;
        row.appendChild(typeSpan);

        const valSpan = document.createElement("span");
        valSpan.style.cssText = "font-size:10px;color:#4ade80;width:48px;text-align:right;";
        valSpan.textContent = v.default_value;
        row.appendChild(valSpan);

        const delBtn = document.createElement("button");
        delBtn.style.cssText = "width:18px;height:18px;border:1px solid #444;border-radius:4px;background:#2a2a2a;cursor:pointer;padding:0;color:#888;font-size:12px;line-height:1;";
        delBtn.textContent = "×";
        delBtn.addEventListener("click", () => {
          ensureUndo();
          editor.engine.remove_prototype_variable(v.name);
          editor.requestRender();
          refresh(ids);
        });
        row.appendChild(delBtn);

        varSection.appendChild(row);
      });

      // Add variable form
      const addForm = document.createElement("div");
      addForm.style.cssText = "display:flex;gap:4px;align-items:center;margin-top:4px;";
      const addName = document.createElement("input");
      addName.className = "prop-input";
      addName.style.flex = "1";
      addName.placeholder = "name";
      const addType = document.createElement("select");
      addType.className = "prop-input";
      addType.style.width = "60px";
      for (const t of ["number", "boolean", "string"]) {
        const o = document.createElement("option");
        o.value = t; o.textContent = t;
        addType.appendChild(o);
      }
      const addVal = document.createElement("input");
      addVal.className = "prop-input";
      addVal.style.width = "50px";
      addVal.placeholder = "default";
      const addBtn = document.createElement("button");
      addBtn.className = "prop-add-btn";
      addBtn.style.cssText = "padding:4px 8px;font-size:10px;";
      addBtn.textContent = "+";
      addBtn.addEventListener("click", () => {
        const name = addName.value.trim();
        if (!name) return;
        ensureUndo();
        editor.engine.add_prototype_variable(name, addType.value, addVal.value || (addType.value === "number" ? "0" : addType.value === "boolean" ? "false" : ""));
        editor.requestRender();
        refresh(ids);
      });
      addForm.appendChild(addName);
      addForm.appendChild(addType);
      addForm.appendChild(addVal);
      addForm.appendChild(addBtn);
      varSection.appendChild(addForm);

      container.appendChild(varSection);
    }

    // --- Prototype Flows ---
    {
      const flowSection = createSection("Prototype Flows");

      const flowsJson = editor.engine.get_prototype_flows();
      const flows: any[] = JSON.parse(flowsJson || "[]");

      flows.forEach((flow: any) => {
        const flowEl = document.createElement("div");
        flowEl.style.cssText = "background:#1e1e1e;border-radius:6px;padding:8px;margin-bottom:6px;position:relative;";

        const hdr = document.createElement("div");
        hdr.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;";

        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.value = flow.name;
        nameInput.style.cssText = "background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#ccc;padding:2px 6px;font-size:11px;width:120px;";
        nameInput.addEventListener("change", () => {
          ensureUndo();
          editor.engine.rename_flow(BigInt(flow.id), nameInput.value);
          editor.requestRender();
        });
        hdr.appendChild(nameInput);

        const delBtn = document.createElement("button");
        delBtn.style.cssText = "width:18px;height:18px;border:1px solid #444;border-radius:4px;background:#2a2a2a;cursor:pointer;padding:0;color:#888;font-size:12px;line-height:1;";
        delBtn.textContent = "×";
        delBtn.addEventListener("click", () => {
          ensureUndo();
          editor.engine.remove_flow(BigInt(flow.id));
          editor.requestRender();
          refresh(ids);
        });
        hdr.appendChild(delBtn);
        flowEl.appendChild(hdr);

        // Start frame selector
        const startLabel = document.createElement("div");
        startLabel.style.cssText = "font-size:10px;color:#888;margin-bottom:2px;";
        startLabel.textContent = "Start frame:";
        flowEl.appendChild(startLabel);

        const startInfo = document.createElement("div");
        startInfo.style.cssText = "font-size:11px;color:#aaa;margin-bottom:4px;";
        if (flow.start_frame_id) {
          startInfo.textContent = `Node #${flow.start_frame_id} (Page ${flow.start_page_id})`;
        } else {
          startInfo.textContent = "Not set";
        }
        flowEl.appendChild(startInfo);

        const setStartBtn = document.createElement("button");
        setStartBtn.style.cssText = "background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#aaa;padding:2px 8px;font-size:10px;cursor:pointer;";
        setStartBtn.textContent = id ? "Set selected as start" : "Select a node first";
        setStartBtn.disabled = !id;
        setStartBtn.addEventListener("click", () => {
          if (!id) return;
          ensureUndo();
          const pageId = editor.engine.get_active_page_id?.() || BigInt(0);
          editor.engine.set_flow_start_frame(BigInt(flow.id), BigInt(id), pageId);
          editor.requestRender();
          refresh(ids);
        });
        flowEl.appendChild(setStartBtn);

        flowSection.appendChild(flowEl);
      });

      const addFlowBtn = document.createElement("button");
      addFlowBtn.className = "prop-add-btn";
      addFlowBtn.textContent = "+ Add flow";
      addFlowBtn.addEventListener("click", () => {
        ensureUndo();
        editor.engine.add_flow("Flow " + (flows.length + 1));
        editor.requestRender();
        refresh(ids);
      });
      flowSection.appendChild(addFlowBtn);

      container.appendChild(flowSection);
    }

    // --- Conditional Visibility ---
    {
      const cvSection = createSection("Conditional Visibility");
      const cvJson = editor.engine.get_conditional_visibility(id);
      const cv = JSON.parse(cvJson || "null");

      const collectionsJson = editor.engine.get_variable_collections();
      const collections: any[] = JSON.parse(collectionsJson || "[]");

      if (cv) {
        const col = collections.find((c: any) => c.id === cv.collection_id);
        const varObj = col?.variables?.find((v: any) => v.id === cv.variable_id);
        const info = document.createElement("div");
        info.style.cssText = "font-size:11px;color:#ccc;margin-bottom:4px;";
        const opLabel = cv.operator === "IsTrue" ? "is true" : cv.operator === "IsFalse" ? "is false" :
          `${cv.operator} ${cv.value ? JSON.stringify(cv.value) : ""}`;
        info.textContent = `Show when "${varObj?.name || "?"}" ${opLabel}`;
        cvSection.appendChild(info);

        const clearBtn = document.createElement("button");
        clearBtn.textContent = "Remove condition";
        clearBtn.style.cssText = "font-size:11px;padding:2px 8px;cursor:pointer;background:#444;color:#fff;border:1px solid #555;border-radius:4px;";
        clearBtn.addEventListener("click", () => {
          editor.engine.clear_conditional_visibility(id);
          editor.requestRender();
          refresh(ids);
        });
        cvSection.appendChild(clearBtn);
      } else if (collections.length === 0) {
        const hint = document.createElement("div");
        hint.style.cssText = "font-size:11px;color:#888;";
        hint.textContent = "Create a variable collection first";
        cvSection.appendChild(hint);
      } else {
        const allVars: { col: any; v: any }[] = [];
        for (const col of collections) {
          for (const v of col.variables || []) {
            allVars.push({ col, v });
          }
        }
        if (allVars.length === 0) {
          const hint = document.createElement("div");
          hint.style.cssText = "font-size:11px;color:#888;";
          hint.textContent = "No variables defined";
          cvSection.appendChild(hint);
        } else {
          const row = document.createElement("div");
          row.style.cssText = "display:flex;flex-direction:column;gap:4px;";

          const varSelect = document.createElement("select");
          varSelect.style.cssText = "font-size:11px;background:#333;color:#fff;border:1px solid #555;border-radius:4px;padding:2px 4px;";
          for (const { col, v } of allVars) {
            const opt = document.createElement("option");
            opt.value = `${col.id}:${v.id}`;
            opt.textContent = `${col.name} / ${v.name} (${v.value_type})`;
            varSelect.appendChild(opt);
          }
          row.appendChild(varSelect);

          const opSelect = document.createElement("select");
          opSelect.style.cssText = "font-size:11px;background:#333;color:#fff;border:1px solid #555;border-radius:4px;padding:2px 4px;";
          for (const op of [
            { value: "eq", label: "=" }, { value: "neq", label: "≠" },
            { value: "gt", label: ">" }, { value: "lt", label: "<" },
            { value: "gte", label: "≥" }, { value: "lte", label: "≤" },
            { value: "is_true", label: "is true" }, { value: "is_false", label: "is false" },
          ]) {
            const opt = document.createElement("option");
            opt.value = op.value;
            opt.textContent = op.label;
            opSelect.appendChild(opt);
          }
          row.appendChild(opSelect);

          const valueInput = document.createElement("input");
          valueInput.placeholder = "Value";
          valueInput.style.cssText = "font-size:11px;background:#333;color:#fff;border:1px solid #555;border-radius:4px;padding:2px 4px;width:100%;box-sizing:border-box;";
          row.appendChild(valueInput);

          const updateValueVis = () => {
            valueInput.style.display = (opSelect.value === "is_true" || opSelect.value === "is_false") ? "none" : "";
          };
          opSelect.addEventListener("change", updateValueVis);
          updateValueVis();

          const applyBtn = document.createElement("button");
          applyBtn.textContent = "Set condition";
          applyBtn.style.cssText = "font-size:11px;padding:2px 8px;cursor:pointer;background:#4a9eff;color:#fff;border:none;border-radius:4px;";
          applyBtn.addEventListener("click", () => {
            const [colId, varId] = varSelect.value.split(":").map(Number);
            const op = opSelect.value;
            let valueJson = "";
            if (op !== "is_true" && op !== "is_false") {
              const raw = valueInput.value.trim();
              const selVar = allVars.find(av => av.col.id === colId && av.v.id === varId);
              const vtype = selVar?.v.value_type || "String";
              if (vtype === "Number" || vtype === "number") {
                valueJson = JSON.stringify({ Number: parseFloat(raw) || 0 });
              } else if (vtype === "Boolean" || vtype === "boolean") {
                valueJson = JSON.stringify({ Boolean: raw === "true" });
              } else if (vtype === "Color" || vtype === "color") {
                valueJson = JSON.stringify({ Color: raw });
              } else {
                valueJson = JSON.stringify({ String: raw });
              }
            }
            editor.engine.set_conditional_visibility(id, BigInt(colId), BigInt(varId), op, valueJson);
            editor.requestRender();
            refresh(ids);
          });
          row.appendChild(applyBtn);
          cvSection.appendChild(row);
        }
      }
      container.appendChild(cvSection);
    }

    // --- Text-specific ---
    if (typeof node.kind === "object" && node.kind.Text) {
      // Text Style dropdown
      {
        const tsSection = createSection("Text Style");
        const styleInfoJson = editor.engine.get_node_style_info(id);
        const styleInfo = JSON.parse(styleInfoJson || "null");
        const textStylesJson = editor.engine.list_text_styles();
        const textStyles: any[] = JSON.parse(textStylesJson || "[]");

        const tsRow = document.createElement("div");
        tsRow.style.cssText = "display:flex;gap:4px;align-items:center;";

        const tsSelect = document.createElement("select");
        tsSelect.className = "prop-input";
        tsSelect.style.flex = "1";
        const tsNone = document.createElement("option");
        tsNone.value = "";
        tsNone.textContent = styleInfo?.text_style_id ? "— Detach —" : "— None —";
        tsSelect.appendChild(tsNone);
        for (const ts of textStyles) {
          const opt = document.createElement("option");
          opt.value = String(ts.id);
          opt.textContent = `${ts.name} (${ts.font_family} ${ts.font_size}px)`;
          if (styleInfo?.text_style_id === ts.id) opt.selected = true;
          tsSelect.appendChild(opt);
        }
        tsSelect.addEventListener("change", () => {
          ensureUndo();
          if (tsSelect.value) {
            editor.engine.apply_text_style(id, BigInt(tsSelect.value));
          } else {
            editor.engine.detach_text_style(id);
          }
          editor.requestRender();
          refresh(ids);
        });
        tsRow.appendChild(tsSelect);

        // Quick create text style
        const tsCreateBtn = document.createElement("button");
        tsCreateBtn.style.cssText = "background:none;border:1px solid #444;border-radius:4px;color:#888;cursor:pointer;font-size:11px;padding:3px 6px;white-space:nowrap;";
        tsCreateBtn.textContent = "+";
        tsCreateBtn.title = "Create text style from current text properties";
        tsCreateBtn.addEventListener("click", () => {
          ensureUndo();
          const td = node.kind.Text;
          const fillInfoJson = editor.engine.get_fill_info(id);
          const fillInfo = JSON.parse(fillInfoJson || "null");
          const c = fillInfo?.color || { r: 0, g: 0, b: 0, a: 1 };
          const name = prompt("Text style name:", "Text " + (textStyles.length + 1));
          if (name) {
            const fs = (td.font_style || "Normal") === "Italic" ? "italic" : "normal";
            const ta = (td.text_align || "Left").toLowerCase();
            const sid = editor.engine.add_text_style(name, td.font_family || "Inter", td.font_size || 16, td.font_weight || 400, fs, td.line_height || 1.2, ta, c.r, c.g, c.b, c.a);
            editor.engine.apply_text_style(id, sid);
            editor.requestRender();
            refresh(ids);
          }
        });
        tsRow.appendChild(tsCreateBtn);
        tsSection.appendChild(tsRow);

        if (styleInfo?.text_style_name) {
          const linkedLabel = document.createElement("div");
          linkedLabel.style.cssText = "font-size:10px;color:#818cf8;margin-top:4px;";
          linkedLabel.textContent = `🔗 ${styleInfo.text_style_name}`;
          tsSection.appendChild(linkedLabel);
        }

        container.appendChild(tsSection);
      }

      const textSection = createSection("Text");

      // Content
      const contentArea = document.createElement("textarea");
      contentArea.className = "prop-input";
      contentArea.style.cssText = "resize:vertical;min-height:60px;font-family:inherit;";
      contentArea.value = node.kind.Text.content || "";
      contentArea.addEventListener("change", () => {
        editor.engine.set_text_content(id, contentArea.value);
        editor.requestRender();
      });
      textSection.appendChild(contentArea);

      // Font weight + style row
      const styleRow = document.createElement("div");
      styleRow.style.cssText = "display:flex;gap:4px;margin-top:6px;";

      // Font weight select
      const weightSelect = document.createElement("select");
      weightSelect.className = "prop-input";
      weightSelect.style.cssText = "flex:1;cursor:pointer;";
      const weights = [
        { v: 100, l: "Thin" }, { v: 200, l: "ExtraLight" }, { v: 300, l: "Light" },
        { v: 400, l: "Regular" }, { v: 500, l: "Medium" }, { v: 600, l: "SemiBold" },
        { v: 700, l: "Bold" }, { v: 800, l: "ExtraBold" }, { v: 900, l: "Black" },
      ];
      const curWeight = node.kind.Text.font_weight ?? 400;
      weights.forEach(({ v, l }) => {
        const opt = document.createElement("option");
        opt.value = String(v);
        opt.textContent = `${l} (${v})`;
        if (v === curWeight) opt.selected = true;
        weightSelect.appendChild(opt);
      });
      weightSelect.addEventListener("change", () => {
        editor.engine.set_font_weight(id, parseInt(weightSelect.value));
        editor.requestRender();
      });
      styleRow.appendChild(weightSelect);

      // Italic toggle
      const curStyle = node.kind.Text.font_style ?? "Normal";
      const italicBtn = document.createElement("button");
      const isItalic = curStyle === "Italic";
      italicBtn.textContent = "I";
      italicBtn.style.cssText = `
        width:32px;border:1px solid ${isItalic ? "#4f46e5" : "#444"};border-radius:4px;
        background:${isItalic ? "#4f46e520" : "#2a2a2a"};color:${isItalic ? "#818cf8" : "#999"};
        cursor:pointer;font-style:italic;font-size:13px;font-weight:600;transition:all 0.15s;
      `;
      italicBtn.addEventListener("click", () => {
        ensureUndo();
        editor.engine.set_font_style(id, isItalic ? "normal" : "italic");
        editor.requestRender();
        refresh(ids);
      });
      styleRow.appendChild(italicBtn);
      textSection.appendChild(styleRow);

      // Text align row
      const alignRow = document.createElement("div");
      alignRow.style.cssText = "display:flex;gap:2px;margin-top:6px;";
      const curAlign = (node.kind.Text.text_align ?? "Left").toLowerCase();
      (["left", "center", "right"] as const).forEach((a) => {
        const btn = document.createElement("button");
        const isActive = curAlign === a;
        btn.textContent = a === "left" ? "≡←" : a === "center" ? "≡↔" : "≡→";
        btn.style.cssText = `
          flex:1;padding:4px 0;border:1px solid ${isActive ? "#4f46e5" : "#444"};border-radius:4px;
          background:${isActive ? "#4f46e520" : "#2a2a2a"};color:${isActive ? "#818cf8" : "#999"};
          cursor:pointer;font-size:11px;transition:all 0.15s;
        `;
        btn.addEventListener("click", () => {
          ensureUndo();
          editor.engine.set_text_align(id, a);
          editor.requestRender();
          refresh(ids);
        });
        alignRow.appendChild(btn);
      });
      textSection.appendChild(alignRow);

      // Line height
      const lhRow = document.createElement("div");
      lhRow.className = "prop-row";
      lhRow.style.marginTop = "6px";
      const lhLabel = document.createElement("span");
      lhLabel.className = "prop-label";
      lhLabel.style.width = "24px";
      lhLabel.textContent = "LH";
      lhRow.appendChild(lhLabel);
      const lhInput = document.createElement("input");
      lhInput.className = "prop-input";
      lhInput.value = String(node.kind.Text.line_height ?? 1.2);
      lhInput.addEventListener("change", () => {
        editor.engine.set_line_height(id, parseFloat(lhInput.value) || 1.2);
        editor.requestRender();
        refresh(ids);
      });
      lhRow.appendChild(lhInput);
      textSection.appendChild(lhRow);

      // Text decoration (underline / strikethrough)
      const decoRow = document.createElement("div");
      decoRow.style.cssText = "display:flex;gap:2px;margin-top:6px;";
      const curDeco = (node.kind.Text.text_decoration ?? "None") as string;
      const hasUnderline = curDeco === "Underline" || curDeco === "UnderlineStrikethrough";
      const hasStrike = curDeco === "Strikethrough" || curDeco === "UnderlineStrikethrough";
      ([["U", hasUnderline, "underline"], ["S", hasStrike, "strikethrough"]] as const).forEach(([label, active, type]) => {
        const btn = document.createElement("button");
        btn.innerHTML = type === "underline" ? "<u>U</u>" : "<s>S</s>";
        btn.style.cssText = `
          flex:1;padding:4px 0;border:1px solid ${active ? "#4f46e5" : "#444"};border-radius:4px;
          background:${active ? "#4f46e520" : "#2a2a2a"};color:${active ? "#818cf8" : "#999"};
          cursor:pointer;font-size:12px;transition:all 0.15s;
        `;
        btn.addEventListener("click", () => {
          ensureUndo();
          let u = hasUnderline, s = hasStrike;
          if (type === "underline") u = !u;
          else s = !s;
          const val = u && s ? "underline-strikethrough" : u ? "underline" : s ? "strikethrough" : "none";
          editor.engine.set_text_decoration(BigInt(id), val);
          editor.requestRender();
          refresh(ids);
        });
        decoRow.appendChild(btn);
      });
      textSection.appendChild(decoRow);

      // Letter spacing
      const lsRow = document.createElement("div");
      lsRow.className = "prop-row";
      lsRow.style.marginTop = "6px";
      const lsLabel = document.createElement("span");
      lsLabel.className = "prop-label";
      lsLabel.style.width = "24px";
      lsLabel.textContent = "LS";
      lsLabel.title = "Letter Spacing";
      lsRow.appendChild(lsLabel);
      const lsInput = document.createElement("input");
      lsInput.className = "prop-input";
      lsInput.type = "number";
      lsInput.step = "0.1";
      lsInput.value = String(node.kind.Text.letter_spacing ?? 0);
      lsInput.addEventListener("change", () => {
        ensureUndo();
        editor.engine.set_letter_spacing(BigInt(id), parseFloat(lsInput.value) || 0);
        editor.requestRender();
        refresh(ids);
      });
      lsRow.appendChild(lsInput);
      textSection.appendChild(lsRow);

      // Paragraph spacing
      const psRow = document.createElement("div");
      psRow.className = "prop-row";
      psRow.style.marginTop = "6px";
      const psLabel = document.createElement("span");
      psLabel.className = "prop-label";
      psLabel.style.width = "24px";
      psLabel.textContent = "PS";
      psLabel.title = "Paragraph Spacing";
      psRow.appendChild(psLabel);
      const psInput = document.createElement("input");
      psInput.className = "prop-input";
      psInput.type = "number";
      psInput.step = "1";
      psInput.value = String(node.kind.Text.paragraph_spacing ?? 0);
      psInput.addEventListener("change", () => {
        ensureUndo();
        editor.engine.set_paragraph_spacing(BigInt(id), parseFloat(psInput.value) || 0);
        editor.requestRender();
        refresh(ids);
      });
      psRow.appendChild(psInput);
      textSection.appendChild(psRow);

      // List Style
      const listRow = document.createElement("div");
      listRow.className = "prop-row";
      const listLabel = document.createElement("span");
      listLabel.className = "prop-label";
      listLabel.textContent = "List";
      listRow.appendChild(listLabel);
      const listSelect = document.createElement("select");
      listSelect.style.cssText = "flex:1;background:#2a2a2a;border:1px solid #333;border-radius:4px;color:#ccc;font-size:11px;padding:3px 4px;";
      const curList = editor.engine.get_list_style(BigInt(id));
      for (const [val, label] of [["none","None"],["bullet","Bullet •"],["numbered","Numbered 1."],["dash","Dash –"],["checkbox","Checkbox ☐"],["checkbox-checked","Checked ☑"]] as const) {
        const opt = document.createElement("option");
        opt.value = val; opt.textContent = label;
        if (val === curList) opt.selected = true;
        listSelect.appendChild(opt);
      }
      listSelect.addEventListener("change", () => {
        ensureUndo();
        editor.engine.set_list_style(BigInt(id), listSelect.value);
        editor.requestRender();
        refresh(ids);
      });
      listRow.appendChild(listSelect);
      textSection.appendChild(listRow);

      // Indent Level
      const indentRow = document.createElement("div");
      indentRow.className = "prop-row";
      const indentLabel = document.createElement("span");
      indentLabel.className = "prop-label";
      indentLabel.textContent = "Indent";
      indentRow.appendChild(indentLabel);
      const indentInput = document.createElement("input");
      indentInput.className = "prop-input";
      indentInput.type = "number";
      indentInput.min = "0";
      indentInput.max = "10";
      indentInput.step = "1";
      indentInput.value = String(editor.engine.get_indent_level(BigInt(id)));
      indentInput.addEventListener("change", () => {
        ensureUndo();
        editor.engine.set_indent_level(BigInt(id), Math.max(0, Math.min(10, parseInt(indentInput.value) || 0)));
        editor.requestRender();
        refresh(ids);
      });
      indentRow.appendChild(indentInput);
      textSection.appendChild(indentRow);

      // Text Transform
      const transformRow = document.createElement("div");
      transformRow.className = "prop-row";
      const transformLabel = document.createElement("span");
      transformLabel.className = "prop-label";
      transformLabel.textContent = "Transform";
      transformRow.appendChild(transformLabel);
      const transformSelect = document.createElement("select");
      transformSelect.style.cssText = "flex:1;background:#2a2a2a;border:1px solid #333;border-radius:4px;color:#ccc;font-size:11px;padding:3px 4px;";
      const curTransform = editor.engine.get_text_transform(BigInt(id));
      for (const [val, label] of [["none","None"],["uppercase","Uppercase"],["lowercase","Lowercase"],["capitalize","Capitalize"]] as const) {
        const opt = document.createElement("option");
        opt.value = val; opt.textContent = label;
        if (val === curTransform) opt.selected = true;
        transformSelect.appendChild(opt);
      }
      transformSelect.addEventListener("change", () => {
        ensureUndo();
        editor.engine.set_text_transform(BigInt(id), transformSelect.value);
        editor.requestRender();
        refresh(ids);
      });
      transformRow.appendChild(transformSelect);
      textSection.appendChild(transformRow);

      // Text Indent
      const textIndentRow = document.createElement("div");
      textIndentRow.className = "prop-row";
      const textIndentLabel = document.createElement("span");
      textIndentLabel.className = "prop-label";
      textIndentLabel.textContent = "Text Indent";
      textIndentRow.appendChild(textIndentLabel);
      const textIndentInput = document.createElement("input");
      textIndentInput.className = "prop-input";
      textIndentInput.type = "number";
      textIndentInput.min = "-500";
      textIndentInput.max = "500";
      textIndentInput.step = "1";
      textIndentInput.value = String(editor.engine.get_text_indent(BigInt(id)));
      textIndentInput.addEventListener("change", () => {
        ensureUndo();
        editor.engine.set_text_indent(BigInt(id), parseFloat(textIndentInput.value) || 0);
        editor.requestRender();
        refresh(ids);
      });
      textIndentRow.appendChild(textIndentInput);
      textSection.appendChild(textIndentRow);

      // OpenType Features
      {
        const otRaw = editor.engine.get_opentype_features(BigInt(id));
        const ot = JSON.parse(otRaw || "{}");
        const otRow = document.createElement("div");
        otRow.className = "prop-row";
        otRow.style.cssText = "flex-wrap:wrap;gap:4px;";
        const otLabel = document.createElement("span");
        otLabel.className = "prop-label";
        otLabel.textContent = "OpenType";
        otRow.appendChild(otLabel);
        const otGrid = document.createElement("div");
        otGrid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;flex:1;";
        const features: [string, string, boolean, (v: boolean) => void][] = [
          ["Ligatures", "liga", ot.ligatures !== false, (v) => editor.engine.set_opentype_ligatures(BigInt(id), v)],
          ["Small Caps", "smcp", !!ot.small_caps, (v) => editor.engine.set_opentype_small_caps(BigInt(id), v)],
          ["Old-style Nums", "onum", !!ot.old_style_numerals, (v) => editor.engine.set_opentype_old_style_numerals(BigInt(id), v)],
          ["Tabular Nums", "tnum", !!ot.tabular_numerals, (v) => editor.engine.set_opentype_tabular_numerals(BigInt(id), v)],
        ];
        for (const [label, _tag, checked, setter] of features) {
          const wrap = document.createElement("label");
          wrap.style.cssText = "display:flex;align-items:center;gap:4px;font-size:10px;color:#aaa;cursor:pointer;";
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = checked;
          cb.style.cssText = "accent-color:#7c3aed;width:12px;height:12px;";
          cb.addEventListener("change", () => {
            ensureUndo();
            setter(cb.checked);
            editor.requestRender();
            refresh(ids);
          });
          wrap.appendChild(cb);
          wrap.appendChild(document.createTextNode(label));
          otGrid.appendChild(wrap);
        }
        otRow.appendChild(otGrid);
        textSection.appendChild(otRow);
      }

      // Variable Font Axes
      {
        const fvsRaw = editor.engine.get_font_variation_settings(BigInt(id));
        const fvs: Record<string, number> = JSON.parse(fvsRaw || "{}");
        const fvsSection = document.createElement("div");
        fvsSection.className = "prop-row";
        fvsSection.style.cssText = "flex-wrap:wrap;gap:4px;";
        const fvsLabel = document.createElement("span");
        fvsLabel.className = "prop-label";
        fvsLabel.textContent = "Variable Axes";
        fvsSection.appendChild(fvsLabel);

        const fvsGrid = document.createElement("div");
        fvsGrid.style.cssText = "display:flex;flex-direction:column;gap:4px;flex:1;";

        // Standard axes with default ranges
        const standardAxes: [string, string, number, number, number, number][] = [
          ["Weight", "wght", 100, 900, 400, 1],
          ["Width", "wdth", 25, 200, 100, 1],
          ["Slant", "slnt", -90, 90, 0, 1],
          ["Optical Size", "opsz", 6, 144, 14, 1],
        ];

        for (const [label, tag, min, max, defaultVal, step] of standardAxes) {
          const val = fvs[tag];
          const axisRow = document.createElement("div");
          axisRow.style.cssText = "display:flex;align-items:center;gap:6px;";

          const axisLabel = document.createElement("span");
          axisLabel.style.cssText = "font-size:10px;color:#aaa;width:50px;flex-shrink:0;";
          axisLabel.textContent = label;
          axisRow.appendChild(axisLabel);

          const slider = document.createElement("input");
          slider.type = "range";
          slider.min = String(min);
          slider.max = String(max);
          slider.step = String(step);
          slider.value = String(val ?? defaultVal);
          slider.style.cssText = "flex:1;height:4px;accent-color:#7c3aed;";

          const numInput = document.createElement("input");
          numInput.type = "number";
          numInput.min = String(min);
          numInput.max = String(max);
          numInput.step = String(step);
          numInput.value = String(val ?? defaultVal);
          numInput.className = "prop-input";
          numInput.style.cssText = "width:48px;text-align:center;";

          const isActive = val !== undefined;
          if (!isActive) {
            slider.style.opacity = "0.4";
            numInput.style.opacity = "0.4";
          }

          const update = (newVal: number) => {
            ensureUndo();
            editor.engine.set_font_variation_axis(BigInt(id), tag, newVal);
            editor.requestRender();
            slider.value = String(newVal);
            numInput.value = String(newVal);
            slider.style.opacity = "1";
            numInput.style.opacity = "1";
          };

          slider.addEventListener("input", () => update(Number(slider.value)));
          numInput.addEventListener("change", () => update(Number(numInput.value)));

          // Double-click to reset/remove axis
          axisLabel.title = "Double-click to reset";
          axisLabel.style.cursor = "pointer";
          axisLabel.addEventListener("dblclick", () => {
            ensureUndo();
            editor.engine.remove_font_variation_axis(BigInt(id), tag);
            editor.requestRender();
            refresh(ids);
          });

          axisRow.appendChild(slider);
          axisRow.appendChild(numInput);
          fvsGrid.appendChild(axisRow);
        }

        // Custom axis add
        const addRow = document.createElement("div");
        addRow.style.cssText = "display:flex;align-items:center;gap:4px;margin-top:2px;";
        const addTagInput = document.createElement("input");
        addTagInput.type = "text";
        addTagInput.placeholder = "tag";
        addTagInput.maxLength = 4;
        addTagInput.className = "prop-input";
        addTagInput.style.cssText = "width:40px;text-align:center;font-size:10px;";
        const addValInput = document.createElement("input");
        addValInput.type = "number";
        addValInput.placeholder = "val";
        addValInput.className = "prop-input";
        addValInput.style.cssText = "width:48px;text-align:center;font-size:10px;";
        const addBtn = document.createElement("button");
        addBtn.textContent = "+";
        addBtn.style.cssText = "background:#333;color:#ccc;border:1px solid #555;border-radius:3px;padding:0 6px;cursor:pointer;font-size:11px;";
        addBtn.addEventListener("click", () => {
          const tag = addTagInput.value.trim();
          const val = Number(addValInput.value);
          if (tag.length === 4 && !isNaN(val)) {
            ensureUndo();
            editor.engine.set_font_variation_axis(BigInt(id), tag, val);
            editor.requestRender();
            refresh(ids);
          }
        });
        addRow.appendChild(addTagInput);
        addRow.appendChild(addValInput);
        addRow.appendChild(addBtn);
        fvsGrid.appendChild(addRow);

        // Show custom (non-standard) axes that are already set
        const standardTags = new Set(standardAxes.map(a => a[1]));
        for (const [tag, val] of Object.entries(fvs)) {
          if (standardTags.has(tag)) continue;
          const customRow = document.createElement("div");
          customRow.style.cssText = "display:flex;align-items:center;gap:6px;";
          const tagSpan = document.createElement("span");
          tagSpan.style.cssText = "font-size:10px;color:#7c3aed;width:50px;flex-shrink:0;cursor:pointer;";
          tagSpan.textContent = tag;
          tagSpan.title = "Double-click to remove";
          tagSpan.addEventListener("dblclick", () => {
            ensureUndo();
            editor.engine.remove_font_variation_axis(BigInt(id), tag);
            editor.requestRender();
            refresh(ids);
          });
          const valInput = document.createElement("input");
          valInput.type = "number";
          valInput.value = String(val);
          valInput.className = "prop-input";
          valInput.style.cssText = "width:60px;text-align:center;";
          valInput.addEventListener("change", () => {
            ensureUndo();
            editor.engine.set_font_variation_axis(BigInt(id), tag, Number(valInput.value));
            editor.requestRender();
          });
          customRow.appendChild(tagSpan);
          customRow.appendChild(valInput);
          fvsGrid.appendChild(customRow);
        }

        fvsSection.appendChild(fvsGrid);
        textSection.appendChild(fvsSection);
      }

      // Text on Path
      {
        const topInfo = editor.engine.get_text_path_info(BigInt(id));
        const pathInfo = topInfo !== "null" ? JSON.parse(topInfo) : null;

        const topRow = document.createElement("div");
        topRow.className = "prop-row";
        topRow.style.marginTop = "6px";
        const topLabel = document.createElement("span");
        topLabel.className = "prop-label";
        topLabel.textContent = "Text Path";
        topRow.appendChild(topLabel);

        if (pathInfo) {
          // Show attached path info + offset slider + detach button
          const pathName = (() => {
            try {
              const pj = editor.engine.get_node_json(BigInt(pathInfo.path_id));
              return pj ? JSON.parse(pj).name : `Path ${pathInfo.path_id}`;
            } catch { return `Path ${pathInfo.path_id}`; }
          })();
          const nameSpan = document.createElement("span");
          nameSpan.style.cssText = "font-size:11px;color:#8b8fa3;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
          nameSpan.textContent = pathName;
          topRow.appendChild(nameSpan);

          const detachBtn = document.createElement("button");
          detachBtn.className = "prop-btn";
          detachBtn.textContent = "✕";
          detachBtn.title = "Detach from path";
          detachBtn.addEventListener("click", () => {
            ensureUndo();
            editor.engine.clear_text_path(BigInt(id));
            editor.requestRender();
            refresh(ids);
          });
          topRow.appendChild(detachBtn);
          textSection.appendChild(topRow);

          // Offset slider
          const offRow = document.createElement("div");
          offRow.className = "prop-row";
          const offLabel = document.createElement("span");
          offLabel.className = "prop-label";
          offLabel.textContent = "Offset";
          offRow.appendChild(offLabel);
          const offSlider = document.createElement("input");
          offSlider.type = "range";
          offSlider.min = "0";
          offSlider.max = "100";
          offSlider.value = String(Math.round((pathInfo.offset ?? 0) * 100));
          offSlider.style.cssText = "flex:1;";
          offSlider.addEventListener("input", () => {
            editor.engine.set_text_path_offset(BigInt(id), parseInt(offSlider.value) / 100);
            editor.requestRender();
          });
          offSlider.addEventListener("change", () => {
            ensureUndo();
          });
          offRow.appendChild(offSlider);
          textSection.appendChild(offRow);
        } else {
          // Show "Attach to path" button — requires a Path node in selection or scene
          const attachBtn = document.createElement("button");
          attachBtn.className = "prop-btn";
          attachBtn.style.cssText = "font-size:11px;padding:2px 8px;";
          attachBtn.textContent = "Attach to Path…";
          attachBtn.title = "Select a Path node, then click to attach text";
          attachBtn.addEventListener("click", () => {
            // Find a Path node in the scene to attach to (prefer selected paths)
            const sel = Array.from(editor.engine.get_selection()).map(Number);
            let pathId: number | null = null;
            for (const sid of sel) {
              if (sid === id) continue;
              try {
                const nj = editor.engine.get_node_json(BigInt(sid));
                if (nj) {
                  const nd = JSON.parse(nj);
                  if (nd.kind === "Path" || (nd.kind && typeof nd.kind === "object" && "Path" in nd.kind)) {
                    pathId = sid;
                    break;
                  }
                }
              } catch {}
            }
            if (pathId) {
              ensureUndo();
              editor.engine.set_text_path(BigInt(id), BigInt(pathId));
              editor.requestRender();
              refresh(ids);
            } else {
              alert("Select both a Text node and a Path node, then click 'Attach to Path'.");
            }
          });
          topRow.appendChild(attachBtn);
          textSection.appendChild(topRow);
        }
      }

      // Font family
      const fonts = googleFonts;
      const familyRow = document.createElement("div");
      familyRow.className = "prop-row";
      familyRow.style.marginTop = "6px";
      const familySelect = document.createElement("select");
      familySelect.className = "prop-input";
      familySelect.style.cssText = "flex:1;cursor:pointer;";
      fonts.forEach((f) => {
        const opt = document.createElement("option");
        opt.value = f;
        opt.textContent = f;
        opt.style.fontFamily = f;
        if (f === (node.kind.Text.font_family || "Inter")) opt.selected = true;
        familySelect.appendChild(opt);
      });
      familySelect.addEventListener("change", () => {
        const family = familySelect.value;
        editor.engine.set_font_family(id, family);
        loadGoogleFont(family, editor);
        editor.requestRender();
      });
      familyRow.appendChild(familySelect);
      textSection.appendChild(familyRow);

      // Font size
      const fontRow = document.createElement("div");
      fontRow.className = "prop-row";
      fontRow.style.marginTop = "6px";
      const fLabel = document.createElement("span");
      fLabel.className = "prop-label";
      fLabel.innerHTML = icons.fontSize;
      fontRow.appendChild(fLabel);
      const fInput = document.createElement("input");
      fInput.className = "prop-input";
      fInput.value = String(node.kind.Text.font_size ?? 16);
      fInput.addEventListener("change", () => {
        editor.engine.set_font_size(id, parseFloat(fInput.value) || 16);
        editor.requestRender();
        refresh(ids);
      });
      fontRow.appendChild(fInput);
      textSection.appendChild(fontRow);

      // Text sizing mode (Fit / Fixed)
      const sizingRow = document.createElement("div");
      sizingRow.className = "prop-row";
      sizingRow.style.marginTop = "6px";
      const sizingLabel = document.createElement("span");
      sizingLabel.className = "prop-label";
      sizingLabel.style.width = "40px";
      sizingLabel.textContent = "Size";
      sizingRow.appendChild(sizingLabel);

      const currentSizing = editor.engine.get_text_sizing(BigInt(id));
      const sizingGroup = document.createElement("div");
      sizingGroup.style.cssText = "display:flex;gap:2px;flex:1;";

      ["fit", "fixed"].forEach((mode) => {
        const btn = document.createElement("button");
        btn.textContent = mode === "fit" ? "Fit" : "Fixed";
        btn.style.cssText = `
          flex:1; padding:3px 8px; border:1px solid #444; border-radius:4px;
          background:${mode === currentSizing ? "#4f46e5" : "#2a2a2a"};
          color:${mode === currentSizing ? "#fff" : "#999"};
          cursor:pointer; font-size:11px; transition:all 0.15s;
        `;
        btn.addEventListener("click", () => {
          ensureUndo();
          editor.engine.set_text_sizing(BigInt(id), mode);
          editor.requestRender();
          refresh(ids);
        });
        sizingGroup.appendChild(btn);
      });

      sizingRow.appendChild(sizingGroup);
      textSection.appendChild(sizingRow);

      // Show W/H fields only in Fixed mode
      if (currentSizing === "fixed") {
        const dimRow = document.createElement("div");
        dimRow.className = "prop-row";
        dimRow.style.marginTop = "4px";
        const wLabel = document.createElement("span");
        wLabel.className = "prop-label";
        wLabel.style.width = "16px";
        wLabel.textContent = "W";
        dimRow.appendChild(wLabel);
        const wIn = document.createElement("input");
        wIn.className = "prop-input";
        wIn.style.cssText = "width:50px;";
        wIn.value = String(Math.round(node.width));
        wIn.addEventListener("change", () => {
          editor.engine.resize_node(BigInt(id), parseFloat(wIn.value) || node.width, node.height);
          editor.requestRender();
        });
        dimRow.appendChild(wIn);
        const hLabel = document.createElement("span");
        hLabel.className = "prop-label";
        hLabel.style.cssText = "width:16px;margin-left:8px;";
        hLabel.textContent = "H";
        dimRow.appendChild(hLabel);
        const hIn = document.createElement("input");
        hIn.className = "prop-input";
        hIn.style.cssText = "width:50px;";
        hIn.value = String(Math.round(node.height));
        hIn.addEventListener("change", () => {
          editor.engine.resize_node(BigInt(id), node.width, parseFloat(hIn.value) || node.height);
          editor.requestRender();
        });
        dimRow.appendChild(hIn);
        textSection.appendChild(dimRow);
      }

      // Text overflow mode (only relevant for Fixed sizing)
      if (currentSizing === "fixed") {
        const overflowRow = document.createElement("div");
        overflowRow.className = "prop-row";
        overflowRow.style.marginTop = "4px";
        const overflowLabel = document.createElement("span");
        overflowLabel.className = "prop-label";
        overflowLabel.style.width = "54px";
        overflowLabel.textContent = "Overflow";
        overflowRow.appendChild(overflowLabel);
        const currentOverflow = editor.engine.get_text_overflow(BigInt(id));
        const overflowGroup = document.createElement("div");
        overflowGroup.style.cssText = "display:flex;gap:2px;flex:1;";
        for (const mode of ["visible", "clip", "ellipsis"] as const) {
          const btn = document.createElement("button");
          btn.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
          btn.style.cssText = `
            flex:1; padding:3px 6px; border:1px solid #444; border-radius:4px;
            background:${mode === currentOverflow ? "#4f46e5" : "#2a2a2a"};
            color:${mode === currentOverflow ? "#fff" : "#999"};
            cursor:pointer; font-size:10px; transition:all 0.15s;
          `;
          btn.addEventListener("click", () => {
            ensureUndo();
            editor.engine.set_text_overflow(BigInt(id), mode);
            editor.requestRender();
            refresh(ids);
          });
          overflowGroup.appendChild(btn);
        }
        overflowRow.appendChild(overflowGroup);
        textSection.appendChild(overflowRow);
      }

      container.appendChild(textSection);

      // --- Text Flow section ---
      const flowSection = createSection("Text Flow");
      const flowRow = document.createElement("div");
      flowRow.className = "prop-row";
      flowRow.style.cssText = "flex-direction:column;gap:6px;";

      const nextVal = editor.engine.get_text_flow_next(BigInt(id));
      if (nextVal != null) {
        const nextId = Number(nextVal);
        const nextInfo = JSON.parse(editor.engine.get_node_json(BigInt(nextId)) || "{}");
        const label = document.createElement("span");
        label.style.cssText = "font-size:11px;color:#a5b4fc;";
        label.textContent = `Flow → ${nextInfo?.name || `Node ${nextId}`}`;
        flowRow.appendChild(label);

        const unlinkBtn = document.createElement("button");
        unlinkBtn.className = "prop-btn";
        unlinkBtn.style.cssText = "font-size:11px;padding:2px 8px;background:#3b2020;color:#f87171;border:1px solid #7f1d1d;border-radius:4px;cursor:pointer;";
        unlinkBtn.textContent = "Unlink";
        unlinkBtn.addEventListener("click", () => {
          ensureUndo();
          editor.engine.unlink_text_flow(BigInt(id));
          editor.requestRender();
          refresh(ids);
        });
        flowRow.appendChild(unlinkBtn);
      } else {
        const label = document.createElement("span");
        label.style.cssText = "font-size:11px;color:#666;";
        label.textContent = "No flow link";
        flowRow.appendChild(label);

        const linkBtn = document.createElement("button");
        linkBtn.className = "prop-btn";
        linkBtn.style.cssText = "font-size:11px;padding:2px 8px;background:#1e1b4b;color:#a5b4fc;border:1px solid #4338ca;border-radius:4px;cursor:pointer;";
        linkBtn.textContent = "Link to next…";
        linkBtn.addEventListener("click", () => {
          // Set a mode flag on editor so next text node click links them
          (editor as any)._textFlowLinkFrom = Number(id);
          linkBtn.textContent = "Click a Text node…";
          linkBtn.style.background = "#4338ca";
        });
        flowRow.appendChild(linkBtn);
      }

      // Show chain
      const chainJson = editor.engine.get_text_flow_chain(BigInt(id));
      const chain: number[] = JSON.parse(chainJson);
      if (chain.length > 1) {
        const chainLabel = document.createElement("div");
        chainLabel.style.cssText = "font-size:10px;color:#666;margin-top:4px;";
        const names = chain.map((cid: number) => {
          const info = JSON.parse(editor.engine.get_node_json(BigInt(cid)) || "{}");
          return info?.name || `#${cid}`;
        });
        chainLabel.textContent = `Chain: ${names.join(" → ")}`;
        flowRow.appendChild(chainLabel);
      }

      flowSection.appendChild(flowRow);
      container.appendChild(flowSection);
    }

    // --- Image-specific ---
    if (typeof node.kind === "object" && node.kind.Image) {
      const imgSection = createSection("Image");
      const imgData = node.kind.Image;

      // Source URL
      const srcRow = document.createElement("div");
      srcRow.className = "prop-row";
      const srcLabel = document.createElement("span");
      srcLabel.className = "prop-label";
      srcLabel.style.width = "28px";
      srcLabel.textContent = "Src";
      srcRow.appendChild(srcLabel);
      const srcInput = document.createElement("input");
      srcInput.className = "prop-input";
      srcInput.style.flex = "1";
      srcInput.placeholder = "Image URL or data URI";
      srcInput.value = (imgData.src || "").startsWith("data:") ? "(embedded)" : (imgData.src || "");
      srcInput.addEventListener("change", () => {
        editor.engine.set_image_src(id, srcInput.value);
        editor.requestRender();
      });
      srcRow.appendChild(srcInput);
      imgSection.appendChild(srcRow);

      // Alt text (accessibility)
      const altRow = document.createElement("div");
      altRow.className = "prop-row";
      altRow.style.marginTop = "6px";
      const altLabel = document.createElement("span");
      altLabel.className = "prop-label";
      altLabel.style.width = "28px";
      altLabel.textContent = "Alt";
      altRow.appendChild(altLabel);
      const altInput = document.createElement("input");
      altInput.className = "prop-input";
      altInput.style.flex = "1";
      altInput.placeholder = "Alt text for accessibility";
      altInput.value = (editor.engine as any).get_alt_text(id) || "";
      altInput.addEventListener("change", () => {
        ensureUndo();
        (editor.engine as any).set_alt_text(id, altInput.value);
        editor.requestRender();
      });
      altRow.appendChild(altInput);
      imgSection.appendChild(altRow);

      // Fit mode
      const fitRow = document.createElement("div");
      fitRow.style.cssText = "display:flex;gap:2px;margin-top:6px;";
      const curFit = imgData.fit || "cover";
      (["cover", "contain", "fill"] as const).forEach((f) => {
        const btn = document.createElement("button");
        const isActive = curFit === f;
        btn.textContent = f.charAt(0).toUpperCase() + f.slice(1);
        btn.style.cssText = `
          flex:1;padding:4px 0;border:1px solid ${isActive ? "#4f46e5" : "#444"};border-radius:4px;
          background:${isActive ? "#4f46e520" : "#2a2a2a"};color:${isActive ? "#818cf8" : "#999"};
          cursor:pointer;font-size:11px;transition:all 0.15s;
        `;
        btn.addEventListener("click", () => {
          ensureUndo();
          editor.engine.set_image_fit(id, f);
          editor.requestRender();
          refresh(ids);
        });
        fitRow.appendChild(btn);
      });
      imgSection.appendChild(fitRow);

      // Focal point
      const focalRow = document.createElement("div");
      focalRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-top:8px;";
      const focalLabel = document.createElement("span");
      focalLabel.className = "prop-label";
      focalLabel.style.width = "42px";
      focalLabel.textContent = "Focal";
      focalRow.appendChild(focalLabel);

      const focalInfo = JSON.parse(editor.engine.get_image_focal_point(id) || "{}");
      const fx = focalInfo.x ?? 0.5;
      const fy = focalInfo.y ?? 0.5;

      // Mini focal point picker (48x48 box)
      const focalPicker = document.createElement("canvas");
      focalPicker.width = 48;
      focalPicker.height = 48;
      focalPicker.style.cssText = "border:1px solid #555;border-radius:4px;cursor:crosshair;flex-shrink:0;";
      const fpc = focalPicker.getContext("2d")!;
      const drawFocal = (fpx: number, fpy: number) => {
        fpc.fillStyle = "#1a1a2e";
        fpc.fillRect(0, 0, 48, 48);
        // Grid lines (rule of thirds)
        fpc.strokeStyle = "#333";
        fpc.lineWidth = 0.5;
        for (const t of [16, 32]) {
          fpc.beginPath(); fpc.moveTo(t, 0); fpc.lineTo(t, 48); fpc.stroke();
          fpc.beginPath(); fpc.moveTo(0, t); fpc.lineTo(48, t); fpc.stroke();
        }
        // Focal dot
        fpc.beginPath();
        fpc.arc(fpx * 48, fpy * 48, 4, 0, Math.PI * 2);
        fpc.fillStyle = "#ff3366";
        fpc.fill();
        fpc.strokeStyle = "#fff";
        fpc.lineWidth = 1.5;
        fpc.stroke();
      };
      drawFocal(fx, fy);

      const updateFocalFromEvent = (e: MouseEvent) => {
        const rect = focalPicker.getBoundingClientRect();
        const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        ensureUndo();
        editor.engine.set_image_focal_point(id, nx, ny);
        drawFocal(nx, ny);
        fxInput.value = nx.toFixed(2);
        fyInput.value = ny.toFixed(2);
        editor.requestRender();
      };
      let focalDragging = false;
      focalPicker.addEventListener("mousedown", (e) => { focalDragging = true; updateFocalFromEvent(e); });
      window.addEventListener("mousemove", (e) => { if (focalDragging) updateFocalFromEvent(e); });
      window.addEventListener("mouseup", () => { focalDragging = false; });
      focalRow.appendChild(focalPicker);

      // Numeric inputs
      const focalInputs = document.createElement("div");
      focalInputs.style.cssText = "display:flex;flex-direction:column;gap:2px;";
      const fxInput = document.createElement("input");
      fxInput.className = "prop-input";
      fxInput.style.width = "48px";
      fxInput.value = fx.toFixed(2);
      fxInput.title = "Focal X (0–1)";
      fxInput.addEventListener("change", () => {
        ensureUndo();
        editor.engine.set_image_focal_point(id, parseFloat(fxInput.value) || 0.5, parseFloat(fyInput.value) || 0.5);
        editor.requestRender();
      });
      const fyInput = document.createElement("input");
      fyInput.className = "prop-input";
      fyInput.style.width = "48px";
      fyInput.value = fy.toFixed(2);
      fyInput.title = "Focal Y (0–1)";
      fyInput.addEventListener("change", () => {
        ensureUndo();
        editor.engine.set_image_focal_point(id, parseFloat(fxInput.value) || 0.5, parseFloat(fyInput.value) || 0.5);
        editor.requestRender();
      });
      focalInputs.appendChild(fxInput);
      focalInputs.appendChild(fyInput);
      focalRow.appendChild(focalInputs);
      imgSection.appendChild(focalRow);

      // Crop section
      const cropHeader = document.createElement("div");
      cropHeader.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-top:10px;margin-bottom:4px;";
      const cropTitle = document.createElement("span");
      cropTitle.style.cssText = "font-size:10px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px;";
      cropTitle.textContent = "Smart Crop";
      cropHeader.appendChild(cropTitle);

      const cropInfo = JSON.parse(editor.engine.get_image_crop(id) || "null");
      const clearCropBtn = document.createElement("button");
      clearCropBtn.style.cssText = "background:none;border:1px solid #555;color:#aaa;font-size:9px;padding:1px 6px;border-radius:3px;cursor:pointer;";
      clearCropBtn.textContent = cropInfo ? "Reset" : "No crop";
      clearCropBtn.disabled = !cropInfo;
      clearCropBtn.addEventListener("click", () => {
        ensureUndo();
        editor.engine.clear_image_crop(id);
        editor.requestRender();
        refresh(ids);
      });
      cropHeader.appendChild(clearCropBtn);
      imgSection.appendChild(cropHeader);

      // Crop suggestions — need image dimensions
      const cachedImg = (editor as any)._imageCache?.get(imgData.src);
      if (cachedImg && cachedImg.naturalWidth > 0) {
        const suggestionsJson = editor.engine.suggest_crops(id, cachedImg.naturalWidth, cachedImg.naturalHeight);
        const suggestions: Array<{ label: string; x: number; y: number; w: number; h: number }> = JSON.parse(suggestionsJson);
        const suggestGrid = document.createElement("div");
        suggestGrid.style.cssText = "display:flex;flex-wrap:wrap;gap:3px;";
        for (const s of suggestions) {
          const btn = document.createElement("button");
          const isActive = cropInfo && Math.abs(cropInfo.x - s.x) < 0.01 && Math.abs(cropInfo.y - s.y) < 0.01 && Math.abs(cropInfo.w - s.w) < 0.01;
          btn.textContent = s.label;
          btn.style.cssText = `
            padding:3px 6px;border:1px solid ${isActive ? "#4f46e5" : "#444"};border-radius:4px;
            background:${isActive ? "#4f46e520" : "#2a2a2a"};color:${isActive ? "#818cf8" : "#aaa"};
            cursor:pointer;font-size:10px;
          `;
          btn.addEventListener("click", () => {
            ensureUndo();
            editor.engine.set_image_crop(id, s.x, s.y, s.w, s.h);
            editor.requestRender();
            refresh(ids);
          });
          suggestGrid.appendChild(btn);
        }
        imgSection.appendChild(suggestGrid);
      } else {
        const hint = document.createElement("div");
        hint.style.cssText = "font-size:10px;color:#555;padding:2px 0;";
        hint.textContent = "Load image to see crop suggestions";
        imgSection.appendChild(hint);
      }

      // Manual crop inputs
      if (cropInfo) {
        const cropInputs = document.createElement("div");
        cropInputs.style.cssText = "display:flex;gap:4px;margin-top:6px;";
        const fields = [
          { label: "X", key: "x", val: cropInfo.x },
          { label: "Y", key: "y", val: cropInfo.y },
          { label: "W", key: "w", val: cropInfo.w },
          { label: "H", key: "h", val: cropInfo.h },
        ];
        for (const f of fields) {
          const inp = document.createElement("input");
          inp.className = "prop-input";
          inp.style.cssText = "width:40px;text-align:center;";
          inp.value = f.val.toFixed(2);
          inp.title = `Crop ${f.label} (0–1)`;
          inp.addEventListener("change", () => {
            ensureUndo();
            const cur = JSON.parse(editor.engine.get_image_crop(id) || "null") || { x: 0, y: 0, w: 1, h: 1 };
            (cur as any)[f.key] = parseFloat(inp.value) || 0;
            editor.engine.set_image_crop(id, cur.x, cur.y, cur.w, cur.h);
            editor.requestRender();
            refresh(ids);
          });
          const label = document.createElement("span");
          label.style.cssText = "font-size:9px;color:#666;";
          label.textContent = f.label;
          const wrap = document.createElement("div");
          wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:1px;";
          wrap.appendChild(label);
          wrap.appendChild(inp);
          cropInputs.appendChild(wrap);
        }
        imgSection.appendChild(cropInputs);
      }

      container.appendChild(imgSection);
    }

    // --- Video-specific ---
    if (typeof node.kind === "object" && node.kind.Video) {
      const vidSection = createSection("Video");
      const vidData = node.kind.Video;

      // Source URL
      const srcRow = document.createElement("div");
      srcRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:6px;";
      const srcLabel = document.createElement("span");
      srcLabel.style.cssText = "font-size:11px;color:#999;min-width:40px;";
      srcLabel.textContent = "Src";
      const srcInput = document.createElement("input");
      srcInput.type = "text";
      srcInput.className = "prop-input";
      srcInput.placeholder = "Video URL (mp4, webm, YouTube…)";
      srcInput.value = vidData.src || "";
      srcInput.addEventListener("change", () => {
        editor.engine.set_video_src(id, srcInput.value);
        editor.requestRender();
      });
      srcRow.appendChild(srcLabel);
      srcRow.appendChild(srcInput);
      vidSection.appendChild(srcRow);

      // Poster URL
      const posterRow = document.createElement("div");
      posterRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:6px;";
      const posterLabel = document.createElement("span");
      posterLabel.style.cssText = "font-size:11px;color:#999;min-width:40px;";
      posterLabel.textContent = "Poster";
      const posterInput = document.createElement("input");
      posterInput.type = "text";
      posterInput.className = "prop-input";
      posterInput.placeholder = "Poster/thumbnail image URL";
      posterInput.value = vidData.poster || "";
      posterInput.addEventListener("change", () => {
        editor.engine.set_video_poster(id, posterInput.value);
        editor.requestRender();
      });
      posterRow.appendChild(posterLabel);
      posterRow.appendChild(posterInput);
      vidSection.appendChild(posterRow);

      // Checkboxes: autoplay, loop, muted
      const checkRow = document.createElement("div");
      checkRow.style.cssText = "display:flex;gap:12px;margin-bottom:6px;flex-wrap:wrap;";
      for (const [label, getter, setter] of [
        ["Autoplay", "get_video_autoplay", "set_video_autoplay"],
        ["Loop", "get_video_loop", "set_video_loop"],
        ["Muted", "get_video_muted", "set_video_muted"],
      ] as const) {
        const wrap = document.createElement("label");
        wrap.style.cssText = "display:flex;align-items:center;gap:4px;font-size:11px;color:#ccc;cursor:pointer;";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = (editor.engine as any)[getter](id);
        cb.addEventListener("change", () => {
          (editor.engine as any)[setter](id, cb.checked);
          editor.requestRender();
        });
        wrap.appendChild(cb);
        wrap.appendChild(document.createTextNode(label));
        checkRow.appendChild(wrap);
      }
      vidSection.appendChild(checkRow);

      container.appendChild(vidSection);
    }

    // === Path Section ===
    if (typeof node.kind === "object" && node.kind.Path) {
      const pathSection = createSection("Path");
      const pathData = node.kind.Path;

      const infoRow = document.createElement("div");
      infoRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:6px;";

      const pointsLabel = document.createElement("span");
      pointsLabel.style.cssText = "font-size:11px;color:#999;";
      pointsLabel.textContent = `${pathData.points?.length || 0} points`;
      infoRow.appendChild(pointsLabel);

      const closedBtn = document.createElement("button");
      const isClosed = pathData.closed;
      closedBtn.textContent = isClosed ? "Closed" : "Open";
      closedBtn.style.cssText = `
        padding:3px 8px;border:1px solid ${isClosed ? "#4f46e5" : "#444"};border-radius:4px;
        background:${isClosed ? "#4f46e520" : "#2a2a2a"};color:${isClosed ? "#818cf8" : "#999"};
        cursor:pointer;font-size:11px;
      `;
      closedBtn.addEventListener("click", () => {
        ensureUndo();
        editor.engine.path_set_closed(id, !isClosed);
        editor.requestRender();
        refresh(ids);
      });
      infoRow.appendChild(closedBtn);
      pathSection.appendChild(infoRow);

      // Variable Stroke Width
      const hasVarStroke = editor.engine.has_variable_stroke(BigInt(id));
      const varRow = document.createElement("div");
      varRow.style.cssText = "margin-top:8px;";

      const varToggleRow = document.createElement("div");
      varToggleRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:6px;";
      const varLabel = document.createElement("span");
      varLabel.style.cssText = "font-size:11px;color:#999;";
      varLabel.textContent = "Variable Stroke";
      varToggleRow.appendChild(varLabel);

      const varToggle = document.createElement("button");
      varToggle.textContent = hasVarStroke ? "On" : "Off";
      varToggle.style.cssText = `padding:3px 8px;border:1px solid ${hasVarStroke ? "#4f46e5" : "#444"};border-radius:4px;background:${hasVarStroke ? "#4f46e520" : "#2a2a2a"};color:${hasVarStroke ? "#818cf8" : "#999"};cursor:pointer;font-size:11px;`;
      varToggle.addEventListener("click", () => {
        ensureUndo();
        const pts = pathData.points?.length || 0;
        const defaultW = 2;
        if (!hasVarStroke) {
          // Enable: set linear profile from start to end
          for (let i = 0; i < pts; i++) {
            editor.engine.path_set_point_stroke_width(BigInt(id), i, defaultW);
          }
        } else {
          // Disable: reset all to 0
          for (let i = 0; i < pts; i++) {
            editor.engine.path_set_point_stroke_width(BigInt(id), i, 0);
          }
        }
        editor.requestRender();
        refresh(ids);
      });
      varToggleRow.appendChild(varToggle);

      // Pressure sensitivity toggle
      const pressRow = document.createElement("div");
      pressRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:6px;";
      const pressLabel = document.createElement("span");
      pressLabel.style.cssText = "font-size:11px;color:#999;";
      pressLabel.textContent = "Pressure";
      pressRow.appendChild(pressLabel);
      const pressToggle = document.createElement("button");
      const pressOn = editor.penPressureEnabled;
      pressToggle.textContent = pressOn ? "On" : "Off";
      pressToggle.style.cssText = `padding:3px 8px;border:1px solid ${pressOn ? "#4f46e5" : "#444"};border-radius:4px;background:${pressOn ? "#4f46e520" : "#2a2a2a"};color:${pressOn ? "#818cf8" : "#999"};cursor:pointer;font-size:11px;`;
      pressToggle.title = "Enable stylus pressure sensitivity for pen tool";
      pressToggle.addEventListener("click", () => {
        editor.penPressureEnabled = !editor.penPressureEnabled;
        refresh(ids);
      });
      pressRow.appendChild(pressToggle);
      varToggleRow.appendChild(pressRow);
      varRow.appendChild(varToggleRow);

      if (hasVarStroke) {
        const pts = pathData.points?.length || 0;
        const startW = pts > 0 ? editor.engine.path_get_point_stroke_width(BigInt(id), 0) : 2;
        const endW = pts > 1 ? editor.engine.path_get_point_stroke_width(BigInt(id), pts - 1) : 2;

        const profileRow = document.createElement("div");
        profileRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:4px;";

        const makeInput = (label: string, value: number, onChange: (v: number) => void) => {
          const wrap = document.createElement("div");
          wrap.style.cssText = "display:flex;align-items:center;gap:4px;";
          const lbl = document.createElement("span");
          lbl.style.cssText = "font-size:10px;color:#777;";
          lbl.textContent = label;
          const inp = document.createElement("input");
          inp.type = "number";
          inp.value = String(value);
          inp.min = "0.5";
          inp.max = "100";
          inp.step = "0.5";
          inp.style.cssText = "width:48px;padding:2px 4px;background:#2a2a2a;border:1px solid #444;border-radius:3px;color:#ddd;font-size:11px;";
          inp.addEventListener("change", () => {
            onChange(parseFloat(inp.value) || 1);
          });
          wrap.appendChild(lbl);
          wrap.appendChild(inp);
          return wrap;
        };

        profileRow.appendChild(makeInput("Start", startW, (v) => {
          ensureUndo();
          const numPts = pathData.points?.length || 0;
          const ew = editor.engine.path_get_point_stroke_width(BigInt(id), numPts - 1) || v;
          for (let i = 0; i < numPts; i++) {
            const t = numPts > 1 ? i / (numPts - 1) : 0;
            editor.engine.path_set_point_stroke_width(BigInt(id), i, v + (ew - v) * t);
          }
          editor.requestRender();
          refresh(ids);
        }));

        profileRow.appendChild(makeInput("End", endW, (v) => {
          ensureUndo();
          const numPts = pathData.points?.length || 0;
          const sw = editor.engine.path_get_point_stroke_width(BigInt(id), 0) || v;
          for (let i = 0; i < numPts; i++) {
            const t = numPts > 1 ? i / (numPts - 1) : 0;
            editor.engine.path_set_point_stroke_width(BigInt(id), i, sw + (v - sw) * t);
          }
          editor.requestRender();
          refresh(ids);
        }));

        varRow.appendChild(profileRow);

        // Mini stroke profile preview canvas
        const previewCanvas = document.createElement("canvas");
        previewCanvas.width = 200;
        previewCanvas.height = 30;
        previewCanvas.style.cssText = "width:100%;height:30px;border-radius:4px;background:#1a1a1a;border:1px solid #333;";
        const pCtx = previewCanvas.getContext("2d");
        if (pCtx && pts > 1) {
          const cw = 200, ch = 30;
          pCtx.fillStyle = "#1a1a1a";
          pCtx.fillRect(0, 0, cw, ch);
          // Draw stroke profile
          const maxW = Math.max(...(pathData.points || []).map((p: any) => p.stroke_width || 2));
          pCtx.fillStyle = "#818cf8";
          pCtx.beginPath();
          for (let i = 0; i < pts; i++) {
            const x = (i / (pts - 1)) * cw;
            const w = (pathData.points![i] as any).stroke_width || 2;
            const h = (w / Math.max(maxW, 1)) * (ch / 2 - 2);
            if (i === 0) pCtx.moveTo(x, ch / 2 - h);
            else pCtx.lineTo(x, ch / 2 - h);
          }
          for (let i = pts - 1; i >= 0; i--) {
            const x = (i / (pts - 1)) * cw;
            const w = (pathData.points![i] as any).stroke_width || 2;
            const h = (w / Math.max(maxW, 1)) * (ch / 2 - 2);
            pCtx.lineTo(x, ch / 2 + h);
          }
          pCtx.closePath();
          pCtx.fill();
        }
        varRow.appendChild(previewCanvas);
      }

      pathSection.appendChild(varRow);
      container.appendChild(pathSection);
    }

    // === Convert Path to VectorNetwork button ===
    if (typeof node.kind === "object" && node.kind.Path) {
      const convertBtn = document.createElement("button");
      convertBtn.textContent = "Convert to Vector Network";
      convertBtn.style.cssText = "width:100%;padding:6px;background:#4f46e520;color:#818cf8;border:1px solid #4f46e5;border-radius:6px;cursor:pointer;font-size:11px;margin-bottom:8px;";
      convertBtn.addEventListener("click", () => {
        ensureUndo();
        const ok = editor.engine.convert_path_to_vector_network(BigInt(id));
        if (ok) {
          editor.requestRender();
          refresh(ids);
        }
      });
      container.appendChild(convertBtn);
    }

    // === Vector Network Section ===
    if (typeof node.kind === "object" && node.kind.VectorNetwork) {
      const vnSection = createSection("Vector Network");
      const vnData = node.kind.VectorNetwork;

      const infoRow = document.createElement("div");
      infoRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;";

      const vLabel = document.createElement("span");
      vLabel.style.cssText = "font-size:11px;color:#999;";
      vLabel.textContent = `${vnData.vertices?.length || 0} vertices`;
      infoRow.appendChild(vLabel);

      const sLabel = document.createElement("span");
      sLabel.style.cssText = "font-size:11px;color:#999;";
      sLabel.textContent = `${vnData.segments?.length || 0} segments`;
      infoRow.appendChild(sLabel);

      const rLabel = document.createElement("span");
      rLabel.style.cssText = "font-size:11px;color:#999;";
      rLabel.textContent = `${vnData.regions?.length || 0} regions`;
      infoRow.appendChild(rLabel);

      vnSection.appendChild(infoRow);

      const detectBtn = document.createElement("button");
      detectBtn.textContent = "Detect Regions";
      detectBtn.style.cssText = "width:100%;padding:5px;background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:4px;cursor:pointer;font-size:11px;margin-top:4px;";
      detectBtn.addEventListener("click", () => {
        ensureUndo();
        const count = editor.engine.vn_detect_regions(BigInt(id));
        editor.requestRender();
        refresh(ids);
      });
      vnSection.appendChild(detectBtn);

      container.appendChild(vnSection);
    }

    // === Star properties ===
    if (typeof node.kind === "object" && node.kind.Star) {
      const starSection = createSection("Star");
      const starRow = document.createElement("div");
      starRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:6px;";
      starRow.appendChild(createLabeledInput("Pts", String(node.kind.Star.points ?? 5), (v) => {
        editor.engine.set_star_points(id, parseInt(v) || 5);
        editor.requestRender();
        refresh(ids);
      }));
      starRow.appendChild(createLabeledInput("Inner", ((node.kind.Star.inner_radius ?? 0.4) * 100).toFixed(0) + "%", (v) => {
        const val = parseFloat(v.replace("%", "")) / 100;
        editor.engine.set_star_inner_radius(id, isNaN(val) ? 0.4 : val);
        editor.requestRender();
        refresh(ids);
      }));
      starSection.appendChild(starRow);
      container.appendChild(starSection);
    }

    // === Polygon properties ===
    if (typeof node.kind === "object" && node.kind.Polygon) {
      const polySection = createSection("Polygon");
      const polyRow = document.createElement("div");
      polyRow.style.cssText = "display:grid;grid-template-columns:1fr;gap:6px;";
      polyRow.appendChild(createLabeledInput("Sides", String(node.kind.Polygon.sides ?? 6), (v) => {
        editor.engine.set_polygon_sides(id, parseInt(v) || 6);
        editor.requestRender();
        refresh(ids);
      }));
      polySection.appendChild(polyRow);
      container.appendChild(polySection);
    }

    // === Table properties ===
    if (typeof node.kind === "object" && node.kind.Table) {
      const tableSection = createSection("Table");
      const infoStr = editor.engine.table_get_info(BigInt(id));
      if (infoStr) {
        const info = JSON.parse(infoStr);
        const gridRow = document.createElement("div");
        gridRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;";
        const rowsLabel = document.createElement("span");
        rowsLabel.style.cssText = "font-size:11px;color:#999;";
        rowsLabel.textContent = `Rows: ${info.rows}`;
        const colsLabel = document.createElement("span");
        colsLabel.style.cssText = "font-size:11px;color:#999;";
        colsLabel.textContent = `Cols: ${info.cols}`;
        gridRow.appendChild(rowsLabel);
        gridRow.appendChild(colsLabel);
        tableSection.appendChild(gridRow);

        // Add/Remove row/col buttons
        const btnStyle = "padding:4px 8px;font-size:10px;border:1px solid #444;border-radius:4px;background:#2a2a2a;color:#ccc;cursor:pointer;";
        const btnRow = document.createElement("div");
        btnRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px;";
        for (const [label, action] of [
          ["+Row", () => { editor.engine.table_add_row(BigInt(id)); }],
          ["+Col", () => { editor.engine.table_add_col(BigInt(id)); }],
          ["-Row", () => { editor.engine.table_remove_row(BigInt(id), info.rows - 1); }],
          ["-Col", () => { editor.engine.table_remove_col(BigInt(id), info.cols - 1); }],
        ] as [string, () => void][]) {
          const btn = document.createElement("button");
          btn.style.cssText = btnStyle;
          btn.textContent = label;
          btn.onclick = () => { ensureUndo(); (action as () => void)(); editor.requestRender(); refresh(ids); };
          btnRow.appendChild(btn);
        }
        tableSection.appendChild(btnRow);

        // CSV import
        const csvBtn = document.createElement("button");
        csvBtn.style.cssText = btnStyle + "width:100%;margin-bottom:8px;";
        csvBtn.textContent = "Import CSV";
        csvBtn.onclick = () => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".csv,text/csv";
          input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              ensureUndo();
              editor.engine.table_import_csv(BigInt(id), reader.result as string);
              editor.requestRender();
              refresh(ids);
            };
            reader.readAsText(file);
          };
          input.click();
        };
        tableSection.appendChild(csvBtn);

        // Sort buttons
        if (info.cols > 0) {
          const sortRow = document.createElement("div");
          sortRow.style.cssText = "display:flex;gap:4px;";
          const sortLabel = document.createElement("span");
          sortLabel.style.cssText = "font-size:10px;color:#666;";
          sortLabel.textContent = "Sort col 0:";
          sortRow.appendChild(sortLabel);
          for (const [label, asc] of [["A↓", true], ["Z↓", false]] as [string, boolean][]) {
            const btn = document.createElement("button");
            btn.style.cssText = btnStyle;
            btn.textContent = label;
            btn.onclick = () => { ensureUndo(); editor.engine.table_sort(BigInt(id), 0, asc); editor.requestRender(); refresh(ids); };
            sortRow.appendChild(btn);
          }
          tableSection.appendChild(sortRow);
        }
      }
      container.appendChild(tableSection);
    }

    // === Table properties ===
    if (typeof node.kind === "object" && node.kind.Table) {
      const tableSection = createSection("Table");
      const tInfo = JSON.parse(editor.engine.table_get_info(BigInt(id)) || "{}");
      const tRows = tInfo.rows ?? 3;
      const tCols = tInfo.cols ?? 3;

      // Rows x Cols display
      const dimRow = document.createElement("div");
      dimRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;";
      dimRow.appendChild(createLabeledInput("Rows", String(tRows), () => {}, true));
      dimRow.appendChild(createLabeledInput("Cols", String(tCols), () => {}, true));
      tableSection.appendChild(dimRow);

      // Add/Remove row/col buttons
      const btnRow = document.createElement("div");
      btnRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:6px;";
      for (const [label, action] of [
        ["+ Row", () => { editor.engine.push_undo(); editor.engine.table_add_row(BigInt(id)); }],
        ["+ Col", () => { editor.engine.push_undo(); editor.engine.table_add_col(BigInt(id)); }],
        ["− Row", () => { if (tRows > 1) { editor.engine.push_undo(); editor.engine.table_remove_row(BigInt(id), tRows - 1); } }],
        ["− Col", () => { if (tCols > 1) { editor.engine.push_undo(); editor.engine.table_remove_col(BigInt(id), tCols - 1); } }],
      ] as [string, () => void][]) {
        const btn = document.createElement("button");
        btn.textContent = label;
        btn.style.cssText = "background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:4px;padding:4px 8px;font-size:11px;cursor:pointer;";
        btn.onclick = () => { action(); editor.requestRender(); refresh(ids); };
        btnRow.appendChild(btn);
      }
      tableSection.appendChild(btnRow);

      // CSV Import button
      const csvBtn = document.createElement("button");
      csvBtn.textContent = "Import CSV";
      csvBtn.style.cssText = "width:100%;background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:4px;padding:4px 8px;font-size:11px;cursor:pointer;margin-bottom:6px;";
      csvBtn.onclick = () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".csv,text/csv";
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            editor.engine.push_undo();
            editor.engine.table_import_csv(BigInt(id), reader.result as string);
            editor.requestRender();
            refresh(ids);
          };
          reader.readAsText(file);
        };
        input.click();
      };
      tableSection.appendChild(csvBtn);

      // Sort buttons (by first col)
      const sortRow = document.createElement("div");
      sortRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:4px;";
      for (const [label, asc] of [["Sort ↑", true], ["Sort ↓", false]] as [string, boolean][]) {
        const btn = document.createElement("button");
        btn.textContent = label;
        btn.style.cssText = "background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:4px;padding:4px 8px;font-size:11px;cursor:pointer;";
        btn.onclick = () => {
          editor.engine.push_undo();
          editor.engine.table_sort(BigInt(id), 0, asc);
          editor.requestRender();
          refresh(ids);
        };
        sortRow.appendChild(btn);
      }
      tableSection.appendChild(sortRow);

      container.appendChild(tableSection);
    }

    // === Connector properties ===
    if (typeof node.kind === "object" && node.kind.Connector) {
      const connSection = createSection("Connector");
      const info = JSON.parse(editor.engine.get_connector_info(BigInt(id)));

      // Path type: straight / curved
      const typeRow = document.createElement("div");
      typeRow.style.cssText = "display:flex;gap:6px;align-items:center;margin-bottom:8px;";
      const typeLabel = document.createElement("span");
      typeLabel.style.cssText = "font-size:11px;color:#999;width:50px;";
      typeLabel.textContent = "Type:";
      typeRow.appendChild(typeLabel);
      const typeSelect = document.createElement("select");
      typeSelect.style.cssText = "flex:1;background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:4px;padding:2px 6px;font-size:11px;";
      for (const t of ["straight", "curved"]) {
        const opt = document.createElement("option");
        opt.value = t; opt.textContent = t.charAt(0).toUpperCase() + t.slice(1);
        if (t === info.path_type) opt.selected = true;
        typeSelect.appendChild(opt);
      }
      typeSelect.addEventListener("change", () => {
        editor.engine.push_undo();
        editor.engine.set_connector_path_type(BigInt(id), typeSelect.value);
        editor.requestRender();
      });
      typeRow.appendChild(typeSelect);
      connSection.appendChild(typeRow);

      // Arrow Styles
      const arrowStyles = ["none", "arrow", "open_arrow", "diamond", "circle", "square"];
      const arrowStyleLabels: Record<string, string> = { none: "None", arrow: "Arrow", open_arrow: "Open Arrow", diamond: "Diamond", circle: "Circle", square: "Square" };
      for (const [label, key, current] of [["Start", "start", info.start_arrow], ["End", "end", info.end_arrow]] as [string, string, string][]) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;gap:6px;align-items:center;margin-bottom:4px;";
        const lbl = document.createElement("span");
        lbl.style.cssText = "font-size:11px;color:#999;width:50px;";
        lbl.textContent = label + ":";
        row.appendChild(lbl);
        const sel = document.createElement("select");
        sel.style.cssText = "flex:1;background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:4px;padding:2px 6px;font-size:11px;";
        for (const s of arrowStyles) {
          const opt = document.createElement("option");
          opt.value = s; opt.textContent = arrowStyleLabels[s] || s;
          if (s === current) opt.selected = true;
          sel.appendChild(opt);
        }
        sel.addEventListener("change", () => {
          editor.engine.push_undo();
          if (key === "start") {
            editor.engine.set_connector_start_arrow_style(BigInt(id), sel.value);
          } else {
            editor.engine.set_connector_end_arrow_style(BigInt(id), sel.value);
          }
          editor.requestRender();
          refresh();
        });
        row.appendChild(sel);
        connSection.appendChild(row);
      }

      // Arrow Size
      const sizeRow = document.createElement("div");
      sizeRow.style.cssText = "display:flex;gap:6px;align-items:center;margin-bottom:8px;";
      const sizeLbl = document.createElement("span");
      sizeLbl.style.cssText = "font-size:11px;color:#999;width:50px;";
      sizeLbl.textContent = "Size:";
      sizeRow.appendChild(sizeLbl);
      const sizeInput = document.createElement("input");
      sizeInput.type = "number";
      sizeInput.min = "0.1"; sizeInput.max = "5"; sizeInput.step = "0.1";
      sizeInput.value = String(info.arrow_size ?? 1);
      sizeInput.style.cssText = "width:60px;background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:4px;padding:2px 6px;font-size:11px;";
      sizeInput.addEventListener("change", () => {
        editor.engine.push_undo();
        editor.engine.set_connector_arrow_size(BigInt(id), parseFloat(sizeInput.value) || 1);
        editor.requestRender();
      });
      sizeRow.appendChild(sizeInput);
      connSection.appendChild(sizeRow);

      // Anchor info
      const anchorInfoRow = document.createElement("div");
      anchorInfoRow.style.cssText = "margin-top:8px;font-size:11px;color:#888;";
      const startAnchorText = info.start_anchor ? `${info.start_anchor}` : "center";
      const endAnchorText = info.end_anchor ? `${info.end_anchor}` : "center";
      const startNodeText = info.start_node_id ? `Node ${info.start_node_id}` : "Free";
      const endNodeText = info.end_node_id ? `Node ${info.end_node_id}` : "Free";
      anchorInfoRow.innerHTML = `
        <div style="margin-bottom:4px;"><span style="color:#999;">Start:</span> ${startNodeText} → <span style="color:#7cb3f5;">${startAnchorText}</span></div>
        <div><span style="color:#999;">End:</span> ${endNodeText} → <span style="color:#7cb3f5;">${endAnchorText}</span></div>
      `;
      connSection.appendChild(anchorInfoRow);

      container.appendChild(connSection);
    }

    // === Callout properties ===
    if (typeof node.kind === "object" && node.kind.Callout) {
      const calloutSection = createSection("Callout");
      const info = JSON.parse(editor.engine.get_callout_info(BigInt(id)));

      // Content textarea
      const contentRow = document.createElement("div");
      contentRow.style.cssText = "display:flex;flex-direction:column;gap:4px;";
      const contentLabel = document.createElement("label");
      contentLabel.textContent = "Content";
      contentLabel.style.cssText = "font-size:11px;color:#aaa;";
      const contentTA = document.createElement("textarea");
      contentTA.value = info.content || "";
      contentTA.rows = 3;
      contentTA.style.cssText = "width:100%;background:#2a2a2a;color:#eee;border:1px solid #444;border-radius:4px;padding:4px;font-size:12px;resize:vertical;";
      contentTA.addEventListener("input", () => {
        editor.engine.push_undo();
        editor.engine.set_callout_content(BigInt(id), contentTA.value);
        editor.requestRender();
      });
      contentRow.appendChild(contentLabel);
      contentRow.appendChild(contentTA);
      calloutSection.appendChild(contentRow);

      // Theme selector
      const themeRow = document.createElement("div");
      themeRow.style.cssText = "display:flex;align-items:center;gap:8px;";
      const themeLabel = document.createElement("span");
      themeLabel.textContent = "Theme";
      themeLabel.style.cssText = "font-size:11px;color:#aaa;width:50px;";
      themeRow.appendChild(themeLabel);
      const themes = ["blue", "yellow", "red", "green", "gray"];
      const themeColors: Record<string, string> = { blue: "#1E88E5", yellow: "#F9A825", red: "#E53935", green: "#43A047", gray: "#9E9E9E" };
      for (const name of themes) {
        const dot = document.createElement("div");
        dot.style.cssText = `width:20px;height:20px;border-radius:50%;background:${themeColors[name]};cursor:pointer;border:2px solid ${info.theme === name ? '#fff' : 'transparent'};`;
        dot.title = name;
        dot.addEventListener("click", () => {
          editor.engine.push_undo();
          editor.engine.set_callout_theme(BigInt(id), name);
          editor.requestRender();
          refresh();
        });
        themeRow.appendChild(dot);
      }
      calloutSection.appendChild(themeRow);

      // Font size
      const fsRow = document.createElement("div");
      fsRow.style.cssText = "display:flex;align-items:center;gap:8px;";
      const fsLabel = document.createElement("span");
      fsLabel.textContent = "Font size";
      fsLabel.style.cssText = "font-size:11px;color:#aaa;width:50px;";
      const fsInput = createNumberInput(info.font_size, 8, 72, 1);
      fsInput.style.width = "60px";
      fsInput.addEventListener("change", () => {
        editor.engine.push_undo();
        editor.engine.set_callout_font_size(BigInt(id), parseFloat(fsInput.value) || 14);
        editor.requestRender();
      });
      fsRow.appendChild(fsLabel);
      fsRow.appendChild(fsInput);
      calloutSection.appendChild(fsRow);

      // Tail width
      const twRow = document.createElement("div");
      twRow.style.cssText = "display:flex;align-items:center;gap:8px;";
      const twLabel = document.createElement("span");
      twLabel.textContent = "Tail width";
      twLabel.style.cssText = "font-size:11px;color:#aaa;width:50px;";
      const twInput = createNumberInput(info.tail_width, 5, 100, 1);
      twInput.style.width = "60px";
      twInput.addEventListener("change", () => {
        editor.engine.push_undo();
        editor.engine.set_callout_tail_width(BigInt(id), parseFloat(twInput.value) || 20);
        editor.requestRender();
      });
      twRow.appendChild(twLabel);
      twRow.appendChild(twInput);
      calloutSection.appendChild(twRow);

      container.appendChild(calloutSection);
    }

    // === Sticky Note properties ===
    if (typeof node.kind === "object" && node.kind.StickyNote) {
      const stickySection = createSection("Sticky Note");
      const info = JSON.parse(editor.engine.get_sticky_info(BigInt(id)));

      // Theme color swatches
      const themeRow = document.createElement("div");
      themeRow.style.cssText = "display:flex;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap;";
      const themeLabel = document.createElement("span");
      themeLabel.style.cssText = "font-size:11px;color:#999;width:50px;";
      themeLabel.textContent = "Theme:";
      themeRow.appendChild(themeLabel);
      const themes: Record<string, string> = {
        yellow: "#FFF9C4", blue: "#BBDEFB", pink: "#F8BBD0",
        green: "#C8E6C9", orange: "#FFE0B2", purple: "#E1BEE7", gray: "#E0E0E0",
      };
      for (const [name, color] of Object.entries(themes)) {
        const swatch = document.createElement("div");
        swatch.style.cssText = `width:24px;height:24px;border-radius:4px;background:${color};cursor:pointer;border:2px solid ${name === info.theme ? "#fff" : "transparent"};`;
        swatch.title = name;
        swatch.addEventListener("click", () => {
          editor.engine.push_undo();
          editor.engine.set_sticky_theme(BigInt(id), name);
          editor.requestRender();
          refresh();
        });
        themeRow.appendChild(swatch);
      }
      stickySection.appendChild(themeRow);

      // Font size
      const fsRow = document.createElement("div");
      fsRow.style.cssText = "display:flex;gap:6px;align-items:center;margin-bottom:8px;";
      const fsLabel = document.createElement("span");
      fsLabel.style.cssText = "font-size:11px;color:#999;width:50px;";
      fsLabel.textContent = "Font:";
      fsRow.appendChild(fsLabel);
      const fsInput = document.createElement("input");
      fsInput.type = "number";
      fsInput.min = "8"; fsInput.max = "72"; fsInput.step = "1";
      fsInput.value = String(info.font_size);
      fsInput.style.cssText = "width:60px;background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:4px;padding:2px 6px;font-size:11px;";
      fsInput.addEventListener("change", () => {
        editor.engine.push_undo();
        editor.engine.set_sticky_font_size(BigInt(id), parseFloat(fsInput.value) || 16);
        editor.requestRender();
      });
      fsRow.appendChild(fsInput);
      stickySection.appendChild(fsRow);

      // Votes
      const voteRow = document.createElement("div");
      voteRow.style.cssText = "display:flex;gap:8px;align-items:center;margin-bottom:4px;";
      const voteLabel = document.createElement("span");
      voteLabel.style.cssText = "font-size:11px;color:#999;";
      voteLabel.textContent = `Votes: ${info.total_votes}`;
      voteRow.appendChild(voteLabel);
      const voteBtn = document.createElement("button");
      voteBtn.style.cssText = "background:#3a3a3a;color:#ccc;border:1px solid #555;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;";
      voteBtn.textContent = "+1 Vote";
      voteBtn.addEventListener("click", () => {
        editor.engine.push_undo();
        editor.engine.sticky_add_vote(BigInt(id), "local");
        editor.requestRender();
        refresh();
      });
      voteRow.appendChild(voteBtn);
      const unvoteBtn = document.createElement("button");
      unvoteBtn.style.cssText = "background:#3a3a3a;color:#ccc;border:1px solid #555;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;";
      unvoteBtn.textContent = "-1";
      unvoteBtn.addEventListener("click", () => {
        editor.engine.push_undo();
        editor.engine.sticky_remove_vote(BigInt(id), "local");
        editor.requestRender();
        refresh();
      });
      voteRow.appendChild(unvoteBtn);
      stickySection.appendChild(voteRow);

      container.appendChild(stickySection);
    }

    // === Chart properties ===
    if (typeof node.kind === "object" && node.kind.Chart) {
      const chartSection = createSection("Chart");
      const info = JSON.parse(editor.engine.get_chart_info(BigInt(id)));

      // Chart type selector
      const typeRow = document.createElement("div");
      typeRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:6px;";
      const typeLabel = document.createElement("span");
      typeLabel.textContent = "Type";
      typeLabel.style.cssText = "font-size:11px;color:#888;width:40px;";
      const typeSelect = document.createElement("select");
      typeSelect.className = "prop-input";
      typeSelect.style.cssText = "flex:1;";
      for (const t of ["bar", "line", "pie", "donut", "area"]) {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t.charAt(0).toUpperCase() + t.slice(1);
        if (t === info.chart_type) opt.selected = true;
        typeSelect.appendChild(opt);
      }
      typeSelect.addEventListener("change", () => {
        editor.engine.set_chart_type(BigInt(id), typeSelect.value);
        editor.requestRender();
      });
      typeRow.appendChild(typeLabel);
      typeRow.appendChild(typeSelect);
      chartSection.appendChild(typeRow);

      // Title input
      const titleRow = document.createElement("div");
      titleRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:6px;";
      const titleLabel = document.createElement("span");
      titleLabel.textContent = "Title";
      titleLabel.style.cssText = "font-size:11px;color:#888;width:40px;";
      const titleInput = document.createElement("input");
      titleInput.className = "prop-input";
      titleInput.style.cssText = "flex:1;";
      titleInput.value = info.config?.title || "";
      titleInput.placeholder = "Chart title";
      titleInput.addEventListener("change", () => {
        const cfg = { ...info.config, title: titleInput.value };
        editor.engine.set_chart_config(BigInt(id), JSON.stringify(cfg));
        editor.requestRender();
      });
      titleRow.appendChild(titleLabel);
      titleRow.appendChild(titleInput);
      chartSection.appendChild(titleRow);

      // Legend & Labels toggles
      const toggleRow = document.createElement("div");
      toggleRow.style.cssText = "display:flex;gap:12px;margin-bottom:6px;";
      for (const [key, label] of [["show_legend", "Legend"], ["show_labels", "Labels"]] as const) {
        const wrap = document.createElement("label");
        wrap.style.cssText = "display:flex;align-items:center;gap:4px;font-size:11px;color:#888;cursor:pointer;";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = info.config?.[key] !== false;
        cb.addEventListener("change", () => {
          const cfg = { ...info.config, [key]: cb.checked };
          editor.engine.set_chart_config(BigInt(id), JSON.stringify(cfg));
          editor.requestRender();
        });
        wrap.appendChild(cb);
        wrap.appendChild(document.createTextNode(label));
        toggleRow.appendChild(wrap);
      }
      chartSection.appendChild(toggleRow);

      // Data table
      const dataTitle = document.createElement("div");
      dataTitle.textContent = "Data";
      dataTitle.style.cssText = "font-size:11px;color:#888;margin-bottom:4px;";
      chartSection.appendChild(dataTitle);

      const dataTable = document.createElement("div");
      dataTable.style.cssText = "display:flex;flex-direction:column;gap:2px;margin-bottom:6px;";

      const dataPoints: { label: string; value: number; color?: string }[] = info.data || [];
      const rebuildDataUI = () => {
        dataTable.innerHTML = "";
        dataPoints.forEach((dp, i) => {
          const row = document.createElement("div");
          row.style.cssText = "display:flex;gap:4px;align-items:center;";
          const labelIn = document.createElement("input");
          labelIn.className = "prop-input";
          labelIn.style.cssText = "width:50px;";
          labelIn.value = dp.label;
          labelIn.addEventListener("change", () => { dp.label = labelIn.value; syncData(); });
          const valIn = document.createElement("input");
          valIn.className = "prop-input";
          valIn.style.cssText = "width:50px;";
          valIn.type = "number";
          valIn.value = String(dp.value);
          valIn.addEventListener("change", () => { dp.value = parseFloat(valIn.value) || 0; syncData(); });
          const delBtn = document.createElement("button");
          delBtn.textContent = "×";
          delBtn.style.cssText = "background:none;border:none;color:#888;cursor:pointer;font-size:14px;padding:0 2px;";
          delBtn.addEventListener("click", () => { dataPoints.splice(i, 1); syncData(); rebuildDataUI(); });
          row.appendChild(labelIn);
          row.appendChild(valIn);
          row.appendChild(delBtn);
          dataTable.appendChild(row);
        });
      };
      const syncData = () => {
        editor.engine.set_chart_data(BigInt(id), JSON.stringify(dataPoints));
        editor.requestRender();
      };
      rebuildDataUI();
      chartSection.appendChild(dataTable);

      const addBtn = document.createElement("button");
      addBtn.textContent = "+ Add Data";
      addBtn.style.cssText = "background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#aaa;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px;";
      addBtn.addEventListener("click", () => {
        dataPoints.push({ label: String.fromCharCode(65 + dataPoints.length), value: 50 });
        syncData();
        rebuildDataUI();
      });
      chartSection.appendChild(addBtn);

      container.appendChild(chartSection);
    }

    // === Repeat Grid properties ===
    if (typeof node.kind === "object" && node.kind.RepeatGrid) {
      const rgSection = createSection("Repeat Grid");
      const rgInfo = JSON.parse(editor.engine.get_repeat_grid_params(BigInt(id)));
      if (rgInfo) {
        const makeRow = (label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void) => {
          const row = document.createElement("div");
          row.style.cssText = "display:flex;align-items:center;gap:8px;";
          const lbl = document.createElement("span");
          lbl.textContent = label;
          lbl.style.cssText = "font-size:11px;color:#aaa;width:70px;";
          const inp = document.createElement("input");
          inp.type = "number"; inp.value = String(value); inp.min = String(min); inp.max = String(max); inp.step = String(step);
          inp.style.cssText = "width:60px;padding:3px 5px;font-size:11px;border:1px solid #3a3a3a;border-radius:4px;background:#1e1e1e;color:#ccc;text-align:center;";
          inp.addEventListener("change", () => {
            editor.engine.push_undo();
            onChange(parseFloat(inp.value) || value);
            editor.engine.sync_repeat_grid(BigInt(id));
            editor.requestRender();
            refresh();
          });
          row.appendChild(lbl);
          row.appendChild(inp);
          return row;
        };

        rgSection.appendChild(makeRow("Columns", rgInfo.columns, 1, 50, 1, (v) => {
          editor.engine.set_repeat_grid_params(BigInt(id), v, rgInfo.rows, rgInfo.column_gap, rgInfo.row_gap);
        }));
        rgSection.appendChild(makeRow("Rows", rgInfo.rows, 1, 50, 1, (v) => {
          editor.engine.set_repeat_grid_params(BigInt(id), rgInfo.columns, v, rgInfo.column_gap, rgInfo.row_gap);
        }));
        rgSection.appendChild(makeRow("Col Gap", rgInfo.column_gap, 0, 500, 1, (v) => {
          editor.engine.set_repeat_grid_params(BigInt(id), rgInfo.columns, rgInfo.rows, v, rgInfo.row_gap);
        }));
        rgSection.appendChild(makeRow("Row Gap", rgInfo.row_gap, 0, 500, 1, (v) => {
          editor.engine.set_repeat_grid_params(BigInt(id), rgInfo.columns, rgInfo.rows, rgInfo.column_gap, v);
        }));
      }
      container.appendChild(rgSection);
    }

    // === Slice export section ===
    if (node.kind === "Slice") {
      const sliceSection = createSection("Slice Export");

      // Export items list
      type SliceExportItem = { scale: number; format: "png" | "jpg" | "svg"; suffix: string };
      const storageKey = `opensketch-slice-exports-${id}`;
      let exportItems: SliceExportItem[] = [];
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) exportItems = JSON.parse(raw);
      } catch { /* ignore */ }
      if (exportItems.length === 0) {
        exportItems = [{ scale: 1, format: "png", suffix: "" }];
      }

      const saveItems = () => localStorage.setItem(storageKey, JSON.stringify(exportItems));

      const listEl = document.createElement("div");
      listEl.style.cssText = "margin-bottom:8px;";

      const renderItems = () => {
        listEl.innerHTML = "";
        exportItems.forEach((item, idx) => {
          const row = document.createElement("div");
          row.style.cssText = "display:flex;gap:4px;align-items:center;margin-bottom:4px;";

          // Scale select
          const scaleSel = document.createElement("select");
          scaleSel.style.cssText = "width:55px;background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:4px;padding:2px 4px;font-size:10px;";
          for (const s of [0.5, 1, 1.5, 2, 3, 4]) {
            const opt = document.createElement("option");
            opt.value = String(s); opt.textContent = `${s}x`;
            if (s === item.scale) opt.selected = true;
            scaleSel.appendChild(opt);
          }
          scaleSel.addEventListener("change", () => { item.scale = parseFloat(scaleSel.value); saveItems(); });
          row.appendChild(scaleSel);

          // Format select
          const fmtSel = document.createElement("select");
          fmtSel.style.cssText = "width:55px;background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:4px;padding:2px 4px;font-size:10px;";
          for (const f of ["png", "jpg", "svg"] as const) {
            const opt = document.createElement("option");
            opt.value = f; opt.textContent = f.toUpperCase();
            if (f === item.format) opt.selected = true;
            fmtSel.appendChild(opt);
          }
          fmtSel.addEventListener("change", () => { item.format = fmtSel.value as any; saveItems(); });
          row.appendChild(fmtSel);

          // Suffix input
          const suffixInput = document.createElement("input");
          suffixInput.type = "text";
          suffixInput.placeholder = "suffix";
          suffixInput.value = item.suffix;
          suffixInput.style.cssText = "flex:1;min-width:40px;background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:4px;padding:2px 4px;font-size:10px;";
          suffixInput.addEventListener("change", () => { item.suffix = suffixInput.value; saveItems(); });
          row.appendChild(suffixInput);

          // Remove button
          const removeBtn = document.createElement("button");
          removeBtn.style.cssText = "background:none;border:none;color:#888;cursor:pointer;font-size:12px;padding:0 2px;";
          removeBtn.textContent = "×";
          removeBtn.addEventListener("click", () => {
            exportItems.splice(idx, 1);
            if (exportItems.length === 0) exportItems.push({ scale: 1, format: "png", suffix: "" });
            saveItems();
            renderItems();
          });
          row.appendChild(removeBtn);

          listEl.appendChild(row);
        });
      };
      renderItems();
      sliceSection.appendChild(listEl);

      // Add item button
      const addRow = document.createElement("div");
      addRow.style.cssText = "display:flex;gap:6px;margin-bottom:8px;";
      const addBtn = document.createElement("button");
      addBtn.style.cssText = "flex:1;padding:4px;background:#2a2a2a;color:#4a90d9;border:1px dashed #444;border-radius:4px;font-size:10px;cursor:pointer;";
      addBtn.textContent = "+ Add export";
      addBtn.addEventListener("click", () => {
        const lastScale = exportItems[exportItems.length - 1]?.scale || 1;
        const nextScale = lastScale < 3 ? lastScale * 2 : 4;
        const suffix = nextScale !== 1 ? `@${nextScale}x` : "";
        exportItems.push({ scale: Math.min(nextScale, 4), format: "png", suffix });
        saveItems();
        renderItems();
      });
      addRow.appendChild(addBtn);

      // Quick add @1x/@2x/@3x
      const quickBtn = document.createElement("button");
      quickBtn.style.cssText = "padding:4px 8px;background:#2a2a2a;color:#888;border:1px solid #444;border-radius:4px;font-size:10px;cursor:pointer;white-space:nowrap;";
      quickBtn.textContent = "iOS set";
      quickBtn.title = "Add @1x, @2x, @3x PNG presets";
      quickBtn.addEventListener("click", () => {
        exportItems = [
          { scale: 1, format: "png", suffix: "" },
          { scale: 2, format: "png", suffix: "@2x" },
          { scale: 3, format: "png", suffix: "@3x" },
        ];
        saveItems();
        renderItems();
      });
      addRow.appendChild(quickBtn);
      sliceSection.appendChild(addRow);

      // Export button
      const exportBtn = document.createElement("button");
      exportBtn.style.cssText = "width:100%;padding:7px;background:#36b37e;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;";
      exportBtn.textContent = exportItems.length > 1 ? `Export ${exportItems.length} variants` : "Export";
      exportBtn.addEventListener("click", () => {
        editor.exportSliceBatch(id, exportItems);
      });
      sliceSection.appendChild(exportBtn);
      container.appendChild(sliceSection);
    }

    // === Section Enhancements (Section only) ===
    const kindStr = typeof node.kind === "string" ? node.kind : Object.keys(node.kind)[0];
    if (kindStr === "Section") {
      const secSection = document.createElement("div");
      secSection.className = "prop-section";
      const secTitle = document.createElement("div");
      secTitle.className = "prop-section-title";
      secTitle.textContent = "Section";
      secSection.appendChild(secTitle);

      // Collapsed toggle
      const collapsedRow = document.createElement("div");
      collapsedRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:6px;";
      const collapsedCb = document.createElement("input");
      collapsedCb.type = "checkbox";
      collapsedCb.checked = editor.engine.get_section_collapsed(BigInt(id));
      collapsedCb.addEventListener("change", () => {
        editor.saveUndo();
        editor.engine.set_section_collapsed(BigInt(id), collapsedCb.checked);
        editor.render();
      });
      const collapsedLabel = document.createElement("label");
      collapsedLabel.textContent = "Collapsed";
      collapsedLabel.style.cssText = "font-size:11px;color:#aaa;cursor:pointer;";
      collapsedLabel.prepend(collapsedCb);
      collapsedRow.appendChild(collapsedLabel);
      secSection.appendChild(collapsedRow);

      // Title color
      const titleColorRow = document.createElement("div");
      titleColorRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:6px;";
      const titleColorLbl = document.createElement("span");
      titleColorLbl.textContent = "Title Color";
      titleColorLbl.style.cssText = "font-size:11px;color:#888;width:70px;";
      const titleColorInput = document.createElement("input");
      titleColorInput.type = "text";
      titleColorInput.placeholder = "rgba(255,255,255,0.7)";
      titleColorInput.value = editor.engine.get_section_title_color(BigInt(id));
      titleColorInput.style.cssText = "flex:1;background:#2a2a2a;border:1px solid #444;border-radius:4px;padding:2px 6px;color:#ddd;font-size:11px;";
      titleColorInput.addEventListener("change", () => {
        editor.saveUndo();
        editor.engine.set_section_title_color(BigInt(id), titleColorInput.value);
        editor.render();
      });
      titleColorRow.appendChild(titleColorLbl);
      titleColorRow.appendChild(titleColorInput);
      secSection.appendChild(titleColorRow);

      // Title font size
      const titleSizeRow = document.createElement("div");
      titleSizeRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:6px;";
      const titleSizeLbl = document.createElement("span");
      titleSizeLbl.textContent = "Title Size";
      titleSizeLbl.style.cssText = "font-size:11px;color:#888;width:70px;";
      const titleSizeInput = document.createElement("input");
      titleSizeInput.type = "number";
      titleSizeInput.min = "8";
      titleSizeInput.max = "72";
      titleSizeInput.value = String(editor.engine.get_section_title_font_size(BigInt(id)));
      titleSizeInput.style.cssText = "width:60px;background:#2a2a2a;border:1px solid #444;border-radius:4px;padding:2px 6px;color:#ddd;font-size:11px;";
      titleSizeInput.addEventListener("change", () => {
        editor.saveUndo();
        editor.engine.set_section_title_font_size(BigInt(id), parseFloat(titleSizeInput.value) || 14);
        editor.render();
      });
      titleSizeRow.appendChild(titleSizeLbl);
      titleSizeRow.appendChild(titleSizeInput);
      secSection.appendChild(titleSizeRow);

      container.appendChild(secSection);
    }

    // === Overflow Section (Frame/Section only) ===
    if (["Frame", "Section"].includes(kindStr || "")) {
      const overflowSection = document.createElement("div");
      overflowSection.className = "prop-section";
      const overflowTitle = document.createElement("div");
      overflowTitle.className = "prop-section-title";
      overflowTitle.textContent = "Overflow";
      overflowSection.appendChild(overflowTitle);

      // Clip content checkbox
      const clipRow = document.createElement("label");
      clipRow.style.cssText = "display:flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:6px;";
      const clipCheck = document.createElement("input");
      clipCheck.type = "checkbox";
      clipCheck.checked = editor.engine.get_clip_content(BigInt(id));
      clipCheck.style.cssText = "accent-color:#4f46e5;";
      clipCheck.addEventListener("change", () => {
        editor.engine.push_undo();
        editor.engine.set_clip_content(BigInt(id), clipCheck.checked);
        editor.requestRender();
        refresh(ids);
      });
      const clipLabel = document.createElement("span");
      clipLabel.style.cssText = "font-size:11px;color:#aaa;";
      clipLabel.textContent = "Clip content";
      clipRow.appendChild(clipCheck);
      clipRow.appendChild(clipLabel);
      overflowSection.appendChild(clipRow);

      const overflowRow = document.createElement("div");
      overflowRow.style.cssText = "display:flex;gap:4px;";

      const currentOverflow = editor.engine.get_overflow(BigInt(id));
      const overflowModes: {value: string; label: string}[] = [
        { value: "visible", label: "Visible" },
        { value: "hidden", label: "Hidden" },
        { value: "scroll-horizontal", label: "Scroll H" },
        { value: "scroll-vertical", label: "Scroll V" },
        { value: "scroll-both", label: "Scroll Both" },
      ];
      for (const mode of overflowModes) {
        const btn = document.createElement("button");
        const isActive = currentOverflow === mode.value;
        btn.style.cssText = `
          flex:1;padding:4px 0;border:1px solid ${isActive ? "#4f46e5" : "#444"};
          border-radius:4px;background:${isActive ? "rgba(79,70,229,0.15)" : "transparent"};
          color:${isActive ? "#818cf8" : "#aaa"};cursor:pointer;font-size:10px;
        `;
        btn.textContent = mode.label;
        btn.addEventListener("click", () => {
          editor.engine.push_undo();
          editor.engine.set_overflow(BigInt(id), mode.value);
          if (!mode.value.startsWith("scroll")) {
            editor.engine.set_scroll_offset(BigInt(id), 0, 0);
          }
          editor.requestRender();
          refresh(ids);
        });
        overflowRow.appendChild(btn);
      }
      overflowSection.appendChild(overflowRow);

      // Show scroll offset if scroll mode
      const isScrollMode = currentOverflow.startsWith("scroll");
      if (isScrollMode) {
        const scrollInfo = JSON.parse(editor.engine.get_scroll_offset(BigInt(id)));
        const scrollLabel = document.createElement("div");
        scrollLabel.style.cssText = "font-size:10px;color:#666;margin-top:4px;";
        scrollLabel.textContent = `Scroll: ${Math.round(scrollInfo.x)}px, ${Math.round(scrollInfo.y)}px`;
        overflowSection.appendChild(scrollLabel);

        const resetBtn = document.createElement("button");
        resetBtn.style.cssText = "margin-top:4px;padding:2px 8px;border:1px solid #444;border-radius:3px;background:transparent;color:#aaa;cursor:pointer;font-size:10px;";
        resetBtn.textContent = "Reset scroll";
        resetBtn.addEventListener("click", () => {
          editor.engine.push_undo();
          editor.engine.set_scroll_offset(BigInt(id), 0, 0);
          editor.requestRender();
          refresh(ids);
        });
        overflowSection.appendChild(resetBtn);

        // Scroll Snap Type (container)
        const snapTypeLabel = document.createElement("div");
        snapTypeLabel.style.cssText = "font-size:10px;color:#888;margin-top:8px;margin-bottom:4px;";
        snapTypeLabel.textContent = "Scroll Snap";
        overflowSection.appendChild(snapTypeLabel);

        const currentSnapType = editor.engine.get_scroll_snap_type(BigInt(id));
        const snapTypeSelect = document.createElement("select");
        snapTypeSelect.style.cssText = "width:100%;padding:3px 6px;background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#ccc;font-size:10px;";
        const snapTypes = [
          { value: "none", label: "None" },
          { value: "mandatory-x", label: "Mandatory X" },
          { value: "mandatory-y", label: "Mandatory Y" },
          { value: "mandatory-both", label: "Mandatory Both" },
          { value: "proximity-x", label: "Proximity X" },
          { value: "proximity-y", label: "Proximity Y" },
          { value: "proximity-both", label: "Proximity Both" },
        ];
        for (const st of snapTypes) {
          const opt = document.createElement("option");
          opt.value = st.value;
          opt.textContent = st.label;
          if (st.value === currentSnapType) opt.selected = true;
          snapTypeSelect.appendChild(opt);
        }
        snapTypeSelect.addEventListener("change", () => {
          editor.engine.push_undo();
          editor.engine.set_scroll_snap_type(BigInt(id), snapTypeSelect.value);
          editor.requestRender();
          refresh(ids);
        });
        overflowSection.appendChild(snapTypeSelect);
      }

      panel.appendChild(overflowSection);

      // Scroll Snap Align (child node) — show if parent is scrollable
      if (node.parent) {
        const parentOverflow = editor.engine.get_overflow(BigInt(node.parent));
        if (parentOverflow.startsWith("scroll")) {
          const snapAlignSection = document.createElement("div");
          snapAlignSection.style.cssText = "margin-top:8px;";
          const snapAlignLabel = document.createElement("div");
          snapAlignLabel.style.cssText = "font-size:10px;color:#888;margin-bottom:4px;";
          snapAlignLabel.textContent = "Snap Align";
          snapAlignSection.appendChild(snapAlignLabel);

          const currentSnapAlign = editor.engine.get_scroll_snap_align(BigInt(id));
          const snapAlignSelect = document.createElement("select");
          snapAlignSelect.style.cssText = "width:100%;padding:3px 6px;background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#ccc;font-size:10px;";
          const snapAligns = [
            { value: "none", label: "None" },
            { value: "start", label: "Start" },
            { value: "center", label: "Center" },
            { value: "end", label: "End" },
          ];
          for (const sa of snapAligns) {
            const opt = document.createElement("option");
            opt.value = sa.value;
            opt.textContent = sa.label;
            if (sa.value === currentSnapAlign) opt.selected = true;
            snapAlignSelect.appendChild(opt);
          }
          snapAlignSelect.addEventListener("change", () => {
            editor.engine.push_undo();
            editor.engine.set_scroll_snap_align(BigInt(id), snapAlignSelect.value);
            editor.requestRender();
            refresh(ids);
          });
          snapAlignSection.appendChild(snapAlignSelect);
          panel.appendChild(snapAlignSection);
        }
      }
    }

    // === Auto Layout Section (Frame/Instance/Group) ===
    if (["Frame", "Instance", "Group", "Slot"].includes(kindStr || "")) {
      const layoutJson = editor.engine.get_layout(BigInt(id));
      const layout = JSON.parse(layoutJson);
      const hasLayout = layout.mode !== "None";

      const layoutSection = document.createElement("div");
      layoutSection.className = "prop-section";

      // Title row with add/remove button
      const titleRow = document.createElement("div");
      titleRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;";
      const layoutTitle = document.createElement("div");
      layoutTitle.className = "prop-section-title";
      layoutTitle.style.marginBottom = "0";
      layoutTitle.textContent = "Auto layout";
      titleRow.appendChild(layoutTitle);

      const toggleBtn = document.createElement("button");
      toggleBtn.style.cssText = `
        background:none;border:1px solid ${hasLayout ? "#555" : "#4f46e5"};border-radius:4px;
        color:${hasLayout ? "#888" : "#4f46e5"};cursor:pointer;width:22px;height:22px;
        display:flex;align-items:center;justify-content:center;padding:0;transition:all 0.15s;
      `;
      toggleBtn.innerHTML = hasLayout
        ? icons.minus.replace(/width="\d+"/, 'width="12"').replace(/height="\d+"/, 'height="12"')
        : icons.plus.replace(/width="\d+"/, 'width="12"').replace(/height="\d+"/, 'height="12"');
      toggleBtn.title = hasLayout ? "Remove auto layout" : "Add auto layout";
      toggleBtn.addEventListener("click", () => {
        editor.engine.push_undo();
        editor.engine.set_layout_mode(BigInt(id), hasLayout ? "none" : "flex");
        editor.requestRender();
        refresh(ids);
      });
      titleRow.appendChild(toggleBtn);
      layoutSection.appendChild(titleRow);

      if (hasLayout) {
        // --- Direction + Distribution row ---
        const dirRow = document.createElement("div");
        dirRow.style.cssText = "display:flex;gap:4px;margin-bottom:8px;";

        if (layout.mode === "Flex") {
          const dir = (layout.direction || "Row").toLowerCase();
          // Direction toggle buttons
          (["row", "column"] as const).forEach((d) => {
            const btn = document.createElement("button");
            const isActive = dir === d;
            btn.style.cssText = `
              flex:1;padding:5px 0;border:1px solid ${isActive ? "#4f46e5" : "#3a3a3a"};
              border-radius:6px;background:${isActive ? "#4f46e520" : "#2a2a2a"};
              color:${isActive ? "#818cf8" : "#666"};cursor:pointer;display:flex;
              align-items:center;justify-content:center;gap:4px;font-size:10px;transition:all 0.15s;
            `;
            const icon = d === "row" ? icons.arrowRight : icons.arrowDown;
            btn.innerHTML = icon.replace(/width="\d+"/, 'width="14"').replace(/height="\d+"/, 'height="14"');
            btn.addEventListener("click", () => {
              editor.engine.push_undo();
              editor.engine.set_flex_direction(BigInt(id), d);
              editor.requestRender();
              refresh(ids);
            });
            dirRow.appendChild(btn);
          });

          // Wrap toggle
          const isWrap = layout.wrap === "Wrap";
          const wrapBtn = document.createElement("button");
          wrapBtn.style.cssText = `
            padding:5px 8px;border:1px solid ${isWrap ? "#4f46e5" : "#3a3a3a"};
            border-radius:6px;background:${isWrap ? "#4f46e520" : "#2a2a2a"};
            color:${isWrap ? "#818cf8" : "#666"};cursor:pointer;display:flex;
            align-items:center;justify-content:center;transition:all 0.15s;
          `;
          wrapBtn.innerHTML = icons.wrap.replace(/width="\d+"/, 'width="14"').replace(/height="\d+"/, 'height="14"');
          wrapBtn.title = isWrap ? "Disable Wrap" : "Enable Wrap";
          wrapBtn.addEventListener("click", () => {
            editor.engine.push_undo();
            editor.engine.set_flex_wrap(BigInt(id), isWrap ? "nowrap" : "wrap");
            editor.requestRender();
            refresh(ids);
          });
          dirRow.appendChild(wrapBtn);

          // Align Content dropdown (only when wrap is enabled)
          if (isWrap) {
            const acSel = document.createElement("select");
            acSel.style.cssText = "padding:4px 2px;border:1px solid #3a3a3a;border-radius:6px;background:#2a2a2a;color:#888;font-size:10px;cursor:pointer;appearance:none;text-align:center;width:60px;";
            const curAC = editor.engine.get_align_content(BigInt(id));
            const acOptions = [
              { value: "stretch", label: "Stretch" },
              { value: "flex-start", label: "Start" },
              { value: "flex-end", label: "End" },
              { value: "center", label: "Center" },
              { value: "space-between", label: "Between" },
              { value: "space-around", label: "Around" },
            ];
            acOptions.forEach((o) => {
              const opt = document.createElement("option");
              opt.value = o.value;
              opt.textContent = o.label;
              opt.selected = curAC === o.label || curAC === o.value ||
                (o.value === "stretch" && curAC === "Stretch") ||
                (o.value === "flex-start" && curAC === "FlexStart") ||
                (o.value === "flex-end" && curAC === "FlexEnd") ||
                (o.value === "center" && curAC === "Center") ||
                (o.value === "space-between" && curAC === "SpaceBetween") ||
                (o.value === "space-around" && curAC === "SpaceAround");
              acSel.appendChild(opt);
            });
            acSel.title = "Align Content (wrap line alignment)";
            acSel.addEventListener("change", () => {
              editor.engine.push_undo();
              editor.engine.set_align_content(BigInt(id), acSel.value);
              editor.requestRender();
              refresh(ids);
            });
            dirRow.appendChild(acSel);
          }
        }

        // Grid/Flex mode toggle
        const modeToggle = document.createElement("select");
        modeToggle.style.cssText = "padding:5px 4px;border:1px solid #3a3a3a;border-radius:6px;background:#2a2a2a;color:#888;font-size:10px;cursor:pointer;appearance:none;text-align:center;width:44px;";
        ["Flex", "Grid"].forEach((m) => {
          const opt = document.createElement("option");
          opt.value = m.toLowerCase();
          opt.textContent = m;
          opt.selected = layout.mode === m;
          modeToggle.appendChild(opt);
        });
        modeToggle.addEventListener("change", () => {
          editor.engine.push_undo();
          editor.engine.set_layout_mode(BigInt(id), modeToggle.value);
          editor.requestRender();
          refresh(ids);
        });
        dirRow.appendChild(modeToggle);
        layoutSection.appendChild(dirRow);

        // --- Alignment Matrix (3x3 grid) ---
        if (layout.mode === "Flex") {
          const dir = (layout.direction || "Row").toLowerCase();
          const curAlign = (layout.align_items || "Start").toLowerCase();
          const curJust = (layout.justify_content || "Start").toLowerCase();

          const matrixWrap = document.createElement("div");
          matrixWrap.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:8px;";

          const matrix = document.createElement("div");
          matrix.style.cssText = "display:grid;grid-template-columns:repeat(3,1fr);gap:3px;width:54px;height:54px;background:#1e1e1e;border-radius:6px;padding:4px;flex-shrink:0;";

          // Map: row direction → columns=justify, rows=align
          // column direction → columns=align, rows=justify
          const justMap = ["start", "center", "end"];
          const alignMap = ["start", "center", "end"];

          for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
              const dot = document.createElement("button");
              let thisAlign: string, thisJust: string;
              if (dir === "row") {
                thisJust = justMap[col];
                thisAlign = alignMap[row];
              } else {
                thisAlign = alignMap[col];
                thisJust = justMap[row];
              }
              const isActive = curAlign === thisAlign && (curJust === thisJust || (curJust.startsWith("space") && thisJust === "start"));
              dot.style.cssText = `
                width:14px;height:14px;border-radius:3px;border:none;padding:0;cursor:pointer;
                background:${isActive ? "#4f46e5" : "#3a3a3a"};
                transition:all 0.15s;
              `;
              dot.addEventListener("mouseenter", () => { if (!isActive) dot.style.background = "#555"; });
              dot.addEventListener("mouseleave", () => { if (!isActive) dot.style.background = "#3a3a3a"; });
              dot.addEventListener("click", () => {
                editor.engine.push_undo();
                editor.engine.set_align_items(BigInt(id), thisAlign);
                editor.engine.set_justify_content(BigInt(id), thisJust);
                editor.requestRender();
                refresh(ids);
              });
              matrix.appendChild(dot);
            }
          }
          matrixWrap.appendChild(matrix);

          // Distribution buttons (packed / space-between)
          const distCol = document.createElement("div");
          distCol.style.cssText = "display:flex;flex-direction:column;gap:3px;";

          const distributions = [
            { val: curJust.startsWith("space") ? curJust : "packed", icon: icons.packed, label: "Packed", isSpace: false },
            { val: "space-between", icon: icons.spaceBetween, label: "Space between", isSpace: true },
          ];
          for (const d of distributions) {
            const isActive = d.isSpace ? curJust.startsWith("space") : !curJust.startsWith("space");
            const btn = document.createElement("button");
            btn.style.cssText = `
              padding:4px 8px;border:1px solid ${isActive ? "#4f46e5" : "#3a3a3a"};
              border-radius:5px;background:${isActive ? "#4f46e520" : "#2a2a2a"};
              color:${isActive ? "#818cf8" : "#666"};cursor:pointer;display:flex;
              align-items:center;gap:4px;font-size:9px;transition:all 0.15s;white-space:nowrap;
            `;
            btn.innerHTML = d.icon.replace(/width="\d+"/, 'width="12"').replace(/height="\d+"/, 'height="12"') + `<span>${d.label}</span>`;
            btn.addEventListener("click", () => {
              editor.engine.push_undo();
              if (d.isSpace) {
                editor.engine.set_justify_content(BigInt(id), "space-between");
              } else {
                // Revert to the alignment matrix value
                editor.engine.set_justify_content(BigInt(id), curJust.startsWith("space") ? "start" : curJust);
              }
              editor.requestRender();
              refresh(ids);
            });
            distCol.appendChild(btn);
          }
          matrixWrap.appendChild(distCol);
          layoutSection.appendChild(matrixWrap);
        }

        // --- Gap & Padding compact row ---
        const metricsGrid = document.createElement("div");
        metricsGrid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;";

        // Gap
        const gapWrap = createLabeledInput("Gap", String(layout.gap || 0), (v) => {
          editor.engine.push_undo();
          editor.engine.set_layout_gap(BigInt(id), parseFloat(v) || 0);
          editor.requestRender();
        });
        metricsGrid.appendChild(gapWrap);

        // Grid columns (or placeholder)
        if (layout.mode === "Grid") {
          const colWrap = createLabeledInput("Col", String(layout.grid_columns || 2), (v) => {
            editor.engine.push_undo();
            editor.engine.set_grid_columns(BigInt(id), parseInt(v) || 2);
            editor.requestRender();
          });
          metricsGrid.appendChild(colWrap);
        } else {
          metricsGrid.appendChild(document.createElement("div")); // empty cell
        }
        layoutSection.appendChild(metricsGrid);

        // Padding — 4 individual inputs with visual layout
        const padWrap = document.createElement("div");
        padWrap.style.cssText = "background:#1e1e1e;border-radius:6px;padding:8px;position:relative;";

        const padLabel = document.createElement("div");
        padLabel.style.cssText = "font-size:9px;color:#555;text-align:center;margin-bottom:6px;letter-spacing:0.5px;";
        padLabel.textContent = "PADDING";
        padWrap.appendChild(padLabel);

        // Top
        const padTop = document.createElement("div");
        padTop.style.cssText = "display:flex;justify-content:center;margin-bottom:4px;";
        const topInput = document.createElement("input");
        topInput.className = "prop-input";
        topInput.style.cssText = "width:48px;min-width:0;text-align:center;font-size:11px;padding:3px 4px;";
        topInput.value = String(layout.padding_top || 0);
        topInput.addEventListener("change", () => {
          editor.engine.push_undo();
          editor.engine.set_layout_padding(BigInt(id), parseFloat(topInput.value)||0, parseFloat(rightInput.value)||0, parseFloat(bottomInput.value)||0, parseFloat(leftInput.value)||0);
          editor.requestRender();
        });
        padTop.appendChild(topInput);
        padWrap.appendChild(padTop);

        // Left + Right row
        const padMid = document.createElement("div");
        padMid.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;";
        const leftInput = document.createElement("input");
        leftInput.className = "prop-input";
        leftInput.style.cssText = "width:48px;min-width:0;text-align:center;font-size:11px;padding:3px 4px;";
        leftInput.value = String(layout.padding_left || 0);
        const midDot = document.createElement("div");
        midDot.style.cssText = "width:6px;height:6px;border-radius:50%;background:#3a3a3a;";
        const rightInput = document.createElement("input");
        rightInput.className = "prop-input";
        rightInput.style.cssText = "width:48px;min-width:0;text-align:center;font-size:11px;padding:3px 4px;";
        rightInput.value = String(layout.padding_right || 0);
        padMid.appendChild(leftInput);
        padMid.appendChild(midDot);
        padMid.appendChild(rightInput);
        padWrap.appendChild(padMid);

        // Bottom
        const padBot = document.createElement("div");
        padBot.style.cssText = "display:flex;justify-content:center;";
        const bottomInput = document.createElement("input");
        bottomInput.className = "prop-input";
        bottomInput.style.cssText = "width:48px;min-width:0;text-align:center;font-size:11px;padding:3px 4px;";
        bottomInput.value = String(layout.padding_bottom || 0);
        padBot.appendChild(bottomInput);
        padWrap.appendChild(padBot);

        // All padding inputs commit on change
        [leftInput, rightInput, bottomInput].forEach((inp) => {
          inp.addEventListener("change", () => {
            editor.engine.push_undo();
            editor.engine.set_layout_padding(BigInt(id), parseFloat(topInput.value)||0, parseFloat(rightInput.value)||0, parseFloat(bottomInput.value)||0, parseFloat(leftInput.value)||0);
            editor.requestRender();
          });
        });

        layoutSection.appendChild(padWrap);

        // --- Spacing Presets (quick apply gap + uniform padding) ---
        const SPACING_PRESETS = [
          { label: "XS", gap: 4, pad: 4 },
          { label: "S", gap: 8, pad: 8 },
          { label: "M", gap: 12, pad: 12 },
          { label: "Base", gap: 16, pad: 16 },
          { label: "L", gap: 24, pad: 24 },
          { label: "XL", gap: 32, pad: 32 },
          { label: "2XL", gap: 48, pad: 48 },
        ];

        const presetsWrap = document.createElement("div");
        presetsWrap.style.cssText = "margin-top:8px;";

        const presetsLabel = document.createElement("div");
        presetsLabel.style.cssText = "font-size:9px;color:#555;margin-bottom:5px;letter-spacing:0.5px;text-transform:uppercase;";
        presetsLabel.textContent = "Spacing presets";
        presetsWrap.appendChild(presetsLabel);

        const presetsRow = document.createElement("div");
        presetsRow.style.cssText = "display:flex;gap:3px;flex-wrap:wrap;";

        const currentGap = layout.gap || 0;
        const currentPadUniform = (layout.padding_top === layout.padding_right && layout.padding_right === layout.padding_bottom && layout.padding_bottom === layout.padding_left) ? (layout.padding_top || 0) : -1;

        for (const preset of SPACING_PRESETS) {
          const isActive = currentGap === preset.gap && currentPadUniform === preset.pad;
          const chip = document.createElement("button");
          chip.style.cssText = `
            padding:3px 7px;border:1px solid ${isActive ? "#4f46e5" : "#3a3a3a"};border-radius:4px;
            background:${isActive ? "#4f46e520" : "#2a2a2a"};color:${isActive ? "#818cf8" : "#888"};
            cursor:pointer;font-size:10px;line-height:1;transition:all 0.15s;white-space:nowrap;
          `;
          chip.textContent = `${preset.label} ${preset.gap}`;
          chip.title = `Gap: ${preset.gap}px, Padding: ${preset.pad}px (all sides)`;
          chip.addEventListener("mouseenter", () => { if (!isActive) { chip.style.borderColor = "#555"; chip.style.color = "#aaa"; }});
          chip.addEventListener("mouseleave", () => { if (!isActive) { chip.style.borderColor = "#3a3a3a"; chip.style.color = "#888"; }});
          chip.addEventListener("click", () => {
            editor.engine.push_undo();
            editor.engine.set_layout_gap(BigInt(id), preset.gap);
            editor.engine.set_layout_padding(BigInt(id), preset.pad, preset.pad, preset.pad, preset.pad);
            editor.requestRender();
            refresh(ids);
          });
          presetsRow.appendChild(chip);
        }

        // Gap-only presets row
        const gapOnlyLabel = document.createElement("div");
        gapOnlyLabel.style.cssText = "font-size:9px;color:#444;margin-top:5px;margin-bottom:3px;";
        gapOnlyLabel.textContent = "Gap only";
        presetsWrap.appendChild(presetsRow);
        presetsWrap.appendChild(gapOnlyLabel);

        const gapOnlyRow = document.createElement("div");
        gapOnlyRow.style.cssText = "display:flex;gap:3px;flex-wrap:wrap;";

        for (const val of [-8, -4, 0, 4, 8, 12, 16, 24, 32, 48]) {
          const isActive = currentGap === val;
          const isNeg = val < 0;
          const chip = document.createElement("button");
          chip.style.cssText = `
            padding:2px 6px;border:1px solid ${isActive ? "#4f46e5" : isNeg ? "#553322" : "#333"};border-radius:3px;
            background:${isActive ? "#4f46e520" : isNeg ? "#352020" : "#252525"};color:${isActive ? "#818cf8" : isNeg ? "#ff8855" : "#666"};
            cursor:pointer;font-size:9px;line-height:1;transition:all 0.15s;
          `;
          chip.textContent = String(val);
          chip.title = `Set gap to ${val}px${isNeg ? " (overlap)" : ""}`;
          chip.addEventListener("click", () => {
            editor.engine.push_undo();
            editor.engine.set_layout_gap(BigInt(id), val);
            editor.requestRender();
            refresh(ids);
          });
          gapOnlyRow.appendChild(chip);
        }
        presetsWrap.appendChild(gapOnlyRow);

        // Padding-only presets row
        const padOnlyLabel = document.createElement("div");
        padOnlyLabel.style.cssText = "font-size:9px;color:#444;margin-top:5px;margin-bottom:3px;";
        padOnlyLabel.textContent = "Padding only";
        presetsWrap.appendChild(padOnlyLabel);

        const padOnlyRow = document.createElement("div");
        padOnlyRow.style.cssText = "display:flex;gap:3px;flex-wrap:wrap;";

        for (const val of [0, 4, 8, 12, 16, 24, 32, 48]) {
          const isActive = currentPadUniform === val;
          const chip = document.createElement("button");
          chip.style.cssText = `
            padding:2px 6px;border:1px solid ${isActive ? "#4f46e5" : "#333"};border-radius:3px;
            background:${isActive ? "#4f46e520" : "#252525"};color:${isActive ? "#818cf8" : "#666"};
            cursor:pointer;font-size:9px;line-height:1;transition:all 0.15s;
          `;
          chip.textContent = String(val);
          chip.title = `Set all padding to ${val}px`;
          chip.addEventListener("click", () => {
            editor.engine.push_undo();
            editor.engine.set_layout_padding(BigInt(id), val, val, val, val);
            editor.requestRender();
            refresh(ids);
          });
          padOnlyRow.appendChild(chip);
        }
        presetsWrap.appendChild(padOnlyRow);

        layoutSection.appendChild(presetsWrap);
      }

      container.appendChild(layoutSection);

      // === Responsive Breakpoints Section ===
      if (hasLayout) {
        const bpJson = editor.engine.get_breakpoints(BigInt(id));
        const breakpoints: any[] = JSON.parse(bpJson || "[]");
        const activeBp = editor.engine.get_active_breakpoint(BigInt(id));

        const bpSection = document.createElement("div");
        bpSection.className = "prop-section";

        const bpTitleRow = document.createElement("div");
        bpTitleRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;";
        const bpTitle = document.createElement("div");
        bpTitle.className = "prop-section-title";
        bpTitle.style.marginBottom = "0";
        bpTitle.textContent = "Breakpoints";
        bpTitleRow.appendChild(bpTitle);

        const addBpBtn = document.createElement("button");
        addBpBtn.style.cssText = "background:none;border:1px solid #4f46e5;border-radius:4px;color:#4f46e5;cursor:pointer;width:22px;height:22px;display:flex;align-items:center;justify-content:center;padding:0;";
        addBpBtn.innerHTML = icons.plus.replace(/width="\d+"/, 'width="12"').replace(/height="\d+"/, 'height="12"');
        addBpBtn.title = "Add breakpoint";
        addBpBtn.addEventListener("click", () => {
          ensureUndo();
          const defaultBp = JSON.stringify({
            label: breakpoints.length === 0 ? "Mobile" : breakpoints.length === 1 ? "Tablet" : `BP ${breakpoints.length + 1}`,
            max_width: breakpoints.length === 0 ? 375 : breakpoints.length === 1 ? 768 : 1024,
            direction: layout.direction === "Row" ? "Column" : null,
            gap: null,
            padding: null,
            align_items: null,
            justify_content: null,
            wrap: null,
            grid_columns: null,
            layout_mode: null,
            hidden_children: [],
          });
          editor.engine.add_breakpoint(BigInt(id), defaultBp);
          editor.requestRender();
          refresh(ids);
        });
        bpTitleRow.appendChild(addBpBtn);

        // Preset button
        if (breakpoints.length === 0) {
          const presetBtn = document.createElement("button");
          presetBtn.style.cssText = "background:none;border:1px solid #4f46e5;border-radius:4px;color:#4f46e5;cursor:pointer;padding:2px 8px;font-size:10px;white-space:nowrap;";
          presetBtn.textContent = "Preset";
          presetBtn.title = "Add Mobile/Tablet/Desktop breakpoints";
          presetBtn.addEventListener("click", () => {
            ensureUndo();
            editor.engine.set_breakpoints_preset(BigInt(id), "default");
            editor.requestRender();
            refresh(ids);
          });
          bpTitleRow.appendChild(presetBtn);
        }

        bpSection.appendChild(bpTitleRow);

        if (breakpoints.length > 0) {
          const infoText = document.createElement("div");
          infoText.style.cssText = "font-size:10px;color:#666;margin-bottom:8px;";
          infoText.textContent = "Layout overrides when frame width ≤ max_width";
          bpSection.appendChild(infoText);
        }

        breakpoints.forEach((bp: any, idx: number) => {
          const isActive = activeBp === idx;
          const bpCard = document.createElement("div");
          bpCard.style.cssText = `background:${isActive ? "#1a1a3a" : "#1e1e1e"};border:1px solid ${isActive ? "#4f46e5" : "#333"};border-radius:8px;padding:8px;margin-bottom:6px;position:relative;`;

          // Header: label + max_width + delete
          const hdr = document.createElement("div");
          hdr.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:6px;";

          if (isActive) {
            const badge = document.createElement("span");
            badge.style.cssText = "background:#4f46e5;color:white;border-radius:4px;padding:1px 5px;font-size:9px;font-weight:600;";
            badge.textContent = "ACTIVE";
            hdr.appendChild(badge);
          }

          const labelInput = document.createElement("input");
          labelInput.type = "text";
          labelInput.value = bp.label || "";
          labelInput.style.cssText = "flex:1;background:#2a2a2a;border:1px solid #3a3a3a;border-radius:4px;padding:3px 6px;color:#ccc;font-size:11px;outline:none;";
          labelInput.addEventListener("change", () => {
            ensureUndo();
            bp.label = labelInput.value;
            editor.engine.update_breakpoint(BigInt(id), idx, JSON.stringify(bp));
            editor.requestRender();
          });
          hdr.appendChild(labelInput);

          const mwLabel = document.createElement("span");
          mwLabel.style.cssText = "color:#666;font-size:10px;white-space:nowrap;";
          mwLabel.textContent = "≤";
          hdr.appendChild(mwLabel);

          const mwInput = document.createElement("input");
          mwInput.type = "number";
          mwInput.value = String(bp.max_width || 375);
          mwInput.style.cssText = "width:55px;background:#2a2a2a;border:1px solid #3a3a3a;border-radius:4px;padding:3px 4px;color:#ccc;font-size:11px;text-align:right;outline:none;";
          mwInput.addEventListener("change", () => {
            ensureUndo();
            bp.max_width = parseFloat(mwInput.value) || 375;
            editor.engine.update_breakpoint(BigInt(id), idx, JSON.stringify(bp));
            editor.requestRender();
            refresh(ids);
          });
          hdr.appendChild(mwInput);

          const mwUnit = document.createElement("span");
          mwUnit.style.cssText = "color:#666;font-size:10px;";
          mwUnit.textContent = "px";
          hdr.appendChild(mwUnit);

          const delBtn = document.createElement("button");
          delBtn.style.cssText = "background:none;border:none;color:#666;cursor:pointer;padding:2px;";
          delBtn.innerHTML = icons.x.replace(/width="\d+"/, 'width="12"').replace(/height="\d+"/, 'height="12"');
          delBtn.addEventListener("click", () => {
            ensureUndo();
            editor.engine.remove_breakpoint(BigInt(id), idx);
            editor.requestRender();
            refresh(ids);
          });
          hdr.appendChild(delBtn);
          bpCard.appendChild(hdr);

          // Override controls
          const overrideRow = document.createElement("div");
          overrideRow.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;";

          // Direction override
          const dirSel = document.createElement("select");
          dirSel.style.cssText = "flex:1;min-width:70px;background:#2a2a2a;border:1px solid #3a3a3a;border-radius:4px;padding:3px;color:#ccc;font-size:10px;";
          dirSel.innerHTML = `<option value="">Dir: inherit</option><option value="Row">Row</option><option value="Column">Column</option>`;
          dirSel.value = bp.direction || "";
          dirSel.addEventListener("change", () => {
            ensureUndo();
            bp.direction = dirSel.value || null;
            editor.engine.update_breakpoint(BigInt(id), idx, JSON.stringify(bp));
            editor.requestRender();
            refresh(ids);
          });
          overrideRow.appendChild(dirSel);

          // Gap override
          const gapWrap = document.createElement("div");
          gapWrap.style.cssText = "display:flex;align-items:center;gap:2px;";
          const gapLbl = document.createElement("span");
          gapLbl.style.cssText = "color:#666;font-size:10px;";
          gapLbl.textContent = "Gap";
          gapWrap.appendChild(gapLbl);
          const gapInp = document.createElement("input");
          gapInp.type = "number";
          gapInp.value = bp.gap != null ? String(bp.gap) : "";
          gapInp.placeholder = "—";
          gapInp.style.cssText = "width:40px;background:#2a2a2a;border:1px solid #3a3a3a;border-radius:4px;padding:3px;color:#ccc;font-size:10px;text-align:right;outline:none;";
          gapInp.addEventListener("change", () => {
            ensureUndo();
            bp.gap = gapInp.value !== "" ? parseFloat(gapInp.value) : null;
            editor.engine.update_breakpoint(BigInt(id), idx, JSON.stringify(bp));
            editor.requestRender();
            refresh(ids);
          });
          gapWrap.appendChild(gapInp);
          overrideRow.appendChild(gapWrap);

          // Wrap override
          const wrapSel = document.createElement("select");
          wrapSel.style.cssText = "min-width:60px;background:#2a2a2a;border:1px solid #3a3a3a;border-radius:4px;padding:3px;color:#ccc;font-size:10px;";
          wrapSel.innerHTML = `<option value="">Wrap: inherit</option><option value="NoWrap">No Wrap</option><option value="Wrap">Wrap</option>`;
          wrapSel.value = bp.wrap || "";
          wrapSel.addEventListener("change", () => {
            ensureUndo();
            bp.wrap = wrapSel.value || null;
            editor.engine.update_breakpoint(BigInt(id), idx, JSON.stringify(bp));
            editor.requestRender();
            refresh(ids);
          });
          overrideRow.appendChild(wrapSel);

          bpCard.appendChild(overrideRow);
          bpSection.appendChild(bpCard);
        });

        container.appendChild(bpSection);
      }

      // Quick button to open multi-viewport breakpoints preview
      if (kindStr === "Frame" || kindStr === "Section") {
        const previewBtn = document.createElement("button");
        previewBtn.style.cssText = "width:100%;padding:6px 0;background:#4f46e5;border:none;border-radius:6px;color:#fff;font-size:12px;cursor:pointer;margin-bottom:8px;";
        previewBtn.textContent = "⬛ Breakpoints Preview (⌘⇧B)";
        previewBtn.addEventListener("click", () => editor.openBreakpointsPreview());
        container.appendChild(previewBtn);
      }
    }

    // === Layout Grid Section (Frame only) ===
    if (kindStr === "Frame") {
      const gridsJson = editor.engine.get_layout_grids(BigInt(id));
      const grids: any[] = JSON.parse(gridsJson || "[]");
      const gridSection = createSection("Layout Grid");

      grids.forEach((grid: any, idx: number) => {
        const gridWrap = document.createElement("div");
        gridWrap.style.cssText = "background:#1e1e1e;border-radius:6px;padding:8px;margin-bottom:6px;position:relative;";

        // Header row
        const hdr = document.createElement("div");
        hdr.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:6px;";

        const visBtn = document.createElement("button");
        visBtn.style.cssText = `width:18px;height:18px;border:1px solid ${grid.visible ? "#4f46e5" : "#444"};border-radius:4px;background:${grid.visible ? "#4f46e520" : "#2a2a2a"};cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;`;
        visBtn.innerHTML = grid.visible ? icons.eye.replace(/width="\d+"/, 'width="12"').replace(/height="\d+"/, 'height="12"') : icons.eyeOff.replace(/width="\d+"/, 'width="12"').replace(/height="\d+"/, 'height="12"');
        visBtn.addEventListener("click", () => {
          ensureUndo();
          editor.engine.set_layout_grid_visible(BigInt(id), idx, !grid.visible);
          editor.requestRender();
          refresh(ids);
        });
        hdr.appendChild(visBtn);

        const typeSelect = document.createElement("select");
        typeSelect.className = "prop-input";
        typeSelect.style.cssText = "flex:1;font-size:11px;";
        for (const t of ["Columns", "Rows", "Grid"]) {
          const opt = document.createElement("option");
          opt.value = t;
          opt.textContent = t;
          if (grid.grid_type === t) opt.selected = true;
          typeSelect.appendChild(opt);
        }
        typeSelect.addEventListener("change", () => {
          ensureUndo();
          grid.grid_type = typeSelect.value;
          editor.engine.update_layout_grid(BigInt(id), idx, JSON.stringify(grid));
          editor.requestRender();
          refresh(ids);
        });
        hdr.appendChild(typeSelect);

        const delBtn = document.createElement("button");
        delBtn.style.cssText = "background:transparent;border:none;color:#555;cursor:pointer;font-size:11px;padding:2px 4px;border-radius:4px;";
        delBtn.textContent = "✕";
        delBtn.addEventListener("click", () => {
          ensureUndo();
          editor.engine.remove_layout_grid(BigInt(id), idx);
          editor.requestRender();
          refresh(ids);
        });
        hdr.appendChild(delBtn);
        gridWrap.appendChild(hdr);

        // Properties row
        const propsRow = document.createElement("div");
        propsRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:4px;";

        const makeGridInput = (lbl: string, val: number, key: string) => {
          const w = document.createElement("div");
          w.style.cssText = "display:flex;flex-direction:column;gap:2px;";
          const l = document.createElement("span");
          l.style.cssText = "font-size:9px;color:#555;text-align:center;";
          l.textContent = lbl;
          w.appendChild(l);
          const inp = document.createElement("input");
          inp.className = "prop-input";
          inp.style.cssText = "text-align:center;font-size:11px;padding:3px 2px;";
          inp.type = "number";
          inp.value = String(val);
          inp.addEventListener("change", () => {
            ensureUndo();
            (grid as any)[key] = parseFloat(inp.value) || 0;
            editor.engine.update_layout_grid(BigInt(id), idx, JSON.stringify(grid));
            editor.requestRender();
          });
          w.appendChild(inp);
          return w;
        };

        if (grid.grid_type === "Grid") {
          propsRow.style.gridTemplateColumns = "1fr 1fr";
          const curSize = typeof grid.size_mode === "object" && grid.size_mode.Fixed ? grid.size_mode.Fixed : 10;
          const sizeWrap = document.createElement("div");
          sizeWrap.style.cssText = "display:flex;flex-direction:column;gap:2px;";
          const sLbl = document.createElement("span");
          sLbl.style.cssText = "font-size:9px;color:#555;text-align:center;";
          sLbl.textContent = "Size";
          sizeWrap.appendChild(sLbl);
          const sInp = document.createElement("input");
          sInp.className = "prop-input";
          sInp.style.cssText = "text-align:center;font-size:11px;padding:3px 2px;";
          sInp.type = "number";
          sInp.value = String(curSize);
          sInp.addEventListener("change", () => {
            ensureUndo();
            grid.size_mode = { Fixed: parseFloat(sInp.value) || 10 };
            editor.engine.update_layout_grid(BigInt(id), idx, JSON.stringify(grid));
            editor.requestRender();
          });
          sizeWrap.appendChild(sInp);
          propsRow.appendChild(sizeWrap);
          propsRow.appendChild(makeGridInput("Count", grid.count || 10, "count"));
        } else {
          propsRow.appendChild(makeGridInput("Count", grid.count || 12, "count"));
          propsRow.appendChild(makeGridInput("Gutter", grid.gutter || 20, "gutter"));
          propsRow.appendChild(makeGridInput("Margin", grid.margin || 0, "margin"));
          // Size mode: Auto or Fixed
          const curFixed = typeof grid.size_mode === "object" && grid.size_mode.Fixed ? grid.size_mode.Fixed : 0;
          const sWrap = document.createElement("div");
          sWrap.style.cssText = "display:flex;flex-direction:column;gap:2px;";
          const sL = document.createElement("span");
          sL.style.cssText = "font-size:9px;color:#555;text-align:center;";
          sL.textContent = curFixed > 0 ? "Width" : "Auto";
          sWrap.appendChild(sL);
          const sI = document.createElement("input");
          sI.className = "prop-input";
          sI.style.cssText = "text-align:center;font-size:11px;padding:3px 2px;";
          sI.type = "number";
          sI.value = curFixed > 0 ? String(curFixed) : "";
          sI.placeholder = "Auto";
          sI.addEventListener("change", () => {
            ensureUndo();
            const v = parseFloat(sI.value);
            grid.size_mode = v > 0 ? { Fixed: v } : "Auto";
            editor.engine.update_layout_grid(BigInt(id), idx, JSON.stringify(grid));
            editor.requestRender();
          });
          sWrap.appendChild(sI);
          propsRow.appendChild(sWrap);
        }
        gridWrap.appendChild(propsRow);

        // Color row
        const colorRow = document.createElement("div");
        colorRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-top:6px;";
        const colorLabel = document.createElement("span");
        colorLabel.style.cssText = "font-size:10px;color:#666;";
        colorLabel.textContent = "Color";
        colorRow.appendChild(colorLabel);
        const colorInput = document.createElement("input");
        colorInput.type = "color";
        colorInput.value = `#${((1 << 24) + ((grid.color?.r || 255) << 16) + ((grid.color?.g || 0) << 8) + (grid.color?.b || 0)).toString(16).slice(1)}`;
        colorInput.style.cssText = "width:28px;height:20px;border:1px solid #444;border-radius:4px;padding:0;cursor:pointer;background:transparent;";
        colorInput.addEventListener("change", () => {
          ensureUndo();
          const hex = colorInput.value;
          grid.color = { r: parseInt(hex.slice(1,3),16), g: parseInt(hex.slice(3,5),16), b: parseInt(hex.slice(5,7),16), a: grid.color?.a ?? 0.1 };
          editor.engine.update_layout_grid(BigInt(id), idx, JSON.stringify(grid));
          editor.requestRender();
        });
        colorRow.appendChild(colorInput);
        const alphaInput = document.createElement("input");
        alphaInput.className = "prop-input";
        alphaInput.style.cssText = "width:48px;flex:none;font-size:11px;text-align:center;";
        alphaInput.value = Math.round((grid.color?.a ?? 0.1) * 100) + "%";
        alphaInput.addEventListener("change", () => {
          ensureUndo();
          grid.color.a = Math.max(0, Math.min(1, parseInt(alphaInput.value) / 100));
          editor.engine.update_layout_grid(BigInt(id), idx, JSON.stringify(grid));
          editor.requestRender();
        });
        colorRow.appendChild(alphaInput);
        gridWrap.appendChild(colorRow);

        gridSection.appendChild(gridWrap);
      });

      const addGridBtn = document.createElement("button");
      addGridBtn.className = "prop-add-btn";
      addGridBtn.textContent = "+ Add layout grid";
      addGridBtn.addEventListener("click", () => {
        ensureUndo();
        editor.engine.add_layout_grid(BigInt(id), JSON.stringify({
          grid_type: "Columns",
          count: 12,
          size_mode: "Auto",
          gutter: 20,
          margin: 20,
          color: { r: 255, g: 0, b: 0, a: 0.1 },
          visible: true,
        }));
        editor.requestRender();
        refresh(ids);
      });
      gridSection.appendChild(addGridBtn);
      container.appendChild(gridSection);
    }

    // === Frame Background Pattern Section (Frame/Section only) ===
    if (["Frame", "Section"].includes(kindStr || "")) {
      const fbpSection = document.createElement("div");
      fbpSection.className = "prop-section";
      const fbpTitle = document.createElement("div");
      fbpTitle.className = "prop-section-title";
      fbpTitle.textContent = "Background Pattern";
      fbpSection.appendChild(fbpTitle);

      let fbpData: any = null;
      try {
        const raw = editor.engine.get_frame_background_pattern(BigInt(id));
        if (raw && raw !== "null") fbpData = JSON.parse(raw);
      } catch {}

      const inputCss2 = "width:100%;padding:4px 6px;font-size:11px;border:1px solid #444;border-radius:4px;background:#2a2a2a;color:#ccc;box-sizing:border-box;";
      const labelCss2 = "font-size:10px;color:#666;margin-bottom:2px;";

      // Enable toggle
      const enableRow = document.createElement("div");
      enableRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:8px;";
      const enableCb = document.createElement("input");
      enableCb.type = "checkbox";
      enableCb.checked = !!fbpData;
      enableCb.style.cssText = "accent-color:#4f46e5;";
      const enableLabel = document.createElement("span");
      enableLabel.style.cssText = "font-size:11px;color:#999;";
      enableLabel.textContent = fbpData ? "Custom pattern" : "Use scene default";
      enableRow.appendChild(enableCb);
      enableRow.appendChild(enableLabel);
      fbpSection.appendChild(enableRow);

      enableCb.onchange = () => {
        ensureUndo();
        if (enableCb.checked) {
          editor.engine.set_frame_background_pattern(BigInt(id), "dots", "ffffff", 20, 0.15, 1.5);
        } else {
          editor.engine.clear_frame_background_pattern(BigInt(id));
        }
        editor.requestRender();
        refresh(ids);
      };

      if (fbpData) {
        // Pattern type
        const patRow = document.createElement("div");
        patRow.style.cssText = "margin-bottom:6px;";
        const patLabel = document.createElement("div");
        patLabel.style.cssText = labelCss2;
        patLabel.textContent = "Type";
        patRow.appendChild(patLabel);
        const patSelect = document.createElement("select");
        patSelect.style.cssText = inputCss2;
        for (const opt of ["dots", "grid", "lines", "cross", "none"]) {
          const o = document.createElement("option");
          o.value = opt; o.textContent = opt.charAt(0).toUpperCase() + opt.slice(1);
          if (opt === fbpData.pattern) o.selected = true;
          patSelect.appendChild(o);
        }
        patSelect.onchange = () => {
          ensureUndo();
          editor.engine.set_frame_background_pattern(BigInt(id), patSelect.value, fbpData.color, fbpData.spacing, fbpData.opacity, fbpData.size);
          editor.requestRender();
          refresh(ids);
        };
        patRow.appendChild(patSelect);
        fbpSection.appendChild(patRow);

        // Color + visibility row
        const colorRow = document.createElement("div");
        colorRow.style.cssText = "display:flex;gap:6px;align-items:center;margin-bottom:6px;";
        const colorLabel = document.createElement("div");
        colorLabel.style.cssText = labelCss2 + "flex-shrink:0;";
        colorLabel.textContent = "Color";
        colorRow.appendChild(colorLabel);
        const colorSwatch = document.createElement("input");
        colorSwatch.type = "color";
        colorSwatch.value = "#" + fbpData.color;
        colorSwatch.style.cssText = "width:24px;height:24px;border:1px solid #555;border-radius:4px;padding:0;cursor:pointer;background:none;";
        colorSwatch.oninput = () => {
          ensureUndo();
          const c = colorSwatch.value.replace("#", "");
          editor.engine.set_frame_background_pattern(BigInt(id), fbpData.pattern, c, fbpData.spacing, fbpData.opacity, fbpData.size);
          editor.requestRender();
        };
        colorRow.appendChild(colorSwatch);

        const visCb = document.createElement("input");
        visCb.type = "checkbox";
        visCb.checked = fbpData.visible !== false;
        visCb.style.cssText = "accent-color:#4f46e5;margin-left:auto;";
        visCb.title = "Visible";
        visCb.onchange = () => {
          ensureUndo();
          editor.engine.set_frame_background_pattern_visible(BigInt(id), visCb.checked);
          editor.requestRender();
        };
        const visLabel = document.createElement("span");
        visLabel.style.cssText = "font-size:10px;color:#666;";
        visLabel.textContent = "👁";
        colorRow.appendChild(visLabel);
        colorRow.appendChild(visCb);
        fbpSection.appendChild(colorRow);

        // Spacing / Opacity / Size
        const numRow2 = document.createElement("div");
        numRow2.style.cssText = "display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;";
        for (const [label, val, key, min, max, step] of [
          ["Spacing", fbpData.spacing, "spacing", 5, 200, 1],
          ["Opacity", fbpData.opacity, "opacity", 0, 1, 0.01],
          ["Size", fbpData.size, "size", 0.5, 10, 0.5],
        ] as const) {
          const col = document.createElement("div");
          const lbl = document.createElement("div");
          lbl.style.cssText = labelCss2; lbl.textContent = label;
          col.appendChild(lbl);
          const inp = document.createElement("input");
          inp.type = "number"; inp.value = String(val); inp.min = String(min); inp.max = String(max); inp.step = String(step);
          inp.style.cssText = inputCss2;
          inp.onchange = () => {
            ensureUndo();
            const newVal = parseFloat(inp.value) || val;
            const s = key === "spacing" ? newVal : fbpData.spacing;
            const o = key === "opacity" ? newVal : fbpData.opacity;
            const sz = key === "size" ? newVal : fbpData.size;
            editor.engine.set_frame_background_pattern(BigInt(id), fbpData.pattern, fbpData.color, s, o, sz);
            editor.requestRender();
            refresh(ids);
          };
          col.appendChild(inp);
          numRow2.appendChild(col);
        }
        fbpSection.appendChild(numRow2);
      }

      container.appendChild(fbpSection);
    }

    // === Notes Section ===
    const notes: any[] = JSON.parse(editor.engine.get_notes(BigInt(id)));
    const notesSection = document.createElement("div");
    notesSection.className = "prop-section";
    const notesTitle = document.createElement("div");
    notesTitle.className = "prop-section-title";
    notesTitle.textContent = `Notes (${notes.length})`;
    notesSection.appendChild(notesTitle);

    notes.forEach((note, idx) => {
      const noteEl = document.createElement("div");
      noteEl.style.cssText = "background:#1e1e1e;border-radius:6px;padding:8px;margin-bottom:6px;position:relative;";

      if (note.tags?.length) {
        const tagsEl = document.createElement("div");
        tagsEl.style.cssText = "display:flex;gap:4px;margin-bottom:4px;flex-wrap:wrap;";
        note.tags.forEach((t: string) => {
          const tag = document.createElement("span");
          tag.style.cssText = "font-size:10px;background:#333;color:#aaa;padding:1px 6px;border-radius:4px;";
          tag.textContent = t;
          tagsEl.appendChild(tag);
        });
        noteEl.appendChild(tagsEl);
      }

      const textarea = document.createElement("textarea");
      textarea.style.cssText = "width:100%;min-height:60px;background:transparent;border:none;color:#ccc;font-size:11px;font-family:monospace;resize:vertical;outline:none;line-height:1.5;";
      textarea.value = note.content;
      textarea.addEventListener("blur", () => {
        editor.engine.update_note(BigInt(id), idx, textarea.value);
      });
      textarea.addEventListener("keydown", (e) => e.stopPropagation());
      noteEl.appendChild(textarea);

      const removeBtn = document.createElement("button");
      removeBtn.style.cssText = "position:absolute;top:4px;right:4px;background:transparent;border:none;color:#555;cursor:pointer;font-size:11px;padding:2px 4px;border-radius:4px;";
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", () => {
        editor.engine.remove_note(BigInt(id), idx);
        editor.requestRender();
        refresh(ids);
      });
      noteEl.appendChild(removeBtn);

      notesSection.appendChild(noteEl);
    });

    const addNoteBtn = document.createElement("button");
    addNoteBtn.className = "prop-add-btn";
    addNoteBtn.textContent = "+ Add note";
    addNoteBtn.addEventListener("click", () => {
      editor.engine.add_note(BigInt(id), "", "[]");
      editor.requestRender();
      refresh(ids);
    });
    notesSection.appendChild(addNoteBtn);

    container.appendChild(notesSection);

    // === Token Bindings Section ===
    container.appendChild(createTokenBindingSection(editor, ids[0], () => { editor.render(); refresh(ids); }));

    // === Style Transfer Section ===
    container.appendChild(createStyleTransferSection(editor, () => refresh(ids)));

    // === Export Presets Section (all node types) ===
    container.appendChild(createExportPresetsSection(editor, ids[0], () => refresh(ids)));
  }

  // Show initial empty state
  refresh([]);
  editor.onSelection(refresh);
}

// --- Helpers ---

/** Get children IDs for a component source node */
function self_getChildrenForComponent(editor: Editor, nodeId: number): number[] {
  try {
    const nodeJson = editor.engine.get_node_json(BigInt(nodeId));
    const node = JSON.parse(nodeJson);
    return (node.children || []).map((c: any) => Number(c));
  } catch { return []; }
}

function getKindLabel(kind: unknown): string {
  if (typeof kind === "string") {
    const map: Record<string, string> = { Rect: "Rectangle", Ellipse: "Ellipse", Frame: "Frame", Group: "Group", Section: "Section", Slice: "Slice" };
    return map[kind] ?? kind;
  }
  if (typeof kind === "object" && kind !== null) {
    if ("Text" in kind) return "Text";
    if ("Image" in kind) return "Image";
    if ("Instance" in kind) return "Instance";
    if ("Slot" in kind) return "Slot";
    if ("Path" in kind) return "Path";
    if ("VectorNetwork" in kind) return "Vector Network";
    if ("Star" in kind) return "Star";
    if ("Polygon" in kind) return "Polygon";
    if ("Table" in kind) return "Table";
    if ("Video" in kind) return "Video";
  }
  return "Unknown";
}

function createSection(title: string): HTMLElement {
  const section = document.createElement("div");
  section.className = "prop-section";
  const titleEl = document.createElement("div");
  titleEl.className = "prop-section-title";
  titleEl.textContent = title;
  section.appendChild(titleEl);
  return section;
}

function createLabeledInput(label: string, value: string, onChange: (v: string) => void): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "display:flex;align-items:center;gap:4px;min-width:0;";
  const lbl = document.createElement("span");
  lbl.style.cssText = "font-size:10px;color:#666;width:16px;flex-shrink:0;text-align:center;display:flex;align-items:center;justify-content:center;";
  if (label.startsWith("<svg")) {
    lbl.innerHTML = label.replace(/width="\d+"/, 'width="14"').replace(/height="\d+"/, 'height="14"');
  } else {
    lbl.textContent = label;
  }
  const input = document.createElement("input");
  input.className = "prop-input";
  input.style.cssText = "min-width:0;flex:1;";
  input.value = value;
  input.addEventListener("change", () => onChange(input.value));
  wrapper.appendChild(lbl);
  wrapper.appendChild(input);
  return wrapper;
}

function createColorRow(
  color: { r: number; g: number; b: number; a: number },
  onChange: (r: number, g: number, b: number, a: number) => void,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "prop-row";

  const swatch = document.createElement("input");
  swatch.type = "color";
  swatch.value = rgbToHex(color.r, color.g, color.b);
  swatch.className = "prop-color-swatch";

  const hexInput = document.createElement("input");
  hexInput.className = "prop-input";
  hexInput.value = swatch.value.toUpperCase();
  hexInput.style.flex = "1";

  const alphaInput = document.createElement("input");
  alphaInput.className = "prop-input";
  alphaInput.style.cssText = "width:48px;flex:none;";
  alphaInput.value = Math.round(color.a * 100) + "%";

  const update = () => {
    const [r, g, b] = hexToRgb(swatch.value);
    const a = parseInt(alphaInput.value) / 100;
    onChange(r, g, b, isNaN(a) ? 1 : a);
    hexInput.value = swatch.value.toUpperCase();
  };

  swatch.addEventListener("input", update);
  hexInput.addEventListener("change", () => {
    swatch.value = hexInput.value;
    update();
  });
  alphaInput.addEventListener("change", update);

  row.appendChild(swatch);
  row.appendChild(hexInput);
  row.appendChild(alphaInput);
  return row;
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// =============================================
// Resource Links (Dev resource linker)
// =============================================

const RESOURCE_LINK_TYPES = ["GitHub", "Storybook", "Jira", "Figma", "Custom"] as const;

const RESOURCE_ICONS: Record<string, string> = {
  GitHub: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>`,
  Storybook: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  Jira: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>`,
  Figma: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z"/><path d="M12 2h3.5a3.5 3.5 0 1 1 0 7H12V2z"/><path d="M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z"/><path d="M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z"/><path d="M5 12.5A3.5 3.5 0 0 1 8.5 9H12v7H8.5A3.5 3.5 0 0 1 5 12.5z"/></svg>`,
  Custom: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
};

function createResourceLinksSection(container: HTMLElement, editor: Editor, nodeId: number, onRefresh: () => void) {
  const bid = BigInt(nodeId);
  const linksJson = (editor.engine as any).get_resource_links(bid);
  const links: { url: string; label: string; link_type: string }[] = JSON.parse(linksJson || "[]");

  const inputStyle = "width:100%;padding:3px 6px;background:#1e1e1e;border:1px solid #444;border-radius:3px;color:#ccc;font-size:11px;outline:none;";
  const btnSmall = "padding:2px 6px;font-size:10px;border:1px solid #444;border-radius:3px;background:#2a2a2a;color:#ccc;cursor:pointer;";

  // List existing links
  links.forEach((link, i) => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:4px;margin-bottom:4px;padding:4px 6px;background:#1e1e2e;border-radius:4px;";

    // Icon
    const iconSpan = document.createElement("span");
    iconSpan.style.cssText = "flex-shrink:0;color:#7c9aff;display:flex;align-items:center;cursor:pointer;";
    iconSpan.innerHTML = RESOURCE_ICONS[link.link_type] || RESOURCE_ICONS.Custom;
    iconSpan.title = `Open ${link.label || link.url}`;
    iconSpan.onclick = () => window.open(link.url, "_blank");
    row.appendChild(iconSpan);

    // Label / URL
    const labelSpan = document.createElement("span");
    labelSpan.style.cssText = "flex:1;font-size:11px;color:#aac;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;";
    labelSpan.textContent = link.label || link.url;
    labelSpan.title = link.url;
    labelSpan.onclick = () => window.open(link.url, "_blank");
    row.appendChild(labelSpan);

    // Type badge
    const badge = document.createElement("span");
    badge.style.cssText = "font-size:9px;color:#666;flex-shrink:0;";
    badge.textContent = link.link_type;
    row.appendChild(badge);

    // Remove button
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "✕";
    removeBtn.style.cssText = btnSmall + "color:#f66;border-color:#533;padding:1px 4px;";
    removeBtn.onclick = () => {
      editor.engine.push_undo();
      (editor.engine as any).remove_resource_link(bid, i);
      onRefresh();
    };
    row.appendChild(removeBtn);
    container.appendChild(row);
  });

  // Add new link form
  const addRow = document.createElement("div");
  addRow.style.cssText = "display:flex;flex-direction:column;gap:3px;margin-top:4px;";

  const urlRow = document.createElement("div");
  urlRow.style.cssText = "display:flex;gap:3px;";
  const urlInput = document.createElement("input");
  urlInput.placeholder = "https://...";
  urlInput.style.cssText = inputStyle + "flex:1;";
  urlRow.appendChild(urlInput);

  const typeSelect = document.createElement("select");
  typeSelect.style.cssText = inputStyle + "width:auto;flex-shrink:0;";
  RESOURCE_LINK_TYPES.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    typeSelect.appendChild(opt);
  });
  // Auto-detect type from URL
  urlInput.addEventListener("input", () => {
    const u = urlInput.value.toLowerCase();
    if (u.includes("github.com")) typeSelect.value = "GitHub";
    else if (u.includes("storybook") || u.includes("chromatic")) typeSelect.value = "Storybook";
    else if (u.includes("jira") || u.includes("atlassian")) typeSelect.value = "Jira";
    else if (u.includes("figma.com")) typeSelect.value = "Figma";
  });
  urlRow.appendChild(typeSelect);
  addRow.appendChild(urlRow);

  const labelRow = document.createElement("div");
  labelRow.style.cssText = "display:flex;gap:3px;";
  const labelInput = document.createElement("input");
  labelInput.placeholder = "Label (optional)";
  labelInput.style.cssText = inputStyle + "flex:1;";
  labelRow.appendChild(labelInput);

  const addBtn = document.createElement("button");
  addBtn.textContent = "+ Add";
  addBtn.style.cssText = btnSmall;
  addBtn.onclick = () => {
    const url = urlInput.value.trim();
    if (!url) return;
    editor.engine.push_undo();
    (editor.engine as any).add_resource_link(bid, url, labelInput.value.trim(), typeSelect.value);
    onRefresh();
  };
  labelRow.appendChild(addBtn);
  addRow.appendChild(labelRow);
  container.appendChild(addRow);
}
