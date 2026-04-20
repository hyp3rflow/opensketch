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
const PROTOTYPE_RING_FLOW_OVERRIDE_KEY = "opensketch-prototype-ring-flow-overrides-v1";
const PROTOTYPE_RING_RELEASE_MODE_KEY = "opensketch-prototype-ring-release-mode-v1";
const PROTOTYPE_RING_GUARD_POLICY_KEY = "opensketch-prototype-ring-guard-policy-v1";
const INTERACTIVE_PREVIEW_EVENT = "opensketch:interactive-preview-state";
const PROTOTYPE_FLOW_ENTRY_PRESETS_KEY = "opensketch-proto-flow-entry-presets-v1";
const PROTOTYPE_KEYBOARD_ORDER_KEY = "opensketch-proto-keyboard-order-v1";
const PROTOTYPE_REDUCED_MOTION_KEY = "opensketch-prototype-reduced-motion-v1";
const PROTOTYPE_SCROLL_LOCK_REGIONS_KEY = "opensketch-prototype-scroll-lock-regions-v1";
const PROTOTYPE_OVERLAY_GUARD_PRESET_KEY = "opensketch-prototype-overlay-guard-preset-v1";

type FlowEntryPreset = { frameId: number; label: string; pageId?: number };
type RingPresetSafetyBucket = "safe" | "watch" | "risky";
type RingGuardPolicy = "off" | "warn" | "enforce-safe";
type OverlayGuardPresetId = "strict" | "balanced" | "legacy";

type OverlayGuardPresetConfig = {
  id: OverlayGuardPresetId;
  label: string;
  note: string;
  detectConditionalOnly: boolean;
  detectSimulationDrift: boolean;
  includeDepthBudget: boolean;
  includeScrollLeak: boolean;
};

const OVERLAY_GUARD_PRESETS: OverlayGuardPresetConfig[] = [
  {
    id: "strict",
    label: "Strict",
    note: "조건부/시뮬레이션 드리프트까지 모두 경고",
    detectConditionalOnly: true,
    detectSimulationDrift: true,
    includeDepthBudget: true,
    includeScrollLeak: true,
  },
  {
    id: "balanced",
    label: "Balanced",
    note: "실무 기본값: 필수 탈출 경로 중심",
    detectConditionalOnly: false,
    detectSimulationDrift: true,
    includeDepthBudget: true,
    includeScrollLeak: true,
  },
  {
    id: "legacy",
    label: "Legacy",
    note: "기존 호환 모드: 기본 overlay 누수만 점검",
    detectConditionalOnly: false,
    detectSimulationDrift: false,
    includeDepthBudget: false,
    includeScrollLeak: false,
  },
];

const DEFAULT_RING_PRESET: PrototypeRingPreset = {
  id: "default",
  name: "Default",
  hover: { color: "#f59e0b", width: 3, radius: 8 },
  press: { color: "#fb7185", width: 4, radius: 10 },
  focus: { color: "#facc15", width: 4, radius: 10 },
};

function flowPresetKey(flowId: number, pageId: number): string {
  return `${flowId}:${pageId}`;
}

function loadFlowEntryPresets(): Record<string, FlowEntryPreset[]> {
  try {
    const raw = localStorage.getItem(PROTOTYPE_FLOW_ENTRY_PRESETS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, FlowEntryPreset[]> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) continue;
      const list: FlowEntryPreset[] = [];
      for (const row of value) {
        const frameId = Number((row as any)?.frameId || 0);
        if (!frameId) continue;
        const label = String((row as any)?.label || `Frame #${frameId}`).trim() || `Frame #${frameId}`;
        const pageId = Number((row as any)?.pageId || 0) || undefined;
        list.push({ frameId, label, pageId });
      }
      out[key] = list;
    }
    return out;
  } catch {
    return {};
  }
}

function saveFlowEntryPresets(presets: Record<string, FlowEntryPreset[]>) {
  try {
    localStorage.setItem(PROTOTYPE_FLOW_ENTRY_PRESETS_KEY, JSON.stringify(presets));
  } catch {}
}

function readFlowPresetBucket(presets: Record<string, FlowEntryPreset[]>, flowId: number, pageId: number): FlowEntryPreset[] {
  const keyed = presets[flowPresetKey(flowId, pageId)];
  if (Array.isArray(keyed)) return keyed;
  const legacy = presets[String(flowId)];
  return Array.isArray(legacy) ? legacy.map((row) => ({ ...row, pageId })) : [];
}

type ScrollLockRegionMap = Record<string, true>;

function makeScrollLockRegionKey(frameId: number, overlayId: number): string {
  return `${Math.max(0, Math.floor(frameId))}:${Math.max(0, Math.floor(overlayId))}`;
}

function loadScrollLockRegions(): ScrollLockRegionMap {
  try {
    const raw = localStorage.getItem(PROTOTYPE_SCROLL_LOCK_REGIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    const out: ScrollLockRegionMap = {};
    for (const key of Object.keys(parsed as Record<string, any>)) {
      if (!/^\d+:\d+$/.test(key)) continue;
      if ((parsed as Record<string, any>)[key]) out[key] = true;
    }
    return out;
  } catch {
    return {};
  }
}

function saveScrollLockRegions(regions: ScrollLockRegionMap) {
  try {
    localStorage.setItem(PROTOTYPE_SCROLL_LOCK_REGIONS_KEY, JSON.stringify(regions));
  } catch {}
}

function resolveOverlayGuardPreset(id: string | null | undefined): OverlayGuardPresetConfig {
  const raw = String(id || "").toLowerCase() as OverlayGuardPresetId;
  return OVERLAY_GUARD_PRESETS.find((preset) => preset.id === raw)
    || OVERLAY_GUARD_PRESETS.find((preset) => preset.id === "balanced")
    || OVERLAY_GUARD_PRESETS[0]!;
}

function loadOverlayGuardPresetId(): OverlayGuardPresetId {
  try {
    const raw = localStorage.getItem(PROTOTYPE_OVERLAY_GUARD_PRESET_KEY);
    return resolveOverlayGuardPreset(raw).id;
  } catch {
    return "balanced";
  }
}

function saveOverlayGuardPresetId(id: OverlayGuardPresetId) {
  try {
    localStorage.setItem(PROTOTYPE_OVERLAY_GUARD_PRESET_KEY, resolveOverlayGuardPreset(id).id);
  } catch {}
}


type KeyboardOrderMap = Record<string, string[]>;

function hotspotOrderKey(nodeId: number, sig: string): string {
  return `${nodeId}::${sig}`;
}

function parseHotspotOrderKey(key: string): { nodeId: number; sig: string } | null {
  const raw = String(key || "").trim();
  if (!raw) return null;
  const delim = raw.indexOf("::");
  if (delim > 0) {
    const nodeId = Number(raw.slice(0, delim));
    const sig = raw.slice(delim + 2);
    if (Number.isFinite(nodeId) && nodeId > 0 && sig) return { nodeId, sig };
    return null;
  }
  const legacyNodeId = Number(raw);
  if (Number.isFinite(legacyNodeId) && legacyNodeId > 0) {
    return { nodeId: legacyNodeId, sig: "*" };
  }
  return null;
}

function loadKeyboardOrderMap(): KeyboardOrderMap {
  try {
    const raw = localStorage.getItem(PROTOTYPE_KEYBOARD_ORDER_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    const out: KeyboardOrderMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (!Array.isArray(v)) continue;
      const list: string[] = [];
      for (const entry of v) {
        const parsedEntry = parseHotspotOrderKey(String(entry));
        if (!parsedEntry) continue;
        const normalized = parsedEntry.sig === "*" ? String(parsedEntry.nodeId) : hotspotOrderKey(parsedEntry.nodeId, parsedEntry.sig);
        if (!list.includes(normalized)) list.push(normalized);
      }
      out[k] = list;
    }
    return out;
  } catch {
    return {};
  }
}

function saveKeyboardOrderMap(map: KeyboardOrderMap) {
  try {
    localStorage.setItem(PROTOTYPE_KEYBOARD_ORDER_KEY, JSON.stringify(map));
  } catch {}
}

function sanitizeRingPreset(raw: any): PrototypeRingPreset {
  const sanitize = (v: any, fb: PrototypeRingStyle): PrototypeRingStyle => ({
    color: typeof v?.color === "string" && v.color ? v.color : fb.color,
    width: Number.isFinite(Number(v?.width)) ? Math.max(1, Number(v.width)) : fb.width,
    radius: Number.isFinite(Number(v?.radius)) ? Math.max(0, Number(v.radius)) : fb.radius,
  });
  return {
    id: String(raw?.id || DEFAULT_RING_PRESET.id),
    name: String(raw?.name || DEFAULT_RING_PRESET.name),
    hover: sanitize(raw?.hover, DEFAULT_RING_PRESET.hover),
    press: sanitize(raw?.press, DEFAULT_RING_PRESET.press),
    focus: sanitize(raw?.focus, DEFAULT_RING_PRESET.focus),
  };
}

function loadPrototypeRingPresets(): PrototypeRingPreset[] {
  try {
    const listRaw = localStorage.getItem(PROTOTYPE_RING_PRESET_KEY);
    const list = listRaw ? JSON.parse(listRaw) : [];
    if (!Array.isArray(list) || list.length === 0) return [DEFAULT_RING_PRESET];
    const out = list.map((row: any) => sanitizeRingPreset(row)).filter((row: PrototypeRingPreset) => !!row.id);
    return out.length ? out : [DEFAULT_RING_PRESET];
  } catch {
    return [DEFAULT_RING_PRESET];
  }
}

function loadRingFlowOverrides(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PROTOTYPE_RING_FLOW_OVERRIDE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const flowId = Number(k);
      if (!flowId || flowId <= 0) continue;
      const presetId = String(v || "").trim();
      if (presetId) out[String(flowId)] = presetId;
    }
    return out;
  } catch {
    return {};
  }
}

function saveRingFlowOverrides(map: Record<string, string>) {
  try {
    localStorage.setItem(PROTOTYPE_RING_FLOW_OVERRIDE_KEY, JSON.stringify(map));
  } catch {}
}

function classifyRingPresetSafety(preset: PrototypeRingPreset): RingPresetSafetyBucket {
  const widths = [preset.hover.width, preset.press.width, preset.focus.width].map((v) => Number(v) || 0);
  const radii = [preset.hover.radius, preset.press.radius, preset.focus.radius].map((v) => Number(v) || 0);
  const maxWidth = Math.max(...widths, 0);
  const maxRadius = Math.max(...radii, 0);
  if (maxWidth <= 4 && maxRadius <= 12) return "safe";
  if (maxWidth <= 6 && maxRadius <= 18) return "watch";
  return "risky";
}

function loadRingGuardPolicies(): Record<string, RingGuardPolicy> {
  try {
    const raw = localStorage.getItem(PROTOTYPE_RING_GUARD_POLICY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, RingGuardPolicy> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const flowId = Number(k);
      if (!flowId || flowId <= 0) continue;
      const policy = String(v || "off") as RingGuardPolicy;
      if (policy === "off" || policy === "warn" || policy === "enforce-safe") out[String(flowId)] = policy;
    }
    return out;
  } catch {
    return {};
  }
}

function saveRingGuardPolicies(map: Record<string, RingGuardPolicy>) {
  try {
    localStorage.setItem(PROTOTYPE_RING_GUARD_POLICY_KEY, JSON.stringify(map));
  } catch {}
}

