/**
 * Scroll Animation Panel — UI for configuring scroll-driven animations.
 * Also exports `applyScrollAnimations()` for prototype-viewer integration.
 */

import type { Editor } from "../editor";

// ── Types ──────────────────────────────────────────

export interface ScrollAnim {
  property: string;
  start_scroll: number;
  end_scroll: number;
  from_value: number;
  to_value: number;
  easing: string;
  sticky: boolean;
  sticky_offset: number;
  parallax_factor: number;
  enabled: boolean;
}

// ── Evaluate scroll animations at a given scroll offset ──

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function evaluateEasing(easing: string, t: number): number {
  t = Math.max(0, Math.min(1, t));
  switch (easing) {
    case "ease_in": return t * t * t;
    case "ease_out": return 1 - Math.pow(1 - t, 3);
    case "ease_in_out":
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    default: return t; // linear
  }
}

/**
 * Given a scroll offset, compute the animated property deltas for all
 * scroll-animated nodes. Returns a map of nodeId → property overrides.
 */
export function computeScrollAnimOverrides(
  engine: any,
  scrollY: number,
): Map<number, Record<string, number>> {
  const result = new Map<number, Record<string, number>>();
  try {
    const allAnims = JSON.parse(engine.get_all_scroll_animations());
    for (const entry of allAnims) {
      const nodeId = typeof entry.node_id === "bigint" ? Number(entry.node_id) : entry.node_id;
      const overrides: Record<string, number> = {};

      for (const anim of entry.scroll_animations as ScrollAnim[]) {
        if (!anim.enabled) continue;

        // Apply parallax factor to effective scroll position
        const effectiveScroll = scrollY * anim.parallax_factor;

        // Calculate progress
        const range = anim.end_scroll - anim.start_scroll;
        if (range === 0) continue;

        let progress = (effectiveScroll - anim.start_scroll) / range;
        progress = Math.max(0, Math.min(1, progress));
        const easedProgress = evaluateEasing(anim.easing, progress);
        const value = lerp(anim.from_value, anim.to_value, easedProgress);

        overrides[anim.property] = value;

        // Handle sticky positioning
        if (anim.sticky) {
          if (effectiveScroll >= anim.start_scroll && effectiveScroll <= anim.end_scroll) {
            overrides["_sticky"] = 1;
            overrides["_sticky_offset"] = anim.sticky_offset;
          }
        }
      }

      if (Object.keys(overrides).length > 0) {
        result.set(nodeId, overrides);
      }
    }
  } catch (e) {
    // Gracefully handle engine errors
  }
  return result;
}

// ── Properties panel section ──────────────────────

const PROPERTIES = ["opacity", "x", "y", "scale", "rotation", "blur"];
const EASINGS = ["linear", "ease_in", "ease_out", "ease_in_out"];

