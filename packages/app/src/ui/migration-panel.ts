// Migration Assistant Panel — scans scene for hardcoded styles and suggests migrations

interface MigrationSuggestion {
  node_id: number;
  node_name: string;
  property: string; // "Fill" | "Stroke" | "TextStyle"
  current_value: string;
  suggested_style_id: number | null;
  suggested_style_name: string | null;
  suggested_new_style: string | null;
}

export function createMigrationPanel(engine: any, editor: any): {
  container: HTMLDivElement;
  refresh: () => void;
} {
  const container = document.createElement('div');
  container.className = 'migration-panel';
  container.innerHTML = `
    <div style="padding:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span style="font-weight:600;font-size:13px;color:#e0e0e0;">🔄 Migration Assistant</span>
        <button id="migration-scan-btn" style="
          background:#7c3aed;color:#fff;border:none;border-radius:6px;padding:4px 12px;
          font-size:11px;cursor:pointer;font-weight:500;
        ">Scan</button>
      </div>
      <div id="migration-results" style="font-size:11px;color:#999;">
        Click "Scan" to find hardcoded styles that can be migrated to shared styles.
      </div>
    </div>
  `;

  const resultsDiv = () => container.querySelector('#migration-results') as HTMLDivElement;
  const scanBtn = () => container.querySelector('#migration-scan-btn') as HTMLButtonElement;

  function refresh() {
    try {
      const json = engine.scan_migration_suggestions();
      const suggestions: MigrationSuggestion[] = JSON.parse(json);
      renderResults(suggestions);
    } catch (e) {
      resultsDiv().innerHTML = `<div style="color:#f87171;">Error scanning: ${e}</div>`;
    }
  }

  function renderResults(suggestions: MigrationSuggestion[]) {
    const div = resultsDiv();
    if (suggestions.length === 0) {
      div.innerHTML = `<div style="color:#4ade80;padding:8px 0;">✅ No migration suggestions — all styles are clean!</div>`;
      return;
    }

    // Group: matched (has style_id) vs new (has suggested_new_style)
    const matched = suggestions.filter(s => s.suggested_style_id != null);
    const newStyles = suggestions.filter(s => s.suggested_style_id == null && s.suggested_new_style != null);

    let html = `<div style="color:#a78bfa;margin-bottom:8px;font-weight:500;">${suggestions.length} suggestions found</div>`;

    if (matched.length > 0) {
      html += `<div style="margin-bottom:8px;font-weight:500;color:#60a5fa;">Matching existing styles (${matched.length})</div>`;
      for (const s of matched) {
        const propIcon = s.property === 'Fill' ? '🎨' : s.property === 'Stroke' ? '✏️' : '📝';
        html += `
          <div class="migration-item" style="
            background:rgba(255,255,255,0.04);border-radius:6px;padding:8px;margin-bottom:4px;
            display:flex;justify-content:space-between;align-items:center;
          ">
            <div style="flex:1;min-width:0;">
              <div style="color:#e0e0e0;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${propIcon} <strong>${escHtml(s.node_name)}</strong>
              </div>
              <div style="color:#888;font-size:10px;margin-top:2px;">
                ${escHtml(s.current_value)} → <span style="color:#a78bfa;">${escHtml(s.suggested_style_name || '')}</span>
              </div>
            </div>
            <button data-action="apply" data-node="${s.node_id}" data-style="${s.suggested_style_id}" data-prop="${s.property}"
              style="background:#7c3aed;color:#fff;border:none;border-radius:4px;padding:2px 8px;font-size:10px;cursor:pointer;margin-left:6px;white-space:nowrap;">
              Apply
            </button>
          </div>
        `;
      }
    }

    if (newStyles.length > 0) {
      // Deduplicate by suggested_new_style
      const grouped: Map<string, MigrationSuggestion[]> = new Map();
      for (const s of newStyles) {
        const key = `${s.property}:${s.suggested_new_style}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(s);
      }

      html += `<div style="margin-top:12px;margin-bottom:8px;font-weight:500;color:#fbbf24;">Suggested new styles (${grouped.size})</div>`;
      for (const [key, items] of grouped) {
        const first = items[0];
        const propIcon = first.property === 'Fill' ? '🎨' : first.property === 'Stroke' ? '✏️' : '📝';
        html += `
          <div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:8px;margin-bottom:4px;">
            <div style="color:#fbbf24;font-size:11px;font-weight:500;">
              ${propIcon} "${escHtml(first.suggested_new_style || '')}" <span style="color:#888;font-weight:400;">(${items.length} nodes)</span>
            </div>
            <div style="color:#888;font-size:10px;margin-top:2px;">
              ${escHtml(first.current_value)}
            </div>
            <div style="margin-top:4px;">
              <button data-action="create-style" data-nodes="${items.map(i => i.node_id).join(',')}" data-name="${escAttr(first.suggested_new_style || '')}" data-prop="${first.property}" data-value="${escAttr(first.current_value)}"
                style="background:#d97706;color:#fff;border:none;border-radius:4px;padding:2px 8px;font-size:10px;cursor:pointer;">
                Create & Apply
              </button>
            </div>
          </div>
        `;
      }
    }

    // Apply all matched button
    if (matched.length > 0) {
      html += `
        <div style="margin-top:12px;text-align:center;">
          <button id="migration-apply-all" style="
            background:#7c3aed;color:#fff;border:none;border-radius:6px;padding:6px 16px;
            font-size:11px;cursor:pointer;font-weight:500;
          ">Apply All Matched (${matched.length})</button>
        </div>
      `;
    }

    div.innerHTML = html;

    // Event delegation
    div.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button') as HTMLButtonElement;
      if (!btn) return;

      const action = btn.dataset.action;
      if (action === 'apply') {
        const nodeId = Number(btn.dataset.node);
        const styleId = Number(btn.dataset.style);
        const prop = btn.dataset.prop || 'Fill';
        try {
          engine.apply_migration_suggestion(BigInt(nodeId), BigInt(styleId), prop);
          btn.textContent = '✓';
          btn.disabled = true;
          btn.style.background = '#059669';
        } catch (err) {
          console.error('Migration apply error:', err);
        }
      } else if (action === 'create-style') {
        const name = btn.dataset.name || 'New Style';
        const prop = btn.dataset.prop || 'Fill';
        const nodeIds = (btn.dataset.nodes || '').split(',').map(Number);
        const value = btn.dataset.value || '';

        try {
          if (prop === 'TextStyle') {
            // Create text style from first node
            if (nodeIds.length > 0) {
              const styleId = engine.migration_create_and_apply_text(BigInt(nodeIds[0]), name);
              // Apply to remaining nodes
              for (let i = 1; i < nodeIds.length; i++) {
                engine.apply_migration_suggestion(BigInt(nodeIds[i]), styleId, prop);
              }
            }
          } else {
            // Parse color from value (hex format like #rrggbb)
            const rgba = parseColorValue(value);
            if (rgba && nodeIds.length > 0) {
              const styleId = engine.migration_create_and_apply_color(
                BigInt(nodeIds[0]), name, rgba.r, rgba.g, rgba.b, rgba.a
              );
              for (let i = 1; i < nodeIds.length; i++) {
                engine.apply_migration_suggestion(BigInt(nodeIds[i]), styleId, prop);
              }
            }
          }
          btn.textContent = '✓ Created';
          btn.disabled = true;
          btn.style.background = '#059669';
        } catch (err) {
          console.error('Migration create error:', err);
        }
      }

      if (btn.id === 'migration-apply-all') {
        const applyBtns = div.querySelectorAll('button[data-action="apply"]') as NodeListOf<HTMLButtonElement>;
        applyBtns.forEach(b => b.click());
        btn.textContent = '✓ All Applied';
        btn.disabled = true;
        btn.style.background = '#059669';
      }
    });
  }

  // Attach scan button
  setTimeout(() => {
    const btn = scanBtn();
    if (btn) btn.addEventListener('click', refresh);
  }, 0);

  return { container, refresh };
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function parseColorValue(val: string): { r: number; g: number; b: number; a: number } | null {
  // Try hex: #rrggbb
  const hexMatch = val.match(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  if (hexMatch) {
    return {
      r: parseInt(hexMatch[1], 16),
      g: parseInt(hexMatch[2], 16),
      b: parseInt(hexMatch[3], 16),
      a: 1.0,
    };
  }
  // Try rgba(r,g,b,a)
  const rgbaMatch = val.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    return {
      r: parseInt(rgbaMatch[1]),
      g: parseInt(rgbaMatch[2]),
      b: parseInt(rgbaMatch[3]),
      a: rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1.0,
    };
  }
  return null;
}
