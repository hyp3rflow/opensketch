import type { Editor } from "../editor";
import { icons } from "./icons";

interface OutgoingLink {
  target_id: number;
  target_name: string;
  link_type: string;
  label: string;
}

interface IncomingLink {
  source_id: number;
  source_name: string;
  link_type: string;
  label: string;
  index: number;
}

const LINK_TYPE_COLORS: Record<string, string> = {
  Reference: "#3b82f6",
  DependsOn: "#f59e0b",
  Related: "#6b7280",
};

const LINK_TYPE_LABELS: Record<string, string> = {
  Reference: "References",
  DependsOn: "Depends on",
  Related: "Related to",
};

export function createNodeLinksSection(
  container: HTMLElement,
  editor: Editor,
  nodeId: number,
  refreshPanel: () => void,
) {
  const section = document.createElement("div");
  section.style.cssText = "margin-top:4px;";

  const title = document.createElement("div");
  title.style.cssText =
    "display:flex;align-items:center;justify-content:space-between;padding:8px 0 6px;";
  const titleText = document.createElement("span");
  titleText.style.cssText =
    "font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px;";
  titleText.textContent = "Links";
  title.appendChild(titleText);

  const addBtn = document.createElement("button");
  addBtn.style.cssText =
    "background:none;border:1px solid #444;border-radius:4px;color:#888;cursor:pointer;font-size:10px;padding:2px 8px;transition:all 0.15s;";
  addBtn.textContent = "+ Add";
  addBtn.addEventListener("mouseenter", () => {
    addBtn.style.borderColor = "#4f46e5";
    addBtn.style.color = "#818cf8";
  });
  addBtn.addEventListener("mouseleave", () => {
    addBtn.style.borderColor = "#444";
    addBtn.style.color = "#888";
  });
  addBtn.addEventListener("click", () => showAddLinkDialog(editor, nodeId, refreshPanel));
  title.appendChild(addBtn);
  section.appendChild(title);

  // Outgoing links
  const outgoingJson = editor.engine.get_node_links(BigInt(nodeId));
  const outgoing: OutgoingLink[] = JSON.parse(outgoingJson || "[]");

  if (outgoing.length > 0) {
    const outLabel = document.createElement("div");
    outLabel.style.cssText = "font-size:10px;color:#666;margin-bottom:4px;";
    outLabel.textContent = "Outgoing";
    section.appendChild(outLabel);

    for (let i = 0; i < outgoing.length; i++) {
      section.appendChild(createLinkRow(editor, nodeId, i, outgoing[i]!, "outgoing", refreshPanel));
    }
  }

  // Incoming links
  const incomingJson = editor.engine.get_incoming_links(BigInt(nodeId));
  const incoming: IncomingLink[] = JSON.parse(incomingJson || "[]");

  if (incoming.length > 0) {
    const inLabel = document.createElement("div");
    inLabel.style.cssText = "font-size:10px;color:#666;margin-top:6px;margin-bottom:4px;";
    inLabel.textContent = "Incoming";
    section.appendChild(inLabel);

    for (const link of incoming) {
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;gap:6px;padding:4px 6px;background:#1e1e1e;border-radius:6px;margin-bottom:3px;font-size:11px;";
      const dot = document.createElement("span");
      dot.style.cssText = `width:6px;height:6px;border-radius:50%;background:${LINK_TYPE_COLORS[link.link_type] || "#666"};flex-shrink:0;`;
      row.appendChild(dot);

      const nameSpan = document.createElement("span");
      nameSpan.style.cssText = "color:#aaa;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;";
      nameSpan.textContent = `${link.source_name} → this`;
      nameSpan.title = `${LINK_TYPE_LABELS[link.link_type] || link.link_type}${link.label ? ": " + link.label : ""}`;
      nameSpan.addEventListener("click", () => {
        editor.engine.select(BigInt(link.source_id));
        editor.requestRender();
        editor.fireSelectionNow([link.source_id]);
      });
      row.appendChild(nameSpan);

      const typeSpan = document.createElement("span");
      typeSpan.style.cssText = `font-size:9px;color:${LINK_TYPE_COLORS[link.link_type] || "#666"};`;
      typeSpan.textContent = link.link_type;
      row.appendChild(typeSpan);

      section.appendChild(row);
    }
  }

  if (outgoing.length === 0 && incoming.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText = "font-size:11px;color:#555;padding:4px 0;";
    empty.textContent = "No links";
    section.appendChild(empty);
  }

  container.appendChild(section);
}

