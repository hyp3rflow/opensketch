import type { Editor } from "../editor";

/**
 * Creates the Design Token Theme Switcher panel (shown at the top of properties or as standalone)
 */
export function createTokenThemeSwitcher(editor: Editor, onThemeChange?: () => void): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "padding:8px 12px;border-bottom:1px solid #333;";

  function render() {
    wrapper.innerHTML = "";
    const themesJson = editor.engine.token_get_themes();
    const themes: Array<{ id: number; name: string; tokenCount: number }> = JSON.parse(themesJson);
    const activeId = Number(editor.engine.token_get_active_theme());

    // Header
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;";
    const title = document.createElement("span");
    title.style.cssText = "font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px;";
    title.textContent = "Design Tokens";
    header.appendChild(title);

    const addBtn = document.createElement("button");
    addBtn.style.cssText = "background:none;border:1px solid #555;color:#aaa;font-size:10px;padding:2px 8px;border-radius:4px;cursor:pointer;";
    addBtn.textContent = "+ Theme";
    addBtn.onclick = () => {
      const name = prompt("Theme name:", `Theme ${themes.length + 1}`);
      if (name) {
        editor.engine.token_create_theme(name);
        render();
      }
    };
    header.appendChild(addBtn);
    wrapper.appendChild(header);

    if (themes.length === 0) {
      const hint = document.createElement("div");
      hint.style.cssText = "font-size:10px;color:#666;padding:4px 0;";
      hint.textContent = "No themes yet. Create one to define design tokens.";
      wrapper.appendChild(hint);
      return;
    }

    // Theme selector
    const selectRow = document.createElement("div");
    selectRow.style.cssText = "display:flex;gap:4px;margin-bottom:6px;";
    const select = document.createElement("select");
    select.style.cssText = "flex:1;background:#1e1e1e;color:#ccc;border:1px solid #444;border-radius:4px;padding:4px;font-size:11px;";
    for (const t of themes) {
      const opt = document.createElement("option");
      opt.value = String(t.id);
      opt.textContent = `${t.name} (${t.tokenCount} tokens)`;
      if (t.id === activeId) opt.selected = true;
      select.appendChild(opt);
    }
    select.onchange = () => {
      editor.engine.token_set_active_theme(BigInt(parseInt(select.value)));
      editor.render();
      onThemeChange?.();
      render();
    };
    selectRow.appendChild(select);

    // Delete theme button
    const delBtn = document.createElement("button");
    delBtn.style.cssText = "background:#c0392b;color:#fff;border:none;border-radius:4px;padding:4px 8px;font-size:10px;cursor:pointer;";
    delBtn.textContent = "✕";
    delBtn.title = "Delete theme";
    delBtn.onclick = () => {
      if (confirm("Delete this theme?")) {
        editor.engine.token_remove_theme(BigInt(parseInt(select.value)));
        editor.render();
        onThemeChange?.();
        render();
      }
    };
    selectRow.appendChild(delBtn);
    wrapper.appendChild(selectRow);

    // Tokens list for active theme
    const tokensJson = editor.engine.token_get_tokens(BigInt(activeId));
    const tokens: Array<{ id: number; name: string; type: string; value: string }> = JSON.parse(tokensJson);

    const tokenList = document.createElement("div");
    tokenList.style.cssText = "max-height:200px;overflow-y:auto;";

    for (const tok of tokens) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:4px;padding:2px 0;font-size:11px;";

      if (tok.type === "alias") {
        // Alias token: show link icon + resolved value
        const linkIcon = document.createElement("span");
        linkIcon.style.cssText = "width:14px;height:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#a78bfa;font-size:12px;cursor:pointer;";
        linkIcon.textContent = "🔗";
        linkIcon.title = "Alias token — click to change target";
        linkIcon.onclick = () => {
          const target = prompt("Alias target token name:", tok.value.replace(/[{}]/g, ""));
          if (target) {
            editor.engine.token_set_alias(BigInt(activeId), BigInt(tok.id), target);
            editor.render();
            render();
          }
        };
        row.appendChild(linkIcon);

        // Resolve deep to show actual value
        const resolved = JSON.parse(editor.engine.token_resolve_deep(tok.name));
        const resolvedColor = resolved && resolved.type === "color" ? resolved.value : null;
        if (resolvedColor) {
          const swatch = document.createElement("div");
          swatch.style.cssText = `width:10px;height:10px;border-radius:2px;border:1px solid #555;background:${resolvedColor};flex-shrink:0;`;
          row.appendChild(swatch);
        }
      } else if (tok.type === "color") {
        const swatch = document.createElement("div");
        swatch.style.cssText = `width:14px;height:14px;border-radius:3px;border:1px solid #555;background:${tok.value};flex-shrink:0;cursor:pointer;`;
        swatch.onclick = () => {
          const newColor = prompt("Color (hex):", tok.value);
          if (newColor) {
            editor.engine.token_update_token(BigInt(activeId), BigInt(tok.id), "color", newColor);
            editor.render();
            render();
          }
        };
        row.appendChild(swatch);
      }

      const nameSpan = document.createElement("span");
      nameSpan.style.cssText = "flex:1;color:#ccc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      nameSpan.textContent = tok.name;
      row.appendChild(nameSpan);

      const valSpan = document.createElement("span");
      if (tok.type === "alias") {
        valSpan.style.cssText = "color:#a78bfa;font-size:10px;flex-shrink:0;cursor:pointer;";
        valSpan.textContent = `→ ${tok.value.replace(/[{}]/g, "")}`;
        valSpan.title = "Click to view alias chain";
        valSpan.onclick = () => {
          const chain: string[] = JSON.parse(editor.engine.token_get_alias_chain(tok.name));
          alert(`Alias chain:\n${chain.join(" → ")}`);
        };
      } else {
        valSpan.style.cssText = "color:#888;font-size:10px;flex-shrink:0;";
        valSpan.textContent = tok.type === "color" ? tok.value : `${tok.value}`;
      }
      row.appendChild(valSpan);

      // Convert to alias button (for non-alias tokens)
      if (tok.type !== "alias") {
        const aliasBtn = document.createElement("button");
        aliasBtn.style.cssText = "background:none;border:none;color:#a78bfa;cursor:pointer;font-size:10px;padding:0 2px;opacity:0.5;";
        aliasBtn.textContent = "🔗";
        aliasBtn.title = "Convert to alias";
        aliasBtn.onmouseenter = () => { aliasBtn.style.opacity = "1"; };
        aliasBtn.onmouseleave = () => { aliasBtn.style.opacity = "0.5"; };
        aliasBtn.onclick = () => {
          const target = prompt("Alias target token name:");
          if (target) {
            editor.engine.token_set_alias(BigInt(activeId), BigInt(tok.id), target);
            editor.render();
            render();
          }
        };
        row.appendChild(aliasBtn);
      }

      const removeBtn = document.createElement("button");
      removeBtn.style.cssText = "background:none;border:none;color:#666;cursor:pointer;font-size:10px;padding:0 2px;";
      removeBtn.textContent = "✕";
      removeBtn.onclick = () => {
        editor.engine.token_remove_token(BigInt(activeId), BigInt(tok.id));
        render();
      };
      row.appendChild(removeBtn);

      tokenList.appendChild(row);
    }
    wrapper.appendChild(tokenList);

    // Token usage map (used/unused/duplicate + quick select/replace)
    wrapper.appendChild(createTokenUsageMapSection(editor, tokens, activeId));

    // Add token button
    const addTokenBtn = document.createElement("button");
    addTokenBtn.style.cssText = "width:100%;margin-top:4px;padding:4px;background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#aaa;font-size:10px;cursor:pointer;";
    addTokenBtn.textContent = "+ Add Token";
    addTokenBtn.onclick = () => {
      const name = prompt("Token name (e.g. primary-bg):");
      if (!name) return;
      const type = prompt("Type (color/number/string/alias):", "color") || "color";
      let value: string;
      if (type === "alias") {
        const target = prompt("Target token name to reference:");
        if (!target) return;
        value = `{${target}}`;
      } else {
        value = prompt("Value:", type === "color" ? "#3b82f6" : "0") || "";
      }
      editor.engine.token_add_token(BigInt(activeId), name, type, value);
      render();
    };
    wrapper.appendChild(addTokenBtn);

    // Import/Export row
    const ioRow = document.createElement("div");
    ioRow.style.cssText = "display:flex;gap:4px;margin-top:4px;";
    const expBtn = document.createElement("button");
    expBtn.style.cssText = "flex:1;padding:3px;background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#aaa;font-size:10px;cursor:pointer;";
    expBtn.textContent = "Export";
    expBtn.onclick = () => {
      const json = editor.engine.token_export_json();
      navigator.clipboard.writeText(json);
      expBtn.textContent = "Copied!";
      setTimeout(() => { expBtn.textContent = "Export"; }, 1500);
    };
    ioRow.appendChild(expBtn);

    const impBtn = document.createElement("button");
    impBtn.style.cssText = "flex:1;padding:3px;background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#aaa;font-size:10px;cursor:pointer;";
    impBtn.textContent = "Import";
    impBtn.onclick = () => {
      const json = prompt("Paste token JSON:");
      if (json) {
        const ok = editor.engine.token_import_json(json);
        if (ok) {
          editor.render();
          onThemeChange?.();
          render();
        } else {
          alert("Invalid token JSON");
        }
      }
    };
    ioRow.appendChild(impBtn);
    wrapper.appendChild(ioRow);
  }

  render();
  return wrapper;
}

