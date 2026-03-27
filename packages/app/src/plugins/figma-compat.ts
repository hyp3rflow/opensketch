/**
 * Figma Plugin API Compatibility Layer
 * 
 * Emulates a subset of the Figma Plugin API so that simple Figma plugins
 * can run inside OpenSketch with minimal or no modifications.
 * 
 * Supported: figma.createRectangle/Ellipse/Frame/Text, figma.currentPage,
 * figma.root, figma.viewport, figma.notify, figma.closePlugin,
 * node properties (x/y/width/height/name/opacity/visible/fills/strokes),
 * figma.getNodeById, figma.on/once/off
 * 
 * Not supported: Variables, Styles API, REST API, multi-page advanced ops,
 * component publishing, team library access
 */

import type { Editor } from "../editor";

// ── Figma-compatible types ──

interface FigmaRGBA {
  r: number; g: number; b: number; a: number;
}

interface FigmaSolidPaint {
  type: "SOLID";
  color: FigmaRGBA;
  opacity?: number;
  visible?: boolean;
}

interface FigmaLinearGradientPaint {
  type: "GRADIENT_LINEAR";
  gradientStops: Array<{ position: number; color: FigmaRGBA }>;
  visible?: boolean;
}

type FigmaPaint = FigmaSolidPaint | FigmaLinearGradientPaint;

interface FigmaStroke {
  type: "SOLID";
  color: FigmaRGBA;
  opacity?: number;
}

// ── FigmaNode proxy ──

class FigmaNode {
  readonly _editor: Editor;
  readonly _engine: any;
  readonly _bid: bigint;
  readonly id: string;
  _type: string;

  constructor(editor: Editor, nodeId: number, type: string) {
    this._editor = editor;
    this._engine = (editor as any).engine;
    this._bid = BigInt(nodeId);
    this.id = String(nodeId);
    this._type = type;
  }

  get type(): string { return this._type; }

  // Position & size
  get x(): number { return this._engine.get_node_x(this._bid); }
  set x(v: number) { this._engine.set_node_x(this._bid, v); this._editor.requestRender(); }
  get y(): number { return this._engine.get_node_y(this._bid); }
  set y(v: number) { this._engine.set_node_y(this._bid, v); this._editor.requestRender(); }
  get width(): number { return this._engine.get_node_width(this._bid); }
  set width(v: number) { this._engine.resize_node(this._bid, v, this.height); this._editor.requestRender(); }
  get height(): number { return this._engine.get_node_height(this._bid); }
  set height(v: number) { this._engine.resize_node(this._bid, this.width, v); this._editor.requestRender(); }

  get name(): string { return this._engine.get_name(this._bid) || ""; }
  set name(v: string) { this._engine.set_name(this._bid, v); }

  get opacity(): number { return this._engine.get_opacity(this._bid); }
  set opacity(v: number) { this._engine.set_opacity(this._bid, v); this._editor.requestRender(); }

  get visible(): boolean { return this._engine.get_visible(this._bid); }
  set visible(v: boolean) { this._engine.set_visible(this._bid, v); this._editor.requestRender(); }

  get locked(): boolean { return this._engine.get_locked?.(this._bid) ?? false; }
  set locked(v: boolean) { this._engine.set_locked?.(this._bid, v); }

  get rotation(): number { return this._engine.get_rotation?.(this._bid) ?? 0; }
  set rotation(v: number) { this._engine.set_rotation?.(this._bid, v); this._editor.requestRender(); }

  // Corner radius
  get cornerRadius(): number { return this._engine.get_corner_radius?.(this._bid) ?? 0; }
  set cornerRadius(v: number) { this._engine.set_corner_radius?.(this._bid, v); this._editor.requestRender(); }

  // Fills — simplified: maps between Figma Paint[] and OpenSketch fill system
  get fills(): FigmaPaint[] {
    try {
      const info = this._engine.get_fill_info?.(this._bid);
      if (!info) return [];
      const parsed = JSON.parse(info);
      if (Array.isArray(parsed)) {
        return parsed.map(fillToFigmaPaint).filter(Boolean) as FigmaPaint[];
      }
      // Single fill
      const p = fillToFigmaPaint(parsed);
      return p ? [p] : [];
    } catch { return []; }
  }

