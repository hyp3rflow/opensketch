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
