import type { Editor } from "../editor";

interface StyleVersionInfo {
  id: number;
  tag: string;
  timestamp: number;
  description: string;
  colorCount: number;
  textCount: number;
}

interface StyleDiff {
  kind: string;
  change: string;
  style_id: number;
  name: string;
  details: string;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function renderStyleVersioningSection(container: HTMLElement, editor: Editor) {
  const section = document.createElement("div");
  section.style.cssText = "width:100%;padding:12px 16px;border-top:1px solid #333;";

  const title = document.createElement("div");
  title.style.cssText = "font-size:11px;font-weight:600;color:#888;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;display:flex;align-items:center;justify-content:space-between;";
  title.innerHTML = `<span>Style Versions</span>`;

  const createBtn = document.createElement("button");
  createBtn.textContent = "+ Create";
  createBtn.style.cssText = "padding:3px 8px;font-size:10px;border:1px solid #555;border-radius:3px;background:#2a2a2a;color:#aaa;cursor:pointer;";
  createBtn.onclick = () => showCreateModal(editor, () => renderList());
  title.appendChild(createBtn);
  section.appendChild(title);

  const listContainer = document.createElement("div");
  section.appendChild(listContainer);

  function renderList() {
    listContainer.innerHTML = "";
    const json = editor.engine.style_version_list();
    const versions: StyleVersionInfo[] = JSON.parse(json);

    if (versions.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "font-size:11px;color:#555;padding:8px 0;";
      empty.textContent = "No versions yet";
      listContainer.appendChild(empty);
      return;
    }

    // Show newest first
    for (const v of [...versions].reverse()) {
      const row = document.createElement("div");
      row.style.cssText = "padding:6px 8px;border:1px solid #333;border-radius:4px;margin-bottom:4px;background:#1e1e1e;";

      const header = document.createElement("div");
      header.style.cssText = "display:flex;justify-content:space-between;align-items:center;";
      const tagEl = document.createElement("span");
      tagEl.style.cssText = "font-size:11px;font-weight:600;color:#ccc;";
      tagEl.textContent = v.tag;
      header.appendChild(tagEl);

      const meta = document.createElement("span");
      meta.style.cssText = "font-size:9px;color:#666;";
      meta.textContent = formatTime(v.timestamp);
      header.appendChild(meta);
      row.appendChild(header);

      if (v.description) {
        const desc = document.createElement("div");
        desc.style.cssText = "font-size:10px;color:#777;margin-top:2px;";
        desc.textContent = v.description;
        row.appendChild(desc);
      }

      const info = document.createElement("div");
      info.style.cssText = "font-size:9px;color:#555;margin-top:2px;";
      info.textContent = `${v.colorCount} colors, ${v.textCount} text styles`;
      row.appendChild(info);

      const actions = document.createElement("div");
      actions.style.cssText = "display:flex;gap:4px;margin-top:4px;";
      const btnCss = "padding:2px 6px;font-size:9px;border:1px solid #444;border-radius:3px;background:#2a2a2a;color:#aaa;cursor:pointer;";

      const diffBtn = document.createElement("button");
      diffBtn.textContent = "Diff";
      diffBtn.style.cssText = btnCss;
      diffBtn.onclick = () => showDiffModal(editor, Number(v.id));

      const rollbackBtn = document.createElement("button");
      rollbackBtn.textContent = "Rollback";
      rollbackBtn.style.cssText = btnCss;
      rollbackBtn.onclick = () => {
        if (!confirm(`Rollback styles to "${v.tag}"? Current styles will be auto-saved.`)) return;
        editor.engine.style_version_rollback(BigInt(v.id), Date.now());
        editor.requestRender();
        renderList();
      };

      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.style.cssText = btnCss + "color:#e55;";
      delBtn.onclick = () => {
        editor.engine.style_version_remove(BigInt(v.id));
        renderList();
      };

      actions.appendChild(diffBtn);
      actions.appendChild(rollbackBtn);
      actions.appendChild(delBtn);
      row.appendChild(actions);
      listContainer.appendChild(row);
    }
  }

  renderList();
  container.appendChild(section);
}

function showCreateModal(editor: Editor, onDone: () => void) {
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;";

  const modal = document.createElement("div");
  modal.style.cssText = "background:#252525;border:1px solid #444;border-radius:8px;padding:20px;width:320px;color:#ccc;";

  modal.innerHTML = `
    <div style="font-size:13px;font-weight:600;margin-bottom:12px;">Create Style Version</div>
    <label style="font-size:11px;color:#888;display:block;margin-bottom:4px;">Tag</label>
    <input id="sv-tag" style="width:100%;padding:6px 8px;font-size:12px;background:#1e1e1e;border:1px solid #444;border-radius:4px;color:#ccc;margin-bottom:8px;box-sizing:border-box;" placeholder="e.g. v1.0" />
    <label style="font-size:11px;color:#888;display:block;margin-bottom:4px;">Description</label>
    <input id="sv-desc" style="width:100%;padding:6px 8px;font-size:12px;background:#1e1e1e;border:1px solid #444;border-radius:4px;color:#ccc;margin-bottom:12px;box-sizing:border-box;" placeholder="Optional description" />
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button id="sv-cancel" style="padding:6px 14px;font-size:11px;border:1px solid #444;border-radius:4px;background:#2a2a2a;color:#aaa;cursor:pointer;">Cancel</button>
      <button id="sv-create" style="padding:6px 14px;font-size:11px;border:none;border-radius:4px;background:#4f46e5;color:#fff;cursor:pointer;">Create</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const tagInput = modal.querySelector("#sv-tag") as HTMLInputElement;
  const descInput = modal.querySelector("#sv-desc") as HTMLInputElement;
  tagInput.focus();

  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  modal.querySelector("#sv-cancel")!.addEventListener("click", close);
  modal.querySelector("#sv-create")!.addEventListener("click", () => {
    const tag = tagInput.value.trim() || `v${Date.now()}`;
    const desc = descInput.value.trim();
    editor.engine.style_version_create(tag, desc, Date.now());
    close();
    onDone();
  });
}

function showDiffModal(editor: Editor, versionId: number) {
  const json = editor.engine.style_version_diff_current(BigInt(versionId));
  const diffs: StyleDiff[] = JSON.parse(json);

  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;";

  const modal = document.createElement("div");
  modal.style.cssText = "background:#252525;border:1px solid #444;border-radius:8px;padding:20px;width:400px;max-height:500px;overflow-y:auto;color:#ccc;";

  let html = `<div style="font-size:13px;font-weight:600;margin-bottom:12px;">Diff vs Current</div>`;

  if (diffs.length === 0) {
    html += `<div style="font-size:11px;color:#888;padding:12px 0;">No differences found.</div>`;
  } else {
    for (const d of diffs) {
      const color = d.change === "added" ? "#22c55e" : d.change === "removed" ? "#ef4444" : "#f59e0b";
      const badge = `<span style="font-size:9px;padding:1px 4px;border-radius:2px;background:${color}22;color:${color};font-weight:600;">${d.change}</span>`;
      const kindBadge = `<span style="font-size:9px;padding:1px 4px;border-radius:2px;background:#4f46e522;color:#818cf8;">${d.kind}</span>`;
      html += `<div style="padding:6px 0;border-bottom:1px solid #333;">
        <div style="display:flex;gap:4px;align-items:center;">${kindBadge} ${badge} <span style="font-size:11px;">${d.name}</span></div>
        ${d.details ? `<div style="font-size:10px;color:#777;margin-top:2px;">${d.details}</div>` : ""}
      </div>`;
    }
  }

  html += `<div style="text-align:right;margin-top:12px;"><button id="sv-diff-close" style="padding:6px 14px;font-size:11px;border:1px solid #444;border-radius:4px;background:#2a2a2a;color:#aaa;cursor:pointer;">Close</button></div>`;

  modal.innerHTML = html;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  modal.querySelector("#sv-diff-close")!.addEventListener("click", () => overlay.remove());
}