/**
 * Creates the token binding section for a specific node in the properties panel
 */
export function createTokenBindingSection(editor: Editor, nodeId: number, onUpdate?: () => void): HTMLElement {
  const section = document.createElement("div");
  section.className = "prop-section";

  function render() {
    section.innerHTML = "";
    const titleEl = document.createElement("div");
    titleEl.className = "prop-section-title";
    titleEl.textContent = "Token Bindings";
    section.appendChild(titleEl);

    const bindingsJson = editor.engine.token_get_bindings(BigInt(nodeId));
    const bindings: Array<{ property: string; tokenName: string }> = JSON.parse(bindingsJson);

    const activeThemeId = Number(editor.engine.token_get_active_theme());
    const themesJson = editor.engine.token_get_themes();
    const themes: Array<{ id: number; name: string }> = JSON.parse(themesJson);

    if (themes.length === 0) {
      const hint = document.createElement("div");
      hint.style.cssText = "font-size:10px;color:#666;padding:4px 0;";
      hint.textContent = "Create a theme first to bind tokens.";
      section.appendChild(hint);
      return;
    }

    // Get available tokens
    const tokensJson = editor.engine.token_get_tokens(BigInt(activeThemeId));
    const tokens: Array<{ id: number; name: string; type: string; value: string }> = JSON.parse(tokensJson);
    // Include alias tokens that resolve to the correct type
    const colorTokens = tokens.filter(t => {
      if (t.type === "color") return true;
      if (t.type === "alias") {
        const resolved = JSON.parse(editor.engine.token_resolve_deep(t.name));
        return resolved && resolved.type === "color";
      }
      return false;
    });
    const numberTokens = tokens.filter(t => {
      if (t.type === "number") return true;
      if (t.type === "alias") {
        const resolved = JSON.parse(editor.engine.token_resolve_deep(t.name));
        return resolved && resolved.type === "number";
      }
      return false;
    });

    // Show existing bindings
    for (const b of bindings) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:4px;padding:2px 0;font-size:11px;";

      const propLabel = document.createElement("span");
      propLabel.style.cssText = "color:#888;width:50px;flex-shrink:0;";
      propLabel.textContent = b.property;
      row.appendChild(propLabel);

      const tokenLabel = document.createElement("span");
      tokenLabel.style.cssText = "flex:1;color:#3b82f6;font-size:10px;";
      tokenLabel.textContent = `→ ${b.tokenName}`;
      row.appendChild(tokenLabel);

      const unbindBtn = document.createElement("button");
      unbindBtn.style.cssText = "background:none;border:none;color:#c0392b;cursor:pointer;font-size:10px;";
      unbindBtn.textContent = "Unbind";
      unbindBtn.onclick = () => {
        editor.engine.token_unbind_node(BigInt(nodeId), b.property);
        render();
        onUpdate?.();
      };
      row.appendChild(unbindBtn);
      section.appendChild(row);
    }

    // Bind buttons for unbound properties
    const boundProps = new Set(bindings.map(b => b.property));
    const bindableProps = [
      { prop: "fill", label: "Bind Fill", tokens: colorTokens },
      { prop: "stroke", label: "Bind Stroke", tokens: colorTokens },
      { prop: "opacity", label: "Bind Opacity", tokens: numberTokens },
      { prop: "corner_radius", label: "Bind Radius", tokens: numberTokens },
    ];

    for (const bp of bindableProps) {
      if (boundProps.has(bp.prop) || bp.tokens.length === 0) continue;
      const btn = document.createElement("button");
      btn.style.cssText = "display:block;width:100%;margin-top:2px;padding:3px;background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#aaa;font-size:10px;cursor:pointer;text-align:left;";
      btn.textContent = bp.label;
      btn.onclick = () => {
        // Show dropdown of available tokens
        const sel = document.createElement("select");
        sel.style.cssText = "width:100%;background:#1e1e1e;color:#ccc;border:1px solid #555;border-radius:4px;padding:3px;font-size:10px;margin-top:2px;";
        const placeholder = document.createElement("option");
        placeholder.textContent = "Select token...";
        placeholder.value = "";
        sel.appendChild(placeholder);
        for (const t of bp.tokens) {
          const opt = document.createElement("option");
          opt.value = t.name;
          opt.textContent = `${t.name} (${t.value})`;
          sel.appendChild(opt);
        }
        sel.onchange = () => {
          if (sel.value) {
            editor.engine.token_bind_node(BigInt(nodeId), bp.prop, sel.value);
            editor.render();
            render();
            onUpdate?.();
          }
        };
        btn.replaceWith(sel);
      };
      section.appendChild(btn);
    }
  }

  render();
  return section;
}

