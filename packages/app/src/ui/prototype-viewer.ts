import type { Editor } from "../editor";

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

    // Initialize event runtime for JS callbacks
    eventRuntime = new EventRuntime(editor);
    eventRuntime.setNavigateCallback((pageId: number) => {
      editor.engine.set_active_page(BigInt(pageId));
      renderCurrentView();
    });

    renderCurrentView();
    viewCanvas.addEventListener("click", onCanvasClick);
    viewCanvas.addEventListener("mousemove", onCanvasMouseMove);
    viewCanvas.addEventListener("mousedown", onCanvasMouseDown);
    viewCanvas.addEventListener("mouseup", onCanvasMouseUp);
    viewCanvas.addEventListener("dblclick", onCanvasDblClick);
    viewCanvas.addEventListener("touchstart", onTouchStart, { passive: false });
    viewCanvas.addEventListener("touchmove", onTouchMove, { passive: false });
    viewCanvas.addEventListener("touchend", onTouchEnd, { passive: false });
  }

  function hide() {
    if (!active || !overlay) return;
    active = false;
    transitioning = false;
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

  function navigateTo(frameId: number, transition: string = "Instant", durationMs: number = 300) {
    if (transitioning) return;
    const prevFrameId = currentFrameId;
    if (currentFrameId !== null) navigationStack.push(currentFrameId);
    currentFrameId = frameId;

    if (transition === "Instant" || !prevFrameId) {
      renderCurrentView();
      return;
    }

    performTransition(prevFrameId, frameId, transition, durationMs);
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
  function performTransition(fromId: number, toId: number, transition: string, durationMs: number) {
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

    // Easing: ease-in-out cubic
    function ease(t: number): number {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    if (transition === "SmartAnimate") {
      performSmartAnimate(fromId, toId, fromCanvas, toCanvas, durationMs);
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
  function performSmartAnimate(fromId: number, toId: number, fromCanvas: HTMLCanvasElement, toCanvas: HTMLCanvasElement, durationMs: number) {
    if (!viewCanvas) { transitioning = false; return; }

    const animData = computeAutoAnimate(fromId, toId);
    const toBounds = getFrameBounds(toId)!;
    const dpr = window.devicePixelRatio || 1;
    const { scale } = getViewportParams(toBounds);

    // If no matches, fall back to dissolve
    if (animData.pairs.length === 0) {
      performTransition(fromId, toId, "Dissolve", durationMs);
      return;
    }

    const ctx = viewCanvas.getContext("2d")!;
    const startTime = performance.now();

    function ease(t: number): number {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
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

    // Render
    editor.engine.render(ctx as any);

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

      // Color-code by trigger type: blue=click, green=gesture, orange=hover
      const triggers = (nwi.interactions as any[]).map((i: any) => i.trigger);
      const hasGesture = triggers.some((t: string) =>
        t.startsWith("OnSwipe") || t === "OnLongPress" || t.startsWith("OnPinch")
      );
      const hasHover = triggers.includes("OnHover");
      ctx.strokeStyle = hasGesture ? "rgba(16, 185, 129, 0.6)" :
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

  /** Execute a matched interaction */
  function executeInteraction(inter: any) {
    const targetId = Number(inter.target_node_id);
    if (inter.action === "NavigateTo" && targetId > 0) {
      const targetPageId = Number(inter.target_page_id);
      if (targetPageId > 0) editor.engine.set_active_page(BigInt(targetPageId));
      navigateTo(targetId, inter.transition || "Instant", inter.transition_duration_ms || 300);
    } else if (inter.action === "Back") {
      navigateBack();
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
      }
      if (nodeId !== null) {
        eventRuntime.handleHoverEnter(nodeId, e.clientX, e.clientY);
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
    }
  }

  function onCanvasMouseUp(e: MouseEvent) {
    if (!viewCanvas || transitioning || !eventRuntime) return;
    if (mousePressNodeId !== null) {
      if (isDragging) {
        eventRuntime.handleDragEnd(e.clientX, e.clientY);
      }
      eventRuntime.handleRelease(mousePressNodeId, e.clientX, e.clientY);

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
    if (match) executeInteraction(match.interaction);
  }

  // ─── Touch / Gesture handling ───────────────────────
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressFired = false;
  let initialPinchDist = 0;
  let pinchActive = false;

  function onTouchStart(e: TouchEvent) {
    if (!viewCanvas || transitioning) return;
    e.preventDefault();
    longPressFired = false;
    pinchActive = false;

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
    touchStartTime = performance.now();

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
    if (longPressTimer) {
      const touch = e.touches[0]!;
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }
  }

  function onTouchEnd(e: TouchEvent) {
    if (!viewCanvas || transitioning) return;
    e.preventDefault();

    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
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
