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

interface SelectionFilterState {
  nodeKind: string;
  nameRegex: string;
  maxDepth: string;
  attrFilter: 'any' | 'visible' | 'hidden' | 'locked' | 'text' | 'image' | 'shape';
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

const DEFAULT_FILTER: SelectionFilterState = {
  nodeKind: 'any',
  nameRegex: '',
  maxDepth: '',
  attrFilter: 'any',
};

export class SmartSelectPanel {
  private el: HTMLDivElement | null = null;
  private editor: Editor;
  private criteria: SmartSelectCriteria;
  private filter: SelectionFilterState;
  private referenceId: number = 0;

  constructor(editor: Editor) {
    this.editor = editor;
    this.criteria = { ...DEFAULT_CRITERIA };
    this.filter = { ...DEFAULT_FILTER };
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
        <div class="ssp-section">
          <label class="ssp-label">Selection Filter (Current Area)</label>
          <div class="ssp-slider-row">
            <span>Node Type</span>
            <select data-filter="nodeKind" style="width:120px;background:#111;color:#fff;border:1px solid #333;border-radius:6px;padding:4px;">
              <option value="any" ${this.filter.nodeKind === 'any' ? 'selected' : ''}>Any</option>
              <option value="Rect" ${this.filter.nodeKind === 'Rect' ? 'selected' : ''}>Rect</option>
              <option value="Ellipse" ${this.filter.nodeKind === 'Ellipse' ? 'selected' : ''}>Ellipse</option>
              <option value="Text" ${this.filter.nodeKind === 'Text' ? 'selected' : ''}>Text</option>
              <option value="Frame" ${this.filter.nodeKind === 'Frame' ? 'selected' : ''}>Frame</option>
              <option value="Group" ${this.filter.nodeKind === 'Group' ? 'selected' : ''}>Group</option>
              <option value="Path" ${this.filter.nodeKind === 'Path' ? 'selected' : ''}>Path</option>
              <option value="Image" ${this.filter.nodeKind === 'Image' ? 'selected' : ''}>Image</option>
            </select>
          </div>
          <div class="ssp-slider-row">
            <span>Name regex</span>
            <input data-filter="nameRegex" value="${this.filter.nameRegex}" placeholder="ex: ^btn|icon" style="width:120px;background:#111;color:#fff;border:1px solid #333;border-radius:6px;padding:4px;" />
          </div>
          <div class="ssp-slider-row">
            <span>Max depth</span>
            <input data-filter="maxDepth" value="${this.filter.maxDepth}" placeholder="blank=any" style="width:120px;background:#111;color:#fff;border:1px solid #333;border-radius:6px;padding:4px;" />
          </div>
          <div class="ssp-slider-row">
            <span>Attr</span>
            <select data-filter="attrFilter" style="width:120px;background:#111;color:#fff;border:1px solid #333;border-radius:6px;padding:4px;">
              <option value="any" ${this.filter.attrFilter === 'any' ? 'selected' : ''}>Any</option>
              <option value="visible" ${this.filter.attrFilter === 'visible' ? 'selected' : ''}>Visible only</option>
              <option value="hidden" ${this.filter.attrFilter === 'hidden' ? 'selected' : ''}>Hidden only</option>
              <option value="locked" ${this.filter.attrFilter === 'locked' ? 'selected' : ''}>Locked only</option>
              <option value="text" ${this.filter.attrFilter === 'text' ? 'selected' : ''}>Text only</option>
              <option value="image" ${this.filter.attrFilter === 'image' ? 'selected' : ''}>Image only</option>
              <option value="shape" ${this.filter.attrFilter === 'shape' ? 'selected' : ''}>Shape only</option>
            </select>
          </div>
        </div>
        <div class="ssp-result" id="ssp-result">—</div>
      </div>
      <div class="ssp-footer">
        <button class="ssp-btn ssp-btn-filter" title="Filter nodes inside current selection area">Filter Area</button>
        <button class="ssp-btn ssp-btn-suggest" title="AI suggests groups of similar nodes">Suggest Groups</button>
        <button class="ssp-btn ssp-btn-group" title="Group best similar set and auto-apply layout">Smart Group</button>
        <button class="ssp-btn ssp-btn-same" data-same="shape" title="Select same shape-type layers">Same Shape</button>
        <button class="ssp-btn ssp-btn-same" data-same="text" title="Select all text layers">Same Text</button>
        <button class="ssp-btn ssp-btn-same" data-same="image" title="Select all image layers">Same Image</button>
        <button class="ssp-btn ssp-btn-same" data-same="locked" title="Select all locked layers">Same Locked</button>
        <button class="ssp-btn ssp-btn-same" data-same="hidden" title="Select all hidden layers">Same Hidden</button>
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

    this.el.querySelectorAll('[data-filter]').forEach(inp => {
      inp.addEventListener('input', () => {
        const key = (inp as HTMLElement).getAttribute('data-filter') as keyof SelectionFilterState;
        if (!key) return;
        const value = (inp as HTMLInputElement).value;
        (this.filter as any)[key] = value;
      });
      inp.addEventListener('change', () => {
        const key = (inp as HTMLElement).getAttribute('data-filter') as keyof SelectionFilterState;
        if (!key) return;
        const value = (inp as HTMLInputElement).value;
        (this.filter as any)[key] = value;
      });
    });

    this.el.querySelector('.ssp-btn-filter')?.addEventListener('click', () => {
      this.applyAreaFilter();
    });

    this.el.querySelector('.ssp-btn-suggest')?.addEventListener('click', () => {
      this.showGroupSuggestions();
    });

    this.el.querySelector('.ssp-btn-group')?.addEventListener('click', () => {
      this.smartGroupBestMatch();
    });

    this.el.querySelectorAll('.ssp-btn-same').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = (btn as HTMLElement).getAttribute('data-same') || 'shape';
        this.selectSameByFilter(key);
      });
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

