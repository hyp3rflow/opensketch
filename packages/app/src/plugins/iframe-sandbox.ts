/**
 * Iframe Sandbox Plugin Host
 * Runs untrusted plugins in a sandboxed iframe with postMessage API.
 * Plugins communicate via a structured message protocol.
 */

import type { Plugin, PluginAPI } from "./types";
import type { PluginManager } from "./plugin-manager";
import type { Editor } from "../editor";

// ── Manifest ──

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  icon?: string;
  main: string;           // entry HTML file (relative to plugin root)
  permissions: PluginPermission[];
}

export type PluginPermission =
  | "scene:read"
  | "scene:write"
  | "selection:read"
  | "selection:write"
  | "ui:panels"
  | "ui:notifications"
  | "viewport:read"
  | "viewport:write";

// ── Message protocol ──

interface PluginRequest {
  type: "plugin-request";
  id: number;
  method: string;
  args: any[];
}

interface PluginResponse {
  type: "plugin-response";
  id: number;
  result?: any;
  error?: string;
}

interface PluginEvent {
  type: "plugin-event";
  event: string;
  data: any;
}

interface PluginReady {
  type: "plugin-ready";
}

interface PluginUIRender {
  type: "plugin-ui-render";
  panelId: string;
  html: string;
}

// ── Sandbox Host ──

export class IframeSandbox {
  private iframe: HTMLIFrameElement;
  private _pendingRequests = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private _nextId = 1;
  private _ready = false;
  private _readyPromise: Promise<void>;
  private _readyResolve!: () => void;
  private _eventForwarders: Array<{ event: string; handler: Function }> = [];
  private _manifest: PluginManifest;
  private _destroyed = false;

  constructor(
    private editor: Editor,
    private manager: PluginManager,
    manifest: PluginManifest,
    pluginCode: string,
  ) {
    this._manifest = manifest;

    this._readyPromise = new Promise(r => { this._readyResolve = r; });

    // Create sandboxed iframe
    this.iframe = document.createElement("iframe");
    this.iframe.setAttribute("sandbox", "allow-scripts");
    this.iframe.style.display = "none";
    this.iframe.srcdoc = this._buildSrcdoc(pluginCode);
    document.body.appendChild(this.iframe);

    window.addEventListener("message", this._onMessage);
  }

  private _buildSrcdoc(pluginCode: string): string {
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head><body>
<script>
// OpenSketch Plugin Sandbox Runtime
const _os = {
  _nextId: 1,
  _pending: new Map(),

  async _call(method, ...args) {
    const id = this._nextId++;
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      parent.postMessage({ type: "plugin-request", id, method, args }, "*");
    });
  },

  scene: {
    getNodeJson(id) { return _os._call("scene.getNodeJson", id); },
    getSceneJson() { return _os._call("scene.getSceneJson"); },
    getSelection() { return _os._call("scene.getSelection"); },
    addRect(x,y,w,h) { return _os._call("scene.addRect", x,y,w,h); },
    addEllipse(x,y,w,h) { return _os._call("scene.addEllipse", x,y,w,h); },
    addText(x,y,c,fs) { return _os._call("scene.addText", x,y,c,fs); },
    addFrame(x,y,w,h,n) { return _os._call("scene.addFrame", x,y,w,h,n); },
    removeNode(id) { return _os._call("scene.removeNode", id); },
    setFill(id,r,g,b,a) { return _os._call("scene.setFill", id,r,g,b,a); },
    setPosition(id,x,y) { return _os._call("scene.setPosition", id,x,y); },
    setSize(id,w,h) { return _os._call("scene.setSize", id,w,h); },
    setName(id,n) { return _os._call("scene.setName", id,n); },
    select(id) { return _os._call("scene.select", id); },
    deselectAll() { return _os._call("scene.deselectAll"); },
  },

  ui: {
    showNotification(msg, type) { return _os._call("ui.showNotification", msg, type); },
    setPanel(panelId, html) {
      parent.postMessage({ type: "plugin-ui-render", panelId, html }, "*");
    },
  },

