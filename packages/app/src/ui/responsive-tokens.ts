/**
 * Responsive Token System UI
 *
 * Manages global breakpoint presets with variable-mode mappings.
 * When a preset is activated, variable collections switch to mapped modes
 * and the canvas re-renders with updated token values.
 */

interface Preset {
  id: number;
  label: string;
  width: number;
  height?: number;
  mode_mappings: Record<string, string>; // collection_id -> mode_id (as strings from JSON)
}

interface CollectionInfo {
  id: number;
  name: string;
  modes: { id: number; name: string }[];
  active_mode_id: number;
}

let panel: HTMLDivElement | null = null;
let engine: any = null;
let onChangeCallback: (() => void) | null = null;

const DEFAULT_DEVICE_PRESETS = [
  { label: 'Mobile S', width: 320, height: 568 },
  { label: 'Mobile', width: 375, height: 812 },
  { label: 'Tablet', width: 768, height: 1024 },
  { label: 'Laptop', width: 1280, height: 800 },
  { label: 'Desktop', width: 1440, height: 900 },
  { label: 'Wide', width: 1920, height: 1080 },
];

export function openResponsiveTokensPanel(eng: any, onChange?: () => void) {
  engine = eng;
  onChangeCallback = onChange || null;
  if (panel) { closeResponsiveTokensPanel(); return; }
  render();
}

export function closeResponsiveTokensPanel() {
  if (panel) { panel.remove(); panel = null; }
}

export function isResponsiveTokensPanelOpen(): boolean {
  return panel !== null;
}

function getPresets(): Preset[] {
  try {
    return JSON.parse(engine.get_responsive_presets());
  } catch { return []; }
}

function getCollections(): CollectionInfo[] {
  try {
    return JSON.parse(engine.get_collections());
  } catch { return []; }
}

function render() {
  if (panel) panel.remove();

  const presets = getPresets();
  const collections = getCollections();
  const activePresetId = Number(engine.get_active_preset_id());

  panel = document.createElement('div');
  panel.id = 'responsive-tokens-panel';

  panel.innerHTML = `
    <style>${getStyles()}</style>
    <div class="rt-header">
      <span class="rt-title">⚡ Responsive Tokens</span>
      <div class="rt-header-actions">
        <button class="rt-btn rt-btn-add" title="Add preset from device list">+ Device</button>
        <button class="rt-btn rt-btn-custom" title="Add custom preset">+ Custom</button>
        <button class="rt-close" title="Close">✕</button>
      </div>
    </div>
    <div class="rt-body">
      ${presets.length === 0 ? `
        <div class="rt-empty">
          <p>No breakpoint presets yet.</p>
          <p class="rt-hint">Add presets to link viewport widths to variable modes.</p>
        </div>
      ` : ''}
      <div class="rt-preset-bar">
        <button class="rt-preset-chip ${activePresetId === 0 ? 'active' : ''}" data-preset="0">
          Default
        </button>
        ${presets.map(p => `
          <button class="rt-preset-chip ${p.id === activePresetId ? 'active' : ''}" data-preset="${p.id}">
            ${p.label} <span class="rt-chip-size">${p.width}</span>
          </button>
        `).join('')}
      </div>
      ${presets.map(p => `
        <div class="rt-preset-card ${p.id === activePresetId ? 'rt-active' : ''}" data-id="${p.id}">
          <div class="rt-card-header">
            <input class="rt-label-input" value="${p.label}" data-field="label" data-id="${p.id}" />
            <span class="rt-dim">×</span>
            <input class="rt-size-input" type="number" value="${p.width}" data-field="width" data-id="${p.id}" />
            ${p.height ? `<span class="rt-dim">×</span><input class="rt-size-input" type="number" value="${p.height}" data-field="height" data-id="${p.id}" />` : ''}
            <button class="rt-btn-icon rt-activate" data-id="${p.id}" title="Activate">${p.id === activePresetId ? '●' : '○'}</button>
            <button class="rt-btn-icon rt-delete" data-id="${p.id}" title="Remove">🗑</button>
          </div>
          ${collections.length > 0 ? `
            <div class="rt-mappings">
              <div class="rt-map-label">Variable Mode Mappings:</div>
              ${collections.map(col => {
                const mappedMode = p.mode_mappings[String(col.id)] || '';
                return `
                  <div class="rt-map-row">
                    <span class="rt-col-name">${col.name}</span>
                    <select class="rt-mode-select" data-preset="${p.id}" data-col="${col.id}">
                      <option value="">— default —</option>
                      ${col.modes.map(m => `<option value="${m.id}" ${String(m.id) === String(mappedMode) ? 'selected' : ''}>${m.name}</option>`).join('')}
                    </select>
                  </div>
                `;
              }).join('')}
            </div>
          ` : '<div class="rt-no-vars">No variable collections. Create some in the Variables panel first.</div>'}
        </div>
      `).join('')}
    </div>
  `;

  document.body.appendChild(panel);
  bindEvents();
}

