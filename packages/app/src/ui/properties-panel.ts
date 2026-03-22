import type { Editor } from "../editor";
import { icons } from "./icons";

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

      wrap.appendChild(alignSection);
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
      header.appendChild(compCard);
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

    // --- Fill ---
    if (node.fill) {
      const fillSection = createSection("Fill");

      // Get fill info from engine
      const fillInfoJson = editor.engine.get_fill_info(id);
      const fillInfo = JSON.parse(fillInfoJson || "null");
      const fillType = fillInfo?.type || "Solid";

      // Fill mode selector: Solid / Linear / Radial
      const modeRow = document.createElement("div");
      modeRow.style.cssText = "display:flex;gap:2px;margin-bottom:8px;";
      (["Solid", "Linear", "Radial"] as const).forEach((mode) => {
        const btn = document.createElement("button");
        const isActive = (mode === "Solid" && fillType === "Solid") ||
                         (mode === "Linear" && fillType === "LinearGradient") ||
                         (mode === "Radial" && fillType === "RadialGradient");
        btn.textContent = mode;
        btn.style.cssText = `
          flex:1;padding:4px 0;border:1px solid ${isActive ? "#4f46e5" : "#444"};border-radius:4px;
          background:${isActive ? "#4f46e520" : "#2a2a2a"};color:${isActive ? "#818cf8" : "#999"};
          cursor:pointer;font-size:10px;transition:all 0.15s;
        `;
        btn.addEventListener("click", () => {
          ensureUndo();
          if (mode === "Solid") {
            const c = fillInfo?.color || (fillInfo?.stops?.[0]) || { r: 200, g: 200, b: 200, a: 1 };
            editor.engine.set_fill_color(id, c.r, c.g, c.b, c.a);
          } else if (mode === "Linear") {
            const stops = fillInfo?.stops || [
              { offset: 0, r: 79, g: 70, b: 229, a: 1 },
              { offset: 1, r: 16, g: 185, b: 129, a: 1 },
            ];
            editor.engine.set_fill_linear_gradient(id, 0, 0, 1, 1, JSON.stringify(stops));
          } else {
            const stops = fillInfo?.stops || [
              { offset: 0, r: 79, g: 70, b: 229, a: 1 },
              { offset: 1, r: 16, g: 185, b: 129, a: 1 },
            ];
            editor.engine.set_fill_radial_gradient(id, 0.5, 0.5, 0.5, JSON.stringify(stops));
          }
          editor.requestRender();
          refresh(ids);
        });
        modeRow.appendChild(btn);
      });
      fillSection.appendChild(modeRow);

      if (fillType === "Solid") {
        // Solid color picker
        const color = fillInfo?.color || { r: 200, g: 200, b: 200, a: 1 };
        fillSection.appendChild(createColorRow(color, (r, g, b, a) => {
          editor.engine.set_fill_color(id, r, g, b, a);
          editor.requestRender();
        }));
      } else {
        // Gradient stops editor
        const stops: any[] = fillInfo?.stops || [];
        stops.forEach((stop: any, idx: number) => {
          const stopRow = document.createElement("div");
          stopRow.style.cssText = "display:flex;align-items:center;gap:4px;margin-bottom:4px;";

          // Offset input
          const offsetInput = document.createElement("input");
          offsetInput.className = "prop-input";
          offsetInput.style.cssText = "width:40px;flex:none;text-align:center;font-size:11px;";
          offsetInput.value = Math.round(stop.offset * 100) + "%";
          offsetInput.addEventListener("change", () => {
            const newOffset = parseInt(offsetInput.value) / 100;
            stops[idx].offset = Math.max(0, Math.min(1, isNaN(newOffset) ? stop.offset : newOffset));
            applyGradient();
          });
          stopRow.appendChild(offsetInput);

          // Color for this stop
          stopRow.appendChild(createColorRow(
            { r: stop.r, g: stop.g, b: stop.b, a: stop.a },
            (r, g, b, a) => {
              stops[idx] = { ...stops[idx], r, g, b, a };
              applyGradient();
            }
          ));

          // Remove stop button (only if > 2 stops)
          if (stops.length > 2) {
            const delBtn = document.createElement("button");
            delBtn.style.cssText = "background:none;border:none;color:#555;cursor:pointer;font-size:11px;padding:2px;";
            delBtn.textContent = "✕";
            delBtn.addEventListener("click", () => {
              stops.splice(idx, 1);
              applyGradient();
              refresh(ids);
            });
            stopRow.appendChild(delBtn);
          }

          fillSection.appendChild(stopRow);
        });

        // Add stop button
        const addStopBtn = document.createElement("button");
        addStopBtn.className = "prop-add-btn";
        addStopBtn.textContent = "+ Add stop";
        addStopBtn.addEventListener("click", () => {
          ensureUndo();
          stops.push({ offset: 0.5, r: 255, g: 255, b: 255, a: 1 });
          applyGradient();
          refresh(ids);
        });
        fillSection.appendChild(addStopBtn);

        // Gradient parameters (direction for linear, center/radius for radial)
        if (fillType === "LinearGradient") {
          const dirRow = document.createElement("div");
          dirRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:4px;margin-top:6px;";
          const params = [
            { label: "X1", key: "start_x", val: fillInfo.start_x },
            { label: "Y1", key: "start_y", val: fillInfo.start_y },
            { label: "X2", key: "end_x", val: fillInfo.end_x },
            { label: "Y2", key: "end_y", val: fillInfo.end_y },
          ];
          const paramValues: any = { start_x: fillInfo.start_x, start_y: fillInfo.start_y, end_x: fillInfo.end_x, end_y: fillInfo.end_y };
          params.forEach(({ label, key, val }) => {
            dirRow.appendChild(createLabeledInput(label, String(Math.round(val * 100) / 100), (v) => {
              ensureUndo();
              paramValues[key] = parseFloat(v) || 0;
              editor.engine.set_fill_linear_gradient(id, paramValues.start_x, paramValues.start_y, paramValues.end_x, paramValues.end_y, JSON.stringify(stops));
              editor.requestRender();
            }));
          });
          fillSection.appendChild(dirRow);
        } else if (fillType === "RadialGradient") {
          const radRow = document.createElement("div");
          radRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-top:6px;";
          const paramValues: any = { center_x: fillInfo.center_x, center_y: fillInfo.center_y, radius: fillInfo.radius };
          [
            { label: "CX", key: "center_x", val: fillInfo.center_x },
            { label: "CY", key: "center_y", val: fillInfo.center_y },
            { label: "R", key: "radius", val: fillInfo.radius },
          ].forEach(({ label, key, val }) => {
            radRow.appendChild(createLabeledInput(label, String(Math.round(val * 100) / 100), (v) => {
              ensureUndo();
              paramValues[key] = parseFloat(v) || 0;
              editor.engine.set_fill_radial_gradient(id, paramValues.center_x, paramValues.center_y, paramValues.radius, JSON.stringify(stops));
              editor.requestRender();
            }));
          });
          fillSection.appendChild(radRow);
        }

        function applyGradient() {
          ensureUndo();
          if (fillType === "LinearGradient") {
            editor.engine.set_fill_linear_gradient(id, fillInfo.start_x, fillInfo.start_y, fillInfo.end_x, fillInfo.end_y, JSON.stringify(stops));
          } else {
            editor.engine.set_fill_radial_gradient(id, fillInfo.center_x, fillInfo.center_y, fillInfo.radius, JSON.stringify(stops));
          }
          editor.requestRender();
        }
      }

      container.appendChild(fillSection);
    }

    // --- Stroke ---
    {
      const strokeSection = createSection("Stroke");
      if (node.stroke) {
        strokeSection.appendChild(createColorRow(
          node.stroke.color,
          (r, g, b, a) => {
            editor.engine.set_stroke(id, r, g, b, a, node.stroke.width);
            editor.requestRender();
          }
        ));
        const widthRow = document.createElement("div");
        widthRow.className = "prop-row";
        widthRow.style.marginTop = "6px";
        const wLabel = document.createElement("span");
        wLabel.className = "prop-label";
        wLabel.innerHTML = icons.strokeWidth;
        widthRow.appendChild(wLabel);
        const wInput = document.createElement("input");
        wInput.className = "prop-input";
        wInput.value = node.stroke.width.toFixed(0);
        wInput.addEventListener("change", () => {
          const w = parseFloat(wInput.value) || 1;
          editor.engine.set_stroke(id, node.stroke.color.r, node.stroke.color.g, node.stroke.color.b, node.stroke.color.a, w);
          editor.requestRender();
        });
        widthRow.appendChild(wInput);
        strokeSection.appendChild(widthRow);

        // Dash pattern
        const dashRow = document.createElement("div");
        dashRow.className = "prop-row";
        dashRow.style.marginTop = "4px";
        const dashLabel = document.createElement("span");
        dashLabel.className = "prop-label";
        dashLabel.textContent = "Dash";
        dashLabel.title = "Dash pattern (comma-separated, e.g. 10,5)";
        dashRow.appendChild(dashLabel);
        const dashInput = document.createElement("input");
        dashInput.className = "prop-input";
        dashInput.placeholder = "e.g. 10,5";
        dashInput.value = (node.stroke.dash_array && node.stroke.dash_array.length > 0) ? node.stroke.dash_array.join(",") : "";
        dashInput.addEventListener("change", () => {
          editor.engine.set_stroke_dash(id, dashInput.value, 0);
          editor.requestRender();
        });
        dashRow.appendChild(dashInput);
        strokeSection.appendChild(dashRow);

        // Line cap
        const capRow = document.createElement("div");
        capRow.className = "prop-row";
        capRow.style.marginTop = "4px";
        const capLabel = document.createElement("span");
        capLabel.className = "prop-label";
        capLabel.textContent = "Cap";
        capRow.appendChild(capLabel);
        const capSelect = document.createElement("select");
        capSelect.className = "prop-input";
        for (const v of ["Butt", "Round", "Square"]) {
          const opt = document.createElement("option");
          opt.value = v.toLowerCase();
          opt.textContent = v;
          if ((node.stroke.line_cap || "Butt") === v) opt.selected = true;
          capSelect.appendChild(opt);
        }
        capSelect.addEventListener("change", () => {
          editor.engine.set_stroke_cap(id, capSelect.value);
          editor.requestRender();
        });
        capRow.appendChild(capSelect);
        strokeSection.appendChild(capRow);

        // Line join
        const joinRow = document.createElement("div");
        joinRow.className = "prop-row";
        joinRow.style.marginTop = "4px";
        const joinLabel = document.createElement("span");
        joinLabel.className = "prop-label";
        joinLabel.textContent = "Join";
        joinRow.appendChild(joinLabel);
        const joinSelect = document.createElement("select");
        joinSelect.className = "prop-input";
        for (const v of ["Miter", "Round", "Bevel"]) {
          const opt = document.createElement("option");
          opt.value = v.toLowerCase();
          opt.textContent = v;
          if ((node.stroke.line_join || "Miter") === v) opt.selected = true;
          joinSelect.appendChild(opt);
        }
        joinSelect.addEventListener("change", () => {
          editor.engine.set_stroke_join(id, joinSelect.value);
          editor.requestRender();
        });
        joinRow.appendChild(joinSelect);
        strokeSection.appendChild(joinRow);
      } else {
        const addBtn = document.createElement("button");
        addBtn.className = "prop-add-btn";
        addBtn.textContent = "+ Add stroke";
        addBtn.addEventListener("click", () => {
          editor.engine.set_stroke(id, 0, 0, 0, 1.0, 1);
          editor.requestRender();
          refresh(ids);
        });
        strokeSection.appendChild(addBtn);
      }
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
        for (const t of ["click", "hover", "press", "drag"]) {
          const opt = document.createElement("option");
          opt.value = t;
          opt.textContent = t.charAt(0).toUpperCase() + t.slice(1);
          const trigMap: Record<string, string> = { OnClick: "click", OnHover: "hover", OnPress: "press", OnDrag: "drag" };
          if ((trigMap[inter.trigger] || "click") === t) opt.selected = true;
          trigSelect.appendChild(opt);
        }
        trigSelect.addEventListener("change", () => {
          ensureUndo();
          editor.engine.remove_interaction(id, idx);
          editor.engine.add_interaction(
            id, trigSelect.value, actSelect.value,
            BigInt(inter.target_node_id || 0), BigInt(inter.target_page_id || 0),
            transSelect.value, parseInt(durInput.value) || 300
          );
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
        for (const a of ["navigate-to", "back", "scroll-to", "open-overlay", "close-overlay"]) {
          const opt = document.createElement("option");
          opt.value = a;
          opt.textContent = a.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
          const actMap: Record<string, string> = { NavigateTo: "navigate-to", Back: "back", ScrollTo: "scroll-to", OpenOverlay: "open-overlay", CloseOverlay: "close-overlay" };
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
          editor.engine.add_interaction(
            id, trigSelect.value, actSelect.value,
            BigInt(parseInt(targetInput.value) || 0), BigInt(inter.target_page_id || 0),
            transSelect.value, parseInt(durInput.value) || 300
          );
          editor.requestRender();
          refresh(ids);
        });
        targetRow.appendChild(targetInput);
        interEl.appendChild(targetRow);

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
            transSelect.value, parseInt(durInput.value) || 300
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

        interSection.appendChild(interEl);
      });

      // Add interaction button
      const addInterBtn = document.createElement("button");
      addInterBtn.className = "prop-add-btn";
      addInterBtn.textContent = "+ Add interaction";
      addInterBtn.addEventListener("click", () => {
        ensureUndo();
        editor.engine.add_interaction(id, "click", "navigate-to", BigInt(0), BigInt(0), "instant", 300);
        editor.requestRender();
        refresh(ids);
      });
      interSection.appendChild(addInterBtn);

      container.appendChild(interSection);
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
      container.appendChild(pathSection);
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

    // === Auto Layout Section (Frame/Instance/Group) ===
    const kindStr = typeof node.kind === "string" ? node.kind : Object.keys(node.kind)[0];
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
          const isWrap = layout.wrap === true;
          const wrapBtn = document.createElement("button");
          wrapBtn.style.cssText = `
            padding:5px 8px;border:1px solid ${isWrap ? "#4f46e5" : "#3a3a3a"};
            border-radius:6px;background:${isWrap ? "#4f46e520" : "#2a2a2a"};
            color:${isWrap ? "#818cf8" : "#666"};cursor:pointer;display:flex;
            align-items:center;justify-content:center;transition:all 0.15s;
          `;
          wrapBtn.innerHTML = icons.wrap.replace(/width="\d+"/, 'width="14"').replace(/height="\d+"/, 'height="14"');
          wrapBtn.title = "Wrap";
          wrapBtn.addEventListener("click", () => {
            editor.engine.push_undo();
            // Toggle wrap via layout mode re-set (TODO: add dedicated wrap API)
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
  }

  // Show initial empty state
  refresh([]);
  editor.onSelection(refresh);
}

// --- Helpers ---

function getKindLabel(kind: unknown): string {
  if (typeof kind === "string") {
    const map: Record<string, string> = { Rect: "Rectangle", Ellipse: "Ellipse", Frame: "Frame", Group: "Group" };
    return map[kind] ?? kind;
  }
  if (typeof kind === "object" && kind !== null) {
    if ("Text" in kind) return "Text";
    if ("Image" in kind) return "Image";
    if ("Instance" in kind) return "Instance";
    if ("Slot" in kind) return "Slot";
    if ("Path" in kind) return "Path";
    if ("Star" in kind) return "Star";
    if ("Polygon" in kind) return "Polygon";
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