  viewport: {
    getTransform() { return _os._call("viewport.getTransform"); },
    panTo(x,y) { return _os._call("viewport.panTo", x,y); },
    zoomTo(z) { return _os._call("viewport.zoomTo", z); },
  },

  _eventHandlers: new Map(),
  on(event, handler) {
    if (!this._eventHandlers.has(event)) this._eventHandlers.set(event, []);
    this._eventHandlers.get(event).push(handler);
    _os._call("event.subscribe", event);
  },
};

window.addEventListener("message", (e) => {
  const msg = e.data;
  if (msg.type === "plugin-response") {
    const p = _os._pending.get(msg.id);
    if (p) {
      _os._pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error));
      else p.resolve(msg.result);
    }
  } else if (msg.type === "plugin-event") {
    const handlers = _os._eventHandlers.get(msg.event) || [];
    handlers.forEach(h => { try { h(msg.data); } catch(e) { console.error(e); } });
  }
});

// Plugin code
try {
  ${pluginCode}
  parent.postMessage({ type: "plugin-ready" }, "*");
} catch(e) {
  console.error("[Plugin sandbox error]", e);
}
</script></body></html>`;
  }

  private _onMessage = (e: MessageEvent) => {
    if (this._destroyed) return;
    if (e.source !== this.iframe.contentWindow) return;

    const msg = e.data;
    if (msg.type === "plugin-ready") {
      this._ready = true;
      this._readyResolve();
    } else if (msg.type === "plugin-request") {
      this._handleRequest(msg as PluginRequest);
    } else if (msg.type === "plugin-ui-render") {
      // Plugin wants to render HTML in a panel
      const uiMsg = msg as PluginUIRender;
      this._handleUIRender(uiMsg);
    }
  };

  private _hasPermission(perm: PluginPermission): boolean {
    return this._manifest.permissions.includes(perm);
  }

  private async _handleRequest(req: PluginRequest) {
    const respond = (result?: any, error?: string) => {
      this.iframe.contentWindow?.postMessage(
        { type: "plugin-response", id: req.id, result, error } as PluginResponse,
        "*"
      );
    };

    try {
      const [ns, method] = req.method.split(".");
      const eng = this.editor.engine;

      if (ns === "scene") {
        if (["getNodeJson", "getSceneJson", "getSelection"].includes(method)) {
          if (!this._hasPermission("scene:read")) {
            return respond(undefined, "Permission denied: scene:read");
          }
        } else {
          if (!this._hasPermission("scene:write")) {
            return respond(undefined, "Permission denied: scene:write");
          }
        }

        switch (method) {
          case "getNodeJson": {
            const json = eng.get_node_json(BigInt(req.args[0]));
            return respond(json ? JSON.parse(json) : null);
          }
          case "getSceneJson":
            return respond(JSON.parse(eng.export_scene()));
          case "getSelection":
            return respond(Array.from(eng.get_selection()).map(Number));
          case "addRect":
            return respond(Number(eng.add_rect(...req.args as [number, number, number, number])));
          case "addEllipse":
            return respond(Number(eng.add_ellipse(...req.args as [number, number, number, number])));
          case "addText":
            return respond(Number(eng.add_text(...req.args as [number, number, string, number])));
          case "addFrame":
            return respond(Number(eng.add_frame(req.args[0], req.args[1], req.args[2], req.args[3])));
          case "removeNode":
            eng.remove_node(BigInt(req.args[0]));
            return respond(true);
          case "setFill":
            eng.set_fill_color(BigInt(req.args[0]), req.args[1], req.args[2], req.args[3], req.args[4] ?? 1);
            this.editor.requestRender();
            return respond(true);
          case "setPosition":
            eng.set_node_position(BigInt(req.args[0]), req.args[1], req.args[2]);
            this.editor.requestRender();
            return respond(true);
          case "setSize":
            eng.resize_node(BigInt(req.args[0]), req.args[1], req.args[2]);
            this.editor.requestRender();
            return respond(true);
          case "setName":
            eng.set_node_name(BigInt(req.args[0]), req.args[1]);
            this.editor.requestRender();
            return respond(true);
          case "select":
            eng.deselect_all();
            eng.add_to_selection(BigInt(req.args[0]));
            this.editor.requestRender();
            return respond(true);
          case "deselectAll":
            eng.deselect_all();
            this.editor.requestRender();
            return respond(true);
          default:
            return respond(undefined, `Unknown method: ${req.method}`);
        }
      } else if (ns === "ui") {
        if (!this._hasPermission("ui:notifications")) {
          return respond(undefined, "Permission denied: ui:notifications");
        }
        if (method === "showNotification") {
          this.manager._showNotification(req.args[0], req.args[1] || "info");
          return respond(true);
        }
      } else if (ns === "viewport") {
        if (method === "getTransform") {
          if (!this._hasPermission("viewport:read")) {
            return respond(undefined, "Permission denied: viewport:read");
          }
          return respond({
            panX: (this.editor as any).panX ?? 0,
            panY: (this.editor as any).panY ?? 0,
            zoom: (this.editor as any).zoom ?? 1,
          });
        } else if (method === "panTo" || method === "zoomTo") {
          if (!this._hasPermission("viewport:write")) {
            return respond(undefined, "Permission denied: viewport:write");
          }
          // Viewport manipulation - simplified
          return respond(true);
        }
      } else if (ns === "event") {
        if (method === "subscribe") {
          const eventName = req.args[0] as string;
          const handler = (data: any) => {
            this.iframe.contentWindow?.postMessage(
              { type: "plugin-event", event: eventName, data } as PluginEvent,
              "*"
            );
          };
          this._eventForwarders.push({ event: eventName, handler });
          this.manager._addEventListener(eventName, handler);
          return respond(true);
        }
      }

      respond(undefined, `Unknown method: ${req.method}`);
    } catch (err: any) {
      respond(undefined, err.message || "Internal error");
    }
  }

  private _handleUIRender(_msg: PluginUIRender) {
    // UI rendering from sandbox - could be forwarded to plugin panel
    // For now just log it
    console.log(`[Sandbox] Plugin UI render for panel: ${_msg.panelId}`);
  }

  async waitReady(timeoutMs = 5000): Promise<void> {
    const timeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error("Plugin sandbox timeout")), timeoutMs)
    );
    await Promise.race([this._readyPromise, timeout]);
  }

  destroy() {
    this._destroyed = true;
    window.removeEventListener("message", this._onMessage);
    // Remove event forwarders
    for (const { event, handler } of this._eventForwarders) {
      this.manager._removeEventListener(event, handler);
    }
    this._eventForwarders = [];
    this.iframe.remove();
  }
}

/**
 * Create a sandboxed Plugin from a manifest + code string.
 * Returns a standard Plugin interface that the PluginManager can manage.
 */
export function createSandboxedPlugin(
  manifest: PluginManifest,
  code: string,
): Plugin & { _sandboxRef?: IframeSandbox } {
  let sandbox: IframeSandbox | null = null;

  const plugin: Plugin & { _sandboxRef?: IframeSandbox } = {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    icon: manifest.icon,

    async activate(api: PluginAPI) {
      const editor = api.editor;
      // Access manager through editor - it's exposed on window
      const manager = (window as any).__pluginManager;
      sandbox = new IframeSandbox(editor, manager, manifest, code);
      plugin._sandboxRef = sandbox;
      await sandbox.waitReady();

      // Register a panel for the sandboxed plugin
      if (manifest.permissions.includes("ui:panels")) {
        api.ui.registerPanel({
          id: `${manifest.id}-panel`,
          title: manifest.name,
          render(container) {
            container.innerHTML = `<div style="padding:12px;color:#999;font-size:12px">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
                <span style="width:8px;height:8px;border-radius:50%;background:#22c55e"></span>
                <span style="color:#eee;font-weight:600">${manifest.name}</span>
                <span style="color:#666">v${manifest.version}</span>
              </div>
              <div style="color:#666">Sandboxed plugin running in iframe</div>
              <div style="color:#555;font-size:10px;margin-top:4px">Permissions: ${manifest.permissions.join(", ")}</div>
            </div>`;
          },
          destroy() {},
        });
      }
    },

    async deactivate() {
      sandbox?.destroy();
      sandbox = null;
      plugin._sandboxRef = undefined;
    },
  };

  return plugin;
}
