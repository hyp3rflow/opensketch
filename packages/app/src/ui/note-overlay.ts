import type { Editor } from "../editor";
import { icons } from "./icons";

interface NoteCard {
  nodeId: number;
  el: HTMLElement;
}

export function setupNoteOverlay(container: HTMLElement, editor: Editor) {
  const overlay = document.createElement("div");
  overlay.id = "note-overlay";
  container.appendChild(overlay);

  let cards: NoteCard[] = [];
  let enabled = false;
  // Track which notes are expanded (nodeId)
  const expanded = new Set<number>();

  function sceneToScreen(sx: number, sy: number): [number, number] {
    const zoom = editor.engine.get_zoom();
    const ox = editor.engine.screen_to_scene_x(0, 0);
    const oy = editor.engine.screen_to_scene_y(0, 0);
    return [(sx - ox) * zoom, (sy - oy) * zoom];
  }

  function update() {
    // Clear old cards
    overlay.innerHTML = "";
    cards = [];

    if (!enabled) return;

    const layers: any[] = JSON.parse(editor.engine.get_layer_list());

    for (const layer of layers) {
      const json = editor.engine.get_node_json(BigInt(layer.id));
      if (!json) continue;
      const node = JSON.parse(json);
      if (!node.notes || node.notes.length === 0) continue;

      const isExpanded = expanded.has(layer.id);

      // Position card to the right of the node
      const [sx, sy] = sceneToScreen(node.x + node.width + 12, node.y);

      const card = document.createElement("div");
      card.className = "note-card" + (isExpanded ? " expanded" : "");
      card.style.left = `${sx}px`;
      card.style.top = `${sy}px`;

      // Header
      const header = document.createElement("div");
      header.className = "note-card-header";

      const badge = document.createElement("span");
      badge.className = "note-card-badge";
      const noteIcon = icons.note.replace(/width="\d+"/, 'width="12"').replace(/height="\d+"/, 'height="12"');
      badge.innerHTML = `${noteIcon} <span>${node.notes.length}</span>`;

      const title = document.createElement("span");
      title.className = "note-card-title";
      title.textContent = node.name;

      header.appendChild(badge);
      header.appendChild(title);
      header.style.cursor = "pointer";
      header.addEventListener("click", (e) => {
        e.stopPropagation();
        if (expanded.has(layer.id)) expanded.delete(layer.id);
        else expanded.add(layer.id);
        update();
      });

      card.appendChild(header);

      if (isExpanded) {
        for (const note of node.notes) {
          const noteEl = document.createElement("div");
          noteEl.className = "note-card-content";

          if (note.tags?.length) {
            const tagsEl = document.createElement("div");
            tagsEl.className = "note-card-tags";
            note.tags.forEach((t: string) => {
              const tag = document.createElement("span");
              tag.className = "note-card-tag";
              tag.textContent = t;
              tagsEl.appendChild(tag);
            });
            noteEl.appendChild(tagsEl);
          }

          const text = document.createElement("div");
          text.className = "note-card-text";
          // Simple markdown: headers, bold, lists
          text.innerHTML = renderSimpleMarkdown(note.content);
          noteEl.appendChild(text);

          card.appendChild(noteEl);
        }
      }

      overlay.appendChild(card);
      cards.push({ nodeId: layer.id, el: card });
    }
  }

  // Re-position on render (viewport changes)
  function reposition() {
    if (!enabled) return;
    const layers: any[] = JSON.parse(editor.engine.get_layer_list());
    const nodeMap = new Map<number, any>();
    for (const l of layers) {
      const json = editor.engine.get_node_json(BigInt(l.id));
      if (json) nodeMap.set(l.id, JSON.parse(json));
    }

    for (const card of cards) {
      const node = nodeMap.get(card.nodeId);
      if (!node) continue;
      const [sx, sy] = sceneToScreen(node.x + node.width + 12, node.y);
      card.el.style.left = `${sx}px`;
      card.el.style.top = `${sy}px`;
    }
  }

  // Simple markdown renderer
  function renderSimpleMarkdown(md: string): string {
    return md
      .split("\n")
      .map((line) => {
        if (line.startsWith("### ")) return `<div class="note-md-h3">${line.slice(4)}</div>`;
        if (line.startsWith("## ")) return `<div class="note-md-h2">${line.slice(3)}</div>`;
        if (line.startsWith("# ")) return `<div class="note-md-h1">${line.slice(2)}</div>`;
        if (line.startsWith("- ")) return `<div class="note-md-li">• ${line.slice(2)}</div>`;
        if (line.startsWith("* ")) return `<div class="note-md-li">• ${line.slice(2)}</div>`;
        if (line.trim() === "") return `<div class="note-md-br"></div>`;
        // Bold
        const bolded = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
        // Code
        const coded = bolded.replace(/`(.+?)`/g, '<code class="note-md-code">$1</code>');
        return `<div>${coded}</div>`;
      })
      .join("");
  }

  // Poll for viewport changes (cheap — just reposition)
  let lastZoom = 0;
  const pollReposition = () => {
    if (enabled) {
      const zoom = editor.engine.get_zoom();
      if (zoom !== lastZoom) {
        lastZoom = zoom;
        update(); // Rebuild on zoom change for proper sizing
      }
    }
    requestAnimationFrame(pollReposition);
  };
  pollReposition();

  // Listen for render requests to reposition
  const origRequest = editor.requestRender.bind(editor);
  editor.requestRender = () => {
    origRequest();
    requestAnimationFrame(reposition);
  };

  return {
    setEnabled(v: boolean) {
      enabled = v;
      overlay.style.display = v ? "block" : "none";
      if (v) update();
      else overlay.innerHTML = "";
    },
    refresh: update,
  };
}
