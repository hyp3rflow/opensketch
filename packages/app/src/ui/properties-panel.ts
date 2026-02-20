import type { Editor } from "../editor";
import { icons } from "./icons";

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
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;padding-top:60px;color:#555;">
          <span style="opacity:0.4;margin-bottom:8px;">${icons.cursor}</span>
          <span style="font-size:11px;">Select an element</span>
        </div>`;
      return;
    }

    if (ids.length > 1) {
      container.innerHTML = `
        <div style="padding:12px;">
          <div class="prop-section-title">${ids.length} elements selected</div>
        </div>`;
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
    container.appendChild(sizeSection);

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
    container.appendChild(appSection);

    // --- Fill ---
    if (node.fill) {
      const fillSection = createSection("Fill");
      fillSection.appendChild(createColorRow(
        node.fill.color,
        (r, g, b, a) => {
          editor.engine.set_fill_color(id, r, g, b, a);
          editor.requestRender();
        }
      ));
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

    // --- Text-specific ---
    if (typeof node.kind === "object" && node.kind.Text) {
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

      // Font family
      const fonts = [
        "Inter", "system-ui", "Arial", "Helvetica", "Georgia", "Times New Roman",
        "Courier New", "Menlo", "Monaco", "SF Pro Display", "SF Mono",
        "Roboto", "Noto Sans KR", "Pretendard",
      ];
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
        editor.engine.set_font_family(id, familySelect.value);
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
      container.appendChild(textSection);
    }

    // === Layout Section (Frame/Instance/Group) ===
    const kindStr = typeof node.kind === "string" ? node.kind : Object.keys(node.kind)[0];
    if (["Frame", "Instance", "Group", "Slot"].includes(kindStr || "")) {
      const layoutJson = editor.engine.get_layout(BigInt(id));
      const layout = JSON.parse(layoutJson);

      const layoutSection = document.createElement("div");
      layoutSection.className = "prop-section";
      const layoutTitle = document.createElement("div");
      layoutTitle.className = "prop-section-title";
      layoutTitle.textContent = "Layout";
      layoutSection.appendChild(layoutTitle);

      // Mode
      const modeRow = document.createElement("div");
      modeRow.className = "prop-row";
      const modeLabel = document.createElement("span");
      modeLabel.className = "prop-label";
      modeLabel.style.width = "50px";
      modeLabel.textContent = "Mode";
      modeRow.appendChild(modeLabel);
      const modeSelect = document.createElement("select");
      modeSelect.className = "prop-input";
      ["None", "Flex", "Grid"].forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m.toLowerCase();
        opt.textContent = m;
        opt.selected = layout.mode?.toLowerCase() === m.toLowerCase() || (m === "None" && layout.mode === "None");
        modeSelect.appendChild(opt);
      });
      modeSelect.value = (layout.mode || "None").toLowerCase();
      modeSelect.addEventListener("change", () => {
        editor.engine.set_layout_mode(BigInt(id), modeSelect.value);
        editor.requestRender();
        refresh(ids);
      });
      modeRow.appendChild(modeSelect);
      layoutSection.appendChild(modeRow);

      if (layout.mode !== "None") {
        // Direction
        if (layout.mode === "Flex") {
          const dirRow = document.createElement("div");
          dirRow.className = "prop-row";
          const dirLabel = document.createElement("span");
          dirLabel.className = "prop-label";
          dirLabel.style.width = "50px";
          dirLabel.textContent = "Dir";
          dirRow.appendChild(dirLabel);
          const dirSelect = document.createElement("select");
          dirSelect.className = "prop-input";
          ["Row", "Column"].forEach((d) => {
            const opt = document.createElement("option");
            opt.value = d.toLowerCase();
            opt.textContent = d;
            opt.selected = (layout.direction || "Row").toLowerCase() === d.toLowerCase();
            dirSelect.appendChild(opt);
          });
          dirSelect.value = (layout.direction || "Row").toLowerCase();
          dirSelect.addEventListener("change", () => {
            editor.engine.set_flex_direction(BigInt(id), dirSelect.value);
            editor.requestRender();
          });
          dirRow.appendChild(dirSelect);
          layoutSection.appendChild(dirRow);
        }

        // Align
        const alignRow = document.createElement("div");
        alignRow.className = "prop-row";
        const alignLabel = document.createElement("span");
        alignLabel.className = "prop-label";
        alignLabel.style.width = "50px";
        alignLabel.textContent = "Align";
        alignRow.appendChild(alignLabel);
        const alignSelect = document.createElement("select");
        alignSelect.className = "prop-input";
        ["Start", "Center", "End", "Stretch"].forEach((a) => {
          const opt = document.createElement("option");
          opt.value = a.toLowerCase();
          opt.textContent = a;
          opt.selected = (layout.align_items || "Start").toLowerCase() === a.toLowerCase();
          alignSelect.appendChild(opt);
        });
        alignSelect.value = (layout.align_items || "Start").toLowerCase();
        alignSelect.addEventListener("change", () => {
          editor.engine.set_align_items(BigInt(id), alignSelect.value);
          editor.requestRender();
        });
        alignRow.appendChild(alignSelect);
        layoutSection.appendChild(alignRow);

        // Justify
        const justRow = document.createElement("div");
        justRow.className = "prop-row";
        const justLabel = document.createElement("span");
        justLabel.className = "prop-label";
        justLabel.style.width = "50px";
        justLabel.textContent = "Just";
        justRow.appendChild(justLabel);
        const justSelect = document.createElement("select");
        justSelect.className = "prop-input";
        ["Start", "Center", "End", "SpaceBetween", "SpaceAround", "SpaceEvenly"].forEach((j) => {
          const opt = document.createElement("option");
          opt.value = j.replace("Space", "space-").toLowerCase().replace("space-b", "space-b").replace("space-a", "space-a").replace("space-e", "space-e");
          // Simpler mapping
          const val = j === "SpaceBetween" ? "space-between" : j === "SpaceAround" ? "space-around" : j === "SpaceEvenly" ? "space-evenly" : j.toLowerCase();
          opt.value = val;
          opt.textContent = j;
          const current = (layout.justify_content || "Start");
          opt.selected = current.toLowerCase() === j.toLowerCase() || current === j;
          justSelect.appendChild(opt);
        });
        const jcVal = layout.justify_content || "Start";
        justSelect.value = jcVal === "SpaceBetween" ? "space-between" : jcVal === "SpaceAround" ? "space-around" : jcVal === "SpaceEvenly" ? "space-evenly" : jcVal.toLowerCase();
        justSelect.addEventListener("change", () => {
          editor.engine.set_justify_content(BigInt(id), justSelect.value);
          editor.requestRender();
        });
        justRow.appendChild(justSelect);
        layoutSection.appendChild(justRow);

        // Gap
        const gapRow = document.createElement("div");
        gapRow.className = "prop-row";
        const gapLabel = document.createElement("span");
        gapLabel.className = "prop-label";
        gapLabel.style.width = "50px";
        gapLabel.textContent = "Gap";
        gapRow.appendChild(gapLabel);
        const gapInput = document.createElement("input");
        gapInput.className = "prop-input";
        gapInput.value = String(layout.gap || 0);
        gapInput.addEventListener("change", () => {
          editor.engine.set_layout_gap(BigInt(id), parseFloat(gapInput.value) || 0);
          editor.requestRender();
        });
        gapRow.appendChild(gapInput);
        layoutSection.appendChild(gapRow);

        // Padding (single value for simplicity)
        const padRow = document.createElement("div");
        padRow.className = "prop-row";
        const padLabel = document.createElement("span");
        padLabel.className = "prop-label";
        padLabel.style.width = "50px";
        padLabel.textContent = "Pad";
        padRow.appendChild(padLabel);
        const padInput = document.createElement("input");
        padInput.className = "prop-input";
        padInput.placeholder = "t r b l";
        padInput.value = `${layout.padding_top || 0} ${layout.padding_right || 0} ${layout.padding_bottom || 0} ${layout.padding_left || 0}`;
        padInput.addEventListener("change", () => {
          const parts = padInput.value.trim().split(/\s+/).map(Number);
          const t = parts[0] || 0, r = parts[1] ?? t, b = parts[2] ?? t, l = parts[3] ?? r;
          editor.engine.set_layout_padding(BigInt(id), t, r, b, l);
          editor.requestRender();
        });
        padRow.appendChild(padInput);
        layoutSection.appendChild(padRow);

        // Grid columns
        if (layout.mode === "Grid") {
          const colRow = document.createElement("div");
          colRow.className = "prop-row";
          const colLabel = document.createElement("span");
          colLabel.className = "prop-label";
          colLabel.style.width = "50px";
          colLabel.textContent = "Cols";
          colRow.appendChild(colLabel);
          const colInput = document.createElement("input");
          colInput.className = "prop-input";
          colInput.value = String(layout.grid_columns || 2);
          colInput.addEventListener("change", () => {
            editor.engine.set_grid_columns(BigInt(id), parseInt(colInput.value) || 2);
            editor.requestRender();
          });
          colRow.appendChild(colInput);
          layoutSection.appendChild(colRow);
        }
      }

      container.appendChild(layoutSection);
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
  wrapper.style.cssText = "display:flex;align-items:center;gap:4px;";
  const lbl = document.createElement("span");
  lbl.style.cssText = "font-size:10px;color:#666;width:16px;text-align:center;display:flex;align-items:center;justify-content:center;";
  if (label.startsWith("<svg")) {
    lbl.innerHTML = label.replace(/width="\d+"/, 'width="14"').replace(/height="\d+"/, 'height="14"');
  } else {
    lbl.textContent = label;
  }
  const input = document.createElement("input");
  input.className = "prop-input";
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