function bindEvents() {
  if (!panel) return;

  panel.querySelector('.rt-close')!.addEventListener('click', closeResponsiveTokensPanel);

  // Add device preset
  panel.querySelector('.rt-btn-add')!.addEventListener('click', () => {
    const menu = document.createElement('div');
    menu.className = 'rt-device-menu';
    const existing = getPresets();
    const existingWidths = new Set(existing.map(p => p.width));

    menu.innerHTML = DEFAULT_DEVICE_PRESETS
      .filter(d => !existingWidths.has(d.width))
      .map(d => `<div class="rt-device-item" data-label="${d.label}" data-width="${d.width}" data-height="${d.height}">${d.label} (${d.width}×${d.height})</div>`)
      .join('');

    if (menu.children.length === 0) {
      menu.innerHTML = '<div class="rt-device-item disabled">All device presets added</div>';
    }

    const btn = panel!.querySelector('.rt-btn-add')!;
    const rect = btn.getBoundingClientRect();
    Object.assign(menu.style, { position: 'fixed', top: `${rect.bottom + 4}px`, left: `${rect.left}px` });
    document.body.appendChild(menu);

    menu.querySelectorAll('.rt-device-item:not(.disabled)').forEach(item => {
      item.addEventListener('click', () => {
        const el = item as HTMLElement;
        const id = engine.add_responsive_preset(el.dataset.label, parseFloat(el.dataset.width!), parseFloat(el.dataset.height!));
        menu.remove();
        fireChange();
        render();
      });
    });

    const dismiss = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) { menu.remove(); document.removeEventListener('click', dismiss); }
    };
    setTimeout(() => document.addEventListener('click', dismiss), 0);
  });

  // Custom preset
  panel.querySelector('.rt-btn-custom')!.addEventListener('click', () => {
    const input = prompt('Enter preset: label,width (e.g. Tablet,768)');
    if (!input) return;
    const [label, wStr] = input.split(',').map(s => s.trim());
    const w = parseInt(wStr, 10);
    if (!label || isNaN(w) || w < 100) { alert('Invalid format'); return; }
    engine.add_responsive_preset(label, w, 0);
    fireChange();
    render();
  });

  // Preset chips (quick activate)
  panel.querySelectorAll('.rt-preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const presetId = parseInt((chip as HTMLElement).dataset.preset!, 10);
      engine.activate_responsive_preset(BigInt(presetId));
      fireChange();
      render();
    });
  });

  // Activate buttons
  panel.querySelectorAll('.rt-activate').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt((btn as HTMLElement).dataset.id!, 10);
      engine.activate_responsive_preset(BigInt(id));
      fireChange();
      render();
    });
  });

  // Delete buttons
  panel.querySelectorAll('.rt-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt((btn as HTMLElement).dataset.id!, 10);
      engine.remove_responsive_preset(BigInt(id));
      fireChange();
      render();
    });
  });

  // Label/size input changes
  panel.querySelectorAll('.rt-label-input, .rt-size-input').forEach(input => {
    input.addEventListener('change', () => {
      const el = input as HTMLInputElement;
      const id = parseInt(el.dataset.id!, 10);
      const field = el.dataset.field!;
      const label = field === 'label' ? el.value : '';
      const width = field === 'width' ? parseFloat(el.value) : 0;
      const height = field === 'height' ? parseFloat(el.value) : 0;
      engine.update_responsive_preset(BigInt(id), label, width, height);
      fireChange();
    });
  });

  // Mode mapping selects
  panel.querySelectorAll('.rt-mode-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const el = sel as HTMLSelectElement;
      const presetId = parseInt(el.dataset.preset!, 10);
      const colId = parseInt(el.dataset.col!, 10);
      const modeId = el.value;

      if (modeId === '') {
        engine.remove_preset_mode_mapping(BigInt(presetId), BigInt(colId));
      } else {
        engine.set_preset_mode_mapping(BigInt(presetId), BigInt(colId), BigInt(parseInt(modeId, 10)));
      }

      // If this preset is active, re-activate to apply changes
      const activeId = Number(engine.get_active_preset_id());
      if (activeId === presetId) {
        engine.activate_responsive_preset(BigInt(presetId));
      }
      fireChange();
    });
  });
}

