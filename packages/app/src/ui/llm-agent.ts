/**
 * LLM Agent integration for OpenSketch
 * Connects to OpenAI-compatible APIs with tool calling
 */

export interface LLMConfig {
  apiKey: string;
  endpoint: string; // e.g. https://api.openai.com/v1
  model: string;    // e.g. gpt-4o, claude-sonnet-4-20250514
}

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required: string[];
    };
  };
}

const SYSTEM_PROMPT = `You are an AI design assistant integrated into OpenSketch, a Figma-like design tool.
You can create, modify, and inspect design elements on the canvas using the provided tools.

Key concepts:
- **Frames**: Container elements (like Figma frames), can have layout (flex/grid)
- **Rect/Ellipse**: Shape primitives
- **Text**: Text nodes with font properties
- **Components**: Reusable design elements with variants
- **Instances**: Copies of components
- **Layout**: Flex/Grid layout on frames (direction, align, justify, gap, padding)
- **Notes**: Markdown annotations on nodes

All node IDs are integers. Colors are hex strings (#RRGGBB).
When creating UI, use flex layout for proper centering and spacing.
Respond concisely. Execute tools to fulfill the user's design requests.`;

/** Build OpenAI function tool definitions from the command list */
export function buildToolDefs(): ToolDef[] {
  return [
    // Query tools
    tool("list_nodes", "List all nodes with id, name, kind", {}),
    tool("inspect_node", "Get full JSON details of a node", { node_id: num("Node ID") }),
    tool("find_by_name", "Find nodes by name (fuzzy match)", { query: str("Search query") }),
    tool("get_frames", "List all frames with children info", {}),
    tool("get_frame_tree", "Get frame subtree as nested JSON", { node_id: num("Frame node ID") }),
    tool("get_components", "List all registered components", {}),
    tool("get_layout", "Get layout properties of a node", { node_id: num("Node ID") }),

    // Create tools
    tool("add_rect", "Add a rectangle", {
      x: num("X position"), y: num("Y position"), w: num("Width"), h: num("Height"),
    }, ["x", "y", "w", "h"]),
    tool("add_ellipse", "Add an ellipse", {
      x: num("X position"), y: num("Y position"), w: num("Width"), h: num("Height"),
    }, ["x", "y", "w", "h"]),
    tool("add_text", "Add a text node", {
      x: num("X position"), y: num("Y position"), text: str("Text content"), font_size: num("Font size (default 16)"),
    }, ["x", "y", "text"]),
    tool("add_frame", "Add a frame (container)", {
      x: num("X position"), y: num("Y position"), w: num("Width"), h: num("Height"),
    }, ["x", "y", "w", "h"]),

    // Modify tools
    tool("set_fill", "Set fill color of a node", {
      node_id: num("Node ID"), color: str("Hex color e.g. #4F46E5"),
    }, ["node_id", "color"]),
    tool("set_stroke", "Set stroke on a node", {
      node_id: num("Node ID"), color: str("Hex color"), width: num("Stroke width (default 1)"),
    }, ["node_id", "color"]),
    tool("set_opacity", "Set node opacity (0-100)", {
      node_id: num("Node ID"), opacity: num("Opacity 0-100"),
    }, ["node_id", "opacity"]),
    tool("set_corner_radius", "Set corner radius", {
      node_id: num("Node ID"), radius: num("Radius in px"),
    }, ["node_id", "radius"]),
    tool("move_node", "Move a node by dx, dy", {
      node_id: num("Node ID"), dx: num("Delta X"), dy: num("Delta Y"),
    }, ["node_id", "dx", "dy"]),
    tool("set_position", "Set absolute position", {
      node_id: num("Node ID"), x: num("X"), y: num("Y"),
    }, ["node_id", "x", "y"]),
    tool("resize_node", "Resize a node", {
      node_id: num("Node ID"), w: num("Width"), h: num("Height"),
    }, ["node_id", "w", "h"]),
    tool("rename_node", "Rename a node", {
      node_id: num("Node ID"), name: str("New name"),
    }, ["node_id", "name"]),
    tool("delete_node", "Delete a node", { node_id: num("Node ID") }, ["node_id"]),
    tool("reparent_node", "Move node into another frame", {
      node_id: num("Node ID"), parent_id: num("New parent frame ID"),
    }, ["node_id", "parent_id"]),
    tool("duplicate_node", "Duplicate a node", { node_id: num("Node ID") }, ["node_id"]),
    tool("set_text_content", "Change text content", {
      node_id: num("Node ID"), text: str("New text"),
    }, ["node_id", "text"]),
    tool("set_font_size", "Set font size", {
      node_id: num("Node ID"), size: num("Font size"),
    }, ["node_id", "size"]),
    tool("set_font_family", "Set font family", {
      node_id: num("Node ID"), family: str("Font family name"),
    }, ["node_id", "family"]),

    // Layout tools
    tool("set_layout", "Set layout mode on a frame", {
      node_id: num("Node ID"), mode: str("none, flex, or grid"),
    }, ["node_id", "mode"]),
    tool("set_flex_direction", "Set flex direction", {
      node_id: num("Node ID"), direction: str("row or column"),
    }, ["node_id", "direction"]),
    tool("set_align_items", "Set align-items", {
      node_id: num("Node ID"), align: str("start, center, end, or stretch"),
    }, ["node_id", "align"]),
    tool("set_justify_content", "Set justify-content", {
      node_id: num("Node ID"), justify: str("start, center, end, space-between, space-around, space-evenly"),
    }, ["node_id", "justify"]),
    tool("set_gap", "Set layout gap between children", {
      node_id: num("Node ID"), gap: num("Gap in px"),
    }, ["node_id", "gap"]),
    tool("set_padding", "Set layout padding", {
      node_id: num("Node ID"), top: num("Top"), right: num("Right"), bottom: num("Bottom"), left: num("Left"),
    }, ["node_id", "top", "right", "bottom", "left"]),
    tool("set_grid_columns", "Set grid column count", {
      node_id: num("Node ID"), columns: num("Number of columns"),
    }, ["node_id", "columns"]),

    // Component tools
    tool("create_component", "Create a component from a frame", {
      frame_id: num("Frame node ID"), name: str("Component name"),
    }, ["frame_id", "name"]),
    tool("create_instance", "Create an instance of a component", {
      component_id: num("Component ID"), x: num("X position"), y: num("Y position"),
    }, ["component_id", "x", "y"]),

    // Note tools
    tool("add_note", "Add a markdown note to a node", {
      node_id: num("Node ID"), content: str("Markdown content"), tags: str("Comma-separated tags (optional)"),
    }, ["node_id", "content"]),
    tool("get_notes", "Get all notes on a node", { node_id: num("Node ID") }, ["node_id"]),

    // Scene tools
    tool("select_node", "Select a node (highlights it)", { node_id: num("Node ID") }, ["node_id"]),
    tool("export_scene", "Export entire scene as JSON", {}),
  ];
}

