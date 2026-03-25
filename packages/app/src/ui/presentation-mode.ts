/**
 * Canvas Presentation Mode — Fullscreen slideshow for pages.
 * Navigate pages with arrow keys, supports transitions and presenter notes.
 */
import type { Editor } from "../editor";

type TransitionType = "none" | "fade" | "slide-left" | "slide-right" | "slide-up" | "zoom";

interface PageInfo {
  id: number;
  name: string;
}

interface PresentationOptions {
  startPageIndex?: number;
  transition?: TransitionType;
  showNotes?: boolean;
  loop?: boolean;
}

export function createPresentationMode(editor: Editor) {
  let overlay: HTMLDivElement | null = null;
  let active = false;
  let pages: PageInfo[] = [];
  let currentIndex = 0;
  let transitioning = false;
  let options: Required<PresentationOptions> = {
    startPageIndex: 0,
    transition: "fade",
    showNotes: false,
    loop: false,
  };
  let notesPanel: HTMLDivElement | null = null;
  let slideCanvas: HTMLCanvasElement | null = null;
  let savedPageId: number | null = null;
  let progressBar: HTMLDivElement | null = null;
  let slideCounter: HTMLSpanElement | null = null;

  function show(opts?: PresentationOptions) {
    if (active) return;

    // Get pages
    try {
      pages = JSON.parse(editor.engine.get_pages()) as PageInfo[];
    } catch {
      pages = [{ id: 1, name: "Page 1" }];
    }
    if (pages.length === 0) return;

    options = { ...options, ...opts };
    active = true;
    currentIndex = options.startPageIndex;
    savedPageId = Number(editor.engine.get_active_page_id());

    buildUI();
    renderSlide();

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
  }

  function hide() {
    if (!active) return;
    active = false;
    transitioning = false;
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("mousedown", onMouseDown);

    // Restore original page
    if (savedPageId !== null) {
      try { editor.engine.set_active_page(BigInt(savedPageId)); } catch {}
      savedPageId = null;
    }

    overlay?.remove();
    overlay = null;
    slideCanvas = null;
    notesPanel = null;
    progressBar = null;
    slideCounter = null;
  }

  function isActive() { return active; }

  function buildUI() {
    overlay = document.createElement("div");
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:10001;
      background:#000;display:flex;flex-direction:column;
      font-family:Inter,system-ui,sans-serif;
    `;

    // Main canvas area
    const canvasArea = document.createElement("div");
    canvasArea.style.cssText = "flex:1;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;";

    slideCanvas = document.createElement("canvas");
    slideCanvas.style.cssText = "max-width:100%;max-height:100%;";
    canvasArea.appendChild(slideCanvas);

    overlay.appendChild(canvasArea);

    // Bottom control bar
    const controlBar = document.createElement("div");
    controlBar.style.cssText = `
      position:absolute;bottom:0;left:0;right:0;height:44px;
      background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);
      display:flex;align-items:center;padding:0 16px;gap:12px;
      opacity:0;transition:opacity 0.3s;z-index:2;
    `;
    controlBar.addEventListener("mouseenter", () => { controlBar.style.opacity = "1"; });
    overlay.addEventListener("mousemove", (e) => {
      const rect = overlay!.getBoundingClientRect();
      if (e.clientY > rect.bottom - 80) {
        controlBar.style.opacity = "1";
      } else {
        controlBar.style.opacity = "0";
      }
    });

    // Prev button
    const prevBtn = makeBtn("‹", () => goPrev());
    controlBar.appendChild(prevBtn);

    // Slide counter
    slideCounter = document.createElement("span");
    slideCounter.style.cssText = "color:#ccc;font-size:13px;min-width:60px;text-align:center;";
    controlBar.appendChild(slideCounter);

    // Next button
    const nextBtn = makeBtn("›", () => goNext());
    controlBar.appendChild(nextBtn);

    // Progress bar
    const progressWrap = document.createElement("div");
    progressWrap.style.cssText = "flex:1;height:3px;background:rgba(255,255,255,0.15);border-radius:2px;margin:0 8px;cursor:pointer;";
    progressBar = document.createElement("div");
    progressBar.style.cssText = "height:100%;background:#4a90d9;border-radius:2px;transition:width 0.3s;";
    progressWrap.appendChild(progressBar);
    progressWrap.addEventListener("click", (e) => {
      const rect = progressWrap.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      const idx = Math.round(pct * (pages.length - 1));
      goToSlide(idx);
    });
    controlBar.appendChild(progressWrap);

    // Transition select
    const transSelect = document.createElement("select");
    transSelect.style.cssText = "background:#333;color:#ccc;border:1px solid #555;border-radius:4px;padding:2px 6px;font-size:11px;cursor:pointer;";
    for (const t of ["none", "fade", "slide-left", "slide-right", "slide-up", "zoom"] as TransitionType[]) {
      const opt = document.createElement("option");
      opt.value = t; opt.textContent = t.charAt(0).toUpperCase() + t.slice(1).replace("-", " ");
      if (t === options.transition) opt.selected = true;
      transSelect.appendChild(opt);
    }
    transSelect.addEventListener("change", () => { options.transition = transSelect.value as TransitionType; });
    controlBar.appendChild(transSelect);

    // Notes toggle
    const notesBtn = makeBtn("📝", () => toggleNotes());
    notesBtn.title = "Toggle presenter notes (N)";
    controlBar.appendChild(notesBtn);

    // Close button
    const closeBtn = makeBtn("✕", hide);
    closeBtn.style.background = "#e94560";
    controlBar.appendChild(closeBtn);

    overlay.appendChild(controlBar);

    // Notes panel (hidden by default)
    notesPanel = document.createElement("div");
    notesPanel.style.cssText = `
      position:absolute;bottom:44px;left:0;right:0;
      max-height:200px;background:rgba(20,20,30,0.95);
      backdrop-filter:blur(8px);color:#ccc;font-size:14px;
      line-height:1.6;padding:16px 24px;overflow-y:auto;
      border-top:1px solid rgba(255,255,255,0.1);
      display:none;z-index:2;
    `;
    overlay.appendChild(notesPanel);

    document.body.appendChild(overlay);

    if (options.showNotes) notesPanel.style.display = "block";
  }

  function makeBtn(text: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.style.cssText = "background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:16px;line-height:1;";
    btn.textContent = text;
    btn.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    btn.addEventListener("mouseenter", () => { btn.style.background = "rgba(255,255,255,0.2)"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = "rgba(255,255,255,0.1)"; });
    return btn;
  }

  function toggleNotes() {
    if (!notesPanel) return;
    options.showNotes = !options.showNotes;
    notesPanel.style.display = options.showNotes ? "block" : "none";
  }

  function updateUI() {
    if (slideCounter) {
      slideCounter.textContent = `${currentIndex + 1} / ${pages.length}`;
    }
    if (progressBar) {
      const pct = pages.length > 1 ? (currentIndex / (pages.length - 1)) * 100 : 100;
      progressBar.style.width = `${pct}%`;
    }
    updateNotes();
  }

  function updateNotes() {
    if (!notesPanel || !options.showNotes) return;
    // Collect notes from all top-level nodes on current page
    const page = pages[currentIndex];
    if (!page) return;

    try {
      // Switch to the page to read its nodes
      editor.engine.set_active_page(BigInt(page.id));
      const rootChildren = JSON.parse(editor.engine.get_children(BigInt(0)));
      let allNotes: string[] = [];

      for (const childId of rootChildren) {
        try {
          const notesJson = editor.engine.get_notes(BigInt(Number(childId)));
          const notes = JSON.parse(notesJson);
          for (const note of notes) {
            if (note.content && note.content.trim()) {
              allNotes.push(note.content.trim());
            }
          }
        } catch {}
      }

      if (allNotes.length > 0) {
        notesPanel.innerHTML = allNotes.map(n =>
          `<div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.05);">${escapeHtml(n)}</div>`
        ).join("");
      } else {
        notesPanel.innerHTML = '<div style="color:#666;font-style:italic;">No presenter notes on this page. Add notes to top-level frames to see them here.</div>';
      }
    } catch {
      notesPanel.innerHTML = '<div style="color:#666;">Unable to load notes.</div>';
    }
  }

  function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
  }

  function renderSlide(transitionFrom?: HTMLCanvasElement) {
    if (!slideCanvas || !overlay) return;
    const page = pages[currentIndex];
    if (!page) return;

    // Switch engine to this page
    try { editor.engine.set_active_page(BigInt(page.id)); } catch {}

    const dpr = window.devicePixelRatio || 1;
    const availW = window.innerWidth;
    const availH = window.innerHeight;

    // Get scene bounds for this page
    let boundsJson: string;
    try {
      boundsJson = editor.engine.get_scene_bounds();
    } catch {
      boundsJson = '{"x":0,"y":0,"width":1920,"height":1080}';
    }
    const bounds = JSON.parse(boundsJson);
    const sceneW = bounds.width || 1920;
    const sceneH = bounds.height || 1080;

    const scale = Math.min(availW / sceneW, availH / sceneH, 2);
    const displayW = sceneW * scale;
    const displayH = sceneH * scale;

    slideCanvas.width = displayW * dpr;
    slideCanvas.height = displayH * dpr;
    slideCanvas.style.width = `${displayW}px`;
    slideCanvas.style.height = `${displayH}px`;

    const ctx = slideCanvas.getContext("2d")!;

    // Save/restore viewport
    const savedZoom = editor.engine.get_zoom();
    const savedPanX = editor.engine.get_pan_x();
    const savedPanY = editor.engine.get_pan_y();

    editor.engine.set_viewport(scale * dpr, -bounds.x * scale * dpr, -bounds.y * scale * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, slideCanvas.width, slideCanvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slideCanvas.width, slideCanvas.height);

    // Clear selection to avoid blue outlines
    try { editor.engine.clear_selection(); } catch {}
    editor.engine.render(ctx as any);

    editor.engine.set_viewport(savedZoom, savedPanX, savedPanY);

    // Apply transition if needed
    if (transitionFrom && options.transition !== "none") {
      applyTransition(transitionFrom, slideCanvas, options.transition);
    }

    updateUI();
  }

  function captureCurrentSlide(): HTMLCanvasElement | null {
    if (!slideCanvas) return null;
    const copy = document.createElement("canvas");
    copy.width = slideCanvas.width;
    copy.height = slideCanvas.height;
    const ctx = copy.getContext("2d")!;
    ctx.drawImage(slideCanvas, 0, 0);
    return copy;
  }

  function applyTransition(fromCanvas: HTMLCanvasElement, toCanvas: HTMLCanvasElement, type: TransitionType) {
    transitioning = true;
    const duration = 400;
    const start = performance.now();
    const ctx = toCanvas.getContext("2d")!;
    const w = toCanvas.width;
    const h = toCanvas.height;

    // Snapshot the new slide
    const newSnapshot = document.createElement("canvas");
    newSnapshot.width = w; newSnapshot.height = h;
    newSnapshot.getContext("2d")!.drawImage(toCanvas, 0, 0);

    function ease(t: number): number { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

    function frame(now: number) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const et = ease(t);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);

      switch (type) {
        case "fade":
          ctx.globalAlpha = 1;
          ctx.drawImage(fromCanvas, 0, 0);
          ctx.globalAlpha = et;
          ctx.drawImage(newSnapshot, 0, 0);
          ctx.globalAlpha = 1;
          break;

        case "slide-left":
          ctx.drawImage(fromCanvas, -et * w, 0);
          ctx.drawImage(newSnapshot, (1 - et) * w, 0);
          break;

        case "slide-right":
          ctx.drawImage(fromCanvas, et * w, 0);
          ctx.drawImage(newSnapshot, -(1 - et) * w, 0);
          break;

        case "slide-up":
          ctx.drawImage(fromCanvas, 0, -et * h);
          ctx.drawImage(newSnapshot, 0, (1 - et) * h);
          break;

        case "zoom":
          const s = 1 + et * 0.1;
          ctx.globalAlpha = 1 - et;
          ctx.translate(w / 2, h / 2);
          ctx.scale(s, s);
          ctx.translate(-w / 2, -h / 2);
          ctx.drawImage(fromCanvas, 0, 0);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = et;
          const s2 = 1.1 - et * 0.1;
          ctx.translate(w / 2, h / 2);
          ctx.scale(s2, s2);
          ctx.translate(-w / 2, -h / 2);
          ctx.drawImage(newSnapshot, 0, 0);
          ctx.globalAlpha = 1;
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          break;
      }

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(newSnapshot, 0, 0);
        transitioning = false;
      }
    }

    requestAnimationFrame(frame);
  }

  function goNext() {
    if (transitioning) return;
    if (currentIndex < pages.length - 1) {
      const prev = captureCurrentSlide();
      currentIndex++;
      renderSlide(prev ?? undefined);
    } else if (options.loop) {
      const prev = captureCurrentSlide();
      currentIndex = 0;
      renderSlide(prev ?? undefined);
    }
  }

  function goPrev() {
    if (transitioning) return;
    if (currentIndex > 0) {
      const prev = captureCurrentSlide();
      currentIndex--;
      renderSlide(prev ?? undefined);
    } else if (options.loop) {
      const prev = captureCurrentSlide();
      currentIndex = pages.length - 1;
      renderSlide(prev ?? undefined);
    }
  }

  function goToSlide(idx: number) {
    if (transitioning || idx === currentIndex) return;
    const clamped = Math.max(0, Math.min(pages.length - 1, idx));
    const prev = captureCurrentSlide();
    currentIndex = clamped;
    renderSlide(prev ?? undefined);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (transitioning) return;
    switch (e.key) {
      case "Escape": hide(); break;
      case "ArrowRight": case " ": case "PageDown": e.preventDefault(); goNext(); break;
      case "ArrowLeft": case "Backspace": case "PageUp": e.preventDefault(); goPrev(); break;
      case "Home": e.preventDefault(); goToSlide(0); break;
      case "End": e.preventDefault(); goToSlide(pages.length - 1); break;
      case "n": case "N": toggleNotes(); break;
      case "f": case "F":
        if (!document.fullscreenElement) overlay?.requestFullscreen?.();
        else document.exitFullscreen?.();
        break;
    }
  }

  function onMouseDown(e: MouseEvent) {
    if (transitioning) return;
    // Click on left half → prev, right half → next (but not on controls)
    if (!overlay || !slideCanvas) return;
    const target = e.target as HTMLElement;
    if (target.tagName === "BUTTON" || target.tagName === "SELECT" || target.closest("button,select,.notes-panel")) return;

    const rect = slideCanvas.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;

    const midX = rect.left + rect.width / 2;
    if (e.clientX < midX) goPrev();
    else goNext();
  }

  return { show, hide, isActive };
}

export function openPresentationMode(editor: Editor, opts?: PresentationOptions) {
  const pm = createPresentationMode(editor);
  pm.show(opts);
  return pm;
}