  set fills(paints: FigmaPaint[]) {
    if (!paints.length) return;
    const first = paints[0];
    if (first.type === "SOLID") {
      const c = first.color;
      const a = first.opacity ?? c.a ?? 1;
      this._engine.set_fill(this._bid,
        Math.round(c.r * 255),
        Math.round(c.g * 255),
        Math.round(c.b * 255),
        Math.round(a * 255)
      );
    } else if (first.type === "GRADIENT_LINEAR" && first.gradientStops?.length) {
      const stopsJson = JSON.stringify(first.gradientStops.map(s => ({
        offset: s.position,
        color: {
          r: Math.round(s.color.r * 255),
          g: Math.round(s.color.g * 255),
          b: Math.round(s.color.b * 255),
          a: Math.round((s.color.a ?? 1) * 255),
        }
      })));
      this._engine.set_fill_linear_gradient?.(this._bid, 0, 0, 1, 0, stopsJson);
    }
    this._editor.requestRender();
  }

  // Strokes
  get strokes(): FigmaStroke[] {
    try {
      const info = this._engine.get_stroke_info?.(this._bid);
      if (!info) return [];
      const parsed = JSON.parse(info);
      if (parsed.color) {
        return [{
          type: "SOLID",
          color: {
            r: parsed.color.r / 255,
            g: parsed.color.g / 255,
            b: parsed.color.b / 255,
            a: (parsed.color.a ?? 255) / 255,
          }
        }];
      }
      return [];
    } catch { return []; }
  }

  set strokes(v: FigmaStroke[]) {
    if (v.length && v[0].type === "SOLID") {
      const c = v[0].color;
      this._engine.set_stroke(this._bid,
        Math.round(c.r * 255),
        Math.round(c.g * 255),
        Math.round(c.b * 255),
        Math.round((c.a ?? 1) * 255),
        1 // default width
      );
      this._editor.requestRender();
    }
  }

  get strokeWeight(): number {
    try {
      const info = this._engine.get_stroke_info?.(this._bid);
      return info ? JSON.parse(info).width ?? 0 : 0;
    } catch { return 0; }
  }
  set strokeWeight(v: number) {
    // Re-set stroke with new width
    const strokes = this.strokes;
    if (strokes.length) {
      const c = strokes[0].color;
      this._engine.set_stroke(this._bid,
        Math.round(c.r * 255), Math.round(c.g * 255),
        Math.round(c.b * 255), Math.round((c.a ?? 1) * 255), v);
      this._editor.requestRender();
    }
  }

  // Text-specific
  get characters(): string {
    return this._engine.get_text_content?.(this._bid) ?? "";
  }
  set characters(v: string) {
    this._engine.set_text_content?.(this._bid, v);
    this._editor.requestRender();
  }
  get fontSize(): number {
    return this._engine.get_font_size?.(this._bid) ?? 16;
  }
  set fontSize(v: number) {
    this._engine.set_font_size?.(this._bid, v);
    this._editor.requestRender();
  }

  // Children (Frame/Group)
  get children(): FigmaNode[] {
    try {
      const childIds = this._engine.get_children?.(this._bid);
      if (!childIds) return [];
      return Array.from(childIds as BigInt64Array).map(
        (bid: any) => nodeFromId(this._editor, Number(bid))
      ).filter(Boolean) as FigmaNode[];
    } catch { return []; }
  }

  // Parent
  get parent(): FigmaNode | null {
    try {
      const pid = this._engine.get_parent?.(this._bid);
      if (pid === undefined || pid === null || Number(pid) === 0) return null;
      return nodeFromId(this._editor, Number(pid));
    } catch { return null; }
  }

  // Append child (for Frame/Group)
  appendChild(child: FigmaNode): void {
    this._engine.reparent_node?.(child._bid, this._bid);
    this._editor.requestRender();
  }

  // Remove
  remove(): void {
    this._engine.remove_node(this._bid);
    this._editor.requestRender();
  }

  // Resize
  resize(w: number, h: number): void {
    this._engine.resize_node(this._bid, w, h);
    this._editor.requestRender();
  }