function createTokenUsageMapSection(
  editor: Editor,
  tokens: Array<{ id: number; name: string; type: string; value: string }>,
  activeThemeId: number,
): HTMLElement {
  const section = document.createElement("div");
  section.style.cssText = "margin-top:8px;padding:8px;border:1px solid #3a3a3a;border-radius:6px;background:#202020;";

  const title = document.createElement("div");
  title.style.cssText = "font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;";
  title.textContent = "Token Usage Map";
  section.appendChild(title);

  const layerTree: any[] = JSON.parse(editor.engine.get_layer_list() || "[]");
  const nodes = flattenLayerTree(layerTree);

  const tokenUsage = new Map<string, number[]>();
  const nodeNameMap = new Map<number, string>();
  for (const n of nodes) {
    nodeNameMap.set(n.id, n.name || `Node ${n.id}`);
    const bindings: Array<{ property: string; tokenName: string }> = JSON.parse(editor.engine.token_get_bindings(BigInt(n.id)) || "[]");
    for (const b of bindings) {
      const arr = tokenUsage.get(b.tokenName) || [];
      if (!arr.includes(n.id)) arr.push(n.id);
      tokenUsage.set(b.tokenName, arr);
    }
  }

  const unresolved = document.createElement("div");
  unresolved.style.cssText = "font-size:10px;color:#8b8b8b;margin-bottom:6px;";
  unresolved.textContent = `${tokenUsage.size} bound token(s) across ${nodes.length} node(s)`;
  section.appendChild(unresolved);

  const heatmapWrap = document.createElement("div");
  heatmapWrap.style.cssText = "display:grid;grid-template-columns:auto 1fr auto;gap:4px;align-items:center;margin-bottom:6px;";
  const heatmapToggle = document.createElement("input");
  heatmapToggle.type = "checkbox";
  const scopeSel = document.createElement("select");
  scopeSel.style.cssText = "background:#1e1e1e;color:#ccc;border:1px solid #444;border-radius:4px;padding:2px 4px;font-size:10px;";
  ["Page", "Selection"].forEach((scope) => {
    const opt = document.createElement("option");
    opt.value = scope.toLowerCase();
    opt.textContent = scope;
    scopeSel.appendChild(opt);
  });
  const refreshHeatmapBtn = document.createElement("button");
  refreshHeatmapBtn.textContent = "Heatmap";
  refreshHeatmapBtn.style.cssText = "background:#1f2937;border:1px solid #374151;color:#cbd5e1;border-radius:4px;font-size:10px;padding:2px 6px;cursor:pointer;";

  const applyHeatmap = () => {
    const selected = new Set<number>(Array.from(editor.engine.get_selection?.() || []).map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v) && v > 0));
    const weights: Record<number, number> = {};
    for (const n of nodes) {
      if (scopeSel.value === "selection" && !selected.has(Number(n.id))) continue;
      const bindings: Array<{ property: string; tokenName: string }> = JSON.parse(editor.engine.token_get_bindings(BigInt(n.id)) || "[]");
      if (!bindings.length) continue;
      weights[n.id] = bindings.length;
    }
    (editor as any).setTokenUsageHeatmap?.(heatmapToggle.checked, weights, scopeSel.value === "selection" ? "selection" : "page");
    editor.requestRender();
  };

  heatmapToggle.addEventListener("change", applyHeatmap);
  scopeSel.addEventListener("change", applyHeatmap);
  refreshHeatmapBtn.onclick = () => {
    heatmapToggle.checked = !heatmapToggle.checked;
    applyHeatmap();
  };

  heatmapWrap.appendChild(heatmapToggle);
  heatmapWrap.appendChild(scopeSel);
  heatmapWrap.appendChild(refreshHeatmapBtn);
  section.appendChild(heatmapWrap);

  const list = document.createElement("div");
  list.style.cssText = "display:flex;flex-direction:column;gap:4px;max-height:160px;overflow:auto;padding-right:2px;";

  for (const t of tokens) {
    const usedNodes = tokenUsage.get(t.name) || [];
    const row = document.createElement("div");
    row.style.cssText = `display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:5px;background:${usedNodes.length ? "#262626" : "#241f1f"};border:1px solid ${usedNodes.length ? "#333" : "#4b2f2f"};`;

    const name = document.createElement("div");
    name.style.cssText = "flex:1;color:#ddd;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    name.textContent = t.name;
    row.appendChild(name);

    const count = document.createElement("span");
    count.style.cssText = `font-size:10px;color:${usedNodes.length ? "#93c5fd" : "#fca5a5"};`;
    count.textContent = usedNodes.length ? `${usedNodes.length} used` : "unused";
    row.appendChild(count);

    if (usedNodes.length > 0) {
      const pick = document.createElement("button");
      pick.style.cssText = "background:#1f2937;border:1px solid #374151;color:#cbd5e1;border-radius:4px;font-size:10px;padding:2px 6px;cursor:pointer;";
      pick.textContent = "Pick";
      pick.title = `${nodeNameMap.get(usedNodes[0]) || usedNodes[0]} 선택`;
      pick.onclick = () => {
        editor.selectNode(usedNodes[0]);
        editor.requestRender();
      };
      row.appendChild(pick);
    }

    list.appendChild(row);
  }
  section.appendChild(list);

  // Duplicate detection (same type+value)
  const duplicateGroups = new Map<string, string[]>();
  for (const t of tokens) {
    let normalized = `${t.type}:${t.value}`;
    if (t.type === "alias") {
      const resolved = JSON.parse(editor.engine.token_resolve_deep(t.name));
      normalized = resolved ? `${resolved.type}:${JSON.stringify(resolved.value)}` : normalized;
    }
    const arr = duplicateGroups.get(normalized) || [];
    arr.push(t.name);
    duplicateGroups.set(normalized, arr);
  }
  const duplicates = Array.from(duplicateGroups.values()).filter(v => v.length > 1);
  if (duplicates.length > 0) {
    const dupInfo = document.createElement("div");
    dupInfo.style.cssText = "margin-top:8px;font-size:10px;color:#fbbf24;line-height:1.4;";
    dupInfo.textContent = `Possible duplicates: ${duplicates.map(g => g.join(" = ")).join(" | ")}`;
    section.appendChild(dupInfo);
  }

  // Batch replace bindings
  if (tokens.length >= 2) {
    const replaceWrap = document.createElement("div");
    replaceWrap.style.cssText = "margin-top:8px;padding-top:6px;border-top:1px dashed #3a3a3a;display:grid;grid-template-columns:1fr auto 1fr auto;gap:4px;align-items:center;";

    const fromSel = document.createElement("select");
    const toSel = document.createElement("select");
    fromSel.style.cssText = toSel.style.cssText = "background:#1e1e1e;color:#ccc;border:1px solid #444;border-radius:4px;padding:3px;font-size:10px;";
    for (const t of tokens) {
      const optA = document.createElement("option");
      optA.value = t.name;
      optA.textContent = t.name;
      fromSel.appendChild(optA);
      const optB = document.createElement("option");
      optB.value = t.name;
      optB.textContent = t.name;
      toSel.appendChild(optB);
    }
    if (tokens.length > 1) toSel.selectedIndex = 1;

    const arrow = document.createElement("span");
    arrow.style.cssText = "font-size:10px;color:#888;text-align:center;";
    arrow.textContent = "→";

    const applyBtn = document.createElement("button");
    applyBtn.style.cssText = "background:#1f3b2b;border:1px solid #2f5a40;color:#d1fae5;border-radius:4px;padding:3px 6px;font-size:10px;cursor:pointer;";
    applyBtn.textContent = "Replace";
    applyBtn.onclick = () => {
      const from = fromSel.value;
      const to = toSel.value;
      if (!from || !to || from === to) return;
      let replaced = 0;
      for (const n of nodes) {
        const bindings: Array<{ property: string; tokenName: string }> = JSON.parse(editor.engine.token_get_bindings(BigInt(n.id)) || "[]");
        for (const b of bindings) {
          if (b.tokenName !== from) continue;
          editor.engine.token_bind_node(BigInt(n.id), b.property, to);
          replaced += 1;
        }
      }
      editor.render();
      alert(`Replaced ${replaced} binding(s): ${from} → ${to}`);
    };

    replaceWrap.appendChild(fromSel);
    replaceWrap.appendChild(arrow);
    replaceWrap.appendChild(toSel);
    replaceWrap.appendChild(applyBtn);
    section.appendChild(replaceWrap);
  }

  return section;
}

function flattenLayerTree(layers: any[]): Array<{ id: number; name: string }> {
  return (layers || []).map((item: any) => ({
    id: Number(item.id),
    name: String(item.name || `Node ${item.id}`),
  }));
}
