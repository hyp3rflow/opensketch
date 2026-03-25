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

    renderCurrentView();
    viewCanvas.addEventListener("click", onCanvasClick);
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

  /** Get all children node info for a frame (for smart animate matching) */
  function getFrameChildrenInfo(frameId: number): Map<string, { x: number; y: number; width: number; height: number; rotation: number; opacity: number; name: string; id: number }> {
    const map = new Map();
    const json = editor.engine.get_node_json(frameId);
    if (!json) return map;
    const frame = JSON.parse(json);
    const frameBounds = { x: frame.x, y: frame.y };

    function collectChildren(parentId: number) {
      const pjson = editor.engine.get_node_json(parentId);
      if (!pjson) return;
      const parent = JSON.parse(pjson);
      if (!parent.children) return;
      for (const childId of parent.children) {
        const cjson = editor.engine.get_node_json(Number(childId));
        if (!cjson) continue;
        const child = JSON.parse(cjson);
        // Store position relative to frame
        map.set(child.name, {
          x: child.x - frameBounds.x,
          y: child.y - frameBounds.y,
          width: child.width,
          height: child.height,
          rotation: child.rotation || 0,
          opacity: child.opacity ?? 1,
          name: child.name,
          id: Number(childId),
        });
        collectChildren(Number(childId));
      }
    }
    collectChildren(frameId);
    return map;
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

  /** Smart Animate: match nodes by name, interpolate properties */
  function performSmartAnimate(fromId: number, toId: number, fromCanvas: HTMLCanvasElement, toCanvas: HTMLCanvasElement, durationMs: number) {
    if (!viewCanvas) { transitioning = false; return; }

    const fromChildren = getFrameChildrenInfo(fromId);
    const toChildren = getFrameChildrenInfo(toId);
    const fromBounds = getFrameBounds(fromId)!;
    const toBounds = getFrameBounds(toId)!;
    const dpr = window.devicePixelRatio || 1;
    const { scale, displayW, displayH } = getViewportParams(toBounds);

    // Find matched nodes (same name in both frames)
    const matchedNames: string[] = [];
    for (const name of fromChildren.keys()) {
      if (toChildren.has(name)) matchedNames.push(name);
    }

    // If no matches, fall back to dissolve
    if (matchedNames.length === 0) {
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

      // Cross-fade unmatched content (background)
      ctx.globalAlpha = 1 - t;
      ctx.drawImage(fromCanvas, 0, 0, w, h);
      ctx.globalAlpha = t;
      ctx.drawImage(toCanvas, 0, 0, w, h);
      ctx.globalAlpha = 1;

      // For matched nodes: render interpolated by temporarily modifying and re-rendering
      // We overlay interpolated rectangles as colored hints (visual feedback)
      // For a proper implementation, we'd need per-node rendering isolation.
      // Instead, we render the target frame and smoothly interpolate matched node positions
      // using clip regions for each matched node.

      // Draw matched node transition overlays
      const totalScale = scale * dpr;
      for (const name of matchedNames) {
        const from = fromChildren.get(name)!;
        const to = toChildren.get(name)!;

        const ix = lerp(from.x, to.x, t) * totalScale;
        const iy = lerp(from.y, to.y, t) * totalScale;
        const iw = lerp(from.width, to.width, t) * totalScale;
        const ih = lerp(from.height, to.height, t) * totalScale;

        // Source position in fromCanvas
        const sx = from.x * totalScale;
        const sy = from.y * totalScale;
        const sw = from.width * totalScale;
        const sh = from.height * totalScale;

        // Target position in toCanvas
        const tx = to.x * totalScale;
        const ty = to.y * totalScale;
        const tw = to.width * totalScale;
        const th = to.height * totalScale;

        ctx.save();
        // Clip to interpolated rect
        ctx.beginPath();
        ctx.rect(ix, iy, iw, ih);
        ctx.clip();

        // Clear clipped area
        ctx.clearRect(ix, iy, iw, ih);

        // Draw from-node fading out
        if (sw > 0 && sh > 0) {
          ctx.globalAlpha = 1 - t;
          ctx.drawImage(fromCanvas, sx, sy, sw, sh, ix, iy, iw, ih);
        }

        // Draw to-node fading in
        if (tw > 0 && th > 0) {
          ctx.globalAlpha = t;
          ctx.drawImage(toCanvas, tx, ty, tw, th, ix, iy, iw, ih);
        }

        ctx.globalAlpha = 1;
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

  function onCanvasClick(e: MouseEvent) {
    if (!viewCanvas || transitioning) return;
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

  return { show, hide, isActive: () => active };
}
