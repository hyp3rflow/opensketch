// Component Documentation Panel
// Shows and edits documentation for components (guidelines, props, examples, tags, links, changelog)

import type { Editor } from '../editor';

interface CompDoc {
  id: number;
  name: string;
  description: string;
  guidelines: string;
  tags: string[];
  links: { label: string; url: string }[];
  prop_docs: { name: string; description: string; default: string }[];
  examples: { title: string; description: string }[];
  changelog: string[];
}

export function createComponentDocsPanel(editor: Editor): {
  el: HTMLElement;
  update: () => void;
} {
  const el = document.createElement('div');
  el.className = 'component-docs-panel';
  el.style.cssText = 'display:none;padding:12px;overflow-y:auto;height:100%;font-size:12px;color:#e0e0e0;';

  let currentCompId: number | null = null;

  function getDoc(): CompDoc | null {
    if (currentCompId == null) return null;
    const json = (editor as any).engine?.get_component_doc(BigInt(currentCompId));
    if (!json || json === 'null') return null;
    try { return JSON.parse(json); } catch { return null; }
  }

  function render() {
    const doc = getDoc();
    if (!doc) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    el.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'font-size:14px;font-weight:600;margin-bottom:8px;color:#fff;';
    header.textContent = `📖 ${doc.name}`;
    el.appendChild(header);

    // Description
    el.appendChild(makeSection('Description', () => {
      const wrap = document.createElement('div');
      const ta = makeTextarea(doc.description, (v) => {
        (editor as any).engine?.set_component_description(BigInt(doc.id), v);
      });
      wrap.appendChild(ta);
      return wrap;
    }));

    // Guidelines
    el.appendChild(makeSection('Usage Guidelines', () => {
      const wrap = document.createElement('div');
      const ta = makeTextarea(doc.guidelines, (v) => {
        (editor as any).engine?.set_component_guidelines(BigInt(doc.id), v);
      }, 6);
      ta.placeholder = 'Write usage guidelines in Markdown...';
      wrap.appendChild(ta);
      // Preview
      if (doc.guidelines.trim()) {
        const preview = document.createElement('div');
        preview.style.cssText = 'margin-top:6px;padding:8px;background:#1e1e1e;border-radius:4px;white-space:pre-wrap;line-height:1.5;font-size:11px;color:#ccc;';
        preview.textContent = doc.guidelines;
        wrap.appendChild(preview);
      }
      return wrap;
    }));

    // Tags
    el.appendChild(makeSection('Tags', () => {
      const wrap = document.createElement('div');
      const tagsRow = document.createElement('div');
      tagsRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;';
      doc.tags.forEach(t => {
        const chip = document.createElement('span');
        chip.style.cssText = 'background:#333;padding:2px 8px;border-radius:10px;font-size:11px;color:#aaa;';
        chip.textContent = t;
        tagsRow.appendChild(chip);
      });
      wrap.appendChild(tagsRow);
      const input = makeInput(doc.tags.join(', '), (v) => {
        (editor as any).engine?.set_component_tags(BigInt(doc.id), v);
        render();
      });
      input.placeholder = 'tag1, tag2, ...';
      wrap.appendChild(input);
      return wrap;
    }));

    // Property Docs
    el.appendChild(makeSection('Property Docs', () => {
      const wrap = document.createElement('div');
      doc.prop_docs.forEach((p, _i) => {
        const row = document.createElement('div');
        row.style.cssText = 'margin-bottom:6px;padding:6px;background:#1e1e1e;border-radius:4px;';
        row.innerHTML = `<div style="font-weight:600;color:#fff;margin-bottom:2px;">${esc(p.name)}</div>
          <div style="color:#aaa;margin-bottom:2px;">${esc(p.description)}</div>
          <div style="color:#666;font-size:11px;">Default: ${esc(p.default)}</div>`;
        const delBtn = makeSmallBtn('×', () => {
          (editor as any).engine?.remove_component_prop_doc(BigInt(doc.id), p.name);
          render();
        });
        row.appendChild(delBtn);
        wrap.appendChild(row);
      });
      // Add new
      const addBtn = makeSmallBtn('+ Add Prop Doc', () => {
        const name = prompt('Property name:');
        if (!name) return;
        const desc = prompt('Description:') || '';
        const def = prompt('Default value:') || '';
        (editor as any).engine?.set_component_prop_doc(BigInt(doc.id), name, desc, def);
        render();
      });
      wrap.appendChild(addBtn);
      return wrap;
    }));

    // Examples
    el.appendChild(makeSection('Examples', () => {
      const wrap = document.createElement('div');
      doc.examples.forEach((e, i) => {
        const row = document.createElement('div');
        row.style.cssText = 'margin-bottom:6px;padding:6px;background:#1e1e1e;border-radius:4px;';
        row.innerHTML = `<div style="font-weight:600;color:#fff;">${esc(e.title)}</div>
          <div style="color:#aaa;font-size:11px;margin-top:2px;">${esc(e.description)}</div>`;
        const delBtn = makeSmallBtn('×', () => {
          (editor as any).engine?.remove_component_example(BigInt(doc.id), i);
          render();
        });
        row.appendChild(delBtn);
        wrap.appendChild(row);
      });
      const addBtn = makeSmallBtn('+ Add Example', () => {
        const title = prompt('Example title:');
        if (!title) return;
        const desc = prompt('Description:') || '';
        (editor as any).engine?.add_component_example(BigInt(doc.id), title, desc);
        render();
      });
      wrap.appendChild(addBtn);
      return wrap;
    }));

    // Links
    el.appendChild(makeSection('Links', () => {
      const wrap = document.createElement('div');
      doc.links.forEach((l, i) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
        const a = document.createElement('a');
        a.href = l.url;
        a.target = '_blank';
        a.style.cssText = 'color:#4a9eff;text-decoration:none;font-size:11px;';
        a.textContent = `🔗 ${l.label}`;
        row.appendChild(a);
        const delBtn = makeSmallBtn('×', () => {
          (editor as any).engine?.remove_component_link(BigInt(doc.id), i);
          render();
        });
        row.appendChild(delBtn);
        wrap.appendChild(row);
      });
      const addBtn = makeSmallBtn('+ Add Link', () => {
        const label = prompt('Link label:');
        if (!label) return;
        const url = prompt('URL:') || '';
        (editor as any).engine?.add_component_link(BigInt(doc.id), label, url);
        render();
      });
      wrap.appendChild(addBtn);
      return wrap;
    }));

    // Changelog
    el.appendChild(makeSection('Changelog', () => {
      const wrap = document.createElement('div');
      doc.changelog.forEach(entry => {
        const row = document.createElement('div');
        row.style.cssText = 'color:#888;font-size:11px;margin-bottom:3px;padding-left:8px;border-left:2px solid #333;';
        row.textContent = entry;
        wrap.appendChild(row);
      });
      const addBtn = makeSmallBtn('+ Add Entry', () => {
        const entry = prompt('Changelog entry:');
        if (!entry) return;
        (editor as any).engine?.add_component_changelog(BigInt(doc.id), entry);
        render();
      });
      wrap.appendChild(addBtn);
      return wrap;
    }));

    // Export button
    const exportBtn = document.createElement('button');
    exportBtn.textContent = '↓ Export All Docs';
    exportBtn.style.cssText = 'margin-top:12px;width:100%;padding:6px;background:#333;color:#ccc;border:none;border-radius:4px;cursor:pointer;font-size:11px;';
    exportBtn.onclick = () => {
      const json = (editor as any).engine?.export_component_docs();
      if (!json) return;
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'component-docs.json';
      a.click();
    };
    el.appendChild(exportBtn);
  }

  function update() {
    // Check if selected node is a component source or instance
    const sel = editor.getSelection?.();
    if (!sel || sel.length === 0) {
      currentCompId = null;
      el.style.display = 'none';
      return;
    }
    const nodeId = sel[0];
    // Check instance
    const infoJson = (editor as any).engine?.get_instance_component_info(BigInt(nodeId));
    if (infoJson && infoJson !== 'null') {
      try {
        const info = JSON.parse(infoJson);
        currentCompId = info.component_id;
        render();
        return;
      } catch {}
    }
    // Check if it's a component source (name starts with "[C]")
    const nodeJson = (editor as any).engine?.get_node_json(BigInt(nodeId));
    if (nodeJson) {
      try {
        const node = JSON.parse(nodeJson);
        if (node.name?.startsWith('[C]')) {
          // Find component by name
          const compListJson = (editor as any).engine?.get_components();
          if (compListJson) {
            const compList = JSON.parse(compListJson);
            const match = compList.find((c: any) => node.name.includes(c.name));
            if (match) {
              currentCompId = match.id;
              render();
              return;
            }
          }
        }
      } catch {}
    }
    currentCompId = null;
    el.style.display = 'none';
  }

  return { el, update };
}

