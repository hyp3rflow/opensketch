import type { Editor } from "../editor";
import { icons } from "./icons";

interface Message {
  role: "user" | "agent" | "system";
  content: string;
  timestamp: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// ============================================================
// Tool definitions — each tool is a function the agent can call
// ============================================================

interface Tool {
  name: string;
  description: string;
  usage: string;
  pattern: RegExp;
  execute: (match: RegExpMatchArray, editor: Editor) => string;
}

function buildTools(): Tool[] {
  return [
    // === Scene I/O ===
    {
      name: "export",
      description: "Export the entire scene as JSON",
      usage: "export",
      pattern: /^export$/i,
      execute: (_m, editor) => {
        const json = editor.engine.export_scene();
        return json;
      },
    },
    {
      name: "import",
      description: "Import a scene from JSON (replaces current)",
      usage: 'import <json>',
      pattern: /^import\s+(.+)$/is,
      execute: (m, editor) => {
        const ok = editor.engine.import_scene(m[1]!);
        editor.requestRender();
        return ok ? "Scene imported successfully." : "Failed to parse scene JSON.";
      },
    },
    {
      name: "save",
      description: "Save scene to localStorage",
      usage: "save [name]",
      pattern: /^save(?:\s+(.+))?$/i,
      execute: (m, editor) => {
        const name = m[1]?.trim() || "default";
        const json = editor.engine.export_scene();
        localStorage.setItem(`opensketch-scene-${name}`, json);
        return `Scene saved as "${name}" (${(json.length / 1024).toFixed(1)}KB)`;
      },
    },
    {
      name: "load",
      description: "Load scene from localStorage",
      usage: "load [name]",
      pattern: /^load(?:\s+(.+))?$/i,
      execute: (m, editor) => {
        const name = m[1]?.trim() || "default";
        const json = localStorage.getItem(`opensketch-scene-${name}`);
        if (!json) return `No saved scene "${name}" found.`;
        const ok = editor.engine.import_scene(json);
        editor.requestRender();
        return ok ? `Loaded scene "${name}".` : "Failed to parse saved scene.";
      },
    },
    {
      name: "saves",
      description: "List saved scenes",
      usage: "saves",
      pattern: /^saves$/i,
      execute: () => {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith("opensketch-scene-")) {
            const name = key.replace("opensketch-scene-", "");
            const size = (localStorage.getItem(key)!.length / 1024).toFixed(1);
            keys.push(`  ${name} (${size}KB)`);
          }
        }
        return keys.length ? "Saved scenes:\n" + keys.join("\n") : "No saved scenes.";
      },
    },

    // === Frame Tools ===
    {
      name: "frames",
      description: "List all frames",
      usage: "frames",
      pattern: /^frames$/i,
      execute: (_m, editor) => {
        const frames = JSON.parse(editor.engine.get_frames());
        if (frames.length === 0) return "No frames on canvas.";
        return frames.map((f: any) =>
          `#${f.id} "${f.name}" at (${f.x}, ${f.y}) ${f.width}×${f.height} [${f.children_count} children]`
        ).join("\n");
      },
    },
    {
      name: "frame-children",
      description: "List direct children of a frame",
      usage: "children <frame_id>",
      pattern: /^children\s+(\d+)$/i,
      execute: (m, editor) => {
        const children = JSON.parse(editor.engine.get_frame_children(BigInt(m[1]!)));
        if (children.length === 0) return "No children.";
        return children.map((c: any) => `#${c.id} "${c.name}" (${getKindStr(c.kind)})`).join("\n");
      },
    },
    {
      name: "frame-tree",
      description: "Get full subtree of a frame as JSON",
      usage: "tree <frame_id>",
      pattern: /^tree\s+(\d+)$/i,
      execute: (m, editor) => {
        return editor.engine.get_frame_tree(BigInt(m[1]!));
      },
    },
    {
      name: "reparent",
      description: "Move a node into a frame (or to root)",
      usage: "reparent <node_id> <frame_id|root>",
      pattern: /^reparent\s+(\d+)\s+(\d+|root)$/i,
      execute: (m, editor) => {
        const nodeId = BigInt(m[1]!);
        const parent = m[2]!.toLowerCase() === "root" ? undefined : BigInt(m[2]!);
        editor.engine.reparent_node(nodeId, parent);
        editor.requestRender();
        return `Moved node #${m[1]} ${parent ? `into frame #${m[2]}` : "to root"}`;
      },
    },
    {
      name: "duplicate",
      description: "Duplicate a node",
      usage: "duplicate <node_id>",
      pattern: /^(?:duplicate|dup)\s+(\d+)$/i,
      execute: (m, editor) => {
        const newId = editor.engine.duplicate_node(BigInt(m[1]!));
        if (newId === BigInt(0)) return "Node not found.";
        editor.engine.select(newId);
        editor.requestRender();
        return `Duplicated → new node #${newId}`;
      },
    },

