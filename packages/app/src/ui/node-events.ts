import type { Editor } from "../editor";

/**
 * Node-level event system UI.
 * Renders an "Events" section in the Properties panel for binding JS callbacks.
 * Handles execution of events in the prototype viewer.
 */

const EVENT_TRIGGERS = [
  "onClick",
  "onDoubleClick",
  "onHover",
  "onHoverEnd",
  "onPress",
  "onRelease",
  "onDrag",
  "onDragEnd",
  "onFocus",
  "onBlur",
] as const;

interface NodeEventData {
  id: number;
  trigger: string;
  handler: string;
  enabled: boolean;
  label: string;
}

/** Render events section in properties panel */
export function renderNodeEventsSection(
  container: HTMLElement,
  editor: Editor,
  nodeId: number
): void {
  const eventsJson = editor.engine.get_node_events(BigInt(nodeId));
  const events: NodeEventData[] = JSON.parse(eventsJson).map((e: any) => ({
    ...e,
    id: Number(e.id),
  }));

  const section = document.createElement("div");
  section.style.cssText =
    "margin-top:12px;border-top:1px solid #333;padding-top:8px;";

  // Header
  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;";
  const title = document.createElement("span");
  title.style.cssText = "font-size:11px;font-weight:600;color:#e0e0e0;";
  title.textContent = `Events (${events.length})`;

  const addBtn = document.createElement("button");
  addBtn.style.cssText =
    "background:#0f3460;color:#4fc3f7;border:none;border-radius:4px;padding:2px 8px;font-size:10px;cursor:pointer;";
  addBtn.textContent = "+ Add";
  addBtn.addEventListener("click", () => {
    editor.engine.add_node_event(
      BigInt(nodeId),
      "onClick",
      '// Event handler\nconsole.log("clicked", node.name);',
      ""
    );
    editor.render();
    editor.onSelectionChanged?.();
  });

  header.appendChild(title);
  header.appendChild(addBtn);
  section.appendChild(header);

  // Event list
  for (const evt of events) {
    const row = document.createElement("div");
    row.style.cssText =
      "background:#1a1a2e;border-radius:6px;padding:8px;margin-bottom:6px;border:1px solid #333;";

    // Top row: trigger select + enabled toggle + delete
    const topRow = document.createElement("div");
    topRow.style.cssText =
      "display:flex;align-items:center;gap:6px;margin-bottom:6px;";

    // Enable toggle
    const enableBtn = document.createElement("button");
    enableBtn.style.cssText = `background:none;border:none;cursor:pointer;font-size:12px;padding:0;opacity:${evt.enabled ? 1 : 0.4};`;
    enableBtn.textContent = evt.enabled ? "⚡" : "💤";
    enableBtn.title = evt.enabled ? "Enabled (click to disable)" : "Disabled (click to enable)";
    enableBtn.addEventListener("click", () => {
      editor.engine.set_node_event_enabled(
        BigInt(nodeId),
        BigInt(evt.id),
        !evt.enabled
      );
      editor.render();
      editor.onSelectionChanged?.();
    });

    const triggerSelect = document.createElement("select");
    triggerSelect.style.cssText =
      "background:#16213e;color:#e0e0e0;border:1px solid #444;border-radius:4px;padding:2px 4px;font-size:10px;flex:1;";
    for (const t of EVENT_TRIGGERS) {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      opt.selected = t === evt.trigger;
      triggerSelect.appendChild(opt);
    }
    triggerSelect.addEventListener("change", () => {
      editor.engine.update_node_event_trigger(
        BigInt(nodeId),
        BigInt(evt.id),
        triggerSelect.value
      );
      editor.render();
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.style.cssText =
      "background:none;border:none;color:#e94560;cursor:pointer;font-size:12px;padding:0 2px;";
    deleteBtn.textContent = "✕";
    deleteBtn.addEventListener("click", () => {
      editor.engine.remove_node_event(BigInt(nodeId), BigInt(evt.id));
      editor.render();
      editor.onSelectionChanged?.();
    });

    topRow.appendChild(enableBtn);
    topRow.appendChild(triggerSelect);
    topRow.appendChild(deleteBtn);
    row.appendChild(topRow);

    // Label input
    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.placeholder = "Label (optional)";
    labelInput.value = evt.label;
    labelInput.style.cssText =
      "width:100%;box-sizing:border-box;background:#0d1117;color:#aaa;border:1px solid #333;border-radius:4px;padding:3px 6px;font-size:10px;margin-bottom:4px;";
    labelInput.addEventListener("change", () => {
      // Update label via handler update (label is part of the event struct)
      // For now we store label in the trigger update flow
    });
    row.appendChild(labelInput);

    // Code editor (textarea)
    const codeArea = document.createElement("textarea");
    codeArea.style.cssText =
      "width:100%;box-sizing:border-box;background:#0d1117;color:#4fc3f7;border:1px solid #333;border-radius:4px;padding:6px;font-size:10px;font-family:'SF Mono',Monaco,monospace;resize:vertical;min-height:60px;line-height:1.4;";
    codeArea.value = evt.handler;
    codeArea.spellcheck = false;
    codeArea.addEventListener("change", () => {
      editor.engine.update_node_event_handler(
        BigInt(nodeId),
        BigInt(evt.id),
        codeArea.value
      );
    });
    // Tab key inserts spaces instead of changing focus
    codeArea.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const start = codeArea.selectionStart;
        const end = codeArea.selectionEnd;
        codeArea.value =
          codeArea.value.substring(0, start) +
          "  " +
          codeArea.value.substring(end);
        codeArea.selectionStart = codeArea.selectionEnd = start + 2;
      }
    });
    row.appendChild(codeArea);

    section.appendChild(row);
  }

  // Info text
  if (events.length === 0) {
    const info = document.createElement("div");
    info.style.cssText =
      "font-size:10px;color:#666;text-align:center;padding:8px;";
    info.textContent = "No events. Click + Add to bind JS callbacks.";
    section.appendChild(info);
  }

  container.appendChild(section);
}

