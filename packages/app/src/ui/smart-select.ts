/**
 * Smart Select Panel — similarity-based node selection with configurable criteria.
 * Opens as a floating dialog when triggered via context menu or Cmd+Shift+A.
 */

import type { Editor } from '../editor';

interface SmartSelectCriteria {
  fill_color: boolean;
  stroke_color: boolean;
  node_kind: boolean;
  size: boolean;
  opacity: boolean;
  corner_radius: boolean;
  font: boolean;
  font_size: boolean;
  stroke_width: boolean;
  color_threshold: number;
  size_threshold: number;
  opacity_threshold: number;
  corner_radius_threshold: number;
  font_size_threshold: number;
  stroke_width_threshold: number;
}

const DEFAULT_CRITERIA: SmartSelectCriteria = {
  fill_color: true,
  stroke_color: false,
  node_kind: true,
  size: false,
  opacity: false,
  corner_radius: false,
  font: false,
  font_size: false,
  stroke_width: false,
  color_threshold: 30,
  size_threshold: 0.2,
  opacity_threshold: 0.1,
  corner_radius_threshold: 2,
  font_size_threshold: 2,
  stroke_width_threshold: 1,
};

export class SmartSelectPanel {
  private el: HTMLDivElement | null = null;
  private editor: Editor;
  private criteria: SmartSelectCriteria;
  private referenceId: number = 0;

  constructor(editor: Editor) {
    this.editor = editor;
    this.criteria = { ...DEFAULT_CRITERIA };
  }

  open(referenceId: number) {
    this.referenceId = referenceId;
    if (this.el) this.close();
    this.el = document.createElement('div');
    this.el.className = 'smart-select-panel';
    this.el.innerHTML = this.buildHTML();
    document.body.appendChild(this.el);
    this.bindEvents();
    this.runSelection();
  }

  close() {
    if (this.el) {
      this.el.remove();
      this.el = null;
    }
  }

  isOpen() { return !!this.el; }

  private buildHTML(): string {
    return `
      <div class="ssp-header">
        <span>Select Similar</span>
        <button class="ssp-close" title="Close">✕</button>
      </div>
      <div class="ssp-body">
        <div class="ssp-section">
          <label class="ssp-label">Match Criteria</label>
          ${this.checkbox('fill_color', 'Fill Color')}
          ${this.checkbox('stroke_color', 'Stroke Color')}
          ${this.checkbox('node_kind', 'Node Type')}
          ${this.checkbox('size', 'Size')}
          ${this.checkbox('opacity', 'Opacity')}
          ${this.checkbox('corner_radius', 'Corner Radius')}
          ${this.checkbox('font', 'Font Family')}
          ${this.checkbox('font_size', 'Font Size')}
          ${this.checkbox('stroke_width', 'Stroke Width')}
        </div>
        <div class="ssp-section">
          <label class="ssp-label">Tolerances</label>
          ${this.slider('color_threshold', 'Color Distance', 0, 200, 1)}
          ${this.slider('size_threshold', 'Size Ratio', 0, 1, 0.05)}
        </div>
        <div class="ssp-result" id="ssp-result">—</div>
      </div>
      <div class="ssp-footer">
        <button class="ssp-btn ssp-btn-suggest" title="AI suggests groups of similar nodes">Suggest Groups</button>
        <button class="ssp-btn ssp-btn-group" title="Group best similar set and auto-apply layout">Smart Group</button>
        <button class="ssp-btn ssp-btn-apply">Apply</button>
      </div>
    `;
  }

  private checkbox(key: keyof SmartSelectCriteria, label: string): string {
    const checked = this.criteria[key] ? 'checked' : '';
    return `<label class="ssp-check"><input type="checkbox" data-key="${key}" ${checked}> ${label}</label>`;
  }

  private slider(key: keyof SmartSelectCriteria, label: string, min: number, max: number, step: number): string {
    const val = this.criteria[key] as number;
    return `<div class="ssp-slider-row">
      <span>${label}</span>
      <input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${val}">
      <span class="ssp-slider-val" data-val-key="${key}">${val}</span>
    </div>`;
  }