  private applyAreaFilter() {
    const engine = this.editor.engine;
    if (!engine) return;

    const boundsJson = engine.get_selection_bounds();
    if (!boundsJson) {
      alert('Select an area or nodes first, then run Filter Area.');
      return;
    }

    let b: number[];
    try { b = JSON.parse(boundsJson); } catch { return; }
    if (!Array.isArray(b) || b.length < 4) return;

    const [minX, minY, maxX, maxY] = b;
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const candidateIds = Array.from(engine.get_visible_node_ids(minX, minY, width, height)).map(Number);

    let re: RegExp | null = null;
    const regexText = (this.filter.nameRegex || '').trim();
    if (regexText) {
      try { re = new RegExp(regexText, 'i'); }
      catch {
        alert('Invalid regex pattern.');
        return;
      }
    }

    const maxDepth = this.filter.maxDepth.trim() === '' ? null : Number(this.filter.maxDepth);
    const filtered = candidateIds.filter((id) => {
      const json = engine.get_node_json(BigInt(id));
      if (!json) return false;

      let node: any;
      try { node = JSON.parse(json); } catch { return false; }

      if (this.filter.nodeKind !== 'any' && node.kind !== this.filter.nodeKind) return false;
      if (re && !re.test(String(node.name || ''))) return false;

      if (maxDepth != null && Number.isFinite(maxDepth) && maxDepth >= 0) {
        if (this.getTreeDepth(id) > maxDepth) return false;
      }

      if (this.filter.attrFilter === 'visible' && node.visible === false) return false;
      if (this.filter.attrFilter === 'hidden' && node.visible !== false) return false;
      if (this.filter.attrFilter === 'locked' && node.locked !== true) return false;
      if (this.filter.attrFilter === 'text' && node.kind !== 'Text') return false;
      if (this.filter.attrFilter === 'image' && node.kind !== 'Image') return false;
      if (this.filter.attrFilter === 'shape' && !this.isShapeNodeKind(String(node.kind || ''))) return false;

      return true;
    });

    (engine as any).set_selection?.(filtered.map(id => BigInt(id)));
    const resultEl = this.el?.querySelector('#ssp-result');
    if (resultEl) resultEl.textContent = `${filtered.length} node${filtered.length !== 1 ? 's' : ''} in filtered area`;
    this.editor.onSelectionChanged?.();
    this.editor.render();
  }

  private isShapeNodeKind(kind: string): boolean {
    return ["Rect", "Ellipse", "Path", "Star", "Polygon", "Vector", "Line"].includes(kind);
  }

  private selectSameByFilter(key: string) {
    const engine = this.editor.engine;
    if (!engine) return;
    const selected = Array.from(engine.get_selection()).map(Number);
    if (selected.length === 0) return;

    const ids = Array.from(engine.get_all_node_ids()).map(Number);
    const filtered = ids.filter((id) => {
      const json = engine.get_node_json(BigInt(id));
      if (!json) return false;
      try {
        const node = JSON.parse(json);
        switch (key) {
          case 'text': return node.kind === 'Text';
          case 'image': return node.kind === 'Image';
          case 'locked': return node.locked === true;
          case 'hidden': return node.visible === false;
          case 'shape':
          default:
            return this.isShapeNodeKind(String(node.kind || ''));
        }
      } catch {
        return false;
      }
    });

    (engine as any).set_selection?.(filtered.map(id => BigInt(id)));
    const label = key[0] ? key[0].toUpperCase() + key.slice(1) : key;
    const resultEl = this.el?.querySelector('#ssp-result');
    if (resultEl) resultEl.textContent = `${filtered.length} ${label} layer${filtered.length !== 1 ? 's' : ''} selected`;
    this.editor.onSelectionChanged?.();
    this.editor.render();
  }

  private getTreeDepth(nodeId: number): number {
    const engine = this.editor.engine as any;
    let depth = 0;
    let cur = nodeId;
    while (cur > 0 && depth < 200) {
      const parent = Number(engine.get_node_parent?.(BigInt(cur)) ?? 0);
      if (!Number.isFinite(parent) || parent <= 0 || parent === cur) break;
      depth += 1;
      cur = parent;
    }
    return depth;
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
