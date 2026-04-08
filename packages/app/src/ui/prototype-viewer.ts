import type { Editor } from "../editor";
import { applyEasing } from "./easing-editor";
import { computeScrollAnimOverrides } from "./scroll-animation";
import { applyThemeMode, detectActiveThemeMode, listThemeModeOptions } from "./variable-theme-modes";

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
  let varsPanel: HTMLDivElement | null = null;
  let snapPaginationEl: HTMLDivElement | null = null;
  let snapPaginationState: { frameId: number; axis: "x" | "y"; points: number[]; activeIndex: number } | null = null;

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

  /** Initialize prototype variables from engine definitions */
  function initProtoVars() {
    protoVars.clear();
    try {
      const defs: { name: string; var_type: string; default_value: string }[] =
        JSON.parse(editor.engine.get_prototype_variables());
      for (const v of defs) protoVars.set(v.name, v.default_value);
    } catch {}
  }

  /** Evaluate a SetVariable expression */
  function evalSetVariable(varName: string, expression: string) {
    const current = protoVars.get(varName) ?? "0";
    // Increment/decrement shorthand
    if (/^[+-]\d+(\.\d+)?$/.test(expression)) {
      const num = parseFloat(current) || 0;
      protoVars.set(varName, String(num + parseFloat(expression)));
    } else if (expression === "toggle") {
      protoVars.set(varName, current === "true" ? "false" : "true");
    } else {
      // Literal value
      protoVars.set(varName, expression);
    }
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
    varsPanel.innerHTML = "";

    // Section 1: prototype runtime vars
    if (protoVars.size > 0) {
      const title = document.createElement("div");
      title.style.cssText = "font-weight:700;margin-bottom:4px;color:#818cf8;";
      title.textContent = "Prototype Variables";
      varsPanel.appendChild(title);
      for (const [name, val] of protoVars) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;justify-content:space-between;gap:8px;padding:2px 0;";
        row.innerHTML = `<span style=\"color:#a5b4fc;\">${name}</span><span style=\"color:#4ade80;font-weight:600;\">${val}</span>`;
        varsPanel.appendChild(row);
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

      const byKey = new Map<string, { collectionName: string; variableName: string; modeName: string; value: string; count: number }>();
      let collections: any[] = [];
      try { collections = JSON.parse(editor.engine.get_variable_collections() || "[]") || []; } catch {}
      const subtree = collectSubtreeIds(currentFrameId);

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
          const key = `${colId}:${varId}`;
          const prev = byKey.get(key);
          byKey.set(key, {
            collectionName: String(col?.name || `Collection ${colId}`),
            variableName: String(v?.name || `Variable ${varId}`),
            modeName: String(mode?.name || "Default"),
            value: JSON.stringify(value ?? null),
            count: (prev?.count || 0) + 1,
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
          row.innerHTML = `<div style=\"color:#fde68a;font-weight:600;\">${r.collectionName} / ${r.variableName}</div><div style=\"display:flex;justify-content:space-between;gap:8px;color:#cbd5e1;\"><span>${r.modeName}</span><span style=\"color:#86efac;font-family:ui-monospace,Menlo,monospace;\">${r.value}</span></div><div style=\"font-size:10px;color:#94a3b8;\">used by ${r.count} binding(s)</div>`;
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

    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKeyDown);

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

    // Initialize event runtime for JS callbacks
    eventRuntime = new EventRuntime(editor);
    eventRuntime.setNavigateCallback((pageId: number) => {
      editor.engine.set_active_page(BigInt(pageId));
      renderCurrentView();
    });

    // Build variables debug panel
    buildVarsPanel();

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
    overlay.remove();
    overlay = null;
    viewCanvas = null;
    snapPaginationEl = null;
    snapPaginationState = null;
    currentFrameId = null;
    navigationStack = [];
  }

  function onKeyDown(e: KeyboardEvent) {
    if (transitioning) return;
    if (e.key === "Escape") hide();
    else if (e.key === "ArrowLeft" || e.key === "Backspace") navigateBack();
  }

  function navigateTo(frameId: number, transition: string = "Instant", durationMs: number = 300, easing: string = "ease_in_out", timeline?: SmartTimelineKeyframe[]) {
    if (transitioning) return;
    const prevFrameId = currentFrameId;
    if (currentFrameId !== null) navigationStack.push(currentFrameId);
    currentFrameId = frameId;

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
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, offscreen.width, offscreen.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);
    editor.engine.render(ctx as any);

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
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h);

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

    const allInterJson = editor.engine.get_all_interactions();
    const nodesWithInter: any[] = JSON.parse(allInterJson || "[]");

    for (const nwi of nodesWithInter) {
      const nj = editor.engine.get_node_json(Number(nwi.id));
      if (!nj) continue;
      const node = JSON.parse(nj);
      if (sceneX >= node.x && sceneX <= node.x + node.width &&
          sceneY >= node.y && sceneY <= node.y + node.height) {
        const inter = nwi.interactions.find((i: any) => i.trigger === triggerFilter);
        if (inter) return { interaction: inter, node };
      }
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
    try {
      const changed = editor.engine.apply_interactive_state(BigInt(instanceId), state);
      if (changed) renderCurrentView();
    } catch {}
  }

  /** Revert interactive state to original/default */
  function revertInteractiveState(instanceId: number) {
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
      let timeline: SmartTimelineKeyframe[] | undefined;
      try {
        const parsed = JSON.parse(inter.smart_animate_timeline_json || "[]");
        if (Array.isArray(parsed)) timeline = parsed as SmartTimelineKeyframe[];
      } catch {}
      navigateTo(targetId, inter.transition || "Instant", inter.transition_duration_ms || 300, inter.easing || "ease_in_out", timeline);
    } else if (inter.action === "Back") {
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
  let mousePressNodeId: number | null = null;
  let mousePressX = 0;
  let mousePressY = 0;
  let isDragging = false;

  function onCanvasMouseMove(e: MouseEvent) {
    if (!viewCanvas || transitioning || !eventRuntime) return;
    const nodeId = findNodeAtPoint(e.clientX, e.clientY);

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
      executeInteraction(match.interaction, Number(match.node?.node_id || 0));
    } else {
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
