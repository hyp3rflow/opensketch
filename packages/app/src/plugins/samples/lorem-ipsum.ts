/**
 * Lorem Ipsum Generator Plugin
 * Adds a panel that generates lorem ipsum text nodes on the canvas.
 */

import type { Plugin, PluginAPI } from "../types";

const LOREM_PARAGRAPHS = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
  "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
  "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
  "Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra.",
];

const LOREM_SENTENCES = [
  "Lorem ipsum dolor sit amet.",
  "Consectetur adipiscing elit.",
  "Sed do eiusmod tempor incididunt.",
  "Ut labore et dolore magna aliqua.",
  "Ut enim ad minim veniam.",
];

export const LoremIpsumPlugin: Plugin = {
  id: "lorem-ipsum",
  name: "Lorem Ipsum Generator",
  version: "1.0.0",
  description: "Generate placeholder text on the canvas",
  icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 3h12M2 6h10M2 9h12M2 12h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,

  activate(api: PluginAPI) {
    let count = 1;

    api.ui.registerPanel({
      id: "lorem-ipsum-panel",
      title: "Lorem Ipsum",
      render(container: HTMLElement) {
        container.innerHTML = `
          <div style="padding:12px;display:flex;flex-direction:column;gap:8px;">
            <label style="font-size:11px;color:#999;">Type</label>
            <select id="lorem-type" style="padding:6px 8px;border-radius:6px;border:1px solid #444;background:#2a2a2a;color:#ccc;font-size:12px;">
              <option value="paragraph">Paragraph</option>
              <option value="sentence">Sentence</option>
              <option value="words">Words (5)</option>
              <option value="title">Title</option>
            </select>
            <label style="font-size:11px;color:#999;">Count</label>
            <input id="lorem-count" type="number" min="1" max="10" value="1"
              style="padding:6px 8px;border-radius:6px;border:1px solid #444;background:#2a2a2a;color:#ccc;font-size:12px;width:60px;" />
            <button id="lorem-generate" style="padding:8px 12px;border-radius:6px;border:none;background:#7c5cfc;color:#fff;cursor:pointer;font-size:12px;margin-top:4px;">
              Generate Text
            </button>
            <button id="lorem-fill" style="padding:8px 12px;border-radius:6px;border:none;background:#444;color:#ccc;cursor:pointer;font-size:12px;">
              Fill Selected Node
            </button>
          </div>
        `;

        container.querySelector("#lorem-generate")!.addEventListener("click", () => {
          const type = (container.querySelector("#lorem-type") as HTMLSelectElement).value;
          const n = parseInt((container.querySelector("#lorem-count") as HTMLInputElement).value) || 1;
          const text = generateLorem(type, n);
          const id = api.scene.addText(100, 100 + count * 30, text, type === "title" ? 24 : 14);
          api.scene.setName(id, `Lorem ${count}`);
          api.scene.select(id);
          count++;
          api.ui.showNotification("Lorem ipsum text created!", "success");
        });

        container.querySelector("#lorem-fill")!.addEventListener("click", () => {
          const sel = api.scene.getSelection();
          if (sel.length === 0) {
            api.ui.showNotification("Select a text node first", "error");
            return;
          }
          const type = (container.querySelector("#lorem-type") as HTMLSelectElement).value;
          const n = parseInt((container.querySelector("#lorem-count") as HTMLInputElement).value) || 1;
          const text = generateLorem(type, n);
          for (const id of sel) {
            const node = api.scene.getNodeJson(id);
            if (node?.kind === "Text") {
              api.editor.engine.set_text_content(BigInt(id), text);
              api.editor.requestRender();
            }
          }
          api.ui.showNotification("Text content updated!", "success");
        });
      },
    });

    api.ui.addToolbarButton({
      id: "lorem-quick",
      title: "Quick Lorem Ipsum",
      icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 3h12M2 6h10M2 9h12M2 12h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
      onClick() {
        const text = LOREM_PARAGRAPHS[Math.floor(Math.random() * LOREM_PARAGRAPHS.length)];
        const id = api.scene.addText(100, 100 + count * 30, text, 14);
        api.scene.setName(id, `Lorem ${count}`);
        api.scene.select(id);
        count++;
      },
    });
  },

  deactivate() {},
};

function generateLorem(type: string, count: number): string {
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    switch (type) {
      case "paragraph":
        parts.push(LOREM_PARAGRAPHS[i % LOREM_PARAGRAPHS.length]);
        break;
      case "sentence":
        parts.push(LOREM_SENTENCES[i % LOREM_SENTENCES.length]);
        break;
      case "words":
        parts.push(LOREM_PARAGRAPHS[0].split(" ").slice(0, 5).join(" "));
        break;
      case "title":
        parts.push("Lorem Ipsum Dolor Sit");
        break;
    }
  }
  return parts.join("\n\n");
}
