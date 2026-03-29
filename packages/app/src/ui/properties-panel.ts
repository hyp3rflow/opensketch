import type { Editor } from "../editor";
import { icons } from "./icons";
import { createExportPresetsSection } from "./export-presets";
import { openComponentSwapDialog } from "./component-search";
import { renderStyleVersioningSection } from "./style-versioning";
import { createEasingEditor } from "./easing-editor";
import { createTokenThemeSwitcher, createTokenBindingSection } from "./token-panel";

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
        <span style="font-size:11px;">Select an element</span>`;

      // Design Token Theme Switcher
      container.appendChild(createTokenThemeSwitcher(editor, () => refresh(ids)));

      // Styles Library section
      const libSection = document.createElement("div");
      libSection.style.cssText = "width:100%;padding:20px 16px;margin-top:40px;border-top:1px solid #333;";
      const libTitle = document.createElement("div");
      libTitle.style.cssText = "font-size:11px;font-weight:600;color:#888;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;";
      libTitle.textContent = "Styles Library";
      libSection.appendChild(libTitle);

      const btnStyle = "padding:6px 12px;font-size:11px;border:1px solid #444;border-radius:4px;background:#2a2a2a;color:#ccc;cursor:pointer;flex:1;text-align:center;";
      const btnRow = document.createElement("div");
      btnRow.style.cssText = "display:flex;gap:6px;";

      const exportBtn = document.createElement("button");
      exportBtn.textContent = "Export Styles";
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
      importBtn.textContent = "Import Styles";
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

      btnRow.appendChild(exportBtn);
      btnRow.appendChild(importBtn);
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
      tokensTitle.textContent = "Design Tokens";
      tokensSection.appendChild(tokensTitle);

      const tokenFormats = [
        { label: "W3C DTCG", key: "w3c" },
        { label: "Style Dictionary", key: "style-dictionary" },
        { label: "Tailwind", key: "tailwind" },
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
        applyBtn.textContent = "Apply — Wrap in Frame with Auto-Layout";
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
      compLabel.textContent = "MAIN COMPONENT";
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
      goBtn.textContent = "Go to →";
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
      swapBtn.textContent = "Swap";
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
              editor.engine.set_instance_variant(BigInt(id), JSON.stringify(newKey));
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
              editor.engine.set_instance_variant(BigInt(id), JSON.stringify(newKey));
              editor.requestRender();
              refresh([id]);
            });
            propRow.appendChild(select);
          }

          variantSection.appendChild(propRow);
        }

        header.appendChild(variantSection);
      }

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
          resetAllBtn.textContent = "Reset All";
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
    }

    const nameInput = document.createElement("input");
    nameInput.className = "prop-input";
    nameInput.value = node.name;
    nameInput.style.cssText = "width:100%;font-size:13px;font-weight:500;";
    nameInput.addEventListener("change", () => {
      editor.engine.set_node_name(id, nameInput.value);
    });
    header.appendChild(nameInput);
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
        editor.requestRender();
      }));
    }
    sizeSection.appendChild(rotRow);
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
          absLabel.textContent = "Absolute position";
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
        for (const t of ["Solid", "LinearGradient", "RadialGradient", "Pattern", "NoiseFill", "DotPattern", "CrosshatchFill", "GradientMesh"]) {
          const opt = document.createElement("option");
          opt.value = t;
          opt.textContent = t === "LinearGradient" ? "Linear" : t === "RadialGradient" ? "Radial" : t === "NoiseFill" ? "Noise" : t === "DotPattern" ? "Dots" : t === "CrosshatchFill" ? "Crosshatch" : t === "GradientMesh" ? "Mesh" : t;
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
          scaleLabel.textContent = "Scale";
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
          rotLabel.textContent = "Rot";
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
        } else {
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

        const label = document.createElement("span");
        label.style.cssText = "font-size:11px;color:#888;flex:1;";
        label.textContent = `Shadow ${idx + 1}`;
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
      }

      container.appendChild(section3d);
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
        for (const a of ["navigate-to", "back", "scroll-to", "open-overlay", "close-overlay", "swap-variant"]) {
          const opt = document.createElement("option");
          opt.value = a;
          opt.textContent = a.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
          const actMap: Record<string, string> = { NavigateTo: "navigate-to", Back: "back", ScrollTo: "scroll-to", OpenOverlay: "open-overlay", CloseOverlay: "close-overlay", SwapVariant: "swap-variant" };
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

        // Show/hide variant row based on action
        actSelect.addEventListener("change", () => {
          variantRow.style.display = actSelect.value === "swap-variant" ? "flex" : "none";
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

      container.appendChild(textSection);
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

      // Arrows
      const arrowRow = document.createElement("div");
      arrowRow.style.cssText = "display:flex;gap:12px;align-items:center;margin-bottom:4px;";
      for (const [label, key, current] of [["Start arrow", "start", info.start_arrow], ["End arrow", "end", info.end_arrow]] as const) {
        const lbl = document.createElement("label");
        lbl.style.cssText = "display:flex;align-items:center;gap:4px;font-size:11px;color:#ccc;cursor:pointer;";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = current as boolean;
        cb.addEventListener("change", () => {
          editor.engine.push_undo();
          const sa = key === "start" ? cb.checked : info.start_arrow;
          const ea = key === "end" ? cb.checked : info.end_arrow;
          editor.engine.set_connector_arrows(BigInt(id), sa, ea);
          editor.requestRender();
          refresh();
        });
        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(label));
        arrowRow.appendChild(lbl);
      }
      connSection.appendChild(arrowRow);
      container.appendChild(connSection);
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

    // === Slice export section ===
    if (node.kind === "Slice") {
      const sliceSection = createSection("Export");
      const scaleRow = document.createElement("div");
      scaleRow.style.cssText = "display:flex;gap:6px;align-items:center;margin-bottom:8px;";
      const scaleLabel = document.createElement("span");
      scaleLabel.style.cssText = "font-size:11px;color:#999;";
      scaleLabel.textContent = "Scale:";
      scaleRow.appendChild(scaleLabel);
      const scaleSelect = document.createElement("select");
      scaleSelect.style.cssText = "background:#2a2a2a;color:#ccc;border:1px solid #444;border-radius:4px;padding:2px 6px;font-size:11px;";
      for (const s of [1, 2, 3, 4]) {
        const opt = document.createElement("option");
        opt.value = String(s); opt.textContent = `${s}x`; if (s === 2) opt.selected = true;
        scaleSelect.appendChild(opt);
      }
      scaleRow.appendChild(scaleSelect);
      sliceSection.appendChild(scaleRow);

      const exportBtn = document.createElement("button");
      exportBtn.style.cssText = "width:100%;padding:6px;background:#36b37e;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;";
      exportBtn.textContent = "Export PNG";
      exportBtn.addEventListener("click", () => {
        editor.exportSlice(id, parseInt(scaleSelect.value) || 2);
      });
      sliceSection.appendChild(exportBtn);
      container.appendChild(sliceSection);
    }

    // === Overflow Section (Frame/Section only) ===
    const kindStr = typeof node.kind === "string" ? node.kind : Object.keys(node.kind)[0];
    if (["Frame", "Section"].includes(kindStr || "")) {
      const overflowSection = document.createElement("div");
      overflowSection.className = "prop-section";
      const overflowTitle = document.createElement("div");
      overflowTitle.className = "prop-section-title";
      overflowTitle.textContent = "Overflow";
      overflowSection.appendChild(overflowTitle);

      const overflowRow = document.createElement("div");
      overflowRow.style.cssText = "display:flex;gap:4px;";

      const currentOverflow = editor.engine.get_overflow(BigInt(id));
      for (const mode of ["visible", "hidden", "scroll"] as const) {
        const btn = document.createElement("button");
        const isActive = currentOverflow === mode;
        btn.style.cssText = `
          flex:1;padding:4px 0;border:1px solid ${isActive ? "#4f46e5" : "#444"};
          border-radius:4px;background:${isActive ? "rgba(79,70,229,0.15)" : "transparent"};
          color:${isActive ? "#818cf8" : "#aaa"};cursor:pointer;font-size:11px;text-transform:capitalize;
        `;
        btn.textContent = mode;
        btn.addEventListener("click", () => {
          editor.engine.push_undo();
          editor.engine.set_overflow(BigInt(id), mode);
          if (mode !== "scroll") {
            editor.engine.set_scroll_offset(BigInt(id), 0, 0);
          }
          editor.requestRender();
          refresh(ids);
        });
        overflowRow.appendChild(btn);
      }
      overflowSection.appendChild(overflowRow);

      // Show scroll offset if scroll mode
      if (currentOverflow === "scroll") {
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
      }

      panel.appendChild(overflowSection);
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

    // === Export Presets Section (all node types) ===
    container.appendChild(createExportPresetsSection(editor, ids[0], () => refresh(ids)));
  }

  // Show initial empty state
  refresh([]);
  editor.onSelection(refresh);
}

// --- Helpers ---

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