    // === Query ===
    {
      name: "inspect",
      description: "Get full JSON of a node",
      usage: "inspect <node_id>",
      pattern: /^inspect\s+(\d+)$/i,
      execute: (m, editor) => {
        const json = editor.engine.get_node_json(BigInt(m[1]!));
        return json || "Node not found.";
      },
    },
    {
      name: "find",
      description: "Find nodes by name",
      usage: "find <query>",
      pattern: /^find\s+(.+)$/i,
      execute: (m, editor) => {
        const results = JSON.parse(editor.engine.find_by_name(m[1]!));
        if (results.length === 0) return "No matches.";
        return results.map((r: any) => `#${r.id} "${r.name}" (${r.kind})`).join("\n");
      },
    },
    {
      name: "list",
      description: "List all elements",
      usage: "list",
      pattern: /^(?:list|layers)$/i,
      execute: (_m, editor) => {
        const layers = JSON.parse(editor.engine.get_layer_list());
        if (layers.length === 0) return "Empty canvas.";
        return layers.map((l: any) =>
          `#${l.id} ${l.name} (${l.kind}${l.visible ? "" : ", hidden"})`
        ).join("\n");
      },
    },

    // === Create ===
    {
      name: "add-rect",
      description: "Add a rectangle",
      usage: "add rect <x> <y> <w> <h>",
      pattern: /^add\s+rect(?:angle)?\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/i,
      execute: (m, editor) => {
        const id = editor.engine.add_rect(+m[1]!, +m[2]!, +m[3]!, +m[4]!);
        editor.engine.select(id);
        editor.requestRender();
        return `Created rect #${id}`;
      },
    },
    {
      name: "add-ellipse",
      description: "Add an ellipse/circle",
      usage: "add circle <x> <y> <w> <h>",
      pattern: /^add\s+(?:circle|ellipse)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/i,
      execute: (m, editor) => {
        const id = editor.engine.add_ellipse(+m[1]!, +m[2]!, +m[3]!, +m[4]!);
        editor.engine.select(id);
        editor.requestRender();
        return `Created ellipse #${id}`;
      },
    },
    {
      name: "add-text",
      description: "Add a text node",
      usage: 'add text "<content>" <x> <y> [size]',
      pattern: /^add\s+text\s+"([^"]+)"\s+(\d+)\s+(\d+)(?:\s+(\d+))?$/i,
      execute: (m, editor) => {
        const id = editor.engine.add_text(+m[2]!, +m[3]!, m[1]!, +(m[4] || 16));
        editor.engine.select(id);
        editor.requestRender();
        return `Created text #${id} "${m[1]}"`;
      },
    },
    {
      name: "add-frame",
      description: "Add a frame",
      usage: "add frame <x> <y> <w> <h>",
      pattern: /^add\s+frame\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/i,
      execute: (m, editor) => {
        const id = editor.engine.add_frame(+m[1]!, +m[2]!, +m[3]!, +m[4]!);
        editor.engine.select(id);
        editor.requestRender();
        return `Created frame #${id}`;
      },
    },

    // === Modify ===
    {
      name: "fill",
      description: "Set fill color of selection",
      usage: "fill #hex",
      pattern: /^fill\s+(#[0-9a-f]{6})/i,
      execute: (m, editor) => {
        const sel = editor.engine.get_selection();
        if (sel.length === 0) return "No selection.";
        const [r, g, b] = hexToRgb(m[1]!);
        for (const id of sel) editor.engine.set_fill_color(id, r, g, b, 1.0);
        editor.requestRender();
        return `Fill → ${m[1]} (${sel.length} elements)`;
      },
    },
    {
      name: "stroke",
      description: "Set stroke of selection",
      usage: "stroke #hex [width]",
      pattern: /^stroke\s+(#[0-9a-f]{6})(?:\s+(\d+))?/i,
      execute: (m, editor) => {
        const sel = editor.engine.get_selection();
        if (sel.length === 0) return "No selection.";
        const [r, g, b] = hexToRgb(m[1]!);
        const w = +(m[2] || 1);
        for (const id of sel) editor.engine.set_stroke(id, r, g, b, 1.0, w);
        editor.requestRender();
        return `Stroke → ${m[1]} ${w}px`;
      },
    },
    {
      name: "opacity",
      description: "Set opacity (0-100)",
      usage: "opacity <value>",
      pattern: /^opacity\s+(\d+)$/i,
      execute: (m, editor) => {
        const sel = editor.engine.get_selection();
        if (sel.length === 0) return "No selection.";
        for (const id of sel) editor.engine.set_opacity(id, +m[1]! / 100);
        editor.requestRender();
        return `Opacity → ${m[1]}%`;
      },
    },
    {
      name: "radius",
      description: "Set corner radius",
      usage: "radius <value>",
      pattern: /^radius\s+(\d+)$/i,
      execute: (m, editor) => {
        const sel = editor.engine.get_selection();
        if (sel.length === 0) return "No selection.";
        for (const id of sel) editor.engine.set_corner_radius(id, +m[1]!);
        editor.requestRender();
        return `Corner radius → ${m[1]}`;
      },
    },
    {
      name: "move",
      description: "Move selection by dx, dy",
      usage: "move <dx> <dy>",
      pattern: /^move\s+(-?\d+)\s+(-?\d+)$/i,
      execute: (m, editor) => {
        const sel = editor.engine.get_selection();
        if (sel.length === 0) return "No selection.";
        for (const id of sel) editor.engine.move_node(id, +m[1]!, +m[2]!);
        editor.requestRender();
        return `Moved by (${m[1]}, ${m[2]})`;
      },
    },
    {
      name: "resize",
      description: "Resize selection",
      usage: "resize <w> <h>",
      pattern: /^resize\s+(\d+)\s+(\d+)$/i,
      execute: (m, editor) => {
        const sel = editor.engine.get_selection();
        if (sel.length === 0) return "No selection.";
        for (const id of sel) editor.engine.resize_node(id, +m[1]!, +m[2]!);
        editor.requestRender();
        return `Resized → ${m[1]}×${m[2]}`;
      },
    },
    {
      name: "rename",
      description: "Rename selected node",
      usage: 'rename "<name>"',
      pattern: /^rename\s+"([^"]+)"$/i,
      execute: (m, editor) => {
        const sel = editor.engine.get_selection();
        if (sel.length === 0) return "No selection.";
        editor.engine.set_node_name(sel[0]!, m[1]!);
        return `Renamed → "${m[1]}"`;
      },
    },
    {
      name: "select",
      description: "Select a node by id",
      usage: "select <id>",
      pattern: /^select\s+(\d+)$/i,
      execute: (m, editor) => {
        editor.selectNode(+m[1]!);
        return `Selected #${m[1]}`;
      },
    },
    {
      name: "delete",
      description: "Delete selected elements",
      usage: "delete",
      pattern: /^(?:delete|remove)$/i,
      execute: (_m, editor) => {
        const sel = editor.engine.get_selection();
        if (sel.length === 0) return "No selection.";
        for (const id of sel) editor.engine.remove_node(id);
        editor.engine.deselect_all();
        editor.requestRender();
        return `Deleted ${sel.length} element(s)`;
      },
    },
    {
      name: "clear",
      description: "Clear entire canvas",
      usage: "clear",
      pattern: /^clear(?:\s+all)?$/i,
      execute: (_m, editor) => {
        const layers = JSON.parse(editor.engine.get_layer_list());
        for (const l of layers) editor.engine.remove_node(BigInt(l.id));
        editor.engine.deselect_all();
        editor.requestRender();
        return `Cleared ${layers.length} elements`;
      },
    },
    // === Components ===
    {
      name: "create-component",
      description: "Create a component from a frame",
      usage: 'component create <frame_id> "<name>"',
      pattern: /^component\s+create\s+(\d+)\s+"([^"]+)"$/i,
      execute: (m, editor) => {
        const id = editor.engine.create_component(BigInt(m[1]!), m[2]!);
        if (id === BigInt(0)) return "Failed.";
        editor.requestRender();
        return `Created component "${m[2]}" (id: ${id})`;
      },
    },
    {
      name: "add-prop",
      description: 'Add variant property: boolean or string',
      usage: 'component prop <comp_id> "<name>" <type_json>',
      pattern: /^component\s+prop\s+(\d+)\s+"([^"]+)"\s+(.+)$/i,
      execute: (m, editor) => {
        const ok = editor.engine.add_variant_prop(BigInt(m[1]!), m[2]!, m[3]!);
        return ok ? `Added property "${m[2]}"` : "Failed.";
      },
    },
    {
      name: "add-variant",
      description: "Add a variant from a frame",
      usage: "component variant <comp_id> <key_json> <frame_id>",
      pattern: /^component\s+variant\s+(\d+)\s+(\{[^}]+\})\s+(\d+)$/i,
      execute: (m, editor) => {
        const ok = editor.engine.add_variant(BigInt(m[1]!), m[2]!, BigInt(m[3]!));
        return ok ? "Variant added." : "Failed.";
      },
    },
    {
      name: "add-slot",
      description: "Add a slot to a component",
      usage: 'component slot <comp_id> "<name>" <placeholder_id>',
      pattern: /^component\s+slot\s+(\d+)\s+"([^"]+)"\s+(\d+)$/i,
      execute: (m, editor) => {
        const ok = editor.engine.add_slot(BigInt(m[1]!), m[2]!, BigInt(m[3]!));
        editor.requestRender();
        return ok ? `Added slot "${m[2]}"` : "Failed.";
      },
    },
    {
      name: "instantiate",
      description: "Create an instance of a component",
      usage: "instance <comp_id> <x> <y>",
      pattern: /^instance\s+(\d+)\s+(\d+)\s+(\d+)$/i,
      execute: (m, editor) => {
        const id = editor.engine.create_instance(BigInt(m[1]!), +m[2]!, +m[3]!);
        if (id === BigInt(0)) return "Failed.";
        editor.engine.select(id);
        editor.requestRender();
        return `Created instance #${id}`;
      },
    },
    {
      name: "set-variant",
      description: "Switch instance variant",
      usage: "variant <instance_id> <key_json>",
      pattern: /^variant\s+(\d+)\s+(\{.+\})$/i,
      execute: (m, editor) => {
        const ok = editor.engine.set_instance_variant(BigInt(m[1]!), m[2]!);
        editor.requestRender();
        return ok ? "Variant switched." : "Failed.";
      },
    },
    {
      name: "fill-slot",
      description: "Fill a slot with a node",
      usage: 'slot fill <instance_id> "<name>" <node_id>',
      pattern: /^slot\s+fill\s+(\d+)\s+"([^"]+)"\s+(\d+)$/i,
      execute: (m, editor) => {
        const ok = editor.engine.fill_slot(BigInt(m[1]!), m[2]!, BigInt(m[3]!));
        editor.requestRender();
        return ok ? `Filled slot "${m[2]}"` : "Slot not found.";
      },
    },
    {
      name: "components",
      description: "List all components",
      usage: "components",
      pattern: /^components$/i,
      execute: (_m, editor) => {
        const list = JSON.parse(editor.engine.get_components());
        if (list.length === 0) return "No components.";
        return list.map((c: any) =>
          `#${c.id} "${c.name}" — ${c.variant_count} variant(s), props: [${c.properties.map((p: any) => `${p.name}:${p.type}`).join(", ")}], slots: [${c.slots.join(", ")}]`
        ).join("\n");
      },
    },
    {
      name: "override",
      description: "Override instance child property",
      usage: 'override <instance_id> <node_id> <json>',
      pattern: /^override\s+(\d+)\s+(\d+)\s+(\{.+\})$/i,
      execute: (m, editor) => {
        const ok = editor.engine.set_instance_override(BigInt(m[1]!), BigInt(m[2]!), m[3]!);
        editor.requestRender();
        return ok ? "Override applied." : "Failed.";
      },
    },

    // === Layout ===
    {
      name: "layout",
      description: "Set layout mode: none/flex/grid",
      usage: "layout <node_id> <none|flex|grid>",
      pattern: /^layout\s+(\d+)\s+(none|flex|grid)$/i,
      execute: (m, editor) => {
        editor.engine.set_layout_mode(BigInt(m[1]!), m[2]!.toLowerCase());
        editor.requestRender();
        return `Layout → ${m[2]}`;
      },
    },
    {
      name: "flex-dir",
      description: "Set flex direction: row/column",
      usage: "direction <node_id> <row|column>",
      pattern: /^direction\s+(\d+)\s+(row|col(?:umn)?)$/i,
      execute: (m, editor) => {
        editor.engine.set_flex_direction(BigInt(m[1]!), m[2]!.toLowerCase());
        editor.requestRender();
        return `Direction → ${m[2]}`;
      },
    },
    {
      name: "align",
      description: "Set align-items",
      usage: "align <node_id> <start|center|end|stretch>",
      pattern: /^align\s+(\d+)\s+(start|center|end|stretch)$/i,
      execute: (m, editor) => {
        editor.engine.set_align_items(BigInt(m[1]!), m[2]!.toLowerCase());
        editor.requestRender();
        return `Align → ${m[2]}`;
      },
    },
    {
      name: "justify",
      description: "Set justify-content",
      usage: "justify <node_id> <start|center|end|between|around|evenly>",
      pattern: /^justify\s+(\d+)\s+(start|center|end|between|around|evenly|space-between|space-around|space-evenly)$/i,
      execute: (m, editor) => {
        editor.engine.set_justify_content(BigInt(m[1]!), m[2]!.toLowerCase());
        editor.requestRender();
        return `Justify → ${m[2]}`;
      },
    },
    {
      name: "gap",
      description: "Set layout gap",
      usage: "gap <node_id> <value>",
      pattern: /^gap\s+(\d+)\s+(\d+(?:\.\d+)?)$/i,
      execute: (m, editor) => {
        editor.engine.set_layout_gap(BigInt(m[1]!), +m[2]!);
        editor.requestRender();
        return `Gap → ${m[2]}px`;
      },
    },
    {
      name: "padding",
      description: "Set layout padding (all or t r b l)",
      usage: "padding <node_id> <all> or <t> <r> <b> <l>",
      pattern: /^padding\s+(\d+)\s+(\d+(?:\.\d+)?)(?:\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?))?$/i,
      execute: (m, editor) => {
        const v = +m[2]!;
        const t = v, r = m[3] ? +m[3] : v, b = m[4] ? +m[4] : v, l = m[5] ? +m[5] : r;
        editor.engine.set_layout_padding(BigInt(m[1]!), t, r, b, l);
        editor.requestRender();
        return `Padding → ${t} ${r} ${b} ${l}`;
      },
    },
    {
      name: "grid-cols",
      description: "Set grid columns",
      usage: "grid-cols <node_id> <count>",
      pattern: /^grid-cols\s+(\d+)\s+(\d+)$/i,
      execute: (m, editor) => {
        editor.engine.set_grid_columns(BigInt(m[1]!), +m[2]!);
        editor.requestRender();
        return `Grid columns → ${m[2]}`;
      },
    },
    {
      name: "get-layout",
      description: "Get layout properties",
      usage: "get-layout <node_id>",
      pattern: /^get-layout\s+(\d+)$/i,
      execute: (m, editor) => {
        return editor.engine.get_layout(BigInt(m[1]!));
      },
    },

    // === Notes ===
    {
      name: "note-add",
      description: "Add a markdown note to a node",
      usage: 'note add <node_id> "<content>" [tags_json]',
      pattern: /^note\s+add\s+(\d+)\s+"((?:[^"\\]|\\.)*)"\s*(.*)$/i,
      execute: (m, editor) => {
        const tags = m[3] || "[]";
        const content = m[2]!.replace(/\\n/g, "\n").replace(/\\"/g, '"');
        const ok = editor.engine.add_note(BigInt(m[1]!), content, tags);
        editor.requestRender();
        return ok ? `Note added to #${m[1]}` : "Node not found.";
      },
    },
    {
      name: "note-update",
      description: "Update a note by index",
      usage: 'note update <node_id> <index> "<content>"',
      pattern: /^note\s+update\s+(\d+)\s+(\d+)\s+"((?:[^"\\]|\\.)*)"$/i,
      execute: (m, editor) => {
        const content = m[3]!.replace(/\\n/g, "\n").replace(/\\"/g, '"');
        const ok = editor.engine.update_note(BigInt(m[1]!), +m[2]!, content);
        return ok ? "Note updated." : "Failed.";
      },
    },
    {
      name: "note-remove",
      description: "Remove a note by index",
      usage: "note remove <node_id> <index>",
      pattern: /^note\s+remove\s+(\d+)\s+(\d+)$/i,
      execute: (m, editor) => {
        const ok = editor.engine.remove_note(BigInt(m[1]!), +m[2]!);
        return ok ? "Note removed." : "Failed.";
      },
    },
    {
      name: "notes",
      description: "Get all notes for a node",
      usage: "notes <node_id>",
      pattern: /^notes\s+(\d+)$/i,
      execute: (m, editor) => {
        const notes = JSON.parse(editor.engine.get_notes(BigInt(m[1]!)));
        if (notes.length === 0) return "No notes.";
        return notes.map((n: any, i: number) => {
          const tags = n.tags.length ? ` [${n.tags.join(", ")}]` : "";
          const preview = n.content.length > 80 ? n.content.slice(0, 80) + "…" : n.content;
          return `[${i}]${tags} ${preview}`;
        }).join("\n");
      },
    },
    {
      name: "note-read",
      description: "Read full note content",
      usage: "note read <node_id> <index>",
      pattern: /^note\s+read\s+(\d+)\s+(\d+)$/i,
      execute: (m, editor) => {
        const notes = JSON.parse(editor.engine.get_notes(BigInt(m[1]!)));
        const note = notes[+m[2]!];
        if (!note) return "Note not found.";
        return note.content;
      },
    },
    {
      name: "context",
      description: "Get full node context (properties + notes + children) for agent",
      usage: "context <node_id>",
      pattern: /^context\s+(\d+)$/i,
      execute: (m, editor) => {
        return editor.engine.get_node_with_notes(BigInt(m[1]!));
      },
    },

    // === Export PNG ===
    {
      name: "png",
      description: "Export a node as PNG (downloads file)",
      usage: "png <node_id> [scale]",
      pattern: /^png\s+(\d+)(?:\s+(\d+))?$/i,
      execute: (m, editor) => {
        const id = +m[1]!;
        const scale = +(m[2] || 2);
        const ok = editor.downloadPng(id, scale);
        return ok ? `Exported node #${id} as PNG (${scale}x)` : "Node not found.";
      },
    },
    {
      name: "png-all",
      description: "Export entire canvas as PNG",
      usage: "png all [scale]",
      pattern: /^png\s+all(?:\s+(\d+))?$/i,
      execute: (m, editor) => {
        const scale = +(m[1] || 2);
        const ok = editor.downloadPng(undefined, scale);
        return ok ? `Exported canvas as PNG (${scale}x)` : "Canvas is empty.";
      },
    },
    {
      name: "png-data",
      description: "Get PNG as data URL (for programmatic use)",
      usage: "png-data <node_id|all> [scale]",
      pattern: /^png-data\s+(\d+|all)(?:\s+(\d+))?$/i,
      execute: (m, editor) => {
        const scale = +(m[2] || 2);
        const id = m[1] === "all" ? undefined : +m[1]!;
        const dataUrl = editor.exportPng(id, scale, 10);
        return dataUrl || "Export failed.";
      },
    },
    {
      name: "help",
      description: "Show all commands",
      usage: "help",
      pattern: /^(?:help|\?)$/i,
      execute: () => "see tool list below",
    },
  ];
}

