import type { Editor } from "../editor";
import { icons } from "./icons";

type CodeLang = "css" | "tailwind" | "swiftui" | "kotlin" | "svg";

type HandoffStateCapture = { hover: boolean; pressed: boolean; focus: boolean };
type StateCapturePreset = { id: string; name: string; state: HandoffStateCapture; createdAt: number };

const HANDOFF_STATE_PRESETS_KEY = "opensketch-handoff-state-presets-v1";

/**
 * Handoff panel — design specs, multi-language code generation, asset export, spacing overlay.
 * Replaces the old Inspect panel with a comprehensive developer handoff experience.
 */
export function setupHandoffPanel(container: HTMLElement, editor: Editor) {
  let currentLang: CodeLang = "css";
  let currentIds: number[] = [];
  let spacingOverlayEnabled = false;
  let handoffStateCapture: HandoffStateCapture = loadSelectedStateCapture(editor);

  function refresh(ids: number[]) {
    currentIds = ids;
    (editor as any).setHandoffStateCapture?.(handoffStateCapture);
    container.innerHTML = "";
    if (ids.length === 0) {
      renderChecklist(container, editor);
      return;
    }
    if (ids.length > 1) {
      renderRedlineSpecMode(container, editor, ids);
      return;
    }

    const bid = BigInt(ids[0]!);
    const nodeJson = editor.engine.get_node_json(bid);
    if (!nodeJson) return;
    const node = JSON.parse(nodeJson);

    const fillInfo = JSON.parse(editor.engine.get_fill_info(bid));
    const strokeInfo = JSON.parse(editor.engine.get_stroke_info(bid));
    const shadowsJson = editor.engine.get_shadows(bid);
    const shadows = shadowsJson ? JSON.parse(shadowsJson) : [];
    const blur = editor.engine.get_blur(bid);
    const blendMode = editor.engine.get_blend_mode(bid);
    const layoutJson = editor.engine.get_layout(bid);
    const layout = layoutJson ? JSON.parse(layoutJson) : null;

    let bitmapFilter: any = null;
    try {
      const bfJson = (editor.engine as any).get_bitmap_filter?.(bid);
      if (bfJson) bitmapFilter = JSON.parse(bfJson);
    } catch {}

    const wrap = document.createElement("div");
    wrap.style.cssText = "padding:12px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;";

    // ── Node header ──
    const header = document.createElement("div");
    header.style.cssText = "font-size:10px;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;";
    header.textContent = getKindLabel(node.kind) + (node.name ? ` — ${node.name}` : "");
    wrap.appendChild(header);

    // ── Design Spec Summary ──
    wrap.appendChild(buildSpecSummary(node, fillInfo, strokeInfo, layout));

    // ── Spacing Overlay Toggle ──
    wrap.appendChild(buildSpacingToggle());
    wrap.appendChild(buildStateCapturePresets());

    // ── Code Language Tabs ──
    const tabBar = document.createElement("div");
    tabBar.style.cssText = "display:flex;gap:2px;background:#1a1a1a;border-radius:6px;padding:2px;";
    const langs: { key: CodeLang; label: string }[] = [
      { key: "css", label: "CSS" },
      { key: "tailwind", label: "Tailwind" },
      { key: "swiftui", label: "SwiftUI" },
      { key: "kotlin", label: "Kotlin" },
      { key: "svg", label: "SVG" },
    ];
    for (const lang of langs) {
      const tab = document.createElement("button");
      tab.textContent = lang.label;
      const isActive = currentLang === lang.key;
      tab.style.cssText = `
        flex:1;padding:5px 6px;border:none;border-radius:4px;font-size:10px;font-weight:500;cursor:pointer;transition:all 0.15s;
        background:${isActive ? "#333" : "transparent"};color:${isActive ? "#e0e0e0" : "#777"};
      `;
      tab.addEventListener("click", () => { currentLang = lang.key; refresh(currentIds); });
      tabBar.appendChild(tab);
    }
    wrap.appendChild(tabBar);

    // ── Code Generation ──
    const ctx = { node, fill: fillInfo, stroke: strokeInfo, shadows, blur, blendMode, layout, bitmapFilter };
    let code = "";
    switch (currentLang) {
      case "css": code = generateCSS(ctx); break;
      case "tailwind": code = generateTailwind(ctx); break;
      case "swiftui": code = generateSwiftUI(ctx); break;
      case "kotlin": code = generateKotlin(ctx); break;
      case "svg": code = generateSVGProps(ctx) || "// No SVG-specific attributes"; break;
    }
    wrap.appendChild(createCodeSection(langs.find(l => l.key === currentLang)!.label, code));

    // ── Asset Download ──
    const assetLabel = document.createElement("div");
    assetLabel.textContent = "Export Asset";
    assetLabel.style.cssText = "color:#aaa;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;";
    wrap.appendChild(assetLabel);
    const assetSection = document.createElement("div");
    assetSection.style.cssText = "display:flex;gap:8px;";
    assetSection.appendChild(createDownloadBtn("↓ PNG @1x", () => downloadAsset(editor, ids[0]!, "png", 1, handoffStateCapture)));
    assetSection.appendChild(createDownloadBtn("↓ PNG @2x", () => downloadAsset(editor, ids[0]!, "png", 2, handoffStateCapture)));
    assetSection.appendChild(createDownloadBtn("↓ SVG", () => downloadAsset(editor, ids[0]!, "svg", 1, handoffStateCapture)));
    wrap.appendChild(assetSection);

    // ── Design Tokens ──
    const tokensSection = document.createElement("div");
    tokensSection.style.cssText = "margin-top:4px;";
    const tokensLabel = document.createElement("div");
    tokensLabel.textContent = "Design Tokens";
    tokensLabel.style.cssText = "color:#aaa;font-size:11px;font-weight:600;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;";
    tokensSection.appendChild(tokensLabel);
    const tokensBtns = document.createElement("div");
    tokensBtns.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;";
    for (const fmt of [
      { label: "W3C DTCG", key: "w3c" },
      { label: "Style Dictionary", key: "style-dictionary" },
      { label: "Tailwind Config", key: "tailwind" },
    ]) {
      tokensBtns.appendChild(createDownloadBtn(`↓ ${fmt.label}`, () => editor.downloadDesignTokens(fmt.key)));
    }
    tokensSection.appendChild(tokensBtns);
    wrap.appendChild(tokensSection);

    container.appendChild(wrap);
  }

  // ── Spec Summary Section ──
  function buildSpecSummary(node: any, fill: any, stroke: any, layout: any): HTMLElement {
    const section = document.createElement("div");
    section.style.cssText = "background:#1a1a1a;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;";

    const title = document.createElement("div");
    title.textContent = "Design Specs";
    title.style.cssText = "font-size:11px;font-weight:600;color:#aaa;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;";
    section.appendChild(title);

    // Dimensions
    addSpecRow(section, "Size", `${Math.round(node.width)} × ${Math.round(node.height)} px`);
    addSpecRow(section, "Position", `X: ${Math.round(node.x)}  Y: ${Math.round(node.y)}`);

    if (node.rotation && node.rotation !== 0) addSpecRow(section, "Rotation", `${node.rotation.toFixed(1)}°`);
    if (node.opacity !== undefined && node.opacity < 1) addSpecRow(section, "Opacity", `${Math.round(node.opacity * 100)}%`);
    if (node.corner_radius && node.corner_radius > 0) addSpecRow(section, "Radius", `${node.corner_radius}px`);

    // Fill color
    if (fill && (fill.type === "Solid" || fill.color)) {
      const c = fill.color || fill;
      const hex = colorToHex(c);
      const r = Math.round((c.r ?? 0) * 255), g = Math.round((c.g ?? 0) * 255), b = Math.round((c.b ?? 0) * 255);
      const swatch = `<span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${hex};border:1px solid #444;vertical-align:middle;margin-right:6px;"></span>`;
      addSpecRow(section, "Fill", `${swatch}<span style="font-family:monospace;">${hex.toUpperCase()}</span> <span style="color:#666;font-size:10px;">rgb(${r},${g},${b})</span>`, true);
    }

    // Stroke
    if (stroke && stroke.color && stroke.width) {
      const hex = colorToHex(stroke.color);
      const swatch = `<span style="display:inline-block;width:12px;height:12px;border-radius:3px;border:2px solid ${hex};vertical-align:middle;margin-right:6px;"></span>`;
      addSpecRow(section, "Stroke", `${swatch}<span style="font-family:monospace;">${hex.toUpperCase()}</span> ${stroke.width}px`, true);
    }

    // Text properties
    const kind = node.kind;
    const isText = kind && (kind.Text !== undefined || (typeof kind === "string" && kind === "Text"));
    if (isText) {
      if (node.font_family) addSpecRow(section, "Font", node.font_family);
      if (node.font_size) addSpecRow(section, "Size", `${node.font_size}px`);
      if (node.font_weight && node.font_weight !== 400) addSpecRow(section, "Weight", `${node.font_weight}`);
      if (node.line_height) addSpecRow(section, "Line Height", `${node.line_height}`);
      if (node.letter_spacing) addSpecRow(section, "Tracking", `${node.letter_spacing}px`);
      if (node.text_transform && node.text_transform !== "None") addSpecRow(section, "Transform", node.text_transform);
      if (node.text_indent && node.text_indent !== 0) addSpecRow(section, "Text Indent", `${node.text_indent}px`);
      if (node.opentype_features) {
        const ot = node.opentype_features;
        const feats: string[] = [];
        if (!ot.ligatures) feats.push("No Ligatures");
        if (ot.small_caps) feats.push("Small Caps");
        if (ot.old_style_numerals) feats.push("Old-style Nums");
        if (ot.tabular_numerals) feats.push("Tabular Nums");
        if (feats.length > 0) addSpecRow(section, "OpenType", feats.join(", "));
      }
    }

    // Layout / padding
    if (layout && layout.mode && layout.mode !== "None") {
      addSpecRow(section, "Layout", `${layout.mode}${layout.direction ? ' ' + layout.direction : ''}`);
      if (layout.gap) addSpecRow(section, "Gap", `${layout.gap}px`);
      if (layout.padding) {
        const p = layout.padding;
        addSpecRow(section, "Padding", `${p.top ?? 0} ${p.right ?? 0} ${p.bottom ?? 0} ${p.left ?? 0} px`);
      }
    }

    return section;
  }

  function addSpecRow(parent: HTMLElement, label: string, value: string, isHtml = false) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;justify-content:space-between;align-items:center;font-size:11px;";
    const lbl = document.createElement("span");
    lbl.style.cssText = "color:#666;min-width:60px;";
    lbl.textContent = label;
    const val = document.createElement("span");
    val.style.cssText = "color:#ccc;text-align:right;";
    if (isHtml) val.innerHTML = value; else val.textContent = value;
    row.appendChild(lbl);
    row.appendChild(val);
    parent.appendChild(row);
  }

  // ── Spacing Overlay Toggle ──
  function buildSpacingToggle(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:8px;padding:8px 12px;background:#1a1a1a;border-radius:8px;";

    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;justify-content:space-between;";

    const label = document.createElement("span");
    label.style.cssText = "font-size:11px;color:#aaa;";
    label.textContent = "Spacing Overlay (Alt+Hover)";

    const toggle = document.createElement("button");
    const updateToggle = () => {
      toggle.style.cssText = `
        width:36px;height:20px;border-radius:10px;border:none;cursor:pointer;position:relative;transition:background 0.2s;
        background:${spacingOverlayEnabled ? "#4f46e5" : "#333"};
      `;
      toggle.innerHTML = `<span style="position:absolute;top:2px;${spacingOverlayEnabled ? 'right:2px' : 'left:2px'};width:16px;height:16px;border-radius:50%;background:white;transition:all 0.2s;"></span>`;
    };
    updateToggle();
    toggle.addEventListener("click", () => {
      spacingOverlayEnabled = !spacingOverlayEnabled;
      (editor as any)._handoffSpacingOverlay = spacingOverlayEnabled;
      updateToggle();
    });

    row.appendChild(label);
    row.appendChild(toggle);
    wrap.appendChild(row);

    const pinRow = document.createElement("div");
    pinRow.style.cssText = "display:flex;align-items:center;gap:6px;";

    const pinBtn = document.createElement("button");
    pinBtn.textContent = "Pin current redline";
    pinBtn.style.cssText = "flex:1;padding:5px 8px;border:1px solid #444;background:#232323;color:#ddd;border-radius:6px;font-size:10px;cursor:pointer;";

    const clearBtn = document.createElement("button");
    clearBtn.textContent = "Clear pins";
    clearBtn.style.cssText = "padding:5px 8px;border:1px solid #444;background:#232323;color:#aaa;border-radius:6px;font-size:10px;cursor:pointer;";

    const countLabel = document.createElement("span");
    countLabel.style.cssText = "font-size:10px;color:#777;min-width:34px;text-align:right;";

    const updateCount = () => {
      const count = (editor as any).getPinnedRedlineCountForCurrentPage?.() ?? 0;
      countLabel.textContent = `${count} pin` + (count === 1 ? "" : "s");
    };
    updateCount();

    pinBtn.addEventListener("click", () => {
      const ok = (editor as any).pinActiveRedline?.();
      if (!ok) {
        alert("Pin할 redline이 없어요. Alt+Hover로 redline을 먼저 표시해 주세요.");
        return;
      }
      updateCount();
    });

    clearBtn.addEventListener("click", () => {
      (editor as any).clearRedlinePinsForCurrentPage?.();
      updateCount();
    });

    pinRow.appendChild(pinBtn);
    pinRow.appendChild(clearBtn);
    pinRow.appendChild(countLabel);
    wrap.appendChild(pinRow);

    const pinList = document.createElement("div");
    pinList.style.cssText = "display:flex;flex-direction:column;gap:4px;max-height:120px;overflow:auto;";

    const renderPinList = () => {
      pinList.innerHTML = "";
      const pins = ((editor as any).listRedlinePinsForCurrentPage?.() || []) as Array<{ id: number; mode: "selectionToTarget" | "selectionSpacing"; createdAt: number; stateCapture: { hover: boolean; pressed: boolean; focus: boolean }; selectionCount: number; targetId?: number }>;
      if (pins.length === 0) {
        const empty = document.createElement("div");
        empty.style.cssText = "font-size:10px;color:#777;";
        empty.textContent = "No pinned measurements yet.";
        pinList.appendChild(empty);
        return;
      }
      for (const pin of pins.slice(0, 10)) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:6px;background:#111827;border:1px solid #374151;border-radius:5px;padding:3px 5px;";
        const label = document.createElement("div");
        label.style.cssText = "flex:1;font-size:10px;color:#cbd5e1;";
        const tags = [pin.stateCapture.hover ? "H" : "", pin.stateCapture.pressed ? "P" : "", pin.stateCapture.focus ? "F" : ""].filter(Boolean).join("+");
        label.textContent = `${pin.mode === "selectionSpacing" ? "Spacing" : "Target"} · ${pin.selectionCount} sel${tags ? ` · ${tags}` : ""}`;
        row.appendChild(label);

        const del = document.createElement("button");
        del.textContent = "×";
        del.title = "Remove pin";
        del.style.cssText = "padding:0 5px;height:18px;border:1px solid #7f1d1d;background:#3f1d1d;color:#fecaca;border-radius:4px;font-size:10px;cursor:pointer;";
        del.onclick = () => {
          (editor as any).removeRedlinePin?.(pin.id);
          updateCount();
          renderPinList();
        };
        row.appendChild(del);
        pinList.appendChild(row);
      }
    };

    const refreshPins = () => {
      updateCount();
      renderPinList();
    };
    pinBtn.addEventListener("click", refreshPins);
    clearBtn.addEventListener("click", refreshPins);
    renderPinList();
    wrap.appendChild(pinList);

    return wrap;
  }

  function buildStateCapturePresets(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:8px;padding:8px 12px;background:#1a1a1a;border-radius:8px;";

    const title = document.createElement("div");
    title.style.cssText = "font-size:11px;color:#aaa;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;";
    title.textContent = "State Capture Presets";
    wrap.appendChild(title);

    const toggles = document.createElement("div");
    toggles.style.cssText = "display:flex;gap:6px;";
    (["hover", "pressed", "focus"] as const).forEach((key) => {
      const btn = document.createElement("button");
      const sync = () => {
        const active = handoffStateCapture[key];
        btn.textContent = key;
        btn.style.cssText = `padding:4px 8px;border-radius:999px;border:1px solid ${active ? "#6366f1" : "#3f3f46"};background:${active ? "rgba(99,102,241,0.2)" : "#232323"};color:${active ? "#c7d2fe" : "#a1a1aa"};font-size:10px;cursor:pointer;text-transform:capitalize;`;
      };
      sync();
      btn.onclick = () => {
        handoffStateCapture = { ...handoffStateCapture, [key]: !handoffStateCapture[key] };
        (editor as any).setHandoffStateCapture?.(handoffStateCapture);
        saveSelectedStateCapture(editor, handoffStateCapture);
        sync();
      };
      toggles.appendChild(btn);
    });
    wrap.appendChild(toggles);

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:6px;align-items:center;";
    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save preset";
    saveBtn.style.cssText = "padding:5px 8px;border:1px solid #444;background:#232323;color:#ddd;border-radius:6px;font-size:10px;cursor:pointer;";
    saveBtn.onclick = () => {
      const name = prompt("Preset 이름", stateCaptureLabel(handoffStateCapture));
      if (!name) return;
      const list = loadStateCapturePresets(editor);
      list.unshift({ id: `scp-${Date.now()}`, name: name.trim(), state: { ...handoffStateCapture }, createdAt: Date.now() });
      saveStateCapturePresets(editor, list.slice(0, 20));
      refresh(currentIds);
    };
    actions.appendChild(saveBtn);

    const clearBtn = document.createElement("button");
    clearBtn.textContent = "Reset";
    clearBtn.style.cssText = "padding:5px 8px;border:1px solid #444;background:#232323;color:#aaa;border-radius:6px;font-size:10px;cursor:pointer;";
    clearBtn.onclick = () => {
      handoffStateCapture = { hover: false, pressed: false, focus: false };
      (editor as any).setHandoffStateCapture?.(handoffStateCapture);
      saveSelectedStateCapture(editor, handoffStateCapture);
      refresh(currentIds);
    };
    actions.appendChild(clearBtn);
    wrap.appendChild(actions);

    const presets = loadStateCapturePresets(editor);
    if (presets.length > 0) {
      const list = document.createElement("div");
      list.style.cssText = "display:flex;flex-direction:column;gap:4px;";
      presets.slice(0, 6).forEach((preset) => {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:6px;";
        const applyBtn = document.createElement("button");
        applyBtn.textContent = `${preset.name} (${stateCaptureLabel(preset.state)})`;
        applyBtn.style.cssText = "flex:1;padding:4px 8px;border:1px solid #3f3f46;background:#202020;color:#d4d4d8;border-radius:6px;font-size:10px;cursor:pointer;text-align:left;";
        applyBtn.onclick = () => {
          handoffStateCapture = { ...preset.state };
          (editor as any).setHandoffStateCapture?.(handoffStateCapture);
          saveSelectedStateCapture(editor, handoffStateCapture);
          refresh(currentIds);
        };
        const delBtn = document.createElement("button");
        delBtn.textContent = "✕";
        delBtn.style.cssText = "padding:2px 6px;border:1px solid #3f3f46;background:#202020;color:#a1a1aa;border-radius:6px;font-size:10px;cursor:pointer;";
        delBtn.onclick = () => {
          const next = loadStateCapturePresets(editor).filter((p) => p.id !== preset.id);
          saveStateCapturePresets(editor, next);
          refresh(currentIds);
        };
        row.append(applyBtn, delBtn);
        list.appendChild(row);
      });
      wrap.appendChild(list);
    }

    return wrap;
  }

  function createDownloadBtn(label: string, action: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.style.cssText = `
      flex:1;padding:6px 10px;background:#1e1e1e;border:1px solid #444;border-radius:6px;
      color:#aaa;font-size:10px;cursor:pointer;transition:all 0.15s;font-weight:500;
    `;
    btn.addEventListener("mouseenter", () => { btn.style.borderColor = "#4f46e5"; btn.style.color = "#818cf8"; });
    btn.addEventListener("mouseleave", () => { btn.style.borderColor = "#444"; btn.style.color = "#aaa"; });
    btn.addEventListener("click", action);
    return btn;
  }

  function createCodeSection(title: string, code: string): HTMLElement {
    const section = document.createElement("div");
    section.style.cssText = "background:#1e1e1e;border:1px solid #333;border-radius:8px;overflow:hidden;";

    const headerRow = document.createElement("div");
    headerRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #333;background:#252525;";

    const lbl = document.createElement("span");
    lbl.style.cssText = "font-size:11px;font-weight:600;color:#aaa;";
    lbl.textContent = title;
    headerRow.appendChild(lbl);

    const copyBtn = document.createElement("button");
    copyBtn.style.cssText = "background:none;border:1px solid #444;border-radius:4px;padding:3px 8px;color:#888;cursor:pointer;font-size:10px;display:flex;align-items:center;gap:4px;transition:all 0.15s;";
    copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy`;
    copyBtn.addEventListener("mouseenter", () => { copyBtn.style.borderColor = "#4f46e5"; copyBtn.style.color = "#818cf8"; });
    copyBtn.addEventListener("mouseleave", () => { copyBtn.style.borderColor = "#444"; copyBtn.style.color = "#888"; });
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(code).then(() => {
        copyBtn.innerHTML = `✓ Copied`;
        copyBtn.style.color = "#10b981";
        setTimeout(() => {
          copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy`;
          copyBtn.style.color = "#888";
        }, 1500);
      });
    });
    headerRow.appendChild(copyBtn);
    section.appendChild(headerRow);

    const codeBlock = document.createElement("pre");
    codeBlock.style.cssText = "margin:0;padding:12px;font-family:'JetBrains Mono','Fira Code',monospace;font-size:11px;line-height:1.6;overflow-x:auto;color:#d4d4d4;white-space:pre-wrap;word-break:break-all;max-height:300px;overflow-y:auto;";
    codeBlock.innerHTML = highlightCode(code, currentLang);
    section.appendChild(codeBlock);

    return section;
  }

  editor.onSelection((ids) => refresh(ids));

  return { refresh };
}

