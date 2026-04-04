import type { Editor } from "../editor";
import { applyEasing } from "./easing-editor";
import { computeScrollAnimOverrides } from "./scroll-animation";

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

  /** Check if an interaction's condition passes */
  function checkCondition(inter: any): boolean {
    if (!inter.condition) return true;
    const { variable, operator, value } = inter.condition;
    const current = protoVars.get(variable) ?? "";
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
    // String/boolean
    switch (operator) {
      case "Equal": return current === value;
      case "NotEqual": return current !== value;
      case "GreaterThan": return current > value;
      case "LessThan": return current < value;
      case "GreaterThanOrEqual": return current >= value;
      case "LessThanOrEqual": return current <= value;
    }
    return true;
  }

  /** Build floating variables debug panel */
  function buildVarsPanel() {
    if (!overlay) return;
    varsPanel = document.createElement("div");
    varsPanel.style.cssText = `
      position:absolute;bottom:12px;left:12px;
      background:rgba(22,33,62,0.92);border:1px solid #333;
      border-radius:8px;padding:8px 12px;z-index:2;
      font-size:11px;color:#ccc;min-width:140px;
      backdrop-filter:blur(8px);
    `;
    varsPanel.innerHTML = `<div style="font-weight:600;margin-bottom:4px;color:#818cf8;">Variables</div>`;
    overlay.appendChild(varsPanel);
    renderVarsPanel();
  }

  function renderVarsPanel() {
    if (!varsPanel) return;
    if (protoVars.size === 0) {
      varsPanel.style.display = "none";
      return;
    }
    varsPanel.style.display = "";
    // Keep header, rebuild rows
    const rows = varsPanel.querySelectorAll(".pv-row");
    rows.forEach(r => r.remove());
    for (const [name, val] of protoVars) {
      const row = document.createElement("div");
      row.className = "pv-row";
      row.style.cssText = "display:flex;justify-content:space-between;gap:8px;padding:2px 0;";
      row.innerHTML = `<span style="color:#aaa;">${name}</span><span style="color:#4ade80;font-weight:600;">${val}</span>`;
      varsPanel.appendChild(row);
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

    const closeBtn = document.createElement("button");
    closeBtn.style.cssText = "background:#e94560;color:white;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:12px;";
    closeBtn.textContent = "Close (Esc)";
    closeBtn.addEventListener("click", hide);
    topBar.appendChild(closeBtn);

    overlay.appendChild(topBar);

    viewCanvas = document.createElement("canvas");
    viewCanvas.style.cssText = "margin-top:40px;cursor:pointer;";
    overlay.appendChild(viewCanvas);

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
    stopMotionPathPlayback();
    document.removeEventListener("keydown", onKeyDown);
    overlay.remove();
    overlay = null;
    viewCanvas = null;
    currentFrameId = null;
    navigationStack = [];
  }

  function onKeyDown(e: KeyboardEvent) {
    if (transitioning) return;
    if (e.key === "Escape") hide();
    else if (e.key === "ArrowLeft" || e.key === "Backspace") navigateBack();
  }

  function navigateTo(frameId: number, transition: string = "Instant", durationMs: number = 300, easing: string = "ease_in_out") {
    if (transitioning) return;
    const prevFrameId = currentFrameId;
    if (currentFrameId !== null) navigationStack.push(currentFrameId);
    currentFrameId = frameId;

    if (transition === "Instant" || !prevFrameId) {
      renderCurrentView();
      return;
    }

    performTransition(prevFrameId, frameId, transition, durationMs, easing);
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

  /** Get viewport scale + display dimensions for a frame */
  function getViewportParams(bounds: { width: number; height: number }) {
    const maxW = window.innerWidth * 0.9;
    const maxH = (window.innerHeight - 50) * 0.9;
    const scale = Math.min(maxW / bounds.width, maxH / bounds.height, 2);
    return {
      scale,
      displayW: bounds.width * scale,
      displayH: bounds.height * scale,
    };
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
  function performTransition(fromId: number, toId: number, transition: string, durationMs: number, easingStr: string = "ease_in_out") {
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
      performSmartAnimate(fromId, toId, fromCanvas, toCanvas, durationMs, easingStr);
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
  function performSmartAnimate(fromId: number, toId: number, fromCanvas: HTMLCanvasElement, toCanvas: HTMLCanvasElement, durationMs: number, easingStr: string = "ease_in_out") {
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

    function ease(t: number): number {
      return applyEasing(easingStr, t);
    }

    function lerp(a: number, b: number, t: number): number {
      return a + (b - a) * t;
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
      navigateTo(targetId, inter.transition || "Instant", inter.transition_duration_ms || 300, inter.easing || "ease_in_out");
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

      for (const cid of childIds) {
        const cj = editor.engine.get_node_json(cid);
        if (!cj) continue;
        const c = JSON.parse(cj);
        const align = editor.engine.get_scroll_snap_align(BigInt(cid));
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

      let targetX = scrollOffset.x;
      let targetY = scrollOffset.y;

      if (snapsX && snapPointsX.length > 0) {
        const nearest = snapPointsX.reduce((a, b) => Math.abs(a - scrollOffset.x) < Math.abs(b - scrollOffset.x) ? a : b);
        const dist = Math.abs(nearest - scrollOffset.x);
        if (isMandatory || dist < proximityThreshold) targetX = nearest;
      }
      if (snapsY && snapPointsY.length > 0) {
        const nearest = snapPointsY.reduce((a, b) => Math.abs(a - scrollOffset.y) < Math.abs(b - scrollOffset.y) ? a : b);
        const dist = Math.abs(nearest - scrollOffset.y);
        if (isMandatory || dist < proximityThreshold) targetY = nearest;
      }

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
    const backups: ScrollAnimBackup[] = [];
    try {
      // Determine current scroll offset (sum of all scrollable ancestors)
      let scrollY = 0;
      if (currentFrameId !== null) {
        const so = JSON.parse(ed.engine.get_scroll_offset(BigInt(currentFrameId)));
        scrollY = -so.y; // scroll_offset is negative (content moves up)
      }

      const overrides = computeScrollAnimOverrides(ed.engine, scrollY);
      for (const [nodeId, props] of overrides) {
        const backup: ScrollAnimBackup = { nodeId };
        const nj = ed.engine.get_node_json(nodeId);
        if (!nj) continue;
        const nd = JSON.parse(nj);

        if ("opacity" in props) {
          backup.opacity = nd.opacity ?? 1;
          ed.engine.set_opacity(BigInt(nodeId), props.opacity);
        }
        if ("x" in props) {
          backup.x = nd.x ?? 0;
          ed.engine.set_x(BigInt(nodeId), props.x);
        }
        if ("y" in props) {
          backup.y = nd.y ?? 0;
          ed.engine.set_y(BigInt(nodeId), props.y);
        }
        if ("rotation" in props) {
          backup.rotation = nd.rotation ?? 0;
          ed.engine.set_rotation(BigInt(nodeId), props.rotation);
        }
        if ("blur" in props) {
          backup.blur = nd.blur ?? 0;
          ed.engine.set_blur(BigInt(nodeId), props.blur);
        }
        // scale: apply as uniform scale via width/height ratio (simplified)
        if ("scale" in props) {
          // For scale, we modify the node's transform scale (if available)
          // Fallback: adjust width/height proportionally
          // Note: actual scale transform would need engine support
        }

        backups.push(backup);
      }
    } catch (e) {
      // Silently fail — don't break prototype viewer
    }
    return backups;
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

    const scrollOffset = JSON.parse(editor.engine.get_scroll_offset(BigInt(scrollFrameId)));
    const nj = editor.engine.get_node_json(scrollFrameId);
    if (!nj) return;
    const node = JSON.parse(nj);

    // Calculate content bounds from children
    let contentW = node.width, contentH = node.height;
    const nodeChildren: number[] = node.children || [];
    for (const cid of nodeChildren) {
      const cj = editor.engine.get_node_json(cid);
      if (!cj) continue;
      const c = JSON.parse(cj);
      contentW = Math.max(contentW, (c.x - node.x) + c.width);
      contentH = Math.max(contentH, (c.y - node.y) + c.height);
    }

    let newScrollX = scrollsX ? scrollOffset.x - e.deltaX : scrollOffset.x;
    let newScrollY = scrollsY ? scrollOffset.y - e.deltaY : scrollOffset.y;

    const maxScrollX = -(contentW - node.width);
    const maxScrollY = -(contentH - node.height);
    if (scrollsX) newScrollX = Math.max(maxScrollX, Math.min(0, newScrollX));
    if (scrollsY) newScrollY = Math.max(maxScrollY, Math.min(0, newScrollY));

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

  function onTouchStart(e: TouchEvent) {
    if (!viewCanvas || transitioning) return;
    e.preventDefault();
    longPressFired = false;
    pinchActive = false;
    touchScrollFrameId = null;

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
      const nj = editor.engine.get_node_json(touchScrollFrameId);
      if (nj) {
        const node = JSON.parse(nj);
        let contentW = node.width, contentH = node.height;
        const nodeChildren: number[] = node.children || [];
        for (const cid of nodeChildren) {
          const cj = editor.engine.get_node_json(cid);
          if (!cj) continue;
          const c = JSON.parse(cj);
          contentW = Math.max(contentW, (c.x - node.x) + c.width);
          contentH = Math.max(contentH, (c.y - node.y) + c.height);
        }
        let newScrollX = scrollsX ? scrollOffset.x - sdx : scrollOffset.x;
        let newScrollY = scrollsY ? scrollOffset.y - sdy : scrollOffset.y;
        if (scrollsX) newScrollX = Math.max(-(contentW - node.width), Math.min(0, newScrollX));
        if (scrollsY) newScrollY = Math.max(-(contentH - node.height), Math.min(0, newScrollY));
        editor.engine.set_scroll_offset(BigInt(touchScrollFrameId), newScrollX, newScrollY);
        renderCurrentView();
      }
    }
  }

  function onTouchEnd(e: TouchEvent) {
    if (!viewCanvas || transitioning) return;
    e.preventDefault();

    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }

    // Trigger snap on touch end for scrollable frame
    if (touchScrollFrameId !== null) {
      scheduleSnap(touchScrollFrameId);
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