function getKindStr(kind: any): string {
  if (typeof kind === "string") return kind;
  if (typeof kind === "object" && kind.Text) return "Text";
  return "Unknown";
}

// ============================================================
// Agent Panel UI
// ============================================================

export function setupAgentPanel(container: HTMLElement, editor: Editor) {
  const tools = buildTools();
  const messages: Message[] = [];

  // LLM state
  let llmHistory: import("./llm-agent").LLMMessage[] = [];
  let isProcessing = false;
  let configLoaded = false;

  container.innerHTML = "";

  // Header
  const header = document.createElement("div");
  header.className = "agent-header";
  container.appendChild(header);

  function renderHeader() {
    header.innerHTML = `
      <span class="agent-title">
        <span class="agent-icon">${icons.robot.replace(/width="\d+"/, 'width="14"').replace(/height="\d+"/, 'height="14"')}</span>
        Agent
      </span>
      <span class="agent-status ${configLoaded ? "online" : ""}" style="font-size:10px;color:${configLoaded ? "#10b981" : "#666"};">${configLoaded ? "connected" : "not configured"}</span>
    `;
  }
  renderHeader();

  // Auto-show settings if not configured
  import("./llm-agent").then(({ loadConfig }) => {
    const config = loadConfig();
    if (config?.apiKey) {
      configLoaded = true;
      messages.push({ role: "system", content: `Connected to ${config.model}`, timestamp: Date.now() });
      renderHeader();
      renderMessages();
    } else {
      messages.push({ role: "system", content: "Click ⚙ to configure your LLM API key.", timestamp: Date.now() });
      renderMessages();
    }
  });

  // Settings overlay
  function showSettings() {
    import("./llm-agent").then(({ loadConfig, saveConfig }) => {
    const existing = loadConfig();

    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position:absolute;inset:0;background:rgba(0,0,0,0.8);z-index:100;
      display:flex;flex-direction:column;padding:16px;gap:12px;
    `;
    overlay.innerHTML = `
      <div style="font-size:13px;font-weight:600;color:#ccc;margin-bottom:4px;">LLM Settings</div>
      <label style="font-size:11px;color:#888;">API Endpoint</label>
      <input id="llm-endpoint" class="prop-input" value="${existing?.endpoint || "https://api.openai.com/v1"}" placeholder="https://api.openai.com/v1" style="font-size:12px;">
      <label style="font-size:11px;color:#888;">Model</label>
      <input id="llm-model" class="prop-input" value="${existing?.model || "gpt-4o"}" placeholder="gpt-4o" style="font-size:12px;">
      <label style="font-size:11px;color:#888;">API Key</label>
      <input id="llm-key" class="prop-input" type="password" value="${existing?.apiKey || ""}" placeholder="sk-..." style="font-size:12px;">
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button id="llm-save" style="flex:1;padding:6px;background:#4f46e5;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;">Save</button>
        <button id="llm-cancel" style="flex:1;padding:6px;background:#333;color:#999;border:1px solid #444;border-radius:6px;cursor:pointer;font-size:12px;">Cancel</button>
      </div>
    `;
    container.appendChild(overlay);

    overlay.querySelector("#llm-save")!.addEventListener("click", () => {
      const endpoint = (overlay.querySelector("#llm-endpoint") as HTMLInputElement).value.trim();
      const model = (overlay.querySelector("#llm-model") as HTMLInputElement).value.trim();
      const apiKey = (overlay.querySelector("#llm-key") as HTMLInputElement).value.trim();
      if (!apiKey) { alert("API key required"); return; }
      saveConfig({ apiKey, endpoint, model });
      overlay.remove();
      configLoaded = true;
      renderHeader();
      messages.push({ role: "system", content: `Connected to ${model}`, timestamp: Date.now() });
      llmHistory = [];
      renderMessages();
    });
    overlay.querySelector("#llm-cancel")!.addEventListener("click", () => overlay.remove());
    }); // end import().then
  }

  const messagesEl = document.createElement("div");
  messagesEl.className = "agent-messages";
  container.appendChild(messagesEl);

  const inputArea = document.createElement("div");
  inputArea.className = "agent-input-area";
  const input = document.createElement("input");
  input.className = "agent-input";
  input.placeholder = "Ask the AI agent...";
  input.spellcheck = false;
  const sendBtn = document.createElement("button");
  sendBtn.className = "agent-send";
  sendBtn.textContent = "→";
  const settingsBtn = document.createElement("button");
  settingsBtn.className = "agent-send";
  settingsBtn.style.cssText = "font-size:14px;opacity:0.5;";
  settingsBtn.textContent = "⚙";
  settingsBtn.addEventListener("click", showSettings);
  inputArea.appendChild(input);
  inputArea.appendChild(sendBtn);
  inputArea.appendChild(settingsBtn);
  container.appendChild(inputArea);

  function renderMessages() {
    messagesEl.innerHTML = "";
    messages.forEach((msg) => {
      const el = document.createElement("div");
      el.className = `agent-msg agent-msg-${msg.role}`;
      // Render tool call indicators
      if (msg.role === "agent" && msg.content.startsWith("🔧")) {
        el.style.cssText += "font-size:10px;opacity:0.6;font-family:monospace;";
      }
      el.textContent = msg.content;
      messagesEl.appendChild(el);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function execute(text: string): string {
    const trimmed = text.trim();
    for (const tool of tools) {
      const match = trimmed.match(tool.pattern);
      if (match) {
        if (tool.name === "help") {
          const categories = [
            ["File I/O", ["export", "import", "save", "load", "saves"]],
            ["Frames", ["frames", "frame-children", "frame-tree", "reparent", "duplicate"]],
            ["Query", ["inspect", "find", "list"]],
            ["Create", ["add-rect", "add-ellipse", "add-text", "add-frame"]],
            ["Modify", ["fill", "stroke", "opacity", "radius", "move", "resize", "rename", "select", "delete", "clear"]],
            ["Components", ["create-component", "add-prop", "add-variant", "add-slot", "instantiate", "set-variant", "fill-slot", "components", "override"]],
            ["Layout", ["layout", "flex-dir", "align", "justify", "gap", "padding", "grid-cols", "get-layout"]],
            ["Notes", ["note-add", "note-update", "note-remove", "notes", "note-read", "context"]],
            ["Export", ["png", "png-all", "png-data"]],
          ] as const;

          const lines: string[] = [];
          for (const [cat, names] of categories) {
            lines.push(`\n${cat}`);
            for (const n of names) {
              const t = tools.find((t) => t.name === n)!;
              lines.push(`  ${t.usage}`);
            }
          }
          return lines.join("\n");
        }
        const readOnly = new Set(["help", "inspect", "find", "list", "frames", "frame-children", "frame-tree", "components", "notes", "note-read", "context", "get-layout", "export", "saves", "png-data", "select"]);
        if (!readOnly.has(tool.name)) {
          editor.engine.push_undo();
        }
        return tool.execute(match, editor);
      }
    }
    return `Unknown command. Type 'help' for available tools.`;
  }

  async function sendLLM(text: string) {
    const { loadConfig, chatCompletion, buildToolDefs, executeTool, getSceneContext } = await import("./llm-agent");
    const config = loadConfig();
    if (!config) { messages.push({ role: "system", content: "Click ⚙ to configure.", timestamp: Date.now() }); renderMessages(); return; }

    messages.push({ role: "user", content: text, timestamp: Date.now() });
    renderMessages();

    // Build context
    const sceneCtx = getSceneContext(editor);
    const sysPrompt = `You are an AI design assistant for OpenSketch, a Figma-like design tool.
You can create, modify, and inspect design elements on the canvas using the provided tools.
Key concepts: Frames (containers with flex/grid layout), Rect/Ellipse (shapes), Text (with fonts), Components (reusable), Instances (copies).
All node IDs are integers. Colors are hex (#RRGGBB). Use flex layout for proper centering.
Respond concisely. Execute tools to fulfill the user's design requests.`;
    if (llmHistory.length === 0) {
      llmHistory.push({ role: "system", content: `${sysPrompt}\n\n${sceneCtx}` });
    }
    llmHistory[0] = { role: "system", content: `${sysPrompt}\n\n${sceneCtx}` };
    llmHistory.push({ role: "user", content: text });

    const toolDefs = buildToolDefs();
    isProcessing = true;

    // Add streaming message placeholder
    const streamMsg: Message = { role: "agent", content: "", timestamp: Date.now() };
    messages.push(streamMsg);

    let maxRounds = 10;
    while (maxRounds-- > 0) {
      try {
        const response = await chatCompletion(config, llmHistory, toolDefs, (chunk) => {
          streamMsg.content += chunk;
          renderMessages();
        });

        llmHistory.push(response);

        // Handle tool calls
        if (response.tool_calls && response.tool_calls.length > 0) {
          // Show tool call indicators
          for (const tc of response.tool_calls) {
            const args = JSON.parse(tc.function.arguments || "{}");
            const argsStr = Object.entries(args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ");
            messages.push({ role: "agent", content: `🔧 ${tc.function.name}(${argsStr})`, timestamp: Date.now() });
          }
          renderMessages();

          // Execute tools and add results
          editor.engine.push_undo();
          for (const tc of response.tool_calls) {
            const args = JSON.parse(tc.function.arguments || "{}");
            const result = executeTool(tc.function.name, args, editor);
            llmHistory.push({
              role: "tool",
              tool_call_id: tc.id,
              content: result.slice(0, 2000), // Truncate large results
            });
          }

          // Continue conversation — LLM may want to call more tools or respond
          streamMsg.content = "";
          continue;
        }

        // No tool calls — final response
        if (response.content) {
          streamMsg.content = response.content;
        }
        break;
      } catch (err: any) {
        streamMsg.content = `Error: ${err.message}`;
        break;
      }
    }

    isProcessing = false;
    renderMessages();
  }

  function send() {
    const text = input.value.trim();
    if (!text || isProcessing) return;
    input.value = "";

    if (!configLoaded) {
      messages.push({ role: "system", content: "Please configure your API key first. Click ⚙.", timestamp: Date.now() });
      renderMessages();
      return;
    }
    sendLLM(text);
  }

  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") send();
  });
  sendBtn.addEventListener("click", send);
  renderMessages();

  // External API
  (window as any).__agentExecute = (command: string): string => {
    const result = execute(command);
    messages.push({ role: "agent", content: `> ${command}\n${result}`, timestamp: Date.now() });
    renderMessages();
    return result;
  };

  (window as any).__agentTools = {
    list: () => tools.map((t) => ({ name: t.name, description: t.description, usage: t.usage })),
    call: (command: string) => execute(command),
    getScene: () => JSON.parse(editor.engine.export_scene()),
    getNode: (id: number) => JSON.parse(editor.engine.get_node_json(BigInt(id)) || "null"),
    getFrames: () => JSON.parse(editor.engine.get_frames()),
    getFrameTree: (id: number) => JSON.parse(editor.engine.get_frame_tree(BigInt(id))),
    findByName: (q: string) => JSON.parse(editor.engine.find_by_name(q)),
    getLayers: () => JSON.parse(editor.engine.get_layer_list()),
    exportPng: (nodeId?: number, scale?: number) => editor.exportPng(nodeId, scale || 2, 10),
    downloadPng: (nodeId?: number, scale?: number, filename?: string) => editor.downloadPng(nodeId, scale || 2, filename),
  };
}