function fireChange() {
  if (onChangeCallback) onChangeCallback();
}

function getStyles(): string {
  return `
    #responsive-tokens-panel {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 520px;
      max-height: 80vh;
      background: #1e1e2e;
      border: 1px solid #333;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      z-index: 90000;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #e0e0e0;
    }
    .rt-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid #333;
    }
    .rt-title {
      font-size: 14px;
      font-weight: 600;
    }
    .rt-header-actions {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .rt-btn {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      color: #e0e0e0;
      padding: 4px 10px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
    }
    .rt-btn:hover { background: rgba(255,255,255,0.15); }
    .rt-close {
      background: none;
      border: none;
      color: #888;
      font-size: 16px;
      cursor: pointer;
      padding: 2px 6px;
    }
    .rt-close:hover { color: #fff; }
    .rt-body {
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px;
    }
    .rt-empty {
      text-align: center;
      padding: 24px;
      opacity: 0.6;
    }
    .rt-empty p { margin: 4px 0; }
    .rt-hint { font-size: 12px; }
    .rt-preset-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 12px;
    }
    .rt-preset-chip {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      color: #ccc;
      padding: 4px 12px;
      border-radius: 16px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.15s;
    }
    .rt-preset-chip:hover { background: rgba(255,255,255,0.12); }
    .rt-preset-chip.active {
      background: #4a90d9;
      border-color: #4a90d9;
      color: #fff;
    }
    .rt-chip-size {
      opacity: 0.6;
      font-size: 11px;
      margin-left: 4px;
    }
    .rt-preset-card {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 8px;
    }
    .rt-preset-card.rt-active {
      border-color: #4a90d9;
      background: rgba(74,144,217,0.08);
    }
    .rt-card-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
    }
    .rt-label-input {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      color: #e0e0e0;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 12px;
      width: 100px;
    }
    .rt-size-input {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      color: #e0e0e0;
      padding: 3px 6px;
      border-radius: 4px;
      font-size: 12px;
      width: 60px;
    }
    .rt-dim { opacity: 0.4; font-size: 12px; }
    .rt-btn-icon {
      background: none;
      border: none;
      color: #888;
      cursor: pointer;
      font-size: 14px;
      padding: 2px 4px;
    }
    .rt-btn-icon:hover { color: #fff; }
    .rt-delete:hover { color: #e74c3c !important; }
    .rt-mappings {
      margin-top: 4px;
    }
    .rt-map-label {
      font-size: 11px;
      opacity: 0.5;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .rt-map-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    .rt-col-name {
      font-size: 12px;
      opacity: 0.8;
    }
    .rt-mode-select {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      color: #e0e0e0;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 12px;
      min-width: 120px;
    }
    .rt-no-vars {
      font-size: 11px;
      opacity: 0.4;
      padding: 4px 0;
    }
    .rt-device-menu {
      background: #252540;
      border: 1px solid #444;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      z-index: 91000;
      min-width: 200px;
      overflow: hidden;
    }
    .rt-device-item {
      padding: 8px 14px;
      font-size: 13px;
      cursor: pointer;
      color: #e0e0e0;
    }
    .rt-device-item:hover { background: rgba(255,255,255,0.1); }
    .rt-device-item.disabled { opacity: 0.3; cursor: default; }
  `;
}