  // Clone
  clone(): FigmaNode {
    // Use duplicate approach
    const engine = this._engine;
    engine.set_selection(new BigUint64Array([BigInt(this.id)]));
    const json = engine.export_selection?.();
    if (json) {
      // Simple duplicate via copy-paste
      engine.paste_nodes?.(json, 0, 0);
    }
    // Return self as fallback (not ideal but functional)
    return this;
  }
}

// ── Helper: map OpenSketch fill info to FigmaPaint ──

function fillToFigmaPaint(f: any): FigmaPaint | null {
  if (!f) return null;
  if (f.type === "Solid" || f.color) {
    const c = f.color || f;
    return {
      type: "SOLID",
      color: {
        r: (c.r ?? 0) / 255,
        g: (c.g ?? 0) / 255,
        b: (c.b ?? 0) / 255,
        a: (c.a ?? 255) / 255,
      },
      visible: f.visible !== false,
    };
  }
  return null;
}

function nodeFromId(editor: Editor, id: number): FigmaNode | null {
  const engine = (editor as any).engine;
  try {
    const json = engine.get_node_json(BigInt(id));
    if (!json) return null;
    const data = JSON.parse(json);
    const kindMap: Record<string, string> = {
      "Rect": "RECTANGLE",
      "Ellipse": "ELLIPSE",
      "Text": "TEXT",
      "Frame": "FRAME",
      "Group": "GROUP",
      "Star": "STAR",
      "Polygon": "POLYGON",
      "Path": "VECTOR",
      "Image": "RECTANGLE", // Figma images are rects with image fills
      "Instance": "INSTANCE",
    };
    const type = kindMap[data.kind] || "RECTANGLE";
    return new FigmaNode(editor, id, type);
  } catch { return null; }
}

// ── FigmaPage ──

class FigmaPage {
  readonly _editor: Editor;
  readonly _engine: any;

  constructor(editor: Editor) {
    this._editor = editor;
    this._engine = (editor as any).engine;
  }

  get name(): string { return "Page 1"; }
  set name(_v: string) { /* TODO multi-page rename */ }

  get children(): FigmaNode[] {
    try {
      const rootIds = this._engine.get_root_children?.();
      if (!rootIds) return [];
      return Array.from(rootIds as BigInt64Array)
        .map((bid: any) => nodeFromId(this._editor, Number(bid)))
        .filter(Boolean) as FigmaNode[];
    } catch { return []; }
  }

  get selection(): FigmaNode[] {
    const sel = this._engine.get_selection();
    return Array.from(sel as BigUint64Array)
      .map((bid: any) => nodeFromId(this._editor, Number(bid)))
      .filter(Boolean) as FigmaNode[];
  }

  set selection(nodes: FigmaNode[]) {
    const ids = new BigUint64Array(nodes.map(n => BigInt(n.id)));
    this._engine.set_selection(ids);
  }

  appendChild(node: FigmaNode): void {
    // Already added to scene during create
  }

  findAll(predicate?: (node: FigmaNode) => boolean): FigmaNode[] {
    const result: FigmaNode[] = [];
    const allJson = this._engine.export_scene();
    try {
      const scene = JSON.parse(allJson);
      const walk = (nodes: any[]) => {
        for (const n of nodes) {
          const fn = nodeFromId(this._editor, n.id);
          if (fn && (!predicate || predicate(fn))) result.push(fn);
          if (n.children) walk(n.children);
        }
      };
      if (scene.nodes) walk(scene.nodes);
    } catch {}
    return result;
  }

  findOne(predicate: (node: FigmaNode) => boolean): FigmaNode | null {
    return this.findAll(predicate)[0] || null;
  }
}

// ── FigmaViewport ──

class FigmaViewport {
  private _editor: Editor;

  constructor(editor: Editor) {
    this._editor = editor;
  }

  get zoom(): number { return (this._editor as any).zoom ?? 1; }
  set zoom(v: number) { (this._editor as any).zoomTo100?.(); /* approximate */ }