type RedlineNode = { id: number; name: string; x: number; y: number; width: number; height: number; };

function renderRedlineSpecMode(container: HTMLElement, editor: Editor, ids: number[]) {
  const nodes: RedlineNode[] = ids
    .map((id) => {
      try {
        const raw = editor.engine.get_node_json(BigInt(id));
        if (!raw) return null;
        const n = JSON.parse(raw);
        return {
          id,
          name: String(n.name || `Node ${id}`),
          x: Number(n.x || 0),
          y: Number(n.y || 0),
          width: Number(n.width || 0),
          height: Number(n.height || 0),
        } as RedlineNode;
      } catch {
        return null;
      }
    })
    .filter((n): n is RedlineNode => !!n);

  if (nodes.length < 2) {
    container.innerHTML = `<div style="padding:16px;color:#666;font-size:12px;">Select at least 2 elements</div>`;
    return;
  }

  const anchor = nodes[0]!;
  const items = nodes.slice(1).map((n) => {
    const dx = n.x - anchor.x;
    const dy = n.y - anchor.y;
    const rightGap = n.x - (anchor.x + anchor.width);
    const leftGap = anchor.x - (n.x + n.width);
    const downGap = n.y - (anchor.y + anchor.height);
    const upGap = anchor.y - (n.y + n.height);
    const hGap = rightGap > 0 ? rightGap : leftGap > 0 ? leftGap : 0;
    const vGap = downGap > 0 ? downGap : upGap > 0 ? upGap : 0;
    return { node: n, dx, dy, hGap, vGap };
  });

  const suggestSpaceToken = (px: number) => {
    if (px <= 0) return "-";
    const rounded = Math.round(px / 4) * 4;
    return `space-${Math.max(1, Math.round(rounded / 4))} (${rounded}px)`;
  };

  const wrap = document.createElement("div");
  wrap.style.cssText = "padding:12px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;";

  const header = document.createElement("div");
  header.style.cssText = "padding:10px;border:1px solid #3a2f1f;background:#1f1a12;border-radius:8px;";
  header.innerHTML = `
    <div style="font-size:12px;font-weight:700;color:#fbbf24;">📏 Redline Spec Mode</div>
    <div style="margin-top:4px;font-size:11px;color:#a3a3a3;line-height:1.45;">Anchor: <span style="color:#fde68a;">${anchor.name}</span> (#${anchor.id}) · ${Math.round(anchor.width)}×${Math.round(anchor.height)} at (${Math.round(anchor.x)}, ${Math.round(anchor.y)})</div>
    <div style="margin-top:4px;font-size:10px;color:#78716c;">거리 값은 px 기준이며 토큰은 4px grid 기준 추천값입니다.</div>
  `;
  wrap.appendChild(header);

  const table = document.createElement("div");
  table.style.cssText = "border:1px solid #2f2f35;border-radius:8px;overflow:hidden;";
  const rows = items.map((it) => `
    <tr>
      <td style="padding:6px 8px;border-top:1px solid #2a2a2a;color:#ddd;font-size:11px;">${it.node.name} <span style="color:#71717a;">#${it.node.id}</span></td>
      <td style="padding:6px 8px;border-top:1px solid #2a2a2a;color:#c4b5fd;font-size:11px;text-align:right;">${Math.round(it.dx)} / ${Math.round(it.dy)}</td>
      <td style="padding:6px 8px;border-top:1px solid #2a2a2a;color:#a7f3d0;font-size:11px;text-align:right;">${Math.round(it.hGap)} / ${Math.round(it.vGap)}</td>
      <td style="padding:6px 8px;border-top:1px solid #2a2a2a;color:#f5d0fe;font-size:11px;">${suggestSpaceToken(Math.max(it.hGap, it.vGap))}</td>
    </tr>
  `).join("");
  table.innerHTML = `
    <table style="width:100%;border-collapse:collapse;background:#1a1a1f;">
      <thead>
        <tr style="background:#232329;">
          <th style="padding:7px 8px;color:#a1a1aa;font-size:10px;text-align:left;">Target</th>
          <th style="padding:7px 8px;color:#a1a1aa;font-size:10px;text-align:right;">Offset (x/y)</th>
          <th style="padding:7px 8px;color:#a1a1aa;font-size:10px;text-align:right;">Gap (h/v)</th>
          <th style="padding:7px 8px;color:#a1a1aa;font-size:10px;text-align:left;">Token Suggestion</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  wrap.appendChild(table);

  const copy = document.createElement("button");
  copy.textContent = "Copy Redline Sheet";
  copy.style.cssText = "height:30px;border-radius:7px;border:1px solid #57431f;background:#2f2618;color:#fcd34d;font-size:11px;cursor:pointer;";
  copy.onclick = async () => {
    const lines = [
      `Anchor: ${anchor.name} (#${anchor.id})`,
      ...items.map((it) => `- ${it.node.name} (#${it.node.id}): offset(${Math.round(it.dx)}, ${Math.round(it.dy)}), gap(${Math.round(it.hGap)}, ${Math.round(it.vGap)}), token ${suggestSpaceToken(Math.max(it.hGap, it.vGap))}`),
    ];
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = "✓ Copied";
      setTimeout(() => (copy.textContent = "Copy Redline Sheet"), 1200);
    } catch {
      prompt("Copy redline sheet", text);
    }
  };
  wrap.appendChild(copy);

  if (nodes.length === 2) {
    const qaWrap = document.createElement("div");
    qaWrap.style.cssText = "margin-top:2px;padding:8px;border:1px solid #334155;background:#111827;border-radius:8px;display:flex;flex-direction:column;gap:6px;";
    const qaTitle = document.createElement("div");
    qaTitle.style.cssText = "font-size:11px;color:#93c5fd;font-weight:600;";
    qaTitle.textContent = "Design QA Diff Pins";
    qaWrap.appendChild(qaTitle);

    const qaHint = document.createElement("div");
    qaHint.style.cssText = "font-size:10px;color:#94a3b8;line-height:1.4;";
    qaHint.textContent = "두 요소(기준 → 비교)를 비교해 color / spacing / typography 변화 핀을 코멘트로 자동 생성합니다.";
    qaWrap.appendChild(qaHint);

    const qaBtn = document.createElement("button");
    qaBtn.textContent = "Generate diff pins + comments";
    qaBtn.style.cssText = "height:30px;border-radius:7px;border:1px solid #1d4ed8;background:#1e3a8a;color:#dbeafe;font-size:11px;cursor:pointer;";

    const qaResult = document.createElement("div");
    qaResult.style.cssText = "font-size:10px;color:#94a3b8;";
    qaResult.textContent = "";

    qaBtn.onclick = () => {
      const base = nodes[0]!;
      const target = nodes[1]!;
      const issues: Array<{ kind: "color" | "spacing" | "typography"; note: string }> = [];

      const approxEq = (a: number, b: number, eps = 0.5) => Math.abs(a - b) <= eps;
      const readNode = (nodeId: number): any | null => {
        try {
          const raw = editor.engine.get_node_json(BigInt(nodeId));
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      };
      const readFillHex = (nodeId: number): string => {
        try {
          const info = JSON.parse(editor.engine.get_fill_info(BigInt(nodeId)) || "{}");
          const fill = info?.fill || info?.fills?.[0] || null;
          return colorToHex(fill?.color || fill);
        } catch {
          return "";
        }
      };

      const baseNode = readNode(base.id);
      const targetNode = readNode(target.id);
      if (!baseNode || !targetNode) {
        qaResult.textContent = "비교 노드를 읽을 수 없습니다.";
        return;
      }

      const baseFill = readFillHex(base.id);
      const targetFill = readFillHex(target.id);
      if (baseFill && targetFill && baseFill !== targetFill) {
        issues.push({ kind: "color", note: `Fill changed ${baseFill} → ${targetFill}` });
      }

      const baseGapX = Math.round(baseNode.x + baseNode.width);
      const targetGapX = Math.round(targetNode.x + targetNode.width);
      const deltaX = Math.abs(baseGapX - targetGapX);
      const deltaY = Math.abs((baseNode.y + baseNode.height) - (targetNode.y + targetNode.height));
      if (deltaX >= 4 || deltaY >= 4 || !approxEq(baseNode.width, targetNode.width) || !approxEq(baseNode.height, targetNode.height)) {
        issues.push({ kind: "spacing", note: `Bounds changed (${Math.round(baseNode.width)}×${Math.round(baseNode.height)}) → (${Math.round(targetNode.width)}×${Math.round(targetNode.height)}), Δedge(${deltaX}, ${deltaY})` });
      }

      const readTextMeta = (n: any) => {
        const text = n?.kind?.Text;
        if (!text) return null;
        return {
          fontFamily: String(text?.font_family || ""),
          fontSize: Number(text?.font_size || 0),
          fontWeight: Number(text?.font_weight || 400),
          lineHeight: Number(text?.line_height || 0),
        };
      };
      const tb = readTextMeta(baseNode);
      const tt = readTextMeta(targetNode);
      if (tb && tt) {
        const typoChanged = tb.fontFamily !== tt.fontFamily || !approxEq(tb.fontSize, tt.fontSize, 0.1) || tb.fontWeight !== tt.fontWeight || !approxEq(tb.lineHeight, tt.lineHeight, 0.1);
        if (typoChanged) {
          issues.push({ kind: "typography", note: `Typography changed (${tb.fontFamily} ${tb.fontWeight}/${tb.fontSize}px) → (${tt.fontFamily} ${tt.fontWeight}/${tt.fontSize}px)` });
        }
      }

      if (!issues.length) {
        qaResult.textContent = "감지된 변화가 없습니다.";
        return;
      }

      const kindColor: Record<string, string> = {
        color: "🎨",
        spacing: "📐",
        typography: "🔤",
      };
      let created = 0;
      for (const issue of issues) {
        try {
          const x = Number(targetNode.x || 0) + Number(targetNode.width || 0) / 2;
          const y = Number(targetNode.y || 0) + Number(targetNode.height || 0) / 2;
          const text = `[Design QA Diff] ${kindColor[issue.kind]} ${issue.kind.toUpperCase()}\n${issue.note}\nBase: ${base.name} (#${base.id}) → Compare: ${target.name} (#${target.id})`;
          (editor.engine as any).add_comment_on_node?.(x, y, "Design QA Bot", text, target.id);
          created += 1;
        } catch {}
      }
      qaResult.textContent = `핀/코멘트 ${created}개 생성 완료 (${issues.length}개 이슈)`;
      editor.requestRender();
    };

    qaWrap.appendChild(qaBtn);
    qaWrap.appendChild(qaResult);
    wrap.appendChild(qaWrap);
  }

  container.innerHTML = "";
  container.appendChild(wrap);
}