function loadActivePrototypeRingPreset(flowId?: number | null): PrototypeRingPreset {
  const presets = loadPrototypeRingPresets();
  const flowOverrides = loadRingFlowOverrides();
  const overridePresetId = flowId && flowId > 0 ? String(flowOverrides[String(flowId)] || "") : "";
  const activeId = localStorage.getItem(PROTOTYPE_RING_ACTIVE_PRESET_KEY);
  const picked = presets.find((p) => p.id === overridePresetId)
    || presets.find((p) => p.id === String(activeId || ""))
    || presets[0]
    || DEFAULT_RING_PRESET;
  return sanitizeRingPreset(picked);
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
  let flowMinimapSnapshot: { nodes: Array<{ id: number; name: string; x: number; y: number }>; edges: Array<{ from: number; to: number; action: string; sourceNodeId: number; interactionIndex: number; conditional: boolean; branchActive: boolean | null; conditionSummary: string }>; nodeHits: Array<{ id: number; x: number; y: number; r: number }>; edgeHits: Array<{ from: number; to: number; x: number; y: number }>; } | null = null;
  let flowStartWrap: HTMLDivElement | null = null;
  let flowStartFlowSel: HTMLSelectElement | null = null;
  let flowStartFrameSel: HTMLSelectElement | null = null;
  let flowStartInfo: HTMLDivElement | null = null;
  const flowPresetCursor = new Map<string, number>();
  const FLOW_OVERLAY_DEPTH_BUDGET = 3;
  const FLOW_OVERLAY_EXIT_LATENCY_BUDGET = 2;
  type FlowLintIssueType = "unreachable" | "dead-end" | "cycle" | "cycle-trap" | "overlay-leak" | "overlay-key-route" | "overlay-depth-budget" | "overlay-exit-latency" | "orphan-close" | "scroll-leak" | "a11y-missing-label" | "a11y-focus-gap" | "a11y-focus-trap" | "a11y-low-contrast" | "a11y-motion";
  type FlowLintRunScope = "selection" | "page" | "flow";
  type FlowLintIssue = { type: FlowLintIssueType; frameId: number; frameName: string; detail: string; overlayId?: number; overlayPath?: number[]; overlayOffenders?: number[]; overlayBudget?: number; overlayRewritePlan?: string[]; overlayImpactNodeCount?: number };
  type FocusTrapSimIssue = {
    frameId: number;
    frameName: string;
    overlayId: number;
    overlayName: string;
    keyboardHotspots: number;
    missingClosePath: boolean;
    noKeyboardHotspots: boolean;
    leaksOutside: boolean;
    trappedInLoop: boolean;
    shiftTabTrapped: boolean;
    simulatedTabSteps: number;
    simulatedShiftTabSteps: number;
    tabTrace: string[];
    shiftTabTrace: string[];
  };
  let flowLintWrap: HTMLDivElement | null = null;
  let flowLintPresetSel: HTMLSelectElement | null = null;
  let flowLintScopeSel: HTMLSelectElement | null = null;
  let flowLintPresetInfo: HTMLDivElement | null = null;
  let keyboardOrderWrap: HTMLDivElement | null = null;
  let keyboardOrderInfo: HTMLDivElement | null = null;
  let keyboardOrderList: HTMLDivElement | null = null;
  let coverageWrap: HTMLDivElement | null = null;
  let coverageInfo: HTMLDivElement | null = null;
  let coverageList: HTMLDivElement | null = null;
  let flowLintInfo: HTMLDivElement | null = null;
  let flowLintRiskWrap: HTMLDivElement | null = null;
  let flowLintRiskInfo: HTMLDivElement | null = null;
  let flowLintRiskList: HTMLDivElement | null = null;
  let flowLintFilterWrap: HTMLDivElement | null = null;
  let flowLintList: HTMLDivElement | null = null;
  let flowLintBatchTypeSel: HTMLSelectElement | null = null;
  let flowLintBatchScopeSel: HTMLSelectElement | null = null;
  let flowLintBatchRunBtn: HTMLButtonElement | null = null;
  let focusTrapSimWrap: HTMLDivElement | null = null;
  let focusTrapSimInfo: HTMLDivElement | null = null;
  let focusTrapSimList: HTMLDivElement | null = null;
  let focusTrapSimIssues: FocusTrapSimIssue[] = [];
  let overlayStackWrap: HTMLDivElement | null = null;
  let overlayStackInfo: HTMLDivElement | null = null;
  let overlayStackList: HTMLDivElement | null = null;
  let escapeRouteWrap: HTMLDivElement | null = null;
  let escapeRouteInfo: HTMLDivElement | null = null;
  let escapeRouteList: HTMLDivElement | null = null;
  let focusReturnWrap: HTMLDivElement | null = null;
  let focusReturnInfo: HTMLDivElement | null = null;
  let focusReturnList: HTMLDivElement | null = null;
  let condDebugInfo: HTMLDivElement | null = null;
  let condDebugList: HTMLDivElement | null = null;
  let flowLintSnapshot: { startFrameId: number | null; issues: FlowLintIssue[]; } | null = null;
  let flowLintFilterTypes = new Set<FlowLintIssueType>();
  let flowLintRenderedIssues: FlowLintIssue[] = [];
  let flowLintNavIndex = -1;
  let sessionSnapshotWrap: HTMLDivElement | null = null;
  let sessionSnapshotInfo: HTMLDivElement | null = null;
  let sessionSnapshotList: HTMLDivElement | null = null;
  let sessionSnapshotSelectA: HTMLSelectElement | null = null;
  let sessionSnapshotSelectB: HTMLSelectElement | null = null;
  type ProtoSessionSnapshot = {
    id: string;
    at: number;
    frameId: number | null;
    frameName: string;
    scrollX: number;
    scrollY: number;
    vars: Array<{ name: string; value: string }>;
  };
  let sessionSnapshots: ProtoSessionSnapshot[] = [];
  let timelineWrap: HTMLDivElement | null = null;
  let timelineInfo: HTMLDivElement | null = null;
  let timelineScrubber: HTMLInputElement | null = null;
  let timelineList: HTMLDivElement | null = null;
  let stagePreviewWrap: HTMLDivElement | null = null;
  let stagePreviewInfo: HTMLDivElement | null = null;
  let stagePreviewCanvas: HTMLCanvasElement | null = null;
  let stagePreviewScrubber: HTMLInputElement | null = null;
  let stagePreviewOnion = true;
  let lastTransitionPreview: { fromId: number; toId: number; transition: string; durationMs: number; easing: string; timeline?: SmartTimelineKeyframe[] } | null = null;
  type TimelineEventKind = "interaction" | "frame" | "system";
  let timelineEvents: Array<{ id: number; at: number; action: string; fromFrameId: number | null; toFrameId: number | null; transition: string; durationMs: number; kind: TimelineEventKind; note?: string }> = [];
  let timelineFilterMode: "all" | "frame" | "interaction" = "all";
  let timelineSeq = 1;
  let timelinePlaybackTimer: number | null = null;
  let lastScrollTimelineAt = 0;
  const interactiveVisualState = new Map<number, "hover" | "press" | "focus">();
  let keyboardOrderMap = loadKeyboardOrderMap();
  let reducedMotionPreview = localStorage.getItem(PROTOTYPE_REDUCED_MOTION_KEY) === "1";
  let ringReleaseMode = localStorage.getItem(PROTOTYPE_RING_RELEASE_MODE_KEY) === "1";
  let ringGuardPolicies = loadRingGuardPolicies();
  let scrollLockRegions = loadScrollLockRegions();
  let overlayGuardPresetId: OverlayGuardPresetId = loadOverlayGuardPresetId();
  const coverageFrameVisits = new Map<number, number>();
  const coverageHotspotHits = new Map<number, Set<string>>();

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

  function resolveRingPresetForFlow(flowId: number | null): { preset: PrototypeRingPreset; bucket: RingPresetSafetyBucket; policy: RingGuardPolicy; forcedSafe: boolean } {
    const base = loadActivePrototypeRingPreset(flowId);
    const bucket = classifyRingPresetSafety(base);
    const policy: RingGuardPolicy = flowId && flowId > 0 ? (ringGuardPolicies[String(flowId)] || "off") : "off";
    if (!ringReleaseMode || policy !== "enforce-safe" || bucket === "safe") {
      return { preset: base, bucket, policy, forcedSafe: false };
    }
    return { preset: { ...DEFAULT_RING_PRESET }, bucket, policy, forcedSafe: true };
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
    renderFlowMinimap();
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

    const guardPolicySel = flowStartWrap.querySelector('[data-role="ring-guard-policy"]') as HTMLSelectElement | null;
    const releaseCheck = flowStartWrap.querySelector('[data-role="ring-release-check"]') as HTMLInputElement | null;
    if (releaseCheck) releaseCheck.checked = ringReleaseMode;
    if (guardPolicySel) {
      guardPolicySel.disabled = !selectedFlowId;
      guardPolicySel.value = selectedFlowId ? (ringGuardPolicies[String(selectedFlowId)] || "off") : "off";
    }

    if (!selectedFlow) {
      flowStartInfo.textContent = "No flows yet. Add a flow in Prototype settings.";
    } else {
      const frameName = frames.find((f) => f.id === selectedFlow.start_frame_id)?.name || "None";
      const guardPolicy = ringGuardPolicies[String(selectedFlow.id)] || "off";
      flowStartInfo.textContent = `Flow #${selectedFlow.id} · Page #${pageId} · Start: ${frameName} · Guard: ${ringReleaseMode ? guardPolicy : "preview"}`;
    }

    const presetList = flowStartWrap.querySelector('[data-role="flow-entry-presets"]') as HTMLDivElement | null;
    if (presetList) {
      presetList.innerHTML = "";
      const presets = loadFlowEntryPresets();
      const flowPresets = readFlowPresetBucket(presets, selectedFlowId, pageId);
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
              const pageIdNow = Number(selectedFlow?.page_id || editor.engine.get_active_page_id?.() || 0);
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

  function resolveInteractionCondition(inter: any): any | null {
    if (!inter || typeof inter !== "object") return null;
    if (inter.condition && typeof inter.condition === "object") return inter.condition;
    const legacyVar = String(inter.condition_variable || "").trim();
    if (legacyVar) {
      return {
        variable: legacyVar,
        operator: String(inter.condition_operator || "Equal"),
        value: String(inter.condition_value ?? ""),
      };
    }
    const groupJson = String(inter.condition_group_json || "").trim();
    if (!groupJson) return null;
    try {
      const parsed = JSON.parse(groupJson);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function summarizeCondition(cond: any): string {
    if (!cond || typeof cond !== "object") return "";
    const children = Array.isArray(cond.conditions) ? cond.conditions : [];
    const logic = String(cond.logic || "").toUpperCase();
    if ((logic === "AND" || logic === "OR") && children.length > 0) {
      return `${logic}(${children.map((c) => summarizeCondition(c)).filter(Boolean).join(` ${logic} `)})`;
    }
    const variable = String(cond.variable || "").trim();
    if (!variable) return "";
    const opMap: Record<string, string> = {
      Equal: "==",
      NotEqual: "!=",
      GreaterThan: ">",
      LessThan: "<",
      GreaterThanOrEqual: ">=",
      LessThanOrEqual: "<=",
    };
    const op = opMap[String(cond.operator || "Equal")] || "==";
    return `${variable} ${op} ${String(cond.value ?? "")}`;
  }

  function renderFlowMinimap() {
    if (!flowMinimapCanvas || !flowMinimapInfo) return;
    const ctx = flowMinimapCanvas.getContext("2d");
    if (!ctx) return;

    const frames: Array<{ id: number; name: string; x: number; y: number }> = [];
    const edges: Array<{ from: number; to: number; action: string; sourceNodeId: number; interactionIndex: number; conditional: boolean; branchActive: boolean | null; conditionSummary: string }> = [];

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
        const sourceNodeId = Number(row?.id || 0);
        if (!sourceNodeId) continue;
        const rawNode = editor.engine.get_node_json(BigInt(sourceNodeId));
        if (!rawNode) continue;
        const sourceNode = JSON.parse(rawNode);
        const parentFrameId = isFrameNode(sourceNode)
          ? sourceNodeId
          : Number(editor.engine.find_parent_frame(BigInt(sourceNodeId)) || 0);
        if (!frameIds.has(parentFrameId)) continue;

        const interactions: any[] = Array.isArray(row?.interactions) ? row.interactions : [];
        interactions.forEach((inter, interactionIndex) => {
          const action = String(inter?.action || "");
          const target = Number(inter?.target_node_id || 0);
          if ((action !== "NavigateTo" && action !== "OpenOverlay") || !frameIds.has(target) || target <= 0) return;
          const cond = resolveInteractionCondition(inter);
          const conditional = !!cond;
          const branchActive = conditional ? checkCondition({ ...inter, condition: cond }) : null;
          edges.push({
            from: parentFrameId,
            to: target,
            action,
            sourceNodeId,
            interactionIndex,
            conditional,
            branchActive,
            conditionSummary: summarizeCondition(cond),
          });
        });
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
    ctx.lineWidth = 1.2;
    for (const e of edges) {
      const a = pos.get(e.from);
      const b = pos.get(e.to);
      if (!a || !b) continue;
      ctx.strokeStyle = !e.conditional
        ? "rgba(100,116,139,0.7)"
        : e.branchActive
          ? "rgba(34,197,94,0.9)"
          : "rgba(239,68,68,0.85)";
      ctx.setLineDash(e.conditional && e.branchActive === false ? [4, 3] : []);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      const mx = (a.x + b.x) * 0.5;
      const my = (a.y + b.y) * 0.5;
      edgeHits.push({ from: e.from, to: e.to, x: mx, y: my });
      ctx.fillStyle = e.conditional
        ? (e.branchActive ? "rgba(74,222,128,0.95)" : "rgba(248,113,113,0.95)")
        : "rgba(148,163,184,0.9)";
      ctx.font = "9px sans-serif";
      ctx.fillText(e.conditional ? (e.branchActive ? "✓" : "✕") : "→", mx + 2, my - 2);
    }
    ctx.setLineDash([]);
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
    const conditionalCount = edges.filter((e) => e.conditional).length;
    const deadConditionalCount = edges.filter((e) => e.conditional && e.branchActive === false).length;
    flowMinimapInfo.textContent = `Frames ${frames.length} · Links ${edgeCount} · Conditional ${conditionalCount} (dead ${deadConditionalCount}) · Current #${currentFrameId || "-"}`;
    flowMinimapSnapshot = { nodes: frames, edges, nodeHits, edgeHits };
    renderConditionalBranchDebugger();
    renderFlowLint();
  }

  function renderConditionalBranchDebugger() {
    if (!condDebugInfo || !condDebugList) return;
    const snapshot = flowMinimapSnapshot;
    if (!snapshot) {
      condDebugInfo.textContent = "Conditional graph unavailable";
      condDebugList.innerHTML = "";
      return;
    }
    const nodeById = new Map(snapshot.nodes.map((n) => [n.id, n]));
    const conditionalEdges = snapshot.edges.filter((e) => e.conditional);
    const deadEdges = conditionalEdges.filter((e) => e.branchActive === false);
    condDebugInfo.textContent = `Conditional ${conditionalEdges.length} · Active ${conditionalEdges.length - deadEdges.length} · Dead ${deadEdges.length}`;
    condDebugList.innerHTML = "";

    if (!deadEdges.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "font-size:10px;color:#86efac;";
      empty.textContent = "No dead conditional branches for current variable state.";
      condDebugList.appendChild(empty);
      return;
    }

    deadEdges.slice(0, 8).forEach((edge) => {
      const from = nodeById.get(edge.from);
      const to = nodeById.get(edge.to);
      const row = document.createElement("div");
      row.style.cssText = "border:1px solid rgba(248,113,113,0.45);background:rgba(127,29,29,0.25);border-radius:6px;padding:5px;display:flex;flex-direction:column;gap:4px;";
      const title = document.createElement("div");
      title.style.cssText = "font-size:10px;color:#fecaca;line-height:1.3;";
      title.textContent = `${from?.name || `Frame ${edge.from}`} → ${to?.name || `Frame ${edge.to}`}`;
      row.appendChild(title);
      const detail = document.createElement("div");
      detail.style.cssText = "font-size:9px;color:#fca5a5;line-height:1.3;";
      detail.textContent = edge.conditionSummary || "Condition expression";
      row.appendChild(detail);
      const btnRow = document.createElement("div");
      btnRow.style.cssText = "display:flex;gap:4px;";
      const jumpBtn = document.createElement("button");
      jumpBtn.className = "prop-btn";
      jumpBtn.style.cssText = "flex:1;font-size:9px;padding:2px 4px;";
      jumpBtn.textContent = "Jump";
      jumpBtn.onclick = () => {
        currentFrameId = edge.from;
        renderCurrentView();
      };
      const fixBtn = document.createElement("button");
      fixBtn.className = "prop-btn";
      fixBtn.style.cssText = "flex:1;font-size:9px;padding:2px 4px;";
      fixBtn.textContent = "Quick fix";
      fixBtn.onclick = () => {
        try {
          editor.engine.set_interaction_condition(BigInt(edge.sourceNodeId), edge.interactionIndex, "");
          fixBtn.textContent = "Fixed";
          renderFlowMinimap();
          renderCurrentView();
        } catch {
          fixBtn.textContent = "Fix failed";
        }
      };
      btnRow.append(jumpBtn, fixBtn);
      row.appendChild(btnRow);
      condDebugList.appendChild(row);
    });
  }

  function jumpFlowLintIssue(delta: 1 | -1) {
    if (flowLintRenderedIssues.length === 0) return;
    if (flowLintNavIndex < 0 || flowLintNavIndex >= flowLintRenderedIssues.length) {
      flowLintNavIndex = delta > 0 ? 0 : flowLintRenderedIssues.length - 1;
    } else {
      flowLintNavIndex = (flowLintNavIndex + delta + flowLintRenderedIssues.length) % flowLintRenderedIssues.length;
    }
    const issue = flowLintRenderedIssues[flowLintNavIndex];
    if (!issue) return;
    navigateTo(issue.frameId, "Instant", 0, "linear");
    if (flowLintList) {
      const row = flowLintList.querySelector<HTMLButtonElement>(`button[data-lint-nav-index="${flowLintNavIndex}"]`);
      if (row) {
        row.style.outline = "2px solid rgba(56,189,248,0.9)";
        row.style.outlineOffset = "1px";
        row.scrollIntoView({ block: "nearest" });
        window.setTimeout(() => {
          row.style.outline = "";
          row.style.outlineOffset = "";
        }, 480);
      }
    }
  }


  function parseColorToRgb(input: unknown): { r: number; g: number; b: number } | null {
    const raw = String(input || "").trim();
    if (!raw) return null;
    const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
      const body = hex[1];
      if (body.length === 3) {
        return {
          r: parseInt(body[0] + body[0], 16),
          g: parseInt(body[1] + body[1], 16),
          b: parseInt(body[2] + body[2], 16),
        };
      }
      return {
        r: parseInt(body.slice(0, 2), 16),
        g: parseInt(body.slice(2, 4), 16),
        b: parseInt(body.slice(4, 6), 16),
      };
    }
    const rgb = raw.match(/^rgba?\(([^)]+)\)$/i);
    if (rgb) {
      const parts = rgb[1].split(",").map((v) => Number(v.trim()));
      if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
        return {
          r: Math.max(0, Math.min(255, Math.round(parts[0]!))),
          g: Math.max(0, Math.min(255, Math.round(parts[1]!))),
          b: Math.max(0, Math.min(255, Math.round(parts[2]!))),
        };
      }
    }
    return null;
  }

  function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
    const toLinear = (v: number) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
  }

  function contrastRatio(fg: { r: number; g: number; b: number }, bg: { r: number; g: number; b: number }): number {
    const l1 = relativeLuminance(fg);
    const l2 = relativeLuminance(bg);
    const hi = Math.max(l1, l2);
    const lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }

  function detectFrameBackgroundRgb(frameId: number): { r: number; g: number; b: number } {
    try {
      const raw = editor.engine.get_node_json(BigInt(frameId));
      if (!raw) return { r: 15, g: 23, b: 42 };
      const node = JSON.parse(raw);
      const fills = Array.isArray(node?.fills) ? node.fills : [];
      for (const fill of fills) {
        if (fill?.visible === false) continue;
        const rgb = parseColorToRgb(fill?.color);
        if (rgb) return rgb;
      }
      const rgb = parseColorToRgb(node?.fill?.color);
      if (rgb) return rgb;
    } catch {}
    return { r: 15, g: 23, b: 42 };
  }

  function pickContrastSafeRingColor(rawColor: string, bg: { r: number; g: number; b: number }, minRatio: number = 3): string {
    const current = parseColorToRgb(rawColor);
    if (current && contrastRatio(current, bg) >= minRatio) return rawColor;
    const candidates = ["#ffffff", "#f8fafc", "#e2e8f0", "#111827", "#0f172a", "#2563eb", "#22c55e", "#f59e0b", "#ef4444"];
    let best = "#ffffff";
    let bestRatio = 0;
    for (const c of candidates) {
      const rgb = parseColorToRgb(c);
      if (!rgb) continue;
      const ratio = contrastRatio(rgb, bg);
      if (ratio > bestRatio) {
        bestRatio = ratio;
        best = c;
      }
    }
    return best;
  }

  function collectFocusTrapSimulationIssues(snapshotInput?: { nodes: Array<{ id: number; name: string; x: number; y: number; width: number; height: number }>; edges: Array<{ from: number; to: number; action: string; sourceNodeId: number; interactionIndex: number; conditional: boolean; branchActive: boolean | null; conditionSummary: string }>; }): FocusTrapSimIssue[] {
    const snapshot = snapshotInput || buildFlowGraphSnapshot();
    if (!snapshot) return [];
    const frameById = new Map(snapshot.nodes.map((n) => [n.id, n]));

    let allInter: any[] = [];
    try {
      allInter = JSON.parse(editor.engine.get_all_interactions() || "[]") || [];
    } catch {
      return [];
    }

    const nodeCache = new Map<number, any>();
    const getNode = (id: number) => {
      if (nodeCache.has(id)) return nodeCache.get(id);
      try {
        const raw = editor.engine.get_node_json(BigInt(id));
        const node = raw ? JSON.parse(raw) : null;
        nodeCache.set(id, node);
        return node;
      } catch {
        nodeCache.set(id, null);
        return null;
      }
    };

    const rowsInFrame = (frameId: number): any[] => {
      const frame = frameById.get(frameId);
      if (!frame) return [];
      return allInter.filter((row) => {
        const node = getNode(Number(row?.id || 0));
        if (!node) return false;
        const nx = Number(node?.x || 0);
        const ny = Number(node?.y || 0);
        const nw = Number(node?.width || 0);
        const nh = Number(node?.height || 0);
        return nx >= frame.x && ny >= frame.y && (nx + nw) <= (frame.x + frame.width) && (ny + nh) <= (frame.y + frame.height);
      });
    };

    const issues: FocusTrapSimIssue[] = [];
    for (const frame of snapshot.nodes) {
      const frameRows = rowsInFrame(frame.id);
      const overlayTargets = new Set<number>();
      for (const row of frameRows) {
        const interactions: any[] = Array.isArray(row?.interactions) ? row.interactions : [];
        for (const inter of interactions) {
          if (String(inter?.action || "") === "OpenOverlay") {
            const target = Number(inter?.target_node_id || 0);
            if (target > 0) overlayTargets.add(target);
          }
        }
      }

      for (const overlayId of overlayTargets) {
        const focusables = listFocusableHotspots(overlayId);
        const hasClosePath = focusables.some((item) => {
          const action = String(item.interaction?.action || "");
          return action === "CloseOverlay" || action === "Back";
        });
        const nodeHasClosePath = new Map<number, boolean>();
        for (const item of focusables) {
          if (nodeHasClosePath.has(item.nodeId)) continue;
          const hasClose = focusables.some((other) => {
            if (other.nodeId !== item.nodeId) return false;
            const action = String(other.interaction?.action || "");
            return action === "CloseOverlay" || action === "Back";
          });
          nodeHasClosePath.set(item.nodeId, hasClose);
        }

        const noKeyboardHotspots = focusables.length === 0;
        let simulatedTabSteps = 0;
        let simulatedShiftTabSteps = 0;
        let leaksOutside = false;
        let trappedInLoop = false;
        let shiftTabTrapped = false;
        const tabTrace: string[] = [];
        const shiftTabTrace: string[] = [];
        if (focusables.length > 0) {
          const maxSteps = Math.max(6, focusables.length * 2);
          for (let step = 0; step < maxSteps; step += 1) {
            simulatedTabSteps += 1;
            const focusable = focusables[step % focusables.length];
            const interaction = focusable?.interaction;
            if (!interaction) continue;
            const action = String(interaction?.action || "");
            const target = Number(interaction?.target_node_id || 0);
            const nodeLabel = String(focusable?.node?.name || `Node #${focusable?.nodeId || 0}`);
            const targetLabel = target > 0 ? ` → #${target}` : "";
            tabTrace.push(`Tab ${step + 1}: ${nodeLabel} · ${action}${targetLabel}`);
            if (action === "CloseOverlay" || action === "Back") {
              trappedInLoop = false;
              break;
            }
            if (action === "NavigateTo" && target > 0 && target !== frame.id && target !== overlayId && !nodeHasClosePath.get(focusable.nodeId)) {
              leaksOutside = true;
              break;
            }
            if (step === maxSteps - 1) trappedInLoop = true;
          }

          for (let step = 0; step < maxSteps; step += 1) {
            simulatedShiftTabSteps += 1;
            const idx = (focusables.length - 1 - (step % focusables.length) + focusables.length) % focusables.length;
            const focusable = focusables[idx];
            const interaction = focusable?.interaction;
            if (!interaction) continue;
            const action = String(interaction?.action || "");
            const target = Number(interaction?.target_node_id || 0);
            const nodeLabel = String(focusable?.node?.name || `Node #${focusable?.nodeId || 0}`);
            const targetLabel = target > 0 ? ` → #${target}` : "";
            shiftTabTrace.push(`Shift+Tab ${step + 1}: ${nodeLabel} · ${action}${targetLabel}`);
            if (action === "CloseOverlay" || action === "Back") {
              shiftTabTrapped = false;
              break;
            }
            if (step === maxSteps - 1) shiftTabTrapped = true;
          }
        }

        if (hasClosePath && !noKeyboardHotspots && !leaksOutside && !trappedInLoop && !shiftTabTrapped) continue;
        const overlayNode = frameById.get(overlayId);
        issues.push({
          frameId: frame.id,
          frameName: frame.name,
          overlayId,
          overlayName: overlayNode?.name || `Overlay #${overlayId}`,
          keyboardHotspots: focusables.length,
          missingClosePath: !hasClosePath,
          noKeyboardHotspots,
          leaksOutside,
          trappedInLoop,
          shiftTabTrapped,
          simulatedTabSteps,
          simulatedShiftTabSteps,
          tabTrace: tabTrace.slice(0, 4),
          shiftTabTrace: shiftTabTrace.slice(0, 4),
        });
      }
    }

    return issues;
  }

  function applyFocusTrapFix(issue: FocusTrapSimIssue): boolean {
    const addCloseInteractionIfNeeded = (nodeId: number): boolean => {
      if (!nodeId || nodeId <= 0) return false;
      try {
        const allInter: any[] = JSON.parse(editor.engine.get_all_interactions() || "[]") || [];
        const row = allInter.find((r) => Number(r?.id || 0) === nodeId);
        const interactions: any[] = Array.isArray(row?.interactions) ? row.interactions : [];
        const hasClose = interactions.some((inter) => {
          const trigger = String(inter?.trigger || "");
          const action = String(inter?.action || "");
          return (trigger === "OnClick" || trigger === "OnPress") && (action === "CloseOverlay" || action === "Back");
        });
        if (hasClose) return false;
        editor.engine.add_interaction(BigInt(nodeId), "OnPress", "CloseOverlay", BigInt(0), BigInt(0), "Instant", 0, "ease_in_out");
        return true;
      } catch {
        return false;
      }
    };

    const focusables = listFocusableHotspots(issue.overlayId);
    let changed = false;

    if (issue.leaksOutside) {
      const leakingNodeIds = new Set<number>();
      for (const item of focusables) {
        const action = String(item.interaction?.action || "");
        const target = Number(item.interaction?.target_node_id || 0);
        if (action === "NavigateTo" && target > 0 && target !== issue.frameId && target !== issue.overlayId) {
          leakingNodeIds.add(item.nodeId);
        }
      }
      for (const nodeId of leakingNodeIds) {
        changed = addCloseInteractionIfNeeded(nodeId) || changed;
      }
    }

    if (issue.missingClosePath || issue.noKeyboardHotspots || issue.trappedInLoop || issue.shiftTabTrapped) {
      const fallbackNodeId = Number(focusables[focusables.length - 1]?.nodeId || focusables[0]?.nodeId || issue.overlayId || 0);
      changed = addCloseInteractionIfNeeded(fallbackNodeId) || changed;
    }

    return changed;
  }

  function renderFocusTrapSimulator() {
    if (!focusTrapSimInfo || !focusTrapSimList) return;
    focusTrapSimIssues = collectFocusTrapSimulationIssues(flowMinimapSnapshot || undefined);
    if (focusTrapSimIssues.length === 0) {
      focusTrapSimInfo.textContent = "No focus-trap risks detected.";
      focusTrapSimList.innerHTML = "";
      return;
    }

    focusTrapSimInfo.textContent = `${focusTrapSimIssues.length} risk overlay(s) from Tab simulation.`;
    focusTrapSimList.innerHTML = "";
    for (const issue of focusTrapSimIssues.slice(0, 10)) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;flex-direction:column;gap:4px;background:rgba(15,23,42,0.55);border:1px solid rgba(248,113,113,0.35);border-radius:6px;padding:6px;";

      const label = document.createElement("div");
      label.style.cssText = "font-size:10px;color:#fee2e2;line-height:1.35;";
      const parts = [];
      if (issue.noKeyboardHotspots) parts.push("no keyboard hotspots");
      if (issue.missingClosePath) parts.push("missing close path");
      if (issue.leaksOutside) parts.push("escapes outside");
      if (issue.trappedInLoop) parts.push("tab loop without close");
      if (issue.shiftTabTrapped) parts.push("shift+tab loop without close");
      label.textContent = `${issue.frameName} → ${issue.overlayName} (${parts.join(" + ") || "risk"})`;
      row.appendChild(label);

      const meta = document.createElement("div");
      meta.style.cssText = "font-size:9px;color:#fecaca;";
      meta.textContent = `Keyboard hotspots: ${issue.keyboardHotspots} · Tab/Shift+Tab: ${issue.simulatedTabSteps}/${issue.simulatedShiftTabSteps}`;
      row.appendChild(meta);

      if (issue.tabTrace.length > 0) {
        const trace = document.createElement("div");
        trace.style.cssText = "font-size:9px;color:#fda4af;line-height:1.35;white-space:pre-wrap;";
        trace.textContent = issue.tabTrace.join("\n");
        row.appendChild(trace);
      }
      if (issue.shiftTabTrace.length > 0) {
        const trace = document.createElement("div");
        trace.style.cssText = "font-size:9px;color:#fecdd3;line-height:1.35;white-space:pre-wrap;";
        trace.textContent = issue.shiftTabTrace.join("\n");
        row.appendChild(trace);
      }

      const btnRow = document.createElement("div");
      btnRow.style.cssText = "display:flex;gap:4px;";
      const jumpBtn = document.createElement("button");
      jumpBtn.className = "prop-btn";
      jumpBtn.textContent = "Jump";
      jumpBtn.style.cssText = "flex:1;font-size:10px;padding:3px 6px;";
      jumpBtn.onclick = () => navigateTo(issue.frameId, "Instant", 0, "linear");
      btnRow.appendChild(jumpBtn);

      const fixBtn = document.createElement("button");
      fixBtn.className = "prop-btn";
      fixBtn.textContent = "Fix";
      fixBtn.style.cssText = "flex:1;font-size:10px;padding:3px 6px;color:#fca5a5;border-color:rgba(248,113,113,0.5);";
      fixBtn.onclick = () => {
        editor.engine.push_undo();
        const ok = applyFocusTrapFix(issue);
        fixBtn.textContent = ok ? "Fixed" : "No-op";
        if (ok) {
          editor.requestRender();
          renderFlowLint();
          renderFocusTrapSimulator();
        }
      };
      btnRow.appendChild(fixBtn);
      row.appendChild(btnRow);

      focusTrapSimList.appendChild(row);
    }
  }

  function quickFixFocusTrapIssues(): number {
    const issues = collectFocusTrapSimulationIssues(flowMinimapSnapshot || undefined);
    if (issues.length === 0) return 0;

    editor.engine.push_undo();
    const seen = new Set<string>();
    let changed = 0;
    for (const issue of issues) {
      const key = `${issue.frameId}:${issue.overlayId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (applyFocusTrapFix(issue)) changed += 1;
    }

    if (changed > 0) {
      editor.requestRender();
    }
    return changed;
  }

  function collectOverlayStackRows(snapshotInput?: { nodes: Array<{ id: number; name: string; x: number; y: number; width: number; height: number }>; edges: Array<{ from: number; to: number; action: string; sourceNodeId: number; interactionIndex: number; conditional: boolean; branchActive: boolean | null; conditionSummary: string }>; }) {
    const snapshot = snapshotInput || buildFlowGraphSnapshot();
    if (!snapshot) return [] as Array<{ frameId: number; frameName: string; open: number; close: number; stackDelta: number; orphan: boolean }>;
    const frameById = new Map(snapshot.nodes.map((n) => [n.id, n]));
    const rows: Array<{ frameId: number; frameName: string; open: number; close: number; stackDelta: number; orphan: boolean }> = [];
    for (const frame of snapshot.nodes) {
      let open = 0;
      let close = 0;
      for (const edge of snapshot.edges) {
        if (edge.from !== frame.id) continue;
        if (edge.action === "OpenOverlay") open += 1;
        if (edge.action === "CloseOverlay" || edge.action === "Back") close += 1;
      }
      if (open === 0 && close === 0) continue;
      rows.push({
        frameId: frame.id,
        frameName: frame.name,
        open,
        close,
        stackDelta: open - close,
        orphan: close > open,
      });
    }
    rows.sort((a, b) => {
      const severityA = a.orphan ? 2 : a.stackDelta > 0 ? 1 : 0;
      const severityB = b.orphan ? 2 : b.stackDelta > 0 ? 1 : 0;
      if (severityA !== severityB) return severityB - severityA;
      return b.stackDelta - a.stackDelta;
    });
    return rows;
  }

  function quickFixOrphanOverlayRows(): number {
    const rows = collectOverlayStackRows(flowMinimapSnapshot || undefined);
    let changed = 0;
    for (const row of rows) {
      if (!row.orphan) continue;
      const frame = flowMinimapSnapshot?.nodes.find((n) => n.id === row.frameId);
      if (!frame) continue;
      const openEdge = (flowMinimapSnapshot?.edges || []).find((e) => e.from === row.frameId && e.action === "OpenOverlay" && e.to > 0);
      if (!openEdge) continue;
      const lockKey = makeScrollLockRegionKey(row.frameId, openEdge.to);
      try {
        editor.engine.set_scroll_lock_region(lockKey, Number(frame.x || 0), Number(frame.y || 0), Number(frame.width || 0), Number(frame.height || 0));
        changed += 1;
      } catch {}
    }
    return changed;
  }

  const FLOW_LINT_BATCH_FIXABLE_TYPES: FlowLintIssueType[] = ["a11y-focus-trap", "overlay-depth-budget", "scroll-leak"];

  function getFlowLintScopedIssues(issueType: FlowLintIssueType, scope: "current-frame" | "all-frames") {
    const issues = (flowLintSnapshot?.issues || []).filter((issue) => issue.type === issueType);
    if (scope === "current-frame" && currentFrameId && currentFrameId > 0) {
      return issues.filter((issue) => issue.frameId === currentFrameId);
    }
    return issues;
  }

  function runFlowLintBatchQuickFix(issueType: FlowLintIssueType, scope: "current-frame" | "all-frames"): number {
    const scopedIssues = getFlowLintScopedIssues(issueType, scope);
    if (scopedIssues.length === 0) return 0;

    let changed = 0;

    if (issueType === "a11y-focus-trap") {
      const trapIssues = collectFocusTrapSimulationIssues(flowMinimapSnapshot || undefined);
      const scopedTrap = trapIssues.filter((row) => scopedIssues.some((issue) => issue.frameId === row.frameId && issue.overlayId === row.overlayId));
      if (scopedTrap.length === 0) return 0;
      const seen = new Set<string>();
      editor.engine.push_undo();
      for (const row of scopedTrap) {
        const key = `${row.frameId}:${row.overlayId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (applyFocusTrapFix(row)) changed += 1;
      }
      return changed;
    }

    if (issueType === "scroll-leak") {
      const seen = new Set<string>();
      const candidates: Array<{ frameId: number; overlayId: number }> = [];
      for (const issue of scopedIssues) {
        if (!issue.overlayId || issue.overlayId <= 0) continue;
        const key = `${issue.frameId}:${issue.overlayId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({ frameId: issue.frameId, overlayId: issue.overlayId });
      }
      if (candidates.length === 0) return 0;
      editor.engine.push_undo();
      for (const candidate of candidates) {
        const frame = flowMinimapSnapshot?.nodes.find((n) => n.id === candidate.frameId);
        if (!frame) continue;
        const lockKey = makeScrollLockRegionKey(candidate.frameId, candidate.overlayId);
        try {
          editor.engine.set_scroll_lock_region(lockKey, Number(frame.x || 0), Number(frame.y || 0), Number(frame.width || 0), Number(frame.height || 0));
          scrollLockRegions = { ...scrollLockRegions, [lockKey]: true };
          changed += 1;
        } catch {}
      }
      if (changed > 0) saveScrollLockRegions(scrollLockRegions);
      return changed;
    }

    if (issueType === "overlay-depth-budget") {
      const targetSet = new Set<number>();
      for (const issue of scopedIssues) {
        const flattenTargets = [...(issue.overlayPath || []), issue.overlayId].filter((id): id is number => Number(id) > 0);
        for (const targetId of flattenTargets) targetSet.add(targetId);
      }
      const targets = Array.from(targetSet);
      if (targets.length === 0) return 0;
      const prevSelectionRaw = editor.engine.get_selection_json();
      let prevSelection: number[] = [];
      try {
        const parsed = JSON.parse(prevSelectionRaw || "[]");
        if (Array.isArray(parsed)) prevSelection = parsed.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
      } catch {}
      editor.engine.push_undo();
      try {
        for (const targetId of targets) {
          editor.engine.set_selection(new BigUint64Array([BigInt(targetId)]));
          changed += Number(editor.engine.flatten_selection() || 0);
        }
      } finally {
        if (prevSelection.length > 0) editor.engine.set_selection(new BigUint64Array(prevSelection.map((id) => BigInt(id))));
        else editor.engine.clear_selection();
      }
      return changed;
    }

    return 0;
  }

  function simulateOverlayStackStress(frameId: number, snapshotInput?: { nodes: Array<{ id: number; name: string; x: number; y: number; width: number; height: number }>; edges: Array<{ from: number; to: number; action: string; sourceNodeId: number; interactionIndex: number; conditional: boolean; branchActive: boolean | null; conditionSummary: string }>; }) {
    const snapshot = snapshotInput || flowMinimapSnapshot;
    if (!snapshot) return { summary: "No flow snapshot", failDepth: 0 };

    const openBySource = new Map<number, number[]>();
    for (const edge of snapshot.edges) {
      if (edge.action !== "OpenOverlay" || edge.to <= 0) continue;
      const bucket = openBySource.get(edge.from) || [];
      bucket.push(edge.to);
      openBySource.set(edge.from, bucket);
    }

    const queue: Array<{ nodeId: number; depth: number }> = (openBySource.get(frameId) || []).map((overlayId) => ({ nodeId: overlayId, depth: 1 }));
    const seen = new Set<string>();
    let failDepth = 0;
    let failLabel = "";

    while (queue.length > 0) {
      const current = queue.shift()!;
      const key = `${current.nodeId}:${current.depth}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const exits = snapshot.edges.filter((edge) => edge.from === current.nodeId && (edge.action === "CloseOverlay" || edge.action === "Back"));
      if (exits.length === 0) {
        failDepth = current.depth;
        failLabel = `#${current.nodeId}`;
        break;
      }

      if (current.depth >= 5) continue;
      const nested = openBySource.get(current.nodeId) || [];
      for (const nextOverlayId of nested) queue.push({ nodeId: nextOverlayId, depth: current.depth + 1 });
    }

    if (failDepth > 0) {
      return { summary: `D${failDepth} fail (${failLabel} no Close/Back)`, failDepth };
    }
    return { summary: "D1-5 pass", failDepth: 0 };
  }

  function collectOverlayDepthBudgetRows(snapshotInput?: { nodes: Array<{ id: number; name: string; x: number; y: number; width: number; height: number }>; edges: Array<{ from: number; to: number; action: string; sourceNodeId: number; interactionIndex: number; conditional: boolean; branchActive: boolean | null; conditionSummary: string }>; }, budget = 3) {
    const snapshot = snapshotInput || flowMinimapSnapshot;
    if (!snapshot) return [] as Array<{ frameId: number; frameName: string; maxDepth: number; offenders: number[]; deepestOffenderId: number | null; pathSample: number[] }>;

    const openBySource = new Map<number, number[]>();
    for (const edge of snapshot.edges) {
      if (edge.action !== "OpenOverlay" || edge.to <= 0) continue;
      const bucket = openBySource.get(edge.from) || [];
      bucket.push(edge.to);
      openBySource.set(edge.from, bucket);
    }

    const rows: Array<{ frameId: number; frameName: string; maxDepth: number; offenders: number[]; deepestOffenderId: number | null; pathSample: number[] }> = [];
    for (const frame of snapshot.nodes) {
      const queue: Array<{ nodeId: number; depth: number; path: number[] }> = (openBySource.get(frame.id) || []).map((overlayId) => ({ nodeId: overlayId, depth: 1, path: [overlayId] }));
      if (queue.length === 0) continue;
      const seen = new Set<string>();
      let maxDepth = 0;
      const offenders = new Set<number>();
      let deepestOffenderId: number | null = null;
      let deepestPath: number[] = [];
      while (queue.length > 0) {
        const current = queue.shift()!;
        const key = `${current.nodeId}:${current.depth}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (current.depth > maxDepth) {
          maxDepth = current.depth;
          deepestOffenderId = current.nodeId;
          deepestPath = current.path;
        }
        if (current.depth > budget) offenders.add(current.nodeId);
        if (current.depth >= budget + 3) continue;
        for (const nextOverlayId of openBySource.get(current.nodeId) || []) {
          queue.push({ nodeId: nextOverlayId, depth: current.depth + 1, path: [...current.path, nextOverlayId] });
        }
      }
      if (maxDepth > budget) {
        rows.push({
          frameId: frame.id,
          frameName: frame.name,
          maxDepth,
          offenders: Array.from(offenders),
          deepestOffenderId,
          pathSample: deepestPath,
        });
      }
    }

    rows.sort((a, b) => b.maxDepth - a.maxDepth || a.frameName.localeCompare(b.frameName));
    return rows;
  }

  function buildOverlayDepthRewritePlan(snapshot: { nodes: Array<{ id: number; name: string; x: number; y: number; width: number; height: number }>; edges: Array<{ from: number; to: number; action: string; sourceNodeId: number; interactionIndex: number; conditional: boolean; branchActive: boolean | null; conditionSummary: string }>; }, frameId: number, row: { maxDepth: number; offenders: number[]; pathSample: number[] }, budget: number) {
    const nodeNameById = new Map(snapshot.nodes.map((n) => [n.id, n.name]));
    const uniqueChain = Array.from(new Set((row.pathSample || []).filter((id) => id > 0)));
    const overBudgetChain = uniqueChain.slice(Math.max(0, budget));
    const offenderIds = Array.from(new Set((row.offenders || []).filter((id) => id > 0)));
    const flattenCandidates = overBudgetChain.length > 0 ? overBudgetChain : offenderIds;

    const mergeCandidates: Array<[number, number]> = [];
    for (let i = 0; i < overBudgetChain.length - 1; i += 1) {
      mergeCandidates.push([overBudgetChain[i], overBudgetChain[i + 1]]);
    }

    const impactNodeSet = new Set<number>();
    const chainSet = new Set<number>([frameId, ...uniqueChain]);
    for (const edge of snapshot.edges) {
      if (chainSet.has(edge.from) || chainSet.has(edge.to)) {
        if (edge.sourceNodeId > 0) impactNodeSet.add(edge.sourceNodeId);
      }
    }

    const chainLabel = uniqueChain.map((id) => `#${id}`).join(" → ");
    const flattenLabel = flattenCandidates.map((id) => `#${id}`).join(", ");
    const mergeLabel = mergeCandidates.slice(0, 3).map(([from, to]) => `#${from}+ #${to}`).join(", ");

    const lines: string[] = [];
    lines.push(`Rewrite plan: #${frameId}${chainLabel ? ` → ${chainLabel}` : ""}`);
    if (mergeCandidates.length > 0) {
      lines.push(`- Merge candidate: ${mergeLabel}${mergeCandidates.length > 3 ? " …" : ""}`);
    }
    if (flattenCandidates.length > 0) {
      lines.push(`- Flatten candidate: ${flattenLabel}`);
    }
    lines.push(`- Est. impact nodes: ${impactNodeSet.size}`);

    return { lines, impactNodeCount: impactNodeSet.size, flattenCandidates, mergeCandidates };
  }

  function collectOverlayRouteCoverageRows(snapshotInput?: { nodes: Array<{ id: number; name: string; x: number; y: number; width: number; height: number }>; edges: Array<{ from: number; to: number; action: string; sourceNodeId: number; interactionIndex: number; conditional: boolean; branchActive: boolean | null; conditionSummary: string }>; }) {
    const snapshot = snapshotInput || flowMinimapSnapshot;
    if (!snapshot) return [] as Array<{ frameId: number; frameName: string; overlayId: number; overlayName: string; openCount: number; maxDepth: number; closeCovered: boolean; conditionalOnly: boolean }>;

    const frameById = new Map(snapshot.nodes.map((n) => [n.id, n]));
    const openBySource = new Map<number, number[]>();
    const openEdgeMap = new Map<string, typeof snapshot.edges>();
    for (const edge of snapshot.edges) {
      if (edge.action === "OpenOverlay" && edge.to > 0) {
        const bucket = openBySource.get(edge.from) || [];
        bucket.push(edge.to);
        openBySource.set(edge.from, bucket);
        const key = `${edge.from}:${edge.to}`;
        const edgeBucket = openEdgeMap.get(key) || [];
        edgeBucket.push(edge);
        openEdgeMap.set(key, edgeBucket);
      }
    }

    const calcDepthFromOverlay = (overlayId: number) => {
      const queue: Array<{ id: number; depth: number }> = [{ id: overlayId, depth: 1 }];
      const seen = new Set<string>();
      let maxDepth = 0;
      while (queue.length > 0) {
        const cur = queue.shift()!;
        const key = `${cur.id}:${cur.depth}`;
        if (seen.has(key)) continue;
        seen.add(key);
        maxDepth = Math.max(maxDepth, cur.depth);
        if (cur.depth >= 6) continue;
        for (const next of openBySource.get(cur.id) || []) queue.push({ id: next, depth: cur.depth + 1 });
      }
      return maxDepth;
    };

    const rows: Array<{ frameId: number; frameName: string; overlayId: number; overlayName: string; openCount: number; maxDepth: number; closeCovered: boolean; conditionalOnly: boolean }> = [];
    for (const [key, openEdges] of openEdgeMap.entries()) {
      const [frameRaw, overlayRaw] = key.split(":");
      const frameId = Number(frameRaw || 0);
      const overlayId = Number(overlayRaw || 0);
      const frame = frameById.get(frameId);
      const overlay = frameById.get(overlayId);
      if (!frame || !overlay) continue;
      const exits = snapshot.edges.filter((edge) => edge.from === overlayId && (edge.action === "CloseOverlay" || edge.action === "Back" || edge.action === "NavigateTo"));
      const closeCovered = exits.some((edge) => edge.action === "CloseOverlay" || edge.action === "Back" || (edge.action === "NavigateTo" && edge.to === frameId));
      const conditionalOnly = exits.length > 0 && exits.every((edge) => !!edge.conditional || edge.branchActive === false);
      rows.push({
        frameId,
        frameName: frame.name,
        overlayId,
        overlayName: overlay.name,
        openCount: openEdges.length,
        maxDepth: calcDepthFromOverlay(overlayId),
        closeCovered,
        conditionalOnly,
      });
    }

    rows.sort((a, b) => b.maxDepth - a.maxDepth || Number(a.closeCovered) - Number(b.closeCovered) || b.openCount - a.openCount);
    return rows;
  }

  function renderOverlayStackInspector() {
    if (!overlayStackInfo || !overlayStackList) return;
    const rows = collectOverlayStackRows(flowMinimapSnapshot || undefined);
    if (rows.length === 0) {
      overlayStackInfo.textContent = "No overlay stack events in current flow.";
      overlayStackList.innerHTML = "";
      return;
    }
    const orphanCount = rows.filter((r) => r.orphan).length;
    const coverageRows = collectOverlayRouteCoverageRows(flowMinimapSnapshot || undefined);
    const coverageHit = coverageRows.filter((row) => row.closeCovered && !row.conditionalOnly).length;
    const coveragePct = coverageRows.length > 0 ? Math.round((coverageHit / coverageRows.length) * 100) : 100;
    overlayStackInfo.textContent = `Frames ${rows.length} · Orphan ${orphanCount} · Route coverage ${coveragePct}%`;
    overlayStackList.innerHTML = "";

    if (coverageRows.length > 0) {
      const matrix = document.createElement("div");
      matrix.style.cssText = "display:flex;flex-direction:column;gap:4px;margin-bottom:6px;padding:6px;border:1px solid rgba(148,163,184,0.28);border-radius:6px;background:rgba(15,23,42,0.35);";
      const matrixTitle = document.createElement("div");
      matrixTitle.style.cssText = "font-size:10px;color:#bfdbfe;font-weight:600;";
      matrixTitle.textContent = "Route Coverage Matrix";
      matrix.appendChild(matrixTitle);
      for (const row of coverageRows.slice(0, 5)) {
        const item = document.createElement("div");
        const risk = row.closeCovered && !row.conditionalOnly ? "OK" : (row.conditionalOnly ? "Conditional" : "Missing");
        const riskColor = risk === "OK" ? "#86efac" : risk === "Conditional" ? "#facc15" : "#fca5a5";
        item.style.cssText = "display:flex;justify-content:space-between;gap:6px;font-size:9px;color:#cbd5e1;";
        item.innerHTML = `<span>${row.frameName}→${row.overlayName}</span><span style=\"color:${riskColor};\">D${row.maxDepth} · Open ${row.openCount} · ${risk}</span>`;
        matrix.appendChild(item);
      }
      overlayStackList.appendChild(matrix);
    }

    for (const row of rows.slice(0, 10)) {
      const card = document.createElement("div");
      card.style.cssText = `display:flex;flex-direction:column;gap:4px;border:1px solid ${row.orphan ? "rgba(248,113,113,0.45)" : "rgba(148,163,184,0.3)"};border-radius:6px;padding:6px;background:rgba(15,23,42,0.45);`;
      const title = document.createElement("div");
      title.style.cssText = "font-size:10px;color:#e2e8f0;line-height:1.35;";
      title.textContent = `${row.frameName} (#${row.frameId})`;
      card.appendChild(title);
      const meta = document.createElement("div");
      meta.style.cssText = "font-size:9px;color:#93c5fd;";
      meta.textContent = `Open ${row.open} · Close ${row.close} · Δ ${row.stackDelta > 0 ? "+" : ""}${row.stackDelta}`;
      card.appendChild(meta);
      const stress = simulateOverlayStackStress(row.frameId, flowMinimapSnapshot || undefined);
      const stressMeta = document.createElement("div");
      stressMeta.style.cssText = `font-size:9px;line-height:1.35;color:${stress.failDepth > 0 ? "#fca5a5" : "#86efac"};`;
      stressMeta.textContent = `Stress: ${stress.summary}`;
      card.appendChild(stressMeta);
      const btnRow = document.createElement("div");
      btnRow.style.cssText = "display:flex;gap:4px;";
      const jumpBtn = document.createElement("button");
      jumpBtn.className = "prop-btn";
      jumpBtn.textContent = "Jump";
      jumpBtn.style.cssText = "flex:1;font-size:10px;padding:3px 6px;";
      jumpBtn.onclick = () => navigateTo(row.frameId, "Instant", 0, "linear");
      btnRow.appendChild(jumpBtn);
      if (row.orphan) {
        const fixBtn = document.createElement("button");
        fixBtn.className = "prop-btn";
        fixBtn.textContent = "Fix orphan";
        fixBtn.style.cssText = "flex:1;font-size:10px;padding:3px 6px;color:#fca5a5;border-color:rgba(248,113,113,0.5);";
        fixBtn.onclick = () => {
          const applied = quickFixOrphanOverlayRows();
          fixBtn.textContent = applied > 0 ? `Fixed ${applied}` : "No-op";
          window.setTimeout(() => { fixBtn.textContent = "Fix orphan"; }, 1100);
          renderFlowLint();
          renderOverlayStackInspector();
          renderEscapeRouteMap();
        };
        btnRow.appendChild(fixBtn);
      }
      card.appendChild(btnRow);
      overlayStackList.appendChild(card);
    }
  }

  function collectEscapeRouteRows(snapshotInput?: { nodes: Array<{ id: number; name: string; x: number; y: number; width: number; height: number }>; edges: Array<{ from: number; to: number; action: string; sourceNodeId: number; interactionIndex: number; conditional: boolean; branchActive: boolean | null; conditionSummary: string }>; }) {
    const snapshot = snapshotInput || flowMinimapSnapshot;
    if (!snapshot) return [] as Array<{ frameId: number; frameName: string; overlayId: number; overlayName: string; routeSummary: string; escRouteSummary: string; backRouteSummary: string; escSimSummary: string; backSimSummary: string; escSimBroken: boolean; backSimBroken: boolean; escSteps: number | null; backSteps: number | null; trapped: boolean; missingEsc: boolean; missingBack: boolean; escConditionalOnly: boolean; backConditionalOnly: boolean; openCount: number; conditionalSamples: number; conditionalActive: number; conditionalSuccess: number; conditionalFail: number; conditionalEscMiss: number; conditionalBackMiss: number; conditionalMissSamples: number; conditionalSummary: string }>;
    const frameById = new Map(snapshot.nodes.map((n) => [n.id, n]));
    const rows: Array<{ frameId: number; frameName: string; overlayId: number; overlayName: string; routeSummary: string; escRouteSummary: string; backRouteSummary: string; escSimSummary: string; backSimSummary: string; escSimBroken: boolean; backSimBroken: boolean; escSteps: number | null; backSteps: number | null; trapped: boolean; missingEsc: boolean; missingBack: boolean; escConditionalOnly: boolean; backConditionalOnly: boolean; openCount: number; conditionalSamples: number; conditionalActive: number; conditionalSuccess: number; conditionalFail: number; conditionalEscMiss: number; conditionalBackMiss: number; conditionalMissSamples: number; conditionalSummary: string }> = [];

    const summarize = (edge: { action: string; to: number } | null, openerFrameId: number) => {
      if (!edge) return "missing";
      if (edge.action === "CloseOverlay") return `CloseOverlay → #${openerFrameId}`;
      if (edge.action === "Back") return edge.to > 0 ? `Back → #${edge.to}` : `Back → #${openerFrameId}`;
      if (edge.action === "NavigateTo") return edge.to > 0 ? `NavigateTo → #${edge.to}` : "NavigateTo";
      return `${edge.action}${edge.to > 0 ? ` → #${edge.to}` : ""}`;
    };

    const simulateKeyRoute = (mode: "esc" | "back", openerFrameId: number, overlayId: number) => {
      const trace: string[] = [];
      let cursor = overlayId;
      let stepsToOrigin: number | null = null;
      const seen = new Set<number>();
      for (let step = 0; step < 4; step += 1) {
        if (seen.has(cursor)) {
          trace.push(`#${cursor} loop`);
          break;
        }
        seen.add(cursor);
        const exits = snapshot.edges.filter((next) => next.from === cursor && (next.action === "CloseOverlay" || next.action === "Back" || next.action === "NavigateTo"));
        const primary = mode === "esc"
          ? (exits.find((next) => next.action === "CloseOverlay") || exits.find((next) => next.action === "Back") || null)
          : (exits.find((next) => next.action === "Back") || exits.find((next) => next.action === "CloseOverlay") || null);
        if (!primary) {
          trace.push(`#${cursor} missing`);
          break;
        }
        if (primary.action === "CloseOverlay") {
          trace.push(`#${cursor} CloseOverlay→#${openerFrameId}`);
          cursor = openerFrameId;
          stepsToOrigin = step + 1;
          break;
        }
        if (primary.action === "Back") {
          const target = primary.to > 0 ? primary.to : openerFrameId;
          trace.push(`#${cursor} Back→#${target}`);
          cursor = target;
          if (cursor === openerFrameId) {
            stepsToOrigin = step + 1;
            break;
          }
          continue;
        }
        const target = primary.to > 0 ? primary.to : openerFrameId;
        trace.push(`#${cursor} NavigateTo→#${target}`);
        cursor = target;
        if (cursor === openerFrameId) {
          stepsToOrigin = step + 1;
          break;
        }
      }
      const reachedOrigin = cursor === openerFrameId;
      return {
        summary: reachedOrigin ? trace.join(" | ") : `${trace.join(" | ")} ⚠`,
        broken: !reachedOrigin,
        steps: reachedOrigin ? stepsToOrigin : null,
      };
    };

    const overlayOpenMap = new Map<string, typeof snapshot.edges>();
    for (const edge of snapshot.edges) {
      if (edge.action !== "OpenOverlay" || edge.to <= 0) continue;
      const key = `${edge.from}:${edge.to}`;
      const bucket = overlayOpenMap.get(key) || [];
      bucket.push(edge);
      overlayOpenMap.set(key, bucket);
    }

    for (const [key, openEdges] of overlayOpenMap.entries()) {
      const [frameRaw, overlayRaw] = key.split(":");
      const frameId = Number(frameRaw || 0);
      const overlayId = Number(overlayRaw || 0);
      if (!frameId || !overlayId) continue;
      const frame = frameById.get(frameId);
      const overlay = frameById.get(overlayId);
      if (!frame || !overlay) continue;
      const exits = snapshot.edges.filter((next) => next.from === overlayId && (next.action === "CloseOverlay" || next.action === "Back" || next.action === "NavigateTo"));
      const escapeExits = exits.filter((next) => next.action === "CloseOverlay" || next.action === "Back");
      const escRoute = exits.find((next) => next.action === "CloseOverlay" && !next.conditional)
        || exits.find((next) => next.action === "Back" && !next.conditional)
        || exits.find((next) => next.action === "CloseOverlay")
        || exits.find((next) => next.action === "Back")
        || null;
      const backRoute = exits.find((next) => next.action === "Back" && !next.conditional)
        || exits.find((next) => next.action === "CloseOverlay" && !next.conditional)
        || exits.find((next) => next.action === "Back")
        || exits.find((next) => next.action === "CloseOverlay")
        || null;
      const routeSummary = exits.length > 0
        ? exits.slice(0, 3).map((next) => `${next.action}${next.to > 0 ? `→#${next.to}` : ""}${next.conditional ? "(if)" : ""}`).join(" · ")
        : "No exits";
      const escSim = simulateKeyRoute("esc", frame.id, overlay.id);
      const backSim = simulateKeyRoute("back", frame.id, overlay.id);
      const hasEscRoute = exits.some((next) => next.action === "CloseOverlay" || next.action === "Back");
      const hasBackRoute = exits.some((next) => next.action === "Back");
      const hasUnconditionalEsc = exits.some((next) => (next.action === "CloseOverlay" || next.action === "Back") && !next.conditional);
      const hasUnconditionalBack = exits.some((next) => next.action === "Back" && !next.conditional);
      const conditionalEdges = openEdges.filter((edge) => edge.conditional);
      const conditionalSamples = conditionalEdges.length;
      const conditionalActive = conditionalEdges.filter((edge) => edge.branchActive === true).length;
      let conditionalEscMiss = 0;
      let conditionalBackMiss = 0;
      let conditionalMissSamples = 0;
      for (const branch of conditionalEdges) {
        const availableExits = exits.filter((next) => !next.conditional || next.branchActive === true);
        const escReachable = availableExits.some((next) => next.action === "CloseOverlay" || next.action === "Back");
        const backReachable = availableExits.some((next) => next.action === "Back");
        const missEsc = !escReachable;
        const missBack = !backReachable;
        if (missEsc) conditionalEscMiss += 1;
        if (missBack) conditionalBackMiss += 1;
        if (missEsc || missBack) conditionalMissSamples += 1;
      }
      const conditionalOutcomeSafe = hasUnconditionalEsc && hasUnconditionalBack && !escSim.broken && !backSim.broken && conditionalMissSamples === 0;
      const conditionalSuccess = conditionalSamples > 0 ? (conditionalOutcomeSafe ? conditionalActive : Math.max(0, conditionalActive - conditionalMissSamples)) : 0;
      const conditionalFail = Math.max(0, conditionalSamples - conditionalSuccess);
      const conditionalSummary = conditionalSamples > 0
        ? `Conditional sampler: success ${conditionalSuccess}/${conditionalSamples} · Esc miss ${conditionalEscMiss} · Back miss ${conditionalBackMiss} · active ${conditionalActive}`
        : "Conditional sampler: no conditional open branches";
      rows.push({
        frameId: frame.id,
        frameName: frame.name,
        overlayId: overlay.id,
        overlayName: overlay.name,
        routeSummary,
        escRouteSummary: summarize(escRoute, frame.id),
        backRouteSummary: summarize(backRoute, frame.id),
        escSimSummary: escSim.summary,
        backSimSummary: backSim.summary,
        escSimBroken: escSim.broken,
        backSimBroken: backSim.broken,
        escSteps: escSim.steps,
        backSteps: backSim.steps,
        trapped: escapeExits.length === 0,
        missingEsc: !hasEscRoute,
        missingBack: !hasBackRoute,
        escConditionalOnly: hasEscRoute && !hasUnconditionalEsc,
        backConditionalOnly: hasBackRoute && !hasUnconditionalBack,
        openCount: openEdges.length,
        conditionalSamples,
        conditionalActive,
        conditionalSuccess,
        conditionalFail,
        conditionalEscMiss,
        conditionalBackMiss,
        conditionalMissSamples,
        conditionalSummary,
      });
    }

    rows.sort((a, b) => {
      const scoreA = (a.trapped ? 4 : 0) + (a.missingEsc ? 2 : 0) + (a.missingBack ? 1 : 0) + (a.escConditionalOnly ? 1 : 0) + (a.backConditionalOnly ? 1 : 0) + (a.escSimBroken ? 1 : 0) + (a.backSimBroken ? 1 : 0) + (a.conditionalMissSamples > 0 ? 2 : 0);
      const scoreB = (b.trapped ? 4 : 0) + (b.missingEsc ? 2 : 0) + (b.missingBack ? 1 : 0) + (b.escConditionalOnly ? 1 : 0) + (b.backConditionalOnly ? 1 : 0) + (b.escSimBroken ? 1 : 0) + (b.backSimBroken ? 1 : 0) + (b.conditionalMissSamples > 0 ? 2 : 0);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.frameId - b.frameId;
    });
    return rows;
  }

  function renderEscapeRouteMap() {
    if (!escapeRouteInfo || !escapeRouteList) return;
    const rows = collectEscapeRouteRows(flowMinimapSnapshot || undefined);
    if (rows.length === 0) {
      escapeRouteInfo.textContent = "No OpenOverlay routes in current flow.";
      escapeRouteList.innerHTML = "";
      return;
    }
    const trapCount = rows.filter((row) => row.trapped).length;
    const warnCount = rows.filter((row) => row.missingEsc || row.missingBack || row.escConditionalOnly || row.backConditionalOnly || row.escSimBroken || row.backSimBroken || row.conditionalMissSamples > 0).length;
    const conditionalSampleCount = rows.reduce((acc, row) => acc + row.conditionalSamples, 0);
    const conditionalFailCount = rows.reduce((acc, row) => acc + row.conditionalFail, 0);
    escapeRouteInfo.textContent = `Routes ${rows.length} · Trap ${trapCount} · Missing key route ${warnCount} · Conditional fail ${conditionalFailCount}/${conditionalSampleCount}`;
    escapeRouteList.innerHTML = "";

    for (const row of rows.slice(0, 10)) {
      const warn = row.trapped || row.missingEsc || row.missingBack || row.escConditionalOnly || row.backConditionalOnly || row.escSimBroken || row.backSimBroken || row.conditionalMissSamples > 0;
      const card = document.createElement("div");
      card.style.cssText = `display:flex;flex-direction:column;gap:4px;border:1px solid ${warn ? "rgba(248,113,113,0.45)" : "rgba(148,163,184,0.3)"};border-radius:6px;padding:6px;background:rgba(15,23,42,0.45);`;
      const title = document.createElement("div");
      title.style.cssText = "font-size:10px;color:#e2e8f0;line-height:1.35;";
      title.textContent = `${row.frameName} → ${row.overlayName} · Open ${row.openCount}x`;
      card.appendChild(title);

      const meta = document.createElement("div");
      meta.style.cssText = "font-size:9px;color:#93c5fd;line-height:1.35;";
      meta.textContent = `Esc: ${row.escRouteSummary} | Back: ${row.backRouteSummary}`;
      card.appendChild(meta);

      const summary = document.createElement("div");
      summary.style.cssText = "font-size:9px;color:#cbd5e1;line-height:1.35;";
      summary.textContent = row.routeSummary;
      card.appendChild(summary);

      const simMeta = document.createElement("div");
      simMeta.style.cssText = "font-size:9px;color:#a5b4fc;line-height:1.35;";
      simMeta.textContent = `Esc sim: ${row.escSimSummary}`;
      card.appendChild(simMeta);

      const backSimMeta = document.createElement("div");
      backSimMeta.style.cssText = "font-size:9px;color:#a5b4fc;line-height:1.35;";
      backSimMeta.textContent = `Back sim: ${row.backSimSummary}`;
      card.appendChild(backSimMeta);

      const conditionalMeta = document.createElement("div");
      conditionalMeta.style.cssText = `font-size:9px;line-height:1.35;color:${row.conditionalFail > 0 ? "#fca5a5" : "#86efac"};`;
      conditionalMeta.textContent = row.conditionalSummary;
      card.appendChild(conditionalMeta);

      if (warn) {
        const warnText = document.createElement("div");
        warnText.style.cssText = "font-size:9px;color:#fca5a5;line-height:1.35;";
        const parts = [] as string[];
        if (row.trapped) parts.push("no CloseOverlay/Back exit");
        if (row.missingEsc) parts.push("Esc route missing");
        if (row.missingBack) parts.push("Back route missing");
        if (row.escConditionalOnly) parts.push("Esc route is conditional-only");
        if (row.backConditionalOnly) parts.push("Back route is conditional-only");
        if (row.escSimBroken) parts.push("Esc simulation not returning");
        if (row.backSimBroken) parts.push("Back simulation not returning");
        if (row.conditionalFail > 0) parts.push(`conditional sampler fail ${row.conditionalFail}/${row.conditionalSamples}`);
        if (row.conditionalMissSamples > 0) parts.push(`conditional route miss (Esc ${row.conditionalEscMiss} / Back ${row.conditionalBackMiss})`);
        warnText.textContent = `⚠ ${parts.join(" · ")}`;
        card.appendChild(warnText);
      }

      const btnRow = document.createElement("div");
      btnRow.style.cssText = "display:flex;gap:4px;";
      const jumpBtn = document.createElement("button");
      jumpBtn.className = "prop-btn";
      jumpBtn.textContent = "Jump";
      jumpBtn.style.cssText = "flex:1;font-size:10px;padding:3px 6px;";
      jumpBtn.onclick = () => navigateTo(row.frameId, "Instant", 0, "linear");
      btnRow.appendChild(jumpBtn);

      if (row.trapped || row.missingEsc || row.missingBack || row.escConditionalOnly || row.backConditionalOnly || row.escSimBroken || row.backSimBroken || row.conditionalMissSamples > 0) {
        const fixBtn = document.createElement("button");
        fixBtn.className = "prop-btn";
        fixBtn.textContent = "Fix route";
        fixBtn.style.cssText = "flex:1;font-size:10px;padding:3px 6px;color:#fca5a5;border-color:rgba(248,113,113,0.5);";
        fixBtn.onclick = () => {
          const changed = applyFocusTrapFix({
            frameId: row.frameId,
            frameName: row.frameName,
            overlayId: row.overlayId,
            overlayName: row.overlayName,
            keyboardHotspots: listFocusableHotspots(row.overlayId).length,
            missingClosePath: true,
            noKeyboardHotspots: false,
            leaksOutside: false,
            trappedInLoop: row.trapped,
            shiftTabTrapped: false,
            simulatedTabSteps: 0,
            simulatedShiftTabSteps: 0,
            tabTrace: [],
            shiftTabTrace: [],
          });
          fixBtn.textContent = changed ? "Fixed" : "No-op";
          window.setTimeout(() => { fixBtn.textContent = "Fix route"; }, 1100);
          if (changed) {
            editor.requestRender();
            renderFlowLint();
            renderEscapeRouteMap();
          }
        };
        btnRow.appendChild(fixBtn);
      }
      card.appendChild(btnRow);
      escapeRouteList.appendChild(card);
    }
  }

  function collectFocusReturnRows(snapshotInput?: { nodes: Array<{ id: number; name: string; x: number; y: number; width: number; height: number }>; edges: Array<{ from: number; to: number; action: string; sourceNodeId: number; interactionIndex: number; conditional: boolean; branchActive: boolean | null; conditionSummary: string }>; }) {
    const snapshot = snapshotInput || flowMinimapSnapshot;
    if (!snapshot) return [] as Array<{ frameId: number; frameName: string; overlayId: number; overlayName: string; originNodeIds: number[]; originLabel: string; closeCount: number; closeOverlayCount: number; backCount: number; fallbackNodeId: number | null; fallbackLabel: string; returnNodeId: number | null; returnLabel: string; confidenceScore: number; confidenceLevel: "high" | "medium" | "low"; lowConfidence: boolean; confidenceReasons: string[]; timeline: string[]; }>;
    const frameById = new Map(snapshot.nodes.map((n) => [n.id, n]));
    const openerMap = new Map<string, Set<number>>();

    for (const edge of snapshot.edges) {
      if (edge.action !== "OpenOverlay" || edge.to <= 0) continue;
      const key = `${edge.from}:${edge.to}`;
      const bucket = openerMap.get(key) || new Set<number>();
      const sourceNodeId = Number(edge.sourceNodeId || 0);
      if (sourceNodeId > 0) bucket.add(sourceNodeId);
      openerMap.set(key, bucket);
    }

    const rows: Array<{ frameId: number; frameName: string; overlayId: number; overlayName: string; originNodeIds: number[]; originLabel: string; closeCount: number; closeOverlayCount: number; backCount: number; fallbackNodeId: number | null; fallbackLabel: string; returnNodeId: number | null; returnLabel: string; confidenceScore: number; confidenceLevel: "high" | "medium" | "low"; lowConfidence: boolean; confidenceReasons: string[]; timeline: string[]; }> = [];
    for (const [key, originSet] of openerMap.entries()) {
      const [frameRaw, overlayRaw] = key.split(":");
      const frameId = Number(frameRaw || 0);
      const overlayId = Number(overlayRaw || 0);
      if (!frameId || !overlayId) continue;
      const frame = frameById.get(frameId);
      const overlay = frameById.get(overlayId);
      if (!frame || !overlay) continue;

      const originNodeIds = Array.from(originSet.values()).filter((id) => id > 0);
      const originLabel = originNodeIds.length > 0
        ? originNodeIds.slice(0, 2).map((id) => `#${id}`).join(", ") + (originNodeIds.length > 2 ? ` +${originNodeIds.length - 2}` : "")
        : "missing opener hotspot";
      const closeOverlayCount = snapshot.edges.filter((edge) => edge.from === overlayId && edge.action === "CloseOverlay").length;
      const backCount = snapshot.edges.filter((edge) => edge.from === overlayId && edge.action === "Back").length;
      const closeCount = closeOverlayCount + backCount;
      const fallback = listFocusableHotspots(frameId).find((item) => item.nodeId > 0) || null;
      const fallbackNodeId = fallback ? Number(fallback.nodeId || 0) : null;
      const fallbackLabel = fallback
        ? `${String(fallback.node?.name || `Node #${fallbackNodeId}`)} (#${fallbackNodeId})`
        : `${frame.name} frame root`;
      const returnNodeId = originNodeIds[0] || (fallbackNodeId && fallbackNodeId > 0 ? fallbackNodeId : null);
      const returnLabel = returnNodeId && originNodeIds.includes(returnNodeId)
        ? `origin hotspot #${returnNodeId}`
        : `fallback ${fallbackLabel}`;

      const frameFocusableSet = new Set(listFocusableHotspots(frameId).map((item) => Number(item.nodeId || 0)).filter((id) => id > 0));
      const confidenceReasons: string[] = [];
      let confidenceScore = 20;
      if (originNodeIds.length > 0) {
        confidenceScore += 34;
        confidenceReasons.push("opener hotspot detected");
      } else {
        confidenceReasons.push("opener hotspot missing");
      }
      if (closeOverlayCount > 0) {
        confidenceScore += 12;
        confidenceReasons.push(`CloseOverlay path ${closeOverlayCount}개`);
      } else {
        confidenceScore -= 8;
        confidenceReasons.push("CloseOverlay path missing");
      }
      if (backCount > 0) {
        confidenceScore += 12;
        confidenceReasons.push(`Back path ${backCount}개`);
      } else {
        confidenceScore -= 8;
        confidenceReasons.push("Back path missing");
      }
      if (originNodeIds.length === 1) {
        confidenceScore += 14;
        confidenceReasons.push("single opener target");
      } else if (originNodeIds.length > 1) {
        confidenceScore += 6;
        confidenceReasons.push(`multiple opener targets (${originNodeIds.length})`);
      }
      if (returnNodeId && frameFocusableSet.has(returnNodeId)) {
        confidenceScore += 12;
        confidenceReasons.push("return target is keyboard-focusable");
      } else if (returnNodeId) {
        confidenceScore -= 8;
        confidenceReasons.push("return target not keyboard-focusable");
      } else {
        confidenceScore -= 10;
        confidenceReasons.push("return target unresolved");
      }
      if (closeCount >= 4) {
        confidenceScore -= 6;
        confidenceReasons.push("many close/back paths can be ambiguous");
      }
      const normalizedScore = Math.max(0, Math.min(100, Math.round(confidenceScore)));
      const confidenceLevel: "high" | "medium" | "low" = normalizedScore >= 75 ? "high" : normalizedScore >= 55 ? "medium" : "low";
      const lowConfidence = confidenceLevel === "low";

      const timeline = [
        `1) OpenOverlay: ${frame.name} (#${frameId}) → ${overlay.name} (#${overlayId})`,
        `2) Overlay active: ${overlay.name}`,
        closeCount > 0
          ? `3) Close/Back ${closeCount}회 감지`
          : "3) Close/Back 없음 (manual return 필요)",
        `4) Return target: ${returnLabel}`,
        `5) Confidence: ${normalizedScore}% (${confidenceLevel})`,
      ];

      rows.push({
        frameId,
        frameName: frame.name,
        overlayId,
        overlayName: overlay.name,
        originNodeIds,
        originLabel,
        closeCount,
        closeOverlayCount,
        backCount,
        fallbackNodeId: fallbackNodeId && fallbackNodeId > 0 ? fallbackNodeId : null,
        fallbackLabel,
        returnNodeId,
        returnLabel,
        confidenceScore: normalizedScore,
        confidenceLevel,
        lowConfidence,
        confidenceReasons,
        timeline,
      });
    }

    rows.sort((a, b) => {
      const scoreA = (a.lowConfidence ? 3 : 0) + (a.closeCount === 0 ? 2 : 0) + (a.originNodeIds.length === 0 ? 1 : 0);
      const scoreB = (b.lowConfidence ? 3 : 0) + (b.closeCount === 0 ? 2 : 0) + (b.originNodeIds.length === 0 ? 1 : 0);
      if (scoreA !== scoreB) return scoreB - scoreA;
      if (a.confidenceScore !== b.confidenceScore) return a.confidenceScore - b.confidenceScore;
      return a.frameId - b.frameId;
    });
    return rows;
  }

  function renderFocusReturnMap() {
    if (!focusReturnInfo || !focusReturnList) return;
    const rows = collectFocusReturnRows(flowMinimapSnapshot || undefined);
    if (rows.length === 0) {
      focusReturnInfo.textContent = "No OpenOverlay origin candidates in current flow.";
      focusReturnList.innerHTML = "";
      return;
    }
    const missingCount = rows.filter((row) => row.originNodeIds.length === 0 || row.closeCount === 0).length;
    const lowConfidenceCount = rows.filter((row) => row.lowConfidence).length;
    focusReturnInfo.textContent = `Routes ${rows.length} · Missing return map ${missingCount} · Low confidence ${lowConfidenceCount}`;
    focusReturnList.innerHTML = "";

    for (const row of rows.slice(0, 10)) {
      const missing = row.originNodeIds.length === 0 || row.closeCount === 0;
      const warn = missing || row.lowConfidence;
      const card = document.createElement("div");
      card.style.cssText = `display:flex;flex-direction:column;gap:4px;border:1px solid ${warn ? "rgba(251,146,60,0.45)" : "rgba(148,163,184,0.3)"};border-radius:6px;padding:6px;background:rgba(15,23,42,0.45);`;
      const title = document.createElement("div");
      title.style.cssText = "font-size:10px;color:#e2e8f0;line-height:1.35;";
      title.textContent = `${row.frameName} → ${row.overlayName}`;
      card.appendChild(title);

      const originMeta = document.createElement("div");
      originMeta.style.cssText = "font-size:9px;color:#93c5fd;line-height:1.35;";
      originMeta.textContent = `Origin hotspot: ${row.originLabel}`;
      card.appendChild(originMeta);

      const returnMeta = document.createElement("div");
      returnMeta.style.cssText = `font-size:9px;line-height:1.35;color:${missing ? "#fdba74" : "#86efac"};`;
      returnMeta.textContent = row.closeCount > 0
        ? `CloseOverlay ${row.closeOverlayCount} · Back ${row.backCount} · return target: ${row.returnLabel}`
        : `Close/Back path 없음 · fallback 권장: ${row.fallbackLabel}`;
      card.appendChild(returnMeta);

      const meterWrap = document.createElement("div");
      meterWrap.style.cssText = "display:flex;flex-direction:column;gap:3px;";
      const meterMeta = document.createElement("div");
      meterMeta.style.cssText = `font-size:9px;line-height:1.35;color:${row.lowConfidence ? "#fca5a5" : row.confidenceLevel === "high" ? "#86efac" : "#fde68a"};`;
      meterMeta.textContent = `Return confidence ${row.confidenceScore}% (${row.confidenceLevel})`;
      meterWrap.appendChild(meterMeta);
      const meterBar = document.createElement("div");
      meterBar.style.cssText = "height:4px;border-radius:999px;background:rgba(148,163,184,0.3);overflow:hidden;";
      const meterFill = document.createElement("div");
      meterFill.style.cssText = `height:100%;width:${row.confidenceScore}%;background:${row.confidenceLevel === "high" ? "#22c55e" : row.confidenceLevel === "medium" ? "#f59e0b" : "#ef4444"};`;
      meterBar.appendChild(meterFill);
      meterWrap.appendChild(meterBar);
      card.appendChild(meterWrap);

      const timelineMeta = document.createElement("div");
      timelineMeta.style.cssText = "font-size:9px;color:#cbd5e1;line-height:1.35;white-space:pre-line;";
      timelineMeta.textContent = row.timeline.join("\n");
      card.appendChild(timelineMeta);

      if (row.originNodeIds.length === 0) {
        const note = document.createElement("div");
        note.style.cssText = "font-size:9px;color:#fdba74;line-height:1.35;";
        note.textContent = `Opener가 누락됨. fallback 추천: ${row.fallbackLabel}`;
        card.appendChild(note);
      }

      if (row.lowConfidence) {
        const lowNote = document.createElement("div");
        lowNote.style.cssText = "font-size:9px;color:#fca5a5;line-height:1.35;";
        lowNote.textContent = `⚠ Low-confidence return target — ${row.confidenceReasons.slice(0, 3).join(" · ")}`;
        card.appendChild(lowNote);
      }

      const btnRow = document.createElement("div");
      btnRow.style.cssText = "display:flex;gap:4px;";
      const jumpFrameBtn = document.createElement("button");
      jumpFrameBtn.className = "prop-btn";
      jumpFrameBtn.textContent = "Jump frame";
      jumpFrameBtn.style.cssText = "flex:1;font-size:10px;padding:3px 6px;";
      jumpFrameBtn.onclick = () => navigateTo(row.frameId, "Instant", 0, "linear");
      btnRow.appendChild(jumpFrameBtn);
      const jumpOverlayBtn = document.createElement("button");
      jumpOverlayBtn.className = "prop-btn";
      jumpOverlayBtn.textContent = "Jump overlay";
      jumpOverlayBtn.style.cssText = "flex:1;font-size:10px;padding:3px 6px;";
      jumpOverlayBtn.onclick = () => navigateTo(row.overlayId, "Instant", 0, "linear");
      btnRow.appendChild(jumpOverlayBtn);
      const replayBtn = document.createElement("button");
      replayBtn.className = "prop-btn";
      replayBtn.textContent = "Replay";
      replayBtn.style.cssText = "flex:1;font-size:10px;padding:3px 6px;";
      replayBtn.onclick = () => {
        navigateTo(row.frameId, "Instant", 0, "linear");
        let step = 0;
        const steps = row.timeline;
        returnMeta.textContent = steps[0] || "";
        const timer = window.setInterval(() => {
          step += 1;
          if (step >= steps.length) {
            window.clearInterval(timer);
            returnMeta.textContent = row.closeCount > 0
              ? `CloseOverlay ${row.closeOverlayCount} · Back ${row.backCount} · return target: ${row.returnLabel}`
              : `Close/Back path 없음 · fallback 권장: ${row.fallbackLabel}`;
            if (row.returnNodeId && row.returnNodeId > 0) {
              try { editor.setSelection([row.returnNodeId]); } catch {}
            }
            return;
          }
          returnMeta.textContent = steps[step] || "";
          if (step === 1) navigateTo(row.overlayId, "Instant", 0, "linear");
          if (step === steps.length - 1) navigateTo(row.frameId, "Instant", 0, "linear");
        }, 380);
      };
      btnRow.appendChild(replayBtn);
      card.appendChild(btnRow);

      focusReturnList.appendChild(card);
    }
  }

  function resolveFlowLintScope(value?: string | null): FlowLintRunScope {
    if (value === "selection" || value === "page" || value === "flow") return value;
    return "flow";
  }

  function renderFlowLint() {
    if (!flowLintInfo || !flowLintList || !flowLintRiskInfo || !flowLintRiskList) return;
    const snapshot = flowMinimapSnapshot;
    if (!snapshot || snapshot.nodes.length === 0) {
      flowLintInfo.textContent = "No frames to lint";
      flowLintRiskInfo.textContent = "Overlay risk scoreboard unavailable";
      flowLintRiskList.innerHTML = "";
      flowLintList.innerHTML = "";
      flowLintSnapshot = { startFrameId: null, issues: [] };
      flowLintRenderedIssues = [];
      flowLintNavIndex = -1;
      renderFocusTrapSimulator();
      renderOverlayStackInspector();
      renderEscapeRouteMap();
      renderFocusReturnMap();
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

    const lintScope = resolveFlowLintScope(flowLintScopeSel?.value);
    if (flowLintScopeSel) flowLintScopeSel.value = lintScope;
    const activePageId = Number(selectedFlow?.page_id || editor.engine.get_active_page_id?.() || 0);
    const pageFrameIds = new Set<number>(listFramesForPage(activePageId).map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0));
    let selectionFrameIds = new Set<number>();
    try {
      const raw = editor.engine.get_selection_json();
      const parsed = JSON.parse(raw || "[]");
      if (Array.isArray(parsed)) {
        selectionFrameIds = new Set<number>(parsed.map((id) => Number(id)).filter((id) => frameById.has(id)));
      }
    } catch {}
    if (selectionFrameIds.size === 0 && currentFrameId && frameById.has(currentFrameId)) {
      selectionFrameIds = new Set<number>([currentFrameId]);
    }

    const scopedFrameIds = new Set<number>();
    for (const node of snapshot.nodes) {
      if (lintScope === "flow") {
        if (visited.has(node.id)) scopedFrameIds.add(node.id);
      } else if (lintScope === "page") {
        if (pageFrameIds.size === 0 || pageFrameIds.has(node.id)) scopedFrameIds.add(node.id);
      } else if (selectionFrameIds.has(node.id)) {
        scopedFrameIds.add(node.id);
      }
    }

    const shouldInspectFrame = (frameId: number) => scopedFrameIds.has(frameId);

    const issues: FlowLintIssue[] = [];
    const overlayGuardPreset = resolveOverlayGuardPreset(overlayGuardPresetId);
    if (flowLintPresetSel) flowLintPresetSel.value = overlayGuardPreset.id;
    if (flowLintPresetInfo) flowLintPresetInfo.textContent = overlayGuardPreset.note;

    const backByFrame = new Map<number, number>();
    const overlaysOpenByFrame = new Map<number, number>();
    const overlaysCloseByFrame = new Map<number, number>();
    const overlayTargetsByFrame = new Map<number, Set<number>>();
    const interactionRowsByFrame = new Map<number, any[]>();
    let allInteractionRows: any[] = [];
    try {
      const allInter: any[] = JSON.parse(editor.engine.get_all_interactions() || "[]") || [];
      allInteractionRows = allInter;
      for (const row of allInter) {
        const from = Number(row?.id || 0);
        const interactions: any[] = Array.isArray(row?.interactions) ? row.interactions : [];
        interactionRowsByFrame.set(from, interactions);
        if (!shouldInspectFrame(from)) continue;
        for (const inter of interactions) {
          const action = String(inter?.action || "");
          if (action === "Back") backByFrame.set(from, (backByFrame.get(from) || 0) + 1);
          if (action === "OpenOverlay") {
            overlaysOpenByFrame.set(from, (overlaysOpenByFrame.get(from) || 0) + 1);
            const targetOverlayId = Number(inter?.target_node_id || 0);
            if (targetOverlayId > 0) {
              const bucket = overlayTargetsByFrame.get(from) || new Set<number>();
              bucket.add(targetOverlayId);
              overlayTargetsByFrame.set(from, bucket);
            }
          }
          if (action === "CloseOverlay") overlaysCloseByFrame.set(from, (overlaysCloseByFrame.get(from) || 0) + 1);
        }
      }
    } catch {}

    const rowNodeCache = new Map<number, any>();
    const getNodeForRow = (row: any) => {
      const nodeId = Number(row?.id || 0);
      if (!nodeId) return null;
      if (rowNodeCache.has(nodeId)) return rowNodeCache.get(nodeId);
      try {
        const rawNode = editor.engine.get_node_json(BigInt(nodeId));
        const node = rawNode ? JSON.parse(rawNode) : null;
        rowNodeCache.set(nodeId, node);
        return node;
      } catch {
        rowNodeCache.set(nodeId, null);
        return null;
      }
    };


    for (const node of snapshot.nodes) {
      if (!shouldInspectFrame(node.id)) continue;
      const outs = (adjacency.get(node.id) || []).filter((to) => shouldInspectFrame(to));
      if (lintScope === "flow" && !visited.has(node.id)) {
        issues.push({ type: "unreachable", frameId: node.id, frameName: node.name, detail: "Not reachable from current start frame" });
      } else {
        const hasBack = (backByFrame.get(node.id) || 0) > 0;
        const hasClose = (overlaysCloseByFrame.get(node.id) || 0) > 0;
        if (outs.length === 0 && !hasBack && !hasClose) {
          issues.push({ type: "dead-end", frameId: node.id, frameName: node.name, detail: "No outbound NavigateTo/OpenOverlay/Back/CloseOverlay path" });
        }
      }
    }

    const cycleSeen = new Set<number>();
    const cycleStack = new Set<number>();
    const cycleRoots = new Set<number>();
    const dfsCycle = (id: number) => {
      cycleSeen.add(id);
      cycleStack.add(id);
      for (const to of adjacency.get(id) || []) {
        if (!shouldInspectFrame(to)) continue;
        if (!cycleSeen.has(to)) dfsCycle(to);
        else if (cycleStack.has(to)) cycleRoots.add(to);
      }
      cycleStack.delete(id);
    };
    if (shouldInspectFrame(startFrameId)) dfsCycle(startFrameId);
    for (const cycleId of cycleRoots) {
      const n = frameById.get(cycleId);
      if (!n) continue;
      issues.push({ type: "cycle", frameId: cycleId, frameName: n.name, detail: "Cycle detected in reachable flow graph" });
    }

    // Tarjan SCC: detect strongly-connected "trap" loops with no exit edge.
    const indexMap = new Map<number, number>();
    const lowMap = new Map<number, number>();
    const onStack = new Set<number>();
    const tarjanStack: number[] = [];
    const sccs: number[][] = [];
    let index = 0;
    const strongConnect = (v: number) => {
      indexMap.set(v, index);
      lowMap.set(v, index);
      index += 1;
      tarjanStack.push(v);
      onStack.add(v);

      for (const w of adjacency.get(v) || []) {
        if (!shouldInspectFrame(w)) continue;
        if (!indexMap.has(w)) {
          strongConnect(w);
          lowMap.set(v, Math.min(lowMap.get(v)!, lowMap.get(w)!));
        } else if (onStack.has(w)) {
          lowMap.set(v, Math.min(lowMap.get(v)!, indexMap.get(w)!));
        }
      }

      if (lowMap.get(v) === indexMap.get(v)) {
        const component: number[] = [];
        while (tarjanStack.length > 0) {
          const w = tarjanStack.pop()!;
          onStack.delete(w);
          component.push(w);
          if (w === v) break;
        }
        sccs.push(component);
      }
    };

    for (const id of scopedFrameIds) {
      if (!indexMap.has(id)) strongConnect(id);
    }

    for (const component of sccs) {
      if (component.length <= 1) {
        const only = component[0];
        if (!only) continue;
        const selfLoop = (adjacency.get(only) || []).includes(only);
        if (!selfLoop) continue;
      }
      const set = new Set(component);
      let hasExternalExit = false;
      for (const from of component) {
        const outs = adjacency.get(from) || [];
        if (outs.some((to) => !set.has(to))) {
          hasExternalExit = true;
          break;
        }
      }
      if (!hasExternalExit) {
        const lead = component[0];
        const node = frameById.get(lead);
        if (node) {
          issues.push({
            type: "cycle-trap",
            frameId: node.id,
            frameName: node.name,
            detail: `Loop group(${component.length}) has no exit to outside frames`,
          });
        }
      }
    }

    const overlayDepthBudgetRows = collectOverlayDepthBudgetRows(snapshot, FLOW_OVERLAY_DEPTH_BUDGET);
    const overlayDepthBudgetByFrame = new Map<number, { maxDepth: number; offenders: number[]; deepestOffenderId: number | null; pathSample: number[] }>();
    for (const row of overlayDepthBudgetRows) {
      overlayDepthBudgetByFrame.set(row.frameId, {
        maxDepth: row.maxDepth,
        offenders: row.offenders,
        deepestOffenderId: row.deepestOffenderId,
        pathSample: row.pathSample,
      });
    }

    for (const node of snapshot.nodes) {
      if (!shouldInspectFrame(node.id)) continue;
      const openCount = overlaysOpenByFrame.get(node.id) || 0;
      const closeCount = overlaysCloseByFrame.get(node.id) || 0;
      if (openCount > 0 && closeCount === 0) {
        issues.push({ type: "overlay-leak", frameId: node.id, frameName: node.name, detail: `Opens overlay ${openCount}x but never closes it` });
      } else if (closeCount > 0 && openCount === 0) {
        issues.push({ type: "orphan-close", frameId: node.id, frameName: node.name, detail: `CloseOverlay ${closeCount}x without local OpenOverlay trigger` });
      }

      const depthBudget = overlayDepthBudgetByFrame.get(node.id);
      if (depthBudget && overlayGuardPreset.includeDepthBudget) {
        const offenderLabel = depthBudget.offenders.slice(0, 3).map((id) => `#${id}`).join(", ");
        const pathLabel = depthBudget.pathSample.length > 0 ? depthBudget.pathSample.map((id) => `#${id}`).join(" → ") : "";
        const rewritePlan = buildOverlayDepthRewritePlan(snapshot, node.id, {
          maxDepth: depthBudget.maxDepth,
          offenders: depthBudget.offenders,
          pathSample: depthBudget.pathSample,
        }, FLOW_OVERLAY_DEPTH_BUDGET);
        issues.push({
          type: "overlay-depth-budget",
          frameId: node.id,
          frameName: node.name,
          overlayId: depthBudget.deepestOffenderId || depthBudget.offenders[0],
          overlayPath: depthBudget.pathSample,
          overlayOffenders: depthBudget.offenders,
          overlayBudget: FLOW_OVERLAY_DEPTH_BUDGET,
          overlayRewritePlan: rewritePlan.lines,
          overlayImpactNodeCount: rewritePlan.impactNodeCount,
          detail: `Overlay depth ${depthBudget.maxDepth} exceeds budget(${FLOW_OVERLAY_DEPTH_BUDGET})${offenderLabel ? ` · flatten candidate ${offenderLabel}` : ""}${pathLabel ? ` · path ${pathLabel}` : ""}${rewritePlan.impactNodeCount > 0 ? ` · est impact ${rewritePlan.impactNodeCount} node(s)` : ""}`,
        });
      }

      const overlayTargets = overlayTargetsByFrame.get(node.id);
      if (overlayTargets && overlayTargets.size > 0) {
        if (overlayGuardPreset.includeScrollLeak) {
          for (const overlayId of overlayTargets) {
            const lockKey = makeScrollLockRegionKey(node.id, overlayId);
            if (!scrollLockRegions[lockKey]) {
              issues.push({
                type: "scroll-leak",
                frameId: node.id,
                frameName: node.name,
                detail: `Overlay #${overlayId} opens without scroll lock region`,
                overlayId,
              });
            }
          }
        }

        if (overlayGuardPreset.id !== "legacy") {
          const keyRouteRows = collectEscapeRouteRows(snapshot).filter((row) => row.frameId === node.id);
          for (const route of keyRouteRows) {
            const hasRequiredFail = route.trapped || route.missingEsc || route.missingBack;
            const hasConditionalFail = route.escConditionalOnly || route.backConditionalOnly || route.conditionalMissSamples > 0;
            const hasSimFail = route.escSimBroken || route.backSimBroken;
            const escSteps = route.escSteps;
            const backSteps = route.backSteps;
            const maxSteps = Math.max(escSteps || 0, backSteps || 0);
            const hasLatencyFail = maxSteps > FLOW_OVERLAY_EXIT_LATENCY_BUDGET;
            if (!hasRequiredFail
              && !(overlayGuardPreset.detectConditionalOnly && hasConditionalFail)
              && !(overlayGuardPreset.detectSimulationDrift && hasSimFail)
              && !hasLatencyFail) {
              continue;
            }
            const parts: string[] = [];
            if (route.trapped) parts.push("no close/back exit");
            if (route.missingEsc) parts.push("Esc route missing");
            if (route.missingBack) parts.push("Back route missing");
            if (overlayGuardPreset.detectConditionalOnly && route.escConditionalOnly) parts.push("Esc conditional-only");
            if (overlayGuardPreset.detectConditionalOnly && route.backConditionalOnly) parts.push("Back conditional-only");
            if (overlayGuardPreset.detectConditionalOnly && route.conditionalMissSamples > 0) parts.push(`conditional route miss Esc ${route.conditionalEscMiss}/Back ${route.conditionalBackMiss}`);
            if (overlayGuardPreset.detectSimulationDrift && route.escSimBroken) parts.push("Esc sim diverges");
            if (overlayGuardPreset.detectSimulationDrift && route.backSimBroken) parts.push("Back sim diverges");
            if (hasRequiredFail
              || (overlayGuardPreset.detectConditionalOnly && hasConditionalFail)
              || (overlayGuardPreset.detectSimulationDrift && hasSimFail)) {
              issues.push({
                type: "overlay-key-route",
                frameId: node.id,
                frameName: node.name,
                overlayId: route.overlayId,
                detail: `${route.overlayName}: ${parts.join(" + ")}`,
              });
            }

            if (hasLatencyFail) {
              issues.push({
                type: "overlay-exit-latency",
                frameId: node.id,
                frameName: node.name,
                overlayId: route.overlayId,
                detail: `${route.overlayName}: Esc ${escSteps ?? "-"} step(s) / Back ${backSteps ?? "-"} step(s) exceed latency budget(${FLOW_OVERLAY_EXIT_LATENCY_BUDGET})`,
              });
            }
          }
        }
      }
    }

    // Accessibility audit (prototype-specific): missing labels, keyboard focus gaps, low text contrast.
    const defaultBg = { r: 255, g: 255, b: 255 };
    const frameFillCache = new Map<number, { r: number; g: number; b: number }>();
    const getFrameBg = (frameId: number) => {
      if (frameFillCache.has(frameId)) return frameFillCache.get(frameId)!;
      let out = defaultBg;
      try {
        const raw = editor.engine.get_node_json(BigInt(frameId));
        if (raw) {
          const frame = JSON.parse(raw);
          const fills = Array.isArray(frame?.fills) ? frame.fills : [];
          const firstVisible = fills.find((f: any) => f && f.visible !== false) || fills[0];
          const parsed = parseColorToRgb(firstVisible?.color || frame?.fill?.color);
          if (parsed) out = parsed;
        }
      } catch {}
      frameFillCache.set(frameId, out);
      return out;
    };

    const isAggressiveMotionEasing = (raw: string) => {
      const easing = String(raw || "").toLowerCase();
      return easing.includes("elastic") || easing.includes("bounce") || easing.includes("back") || easing.includes("spring");
    };

    const focusTrapIssuesByFrame = new Map<number, FocusTrapSimIssue[]>();
    for (const trapIssue of collectFocusTrapSimulationIssues(snapshot)) {
      const bucket = focusTrapIssuesByFrame.get(trapIssue.frameId) || [];
      bucket.push(trapIssue);
      focusTrapIssuesByFrame.set(trapIssue.frameId, bucket);
    }

    for (const frame of snapshot.nodes) {
      if (!shouldInspectFrame(frame.id)) continue;
      const frameNodesWithKeyboardInteractions: Array<{ nodeId: number; count: number; missingLabels: number }> = [];
      let frameAnyInteractionCount = 0;
      let keyboardFocusableCount = 0;
      let missingLabelCount = 0;
      let motionIssueCount = 0;
      const overlayTargets = new Set<number>();
      for (const row of allInteractionRows) {
        const nodeId = Number(row?.id || 0);
        if (!nodeId) continue;
        let rawNode = "";
        try { rawNode = editor.engine.get_node_json(BigInt(nodeId)) || ""; } catch { rawNode = ""; }
        if (!rawNode) continue;
        let node: any = null;
        try { node = JSON.parse(rawNode); } catch { node = null; }
        if (!node) continue;
        const nx = Number(node?.x || 0);
        const ny = Number(node?.y || 0);
        const nw = Number(node?.width || 0);
        const nh = Number(node?.height || 0);
        const inFrame = nx >= frame.x && ny >= frame.y && (nx + nw) <= (frame.x + frame.width) && (ny + nh) <= (frame.y + frame.height);
        if (!inFrame) continue;

        const interactions: any[] = Array.isArray(row?.interactions) ? row.interactions : [];
        if (interactions.length > 0) frameAnyInteractionCount += 1;
        let localCount = 0;
        let localMissingLabel = 0;
        for (const inter of interactions) {
          const trigger = String(inter?.trigger || "");
          const action = String(inter?.action || "");
          const transition = String(inter?.transition || "Instant");
          const easing = String(inter?.easing || "ease_in_out");
          const duration = Number(inter?.transition_duration_ms || 0);
          if (action === "OpenOverlay") {
            const targetOverlayId = Number(inter?.target_node_id || 0);
            if (targetOverlayId > 0) overlayTargets.add(targetOverlayId);
          }
          const isAnimated = transition !== "Instant" && transition !== "None";
          if (isAnimated) {
            const longDuration = duration >= 900;
            const aggressiveCombo = duration >= 480 && isAggressiveMotionEasing(easing);
            if (longDuration || aggressiveCombo) motionIssueCount += 1;
          }
          const isKeyboardRelevant = trigger === "OnClick" || trigger === "OnPress";
          if (!isKeyboardRelevant) continue;
          keyboardFocusableCount += 1;
          localCount += 1;
          const a11yLabel = String(inter?.accessibility_label || "").trim();
          if (!a11yLabel) {
            missingLabelCount += 1;
            localMissingLabel += 1;
          }
        }
        if (localCount > 0) frameNodesWithKeyboardInteractions.push({ nodeId, count: localCount, missingLabels: localMissingLabel });
      }
      if (missingLabelCount > 0) {
        issues.push({
          type: "a11y-missing-label",
          frameId: frame.id,
          frameName: frame.name,
          detail: `${missingLabelCount} hotspot(s) missing accessibility label`,
        });
      }
      const duplicatedFocusableNodes = frameNodesWithKeyboardInteractions.filter((r) => r.count > 1).length;
      if (frameAnyInteractionCount > 0 && keyboardFocusableCount === 0) {
        issues.push({
          type: "a11y-focus-gap",
          frameId: frame.id,
          frameName: frame.name,
          detail: "No keyboard-focusable hotspot (OnClick/OnPress) in this frame",
        });
      } else if (duplicatedFocusableNodes > 0) {
        issues.push({
          type: "a11y-focus-gap",
          frameId: frame.id,
          frameName: frame.name,
          detail: `${duplicatedFocusableNodes} node(s) have multiple keyboard hotspots; tab order can feel broken`,
        });
      }

      if (overlayTargets.size > 0) {
        const trapIssues = (focusTrapIssuesByFrame.get(frame.id) || []).filter((row) => overlayTargets.has(row.overlayId));
        for (const trapIssue of trapIssues) {
          const parts: string[] = [];
          if (trapIssue.noKeyboardHotspots) parts.push("no keyboard hotspots");
          if (trapIssue.missingClosePath) parts.push("missing close path");
          if (trapIssue.leaksOutside) parts.push("escapes outside");
          if (trapIssue.trappedInLoop) parts.push("tab loop without close");
          if (trapIssue.shiftTabTrapped) parts.push("shift+tab loop without close");
          issues.push({
            type: "a11y-focus-trap",
            frameId: frame.id,
            frameName: frame.name,
            overlayId: trapIssue.overlayId,
            detail: `${trapIssue.overlayName}: ${parts.join(" + ") || "focus-trap risk"}`,
          });
        }
      }

      let lowContrastCount = 0;
      const bg = getFrameBg(frame.id);
      for (const n of snapshot.nodes) {
        if (!shouldInspectFrame(n.id)) continue;
        const inFrame = n.x >= frame.x && n.y >= frame.y && (n.x + n.width) <= (frame.x + frame.width) && (n.y + n.height) <= (frame.y + frame.height);
        if (!inFrame) continue;
        let rawNode: any = null;
        try {
          const raw = editor.engine.get_node_json(BigInt(n.id));
          if (!raw) continue;
          rawNode = JSON.parse(raw);
        } catch { continue; }
        const kind = String(rawNode?.kind || "");
        if (kind !== "Text") continue;
        const fills = Array.isArray(rawNode?.fills) ? rawNode.fills : [];
        const firstVisible = fills.find((f: any) => f && f.visible !== false) || fills[0];
        const fg = parseColorToRgb(firstVisible?.color || rawNode?.fill?.color || "");
        if (!fg) continue;
        const ratio = contrastRatio(fg, bg);
        if (ratio < 4.5) lowContrastCount += 1;
      }
      if (lowContrastCount > 0) {
        issues.push({
          type: "a11y-low-contrast",
          frameId: frame.id,
          frameName: frame.name,
          detail: `${lowContrastCount} text node(s) below 4.5:1 contrast`,
        });
      }
      if (motionIssueCount > 0) {
        issues.push({
          type: "a11y-motion",
          frameId: frame.id,
          frameName: frame.name,
          detail: `${motionIssueCount} interaction(s) exceed motion guardrail (≥900ms or aggressive easing + long duration)`,
        });
      }
    }

    flowLintSnapshot = { startFrameId, issues };

    const deadEndCount = issues.filter((i) => i.type === "dead-end").length;
    const unreachableCount = issues.filter((i) => i.type === "unreachable").length;
    const cycleCount = issues.filter((i) => i.type === "cycle").length;
    const cycleTrapCount = issues.filter((i) => i.type === "cycle-trap").length;
    const overlayLeakCount = issues.filter((i) => i.type === "overlay-leak").length;
    const orphanCloseCount = issues.filter((i) => i.type === "orphan-close").length;
    const overlayKeyRouteCount = issues.filter((i) => i.type === "overlay-key-route").length;
    const overlayDepthBudgetCount = issues.filter((i) => i.type === "overlay-depth-budget").length;
    const overlayExitLatencyCount = issues.filter((i) => i.type === "overlay-exit-latency").length;
    const scrollLeakCount = issues.filter((i) => i.type === "scroll-leak").length;
    const missingLabelCount = issues.filter((i) => i.type === "a11y-missing-label").length;
    const focusGapCount = issues.filter((i) => i.type === "a11y-focus-gap").length;
    const focusTrapCount = issues.filter((i) => i.type === "a11y-focus-trap").length;
    const lowContrastCount = issues.filter((i) => i.type === "a11y-low-contrast").length;
    const motionGuardrailCount = issues.filter((i) => i.type === "a11y-motion").length;
    const scopeLabel = lintScope === "selection" ? "Selection" : lintScope === "page" ? "Page" : "Flow";
    flowLintInfo.textContent = `Scope ${scopeLabel} · Preset ${overlayGuardPreset.label} · Start #${startFrameId} · Dead-end ${deadEndCount} · Unreachable ${unreachableCount} · Cycles ${cycleCount}/${cycleTrapCount} · Overlay ${overlayLeakCount}/${overlayKeyRouteCount}/${overlayDepthBudgetCount}/${overlayExitLatencyCount}/${orphanCloseCount}/Scroll ${scrollLeakCount} · A11y ${missingLabelCount}/${focusGapCount}/${focusTrapCount}/${lowContrastCount}/${motionGuardrailCount}`;

    flowLintList.innerHTML = "";
    flowLintRiskList.innerHTML = "";
    if (issues.length === 0) {
      flowLintRiskInfo.textContent = "Overlay risk scoreboard: no overlay route risks.";
      const ok = document.createElement("div");
      ok.style.cssText = "font-size:10px;color:#86efac;";
      ok.textContent = "No issues found.";
      flowLintList.appendChild(ok);
      if (flowLintBatchRunBtn) {
        flowLintBatchRunBtn.disabled = true;
        flowLintBatchRunBtn.style.opacity = "0.55";
      }
      renderFocusTrapSimulator();
      renderOverlayStackInspector();
      renderEscapeRouteMap();
      renderFocusReturnMap();
      return;
    }

    const rank: Record<FlowLintIssueType, number> = {
      "a11y-missing-label": 0,
      "a11y-focus-gap": 1,
      "a11y-focus-trap": 2,
      "a11y-low-contrast": 3,
      "a11y-motion": 4,
      "cycle-trap": 5,
      "dead-end": 6,
      "unreachable": 7,
      "cycle": 8,
      "overlay-leak": 9,
      "overlay-key-route": 10,
      "overlay-depth-budget": 11,
      "overlay-exit-latency": 12,
      "scroll-leak": 13,
      "orphan-close": 14,
    };
    const sortedIssues = [...issues].sort((a, b) => (rank[a.type] - rank[b.type]) || a.frameName.localeCompare(b.frameName));
    const issueTypes: FlowLintIssueType[] = ["a11y-missing-label", "a11y-focus-gap", "a11y-focus-trap", "a11y-low-contrast", "a11y-motion", "dead-end", "unreachable", "cycle-trap", "cycle", "overlay-leak", "overlay-key-route", "overlay-depth-budget", "overlay-exit-latency", "scroll-leak", "orphan-close"];
    if (flowLintFilterTypes.size === 0) {
      for (const t of issueTypes) flowLintFilterTypes.add(t);
    }
    if (flowLintFilterWrap) {
      const counts = new Map<FlowLintIssueType, number>();
      for (const t of issueTypes) counts.set(t, sortedIssues.filter((i) => i.type === t).length);
      flowLintFilterWrap.innerHTML = "";
      for (const t of issueTypes) {
        const chip = document.createElement("button");
        const activeType = flowLintFilterTypes.has(t);
        chip.textContent = `${t} ${counts.get(t) || 0}`;
        chip.style.cssText = `font-size:9px;padding:2px 6px;border-radius:999px;border:1px solid ${activeType ? "rgba(56,189,248,0.85)" : "rgba(148,163,184,0.35)"};background:${activeType ? "rgba(14,116,144,0.35)" : "rgba(15,23,42,0.45)"};color:${activeType ? "#67e8f9" : "#94a3b8"};cursor:pointer;`;
        chip.onclick = () => {
          if (flowLintFilterTypes.has(t)) flowLintFilterTypes.delete(t);
          else flowLintFilterTypes.add(t);
          if (flowLintFilterTypes.size === 0) {
            for (const allType of issueTypes) flowLintFilterTypes.add(allType);
          }
          flowLintNavIndex = -1;
          renderFlowLint();
        };
        flowLintFilterWrap.appendChild(chip);
      }
    }

    const filteredIssues = sortedIssues.filter((i) => flowLintFilterTypes.has(i.type));

    const overlayNameById = new Map<number, string>(snapshot.nodes.map((node) => [node.id, node.name]));
    const overlayRiskRows = new Map<number, { overlayId: number; overlayName: string; frameName: string; score: number; keyRouteCount: number; depthCount: number; latencyCount: number; peakDepthExcess: number; peakLatencySteps: number; detail: string[] }>();
    const upsertOverlayRisk = (issue: FlowLintIssue) => {
      const overlayId = issue.overlayId;
      if (!overlayId || overlayId <= 0) return;
      const overlayName = overlayNameById.get(overlayId) || `#${overlayId}`;
      let row = overlayRiskRows.get(overlayId);
      if (!row) {
        row = {
          overlayId,
          overlayName,
          frameName: issue.frameName,
          score: 0,
          keyRouteCount: 0,
          depthCount: 0,
          latencyCount: 0,
          peakDepthExcess: 0,
          peakLatencySteps: 0,
          detail: [],
        };
        overlayRiskRows.set(overlayId, row);
      }
      if (issue.type === "overlay-key-route") {
        row.keyRouteCount += 1;
        row.score += 65;
        row.detail.push("key-route");
      } else if (issue.type === "overlay-depth-budget") {
        row.depthCount += 1;
        const maxDepth = Number(issue.detail.match(/Overlay depth\s+(\d+)/i)?.[1] || 0);
        const budget = Number(issue.overlayBudget || FLOW_OVERLAY_DEPTH_BUDGET || 0);
        const excess = Math.max(0, maxDepth - budget);
        row.peakDepthExcess = Math.max(row.peakDepthExcess, excess);
        row.score += 38 + excess * 12;
        row.detail.push(`depth+${excess}`);
      } else if (issue.type === "overlay-exit-latency") {
        row.latencyCount += 1;
        const escSteps = Number(issue.detail.match(/Esc\s+(\d+)/i)?.[1] || 0);
        const backSteps = Number(issue.detail.match(/Back\s+(\d+)/i)?.[1] || 0);
        const maxSteps = Math.max(escSteps, backSteps);
        const over = Math.max(0, maxSteps - FLOW_OVERLAY_EXIT_LATENCY_BUDGET);
        row.peakLatencySteps = Math.max(row.peakLatencySteps, maxSteps);
        row.score += 26 + over * 8;
        row.detail.push(`latency+${over}`);
      }
    };
    for (const issue of sortedIssues) {
      if (issue.type === "overlay-key-route" || issue.type === "overlay-depth-budget" || issue.type === "overlay-exit-latency") {
        upsertOverlayRisk(issue);
      }
    }
    const rankedOverlayRiskRows = Array.from(overlayRiskRows.values())
      .sort((a, b) => (b.score - a.score) || (b.keyRouteCount - a.keyRouteCount) || (b.depthCount - a.depthCount) || (b.latencyCount - a.latencyCount) || a.overlayName.localeCompare(b.overlayName))
      .slice(0, 6);
    const totalOverlayRiskScore = rankedOverlayRiskRows.reduce((sum, row) => sum + row.score, 0);
    const totalOverlayRiskCount = rankedOverlayRiskRows.reduce((sum, row) => sum + row.keyRouteCount + row.depthCount + row.latencyCount, 0);
    flowLintRiskInfo.textContent = rankedOverlayRiskRows.length > 0
      ? `Overlay route risk ${Math.round(totalOverlayRiskScore)}pt · ${rankedOverlayRiskRows.length} overlays · issues ${totalOverlayRiskCount}`
      : "Overlay risk scoreboard: no route/depth/latency issues.";
    flowLintRiskList.innerHTML = "";
    if (rankedOverlayRiskRows.length === 0) {
      const ok = document.createElement("div");
      ok.style.cssText = "font-size:9px;color:#86efac;";
      ok.textContent = "No overlay risk rows.";
      flowLintRiskList.appendChild(ok);
    } else {
      for (const row of rankedOverlayRiskRows) {
        const card = document.createElement("button");
        const severity = row.score >= 130 ? "critical" : row.score >= 80 ? "watch" : "low";
        const accent = severity === "critical" ? "#fb7185" : severity === "watch" ? "#f59e0b" : "#38bdf8";
        card.style.cssText = `display:flex;justify-content:space-between;align-items:flex-start;gap:6px;width:100%;text-align:left;background:rgba(15,23,42,0.55);border:1px solid rgba(148,163,184,0.25);border-left:3px solid ${accent};border-radius:6px;color:#e2e8f0;padding:4px 6px;cursor:pointer;`;
        card.innerHTML = `<span style="display:flex;flex-direction:column;gap:1px;"><span style="font-size:10px;font-weight:600;color:${accent};">${row.overlayName} (#${row.overlayId})</span><span style="font-size:9px;color:#94a3b8;">${row.frameName} · key ${row.keyRouteCount} · depth ${row.depthCount} · latency ${row.latencyCount}</span></span><span style="font-size:11px;font-weight:700;color:${accent};">${Math.round(row.score)}</span>`;
        card.title = `depth excess ${row.peakDepthExcess}, max latency ${row.peakLatencySteps} step(s)`;
        card.onclick = () => {
          const targetFrameId = sortedIssues.find((issue) => issue.overlayId === row.overlayId)?.frameId;
          if (targetFrameId) navigateTo(targetFrameId, "Instant", 0, "linear");
        };
        flowLintRiskList.appendChild(card);
      }
    }

    if (flowLintBatchTypeSel) {
      const prevType = flowLintBatchTypeSel.value;
      flowLintBatchTypeSel.innerHTML = "";
      for (const t of FLOW_LINT_BATCH_FIXABLE_TYPES) {
        const count = filteredIssues.filter((issue) => issue.type === t).length;
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = `${t} (${count})`;
        flowLintBatchTypeSel.appendChild(opt);
      }
      if (FLOW_LINT_BATCH_FIXABLE_TYPES.includes(prevType as FlowLintIssueType)) flowLintBatchTypeSel.value = prevType;
      const selectedType = (flowLintBatchTypeSel.value || FLOW_LINT_BATCH_FIXABLE_TYPES[0]) as FlowLintIssueType;
      const scope = (flowLintBatchScopeSel?.value === "all-frames" ? "all-frames" : "current-frame") as "current-frame" | "all-frames";
      const hasSelectedIssues = getFlowLintScopedIssues(selectedType, scope).length > 0;
      if (flowLintBatchRunBtn) {
        flowLintBatchRunBtn.disabled = !hasSelectedIssues;
        flowLintBatchRunBtn.style.opacity = hasSelectedIssues ? "1" : "0.55";
      }
    }

    const visibleIssues = filteredIssues.slice(0, 14);
    flowLintRenderedIssues = visibleIssues;
    flowLintNavIndex = Math.min(flowLintNavIndex, flowLintRenderedIssues.length - 1);

    for (const [issueIndex, issue] of visibleIssues.entries()) {
      const row = document.createElement("button");
      const color = issue.type === "a11y-missing-label"
        ? "#f59e0b"
        : issue.type === "a11y-focus-gap"
          ? "#fb7185"
          : issue.type === "a11y-focus-trap"
            ? "#f97316"
            : issue.type === "a11y-low-contrast"
              ? "#ef4444"
              : issue.type === "a11y-motion"
                ? "#34d399"
              : issue.type === "dead-end"
                ? "#fca5a5"
                : issue.type === "unreachable"
                  ? "#fbbf24"
                  : issue.type === "cycle"
                    ? "#c4b5fd"
                    : issue.type === "cycle-trap"
                      ? "#ef4444"
                      : issue.type === "overlay-leak"
                        ? "#fb7185"
                        : issue.type === "overlay-key-route"
                          ? "#f97316"
                          : issue.type === "overlay-depth-budget"
                            ? "#fb7185"
                            : issue.type === "overlay-exit-latency"
                              ? "#f59e0b"
                              : issue.type === "scroll-leak"
                                ? "#38bdf8"
                                : "#22d3ee";
      row.style.cssText = `display:flex;flex-direction:column;align-items:flex-start;gap:1px;width:100%;text-align:left;background:rgba(15,23,42,0.55);border:1px solid rgba(148,163,184,0.25);border-left:3px solid ${color};border-radius:6px;color:#e2e8f0;padding:4px 6px;cursor:pointer;`;
      row.dataset.lintNavIndex = String(issueIndex);
      row.innerHTML = `<span style="font-size:10px;font-weight:600;color:${color};text-transform:uppercase;">${issue.type}</span><span style="font-size:10px;">${issue.frameName} (#${issue.frameId})</span><span style="font-size:9px;color:#94a3b8;">${issue.detail}</span>`;
      row.onclick = () => {
        flowLintNavIndex = issueIndex;
        navigateTo(issue.frameId, "Instant", 0, "linear");
      };
      if (issue.type === "scroll-leak" && issue.overlayId && issue.overlayId > 0) {
        const fixBtn = document.createElement("button");
        fixBtn.style.cssText = "margin-top:4px;background:#0c4a6e;border:1px solid #38bdf8;border-radius:4px;color:#bae6fd;font-size:9px;padding:2px 6px;cursor:pointer;";
        fixBtn.textContent = "Fix: lock background scroll";
        fixBtn.onclick = (ev) => {
          ev.stopPropagation();
          const key = makeScrollLockRegionKey(issue.frameId, issue.overlayId || 0);
          scrollLockRegions = { ...scrollLockRegions, [key]: true };
          saveScrollLockRegions(scrollLockRegions);
          renderFlowLint();
        };
        row.appendChild(fixBtn);
      }
      if (issue.type === "overlay-depth-budget" && issue.overlayId && issue.overlayId > 0) {
        if (issue.overlayRewritePlan && issue.overlayRewritePlan.length > 0) {
          const planMeta = document.createElement("div");
          planMeta.style.cssText = "margin-top:4px;font-size:9px;line-height:1.35;color:#c4b5fd;white-space:normal;";
          planMeta.innerHTML = issue.overlayRewritePlan.map((line) => `<div>${line}</div>`).join("");
          row.appendChild(planMeta);
        }
        const flattenTargets = Array.from(new Set([...(issue.overlayPath || []), issue.overlayId].filter((id): id is number => Number(id) > 0)));
        const fixBtn = document.createElement("button");
        fixBtn.style.cssText = "margin-top:4px;background:#4c1d95;border:1px solid #a78bfa;border-radius:4px;color:#ede9fe;font-size:9px;padding:2px 6px;cursor:pointer;";
        fixBtn.textContent = flattenTargets.length > 1 ? `Fix: flatten path (${flattenTargets.length})` : "Fix: flatten overlay";
        fixBtn.onclick = (ev) => {
          ev.stopPropagation();
          try {
            editor.engine.push_undo();
            let changed = 0;
            for (const targetId of flattenTargets) {
              editor.engine.set_selection(new BigUint64Array([BigInt(targetId)]));
              changed += Number(editor.engine.flatten_selection() || 0);
            }
            editor.requestRender();
            renderFlowLint();
            fixBtn.textContent = changed > 0 ? `Flattened ${changed}` : "No-op";
          } catch {
            fixBtn.textContent = "No-op";
          }
          setTimeout(() => {
            fixBtn.textContent = flattenTargets.length > 1 ? `Fix: flatten path (${flattenTargets.length})` : "Fix: flatten overlay";
          }, 1200);
        };
        row.appendChild(fixBtn);
      }
      if (issue.type === "a11y-focus-trap" && issue.overlayId && issue.overlayId > 0) {
        const fixBtn = document.createElement("button");
        fixBtn.style.cssText = "margin-top:4px;background:#7c2d12;border:1px solid #fb923c;border-radius:4px;color:#ffedd5;font-size:9px;padding:2px 6px;cursor:pointer;";
        fixBtn.textContent = "Fix: add close path";
        fixBtn.onclick = (ev) => {
          ev.stopPropagation();
          const issueRow = collectFocusTrapSimulationIssues(flowMinimapSnapshot || undefined).find((row) => row.frameId === issue.frameId && row.overlayId === issue.overlayId);
          if (!issueRow) {
            fixBtn.textContent = "No-op";
            setTimeout(() => {
              fixBtn.textContent = "Fix: add close path";
            }, 1000);
            return;
          }
          editor.engine.push_undo();
          const ok = applyFocusTrapFix(issueRow);
          fixBtn.textContent = ok ? "Fixed" : "No-op";
          if (ok) {
            editor.requestRender();
            renderFlowLint();
          }
          setTimeout(() => {
            fixBtn.textContent = "Fix: add close path";
          }, 1000);
        };
        row.appendChild(fixBtn);
      }
      flowLintList.appendChild(row);
    }

    if (filteredIssues.length > 14) {
      const more = document.createElement("div");
      more.style.cssText = "font-size:9px;color:#94a3b8;";
      more.textContent = `+ ${filteredIssues.length - 14} more issues`;
      flowLintList.appendChild(more);
    }
    renderFocusTrapSimulator();
    renderOverlayStackInspector();
    renderEscapeRouteMap();
    renderFocusReturnMap();
  }

  function captureSessionSnapshot() {
    const frameId = currentFrameId && currentFrameId > 0 ? currentFrameId : null;
    let frameName = frameId ? `Frame #${frameId}` : "None";
    let scrollX = 0;
    let scrollY = 0;
    if (frameId) {
      try {
        const raw = editor.engine.get_node_json(BigInt(frameId));
        if (raw) {
          const node = JSON.parse(raw);
          frameName = String(node?.name || frameName);
        }
      } catch {}
      try {
        const scroll = JSON.parse(editor.engine.get_scroll_offset(BigInt(frameId)) || "{}") || {};
        scrollX = Number(scroll?.x || 0);
        scrollY = Number(scroll?.y || 0);
      } catch {}
    }

    const vars = Array.from(protoVars.entries())
      .map(([name, value]) => ({ name, value: String(value) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const snap: ProtoSessionSnapshot = {
      id: `snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      at: Date.now(),
      frameId,
      frameName,
      scrollX,
      scrollY,
      vars,
    };
    sessionSnapshots = [...sessionSnapshots, snap].slice(-10);
    if (sessionSnapshotSelectB) sessionSnapshotSelectB.value = snap.id;
    if (sessionSnapshotSelectA && sessionSnapshots.length >= 2 && !sessionSnapshotSelectA.value) {
      sessionSnapshotSelectA.value = sessionSnapshots[sessionSnapshots.length - 2]!.id;
    }
    renderSessionSnapshotComparator();
  }

  function renderSessionSnapshotComparator() {
    if (!sessionSnapshotInfo || !sessionSnapshotList || !sessionSnapshotSelectA || !sessionSnapshotSelectB) return;

    const prevA = sessionSnapshotSelectA.value;
    const prevB = sessionSnapshotSelectB.value;
    const opts = ['<option value="">(none)</option>', ...sessionSnapshots.map((s) => {
      const hhmm = new Date(s.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return `<option value="${s.id}">${hhmm} · ${s.frameName}</option>`;
    })].join("");
    sessionSnapshotSelectA.innerHTML = opts;
    sessionSnapshotSelectB.innerHTML = opts;
    if (prevA && sessionSnapshots.some((s) => s.id === prevA)) sessionSnapshotSelectA.value = prevA;
    else if (sessionSnapshots.length >= 2) sessionSnapshotSelectA.value = sessionSnapshots[sessionSnapshots.length - 2]!.id;

    if (prevB && sessionSnapshots.some((s) => s.id === prevB)) sessionSnapshotSelectB.value = prevB;
    else if (sessionSnapshots.length >= 1) sessionSnapshotSelectB.value = sessionSnapshots[sessionSnapshots.length - 1]!.id;

    const a = sessionSnapshots.find((s) => s.id === sessionSnapshotSelectA.value);
    const b = sessionSnapshots.find((s) => s.id === sessionSnapshotSelectB.value);

    sessionSnapshotList.innerHTML = "";
    if (!a || !b) {
      sessionSnapshotInfo.textContent = sessionSnapshots.length === 0
        ? "Capture snapshots to compare runtime state."
        : "Pick two snapshots (A/B) to diff.";
      return;
    }

    const varA = new Map(a.vars.map((v) => [v.name, v.value]));
    const varB = new Map(b.vars.map((v) => [v.name, v.value]));
    const keys = new Set([...varA.keys(), ...varB.keys()]);
    const varDiffs: Array<{ name: string; from: string; to: string }> = [];
    for (const key of keys) {
      const from = varA.get(key) ?? "(unset)";
      const to = varB.get(key) ?? "(unset)";
      if (from !== to) varDiffs.push({ name: key, from, to });
    }
    varDiffs.sort((x, y) => x.name.localeCompare(y.name));

    const frameChanged = a.frameId !== b.frameId;
    const dx = Math.round((b.scrollX - a.scrollX) * 10) / 10;
    const dy = Math.round((b.scrollY - a.scrollY) * 10) / 10;
    const scrollChanged = Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01;

    sessionSnapshotInfo.textContent = `Δ frame ${frameChanged ? "changed" : "same"} · Δ scroll (${dx}, ${dy}) · Δ vars ${varDiffs.length}`;

    const addRow = (title: string, detail: string, color = "#94a3b8") => {
      const row = document.createElement("div");
      row.style.cssText = `padding:4px 6px;border-radius:6px;background:rgba(15,23,42,0.55);border:1px solid rgba(148,163,184,0.2);font-size:10px;color:${color};line-height:1.35;`;
      row.innerHTML = `<div style="font-weight:600;color:#cbd5e1;">${title}</div><div>${detail}</div>`;
      sessionSnapshotList!.appendChild(row);
    };

    addRow("Frame", frameChanged ? `${a.frameName} (#${a.frameId || "-"}) → ${b.frameName} (#${b.frameId || "-"})` : `${a.frameName} (unchanged)`, frameChanged ? "#fbbf24" : "#86efac");
    addRow("Scroll", scrollChanged ? `(${a.scrollX.toFixed(1)}, ${a.scrollY.toFixed(1)}) → (${b.scrollX.toFixed(1)}, ${b.scrollY.toFixed(1)})` : `(${b.scrollX.toFixed(1)}, ${b.scrollY.toFixed(1)}) unchanged`, scrollChanged ? "#fca5a5" : "#86efac");

    if (varDiffs.length === 0) {
      addRow("Variables", "No variable diffs", "#86efac");
    } else {
      for (const diff of varDiffs.slice(0, 8)) {
        addRow(`Var · ${diff.name}`, `${diff.from} → ${diff.to}`, "#c4b5fd");
      }
      if (varDiffs.length > 8) addRow("Variables", `+${varDiffs.length - 8} more changes`, "#94a3b8");
    }
  }

  function pushTimelineEvent(evt: { action: string; fromFrameId: number | null; toFrameId: number | null; transition?: string; durationMs?: number; kind?: TimelineEventKind; note?: string }) {
    const inferredKind: TimelineEventKind = evt.kind || ((evt.fromFrameId || 0) !== (evt.toFrameId || 0) ? "frame" : "interaction");
    timelineEvents.push({
      id: timelineSeq++,
      at: Math.max(0, performance.now() - recorderStartedAt),
      action: evt.action,
      fromFrameId: evt.fromFrameId,
      toFrameId: evt.toFrameId,
      transition: evt.transition || "Instant",
      durationMs: Math.max(0, Number(evt.durationMs || 0)),
      kind: inferredKind,
      note: evt.note,
    });
    if (timelineEvents.length > 160) timelineEvents = timelineEvents.slice(-160);
    renderTimelineScrubber();
  }

  function scrubToTimelineEvent(index: number) {
    if (!timelineEvents.length) return;
    const safeIndex = Math.max(0, Math.min(timelineEvents.length - 1, Math.round(index)));
    const evt = timelineEvents[safeIndex];
    if (!evt) return;
    if (timelineScrubber) timelineScrubber.value = String(safeIndex);
    const target = evt.toFrameId || evt.fromFrameId;
    if (target && target > 0 && target !== currentFrameId) {
      currentFrameId = target;
      renderCurrentView();
    }
    if (timelineInfo) {
      const sec = (evt.at / 1000).toFixed(2);
      timelineInfo.textContent = `#${safeIndex + 1}/${timelineEvents.length} · t+${sec}s · ${evt.action} · ${evt.transition} ${evt.durationMs}ms`;
    }
  }

  function clearTimelinePlaybackTimer() {
    if (timelinePlaybackTimer !== null) {
      window.clearTimeout(timelinePlaybackTimer);
      timelinePlaybackTimer = null;
    }
  }

  function renderTimelineScrubber() {
    if (!timelineScrubber || !timelineList || !timelineInfo) return;
    timelineScrubber.min = "0";
    timelineScrubber.max = String(Math.max(0, timelineEvents.length - 1));
    if (timelineEvents.length === 0) {
      timelineScrubber.value = "0";
      timelineInfo.textContent = "No timeline events yet";
      timelineList.innerHTML = "<div style=\"font-size:10px;color:#94a3b8;\">Record interactions or navigate to capture timeline.</div>";
      return;
    }
    const currentIndex = Math.max(0, Math.min(timelineEvents.length - 1, Number(timelineScrubber.value || timelineEvents.length - 1)));
    timelineScrubber.value = String(currentIndex);
    const selected = timelineEvents[currentIndex];
    const sec = (selected.at / 1000).toFixed(2);
    const selectedBadge = selected.kind === "frame" ? "Frame" : selected.kind === "system" ? "System" : "Interaction";
    timelineInfo.textContent = `#${currentIndex + 1}/${timelineEvents.length} · ${selectedBadge} · t+${sec}s · ${selected.action}`;

    const filtered = timelineEvents.filter((evt) => {
      if (timelineFilterMode === "frame") return evt.kind === "frame";
      if (timelineFilterMode === "interaction") return evt.kind === "interaction";
      return true;
    });

    timelineList.innerHTML = "";
    if (filtered.length === 0) {
      timelineList.innerHTML = '<div style="font-size:10px;color:#94a3b8;">No events for current filter.</div>';
      return;
    }

    for (const evt of filtered.slice(-14).reverse()) {
      const row = document.createElement("button");
      row.style.cssText = "width:100%;text-align:left;background:rgba(15,23,42,0.55);border:1px solid rgba(148,163,184,0.24);border-radius:6px;color:#e2e8f0;padding:4px 6px;cursor:pointer;font-size:10px;";
      const idx = timelineEvents.findIndex((x) => x.id === evt.id);
      const fromLabel = evt.fromFrameId ? `#${evt.fromFrameId}` : "-";
      const toLabel = evt.toFrameId ? `#${evt.toFrameId}` : "-";
      const icon = evt.kind === "frame" ? "↔" : evt.kind === "system" ? "⚙" : "•";
      row.textContent = `${icon} ${idx + 1}. ${evt.action} ${fromLabel}→${toLabel} (${evt.transition}/${evt.durationMs}ms)${evt.note ? ` · ${evt.note}` : ""}`;
      row.onclick = () => scrubToTimelineEvent(idx);
      timelineList.appendChild(row);
    }
  }

  function renderStagePreviewFrame(tRaw: number) {
    if (!stagePreviewCanvas || !stagePreviewInfo) return;
    const ctx = stagePreviewCanvas.getContext("2d");
    if (!ctx) return;
    const preview = lastTransitionPreview;
    if (!preview) {
      stagePreviewInfo.textContent = "Run a frame transition first to preview stages.";
      ctx.clearRect(0, 0, stagePreviewCanvas.width, stagePreviewCanvas.height);
      return;
    }

    const fromCanvas = renderFrameToCanvas(preview.fromId);
    const toCanvas = renderFrameToCanvas(preview.toId);
    if (!fromCanvas || !toCanvas) {
      stagePreviewInfo.textContent = "Failed to render source/target frame.";
      ctx.clearRect(0, 0, stagePreviewCanvas.width, stagePreviewCanvas.height);
      return;
    }

    const t = Math.max(0, Math.min(1, tRaw));
    const eased = applyEasing(preview.easing || "ease_in_out", t);
    const w = stagePreviewCanvas.width;
    const h = stagePreviewCanvas.height;
    ctx.clearRect(0, 0, w, h);

    if (stagePreviewOnion) {
      ctx.globalAlpha = 0.2;
      ctx.drawImage(fromCanvas, 0, 0, w, h);
      ctx.globalAlpha = 0.2;
      ctx.drawImage(toCanvas, 0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    switch (preview.transition) {
      case "SlideIn":
        ctx.drawImage(fromCanvas, -w * eased, 0, w, h);
        ctx.drawImage(toCanvas, w * (1 - eased), 0, w, h);
        break;
      case "SlideOut":
        ctx.drawImage(toCanvas, 0, 0, w, h);
        ctx.drawImage(fromCanvas, w * eased, 0, w, h);
        break;
      case "Push":
        ctx.drawImage(fromCanvas, -w * eased, 0, w, h);
        ctx.drawImage(toCanvas, w - w * eased, 0, w, h);
        break;
      case "SmartAnimate":
      case "Dissolve":
      default:
        ctx.globalAlpha = 1 - eased;
        ctx.drawImage(fromCanvas, 0, 0, w, h);
        ctx.globalAlpha = eased;
        ctx.drawImage(toCanvas, 0, 0, w, h);
        ctx.globalAlpha = 1;
        break;
    }

    ctx.strokeStyle = "rgba(148,163,184,0.6)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    stagePreviewInfo.textContent = `${preview.transition} · ${(eased * 100).toFixed(0)}% · ${preview.durationMs}ms · onion ${stagePreviewOnion ? "ON" : "OFF"}`;
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
    timelineEvents = [];
    timelineSeq = 1;
    clearTimelinePlaybackTimer();

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

    const ringWrap = document.createElement("div");
    ringWrap.style.cssText = "display:flex;align-items:center;gap:6px;";
    const ringLabel = document.createElement("span");
    ringLabel.style.cssText = "font-size:11px;color:#94a3b8;";
    ringLabel.textContent = "Ring";
    const ringSel = document.createElement("select");
    ringSel.style.cssText = "background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:5px 8px;font-size:11px;max-width:150px;";
    const ringFlowCheckLabel = document.createElement("label");
    ringFlowCheckLabel.style.cssText = "display:flex;align-items:center;gap:3px;color:#94a3b8;font-size:10px;";
    const ringFlowCheck = document.createElement("input");
    ringFlowCheck.type = "checkbox";
    ringFlowCheckLabel.appendChild(ringFlowCheck);
    ringFlowCheckLabel.appendChild(document.createTextNode("Flow"));
    const ringSaveBtn = document.createElement("button");
    ringSaveBtn.className = "prop-btn";
    ringSaveBtn.textContent = "Save";
    ringSaveBtn.style.cssText = "font-size:10px;padding:3px 6px;";
    const ringGuardBtn = document.createElement("button");
    ringGuardBtn.className = "prop-btn";
    ringGuardBtn.textContent = "Guard";
    ringGuardBtn.style.cssText = "font-size:10px;padding:3px 6px;color:#facc15;border-color:rgba(250,204,21,0.45);";
    const ringReportBtn = document.createElement("button");
    ringReportBtn.className = "prop-btn";
    ringReportBtn.textContent = "Report";
    ringReportBtn.style.cssText = "font-size:10px;padding:3px 6px;color:#93c5fd;border-color:rgba(147,197,253,0.45);";
    let ringReportWrap: HTMLDivElement | null = null;
    const syncRingPresetSelect = () => {
      const presets = loadPrototypeRingPresets();
      const flowId = detectFlowIdForFrame(currentFrameId);
      const flowOverrides = loadRingFlowOverrides();
      const overridePresetId = flowId ? String(flowOverrides[String(flowId)] || "") : "";
      ringSel.innerHTML = "";
      for (const preset of presets) {
        const opt = document.createElement("option");
        opt.value = preset.id;
        opt.textContent = preset.name;
        ringSel.appendChild(opt);
      }
      const activeId = localStorage.getItem(PROTOTYPE_RING_ACTIVE_PRESET_KEY) || presets[0]?.id || DEFAULT_RING_PRESET.id;
      ringSel.value = ringFlowCheck.checked ? (overridePresetId || activeId) : activeId;
      ringFlowCheck.disabled = !flowId;
      ringFlowCheck.title = flowId ? `Flow #${flowId} override` : "Current frame is not a flow start";
    };
    ringSel.addEventListener("change", () => {
      const presets = loadPrototypeRingPresets();
      const picked = presets.find((p) => p.id === ringSel.value);
      if (!picked) return;
      if (ringFlowCheck.checked) {
        const flowId = detectFlowIdForFrame(currentFrameId);
        if (flowId && flowId > 0) {
          const map = loadRingFlowOverrides();
          map[String(flowId)] = picked.id;
          saveRingFlowOverrides(map);
        }
      } else {
        localStorage.setItem(PROTOTYPE_RING_ACTIVE_PRESET_KEY, picked.id);
      }
      renderCurrentView();
    });
    ringFlowCheck.addEventListener("change", syncRingPresetSelect);
    ringSaveBtn.onclick = () => {
      const preset = loadActivePrototypeRingPreset(detectFlowIdForFrame(currentFrameId));
      const next = loadPrototypeRingPresets();
      const id = `preset-${Date.now().toString(36)}`;
      next.unshift({ ...preset, id, name: `Preset ${next.length + 1}` });
      try { localStorage.setItem(PROTOTYPE_RING_PRESET_KEY, JSON.stringify(next)); } catch {}
      localStorage.setItem(PROTOTYPE_RING_ACTIVE_PRESET_KEY, id);
      syncRingPresetSelect();
      renderCurrentView();
    };
    ringGuardBtn.onclick = () => {
      const presets = loadPrototypeRingPresets();
      const presetIndex = presets.findIndex((p) => p.id === ringSel.value);
      if (presetIndex < 0) return;
      const frameBg = detectFrameBackgroundRgb(currentFrameId);
      const preset = presets[presetIndex]!;
      const nextPreset: PrototypeRingPreset = {
        ...preset,
        hover: { ...preset.hover, color: pickContrastSafeRingColor(preset.hover.color, frameBg, 3) },
        press: { ...preset.press, color: pickContrastSafeRingColor(preset.press.color, frameBg, 3) },
        focus: { ...preset.focus, color: pickContrastSafeRingColor(preset.focus.color, frameBg, 3) },
      };
      const changed = Number(nextPreset.hover.color !== preset.hover.color)
        + Number(nextPreset.press.color !== preset.press.color)
        + Number(nextPreset.focus.color !== preset.focus.color);
      presets[presetIndex] = nextPreset;
      try { localStorage.setItem(PROTOTYPE_RING_PRESET_KEY, JSON.stringify(presets)); } catch {}
      ringGuardBtn.textContent = changed > 0 ? `Guarded ${changed}` : "Already safe";
      window.setTimeout(() => {
        ringGuardBtn.textContent = "Guard";
      }, 1200);
      syncRingPresetSelect();
      renderCurrentView();
    };
    ringReportBtn.onclick = () => {
      if (!overlay) return;
      if (ringReportWrap && ringReportWrap.parentElement) {
        ringReportWrap.remove();
        ringReportWrap = null;
        ringReportBtn.textContent = "Report";
        return;
      }
      const frameBg = detectFrameBackgroundRgb(currentFrameId);
      const presets = loadPrototypeRingPresets();
      ringReportWrap = document.createElement("div");
      ringReportWrap.style.cssText = "position:absolute;right:14px;top:58px;max-width:320px;max-height:300px;overflow:auto;background:rgba(15,23,42,0.96);border:1px solid rgba(148,163,184,0.32);border-radius:10px;padding:8px;z-index:8;display:flex;flex-direction:column;gap:6px;";
      const head = document.createElement("div");
      head.style.cssText = "font-size:11px;font-weight:600;color:#cbd5e1;";
      head.textContent = "Focus Ring Contrast Report";
      ringReportWrap.appendChild(head);
      for (const preset of presets) {
        const card = document.createElement("div");
        card.style.cssText = "display:flex;flex-direction:column;gap:4px;border:1px solid rgba(71,85,105,0.5);border-radius:8px;padding:6px;";
        const hoverRatio = contrastRatio(parseColorToRgb(preset.hover.color) || frameBg, frameBg);
        const pressRatio = contrastRatio(parseColorToRgb(preset.press.color) || frameBg, frameBg);
        const focusRatio = contrastRatio(parseColorToRgb(preset.focus.color) || frameBg, frameBg);
        const minRatio = Math.min(hoverRatio, pressRatio, focusRatio);
        const badge = minRatio >= 3 ? "Safe" : (minRatio >= 2.3 ? "Watch" : "Risky");
        const badgeColor = badge === "Safe" ? "#22c55e" : (badge === "Watch" ? "#f59e0b" : "#ef4444");

        const title = document.createElement("div");
        title.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:10px;color:#e2e8f0;";
        title.innerHTML = `<span>${preset.name}</span><span style=\"color:${badgeColor};font-weight:700;\">${badge}</span>`;
        card.appendChild(title);

        const score = document.createElement("div");
        score.style.cssText = "font-size:9px;color:#94a3b8;line-height:1.35;";
        score.textContent = `hover ${hoverRatio.toFixed(2)}:1 · press ${pressRatio.toFixed(2)}:1 · focus ${focusRatio.toFixed(2)}:1`;
        card.appendChild(score);
        ringReportWrap.appendChild(card);
      }
      overlay.appendChild(ringReportWrap);
      ringReportBtn.textContent = "Close";
    };
    ringWrap.append(ringLabel, ringSel, ringFlowCheckLabel, ringSaveBtn, ringGuardBtn, ringReportBtn);
    syncRingPresetSelect();
    topBar.appendChild(ringWrap);

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

    const ringGuardRow = document.createElement("div");
    ringGuardRow.style.cssText = "display:flex;gap:6px;align-items:center;";
    const ringReleaseLabel = document.createElement("label");
    ringReleaseLabel.style.cssText = "display:flex;align-items:center;gap:4px;font-size:10px;color:#fef08a;";
    const ringReleaseCheck = document.createElement("input");
    ringReleaseCheck.type = "checkbox";
    ringReleaseCheck.dataset.role = "ring-release-check";
    ringReleaseCheck.checked = ringReleaseMode;
    ringReleaseLabel.appendChild(ringReleaseCheck);
    ringReleaseLabel.appendChild(document.createTextNode("Release mode"));
    const ringPolicySel = document.createElement("select");
    ringPolicySel.dataset.role = "ring-guard-policy";
    ringPolicySel.style.cssText = "flex:1;background:#0f172a;color:#fde68a;border:1px solid rgba(250,204,21,0.32);border-radius:6px;padding:3px 6px;font-size:10px;";
    for (const [value, label] of [["off", "Guard off"], ["warn", "Warn"], ["enforce-safe", "Auto Safe"]]) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      ringPolicySel.appendChild(opt);
    }
    ringGuardRow.appendChild(ringReleaseLabel);
    ringGuardRow.appendChild(ringPolicySel);
    flowStartWrap.appendChild(ringGuardRow);

    const syncRingGuardControls = () => {
      const flowId = Number(flowStartFlowSel?.value || 0);
      ringReleaseCheck.checked = ringReleaseMode;
      ringPolicySel.disabled = !flowId;
      ringPolicySel.value = flowId > 0 ? (ringGuardPolicies[String(flowId)] || "off") : "off";
    };

    ringReleaseCheck.addEventListener("change", () => {
      ringReleaseMode = !!ringReleaseCheck.checked;
      try { localStorage.setItem(PROTOTYPE_RING_RELEASE_MODE_KEY, ringReleaseMode ? "1" : "0"); } catch {}
      renderFlowStartManager();
      renderCurrentView();
    });

    ringPolicySel.addEventListener("change", () => {
      const flowId = Number(flowStartFlowSel?.value || 0);
      if (!flowId) return;
      const next = ringPolicySel.value as RingGuardPolicy;
      ringGuardPolicies[String(flowId)] = next;
      saveRingGuardPolicies(ringGuardPolicies);
      renderFlowStartManager();
      renderCurrentView();
    });
    syncRingGuardControls();

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
      const pageId = Number(editor.engine.get_active_page_id?.() || 0);
      const frameName = (flowStartFrameSel?.selectedOptions?.[0]?.textContent || `Frame #${frameId}`).trim();
      const label = (prompt("Preset label (QA scenario)", frameName) || frameName).trim() || frameName;
      const presets = loadFlowEntryPresets();
      const key = flowPresetKey(flowId, pageId);
      const list = readFlowPresetBucket(presets, flowId, pageId);
      const next = [{ frameId, label, pageId }, ...list.filter((p) => p.frameId !== frameId)].slice(0, 8);
      presets[key] = next;
      saveFlowEntryPresets(presets);
      flowPresetCursor.set(key, 0);
      renderFlowStartManager();
    };
    presetBtnRow.appendChild(savePresetBtn);

    const runNextPresetBtn = document.createElement("button");
    runNextPresetBtn.className = "prop-btn";
    runNextPresetBtn.textContent = "Run next";
    runNextPresetBtn.style.cssText = "flex:1;font-size:10px;padding:3px 6px;";
    runNextPresetBtn.onclick = () => {
      const flowId = Number(flowStartFlowSel?.value || 0);
      const pageId = Number(editor.engine.get_active_page_id?.() || 0);
      if (!flowId) return;
      const presets = loadFlowEntryPresets();
      const key = flowPresetKey(flowId, pageId);
      const list = readFlowPresetBucket(presets, flowId, pageId);
      if (list.length === 0) return;
      const cursor = flowPresetCursor.get(key) || 0;
      const target = list[cursor % list.length];
      flowPresetCursor.set(key, (cursor + 1) % list.length);
      if (flowStartFrameSel) flowStartFrameSel.value = String(target.frameId);
      editor.engine.set_flow_start_frame(BigInt(flowId), BigInt(target.frameId), BigInt(pageId));
      currentFrameId = target.frameId;
      renderFlowStartManager();
      renderCurrentView();
      renderFlowLint();
    };
    presetBtnRow.appendChild(runNextPresetBtn);
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

    const flowLintScopeRow = document.createElement("div");
    flowLintScopeRow.style.cssText = "display:flex;gap:6px;align-items:center;";
    const flowLintScopeLabel = document.createElement("span");
    flowLintScopeLabel.style.cssText = "font-size:10px;color:#cbd5e1;white-space:nowrap;";
    flowLintScopeLabel.textContent = "Scope";
    flowLintScopeRow.appendChild(flowLintScopeLabel);
    flowLintScopeSel = document.createElement("select");
    flowLintScopeSel.style.cssText = "flex:1;background:#0f172a;color:#f8fafc;border:1px solid rgba(148,163,184,0.35);border-radius:6px;padding:3px 6px;font-size:10px;";
    flowLintScopeSel.innerHTML = "<option value=\"selection\">Selection</option><option value=\"page\">Page</option><option value=\"flow\">Flow</option>";
    flowLintScopeSel.value = "flow";
    flowLintScopeSel.onchange = () => renderFlowLint();
    flowLintScopeRow.appendChild(flowLintScopeSel);
    flowLintWrap.appendChild(flowLintScopeRow);

    const flowLintPresetRow = document.createElement("div");
    flowLintPresetRow.style.cssText = "display:flex;gap:6px;align-items:center;";
    const flowLintPresetLabel = document.createElement("span");
    flowLintPresetLabel.style.cssText = "font-size:10px;color:#cbd5e1;white-space:nowrap;";
    flowLintPresetLabel.textContent = "Overlay Guard";
    flowLintPresetRow.appendChild(flowLintPresetLabel);
    flowLintPresetSel = document.createElement("select");
    flowLintPresetSel.style.cssText = "flex:1;background:#0f172a;color:#f8fafc;border:1px solid rgba(148,163,184,0.35);border-radius:6px;padding:3px 6px;font-size:10px;";
    for (const preset of OVERLAY_GUARD_PRESETS) {
      const opt = document.createElement("option");
      opt.value = preset.id;
      opt.textContent = preset.label;
      flowLintPresetSel.appendChild(opt);
    }
    flowLintPresetSel.value = overlayGuardPresetId;
    flowLintPresetSel.onchange = () => {
      const next = resolveOverlayGuardPreset(flowLintPresetSel?.value).id;
      overlayGuardPresetId = next;
      saveOverlayGuardPresetId(next);
      if (flowLintPresetSel) flowLintPresetSel.value = next;
      const resolved = resolveOverlayGuardPreset(next);
      if (flowLintPresetInfo) flowLintPresetInfo.textContent = resolved.note;
      renderFlowLint();
    };
    flowLintPresetRow.appendChild(flowLintPresetSel);
    flowLintWrap.appendChild(flowLintPresetRow);

    flowLintPresetInfo = document.createElement("div");
    flowLintPresetInfo.style.cssText = "font-size:9px;color:#94a3b8;line-height:1.35;";
    flowLintPresetInfo.textContent = resolveOverlayGuardPreset(overlayGuardPresetId).note;
    flowLintWrap.appendChild(flowLintPresetInfo);

    flowLintInfo = document.createElement("div");
    flowLintInfo.style.cssText = "font-size:10px;color:#94a3b8;line-height:1.35;";
    flowLintInfo.textContent = "Analyzing flow graph…";
    flowLintWrap.appendChild(flowLintInfo);

    flowLintRiskWrap = document.createElement("div");
    flowLintRiskWrap.style.cssText = "display:flex;flex-direction:column;gap:4px;padding:5px;border-radius:7px;border:1px solid rgba(248,113,113,0.28);background:rgba(127,29,29,0.12);";
    const flowLintRiskHead = document.createElement("div");
    flowLintRiskHead.style.cssText = "font-size:9px;font-weight:600;color:#fecaca;text-transform:uppercase;letter-spacing:0.04em;";
    flowLintRiskHead.textContent = "Overlay Route Risk";
    flowLintRiskWrap.appendChild(flowLintRiskHead);
    flowLintRiskInfo = document.createElement("div");
    flowLintRiskInfo.style.cssText = "font-size:9px;line-height:1.35;color:#fda4af;";
    flowLintRiskInfo.textContent = "Overlay risk scoreboard pending…";
    flowLintRiskWrap.appendChild(flowLintRiskInfo);
    flowLintRiskList = document.createElement("div");
    flowLintRiskList.style.cssText = "display:flex;flex-direction:column;gap:4px;";
    flowLintRiskWrap.appendChild(flowLintRiskList);
    flowLintWrap.appendChild(flowLintRiskWrap);

    flowLintFilterWrap = document.createElement("div");
    flowLintFilterWrap.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;";
    flowLintWrap.appendChild(flowLintFilterWrap);

    const flowLintBatchRow = document.createElement("div");
    flowLintBatchRow.style.cssText = "display:flex;gap:4px;";
    flowLintBatchTypeSel = document.createElement("select");
    flowLintBatchTypeSel.style.cssText = "flex:1;background:#0f172a;color:#f8fafc;border:1px solid rgba(148,163,184,0.35);border-radius:6px;padding:3px 6px;font-size:10px;";
    for (const type of FLOW_LINT_BATCH_FIXABLE_TYPES) {
      const opt = document.createElement("option");
      opt.value = type;
      opt.textContent = type;
      flowLintBatchTypeSel.appendChild(opt);
    }
    flowLintBatchTypeSel.onchange = () => renderFlowLint();
    flowLintBatchRow.appendChild(flowLintBatchTypeSel);

    flowLintBatchScopeSel = document.createElement("select");
    flowLintBatchScopeSel.style.cssText = "width:86px;background:#0f172a;color:#f8fafc;border:1px solid rgba(148,163,184,0.35);border-radius:6px;padding:3px 6px;font-size:10px;";
    flowLintBatchScopeSel.innerHTML = "<option value=\"current-frame\">Current</option><option value=\"all-frames\">All frames</option>";
    flowLintBatchScopeSel.onchange = () => renderFlowLint();
    flowLintBatchRow.appendChild(flowLintBatchScopeSel);
    flowLintWrap.appendChild(flowLintBatchRow);

    flowLintBatchRunBtn = document.createElement("button");
    flowLintBatchRunBtn.className = "prop-btn";
    flowLintBatchRunBtn.textContent = "Batch quick-fix";
    flowLintBatchRunBtn.style.cssText = "width:100%;font-size:10px;padding:3px 6px;";
    flowLintBatchRunBtn.onclick = () => {
      const issueType = (flowLintBatchTypeSel?.value || "a11y-focus-trap") as FlowLintIssueType;
      const scope = (flowLintBatchScopeSel?.value === "all-frames" ? "all-frames" : "current-frame") as "current-frame" | "all-frames";
      const changed = runFlowLintBatchQuickFix(issueType, scope);
      if (changed > 0) editor.requestRender();
      flowLintBatchRunBtn!.textContent = changed > 0 ? `Fixed ${changed}` : "No-op";
      window.setTimeout(() => {
        if (flowLintBatchRunBtn) flowLintBatchRunBtn.textContent = "Batch quick-fix";
      }, 1200);
      renderFlowLint();
    };
    flowLintWrap.appendChild(flowLintBatchRunBtn);

    const focusTrapFixBtn = document.createElement("button");
    focusTrapFixBtn.className = "prop-btn";
    focusTrapFixBtn.textContent = "Quick fix focus trap";
    focusTrapFixBtn.style.cssText = "width:100%;font-size:10px;padding:3px 6px;";
    focusTrapFixBtn.onclick = () => {
      const changed = quickFixFocusTrapIssues();
      focusTrapFixBtn.textContent = changed > 0 ? `Fixed ${changed}` : "No fix needed";
      window.setTimeout(() => {
        focusTrapFixBtn.textContent = "Quick fix focus trap";
      }, 1100);
      renderFlowLint();
    };
    flowLintWrap.appendChild(focusTrapFixBtn);

    flowLintList = document.createElement("div");
    flowLintList.style.cssText = "display:flex;flex-direction:column;gap:4px;";
    flowLintWrap.appendChild(flowLintList);
    overlay.appendChild(flowLintWrap);

    focusTrapSimWrap = document.createElement("div");
    focusTrapSimWrap.style.cssText = "position:absolute;left:14px;top:634px;width:220px;max-height:200px;overflow:auto;background:rgba(30,16,16,0.92);border:1px solid rgba(248,113,113,0.35);border-radius:10px;padding:8px;z-index:4;display:flex;flex-direction:column;gap:6px;";
    const focusTrapHead = document.createElement("div");
    focusTrapHead.style.cssText = "font-size:11px;font-weight:600;color:#fecaca;";
    focusTrapHead.textContent = "Focus Trap Simulator";
    focusTrapSimWrap.appendChild(focusTrapHead);

    focusTrapSimInfo = document.createElement("div");
    focusTrapSimInfo.style.cssText = "font-size:10px;color:#fca5a5;line-height:1.35;";
    focusTrapSimInfo.textContent = "Run simulation to inspect overlay trap risks.";
    focusTrapSimWrap.appendChild(focusTrapSimInfo);

    const focusTrapBtnRow = document.createElement("div");
    focusTrapBtnRow.style.cssText = "display:flex;gap:6px;";
    const runFocusTrapBtn = document.createElement("button");
    runFocusTrapBtn.className = "prop-btn";
    runFocusTrapBtn.textContent = "Run simulation";
    runFocusTrapBtn.style.cssText = "flex:1;font-size:10px;padding:3px 6px;";
    runFocusTrapBtn.onclick = () => renderFocusTrapSimulator();
    focusTrapBtnRow.appendChild(runFocusTrapBtn);

    const fixAllFocusTrapBtn = document.createElement("button");
    fixAllFocusTrapBtn.className = "prop-btn";
    fixAllFocusTrapBtn.textContent = "Fix all";
    fixAllFocusTrapBtn.style.cssText = "flex:1;font-size:10px;padding:3px 6px;color:#fca5a5;border-color:rgba(248,113,113,0.5);";
    fixAllFocusTrapBtn.onclick = () => {
      const changed = quickFixFocusTrapIssues();
      fixAllFocusTrapBtn.textContent = changed > 0 ? `Fixed ${changed}` : "No fix needed";
      window.setTimeout(() => {
        fixAllFocusTrapBtn.textContent = "Fix all";
      }, 1100);
      renderFlowLint();
      renderFocusTrapSimulator();
    };
    focusTrapBtnRow.appendChild(fixAllFocusTrapBtn);
    focusTrapSimWrap.appendChild(focusTrapBtnRow);

    focusTrapSimList = document.createElement("div");
    focusTrapSimList.style.cssText = "display:flex;flex-direction:column;gap:4px;";
    focusTrapSimWrap.appendChild(focusTrapSimList);
    overlay.appendChild(focusTrapSimWrap);

    overlayStackWrap = document.createElement("div");
    overlayStackWrap.style.cssText = "position:absolute;left:14px;top:842px;width:220px;max-height:200px;overflow:auto;background:rgba(15,23,42,0.92);border:1px solid rgba(248,113,113,0.35);border-radius:10px;padding:8px;z-index:4;display:flex;flex-direction:column;gap:6px;";
    const overlayStackHead = document.createElement("div");
    overlayStackHead.style.cssText = "font-size:11px;font-weight:600;color:#fecaca;";
    overlayStackHead.textContent = "Overlay Stack Inspector";
    overlayStackWrap.appendChild(overlayStackHead);
    overlayStackInfo = document.createElement("div");
    overlayStackInfo.style.cssText = "font-size:10px;color:#fca5a5;line-height:1.35;";
    overlayStackInfo.textContent = "Analyzing overlay open/close stack…";
    overlayStackWrap.appendChild(overlayStackInfo);
    const overlayStackBtn = document.createElement("button");
    overlayStackBtn.className = "prop-btn";
    overlayStackBtn.textContent = "Fix orphan overlays";
    overlayStackBtn.style.cssText = "width:100%;font-size:10px;padding:3px 6px;color:#fca5a5;border-color:rgba(248,113,113,0.5);";
    overlayStackBtn.onclick = () => {
      const changed = quickFixOrphanOverlayRows();
      overlayStackBtn.textContent = changed > 0 ? `Fixed ${changed}` : "No-op";
      window.setTimeout(() => { overlayStackBtn.textContent = "Fix orphan overlays"; }, 1100);
      renderFlowLint();
      renderOverlayStackInspector();
    };
    overlayStackWrap.appendChild(overlayStackBtn);
    overlayStackList = document.createElement("div");
    overlayStackList.style.cssText = "display:flex;flex-direction:column;gap:4px;";
    overlayStackWrap.appendChild(overlayStackList);
    overlay.appendChild(overlayStackWrap);

    escapeRouteWrap = document.createElement("div");
    escapeRouteWrap.style.cssText = "position:absolute;left:14px;top:1050px;width:220px;max-height:200px;overflow:auto;background:rgba(15,23,42,0.92);border:1px solid rgba(248,113,113,0.35);border-radius:10px;padding:8px;z-index:4;display:flex;flex-direction:column;gap:6px;";
    const escapeRouteHead = document.createElement("div");
    escapeRouteHead.style.cssText = "font-size:11px;font-weight:600;color:#fecaca;";
    escapeRouteHead.textContent = "Overlay Escape Key Route Inspector";
    escapeRouteWrap.appendChild(escapeRouteHead);
    escapeRouteInfo = document.createElement("div");
    escapeRouteInfo.style.cssText = "font-size:10px;color:#fca5a5;line-height:1.35;";
    escapeRouteInfo.textContent = "Analyzing escape routes…";
    escapeRouteWrap.appendChild(escapeRouteInfo);
    const escapeRouteFixBtn = document.createElement("button");
    escapeRouteFixBtn.className = "prop-btn";
    escapeRouteFixBtn.textContent = "Fix trap branches";
    escapeRouteFixBtn.style.cssText = "width:100%;font-size:10px;padding:3px 6px;color:#fca5a5;border-color:rgba(248,113,113,0.5);";
    escapeRouteFixBtn.onclick = () => {
      const changed = quickFixFocusTrapIssues();
      escapeRouteFixBtn.textContent = changed > 0 ? `Fixed ${changed}` : "No-op";
      window.setTimeout(() => { escapeRouteFixBtn.textContent = "Fix trap branches"; }, 1100);
      renderFlowLint();
      renderEscapeRouteMap();
    };
    escapeRouteWrap.appendChild(escapeRouteFixBtn);
    escapeRouteList = document.createElement("div");
    escapeRouteList.style.cssText = "display:flex;flex-direction:column;gap:4px;";
    escapeRouteWrap.appendChild(escapeRouteList);
    overlay.appendChild(escapeRouteWrap);

    focusReturnWrap = document.createElement("div");
    focusReturnWrap.style.cssText = "position:absolute;left:14px;top:1258px;width:220px;max-height:200px;overflow:auto;background:rgba(15,23,42,0.92);border:1px solid rgba(251,146,60,0.35);border-radius:10px;padding:8px;z-index:4;display:flex;flex-direction:column;gap:6px;";
    const focusReturnHead = document.createElement("div");
    focusReturnHead.style.cssText = "font-size:11px;font-weight:600;color:#fdba74;";
    focusReturnHead.textContent = "Prototype Focus Return Map";
    focusReturnWrap.appendChild(focusReturnHead);
    focusReturnInfo = document.createElement("div");
    focusReturnInfo.style.cssText = "font-size:10px;color:#fdba74;line-height:1.35;";
    focusReturnInfo.textContent = "Analyzing overlay close return candidates…";
    focusReturnWrap.appendChild(focusReturnInfo);
    focusReturnList = document.createElement("div");
    focusReturnList.style.cssText = "display:flex;flex-direction:column;gap:4px;";
    focusReturnWrap.appendChild(focusReturnList);
    overlay.appendChild(focusReturnWrap);

    const condDebugWrap = document.createElement("div");
    condDebugWrap.style.cssText = "position:absolute;left:14px;top:1920px;width:220px;max-height:220px;overflow:auto;background:rgba(15,23,42,0.92);border:1px solid rgba(248,113,113,0.35);border-radius:10px;padding:8px;z-index:4;display:flex;flex-direction:column;gap:6px;";
    const condDebugHead = document.createElement("div");
    condDebugHead.style.cssText = "font-size:11px;font-weight:600;color:#fecaca;";
    condDebugHead.textContent = "Conditional Branch Debugger";
    condDebugWrap.appendChild(condDebugHead);
    condDebugInfo = document.createElement("div");
    condDebugInfo.style.cssText = "font-size:10px;color:#fca5a5;line-height:1.35;";
    condDebugInfo.textContent = "Analyzing conditional branches…";
    condDebugWrap.appendChild(condDebugInfo);
    condDebugList = document.createElement("div");
    condDebugList.style.cssText = "display:flex;flex-direction:column;gap:4px;";
    condDebugWrap.appendChild(condDebugList);
    overlay.appendChild(condDebugWrap);

    keyboardOrderWrap = document.createElement("div");
    keyboardOrderWrap.style.cssText = "position:absolute;left:14px;top:1484px;width:220px;max-height:220px;overflow:auto;background:rgba(15,23,42,0.92);border:1px solid rgba(148,163,184,0.3);border-radius:10px;padding:8px;z-index:4;display:flex;flex-direction:column;gap:6px;";
    const kbHead = document.createElement("div");
    kbHead.style.cssText = "font-size:11px;font-weight:600;color:#cbd5e1;";
    kbHead.textContent = "Keyboard Nav Order";
    keyboardOrderWrap.appendChild(kbHead);
    keyboardOrderInfo = document.createElement("div");
    keyboardOrderInfo.style.cssText = "font-size:10px;color:#94a3b8;line-height:1.35;";
    keyboardOrderWrap.appendChild(keyboardOrderInfo);
    const kbBtnRow = document.createElement("div");
    kbBtnRow.style.cssText = "display:flex;gap:6px;";
    const kbResetBtn = document.createElement("button");
    kbResetBtn.className = "prop-btn";
    kbResetBtn.textContent = "Reset auto";
    kbResetBtn.style.cssText = "flex:1;font-size:10px;padding:3px 6px;";
    kbResetBtn.onclick = () => {
      if (!currentFrameId) return;
      delete keyboardOrderMap[String(currentFrameId)];
      saveKeyboardOrderMap(keyboardOrderMap);
      renderKeyboardOrderEditor();
      renderCurrentView();
    };
    kbBtnRow.appendChild(kbResetBtn);
    keyboardOrderWrap.appendChild(kbBtnRow);
    keyboardOrderList = document.createElement("div");
    keyboardOrderList.style.cssText = "display:flex;flex-direction:column;gap:4px;";
    keyboardOrderWrap.appendChild(keyboardOrderList);
    overlay.appendChild(keyboardOrderWrap);

    coverageWrap = document.createElement("div");
    coverageWrap.style.cssText = "position:absolute;left:14px;top:1712px;width:220px;max-height:200px;overflow:auto;background:rgba(15,23,42,0.92);border:1px solid rgba(148,163,184,0.3);border-radius:10px;padding:8px;z-index:4;display:flex;flex-direction:column;gap:6px;";
    const coverageHead = document.createElement("div");
    coverageHead.style.cssText = "font-size:11px;font-weight:600;color:#cbd5e1;";
    coverageHead.textContent = "Flow Coverage";
    coverageWrap.appendChild(coverageHead);
    coverageInfo = document.createElement("div");
    coverageInfo.style.cssText = "font-size:10px;color:#94a3b8;line-height:1.35;";
    coverageWrap.appendChild(coverageInfo);
    const coverageBtnRow = document.createElement("div");
    coverageBtnRow.style.cssText = "display:flex;gap:6px;";
    const coverageResetBtn = document.createElement("button");
    coverageResetBtn.className = "prop-btn";
    coverageResetBtn.textContent = "Reset";
    coverageResetBtn.style.cssText = "flex:1;font-size:10px;padding:3px 6px;";
    coverageResetBtn.onclick = () => {
      coverageFrameVisits.clear();
      coverageHotspotHits.clear();
      trackCoverageFrameVisit(currentFrameId);
      renderCoveragePanel();
      renderCurrentView();
    };
    const coverageCopyBtn = document.createElement("button");
    coverageCopyBtn.className = "prop-btn";
    coverageCopyBtn.textContent = "Copy";
    coverageCopyBtn.style.cssText = "flex:1;font-size:10px;padding:3px 6px;";
    coverageCopyBtn.onclick = async () => {
      const lines = buildCoverageReportLines();
      try {
        await navigator.clipboard.writeText(lines.join("\n"));
        coverageCopyBtn.textContent = "Copied";
      } catch {
        coverageCopyBtn.textContent = "Copy fail";
      }
      window.setTimeout(() => { coverageCopyBtn.textContent = "Copy"; }, 900);
    };
    coverageBtnRow.append(coverageResetBtn, coverageCopyBtn);
    coverageWrap.appendChild(coverageBtnRow);
    coverageList = document.createElement("div");
    coverageList.style.cssText = "display:flex;flex-direction:column;gap:4px;";
    coverageWrap.appendChild(coverageList);
    overlay.appendChild(coverageWrap);

    timelineWrap = document.createElement("div");
    timelineWrap.style.cssText = "position:absolute;right:14px;top:52px;width:260px;max-height:300px;overflow:auto;background:rgba(15,23,42,0.92);border:1px solid rgba(148,163,184,0.3);border-radius:10px;padding:8px;z-index:4;display:flex;flex-direction:column;gap:6px;";
    const timelineHead = document.createElement("div");
    timelineHead.style.cssText = "font-size:11px;font-weight:600;color:#cbd5e1;";
    timelineHead.textContent = "Prototype Session Timeline";
    timelineWrap.appendChild(timelineHead);

    timelineInfo = document.createElement("div");
    timelineInfo.style.cssText = "font-size:10px;color:#94a3b8;line-height:1.35;";
    timelineInfo.textContent = "No timeline events yet";
    timelineWrap.appendChild(timelineInfo);

    timelineScrubber = document.createElement("input");
    timelineScrubber.type = "range";
    timelineScrubber.min = "0";
    timelineScrubber.max = "0";
    timelineScrubber.value = "0";
    timelineScrubber.style.cssText = "width:100%;";
    timelineScrubber.addEventListener("input", () => scrubToTimelineEvent(Number(timelineScrubber?.value || 0)));
    timelineWrap.appendChild(timelineScrubber);

    const timelineFilterRow = document.createElement("div");
    timelineFilterRow.style.cssText = "display:flex;gap:6px;align-items:center;";
    const timelineFilter = document.createElement("select");
    timelineFilter.style.cssText = "flex:1;background:#1e293b;border:1px solid rgba(148,163,184,0.35);border-radius:5px;color:#cbd5e1;font-size:10px;padding:2px 6px;";
    [["all", "All events"], ["frame", "Frame jumps"], ["interaction", "Interactions"]].forEach(([v, label]) => {
      const opt = document.createElement("option");
      opt.value = String(v);
      opt.textContent = String(label);
      timelineFilter.appendChild(opt);
    });
    timelineFilter.onchange = () => {
      timelineFilterMode = timelineFilter.value as "all" | "frame" | "interaction";
      renderTimelineScrubber();
    };
    timelineFilterRow.appendChild(timelineFilter);
    timelineWrap.appendChild(timelineFilterRow);

    const timelineBtns = document.createElement("div");
    timelineBtns.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;";
    const timelinePlayBtn = document.createElement("button");
    timelinePlayBtn.className = "prop-btn";
    timelinePlayBtn.textContent = "Play";
    timelinePlayBtn.style.cssText = "flex:1;font-size:10px;padding:4px 6px;";
    timelinePlayBtn.onclick = () => {
      if (timelineEvents.length < 2) return;
      clearTimelinePlaybackTimer();
      let idx = Number(timelineScrubber?.value || 0);
      const step = () => {
        scrubToTimelineEvent(idx);
        const cur = timelineEvents[idx];
        const next = timelineEvents[idx + 1];
        if (!cur || !next) return;
        idx += 1;
        const gap = Math.max(60, Math.min(1500, next.at - cur.at || cur.durationMs || 240));
        timelinePlaybackTimer = window.setTimeout(step, gap);
      };
      step();
    };
    const timelinePrevJumpBtn = document.createElement("button");
    timelinePrevJumpBtn.className = "prop-btn";
    timelinePrevJumpBtn.textContent = "← Jump";
    timelinePrevJumpBtn.style.cssText = "font-size:10px;padding:4px 6px;";
    timelinePrevJumpBtn.onclick = () => {
      if (!timelineEvents.length) return;
      const idx = Math.max(0, Math.min(timelineEvents.length - 1, Number(timelineScrubber?.value || 0)));
      for (let i = idx - 1; i >= 0; i -= 1) {
        if (timelineEvents[i]?.kind === "frame") {
          scrubToTimelineEvent(i);
          return;
        }
      }
    };

    const timelineNextJumpBtn = document.createElement("button");
    timelineNextJumpBtn.className = "prop-btn";
    timelineNextJumpBtn.textContent = "Jump →";
    timelineNextJumpBtn.style.cssText = "font-size:10px;padding:4px 6px;";
    timelineNextJumpBtn.onclick = () => {
      if (!timelineEvents.length) return;
      const idx = Math.max(0, Math.min(timelineEvents.length - 1, Number(timelineScrubber?.value || 0)));
      for (let i = idx + 1; i < timelineEvents.length; i += 1) {
        if (timelineEvents[i]?.kind === "frame") {
          scrubToTimelineEvent(i);
          return;
        }
      }
    };

    const timelineClearBtn = document.createElement("button");
    timelineClearBtn.className = "prop-btn";
    timelineClearBtn.textContent = "Clear";
    timelineClearBtn.style.cssText = "font-size:10px;padding:4px 6px;";
    timelineClearBtn.onclick = () => {
      clearTimelinePlaybackTimer();
      timelineEvents = [];
      timelineSeq = 1;
      renderTimelineScrubber();
    };
    timelineBtns.appendChild(timelinePlayBtn);
    timelineBtns.appendChild(timelinePrevJumpBtn);
    timelineBtns.appendChild(timelineNextJumpBtn);
    timelineBtns.appendChild(timelineClearBtn);
    timelineWrap.appendChild(timelineBtns);

    timelineList = document.createElement("div");
    timelineList.style.cssText = "display:flex;flex-direction:column;gap:4px;";
    timelineWrap.appendChild(timelineList);
    overlay.appendChild(timelineWrap);

    stagePreviewWrap = document.createElement("div");
    stagePreviewWrap.style.cssText = "position:absolute;right:14px;top:360px;width:260px;background:rgba(15,23,42,0.92);border:1px solid rgba(148,163,184,0.3);border-radius:10px;padding:8px;z-index:4;display:flex;flex-direction:column;gap:6px;";
    const stageHead = document.createElement("div");
    stageHead.style.cssText = "font-size:11px;font-weight:600;color:#cbd5e1;";
    stageHead.textContent = "Smart Animate Stage Preview";
    stagePreviewWrap.appendChild(stageHead);

    stagePreviewInfo = document.createElement("div");
    stagePreviewInfo.style.cssText = "font-size:10px;color:#94a3b8;line-height:1.35;";
    stagePreviewInfo.textContent = "Run a transition and inspect start/mid/end stages.";
    stagePreviewWrap.appendChild(stagePreviewInfo);

    stagePreviewCanvas = document.createElement("canvas");
    stagePreviewCanvas.width = 520;
    stagePreviewCanvas.height = 260;
    stagePreviewCanvas.style.cssText = "width:100%;height:120px;border-radius:6px;background:#020617;";
    stagePreviewWrap.appendChild(stagePreviewCanvas);

    stagePreviewScrubber = document.createElement("input");
    stagePreviewScrubber.type = "range";
    stagePreviewScrubber.min = "0";
    stagePreviewScrubber.max = "100";
    stagePreviewScrubber.value = "50";
    stagePreviewScrubber.style.cssText = "width:100%;";
    stagePreviewScrubber.oninput = () => renderStagePreviewFrame(Number(stagePreviewScrubber?.value || 0) / 100);
    stagePreviewWrap.appendChild(stagePreviewScrubber);

    const stageBtnRow = document.createElement("div");
    stageBtnRow.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;";
    const mkStageBtn = (label: string, v: number) => {
      const btn = document.createElement("button");
      btn.className = "prop-btn";
      btn.textContent = label;
      btn.style.cssText = "font-size:10px;padding:3px 6px;";
      btn.onclick = () => {
        if (stagePreviewScrubber) stagePreviewScrubber.value = String(v);
        renderStagePreviewFrame(v / 100);
      };
      return btn;
    };
    stageBtnRow.appendChild(mkStageBtn("Start", 0));
    stageBtnRow.appendChild(mkStageBtn("Mid", 50));
    stageBtnRow.appendChild(mkStageBtn("End", 100));

    const onionBtn = document.createElement("button");
    onionBtn.className = "prop-btn";
    onionBtn.style.cssText = "font-size:10px;padding:3px 6px;";
    const syncOnionLabel = () => { onionBtn.textContent = stagePreviewOnion ? "Onion ON" : "Onion OFF"; };
    syncOnionLabel();
    onionBtn.onclick = () => {
      stagePreviewOnion = !stagePreviewOnion;
      syncOnionLabel();
      renderStagePreviewFrame(Number(stagePreviewScrubber?.value || 0) / 100);
    };
    stageBtnRow.appendChild(onionBtn);
    stagePreviewWrap.appendChild(stageBtnRow);

    overlay.appendChild(stagePreviewWrap);

    sessionSnapshotWrap = document.createElement("div");
    sessionSnapshotWrap.style.cssText = "position:absolute;right:14px;top:572px;width:260px;max-height:280px;overflow:auto;background:rgba(15,23,42,0.92);border:1px solid rgba(148,163,184,0.3);border-radius:10px;padding:8px;z-index:4;display:flex;flex-direction:column;gap:6px;";
    const ssHead = document.createElement("div");
    ssHead.style.cssText = "font-size:11px;font-weight:600;color:#cbd5e1;";
    ssHead.textContent = "Session Snapshot Comparator";
    sessionSnapshotWrap.appendChild(ssHead);

    const ssBtnRow = document.createElement("div");
    ssBtnRow.style.cssText = "display:flex;gap:6px;";
    const ssCaptureBtn = document.createElement("button");
    ssCaptureBtn.className = "prop-btn";
    ssCaptureBtn.textContent = "Capture current";
    ssCaptureBtn.style.cssText = "flex:1;font-size:10px;padding:4px 6px;";
    ssCaptureBtn.onclick = () => captureSessionSnapshot();
    const ssClearBtn = document.createElement("button");
    ssClearBtn.className = "prop-btn";
    ssClearBtn.textContent = "Clear";
    ssClearBtn.style.cssText = "font-size:10px;padding:4px 6px;";
    ssClearBtn.onclick = () => {
      sessionSnapshots = [];
      renderSessionSnapshotComparator();
    };
    ssBtnRow.appendChild(ssCaptureBtn);
    ssBtnRow.appendChild(ssClearBtn);
    sessionSnapshotWrap.appendChild(ssBtnRow);

    const ssSelRow = document.createElement("div");
    ssSelRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:6px;";
    sessionSnapshotSelectA = document.createElement("select");
    sessionSnapshotSelectA.style.cssText = "background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:4px 6px;font-size:10px;";
    sessionSnapshotSelectA.onchange = () => renderSessionSnapshotComparator();
    sessionSnapshotSelectB = document.createElement("select");
    sessionSnapshotSelectB.style.cssText = sessionSnapshotSelectA.style.cssText;
    sessionSnapshotSelectB.onchange = () => renderSessionSnapshotComparator();
    ssSelRow.appendChild(sessionSnapshotSelectA);
    ssSelRow.appendChild(sessionSnapshotSelectB);
    sessionSnapshotWrap.appendChild(ssSelRow);

    sessionSnapshotInfo = document.createElement("div");
    sessionSnapshotInfo.style.cssText = "font-size:10px;color:#94a3b8;line-height:1.35;";
    sessionSnapshotInfo.textContent = "Capture snapshots to compare runtime state.";
    sessionSnapshotWrap.appendChild(sessionSnapshotInfo);

    sessionSnapshotList = document.createElement("div");
    sessionSnapshotList.style.cssText = "display:flex;flex-direction:column;gap:4px;";
    sessionSnapshotWrap.appendChild(sessionSnapshotList);
    overlay.appendChild(sessionSnapshotWrap);

    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("paste", onPaste);
    window.addEventListener(INTERACTIVE_PREVIEW_EVENT, onInteractivePreviewEvent as EventListener);
    window.addEventListener("opensketch:prototype-reduced-motion-changed", onReducedMotionChanged as EventListener);

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
    renderTimelineScrubber();
    lastTransitionPreview = null;
    if (stagePreviewScrubber) stagePreviewScrubber.value = "50";
    renderStagePreviewFrame(0.5);
    renderSessionSnapshotComparator();
    renderKeyboardOrderEditor();
    trackCoverageFrameVisit(currentFrameId);
    renderCoveragePanel();

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
    window.removeEventListener("opensketch:prototype-reduced-motion-changed", onReducedMotionChanged as EventListener);
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
    flowLintFilterWrap = null;
    flowLintList = null;
    flowLintSnapshot = null;
    flowLintRenderedIssues = [];
    flowLintNavIndex = -1;
    clearTimelinePlaybackTimer();
    timelineWrap = null;
    timelineInfo = null;
    timelineScrubber = null;
    timelineList = null;
    timelineEvents = [];
    sessionSnapshotWrap = null;
    sessionSnapshotInfo = null;
    sessionSnapshotList = null;
    sessionSnapshotSelectA = null;
    sessionSnapshotSelectB = null;
    sessionSnapshots = [];
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

    if (e.shiftKey && (e.key === "N" || e.key === "n")) {
      e.preventDefault();
      jumpFlowLintIssue(1);
      if (recorderEnabled) recordEvent({ kind: "input", frameId: currentFrameId, inputType: "key", key: "Shift+N" });
      return;
    }
    if (e.shiftKey && (e.key === "P" || e.key === "p")) {
      e.preventDefault();
      jumpFlowLintIssue(-1);
      if (recorderEnabled) recordEvent({ kind: "input", frameId: currentFrameId, inputType: "key", key: "Shift+P" });
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

  function applyMotionGuardrails(transition: string, durationMs: number, easing: string): { transition: string; durationMs: number; easing: string } {
    if (!reducedMotionPreview) return { transition, durationMs, easing };
    const nextDuration = Math.max(0, Math.min(180, Number(durationMs || 0)));
    const nextTransition = transition === "Instant" ? "Instant" : "Dissolve";
    return { transition: nextTransition, durationMs: nextDuration, easing: "ease_out" };
  }

  function navigateTo(frameId: number, transition: string = "Instant", durationMs: number = 300, easing: string = "ease_in_out", timeline?: SmartTimelineKeyframe[]) {
    if (transitioning) return;
    const prevFrameId = currentFrameId;
    if (currentFrameId !== null) navigationStack.push(currentFrameId);
    currentFrameId = frameId;
    trackCoverageFrameVisit(currentFrameId);
    const guarded = applyMotionGuardrails(transition, durationMs, easing);
    recordEvent({ kind: "navigate", frameId: prevFrameId, toFrameId: frameId, action: "NavigateTo" });
    pushTimelineEvent({ action: "NavigateTo", fromFrameId: prevFrameId, toFrameId: frameId, transition: guarded.transition, durationMs: guarded.durationMs });

    if (prevFrameId) {
      lastTransitionPreview = {
        fromId: prevFrameId,
        toId: frameId,
        transition: guarded.transition,
        durationMs: guarded.durationMs,
        easing: guarded.easing,
        timeline,
      };
      renderStagePreviewFrame(Number(stagePreviewScrubber?.value || 50) / 100);
    }

    if (guarded.transition === "Instant" || !prevFrameId) {
      renderCurrentView();
      return;
    }

    performTransition(prevFrameId, frameId, guarded.transition, guarded.durationMs, guarded.easing, timeline);
  }

  function navigateBack() {
    if (transitioning) return;
    if (navigationStack.length > 0) {
      const fromFrame = currentFrameId;
      currentFrameId = navigationStack.pop()!;
      trackCoverageFrameVisit(currentFrameId);
      pushTimelineEvent({ action: "Back", fromFrameId: fromFrame, toFrameId: currentFrameId, transition: "Instant", durationMs: 0 });
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
    drawFocusScopePreviewMask(ctx, bounds, scale * dpr);
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
    renderCoveragePanel();
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

  function shouldShowEscapeIntentHint(nodeId: number, interaction: any, frameId: number | null = currentFrameId): boolean {
    if (!frameId || !hasIncomingOpenOverlay(frameId)) return false;
    const trigger = String(interaction?.trigger || "");
    const action = String(interaction?.action || "");
    if (trigger !== "OnClick" && trigger !== "OnPress") return false;
    if (action === "CloseOverlay" || action === "Back") return false;
    try {
      const rows: any[] = JSON.parse(editor.engine.get_all_interactions() || "[]") || [];
      const row = rows.find((r) => Number(r?.id || 0) === Number(nodeId));
      const list = Array.isArray(row?.interactions) ? row.interactions : [];
      return !list.some((item) => {
        const t = String(item?.trigger || "");
        const a = String(item?.action || "");
        return (t === "OnClick" || t === "OnPress") && (a === "CloseOverlay" || a === "Back");
      });
    } catch {
      return false;
    }
  }

  function getEscapeIntentTemplate(): string {
    return "권장: OnPress → CloseOverlay (Instant)";
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

  function hasIncomingOpenOverlay(frameId: number | null): boolean {
    if (!frameId) return false;
    try {
      const allInterJson = editor.engine.get_all_interactions();
      const nodesWithInter: any[] = JSON.parse(allInterJson || "[]");
      for (const nwi of nodesWithInter) {
        const interactions = Array.isArray(nwi?.interactions) ? nwi.interactions : [];
        for (const interaction of interactions) {
          if (String(interaction?.action || "") !== "OpenOverlay") continue;
          if (Number(interaction?.target_node_id || 0) === frameId) return true;
        }
      }
    } catch {}
    return false;
  }

  function drawFocusScopePreviewMask(ctx: CanvasRenderingContext2D, frameBounds: { x: number; y: number; width: number; height: number }, totalScale: number) {
    if (!currentFrameId || !hasIncomingOpenOverlay(currentFrameId)) return;
    const focusables = listFocusableHotspots(currentFrameId);
    if (focusables.length === 0) return;

    const hasEscape = focusables.some((item) => {
      const action = String(item.interaction?.action || "");
      return action === "CloseOverlay" || action === "Back";
    });

    const canvasW = viewCanvas?.width || 0;
    const canvasH = viewCanvas?.height || 0;
    if (canvasW <= 0 || canvasH <= 0) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, canvasW, canvasH);
    for (const item of focusables) {
      drawInteractionHotspotPath(ctx, item.node, item.interaction, frameBounds, totalScale);
    }
    ctx.fillStyle = hasEscape ? "rgba(15,23,42,0.45)" : "rgba(127,29,29,0.45)";
    ctx.fill("evenodd");

    for (const item of focusables) {
      ctx.beginPath();
      drawInteractionHotspotPath(ctx, item.node, item.interaction, frameBounds, totalScale);
      ctx.lineWidth = hasEscape ? 2 : 2.5;
      ctx.strokeStyle = hasEscape ? "rgba(56,189,248,0.95)" : "rgba(248,113,113,0.95)";
      ctx.setLineDash([6, 4]);
      ctx.stroke();
    }

    const badge = hasEscape
      ? `Focus scope ${focusables.length} hotspot(s)`
      : `Focus scope ${focusables.length} hotspot(s) · escape missing`;
    const padX = 8;
    const padY = 4;
    ctx.setLineDash([]);
    ctx.font = "11px sans-serif";
    const bw = ctx.measureText(badge).width + padX * 2;
    const bh = 20;
    ctx.fillStyle = hasEscape ? "rgba(2,132,199,0.9)" : "rgba(185,28,28,0.92)";
    ctx.fillRect(10, 10, bw, bh);
    ctx.fillStyle = "#f8fafc";
    ctx.fillText(badge, 10 + padX, 10 + bh - padY - 1);
    ctx.restore();
  }

  function drawHotspotHints(ctx: CanvasRenderingContext2D, frameBounds: { x: number; y: number; width: number; height: number }, totalScale: number) {
    const allInterJson = editor.engine.get_all_interactions();
    const nodesWithInter: any[] = JSON.parse(allInterJson || "[]");
    const orderedFocusable = listFocusableHotspots(currentFrameId);
    const orderRank = new Map<string, number>();
    orderedFocusable.forEach((item, idx) => orderRank.set(item.key, idx + 1));
    const flowId = detectFlowIdForFrame(currentFrameId);
    const ringGuard = resolveRingPresetForFlow(flowId);
    const ringPreset = ringGuard.preset;

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
      const nodeClickCount = interactionList.filter((it: any) => it?.trigger === "OnClick").length;
      const nodePressCount = interactionList.filter((it: any) => it?.trigger === "OnPress").length;
      const keyboardGapSeverity = Math.max(0, nodeClickCount - nodePressCount);
      if (keyboardGapSeverity > 0) {
        const cx = x + w * 0.5;
        const cy = y + h * 0.5;
        const radius = Math.max(18, Math.min(96, Math.max(w, h) * (0.3 + keyboardGapSeverity * 0.08)));
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0, "rgba(248,113,113,0.34)");
        grad.addColorStop(0.55, "rgba(248,113,113,0.16)");
        grad.addColorStop(1, "rgba(248,113,113,0)");
        ctx.save();
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (interactionList.length === 0) {
        ctx.strokeRect(x, y, w, h);
      } else {
        const frameVisited = currentFrameId ? (coverageHotspotHits.get(currentFrameId) || new Set<string>()) : new Set<string>();
        for (const interaction of interactionList) {
          const sig = interactionSignature(interaction);
          const isHotInteraction = isHotNode && hoveredHotspotSig && sig === hoveredHotspotSig;
          const covKey = hotspotOrderKey(Number(nwi.id), sig);
          const covTracked = interaction?.trigger === "OnClick" || interaction?.trigger === "OnPress";
          if (covTracked) {
            const covered = frameVisited.has(covKey);
            ctx.save();
            ctx.setLineDash([]);
            ctx.beginPath();
            drawInteractionHotspotPath(ctx, node, interaction, frameBounds, totalScale);
            ctx.fillStyle = covered ? "rgba(34,197,94,0.14)" : "rgba(239,68,68,0.18)";
            ctx.fill();
            ctx.restore();
          }
          ctx.lineWidth = isFocused ? 4 : (isHotInteraction ? 4 : (isHotNode ? 3 : 2));
          ctx.beginPath();
          drawInteractionHotspotPath(ctx, node, interaction, frameBounds, totalScale);
          ctx.stroke();

          if (shouldShowEscapeIntentHint(Number(nwi.id), interaction, currentFrameId)) {
            ctx.save();
            ctx.setLineDash([]);
            ctx.fillStyle = "rgba(127,29,29,0.95)";
            ctx.strokeStyle = "rgba(252,165,165,0.95)";
            ctx.lineWidth = 1;
            const bx = x + Math.max(0, w - 72);
            const by = y + 4;
            if ((ctx as any).roundRect) {
              ctx.beginPath();
              (ctx as any).roundRect(bx, by, 68, 14, 6);
              ctx.fill();
              ctx.stroke();
            } else {
              ctx.fillRect(bx, by, 68, 14);
              ctx.strokeRect(bx, by, 68, 14);
            }
            ctx.fillStyle = "#fee2e2";
            ctx.font = "9px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("ESCAPE?", bx + 34, by + 7.5);
            ctx.restore();
          }

          const rank = orderRank.get(covKey);
          if (rank) {
            const bx = x + 6;
            const by = y + 6 + (rank % 3) * 14;
            ctx.save();
            ctx.setLineDash([]);
            ctx.fillStyle = "rgba(15,23,42,0.95)";
            ctx.strokeStyle = "rgba(250,204,21,0.85)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(bx, by, 22, 12, 6);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#fef08a";
            ctx.font = "9px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(rank), bx + 11, by + 6.5);
            ctx.restore();
          }
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
    if (ringReleaseMode && flowId && flowId > 0 && ringGuard.bucket !== "safe" && ringGuard.policy !== "off") {
      const msg = ringGuard.forcedSafe
        ? `Release guard: ${ringGuard.bucket} preset auto-normalized to Safe`
        : `Release guard: ${ringGuard.bucket} preset (warning only)`;
      ctx.save();
      ctx.setLineDash([]);
      ctx.font = "10px sans-serif";
      const padX = 6;
      const padY = 4;
      const w = ctx.measureText(msg).width + padX * 2;
      const h = 16;
      const x = 10;
      const y = Math.max(34, (viewCanvas?.height || 0) - h - 10);
      ctx.fillStyle = ringGuard.forcedSafe ? "rgba(185,28,28,0.92)" : "rgba(180,83,9,0.9)";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#fef2f2";
      ctx.fillText(msg, x + padX, y + h - padY);
      ctx.restore();
    }
    ctx.restore();
  }

  function hasInteractionCondition(inter: any): boolean {
    return !!resolveInteractionCondition(inter);
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
      const candidates = interactions.filter((i: any) => i.trigger === triggerFilter && (!node || pointInHotspot(sceneX, sceneY, node, i)));
      if (node && candidates.length) {
        const conditionals = candidates.filter((i: any) => hasInteractionCondition(i));
        const fallbacks = candidates.filter((i: any) => !hasInteractionCondition(i));
        const branch = conditionals.find((i: any) => checkCondition(i))
          || fallbacks.find((i: any) => checkCondition(i));
        if (branch) return { interaction: branch, node };
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

    trackCoverageHotspotHit(currentFrameId, sourceNodeId, inter);
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
  const onReducedMotionChanged = (ev: Event) => {
    const detail = (ev as CustomEvent).detail || {};
    if (detail?.key && String(detail.key) !== PROTOTYPE_REDUCED_MOTION_KEY && !String(detail.key).startsWith(`${PROTOTYPE_REDUCED_MOTION_KEY}-`)) return;
    reducedMotionPreview = !!detail?.enabled;
  };
  let mousePressNodeId: number | null = null;
  let mousePressX = 0;
  let mousePressY = 0;
  let isDragging = false;

  function listFocusableHotspots(frameId: number | null = currentFrameId): Array<{ nodeId: number; node: any; interaction: any; sig: string; key: string }> {
    const out: Array<{ nodeId: number; node: any; interaction: any; sig: string; key: string }> = [];
    if (!frameId) return out;
    const fb = getFrameBounds(frameId);
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
          const sig = interactionSignature(interaction);
          out.push({ nodeId: Number(nwi.id), node, interaction, sig, key: hotspotOrderKey(Number(nwi.id), sig) });
        }
      }
    }
    out.sort((a, b) => {
      const ay = Number(a.node?.y || 0), by = Number(b.node?.y || 0);
      if (Math.abs(ay - by) > 2) return ay - by;
      return Number(a.node?.x || 0) - Number(b.node?.x || 0);
    });
    const key = String(frameId);
    const custom = Array.isArray(keyboardOrderMap[key]) ? keyboardOrderMap[key] : [];
    if (custom.length) {
      const rank = new Map<string, number>();
      custom.forEach((entry, idx) => { if (!rank.has(entry)) rank.set(entry, idx); });
      out.sort((a, b) => {
        const aLegacy = String(a.nodeId);
        const bLegacy = String(b.nodeId);
        const ra = rank.has(a.key) ? rank.get(a.key)! : (rank.has(aLegacy) ? rank.get(aLegacy)! : Number.MAX_SAFE_INTEGER);
        const rb = rank.has(b.key) ? rank.get(b.key)! : (rank.has(bLegacy) ? rank.get(bLegacy)! : Number.MAX_SAFE_INTEGER);
        if (ra !== rb) return ra - rb;
        const ay = Number(a.node?.y || 0), by = Number(b.node?.y || 0);
        if (Math.abs(ay - by) > 2) return ay - by;
        return Number(a.node?.x || 0) - Number(b.node?.x || 0);
      });
    }
    return out;
  }

  function getKeyboardTriggerGaps(frameId: number | null = currentFrameId): Array<{ nodeId: number; x: number; y: number; width: number; height: number; clickCount: number; pressCount: number; severity: number }> {
    if (!frameId || frameId <= 0) return [];
    const fb = getFrameBounds(frameId);
    const bounds = fb || { x: 0, y: 0, width: 800, height: 600 };
    const allInterJson = editor.engine.get_all_interactions();
    const nodesWithInter: any[] = JSON.parse(allInterJson || "[]");
    const rows: Array<{ nodeId: number; x: number; y: number; width: number; height: number; clickCount: number; pressCount: number; severity: number }> = [];
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
      const clickCount = interactions.filter((it: any) => it?.trigger === "OnClick").length;
      const pressCount = interactions.filter((it: any) => it?.trigger === "OnPress").length;
      if (clickCount <= 0) continue;
      const severity = Math.max(0, clickCount - pressCount);
      if (severity <= 0) continue;
      rows.push({ nodeId: Number(nwi.id), x: nx, y: ny, width: nw, height: nh, clickCount, pressCount, severity });
    }
    return rows;
  }

  function trackCoverageFrameVisit(frameId: number | null) {
    if (!frameId || frameId <= 0) return;
    coverageFrameVisits.set(frameId, (coverageFrameVisits.get(frameId) || 0) + 1);
  }

  function trackCoverageHotspotHit(frameId: number | null, nodeId: number | undefined, interaction: any) {
    if (!frameId || frameId <= 0 || !nodeId || nodeId <= 0 || !interaction) return;
    const sig = interactionSignature(interaction);
    const key = hotspotOrderKey(nodeId, sig);
    const set = coverageHotspotHits.get(frameId) || new Set<string>();
    set.add(key);
    coverageHotspotHits.set(frameId, set);
  }

  function getCoverageFrameRows() {
    const frameIds = Array.from(coverageFrameVisits.keys()).sort((a, b) => b - a);
    return frameIds.map((frameId) => {
      const items = listFocusableHotspots(frameId);
      const visited = coverageHotspotHits.get(frameId) || new Set<string>();
      const unvisited = items.filter((item) => !visited.has(item.key));
      return { frameId, items, visited, unvisited };
    });
  }

  function buildCoverageReportLines(): string[] {
    const rows = getCoverageFrameRows();
    if (rows.length === 0) return ["Flow coverage report", "- no data yet"]; 
    const lines = ["Flow coverage report"];
    for (const row of rows) {
      const visits = coverageFrameVisits.get(row.frameId) || 0;
      lines.push(`- Frame #${row.frameId}: visits ${visits}, hotspots ${row.items.length - row.unvisited.length}/${row.items.length}`);
      if (row.unvisited.length) {
        for (const miss of row.unvisited.slice(0, 6)) {
          const action = String(miss.interaction?.action || "-");
          lines.push(`  · miss node #${miss.nodeId} (${action})`);
        }
        if (row.unvisited.length > 6) lines.push(`  · ... +${row.unvisited.length - 6} more`);
      }
    }
    return lines;
  }

  function renderCoveragePanel() {
    if (!coverageInfo || !coverageList) return;
    const rows = getCoverageFrameRows();
    const totalFrames = rows.length;
    let visitedHotspots = 0;
    let totalHotspots = 0;
    let missingHotspots = 0;
    for (const row of rows) {
      totalHotspots += row.items.length;
      visitedHotspots += row.items.length - row.unvisited.length;
      missingHotspots += row.unvisited.length;
    }
    const triggerGaps = getKeyboardTriggerGaps(currentFrameId);
    const triggerGapCount = triggerGaps.length;
    const triggerGapSeverity = triggerGaps.reduce((sum, row) => sum + row.severity, 0);
    coverageInfo.textContent = totalFrames
      ? `Visited ${totalFrames} frame(s) · Hotspots ${visitedHotspots}/${totalHotspots} · Missing ${missingHotspots} · Kbd gaps ${triggerGapCount} (sev ${triggerGapSeverity})`
      : `No coverage yet. Navigate prototype to collect session coverage.${triggerGapCount ? ` Current frame kbd gaps: ${triggerGapCount}` : ""}`;
    coverageList.innerHTML = "";
    if (!totalFrames) return;

    rows.forEach((row) => {
      const visits = coverageFrameVisits.get(row.frameId) || 0;
      const total = row.items.length;
      const hit = total - row.unvisited.length;
      const ratio = total > 0 ? hit / total : 0;
      const rowEl = document.createElement("button");
      rowEl.className = "prop-btn";
      rowEl.style.cssText = "display:flex;flex-direction:column;align-items:stretch;gap:3px;padding:5px 6px;text-align:left;";
      rowEl.onclick = () => {
        currentFrameId = row.frameId;
        renderCurrentView();
      };
      const label = document.createElement("div");
      label.style.cssText = "font-size:10px;color:#e2e8f0;display:flex;justify-content:space-between;gap:6px;";
      label.textContent = `#${row.frameId} · visits ${visits} · ${hit}/${total || 0}`;
      const miss = document.createElement("div");
      miss.style.cssText = "font-size:9px;color:#94a3b8;";
      if (row.unvisited.length > 0) {
        const sample = row.unvisited.slice(0, 2).map((item) => `#${item.nodeId}`).join(", ");
        miss.textContent = `Unvisited ${row.unvisited.length}: ${sample}${row.unvisited.length > 2 ? "…" : ""}`;
      } else {
        miss.textContent = "All hotspots visited ✅";
      }
      const bar = document.createElement("div");
      bar.style.cssText = "height:5px;border-radius:999px;background:rgba(51,65,85,0.9);overflow:hidden;";
      const fill = document.createElement("div");
      const hue = Math.round(12 + ratio * 108);
      fill.style.cssText = `height:100%;width:${Math.max(4, Math.round(ratio * 100))}%;background:hsl(${hue} 90% 55%);`;
      bar.appendChild(fill);
      rowEl.append(label, miss, bar);
      coverageList.appendChild(rowEl);
    });
  }

  function renderKeyboardOrderEditor() {
    if (!keyboardOrderInfo || !keyboardOrderList) return;
    const frameId = currentFrameId;
    if (!frameId) {
      keyboardOrderInfo.textContent = "Open a frame to edit keyboard tab order.";
      keyboardOrderList.innerHTML = "";
      return;
    }

    const items = listFocusableHotspots(frameId);
    const key = String(frameId);
    const existing = Array.isArray(keyboardOrderMap[key]) ? keyboardOrderMap[key] : [];
    const nextOrder: string[] = [];
    for (const entry of existing) {
      if (!nextOrder.includes(entry) && items.some((it) => it.key === entry || String(it.nodeId) === entry)) {
        nextOrder.push(entry);
      }
    }
    for (const it of items) {
      if (!nextOrder.includes(it.key)) nextOrder.push(it.key);
    }
    keyboardOrderMap[key] = nextOrder.slice(0, 400);
    saveKeyboardOrderMap(keyboardOrderMap);

    const frameName = `Frame #${frameId}`;
    const customCount = nextOrder.filter((entry) => entry.includes("::")).length;
    keyboardOrderList.innerHTML = "";

    if (!items.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "font-size:10px;color:#64748b;";
      empty.textContent = "No OnClick/OnPress hotspots in current frame.";
      keyboardOrderList.appendChild(empty);
      return;
    }

    const getNodeCenter = (item: { node: any }) => {
      const x = Number(item.node?.x || 0);
      const y = Number(item.node?.y || 0);
      const w = Number(item.node?.width || 0);
      const h = Number(item.node?.height || 0);
      return { x: x + w / 2, y: y + h / 2 };
    };
    const frameBounds = getFrameBounds(frameId) || { x: 0, y: 0, width: 800, height: 600 };
    const frameDiag = Math.max(1, Math.hypot(Number(frameBounds.width || 0), Number(frameBounds.height || 0)));
    const jumpRiskByKey = new Map<string, { score: number; severe: boolean; fromNodeId: number | null }>();
    let severeJumpCount = 0;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (i === 0) {
        jumpRiskByKey.set(item.key, { score: 0, severe: false, fromNodeId: null });
        continue;
      }
      const prev = items[i - 1];
      const a = getNodeCenter(prev);
      const b = getNodeCenter(item);
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const normalized = Math.max(0, Math.min(1, dist / frameDiag));
      const severe = normalized >= 0.42;
      if (severe) severeJumpCount += 1;
      jumpRiskByKey.set(item.key, { score: normalized, severe, fromNodeId: prev.nodeId });
    }

    keyboardOrderInfo.textContent = `${frameName} · ${items.length} keyboard hotspot(s) · custom ${customCount} · jumps ${severeJumpCount}`;

    const persistOrder = (nextKeys: string[]) => {
      keyboardOrderMap[key] = nextKeys.slice(0, 400);
      saveKeyboardOrderMap(keyboardOrderMap);
      renderKeyboardOrderEditor();
      renderCurrentView();
    };

    let dragKey: string | null = null;
    let dropKey: string | null = null;
    let dropBefore = true;

    const drawDropIndicator = () => {
      if (!keyboardOrderList) return;
      const rows = Array.from(keyboardOrderList.children) as HTMLDivElement[];
      rows.forEach((rowEl) => {
        rowEl.style.borderTopColor = "#334155";
        rowEl.style.borderBottomColor = "#334155";
      });
      if (!dropKey) return;
      const dropEl = rows.find((rowEl) => rowEl.dataset.orderKey === dropKey);
      if (!dropEl) return;
      if (dropBefore) {
        dropEl.style.borderTopColor = "#38bdf8";
      } else {
        dropEl.style.borderBottomColor = "#38bdf8";
      }
    };

    const applyDragOrder = (targetKey: string, before: boolean) => {
      if (!dragKey || dragKey === targetKey) return;
      const keys = items.map((it) => it.key);
      const from = keys.indexOf(dragKey);
      const toRaw = keys.indexOf(targetKey);
      if (from < 0 || toRaw < 0) return;
      const [moved] = keys.splice(from, 1);
      let to = toRaw;
      if (from < to) to -= 1;
      if (!before) to += 1;
      to = Math.max(0, Math.min(keys.length, to));
      keys.splice(to, 0, moved);
      persistOrder(keys);
    };

    items.forEach((item, idx) => {
      const row = document.createElement("div");
      row.dataset.orderKey = item.key;
      row.draggable = true;
      row.style.cssText = "display:grid;grid-template-columns:auto auto 1fr auto auto auto;gap:4px;align-items:center;padding:3px 5px;border:1px solid #334155;border-radius:5px;background:#0f172a;";
      row.ondragstart = (ev) => {
        dragKey = item.key;
        dropKey = item.key;
        dropBefore = true;
        row.style.opacity = "0.5";
        try {
          ev.dataTransfer?.setData("text/plain", item.key);
          if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
        } catch {}
        drawDropIndicator();
      };
      row.ondragend = () => {
        dragKey = null;
        dropKey = null;
        row.style.opacity = "1";
        drawDropIndicator();
      };
      row.ondragover = (ev) => {
        ev.preventDefault();
        const rect = row.getBoundingClientRect();
        dropBefore = ev.clientY < rect.top + rect.height / 2;
        dropKey = item.key;
        drawDropIndicator();
      };
      row.ondrop = (ev) => {
        ev.preventDefault();
        applyDragOrder(item.key, dropBefore);
      };

      const num = document.createElement("span");
      num.style.cssText = "font-size:9px;color:#94a3b8;";
      num.textContent = `${idx + 1}.`;

      const drag = document.createElement("span");
      drag.style.cssText = "font-size:10px;color:#64748b;cursor:grab;user-select:none;";
      drag.textContent = "⋮⋮";
      drag.title = "Drag to reorder";

      const trigger = String(item.interaction?.trigger || "").replace(/^On/, "");
      const action = String(item.interaction?.action || "");
      const nodeName = String(item.node?.name || `Node #${item.nodeId}`);
      const label = document.createElement("button");
      label.className = "prop-btn";
      label.style.cssText = "font-size:9px;text-align:left;justify-content:flex-start;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      label.textContent = `${nodeName} · ${trigger || "Click"} → ${action || "Action"}`;
      label.title = `Jump to hotspot on node #${item.nodeId}`;
      label.onclick = () => {
        focusedHotspotNodeId = item.nodeId;
        focusedHotspotInter = item.interaction;
        hoveredHotspotNodeId = item.nodeId;
        hoveredHotspotSig = item.sig;
        const baseLabel = item.interaction?.accessibility_label || nodeName;
        hoveredHotspotLabel = shouldShowEscapeIntentHint(item.nodeId, item.interaction, currentFrameId)
          ? `${baseLabel} · ${getEscapeIntentTemplate()}`
          : baseLabel;
        setFocusedInteractiveInstance(item.nodeId);
        renderCurrentView();
      };

      const risk = jumpRiskByKey.get(item.key) || { score: 0, severe: false, fromNodeId: null };
      const riskBadge = document.createElement("span");
      const heatHue = Math.round(120 - risk.score * 120);
      const bgAlpha = risk.severe ? 0.34 : 0.18;
      riskBadge.style.cssText = `font-size:8px;padding:1px 4px;border-radius:999px;border:1px solid hsl(${heatHue} 92% 55% / 0.6);background:hsl(${heatHue} 88% 46% / ${bgAlpha});color:#e2e8f0;min-width:34px;text-align:center;`;
      riskBadge.textContent = `${Math.round(risk.score * 100)}%`;
      riskBadge.title = risk.fromNodeId
        ? `Tab jump heat from #${risk.fromNodeId} → #${item.nodeId}`
        : "Start of tab order";
      if (risk.severe && risk.fromNodeId) {
        row.style.borderColor = "rgba(248,113,113,0.75)";
        label.title = `${label.title}\nDiscontinuous jump from #${risk.fromNodeId} (heat ${Math.round(risk.score * 100)}%)`;
      }

      const up = document.createElement("button");
      up.className = "prop-btn";
      up.style.cssText = "font-size:9px;padding:2px 4px;";
      up.textContent = "↑";
      up.disabled = idx === 0;
      up.onclick = () => {
        const keys = items.map((it) => it.key);
        [keys[idx - 1], keys[idx]] = [keys[idx], keys[idx - 1]];
        persistOrder(keys);
      };

      const down = document.createElement("button");
      down.className = "prop-btn";
      down.style.cssText = "font-size:9px;padding:2px 4px;";
      down.textContent = "↓";
      down.disabled = idx >= items.length - 1;
      down.onclick = () => {
        const keys = items.map((it) => it.key);
        [keys[idx + 1], keys[idx]] = [keys[idx], keys[idx + 1]];
        persistOrder(keys);
      };
      row.append(num, drag, label, riskBadge, up, down);
      keyboardOrderList.appendChild(row);
    });
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
    const focusedSig = focusedHotspotInter ? interactionSignature(focusedHotspotInter) : "";
    let idx = items.findIndex((it) => it.nodeId === focusedHotspotNodeId && it.sig === focusedSig);
    if (idx < 0 && focusedHotspotNodeId !== null) {
      idx = items.findIndex((it) => it.nodeId === focusedHotspotNodeId);
    }
    if (idx < 0) idx = reverse ? 0 : -1;
    idx = (idx + (reverse ? -1 : 1) + items.length) % items.length;
    const next = items[idx];
    focusedHotspotNodeId = next.nodeId;
    focusedHotspotInter = next.interaction;
    hoveredHotspotNodeId = next.nodeId;
    const baseLabel = next.interaction?.accessibility_label || next.node?.name || "";
    hoveredHotspotLabel = shouldShowEscapeIntentHint(next.nodeId, next.interaction, currentFrameId)
      ? `${baseLabel} · ${getEscapeIntentTemplate()}`
      : baseLabel;
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
    const baseHotLabel = hoverAny?.interaction?.accessibility_label || hoverAny?.node?.name || "";
    const withHint = hoverAny && shouldShowEscapeIntentHint(nextHotId, hoverAny.interaction, currentFrameId)
      ? `${baseHotLabel} · ${getEscapeIntentTemplate()}`
      : baseHotLabel;
    const nextHotLabel = withHint;
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

      // Prototype fixed/sticky layers: keep node visually pinned while current frame scrolls
      if (currentFrameId !== null && (frameScrollX !== 0 || frameScrollY !== 0)) {
        const frameJson = ed.engine.get_node_json(BigInt(currentFrameId));
        if (frameJson) {
          const frameNode = JSON.parse(frameJson);
          const frameTop = Number(frameNode.y ?? 0);
          const frameChildren: number[] = (frameNode.children || []).map((v: unknown) => Number(v));

          // Sticky candidates are direct Section children with sticky enabled.
          // Compute each section's sticky range [start, end], where end is next section top - own height.
          type StickyInfo = { top: number; height: number; end: number };
          const stickyInfos = new Map<number, StickyInfo>();
          const sectionRows: Array<{ id: number; top: number; height: number }> = [];
          for (const cid of frameChildren) {
            const cj = ed.engine.get_node_json(BigInt(cid));
            if (!cj) continue;
            const c = JSON.parse(cj);
            const kind = c?.kind ? Object.keys(c.kind)[0] : "";
            const stickyOn = !!(ed.engine as any).get_prototype_sticky?.(BigInt(cid));
            if (kind === "Section" && stickyOn) {
              sectionRows.push({ id: cid, top: Number(c.y ?? 0) - frameTop, height: Number(c.height ?? 0) });
            }
          }
          sectionRows.sort((a, b) => a.top - b.top);
          for (let i = 0; i < sectionRows.length; i++) {
            const row = sectionRows[i];
            const next = sectionRows[i + 1];
            const end = next ? (next.top - row.height) : Number.POSITIVE_INFINITY;
            stickyInfos.set(row.id, { top: row.top, height: row.height, end });
          }

          const stack: number[] = [...frameChildren];
          while (stack.length > 0) {
            const nodeId = Number(stack.pop());
            const nj = ed.engine.get_node_json(BigInt(nodeId));
            if (!nj) continue;
            const nd = JSON.parse(nj);
            const children: number[] = nd.children || [];
            for (const cid of children) stack.push(Number(cid));

            const curX = Number(nd.x ?? 0);
            const curY = Number(nd.y ?? 0);

            // Sticky sections: pin at top only after crossing top edge, release when next sticky section arrives.
            const stickyInfo = stickyInfos.get(nodeId);
            if (stickyInfo) {
              const backup = getBackup(nodeId);
              if (backup.y === undefined) backup.y = curY;
              const scrollPosY = -frameScrollY;
              const stickyTopLocal = Math.max(stickyInfo.top, Math.min(scrollPosY, stickyInfo.end));
              const desiredY = frameTop + stickyTopLocal + frameScrollY;
              if (Math.abs(desiredY - curY) > 0.01) {
                ed.engine.set_node_position(BigInt(nodeId), curX, desiredY);
              }
            }

            const isFixed = !!(ed.engine as any).get_prototype_fixed?.(BigInt(nodeId));
            if (!isFixed) continue;

            const regionRaw = String((ed.engine as any).get_prototype_fixed_region?.(BigInt(nodeId)) || "auto").toLowerCase();
            const region = regionRaw === "top" || regionRaw === "bottom" ? regionRaw : "auto";

            const backup = getBackup(nodeId);
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
    const now = performance.now();
    if (now - lastScrollTimelineAt > 180) {
      pushTimelineEvent({ action: "Scroll", fromFrameId: currentFrameId, toFrameId: currentFrameId, transition: "scroll", durationMs: 0, note: `frame #${scrollFrameId}` });
      lastScrollTimelineAt = now;
    }
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