function createLinkRow(
  editor: Editor,
  nodeId: number,
  index: number,
  link: OutgoingLink,
  _direction: string,
  refreshPanel: () => void,
): HTMLElement {
  const row = document.createElement("div");
  row.style.cssText =
    "display:flex;align-items:center;gap:6px;padding:4px 6px;background:#1e1e1e;border-radius:6px;margin-bottom:3px;font-size:11px;";

  const dot = document.createElement("span");
  dot.style.cssText = `width:6px;height:6px;border-radius:50%;background:${LINK_TYPE_COLORS[link.link_type] || "#666"};flex-shrink:0;`;
  row.appendChild(dot);

  const nameSpan = document.createElement("span");
  nameSpan.style.cssText = "color:#ccc;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;";
  nameSpan.textContent = link.target_name + (link.label ? ` (${link.label})` : "");
  nameSpan.title = `${LINK_TYPE_LABELS[link.link_type] || link.link_type}: ${link.target_name}`;
  nameSpan.addEventListener("click", () => {
    editor.engine.select(BigInt(link.target_id));
    editor.requestRender();
    editor.fireSelectionNow([link.target_id]);
  });
  row.appendChild(nameSpan);

  const typeSpan = document.createElement("span");
  typeSpan.style.cssText = `font-size:9px;color:${LINK_TYPE_COLORS[link.link_type] || "#666"};`;
  typeSpan.textContent = link.link_type;
  row.appendChild(typeSpan);

  const delBtn = document.createElement("button");
  delBtn.style.cssText = "background:none;border:none;color:#666;cursor:pointer;font-size:12px;padding:0 2px;";
  delBtn.textContent = "×";
  delBtn.title = "Remove link";
  delBtn.addEventListener("click", () => {
    editor.engine.push_undo();
    editor.engine.remove_node_link(BigInt(nodeId), index);
    refreshPanel();
  });
  row.appendChild(delBtn);

  return row;
}

function showAddLinkDialog(editor: Editor, nodeId: number, refreshPanel: () => void) {
  // Simple modal overlay
  const backdrop = document.createElement("div");
  backdrop.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;";

  const dialog = document.createElement("div");
  dialog.style.cssText =
    "background:#2a2a2a;border:1px solid #444;border-radius:12px;padding:20px;width:320px;color:#ccc;";

  const titleEl = document.createElement("div");
  titleEl.style.cssText = "font-size:14px;font-weight:600;margin-bottom:16px;";
  titleEl.textContent = "Add Link";
  dialog.appendChild(titleEl);

  const inputCss = "width:100%;padding:6px 8px;font-size:12px;border:1px solid #444;border-radius:6px;background:#1e1e1e;color:#ccc;box-sizing:border-box;margin-bottom:10px;";
  const labelCss = "font-size:11px;color:#888;margin-bottom:4px;display:block;";

  // Target node ID
  const targetLabel = document.createElement("label");
  targetLabel.style.cssText = labelCss;
  targetLabel.textContent = "Target Node ID";
  dialog.appendChild(targetLabel);

  const targetInput = document.createElement("input");
  targetInput.type = "number";
  targetInput.style.cssText = inputCss;
  targetInput.placeholder = "Enter node ID...";
  dialog.appendChild(targetInput);

  // Link type
  const typeLabel = document.createElement("label");
  typeLabel.style.cssText = labelCss;
  typeLabel.textContent = "Link Type";
  dialog.appendChild(typeLabel);

  const typeSelect = document.createElement("select");
  typeSelect.style.cssText = inputCss;
  for (const [val, label] of [
    ["Reference", "Reference"],
    ["DependsOn", "Depends On"],
    ["Related", "Related"],
  ]) {
    const opt = document.createElement("option");
    opt.value = val!;
    opt.textContent = label;
    typeSelect.appendChild(opt);
  }
  dialog.appendChild(typeSelect);

  // Label
  const lblLabel = document.createElement("label");
  lblLabel.style.cssText = labelCss;
  lblLabel.textContent = "Label (optional)";
  dialog.appendChild(lblLabel);

  const lblInput = document.createElement("input");
  lblInput.style.cssText = inputCss;
  lblInput.placeholder = "Description...";
  dialog.appendChild(lblInput);

  // Buttons
  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:8px;";

  const cancelBtn = document.createElement("button");
  cancelBtn.style.cssText = "padding:6px 16px;border:1px solid #444;border-radius:6px;background:#333;color:#ccc;cursor:pointer;font-size:12px;";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => backdrop.remove());

  const addSubmitBtn = document.createElement("button");
  addSubmitBtn.style.cssText = "padding:6px 16px;border:none;border-radius:6px;background:#4f46e5;color:#fff;cursor:pointer;font-size:12px;font-weight:500;";
  addSubmitBtn.textContent = "Add Link";
  addSubmitBtn.addEventListener("click", () => {
    const targetId = parseInt(targetInput.value);
    if (isNaN(targetId)) return;
    editor.engine.push_undo();
    const result = editor.engine.add_node_link(
      BigInt(nodeId),
      BigInt(targetId),
      typeSelect.value,
      lblInput.value,
    );
    if (result < 0) {
      alert("Failed to add link. Check that the target node exists and is not the same node.");
      return;
    }
    backdrop.remove();
    refreshPanel();
    editor.requestRender();
  });

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(addSubmitBtn);
  dialog.appendChild(btnRow);

  backdrop.appendChild(dialog);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
  document.body.appendChild(backdrop);
  targetInput.focus();
}