// ─── Helpers ───────────────────────────────────────────

function getKindLabel(kind: any): string {
  if (typeof kind === "string") return kind;
  if (kind.Text !== undefined) return "Text";
  if (kind.Image !== undefined) return "Image";
  if (kind.Star !== undefined) return "Star";
  if (kind.Polygon !== undefined) return "Polygon";
  if (kind.Path !== undefined) return "Path";
  return Object.keys(kind)[0] || "Unknown";
}

function rgbaToCSS(color: any): string {
  if (!color) return "transparent";
  if (typeof color === "string") return color;
  const r = Math.round((color.r ?? 0) * 255);
  const g = Math.round((color.g ?? 0) * 255);
  const b = Math.round((color.b ?? 0) * 255);
  const a = color.a ?? 1;
  if (a === 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
}

function colorToHex(color: any): string {
  if (!color) return "transparent";
  const r = Math.round((color.r ?? 0) * 255).toString(16).padStart(2, "0");
  const g = Math.round((color.g ?? 0) * 255).toString(16).padStart(2, "0");
  const b = Math.round((color.b ?? 0) * 255).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

function swiftColor(color: any): string {
  if (!color) return ".clear";
  const r = (color.r ?? 0).toFixed(3);
  const g = (color.g ?? 0).toFixed(3);
  const b = (color.b ?? 0).toFixed(3);
  const a = color.a ?? 1;
  if (a < 1) return `Color(red: ${r}, green: ${g}, blue: ${b}, opacity: ${a.toFixed(2)})`;
  return `Color(red: ${r}, green: ${g}, blue: ${b})`;
}

function kotlinColor(color: any): string {
  if (!color) return "Color.Transparent";
  const r = Math.round((color.r ?? 0) * 255);
  const g = Math.round((color.g ?? 0) * 255);
  const b = Math.round((color.b ?? 0) * 255);
  const a = Math.round((color.a ?? 1) * 255);
  return `Color(0x${a.toString(16).padStart(2, "0").toUpperCase()}${r.toString(16).padStart(2, "0").toUpperCase()}${g.toString(16).padStart(2, "0").toUpperCase()}${b.toString(16).padStart(2, "0").toUpperCase()})`;
}

interface CodeCtx {
  node: any;
  fill: any;
  stroke: any;
  shadows: any[];
  blur: number;
  blendMode: string;
  layout: any;
  bitmapFilter: any;
}

// ─── Tailwind Code Gen ────────────────────────────────

function generateTailwind(ctx: CodeCtx): string {
  const { node, fill, stroke, shadows, blur, layout } = ctx;
  const kind = node.kind;
  const classes: string[] = [];

  // Size
  classes.push(`w-[${Math.round(node.width)}px]`);
  classes.push(`h-[${Math.round(node.height)}px]`);

  // Position
  classes.push(`absolute`);
  classes.push(`left-[${Math.round(node.x)}px]`);
  classes.push(`top-[${Math.round(node.y)}px]`);

  // Border radius
  if (typeof kind === "string" && kind === "Ellipse") {
    classes.push("rounded-full");
  } else if (node.corner_radius) {
    const r = node.corner_radius;
    if (r <= 2) classes.push("rounded-sm");
    else if (r <= 4) classes.push("rounded");
    else if (r <= 6) classes.push("rounded-md");
    else if (r <= 8) classes.push("rounded-lg");
    else if (r <= 12) classes.push("rounded-xl");
    else if (r <= 16) classes.push("rounded-2xl");
    else if (r <= 24) classes.push("rounded-3xl");
    else classes.push(`rounded-[${r}px]`);
  }

  // Rotation
  if (node.rotation && node.rotation !== 0) classes.push(`rotate-[${node.rotation.toFixed(1)}deg]`);

  // Opacity
  if (node.opacity !== undefined && node.opacity < 1) {
    const pct = Math.round(node.opacity * 100);
    classes.push(`opacity-${pct}`);
  }

  // Fill → bg color
  if (fill && (fill.type === "Solid" || fill.color)) {
    const hex = colorToHex(fill.color || fill);
    classes.push(`bg-[${hex}]`);
  }

  // Stroke → border
  if (stroke && stroke.color && stroke.width) {
    classes.push(`border-[${stroke.width}px]`);
    classes.push(`border-[${colorToHex(stroke.color)}]`);
  }

  // Shadow
  if (shadows?.length > 0 && shadows.some((s: any) => s.visible !== false)) {
    classes.push("shadow-lg");
  }

  // Blur
  if (blur && blur > 0) classes.push(`blur-[${blur}px]`);

  // Text
  const isText = kind && (kind.Text !== undefined || (typeof kind === "string" && kind === "Text"));
  if (isText) {
    if (node.font_size) {
      const sz = node.font_size;
      const sizeMap: Record<number, string> = { 12: "text-xs", 14: "text-sm", 16: "text-base", 18: "text-lg", 20: "text-xl", 24: "text-2xl", 30: "text-3xl", 36: "text-4xl", 48: "text-5xl", 60: "text-6xl" };
      classes.push(sizeMap[sz] || `text-[${sz}px]`);
    }
    if (node.font_weight) {
      const wMap: Record<number, string> = { 100: "font-thin", 200: "font-extralight", 300: "font-light", 400: "font-normal", 500: "font-medium", 600: "font-semibold", 700: "font-bold", 800: "font-extrabold", 900: "font-black" };
      if (node.font_weight !== 400) classes.push(wMap[node.font_weight] || `font-[${node.font_weight}]`);
    }
    if (node.font_style === "italic") classes.push("italic");
    if (node.text_align) {
      const aMap: Record<string, string> = { left: "text-left", center: "text-center", right: "text-right", justify: "text-justify" };
      if (node.text_align !== "left") classes.push(aMap[node.text_align] || "");
    }
    if (node.line_height && node.line_height !== 1.2) classes.push(`leading-[${node.line_height}]`);
    if (node.letter_spacing) classes.push(`tracking-[${node.letter_spacing}px]`);
    if (node.text_decoration === "Underline") classes.push("underline");
    else if (node.text_decoration === "Strikethrough") classes.push("line-through");
    if (node.text_transform) {
      const twMap: Record<string, string> = { Uppercase: "uppercase", Lowercase: "lowercase", Capitalize: "capitalize" };
      if (twMap[node.text_transform]) classes.push(twMap[node.text_transform]);
    }
    if (node.text_indent && node.text_indent !== 0) classes.push(`indent-[${node.text_indent}px]`);
    if (node.fills?.[0]) classes.push(`text-[${colorToHex(node.fills[0])}]`);
    if (node.font_family) classes.push(`font-['${node.font_family.replace(/\s+/g, "_")}']`);
  }

  // Layout
  if (layout && layout.mode && layout.mode !== "None") {
    if (layout.mode === "Flex") {
      classes.push("flex");
      if (layout.direction === "Column") classes.push("flex-col");
      if (layout.align_items) {
        const m: Record<string, string> = { Start: "items-start", Center: "items-center", End: "items-end", Stretch: "items-stretch", Baseline: "items-baseline", FirstBaseline: "items-baseline", LastBaseline: "items-baseline" };
        classes.push(m[layout.align_items] || "");
      }
      if (layout.justify_content) {
        const m: Record<string, string> = { Start: "justify-start", Center: "justify-center", End: "justify-end", SpaceBetween: "justify-between", SpaceAround: "justify-around" };
        classes.push(m[layout.justify_content] || "");
      }
      if (layout.gap) classes.push(`gap-[${layout.gap}px]`);
      if (layout.wrap) classes.push("flex-wrap");
    } else if (layout.mode === "Grid") {
      classes.push("grid");
      if (layout.grid_columns) classes.push(`grid-cols-${layout.grid_columns}`);
      if (layout.gap) classes.push(`gap-[${layout.gap}px]`);
    }
    if (layout.padding) {
      const p = layout.padding;
      if (p.top === p.right && p.right === p.bottom && p.bottom === p.left && p.top > 0) {
        classes.push(`p-[${p.top}px]`);
      } else {
        if (p.top > 0) classes.push(`pt-[${p.top}px]`);
        if (p.right > 0) classes.push(`pr-[${p.right}px]`);
        if (p.bottom > 0) classes.push(`pb-[${p.bottom}px]`);
        if (p.left > 0) classes.push(`pl-[${p.left}px]`);
      }
    }
  }

  // Overflow / Clip content
  if (node.overflow === "Hidden") classes.push("overflow-hidden");
  else if (node.overflow === "Scroll") classes.push("overflow-auto");
  else if (node.overflow === "ScrollHorizontal") classes.push("overflow-x-auto");
  else if (node.overflow === "ScrollVertical") classes.push("overflow-y-auto");
  else if (node.clip_content) classes.push("overflow-hidden");

  const tag = isText ? "p" : "div";
  const filtered = classes.filter(Boolean);
  return `<${tag} class="${filtered.join(" ")}">\n  ${isText ? (typeof kind === "object" ? kind.Text || "" : "") : "<!-- children -->"}\n</${tag}>`;
}

// ─── CSS Code Gen ─────────────────────────────────────

function generateCSS(ctx: CodeCtx): string {
  const { node, fill, stroke, shadows, blur, blendMode, layout, bitmapFilter } = ctx;
  const lines: string[] = [];
  const kind = node.kind;

  lines.push(`width: ${Math.round(node.width)}px;`);
  lines.push(`height: ${Math.round(node.height)}px;`);
  if (node.min_width != null) lines.push(`min-width: ${Math.round(node.min_width)}px;`);
  if (node.max_width != null) lines.push(`max-width: ${Math.round(node.max_width)}px;`);
  if (node.min_height != null) lines.push(`min-height: ${Math.round(node.min_height)}px;`);
  if (node.max_height != null) lines.push(`max-height: ${Math.round(node.max_height)}px;`);

  lines.push(`position: absolute;`);
  lines.push(`left: ${Math.round(node.x)}px;`);
  lines.push(`top: ${Math.round(node.y)}px;`);

  if (node.corner_radius && node.corner_radius > 0) lines.push(`border-radius: ${node.corner_radius}px;`);
  if (typeof kind === "string" && kind === "Ellipse") {
    const brIdx = lines.findIndex(l => l.startsWith("border-radius"));
    if (brIdx >= 0) lines[brIdx] = "border-radius: 50%;";
    else lines.push("border-radius: 50%;");
  }

  if (node.rotation && node.rotation !== 0) lines.push(`transform: rotate(${node.rotation.toFixed(1)}deg);`);
  if (node.opacity !== undefined && node.opacity < 1) lines.push(`opacity: ${node.opacity.toFixed(2)};`);

  if (fill) {
    if (fill.type === "Solid" || fill.color) lines.push(`background-color: ${rgbaToCSS(fill.color || fill)};`);
    else if (fill.type === "LinearGradient" && fill.stops) {
      const stops = fill.stops.map((s: any) => `${rgbaToCSS(s.color)} ${(s.offset * 100).toFixed(0)}%`).join(", ");
      lines.push(`background: linear-gradient(${stops});`);
    } else if (fill.type === "RadialGradient" && fill.stops) {
      const stops = fill.stops.map((s: any) => `${rgbaToCSS(s.color)} ${(s.offset * 100).toFixed(0)}%`).join(", ");
      lines.push(`background: radial-gradient(${stops});`);
    }
  }

  if (stroke && stroke.color && stroke.width) {
    lines.push(`border: ${stroke.width}px solid ${rgbaToCSS(stroke.color)};`);
    if (stroke.align === "Inside") lines.push(`box-sizing: border-box;`);
    else if (stroke.align === "Outside") lines.push(`outline: ${stroke.width}px solid ${rgbaToCSS(stroke.color)};`);
  }

  if (shadows?.length > 0) {
    const vis = shadows.filter((s: any) => s.visible !== false);
    if (vis.length > 0) {
      const str = vis.map((s: any) => `${s.offset_x ?? 0}px ${s.offset_y ?? 0}px ${s.blur ?? 0}px ${s.spread ?? 0}px ${rgbaToCSS(s.color)}`).join(",\n    ");
      lines.push(`box-shadow: ${str};`);
    }
  }

  {
    const parts: string[] = [];
    if (blur && blur > 0) parts.push(`blur(${blur}px)`);
    if (bitmapFilter && bitmapFilter.enabled !== false) {
      const bf = bitmapFilter;
      if (Math.abs(bf.brightness - 1) >= 0.001) parts.push(`brightness(${bf.brightness})`);
      if (Math.abs(bf.contrast - 1) >= 0.001) parts.push(`contrast(${bf.contrast})`);
      if (Math.abs(bf.saturation - 1) >= 0.001) parts.push(`saturate(${bf.saturation})`);
      if (Math.abs(bf.hue_rotate) >= 0.001) parts.push(`hue-rotate(${bf.hue_rotate}deg)`);
      if (Math.abs(bf.invert) >= 0.001) parts.push(`invert(${bf.invert})`);
      if (Math.abs(bf.grayscale) >= 0.001) parts.push(`grayscale(${bf.grayscale})`);
      if (Math.abs(bf.sepia) >= 0.001) parts.push(`sepia(${bf.sepia})`);
    }
    if (parts.length > 0) lines.push(`filter: ${parts.join(" ")};`);
  }

  if (blendMode && blendMode !== "Normal" && blendMode !== "normal") {
    const cssBlend = blendMode.replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^-/, "");
    lines.push(`mix-blend-mode: ${cssBlend};`);
  }

  if (kind && (kind.Text !== undefined || (typeof kind === "string" && kind === "Text"))) {
    if (node.font_family) lines.push(`font-family: '${node.font_family}';`);
    if (node.font_size) lines.push(`font-size: ${node.font_size}px;`);
    if (node.font_weight && node.font_weight !== 400) lines.push(`font-weight: ${node.font_weight};`);
    if (node.font_style && node.font_style !== "normal") lines.push(`font-style: ${node.font_style};`);
    if (node.line_height && node.line_height !== 1.2) lines.push(`line-height: ${node.line_height};`);
    if (node.text_align && node.text_align !== "left") lines.push(`text-align: ${node.text_align};`);
    const deco = node.text_decoration;
    if (deco && deco !== "None") {
      const cssVal = deco === "Underline" ? "underline" : deco === "Strikethrough" ? "line-through" : "underline line-through";
      lines.push(`text-decoration: ${cssVal};`);
    }
    if (node.letter_spacing && node.letter_spacing !== 0) lines.push(`letter-spacing: ${node.letter_spacing}px;`);
    if (node.list_style && node.list_style !== "None") {
      const listMap: Record<string, string> = { Bullet: "disc", Numbered: "decimal", Dash: '"-  "', Checkbox: "none", CheckboxChecked: "none" };
      lines.push(`list-style-type: ${listMap[node.list_style] || "none"};`);
    }
    if (node.indent_level && node.indent_level > 0) lines.push(`padding-left: ${node.indent_level * 1.5}em;`);
    if (node.text_transform && node.text_transform !== "None" && node.text_transform !== "none") lines.push(`text-transform: ${node.text_transform.toLowerCase()};`);
    if (node.text_indent && node.text_indent !== 0) lines.push(`text-indent: ${node.text_indent}px;`);
    if (node.opentype_features) {
      const ot = node.opentype_features;
      const parts: string[] = [];
      if (!ot.ligatures) parts.push('"liga" 0');
      if (ot.old_style_numerals) parts.push('"onum" 1');
      if (ot.small_caps) parts.push('"smcp" 1');
      if (ot.tabular_numerals) parts.push('"tnum" 1');
      if (parts.length > 0) lines.push(`font-feature-settings: ${parts.join(", ")};`);
      if (ot.small_caps) lines.push(`font-variant-caps: small-caps;`);
    }
    if (node.fills?.[0]) lines.push(`color: ${rgbaToCSS(node.fills[0])};`);
  }

  if (node.overflow && node.overflow !== "Visible") {
    if (node.overflow === "Scroll") lines.push(`overflow: auto;`);
    else if (node.overflow === "ScrollHorizontal") lines.push(`overflow-x: auto; overflow-y: hidden;`);
    else if (node.overflow === "ScrollVertical") lines.push(`overflow-x: hidden; overflow-y: auto;`);
    else lines.push(`overflow: hidden;`);
  } else if (node.clip_content) {
    lines.push(`overflow: hidden;`);
  }

  if (layout && layout.mode && layout.mode !== "None") {
    if (layout.mode === "Flex") {
      lines.push(`display: flex;`);
      if (layout.direction === "Column") lines.push(`flex-direction: column;`);
      if (layout.align_items) lines.push(`align-items: ${cssAlignValue(layout.align_items)};`);
      if (layout.justify_content) lines.push(`justify-content: ${cssJustifyValue(layout.justify_content)};`);
      if (layout.gap) lines.push(`gap: ${layout.gap}px;`);
      if (layout.wrap) lines.push(`flex-wrap: wrap;`);
    } else if (layout.mode === "Grid") {
      lines.push(`display: grid;`);
      if (layout.grid_columns) lines.push(`grid-template-columns: repeat(${layout.grid_columns}, 1fr);`);
      if (layout.gap) lines.push(`gap: ${layout.gap}px;`);
    }
    if (layout.padding) {
      const p = layout.padding;
      if (p.top === p.right && p.right === p.bottom && p.bottom === p.left) {
        if (p.top > 0) lines.push(`padding: ${p.top}px;`);
      } else {
        lines.push(`padding: ${p.top ?? 0}px ${p.right ?? 0}px ${p.bottom ?? 0}px ${p.left ?? 0}px;`);
      }
    }
  }

  return lines.join("\n");
}

// ─── SwiftUI Code Gen ─────────────────────────────────

function generateSwiftUI(ctx: CodeCtx): string {
  const { node, fill, stroke, shadows, blur, blendMode } = ctx;
  const kind = node.kind;
  const lines: string[] = [];
  const isText = kind && (kind.Text !== undefined || (typeof kind === "string" && kind === "Text"));
  const isEllipse = typeof kind === "string" && kind === "Ellipse";
  const isImage = kind && kind.Image !== undefined;

  if (isText) {
    const text = typeof kind === "object" ? kind.Text : "";
    lines.push(`Text("${(text || "").replace(/"/g, '\\"')}")`);
    if (node.font_family) lines.push(`    .font(.custom("${node.font_family}", size: ${node.font_size || 16}))`);
    else if (node.font_size) lines.push(`    .font(.system(size: ${node.font_size}))`);
    if (node.font_weight && node.font_weight !== 400) lines.push(`    .fontWeight(.${swiftFontWeight(node.font_weight)})`);
    if (node.font_style === "italic") lines.push(`    .italic()`);
    if (node.text_align && node.text_align !== "left") {
      const align = node.text_align === "center" ? "center" : node.text_align === "right" ? "trailing" : "leading";
      lines.push(`    .multilineTextAlignment(.${align})`);
    }
    if (node.line_height && node.line_height !== 1.2) lines.push(`    .lineSpacing(${((node.line_height - 1) * (node.font_size || 16)).toFixed(1)})`);
    if (node.letter_spacing) lines.push(`    .kerning(${node.letter_spacing})`);
    if (node.text_decoration === "Underline") lines.push(`    .underline()`);
    else if (node.text_decoration === "Strikethrough") lines.push(`    .strikethrough()`);
    if (node.fills?.[0]) lines.push(`    .foregroundColor(${swiftColor(node.fills[0])})`);
  } else if (isImage) {
    lines.push(`AsyncImage(url: URL(string: "${kind.Image?.src || ""}")) { image in`);
    lines.push(`    image.resizable()`);
    lines.push(`    ${(kind.Image?.fit || "Cover") === "Contain" ? ".aspectRatio(contentMode: .fit)" : ".aspectRatio(contentMode: .fill)"}`);
    lines.push(`} placeholder: { ProgressView() }`);
  } else if (isEllipse) {
    lines.push(`Ellipse()`);
  } else {
    lines.push(node.corner_radius > 0 ? `RoundedRectangle(cornerRadius: ${node.corner_radius})` : `Rectangle()`);
  }

  if (fill) {
    if (fill.type === "Solid" || fill.color) lines.push(`    .fill(${swiftColor(fill.color || fill)})`);
    else if (fill.type === "LinearGradient" && fill.stops) {
      const stops = fill.stops.map((s: any) => `.init(color: ${swiftColor(s.color)}, location: ${s.offset.toFixed(2)})`).join(", ");
      lines.push(`    .fill(LinearGradient(stops: [${stops}], startPoint: .leading, endPoint: .trailing))`);
    }
  }

  if (stroke && stroke.color && stroke.width) {
    const shape = isEllipse ? "Ellipse()" : (node.corner_radius > 0 ? `RoundedRectangle(cornerRadius: ${node.corner_radius})` : "Rectangle()");
    lines.push(`    .overlay(${shape}.stroke(${swiftColor(stroke.color)}, lineWidth: ${stroke.width}))`);
  }

  lines.push(`    .frame(width: ${Math.round(node.width)}, height: ${Math.round(node.height)})`);
  lines.push(`    .position(x: ${Math.round(node.x + node.width / 2)}, y: ${Math.round(node.y + node.height / 2)})`);

  if (node.rotation && node.rotation !== 0) lines.push(`    .rotationEffect(.degrees(${node.rotation.toFixed(1)}))`);
  if (node.opacity !== undefined && node.opacity < 1) lines.push(`    .opacity(${node.opacity.toFixed(2)})`);

  if (shadows?.length > 0) {
    const s = shadows.find((s: any) => s.visible !== false);
    if (s) lines.push(`    .shadow(color: ${swiftColor(s.color)}, radius: ${s.blur ?? 0}, x: ${s.offset_x ?? 0}, y: ${s.offset_y ?? 0})`);
  }

  if (blur && blur > 0) lines.push(`    .blur(radius: ${blur})`);
  if (blendMode && blendMode !== "Normal") {
    const bm = swiftBlendMode(blendMode);
    if (bm) lines.push(`    .blendMode(.${bm})`);
  }
  if (node.overflow === "Hidden") lines.push(`    .clipped()`);

  return lines.join("\n");
}

// ─── Kotlin Compose Code Gen ──────────────────────────

function generateKotlin(ctx: CodeCtx): string {
  const { node, fill, stroke, shadows, blur, layout } = ctx;
  const kind = node.kind;
  const isText = kind && (kind.Text !== undefined || (typeof kind === "string" && kind === "Text"));
  const isEllipse = typeof kind === "string" && kind === "Ellipse";
  const isImage = kind && kind.Image !== undefined;

  const lines: string[] = [];
  const mods: string[] = [];
  mods.push(`.size(${Math.round(node.width)}.dp, ${Math.round(node.height)}.dp)`);
  mods.push(`.offset(x = ${Math.round(node.x)}.dp, y = ${Math.round(node.y)}.dp)`);

  if (node.corner_radius && node.corner_radius > 0 && !isEllipse) mods.push(`.clip(RoundedCornerShape(${node.corner_radius}.dp))`);
  if (isEllipse) mods.push(`.clip(CircleShape)`);

  if (fill) {
    if (fill.type === "Solid" || fill.color) mods.push(`.background(${kotlinColor(fill.color || fill)})`);
    else if (fill.type === "LinearGradient" && fill.stops) {
      const stops = fill.stops.map((s: any) => kotlinColor(s.color)).join(", ");
      mods.push(`.background(Brush.linearGradient(listOf(${stops})))`);
    }
  }

  if (stroke && stroke.color && stroke.width) {
    const shape = isEllipse ? "CircleShape" : (node.corner_radius > 0 ? `RoundedCornerShape(${node.corner_radius}.dp)` : "RectangleShape");
    mods.push(`.border(${stroke.width}.dp, ${kotlinColor(stroke.color)}, ${shape})`);
  }

  if (node.rotation && node.rotation !== 0) mods.push(`.rotate(${node.rotation.toFixed(1)}f)`);
  if (node.opacity !== undefined && node.opacity < 1) mods.push(`.alpha(${node.opacity.toFixed(2)}f)`);
  if (shadows?.length > 0 && shadows.some((s: any) => s.visible !== false)) mods.push(`.shadow(elevation = ${shadows[0].blur ?? 4}.dp)`);
  if (blur && blur > 0) mods.push(`.blur(${blur}.dp)`);

  if (isText) {
    const text = typeof kind === "object" ? kind.Text : "";
    lines.push(`Text(`);
    lines.push(`    text = "${(text || "").replace(/"/g, '\\"')}",`);
    if (node.font_size) lines.push(`    fontSize = ${node.font_size}.sp,`);
    if (node.font_weight && node.font_weight !== 400) lines.push(`    fontWeight = FontWeight(${node.font_weight}),`);
    if (node.font_style === "italic") lines.push(`    fontStyle = FontStyle.Italic,`);
    if (node.font_family) lines.push(`    fontFamily = FontFamily(Font(R.font.${node.font_family.toLowerCase().replace(/\s+/g, "_")})),`);
    if (node.text_align) {
      const align = node.text_align === "center" ? "Center" : node.text_align === "right" ? "End" : "Start";
      lines.push(`    textAlign = TextAlign.${align},`);
    }
    if (node.fills?.[0]) lines.push(`    color = ${kotlinColor(node.fills[0])},`);
    lines.push(`    modifier = Modifier${mods.join("")}`);
    lines.push(`)`);
  } else if (isImage) {
    lines.push(`AsyncImage(`);
    lines.push(`    model = "${kind.Image?.src || ""}",`);
    lines.push(`    contentDescription = null,`);
    lines.push(`    contentScale = ContentScale.${(kind.Image?.fit || "Cover") === "Contain" ? "Fit" : "Crop"},`);
    lines.push(`    modifier = Modifier${mods.join("")}`);
    lines.push(`)`);
  } else {
    lines.push(`Box(modifier = Modifier${mods.join("")}) {`);
    if (layout && layout.mode === "Flex") {
      const isCol = layout.direction === "Column";
      lines.push(`    ${isCol ? "Column" : "Row"}(`);
      if (layout.gap) lines.push(`        ${isCol ? "verticalArrangement" : "horizontalArrangement"} = Arrangement.spacedBy(${layout.gap}.dp),`);
      lines.push(`    ) { /* children */ }`);
    }
    lines.push(`}`);
  }

  return lines.join("\n");
}

// ─── SVG Props Gen ────────────────────────────────────

function generateSVGProps(ctx: CodeCtx): string | null {
  const { node, fill, stroke } = ctx;
  const lines: string[] = [];

  if (fill && (fill.type === "Solid" || fill.color)) lines.push(`fill="${colorToHex(fill.color || fill)}"`);
  if (stroke && stroke.color && stroke.width) {
    lines.push(`stroke="${colorToHex(stroke.color)}"`);
    lines.push(`stroke-width="${stroke.width}"`);
  }
  if (node.opacity !== undefined && node.opacity < 1) lines.push(`opacity="${node.opacity.toFixed(2)}"`);

  return lines.length > 0 ? lines.join("\n") : null;
}

// ─── Asset Download ───────────────────────────────────

function downloadAsset(editor: Editor, nodeId: number, format: "png" | "svg", scale: number, stateCapture?: HandoffStateCapture) {
  try {
    const stateSuffix = stateCapture ? `-${stateCaptureLabel(stateCapture).replace(/\+/g, "-")}` : "";
    if (format === "svg") {
      const svg = editor.engine.export_node_svg(BigInt(nodeId));
      if (svg) {
        const blob = new Blob([svg], { type: "image/svg+xml" });
        downloadBlob(blob, `node-${nodeId}${stateSuffix}.svg`);
      }
    } else {
      try {
        const png = (editor as any).exportNodePNG?.(nodeId, scale);
        if (png) { downloadBlob(png, `node-${nodeId}${stateSuffix}@${scale}x.png`); return; }
      } catch {}
      const dataUrl = editor.engine.export_png(BigInt(nodeId), scale);
      if (dataUrl) {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `node-${nodeId}${stateSuffix}@${scale}x.png`;
        a.click();
      }
    }
  } catch (e) {
    console.warn("Asset download failed:", e);
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Utility ──────────────────────────────────────────

function getHandoffDocKey(editor: Editor): string {
  try {
    const pageId = Number((editor.engine as any).get_active_page_id?.() ?? 0);
    return `doc:${location.pathname}:page:${pageId}`;
  } catch {
    return `doc:${location.pathname}`;
  }
}

function loadStateCapturePresets(editor: Editor): StateCapturePreset[] {
  try {
    const raw = localStorage.getItem(`${HANDOFF_STATE_PRESETS_KEY}-${getHandoffDocKey(editor)}`) || localStorage.getItem(HANDOFF_STATE_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStateCapturePresets(editor: Editor, presets: StateCapturePreset[]) {
  localStorage.setItem(`${HANDOFF_STATE_PRESETS_KEY}-${getHandoffDocKey(editor)}`, JSON.stringify(presets));
  localStorage.setItem(HANDOFF_STATE_PRESETS_KEY, JSON.stringify(presets));
}

function loadSelectedStateCapture(editor: Editor): HandoffStateCapture {
  try {
    const raw = localStorage.getItem(`${HANDOFF_STATE_PRESETS_KEY}-selected-${getHandoffDocKey(editor)}`);
    if (!raw) return { hover: false, pressed: false, focus: false };
    const parsed = JSON.parse(raw);
    return { hover: !!parsed?.hover, pressed: !!parsed?.pressed, focus: !!parsed?.focus };
  } catch {
    return { hover: false, pressed: false, focus: false };
  }
}

function saveSelectedStateCapture(editor: Editor, state: HandoffStateCapture) {
  localStorage.setItem(`${HANDOFF_STATE_PRESETS_KEY}-selected-${getHandoffDocKey(editor)}`, JSON.stringify(state));
}

function stateCaptureLabel(state: HandoffStateCapture): string {
  const parts: string[] = [];
  if (state.hover) parts.push("hover");
  if (state.pressed) parts.push("pressed");
  if (state.focus) parts.push("focus");
  return parts.length ? parts.join("+") : "default";
}

function cssAlignValue(v: string): string {
  const map: Record<string, string> = { Start: "flex-start", Center: "center", End: "flex-end", Stretch: "stretch", Baseline: "baseline", FirstBaseline: "first baseline", LastBaseline: "last baseline" };
  return map[v] || v.toLowerCase();
}

function cssJustifyValue(v: string): string {
  const map: Record<string, string> = { Start: "flex-start", Center: "center", End: "flex-end", SpaceBetween: "space-between", SpaceAround: "space-around" };
  return map[v] || v.toLowerCase();
}

function swiftFontWeight(w: number): string {
  if (w <= 100) return "ultraLight";
  if (w <= 200) return "thin";
  if (w <= 300) return "light";
  if (w <= 400) return "regular";
  if (w <= 500) return "medium";
  if (w <= 600) return "semibold";
  if (w <= 700) return "bold";
  if (w <= 800) return "heavy";
  return "black";
}

function swiftBlendMode(mode: string): string | null {
  const map: Record<string, string> = {
    Multiply: "multiply", Screen: "screen", Overlay: "overlay",
    Darken: "darken", Lighten: "lighten", ColorDodge: "colorDodge",
    ColorBurn: "colorBurn", SoftLight: "softLight", HardLight: "hardLight",
    Difference: "difference", Exclusion: "exclusion",
  };
  return map[mode] || null;
}

function highlightCode(code: string, lang: CodeLang): string {
  if (lang === "css" || lang === "svg") return highlightCSS(code);
  if (lang === "swiftui") return highlightSwift(code);
  if (lang === "kotlin") return highlightKotlin(code);
  if (lang === "tailwind") return highlightTailwind(code);
  return escapeHtml(code);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightCSS(code: string): string {
  return code
    .replace(/^([\w-]+)(?=:)/gm, '<span style="color:#9cdcfe;">$1</span>')
    .replace(/:\s*(.+);/g, (_m, val) => {
      const highlighted = (val as string)
        .replace(/(\d+\.?\d*)(px|deg|%)?/g, '<span style="color:#b5cea8;">$1$2</span>')
        .replace(/(rgba?\([^)]+\))/g, '<span style="color:#ce9178;">$1</span>')
        .replace(/(#[0-9a-fA-F]{3,8})/g, '<span style="color:#ce9178;">$1</span>')
        .replace(/\b(solid|absolute|flex|grid|column|wrap|center|none|inherit|italic)\b/g, '<span style="color:#c586c0;">$1</span>')
        .replace(/('[^']+')/g, '<span style="color:#ce9178;">$1</span>');
      return `: ${highlighted};`;
    });
}

function highlightSwift(code: string): string {
  let out = escapeHtml(code);
  out = out.replace(/\b(struct|var|let|func|import|return|if|else|true|false|nil|some|self)\b/g, '<span style="color:#c586c0;">$1</span>');
  out = out.replace(/\b(Text|Image|Color|Font|Rectangle|Ellipse|RoundedRectangle|LinearGradient|RadialGradient|AsyncImage|ProgressView|View)\b/g, '<span style="color:#4ec9b0;">$1</span>');
  out = out.replace(/\.(\w+)/g, '.<span style="color:#9cdcfe;">$1</span>');
  out = out.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#b5cea8;">$1</span>');
  out = out.replace(/"([^"]+)"/g, '"<span style="color:#ce9178;">$1</span>"');
  return out;
}

function highlightKotlin(code: string): string {
  let out = escapeHtml(code);
  out = out.replace(/\b(fun|val|var|class|object|import|return|if|else|true|false|null)\b/g, '<span style="color:#c586c0;">$1</span>');
  out = out.replace(/\b(Text|Box|Column|Row|Image|Modifier|Color|FontWeight|FontStyle|FontFamily|Font|TextAlign|TextDecoration|Brush|RoundedCornerShape|CircleShape|ContentScale|Arrangement|Alignment|AsyncImage)\b/g, '<span style="color:#4ec9b0;">$1</span>');
  out = out.replace(/\.(\w+)/g, '.<span style="color:#9cdcfe;">$1</span>');
  out = out.replace(/\b(\d+\.?\d*)(\.dp|\.sp|f)?\b/g, '<span style="color:#b5cea8;">$1$2</span>');
  out = out.replace(/"([^"]+)"/g, '"<span style="color:#ce9178;">$1</span>"');
  return out;
}

function highlightTailwind(code: string): string {
  let out = escapeHtml(code);
  // Highlight HTML tags
  out = out.replace(/&lt;(\/?)([\w]+)/g, '&lt;$1<span style="color:#4ec9b0;">$2</span>');
  // Highlight class values
  out = out.replace(/class=&quot;([^&]+)&quot;/g, (_m, classes) => {
    const highlighted = (classes as string).split(" ").map(c =>
      `<span style="color:#9cdcfe;">${c}</span>`
    ).join(" ");
    return `<span style="color:#c586c0;">class</span>=&quot;${highlighted}&quot;`;
  });
  return out;
}

/* ── Handoff Checklist (shown when no node selected) ── */

interface ChecklistItemData {
  id: string;
  category: string;
  title: string;
  description: string;
  severity: "Error" | "Warning" | "Info";
  node_ids: number[];
  passed: boolean;
}

interface CategorySummaryData {
  name: string;
  total: number;
  passed: number;
}

interface HandoffChecklistData {
  total_items: number;
  passed_items: number;
  completion_pct: number;
  categories: CategorySummaryData[];
  items: ChecklistItemData[];
}

function renderChecklist(container: HTMLElement, editor: Editor) {
  let checklist: HandoffChecklistData;
  try {
    const json = (editor.engine as any).get_handoff_checklist();
    checklist = JSON.parse(json);
  } catch {
    container.innerHTML = `<div style="padding:16px;color:#666;font-size:12px;">Checklist unavailable</div>`;
    return;
  }

  const wrap = document.createElement("div");
  wrap.style.cssText = "padding:12px;font-size:12px;color:#ccc;overflow-y:auto;max-height:100%;";

  const pct = checklist.completion_pct;
  const barColor = pct >= 80 ? "#36b37e" : pct >= 50 ? "#ffab00" : "#ff5630";

  wrap.innerHTML = `
    <div style="margin-bottom:12px;">
      <div style="font-size:14px;font-weight:600;margin-bottom:4px;">📋 Handoff Checklist</div>
      <div style="font-size:11px;color:#888;margin-bottom:8px;">
        ${checklist.passed_items}/${checklist.total_items} checks passed
      </div>
      <div style="background:#333;border-radius:4px;height:6px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:${barColor};border-radius:4px;transition:width 0.3s;"></div>
      </div>
      <div style="text-align:right;font-size:10px;color:#888;margin-top:2px;">${pct}%</div>
    </div>
  `;

  const grouped = new Map<string, ChecklistItemData[]>();
  for (const item of checklist.items) {
    if (!grouped.has(item.category)) grouped.set(item.category, []);
    grouped.get(item.category)!.push(item);
  }

  for (const [cat, items] of grouped) {
    const catSummary = checklist.categories.find(c => c.name === cat);
    const catDiv = document.createElement("div");
    catDiv.style.cssText = "margin-bottom:12px;";

    const catHeader = document.createElement("div");
    catHeader.style.cssText = "font-size:11px;font-weight:600;color:#aaa;margin-bottom:6px;display:flex;justify-content:space-between;";
    catHeader.innerHTML = `<span>${cat}</span><span style="color:#666;">${catSummary?.passed ?? 0}/${catSummary?.total ?? items.length}</span>`;
    catDiv.appendChild(catHeader);

    for (const item of items) {
      const row = document.createElement("div");
      row.style.cssText = `display:flex;align-items:flex-start;gap:6px;padding:6px 8px;border-radius:4px;margin-bottom:2px;background:${item.passed ? "transparent" : "#1a1a1a"};cursor:${item.node_ids.length ? "pointer" : "default"};`;

      const icon = item.passed ? "✅" : item.severity === "Error" ? "❌" : "⚠️";
      row.innerHTML = `
        <span style="flex-shrink:0;font-size:11px;">${icon}</span>
        <div>
          <div style="font-size:11px;font-weight:500;color:${item.passed ? "#888" : "#ddd"};">${item.title}</div>
          <div style="font-size:10px;color:#666;margin-top:1px;">${item.description}</div>
        </div>
      `;

      if (item.node_ids.length > 0) {
        row.addEventListener("click", () => {
          const nid = item.node_ids[0]!;
          editor.selectNode(nid);
          try { (editor as any).zoomToSelection?.(); } catch {}
        });
        row.addEventListener("mouseenter", () => { row.style.background = "#252525"; });
        row.addEventListener("mouseleave", () => { row.style.background = item.passed ? "transparent" : "#1a1a1a"; });
      }

      catDiv.appendChild(row);
    }
    wrap.appendChild(catDiv);
  }

  const refreshBtn = document.createElement("button");
  refreshBtn.textContent = "↻ Re-check";
  refreshBtn.style.cssText = "width:100%;padding:6px;border:1px solid #444;border-radius:4px;background:#2a2a2a;color:#ccc;cursor:pointer;font-size:11px;";
  refreshBtn.addEventListener("click", () => renderChecklist(container, editor));
  wrap.appendChild(refreshBtn);

  container.innerHTML = "";
  container.appendChild(wrap);
}
