import type { Editor } from "../editor";

type RenameMode = "pattern" | "findReplace";

interface PreviewItem {
  id: number;
  oldName: string;
  newName: string;
}

let dialog: HTMLElement | null = null;

export function hideBatchRenameDialog() {
  if (dialog) {
    dialog.remove();
    dialog = null;
  }
}

export function showBatchRenameDialog(editor: Editor) {
  hideBatchRenameDialog();

  let mode: RenameMode = "pattern";
  let pattern = "{name}";
  let startNum = 1;
  let find = "";
  let replace = "";
  let useRegex = false;

  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position:fixed; inset:0; z-index:10001;
    background:rgba(0,0,0,0.5); display:flex;
    align-items:center; justify-content:center;
  `;

  const modal = document.createElement("div");
  modal.style.cssText = `
    background:#2c2c2c; border:1px solid #444; border-radius:12px;
    padding:20px; min-width:420px; max-width:500px;
    box-shadow:0 16px 48px rgba(0,0,0,0.6);
    font-family:Inter,system-ui,sans-serif; color:#e0e0e0; font-size:13px;
  `;

  // Title
  const title = document.createElement("div");
  title.textContent = "Batch Rename";
  title.style.cssText = "font-size:15px; font-weight:600; margin-bottom:16px;";
  modal.appendChild(title);

  // Mode tabs
  const tabs = document.createElement("div");
  tabs.style.cssText = "display:flex; gap:4px; margin-bottom:14px;";
  const makeTab = (label: string, m: RenameMode) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.dataset.mode = m;
    btn.style.cssText = `
      flex:1; padding:6px 0; border:1px solid #555; border-radius:6px;
      background:${mode === m ? "#3b82f6" : "#333"}; color:#e0e0e0;
      cursor:pointer; font-size:12px; font-family:inherit;
    `;
    btn.addEventListener("click", () => {
      mode = m;
      updateTabs();
      updateFields();
      updatePreview();
    });
    tabs.appendChild(btn);
    return btn;
  };
  makeTab("Pattern", "pattern");
  makeTab("Find & Replace", "findReplace");
  modal.appendChild(tabs);

  function updateTabs() {
    tabs.querySelectorAll("button").forEach((b) => {
      const el = b as HTMLButtonElement;
      el.style.background = el.dataset.mode === mode ? "#3b82f6" : "#333";
    });
  }

  // Fields container
  const fields = document.createElement("div");
  fields.style.cssText = "margin-bottom:14px;";
  modal.appendChild(fields);

  // Preview list
  const previewLabel = document.createElement("div");
  previewLabel.textContent = "Preview";
  previewLabel.style.cssText = "font-size:11px; color:#888; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px;";
  modal.appendChild(previewLabel);

  const previewList = document.createElement("div");
  previewList.style.cssText = `
    max-height:180px; overflow-y:auto; background:#1a1a1a;
    border:1px solid #333; border-radius:6px; padding:6px;
    margin-bottom:16px;
  `;
  modal.appendChild(previewList);

  // Buttons
  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex; justify-content:flex-end; gap:8px;";
  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";
  cancelBtn.style.cssText = `
    padding:7px 16px; border:1px solid #555; border-radius:6px;
    background:#333; color:#e0e0e0; cursor:pointer; font-size:13px; font-family:inherit;
  `;
  cancelBtn.addEventListener("click", hideBatchRename);

  const applyBtn = document.createElement("button");
  applyBtn.textContent = "Rename";
  applyBtn.style.cssText = `
    padding:7px 16px; border:none; border-radius:6px;
    background:#3b82f6; color:#fff; cursor:pointer; font-size:13px; font-weight:500; font-family:inherit;
  `;
  applyBtn.addEventListener("click", () => {
    if (mode === "pattern") {
      editor.engine.batch_rename_selection(pattern, startNum);
    } else {
      editor.engine.batch_find_replace_selection(find, replace, useRegex);
    }
    editor.requestRender();
    hideBatchRenameDialog();
  });
  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(applyBtn);
  modal.appendChild(btnRow);

  function makeInput(label: string, value: string, onChange: (v: string) => void): HTMLElement {
    const row = document.createElement("div");
    row.style.cssText = "margin-bottom:8px;";
    const lbl = document.createElement("label");
    lbl.textContent = label;
    lbl.style.cssText = "display:block; font-size:11px; color:#999; margin-bottom:3px;";
    row.appendChild(lbl);
    const inp = document.createElement("input");
    inp.type = "text";
    inp.value = value;
    inp.style.cssText = `
      width:100%; box-sizing:border-box; padding:6px 8px;
      background:#1a1a1a; border:1px solid #444; border-radius:6px;
      color:#eee; font-size:13px; font-family:inherit; outline:none;
    `;
    inp.addEventListener("input", () => { onChange(inp.value); updatePreview(); });
    inp.addEventListener("focus", () => { inp.style.borderColor = "#3b82f6"; });
    inp.addEventListener("blur", () => { inp.style.borderColor = "#444"; });
    row.appendChild(inp);
    return row;
  }

  function makeNumberInput(label: string, value: number, onChange: (v: number) => void): HTMLElement {
    const row = document.createElement("div");
    row.style.cssText = "margin-bottom:8px;";
    const lbl = document.createElement("label");
    lbl.textContent = label;
    lbl.style.cssText = "display:block; font-size:11px; color:#999; margin-bottom:3px;";
    row.appendChild(lbl);
    const inp = document.createElement("input");
    inp.type = "number";
    inp.value = String(value);
    inp.min = "0";
    inp.style.cssText = `
      width:80px; padding:6px 8px;
      background:#1a1a1a; border:1px solid #444; border-radius:6px;
      color:#eee; font-size:13px; font-family:inherit; outline:none;
    `;
    inp.addEventListener("input", () => { onChange(parseInt(inp.value) || 0); updatePreview(); });
    row.appendChild(inp);
    return row;
  }

  function updateFields() {
    fields.innerHTML = "";
    if (mode === "pattern") {
      fields.appendChild(makeInput("Pattern ({name} = original, {n} = number, {N} = padded)", pattern, (v) => { pattern = v; }));
      fields.appendChild(makeNumberInput("Start number", startNum, (v) => { startNum = v; }));
    } else {
      fields.appendChild(makeInput("Find", find, (v) => { find = v; }));
      fields.appendChild(makeInput("Replace with", replace, (v) => { replace = v; }));
      // Regex toggle
      const regRow = document.createElement("div");
      regRow.style.cssText = "display:flex; align-items:center; gap:6px;";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = useRegex;
      cb.id = "br-regex";
      cb.addEventListener("change", () => { useRegex = cb.checked; updatePreview(); });
      const regLabel = document.createElement("label");
      regLabel.htmlFor = "br-regex";
      regLabel.textContent = "Use regex";
      regLabel.style.cssText = "font-size:12px; color:#aaa; cursor:pointer;";
      regRow.appendChild(cb);
      regRow.appendChild(regLabel);
      fields.appendChild(regRow);
    }
  }

  function updatePreview() {
    let items: PreviewItem[] = [];
    try {
      const json = mode === "pattern"
        ? editor.engine.batch_rename_preview(pattern, startNum)
        : editor.engine.batch_find_replace_preview(find, replace, useRegex);
      items = JSON.parse(json);
    } catch { /* ignore */ }

    previewList.innerHTML = "";
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = mode === "findReplace" ? "No matches" : "No selection";
      empty.style.cssText = "color:#666; font-size:12px; padding:8px; text-align:center;";
      previewList.appendChild(empty);
      return;
    }
    for (const item of items.slice(0, 50)) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex; gap:8px; padding:3px 4px; font-size:12px; align-items:center;";
      const old = document.createElement("span");
      old.textContent = item.oldName;
      old.style.cssText = "color:#888; text-decoration:line-through; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";
      const arrow = document.createElement("span");
      arrow.textContent = "→";
      arrow.style.cssText = "color:#666;";
      const nw = document.createElement("span");
      nw.textContent = item.newName;
      nw.style.cssText = "color:#4ade80; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";
      row.appendChild(old);
      row.appendChild(arrow);
      row.appendChild(nw);
      previewList.appendChild(row);
    }
  }

  updateFields();
  updatePreview();

  overlay.appendChild(modal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) hideBatchRenameDialog();
  });
  document.body.appendChild(overlay);
  dialog = overlay;

  // Keyboard
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { hideBatchRenameDialog(); }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { applyBtn.click(); }
    e.stopPropagation();
  };
  overlay.addEventListener("keydown", onKey);

  // Focus first input
  setTimeout(() => {
    const inp = fields.querySelector("input") as HTMLInputElement | null;
    inp?.focus();
    inp?.select();
  }, 50);
}