/**
 * Event execution runtime for the prototype viewer.
 * Creates a sandboxed-ish execution context for node event handlers.
 */
export class EventRuntime {
  private editor: Editor;
  private eventMap: Map<
    number,
    { trigger: string; handler: string; enabled: boolean }[]
  > = new Map();
  private hoverState: Set<number> = new Set();
  private pressState: Set<number> = new Set();
  private dragState: {
    nodeId: number;
    startX: number;
    startY: number;
  } | null = null;

  constructor(editor: Editor) {
    this.editor = editor;
    this.loadEvents();
  }

  /** Load all node events from the engine */
  loadEvents(): void {
    this.eventMap.clear();
    const allJson = this.editor.engine.get_all_node_events();
    const all: { id: number; name: string; events: any[] }[] = JSON.parse(allJson).map(
      (item: any) => ({ ...item, id: Number(item.id) })
    );
    for (const item of all) {
      this.eventMap.set(
        item.id,
        item.events
          .filter((e: any) => e.enabled)
          .map((e: any) => ({
            trigger: e.trigger,
            handler: e.handler,
            enabled: e.enabled,
          }))
      );
    }
  }

  /** Check if any node has events */
  hasEvents(): boolean {
    return this.eventMap.size > 0;
  }

  /** Get node IDs that have events for a specific trigger */
  getNodesWithTrigger(trigger: string): number[] {
    const result: number[] = [];
    for (const [nodeId, events] of this.eventMap) {
      if (events.some((e) => e.trigger === trigger)) {
        result.push(nodeId);
      }
    }
    return result;
  }

  /** Fire events for a node + trigger */
  fire(nodeId: number, trigger: string, eventData: Record<string, any> = {}): void {
    const events = this.eventMap.get(nodeId);
    if (!events) return;
    const matching = events.filter((e) => e.trigger === trigger);
    if (matching.length === 0) return;

    // Build the sandbox context
    const nodeJson = this.editor.engine.get_node_json(nodeId);
    const node = nodeJson ? JSON.parse(nodeJson) : { id: nodeId, name: "unknown" };
    // Normalize BigInt IDs
    node.id = Number(node.id);
    if (node.parent) node.parent = Number(node.parent);

    const context = {
      node,
      event: { trigger, nodeId, ...eventData },
      // API methods available to handlers
      setProperty: (prop: string, value: any) => {
        this._setNodeProperty(nodeId, prop, value);
      },
      setVisible: (visible: boolean) => {
        this.editor.engine.set_visible(BigInt(nodeId), visible);
      },
      setOpacity: (opacity: number) => {
        this.editor.engine.set_opacity(BigInt(nodeId), opacity);
      },
      setPosition: (x: number, y: number) => {
        this.editor.engine.set_position(BigInt(nodeId), x, y);
      },
      setSize: (w: number, h: number) => {
        this.editor.engine.set_size(BigInt(nodeId), w, h);
      },
      setFillColor: (hex: string) => {
        this.editor.engine.set_fill_color(BigInt(nodeId), hex);
      },
      setText: (text: string) => {
        this.editor.engine.set_text(BigInt(nodeId), text);
      },
      setRotation: (deg: number) => {
        this.editor.engine.set_rotation(BigInt(nodeId), deg);
      },
      getNode: (id: number) => {
        const j = this.editor.engine.get_node_json(id);
        return j ? JSON.parse(j) : null;
      },
      navigateTo: (pageId: number) => {
        // exposed for prototype viewer integration
        (this as any)._navigateCallback?.(pageId);
      },
      log: (...args: any[]) => {
        console.log(`[Event:${node.name}:${trigger}]`, ...args);
      },
      delay: (ms: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, ms)),
    };

