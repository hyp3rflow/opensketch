import type { Editor } from "../editor";
import { icons } from "./icons";

/**
 * Component Search & Swap panel.
 * Opens as a modal when user clicks "Swap Component" on an Instance node.
 */
export function openComponentSwapDialog(editor: Editor, instanceId: number) {
  // Remove existing dialog if any
  const existing = document.getElementById("comp-swap-dialog");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "comp-swap-dialog";
  overlay.style.cssText = `
    position:fixed;top:0;left:0;right:0;bottom:0;
    background:rgba(0,0,0,0.5);z-index:10000;
    display:flex;align-items:center;justify-content:center;
  `;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  const dialog = document.createElement("div");
  dialog.style.cssText = `
    background:#1e1e1e;border:1px solid #333;border-radius:12px;
    width:360px;max-height:480px;display:flex;flex-direction:column;
    box-shadow:0 16px 48px rgba(0,0,0,0.5);overflow:hidden;
  `;

  // Header
  const header = document.createElement("div");
  header.style.cssText = "padding:16px;border-bottom:1px solid #333;";
  const title = document.createElement("div");
  title.style.cssText = "font-size:13px;font-weight:600;color:#ccc;margin-bottom:10px;";
  title.textContent = "Swap Component";
  header.appendChild(title);

  // Current component info
  const infoJson = editor.engine.get_instance_component_info(BigInt(instanceId));
  const info = JSON.parse(infoJson);
  if (info) {
    const current = document.createElement("div");
    current.style.cssText = "font-size:11px;color:#666;margin-bottom:8px;";
    current.textContent = `Current: ${info.component_name}`;
    header.appendChild(current);
  }

  // Search input
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search components…";
  searchInput.style.cssText = `
    width:100%;box-sizing:border-box;padding:8px 12px;
    background:#2a2a2a;border:1px solid #444;border-radius:6px;
    color:#ccc;font-size:12px;outline:none;
  `;
  searchInput.addEventListener("focus", () => { searchInput.style.borderColor = "#4f46e5"; });
  searchInput.addEventListener("blur", () => { searchInput.style.borderColor = "#444"; });
  header.appendChild(searchInput);
  dialog.appendChild(header);

  // Results list
  const resultsList = document.createElement("div");
  resultsList.style.cssText = "flex:1;overflow-y:auto;padding:8px;";
  dialog.appendChild(resultsList);

  function renderResults(query: string) {
    resultsList.innerHTML = "";
    const json = editor.engine.search_components(query);
    const components: any[] = JSON.parse(json || "[]");

    if (components.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "text-align:center;color:#555;font-size:11px;padding:20px;";
      empty.textContent = query ? "No components found" : "Type to search";
      resultsList.appendChild(empty);
      return;
    }

    for (const comp of components) {
      // Skip current component
      if (info && comp.id === info.component_id) continue;

      const item = document.createElement("div");
      item.style.cssText = `
        display:flex;align-items:center;gap:8px;
        padding:8px 10px;border-radius:6px;cursor:pointer;
        transition:background 0.1s;
      `;
      item.addEventListener("mouseenter", () => { item.style.background = "#2a2a2a"; });
      item.addEventListener("mouseleave", () => { item.style.background = "transparent"; });

      const icon = document.createElement("span");
      icon.innerHTML = icons.component.replace(/width="\d+"/, 'width="14"').replace(/height="\d+"/, 'height="14"');
      icon.style.cssText = "opacity:0.6;color:#10b981;flex-shrink:0;display:flex;";
      item.appendChild(icon);

      const textWrap = document.createElement("div");
      textWrap.style.cssText = "flex:1;min-width:0;";
      const nameEl = document.createElement("div");
      nameEl.style.cssText = "font-size:12px;color:#ccc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      nameEl.textContent = comp.name;
      textWrap.appendChild(nameEl);
      if (comp.description) {
        const descEl = document.createElement("div");
        descEl.style.cssText = "font-size:10px;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
        descEl.textContent = comp.description;
        textWrap.appendChild(descEl);
      }
      item.appendChild(textWrap);

      if (comp.variant_count > 1) {
        const badge = document.createElement("span");
        badge.style.cssText = "font-size:9px;color:#8b5cf6;background:rgba(139,92,246,0.1);padding:2px 6px;border-radius:3px;flex-shrink:0;";
        badge.textContent = `${comp.variant_count} variants`;
        item.appendChild(badge);
      }

      const swapBtn = document.createElement("button");
      swapBtn.style.cssText = `
        background:rgba(79,70,229,0.15);border:1px solid rgba(79,70,229,0.3);
        border-radius:6px;padding:4px 10px;color:#818cf8;
        cursor:pointer;font-size:11px;font-weight:500;flex-shrink:0;
        transition:all 0.15s;
      `;
      swapBtn.textContent = "Swap";
      swapBtn.addEventListener("mouseenter", () => { swapBtn.style.background = "rgba(79,70,229,0.3)"; });
      swapBtn.addEventListener("mouseleave", () => { swapBtn.style.background = "rgba(79,70,229,0.15)"; });
      swapBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        editor.engine.push_undo();
        const ok = editor.engine.swap_instance_component(BigInt(instanceId), BigInt(comp.id));
        if (ok) {
          editor.requestRender();
          editor.notifyLayersChanged();
          // Re-trigger properties panel refresh
          editor.fireSelectionNow([instanceId]);
          overlay.remove();
        }
      });
      item.appendChild(swapBtn);

      resultsList.appendChild(item);
    }
  }

  // Initial render with empty query shows all
  renderResults("");

  searchInput.addEventListener("input", () => {
    renderResults(searchInput.value.trim());
  });

  // Escape to close
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", onKey); }
  };
  document.addEventListener("keydown", onKey);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  setTimeout(() => searchInput.focus(), 50);
}