function str(desc: string) { return { type: "string", description: desc }; }
function num(desc: string) { return { type: "number", description: desc }; }

function tool(name: string, description: string, props: Record<string, any>, required?: string[]): ToolDef {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties: props,
        required: required || Object.keys(props),
      },
    },
  };
}

/** Execute an LLM tool call using the editor engine */
export function executeTool(name: string, args: Record<string, any>, editor: any): string {
  const engine = editor.engine;
  const bi = (v: number) => BigInt(v);

  try {
    switch (name) {
      // Query
      case "list_nodes": return engine.get_layer_list();
      case "inspect_node": return engine.get_node_json(bi(args.node_id)) || "null";
      case "find_by_name": return engine.find_by_name(args.query);
      case "get_frames": return engine.get_frames();
      case "get_frame_tree": return engine.get_frame_tree(bi(args.node_id));
      case "get_components": return engine.get_components();
      case "get_layout": return engine.get_layout(bi(args.node_id));

      // Create
      case "add_rect": {
        const id = engine.add_rect(args.x, args.y, args.w, args.h);
        editor.requestRender();
        return JSON.stringify({ created: Number(id) });
      }
      case "add_ellipse": {
        const id = engine.add_ellipse(args.x, args.y, args.w, args.h);
        editor.requestRender();
        return JSON.stringify({ created: Number(id) });
      }
      case "add_text": {
        const id = engine.add_text(args.x, args.y, args.text, args.font_size || 16);
        editor.requestRender();
        return JSON.stringify({ created: Number(id) });
      }
      case "add_frame": {
        const id = engine.add_frame(args.x, args.y, args.w, args.h);
        editor.requestRender();
        return JSON.stringify({ created: Number(id) });
      }

      // Modify
      case "set_fill": {
        const [r, g, b] = hexToRgba(args.color);
        engine.set_fill_color(bi(args.node_id), r, g, b, 1.0);
        editor.requestRender();
        return "ok";
      }
      case "set_stroke": {
        const [r, g, b] = hexToRgba(args.color);
        engine.set_stroke(bi(args.node_id), r, g, b, 1.0, args.width || 1);
        editor.requestRender();
        return "ok";
      }
      case "set_opacity":
        engine.set_opacity(bi(args.node_id), args.opacity / 100);
        editor.requestRender();
        return "ok";
      case "set_corner_radius":
        engine.set_corner_radius(bi(args.node_id), args.radius);
        editor.requestRender();
        return "ok";
      case "move_node":
        engine.move_node(bi(args.node_id), args.dx, args.dy);
        editor.requestRender();
        return "ok";
      case "set_position":
        engine.set_node_position(bi(args.node_id), args.x, args.y);
        editor.requestRender();
        return "ok";
      case "resize_node":
        engine.resize_node(bi(args.node_id), args.w, args.h);
        editor.requestRender();
        return "ok";
      case "rename_node":
        engine.set_node_name(bi(args.node_id), args.name);
        editor.requestRender();
        return "ok";
      case "delete_node":
        engine.push_undo();
        engine.remove_node(bi(args.node_id));
        editor.requestRender();
        return "ok";
      case "reparent_node":
        engine.reparent_node(bi(args.node_id), bi(args.parent_id));
        editor.requestRender();
        return "ok";
      case "duplicate_node": {
        const id = engine.duplicate_node(bi(args.node_id));
        editor.requestRender();
        return JSON.stringify({ duplicated: Number(id) });
      }
      case "set_text_content":
        engine.set_text_content(bi(args.node_id), args.text);
        editor.requestRender();
        return "ok";
      case "set_font_size":
        engine.set_font_size(bi(args.node_id), args.size);
        editor.requestRender();
        return "ok";
      case "set_font_family":
        engine.set_font_family(bi(args.node_id), args.family);
        editor.requestRender();
        return "ok";

      // Layout
      case "set_layout":
        engine.set_layout_mode(bi(args.node_id), args.mode);
        editor.requestRender();
        return "ok";
      case "set_flex_direction":
        engine.set_flex_direction(bi(args.node_id), args.direction);
        editor.requestRender();
        return "ok";
      case "set_align_items":
        engine.set_align_items(bi(args.node_id), args.align);
        editor.requestRender();
        return "ok";
      case "set_justify_content":
        engine.set_justify_content(bi(args.node_id), args.justify);
        editor.requestRender();
        return "ok";
      case "set_gap":
        engine.set_layout_gap(bi(args.node_id), args.gap);
        editor.requestRender();
        return "ok";
      case "set_padding":
        engine.set_layout_padding(bi(args.node_id), args.top, args.right, args.bottom, args.left);
        editor.requestRender();
        return "ok";
      case "set_grid_columns":
        engine.set_grid_columns(bi(args.node_id), args.columns);
        editor.requestRender();
        return "ok";

      // Components
      case "create_component": {
        const id = engine.create_component(bi(args.frame_id), args.name);
        return JSON.stringify({ component_id: Number(id) });
      }
      case "create_instance": {
        const id = engine.create_instance(bi(args.component_id), args.x, args.y);
        editor.requestRender();
        return JSON.stringify({ instance_id: Number(id) });
      }

      // Notes
      case "add_note":
        engine.add_note(bi(args.node_id), args.content, args.tags ? `["${args.tags.split(",").map((t: string) => t.trim()).join('","')}"]` : "[]");
        return "ok";
      case "get_notes":
        return engine.get_notes(bi(args.node_id));

      // Scene
      case "select_node":
        engine.select(bi(args.node_id));
        editor.requestRender();
        return "ok";
      case "export_scene":
        return engine.export_scene();

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err: any) {
    return `Error: ${err.message || err}`;
  }
}

function hexToRgba(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
}

/** Get a compact scene summary for context */
export function getSceneContext(editor: any): string {
  try {
    const layers = JSON.parse(editor.engine.get_layer_list());
    if (!layers || layers.length === 0) return "Scene is empty.";
    const summary = layers.slice(0, 50).map((n: any) =>
      `#${n.id} ${n.kind} "${n.name}" (${Math.round(n.x)},${Math.round(n.y)} ${Math.round(n.width)}×${Math.round(n.height)})`
    ).join("\n");
    return `Current scene (${layers.length} nodes):\n${summary}${layers.length > 50 ? `\n... and ${layers.length - 50} more` : ""}`;
  } catch {
    return "Scene is empty.";
  }
}

/** Call OpenAI-compatible chat completion API */
export async function chatCompletion(
  config: LLMConfig,
  messages: LLMMessage[],
  tools: ToolDef[],
  onChunk?: (text: string) => void,
): Promise<LLMMessage> {
  const isAnthropic = config.endpoint.includes("anthropic");

  const body: any = {
    model: config.model,
    messages,
    tools,
    stream: !!onChunk,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  let url = `${config.endpoint.replace(/\/$/, "")}/chat/completions`;

  if (isAnthropic) {
    headers["x-api-key"] = config.apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  if (onChunk && res.body) {
    // Streaming
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    let toolCalls: ToolCall[] = [];
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            fullContent += delta.content;
            onChunk(delta.content);
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCalls[idx]) {
                toolCalls[idx] = { id: tc.id || "", type: "function", function: { name: "", arguments: "" } };
              }
              if (tc.id) toolCalls[idx]!.id = tc.id;
              if (tc.function?.name) toolCalls[idx]!.function.name += tc.function.name;
              if (tc.function?.arguments) toolCalls[idx]!.function.arguments += tc.function.arguments;
            }
          }
        } catch {}
      }
    }

    const msg: LLMMessage = { role: "assistant", content: fullContent || null };
    if (toolCalls.length > 0) msg.tool_calls = toolCalls;
    return msg;
  } else {
    // Non-streaming
    const json = await res.json();
    const choice = json.choices?.[0]?.message;
    return choice || { role: "assistant", content: "No response." };
  }
}

/** Load config from localStorage */
export function loadConfig(): LLMConfig | null {
  try {
    const raw = localStorage.getItem("opensketch-llm-config");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

/** Save config to localStorage */
export function saveConfig(config: LLMConfig) {
  localStorage.setItem("opensketch-llm-config", JSON.stringify(config));
}