// Helpers
function makeSection(title: string, contentFn: () => HTMLElement): HTMLElement {
  const section = document.createElement('div');
  section.style.cssText = 'margin-bottom:12px;';
  const label = document.createElement('div');
  label.style.cssText = 'font-size:11px;font-weight:600;color:#888;text-transform:uppercase;margin-bottom:4px;';
  label.textContent = title;
  section.appendChild(label);
  section.appendChild(contentFn());
  return section;
}

function makeTextarea(value: string, onChange: (v: string) => void, rows = 3): HTMLTextAreaElement {
  const ta = document.createElement('textarea');
  ta.value = value;
  ta.rows = rows;
  ta.style.cssText = 'width:100%;background:#1e1e1e;color:#ccc;border:1px solid #333;border-radius:4px;padding:6px;font-size:11px;resize:vertical;font-family:inherit;';
  ta.onblur = () => onChange(ta.value);
  return ta;
}

function makeInput(value: string, onChange: (v: string) => void): HTMLInputElement {
  const input = document.createElement('input');
  input.value = value;
  input.style.cssText = 'width:100%;background:#1e1e1e;color:#ccc;border:1px solid #333;border-radius:4px;padding:4px 6px;font-size:11px;';
  input.onblur = () => onChange(input.value);
  input.onkeydown = (e) => { if (e.key === 'Enter') { onChange(input.value); } };
  return input;
}

function makeSmallBtn(text: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.style.cssText = 'background:none;border:1px solid #444;color:#aaa;border-radius:3px;padding:1px 6px;font-size:10px;cursor:pointer;margin-left:4px;';
  btn.onclick = onClick;
  return btn;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
