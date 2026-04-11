import type { Editor } from "../editor";
import { applyEasing } from "./easing-editor";
import { computeScrollAnimOverrides } from "./scroll-animation";
import { applyThemeMode, detectActiveThemeMode, listThemeModeOptions, onThemeModeChanged } from "./variable-theme-modes";

type PrototypeRingStyle = { color: string; width: number; radius: number };
type PrototypeRingPreset = {
  id: string;
  name: string;
  hover: PrototypeRingStyle;
  press: PrototypeRingStyle;
  focus: PrototypeRingStyle;
};

const PROTOTYPE_RING_PRESET_KEY = "opensketch-prototype-ring-presets-v1";
const PROTOTYPE_RING_ACTIVE_PRESET_KEY = "opensketch-prototype-ring-active-preset-id";
const INTERACTIVE_PREVIEW_EVENT = "opensketch:interactive-preview-state";
const PROTOTYPE_FLOW_ENTRY_PRESETS_KEY = "opensketch-proto-flow-entry-presets-v1";
const DEFAULT_RING_PRESET: PrototypeRingPreset = {
  id: "default",
  name: "Default",
  hover: { color: "#f59e0b", width: 3, radius: 8 },
  press: { color: "#fb7185", width: 4, radius: 10 },
  focus: { color: "#facc15", width: 4, radius: 10 },
};