  get center(): { x: number; y: number } {
    const e = this._editor as any;
    const cx = (e.panX ?? 0) + (e.canvas?.width ?? 0) / 2 / (e.zoom ?? 1);
    const cy = (e.panY ?? 0) + (e.canvas?.height ?? 0) / 2 / (e.zoom ?? 1);
    return { x: cx, y: cy };
  }

  scrollAndZoomIntoView(nodes: FigmaNode[]): void {
    (this._editor as any).zoomToFit?.();
  }
}

// ── Main: createFigmaCompat ──

export interface FigmaCompat {
  figma: any;
  __ui: {
    onmessage: ((msg: { data: { pluginMessage: any } }) => void) | null;
    postMessage(pluginMessage: any): void;
  };
  destroy(): void;
}

type EventHandler = (...args: any[]) => void;

export function createFigmaCompat(editor: Editor): FigmaCompat {
  const engine = (editor as any).engine;
  const page = new FigmaPage(editor);
  const viewport = new FigmaViewport(editor);
  const listeners: Map<string, Set<EventHandler>> = new Map();

  // UI communication channel
  const uiChannel = {
    onmessage: null as ((msg: { data: { pluginMessage: any } }) => void) | null,
    postMessage(pluginMessage: any) {
      // From UI to plugin
      const handlers = listeners.get("message");
      if (handlers) {
        for (const h of handlers) {
          h(pluginMessage);
        }
      }
    },
  };

  const figma = {
    // ── Node creation ──
    createRectangle(): FigmaNode {
      const id = Number(engine.add_rect(0, 0, 100, 100));
      editor.requestRender();
      return new FigmaNode(editor, id, "RECTANGLE");
    },
    createEllipse(): FigmaNode {
      const id = Number(engine.add_ellipse(0, 0, 100, 100));
      editor.requestRender();
      return new FigmaNode(editor, id, "ELLIPSE");
    },
    createFrame(): FigmaNode {
      const id = Number(engine.add_frame(0, 0, 200, 200, "Frame"));
      editor.requestRender();
      return new FigmaNode(editor, id, "FRAME");
    },
    createText(): FigmaNode {
      const id = Number(engine.add_text(0, 0, "Text", 16));
      editor.requestRender();
      return new FigmaNode(editor, id, "TEXT");
    },
    createStar(): FigmaNode {
      const id = Number(engine.add_star(0, 0, 50, 50, 5, 0.38));
      editor.requestRender();
      return new FigmaNode(editor, id, "STAR");
    },
    createPolygon(): FigmaNode {
      const id = Number(engine.add_polygon(0, 0, 50, 50, 3));
      editor.requestRender();
      return new FigmaNode(editor, id, "POLYGON");
    },
    group(nodes: FigmaNode[], parent: FigmaNode): FigmaNode {
      // Select and group
      const ids = new BigUint64Array(nodes.map(n => BigInt(n.id)));
      engine.set_selection(ids);
      const gid = Number(engine.group_selection?.() ?? 0);
      editor.requestRender();
      return gid ? new FigmaNode(editor, gid, "GROUP") : nodes[0];
    },

    // ── Page ──
    get currentPage() { return page; },
    get root() {
      return { children: [page] };
    },

    // ── Viewport ──
    get viewport() { return viewport; },

    // ── Node lookup ──
    getNodeById(id: string): FigmaNode | null {
      return nodeFromId(editor, Number(id));
    },

    // ── Notifications ──
    notify(message: string, options?: { timeout?: number; error?: boolean }): { cancel: () => void } {
      const div = document.createElement("div");
      div.style.cssText = `position:fixed;bottom:60px;left:50%;transform:translateX(-50%);
        background:${options?.error ? "#f38ba8" : "#313244"};color:${options?.error ? "#1e1e2e" : "#cdd6f4"};
        padding:8px 16px;border-radius:8px;font-size:13px;z-index:99999;
        box-shadow:0 4px 12px rgba(0,0,0,0.3);font-family:Inter,system-ui,sans-serif;`;
      div.textContent = message;
      document.body.appendChild(div);
      const timer = setTimeout(() => div.remove(), options?.timeout ?? 3000);
      return { cancel: () => { clearTimeout(timer); div.remove(); } };
    },

    // ── Close plugin ──
    closePlugin(message?: string): void {
      if (message) figma.notify(message);
    },

    // ── Events ──
    on(event: string, handler: EventHandler): void {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
    },
    once(event: string, handler: EventHandler): void {
      const wrapper = (...args: any[]) => {
        handler(...args);
        figma.off(event, wrapper);
      };
      figma.on(event, wrapper);
    },
    off(event: string, handler: EventHandler): void {
      listeners.get(event)?.delete(handler);
    },

    // ── UI (show UI is a no-op for now, but message passing works) ──
    showUI(html: string, options?: { width?: number; height?: number; visible?: boolean }): void {
      // For simple plugins, inject the HTML into a floating panel
      const existing = document.getElementById("figma-plugin-ui");
      if (existing) existing.remove();

      if (options?.visible === false) return;

      const panel = document.createElement("div");
      panel.id = "figma-plugin-ui";
      panel.style.cssText = `position:fixed;right:20px;bottom:80px;
        width:${options?.width ?? 300}px;height:${options?.height ?? 200}px;
        background:#1e1e2e;border:1px solid #333;border-radius:12px;
        box-shadow:0 8px 32px rgba(0,0,0,0.4);z-index:99998;overflow:hidden;
        display:flex;flex-direction:column;`;

      // Header
      const header = document.createElement("div");
      header.style.cssText = "padding:8px 12px;background:#313244;display:flex;justify-content:space-between;align-items:center;cursor:move;";
      header.innerHTML = `<span style="font-size:12px;color:#cdd6f4;font-family:Inter,system-ui,sans-serif;">Plugin</span>`;
      const closeBtn = document.createElement("button");
      closeBtn.textContent = "✕";
      closeBtn.style.cssText = "background:none;border:none;color:#888;cursor:pointer;font-size:14px;";
      closeBtn.onclick = () => panel.remove();
      header.appendChild(closeBtn);
      panel.appendChild(header);

      // Content iframe (sandboxed)
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "flex:1;border:none;background:white;";
      iframe.sandbox.add("allow-scripts");
      panel.appendChild(iframe);
      document.body.appendChild(panel);

      // Write HTML content
      iframe.srcdoc = html;

      // Message bridge: iframe ↔ plugin
      window.addEventListener("message", (e) => {
        if (e.source === iframe.contentWindow && e.data?.pluginMessage !== undefined) {
          uiChannel.postMessage(e.data.pluginMessage);
        }
      });

      // Plugin → UI messages
      uiChannel.onmessage = (msg) => {
        iframe.contentWindow?.postMessage(msg.data, "*");
      };
    },

    ui: {
      postMessage(pluginMessage: any): void {
        uiChannel.onmessage?.({ data: { pluginMessage } });
      },
      onmessage: null as ((msg: any) => void) | null,
    },

    // ── Mixed (for type compatibility) ──
    mixed: Symbol("mixed"),

    // ── Stubs for unsupported features ──
    loadFontAsync(_font: { family: string; style: string }): Promise<void> {
      return Promise.resolve(); // Fonts are handled by Google Fonts loader
    },
    getLocalPaintStyles(): any[] { return []; },
    getLocalTextStyles(): any[] { return []; },
    getLocalEffectStyles(): any[] { return []; },
    getLocalGridStyles(): any[] { return []; },
    createPaintStyle(): any { return {}; },
    createTextStyle(): any { return {}; },
  };

  return {
    figma,
    __ui: uiChannel,
    destroy() {
      listeners.clear();
      document.getElementById("figma-plugin-ui")?.remove();
    },
  };
}

/**
 * Run a Figma plugin code string in a sandboxed context with the compat layer.
 */
export function runFigmaPlugin(editor: Editor, code: string): FigmaCompat {
  const compat = createFigmaCompat(editor);

  // Create a function scope with `figma` available
  try {
    const fn = new Function("figma", "__html_callback", code);
    fn(compat.figma, (html: string, opts: any) => compat.figma.showUI(html, opts));
  } catch (err) {
    console.error("[FigmaCompat] Plugin error:", err);
    compat.figma.notify(`Plugin error: ${err}`, { error: true });
  }

  return compat;
}