export function renderScrollAnimSection(container: HTMLElement, editor: Editor): void {
  const sel = editor.getSelection();
  if (sel.length !== 1) return;
  const nodeId = sel[0];

  const section = document.createElement("div");
  section.style.cssText = "margin-top:12px;border-top:1px solid #333;padding-top:8px;";

  const header = document.createElement("div");
  header.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;";
  header.innerHTML = `<span style="font-size:11px;font-weight:600;color:#aaa;text-transform:uppercase;letter-spacing:0.5px;">Scroll Animations</span>`;

  const addBtn = document.createElement("button");
  addBtn.textContent = "+";
  addBtn.style.cssText = "background:#333;border:none;color:#fff;border-radius:4px;width:20px;height:20px;cursor:pointer;font-size:14px;line-height:1;";
  addBtn.onclick = () => {
    (editor.engine as any).add_scroll_animation(
      BigInt(nodeId), "opacity", 0, 500, 1, 0, "linear", false, 0, 1.0
    );
    editor.requestRender();
    renderScrollAnimSection(container, editor);
  };
  header.appendChild(addBtn);
  section.appendChild(header);

  let anims: ScrollAnim[] = [];
  try {
    anims = JSON.parse((editor.engine as any).get_scroll_animations(BigInt(nodeId)));
  } catch { /* */ }

  if (anims.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText = "font-size:10px;color:#666;padding:4px 0;";
    empty.textContent = "No scroll animations. Click + to add.";
    section.appendChild(empty);
  }

  anims.forEach((anim, index) => {
    const row = document.createElement("div");
    row.style.cssText = "background:#1e1e2e;border-radius:6px;padding:8px;margin-bottom:6px;font-size:10px;";

    // Header row with property select + delete
    const rowHeader = document.createElement("div");
    rowHeader.style.cssText = "display:flex;align-items:center;gap:4px;margin-bottom:4px;";

    // Enabled toggle
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = anim.enabled;
    toggle.style.cssText = "width:12px;height:12px;cursor:pointer;";
    toggle.onchange = () => {
      (editor.engine as any).toggle_scroll_animation(BigInt(nodeId), index);
      editor.requestRender();
    };
    rowHeader.appendChild(toggle);

    // Property select
    const propSel = document.createElement("select");
    propSel.style.cssText = "background:#2a2a3a;border:1px solid #444;color:#ccc;border-radius:3px;padding:2px;font-size:10px;flex:1;";
    PROPERTIES.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p; opt.textContent = p;
      if (p === anim.property) opt.selected = true;
      propSel.appendChild(opt);
    });
    rowHeader.appendChild(propSel);

    // Easing select
    const easeSel = document.createElement("select");
    easeSel.style.cssText = "background:#2a2a3a;border:1px solid #444;color:#ccc;border-radius:3px;padding:2px;font-size:10px;";
    EASINGS.forEach(e => {
      const opt = document.createElement("option");
      opt.value = e; opt.textContent = e.replace("_", " ");
      if (e === anim.easing) opt.selected = true;
      easeSel.appendChild(opt);
    });
    rowHeader.appendChild(easeSel);

    // Delete button
    const delBtn = document.createElement("button");
    delBtn.textContent = "×";
    delBtn.style.cssText = "background:none;border:none;color:#f66;cursor:pointer;font-size:14px;padding:0 2px;";
    delBtn.onclick = () => {
      (editor.engine as any).remove_scroll_animation(BigInt(nodeId), index);
      editor.requestRender();
      renderScrollAnimSection(container, editor);
    };
    rowHeader.appendChild(delBtn);
    row.appendChild(rowHeader);

    // Scroll range: start → end
    const rangeRow = document.createElement("div");
    rangeRow.style.cssText = "display:flex;gap:4px;align-items:center;margin-bottom:4px;";
    rangeRow.innerHTML = `<span style="color:#888;width:44px;">Scroll</span>`;
    const startIn = numInput(anim.start_scroll, "start");
    const endIn = numInput(anim.end_scroll, "end");
    rangeRow.appendChild(startIn);
    rangeRow.appendChild(document.createTextNode("→"));
    rangeRow.appendChild(endIn);
    row.appendChild(rangeRow);

    // Value range: from → to
    const valRow = document.createElement("div");
    valRow.style.cssText = "display:flex;gap:4px;align-items:center;margin-bottom:4px;";
    valRow.innerHTML = `<span style="color:#888;width:44px;">Value</span>`;
    const fromIn = numInput(anim.from_value, "from");
    const toIn = numInput(anim.to_value, "to");
    valRow.appendChild(fromIn);
    valRow.appendChild(document.createTextNode("→"));
    valRow.appendChild(toIn);
    row.appendChild(valRow);

    // Parallax factor + sticky
    const extraRow = document.createElement("div");
    extraRow.style.cssText = "display:flex;gap:4px;align-items:center;";
    extraRow.innerHTML = `<span style="color:#888;width:44px;">Parallax</span>`;
    const parIn = numInput(anim.parallax_factor, "parallax");
    extraRow.appendChild(parIn);

    const stickyLabel = document.createElement("label");
    stickyLabel.style.cssText = "display:flex;align-items:center;gap:2px;color:#888;margin-left:4px;cursor:pointer;";
    const stickyCb = document.createElement("input");
    stickyCb.type = "checkbox";
    stickyCb.checked = anim.sticky;
    stickyCb.style.cssText = "width:12px;height:12px;";
    stickyLabel.appendChild(stickyCb);
    stickyLabel.appendChild(document.createTextNode("Sticky"));
    extraRow.appendChild(stickyLabel);
    row.appendChild(extraRow);

    // On change: update all values
    const updateAnim = () => {
      (editor.engine as any).update_scroll_animation(
        BigInt(nodeId), index,
        propSel.value,
        parseFloat((startIn as HTMLInputElement).value) || 0,
        parseFloat((endIn as HTMLInputElement).value) || 500,
        parseFloat((fromIn as HTMLInputElement).value) || 0,
        parseFloat((toIn as HTMLInputElement).value) || 0,
        easeSel.value,
        stickyCb.checked,
        anim.sticky_offset,
        parseFloat((parIn as HTMLInputElement).value) || 1,
      );
      editor.requestRender();
    };
    propSel.onchange = updateAnim;
    easeSel.onchange = updateAnim;
    startIn.onchange = updateAnim;
    endIn.onchange = updateAnim;
    fromIn.onchange = updateAnim;
    toIn.onchange = updateAnim;
    parIn.onchange = updateAnim;
    stickyCb.onchange = updateAnim;

    section.appendChild(row);
  });

  // Remove existing scroll-anim section if any
  const existing = container.querySelector("[data-scroll-anim-section]");
  if (existing) existing.remove();

  section.setAttribute("data-scroll-anim-section", "1");
  container.appendChild(section);
}

function numInput(value: number, placeholder: string): HTMLInputElement {
  const inp = document.createElement("input");
  inp.type = "number";
  inp.value = String(Math.round(value * 100) / 100);
  inp.placeholder = placeholder;
  inp.style.cssText = "background:#2a2a3a;border:1px solid #444;color:#ccc;border-radius:3px;padding:2px 4px;font-size:10px;width:48px;";
  inp.step = "any";
  return inp;
}