function loadFlowEntryPresets(): Record<string, Array<{ frameId: number; label: string }>> {
  try {
    const raw = localStorage.getItem(PROTOTYPE_FLOW_ENTRY_PRESETS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveFlowEntryPresets(presets: Record<string, Array<{ frameId: number; label: string }>>) {
  try {
    localStorage.setItem(PROTOTYPE_FLOW_ENTRY_PRESETS_KEY, JSON.stringify(presets));
  } catch {}
}

function loadActivePrototypeRingPreset(): PrototypeRingPreset {
  try {
    const listRaw = localStorage.getItem(PROTOTYPE_RING_PRESET_KEY);
    const activeId = localStorage.getItem(PROTOTYPE_RING_ACTIVE_PRESET_KEY);
    if (!listRaw) return DEFAULT_RING_PRESET;
    const list = JSON.parse(listRaw);
    if (!Array.isArray(list) || list.length === 0) return DEFAULT_RING_PRESET;
    const picked = list.find((p: any) => String(p?.id) === String(activeId || "")) || list[0];
    const sanitize = (v: any, fb: PrototypeRingStyle): PrototypeRingStyle => ({
      color: typeof v?.color === "string" && v.color ? v.color : fb.color,
      width: Number.isFinite(Number(v?.width)) ? Math.max(1, Number(v.width)) : fb.width,
      radius: Number.isFinite(Number(v?.radius)) ? Math.max(0, Number(v.radius)) : fb.radius,
    });
    return {
      id: String(picked?.id || DEFAULT_RING_PRESET.id),
      name: String(picked?.name || DEFAULT_RING_PRESET.name),
      hover: sanitize(picked?.hover, DEFAULT_RING_PRESET.hover),
      press: sanitize(picked?.press, DEFAULT_RING_PRESET.press),
      focus: sanitize(picked?.focus, DEFAULT_RING_PRESET.focus),
    };
  } catch {
    return DEFAULT_RING_PRESET;
  }
}

/**
 * Prototype presentation mode viewer.
 * Full-screen overlay that renders frames with clickable interaction hotspots.
 * Supports animated transitions: Dissolve, SmartAnimate, SlideIn, SlideOut, Push.
 */
export function createPrototypeViewer(editor: Editor): {
  show: (startFrameId?: number) => void;
  hide: () => void;
  isActive: () => boolean;
} {
  let overlay: HTMLDivElement | null = null;
  let viewCanvas: HTMLCanvasElement | null = null;
  let active = false;
  let currentFrameId: number | null = null;
  let navigationStack: number[] = [];
  let transitioning = false;
  /** Prototype variable runtime state */
  let protoVars: Map<string, string> = new Map();
  let protoVarDefs: Map<string, { type: string; defaultValue: string }> = new Map();
  let protoVarHistory: Array<{ at: number; name: string; prev: string; next: string; source: "interaction" | "override" | "init" }> = [];
  let varsPanel: HTMLDivElement | null = null;
  let showVarsOverlay = true;
  let offThemeSync: (() => void) | null = null;
  let snapPaginationEl: HTMLDivElement | null = null;
  let snapPaginationState: { frameId: number; axis: "x" | "y"; points: number[]; activeIndex: number } | null = null;
  let flowMinimapWrap: HTMLDivElement | null = null;
  let flowMinimapCanvas: HTMLCanvasElement | null = null;
  let flowMinimapInfo: HTMLDivElement | null = null;
  let flowMinimapSnapshot: { nodes: Array<{ id: number; name: string; x: number; y: number }>; edges: Array<{ from: number; to: number; action: string }>; nodeHits: Array<{ id: number; x: number; y: number; r: number }>; edgeHits: Array<{ from: number; to: number; x: number; y: number }>; } | null = null;
  let flowStartWrap: HTMLDivElement | null = null;
  let flowStartFlowSel: HTMLSelectElement | null = null;
  let flowStartFrameSel: HTMLSelectElement | null = null;
  let flowStartInfo: HTMLDivElement | null = null;
  let flowLintWrap: HTMLDivElement | null = null;
  let flowLintInfo: HTMLDivElement | null = null;
  let flowLintList: HTMLDivElement | null = null;
  let flowLintSnapshot: { startFrameId: number | null; issues: Array<{ type: "unreachable" | "dead-end" | "cycle"; frameId: number; frameName: string; detail: string }>; } | null = null;
  const interactiveVisualState = new Map<number, "hover" | "press" | "focus">();

  type RecordedProtoEvent = {
    t: number;
    kind: "click" | "scroll" | "navigate" | "input";
    frameId: number | null;
    nodeId?: number;
    x?: number;
    y?: number;
    dx?: number;
    dy?: number;
    toFrameId?: number;
    action?: string;
    inputType?: "key" | "paste";
    key?: string;
    text?: string;
  };
  let recorderEnabled = false;
  let recorderStartedAt = 0;
  let recorderEvents: RecordedProtoEvent[] = [];

  type PrototypeDevicePreset = {
    id: string;
    label: string;
    bezel: number;
    cornerRadius: number;
    notchWidth?: number;
    notchHeight?: number;
    safeTop: number;
    safeRight: number;
    safeBottom: number;
    safeLeft: number;
    homeIndicatorWidth?: number;
    homeIndicatorHeight?: number;
    statusBarHeight?: number;
    refWidth?: number;
    refHeight?: number;
  };

  const DEVICE_PRESETS: PrototypeDevicePreset[] = [
    { id: "none", label: "No Device", bezel: 0, cornerRadius: 0, safeTop: 0, safeRight: 0, safeBottom: 0, safeLeft: 0 },
    { id: "iphone14", label: "iPhone 14 Pro", bezel: 18, cornerRadius: 34, notchWidth: 126, notchHeight: 34, safeTop: 59, safeRight: 0, safeBottom: 34, safeLeft: 0, homeIndicatorWidth: 134, homeIndicatorHeight: 5, statusBarHeight: 24, refWidth: 393, refHeight: 852 },
    { id: "pixel8", label: "Pixel 8", bezel: 14, cornerRadius: 28, notchWidth: 40, notchHeight: 24, safeTop: 30, safeRight: 0, safeBottom: 24, safeLeft: 0, homeIndicatorWidth: 96, homeIndicatorHeight: 4, statusBarHeight: 24, refWidth: 412, refHeight: 915 },
    { id: "ipad", label: "iPad", bezel: 22, cornerRadius: 24, safeTop: 24, safeRight: 0, safeBottom: 20, safeLeft: 0, homeIndicatorWidth: 126, homeIndicatorHeight: 5, statusBarHeight: 24, refWidth: 834, refHeight: 1194 },
    { id: "iphone-se", label: "iPhone SE", bezel: 16, cornerRadius: 26, safeTop: 20, safeRight: 0, safeBottom: 0, safeLeft: 0, statusBarHeight: 20, refWidth: 375, refHeight: 667 },
  ];
  let selectedDeviceId = "none";
  let deviceOrientation: "portrait" | "landscape" = "portrait";
  let showSafeAreaOverlay = true;
  let showScrollbarOverlay = true;

  type ScrollPhysicsPreset = {
    id: string;
    label: string;
    wheelGain: number;
    touchGain: number;
    inertiaDecay: number;
    overscroll: number;
  };
  const SCROLL_PHYSICS_PRESETS: ScrollPhysicsPreset[] = [
    { id: "ios", label: "iOS", wheelGain: 1.0, touchGain: 1.0, inertiaDecay: 0.93, overscroll: 48 },
    { id: "android", label: "Android", wheelGain: 0.95, touchGain: 0.95, inertiaDecay: 0.9, overscroll: 20 },
    { id: "web", label: "Web", wheelGain: 1.0, touchGain: 1.0, inertiaDecay: 0.87, overscroll: 0 },
  ];
  let selectedScrollPhysicsId = "ios";

  type SmartTimelineKeyframe = { time: number; label?: string; easing?: string };
  type PrototypeShareState = {
    version: 1;
    flowId?: number | null;
    startFrameId?: number | null;
    pageId?: number | null;
    vars?: Record<string, string>;
  };

  const PROTO_SHARE_PARAM = "proto";

  function toBase64Url(raw: string): string {
    const bytes = new TextEncoder().encode(raw);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function fromBase64Url(raw: string): string {
    const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function detectFlowIdForFrame(frameId: number | null): number | null {
    if (!frameId) return null;
    try {
      const flows: any[] = JSON.parse(editor.engine.get_prototype_flows() || "[]") || [];
      const exact = flows.find((f: any) => Number(f?.start_frame_id || 0) === frameId);
      return exact ? Number(exact.id || 0) : null;
    } catch {
      return null;
    }
  }

  function buildShareState(): PrototypeShareState {
    return {
      version: 1,
      flowId: detectFlowIdForFrame(currentFrameId),
      startFrameId: currentFrameId,
      pageId: Number(editor.engine.get_active_page_id() || 0),
      vars: Object.fromEntries(protoVars.entries()),
    };
  }

  function parseShareStateFromUrl(): PrototypeShareState | null {
    try {
      const url = new URL(window.location.href);
      const encoded = url.searchParams.get(PROTO_SHARE_PARAM);
      if (!encoded) return null;
      const json = fromBase64Url(encoded);
      const data = JSON.parse(json);
      if (!data || Number(data.version) !== 1) return null;
      return data as PrototypeShareState;
    } catch {
      return null;
    }
  }

  function buildShareUrl(): string {
    const state = buildShareState();
    const url = new URL(window.location.href);
    url.searchParams.set(PROTO_SHARE_PARAM, toBase64Url(JSON.stringify(state)));
    return url.toString();
  }

  function applyShareState(state: PrototypeShareState) {
    if (!state) return;
    const frameId = Number(state.startFrameId || 0);
    if (frameId > 0) currentFrameId = frameId;
    const pageId = Number(state.pageId || 0);
    if (pageId > 0) {
      try { editor.engine.set_active_page(BigInt(pageId)); } catch {}
    }
    if (state.vars && typeof state.vars === "object") {
      for (const [k, v] of Object.entries(state.vars)) {
        protoVars.set(String(k), String(v));
      }
    }
  }

  /** Initialize prototype variables from engine definitions */
  function initProtoVars() {
    protoVars.clear();
    protoVarDefs.clear();
    protoVarHistory = [];
    try {
      const defs: { name: string; var_type: string; default_value: string }[] =
        JSON.parse(editor.engine.get_prototype_variables());
      for (const v of defs) {
        const type = String(v.var_type || "string").toLowerCase();
        const defaultValue = String(v.default_value ?? "");
        protoVarDefs.set(v.name, { type, defaultValue });
        protoVars.set(v.name, defaultValue);
      }
    } catch {}
  }

  function setProtoVar(varName: string, nextValue: string, source: "interaction" | "override" | "init") {
    const prev = String(protoVars.get(varName) ?? "");
    const next = String(nextValue ?? "");
    if (prev === next) return;
    protoVars.set(varName, next);
    protoVarHistory.unshift({ at: Date.now(), name: varName, prev, next, source });
    if (protoVarHistory.length > 40) protoVarHistory.length = 40;
  }

  /** Evaluate a SetVariable expression */
  function evalSetVariable(varName: string, expression: string) {
    const current = String(protoVars.get(varName) ?? "0");
    const def = protoVarDefs.get(varName);
    const type = String(def?.type || "string");
    let next = String(expression ?? "");

    // Increment/decrement shorthand
    if (/^[+-]\d+(\.\d+)?$/.test(expression)) {
      const num = parseFloat(current) || 0;
      next = String(num + parseFloat(expression));
    } else if (expression === "toggle") {
      next = current === "true" ? "false" : "true";
    } else if (type === "number") {
      const n = Number(expression);
      next = Number.isFinite(n) ? String(n) : current;
    } else if (type === "boolean") {
      const low = String(expression).trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(low)) next = "true";
      else if (["false", "0", "no", "off"].includes(low)) next = "false";
      else next = current;
    }

    setProtoVar(varName, next, "interaction");
    renderVarsPanel();
  }

  /** Check if an interaction's condition passes (v1 leaf + v2 group recursion) */
  function checkCondition(inter: any): boolean {
    const evalLeaf = (cond: any): boolean => {
      const variable = String(cond?.variable || "").trim();
      if (!variable) return true;
      const operator = String(cond?.operator || "Equal");
      const value = String(cond?.value ?? "");
      const current = String(protoVars.get(variable) ?? "");

      // Numeric comparison
      const l = parseFloat(current);
      const r = parseFloat(value);
      if (!isNaN(l) && !isNaN(r)) {
        switch (operator) {
          case "Equal": return Math.abs(l - r) < 1e-9;
          case "NotEqual": return Math.abs(l - r) >= 1e-9;
          case "GreaterThan": return l > r;
          case "LessThan": return l < r;
          case "GreaterThanOrEqual": return l >= r;
          case "LessThanOrEqual": return l <= r;
        }
      }

      // String/boolean fallback
      switch (operator) {
        case "Equal": return current === value;
        case "NotEqual": return current !== value;
        case "GreaterThan": return current > value;
        case "LessThan": return current < value;
        case "GreaterThanOrEqual": return current >= value;
        case "LessThanOrEqual": return current <= value;
      }
      return true;
    };

    const evalCond = (cond: any): boolean => {
      if (!cond) return true;
      const children = Array.isArray(cond.conditions) ? cond.conditions : [];
      const logic = String(cond.logic || "").toUpperCase();
      if ((logic === "AND" || logic === "OR") && children.length > 0) {
        return logic === "AND" ? children.every(evalCond) : children.some(evalCond);
      }
      return evalLeaf(cond);
    };

    return evalCond(inter?.condition);
  }



  /** Evaluate prototype visibility rule JSON against current prototype vars */
  function evaluatePrototypeVisibilityRule(rule: any): boolean {
    const evalLeaf = (cond: any): boolean => {
      const variable = String(cond?.variable || "").trim();
      if (!variable) return true;
      const operator = String(cond?.operator || "Equal");
      const value = String(cond?.value ?? "");
      const current = String(protoVars.get(variable) ?? "");

      const l = parseFloat(current);
      const r = parseFloat(value);
      if (!isNaN(l) && !isNaN(r) && value !== "") {
        switch (operator) {
          case "Equal": return Math.abs(l - r) < 1e-9;
          case "NotEqual": return Math.abs(l - r) >= 1e-9;
          case "GreaterThan": return l > r;
          case "LessThan": return l < r;
          case "GreaterThanOrEqual": return l >= r;
          case "LessThanOrEqual": return l <= r;
          default: return true;
        }
      }

      switch (operator) {
        case "Equal": return current === value;
        case "NotEqual": return current !== value;
        case "GreaterThan": return current > value;
        case "LessThan": return current < value;
        case "GreaterThanOrEqual": return current >= value;
        case "LessThanOrEqual": return current <= value;
        default: return true;
      }
    };

    const evalCond = (cond: any): boolean => {
      if (!cond || typeof cond !== "object") return true;
      const children = Array.isArray(cond.conditions) ? cond.conditions : [];
      const logic = String(cond.logic || "").toUpperCase();
      if ((logic === "AND" || logic === "OR") && children.length > 0) {
        return logic === "AND" ? children.every(evalCond) : children.some(evalCond);
      }
      return evalLeaf(cond);
    };

    return evalCond(rule);
  }

  /** Apply prototype visibility overrides for current frame; returns restore fn */
  function applyPrototypeVisibilityOverrides(frameId: number): () => void {
    const prev = new Map<number, boolean>();
    try {
      const ids = collectSubtreeIds(frameId);
      for (const nid of ids) {
        const nodeJson = editor.engine.get_node_json(BigInt(nid));
        if (!nodeJson) continue;
        const node = JSON.parse(nodeJson);
        const wasVisible = node?.visible !== false;
        let shouldShow = wasVisible;

        const rawRule = String((editor.engine as any).get_prototype_visibility_rule?.(BigInt(nid)) || "").trim();
        if (rawRule) {
          try {
            const rule = JSON.parse(rawRule);
            shouldShow = wasVisible && evaluatePrototypeVisibilityRule(rule);
          } catch {
            shouldShow = wasVisible;
          }
        }

        if (shouldShow !== wasVisible) {
          prev.set(nid, wasVisible);
          editor.engine.set_visible(BigInt(nid), shouldShow);
        }
      }
    } catch {}

    return () => {
      try {
        for (const [nid, visible] of prev.entries()) {
          editor.engine.set_visible(BigInt(nid), visible);
        }
      } catch {}
    };
  }

  /** Build floating variables debug panel */
  function buildVarsPanel() {
    if (!overlay) return;
    varsPanel = document.createElement("div");
    varsPanel.style.cssText = `
      position:absolute;bottom:12px;left:12px;
      background:rgba(22,33,62,0.92);border:1px solid #333;
      border-radius:8px;padding:8px 12px;z-index:2;
      font-size:11px;color:#ccc;min-width:220px;max-width:360px;
      max-height:42vh;overflow:auto;
      backdrop-filter:blur(8px);
    `;
    overlay.appendChild(varsPanel);
    renderVarsPanel();
  }

  function collectSubtreeIds(rootId: number): number[] {
    const out: number[] = [];
    const walk = (id: number) => {
      out.push(id);
      try {
        const raw = editor.engine.get_node_json(BigInt(id));
        if (!raw) return;
        const node = JSON.parse(raw);
        const children: any[] = Array.isArray(node?.children) ? node.children : [];
        for (const cid of children) {
          const num = Number(cid || 0);
          if (num > 0) walk(num);
        }
      } catch {}
    };
    walk(rootId);
    return out;
  }

  function renderVarsPanel() {
    if (!varsPanel) return;
    if (!showVarsOverlay) {
      varsPanel.style.display = "none";
      return;
    }
    varsPanel.innerHTML = "";

    // Section 1: prototype runtime vars + override inspector
    if (protoVars.size > 0) {
      const title = document.createElement("div");
      title.style.cssText = "font-weight:700;margin-bottom:6px;color:#818cf8;";
      title.textContent = "Prototype Variables (Runtime)";
      varsPanel.appendChild(title);

      for (const [name, val] of protoVars) {
        const def = protoVarDefs.get(name);
        const type = String(def?.type || "string");

        const row = document.createElement("div");
        row.style.cssText = "padding:4px 0 6px;border-bottom:1px solid rgba(255,255,255,0.06);";

        const head = document.createElement("div");
        head.style.cssText = "display:flex;justify-content:space-between;gap:8px;align-items:center;";
        const nameEl = document.createElement("span");
        nameEl.style.cssText = "color:#a5b4fc;font-weight:600;";
        nameEl.textContent = name;
        const typeEl = document.createElement("span");
        typeEl.style.cssText = "color:#94a3b8;font-size:10px;text-transform:uppercase;";
        typeEl.textContent = type;
        head.appendChild(nameEl);
        head.appendChild(typeEl);
        row.appendChild(head);

        const controls = document.createElement("div");
        controls.style.cssText = "display:flex;gap:6px;align-items:center;margin-top:4px;";
        if (type === "boolean") {
          const check = document.createElement("input");
          check.type = "checkbox";
          check.checked = String(val) === "true";
          check.addEventListener("change", () => {
            setProtoVar(name, check.checked ? "true" : "false", "override");
            renderVarsPanel();
          });
          controls.appendChild(check);
        } else {
          const input = document.createElement("input");
          input.className = "prop-input";
          input.style.cssText = "flex:1;min-width:0;height:24px;font-size:11px;";
          input.value = String(val);
          if (type === "number") input.inputMode = "decimal";
          const commit = () => {
            const raw = input.value;
            if (type === "number") {
              const n = Number(raw);
              if (!Number.isFinite(n)) {
                input.value = String(protoVars.get(name) ?? "0");
                return;
              }
              setProtoVar(name, String(n), "override");
            } else {
              setProtoVar(name, raw, "override");
            }
            renderVarsPanel();
          };
          input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") commit();
          });
          input.addEventListener("blur", commit);
          controls.appendChild(input);
        }

        const resetBtn = document.createElement("button");
        resetBtn.style.cssText = "background:#1f2937;color:#cbd5e1;border:1px solid #334155;border-radius:6px;padding:2px 6px;cursor:pointer;font-size:10px;";
        resetBtn.textContent = "Reset";
        resetBtn.addEventListener("click", () => {
          const fallback = String(def?.defaultValue ?? "");
          setProtoVar(name, fallback, "override");
          renderVarsPanel();
        });
        controls.appendChild(resetBtn);
        row.appendChild(controls);

        const valueLine = document.createElement("div");
        valueLine.style.cssText = "font-size:10px;color:#86efac;margin-top:3px;font-family:ui-monospace,Menlo,monospace;";
        valueLine.textContent = `value: ${String(protoVars.get(name) ?? "")}`;
        row.appendChild(valueLine);

        varsPanel.appendChild(row);
      }

      const histTitle = document.createElement("div");
      histTitle.style.cssText = "font-weight:700;margin-top:8px;margin-bottom:4px;color:#c4b5fd;font-size:11px;";
      histTitle.textContent = "Recent Changes";
      varsPanel.appendChild(histTitle);
      if (protoVarHistory.length === 0) {
        const empty = document.createElement("div");
        empty.style.cssText = "font-size:10px;color:#94a3b8;margin-bottom:4px;";
        empty.textContent = "No variable changes yet.";
        varsPanel.appendChild(empty);
      } else {
        protoVarHistory.slice(0, 8).forEach((entry) => {
          const row = document.createElement("div");
          const t = new Date(entry.at).toLocaleTimeString("ko-KR", { hour12: false });
          row.style.cssText = "font-size:10px;color:#cbd5e1;line-height:1.3;padding:2px 0;";
          row.innerHTML = `<span style=\"color:#93c5fd;\">${t}</span> <span style=\"color:#a5b4fc;\">${entry.name}</span> <span style=\"color:#94a3b8;\">${entry.prev}</span> <span style=\"color:#fda4af;\">→</span> <span style=\"color:#86efac;\">${entry.next}</span> <span style=\"color:#94a3b8;\">(${entry.source})</span>`;
          varsPanel.appendChild(row);
        });
      }
    }

    // Section 2: frame-active design variables inspector
    if (currentFrameId !== null) {
      const spacer = document.createElement("div");
      spacer.style.cssText = "height:8px;";
      varsPanel.appendChild(spacer);

      const title2 = document.createElement("div");
      title2.style.cssText = "font-weight:700;margin-bottom:4px;color:#fbbf24;";
      title2.textContent = "Active Variables (Current Frame)";
      varsPanel.appendChild(title2);

      const byKey = new Map<string, { collectionName: string; variableName: string; modeName: string; value: string; count: number; sources: string[] }>();
      let collections: any[] = [];
      try { collections = JSON.parse(editor.engine.get_variable_collections() || "[]") || []; } catch {}
      const subtree = collectSubtreeIds(currentFrameId);
      const nodeNameCache = new Map<number, string>();
      const getNodeName = (nodeId: number): string => {
        if (nodeNameCache.has(nodeId)) return nodeNameCache.get(nodeId)!;
        let name = `#${nodeId}`;
        try {
          const raw = editor.engine.get_node_json(BigInt(nodeId));
          if (raw) {
            const node = JSON.parse(raw);
            const n = String(node?.name || "").trim();
            if (n) name = n;
          }
        } catch {}
        nodeNameCache.set(nodeId, name);
        return name;
      };

      for (const nodeId of subtree) {
        let binds: any[] = [];
        try { binds = JSON.parse(editor.engine.get_bindings(BigInt(nodeId)) || "[]") || []; } catch {}
        for (const b of binds) {
          const colId = Number(b?.collection_id || 0);
          const varId = Number(b?.variable_id || 0);
          if (colId <= 0 || varId <= 0) continue;
          const col = collections.find((c: any) => Number(c?.id) === colId);
          const v = col?.variables?.find((it: any) => Number(it?.id) === varId);
          const modeId = Number(col?.active_mode_id || 0);
          const mode = col?.modes?.find((m: any) => Number(m?.id) === modeId);
          const value = (v?.values && modeId > 0) ? v.values[String(modeId)] ?? v.values[modeId] : undefined;
          const prop = String(b?.property || "?");
          const source = `${getNodeName(nodeId)} (#${nodeId}) · ${prop}`;
          const key = `${colId}:${varId}`;
          const prev = byKey.get(key);
          const nextSources = prev?.sources ? [...prev.sources] : [];
          if (!nextSources.includes(source) && nextSources.length < 6) nextSources.push(source);
          byKey.set(key, {
            collectionName: String(col?.name || `Collection ${colId}`),
            variableName: String(v?.name || `Variable ${varId}`),
            modeName: String(mode?.name || "Default"),
            value: JSON.stringify(value ?? null),
            count: (prev?.count || 0) + 1,
            sources: nextSources,
          });
        }
      }

      const rows = Array.from(byKey.values()).sort((a, b) => b.count - a.count || a.variableName.localeCompare(b.variableName));
      if (rows.length === 0) {
        const empty = document.createElement("div");
        empty.style.cssText = "font-size:11px;color:#94a3b8;";
        empty.textContent = "No variable bindings in this frame subtree.";
        varsPanel.appendChild(empty);
      } else {
        rows.slice(0, 18).forEach((r) => {
          const row = document.createElement("div");
          row.style.cssText = "padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.06);";
          const sourcePreview = r.sources.slice(0, 2).map((s) => `<div>• ${s}</div>`).join("");
          const sourceMore = r.sources.length > 2 ? `<div style=\"opacity:0.7;\">+${r.sources.length - 2} more source(s)</div>` : "";
          row.innerHTML = `<div style=\"color:#fde68a;font-weight:600;\">${r.collectionName} / ${r.variableName}</div><div style=\"display:flex;justify-content:space-between;gap:8px;color:#cbd5e1;\"><span>${r.modeName}</span><span style=\"color:#86efac;font-family:ui-monospace,Menlo,monospace;\">${r.value}</span></div><div style=\"font-size:10px;color:#94a3b8;\">used by ${r.count} binding(s)</div><div style=\"font-size:10px;color:#93c5fd;margin-top:2px;line-height:1.25;\">${sourcePreview}${sourceMore}</div>`;
          varsPanel.appendChild(row);
        });
        if (rows.length > 18) {
          const more = document.createElement("div");
          more.style.cssText = "padding-top:4px;font-size:10px;color:#94a3b8;";
          more.textContent = `+${rows.length - 18} more`;
          varsPanel.appendChild(more);
        }
      }
    }

    if (protoVars.size === 0 && currentFrameId === null) {
      varsPanel.style.display = "none";
      return;
    }
    varsPanel.style.display = "";
  }

  function recordEvent(partial: Omit<RecordedProtoEvent, "t">) {
    if (!recorderEnabled) return;
    recorderEvents.push({ t: Math.max(0, performance.now() - recorderStartedAt), ...partial });
  }

  function buildInteractionDraft() {
    type DraftInteraction = {
      sourceFrameId: number;
      sourceNodeId: number;
      targetFrameId: number;
      trigger: string;
      action: string;
      count: number;
      inferredFrom?: "navigate" | "click+navigate";
    };

    const dedup = new Map<string, DraftInteraction>();
    const clickHistory = recorderEvents.filter((e) => e.kind === "click");

    for (let i = 0; i < recorderEvents.length; i += 1) {
      const ev = recorderEvents[i];
      if (ev.kind !== "navigate" || !ev.toFrameId || !ev.frameId) continue;
      const action = String(ev.action || "NavigateTo");
      if (action !== "NavigateTo") continue;

      let sourceNodeId = Number(ev.nodeId || 0);
      let inferredFrom: "navigate" | "click+navigate" = "navigate";
      if (!sourceNodeId) {
        const recentClick = [...clickHistory]
          .reverse()
          .find((c) => c.frameId === ev.frameId && c.nodeId && c.t <= ev.t && ev.t - c.t <= 1200);
        if (recentClick?.nodeId) {
          sourceNodeId = Number(recentClick.nodeId);
          inferredFrom = "click+navigate";
        }
      }

      if (!sourceNodeId) continue;

      const key = `${ev.frameId}:${sourceNodeId}:${ev.toFrameId}:${action}`;
      const prev = dedup.get(key);
      if (prev) prev.count += 1;
      else dedup.set(key, {
        sourceFrameId: Number(ev.frameId),
        sourceNodeId,
        targetFrameId: Number(ev.toFrameId),
        trigger: "OnClick",
        action,
        count: 1,
        inferredFrom,
      });
    }

    const inputEvents = recorderEvents.filter((e) => e.kind === "input");
    const scrollEvents = recorderEvents.filter((e) => e.kind === "scroll");
    const navEvents = recorderEvents.filter((e) => e.kind === "navigate");

    return {
      version: 2,
      generatedAt: new Date().toISOString(),
      session: {
        totalEvents: recorderEvents.length,
        navigateEvents: navEvents.length,
        scrollEvents: scrollEvents.length,
        inputEvents: inputEvents.length,
      },
      interactions: Array.from(dedup.values()),
      scenarios: [
        {
          id: "recorded-session",
          name: "Recorded session",
          steps: recorderEvents.map((e) => ({
            t: Number(e.t.toFixed(1)),
            kind: e.kind,
            frameId: e.frameId,
            nodeId: e.nodeId,
            toFrameId: e.toFrameId,
            action: e.action,
            dx: e.dx,
            dy: e.dy,
            key: e.key,
            text: e.text,
            inputType: e.inputType,
          })),
        },
      ],
      timeline: recorderEvents,
    };
  }

  function applyInteractionDraftToDocument() {
    const draft = buildInteractionDraft();
    const interactions = Array.isArray((draft as any).interactions) ? (draft as any).interactions : [];
    let applied = 0;
    for (const item of interactions) {
      const sourceNodeId = Number(item.sourceNodeId || 0);
      const targetFrameId = Number(item.targetFrameId || 0);
      if (sourceNodeId <= 0 || targetFrameId <= 0) continue;
      editor.engine.add_interaction(
        BigInt(sourceNodeId),
        "click",
        "navigate-to",
        BigInt(targetFrameId),
        BigInt(0),
        "instant",
        300,
        "ease_in_out"
      );
      applied += 1;
    }
    if (applied > 0) {
      editor.pushHistory(`Apply prototype recorder draft (${applied})`);
      editor.requestRender();
    }
    return { applied, total: interactions.length };
  }

  function isFrameNode(node: any): boolean {
    if (!node) return false;
    if (typeof node.kind === "string") return node.kind.toLowerCase() === "frame";
    if (typeof node.kind === "object" && node.kind) return !!(node.kind as any).Frame;
    return false;
  }

  function listPrototypeFlows(): Array<{ id: number; name: string; start_frame_id: number; page_id: number }> {
    try {
      const rows = JSON.parse(editor.engine.get_prototype_flows() || "[]");
      if (!Array.isArray(rows)) return [];
      return rows.map((r: any) => ({
        id: Number(r?.id || 0),
        name: String(r?.name || `Flow ${r?.id || ""}`),
        start_frame_id: Number(r?.start_frame_id || 0),
        page_id: Number(r?.page_id || 0),
      })).filter((f: any) => f.id > 0);
    } catch {
      return [];
    }
  }

  function listFramesForPage(pageId: number): Array<{ id: number; name: string }> {
    try {
      const layers = JSON.parse(editor.engine.get_layer_list() || "[]");
      if (!Array.isArray(layers)) return [];
      return layers
        .filter((l: any) => Number(l?.page_id || 0) === pageId && String(l?.kind || "") === "Frame")
        .map((l: any) => ({ id: Number(l.id || 0), name: String(l.name || `Frame ${l.id}`) }));
    } catch {
      return [];
    }
  }

  function renderFlowStartManager() {
    if (!flowStartWrap || !flowStartFlowSel || !flowStartFrameSel || !flowStartInfo) return;
    const flows = listPrototypeFlows();
    const prevFlow = Number(flowStartFlowSel.value || 0);
    const selectedFlowId = flows.some((f) => f.id === prevFlow) ? prevFlow : Number(flows[0]?.id || 0);

    flowStartFlowSel.innerHTML = "";
    for (const flow of flows) {
      const opt = document.createElement("option");
      opt.value = String(flow.id);
      opt.textContent = flow.name;
      flowStartFlowSel.appendChild(opt);
    }
    flowStartFlowSel.value = selectedFlowId ? String(selectedFlowId) : "";

    const selectedFlow = flows.find((f) => f.id === selectedFlowId) || null;
    const fallbackPageId = Number(editor.engine.get_active_page_id?.() || 0);
    const pageId = Number(selectedFlow?.page_id || fallbackPageId || 0);
    const frames = listFramesForPage(pageId);

    flowStartFrameSel.innerHTML = "";
    const none = document.createElement("option");
    none.value = "0";
    none.textContent = "— None —";
    flowStartFrameSel.appendChild(none);
    for (const frame of frames) {
      const opt = document.createElement("option");
      opt.value = String(frame.id);
      opt.textContent = frame.name;
      flowStartFrameSel.appendChild(opt);
    }
    if (selectedFlow) flowStartFrameSel.value = String(selectedFlow.start_frame_id || 0);

    if (!selectedFlow) {
      flowStartInfo.textContent = "No flows yet. Add a flow in Prototype settings.";
    } else {
      const frameName = frames.find((f) => f.id === selectedFlow.start_frame_id)?.name || "None";
      flowStartInfo.textContent = `Flow #${selectedFlow.id} · Page #${pageId} · Start: ${frameName}`;
    }

    const presetList = flowStartWrap.querySelector('[data-role="flow-entry-presets"]') as HTMLDivElement | null;
    if (presetList) {
      presetList.innerHTML = "";
      const presets = loadFlowEntryPresets();
      const flowPresets = Array.isArray(presets[String(selectedFlowId)]) ? presets[String(selectedFlowId)] : [];
      if (flowPresets.length === 0) {
        const empty = document.createElement("div");
        empty.style.cssText = "font-size:9px;color:#64748b;";
        empty.textContent = "No presets yet";
        presetList.appendChild(empty);
      } else {
        for (const preset of flowPresets.slice(0, 6)) {
          const btn = document.createElement("button");
          btn.className = "prop-btn";
          btn.style.cssText = "font-size:9px;padding:2px 6px;";
          btn.textContent = preset.label;
          btn.title = `Use preset frame #${preset.frameId}`;
          btn.onclick = () => {
            if (!flowStartFrameSel) return;
            flowStartFrameSel.value = String(preset.frameId);
            const flowId = Number(flowStartFlowSel?.value || 0);
            if (flowId > 0) {
              const pageIdNow = Number(editor.engine.get_active_page_id?.() || 0);
              editor.engine.set_flow_start_frame(BigInt(flowId), BigInt(preset.frameId), BigInt(pageIdNow));
            }
            currentFrameId = preset.frameId;
            renderFlowStartManager();
            renderCurrentView();
          };
          presetList.appendChild(btn);
        }
      }
    }
  }

  function renderFlowMinimap() {
    if (!flowMinimapCanvas || !flowMinimapInfo) return;
    const ctx = flowMinimapCanvas.getContext("2d");
    if (!ctx) return;

    const frames: Array<{ id: number; name: string; x: number; y: number }> = [];
    const edges: Array<{ from: number; to: number; action: string }> = [];

    try {
      const layers: any[] = JSON.parse(editor.engine.get_layer_list() || "[]") || [];
      for (const layer of layers) {
        const id = Number(layer?.id || 0);
        if (id <= 0) continue;
        const raw = editor.engine.get_node_json(BigInt(id));
        if (!raw) continue;
        const node = JSON.parse(raw);
        if (!isFrameNode(node)) continue;
        frames.push({ id, name: String(node?.name || `Frame ${id}`), x: Number(node?.x || 0), y: Number(node?.y || 0) });
      }
    } catch {}

    const frameIds = new Set(frames.map((f) => f.id));
    try {
      const allInter: any[] = JSON.parse(editor.engine.get_all_interactions() || "[]") || [];
      for (const row of allInter) {
        const from = Number(row?.id || 0);
        if (!frameIds.has(from)) continue;
        const interactions: any[] = Array.isArray(row?.interactions) ? row.interactions : [];
        for (const inter of interactions) {
          const action = String(inter?.action || "");
          const target = Number(inter?.target_node_id || 0);
          if ((action === "NavigateTo" || action === "OpenOverlay") && frameIds.has(target) && target > 0) {
            edges.push({ from, to: target, action });
          }
        }
      }
    } catch {}

    const W = flowMinimapCanvas.width;
    const H = flowMinimapCanvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, W, H);

    if (frames.length === 0) {
      flowMinimapInfo.textContent = "No frames on this page";
      flowMinimapSnapshot = { nodes: [], edges: [], nodeHits: [], edgeHits: [] };
      return;
    }

    const minX = Math.min(...frames.map((f) => f.x));
    const maxX = Math.max(...frames.map((f) => f.x));
    const minY = Math.min(...frames.map((f) => f.y));
    const maxY = Math.max(...frames.map((f) => f.y));
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const pad = 14;

    const toPt = (f: { x: number; y: number }) => ({
      x: pad + ((f.x - minX) / spanX) * Math.max(1, W - pad * 2),
      y: pad + ((f.y - minY) / spanY) * Math.max(1, H - pad * 2),
    });

    const pos = new Map<number, { x: number; y: number }>();
    for (const f of frames) pos.set(f.id, toPt(f));

    const nodeHits: Array<{ id: number; x: number; y: number; r: number }> = [];
    const edgeHits: Array<{ from: number; to: number; x: number; y: number }> = [];

    ctx.save();
    ctx.strokeStyle = "rgba(100,116,139,0.7)";
    ctx.lineWidth = 1;
    for (const e of edges) {
      const a = pos.get(e.from);
      const b = pos.get(e.to);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      const mx = (a.x + b.x) * 0.5;
      const my = (a.y + b.y) * 0.5;
      edgeHits.push({ from: e.from, to: e.to, x: mx, y: my });
      ctx.fillStyle = "rgba(148,163,184,0.9)";
      ctx.font = "9px sans-serif";
      ctx.fillText("→", mx + 2, my - 2);
    }
    ctx.restore();

    for (const f of frames) {
      const p = pos.get(f.id);
      if (!p) continue;
      const isCurrent = currentFrameId === f.id;
      const r = isCurrent ? 6 : 4.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isCurrent ? "#22d3ee" : "#a78bfa";
      ctx.fill();
      if (isCurrent) {
        ctx.strokeStyle = "rgba(34,211,238,0.85)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      nodeHits.push({ id: f.id, x: p.x, y: p.y, r: r + 4 });
    }

    const edgeCount = edges.length;
    flowMinimapInfo.textContent = `Frames ${frames.length} · Links ${edgeCount} · Current #${currentFrameId || "-"}`;
    flowMinimapSnapshot = { nodes: frames, edges, nodeHits, edgeHits };
    renderFlowLint();
  }

  function renderFlowLint() {
    if (!flowLintInfo || !flowLintList) return;
    const snapshot = flowMinimapSnapshot;
    if (!snapshot || snapshot.nodes.length === 0) {
      flowLintInfo.textContent = "No frames to lint";
      flowLintList.innerHTML = "";
      flowLintSnapshot = { startFrameId: null, issues: [] };
      return;
    }

    const frameById = new Map(snapshot.nodes.map((n) => [n.id, n]));
    const adjacency = new Map<number, number[]>();
    for (const node of snapshot.nodes) adjacency.set(node.id, []);
    for (const edge of snapshot.edges) {
      const arr = adjacency.get(edge.from);
      if (arr && frameById.has(edge.to)) arr.push(edge.to);
    }

    const selectedStart = Number(flowStartFrameSel?.value || 0);
    const startFrameId = selectedStart > 0 && frameById.has(selectedStart)
      ? selectedStart
      : (currentFrameId && frameById.has(currentFrameId) ? currentFrameId : snapshot.nodes[0]!.id);

    const visited = new Set<number>();
    const stack = [startFrameId];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const next = adjacency.get(cur) || [];
      for (const to of next) if (!visited.has(to)) stack.push(to);
    }

    const issues: Array<{ type: "unreachable" | "dead-end" | "cycle"; frameId: number; frameName: string; detail: string }> = [];

    for (const node of snapshot.nodes) {
      const outs = adjacency.get(node.id) || [];
      if (!visited.has(node.id)) {
        issues.push({ type: "unreachable", frameId: node.id, frameName: node.name, detail: "Not reachable from current start frame" });
      } else if (outs.length === 0) {
        issues.push({ type: "dead-end", frameId: node.id, frameName: node.name, detail: "No outbound NavigateTo/OpenOverlay links" });
      }
    }

    const cycleSeen = new Set<number>();
    const cycleStack = new Set<number>();
    const cycleRoots = new Set<number>();
    const dfsCycle = (id: number) => {
      cycleSeen.add(id);
      cycleStack.add(id);
      for (const to of adjacency.get(id) || []) {
        if (!visited.has(to)) continue;
        if (!cycleSeen.has(to)) dfsCycle(to);
        else if (cycleStack.has(to)) cycleRoots.add(to);
      }
      cycleStack.delete(id);
    };
    if (visited.has(startFrameId)) dfsCycle(startFrameId);
    for (const cycleId of cycleRoots) {
      const n = frameById.get(cycleId);
      if (!n) continue;
      issues.push({ type: "cycle", frameId: cycleId, frameName: n.name, detail: "Cycle detected in reachable flow graph" });
    }

    flowLintSnapshot = { startFrameId, issues };

    const deadEndCount = issues.filter((i) => i.type === "dead-end").length;
    const unreachableCount = issues.filter((i) => i.type === "unreachable").length;
    const cycleCount = issues.filter((i) => i.type === "cycle").length;
    flowLintInfo.textContent = `Start #${startFrameId} · Dead-end ${deadEndCount} · Unreachable ${unreachableCount} · Cycles ${cycleCount}`;

    flowLintList.innerHTML = "";
    if (issues.length === 0) {
      const ok = document.createElement("div");
      ok.style.cssText = "font-size:10px;color:#86efac;";
      ok.textContent = "No issues found.";
      flowLintList.appendChild(ok);
      return;
    }

    for (const issue of issues.slice(0, 14)) {
      const row = document.createElement("button");
      const color = issue.type === "dead-end" ? "#fca5a5" : issue.type === "unreachable" ? "#fbbf24" : "#c4b5fd";
      row.style.cssText = `display:flex;flex-direction:column;align-items:flex-start;gap:1px;width:100%;text-align:left;background:rgba(15,23,42,0.55);border:1px solid rgba(148,163,184,0.25);border-left:3px solid ${color};border-radius:6px;color:#e2e8f0;padding:4px 6px;cursor:pointer;`;
      row.innerHTML = `<span style="font-size:10px;font-weight:600;color:${color};text-transform:uppercase;">${issue.type}</span><span style="font-size:10px;">${issue.frameName} (#${issue.frameId})</span><span style="font-size:9px;color:#94a3b8;">${issue.detail}</span>`;
      row.onclick = () => navigateTo(issue.frameId, "Instant", 0, "linear");
      flowLintList.appendChild(row);
    }

    if (issues.length > 14) {
      const more = document.createElement("div");
      more.style.cssText = "font-size:9px;color:#94a3b8;";
      more.textContent = `+ ${issues.length - 14} more issues`;
      flowLintList.appendChild(more);
    }
  }

  function onFlowMinimapClick(e: MouseEvent) {
    if (!flowMinimapCanvas || !flowMinimapSnapshot) return;
    const rect = flowMinimapCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for (const hit of flowMinimapSnapshot.nodeHits) {
      const dx = x - hit.x;
      const dy = y - hit.y;
      if (dx * dx + dy * dy <= hit.r * hit.r) {
        navigateTo(hit.id, "Instant", 0, "linear");
        return;
      }
    }

    let best: { from: number; to: number; d2: number } | null = null;
    for (const hit of flowMinimapSnapshot.edgeHits) {
      const dx = x - hit.x;
      const dy = y - hit.y;
      const d2 = dx * dx + dy * dy;
      if (!best || d2 < best.d2) best = { from: hit.from, to: hit.to, d2 };
    }
    if (best && best.d2 < 196) {
      navigateTo(best.to, "Instant", 0, "linear");
    }
  }

  function show(startFrameId?: number) {
    if (active) return;
    active = true;
    navigationStack = [];

    overlay = document.createElement("div");
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:10000;
      background:#1a1a2e;display:flex;flex-direction:column;
      align-items:center;justify-content:center;
    `;

    // Top bar
    const topBar = document.createElement("div");
    topBar.style.cssText = `
      position:absolute;top:0;left:0;right:0;height:40px;
      background:#16213e;display:flex;align-items:center;
      padding:0 12px;gap:8px;z-index:1;
    `;

    const backBtn = document.createElement("button");
    backBtn.style.cssText = "background:#0f3460;color:#e0e0e0;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:12px;";
    backBtn.textContent = "← Back";
    backBtn.addEventListener("click", navigateBack);
    topBar.appendChild(backBtn);

    const title = document.createElement("span");
    title.style.cssText = "color:#aaa;font-size:12px;flex:1;text-align:center;";
    title.textContent = "Prototype Preview";
    title.id = "proto-title";
    topBar.appendChild(title);

    // Theme mode quick switch (Light / Dark / custom mode names)
    const themeOptions = listThemeModeOptions(editor);
    if (themeOptions.length > 0) {
      const themeWrap = document.createElement("div");
      themeWrap.style.cssText = "display:flex;align-items:center;gap:6px;";
      const themeLabel = document.createElement("span");
      themeLabel.style.cssText = "font-size:11px;color:#94a3b8;";
      themeLabel.textContent = "Theme";
      const themeSel = document.createElement("select");
      themeSel.style.cssText = "background:#0f3460;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:5px 8px;font-size:12px;";
      const activeTheme = detectActiveThemeMode(editor);
      for (const opt of themeOptions) {
        const o = document.createElement("option");
        o.value = opt.id;
        o.textContent = opt.label;
        if (opt.id === activeTheme) o.selected = true;
        themeSel.appendChild(o);
      }
      themeSel.addEventListener("change", () => {
        applyThemeMode(editor, themeSel.value);
        renderCurrentView();
      });
      offThemeSync = onThemeModeChanged(() => {
        const activeThemeNow = detectActiveThemeMode(editor);
        if (activeThemeNow && themeSel.value !== activeThemeNow) {
          themeSel.value = activeThemeNow;
        }
      });
      themeWrap.appendChild(themeLabel);
      themeWrap.appendChild(themeSel);
      topBar.appendChild(themeWrap);
    }

    const deviceWrap = document.createElement("div");
    deviceWrap.style.cssText = "display:flex;align-items:center;gap:6px;";
    const deviceLabel = document.createElement("span");
    deviceLabel.style.cssText = "font-size:11px;color:#94a3b8;";
    deviceLabel.textContent = "Device";
    const deviceSel = document.createElement("select");
    deviceSel.style.cssText = "background:#0f3460;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:5px 8px;font-size:12px;";
    for (const preset of DEVICE_PRESETS) {
      const opt = document.createElement("option");
      opt.value = preset.id;
      opt.textContent = preset.label;
      if (preset.id === selectedDeviceId) opt.selected = true;
      deviceSel.appendChild(opt);
    }
    deviceSel.addEventListener("change", () => {
      selectedDeviceId = deviceSel.value;
      renderCurrentView();
    });
    deviceWrap.appendChild(deviceLabel);
    deviceWrap.appendChild(deviceSel);

    const orientationSel = document.createElement("select");
    orientationSel.style.cssText = "background:#0f3460;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:5px 8px;font-size:12px;";
    orientationSel.innerHTML = `<option value="portrait">Portrait</option><option value="landscape">Landscape</option>`;
    orientationSel.value = deviceOrientation;
    orientationSel.addEventListener("change", () => {
      deviceOrientation = orientationSel.value === "landscape" ? "landscape" : "portrait";
      renderCurrentView();
    });
    deviceWrap.appendChild(orientationSel);

    const safeAreaLabel = document.createElement("label");
    safeAreaLabel.style.cssText = "display:flex;align-items:center;gap:4px;color:#94a3b8;font-size:11px;";
    const safeAreaCheck = document.createElement("input");
    safeAreaCheck.type = "checkbox";
    safeAreaCheck.checked = showSafeAreaOverlay;
    safeAreaCheck.addEventListener("change", () => {
      showSafeAreaOverlay = safeAreaCheck.checked;
      renderCurrentView();
    });
    safeAreaLabel.appendChild(safeAreaCheck);
    safeAreaLabel.appendChild(document.createTextNode("Safe"));
    deviceWrap.appendChild(safeAreaLabel);

    const barsLabel = document.createElement("label");
    barsLabel.style.cssText = "display:flex;align-items:center;gap:4px;color:#94a3b8;font-size:11px;";
    const barsCheck = document.createElement("input");
    barsCheck.type = "checkbox";
    barsCheck.checked = showScrollbarOverlay;
    barsCheck.addEventListener("change", () => {
      showScrollbarOverlay = barsCheck.checked;
      renderCurrentView();
    });
    barsLabel.appendChild(barsCheck);
    barsLabel.appendChild(document.createTextNode("Bars"));
    deviceWrap.appendChild(barsLabel);

    topBar.appendChild(deviceWrap);

    const physicsWrap = document.createElement("div");
    physicsWrap.style.cssText = "display:flex;align-items:center;gap:6px;";
    const physicsLabel = document.createElement("span");
    physicsLabel.style.cssText = "font-size:11px;color:#94a3b8;";
    physicsLabel.textContent = "Scroll";
    const physicsSel = document.createElement("select");
    physicsSel.style.cssText = "background:#0f3460;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:5px 8px;font-size:12px;";
    for (const preset of SCROLL_PHYSICS_PRESETS) {
      const opt = document.createElement("option");
      opt.value = preset.id;
      opt.textContent = preset.label;
      if (preset.id === selectedScrollPhysicsId) opt.selected = true;
      physicsSel.appendChild(opt);
    }
    physicsSel.addEventListener("change", () => {
      selectedScrollPhysicsId = physicsSel.value;
    });
    physicsWrap.appendChild(physicsLabel);
    physicsWrap.appendChild(physicsSel);
    topBar.appendChild(physicsWrap);

    const recBtn = document.createElement("button");
    recBtn.style.cssText = "background:#334155;color:#e2e8f0;border:none;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:12px;";
    recBtn.textContent = "⏺ Record";
    recBtn.addEventListener("click", () => {
      recorderEnabled = !recorderEnabled;
      if (recorderEnabled) {
        recorderEvents = [];
        recorderStartedAt = performance.now();
        recBtn.textContent = "⏹ Stop";
        recBtn.style.background = "#dc2626";
      } else {
        recBtn.textContent = `⏺ Record (${recorderEvents.length})`;
        recBtn.style.background = "#334155";
      }
    });
    topBar.appendChild(recBtn);

    const draftBtn = document.createElement("button");
    draftBtn.style.cssText = "background:#0f766e;color:#ecfeff;border:none;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:12px;";
    draftBtn.textContent = "Draft JSON";
    draftBtn.addEventListener("click", async () => {
      const payload = JSON.stringify(buildInteractionDraft(), null, 2);
      try {
        await navigator.clipboard.writeText(payload);
        draftBtn.textContent = "✓ Copied";
        setTimeout(() => { draftBtn.textContent = "Draft JSON"; }, 1200);
      } catch {
        alert(payload);
      }
    });
    topBar.appendChild(draftBtn);

    const applyDraftBtn = document.createElement("button");
    applyDraftBtn.style.cssText = "background:#7c3aed;color:#f3e8ff;border:none;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:12px;";
    applyDraftBtn.textContent = "Apply Draft";
    applyDraftBtn.addEventListener("click", () => {
      const result = applyInteractionDraftToDocument();
      if (result.applied > 0) {
        applyDraftBtn.textContent = `✓ Applied ${result.applied}`;
      } else {
        applyDraftBtn.textContent = "No targets";
      }
      setTimeout(() => { applyDraftBtn.textContent = "Apply Draft"; }, 1200);
    });
    topBar.appendChild(applyDraftBtn);

    const shareBtn = document.createElement("button");
    shareBtn.style.cssText = "background:#4338ca;color:#eef2ff;border:none;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:12px;";
    shareBtn.textContent = "Share Link";
    shareBtn.addEventListener("click", async () => {
      const url = buildShareUrl();
      try {
        await navigator.clipboard.writeText(url);
        shareBtn.textContent = "✓ Copied";
      } catch {
        prompt("Copy prototype share link", url);
        shareBtn.textContent = "Shown";
      }
      setTimeout(() => { shareBtn.textContent = "Share Link"; }, 1400);
    });
    topBar.appendChild(shareBtn);

    const varsOverlayBtn = document.createElement("button");
    varsOverlayBtn.style.cssText = "background:#22314f;color:#c7d2fe;border:1px solid #3b82f6;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:11px;";
    const syncVarsOverlayBtn = () => {
      varsOverlayBtn.textContent = showVarsOverlay ? "Vars Overlay: ON" : "Vars Overlay: OFF";
    };
    syncVarsOverlayBtn();
    varsOverlayBtn.addEventListener("click", () => {
      showVarsOverlay = !showVarsOverlay;
      syncVarsOverlayBtn();
      renderVarsPanel();
    });
    topBar.appendChild(varsOverlayBtn);

    const closeBtn = document.createElement("button");
    closeBtn.style.cssText = "background:#e94560;color:white;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:12px;";
    closeBtn.textContent = "Close (Esc)";
    closeBtn.addEventListener("click", hide);
    topBar.appendChild(closeBtn);

    overlay.appendChild(topBar);

    viewCanvas = document.createElement("canvas");
    viewCanvas.style.cssText = "margin-top:40px;cursor:pointer;";
    overlay.appendChild(viewCanvas);

    snapPaginationEl = document.createElement("div");
    snapPaginationEl.style.cssText = "position:absolute;right:14px;top:52px;display:none;flex-direction:column;gap:6px;z-index:3;pointer-events:none;";
    overlay.appendChild(snapPaginationEl);

    flowMinimapWrap = document.createElement("div");
    flowMinimapWrap.style.cssText = "position:absolute;left:14px;top:52px;width:220px;background:rgba(15,23,42,0.92);border:1px solid rgba(148,163,184,0.3);border-radius:10px;padding:8px;z-index:4;";
    const flowHead = document.createElement("div");
    flowHead.style.cssText = "font-size:11px;font-weight:600;color:#cbd5e1;margin-bottom:6px;";
    flowHead.textContent = "Flow Minimap";
    flowMinimapWrap.appendChild(flowHead);
    flowMinimapCanvas = document.createElement("canvas");
    flowMinimapCanvas.width = 204;
    flowMinimapCanvas.height = 132;
    flowMinimapCanvas.style.cssText = "width:204px;height:132px;background:#0b1220;border-radius:6px;cursor:pointer;display:block;";
    flowMinimapCanvas.addEventListener("click", onFlowMinimapClick);
    flowMinimapWrap.appendChild(flowMinimapCanvas);
    flowMinimapInfo = document.createElement("div");
    flowMinimapInfo.style.cssText = "margin-top:6px;font-size:10px;color:#94a3b8;line-height:1.3;";
    flowMinimapInfo.textContent = "Collecting flow graph…";
    flowMinimapWrap.appendChild(flowMinimapInfo);
    overlay.appendChild(flowMinimapWrap);

    flowStartWrap = document.createElement("div");
    flowStartWrap.style.cssText = "position:absolute;left:14px;top:206px;width:220px;background:rgba(15,23,42,0.92);border:1px solid rgba(148,163,184,0.3);border-radius:10px;padding:8px;z-index:4;display:flex;flex-direction:column;gap:6px;";
    const flowStartHead = document.createElement("div");
    flowStartHead.style.cssText = "font-size:11px;font-weight:600;color:#cbd5e1;";
    flowStartHead.textContent = "Start Point Manager";
    flowStartWrap.appendChild(flowStartHead);

    flowStartFlowSel = document.createElement("select");
    flowStartFlowSel.style.cssText = "background:#0f3460;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:4px 6px;font-size:11px;";
    flowStartWrap.appendChild(flowStartFlowSel);

    flowStartFrameSel = document.createElement("select");
    flowStartFrameSel.style.cssText = "background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:4px 6px;font-size:11px;";
    flowStartWrap.appendChild(flowStartFrameSel);

    const flowBtnRow = document.createElement("div");
    flowBtnRow.style.cssText = "display:flex;gap:6px;";
    const useCurrentBtn = document.createElement("button");
    useCurrentBtn.className = "prop-btn";
    useCurrentBtn.textContent = "Use current";
    useCurrentBtn.style.cssText = "flex:1;font-size:10px;padding:3px 6px;";
    useCurrentBtn.onclick = () => {
      if (!flowStartFrameSel || !currentFrameId) return;
      flowStartFrameSel.value = String(currentFrameId);
    };
    const saveStartBtn = document.createElement("button");
    saveStartBtn.className = "prop-btn";
    saveStartBtn.textContent = "Save";
    saveStartBtn.style.cssText = "flex:1;font-size:10px;padding:3px 6px;";
    saveStartBtn.onclick = () => {
      if (!flowStartFlowSel || !flowStartFrameSel) return;
      const flowId = Number(flowStartFlowSel.value || 0);
      if (!flowId) return;
      const frameId = Number(flowStartFrameSel.value || 0);
      const pageId = Number(editor.engine.get_active_page_id?.() || 0);
      editor.engine.set_flow_start_frame(BigInt(flowId), BigInt(frameId), BigInt(pageId));
      renderFlowStartManager();
      renderFlowLint();
      if (frameId > 0) {
        currentFrameId = frameId;
        renderCurrentView();
      }
    };
    flowBtnRow.appendChild(useCurrentBtn);
    flowBtnRow.appendChild(saveStartBtn);
    flowStartWrap.appendChild(flowBtnRow);

    const jumpBtn = document.createElement("button");
    jumpBtn.className = "prop-btn";
    jumpBtn.textContent = "Run selected flow";
    jumpBtn.style.cssText = "font-size:10px;padding:4px 6px;";
    jumpBtn.onclick = () => {
      const frameId = Number(flowStartFrameSel?.value || 0);
      if (frameId > 0) {
        currentFrameId = frameId;
        navigationStack = [];
        renderCurrentView();
        renderFlowLint();
      }
    };
    flowStartWrap.appendChild(jumpBtn);

    flowStartInfo = document.createElement("div");
    flowStartInfo.style.cssText = "font-size:10px;color:#94a3b8;line-height:1.35;";
    flowStartWrap.appendChild(flowStartInfo);

    const presetBtnRow = document.createElement("div");
    presetBtnRow.style.cssText = "display:flex;gap:6px;";
    const savePresetBtn = document.createElement("button");
    savePresetBtn.className = "prop-btn";
    savePresetBtn.textContent = "Save preset";
    savePresetBtn.style.cssText = "flex:1;font-size:10px;padding:3px 6px;";
    savePresetBtn.onclick = () => {
      const flowId = Number(flowStartFlowSel?.value || 0);
      const frameId = Number(flowStartFrameSel?.value || 0);
      if (!flowId || !frameId) return;
      const frameName = (flowStartFrameSel?.selectedOptions?.[0]?.textContent || `Frame #${frameId}`).trim();
      const presets = loadFlowEntryPresets();
      const key = String(flowId);
      const list = Array.isArray(presets[key]) ? presets[key] : [];
      const next = [{ frameId, label: frameName }, ...list.filter((p) => p.frameId !== frameId)].slice(0, 6);
      presets[key] = next;
      saveFlowEntryPresets(presets);
      renderFlowStartManager();
    };
    presetBtnRow.appendChild(savePresetBtn);
    flowStartWrap.appendChild(presetBtnRow);

    const presetList = document.createElement("div");
    presetList.dataset.role = "flow-entry-presets";
    presetList.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;";
    flowStartWrap.appendChild(presetList);

    flowStartFlowSel.addEventListener("change", () => {
      renderFlowStartManager();
      renderFlowLint();
    });
    flowStartFrameSel.addEventListener("change", () => {
      if (!flowStartInfo) return;
      const frameId = Number(flowStartFrameSel?.value || 0);
      flowStartInfo.textContent = frameId > 0 ? `Pending start frame #${frameId}` : "Start frame cleared (None)";
      renderFlowLint();
    });

    overlay.appendChild(flowStartWrap);

    flowLintWrap = document.createElement("div");
    flowLintWrap.style.cssText = "position:absolute;left:14px;top:388px;width:220px;max-height:240px;overflow:auto;background:rgba(15,23,42,0.92);border:1px solid rgba(148,163,184,0.3);border-radius:10px;padding:8px;z-index:4;display:flex;flex-direction:column;gap:6px;";
    const flowLintHead = document.createElement("div");
    flowLintHead.style.cssText = "font-size:11px;font-weight:600;color:#cbd5e1;";
    flowLintHead.textContent = "Flow Lint";
    flowLintWrap.appendChild(flowLintHead);
    flowLintInfo = document.createElement("div");
    flowLintInfo.style.cssText = "font-size:10px;color:#94a3b8;line-height:1.35;";
    flowLintInfo.textContent = "Analyzing flow graph…";
    flowLintWrap.appendChild(flowLintInfo);
    flowLintList = document.createElement("div");
    flowLintList.style.cssText = "display:flex;flex-direction:column;gap:4px;";
    flowLintWrap.appendChild(flowLintList);
    overlay.appendChild(flowLintWrap);

    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("paste", onPaste);
    window.addEventListener(INTERACTIVE_PREVIEW_EVENT, onInteractivePreviewEvent as EventListener);

    // Pick starting frame
    if (startFrameId) {
      currentFrameId = startFrameId;
    } else {
      const selArr = editor.engine.get_selection();
      const selIds = Array.from(selArr).map(Number);
      currentFrameId = selIds.length > 0 ? selIds[0] : null;
    }

    // Initialize prototype variables
    initProtoVars();

    // Restore from share link (if present)
    const shared = parseShareStateFromUrl();
    if (shared) applyShareState(shared);

    // Initialize event runtime for JS callbacks
    eventRuntime = new EventRuntime(editor);
    eventRuntime.setNavigateCallback((pageId: number) => {
      editor.engine.set_active_page(BigInt(pageId));
      renderCurrentView();
    });

    // Build variables debug panel
    buildVarsPanel();
    renderFlowStartManager();

    renderCurrentView();
    startMotionPathPlayback();
    viewCanvas.addEventListener("click", onCanvasClick);
    viewCanvas.addEventListener("mousemove", onCanvasMouseMove);
    viewCanvas.addEventListener("mousedown", onCanvasMouseDown);
    viewCanvas.addEventListener("mouseup", onCanvasMouseUp);
    viewCanvas.addEventListener("dblclick", onCanvasDblClick);
    viewCanvas.addEventListener("touchstart", onTouchStart, { passive: false });
    viewCanvas.addEventListener("touchmove", onTouchMove, { passive: false });
    viewCanvas.addEventListener("touchend", onTouchEnd, { passive: false });
    viewCanvas.addEventListener("wheel", onWheel, { passive: false });
  }

  let motionPathAnimId: number | null = null;

  function startMotionPathPlayback() {
    // Find animation clips with motion path tracks and play them
    try {
      const clipsJson = editor.engine.anim_get_clips();
      const clips: { id: number; name: string }[] = JSON.parse(clipsJson || "[]");
      if (clips.length === 0) return;

      const startTime = performance.now();

      function animateMotionPaths() {
        if (!active) return;
        const elapsed = performance.now() - startTime;
        for (const clip of clips) {
          editor.engine.anim_apply(BigInt(clip.id), Math.round(elapsed));
        }
        renderCurrentView();
        motionPathAnimId = requestAnimationFrame(animateMotionPaths);
      }
      motionPathAnimId = requestAnimationFrame(animateMotionPaths);
    } catch {
      // No animation support or no clips
    }
  }

  function stopMotionPathPlayback() {
    if (motionPathAnimId !== null) {
      cancelAnimationFrame(motionPathAnimId);
      motionPathAnimId = null;
    }
  }

  function hide() {
    if (!active || !overlay) return;
    active = false;
    transitioning = false;
    clearVideoOverlays();
    stopMotionPathPlayback();
    stopInertia();
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("paste", onPaste);
    window.removeEventListener(INTERACTIVE_PREVIEW_EVENT, onInteractivePreviewEvent as EventListener);
    overlay.remove();
    overlay = null;
    viewCanvas = null;
    snapPaginationEl = null;
    snapPaginationState = null;
    flowMinimapSnapshot = null;
    flowMinimapCanvas = null;
    flowMinimapInfo = null;
    flowMinimapWrap = null;
    flowStartWrap = null;
    flowStartFlowSel = null;
    flowStartFrameSel = null;
    flowStartInfo = null;
    flowLintWrap = null;
    flowLintInfo = null;
    flowLintList = null;
    flowLintSnapshot = null;
    if (offThemeSync) {
      offThemeSync();
      offThemeSync = null;
    }
    currentFrameId = null;
    navigationStack = [];
    focusedHotspotNodeId = null;
    focusedHotspotInter = null;
    focusedInteractiveInstanceId = null;
    interactiveVisualState.clear();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (transitioning) return;
    if (e.key === "Escape") {
      hide();
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "Backspace") {
      navigateBack();
      if (recorderEnabled) recordEvent({ kind: "input", frameId: currentFrameId, inputType: "key", key: e.key });
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      cycleFocusedHotspot(!!e.shiftKey);
      if (recorderEnabled) recordEvent({ kind: "input", frameId: currentFrameId, inputType: "key", key: e.key });
      return;
    }

    if ((e.key === "Enter" || e.key === " ") && focusedHotspotInter) {
      e.preventDefault();
      executeInteraction(focusedHotspotInter, focusedHotspotNodeId || undefined);
      if (recorderEnabled) recordEvent({ kind: "input", frameId: currentFrameId, inputType: "key", key: e.key });
      return;
    }

    if (!recorderEnabled) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key.length === 1 || e.key === "Enter" || e.key === "Tab" || e.key === "Delete") {
      recordEvent({ kind: "input", frameId: currentFrameId, inputType: "key", key: e.key, text: e.key.length === 1 ? e.key : undefined });
    }
  }

  function onPaste(e: ClipboardEvent) {
    if (!recorderEnabled) return;
    const raw = e.clipboardData?.getData("text") || "";
    if (!raw) return;
    const snippet = raw.length > 120 ? `${raw.slice(0, 117)}...` : raw;
    recordEvent({ kind: "input", frameId: currentFrameId, inputType: "paste", text: snippet });
  }

  function navigateTo(frameId: number, transition: string = "Instant", durationMs: number = 300, easing: string = "ease_in_out", timeline?: SmartTimelineKeyframe[]) {
    if (transitioning) return;
    const prevFrameId = currentFrameId;
    if (currentFrameId !== null) navigationStack.push(currentFrameId);
    currentFrameId = frameId;
    recordEvent({ kind: "navigate", frameId: prevFrameId, toFrameId: frameId, action: "NavigateTo" });

    if (transition === "Instant" || !prevFrameId) {
      renderCurrentView();
      return;
    }

    performTransition(prevFrameId, frameId, transition, durationMs, easing, timeline);
  }

  function navigateBack() {
    if (transitioning) return;
    if (navigationStack.length > 0) {
      currentFrameId = navigationStack.pop()!;
      renderCurrentView();
    }
  }

  function getFrameBounds(frameId: number): { x: number; y: number; width: number; height: number } | null {
    const json = editor.engine.get_node_json(frameId);
    if (!json) return null;
    const node = JSON.parse(json);
    return { x: node.x, y: node.y, width: node.width, height: node.height };
  }

  function getSelectedDevicePreset(): PrototypeDevicePreset {
    return DEVICE_PRESETS.find((d) => d.id === selectedDeviceId) || DEVICE_PRESETS[0];
  }

  function getSelectedScrollPhysicsPreset(): ScrollPhysicsPreset {
    return SCROLL_PHYSICS_PRESETS.find((p) => p.id === selectedScrollPhysicsId) || SCROLL_PHYSICS_PRESETS[0];
  }

  function getFrameScrollBehavior(frameId: number): { bounceX: boolean; bounceY: boolean; overscrollX: number; overscrollY: number } {
    const physics = getSelectedScrollPhysicsPreset();
    const bounceX = (editor.engine as any).get_prototype_scroll_bounce_x?.(BigInt(frameId));
    const bounceY = (editor.engine as any).get_prototype_scroll_bounce_y?.(BigInt(frameId));
    const rawOverX = Number((editor.engine as any).get_prototype_scroll_overscroll_x?.(BigInt(frameId)) ?? -1);
    const rawOverY = Number((editor.engine as any).get_prototype_scroll_overscroll_y?.(BigInt(frameId)) ?? -1);
    return {
      bounceX: typeof bounceX === "boolean" ? bounceX : true,
      bounceY: typeof bounceY === "boolean" ? bounceY : true,
      overscrollX: rawOverX >= 0 ? rawOverX : physics.overscroll,
      overscrollY: rawOverY >= 0 ? rawOverY : physics.overscroll,
    };
  }

  /** Get viewport scale + display dimensions for a frame */
  function getViewportParams(bounds: { width: number; height: number }) {
    const device = getSelectedDevicePreset();
    const maxW = window.innerWidth * 0.9;
    const maxH = (window.innerHeight - 50) * 0.9;

    const usableW = Math.max(1, maxW - device.bezel * 2);
    const usableH = Math.max(1, maxH - device.bezel * 2);

    const scale = Math.min(usableW / bounds.width, usableH / bounds.height, 2);
    return {
      scale,
      displayW: bounds.width * scale,
      displayH: bounds.height * scale,
    };
  }

  function getResolvedDeviceMetrics(displayW: number, displayH: number, dpr: number) {
    const device = getSelectedDevicePreset();
    const refW = Math.max(1, device.refWidth || displayW);
    const refH = Math.max(1, device.refHeight || displayH);
    const isLandscape = deviceOrientation === "landscape";
    const sx = (displayW / refW) * dpr;
    const sy = (displayH / refH) * dpr;

    const safeTop = Math.round((isLandscape ? device.safeLeft : device.safeTop) * sy);
    const safeRight = Math.round((isLandscape ? device.safeTop : device.safeRight) * sx);
    const safeBottom = Math.round((isLandscape ? device.safeRight : device.safeBottom) * sy);
    const safeLeft = Math.round((isLandscape ? device.safeBottom : device.safeLeft) * sx);

    const notchWRaw = (device.notchWidth || 0) * (isLandscape ? sy : sx);
    const notchHRaw = (device.notchHeight || 0) * (isLandscape ? sx : sy);
    const homeIndicatorWRaw = (device.homeIndicatorWidth || 0) * (isLandscape ? sy : sx);
    const homeIndicatorHRaw = (device.homeIndicatorHeight || 0) * (isLandscape ? sx : sy);
    const statusBarHRaw = (device.statusBarHeight || 0) * sy;

    return {
      safeTop,
      safeRight,
      safeBottom,
      safeLeft,
      notchW: Math.round(notchWRaw),
      notchH: Math.round(notchHRaw),
      homeIndicatorW: Math.round(homeIndicatorWRaw),
      homeIndicatorH: Math.round(homeIndicatorHRaw),
      statusBarH: Math.round(statusBarHRaw),
      isLandscape,
    };
  }

  function estimateScrollIndicator(frameId: number): { v?: { p: number; s: number }; h?: { p: number; s: number } } | null {
    try {
      const frameJson = editor.engine.get_node_json(frameId);
      if (!frameJson) return null;
      const frame = JSON.parse(frameJson);
      const overflow = String(frame.overflow || "").toLowerCase();
      const scrollsY = overflow.includes("scroll") && (overflow.includes("y") || overflow.includes("both") || overflow === "scroll");
      const scrollsX = overflow.includes("scroll") && (overflow.includes("x") || overflow.includes("horizontal") || overflow.includes("both") || overflow === "scroll");
      if (!scrollsX && !scrollsY) return null;
      if (!Array.isArray(frame.children) || frame.children.length === 0) return null;

      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const childId of frame.children) {
        const cj = editor.engine.get_node_json(Number(childId));
        if (!cj) continue;
        const child = JSON.parse(cj);
        if (child.visible === false) continue;
        const cx = Number(child.x) - Number(frame.x);
        const cy = Number(child.y) - Number(frame.y);
        const cw = Number(child.width) || 0;
        const ch = Number(child.height) || 0;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx + cw);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy + ch);
      }
      if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) return null;

      const viewportW = Math.max(1, Number(frame.width));
      const viewportH = Math.max(1, Number(frame.height));
      const contentW = Math.max(viewportW, maxX - minX);
      const contentH = Math.max(viewportH, maxY - minY);

      const scroll = JSON.parse(editor.engine.get_scroll_offset(BigInt(frameId)) || '{"x":0,"y":0}');
      const scrollX = Number(scroll.x) || 0;
      const scrollY = Number(scroll.y) || 0;

      const indicator: { v?: { p: number; s: number }; h?: { p: number; s: number } } = {};
      if (scrollsY && contentH > viewportH + 0.5) {
        const size = Math.max(0.12, Math.min(1, viewportH / contentH));
        const maxScroll = Math.max(1, contentH - viewportH);
        const progress = Math.max(0, Math.min(1, (-scrollY) / maxScroll));
        indicator.v = { p: progress, s: size };
      }
      if (scrollsX && contentW > viewportW + 0.5) {
        const size = Math.max(0.12, Math.min(1, viewportW / contentW));
        const maxScroll = Math.max(1, contentW - viewportW);
        const progress = Math.max(0, Math.min(1, (-scrollX) / maxScroll));
        indicator.h = { p: progress, s: size };
      }
      return indicator.v || indicator.h ? indicator : null;
    } catch {
      return null;
    }
  }

  function drawDeviceOverlay(
    ctx: CanvasRenderingContext2D,
    displayW: number,
    displayH: number,
    dpr: number,
  ) {
    const device = getSelectedDevicePreset();
    if (device.id === "none") return;

    const bezel = device.bezel * dpr;
    const radius = device.cornerRadius * dpr;
    const totalW = displayW * dpr;
    const totalH = displayH * dpr;

    ctx.save();
    ctx.strokeStyle = "rgba(15,23,42,0.95)";
    ctx.fillStyle = "rgba(2,6,23,0.82)";
    ctx.lineWidth = Math.max(2, Math.round(2 * dpr));
    const shellX = bezel / 2;
    const shellY = bezel / 2;
    const shellW = totalW - bezel;
    const shellH = totalH - bezel;
    ctx.beginPath();
    ctx.roundRect(shellX, shellY, shellW, shellH, radius);
    ctx.fill();
    ctx.stroke();

    const metrics = getResolvedDeviceMetrics(displayW, displayH, dpr);

    if (metrics.notchW > 0 && metrics.notchH > 0) {
      let nx = totalW / 2 - metrics.notchW / 2;
      let ny = bezel / 2;
      if (metrics.isLandscape) {
        nx = totalW - metrics.notchW - bezel / 2;
        ny = totalH / 2 - metrics.notchH / 2;
      }
      ctx.fillStyle = "rgba(0,0,0,0.9)";
      ctx.beginPath();
      ctx.roundRect(nx, ny, metrics.notchW, metrics.notchH, Math.max(8, 10 * dpr));
      ctx.fill();
    }

    if (metrics.statusBarH > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      if (metrics.isLandscape) {
        const sx = totalW - Math.max(metrics.safeRight, metrics.notchW + Math.round(4 * dpr));
        ctx.fillRect(sx, 0, Math.max(metrics.safeRight, metrics.notchW + Math.round(4 * dpr)), totalH);
      } else {
        ctx.fillRect(0, 0, totalW, Math.min(metrics.safeTop, metrics.statusBarH));
      }
    }

    const safeX = metrics.safeLeft;
    const safeY = metrics.safeTop;
    const safeW = totalW - metrics.safeLeft - metrics.safeRight;
    const safeH = totalH - metrics.safeTop - metrics.safeBottom;
    if (showSafeAreaOverlay && safeW > 0 && safeH > 0) {
      // Tint unsafe insets for clearer preview
      ctx.fillStyle = "rgba(56,189,248,0.09)";
      if (safeY > 0) ctx.fillRect(0, 0, totalW, safeY);
      if (metrics.safeBottom > 0) ctx.fillRect(0, totalH - metrics.safeBottom, totalW, metrics.safeBottom);
      if (safeX > 0) ctx.fillRect(0, safeY, safeX, safeH);
      if (metrics.safeRight > 0) ctx.fillRect(totalW - metrics.safeRight, safeY, metrics.safeRight, safeH);

      ctx.strokeStyle = "rgba(56,189,248,0.9)";
      ctx.setLineDash([6 * dpr, 6 * dpr]);
      ctx.lineWidth = Math.max(1, Math.round(1 * dpr));
      ctx.strokeRect(safeX, safeY, safeW, safeH);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(125,211,252,0.95)";
      ctx.font = `${11 * dpr}px sans-serif`;
      ctx.fillText(`Safe Area  T${metrics.safeTop} R${metrics.safeRight} B${metrics.safeBottom} L${metrics.safeLeft}`, safeX + 6 * dpr, safeY + 14 * dpr);
    }

    // Scrollbar preview: follow current frame scroll position when possible.
    const indicator = showScrollbarOverlay && currentFrameId !== null ? estimateScrollIndicator(currentFrameId) : null;
    if (indicator) {
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      const edgeInset = Math.max(8 * dpr, bezel * 0.65);
      const trackPadding = 8 * dpr;
      const barThickness = Math.max(2 * dpr, 3);

      if (indicator.v) {
        const trackH = Math.max(1, totalH - trackPadding * 2 - (indicator.h ? barThickness + 4 * dpr : 0));
        const barH = Math.max(24 * dpr, trackH * indicator.v.s);
        const barX = totalW - edgeInset;
        const barY = trackPadding + indicator.v.p * (trackH - barH);
        ctx.beginPath();
        ctx.roundRect(barX, barY, barThickness, barH, 2 * dpr);
        ctx.fill();
      }

      if (indicator.h) {
        const trackW = Math.max(1, totalW - trackPadding * 2 - (indicator.v ? barThickness + 4 * dpr : 0));
        const barW = Math.max(24 * dpr, trackW * indicator.h.s);
        const barX = trackPadding + indicator.h.p * (trackW - barW);
        const barY = totalH - edgeInset;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barThickness, 2 * dpr);
        ctx.fill();
      }
    }

    if (metrics.homeIndicatorW > 0 && metrics.homeIndicatorH > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.62)";
      if (metrics.isLandscape) {
        const hx = totalW - Math.max(metrics.safeRight * 0.5, 6 * dpr) - metrics.homeIndicatorH;
        const hy = totalH / 2 - metrics.homeIndicatorW / 2;
        ctx.beginPath();
        ctx.roundRect(hx, hy, metrics.homeIndicatorH, metrics.homeIndicatorW, Math.max(3 * dpr, metrics.homeIndicatorH / 2));
        ctx.fill();
      } else {
        const hx = totalW / 2 - metrics.homeIndicatorW / 2;
        const hy = totalH - Math.max(metrics.safeBottom * 0.5, 6 * dpr) - metrics.homeIndicatorH;
        ctx.beginPath();
        ctx.roundRect(hx, hy, metrics.homeIndicatorW, metrics.homeIndicatorH, Math.max(3 * dpr, metrics.homeIndicatorH / 2));
        ctx.fill();
      }
    }

    ctx.restore();
  }

  /** Render a frame to an offscreen canvas and return it */
  function renderFrameToCanvas(frameId: number): HTMLCanvasElement | null {
    const fb = getFrameBounds(frameId);
    if (!fb) return null;
    const dpr = window.devicePixelRatio || 1;
    const { scale, displayW, displayH } = getViewportParams(fb);

    const offscreen = document.createElement("canvas");
    offscreen.width = displayW * dpr;
    offscreen.height = displayH * dpr;
    const ctx = offscreen.getContext("2d")!;

    const savedZoom = editor.engine.get_zoom();
    const savedPanX = editor.engine.get_pan_x();
    const savedPanY = editor.engine.get_pan_y();

    editor.engine.set_viewport(scale * dpr, -fb.x * scale * dpr, -fb.y * scale * dpr);
    const restoreVisibility = applyPrototypeVisibilityOverrides(frameId);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, offscreen.width, offscreen.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);
    editor.engine.render(ctx as any);
    restoreVisibility();

    editor.engine.set_viewport(savedZoom, savedPanX, savedPanY);
    return offscreen;
  }

  /** Compute auto-animate data via engine (Rust-side node matching by name) */
  function computeAutoAnimate(fromId: number, toId: number): {
    pairs: Array<{ name: string; from: any; to: any }>;
    removed: any[];
    added: any[];
  } {
    try {
      const json = editor.engine.compute_auto_animate(fromId, toId);
      return JSON.parse(json);
    } catch {
      return { pairs: [], removed: [], added: [] };
    }
  }

  /** Perform animated transition between two frames */
  function performTransition(fromId: number, toId: number, transition: string, durationMs: number, easingStr: string = "ease_in_out", timeline?: SmartTimelineKeyframe[]) {
    if (!viewCanvas) return;
    transitioning = true;

    const fromCanvas = renderFrameToCanvas(fromId);
    const toCanvas = renderFrameToCanvas(toId);
    if (!fromCanvas || !toCanvas) {
      transitioning = false;
      renderCurrentView();
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const toBounds = getFrameBounds(toId)!;
    const { displayW, displayH } = getViewportParams(toBounds);

    // Resize main canvas to target size
    viewCanvas.width = toCanvas.width;
    viewCanvas.height = toCanvas.height;
    viewCanvas.style.width = `${displayW}px`;
    viewCanvas.style.height = `${displayH}px`;

    const ctx = viewCanvas.getContext("2d")!;
    const startTime = performance.now();

    // Easing: use interaction's easing curve
    function ease(t: number): number {
      return applyEasing(easingStr, t);
    }

    if (transition === "SmartAnimate") {
      performSmartAnimate(fromId, toId, fromCanvas, toCanvas, durationMs, easingStr, timeline);
      return;
    }

    function animate() {
      if (!viewCanvas || !active) { transitioning = false; return; }
      const elapsed = performance.now() - startTime;
      const rawT = Math.min(elapsed / durationMs, 1);
      const t = ease(rawT);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, viewCanvas.width, viewCanvas.height);

      const w = viewCanvas.width;
      const h = viewCanvas.height;

      switch (transition) {
        case "Dissolve":
          // Cross-fade
          ctx.globalAlpha = 1 - t;
          ctx.drawImage(fromCanvas, 0, 0, w, h);
          ctx.globalAlpha = t;
          ctx.drawImage(toCanvas, 0, 0, w, h);
          ctx.globalAlpha = 1;
          break;

        case "SlideIn":
          // New frame slides in from right
          ctx.drawImage(fromCanvas, -w * t, 0, w, h);
          ctx.drawImage(toCanvas, w * (1 - t), 0, w, h);
          break;

        case "SlideOut":
          // Old frame slides out to right, new appears underneath
          ctx.drawImage(toCanvas, 0, 0, w, h);
          ctx.drawImage(fromCanvas, w * t, 0, w, h);
          break;

        case "Push":
          // Both frames move together (push effect)
          ctx.drawImage(fromCanvas, -w * t, 0, w, h);
          ctx.drawImage(toCanvas, w - w * t, 0, w, h);
          break;

        default:
          ctx.drawImage(toCanvas, 0, 0, w, h);
          break;
      }

      if (rawT < 1) {
        requestAnimationFrame(animate);
      } else {
        transitioning = false;
        renderCurrentView();
      }
    }

    requestAnimationFrame(animate);
  }

  /** Smart Animate: match nodes by name via engine, interpolate all properties */
  function performSmartAnimate(fromId: number, toId: number, fromCanvas: HTMLCanvasElement, toCanvas: HTMLCanvasElement, durationMs: number, easingStr: string = "ease_in_out", timeline?: SmartTimelineKeyframe[]) {
    if (!viewCanvas) { transitioning = false; return; }

    const animData = computeAutoAnimate(fromId, toId);
    const toBounds = getFrameBounds(toId)!;
    const dpr = window.devicePixelRatio || 1;
    const { scale } = getViewportParams(toBounds);

    // If no matches, fall back to dissolve
    if (animData.pairs.length === 0) {
      performTransition(fromId, toId, "Dissolve", durationMs, easingStr);
      return;
    }

    const ctx = viewCanvas.getContext("2d")!;
    const startTime = performance.now();

    const normalizedTimeline: SmartTimelineKeyframe[] = Array.isArray(timeline)
      ? timeline
          .filter((k) => Number.isFinite(k?.time))
          .map((k) => ({
            time: Math.max(0, Math.min(durationMs, Number(k.time) || 0)),
            label: k.label,
            easing: (k.easing || "").trim(),
          }))
          .sort((a, b) => a.time - b.time)
      : [];

    function remapTimelineTime(raw: number): number {
      if (normalizedTimeline.length < 2) return applyEasing(easingStr, raw);
      const absT = raw * durationMs;
      const first = normalizedTimeline[0];
      const last = normalizedTimeline[normalizedTimeline.length - 1];
      if (absT <= first.time) return 0;
      if (absT >= last.time) return 1;

      for (let i = 0; i < normalizedTimeline.length - 1; i++) {
        const a = normalizedTimeline[i];
        const b = normalizedTimeline[i + 1];
        if (absT < a.time || absT > b.time) continue;
        const span = Math.max(1e-6, b.time - a.time);
        const local = (absT - a.time) / span;
        const easedLocal = applyEasing(a.easing || easingStr, local);
        return (a.time + span * easedLocal) / durationMs;
      }
      return applyEasing(easingStr, raw);
    }

    function lerp(a: number, b: number, t: number): number {
      return a + (b - a) * t;
    }

    function animate() {
      if (!viewCanvas || !active) { transitioning = false; return; }
      const elapsed = performance.now() - startTime;
      const rawT = Math.min(elapsed / durationMs, 1);
      const t = remapTimelineTime(rawT);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, viewCanvas.width, viewCanvas.height);

      const w = viewCanvas.width;
      const h = viewCanvas.height;

      // Cross-fade background (unmatched content)
      ctx.globalAlpha = 1 - t;
      ctx.drawImage(fromCanvas, 0, 0, w, h);
      ctx.globalAlpha = t;
      ctx.drawImage(toCanvas, 0, 0, w, h);
      ctx.globalAlpha = 1;

      // Render matched node pairs with property interpolation
      const totalScale = scale * dpr;
      for (const pair of animData.pairs) {
        const { from, to } = pair;

        const ix = lerp(from.rel_x, to.rel_x, t) * totalScale;
        const iy = lerp(from.rel_y, to.rel_y, t) * totalScale;
        const iw = lerp(from.width, to.width, t) * totalScale;
        const ih = lerp(from.height, to.height, t) * totalScale;
        const iOpacity = lerp(from.opacity, to.opacity, t);

        // Source position in fromCanvas
        const sx = from.rel_x * totalScale;
        const sy = from.rel_y * totalScale;
        const sw = from.width * totalScale;
        const sh = from.height * totalScale;

        // Target position in toCanvas
        const tx = to.rel_x * totalScale;
        const ty = to.rel_y * totalScale;
        const tw = to.width * totalScale;
        const th = to.height * totalScale;

        ctx.save();

        // Interpolate rotation
        const iRotation = lerp(from.rotation, to.rotation, t);
        if (Math.abs(iRotation) > 0.01) {
          const cx = ix + iw / 2;
          const cy = iy + ih / 2;
          ctx.translate(cx, cy);
          ctx.rotate((iRotation * Math.PI) / 180);
          ctx.translate(-cx, -cy);
        }

        // Interpolate corner radius (visual hint via rounded clip)
        const iRadius = lerp(from.corner_radius, to.corner_radius, t) * totalScale;

        // Clip to interpolated rounded rect
        ctx.beginPath();
        if (iRadius > 0 && ctx.roundRect) {
          ctx.roundRect(ix, iy, iw, ih, iRadius);
        } else {
          ctx.rect(ix, iy, iw, ih);
        }
        ctx.clip();

        // Clear clipped area
        ctx.clearRect(ix - 1, iy - 1, iw + 2, ih + 2);

        // Try path morphing for matched Path nodes
        let didPathMorph = false;
        try {
          if (editor.engine.can_morph_paths(BigInt(from.id), BigInt(to.id))) {
            const morphJson = editor.engine.morph_paths(BigInt(from.id), BigInt(to.id), t);
            const morph = JSON.parse(morphJson);
            if (morph && morph.points && morph.points.length > 0) {
              didPathMorph = true;
              ctx.globalAlpha = iOpacity;

              // Get fill/stroke from interpolated properties
              const fr = from.fill_r ?? 128, fg = from.fill_g ?? 128, fb_ = from.fill_b ?? 128, fa = from.fill_a ?? 1;
              const tr = to.fill_r ?? 128, tg = to.fill_g ?? 128, tb = to.fill_b ?? 128, ta = to.fill_a ?? 1;
              const mr = Math.round(lerp(fr, tr, t));
              const mg = Math.round(lerp(fg, tg, t));
              const mb = Math.round(lerp(fb_, tb, t));
              const ma = lerp(fa, ta, t);

              // Build path from morph points
              ctx.beginPath();
              const pts = morph.points;
              for (let pi = 0; pi < pts.length; pi++) {
                const p = pts[pi];
                const px = (p.x - (lerp(from.rel_x, to.rel_x, t))) * totalScale + ix;
                const py = (p.y - (lerp(from.rel_y, to.rel_y, t))) * totalScale + iy;
                if (pi === 0) {
                  ctx.moveTo(px, py);
                } else {
                  const prev = pts[pi - 1];
                  const cpx1 = (prev.handle_out_x - lerp(from.rel_x, to.rel_x, t)) * totalScale + ix;
                  const cpy1 = (prev.handle_out_y - lerp(from.rel_y, to.rel_y, t)) * totalScale + iy;
                  const cpx2 = (p.handle_in_x - lerp(from.rel_x, to.rel_x, t)) * totalScale + ix;
                  const cpy2 = (p.handle_in_y - lerp(from.rel_y, to.rel_y, t)) * totalScale + iy;
                  ctx.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, px, py);
                }
              }
              if (morph.closed && pts.length > 1) {
                const last = pts[pts.length - 1];
                const first = pts[0];
                const off = lerp(from.rel_x, to.rel_x, t);
                const offy = lerp(from.rel_y, to.rel_y, t);
                const cpx1 = (last.handle_out_x - off) * totalScale + ix;
                const cpy1 = (last.handle_out_y - offy) * totalScale + iy;
                const cpx2 = (first.handle_in_x - off) * totalScale + ix;
                const cpy2 = (first.handle_in_y - offy) * totalScale + iy;
                const fpx = (first.x - off) * totalScale + ix;
                const fpy = (first.y - offy) * totalScale + iy;
                ctx.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, fpx, fpy);
                ctx.closePath();
              }

              ctx.fillStyle = `rgba(${mr},${mg},${mb},${ma})`;
              ctx.fill();

              // Stroke
              const isw = lerp(from.stroke_width ?? 0, to.stroke_width ?? 0, t);
              if (isw > 0) {
                ctx.lineWidth = isw * totalScale;
                ctx.strokeStyle = `rgba(${mr},${mg},${mb},${ma})`;
                ctx.stroke();
              }
            }
          }
        } catch (_) { /* path morph not available, fall back */ }

        if (!didPathMorph) {
          // Draw from-node fading out
          if (sw > 0 && sh > 0) {
            ctx.globalAlpha = (1 - t) * iOpacity;
            ctx.drawImage(fromCanvas, sx, sy, sw, sh, ix, iy, iw, ih);
          }

          // Draw to-node fading in
          if (tw > 0 && th > 0) {
            ctx.globalAlpha = t * iOpacity;
            ctx.drawImage(toCanvas, tx, ty, tw, th, ix, iy, iw, ih);
          }
        }

        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // Fade out removed nodes
      for (const node of animData.removed) {
        ctx.save();
        ctx.globalAlpha = (1 - t);
        const rx = node.rel_x * totalScale;
        const ry = node.rel_y * totalScale;
        const rw = node.width * totalScale;
        const rh = node.height * totalScale;
        if (rw > 0 && rh > 0) {
          ctx.drawImage(fromCanvas, rx, ry, rw, rh, rx, ry, rw, rh);
        }
        ctx.restore();
      }

      // Fade in added nodes
      for (const node of animData.added) {
        ctx.save();
        ctx.globalAlpha = t;
        const ax = node.rel_x * totalScale;
        const ay = node.rel_y * totalScale;
        const aw = node.width * totalScale;
        const ah = node.height * totalScale;
        if (aw > 0 && ah > 0) {
          ctx.drawImage(toCanvas, ax, ay, aw, ah, ax, ay, aw, ah);
        }
        ctx.restore();
      }

      if (rawT < 1) {
        requestAnimationFrame(animate);
      } else {
        transitioning = false;
        renderCurrentView();
      }
    }

    requestAnimationFrame(animate);
  }

  function renderCurrentView() {
    if (!viewCanvas) return;
    const ctx = viewCanvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;

    // Determine view bounds
    let bounds: { x: number; y: number; width: number; height: number };
    if (currentFrameId !== null) {
      const fb = getFrameBounds(currentFrameId);
      if (fb) {
        bounds = fb;
        // Update title
        const titleEl = document.getElementById("proto-title");
        const nj = editor.engine.get_node_json(currentFrameId);
        if (titleEl && nj) {
          const nd = JSON.parse(nj);
          titleEl.textContent = `Prototype — ${nd.name || "Frame"}`;
        }
      } else {
        bounds = { x: 0, y: 0, width: 800, height: 600 };
      }
    } else {
      const sb = editor.engine.get_scene_bounds();
      if (sb) {
        const b = JSON.parse(sb);
        bounds = { x: b.x, y: b.y, width: b.width, height: b.height };
      } else {
        bounds = { x: 0, y: 0, width: 800, height: 600 };
      }
    }

    const { scale, displayW, displayH } = getViewportParams(bounds);

    viewCanvas.width = displayW * dpr;
    viewCanvas.height = displayH * dpr;
    viewCanvas.style.width = `${displayW}px`;
    viewCanvas.style.height = `${displayH}px`;

    // Save current viewport
    const savedZoom = editor.engine.get_zoom();
    const savedPanX = editor.engine.get_pan_x();
    const savedPanY = editor.engine.get_pan_y();

    // Set viewport to frame bounds
    editor.engine.set_viewport(scale * dpr, -bounds.x * scale * dpr, -bounds.y * scale * dpr);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, viewCanvas.width, viewCanvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, viewCanvas.width, viewCanvas.height);

    // Apply scroll-driven animation overrides before rendering
    const scrollAnimBackups = applyScrollAnimsForRender(editor);

    // Render
    editor.engine.render(ctx as any);

    // Restore scroll animation overrides
    restoreScrollAnimBackups(editor, scrollAnimBackups);

    // Restore viewport
    editor.engine.set_viewport(savedZoom, savedPanX, savedPanY);

    // Draw interaction hotspot hints (blue border on nodes with interactions)
    drawHotspotHints(ctx, bounds, scale * dpr);
    // Draw event hotspot hints (orange dotted border on nodes with JS events)
    drawEventHints(ctx, bounds, scale * dpr);

    // Device frame / notch / safe-area / scrollbar preview overlay
    drawDeviceOverlay(ctx, displayW, displayH, dpr);

    // Overlay HTML5 <video> elements for Video nodes
    renderVideoOverlays(bounds, scale);

    // Keep debug inspector in sync with current frame + active modes
    renderVarsPanel();
    renderFlowMinimap();
    renderFlowStartManager();
  }

  /** Remove old video overlays */
  function clearVideoOverlays() {
    if (!overlay) return;
    overlay.querySelectorAll(".proto-video-overlay").forEach(el => el.remove());
  }

  /** Create HTML5 <video> elements positioned over Video nodes */
  function renderVideoOverlays(frameBounds: { x: number; y: number; width: number; height: number }, scale: number) {
    clearVideoOverlays();
    if (!overlay || !viewCanvas || currentFrameId === null) return;

    // Get all layers and find Video nodes within the current frame's subtree
    const layers = JSON.parse(editor.engine.get_layer_list());
    const canvasRect = viewCanvas.getBoundingClientRect();

    for (const layer of layers) {
      if (!layer.visible) continue;
      const nj = editor.engine.get_node_json(BigInt(layer.id));
      if (!nj) continue;
      const node = JSON.parse(nj);
      if (typeof node.kind !== "object" || !node.kind.Video) continue;
      const vid = node.kind.Video;
      if (!vid.src) continue;

      // Position relative to frame bounds
      const x = (node.x - frameBounds.x) * scale + canvasRect.left;
      const y = (node.y - frameBounds.y) * scale + canvasRect.top;
      const w = node.width * scale;
      const h = node.height * scale;

      const videoEl = document.createElement("video");
      videoEl.className = "proto-video-overlay";
      videoEl.src = vid.src;
      videoEl.autoplay = vid.autoplay ?? false;
      videoEl.loop = vid.loop_video ?? false;
      videoEl.muted = vid.muted ?? true;
      videoEl.playsInline = true;
      if (vid.poster) videoEl.poster = vid.poster;
      videoEl.style.cssText = `
        position:fixed;left:${x}px;top:${y}px;width:${w}px;height:${h}px;
        z-index:1;object-fit:cover;border-radius:${(node.corner_radius || 0) * scale}px;
        pointer-events:auto;background:#000;
      `;
      videoEl.controls = true;
      overlay.appendChild(videoEl);
    }
  }

  type HotspotShape =
    | { type: "rect"; x: number; y: number; width: number; height: number }
    | { type: "polygon"; points: Array<[number, number]> }
    | { type: "freeform"; points: Array<[number, number]> };

  function parseHotspotShape(interaction: any): HotspotShape | null {
    const raw = String(interaction?.hotspot_shape_json || "").trim();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.type === "rect") {
        const x = Number(parsed.x);
        const y = Number(parsed.y);
        const width = Number(parsed.width);
        const height = Number(parsed.height);
        if ([x, y, width, height].every(Number.isFinite)) {
          return { type: "rect", x, y, width, height };
        }
      }
      if ((parsed?.type === "polygon" || parsed?.type === "freeform") && Array.isArray(parsed.points)) {
        const pts: Array<[number, number]> = [];
        for (const p of parsed.points) {
          if (!Array.isArray(p) || p.length < 2) continue;
          const px = Number(p[0]);
          const py = Number(p[1]);
          if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
          pts.push([px, py]);
        }
        if (pts.length >= 3) return { type: parsed.type === "freeform" ? "freeform" : "polygon", points: pts };
      }
    } catch {}
    return null;
  }

  function pointInPolygon(x: number, y: number, points: Array<[number, number]>): boolean {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      const intersect = ((yi > y) !== (yj > y)) &&
        (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function pointInHotspot(sceneX: number, sceneY: number, node: any, interaction: any): boolean {
    const nx = Number(node?.x || 0);
    const ny = Number(node?.y || 0);
    const nw = Math.max(1e-9, Number(node?.width || 0));
    const nh = Math.max(1e-9, Number(node?.height || 0));
    const shape = parseHotspotShape(interaction);
    if (!shape) {
      return sceneX >= nx && sceneX <= nx + nw && sceneY >= ny && sceneY <= ny + nh;
    }
    if (shape.type === "rect") {
      const rx = nx + shape.x * nw;
      const ry = ny + shape.y * nh;
      const rw = shape.width * nw;
      const rh = shape.height * nh;
      return sceneX >= rx && sceneX <= rx + rw && sceneY >= ry && sceneY <= ry + rh;
    }
    const poly = shape.points.map(([px, py]) => [nx + px * nw, ny + py * nh] as [number, number]);
    return pointInPolygon(sceneX, sceneY, poly);
  }

  function interactionSignature(interaction: any): string {
    return [
      String(interaction?.trigger || ""),
      String(interaction?.action || ""),
      String(interaction?.target_node_id || 0),
      String(interaction?.target_page_id || 0),
      String(interaction?.transition || ""),
      String(interaction?.hotspot_shape_json || ""),
      String(interaction?.accessibility_label || ""),
    ].join("|");
  }

  function drawInteractionHotspotPath(ctx: CanvasRenderingContext2D, node: any, interaction: any, frameBounds: { x: number; y: number }, totalScale: number) {
    const nx = Number(node?.x || 0);
    const ny = Number(node?.y || 0);
    const nw = Number(node?.width || 0);
    const nh = Number(node?.height || 0);
    const shape = parseHotspotShape(interaction);
    if (!shape) {
      const x = (nx - frameBounds.x) * totalScale;
      const y = (ny - frameBounds.y) * totalScale;
      const w = nw * totalScale;
      const h = nh * totalScale;
      ctx.rect(x, y, w, h);
      return;
    }
    if (shape.type === "rect") {
      const x = (nx + shape.x * nw - frameBounds.x) * totalScale;
      const y = (ny + shape.y * nh - frameBounds.y) * totalScale;
      const w = shape.width * nw * totalScale;
      const h = shape.height * nh * totalScale;
      ctx.rect(x, y, w, h);
      return;
    }
    const pts = shape.points;
    if (pts.length < 3) return;
    const [sx, sy] = pts[0];
    ctx.moveTo((nx + sx * nw - frameBounds.x) * totalScale, (ny + sy * nh - frameBounds.y) * totalScale);
    for (let i = 1; i < pts.length; i++) {
      const [px, py] = pts[i];
      ctx.lineTo((nx + px * nw - frameBounds.x) * totalScale, (ny + py * nh - frameBounds.y) * totalScale);
    }
    ctx.closePath();
  }

  function drawHotspotHints(ctx: CanvasRenderingContext2D, frameBounds: { x: number; y: number; width: number; height: number }, totalScale: number) {
    const allInterJson = editor.engine.get_all_interactions();
    const nodesWithInter: any[] = JSON.parse(allInterJson || "[]");

    ctx.save();
    for (const nwi of nodesWithInter) {
      const nj = editor.engine.get_node_json(Number(nwi.id));
      if (!nj) continue;
      const node = JSON.parse(nj);
      const x = (node.x - frameBounds.x) * totalScale;
      const y = (node.y - frameBounds.y) * totalScale;
      const w = node.width * totalScale;
      const h = node.height * totalScale;

      // Color-code by trigger type: blue=click, green=gesture, orange=hover, purple=variant
      const triggers = (nwi.interactions as any[]).map((i: any) => i.trigger);
      const actions = (nwi.interactions as any[]).map((i: any) => i.action);
      const hasVariant = actions.includes("SwapVariant");
      const hasGesture = triggers.some((t: string) =>
        t.startsWith("OnSwipe") || t === "OnLongPress" || t.startsWith("OnPinch")
      );
      const hasHover = triggers.includes("OnHover");
      ctx.strokeStyle = hasVariant ? "rgba(168, 85, 247, 0.6)" :
                         hasGesture ? "rgba(16, 185, 129, 0.6)" :
                         hasHover ? "rgba(245, 158, 11, 0.5)" :
                         "rgba(59, 130, 246, 0.5)";
      const isHotNode = hoveredHotspotNodeId !== null && Number(nwi.id) === hoveredHotspotNodeId;
      const isFocused = focusedHotspotNodeId !== null && Number(nwi.id) === focusedHotspotNodeId;
      const visualState = interactiveVisualState.get(Number(nwi.id)) || null;
      const ringPreset = loadActivePrototypeRingPreset();
      if (visualState) {
        const ring = ringPreset[visualState];
        ctx.save();
        ctx.setLineDash([]);
        ctx.strokeStyle = ring.color;
        ctx.lineWidth = ring.width;
        const rr = Math.max(0, Math.min(Math.min(w, h) * 0.5, ring.radius * totalScale));
        const rx = x - ring.width * 0.5;
        const ry = y - ring.width * 0.5;
        const rw = w + ring.width;
        const rh = h + ring.width;
        ctx.beginPath();
        if ((ctx as any).roundRect) {
          (ctx as any).roundRect(rx, ry, rw, rh, rr);
        } else {
          const r = Math.min(rr, rw * 0.5, rh * 0.5);
          ctx.moveTo(rx + r, ry);
          ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, r);
          ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, r);
          ctx.arcTo(rx, ry + rh, rx, ry, r);
          ctx.arcTo(rx, ry, rx + rw, ry, r);
          ctx.closePath();
        }
        ctx.stroke();
        ctx.restore();
      }
      ctx.lineWidth = isFocused ? 4 : (isHotNode ? 3 : 2);
      ctx.setLineDash(isFocused ? [8, 3] : [4, 4]);
      if (isFocused) {
        ctx.strokeStyle = "rgba(250, 204, 21, 0.9)";
      }
      const interactionList = Array.isArray(nwi.interactions) ? nwi.interactions : [];
      if (interactionList.length === 0) {
        ctx.strokeRect(x, y, w, h);
      } else {
        for (const interaction of interactionList) {
          const isHotInteraction = isHotNode && hoveredHotspotSig && interactionSignature(interaction) === hoveredHotspotSig;
          ctx.lineWidth = isFocused ? 4 : (isHotInteraction ? 4 : (isHotNode ? 3 : 2));
          ctx.beginPath();
          drawInteractionHotspotPath(ctx, node, interaction, frameBounds, totalScale);
          ctx.stroke();
        }
      }

      if (isHotNode && hoveredHotspotLabel) {
        ctx.save();
        ctx.setLineDash([]);
        ctx.font = `12px sans-serif`;
        const padX = 6;
        const padY = 4;
        const tw = ctx.measureText(hoveredHotspotLabel).width;
        const lw = tw + padX * 2;
        const lh = 18;
        const lx = x;
        const ly = Math.max(0, y - lh - 4);
        ctx.fillStyle = "rgba(17,24,39,0.92)";
        ctx.fillRect(lx, ly, lw, lh);
        ctx.fillStyle = "#e5e7eb";
        ctx.fillText(hoveredHotspotLabel, lx + padX, ly + lh - padY - 2);
        ctx.restore();
      }

      // Show gesture icon hint for touch triggers
      if (hasGesture) {
        ctx.font = `${10 * (1 / (totalScale / (window.devicePixelRatio || 1)))}px sans-serif`;
        ctx.fillStyle = "rgba(16, 185, 129, 0.8)";
        const gestureLabel = triggers.find((t: string) => t.startsWith("OnSwipe"))?.replace("On", "")
          || triggers.find((t: string) => t === "OnLongPress")?.replace("On", "")
          || triggers.find((t: string) => t.startsWith("OnPinch"))?.replace("On", "") || "";
        if (gestureLabel) {
          ctx.fillText("👆 " + gestureLabel, x + 4, y + 14);
        }
      }
    }
    ctx.restore();
  }

  /** Convert screen coords to scene coords and find matching interaction */
  function findInteractionAtPoint(
    clientX: number, clientY: number, triggerFilter: string
  ): { interaction: any; node: any } | null {
    if (!viewCanvas || !currentFrameId) return null;
    const rect = viewCanvas.getBoundingClientRect();
    const fb = getFrameBounds(currentFrameId);
    const bounds = fb || { x: 0, y: 0, width: 800, height: 600 };
    const { scale } = getViewportParams(bounds);
    const sceneX = (clientX - rect.left) / scale + bounds.x;
    const sceneY = (clientY - rect.top) / scale + bounds.y;

    let hitId = 0;
    try { hitId = Number(editor.engine.hit_test(sceneX, sceneY) || 0); } catch {}
    if (hitId <= 0) return null;

    const allInterJson = editor.engine.get_all_interactions();
    const nodesWithInter: any[] = JSON.parse(allInterJson || "[]");
    const interMap = new Map<number, any[]>();
    for (const nwi of nodesWithInter) interMap.set(Number(nwi.id), Array.isArray(nwi.interactions) ? nwi.interactions : []);

    let currentId = hitId;
    let guard = 0;
    while (currentId > 0 && guard < 64) {
      guard += 1;
      const interactions = interMap.get(currentId) || [];
      const raw = editor.engine.get_node_json(BigInt(currentId));
      const node = raw ? JSON.parse(raw) : null;
      const inter = interactions.find((i: any) => i.trigger === triggerFilter && (!node || pointInHotspot(sceneX, sceneY, node, i)));
      if (inter && node) {
        return { interaction: inter, node };
      }
      const p = Number((editor.engine as any).get_node_parent?.(BigInt(currentId)) ?? 0);
      if (!Number.isFinite(p) || p <= 0 || p === currentId) break;
      currentId = p;
    }
    return null;
  }

  // Track original variant keys for hover revert
  const originalVariants = new Map<number, string>(); // nodeId → original variant_key_json

  // Track interactive state for instances (hover/press/focus/disabled auto-switch)
  const interactiveOriginals = new Map<number, string>(); // nodeId → original variant_key_json

  /** Find instance nodes at or above the given nodeId that have interactive variants */
  function findInteractiveInstance(nodeId: number): number | null {
    try {
      const iv = editor.engine.get_interactive_variants(BigInt(nodeId));
      if (iv && iv !== "{}") return nodeId;
    } catch {}
    // Walk up parent chain
    try {
      const tree = JSON.parse(editor.engine.get_tree());
      const findParent = (nodes: any[], targetId: number): number | null => {
        for (const n of nodes) {
          if (n.id === targetId) return null;
          if (n.children) {
            for (const c of n.children) {
              if (c.id === targetId) return n.id;
              const r = findParent([c], targetId);
              if (r !== null) return r;
            }
          }
        }
        return null;
      };
      let pid = findParent(tree, nodeId);
      while (pid) {
        try {
          const iv2 = editor.engine.get_interactive_variants(BigInt(pid));
          if (iv2 && iv2 !== "{}") return pid;
        } catch {}
        const prev = pid;
        pid = findParent(tree, prev);
        if (pid === prev) break;
      }
    } catch {}
    return null;
  }

  /** Apply interactive state to an instance, saving original for revert */
  function applyInteractiveState(instanceId: number, state: string) {
    if (!interactiveOriginals.has(instanceId)) {
      try {
        const info = JSON.parse(editor.engine.get_instance_component_info(BigInt(instanceId)));
        if (info && info.current_variant_values) {
          interactiveOriginals.set(instanceId, JSON.stringify(info.current_variant_values));
        }
      } catch {}
    }
    if (state === "hover" || state === "press" || state === "focus") {
      interactiveVisualState.set(instanceId, state);
    }
    try {
      const changed = editor.engine.apply_interactive_state(BigInt(instanceId), state);
      if (changed) renderCurrentView();
      else editor.requestRender();
    } catch {}
  }

  /** Revert interactive state to original/default */
  function revertInteractiveState(instanceId: number) {
    interactiveVisualState.delete(instanceId);
    const orig = interactiveOriginals.get(instanceId);
    if (orig) {
      try {
        editor.engine.set_instance_variant(BigInt(instanceId), orig);
        renderCurrentView();
      } catch {}
      interactiveOriginals.delete(instanceId);
    } else {
      try {
        const changed = editor.engine.apply_interactive_state(BigInt(instanceId), "default");
        if (changed) renderCurrentView();
      } catch {}
    }
  }

  /** Execute a matched interaction */
  function executeInteraction(inter: any, sourceNodeId?: number) {
    // Check condition first
    if (!checkCondition(inter)) return;

    const targetId = Number(inter.target_node_id);

    // Handle SetVariable action
    if (inter.action === "SetVariable" && inter.set_variable_name) {
      evalSetVariable(inter.set_variable_name, inter.set_variable_expression || "0");
      return;
    }

    if (inter.action === "NavigateTo" && targetId > 0) {
      const targetPageId = Number(inter.target_page_id);
      if (targetPageId > 0) editor.engine.set_active_page(BigInt(targetPageId));
      recordEvent({ kind: "navigate", frameId: currentFrameId, nodeId: sourceNodeId, toFrameId: targetId, action: "NavigateTo" });
      let timeline: SmartTimelineKeyframe[] | undefined;
      try {
        const parsed = JSON.parse(inter.smart_animate_timeline_json || "[]");
        if (Array.isArray(parsed)) timeline = parsed as SmartTimelineKeyframe[];
      } catch {}
      navigateTo(targetId, inter.transition || "Instant", inter.transition_duration_ms || 300, inter.easing || "ease_in_out", timeline);
    } else if (inter.action === "Back") {
      recordEvent({ kind: "navigate", frameId: currentFrameId, nodeId: sourceNodeId, action: "Back" });
      navigateBack();
    } else if (inter.action === "SwapVariant" && inter.variant_key_json) {
      // Find the instance node: use target_node_id if set, otherwise the source node itself
      const instanceId = targetId > 0 ? targetId : (sourceNodeId || 0);
      if (instanceId > 0) {
        try {
          // Save original variant for revert (hover triggers)
          if (inter.trigger === "OnHover" && !originalVariants.has(instanceId)) {
            const info = JSON.parse(editor.engine.get_instance_component_info(BigInt(instanceId)));
            if (info.current_variant_values) {
              originalVariants.set(instanceId, JSON.stringify(info.current_variant_values));
            }
          }
          editor.engine.set_instance_variant(BigInt(instanceId), inter.variant_key_json);
          renderCurrentView();
        } catch {}
      }
    }
  }

  /** Revert hover-triggered variant swaps when mouse leaves */
  function revertHoverVariants(nodeId: number) {
    const orig = originalVariants.get(nodeId);
    if (orig) {
      try {
        editor.engine.set_instance_variant(BigInt(nodeId), orig);
        renderCurrentView();
      } catch {}
      originalVariants.delete(nodeId);
    }
  }

  /** Find the top-most node at a screen point (for event firing) */
  function findNodeAtPoint(clientX: number, clientY: number): number | null {
    if (!viewCanvas || !currentFrameId) return null;
    const rect = viewCanvas.getBoundingClientRect();
    const fb = getFrameBounds(currentFrameId);
    const bounds = fb || { x: 0, y: 0, width: 800, height: 600 };
    const { scale } = getViewportParams(bounds);
    const sceneX = (clientX - rect.left) / scale + bounds.x;
    const sceneY = (clientY - rect.top) / scale + bounds.y;

    // Use engine hit test
    try {
      const hitId = Number(editor.engine.hit_test(sceneX, sceneY));
      return hitId > 0 ? hitId : null;
    } catch {
      return null;
    }
  }

  let lastHoveredNodeId: number | null = null;
  let hoveredHotspotNodeId: number | null = null;
  let hoveredHotspotLabel = "";
  let hoveredHotspotSig = "";
  let focusedHotspotNodeId: number | null = null;
  let focusedHotspotInter: any | null = null;
  let focusedInteractiveInstanceId: number | null = null;
  const onInteractivePreviewEvent = (ev: Event) => {
    if (!active) return;
    const detail = (ev as CustomEvent).detail || {};
    const instanceId = Number(detail.instanceId || 0);
    const state = String(detail.state || "default");
    if (instanceId <= 0) return;
    try {
      if (state === "default") {
        const changed = editor.engine.apply_interactive_state(BigInt(instanceId), "default");
        if (!changed && detail.variant) {
          editor.engine.set_instance_variant(BigInt(instanceId), JSON.stringify(detail.variant));
        }
      } else {
        const changed = editor.engine.apply_interactive_state(BigInt(instanceId), state);
        if (!changed && detail.variant) {
          editor.engine.set_instance_variant(BigInt(instanceId), JSON.stringify(detail.variant));
        }
      }
      renderCurrentView();
    } catch {}
  };
  let mousePressNodeId: number | null = null;
  let mousePressX = 0;
  let mousePressY = 0;
  let isDragging = false;

  function listFocusableHotspots(): Array<{ nodeId: number; node: any; interaction: any }> {
    const out: Array<{ nodeId: number; node: any; interaction: any }> = [];
    if (!currentFrameId) return out;
    const fb = getFrameBounds(currentFrameId);
    const bounds = fb || { x: 0, y: 0, width: 800, height: 600 };
    const allInterJson = editor.engine.get_all_interactions();
    const nodesWithInter: any[] = JSON.parse(allInterJson || "[]");
    for (const nwi of nodesWithInter) {
      const raw = editor.engine.get_node_json(BigInt(Number(nwi.id)));
      if (!raw) continue;
      const node = JSON.parse(raw);
      const nx = Number(node?.x || 0);
      const ny = Number(node?.y || 0);
      const nw = Number(node?.width || 0);
      const nh = Number(node?.height || 0);
      const insideFrame = nx + nw >= bounds.x && ny + nh >= bounds.y && nx <= bounds.x + bounds.width && ny <= bounds.y + bounds.height;
      if (!insideFrame) continue;
      const interactions = Array.isArray(nwi.interactions) ? nwi.interactions : [];
      for (const interaction of interactions) {
        if (interaction?.trigger === "OnClick" || interaction?.trigger === "OnPress") {
          out.push({ nodeId: Number(nwi.id), node, interaction });
        }
      }
    }
    out.sort((a, b) => {
      const ay = Number(a.node?.y || 0), by = Number(b.node?.y || 0);
      if (Math.abs(ay - by) > 2) return ay - by;
      return Number(a.node?.x || 0) - Number(b.node?.x || 0);
    });
    return out;
  }

  function setFocusedInteractiveInstance(nodeId: number | null) {
    const next = nodeId !== null ? findInteractiveInstance(nodeId) : null;
    if (focusedInteractiveInstanceId !== null && focusedInteractiveInstanceId !== next) {
      revertInteractiveState(focusedInteractiveInstanceId);
    }
    focusedInteractiveInstanceId = next;
    if (focusedInteractiveInstanceId !== null) {
      applyInteractiveState(focusedInteractiveInstanceId, "focus");
    }
  }

  function cycleFocusedHotspot(reverse: boolean) {
    const items = listFocusableHotspots();
    if (items.length === 0) return;
    let idx = items.findIndex((it) => it.nodeId === focusedHotspotNodeId);
    if (idx < 0) idx = reverse ? 0 : -1;
    idx = (idx + (reverse ? -1 : 1) + items.length) % items.length;
    const next = items[idx];
    focusedHotspotNodeId = next.nodeId;
    focusedHotspotInter = next.interaction;
    hoveredHotspotNodeId = next.nodeId;
    hoveredHotspotLabel = next.interaction?.accessibility_label || next.node?.name || "";
    hoveredHotspotSig = interactionSignature(next.interaction);
    setFocusedInteractiveInstance(next.nodeId);
    renderCurrentView();
  }

  function onCanvasMouseMove(e: MouseEvent) {
    if (!viewCanvas || transitioning || !eventRuntime) return;
    const nodeId = findNodeAtPoint(e.clientX, e.clientY);

    // Hovered hotspot region hint (for label + stronger highlight)
    const hoverAny = findInteractionAtPoint(e.clientX, e.clientY, "OnHover") || findInteractionAtPoint(e.clientX, e.clientY, "OnClick");
    const nextHotId = hoverAny ? Number(hoverAny.node?.id || 0) : 0;
    const nextHotLabel = hoverAny?.interaction?.accessibility_label || hoverAny?.node?.name || "";
    const nextHotSig = hoverAny ? interactionSignature(hoverAny.interaction) : "";
    if ((nextHotId || null) !== hoveredHotspotNodeId || nextHotLabel !== hoveredHotspotLabel || nextHotSig !== hoveredHotspotSig) {
      hoveredHotspotNodeId = nextHotId > 0 ? nextHotId : null;
      hoveredHotspotLabel = nextHotLabel;
      hoveredHotspotSig = nextHotSig;
      renderCurrentView();
    }

    // Hover enter/leave
    if (nodeId !== lastHoveredNodeId) {
      if (lastHoveredNodeId !== null) {
        eventRuntime.handleHoverLeave(lastHoveredNodeId);
        // Revert any hover-triggered variant swaps on the old node (walk up ancestors too)
        revertHoverVariants(lastHoveredNodeId);
        // Revert interactive hover state
        const oldInstance = findInteractiveInstance(lastHoveredNodeId);
        if (oldInstance !== null) revertInteractiveState(oldInstance);
      }
      if (nodeId !== null) {
        eventRuntime.handleHoverEnter(nodeId, e.clientX, e.clientY);
        // Check for OnHover interactions (including SwapVariant)
        const hoverMatch = findInteractionAtPoint(e.clientX, e.clientY, "OnHover");
        if (hoverMatch) executeInteraction(hoverMatch.interaction, nodeId);
        // Apply interactive hover state
        const hoverInstance = findInteractiveInstance(nodeId);
        if (hoverInstance !== null) applyInteractiveState(hoverInstance, "hover");
      }
      lastHoveredNodeId = nodeId;
    }

    // Drag move
    if (isDragging && mousePressNodeId !== null) {
      eventRuntime.handleDragMove(e.clientX, e.clientY);
    }
  }

  function onCanvasMouseDown(e: MouseEvent) {
    if (!viewCanvas || transitioning || !eventRuntime) return;
    const nodeId = findNodeAtPoint(e.clientX, e.clientY);
    if (nodeId !== null) {
      mousePressNodeId = nodeId;
      mousePressX = e.clientX;
      mousePressY = e.clientY;
      isDragging = false;
      eventRuntime.handlePress(nodeId, e.clientX, e.clientY);
      // Apply interactive press state
      const pressInstance = findInteractiveInstance(nodeId);
      if (pressInstance !== null) applyInteractiveState(pressInstance, "press");
    }
  }

  function onCanvasMouseUp(e: MouseEvent) {
    if (!viewCanvas || transitioning || !eventRuntime) return;
    if (mousePressNodeId !== null) {
      if (isDragging) {
        eventRuntime.handleDragEnd(e.clientX, e.clientY);
      }
      eventRuntime.handleRelease(mousePressNodeId, e.clientX, e.clientY);

      // Revert press → back to hover (if still hovering) or default
      const releaseInstance = findInteractiveInstance(mousePressNodeId);
      if (releaseInstance !== null) {
        const stillHovering = findNodeAtPoint(e.clientX, e.clientY);
        if (stillHovering !== null && findInteractiveInstance(stillHovering) === releaseInstance) {
          applyInteractiveState(releaseInstance, "hover");
        } else {
          revertInteractiveState(releaseInstance);
        }
      }

      // Check if it was a drag (moved > 5px)
      const dx = e.clientX - mousePressX;
      const dy = e.clientY - mousePressY;
      if (Math.sqrt(dx * dx + dy * dy) > 5 && !isDragging) {
        isDragging = true;
        eventRuntime.handleDragStart(mousePressNodeId, mousePressX, mousePressY);
        eventRuntime.handleDragEnd(e.clientX, e.clientY);
      }
    }
    mousePressNodeId = null;
    isDragging = false;
  }

  function onCanvasDblClick(e: MouseEvent) {
    if (!viewCanvas || transitioning || !eventRuntime) return;
    const nodeId = findNodeAtPoint(e.clientX, e.clientY);
    if (nodeId !== null) {
      eventRuntime.handleDoubleClick(nodeId, e.clientX, e.clientY);
    }
  }

  function onCanvasClick(e: MouseEvent) {
    if (!viewCanvas || transitioning) return;
    const clickedNodeId = findNodeAtPoint(e.clientX, e.clientY);
    recordEvent({ kind: "click", frameId: currentFrameId, nodeId: clickedNodeId ?? undefined, x: e.clientX, y: e.clientY });
    // Fire node event
    if (eventRuntime) {
      const nodeId = findNodeAtPoint(e.clientX, e.clientY);
      if (nodeId !== null) {
        eventRuntime.handleClick(nodeId, e.clientX, e.clientY);
      }
    }
    // Then handle interaction navigation
    const match = findInteractionAtPoint(e.clientX, e.clientY, "OnClick");
    if (match) {
      focusedHotspotNodeId = Number(match.node?.id || 0) || null;
      focusedHotspotInter = match.interaction || null;
      setFocusedInteractiveInstance(focusedHotspotNodeId);
      executeInteraction(match.interaction, Number(match.node?.node_id || 0));
    } else {
      setFocusedInteractiveInstance(null);
      // Check for hyperlink on the clicked node
      const nodeId = findNodeAtPoint(e.clientX, e.clientY);
      if (nodeId !== null) {
        try {
          const link = (editor.engine as any).get_hyperlink(BigInt(nodeId)) as string;
          if (link) {
            if (link.startsWith("page:")) {
              const pageId = parseInt(link.replace("page:", ""), 10);
              if (!isNaN(pageId)) {
                (editor.engine as any).set_active_page(BigInt(pageId));
                // Re-render the viewer at the new page
                renderCurrentView();
              }
            } else {
              window.open(link, "_blank");
            }
          }
        } catch { /* ignore */ }
      }
    }
  }

  function renderSnapPagination() {
    if (!snapPaginationEl) return;
    const state = snapPaginationState;
    if (!state || state.points.length <= 1) {
      snapPaginationEl.style.display = "none";
      snapPaginationEl.innerHTML = "";
      return;
    }
    snapPaginationEl.style.display = "flex";
    snapPaginationEl.innerHTML = "";
    const vertical = state.axis === "y";
    snapPaginationEl.style.flexDirection = vertical ? "column" : "row";
    for (let i = 0; i < state.points.length; i++) {
      const dot = document.createElement("span");
      const activeDot = i === state.activeIndex;
      dot.style.cssText = `display:block;width:${activeDot ? 8 : 6}px;height:${activeDot ? 8 : 6}px;border-radius:999px;background:${activeDot ? "#4a90d9" : "rgba(255,255,255,0.45)"};box-shadow:${activeDot ? "0 0 0 2px rgba(74,144,217,0.22)" : "none"};transition:all .15s;`;
      snapPaginationEl!.appendChild(dot);
    }
  }

  function updateSnapPagination(frameId: number, axis: "x" | "y", points: number[], currentOffset: { x: number; y: number }) {
    if (points.length <= 1) {
      snapPaginationState = null;
      renderSnapPagination();
      return;
    }
    const current = axis === "y" ? currentOffset.y : currentOffset.x;
    let activeIndex = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    points.forEach((p, idx) => {
      const d = Math.abs(p - current);
      if (d < bestDist) {
        bestDist = d;
        activeIndex = idx;
      }
    });
    snapPaginationState = { frameId, axis, points, activeIndex };
    renderSnapPagination();
  }

  // ─── Scroll snap helper ──────────────────────────────
  let snapTimer: ReturnType<typeof setTimeout> | null = null;

  /** Compute snap points for a scrollable frame and animate to nearest */
  function scheduleSnap(frameId: number) {
    if (snapTimer) clearTimeout(snapTimer);
    snapTimer = setTimeout(() => { performSnap(frameId); }, 150);
  }

  function performSnap(frameId: number) {
    try {
      const snapType = editor.engine.get_scroll_snap_type(BigInt(frameId));
      if (snapType === "none") return;

      const nj = editor.engine.get_node_json(frameId);
      if (!nj) return;
      const node = JSON.parse(nj);
      const scrollOffset = JSON.parse(editor.engine.get_scroll_offset(BigInt(frameId)));

      const snapsX = snapType.includes("x") || snapType.includes("both");
      const snapsY = snapType.includes("y") || snapType.includes("both");
      const isMandatory = snapType.startsWith("mandatory");
      const proximityThreshold = 100; // px threshold for proximity snap

      // Collect snap points from children
      const childIds: number[] = node.children || [];
      const snapPointsX: number[] = [];
      const snapPointsY: number[] = [];
      let hasExplicitSnapAlign = false;

      for (const cid of childIds) {
        const cj = editor.engine.get_node_json(cid);
        if (!cj) continue;
        const c = JSON.parse(cj);
        const kind = typeof c.kind === "string" ? c.kind : Object.keys(c.kind || {})[0];
        let align = editor.engine.get_scroll_snap_align(BigInt(cid));

        // Section-based pagination fallback: when no explicit child snap is set,
        // treat Section blocks as page starts for vertical scroll containers.
        if (align === "none" && kind === "Section" && snapsY) align = "start";
        if (align !== "none") hasExplicitSnapAlign = true;
        if (align === "none") continue;

        const relX = c.x - node.x;
        const relY = c.y - node.y;

        if (snapsX) {
          if (align === "start") snapPointsX.push(-relX);
          else if (align === "center") snapPointsX.push(-(relX + c.width / 2 - node.width / 2));
          else if (align === "end") snapPointsX.push(-(relX + c.width - node.width));
        }
        if (snapsY) {
          if (align === "start") snapPointsY.push(-relY);
          else if (align === "center") snapPointsY.push(-(relY + c.height / 2 - node.height / 2));
          else if (align === "end") snapPointsY.push(-(relY + c.height - node.height));
        }
      }

      // Page-like fallback: if snap is enabled but no explicit targets, derive by viewport size.
      if (!hasExplicitSnapAlign && snapsY && snapPointsY.length === 0 && node.height > 0) {
        const pages = Math.max(1, Math.ceil((node.content_height || node.height) / node.height));
        for (let i = 0; i < pages; i++) snapPointsY.push(-(i * node.height));
      }

      const uniqueSort = (arr: number[]) => Array.from(new Set(arr.map((v) => Math.round(v * 1000) / 1000))).sort((a, b) => a - b);
      const sortedX = uniqueSort(snapPointsX);
      const sortedY = uniqueSort(snapPointsY);

      let targetX = scrollOffset.x;
      let targetY = scrollOffset.y;

      if (snapsX && sortedX.length > 0) {
        const nearest = sortedX.reduce((a, b) => Math.abs(a - scrollOffset.x) < Math.abs(b - scrollOffset.x) ? a : b);
        const dist = Math.abs(nearest - scrollOffset.x);
        if (isMandatory || dist < proximityThreshold) targetX = nearest;
      }
      if (snapsY && sortedY.length > 0) {
        const nearest = sortedY.reduce((a, b) => Math.abs(a - scrollOffset.y) < Math.abs(b - scrollOffset.y) ? a : b);
        const dist = Math.abs(nearest - scrollOffset.y);
        if (isMandatory || dist < proximityThreshold) targetY = nearest;
      }

      updateSnapPagination(frameId, snapsY ? "y" : "x", snapsY ? sortedY : sortedX, scrollOffset);
      if (targetX === scrollOffset.x && targetY === scrollOffset.y) return;

      // Animate to snap point
      const startX = scrollOffset.x, startY = scrollOffset.y;
      const duration = 250;
      const startTime = performance.now();
      function animateSnap(now: number) {
        const t = Math.min(1, (now - startTime) / duration);
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOut
        const cx = startX + (targetX - startX) * ease;
        const cy = startY + (targetY - startY) * ease;
        editor.engine.set_scroll_offset(BigInt(frameId), cx, cy);
        updateSnapPagination(frameId, snapsY ? "y" : "x", snapsY ? sortedY : sortedX, { x: cx, y: cy });
        renderCurrentView();
        if (t < 1) requestAnimationFrame(animateSnap);
      }
      requestAnimationFrame(animateSnap);
    } catch {}
  }

  // ─── Scroll handling for scrollable frames ──────────
  /** Convert screen coords to scene coords */
  function screenToScene(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!viewCanvas || !currentFrameId) return null;
    const rect = viewCanvas.getBoundingClientRect();
    const fb = getFrameBounds(currentFrameId);
    const bounds = fb || { x: 0, y: 0, width: 800, height: 600 };
    const { scale } = getViewportParams(bounds);
    return {
      x: (clientX - rect.left) / scale + bounds.x,
      y: (clientY - rect.top) / scale + bounds.y,
    };
  }

  /** Find a scrollable frame at a scene point by walking up parent chain */
  function findScrollableFrameAt(sceneX: number, sceneY: number): number | null {
    try {
      const hitId = Number(editor.engine.hit_test(sceneX, sceneY));
      if (hitId <= 0) return null;
      // Walk up to find scrollable ancestor
      let id: number | null = hitId;
      while (id !== null && id > 0) {
        const nj = editor.engine.get_node_json(id);
        if (!nj) break;
        const node = JSON.parse(nj);
        const overflow = editor.engine.get_overflow(BigInt(id));
        if (overflow.startsWith("scroll")) return id;
        id = node.parent ?? null;
      }
    } catch {}
    return null;
  }

  // ─── Scroll Animation Helpers ─────────────────────

  interface ScrollAnimBackup {
    nodeId: number;
    opacity?: number;
    x?: number;
    y?: number;
    rotation?: number;
    blur?: number;
  }

  /**
   * Compute current total scroll offset for the active view,
   * apply scroll animation property overrides, and return backups.
   */
  function applyScrollAnimsForRender(ed: Editor): ScrollAnimBackup[] {
    const backupMap = new Map<number, ScrollAnimBackup>();
    const getBackup = (nodeId: number) => {
      let b = backupMap.get(nodeId);
      if (!b) {
        b = { nodeId };
        backupMap.set(nodeId, b);
      }
      return b;
    };

    try {
      // Determine current scroll offset (sum of all scrollable ancestors)
      let scrollY = 0;
      let frameScrollX = 0;
      let frameScrollY = 0;
      if (currentFrameId !== null) {
        const so = JSON.parse(ed.engine.get_scroll_offset(BigInt(currentFrameId)));
        scrollY = -so.y; // scroll_offset is negative (content moves up)
        frameScrollX = so.x || 0;
        frameScrollY = so.y || 0;
      }

      const overrides = computeScrollAnimOverrides(ed.engine, scrollY);
      for (const [nodeId, props] of overrides) {
        const backup = getBackup(nodeId);
        const nj = ed.engine.get_node_json(nodeId);
        if (!nj) continue;
        const nd = JSON.parse(nj);

        if ("opacity" in props) {
          if (backup.opacity === undefined) backup.opacity = nd.opacity ?? 1;
          ed.engine.set_opacity(BigInt(nodeId), props.opacity);
        }
        if ("x" in props) {
          if (backup.x === undefined) backup.x = nd.x ?? 0;
          ed.engine.set_x(BigInt(nodeId), props.x);
        }
        if ("y" in props) {
          if (backup.y === undefined) backup.y = nd.y ?? 0;
          ed.engine.set_y(BigInt(nodeId), props.y);
        }
        if ("rotation" in props) {
          if (backup.rotation === undefined) backup.rotation = nd.rotation ?? 0;
          ed.engine.set_rotation(BigInt(nodeId), props.rotation);
        }
        if ("blur" in props) {
          if (backup.blur === undefined) backup.blur = nd.blur ?? 0;
          ed.engine.set_blur(BigInt(nodeId), props.blur);
        }
      }

      // Prototype fixed layers: keep node visually pinned while current frame scrolls
      if (currentFrameId !== null && (frameScrollX !== 0 || frameScrollY !== 0)) {
        const frameJson = ed.engine.get_node_json(BigInt(currentFrameId));
        if (frameJson) {
          const frameNode = JSON.parse(frameJson);
          const stack: number[] = [...(frameNode.children || [])];
          while (stack.length > 0) {
            const nodeId = Number(stack.pop());
            const nj = ed.engine.get_node_json(BigInt(nodeId));
            if (!nj) continue;
            const nd = JSON.parse(nj);
            const children: number[] = nd.children || [];
            for (const cid of children) stack.push(Number(cid));

            const isFixed = !!(ed.engine as any).get_prototype_fixed?.(BigInt(nodeId));
            if (!isFixed) continue;

            const regionRaw = String((ed.engine as any).get_prototype_fixed_region?.(BigInt(nodeId)) || "auto").toLowerCase();
            const region = regionRaw === "top" || regionRaw === "bottom" ? regionRaw : "auto";

            const backup = getBackup(nodeId);
            const curX = nd.x ?? 0;
            const curY = nd.y ?? 0;
            if (backup.x === undefined) backup.x = curX;
            if (backup.y === undefined) backup.y = curY;

            // top/bottom region pins only vertical movement; auto keeps legacy full pin (x+y)
            if (region === "top" || region === "bottom") {
              ed.engine.set_node_position(BigInt(nodeId), curX, curY - frameScrollY);
            } else {
              ed.engine.set_node_position(BigInt(nodeId), curX - frameScrollX, curY - frameScrollY);
            }
          }
        }
      }
    } catch {
      // Silently fail — don't break prototype viewer
    }
    return Array.from(backupMap.values());
  }

  /** Restore node properties from backups after rendering */
  function restoreScrollAnimBackups(ed: Editor, backups: ScrollAnimBackup[]): void {
    for (const b of backups) {
      try {
        if (b.opacity !== undefined) ed.engine.set_opacity(BigInt(b.nodeId), b.opacity);
        if (b.x !== undefined) ed.engine.set_x(BigInt(b.nodeId), b.x);
        if (b.y !== undefined) ed.engine.set_y(BigInt(b.nodeId), b.y);
        if (b.rotation !== undefined) ed.engine.set_rotation(BigInt(b.nodeId), b.rotation);
        if (b.blur !== undefined) ed.engine.set_blur(BigInt(b.nodeId), b.blur);
      } catch { /* */ }
    }
  }

  function getScrollableFrameBounds(frameId: number): { minX: number; minY: number; maxX: number; maxY: number } | null {
    const nj = editor.engine.get_node_json(frameId);
    if (!nj) return null;
    const node = JSON.parse(nj);

    let contentW = node.width;
    let contentH = node.height;
    const nodeChildren: number[] = node.children || [];
    for (const cid of nodeChildren) {
      const cj = editor.engine.get_node_json(cid);
      if (!cj) continue;
      const c = JSON.parse(cj);
      contentW = Math.max(contentW, (c.x - node.x) + c.width);
      contentH = Math.max(contentH, (c.y - node.y) + c.height);
    }

    return {
      minX: -(contentW - node.width),
      minY: -(contentH - node.height),
      maxX: 0,
      maxY: 0,
    };
  }

  function clampWithPhysics(value: number, min: number, max: number, overscroll: number): number {
    if (value < min) return Math.max(min - overscroll, value);
    if (value > max) return Math.min(max + overscroll, value);
    return value;
  }

  function clampStrict(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function stopInertia() {
    if (inertiaAnimId !== null) {
      cancelAnimationFrame(inertiaAnimId);
      inertiaAnimId = null;
    }
  }

  /** Handle wheel events for scrolling frames in prototype viewer */
  function onWheel(e: WheelEvent) {
    if (!viewCanvas || transitioning || !currentFrameId) return;
    const pt = screenToScene(e.clientX, e.clientY);
    if (!pt) return;
    const scrollFrameId = findScrollableFrameAt(pt.x, pt.y);
    if (scrollFrameId === null) return;

    e.preventDefault();
    recordEvent({ kind: "scroll", frameId: currentFrameId, nodeId: scrollFrameId, dx: e.deltaX, dy: e.deltaY, x: e.clientX, y: e.clientY });
    const overflow = editor.engine.get_overflow(BigInt(scrollFrameId));
    const scrollsX = overflow === "scroll-both" || overflow === "scroll-horizontal";
    const scrollsY = overflow === "scroll-both" || overflow === "scroll-vertical";

    const physics = getSelectedScrollPhysicsPreset();
    const behavior = getFrameScrollBehavior(scrollFrameId);
    const scrollOffset = JSON.parse(editor.engine.get_scroll_offset(BigInt(scrollFrameId)));
    const bounds = getScrollableFrameBounds(scrollFrameId);
    if (!bounds) return;

    let newScrollX = scrollsX ? scrollOffset.x - (e.deltaX * physics.wheelGain) : scrollOffset.x;
    let newScrollY = scrollsY ? scrollOffset.y - (e.deltaY * physics.wheelGain) : scrollOffset.y;

    if (scrollsX) {
      newScrollX = behavior.bounceX
        ? clampWithPhysics(newScrollX, bounds.minX, bounds.maxX, behavior.overscrollX)
        : clampStrict(newScrollX, bounds.minX, bounds.maxX);
    }
    if (scrollsY) {
      newScrollY = behavior.bounceY
        ? clampWithPhysics(newScrollY, bounds.minY, bounds.maxY, behavior.overscrollY)
        : clampStrict(newScrollY, bounds.minY, bounds.maxY);
    }

    editor.engine.set_scroll_offset(BigInt(scrollFrameId), newScrollX, newScrollY);
    renderCurrentView();
    scheduleSnap(scrollFrameId);
  }

  // ─── Touch / Gesture handling ───────────────────────
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressFired = false;
  let initialPinchDist = 0;
  let pinchActive = false;

  let touchScrollFrameId: number | null = null;
  let lastTouchX = 0;
  let lastTouchY = 0;
  let touchVelocityX = 0;
  let touchVelocityY = 0;
  let lastTouchMoveTs = 0;
  let inertiaAnimId: number | null = null;

  function onTouchStart(e: TouchEvent) {
    if (!viewCanvas || transitioning) return;
    e.preventDefault();
    longPressFired = false;
    pinchActive = false;
    touchScrollFrameId = null;
    touchVelocityX = 0;
    touchVelocityY = 0;
    lastTouchMoveTs = performance.now();
    stopInertia();

    if (e.touches.length === 2) {
      // Pinch start
      pinchActive = true;
      initialPinchDist = getTouchDistance(e.touches[0]!, e.touches[1]!);
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      return;
    }

    const touch = e.touches[0]!;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    lastTouchX = touch.clientX;
    lastTouchY = touch.clientY;
    touchStartTime = performance.now();

    // Check if touching a scrollable frame
    const pt = screenToScene(touch.clientX, touch.clientY);
    if (pt) touchScrollFrameId = findScrollableFrameAt(pt.x, pt.y);

    // Long press detection (500ms)
    longPressTimer = setTimeout(() => {
      longPressFired = true;
      const match = findInteractionAtPoint(touchStartX, touchStartY, "OnLongPress");
      if (match) executeInteraction(match.interaction);
    }, 500);
  }

  function onTouchMove(e: TouchEvent) {
    if (!viewCanvas || transitioning) return;
    e.preventDefault();

    if (e.touches.length === 2) {
      pinchActive = true;
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      return;
    }

    // Cancel long press if finger moves > 10px
    const touch = e.touches[0]!;
    if (longPressTimer) {
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }

    // Scroll handling for scrollable frames via touch drag
    if (touchScrollFrameId !== null) {
      const deltaX = lastTouchX - touch.clientX;
      const deltaY = lastTouchY - touch.clientY;
      lastTouchX = touch.clientX;
      lastTouchY = touch.clientY;

      // Scale delta to scene coords
      const fb = currentFrameId ? getFrameBounds(currentFrameId) : null;
      const bounds = fb || { x: 0, y: 0, width: 800, height: 600 };
      const { scale } = getViewportParams(bounds);
      const sdx = deltaX / scale;
      const sdy = deltaY / scale;

      const overflow = editor.engine.get_overflow(BigInt(touchScrollFrameId));
      const scrollsX = overflow === "scroll-both" || overflow === "scroll-horizontal";
      const scrollsY = overflow === "scroll-both" || overflow === "scroll-vertical";
      const scrollOffset = JSON.parse(editor.engine.get_scroll_offset(BigInt(touchScrollFrameId)));
      const scrollBounds = getScrollableFrameBounds(touchScrollFrameId);
      const physics = getSelectedScrollPhysicsPreset();
      const behavior = getFrameScrollBehavior(touchScrollFrameId);
      if (scrollBounds) {
        let newScrollX = scrollsX ? scrollOffset.x - (sdx * physics.touchGain) : scrollOffset.x;
        let newScrollY = scrollsY ? scrollOffset.y - (sdy * physics.touchGain) : scrollOffset.y;
        if (scrollsX) {
          newScrollX = behavior.bounceX
            ? clampWithPhysics(newScrollX, scrollBounds.minX, scrollBounds.maxX, behavior.overscrollX)
            : clampStrict(newScrollX, scrollBounds.minX, scrollBounds.maxX);
        }
        if (scrollsY) {
          newScrollY = behavior.bounceY
            ? clampWithPhysics(newScrollY, scrollBounds.minY, scrollBounds.maxY, behavior.overscrollY)
            : clampStrict(newScrollY, scrollBounds.minY, scrollBounds.maxY);
        }
        editor.engine.set_scroll_offset(BigInt(touchScrollFrameId), newScrollX, newScrollY);

        const now = performance.now();
        const dt = Math.max(1, now - lastTouchMoveTs);
        touchVelocityX = (newScrollX - scrollOffset.x) / dt;
        touchVelocityY = (newScrollY - scrollOffset.y) / dt;
        lastTouchMoveTs = now;

        renderCurrentView();
      }
    }
  }

  function onTouchEnd(e: TouchEvent) {
    if (!viewCanvas || transitioning) return;
    e.preventDefault();

    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }

    // Trigger inertia + snap on touch end for scrollable frame
    if (touchScrollFrameId !== null) {
      const frameId = touchScrollFrameId;
      const physics = getSelectedScrollPhysicsPreset();
      const behavior = getFrameScrollBehavior(frameId);
      const overflow = editor.engine.get_overflow(BigInt(frameId));
      const scrollsX = overflow === "scroll-both" || overflow === "scroll-horizontal";
      const scrollsY = overflow === "scroll-both" || overflow === "scroll-vertical";

      const animateInertia = () => {
        const bounds = getScrollableFrameBounds(frameId);
        if (!bounds) {
          inertiaAnimId = null;
          scheduleSnap(frameId);
          return;
        }
        let vx = touchVelocityX * physics.inertiaDecay;
        let vy = touchVelocityY * physics.inertiaDecay;
        if (!scrollsX) vx = 0;
        if (!scrollsY) vy = 0;
        touchVelocityX = vx;
        touchVelocityY = vy;

        const scrollOffset = JSON.parse(editor.engine.get_scroll_offset(BigInt(frameId)));
        let nx = scrollOffset.x + (vx * 16);
        let ny = scrollOffset.y + (vy * 16);
        nx = behavior.bounceX
          ? clampWithPhysics(nx, bounds.minX, bounds.maxX, behavior.overscrollX)
          : clampStrict(nx, bounds.minX, bounds.maxX);
        ny = behavior.bounceY
          ? clampWithPhysics(ny, bounds.minY, bounds.maxY, behavior.overscrollY)
          : clampStrict(ny, bounds.minY, bounds.maxY);
        editor.engine.set_scroll_offset(BigInt(frameId), nx, ny);
        renderCurrentView();

        const speed = Math.hypot(vx, vy);
        if (speed < 0.02) {
          const sx = clampStrict(nx, bounds.minX, bounds.maxX);
          const sy = clampStrict(ny, bounds.minY, bounds.maxY);
          editor.engine.set_scroll_offset(BigInt(frameId), sx, sy);
          renderCurrentView();
          inertiaAnimId = null;
          scheduleSnap(frameId);
          return;
        }
        inertiaAnimId = requestAnimationFrame(animateInertia);
      };

      if (Math.hypot(touchVelocityX, touchVelocityY) > 0.05) {
        stopInertia();
        inertiaAnimId = requestAnimationFrame(animateInertia);
      } else {
        scheduleSnap(frameId);
      }
      touchScrollFrameId = null;
    }

    if (longPressFired) return;

    // Pinch end
    if (pinchActive && e.changedTouches.length > 0) {
      // Compare final distance to initial
      // For pinch, we need the last two-finger state — use changedTouches + remaining
      // Since touchend fires when fingers lift, use the distance from last touchmove
      // Simple approach: check if we had a pinch and determine direction
      const lastTouch = e.changedTouches[0]!;
      // We'll calculate from the last known state — for simplicity, check remaining touches
      if (e.touches.length === 1) {
        const remaining = e.touches[0]!;
        const finalDist = getTouchDistance(lastTouch, remaining);
        const ratio = finalDist / (initialPinchDist || 1);
        const trigger = ratio < 0.8 ? "OnPinchIn" : ratio > 1.2 ? "OnPinchOut" : null;
        if (trigger) {
          const midX = (lastTouch.clientX + remaining.clientX) / 2;
          const midY = (lastTouch.clientY + remaining.clientY) / 2;
          const match = findInteractionAtPoint(midX, midY, trigger);
          if (match) executeInteraction(match.interaction);
        }
      }
      pinchActive = false;
      return;
    }

    // Swipe detection
    if (e.changedTouches.length === 0) return;
    const touch = e.changedTouches[0]!;
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    const elapsed = performance.now() - touchStartTime;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Swipe: >50px distance, <500ms, and direction > 45°
    if (dist > 50 && elapsed < 500) {
      let trigger: string | null = null;
      if (Math.abs(dx) > Math.abs(dy)) {
        trigger = dx < 0 ? "OnSwipeLeft" : "OnSwipeRight";
      } else {
        trigger = dy < 0 ? "OnSwipeUp" : "OnSwipeDown";
      }
      const match = findInteractionAtPoint(touchStartX, touchStartY, trigger);
      if (match) {
        executeInteraction(match.interaction);
        return;
      }
    }

    // If no swipe, treat as tap (OnClick) for short taps
    if (dist < 10 && elapsed < 300) {
      const match = findInteractionAtPoint(touch.clientX, touch.clientY, "OnClick");
      if (match) executeInteraction(match.interaction);
    }
  }

  function getTouchDistance(a: Touch, b: Touch): number {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function drawEventHints(ctx: CanvasRenderingContext2D, frameBounds: { x: number; y: number; width: number; height: number }, totalScale: number) {
    if (!eventRuntime || !eventRuntime.hasEvents()) return;
    const allJson = editor.engine.get_all_node_events();
    const nodesWithEvents: any[] = JSON.parse(allJson || "[]");

    ctx.save();
    for (const nwe of nodesWithEvents) {
      const nj = editor.engine.get_node_json(Number(nwe.id));
      if (!nj) continue;
      const node = JSON.parse(nj);
      const x = (node.x - frameBounds.x) * totalScale;
      const y = (node.y - frameBounds.y) * totalScale;
      const w = node.width * totalScale;
      const h = node.height * totalScale;

      ctx.strokeStyle = "rgba(255, 165, 0, 0.5)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(x, y, w, h);

      // Show ⚡ icon
      ctx.fillStyle = "rgba(255, 165, 0, 0.7)";
      ctx.font = "10px sans-serif";
      ctx.fillText("⚡", x + w - 14, y + 12);
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  return { show, hide, isActive: () => active };
}