    for (const evt of matching) {
      try {
        const fn = new Function(
          "node",
          "event",
          "setProperty",
          "setVisible",
          "setOpacity",
          "setPosition",
          "setSize",
          "setFillColor",
          "setText",
          "setRotation",
          "getNode",
          "navigateTo",
          "log",
          "delay",
          evt.handler
        );
        fn(
          context.node,
          context.event,
          context.setProperty,
          context.setVisible,
          context.setOpacity,
          context.setPosition,
          context.setSize,
          context.setFillColor,
          context.setText,
          context.setRotation,
          context.getNode,
          context.navigateTo,
          context.log,
          context.delay
        );
      } catch (err) {
        console.error(
          `[EventRuntime] Error in ${trigger} handler for node ${nodeId}:`,
          err
        );
      }
    }
  }

  /** Handle mouse click in prototype viewer */
  handleClick(nodeId: number, x: number, y: number): void {
    this.fire(nodeId, "onClick", { x, y });
  }

  /** Handle double click */
  handleDoubleClick(nodeId: number, x: number, y: number): void {
    this.fire(nodeId, "onDoubleClick", { x, y });
  }

  /** Handle hover enter */
  handleHoverEnter(nodeId: number, x: number, y: number): void {
    if (this.hoverState.has(nodeId)) return;
    this.hoverState.add(nodeId);
    this.fire(nodeId, "onHover", { x, y });
  }

  /** Handle hover leave */
  handleHoverLeave(nodeId: number): void {
    if (!this.hoverState.has(nodeId)) return;
    this.hoverState.delete(nodeId);
    this.fire(nodeId, "onHoverEnd", {});
  }

  /** Handle press (mousedown) */
  handlePress(nodeId: number, x: number, y: number): void {
    this.pressState.add(nodeId);
    this.fire(nodeId, "onPress", { x, y });
  }

  /** Handle release (mouseup) */
  handleRelease(nodeId: number, x: number, y: number): void {
    if (this.pressState.has(nodeId)) {
      this.pressState.delete(nodeId);
      this.fire(nodeId, "onRelease", { x, y });
    }
  }

  /** Handle drag start */
  handleDragStart(nodeId: number, x: number, y: number): void {
    this.dragState = { nodeId, startX: x, startY: y };
    this.fire(nodeId, "onDrag", { x, y, dx: 0, dy: 0 });
  }

  /** Handle drag move */
  handleDragMove(x: number, y: number): void {
    if (!this.dragState) return;
    const dx = x - this.dragState.startX;
    const dy = y - this.dragState.startY;
    this.fire(this.dragState.nodeId, "onDrag", { x, y, dx, dy });
  }

  /** Handle drag end */
  handleDragEnd(x: number, y: number): void {
    if (!this.dragState) return;
    const dx = x - this.dragState.startX;
    const dy = y - this.dragState.startY;
    this.fire(this.dragState.nodeId, "onDragEnd", { x, y, dx, dy });
    this.dragState = null;
  }

  /** Set navigation callback for navigateTo() */
  setNavigateCallback(cb: (pageId: number) => void): void {
    (this as any)._navigateCallback = cb;
  }

  private _setNodeProperty(nodeId: number, prop: string, value: any): void {
    const bigId = BigInt(nodeId);
    switch (prop) {
      case "x":
      case "y": {
        const json = this.editor.engine.get_node_json(nodeId);
        if (!json) return;
        const n = JSON.parse(json);
        const x = prop === "x" ? value : n.x;
        const y = prop === "y" ? value : n.y;
        this.editor.engine.set_position(bigId, x, y);
        break;
      }
      case "width":
      case "height": {
        const json = this.editor.engine.get_node_json(nodeId);
        if (!json) return;
        const n = JSON.parse(json);
        const w = prop === "width" ? value : n.width;
        const h = prop === "height" ? value : n.height;
        this.editor.engine.set_size(bigId, w, h);
        break;
      }
      case "rotation":
        this.editor.engine.set_rotation(bigId, value);
        break;
      case "opacity":
        this.editor.engine.set_opacity(bigId, value);
        break;
      case "visible":
        this.editor.engine.set_visible(bigId, value);
        break;
      case "fill":
        this.editor.engine.set_fill_color(bigId, value);
        break;
      case "text":
        this.editor.engine.set_text(bigId, value);
        break;
      default:
        console.warn(`[EventRuntime] Unknown property: ${prop}`);
    }
  }
}