  private bindEvents() {
    if (!this.el) return;

    this.el.querySelector('.ssp-close')?.addEventListener('click', () => this.close());

    this.el.querySelectorAll('input[type=checkbox]').forEach(inp => {
      inp.addEventListener('change', () => {
        const key = (inp as HTMLInputElement).dataset.key as keyof SmartSelectCriteria;
        (this.criteria as any)[key] = (inp as HTMLInputElement).checked;
        this.runSelection();
      });
    });

    this.el.querySelectorAll('input[type=range]').forEach(inp => {
      inp.addEventListener('input', () => {
        const key = (inp as HTMLInputElement).dataset.key as keyof SmartSelectCriteria;
        const val = parseFloat((inp as HTMLInputElement).value);
        (this.criteria as any)[key] = val;
        const valEl = this.el?.querySelector(`[data-val-key="${key}"]`);
        if (valEl) valEl.textContent = String(val);
        this.runSelection();
      });
    });

    this.el.querySelector('.ssp-btn-apply')?.addEventListener('click', () => this.close());

    this.el.querySelector('.ssp-btn-suggest')?.addEventListener('click', () => {
      this.showGroupSuggestions();
    });

    this.el.querySelector('.ssp-btn-group')?.addEventListener('click', () => {
      this.smartGroupBestMatch();
    });

    // Draggable header
    let dragging = false, ox = 0, oy = 0;
    const header = this.el.querySelector('.ssp-header') as HTMLElement;
    header.addEventListener('mousedown', (e) => {
      dragging = true;
      ox = e.clientX - (this.el?.offsetLeft || 0);
      oy = e.clientY - (this.el?.offsetTop || 0);
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging || !this.el) return;
      this.el.style.left = (e.clientX - ox) + 'px';
      this.el.style.top = (e.clientY - oy) + 'px';
    });
    document.addEventListener('mouseup', () => { dragging = false; });
  }

  private runSelection() {
    const engine = this.editor.engine;
    if (!engine || !this.referenceId) return;
    const json = JSON.stringify(this.criteria);
    const ids = Array.from(engine.smart_select(BigInt(this.referenceId), json)).map(Number);
    const resultEl = this.el?.querySelector('#ssp-result');
    if (resultEl) {
      resultEl.textContent = `${ids.length} node${ids.length !== 1 ? 's' : ''} selected`;
    }
    this.editor.onSelectionChanged?.();
    this.editor.render();
  }

  private showGroupSuggestions() {
    const engine = this.editor.engine;
    if (!engine) return;
    const groupsJson = engine.suggest_groups(0.7);
    const groups: number[][] = JSON.parse(groupsJson);
    if (groups.length === 0) {
      alert('No similar groups found.');
      return;
    }
    // Select the first group as a quick action
    const firstGroup = groups[0]!;
    (engine as any).set_selection?.(firstGroup.map(id => BigInt(id)));
    // Show summary
    const msg = groups.map((g, i) => `Group ${i + 1}: ${g.length} nodes`).join('\n');
    alert(`Found ${groups.length} group(s) of similar nodes:\n${msg}\n\nFirst group selected.`);
    this.editor.onSelectionChanged?.();
    this.editor.render();
  }

  private smartGroupBestMatch() {
    const engine = this.editor.engine;
    if (!engine) return;

    const groupsJson = engine.suggest_groups(0.7);
    const groups: number[][] = JSON.parse(groupsJson);
    if (!groups.length || groups[0]!.length < 2) {
      alert('No similar node set large enough to group.');
      return;
    }

    const best = groups[0]!;
    engine.push_undo();
    (engine as any).set_selection?.(best.map(id => BigInt(id)));
    const groupId = Number(engine.group_selected());

    // One-click layout application (MVP): enable flex layout with sensible default gap
    try {
      engine.set_layout_mode(BigInt(groupId), 'flex');
      engine.set_layout_gap(BigInt(groupId), 8);
    } catch {
      // layout API may be unavailable in older wasm builds; grouping still succeeds
    }

    this.editor.onSelectionChanged?.();
    this.editor.render();
    alert(`Smart Group created: Group ${groupId} (${best.length} nodes) with auto-layout.`);
    this.close();
  }
}
